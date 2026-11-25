-- "Ver valores" no banco, onda V4a (25/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 11): dinheiro do frete, da cotação de frete, da aprovação de frete e do pedido de faturamento em tabelas-irmãs.
-- ESTA ONDA É SÓ ADITIVA: nada some das tabelas de origem e nenhuma tela muda. Um gatilho copia cada gravação para as tabelas novas.
-- Quem lê: Admin sempre e quem tem a caixa "Ver valores" (pode_ver_valores(), da V2a), pela pessoa vista (uid_efetivo).
-- Decidido com o usuário em 25/11/2026: proteger os QUATRO lugares (as 26 pessoas ativas têm a aba Logística, então proteger só o frete escolhido não esconderia nada: as cotações mostram o mesmo preço):
--   1) `pcp_fretes.valor_frete` (valor do frete escolhido) e `pcp_fretes.valor_nota` (valor da nota do que está sendo enviado)   -> pcp_fretes_valores
--   2) `pcp_cotacoes_fretes.valor`                                                                                           -> pcp_cotacoes_fretes_valores
--   3) `pcp_aprovacoes_fretes.valor_no_momento`                                                                              -> pcp_aprovacoes_fretes_valores
--   4) `pcp_pedidos_faturamento.valor`                                                                                       -> pcp_pedidos_faturamento_valores
-- Volumes em 25/11/2026: 17 fretes (4 com valor de frete, nenhum com valor de nota), 17 cotações (9 com valor), 0 aprovações, 203 pedidos de faturamento (todos com valor).
-- APLICAR FORA DO HORÁRIO (gatilhos novos em tabelas que a Logística e o Financeiro gravam).
set local lock_timeout = '3s';

-- 1) cópia de segurança do que existe hoje
create table if not exists public.pcp_fretes_antes_v4_20261125 as
  select id, valor_frete, valor_nota, now() as copiado_em from public.pcp_fretes;
alter table public.pcp_fretes_antes_v4_20261125 enable row level security;
create table if not exists public.pcp_cotacoes_fretes_antes_v4_20261125 as
  select id, valor, now() as copiado_em from public.pcp_cotacoes_fretes;
alter table public.pcp_cotacoes_fretes_antes_v4_20261125 enable row level security;
create table if not exists public.pcp_aprovacoes_fretes_antes_v4_20261125 as
  select id, valor_no_momento, now() as copiado_em from public.pcp_aprovacoes_fretes;
alter table public.pcp_aprovacoes_fretes_antes_v4_20261125 enable row level security;
create table if not exists public.pcp_pedidos_faturamento_antes_v4_20261125 as
  select id, valor, now() as copiado_em from public.pcp_pedidos_faturamento;
alter table public.pcp_pedidos_faturamento_antes_v4_20261125 enable row level security;

-- 2) tabelas-irmãs (sem chave estrangeira: a linha de origem pode ser apagada pelo fluxo antigo; aqui só guardamos o número)
create table if not exists public.pcp_fretes_valores (
  frete_id uuid primary key, valor_frete numeric, valor_nota numeric, atualizado_em timestamptz not null default now());
create table if not exists public.pcp_cotacoes_fretes_valores (
  cotacao_id uuid primary key, valor numeric, atualizado_em timestamptz not null default now());
create table if not exists public.pcp_aprovacoes_fretes_valores (
  aprovacao_id uuid primary key, valor_no_momento numeric, atualizado_em timestamptz not null default now());
create table if not exists public.pcp_pedidos_faturamento_valores (
  faturamento_id uuid primary key, valor numeric, atualizado_em timestamptz not null default now());

do $$
declare t text;
begin
  foreach t in array array['pcp_fretes_valores', 'pcp_cotacoes_fretes_valores', 'pcp_aprovacoes_fretes_valores', 'pcp_pedidos_faturamento_valores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('drop policy if exists etapa17_valores on public.%I', t);
    execute format('create policy etapa17_valores on public.%I for all to authenticated using ((select public.pode_ver_valores())) with check ((select public.pode_ver_valores()))', t);
  end loop;
end $$;

-- 3) cópia dos valores que já existem (repetir é seguro)
insert into public.pcp_fretes_valores (frete_id, valor_frete, valor_nota)
  select id, valor_frete, valor_nota from public.pcp_fretes where valor_frete is not null or valor_nota is not null
  on conflict (frete_id) do nothing;
insert into public.pcp_cotacoes_fretes_valores (cotacao_id, valor)
  select id, valor from public.pcp_cotacoes_fretes where valor is not null
  on conflict (cotacao_id) do nothing;
insert into public.pcp_aprovacoes_fretes_valores (aprovacao_id, valor_no_momento)
  select id, valor_no_momento from public.pcp_aprovacoes_fretes where valor_no_momento is not null
  on conflict (aprovacao_id) do nothing;
