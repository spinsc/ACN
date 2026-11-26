-- ENSAIO da onda 4c, parte b (26/11/2026, fechar o dinheiro dos centros de custo): aplica etapa17_onda4c_b_fechar_dinheiro_dos_centros.sql dentro de
-- um bloco que termina em erro de propósito (nada fica gravado) e confere, com o poder de cada pessoa ativa de verdade (crachá simulado por
-- request.jwt.claims + SET LOCAL ROLE): (1) as três tabelas de dinheiro (despesas, anexos, orçamento) só são lidas e gravadas por quem tem financeiro,
-- relatorios ou compras (conta feita por fora, direto do cadastro de usuários); (2) a lista dos centros continua lida por todos e só é gravada por quem
-- tem financeiro ou compras; (3) a chave pública não lê nenhuma; (4) custo: tempo de ler as quatro tabelas, antes e depois ("<< FALHA" se passar de 100 ms).
-- Tabelas vazias (anexos, orçamento) são testadas por INSERT com valores explícitos. Cole TODO este arquivo no SQL do banco; a mensagem final é o resultado.
-- O bloco da migração (entre $mig$) repete etapa17_onda4c_b_fechar_dinheiro_dos_centros.sql sem os comentários. Rodar só fora do horário de uso.
create function pg_temp.tenta(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v_rol text; n bigint; m text;
begin
  if p_uid is null then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    if p_sql ~* '^select count' then execute p_sql into n; else execute p_sql; get diagnostics n = row_count; end if;
    m := 'ok:' || n;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
create function pg_temp.ms(p_uid uuid) returns numeric language plpgsql as $f$
declare t0 timestamptz; t1 timestamptz; j text; i int; t text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..2 loop
    t0 := clock_timestamp();
    foreach t in array array['centro_custo_despesas', 'centro_custo_despesas_anexos', 'centros_custo_orcamento', 'centros_custo'] loop
      execute 'select json_agg(t)::text from (select * from public.' || t || ') t' into j;
    end loop;
    t1 := clock_timestamp();
  end loop;
  reset role;
  return round(extract(epoch from (t1 - t0)) * 1000, 1);
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; u record; r record; got text; pode_ler boolean; pode_gravar boolean; qtd bigint;
        col text; pessoas int := 0; quem uuid; ms_antes numeric; ms_depois numeric; linha text; sql_ins text;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  select au.auth_id into quem from public.auth_usuarios au where au.ativo and au.auth_id is not null limit 1;
  ms_antes := pg_temp.ms(quem);
  execute $mig$
do $m$
declare t text;
begin
  foreach t in array array['centro_custo_despesas', 'centro_custo_despesas_anexos', 'centros_custo_orcamento'] loop
    execute format('drop policy if exists etapa17_logado on public.%I', t);
    execute format('create policy etapa17_abas on public.%I for all to authenticated using ((select public.tem_alguma_aba(array[''financeiro'', ''relatorios'', ''compras'']))) with check ((select public.tem_alguma_aba(array[''financeiro'', ''relatorios'', ''compras''])))', t);
  end loop;
  drop policy if exists etapa17_logado on public.centros_custo;
  create policy etapa17_le on public.centros_custo for select to authenticated using ((select public.esta_logado()));
  create policy etapa17_grava_aba_i on public.centros_custo for insert to authenticated with check ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
  create policy etapa17_grava_aba_u on public.centros_custo for update to authenticated using ((select public.tem_alguma_aba(array['financeiro', 'compras']))) with check ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
  create policy etapa17_grava_aba_d on public.centros_custo for delete to authenticated using ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
end $m$;
$mig$;
  perform set_config('request.jwt.claims', '', true);
  ms_depois := pg_temp.ms(quem);

  for u in select au.auth_id, au.nome, au.perfil, coalesce(au.abas_permitidas, '[]'::jsonb) abas from public.auth_usuarios au where au.ativo and au.auth_id is not null loop
    pessoas := pessoas + 1;
    for r in select * from (values
        ('centro_custo_despesas', array['financeiro', 'relatorios', 'compras'], array['financeiro', 'relatorios', 'compras']),
        ('centro_custo_despesas_anexos', array['financeiro', 'relatorios', 'compras'], array['financeiro', 'relatorios', 'compras']),
        ('centros_custo_orcamento', array['financeiro', 'relatorios', 'compras'], array['financeiro', 'relatorios', 'compras']),
        ('centros_custo', null::text[], array['financeiro', 'compras'])
      ) as t(tabela, abas_leitura, abas_grava) loop
      pode_gravar := (u.perfil = 'Admin') or jsonb_array_length(u.abas) = 0 or u.abas ?| r.abas_grava;
      pode_ler := r.abas_leitura is null or (u.perfil = 'Admin') or jsonb_array_length(u.abas) = 0 or u.abas ?| r.abas_leitura;
      execute format('select count(*) from public.%I', r.tabela) into qtd;
      testes := testes + 1;
      got := pg_temp.tenta(u.auth_id, format('select count(*) from public.%I', r.tabela));
      if got <> 'ok:' || (case when pode_ler then qtd else 0 end) then falhas := falhas + 1; achados := achados || E'\n  LER ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode_ler || ') veio ' || got || ' com ' || qtd || ' linhas'; end if;
      if qtd > 0 then
        select column_name into col from information_schema.columns where table_schema = 'public' and table_name = r.tabela order by ordinal_position limit 1;
        testes := testes + 1;
        got := pg_temp.tenta(u.auth_id, format('update public.%I set %I = %I where ctid = (select ctid from public.%I limit 1)', r.tabela, col, col, r.tabela));
        if (pode_gravar and got = 'ok:0') or (not pode_gravar and got <> 'ok:0') then falhas := falhas + 1; achados := achados || E'\n  ALTERAR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode_gravar || ') veio ' || got; end if;
        testes := testes + 1;
        got := pg_temp.tenta(u.auth_id, format('delete from public.%I where ctid = (select ctid from public.%I limit 1)', r.tabela, r.tabela));
        if (pode_gravar and got = 'ok:0') or (not pode_gravar and got <> 'ok:0') then falhas := falhas + 1; achados := achados || E'\n  APAGAR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode_gravar || ') veio ' || got; end if;
      end if;
      sql_ins := case r.tabela
        when 'centros_custo_orcamento' then 'insert into public.centros_custo_orcamento (centro_id, ano, mes, valor) values ((select id from public.centros_custo limit 1), 2031, 1, 1)'
        when 'centro_custo_despesas_anexos' then 'insert into public.centro_custo_despesas_anexos (despesa_id, nome, url) values ((select id from public.centro_custo_despesas limit 1), ''x'', ''x'')'
        when 'centro_custo_despesas' then 'insert into public.centro_custo_despesas (centro_custo_id, valor, descricao, data) values ((select id from public.centros_custo limit 1), 1, ''x'', current_date)'
        else format('insert into public.%I select * from public.%I limit 1', r.tabela, r.tabela) end;   -- centros_custo: quem pode esbarra na chave única; quem não pode recebe 42501 antes
      testes := testes + 1;
      got := pg_temp.tenta(u.auth_id, sql_ins);
      if (pode_gravar and got = 'ERRO 42501') or (not pode_gravar and got <> 'ERRO 42501') then falhas := falhas + 1; achados := achados || E'\n  INSERIR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode_gravar || ') veio ' || got; end if;
    end loop;
  end loop;

  for r in select unnest(array['centro_custo_despesas', 'centro_custo_despesas_anexos', 'centros_custo_orcamento', 'centros_custo']) as tabela loop
    testes := testes + 1;
    got := pg_temp.tenta(null, format('select count(*) from public.%I', r.tabela));
    if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo ' || r.tabela || ' veio ' || got; end if;
  end loop;

  linha := E'\n  tempo de ler as quatro tabelas (pessoa que entrou): antes ' || ms_antes || ' ms, depois ' || ms_depois || ' ms';
  if ms_depois > 100 then falhas := falhas + 1; linha := linha || '   << FALHA (passou de 100 ms)'; end if;
  raise exception E'ENSAIO DA ONDA 4c-b: % pessoas ativas, % conferências, % falhas % %', pessoas, testes, falhas, linha, achados;
end
$ensaio$;
