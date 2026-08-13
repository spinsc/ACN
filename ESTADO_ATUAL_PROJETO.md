# ESTADO ATUAL DO PROJETO — ACN Sinal Verde
> Handoff gerado em 2026-08-10. Colar no início da próxima conversa.

---

## 1. VISÃO GERAL

**Projeto:** ACN Sinal Verde — sistema interno web de gestão industrial (produção, licitações, comercial, SAC, financeiro, NFC, etc.)

**Stack:**
- React 19.2.7 + TypeScript + Vite
- Supabase (backend/banco/storage) — projeto: `qgemelnuqdilnggxmrdw`
- GitHub Pages (deploy estático)
- Sem framework de testes — validação manual + `npx tsc --noEmit`

**Repositório:** `https://github.com/spinsc/ACN.git`
- Branch principal: `main`
- Base URL GitHub Pages: `/ACN/`
- URL pública: `https://spinsc.github.io/ACN/`

**Supabase:**
- URL hardcoded: `https://qgemelnuqdilnggxmrdw.supabase.co`
- Anon key hardcoded: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k`
- Storage bucket: `acn-media` (público, usado para fotos de produtos, PDFs de catálogo, anexos de licitação)
- Auth: tabela customizada `auth_usuarios` — NUNCA usar `supabase.auth.*`

**Deploy:** executar `publicar.bat` na raiz do projeto (faz build Vite, copia para `/docs`, commit, push).

---

## 2. ESTADO ATUAL DETALHADO — TAREFAS CONCLUÍDAS

### Sessões anteriores (commitadas até `a06bdf6`)

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Flash de tela (reboot) — silent polling em todos os tabs | ✅ commitado |
| 2 | OplDetalheModal melhorado + serviço de terceiro na OP | ✅ |
| 3 | SAC: cadastro dinâmico de tipos de serviço | ✅ |
| 4–7 | Campo `resumo_servicos` (SQL + NovaOpOsModal + OplDetalheModal + PrintOS) | ✅ |
| 8 | publicar.bat atualizado | ✅ |
| 9–10 | Editar responsável OP (em retrabalho) e OS | ✅ |
| 11 | Telecom em TODAS_ABAS (AdminTab) | ✅ |
| 12 | Multi-serviço de terceiro: checkboxes + `tipos_servico_terceiro` jsonb | ✅ |
| 13 | Botão "LIBERAR PARA FISCAL" no OplDetalheModal | ✅ |
| 14–15 | Documentos + OplAnexosWidget na aba Adaptação | ✅ |
| 16–17 | Fix payload tipos_servico_terceiro + campo valor serralheria | ✅ |
| 18 | Permissão `ver_valores` + mascaramento `***` | ✅ |
| 19 | FormacaoPrecosTab.tsx criado | ✅ |
| 20 | Relatório de status de licitações | ✅ |
| 21 | Relatório de comissionamento de vendedores | ✅ |
| 24 | Hora da sessão no lançamento de licitação (CrmTab) | ✅ |
| 25 | Multi-upload de arquivos em todo o sistema | ✅ |
| 26 | Kanban CRM: 5 colunas (Aberto/Vencidas/Perdidas/Desistências/Finalizadas) | ✅ |
| 27 | FormacaoPrecosTab: visão restrita por perfil + plataformas + desconto | ✅ |
| 28 | SQL: `cotacoes_precos` + `plataformas_licitacao` | ✅ |
| 29 | AdminTab: CRUD de Plataformas | ✅ |
| 30 | FormacaoPrecosTab: seleção de plataforma + visão Vendedor | ✅ |
| 31 | Kanban: data de abertura no card + campos Desistência/Perdida | ✅ |
| 32/35/36 | Campo OPL como link "Ver" em todo o sistema | ✅ |
| 33 | ChatWidget.tsx melhorado | ✅ |
| 34 | Arquivo de contexto do projeto para migração de conta | ✅ |
| 37 | Campo de seriais antes de emitir NF | ✅ |
| 38 | Custo DIFAL exibido na Formação de Preços | ✅ |
| 39 | FormacaoPrecosTab: OP/OS autocomplete + desconto máximo + PDF + aba Vendedor | ✅ |
| 40 | Telecom: link para licitação + AnaliseStatusPanel finalizável + log | ✅ |
| 41 | SQL: colunas `posicao` + `valor_acn` em `crm_oportunidades` | ✅ |
| 42 | Kanban: drag-to-reorder dentro da mesma coluna | ✅ |
| 43 | Kanban: badge visual ACN vs Detech nos cards + form | ✅ |
| 44 | Relatório financeiro: separar receita ACN vs parceiro | ✅ |
| 45 | AnaliseWidget: título da demanda Telecom como link clicável | ✅ |
| 46–48 | `cadastro_itens`: SQL + CadastroItensTab + DashboardTab + publicar.bat | ✅ |
| 49 | SQL migração `cotacoes_precos` → `cadastro_itens` | ✅ |
| 50–51 | CadastroProdutosTab (BOM) + DashboardTab + publicar.bat | ✅ |
| 52 | Autocomplete de catálogo no FormacaoPrecosTab | ✅ |
| 53–57 | CotacoesTab completo + config admin + aba CRM + aprovações + DashboardTab | ✅ |
| 58–61 | Portal do cliente por token NFC + VeiculosNfcTab + publicar.bat | ✅ |
| 68 | Renomear "Produto" → "Produto e Mercadorias" + CODITEM/CODPRODUTO | ✅ |
| 69 | FormacaoPrecosTab: markup global sem impostos | ✅ |
| 70 | CotacoesTab: visão simplificada + multi-formação por proposta | ✅ |
| 71 | Proposta final ao cliente — PDF + HTML | ✅ |
| 72 | Documento: sugestões avançadas de uso TAG NFC na produção | ✅ |

### Sessão atual — FEITO MAS NÃO COMMITADO (git status: M/A)

| # | Tarefa | Arquivo(s) | Observação |
|---|--------|------------|------------|
| 73 | LicitacoesTab: Pipeline CRM removido, só Processos | `src/LicitacoesTab.tsx` | ✅ código pronto, não deployado |
| 74 | NFC garantia: config por produto + cálculo por data de entrega | `src/VeiculosNfcTab.tsx`, `src/CadastroProdutosTab.tsx` | ✅ código pronto |
| 75 | Padronizar OP/OS: formato `PPPP.YYММ` + desmembramento `/01`, `/02` | `src/NovaOpOsModal.tsx`, `src/EngenhariaTab.tsx`, `src/SacTab.tsx` | ✅ |
| 76 | AgendaWidget: alertas visuais Licitações / Engenharia / Comercial / SAC | `src/AgendaWidget.tsx` (NEW), `src/LicitacoesTab.tsx`, `src/EngenhariaTab.tsx`, `src/SacTab.tsx`, `src/ComercialTab.tsx` | ✅ |
| 77 | useUnread: destaque visual de atualizações não lidas | `src/useUnread.tsx` (NEW), `src/LicitacoesTab.tsx` | ✅ |
| 78 | CotacoesTab: novo fluxo (Nova Cotação → Orçamento → Proposta + email/WhatsApp) | `src/CotacoesTab.tsx` | ✅ |
| 79 | CadastroProdutosTab: fotos + catálogo PDF por produto | `src/CadastroProdutosTab.tsx` | ✅ |
| 80 | FinanceiroTab: centro de custos com indicadores de compras | `src/FinanceiroTab.tsx` (NEW), `src/DashboardTab.tsx` | ✅ |
| 81 | publicar.bat atualizado + SQLs gerados | `publicar.bat`, `sql/migrations.sql`, `sql/agenda_compromissos.sql`, `sql/registro_leituras.sql` | ✅ |
| 82 | SQL de migração Pipeline CRM → licitacoes | `sql/migrate_pipeline.sql` (untracked) | ✅ pronto para executar |
| 83 | CrmTab: removido suporte ao funil licitacao (VAZIO_OP, opsFunil, form) | `src/CrmTab.tsx` | ✅ |
| — | CrmTab: `contatosHoje` restrito ao usuário atual + só venda_direta | `src/CrmTab.tsx` linha 289 | ✅ código feito, aguarda deploy para confirmar |

---

## 3. AJUSTES INICIADOS E NÃO TERMINADOS

### 3.1 "Contatos Agendados Para Hoje" ainda visível no CRM (⚠️ parcial)
- **O que foi feito:** `contatosHoje` em `CrmTab.tsx` linha 289 agora filtra por `o.funil === 'venda_direta' && o.responsavel_nome === currentUser?.nome`.
- **O que falta:** Verificar após deploy se o filtro por `responsavel_nome` funciona corretamente (o campo é string de nome, não email — pode haver problema de case ou espaço). Alternativa mais robusta: adicionar campo `responsavel_email` na query e filtrar por `currentUser?.email`.
- **Onde parou:** código feito, não deployado.

### 3.2 Calendário/Agenda estilo Google Calendar — NÃO IMPLEMENTADO
- **O que foi pedido:** Calendário visual por usuário (mensal/semanal), similar ao Google Calendar, para os usuários do sistema.
- **O que existe hoje:** `AgendaWidget` (lista simples de compromissos por setor, restrita ao usuário). Não é um calendário visual.
- **O que falta:** Criar componente `CalendarioTab.tsx` ou `AgendaTab.tsx` com:
  - View mensal e semanal (grade de dias/horas)
  - Compromissos de `agenda_compromissos` + `prox_contato` de `crm_oportunidades`
  - Filtro por setor/usuário
  - Criar/editar/concluir compromissos direto no calendário
  - Adicionar ao sidebar do DashboardTab

### 3.3 SQL de migração do Pipeline (Passo 2 pendente)
- **O que foi feito:** `sql/migrate_pipeline.sql` Passo 1 (INSERT) foi executado. ⚠️ CONFIRMAR se foi executado com sucesso.
- **O que falta:** Verificar os dados migrados na tabela `licitacoes`, então executar o Passo 2 (DELETE comentado no arquivo) para apagar `crm_oportunidades WHERE funil='licitacao'`.

### 3.4 Deploy (publicar.bat não rodado)
- **Todos os arquivos das tasks #73–#83 estão uncommitted.** Nenhuma mudança desta sessão está em produção (GitHub Pages).
- **O que falta:** executar `publicar.bat` na raiz do projeto após rodar os SQLs no Supabase.

---

## 4. PENDÊNCIAS E DECISÕES EM ABERTO

| Item | Descrição | Prioridade |
|------|-----------|-----------|
| #22 | Fix: modal de licitação e OP/OS não fecha ao clicar no backdrop (overlay click) | Média |
| #23 | Alerta de contato agendado CRM — 2 dias antes e 15 min antes (push/email/badge) | Baixa |
| Calendário | Agenda visual estilo Google Calendar para todos os usuários | Alta (próxima sessão) |
| CRM contacts | `contatosHoje` usa `responsavel_nome` (string) — verificar se filtra corretamente ou migrar para filtro por email | Alta |
| Passo 2 SQL | Deletar `crm_oportunidades WHERE funil='licitacao'` após verificar migração | Alta |
| Storage | Confirmar bucket `acn-media` como público no Supabase Dashboard | Alta (se não feito) |

---

## 5. PRÓXIMOS PASSOS IMEDIATOS (em ordem)

1. **Rodar `sql/migrations.sql`** no Supabase SQL Editor (contém todos os ALTER TABLE / CREATE TABLE das tasks #74–#80).
2. **Verificar `sql/migrate_pipeline.sql`** — confirmar se Passo 1 (INSERT) foi executado. Se não, executar agora. Verificar os dados migrados. Depois executar Passo 2 (DELETE).
3. **Rodar `publicar.bat`** para deployar todas as mudanças locais para GitHub Pages.
4. **Testar `contatosHoje`** no CRM após deploy — verificar se filtra corretamente por usuário. Se não funcionar, trocar filtro por `responsavel_nome` para `responsavel_email` (requer adicionar campo no banco ou usar nome+email na query).
5. **Implementar CalendarioTab** (agenda visual mensal/semanal) — item de maior demanda pendente.
6. Corrigir backdrop dos modais (#22).
7. Implementar alertas temporais CRM (#23).

---

## 6. FEATURES PÓS-DEPLOY (backlog combinado)

- **Calendário/Agenda visual** (Google Calendar-like) — próxima sessão
- **Alerta de contato CRM temporalizado** — 2 dias antes + 15 min antes (task #23)
- **Fix backdrop modal** — clicar fora fecha (task #22)
- **CotacoesTab**: possível integração com catálogo de produtos para preencher itens automaticamente
- **FinanceiroTab**: gráfico de linha por mês (atualmente só barra CSS) — possível Chart.js
- **WhatsApp Evolution API**: edge functions e webhook já mencionados no publicar.bat — configurar instância
- **App mobile** (React Native ou PWA) — mencionado em sessões anteriores como pós-deploy
- **Relatórios PDF exportáveis** para mais abas (hoje só FormacaoPrecosTab e Proposta ao Cliente têm PDF)
- **Dashboard de KPIs** com dados reais (DashboardKPIS.tsx existe mas ⚠️ CONFIRMAR se está wired)

---

## 7. GOTCHAS E DECISÕES TÉCNICAS (mais importante — só existe nesta conversa)

### 7.1 Autenticação customizada
```
CRÍTICO: O app usa tabela auth_usuarios, NÃO o Supabase Auth.
supabase.auth.getSession() SEMPRE retorna null.
Nunca usar supabase.auth.*, signIn, signOut etc.
Login é feito via query na tabela auth_usuarios verificando email+senha.
currentUser vem de useState carregado do localStorage.
```

### 7.2 Supabase hardcoded — NUNCA usar import.meta.env
```typescript
// CERTO — em src/supabaseClient.ts:
export const supabase = createClient(
  'https://qgemelnuqdilnggxmrdw.supabase.co',
  'eyJhbGci...' // anon key completa hardcoded
);
// ERRADO: import.meta.env.VITE_SUPABASE_URL — NÃO EXISTE
```

### 7.3 // @ts-nocheck obrigatório
Todos os arquivos `.tsx` de componentes começam com `// @ts-nocheck` na linha 1. Nunca remover. Isso permite `any` implícito e evita erros de tipo no TypeScript.

