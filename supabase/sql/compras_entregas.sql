-- 17/11/2026 (pedido do usuário; PLANO_ENTREGA_POR_FORNECEDOR.md, etapa E1): cada fornecedor de um pedido de compra tem a SUA data de entrega e, na etapa E2, o seu recebimento.
-- Até hoje o pedido tinha uma data só (pcp_pedidos_compra.data_prevista_recebimento), mesmo quando duas ou mais cotações de fornecedores diferentes venciam (`vencedoras`).
-- Uma linha por fornecedor vencedor do pedido comprado. Pedido SEM linhas (comprado antes desta mudança, ou criado direto como "Comprado" por outra tela) continua valendo como UMA entrega,
-- montada pela tela a partir das colunas do próprio pedido: nenhum pedido existente é regravado.
-- Sem valor em dinheiro aqui (o valor de cada fornecedor continua em `vencedoras`); por isso a política é a de quem entrou, como o resto do Compras (`pcp_pedidos_compra`).

create table if not exists public.compras_entregas (
  id uuid primary key default gen_random_uuid(),
  -- restrict: nunca apaga o pedido que tem entrega registrada
  pedido_id uuid not null references public.pcp_pedidos_compra(id) on delete restrict,
  cotacao_id uuid,                       -- a cotação vencedora deste fornecedor (nula no pedido sem cotação)
  fornecedor text,
  itens jsonb,                           -- posições dos itens do pedido que este fornecedor entrega; nulo = o pedido todo
  data_prevista date not null,           -- a data de entrega DESTE fornecedor (ou o dia da coleta, quando o pedido é de coleta)
  situacao text not null default 'aguardando' check (situacao in ('aguardando', 'divergencia', 'recebida')),
  numero_nf text,                        -- do recebimento (etapa E2)
  data_recebimento_real date,
  quantidade_recebida numeric,
  observacoes text,
  recebida_em timestamptz,
  recebida_por text,
  alerta_mencionado_em timestamptz,      -- o aviso de entrega atrasada, um por entrega (etapa E3)
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now()
);

comment on table public.compras_entregas is 'Uma linha por fornecedor vencedor de um pedido de compra comprado: a data de entrega e o recebimento DAQUELE fornecedor. Pedido sem linhas vale como uma entrega só (montada pela tela).';

-- um fornecedor (cotação) por pedido; no pedido sem cotação (cotacao_id nulo) só pode haver uma linha
create unique index if not exists compras_entregas_pedido_cotacao_idx
  on public.compras_entregas (pedido_id, coalesce(cotacao_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- as telas de atraso e o calendário só olham o que ainda não foi recebido
create index if not exists compras_entregas_abertas_idx on public.compras_entregas (data_prevista) where situacao <> 'recebida';

create or replace function public.compras_entregas_toca()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function public.compras_entregas_toca() from public, anon, authenticated;

drop trigger if exists trg_compras_entregas_toca on public.compras_entregas;
create trigger trg_compras_entregas_toca before update on public.compras_entregas
  for each row execute function public.compras_entregas_toca();

alter table public.compras_entregas enable row level security;
drop policy if exists etapa17_logado on public.compras_entregas;
create policy etapa17_logado on public.compras_entregas for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));
revoke all on table public.compras_entregas from anon;
