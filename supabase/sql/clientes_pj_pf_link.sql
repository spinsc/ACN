-- ─────────────────────────────────────────────────────────────────────────────
-- CLIENTES — Vínculo PF ↔ PJ
-- Um cliente PF pode ser vinculado a um cliente PJ (empresa)
-- A PJ consegue ver todos os PFs vinculados a ela
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Coluna de vínculo (PF → PJ)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES clientes(id) ON DELETE SET NULL;

-- 2. Índice para buscar todos os PFs de uma PJ
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);

-- 3. Verificação
SELECT
  pf.nome    AS contato_pf,
  pf.tipo    AS tipo_pf,
  pj.nome    AS empresa_pj,
  pj.tipo    AS tipo_pj
FROM clientes pf
LEFT JOIN clientes pj ON pj.id = pf.empresa_id
WHERE pf.empresa_id IS NOT NULL
LIMIT 10;
