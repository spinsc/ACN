-- Visão básica dos cards do CRM: conferir quem pergunta UMA vez por consulta, não por linha (13/11/2026).
--
-- Por que: no teste de carga de 13/11/2026 (40 usuários simulados) o banco pequeno travou por ~35 s. A leitura dos cards do CRM (crm_oportunidades_basico) era a mais
-- cara do sistema: ~280 ms por chamada, contra 2 a 30 ms das outras. A visão chamava tem_alguma_aba(...) e nome_do_usuario_atual() três e duas vezes POR LINHA
-- (285 cards x 5 chamadas), o mesmo padrão que causou o timeout de 12/11 nas políticas (ver politicas_uma_conferencia_por_consulta.sql). Embrulhadas em (select ...)
-- viram uma conferência por consulta.
--
-- Ensaiado em 13/11/2026, dentro de transação desfeita, como Admin (32 abas), Gerente Comercial (15 abas) e um perfil sem CRM/Telecom/Licitações (Almoxarifado):
-- 279/264/435 ms -> 7,6/6,3/7,3 ms, com ZERO linhas diferentes nos dois sentidos (except) e os mesmos contatos e valores visíveis (112 e 215 para quem tem a aba, 0 e 0 para quem não tem).
-- As colunas, a ordem e os tipos não mudam: create or replace view basta, e os direitos (grant) permanecem.
-- Para voltar atrás: visao_crm_basico_uma_conferencia_por_consulta_reverter.sql.
create or replace view public.crm_oportunidades_basico as
select o.id, o.funil, o.titulo, o.numero_edital, o.orgao, o.data_sessao, o.hora_sessao, o.responsavel_id, o.responsavel_nome, o.cliente_id, o.cliente_final,
       o.estagio_id, o.licitacao_processo_id, o.numero_pv, o.tipo_negocio, o.setor_venda, o.prox_contato, o.hora_prox_contato, o.criado_em, o.atualizado_em,
       o.titulo_norm, o.numero_edital_norm, o.orgao_norm, o.responsavel_nome_norm,
       case when (select public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes'])) or o.responsavel_nome = (select public.nome_do_usuario_atual()) then o.nome_contato end as nome_contato,
       case when (select public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes'])) or o.responsavel_nome = (select public.nome_do_usuario_atual()) then o.contato end as contato,
       case when (select public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes'])) then o.valor_registrado end as valor_registrado,
       o.participantes
  from public.crm_oportunidades o;
