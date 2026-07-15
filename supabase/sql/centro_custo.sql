-- =============================================================================
-- CENTRO DE CUSTO — Compras
-- =============================================================================

-- Tabela de centros de custo personalizados
CREATE TABLE IF NOT EXISTS centros_custo (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo    text NOT NULL UNIQUE,
  nome      text NOT NULL,
  descricao text,
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE centros_custo DISABLE ROW LEVEL SECURITY;

-- Coluna no pedido de compra
ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS centro_custo text;
-- =============================================================================
