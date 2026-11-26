-- Desfaz supabase/sql/seguranca_pacote_f03_f04.sql (as funções voltam ao texto de 25/11/2026). Só se alguma tela parar por causa dele.
set local lock_timeout = '3s';

create or replace function public.auth_confirmar_senha(p_usuario_id uuid, p_senha text) returns boolean
  language sql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
  select coalesce((select c.senha_hash = crypt(coalesce(p_senha, ''), c.senha_hash) from public.auth_credenciais c where c.usuario_id = p_usuario_id), false);
$function$;

create or replace function public.auth_trocar_senha(p_usuario_id uuid, p_atual text, p_nova text) returns jsonb
  language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare c public.auth_credenciais%rowtype; ok boolean;
begin
  if p_nova is null or length(p_nova) < 4 then return jsonb_build_object('ok', false, 'erro', 'senha_curta'); end if;
  select * into c from public.auth_credenciais where usuario_id = p_usuario_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'senha_atual_incorreta'); end if;
  ok := c.senha_hash = crypt(coalesce(p_atual, ''), c.senha_hash)
     or (c.senha_temp_hash is not null and c.senha_temp_expiry > now() and c.senha_temp_hash = crypt(coalesce(p_atual, ''), c.senha_temp_hash));
  if not coalesce(ok, false) then return jsonb_build_object('ok', false, 'erro', 'senha_atual_incorreta'); end if;
  update public.auth_credenciais set senha_hash = crypt(p_nova, gen_salt('bf', 10)), senha_temp_hash = null, senha_temp_expiry = null, atualizado_em = now()
   where usuario_id = p_usuario_id;
  update public.auth_usuarios set primeiro_acesso = false where id = p_usuario_id;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.auth_admin_definir_senha(p_admin_id uuid, p_admin_senha text, p_usuario_id uuid, p_nova text) returns jsonb
  language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare a public.auth_usuarios%rowtype; ok boolean;
begin
  if p_nova is null or length(p_nova) < 4 then return jsonb_build_object('ok', false, 'erro', 'senha_curta'); end if;
  select * into a from public.auth_usuarios where id = p_admin_id;
  if not found or a.perfil is distinct from 'Admin' or not coalesce(a.ativo, false) then return jsonb_build_object('ok', false, 'erro', 'sem_permissao'); end if;
  select coalesce(c.senha_hash = crypt(coalesce(p_admin_senha, ''), c.senha_hash), false) into ok from public.auth_credenciais c where c.usuario_id = p_admin_id;
  if not coalesce(ok, false) then return jsonb_build_object('ok', false, 'erro', 'sem_permissao'); end if;
  if not exists (select 1 from public.auth_usuarios where id = p_usuario_id) then return jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado'); end if;
  insert into public.auth_credenciais (usuario_id, senha_hash) values (p_usuario_id, crypt(p_nova, gen_salt('bf', 10)))
  on conflict (usuario_id) do update set senha_hash = excluded.senha_hash, senha_temp_hash = null, senha_temp_expiry = null, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $function$;

alter view public.rh_comissoes reset (security_invoker);
alter publication supabase_realtime add table public.audit_log;
