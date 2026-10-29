-- 28/10/2026 (pedido do usuário, estrutura da Spin): barra sinalizadora G2 sempre leva o amplificador incluso.
-- Coluna nova: cadastro_itens.inclui_item_id = item que vem junto, sem estar na venda. Marcada nas 11 barras G2 ativas, apontando para o AMPLIFICADOR CONTROLADOR S100W (código 1177).
-- Os itens de serviço 4446 (INSTALAÇÃO) e 4433 (INSTALAÇÃO TERCEIRO) passam à categoria GENERICO (fora da BOM e da estrutura).
alter table public.cadastro_itens add column if not exists inclui_item_id uuid references public.cadastro_itens(id);
comment on column public.cadastro_itens.inclui_item_id is 'Item que vem INCLUSO com este, sem estar na venda: entra na lista de material e conta como vendido no cálculo da estrutura (ex.: barra G2 inclui o amplificador S100W). Se a venda já traz o item, não soma de novo.';
update public.cadastro_itens set inclui_item_id = (select id from public.cadastro_itens where codigo = '1177') where ativo and nome ilike 'BARRA SINALIZADORA%G2%' and inclui_item_id is null;
update public.cadastro_itens set categoria = 'GENERICO' where codigo in ('4446','4433') and categoria is null and ativo;
