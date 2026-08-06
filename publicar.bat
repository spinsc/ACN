@echo off
cd /d "%~dp0"
echo =============================================
echo  ACN Sinal Verde - Publicar atualizacoes
echo =============================================

:: Remove locks se existirem
if exist ".git\index.lock" del /f ".git\index.lock"
if exist ".git\refs\heads\main.lock" del /f ".git\refs\heads\main.lock"

:: Instalar dependencias novas (plugin legacy para iOS antigo)
echo Instalando dependencias...
call npm install

:: Limpar staging corrompido
echo Limpando staging...
git reset HEAD

:: Adicionar arquivos alterados
echo Adicionando arquivos...
git add src/SacTab.tsx
git add src/AdminTab.tsx
git add src/ProducaoTab.tsx
git add src/DemandaAvulsaPanel.tsx
git add src/DashboardTab.tsx
git add src/AcnTabShared.tsx
git add src/ComercialTab.tsx
git add src/CrmTab.tsx
git add src/LicitacoesTab.tsx
git add src/ContactosSection.tsx
git add src/CrmAnexosWidget.tsx
git add vite.config.ts
git add package.json
git add package-lock.json
git add src/EngenhariaTab.tsx
git add src/PCPTab.tsx
git add src/AlmoxarifadoTab.tsx
git add src/QualidadeTab.tsx
git add src/FiscalTab.tsx
git add src/ClienteUtils.tsx
git add src/ClientesTab.tsx
git add src/WhatsAppConexoesWidget.tsx
git add src/ClientesTab.tsx
git add src/ClienteUtils.tsx
git add src/RHTab.tsx
git add src/ColaboradorSelect.tsx
git add src/AlmoxarifadoTab.tsx
git add src/FiscalTab.tsx
git add src/ChicotesTab.tsx
git add src/ComprasTab.tsx
git add src/LogisticaTab.tsx
git add src/DemandaAvulsaPanel.tsx
git add src/EngenhariaTab.tsx
git add src/SetorDemandaTab.tsx
git add src/AcnTabShared.tsx
git add src/DemandaAvulsaPanel.tsx
git add public/logo.png
git add public/motorola.png
git add src/AnaliseWidget.tsx
git add src/LoginTab.tsx
git add src/AnaliseInboxPanel.tsx
git add src/MencoesInboxPanel.tsx
git add src/MencaoTextarea.tsx
git add acn_fix_mencoes.sql
git add acn_acompanhamentos.sql
git add src/OplAcompModal.tsx
git add src/AcnTabShared.tsx
git add src/ProducaoTab.tsx
git add src/SacTab.tsx
git add src/ComercialTab.tsx
git add src/ChatWidget.tsx
git add src/ProducaoTab.tsx
git add src/AcnTabShared.tsx
git add supabase/sql/producao_equipes.sql
git add supabase/sql/centro_custo.sql
git add src/ComprasTab.tsx
git add src/RelatoriosTab.tsx
git add src/ProducaoTab.tsx
git add Manual_ACN_Sinal_Verde.docx
git add Manual_ACN_Sinal_Verde.pdf
git add ACN_Sinal_Verde_Treinamento.pptx
git add src/WhatsAppConexoesWidget.tsx
git add src/OplAnexosWidget.tsx
git add src/LicitacoesTab.tsx
git add src/ComercialTab.tsx
git add src/CrmTab.tsx
git add supabase/functions/whatsapp-admin/index.ts
git add supabase/functions/whatsapp-webhook/index.ts
git add supabase/functions/transcrever-audio/index.ts
git add supabase/sql/
:: Novos arquivos desta release
git add src/FormacaoPrecosTab.tsx
git add src/ContatoAlertWidget.tsx
git add acn_novas_colunas.sql
git add avisos_sistema.sql
git add src/AvisoSistemaWidget.tsx
git add src/RHTab.tsx
git add publicar.bat
:: feat: Telecom link→licitacao + AnaliseStatusPanel finalizavel + log
:: fix: CRM salvarOportunidade — erro de RLS/insert agora exibe alerta
git add src/AnaliseWidget.tsx
git add src/SetorDemandaTab.tsx
git add src/DashboardTab.tsx
git add src/LicitacoesTab.tsx
git add src/CrmTab.tsx
git add acn_fix_crm_rls.sql
git add index.html
git add vite.config.ts
git add src/supabaseClient.ts
git add src/main.tsx
git add sql/licitacoes_melhorias.sql
git add sql/crm_melhorias.sql
git add sql/unificacao_comercial_crm.sql
git add src/NovaOpOsModal.tsx
:: fix: silent polling — sem flash de tela a cada 30s
git add src/EngenhariaTab.tsx
git add src/PCPTab.tsx
git add src/QualidadeTab.tsx
git add src/SerralheriaTab.tsx
git add src/ProducaoTab.tsx
git add src/SetorDemandaTab.tsx
git add src/MarketingTab.tsx
git add src/ComercialTab.tsx
git add src/ChatWidget.tsx
:: feat: OplDetalheModal completo + serviço de terceiro na OP + tipos SAC dinâmicos
git add src/AcnTabShared.tsx
git add src/NovaOpOsModal.tsx
git add src/SacTab.tsx
git add sql/servico_terceiro.sql
git add sql/sac_tipos_servico.sql
:: feat: campo resumo dos servicos na OP e OS
git add src/AcnTabShared.tsx
git add src/NovaOpOsModal.tsx
git add src/SacTab.tsx
git add sql/resumo_servicos.sql
:: fix: telecom em TODAS_ABAS + fluxo comercial corrigido
git add src/AdminTab.tsx
git add src/ComercialTab.tsx
git add sql/fluxo_comercial.sql
:: feat: multi-servico-terceiro; documentos na OP desde registro; resumo_servicos CRM
git add src/NovaOpOsModal.tsx
git add src/AcnTabShared.tsx
git add src/CrmTab.tsx
:: feat: botao LIBERAR PARA FISCAL em todos os tabs via OplDetalheModal
git add src/EngenhariaTab.tsx
git add src/PCPTab.tsx
git add src/QualidadeTab.tsx
git add src/FiscalTab.tsx
git add src/AlmoxarifadoTab.tsx
:: feat: LinkOpl + BuscaOplInput + seriais FiscalTab + ChatWidget UX
git add src/AcnTabShared.tsx
git add src/AlmoxarifadoTab.tsx
git add src/PCPTab.tsx
git add src/EngenhariaTab.tsx
git add src/QualidadeTab.tsx
git add src/FiscalTab.tsx
git add src/ChatWidget.tsx
:: feat: ChatWidget canais completos + CRM Relatorio cards Perdidas e Ganhas
git add src/ChatWidget.tsx
git add src/CrmTab.tsx
:: fix: ComercialTab botoes acao visiveis (sticky) + botoes em secoes Aprovado CQ e Faturado
:: fix: MencoesInboxPanel busca por id OU nome (fallback para usuario recriado)
:: fix: FormacaoPrecosTab edicao por linha preservando usar-globais + botao copiar globais
:: feat: LinkOpl como link clicavel em TODAS as abas (ProducaoTab, Serralheria, Chicotes, Marketing, CrmTab, ComercialTab)
:: feat: LinkOpl aceita string (busca no banco) alem do objeto completo
git add src/ComercialTab.tsx
git add src/MencoesInboxPanel.tsx
git add src/FormacaoPrecosTab.tsx
git add src/AcnTabShared.tsx
git add src/ProducaoTab.tsx
git add src/SerralheriaTab.tsx
git add src/ChicotesTab.tsx
git add src/MarketingTab.tsx

