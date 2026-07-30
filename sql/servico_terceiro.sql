-- Serviço de Terceiro na OP
-- Executar no Supabase SQL Editor

ALTER TABLE oples ADD COLUMN IF NOT EXISTS servico_terceiro boolean DEFAULT false;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tipo_servico_terceiro text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS obs_servico_terceiro text;

-- data_chegada_veiculo pode já existir; o IF NOT EXISTS garante idempotência
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_chegada_veiculo date;
