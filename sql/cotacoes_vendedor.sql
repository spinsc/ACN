-- ============================================================
-- Cotações para Vendedores
-- 1. Novas colunas em cotacoes_precos
-- 2. Tabela cotacoes_aprovacoes (fluxo de aprovação de descontos)
-- 3. Tabela configuracoes_sistema (toggles admin)
-- ============================================================

-- ── 1. Novas colunas em cotacoes_precos ──────────────────────
ALTER TABLE cotacoes_precos
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho',
  -- 'rascunho' | 'ativa' | 'aprovada' | 'proposta_gerada' | 'vinculada' | 'cancelada'

  ADD COLUMN IF NOT EXISTS numero_cotacao text,
  -- Gerado automaticamente: COT-2025-0001

  ADD COLUMN IF NOT EXISTS crm_oportunidade_id uuid REFERENCES crm_oportunidades(id) ON DELETE SET NULL;
  -- Vínculo com card do CRM

-- Índice para busca por oportunidade
CREATE INDEX IF NOT EXISTS cotacoes_precos_crm_op_idx ON cotacoes_precos (crm_oportunidade_id);
CREATE INDEX IF NOT EXISTS cotacoes_precos_status_idx ON cotacoes_precos (status);

-- ── 2. Sequência para número da cotação ──────────────────────
CREATE SEQUENCE IF NOT EXISTS cotacao_seq START 1;

-- Função para gerar número de cotação: COT-AAAA-NNNN
CREATE OR REPLACE FUNCTION gerar_numero_cotacao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_cotacao IS NULL THEN
    NEW.numero_cotacao := 'COT-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('cotacao_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_cotacao ON cotacoes_precos;
CREATE TRIGGER trg_numero_cotacao
  BEFORE INSERT ON cotacoes_precos
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_cotacao();

-- ── 3. Tabela de aprovações de desconto ──────────────────────
CREATE TABLE IF NOT EXISTS cotacoes_aprovacoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id      uuid        NOT NULL REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  cotacao_nome    text,
  numero_cotacao  text,

  -- Solicitante
  solicitado_por  text        NOT NULL,
  solicitado_em   timestamptz NOT NULL DEFAULT now(),

  -- Desconto pedido e motivo
  desconto_pct    numeric     NOT NULL DEFAULT 0,
  motivo          text,

  -- Aprovação / Rejeição
  status          text        NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'aprovado' | 'rejeitado'

  aprovado_por    text,
  aprovado_em     timestamptz,
  resposta        text,

  -- Para notificação / referência
  crm_oportunidade_id uuid    REFERENCES crm_oportunidades(id) ON DELETE SET NULL
);

ALTER TABLE cotacoes_aprovacoes DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cotacoes_aprov_cotacao_idx ON cotacoes_aprovacoes (cotacao_id);
CREATE INDEX IF NOT EXISTS cotacoes_aprov_status_idx  ON cotacoes_aprovacoes (status);

-- ── 4. Tabela de configurações do sistema ─────────────────────
-- Chave-valor simples para toggles e configs globais do Admin
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  chave       text PRIMARY KEY,
  valor       text NOT NULL DEFAULT '',
  descricao   text,
  atualizado_por text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE configuracoes_sistema DISABLE ROW LEVEL SECURITY;

-- Inserir configurações padrão de visibilidade das cotações
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('cotacoes_ver_custos_margens',    'false', 'Vendedores podem ver custos e margens na cotação'),
  ('cotacoes_ver_fornecedores',      'false', 'Vendedores podem ver fornecedores e marcas na cotação'),
  ('cotacoes_ver_markup',            'false', 'Vendedores podem ver o markup aplicado na cotação'),
  ('cotacoes_desconto_maximo_global','0',     'Desconto máximo global para vendedores (% — sobrescrito pelo da cotação se maior)')
ON CONFLICT (chave) DO NOTHING;
