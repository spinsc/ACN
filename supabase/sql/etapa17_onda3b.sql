-- Etapa 17b, onda 3b (04/11/2026) — separa POR ABA as 16 tabelas do Comercial (CRM e Licitações) que só poucas telas usam.
--
-- Por que existe: continuação da onda 3a. Quem entrou ainda lia e gravava em tudo; aqui estas tabelas passam a aceitar só o Admin e quem tem ALGUMA das abas que as usam
-- (decisão do usuário em 04/11/2026: "quem tem qualquer aba que a usa"; grupo Comercial escolhido por ele). A lista de abas de cada tabela saiu do mapa de importações do código
-- (tabela → arquivos → telas que os alcançam) e a função é a mesma da onda 3a (tem_alguma_aba, irmã de tem_aba).
--
-- O que NÃO entra nesta onda (e por quê): crm_oportunidades, licitacoes e clientes (lidas por mais de 20 abas, entre elas a criação de OP); crm_historico, licitacao_documentos e
-- licitacao_pedidos (a casca do sistema ou muitas telas leem); crm_estagios_funil (gatilhos de crm_oportunidades, que rodam com o poder de quem grava o card, a leem: fechar por aba
-- faria o card falhar para quem muda a etapa sem a aba CRM); crm_vendas (a função renomear_opl, que roda com o poder de quem chama, mexe nela); crm_config (nenhuma tela usa).
-- Essas pedem um desenho próprio (visão só com o que cada aba precisa) antes de qualquer fechamento — inclusive a leitura dos cards do CRM pelo operador de vendas do Telecom.
-- Para voltar atrás: etapa17_onda3b_reverter.sql.

-- CRM: anexos, checklist da etapa, contatos, interações, mensagens de WhatsApp e cadastro de clientes do CRM (a aba Administração também lê)
drop policy if exists etapa17_logado on public.crm_anexos;
create policy etapa17_abas on public.crm_anexos for all to authenticated using (public.tem_alguma_aba(array['admin', 'crm'])) with check (public.tem_alguma_aba(array['admin', 'crm']));
drop policy if exists etapa17_logado on public.crm_checklist_itens;
create policy etapa17_abas on public.crm_checklist_itens for all to authenticated using (public.tem_alguma_aba(array['crm'])) with check (public.tem_alguma_aba(array['crm']));
drop policy if exists etapa17_logado on public.crm_checklist_progresso;
create policy etapa17_abas on public.crm_checklist_progresso for all to authenticated using (public.tem_alguma_aba(array['crm'])) with check (public.tem_alguma_aba(array['crm']));
drop policy if exists etapa17_logado on public.crm_clientes;
create policy etapa17_abas on public.crm_clientes for all to authenticated using (public.tem_alguma_aba(array['admin'])) with check (public.tem_alguma_aba(array['admin']));
drop policy if exists etapa17_logado on public.crm_contatos;
create policy etapa17_abas on public.crm_contatos for all to authenticated using (public.tem_alguma_aba(array['admin', 'crm'])) with check (public.tem_alguma_aba(array['admin', 'crm']));
drop policy if exists etapa17_logado on public.crm_historico_contatos;
create policy etapa17_abas on public.crm_historico_contatos for all to authenticated using (public.tem_alguma_aba(array['admin'])) with check (public.tem_alguma_aba(array['admin']));
drop policy if exists etapa17_logado on public.crm_interacoes;
create policy etapa17_abas on public.crm_interacoes for all to authenticated using (public.tem_alguma_aba(array['admin', 'crm'])) with check (public.tem_alguma_aba(array['admin', 'crm']));
drop policy if exists etapa17_logado on public.crm_whatsapp_msgs;
create policy etapa17_abas on public.crm_whatsapp_msgs for all to authenticated using (public.tem_alguma_aba(array['admin', 'crm'])) with check (public.tem_alguma_aba(array['admin', 'crm']));

-- Licitações: aditivos, anexos, itens do contrato, endereços, parceiros e a formação de parceiro (só a aba Licitações)
drop policy if exists etapa17_logado on public.licitacao_aditivos;
create policy etapa17_abas on public.licitacao_aditivos for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));
drop policy if exists etapa17_logado on public.licitacao_anexos;
create policy etapa17_abas on public.licitacao_anexos for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));
drop policy if exists etapa17_logado on public.licitacao_contrato_itens;
create policy etapa17_abas on public.licitacao_contrato_itens for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));
drop policy if exists etapa17_logado on public.licitacao_enderecos;
create policy etapa17_abas on public.licitacao_enderecos for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));
drop policy if exists etapa17_logado on public.licitacao_formacao_parceiro;
create policy etapa17_abas on public.licitacao_formacao_parceiro for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));
drop policy if exists etapa17_logado on public.licitacao_parceiros;
create policy etapa17_abas on public.licitacao_parceiros for all to authenticated using (public.tem_alguma_aba(array['licitacoes'])) with check (public.tem_alguma_aba(array['licitacoes']));

-- Contatos da licitação (o CRM converte card em licitação e o Telecom mostra o contato) e agenda de compromissos (Calendário, CRM, Licitações, Engenharia, SAC e Telecom)
drop policy if exists etapa17_logado on public.licitacao_contatos;
create policy etapa17_abas on public.licitacao_contatos for all to authenticated using (public.tem_alguma_aba(array['crm', 'licitacoes', 'telecom'])) with check (public.tem_alguma_aba(array['crm', 'licitacoes', 'telecom']));
drop policy if exists etapa17_logado on public.agenda_compromissos;
create policy etapa17_abas on public.agenda_compromissos for all to authenticated using (public.tem_alguma_aba(array['admin', 'calendario', 'crm', 'engenharia', 'licitacoes', 'sac', 'telecom'])) with check (public.tem_alguma_aba(array['admin', 'calendario', 'crm', 'engenharia', 'licitacoes', 'sac', 'telecom']));
