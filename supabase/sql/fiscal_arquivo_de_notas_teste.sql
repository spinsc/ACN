-- Teste de fiscal_arquivo_de_notas.sql (26/11/2026): 10 conferencias, TUDO DESFEITO no fim (o relatorio volta na mensagem de erro "TESTE FISCAL").
-- Roda como a conta de teste ZZTESTE (auth_id e id abaixo) e grava so notas INVENTADAS. A ZZTESTE nao ve valores: o teste liga a marca por um instante (desfeito junto).
-- Qualquer linha com "<< FALHA" e defeito.
do $teste$
declare
  r text := ''; j jsonb; n int; v_ok boolean;
  c1 text := '42261173628307000105550030000000011123456781';
  c2 text := '42261173628307000105550030000000021123456782';
  nota1 jsonb; nota2 jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"cf31bc23-b910-4ea5-9056-a6cb2427fad7","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'cf31bc23-b910-4ea5-9056-a6cb2427fad7', true);
  update public.auth_usuarios set ver_valores = false where id = 'c399c9dc-db94-47c4-8943-5ef20aa2125d';
  execute 'set local role authenticated';

  begin
    perform public.fiscal_guardar('[{"chave":"x"}]'::jsonb, '[]'::jsonb, '[]'::jsonb);
    r := r || '<< FALHA quem nao ve valores guardou nota' || E'\n';
  exception when sqlstate '42501' then r := r || 'OK    quem nao ve valores nao guarda notas' || E'\n'; end;

  execute 'reset role';
  update public.auth_usuarios set ver_valores = true where id = 'c399c9dc-db94-47c4-8943-5ef20aa2125d';
  execute 'set local role authenticated';

  nota1 := jsonb_build_object('chave', c1, 'emitente_cnpj', '73628307000105', 'emitente_nome', 'EMPRESA TESTE', 'modelo', '55', 'serie', '3', 'numero', '1', 'emissao_dia', '2026-11-20',
    'destinatario_doc', '05481897000136', 'destinatario_nome', 'CLIENTE INVENTADO', 'destinatario_uf', 'SC', 'natureza', 'VENDA', 'fin_nfe', '1', 'autorizada', null, 'cstat', '',
    'qtd_itens', 2, 'bloqueios', 0, 'alertas', 1, 'regras', '["sem_protocolo"]'::jsonb, 'arquivo', 'a.xml', 'valor_nf', '200.00', 'xml', '<x>nota1</x>');
  nota2 := jsonb_build_object('chave', c2, 'emitente_cnpj', '73628307000105', 'modelo', '55', 'serie', '3', 'numero', '2', 'emissao_dia', '2026-11-20', 'autorizada', true, 'cstat', '100',
    'valor_nf', '10.50', 'xml', '<x>nota2</x>', 'regras', '[]'::jsonb);

  j := public.fiscal_guardar(jsonb_build_array(nota1, nota2),
    jsonb_build_array(jsonb_build_object('chave', c2, 'tp_evento', '110111', 'sequencia', '1', 'data_dia', '2026-11-21', 'texto', 'erro', 'cstat', '135', 'arquivo', 'ev.xml', 'xml', '<ev/>')),
    jsonb_build_array(jsonb_build_object('cnpj', '73628307000105', 'serie', '3', 'modelo', '55', 'de', '5', 'ate', '7', 'ano', '26', 'cstat', '102', 'arquivo', 'in.xml', 'xml', '<in/>')));
  r := r || (case when (j->>'novas')::int = 2 and (j->>'eventos_novos')::int = 1 and (j->>'inutilizacoes_novas')::int = 1 and (j->>'repetidas')::int = 0 then 'OK    1a gravacao: 2 notas, 1 evento, 1 inutilizacao' else '<< FALHA 1a gravacao: ' || j::text end) || E'\n';

  j := public.fiscal_guardar(jsonb_build_array(nota1, nota2),
    jsonb_build_array(jsonb_build_object('chave', c2, 'tp_evento', '110111', 'sequencia', '1', 'xml', '<ev/>')),
    jsonb_build_array(jsonb_build_object('cnpj', '73628307000105', 'serie', '3', 'modelo', '55', 'de', '5', 'ate', '7', 'xml', '<in/>')));
  r := r || (case when (j->>'novas')::int = 0 and (j->>'repetidas')::int = 2 and (j->>'eventos_repetidos')::int = 1 and (j->>'inutilizacoes_repetidas')::int = 1 then 'OK    2a gravacao nao regrava nada' else '<< FALHA 2a gravacao: ' || j::text end) || E'\n';

  j := public.fiscal_guardar(jsonb_build_array(nota1 || jsonb_build_object('autorizada', true, 'cstat', '100', 'regras', '[]'::jsonb, 'alertas', 0)), '[]'::jsonb, '[]'::jsonb);
  r := r || (case when (j->>'atualizadas')::int = 1 and (j->>'novas')::int = 0 then 'OK    nota guardada sem protocolo recebe o protocolo depois' else '<< FALHA protocolo: ' || j::text end) || E'\n';
  select autorizada into v_ok from public.fiscal_notas where chave = c1;
  r := r || (case when v_ok is true then 'OK    a nota ficou autorizada' else '<< FALHA a nota nao ficou autorizada' end) || E'\n';

  select count(*) into n from public.fiscal_arquivos where ref in (c1, c2, 'ev:' || c2 || ':110111:1', 'inut:73628307000105:3:55:5-7');
  r := r || (case when n = 4 then 'OK    4 XMLs guardados (2 notas, 1 evento, 1 inutilizacao)' else '<< FALHA XMLs guardados: ' || n end) || E'\n';
  select count(*) into n from public.fiscal_notas_valores where chave in (c1, c2);
  r := r || (case when n = 2 then 'OK    2 valores guardados' else '<< FALHA valores: ' || n end) || E'\n';

  begin
    perform public.fiscal_guardar(jsonb_build_array(nota2 || jsonb_build_object('chave', '123', 'numero', '9')), '[]'::jsonb, '[]'::jsonb);
    r := r || '<< FALHA chave de 3 digitos foi aceita' || E'\n';
  exception when others then r := r || 'OK    chave que nao tem 44 digitos e recusada' || E'\n'; end;

  execute 'set local role anon';
  begin
    perform count(*) from public.fiscal_notas;
    r := r || '<< FALHA a chave publica leu fiscal_notas' || E'\n';
  exception when insufficient_privilege then r := r || 'OK    a chave publica nao le as notas' || E'\n'; end;
  begin
    perform public.fiscal_guardar('[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
    r := r || '<< FALHA a chave publica executou fiscal_guardar' || E'\n';
  exception when insufficient_privilege then r := r || 'OK    a chave publica nao executa fiscal_guardar' || E'\n'; end;

  raise exception 'TESTE FISCAL (desfeito):%', E'\n' || r;
end
$teste$;
