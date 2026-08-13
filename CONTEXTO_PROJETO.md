# ACN Sinal Verde — Contexto Completo do Projeto

> **Arquivo de briefing para continuar o desenvolvimento em qualquer sessão Claude.**
> Cole este arquivo no início de uma nova conversa para retomar de onde parou.

---

## 1. O que é o projeto

**ACN Sinal Verde** — sistema de gestão industrial interno da empresa ACN/DETECH, desenvolvido em React + Supabase. É um SPA (Single Page App) hospedado via GitHub Pages. Controla OPLs (Ordens de Produção), licitações, CRM, compras, RH, logística, faturamento, chat interno, formação de preços e mais.

**URL de produção:** deploy via GitHub Pages (branch `main`, configurado no `vite.config.ts`)  
**Repositório:** pasta local `C:\Users\fisca\meus-projetos\meu-app`  
**Deploy:** executar `publicar.bat` na raiz do projeto

---

## 2. Stack técnica

- **React** 19.2.7 + **TypeScript** + **Vite** 8.1.0
- **Supabase** (backend/banco): banco PostgreSQL hospedado na Supabase
- **GitHub Pages**: hospedagem estática do build
- **Sem servidor próprio**: toda lógica é client-side com Supabase como BaaS

---

## 3. Regras CRÍTICAS de arquitetura (nunca violar)

1. **TODOS os arquivos de componente usam `// @ts-nocheck` no topo** — nunca remover.
2. **Supabase URL hardcoded** — NUNCA usar `import.meta.env`. Sempre:
   ```js
   'https://qgemelnuqdilnggxmrdw.supabase.co'
   ```
