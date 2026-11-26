-- ENSAIO da onda 4b (26/11/2026, gravação por aba nas tabelas de configuração + funções fora da chave pública): aplica
-- etapa17_onda4b_gravacao_por_aba.sql dentro de um bloco que termina em erro de propósito (nada fica gravado) e confere, com o poder de
-- cada pessoa ativa de verdade (crachá simulado por request.jwt.claims + SET LOCAL ROLE): (1) LER continua valendo para todo mundo que
-- entrou; (2) INSERIR, ALTERAR e APAGAR só passam para quem tem a aba dona (conta feita por fora, direto do cadastro de usuários, sem usar
-- as funções novas); (3) a chave pública não lê nem grava; (4) a chave pública não executa mais nenhuma das 29 funções e quem entrou
-- executa; um gatilho dispara normalmente para quem entrou; (5) custo: tempo de ler as dez tabelas antes e depois (linha "<< FALHA" se
-- passar de 100 ms). Cole TODO este arquivo no SQL do banco; a mensagem de erro final é o resultado.
-- O bloco da migração (entre $mig$ e $mig2$) repete etapa17_onda4b_gravacao_por_aba.sql sem os comentários: se um mudar, mude o outro.
-- Rodar só fora do horário de uso (as tabelas ficam travadas até o fim do bloco; `lock_timeout` curto desiste em vez de esperar).
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
  for i in 1..2 loop   -- vale a segunda medida (a primeira paga o plano e o catálogo frios)
    t0 := clock_timestamp();
    foreach t in array array['compras_alcadas_aprovacao','fretes_alcadas_aprovacao','contratos_padrao','fluxo_config','feriados',
                             'rh_cargos','rh_funcionario_cargos','rh_departamentos','rh_funcionario_departamentos','compras_fornecedores'] loop
      execute 'select json_agg(t)::text from (select * from public.' || t || ') t' into j;
    end loop;
    t1 := clock_timestamp();
  end loop;
  reset role;
  return round(extract(epoch from (t1 - t0)) * 1000, 1);
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; u record; r record; got text; esp text; pode boolean; abas text[];
        col text; qtd bigint; pessoas int := 0; quem uuid; ms_antes numeric; ms_depois numeric;
        funcoes int := 0; sem_funcao int := 0; f record; linha text;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  select au.auth_id into quem from public.auth_usuarios au where au.ativo and au.auth_id is not null limit 1;
  ms_antes := pg_temp.ms(quem);
  execute $mig$
