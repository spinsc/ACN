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

-- =============================================================
-- 2026-08-25 · feat: valor dividido no desmembramento de OP +
-- faturamento em lote no Fiscal (varias OPs, 1 NF-e so)
-- =============================================================
-- Ja executado em producao em 2026-08-25. Quando uma OP com N veiculos e
-- desmembrada (NovaOpOsModal.tsx, CrmTab.tsx converterGanho e
-- salvarOplEdit), valor_total/valor_mao_de_obra/valor_mao_de_obra_serralheria
-- passam a ser divididos igualmente entre as N unidades (antes eram
-- copiados inteiros em cada uma, ou ficavam em branco no caminho CRM->OP).
-- Ver dividirValorEmUnidades() em AcnTabShared.tsx.
--
-- Campo novo usado pelo Fiscal (FiscalTab.tsx) ao faturar varias OPs
-- desmembradas juntas com 1 unico numero de NF-e -- guarda a lista de
-- chassi/placa/serial de cada unidade coberta pela nota.
ALTER TABLE public.oples ADD COLUMN IF NOT EXISTS observacoes_faturamento text;

-- =============================================================
-- 2026-08-26 · feat: CNPJ de faturamento por veiculo desmembrado
-- =============================================================
-- Ja executado em producao em 2026-08-26. Cada unidade desmembrada (ja e
-- uma linha propria em oples, com seu proprio chassi/placa) pode ter seu
-- proprio CNPJ de faturamento, diferente do cliente -- mesmo padrao ja
-- usado em sac_ordens_servico (cnpj_faturamento/razao_social_faturamento).
-- Editavel no modal de editar OPL (CrmTab.tsx) e no novo modal de
-- lancamento em lote (chassi/placa/CNPJ de todas as unidades de um lote
-- de uma vez, com opcao de colar uma lista de chassis).
ALTER TABLE public.oples ADD COLUMN IF NOT EXISTS cnpj_faturamento text;
ALTER TABLE public.oples ADD COLUMN IF NOT EXISTS razao_social_faturamento text;

-- =============================================================
-- 2026-08-26 · feat: tipo de projeto "Reboque" + catalogo de modelos
-- =============================================================
-- Ja executado em producao em 2026-08-26. Novo Tipo de Projeto "Reboque"
-- em NovaOpOsModal.tsx. Ao selecionar Reboque, o campo Modelo vira um
-- select alimentado por este catalogo (em vez de texto livre), com opcao
-- "Novo modelo..." que cadastra o nome direto pela tela da OP/OS e ja fica
-- disponivel pra selecionar em registros futuros. Mesmo formato ja usado
-- em sac_tipos_servico.
CREATE TABLE IF NOT EXISTS public.oples_reboque_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

-- =============================================================
-- 2026-08-26 · feat: Reformulação do funil Comercial/CRM (Fase 1)
-- =============================================================
-- Ja executado em producao em 2026-08-26. Kanban de Vendas Diretas
-- (CrmTab.tsx) reduzido/renomeado para 7 estagios explicitos:
-- Estimativa(1) < Lead/Contato+Qualificacao, Lead(2) < Qualificacao,
-- Enviado(3) < Proposta Enviada+Negociacao, Vencido(4,ganho) <
-- Venda Convertida+Finalizada, Faturado(5,NOVO), Perdido(6), Desistencia(99,
-- mantido). Nova coluna crm_estagios_funil.tipo classifica cada estagio
-- explicitamente (usado por CrmTab.tsx no lugar de adivinhar pelo nome).
-- Dados existentes remapeados 1:1 sem perda (22 oportunidades antes = 22
-- depois, verificado por GROUP BY antes/depois de aplicar).
ALTER TABLE public.crm_estagios_funil ADD COLUMN IF NOT EXISTS tipo text;

UPDATE public.crm_oportunidades SET estagio_id = '2ff82a13-356b-49bf-abe0-9fb0e6de6fe2'
  WHERE estagio_id = 'e8cc024d-e8c6-4d89-acf1-fc657e3ebeab';
DELETE FROM public.crm_estagios_funil WHERE id = 'e8cc024d-e8c6-4d89-acf1-fc657e3ebeab';

UPDATE public.crm_oportunidades SET estagio_id = 'bfa861af-c559-448b-8418-afe73b9def6a'
  WHERE estagio_id = '0fc0062a-6b24-4d38-9bfe-ac0301dc566e';
DELETE FROM public.crm_estagios_funil WHERE id = '0fc0062a-6b24-4d38-9bfe-ac0301dc566e';

