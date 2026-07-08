-- ═══════════════════════════════════════════════════════════════════════
-- ACN Sinal Verde — Demandas Avulsas (Engenharia)
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS demandas_avulsas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setor           TEXT NOT NULL DEFAULT 'Engenharia',
  titulo          TEXT NOT NULL,
  descricao       TEXT,

  -- Responsável e prazo (definidos ao designar)
  responsavel_nome  TEXT,
  responsavel_email TEXT,
  prazo             TIMESTAMPTZ,

  -- Status
  status          TEXT NOT NULL DEFAULT 'Pendente',
  -- 'Pendente' | 'Em Andamento' | 'Concluída'

  prioridade      TEXT NOT NULL DEFAULT 'Média',
  -- 'Alta' | 'Média' | 'Baixa'

  -- KPI: início e fim da execução
  data_inicio     TIMESTAMPTZ,
  data_fim        TIMESTAMPTZ,

  -- Observação geral
  observacoes     TEXT,

  -- Atualizações/novas informações (histórico em JSONB)
  -- [{ texto, usuario, data }]
  informacoes     JSONB DEFAULT '[]'::jsonb,

  -- Auditoria
  criado_por      TEXT,
  criado_por_nome TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE demandas_avulsas DISABLE ROW LEVEL SECURITY;

-- Anexos (fotos e documentos)
CREATE TABLE IF NOT EXISTS demanda_avulsa_anexos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  demanda_id  UUID NOT NULL REFERENCES demandas_avulsas(id) ON DELETE CASCADE,
  nome        TEXT,
  url         TEXT NOT NULL,
  tipo        TEXT DEFAULT 'documento', -- 'documento' | 'foto'
  criado_por  TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE demanda_avulsa_anexos DISABLE ROW LEVEL SECURITY;

-- Confirma
SELECT 'demandas_avulsas'      AS tabela, COUNT(*) FROM demandas_avulsas
UNION ALL
SELECT 'demanda_avulsa_anexos', COUNT(*) FROM demanda_avulsa_anexos;
