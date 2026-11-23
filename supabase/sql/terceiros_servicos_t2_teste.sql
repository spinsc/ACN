-- TESTE DAS REGRAS DO BANCO — Serviços de terceiros, fatia T2 (23/11/2026): anexos do pedido e alteração de vários serviços de uma vez.
-- Como o teste da T1 (terceiros_servicos_t1_teste.sql): roda inteiro no execute_sql (projeto qgemelnuqdilnggxmrdw); cada pessoa (Admin, gerente, Adaptação e dois usuários comuns, escolhidos entre as
-- REAIS por perfil e aba) age pelo papel "authenticated" com o crachá dela, como o navegador. O relatório vem NA MENSAGEM DE ERRO "TESTE ..." porque tudo é desfeito no fim: nada fica gravado.
-- Para testar ANTES de aplicar a migração, cole terceiros_servicos_t2.sql no lugar marcado abaixo (vira parte da mesma transação e também é desfeita); depois de aplicada, deixe o lugar vazio.
-- A única coisa que não volta sozinha é o contador do número (TS-00001): depois de rodar, `select setval('public.terceiros_servico_seq', 1, false);` — só enquanto não houver serviço de verdade.
begin;

-- >>> MIGRAÇÃO EM ENSAIO (opcional): cole aqui o conteúdo de terceiros_servicos_t2.sql <<<

create function pg_temp.como(p_auth uuid, p_sql text, p_sessao text default 'teste-terceiros', p_papel text default 'authenticated') returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_strip_nulls(json_build_object('sub', p_auth::text, 'role', p_papel, 'session_id', p_sessao))::text, true);
  execute format('set local role %I', p_papel);
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERRO ' || sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  return v;
end $f$;

create function pg_temp.confere(p_nome text, p_cond boolean, p_detalhe text default null) returns void language plpgsql as $f$
begin
  perform set_config('terceiros_teste.total', (coalesce(nullif(current_setting('terceiros_teste.total', true), ''), '0')::int + 1)::text, true);
  if coalesce(p_cond, false) then
    perform set_config('terceiros_teste.rel', coalesce(current_setting('terceiros_teste.rel', true), '') || 'ok     ' || p_nome || E'\n', true);
  else
    perform set_config('terceiros_teste.falhas', (coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0')::int + 1)::text, true);
    perform set_config('terceiros_teste.rel', coalesce(current_setting('terceiros_teste.rel', true), '') || 'FALHA  ' || p_nome || coalesce('   >> ' || p_detalhe, '') || E'\n', true);
  end if;
end $f$;

create function pg_temp.n_servicos(p text) returns int language plpgsql as $f$
begin
  if p is null or p like 'ERRO%' then return -1; end if;
  return jsonb_array_length(p::jsonb -> 'servicos');
end $f$;

create function pg_temp.n_lista(p text) returns int language plpgsql as $f$
begin
  if p is null or p like 'ERRO%' then return -1; end if;
  return jsonb_array_length(p::jsonb);
end $f$;

create function pg_temp.ids_de(p text) returns uuid[] language plpgsql as $f$
begin
  if p is null or p like 'ERRO%' then return '{}'; end if;
  return coalesce((select array_agg((e ->> 'id')::uuid order by e ->> 'numero') from jsonb_array_elements(p::jsonb -> 'servicos') e), '{}');
end $f$;

create function pg_temp.pedir(p_quem uuid, p_tipo uuid, p_desc text, p_ops uuid[] default null, p_extra text default '', p_sessao text default 'teste-terceiros') returns text language plpgsql as $f$
declare v_ligs jsonb;
begin
  v_ligs := coalesce((select jsonb_agg(jsonb_build_object('tipo', 'op', 'id', o)) from unnest(p_ops) o), '[]'::jsonb);
  return pg_temp.como(p_quem, format($q$select public.terceiros_solicitar(%L, %L, p_ligacoes => %L::jsonb%s)::text$q$, p_tipo, p_desc, v_ligs::text, p_extra), p_sessao);
end $f$;

create function pg_temp.agendar(p_quem uuid, p_ids uuid[], p_prest uuid, p_data date, p_periodo text, p_esp text, p_motivo text default null, p_sessao text default 'teste-terceiros') returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_agendar(%L::uuid[], %L::uuid, %L::date, %L, %L, %L)::text$q$, p_ids, p_prest, p_data, p_periodo, p_esp, p_motivo), p_sessao);
end $f$;