### 7.4 criado_por = email (não ID)
```typescript
criado_por: currentUser?.email,  // CERTO
criado_por: currentUser?.id,     // ERRADO — auth_usuarios não tem campo id como chave de negócio
```

### 7.5 Edit tool e o caractere em-dash (—)
O caractere `—` (U+2014, em dash) é armazenado como bytes UTF-8 `M-bM-^@M-^T`. O Edit tool falha ao tentar fazer match de strings que contêm `—`. **Solução:** usar Python inline via bash para substituições que envolvam esse caractere:
```bash
python3 << 'PYEOF'
with open('src/Arquivo.tsx','r',encoding='utf-8') as f: content = f.read()
content = content.replace('string com —', 'nova string')
with open('src/Arquivo.tsx','w',encoding='utf-8') as f: f.write(content)
PYEOF
```

### 7.6 Formato OP/OS
- Formato: `PPPP.YYММ` — exemplo: `1212.2608` (pedido 1212, agosto de 2026)
- Sufixo por veículo: `/01`, `/02` etc. para desmembramento
- Máscara implementada em `NovaOpOsModal.tsx`

### 7.7 UUID pré-gerado para produtos novos
Permite upload de fotos ANTES de salvar o produto no banco:
```typescript
const [produtoIdLocal] = useState<string>(() => produto?.id || crypto.randomUUID());
// No save: payload.id = produtoIdLocal (para inserts)
// Upload path: acn-media/produtos/{produtoIdLocal}/fotos/{timestamp}.{ext}
```

