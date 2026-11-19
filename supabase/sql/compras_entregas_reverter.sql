-- Desfaz a tabela compras_entregas (17/11/2026, PLANO_ENTREGA_POR_FORNECEDOR.md, etapa E1).
-- RECUSA se houver linhas: cada linha é o registro real de quando um fornecedor entrega (e, na E2, de quando chegou), e apagar isso perde o histórico.
-- Os pedidos continuam funcionando sem a tabela (cada pedido vale como UMA entrega, com a data do próprio pedido); o que se perde é só a data de cada fornecedor.
do $$
begin
  if exists (select 1 from public.compras_entregas) then
    raise exception 'compras_entregas tem % linha(s); não desfazer sem decisão do usuário', (select count(*) from public.compras_entregas);
  end if;
end $$;

drop trigger if exists trg_compras_entregas_toca on public.compras_entregas;
drop table if exists public.compras_entregas;
drop function if exists public.compras_entregas_toca();
