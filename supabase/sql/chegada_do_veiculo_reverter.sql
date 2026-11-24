-- Desfaz chegada_do_veiculo.sql. ATENÇÃO: apaga as três colunas (e o que foi gravado nelas). As datas de entrega já calculadas ficam como estão.
drop trigger if exists oples_calcular_entrega_pela_chegada on public.oples;
drop function if exists public.oples_calcular_entrega_pela_chegada();
alter table public.oples drop constraint if exists oples_prazo_dias_apos_chegada_ck;
alter table public.oples
  drop column if exists prazo_dias_apos_chegada,
  drop column if exists veiculo_chegou_em,
  drop column if exists veiculo_chegou_por;
