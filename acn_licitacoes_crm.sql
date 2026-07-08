-- ═══════════════════════════════════════════════════════════════════════
-- ACN Sinal Verde — Módulo Licitações + CRM Kanban
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ── LICITAÇÕES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licitacoes (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero                      TEXT NOT NULL,
  nome_projeto                TEXT NOT NULL,
  objeto_principal            TEXT,
  orgao                       TEXT NOT NULL,
  classificacao               TEXT NOT NULL DEFAULT 'Direta',
  -- 'Direta' | 'Parceiro'

  status                      TEXT NOT NULL DEFAULT 'Aberta',
  -- 'Aberta' | 'Em Análise' | 'Analisada' | 'Em Andamento'
  -- 'Vencida' | 'Perdida' | 'Descartada'

  marcadores                  JSONB DEFAULT '[]'::jsonb,
  -- ['Em Recurso', 'Em Defesa', 'Impugnado'] — só válidos em 'Em Andamento'

  prioridade                  TEXT NOT NULL DEFAULT 'Média',
  -- 'Alta' | 'Média' | 'Baixa'

  -- Datas / prazos
  data_registro               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_limite_esclarecimentos TIMESTAMPTZ,
  data_limite_proposta        TIMESTAMPTZ,
  data_disputa                TIMESTAMPTZ,
  data_limite_analise_tecnica TIMESTAMPTZ,

  -- Responsáveis
  analista_nome               TEXT,
  analista_email              TEXT,
  coordenador_nome            TEXT,
  coordenador_email           TEXT,

  -- Observação de encerramento (vencida/perdida/descartada)
  obs_encerramento            TEXT,

  -- Histórico de transições de status
  historico                   JSONB DEFAULT '[]'::jsonb,
  -- [{ status, usuario, data, obs }]

  -- Auditoria
  criado_por                  TEXT,
  criado_por_nome             TEXT,
  criado_em                   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE licitacoes DISABLE ROW LEVEL SECURITY;

-- ── ANEXOS DE LICITAÇÕES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licitacao_anexos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id  UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  -- 'documento' | 'foto' | 'proposta' | 'habilitacao' | 'orcamento' | 'anotacao' | 'contato'
  nome          TEXT,
  url           TEXT,       -- URL pública Supabase Storage (arquivos/fotos)
  conteudo      TEXT,       -- texto livre (anotações, contatos)
  criado_por    TEXT,
  criado_por_nome TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE licitacao_anexos DISABLE ROW LEVEL SECURITY;

-- ── CRM — atualizar crm_clientes ─────────────────────────────────────────

-- Adiciona colunas novas sem remover as existentes
ALTER TABLE crm_clientes ADD COLUMN IF NOT EXISTS status_kanban  TEXT DEFAULT 'Prospectado';
-- 'Prospectado' | 'Contatado' | 'Em Negociação' | 'Convertido'

ALTER TABLE crm_clientes ADD COLUMN IF NOT EXISTS cargo          TEXT;
ALTER TABLE crm_clientes ADD COLUMN IF NOT EXISTS ultimo_contato TIMESTAMPTZ;

-- Garante que todos os registros existentes tenham status_kanban preenchido
UPDATE crm_clientes
SET status_kanban = 'Prospectado'
WHERE status_kanban IS NULL;

-- ── CRM CONFIG (configurações do admin) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  dias_lead_esquecido   INTEGER NOT NULL DEFAULT 7,
  atualizado_em         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_config DISABLE ROW LEVEL SECURITY;

INSERT INTO crm_config (id, dias_lead_esquecido)
VALUES (1, 7)
ON CONFLICT (id) DO NOTHING;

-- ── STORAGE: pasta licitacoes ─────────────────────────────────────────────
-- Certifique-se de que o bucket 'acn-media' existe.
-- Os arquivos serão salvos em: acn-media/licitacoes/{licitacao_id}/{tipo}/arquivo

-- Confirma criação
SELECT 'licitacoes' AS tabela, COUNT(*) FROM licitacoes
UNION ALL
SELECT 'licitacao_anexos',    COUNT(*) FROM licitacao_anexos
UNION ALL
SELECT 'crm_config',          COUNT(*) FROM crm_config;