UPDATE public.crm_estagios_funil SET nome='Estimativa', ordem=1, tipo='estimativa' WHERE id='5415992e-8e05-4896-a4c0-17fe49bf1c5d';
UPDATE public.crm_estagios_funil SET nome='Lead',       ordem=2, tipo='lead'       WHERE id='23b5cd3b-2b93-4413-a81f-7e5a53f3ea0e';
UPDATE public.crm_estagios_funil SET nome='Enviado',    ordem=3, tipo='enviado'    WHERE id='2ff82a13-356b-49bf-abe0-9fb0e6de6fe2';
UPDATE public.crm_estagios_funil SET nome='Vencido',    ordem=4, tipo='ganho', is_final=true WHERE id='bfa861af-c559-448b-8418-afe73b9def6a';
UPDATE public.crm_estagios_funil SET nome='Perdido',    ordem=6, tipo='perdido'    WHERE id='72f5f9b2-c11a-4f71-be75-8468b2cfedce';
UPDATE public.crm_estagios_funil SET tipo='desistencia' WHERE id='bff8d52c-80f6-43a7-ae97-3ecc962386a3';

INSERT INTO public.crm_estagios_funil (funil, nome, ordem, is_final, cor, tipo)
VALUES ('venda_direta', 'Faturado', 5, true, '#15803d', 'faturado');

-- Estagio Estimativa ganha botao "-> Licitacao/ATA" que agora grava o
-- vinculo de volta (varios PVs/oportunidades podem apontar pro mesmo
-- processo licitatorio). Estagio Enviado passa a exigir PV (4 digitos) +
-- temperatura do lead + proximo contato antes de mover o card (gate no
-- handleDrop). Estagio Vencido gera o numero da OP a partir do PV
-- (A/D + PV + . + MMAA) e ganha botao "Vincular a Processo Licitatorio".
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS licitacao_processo_id uuid REFERENCES public.licitacoes(id);
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS numero_pv text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS temperatura text; -- 'quente' | 'morno' | 'frio'

-- Campo Gestor por usuario (Admin > Editar Usuario) -- usado pelo novo
-- ContatoComercialAlertWidget.tsx pra avisar tambem o gestor do vendedor
-- (1 dia antes + no dia do proximo contato agendado), alem do vendedor.
ALTER TABLE public.auth_usuarios ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.auth_usuarios(id);
ALTER TABLE public.oples_reboque_modelos DISABLE ROW LEVEL SECURITY;

-- =============================================================
-- 2026-08-26 · feat: Reformulação do funil Comercial/CRM (Fase 2)
-- =============================================================
-- Ja executado em producao em 2026-08-26. Nova aba "🧾 Quadro Lead" dentro
-- do modal "Abrir" do CrmTab.tsx (so aparece pra funil='venda_direta'),
-- reproduzindo o formulario em papel usado hoje pra cadastro do Lead:
-- cabecalho (data aceite cliente, faturamento ACN/Detech, vendedor,
-- cliente, cliente final, edital, proposta, veiculo, quantidade, local,
-- datas de entrega producao/comercial) + secao de controle (ordem de
-- servico, relatorio fotografico, nao conformidades, desenhos, melhorias,
-- P.O.P, protocolo viagem, controle, data entrada/saida, prazo de
-- garantia). Campos livres (texto/data), sem checklist. "Proposta" e um
-- campo a parte do numero_pv (que so existe depois, no estagio Enviado).
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS cliente_final text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS numero_proposta text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS veiculo_modelo text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS quantidade text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS local_instalacao text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS data_chegada_veiculo date;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS prazo_entrega_producao date;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS prazo_entrega_comercial date;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS data_aceite_cliente date;

ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_ordem_servico text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_relatorio_fotografico text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_nao_conformidades text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_desenhos text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_melhorias text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_pop text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_protocolo_viagem text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_controle text;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_data_entrada date;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_data_saida date;
ALTER TABLE public.crm_oportunidades ADD COLUMN IF NOT EXISTS ctrl_prazo_garantia text DEFAULT '12 MESES';

-- =============================================================
-- 2026-08-27 · feat: lista de 12 ajustes — Fase 1 (ganhos rápidos)
-- =============================================================
-- Ja executado em producao em 2026-08-27. Tipo de formacao extensivel
-- (catalogo, mesmo padrao de oples_reboque_modelos) -- ModalSalvar em
-- FormacaoPrecosTab.tsx troca o <select> hardcoded ('licitacao'|
-- 'venda_direta'|'orcamento') por um alimentado desta tabela + sentinela
-- "Novo tipo...". Valores antigos normalizados pra bater com os novos
-- rotulos do catalogo (nao quebra registros existentes).
CREATE TABLE IF NOT EXISTS formacao_precos_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE formacao_precos_tipos DISABLE ROW LEVEL SECURITY;
INSERT INTO formacao_precos_tipos (nome) VALUES
  ('SAC'), ('Licitação'), ('Venda Direta'), ('Engenharia'), ('Flutuantes'), ('Orçamento')
ON CONFLICT (nome) DO NOTHING;

