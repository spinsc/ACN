-- ─────────────────────────────────────────────────────────────────────────────
-- CRM WHATSAPP — Configuração global + Instâncias por vendedor
-- Rodar no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. CONFIG GLOBAL (URL e token da Evolution API — 1 linha)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_whatsapp_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_url text NOT NULL,        -- ex: https://api.minhaevolution.com.br
  api_token     text NOT NULL,        -- Global API Key da Evolution
  webhook_secret text,                -- opcional: valida header x-webhook-secret
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE crm_whatsapp_config DISABLE ROW LEVEL SECURITY;

-- 2. INSTÂNCIAS POR VENDEDOR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_whatsapp_instancias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name  text NOT NULL UNIQUE, -- nome da instância na Evolution API
  vendedor_nome  text NOT NULL,
  vendedor_id    uuid,                  -- auth_usuarios.id (opcional)
  numero_conectado text,               -- ex: 5511987654321 (preenchido pelo webhook)
  status         text DEFAULT 'desconectado', -- 'conectado' | 'desconectado' | 'aguardando_qr'
  criado_em      timestamptz DEFAULT now(),
  atualizado_em  timestamptz DEFAULT now()
);

ALTER TABLE crm_whatsapp_instancias DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wa_inst_vendedor ON crm_whatsapp_instancias(vendedor_nome);

-- 3. COLUNAS ADICIONAIS EM crm_whatsapp_msgs
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_whatsapp_msgs ADD COLUMN IF NOT EXISTS instance_name  text;
ALTER TABLE crm_whatsapp_msgs ADD COLUMN IF NOT EXISTS vendedor_nome  text;
ALTER TABLE crm_whatsapp_msgs ADD COLUMN IF NOT EXISTS numero_remoto  text; -- alias mais claro que numero_whatsapp
ALTER TABLE crm_whatsapp_msgs ADD COLUMN IF NOT EXISTS raw_payload    jsonb; -- payload completo para debug

CREATE INDEX IF NOT EXISTS idx_wa_msgs_instance ON crm_whatsapp_msgs(instance_name);

-- 4. TRIGGER — atualizar status da instância quando webhook confirma conexão
-- ─────────────────────────────────────────────────────────────────────────────
-- (opcional — o webhook Edge Function atualiza diretamente via UPDATE)

-- 5. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('crm_whatsapp_config','crm_whatsapp_instancias','crm_whatsapp_msgs');
