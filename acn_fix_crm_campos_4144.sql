-- =====================================================================
-- Tasks #41/#43/#44 — Novos campos em crm_oportunidades
-- RODAR NO SUPABASE SQL EDITOR
-- =====================================================================

-- Posição para reordenação manual dentro de cada coluna do Kanban
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS posicao           integer DEFAULT 0;

-- Valor que efetivamente entra como receita da ACN/Detech
-- (preenchido quando classificacao='Parceiro' ou faturamento_empresa='Detech')
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS valor_acn         numeric;

-- Empresa que fatura o processo: 'ACN' | 'Detech'
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS faturamento_empresa text DEFAULT 'ACN';

-- Inicializar posicao com base na data de criação (mais recente = menor posicao)
-- Isso garante que a ordem atual seja preservada
UPDATE crm_oportunidades
SET posicao = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY estagio_id ORDER BY criado_em DESC) AS rn
  FROM crm_oportunidades
) sub
WHERE crm_oportunidades.id = sub.id
  AND crm_oportunidades.posicao = 0;

-- Verificar resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'crm_oportunidades'
  AND column_name IN ('posicao', 'valor_acn', 'faturamento_empresa')
ORDER BY column_name;
