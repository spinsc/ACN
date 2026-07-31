-- Colunas necessárias para o fluxo Comercial → Fiscal → Entrega
-- Execute no Supabase SQL Editor

ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_liberacao_comercial timestamptz;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS cliente_recebeu_nome text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_entrega timestamptz;

-- Múltiplos tipos de serviço de terceiro por OP
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tipos_servico_terceiro jsonb DEFAULT '[]'::jsonb;
