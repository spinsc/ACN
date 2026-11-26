-- V6, passo 1 (26/11/2026, pedido do usuario): a funcao do gatilho `trg_pedido_faturamento` deixa de ler a coluna antiga
-- `pcp_pedidos_compra.valor_compra` e le o valor SO da tabela protegida `pcp_pedidos_compra_valores`.
--
-- Por que: a V6 apaga as colunas antigas de dinheiro. Enquanto esta funcao citasse `new.valor_compra`, apagar a coluna quebraria a
-- geracao do pedido de faturamento (plpgsql so resolve o nome na hora de rodar: o erro viria no primeiro pedido que virasse "Comprado").
--
-- Por que nao muda o resultado: desde a V3 a coluna antiga fica sempre nula (0 de 272 pedidos com valor nela em 26/11/2026) e o gatilho
-- BEFORE `pedido_compra_desviar_valores` ja grava o valor na tabela protegida e zera `new.valor_compra` ANTES deste gatilho (AFTER) rodar;
-- entao o `coalesce(new.valor_compra, <tabela protegida>)` ja caia sempre no segundo termo. Aqui so se tira o primeiro.
--
-- Custo: nenhuma tabela, politica, indice ou gatilho e tocado (so o corpo da funcao); ensaio feito antes, tudo desfeito.
-- Reverter: `ver_valores_v6_passo1_gerar_pedido_faturamento_reverter.sql`.

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
            (select v.valor_compra from public.pcp_pedidos_compra_valores v where v.pedido_id = new.id))
    on conflict (pedido_id) do nothing;
  end if;
  return new;
end;
$function$;
