-- TESTE DAS REGRAS DO BANCO — Serviços de terceiros, fatia T5 (23/11/2026): pedir o pagamento ao Financeiro, ligar a saída da vistoria de pátio e a pintura da Serralheria virando serviço.
-- Mesmo método dos testes da T1 a T4: roda inteiro no execute_sql (projeto qgemelnuqdilnggxmrdw); cada pessoa (Admin, gerente, Adaptação e dois usuários comuns, escolhidos entre as REAIS por perfil e aba)
-- age pelo papel "authenticated" com o crachá dela, como o navegador. O relatório vem NA MENSAGEM DE ERRO "TESTE ..." porque tudo é desfeito no fim: nada fica gravado.
-- Para testar ANTES de aplicar a migração, cole terceiros_servicos_t5.sql no lugar marcado abaixo (vira parte da mesma transação e também é desfeita); depois de aplicada, deixe o lugar vazio.
-- A única coisa que não volta sozinha é o contador do número (TS-00001): depois de rodar, `select setval('public.terceiros_servico_seq', 1, false)` — só enquanto não houver serviço de verdade.
begin;

-- >>> MIGRAÇÃO EM ENSAIO (opcional): cole aqui o conteúdo de terceiros_servicos_t5.sql <<<

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

create function pg_temp.recusou(v text, trecho text) returns boolean language sql as $f$
  select v like 'ERRO%' and position(lower(trecho) in lower(v)) > 0
$f$;

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

create function pg_temp.realizar(p_quem uuid, p_ids uuid[], p_data date, p_valor numeric, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_realizar(%L::uuid[], %L::date, %L::numeric, %L)::text$q$, p_ids, p_data, p_valor, p_esp));
end $f$;

create function pg_temp.cancelar(p_quem uuid, p_ids uuid[], p_motivo text, p_esp text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_cancelar(%L::uuid[], %L, %L)::text$q$, p_ids, p_motivo, p_esp));
end $f$;

create function pg_temp.pagar(p_quem uuid, p_ids uuid[], p_pag text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_pagamento_pedir(%L::uuid[], %L::jsonb)::text$q$, p_ids, p_pag));
end $f$;

create function pg_temp.ligar(p_quem uuid, p_ids uuid[], p_vist uuid) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_vistoria_ligar(%L::uuid[], %L::uuid)::text$q$, p_ids, p_vist));
end $f$;

create function pg_temp.desligar(p_quem uuid, p_ids uuid[], p_motivo text) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_vistoria_desligar(%L::uuid[], %L)::text$q$, p_ids, p_motivo));
end $f$;

create function pg_temp.o_montar(p_quem uuid, p_ids uuid[], p_prest uuid, p_envio date, p_ret date) returns text language plpgsql as $f$
begin
  return pg_temp.como(p_quem, format($q$select public.terceiros_ordem_montar(%L::uuid[], %L::uuid, %L::date, %L::date)::text$q$, p_ids, p_prest, p_envio, p_ret));
end $f$;

create function pg_temp.hist_tem(p_historico jsonb, p_acao text) returns boolean language sql as $f$
  select exists (select 1 from jsonb_array_elements(p_historico) e where e ->> 'acao' = p_acao)
$f$;

