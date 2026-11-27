-- Regras fiscais versionadas (módulo fiscal, Etapa 3, 27/11/2026): a tabela que, no futuro, vai dizer ao emissor qual CFOP, CST e alíquota usar em cada situação.
-- DECIDIDO COM O USUÁRIO em 27/11/2026: (1) a versão aprovada fica CONGELADA e qualquer mudança vira uma versão nova; (2) aprovam Admin e gerentes, e quem editou por último NÃO aprova
-- a própria versão (o Admin pode, e a aprovação guarda que foi o próprio editor); (3) nasce VAZIA: o que a contabilidade não respondeu não vira regra por suposição.
-- Nada aqui emite nota nem muda tabela que já existia: são DUAS TABELAS NOVAS, gatilhos e funções delas. Nenhuma regra é gravada por esta migração.
-- Quem grava: as REGRAS (rascunho) por quem tem a aba Fiscal, direto na tabela (o gatilho barra versão congelada e registra o autor); as VERSÕES só pelas funções abaixo.
-- Para desfazer: fiscal_regras_reverter.sql (só use se ninguém gravou regra).

set local lock_timeout = '3s';

create table if not exists public.fiscal_regras_versoes (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity,          -- "Versão 1", "Versão 2"...
  titulo text not null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'aprovada', 'substituida')),   -- aprovada = a vigente (só pode haver uma)
  baseada_em uuid references public.fiscal_regras_versoes(id) on delete set null,
  criada_em timestamptz not null default now(),
  criada_por_id uuid,                                    -- auth_usuarios.id (pessoa é o ID)
  ultimo_editor_id uuid,                                 -- quem mexeu por último nas regras (o gatilho preenche; a aprovação confere)
  atualizada_em timestamptz not null default now(),
  aprovada_em timestamptz,
  aprovada_por_id uuid,
  aprovada_pelo_proprio_editor boolean,                  -- o Admin pode aprovar o que ele mesmo editou; fica registrado
  nota_aprovacao text,
  substituida_em timestamptz,
  substituida_por uuid references public.fiscal_regras_versoes(id) on delete set null
);
create unique index if not exists fiscal_regras_versoes_uma_vigente on public.fiscal_regras_versoes ((true)) where situacao = 'aprovada';
create unique index if not exists fiscal_regras_versoes_um_rascunho on public.fiscal_regras_versoes ((true)) where situacao = 'rascunho';

create table if not exists public.fiscal_regras (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.fiscal_regras_versoes(id) on delete cascade,
  rotulo text not null,                                  -- o nome que a pessoa dá: "Venda de mercadoria dentro de SC"
  -- Condições: vazio = "qualquer". Regra com mais condições vale mais que regra com menos (quando uma contém a outra).
  emitente text references public.fiscal_emitentes(codigo) on update cascade,
  tipo_operacao text,                                    -- o id do mapa de origens (FiscalTiposDeNota.ts), validado na tela
  destino text check (destino in ('dentro_uf', 'fora_uf', 'exterior')),   -- em relação à UF da empresa que emite
  tipo_orgao text check (tipo_orgao in ('nenhum', 'estadual_sc', 'estadual_outro', 'municipal', 'federal')),
  indicador_ie text check (indicador_ie in ('contribuinte', 'isento', 'nao_contribuinte')),
  ncm_prefixo text check (ncm_prefixo ~ '^[0-9]{2,8}$'),
  origem_fiscal smallint check (origem_fiscal between 0 and 8),
  monofasico boolean,
  -- Resultado
  cfop text not null check (cfop ~ '^[0-9]{4}$'),
  cst_csosn text not null check (cst_csosn ~ '^[0-9]{2,3}$'),
  aliquota_icms_pct numeric(5, 2) check (aliquota_icms_pct between 0 and 100),
  cbenef text check (cbenef ~ '^[A-Za-z0-9]{8,10}$'),
  informacao_complementar text,
  exige_nota_referenciada boolean not null default false, -- devolução: a nota de origem é obrigatória
  -- Origem da regra: só vale para emitir quando a contabilidade confirmou e disse onde está escrito
  confirmada boolean not null default false,
  fonte text,
  observacao text,
  criada_em timestamptz not null default now(),
  criada_por_id uuid,
  atualizada_em timestamptz not null default now(),
  atualizado_por_id uuid
);
create index if not exists fiscal_regras_versao_idx on public.fiscal_regras (versao_id);
-- Duas regras com as MESMAS condições na mesma versão seriam um conflito escondido
create unique index if not exists fiscal_regras_condicoes_uk on public.fiscal_regras
  (versao_id, coalesce(emitente, ''), coalesce(tipo_operacao, ''), coalesce(destino, ''), coalesce(tipo_orgao, ''), coalesce(indicador_ie, ''),
   coalesce(ncm_prefixo, ''), coalesce(origem_fiscal::text, ''), coalesce(monofasico::text, ''));

