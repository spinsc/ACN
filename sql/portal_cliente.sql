-- ============================================================
-- MÓDULO: Portal do Cliente — ACN Sinal Verde
-- Adiciona token único por veículo para acesso ao portal
-- ============================================================

-- 1. Adicionar coluna portal_token na tabela existente
ALTER TABLE veiculos_nfc
  ADD COLUMN IF NOT EXISTS portal_token UUID DEFAULT gen_random_uuid();

-- Preencher tokens para registros já existentes que ficaram NULL
UPDATE veiculos_nfc
  SET portal_token = gen_random_uuid()
  WHERE portal_token IS NULL;

-- Garantir unicidade
CREATE UNIQUE INDEX IF NOT EXISTS veiculos_nfc_portal_token_idx
  ON veiculos_nfc (portal_token);

-- 2. Config: URL base do portal (separada da URL NFC)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('nfc_portal_url', 'https://seudominio.com.br/portal.html',
   'URL base do Portal do Cliente (o token é adicionado como ?token=XXXX)')
ON CONFLICT (chave) DO NOTHING;