UPDATE cotacoes_precos SET tipo = 'Licitação'    WHERE tipo = 'licitacao';
UPDATE cotacoes_precos SET tipo = 'Venda Direta' WHERE tipo = 'venda_direta';
UPDATE cotacoes_precos SET tipo = 'Orçamento'    WHERE tipo = 'orcamento';

-- Markup padrao do produto formado: 30 -> 100 (pedido do usuario, mesma
-- decisao do markup global da Formacao de Precos, que tambem passa a
-- iniciar em 100% -- FormacaoPrecosTab.tsx PARAMS_PADRAO/novoItem()).
ALTER TABLE cadastro_produtos ALTER COLUMN markup_pct SET DEFAULT 100;

-- =============================================================
-- 2026-08-27 · feat: lista de 12 ajustes — Fase 4 (Últimas Visualizadas)
-- =============================================================
-- Ja executado em producao em 2026-08-27. Tabela generica de tracking de
-- visualizacao por usuario (tipo 'crm'|'licitacao' + registro_id), upsert
-- em (usuario_id, tipo, registro_id) toda vez que o modal Abrir (CRM) ou
-- o detalhe de uma licitacao e aberto. Nova aba "Ultimas Visualizadas" no
-- CRM e chip de mesmo nome em Licitacoes mostram os 20 mais recentes do
-- usuario logado.
CREATE TABLE IF NOT EXISTS visualizacoes_recentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  tipo text NOT NULL, -- 'crm' | 'licitacao'
  registro_id uuid NOT NULL,
  visualizado_em timestamptz DEFAULT now()
);
ALTER TABLE visualizacoes_recentes DISABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_visualizacoes_recentes_unico ON visualizacoes_recentes(usuario_id, tipo, registro_id);
CREATE INDEX IF NOT EXISTS idx_visualizacoes_recentes_usuario ON visualizacoes_recentes(usuario_id, tipo, visualizado_em DESC);

-- =============================================================
-- 2026-08-27 · feat: lista de 12 ajustes — Fase 7 (Formação de Preços embutida)
-- =============================================================
-- Ja executado em producao em 2026-08-27. cotacoes_precos ja tinha
-- crm_oportunidade_id (sql/cotacoes_vendedor.sql) mas nao tinha vinculo
-- nenhum com licitacoes -- adicionado aqui, simetrico ao que ja existia
-- pro CRM. Usado pela nova aba "💲 Formação de Preços" embutida dentro do
-- modal Abrir (CRM, CrmTab.tsx) e do detalhe de licitação (LicitacoesTab.tsx)
-- -- FormacaoPrecosTab.tsx ganhou as props `vinculo`/`embutido`: quando
-- informadas, roda dentro do modal do processo (sem o navegador de abas/
-- Preços Formados), lista as formações já vinculadas àquele processo, e
-- ao salvar grava o vínculo sozinho (crm_oportunidade_id ou licitacao_id).
-- De quebra, a tabela de itens da Formação de Preços (usada tanto na tela
-- cheia quanto embutida) foi redesenhada pra nunca precisar de rolagem
-- horizontal: só Produto/Marca/Qt/Valor Unit./Valor Total ficam sempre
-- visíveis, o resto (custo, IPI/ST/Markup/DIFAL/Imposto, lucro%) fica num
-- painel expansível por linha (▸/▾).
ALTER TABLE public.cotacoes_precos ADD COLUMN IF NOT EXISTS licitacao_id uuid REFERENCES public.licitacoes(id);

-- =============================================================
-- 2026-08-28 · feat: Fretes — dados completos de transporte, vínculo a
-- processo e fluxo de aprovação por alçada
-- =============================================================
-- Já executado em produção em 2026-08-28. Espelha o padrão de alçadas de
-- Compras (compras_alcadas_aprovacao / pcp_aprovacoes), mas com tabelas
-- próprias de Fretes -- faixas de valor são de escala bem menor, e mexer
-- nas tabelas de Compras (já em produção) seria mais arriscado do que
-- duplicar o padrão já provado.

-- Alçadas de aprovação de Fretes (mesmo formato de compras_alcadas_aprovacao)
CREATE TABLE IF NOT EXISTS fretes_alcadas_aprovacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel integer NOT NULL,
  nome text NOT NULL,
  valor_minimo numeric NOT NULL,
  perfis_aprovadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Pendências de aprovação de Fretes (mesmo formato de pcp_aprovacoes, sem a
-- camada de departamento que só existe em Compras)
CREATE TABLE IF NOT EXISTS pcp_aprovacoes_fretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frete_id uuid NOT NULL REFERENCES pcp_fretes(id),
  nivel integer NOT NULL,
  nivel_nome text NOT NULL,
  valor_no_momento numeric,
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

