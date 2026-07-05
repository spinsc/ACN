-- Correcao: adicionar colunas faltantes na tabela vistorias_patio
-- Execute no SQL Editor do Supabase

ALTER TABLE vistorias_patio
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT,
  ADD COLUMN IF NOT EXISTS veiculo_placa TEXT,
  ADD COLUMN IF NOT EXISTS veiculo_modelo TEXT,
  ADD COLUMN IF NOT EXISTS km_saida TEXT,
  ADD COLUMN IF NOT EXISTS destino TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_envio TEXT,
  ADD COLUMN IF NOT EXISTS data_saida TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previsao_retorno DATE,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS fotos_saida JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS assinatura_envio_url TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_recebimento_url TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_retorno_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Saiu',
  ADD COLUMN IF NOT EXISTS criado_por TEXT,
  ADD COLUMN IF NOT EXISTS criado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS km_retorno TEXT,
  ADD COLUMN IF NOT EXISTS obs_retorno TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_recebimento TEXT,
  ADD COLUMN IF NOT EXISTS data_retorno TIMESTAMPTZ;

-- Corrigir tipo de criado_por (pode ter sido criado como UUID, precisa ser TEXT)
ALTER TABLE vistorias_patio ALTER COLUMN criado_por TYPE TEXT USING criado_por::TEXT;

-- Garantir RLS desabilitado
ALTER TABLE vistorias_patio DISABLE ROW LEVEL SECURITY;

-- Caso a tabela nao exista, criar do zero:
-- (so executar se o ALTER acima falhar com "tabela nao existe")
/*
CREATE TABLE IF NOT EXISTS vistorias_patio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico TEXT,
  veiculo_placa TEXT,
  veiculo_modelo TEXT,
  km_saida TEXT,
  destino TEXT,
  responsavel_envio TEXT,
  data_saida TIMESTAMPTZ,
  previsao_retorno DATE,
  observacoes TEXT,
  fotos_saida JSONB DEFAULT '[]',
  assinatura_envio_url TEXT,
  assinatura_recebimento_url TEXT,
  assinatura_retorno_url TEXT,
  status TEXT DEFAULT 'Saiu',
  criado_por TEXT,
  criado_por_nome TEXT,
  km_retorno TEXT,
  obs_retorno TEXT,
  responsavel_recebimento TEXT,
  data_retorno TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE vistorias_patio DISABLE ROW LEVEL SECURITY;
*/

-- Novos campos: numero do documento e solicitante
ALTER TABLE vistorias_patio
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'OPL',
  ADD COLUMN IF NOT EXISTS numero_documento TEXT,
  ADD COLUMN IF NOT EXISTS solicitante TEXT;