### 7.8 Storage bucket acn-media
- Bucket público — arquivos acessíveis via URL pública sem auth
- Estrutura de paths:
  - Licitações: `licitacoes/{licitacaoId}/{tipo}/{timestamp}_{nome}`
  - Produtos — fotos: `produtos/{produtoId}/fotos/{timestamp}.{ext}`
  - Produtos — catálogo: `produtos/{produtoId}/catalogo/catalogo.{ext}` (upsert=true)

### 7.9 RLS desabilitado em todas as tabelas novas
Padrão do projeto: `ALTER TABLE nova_tabela DISABLE ROW LEVEL SECURITY;` — sempre incluir ao criar tabelas.

### 7.10 AgendaWidget vs contatosHoje no CrmTab — dois sistemas distintos
- **AgendaWidget** (`src/AgendaWidget.tsx`): widget de compromissos por setor, usa tabela `agenda_compromissos`, já filtrado por `usuario_email` do currentUser. Usado em: LicitacoesTab, EngenhariaTab, SacTab, ComercialTab.
- **contatosHoje** em `CrmTab.tsx`: alerta de contatos agendados para hoje extraído do campo `prox_contato` de `crm_oportunidades`. Filtrado por `funil='venda_direta'` e `responsavel_nome === currentUser?.nome`. **NÃO usa AgendaWidget.**
- Os dois sistemas são independentes. CrmTab NÃO tem AgendaWidget.