-- Tabelas novas no Supabase nascem com RLS ligado por padrão; o resto do
-- sistema usa auth_usuarios (não Supabase Auth) e roda com RLS desligado,
-- então sem isto as duas tabelas acima ficariam bloqueadas pra tudo.
ALTER TABLE fretes_alcadas_aprovacao DISABLE ROW LEVEL SECURITY;
ALTER TABLE pcp_aprovacoes_fretes DISABLE ROW LEVEL SECURITY;

-- Dados fiscais/logísticos da cotação de frete
ALTER TABLE pcp_fretes
  ADD COLUMN IF NOT EXISTS cnpj_cpf_pagador text,
  ADD COLUMN IF NOT EXISTS cep_origem text,
  ADD COLUMN IF NOT EXISTS cep_destino text,
  ADD COLUMN IF NOT EXISTS cnpj_cpf_remetente text,
  ADD COLUMN IF NOT EXISTS cnpj_cpf_destinatario text,
  ADD COLUMN IF NOT EXISTS valor_nota numeric,
  ADD COLUMN IF NOT EXISTS quantidade_volumes integer,
  ADD COLUMN IF NOT EXISTS peso_total numeric,
  ADD COLUMN IF NOT EXISTS medida_altura numeric,
  ADD COLUMN IF NOT EXISTS medida_largura numeric,
  ADD COLUMN IF NOT EXISTS medida_comprimento numeric;

-- Vínculo do frete a um processo (OP/OS ou Licitação) -- texto livre continua
-- possível (vinculo_tipo null), usado pro auto-post no "andamento" do
-- processo quando o frete é marcado como Entregue.
ALTER TABLE pcp_fretes
  ADD COLUMN IF NOT EXISTS vinculo_tipo text,   -- null | 'op_os' | 'licitacao'
  ADD COLUMN IF NOT EXISTS vinculo_id uuid,
  ADD COLUMN IF NOT EXISTS vinculo_desc text;

-- 2026-08-28 · Fase 4 reforma cadastro de Licitação: tipo_objeto (Registro de
-- Preços/Contrato, substitui "Objeto Principal" no formulário), julgamento
-- (array, Item/Lote/Global/Grupo, ao lado do Valor), forma_disputa
-- (substitui "Prioridade"). Colunas antigas objeto_principal/prioridade
-- mantidas por compatibilidade com registros já cadastrados.
ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS tipo_objeto text,
  ADD COLUMN IF NOT EXISTS julgamento text[],
  ADD COLUMN IF NOT EXISTS forma_disputa text;

-- 2026-08-28 · Fase 5 reforma menu Licitações: migração de dados de
-- licitacao_documentos das categorias antigas 'custos' e 'impugnacoes' (só
-- as linhas cuja licitacao_id ainda existe — o restante eram órfãos de
-- licitações já excluídas) para as novas categorias por sub-quadro dentro
-- de "Arquivos de Licitação". Sem alteração de schema, só de dados.
-- custos → edital_anexos (8 docs reais migrados)
UPDATE licitacao_documentos d SET categoria='edital_anexos'
WHERE d.categoria='custos' AND EXISTS (SELECT 1 FROM licitacoes l WHERE l.id::text = d.licitacao_id::text);
-- impugnacoes → impugnacao / impugnacao_decisao / esclarecimento /
-- esclarecimento_resposta, inferido do padrão de nome de arquivo já usado
-- pelo usuário (12 docs reais migrados, licitação PE 90011.2026)
UPDATE licitacao_documentos d SET categoria =
  CASE
    WHEN d.nome ILIKE '%resposta%esclarecimento%' THEN 'esclarecimento_resposta'
    WHEN d.nome ILIKE '%esclarecimento%' THEN 'esclarecimento'
    WHEN d.nome ILIKE '%impugna%' THEN 'impugnacao'
    WHEN d.nome ILIKE '%resposta%' THEN 'impugnacao_decisao'
    ELSE d.categoria
  END
WHERE d.categoria='impugnacoes' AND EXISTS (SELECT 1 FROM licitacoes l WHERE l.id::text = d.licitacao_id::text);