-- ── Guardas (gatilhos de dono: rodam sem o direito de quem grava) ──
create or replace function public.fiscal_regras_guarda() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_id uuid := coalesce(new.versao_id, old.versao_id); v record; eu uuid := public.usuario_atual_id();
begin
  select situacao, numero into v from public.fiscal_regras_versoes where id = v_id;
  if found and v.situacao <> 'rascunho' then
    raise exception 'A versão % das regras já foi aprovada e está congelada. Crie uma versão nova a partir dela para mudar.', v.numero using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.versao_id is distinct from old.versao_id then raise exception 'A regra não muda de versão.'; end if;
  if tg_op <> 'DELETE' then
    new.atualizado_por_id := eu; new.atualizada_em := now();
    if tg_op = 'INSERT' and new.criada_por_id is null then new.criada_por_id := eu; end if;
  end if;
  if found then update public.fiscal_regras_versoes set ultimo_editor_id = eu, atualizada_em = now() where id = v_id; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.fiscal_regras_guarda() from public, anon, authenticated;
drop trigger if exists fiscal_regras_guarda_t on public.fiscal_regras;
create trigger fiscal_regras_guarda_t before insert or update or delete on public.fiscal_regras for each row execute function public.fiscal_regras_guarda();

create or replace function public.fiscal_regras_versoes_guarda() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if tg_op = 'DELETE' then
    if old.situacao <> 'rascunho' then raise exception 'Só se descarta uma versão em rascunho; a aprovada fica guardada.' using errcode = '42501'; end if;
    return old;
  end if;
  if old.situacao <> 'rascunho' and not (old.situacao = 'aprovada' and new.situacao = 'substituida') then
    raise exception 'A versão % das regras está congelada.', old.numero using errcode = '42501';
  end if;
  if new.situacao = 'substituida' and old.situacao <> 'aprovada' then raise exception 'Só uma versão aprovada passa a substituída.'; end if;
  return new;
end $$;
revoke all on function public.fiscal_regras_versoes_guarda() from public, anon, authenticated;
drop trigger if exists fiscal_regras_versoes_guarda_t on public.fiscal_regras_versoes;
create trigger fiscal_regras_versoes_guarda_t before update or delete on public.fiscal_regras_versoes for each row execute function public.fiscal_regras_versoes_guarda();

-- ── Acesso ──
alter table public.fiscal_regras_versoes enable row level security;
alter table public.fiscal_regras enable row level security;
revoke all on public.fiscal_regras_versoes, public.fiscal_regras from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.fiscal_regras_versoes from authenticated;   -- versão só se mexe pelas funções
drop policy if exists etapa17_le on public.fiscal_regras_versoes;
create policy etapa17_le on public.fiscal_regras_versoes for select to authenticated using ((select public.esta_logado()));
drop policy if exists etapa17_le on public.fiscal_regras;
create policy etapa17_le on public.fiscal_regras for select to authenticated using ((select public.esta_logado()));
drop policy if exists etapa17_grava_aba_i on public.fiscal_regras;
create policy etapa17_grava_aba_i on public.fiscal_regras for insert to authenticated with check ((select public.tem_alguma_aba(array['fiscal'])));
drop policy if exists etapa17_grava_aba_u on public.fiscal_regras;
create policy etapa17_grava_aba_u on public.fiscal_regras for update to authenticated using ((select public.tem_alguma_aba(array['fiscal']))) with check ((select public.tem_alguma_aba(array['fiscal'])));
drop policy if exists etapa17_grava_aba_d on public.fiscal_regras;
create policy etapa17_grava_aba_d on public.fiscal_regras for delete to authenticated using ((select public.tem_alguma_aba(array['fiscal'])));

