-- Reverte terceiros_servicos_t5.sql (Serviços de terceiros, fatia T5). Só apague as colunas se não houver pedido de pagamento nem saída ligada de verdade: elas guardam o que foi ligado.
drop function if exists public.terceiros_pagamento_pedir(uuid[], jsonb);
drop function if exists public.terceiros_vistoria_ligar(uuid[], uuid);
drop function if exists public.terceiros_vistoria_desligar(uuid[], text);
drop index if exists public.terceiros_servicos_pagamento_idx;
drop index if exists public.terceiros_servicos_vistoria_idx;
alter table public.terceiros_servicos
  drop column if exists pagamento_demanda_id, drop column if exists pagamento_pedido_em, drop column if exists pagamento_pedido_por,
  drop column if exists vistoria_id, drop column if exists vistoria_ligada_em, drop column if exists vistoria_ligada_por;
alter table public.demandas_avulsas drop column if exists pintura_servico_id;
