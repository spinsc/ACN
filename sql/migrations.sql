-- =============================================================
-- ACN Sinal Verde — Migrations completas (tasks #73–#81)
-- Rodar no Supabase SQL Editor (pode rodar tudo de uma vez)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- #74 · NFC + Garantia de produtos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE veiculos_nfc
  ADD COLUMN IF NOT EXISTS produtos_instalados jsonb DEFAULT '[]'::jsonb;

ALTER TABLE cadastro_produtos
  ADD COLUMN IF NOT EXISTS garantia_meses integer DEFAULT 12;

-- ─────────────────────────────────────────────────────────────
-- #75 · OP/OS — campo placa
-- ─────────────────────────────────────────────────────────────
ALTER TABLE oples
  ADD COLUMN IF NOT EXISTS placa text;

-- ─────────────────────────────────────────────────────────────
-- #76 · Agenda de compromissos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_compromissos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  setor         text        NOT NULL,   -- 'licitacoes' | 'engenharia' | 'comercial' | 'sac'
  usuario_email text        NOT NULL,
  usuario_nome  text,
  titulo        text        NOT NULL,
  descricao     text,
  data_hora     timestamptz NOT NULL,
  criado_em     timestamptz DEFAULT now(),
  concluido     boolean     DEFAULT false,
  concluido_em  timestamptz
);
ALTER TABLE agenda_compromissos DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agenda_usuario ON agenda_compromissos(usuario_email, setor);
CREATE INDEX IF NOT EXISTS idx_agenda_data    ON agenda_compromissos(data_hora);

ALTER TABLE configuracoes_sistema
  ADD COLUMN IF NOT EXISTS agendas_setores jsonb
  DEFAULT '{"licitacoes":true,"engenharia":true,"comercial":true,"sac":true}'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- #77 · Rastreamento de leituras (badges de não lido)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registro_leituras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela        text NOT NULL,   -- 'licitacoes' | 'oples' | 'crm_oportunidades' | etc.
  registro_id   text NOT NULL,
  usuario_email text NOT NULL,
  lido_em       timestamptz DEFAULT now(),
  UNIQUE(tabela, registro_id, usuario_email)
);
ALTER TABLE registro_leituras DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_leituras_usuario ON registro_leituras(usuario_email, tabela);

-- ─────────────────────────────────────────────────────────────
-- #78 · Cotações — tabelas de propostas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotacoes_precos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero       text        NOT NULL UNIQUE,   -- ex: COT-2608-1234
  cliente      text,
  status       text        DEFAULT 'rascunho', -- rascunho | orcamento | proposta | fechado
  itens        jsonb       DEFAULT '[]'::jsonb,
  criado_por   text,
  criado_em    timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);
ALTER TABLE cotacoes_precos DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON cotacoes_precos(status);

CREATE TABLE IF NOT EXISTS cotacoes_propostas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id     uuid        REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  numero_proposta text,
  html           text,
  email_cliente  text,
  whatsapp       text,
  prazo_entrega  text,
  enviado_em     timestamptz,
  criado_em      timestamptz DEFAULT now()
);
ALTER TABLE cotacoes_propostas DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- #79 · Catálogo de produtos — fotos e PDF
-- ─────────────────────────────────────────────────────────────
ALTER TABLE cadastro_produtos
  ADD COLUMN IF NOT EXISTS fotos       jsonb DEFAULT '[]'::jsonb;

ALTER TABLE cadastro_produtos
  ADD COLUMN IF NOT EXISTS catalogo_url text;

-- ─────────────────────────────────────────────────────────────
-- #80 · Financeiro — centro de custos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS centros_custo (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo    text NOT NULL UNIQUE,
  nome      text NOT NULL,
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE centros_custo DISABLE ROW LEVEL SECURITY;

ALTER TABLE pcp_pedidos_compra
  ADD COLUMN IF NOT EXISTS centro_custo text;