:: feat: FormacaoPrecosTab — OP/OS autocomplete + desconto maximo + PDF + aba Precos Formados
git add src/FormacaoPrecosTab.tsx
git add package.json
git add package-lock.json

:: Verificar
echo.
echo Arquivos no commit:
git diff --cached --name-only

:: Tasks #41-45: drag-reorder kanban, badge ACN/Detech, relatorio financeiro, Telecom links
git add src/CrmTab.tsx
git add src/AnaliseWidget.tsx
git add acn_fix_crm_campos_4144.sql
git add acn_fix_crm_rls.sql
git add src/AdminTab.tsx
git add src/FormacaoPrecosTab.tsx

:: feat: busca global + highlight + sub-status Técnica/Documental/Orçamentária + chat badge fix + pin avisos arrastável + analise area livre
git add src/DashboardTab.tsx
git add src/CrmTab.tsx
git add src/AnaliseWidget.tsx
git add src/ChatWidget.tsx
git add src/AvisoSistemaWidget.tsx

:: IMPORTANTE: rodar acn_fix_crm_rls.sql e acn_fix_crm_campos_4144.sql no Supabase SQL Editor!

:: feat: Cadastro de Itens + Cadastro de Produtos (BOM) + migração de cotacoes
git add src/CadastroItensTab.tsx
git add src/CadastroProdutosTab.tsx
git add src/DashboardTab.tsx
git add sql/cadastro_itens.sql
git add sql/cadastro_produtos.sql
git add sql/migrar_itens_cotacoes.sql

