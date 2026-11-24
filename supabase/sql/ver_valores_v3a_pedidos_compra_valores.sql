-- "Ver valores" no banco, onda V3a (24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 10): dinheiro do pedido de compra e da demanda do Compras numa tabela-irmã.
-- ESTA ONDA É SÓ ADITIVA: nada some de `pcp_pedidos_compra` nem de `demandas_setoriais` e nenhuma tela muda. Um gatilho copia cada gravação para as tabelas novas.
-- Quem lê: Admin sempre e quem tem a caixa "Ver valores" (pode_ver_valores(), da V2a), pela pessoa vista (uid_efetivo).
-- O dinheiro do pedido está em TRÊS lugares (decisão do usuário em 24/11/2026: proteger os três):
--   1) coluna `valor_compra`;
--   2) a chave `valor` de cada item da lista `vencedoras` (as outras chaves, cotacao_id, fornecedor e itens, NÃO são dinheiro: o recebimento por fornecedor as usa);
--   3) a chave `valor_unitario` de cada item da lista `itens` (as outras, quantidade_comprada, nome, item_id..., também ficam).
-- Como guardar nas tabelas novas: `vencedoras_valores` = objeto {cotacao_id: valor}; `itens_valores` = lista de valor_unitario NA ORDEM de `itens` (nulo onde o item não tem preço).
-- Fora desta onda (de propósito): `compras_requisicoes` (vazia), `demandas_avulsas.itens[].valor_unitario` (2 itens no banco; tabela quente, vai para uma onda própria se o usuário quiser)
--   e `pcp_pedidos_faturamento` (V4).
-- APLICAR FORA DO HORÁRIO (gatilhos novos em `pcp_pedidos_compra`, que muitas telas gravam); antes, rodar o ensaio de custo (supabase/sql/ensaio_de_custo.sql) com este arquivo no lugar marcado.
set local lock_timeout = '3s';

-- 1) cópia de segurança do que existe hoje
create table if not exists public.pcp_pedidos_compra_antes_v3_20261124 as
  select id, valor_compra, vencedoras, itens, now() as copiado_em from public.pcp_pedidos_compra;
alter table public.pcp_pedidos_compra_antes_v3_20261124 enable row level security;
create table if not exists public.demandas_setoriais_antes_v3_20261124 as
  select id, valor_compra, now() as copiado_em from public.demandas_setoriais where valor_compra is not null;
alter table public.demandas_setoriais_antes_v3_20261124 enable row level security;

-- 2) tabelas-irmãs (sem chave estrangeira: a linha de origem pode ser apagada pelo fluxo antigo; aqui só guardamos o número)
create table if not exists public.pcp_pedidos_compra_valores (
  pedido_id uuid primary key,
  valor_compra numeric,
  vencedoras_valores jsonb,
  itens_valores jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.pcp_pedidos_compra_valores enable row level security;
revoke all on public.pcp_pedidos_compra_valores from anon, public;
drop policy if exists etapa17_valores on public.pcp_pedidos_compra_valores;
create policy etapa17_valores on public.pcp_pedidos_compra_valores for all to authenticated
  using ((select public.pode_ver_valores())) with check ((select public.pode_ver_valores()));

create table if not exists public.demandas_setoriais_valores (
  demanda_id uuid primary key,
  valor_compra numeric,
  atualizado_em timestamptz not null default now()
);
alter table public.demandas_setoriais_valores enable row level security;
revoke all on public.demandas_setoriais_valores from anon, public;
drop policy if exists etapa17_valores on public.demandas_setoriais_valores;
create policy etapa17_valores on public.demandas_setoriais_valores for all to authenticated
  using ((select public.pode_ver_valores())) with check ((select public.pode_ver_valores()));

-- 3) como extrair o dinheiro das duas listas (pura; devolve nulo quando não há nada)
create or replace function public.pedido_compra_extrair_valores(p_vencedoras jsonb, p_itens jsonb)
returns table (vencedoras_valores jsonb, itens_valores jsonb) language sql immutable as $function$
  select
    (select jsonb_object_agg(e->>'cotacao_id', e->'valor')
       from jsonb_array_elements(case when jsonb_typeof(p_vencedoras) = 'array' then p_vencedoras else '[]'::jsonb end) e
      where e ? 'cotacao_id' and e->'valor' is not null and jsonb_typeof(e->'valor') <> 'null'),
    (select case when bool_or(jsonb_typeof(e->'valor_unitario') in ('number', 'string')) then jsonb_agg(case when jsonb_typeof(e->'valor_unitario') in ('number', 'string') then e->'valor_unitario' else 'null'::jsonb end order by o) end
       from jsonb_array_elements(case when jsonb_typeof(p_itens) = 'array' then p_itens else '[]'::jsonb end) with ordinality t(e, o))
