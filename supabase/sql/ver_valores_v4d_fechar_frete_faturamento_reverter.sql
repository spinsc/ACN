-- Reverte a V4d (devolve o dinheiro às colunas antigas e volta ao espelho da V4a). O front de hoje (V4b e V4c) segue funcionando: ele lê as tabelas novas, que não são apagadas.
set local lock_timeout = '3s';

-- 1) o desvio sai (senão devolver os valores às colunas os mandaria de volta à tabela nova)
drop trigger if exists frete_desviar_valores_upd on public.pcp_fretes;
drop trigger if exists frete_desviar_valores_ins on public.pcp_fretes;
drop trigger if exists cotacao_frete_desviar_valores_upd on public.pcp_cotacoes_fretes;
drop trigger if exists cotacao_frete_desviar_valores_ins on public.pcp_cotacoes_fretes;
drop trigger if exists aprovacao_frete_desviar_valores_upd on public.pcp_aprovacoes_fretes;
drop trigger if exists aprovacao_frete_desviar_valores_ins on public.pcp_aprovacoes_fretes;
drop trigger if exists faturamento_desviar_valores_upd on public.pcp_pedidos_faturamento;
drop trigger if exists faturamento_desviar_valores_ins on public.pcp_pedidos_faturamento;

-- 2) devolve os valores às colunas
update public.pcp_fretes f set valor_frete = v.valor_frete, valor_nota = v.valor_nota from public.pcp_fretes_valores v where v.frete_id = f.id and (v.valor_frete is not null or v.valor_nota is not null);
update public.pcp_cotacoes_fretes f set valor = v.valor from public.pcp_cotacoes_fretes_valores v where v.cotacao_id = f.id and v.valor is not null;
update public.pcp_aprovacoes_fretes f set valor_no_momento = v.valor_no_momento from public.pcp_aprovacoes_fretes_valores v where v.aprovacao_id = f.id and v.valor_no_momento is not null;
update public.pcp_pedidos_faturamento f set valor = v.valor from public.pcp_pedidos_faturamento_valores v where v.faturamento_id = f.id and v.valor is not null;

-- 3) o espelho da V4a volta (mesmas funções e gatilhos de ver_valores_v4a_frete_faturamento_valores.sql, seção 4)
create or replace function public.frete_espelhar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.pcp_fretes_valores as v (frete_id, valor_frete, valor_nota, atualizado_em) values (new.id, new.valor_frete, new.valor_nota, now())
  on conflict (frete_id) do update set valor_frete = excluded.valor_frete, valor_nota = excluded.valor_nota, atualizado_em = now();
  return null;
end; $function$;
create or replace function public.cotacao_frete_espelhar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.pcp_cotacoes_fretes_valores as v (cotacao_id, valor, atualizado_em) values (new.id, new.valor, now())
  on conflict (cotacao_id) do update set valor = excluded.valor, atualizado_em = now();
  return null;
end; $function$;
create or replace function public.aprovacao_frete_espelhar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.pcp_aprovacoes_fretes_valores as v (aprovacao_id, valor_no_momento, atualizado_em) values (new.id, new.valor_no_momento, now())
  on conflict (aprovacao_id) do update set valor_no_momento = excluded.valor_no_momento, atualizado_em = now();
  return null;
end; $function$;
create or replace function public.faturamento_espelhar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.pcp_pedidos_faturamento_valores as v (faturamento_id, valor, atualizado_em) values (new.id, new.valor, now())
  on conflict (faturamento_id) do update set valor = excluded.valor, atualizado_em = now();
  return null;
end; $function$;
revoke all on function public.frete_espelhar_valores(), public.cotacao_frete_espelhar_valores(),
  public.aprovacao_frete_espelhar_valores(), public.faturamento_espelhar_valores() from public, anon, authenticated;

create trigger frete_espelhar_valores_ins after insert on public.pcp_fretes
  for each row when (new.valor_frete is not null or new.valor_nota is not null) execute function public.frete_espelhar_valores();
create trigger frete_espelhar_valores_upd after update of valor_frete, valor_nota on public.pcp_fretes
  for each row when (new.valor_frete is distinct from old.valor_frete or new.valor_nota is distinct from old.valor_nota) execute function public.frete_espelhar_valores();
create trigger cotacao_frete_espelhar_valores_ins after insert on public.pcp_cotacoes_fretes
  for each row when (new.valor is not null) execute function public.cotacao_frete_espelhar_valores();
create trigger cotacao_frete_espelhar_valores_upd after update of valor on public.pcp_cotacoes_fretes
  for each row when (new.valor is distinct from old.valor) execute function public.cotacao_frete_espelhar_valores();
create trigger aprovacao_frete_espelhar_valores_ins after insert on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is not null) execute function public.aprovacao_frete_espelhar_valores();
create trigger aprovacao_frete_espelhar_valores_upd after update of valor_no_momento on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is distinct from old.valor_no_momento) execute function public.aprovacao_frete_espelhar_valores();
create trigger faturamento_espelhar_valores_ins after insert on public.pcp_pedidos_faturamento
  for each row when (new.valor is not null) execute function public.faturamento_espelhar_valores();
create trigger faturamento_espelhar_valores_upd after update of valor on public.pcp_pedidos_faturamento
  for each row when (new.valor is distinct from old.valor) execute function public.faturamento_espelhar_valores();

-- 4) as funções de desvio saem
drop function if exists public.frete_desviar_valores();
drop function if exists public.cotacao_frete_desviar_valores();
drop function if exists public.aprovacao_frete_desviar_valores();
drop function if exists public.faturamento_desviar_valores();