-- ── Conflitos: duas regras que valem ao mesmo tempo e nenhuma é mais específica que a outra (a mesma conta de FiscalMotor.ts) ──
create or replace function public.fiscal_regras_conflitos(p_versao uuid)
returns table(a_id uuid, b_id uuid, a_rotulo text, b_rotulo text) language sql stable set search_path to 'public', 'pg_temp' as $$
  select a.id, b.id, a.rotulo, b.rotulo
    from public.fiscal_regras a join public.fiscal_regras b on b.versao_id = a.versao_id and a.id < b.id
   where a.versao_id = p_versao
     -- as duas podem valer juntas: em cada condição, uma delas é "qualquer" ou as duas dizem o mesmo
     and (a.emitente is null or b.emitente is null or a.emitente = b.emitente)
     and (a.tipo_operacao is null or b.tipo_operacao is null or a.tipo_operacao = b.tipo_operacao)
     and (a.destino is null or b.destino is null or a.destino = b.destino)
     and (a.tipo_orgao is null or b.tipo_orgao is null or a.tipo_orgao = b.tipo_orgao)
     and (a.indicador_ie is null or b.indicador_ie is null or a.indicador_ie = b.indicador_ie)
     and (a.origem_fiscal is null or b.origem_fiscal is null or a.origem_fiscal = b.origem_fiscal)
     and (a.monofasico is null or b.monofasico is null or a.monofasico = b.monofasico)
     and (a.ncm_prefixo is null or b.ncm_prefixo is null or a.ncm_prefixo like b.ncm_prefixo || '%' or b.ncm_prefixo like a.ncm_prefixo || '%')
     -- nenhuma contém a outra (se uma contém a outra, a mais específica ganha)
     -- (coalesce: campo vazio de um lado e preenchido do outro daria "nulo", e nulo faria a linha sumir sem ser conflito nem ser contida)
     and not coalesce((b.emitente is null or a.emitente = b.emitente) and (b.tipo_operacao is null or a.tipo_operacao = b.tipo_operacao) and (b.destino is null or a.destino = b.destino)
              and (b.tipo_orgao is null or a.tipo_orgao = b.tipo_orgao) and (b.indicador_ie is null or a.indicador_ie = b.indicador_ie)
              and (b.origem_fiscal is null or a.origem_fiscal = b.origem_fiscal) and (b.monofasico is null or a.monofasico = b.monofasico)
              and (b.ncm_prefixo is null or a.ncm_prefixo like b.ncm_prefixo || '%'), false)
     and not coalesce((a.emitente is null or b.emitente = a.emitente) and (a.tipo_operacao is null or b.tipo_operacao = a.tipo_operacao) and (a.destino is null or b.destino = a.destino)
              and (a.tipo_orgao is null or b.tipo_orgao = a.tipo_orgao) and (a.indicador_ie is null or b.indicador_ie = a.indicador_ie)
              and (a.origem_fiscal is null or b.origem_fiscal = a.origem_fiscal) and (a.monofasico is null or b.monofasico = a.monofasico)
              and (a.ncm_prefixo is null or b.ncm_prefixo like a.ncm_prefixo || '%'), false)
     -- e dão resultados diferentes (resultado igual não faz mal)
     and (a.cfop, a.cst_csosn, a.aliquota_icms_pct, a.cbenef, coalesce(a.informacao_complementar, ''), a.exige_nota_referenciada)
         is distinct from (b.cfop, b.cst_csosn, b.aliquota_icms_pct, b.cbenef, coalesce(b.informacao_complementar, ''), b.exige_nota_referenciada);
$$;
revoke all on function public.fiscal_regras_conflitos(uuid) from public, anon;
grant execute on function public.fiscal_regras_conflitos(uuid) to authenticated;

