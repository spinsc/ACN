-- ============================================================
-- Tabelas: cadastro_produtos + cadastro_produtos_itens (BOM)
-- Produtos compostos de itens do catálogo central
-- ============================================================

-- Tabela principal de produtos
CREATE TABLE IF NOT EXISTS cadastro_produtos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text,
  nome            text        NOT NULL,
  descricao       text,
  categoria       text,
  unidade         text        NOT NULL DEFAULT 'UN',
  ncm             text,

  -- Markup aplicado sobre o custo total dos componentes
  markup_pct      numeric     NOT NULL DEFAULT 30,
  -- Custo fixo sobre o preço de venda
  custo_fixo_pct  numeric     NOT NULL DEFAULT 3,
  -- Impostos sobre venda (%)
  imposto_pct     numeric     NOT NULL DEFAULT 16,
  -- DIFAL (%)
  difal_pct       numeric     NOT NULL DEFAULT 16,

  -- Preço de venda sugerido (calculado ou manual)
  preco_venda     numeric,
  preco_manual    boolean     NOT NULL DEFAULT false,

  -- Observações e imagem de referência
  observacoes     text,
  imagem_url      text,

  ativo           boolean     NOT NULL DEFAULT true,
  criado_por      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cadastro_produtos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cadastro_produtos_nome_idx      ON cadastro_produtos (nome);
CREATE INDEX IF NOT EXISTS cadastro_produtos_codigo_idx    ON cadastro_produtos (codigo);
CREATE INDEX IF NOT EXISTS cadastro_produtos_categoria_idx ON cadastro_produtos (categoria);

-- Estrutura de produto (BOM - Bill of Materials)
-- Cada linha = 1 item do catálogo + quantidade usada neste produto
CREATE TABLE IF NOT EXISTS cadastro_produtos_itens (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id  uuid    NOT NULL REFERENCES cadastro_produtos(id) ON DELETE CASCADE,
  item_id     uuid    REFERENCES cadastro_itens(id) ON DELETE SET NULL,

  -- Cópia do nome para preservar histórico mesmo se item for excluído
  item_nome   text    NOT NULL,
  item_codigo text,

  quantidade  numeric NOT NULL DEFAULT 1,
  unidade     text    DEFAULT 'UN',
  observacoes text,
  ordem       integer DEFAULT 0
);

ALTER TABLE cadastro_produtos_itens DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cpi_produto_idx ON cadastro_produtos_itens (produto_id);
CREATE INDEX IF NOT EXISTS cpi_item_idx    ON cadastro_produtos_itens (item_id);

-- Trigger para atualizar automaticamente atualizado_em
CREATE OR REPLACE FUNCTION set_cadastro_produtos_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadastro_produtos_updated ON cadastro_produtos;
CREATE TRIGGER trg_cadastro_produtos_updated
  BEFORE UPDATE ON cadastro_produtos
  FOR EACH ROW EXECUTE FUNCTION set_cadastro_produtos_updated();
