-- =============================================================================
-- CORREÇÕES DE COLUNAS FALTANTES — rodar no Supabase SQL Editor
-- Resolve todos os erros 400 (column does not exist) do console
-- =============================================================================

-- ── sac_ordens_servico ────────────────────────────────────────────────────────
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS tecnico_responsavel text;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS data_inicio_manutencao timestamptz;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS data_conclusao_manutencao timestamptz;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS tipo_avaliacao text;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS veiculo_modelo text;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS tecnico_producao_id uuid REFERENCES rh_funcionarios(id);
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS valor_total numeric;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS valor_mao_de_obra numeric;
ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS data_faturamento date;

-- ── oples ─────────────────────────────────────────────────────────────────────
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_id uuid REFERENCES rh_funcionarios(id);
ALTER TABLE oples ADD COLUMN IF NOT EXISTS valor_total numeric;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS valor_mao_de_obra numeric;

-- ── crm_historico ─────────────────────────────────────────────────────────────
ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS texto text;
ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();
ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS usuario_nome text;

-- ── rh_funcionarios ──────────────────────────────────────────────────────────
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS tipo_colaborador text DEFAULT 'Funcionário';
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS salario numeric;
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS valor_servicos numeric;
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS recebe_comissao boolean DEFAULT false;
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS percentual_comissao numeric;
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS incide_em text;
ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS cnpj text;

-- ── pcp_pedidos_compra ────────────────────────────────────────────────────────
ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS oportunidade_id uuid;
ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS data_criacao timestamptz DEFAULT now();
ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS criado_por text;
ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS criado_por_nome text;

-- ── logistica_manifestos ──────────────────────────────────────────────────────
ALTER TABLE logistica_manifestos ADD COLUMN IF NOT EXISTS pedido_compra_id uuid REFERENCES pcp_pedidos_compra(id);

-- ── crm_vendas ────────────────────────────────────────────────────────────────
ALTER TABLE crm_vendas ADD COLUMN IF NOT EXISTS numero_op text;
ALTER TABLE crm_vendas ADD COLUMN IF NOT EXISTS observacoes text;

-- ── auth_usuarios ─────────────────────────────────────────────────────────────
ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS recebe_alerta_analise boolean DEFAULT false;

-- ── Novas tabelas (se ainda não existirem) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS analise_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  origem_id uuid NOT NULL,
  origem_titulo text,
  origem_numero text,
  setores jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'em_andamento',
  criado_por text,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE analise_solicitacoes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS analise_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid REFERENCES analise_solicitacoes(id) ON DELETE CASCADE,
  setor text NOT NULL,
  status text DEFAULT 'pendente',
  analisado_por text,
  analisado_em timestamptz,
  notas text,
  UNIQUE(solicitacao_id, setor)
);
ALTER TABLE analise_setores DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS analise_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid REFERENCES analise_solicitacoes(id) ON DELETE CASCADE,
  setor text,
  nome text NOT NULL,
  url text NOT NULL,
  criado_por text,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE analise_anexos DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rh_comissoes_fechamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  ano integer NOT NULL,
  tecnico_id uuid REFERENCES rh_funcionarios(id),
  tecnico_nome text,
  incide_em text,
  percentual numeric,
  total_base numeric,
  total_comissao numeric,
  qtd_ops integer DEFAULT 0,
  qtd_oss integer DEFAULT 0,
  detalhes jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pendente',
  aprovado_por text,
  aprovado_em timestamptz,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(mes, ano, tecnico_id)
);
ALTER TABLE rh_comissoes_fechamento DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS vouchers_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico text, numero_pvop text, data_servico date,
  prestador text, autorizado_por text, criado_por text,
  itens_voucher jsonb, valor_total numeric,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE vouchers_servico DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tipos_servico_voucher (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lixeira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  registro_id text NOT NULL,
  dados jsonb NOT NULL,
  deletado_por text,
  deletado_em timestamptz DEFAULT now(),
  restaurado boolean DEFAULT false,
  restaurado_em timestamptz,
  restaurado_por text
);
ALTER TABLE lixeira DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_perfis_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  abas_permitidas jsonb DEFAULT '[]'::jsonb,
  pode_autorizar_rh boolean DEFAULT false,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE admin_perfis_sistema DISABLE ROW LEVEL SECURITY;

-- ── Índices úteis ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_analise_solicitacoes_origem ON analise_solicitacoes(origem_id);
CREATE INDEX IF NOT EXISTS idx_analise_setores_sol ON analise_setores(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_pcp_pedidos_compra_op ON pcp_pedidos_compra(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_crm_historico_op ON crm_historico(oportunidade_id);

-- =============================================================================
-- FIM — após rodar, atualize a página e os erros 400 desaparecerão
-- =============================================================================
