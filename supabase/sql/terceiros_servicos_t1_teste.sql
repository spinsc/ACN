-- TESTE DAS REGRAS DO BANCO — Serviços de terceiros, fatia T1 (22/11/2026).
-- Roda inteiro no execute_sql (projeto qgemelnuqdilnggxmrdw). Cada pessoa do teste (Admin, gerente, Adaptação e dois usuários comuns, escolhidos entre as REAIS por perfil e aba)
-- age pelo papel "authenticated" com o crachá dela, como o navegador. O relatório vem NA MENSAGEM DE ERRO "TESTE ..." porque tudo é desfeito no fim: nada fica gravado.
-- A única coisa que não volta sozinha é o contador do número (TS-00001): depois de rodar, `select setval('public.terceiros_servico_seq', 1, false);` — só enquanto não houver serviço de verdade.
begin;

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

create function pg_temp.realizar(p_quem uuid, p_ids uuid[], p_data date, p_valor numeric, p_esp text, p_obs text default null) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_realizar(%L::uuid[], %L::date, %L::numeric, %L, %L)::text$q$, p_ids, p_data, p_valor, p_esp, p_obs));
end $f$;

create function pg_temp.voltar(p_quem uuid, p_ids uuid[], p_para text, p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_voltar(%L::uuid[], %L, %L, %L)::text$q$, p_ids, p_para, p_motivo, p_esp));
end $f$;

create function pg_temp.cancelar(p_quem uuid, p_ids uuid[], p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_cancelar(%L::uuid[], %L, %L)::text$q$, p_ids, p_motivo, p_esp));
end $f$;

create function pg_temp.atualizar(p_quem uuid, p_id uuid, p_dados jsonb, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_atualizar(%L::uuid, %L::jsonb, %L)::text$q$, p_id, p_dados::text, p_esp));
end $f$;