-- ─────────────────────────────────────────────────────────────
-- Storage (fazer pelo Dashboard se ainda não existir)
-- ─────────────────────────────────────────────────────────────
-- Storage → New bucket → nome: acn-media → Public: ON
-- Usado para: produtos/{id}/fotos/* e produtos/{id}/catalogo/*

-- =============================================================
-- 2026-08-13 · fix: desmembramento de OP/OS falhava silenciosamente
-- =============================================================
-- oples.modelo tinha NOT NULL, mas o campo "Modelo" no NovaOpOsModal.tsx
-- é opcional (placeholder "Opcional") — toda criação de OP sem modelo
-- preenchido (incluindo o desmembramento por veículo) quebrava com
-- 23502 "null value in column modelo violates not-null constraint".
-- Já executado em produção em 2026-08-13.
ALTER TABLE public.oples ALTER COLUMN modelo DROP NOT NULL;

-- =============================================================
-- 2026-08-13 · feat: sub-aba Desenvolvimento (Engenharia)
-- =============================================================
-- Ja executado em producao em 2026-08-13.
CREATE TABLE IF NOT EXISTS public.engenharia_desenvolvimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opl_id uuid REFERENCES public.oples(id) ON DELETE SET NULL,
  numero_opl text,
  cliente_nome text,
  titulo text NOT NULL,
  descricao text,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  area_livre text,
  origem text NOT NULL DEFAULT 'manual',
  concluida boolean NOT NULL DEFAULT false,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.engenharia_desenvolvimento DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS engenharia_desenvolvimento_opl_idx ON public.engenharia_desenvolvimento (opl_id);
CREATE INDEX IF NOT EXISTS engenharia_desenvolvimento_concluida_idx ON public.engenharia_desenvolvimento (concluida);

-- =============================================================
-- 2026-08-13 · feat: sub-aba Horas/Tarefas (Engenharia)
-- =============================================================
-- Ja executado em producao em 2026-08-13.
CREATE TABLE IF NOT EXISTS public.engenharia_horas_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opl_id uuid REFERENCES public.oples(id) ON DELETE SET NULL,
  numero_opl text,
  titulo text NOT NULL,
  responsavel_nome text,
  status text NOT NULL DEFAULT 'nao_iniciada',
  data_inicio timestamptz,
  data_conclusao timestamptz,
  tempo_pausado_segundos numeric NOT NULL DEFAULT 0,
  tempo_total_segundos numeric,
  pausas jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.engenharia_horas_tarefas DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS engenharia_horas_tarefas_status_idx ON public.engenharia_horas_tarefas (status);
CREATE INDEX IF NOT EXISTS engenharia_horas_tarefas_opl_idx ON public.engenharia_horas_tarefas (opl_id);

-- =============================================================
-- 2026-08-13 · feat: prazo de entrega na Proposta de Cotacoes
-- =============================================================
-- Ja executado em producao em 2026-08-13.
ALTER TABLE public.cotacoes_propostas ADD COLUMN IF NOT EXISTS prazo_entrega text;

-- =============================================================
-- 2026-08-14 · feat: config. SMTP (Admin) + Compras (centro de
-- custo, cotacao x compra, anexos) + Fiscal (devolucao Comercial)
-- =============================================================
-- Ja executado em producao em 2026-08-14.

-- Config. SMTP (Admin > Config. Email). RLS sem policy de SELECT
-- para anon/authenticated -- as credenciais nunca sao lidas de
-- volta pelo bundle publico, so pela service_role (edge functions
-- send-email e save-email-config). IMPORTANTE: por causa disso,
-- UPDATE/DELETE diretos do cliente sao impossiveis sob RLS (o
-- Postgres exige visibilidade de SELECT para localizar a linha
-- alvo, mesmo com USING(true) na policy de UPDATE) -- so INSERT
-- funciona direto do cliente. Toda gravacao (inclusive updates)
-- passa pela edge function save-email-config.
CREATE TABLE IF NOT EXISTS public.configuracoes_email_smtp (
  chave          text PRIMARY KEY,
  valor          text,
  atualizado_em  timestamptz,
  atualizado_por text
);
ALTER TABLE public.configuracoes_email_smtp ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_smtp_write_anon  ON public.configuracoes_email_smtp FOR INSERT TO public WITH CHECK (true);
CREATE POLICY email_smtp_update_anon ON public.configuracoes_email_smtp FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Demandas Setoriais: compra x cotacao, centro de custo, anexos.
-- Atencao: DEFAULT 'compra' preenche retroativamente TODAS as
-- linhas existentes (comportamento padrao do Postgres em ADD
-- COLUMN ... DEFAULT) -- por isso o UPDATE de limpeza abaixo,
-- restringindo a badge/coluna a demandas de setor_destino='Compras'.
ALTER TABLE public.demandas_setoriais ADD COLUMN IF NOT EXISTS tipo_solicitacao text DEFAULT 'compra';
ALTER TABLE public.demandas_setoriais ADD COLUMN IF NOT EXISTS centro_custo text;
ALTER TABLE public.demandas_setoriais ADD COLUMN IF NOT EXISTS anexos jsonb DEFAULT '[]'::jsonb;
UPDATE public.demandas_setoriais SET tipo_solicitacao = NULL WHERE setor_destino <> 'Compras' OR setor_destino IS NULL;
