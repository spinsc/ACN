-- Reverte compras_entregas_espera_material.sql (E4, 17/11/2026): tira o gatilho e volta a função ao que era (chegada marcada à mão OU a OC inteira "Recebido").
drop trigger if exists trg_entrega_reavalia_espera on public.compras_entregas;
drop function if exists public.trg_entrega_reavalia_espera();

create or replace function public.engenharia_item_chegou(p_pedido uuid, p_chave text, p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.compras_chegadas_itens c where c.pedido_id = p_pedido and c.chave = p_chave and c.quantidade > 0
                   and lower(btrim(c.nome)) = lower(btrim(coalesce(p_nome, ''))))
      or exists (select 1 from public.pcp_pedidos_compra p where p.id = p_pedido and p.status_compra = 'Recebido');
$$;
