-- Pacote de segurança e alívio de CPU (26/11/2026, plano de migração para o servidor interno: F0.3 e F0.4).
-- APLICADO em 26/11/2026, ~10h21 de Brasília (migração `seguranca_pacote_f03_f04_20261126`); conferido à noite no banco e nas funções de servidor.
-- Não mexe em dado. Volta: supabase/sql/seguranca_pacote_f03_f04_reverter.sql.
--
-- S2 — as três funções de senha passam a valer só para a PRÓPRIA pessoa que chama (o crachá real, auth.uid(), não o "Ver como").
--      Quem usa: a troca de senha (DashboardTab), a confirmação de senha nas aprovações (Compras, Formação de Preços, Admin) e o Admin
--      definindo senha (AdminTab). Todas já passam o id da própria pessoa; nada muda para elas.
-- S5 — a visão `rh_comissoes` passa a obedecer às regras das tabelas de origem (security_invoker): quem não pode ver comissões não vê.
--      Nenhuma tela lê a visão hoje (conferido no código).
-- F0.4 — o registro de auditoria (`audit_log`) sai do tempo real do banco: era o maior gasto de CPU do Supabase (o tempo real
--      decodificava cada linha da auditoria). As telas deixam de escutá-lo na mesma publicação do front.
set local lock_timeout = '3s';

-- S2 ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.auth_confirmar_senha(p_usuario_id uuid, p_senha text) returns boolean
  language sql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
  -- 26/11/2026 (S2): só a própria pessoa (crachá real) confere a própria senha.
  select case
    when not exists (select 1 from public.auth_usuarios u where u.id = p_usuario_id and u.auth_id is not null and u.auth_id = auth.uid()) then false
    else coalesce((select c.senha_hash = crypt(coalesce(p_senha, ''), c.senha_hash) from public.auth_credenciais c where c.usuario_id = p_usuario_id), false)
  end;
$function$;

create or replace function public.auth_trocar_senha(p_usuario_id uuid, p_atual text, p_nova text) returns jsonb
  language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare c public.auth_credenciais%rowtype; ok boolean;
begin
  if p_nova is null or length(p_nova) < 4 then return jsonb_build_object('ok', false, 'erro', 'senha_curta'); end if;
  -- 26/11/2026 (S2): só a própria pessoa (crachá real) troca a própria senha.
  if not exists (select 1 from public.auth_usuarios u where u.id = p_usuario_id and u.auth_id is not null and u.auth_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
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
  -- 26/11/2026 (S2): o Admin informado tem de ser quem chama (crachá real).
  if not found or a.perfil is distinct from 'Admin' or not coalesce(a.ativo, false) or a.auth_id is null or a.auth_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  select coalesce(c.senha_hash = crypt(coalesce(p_admin_senha, ''), c.senha_hash), false) into ok from public.auth_credenciais c where c.usuario_id = p_admin_id;
  if not coalesce(ok, false) then return jsonb_build_object('ok', false, 'erro', 'sem_permissao'); end if;
  if not exists (select 1 from public.auth_usuarios where id = p_usuario_id) then return jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado'); end if;
  insert into public.auth_credenciais (usuario_id, senha_hash) values (p_usuario_id, crypt(p_nova, gen_salt('bf', 10)))
  on conflict (usuario_id) do update set senha_hash = excluded.senha_hash, senha_temp_hash = null, senha_temp_expiry = null, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $function$;

-- S5 ────────────────────────────────────────────────────────────────────────────────────────────────
alter view public.rh_comissoes set (security_invoker = true);

-- F0.4 ──────────────────────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime drop table public.audit_log;

-- Conferência: se algo não bate, tudo é desfeito
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log') then
    raise exception 'o audit_log ainda está no tempo real';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.rh_comissoes'::regclass and 'security_invoker=true' = any(reloptions)) then
    raise exception 'rh_comissoes sem security_invoker';
  end if;
  if not has_function_privilege('authenticated', 'public.auth_confirmar_senha(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.auth_trocar_senha(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.auth_admin_definir_senha(uuid,text,uuid,text)', 'execute') then
    raise exception 'as telas perderam o direito de chamar as funções de senha';
  end if;
  if has_function_privilege('anon', 'public.auth_confirmar_senha(uuid,text)', 'execute') then
    raise exception 'a chave pública executa auth_confirmar_senha';
  end if;
end $$;
