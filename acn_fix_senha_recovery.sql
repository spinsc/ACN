-- Suporte a recuperação de senha e primeiro acesso
-- Execute no Supabase > SQL Editor

ALTER TABLE auth_usuarios
  ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS senha_temp VARCHAR(20),
  ADD COLUMN IF NOT EXISTS senha_temp_expiry TIMESTAMPTZ;

-- Usuários já existentes não precisam trocar senha no próximo login
UPDATE auth_usuarios SET primeiro_acesso = false WHERE primeiro_acesso IS NULL OR primeiro_acesso = true;