do $t$
declare
  adm uuid; ger uuid; ada uuid; c1 uuid; c2 uuid;
  t_lav uuid; t_pin uuid; p1 uuid; p2 uuid; v_venda text; ops uuid[];
  v text; ids uuid[]; ids2 uuid[]; s_a uuid; s_b uuid; s_c uuid; s_d uuid; s_e uuid; s_f uuid; dem uuid; dem2 uuid; vis uuid; vis2 uuid; dm public.demandas_avulsas; sv public.terceiros_servicos;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  pag text := '{"favorecido":"ZZTESTE T5 Prestador Um","documento":"12.345.678/0001-90","tipo":"servico","forma":"pix","vencimento":"2027-01-15","dados_pagamento":"Pix ZZTESTE","observacao":"ZZTESTE"}';
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
  select id into t_lav from public.terceiros_tipos where nome_norm = 'lavagem' and not usa_ordem_em_lote;
  select id into t_pin from public.terceiros_tipos where nome_norm = 'pintura eletrostatica' and usa_ordem_em_lote;
  select q.vb, array_agg(q.id order by q.opl) into v_venda, ops
    from (select id, opl, regexp_replace(opl, '/[0-9]+$', '') as vb from public.oples where excluida_em is null and opl ~ '/[0-9]+$') q
   group by q.vb having count(*) >= 6 order by q.vb limit 1;
  perform pg_temp.confere('00 pessoas (Admin, gerente, Adaptação, dois comuns), os tipos e uma venda real com 6+ unidades',
    adm is not null and ger is not null and ada is not null and c1 is not null and c2 is not null and ops is not null and t_lav is not null and t_pin is not null,
    format('adm=%s ger=%s ada=%s c1=%s c2=%s ops=%s lav=%s pin=%s', adm, ger, ada, c1, c2, ops is not null, t_lav, t_pin));
  if adm is null or ger is null or ada is null or c1 is null or c2 is null or ops is null or t_lav is null or t_pin is null then
    raise exception E'TESTE ABORTADO: faltou pessoa ou dado para o teste\n%', current_setting('terceiros_teste.rel', true);
  end if;
  insert into public.terceiros_prestadores (nome, nome_norm, cnpj_cpf) values ('ZZTESTE T5 Prestador Um', 'zzteste t5 prestador um', '12345678000190') returning id into p1;
  insert into public.terceiros_prestadores (nome, nome_norm) values ('ZZTESTE T5 Prestador Dois', 'zzteste t5 prestador dois') returning id into p2;

  -- ── N. a forma do banco ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform pg_temp.confere('N1 as colunas novas existem (pagamento, vistoria e o serviço da pintura na demanda)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'terceiros_servicos'
        and column_name in ('pagamento_demanda_id', 'pagamento_pedido_em', 'pagamento_pedido_por', 'vistoria_id', 'vistoria_ligada_em', 'vistoria_ligada_por')) = 6
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'demandas_avulsas' and column_name = 'pintura_servico_id'));
  perform pg_temp.confere('N2 as três funções novas: quem entrou executa, a chave pública não',
    has_function_privilege('authenticated', 'public.terceiros_pagamento_pedir(uuid[], jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_vistoria_ligar(uuid[], uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.terceiros_vistoria_desligar(uuid[], text)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_pagamento_pedir(uuid[], jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_vistoria_ligar(uuid[], uuid)', 'execute')
    and not has_function_privilege('anon', 'public.terceiros_vistoria_desligar(uuid[], text)', 'execute'));
  perform pg_temp.confere('N3 o serviço continua sem escrita direta de quem entrou (só pelas funções)',
    not has_table_privilege('authenticated', 'public.terceiros_servicos', 'insert') and not has_table_privilege('authenticated', 'public.terceiros_servicos', 'update'));

  -- ── P. pedir o pagamento ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- três lavagens do prestador 1 (c1 pediu), uma do prestador 2, uma ainda não realizada e uma de valor zero
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T5 lavagem A', ops[1:1], format(', p_prestador_id => %L::uuid', p1)); s_a := (pg_temp.ids_de(v))[1];
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T5 lavagem B', ops[2:2], format(', p_prestador_id => %L::uuid', p1)); s_b := (pg_temp.ids_de(v))[1];
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T5 lavagem C', ops[3:3], format(', p_prestador_id => %L::uuid', p2)); s_c := (pg_temp.ids_de(v))[1];
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T5 lavagem D (ainda não feita)', ops[4:4], format(', p_prestador_id => %L::uuid', p1)); s_d := (pg_temp.ids_de(v))[1];
  v := pg_temp.pedir(c1, t_lav, 'ZZTESTE T5 lavagem E (valor zero)', ops[5:5], format(', p_prestador_id => %L::uuid', p1)); s_e := (pg_temp.ids_de(v))[1];
  perform pg_temp.confere('P0 cinco serviços criados', s_a is not null and s_b is not null and s_c is not null and s_d is not null and s_e is not null);
  perform pg_temp.realizar(c1, array[s_a], hoje, 100, 'solicitado');
  perform pg_temp.realizar(c1, array[s_b], hoje, 250.50, 'solicitado');
  perform pg_temp.realizar(c1, array[s_c], hoje, 80, 'solicitado');
  perform pg_temp.realizar(c1, array[s_e], hoje, 0, 'solicitado');

  v := pg_temp.pagar(c1, array[s_d], pag);
  perform pg_temp.confere('P1 serviço que ainda não foi realizado: recusa com a frase', pg_temp.recusou(v, 'ainda não foi dado como realizado'), v);
  v := pg_temp.pagar(c1, array[s_e], pag);
  perform pg_temp.confere('P2 serviço de valor final zero: recusa ("não há o que pagar")', pg_temp.recusou(v, 'valor final maior que zero'), v);
  v := pg_temp.pagar(c1, array[s_a, s_c], pag);
  perform pg_temp.confere('P3 serviços de prestadores diferentes no mesmo pedido: recusa', pg_temp.recusou(v, 'prestador só'), v);
  v := pg_temp.pagar(c2, array[s_a, s_b], pag);
  perform pg_temp.confere('P4 quem não pediu (e não é da Adaptação, gerente nem Admin) não pede: recusa com permissão', pg_temp.recusou(v, 'só quem pediu') and v like 'ERRO 42501%', v);
  v := pg_temp.pagar(c1, array[s_a, s_b], replace(pag, 'ZZTESTE T5 Prestador Um', ''));
  perform pg_temp.confere('P5 sem favorecido: recusa', pg_temp.recusou(v, 'favorecido'), v);
  v := pg_temp.pagar(c1, array[s_a, s_b], replace(pag, '12.345.678/0001-90', '12345'));
  perform pg_temp.confere('P6 documento com número de dígitos errado: recusa', pg_temp.recusou(v, 'CPF tem 11'), v);
  v := pg_temp.pagar(c1, array[s_a, s_b], replace(pag, '2027-01-15', '31/02/2027'));
  perform pg_temp.confere('P7 vencimento que não é data: recusa', pg_temp.recusou(v, 'vencimento'), v);
  v := pg_temp.pagar(c1, array[s_a, s_b], replace(pag, '"tipo":"servico"', '"tipo":"qualquer"'));
  perform pg_temp.confere('P8 tipo de custo fora da lista: recusa', pg_temp.recusou(v, 'tipo de custo'), v);
  v := pg_temp.como(null, format($q$select public.terceiros_pagamento_pedir(%L::uuid[], %L::jsonb)::text$q$, array[s_a], pag), 'teste-anon', 'anon');
  perform pg_temp.confere('P9 a chave pública não chama a função', v like 'ERRO%' and (v ilike '%permission denied%' or v ilike '%permiss%'), v);
  v := pg_temp.pagar(c1, array[s_a, s_b], pag);
  perform pg_temp.confere('P10 quem pediu pede o pagamento dos dois (soma 350,50): o banco devolve a demanda, o total e as duas linhas', v not like 'ERRO%' and (v::jsonb ->> 'total')::numeric = 350.50 and (v::jsonb ->> 'quantidade')::int = 2 and jsonb_array_length(v::jsonb -> 'servicos') = 2, v);
  dem := nullif(v::jsonb ->> 'demanda_id', '')::uuid;
  select * into dm from public.demandas_avulsas where id = dem;
  perform pg_temp.confere('P11 a demanda nasceu no Financeiro, Pendente, com o favorecido, o valor SOMADO pelo banco e o vencimento', dm.id is not null and dm.setor = 'Financeiro' and dm.status = 'Pendente'
    and dm.pagamento_terceiro ->> 'favorecido' = 'ZZTESTE T5 Prestador Um' and (dm.pagamento_terceiro ->> 'valor')::numeric = 350.50 and dm.pagamento_terceiro ->> 'vencimento' = '2027-01-15'
    and dm.pagamento_terceiro ->> 'documento' = '12345678000190' and dm.pagamento_terceiro ->> 'forma' = 'pix', coalesce(dm.pagamento_terceiro::text, 'sem demanda'));
  perform pg_temp.confere('P12 o título e a descrição dizem o prestador, os serviços e o total; os dois carros viram vínculos (OP)', dm.titulo like 'Pagamento — ZZTESTE T5 Prestador Um%' and dm.descricao like '%350,50%'
    and jsonb_array_length(dm.vinculos) = 2 and dm.vinculos -> 0 ->> 'tipo' = 'op' and dm.vinculo_tipo = 'op', dm.titulo);
  select * into sv from public.terceiros_servicos where id = s_a;
  perform pg_temp.confere('P13 os dois serviços ficaram ligados à demanda, com quem pediu e o histórico', sv.pagamento_demanda_id = dem and sv.pagamento_pedido_em is not null and sv.pagamento_pedido_por is not null and pg_temp.hist_tem(sv.historico, 'pagamento_pedido')
    and (select pagamento_demanda_id from public.terceiros_servicos where id = s_b) = dem);
  v := pg_temp.pagar(c1, array[s_a], pag);
  perform pg_temp.confere('P14 pedir de novo o que já foi pedido: recusa (a demanda está pendente)', pg_temp.recusou(v, 'já foi pedido'), v);
  update public.demandas_avulsas set status = 'Concluída' where id = dem;
  v := pg_temp.pagar(c1, array[s_a], pag);
  perform pg_temp.confere('P15 depois de paga (demanda concluída), também recusa', pg_temp.recusou(v, 'já foi pedido') and v ilike '%conclu%', v);
  update public.demandas_avulsas set status = 'Cancelada' where id = dem;
  v := pg_temp.pagar(c1, array[s_a, s_b], pag);
  dem2 := nullif(v::jsonb ->> 'demanda_id', '')::uuid;
  perform pg_temp.confere('P16 se o Financeiro CANCELOU a demanda, os serviços podem pedir de novo (nova demanda, nova ligação)', v not like 'ERRO%' and dem2 is not null and dem2 <> dem
    and (select pagamento_demanda_id from public.terceiros_servicos where id = s_a) = dem2, v);
  v := pg_temp.pagar(ger, array[s_c], pag);
  perform pg_temp.confere('P17 o gerente pede o pagamento de serviço que outra pessoa pediu', v not like 'ERRO%' and (v::jsonb ->> 'total')::numeric = 80, v);

  -- ── V. a saída da vistoria de pátio ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  insert into public.vistorias_patio (tipo_servico, veiculo_placa, destino, responsavel_envio, data_saida, previsao_retorno, status, criado_por_nome)
    values ('Pecas para Pintura', 'ZZT-0001', 'ZZTESTE Oficina Um', 'ZZTESTE', now(), hoje + 7, 'Saiu', 'ZZTESTE') returning id into vis;
  insert into public.vistorias_patio (tipo_servico, veiculo_placa, destino, responsavel_envio, data_saida, previsao_retorno, status, criado_por_nome)
    values ('Pecas para Pintura', 'ZZT-0002', 'ZZTESTE Oficina Dois', 'ZZTESTE', now(), hoje + 7, 'Saiu', 'ZZTESTE') returning id into vis2;
  v := pg_temp.ligar(c2, array[s_a, s_b], vis);
  perform pg_temp.confere('V1 quem não pediu não liga a saída: recusa com permissão', pg_temp.recusou(v, 'ligam a saída') and v like 'ERRO 42501%', v);
  v := pg_temp.ligar(c1, array[s_a, s_b], gen_random_uuid());
  perform pg_temp.confere('V2 saída que não existe na vistoria: recusa', pg_temp.recusou(v, 'não foi encontrada'), v);
  v := pg_temp.ligar(c1, array[s_a, s_b], vis);
  perform pg_temp.confere('V3 quem pediu liga os dois serviços à mesma saída (uma viagem, vários serviços)', v not like 'ERRO%' and jsonb_array_length(v::jsonb) = 2
    and (select count(*) from public.terceiros_servicos where vistoria_id = vis) = 2, v);
  select * into sv from public.terceiros_servicos where id = s_a;
  perform pg_temp.confere('V4 o histórico diz a saída ligada (o destino e o dia) e o serviço guarda quem ligou', pg_temp.hist_tem(sv.historico, 'vistoria_ligada') and sv.vistoria_ligada_por is not null
    and (select e ->> 'detalhe' from jsonb_array_elements(sv.historico) e where e ->> 'acao' = 'vistoria_ligada' limit 1) like '%ZZTESTE Oficina Um%');
  v := pg_temp.ligar(c1, array[s_a], vis);
  perform pg_temp.confere('V5 ligar de novo à MESMA saída não dá erro (repetir o clique é inofensivo)', v not like 'ERRO%', v);
  v := pg_temp.ligar(c1, array[s_a], vis2);
  perform pg_temp.confere('V6 serviço já ligado a OUTRA saída: recusa e manda desligar antes', pg_temp.recusou(v, 'outra saída'), v);
  v := pg_temp.cancelar(c1, array[s_d], 'ZZTESTE cancelar', 'solicitado');
  v := pg_temp.ligar(c1, array[s_d], vis);
  perform pg_temp.confere('V7 serviço cancelado não liga', pg_temp.recusou(v, 'cancelado'), v);
  v := pg_temp.desligar(c1, array[s_a], 'x');
  perform pg_temp.confere('V8 desligar sem motivo de 5 letras: recusa', pg_temp.recusou(v, 'motivo'), v);
  v := pg_temp.desligar(c2, array[s_a], 'ZZTESTE ligada por engano');
  perform pg_temp.confere('V9 quem não pediu não desliga', pg_temp.recusou(v, 'desligam') and v like 'ERRO 42501%', v);
  v := pg_temp.desligar(c1, array[s_a], 'ZZTESTE ligada por engano');
  select * into sv from public.terceiros_servicos where id = s_a;
  perform pg_temp.confere('V10 desligar com motivo: a ligação some e o histórico guarda o motivo', v not like 'ERRO%' and sv.vistoria_id is null and sv.vistoria_ligada_em is null and pg_temp.hist_tem(sv.historico, 'vistoria_desligada')
    and (select e ->> 'detalhe' from jsonb_array_elements(sv.historico) e where e ->> 'acao' = 'vistoria_desligada' limit 1) like '%ZZTESTE ligada por engano%');
  v := pg_temp.desligar(c1, array[s_a], 'ZZTESTE de novo');
  perform pg_temp.confere('V11 desligar o que não está ligado: recusa', pg_temp.recusou(v, 'não está ligado'), v);
  v := pg_temp.ligar(c1, array[s_a], vis2);
  perform pg_temp.confere('V12 depois de desligado, liga a outra saída', v not like 'ERRO%' and (select vistoria_id from public.terceiros_servicos where id = s_a) = vis2, v);

  -- a saída das peças de uma ORDEM: a Adaptação liga os serviços da ordem à saída (a ordem em andamento não impede)
  v := pg_temp.pedir(c1, t_pin, 'ZZTESTE T5 pintura 1', ops[6:6], format(', p_prestador_id => %L::uuid', p1)); s_f := (pg_temp.ids_de(v))[1];
  v := pg_temp.o_montar(ada, array[s_f], p1, hoje, hoje + 5);
  perform pg_temp.confere('V13 a ordem de pintura monta (preparo)', v not like 'ERRO%', v);
  v := pg_temp.ligar(ada, array[s_f], vis);
  perform pg_temp.confere('V14 serviço de uma ordem montada liga a saída (é a viagem das peças da ordem): a Adaptação pode', v not like 'ERRO%', v);
  v := pg_temp.ligar(c2, array[s_f], vis);
  perform pg_temp.confere('V15 quem não pediu continua sem poder', pg_temp.recusou(v, 'ligam a saída'), v);

  -- ── S. a pintura da Serralheria vira serviço ────────────────────────────────────────────────────────────────────────────────────────────────
  insert into public.demandas_avulsas (setor, titulo, status, pintura, pintura_tipo, itens, criado_por_nome)
    values ('Serralheria', 'ZZTESTE T5 suporte pintado', 'Concluída', true, 'eletrostática preta', '[{"nome":"Suporte","quantidade":4}]'::jsonb, 'ZZTESTE') returning id into dem2;
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, %L, p_ligacoes => %L::jsonb, p_pecas => %L::jsonb, p_observacao => %L)::text$q$,
        t_pin, 'Pintura — ZZTESTE T5 suporte pintado', jsonb_build_array(jsonb_build_object('tipo', 'demanda', 'id', dem2))::text, '[{"descricao":"Suporte","quantidade":4}]', 'eletrostática preta'));
  ids2 := pg_temp.ids_de(v);
  perform pg_temp.confere('S1 o serviço de pintura eletrostática nasce ligado à demanda da Serralheria, com as peças e o texto do tipo de pintura',
    array_length(ids2, 1) = 1 and (select ligacao_tipo = 'demanda' and ligacao_id = dem2 and ligacao_rotulo = 'ZZTESTE T5 suporte pintado' and observacao = 'eletrostática preta'
                                         and jsonb_array_length(pecas) = 1 and status = 'solicitado' from public.terceiros_servicos where id = ids2[1]), v);
  update public.demandas_avulsas set pintura_servico_id = ids2[1] where id = dem2;
  perform pg_temp.confere('S2 a demanda guarda o serviço (a coluna nova), para concluir de novo não abrir outro', (select pintura_servico_id from public.demandas_avulsas where id = dem2) = ids2[1]);
  v := pg_temp.como(c1, format($q$select public.terceiros_solicitar(%L, %L, p_ligacoes => %L::jsonb)::text$q$, t_pin, 'Pintura — repetida', jsonb_build_array(jsonb_build_object('tipo', 'demanda', 'id', dem2))::text));
  perform pg_temp.confere('S3 pedir a pintura da MESMA demanda de novo, com a primeira em aberto: o banco recusa (TS001) e a tela não duplica', v like 'ERRO TS001%', v);

  raise exception E'TESTE DAS REGRAS (Serviços de terceiros, T5) — % verificações, % falha(s)\n%',
    coalesce(current_setting('terceiros_teste.total', true), '0'), coalesce(nullif(current_setting('terceiros_teste.falhas', true), ''), '0'), current_setting('terceiros_teste.rel', true);
end $t$;
rollback;