$function$;

-- 4) cópia dos valores que já existem (repetir é seguro)
insert into public.pcp_pedidos_compra_valores as v (pedido_id, valor_compra, vencedoras_valores, itens_valores)
select p.id, p.valor_compra, x.vencedoras_valores, x.itens_valores
  from public.pcp_pedidos_compra p cross join lateral public.pedido_compra_extrair_valores(p.vencedoras, p.itens) x
 where p.valor_compra is not null or x.vencedoras_valores is not null or x.itens_valores is not null
on conflict (pedido_id) do nothing;
insert into public.demandas_setoriais_valores (demanda_id, valor_compra)
select id, valor_compra from public.demandas_setoriais where valor_compra is not null
on conflict (demanda_id) do nothing;

-- 5) espelho: toda gravação nas colunas antigas vai também para as tabelas novas (security definer: quem grava o pedido pode não ver valores)
create or replace function public.pedido_compra_espelhar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare x record;
begin
  select * into x from public.pedido_compra_extrair_valores(new.vencedoras, new.itens);
  insert into public.pcp_pedidos_compra_valores as v (pedido_id, valor_compra, vencedoras_valores, itens_valores, atualizado_em)
  values (new.id, new.valor_compra, x.vencedoras_valores, x.itens_valores, now())
  on conflict (pedido_id) do update set valor_compra = excluded.valor_compra, vencedoras_valores = excluded.vencedoras_valores,
    itens_valores = excluded.itens_valores, atualizado_em = now();
  return null;
end;
$function$;
revoke all on function public.pedido_compra_espelhar_valores() from public, anon, authenticated;
drop trigger if exists pedido_compra_espelhar_valores_ins on public.pcp_pedidos_compra;
create trigger pedido_compra_espelhar_valores_ins after insert on public.pcp_pedidos_compra
  for each row when (new.valor_compra is not null or new.vencedoras is not null or new.itens is not null)
  execute function public.pedido_compra_espelhar_valores();
drop trigger if exists pedido_compra_espelhar_valores_upd on public.pcp_pedidos_compra;
create trigger pedido_compra_espelhar_valores_upd after update of valor_compra, vencedoras, itens on public.pcp_pedidos_compra
  for each row when (new.valor_compra is distinct from old.valor_compra or new.vencedoras is distinct from old.vencedoras or new.itens is distinct from old.itens)
  execute function public.pedido_compra_espelhar_valores();

create or replace function public.demanda_setorial_espelhar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.demandas_setoriais_valores as v (demanda_id, valor_compra, atualizado_em)
  values (new.id, new.valor_compra, now())
  on conflict (demanda_id) do update set valor_compra = excluded.valor_compra, atualizado_em = now();
  return null;
end;
$function$;
revoke all on function public.demanda_setorial_espelhar_valores() from public, anon, authenticated;
drop trigger if exists demanda_setorial_espelhar_valores_ins on public.demandas_setoriais;
create trigger demanda_setorial_espelhar_valores_ins after insert on public.demandas_setoriais
  for each row when (new.valor_compra is not null) execute function public.demanda_setorial_espelhar_valores();
drop trigger if exists demanda_setorial_espelhar_valores_upd on public.demandas_setoriais;
create trigger demanda_setorial_espelhar_valores_upd after update of valor_compra on public.demandas_setoriais
  for each row when (new.valor_compra is distinct from old.valor_compra) execute function public.demanda_setorial_espelhar_valores();

-- Reverter: drop trigger pedido_compra_espelhar_valores_upd on public.pcp_pedidos_compra; drop trigger pedido_compra_espelhar_valores_ins on public.pcp_pedidos_compra;
--   drop trigger demanda_setorial_espelhar_valores_upd on public.demandas_setoriais; drop trigger demanda_setorial_espelhar_valores_ins on public.demandas_setoriais;
--   drop function public.pedido_compra_espelhar_valores(); drop function public.demanda_setorial_espelhar_valores(); drop function public.pedido_compra_extrair_valores(jsonb, jsonb);
--   drop table public.pcp_pedidos_compra_valores; drop table public.demandas_setoriais_valores;
