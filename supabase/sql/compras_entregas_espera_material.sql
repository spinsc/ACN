-- 17/11/2026 (E4 do PLANO_ENTREGA_POR_FORNECEDOR.md; pedido do usuário: "alterar o sistema todo para que possamos ter dados reais de quando chega o que").
-- A espera de material do Desenvolvimento (engenharia_espera_por_material.sql) dava o item como "chegou" quando a Logística marcava a chegada à mão
-- OU quando a OC inteira virava "Recebido". Numa OC de vários fornecedores a OC só vira "Recebido" quando o ÚLTIMO fornecedor chega, mas o rack do primeiro
-- já está na fábrica: agora o item também chega quando a ENTREGA do fornecedor que o traz (compras_entregas) é recebida.
--
-- Regras (as mesmas de EsperaDeMaterial.ts, chegadaDoItem):
--  • o item é a posição na OC (chave 'i0', 'i1'…, 0-based, a mesma numeração das vencedoras e de compras_entregas.itens);
--  • a entrega COBRE o item quando a lista de itens dela está vazia (o pedido inteiro) ou contém a posição;
--  • o item chegou quando há pelo menos uma entrega que o cobre e TODAS as que o cobrem estão "recebida" (com divergência a entrega segue aberta: a Logística
--    marca a chegada à mão se o item veio; dois fornecedores sem lista de itens não dizem de quem é o item, então vale o mais cauteloso);
--  • o gatilho abaixo reavalia as demandas que esperam a OC quando uma entrega nasce, muda de situação ou de itens, ou some (o aviso nasce no banco, não na tela).
-- Nenhum dado existente é regravado. Custo: a função só ganha um terceiro "exists" por índice de pedido_id; o gatilho roda por linha de compras_entregas
-- (poucas por pedido) e a reavaliação só olha as demandas que esperam material (tabela pequena). Reverter: compras_entregas_espera_material_reverter.sql.

create or replace function public.engenharia_item_chegou(p_pedido uuid, p_chave text, p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.compras_chegadas_itens c where c.pedido_id = p_pedido and c.chave = p_chave and c.quantidade > 0
                   and lower(btrim(c.nome)) = lower(btrim(coalesce(p_nome, ''))))
      or exists (select 1 from public.pcp_pedidos_compra p where p.id = p_pedido and p.status_compra = 'Recebido')
      or (
        p_chave ~ '^i[0-9]+$'
        and exists (select 1 from public.compras_entregas e
                     where e.pedido_id = p_pedido
                       and (jsonb_typeof(e.itens) is distinct from 'array' or jsonb_array_length(e.itens) = 0
                            or e.itens @> jsonb_build_array(substring(p_chave from 2)::int)))
        and not exists (select 1 from public.compras_entregas e
                         where e.pedido_id = p_pedido and e.situacao is distinct from 'recebida'
                           and (jsonb_typeof(e.itens) is distinct from 'array' or jsonb_array_length(e.itens) = 0
                                or e.itens @> jsonb_build_array(substring(p_chave from 2)::int)))
      );
$$;

create or replace function public.trg_entrega_reavalia_espera() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- no DELETE o NEW não existe: escolher pelo tipo da operação (mesmo cuidado de trg_chegada_item_reavalia)
  if tg_op = 'DELETE' then perform public.engenharia_reavaliar_por_pedido(old.pedido_id);
  else perform public.engenharia_reavaliar_por_pedido(new.pedido_id); end if;
  return null;
end $$;

drop trigger if exists trg_entrega_reavalia_espera on public.compras_entregas;
create trigger trg_entrega_reavalia_espera after insert or update of situacao, itens or delete on public.compras_entregas
  for each row execute function public.trg_entrega_reavalia_espera();

-- função de gatilho nova: só dispara, ninguém a executa (CLAUDE.md: revoke all from public, anon, authenticated)
revoke all on function public.trg_entrega_reavalia_espera() from public, anon, authenticated;
