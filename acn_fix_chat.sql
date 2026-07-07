-- Chat interno entre usuários
-- Execute no Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS chat_salas (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo      TEXT    NOT NULL DEFAULT 'canal',  -- 'canal' | 'direto'
  nome      TEXT,                               -- NULL para DMs
  membros   JSONB   DEFAULT '[]',              -- [{id, nome}] — usado em DMs
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chat_salas DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS chat_mensagens (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id        UUID    REFERENCES chat_salas(id) ON DELETE CASCADE,
  remetente_id   TEXT    NOT NULL,
  remetente_nome TEXT    NOT NULL,
  texto          TEXT    NOT NULL,
  lida_por       JSONB   DEFAULT '[]',  -- array de ids que já leram
  criado_em      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chat_mensagens DISABLE ROW LEVEL SECURITY;

-- Índice para busca por sala
CREATE INDEX IF NOT EXISTS idx_chat_msgs_sala ON chat_mensagens(sala_id, criado_em);

-- Canais padrão por setor
INSERT INTO chat_salas (tipo, nome) VALUES
  ('canal', 'Geral'),
  ('canal', 'Comercial'),
  ('canal', 'Engenharia'),
  ('canal', 'PCP'),
  ('canal', 'Laboratorio'),
  ('canal', 'Producao'),
  ('canal', 'Almoxarifado'),
  ('canal', 'CQ'),
  ('canal', 'Logistica'),
  ('canal', 'SAC')
ON CONFLICT DO NOTHING;

-- Habilitar Realtime nas mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensagens;
