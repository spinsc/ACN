-- Arquivo de notas emitidas (preparação do módulo fiscal, 26/11/2026): o Conferidor passa a GUARDAR os XMLs que a pessoa soltar, para o sistema ter a nota (chave, número,
-- cliente, situação, XML) ligada às OPs e para vigiar a numeração. É a base da guarda de XML por anos e da saída do Focco. Nada aqui emite nota nem muda tabela existente:
-- são CINCO TABELAS NOVAS e UMA função. O repositório é público, mas as notas moram só no banco (nunca em arquivo versionado).
--
-- Desenho:
--  * fiscal_notas            o cabeçalho de cada NF-e (sem o XML, sem dinheiro): é o que as listas leem.
--  * fiscal_notas_valores    o valor da nota (política etapa17_valores: quem não vê valores não o lê, como as outras tabelas-irmãs de dinheiro).
--  * fiscal_arquivos         o XML inteiro (nota, evento e inutilização). Só quem tem a aba Fiscal E vê valores (o XML traz os valores): por isso a lista nunca o lê.
--  * fiscal_eventos          cancelamento e carta de correção de cada nota (a chave da nota, sem ligação rígida: o evento pode chegar antes da nota).
--  * fiscal_inutilizacoes    faixas de número inutilizadas (explicam "buraco" na numeração).
--  * fiscal_guardar(...)     a ÚNICA porta de gravação: tudo ou nada, confere a permissão, não regrava o que já estava guardado.
-- Custo do banco: só tabelas novas, nenhuma política, gatilho ou índice de tabela existente foi tocado (por isso não houve ensaio de custo).
-- Para desfazer: fiscal_arquivo_de_notas_reverter.sql (APAGA as notas guardadas: só com o OK do usuário).

set local lock_timeout = '3s';

create table if not exists public.fiscal_notas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[0-9]{44}$'),
  emitente_cnpj text not null,          -- só dígitos
  emitente_nome text,
  modelo text,                          -- 55 = NF-e
  serie integer,
  numero bigint not null,
  emissao_dia date,                     -- o dia como a nota o escreve (nunca convertido de fuso)
  destinatario_doc text,
  destinatario_nome text,
  destinatario_uf text,
  natureza text,
  fin_nfe text,                         -- 1 normal, 2 complementar, 3 ajuste, 4 devolução
  autorizada boolean,                   -- nulo = o arquivo não traz o protocolo
  cstat text,
  qtd_itens integer not null default 0,
  bloqueios integer not null default 0, -- o que a conferência achou NO DIA em que foi guardada (a janela da nota refaz a conta ao vivo)
  alertas integer not null default 0,
  regras text[] not null default '{}',
  arquivo text,                         -- nome do arquivo de onde veio
  importada_em timestamptz not null default now(),
  importada_por_id uuid                 -- auth_usuarios.id (pessoa é o ID)
);
create index if not exists fiscal_notas_serie_numero_idx on public.fiscal_notas (emitente_cnpj, serie, numero);
create index if not exists fiscal_notas_numero_idx on public.fiscal_notas (numero);
create index if not exists fiscal_notas_emissao_idx on public.fiscal_notas (emissao_dia desc);

create table if not exists public.fiscal_notas_valores (
  chave text primary key references public.fiscal_notas(chave) on delete cascade,
  valor_nf numeric(14,2)
);

create table if not exists public.fiscal_arquivos (
  ref text primary key,                 -- a chave da nota; 'ev:<chave>:<tipo>:<seq>' no evento; 'inut:<cnpj>:<serie>:<modelo>:<de>-<ate>' na inutilização
  tipo text not null check (tipo in ('nota', 'evento', 'inutilizacao')),
  xml text not null,
  tamanho integer not null,
  guardado_em timestamptz not null default now()
);

create table if not exists public.fiscal_eventos (
  id uuid primary key default gen_random_uuid(),
  chave text not null,                  -- a chave da nota a que o evento se refere
  tp_evento text not null,              -- 110111 cancelamento, 110110 carta de correção
  sequencia integer not null default 1,
  data_dia date,
  texto text,
  cstat text,
  arquivo text,
  importado_em timestamptz not null default now(),
  importado_por_id uuid,
  unique (chave, tp_evento, sequencia)
);
create index if not exists fiscal_eventos_chave_idx on public.fiscal_eventos (chave);