-- 2026-08-28 · Fase 6 — vínculo N:N de Formação de Preços. Tabela de junção
-- permite uma formação atender vários processos (CRM/Licitação) ao mesmo
-- tempo, sem apagar vínculos existentes ao adicionar um novo. Colunas
-- escalares antigas (crm_oportunidade_id/licitacao_id em cotacoes_precos)
-- mantidas por compatibilidade com CotacoesTab.tsx. Nenhum dado real
-- existente pra migrar (0 de 3 formações tinham algum vínculo até agora).
CREATE TABLE IF NOT EXISTS cotacoes_precos_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('crm','licitacao')),
  processo_id uuid NOT NULL,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(cotacao_id, tipo, processo_id)
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_precos_vinculos_processo ON cotacoes_precos_vinculos(tipo, processo_id);
ALTER TABLE cotacoes_precos_vinculos DISABLE ROW LEVEL SECURITY;
INSERT INTO cotacoes_precos_vinculos (cotacao_id, tipo, processo_id)
SELECT id, 'crm', crm_oportunidade_id FROM cotacoes_precos WHERE crm_oportunidade_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO cotacoes_precos_vinculos (cotacao_id, tipo, processo_id)
SELECT id, 'licitacao', licitacao_id FROM cotacoes_precos WHERE licitacao_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2026-08-28 · Fase 7 — hierarquia de Centro de Custo (parent_id, ex:
-- FLUTUANTE > PIER > ILHA) + FK real em pcp_pedidos_compra
-- (centro_custo_id), substituindo aos poucos o texto livre (centro_custo,
-- mantido por compatibilidade). Migração best-effort dos dados de texto
-- existentes, casando pelo código antes do " — " (3 de 4 valores distintos
-- casaram; "TESTE DO SISTEMA" não tem código, ficou sem FK, texto intacto).
ALTER TABLE centros_custo
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE pcp_pedidos_compra
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES centros_custo(id) ON DELETE SET NULL;
UPDATE pcp_pedidos_compra p SET centro_custo_id = c.id
FROM centros_custo c
WHERE p.centro_custo IS NOT NULL AND p.centro_custo_id IS NULL
  AND upper(trim(split_part(p.centro_custo, '—', 1))) = c.codigo;

-- 2026-08-28 · Fase 7 (continuação) — mesma FK de centro de custo também em
-- demandas_setoriais (modal "Concluir Compra" em SetorDemandaTab.tsx grava
-- centro de custo ali, não só em pcp_pedidos_compra).
ALTER TABLE demandas_setoriais
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES centros_custo(id) ON DELETE SET NULL;

