-- ============================================================
-- ACN SINAL VERDE — Fix: ajustes_trabalhos + KPI columns
-- Rode este script no Supabase: SQL Editor → New Query → Run
-- ============================================================

-- ── 1. TABELA ajustes_trabalhos (cria se não existir) ────────
CREATE TABLE IF NOT EXISTS ajustes_trabalhos (
  id                    BIGSERIAL PRIMARY KEY,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  opl_referencia        TEXT,
  requerente            TEXT,
  descricao             TEXT NOT NULL,
  prioridade            TEXT DEFAULT 'Normal',
  data_limite           DATE,
  setor                 TEXT DEFAULT 'Engenharia',
  status                TEXT DEFAULT 'Aberto',
  criado_por            TEXT,
  criado_por_nome       TEXT,
  responsavel           TEXT,
  data_inicio           TIMESTAMPTZ,
  data_conclusao        TIMESTAMPTZ,
  tempo_execucao_horas  NUMERIC,
  logs_ajuste           JSONB DEFAULT '[]'::jsonb
);

-- Garante coluna setor caso a tabela já existia sem ela
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS setor TEXT DEFAULT 'Engenharia';
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS logs_ajuste JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS tempo_execucao_horas NUMERIC;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMPTZ;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMPTZ;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS responsavel TEXT;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'Normal';
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS data_limite DATE;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS opl_referencia TEXT;
ALTER TABLE ajustes_trabalhos ADD COLUMN IF NOT EXISTS requerente TEXT;

-- ── 2. COLUNAS KPI em oples ──────────────────────────────────
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_pcp_horas        NUMERIC;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_qualidade_horas   NUMERIC;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_fiscal_horas      NUMERIC;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_logistica_horas   NUMERIC;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_almoxarifado_horas NUMERIC;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_entrada_cq        TIMESTAMPTZ;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_liberacao_pcp      TIMESTAMPTZ;

-- ── 3. Desabilitar RLS em ajustes_trabalhos ───────────────────
ALTER TABLE ajustes_trabalhos DISABLE ROW LEVEL SECURITY;

-- ── 4. Confirmar ─────────────────────────────────────────────
SELECT 'ajustes_trabalhos OK' AS status,
       COUNT(*) AS registros_existentes
FROM ajustes_trabalhos;
