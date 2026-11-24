-- Desfaz usuarios_por_id_u5.sql: tira o registro de renomeios e a trava de nome unico, e devolve o gatilho de antes.
set local lock_timeout = '5s';
create or replace function public.pessoa_trg_auth_usuarios() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if btrim(coalesce(NEW.nome, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (public.pessoa_chave(NEW.nome), NEW.id, 'usuario')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if btrim(coalesce(NEW.email, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (lower(btrim(NEW.email)), NEW.id, 'email')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if TG_OP = 'UPDATE' and NEW.nome is distinct from OLD.nome then perform public.pessoa_propagar_nome(NEW.id); end if;
  return null;
end $$;
revoke all on function public.pessoa_trg_auth_usuarios() from public, anon, authenticated;
drop table if exists public.usuarios_renomeios;
drop index if exists public.auth_usuarios_nome_unico;