create table if not exists public.fiscal_inutilizacoes (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  serie integer not null,
  modelo text not null default '55',
  de bigint not null,
  ate bigint not null,
  ano text,
  cstat text,
  arquivo text,
  importada_em timestamptz not null default now(),
  importada_por_id uuid,
  check (ate >= de),
  unique (cnpj, serie, modelo, de, ate)
);

alter table public.fiscal_notas enable row level security;
alter table public.fiscal_notas_valores enable row level security;
alter table public.fiscal_arquivos enable row level security;
alter table public.fiscal_eventos enable row level security;
alter table public.fiscal_inutilizacoes enable row level security;
revoke all on public.fiscal_notas, public.fiscal_notas_valores, public.fiscal_arquivos, public.fiscal_eventos, public.fiscal_inutilizacoes from anon, public;

-- Cabeçalho, eventos e inutilizações: quem tem a aba Fiscal (e o Admin). Só a função grava de fato (a política de escrita existe para a função rodar com o poder de quem chama).
drop policy if exists etapa17_abas on public.fiscal_notas;
create policy etapa17_abas on public.fiscal_notas for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal']))) with check ((select public.tem_alguma_aba(array['fiscal'])));
drop policy if exists etapa17_abas on public.fiscal_eventos;
create policy etapa17_abas on public.fiscal_eventos for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal']))) with check ((select public.tem_alguma_aba(array['fiscal'])));
drop policy if exists etapa17_abas on public.fiscal_inutilizacoes;
create policy etapa17_abas on public.fiscal_inutilizacoes for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal']))) with check ((select public.tem_alguma_aba(array['fiscal'])));
-- Dinheiro e XML (que traz o dinheiro): também exigem "ver valores".
drop policy if exists etapa17_valores on public.fiscal_notas_valores;
create policy etapa17_valores on public.fiscal_notas_valores for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal'])) and (select public.pode_ver_valores()))
  with check ((select public.tem_alguma_aba(array['fiscal'])) and (select public.pode_ver_valores()));
drop policy if exists etapa17_abas_valores on public.fiscal_arquivos;
create policy etapa17_abas_valores on public.fiscal_arquivos for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal'])) and (select public.pode_ver_valores()))
  with check ((select public.tem_alguma_aba(array['fiscal'])) and (select public.pode_ver_valores()));

