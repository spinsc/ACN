-- Cronômetro por item do pedido de desenvolvimento (pedido do usuário em 16/11/2026): cada item do pedido do PCP tem o seu próprio relógio, em hora útil (segunda a sexta, 8:00 às 17:48),
-- com pausa e retomada, como a demanda avulsa (HorarioDemanda.ts). `trechos` é a lista de {de, ate, por}; data_inicio = primeira vez que o item foi iniciado; data_fim = entrega ou cancelamento.
-- Itens que já estavam em andamento ficam sem tempo (colunas nulas): nenhum tempo é inventado.
alter table public.engenharia_desenvolvimento_itens add column if not exists data_inicio timestamptz;
alter table public.engenharia_desenvolvimento_itens add column if not exists data_fim timestamptz;
alter table public.engenharia_desenvolvimento_itens add column if not exists trechos jsonb;
comment on column public.engenharia_desenvolvimento_itens.trechos is 'Trechos de trabalho do item: lista de {de, ate, por}; o relógio do item (ver HorarioDemanda.ts)';
-- para desfazer: alter table public.engenharia_desenvolvimento_itens drop column data_inicio, drop column data_fim, drop column trechos;
