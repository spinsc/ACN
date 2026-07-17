-- =====================================================================
-- Melhorias CRM
-- Execute no Supabase SQL Editor
-- =====================================================================

-- 1. Coluna de e-mail separada do telefone de contato
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS contato_email text;