### 7.11 CrmTab após migração Pipeline
- `VAZIO_OP.funil` agora hardcoded como `'venda_direta'`
- `opsFunil` e `estagiosFunil` filtram sempre por `'venda_direta'`
- Campos de licitação removidos do formulário (numero_edital, orgao, data_sessao, hora_sessao)
- Registros antigos com `funil='licitacao'` ainda existem em `crm_oportunidades` até o Passo 2 do `migrate_pipeline.sql` ser executado
- Após o Passo 2, não haverá mais registros `funil='licitacao'` no CRM

### 7.12 Perfis e permissões
- Perfis: `Admin`, `Gerente`, `Gerente Comercial`, `Vendedor`, `Analista`, + setoriais
- Controle de abas: `abas_permitidas` jsonb em `auth_usuarios`
- Permissões CRM: `permissoes_crm` array — ex: `['totais_vendas', 'painel_faturamentos', 'relatorio_vendedores']`
- Admin sempre tem acesso a tudo: `currentUser?.perfil === 'Admin'`
- Ver valores financeiros: `currentUser?.ver_valores !== false`

### 7.13 Tabelas principais do projeto
| Tabela | Uso |
|--------|-----|
| `auth_usuarios` | Autenticação customizada |
| `licitacoes` | Processos licitatórios |
| `crm_oportunidades` | Vendas diretas CRM (funil='venda_direta' após migração) |
| `crm_estagios_funil` | Estágios do kanban CRM |
| `oples` | Ordens de Produção e Ordens de Serviço |
| `cadastro_produtos` | Catálogo de produtos com BOM (Bill of Materials) |
| `cadastro_produtos_itens` | Itens do BOM por produto |
| `cadastro_itens` | Itens/componentes base |
| `cotacoes_precos` | Cotações de vendedores |
| `cotacoes_propostas` | Propostas geradas de cotações |
| `centros_custo` | Centros de custo (Financeiro) |
| `pcp_pedidos_compra` | Pedidos de compra com centro_custo |
| `agenda_compromissos` | Compromissos por setor/usuário (AgendaWidget) |
| `registro_leituras` | Rastreamento de leituras (useUnread) |
| `veiculos_nfc` | Dossiê NFC veicular + portal_token |
| `configuracoes_sistema` | Config global (jsonb) |
| `lixeira` | Soft-delete de registros |