-- ── Nova versão: cópia da vigente (ou de outra versão, ou vazia). Só um rascunho por vez. ──
create or replace function public.fiscal_regras_nova_versao(p_base uuid default null, p_titulo text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare eu uuid := public.usuario_atual_id(); base_id uuid := p_base; novo uuid; n int; r record;
begin
  if not (select public.tem_alguma_aba(array['fiscal'])) then raise exception 'Só quem tem a aba Fiscal cria uma versão das regras.' using errcode = '42501'; end if;
  select numero into n from public.fiscal_regras_versoes where situacao = 'rascunho';
  if found then raise exception 'Já existe um rascunho (versão %): continue nele ou descarte-o antes de abrir outro.', n; end if;
  if base_id is null then select id into base_id from public.fiscal_regras_versoes where situacao = 'aprovada'; end if;
  if base_id is not null and not exists (select 1 from public.fiscal_regras_versoes where id = base_id) then raise exception 'A versão de partida não existe mais. Atualize a tela.'; end if;
  insert into public.fiscal_regras_versoes (titulo, baseada_em, criada_por_id, ultimo_editor_id)
  values ('x', base_id, eu, eu) returning id, numero into novo, n;
  update public.fiscal_regras_versoes set titulo = coalesce(nullif(btrim(p_titulo), ''), 'Versão ' || n || ' (rascunho)') where id = novo;
  if base_id is not null then
    for r in select * from public.fiscal_regras where versao_id = base_id order by criada_em loop
      insert into public.fiscal_regras (versao_id, rotulo, emitente, tipo_operacao, destino, tipo_orgao, indicador_ie, ncm_prefixo, origem_fiscal, monofasico, cfop, cst_csosn,
        aliquota_icms_pct, cbenef, informacao_complementar, exige_nota_referenciada, confirmada, fonte, observacao)
      values (novo, r.rotulo, r.emitente, r.tipo_operacao, r.destino, r.tipo_orgao, r.indicador_ie, r.ncm_prefixo, r.origem_fiscal, r.monofasico, r.cfop, r.cst_csosn,
        r.aliquota_icms_pct, r.cbenef, r.informacao_complementar, r.exige_nota_referenciada, r.confirmada, r.fonte, r.observacao);
    end loop;
  end if;
  return novo;
end $$;
revoke all on function public.fiscal_regras_nova_versao(uuid, text) from public, anon;
grant execute on function public.fiscal_regras_nova_versao(uuid, text) to authenticated;

-- ── Descartar um rascunho (a versão aprovada nunca se apaga) ──
create or replace function public.fiscal_regras_descartar(p_versao uuid) returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v record;
begin
  if not (select public.tem_alguma_aba(array['fiscal'])) then raise exception 'Só quem tem a aba Fiscal descarta um rascunho.' using errcode = '42501'; end if;
  select * into v from public.fiscal_regras_versoes where id = p_versao for update;
  if not found then raise exception 'Esta versão já não existe. Atualize a tela.'; end if;
  if v.situacao <> 'rascunho' then raise exception 'Só se descarta uma versão em rascunho.'; end if;
  delete from public.fiscal_regras_versoes where id = p_versao;
end $$;
revoke all on function public.fiscal_regras_descartar(uuid) from public, anon;
grant execute on function public.fiscal_regras_descartar(uuid) to authenticated;

-- ── Aprovar: confere quem, o que e o estado da versão; tudo ou nada ──
create or replace function public.fiscal_regras_aprovar(p_versao uuid, p_nota text) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare u record; v record; n int; propria boolean; antiga uuid;
begin
  select a.id, a.perfil into u from public.auth_usuarios a where a.auth_id = public.uid_efetivo() and coalesce(a.ativo, false) limit 1;
  if not found or not (u.perfil = 'Admin' or u.perfil ilike 'gerente%') then raise exception 'Só Admin e gerentes aprovam as regras fiscais.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_nota, ''))) < 5 then raise exception 'Escreva a nota da aprovação (o que mudou e quem conferiu; pelo menos 5 letras).'; end if;
  select * into v from public.fiscal_regras_versoes where id = p_versao for update;
  if not found then raise exception 'Esta versão já não existe. Atualize a tela.'; end if;
  if v.situacao <> 'rascunho' then raise exception 'Esta versão não está mais em rascunho (agora: %). Atualize a tela.', v.situacao; end if;
  select count(*) into n from public.fiscal_regras where versao_id = p_versao;
  if n = 0 then raise exception 'A versão não tem nenhuma regra: não há o que aprovar.'; end if;
  select count(*) into n from public.fiscal_regras where versao_id = p_versao and (not confirmada or length(btrim(coalesce(fonte, ''))) < 3);
  if n > 0 then raise exception '% regra(s) ainda não foram confirmadas pela contabilidade ou não dizem a fonte. Confirme-as ou tire-as da versão.', n; end if;
  select count(*) into n from public.fiscal_regras_conflitos(p_versao);
  if n > 0 then raise exception '% par(es) de regras se contradizem (valem juntas e nenhuma é mais específica). Resolva antes de aprovar.', n; end if;
  propria := v.ultimo_editor_id is not distinct from u.id;
  if propria and u.perfil <> 'Admin' then raise exception 'Quem editou por último não aprova a própria versão: peça a outro gerente ou ao Admin.' using errcode = '42501'; end if;
  select id into antiga from public.fiscal_regras_versoes where situacao = 'aprovada' for update;
  if antiga is not null then update public.fiscal_regras_versoes set situacao = 'substituida', substituida_em = now(), substituida_por = p_versao where id = antiga; end if;
  update public.fiscal_regras_versoes set situacao = 'aprovada', aprovada_em = now(), aprovada_por_id = u.id, aprovada_pelo_proprio_editor = propria, nota_aprovacao = btrim(p_nota), atualizada_em = now()
   where id = p_versao;
  return jsonb_build_object('numero', v.numero, 'substituiu', antiga, 'pelo_proprio_editor', propria);
end $$;
revoke all on function public.fiscal_regras_aprovar(uuid, text) from public, anon;
grant execute on function public.fiscal_regras_aprovar(uuid, text) to authenticated;