do $m$
declare r record;
begin
  for r in select * from (values
      ('compras_alcadas_aprovacao','array[''admin'']'),('fretes_alcadas_aprovacao','array[''admin'']'),('contratos_padrao','array[''admin'']'),
      ('fluxo_config','array[''admin'']'),('feriados','array[''admin'']'),('rh_cargos','array[''rh'']'),('rh_funcionario_cargos','array[''rh'']'),
      ('rh_departamentos','array[''rh'']'),('rh_funcionario_departamentos','array[''rh'']'),('compras_fornecedores','array[''compras'']')
    ) as t(tabela, abas)
  loop
    execute format('drop policy if exists etapa17_logado on public.%I', r.tabela);
    execute format('create policy etapa17_le on public.%I for select to authenticated using ((select public.esta_logado()))', r.tabela);
    execute format('create policy etapa17_grava_aba_i on public.%I for insert to authenticated with check ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas);
    execute format('create policy etapa17_grava_aba_u on public.%I for update to authenticated using ((select public.tem_alguma_aba(%s))) with check ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas, r.abas);
    execute format('create policy etapa17_grava_aba_d on public.%I for delete to authenticated using ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas);
  end loop;
end $m$;
do $m2$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in (
         'cadastro_itens_protege_1687_exclusao', 'cadastro_itens_regras_do_catalogo', 'estrutura_valida_lista_de_itens', 'fn_crm_audit_estagio',
         'gerar_numero_cotacao', 'gerar_numero_oc', 'kit_sem_ciclo', 'op_remessas_conferir_data_envio', 'pcp_filho_marca_movimentacao',
         'pcp_pedido_marca_movimentacao', 'resolver_mencoes_aprovacao_ao_decidir', 'set_cadastro_itens_updated', 'set_cadastro_produtos_updated',
         'set_cotacoes_precos_updated', 'sync_norm_cadastro_itens', 'sync_norm_cadastro_produtos', 'sync_norm_clientes', 'sync_norm_crm_oportunidades',
         'sync_norm_engenharia_desenvolvimento', 'sync_norm_licitacoes', 'sync_norm_oples', 'sync_norm_sac_ordens_servico', 'sync_simplificado_fipe_modelos',
         'tg_crm_perdida_cancela_analises', 'tg_licitacao_perdida_cancela_analises', 'trigger_atualizar_lead_time',
         'pedido_compra_extrair_valores', 'pedido_itens_sem_preco', 'pedido_vencedoras_sem_valor')
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated', f.assinatura);
  end loop;
end $m2$;
$mig$;
  perform set_config('request.jwt.claims', '', true);
  ms_depois := pg_temp.ms(quem);

  -- (1) a conta, pessoa por pessoa e tabela por tabela
  for u in select au.auth_id, au.nome, au.perfil, coalesce(au.abas_permitidas, '[]'::jsonb) abas from public.auth_usuarios au where au.ativo and au.auth_id is not null loop
    pessoas := pessoas + 1;
    for r in select * from (values
        ('compras_alcadas_aprovacao', array['admin']), ('fretes_alcadas_aprovacao', array['admin']), ('contratos_padrao', array['admin']),
        ('fluxo_config', array['admin']), ('feriados', array['admin']), ('rh_cargos', array['rh']), ('rh_funcionario_cargos', array['rh']),
        ('rh_departamentos', array['rh']), ('rh_funcionario_departamentos', array['rh']), ('compras_fornecedores', array['compras'])
      ) as t(tabela, aba) loop
      pode := (u.perfil = 'Admin') or jsonb_array_length(u.abas) = 0 or u.abas ?| r.aba;
      execute format('select count(*) from public.%I', r.tabela) into qtd;
      -- ler: quem entrou lê tudo
      testes := testes + 1;
      got := pg_temp.tenta(u.auth_id, format('select count(*) from public.%I', r.tabela));
      if got <> 'ok:' || qtd then falhas := falhas + 1; achados := achados || E'\n  LER ' || rpad(r.tabela, 30) || ' ' || u.nome || ' veio ' || got || ' esperava ok:' || qtd; end if;
      if qtd > 0 then
        select column_name into col from information_schema.columns where table_schema = 'public' and table_name = r.tabela order by ordinal_position limit 1;
        -- alterar (sem mudar valor): passa em 1 linha para quem tem a aba, 0 para os outros
        testes := testes + 1;
        got := pg_temp.tenta(u.auth_id, format('update public.%I set %I = %I where ctid = (select ctid from public.%I limit 1)', r.tabela, col, col, r.tabela));
        if (pode and got = 'ok:0') or (not pode and got <> 'ok:0') then falhas := falhas + 1; achados := achados || E'\n  ALTERAR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode || ') veio ' || got; end if;
        -- apagar
        testes := testes + 1;
        got := pg_temp.tenta(u.auth_id, format('delete from public.%I where ctid = (select ctid from public.%I limit 1)', r.tabela, r.tabela));
        if (pode and got = 'ok:0') or (not pode and got <> 'ok:0') then falhas := falhas + 1; achados := achados || E'\n  APAGAR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode || ') veio ' || got; end if;
        -- inserir (copia a primeira linha: quem tem a aba esbarra na chave, 23505 ou parecido; quem não tem recebe 42501 antes de tudo)
        testes := testes + 1;
        got := pg_temp.tenta(u.auth_id, format('insert into public.%I select * from public.%I limit 1', r.tabela, r.tabela));
        if (pode and got = 'ERRO 42501') or (not pode and got <> 'ERRO 42501') then falhas := falhas + 1; achados := achados || E'\n  INSERIR ' || rpad(r.tabela, 30) || ' ' || u.nome || ' (pode=' || pode || ') veio ' || got; end if;
      end if;
    end loop;
  end loop;

  -- (3) a chave pública não lê nem grava
  for r in select unnest(array['compras_alcadas_aprovacao','fretes_alcadas_aprovacao','contratos_padrao','fluxo_config','feriados','rh_cargos','rh_funcionario_cargos','rh_departamentos','rh_funcionario_departamentos','compras_fornecedores']) as tabela loop
    testes := testes + 1;
    got := pg_temp.tenta(null, format('select count(*) from public.%I', r.tabela));
    if got not in ('ERRO 42501') then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo ' || r.tabela || ' veio ' || got; end if;
  end loop;

  -- (4) as 29 funções: a chave pública não executa, quem entrou executa
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
         'cadastro_itens_protege_1687_exclusao', 'cadastro_itens_regras_do_catalogo', 'estrutura_valida_lista_de_itens', 'fn_crm_audit_estagio',
         'gerar_numero_cotacao', 'gerar_numero_oc', 'kit_sem_ciclo', 'op_remessas_conferir_data_envio', 'pcp_filho_marca_movimentacao',
         'pcp_pedido_marca_movimentacao', 'resolver_mencoes_aprovacao_ao_decidir', 'set_cadastro_itens_updated', 'set_cadastro_produtos_updated',
         'set_cotacoes_precos_updated', 'sync_norm_cadastro_itens', 'sync_norm_cadastro_produtos', 'sync_norm_clientes', 'sync_norm_crm_oportunidades',
         'sync_norm_engenharia_desenvolvimento', 'sync_norm_licitacoes', 'sync_norm_oples', 'sync_norm_sac_ordens_servico', 'sync_simplificado_fipe_modelos',
         'tg_crm_perdida_cancela_analises', 'tg_licitacao_perdida_cancela_analises', 'trigger_atualizar_lead_time',
         'pedido_compra_extrair_valores', 'pedido_itens_sem_preco', 'pedido_vencedoras_sem_valor') loop
    funcoes := funcoes + 1; testes := testes + 1;
    if has_function_privilege('anon', f.oid, 'execute') then falhas := falhas + 1; achados := achados || E'\n  anon ainda executa ' || f.proname; end if;
    if not has_function_privilege('authenticated', f.oid, 'execute') then falhas := falhas + 1; achados := achados || E'\n  quem entrou perdeu ' || f.proname; end if;
  end loop;
  if funcoes <> 29 then falhas := falhas + 1; achados := achados || E'\n  esperava 29 funções e achei ' || funcoes; end if;

  -- um gatilho dispara para quem entrou (o mesmo update que a tela faz, em tabela com gatilho de busca sem acento)
  select au.auth_id into quem from public.auth_usuarios au where au.ativo and au.auth_id is not null and (au.perfil = 'Admin') limit 1;
  testes := testes + 1;
  got := pg_temp.tenta(quem, 'update public.clientes set nome = nome where ctid = (select ctid from public.clientes limit 1)');
  if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n  gatilho sync_norm_clientes para quem entrou veio ' || got; end if;

  -- (5) custo
  linha := E'\n  tempo de ler as dez tabelas (pessoa que entrou): antes ' || ms_antes || ' ms, depois ' || ms_depois || ' ms';
  if ms_depois > 100 then falhas := falhas + 1; linha := linha || '   << FALHA (passou de 100 ms)'; end if;
  raise exception E'ENSAIO DA ONDA 4b: % pessoas ativas, % conferências, % falhas % %', pessoas, testes, falhas, linha, achados;
end
$ensaio$;
