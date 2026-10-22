-- Etapa 17b, onda 2 (22/10/2026) — REVERTE etapa17_onda2.sql: devolve à chave pública o que ela tinha antes (tabelas, visões, funções, arquivos e privilégios padrão), lendo a fotografia
-- que a própria onda 2 guardou em public.etapa17_estado_anterior (onda = 'onda2'). Use só se o fechamento quebrar algo que ninguém consiga contornar na hora; depois de reverter, o banco volta
-- a aceitar leitura e gravação sem entrar no sistema (como era antes de 22/10/2026). A tabela da fotografia é mantida.

do $etapa17rev$
declare r record; papeis text;
begin
  if not exists (select 1 from public.etapa17_estado_anterior where onda = 'onda2') then
    raise exception 'sem fotografia da onda 2: nada para reverter';
  end if;

  -- 1) tira as regras que a onda 2 criou
  for r in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' and policyname in ('etapa17_logado', 'portal_le_config', 'portal_le_veiculos', 'portal_le_servicos', 'portal_le_chamados', 'portal_abre_chamado'))
       or (schemaname = 'storage' and policyname in ('acn-media logado insert', 'acn-media logado update', 'acn-media logado read'))
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  -- 2) devolve cada regra como estava (as de gravação da onda 1a, que não mudaram, são recriadas iguais)
  for r in select detalhe as d from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'politica' loop
    execute format('drop policy if exists %I on %I.%I', r.d->>'nome', r.d->>'esquema', r.d->>'tabela');
    papeis := (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from jsonb_array_elements_text(r.d->'papeis') x);
    execute format('create policy %I on %I.%I as %s for %s to %s%s%s', r.d->>'nome', r.d->>'esquema', r.d->>'tabela', lower(r.d->>'permissiva'), r.d->>'comando', papeis,
      case when r.d->>'usando' is not null then ' using (' || (r.d->>'usando') || ')' else '' end,
      case when r.d->>'com_check' is not null then ' with check (' || (r.d->>'com_check') || ')' else '' end);
  end loop;

  -- 3) proteção de linha e direitos da chave pública, tabela por tabela e visão por visão
  for r in select objeto, detalhe as d from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'tabela' loop
    if r.d->>'tipo' in ('r', 'p') and not (r.d->>'rls')::boolean then
      execute format('alter table public.%I disable row level security', r.objeto);
    end if;
    execute format('revoke all on public.%I from anon', r.objeto);
    for papeis in select jsonb_array_elements_text(r.d->'anon') loop
      execute format('grant %s on public.%I to anon', papeis, r.objeto);
    end loop;
  end loop;
  grant all on all sequences in schema public to anon;

  -- 4) funções
  for r in select objeto, detalhe as d from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'funcao' loop
    if (r.d->>'anon')::boolean then execute 'grant execute on function ' || r.objeto || ' to anon'; end if;
    if (r.d->>'authenticated')::boolean then execute 'grant execute on function ' || r.objeto || ' to authenticated'; end if;
  end loop;
end $etapa17rev$;

-- 5) o que nascer daqui para frente volta a nascer aberto à chave pública
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to anon;
