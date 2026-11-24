-- Plano "toda pessoa por ID" (PLANO_USUARIOS_POR_ID.md), etapa U3 — 24/11/2026.
-- Depois do U2 (cada coluna de pessoa tem o ID ao lado), as funcoes do banco que ACHAVAM A PESSOA PELO NOME passam a achar pelo ID, com o nome como reserva
-- (OU): nada que funcionava deixa de funcionar, e renomear alguem deixa de ser um risco para elas. So CREATE OR REPLACE de funcoes: nenhuma tabela e travada.
-- O que foi conferido e NAO precisou mudar: as funcoes de acesso (eh_admin, tem_aba, perfil_atual, nome_do_usuario_atual, ...) e as terceiros_* ja usam o ID do
-- usuario (auth_id / uid_efetivo); as de calendario casam pelo nome que o U2 mantem em dia ao renomear; os gatilhos viagens_avisar_*, op_excluir e renomear_opl
-- gravam o nome de quem age, sem comparar. Nao ha politica de acesso que compare nome.
-- Desfazer: usuarios_por_id_u3_reverter.sql (volta os trechos de antes).
set local lock_timeout = '5s';

-- 1) renomear leva o nome novo tambem ao campo de busca sem acento (<coluna>_norm), que o gatilho de usuario nao recalculava porque fica desligado durante a troca
create or replace function public.pessoa_propagar_nome(p_pid uuid) returns integer language plpgsql security definer set search_path = public as
$$
declare novo text; r record; ex boolean; n integer; total integer := 0; tabs text[] := '{}'; t text; normset text;
begin
  novo := public.pessoa_nome(p_pid);
  if novo is null or btrim(novo) = '' then return 0; end if;
  for r in select * from public.pessoa_colunas where tipo = 'nome' loop
    execute format('select exists (select 1 from public.%I where %I = $1 and %I is distinct from $2 and coalesce(%I::text, '''') not like ''%%@%%'')', r.tabela, r.id_coluna, r.coluna, r.coluna) into ex using p_pid, novo;
    if ex and not (r.tabela = any (tabs)) then tabs := tabs || r.tabela; end if;
  end loop;
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  begin
    for r in select * from public.pessoa_colunas where tipo = 'nome' and tabela = any (tabs) loop
      normset := '';
      if exists (select 1 from information_schema.columns cl where cl.table_schema = 'public' and cl.table_name = r.tabela and cl.column_name = r.coluna || '_norm') then
        normset := format(', %I = public.normalizar_busca($2)', r.coluna || '_norm');
      end if;
      execute format('update public.%I set %I = $2%s where %I = $1 and %I is distinct from $2 and coalesce(%I::text, '''') not like ''%%@%%''', r.tabela, r.coluna, normset, r.id_coluna, r.coluna, r.coluna) using p_pid, novo;
      get diagnostics n = row_count; total := total + n;
    end loop;
  exception when others then
    foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
    raise;
  end;
  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  return total;
end $$;