### 7.14 Deploy via publicar.bat
```bat
:: Processo:
npm run build          :: gera dist/
xcopy dist\* docs\ /E  :: copia para /docs (GitHub Pages serve de /docs)
git add -A
git commit -m "feat: ..."
git push
:: GitHub Actions processa em ~2 min → live em spinsc.github.io/ACN/
```

### 7.15 ComercialTab.tsx vs CrmTab.tsx
- `CrmTab.tsx` é o tab "Comercial/CRM" no sidebar (id: 'crm')
- `ComercialTab.tsx` existe mas **não está roteado no DashboardTab** — arquivo legado/paralelo
- `AgendaWidget` em `ComercialTab.tsx` usa `setor="comercial"` — funciona, mas o tab não aparece no sidebar

### 7.16 SQLs desta sessão ainda não rodados
Antes de qualquer deploy, rodar no Supabase SQL Editor (na ordem):
1. `sql/migrations.sql` — ALTER TABLE/CREATE TABLE para tasks #74-#80
2. `sql/migrate_pipeline.sql` Passo 1 — migrar licitações do CRM
3. Verificar dados migrados
4. `sql/migrate_pipeline.sql` Passo 2 (descomentar DELETE) — limpar CRM

---

## 8. ARQUIVOS-CHAVE

