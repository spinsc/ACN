-- Desfaz terceiros_so_servico_migrar_ops.sql (25/11/2026): devolve as 22 OPs de A1760.2611, A1797.2611 e A1806.2611 ao fluxo e à etapa de antes (a cópia está em
-- `oples_antes_so_terceiro_20261125`) e CANCELA os 24 serviços que a migração abriu (nada se apaga: o serviço fica cancelado, com o motivo).
-- Só mexe na OP que ainda está em "Aguardando Servico de Terceiro" e no serviço que ainda está "solicitado" (A definir): OP que já andou ou serviço já agendado/realizado
-- não é tocado, e a conta fica no aviso final para decidir à mão.
do $reverter$
declare
  v_por constant text := 'Migração (fluxo só de terceiro)';
  v_ops int; v_servicos int; v_pendentes int;
begin
  update public.terceiros_servicos s
     set status = 'cancelado', cancelado_motivo = 'Migração desfeita: a OP voltou ao fluxo de antes.', cancelado_em = now(), atualizado_por = v_por
   where s.atualizado_por = v_por and s.status = 'solicitado' and s.ligacao_tipo = 'op'
     and s.ligacao_id in (select id from public.oples_antes_so_terceiro_20261125);
  get diagnostics v_servicos = row_count;

  update public.oples o
     set fluxo_entrega = c.fluxo_entrega, status_geral = c.status_geral, data_chegada_pcp = c.data_chegada_pcp
    from public.oples_antes_so_terceiro_20261125 c
   where o.id = c.id and o.status_geral = 'Aguardando Servico de Terceiro' and o.fluxo_entrega = 'somente_servico_terceiro';
  get diagnostics v_ops = row_count;

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
  select c.id, c.opl, 'Serviços de terceiros', 'Passagem para o fluxo "Somente serviço de terceiro" desfeita: a OP voltou ao fluxo de antes',
         'Aguardando Servico de Terceiro', c.status_geral, v_por, now()
    from public.oples_antes_so_terceiro_20261125 c join public.oples o on o.id = c.id
   where o.fluxo_entrega = c.fluxo_entrega and o.status_geral = c.status_geral;

  select count(*) into v_pendentes from public.oples o join public.oples_antes_so_terceiro_20261125 c on c.id = o.id where o.fluxo_entrega = 'somente_servico_terceiro';
  raise notice 'REVERSÃO: % OPs devolvidas, % serviços cancelados, % OPs ainda no fluxo novo (já andaram: decidir à mão)', v_ops, v_servicos, v_pendentes;
end
$reverter$;
