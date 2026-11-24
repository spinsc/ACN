-- Plano "toda pessoa por ID", etapa U5 (banco) — 24/11/2026.
-- 1) Trava: o nome do usuario passa a ser UNICO sem acento nem maiuscula (o plano sempre previu: dois usuarios com o mesmo nome deixariam o ID ambiguo
--    para quem digita so o nome). Hoje nao ha nome repetido (conferido antes de aplicar). Usuario sem nome fica de fora.
-- 2) Registro de cada renome: quem foi renomeado, de que nome para que nome, quantos valores acompanharam e quem fez. So Admin le; so o gatilho grava.
--    A tela de Usuarios do Admin mostra esse numero logo depois de salvar um renome.
-- Nenhuma tabela de muitas telas e tocada (auth_usuarios tem ~32 linhas). Desfazer: usuarios_por_id_u5_reverter.sql.
set local lock_timeout = '5s';

create unique index if not exists auth_usuarios_nome_unico on public.auth_usuarios ((public.normalizar_busca(nome))) where btrim(coalesce(nome, '')) <> '';

create table if not exists public.usuarios_renomeios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  nome_antes text,
  nome_depois text,
  registros integer not null default 0,
  feito_por text,
  em timestamptz not null default now()
);
create index if not exists usuarios_renomeios_usuario_em on public.usuarios_renomeios (usuario_id, em desc);
alter table public.usuarios_renomeios enable row level security;
drop policy if exists usuarios_renomeios_admin on public.usuarios_renomeios;
create policy usuarios_renomeios_admin on public.usuarios_renomeios for select to authenticated using ((select public.eh_admin()));
revoke all on public.usuarios_renomeios from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.usuarios_renomeios from authenticated;

create or replace function public.pessoa_trg_auth_usuarios() returns trigger language plpgsql security definer set search_path = public as
$$
declare n integer;
begin
  if btrim(coalesce(NEW.nome, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (public.pessoa_chave(NEW.nome), NEW.id, 'usuario')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if btrim(coalesce(NEW.email, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (lower(btrim(NEW.email)), NEW.id, 'email')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if TG_OP = 'UPDATE' and NEW.nome is distinct from OLD.nome then
    n := public.pessoa_propagar_nome(NEW.id);
    insert into public.usuarios_renomeios (usuario_id, nome_antes, nome_depois, registros, feito_por)
    values (NEW.id, OLD.nome, NEW.nome, coalesce(n, 0), coalesce((select a.nome from public.auth_usuarios a where a.auth_id = auth.uid()), 'sistema'));
  end if;
  return null;
end $$;
revoke all on function public.pessoa_trg_auth_usuarios() from public, anon, authenticated;
