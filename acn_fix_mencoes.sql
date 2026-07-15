-- =============================================================================
-- FIX MENÇÕES — Muda mencionado_id e mencionante_id de uuid para text
-- Necessário porque auth_usuarios.id pode ser integer, não uuid
-- Execute no Supabase SQL Editor
-- =============================================================================

-- Recria a tabela mencoes com colunas de ID como text
DROP TABLE IF EXISTS mencoes;

CREATE TABLE mencoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mencionado_id       text,
  mencionado_nome     text,
  mencionante_id      text,
  mencionante_nome    text,
  contexto            text NOT NULL,         -- 'op', 'os', 'sac', 'crm', 'demanda', 'compra'
  contexto_id         text,                  -- ID do registro origem
  contexto_descricao  text,                  -- ex: "OP 1234.5678"
  campo               text,                  -- nome do campo onde foi mencionado
  texto_trecho        text,                  -- trecho do texto contendo a menção
  aba_destino         text,                  -- aba do sistema para navegar
  lida                boolean DEFAULT false,
  criado_em           timestamptz DEFAULT now()
);

ALTER TABLE mencoes DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mencoes_mencionado ON mencoes(mencionado_id, lida);
CREATE INDEX IF NOT EXISTS idx_mencoes_contexto   ON mencoes(contexto_id);

-- =============================================================================
