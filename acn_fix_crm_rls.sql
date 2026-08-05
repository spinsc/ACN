-- =====================================================================
-- Fix CRM: RLS + TODAS as colunas faltantes em crm_oportunidades
-- RODAR NO SUPABASE SQL EDITOR
-- =====================================================================

-- 1. Desabilitar RLS (inserts falhavam silenciosamente sem isso)
-- (Se já rodou antes, esses comandos são idempotentes — pode rodar de novo)
ALTER TABLE crm_oportunidades       DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_estagios_funil      DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_historico           DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_checklist_itens     DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_checklist_progresso DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_vendas              DISABLE ROW LEVEL SECURITY;

-- 2. Colunas que o app envia mas que nunca foram criadas no banco
--    (ADD COLUMN IF NOT EXISTS é idempotente — não quebra se já existir)

-- Tipo de licitação: 'ordinaria' | 'ata'
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS tipo_licitacao        text    DEFAULT 'ordinaria';

-- Empresa vencedora da licitação
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS empresa_vencedora     text;

-- Validade da Ata de Registro de Preços
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS data_validade_ata     date;

-- Previsão de fechamento (venda direta)
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS data_prev_fechamento  date;

-- Responsável (referência a rh_funcionarios — sem FK obrigatória)
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS responsavel_id        uuid;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS responsavel_nome      text;

-- Sub-status da oportunidade: 'andamento' | 'recurso' | 'impugnacao' etc.
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS sub_status            text    DEFAULT 'andamento';

-- Motivo de perda
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS motivo_perda          text;

-- Hora da sessão de disputa
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS hora_sessao           text;

-- Contato comercial
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS nome_contato          text;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS contato               text;   -- telefone
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS contato_email         text;   -- já adicionado em crm_melhorias — IF NOT EXISTS garante segurança

-- Próximo contato agendado
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS prox_contato          date;
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS hora_prox_contato     text;

-- Cliente vinculado
ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS cliente_id            uuid    REFERENCES clientes(id) ON DELETE SET NULL;

-- 3. Confirmar resultado
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'crm_oportunidades'
ORDER BY ordinal_position;
-- Todas as colunas acima devem aparecer na lista
