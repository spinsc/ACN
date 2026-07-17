-- =====================================================================
-- Melhorias em Licitações
-- Execute no Supabase SQL Editor
-- =====================================================================

-- 1. Novas colunas na tabela licitacoes
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS faturamento_empresa text DEFAULT 'ACN';
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS operador            text;
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS areas_livres        jsonb DEFAULT '{}'::jsonb;
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS valor_estimado      numeric;
ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS horario_sessao      text;

-- 2. Tabela de contatos do processo (separada)
CREATE TABLE IF NOT EXISTS licitacao_contatos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL,
  nome         text,
  tipo_contato text,
  telefones    jsonb  DEFAULT '[]'::jsonb,
  email        text,
  observacao   text,
  criado_em    timestamptz DEFAULT now()
);

ALTER TABLE licitacao_contatos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_licitacao_contatos_licitacao_id
  ON licitacao_contatos (licitacao_id);

-- 3. Permissão de exclusão de anexos por usuário
ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS pode_deletar_anexos boolean DEFAULT false;
