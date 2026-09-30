# Plano — Visualização do fluxo de trabalho e polimento de UX

> **Documento vivo.** Mesmo padrão do `PLANO_ESTOQUE_AUTOMATICO.md`: cada etapa
> concluída é marcada aqui, com data e o que foi feito de verdade. Quem pegar o
> trabalho depois (em qualquer máquina) lê este arquivo e sabe onde parou.

**Pedido do usuário em 29/09/2026:** varredura completa do fluxo de trabalho —
da abertura do PV até a entrega, passando por compras e financeiro — pensando
"como um UX sênior e um desenvolvedor sênior decidindo juntos", pra deixar
mais fácil visualizar em que pé está o trabalho hoje, e polir a experiência
de uso. Decisão de por onde começar é do usuário; este documento existe pra
apresentar o mapa completo e as etapas propostas.

---

## Onde queremos chegar

Hoje, saber "em que pé está este PV" exige abrir 3 a 5 telas diferentes
(CRM, Licitações, Engenharia, PCP, Logística) e cruzar por conta própria.
Queremos:

1. **Um lugar só que responda "onde está isso agora"** — do card do CRM até
   a entrega, sem precisar adivinhar em qual das 11 colunas de status olhar.
2. **Um caminho só para cada ação**, não três formulários diferentes fazendo
   a mesma coisa com gates diferentes.
3. **Nomenclatura consistente** — o mesmo conceito com o mesmo nome em toda
   tela, pra parar de repetir o problema "Concluído vs Recebido" (já
   aconteceu de verdade, mais de uma vez, em lugares diferentes).
4. **Feedback claro em cada transição** — quando algo não acontece sozinho
   (porque bateu numa exceção), a tela avisa; hoje várias vezes fica em
   silêncio.
5. **Um sistema de design realmente único**, não um conjunto de componentes
   bons (`Interface.tsx`) usado por 20% das telas enquanto o resto reinventa
   cor e botão à mão.

---

## Princípios que não se quebram

1. **Bug funcional vem antes de polimento visual.** Achamos pelo menos um
   elo quebrado de verdade (frete entregue não libera a OP sozinha) — isso
   não é preferência de design, é comportamento errado em produção.
2. **Não apagar sem entender por quê.** Achamos vários arquivos/caminhos
   órfãos (código morto). Antes de apagar, confirmar que não é usado por
   ninguém e não guarda alguma regra que ainda vale.
3. **Migração de tela por vez, testável sozinha.** Nada de "trocar tudo de
   uma vez" — cada etapa sobe e funciona sozinha, como já é praxe neste
   projeto.
4. **Nomenclatura muda com migração de dado, nunca só no código.** Se um
   status muda de nome, os registros antigos migram junto (com contagem
   relatada), e o código tolera as duas grafias durante a transição.

---

## Ponto de partida — o fluxo mapeado em 29/09/2026

### Mapa de estados: do PV até a entrega

| # | Etapa | Tela | Quem age | Transição |
|---|---|---|---|---|
| 1 | Oportunidade nasce | CRM (Kanban) | Comercial | — → 1º estágio do funil |
| 2 | Card vai pra "Enviado" | CRM | Comercial | exige PV + temperatura + próximo contato |
| 3 | Card vira "Ganho" | CRM | Comercial | **3 caminhos diferentes chegam aqui — ver achado A1** |
| 4 | *(alternativa)* Licitação vencida → Pedido de entrega → Gerar OP | Licitações → Contrato e Entregas | Comercial/Licitações | por pedido de empenho |
| 5 | OP nasce | `NovaOpOsModal` (o formulário oficial) | Comercial | — → `Em Espera Engenharia` |
| 6 | OP chega na Engenharia | Engenharia (fila) | Engenharia | `Em Espera Engenharia` → `Em Analise Engenharia` |
| 7 | Engenharia libera a BOM | Engenharia | Engenharia | → `Em Espera PCP` (`status_bom: BOM Liberado`) |
| 8 | PCP libera kiting | PCP | PCP | → `Aguardando Almox`, reserva estoque |
| 9 | Almoxarifado separa o kit | Almoxarifado | Almoxarifado | checklist item a item → `Kit OK` ou `Liberado com Pendência` |
| 10 | PCP libera produção (ou embalagem, se envio) | PCP | PCP | → `Aguardando Inicio Producao` **ou** `Aguardando Embalagem` |
| 11 | Produção executa | Produção | Produção | → `Aguardando CQ` |
| 12 | Qualidade audita | Qualidade | CQ | aprova → `Aguardando Liberação Comercial`; reprova → `Retrabalho` |
| 13 | *(se envio)* Embalagem pergunta CIF/FOB | Almoxarifado | Almoxarifado | CIF → `Aguardando Cotação Frete` (+ pedido de frete) · FOB → direto liberação comercial |
| 14 | *(se CIF)* Logística cota e entrega o frete | Logística | Logística | Cotação → Aguardando Aprovação → Em Trânsito → Entregue — **ver achado A2: aqui quebra** |
| 15 | Comercial libera pro Fiscal | Comercial | Comercial | → `Aguarda Emissao NF` |
| 16 | Fiscal emite a NF | Fiscal | Fiscal | → `Faturado e Disponivel para Entrega` |
| 17 | Confirma entrega ao cliente | Fiscal **ou** Comercial (duas telas, mesma ação) | Fiscal/Comercial | → `Faturado` (fecha o ciclo) |

Em paralelo, o que sustenta esse fluxo:
- **Compras**: Pendente → Em Andamento (cotação) → Aguardando Aprovação (4
  pessoas nomeadas, não por cargo) → Aprovado → Comprado → Recebido.
- **Financeiro**: centro de custo (recebe compras + despesas avulsas),
  faturamento de compras (paga só depois que a Logística confirma
  recebimento), conciliação bancária (cruza extrato com as duas coisas),
  kanban de tarefas administrativas.

### `oples` tem 11 colunas de status diferentes (medido no banco, 29/09/2026)

`status_geral` (16 valores distintos, 331 OPs), `status_producao`,
`status_almoxarifado`, **`status_almox`** (duas colunas parecidas — uma
delas pode ser resíduo), `status_engenharia`, `status_pcp`, `status_kiting`,
`status_qualidade`, `status_fiscal`, `status_logistica`, `status_bom`,
`serralheria_status`. `status_geral` já é a fonte mais próxima de "verdade
única" e tem até uma barra de progresso central (`AcnTabShared.tsx:39-57`,
`OPL_PIPELINE`) — mas ela não aparece em toda tela, e alguns status ficam
desatualizados sem ninguém perceber (achado A2).

---

## Achados — organizados por gravidade

### A. Bugs funcionais de verdade (não é preferência de design)

**A1 — Três caminhos diferentes criam uma OP, e não convergem.**
`NovaOpOsModal.tsx` (o oficial, com todos os gates: fluxo de entrega, frete,
veículo, perguntas de configuração) · `converterGanho` dentro do próprio
`CrmTab.tsx` (formulário simplificado, sem esses gates) · e um formulário
inteiro em `ComercialTab.tsx` que está **órfão** (importado mas nunca
renderizado — ver achado B1). Cada caminho pode gerar uma OP com campos
faltando que o oficial exigiria.

**A2 — Frete entregue não libera a OP sozinha.** O pedido de frete nasce com
`vinculo_tipo: 'opl'`, mas o código que registra a entrega e (deveria) andar
o status da OP só reconhece `vinculo_tipo: 'op_os'`. Resultado: **hoje, toda
OP que sai por frete CIF fica presa em "Aguardando Cotação Frete" mesmo
depois do frete entregue**, até alguém (Admin/Gerente) editar o status à mão
em `OplEdicao.tsx`. Isso não é falta de polimento — é um degrau que só não
trava tudo porque alguém conserta manualmente sem perceber que é um bug.

**A3 — `criarOpAutomatica` falha calada em colisão de número.** Se o número
de OP gerado automaticamente colidir com um já existente, a função devolve
`null` sem avisar nada na tela — a pessoa só descobre se for conferir a
lista depois.

**A4 — "Lançar OP" continua disponível depois que a OP já nasceu sozinha.**
Ao ganhar o card, a OP é criada automaticamente — mas o menu ainda oferece
"Lançar OP" no mesmo card, sem indicar que já existe uma. Risco de duplo
lançamento.

**A5 — Atalho do PCP ("sanar pendência") não fecha o checklist formal.**
`sanarPendenciaPCP` resolve o status direto, sem passar pelas 3 etapas
formais (`pendencias_kit`). Se alguém abrir o checklist formal depois pra
essa mesma OP, ele pode continuar mostrando a pendência como aberta.

**A6 — Liberar BOM não avisa sobre pendência de fabricação em aberto da
mesma OP.** Só quem chegar depois, no Almoxarifado, esbarra nisso.

