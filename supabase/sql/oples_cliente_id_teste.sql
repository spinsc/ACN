-- Teste de oples_cliente_id.sql (27/11/2026): 5 conferências, TUDO DESFEITO no fim (o relatório volta na mensagem de erro "TESTE OPLES CLIENTE_ID").
-- Usa UMA OP e UM cliente que já existem só para mexer na ligação dentro da transação (nada é gravado de verdade). Qualquer linha com "<< FALHA" é defeito.
-- Rode fora do horário de pico: o UPDATE trava a linha da OP por alguns milissegundos.
do $teste$
declare
  r text := ''; v_op uuid; v_cli uuid; v_nome text; v_id uuid;
begin
  select id, cliente_nome into v_op, v_nome from public.oples where cliente_id is null and coalesce(cliente_nome, '') <> '' limit 1;
  select id into v_cli from public.clientes limit 1;
  if v_op is null or v_cli is null then raise exception 'TESTE OPLES CLIENTE_ID: sem OP ou sem cliente para provar'; end if;

  -- 1) ligar sem mexer no nome: a ligação fica
  update public.oples set cliente_id = v_cli where id = v_op;
  select cliente_id into v_id from public.oples where id = v_op;
  r := r || case when v_id = v_cli then 'OK    ligar a OP guarda o cliente_id' else '<< FALHA a ligação não ficou' end || E'\n';

  -- 2) mudar SÓ o nome: a ligação é desfeita (o id era do cliente que o nome antigo dizia)
  update public.oples set cliente_nome = v_nome || ' (outro)' where id = v_op;
  select cliente_id into v_id from public.oples where id = v_op;
  r := r || case when v_id is null then 'OK    mudar só o nome desfaz a ligação' else '<< FALHA o nome mudou e a ligação ficou' end || E'\n';

  -- 3) mudar o nome E escolher o cadastro na mesma gravação: a ligação fica
  update public.oples set cliente_nome = v_nome, cliente_id = v_cli where id = v_op;
  select cliente_id into v_id from public.oples where id = v_op;
  r := r || case when v_id = v_cli then 'OK    nome e cliente escolhidos juntos mantêm a ligação' else '<< FALHA nome e ligação juntos perderam a ligação' end || E'\n';

  -- 4) gravar o MESMO nome (sem mudar): a ligação fica (o gatilho nem dispara)
  update public.oples set cliente_nome = v_nome where id = v_op;
  select cliente_id into v_id from public.oples where id = v_op;
  r := r || case when v_id = v_cli then 'OK    gravar o mesmo nome não mexe na ligação' else '<< FALHA o mesmo nome desfez a ligação' end || E'\n';

  -- 5) mexer em outra coluna da OP: a ligação fica
  update public.oples set observacoes_comercial = coalesce(observacoes_comercial, '') where id = v_op;
  select cliente_id into v_id from public.oples where id = v_op;
  r := r || case when v_id = v_cli then 'OK    mexer em outra coluna não mexe na ligação' else '<< FALHA outra coluna desfez a ligação' end || E'\n';

  raise exception 'TESTE OPLES CLIENTE_ID (tudo desfeito):%', E'\n' || r;
end
$teste$;
