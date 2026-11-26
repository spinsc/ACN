-- Reverte o passo 1 da V6: devolve a funcao `gerar_pedido_faturamento` como estava (le `new.valor_compra` e, se nulo, a tabela protegida).
create or replace function public.gerar_pedido_faturamento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status_compra = 'Comprado' and (old.status_compra is distinct from 'Comprado') then
    insert into public.pcp_pedidos_faturamento (pedido_id, numero_oc, numero_pedido, fornecedor, centro_custo, valor)
    values (new.id, new.numero_oc, new.numero_pedido, new.fornecedor, new.centro_custo,
            coalesce(new.valor_compra, (select v.valor_compra from public.pcp_pedidos_compra_valores v where v.pedido_id = new.id)))
    on conflict (pedido_id) do nothing;
  end if;
  return new;
end;
$function$;
