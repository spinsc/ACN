-- Rastreamento de leituras por usuário: destaca registros atualizados não vistos
CREATE TABLE IF NOT EXISTS registro_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,          -- 'licitacoes' | 'oples' | 'crm_oportunidades' | etc.
  registro_id text NOT NULL,     -- id do registro
  usuario_email text NOT NULL,
  lido_em timestamptz DEFAULT now(),
  UNIQUE(tabela, registro_id, usuario_email)
);
ALTER TABLE registro_leituras DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_leituras_usuario ON registro_leituras(usuario_email, tabela);
