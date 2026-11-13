-- Desfaz visoes_somente_leitura.sql: devolve a quem entrou os direitos de escrita nas seis visões (o estado de antes de 13/11/2026, que deixava alterar card pela visão).
-- Só use se algum fluxo do sistema, que não encontrei no código, escrevia por uma dessas visões.
grant insert, update, delete, truncate, references, trigger on
  public.crm_oportunidades_basico, public.licitacoes_basico, public.rh_comissoes, public.vw_estoque_disponivel, public.vw_historico_opl, public.vw_kpis_lead_time
  to authenticated;
