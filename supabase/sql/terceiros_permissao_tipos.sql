-- Serviços de terceiros: quem tem a marca "Pode gerir serviços de terceiros" (auth_usuarios.pode_gerir_terceiros) também cadastra e corrige os TIPOS de serviço
-- (pedido do usuário em 24/11/2026). Antes só o Admin. Gerentes e Adaptação continuam sem editar tipos: só Admin ou a marca. O modelo do contrato segue só do Admin.
create or replace function public.terceiros_pode_gerir_tipos()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select coalesce((select public.eh_admin()), false)
      or coalesce((select coalesce((q.x->>'gestao_terceiros')::boolean, false) from (select public.terceiros_ator() as x) q), false);
$function$;
revoke all on function public.terceiros_pode_gerir_tipos() from public, anon;
grant execute on function public.terceiros_pode_gerir_tipos() to authenticated;

drop policy if exists terceiros_tipos_incluir on public.terceiros_tipos;
create policy terceiros_tipos_incluir on public.terceiros_tipos for insert to authenticated with check ((select public.terceiros_pode_gerir_tipos()));
drop policy if exists terceiros_tipos_alterar on public.terceiros_tipos;
create policy terceiros_tipos_alterar on public.terceiros_tipos for update to authenticated using ((select public.terceiros_pode_gerir_tipos())) with check ((select public.terceiros_pode_gerir_tipos()));
