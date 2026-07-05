-- ============================================================
-- ACN SINAL VERDE — SQL Completo: usuarios + tecnicos
-- Execute no SQL Editor do Supabase
-- ============================================================

-- TABELA: usuarios (sistema de login interno)
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  perfil TEXT DEFAULT 'Operador',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- TABELA: tecnicos (cadastro de mão de obra para produção)
CREATE TABLE IF NOT EXISTS tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  matricula TEXT,
  setor TEXT DEFAULT 'Producao',
  especialidade TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tecnicos DISABLE ROW LEVEL SECURITY;

-- Coluna para armazenar técnicos selecionados na OP (array de nomes)
ALTER TABLE oples
  ADD COLUMN IF NOT EXISTS tecnicos_producao JSONB DEFAULT '[]';

-- ============================================================
-- CORREÇÃO: cq_checklist_itens — garantir coluna descricao
-- ============================================================
CREATE TABLE IF NOT EXISTS cq_checklist_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cq_checklist_itens DISABLE ROW LEVEL SECURITY;

-- Caso a tabela já exista sem a coluna descricao, adicionar:
ALTER TABLE cq_checklist_itens ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE cq_checklist_itens ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;
ALTER TABLE cq_checklist_itens ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 1;

-- Limpar itens sem descricao (que foram criados com bug)
DELETE FROM cq_checklist_itens WHERE descricao IS NULL OR descricao = '';

-- ============================================================
-- TABELA: kpi_metas (metas editáveis por setor)
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campo TEXT NOT NULL UNIQUE,
  meta NUMERIC NOT NULL,
  tol  NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE kpi_metas DISABLE ROW LEVEL SECURITY;

-- Coluna de permissoes de abas por usuario
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS abas_permitidas JSONB DEFAULT '[]';

-- ============ MKT ============
ALTER TABLE oples ADD COLUMN IF NOT EXISTS liberado_divulgacao BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS mkt_intervencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opl_id UUID,
  numero_opl TEXT,
  observacoes TEXT NOT NULL,
  tipo_acao TEXT DEFAULT 'Registro',
  criado_por TEXT,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mkt_intervencoes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mkt_pedidos_registro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opl_id UUID,
  numero_opl TEXT,
  local_registro TEXT,
  hora_turno TEXT,
  tipo TEXT DEFAULT 'Foto',
  categoria TEXT,
  status TEXT DEFAULT 'Pendente',
  observacoes TEXT,
  criado_por TEXT,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mkt_pedidos_registro DISABLE ROW LEVEL SECURITY;

-- Retrabalho CQ
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_inicio_retrabalho TIMESTAMPTZ;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_retrabalho_horas NUMERIC;
