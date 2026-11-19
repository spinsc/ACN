-- Excluir uma formação de preços (pedido do usuário em 17/11/2026): com motivo obrigatório.
-- Decidido com o usuário:
--   * a formação NÃO é apagada: fica no banco marcada como excluída (quem, quando, motivo, escopo e o que foi desligado) e some de todas as telas;
--   * a pessoa escolhe na hora se exclui SÓ A VERSÃO aberta ou a FORMAÇÃO INTEIRA (todas as versões);
--   * quem pode: Admin, gerentes ("Gerente ...") e quem criou (a versão, ou a v1 quando é a formação inteira); o banco confere, a tela não é confiada;
--   * barra só o que já virou compromisso: OP ligada, aprovada na aprovação de cotações ou ligada a uma ordem de compra do Compras.
--     Card do CRM/licitação e proposta salva não barram (a janela avisa o que sai junto).
-- Como some de todas as telas: política RESTRITIVA em cotacoes_precos (como oples_nao_excluidas, da exclusão de OP). Os vínculos com cards ficam guardados,
-- mas escondidos pela marca `cotacao_excluida` (política restritiva barata, sem consulta por linha): assim o contador "formações vinculadas" do card do CRM
-- e da licitação não conta a formação excluída. A solicitação de aprovação de desconto ainda PENDENTE é rejeitada sozinha (senão ficaria na fila da direção
-- apontando para uma formação que não abre mais). Propostas salvas, histórico e as demais solicitações ficam como estão.
-- A exclusão e a leitura das excluídas passam só pelas funções abaixo, que conferem o perfil no banco. Quem registra o autor usa o auth.uid() real e diz
-- "(vendo como X)" no "Ver como" (mesmo padrão do op_excluir). Número da cotação (COT-AAAA-NNNN) e número de versão de uma versão excluída NÃO são reaproveitados
-- pelo número da cotação; o número da próxima versão sai do maior número ainda visível (pode repetir o de uma versão excluída, que continua escondida).

alter table public.cotacoes_precos
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por text,
  add column if not exists excluida_motivo text,
  add column if not exists excluida_escopo text,
  add column if not exists excluida_desligado jsonb;

comment on column public.cotacoes_precos.excluida_em is 'Preenchida = formação (ou versão) excluída com motivo (função formacao_excluir). A linha fica guardada e some das telas (política cotacoes_precos_nao_excluidas).';

alter table public.cotacoes_precos_vinculos
  add column if not exists cotacao_excluida boolean not null default false;

comment on column public.cotacoes_precos_vinculos.cotacao_excluida is 'Verdadeiro = a formação deste vínculo foi excluída: o vínculo fica guardado e escondido (política cotacoes_precos_vinculos_da_excluida).';

drop policy if exists cotacoes_precos_nao_excluidas on public.cotacoes_precos;
create policy cotacoes_precos_nao_excluidas on public.cotacoes_precos as restrictive for all to authenticated
  using (excluida_em is null) with check (excluida_em is null);

drop policy if exists cotacoes_precos_vinculos_da_excluida on public.cotacoes_precos_vinculos;
create policy cotacoes_precos_vinculos_da_excluida on public.cotacoes_precos_vinculos as restrictive for all to authenticated
  using (not cotacao_excluida) with check (not cotacao_excluida);

-- O que impede a exclusão, o que será desligado sozinho e o que fica como está. Não grava nada.
-- p_escopo: 'versao' (só esta) ou 'formacao' (todas as versões). 'versao' numa formação de uma versão só vale como 'formacao'.
create or replace function public.formacao_excluir_conferir(p_id uuid, p_escopo text default 'formacao')
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  c record; raiz uuid; n_versoes int; escopo text; ids uuid[]; ids_txt text[]; versoes text;
  bloq text[] := '{}'; desl text[] := '{}'; avis text[] := '{}'; n int; n2 int; lista text;
