-- Desfaz usuarios_por_id_u3.sql (plano "toda pessoa por ID", etapa U3, 24/11/2026).
-- Devolve as tres funcoes ao texto de antes (so o nome casa) e a pessoa_propagar_nome a de antes (sem o campo de busca <coluna>_norm).
set local lock_timeout = '5s';

do $do$
declare d text;
begin
  d := pg_get_functiondef('public.formacao_excluir(uuid,text,text,timestamptz)'::regprocedure);
  d := replace(d, $a$autor_ok := coalesce(alvo.criado_por_pessoa_id = u.id, false) or (btrim(coalesce(alvo.criado_por, '')) <> ''$a$, $a$autor_ok := btrim(coalesce(alvo.criado_por, '')) <> ''$a$);
  d := replace(d, $a$coalesce(u.email, '')))));$a$, $a$coalesce(u.email, ''))));$a$);
  execute d;

  d := pg_get_functiondef('public.fretes_avisar_sem_entrega()'::regprocedure);
  d := replace(d, $a$o.criado_por_nome, o.responsavel_comercial_pessoa_id, o.vendedor_pessoa_id, o.criado_por_nome_pessoa_id$a$, $a$o.criado_por_nome$a$);
  d := replace(d, $a$and (lower(trim(a.nome)) in (lower(trim(coalesce(f.responsavel_comercial, ''))), lower(trim(coalesce(f.vendedor, '')))) or a.id in (f.responsavel_comercial_pessoa_id, f.vendedor_pessoa_id))$a$, $a$and lower(trim(a.nome)) in (lower(trim(coalesce(f.responsavel_comercial, ''))), lower(trim(coalesce(f.vendedor, ''))))$a$);
  d := replace(d, $a$and (lower(trim(a.nome)) = lower(trim(coalesce(f.criado_por_nome, ''))) or a.id = f.criado_por_nome_pessoa_id)$a$, $a$and lower(trim(a.nome)) = lower(trim(coalesce(f.criado_por_nome, '')))$a$);
  execute d;

  d := pg_get_functiondef('public.viagens_ao_mudar_de_etapa()'::regprocedure);
  d := replace(d, $a$u record; v_nomes_com text[]; v_ids_com uuid[];$a$, $a$u record; v_nomes_com text[];$a$);
  d := replace(d, $a$v_ids_com := array(select distinct x.i from public.oples o, lateral unnest(array[o.responsavel_comercial_pessoa_id, o.vendedor_pessoa_id]) as x(i) where o.id = any(coalesce(new.op_ids, '{}'::uuid[])) and x.i is not null);
      if not exists (select 1 from public.auth_usuarios a where coalesce(a.ativo, true) and a.id = any(v_ids_com)) then
        v_ids_com := array(select distinct y.i from (select new.criado_por_nome_pessoa_id as i union all select o.criado_por_nome_pessoa_id from public.oples o where o.id = any(coalesce(new.op_ids, '{}'::uuid[]))) y where y.i is not null);
      end if;
      for u in$a$, $a$for u in$a$);
  d := replace(d, $a$and (lower(btrim(a.nome)) = any(coalesce(v_nomes_com, '{}'::text[])) or a.id = any(coalesce(v_ids_com, '{}'::uuid[])))$a$, $a$and lower(btrim(a.nome)) = any(coalesce(v_nomes_com, '{}'::text[]))$a$);
  execute d;
end $do$;

-- a pessoa_propagar_nome de antes e a que esta em usuarios_por_id_u2.sql: rode o trecho dela de la, se precisar voltar tambem a ela.
