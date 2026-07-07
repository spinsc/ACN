-- Colunas de pausa manual para demandas_setoriais
-- Execute no Supabase > SQL Editor

ALTER TABLE demandas_setoriais
  ADD COLUMN IF NOT EXISTS pausado           BOOLEAN    DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_pausa        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS segundos_pausados INTEGER    DEFAULT 0;
