-- TESTE DAS REGRAS DO BANCO — Serviços de terceiros, fatia T4 (23/11/2026): o modelo do contrato e a ordem de serviço em lote da pintura eletrostática.
-- Mesmo método dos testes da T1 a T3: roda inteiro no execute_sql (projeto qgemelnuqdilnggxmrdw); cada pessoa (Admin, gerente, Adaptação e dois usuários comuns, escolhidos entre as REAIS por perfil e aba)
-- age pelo papel "authenticated" com o crachá dela, como o navegador. O relatório vem NA MENSAGEM DE ERRO "TESTE ..." porque tudo é desfeito no fim: nada fica gravado (nem o modelo do contrato).
-- Para testar ANTES de aplicar a migração, cole terceiros_servicos_t4.sql no lugar marcado abaixo (vira parte da mesma transação e também é desfeita); depois de aplicada, deixe o lugar vazio.
-- A única coisa que não volta sozinha são os contadores dos números (TS-00001 e OT-00001): depois de rodar, `select setval('public.terceiros_servico_seq', 1, false); select setval('public.terceiros_ordem_seq', 1, false);`
-- — só enquanto não houver serviço nem ordem de verdade.
begin;

-- >>> MIGRAÇÃO EM ENSAIO (opcional): cole aqui o conteúdo de terceiros_servicos_t4.sql <<<

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

-- a resposta foi uma recusa que diz este trecho?
create function pg_temp.recusou(v text, trecho text) returns boolean language sql as $f$
  select v like 'ERRO%' and position(lower(trecho) in lower(v)) > 0
$f$;

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

-- o id da ordem que uma resposta de função da ordem devolveu ({ordem, servicos})
create function pg_temp.ordem_de(p text) returns uuid language plpgsql as $f$
begin
  if p is null or p like 'ERRO%' then return null; end if;
  return (p::jsonb -> 'ordem' ->> 'id')::uuid;
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

create function pg_temp.voltar(p_quem uuid, p_ids uuid[], p_para text, p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_voltar(%L::uuid[], %L, %L, %L)::text$q$, p_ids, p_para, p_motivo, p_esp));
end $f$;

create function pg_temp.cancelar(p_quem uuid, p_ids uuid[], p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_cancelar(%L::uuid[], %L, %L)::text$q$, p_ids, p_motivo, p_esp));
end $f$;

create function pg_temp.atualizar(p_quem uuid, p_id uuid, p_dados text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_atualizar(%L::uuid, %L::jsonb, %L)::text$q$, p_id, p_dados, p_esp));
end $f$;

create function pg_temp.atualizar_varios(p_quem uuid, p_ids uuid[], p_dados text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_atualizar_varios(%L::uuid[], %L::jsonb, %L)::text$q$, p_ids, p_dados, p_esp));
end $f$;

-- as funções da ordem
create function pg_temp.o_montar(p_quem uuid, p_ids uuid[], p_prest uuid, p_envio date, p_ret date, p_obs text default null) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_montar(%L::uuid[], %L::uuid, %L::date, %L::date, %L)::text$q$, p_ids, p_prest, p_envio, p_ret, p_obs));
end $f$;

create function pg_temp.o_incluir(p_quem uuid, p_ordem uuid, p_ids uuid[], p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_incluir(%L::uuid, %L::uuid[], %L)::text$q$, p_ordem, p_ids, p_esp));
end $f$;

create function pg_temp.o_tirar(p_quem uuid, p_ordem uuid, p_ids uuid[], p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_tirar(%L::uuid, %L::uuid[], %L, %L)::text$q$, p_ordem, p_ids, p_motivo, p_esp));
end $f$;

create function pg_temp.o_atualizar(p_quem uuid, p_ordem uuid, p_dados text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_atualizar(%L::uuid, %L::jsonb, %L)::text$q$, p_ordem, p_dados, p_esp));
end $f$;

create function pg_temp.o_enviar(p_quem uuid, p_ordem uuid, p_copias text, p_real date, p_prev date, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_enviar(%L::uuid, %L::jsonb, %L::date, %L::date, %L)::text$q$, p_ordem, p_copias, p_real, p_prev, p_esp));
end $f$;

create function pg_temp.o_realizar(p_quem uuid, p_ordem uuid, p_data date, p_valores text, p_obs text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_realizar(%L::uuid, %L::date, %L::jsonb, %L, %L)::text$q$, p_ordem, p_data, p_valores, p_obs, p_esp));
end $f$;

create function pg_temp.o_cancelar(p_quem uuid, p_ordem uuid, p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_cancelar(%L::uuid, %L, %L)::text$q$, p_ordem, p_motivo, p_esp));
end $f$;

-- [{"servico_id": ..., "valor_final": ...}] para uma lista de serviços, com os valores na ordem dada
create function pg_temp.valores_de(p_ids uuid[], p_valores numeric[]) returns text language sql as $f$
  select coalesce(jsonb_agg(jsonb_build_object('servico_id', i.id, 'valor_final', p_valores[i.n])), '[]'::jsonb)::text
    from (select id, row_number() over () as n from unnest(p_ids) id) i
$f$;

-- os eventos do calendário (a base inteira, como o servidor a lê) que são destes serviços: o `ref_id` de uma visita é o menor id dos serviços dela
create function pg_temp.eventos(p_ini date, p_fim date, p_ids uuid[]) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.dia, b.titulo), '[]'::jsonb)
    from public.calendario_eventos_base(p_ini, p_fim) b
   where b.fonte in ('terceiro_servico', 'terceiro_desejado') and b.ref_id = any (select x::text from unnest(p_ids) x)
$f$;

create function pg_temp.hist_tem(p_historico jsonb, p_acao text) returns boolean language sql as $f$
  select exists (select 1 from jsonb_array_elements(p_historico) e where e ->> 'acao' = p_acao)
$f$;

