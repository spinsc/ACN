-- =====================================================================
-- Fix: Desabilitar RLS nas tabelas do CRM que faltaram
-- RODAR NO SUPABASE SQL EDITOR
-- =====================================================================

-- Tabelas principais do CRM (leituras funcionavam, mas inserts falhavam silenciosamente)
ALTER TABLE crm_oportunidades       DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_estagios_funil      DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_historico           DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_checklist_itens     DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_checklist_progresso DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_vendas              DISABLE ROW LEVEL SECURITY;

-- Confirmar
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN (
  'crm_oportunidades', 'crm_estagios_funil', 'crm_historico',
  'crm_checklist_itens', 'crm_checklist_progresso', 'crm_vendas'
)
ORDER BY tablename;
-- rowsecurity = false = correto (RLS desabilitado)
