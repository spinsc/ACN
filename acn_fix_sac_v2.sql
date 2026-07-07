-- SAC v2 — colunas de KPI e integração com Lab
-- Execute no Supabase > SQL Editor

-- Novos campos na OS SAC
ALTER TABLE sac_ordens_servico
  ADD COLUMN IF NOT EXISTS observacoes_lab            TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio_diagnostico    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_finalizacao_orcamento TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kpi_orcamento_horas        DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS data_inicio_execucao_lab   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_finalizacao_execucao  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kpi_execucao_horas         DECIMAL(8,2);

-- Novos campos nas demandas setoriais (link SAC + pause)
ALTER TABLE demandas_setoriais
  ADD COLUMN IF NOT EXISTS sac_os_id          UUID,
  ADD COLUMN IF NOT EXISTS sac_fase           TEXT,       -- 'diagnostico' | 'execucao'
  ADD COLUMN IF NOT EXISTS pausado            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_pausa         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tempo_pausado_horas DECIMAL(8,2) DEFAULT 0;
