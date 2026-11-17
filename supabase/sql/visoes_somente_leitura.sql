-- Visões do banco só de leitura (13/11/2026).
--
-- Por que: ao medir o custo da visão dos cards do CRM (visao_crm_basico_uma_conferencia_por_consulta.sql) notei que as visões do esquema public davam INSERT, UPDATE, DELETE e
-- TRUNCATE a quem entrou (os direitos padrão do Supabase para objeto novo). Como a visão roda com o poder do dono (postgres, que ignora as regras por linha), isso furava a
-- separação por aba da Etapa 17: PROVADO em transação desfeita que um perfil sem CRM, Telecom nem Licitações (Almoxarifado) alterava 1 card pela visão crm_oportunidades_basico e 1
-- licitação pela licitacoes_basico, enquanto o UPDATE direto na tabela era recusado (0 linhas). vw_kpis_lead_time (sobre as OPs) também aceitava escrita.
-- Nenhum código do sistema escreve por essas visões (conferido em src/). Ensaiado: a leitura das seis continua igual (288, 189, 18, 17, 4625 e 518 linhas) e a escrita é recusada.
-- Só tira direito de ESCREVER; o SELECT de quem entrou continua e a chave pública continua sem nada. Visão nova: repetir este revoke (o Supabase dá os direitos de escrita por padrão).
-- Para voltar atrás: visoes_somente_leitura_reverter.sql.
revoke insert, update, delete, truncate, references, trigger on
  public.crm_oportunidades_basico, public.licitacoes_basico, public.rh_comissoes, public.vw_estoque_disponivel, public.vw_historico_opl, public.vw_kpis_lead_time
  from authenticated, anon, public;
