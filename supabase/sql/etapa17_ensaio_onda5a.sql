-- Ensaio da onda 5a (portais do cliente), 26/11/2026. Tudo é desfeito no fim; o relatório vem na mensagem de erro "ENSAIO DA ONDA 5a".
-- Como usar: cole o texto das partes a e b (etapa17_onda5a_a_funcoes_do_portal.sql e etapa17_onda5a_b_fechar_portal.sql) no lugar marcado, entre $mig$ e $mig$.
-- SÓ FORA DO HORÁRIO: trocar política segura uma trava curta nas tabelas até o fim do ensaio (quatro tabelas pequenas).
-- O que prova: a chave pública não lê mais veículo, serviço nem chamado e não insere chamado; o PIN global não sai; cada função entrega só o veículo pedido e nunca o PIN, o token
-- ou o telefone onde não deve; o PIN é conferido no servidor (errado 4x avisa as restantes, o 5º bloqueia, certo com o bloqueio ativo continua bloqueado, certo zera, bloqueio vencido libera);
-- o chamado copia os dados do veículo, fixa o status e tem o freio de 5 por hora; quem entrou continua lendo as tabelas.

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
create function pg_temp.valor(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v_rol text; m text;
begin
  if p_uid is null then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    execute p_sql into m;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;

do $ensaio$
declare
  achados text := ''; testes int := 0; falhas int := 0; got text; esperado text; linha text := '';
  vid uuid; vchassi text; vtoken uuid; pin_v text; pin_g text; n_cham bigint; n_serv bigint; n_cfg bigint; staff uuid; recentes bigint;
  seq text; r jsonb; i int;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  select id, chassi, portal_token, pin_acesso into vid, vchassi, vtoken, pin_v from public.veiculos_nfc where ativo limit 1;
  select valor into pin_g from public.configuracoes_sistema where chave = 'nfc_pin_global';
  select count(*) into n_cham from public.chamados_suporte where veiculo_id = vid;
  select count(*) into n_serv from public.servicos_executados_nfc where veiculo_id = vid;
  select count(*) into n_cfg from public.configuracoes_sistema where chave in ('nfc_nome_empresa', 'nfc_logo_url', 'nfc_whatsapp_numero', 'nfc_endereco_maps');
  select auth_id into staff from public.auth_usuarios where ativo and auth_id is not null limit 1;
  select count(*) into recentes from public.chamados_suporte where veiculo_id = vid and created_at > now() - interval '1 hour';

  -- ANTES: a chave pública lia (prova de que o ensaio enxerga o defeito)
  testes := testes + 1; got := pg_temp.tenta(null, 'select count(*) from public.veiculos_nfc');
  linha := linha || E'\n  antes da migração a chave pública lia ' || got || ' veículo(s)';

  execute $mig$
-- >>> COLE AQUI as partes a e b <<<
$mig$;
  perform set_config('request.jwt.claims', '', true);

  -- DEPOIS: a chave pública fechada
  foreach got in array array['veiculos_nfc', 'servicos_executados_nfc', 'chamados_suporte', 'nfc_pin_tentativas'] loop
    testes := testes + 1;
    esperado := pg_temp.tenta(null, 'select count(*) from public.' || got);
    if esperado <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo ' || got || ' veio ' || esperado; end if;
  end loop;
  testes := testes + 1; got := pg_temp.tenta(null, format('insert into public.chamados_suporte (veiculo_id, nome_solicitante, descricao_defeito, status) values (%L, ''x'', ''x'', ''Aberto'')', vid));
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública inserindo chamado direto veio ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(staff, 'select count(*) from public.nfc_pin_tentativas');
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  quem entrou lendo as tentativas de PIN veio ' || got; end if;

  -- configuração: só os dados de exibição; o PIN global não sai
  testes := testes + 1; got := pg_temp.tenta(null, 'select count(*) from public.configuracoes_sistema where chave = ''nfc_pin_global''');
  if got <> 'ok:0' then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo o PIN global veio ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(null, 'select count(*) from public.configuracoes_sistema where chave in (''nfc_nome_empresa'', ''nfc_logo_url'', ''nfc_whatsapp_numero'', ''nfc_endereco_maps'')');
  if got <> 'ok:' || n_cfg then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo os dados de exibição veio ' || got || ' esperado ok:' || n_cfg; end if;
  testes := testes + 1; got := pg_temp.tenta(null, 'select count(*) from public.configuracoes_sistema');
  if got <> 'ok:' || n_cfg then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo a configuração inteira veio ' || got || ' esperado ok:' || n_cfg; end if;

  -- portal.html: o veículo por token
  testes := testes + 1; got := pg_temp.valor(null, format('select public.portal_veiculo_por_token(%L)::text', vtoken));
  if got is null or got not like '%"veiculo"%' then falhas := falhas + 1; achados := achados || E'\n  portal por token não devolveu o veículo'; end if;
  testes := testes + 1;
  if got like '%pin_acesso%' or got like '%portal_token%' or got like '%contato_telefone%' or got like '%produtos_instalados%' then falhas := falhas + 1; achados := achados || E'\n  portal por token vazou pin, token, telefone ou produtos'; end if;
  testes := testes + 1; got := pg_temp.valor(null, format('select jsonb_array_length(public.portal_veiculo_por_token(%L)->''chamados'')::text', vtoken));
  if got <> least(n_cham, 20)::text then falhas := falhas + 1; achados := achados || E'\n  chamados do portal veio ' || coalesce(got, 'nulo') || ' esperado ' || least(n_cham, 20); end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select coalesce(public.portal_veiculo_por_token(gen_random_uuid())::text, ''nulo'')');
  if got <> 'nulo' then falhas := falhas + 1; achados := achados || E'\n  token inexistente devolveu algo'; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select coalesce(public.portal_veiculo_por_token(null)::text, ''nulo'')');
  if got <> 'nulo' then falhas := falhas + 1; achados := achados || E'\n  token nulo devolveu algo'; end if;

  -- veiculo.html: a parte aberta
  testes := testes + 1; got := pg_temp.valor(null, format('select public.nfc_veiculo_por_chassi(%L)::text', vchassi));
  if got is null or got not like '%"veiculo"%' or got like '%pin_acesso%' or got like '%portal_token%' or got like '%opl_numero%' then falhas := falhas + 1; achados := achados || E'\n  parte aberta por chassi: vazou ou não devolveu (' || left(coalesce(got, 'nulo'), 80) || ')'; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select coalesce(public.nfc_veiculo_por_chassi(''CHASSI-QUE-NAO-EXISTE'')::text, ''nulo'')');
  if got <> 'nulo' then falhas := falhas + 1; achados := achados || E'\n  chassi inexistente devolveu algo'; end if;

  -- veiculo.html: o PIN conferido no servidor (cada sequência numa única transação, desfeita no fim)
  begin
    execute 'set local role anon';
    seq := '';
    for i in 1..4 loop
      r := public.nfc_area_restrita(vchassi, 'errado' || i);
      seq := seq || coalesce(r->>'motivo', '?') || ':' || coalesce(r->>'restantes', '-') || ' ';
    end loop;
    r := public.nfc_area_restrita(vchassi, 'errado5');       -- o quinto erro bloqueia
    seq := seq || coalesce(r->>'motivo', '?') || ' ';
    r := public.nfc_area_restrita(vchassi, coalesce(pin_v, pin_g, 'x'));   -- PIN certo com o bloqueio ativo
    seq := seq || coalesce(r->>'motivo', 'LIBEROU') || ' ';
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then seq := 'ERRO ' || sqlstate || ' ' || sqlerrm; end if; end;
  reset role;
  testes := testes + 1;
  if seq <> 'pin:4 pin:3 pin:2 pin:1 bloqueado bloqueado ' then falhas := falhas + 1; achados := achados || E'\n  sequência do PIN errado: ' || seq; end if;

  begin
    execute 'set local role anon';
    r := public.nfc_area_restrita(vchassi, coalesce(pin_v, pin_g, 'x'));
    seq := coalesce(r->>'ok', '?') || ' chamados=' || coalesce(jsonb_array_length(r->'chamados')::text, '?') || ' servicos=' || coalesce(jsonb_array_length(r->'servicos')::text, '?')
           || ' tel=' || (((r->'chamados')::text) like '%contato_telefone%')
           || ' pinNaResposta=' || (r::text like '%pin_acesso%' or r::text like '%portal_token%');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then seq := 'ERRO ' || sqlstate || ' ' || sqlerrm; end if; end;
  reset role;
  testes := testes + 1;
  esperado := 'true chamados=' || least(n_cham, 10) || ' servicos=' || n_serv || ' tel=' || (n_cham > 0) || ' pinNaResposta=false';
  if seq <> esperado then falhas := falhas + 1; achados := achados || E'\n  PIN certo veio ' || seq || ' esperado ' || esperado; end if;

  if pin_g is not null and pin_g is distinct from pin_v then
    testes := testes + 1; got := pg_temp.valor(null, format('select (public.nfc_area_restrita(%L, %L)->>''ok'')', vchassi, pin_g));
    if got <> 'true' then falhas := falhas + 1; achados := achados || E'\n  PIN global não abriu a área restrita (veio ' || coalesce(got, 'nulo') || ')'; end if;
  end if;
  testes := testes + 1; got := pg_temp.valor(null, format('select (public.nfc_area_restrita(%L, '''')->>''ok'')', vchassi));
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  PIN vazio abriu a área restrita'; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select (public.nfc_area_restrita(''CHASSI-QUE-NAO-EXISTE'', ''123456'')->>''motivo'')');
  if got <> 'nao_encontrado' then falhas := falhas + 1; achados := achados || E'\n  chassi inexistente na área restrita veio ' || coalesce(got, 'nulo'); end if;

  begin  -- o bloqueio vencido libera, e o PIN certo zera a contagem
    insert into public.nfc_pin_tentativas (veiculo_id, falhas, bloqueado_ate) values (vid, 0, now() - interval '1 minute')
      on conflict (veiculo_id) do update set bloqueado_ate = now() - interval '1 minute', falhas = 3;
    execute 'set local role anon';
    r := public.nfc_area_restrita(vchassi, coalesce(pin_v, pin_g, 'x'));
    seq := coalesce(r->>'ok', '?');
    reset role;
    seq := seq || ' falhas=' || (select tt.falhas from public.nfc_pin_tentativas tt where tt.veiculo_id = vid) || ' ate=' || coalesce((select tt.bloqueado_ate::text from public.nfc_pin_tentativas tt where tt.veiculo_id = vid), 'nulo');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then seq := 'ERRO ' || sqlstate || ' ' || sqlerrm; end if; end;
  reset role;
  testes := testes + 1;
  if seq <> 'true falhas=0 ate=nulo' then falhas := falhas + 1; achados := achados || E'\n  bloqueio vencido + PIN certo: ' || seq; end if;

  -- abrir chamado: o servidor copia os dados do veículo, fixa o status e tem o freio
  begin
    execute 'set local role anon';
    r := public.portal_abrir_chamado(vtoken, 'CHASSI-FALSO', 'Fulano de Tal', '(48) 99999-9999', 'Defeito de ensaio no equipamento');
    seq := coalesce(r->>'ok', '?');
    reset role;
    seq := seq || ' ' || (select (chassi = vchassi and status = 'Aberto' and veiculo_id = vid)::text from public.chamados_suporte where descricao_defeito = 'Defeito de ensaio no equipamento' limit 1);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then seq := 'ERRO ' || sqlstate || ' ' || sqlerrm; end if; end;
  reset role;
  testes := testes + 1;
  if seq <> 'true true' then falhas := falhas + 1; achados := achados || E'\n  abrir chamado por token: ' || seq; end if;

  testes := testes + 1; got := pg_temp.valor(null, format('select (public.portal_abrir_chamado(null, %L, ''Fulano'', ''(48) 3000-0000'', ''Defeito pelo chassi da etiqueta'')->>''ok'')', vchassi));
  if got <> 'true' and recentes < 5 then falhas := falhas + 1; achados := achados || E'\n  abrir chamado pelo chassi veio ' || coalesce(got, 'nulo'); end if;
  testes := testes + 1; got := pg_temp.valor(null, format('select (public.portal_abrir_chamado(%L, null, ''Fulano'', ''123'', ''Defeito qualquer coisa'')->>''ok'')', vtoken));
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  telefone incompleto foi aceito'; end if;
  testes := testes + 1; got := pg_temp.valor(null, format('select (public.portal_abrir_chamado(%L, null, ''Fulano'', ''(48) 99999-9999'', ''abc'')->>''ok'')', vtoken));
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  descrição curta foi aceita'; end if;
  testes := testes + 1; got := pg_temp.valor(null, format('select (public.portal_abrir_chamado(%L, null, '' '', ''(48) 99999-9999'', ''Defeito qualquer coisa'')->>''ok'')', vtoken));
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  nome vazio foi aceito'; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select (public.portal_abrir_chamado(gen_random_uuid(), null, ''Fulano'', ''(48) 99999-9999'', ''Defeito qualquer coisa'')->>''ok'')');
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  token inexistente abriu chamado'; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select (public.portal_abrir_chamado(null, null, ''Fulano'', ''(48) 99999-9999'', ''Defeito qualquer coisa'')->>''ok'')');
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  sem token e sem chassi abriu chamado'; end if;

  begin  -- freio: até 5 por hora; do sexto em diante recusa
    execute 'set local role anon';
    seq := '';
    for i in 1..7 loop
      r := public.portal_abrir_chamado(vtoken, null, 'Fulano', '(48) 99999-9999', 'Defeito de ensaio numero ' || i);
      seq := seq || coalesce(r->>'ok', '?') || ' ';
    end loop;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then seq := 'ERRO ' || sqlstate || ' ' || sqlerrm; end if; end;
  reset role;
  testes := testes + 1;
  esperado := (select string_agg((g <= greatest(5 - recentes, 0))::text, ' ' order by g) from generate_series(1, 7) g) || ' ';
  if seq <> esperado then falhas := falhas + 1; achados := achados || E'\n  freio de 5 por hora: ' || seq || ' esperado ' || esperado; end if;

  -- quem entrou continua lendo
  testes := testes + 1; got := pg_temp.tenta(staff, 'select count(*) from public.chamados_suporte');
  if got <> 'ok:' || n_cham then falhas := falhas + 1; achados := achados || E'\n  quem entrou lendo os chamados veio ' || got || ' esperado ok:' || n_cham; end if;
  testes := testes + 1; got := pg_temp.tenta(staff, 'select count(*) from public.veiculos_nfc');
  if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n  quem entrou lendo os veículos veio ' || got; end if;

  raise exception E'ENSAIO DA ONDA 5a: % conferências, % falhas % %', testes, falhas, linha, achados;
end
$ensaio$;