git commit -m "feat: Cadastro de Itens e Produtos com BOM — catalogo base + migracao de cotacoes"

:: feat: FormacaoPrecosTab — autocomplete de catálogo de itens e produtos com BOM
git add src/FormacaoPrecosTab.tsx
git commit -m "feat: FormacaoPrecosTab autocomplete catalogo — busca itens+produtos, expandir BOM, criar novo"

:: fix: FormacaoPrecosTab — tabela de itens expandida com inputs maiores (11px, padding 6px)
git add src/FormacaoPrecosTab.tsx
git commit -m "fix: FormacaoPrecosTab tabela itens maior — inputs 11px, padding 6px, colunas alargadas"

:: feat: FormacaoPrecosTab — tabela de itens redimensionável (arrastar borda inferior)
git add src/FormacaoPrecosTab.tsx
git commit -m "feat: FormacaoPrecosTab tabela redimensionavel — arrastar borda + header sticky"

:: feat: FormacaoPrecosTab — botão Editar em Preços Formados (UPDATE em vez de INSERT)
git add src/FormacaoPrecosTab.tsx
git commit -m "feat: FormacaoPrecosTab botao Editar — carrega cotacao no form e salva como UPDATE"

:: feat: Cotações para Vendedores — aba cotações, painel admin, aba no card CRM
git add src/CotacoesTab.tsx
git add src/AdminTab.tsx
git add src/CrmTab.tsx
git add src/DashboardTab.tsx
git add sql/cotacoes_vendedor.sql
git commit -m "feat: Cotações para Vendedores — aba cotacoes + config admin + aba no card CRM + aprovacoes"

:: fix: CotacoesTab — slider desconto limitado ao maxDesc + remover custo/markup do modal proposta
git add src/CotacoesTab.tsx
git commit -m "fix: CotacoesTab — slider desconto limitado ao maxDesc configurado + ocultar custo/markup da modal de proposta"

:: feat: CotacoesTab — tabs Todas/Avulsas + visibilidade respeita config para todos os perfis
git add src/CotacoesTab.tsx
git add src/CrmTab.tsx
git commit -m "feat: CotacoesTab — aba Avulsas (sem vinculo CRM) + visibilidade config-driven para todos os perfis"

:: feat: Modulo NFC — Dossie Veicular Digital
git add src/VeiculosNfcTab.tsx
git add src/SacTab.tsx
git add src/AdminTab.tsx
git add src/DashboardTab.tsx
git add public/veiculo.html
git add sql/veiculos_nfc.sql
git commit -m "feat: Modulo NFC Dossie Veicular — pagina publica standalone + gestao interna + chamados SAC + config admin"

:: feat: NFC — OPL Autocomplete + Modal Gravar Tag
git add src/VeiculosNfcTab.tsx
git commit -m "feat: NFC — autocomplete OP/OS no cadastro do veiculo + modal Gravar Tag NFC (Web NFC API + NFC Tools)"

:: feat: Portal do Cliente por token
git add src/VeiculosNfcTab.tsx
git add src/AdminTab.tsx
git add public/portal.html
git add sql/portal_cliente.sql
git commit -m "feat: Portal do Cliente — pagina standalone por token unico, chamados, acompanhamento e manual por veiculo"

:: feat: Migrar Pipeline CRM Licitacoes para LicitacoesTab + remover do CrmTab
git add src/LicitacoesTab.tsx
git add src/CrmTab.tsx
git commit -m "feat: Pipeline CRM Licitacoes migrado para LicitacoesTab — aba Processos preservada + aba Pipeline CRM com kanban"

:: Push
echo.
echo Enviando para GitHub...
git push origin main

echo.
echo =============================================
if %ERRORLEVEL%==0 (
  echo  SUCESSO! Deploy em ~2 min. Atualize o site.
) else (
  echo  ERRO no push. Verifique as credenciais.
)
echo =============================================