do $t$
declare
  adm uuid; ger uuid; ada uuid; c1 uuid; c2 uuid;
  t_pin uuid; t_lav uuid; p1 uuid; p2 uuid; p3 uuid;
  v_venda text; ops uuid[];
  v text; v2 text; ids uuid[]; s1 uuid; s2 uuid; s3 uuid; u1 uuid; u2 uuid; x1 uuid; l1 uuid; w1 uuid; w2 uuid;
  o1 uuid; o2 uuid; o3 uuid; ord public.terceiros_ordens; n int; n2 int; ev jsonb; t0 timestamptz; ms numeric; h1 int; h2 int; cfg public.terceiros_config;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  emp text := '[{"id":"acn","nome":"ACN","razao_social":"ZZTESTE Razao Social","cnpj":"","endereco":"Rua Teste, 1","telefone":"","email":""},{"id":"detech","nome":"DETECH"}]';
  claus text := E'Do objeto: o PRESTADOR executará o serviço descrito neste documento.\nDo preço: o valor combinado vale para o serviço.';
  copia text := '[{"caminho":"terceiros/ordens/zzteste/copia-assinada.pdf","nome":"copia-assinada.pdf","tamanho":1234}]';
  copia2 text := '[{"caminho":"terceiros/ordens/zzteste/copia-assinada-2.pdf","nome":"copia-assinada-2.pdf","tamanho":4321}]';
