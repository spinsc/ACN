-- TESTE DAS REGRAS DO BANCO — Serviços de terceiros, fatia T3 (23/11/2026): o ramo dos serviços no Calendário integrado e o alerta de serviço atrasado.
-- Mesmo método dos testes da T1 e da T2: roda inteiro no execute_sql (projeto qgemelnuqdilnggxmrdw); cada pessoa (Admin, gerente, Adaptação e dois usuários comuns, escolhidos entre as REAIS por perfil
-- e aba) age pelo papel "authenticated" com o crachá dela, como o navegador. O relatório vem NA MENSAGEM DE ERRO "TESTE ..." porque tudo é desfeito no fim: nada fica gravado.
-- Para testar ANTES de aplicar a migração, cole terceiros_servicos_t3.sql no lugar marcado abaixo (vira parte da mesma transação e também é desfeita); depois de aplicada, deixe o lugar vazio.
-- A única coisa que não volta sozinha é o contador do número (TS-00001): depois de rodar, `select setval('public.terceiros_servico_seq', 1, false);` — só enquanto não houver serviço de verdade.
begin;

-- >>> MIGRAÇÃO EM ENSAIO (opcional): cole aqui o conteúdo de terceiros_servicos_t3.sql <<<

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

create function pg_temp.ids_de(p text) returns uuid[] language plpgsql as $f$
begin
  if p is null or p like 'ERRO%' then return '{}'; end if;
  return coalesce((select array_agg((e ->> 'id')::uuid order by e ->> 'numero') from jsonb_array_elements(p::jsonb -> 'servicos') e), '{}');
end $f$;

create function pg_temp.pedir(p_quem uuid, p_tipo uuid, p_desc text, p_ops uuid[] default null, p_extra text default '') returns text language plpgsql as $f$
declare v_ligs jsonb;
begin
  v_ligs := coalesce((select jsonb_agg(jsonb_build_object('tipo', 'op', 'id', o)) from unnest(p_ops) o), '[]'::jsonb);
  return pg_temp.como(p_quem, format($q$select public.terceiros_solicitar(%L, %L, p_ligacoes => %L::jsonb%s)::text$q$, p_tipo, p_desc, v_ligs::text, p_extra));
end $f$;

create function pg_temp.agendar(p_quem uuid, p_ids uuid[], p_prest uuid, p_data date, p_periodo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_agendar(%L::uuid[], %L::uuid, %L::date, %L, %L)::text$q$, p_ids, p_prest, p_data, p_periodo, p_esp));
end $f$;

create function pg_temp.realizar(p_quem uuid, p_ids uuid[], p_data date, p_valor numeric, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_realizar(%L::uuid[], %L::date, %L::numeric, %L)::text$q$, p_ids, p_data, p_valor, p_esp));
end $f$;

create function pg_temp.cancelar(p_quem uuid, p_ids uuid[], p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_cancelar(%L::uuid[], %L, %L)::text$q$, p_ids, p_motivo, p_esp));
end $f$;

-- os eventos do calendário (a base inteira, como o servidor a lê) que são destes serviços: o `ref_id` de uma visita é o menor id dos serviços dela
create function pg_temp.eventos(p_ini date, p_fim date, p_ids uuid[]) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.dia, b.titulo), '[]'::jsonb)
    from public.calendario_eventos_base(p_ini, p_fim) b
   where b.fonte in ('terceiro_servico', 'terceiro_desejado') and b.ref_id = any (select x::text from unnest(p_ids) x)
$f$;

