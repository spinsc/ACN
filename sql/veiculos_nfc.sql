-- ============================================================
-- MÓDULO: Dossiê NFC Veicular — ACN Sinal Verde
-- ============================================================

-- 1. Tabela principal de veículos
CREATE TABLE IF NOT EXISTS veiculos_nfc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chassi            VARCHAR(50) UNIQUE NOT NULL,
  placa             VARCHAR(20),
  modelo            VARCHAR(200),
  orgao_cliente     VARCHAR(200),
  opl_numero        VARCHAR(50),        -- referência texto livre (preferencial)
  opl_id            UUID,               -- FK opcional para tabela de ops (preencher manualmente se necessário)
  data_entrega      DATE,
  data_fim_garantia DATE,
  manual_pdf_url    TEXT,
  pin_acesso        VARCHAR(10) DEFAULT '123456',
  ativo             BOOLEAN DEFAULT TRUE,
  criado_em         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Serviços/componentes instalados por veículo
CREATE TABLE IF NOT EXISTS servicos_executados_nfc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id        UUID NOT NULL REFERENCES veiculos_nfc(id) ON DELETE CASCADE,
  item_servico      VARCHAR(200) NOT NULL,
  descricao_tecnica TEXT,
  categoria         VARCHAR(100),       -- ex: Sinalização, Estrutura, Elétrico, Comunicação
  ordem             INT DEFAULT 0,
  criado_em         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Chamados de suporte abertos via leitura NFC
CREATE TABLE IF NOT EXISTS chamados_suporte (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id        UUID REFERENCES veiculos_nfc(id) ON DELETE SET NULL,
  chassi            VARCHAR(50),
  placa             VARCHAR(20),
  modelo            VARCHAR(200),
  orgao_cliente     VARCHAR(200),
  nome_solicitante  VARCHAR(150),
  contato_telefone  VARCHAR(30),
  descricao_defeito TEXT,
  status            VARCHAR(30) DEFAULT 'Aberto'
                    CHECK (status IN ('Aberto', 'Em Atendimento', 'Concluído', 'Cancelado')),
  atendido_por      VARCHAR(150),
  notas_atendimento TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Desabilitar RLS (padrão do projeto)
ALTER TABLE veiculos_nfc           DISABLE ROW LEVEL SECURITY;
ALTER TABLE servicos_executados_nfc DISABLE ROW LEVEL SECURITY;
ALTER TABLE chamados_suporte        DISABLE ROW LEVEL SECURITY;

-- 5. Configurações NFC no painel admin (tabela configuracoes_sistema já existe)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('nfc_whatsapp_numero', '5548999999999',
   'Número WhatsApp SAC — com DDI, sem espaços ou + (ex: 5548999999999)'),
  ('nfc_endereco_maps',   'ACN+Sinal+Verde',
   'Parâmetro de busca para o Google Maps (ex: Rua+das+Flores,123+Florianópolis)'),
  ('nfc_pin_global',      '123456',
   'PIN global de acesso à área restrita — substituído pelo PIN do veículo se diferente'),
  ('nfc_base_url',        'https://seudominio.com.br/veiculo.html',
   'URL base da página pública NFC (o chassi é adicionado como ?chassi=XXXX)'),
  ('nfc_nome_empresa',    'ACN Sinal Verde',
   'Nome da empresa exibido na página pública NFC'),
  ('nfc_logo_url',        '',
   'URL do logotipo (PNG/SVG). Deixe vazio para exibir só o nome em texto.')
ON CONFLICT (chave) DO NOTHING;
