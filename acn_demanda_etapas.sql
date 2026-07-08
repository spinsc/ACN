-- Adiciona suporte a múltiplas etapas na demanda avulsa
ALTER TABLE demandas_avulsas
  ADD COLUMN IF NOT EXISTS etapas JSONB DEFAULT '[]'::jsonb;

-- Confirma
SELECT 'etapas adicionado' AS resultado;