-- A porta de gravação. `p_notas`, `p_eventos` e `p_inutilizacoes` são listas JSON (cada elemento com o campo `xml`). Roda com o poder de quem chama (as políticas valem).
-- Uma nota que já estava guardada NÃO é regravada, salvo uma exceção: a que estava guardada sem protocolo (autorizada nula) e agora vem com ele.
create or replace function public.fiscal_guardar(p_notas jsonb default '[]'::jsonb, p_eventos jsonb default '[]'::jsonb, p_inutilizacoes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  e jsonb; v_ator uuid; v_aut boolean; v_achou boolean; v_n int;
  novas int := 0; atualizadas int := 0; repetidas int := 0;
  ev_novos int := 0; ev_repetidos int := 0; in_novas int := 0; in_repetidas int := 0;
begin
  if not (select public.tem_alguma_aba(array['fiscal'])) then raise exception 'Sem permissão: só quem tem a aba Fiscal guarda notas.' using errcode = '42501'; end if;
  if not (select public.pode_ver_valores()) then raise exception 'Sem permissão: quem não vê valores não guarda notas (o XML traz os valores).' using errcode = '42501'; end if;
  v_ator := public.usuario_atual_id();

  for e in select * from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) loop
    select autorizada, true into v_aut, v_achou from public.fiscal_notas where chave = e->>'chave';
    if coalesce(v_achou, false) and not (v_aut is null and (e->>'autorizada') is not null) then repetidas := repetidas + 1; continue; end if;
    if coalesce(v_achou, false) then
      update public.fiscal_notas set autorizada = nullif(e->>'autorizada', '')::boolean, cstat = e->>'cstat', bloqueios = coalesce((e->>'bloqueios')::int, 0), alertas = coalesce((e->>'alertas')::int, 0),
        regras = coalesce(array(select jsonb_array_elements_text(e->'regras')), '{}'), arquivo = e->>'arquivo', importada_em = now(), importada_por_id = v_ator
        where chave = e->>'chave';
      atualizadas := atualizadas + 1;
    else
      insert into public.fiscal_notas (chave, emitente_cnpj, emitente_nome, modelo, serie, numero, emissao_dia, destinatario_doc, destinatario_nome, destinatario_uf, natureza, fin_nfe,
        autorizada, cstat, qtd_itens, bloqueios, alertas, regras, arquivo, importada_por_id)
      values (e->>'chave', e->>'emitente_cnpj', e->>'emitente_nome', e->>'modelo', nullif(e->>'serie', '')::int, (e->>'numero')::bigint, nullif(e->>'emissao_dia', '')::date,
        e->>'destinatario_doc', e->>'destinatario_nome', e->>'destinatario_uf', e->>'natureza', e->>'fin_nfe', nullif(e->>'autorizada', '')::boolean, e->>'cstat',
        coalesce((e->>'qtd_itens')::int, 0), coalesce((e->>'bloqueios')::int, 0), coalesce((e->>'alertas')::int, 0),
        coalesce(array(select jsonb_array_elements_text(e->'regras')), '{}'), e->>'arquivo', v_ator);
      novas := novas + 1;
    end if;
    insert into public.fiscal_notas_valores (chave, valor_nf) values (e->>'chave', nullif(e->>'valor_nf', '')::numeric)
      on conflict (chave) do update set valor_nf = excluded.valor_nf;
    insert into public.fiscal_arquivos (ref, tipo, xml, tamanho) values (e->>'chave', 'nota', e->>'xml', length(e->>'xml'))
      on conflict (ref) do update set xml = excluded.xml, tamanho = excluded.tamanho, guardado_em = now();
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) loop
    insert into public.fiscal_eventos (chave, tp_evento, sequencia, data_dia, texto, cstat, arquivo, importado_por_id)
    values (e->>'chave', e->>'tp_evento', coalesce(nullif(e->>'sequencia', '')::int, 1), nullif(e->>'data_dia', '')::date, e->>'texto', e->>'cstat', e->>'arquivo', v_ator)
    on conflict (chave, tp_evento, sequencia) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then ev_repetidos := ev_repetidos + 1; continue; end if;
    ev_novos := ev_novos + 1;
    insert into public.fiscal_arquivos (ref, tipo, xml, tamanho)
    values ('ev:' || (e->>'chave') || ':' || (e->>'tp_evento') || ':' || coalesce(nullif(e->>'sequencia', ''), '1'), 'evento', e->>'xml', length(e->>'xml'))
    on conflict (ref) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_inutilizacoes, '[]'::jsonb)) loop
    insert into public.fiscal_inutilizacoes (cnpj, serie, modelo, de, ate, ano, cstat, arquivo, importada_por_id)
    values (e->>'cnpj', (e->>'serie')::int, coalesce(nullif(e->>'modelo', ''), '55'), (e->>'de')::bigint, (e->>'ate')::bigint, e->>'ano', e->>'cstat', e->>'arquivo', v_ator)
    on conflict (cnpj, serie, modelo, de, ate) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then in_repetidas := in_repetidas + 1; continue; end if;
    in_novas := in_novas + 1;
    insert into public.fiscal_arquivos (ref, tipo, xml, tamanho)
    values ('inut:' || (e->>'cnpj') || ':' || (e->>'serie') || ':' || coalesce(nullif(e->>'modelo', ''), '55') || ':' || (e->>'de') || '-' || (e->>'ate'), 'inutilizacao', e->>'xml', length(e->>'xml'))
    on conflict (ref) do nothing;
  end loop;

  return jsonb_build_object('novas', novas, 'atualizadas', atualizadas, 'repetidas', repetidas, 'eventos_novos', ev_novos, 'eventos_repetidos', ev_repetidos,
    'inutilizacoes_novas', in_novas, 'inutilizacoes_repetidas', in_repetidas);
end;
$$;
revoke all on function public.fiscal_guardar(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.fiscal_guardar(jsonb, jsonb, jsonb) to authenticated;