echo.
echo =============================================
echo  SQLS NECESSARIOS - RODAR NO SUPABASE:
echo =============================================
echo.
echo [NOVO] Seriais de equipamentos - RODAR NO SUPABASE:
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS seriais_equipamentos text;
echo.
echo [NOVO] sql/fluxo_comercial.sql - RODAR NO SUPABASE:
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_liberacao_comercial timestamptz;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS cliente_recebeu_nome text;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_entrega timestamptz;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS tipos_servico_terceiro jsonb DEFAULT '[]'::jsonb;
echo.
echo [NOVO] acn_novas_colunas.sql - EXECUTE NO SUPABASE SQL EDITOR:
echo  - ALTER TABLE oples ADD COLUMN valor_mao_de_obra_serralheria numeric(12,2)
echo  - ALTER TABLE sac_ordens_servico ADD COLUMN horas_cobradas_cotacao numeric(8,2)
echo  - CREATE TABLE licitacao_documentos (...)
echo.
echo LEMBRETE - Rodar no Supabase (em ordem):
echo.
echo -- [NOVO] Módulo de Análise de Licitações/CRM - RODAR NO SUPABASE:
echo CREATE TABLE IF NOT EXISTS analise_solicitacoes (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   origem text NOT NULL,
echo   origem_id uuid NOT NULL,
echo   origem_titulo text,
echo   origem_numero text,
echo   setores jsonb DEFAULT '[]'::jsonb,
echo   status text DEFAULT 'em_andamento',
echo   criado_por text,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE analise_solicitacoes DISABLE ROW LEVEL SECURITY;
echo.
echo CREATE TABLE IF NOT EXISTS analise_setores (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   solicitacao_id uuid REFERENCES analise_solicitacoes(id) ON DELETE CASCADE,
echo   setor text NOT NULL,
echo   status text DEFAULT 'pendente',
echo   analisado_por text,
echo   analisado_em timestamptz,
echo   notas text,
echo   UNIQUE(solicitacao_id, setor)
echo );
echo ALTER TABLE analise_setores DISABLE ROW LEVEL SECURITY;
echo.
echo CREATE TABLE IF NOT EXISTS analise_anexos (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   solicitacao_id uuid REFERENCES analise_solicitacoes(id) ON DELETE CASCADE,
echo   setor text,
echo   nome text NOT NULL,
echo   url text NOT NULL,
echo   criado_por text,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE analise_anexos DISABLE ROW LEVEL SECURITY;
echo.
echo -- (bucket acn-media ja existe — nenhuma acao extra no Storage)
echo.
echo -- [NOVO] Tabela de Perfis do Sistema (Painel de Perfis no Admin):
echo CREATE TABLE IF NOT EXISTS admin_perfis_sistema (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   nome text NOT NULL UNIQUE,
echo   descricao text,
echo   abas_permitidas jsonb DEFAULT '[]'::jsonb,
echo   pode_autorizar_rh boolean DEFAULT false,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE admin_perfis_sistema DISABLE ROW LEVEL SECURITY;
echo.
echo -- (depois de criar a tabela, vá em Admin > Perfis e clique em "Importar Perfis Padrão")
echo.
echo -- [NOVO] CRM Historico - coluna texto para observacoes de andamento:
echo ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS texto text;
echo ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();
echo.
echo -- [NOVO] Módulo de Comissões - rodar no Supabase:
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_id uuid REFERENCES rh_funcionarios(id);
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS valor_total numeric;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS valor_mao_de_obra numeric;
echo.
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS tecnico_producao_id uuid REFERENCES rh_funcionarios(id);
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS valor_total numeric;
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS valor_mao_de_obra numeric;
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS data_faturamento date;
echo.
echo CREATE TABLE IF NOT EXISTS rh_comissoes_fechamento (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   mes integer NOT NULL,
echo   ano integer NOT NULL,
echo   tecnico_id uuid REFERENCES rh_funcionarios(id),
echo   tecnico_nome text,
echo   incide_em text,
echo   percentual numeric,
echo   total_base numeric,
echo   total_comissao numeric,
echo   qtd_ops integer DEFAULT 0,
echo   qtd_oss integer DEFAULT 0,
echo   detalhes jsonb DEFAULT '[]'::jsonb,
echo   status text DEFAULT 'pendente',
echo   aprovado_por text,
echo   aprovado_em timestamptz,
echo   criado_em timestamptz DEFAULT now(),
echo   UNIQUE(mes, ano, tecnico_id)
echo );
echo ALTER TABLE rh_comissoes_fechamento DISABLE ROW LEVEL SECURITY;
echo.
echo -- [NOVO] Novos campos OP + Tabela Mencoes - RODAR NO SUPABASE:
echo -- Arquivo: supabase/sql/mencoes_e_op_campos.sql
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_aceite_cliente date;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS faturamento_empresa text DEFAULT 'ACN';
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS vendedor text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS cliente_final text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS edital text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS proposta text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS veiculo text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS local_instalacao text;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS data_chegada_veiculo date;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS prazo_entrega_producao date;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS prazo_entrega_comercial date;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS composicao_comercial jsonb DEFAULT '[]'::jsonb;
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS observacoes_atencao text;
echo.
echo ==============================================
echo  ACOMPANHAMENTOS OP/OS - RODAR NO SUPABASE (se ainda nao rodou):
echo  Arquivo: acn_acompanhamentos.sql
echo  CREATE TABLE op_acompanhamentos (id uuid PK, referencia_id text, referencia_tipo text, setor text, texto text, usuario_id text, usuario_nome text, criado_em timestamptz)
echo ==============================================
echo.
echo -- [IMPORTANTE] Mencoes com IDs como TEXT (correcao de tipo):
echo -- RODAR: acn_fix_mencoes.sql  (faz DROP + CREATE com mencionado_id text)
echo -- Isso corrige o problema de mencoes nao aparecerem no inbox.
echo.
echo LEMBRETE - Demais SQLs:
echo.
echo -- Vouchers (tabela nova):
echo CREATE TABLE IF NOT EXISTS vouchers_servico (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   tipo_servico text, numero_pvop text, data_servico date,
echo   prestador text, autorizado_por text, criado_por text,
echo   itens_voucher jsonb, valor_total numeric,
echo   criado_em timestamptz DEFAULT now()
echo );
echo -- Se tabela ja existir, adicionar colunas:
echo ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS itens_voucher jsonb;
echo ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS valor_total numeric;
echo.
echo -- Cadastro de tipos de servico:
echo CREATE TABLE IF NOT EXISTS tipos_servico_voucher (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   nome text NOT NULL UNIQUE,
echo   criado_em timestamptz DEFAULT now()
echo );
echo.
echo -- LIXEIRA (restauracao de registros deletados por ate 24h):
echo CREATE TABLE IF NOT EXISTS lixeira (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   tabela text NOT NULL,
echo   registro_id text NOT NULL,
echo   dados jsonb NOT NULL,
echo   deletado_por text,
echo   deletado_em timestamptz DEFAULT now(),
echo   restaurado boolean DEFAULT false,
echo   restaurado_em timestamptz,
echo   restaurado_por text
echo );
echo -- Desabilitar RLS na lixeira (se necessario):
echo ALTER TABLE lixeira DISABLE ROW LEVEL SECURITY;
echo.
echo -- Cadastro de Colaboradores (novas colunas):
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS tipo_colaborador text DEFAULT 'Funcionário';
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS salario numeric;
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS valor_servicos numeric;
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS recebe_comissao boolean DEFAULT false;
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS percentual_comissao numeric;
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS incide_em text;
echo ALTER TABLE rh_funcionarios ADD COLUMN IF NOT EXISTS cnpj text;
echo.
echo -- Novo fluxo manutencao: coluna tecnico e data:
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS tecnico_responsavel text;
echo ALTER TABLE sac_ordens_servico ADD COLUMN IF NOT EXISTS data_inicio_manutencao timestamptz;
echo -- (data_inicio_manutencao pode ja existir - ignore erro se existir)
echo.
echo -- CADASTRO DE CLIENTES (tabela nova):
echo CREATE TABLE IF NOT EXISTS clientes (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   nome text NOT NULL,
echo   tipo text DEFAULT 'PF',
echo   documento text,
echo   nome_contato text,
echo   cargo_contato text,
echo   empresa text,
echo   telefones jsonb DEFAULT '[]'::jsonb,
echo   emails jsonb DEFAULT '[]'::jsonb,
echo   endereco text, numero text, complemento text,
echo   bairro text, cidade text, estado text, cep text,
echo   observacoes text,
echo   criado_em timestamptz DEFAULT now(),
echo   atualizado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;
echo.
echo ==============================================
echo  [CRITICO] FIX CRM RLS — RODAR AGORA NO SUPABASE (acn_fix_crm_rls.sql):
echo  ALTER TABLE crm_oportunidades       DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE crm_estagios_funil      DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE crm_historico           DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE crm_checklist_itens     DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE crm_checklist_progresso DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE crm_vendas              DISABLE ROW LEVEL SECURITY;
echo  (Sem isso, inserts no CRM falham silenciosamente sem mostrar erro)
echo ==============================================
echo.
echo ==============================================
echo  CRM - SQL JA EXECUTADO NO SUPABASE:
echo  crm_estagios_funil, crm_oportunidades,
echo  crm_checklist_itens, crm_checklist_progresso,
echo  crm_vendas, crm_historico,
echo  VIEW rh_comissoes, TRIGGER tg_crm_audit_estagio
echo  ALTER auth_usuarios ADD permissoes_crm text[]
echo ==============================================
echo.
echo ==============================================
echo  CRM ANEXOS - RODAR NO SUPABASE (se ainda nao rodou):
echo  Arquivo: supabase/sql/crm_anexos.sql
echo  Tabela: crm_anexos (usa bucket acn-media existente)
echo  Caminho Storage: crm-anexos/{oportunidade_id}/{ts}_{nome}
echo ==============================================
echo.
echo ==============================================
echo  CLIENTES PF-PJ - RODAR NO SUPABASE (se ainda nao rodou):
echo  Arquivo: supabase/sql/clientes_pj_pf_link.sql
echo  ALTER TABLE clientes ADD COLUMN empresa_id uuid REFERENCES clientes(id)
echo ==============================================
echo.
echo ==============================================
echo  CRM DESISTENCIA - RODAR NO SUPABASE (se ainda nao rodou):
echo  Arquivo: supabase/sql/crm_desistencia.sql
echo  1. ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS motivo_desistencia text;
echo  2. INSERT estagio "Desistencia" em crm_estagios_funil (licitacao + venda_direta)
echo ==============================================
echo.
echo ==============================================
echo  PRODUCAO EQUIPES - RODAR NO SUPABASE (arquivo: supabase/sql/producao_equipes.sql):
echo  CREATE TABLE IF NOT EXISTS producao_equipes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, head_line_id uuid, head_line_nome text NOT NULL, membros jsonb DEFAULT '[]'::jsonb, ativa boolean DEFAULT true, criado_em timestamptz DEFAULT now());
echo  ALTER TABLE producao_equipes DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS modo_execucao text DEFAULT 'individual';
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_2_id uuid;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS tecnico_producao_2_nome text;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS equipe_id uuid;
echo  ALTER TABLE oples ADD COLUMN IF NOT EXISTS equipe_nome text;
echo ==============================================
echo.
echo ==============================================
echo  CENTRO DE CUSTO - RODAR NO SUPABASE (arquivo: supabase/sql/centro_custo.sql):
echo  CREATE TABLE IF NOT EXISTS centros_custo (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE, nome text NOT NULL, descricao text, ativo boolean DEFAULT true, criado_em timestamptz DEFAULT now());
echo  ALTER TABLE centros_custo DISABLE ROW LEVEL SECURITY;
echo  ALTER TABLE pcp_pedidos_compra ADD COLUMN IF NOT EXISTS centro_custo text;
echo ==============================================
echo.
echo ==============================================
echo  CRM CONTATO/PROX CONTATO - RODAR NO SUPABASE:
echo  ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS nome_contato text;
echo  ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS contato text;
echo  ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS prox_contato date;
echo ==============================================
echo.
echo ==============================================
echo  CRM CONTATOS - RODAR NO SUPABASE:
echo  Arquivo: supabase/sql/crm_contatos.sql
echo  Tabelas: crm_contatos, crm_interacoes, crm_whatsapp_msgs
echo  Coluna: clientes.foco_id
echo  Storage: criar bucket "crm-audios" (privado) manualmente
echo ==============================================
echo.
echo ==============================================
echo  EDGE FUNCTION WHISPER - DEPLOY:
echo  supabase functions deploy transcrever-audio
echo  Secret: OPENAI_API_KEY = sk-...
echo  (Supabase ^> Settings ^> Edge Functions ^> Secrets)
echo ==============================================
echo.
echo ==============================================
echo  NOVOS SQLs DESTA RELEASE - RODAR NO SUPABASE:
echo ==============================================
echo.
echo -- [1] Permissao de visualizacao de valores financeiros:
echo ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS ver_valores boolean DEFAULT true;
echo.
echo -- [2] Coluna tipos_servico_terceiro na tabela oples (se ainda nao rodou):
echo ALTER TABLE oples ADD COLUMN IF NOT EXISTS tipos_servico_terceiro jsonb DEFAULT '[]'::jsonb;
echo.
echo -- [4] Hora do proximo contato no CRM (alerta 15 min):
echo ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS hora_prox_contato time;
echo.
echo -- [5] Kanban 5 colunas + hora sessao licitacao:
echo ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS sub_status text DEFAULT 'andamento';
echo ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS empresa_vencedora text;
echo ALTER TABLE crm_oportunidades ADD COLUMN IF NOT EXISTS hora_sessao time;
echo.
echo -- [6] Estagio "Finalizada" no CRM (rodar para cada funil usado):
echo INSERT INTO crm_estagios_funil (nome, funil, is_final, cor, ordem) VALUES
echo   ('Finalizada', 'licitacao',   true, '#0f766e', 99),
echo   ('Finalizada', 'venda_direta',true, '#0f766e', 99)
echo ON CONFLICT DO NOTHING;
echo.
echo -- [3] Tabela de cotacoes/modelos de formacao de precos:
echo CREATE TABLE IF NOT EXISTS cotacoes_precos (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   nome text NOT NULL,
echo   tipo text DEFAULT 'licitacao',
echo   empresa text DEFAULT 'ACN',
echo   plataforma_id uuid,
echo   parametros_globais jsonb DEFAULT '{}',
echo   itens jsonb DEFAULT '[]',
echo   criado_por text,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE cotacoes_precos DISABLE ROW LEVEL SECURITY;
echo -- Adicionar colunas novas se tabela ja existir:
echo ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS empresa text DEFAULT 'ACN';
echo ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS plataforma_id uuid;
echo.
echo -- [NOVO] Canais do chat (Licitacoes e demais departamentos):
echo INSERT INTO public.chat_salas (tipo, nome, membros) VALUES
echo   ('canal', 'Geral',        '[]'::jsonb),
echo   ('canal', 'Comercial',    '[]'::jsonb),
echo   ('canal', 'Licitacoes',   '[]'::jsonb),
echo   ('canal', 'CRM',          '[]'::jsonb),
echo   ('canal', 'Engenharia',   '[]'::jsonb),
echo   ('canal', 'PCP',          '[]'::jsonb),
echo   ('canal', 'Almoxarifado', '[]'::jsonb),
echo   ('canal', 'Producao',     '[]'::jsonb),
echo   ('canal', 'Serralheria',  '[]'::jsonb),
echo   ('canal', 'Chicotes',     '[]'::jsonb),
echo   ('canal', 'Laboratorio',  '[]'::jsonb),
echo   ('canal', 'Qualidade',    '[]'::jsonb),
echo   ('canal', 'Logistica',    '[]'::jsonb),
echo   ('canal', 'Fiscal',       '[]'::jsonb),
echo   ('canal', 'Compras',      '[]'::jsonb),
echo   ('canal', 'RH',           '[]'::jsonb),
echo   ('canal', 'SAC',          '[]'::jsonb),
echo   ('canal', 'Marketing',    '[]'::jsonb),
echo   ('canal', 'Telecom',      '[]'::jsonb)
echo ON CONFLICT DO NOTHING;
echo.
echo -- [NOVO] Tabela de logs de analise (Task #40):
echo CREATE TABLE IF NOT EXISTS analise_logs (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   solicitacao_id uuid REFERENCES analise_solicitacoes(id) ON DELETE SET NULL,
echo   setor_id uuid REFERENCES analise_setores(id) ON DELETE SET NULL,
echo   setor text,
echo   origem text,
echo   origem_titulo text,
echo   origem_numero text,
echo   acao text NOT NULL,
echo   usuario text,
echo   notas text,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE analise_logs DISABLE ROW LEVEL SECURITY;
echo.
echo -- [NOVO] FormacaoPrecosTab - colunas na cotacoes_precos + tabela propostas:
echo ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS opl_id uuid;
echo ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS opl_numero text;
echo ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS desconto_maximo_pct numeric DEFAULT 0;
echo.
echo CREATE TABLE IF NOT EXISTS cotacoes_propostas (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   cotacao_id uuid REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
echo   cotacao_nome text,
echo   opl_numero text,
echo   desconto_pct numeric DEFAULT 0,
echo   valor_total numeric,
echo   valor_com_desconto numeric,
echo   criado_por text,
echo   criado_em timestamptz DEFAULT now(),
echo   observacoes text
echo );
echo ALTER TABLE cotacoes_propostas DISABLE ROW LEVEL SECURITY;
echo.
echo -- [NOVO] Plataformas de licitacao (NEO, QFrotas, Prime...):
echo CREATE TABLE IF NOT EXISTS plataformas_licitacao (
echo   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo   nome text NOT NULL,
echo   desconto_pct numeric DEFAULT 0,
echo   retencao_pct numeric DEFAULT 0,
echo   ativo boolean DEFAULT true,
echo   criado_em timestamptz DEFAULT now()
echo );
echo ALTER TABLE plataformas_licitacao DISABLE ROW LEVEL SECURITY;
echo -- Inserir plataformas padrao (ignorar se ja existirem):
echo INSERT INTO plataformas_licitacao (nome, desconto_pct, retencao_pct) VALUES
echo   ('NEO', 0, 0), ('QFrotas', 0, 0), ('Prime', 0, 0)
echo ON CONFLICT DO NOTHING;
echo.
echo ==============================================
echo  [NOVO] COTAÇÕES PARA VENDEDORES - RODAR NO SUPABASE (arquivo: sql/cotacoes_vendedor.sql):
echo.
echo  1. Novas colunas em cotacoes_precos:
echo     ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho';
echo     ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS numero_cotacao text;
echo     ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS crm_oportunidade_id uuid;
echo.
echo  2. Sequencia e trigger para numero_cotacao automatico: COT-AAAA-NNNN
echo     CREATE SEQUENCE IF NOT EXISTS cotacao_seq START 1;
echo     (ver sql/cotacoes_vendedor.sql para trigger completo)
echo.
echo  3. Tabela cotacoes_aprovacoes (fluxo de aprovação de descontos)
echo  4. Tabela configuracoes_sistema (toggles de visibilidade para admin)
echo.
echo  IMPORTANTE: Rodar sql/cotacoes_vendedor.sql COMPLETO no Supabase SQL Editor
echo ==============================================
echo.
echo ==============================================
echo  [NOVO] CADASTRO DE PRODUTOS (BOM) - RODAR NO SUPABASE (arquivo: sql/cadastro_produtos.sql):
echo  CREATE TABLE cadastro_produtos (...) + CREATE TABLE cadastro_produtos_itens (...) + trigger
echo  (rodar DEPOIS do cadastro_itens.sql)
echo.
echo  [MIGRACAO] ITENS DAS COTACOES → CATALOGO - RODAR NO SUPABASE (arquivo: sql/migrar_itens_cotacoes.sql):
echo  Extrai itens únicos de cotacoes_precos.itens e insere em cadastro_itens
echo  (rodar DEPOIS do cadastro_itens.sql)
echo.
echo  [NOVO] CADASTRO DE ITENS - RODAR NO SUPABASE (arquivo: sql/cadastro_itens.sql):
echo  CREATE TABLE IF NOT EXISTS cadastro_itens (
echo    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
echo    codigo text, nome text NOT NULL, descricao text, unidade text DEFAULT 'UN',
echo    categoria text, ncm text, marca text DEFAULT '', fornecedor text DEFAULT '',
echo    moeda text DEFAULT 'REAL', custo_unit numeric DEFAULT 0,
echo    ipi_pct numeric DEFAULT 0, st_pct numeric DEFAULT 0,
echo    difal_pct numeric DEFAULT 16, imposto_pct numeric DEFAULT 16,
echo    markup_pct numeric DEFAULT 30, custo_fixo_pct numeric DEFAULT 3,
echo    ativo boolean DEFAULT true, criado_por text,
echo    criado_em timestamptz DEFAULT now(), atualizado_em timestamptz DEFAULT now()
echo  );
echo  ALTER TABLE cadastro_itens DISABLE ROW LEVEL SECURITY;
echo ==============================================
echo.
echo ==============================================
echo  WHATSAPP (EVOLUTION API) - PASSOS:
echo.
echo  1. RODAR SQL (se ainda nao rodou):
echo     supabase/sql/crm_whatsapp_instancias.sql
echo.
echo  2. DEPLOY DAS EDGE FUNCTIONS:
echo     supabase functions deploy whatsapp-webhook
echo     supabase functions deploy whatsapp-admin
echo.
echo  3. CONFIGURAR NO SISTEMA:
echo     CRM ^> Contatos ^> botao "Configuracoes WhatsApp"
echo     Informar URL e API Key da Evolution API
echo     Adicionar vendedores e escanear QR Code
echo.
echo  4. CONFIGURAR WEBHOOK NA EVOLUTION API:
echo     (o sistema configura automaticamente ao criar instancia)
echo     URL: {SUPABASE_URL}/functions/v1/whatsapp-webhook
echo     Eventos: MESSAGES_UPSERT, CONNECTION_UPDATE
echo ==============================================
echo.
pause
