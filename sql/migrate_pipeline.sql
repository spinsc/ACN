-- =============================================================
-- MIGRAÇÃO: Pipeline CRM (crm_oportunidades funil='licitacao')
--           → tabela licitacoes
--
-- INSTRUÇÕES:
--   1. Rode o PASSO 1 e verifique o resultado
--   2. Confirme os dados na tabela licitacoes
--   3. Rode o PASSO 2 para excluir do CRM
-- =============================================================

-- PASSO 1: Migrar registros
-- Mapeia estágios do kanban → status da tabela licitacoes
-- Lead/Contato | Identificada → 'Aberta'
-- Qualificação | Analisando   → 'Em Análise'
-- Edital Analisado             → 'Analisada'
-- Proposta* | Participando     → 'Em Andamento'
-- Vencida | Ganho | Convertida → 'Vencida'
-- Perdida | Descartada         → 'Perdida'
-- Desistência | Finalizada     → 'Descartada'

INSERT INTO licitacoes (
  numero,
  nome_projeto,
  orgao,
  objeto_principal,
  classificacao,
  status,
  prioridade,
  valor_estimado,
  data_disputa,
  horario_sessao,
  analista_nome,
  analista_email,
  faturamento_empresa,
  historico,
  marcadores,
  criado_por,
  criado_por_nome,
  criado_em,
  atualizado_em
)
SELECT
  -- numero: usa o edital se tiver, senão gera um código a partir do id
  COALESCE(NULLIF(TRIM(o.numero_edital), ''), 'CRM-' || UPPER(SUBSTRING(o.id::text, 1, 6))) AS numero,

  -- nome_projeto
  COALESCE(NULLIF(TRIM(o.titulo), ''), '(sem título)') AS nome_projeto,

  -- orgao
  COALESCE(o.orgao, '') AS orgao,

  -- objeto_principal (CRM não tem campo descricao; usar título como referência)
  '' AS objeto_principal,

  -- classificacao: tenta inferir do tipo_licitacao, senão 'Direta'
  CASE
    WHEN o.tipo_licitacao = 'ata' THEN 'Adesão a ATA'
    ELSE 'Direta'
  END AS classificacao,

  -- status: mapeado pelo nome do estágio no funil
  CASE
    WHEN ef.nome ILIKE '%perda%'   OR ef.nome ILIKE '%perdida%'  OR ef.is_final = true
         AND ef.nome NOT ILIKE '%venci%' AND ef.nome NOT ILIKE '%ganho%'
         AND ef.nome NOT ILIKE '%desist%' AND ef.nome NOT ILIKE '%finaliz%'
         AND ef.nome NOT ILIKE '%conver%'
      THEN 'Perdida'
    WHEN ef.nome ILIKE '%vencida%' OR ef.nome ILIKE '%ganho%' OR ef.nome ILIKE '%conver%'
      THEN 'Vencida'
    WHEN ef.nome ILIKE '%desist%' OR ef.nome ILIKE '%finaliz%'
      THEN 'Descartada'
    WHEN ef.nome ILIKE '%qualif%' OR ef.nome ILIKE '%analis%'
      THEN 'Em Análise'
    WHEN ef.nome ILIKE '%edital%'
      THEN 'Analisada'
    WHEN ef.nome ILIKE '%proposta%' OR ef.nome ILIKE '%participando%' OR ef.nome ILIKE '%andamento%'
      THEN 'Em Andamento'
    ELSE 'Aberta'
  END AS status,

  'Média' AS prioridade,

  -- valor_estimado
  CASE
    WHEN o.valor_registrado IS NOT NULL AND o.valor_registrado::text ~ '^\d'
    THEN o.valor_registrado::numeric
    ELSE NULL
  END AS valor_estimado,

  -- data_disputa (data da sessão no CRM — já é type date)
  o.data_sessao AS data_disputa,

  -- horario_sessao
  o.hora_sessao AS horario_sessao,

  -- analista_nome (responsável no CRM)
  COALESCE(o.responsavel_nome, '') AS analista_nome,

  -- analista_email: não armazenado no CRM, fica em branco
  '' AS analista_email,

  -- faturamento_empresa
  COALESCE(NULLIF(o.faturamento_empresa, ''), 'ACN') AS faturamento_empresa,

  -- historico: log de origem
  jsonb_build_array(
    jsonb_build_object(
      'status', CASE
        WHEN ef.nome ILIKE '%venci%' OR ef.nome ILIKE '%ganho%' THEN 'Vencida'
        WHEN ef.nome ILIKE '%perda%' OR ef.nome ILIKE '%perdida%' THEN 'Perdida'
        WHEN ef.nome ILIKE '%desist%' THEN 'Descartada'
        ELSE 'Aberta'
      END,
      'usuario', COALESCE(o.responsavel_nome, 'Sistema'),
      'data', COALESCE(o.atualizado_em, o.criado_em, NOW())::text,
      'obs', 'Migrado do Pipeline CRM — estágio: ' || COALESCE(ef.nome, 'Desconhecido')
           || CASE WHEN o.motivo_perda IS NOT NULL AND o.motivo_perda <> ''
                   THEN ' | Motivo: ' || o.motivo_perda ELSE '' END
    )
  ) AS historico,

  '[]'::jsonb AS marcadores,

  COALESCE(o.responsavel_nome, '') AS criado_por,
  COALESCE(o.responsavel_nome, '') AS criado_por_nome,
  COALESCE(o.criado_em, NOW()) AS criado_em,
  NOW() AS atualizado_em

FROM crm_oportunidades o
LEFT JOIN crm_estagios_funil ef ON ef.id = o.estagio_id
WHERE o.funil = 'licitacao'
  -- Evita duplicatas se rodar mais de uma vez
  AND NOT EXISTS (
    SELECT 1 FROM licitacoes l
    WHERE l.numero = COALESCE(NULLIF(TRIM(o.numero_edital), ''), 'CRM-' || UPPER(SUBSTRING(o.id::text, 1, 6)))
  );

-- Verificar resultado antes de prosseguir:
-- SELECT numero, nome_projeto, orgao, status, data_disputa, analista_nome
-- FROM licitacoes
-- WHERE criado_por_nome NOT LIKE '%migr%'  -- ajuste conforme necessário
-- ORDER BY criado_em DESC LIMIT 50;


-- =============================================================
-- PASSO 2: Excluir registros migrados do CRM
-- EXECUTADO em 2026-08-13 — 34 registros migrados e removidos,
-- 0 registros funil='licitacao' restantes em crm_oportunidades.
-- =============================================================

DELETE FROM crm_oportunidades WHERE funil = 'licitacao';
