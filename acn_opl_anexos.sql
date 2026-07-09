-- ═══════════════════════════════════════════════════════════════════════
-- ACN Sinal Verde — Anexos de OPL
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS opl_anexos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opl_id      UUID NOT NULL,          -- referência ao id da oples
  opl_numero  TEXT NOT NULL,          -- ex: OPL-0042/2026 (para exibição)
  setor       TEXT NOT NULL,          -- quem fez o upload: 'Engenharia', 'Comercial', etc.
  tipo        TEXT NOT NULL DEFAULT 'documento',
  -- 'documento' | 'foto' | 'checklist_entrega'
  nome        TEXT NOT NULL,
  url         TEXT NOT NULL,
  criado_por  TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE opl_anexos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_opl_anexos_opl_id ON opl_anexos(opl_id);

-- Confirma
SELECT 'opl_anexos' AS tabela, COUNT(*) FROM opl_anexos;
