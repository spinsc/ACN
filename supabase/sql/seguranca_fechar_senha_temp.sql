-- Segurança (25/11/2026, aprovado pelo usuário na mesma noite): a função interna `auth_definir_senha_temp` passa a ser
-- executada só pelo papel de serviço, que é como a função de servidor `recuperar-senha` já a chamava. Nenhuma tela a usa
-- (conferido no código). Achado da avaliação de segurança da migração para o servidor interno (relatório fora do repositório).
-- Não mexe em dado. Volta: supabase/sql/seguranca_fechar_senha_temp_reverter.sql.
revoke execute on function public.auth_definir_senha_temp(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.auth_definir_senha_temp(uuid, text, timestamptz) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.auth_definir_senha_temp(uuid,text,timestamptz)', 'execute') then
    raise exception 'quem entrou ainda executa auth_definir_senha_temp';
  end if;
  if has_function_privilege('anon', 'public.auth_definir_senha_temp(uuid,text,timestamptz)', 'execute') then
    raise exception 'a chave pública ainda executa auth_definir_senha_temp';
  end if;
  if not has_function_privilege('service_role', 'public.auth_definir_senha_temp(uuid,text,timestamptz)', 'execute') then
    raise exception 'a recuperação de senha (service_role) perdeu o acesso';
  end if;
end $$;
