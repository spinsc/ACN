-- Módulo SAC — Ordens de Serviço
-- Execute no Supabase > SQL Editor

-- Catálogo de tipos de equipamento
CREATE TABLE IF NOT EXISTS sac_equipamentos (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT    NOT NULL UNIQUE,
  descricao   TEXT,
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sac_equipamentos DISABLE ROW LEVEL SECURITY;

-- Tipos padrão
INSERT INTO sac_equipamentos (nome) VALUES
  ('Transformador de Potência'),
  ('Gerador'),
  ('Painel Elétrico'),
  ('Motor Elétrico'),
  ('UPS / Nobreak'),
  ('Inversor de Frequência'),
  ('Cabine Primária'),
  ('Subestação Móvel'),
  ('Quadro de Distribuição'),
  ('Banco de Baterias')
ON CONFLICT (nome) DO NOTHING;

-- Ordens de Serviço
CREATE TABLE IF NOT EXISTS sac_ordens_servico (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os                   TEXT    UNIQUE NOT NULL,

  -- Classificação
  tipo_servico                TEXT    NOT NULL, -- Orcamento | Conserto | Troca | Garantia
  tipo_projeto                TEXT,
  equipamento_nome            TEXT,
  marca                       TEXT,
  modelo                      TEXT,
  numero_serie                TEXT,
  quantidade                  INTEGER DEFAULT 1,

  -- Problema
  defeito_reclamado           TEXT,
  observacoes                 TEXT,

  -- Cliente
  cliente_nome                TEXT    NOT NULL,
  empresa_orgao               TEXT,
  endereco                    TEXT,
  cpf_cnpj                    TEXT,
  telefone                    TEXT,
  email                       TEXT,

  -- Status e datas
  status                      TEXT    DEFAULT 'Aberta',
  data_abertura               TIMESTAMPTZ DEFAULT NOW(),
  prazo_orcamento             DATE,
  data_prevista_entrega       DATE,

  -- Orçamento
  valor_orcamento             DECIMAL(12,2),
  condicoes_pagamento         TEXT,
  data_envio_orcamento        TIMESTAMPTZ,

  -- Aprovação do cliente
  aprovado                    BOOLEAN,
  aprovador_nome              TEXT,
  data_aprovacao              TIMESTAMPTZ,
  assinatura_aprovacao_url    TEXT,
  data_prevista_pos_aprovacao DATE,

  -- Reprovação
  motivo_reprovacao           TEXT,
  data_retirada_reprovacao    DATE,
  nome_retirada_reprovacao    TEXT,

  -- Setor de execução (após aprovação)
  setor_execucao              TEXT,
  demanda_id                  UUID,

  -- Saída / entrega
  nome_retirada_saida         TEXT,
  assinatura_saida_url        TEXT,
  data_saida                  TIMESTAMPTZ,

  -- Acessórios [{descricao, presente}]
  acessorios                  JSONB   DEFAULT '[]',

  -- Fotos [URL]
  fotos_entrada               JSONB   DEFAULT '[]',
  fotos_saida                 JSONB   DEFAULT '[]',

  -- Auditoria
  criado_por_nome             TEXT,
  criado_por_email            TEXT,
  atualizado_em               TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sac_ordens_servico DISABLE ROW LEVEL SECURITY;

-- Eventos de notificação SAC
INSERT INTO notificacoes_config (evento, label, descricao, ativo, destinatarios_perfis) VALUES
  ('sac_os_aberta',        'SAC — Nova OS aberta',           'Nova ordem de serviço registrada no SAC',              true, '["Admin","Gerente"]'),
  ('sac_orcamento_enviado','SAC — Orçamento enviado',         'Orçamento enviado ao cliente para aprovação',          true, '["Admin","Gerente","Comercial"]'),
  ('sac_os_aprovada',      'SAC — OS aprovada pelo cliente',  'Cliente aprovou o orçamento — aguarda execução',       true, '["Admin","Gerente","Comercial"]'),
  ('sac_os_reprovada',     'SAC — OS reprovada pelo cliente', 'Cliente recusou o orçamento',                          true, '["Admin","Gerente","Comercial"]'),
  ('sac_os_entregue',      'SAC — Equipamento entregue',      'Equipamento retirado/entregue ao cliente',             true, '["Admin","Gerente"]')
ON CONFLICT (evento) DO UPDATE SET
  label = EXCLUDED.label,
  descricao = EXCLUDED.descricao;
