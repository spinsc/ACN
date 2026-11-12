-- Demandas gerais do Financeiro: pedido de pagamento a terceiro (pedido do usuário em 05/11/2026).
-- A demanda do setor Financeiro passa a guardar o favorecido, o tipo de custo, o valor, o vencimento e a forma de pagamento num campo só (jsonb, como as outras
-- informações específicas de um setor na demanda avulsa). A OS (ou OP, PV…) se liga pelos vínculos que toda demanda já tem; nada novo de ligação foi criado.
-- A tabela demandas_avulsas já tem RLS e a política etapa17_logado, então a coluna nova herda a proteção; nenhuma demanda existente foi alterada (a coluna nasce nula).
-- Aplicada em produção pela migração "demandas_pagamento_terceiro" em 05/11/2026.
alter table public.demandas_avulsas add column if not exists pagamento_terceiro jsonb;
comment on column public.demandas_avulsas.pagamento_terceiro is
  'Pedido de pagamento a terceiro da demanda do Financeiro: {favorecido, documento (só dígitos), tipo, valor, vencimento (AAAA-MM-DD), forma, dados_pagamento, observacao}. Nula nas demais demandas.';
