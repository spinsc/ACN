-- Resumo dos Serviços a serem executados
-- Executar no Supabase SQL Editor

ALTER TABLE oples ADD COLUMN IF NOT EXISTS resumo_servicos text;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS resumo_servicos text;
