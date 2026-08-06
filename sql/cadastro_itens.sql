-- ============================================================
-- Tabela: cadastro_itens
-- Catálogo de itens base para Formação de Preços, Compras e Orçamentos
-- ============================================================

CREATE TABLE IF NOT EXISTS cadastro_itens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  codigo          text,
  nome            text        NOT NULL,
  descricao       text,
  unidade         text        NOT NULL DEFAULT 'UN',
  categoria       text,
  ncm             text,

  -- Fornecedor / Fabricante
  marca           text        DEFAULT '',
  fornecedor      text        DEFAULT '',

  -- Preço e moeda
  moeda           text        NOT NULL DEFAULT 'REAL',
  custo_unit      numeric     NOT NULL DEFAULT 0,

  -- Impostos (%)
  ipi_pct         numeric     NOT NULL DEFAULT 0,
  st_pct          numeric     NOT NULL DEFAULT 0,
  difal_pct       numeric     NOT NULL DEFAULT 16,
  imposto_pct     numeric     NOT NULL DEFAULT 16,

  -- Markup e custos fixos (%)
  markup_pct      numeric     NOT NULL DEFAULT 30,
  custo_fixo_pct  numeric     NOT NULL DEFAULT 3,

  -- Controle
  ativo           boolean     NOT NULL DEFAULT true,
  criado_por      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Desativar RLS (padrão do projeto)
ALTER TABLE cadastro_itens DISABLE ROW LEVEL SECURITY;

-- Índices para performance de busca
CREATE INDEX IF NOT EXISTS cadastro_itens_nome_idx      ON cadastro_itens (nome);
CREATE INDEX IF NOT EXISTS cadastro_itens_codigo_idx    ON cadastro_itens (codigo);
CREATE INDEX IF NOT EXISTS cadastro_itens_categoria_idx ON cadastro_itens (categoria);
CREATE INDEX IF NOT EXISTS cadastro_itens_ativo_idx     ON cadastro_itens (ativo);

-- Trigger para atualizar automaticamente atualizado_em
CREATE OR REPLACE FUNCTION set_cadastro_itens_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadastro_itens_updated ON cadastro_itens;
CREATE TRIGGER trg_cadastro_itens_updated
  BEFORE UPDATE ON cadastro_itens
  FOR EACH ROW EXECUTE FUNCTION set_cadastro_itens_updated();
