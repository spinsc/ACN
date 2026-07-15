-- =============================================================================
-- PRODUÇÃO: EQUIPES + NOVOS CAMPOS OP
-- =============================================================================

-- Tabela de equipes de produção
CREATE TABLE IF NOT EXISTS producao_equipes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  head_line_id   uuid,
  head_line_nome text NOT NULL,
  membros        jsonb DEFAULT '[]'::jsonb,   -- [{id, nome}]
  ativa          boolean DEFAULT true,
  criado_em      timestamptz DEFAULT now()
);
ALTER TABLE producao_equipes DISABLE ROW LEVEL SECURITY;

-- Novos campos em oples para suporte a dupla / equipe
ALTER TABLE oples ADD COLUMN IF NOT EXISTS modo_execucao          text DEFAULT 'individual';
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_2_id   uuid;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_2_nome text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS equipe_id               uuid;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS equipe_nome             text;
-- =============================================================================
