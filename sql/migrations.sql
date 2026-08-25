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

-- =============================================================
-- 2026-08-14 · feat: centro de custo direto na OP/OS (task #4)
-- =============================================================
-- Ja executado em producao em 2026-08-14. Editavel no formulario
-- principal do Comercial e no modal "Editar OPL" (aba OPLs em Aberto).
ALTER TABLE public.oples ADD COLUMN IF NOT EXISTS centro_custo text;

-- =============================================================
-- 2026-08-14 · feat: Contratos Padrão para Terceiros (task #2)
-- =============================================================
-- Ja executado em producao em 2026-08-14. Cadastro em Admin > Contratos
-- Padrão. Tipo é livre (texto) para permitir varias categorias de
-- contrato conforme a demanda. Arquivo vai para o bucket acn-media.
CREATE TABLE IF NOT EXISTS public.contratos_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  arquivo_url text,
  arquivo_nome text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text
);
ALTER TABLE public.contratos_padrao DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS contratos_padrao_tipo_idx ON public.contratos_padrao (tipo);

-- =============================================================
-- 2026-08-15 · feat: Mesa de Cotações + unificação do Compras (Fase 1)
-- =============================================================
-- Fase 1 da expansão Compras/Faturamento/Logística (ver plano completo
-- salvo na sessão). Unifica os dois pipelines de compra que existiam
-- (pcp_pedidos_compra e o branch Compras de demandas_setoriais) só em
-- pcp_pedidos_compra — Demandas Gerais (AjustesProjetoTab) passa a
-- inserir direto aqui para o setor Compras.
ALTER TABLE public.pcp_pedidos_compra ADD COLUMN IF NOT EXISTS prazo_prometido_entrega date;
ALTER TABLE public.pcp_pedidos_compra ADD COLUMN IF NOT EXISTS prazo_prometido_destino text; -- 'producao' | 'cliente'
ALTER TABLE public.pcp_pedidos_compra ADD COLUMN IF NOT EXISTS vencedora_id uuid;
ALTER TABLE public.pcp_pedidos_compra ADD COLUMN IF NOT EXISTS justificativa_vencedora text;

-- Mesa de cotações — mínimo 3 fornecedores por pedido (validado no front-end)
CREATE TABLE IF NOT EXISTS public.pcp_cotacoes_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pcp_pedidos_compra(id) ON DELETE CASCADE,
  fornecedor_nome text NOT NULL,
  valor numeric,
  condicao_pagamento text,
  prazo_entrega text,
  anexo_url text,
  anexo_nome text,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pcp_cotacoes_fornecedores DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.pcp_pedidos_compra
  ADD CONSTRAINT pcp_pedidos_compra_vencedora_fk
  FOREIGN KEY (vencedora_id) REFERENCES public.pcp_cotacoes_fornecedores(id);

-- =============================================================
-- 2026-08-20 · feat: Alçadas de Aprovação de Compras (Fase 2)
-- =============================================================
-- Fase 2 da expansão Compras (ver plano completo salvo na sessão).
-- Compras acima de um valor configurável passam por status_compra
-- 'Aguardando Aprovação' antes de virar 'Comprado'. Sem alçada
-- configurada no Admin, comportamento não muda (fica igual à Fase 1).
CREATE TABLE IF NOT EXISTS public.compras_alcadas_aprovacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel integer NOT NULL UNIQUE,
  nome text NOT NULL,
  valor_minimo numeric NOT NULL,
  perfis_aprovadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compras_alcadas_aprovacao DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pcp_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pcp_pedidos_compra(id) ON DELETE CASCADE,
  nivel integer NOT NULL,
  nivel_nome text,
  valor_no_momento numeric NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  solicitado_por text,
  solicitado_por_nome text,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  respondido_por text,
  respondido_por_nome text,
  respondido_em timestamptz,
  resposta text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pcp_aprovacoes DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pcp_aprovacoes_pedido ON public.pcp_aprovacoes (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pcp_aprovacoes_status ON public.pcp_aprovacoes (pedido_id, status);

-- =============================================================
-- 2026-08-20 · feat: Ordem de Compra automática ao confirmar compra
-- =============================================================
-- Gera numero_oc (formato OC-2026-0001) via trigger de banco assim que
-- status_compra vira 'Comprado' — não importa se veio direto (sem
-- alcada) ou da aprovacao final da Fase 2. numero_oc preenchido é o
-- proprio sinal de "aprovado e lancado" no Financeiro (sem tabela de
-- lancamentos separada). Mesmo padrao de gerar_numero_cotacao() em
-- sql/cotacoes_vendedor.sql.
ALTER TABLE public.pcp_pedidos_compra ADD COLUMN IF NOT EXISTS numero_oc text;

CREATE SEQUENCE IF NOT EXISTS ordem_compra_seq START 1;

CREATE OR REPLACE FUNCTION gerar_numero_oc()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_compra = 'Comprado'
     AND (OLD.status_compra IS DISTINCT FROM 'Comprado')
     AND NEW.numero_oc IS NULL THEN
    NEW.numero_oc := 'OC-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('ordem_compra_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_oc ON public.pcp_pedidos_compra;
CREATE TRIGGER trg_numero_oc
  BEFORE UPDATE ON public.pcp_pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_oc();

-- =============================================================
-- 2026-08-20 · feat: Faturamento & Conferencia Tecnica (Fase 3)
-- =============================================================
-- Substitui o "clique sem verificacao" (Recebimento na Logistica ou
-- botao Recebido em Compras mudavam pra Concluido direto) por um
-- gate real: só fecha a compra e libera o pagamento da NF do
-- fornecedor depois que a Logistica confere seriais/volume/NF.
ALTER TABLE public.logistica_manifestos ADD COLUMN IF NOT EXISTS seriais text;
ALTER TABLE public.logistica_manifestos ADD COLUMN IF NOT EXISTS volume numeric;
ALTER TABLE public.logistica_manifestos ADD COLUMN IF NOT EXISTS nf_conferida boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.pcp_pedidos_faturamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pcp_pedidos_compra(id) ON DELETE CASCADE,
  numero_oc text,
  numero_pedido text,
  fornecedor text,
  centro_custo text,
  valor numeric,
  recebimento_confirmado boolean NOT NULL DEFAULT false,
  recebimento_confirmado_em timestamptz,
  nf_fornecedor_numero text,
  nf_fornecedor_url text,
  status_faturamento text NOT NULL DEFAULT 'aguardando_recebimento',
  data_pagamento date,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pcp_pedidos_faturamento DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pcp_pedidos_faturamento_status ON public.pcp_pedidos_faturamento (status_faturamento);

CREATE OR REPLACE FUNCTION gerar_pedido_faturamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_compra = 'Comprado' AND (OLD.status_compra IS DISTINCT FROM 'Comprado') THEN
    INSERT INTO public.pcp_pedidos_faturamento (pedido_id, numero_oc, numero_pedido, fornecedor, centro_custo, valor)
    VALUES (NEW.id, NEW.numero_oc, NEW.numero_pedido, NEW.fornecedor, NEW.centro_custo, NEW.valor_compra)
    ON CONFLICT (pedido_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_faturamento ON public.pcp_pedidos_compra;
CREATE TRIGGER trg_pedido_faturamento
  AFTER UPDATE ON public.pcp_pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION gerar_pedido_faturamento();

-- =============================================================
-- 2026-08-20 · feat: Frete (Fase 4)
-- =============================================================
-- Ultima fase do plano de expansao Compras/Faturamento/Logistica.
-- Mesa de cotacoes de transportadoras (mesmo padrao da Fase 1, tabela
-- irmã pra nao mexer no fluxo de Compras ja em producao) + linha do
-- tempo Cotacao -> Em Transito -> Entregue, com canhoto obrigatorio
-- antes de Entregue (gate real, mesmo padrao do nf_conferida da Fase 3).
CREATE TABLE IF NOT EXISTS public.pcp_fretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direcao text NOT NULL DEFAULT 'inbound',
  descricao text NOT NULL,
  origem text,
  destino text,
  pedido_compra_id uuid REFERENCES public.pcp_pedidos_compra(id) ON DELETE SET NULL,
  transportadora text,
  valor_frete numeric,
  vencedora_id uuid,
  justificativa_vencedora text,
  status text NOT NULL DEFAULT 'Cotação',
  data_prevista date,
  data_coleta timestamptz,
  data_entrega timestamptz,
  canhoto_url text,
  canhoto_nome text,
  observacoes text,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pcp_fretes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pcp_cotacoes_fretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frete_id uuid NOT NULL REFERENCES public.pcp_fretes(id) ON DELETE CASCADE,
  transportadora_nome text NOT NULL,
  valor numeric,
  condicao_pagamento text,
  prazo_entrega text,
  anexo_url text,
  anexo_nome text,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pcp_cotacoes_fretes DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.pcp_fretes
  ADD CONSTRAINT pcp_fretes_vencedora_fk
  FOREIGN KEY (vencedora_id) REFERENCES public.pcp_cotacoes_fretes(id);

-- Timeline/chat por pedido reaproveita a tabela op_acompanhamentos já
-- existente (via OplAcompModal com referenciaType='compra') — sem
-- migração nova para isso.

-- =============================================================
-- 2026-08-24 · feat: CT-e e código/link de rastreio no Frete
-- =============================================================
-- Ja executado em producao em 2026-08-24. Campos que faltavam na Fase 4
-- (achado numa auditoria) — preenchidos na tela "Em Trânsito", exibidos
-- em "Entregue" e na listagem principal.
ALTER TABLE public.pcp_fretes ADD COLUMN IF NOT EXISTS numero_cte text;
ALTER TABLE public.pcp_fretes ADD COLUMN IF NOT EXISTS codigo_rastreio text;
ALTER TABLE public.pcp_fretes ADD COLUMN IF NOT EXISTS url_rastreio text;

-- =============================================================
-- 2026-08-20 · feat: Aprovação por Departamento na Mesa de Cotações
-- =============================================================
-- Segunda camada de aprovação, independente da alçada por valor (Fase 2):
-- o gestor do departamento que solicitou a compra é mencionado assim que
-- a 1ª cotação de fornecedor é lançada no pedido, e precisa aprovar antes
-- da compra fechar — em paralelo/adicional à alçada por valor, quando
-- ambas se aplicam. Reaproveita pcp_aprovacoes/mencoes/o loop sequencial
-- de aprovação já existentes: a linha de departamento nasce com nivel=0,
-- então é resolvida antes de qualquer alçada por valor (nivel>=1) criada
-- depois, no confirmar-compra.
CREATE TABLE IF NOT EXISTS public.compras_departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  gestor_id text NOT NULL,
  gestor_nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compras_departamentos DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.pcp_pedidos_compra
  ADD COLUMN IF NOT EXISTS departamento_id uuid REFERENCES public.compras_departamentos(id);

-- tipo diferencia a origem da linha ('alcada' = valor, Fase 2 | 'departamento' = novo).
-- aprovador_id/aprovador_nome denormalizam quem especificamente pode aprovar uma
-- linha de departamento (pessoa única, não perfil/role como a alçada).
ALTER TABLE public.pcp_aprovacoes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'alcada',
  ADD COLUMN IF NOT EXISTS aprovador_id text,
  ADD COLUMN IF NOT EXISTS aprovador_nome text;
-- valor_no_momento vira opcional: uma linha de departamento pode nascer na 1ª
-- cotação, antes de existir vencedora/valor definido.
ALTER TABLE public.pcp_aprovacoes ALTER COLUMN valor_no_momento DROP NOT NULL;

-- =============================================================
-- 2026-08-21 · feat: Responsáveis/Apoios livres em OP e OS + comissão de apoio
-- =============================================================
-- Lista viva de quem está creditado numa OP/OS depois de iniciada — separada
-- dos campos legados (oples.tecnico_producao_id/_2_id, modo_execucao, etc.),
-- que continuam representando só a atribuição inicial e não mudam. A tabela
-- nova nasce semeada a partir dessa atribuição inicial e daí em diante pode
-- ganhar/perder responsáveis e apoios livremente, sem estar presa a
-- individual/dupla/equipe. papel='apoio' credita 0,1% fixo do valor_mao_de_obra
-- na comissão (RHTab.tsx), independente do percentual_comissao configurado
-- pro técnico (que só vale pro papel='responsavel').
CREATE TABLE IF NOT EXISTS public.responsaveis_producao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  referencia_id uuid NOT NULL,
  papel text NOT NULL DEFAULT 'responsavel',
  tecnico_id uuid,
  tecnico_nome text NOT NULL,
  adicionado_por text,
  adicionado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resp_producao_ref ON public.responsaveis_producao (tipo, referencia_id);
ALTER TABLE public.responsaveis_producao DISABLE ROW LEVEL SECURITY;

-- =============================================================
-- 2026-08-21 · feat: Área livre por cotação + aprovação com senha
-- =============================================================
-- Cada cotação de fornecedor ganha seu próprio espaço de anotação rica
-- (texto/imagens/tabelas coladas), pra embasar a decisão de qual vence.
ALTER TABLE public.pcp_cotacoes_fornecedores ADD COLUMN IF NOT EXISTS area_livre text;

-- =============================================================
-- 2026-08-21 · feat: Reformulação do fluxo de OS de Manutenção Veicular
-- (SAC <-> Adaptação <-> CQ <-> Fiscal)
-- =============================================================
-- Corrige o bug de confirmarChegada (pulava direto pra Aguardando Início
-- ignorando o passo de orçamento), unifica a atribuição de técnico antes
-- de iniciar o trabalho (elimina o pulo direto pra Em Manutenção), e
-- estende os mecanismos de CQ/checklist e Fiscal/NF — que hoje só existem
-- pra OP (oples) — também pra OS (sac_ordens_servico). Ver plano completo
-- salvo na sessão (eager-whistling-tome.md).

-- Revisão de orçamento durante a execução: quando os itens conferidos não
-- batem com o valor aprovado, a OS fica com revisao_pendente=true (sem
-- avançar de status) até o SAC negociar e resolver com o cliente.
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS revisao_pendente boolean NOT NULL DEFAULT false;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS valor_orcamento_revisado numeric;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS itens_revisados jsonb;

-- Campos de Fiscal/NF, espelhando os mesmos já usados em oples.
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS data_emissao_nf timestamptz;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS responsavel_fiscal text;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS tempo_fiscal_horas numeric;

-- Campos de resultado do CQ, espelhando os mesmos já usados em oples
-- (data_cq/resultado_cq/obs_reprovacao_cq/cq_auditor) — sac_ordens_servico
-- não tinha nenhum deles ainda, já que CQ nunca existiu pra OS antes.
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS data_cq timestamptz;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS resultado_cq text;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS obs_reprovacao_cq text;
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS cq_auditor text;

-- cq_auditorias em produção só tem (id, opl, chassi, categoria_servico,
-- data_auditoria, resultado, itens_checklist, observacoes,
-- assinatura_responsavel_url, responsavel_nome, nao_conformidades,
-- tempo_qualidade_horas, criado_por, created_at) — NÃO tem opl_id/numero_opl/
-- auditor_nome/assinatura_url, que é o que QualidadeTab.tsx sempre inseriu.
-- Ou seja, o insert em cq_auditorias vinha falhando silenciosamente (o erro
-- não é checado) em toda auditoria de OP já feita — a trilha de auditoria
-- nunca foi de fato gravada, embora a aprovação/reprovação em si funcionasse
-- (o UPDATE em oples que vem depois não depende do insert anterior).
-- Corrigido aqui de graça, já que a extensão pra OS depende dessas mesmas
-- colunas pra gravar sua própria trilha (os_id/numero_os).
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS opl_id uuid;
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS numero_opl text;
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS auditor_nome text;
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS assinatura_url text;
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.cq_auditorias ADD COLUMN IF NOT EXISTS numero_os text;

-- =============================================================
-- 2026-08-22 · fix: botão "✏️ Resp." do SAC sempre falhava (coluna faltante)
-- =============================================================
-- Bug pré-existente, encontrado pelo usuário em produção logo após o deploy
-- acima (não relacionado à reformulação de OS veicular): SacTab.tsx sempre
-- tentou gravar em sac_ordens_servico.responsavel_nome, mas essa coluna
-- nunca existiu na tabela — o UPDATE falhava com "Could not find the
-- 'responsavel_nome' column" toda vez que alguém tentava usar o botão.
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS responsavel_nome text;

-- =============================================================
-- 2026-08-24 · feat: campo Chassi no dashboard do SAC
-- =============================================================
-- Ja executado em producao em 2026-08-24. Dashboard de OS/OP do SAC passa
-- a sempre mostrar chassi+modelo (veiculo) ou modelo+numero_serie (outros
-- equipamentos), com aviso "⚠️ sem X" quando faltar. sac_ordens_servico
-- ja tinha modelo/numero_serie, mas nao tinha chassi.
ALTER TABLE public.sac_ordens_servico ADD COLUMN IF NOT EXISTS chassi text;

-- =============================================================
-- 2026-08-25 · feat: reorganizacao do processo de Licitacao —
-- Andamento fixo, abas destacadas e filtro "Ultimas Alteracoes"
-- =============================================================
-- Ja executado em producao em 2026-08-25.
--
-- auth_usuarios: rastreio de ultimo login. LoginTab.tsx grava o login ATUAL
-- aqui e devolve o login ANTERIOR (capturado antes de sobrescrever) como
-- ultimo_login_anterior no objeto salvo em localStorage — é essa marca que
-- o filtro "Ultimas Alteracoes" usa como corte.
ALTER TABLE public.auth_usuarios ADD COLUMN IF NOT EXISTS ultimo_login timestamptz;

-- licitacao_documentos nao tinha atualizado_em -- coluna que salvarEdicaoDoc
-- (agora salvarEdicaoAndamento) ja tentava gravar, entao toda edicao de uma
-- entrada de Andamento falhava com "Could not find the atualizado_em column"
-- (bug pre-existente, corrigido de graca aqui). Tambem passa a ser usada
-- para calcular a "ultima alteracao" de cada aba (Impugnacoes, Custos etc.)
-- e destacar a aba na barra quando houver algo novo desde a ultima leitura
-- do usuario (rastreada via registro_leituras, tabela='licitacao_aba',
-- registro_id='{licitacao_id}:{categoria}' -- reaproveita a tabela/padrao
-- ja usado pelo badge de nao-lido dos cards, sem migracao nova pra isso).
ALTER TABLE public.licitacao_documentos ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;

-- Qualquer insercao/edicao de documento em QUALQUER aba (inclusive Andamento,
-- que deixou de ser aba e agora fica fixo abaixo do formulario) toca
-- licitacoes.atualizado_em -- fonte unica usada tanto pelo badge de
-- nao-lido do card (ja existente, useUnread) quanto pelo novo filtro
-- "Ultimas Alteracoes" do dashboard. Sem isso, so mudancas no formulario/
-- marcadores/area livre/status bumpavam atualizado_em -- upload de arquivo
-- em Impugnacoes, por exemplo, nunca refletia no card nem no filtro.
CREATE OR REPLACE FUNCTION public.licitacao_doc_touch_licitacao()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.licitacoes SET atualizado_em = now() WHERE id = NEW.licitacao_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_licitacao_doc_touch ON public.licitacao_documentos;
CREATE TRIGGER trg_licitacao_doc_touch
  AFTER INSERT OR UPDATE ON public.licitacao_documentos
  FOR EACH ROW EXECUTE FUNCTION public.licitacao_doc_touch_licitacao();
