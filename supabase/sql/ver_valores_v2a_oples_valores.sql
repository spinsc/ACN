-- "Ver valores" no banco, onda V2a (24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 9): valor total e mão de obra da OP numa tabela-irmã.
-- ESTA ONDA É SÓ ADITIVA: nada some de `oples` e nenhuma tela muda. As colunas antigas continuam valendo e um gatilho copia cada gravação para a tabela nova.
-- Quem lê: Admin sempre e quem tem a caixa "Ver valores" (auth_usuarios.ver_valores diferente de falso), pela pessoa vista (uid_efetivo).
-- Duas marcas sem valor em `oples` (tem_mo_adaptacao, tem_mo_serralheria): a mão de obra também decide ROTA (temSerralheria em FluxoEntrega.ts, faltaApontar em EquipeDaOp.tsx);
--   quem não vê valores trabalha nessas filas e precisa continuar enxergando "tem mão de obra" sem ver quanto.
-- APLICAR FORA DO HORÁRIO (gatilhos novos e coluna nova na tabela quente `oples`); antes, rodar o ensaio de custo (supabase/sql/ensaio_de_custo.sql) com este arquivo no lugar marcado.
-- O reajuste das 345 OPs com mão de obra (marcas) é um UPDATE que dispara os gatilhos BEFORE da `oples`; os três (entrega pela chegada, lead time, sync_norm) só mudam dado quando
--   o campo que eles olham muda, então o reajuste não altera nada além das marcas (conferido lendo as funções em 24/11/2026).
set local lock_timeout = '3s';

-- 1) quem pode ver valores
create or replace function public.pode_ver_valores()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.ver_valores, true)
                     from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$function$;
revoke all on function public.pode_ver_valores() from public, anon;
grant execute on function public.pode_ver_valores() to authenticated;

-- 2) cópia de segurança e tabela-irmã (sem chave estrangeira: a OP nunca é apagada, só marcada como excluída)
create table if not exists public.oples_valores_antes_20261124 as
  select id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, now() as copiado_em from public.oples;
alter table public.oples_valores_antes_20261124 enable row level security;

create table if not exists public.oples_valores (
  op_id uuid primary key,
  valor_total numeric,
  valor_mao_de_obra numeric,
  valor_mao_de_obra_serralheria numeric,
  atualizado_em timestamptz not null default now()
);
alter table public.oples_valores enable row level security;
revoke all on public.oples_valores from anon, public;
drop policy if exists etapa17_valores on public.oples_valores;
create policy etapa17_valores on public.oples_valores for all to authenticated
  using ((select public.pode_ver_valores())) with check ((select public.pode_ver_valores()));

insert into public.oples_valores (op_id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria)
select id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria from public.oples
 where valor_total is not null or valor_mao_de_obra is not null or valor_mao_de_obra_serralheria is not null
on conflict (op_id) do nothing;

-- 3) as marcas sem valor
alter table public.oples
  add column if not exists tem_mo_adaptacao boolean not null default false,
  add column if not exists tem_mo_serralheria boolean not null default false;

create or replace function public.oples_marcar_mao_de_obra()
returns trigger language plpgsql as $function$
begin
  new.tem_mo_adaptacao := coalesce(new.valor_mao_de_obra, 0) > 0;
  new.tem_mo_serralheria := coalesce(new.valor_mao_de_obra_serralheria, 0) > 0;
  return new;
end;
$function$;
revoke all on function public.oples_marcar_mao_de_obra() from public, anon, authenticated;
drop trigger if exists oples_marcar_mao_de_obra on public.oples;
create trigger oples_marcar_mao_de_obra before insert or update of valor_mao_de_obra, valor_mao_de_obra_serralheria on public.oples
  for each row execute function public.oples_marcar_mao_de_obra();

-- 4) espelho: toda gravação nas colunas antigas vai também para a tabela nova (security definer: quem grava a OP pode não ter direito de ver valores)
create or replace function public.oples_espelhar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.oples_valores as v (op_id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, atualizado_em)
  values (new.id, new.valor_total, new.valor_mao_de_obra, new.valor_mao_de_obra_serralheria, now())
  on conflict (op_id) do update set valor_total = excluded.valor_total, valor_mao_de_obra = excluded.valor_mao_de_obra,
    valor_mao_de_obra_serralheria = excluded.valor_mao_de_obra_serralheria, atualizado_em = now();
  return null;
end;
$function$;
revoke all on function public.oples_espelhar_valores() from public, anon, authenticated;
drop trigger if exists oples_espelhar_valores_ins on public.oples;
create trigger oples_espelhar_valores_ins after insert on public.oples
  for each row when (new.valor_total is not null or new.valor_mao_de_obra is not null or new.valor_mao_de_obra_serralheria is not null)
  execute function public.oples_espelhar_valores();
drop trigger if exists oples_espelhar_valores_upd on public.oples;
create trigger oples_espelhar_valores_upd after update of valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria on public.oples
  for each row when (new.valor_total is distinct from old.valor_total or new.valor_mao_de_obra is distinct from old.valor_mao_de_obra
                     or new.valor_mao_de_obra_serralheria is distinct from old.valor_mao_de_obra_serralheria)
  execute function public.oples_espelhar_valores();

-- 5) acerta as marcas das OPs que já existem (só as que têm mão de obra; o gatilho `oples_marcar_mao_de_obra` não dispara, pois a lista de colunas é outra)
update public.oples set tem_mo_adaptacao = coalesce(valor_mao_de_obra, 0) > 0, tem_mo_serralheria = coalesce(valor_mao_de_obra_serralheria, 0) > 0
 where coalesce(valor_mao_de_obra, 0) > 0 or coalesce(valor_mao_de_obra_serralheria, 0) > 0;

-- Reverter: drop trigger oples_espelhar_valores_upd on public.oples; drop trigger oples_espelhar_valores_ins on public.oples; drop trigger oples_marcar_mao_de_obra on public.oples;
--   drop function public.oples_espelhar_valores(); drop function public.oples_marcar_mao_de_obra(); alter table public.oples drop column tem_mo_adaptacao, drop column tem_mo_serralheria;
--   drop table public.oples_valores; drop function public.pode_ver_valores();
