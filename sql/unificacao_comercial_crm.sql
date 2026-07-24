-- =====================================================================
-- Unificação Comercial/CRM
-- Execute no Supabase SQL Editor — ORDEM IMPORTA
-- =====================================================================

-- ── 1. Campos de licitação no crm_oportunidades (vindos de licitacoes) ──────
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS numero_edital         text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS uasg                  text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS portal                text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS horario_sessao        text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS data_limite_proposta  date;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS data_limite_analise   date;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS prioridade            text DEFAULT 'Média';
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS marcadores            jsonb DEFAULT '[]'::jsonb;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS classificacao         text DEFAULT 'Direta';
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS analista_nome         text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS faturamento_empresa   text DEFAULT 'ACN';
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS areas_livres          jsonb DEFAULT '{}'::jsonb;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS objeto_principal      text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS obs_encerramento      text;

-- ── 2. Vínculo OP → CRM ──────────────────────────────────────────────────────
ALTER TABLE oples ADD COLUMN IF NOT EXISTS crm_oportunidade_id uuid;
CREATE INDEX IF NOT EXISTS idx_oples_crm_oportunidade_id ON oples (crm_oportunidade_id);

-- ── 3. Vínculo OS → CRM ──────────────────────────────────────────────────────
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS crm_oportunidade_id uuid;
CREATE INDEX IF NOT EXISTS idx_sac_os_crm_oportunidade_id ON sac_ordens_servico (crm_oportunidade_id);

-- ── 4. Migração: licitacoes → crm_oportunidades ──────────────────────────────
-- Mapeia status da tabela licitacoes para estágio CRM.
-- Ajuste os UUIDs dos estágios conforme sua instalação se necessário.
-- A subquery busca o estágio pelo nome, então desde que existam no funil, funcionará.

INSERT INTO crm_oportunidades (
  id, funil, titulo, numero_edital, orgao, data_sessao,
  valor_registrado, status, prioridade, marcadores,
  analista_nome, faturamento_empresa, areas_livres,
  objeto_principal, obs_encerramento,
  criado_em, atualizado_em,
  estagio_id
)
SELECT
  l.id,
  'licitacao'                                              AS funil,
  COALESCE(l.nome_projeto, l.numero)                       AS titulo,
  l.numero                                                 AS numero_edital,
  l.orgao,
  l.data_disputa                                           AS data_sessao,
  NULL                                                     AS valor_registrado,
  l.status,
  l.prioridade,
  l.marcadores,
  l.analista_nome,
  'ACN'                                                    AS faturamento_empresa,
  '{}'::jsonb                                              AS areas_livres,
  l.objeto_principal,
  l.obs_encerramento,
  l.criado_em,
  l.atualizado_em,
  -- Mapeia status → estágio do funil CRM
  (SELECT e.id FROM crm_estagios_funil e
   WHERE e.nome ILIKE
     CASE l.status
       WHEN 'Aberta'        THEN '%identific%'
       WHEN 'Em Análise'    THEN '%análise%'
       WHEN 'Analisada'     THEN '%analis%'
       WHEN 'Em Andamento'  THEN '%andamento%'
       WHEN 'Vencida'       THEN '%vencid%'
       WHEN 'Perdida'       THEN '%perdid%'
       WHEN 'Descartada'    THEN '%descart%'
       ELSE '%identific%'
     END
   ORDER BY e.ordem LIMIT 1)                              AS estagio_id
FROM licitacoes l
WHERE NOT EXISTS (
  SELECT 1 FROM crm_oportunidades c WHERE c.id = l.id
);

-- ── 5. Migração: oples (fase comercial) → crm_oportunidades ─────────────────
-- Migra OPLs que ainda NÃO entraram em produção (etapa_atual IS NULL ou comercial)
-- Ajuste o filtro conforme o campo que indica o status no seu banco.
INSERT INTO crm_oportunidades (
  funil, titulo, orgao, valor_registrado,
  nome_contato, responsavel_nome,
  faturamento_empresa, criado_em, atualizado_em,
  estagio_id
)
SELECT
  'venda_direta'                                           AS funil,
  CONCAT(o.opl, ' — ', o.cliente_nome)                    AS titulo,
  o.cliente_nome                                          AS orgao,
  o.valor_total                                           AS valor_registrado,
  o.cliente_nome                                          AS nome_contato,
  o.responsavel_comercial                                 AS responsavel_nome,
  COALESCE(o.faturamento_empresa, 'ACN')                  AS faturamento_empresa,
  o.data_entrada::timestamptz                             AS criado_em,
  NOW()                                                   AS atualizado_em,
  (SELECT e.id FROM crm_estagios_funil e
   WHERE e.nome ILIKE '%identific%'
   ORDER BY e.ordem LIMIT 1)                              AS estagio_id
FROM oples o
-- Só migra OPLs que não têm card CRM ainda e que estão em fase pré-produção
WHERE o.crm_oportunidade_id IS NULL
  AND o.etapa_atual IS NULL        -- sem etapa de produção ativa
  AND o.cliente_nome IS NOT NULL
  AND o.cliente_nome <> '';

-- ── 6. Confirmar ─────────────────────────────────────────────────────────────
SELECT 'licitacoes migradas:',  COUNT(*) FROM crm_oportunidades WHERE funil = 'licitacao';
SELECT 'vendas diretas total:', COUNT(*) FROM crm_oportunidades WHERE funil = 'venda_direta';
