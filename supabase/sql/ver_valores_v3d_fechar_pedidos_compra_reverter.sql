-- Reverte a V3d (devolve o dinheiro às colunas antigas e volta ao espelho da V3a). O front de hoje (V3b e V3c) segue funcionando: ele lê as tabelas novas, que não são apagadas.
set local lock_timeout = '3s';
drop trigger if exists pedido_compra_desviar_valores_upd on public.pcp_pedidos_compra;
drop trigger if exists pedido_compra_desviar_valores_ins on public.pcp_pedidos_compra;
drop trigger if exists demanda_setorial_desviar_valores_upd on public.demandas_setoriais;
drop trigger if exists demanda_setorial_desviar_valores_ins on public.demandas_setoriais;

-- devolve os valores às colunas (sem mexer na movimentação)
alter table public.pcp_pedidos_compra disable trigger trg_pcp_pedido_marca_movimentacao;
update public.pcp_pedidos_compra p set
  valor_compra = v.valor_compra,
  vencedoras = case when jsonb_typeof(p.vencedoras) = 'array' then
    (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' and v.vencedoras_valores ? (e ->> 'cotacao_id')
                                    then e || jsonb_build_object('valor', v.vencedoras_valores -> (e ->> 'cotacao_id')) else e end order by o), '[]'::jsonb)
       from jsonb_array_elements(p.vencedoras) with ordinality t(e, o)) else p.vencedoras end,
  itens = case when jsonb_typeof(p.itens) = 'array' and jsonb_typeof(v.itens_valores) = 'array' then
    (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' and coalesce(v.itens_valores -> (o::int - 1), 'null'::jsonb) <> 'null'::jsonb
                                    then e || jsonb_build_object('valor_unitario', v.itens_valores -> (o::int - 1)) else e end order by o), '[]'::jsonb)
       from jsonb_array_elements(p.itens) with ordinality t(e, o)) else p.itens end
  from public.pcp_pedidos_compra_valores v where v.pedido_id = p.id;
alter table public.pcp_pedidos_compra enable trigger trg_pcp_pedido_marca_movimentacao;
update public.demandas_setoriais d set valor_compra = v.valor_compra from public.demandas_setoriais_valores v where v.demanda_id = d.id and v.valor_compra is not null;

-- função de faturamento e separação como eram
create or replace function public.gerar_pedido_faturamento() returns trigger language plpgsql as $function$
begin
  if new.status_compra = 'Comprado' and (old.status_compra is distinct from 'Comprado') then
    insert into public.pcp_pedidos_faturamento (pedido_id, numero_oc, numero_pedido, fornecedor, centro_custo, valor)
    values (new.id, new.numero_oc, new.numero_pedido, new.fornecedor, new.centro_custo, new.valor_compra)
    on conflict (pedido_id) do nothing;
  end if;
  return new;
end;
$function$;
drop function if exists public.compras_dividir_pedido(uuid, integer[], text, text);
alter function public.compras_dividir_pedido_interna(uuid, integer[], text, text) rename to compras_dividir_pedido;
revoke all on function public.compras_dividir_pedido(uuid, integer[], text, text) from public, anon;
grant execute on function public.compras_dividir_pedido(uuid, integer[], text, text) to authenticated;

-- e o espelho da V3a volta (recriar pelo arquivo ver_valores_v3a_pedidos_compra_valores.sql, seção 5: funções e os quatro gatilhos)
drop function if exists public.demanda_setorial_desviar_valores();
drop function if exists public.pedido_compra_desviar_valores();
