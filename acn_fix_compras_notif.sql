-- Adiciona Compras como destinatário de eventos relevantes
-- Execute no Supabase > SQL Editor

-- Falta de material → avisa Compras além de PCP e Gerente
UPDATE notificacoes_config
SET destinatarios_perfis = '["PCP","Gerente","Comercial","Compras"]'
WHERE evento = 'kit_falta_material';

-- Demanda criada para setor (usa setorOverride no código — apenas registra o evento)
-- Insere novo evento específico para demandas direcionadas ao Compras
INSERT INTO notificacoes_config (evento, label, descricao, ativo, destinatarios_perfis) VALUES
  ('demanda_criada_compras', 'Nova demanda para Compras', 'Notifica Compras quando uma demanda/ajuste é aberta para o setor', true, '["Compras"]')
ON CONFLICT (evento) DO UPDATE SET
  destinatarios_perfis = EXCLUDED.destinatarios_perfis,
  ativo = EXCLUDED.ativo;
