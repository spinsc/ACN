-- ═══════════════════════════════════════════════════════════════════════
-- ACN Sinal Verde — Módulo RH
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ── FUNCIONÁRIOS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_funcionarios (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome             TEXT NOT NULL,
  email            TEXT,                  -- vínculo com auth_usuarios.email
  usuario_id       UUID,                  -- FK opcional para auth_usuarios.id
  cpf              TEXT,
  cargo            TEXT,
  departamento     TEXT,
  data_admissao    DATE,
  status_presenca  TEXT NOT NULL DEFAULT 'Ativo',
  -- 'Ativo' | 'Em Viagem' | 'Folga' | 'Férias' | 'Afastado'
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rh_funcionarios DISABLE ROW LEVEL SECURITY;

-- ── LANÇAMENTOS DE HORAS ─────────────────────────────────────────────────────
-- Cada lançamento representa um evento: hora extra, atraso, falta, etc.
CREATE TABLE IF NOT EXISTS rh_lancamentos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id  UUID NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  data            DATE NOT NULL,
  mes             INTEGER NOT NULL,   -- extraído de data para facilitar filtros
  ano             INTEGER NOT NULL,
  tipo            TEXT NOT NULL,
  -- CRÉDITO (saldo positivo): 'Hora Extra', 'Entrada Antecipada'
  -- DÉBITO  (saldo negativo): 'Atraso', 'Saída Antecipada', 'Falta', 'Declaração'
  -- NEUTRO  (sem efeito no banco): 'Atestado', 'Férias', 'Folga', 'Viagem'
  minutos         INTEGER NOT NULL DEFAULT 0,  -- sempre positivo; sinal definido pelo tipo
  obs             TEXT,
  criado_por      TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rh_lancamentos DISABLE ROW LEVEL SECURITY;

-- ── AUTORIZAÇÕES DE SAÍDA/ENTRADA ANTECIPADA ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_autorizacoes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id  UUID NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'Saída Antecipada',
  -- 'Saída Antecipada' | 'Entrada Antecipada'
  data            DATE NOT NULL,
  hora_saida      TEXT,    -- HH:MM
  hora_retorno    TEXT,    -- HH:MM
  motivo          TEXT,
  aprovado_por    TEXT,    -- nome do gerente
  criado_por      TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rh_autorizacoes DISABLE ROW LEVEL SECURITY;

-- ── FECHAMENTOS DE BANCO DE HORAS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_fechamentos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id  UUID NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  ano             INTEGER NOT NULL,
  mes             INTEGER NOT NULL,
  saldo_minutos   INTEGER NOT NULL DEFAULT 0,  -- saldo no momento do fechamento
  fechado_por     TEXT,
  fechado_em      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (funcionario_id, ano, mes)
);

ALTER TABLE rh_fechamentos DISABLE ROW LEVEL SECURITY;

-- ── CONFIRMA ─────────────────────────────────────────────────────────────────
SELECT 'rh_funcionarios'   AS tabela, COUNT(*) FROM rh_funcionarios
UNION ALL
SELECT 'rh_lancamentos',    COUNT(*) FROM rh_lancamentos
UNION ALL
SELECT 'rh_autorizacoes',   COUNT(*) FROM rh_autorizacoes
UNION ALL
SELECT 'rh_fechamentos',    COUNT(*) FROM rh_fechamentos;
