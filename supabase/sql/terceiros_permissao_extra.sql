-- Serviços de terceiros: permissão dada pessoa a pessoa (pedido do usuário em 24/11/2026: a Letícia deve poder cadastrar prestadores).
-- Até aqui só Admin, gerentes e quem tem a aba Adaptação cadastravam prestador e montavam a ordem em lote. Agora o Admin marca, em Admin → Usuários,
-- a caixa "Pode gerir serviços de terceiros" (auth_usuarios.pode_gerir_terceiros) e a pessoa passa a cadastrar prestadores E montar a ordem de serviço em lote
-- (as duas regras sempre foram a mesma conta). Tipos de serviço e modelo do contrato seguem só do Admin.
alter table public.auth_usuarios add column if not exists pode_gerir_terceiros boolean not null default false;

-- a pessoa que age ganha a chave 'adaptacao' também quando tem a marca: terceiros_pode_gerir_prestadores e terceiros_pode_ordem já leem essa chave.
-- Mas a Adaptação marca data em alguns tipos (terceiros_pode_mexer / marcar_data leem a mesma chave), então a marca vai em chave própria e só as duas funções de gestão a leem.
create or replace function public.terceiros_ator()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select (
    select jsonb_build_object(
      'id', u.id, 'nome', u.nome, 'perfil', u.perfil,
      'diretoria', coalesce(u.perfil = 'Admin' or u.perfil ilike 'gerente%', false),
      'adaptacao', coalesce((select public.tem_aba('producao')), false),
      'gestao_terceiros', coalesce(u.pode_gerir_terceiros, false),
      'autor', case when auth.uid() is distinct from public.uid_efetivo()
                    then coalesce((select r.nome from public.auth_usuarios r where r.auth_id = auth.uid() limit 1), 'Admin') || ' (vendo como ' || u.nome || ')'
                    else u.nome end)
      from public.auth_usuarios u
     where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false)
     limit 1
  );
$function$;
revoke all on function public.terceiros_ator() from public, anon, authenticated;

create or replace function public.terceiros_pode_gerir_prestadores()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select coalesce((select coalesce((q.x->>'diretoria')::boolean, false) or coalesce((q.x->>'adaptacao')::boolean, false) or coalesce((q.x->>'gestao_terceiros')::boolean, false)
                     from (select public.terceiros_ator() as x) q), false);
$function$;
revoke all on function public.terceiros_pode_gerir_prestadores() from public, anon;
grant execute on function public.terceiros_pode_gerir_prestadores() to authenticated;

create or replace function public.terceiros_pode_ordem(a jsonb)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select a is not null and (coalesce((a ->> 'diretoria')::boolean, false) or coalesce((a ->> 'adaptacao')::boolean, false) or coalesce((a ->> 'gestao_terceiros')::boolean, false));
$function$;
revoke all on function public.terceiros_pode_ordem(jsonb) from public, anon, authenticated;
