-- =============================================================================
-- NOVOS CAMPOS OP (oples) + TABELA MENCOES
-- =============================================================================

-- ── Novos campos na tabela oples ─────────────────────────────────────────────
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_aceite_cliente       date;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS faturamento_empresa       text DEFAULT 'ACN';
ALTER TABLE oples ADD COLUMN IF NOT EXISTS vendedor                  text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS cliente_final             text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS edital                    text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS proposta                  text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS veiculo                   text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS local_instalacao          text;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_chegada_veiculo      date;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS prazo_entrega_producao    date;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS prazo_entrega_comercial   date;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS composicao_comercial      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS observacoes_atencao       text;

-- ── Tabela de menções entre usuários ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mencoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mencionado_id       uuid,
  mencionado_nome     text,
  mencionante_id      uuid,
  mencionante_nome    text,
  contexto            text NOT NULL,         -- 'op', 'os', 'sac', 'crm', 'demanda'
  contexto_id         text,                  -- ID do registro origem
  contexto_descricao  text,                  -- ex: "OP 1234.5678"
  campo               text,                  -- nome do campo onde foi mencionado
  texto_trecho        text,                  -- trecho do texto contendo a menção
  aba_destino         text,                  -- aba do sistema para navegar
  lida                boolean DEFAULT false,
  criado_em           timestamptz DEFAULT now()
);
ALTER TABLE mencoes DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mencoes_mencionado ON mencoes(mencionado_id, lida);
CREATE INDEX IF NOT EXISTS idx_mencoes_contexto   ON mencoes(contexto_id);

-- =============================================================================
