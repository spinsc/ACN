-- =============================================================================
-- TABELA DE ACOMPANHAMENTOS DE OPs e OSes
-- Log histórico com @menções, visível por todos os setores
-- Execute no Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS op_acompanhamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia_id   text NOT NULL,    -- numero OP (ex: "1234.5678") ou OS UUID como text
  referencia_tipo text NOT NULL,    -- 'op' ou 'os'
  referencia_desc text,             -- ex: "OP 1234.5678" ou "OS-0001/2024"
  setor           text,             -- setor que registrou o acompanhamento
  texto           text NOT NULL,    -- conteúdo do acompanhamento (pode ter @mencoes)
  usuario_id      text,             -- auth_usuarios.id como text
  usuario_nome    text,
  criado_em       timestamptz DEFAULT now()
);

ALTER TABLE op_acompanhamentos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_op_acomp_ref
  ON op_acompanhamentos(referencia_id, referencia_tipo);

CREATE INDEX IF NOT EXISTS idx_op_acomp_criado
  ON op_acompanhamentos(criado_em DESC);

-- =============================================================================
