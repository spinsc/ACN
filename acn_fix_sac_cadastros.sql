-- SAC Cadastros — tabelas de configuração + despesas Serviço Externo
-- Execute no Supabase > SQL Editor

-- Categorias (Tipos de Projeto) gerenciáveis
CREATE TABLE IF NOT EXISTS sac_categorias (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT    NOT NULL UNIQUE,
  tem_despesas BOOLEAN DEFAULT false,  -- true = exibe campos de despesas (Serviço Externo)
  ativo        BOOLEAN DEFAULT true,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sac_categorias DISABLE ROW LEVEL SECURITY;

INSERT INTO sac_categorias (nome, tem_despesas) VALUES
  ('Transformacao Veicular Ostensiva',      false),
  ('Transformacao Veicular Administrativa', false),
  ('Instalacao Equipamento',                false),
  ('Manutencao Preventiva',                 false),
  ('Manutencao Corretiva',                  false),
  ('Calibracao',                            false),
  ('Reforma',                               false),
  ('Projeto Especial',                      false),
  ('Servico Externo',                       true)
ON CONFLICT (nome) DO NOTHING;

-- Despesas de campo (Serviço Externo) na OS
ALTER TABLE sac_ordens_servico
  ADD COLUMN IF NOT EXISTS despesa_deslocamento DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS despesa_hospedagem   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS despesa_alimentacao  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS total_despesas       DECIMAL(10,2);
