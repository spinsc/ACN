-- Pedido do usuário em 30/10/2026: o número do pedido de compra (PC-QTL54M, sorteado pela hora) era ilegível.
-- Passa a ser PC-00001, PC-00002... em sequência, dado pelo banco ao criar (qualquer tela que crie pedido é coberta, sem mudar cada uma).
-- O pedido que nasce da divisão de outro (itens sem cotação) leva o número do original + letra: PC-00123-B (esse formato o gatilho deixa passar).
-- Os 162 pedidos que já existiam foram renumerados na ordem em que foram criados; o código antigo fica em codigo_antigo (a busca da tela também acha por ele).
alter table public.pcp_pedidos_compra add column if not exists codigo_antigo text;
create sequence if not exists public.pedido_compra_seq;

-- a renumeração não pode contar como "movimentação" do pedido (ultima_movimentacao_em ordena a fila e dispara alertas de parado)
alter table public.pcp_pedidos_compra disable trigger trg_pcp_pedido_marca_movimentacao;

with ord as (
  select id, row_number() over (order by data_criacao, id) n from public.pcp_pedidos_compra where codigo_antigo is null
)
update public.pcp_pedidos_compra p
   set codigo_antigo = p.numero_pedido,
       numero_pedido = 'PC-' || lpad(ord.n::text, 5, '0')
  from ord where ord.id = p.id;

alter table public.pcp_pedidos_compra enable trigger trg_pcp_pedido_marca_movimentacao;

-- a fila do Financeiro guarda uma cópia do número do pedido
update public.pcp_pedidos_faturamento f set numero_pedido = p.numero_pedido
  from public.pcp_pedidos_compra p where p.id = f.pedido_id and f.numero_pedido is distinct from p.numero_pedido;

select setval('public.pedido_compra_seq', greatest((select count(*) from public.pcp_pedidos_compra), 1));

create or replace function public.pedido_compra_numerar() returns trigger language plpgsql as $$
begin
  -- número já no formato novo (PC-00123 ou PC-00123-B, da divisão) passa; qualquer outro (PC-ABC123, PC-DA-..., PC-ALX-...) é trocado pelo próximo da sequência
  if new.numero_pedido is null or new.numero_pedido !~ '^PC-[0-9]{5,}(-[A-Z])?$' then
    new.codigo_antigo := new.numero_pedido;
    new.numero_pedido := 'PC-' || lpad(nextval('public.pedido_compra_seq')::text, 5, '0');
  end if;
  return new;
end $$;
revoke all on function public.pedido_compra_numerar() from public, anon;

drop trigger if exists trg_pedido_compra_numerar on public.pcp_pedidos_compra;
create trigger trg_pedido_compra_numerar before insert on public.pcp_pedidos_compra
  for each row execute function public.pedido_compra_numerar();