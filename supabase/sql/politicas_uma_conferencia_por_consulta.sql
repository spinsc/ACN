-- Regras de acesso conferidas UMA vez por consulta, e não uma vez por linha (12/11/2026).
-- Por quê: a migração "ver_como_no_banco" (12/11/2026, 19:18) fez cada conferência de acesso (esta_logado, eh_admin,
-- tem_alguma_aba etc.) consultar mais duas tabelas e ler o crachá, uns 10 vezes mais caro. Como a regra chamava a função
-- para CADA linha lida, a consulta do selo de Menções (cerca de 1.800 linhas, a cada 30 s em cada computador) passou de
-- instantânea a ~2,4 s e o sistema começou a dar timeout. Embrulhar a chamada em (select ...) faz o banco calcular uma só vez
-- por consulta (no teste: leituras de memória de 14.858 para 339). O significado das regras não muda.
-- Só mexe em regras do esquema public que ainda não têm "select" dentro. Desfazer: politicas_uma_conferencia_por_consulta_reverter.sql.
do $$
declare
  p record; q text; w text; n int := 0; antes int; depois int;
  fn_sem_arg text := '(?<![\w.])((?:esta_logado|eh_admin|eh_gerente_comercial|pode_ver_rh|pode_postar_inicio|pode_ver_comissoes|pode_autorizar_rh)\(\))';
  fn_abas text := '(?<![\w.])(tem_alguma_aba\(ARRAY\[[^\]]*\]\))';
  fn_aba text := '(?<![\w.])(tem_aba\([^()]*\))';
begin
  select count(*) into antes from pg_policies where schemaname = 'public';
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    if coalesce(p.qual, '') ~* '\mselect\M' or coalesce(p.with_check, '') ~* '\mselect\M' then continue; end if;
    q := p.qual; w := p.with_check;
    if q is not null then
      q := regexp_replace(q, fn_sem_arg, '(select \1)', 'g');
      q := regexp_replace(q, fn_abas, '(select \1)', 'g');
      q := regexp_replace(q, fn_aba, '(select \1)', 'g');
    end if;
    if w is not null then
      w := regexp_replace(w, fn_sem_arg, '(select \1)', 'g');
      w := regexp_replace(w, fn_abas, '(select \1)', 'g');
      w := regexp_replace(w, fn_aba, '(select \1)', 'g');
    end if;
    if q is not distinct from p.qual and w is not distinct from p.with_check then continue; end if;
    execute format('alter policy %I on %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
                   case when q is not null then ' using (' || q || ')' else '' end,
                   case when w is not null then ' with check (' || w || ')' else '' end);
    n := n + 1;
  end loop;
  select count(*) into depois from pg_policies where schemaname = 'public';
  if antes <> depois then raise exception 'O número de regras mudou (% -> %): desfeito', antes, depois; end if;
  raise notice 'Regras reescritas: % de %', n, antes;
end $$;