do $t$
declare
  adm uuid; ger uuid; ada uuid; c1 uuid; c2 uuid;
  c1_uid uuid; c1_email text; c2_uid uuid; c2_email text; ada_email text; adm_email text;
  t_pel uuid; t_lav uuid; t_fun uuid; t_mec uuid;
  p1 uuid; p2 uuid;
  v_venda text; ops uuid[];
  v text; ids uuid[]; s1 uuid; s2 uuid; s3 uuid; b1 uuid; b2 uuid; b3 uuid; l1 uuid; d1 uuid; m1 uuid;
  todos uuid[] := '{}'; ev jsonb; n int; t0 timestamptz; ms numeric;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- ── as pessoas e os dados que o teste usa ────────────────────────────────────────────────────────────────────────────────────────────────────
  select auth_id, lower(trim(email)) into adm, adm_email from public.auth_usuarios where perfil = 'Admin' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ger from public.auth_usuarios where perfil ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id, lower(trim(email)) into ada, ada_email from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and coalesce(abas_permitidas, '[]'::jsonb) ? 'producao' order by id limit 1;
  select auth_id, id, lower(trim(email)) into c1, c1_uid, c1_email from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null and lower(email) not like '%@teste.acn.invalid'
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') order by id limit 1;
  select auth_id, id, lower(trim(email)) into c2, c2_uid, c2_email from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null and lower(email) not like '%@teste.acn.invalid'
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') and auth_id <> c1 order by id desc limit 1;
  select id into t_pel from public.terceiros_tipos where nome_norm = 'pelicula';
  select id into t_lav from public.terceiros_tipos where nome_norm = 'lavagem';
  select id into t_fun from public.terceiros_tipos where nome_norm = 'funilaria';
  select id into t_mec from public.terceiros_tipos where nome_norm = 'mecanica';
  select q.vb, array_agg(q.id order by q.opl) into v_venda, ops
    from (select id, opl, regexp_replace(opl, '/[0-9]+$', '') as vb from public.oples where excluida_em is null and opl ~ '/[0-9]+$') q
   group by q.vb having count(*) >= 6 order by q.vb limit 1;
  perform pg_temp.confere('00 pessoas (Admin, gerente, Adaptação, dois comuns) e uma venda real com 6+ unidades para ligar',
    adm is not null and ger is not null and ada is not null and c1 is not null and c2 is not null and ops is not null
    and t_pel is not null and t_lav is not null and t_fun is not null and t_mec is not null,
    format('adm=%s ger=%s ada=%s c1=%s c2=%s ops=%s', adm, ger, ada, c1, c2, ops is not null));
  if adm is null or ger is null or ada is null or c1 is null or c2 is null or ops is null or t_pel is null or t_lav is null or t_fun is null or t_mec is null then
    raise exception E'TESTE ABORTADO: faltou pessoa ou dado para o teste\n%', current_setting('terceiros_teste.rel', true);
  end if;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T3 Prestador Um', 'zzteste t3 prestador um') returning id into p1;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T3 Prestador Dois', 'zzteste t3 prestador dois') returning id into p2;

  -- ── N. a forma das funções ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform pg_temp.confere('N1 a função dos eventos dos serviços é fechada a quem entrou e à chave pública (só o servidor a chama)',
    not has_function_privilege('authenticated', 'public.calendario_eventos_terceiros(date, date)', 'execute')
    and not has_function_privilege('anon', 'public.calendario_eventos_terceiros(date, date)', 'execute'));
  perform pg_temp.confere('N2 a base do calendário junta o ramo dos serviços',
    pg_get_functiondef('public.calendario_eventos_base(date, date)'::regprocedure) like '%calendario_eventos_terceiros%');
  perform pg_temp.confere('N3 a rotina de alertas leva o aviso do serviço para a aba "terceiros"',
    pg_get_functiondef('public.calendario_alvos(date)'::regprocedure) like '%when ''terceiro_servico'' then ''terceiros''%');
  perform pg_temp.confere('N4 a rotina de alertas continua fechada a quem entrou e à chave pública',
    not has_function_privilege('authenticated', 'public.calendario_alvos(date)', 'execute') and not has_function_privilege('anon', 'public.calendario_alvos(date)', 'execute'));

  -- ── A. serviço agendado: UM evento por visita ───────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE T3 películas do primeiro grupo', ops[1:3]);
  ids := pg_temp.ids_de(v);
  s1 := ids[1]; s2 := ids[2]; s3 := ids[3];
  todos := todos || ids;
  perform pg_temp.confere('A0 pedir 3 películas (uma venda) como usuário comum', pg_temp.n_servicos(v) = 3, v);
  v := pg_temp.agendar(ada, array[s1, s2, s3], p1, hoje + 2, 'manha', 'solicitado');
  perform pg_temp.confere('A0b a Adaptação agenda as 3 películas no mesmo prestador, dia e período', pg_temp.n_servicos(v) = 3 or (v is not null and v not like 'ERRO%'), v);
  ev := pg_temp.eventos(hoje, hoje + 10, todos);
  perform pg_temp.confere('A1 as 3 películas do mesmo prestador, dia e período são UM evento (3 carros), com alerta, no dia agendado, na aba "terceiros"',
    jsonb_array_length(ev) = 1 and ev -> 0 ->> 'fonte' = 'terceiro_servico' and (ev -> 0 -> 'extra' ->> 'carros')::int = 3 and (ev -> 0 ->> 'titulo') like 'Película — 3 carros da venda %'
    and (ev -> 0 ->> 'alerta')::boolean and not (ev -> 0 ->> 'concluido')::boolean and (ev -> 0 ->> 'dia')::date = hoje + 2 and ev -> 0 ->> 'aba_destino' = 'terceiros'
    and ev -> 0 ->> 'ref_id' = (select min(x::text) from unnest(array[s1, s2, s3]) x), ev::text);
  perform pg_temp.confere('A2 o evento da película vai a quem pediu e à equipe da Adaptação (o tipo é dela)',
    ev -> 0 -> 'emails' ? c1_email and ev -> 0 -> 'emails' ? ada_email, ev -> 0 ->> 'emails');
  perform pg_temp.confere('A2b o detalhe diz o prestador e o período', (ev -> 0 ->> 'detalhe') = 'Serviço de terceiro · ZZTESTE T3 Prestador Um · manhã', ev -> 0 ->> 'detalhe');

  v := pg_temp.pedir(c2, t_lav, 'ZZTESTE T3 lavagem de um carro da mesma venda', ops[1:1]);
  l1 := (pg_temp.ids_de(v))[1];
  todos := todos || l1;
  v := pg_temp.agendar(c2, array[l1], p1, hoje + 2, 'dia_todo', 'solicitado');
  perform pg_temp.confere('A3a quem pediu a lavagem agenda (o tipo é dele)', v not like 'ERRO%', v);
  ev := pg_temp.eventos(hoje, hoje + 10, array[l1]);
  perform pg_temp.confere('A3 a lavagem da MESMA venda e do mesmo dia é outro evento (outro tipo), só de quem pediu: sem a Adaptação e sem quem pediu a película',
    jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'titulo') like 'Lavagem — TS-%' and ev -> 0 -> 'emails' ? c2_email and not (ev -> 0 -> 'emails' ? ada_email)
    and not (ev -> 0 -> 'emails' ? c1_email), ev::text);

  -- agrupamento: o mesmo prestador e dia, mas outro prestador ou outro período, separa a visita (como o Quadro)
  v := pg_temp.pedir(c1, t_pel, 'ZZTESTE T3 películas do segundo grupo', ops[4:6]);
  ids := pg_temp.ids_de(v);
  b1 := ids[1]; b2 := ids[2]; b3 := ids[3];
  todos := todos || ids;
  v := pg_temp.agendar(ada, array[b1, b2, b3], p1, hoje + 3, 'manha', 'solicitado');
  ev := pg_temp.eventos(hoje, hoje + 10, array[b1, b2, b3]);
  perform pg_temp.confere('A4 o segundo grupo, todo no mesmo prestador, dia e período, é um evento só (3 carros)', jsonb_array_length(ev) = 1 and (ev -> 0 -> 'extra' ->> 'carros')::int = 3, ev::text);
  v := pg_temp.agendar(ada, array[b3], p2, hoje + 3, 'manha', 'agendado');
  ev := pg_temp.eventos(hoje, hoje + 10, array[b1, b2, b3]);
  perform pg_temp.confere('A5 um carro que passa para outro prestador vira evento próprio (2 carros + 1 carro)',
    jsonb_array_length(ev) = 2 and (select array_agg((e -> 'extra' ->> 'carros')::int order by (e -> 'extra' ->> 'carros')::int) from jsonb_array_elements(ev) e) = array[1, 2], ev::text);
  v := pg_temp.agendar(ada, array[b2], p1, hoje + 3, 'tarde', 'agendado');
  ev := pg_temp.eventos(hoje, hoje + 10, array[b1, b2, b3]);
  perform pg_temp.confere('A6 um carro que passa para outro período vira evento próprio (3 eventos de 1 carro)',
    jsonb_array_length(ev) = 3 and (select bool_and((e -> 'extra' ->> 'carros')::int = 1) from jsonb_array_elements(ev) e), ev::text);

  -- ── B. pedido ainda em "A definir" com data desejada, e o que NÃO entra ─────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c2, t_fun, 'ZZTESTE T3 funilaria com data desejada', ops[2:2], format(', p_data_desejada => %L::date', hoje + 4));
  d1 := (pg_temp.ids_de(v))[1];
  todos := todos || d1;
  ev := pg_temp.eventos(hoje, hoje + 10, array[d1]);
  perform pg_temp.confere('B1 o pedido em "A definir" com data desejada aparece como outra fonte (terceiro_desejado), SEM alerta, no dia desejado',
    jsonb_array_length(ev) = 1 and ev -> 0 ->> 'fonte' = 'terceiro_desejado' and not (ev -> 0 ->> 'alerta')::boolean and not (ev -> 0 ->> 'concluido')::boolean
    and (ev -> 0 ->> 'dia')::date = hoje + 4 and (ev -> 0 ->> 'detalhe') like 'Data desejada do pedido%', ev::text);
  v := pg_temp.pedir(c2, t_mec, 'ZZTESTE T3 mecânica sem data', ops[3:3]);
  m1 := (pg_temp.ids_de(v))[1];
  todos := todos || m1;
  perform pg_temp.confere('B2 o pedido sem data desejada não aparece no calendário', jsonb_array_length(pg_temp.eventos(hoje - 400, hoje + 400, array[m1])) = 0);
  v := pg_temp.cancelar(c2, array[d1], 'ZZTESTE cancelado no teste', 'solicitado');
  perform pg_temp.confere('B3 o pedido cancelado sai do calendário', v not like 'ERRO%' and jsonb_array_length(pg_temp.eventos(hoje - 400, hoje + 400, array[d1])) = 0, v);

  -- ── C. serviço atrasado: o alerta (a rotina das 8h) e quem o recebe ─────────────────────────────────────────────────────────────────────────
  update public.terceiros_servicos set data_agendada = hoje - 3 where id = any (array[s1, s2, s3, l1]);   -- como superusuário, só no teste: o banco recusa agendar no passado
  ev := pg_temp.eventos(hoje - 15, hoje, array[s1, s2, s3, l1]);
  perform pg_temp.confere('C1 o serviço atrasado continua no dia em que foi agendado, com alerta e sem estar concluído',
    jsonb_array_length(ev) = 2 and (select bool_and((e ->> 'dia')::date = hoje - 3 and (e ->> 'alerta')::boolean and not (e ->> 'concluido')::boolean) from jsonb_array_elements(ev) e), ev::text);
  select count(*) into n from public.calendario_alvos(hoje) a where a.fonte = 'terceiro_servico' and a.ref_id = (select min(x::text) from unnest(array[s1, s2, s3]) x) and a.usuario_id = c1_uid;
  perform pg_temp.confere('C2 quem pediu as 3 películas recebe UM aviso (não um por carro), de 3 dias de atraso, na aba "terceiros"',
    n = 1 and exists (select 1 from public.calendario_alvos(hoje) a where a.fonte = 'terceiro_servico' and a.usuario_id = c1_uid and a.dias_atraso = 3 and a.aba_destino = 'terceiros'
                       and a.texto_pronto is null and a.titulo like 'Película — 3 carros da venda %'), n::text);
  select count(*) into n from public.calendario_alvos(hoje) a where a.fonte = 'terceiro_servico' and a.ref_id = l1::text and a.usuario_id = c2_uid;
  perform pg_temp.confere('C3 quem pediu a lavagem recebe o aviso dela', n = 1, n::text);
  select count(*) into n from public.calendario_alvos(hoje) a where a.fonte = 'terceiro_servico' and a.ref_id = l1::text and a.usuario_id = c1_uid;
  perform pg_temp.confere('C4 quem pediu só a película NÃO recebe o aviso da lavagem de outra pessoa', n = 0, n::text);
  perform pg_temp.confere('C5 a equipe real da Adaptação (a aba producao, fora o Admin) recebe o aviso da película atrasada',
    exists (select 1 from public.calendario_alvos(hoje) a join public.auth_usuarios u on u.id = a.usuario_id
             where a.fonte = 'terceiro_servico' and a.ref_id = (select min(x::text) from unnest(array[s1, s2, s3]) x)
               and u.perfil <> 'Admin' and coalesce(u.abas_permitidas, '[]'::jsonb) ? 'producao'));
  perform pg_temp.confere('C6 o Admin não recebe o aviso de serviço de outra pessoa (vê tudo pelo botão "Todos os usuários")',
    not exists (select 1 from public.calendario_alvos(hoje) a join public.auth_usuarios u on u.id = a.usuario_id where a.fonte = 'terceiro_servico' and u.perfil = 'Admin'));
  perform pg_temp.confere('C7 a lavagem atrasada não vai à Adaptação (o tipo não é dela)',
    not exists (select 1 from public.calendario_alvos(hoje) a join public.auth_usuarios u on u.id = a.usuario_id
                 where a.fonte = 'terceiro_servico' and a.ref_id = l1::text and u.id <> c2_uid));

  -- a rotina de verdade cria o aviso no painel Avisos (mencoes, contexto `calendario`); aqui só se confere a contagem e que a chave é a esperada
  begin
    v := public.calendario_avisar()::text;
  exception when others then
    v := 'ERRO ' || sqlstate || ': ' || sqlerrm;
  end;
  perform pg_temp.confere('C8 a rotina das 8h roda sem erro com o ramo novo (o que ela cria é desfeito no fim do teste)', v is not null and v not like 'ERRO%', v);
  if extract(isodow from hoje) <= 5 then
    perform pg_temp.confere('C9 a chave do aviso é terceiro_servico:<primeiro id>:<dia agendado>, para quem pediu',
      exists (select 1 from public.mencoes m where m.contexto = 'calendario' and m.mencionado_id = c1_uid::text and not m.resolvida
               and m.contexto_id = 'terceiro_servico:' || (select min(x::text) from unnest(array[s1, s2, s3]) x) || ':' || (hoje - 3)::text and m.aba_destino = 'terceiros'),
      (select string_agg(m.contexto_id, ' | ') from public.mencoes m where m.contexto = 'calendario' and m.mencionado_id = c1_uid::text and not m.resolvida));
  else
    perform pg_temp.confere('C9 (fim de semana: a rotina não cria aviso; conferido só nos dias úteis)', true);
  end if;

  -- ── D. realizado: o aviso some e o evento fica esmaecido ────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.realizar(c2, array[l1], hoje - 1, 80, 'agendado');
  perform pg_temp.confere('D0 quem pediu dá a lavagem como realizada', v not like 'ERRO%', v);
  ev := pg_temp.eventos(hoje - 15, hoje + 10, array[l1]);
  perform pg_temp.confere('D1 o realizado aparece no dia em que foi feito, concluído e SEM alerta',
    jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'dia')::date = hoje - 1 and (ev -> 0 ->> 'concluido')::boolean and not (ev -> 0 ->> 'alerta')::boolean
    and (ev -> 0 ->> 'detalhe') like 'Serviço de terceiro realizado%', ev::text);
  select count(*) into n from public.calendario_alvos(hoje) a where a.fonte = 'terceiro_servico' and a.ref_id = l1::text;
  perform pg_temp.confere('D2 realizado, o serviço sai da lista de alertas', n = 0, n::text);

  -- ── E. quem vê o quê no Calendário (a função da tela) ───────────────────────────────────────────────────────────────────────────────────────
  update public.terceiros_servicos set data_agendada = hoje + 2 where id = any (array[s1, s2, s3]);
  v := pg_temp.como(c1, format($q$select count(*)::text from public.calendario_eventos(%L::date, %L::date) e where e.fonte = 'terceiro_servico' and e.ref_id = any (%L::text[])$q$, hoje, hoje + 10, (select array_agg(x::text) from unnest(todos) x)));
  perform pg_temp.confere('E1 quem pediu as películas vê as 4 visitas delas (1º grupo: 1; 2º grupo: 3) e não vê a lavagem de outra pessoa', v = '4', v);
  v := pg_temp.como(ada, format($q$select count(*)::text from public.calendario_eventos(%L::date, %L::date) e where e.fonte = 'terceiro_servico' and e.ref_id = any (%L::text[])$q$, hoje, hoje + 10, (select array_agg(x::text) from unnest(todos) x)));
  perform pg_temp.confere('E2 a Adaptação vê as mesmas 4 visitas das películas (o tipo é dela) e não vê a lavagem de outra pessoa', v = '4', v);
  v := pg_temp.como(adm, format($q$select count(*)::text from public.calendario_eventos(%L::date, %L::date, true) e where e.fonte = 'terceiro_servico' and e.ref_id = any (%L::text[])$q$, hoje - 15, hoje + 10, (select array_agg(x::text) from unnest(todos) x)));
  perform pg_temp.confere('E3 o Admin vê todos com "Todos os usuários": 1º grupo + 3 visitas do 2º + a lavagem realizada', v = '5', v);
  v := pg_temp.como(c2, format($q$select count(*)::text from public.calendario_eventos(%L::date, %L::date) e where e.fonte = 'terceiro_servico' and e.ref_id = any (%L::text[])$q$, hoje, hoje + 10, (select array_agg(x::text) from unnest(todos) x)));
  perform pg_temp.confere('E4 quem pediu só a lavagem não vê as películas (e a lavagem realizada fica fora desta janela)', v = '0', v);

  -- ── F. custo: o calendário de três meses com o ramo novo ────────────────────────────────────────────────────────────────────────────────────
  t0 := clock_timestamp();
  perform count(*) from public.calendario_eventos_base(hoje - 30, hoje + 60);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.confere(format('F1 a base do calendário de 3 meses responde em até 500 ms (deu %s ms)', round(ms)), ms <= 500);

  raise exception E'TESTE DAS REGRAS (Serviços de terceiros, T3) — % verificações, % falha(s)\n%',
    coalesce(current_setting('terceiros_teste.total', true), '0'), coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0'), current_setting('terceiros_teste.rel', true);
end
$t$;
rollback;