do $t$
declare
  adm uuid; ger uuid; ada uuid; c1 uuid; c2 uuid;
  c1_uid uuid; c1_nome text; c1_email text; c2_uid uuid; ada_nome text;
  t_pel uuid; t_lav uuid; t_out uuid;
  p1 uuid; p2 uuid; pin uuid;
  v_venda text; ops uuid[]; opls text[];
  os_id uuid; dem_id uuid; prj_id uuid;
  v text; n int; n0 int; ids uuid[]; h0 int; h1 int; t_ant timestamptz;
  id1 uuid; id2 uuid; id3 uuid; id4 uuid; id5 uuid; id6 uuid;
  pel1 uuid; pel2 uuid; pel3 uuid; id_out uuid; id_h uuid; id_h2 uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- ── as pessoas e os dados que o teste usa ────────────────────────────────────────────────────────────────────────────────────────────────────
  select auth_id into adm from public.auth_usuarios where perfil = 'Admin' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ger from public.auth_usuarios where perfil ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id, nome into ada, ada_nome from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and coalesce(abas_permitidas, '[]'::jsonb) ? 'producao' order by id limit 1;
  select auth_id, id, nome, email into c1, c1_uid, c1_nome, c1_email from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') order by id limit 1;
  select auth_id, id into c2, c2_uid from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') and auth_id <> c1 order by id desc limit 1;
  select id into t_pel from public.terceiros_tipos where nome_norm = 'pelicula';
  select id into t_lav from public.terceiros_tipos where nome_norm = 'lavagem';
  select id into t_out from public.terceiros_tipos where nome_norm = 'outro';
  select q.vb, array_agg(q.id order by q.opl), array_agg(q.opl order by q.opl) into v_venda, ops, opls
    from (select id, opl, regexp_replace(opl, '/[0-9]+$', '') as vb from public.oples where excluida_em is null and opl ~ '/[0-9]+$') q
   group by q.vb having count(*) >= 6 order by q.vb limit 1;
  select id into os_id from public.sac_ordens_servico order by id limit 1;
  select id into dem_id from public.demandas_avulsas order by id limit 1;
  select id into prj_id from public.engenharia_desenvolvimento order by id limit 1;
  perform pg_temp.confere('00 pessoas (Admin, gerente, Adaptação, dois comuns) e dados reais para ligar (venda com 6+ unidades, OS, demanda, projeto)',
    adm is not null and ger is not null and ada is not null and c1 is not null and c2 is not null and ops is not null and os_id is not null and dem_id is not null and prj_id is not null
      and t_pel is not null and t_lav is not null and t_out is not null,
    format('adm=%s ger=%s ada=%s c1=%s c2=%s ops=%s os=%s dem=%s prj=%s', adm, ger, ada, c1, c2, ops is not null, os_id, dem_id, prj_id));
  if adm is null or ger is null or ada is null or c1 is null or c2 is null or ops is null or t_pel is null or t_lav is null or t_out is null then
    raise exception E'TESTE ABORTADO: faltou pessoa ou dado para o teste\n%', current_setting('terceiros_teste.rel', true);
  end if;

  -- ── A. quem lê e quem grava nas tabelas ─────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.como(null, 'select count(*)::text from public.terceiros_tipos', 'x', 'anon');
  perform pg_temp.confere('A1 a chave pública (anon) não lê os tipos', v like 'ERRO 42501%', v);
  v := pg_temp.como(c1, 'select count(*)::text from public.terceiros_tipos');
  perform pg_temp.confere('A2 quem entrou lê os 10 tipos de partida', v = '10', v);
  v := pg_temp.como(c1, 'select count(*)::text from public.terceiros_servicos');
  perform pg_temp.confere('A3 quem entrou lê os serviços (nenhum ainda)', v = '0', v);
  v := pg_temp.como(c1, format($q$insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome) values (%L, 'ZZTESTE direto', 'x') returning id::text$q$, t_lav));
  perform pg_temp.confere('A4 ninguém grava serviço direto na tabela', v like 'ERRO 42501%', v);
  v := pg_temp.como(adm, format($q$insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome) values (%L, 'ZZTESTE direto', 'x') returning id::text$q$, t_lav));
  perform pg_temp.confere('A5 nem o Admin grava serviço direto (só pelas funções)', v like 'ERRO 42501%', v);

  v := pg_temp.como(adm, $q$insert into public.terceiros_prestadores (nome, nome_norm, cnpj_cpf, criado_por) values ('ZZTESTE Prestador Um', 'zzteste prestador um', '11222333000181', 'teste') returning id::text$q$);
  perform pg_temp.confere('A6 o Admin cadastra prestador', v ~ '^[0-9a-f-]{36}$', v);
  if v ~ '^[0-9a-f-]{36}$' then p1 := v::uuid; end if;
  v := pg_temp.como(ger, $q$insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE Prestador Dois', 'zzteste prestador dois') returning id::text$q$);
  perform pg_temp.confere('A7 o gerente cadastra prestador', v ~ '^[0-9a-f-]{36}$', v);
  if v ~ '^[0-9a-f-]{36}$' then p2 := v::uuid; end if;
  v := pg_temp.como(ada, $q$insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE Prestador da Adaptação', 'zzteste prestador da adaptacao') returning id::text$q$);
  perform pg_temp.confere('A8 a Adaptação cadastra prestador', v ~ '^[0-9a-f-]{36}$', v);
  v := pg_temp.como(c1, $q$insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE Prestador do Comum', 'zzteste prestador do comum') returning id::text$q$);
  perform pg_temp.confere('A9 quem não gere prestadores não cadastra', v like 'ERRO 42501%', v);
  v := pg_temp.como(c1, $q$with x as (update public.terceiros_prestadores set observacao = 'mexi' where nome_norm = 'zzteste prestador um' returning 1) select count(*)::text from x$q$);
  perform pg_temp.confere('A10 quem não gere prestadores não altera (0 linhas)', v = '0', v);
  v := pg_temp.como(ada, $q$with x as (update public.terceiros_prestadores set observacao = 'ok' where nome_norm = 'zzteste prestador um' returning 1) select count(*)::text from x$q$);
  perform pg_temp.confere('A11 a Adaptação altera prestador', v = '1', v);
  v := pg_temp.como(adm, $q$insert into public.terceiros_prestadores (nome, nome_norm) values ('zzteste PRESTADOR um', 'zzteste prestador um') returning id::text$q$);
  perform pg_temp.confere('A12 nome repetido é barrado (23505)', v like 'ERRO 23505%', v);
  v := pg_temp.como(adm, $q$insert into public.terceiros_prestadores (nome, nome_norm, cnpj_cpf) values ('ZZTESTE Doc Repetido', 'zzteste doc repetido', '11222333000181') returning id::text$q$);
  perform pg_temp.confere('A13 CNPJ repetido é barrado (23505)', v like 'ERRO 23505%documento%', v);
  v := pg_temp.como(adm, $q$insert into public.terceiros_prestadores (nome, nome_norm, cnpj_cpf) values ('ZZTESTE Doc Curto', 'zzteste doc curto', '123') returning id::text$q$);
  perform pg_temp.confere('A14 documento que não tem 11 nem 14 dígitos é barrado (23514)', v like 'ERRO 23514%', v);
  insert into public.terceiros_prestadores (nome, nome_norm, ativo) values ('ZZTESTE Prestador Inativo', 'zzteste prestador inativo', false) returning id into pin;

  v := pg_temp.como(c1, $q$insert into public.terceiros_tipos (nome, nome_norm) values ('ZZTESTE Tipo', 'zzteste tipo') returning id::text$q$);
  perform pg_temp.confere('A15 quem não é Admin não cria tipo de serviço', v like 'ERRO 42501%', v);
  v := pg_temp.como(ger, $q$insert into public.terceiros_tipos (nome, nome_norm) values ('ZZTESTE Tipo', 'zzteste tipo') returning id::text$q$);
  perform pg_temp.confere('A16 nem o gerente cria tipo (só o Admin)', v like 'ERRO 42501%', v);
  v := pg_temp.como(adm, $q$insert into public.terceiros_tipos (nome, nome_norm) values ('ZZTESTE Tipo', 'zzteste tipo') returning id::text$q$);
  perform pg_temp.confere('A17 o Admin cria tipo de serviço', v ~ '^[0-9a-f-]{36}$', v);
  v := pg_temp.como(c1, $q$with x as (update public.terceiros_tipos set ordem = 1 where nome_norm = 'zzteste tipo' returning 1) select count(*)::text from x$q$);
  perform pg_temp.confere('A18 quem não é Admin não altera tipo (0 linhas)', v = '0', v);
  v := pg_temp.como(adm, $q$with x as (update public.terceiros_tipos set ordem = 5 where nome_norm = 'zzteste tipo' returning 1) select count(*)::text from x$q$);
  perform pg_temp.confere('A19 o Admin altera tipo', v = '1', v);
  v := pg_temp.como(c1, 'select public.terceiros_ator()::text');
  perform pg_temp.confere('A20 a função de apoio (terceiros_ator) é fechada a quem entrou', v like 'ERRO 42501%', v);
  v := pg_temp.como(null, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE anon')::text$q$, t_lav), 'x', 'anon');
  perform pg_temp.confere('A21 a chave pública não executa terceiros_solicitar', v like 'ERRO 42501%', v);

  -- ── B. pedir ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE lavar o carro', ops[1:3], format(', p_data_desejada => %L, p_observacao => %L', (hoje + 5)::text, 'obs do teste'));
  perform pg_temp.confere('B1 pedir lavagem para 3 unidades da mesma venda devolve 3 serviços', pg_temp.n_servicos(v) = 3, v);
  ids := pg_temp.ids_de(v);
  id1 := ids[1]; id2 := ids[2]; id3 := ids[3];
  perform pg_temp.confere('B2 cada serviço guarda a venda, a OP, quem pediu, a situação, o número TS-00000, a data desejada e a 1ª linha do histórico',
    (select count(*) from public.terceiros_servicos s join public.oples o on o.id = s.ligacao_id
      where s.id = any(ids) and s.venda_base = v_venda and s.ligacao_rotulo = o.opl and s.ligacao_tipo = 'op' and s.solicitante_id = c1_uid and s.solicitante_nome = c1_nome
        and s.status = 'solicitado' and s.numero ~ '^TS-[0-9]{5}$' and jsonb_array_length(s.historico) = 1 and s.criado_por = c1_nome and s.data_desejada = hoje + 5 and s.onde is null) = 3,
    'ver terceiros_servicos');
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE lavar de novo', ops[1:1]);
  perform pg_temp.confere('B3 pedir o mesmo tipo para a mesma OP em aberto é barrado (TS001), dizendo o número que já existe', v like 'ERRO TS001%TS-%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE lavar de novo, confirmado', ops[1:1], ', p_permitir_duplicado => true');
  perform pg_temp.confere('B4 confirmando que quer pedir de novo, o pedido passa', pg_temp.n_servicos(v) = 1, v);
  n0 := (select count(*) from public.terceiros_servicos);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE tudo ou nada', p_ligacoes => %L::jsonb)::text$q$, t_lav,
         jsonb_build_array(jsonb_build_object('tipo', 'op', 'id', ops[4]), jsonb_build_object('tipo', 'op', 'id', gen_random_uuid()))::text));
  n := (select count(*) from public.terceiros_servicos);
  perform pg_temp.confere('B5 uma OP inexistente na lista: o pedido inteiro é recusado e nada é gravado', v like 'ERRO%não foi encontrada%' and n = n0, v || ' / antes ' || n0 || ' depois ' || n);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE demais', p_ligacoes => %L::jsonb)::text$q$, t_lav,
         (select jsonb_agg(jsonb_build_object('tipo', 'op', 'id', ops[1])) from generate_series(1, 101))::text));
  perform pg_temp.confere('B6 mais de 100 unidades de uma vez é recusado', v like 'ERRO%no máximo 100%', v);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE x')::text$q$, gen_random_uuid()));
  perform pg_temp.confere('B7 tipo que não existe é recusado', v like 'ERRO%Escolha o tipo%', v);
  v := pg_temp.pedir(c1, t_lav, 'ab');
  perform pg_temp.confere('B8 descrição curta é recusada', v like 'ERRO%Descreva o serviço%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE data passada', null, format(', p_data_desejada => %L', (hoje - 1)::text));
  perform pg_temp.confere('B9 data desejada que já passou é recusada', v like 'ERRO%já passou%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE local ruim', null, ', p_onde => ''lua''');
  perform pg_temp.confere('B10 local fora de "fábrica" ou "prestador" é recusado', v like 'ERRO%local do serviço%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE valor negativo', null, ', p_valor_combinado => -1');
  perform pg_temp.confere('B11 valor combinado negativo é recusado', v like 'ERRO%não pode ser negativo%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE prestador inativo', null, format(', p_prestador_id => %L', pin));
  perform pg_temp.confere('B12 prestador inativo é recusado', v like 'ERRO%inativo%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE peças ruins', null, ', p_pecas => ''{"a":1}''::jsonb');
  perform pg_temp.confere('B13 peças que não vêm em lista são recusadas', v like 'ERRO%peças devem vir em uma lista%', v);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE ligação ruim', p_ligacoes => %L::jsonb)::text$q$, t_lav,
         jsonb_build_array(jsonb_build_object('tipo', 'xyz', 'id', gen_random_uuid()))::text));
  perform pg_temp.confere('B14 ligação que não é OP, OS, demanda nem projeto é recusada', v like 'ERRO%deve ser uma OP, uma OS%', v);
  update public.terceiros_tipos set ativo = false where id = t_out;
  v := pg_temp.pedir(c1, t_out, 'ZZTESTE tipo desativado');
  perform pg_temp.confere('B15 tipo desativado não aceita pedido novo', v like 'ERRO%desativado%', v);
  update public.terceiros_tipos set ativo = true where id = t_out;
  v := pg_temp.pedir(c2, t_out, 'ZZTESTE serviço avulso, sem ligação');
  id_out := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('B16 pedido sem ligação a nada vale (um serviço, sem OP e sem venda)',
    pg_temp.n_servicos(v) = 1 and coalesce((select ligacao_tipo is null and ligacao_id is null and venda_base is null and solicitante_id = c2_uid from public.terceiros_servicos where id = id_out), false), v);
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE película traseira', ops[2:2]);
  pel1 := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('B17 película nasce "na fábrica" (local padrão do tipo) e em A definir',
    coalesce((select onde = 'fabrica' and status = 'solicitado' from public.terceiros_servicos where id = pel1), false), v);
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE película lateral', ops[3:3]);
  pel2 := (pg_temp.ids_de(v))[1];
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE película do teto', ops[4:4]);
  pel3 := (pg_temp.ids_de(v))[1];
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE ligado à OS', p_ligacoes => %L::jsonb)::text$q$, t_out,
         jsonb_build_array(jsonb_build_object('tipo', 'os', 'id', os_id))::text));
  perform pg_temp.confere('B18 pedido ligado a uma OS do SAC guarda o número da OS e nenhuma venda',
    pg_temp.n_servicos(v) = 1 and coalesce((select ligacao_tipo = 'os' and ligacao_rotulo is not null and venda_base is null from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), false), v);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE ligado à demanda', p_ligacoes => %L::jsonb)::text$q$, t_out,
         jsonb_build_array(jsonb_build_object('tipo', 'demanda', 'id', dem_id))::text));
  perform pg_temp.confere('B19 pedido ligado a uma demanda guarda o título dela',
    pg_temp.n_servicos(v) = 1 and coalesce((select ligacao_tipo = 'demanda' and ligacao_rotulo is not null from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), false), v);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, 'ZZTESTE ligado ao projeto', p_ligacoes => %L::jsonb)::text$q$, t_out,
         jsonb_build_array(jsonb_build_object('tipo', 'projeto', 'id', prj_id))::text));
  perform pg_temp.confere('B20 pedido ligado a um projeto do Desenvolvimento guarda o título dele',
    pg_temp.n_servicos(v) = 1 and coalesce((select ligacao_tipo = 'projeto' and ligacao_rotulo is not null from public.terceiros_servicos where id = (pg_temp.ids_de(v))[1]), false), v);
  v := pg_temp.como(c1, format($q$with x as (update public.terceiros_servicos set status = 'realizado' where id = %L returning 1) select count(*)::text from x$q$, id1));
  perform pg_temp.confere('B21 ninguém altera serviço direto na tabela', v like 'ERRO 42501%', v);
  v := pg_temp.como(adm, format($q$with x as (delete from public.terceiros_servicos where id = %L returning 1) select count(*)::text from x$q$, id1));
  perform pg_temp.confere('B22 nem o Admin apaga serviço direto na tabela', v like 'ERRO 42501%', v);

  -- ── C. agendar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.agendar(c1, array[pel1], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C1 quem pediu a película não marca a data (é da Adaptação)', v like 'ERRO 42501%Adaptação%', v);
  v := pg_temp.agendar(c2, array[id1], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C2 outro usuário não agenda o serviço de quem pediu', v like 'ERRO 42501%', v);
  v := pg_temp.agendar(c1, array[id1], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C3 quem pediu a lavagem agenda a própria: fica Agendado com prestador, dia, período e 2ª linha do histórico',
    v not like 'ERRO%' and coalesce((select status = 'agendado' and prestador_id = p1 and data_agendada = hoje + 3 and periodo = 'manha' and (historico -> -1) ->> 'acao' = 'agendado' and jsonb_array_length(historico) = 2
                                       from public.terceiros_servicos where id = id1), false), v);
  v := pg_temp.agendar(ada, array[pel1], p1, hoje + 4, 'tarde', 'solicitado');
  perform pg_temp.confere('C4 a Adaptação agenda a película de quem pediu', v not like 'ERRO%', v);
  update public.terceiros_servicos set status_desde = now() - interval '5 days' where id = id1;
  t_ant := (select status_desde from public.terceiros_servicos where id = id1);
  v := pg_temp.agendar(ger, array[id1], p2, hoje + 6, 'dia_todo', 'agendado', 'cliente pediu outro dia');
  perform pg_temp.confere('C5 o gerente reagenda: o histórico diz "reagendado", o motivo e o dia de antes; a data de entrada na coluna é mantida',
    v not like 'ERRO%' and coalesce((select prestador_id = p2 and data_agendada = hoje + 6 and periodo = 'dia_todo' and status_desde = t_ant and (historico -> -1) ->> 'acao' = 'reagendado'
                                       and (historico -> -1) ->> 'detalhe' like '%antes: %' and (historico -> -1) ->> 'detalhe' like '%Motivo: cliente pediu outro dia%'
                                       from public.terceiros_servicos where id = id1), false), v);
  v := pg_temp.agendar(c1, array[id2], p1, hoje - 1, 'manha', 'solicitado');
  perform pg_temp.confere('C6 data anterior a hoje é recusada', v like 'ERRO%anterior a hoje%', v);
  v := pg_temp.agendar(c1, array[id2], p1, hoje + 3, 'noite', 'solicitado');
  perform pg_temp.confere('C7 período fora de manhã/tarde/dia todo é recusado', v like 'ERRO%Escolha o período%', v);
  v := pg_temp.agendar(c1, array[id2], null, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C8 sem prestador não agenda', v like 'ERRO%Defina o prestador%', v);
  v := pg_temp.agendar(c1, array[id2], pin, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C9 prestador inativo não agenda', v like 'ERRO%inativo%', v);
  v := pg_temp.agendar(c1, array[id2], p1, null, 'manha', 'solicitado');
  perform pg_temp.confere('C10 sem data não agenda', v like 'ERRO%Informe a data%', v);
  v := pg_temp.agendar(c1, '{}'::uuid[], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C11 lista vazia de serviços é recusada', v like 'ERRO%Escolha pelo menos um serviço%', v);
  v := pg_temp.agendar(c1, array[id2], p1, hoje + 3, 'manha', 'agendado');
  perform pg_temp.confere('C12 situação diferente da que a janela mostrava: recusado, pedindo para atualizar a tela', v like 'ERRO%mudou de situação%', v);
  v := pg_temp.agendar(c1, array[id2], p1, hoje + 3, 'manha', 'realizado');
  perform pg_temp.confere('C13 só se agenda serviço em A definir ou Agendado', v like 'ERRO%Só se agenda%', v);
  v := pg_temp.agendar(c1, array[gen_random_uuid()], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C14 serviço que não existe é recusado', v like 'ERRO%não foi encontrado%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE lavagem quatro', ops[5:5]);
  id4 := (pg_temp.ids_de(v))[1];
  v := pg_temp.agendar(c1, array[id4, pel2], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C15 lote com um serviço que a pessoa não pode agendar: nenhum muda (tudo ou nada)',
    v like 'ERRO 42501%' and (select status from public.terceiros_servicos where id = id4) = 'solicitado' and (select status from public.terceiros_servicos where id = pel2) = 'solicitado', v);
  v := pg_temp.agendar(adm, array[id1, id4], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('C16 lote com um serviço em outra situação: nenhum muda (tudo ou nada)',
    v like 'ERRO%mudou de situação%' and (select status from public.terceiros_servicos where id = id4) = 'solicitado', v);
  v := pg_temp.agendar(c1, array[id2, id3, id4], p1, hoje + 3, 'tarde', 'solicitado');
  perform pg_temp.confere('C17 agendar 3 serviços de uma vez (o lote da venda): todos Agendados com o mesmo prestador, dia e período',
    pg_temp.n_lista(v) = 3 and (select count(*) from public.terceiros_servicos where id in (id2, id3, id4) and status = 'agendado' and prestador_id = p1 and data_agendada = hoje + 3 and periodo = 'tarde') = 3, v);

  -- ── D. dar como realizado ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE sem prestador', ops[6:6]);
  id5 := (pg_temp.ids_de(v))[1];
  v := pg_temp.realizar(c1, array[id5], hoje, 100, 'solicitado');
  perform pg_temp.confere('D1 sem prestador não dá como realizado', v like 'ERRO%Defina o prestador%', v);
  v := pg_temp.realizar(c2, array[id1], hoje, 100, 'agendado');
  perform pg_temp.confere('D2 outro usuário não confirma o serviço de quem pediu', v like 'ERRO 42501%', v);
  v := pg_temp.realizar(c1, array[pel1], hoje, 150.5, 'agendado', 'ficou ótimo');
  perform pg_temp.confere('D3 quem pediu a película confirma o Realizado (mesmo a data sendo da Adaptação): guarda o dia, o valor final e quem conferiu',
    v not like 'ERRO%' and coalesce((select status = 'realizado' and data_realizada = hoje and valor_final = 150.50 and conferido_por = c1_nome and conferido_em is not null
                                       and (historico -> -1) ->> 'acao' = 'realizado' and (historico -> -1) ->> 'detalhe' like '%150,50%' and (historico -> -1) ->> 'detalhe' like '%ficou ótimo%'
                                       from public.terceiros_servicos where id = pel1), false), v);
  v := pg_temp.agendar(ada, array[pel2], p1, hoje + 2, 'manha', 'solicitado');
  v := pg_temp.realizar(ada, array[pel2], hoje, 0, 'agendado');
  perform pg_temp.confere('D4 a Adaptação também confirma o Realizado da película de quem pediu; valor zero vale; o autor é a Adaptação',
    v not like 'ERRO%' and coalesce((select status = 'realizado' and valor_final = 0 and conferido_por = ada_nome from public.terceiros_servicos where id = pel2), false), v);
  v := pg_temp.realizar(c1, array[id2], hoje + 1, 10, 'solicitado');
  perform pg_temp.confere('D5 dia de realização no futuro é recusado', v like 'ERRO%no futuro%' or v like 'ERRO%mudou de situação%', v);
  v := pg_temp.realizar(c1, array[id3], hoje + 1, 10, 'agendado');
  perform pg_temp.confere('D6 dia de realização no futuro é recusado (serviço agendado)', v like 'ERRO%no futuro%', v);
  v := pg_temp.realizar(c1, array[id3], hoje - 400, 10, 'agendado');
  perform pg_temp.confere('D7 dia de realização a mais de um ano é recusado (confira a data)', v like 'ERRO%mais de um ano%', v);
  v := pg_temp.realizar(c1, array[id3], hoje, null, 'agendado');
  perform pg_temp.confere('D8 sem valor final não dá como realizado', v like 'ERRO%Informe o valor final%', v);
  v := pg_temp.realizar(c1, array[id3], hoje, -5, 'agendado');
  perform pg_temp.confere('D9 valor final negativo é recusado', v like 'ERRO%não pode ser negativo%', v);
  v := pg_temp.realizar(c1, array[id3], null, 10, 'agendado');
  perform pg_temp.confere('D10 sem o dia em que foi feito não dá como realizado', v like 'ERRO%Informe o dia%', v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE feito sem agenda', null, format(', p_prestador_id => %L', p1));
  id6 := (pg_temp.ids_de(v))[1];
  v := pg_temp.realizar(c1, array[id6], hoje - 1, 99.9, 'solicitado');
  perform pg_temp.confere('D11 de A definir direto para Realizado (já feito sem agenda): a agenda é preenchida com o dia feito e "dia todo"',
    v not like 'ERRO%' and coalesce((select status = 'realizado' and data_agendada = hoje - 1 and periodo = 'dia_todo' and data_realizada = hoje - 1 and valor_final = 99.90 from public.terceiros_servicos where id = id6), false), v);
  v := pg_temp.realizar(c1, array[id6], hoje, 5, 'agendado');
  perform pg_temp.confere('D12 dar como realizado de novo o que já está realizado é recusado (mudou de situação)', v like 'ERRO%mudou de situação%realizado%', v);

  -- ── E. voltar uma coluna ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.voltar(c1, array[id2], 'solicitado', null, 'agendado');
  perform pg_temp.confere('E1 voltar sem motivo é recusado', v like 'ERRO%Informe o motivo%', v);
  v := pg_temp.voltar(c1, array[id2], 'solicitado', 'abc', 'agendado');
  perform pg_temp.confere('E2 voltar com motivo de 3 letras é recusado (mínimo 5)', v like 'ERRO%Informe o motivo%', v);
  v := pg_temp.agendar(ada, array[pel3], p2, hoje + 7, 'dia_todo', 'solicitado');
  v := pg_temp.voltar(c1, array[pel3], 'solicitado', 'quero outra data', 'agendado');
  perform pg_temp.confere('E3 quem pediu a película não tira a data dela (é da Adaptação)', v like 'ERRO 42501%', v);
  v := pg_temp.voltar(ada, array[pel3], 'solicitado', 'cliente adiou', 'agendado');
  perform pg_temp.confere('E4 a Adaptação volta a película para A definir: tira dia e período, mantém o prestador, registra "voltou"',
    v not like 'ERRO%' and coalesce((select status = 'solicitado' and data_agendada is null and periodo is null and prestador_id = p2 and (historico -> -1) ->> 'acao' = 'voltou' and (historico -> -1) ->> 'detalhe' like '%cliente adiou%'
                                       from public.terceiros_servicos where id = pel3), false), v);
  v := pg_temp.voltar(c1, array[id2], 'solicitado', 'a oficina remarcou', 'agendado');
  perform pg_temp.confere('E5 quem pediu a lavagem volta a própria para A definir', v not like 'ERRO%' and coalesce((select status = 'solicitado' and data_agendada is null from public.terceiros_servicos where id = id2), false), v);
  v := pg_temp.voltar(c1, array[pel1], 'agendado', 'valor lançado errado', 'realizado');
  perform pg_temp.confere('E6 quem pediu reabre o Realizado: some valor final, dia e quem conferiu; a agenda fica; o histórico guarda o que estava lançado',
    v not like 'ERRO%' and coalesce((select status = 'agendado' and valor_final is null and conferido_por is null and conferido_em is null and data_realizada is null and data_agendada is not null and prestador_id is not null
                                       and (historico -> -1) ->> 'acao' = 'reaberto' and (historico -> -1) ->> 'detalhe' like '%150,50%' and (historico -> -1) ->> 'detalhe' like '%valor lançado errado%'
                                       from public.terceiros_servicos where id = pel1), false), v);
  v := pg_temp.voltar(c2, array[id6], 'agendado', 'não era para estar feito', 'realizado');
  perform pg_temp.confere('E7 outro usuário não reabre o serviço de quem pediu', v like 'ERRO 42501%', v);
  v := pg_temp.voltar(c1, array[id2], 'agendado', 'motivo valido', 'solicitado');
  perform pg_temp.confere('E8 só se volta de Agendado para A definir ou de Realizado para Agendado', v like 'ERRO%Só dá para voltar%', v);

  -- ── F. cancelar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.cancelar(c1, array[id2], '', 'solicitado');
  perform pg_temp.confere('F1 cancelar sem motivo é recusado', v like 'ERRO%motivo do cancelamento%', v);
  v := pg_temp.cancelar(c2, array[id2], 'não é meu mas cancelo', 'solicitado');
  perform pg_temp.confere('F2 outro usuário não cancela o serviço de quem pediu', v like 'ERRO 42501%', v);
  v := pg_temp.cancelar(c1, array[id2], 'pedido duplicado', 'solicitado');
  perform pg_temp.confere('F3 quem pediu cancela: guarda motivo, quem e quando, e o histórico diz "cancelado"',
    v not like 'ERRO%' and coalesce((select status = 'cancelado' and cancelado_motivo = 'pedido duplicado' and cancelado_por = c1_nome and cancelado_em is not null and (historico -> -1) ->> 'acao' = 'cancelado'
                                       from public.terceiros_servicos where id = id2), false), v);
  v := pg_temp.cancelar(c1, array[id6], 'quero cancelar o feito', 'realizado');
  perform pg_temp.confere('F4 serviço realizado não se cancela (precisa ser reaberto antes)', v like 'ERRO%Só se cancela%', v);
  v := pg_temp.agendar(c1, array[id2], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('F5 serviço cancelado não se agenda (mudou de situação, agora cancelado)', v like 'ERRO%mudou de situação%cancelado%', v);
  v := pg_temp.atualizar(c1, id2, '{"descricao":"nova descrição"}'::jsonb, 'cancelado');
  perform pg_temp.confere('F6 serviço cancelado não se altera (já está encerrado)', v like 'ERRO%já está encerrado%', v);
  v := pg_temp.cancelar(adm, array[id_out], 'não precisa mais', 'solicitado');
  perform pg_temp.confere('F7 o Admin cancela o serviço de qualquer pessoa', v not like 'ERRO%' and (select status from public.terceiros_servicos where id = id_out) = 'cancelado', v);

  -- ── G. alterar os dados do pedido ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.atualizar(c1, id3, '{"status":"realizado"}'::jsonb, 'agendado');
  perform pg_temp.confere('G1 campo que não é do pedido (situação) não se altera por aqui', v like 'ERRO%não pode ser alterado%', v);
  v := pg_temp.atualizar(c1, id3, '{"descricao":"ZZTESTE nova descrição","valor_combinado":120.5,"observacao":"trazer a chave"}'::jsonb, 'agendado');
  perform pg_temp.confere('G2 quem pediu altera descrição, valor combinado e observação; o histórico diz o que mudou, do valor de antes ao de agora',
    v not like 'ERRO%' and coalesce((select descricao = 'ZZTESTE nova descrição' and valor_combinado = 120.50 and observacao = 'trazer a chave' and (historico -> -1) ->> 'acao' = 'alterado'
                                       and (historico -> -1) ->> 'detalhe' like '%descrição%' and (historico -> -1) ->> 'detalhe' like '%valor combinado: sem valor → 120,50%'
                                       from public.terceiros_servicos where id = id3), false), v);
  v := pg_temp.atualizar(c2, id3, '{"descricao":"ZZTESTE invasão"}'::jsonb, 'agendado');
  perform pg_temp.confere('G3 outro usuário não altera o pedido de quem pediu', v like 'ERRO 42501%', v);
  h0 := (select jsonb_array_length(historico) from public.terceiros_servicos where id = id3);
  v := pg_temp.atualizar(c1, id3, '{"descricao":"ZZTESTE nova descrição","valor_combinado":120.5,"observacao":"trazer a chave"}'::jsonb, 'agendado');
  h1 := (select jsonb_array_length(historico) from public.terceiros_servicos where id = id3);
  perform pg_temp.confere('G4 repetir a mesma alteração não mexe no histórico (nada mudou)', v not like 'ERRO%' and h0 = h1, v || ' / ' || h0 || ' → ' || h1);
  v := pg_temp.atualizar(c1, id3, '{"prestador_id":null}'::jsonb, 'agendado');
  perform pg_temp.confere('G5 tirar o prestador de um serviço agendado pede para voltar a A definir antes', v like 'ERRO%volte o serviço%', v);
  v := pg_temp.atualizar(c1, id3, format('{"prestador_id":"%s"}', p2)::jsonb, 'agendado');
  perform pg_temp.confere('G6 trocar o prestador de um serviço agendado vale e aparece no histórico', v not like 'ERRO%' and coalesce((select prestador_id = p2 and (historico -> -1) ->> 'detalhe' like '%prestador:%' from public.terceiros_servicos where id = id3), false), v);
  v := pg_temp.atualizar(c1, id3, format('{"prestador_id":"%s"}', pin)::jsonb, 'agendado');
  perform pg_temp.confere('G7 prestador inativo não vale', v like 'ERRO%inativo%', v);
  v := pg_temp.atualizar(c1, id3, format('{"data_desejada":"%s"}', hoje - 3)::jsonb, 'agendado');
  perform pg_temp.confere('G8 data desejada que já passou é recusada', v like 'ERRO%já passou%', v);
  v := pg_temp.atualizar(c1, id3, '{"descricao":"ZZTESTE x"}'::jsonb, 'solicitado');
  perform pg_temp.confere('G9 alterar com a situação errada é recusado (mudou de situação)', v like 'ERRO%mudou de situação%', v);

  -- ── H. "Ver como": o banco aplica as regras à pessoa vista ─────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.como(adm, format($q$select public.ver_como_iniciar(%L)::text$q$, c1_email), 'teste-vc');
  perform pg_temp.confere('H1 o Admin passa a ver o sistema como um usuário comum', v like '%nome%', v);
  v := pg_temp.pedir(adm, t_lav, 'ZZTESTE pedido vendo como', null, '', 'teste-vc');
  id_h := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('H2 pedido feito pelo Admin vendo como X vale como pedido de X; o autor real fica no histórico "(vendo como X)"',
    coalesce((select solicitante_id = c1_uid and solicitante_nome = c1_nome and criado_por like '% (vendo como %)' and (historico -> 0) ->> 'por' like '% (vendo como %)' from public.terceiros_servicos where id = id_h), false), v);
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE película do Ver como');
  id_h2 := (pg_temp.ids_de(v))[1];
  v := pg_temp.agendar(adm, array[id_h2], p1, hoje + 3, 'manha', 'solicitado', null, 'teste-vc');
  perform pg_temp.confere('H3 vendo como um usuário comum, o Admin NÃO marca a data de uma película (as regras valem para a pessoa vista)', v like 'ERRO 42501%', v);
  v := pg_temp.agendar(adm, array[id_h2], p1, hoje + 3, 'manha', 'solicitado');
  perform pg_temp.confere('H4 o mesmo Admin, sem o Ver como, marca a data', v not like 'ERRO%', v);

  -- ── I. as travas do próprio banco ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  begin
    insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome, status) values (t_lav, 'ZZTESTE sem agenda', 'x', 'agendado');
    perform pg_temp.confere('I1 "agendado" sem prestador, dia e período é barrado pelo banco', false, 'gravou');
  exception when check_violation then
    perform pg_temp.confere('I1 "agendado" sem prestador, dia e período é barrado pelo banco', true);
  end;
  begin
    insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome, status, prestador_id, data_agendada, periodo) values (t_lav, 'ZZTESTE sem valor', 'x', 'realizado', p1, hoje, 'manha');
    perform pg_temp.confere('I2 "realizado" sem valor final nem quem conferiu é barrado pelo banco', false, 'gravou');
  exception when check_violation then
    perform pg_temp.confere('I2 "realizado" sem valor final nem quem conferiu é barrado pelo banco', true);
  end;
  begin
    insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome, status) values (t_lav, 'ZZTESTE sem motivo', 'x', 'cancelado');
    perform pg_temp.confere('I3 "cancelado" sem motivo é barrado pelo banco', false, 'gravou');
  exception when check_violation then
    perform pg_temp.confere('I3 "cancelado" sem motivo é barrado pelo banco', true);
  end;
  begin
    insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome, ligacao_tipo) values (t_lav, 'ZZTESTE ligação pela metade', 'x', 'op');
    perform pg_temp.confere('I4 tipo de ligação sem o registro ligado é barrado pelo banco', false, 'gravou');
  exception when check_violation then
    perform pg_temp.confere('I4 tipo de ligação sem o registro ligado é barrado pelo banco', true);
  end;
  insert into public.terceiros_servicos (tipo_id, descricao, solicitante_nome) values (t_lav, 'ZZTESTE numeração', 'x') returning numero into v;
  perform pg_temp.confere('I5 o número TS-00000 é dado pelo banco quando não vem', v ~ '^TS-[0-9]{5}$', v);

  raise exception E'TESTE DAS REGRAS (Serviços de terceiros, T1) — % verificações, % falha(s)\n%',
    coalesce(current_setting('terceiros_teste.total', true), '0'), coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0'), current_setting('terceiros_teste.rel', true);
end
$t$;
rollback;