| Arquivo | Descrição |
|---------|-----------|
| `src/DashboardTab.tsx` | Shell principal: sidebar, roteamento de tabs, auth, CSS global |
| `src/supabaseClient.ts` | Cliente Supabase com URL e anon key hardcoded |
| `src/CrmTab.tsx` | Comercial/CRM — kanban venda direta, faturamentos, OPLs |
| `src/LicitacoesTab.tsx` | Licitações — lista, filtros, modal detalhado, relatório |
| `src/CotacoesTab.tsx` | Cotações de vendedores — fluxo Nova Cotação→Orçamento→Proposta |
| `src/FormacaoPrecosTab.tsx` | Formação de Preços — BOM + markup + PDF |
| `src/CadastroProdutosTab.tsx` | CRUD de Produtos com BOM, fotos e catálogo PDF |
| `src/AgendaWidget.tsx` | Widget de agenda por setor (NEW — não commitado) |
| `src/useUnread.tsx` | Hook de rastreamento de não-lidos (NEW — não commitado) |
| `src/FinanceiroTab.tsx` | Financeiro — centro de custos, indicadores (NEW — não commitado) |
| `src/AcnTabShared.tsx` | OplDetalheModal, LinkOpl, componentes compartilhados de OPL/OS |
| `src/NovaOpOsModal.tsx` | Modal criação OP/OS com formato PPPP.YYММ |
| `src/VeiculosNfcTab.tsx` | Dossiê NFC veicular + portal do cliente |
| `public/portal.html` | Portal público do cliente (acesso por token NFC) |
| `sql/migrations.sql` | Consolidado de todos os ALTER/CREATE desta sessão (NÃO RODADO) |
| `sql/migrate_pipeline.sql` | Migração Pipeline CRM → licitacoes (Passo 2 pendente) |
| `sql/agenda_compromissos.sql` | CREATE TABLE agenda_compromissos |
| `sql/registro_leituras.sql` | CREATE TABLE registro_leituras |
| `publicar.bat` | Script de build + deploy GitHub Pages |
| `CONTEXTO_PROJETO.md` | Contexto geral do projeto (gerado em sessão anterior) |

---

> ⚠️ CONFIRMAR: bucket `acn-media` está como público no Supabase Dashboard → Storage?
> ⚠️ CONFIRMAR: `sql/migrate_pipeline.sql` Passo 1 foi executado com sucesso nesta sessão?
> ⚠️ CONFIRMAR: `DashboardKPIS.tsx` está wired e funcionando, ou é componente legado?
