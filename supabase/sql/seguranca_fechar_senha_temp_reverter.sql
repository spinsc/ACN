-- Desfaz supabase/sql/seguranca_fechar_senha_temp.sql. Só usar se a recuperação de senha parar por causa dele;
-- prefira corrigir quem chama (ver o relatório de segurança da migração, fora do repositório).
grant execute on function public.auth_definir_senha_temp(uuid, text, timestamptz) to authenticated;