begin
  if p_escopo is null or p_escopo not in ('versao', 'formacao') then
    return jsonb_build_object('erro', 'Escolha se a exclusão é só da versão ou da formação inteira.');
  end if;
  select * into c from public.cotacoes_precos where id = p_id and excluida_em is null;
  if not found then return jsonb_build_object('erro', 'Formação não encontrada (pode já ter sido excluída).'); end if;
  raiz := coalesce(c.versao_raiz_id, c.id);
  select count(*) into n_versoes from public.cotacoes_precos where (id = raiz or versao_raiz_id = raiz) and excluida_em is null;
  escopo := case when p_escopo = 'versao' and n_versoes > 1 then 'versao' else 'formacao' end;
  if escopo = 'versao' then
    ids := array[c.id];
  else
    ids := array(select id from public.cotacoes_precos where (id = raiz or versao_raiz_id = raiz) and excluida_em is null);
  end if;
  ids_txt := array(select x::text from unnest(ids) x);
  select string_agg('v' || coalesce(versao, 1), ', ' order by coalesce(versao, 1)) into versoes from public.cotacoes_precos where id = any(ids);

  -- ── o que BARRA ──
  if escopo = 'versao' and c.versao_raiz_id is null then
    bloq := bloq || format('A v%s é a primeira versão (a raiz) e a formação ainda tem outra(s) %s versão(ões). Exclua as outras antes, ou exclua a formação inteira.', coalesce(c.versao, 1), n_versoes - 1);
  end if;
  select count(*), string_agg(distinct coalesce(opl_numero, 'sem número'), ', ') into n, lista from public.cotacoes_precos
   where id = any(ids) and (opl_id is not null or opl_numero is not null);
  if n > 0 then bloq := bloq || format('Ligada à OP %s. Desligue a OP na formação antes.', lista); end if;
  select count(*) into n from public.cotacoes_precos where id = any(ids) and status = 'aprovada';
  select count(*) into n2 from public.cotacoes_aprovacoes where cotacao_id = any(ids) and status = 'aprovado';
  if n + n2 > 0 then bloq := bloq || 'Já aprovada na aprovação de cotações (desconto aprovado pela direção).'::text; end if;
  if escopo = 'formacao' then
    select count(*), string_agg(coalesce(p.numero_oc, p.numero_pedido, l.pedido_id::text), ', ') into n, lista
      from public.cotacoes_precos_ordens_compra l left join public.pcp_pedidos_compra p on p.id = l.pedido_id where l.raiz_id = raiz;
    if n > 0 then bloq := bloq || format('%s ordem(ns) de compra do Compras ligada(s): %s. Desligue-as na formação antes.', n, lista); end if;
  end if;

  -- ── o que será DESLIGADO sozinho ──
  select count(*) into n from public.cotacoes_aprovacoes where cotacao_id = any(ids) and status = 'pendente';
  if n > 0 then desl := desl || format('%s solicitação(ões) de aprovação de desconto pendente(s) rejeitada(s) sozinha(s)', n); end if;
  select count(*) into n from (select distinct tipo, processo_id from public.cotacoes_precos_vinculos where cotacao_id = any(ids)) v;
  if n > 0 then desl := desl || format('some de %s card(s) do CRM ou licitação a que estava ligada', n); end if;

  -- ── o que FICA como está (só avisa) ──
  select count(*) into n from public.cotacoes_propostas where cotacao_id = any(ids);
  if n > 0 then avis := avis || format('%s proposta(s) salva(s) ficam guardadas com a formação e deixam de aparecer', n); end if;
  if escopo = 'versao' and c.vencedora then avis := avis || 'esta é a versão vencedora: a formação fica sem vencedora marcada'::text; end if;
  select count(*) into n from public.demandas_avulsas d
   where jsonb_typeof(d.vinculos) = 'array'
     and exists (select 1 from jsonb_array_elements(d.vinculos) e where e->>'tipo' = 'formacao' and (e->>'id') = any(ids_txt));
  if n > 0 then avis := avis || format('%s demanda(s) geral(is) citam esta formação: o vínculo continua escrito, mas ela deixa de abrir', n); end if;

  return jsonb_build_object('id', c.id, 'nome', c.nome, 'versao', coalesce(c.versao, 1), 'n_versoes', n_versoes, 'escopo', escopo, 'versoes', versoes,
    'raiz_id', raiz, 'criado_por', c.criado_por, 'bloqueios', to_jsonb(bloq), 'desligados', to_jsonb(desl), 'avisos', to_jsonb(avis));
end $$;