-- 2) as tres funcoes que casavam nome: troca de trechos sobre a definicao em vigor (sem retipar as funcoes inteiras); cada troca confere que o trecho existe
do $do$
declare d text; o text; n text;
begin
  -- 2a) excluir formacao: "quem criou" tambem pelo ID
  d := pg_get_functiondef('public.formacao_excluir(uuid,text,text,timestamptz)'::regprocedure);
  if position('alvo.criado_por_pessoa_id = u.id' in d) = 0 then
    o := $a$autor_ok := btrim(coalesce(alvo.criado_por, '')) <> ''$a$;
    n := $a$autor_ok := coalesce(alvo.criado_por_pessoa_id = u.id, false) or (btrim(coalesce(alvo.criado_por, '')) <> ''$a$;
    if position(o in d) = 0 then raise exception 'formacao_excluir: trecho 1 nao achado'; end if;
    d := replace(d, o, n);
    o := $a$coalesce(u.email, ''))));$a$;
    n := $a$coalesce(u.email, '')))));$a$;
    if position(o in d) = 0 then raise exception 'formacao_excluir: trecho 2 nao achado'; end if;
    d := replace(d, o, n);
    execute d;
  end if;

  -- 2b) aviso de frete sem entrega: responsavel, vendedor e criador da OP tambem pelo ID
  d := pg_get_functiondef('public.fretes_avisar_sem_entrega()'::regprocedure);
  if position('responsavel_comercial_pessoa_id' in d) = 0 then
    o := $a$o.opl, o.cliente_nome, o.responsavel_comercial, o.vendedor, o.criado_por_nome$a$;
    n := $a$o.opl, o.cliente_nome, o.responsavel_comercial, o.vendedor, o.criado_por_nome, o.responsavel_comercial_pessoa_id, o.vendedor_pessoa_id, o.criado_por_nome_pessoa_id$a$;
    if position(o in d) = 0 then raise exception 'fretes: trecho 1 nao achado'; end if;
    d := replace(d, o, n);
    o := $a$and lower(trim(a.nome)) in (lower(trim(coalesce(f.responsavel_comercial, ''))), lower(trim(coalesce(f.vendedor, ''))))$a$;
    n := $a$and (lower(trim(a.nome)) in (lower(trim(coalesce(f.responsavel_comercial, ''))), lower(trim(coalesce(f.vendedor, '')))) or a.id in (f.responsavel_comercial_pessoa_id, f.vendedor_pessoa_id))$a$;
    if position(o in d) = 0 then raise exception 'fretes: trecho 2 nao achado'; end if;
    d := replace(d, o, n);
    o := $a$and lower(trim(a.nome)) = lower(trim(coalesce(f.criado_por_nome, '')))$a$;
    n := $a$and (lower(trim(a.nome)) = lower(trim(coalesce(f.criado_por_nome, ''))) or a.id = f.criado_por_nome_pessoa_id)$a$;
    if position(o in d) = 0 then raise exception 'fretes: trecho 3 nao achado'; end if;
    d := replace(d, o, n);
    execute d;
  end if;

  -- 2c) aviso do Comercial ao aprovar a viagem: responsavel comercial, vendedor e criador tambem pelo ID
  d := pg_get_functiondef('public.viagens_ao_mudar_de_etapa()'::regprocedure);
  if position('v_ids_com' in d) = 0 then
    o := $a$u record; v_nomes_com text[];$a$;
    n := $a$u record; v_nomes_com text[]; v_ids_com uuid[];$a$;
    if position(o in d) = 0 then raise exception 'viagens: trecho 1 nao achado'; end if;
    d := replace(d, o, n);
    o := $a$for u in$a$;
    n := $a$v_ids_com := array(select distinct x.i from public.oples o, lateral unnest(array[o.responsavel_comercial_pessoa_id, o.vendedor_pessoa_id]) as x(i) where o.id = any(coalesce(new.op_ids, '{}'::uuid[])) and x.i is not null);
      if not exists (select 1 from public.auth_usuarios a where coalesce(a.ativo, true) and a.id = any(v_ids_com)) then
        v_ids_com := array(select distinct y.i from (select new.criado_por_nome_pessoa_id as i union all select o.criado_por_nome_pessoa_id from public.oples o where o.id = any(coalesce(new.op_ids, '{}'::uuid[]))) y where y.i is not null);
      end if;
      for u in$a$;
    if position(o in d) = 0 or (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'viagens: trecho 2 nao achado ou repetido'; end if;
    d := replace(d, o, n);
    o := $a$and lower(btrim(a.nome)) = any(coalesce(v_nomes_com, '{}'::text[]))$a$;
    n := $a$and (lower(btrim(a.nome)) = any(coalesce(v_nomes_com, '{}'::text[])) or a.id = any(coalesce(v_ids_com, '{}'::uuid[])))$a$;
    if position(o in d) = 0 then raise exception 'viagens: trecho 3 nao achado'; end if;
    d := replace(d, o, n);
    execute d;
  end if;
end $do$;
