-- ============================================================
-- ACN - Novas Colunas e Tabelas
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Campo MO Serralheria na tabela de OPLs
ALTER TABLE oples
  ADD COLUMN IF NOT EXISTS valor_mao_de_obra_serralheria numeric(12,2);

-- 2. Campo Horas Cobradas Cotação na tabela de OS (SAC)
ALTER TABLE sac_ordens_servico
  ADD COLUMN IF NOT EXISTS horas_cobradas_cotacao numeric(8,2);

-- 3. Tabela de documentos por categoria para Licitações
CREATE TABLE IF NOT EXISTS licitacao_documentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id     uuid NOT NULL,
  categoria        text NOT NULL, -- andamento, processo, impugnacoes, recursos, contratos, empenhos, doc_terceiros, prospeccoes
  nome             text,
  url              text,
  conteudo         text,
  anexo_url        text,    -- opcional: arquivo vinculado ao andamento
  anexo_nome       text,    -- nome do arquivo vinculado
  criado_por       text,
  criado_por_nome  text,
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE licitacao_documentos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_licit_docs_licit_id  ON licitacao_documentos(licitacao_id, categoria);
CREATE INDEX IF NOT EXISTS idx_licit_docs_criado_em ON licitacao_documentos(criado_em DESC);