3. **Supabase anon key hardcoded** (chave pública, seguro documentar):
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k
   ```
4. **Auth usa tabela própria `auth_usuarios`** — NÃO usa Supabase Auth. `supabase.auth.getSession()` sempre retorna null. Login é feito buscando email+senha na tabela `auth_usuarios`.
5. **`criado_por` nas OPLs usa `currentUser?.email`** — nunca `.id`.
6. **Sem .env files** — credenciais ficam hardcoded no `supabaseClient.ts`.

---

## 4. Estrutura de arquivos principais

```
src/
├── App.tsx                  — roteamento principal, controle de abas por perfil
├── supabaseClient.ts        — instância única do Supabase (URL + anon key hardcoded)
├── LoginTab.tsx             — tela de login (auth_usuarios)
├── AdminTab.tsx             — painel Admin: usuários, config, plataformas licitação
├── CrmTab.tsx               — CRM: Kanban licitações + vendas diretas, relatórios
├── LicitacoesTab.tsx        — aba Licitações
├── ComercialTab.tsx         — aba Comercial
├── FormacaoPrecosTab.tsx    — formação de preços ACN/DETECH, plataformas, permissões por perfil
├── EngenhariaTab.tsx        — aba Engenharia + OPLs
├── PCPTab.tsx               — PCP: planejamento e controle de produção
├── AlmoxarifadoTab.tsx      — almoxarifado
├── ProducaoTab.tsx          — produção com equipes
├── QualidadeTab.tsx         — controle de qualidade
├── FiscalTab.tsx            — fiscal/faturamento
├── LogisticaTab.tsx         — logística
├── ComprasTab.tsx           — pedidos de compra
├── ChatWidget.tsx           — chat interno (canais + DMs, broadcast Supabase)
├── RHTab.tsx                — RH
├── DashboardTab.tsx         — dashboard KPIs
├── ClientesTab.tsx          — cadastro de clientes
├── RelatoriosTab.tsx        — relatórios
├── AcnTabShared.tsx         — componentes compartilhados entre abas ACN
├── NovaOpOsModal.tsx        — modal de criação de nova OP/OS
├── OplAcompModal.tsx        — modal de acompanhamento de OPL
├── ContatoAlertWidget.tsx   — alertas de contato
├── WhatsAppConexoesWidget.tsx — integração WhatsApp
└── ...outros componentes auxiliares
```

---

## 5. Banco de dados — tabelas relevantes

| Tabela | Uso |
|---|---|
| `auth_usuarios` | Login: id, nome, email, senha, perfil |
| `oples` | OPLs/OSes: numero_op, cliente, status, etapa, criado_por (email) |
| `opl_etapas` | Histórico de etapas de cada OPL |
| `opl_acompanhamentos` | Acompanhamentos/notas de OPL com menções |
| `opl_anexos` | Arquivos anexados às OPLs |
| `crm_oportunidades` | Oportunidades CRM: licitações e vendas diretas |
| `crm_estagios_funil` | Estágios do funil (Kanban): nome, funil, cor, ordem, is_final |
| `crm_acompanhamentos` | Acompanhamentos de oportunidades CRM |
| `crm_anexos` | Anexos do CRM |
| `chat_salas` | Salas de chat: tipo (canal/direto), nome, membros (JSONB) |
| `chat_mensagens` | Mensagens: sala_id, remetente_id, remetente_nome, texto |
| `cotacoes_precos` | Formação de preços: items, parâmetros, empresa, plataforma_id |
| `plataformas_licitacao` | Plataformas: nome, desconto_pct, retencao_pct, ativo |
| `clientes` | Cadastro de clientes |
| `pedidos_compra` | Pedidos de compra |
| `auth_perfis_config` | Configuração de acesso por perfil |
| `aviso_sistema` | Avisos globais do sistema |

---

## 6. Perfis de usuário e permissões

Os perfis existentes no `auth_usuarios.perfil`:
- **Admin** — acesso total
- **Engenharia** — EngenhariaTab + OPLs
- **PCP** — PCPTab
- **Almoxarifado** — AlmoxarifadoTab
- **Producao** — ProducaoTab
- **CQ** — QualidadeTab
- **Fiscal** — FiscalTab
- **Logistica** — LogisticaTab
- **Compras** — ComprasTab
- **RH** — RHTab
- **SAC** — SacTab
- **Comercial** — ComercialTab + CrmTab
- **Licitações** — LicitacoesTab + CrmTab
- **CRM** — CrmTab
- **Marketing** — MarketingTab

**Nota Formação de Preços:** Perfis Comercial, Licitações, CRM são tratados como `isVendedor = true` — veem tabela com colunas restritas (sem custo, markup, margem).

---

## 7. CrmTab — Kanban

O Kanban do CRM tem **5 SUPER_COLS**:
1. **Aberto** — oportunidades ativas
2. **Vencidas** — data_sessao passada e não finalizado
3. **Perdidas** — `isPerdido()`: stages marcados como perda
4. **Desistências** — `isDesistencia()`: stages de desistência
5. **Finalizadas** — `isFinalizada()`: stages `is_final = true` e ganho

Cards minimizados mostram: data_sessao + hora_sessao sempre visíveis. Cards de Desistência/Perdida têm botão "📝 Atualizar".

`abaInterna` state controla: 'kanban' | 'relatorio' | 'opls' | 'faturamentos'

---

## 8. FormacaoPrecosTab

- **Empresa selector**: ACN / DETECH
- **Plataformas**: carrega de `plataformas_licitacao`, aplica desconto% e retenção% sobre total de vendas
- **Imposto%**: editável por linha (se `usarParamsGlobais = false`)
- **Vendedor view**: perfis Comercial/Licitações/CRM ocultam colunas sensíveis via `display:'none'` no style
- **Modelos**: salvos em `cotacoes_precos` com `empresa` e `plataforma_id`

---

## 9. ChatWidget

Chat interno flutuante (canto inferior direito):
- Canais por setor + mensagens diretas
- Broadcast via Supabase Realtime (`acn-chat-v1`)
- Badge com não-lidas, toast de nova mensagem, sirene sonora
- Polling 5s (badge) + 2s (mensagens da sala aberta)
- `markRead` usa localStorage por sala
- **Melhorias recentes**: busca integrada, todas conversas existentes visíveis (não só não-lidas), seção "Nova conversa" separada de conversas existentes, delete button aparece no hover

---

## 10. AdminTab — PainelPlataformas

CRUD completo para `plataformas_licitacao`:
- Campos: nome, desconto_pct, retencao_pct, ativo
- Defaults inseridos: NEO, QFrotas, Prime

---

## 11. publicar.bat

Script de deploy:
1. Remove git locks
2. `npm install`
3. `git reset HEAD` + `git add` de todos os arquivos relevantes
4. Commit + push para `main`
5. Executa SQL migrations (CREATE/ALTER TABLE) para novas features

**Sempre rodar `publicar.bat` após mudanças** para publicar no GitHub Pages.

---

## 12. SQL migrations recentes (já no publicar.bat)

```sql
-- Tabela de plataformas de licitação
CREATE TABLE IF NOT EXISTS public.plataformas_licitacao (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  desconto_pct numeric DEFAULT 0,
  retencao_pct numeric DEFAULT 0,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

-- Defaults
INSERT INTO plataformas_licitacao (nome, desconto_pct, retencao_pct)
  VALUES ('NEO', 3.5, 1.5), ('QFrotas', 2.0, 1.0), ('Prime', 4.0, 2.0)
  ON CONFLICT DO NOTHING;

-- Cotações de preços
CREATE TABLE IF NOT EXISTS public.cotacoes_precos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text,
  empresa text DEFAULT 'ACN',
  plataforma_id uuid REFERENCES plataformas_licitacao(id),
  items jsonb,
  params jsonb,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Adicionar colunas se tabela já existia
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS empresa text DEFAULT 'ACN';
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS plataforma_id uuid;
```

---

## 13. Demandas pendentes (backlog)

### Task #32 — OPL como link "Ver" em todo o sistema
Transformar qualquer referência ao número da OPL/OP em um link clicável que abre o registro diretamente (como o botão "Ver" já faz). Aplicar em todas as abas onde o número da OP aparece como texto simples.

### Task — Composição de custos
Considerar variação de veículo, cliente e processo no custo. Ainda precisa de design/definição de regras de negócio.

### Task — Contrato terceiros padrão
Template de contrato para saída de carros para serviços, com envio por email. Avaliar assinatura digital (gov.br ou similar).

### Task — Campo de seriais antes de emitir NF
Antes de enviar para o Fiscal/emitir NF, inserir campo para registrar números de série dos equipamentos.

### Task — Email automático para faturamento
Envio automático com dados do pregão, cliente, valor, plataforma, custos, retenções e seriais após fechamento.

### Task — Comissão vendedores 1,5%
Calcular 1,5% sobre total da "NEVOA" (ainda precisa confirmar o que é NEVOA — produto/linha específica?). Perguntar ao usuário sobre isso.

### Task — Vinculação OP com processos de compra
Ligar OPs a: processos de compra + centro de custo + checklist + nota fiscal. Arquitetura complexa, precisa de planejamento.

### Task — Dashboard consulta OP/OS
Widget de consulta de OP/OS com: histórico completo, botões de acesso a arquivos, log de datas e eventos do histórico.

### Task — Parâmetros distintos ACN/DETECH na Formação de Preços
Empresa selector já implementado. Ainda falta: definir quais parâmetros padrão são diferentes para ACN vs DETECH (usuário precisa informar os valores).

### Task — Verificar custo gerado pelo DIFAL
Análise de como o checkbox "Aplicar DIFAL" gera custo no cálculo da Formação de Preços. Tarefa de explicação/análise.

### Task — Campo "Ver" + busca em todas as abas de OPs
Adicionar botão "Ver" e caixa de busca em todas as abas de visualização de OPs (AlmoxarifadoTab, PCPTab, QualidadeTab, etc.).

---

## 14. Skills do Claude configuradas

O projeto usa Cowork mode com as seguintes skills customizadas:

- **demandas-diarias**: controle de demandas do dia a dia industrial
- **opl-engenharia**: controle de OPL com rastreamento por departamento

Localização das skills:
```
C:\Users\fisca\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\...
```

---

## 15. Como retomar o desenvolvimento

1. Cole este arquivo em uma nova conversa Claude
2. Diga qual task quer implementar
3. Claude vai ler os arquivos necessários com Read tool antes de editar
4. Após implementação, rodar `publicar.bat` para publicar

**Perguntas de contexto que podem ser feitas ao Claude:**
- "Leia o arquivo FormacaoPrecosTab.tsx e implemente a task X"
- "Qual é a estrutura do banco para OPLs?"
- "Como funciona o Kanban do CRM?"

---

## 16. Contexto da sessão anterior (agosto 2026)

Implementado na última sessão:
- AdminTab: CRUD de plataformas de licitação (PainelPlataformas)
- FormacaoPrecosTab: seletor ACN/DETECH, selector de plataforma, Imposto% por linha, view restrita para vendedores
- CrmTab: data_sessao sempre visível no card minimizado, botão 📝 Atualizar em Desistência/Perdida
- ChatWidget: busca integrada, conversas existentes sempre visíveis, UX melhorada
- publicar.bat: SQLs das novas tabelas, fix coluna `ordem` no INSERT de Finalizada

---

*Gerado automaticamente em 04/08/2026*
