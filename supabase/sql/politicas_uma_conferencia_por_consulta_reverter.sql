-- Desfaz politicas_uma_conferencia_por_consulta.sql: tira o (select ...) que embrulha as conferências de acesso das regras.
do $$
declare
  p record; q text; w text; n int := 0;
  emb text := '\(select ((?:esta_logado|eh_admin|eh_gerente_comercial|pode_ver_rh|pode_postar_inicio|pode_ver_comissoes|pode_autorizar_rh)\(\)|tem_alguma_aba\(ARRAY\[[^\]]*\]\)|tem_aba\([^()]*\))\)';
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := case when p.qual is null then null else regexp_replace(p.qual, emb, '\1', 'g') end;
    w := case when p.with_check is null then null else regexp_replace(p.with_check, emb, '\1', 'g') end;
    if q is not distinct from p.qual and w is not distinct from p.with_check then continue; end if;
    execute format('alter policy %I on %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
                   case when q is not null then ' using (' || q || ')' else '' end,
                   case when w is not null then ' with check (' || w || ')' else '' end);
    n := n + 1;
  end loop;
  raise notice 'Regras devolvidas ao formato antigo: %', n;
end $$;
