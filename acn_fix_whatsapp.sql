-- Adiciona campo whatsapp na tabela de usuários
-- Execute no Supabase > SQL Editor

ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);

-- Exemplo de atualização manual de número:
-- UPDATE auth_usuarios SET whatsapp = '5511999999999' WHERE email = 'usuario@empresa.com';

-- O número deve estar no formato: 55 (país) + DDD + número
-- Ex: 5511987654321  (sem espaços, traços ou parênteses)