create function pg_temp.atualizar(p_quem uuid, p_id uuid, p_dados jsonb, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_atualizar(%L::uuid, %L::jsonb, %L)::text$q$, p_id, p_dados::text, p_esp));
end $f$;

create function pg_temp.varios(p_quem uuid, p_ids uuid[], p_dados jsonb, p_esp text, p_sessao text default 'teste-terceiros') returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_atualizar_varios(%L::uuid[], %L::jsonb, %L)::text$q$, p_ids, p_dados::text, p_esp), p_sessao);
end $f$;

do $t$
declare
  adm uuid; ger uuid; ada uuid; c1 uuid; c2 uuid;
  adm_nome text; c1_uid uuid; c1_nome text; c1_email text; c2_uid uuid;
  t_lav uuid; t_pel uuid;
  p1 uuid; p2 uuid; pin uuid;
  v_venda text; ops uuid[];
  v text; n0 int; n1 int; ids uuid[]; h0 int; h1 int;
  s1 uuid; s2 uuid; s3 uuid; b1 uuid; b2 uuid; b3 uuid; x2 uuid; id_av uuid;
  anx_a text := '{"caminho":"terceiros/zzteste/desenho-1.pdf","nome":"desenho 1.pdf","tamanho":12345}';
  anx_b text := '{"caminho":"terceiros/zzteste/foto.jpg","nome":"foto.jpg"}';
  anx_c text := '{"caminho":"terceiros/zzteste/novo.dwg","nome":"novo.dwg","tamanho":777}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- ── as pessoas e os dados que o teste usa ────────────────────────────────────────────────────────────────────────────────────────────────────
  select auth_id, nome into adm, adm_nome from public.auth_usuarios where perfil = 'Admin' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ger from public.auth_usuarios where perfil ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ada from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and coalesce(abas_permitidas, '[]'::jsonb) ? 'producao' order by id limit 1;
  select auth_id, id, nome, email into c1, c1_uid, c1_nome, c1_email from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') order by id limit 1;
  select auth_id, id into c2, c2_uid from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') and auth_id <> c1 order by id desc limit 1;
  select id into t_lav from public.terceiros_tipos where nome_norm = 'lavagem';
  select id into t_pel from public.terceiros_tipos where nome_norm = 'pelicula';
  select q.vb, array_agg(q.id order by q.opl) into v_venda, ops
    from (select id, opl, regexp_replace(opl, '/[0-9]+$', '') as vb from public.oples where excluida_em is null and opl ~ '/[0-9]+$') q
   group by q.vb having count(*) >= 6 order by q.vb limit 1;
  perform pg_temp.confere('00 pessoas (Admin, gerente, Adaptação, dois comuns) e uma venda real com 6+ unidades para ligar',
    adm is not null and ger is not null and ada is not null and c1 is not null and c2 is not null and ops is not null and t_lav is not null and t_pel is not null,
    format('adm=%s ger=%s ada=%s c1=%s c2=%s ops=%s', adm, ger, ada, c1, c2, ops is not null));
  if adm is null or ger is null or ada is null or c1 is null or c2 is null or ops is null or t_lav is null or t_pel is null then
    raise exception E'TESTE ABORTADO: faltou pessoa ou dado para o teste\n%', current_setting('terceiros_teste.rel', true);
  end if;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T2 Prestador Um', 'zzteste t2 prestador um') returning id into p1;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T2 Prestador Dois', 'zzteste t2 prestador dois') returning id into p2;
  insert into public.terceiros_prestadores (nome, nome_norm, ativo) values ('ZZTESTE T2 Prestador Inativo', 'zzteste t2 prestador inativo', false) returning id into pin;

  -- ── N. a forma das funções ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform pg_temp.confere('N1 só existe UMA terceiros_solicitar (a de antes saiu) e ela tem o parâmetro dos anexos',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'terceiros_solicitar') = 1
    and coalesce((select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'terceiros_solicitar' limit 1) like '%p_anexos%', false));
  perform pg_temp.confere('N2 quem entrou executa terceiros_atualizar_varios; a chave pública não',
    has_function_privilege('authenticated', 'public.terceiros_atualizar_varios(uuid[], jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_atualizar_varios(uuid[], jsonb, text)', 'execute'));
  perform pg_temp.confere('N3 a função de apoio terceiros_limpar_anexos é fechada a quem entrou e à chave pública',
    not has_function_privilege('authenticated', 'public.terceiros_limpar_anexos(jsonb, jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_limpar_anexos(jsonb, jsonb, text)', 'execute'));

  -- ── J. anexos no pedido ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE com anexos', ops[1:3], format(', p_anexos => %L::jsonb', '[' || anx_a || ',' || anx_b || ']'));
  ids := pg_temp.ids_de(v);
  s1 := ids[1]; s2 := ids[2]; s3 := ids[3];
  perform pg_temp.confere('J1 pedir com 2 anexos para 3 unidades: os 3 serviços levam os mesmos 2 arquivos, com quem anexou e o tamanho, e a 1ª linha do histórico diz "(2 anexo(s))"',
    pg_temp.n_servicos(v) = 3
    and (select count(*) from public.terceiros_servicos s where s.id = any(ids) and jsonb_array_length(s.anexos) = 2 and (s.anexos -> 0 ->> 'caminho') = 'terceiros/zzteste/desenho-1.pdf'
          and (s.anexos -> 0 ->> 'nome') = 'desenho 1.pdf' and (s.anexos -> 0 ->> 'tamanho')::bigint = 12345 and (s.anexos -> 1 ->> 'tamanho') is null
          and (s.anexos -> 0 ->> 'por') = c1_nome and (s.anexos -> 0 ->> 'em') is not null and (s.historico -> 0 ->> 'detalhe') like '%(2 anexo(s))%') = 3
    and (select count(distinct s.anexos::text) from public.terceiros_servicos s where s.id = any(ids)) = 1, v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexo fora da pasta', null, ', p_anexos => ''[{"caminho":"outra/pasta/x.pdf","nome":"x.pdf"}]''::jsonb');
  perform pg_temp.confere('J2 arquivo fora da pasta terceiros/ é recusado', v like 'ERRO%não está na pasta dos serviços de terceiros%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexo com ponto-ponto', null, ', p_anexos => ''[{"caminho":"terceiros/../segredo.pdf","nome":"segredo.pdf"}]''::jsonb');
  perform pg_temp.confere('J3 caminho com ".." é recusado', v like 'ERRO%não está na pasta dos serviços de terceiros%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexo sem nome', null, ', p_anexos => ''[{"caminho":"terceiros/zzteste/a.pdf","nome":""}]''::jsonb');
  perform pg_temp.confere('J4 anexo sem nome é recusado', v like 'ERRO%caminho do arquivo e o nome%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexo sem caminho', null, ', p_anexos => ''[{"nome":"a.pdf"}]''::jsonb');
  perform pg_temp.confere('J5 anexo sem caminho é recusado', v like 'ERRO%caminho do arquivo e o nome%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexos fora de lista', null, ', p_anexos => ''{"a":1}''::jsonb');
  perform pg_temp.confere('J6 anexos que não vêm em lista são recusados', v like 'ERRO%anexos devem vir em uma lista%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE anexo que é texto', null, ', p_anexos => ''["texto"]''::jsonb');
  perform pg_temp.confere('J7 item de anexo que não é um objeto é recusado', v like 'ERRO%caminho do arquivo e o nome%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE trinta e um anexos', null, format(', p_anexos => %L::jsonb',
         (select jsonb_agg(jsonb_build_object('caminho', 'terceiros/zzteste/f' || g || '.pdf', 'nome', 'f' || g || '.pdf')) from generate_series(1, 31) g)::text));
  perform pg_temp.confere('J8 mais de 30 anexos é recusado', v like 'ERRO%no máximo 30 anexos%', v);
  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE trinta anexos', null, format(', p_anexos => %L::jsonb',
         (select jsonb_agg(jsonb_build_object('caminho', 'terceiros/zzteste/g' || g || '.pdf', 'nome', 'g' || g || '.pdf')) from generate_series(1, 30) g)::text));
  perform pg_temp.confere('J9 exatamente 30 anexos vale', pg_temp.n_servicos(v) = 1 and (select jsonb_array_length(anexos) from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]) = 30, v);
  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE anexo repetido', null, ', p_anexos => ''[{"caminho":"terceiros/zzteste/a.pdf","nome":"a.pdf"},{"caminho":"terceiros/zzteste/a.pdf","nome":"a de novo.pdf"}]''::jsonb');
  perform pg_temp.confere('J10 o mesmo arquivo duas vezes vale um (fica o primeiro nome)',
    pg_temp.n_servicos(v) = 1 and coalesce((select jsonb_array_length(anexos) = 1 and (anexos -> 0 ->> 'nome') = 'a.pdf' from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), false), v);
  n0 := (select count(*) from public.terceiros_servicos);
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE anexo ruim no lote', ops[4:6], ', p_anexos => ''[{"caminho":"outra/x.pdf","nome":"x"}]''::jsonb');
  n1 := (select count(*) from public.terceiros_servicos);
  perform pg_temp.confere('J11 anexo ruim num pedido de várias unidades: o pedido inteiro é recusado e nada é gravado', v like 'ERRO%não está na pasta%' and n0 = n1, v || ' / antes ' || n0 || ' depois ' || n1);
  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE anexos nulos', null, ', p_anexos => null');
  perform pg_temp.confere('J12 anexos nulos valem como nenhum anexo', pg_temp.n_servicos(v) = 1 and (select anexos = '[]'::jsonb from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), v);
  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE tamanho ruim', null, ', p_anexos => ''[{"caminho":"terceiros/zzteste/t1.pdf","nome":"t1.pdf","tamanho":"abc"},{"caminho":"terceiros/zzteste/t2.pdf","nome":"t2.pdf","tamanho":99999999999999}]''::jsonb');
  perform pg_temp.confere('J13 tamanho que não é número, ou grande demais, vira "sem tamanho" e o arquivo entra',
    pg_temp.n_servicos(v) = 1 and (select jsonb_array_length(anexos) = 2 and (anexos -> 0 ->> 'tamanho') is null and (anexos -> 1 ->> 'tamanho') is null from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), v);
  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE nome longo', null, format(', p_anexos => %L::jsonb',
         jsonb_build_array(jsonb_build_object('caminho', 'terceiros/zzteste/longo.pdf', 'nome', repeat('n', 300)))::text));
  perform pg_temp.confere('J14 o nome do arquivo é cortado em 200 letras', pg_temp.n_servicos(v) = 1 and (select length(anexos -> 0 ->> 'nome') = 200 from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), v);

  -- ── K. anexos na alteração do pedido ────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.atualizar(adm, s1, jsonb_build_object('anexos', ('[' || anx_a || ',' || anx_b || ',' || anx_c || ']')::jsonb), 'solicitado');
  perform pg_temp.confere('K1 o Admin acrescenta um arquivo à lista: ficam 3; os 2 de antes mantêm quem anexou e o tamanho, o novo leva o nome do Admin; o histórico diz "entrou: novo.dwg"',
    v not like 'ERRO%' and coalesce((select jsonb_array_length(anexos) = 3 and (anexos -> 0 ->> 'por') = c1_nome and (anexos -> 1 ->> 'por') = c1_nome and (anexos -> 0 ->> 'tamanho')::bigint = 12345
        and (anexos -> 2 ->> 'por') = adm_nome and (anexos -> 2 ->> 'tamanho')::bigint = 777
        and (historico -> -1) ->> 'acao' = 'alterado' and (historico -> -1) ->> 'detalhe' like '%anexos (entrou: novo.dwg)%' and (historico -> -1) ->> 'detalhe' not like '%saiu%'
        from public.terceiros_servicos where id = s1), false), v);
  h0 := (select jsonb_array_length(historico) from public.terceiros_servicos where id = s1);
  v := pg_temp.atualizar(adm, s1, jsonb_build_object('anexos', ('[' || anx_a || ',' || anx_b || ',' || anx_c || ']')::jsonb), 'solicitado');
  h1 := (select jsonb_array_length(historico) from public.terceiros_servicos where id = s1);
  perform pg_temp.confere('K2 mandar a mesma lista de novo não mexe no histórico', v not like 'ERRO%' and h0 = h1, v || ' / ' || h0 || ' → ' || h1);
  v := pg_temp.atualizar(c1, s1, jsonb_build_object('anexos', ('[' || anx_a || ',' || anx_c || ']')::jsonb), 'solicitado');
  perform pg_temp.confere('K3 quem pediu tira um arquivo: ficam 2 (o do Admin continua com o nome dele) e o histórico diz "saiu: foto.jpg"',
    v not like 'ERRO%' and coalesce((select jsonb_array_length(anexos) = 2 and (anexos -> 1 ->> 'por') = adm_nome and (historico -> -1) ->> 'detalhe' like '%anexos (saiu: foto.jpg)%' and (historico -> -1) ->> 'detalhe' not like '%entrou%'
        from public.terceiros_servicos where id = s1), false), v);
  v := pg_temp.atualizar(c2, s1, jsonb_build_object('anexos', '[]'::jsonb), 'solicitado');
  perform pg_temp.confere('K4 outro usuário não mexe nos anexos do pedido de quem pediu', v like 'ERRO 42501%' and (select jsonb_array_length(anexos) from public.terceiros_servicos where id = s1) = 2, v);
  v := pg_temp.atualizar(c1, s1, '{"anexos":[{"caminho":"x/y.pdf","nome":"y.pdf"}]}'::jsonb, 'solicitado');
  perform pg_temp.confere('K5 arquivo fora da pasta na alteração é recusado e a lista fica como estava', v like 'ERRO%não está na pasta%' and (select jsonb_array_length(anexos) from public.terceiros_servicos where id = s1) = 2, v);
  v := pg_temp.atualizar(c1, s1, '{"observacao":"ZZTESTE obs","anexos":[]}'::jsonb, 'solicitado');
  perform pg_temp.confere('K6 alterar a observação e esvaziar os anexos juntos: o histórico diz as duas coisas',
    v not like 'ERRO%' and coalesce((select anexos = '[]'::jsonb and observacao = 'ZZTESTE obs' and (historico -> -1) ->> 'detalhe' like '%observação%' and (historico -> -1) ->> 'detalhe' like '%anexos (saiu: %desenho 1.pdf%'
        from public.terceiros_servicos where id = s1), false), v);

  -- ── L. alterar vários de uma vez ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE lote película', ops[1:3]);
  ids := pg_temp.ids_de(v);
  b1 := ids[1]; b2 := ids[2]; b3 := ids[3];
  v := pg_temp.pedir(c2, t_pel, 'ZZTESTE película do outro', ops[4:4]);
  x2 := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('L0 preparo: 3 películas de uma pessoa e 1 de outra, todas em A definir', b3 is not null and x2 is not null and (select count(*) from public.terceiros_servicos where id in (b1, b2, b3, x2) and status = 'solicitado') = 4, v);

  v := pg_temp.varios(c1, array[b1, b2, b3], jsonb_build_object('prestador_id', p1, 'valor_combinado', 80), 'solicitado');
  perform pg_temp.confere('L1 quem pediu muda o prestador e o valor combinado das 3 películas de uma vez: as 3 mudam e cada uma ganha a linha "alterado"',
    pg_temp.n_lista(v) = 3 and (select count(*) from public.terceiros_servicos where id in (b1, b2, b3) and prestador_id = p1 and valor_combinado = 80 and (historico -> -1) ->> 'acao' = 'alterado'
         and (historico -> -1) ->> 'detalhe' like '%prestador: sem prestador → ZZTESTE T2 Prestador Um%' and (historico -> -1) ->> 'detalhe' like '%valor combinado: sem valor → 80,00%') = 3, v);
  h0 := (select sum(jsonb_array_length(historico)) from public.terceiros_servicos where id in (b1, b2, b3));
  v := pg_temp.varios(c1, array[b1, b2, b3], jsonb_build_object('prestador_id', p1, 'valor_combinado', 80), 'solicitado');
  h1 := (select sum(jsonb_array_length(historico)) from public.terceiros_servicos where id in (b1, b2, b3));
  perform pg_temp.confere('L2 repetir o mesmo ajuste não mexe em nenhum histórico', pg_temp.n_lista(v) = 3 and h0 = h1, v || ' / ' || h0 || ' → ' || h1);
  v := pg_temp.varios(c1, array[b1, b2, x2], jsonb_build_object('valor_combinado', 90), 'solicitado');
  perform pg_temp.confere('L3 lote com a película de outra pessoa: recusado e NENHUMA muda (tudo ou nada)', v like 'ERRO 42501%' and (select count(*) from public.terceiros_servicos where id in (b1, b2) and valor_combinado = 80) = 2, v);
  v := pg_temp.agendar(ada, array[b3], p1, hoje + 3, 'manha', 'solicitado');
  v := pg_temp.varios(c1, array[b1, b3], jsonb_build_object('valor_combinado', 95), 'solicitado');
  perform pg_temp.confere('L4 lote com um serviço em outra situação (Agendado): recusado ("mudou de situação") e nenhum muda', v like 'ERRO%mudou de situação%' and (select valor_combinado from public.terceiros_servicos where id = b1) = 80, v);
  v := pg_temp.varios(c1, array[b3], jsonb_build_object('prestador_id', p2, 'valor_combinado', 95), 'agendado');
  perform pg_temp.confere('L5 um lote só de agendados troca prestador e valor combinado (o dia e a situação ficam)',
    v not like 'ERRO%' and coalesce((select status = 'agendado' and prestador_id = p2 and valor_combinado = 95 and data_agendada = hoje + 3 from public.terceiros_servicos where id = b3), false), v);
  v := pg_temp.varios(c1, array[b1, b2], '{"descricao":"outra"}'::jsonb, 'solicitado');
  perform pg_temp.confere('L6 a descrição não se altera em lote (é de cada serviço)', v like 'ERRO%vários serviços de uma vez%', v);
  v := pg_temp.varios(c1, array[b1, b2], '{"anexos":[]}'::jsonb, 'solicitado');
  perform pg_temp.confere('L7 os anexos não se alteram em lote', v like 'ERRO%vários serviços de uma vez%', v);
  v := pg_temp.varios(c1, '{}'::uuid[], '{"valor_combinado":1}'::jsonb, 'solicitado');
  perform pg_temp.confere('L8 lista vazia de serviços é recusada', v like 'ERRO%Escolha pelo menos um serviço%', v);
  v := pg_temp.varios(c1, array(select gen_random_uuid() from generate_series(1, 101)), '{"valor_combinado":1}'::jsonb, 'solicitado');
  perform pg_temp.confere('L9 mais de 100 serviços de uma vez é recusado', v like 'ERRO%no máximo 100%', v);
  v := pg_temp.varios(c1, array[b1, gen_random_uuid()], jsonb_build_object('valor_combinado', 96), 'solicitado');
  perform pg_temp.confere('L10 serviço que não existe no meio do lote: recusado e nenhum muda', v like 'ERRO%não foi encontrado%' and (select valor_combinado from public.terceiros_servicos where id = b1) = 80, v);
  v := pg_temp.varios(c1, array[b1, b2], jsonb_build_object('prestador_id', pin), 'solicitado');
  perform pg_temp.confere('L11 prestador inativo no lote é recusado e nenhum muda', v like 'ERRO%inativo%' and (select count(*) from public.terceiros_servicos where id in (b1, b2) and prestador_id = p1) = 2, v);
  v := pg_temp.varios(c1, array[b1, b2], '{"data_desejada":"2000-01-01"}'::jsonb, 'solicitado');
  perform pg_temp.confere('L12 data desejada que já passou é recusada', v like 'ERRO%já passou%', v);
  v := pg_temp.varios(c1, array[b1, b2], jsonb_build_object('data_desejada', (hoje + 10)::text), 'solicitado');
  perform pg_temp.confere('L13 a data desejada futura vale para os 2 de uma vez', v not like 'ERRO%' and (select count(*) from public.terceiros_servicos where id in (b1, b2) and data_desejada = hoje + 10) = 2, v);
  v := pg_temp.varios(c1, array[b1, b2], '{"prestador_id":null}'::jsonb, 'solicitado');
  perform pg_temp.confere('L14 em A definir dá para tirar o prestador de vários', v not like 'ERRO%' and (select count(*) from public.terceiros_servicos where id in (b1, b2) and prestador_id is null) = 2, v);
  v := pg_temp.varios(c1, array[b3], '{"prestador_id":null}'::jsonb, 'agendado');
  perform pg_temp.confere('L15 em Agendado não se tira o prestador (volte a A definir antes)', v like 'ERRO%volte o serviço%', v);
  v := pg_temp.varios(adm, array[b1, b2, x2], jsonb_build_object('observacao', 'ZZTESTE obs do Admin'), 'solicitado');
  perform pg_temp.confere('L16 o Admin altera o lote de qualquer pessoa (3 serviços de duas pessoas)', pg_temp.n_lista(v) = 3 and (select count(*) from public.terceiros_servicos where id in (b1, b2, x2) and observacao = 'ZZTESTE obs do Admin') = 3, v);
  v := pg_temp.varios(ada, array[b1, b2, x2], jsonb_build_object('valor_combinado', 70), 'solicitado');
  perform pg_temp.confere('L17 a Adaptação altera o lote de películas de outras pessoas (o tipo é dela)', pg_temp.n_lista(v) = 3 and (select count(*) from public.terceiros_servicos where id in (b1, b2, x2) and valor_combinado = 70) = 3, v);
  v := pg_temp.varios(ada, array[s2, s3], jsonb_build_object('valor_combinado', 70), 'solicitado');
  perform pg_temp.confere('L18 a Adaptação não altera o lote de lavagem de outra pessoa (o tipo não é dela)', v like 'ERRO 42501%' and (select count(*) from public.terceiros_servicos where id in (s2, s3) and valor_combinado is null) = 2, v);
  v := pg_temp.como(null, format($q$select public.terceiros_atualizar_varios(%L::uuid[], '{"valor_combinado":1}'::jsonb, 'solicitado')::text$q$, array[b1]), 'x', 'anon');
  perform pg_temp.confere('L19 a chave pública não executa terceiros_atualizar_varios', v like 'ERRO 42501%', v);
  v := pg_temp.como(c1, $q$select public.terceiros_limpar_anexos('[]'::jsonb, '[]'::jsonb, 'x')::text$q$);
  perform pg_temp.confere('L20 quem entrou não executa a função de apoio terceiros_limpar_anexos', v like 'ERRO 42501%', v);

  -- ── M. "Ver como": o lote também obedece a pessoa vista ─────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.como(adm, format($q$select public.ver_como_iniciar(%L)::text$q$, c1_email), 'teste-vc');
  perform pg_temp.confere('M0 o Admin passa a ver o sistema como um usuário comum', v like '%nome%', v);
  v := pg_temp.varios(adm, array[x2], jsonb_build_object('valor_combinado', 60), 'solicitado', 'teste-vc');
  perform pg_temp.confere('M1 vendo como um usuário comum, o Admin NÃO altera em lote a película de outra pessoa', v like 'ERRO 42501%', v);
  v := pg_temp.varios(adm, array[b1, b2], jsonb_build_object('valor_combinado', 61), 'solicitado', 'teste-vc');
  perform pg_temp.confere('M2 vendo como quem pediu, altera as películas dessa pessoa; o autor real fica no histórico "(vendo como ...)"',
    v not like 'ERRO%' and (select count(*) from public.terceiros_servicos where id in (b1, b2) and valor_combinado = 61 and (historico -> -1) ->> 'por' like '% (vendo como %)') = 2, v);
  v := pg_temp.varios(adm, array[x2], jsonb_build_object('valor_combinado', 62), 'solicitado');
  perform pg_temp.confere('M3 o mesmo Admin, sem o Ver como, altera', v not like 'ERRO%', v);

  raise exception E'TESTE DAS REGRAS (Serviços de terceiros, T2) — % verificações, % falha(s)\n%',
    coalesce(current_setting('terceiros_teste.total', true), '0'), coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0'), current_setting('terceiros_teste.rel', true);
end
$t$;
rollback;