-- Exclui (esconde) a versão ou a formação. Confere perfil/autor, motivo, trava de edição e bloqueios no banco; tudo ou nada.
create or replace function public.formacao_excluir(p_id uuid, p_escopo text, p_motivo text, p_atualizado_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  u record; c record; r jsonb; ids uuid[]; raiz uuid; escopo text; v_autor text; v_real text; eh_dir boolean; autor_ok boolean;
  v_motivo text := btrim(coalesce(p_motivo, '')); alvo record;
begin
  select a.id, a.nome, a.email, a.perfil into u from public.auth_usuarios a where a.auth_id = public.uid_efetivo() and coalesce(a.ativo, false) limit 1;
  if not found then raise exception 'Só quem entrou no sistema pode excluir uma formação.' using errcode = '42501'; end if;
  eh_dir := (u.perfil = 'Admin' or u.perfil ilike 'gerente%');
  v_autor := u.nome;
  if auth.uid() is distinct from public.uid_efetivo() then
    select a.nome into v_real from public.auth_usuarios a where a.auth_id = auth.uid() limit 1;
    v_autor := coalesce(v_real, 'Admin') || ' (vendo como ' || u.nome || ')';
  end if;
  if length(v_motivo) < 5 then raise exception 'Informe o motivo da exclusão (pelo menos 5 letras).'; end if;

  select * into c from public.cotacoes_precos where id = p_id and excluida_em is null for update;
  if not found then raise exception 'Formação não encontrada (pode já ter sido excluída). Atualize a tela.'; end if;
  if p_atualizado_em is not null and c.atualizado_em is distinct from p_atualizado_em then
    raise exception 'A formação foi alterada por outra pessoa enquanto a janela estava aberta. Atualize a tela e confira antes de excluir.';
  end if;

  r := public.formacao_excluir_conferir(p_id, p_escopo);
  if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;
  escopo := r->>'escopo';
  raiz := (r->>'raiz_id')::uuid;

  -- quem criou: a versão, quando é só ela; a v1 (a raiz), quando é a formação inteira
  if not eh_dir then
    select * into alvo from public.cotacoes_precos where id = case when escopo = 'versao' then p_id else raiz end;
    autor_ok := btrim(coalesce(alvo.criado_por, '')) <> ''
      and lower(btrim(alvo.criado_por)) in (lower(btrim(coalesce(u.nome, ''))), lower(btrim(coalesce(u.email, ''))));
    if not autor_ok then raise exception 'Só Admin, gerentes ou quem criou a formação podem excluí-la.' using errcode = '42501'; end if;
  end if;

  if jsonb_array_length(r->'bloqueios') > 0 then
    raise exception 'Esta formação não pode ser excluída: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(r->'bloqueios') x);
  end if;

  ids := array(select id from public.cotacoes_precos
                where excluida_em is null and ((escopo = 'versao' and id = p_id) or (escopo = 'formacao' and (id = raiz or versao_raiz_id = raiz))));
  perform 1 from public.cotacoes_precos where id = any(ids) for update;

  update public.cotacoes_aprovacoes set status = 'rejeitado', aprovado_por = u.email, aprovado_em = now(),
         resposta = 'Rejeitada sozinha: a formação foi excluída por ' || v_autor || ' — ' || v_motivo
   where cotacao_id = any(ids) and status = 'pendente';
  update public.cotacoes_precos_vinculos set cotacao_excluida = true where cotacao_id = any(ids);
  insert into public.cotacoes_precos_log (cotacao_id, tipo, descricao, usuario_id, usuario_nome)
  select x.id, 'excluida', 'Formação excluída por ' || v_autor || ' (' || case when escopo = 'versao' then 'só a v' || coalesce(x.versao, 1) else 'formação inteira' end || '). Motivo: ' || v_motivo, u.id, v_autor
    from public.cotacoes_precos x where x.id = any(ids);
  update public.cotacoes_precos set excluida_em = now(), excluida_por = v_autor, excluida_motivo = v_motivo, excluida_escopo = escopo,
         excluida_desligado = jsonb_build_object('desligados', r->'desligados', 'avisos', r->'avisos', 'versoes', r->'versoes')
   where id = any(ids);
  return r || jsonb_build_object('ids', to_jsonb(ids));
end $$;

-- As formações excluídas, só para leitura de Admin e gerentes (sem os itens e os parâmetros: é para conferir quem excluiu, quando e por quê).
create or replace function public.formacoes_excluidas()
returns table (id uuid, numero_cotacao text, nome text, tipo text, empresa text, versao int, versao_raiz_id uuid, criado_por text, criado_em timestamptz,
               n_itens int, excluida_em timestamptz, excluida_por text, excluida_motivo text, excluida_escopo text, excluida_desligado jsonb)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare perfil text;
begin
  select a.perfil into perfil from public.auth_usuarios a where a.auth_id = public.uid_efetivo() and coalesce(a.ativo, false) limit 1;
  if perfil is null or not (perfil = 'Admin' or perfil ilike 'gerente%') then return; end if;
  return query
    select c.id, c.numero_cotacao, c.nome, c.tipo, c.empresa, c.versao, c.versao_raiz_id, c.criado_por, c.criado_em,
           case when jsonb_typeof(c.itens) = 'array' then jsonb_array_length(c.itens) else 0 end,
           c.excluida_em, c.excluida_por, c.excluida_motivo, c.excluida_escopo, c.excluida_desligado
      from public.cotacoes_precos c where c.excluida_em is not null order by c.excluida_em desc, c.versao desc;
end $$;

revoke all on function public.formacao_excluir_conferir(uuid, text) from public, anon;
revoke all on function public.formacao_excluir(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.formacoes_excluidas() from public, anon;
grant execute on function public.formacao_excluir_conferir(uuid, text) to authenticated;
grant execute on function public.formacao_excluir(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.formacoes_excluidas() to authenticated;
