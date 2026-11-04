-- Etapa 17b, onda 3c, parte B (04/11/2026) — fecha os cards por aba. SÓ DEPOIS de a parte A estar no banco E de as telas já lerem pelas visões (deploy concluído).
--
-- crm_oportunidades: Admin e quem tem CRM ou Telecom (as duas telas que trabalham no card). licitacoes: Admin e quem tem Licitações ou CRM (o CRM converte card em licitação).
-- Todas as outras telas (Calendário, Nova OP, SAC, busca geral, alertas, Relatórios, Vínculos da OP, Logística, Formação de Preços, Contatos…) leem crm_oportunidades_basico e
-- licitacoes_basico. Os gatilhos dessas tabelas (auditoria da etapa, cancelar análises ao perder) só rodam quando alguém grava o card, e quem grava tem a aba.
-- Para voltar atrás: etapa17_onda3c_reverter.sql.

drop policy if exists etapa17_logado on public.crm_oportunidades;
create policy etapa17_abas on public.crm_oportunidades for all to authenticated using (public.tem_alguma_aba(array['admin', 'crm', 'telecom'])) with check (public.tem_alguma_aba(array['admin', 'crm', 'telecom']));
drop policy if exists etapa17_logado on public.licitacoes;
create policy etapa17_abas on public.licitacoes for all to authenticated using (public.tem_alguma_aba(array['admin', 'licitacoes', 'crm'])) with check (public.tem_alguma_aba(array['admin', 'licitacoes', 'crm']));
