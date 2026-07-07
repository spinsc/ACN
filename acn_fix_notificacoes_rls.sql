-- Corrige acesso à tabela notificacoes_config
-- Execute no Supabase > SQL Editor

-- Opção 1: desabilitar RLS (igual às outras tabelas do projeto)
ALTER TABLE notificacoes_config DISABLE ROW LEVEL SECURITY;

-- Garante que a coluna whatsapp existe em auth_usuarios
ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);
