-- Desfaz visao_crm_basico_uma_conferencia_por_consulta.sql: volta a visão ao formato de 04/11/2026 (conferência por linha).
-- Só use se a visão nova der resultado diferente do esperado; ela é ~40 vezes mais barata.
create or replace view public.crm_oportunidades_basico as
select o.id, o.funil, o.titulo, o.numero_edital, o.orgao, o.data_sessao, o.hora_sessao, o.responsavel_id, o.responsavel_nome, o.cliente_id, o.cliente_final,
       o.estagio_id, o.licitacao_processo_id, o.numero_pv, o.tipo_negocio, o.setor_venda, o.prox_contato, o.hora_prox_contato, o.criado_em, o.atualizado_em,
       o.titulo_norm, o.numero_edital_norm, o.orgao_norm, o.responsavel_nome_norm,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) or o.responsavel_nome = public.nome_do_usuario_atual() then o.nome_contato end as nome_contato,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) or o.responsavel_nome = public.nome_do_usuario_atual() then o.contato end as contato,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) then o.valor_registrado end as valor_registrado,
       o.participantes
  from public.crm_oportunidades o;
