-- ─────────────────────────────────────────────────────────────────────────────
-- CRM CONTATOS — Tabelas, índices e campos adicionais
-- Rodar no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. CONTATOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_contatos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- dados pessoais
  nome             text NOT NULL,
  cargo            text,
  empresa          text,           -- texto livre (para leads sem cliente cadastrado)
  cliente_id       uuid REFERENCES clientes(id) ON DELETE SET NULL,
  -- canais
  whatsapp         text,           -- formato: 5511999999999
  email            text,
  telefone         text,
  linkedin         text,
  -- integrações externas
  foco_id          text,           -- ID no Sistema Foco (para sincronização futura)
  -- controle
  observacoes      text,
  operador_id      uuid,           -- auth_usuarios.id (quem cadastrou)
  operador_nome    text,
  ativo            boolean DEFAULT true,
  criado_em        timestamptz DEFAULT now(),
  atualizado_em    timestamptz DEFAULT now()
);

ALTER TABLE crm_contatos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_contatos_cliente  ON crm_contatos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_operador ON crm_contatos(operador_id);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_whatsapp ON crm_contatos(whatsapp);
CREATE INDEX IF NOT EXISTS idx_crm_contatos_foco     ON crm_contatos(foco_id);

-- 2. INTERAÇÕES (histórico de contato)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_interacoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id       uuid NOT NULL REFERENCES crm_contatos(id) ON DELETE CASCADE,
  oportunidade_id  uuid REFERENCES crm_oportunidades(id) ON DELETE SET NULL,
  -- tipo: 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'visita' | 'outro'
  tipo             text NOT NULL DEFAULT 'whatsapp',
  descricao        text,           -- resumo/anotação da conversa
  resultado        text,           -- 'positivo' | 'neutro' | 'negativo'
  -- áudio (opcional)
  audio_url        text,           -- URL no Supabase Storage
  transcricao      text,           -- texto retornado pela Edge Function (Whisper)
  transcricao_em   timestamptz,
  -- controle
  operador_nome    text,
  data_interacao   timestamptz DEFAULT now(),
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE crm_interacoes DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_interacoes_contato      ON crm_interacoes(contato_id);
CREATE INDEX IF NOT EXISTS idx_crm_interacoes_oportunidade ON crm_interacoes(oportunidade_id);

-- 3. MENSAGENS WHATSAPP (sync futuro via Evolution API webhook)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_whatsapp_msgs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id       uuid REFERENCES crm_contatos(id) ON DELETE SET NULL,
  numero_whatsapp  text NOT NULL,  -- número de origem/destino
  -- tipo: 'texto' | 'audio' | 'imagem' | 'documento' | 'video'
  tipo_msg         text DEFAULT 'texto',
  -- direcao: 'entrada' (recebida) | 'saida' (enviada)
  direcao          text DEFAULT 'entrada',
  conteudo         text,           -- texto da mensagem ou transcrição de áudio
  audio_url        text,
  transcricao      text,
  imagem_url       text,
  -- metadados da mensagem (Evolution API)
  msg_id_externo   text UNIQUE,    -- ID da mensagem na Evolution API
  lida             boolean DEFAULT false,
  data_msg         timestamptz NOT NULL DEFAULT now(),
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE crm_whatsapp_msgs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_contato  ON crm_whatsapp_msgs(contato_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_numero   ON crm_whatsapp_msgs(numero_whatsapp);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_externo  ON crm_whatsapp_msgs(msg_id_externo);

-- 4. CAMPOS ADICIONAIS EM TABELAS EXISTENTES
-- ─────────────────────────────────────────────────────────────────────────────

-- Campo foco_id na tabela clientes (sincronização futura com Sistema Foco)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS foco_id text;
CREATE INDEX IF NOT EXISTS idx_clientes_foco ON clientes(foco_id);

-- 5. BUCKET DE STORAGE — áudios de interações CRM
-- (rodar apenas se o bucket ainda não existir)
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase não suporta CREATE BUCKET via SQL.
-- Crie manualmente em: Storage → New bucket → "crm-audios" (privado)
-- Depois rode o policy abaixo se quiser acesso autenticado:
/*
INSERT INTO storage.buckets (id, name, public) VALUES ('crm-audios', 'crm-audios', false)
ON CONFLICT (id) DO NOTHING;
*/

-- 6. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'crm_contatos'      AS tabela, COUNT(*) AS registros FROM crm_contatos
UNION ALL SELECT
  'crm_interacoes',   COUNT(*) FROM crm_interacoes
UNION ALL SELECT
  'crm_whatsapp_msgs',COUNT(*) FROM crm_whatsapp_msgs;
