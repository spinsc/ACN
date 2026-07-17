-- ============================================================
-- ACN – Avisos do Sistema (post-it flutuante)
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS avisos_sistema (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           text        NOT NULL,
  mensagem         text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'admin',     -- 'admin' | 'diretoria'
  criticidade      text        NOT NULL DEFAULT 'media',     -- 'baixa' | 'media' | 'alta'
  permanente       boolean     NOT NULL DEFAULT false,
  data_expiracao   timestamptz,
  ativo            boolean     NOT NULL DEFAULT true,
  criado_por       text,
  criado_por_nome  text,
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE avisos_sistema DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_avisos_ativo ON avisos_sistema(ativo);