insert into public.pcp_pedidos_faturamento_valores (faturamento_id, valor)
  select id, valor from public.pcp_pedidos_faturamento where valor is not null
  on conflict (faturamento_id) do nothing;

-- 4) espelho: toda gravação nas colunas antigas vai também para as tabelas novas (security definer: quem grava pode não ver valores)
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

drop trigger if exists frete_espelhar_valores_ins on public.pcp_fretes;
create trigger frete_espelhar_valores_ins after insert on public.pcp_fretes
  for each row when (new.valor_frete is not null or new.valor_nota is not null) execute function public.frete_espelhar_valores();
drop trigger if exists frete_espelhar_valores_upd on public.pcp_fretes;
create trigger frete_espelhar_valores_upd after update of valor_frete, valor_nota on public.pcp_fretes
  for each row when (new.valor_frete is distinct from old.valor_frete or new.valor_nota is distinct from old.valor_nota) execute function public.frete_espelhar_valores();

drop trigger if exists cotacao_frete_espelhar_valores_ins on public.pcp_cotacoes_fretes;
create trigger cotacao_frete_espelhar_valores_ins after insert on public.pcp_cotacoes_fretes
  for each row when (new.valor is not null) execute function public.cotacao_frete_espelhar_valores();
drop trigger if exists cotacao_frete_espelhar_valores_upd on public.pcp_cotacoes_fretes;
create trigger cotacao_frete_espelhar_valores_upd after update of valor on public.pcp_cotacoes_fretes
  for each row when (new.valor is distinct from old.valor) execute function public.cotacao_frete_espelhar_valores();

drop trigger if exists aprovacao_frete_espelhar_valores_ins on public.pcp_aprovacoes_fretes;
create trigger aprovacao_frete_espelhar_valores_ins after insert on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is not null) execute function public.aprovacao_frete_espelhar_valores();
drop trigger if exists aprovacao_frete_espelhar_valores_upd on public.pcp_aprovacoes_fretes;
create trigger aprovacao_frete_espelhar_valores_upd after update of valor_no_momento on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is distinct from old.valor_no_momento) execute function public.aprovacao_frete_espelhar_valores();

drop trigger if exists faturamento_espelhar_valores_ins on public.pcp_pedidos_faturamento;
create trigger faturamento_espelhar_valores_ins after insert on public.pcp_pedidos_faturamento
  for each row when (new.valor is not null) execute function public.faturamento_espelhar_valores();
drop trigger if exists faturamento_espelhar_valores_upd on public.pcp_pedidos_faturamento;
create trigger faturamento_espelhar_valores_upd after update of valor on public.pcp_pedidos_faturamento
  for each row when (new.valor is distinct from old.valor) execute function public.faturamento_espelhar_valores();

-- 5) conferência: se algo não bate, tudo é desfeito
do $$
declare a int; b int;
begin
  select count(*) into a from public.pcp_fretes f where (f.valor_frete is not null or f.valor_nota is not null)
    and not exists (select 1 from public.pcp_fretes_valores v where v.frete_id = f.id and v.valor_frete is not distinct from f.valor_frete and v.valor_nota is not distinct from f.valor_nota);
  if a <> 0 then raise exception 'V4a: % fretes sem a cópia certa', a; end if;
  select count(*) into a from public.pcp_cotacoes_fretes f where f.valor is not null
    and not exists (select 1 from public.pcp_cotacoes_fretes_valores v where v.cotacao_id = f.id and v.valor = f.valor);
  if a <> 0 then raise exception 'V4a: % cotações de frete sem a cópia certa', a; end if;
  select count(*) into a from public.pcp_aprovacoes_fretes f where f.valor_no_momento is not null
    and not exists (select 1 from public.pcp_aprovacoes_fretes_valores v where v.aprovacao_id = f.id and v.valor_no_momento = f.valor_no_momento);
  if a <> 0 then raise exception 'V4a: % aprovações de frete sem a cópia certa', a; end if;
  select count(*) into a from public.pcp_pedidos_faturamento f where f.valor is not null
    and not exists (select 1 from public.pcp_pedidos_faturamento_valores v where v.faturamento_id = f.id and v.valor = f.valor);
  if a <> 0 then raise exception 'V4a: % pedidos de faturamento sem a cópia certa', a; end if;
  select count(*) into a from public.pcp_pedidos_faturamento_valores; select count(*) into b from public.pcp_pedidos_faturamento where valor is not null;
  if a <> b then raise exception 'V4a: o faturamento tem % linhas de valor e % com valor', a, b; end if;
end $$;

-- Reverter: drop dos oito gatilhos (frete_, cotacao_frete_, aprovacao_frete_, faturamento_ + _ins e _upd), das quatro funções *_espelhar_valores e das quatro tabelas *_valores.
