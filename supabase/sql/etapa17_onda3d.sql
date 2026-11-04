-- Etapa 17b, onda 3d (04/11/2026) — duas tabelas de frete por aba e três funções de gatilho sem a chave pública.
--
-- Por que existe: o grupo escolhido pelo usuário em 04/11/2026 foi "Compras e pedidos". O levantamento mostrou que o pedido de compra (pcp_pedidos_compra) NÃO pode ser fechado por aba
-- com ganho real: as 25 pessoas ativas têm a aba Logística, e a Logística lê e grava o pedido no recebimento; mesmo escondendo o valor de quem não é do Compras, Financeiro, PCP, CRM,
-- Cotações ou Licitações, só 5 pessoas deixariam de ver o dinheiro, e o custo seria refazer o recebimento da Logística por funções do banco. O usuário decidiu (04/11/2026) aplicar só o que é
-- seguro agora e deixar o pedido como está.
--
-- 1) Cotações e aprovações de frete: só quem usa a tela da Logística (cotação e aprovação do frete) — Logística, Compras e Financeiro; o Admin entra sempre. O mapa de importações do
--    código mostra um único arquivo (LogisticaTab) mais a Administração, e nenhum gatilho, função ou visão do banco cita estas tabelas (só a chave estrangeira de pcp_fretes, que o
--    banco confere por conta própria). Efeito de hoje: nenhum (todos têm a aba Logística); vale para as pessoas cadastradas daqui em diante sem ela.
-- 2) Os três gatilhos que o aviso de segurança do banco apontava como executáveis pela chave pública: gatilho dispara sem esse direito e ninguém os chama diretamente.
-- Para voltar atrás: etapa17_onda3d_reverter.sql (as três funções não precisam voltar).
drop policy if exists etapa17_logado on public.pcp_cotacoes_fretes;
create policy etapa17_abas on public.pcp_cotacoes_fretes for all to authenticated
  using (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica'])) with check (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica']));
drop policy if exists etapa17_logado on public.pcp_aprovacoes_fretes;
create policy etapa17_abas on public.pcp_aprovacoes_fretes for all to authenticated
  using (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica'])) with check (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica']));

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.trg_chegada_item_reavalia() from public, anon, authenticated;
revoke all on function public.trg_pedido_recebido_reavalia() from public, anon, authenticated;
