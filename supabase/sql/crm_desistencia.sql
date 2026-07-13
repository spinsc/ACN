-- ─────────────────────────────────────────────────────────────────────────────
-- CRM DESISTÊNCIA — Coluna na tabela de oportunidades + Estágio no Kanban
-- Rodar no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Coluna para registrar o motivo da desistência
ALTER TABLE crm_oportunidades
  ADD COLUMN IF NOT EXISTS motivo_desistencia text;

-- 2. Estágio "Desistência" para o funil de Licitações
INSERT INTO crm_estagios_funil (funil, nome, cor, ordem, is_final)
VALUES ('licitacao', '🚫 Desistência', '#92400e', 99, true)
ON CONFLICT DO NOTHING;

-- 3. Estágio "Desistência" para o funil de Vendas Diretas
INSERT INTO crm_estagios_funil (funil, nome, cor, ordem, is_final)
VALUES ('venda_direta', '🚫 Desistência', '#92400e', 99, true)
ON CONFLICT DO NOTHING;

-- Verificação
SELECT id, funil, nome, cor, ordem, is_final
FROM crm_estagios_funil
WHERE nome ILIKE '%desist%';
