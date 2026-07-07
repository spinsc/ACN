-- Tabela de configuração de notificações WhatsApp
-- Execute no Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS notificacoes_config (
  evento               TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  descricao            TEXT,
  ativo                BOOLEAN DEFAULT true,
  destinatarios_perfis JSONB   DEFAULT '[]',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Eventos padrão
INSERT INTO notificacoes_config (evento, label, descricao, ativo, destinatarios_perfis) VALUES
  ('op_enviada_engenharia',    'Nova OP enviada para Engenharia',       'Comercial registra ou reenvia OP',                        true, '["Engenharia"]'),
  ('engenharia_libera_pcp',    'Engenharia liberou BOM para PCP',       'BOM lançado — OP segue para PCP',                         true, '["PCP"]'),
  ('engenharia_devolve_comerc','Engenharia devolveu OP para Comercial', 'Engenharia identificou problema e devolveu',               true, '["Comercial"]'),
  ('pcp_libera_almox',         'PCP solicitou kiting ao Almoxarifado',  'PCP liberou kit para separação',                          true, '["Almoxarifado"]'),
  ('pcp_libera_producao',      'PCP liberou para Produção',             'Kit conferido — OP autorizada para produção',             true, '["Producao"]'),
  ('pcp_devolve_engenharia',   'PCP devolveu OP para Engenharia',       'PCP encontrou inconsistência no BOM',                     true, '["Engenharia"]'),
  ('kit_ok',                   'Kit completo — aguardando PCP',         'Almoxarifado confirmou kit 100% separado',                true, '["PCP"]'),
  ('kit_pendencia',            'Kit liberado COM pendência',            'Itens em falta — liberado parcialmente',                  true, '["PCP","Gerente"]'),
  ('kit_falta_material',       'Falta de material no kit',             'Almoxarifado registrou falta — bloqueado',                true, '["PCP","Gerente","Comercial"]'),
  ('producao_finaliza',        'Produção finalizada — aguarda CQ',      'OP pronta para auditoria de qualidade',                   true, '["CQ"]'),
  ('cq_aprovado',              'CQ Aprovado',                           'Auditoria de qualidade aprovada',                         true, '["Comercial","Gerente"]'),
  ('cq_reprovado',             'CQ Reprovado — Retrabalho',             'Auditoria reprovada — OP volta para produção',            true, '["Producao","Gerente"]'),
  ('fiscal_nf_emitida',        'NF emitida — disponível para entrega',  'Fiscal emitiu NF — aguarda retirada/entrega',             true, '["Comercial","Logistica"]'),
  ('comercial_entregue',       'Equipamento entregue ao cliente',       'Comercial confirmou entrega',                             true, '["Gerente"]'),
  ('demanda_criada_setor',     'Nova demanda/ajuste para setor',        'Notifica o setor de destino quando demanda é aberta',     true, '[]'),
  ('atraso_entrega',           'Atraso na entrega de OP',               'OP com data prevista vencida (verificação agendada)',      true, '["Gerente","Comercial"]')
ON CONFLICT (evento) DO NOTHING;