**A7 — OP devolvida ao Comercial não tem caminho de volta para a Engenharia.**
*(Resolvido na Etapa 3.1, em 29/09/2026 — o reenvio agora está na aba "OPLs em
aberto" do CRM.)*
*(Achado na Etapa 3, em 29/09/2026, ao conferir o que o `ComercialTab.tsx`
guardava antes de apagá-lo.)* O botão "reenviar para a Engenharia"
(`enviarParaEngenharia`: `Devolvida Comercial` → `Em Espera Engenharia`) só
existe nesse arquivo, que saiu do menu em 23/07/2026 na unificação
Comercial+CRM. Nenhuma tela viva faz esse reenvio: hoje só Admin/Gerente
consegue, trocando o status à mão em `OplEdicao.tsx`. **Medido no banco em
29/09/2026: 10 OPs paradas em `Devolvida Comercial`**, 4 delas devolvidas pela
Engenharia em 17 e 18/09 (motivos como "informação incompleta" e "ainda não
confirmada a venda"), e **só 1 reenvio registrado em toda a história** (20/07,
três dias antes de o arquivo sair do menu). É o mesmo tipo de degrau quebrado
da A2: o sistema devolve, mas ninguém consegue devolver de volta.

**A8 — Duas telas só enxergam os primeiros 1.000 itens do catálogo.** *(Achado
na Etapa 5.3, em 29/09/2026, ao testar o marcador "Conjunto Elétrico" no Admin.)*
`ConfigEstruturaTela.tsx:32` (Admin > Estruturas) e `Estoque.tsx:1235` (a
"estrutura do chicote", Etapa 9 do estoque) leem `cadastro_itens` com
`.limit(5000)`, mas **o servidor devolve no máximo 1.000 linhas**: medido em
29/09/2026, pedir 5.000 devolve 1.000. O catálogo tem **4.429 itens ativos**;
só os primeiros 1.000 em ordem alfabética aparecem no seletor (77% do catálogo
fica de fora). Consequências medidas: (1) em Admin > Estruturas **nenhum item
"CONJUNTO ELETRICO" pode ser escolhido** — há 432 ativos e **1.049 itens vêm
antes deles** no alfabeto — e hoje **0 itens estão marcados** como o
interruptor da montagem automática (`eh_conjunto_instalacao`), ou seja, a
montagem automática do estoque (Etapa 7) está desligada por esse caminho;
(2) na estrutura do chicote, o material (fio, conexão, terminal…) só pode ser
escolhido entre os itens do início do alfabeto. Não é polimento: é uma tela que
parece funcionar e não alcança o que precisa. **Corrigir** com paginação
(`.range`, como já faz `CadastroItensTab.tsx`) ou com busca no servidor — ver
5.5. **✅ Resolvido na 5.5 (29/09/2026)**, por paginação.

**A9 — O mapa de "alteração não lida" cortava em 1.000 linhas.** *(Observado em
29/09/2026, ao procurar outras leituras com o mesmo corte do A8. **Reproduzido com
dados reais e resolvido na 5.6.**)* `AuditSystem.tsx:184` (`useUnreadMap`) busca em `audit_log` todas as
mudanças das entidades de uma lista (`.in('entity_id', ids)`, da mais nova para a
mais velha) **sem paginar**, e o servidor devolve no máximo 1.000. Hoje a
`audit_log` tem **2.762 linhas de licitações** (92 licitações) e **1.582 de OPs**
(220 OPs). Efeito esperado: uma entidade cuja única alteração ainda não vista é mais
antiga que as 1.000 alterações mais novas fica **sem o destaque de "não lido"** — e
piora a cada mês, porque a tabela só cresce. As outras leituras de tabelas grandes
foram conferidas e não têm o problema: o histórico de OP (2.428 linhas) é lido por
OP, a FIPE (11.399) por filtro, e o catálogo já foi corrigido na 5.5.

**A10 — A edição de OP pelo CRM abria com a linha parcial da lista e gravava TODOS os
campos.** *(Achado em 29/09/2026, na Etapa 7.1; **resolvido lá**.)* A lista "OPs em aberto" lê
só algumas colunas da OP, e o formulário "✏️ Editar" partia dessa linha: o que a lista não
trazia (resumo dos serviços, origem da venda, seriais, serviço de terceiro, veículo do
catálogo…) abria **vazio**, e o "Salvar" mandava o formulário inteiro — os vazios que a
pessoa nunca viu eram **gravados como vazios**. Visto ao vivo na OP 1482.1502 (o banco tinha o
resumo e a origem; a tela abria em branco). **Não consegui medir se alguma edição antiga já
apagou algo**: a auditoria só guarda o que mudou, e a linha "antiga" também era parcial.

**A11 — Veículo cadastrado na hora deixava o "Modelo" da OP em branco.** *(Etapa 7.1;
**resolvido lá**.)* A criação procurava a ficha recém-criada numa lista carregada uma vez só, não
achava, e gravava a OP com o veículo ligado mas o texto do modelo vazio (as listas passam a dizer
"sem modelo"). Atingiu **40 OPs**: as 39 do lote 1673.2609 e a D0778.2609.

**A12 a A16 — Formulários de edição que gravavam por cima do que estava salvo** *(Etapa 7.2, 29/09/2026;
**resolvidos lá**, detalhe no bloco da etapa)*: kit de produto que apagava a estrutura se ela não tivesse carregado (A12);
caixa "Pode excluir anexos" do usuário que abria desmarcada e não gravava (A13); aviso desativado que voltava a ficar ativo ao
editar (A14); contato do CRM que era reativado e trocava de responsável ao editar (A15); venda do CRM com valor multiplicado por
10 ou 100 ao salvar sem mexer (A16, R$ 7.847,50 → R$ 78.475).

**A17 — Compra de reposição recebida pela Logística não subia para o estoque** *(pedido PC-FU6DS9, 29/09/2026, relatado pelo
usuário; **resolvido**, detalhe no bloco "Etapa 7.3")*: a tela "Aguardando Recebimento" da Logística lia o pedido **sem `vinculo_tipo`,
`vinculo_id` nem `quantidade_comprada`**; sem o vínculo, o crédito no estoque saía em silêncio ("não se aplica") e a janela abria com a
quantidade **pedida** (9) em vez da **comprada** (10). O pedido ficava Recebido e o saldo, parado. Era o **primeiro** pedido de reposição
recebido: nunca houve uma entrada por compra no estoque (`compra_recebida`).

### B. Código morto / caminhos órfãos (achado em 3 pontos independentes)

**B1 — `src/ComercialTab.tsx`**: tela inteira (1.450 linhas, medido em
29/09/2026; o plano dizia ~800) com seu próprio formulário de "+ Nova OP",
importada em `DashboardTab.tsx` mas **nunca renderizada** em nenhuma navegação
real. Tem `confirmarEntrega` duplicado do que existe em `FiscalTab.tsx`.
*Apagada na Etapa 3.1, depois de o reenvio de OP devolvida (A7) ganhar tela
viva.*

**B2 — `prepararOpComercial`** em `LicitacoesTab.tsx`: grava um prefill e
mostra um alerta orientando "vá em Comercial/CRM e clique em Nova OP/OS" —
mas não está associada a nenhum botão. Órfã.

**B3 — `src/PedidoCompraList.tsx`**: CRUD completo e independente de
`pcp_pedidos_compra`, com status que não existem no enum oficial
(`ETAPAS_COMPRA`), usando variáveis não declaradas — quebraria se alguém o
religasse sem perceber que está desatualizado.

**B4 — `EngenhariaTab-COM-PERMISSOES.tsx` e
`EngenhariaTab-NOVO-COM-LIBERAR-BOM.tsx`**: reduzidos a `export {}` —
cascas vazias de uma refatoração anterior.

### C. Nomenclatura inconsistente (o padrão "Concluído vs Recebido" se repete)

- `Aprovado CQ - Aguardando Liberacao Comercial` vs `Aguardando Liberacao
  Comercial` — duas strings diferentes tratadas como sinônimas via `||` em
  pelo menos 3 lugares. Frágil: uma tela nova que esqueça de checar as duas
  perde OPs silenciosamente.
  *Medido na Etapa 5 (29/09/2026): 188 OPs no nome longo e 2 no curto; 9
  arquivos usam o texto (não "3 lugares"); Relatórios e Marketing só
  reconheciam o longo, então as 2 OPs de envio sumiam de "Finalizadas". Os dois
  nomes não eram por acaso: o longo nasce no caminho do CQ, o curto nos caminhos
  de envio, que não passam por CQ.*
- `serralheria_status`: o PCP usa um 4º valor (`'Sanado'`) que não existe no
  enum oficial `SERRALHERIA_STATUS`.
  *Medido na Etapa 5: não é sinônimo. É o 4º passo real da liberação parcial de
  BOM (Pendente → Concluído → **Sanado**), e o 1 registro do banco veio desse
  caminho. Faltava só constar do vocabulário (5.2).*
- `'Concluído'` ainda é chave morta no dicionário de cores do
  `FinanceiroTab.tsx` (a etapa de Compras virou "Recebido" em 22/09) — e o
  Kanban de Tarefas do Financeiro usa **a mesma palavra "Concluído"** para
  um conceito diferente (tarefa administrativa), na mesma aba.
  *Medido na Etapa 5: a chave morta tinha um efeito visível — o dicionário não
  tinha `'Recebido'`, e as compras recebidas apareciam em cinza. Era uma cópia
  do `COR_ETAPA_COMPRA` oficial (5.2).*
- "Conjunto Elétrico" vs "Conjunto de Instalação" — mesmo conceito.
  *Correção da Etapa 5 (o levantamento inicial tinha isto invertido): o
  catálogo real tem 438 itens chamados "CONJUNTO ELETRICO PV …" e o plano do
  estoque também diz "Elétrico"; as **telas** dizem "Instalação"
  (`AplicarEstrutura.tsx`, `ConfigEstruturaTela.tsx`); a **coluna** do banco é
  `eh_conjunto_instalacao`.*
- "OP" vs "OPL" — duas siglas pra mesma entidade, dependendo da tela.
  *Medido na Etapa 5: 893 ocorrências de "OP" e 218 de "OPL" no código.*
- *(Já em andamento em sessão separada, iniciada pelo usuário: a mesma
  família de bug com o status `'Concluida'` de demandas setoriais que nunca
  cai na fila de crédito de estoque — task já rodando, não duplicar aqui.)*

### D. Falta de visão consolidada

- Não existe painel único "PV 1234 → Ganho → OP A1234.0926 → Em Análise
  Engenharia" — hoje é card do CRM + aba Licitações + lista da Engenharia,
  três lugares.
  *Correção da Etapa 6 (29/09/2026): o **Dossiê da OP** (21/09) já é um painel
  único e completo — origem da venda, tudo o que está ligado, tempos, marcos, linha
  do tempo e PDF. O que faltava era um **relance** (uma faixa que responda "onde
  está agora") e um caminho a partir da lista e do card do CRM.*
- Dentro do detalhe da OP não há link direto pro registro de frete
  correspondente (a busca em Logística é textual).
- Não existe tela que some quanto uma OP específica já gastou (compras +
  mão de obra) — são três fontes que precisam ser cruzadas na mão.
- Aprovação de compra não tem aba "pendente da minha aprovação" — só
  menção/e-mail.

### E. Densidade de informação e fricção de interação

- Tabelas de 8-11 colunas em fonte 9-11px (PCP, Engenharia, Compras).
- PCP empilha **6 blocos de alerta** verticalmente, todos com o mesmo peso
  visual — sem hierarquia de "resolve isso primeiro".
- `alert()`/`confirm()` nativos do navegador em quase toda ação — sem
  hierarquia de severidade, sem estilo do sistema.
  *Correção da Etapa 7 (29/09/2026): isto já estava resolvido no essencial — todo
  `alert()` é redirecionado para o aviso do sistema em `main.tsx`, e `confirmar`/
  `pedirTexto` (`Feedback.tsx`) já cobrem confirmação e texto. Sobravam só 2 `confirm()`
  nativos e o **tom** dos avisos, que é adivinhado pelo texto e errava em 16% deles.*
- Kiting em lote: nenhuma sugestão de fabricação vem pré-marcada — pra um
  lote de 90 carros, isso é dezenas de cliques de checkbox.
- Dois campos de prazo parecidos no pedido de compra (`data_prevista_
  recebimento` vs `prazo_prometido_entrega`) — fácil de confundir.

### F. Design system (detalhado no relatório de 29/09/2026, resumo aqui)

- `Interface.tsx` é um sistema de design maduro (`Botao`, `Selo`, `Abas`,
  `SelectBusca`, `MenuAcoes`) — mas só o Dashboard (e as telas que eu mexi
  nesta sessão: CRM, Licitações, Cotações, Estoque) o usam de verdade.
  RH, SAC, Fiscal, Logística e Relatórios reinventam cor e botão à mão.
- `TonsVisuais.ts` é uma heurística de runtime que varre o DOM e *adivinha*
  a semântica da cor pintada à mão — sintoma de que a migração real
  (trocar `style` inline por `<Botao variante="...">`) nunca terminou.
- Dark mode é uma lista de ~180 linhas traduzindo cor hex por cor hex, não
  um tema de verdade.
- Sidebar: grupo "Administrativo" tem 12 itens sem relação entre si
  (Logística, RH, Fiscal, Financeiro, Cadastro de Itens, Relatórios...).

---

## Etapas propostas

Estado: ⬜ não começou · 🟡 em andamento · ✅ concluída

Ordenadas por uma lógica: primeiro o que está **quebrado de verdade**
(A), depois o que **atrapalha entender o resto** (B, C), só então o que é
**visualização** (D — o pedido central desta análise) e **polimento** (E, F).
A ordem é só uma sugestão — a decisão de por onde começar é sua.

### ✅ Etapa 1 — Consertar o elo quebrado do frete (A2)

**Feito em:** 29/09/2026.

**O que foi feito:**

- `AlmoxarifadoTab.tsx`: a solicitação de frete criada ao embalar (CIF)
  passou a nascer com `vinculo_tipo: 'op_os'` em vez de `'opl'` — é o valor
  que o resto do sistema (formulário manual de frete, `LogisticaTab.tsx`)
  já usava pra dizer "isto pertence a uma OP".
- `LogisticaTab.tsx` (`postarAndamentoVinculo`, chamada por `marcarEntregue`):
  ao entregar um frete ligado a uma OP que ainda esteja em `Aguardando
  Cotacao Frete`, ela agora avança sozinha pra `Aguardando Liberacao
  Comercial` — o mesmo destino que o caminho FOB (sem frete a cotar) já
  usava. Fica registrado em `logs_movimentacao_opl`, na auditoria
  (`logChange`) e dispara `notificarEvento('frete_entregue', …)` (evento
  novo — só soa se alguém configurar o destinatário em Admin → Notificações
  WA, mesmo comportamento de qualquer evento novo).
- **Bug irmão achado no caminho, mesmo trecho:** a nota de "frete entregue"
  gravava `referencia_id` com o **UUID** da OP, mas a tela de Acompanhamento
  (`OplAcompModal.tsx`, `AcnTabShared.tsx:1612`) busca pelo **número da OP**
  (`numero_opl`) — a nota nunca teria aparecido pra quem abrisse o
  histórico da OP, mesmo gravada certinho no banco. Corrigido junto: agora
  busca a OP primeiro e usa `opl.opl` (o número) na nota.

**Auditoria de OPs já travadas:** nenhuma. Conferido no banco antes de
mexer — nenhum frete ligado a uma OP (por `'opl'` ou `'op_os'`) já tinha
sido marcado "Entregue" alguma vez, então não havia OP presa pra corrigir
retroativamente. O bug existia no código mas ainda não tinha travado
ninguém de verdade.

**Testado** com OP e frete sintéticos (`ZZT-9999`): criado o cenário (OP em
`Aguardando Cotacao Frete`, frete `Cotação` → confirmado → `Em Trânsito`
pela tela de verdade). A etapa final ("Marcar como Entregue") exige anexar
um canhoto num `<input type="file">`, que a automação de navegador não
consegue preencher (mesma limitação registrada em `PLANO_ESTOQUE_
AUTOMATICO.md`, Etapas 5.1/7.3/7.4) — a sequência de gravação foi então
reproduzida chamando o mesmo `supabase` do app (via `import()` direto do
módulo servido pelo Vite, com o dev server rodando), com o mesmo efeito que
o clique real teria:

| Passo | Resultado |
|---|---|
| Frete confirmado com transportadora, foi a `Em Trânsito` (pela tela) | ✓ |
| Frete marcado `Entregue` | status_geral da OP saiu de `Aguardando Cotacao Frete` → **`Aguardando Liberacao Comercial`** sozinho |
| Nota de acompanhamento | gravada com `referencia_id = 'ZZT-9999'` (o número, não o UUID) — confirmada batendo com o que `OplAcompModal` busca |
| Log de movimentação | 1 registro em `logs_movimentacao_opl` |

Dado sintético apagado ao final (OP, frete, acompanhamento e log — zero
resíduo conferido).

### ✅ Etapa 2 — Resolver as colisões silenciosas (A3, A4, A6)

**Feito em:** 29/09/2026.

**O que foi feito:**

- **A3 — `criarOpAutomatica` (`CrmTab.tsx`) deixou de falhar calada.** Passou a
  devolver `{ opl, aviso }`: quando não cria, o `aviso` diz o porquê e quem
  chamou mostra na tela. Três motivos, três avisos: **PV ausente** (tom de
  atenção), **número já em uso por outra OP** (atenção, com o número) e **erro
  ao gravar** (tom de erro, com a mensagem do banco). "Já existe OP ligada a
  este card" continua sem aviso, de propósito: é o esperado, não falha. São
  dois os lugares que criam OP sozinha — arrastar o card para Vencido e salvar
  o card pelo modal já em Vencido — e os dois passaram a avisar. **Achado no
  caminho:** antes, o arrastar só avisava o caso "sem PV" (colisão e erro
  passavam calados) e o caminho do modal não avisava nenhum dos três.
- **Achado no caminho, do mesmo trecho:** o `alert()` do sistema já é
  redirecionado para `mostrarAviso` (`main.tsx`), que **adivinha o tom pelo
  texto**. "Não foi criada" casa com "criad" e sairia **verde**, como se
  tivesse dado certo. Por isso os avisos novos passam o tom explícito
  (`mostrarAviso(texto, 'atencao' | 'erro')`), com o título na primeira linha.
- **A4 — o card do CRM agora mostra que a OP já existe.** Na coluna Vencido
  aparece o selo verde `OP A1234.0926` (ou `2 OPs`, com os números no
  `title`). O menu troca "Lançar OP" por **"Lançar outra OP"** e, antes de abrir
  o formulário, **pede confirmação** dizendo qual OP já existe. Card sem OP
  fica exatamente como era. As OPs de cada card vêm de **uma consulta só** na
  carga da tela (`oplsPorCard`), e o formulário recarrega a tela ao salvar,
  para o selo aparecer na hora.
- **A6 — liberar a BOM avisa das demandas em aberto.** Em `EngenhariaTab.tsx`,
  `liberarBOM` e `liberarBomLote` perguntam, antes de gravar, se a OP tem
  demanda de Serralheria, Chicotes ou Compras aberta (usa `indicePendencias`
  de `OpPendencias.tsx`: 3 consultas para a tela toda, não 13 por OP). Se tem,
  lista as demandas (no lote, com o número de cada OP) e pergunta "Liberar a
  BOM mesmo assim?". Cancelar mantém o modal aberto para ajustar. Se a
  consulta falhar, a liberação segue: aviso que não carregou não trava a
  Engenharia.

**Decisões de desenho (suposições minhas, registradas):**

- **"Lançar OP" não some, vira "Lançar outra OP" com confirmação.** O plano
  dizia "esconder/trocar". Medi antes: **4 de 53 cards com OP têm mais de uma**
  (lotes e vendas desmembradas, no máximo 4). Esconder o botão tiraria um
  caminho legítimo; então o risco de duplicar é tratado com selo + pergunta.
- **A6 é aviso, não trava.** Liberar a BOM com demanda aberta é normal — a
  "liberação parcial p/ Serralheria" abre uma de propósito —, então a pergunta
  aparece, mas a Engenharia decide. Consequência: quem já usou a liberação
  parcial vai ver a pergunta ao liberar o resto. Se incomodar, o ajuste é
  ignorar as demandas de `tipo_solicitacao = 'liberacao_parcial_bom'`.

**Testado** com Puppeteer e **todas as gravações bloqueadas** (nenhuma
requisição de escrita chegou ao banco; o corpo do que seria gravado foi
lido). Dados reais em leitura; a colisão foi simulada respondendo a consulta
do número da OP. **32 de 32 verificações:**

| Cenário | Resultado |
|---|---|
| A4 — selo `OP D0778.2609` no card de 1 OP, `2 OPs` no de 2, nada no card sem OP | ✓ |
| A4 — menu "Lançar outra OP"; confirmação cita a(s) OP(s); cancelar não abre o formulário; confirmar abre | ✓ |
| A4 — card sem OP continua com "Lançar OP" | ✓ |
| A3 — arrastar para Vencido: colisão de número → aviso de atenção, nenhuma OP inserida | ✓ |
| A3 — arrastar para Vencido: falha na gravação → aviso vermelho com o número da OP | ✓ |
| A3 — arrastar para Vencido: sem PV → aviso de atenção | ✓ |
| A3 — salvar pelo modal em Vencido: colisão e falha na gravação avisam (antes era mudo) | ✓ |
| A6 — 1 OP com 3 demandas abertas: lista as 3; cancelar não grava; "mesmo assim" tenta gravar `Em Espera PCP` | ✓ |
| A6 — lote de 2 OPs (5 demandas): lista cada uma com o número da OP; cancelar não grava | ✓ |
| A6 — OP sem demanda aberta: não pergunta nada e segue direto | ✓ |

Conferido no banco depois do teste: 331 OPs (as mesmas), nenhuma OP
`A1060.2609`, o card do PV 1060 continua em "Enviado", as OPs da Engenharia
com o mesmo status. Zero resíduo. As 3 demandas do aviso da `1525.2609/01`
foram conferidas à mão no banco: as 3 estão "Em Andamento".

**O que ficou de fora:** o aviso da colisão diz que o número está em uso, mas
não diz por qual OP nem se ela pertence a outro card (daria para consultar; o
custo é uma consulta a mais no caminho). O `mostrarAviso` some sozinho em 7 a 9
segundos; se a Etapa 7 (avisos com hierarquia) mudar isso, vale revisar estes
três. **Sem correção retroativa:** nenhum dado foi alterado.

**Observação para a Etapa 4 (não mexi):** há **13 cards em estágio "ganho"
sem OP nenhuma** (todos os funis). Pode ser legítimo — em licitação a OP nasce
pelo pedido de empenho, não pelo card —, mas vale conferir quando a criação de
OP for unificada.

### ✅ Etapa 3 — Limpar os caminhos órfãos (B1-B4)

**Feito em:** 29/09/2026 — **B2, B3 e B4 no mesmo dia; B1 (`ComercialTab.tsx`)
esperou a Etapa 3.1** (abaixo) e foi apagado nela.

**O que foi feito:**

- **Prova de que estão mortos** (busca por `import`, por nome, por
  `import()` dinâmico e pelo menu do `DashboardTab`): `prepararOpComercial`
  definida e nunca chamada; `PedidoCompraList.tsx` sem nenhum importador e fora
  do menu (a tela viva de compras é a `ComprasTab`); os dois
  `EngenhariaTab-*.tsx` só com `export {}` e sem referência.
- **Apagados, com a confirmação do usuário na conversa:** a função
  `prepararOpComercial` (`LicitacoesTab.tsx`), `src/PedidoCompraList.tsx` (363
  linhas, que ainda carregava uma cópia da chave anon do banco escrita à mão),
  `src/EngenhariaTab-COM-PERMISSOES.tsx` e
  `src/EngenhariaTab-NOVO-COM-LIBERAR-BOM.tsx`. O histórico continua no git.
- **Mantida de propósito:** a chave `acn_nova_op_prefill` do navegador.
  `prepararOpComercial` era só um dos dois que a escreviam; o outro,
  `LicitacaoEntregas.tsx` ("Gerar OP" do Contrato e Entregas), e quem lê,
  `NovaOpOsModal.tsx`, estão vivos.
- **B1 ficou para a 3.1.** Conferi o que o `ComercialTab` faz e onde cada ação
  vive hoje: Nova OP → `NovaOpOsModal`; editar e desmembrar por quantidade →
  `CrmTab` (`salvarOplEdit`); liberar para o Fiscal → `CrmTab`; confirmar
  entrega → `CrmTab` e `FiscalTab`; categoria nova de projeto → gravava em
  `sac_categorias`, que é a tabela de categorias do **SAC** (misturava as duas
  coisas), e o `NovaOpOsModal` vivo não oferece criar categoria de projeto;
  manutenção agendada → **zero uso na história do banco** (0 eventos, 0
  agendamentos). **A única ação sem equivalente vivo é o reenvio da OP
  devolvida — ver A7.**
- **O arquivo continuou recebendo edição depois de sair do menu, e isso é um
  risco.** Em 14/09, 17/09 e 25/09 foram varreduras que passam por todo o
  projeto (janelas do sistema, busca, fuso). Já o commit de **28/09/2026**
  ("Formulários de OP…") mexeu em cerca de 50 linhas deste arquivo de
  propósito — o comentário "corrigido em 28/09/2026" no `salvarOPL` é dele —
  provavelmente por ele parecer mais um formulário de OP. Nada disso aparece na
  tela, porque o componente nunca é desenhado: era trabalho gasto em código
  morto. Foi apagado assim que a 3.1 fechou.

**Testado:** `npx vite build` verde. Detalhe de uma licitação (onde morava
`prepararOpComercial`) aberto no navegador com gravações bloqueadas: abre, sem
nenhum erro de página, e a única gravação tentada e barrada foi o registro de
"última visualização", igual a abrir qualquer card. **Não testei o "Gerar OP" do
Contrato e Entregas de ponta a ponta**: o código dele e o do leitor não foram
tocados.

**O que ficou de fora:** nada da Etapa 3 em si. **Nenhum dado foi alterado.**

### ✅ Etapa 3.1 — Dar uma tela viva ao reenvio da OP devolvida (A7) e apagar o `ComercialTab.tsx` (B1)

**Feito em:** 29/09/2026.

**O que foi feito:**

- **Reenvio na aba "OPLs em aberto" do CRM** (`CrmTab.tsx`), para toda OP em
  `Devolvida Comercial`:
  - sob o status, uma linha mostra **quem devolveu** (setor e nome), **quando**
    e o **motivo** (`obs_devolucao`). Quem e quando vêm do `logs_movimentacao_opl`
    (uma consulta para todas as OPs devolvidas); o motivo é a coluna da própria OP;
  - botão **`↩ REENVIAR P/ ENGENHARIA`** (roxo) ou **`↩ REENVIAR P/ FISCAL`**
    (azul), conforme quem devolveu;
  - a confirmação mostra a OP, o destino e o motivo, e pede para confirmar só
    depois de corrigir o que foi apontado;
  - o reenvio grava **só o status**, protegido contra corrida (o `UPDATE` leva
    `status_geral = 'Devolvida Comercial'`: se alguém já moveu a OP, não
    sobrescreve, avisa e não grava histórico); registra no histórico da OP
    (`setor: 'Comercial'`, status `Devolvida Comercial` → destino) e na
    auditoria; para a Engenharia dispara `op_enviada_engenharia`, como o botão
    antigo.
- **Decisão do usuário, 29/09/2026: a OP volta para quem devolveu.** Engenharia
  → `Em Espera Engenharia`; Fiscal → `Aguarda Emissao NF`. O botão antigo mandava
  sempre para a Engenharia, o que faria uma OP pronta, devolvida pelo Fiscal,
  refazer a análise de engenharia. **Medido:** as 10 OPs têm exatamente um
  registro de devolução com o setor conhecido (8 da Engenharia, 2 do Fiscal),
  então nenhuma cai no caso sem registro; se aparecer uma (status mexido à mão em
  `OplEdicao`), ela vai para a Engenharia, como o botão antigo, e a confirmação
  avisa que não há registro de quem devolveu.
- **Apagado:** `src/ComercialTab.tsx` (1.450 linhas), o `import` no
  `DashboardTab.tsx` e as 7 linhas `git add src/ComercialTab.tsx` do
  `publicar.bat` (que passariam a falhar; as duas linhas de mensagem de commit
  antigas ficaram, são histórico). Comentários e documentação que citavam o
  arquivo foram atualizados (`AnaliseInboxPanel.tsx`, `EngenhariaTab.tsx`,
  `CONTEXTO_PROJETO.md`, `ESTADO_ATUAL_PROJETO.md` §7.15). O histórico continua
  no git.

**Decisões de desenho (suposições minhas, registradas):**

- **Voltando ao Fiscal, `data_liberacao_comercial` é reiniciada.** É o que o
  "Liberar Fiscal" da mesma tela faz, e o Fiscal usa essa data como início do
  seu relógio (`tempo_fiscal_horas`). Sem isso, o tempo que o Comercial levou
  para corrigir entraria na conta do Fiscal. O custo: a data da primeira
  liberação é sobrescrita (o histórico dela continua no log da OP).
- **Voltando ao Fiscal, não há aviso por WhatsApp.** O "Liberar Fiscal" desta
  tela também não avisa, e o evento que existe (`fiscal_nf_emitida`) é o de "NF
  emitida", que vai para outro público. Se o Fiscal quiser ser avisado, é um
  evento novo, configurado em Admin → Notificações WA.
- **Sem reenvio em lote.** Cada OP devolvida tem um motivo diferente; quem
  reenvia é o Comercial, uma por uma, depois de corrigir.

**Testado** com Puppeteer e **todas as gravações bloqueadas**: as escritas ou
foram abortadas, ou respondidas de dentro do navegador (para chegar ao fim do
fluxo), sem nada chegar ao banco. Inclusive o aviso de WhatsApp da Engenharia
foi respondido no navegador: nenhuma mensagem real saiu. **20 de 20:**

| Cenário | Resultado |
|---|---|
| As 10 OPs devolvidas mostram o botão; 8 para a Engenharia, 2 para o Fiscal (as 2 que o Fiscal devolveu) | ✓ |
| Mostra quem devolveu, quando e o motivo (ex.: `↩ Engenharia · 17/09/2026`) | ✓ |
| OP em outro status não recebe o botão | ✓ |
| Abrir a tela não grava nada | ✓ |
| Confirmação cita OP, destino e motivo, sem estilo de perigo; cancelar não grava | ✓ |
| Engenharia: grava só `Em Espera Engenharia`, com a trava de status; histórico correto; aviso verde; dispara `op_enviada_engenharia` | ✓ |
| Fiscal: grava `Aguarda Emissao NF` e reinicia a data de liberação; histórico correto; não dispara aviso | ✓ |
| Corrida (a OP já mudou): avisa e **não** grava histórico | ✓ |
| Falha ao gravar: aviso vermelho e não segue | ✓ |

Depois da remoção do `ComercialTab`: build verde e os testes da Etapa 2
(CRM, 16/16) e da licitação seguem passando. **Conferido no banco depois: as 10
OPs continuam paradas em `Devolvida Comercial`, nenhuma OP mudou de status e
nenhum log de reenvio foi criado.**

**O que ficou de fora:**

- **As 10 OPs paradas não foram reenviadas.** Quem decide o que reenviar é o
  Comercial, uma por uma, depois de corrigir (regra 4 do CLAUDE.md). O reenvio
  agora existe; usar é com eles.
- **Ninguém é avisado de que há OP devolvida esperando.** O Comercial só vê ao
  abrir a aba "OPLs em aberto". Um contador de "devolvidas ao Comercial" no
  painel de "onde está isso agora" (Etapa 6) resolveria.
- **Resíduo sem mexer:** `ProducaoTab.tsx` ainda tem a tela de "Aguardando
  Agendamento Manutenção" / "Manutenção Agendada", cujo único produtor era o
  `ComercialTab` que acabou de sair. Nunca foi usada (0 registros), então não
  quebra nada; fica anotado para uma limpeza futura.

### ✅ Etapa 4 — Convergir a criação de OP num caminho só (A1)

**Feito em:** 29/09/2026.

**O que foi feito:**

- **Decisão do usuário: o formulário simplificado de OP deixa de existir.**
  Toda OP lançada à mão passa pelo `NovaOpOsModal` ("Lançar OP" do card), com
  todos os gates. A janela "Negócio Ganho — Lançar no Sistema" (aberta por
  "Lançar OS") passou a servir **só para OS**: saíram o seletor de tipo, os
  campos de OP (número, quantidade de veículos, lote misto, resumo) e o ramo de
  OP do `converterGanho` (`CrmTab.tsx`, cerca de 200 linhas). A OS segue igual.
- **Correção de um erro meu, na conversa:** eu havia afirmado que esse ramo já
  estava inalcançável. Estava errado: a janela do "Lançar OS" tinha o botão
  "Ordem de Produção". Percebi lendo o modal antes de apagar, corrigi a
  informação e o usuário decidiu de novo, já com o fato certo.
- Dos três caminhos do achado A1, sobra **um manual** (`NovaOpOsModal`); o do
  `ComercialTab` saiu na 3.1 e o do `converterGanho` saiu agora.

**Testado:** `npx vite build` verde; navegador com gravações bloqueadas: o
"Lançar OS" abre a janela **sem** opção de OP e com "Criar OS", sem erro de
página e sem gravação; teste do CRM da Etapa 2 segue 16/16.

**O que ficou de fora — decisão sua:** existe um **quarto caminho**, a OP criada
**sozinha** quando o card vira Vencido (`criarOpAutomatica`). Ele **não passa
pelos gates** do `NovaOpOsModal` (fluxo de entrega, veículo, perguntas de
configuração): copia o fluxo e o destino do card. Desde agosto, de 199 OPs, 167
nasceram sem fluxo de entrega e 179 sem itens vendidos. Alinhar isso **muda
comportamento** (exigir ou avisar no ganho do card) e depende da sua regra;
não mexi. Fica como candidato a etapa própria.

### 🟡 Etapa 5 — Um glossário só de nomenclatura (C)

Levantamento feito em 29/09/2026 e dividido em sub-etapas, cada uma
publicável sozinha. **Glossário decidido com o usuário na conversa:**

| Conceito | Nome oficial | Onde está |
|---|---|---|
| Etapa "OP pronta, esperando o Comercial liberar para o Fiscal" (`oples.status_geral`) | **`Aguardando Liberacao Comercial`** (o curto) | 5.1a ✅ código · 5.1b ✅ migração dos dados · 5.1c ⬜ apertar |
| 4º passo da liberação parcial de BOM (`oples.serralheria_status`) | **`Sanado`**, no vocabulário da serralheria e fora do menu da Produção | 5.2 ✅ |
| Última etapa da compra | **`Recebido`** (nunca "Concluído" nas compras) | 5.2 ✅ |
| Item que liga a montagem automática do material | **Conjunto Elétrico** (nome do catálogo). A coluna `eh_conjunto_instalacao` **não muda**: é nome interno | 5.3 ✅ |
| Sigla da ordem de produção nas telas | **OP**. Nomes internos (`opl`, `numero_opl`, tabela `oples`), o dado `tipo_op` (OPL = ACN, OPD = Detech) e o que as pessoas digitaram **não mudam** | 5.4 ✅ |

#### ✅ 5.1a — Status "aguardando liberação comercial": um nome oficial, os dois reconhecidos

**Feito em:** 29/09/2026 (código; **nenhum dado foi alterado**).

**O que foi feito:**

- **Regra central em `FluxoEntrega.ts`:** `STATUS_AGUARDANDO_LIBERACAO_COMERCIAL`
  (o oficial), `STATUS_AGUARDANDO_LIBERACAO_COMERCIAL_ANTIGO`,
  `STATUS_LIBERACAO_COMERCIAL_TODOS` e `aguardaLiberacaoComercial()`, com o
  porquê documentado. Ninguém mais compara com o texto solto.
- **Quem grava passou a gravar o oficial:** o CQ ao aprovar
  (`statusAposCqAprovado`, usado por `QualidadeTab`), o Almoxarifado no FOB e a
  Logística ao entregar o frete (as duas já gravavam o curto; agora pela
  constante).
- **Quem lê passou a reconhecer os dois:** `AcnTabShared` (barra de progresso,
  botão "Liberar para o Fiscal" do detalhe), `CrmTab` (cor, botão "Liberar
  Fiscal" e o lote), `OplEdicao` (a lista de status que o Admin pode escolher
  agora oferece o oficial), `QualidadeTab` (texto do histórico), **`RelatoriosTab`
  (7 listas e a cor — antes só o longo)** e **`MarketingTab` (5 pontos — antes
  só o longo)**.
- **Banner do detalhe da OP:** "APROVADO PELO CQ — AGUARDANDO LIBERAÇÃO COMERCIAL"
  agora só diz "aprovado pelo CQ" quando `resultado_cq = 'Aprovado'` (as 188 OPs
  do nome longo têm; as 2 de envio, que não passam por CQ, não têm). Antes o
  banner afirmava CQ para OP que nunca passou por ele.
- **Correção visível já nesta etapa:** as 2 OPs de envio (`A1671.2609` e
  `A1664.2609`) passam a aparecer nos relatórios "Finalizadas" e "OPLs Geral >
  Finalizadas".

**Por que o nome antigo continua reconhecido:** (1) os históricos guardam o
nome como foi escrito na época e história não se reescreve; (2) uma aba antiga
aberta no navegador pode gravá-lo depois da publicação.

**Testado** com Puppeteer e **todas as gravações bloqueadas**; dados reais em
leitura (188 no nome longo, 2 no curto). **26 de 26**, mais as regressões das
etapas anteriores (CRM 16/16, reenvio 20/20, Engenharia 13/13, "Lançar OS"):

| Cenário | Resultado |
|---|---|
| Regra central: reconhece os dois nomes e só eles; CQ aprovado passa a gravar o oficial; serralheria com envio continua indo para a embalagem | ✓ |
| Relatórios "Finalizadas": a consulta pede os dois nomes e as 2 OPs de envio aparecem, junto das do CQ | ✓ |
| Relatórios "OPLs Geral > Finalizadas": idem | ✓ |
| CRM "OPLs em aberto": botão "Liberar Fiscal" nas 2 OPs de envio (2/2) e nas do CQ (51/51) | ✓ |
| Detalhe da OP: OP de envio sem "aprovado pelo CQ"; OP do CQ com | ✓ |
| Marketing (linhas simuladas na tela): pipeline completo para os dois nomes; filtro "Concluidas" mostra os dois | ✓ |

**Efeito a ter em mente na migração (5.1b):** no Marketing, o filtro "Em
Producao" reconhece por pedaço de texto ("contém CQ"). Depois da migração, as
OPs migradas deixam de casar ali (o nome curto não tem "CQ") e ficam só em
"Concluidas" — o que é o correto, mas é uma mudança que as pessoas vão notar.

#### ✅ 5.1b — Migrar os dados do status

**Feito em:** 29/09/2026, **depois de a 5.1a estar no ar** (conferido no bundle
publicado: já tinha a regra dos dois nomes e "OPs em aberto") e **com a
autorização do usuário**, dada na conversa.

**Resultado:** migração `oples_status_liberacao_comercial_nome_unico`, **uma**
atualização em `oples.status_geral`, com trava (se as linhas atualizadas fossem
diferentes das contadas antes, desfazia tudo). **188 OPs** passaram de
`Aprovado CQ - Aguardando Liberacao Comercial` para `Aguardando Liberacao Comercial`:

| | Antes | Depois |
|---|---|---|
| Nome antigo (longo) | 188 | **0** |
| Nome oficial (curto) | 2 | **190** |
| Total de OPs | 331 | 331 |

As 188 migradas têm `resultado_cq = 'Aprovado'`: o "passou pelo CQ" continua
registrado ali. **Histórico intacto:** 234 linhas de `logs_movimentacao_opl` e 119 de
`audit_log` seguem com o nome de época. As 2 OPs de envio (`A1664.2609`,
`A1671.2609`) ficaram como estavam.

**Testado depois da migração** (dados reais, gravações bloqueadas): status 13/13,
banner/Marketing/Financeiro/PCP 13/13, CRM 16/16, reenvio 20/20; na aba "OPs em
aberto" as 53 linhas visíveis no oficial têm "Liberar Fiscal".

**Efeito que as pessoas vão notar:** o texto do status das 188 OPs fica mais curto
("Aguardando Liberacao Comercial") nas tabelas; e, no Marketing, as OPs migradas
saem do filtro "Em Producao" (que reconhecia por "contém CQ") e ficam só em
"Concluidas".

**Como foi verificado antes de propor:**

- **Sem dependência no banco:** nenhuma regra, função, visão ou política cita o
  texto; os dois gatilhos de `oples` são inofensivos para uma troca de status
  (`trg_atualizar_lead_time` só age quando `data_entrega` é preenchida;
  `trg_sync_norm` recalcula colunas de busca).
- **Funções de borda:** `whatsapp-webhook` e `smart-task` não leem status de OP.
- **Histórico não se toca:** `logs_movimentacao_opl` (236 linhas em
  `status_novo`, 46 em `status_anterior`), `audit_log` (121 em `new_value`, 2 em
  `old_value`) e `lixeira` (1) guardam o nome de época.
- **Para desfazer, se preciso:** as 2 OPs que já eram do nome curto antes da
  migração são `A1671.2609` e `A1664.2609`; todas as demais eram do longo.

#### ⬜ 5.1c — Apertar o código

Tirar o nome antigo de `STATUS_LIBERACAO_COMERCIAL_TODOS` (uma linha em
`FluxoEntrega.ts`) **só depois** de conferir no banco que nenhuma OP voltou a
ter o nome antigo desde a migração de 29/09/2026. Esse é o passo "aperta o
código" do princípio 4. Manter a leitura do nome antigo em qualquer tela que
consulte **histórico**, se aparecer alguma.

**Medido em 29/09/2026 (11h UTC): a contagem em zero ainda não prova nada.** A
regra dos dois nomes foi ao ar às **06h07 UTC** e, desde então, **não houve nenhuma
aprovação no CQ** (a última foi em 25/09; são 203 em um mês e meio, uns 4 por dia
útil). O nome antigo só seria gravado por uma **aba antiga** aprovando uma OP no CQ,
então "zero OPs com o nome antigo" só vale depois que houver aprovações para
testar. **Critério para apertar:** pelo menos ~10 aprovações no CQ depois do deploy,
**todas** com o nome oficial, e alguns dias úteis passados:

```sql
select count(*) filter (where status_novo = 'Aguardando Liberacao Comercial') as oficial,
       count(*) filter (where status_novo = 'Aprovado CQ - Aguardando Liberacao Comercial') as antigo
  from logs_movimentacao_opl
 where setor = 'CQ' and evento like 'Auditoria CQ APROVADA%'
   and data_hora > '2026-09-29 06:07+00';
```

Só apertar com `antigo = 0` e `oficial` em torno de 10 ou mais. (Aprovação de OP
de serralheria com envio grava `Aguardando Embalagem` e não entra nessa conta.)

**Medido de novo em 30/09/2026 (11h UTC): critério ainda não cumprido, 5.1c não foi apertada.**
Aprovações no CQ desde o deploy: **0** (a última continua sendo a de 25/09, do auditor
FELIPE OLIVEIRA); OPs com o nome antigo agora: **0**. O zero segue sem provar nada, pelo
mesmo motivo: não houve aprovação para testar. Voltar a medir quando o CQ voltar a aprovar.

#### ✅ 5.2 — Vocabulário sem dado: `Sanado` e o Financeiro

**Feito em:** 29/09/2026 (código; **nenhum dado foi alterado**).

- **`Sanado`** (`serralheria_status`): documentado em `FluxoEntrega.ts` como
  `SERRALHERIA_SANADO`, com o mapa das **duas trilhas** que dividem a coluna:
  Produção (Pendente → Em Execucao → Concluido) e Liberação parcial de BOM
  (Pendente → Concluido → **Sanado**, este último pelo PCP). Ficou **fora** de
  `SERRALHERIA_STATUS` de propósito: essa lista alimenta o menu da Produção, e a
  Produção não sana pendência. O `PCPTab` passou a usar a constante.
- **Financeiro** (`FinanceiroTab.tsx`): apagada a cópia própria de cores
  (`STATUS_COR`, que tinha a chave morta `'Concluído'` e **não tinha
  `'Recebido'`**) e passou a usar `COR_ETAPA_COMPRA`, de `ComprasFluxo`. As
  compras recebidas (20 hoje) deixam de aparecer em cinza. O cartão e a coluna
  "Concluídas" viraram **"Recebidas"** (e as variáveis também). O "Concluído" do
  Kanban de Tarefas fica: é outro conceito (`financeiro_tarefas.etapa`) e agora
  não se confunde com o das compras.
- **Testado** (13 de 13 junto com o banner e o Marketing): PCP com uma OP
  simulada de serralheria concluída — sanar grava exatamente
  `{"serralheria_status":"Sanado"}` (só esse campo) e o histórico; Financeiro
  mostra "Recebidas" e o selo de "Recebido" em verde.
- **Não mexi (fora do escopo, outra sessão):** `Estoque.tsx` ainda tolera
  `'Concluído'` nas compras (`COMPRA_ENCERRADA`) e `'Concluida'` nas fabricações;
  é a frente de `'Concluida'` que o plano cita no achado C como rodando à parte.
  No banco de compras não sobrou nenhum `'Concluído'`, então a tolerância pode
  ser apertada lá.
- **Observação:** a mesma coluna `serralheria_status` é usada em duas trilhas com
  os mesmos valores `Pendente` e `Concluido`. Hoje não colidem, mas uma OP que
  passe pelas duas mistura os significados.

#### ✅ 5.3 — "Conjunto Elétrico" nas telas

**Feito em:** 29/09/2026 (só texto; **nenhum dado foi alterado**).

- "Conjunto de Instalação" virou **Conjunto Elétrico** nas duas mensagens de
  `AplicarEstrutura.tsx` ("Sem Conjunto Elétrico nesta venda…" e "Esta venda leva
  Conjunto Elétrico, mas a OP não tem veículo do catálogo"), no marcador de
  `ConfigEstruturaTela.tsx` ("Este item é o Conjunto Elétrico") e nos comentários
  de `ConfigEstrutura.ts` e `PerguntasDaVenda.tsx`.
- A coluna `eh_conjunto_instalacao` **não mudou**; um comentário em
  `itensConjunto()` diz que é o "Conjunto Elétrico" e por quê o nome da coluna
  ficou (renomear coluna não vale o risco para um nome que ninguém vê).
- O título "Estrutura de instalação" da aba do Admin **fica**: é outro conceito
  (a estrutura de material por veículo), não o item Conjunto.
- **Testado:** o aviso "Sem Conjunto Elétrico nesta venda" aparece no modal de
  liberar BOM de uma OP real, sem nenhum resto de "Instalação"; o marcador do
  Admin aparece com o nome novo (selecionando um item que o seletor enxerga — ver
  A8 e 5.5).

#### ✅ 5.4 — "OP" no lugar de "OPL" nas telas

**Feito em:** 29/09/2026 (só texto; **nenhum dado foi alterado**).

**O que foi feito:** **154 ocorrências em 151 linhas de 20 arquivos**, trocadas
por arquivo e linha a partir de uma lista revisada (nenhuma troca cega): rótulos
de tabela, títulos de tela e de janela, abas (**"OPs em aberto"** no CRM e
**"OPs Geral"** nos Relatórios), contadores com plural ("329 OPs"), mensagens de
confirmação, placeholders, rótulos do Admin, os modelos de notificação por
WhatsApp (`whatsappHelper.ts`) e os textos que o sistema grava no histórico da OP
daqui em diante ("OP liberada para emissão de NF pelo Fiscal.").

**O que NÃO mudou, de propósito (11 linhas):**

- **`tipo_op: 'OPL'`** (`NovaOpOsModal.tsx`): é **dado**, não sigla — na tabela,
  `OPL` = OP da ACN (324 OPs) e `OPD` = OP da Detech (7). Descoberto ao classificar:
  "OPL" não era sempre um sinônimo de "OP".
- **O tipo de documento "OPL" de Vistorias** (3 registros; o texto da opção *é* o
  valor gravado) e o rótulo "Nº OPL / OPD / PV" que lista esses tipos; e o
  placeholder "Numero da OPL ou OPD…" do Marketing — o par OPL/OPD (ACN/Detech).
- A regex de siglas em `Interface.tsx`, e comentários.
- **O que as pessoas digitaram** (títulos de card como "OPL D 777.2609 - IBICARE…",
  motivos de devolução): é dado e fica como está.
- **O histórico já gravado** (`logs_movimentacao_opl.evento`) continua com "OPL".

**Verificado antes de trocar:** nenhum código decidia nada pelo texto "OPL"
(nenhuma comparação, regex ou `includes` nas linhas trocadas; nenhum código
compara o texto de `evento`). Um defeito da própria troca foi pego na revisão do
diff: `'OP / OPL'` virou `'OP / OP'` e foi corrigido para `'OP'`.

**Testado** (21 verificações com gravações bloqueadas): varredura de rótulos,
cabeçalhos, botões, dicas e placeholders de 11 telas + as 5 abas dos Relatórios +
a aba "OPs em aberto" do CRM: **nenhum "OPL" restante** (a varredura ignora dado
de linha e de cartão, que é digitado por pessoas). Regressões das etapas
anteriores: CRM 16/16, reenvio 20/20, status 13/13, banner/Marketing/Financeiro/PCP
13/13, Engenharia 13/13, licitação e "Lançar OS".

**Efeitos que as pessoas vão notar:** a aba do CRM passa a se chamar "OPs em
aberto" (os trechos deste plano que dizem "OPLs em aberto" descrevem o nome de
antes); as mensagens de WhatsApp saem com "OP"; no histórico de uma OP, os eventos
antigos dizem "OPL" e os novos "OP". Uma linha de `Estoque.tsx` (1710, texto de
tela) foi tocada — é o único ponto que não é do fluxo.

#### ✅ 5.5 — Corrigir o corte de 1.000 itens nas duas telas de item (A8)

Bug funcional achado na 5.3, **fora do escopo da nomenclatura**.

**Feito em:** 29/09/2026 (código; **nenhum dado foi alterado**).

**O que foi feito:**

- **Uma função só para as duas telas:** `itensAtivosDoCatalogo(colunas)` em
  `ConfigEstrutura.ts` lê os itens ativos em blocos de 1.000 (`.range`, o mesmo
  padrão do `CadastroItensTab`) até acabar. Ordena por nome **e desempata por id**:
  o catálogo tem nomes repetidos ("CONJUNTO ELÉTRICO" três vezes, "COPIA DE
  CONJUNTO ELETRICO PV 67" quatro) e, sem esse desempate, o banco pode embaralhar os
  empatados na virada de página — item que aparece duas vezes ou que some. Se uma
  página falhar no meio, o erro vai para o console em vez de a lista incompleta
  passar por completa (foi esse silêncio que escondeu o corte).
- **As duas telas passaram a usá-la:** `useItens` (Admin > Estruturas,
  `ConfigEstruturaTela.tsx`) e `useTodosOsItens` (estrutura do chicote, `Estoque.tsx`).
  O resto das duas telas não mudou; o seletor continua o mesmo `SelectBusca`.
- **Por que paginar e não buscar no servidor:** o seletor já busca no navegador,
  sem acento e por palavras, e trocá-lo mexeria na tela toda. O preço são 5 leituras
  seguidas (~4.400 linhas) a cada abertura da tela — **o tempo de abertura não foi
  medido**. Se o catálogo passar de algumas dezenas de milhares de itens, o caminho
  é a busca no servidor (como `DemandaItens` e a Formação de Preços já fazem).
- **`Estoque.tsx` é da frente do estoque:** antes de editar, conferi que `main`
  estava no mesmo commit e que não havia outra worktree aberta — sem colisão. Foram
  tocadas só duas coisas ali: o `import` e o corpo de `useTodosOsItens`.

**Testado** (16 de 16, navegador automatizado com **gravações bloqueadas** — nenhuma
tentativa de gravar; nenhum dado alterado):

- **A premissa continua valendo:** pedir 5.000 linhas ao servidor hoje devolve 1.000.
- **Admin > Estruturas:** 5 leituras (a partir de 0, 1.000, 2.000, 3.000 e 4.000),
  **4.429 itens, 4.429 códigos distintos** (nenhum repetido entre páginas), na ordem
  nome + id. Buscando "conjunto eletrico" o seletor acha 438 resultados; o item
  **1687 — CONJUNTO ELETRICO** aparece e, ao escolhê-lo, a tela mostra o marcador
  **"Este item é o Conjunto Elétrico"** (**desmarcado — não cliquei nele**). Um item
  do fim do alfabeto (3581 — VISOR DE OLEO…, letra V) também é achado.
- **Estrutura do chicote** (aberta no chicote 116, "CHICOTE AUXILIAR PARA TOMADA
  12V"): a mesma leitura, 5 blocos, 4.429 itens sem repetição; o material **3581 ·
  VISOR DE OLEO…** é achado, e "terminal" lista 57 materiais (letra T).

**Números medidos no banco (só leitura):** 4.429 itens ativos; **429** começam com
"CONJUNTO ELETRICO" (o levantamento do A8 dizia 432); **0** itens marcados como
interruptor.

**O que continua com o usuário:** os itens "CONJUNTO ELETRICO" agora **aparecem** no
seletor e podem ser marcados, mas **nenhum foi marcado**. Marcar liga a montagem
automática do material nas OPs novas — decisão do estoque (Etapa 7 do plano de
estoque), não desta correção. Falta decidir **quais** itens marcar (só o genérico
1687? os 429?).

**Visto de passagem, sem mexer:** `Estoque.tsx` (lista de itens com controle de
estoque) lê `cadastro_itens` sem `limit` e, portanto, também esbarraria nas 1.000
linhas. Hoje são **20** itens — longe do corte —, então não precisa de correção
agora; vale lembrar se o controle de estoque for ligado em massa. As demais leituras
de `cadastro_itens` são buscas com `limit` pequeno (6 a 200) ou por `id`/código.

#### ✅ 5.6 — Mapa de "não lido" sem o corte de 1.000 (A9)

**Feito em:** 29/09/2026. **Nenhum dado foi alterado.** Uma migração **aditiva** no
banco (uma função de leitura), autorizada pelo usuário na conversa.

**Reprodução (dados reais, só leitura):** para cada usuário que já abriu alguma
entidade, comparei as alterações não vistas **de verdade** com as que a consulta
cortada em 1.000 enxergava:

| Tipo | Não vistas (certo) | Escondidas pelo corte | Usuários afetados |
|---|---|---|---|
| Licitações | 898 | **298 (33%)** | **12 de 12** |
| OPs | 2.457 | **605 (25%)** | **11 de 12** |
| Oportunidades do CRM | 588 | 0 | 0 |

**O que foi feito:**

- **Migração `funcao_entidades_com_alteracao_nao_vista`:** função
  `entidades_com_alteracao_nao_vista(p_tipo, p_ids, p_user)`, só leitura
  (`STABLE`, `SECURITY INVOKER`). Faz no banco a conta que o navegador fazia:
  a entidade é "não lida" quando a alteração mais nova **de outra pessoa** é
  posterior à última vez que este usuário a abriu (`entity_views.last_seen_at`) ou
  quando ele nunca a abriu. Alteração sem autor não conta, igual ao `.neq` de antes.
  Para desfazer: `DROP FUNCTION public.entidades_com_alteracao_nao_vista(text, text[], uuid);`.
- **`AuditSystem.tsx` (`useUnreadMap`)** passou a chamar a função: **1 chamada** com os
  ids da lista e devolve só os ids não lidos (o comentário do hook já prometia "N cards
  sem fazer N consultas"; o corte quebrava isso). Se a função falhar, o **caminho
  antigo continua como reserva** e o erro vai para o console, sem silêncio.

**Prova de equivalência (no banco, antes de mexer no código):** para todos os
usuários e os 3 tipos, o resultado da função é **idêntico** à regra completa escrita
de outro jeito — **588 / 898 / 2.457, com 0 faltando e 0 sobrando** —, enquanto a
consulta cortada dava 588 / **600** / **1.852**.

**Testado no navegador** (gravações bloqueadas; a única chamada liberada é a função
de leitura), **9 de 9**:

- **OPs em aberto:** a tela chama a função com as 329 OPs e ela devolve **218**
  (o código antigo mostraria 154); a tabela mostra linhas destacadas (63 visíveis).
- **Licitações:** devolve **90** (o código antigo: 61). Eram 92 auditadas, mas 2
  licitações já não existem na tabela — a expectativa inicial do teste (92) estava
  errada, não a função.
- **Reserva:** com a função derrubada, o erro aparece no console e o destaque
  continua funcionando (39 linhas) pelo caminho antigo.
- **Regressões:** CRM 16/16, reenvio 20/20, status 13/13, banner/Marketing/
  Financeiro/PCP 13/13, "OP/Conjunto" 21/21, Engenharia 13/13.

**Efeito que as pessoas vão notar:** aparecem destaques de "não lido" que estavam
escondidos — em especial nas licitações e OPs mais antigas. Para quem nunca abriu uma
entidade, ela conta como "não lida" desde que alguém tenha alterado (regra de
sempre); por isso o número inicial pode parecer alto.

**O que ficou de fora:** o destaque de **campo** dentro de uma entidade
(`useUnreadChanges`) lê a auditoria de **uma** entidade só, então não tem o problema.

### ✅ Etapa 6 — Painel único "onde está isso agora" — o coração do pedido

Feita em fatias, na ordem escolhida pelo usuário: **6.1** faixa no detalhe da OP e no
Dossiê ✅ · **6.2** coluna na lista "OPs em aberto" ✅ · **6.3** selo no card do CRM ✅.

**Levantamento (29/09/2026, dados reais):**

- **O Dossiê já existia** (ver a correção no achado D). Faltava o relance.
- **A trilha "PV → OP" só existe para 18% das OPs:** das 331, **59 têm card do CRM** e
  **nenhuma** tem pedido de licitação ligado; **272 (82%) nascem sem origem ligada**.
  Por isso o painel é **centrado na OP**, não no card.
- **"Desde quando" quase sempre existe:** das 329 OPs em aberto, **325** têm um evento no
  histórico que levou a OP à etapa de hoje; **4 não têm** (as quatro em "Em Espera
  Engenharia"). Nelas a data vem do último marco registrado na própria OP, e a tela avisa
  que é aproximada. Média de 20,4 dias na etapa, máxima de 71.
  *(Correção feita na 6.2, em 29/09/2026: este levantamento dizia "139 têm, 190 não têm".
  Estava errado — foi medido comparando o nome antigo da liberação comercial com `===`, e
  as 188 OPs migradas guardam o evento com esse nome antigo. Com a comparação certa, por
  `mesmaEtapa()`, são 325 × 4. O código da faixa já estava certo; só o número escrito aqui.)*
- **A fila escondida que o painel revela:** das 329 OPs em aberto, **190 (58%) estão em
  "Aguardando Liberação Comercial"**: 10 há até 7 dias, 110 entre 8 e 30 dias e **70 há
  mais de 30 dias** (a maior há 61), 32 delas com card do CRM. Pode ser fila real ou OPs
  já entregues que ninguém avançou no sistema; **não mexi em nenhuma** (regra 4).

**Decisões do usuário (29/09/2026):** aparecer **nos três lugares**; o conteúdo é
**etapa, setor, desde quando e pendências**, mais frete e NF quando existem; e o "há
quantos dias" é **só o número, sem cor de alerta** (as metas do Dashboard foram feitas
para tempo de trabalho, não para fila parada de semanas).

#### ✅ 6.1 — A faixa "Onde está agora" no detalhe da OP e no Dossiê

**Feito em:** 29/09/2026. **Nenhum dado foi alterado.**

- **`EtapasOp.ts` (novo) é agora a fonte única das etapas.** Os nomes e percentuais
  moravam num vetor privado do `AcnTabShared` (só para a barra de progresso); passaram
  para lá, ganharam `setor` (com quem a OP está) e `estado` (o que ela espera), e a
  barra continua **exatamente igual** (verificado para os 22 status). Traz também
  `mesmaEtapa()`, `desdeQuandoNaEtapa()`, `diasDesde()`, `textoDias()` e `textoData()`.
- **`OndeEstaAgora.tsx` (novo) desenha a faixa:** `📍 Setor — estado`, `⏱ desde dd/mm
  (há N dias)`, `⚠ N pendências abertas` (clicável: abre o Dossiê), `🚚 Frete: status` e
  `🧾 NF` só quando existem, e `📦 Entregue em` nas concluídas. Cor: azul normal, âmbar
  em devolvida/retrabalho, verde em concluída. **Sem cor de alerta por tempo.**
- **Onde aparece:** no topo do detalhe da OP (acima da barra de progresso; o detalhe
  relê a OP inteira, porque recebe linhas parciais das listas) e no topo do Dossiê
  (que já tinha os dados carregados e só os repassa).
- **"Desde quando":** primeiro o último evento do histórico que **levou** a OP ao status
  de hoje (anotação com o mesmo status antes e depois não conta); se não houver, o último
  marco registrado, marcado com "≈" e uma dica dizendo qual marco; se não houver nada,
  "sem registro". **O histórico guarda o nome antigo da liberação comercial** (Etapa 5):
  a comparação é por `mesmaEtapa()`, nunca por `===`; é a primeira leitura de histórico
  por nome no sistema, e é por isso que a 5.1c ainda pede cuidado.
- **Suposição minha, registrada:** a coluna `estado` ("na fila, aguardando iniciar a
  análise", "cotando o frete"…) é redação minha a partir dos nomes já existentes; e o
  setor de cada status também (por exemplo, "Kit OK - Aguardando PCP" é do PCP, e
  "Faturado e Disponivel para Entrega" é do Comercial). Ajustar é uma linha em
  `ETAPAS_OP`.

**Testado** (25 verificações; navegador automatizado com **gravações bloqueadas**):

- **Regras (9):** a barra não mudou em 22 status; todo status conhecido tem setor (menos
  o "Faturado", ciclo fechado); status desconhecido volta como está; os dois nomes da
  liberação são a mesma etapa; "desde" acha o evento **pelo nome antigo** e ignora
  anotação; cai no marco e diz qual; textos de dias e datas.
- **Detalhe da OP com casos reais (10):** OP de envio (A1671.2609, "desde 28/09");
  **OP migrada** (A1656.2609, evento gravado com o nome antigo, "desde 25/09"); devolvida
  (1625.2609, âmbar, "desde 17/09"); com frete (0756.2609, "Frete: Cotação"); a faixa vem
  antes da barra e a barra segue igual.
- **Dossiê (5):** 1525.2609/01 ("Engenharia — em análise", "desde 17/09", "3
  pendências"); a faturada sem evento (1403.2026: "Concluída", "desde ≈ 06/07", "NF 123",
  "Entregue em 06/07", com a dica da data aproximada).
- **Botão de pendências (4):** no detalhe da 1525.2609/01, clicar em "3 pendências" abre
  o Dossiê, que mostra a sua própria faixa e o banner.
- **Regressões:** CRM 16/16, reenvio 20/20, status 13/13, banner/Marketing/Financeiro/PCP
  13/13, "OP/Conjunto" 21/21, "não lido" 9/9, Engenharia 13/13, licitação.

**O que ficou de fora:** o **link direto** do frete da faixa para o registro na Logística
(o achado D, 2º item): hoje a faixa diz o status do frete, mas não abre o registro. O
"quanto a OP já gastou" e a "aba pendente da minha aprovação" (3º e 4º itens do achado D)
seguem para a Etapa 8 e uma etapa própria.

#### ✅ 6.2 — Coluna "Onde está / desde" na lista "OPs em aberto"

**Feito em:** 29/09/2026. **Nenhum dado foi alterado**; uma função de leitura foi criada no
banco (com autorização do usuário).

- **A coluna** vem logo depois de "Status": `📍 setor` (com a etapa na dica), `⏱ há N dias ·
  dd/mm` e `⚠ N pend.` quando há pendência. Sem cor de alerta por tempo (decisão da 6.1).
  A data aproximada (último marco, para quem não tem o evento) leva "≈" e uma dica dizendo
  qual marco. Na linha do **lote**, aparece "a mais parada: há N dias" (a maior entre as
  unidades).
- **Ordem nova "Parada há mais tempo"**, ao lado do filtro de status: a OP que entrou na
  etapa de hoje há mais dias vem primeiro, sem data vai para o fim, e cada lote fica junto,
  na posição da sua unidade mais parada. A ordem de antes (entrada, mais nova primeiro)
  continua sendo a inicial e volta ao escolher de novo.
- **Função no banco `desde_quando_na_etapa(p_ids uuid[])`** (migração
  `funcao_desde_quando_na_etapa`, só leitura, aditiva; desfazer com `DROP FUNCTION
  public.desde_quando_na_etapa(uuid[])`). Devolve, para cada OP, a data do último evento do
  histórico que a levou ao status de hoje, com a **mesma regra** de `desdeQuandoNaEtapa`
  (anotação com o mesmo status não conta; os dois nomes da liberação comercial são a mesma
  etapa). Foi para o banco porque o histórico tem 2.428 linhas e o servidor corta em 1.000
  por leitura (achado A8/A9) — mesmo desenho da 5.6. A tela chama a função **uma vez**, com
  as 329 OPs. Se ela falhar, a lista continua e mostra só as datas aproximadas (o erro vai
  para o console).
- **Pendências na lista** (decisão do usuário): só as que **seguram a OP** — demanda de
  Serralheria, Chicotes ou Compras e pedido de compra que ainda não fechou as três etapas —,
  pelo `indicePendencias()` que a Produção e o Almoxarifado já usam (3 leituras para a lista
  toda). **A faixa do detalhe conta mais tipos** (ajustes, engenharia), então os números
  podem diferir; o detalhe é o completo.
- **`EtapasOp.ts`** ganhou `desdeQuandoEmLote()` (chama a função), `desdeQuandoDaLista()`
  (evento, senão marco) e `COLUNAS_MARCOS_OP` (as colunas que a lista precisa trazer).
  `OndeEstaAgora.tsx` ganhou `OndeEstaCelula`. A 6.3 reaproveita `desdeQuandoEmLote()`.

**Provado no banco antes de ligar a tela:** a função e uma consulta escrita à parte
(ordenando o histórico do mais novo para o mais velho) deram a **mesma data em 325 de 325
OPs**, 0 divergentes; e por status, todas têm evento (43 "Aguardando Início Produção", 28
"Kit OK", 24 "Aguarda Emissão NF"…), menos as 4 "Em Espera Engenharia".

**Testado** (30 verificações; navegador automatizado com **gravações bloqueadas**, só a
função de leitura liberada):

- **A coluna contra uma conta feita à parte:** o teste lê o histórico inteiro direto do
  banco (paginado), refaz a regra em JavaScript e compara com o que a tela mostra para
  **cada uma das 329 OPs**: dias, data e "≈" — **329 de 329 iguais**, 325 por evento e 4
  aproximadas. As quatro OPs de referência da faixa (A1671.2609 "28/09", A1656.2609 "25/09"
  — a migrada —, 1625.2609 "17/09", 0756.2609 "18/09") mostram a mesma data na lista e no
  detalhe.
- **Pendências:** as 34 OPs que a lista marca com "⚠" e o número de cada uma (1525.2609/01
  = 3, 1525.2609/02 = 2, as 27 unidades da 1583.2608 = 2 cada…) batem com uma consulta
  independente no banco.
- **Ordem:** 71, 71, 71, 71, 64, 61… até 1, 1, 1, 1; o maior está no topo; nenhum lote se
  separa; as mesmas 329 OPs continuam na lista; voltar à ordem de entrada restaura a lista
  exatamente como estava.
- **Lotes:** as 21 linhas de lote mostram "a mais parada" e o número é o maior das unidades.
- **Falha simulada:** com a função do banco fora do ar a aba abre, mostra as 329 OPs, todas
  com "≈" (marco) e o erro no console.
- **Regressões:** CRM 16/16, reenvio 20/20, status 13/13, faixa do detalhe 21/21 e botão de
  pendências 4/4, "não lido" 9/9. Nenhuma gravação foi tentada em nenhum teste.

**O que ficou de fora:** o **selo do card** (6.3). Os números de pendência da lista e da
faixa podem diferir, como dito acima.

**Observado no caminho e não mexido (regra 4):** a OP **1516.2608** tem o prazo de entrega
gravado como **62026-10-20** (ano com cinco dígitos, erro de digitação) e a lista mostra
"Invalid Date" nessa célula; e 4 números de OP têm espaço sobrando nas pontas (" A
1453.2607 - ESL AUTO CENTER", " A 1470.2607 - PREMIUM AUTOMOTIVE", " D 710.2607 - COMANDO
MILITAR DO SUL", "OPL A1436.2707 "). Corrigir é decisão do usuário.

#### ✅ 6.3 — Selo "onde está" no card do CRM

**Feito em:** 29/09/2026. **Nenhum dado foi alterado**; nenhuma função nova no banco (reaproveita
`desde_quando_na_etapa`, da 6.2).

- **O card** (coluna "Vencido", onde o selo `OP A1234.0926` já morava desde a Etapa 2) ganhou,
  ao lado dele, um **segundo selo com o setor e os dias**: `Engenharia · há 12 dias`. Azul
  normal; **âmbar** se alguma OP do card está devolvida/em retrabalho; sem cor de alerta por
  tempo (decisão da 6.1). A data aproximada leva "≈". **Clicar em qualquer um dos dois abre o
  detalhe da OP** (com a faixa "Onde está agora" da 6.1 no topo); o selo do número continua com
  o mesmo texto de antes.
- **Por que dois selos e não um só:** o card tem ~210px úteis e o selo do número já ocupa 117;
  um selo único (`OP A1234.0926 · Engenharia · há 12 dias`) passaria da borda. Lado a lado, o
  segundo desce para a linha de baixo quando não cabe. Desvio pequeno do que o plano dizia.
- **Card com várias OPs** (lote, venda desmembrada — 4 cards hoje, até 4 OPs): o selo mostra
  **uma frase** — o setor (ou "N setores", se as unidades estão em lugares diferentes) e os dias
  da unidade **há mais tempo na etapa**, que é a que pede atenção. A dica lista **cada OP** com
  setor, estado e data. Clicar abre a **primeira unidade** (no detalhe há o "Resumo do lote"),
  o mesmo comportamento do botão "Ir para a OP" do card aberto.
- **`Selo` (`Interface.tsx`) ganhou `onClick`:** com ele, vira um `<button>` (teclado, foco
  visível e leitor de tela funcionam) com a mesma aparência (`design.css`, `.acn-selo.clicavel`).
  Sem `onClick` continua sendo o mesmo `<span>` de sempre, então nenhuma outra tela muda.
- **`EtapasOp.ts`** ganhou `resumoDasOps()` (a frase, a cor e a dica do selo). No `CrmTab`, a
  consulta que já trazia os números das OPs por card passou a trazer também id, status e as
  colunas dos marcos, e **uma** chamada à função do banco (com as OPs abertas dos cards) traz o
  "desde quando". Ela roda **fora do caminho principal**: o selo do número aparece na hora e o
  segundo chega depois, sem atrasar o Kanban.
- **Só na coluna "Vencido"**, onde o selo já aparecia: **3 dos 53 cards com OP estão fora dela**
  — 2 em "Faturado" e 1 em "Enviado" — e nesses o selo não aparece (ver "O que ficou de fora").

**Testado** (23 verificações; navegador com **gravações bloqueadas**, só a função de leitura
liberada):

- **O texto do selo de cada card contra uma conta feita à parte:** o teste lê cards, estágios,
  OPs e o histórico inteiro direto do banco, refaz a regra em JavaScript e compara com a tela:
  **50 de 50 cards iguais** (setor, "≈" e dias). Cor: 5 âmbar e 45 azuis, todos conforme a
  regra. Os dois selos são botões; a dica traz uma linha por OP e a instrução de clique; os
  4 cards de várias OPs avisam que o número é o da unidade mais parada.
- **Clique:** o card de uma OP em produção abre a `D0775.2609` e a faixa diz "Produção" e
  "desde 28/09", como o selo; o de OP devolvida abre a `1625.2609` ("Comercial", "desde
  17/09"); o de várias OPs abre a primeira unidade (`A1660.2609/01`). O selo do número abre a
  mesma OP, e **Enter no teclado** também. Abrir não grava nada.
- **Falha simulada:** com a função do banco fora do ar, os 50 cards continuam com o selo do
  número e o "onde está" cai no marco (todos com "≈"), com o erro no console.
- **Modo escuro** conferido em imagem (cores e legibilidade do selo).
- **Regressões:** CRM 16/16 (o teste antigo lia o texto da linha inteira; passou a ler só o
  selo do número), lista da 6.2 30/30 (idem: o Kanban agora também chama a função, então o
  teste passou a olhar a chamada da aba "OPs em aberto"), reenvio 20/20, status 13/13, faixa do
  detalhe 21/21 e 4/4, "não lido" 9/9, "Lançar OS" e licitação sem erro. Nenhuma gravação foi
  tentada além do registro de "última visualização" que abrir um detalhe já fazia antes (o
  teste o tolera e, se aparecer, é barrado como toda gravação).

**O que ficou de fora:**

- **O selo nas colunas "Faturado" e "Enviado".** Hoje há 2 cards em "Faturado" cujas OPs
  continuam em "Aguardando Liberação Comercial" e 1 em "Enviado" com a OP aguardando início da
  produção: é exatamente o tipo de descompasso que o selo mostraria, mas mudar a coluna onde o
  selo aparece é decisão sua (ver "Perguntas em aberto").
- **O contador de "devolvidas ao Comercial"** que a Etapa 3.1 sugeriu para este painel: a lista
  "OPs em aberto" já mostra cada devolvida com setor e dias, mas ninguém é avisado sem abrir a
  aba.
- **O link direto do frete** da faixa para o registro na Logística (já anotado na 6.1).

### ✅ Etapa 7 — Trocar `alert`/`confirm` nativos pelo padrão do sistema

**Feito em:** 29/09/2026. **Nenhum dado foi alterado.**

**O que o levantamento achou (o plano estava desatualizado):** o `Feedback.tsx` já faz o que a
etapa pedia. Todo `alert()` (cerca de 600 chamadas em 65 arquivos) vira aviso do sistema em
`main.tsx`; `confirmar()` (cerca de 130 usos) e `pedirTexto()` já existem; não sobrou nenhum `prompt()`.
Faltava outra coisa: **o tom do aviso é adivinhado pelo texto**, e errava — o mesmo mecanismo que
já tinha pintado "Não foi criada" de verde na Etapa 2. Medido nas **590 mensagens fixas** do
sistema (extraídas do código, uma a uma): **94 (16%) saíam com o tom errado**.

- **Verde onde devia ser amarelo (16):** "Kit liberado com pendência, **mas** o estoque ficou
  negativo", "Marque ao menos um item para **salvar** a separação", "A solicitação foi **criada**,
  mas alguns anexos não foram enviados", "Esta OP já mudou de status"…
- **Azul (neutro) onde devia ser amarelo ou vermelho (74):** todas as recusas por permissão
  ("Só Compras, gerentes ou administradores podem…", "Você não tem autorização para aprovar
  compra"), as barras de regra ("Não dá para fechar o Kit 100%…", "Volte uma etapa por vez") e
  as validações ("Descreva o motivo", "Adicione pelo menos um item", "Arquivo muito grande").
- **Outros 4:** "A tarefa foi concluída, mas a próxima ocorrência não pôde ser criada" (verde → vermelho)
  e "Deletado!" (2 vezes) e "Pedido de hora extra cancelado" (azul → verde).

**O que foi feito:**

- **`tomDe()` (`Feedback.tsx`) reescrito**, com o texto comparado **sem acento** (as expressões não
  precisam mais repetir as duas grafias): erro (o sistema falhou **ou a pessoa não tem
  permissão**) → atenção (falta a pessoa fazer algo, uma regra barrou, ou o resultado foi
  parcial) → ok → info. Distribuição das 590: **erro 223 → 242, atenção 223 → 295, ok 61 → 47,
  info 83 → 6**. As 446 que já saíam vermelhas ou amarelas **não mudaram**; das 144 que saíam
  verdes ou azuis, 94 mudaram e 50 ficaram como estavam (conferidas uma a uma).
- **Tom explícito onde o texto não ajuda** (6 pontos, todos `mostrarAviso(texto, tom)`): o erro
  cru do banco em `ChicotesTab` e `SerralheriaTab` (`alert(err.message)`, 4 pontos — antes o
  palpite dava azul), a validação montada na hora em `AlmoxarifadoTab` (2 pontos) e, em `ComprasTab`,
  a recusa "O recebimento é registrado por Compras…" (o palpite dava **verde**, por causa de
  "registrado") e "Esta é a cotação vencedora… use Editar" (verde, por causa de "aprovada").
- **Último `confirm()` nativo trocado** (`OplEdicao.tsx`, edição em lote de OPs: "Deixar o campo em
  branco nas N OPs?") pela janela do sistema.
- **Botão de perigo** (`RE_PERIGO`): "**Deletar** pedido?" (3 confirmações) e "Regenerar o token
  **invalida** o link antigo" agora saem com o botão vermelho, como as exclusões.
- **Não mexi nas durações** (erro 9 s, atenção 7 s, o resto de 4 a 9 s) — ver "Perguntas em aberto".

**Testado** (16 verificações; navegador com **gravações bloqueadas**; a regra é testada na
versão **real** do `Feedback.tsx` servida pelo Vite):

- **Regra contra as 590 mensagens:** as 446 vermelhas/amarelas de antes **continuam iguais** (0
  mudaram) e as 144 verdes/azuis **conferem 144 de 144** com a tabela revisada à mão.
- **Na tela de verdade:** 13 avisos disparados por `alert()` saem na cor certa (amarelo, vermelho,
  verde, azul), inclusive palavras que só **começam** como as da regra ("Coleta registrada",
  "Massa de dados importada" não viram amarelo); o tom explícito vence o palpite (a mensagem de
  Compras daria verde sem ele).
- **Confirmações:** "Deletar…" e "…invalida…" ficam com o botão de perigo; "Excluir…" continua; uma
  pergunta comum ("Concluir a demanda?") continua normal.
- **Edição em lote de OPs no CRM:** com duas OPs marcadas, deixar o campo em branco abre a
  **janela do sistema** ("Deixar "Cliente" em branco nas 2 OPs?"), **nenhum diálogo nativo** do
  navegador; cancelar não grava e mantém a edição aberta; confirmar tenta gravar
  `cliente_nome = null` nas duas (barrado pelo teste) e o aviso "Algumas OPs não foram alteradas"
  sai **amarelo** (antes saía verde).
- **Regressões:** CRM 16/16, lista de OPs 30/30, selo do card 23/23, reenvio 20/20, status 13/13,
  Engenharia 13/13, banner/Marketing/Financeiro 13/13, faixa do detalhe 21/21 e 4/4, "não lido" 9/9,
  "OP/Conjunto" 21/21 e seletor do catálogo 5/5. Dois desses testes (lista de OPs e "não lido") tinham **número fixo**
  e falharam porque o dado real mudou no meio do dia: um lote novo de 39 unidades (`1673.2609`)
  levou as OPs abertas de 329 para 368, e mais 2 licitações receberam alteração; conferi os dois no
  banco e atualizei os testes (o da lista passou a calcular o esperado).
- **Não exercitados na tela** (só pelo código, o build e a regra): os 4 pontos de erro cru
  (`Chicotes`/`Serralheria`, que só disparam com exceção de rede), a validação do Almoxarifado
  (exige embalar uma OP) e as duas recusas de Compras (exigem outro perfil arrastando um cartão).
- **Cuidado de teste, para a próxima máquina:** o servidor de desenvolvimento pode servir uma cópia
  velha de um arquivo editado duas vezes seguidas (aconteceu com o `Feedback.tsx`); um `touch` no
  arquivo força a releitura. O build e o que vai ao ar não são afetados.

**O que ficou de fora:**

- **1 `confirm()` nativo em `Estoque.tsx:1421`** ("O mesmo item aparece em mais de uma linha… Seguir
  assim?"): o arquivo é da frente de estoque, que roda em outra sessão; fica para ela (troca de uma
  duas linhas: `revisar` passa a `async` e o `confirm(...)` vira `await confirmar(...)`).
- **Mensagens montadas na hora que continuam no palpite** (`ComprasTab.mostrarDica`,
  `LogisticaTab:1462`, `PCPTab:257`, quatro em `Estoque.tsx`): dependem do texto que o código monta.
- **As ~600 chamadas de `alert()` não foram reescritas uma a uma**, de propósito: a regra central
  agora acerta 100% das 590 fixas revisadas, e o tom explícito fica para o que o texto não revela.

### ✅ Etapa 7.1 — Edição de OP igual à criação, cartão completo e janela que não fecha à toa

**Feito em:** 29/09/2026, **fora da ordem do plano, por pedido do usuário** ("antes de continuar").

**O pedido:** (1) na **edição** da OP não dava para adicionar e configurar o veículo (modelo e ano)
como na criação — as telas de edição têm de ser iguais e funcionar; (2) o **cartão da OP** tem de
trazer tudo o que foi cadastrado, sem exceção; (3) o **lote 1673.2609** (39 Renegade 2026/2027, a mesma
adaptação de 2015 em diante) precisa do carro em todas as unidades, **sem placa e sem chassi** (chega
zero km), porque o modelo é o que permite começar a guardar a configuração do Conjunto Elétrico;
(4) no **cadastro de cliente aberto pela criação de OP**, o Ctrl+V fechava a janela.

**Como o veículo funciona (levantado):** a OP guarda o **código de uma ficha do catálogo de veículos**
(`veiculo_id`) e um texto `modelo`. Os **anos moram na ficha** (faixa "2015 em diante"), não na OP, e é
na ficha que se pendura a configuração do Conjunto Elétrico (`veiculo_item_materiais`, hoje com 0
linhas). O catálogo só tem tela para **cadastrar** ficha (na criação, pelo "+ Novo"); não há como
editar uma ficha existente.

**Dados alterados, com autorização do usuário** (migração `veiculo_renegade_anos_e_modelo_das_ops_sem_texto`,
com trava de contagem): **1 ficha** — "Jeep Renegade 4x4", criada às 12h45 pela Tatiana **sem anos**, passou a valer
de **2015 em diante** (o nome não mudou; foi a opção que o usuário escolheu) — e **40 OPs** (as 39 do
lote e a D0778.2609, Toro) receberam em "Modelo" o nome da ficha. Chassi e placa continuam
vazios. Conferido depois: 39 OPs em Renegade e 1 em Toro, 0 sem modelo, 0 com chassi ou placa.

**O que foi feito:**

- **Veículo do catálogo em todas as telas de edição**, o mesmo seletor da criação (escolhe da lista ou
  cadastra na hora com a faixa de anos) e que **preenche o "Modelo" sozinho**: edição do Comercial (CRM),
  edição completa do Admin/Gerente (a partir do cartão), edição em lote (o campo "Veículo (catálogo)")
  e o **"🚗 Lote"**, que ganhou "Veículo de todas as unidades" (chassi e placa seguem por unidade e podem
  ficar vazios). No histórico da OP o veículo aparece pelo **nome com os anos**, não pelo código. O
  componente comum é `VeiculoDaOp` (`VeiculoCadastro.tsx`); o `SelectVeiculo` passou a devolver também a
  ficha escolhida.
- **Defeito da criação corrigido (A11):** o modelo passa a vir da ficha que o próprio seletor entrega.
- **Edição do CRM corrigida (A10):** o formulário parte da **OP inteira**, lida do banco ao abrir, e o
  "Salvar" grava **só o que a pessoa mudou** (sem mudar nada, não grava nada). O "🚗 Lote" também passou a
  avisar quando uma unidade não salva (antes o erro passava calado e a janela fechava como se tudo tivesse ido).
- **Cartão da OP com todos os dados cadastrados:** entraram **Veículo (catálogo, com os anos)**, **Placa**,
  Equipamento/Veículo, Local de instalação, **Fluxo de entrega**, cidade/UF e CEP de entrega, Frete CIF/FOB,
  Observações do envio, Cliente final, Vendedor, Canal de venda, Edital, Nº da proposta, um bloco
  **Faturamento** (CNPJ/CPF, razão social, centro de custo, observações) e **Especificações**. E o
  **"Cadastrado em"**, que saía sempre vazio (lia a coluna `criado_em`, que não existe; é `data_criacao`).
  Como sempre, campo vazio não aparece.
- **Janela que não fecha à toa (`ProtecaoDeFundo.ts`, vale para todas as janelas do sistema):** o Ctrl+V
  em si funcionava; o que fechava a janela era **selecionar o texto do campo arrastando o mouse e soltar
  fora da janelinha** (para colar por cima): o navegador entrega o clique ao fundo escuro e a janela fecha
  antes da colagem. **Reproduzi** e a proteção descarta só o clique que **começou dentro e terminou no
  fundo**; apertar e soltar no fundo continua fechando, e botão flutuante (chat, barra de ações) não é afetado.

**Testado** (37 verificações novas; navegador com **gravações bloqueadas** — toda escrita foi barrada ou
respondida de dentro do navegador, e o **corpo do que seria gravado foi conferido**):

- **Janela:** arrastar o mouse para fora do campo do cadastro de cliente **não fecha mais**; o Ctrl+V cola por
  cima da seleção; clicar no fundo continua fechando; o mesmo vale para a janela "🚗 Lote".
- **Edição do CRM:** a OP 1482.1502 abre com o resumo e a origem que tem no banco (antes vazios); salvar sem
  mudar nada **não grava nada**; mudar só a observação grava **só** `observacoes_comercial` e a data de atualização.
- **Veículo nas telas de edição:** Comercial e Admin gravam `veiculo_id` + `modelo` (Admin com o nome da ficha no
  histórico); a edição em lote grava nas duas OPs marcadas; o "🚗 Lote" do 1673.2609 mostra "Jeep Renegade 4x4 · 2015+"
  e "vale para as 39 unidades", trocar o veículo troca as 39 e grava as 39 (salvar sem trocar não regrava o veículo).
- **Defeito da criação:** com uma ficha nova cadastrada na hora (simulada), escolher na linha da unidade preenche o
  Modelo ("ZZ Carro"); na edição, a janela "Cadastrar veículo" abre **por cima** da edição e devolve o modelo.
- **Cartão:** com uma OP de teste **toda preenchida** (leitura simulada), os **22 campos** que faltavam aparecem; na OP real
  1673.2609/01 aparecem "Jeep Renegade 4x4 · 2015+" e o Modelo, sem placa/chassi.
- **Regressões:** CRM 16/16, lista de OPs 30/30, selo do card 23/23, reenvio 20/20, status 13/13, avisos (Etapa 7) 16/16,
  faixa do detalhe 21/21 e 4/4, "não lido" 9/9, Engenharia 13/13, banner/Marketing/Financeiro 13/13, "OP/Conjunto"
  21/21, seletor do catálogo 5/5; "Lançar OS" e licitação sem erro. O teste de "não lido" passou a **calcular** o número
  de licitações em vez de comparar com um número fixo (mudou de 90 para 92, 93 e 94 no mesmo dia).

**O que ficou de fora:**

- **A OP criada sozinha quando o card vira Vencido** (`criarOpAutomatica`) grava `modelo` = **título do card** e **não
  liga veículo do catálogo**: essas OPs nascem sem ficha, e a Aplicação do Conjunto Elétrico diz "a OP não tem veículo
  do catálogo". Faz parte da pergunta aberta sobre a criação automática.
- **Não há tela para editar ou desativar uma ficha do catálogo** (só cadastrar): corrigir os anos de uma ficha existente
  hoje só por SQL, como foi feito com o Renegade. Vale uma tela simples no Admin.
- **Fotos "como o carro chegou"** só podem ser postas na criação; o cartão as mostra, mas nenhuma tela de edição as troca.
- **As duas edições (Comercial e Admin) têm listas de campos diferentes de propósito** (o Comercial não muda status,
  o Admin não tem cliente final, vendedor, edital…). Só o veículo foi igualado.
- **Perda de dado por edições antigas (A10) não foi medida** e nada foi restaurado (regra 4).

### ✅ Etapa 7.2 — Três ajustes pedidos: itens repetidos, formulários de edição e parcelas do centro de custo

**Feito em:** 29/09/2026, **fora da ordem do plano, por pedido do usuário**. **Os 3 ajustes estão feitos.** Da unificação de itens,
**o que não deixava dúvida foi gravado** (441 itens); o resto **depende do usuário marcar a planilha de auditoria** (48 + 21 linhas).
A gravação foi barrada uma vez pelo Claude Code e **liberada pelo usuário no chat** ("liberar a gravação da unificação dos itens").

**O pedido:** (1) unificar os itens repetidos do catálogo — principalmente "CONJUNTO ELETRICO" e as derivações com PV
—, deixando **um só** como gatilho do Conjunto Elétrico; para o resto do catálogo (4 mil e poucos itens), varrer os
repetidos, **preferindo sempre o item com código** (o sem código costuma ter sido criado por quem não sabia usar o
sistema) e, nos casos duvidosos, gerar **uma planilha de auditoria** para o usuário marcar; (2) revisar **todos os
formulários de edição** para ver se abrem com os dados já salvos ou em branco e gravam em branco por cima (o mesmo
defeito que a edição de OP tinha); (3) na edição de um lançamento do **Centro de Custo**, poder **configurar o parcelamento
e em quantas vezes**.

**As perguntas que fiz ficaram sem resposta na hora** (o usuário só disse "pode seguir"), e segui pelo que recomendei. **O usuário
confirmou depois, no chat, as duas ("SIM E SIM")**: o principal do Conjunto Elétrico é o item de **código 1687** ("CONJUNTO
ELETRICO", o único que já aparecia em OPs); o parcelamento do centro de custo vale para o **contrato parcelado** (guarda
"em quantas vezes" e acompanha "pagas x de N"), **sem gerar cronograma de parcelas**.

#### 3) Centro de custo — "Em quantas vezes?" ✅

- **Banco** (migração `centro_custo_despesas_num_parcelas`, só acréscimo): coluna `num_parcelas` (2 a 120, vazia = "não combinado").
  Nenhuma linha existente mudou (o único contrato existente, "EDIFICAÇÃO DAS PAREDES LATERAIS…", R$ 6.500 com 1 medição de R$ 2.000,
  continua sem número).
- **Edição do lançamento** (`ModalEditarLancamento`): quando é contrato parcelado aparece **"Em quantas vezes?"** (campo + atalhos
  2x, 3x, 4x, 6x, 10x, 12x), com o valor de cada parcela (total ÷ N) e "Já lançadas: x de N". O campo **abre com o número já
  salvo**. Combinar menos parcelas do que as medições já lançadas **pergunta antes**. Virar "À Vista" zera o número — mas a regra
  antiga continua valendo: contrato com medição lançada não vira à vista. A alteração vai para a auditoria com o valor de antes.
- **Lançar despesa nova** (`ModalLancarDespesa`, "Parcelado"): o mesmo campo, para o contrato já nascer com o número.
- **Lançar medição:** mostra "Parcela 2 de 4 — sugestão: R$ …" (o que falta pagar ÷ as parcelas que faltam), **já preenche o valor
  sugerido** (a pessoa pode trocar) e, sem observação, grava "Parcela 2/4 — descrição do contrato".
- **Lista de lançamentos:** o contrato mostra "x de N parcelas" (ou "n medição(ões)" quando não há número).
- **Correção necessária no caminho:** a lista somava as medições de um contrato **só as do mês filtrado**; um contrato com parcelas
  pagas em outros meses aparecia com o "pago" menor (e o aviso "total abaixo do já pago" ao editar também). Agora soma **todas** as
  medições do contrato. Não tem efeito hoje (a única medição existente é do mesmo mês do contrato), mas passaria a errar assim que
  uma parcela caísse em outro mês.

#### 2) Revisão dos formulários de edição ✅ (5 defeitos corrigidos)

Critério: o formulário de edição tem de abrir com **o que está salvo** e só gravar o que a pessoa mexeu; não pode abrir vazio por
falta de coluna na leitura, nem gravar valor fixo por cima do que existe.

- **A12 — Kit do produto (`CadastroProdutosTab`):** o "Salvar" **apagava a estrutura inteira e regravava a lista da tela**. Se a
  estrutura ainda estivesse carregando, ou se a leitura falhasse (o erro virava lista vazia), o kit ficava **sem nenhum item**.
  Agora o botão só libera depois de a estrutura ser lida (e avisa se a leitura falhou), grava as linhas novas **antes** de apagar as
  antigas (por id) e pergunta antes de salvar uma estrutura vazia sobre um kit que tinha itens.
- **A13 — Admin > Usuários:** a caixa "Pode excluir anexos em Licitações" **abria sempre desmarcada e não era gravada** (marcar não
  tinha efeito). Agora abre com o valor da pessoa e grava.
- **A14 — Avisos do sistema (Admin):** editar um aviso **desativado** o **reativava** (o "salvar" mandava `ativo = true`).
- **A15 — Contatos do CRM:** editar um contato o **reativava e trocava o responsável** para quem estava editando.
- **A16 — Venda do CRM (aba Faturamentos, ✏️):** o campo abria com o número cru do banco (`7847.5`) e o "salvar" trata todo ponto
  como separador de milhar — **salvar sem mexer no valor multiplicava por 10 ou 100**. Caso real: a venda "FUNDOE STADUAL DE SAUDE",
  R$ 7.847,50, viraria R$ 78.475 (é a única venda com centavos hoje). Agora os valores abrem em formato brasileiro (`7.847,50`).
  *A edição da oportunidade já formatava certo (`fmtValorEdit`); a da venda não.*

**Revisados e sem defeito** (abrem completos e gravam só o que devem): RH (funcionário), Veículos NFC, Vistorias de pátio,
Marketing (pedidos), WhatsApp (conexões), Perguntas da venda, Configuração da estrutura, Cotações (proposta e aprovação),
Análise (setores), Horas extras, Horas de Engenharia, e a edição de cotação do Compras (valores entram em formato brasileiro).
**Observação sem efeito hoje:** a edição de lançamento de RH (`rh_lancamentos`) gravaria `criado_por = 'sistema'` por cima do
original, mas **nenhuma tela a abre** (o modal só é chamado para criar). **Não revisei os formulários da primeira parte da
sessão um a um por escrito** (a lista de "revisados" dessa parte não ficou registrada aqui; os defeitos dela são A12–A15).
Perda de dado por edições antigas **não foi medida** e nada foi restaurado (regra 4).

#### 1) Itens repetidos — o inequívoco **gravado**; o resto na planilha ✅

**Levantamento** (leitura direta do banco, 29/09/2026): o catálogo tem **4.438 itens** (4.429 ativos): **4.389 com código** e
**49 sem código**. A família "Conjunto Elétrico" tem **437 itens**: 434 com código (um por PV, mais 5 "COPIA DE…" e o próprio 1687) e
**3 sem código** (custo 240, 290 e 390). **Nenhum** está marcado como gatilho hoje (`eh_conjunto_instalacao`). Só dois aparecem em OPs:
o **1687** e o "CONJUNTO ELÉTRICO" sem código de custo 390, vendido em **8 OPs** (A1656.2609, A1657.2609, A1660.2609/01 e /02,
A1662.2609, D0775.2609, D0777.2609, D0778.2609). Nenhum item da família tem estoque ou movimento. Só **8 dos 4.389 itens com código
têm custo** (o custo vem da formação de preços), por isso o custo do repetido **não é copiado** para o principal — fica no registro.

**Estrutura criada antes** (migração `unificacao_de_itens_registro_e_funcao`, **não altera nenhum dado existente**): a tabela
`itens_unificacoes` (registro de quem foi unificado em quem, o que foi movido e o custo que o repetido tinha) e a função
`unificar_item(repetido, principal, origem, gravar)`, que **reaponta** o item em OPs (itens vendidos, BOM, conferência do kit),
kits de produto, demandas, pedidos de compra, reservas de estoque, estrutura de veículo e perguntas — e deixa o repetido
**inativo, com nota na descrição** (nunca apaga). Recusa item com movimento ou saldo de estoque. `gravar = false` só conta
(simulação). A execução foi **retirada do acesso público** (só o administrador do banco chama).

**Gravado no banco em 29/09/2026** (migração `unificacao_conjunto_eletrico_e_nomes_identicos`, liberada pelo usuário no chat depois de o
Claude Code barrar a primeira tentativa; **simulada antes** com `gravar = false`, com trava de contagem 436 + 5 = 441 que desfaz tudo se
divergir). O que ela fez:

- marcou o **1687** ("CONJUNTO ELETRICO") como o **único gatilho** do Conjunto Elétrico (`eh_conjunto_instalacao`);
- unificou nele as **436** restantes da família (as 3 sem código, as 5 "COPIA DE…" e as de PV): ficaram **inativas**, com a nota
  "Unificado em 29/09/2026 no item [1687] CONJUNTO ELETRICO" na descrição;
- unificou **5 itens sem código de nome idêntico** ao de um item com código: RC3002 UN → **1801**, FRETE → **4063**, SIRENE AMPLIFICADA
  LF40 → **1278**, DH410 UHF 400-470 → **1912**, SINALIZADOR INTERLED2 VERMELHO → **225**.

**Conferido depois, no banco:** `itens_unificacoes` com **441 registros**; o catálogo continua com **4.438 itens** (nenhum apagado), **3.988
ativos** (eram 4.429) e **450 inativos** (eram 9); **1 gatilho** (o 1687) e **1 item de Conjunto Elétrico ativo**; rodando a função em modo
simulação de novo nos 441, **nenhum tem mais referência** apontando para ele. **O que foi apontado para outro item:** **8 linhas de
`oples.itens_vendidos`** (as 8 OPs A1656.2609, A1657.2609, A1660.2609/01 e /02, A1662.2609, D0775.2609, D0777.2609, D0778.2609, que vendiam o
"CONJUNTO ELÉTRICO" sem código de custo 390 e agora vendem o 1687) e, do SINALIZADOR INTERLED2 VERMELHO, **3 de itens vendidos, 2 de BOM e 1
de conferência de kit**. Nada mais tinha referência. Os custos que os repetidos tinham (por exemplo 390, 240 e 290 nos três "CONJUNTO
ELÉTRICO" sem código, e 115,36 no FRETE) **ficaram no registro** e na nota da descrição, e **não foram copiados** para o principal.

**Efeito que a Engenharia vai ver:** as 8 OPs acima passam a **ter o gatilho** (o item virou o 1687). As 7 que não têm veículo do catálogo dirão,
na Aplicação da estrutura, "leva Conjunto Elétrico, mas a OP não tem veículo do catálogo"; a D0778.2609 (Toro) já pode receber a estrutura.
É o comportamento pretendido do gatilho, mas é mudança visível.

**Para desfazer** uma unificação: reativar o item repetido, apontar de volta o que consta em `itens_unificacoes.referencias` e apagar a
linha do registro (as OPs guardam o `nome` original, só o código do item mudou).

**A planilha de auditoria** (`auditoria_unificacao_de_itens.xlsx`, entregue ao usuário): abas **Como usar**, **Decidir** (48 linhas: 20 itens
sem código × item com código e 28 pares com código × com código, ordenados dos idênticos aos mais parecidos; cada linha traz custo,
onde é usado, principal sugerido com % de semelhança, as palavras que diferem e as opções 2 e 3), **Sem candidato** (21 itens sem
código que não parecem com nenhum com código; muitos são serviços/consumíveis usados na estrutura de produto — ficam como estão
a não ser que o usuário aponte o principal) e **Já unificados** (os 441 acima, para conferir). O usuário escreve **SIM/NÃO** em "DECISÃO" e,
se o principal certo for outro, o código em "Outro principal". Linha em branco = não mexe.
**Para aplicar a planilha marcada:** para cada linha com SIM, `select public.unificar_item('<ID do item>', '<id do principal>', 'planilha')`
(o principal é achado pelo código digitado ou, na falta, pela coluna "ID do principal sugerido"); a função recusa quem tem movimento de
estoque (aparece o ⚠ na planilha — ex.: "SLIMLED G2 VM": ajustar o saldo à parte). Conferir as contagens antes e depois, e **só gravar com
o usuário liberando de novo** (cada gravação em massa pede autorização).

**Importação de itens (`CadastroItensTab`) — já no código:** a planilha do ERP traz "Ativo = Sim" e **reativaria** os unificados a cada
importação, e criaria **um "CONJUNTO ELETRICO PV …" novo por pedido**. Agora o item já unificado (está em `itens_unificacoes`)
**continua inativo**, e um "CONJUNTO ELETRICO PV …/OPL …/COPIA DE …" **novo entra inativo**; o aviso do resultado conta os dois casos.
O "CONJUNTO ELETRICO" puro (1687) não é tocado. **É uma regra nova de negócio — o usuário deve confirmar** que quer os PVs novos entrando inativos.

**Testado** (navegador com **gravações bloqueadas**, corpo do que seria gravado conferido; **os testes não gravaram nada em produção** — a única gravação foi a migração acima, feita à parte e conferida):
`teste_9` formulários corrigidos **9/9** (usuário, aviso inativo, contato, kit com leitura falhando e ordem inserir-antes-de-apagar);
`teste_10` centro de custo **26/26** (contrato real sem número, cenário com 4 parcelas simulado, medição com sugestão, lançar novo com 3x);
`teste_11` importação de itens **9/9** (planilha sintética: PV novo inativo, item comum ativo, 1687 intocado, unificado (simulado) continua
inativo); `teste_12` venda do CRM **6/6** (a venda real de R$ 7.847,50 abre formatada e salva 7847,5). **Regressão completa** (rodada com todas as
mudanças da 7.2, **sem nenhuma falha**): CRM 16/16, lista de OPs 30/30, selo do card 23/23, reenvio 20/20, status 13/13, avisos 16/16,
31/31 e 6/6 (edição de OP), faixa do detalhe 21/21 e 4/4, "não lido" 9/9, Engenharia 13/13, banner/Marketing/Financeiro 11/11 (2 checagens
puladas: a OP A1671.2609 saiu da etapa), "OP/Conjunto" 21/21, seletor do catálogo 5/5, "Lançar OS" e licitação sem erro. O teste do
catálogo (21/21) e o do seletor (5/5) rodaram **com a unificação já gravada**. **Três testes antigos foram atualizados** porque fixavam o estado de uma OP real que andou hoje (a A1671.2609 foi do Comercial
para o Fiscal; e o número de OPs "com alteração não vista" foi de 218 para 219): passam a calcular o esperado em vez de repetir um número.

**O que ficou de fora:**

- **A aplicação das decisões da planilha** (48 + 21 linhas): depende de o usuário marcar SIM/NÃO.
- **Não há tela de "itens unificados"** no cadastro: a nota está na descrição do item inativo e o registro em `itens_unificacoes`.
- **O ERP continuará criando itens sem código de nome parecido?** Não medi; o que a importação faz com os sem código (sempre insere) não mudou.
- **Cronograma de parcelas no centro de custo** (datas de vencimento de cada parcela) **não foi feito** de propósito, e o usuário confirmou ("SIM") que não precisa por ora.

### ✅ Etapa 7.3 — Compra de reposição recebida não subia para o estoque (PC-FU6DS9)

**Feito em:** 29/09/2026, **por relato do usuário**: "PC-FU6DS9 foi comprado e recebido, mas não subiu para o estoque a quantidade comprada."

**O que aconteceu (medido no banco):** o pedido é a reposição do item **4117** (disco de desbaste, unidade PC): pedidos 9, **comprados 10**,
recebimento gravado em 29/09 como **9** com NF 1234, status Recebido. O item ficou com **saldo 1** e **nenhum movimento** de entrada.
Nunca houve, em todo o estoque, uma entrada do tipo "compra recebida": este era o primeiro pedido de reposição a ser recebido.
**Causa:** o painel "Aguardando Recebimento" da Logística (`PainelRecebimento`) lia o pedido com uma lista de colunas que **não trazia**
`vinculo_tipo`, `vinculo_id` (o vínculo com o item de estoque) nem `quantidade_comprada`. A função de crédito
(`creditarCompraRecebida`) só age em pedido "de estoque"; sem o vínculo ela devolvia "não se aplica" **sem avisar ninguém**. E a janela
abria com a quantidade pedida (9) em vez da comprada (10), sem o aviso "📦 Reposição de estoque" que ela já tinha. (Mesma família do A10:
formulário aberto a partir de uma linha parcial.) A abertura pelo quadro do Compras (arrastar para "Recebido") lê o pedido inteiro e
**não tinha o problema**.

**Dado corrigido, com decisão do usuário** ("10 — a comprada"): uma **entrada de 10** no item 4117, lançada pela mesma função do banco que
a tela usa (`estoque_movimentar`, motivo `compra_recebida`, ligada ao pedido; observação explica a correção), **saldo 1 → 11**, e o
"recebido" do pedido acertado de 9 para 10. Trava: só gravaria com o saldo ainda em 1 e o pedido sem movimento. Conferido depois: saldo 11,
3 movimentos do item (contagem 0→2, saída 2→1, entrada 1→11), 1 entrada por compra no total. **Nenhum outro pedido de reposição estava
nessa situação** (dos 21 pedidos Recebidos, só este é de estoque).

**O que foi feito no código (`LogisticaTab.tsx`):**

- O painel passa a ler `quantidade_comprada`, `vinculo_tipo`, `vinculo_id` e `vinculo_descricao`.
- A janela de recebimento (`ModalReceberPedido`) **lê o pedido inteiro ao abrir e de novo ao confirmar**, seja quem for que a chamou; a
  quantidade recebida abre com a **comprada** (a pessoa pode trocar; se já digitou, não é sobrescrita).
- **Silêncio acabou:** se o pedido é de reposição e o crédito "não se aplica" (sem quantidade, por exemplo), a tela agora diz "Recebimento
  registrado, mas NADA entrou no estoque…".
- **Segundo caminho com o mesmo furo:** o recebimento lançado à mão em "Histórico / Novo Registro", vinculado a um pedido, fechava a compra
  e **também não creditava** o estoque. Agora credita (a quantidade informada no registro; sem ela, a comprada) e grava o "recebido".

**Testado** (`teste_13`, **14/14**, gravações bloqueadas): a leitura simulada devolve **só as colunas que a tela pediu**, como o banco. **Antes
da correção o teste reproduziu o relato** (2/9: janela abre com 9, sem aviso de reposição, sem chamada ao estoque); depois: aviso e "comprada:
10" aparecem, a quantidade abre com 10, confirmar chama `estoque_movimentar` com entrada de 10 no item 4117 ligada ao pedido, o pedido grava 10
recebidos e a tela diz "entraram 10, saldo agora 11"; o mesmo no registro à mão. O teste não gravou nada no banco (conferido).

**O que ficou de fora:** o recebimento pelo **quadro do Compras** (arrastar) não foi exercitado no navegador — ele já lia o pedido inteiro e
usa a mesma janela, agora corrigida. Um pedido de reposição recebido **antes** desta correção por qualquer um dos dois caminhos e **sem** entrada no estoque
seria o único caso pendente; hoje não há outro.

### ✅ Etapa 7.4 — Um só Conjunto Elétrico, código automático nos itens novos e a estrutura automática no lote das 39 Renegade

**Feito em:** 29/09/2026, **por pedido do usuário**: "agora só terá sempre 1 Conjunto Elétrico, o 1687; qualquer outro não deve ser ativo. Não vou mais
importar produtos do outro sistema: a partir de agora é criado direto aqui, com um novo código gerado pelo nosso sistema." E: "configurar e começar a testar o
fluxo do BOM automático, usando as 39 Renegade 4x4 para as configurações de instalação dos itens vendidos, vínculo carro × item × Conjunto Elétrico".

**Regra no banco** (migrações `catalogo_codigo_automatico_e_conjunto_eletrico_unico` e `catalogo_regras_validar_antes_de_gerar_codigo`; no banco, e não só na tela,
para valer também na importação e em qualquer outro caminho de gravação):

- **Código automático:** item novo sem código ganha o **próximo número da sequência**, que **continua a numeração do ERP** (maior código real 4409 → o primeiro item
  novo é o **4410**). O **999999** ("ITEM GENERICO") é reservado e fica fora da conta. Código informado à mão continua sendo respeitado (planilha antiga, item que já
  existe). A busca sem acento (`codigo_norm`) sai certa.
- **Conjunto Elétrico único:** item cujo nome é "CONJUNTO ELÉTRICO…" (ou "COPIA DE CONJUNTO ELÉTRICO…") **com outro código que não o 1687 não pode ficar ativo**, e **só o
  1687 pode ser o gatilho** (`eh_conjunto_instalacao`). O nome que só **cita** o conjunto ("SUPORTE DO CONJUNTO ELÉTRICO…") não é afetado. Os inativos continuam aceitos.
- **O 1687 fica protegido:** não pode ser desativado, desmarcado, mudar de código nem ser excluído.
- **Testado no banco** com um bloco que **sempre desfaz tudo** (nada persiste): outro "CONJUNTO ELETRICO PV …" ativo é recusado (também com acento, com "COPIA DE" e com o mesmo
  nome do 1687 sob outro código); o mesmo nome **inativo** é aceito; marcar outro item como gatilho, desativar/desmarcar/renomear/excluir o 1687 são recusados; editar a descrição do
  1687 é aceito; dois itens sem código saem com códigos seguidos, código em branco vira código gerado, código manual é mantido; **recusa não gasta número** (corrigi a ordem
  depois de o teste mostrar que gastava). A sequência foi devolvida ao ponto certo (**próximo = 4410**), e conferi que não sobrou item de teste.

**Telas:**

- **Cadastro de itens:** em item **novo** o campo do código fica bloqueado ("Gerado ao salvar") e vai vazio; ao salvar, a tela avisa **"Item cadastrado com o código 4410"**. As gravações
  do cadastro (salvar, ativar/desativar, excluir) **passaram a mostrar o erro do banco** — antes o resultado nem era lido: uma recusa passava calada e a janela fechava como se tivesse
  salvo. Item que já existe mantém o código editável, como era.
- **Administração → Estruturas:** a caixa "Este item é o Conjunto Elétrico" **saiu** (a marca não se escolhe mais). O 1687 mostra 🔒 "único do sistema" e **não oferece perguntas nem
  material** (ele é o recipiente); os outros itens seguem como sempre.
- **Importação de planilha:** continua existindo (nada foi removido); o "Conjunto Elétrico PV …" novo entra inativo, e o banco recusaria se entrasse ativo.

**BOM automático no lote** (`EngenhariaTab.tsx`, `AplicarEstrutura.tsx`):

- **Furo achado ao preparar o teste:** a janela **"LIBERAR BOM EM LOTE" não tinha o painel da estrutura automática**; só a liberação individual tinha. Um lote como o das 39 Renegade não
  usaria o material calculado. Agora o painel aparece no lote, calculado sobre a **primeira OP marcada**, com aviso destacado quando as marcadas **não têm o mesmo veículo e os mesmos itens**
  (a mesma BOM vai para todas).
- **Serviço e item genérico não são cobrados** como "nunca adaptados neste carro": itens da categoria `GENERICO` (película, instalação do kit, garantia estendida, plotagem, licença…) nunca
  consomem material. Sem isso, 3 dos 12 itens das Renegade apareceriam para sempre como pendência.
- **"✓ Jogar na BOM" segue o desenho da Etapa 7.4 do estoque:** tira a linha do Conjunto Elétrico da lista de separação (é a caixa, não a peça) e marca o material como **"do CONJUNTO ELETRICO"**.
  OPs criadas antes do fluxo automático partiam da sugestão antiga, que ainda trazia a linha do 1687.

**As 39 Renegade hoje** (leitura direta): OPs **1673.2609/01 a /39**, todas **Em Espera Engenharia**, cliente PRUSSIANA AUTOMOVEIS, veículo **"Renegade 4x4" 2015–em diante**, sem chassi nem placa, **cada uma vende
13 itens, incluindo o 1687** (gatilho ligado). **Nada está configurado ainda:** 0 perguntas, 0 respostas, 0 linhas de material em todo o sistema. Os **9 itens físicos** a configurar para esse carro: 225 INTERLED2
VERMELHO, 226 INTERLED2 AZUL, 222 INTERLED8 VERMELHO E AZUL, 244 SLIMLED4 G2 VERMELHO (×2), 245 SLIMLED4 G2 AZUL (×2), 1177 AMPLIFICADOR CONTROLADOR S100W, 1287 SIRENE D100S, 1356 MODULO INTERFACE PARA ENGATE DE REBOQUE e
2894 ENGATE PARA REBOQUE REMOVIVEL JEEP RENEGADE. Como configurar: **Administração → Estruturas** → escolher o item → escolher **Renegade 4x4** → "＋ Material" (material, quantidade por unidade vendida, "sempre, neste carro"). Depois,
em **Engenharia → LIBERAR BOM EM LOTE** do 1673.2609, o painel calcula o material (multiplicado pela quantidade vendida), a Engenharia confere, "✓ Jogar na BOM" e libera para as 39.

**Testado** (navegador, gravações bloqueadas, corpo do que seria gravado conferido; **nada gravado**): `teste_14` **18/18** com as 39 Renegade reais — sem estrutura o painel cobra os 9 itens físicos e **não** cobra serviços
nem o 1687; com uma estrutura **simulada só na leitura** a conta multiplica pela quantidade vendida (2 e 7 no exemplo), "Jogar na BOM" leva o material sem a linha do 1687 e marcado "do CONJUNTO ELETRICO", e "LIBERAR BOM PARA 39 OPs"
grava a mesma BOM nas **39** OPs, uma por uma; `teste_15` **12/12** (item novo com código bloqueado, código vazio no envio, recusa do banco visível com a janela aberta, aviso do código dado, Estruturas com o 1687 fixo).
Regressão das telas alteradas: Engenharia 13/13, importação de itens 9/9, formulários da 7.2 9/9, recebimento 14/14. **Dois testes antigos foram atualizados de propósito** (`teste_54` e `teste_55`): esperavam a caixa "Este item é o Conjunto
Elétrico", que saiu; agora conferem o 1687 travado e, para o item 4108 (depois do milésimo do catálogo), que ele é encontrado e mostra perguntas/material sem a marca — 21/21 e 5/5.

**O que ficou de fora / a decidir:**

- **Responder as perguntas de uma OP que já existe** não tinha tela — **resolvido na Etapa 7.5** (tela de resposta em lote, aberta pelo painel da Engenharia).
- **Os serviços continuam na BOM sugerida** (película, instalação do kit, garantia estendida): só deixaram de ser cobrados na estrutura. Tirá-los da lista de separação do Almoxarifado é decisão do usuário.
- **41 itens ativos continuam sem código** (os criados à mão): dar código a eles fica **depois de o usuário decidir a planilha de auditoria**, para não codificar quem vai ser unificado.
- A liberação **individual** ("LIBERAR BOM" de uma OP só) recebeu a mesma mudança do "Jogar na BOM", mas **não foi exercitada** no navegador (as OPs do lote estão "Em Espera" e o botão individual só aparece depois de iniciar).

### ✅ Etapa 7.5 — Tela de resposta em lote das perguntas sobre o carro

**Feito em:** 29/09/2026, por pedido do usuário ("construa a tela de resposta em lote das perguntas").

**Por quê:** a resposta de uma pergunta de item ("tem hack de teto?") só nascia na abertura da OP, pelo vendedor. As 39 Renegade (1673.2609) e qualquer OP aberta antes de a pergunta
existir ficavam para sempre com a pergunta "sem resposta": a conferência da Engenharia só avisava, e não havia onde responder.

**O que foi feito** (`RespostasEmLote.tsx`, novo; `AplicarEstrutura.tsx`, `ConfigEstrutura.ts`, `EngenhariaTab.tsx`):

- **Onde se abre:** botão **"Responder agora (39 OPs)"** dentro da caixa "n pergunta(s) sobre o carro sem resposta" do painel da estrutura, na Engenharia. No **lote** atende todas as OPs marcadas; na liberação
  individual, a própria OP. Com tudo respondido, o mesmo lugar mostra "rever respostas".
- **Padrão + exceções**, a mesma ideia da abertura da OP em lote: em **"Para todas as OPs"** escolhe-se a resposta de cada pergunta; em **"Algum carro responde diferente?"** cada OP pode ter as suas.
  Pergunta "filha" só aparece depois da resposta-pai; embaixo de cada pergunta a tela diz **o que já está gravado hoje** ("38 com 'Na grade', 1 com 'No parachoque'"), e o que todas as OPs já respondem igual vem marcado.
- **Regras que a tela segue:** só entram OPs com veículo do catálogo **e** com o 1687 na venda (as outras aparecem como "ficam de fora"); o que o sistema já responde pela combinação de itens (botão "regra")
  fica "o sistema já sabia" e não se muda; trocar a resposta-pai **apaga** as respostas filhas (senão o material delas continuaria entrando); trocar resposta que já estava gravada **pede confirmação** e diz quantas;
  a BOM que a OP já tenha montada **não muda sozinha** (a tela avisa quantas OPs estão nisso).
- **O que grava:** `op_configuracao_respostas` (upsert por OP + pergunta, o mesmo lugar da abertura da OP, com quem respondeu e quando), mais **uma linha no histórico de cada OP** ("Respostas sobre o carro registradas: …", sem mudar a
  etapa). Falha no meio: gravar é repetível, clicar de novo completa sem duplicar.
- **Painel:** recalcula na hora o material com as respostas. Passou a **ignorar resposta "filha" órfã** (`podarRespostas`): antes, uma resposta filha sobrando ainda liberava o material dela.
- **Liberação em lote:** ganhou o aviso **"as OPs marcadas têm respostas diferentes"** (a mesma BOM iria para todas), que se refaz depois de responder.
- **Duas correções achadas no caminho:** (1) a lista de OPs do lote vinha **fora de ordem** (31, 11, 19…), e a "OP de referência" do painel caía numa unidade qualquer (a /31); agora vem em ordem de número (a referência é a /01);
  (2) **corrida antiga:** a sugestão inicial da BOM chega depois de a janela abrir e **substituía** a lista inteira, então quem clicasse em "Jogar na BOM" nesse intervalo via o material sumir (apareceu uma vez, em 1 de ~10
  execuções do teste do lote). Agora a sugestão **soma** ao que já está na lista.

**Testado** (navegador, gravações bloqueadas; perguntas, opções e material do carro **simulados só na leitura**, com um armazém em memória que devolve o que a tela tentou gravar — assim o painel recalcula de verdade):
`teste_16` **26/26** com as 39 Renegade reais — a tela abre para as 39 OPs, com a pergunta filha escondida; responder a resposta-pai faz a filha aparecer; uma **exceção** na OP /05; **grava 116 respostas** (38 OPs × 3 + a /05 × 2, sem a filha),
nenhuma "automática", com quem respondeu; **39 linhas de histórico** sem mudar etapa; **nada apagado nem gravado em outro lugar**; o painel recalcula e mostra o material das respostas da /01 (×2 do SLIMLED) sem o das outras
respostas; aparece o aviso de "respostas diferentes"; ao **rever**, o "hoje" mostra 38 × 1 e a resposta igual em todas já vem marcada; **trocar o padrão** pede confirmação ("38 respostas serão TROCADAS"), grava só nas 38 que mudam e
**apaga as 38 respostas filhas**; a janela está **na frente** da janela de BOM (posição na tela conferida e captura de tela vista). Regressão do que mexi: lote 18/18, Engenharia 13/13, Estruturas 12/12, 21/21 e 5/5.

**O que ficou de fora:**

- **Liberação individual** ("LIBERAR BOM" de uma OP só): usa o mesmo painel e o mesmo botão, mas **não foi exercitada** na tela (as OPs do lote estão "Em Espera").
- **Voltar uma pergunta para "sem resposta"** não existe: a tela troca a resposta, mas só apaga as filhas de uma resposta-pai trocada.
- **Sem restrição por perfil:** quem consegue abrir a liberação da BOM consegue responder (fica registrado quem e quando). Decisão a confirmar com o usuário se deve valer só para Engenharia/PCP/Admin.
- A tela só existe **dentro da liberação da BOM**; não há tela avulsa para responder OPs que estejam em outra etapa.
- Uma resposta dada **não refaz a BOM** que a OP já tinha montada (a tela avisa).

### ✅ Etapa 8 — Painel "Esperando a sua aprovação" em Compras

**Feito em:** 30/09/2026.

**Por quê:** quem aprova compra (as pessoas com a permissão marcada no Admin) só ficava sabendo por menção e e-mail. Para saber o que esperava por ele, tinha de abrir a lista de
requisições, filtrar por "Aguardando Aprovação" e conferir um a um.

**Ponto de partida conferido em 30/09/2026:** 2 compras em "Aguardando Aprovação" (PC-DEBMAA e PC-LBY8LY) e 4 aprovadores marcados (LUCIANO SPINELLI, BRUNA, RAFAEL NUNES e RAPHAEL WEBER MELLO).
Nenhuma das duas tinha vencedora escolhida.

**O que foi feito** (`ComprasTab.tsx`; nenhuma tabela, coluna nem dado foi mexido):

- **Painel no topo da tela de Compras**, entre o cabeçalho e os contadores: "Esperando a sua aprovação (n)". **Só aparece para quem tem `pode_aprovar_compra`** — a mesma regra do botão de aprovar
  (`podeAprovarCompra`). Quem não aprova não vê o painel e a consulta nem é feita.
- **Cada linha:** número da compra, **há quanto tempo espera**, descrição, quem pediu (e a OP, quando há), **quantas cotações** existem (ou "⚠ sem cotação"), se a **vencedora já foi escolhida**
  (com fornecedor e valor, só para quem vê valores) e o botão **"Abrir e decidir"**, que abre a mesma Mesa de Cotações do botão "🔒 Aprovação" do quadro.
- **Ordem:** a que espera há mais tempo primeiro. O "há quanto tempo" conta da **última vez que a compra entrou na etapa** (uma compra devolvida e reenviada conta de novo), lida do histórico da compra.
- **Fila vazia:** uma linha discreta ("✓ Nenhuma compra esperando a sua aprovação"), sem caixa laranja.
- **Independe do filtro da tela:** o painel tem consulta própria; escolher "Recebido" no filtro de status não o esvazia. Atualiza junto com a tela (a cada 30 s e depois de cada ação).
- **Falha na consulta do painel:** o painel some e o resto da tela segue normal (não vira aviso de erro no meio do trabalho).
- **Mostra também quem mais recebe:** "Qualquer aprovador pode decidir; também recebem: …" (sem o próprio usuário).

**Testado** (navegador, gravações bloqueadas): `teste_17` **24/24** — com o dado real, o aprovador vê o painel com **2** compras na ordem certa, os 3 outros aprovadores, 2 botões, painel logo acima dos
contadores, filtro em "Recebido" não muda o painel, "Abrir e decidir" abre a Mesa de Cotações da primeira da fila; quem não aprova **não vê nada e não dispara a consulta**; fila vazia; e, com **dados simulados só
na leitura**, a ordem pelo histórico (a reenviada há 2 h fica depois da que espera há 30 h), "há 1 dia" / "há 2 h", contagem de cotações, "sem cotação", vencedora com valor (Admin) e **sem valor** (perfil que
não vê valores), falha de consulta (500) sem quebrar a tela. **Nenhuma gravação** em nenhum cenário. Regressão: `teste_7` 16/16, `teste_8` 31/31, `teste_61` 21/21, `teste_62` 30/30, `teste_63` 23/23.

**O que ficou de fora:**

- **Aprovação de ponta a ponta não foi exercitada**: abrir a Mesa de Cotações foi testado; escolher a vencedora e aprovar (grava e pede senha) não, por gravar em produção. O painel se refaz
  sozinho depois dessa ação porque ela recarrega a tela (lido no código, não visto).
- **Sem aviso de atraso por cor** (verde/amarelo/vermelho por tempo de espera), como na Etapa 6: só o "há quanto tempo". Prazo aceitável para aprovar é decisão do usuário.
- **Sem contador no menu** ("Compras (2)"): o painel só é visto depois de abrir Compras.
- O painel mostra as compras **da etapa de aprovação apenas**; as que exigem alçada por valor ou departamento (`pcp_aprovacoes`) continuam sendo resolvidas dentro da Mesa de Cotações.

### ⬜ Etapa 9 — Reorganizar a tela do PCP
Os 6 blocos de alerta empilhados viram abas ou um accordion com prioridade
visual clara (o que precisa de ação agora primeiro).

### ⬜ Etapa 10 — Ações em lote maiores no kiting
Botão "marcar tudo que o setor já fabrica" além do "marcar item a item",
pra lotes grandes.

### ⬜ Etapa 11 — Migrar Fiscal para o design system (piloto)
A menor das telas que ainda não usa `Interface.tsx` (497 linhas) — serve de
prova de conceito antes de encarar SAC (a maior, 3000+ linhas).

### ⬜ Etapa 12 — Migrar SAC, RH, Logística, Relatórios
Depois do piloto validado, o resto na mesma linha.

### ⬜ Etapa 13 — Aposentar `TonsVisuais.ts` e o dark mode hex-a-hex
Só depois que a migração acima cobrir o suficiente — os dois remendos
deixam de ser necessários quando não sobrar `style` inline pra adivinhar.

### ⬜ Etapa 14 — Reorganizar a barra lateral
Separar "Administrativo" (12 itens) em grupos menores e mais previsíveis.

---

## Perguntas em aberto

- **Criação automática de OP (pós-Etapa 4):** ao ganhar o card, a OP nasce sem
  os gates do `NovaOpOsModal`. Exigimos/avisamos o fluxo de entrega nesse
  momento? Qual regra?
- **Selo "onde está" nos cards fora de "Vencido" (6.3):** hoje só aparece na coluna "Vencido".
  Há 2 cards em "Faturado" com a OP ainda esperando a liberação comercial e 1 em "Enviado" com a
  OP na fila da produção. Mostrar o selo em qualquer coluna em que o card tenha OP?
- **Quanto tempo o aviso fica na tela (Etapa 7):** hoje erro some em 9 s e atenção em 7 s.
  Para uma falha ao gravar (a pessoa pode estar olhando outra coisa), vale o erro **ficar até ser
  fechado**? Muda o comportamento de mais de 240 mensagens, por isso não mexi.
- **Unificação de itens (7.2) — marcar a planilha:** o usuário escreve SIM/NÃO nas abas `Decidir` (48) e `Sem candidato` (21) de
  `auditoria_unificacao_de_itens.xlsx`; aplicar com `unificar_item(…, 'planilha')`, com nova liberação de gravação.
- **Quem pode responder as perguntas de OP já aberta (7.5):** hoje quem abre a liberação da BOM responde (fica registrado quem e quando). Vale restringir a Engenharia/PCP/Admin?
- **Serviços na BOM sugerida (7.4):** película, instalação do kit e garantia continuam como linhas de separação na sugestão da Engenharia; tirar é decisão do usuário.
- **Ordem geral:** a sequência acima é uma sugestão — qual etapa começar
  primeiro é decisão do usuário.

---

## Decisões tomadas

| Data | Decisão |
|---|---|
| 29/09/2026 | Bug funcional (A2, frete) tem prioridade sobre qualquer polimento visual. |
| 29/09/2026 | Nomenclatura só muda migrando dado junto, nunca só no código. |
| 29/09/2026 | Card do CRM com OP já lançada: não esconder "Lançar OP" (há card com mais de uma OP de verdade); trocar por "Lançar outra OP" com confirmação e mostrar o selo com o número. |
| 29/09/2026 | Liberar BOM com demanda de Serralheria/Chicotes/Compras em aberto: **avisa e deixa seguir**, não trava. |
| 29/09/2026 | Aviso de falha do sistema passa o tom explícito (`atencao`/`erro`): o tom por adivinhação pelo texto pinta "não foi criada" de verde. |
| 29/09/2026 | Órfãos seguros apagados (`prepararOpComercial`, `PedidoCompraList.tsx`, os dois `EngenhariaTab-*` vazios). `ComercialTab.tsx` só sai depois de o reenvio de OP devolvida ganhar tela viva (Etapa 3.1) — decisão do usuário. |
| 29/09/2026 | **OP devolvida ao Comercial volta para quem devolveu** (Engenharia → `Em Espera Engenharia`; Fiscal → `Aguarda Emissao NF`), não sempre para a Engenharia — decisão do usuário. |
| 29/09/2026 | Reenvio de OP devolvida é **um por um**, feito pelo Comercial depois de corrigir; sem lote e sem correção em massa das paradas. |
| 29/09/2026 | **Formulário simplificado de OP do CRM removido**: toda OP manual nasce pelo `NovaOpOsModal`; a janela "Lançar OS" serve só para OS — decisão do usuário. |
| 29/09/2026 | **Nome oficial da etapa "aguardando liberação comercial": `Aguardando Liberacao Comercial`** (o curto; o "Aprovado CQ" fica em `resultado_cq`). O longo continua reconhecido na transição e nos históricos — decisão do usuário. |
| 29/09/2026 | **Item que liga a montagem automática: "Conjunto Elétrico"** (nome do catálogo); a coluna `eh_conjunto_instalacao` não muda — decisão do usuário. |
| 29/09/2026 | **Sigla nas telas: "OP"**, não "OPL"; nomes internos não mudam — decisão do usuário. |
| 29/09/2026 | `Sanado` é valor legítimo de `serralheria_status` (4º passo da liberação parcial, gravado pelo PCP), fora do menu da Produção. |
| 29/09/2026 | Migração de dado de status só depois de a publicação do código estar no ar, e só com autorização; histórico (`logs_movimentacao_opl`, `audit_log`, `lixeira`) nunca é reescrito. |
| 29/09/2026 | **Etapa 6 ("onde está agora")**: aparece nos **três lugares** (detalhe da OP e Dossiê, coluna da lista "OPs em aberto", selo do card do CRM), em fatias 6.1 → 6.2 → 6.3; conteúdo = etapa, setor, desde quando e pendências, mais frete e NF quando existem; o "há quantos dias" é **só o número, sem cor de alerta** — decisão do usuário. |
| 29/09/2026 | **Coluna da lista "OPs em aberto" (6.2)**: mostra as pendências que **seguram a OP** (o índice que a Produção e o Almoxarifado já usam), não todas as da faixa; e o "desde quando" vem de uma **função de leitura no banco** (`desde_quando_na_etapa`), criada com autorização do usuário — decisões do usuário. |
| 29/09/2026 | **Selo "onde está" do card (6.3)**: um segundo selo ao lado do número da OP, com setor e dias da OP mais parada; clicar abre o detalhe da OP (a primeira unidade, se forem várias). O `Selo` ganhou `onClick` (vira `<button>`). Só na coluna "Vencido" por enquanto. |
| 29/09/2026 | Os nomes das etapas da OP, o setor de cada uma e a regra do "desde quando" moram em **`EtapasOp.ts`** (fonte única da barra de progresso e da faixa). Quem lê histórico compara etapas por `mesmaEtapa()`, nunca por `===`, porque o histórico guarda o nome antigo da liberação comercial. |
| 29/09/2026 | Mapa de "alteração não lida": a conta passa a ser feita **no banco** (função de leitura `entidades_com_alteracao_nao_vista`), não paginando no navegador, porque a auditoria só cresce — decisão do usuário. O caminho antigo fica como reserva. |
| 29/09/2026 | **Etapa 7.1 (pedido do usuário, fora de ordem)**: na edição da OP o veículo é escolhido do **catálogo** (o mesmo seletor da criação) e preenche o Modelo; a edição do CRM parte da OP inteira e grava **só o que mudou**; o cartão da OP mostra todos os dados cadastrados; a ficha "Jeep Renegade 4x4" passou a valer **de 2015 em diante** (nome mantido) e as 40 OPs sem texto de modelo receberam o nome da ficha — decisões do usuário. |
| 29/09/2026 | **Etapa 7.2 (pedido do usuário, fora de ordem)**: itens repetidos são **unificados sem apagar** (o repetido fica inativo, com nota e registro em `itens_unificacoes`); preferência **sempre pelo item com código**; o que for duvidoso vai para a **planilha de auditoria** e o usuário decide. O **Conjunto Elétrico é um item só** (gatilho). Custo do repetido **não** é copiado para o principal. |
| 29/09/2026 | **Unificação gravada com autorização do usuário no chat** ("liberar a gravação da unificação dos itens"): 441 itens, só o que não deixava dúvida; o resto só depois de o usuário marcar a planilha, **com nova liberação a cada gravação em massa**. |
| 29/09/2026 | **Confirmado pelo usuário no chat ("SIM E SIM")**: o principal do Conjunto Elétrico é o item **1687**; as parcelas do centro de custo são **número combinado + "pagas x de N"**, **sem cronograma** (uma linha por parcela com vencimento só se ele pedir depois). |
| 29/09/2026 | O "Conjunto Elétrico PV …" novo vindo do ERP entra inativo na importação (7.2): a pergunta perdeu o sentido — o usuário disse que **não vai mais importar** do ERP e a regra passou a valer no banco (7.4). |
| 29/09/2026 | **Só existe UM Conjunto Elétrico, o 1687 (7.4, decisão do usuário):** qualquer outro "Conjunto Elétrico" fica inativo e o banco recusa ativá-lo; só o 1687 é o gatilho e ele é protegido (não desativa, não muda de código, não exclui). |
| 29/09/2026 | **Itens deixam de vir do ERP (7.4, decisão do usuário):** item novo é criado no sistema e o **código é gerado pelo sistema**, continuando a numeração (4410 em diante; o 999999 é reservado). |
| 29/09/2026 | **Perguntas de OP já aberta são respondidas em lote pela Engenharia** (7.5, pedido do usuário): padrão para todas + exceções por OP; troca de resposta-pai apaga as filhas; a BOM que a OP já tenha não é refeita sozinha; resposta fica com quem respondeu e ganha linha no histórico. |
| 29/09/2026 | **Jogar na BOM** (estrutura automática) tira o Conjunto Elétrico da lista de separação e marca o material como "do CONJUNTO ELETRICO"; serviço/`GENERICO` nunca é cobrado como "nunca adaptado". |
| 29/09/2026 | **Recebimento de reposição (7.3):** entra no estoque a quantidade **realmente recebida**, e a janela **abre com a quantidade COMPRADA** (a pessoa corrige se chegou outra). Pedido de reposição recebido sem entrada no estoque é falha visível, nunca silêncio. Para PC-FU6DS9 o usuário decidiu creditar **10 (a comprada)**. |
| 29/09/2026 | Formulário de edição **abre com o que está salvo e só grava o que mudou**; valor em dinheiro entra no campo **já em formato brasileiro**, porque o "salvar" trata o ponto como milhar (`fmtValorEdit`). |
| 29/09/2026 | Clique que **nasce dentro de uma janela e termina no fundo** (arrastar o mouse ao selecionar texto) **não fecha a janela**; vale para todas de uma vez (`ProtecaoDeFundo.ts`). Clique de verdade no fundo continua fechando. |
| 29/09/2026 | **Tom dos avisos (Etapa 7)**: o `tomDe()` do `Feedback.tsx` compara sem acento e trata **recusa por permissão como erro (vermelho)**, regra que barrou/validação/resultado parcial como **atenção (amarelo)**; mensagem montada na hora (erro do banco) leva o tom explícito. Nenhuma duração mudou. Suposição minha: recusa por permissão é vermelha, como já era "sem permissão". |
| 29/09/2026 | "OPL" só vira "OP" onde é texto para ler. **Ficam:** `tipo_op` (OPL = OP da ACN, OPD = da Detech), o tipo de documento de Vistorias, o par "OPL ou OPD", identificadores, comentários, o que as pessoas digitaram e o histórico já gravado. |
| 30/09/2026 | **Etapa 8 (Compras):** o painel "Esperando a sua aprovação" é visto **só por quem tem `pode_aprovar_compra`**; a compra fica na caixa **de todos** os aprovadores e qualquer um resolve (regra de 24/09), então a lista é a mesma para os quatro; tem consulta própria, **não depende do filtro da tela**; o tempo de espera é **só o número, sem cor de alerta** (mesma linha da Etapa 6). Suposição minha, não confirmada com o usuário. |
| 30/09/2026 | **5.1c continua adiada:** 0 aprovações no CQ desde o deploy do nome oficial (a última é de 25/09); só apertar o código com ~10 aprovações todas no nome oficial. |
