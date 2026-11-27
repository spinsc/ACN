-- Teste de fiscal_regras.sql (27/11/2026): TUDO DESFEITO no fim (o relatorio volta na mensagem de erro "TESTE REGRAS FISCAIS").
-- Roda como a conta de teste ZZTESTE (auth_id e id abaixo); o perfil e as abas dela sao trocados por instantes (desfeito junto) para provar quem pode e quem nao pode.
-- Qualquer linha com "<< FALHA" e defeito.
do $teste$
declare
  r text := ''; n int; n2 int; j jsonb; v1 uuid; v2 uuid; v3 uuid; ra uuid; rb uuid; rc uuid; outro uuid; ok boolean;
  eu constant uuid := 'c399c9dc-db94-47c4-8943-5ef20aa2125d';
  emit text;
begin
  select codigo into emit from public.fiscal_emitentes order by codigo limit 1;
  select id into outro from public.auth_usuarios where id <> eu and coalesce(ativo, false) order by id limit 1;
  perform set_config('request.jwt.claims', '{"sub":"cf31bc23-b910-4ea5-9056-a6cb2427fad7","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'cf31bc23-b910-4ea5-9056-a6cb2427fad7', true);
  -- ponto de partida: a ZZTESTE com a aba fiscal e perfil comum
  update public.auth_usuarios set perfil = 'Almoxarifado', abas_permitidas = '["fiscal"]'::jsonb where id = eu;
  execute 'set local role authenticated';

  -- 1) banco novo: nenhuma versao, nenhuma regra
  select count(*) into n from public.fiscal_regras_versoes;
  r := r || (case when n = 0 then 'OK    nasce vazio (nenhuma versao)' else '<< FALHA ja havia ' || n || ' versao(oes)' end) || E'\n';

  -- 2) quem tem a aba cria o rascunho; o autor e o editor
  v1 := public.fiscal_regras_nova_versao(null, null);
  select count(*) into n from public.fiscal_regras_versoes where id = v1 and situacao = 'rascunho' and ultimo_editor_id = eu and criada_por_id = eu and titulo like 'Versão%';
  r := r || (case when n = 1 then 'OK    rascunho criado com titulo padrao e o autor como editor' else '<< FALHA rascunho' end) || E'\n';

  -- 3) so um rascunho por vez
  begin perform public.fiscal_regras_nova_versao(null, null); r := r || '<< FALHA abriu um segundo rascunho' || E'\n';
  exception when others then r := r || (case when sqlerrm like 'Já existe um rascunho%' then 'OK    segundo rascunho recusado' else '<< FALHA mensagem: ' || sqlerrm end) || E'\n'; end;

  -- 4) regra A (dentro da UF, venda): grava, o gatilho registra o autor; condicoes iguais sao recusadas
  insert into public.fiscal_regras (versao_id, rotulo, emitente, tipo_operacao, destino, cfop, cst_csosn, aliquota_icms_pct) values (v1, 'Venda dentro da UF', emit, 'venda_material', 'dentro_uf', '5102', '00', 12.00) returning id into ra;
  select count(*) into n from public.fiscal_regras where id = ra and atualizado_por_id = eu and confirmada = false;
  r := r || (case when n = 1 then 'OK    regra gravada como "a confirmar" e com o autor' else '<< FALHA regra A' end) || E'\n';
  begin insert into public.fiscal_regras (versao_id, rotulo, emitente, tipo_operacao, destino, cfop, cst_csosn) values (v1, 'Repetida', emit, 'venda_material', 'dentro_uf', '5102', '00'); r := r || '<< FALHA aceitou regra com as mesmas condicoes' || E'\n';
  exception when unique_violation then r := r || 'OK    regra com as mesmas condicoes recusada' || E'\n'; end;
  begin insert into public.fiscal_regras (versao_id, rotulo, cfop, cst_csosn) values (v1, 'cfop ruim', '51', '00'); r := r || '<< FALHA aceitou CFOP de 2 digitos' || E'\n';
  exception when check_violation then r := r || 'OK    CFOP invalido recusado' || E'\n'; end;

  -- 5) quem nao e gerente nem Admin nao aprova
  begin perform public.fiscal_regras_aprovar(v1, 'nota de teste'); r := r || '<< FALHA perfil comum aprovou' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    perfil comum nao aprova' || E'\n'; end;

  -- 6) gerente: regra nao confirmada barra
  execute 'reset role'; update public.auth_usuarios set perfil = 'Gerente Teste' where id = eu; execute 'set local role authenticated';
  begin perform public.fiscal_regras_aprovar(v1, 'nota de teste'); r := r || '<< FALHA aprovou regra nao confirmada' || E'\n';
  exception when others then r := r || (case when sqlerrm like '% ainda não foram confirmadas%' then 'OK    regra nao confirmada barra a aprovacao' else '<< FALHA mensagem: ' || sqlerrm end) || E'\n'; end;
  update public.fiscal_regras set confirmada = true, fonte = 'e-mail da contabilidade (teste)' where id = ra;

  -- 7) conflito: B vale junto com A (fora_uf nao, entao uso o mesmo destino) e nenhuma e mais especifica
  insert into public.fiscal_regras (versao_id, rotulo, emitente, tipo_operacao, destino, ncm_prefixo, cfop, cst_csosn, confirmada, fonte) values (v1, 'B', null, 'venda_material', 'dentro_uf', '8512', '5101', '00', true, 'teste') returning id into rb;
  select count(*) into n from public.fiscal_regras_conflitos(v1);
  r := r || (case when n = 1 then 'OK    A (emitente) e B (ncm) valem juntas e nenhuma contem a outra: 1 conflito' else '<< FALHA conflito esperado, achou ' || n end) || E'\n';
  begin perform public.fiscal_regras_aprovar(v1, 'nota de teste'); r := r || '<< FALHA aprovou versao com regras que se contradizem' || E'\n';
  exception when others then r := r || (case when sqlerrm like '%se contradizem%' then 'OK    conflito barra a aprovacao' else '<< FALHA mensagem: ' || sqlerrm end) || E'\n'; end;
  delete from public.fiscal_regras where id = rb;

  -- 8) dupla conferencia: quem editou por ultimo nao aprova (gerente); outro editor, sim
  begin perform public.fiscal_regras_aprovar(v1, 'nota de teste'); r := r || '<< FALHA o proprio editor (gerente) aprovou' || E'\n';
  exception when others then r := r || (case when sqlstate = '42501' then 'OK    o gerente que editou por ultimo nao aprova a propria versao' else '<< FALHA outro erro: ' || sqlerrm end) || E'\n'; end;
  execute 'reset role'; update public.fiscal_regras_versoes set ultimo_editor_id = outro where id = v1; execute 'set local role authenticated';
  j := public.fiscal_regras_aprovar(v1, 'Aprovada no teste');
  select count(*) into n from public.fiscal_regras_versoes where id = v1 and situacao = 'aprovada' and aprovada_por_id = eu and aprovada_pelo_proprio_editor = false and nota_aprovacao = 'Aprovada no teste';
  r := r || (case when n = 1 and (j->>'pelo_proprio_editor')::boolean = false then 'OK    aprovada por outro gerente: vigente, com quem aprovou e a nota' else '<< FALHA aprovacao' end) || E'\n';

  -- 9) versao aprovada congelada: nao muda, nao apaga, nao recebe regra
  begin update public.fiscal_regras set cfop = '5101' where id = ra; r := r || '<< FALHA editou regra de versao aprovada' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    regra de versao aprovada nao se edita' || E'\n'; end;
  begin delete from public.fiscal_regras where id = ra; r := r || '<< FALHA apagou regra de versao aprovada' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    regra de versao aprovada nao se apaga' || E'\n'; end;
  begin insert into public.fiscal_regras (versao_id, rotulo, cfop, cst_csosn) values (v1, 'extra', '5102', '00'); r := r || '<< FALHA acrescentou regra a versao aprovada' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    versao aprovada nao recebe regra nova' || E'\n'; end;
  begin perform public.fiscal_regras_descartar(v1); r := r || '<< FALHA descartou versao aprovada' || E'\n';
  exception when others then r := r || 'OK    versao aprovada nao se descarta' || E'\n'; end;
  begin update public.fiscal_regras_versoes set titulo = 'x' where id = v1; r := r || '<< FALHA alterou versao direto' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    versao so muda pelas funcoes (sem direito direto)' || E'\n'; end;

  -- 10) nova versao copia a vigente (com a confirmacao e a fonte)
  v2 := public.fiscal_regras_nova_versao(null, 'Segunda versao');
  select count(*) into n from public.fiscal_regras where versao_id = v2 and rotulo = 'Venda dentro da UF' and confirmada and fonte like 'e-mail%';
  r := r || (case when n = 1 then 'OK    a versao nova nasce como copia da vigente' else '<< FALHA copia da vigente' end) || E'\n';

  -- 11) regra mais especifica que outra NAO e conflito; Admin aprova o que ele mesmo editou (fica registrado) e a antiga vira "substituida"
  insert into public.fiscal_regras (versao_id, rotulo, emitente, tipo_operacao, destino, ncm_prefixo, cfop, cst_csosn, confirmada, fonte) values (v2, 'Mais especifica', emit, 'venda_material', 'dentro_uf', '8512', '5101', '00', true, 'teste') returning id into rc;
  select count(*) into n from public.fiscal_regras_conflitos(v2);
  r := r || (case when n = 0 then 'OK    regra mais especifica (mais condicoes) nao e conflito' else '<< FALHA conflito indevido: ' || n end) || E'\n';
  execute 'reset role'; update public.auth_usuarios set perfil = 'Admin' where id = eu; execute 'set local role authenticated';
  j := public.fiscal_regras_aprovar(v2, 'Admin aprova a propria edicao');
  select count(*) into n from public.fiscal_regras_versoes where id = v2 and situacao = 'aprovada' and aprovada_pelo_proprio_editor;
  r := r || (case when n = 1 and (j->>'pelo_proprio_editor')::boolean then 'OK    o Admin aprova o que editou e fica registrado' else '<< FALHA admin proprio editor' end) || E'\n';
  select count(*) into n from public.fiscal_regras_versoes where situacao = 'aprovada';
  select exists(select 1 from public.fiscal_regras_versoes where id = v1 and situacao = 'substituida' and substituida_por = v2) into ok;
  r := r || (case when n = 1 and ok then 'OK    so uma vigente; a anterior virou substituida e aponta para a nova' else '<< FALHA vigente/substituida' end) || E'\n';

  -- 12) aprovar de novo / descartar rascunho
  begin perform public.fiscal_regras_aprovar(v2, 'de novo, de novo'); r := r || '<< FALHA reaprovou' || E'\n';
  exception when others then r := r || (case when sqlerrm like '%não está mais em rascunho%' then 'OK    versao ja aprovada nao se aprova de novo' else '<< FALHA mensagem: ' || sqlerrm end) || E'\n'; end;
  v3 := public.fiscal_regras_nova_versao(null, null);
  perform public.fiscal_regras_descartar(v3);
  select count(*) into n from public.fiscal_regras_versoes where id = v3;
  select count(*) into n2 from public.fiscal_regras where versao_id = v3;
  r := r || (case when n = 0 and n2 = 0 then 'OK    rascunho descartado (com as regras dele)' else '<< FALHA descartar' end) || E'\n';

  -- 13) quem nao tem a aba fiscal nao grava regra nem cria versao; a chave publica nao executa nada
  execute 'reset role'; update public.auth_usuarios set perfil = 'Almoxarifado', abas_permitidas = '["rh"]'::jsonb where id = eu; execute 'set local role authenticated';
  begin perform public.fiscal_regras_nova_versao(null, null); r := r || '<< FALHA quem nao tem a aba criou versao' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    sem a aba Fiscal nao se cria versao' || E'\n'; end;
  begin insert into public.fiscal_regras (versao_id, rotulo, cfop, cst_csosn) values (v2, 'x', '5102', '00'); r := r || '<< FALHA quem nao tem a aba gravou regra' || E'\n';
  exception when others then r := r || 'OK    sem a aba Fiscal nao se grava regra' || E'\n'; end;
  select count(*) into n from public.fiscal_regras_versoes;
  r := r || (case when n >= 2 then 'OK    quem entrou le as versoes mesmo sem a aba' else '<< FALHA leitura' end) || E'\n';
  execute 'reset role';
  r := r || (case when not has_function_privilege('anon', 'public.fiscal_regras_aprovar(uuid,text)', 'execute') and not has_function_privilege('anon', 'public.fiscal_regras_nova_versao(uuid,text)', 'execute')
                   and not has_table_privilege('anon', 'public.fiscal_regras', 'select') and not has_table_privilege('anon', 'public.fiscal_regras_versoes', 'select')
             then 'OK    a chave publica nao le nem executa nada' else '<< FALHA a chave publica tem direito' end) || E'\n';
  r := r || (case when not has_function_privilege('authenticated', 'public.fiscal_regras_guarda()', 'execute') and not has_function_privilege('authenticated', 'public.fiscal_regras_versoes_guarda()', 'execute')
             then 'OK    os gatilhos nao sao executaveis por quem entrou' else '<< FALHA gatilho executavel' end) || E'\n';

  raise exception 'TESTE REGRAS FISCAIS%', E'\n' || r;
end $teste$;