-- 2026-08-28 · Fase 8 — lançamento manual de despesa avulsa por Centro de
-- Custo, sem precisar de um pedido de compra formal.
CREATE TABLE IF NOT EXISTS centro_custo_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_custo_id uuid NOT NULL REFERENCES centros_custo(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  descricao text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  criado_por text,
  criado_por_nome text,
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_centro_custo_despesas_centro ON centro_custo_despesas(centro_custo_id);
ALTER TABLE centro_custo_despesas DISABLE ROW LEVEL SECURITY;

-- 2026-08-29 · Adaptação (SAC Veicular) — mesmo suporte a modo de execução
-- (individual/dupla/equipe) que a Produção de OPL já tinha, espelhando as
-- colunas equivalentes de `oples`. Antes só existia técnico único
-- (tecnico_responsavel/tecnico_producao_id), sem opção de atribuir uma
-- equipe pré-cadastrada (producao_equipes) nem um 2º técnico (head+auxiliar).
ALTER TABLE sac_ordens_servico
  ADD COLUMN IF NOT EXISTS modo_execucao text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS tecnico_producao_2_id uuid REFERENCES rh_funcionarios(id),
  ADD COLUMN IF NOT EXISTS tecnico_producao_2_nome text,
  ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES producao_equipes(id),
  ADD COLUMN IF NOT EXISTS equipe_nome text;

-- 2026-08-29 · Liberação parcial de BOM p/ Serralheria (Engenharia → PCP).
-- Trilha PARALELA ao status_geral normal — Engenharia pode antecipar a
-- parte metálica/estrutural pra Serralheria sem esperar terminar o resto
-- do BOM, e continua liberando o saldo do BOM pro PCP como sempre (as duas
-- ações não se sobrescrevem, cada uma mexe numa coluna diferente).
-- Usa demandas_setoriais (tipo_solicitacao='liberacao_parcial_bom') como
-- transporte — é a tabela/tela que a Serralheria de fato usa
-- (SetorDemandaTab.tsx, roteado em DashboardTab.tsx). pcp_pedidos_serralheria
-- (com colunas próprias tipo status_serralheria) e SerralheriaTab.tsx nunca
-- foram usados de verdade: SerralheriaTab.tsx não está no roteamento
-- (código morto) e nada gravava na tabela (PedidoChicotesSerralheria.tsx
-- também é órfão, nem importado em lugar nenhum, e grava na tabela errada
-- mesmo assim). Deixamos o RLS de pcp_pedidos_serralheria desabilitado (fix
-- de passagem, consistente com o resto do banco) mas não a usamos aqui.
ALTER TABLE pcp_pedidos_serralheria DISABLE ROW LEVEL SECURITY;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS serralheria_status text;
COMMENT ON COLUMN oples.serralheria_status IS 'Trilha paralela ao status_geral p/ liberação parcial de BOM à Serralheria: null | Pendente | Concluido | Sanado. Não interfere no fluxo normal Engenharia->PCP.';

-- 2026-08-29 · Painel "📦 Aguardando Recebimento" na Logística In/Out
-- (LogisticaTab.tsx) — sem DDL nova. pcp_pedidos_compra já tinha as colunas
-- numero_nf / data_recebimento_real / quantidade_recebida / tem_divergencia
-- desde sempre, mas nenhuma tela gravava nelas (mais um caso do padrão de
-- "campo morto" já visto nesta sessão, agora em coluna em vez de componente).
-- Passam a ser preenchidas quando a Logística recebe um pedido com
-- status_compra='Comprado': sem divergência fecha pra 'Concluído' e libera
-- pcp_pedidos_faturamento (mesmo gate que já existia no fluxo antigo de
-- "+ Novo Registro"); com divergência mantém 'Comprado' e abre uma demanda
-- em demandas_setoriais (tipo_solicitacao='divergencia_recebimento',
-- setor_destino='Compras') pro comprador resolver, mesmo padrão usado por
-- criarDemandaComprasFinalizada (ComprasTab.tsx) e pela liberação parcial de
-- Serralheria acima.

-- 2026-08-30 · Chat — Fases 2-5 (grupos, negrito/prévia, anexos, compartilhar
-- processo). chat_salas/chat_mensagens já existiam (Fase 1 só removeu os
-- canais fixos e corrigiu o bug do bullet permanente, sem migração de schema).
ALTER TABLE chat_salas ADD COLUMN IF NOT EXISTS criado_por text;
ALTER TABLE chat_salas ADD COLUMN IF NOT EXISTS criado_por_nome text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS anexo_url text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS anexo_nome text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS anexo_tipo text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS ref_contexto text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS ref_contexto_id text;
ALTER TABLE chat_mensagens ADD COLUMN IF NOT EXISTS ref_desc text;
COMMENT ON COLUMN chat_salas.criado_por IS 'Fase 2 -- id do usuario que criou o grupo (admin do grupo).';
COMMENT ON COLUMN chat_mensagens.ref_contexto IS 'Fase 5 -- mesmo valor de "contexto" usado em mencoes/acn:abrir-registro (ex: op, licitacao, crm) para abrir o registro compartilhado direto no processo.';

-- Descoberta de passagem: CrmTab.tsx e LicitacoesTab.tsx nunca tinham o
-- listener window.__acnDeepLink/acn:abrir-registro (6 de 8 arquivos já
-- tinham, de um trabalho anterior; estes 2 ficaram de fora) -- sem eles, o
-- "Abrir →" de uma mensagem compartilhada no chat cairia só na aba genérica,
-- sem abrir o registro certo. Adicionado o mesmo padrão dos outros 6.

-- 2026-08-30 · Comissões — backfill de auxiliares fixos das 3 "Head Line"
-- (sem migração de schema, só dados em responsaveis_producao). Usuário
-- informou os pares Tiago->Celio, Junior->Natan, Jonatan->Ronald (1
-- auxiliar por head line, confirmado via AskUserQuestion depois de uma
-- inconsistência no pedido original). Cada auxiliar recebe papel='apoio'
-- em TODAS as OPs onde o respectivo head line já está como
-- papel='responsavel' (passadas, em produção e faturadas -- pedido
-- explícito do usuário foi "as atuais em produção, finalizadas e
-- faturas"), respeitando o cálculo já existente do código (apoio sempre
-- 0,1% fixo de valor_mao_de_obra, independente do percentual_comissao
-- individual cadastrado em rh_funcionarios -- ver RHTab.tsx ComissoesRH).
-- 51 linhas inseridas: CELIO 21, NATAN ESPINDOLA 14, RONALD 16 (todas em
-- `oples`; nenhuma OS encontrada para esses 3 head lines).
--
-- NÃO altera nada para daqui pra frente: a lista "membros" de
-- producao_equipes existe na tela "Gerenciar Equipes" mas NÃO é lida pelo
-- código que inicia produção (iniciarProducao em ProducaoTab.tsx só semeia
-- tecnico_producao_id/tecnico_producao_2_id) -- então isso foi só um
-- backfill pontual nos dados existentes, não um vínculo permanente. Se
-- quiser que isso passe a ser automático em toda OP nova do head line,
-- precisa de uma mudança de código separada (usuário optou por não fazer
-- isso agora).

-- 2026-08-30 · Acesso restrito só a "Comissões de Técnicos" (Admin > Usuários)
ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS permissoes_rh text[] DEFAULT '{}'::text[];
-- Mesmo padrão de permissoes_crm: array de flags, hoje só 'comissoes_tecnicos'.
-- Usuário sem a aba "rh" completa em abas_permitidas, mas com
-- permissoes_rh @> '{comissoes_tecnicos}', ganha um item de menu dedicado
-- "💰 Comissões" (só essa seção, sem colaboradores/autorizações/etc. do RH)
-- — ver isVisible()/SIDEBAR_GROUPS em DashboardTab.tsx,
-- ComissoesTecnicosStandalone (export novo) em RHTab.tsx, e o bloco
-- "RH — Acesso Restrito" no modal de editar usuário em AdminTab.tsx.
-- Testado ao vivo com usuário descartável (abas_permitidas: ['dashboard'],
-- permissoes_rh: ['comissoes_tecnicos']): via sidebar só aparecem
-- "Dashboard" e "💰 Comissões"; a tela mostra só o painel de comissões,
-- cálculo bate igual ao de um usuário com RH completo. Usuário de teste
-- removido depois.

-- 2026-08-31 · KPIs de tempo decorrido — horário comercial (Seg-Sex 8h-17:45)
-- Sem alteração de schema (nenhuma coluna nova). Documentando aqui só porque
-- os dados HISTÓRICOS de tempo_X_horas foram recalculados via UPDATE em
-- massa (ver abaixo) -- não é uma migração de estrutura, mas mexeu em dados.
--
-- Causa: EngenhariaTab/PCPTab/ProducaoTab/FiscalTab/QualidadeTab calculavam
-- "tempo_X_horas" com (new Date() - inicio)/3600000 -- diferença de calendário
-- crua, sem pausar fora do expediente (noites/fins de semana contavam como
-- tempo de produção/análise/etc.). Outras telas (Chicotes/Serralheria/
-- Laboratório/Compras/Almoxarifado/Telecom, via SetorDemandaTab.tsx +
-- AcnTabShared.tsx) já pausavam corretamente, só com o limite errado
-- (17:30 em vez de 17:45).
--
-- Fix de código: nova função compartilhada src/utils/horasUteis.ts (Seg-Sex
-- 08:00–17:45), usada agora em EngenhariaTab/PCPTab/ProducaoTab/FiscalTab/
-- QualidadeTab (que antes não pausavam) e reaproveitada por
-- SetorDemandaTab.tsx/AcnTabShared.tsx (que corrige o limite 17:30→17:45).
--
-- Recalculo retroativo dos tempos já gravados (usando as datas de início/fim
-- de cada etapa ainda salvas no registro), via função temporária
-- horas_uteis_calc() no banco (criada, usada em 6 UPDATEs, e removida
-- depois -- não faz parte do schema permanente):
--   oples.tempo_engenharia_horas  ← horas_uteis(data_inicio_engenharia, data_liberacao_bom)   -- 158 registros
--   oples.tempo_pcp_horas         ← horas_uteis(data_liberacao_bom, data_liberacao_pcp)         -- 158 registros
--   oples.tempo_producao_horas    ← horas_uteis(data_inicio_producao, data_conclusao_producao)  -- 98 registros
--   oples.tempo_qualidade_horas   ← horas_uteis(data_entrada_cq, data_cq)                        -- 97 registros
--   oples.tempo_fiscal_horas      ← horas_uteis(data_liberacao_comercial, data_emissao_nf)        -- 2 registros
--   sac_ordens_servico.tempo_fiscal_horas    ← horas_uteis(data_cq, data_emissao_nf)               -- 0 registros (nenhum ainda)
--   sac_ordens_servico.kpi_execucao_horas    ← horas_uteis(data_inicio_manutencao, data_conclusao_manutencao) -- 0 registros (nenhum ainda)
-- A função SQL foi verificada contra o algoritmo JS (mesmos resultados até
-- a 10ª casa decimal, timezone America/Sao_Paulo) antes de rodar os UPDATEs.
--
-- tempo_retrabalho_horas (oples) e tempo_execucao_horas histórico de
-- demandas_setoriais (limite 17:30→17:45) NÃO foram recalculados
-- retroativamente: o primeiro não tem coluna de "fim" preservada por
-- registro; o segundo já pausava corretamente antes, a diferença é só
-- 15min/dia — impacto marginal, fica pra um follow-up se algum dia importar.

-- 2026-09-01 · Botão de pausa manual (Engenharia em análise + Produção/Retrabalho)
ALTER TABLE oples ADD COLUMN IF NOT EXISTS pausado boolean DEFAULT false;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_pausa timestamptz;
ALTER TABLE oples ADD COLUMN IF NOT EXISTS tempo_pausado_horas numeric DEFAULT 0;
COMMENT ON COLUMN oples.pausado IS 'Pausa manual da etapa ativa (Engenharia em análise, Produção, ou Retrabalho -- só uma por vez). Resetado a false no início/fim de cada etapa.';
COMMENT ON COLUMN oples.data_pausa IS 'Instante em que a pausa manual atual começou (null se não pausado).';
COMMENT ON COLUMN oples.tempo_pausado_horas IS 'Soma das horas úteis já pausadas manualmente na etapa ativa -- subtraída do tempo_X_horas final ao concluir a etapa.';
--
-- Pedido do usuário ("botão de pausa nas tarefas depois de inicializadas,
-- sumiu... na verdade em todas as abas que tem hoje iniciar e concluir que
-- conta tempo precisamos do botao de pausar"). Investigado: Produção/
-- Adaptação nunca teve botão de pausa (cronômetro cru, sempre correndo,
-- sem opção de pausar) -- era o mesmo bug de fundo já corrigido no cálculo
-- final (2026-08-31), só que sem UI de pausa manual nem exclusão ao vivo.
-- PCP/Fiscal/Qualidade não têm "Iniciar" manual (entram na fila
-- automaticamente), então ficaram fora do escopo por não se encaixarem no
-- padrão "Iniciar → Concluir" que o usuário descreveu.
--
-- Novo src/PausaWidget.tsx: hook useTempoUtil() (cronômetro em horas úteis,
-- já descontando pausa manual — "fora do expediente" já vem de graça, já
-- que horasUteis() não soma essas horas) + <BotaoPausar>/<BadgeForaExpediente>
-- + helpers pausarOpl()/retomarOpl(). Usado em EngenhariaTab.tsx (Em Analise
-- Engenharia) e ProducaoTab.tsx (Em Producao + Em Retrabalho) -- todos os
-- pontos de conclusão (liberarBOM, liberarBomLote, liberarChecklist,
-- concluirRetrabalho) já subtraem tempo_pausado_horas do tempo final e
-- resetam pausado/data_pausa/tempo_pausado_horas pra próxima etapa.
-- Testado ao vivo em ambas as telas: pausar mostra "⏸ HH:MM:SS" e troca
-- pro botão "▶ Retomar"; retomar acumula tempo_pausado_horas corretamente
-- e limpa pausado/data_pausa. Dados de teste revertidos (tempo_pausado_horas
-- de volta a 0 nos 2 registros reais usados no teste).

-- 2026-09-01 · Formação de Preços — versionamento + log de alterações + senha
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho';
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS finalizada_por text;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS finalizada_por_nome text;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS finalizada_em timestamptz;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS versao integer DEFAULT 1;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS versao_raiz_id uuid REFERENCES cotacoes_precos(id);
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS vencedora boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS cotacoes_precos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  usuario_id uuid,
  usuario_nome text NOT NULL,
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_precos_log_cotacao ON cotacoes_precos_log(cotacao_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_precos_versao_raiz ON cotacoes_precos(versao_raiz_id);
-- IMPORTANTE: tabelas novas no Supabase nascem com RLS habilitado (sem
-- nenhuma policy = bloqueia tudo). Todo o resto do app roda com RLS
-- desabilitado (auth customizada via auth_usuarios, sem sessão real do
-- Supabase Auth) -- descoberto ao vivo (INSERT silenciosamente bloqueado,
-- "42501 row violates row-level security policy"), corrigido abaixo.
ALTER TABLE cotacoes_precos_log DISABLE ROW LEVEL SECURITY;

-- Pedido do usuário: depois de finalizada a 1ª etapa, mudanças de custo/
-- markup/remoção de item viram log (rastreabilidade); marcar versões e
-- navegar entre elas; registrar como final exige senha do usuário +
-- grava o nome de quem autorizou.
--
-- Fluxo: "🔒 Registrar Versão Final" (toolbar) abre modal de senha
-- (confere contra auth_usuarios.senha, mesmo padrão texto-plano do login).
-- 1ª vez: marca a própria linha (status='finalizada', versao=1,
-- finalizada_por_nome=usuário, finalizada_em=agora). Da 2ª vez em diante
-- (já finalizada e editada de novo): cria uma NOVA linha em
-- cotacoes_precos (versao_raiz_id aponta pra v1), preservando a anterior
-- intacta -- passa a editar a nova. A partir do momento 'finalizada',
-- setItem()/remItem() (FormacaoPrecosTab.tsx) gravam automaticamente em
-- cotacoes_precos_log qualquer alteração de custo_unit/markup_pct/remoção
-- de item. "🏆 Marcar Vencedora" marca qual versão do grupo venceu o
-- pregão/licitação (desmarca as demais). "📜 Histórico" lista todas as
-- versões do grupo (com responsável/data/vencedora, botão pra abrir
-- qualquer uma) + o log cronológico completo.
--
-- Testado ao vivo: senha errada bloqueia corretamente; senha certa
-- finaliza v1; editar custo (50→75) e remover item pós-finalização geram
-- entradas no log; "Registrar Nova Versão Final" cria v2 com
-- versao_raiz_id=v1.id; "Marcar Vencedora" grava e aparece no histórico.
-- Dados de teste removidos (cascade apagou os logs junto).