begin
  -- ── as pessoas e os dados que o teste usa ────────────────────────────────────────────────────────────────────────────────────────────────────
  select auth_id into adm from public.auth_usuarios where perfil = 'Admin' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ger from public.auth_usuarios where perfil ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null order by id limit 1;
  select auth_id into ada from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and coalesce(abas_permitidas, '[]'::jsonb) ? 'producao' order by id limit 1;
  select auth_id into c1 from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null and lower(email) not like '%@teste.acn.invalid'
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') order by id limit 1;
  select auth_id into c2 from public.auth_usuarios
   where perfil <> 'Admin' and perfil not ilike 'gerente%' and coalesce(ativo, false) and auth_id is not null and lower(email) not like '%@teste.acn.invalid'
     and jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)) > 0 and not (coalesce(abas_permitidas, '[]'::jsonb) ? 'producao') and auth_id <> c1 order by id desc limit 1;
  select id into t_pin from public.terceiros_tipos where nome_norm = 'pintura eletrostatica' and usa_ordem_em_lote;
  select id into t_lav from public.terceiros_tipos where nome_norm = 'lavagem' and not usa_ordem_em_lote;
  select q.vb, array_agg(q.id order by q.opl) into v_venda, ops
    from (select id, opl, regexp_replace(opl, '/[0-9]+$', '') as vb from public.oples where excluida_em is null and opl ~ '/[0-9]+$') q
   group by q.vb having count(*) >= 6 order by q.vb limit 1;
  perform pg_temp.confere('00 pessoas (Admin, gerente, Adaptação, dois comuns), os tipos (pintura eletrostática com ordem em lote e lavagem sem) e uma venda real com 6+ unidades',
    adm is not null and ger is not null and ada is not null and c1 is not null and c2 is not null and ops is not null and t_pin is not null and t_lav is not null,
    format('adm=%s ger=%s ada=%s c1=%s c2=%s ops=%s pin=%s lav=%s', adm, ger, ada, c1, c2, ops is not null, t_pin, t_lav));
  if adm is null or ger is null or ada is null or c1 is null or c2 is null or ops is null or t_pin is null or t_lav is null then
    raise exception E'TESTE ABORTADO: faltou pessoa ou dado para o teste\n%', current_setting('terceiros_teste.rel', true);
  end if;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T4 Prestador Um', 'zzteste t4 prestador um') returning id into p1;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T4 Prestador Dois', 'zzteste t4 prestador dois') returning id into p2;
  insert into public.terceiros_prestadores (nome, nome_norm, tipos_ids) values ('ZZTESTE T4 Só Lavagem', 'zzteste t4 so lavagem', array[t_lav]) returning id into p3;

  -- ── N. a forma do banco ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform pg_temp.confere('N1 as tabelas do modelo e das ordens existem, com RLS ligado',
    (select relrowsecurity from pg_class where oid = 'public.terceiros_config'::regclass) and (select relrowsecurity from pg_class where oid = 'public.terceiros_ordens'::regclass));
  perform pg_temp.confere('N2 quem entrou LÊ as duas tabelas e NÃO escreve (só pelas funções); a chave pública não toca em nada',
    has_table_privilege('authenticated', 'public.terceiros_ordens', 'select') and has_table_privilege('authenticated', 'public.terceiros_config', 'select')
    and not has_table_privilege('authenticated', 'public.terceiros_ordens', 'insert') and not has_table_privilege('authenticated', 'public.terceiros_ordens', 'update')
    and not has_table_privilege('authenticated', 'public.terceiros_ordens', 'delete') and not has_table_privilege('authenticated', 'public.terceiros_config', 'insert')
    and not has_table_privilege('authenticated', 'public.terceiros_config', 'update') and not has_table_privilege('authenticated', 'public.terceiros_config', 'delete')
    and not has_table_privilege('anon', 'public.terceiros_ordens', 'select') and not has_table_privilege('anon', 'public.terceiros_config', 'select'));
  perform pg_temp.confere('N3 as sete funções da ordem e a do modelo: quem entrou executa, a chave pública não',
    has_function_privilege('authenticated', 'public.terceiros_ordem_montar(uuid[], uuid, date, date, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_incluir(uuid, uuid[], text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_tirar(uuid, uuid[], text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_atualizar(uuid, jsonb, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_enviar(uuid, jsonb, date, date, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_realizar(uuid, date, jsonb, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_ordem_cancelar(uuid, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_config_salvar(jsonb, text, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_ordem_montar(uuid[], uuid, date, date, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_ordem_realizar(uuid, date, jsonb, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_config_salvar(jsonb, text, boolean)', 'execute'));
  perform pg_temp.confere('N4 as conferências internas (quem pode, prestador faz o tipo, recusar se em ordem, validar, incluir e soltar) são fechadas a quem entrou e à chave pública',
    not has_function_privilege('authenticated', 'public.terceiros_pode_ordem(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.terceiros_prestador_faz(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.terceiros_recusar_se_em_ordem(uuid[])', 'execute')
    and not has_function_privilege('authenticated', 'public.terceiros_validar_para_ordem(uuid[], uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.terceiros_incluir_na_ordem(public.terceiros_ordens, uuid[], text)', 'execute')
    and not has_function_privilege('authenticated', 'public.terceiros_soltar_da_ordem(public.terceiros_ordens, uuid[], text, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_recusar_se_em_ordem(uuid[])', 'execute'));
  perform pg_temp.confere('N5 as cinco funções dos serviços continuam executáveis por quem entrou (não pela chave pública) e todas carregam a trava da ordem',
    has_function_privilege('authenticated', 'public.terceiros_agendar(uuid[], uuid, date, text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_realizar(uuid[], date, numeric, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_voltar(uuid[], text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_cancelar(uuid[], text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_atualizar(uuid, jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_agendar(uuid[], uuid, date, text, text, text)', 'execute')
    and pg_get_functiondef('public.terceiros_agendar(uuid[], uuid, date, text, text, text)'::regprocedure) like '%terceiros_recusar_se_em_ordem%'
    and pg_get_functiondef('public.terceiros_realizar(uuid[], date, numeric, text, text)'::regprocedure) like '%terceiros_recusar_se_em_ordem%'
    and pg_get_functiondef('public.terceiros_voltar(uuid[], text, text, text)'::regprocedure) like '%terceiros_recusar_se_em_ordem%'
    and pg_get_functiondef('public.terceiros_cancelar(uuid[], text, text)'::regprocedure) like '%terceiros_recusar_se_em_ordem%'
    and pg_get_functiondef('public.terceiros_atualizar(uuid, jsonb, text)'::regprocedure) like '%terceiros_recusar_se_em_ordem%');
  perform pg_temp.confere('N6 a função dos eventos do calendário continua fechada e agora agrupa por ordem',
    not has_function_privilege('authenticated', 'public.calendario_eventos_terceiros(date, date)', 'execute')
    and pg_get_functiondef('public.calendario_eventos_terceiros(date, date)'::regprocedure) like '%terceiros_ordens%');
  select * into cfg from public.terceiros_config where id = 1;
  perform pg_temp.confere('N7 o modelo do contrato já existe: uma linha, duas empresas (ACN e DETECH), dez cláusulas, ainda NÃO aprovado',
    cfg.id = 1 and jsonb_array_length(cfg.empresas) = 2 and array_length(string_to_array(cfg.clausulas, E'\n'), 1) = 10 and not cfg.aprovada,
    format('empresas=%s clausulas=%s aprovada=%s', jsonb_array_length(cfg.empresas), array_length(string_to_array(cfg.clausulas, E'\n'), 1), cfg.aprovada));

  -- ── K. o modelo do contrato: só o Admin grava; mudar tira a aprovação ───────────────────────────────────────────────────────────────────────
  v := pg_temp.como(c1, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, claus));
  perform pg_temp.confere('K1 quem não é Admin não altera o modelo (usuário comum)', pg_temp.recusou(v, 'Só o Admin altera o modelo'), v);
  v := pg_temp.como(ger, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, claus));
  perform pg_temp.confere('K2 o gerente também não (só o Admin)', pg_temp.recusou(v, 'Só o Admin altera o modelo'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, claus));
  select * into cfg from public.terceiros_config where id = 1;
  perform pg_temp.confere('K3 o Admin salva as empresas e as cláusulas, sem aprovar',
    v not like 'ERRO%' and cfg.clausulas = claus and cfg.empresas -> 0 ->> 'razao_social' = 'ZZTESTE Razao Social' and not cfg.aprovada and cfg.atualizado_por is not null, v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L, true)::text$q$, emp, claus));
  select * into cfg from public.terceiros_config where id = 1;
  perform pg_temp.confere('K4 o Admin aprova o texto: fica aprovado, com quem e quando', v not like 'ERRO%' and cfg.aprovada and cfg.aprovada_por is not null and cfg.aprovada_em is not null, v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, claus));
  select * into cfg from public.terceiros_config where id = 1;
  perform pg_temp.confere('K5 salvar o MESMO texto sem pedir aprovação não tira a aprovação que já existe', v not like 'ERRO%' and cfg.aprovada, v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, claus || ' Mais uma frase.'));
  select * into cfg from public.terceiros_config where id = 1;
  perform pg_temp.confere('K6 mudar o texto tira a aprovação (e quem aprovou)', v not like 'ERRO%' and not cfg.aprovada and cfg.aprovada_por is null and cfg.aprovada_em is null, v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[]', claus));
  perform pg_temp.confere('K7 sem nenhuma empresa é recusado', pg_temp.recusou(v, 'de 1 a 6 empresas'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[{"id":"ACN!","nome":"ACN"}]', claus));
  perform pg_temp.confere('K8 código de empresa fora do padrão é recusado', pg_temp.recusou(v, 'código da empresa'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[{"id":"acn","nome":"A"},{"id":"acn","nome":"B"}]', claus));
  perform pg_temp.confere('K9 duas empresas com o mesmo código são recusadas', pg_temp.recusou(v, 'mesmo código'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[{"id":"acn","nome":"ACN","cor":"verde"}]', claus));
  perform pg_temp.confere('K10 campo que não existe no cadastro da empresa é recusado', pg_temp.recusou(v, 'não existe no cadastro'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, emp, 'curto'));
  perform pg_temp.confere('K11 texto de contrato curto demais é recusado', pg_temp.recusou(v, 'Escreva o texto do contrato'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[{"id":"acn","nome":"  "}]', claus));
  perform pg_temp.confere('K12 empresa sem nome é recusada', pg_temp.recusou(v, 'precisa de um nome'), v);
  v := pg_temp.como(adm, format($q$select public.terceiros_config_salvar(%L::jsonb, %L)::text$q$, '[{"id":"acn","nome":"ACN","cnpj":5}]', claus));
  perform pg_temp.confere('K13 dado da empresa que não é texto é recusado', pg_temp.recusou(v, 'deve ser um texto'), v);
  v := pg_temp.como(c1, 'select count(*)::text from public.terceiros_config');
  perform pg_temp.confere('K14 quem entrou lê o modelo (a tela precisa dele para imprimir o contrato)', v = '1', v);
  v := pg_temp.como(c1, $q$update public.terceiros_config set aprovada = true returning 'x'$q$);
  perform pg_temp.confere('K15 quem entrou NÃO grava no modelo direto (só pela função do Admin)', v like 'ERRO%', v);

  -- ── A. os pedidos que o teste usa ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.pedir(c1, t_pin, 'ZZTESTE T4 grades da primeira ordem', ops[1:3]);
  ids := pg_temp.ids_de(v); s1 := ids[1]; s2 := ids[2]; s3 := ids[3];
  perform pg_temp.confere('A1 três pinturas eletrostáticas pedidas por um usuário comum (uma venda)', pg_temp.n_servicos(v) = 3, v);
  v := pg_temp.pedir(c2, t_pin, 'ZZTESTE T4 peças da segunda ordem', ops[4:5]);
  ids := pg_temp.ids_de(v); u1 := ids[1]; u2 := ids[2];
  v := pg_temp.pedir(c2, t_pin, 'ZZTESTE T4 peça avulsa, sem venda');
  x1 := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('A2 duas pinturas da mesma venda e uma avulsa (sem venda) pedidas por outro usuário', u1 is not null and u2 is not null and x1 is not null and
    (select count(*) from public.terceiros_servicos where id = x1 and venda_base is null) = 1, v);
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T4 lavagem que não usa ordem em lote', ops[6:6]);
  l1 := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('A3 uma lavagem (tipo sem ordem em lote)', l1 is not null, v);

  -- ── M. montar a ordem: quem pode, o que recusa, e o que acontece com os serviços ────────────────────────────────────────────────────────────
  v := pg_temp.o_montar(c1, array[s1, s2, s3], p1, hoje + 1, hoje + 8);
  perform pg_temp.confere('M0 quem só pediu o serviço NÃO monta a ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação montam'), v);
  v := pg_temp.o_montar(ada, '{}'::uuid[], p1, hoje + 1, hoje + 8);
  perform pg_temp.confere('M1 ordem sem serviço é recusada', pg_temp.recusou(v, 'pelo menos um serviço'), v);
  v := pg_temp.o_montar(ada, array[s1], null, hoje + 1, hoje + 8);
  perform pg_temp.confere('M2 ordem sem prestador é recusada', pg_temp.recusou(v, 'Escolha o prestador'), v);
  v := pg_temp.o_montar(ada, array[s1], gen_random_uuid(), hoje + 1, hoje + 8);
  perform pg_temp.confere('M3 prestador que não existe é recusado', pg_temp.recusou(v, 'não existe ou está inativo'), v);
  v := pg_temp.o_montar(ada, array[s1], p1, hoje - 1, hoje + 8);
  perform pg_temp.confere('M4 dia do envio no passado é recusado', pg_temp.recusou(v, 'anterior a hoje'), v);
  v := pg_temp.o_montar(ada, array[s1], p1, hoje + 1, null);
  perform pg_temp.confere('M5 sem previsão de retorno é recusado', pg_temp.recusou(v, 'previsão de retorno'), v);
  v := pg_temp.o_montar(ada, array[s1], p1, hoje + 3, hoje + 2);
  perform pg_temp.confere('M6 previsão de retorno antes do envio é recusada', pg_temp.recusou(v, 'anterior ao dia do envio'), v);
  v := pg_temp.o_montar(ada, array[l1], p1, hoje + 1, hoje + 8);
  perform pg_temp.confere('M7 serviço de tipo que não usa ordem em lote (lavagem) é recusado', pg_temp.recusou(v, 'não usa ordem de serviço em lote'), v);
  v := pg_temp.o_montar(ada, array[s1], p3, hoje + 1, hoje + 8);
  perform pg_temp.confere('M8 prestador que não faz o tipo (só lavagem) é recusado', pg_temp.recusou(v, 'não faz o tipo'), v);
  select count(*) into n2 from public.terceiros_ordens;
  v := pg_temp.o_montar(ada, array[u1, l1], p1, hoje + 1, hoje + 8);
  perform pg_temp.confere('M9 ordem com um serviço bom e um ruim é recusada INTEIRA: o serviço bom não muda e nenhuma ordem nasce',
    v like 'ERRO%' and (select status = 'solicitado' and ordem_id is null from public.terceiros_servicos where id = u1) and (select count(*) from public.terceiros_ordens) = n2, v);

  v := pg_temp.o_montar(ada, array[s1, s2, s3], p1, hoje + 1, hoje + 8, 'ZZTESTE observação da ordem');
  o1 := pg_temp.ordem_de(v);
  perform pg_temp.confere('M10 a Adaptação monta a ordem 1 com as 3 pinturas', o1 is not null and pg_temp.n_servicos(v) = 3, v);
  select * into ord from public.terceiros_ordens where id = o1;
  perform pg_temp.confere('M11 a ordem nasce "montada" (aguardando assinatura), com número OT-NNNNN, datas, prestador e quem montou',
    ord.status = 'montada' and ord.numero ~ '^OT-[0-9]{5}$' and ord.data_envio_prevista = hoje + 1 and ord.previsao_retorno = hoje + 8 and ord.prestador_id = p1
    and ord.criado_por is not null and ord.observacao = 'ZZTESTE observação da ordem' and jsonb_array_length(ord.copias) = 0, ord::text);
  select count(*) into n from public.terceiros_servicos where id = any(array[s1, s2, s3]) and status = 'agendado' and ordem_id = o1 and prestador_id = p1 and data_agendada = hoje + 1 and periodo = 'dia_todo';
  perform pg_temp.confere('M12 os 3 serviços passam juntos a "Agendado", no prestador e no dia da ordem, dia todo', n = 3, n::text);
  perform pg_temp.confere('M13 o histórico da ordem e o de cada serviço guardam a montagem',
    pg_temp.hist_tem(ord.historico, 'montada') and (select bool_and(pg_temp.hist_tem(historico, 'em_ordem')) from public.terceiros_servicos where id = any(array[s1, s2, s3])));
  v := pg_temp.o_montar(ada, array[s1], p1, hoje + 1, hoje + 8);
  perform pg_temp.confere('M14 serviço que já está numa ordem não entra em outra', pg_temp.recusou(v, 'já está na ordem'), v);

  -- ── G. o serviço que está numa ordem anda COM ela: as funções dos serviços recusam ──────────────────────────────────────────────────────────
  v := pg_temp.agendar(c1, array[s1], p1, hoje + 3, 'manha', 'agendado');
  perform pg_temp.confere('G1 reagendar um serviço da ordem pela tela do serviço é recusado, com o número da ordem', pg_temp.recusou(v, 'faz parte da ordem ' || ord.numero), v);
  v := pg_temp.realizar(c1, array[s1], hoje, 100, 'agendado');
  perform pg_temp.confere('G2 dar um serviço da ordem como realizado, sozinho, é recusado', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.voltar(c1, array[s1], 'solicitado', 'ZZTESTE tirar a data', 'agendado');
  perform pg_temp.confere('G3 voltar um serviço da ordem para "A definir", sozinho, é recusado', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.cancelar(c1, array[s1], 'ZZTESTE cancelar sozinho', 'agendado');
  perform pg_temp.confere('G4 cancelar um serviço da ordem, sozinho, é recusado', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.atualizar(c1, s1, '{"descricao":"ZZTESTE nova descrição"}', 'agendado');
  perform pg_temp.confere('G5 alterar os dados de um serviço da ordem é recusado (a relação de peças é a da ordem)', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.atualizar_varios(c1, array[s1, s2], '{"observacao":"ZZTESTE"}', 'agendado');
  perform pg_temp.confere('G6 alterar vários de uma vez, com serviço da ordem, é recusado', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.agendar(adm, array[s2], p1, hoje + 3, 'manha', 'agendado');
  perform pg_temp.confere('G7 nem o Admin mexe no serviço da ordem fora dela (a trava vale para todos)', pg_temp.recusou(v, 'faz parte da ordem'), v);
  v := pg_temp.agendar(c2, array[u1], p1, hoje + 1, 'manha', 'solicitado');
  perform pg_temp.confere('G8 o serviço que NÃO está em ordem continua se agendando sozinho, como sempre', v not like 'ERRO%', v);

  -- ── I. incluir e tirar serviços (só antes de enviar) ────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.o_incluir(c1, o1, array[u1], 'montada');
  perform pg_temp.confere('I1 quem só pediu não inclui serviço na ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação mexem'), v);
  v := pg_temp.o_incluir(ger, o1, array[u1], 'enviada');
  perform pg_temp.confere('I2 a janela mostrava a ordem como "enviada" e ela está "montada": recusa pedindo para atualizar a tela', pg_temp.recusou(v, 'mudou de situação'), v);
  v := pg_temp.o_incluir(ger, o1, array[u1, u2], 'montada');
  perform pg_temp.confere('I3 o gerente inclui mais 2 serviços na ordem montada (o u1 já estava agendado sozinho)', pg_temp.n_servicos(v) = 2, v);
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and prestador_id = p1 and data_agendada = hoje + 1 and status = 'agendado';
  perform pg_temp.confere('I3b a ordem tem 5 serviços, todos no dia e no prestador dela', n = 5, n::text);
  perform pg_temp.confere('I3c o histórico do serviço que já estava agendado guarda o dia de antes',
    (select historico::text like '%estava agendado para%' from public.terceiros_servicos where id = u1));
  v := pg_temp.o_incluir(ger, o1, array[l1], 'montada');
  perform pg_temp.confere('I4 serviço de tipo sem ordem em lote não entra', pg_temp.recusou(v, 'não usa ordem de serviço em lote'), v);
  v := pg_temp.o_tirar(ger, o1, array[u1], 'abc', 'montada');
  perform pg_temp.confere('I5 tirar serviço sem motivo (menos de 5 letras) é recusado', pg_temp.recusou(v, 'motivo'), v);
  v := pg_temp.o_tirar(ger, o1, array[u1], 'ZZTESTE saiu da ordem', 'montada');
  perform pg_temp.confere('I6 tirar com motivo: o serviço volta para "A definir", sem dia e sem ordem, e a saída fica no histórico',
    pg_temp.n_servicos(v) = 1 and (select status = 'solicitado' and ordem_id is null and data_agendada is null and periodo is null and pg_temp.hist_tem(historico, 'saiu_da_ordem') from public.terceiros_servicos where id = u1), v);
  v := pg_temp.o_tirar(ger, o1, array[u1], 'ZZTESTE de novo', 'montada');
  perform pg_temp.confere('I7 tirar quem não está na ordem é recusado', pg_temp.recusou(v, 'não está nesta ordem'), v);
  v := pg_temp.o_tirar(ger, o1, array[s1, s2, s3, u2], 'ZZTESTE tirar tudo', 'montada');
  perform pg_temp.confere('I8 tirar todos os serviços é recusado (para desfazer tudo, cancele a ordem)', pg_temp.recusou(v, 'não pode ficar sem serviços'), v);
  v := pg_temp.o_tirar(ger, o1, array[u2], 'ZZTESTE saiu da ordem', 'montada');
  select count(*) into n from public.terceiros_servicos where ordem_id = o1;
  perform pg_temp.confere('I9 a ordem 1 volta a ter só as 3 pinturas', pg_temp.n_servicos(v) = 1 and n = 3, n::text);
  perform pg_temp.confere('I9b o histórico da ordem guarda quem incluiu e quem tirou',
    (select pg_temp.hist_tem(historico, 'incluiu') and pg_temp.hist_tem(historico, 'tirou') from public.terceiros_ordens where id = o1));

  -- ── U. alterar a ordem que espera a assinatura ──────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.o_atualizar(c1, o1, '{"observacao":"ZZTESTE"}', 'montada');
  perform pg_temp.confere('U0 quem só pediu não altera a ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação mexem'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"data_envio_prevista":"%s","previsao_retorno":"%s"}', hoje + 2, hoje + 9), 'montada');
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and data_agendada = hoje + 2;
  perform pg_temp.confere('U1 mudar o dia do envio e a previsão: os 3 serviços acompanham o novo dia', v not like 'ERRO%' and n = 3 and pg_temp.n_servicos(v) = 3, v);
  v := pg_temp.o_atualizar(ada, o1, format('{"prestador_id":"%s"}', p2), 'montada');
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and prestador_id = p2;
  perform pg_temp.confere('U2 trocar o prestador da ordem: os 3 serviços acompanham', v not like 'ERRO%' and n = 3, v);
  v := pg_temp.o_atualizar(ada, o1, format('{"prestador_id":"%s"}', p3), 'montada');
  perform pg_temp.confere('U3 prestador que não faz o tipo é recusado (e nada muda)', pg_temp.recusou(v, 'não faz o tipo') and (select count(*) from public.terceiros_servicos where ordem_id = o1 and prestador_id = p2) = 3, v);
  v := pg_temp.o_atualizar(ada, o1, format('{"data_envio_prevista":"%s"}', hoje - 1), 'montada');
  perform pg_temp.confere('U4 dia do envio no passado é recusado', pg_temp.recusou(v, 'anterior a hoje'), v);
  v := pg_temp.o_atualizar(ada, o1, '{"status":"fechada"}', 'montada');
  perform pg_temp.confere('U5 campo que a função não aceita (status) é recusado', pg_temp.recusou(v, 'não pode ser alterado'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"previsao_retorno":"%s"}', hoje), 'montada');
  perform pg_temp.confere('U6 previsão de retorno antes do dia do envio é recusada', pg_temp.recusou(v, 'anterior ao dia do envio'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"copias":%s}', copia), 'montada');
  perform pg_temp.confere('U7 anexar a cópia assinada numa ordem ainda "montada" é recusado (ela entra junto com o envio)', pg_temp.recusou(v, 'junto com o envio'), v);
  select jsonb_array_length(historico) into h1 from public.terceiros_ordens where id = o1;
  v := pg_temp.o_atualizar(ada, o1, '{"observacao":"ZZTESTE observação da ordem"}', 'montada');
  select jsonb_array_length(historico) into h2 from public.terceiros_ordens where id = o1;
  perform pg_temp.confere('U8 gravar o mesmo valor não muda nada nem enche o histórico', v not like 'ERRO%' and h1 = h2 and pg_temp.n_servicos(v) = 0, format('%s → %s', h1, h2));
  v := pg_temp.o_atualizar(ada, o1, format('{"prestador_id":"%s"}', p1), 'montada');
  perform pg_temp.confere('U9 volta o prestador para o primeiro (o teste segue com ele)', v not like 'ERRO%', v);

  -- ── Q. o calendário: a ordem é UMA visita, mesmo com vendas diferentes ──────────────────────────────────────────────────────────────────────
  v := pg_temp.o_montar(ger, array[u1, u2, x1], p1, hoje + 5, hoje + 9);
  o2 := pg_temp.ordem_de(v);
  perform pg_temp.confere('Q0 o gerente monta a ordem 2 com serviços de duas vendas e um avulso (sem venda)', o2 is not null and pg_temp.n_servicos(v) = 3, v);
  ev := pg_temp.eventos(hoje, hoje + 12, array[u1, u2, x1]);
  perform pg_temp.confere('Q1 os 3 serviços da ordem 2 são UM evento no calendário (a venda diferente não separa), com alerta, no dia do envio das peças',
    jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'titulo') like 'Pintura eletrostática — ordem OT-% · 3 serviços' and (ev -> 0 ->> 'alerta')::boolean
    and (ev -> 0 ->> 'dia')::date = hoje + 5 and (ev -> 0 -> 'extra' ->> 'carros')::int = 3 and (ev -> 0 -> 'extra' ->> 'ordem') like 'OT-%', ev::text);
  perform pg_temp.confere('Q2 o detalhe diz que a ordem espera a assinatura', (ev -> 0 ->> 'detalhe') like '%aguardando assinatura%', ev -> 0 ->> 'detalhe');
  ev := pg_temp.eventos(hoje, hoje + 12, array[s1, s2, s3]);
  perform pg_temp.confere('Q3 os 3 serviços da ordem 1 também são um evento só, no dia dela', jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'dia')::date = hoje + 2 and (ev -> 0 -> 'extra' ->> 'carros')::int = 3, ev::text);
  -- fora de ordem, o agrupamento por venda continua igual (a T3 não muda)
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T4 lavagens da mesma venda', ops[1:2]);   -- outros carros que a lavagem da ops[6] (o banco recusa o mesmo tipo aberto no mesmo carro)
  ids := pg_temp.ids_de(v); w1 := ids[1]; w2 := ids[2];
  v := pg_temp.agendar(c1, array[w1, w2], p1, hoje + 3, 'dia_todo', 'solicitado');
  ev := pg_temp.eventos(hoje, hoje + 12, array[w1, w2]);
  perform pg_temp.confere('Q4 duas lavagens da mesma venda, mesmo prestador e dia (sem ordem) continuam sendo um evento, "2 carros da venda"',
    jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'titulo') like 'Lavagem — 2 carros da venda %', ev::text);

  -- ── E. enviar a ordem: só com a cópia assinada ──────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.o_enviar(ada, o1, '[]', hoje, hoje + 8, 'montada');
  perform pg_temp.confere('E1 sem a cópia assinada a ordem NÃO é enviada', pg_temp.recusou(v, 'Anexe a cópia assinada'), v);
  v := pg_temp.o_enviar(ada, o1, '[{"caminho":"outra-pasta/x.pdf","nome":"x.pdf"}]', hoje, hoje + 8, 'montada');
  perform pg_temp.confere('E2 arquivo fora da pasta dos serviços de terceiros é recusado', pg_temp.recusou(v, 'não está na pasta'), v);
  v := pg_temp.o_enviar(ada, o1, copia, hoje + 1, hoje + 8, 'montada');
  perform pg_temp.confere('E3 dia do envio no futuro é recusado', pg_temp.recusou(v, 'no futuro'), v);
  v := pg_temp.o_enviar(c1, o1, copia, hoje, hoje + 8, 'montada');
  perform pg_temp.confere('E4 quem só pediu não envia a ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação enviam'), v);
  v := pg_temp.o_enviar(ada, o1, copia, hoje, hoje + 8, 'enviada');
  perform pg_temp.confere('E5 a janela mostrava outra situação: recusa pedindo para atualizar a tela', pg_temp.recusou(v, 'mudou de situação'), v);
  v := pg_temp.o_enviar(adm, o1, copia, hoje, hoje + 10, 'montada');
  select * into ord from public.terceiros_ordens where id = o1;
  perform pg_temp.confere('E6 o Admin envia com a cópia: a ordem fica "enviada", com o dia real, a cópia, quem enviou e a nova previsão',
    v not like 'ERRO%' and ord.status = 'enviada' and ord.data_envio_real = hoje and jsonb_array_length(ord.copias) = 1 and ord.enviada_por is not null and ord.previsao_retorno = hoje + 10
    and ord.data_envio_prevista = least(hoje + 2, hoje), v);
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and status = 'agendado' and data_agendada = hoje + 10;
  perform pg_temp.confere('E7 os serviços seguem "Agendado" e passam a mostrar como dia o do retorno previsto (o "atrasado" vale para o retorno)', n = 3, n::text);
  perform pg_temp.confere('E8 o histórico de cada serviço guarda o envio', (select bool_and(pg_temp.hist_tem(historico, 'ordem_enviada')) from public.terceiros_servicos where ordem_id = o1));
  v := pg_temp.o_enviar(adm, o1, copia, hoje, hoje + 10, 'montada');
  perform pg_temp.confere('E9 enviar de novo é recusado', pg_temp.recusou(v, 'mudou de situação'), v);
  v := pg_temp.o_tirar(ger, o1, array[s1], 'ZZTESTE depois de enviada', 'enviada');
  perform pg_temp.confere('E10 depois do envio não se tira serviço da ordem', pg_temp.recusou(v, 'antes de ela ser enviada'), v);
  v := pg_temp.o_incluir(ger, o1, array[l1], 'enviada');
  perform pg_temp.confere('E11 depois do envio não se inclui serviço na ordem', pg_temp.recusou(v, 'ainda espera a assinatura'), v);
  v := pg_temp.o_cancelar(ger, o1, 'ZZTESTE cancelar enviada', 'enviada');
  perform pg_temp.confere('E12 a ordem enviada não se cancela (as peças estão no prestador: fecha-se no retorno)', pg_temp.recusou(v, 'Só se cancela a ordem que ainda espera'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"prestador_id":"%s"}', p2), 'enviada');
  perform pg_temp.confere('E13 depois do envio o prestador não muda', pg_temp.recusou(v, 'só muda enquanto'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"previsao_retorno":"%s"}', hoje - 1), 'enviada');
  perform pg_temp.confere('E14 previsão de retorno antes do dia do envio é recusada', pg_temp.recusou(v, 'anterior ao dia'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"previsao_retorno":"%s","observacao":"ZZTESTE novo prazo"}', hoje + 12), 'enviada');
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and data_agendada = hoje + 12;
  perform pg_temp.confere('E15 a previsão de retorno pode ser ajustada depois do envio, e os serviços acompanham', v not like 'ERRO%' and n = 3 and pg_temp.n_servicos(v) = 3, v);
  v := pg_temp.o_atualizar(ada, o1, '{"copias":[]}', 'enviada');
  perform pg_temp.confere('E16 a ordem enviada não fica sem a cópia assinada (troca-se o arquivo, não se tira)', pg_temp.recusou(v, 'precisa da cópia assinada'), v);
  v := pg_temp.o_atualizar(ada, o1, format('{"copias":%s}', copia2), 'enviada');
  select * into ord from public.terceiros_ordens where id = o1;
  perform pg_temp.confere('E17 trocar a cópia assinada por outra funciona', v not like 'ERRO%' and ord.copias -> 0 ->> 'nome' = 'copia-assinada-2.pdf', v);
  ev := pg_temp.eventos(hoje, hoje + 15, array[s1, s2, s3]);
  perform pg_temp.confere('E18 o calendário mostra UMA visita no dia do retorno previsto, com o detalhe "peças no prestador", e o alerta ligado',
    jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'dia')::date = hoje + 12 and (ev -> 0 ->> 'detalhe') like '%peças no prestador%' and (ev -> 0 ->> 'alerta')::boolean, ev::text);

  -- peças que saem ANTES do dia previsto: o dia previsto recua para o dia real (a previsão de retorno nunca fica antes dele)
  v := pg_temp.o_enviar(ger, o2, copia, hoje, null, 'montada');
  select * into ord from public.terceiros_ordens where id = o2;
  perform pg_temp.confere('E19 enviar antes do dia previsto funciona: o dia previsto recua para o real e a previsão de retorno fica',
    v not like 'ERRO%' and ord.status = 'enviada' and ord.data_envio_prevista = hoje and ord.data_envio_real = hoje and ord.previsao_retorno = hoje + 9, coalesce(v, '') || ' ' || ord::text);

  -- ── R. o retorno: a ordem fecha TODOS os serviços, cada um com o seu valor final ────────────────────────────────────────────────────────────
  v := pg_temp.o_realizar(c1, o1, hoje, pg_temp.valores_de(array[s1, s2, s3], array[100.5, 200, 0]), null, 'enviada');
  perform pg_temp.confere('R1 quem só pediu não fecha a ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação fecham'), v);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2], array[100, 200]), null, 'enviada');
  perform pg_temp.confere('R2 com o valor de só 2 dos 3 serviços é recusado', pg_temp.recusou(v, 'exatamente os serviços da ordem'), v);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, l1], array[100, 200, 50]), null, 'enviada');
  perform pg_temp.confere('R3 com um serviço que não é da ordem no lugar de um da ordem é recusado', pg_temp.recusou(v, 'exatamente os serviços da ordem'), v);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, s2], array[100, 200, 50]), null, 'enviada');
  perform pg_temp.confere('R4 com o mesmo serviço duas vezes é recusado', pg_temp.recusou(v, 'duas vezes'), v);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, s3], array[100, -5, 0]), null, 'enviada');
  perform pg_temp.confere('R5 valor negativo é recusado', pg_temp.recusou(v, 'deve ser um número'), v);
  v := pg_temp.o_realizar(ada, o1, hoje + 1, pg_temp.valores_de(array[s1, s2, s3], array[100, 200, 0]), null, 'enviada');
  perform pg_temp.confere('R6 dia do retorno no futuro é recusado', pg_temp.recusou(v, 'no futuro'), v);
  v := pg_temp.o_realizar(ada, o1, hoje - 1, pg_temp.valores_de(array[s1, s2, s3], array[100, 200, 0]), null, 'enviada');
  perform pg_temp.confere('R7 dia do retorno antes do envio é recusado', pg_temp.recusou(v, 'anterior ao do envio'), v);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, s3], array[100, 200, 0]), null, 'montada');
  perform pg_temp.confere('R8 a janela mostrava outra situação: recusa pedindo para atualizar a tela', pg_temp.recusou(v, 'mudou de situação'), v);
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and status = 'agendado';
  perform pg_temp.confere('R9 nenhuma recusa deixou serviço pela metade: os 3 seguem "Agendado" e a ordem "enviada"', n = 3 and (select status from public.terceiros_ordens where id = o1) = 'enviada', n::text);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, s3], array[100.5, 200, 0]), 'ZZTESTE tudo conferido', 'enviada');
  select * into ord from public.terceiros_ordens where id = o1;
  perform pg_temp.confere('R10 a Adaptação fecha a ordem: "fechada", com o dia do retorno e quem fechou', v not like 'ERRO%' and ord.status = 'fechada' and ord.data_retorno_real = hoje and ord.fechada_por is not null and pg_temp.n_servicos(v) = 3, v);
  select count(*) into n from public.terceiros_servicos where ordem_id = o1 and status = 'realizado' and data_realizada = hoje and conferido_por is not null and conferido_em is not null;
  perform pg_temp.confere('R11 os 3 serviços passam a "Realizado", no dia do retorno, cada um com quem conferiu', n = 3, n::text);
  perform pg_temp.confere('R12 cada serviço guarda o SEU valor final (100,50, 200 e 0)',
    (select array_agg(valor_final order by valor_final) from public.terceiros_servicos where ordem_id = o1) = array[0.00, 100.50, 200.00]::numeric[]);
  perform pg_temp.confere('R13 o histórico do serviço diz a ordem, o dia e o valor', (select bool_and(historico::text like '%Ordem ' || ord.numero || ' fechada%') from public.terceiros_servicos where ordem_id = o1));
  ev := pg_temp.eventos(hoje - 3, hoje + 15, array[s1, s2, s3]);
  perform pg_temp.confere('R14 no calendário a ordem fechada é UMA visita concluída, sem alerta', jsonb_array_length(ev) = 1 and (ev -> 0 ->> 'concluido')::boolean and not (ev -> 0 ->> 'alerta')::boolean and (ev -> 0 ->> 'dia')::date = hoje, ev::text);
  v := pg_temp.o_realizar(ada, o1, hoje, pg_temp.valores_de(array[s1, s2, s3], array[1, 2, 3]), null, 'enviada');
  perform pg_temp.confere('R15 fechar de novo é recusado', pg_temp.recusou(v, 'mudou de situação'), v);

  -- a ordem 2, de vendas diferentes, fecha igual
  v := pg_temp.o_realizar(ger, o2, hoje, pg_temp.valores_de(array[u1, u2, x1], array[10, 20, 30]), null, 'enviada');
  perform pg_temp.confere('R16 a ordem 2 (duas vendas e um avulso) fecha de uma vez, com 3 valores', v not like 'ERRO%' and pg_temp.n_servicos(v) = 3 and (select count(*) from public.terceiros_servicos where ordem_id = o2 and status = 'realizado') = 3, v);

  -- depois de fechada, o serviço individual volta a ser dono de si
  v := pg_temp.voltar(c1, array[s1], 'agendado', 'ZZTESTE reabrir um serviço da ordem fechada', 'realizado');
  perform pg_temp.confere('R17 um serviço de ordem FECHADA pode ser reaberto sozinho por quem pediu (a trava só vale com a ordem montada ou enviada)', v not like 'ERRO%', v);
  v := pg_temp.o_montar(adm, array[s1], p1, hoje + 1, hoje + 5);
  o3 := pg_temp.ordem_de(v);
  perform pg_temp.confere('R18 o serviço reaberto pode entrar numa ordem nova', o3 is not null and (select ordem_id = o3 and status = 'agendado' from public.terceiros_servicos where id = s1), v);

  -- ── C. cancelar a ordem (só a que espera a assinatura) ──────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.o_cancelar(c1, o3, 'ZZTESTE cancelar a ordem', 'montada');
  perform pg_temp.confere('C1 quem só pediu não cancela a ordem', pg_temp.recusou(v, 'Só o Admin, os gerentes e a Adaptação cancelam'), v);
  v := pg_temp.o_cancelar(adm, o3, 'abc', 'montada');
  perform pg_temp.confere('C2 cancelar sem motivo (menos de 5 letras) é recusado', pg_temp.recusou(v, 'motivo'), v);
  v := pg_temp.o_cancelar(adm, o3, 'ZZTESTE cancelar a ordem', 'enviada');
  perform pg_temp.confere('C3 a janela mostrava outra situação: recusa pedindo para atualizar a tela', pg_temp.recusou(v, 'mudou de situação'), v);
  v := pg_temp.o_cancelar(adm, o3, 'ZZTESTE cancelar a ordem', 'montada');
  select * into ord from public.terceiros_ordens where id = o3;
  perform pg_temp.confere('C4 cancelar com motivo: a ordem fica "cancelada" (com motivo, quando e quem) e o serviço volta para "A definir", sem ordem e sem dia',
    v not like 'ERRO%' and ord.status = 'cancelada' and ord.cancelado_motivo is not null and ord.cancelado_em is not null and ord.cancelado_por is not null
    and (select status = 'solicitado' and ordem_id is null and data_agendada is null and pg_temp.hist_tem(historico, 'saiu_da_ordem') from public.terceiros_servicos where id = s1), v);
  v := pg_temp.o_cancelar(adm, o3, 'ZZTESTE cancelar a ordem', 'montada');
  perform pg_temp.confere('C5 cancelar de novo é recusado', pg_temp.recusou(v, 'mudou de situação'), v);
  v := pg_temp.agendar(c1, array[s1], p1, hoje + 4, 'manha', 'solicitado');
  perform pg_temp.confere('C6 o serviço solto da ordem cancelada se agenda sozinho outra vez', v not like 'ERRO%', v);

  -- ── L. quem lê e quem escreve ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  v := pg_temp.como(c1, format($q$select count(*)::text from public.terceiros_ordens where id = any (%L::uuid[])$q$, array[o1, o2, o3]));
  perform pg_temp.confere('L1 quem entrou lê as ordens (para ver o selo e o número no serviço)', v = '3', v);
  v := pg_temp.como(c1, 'select count(*)::text from public.terceiros_ordens', 'teste-terceiros', 'anon');
  perform pg_temp.confere('L2 a chave pública não lê as ordens', v like 'ERRO%', v);
  v := pg_temp.como(c1, format($q$update public.terceiros_ordens set observacao = 'ZZTESTE' where id = %L returning 'x'$q$, o1));
  perform pg_temp.confere('L3 quem entrou NÃO altera a ordem direto (só pelas funções)', v like 'ERRO%', v);
  v := pg_temp.como(c1, format($q$update public.terceiros_servicos set ordem_id = null where id = %L returning 'x'$q$, s2));
  perform pg_temp.confere('L4 quem entrou NÃO solta o serviço da ordem direto na tabela', v like 'ERRO%', v);
  v := pg_temp.como(c1, $q$insert into public.terceiros_ordens (prestador_id, data_envio_prevista, previsao_retorno) values (gen_random_uuid(), current_date, current_date) returning 'x'$q$);
  perform pg_temp.confere('L5 quem entrou NÃO cria ordem direto', v like 'ERRO%', v);

  -- ── F. custo: o calendário de três meses com o agrupamento novo, e a consulta das ordens que a tela faz ─────────────────────────────────────
  t0 := clock_timestamp();
  perform count(*) from public.calendario_eventos_base(hoje - 30, hoje + 60);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.confere(format('F1 a base do calendário de 3 meses responde em até 500 ms (deu %s ms)', round(ms)), ms <= 500);
  t0 := clock_timestamp();
  perform jsonb_agg(to_jsonb(o) - 'historico') from public.terceiros_ordens o where o.status in ('montada', 'enviada') or o.fechada_em > now() - interval '120 days';
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.confere(format('F2 a leitura das ordens que a tela faz responde em até 100 ms (deu %s ms)', round(ms)), ms <= 100);

  raise exception E'TESTE DAS REGRAS (Serviços de terceiros, T4) — % verificações, % falha(s)\n%',
    coalesce(current_setting('terceiros_teste.total', true), '0'), coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0'), current_setting('terceiros_teste.rel', true);
end
$t$;
rollback;
