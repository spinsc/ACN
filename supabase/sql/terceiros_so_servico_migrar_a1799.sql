-- MIGRAÇÃO da venda A1799.2611 (2 OPs, quadriciclos da Dorvalino Motos) para o fluxo "Somente serviço de terceiro" (pedido do usuário em 25/11/2026:
-- "1799 deve ser alterado também e gerado serviço de terceiro de pintura total e plotagem").
--
-- Diferença para a migração das outras 3 vendas (terceiros_so_servico_migrar_ops.sql): estas 2 OPs já estavam em "Aguardando Inicio Producao", com a BOM liberada e o kit
-- com UMA linha só, o pseudo-item "Serviço de pintura e plotagem" (sem item de estoque, sem reserva, sem movimento de estoque, sem equipe, sem BOX e sem produção iniciada),
-- e já tinham os serviços Plotagem e Pintura (TS-00197 a TS-00200, "A definir", da migração da caixinha de 23/11/2026). Por isso aqui NÃO se criam serviços (a migração confere que
-- os dois tipos existem vivos em cada OP e para se faltar algum) e `data_chegada_pcp` e a BOM/kit ficam como estão (a OP passou mesmo pelo PCP e pelo Almoxarifado; nada se apaga).
-- Guarda o estado de antes em `oples_antes_so_terceiro_20261125` (a mesma cópia da migração anterior; a reversão dela devolve também estas 2).
-- Ensaio: v_teste = true (relata na mensagem de erro e DESFAZ tudo).
do $migracao$
declare
  v_teste constant boolean := false;
  v_por constant text := 'Migração (fluxo só de terceiro)';
  v_ops_esperadas constant int := 2;
  v_ops int; v_mudadas int; v_faltam int; v_relatorio text;
begin
  create table if not exists public.oples_antes_so_terceiro_20261125 (
    id uuid primary key, opl text, fluxo_entrega text, status_geral text, data_chegada_pcp timestamptz, guardado_em timestamptz default now());

  create temporary table tmp_op_a1799 on commit drop as
  select o.id, o.opl, o.fluxo_entrega, o.status_geral, o.data_chegada_pcp
    from public.oples o
   where regexp_replace(o.opl, '/[0-9]+$', '') = 'A1799.2611' and o.excluida_em is null and o.status_geral = 'Aguardando Inicio Producao';

  select count(*) into v_ops from tmp_op_a1799;
  if v_ops <> v_ops_esperadas then
    raise exception 'A migração parou: esperava % OPs em "Aguardando Inicio Producao" na venda A1799.2611 e achou %. Nada foi gravado.', v_ops_esperadas, v_ops;
  end if;

  -- cada OP precisa ter vivo (qualquer situação menos cancelado) o serviço de Plotagem e o de Pintura
  select count(*) into v_faltam
    from tmp_op_a1799 t cross join (values ('Plotagem'), ('Pintura')) as n(nome)
   where not exists (select 1 from public.terceiros_servicos s join public.terceiros_tipos tp on tp.id = s.tipo_id
                      where s.ligacao_tipo = 'op' and s.ligacao_id = t.id and tp.nome = n.nome and s.status <> 'cancelado');
  if v_faltam > 0 then
    raise exception 'A migração parou: faltam % serviço(s) de Plotagem ou Pintura vivos nessas OPs. Nada foi gravado.', v_faltam;
  end if;

  insert into public.oples_antes_so_terceiro_20261125 (id, opl, fluxo_entrega, status_geral, data_chegada_pcp)
  select id, opl, fluxo_entrega, status_geral, data_chegada_pcp from tmp_op_a1799 on conflict (id) do nothing;

  update public.oples o set fluxo_entrega = 'somente_servico_terceiro', status_geral = 'Aguardando Servico de Terceiro'
    from tmp_op_a1799 t where o.id = t.id and o.status_geral = 'Aguardando Inicio Producao';
  get diagnostics v_mudadas = row_count;
  if v_mudadas <> v_ops then
    raise exception 'A migração parou: mudaram % de % OPs. Nada foi gravado.', v_mudadas, v_ops;
  end if;

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
  select t.id, t.opl, 'Serviços de terceiros',
         'OP passada para o fluxo "Somente serviço de terceiro" (pedido do usuário em 25/11/2026): a pintura total e a plotagem são feitas só por terceiro; sai da fila da Adaptação',
         'Aguardando Inicio Producao', 'Aguardando Servico de Terceiro', v_por, now()
    from tmp_op_a1799 t;

  v_relatorio := format('OPs passadas: %s | serviços vivos conferidos: Plotagem e Pintura em cada uma | nenhum serviço novo', v_mudadas);
  if v_teste then
    raise exception 'ENSAIO DA MIGRAÇÃO A1799 (tudo desfeito): %', v_relatorio;
  end if;
  raise notice 'MIGRAÇÃO A1799: %', v_relatorio;
end
$migracao$;
