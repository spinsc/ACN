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
  *(Resolvido na Etapa 9, em 30/09/2026: faixa "O que pede o PCP agora" e blocos que só acompanham abrem recolhidos.)*
- `alert()`/`confirm()` nativos do navegador em quase toda ação — sem
  hierarquia de severidade, sem estilo do sistema.
  *Correção da Etapa 7 (29/09/2026): isto já estava resolvido no essencial — todo
  `alert()` é redirecionado para o aviso do sistema em `main.tsx`, e `confirmar`/
  `pedirTexto` (`Feedback.tsx`) já cobrem confirmação e texto. Sobravam só 2 `confirm()`
  nativos e o **tom** dos avisos, que é adivinhado pelo texto e errava em 16% deles.*
- Kiting em lote: nenhuma sugestão de fabricação vem pré-marcada — pra um
  lote de 90 carros, isso é dezenas de cliques de checkbox.
  *(Etapa 10, 30/09/2026: a premissa estava errada — a marcação é por peça sugerida, uma vez por lote, e hoje são de 1 a 5 cliques. "Marcar todos" foi feito mesmo assim, para quando as BOMs crescerem; nada vem marcado sozinho.)*
- Dois campos de prazo parecidos no pedido de compra (`data_prevista_
  recebimento` vs `prazo_prometido_entrega`) — fácil de confundir.

### F. Design system (detalhado no relatório de 29/09/2026, resumo aqui)

- `Interface.tsx` é um sistema de design maduro (`Botao`, `Selo`, `Abas`,
  `SelectBusca`, `MenuAcoes`) — mas só o Dashboard (e as telas que eu mexi
  nesta sessão: CRM, Licitações, Cotações, Estoque) o usam de verdade.
  RH, SAC, Fiscal, Logística e Relatórios reinventam cor e botão à mão.
  *(Fiscal migrada na Etapa 11, Relatórios na 12a e **Logística inteira nas 12b1 a 12b3** — a última em 01/10/2026; faltam RH e SAC — 12c e 12d.)*
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
**Correção posterior (30/09/2026, Etapa 7.11):** essa conclusão olhou só os fretes **já entregues**. Os **5 fretes que estavam em cotação** tinham sido criados antes da correção, com o vínculo `'opl'`, e a entrega **não** os liberaria. Corrigido na 7.11 (a leitura passou a aceitar os dois nomes).

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

**Medido de novo em 30/09/2026 (~21h UTC, ao abrir a Etapa 12): ainda não cumpre, 5.1c segue adiada.** Aprovações no CQ depois do deploy do nome oficial: **7, todas com o nome oficial e 0 com o antigo** (OPs com o nome antigo agora: **0**; com o oficial: 194). Mas as 7 são **de um dia só (30/09) e de uma pessoa só (FELIPE OLIVEIRA)**: não prova que as abas antigas de **outros** usuários foram renovadas, e o critério pede ~10 e alguns dias úteis. Voltar a medir em 2 ou 3 dias úteis.

**Medido de novo em 30/09/2026 (~23h30 no horário de Brasília, ao abrir a 12b3): idêntico, 5.1c segue adiada.** Aprovações no CQ depois do deploy: **7**, todas com o nome oficial, **0** com o antigo, de **uma pessoa e um dia** (30/09, entre 17h12 e 17h15 no horário de Brasília); OPs com o nome antigo agora: **0** (oficial: **194**). Nenhuma aprovação nova desde a medição anterior. Voltar a medir em 2 ou 3 dias úteis.

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

**Rodada 2 da unificação — planilha decidida pelo usuário (30/09/2026).** O usuário marcou a planilha e escreveu, no chat: *"os sem candidatos, desativa o que não tem código e mantém o que tem código"*. Li as abas e cruzei com o
banco **antes de gravar** (nenhuma gravação sem a liberação dele; ele respondeu a perguntas clicáveis):

- **Aba Decidir (48 linhas):** **7 SIM** (2432→2429, 1644→896, sem código "RADIO PORTATIL CALTTA DH410 VHF"→3063, 2259→1821, 2769→2249, 2024→1801, 1872→1862). Nas seis primeiras ele escreveu "MENOR CODIGO (NUMERO MENOR)" onde iria um código:
  conferi que em **todas** o principal sugerido já é o de menor número. **41 NÃO** (itens diferentes; ficam como estão). A simulação (`unificar_item(…, false)`) deu **zero referências e zero estoque** nas 7, então **nenhuma OP, BOM ou kit mudou**.
- **8 linhas marcadas NÃO com o comentário "AQUI TUDO CERTO, O QUE NÃO TEM CÓDIGO SE DESATIVA"** (SLIMLED4 G2 VM, SLIMLED4 G2 VERMELHA, SLIMLED4 G2 AZ, INTERLED2 AZ, INTERLED2 VM, INTERLED8 VM/AZ, INSTALAÇÃO KIT e SLIMLED G2 VM): conflito entre a
  decisão e o comentário, e eram itens **em uso** em OPs (BOM, vendido e conferência de kit). Perguntei; ele escolheu **"só desativar, sem mexer nas OPs"** (a alternativa era apontar tudo para o item com código, como nos 441). **As OPs continuam apontando
  para esses itens inativos** (SLIMLED4 G2 AZ em 3 OPs, SLIMLED4 G2 VM em 3, INSTALAÇÃO KIT em 5, etc.). O SLIMLED G2 VM tinha saldo 2 de uma contagem de teste de 24/09, mas **não controla estoque** (`controla_estoque = false`) e o pedido ligado a ele estava descartado.
- **Aba Sem candidato (21 itens, todos sem código):** ele escolheu **desativar os 21**. Hoje: 12 não usados; **8 dentro de estrutura de kit** (arame de solda, cantoneira, consumível de tocha, corte e dobra, disco desbaste, fundo vermelho, serviço munk, tinta epóxi) e **1 no BOM de uma OP**
  (BARRA SINALIZADORA WINGLUX RONTAN). **Conferi no código que o kit lê o item sem filtrar ativo/inativo e o custo vem do `custo_unit`: desativar não tira o item do kit nem muda o custo do kit**; ele só some das listas de escolha.

**Gravado em 30/09/2026, num bloco único (tudo ou nada, com travas de contagem):** **7 unificações** (`unificar_item`, origem `planilha`) e **29 desativações** (8 + 21), cada uma com a nota "Desativado em 30/09/2026: item sem código (decisão do usuário na auditoria de itens repetidos)".
**Conferido depois, por consulta independente:** 7 registros novos em `itens_unificacoes`; 29 itens desativados por falta de código + 7 inativos por unificação hoje; os 7 principais seguem ativos; **ativos sem código: 41 → 11**; ativos no total **3.955** de 4.441 itens. **Nada foi apagado.**
Esta foi gravação de **dados** (não de estrutura), por isso `execute_sql` e não `apply_migration`; os identificadores vieram da planilha.

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

- **A aplicação das decisões da planilha** (48 + 21 linhas): ~~depende de o usuário marcar SIM/NÃO~~ — **feita em 30/09/2026, ver "Rodada 2 da unificação" abaixo**.
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
  *(30/09/2026: a planilha foi decidida; dos 41 sobraram **11** ativos sem código — os marcados NÃO sem comentário. **Os 11 receberam os códigos 4413 a 4423 no mesmo dia, por pedido do usuário** — ver Etapa 7.6. Hoje: 0 ativos sem código.)*
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

### ✅ Etapa 7.6 — Versões dos carros sem motorização + códigos dos 11 itens que sobraram

**Feito em:** 30/09/2026, por dois pedidos do usuário no chat ("Pode gerar os códigos dos 11 itens" e "ajuste os carros e modelos para aparecer versões, não motorização, 1.6, 2.0 e etc, mas preciso de versões, como TSI e CTI, ADVENTURE").

**1) Códigos dos 11 itens** (os ativos sem código que sobraram da unificação): gravados com o **mesmo mecanismo do código automático** (sequência `cadastro_itens_codigo_seq`, que pula número já existente), na ordem de criação, num bloco único
(tudo ou nada, com trava de contagem): **4413 a 4423** — disco de corte 4413, disco flap 4414, Mão de obra (h) 4415, RADIO MOVEL DM660 VHF 4416, RÁDIO DH410 VHF 4417, FRETE CLIENTE 4418, FRETE DE ENVIO 4419, RÁDIO DH 410 UHF 4420, CALHA DE CHUVA 4421,
PROTETOR DE MOTOR/CARENAGEM 4422, TUBO DE ACO REDONDO 2 POL 4423. Conferido: **ativos sem código: 0**, nenhum código ativo repetido, a sequência segue em 4423. Nada mais foi alterado nesses itens (as OPs que os citam guardam o item pelo id, não pelo código).

**2) Versão do carro, sem motorização** (lista de modelos da janela "Cadastrar veículo"). **Ponto de partida:** desde 28/09 a regra `fipe_modelo_simplificado` juntava tudo num "modelo por chassi" e **jogava fora a versão** (Polo, Toro e Compass viravam um item só;
o TSI era apagado junto com a cilindrada). O usuário pediu o contrário e deu o motivo: *no Fiat Toro o suporte muda de uma Adventure para uma Freedom; o motor delas não importa*. Mostrei três opções com números (só emblemas ≈ 2.100 itens; **todas as versões**
5.878; emblemas + seletor) e ele escolheu **B — todas as versões, só para carros**.

- **Regra nova, só carros** (função `fipe_modelo_versao_carros`, migrações `fipe_versoes_dos_carros_sem_motorizacao` e `fipe_versoes_carros_sufixo_colado_e_kwh`): **sai** cilindrada (1.0, 2.0, 1.6i, 1.6Mi), potência (cv, kWh), válvulas (16V), combustível (Flex, Diesel), câmbio (Aut., Mec., Tiptronic),
  portas (4p, 5p) e tração 4x2; **ficam** a versão e os emblemas (Freedom, Volcano, Comfortline, Longitude, **TSI, CTI, TDI**, **Adventure**, 4x4, CD/CE/CS, Híbrido…). Abreviações que a FIPE corta viram o nome inteiro (Comfor. → Comfortline, Hig. → Highline, Adv. → Adventure,
  Volc. → Volcano, Ed. → Edition…). Um emblema **colado** ao número ("1.4TSI") não é engolido junto com a cilindrada.
- **Motos e caminhões não mudam:** o gatilho escolhe a regra pelo tipo da marca; a cilindrada/numeração faz parte do nome deles. **A coluna `nome_simplificado` é derivada e regenerável**; a FIPE (nome, códigos, anos) e as fichas do catálogo (`veiculos`) **não foram tocadas**.
- **Tela** (`VeiculoCadastro.tsx`): o agrupamento ignora maiúscula e acento (a FIPE escreve "ARGO DRIVE" e "Argo Drive" para o mesmo carro) e os textos de ajuda dizem "junta N linhas da FIPE que só mudam de motor, câmbio ou portas". O seletor "Preciso do nome exato da FIPE" continua com o nome cru.

**Números (banco real):** carros recalculados **7.366**, dos quais **6.635 mudaram** o nome simplificado; itens distintos na lista de carros **1.557 → 5.805**. Exemplos: Toro → Blackjack, Endurance, Freedom, Freedom Road, Opening Edition, Ranch 4x4, Ultra, Volcano, Volcano 4x4…;
Polo → Polo TSI, Polo Comfortline TSI, Polo Highline TSI, Polo GTS TSI, Polo GTI…; HUNTER (JAC) → HUNTER HD 4x4 CTI; Strada → Strada Adventure CD/CE, Strada Trekking…. Emblemas mantidos: **TSI 87 de 87, CTI 4 de 4, Adventure 37 de 37**. Sobra de motorização: 1 nome de 7.366 (um Range Rover "3.0i6").

**Testado:** consultas de conferência no banco (contagens acima; **motos e caminhões: 0 linhas alteradas**; fichas `veiculos` 4 e OPs ligadas 43, iguais); **o gatilho com modelos de mentira** (inseridos e desfeitos por exceção, 0 resíduo): "ZZTESTE Adventure 1.8 16V Flex Aut. 4p" → "ZZTESTE Adventure",
"Highline 1.4TSI Flex Aut." → "ZZTESTE Highline TSI", "Hunter HD 2.0 CTI Diesel Aut." → "ZZTESTE Hunter HD CTI", e uma moto seguiu a regra antiga. `teste_22` (navegador, dado real, gravações bloqueadas) **12/12**: a janela abre; o contador da marca Fiat bate com o banco (585 linhas → 387 itens);
"toro" lista as 14 versões sem motorização; nenhuma opção com 1.6/2.0/Flex/Aut.; nenhum item repetido por caixa; "Toro Freedom" vira o nome do cadastro; o nome cru da FIPE segue disponível; "adventure" traz as versões Adventure; o agrupamento junta só o que difere na caixa. Regressão: `teste_8b` 6/6, `teste_12` 6/6, `teste_15` 12/12, `teste_54` 21/21, `teste_crm` 16/16; build ok.

**O que ficou de fora / limites:**

- **A lista de carros ficou bem maior** (Fiat: 387 itens; Toyota Hilux sozinha tem dezenas): é o que a opção B pede; a busca da janela continua por palavras ("toro adventure"). Se ficar pesado, a opção A (só emblemas) é uma troca de regra.
- **As 4 fichas já cadastradas** ("Renegade 4x4", "Toro", "Titano 4x4", "C3") **não foram renomeadas** (não pedi nem fiz): o "Toro" da ficha continua sendo o Toro de todas as versões; as versões aparecem nos **próximos** cadastros. **A correção passou a ter tela na Etapa 7.7** ("Editar veículo").
- **Abreviações não cobertas:** "Advent." (Idea) sai como "Advent. Adventure Locker" e "Extremeloc" fica colado; poucas dezenas de nomes antigos. Marcas de luxo e vans ainda carregam alguma numeração de modelo (BMW 30e, Sprinter 16L) — não é motorização dos carros que a fábrica adapta.
- **Ano:** os anos oferecidos continuam sendo a união de todas as linhas do grupo (como antes).

### ✅ Etapa 7.7 — Tela "Editar veículo" (corrigir a ficha do catálogo)

**Feito em:** 30/09/2026, por pedido do usuário no chat ("saber quem cadastrou os carros que já estão cadastrados e quais os PV's, e saber se há opção hoje de ajustar o modelo do carro… por exemplo a toro"). Mostrei as duas saídas (criar a tela de edição × ajustar as 4 fichas agora pelo banco) e ele escolheu **criar a tela**.

**Ponto de partida conferido (30/09/2026):** só existia **cadastro** de ficha (`ModalCadastrarVeiculo` era o único lugar que gravava em `veiculos`); nenhuma tela editava nem apagava. 4 fichas, 43 OPs ligadas e **0 linhas de estrutura de material** (`veiculo_item_materiais`) — por isso corrigir agora não mexe em material nenhum.
Quem cadastrou (resposta ao usuário): **C3** — TATIANA ROSA, 28/09, OP 1669.25609, 2 unidades, texto "C3 YOU"; **Toro** — THIAGO MEDEIROS, 28/09, OP D0778.2609, 1 unidade; **Renegade 4x4** — TATIANA ROSA, 29/09, lote 1673.2609, 39 unidades; **Titano 4x4** — THIAGO MEDEIROS, 30/09, OP A1678.2609, 1 unidade.

**O que foi feito** (`VeiculoCadastro.tsx`, `Veiculos.tsx`, `AdminTab.tsx`; nenhuma tabela, coluna, gatilho nem dado foi mexido):

- **Lista no Admin → aba "🚗 Veículos"** (`PainelFichasVeiculos`, abaixo da atualização da FIPE): marca e nome, tipo, anos, **quantas OPs** usam a ficha, **quem cadastrou e quando**, observações e o botão **Editar** (só Admin e Gerente). Tem busca por marca, modelo, ano ou quem cadastrou. **Não há "excluir".**
- **Janela "Editar veículo":** é o **mesmo** modal do cadastro (`ModalCadastrarVeiculo` ganhou a propriedade `veiculo`), não uma tela paralela. Abre com a ficha atual em destaque ("Fiat Toro · 2026+ · 1 OP ligada · cadastrado por…"), a **marca já escolhida** e nome, anos e observação preenchidos. Escolher a versão na FIPE é **opcional**: serve para trocar a versão; para corrigir nome, ano ou observação basta mexer nos campos. O nome aceita até 100 letras (é o que o campo "Modelo" da OP guarda).
- **Ligação com a FIPE:** só muda se a pessoa pediu (escolheu outra versão, ou "soltar da FIPE e editar à mão"); corrigir só o nome deixa a ligação como estava.
- **"Modelo" das OPs ligadas:** o texto "Modelo" da OP é uma **cópia** do nome da ficha, gravada quando a ficha foi escolhida; renomear a ficha não muda a cópia, e as listas continuariam dizendo "Toro". A janela mostra a caixinha "Trocar também o campo Modelo de N das M OPs…" com **o texto de hoje**. Ela vem **marcada só quando o nome mudou**; se o nome não mudou, vem desmarcada (não sobrescreve um texto digitado à mão, como o "C3 YOU"). Marcada, o "Salvar" pede **confirmação com a contagem e o texto antigo** antes de gravar. A coluna de busca (`modelo_norm`) se refaz sozinha pelo gatilho `sync_norm_oples`.
- **Histórico:** a mudança da ficha e a de **cada OP** entram no `audit_log` (quem, o quê, de → para). Se a ficha grava e a troca nas OPs falha, o aviso diz exatamente isso e **não** escreve histórico de OP.
- **Dentro da OP:** ao lado do "+ Novo" do campo de veículo (criação e edição da OP) aparece **"✏️ Editar"** quando já há uma ficha escolhida (só Admin e Gerente); abre a mesma janela e, ao salvar, o campo Modelo do formulário aberto acompanha o nome novo.

**Testado:** `teste_23` (navegador, dado real, **gravações bloqueadas**: o que seria gravado fica capturado e a resposta é simulada no navegador) **33/33**. A lista tem as 4 fichas, OPs 2/1/39/1 e quem cadastrou iguais ao banco; a busca "tatiana" deixa 2. A janela abre com a ficha, a marca Fiat e os campos preenchidos; salvar sem mudar nada avisa "Nada mudou" e não grava.
Renomear a Toro para "Toro Freedom" marca a caixinha, pede confirmação ("Toro" em 1 OP), **Cancelar não grava**, confirmar grava a ficha (`nome_norm` "fiat toro freedom", **sem** tocar na ligação com a FIPE), troca **só** o `modelo` da OP e escreve 2 linhas de histórico. Escolher "Toro Volcano" na FIPE liga a ficha a uma das 3 linhas do grupo; "soltar da FIPE" zera a ligação e não mexe nas OPs.
C3: a caixinha vem **desmarcada**, salvar só o ano não toca nas OPs, marcada pede confirmação ("C3 YOU" em 2 OPs), e uma falha simulada na troca das OPs avisa e não escreve histórico de OP. O "✏️ Editar" da OP só aparece depois de escolher a ficha; só Admin e "Gerente …" passam na permissão. **No fim o banco real ficou idêntico** (fichas e "Modelo" das 43 OPs). Regressão (a janela de cadastro foi mexida): `teste_22` 12/12, `teste_8b` 6/6, `teste_12` 6/6, `teste_15` 12/12, `teste_54` 21/21, `teste_crm` 16/16; build ok.

**O que ficou de fora / limites:**

- **Nenhuma das 4 fichas foi corrigida ainda** — falta o **modelo exato** de cada uma (ver "Perguntas em aberto"); quem souber corrige pela tela, ou eu aplico pelo banco com a contagem.
- **Quem edita:** só Admin e Gerente (`ehAdminOuGerente`, a mesma regra da edição completa da OP). A equipe de Comercial/CRM, que cadastrou as fichas, **não** edita; dar a ela o poder é trocar por `temPoderDeGerente` numa linha — decisão do usuário.
- **Desativar ficha** (tirar da lista sem apagar) não entrou: não foi pedido.
- Só as OPs ligadas à ficha por `veiculo_id` têm o "Modelo" trocado; OP sem ficha (texto digitado à mão) segue como está.
- O caminho de gravação foi exercitado **por simulação**; nada foi gravado na produção.

### ✅ Etapa 7.8 — Equipe da OP: quem trabalhou na adaptação e na serralheria, editável até o Fiscal faturar

**Feito em:** 30/09/2026, por pedido do usuário no chat ("Antes de tudo, preciso poder editar em qualquer momento antes de faturar quem trabalhou na serralheria e quem trabalhou na adaptação em cima de uma OP para poder gerar os orçamentos").
Respondeu três perguntas minhas: (1) **é o apontamento que já existe, feito pelo gerente da produção (Felipe)**, só que precisa poder ser corrigido quando não foi feito; **ao faturar, a comissão é calculada sozinha em cima da MO serralheria e da MO adaptação**; (2) na serralheria, **lista de pessoas por OP**, igual à Equipe da adaptação; (3) **edita até o Fiscal faturar; Admin, Gerente e quem já edita a Equipe**.

**Ponto de partida conferido (30/09/2026):**

- O botão **"Equipe"** só existia dentro da Produção e só **enquanto a OP estava em produção ou retrabalho** (`emProd || emRetrab`). Concluída a produção, não havia onde corrigir.
- A comissão do RH lê **só** `responsaveis_producao` (a lista da Equipe) e **ignorava a OP sem o técnico principal preenchido** (`.not('tecnico_producao_id','is',null)`). OP sem ninguém apontado some da comissão **sem aviso**.
- **Das 24 OPs esperando NF-e hoje, 7 têm mão de obra lançada e ninguém apontado** (6 de adaptação, de R$ 278,00 a R$ 1.585,00, e 1 de serralheria); só 1 das 24 tinha equipe. Se o Fiscal faturasse agora, essas comissões sairiam zeradas.
- **Não havia lista de quem trabalhou na serralheria**: a pessoa era um nome único dentro de cada demanda de serralheria (41 demandas). Nenhum funcionário do RH estava cadastrado com base "Serralheria".
- `responsaveis_producao.papel` não tem restrição no banco (era `responsavel` e `apoio`): um papel novo **não pede mudança de estrutura**.

**O que foi feito** (`EquipeDaOp.tsx` novo; `AcnTabShared.tsx`, `FiscalTab.tsx`, `ProducaoTab.tsx`, `RHTab.tsx`, `utils/permissoes.ts`, `design.css`; **nenhuma tabela, coluna, gatilho ou linha de dado foi mexida**):

- **Janela "Equipe — OP …"** com três listas: *Adaptação — responsáveis*, *Adaptação — apoios* e **Serralheria — quem trabalhou** (papel novo `serralheria`, texto livre como os outros). Adicionar escolhe só gente do cadastro do RH; **repetir a mesma pessoa no mesmo papel é recusado**; remover pede confirmação. Cada pessoa sem percentual de comissão no RH ganha o selo **"sem percentual no RH"** (a comissão dela sairia zerada). Um aviso amarelo diz quando a OP tem **mão de obra de adaptação sem responsável** ou **de serralheria sem ninguém**.
- **Histórico da OP:** cada adição/remoção vira uma linha em `logs_movimentacao_opl` com quem fez ("Responsável adicionado: …", "Serralheria removido: …", setor *Producao* ou *Serralheria*).
- **Lote:** para OP de lote (BASE/01, /02…), uma caixinha **"Valer para as N unidades deste lote que ainda não foram faturadas"**, **desmarcada** (nada vem marcado). Marcada, adicionar/remover vale para todas as livres; a faturada fica de fora e cada unidade ganha sua linha no histórico.
- **Trava "até o Fiscal faturar":** a OP com NF emitida (`data_emissao_nf`) ou em status *Faturado…/Entregue…* fica **travada para todos, inclusive Admin**. A trava é conferida **de novo no banco na hora de gravar** (se o Fiscal faturar com a janela aberta, o clique é recusado e nada é gravado).
- **Quem edita:** `podeEditarEquipeDaOp` = Admin, qualquer perfil "Gerente …" (Gerente de Produção e Gerente administrativo) e quem tem a aba **Adaptação** — hoje, Admin e o Gerente de Produção; o Gerente administrativo é o que fatura.
- **Três entradas para a mesma janela:** **(a) Fiscal** — menu ⋯ › "Equipe (quem trabalhou)" e o selo **"Equipe não apontada"** na linha da OP que tem mão de obra sem ninguém apontado (aparece **antes** de faturar); **(b) detalhe da OP** — nova seção "Quem trabalhou na OP" (3 colunas + "Editar equipe", ou "Equipe travada: a OP já foi faturada"); **(c) Produção** — o menu "Equipe" agora abre esta janela (a antiga, só de responsável/apoio, foi removida para as duas não divergirem; a da **OS do SAC não foi tocada**).
- **Comissão no RH (`RHTab.tsx`):** quem foi apontado na **serralheria** recebe o **percentual do próprio cadastro em cima da mão de obra de SERRALHERIA da OP** (a de adaptação segue como sempre: pela base cadastrada — *Mão de Obra*, *Serralheria* ou *Faturamento*). Na lista do técnico a linha ganha o selo **SERRALHERIA** e mostra a MO de serralheria; a pessoa apontada nas duas listas da mesma OP tem duas linhas. O "total do grupo" do Pipeline soma também a serralheria. O filtro que **ignorava OP sem técnico principal foi tirado** (a lista da Equipe é quem manda); conferido no banco antes: nenhuma linha de equipe existia em OP sem técnico principal, então **nada muda no que existe hoje**.
- **Ordem fixa no RH** (pequena correção que a mudança exigiu): a consulta da equipe não tinha `ORDER BY`, e a ordem dos técnicos e das OPs na tela era a que o banco devolvesse no momento. Agora é por data de criação; e dois cartões do Pipeline com o mesmo número de OP/OS passam a desempatar por nome.

**Testado:**

- **`teste_24` (navegador, dado real, gravações bloqueadas)** **28/28, rodado duas vezes:** o Fiscal mostra o selo "Equipe não apontada" nas **7 OPs certas de 24**; o menu ⋯ tem "Equipe (quem trabalhou)"; adicionar responsável grava a linha certa (tipo `op`, papel, pessoa do RH, quem adicionou) e a linha do histórico; serralheria entra com papel `serralheria` e histórico no setor Serralheria; repetir a pessoa não grava e avisa; remover pede confirmação, **cancelar não grava**, confirmar apaga só aquela pessoa, naquele papel, naquela OP; se o Fiscal faturar com a janela aberta, o clique é recusado; **lote (simulado com 3 unidades, uma já faturada):** sem a caixinha só a unidade aberta recebe, com a caixinha entram as 2 livres e a faturada fica de fora; o detalhe da OP mostra a seção e abre a mesma janela; OP já faturada mostra "Equipe travada" sem botão; o menu "Equipe" da Produção abre a janela nova; quem edita (Admin, Gerente…, aba Adaptação: sim; Engenharia, Serralheria, CRM sozinho: não).
  **Cálculo no RH** (serralheria **simulada** numa OP real de lote, sem gravar): para a OP *A 1430.2607 … /01* (MO adaptação unitária R$ 365,27; MO serralheria unitária R$ 2.016,10; lote ÷ 4) a linha da serralheria usa a MO de serralheria, a de adaptação usa a MO de adaptação, JONATAN (1%) recebe R$ 3,65 e R$ 20,16, **MURIEL (0,5%, cadastrada em "Mão de Obra") recebe R$ 10,08 sobre a MO de serralheria**, quem não tem percentual (SERGIO) entra com **R$ 0,00** e os outros técnicos ficam **idênticos**. Banco real idêntico no fim.
- **RH — fotografia antes × depois** (20 telas: Faturada e A Faturar × junho a outubro × duas origens; o "antes" foi tirado com `git stash` no código que está no ar): **24 técnicos, 30 cartões do Pipeline e 448 linhas de OP/OS idênticos** (comparação sem depender de ordem). A primeira comparação por texto mostrou cartões e técnicos trocando de lugar; era a ordem do banco (sem `ORDER BY`), não conta — daí a ordem fixa acima.
- Regressão: `teste_20` (Fiscal) 29/29, `teste_8b` 6/6, `teste_12` 6/6, `teste_15` 12/12, `teste_54` 21/21, `teste_crm` 16/16 (rodei só o conjunto que toca as telas mexidas; a lista longa de 22 testes foi interrompida por ser lenta e fora do que mudou); build ok.

**O que ficou de fora / limites:**

- **Os serralheiros do RH não recebem comissão hoje:** JORGE FERREIRA, MARLON PAULO, SALOMÃO e WESLEI estão com "não recebe comissão" e sem percentual; só **MURIEL (0,5%)** tem. Quem for apontado na serralheria sem percentual aparece com o selo "sem percentual no RH" e comissão R$ 0,00. **O percentual é decisão do usuário/RH**, não meu.
- **A regra da serralheria é do usuário, o percentual é suposição minha:** usei o **percentual do cadastro da pessoa** (um só por pessoa) em cima da MO de serralheria; não criei percentual separado para serralheria. Se o serralheiro tiver um percentual para a serralheria e outro para a adaptação, precisa de um campo novo.
- **Apoio só existe na adaptação** (0,1% da MO de adaptação): não há regra de apoio para a serralheria.
- **A trava vale para todos, inclusive o Admin**, como ele pediu ("até o Fiscal faturar"). Comissão já aprovada em fechamento (`rh_comissoes_fechamento`) não é refeita por esta tela.
- O "total do grupo" do Pipeline do RH só soma a serralheria quando a OP também tem um responsável de adaptação (o grupo nasce dele); a comissão do técnico na lista por pessoa está sempre certa.
- **OS do SAC** (`tipo = os`) não foi tocada.
- Não mexi na linha de `responsaveis_producao` que não aponta para OP nem OS (1 linha órfã, já existia).
- **"Gerar os orçamentos":** entendi como o **cálculo de comissão do RH ao faturar**, que foi o que ele descreveu. Se "orçamento" for outra coisa (por exemplo, custo de mão de obra por OP para orçar vendas), é uma etapa nova.
- O caminho de gravação foi exercitado **por simulação**; nada foi gravado na produção.

### ✅ Etapa 7.9 — Status "Desligado" no RH

**Feito em:** 30/09/2026, por pedido do usuário no chat ("Adicionar status em RH de desligado, pois hoje não podemos mudar uma pessoa que foi demitida ou se demitiu para um status que faça jus"). Ele escolheu entre opções minhas: **sai das listas de trabalho e fica num bloco "Desligados"**; registrar **data + motivo**; e **deixar como estão os 6 cadastros que já estavam escondidos**.

**Ponto de partida conferido (30/09/2026):**

- A única saída do RH era a **lixeira** (🗑️ "Excluir"), que só esconde o cadastro (`ativo = false`): sem data, sem motivo, e a pessoa some de tudo. Os status de presença eram Ativo, Em Viagem, Folga, Férias e Afastado.
- `status_presenca` é **texto livre** (sem restrição no banco): "Desligado" não exige mudança de estrutura. Horas, autorizações e fechamentos de comissão apontam para o cadastro **em cascata** (`ON DELETE CASCADE`): excluir de verdade apagaria o histórico, por isso nada aqui exclui.
- 6 cadastros já estavam escondidos pela lixeira: ADRIAN GABRIEL BATISTUTA, ALDO FABIAN BATISTUTA, ARILSON EUGENIO VIEIRA FILHO, JAIRO BORGES, LUCIANO SPINELLI e LUIZ CLAUDIO. **Nenhum aparece em equipe de OP, comissão ou fechamento** (só o Luciano tem 3 lançamentos de horas).

**O que foi feito** (`RHTab.tsx`; migração `rh_funcionarios_desligamento`):

- **Migração (só acrescenta):** duas colunas em `rh_funcionarios` — `data_desligamento` (data) e `motivo_desligamento` (só "Demissão" ou "Pedido de demissão", com trava no banco). **Nenhuma linha existente foi alterada.**
- **Seletor de status** ganhou **"Desligado"**. Escolhê-lo **não grava na hora**: abre a janela **"Desligar colaborador"**, que pede a **data** (vem com hoje; não pode ser anterior à admissão) e o **motivo** (demissão pela empresa ou pedido de demissão). Confirmando, grava `status_presenca = Desligado`, `ativo = false`, a data e o motivo, e registra no histórico do RH quem fez.
- **Bloco "Desligados"** (logo abaixo do Status dos Colaboradores): nome, tipo, cargo, **data**, **motivo**, e os botões **Corrigir** (abre a janela preenchida) e **Reativar** (pede confirmação; volta para Ativo e limpa data e motivo).
- **Sai das listas de trabalho sozinho:** como a pessoa fica com `ativo = false`, deixa de aparecer no seletor de responsável (`ColaboradorSelect`), no Lançar Horas e na Autorização, e do Status dos Colaboradores.
- **Não some das contas antigas:** as telas que mostram histórico (**comissões, banco de horas/KPIs de horas, lista de autorizações**) recebem os desligados junto, para manterem o **nome e o percentual** de quem já saiu; sem isso a comissão antiga dele apareceria como "—" e 0%. A aba avulsa "Comissões de técnicos" também carrega os desligados.

**Testado:** `teste_25` (navegador, dado real, gravações bloqueadas) **20/20**: o seletor tem as 6 opções; escolher "Desligado" abre a janela e **não grava** (e o seletor volta ao que era); sem motivo e data anterior à admissão são recusados; cancelar não grava; confirmar grava **só aquela pessoa** com `{Desligado, ativo false, data, motivo}` e o histórico; o bloco "Desligados" lista a pessoa com data (15/09/2026) e motivo; ela **sai da lista de status**; Corrigir abre preenchido e grava; Reativar pede confirmação e volta para Ativo limpando data e motivo; com um técnico real (CELIO) **simulado como desligado**, a comissão dele continua com **nome, percentual, 2 OP, base R$ 352,00 e comissão R$ 0,88**, e os outros 5 técnicos ficam idênticos; banco real idêntico no fim (46 linhas do RH). **A trava do banco recusa um motivo fora da lista** (teste desfeito por exceção, nada gravado). **Comissões — fotografia antes × depois** (20 telas): **24 técnicos, 30 cartões, 448 linhas idênticos**. Build ok.

**O que ficou de fora / limites:**

- **Os 6 cadastros já escondidos não foram tocados** (decisão dele): seguem com `ativo = false` e o status antigo, **fora** do bloco "Desligados". Quando ele disser quais são desligados, é marcar pela tela nova (ou eu aplico, relatando a contagem).
- **O login do sistema não é alterado:** quem saiu e tinha acesso continua podendo entrar até ser desativado em Admin › Usuários (a janela avisa isso).
- **Banco de horas de quem saiu** não tem acerto final aqui: o saldo não aparece nas listas de trabalho. Os lançamentos continuam gravados.
- **RelatoriosRH (consolidado de horas)** e o relatório de uniformes seguem só com quem está ativo, de propósito: incluir os desligados mudaria os números desses relatórios.
- O caminho de gravação foi exercitado **por simulação**; nada foi gravado na produção.

### ✅ Etapa 7.10 — Datas da Logística apareciam um dia antes do real

**Feito em:** 30/09/2026. **Achado** ao medir a Logística para a Etapa 12b: a fotografia da tela mostrou o recebimento de 10/09 como "09/09".

**Causa:** a coluna `logistica_manifestos.data` é do tipo **date** ("2026-09-30"). A tela a formatava com `new Date(d).toLocaleDateString('pt-BR')`: o JavaScript lê "2026-09-30" como **meia-noite de Londres**, que no Brasil ainda é o dia anterior. Mesmo erro que o projeto já tinha corrigido no "hoje" (`hojeISO`/`diaISO`, 25/09/2026).

**Medido com dado real (antes):** **74 das 78 linhas** do Relatório IN/OUT e **148 das 156** do Histórico de Manifestos mostravam o dia anterior; o manifesto mais recente (**30/09**) aparecia como **29/09**, na tabela e na janela "Ver".

**O que foi feito** (`LogisticaTab.tsx`, **3 linhas**; nenhum dado mexido): os três formatadores de dia (Relatório IN/OUT, Histórico/janela "Ver"/janela de fotos, e o **PDF do comprovante**) passaram a tirar o dia direto do texto AAAA-MM-DD. As demais datas da tela (previsão de recebimento, frete) já usavam o jeito certo.

**Testado:** `teste_28` (navegador, dado real, só leitura) — **antes 2/6** (74 e 148 linhas erradas, mais recente 29/09), **depois 6/6**: Relatório 78/78 linhas com a data do banco, Histórico 156/156, a mais recente mostra **30/09/2026**, a janela "Ver" mostra a data do banco; nenhuma gravação. Build ok. **O PDF do comprovante não foi aberto** (carrega a biblioteca de uma rede externa); a correção nele é a mesma linha.

**Fora / pendente:** uma busca por `new Date(...).toLocaleDateString` sem sufixo de hora encontrou **52 lugares** em 25 arquivos (os maiores: `FormacaoPrecosTab` 7, `AcnTabShared` 5, `VistoriasPatio` 3, `SacTab` 3, `RelatoriosTab` 3, `HorasTarefasTab` 3, `CotacoesTab` 3). **A maioria deve ser horário (timestamp), que está certo**: só coluna do tipo *date* sofre. Não auditei nem mexi — ver "Perguntas em aberto".

### ✅ Etapa 7.11 — Os 5 fretes já em cotação não liberariam a OP ao serem entregues (resto da Etapa 1)

**Feito em:** 30/09/2026. **Achado** ao ler os dados reais dos Fretes para a Etapa 12b3: as **5 solicitações de frete que existem hoje** (todas em "Cotação", de 18 e 21/09) estão com `vinculo_tipo = 'opl'` — o valor **antigo**, de antes da Etapa 1 (29/09), quando o Almoxarifado ainda gravava `'opl'` em vez de `'op_os'`.

**Causa:** a Etapa 1 consertou o Almoxarifado **daqui para frente** e fez a entrega do frete (`postarAndamentoVinculo`, `LogisticaTab.tsx`) liberar a OP — mas só quando o vínculo é `'op_os'`. O levantamento da Etapa 1 conferiu que nenhum frete **entregue** tinha OP presa e concluiu "nenhuma OP travada"; **não olhou os fretes ainda em cotação**, que são os próximos a serem entregues. Resultado: as **5 OPs** (`1638.2609`, `1654.2609`, `0756.2609`, `1560.2608/02`, `1650.2609`, **todas em "Aguardando Cotacao Frete"**) ficariam presas, do mesmo jeito que o achado A2 descreve, quando o frete delas fosse entregue.

**O que foi feito** (`LogisticaTab.tsx`, **uma condição**; **nenhum dado foi alterado — 0 linhas**): `postarAndamentoVinculo` passa a reconhecer **os dois nomes** (`'op_os'` e `'opl'`). Quem consulta "o que está ligado à OP" (`OpVinculos.ts`) já lia só por `vinculo_id`, então não precisou mudar. Escolhi **não migrar as 5 linhas** (mexer em dado real exige pedido): se o usuário preferir deixar o dado também no nome novo, são 5 linhas e a leitura continua tolerando os dois.

**Testado** (`teste_30`, navegador, dado **real** na leitura — as 5 solicitações e as OPs delas — com o frete da OP 1638.2609 simulado como "Em Trânsito" e **toda gravação respondida dentro do navegador**): **antes 4/7** — marcar como entregue gravava só o frete; **não** gravava a nota no acompanhamento, **não** tirava a OP de "Aguardando Cotacao Frete" e **não** registrava o movimento; **depois 7/7**, com o frete **`'opl'` e com `'op_os'`**: nota com o **número** da OP (`1638.2609`), `status_geral` → `Aguardando Liberacao Comercial`, movimento no histórico. A entrega **de verdade** (canhoto indo para o armazenamento) não foi feita: a resposta do armazenamento é simulada.

**Fora:** a Etapa 1 continua válida para o que ela provou (o caminho novo, com `'op_os'`). Esta 7.11 só fecha o buraco dos 5 fretes antigos.

### ✅ Etapa 7.12 — O "Aproveitamento de frete" sugeria juntar envios para destinos que nada têm a ver

**Feito em:** 30/09/2026. **Achado** pela fotografia dos Fretes (12b3), com dado real: o cartão "Aproveitamento de frete" aparecia com **"NAI SEI / RO (CEP 000xx) — 4 envios, entregas entre 17/09 e 23/09, 1,92 kg"**, sugerindo **"Juntar numa carga"** quatro envios para **SC, RO e ES**.

**Causa:** `AproveitamentoFrete.ts` compara a **região** pelos 3 primeiros dígitos do CEP de destino. Quatro das cinco solicitações reais têm como CEP **"0000000", "000", "0000" e "000000000"** — zeros que a pessoa digitou na tela de embalagem do Almoxarifado por não saber o CEP. Todos viravam a região "000" e entravam no mesmo grupo (as quatro com data prevista na mesma semana).

**O que foi feito** (`AproveitamentoFrete.ts`, só a leitura; **nenhum dado foi alterado — 0 linhas**): CEP só de zeros (ou com menos de 3 dígitos) **deixa de contar como região** e a comparação cai para o **nome do destino**, que é o que o código já fazia para quem não tinha CEP. Vale para a região e para o rótulo do cartão. Quem **tem** CEP de verdade continua agrupando pelo CEP.

**Testado** (`teste_31`, só leitura; dado real mais um cenário simulado só na leitura): **antes 2/5, depois 5/5.** Dado real: o cartão **deixa de aparecer** (as 5 solicitações têm destinos diferentes). Simulado: Curitiba (CEP 800xx, 2 envios na mesma semana) **continua sendo sugerido**; 2 envios para Itajaí/SC com CEP de zeros e o mesmo destino **são sugeridos pelo nome do destino**, sem "CEP 000xx"; o envio de Lages/SC (CEP de zeros, outro destino) **não entra** no grupo.

**Fora / pendente:** (1) ~~a tela de embalagem do Almoxarifado continua aceitando CEP de zeros (e cidade "NAI SEI", "NAO TEM")~~ — **o usuário decidiu exigir o CEP válido e preenchê-lo (01/10/2026): feito na Etapa 7.13**; (2) os CEPs dos 4 fretes reais **não foram corrigidos** (ver a 7.13).

### ✅ Etapa 7.13 — CEP obrigatório e válido na embalagem, e cidade e UF preenchidas pelo CEP (pedido do usuário)

**Feito em:** 01/10/2026. **Pedido do usuário**, em resposta à pergunta que ficou aberta na 7.12: *"Exigir CEP válido e preencher os campos que o CEP consegue preencher."*

**O que foi feito** (`Cep.ts`, arquivo novo; `AlmoxarifadoTab.tsx`, só a janela "Embalar e enviar"; **nenhum dado foi alterado — 0 linhas**):

- **O CEP vem primeiro e é obrigatório** ("CEP *"), com a máscara 00000-000 enquanto se digita. Ao completar os 8 dígitos — **ou ao abrir a janela com um CEP que veio da OP** — o sistema consulta e **preenche a cidade e a UF**. A linha de resultado diz o que aconteceu ("CEP encontrado — cidade e UF preenchidas: Blumenau / SC (rua, bairro)"); se já havia outra cidade ou UF, diz **"antes: …"**. Rua e bairro só aparecem nessa linha: a OP e o frete não têm campo para guardá-los. Cidade e UF continuam **editáveis** depois.
- **"Finalizar" é barrado** quando: não há CEP; o CEP é inválido (não tem 8 dígitos, é só zeros ou está abaixo de 01000-000, que é o primeiro CEP real); ou as **duas fontes** respondem que o CEP não existe. Aviso de atenção, nada é gravado.
- **Fonte fora do ar não trava a fábrica:** se não der para consultar, o CEP de formato válido segue, com aviso ("Não consegui conferir o CEP agora; segui com o CEP informado. Confira a cidade e a UF.") e a cidade e a UF digitadas à mão.
- **Fontes:** o **ViaCEP** e, só se ele não achar ou estiver fora, o **BrasilAPI** (já havia consulta ao ViaCEP no RH; `Cep.ts` é a versão para o resto do sistema, o RH não foi mexido). Respostas definitivas ficam guardadas na sessão: uma consulta por CEP.
- **O que é gravado** passa a levar o CEP **normalizado** (`00000-000`) na OP (`destino_cep`) e na solicitação de frete (`cep_destino`).

**Suposições minhas, não confirmadas com o usuário:** (1) o CEP **manda**: cidade e UF são **sobrescritas** pelo que o CEP diz (até ao abrir uma OP que já tinha outra cidade — a linha mostra o "antes"); (2) CEP "inexistente" **só** quando o ViaCEP **e** o BrasilAPI dizem que não conhecem; (3) serviço de terceiro fora do ar **não** barra; (4) a regra vale **só** para a janela de embalagem.

**Testado** (navegador, gravações respondidas dentro do navegador; OP simulada em "Aguardando Embalagem", porque não há nenhuma real agora; respostas dos serviços de CEP simuladas):

- `teste_32`: **antes 3/19, depois 19/19.** Antes, o CEP "0000000" **passava** (a embalagem era registrada, 5 gravações). Depois: CEP de zeros barrado e a janela já avisa ao abrir; **máscara**; cidade e UF **do CEP** (Imbé / RS no lugar de "NAI SEI / RO"); a OP e o frete gravados com `95625-000` e "Imbé / RS"; sem CEP barrado; CEP que as duas fontes não conhecem barrado, **sem gravar nada**; ViaCEP não acha e o BrasilAPI acha (Blumenau / SC); **os dois fora do ar**: segue com o que foi digitado, avisando; OP com CEP bom e cidade errada (Joinville / SC) corrigida ao abrir, com o "antes"; uma consulta por CEP.
- `teste_33`: a mesma janela com os **serviços de verdade** (só leitura pública): 95625-000 → Imbé / RS, 89010-025 → Blumenau / SC, 01001-000 → São Paulo / SP; nenhuma gravação.
- **Capturas** da janela em claro e celular (390 px) com CEP inválido e válido; a coluna do CEP ganhou largura mínima (a 390 px cortava o texto).
- **Regressão:** `teste_30` 7/7, `teste_31` 5/5, `teste_28` 6/6, `teste_29` 4/4, `teste_61` 21/21, `teste_63` 23/23, `teste_17` 24/24, `teste_18` 29/29, `teste_21` 13/13, `teste_20` 29/29; build ok. `teste_5x` deu 10/11 (só o Financeiro, que depende de haver compra no mês corrente); numa passada saiu 9/11 por causa da checagem de tempo do banner da OP, que já variava, e sem a mudança o resultado é o mesmo 10/11.

**O que ficou de fora / limites:**

- **As outras entradas de CEP não foram tocadas:** criação da OP (`NovaOpOsModal`), edição da OP (CRM e Admin), entregas de licitação e o formulário manual "Novo Frete" (CEP de origem e de destino). Nelas o CEP continua livre.
- **Os 5 fretes reais continuam como estavam:** quatro com CEP de zeros e cidade inventada (OPs 1654.2609, 0756.2609, 1560.2608/02 e 1650.2609); a quinta (1638.2609, Imbé / RS, 95625-000) já está certa. Corrigir exige o **destino verdadeiro** de cada uma — dado que só o Comercial tem.
- **Um CEP "existente" não prova que a pessoa acertou o destino:** o BrasilAPI conhece até o 99999-999 (Sarandi / PR) e há CEP real de dígitos repetidos (44444-444), então **não** barrei número repetido.
- A janela de embalagem **continua no visual antigo** (estilo na própria tela); migrá-la para o design system é outra etapa. O fim da gravação (OP, frete, acompanhamento) foi exercitado só por simulação.

### ✅ Etapa 7.14 — Janela do colaborador (RH): dois pares de botões para "Recebe comissão?", um deles não fazia nada

**Feito em:** 01/10/2026. **Achado** ao ler o código da janela "Novo / Editar Colaborador" para a Etapa 12c2.

**Causa:** o bloco "Comissão" mostrava **dois pares de botões para a mesma pergunta**: "✅ Sim / ✗ Não", logo abaixo do rótulo "Recebe Comissão?", e "✅ Recebe Comissão / ✗ Sem Comissão", logo depois. Só o segundo liga a comissão (`recebe_comissao`). O primeiro gravava em `recebe_comissao_str`, um campo que **nenhum código lê**: clicar "Sim" **não fazia nada** — o campo do percentual não aparecia e a pessoa era salva **sem comissão**, sem aviso. (O autor chegou a deixar o comentário "Use separate boolean toggle" no meio.)

**O que foi feito** (`RHTab.tsx`, o par morto foi tirado, o rótulo "Recebe Comissão?" ficou em cima do par que funciona; **nenhum dado foi alterado — 0 linhas**).

**Testado** (`teste_34`, navegador, leitura simulada com gente inventada, gravação respondida dentro do navegador): **antes 4/5** — o bloco tinha **4 botões** (`sim, não, recebe comissão, sem comissão`); **depois 4/4** — só os 2 que funcionam, e ligar a comissão, preencher 5% e salvar grava `recebe_comissao = true`, o percentual **5** e a base **Faturamento**, sem campo estranho no corpo. Build ok.

**Fora / não sei:** **não dá para saber se alguém já foi salvo sem comissão por causa disso** — o banco só guarda o resultado (comissão desligada), não o clique. Quem acha que cadastrou comissão e vê R$ 0,00 na tela de comissões pode ter caído nesta armadilha; vale conferir, pelo cadastro, **quem deveria receber** (ver também a pergunta sobre os serralheiros em "Perguntas em aberto").

### ✅ Etapa 7.15 — Relatório de Técnicos (RH): a data das OPs aparecia um dia antes

**Feito em:** 01/10/2026. **Achado** ao ler o código dos Relatórios para a Etapa 12c3 e conferido com dado real — o mesmo erro da Etapa 7.10 (Logística).

**Causa:** a coluna `oples.data_entrada` é do tipo **date** ("2026-09-30"). O relatório formatava com `new Date(d).toLocaleDateString('pt-BR')`: o JavaScript lê "2026-09-30" como **meia-noite de Londres**, que no Brasil ainda é o dia anterior. As datas das **ordens de serviço** (`timestamp with time zone`) estavam certas; só as das OPs erravam.

**Medido com dado real (antes):** **0 das 200 OPs** do relatório mostravam a data certa — por exemplo, a OP 1673.2609/24, do dia **30/10/2026**, aparecia como **29/10/2026**. Vale também para o **HTML da impressão**, que usa a mesma função.

**O que foi feito** (`RHTab.tsx`, **uma linha**; nenhum dado mexido): o formatador do relatório passou a tirar o dia **direto do texto** quando ele só tem a data, e a seguir o fuso de quem usa quando tem hora (as OS têm).

**Testado:** `teste_35` (navegador, **dado real**, só leitura): abre cada um dos 4 técnicos e compara a data de cada OP na tela com o banco — **antes 0/200 certas, depois 200/200**. Build ok.

**Fora / pendente:** o **Histórico de comissões** (`HistoricoComissoes`) tem a mesma forma de formatador (`new Date(d)`) — será conferido com dado real na **12c4**, antes da comparação. Continuam valendo as **52 ocorrências** da pergunta sobre datas em outras telas.

### ✅ Etapa 7.16 — Quadros recolhíveis do RH: clicar no cabeçalho e usar a seta se desencontravam

**Feito em:** 01/10/2026. **Achado** ao preparar a Etapa 12c3 (que migra dois quadros recolhíveis): olhei como o recolher funciona no RH e testei na tela.

**Causa:** o sistema tem um **clique global no cabeçalho** (`DashboardTab.tsx`) que alterna a classe `sec-collapsed` do cartão — e essa classe **esconde o corpo por CSS**. Os quadros do RH têm **também um estado próprio** (`collapsed`) que decide se o corpo é desenhado, e uma seta que só mexe nesse estado. Os dois **começavam fora de sincronia** e nunca se acertavam:

- o **KPI nasce recolhido** (sem a classe): clicar no cabeçalho **abria pelo estado e a classe escondia o corpo ao mesmo tempo** — o quadro **nunca abria pelo cabeçalho** (só pelo botão "Ver gráfico e lançamentos" e pela seta);
- nos outros quadros, **recolher pelo cabeçalho e tentar abrir pela seta** deixava o corpo **escondido** (a classe continuava ligada), e **recolher pela seta e abrir pelo cabeçalho** idem.

Existia **antes** da migração visual (a 12c1 só trocou a seta duplicada).

**O que foi feito** (`RHTab.tsx`; **nenhum dado alterado**): nos **6 quadros** do RH que já eram cartões com estado próprio (KPI, Status dos Colaboradores, Desligados, Banco de Horas, Autorizações e Relatórios de Horas) a classe `sec-collapsed` passa a **seguir o estado do quadro**; assim o cabeçalho e a seta dão sempre o mesmo resultado. O clique global continua funcionando para os demais cartões do sistema.

**Testado** (`teste_36`, navegador, leitura simulada, nenhuma gravação): para cada quadro — nascer aberto ou recolhido, **clicar no cabeçalho, usar a seta, e clicar no cabeçalho de novo** (o corpo tem de estar visível ou não conforme o estado). **Antes 24/30** (o KPI não abria pelo cabeçalho; nos outros 5, a seta não reabria depois de recolher pelo cabeçalho), **depois 30/30**. Build ok.

**Fora / pendente:** os quadros **Técnicos e Uniformes** (que não eram cartões) levam a mesma regra desde a **12c3**; **Comissões** e o **Histórico** serão conferidos na **12c4**. Outras telas com recolher próprio (fora do RH) **não foram auditadas**.

### ✅ Etapa 7.17 — Comissões de Técnicos: o último dia do período ficava de fora

**Feito em:** 01/10/2026. **Achado** ao ler o código da tela para a Etapa 12c4 e **confirmado no banco real** antes de mexer.

**Causa:** as datas que decidem o período — `oples.data_emissao_nf` (NF emitida), `oples.data_conclusao_producao` e `sac_ordens_servico.data_conclusao_manutencao` (produção/manutenção concluída, na visão "A Faturar") — são **data-e-hora**. A tela pedia "de 01/09 até 30/09" com a **data pura**, e o banco lê isso como **meia-noite UTC**: "até 30/09" significa "até 00h do dia 30" (o **dia 30 inteiro ficava de fora**) e "de 01/09" significa "desde 21h de 31/08 em Brasília" (**entravam 3 horas do mês anterior**). Só a coluna `sac_ordens_servico.data_faturamento` é data pura e estava certa.

**Conferido no banco real, antes de corrigir** (OPs, com ou sem técnico apontado): setembro, NF emitida — a tela contava **1**, o mês de verdade tem **3**; "A Faturar" — julho **7** contra 11, agosto **82** contra 84, setembro **125** contra 126. **No que a tela de fato mostra** (OPs com responsável apontado): agosto **55 de 56** e setembro **103 de 104**.

**O que foi feito** (`RHTab.tsx`, só a consulta do período em `calcular`; **nenhuma conta de comissão, regra, texto ou gravação foi mexida**): o período passa a ser **[dia inicial às 00h, dia seguinte ao final às 00h) em horário de Brasília** (`-03:00`, sem horário de verão desde 2019), com `gte` + `lt`; `data_faturamento` (só data) continua `gte`/`lte`. Vale para o modo Mês/Ano e para o Período De/Até. O comentário no código registra o porquê.

**Efeito nos valores (dado real, só leitura, visão "A Faturar" — estimativa; as demais combinações dão zero técnicos no banco de hoje):** agosto, comissão **R$ 371,73 → R$ 384,80** (+13,07; base 36.266,48 → 37.453,98); setembro **R$ 46,74 → R$ 51,14** (+4,40; base 434.396,69 → 435.100,69). **Faturada:** nenhuma das 5 OPs com NF no banco tem responsável apontado, então a tela dá zero antes e depois. **Nenhum fechamento aprovado existe** (`rh_comissoes_fechamento` tem 0 linhas): nada já aprovado foi afetado.

**Como foi testado** (`teste_37`, navegador, dado real, nenhuma gravação): para cinco períodos (Faturada julho e setembro; A Faturar julho, agosto e setembro) o teste **calcula por fora, direto do banco, o conjunto de OPs do período em horário de Brasília** e exige que a tela mostre **exatamente** esse conjunto, e confere os **limites do pedido** de OPs e de OS. **Antes 7/17; depois 17/17.** Build ok.

**Regressão:** `teste_36` 30/30, `teste_34` 4/4. `teste_24` e `teste_25` **perdem uma verificação cada** (27/28 e 19/20) **de propósito**: ambas comparam os técnicos "não mexidos" com uma **fotografia de 30/09 do setembro "A Faturar" tirada com o período errado**; com a correção o setembro ganha OPs do último dia (JUNIOR +2 linhas, RONALD +2; **nenhuma linha retirada** — conferido linha a linha). **Sem a correção dão 28/28 e 20/20** (conferido guardando a mudança de lado). A fotografia de referência delas foi **refeita na 12c4** (com o código da 7.17), quando o seletor desses testes também teve de mudar; depois disso dão 28/28 e 20/20.

**Fora / pendente:**

- **Achado — Relatório de Comissão Comercial (aba Relatórios, `RelatoriosTab.tsx`) — resolvido na Etapa 7.19:** pede "`AAAA-MM-31`" como último dia; em mês com menos de 31 dias o banco **recusa o pedido** (erro 400: "`2026-09-31`" não existe) e o relatório aparece **vazio**. Conferido direto no banco: setembro e fevereiro dão erro; julho e agosto funcionam. Vale para abril, junho, setembro, novembro e fevereiro. Ver "Perguntas em aberto".
- **Não conferi** os demais relatórios que usam "`fim + T23:59:59`" (vários em `RelatoriosTab.tsx`): como a hora sem fuso é lida em UTC, provavelmente perdem as 3 últimas horas do último dia (erro menor que o das comissões). Entra na auditoria das datas já listada.
- Quem usa a tela já viu valores menores do que os certos — só importa se alguém **já pagou** com base neles; o banco não registra nenhum fechamento aprovado por esta tela.

### ✅ Etapa 7.18 — Chamados NFC (SAC): "Notas salvas!" aparecia mesmo quando a gravação falhava

**Feito em:** 01/10/2026. **Achado** ao montar o teste de comportamento da Etapa 12d1: simulei uma gravação recusada e a tela agiu como se tivesse dado certo.

**Causa:** a função que grava o chamado (`atualizarStatusNfc`, `SacTab.tsx`) **não olhava o resultado** da gravação em `chamados_suporte`. O botão **"Salvar Notas"** sempre mostrava "Notas salvas!" logo depois — **inclusive com a gravação recusada** — e **"Atender" / "Concluir"** não mostravam nada se falhasse (a lista era recarregada como se tudo tivesse dado certo). Quem digitou as notas achava que estavam guardadas.

**O que foi feito** (`SacTab.tsx`, só essa função e o botão **"Salvar Notas"**; **nenhum dado foi alterado**): a gravação passa a **conferir o erro**, avisar **"Erro ao gravar o chamado: …"** (com a mensagem do banco) e devolver se gravou; **"Notas salvas!" só aparece se gravou**; com erro a **janela de notas continua aberta com o texto digitado** (não se perde). Quando a gravação dá certo, **o corpo gravado é o mesmo de antes**.

**Como foi testado** (`teste_38`, navegador, leitura e gravação **simuladas**, nada chega ao banco): gravação aceita (aviso de sempre); gravação recusada ao **salvar notas** (tentou gravar, mostra o erro com a mensagem do banco, **não** diz "Notas salvas!", janela aberta com o texto), ao **Atender** e ao **Concluir** (mostra o erro, o chamado continua como estava); e a gravação **voltando a funcionar**. **Antes 5/9; depois 9/9.** Build ok; `teste_20` 24/24, `teste_36` 45/45 e `teste_37` 17/17.

**Fora / pendente:**

- **Achado, não corrigido — "Salvar Notas" troca o atendente.** A mesma função, quando o chamado está "Em Atendimento" ou "Concluído", grava **`atendido_por` = a pessoa que está salvando** — então quem apenas edita as notas de um chamado já atendido passa a constar como o atendente. **Com o banco de hoje não dá para saber se já aconteceu:** os 4 chamados foram todos atendidos por LUCIANO SPINELLI. Pode ser a regra desejada ("o último a mexer") ou um efeito colateral; não mexi. Ver "Perguntas em aberto".
- **O filtro de status só vale ao clicar em "Carregar"** (escolher o status não recarrega a lista), e o "N aberto(s)" do cabeçalho conta só o que está carregado — por exemplo, filtrando "Concluído" ele mostra "0 aberto(s)". Não mexi.

### ✅ Etapa 7.19 — Relatório de Comissão Comercial: mês de 30 dias vinha vazio e só contava a OP "Faturado" (R15)

**Feito em:** 01/10/2026. **Resposta R15 aplicada** (a de "corrigir agora") e, ao medir, **uma pergunta nova ao usuário** sobre quais OPs contam (resposta abaixo). Só leitura: **nenhum dado foi alterado.**

**Causa (três coisas no `RelComissoes`, aba Relatórios > Comissões, `RelatoriosTab.tsx`):**

1. **O fim do mês era pedido como "AAAA-MM-31".** Em mês de **30 dias e em fevereiro o banco recusava o pedido** (data que não existe, erro 400) e o relatório aparecia **vazio, sem aviso**. Em mês de 31 dias, `data_emissao_nf` é data-e-hora e "até o dia 31" vira meia-noite UTC: **o dia 31 depois das 21h de Brasília ficava de fora** (a mesma causa da Etapa 7.17).
2. **Só contava a OP na situação exatamente "Faturado".** A OP **sai do relatório ao avançar** para "Faturado e Disponível para Entrega": em **setembro, 3 OPs têm NF emitida e nenhuma aparecia** (duas do THIAGO MEDEIROS: R$ 46.636,32 e R$ 5.130,50; só as 2 de julho ainda estão em "Faturado"). **Pergunta clicável ao usuário → "Toda OP com NF emitida no mês", em qualquer situação** (o mesmo critério da Comissão de Técnicos).
3. **O erro do banco virava um relatório vazio** como se fosse verdade.

**O que foi feito** (`RelatoriosTab.tsx`, só a consulta do `RelComissoes`; **nenhuma conta de comissão, texto ou gravação foi mexida**): o período passa a ser **[dia 1 às 00h, dia 1 do mês seguinte às 00h) em horário de Brasília** (`-03:00`, `gte` + `lt`, como na 7.17); **sai o filtro de situação**; e, se o banco recusar, a tela **avisa** ("Não consegui ler as OPs faturadas de Out/2026: …") **em vez de mostrar números**. O campo de mês apagado deixa de gerar pedido.

**Como foi testado** (`teste_49`, navegador, **dado real, nenhuma gravação**): para seis meses (setembro, abril, novembro e **fevereiro**, de 30 e 28 dias; julho e agosto, de 31) o teste **calcula por fora, direto do banco, as OPs com NF emitida no mês em horário de Brasília** e exige que a tela mostre **a mesma quantidade** e que o **pedido seja aceito**; confere que **setembro mostra as duas OPs do THIAGO** (1560.2608/15 e A1664.2609); e **simula o banco recusando** o pedido (a tela avisa, sem números, e **volta ao normal** quando o banco volta). **Antes 9/22; depois 18/18.** Build ok. **Efeito nos números reais:** setembro passa de **0 para 3 OPs (base R$ 51.766,82)**; **a comissão continua R$ 0,00**, porque o THIAGO MEDEIROS **não tem percentual cadastrado** no RH.

**Fora / pendente:**

- **Valor de lote:** a base de setembro **inclui o lote 1560.2608 inteiro** (a OP /15 guarda os R$ 46.636,32 **do lote de 16 veículos**). A Comissão de Técnicos divide o valor pelo número de veículos; **o relatório comercial não divide** — **o usuário pediu para dividir como no RH — feito na Etapa 7.25**.
- **"% sobre Faturamento":** quem não tem percentual cadastrado (o THIAGO e a THALLITA) aparece com "**%** sobre Faturamento", sem o número. **Achado, não corrigido** (só aparência; conta R$ 0,00 de qualquer jeito).
- **Os demais relatórios que usam "fim + T23:59:59"** (vários em `RelatoriosTab.tsx`) seguem sem conferir: entram na auditoria das datas (R16).

### ✅ Etapa 7.20 — SAC, aba Cadastros: gravação recusada falhava em silêncio e perdia o que foi digitado

**Feito em:** 01/10/2026. **Achado** ao montar o teste de comportamento da Etapa 12d2 (a lição da 12d1: incluir "gravação recusada" em todo teste do SAC). O número 7.19 segue reservado para a R15 (Relatório de Comissão Comercial).

**Causa:** das sete gravações da aba **Cadastros** (equipamentos, categorias, tipos de serviço), **só duas conferiam o erro** (adicionar equipamento e adicionar categoria). As outras **ignoravam o resultado**: com a gravação recusada,

- **adicionar tipo de serviço** **apagava o nome digitado** e não avisava nada;
- **"Salvar" a edição de uma categoria** **fechava a edição e perdia o que foi digitado**, sem aviso;
- **desativar / ativar** equipamento, categoria e tipo de serviço **não fazia nada e não dizia nada** (a pessoa via a lista igual e não sabia por quê).

**O que foi feito** (`SacTab.tsx`, só essas cinco funções; **nenhum dado foi alterado**): cada uma passa a **conferir o erro**, **avisar "Erro: …"** (o mesmo aviso das duas que já faziam isso) e **manter o que a pessoa digitou** (o campo do tipo continua com o nome; a edição da categoria continua aberta). Com a gravação aceita **o corpo gravado é o mesmo de antes**.

**Como foi testado** (`teste_42`, navegador, leitura e gravação **simuladas**, nada chega ao banco): gravação aceita (o tipo entra na lista e o campo esvazia); gravação recusada ao **adicionar tipo** (avisa e **mantém o nome**), **desativar tipo**, **salvar a edição da categoria** (avisa e **a edição continua aberta com o texto**), **desativar categoria** e **desativar equipamento**; e a gravação voltando a funcionar. **Antes 2/9; depois 9/9.** Build ok.

**Fora / pendente:**

- **Achado, não corrigido — equipamentos desativados somem da tela e não dá para reativar:** a lista da aba **só mostra os ativos** (`fetchEquipamentos` filtra `ativo = true`), então o botão **"Ativar"** e a marca "Inativo" **nunca aparecem**: desativar é, na prática, **definitivo pela tela**. **O banco tem 12 equipamentos inativos que ninguém vê** (e 4 ativos). **Respondida pelo usuário e aplicada em 01/10/2026** — ver "Decisões tomadas".

### ✅ Etapa 7.21 — SAC: datas "só dia" saíam um dia antes (a parte do `SacTab.tsx` da R16)

**Feito em:** 01/10/2026. **Resposta do usuário aplicada (R16 — "corrigir direto os que erram"), no arquivo `SacTab.tsx`**, antes da migração da lista (12d3).

**Causa:** `prazo_orcamento` e `data_prevista_pos_aprovacao` são do tipo **date** ("2026-09-30"). `new Date("2026-09-30")` é meia-noite de Londres, que no Brasil ainda é o dia anterior: a coluna **"Prazo Orç." da lista** e a **"Entrega prevista" do PDF** mostravam **um dia antes** do real. **Conferido no banco real:** das **19 OS**, **9 têm prazo e as 9 apareciam um dia antes** (0 de 9 batiam com o banco). Junto vinha um defeito vizinho: a coluna pintava o prazo de **vermelho** (atrasado) com `new Date(prazo) < new Date()`, ou seja, **o prazo de HOJE ficava vermelho desde a noite anterior** (21h em Brasília).

**O que foi feito** (`SacTab.tsx`; **nenhum dado alterado**): um formatador que **lê o dia direto do texto** quando o valor é só data (e continua pelo fuso de quem usa quando tem hora), usado na lista e no PDF; o atraso passa a comparar **o dia do prazo com o dia de hoje em Brasília** (`hojeISO`): o prazo é o fim do dia e só atrasa **depois** dele. A tabela de OS tem **20 colunas de data, 6 só-data** (`prazo_orcamento`, `data_prevista_entrega`, `data_prevista_pos_aprovacao`, `data_retirada_reprovacao`, `data_provisionamento`, `data_faturamento`): **só 2 passavam pelo formatador errado**; o resto do arquivo **já usava a data com "T12:00"** ou colunas com hora (conferido por busca de `new Date(` em todo o `SacTab.tsx`). As colunas com hora (`data_abertura`, `data_aprovacao`, `data_saida`…) já estavam certas e não foram tocadas.

**Como foi testado** (`teste_45`, navegador, leitura simulada, nada gravado): OS inventadas com a data pura 2026-09-30 e a de entrega 2026-10-15, e uma com prazo de ontem e outra com prazo de **hoje**: a lista mostra **30/09** (e não 29/09), o prazo de ontem **continua vermelho**, o de hoje **não** fica vermelho e mostra a data de hoje; o PDF mostra **"Entrega prevista: 15/10/2026"** (e não 14/10) e a data da aprovação (com hora) **continua certa**. **Antes 6/10; depois 10/10.** **Com o banco real:** os **9 prazos da lista batem com o banco (antes 0 de 9)**. Build ok; `teste_36` 45/45, `teste_38` a `43` sem diferença; fotografia da aba Cadastros sem diferença.

**Fora / pendente:** o 3º lugar da R16 em `SacTab` (a "Entrega prevista" do componente `PrintOS`) **era código morto e foi apagado** à parte. Os outros **48 lugares** da R16 (25 arquivos) seguem para as próximas rodadas, **um arquivo por vez** — `RelatoriosTab` (3) é o próximo candidato.

### ✅ Etapa 7.22 — SAC, lista de OS: ações que gravam direto seguiam como se tivesse dado certo (e mandavam WhatsApp)

**Feito em:** 01/10/2026. **Achado** ao montar o teste de comportamento da Etapa 12d3 (a lição da 12d1: incluir "gravação recusada" em todo teste do SAC) — **o mesmo defeito das Etapas 7.18 e 7.20**, agora nas ações da lista de OS.

**Causa:** cinco ações da lista **gravam direto e ignoravam o resultado da gravação**: **Enviar Cotação**, **Recusar** a cotação, **Aprovar** o orçamento presencial e os dois **Reavaliar** (veicular e laboratório). Com a gravação recusada elas **seguiam como se tivesse dado certo**, sem aviso nenhum — e o **Enviar Cotação ainda mandava o aviso de WhatsApp** "Cotação enviada…" de uma cotação que **não foi enviada** (com o aviso ligado em `notificacoes_config`).

**O que foi feito** (`SacTab.tsx`, só essas cinco ações; **nenhum dado foi alterado**): cada uma passa a **conferir o erro**, **avisar "Erro …: <mensagem do banco>"** e **parar ali** — **nem o aviso de WhatsApp sai nem a lista é atualizada como se tivesse gravado**. Com a gravação aceita, **o corpo gravado e o aviso são os mesmos de antes**.

**Como foi testado** (`teste_46`, navegador, leitura e gravação **simuladas** com os avisos de WhatsApp **ligados** na simulação; nada chega ao banco): para cada uma das cinco ações — gravação aceita (grava a OS, sem erro; no Enviar Cotação **o WhatsApp sai uma vez**) e gravação recusada (**avisa o erro e não manda WhatsApp**). **Antes 10/16; depois 16/16.** Build ok; `teste_36`, `teste_38` a `45` sem diferença.

**Fora / pendente:** as **demais gravações do SAC** que **também ignoram o erro** ficam para a fatia de cada janela, cada uma com o seu teste de "gravação recusada" (**12d4 a 12d7**): a confirmação da aprovação da cotação, o aceite e a rejeição do SAC, a edição do orçamento, o envio ao Fiscal, a **entrega do veículo** (que também **grava o histórico e manda o aviso** mesmo se a gravação falhar), o orçamento, a aprovação, a reprovação, a saída, o anexar, o financeiro e o responsável.

### ✅ Etapa 7.23 — SAC, janela "Nova OS": defeito obrigatório, o defeito na demanda do Laboratório e falhas que passavam em silêncio

**Feito em:** 01/10/2026. **Achados** ao montar o teste de comportamento da Etapa 12d4 (a janela "Nova OS"), tirados **antes** do "antes" da migração, como nas Etapas 7.18, 7.20 e 7.22. **Quatro pontos, dois deles por resposta do usuário** (perguntas clicáveis):

1. **"Defeito Reclamado *" agora é obrigatório de verdade** (**resposta do usuário**). O asterisco sempre esteve na tela, mas a OS abria sem ele: **3 das 19 OS reais estão sem defeito**. Agora, **sem o defeito de qualquer equipamento da OS**, a tela avisa "Informe o defeito reclamado!" (com mais de um equipamento, "…do equipamento 2!") e **não grava nada** — nem pega o número da OS —, e a janela continua aberta com o que foi digitado.
2. **A demanda do Laboratório traz o defeito digitado** (**resposta do usuário**, só para as OS **novas**). Ela terminava sempre em "| Ver OS" porque lia um campo que a tela nunca preenche (o defeito digitado fica na lista de equipamentos): **10 das 12 demandas do Laboratório de hoje (9 de diagnóstico e 1 de execução) estão assim**. Agora diz, por exemplo, "[SAC-DIAG] OS-0039/2026 — Rádio | <defeito digitado>" (o do primeiro equipamento, como a coluna da OS). **Nenhuma demanda existente foi alterada.**
3. **Foto ou documento que não sobe agora impede a abertura da OS.** Antes o arquivo era **descartado em silêncio** e a OS abria sem ele (a prova de como o equipamento chegou se perdia). Agora a tela **avisa qual arquivo falhou**, **não abre a OS** e **deixa o formulário e os arquivos escolhidos como estão**, para tentar de novo ou tirar o arquivo da lista. *(Suposição minha, não confirmada — ver "Decisões tomadas".)*
4. **Demanda do Laboratório ou da Engenharia recusada, depois da OS criada, avisa.** Antes a OS ficava sem a demanda e **ninguém sabia** (o Laboratório só enxerga a OS pela demanda). Agora o aviso diz: "A OS … foi aberta, mas a demanda para o Laboratório/a Engenharia não foi criada (motivo). Avise o PCP ou a TI…". A janela fecha, porque a OS já existe e não pode ser aberta de novo; **nada é apagado**. Hoje as **11 OS de laboratório reais têm todas a sua demanda**: nenhuma ficou sem.

**O que foi feito** (`SacTab.tsx`, só a função que cria a OS; **nenhum dado foi alterado**).

**Como foi testado** (`teste_47`, navegador, leitura e gravação **simuladas** — o número da OS, a OS, a demanda e o envio de arquivo respondem de mentira; nada chega ao banco; arquivos de teste de verdade anexados pela janela): sem defeito; dois equipamentos com defeito só no primeiro; OS de laboratório e de **garantia** com a demanda trazendo o defeito; OS **veicular com acompanhamento da Engenharia**; demanda recusada (Laboratório e Engenharia); foto aceita, foto recusada (e tentar de novo depois), documento recusado; gravação da própria OS recusada. **Antes 8/22; depois 22/22.** Regressão: `teste_46` 16/16, `teste_45` 10/10, `teste_44` 24/24, `teste_43` 11/11, `teste_42` 9/9; build ok.

**Fora / pendente:** **"Salvar o cliente no cadastro"** depois de abrir a OS (`salvarClienteAuto`) é feito **sem esperar e sem avisar** se falhar — é de propósito (a OS já abriu) e fica como está. As demais gravações das janelas do SAC que ignoram o erro seguem para as fatias **12d5 a 12d7**.

### ✅ Etapa 7.24 — SAC, "Nova OS": o documento de uma abertura cancelada ia junto da OS seguinte

**Feito em:** 01/10/2026. **Achado** ao montar o teste de comportamento da 12d4, logo depois da 7.23. **Causa:** ao abrir a janela "Nova OS" só as **fotos** escolhidas eram zeradas; **o documento escolhido numa abertura que foi cancelada ficava na memória**. Na abertura seguinte o campo aparecia vazio, mas o contador mostrava **"1 arquivo(s)"** e **o documento era enviado junto da OS nova** — um documento do cliente anterior anexado à OS do próximo.

**O que foi feito** (`SacTab.tsx`, uma linha: o botão "Nova OS" da lista passa a zerar também os documentos; **nenhum dado foi alterado**). **Como foi testado** (`teste_48`, navegador, escrita simulada): anexar foto e documento, **cancelar**, abrir de novo — o contador some e **a OS nova não envia nada ao armazenamento e grava a lista de documentos vazia**; e o documento escolhido **na própria abertura** continua indo com a OS. **Antes 4/7; depois 7/7.** `teste_47` (7.23) 22/22; build ok.

**Fora:** não foi possível saber se alguma OS **real** já recebeu um documento "emprestado" dessa forma: o banco não guarda de onde o anexo veio. Se alguém notar um anexo estranho numa OS, é por isso.

### ✅ Etapa 7.25 — Comissão Comercial: OP de lote contava o valor do lote inteiro por veículo

**Feito em:** 01/10/2026. **Pedido do usuário** (pergunta clicável, ao fazer a Etapa 7.19): "dividir o lote como no RH". Só leitura: **nenhum dado foi alterado.**

**Causa:** em OP de lote (vários veículos), **cada veículo guarda o valor do lote inteiro**. A Comissão de Técnicos do RH já dividia esse valor pelo número de veículos (regra de 30/09/2026); o relatório de **Comissão Comercial** (aba Relatórios) **somava o valor cheio**. Exemplo real: o lote **1560.2608** tem **16 veículos de R$ 46.636,32** e **só o /15 foi faturado** (17/09): a base comercial de setembro era R$ 51.766,82, e o certo é **R$ 8.045,27** (R$ 2.914,77 do veículo do lote + R$ 5.130,50 da A1664.2609). Hoje a comissão dá **R$ 0,00** de qualquer jeito (o THIAGO MEDEIROS não tem percentual cadastrado), mas **passaria a pagar o lote inteiro por veículo assim que o RH cadastrar o percentual**.

**O que foi feito:** a regra **não foi copiada**: saiu de dentro da tela do RH e foi para **um lugar só, `OpLotes.ts`** (`baseOplDe`, `divisorPorBaseDeLote`, `lerDivisorPorBaseDeLote` — **a mesma conta de antes**: só divide quando **todos** os veículos do lote têm exatamente o mesmo valor). A **Comissão de Técnicos (`RHTab.tsx`) passa a usá-la sem mudar nenhum número**, e o **relatório de Comissão Comercial (`RelatoriosTab.tsx`) também**: a base, a comissão de cada OP e o total usam o valor de **um veículo**, e a linha da OP ganha a marca **"lote/16"** (com a dica "Lote de 16 veículos — valor unitário (total do lote ÷ 16)", como no RH). O `baseOplDe` próprio do `RelatoriosTab.tsx` (que fazia a mesma conta) foi trocado pelo compartilhado.

**Como foi testado** (`teste_50`, navegador, **dado real, nenhuma gravação**): o teste **calcula por fora, direto do banco e com a mesma regra, a base esperada de setembro** e confere a tela — a base é a de um veículo (R$ 8.045,27), a linha da 1560.2608/15 mostra **R$ 2.914,77** e a marca "lote/16", e a OP sem lote (A1664.2609) segue com o valor inteiro. **Antes 3/5; depois 5/5.** `teste_49` (7.19) 18/18. **Como a regra do RH mudou de lugar, a Comissão de Técnicos foi conferida inteira:** `teste_24` 28/28, `teste_25` 20/20, `teste_34` 4/4, `teste_36` 45/45, `teste_37` 17/17, `teste_20` 24/24, `teste_30` 7/7, `teste_31` 5/5, `teste_32` 19/19 — **os mesmos números de antes**; build ok.

**Fora:** **Almoxarifado e CRM têm a sua própria cópia de `baseOplDe`** (para outra finalidade — achar os "irmãos" de uma OP) e **não foram mexidos**; ficam para a Etapa 3/13 se for o caso.

### ✅ Etapa 7.26 — Histórico das Comissões de Técnicos: "nenhum fechamento" aparecia antes de buscar (R20)

**Feito em:** 01/10/2026. **Resposta R20 aplicada** ("só depois de buscar; antes, a tela pede o período"). Só a tela: **nenhum dado foi alterado.**

**Causa:** na parte **Histórico** de **RH > Comissões de Técnicos**, a mensagem **"Nenhum fechamento encontrado para o período."** aparecia **assim que o quadro abria**, antes de a pessoa escolher o período e clicar em **Buscar** — a tela dizia que não havia nada **sem ter procurado**.

**O que foi feito** (`RHTab.tsx`, só o `HistoricoComissoes`; **a busca, as colunas e a tabela são as de antes**): **antes de buscar**, a tela mostra **"Escolha o mês e o ano e clique em Buscar."**; **depois de buscar sem resultado**, aí sim, "Nenhum fechamento encontrado para o período."; e **trocar o mês ou o ano volta a pedir a busca** — a mensagem de uma busca vazia era do período **anterior** e ficaria enganando. A tabela de uma busca **com** resultado continua na tela quando se troca o mês, como sempre foi. *(O texto "Escolha o mês e o ano…" é meu; a resposta pedia só que a tela "pedisse o período".)*

**Como foi testado** (`teste_51`, navegador, **dado real** — o banco não tem nenhum fechamento — e um fechamento **simulado** para a tabela; nenhuma gravação): sem buscar não há "Nenhum fechamento" e a tela pede o período; depois de buscar vazio a mensagem aparece; trocar o mês volta a pedir; com fechamento aparece a tabela e nenhuma das duas mensagens; trocar o mês com a tabela na tela mantém a tabela. **Antes 6/9; depois 9/9.** Regressão: `teste_36` 45/45, `teste_34` 4/4; `teste_24` **falhou 3 verificações numa rodada** (as de "adicionar responsável", que gravam numa lista simulada) **e deu 28/28 na repetição**, sem relação com esta mudança (a rodada coincidiu com a recompilação da tela); build ok. **A fotografia de referência da 12c4 (`snap_rh4`) do "Histórico vazio" passa a divergir de propósito nesse ponto.**

### ✅ Etapa 7.27 — SAC, janelas de Orçamento, Aprovação, Reprovação, Entrega e Anexar: gravação e envio recusados seguiam como se tivesse dado certo

**Feito em:** 01/10/2026. **Achado** ao montar o teste de comportamento da Etapa 12d5 (a lição de 7.18/7.20/7.22/7.23), **corrigido antes** do "antes" da migração. **O mesmo defeito**, agora nas cinco janelas que registram o que o cliente respondeu e a saída do equipamento.

**Causa e o que mudou** (`SacTab.tsx`, só as funções dessas janelas; **nenhum dado foi alterado**):

- **Enviar Orçamento:** a gravação recusada **fechava a janela, perdia o valor digitado e ainda mandava o WhatsApp** de um orçamento que não foi enviado. Agora **avisa o erro e para**; a janela continua com o valor.
- **Aprovação do orçamento:** **a assinatura que não subia era trocada por vazio** e a OS ficava "Aprovada" **sem a assinatura, que é obrigatória**; a gravação recusada ainda **criava a demanda de execução para o Laboratório e mandava o WhatsApp** de uma aprovação que não foi gravada. Agora: **assinatura que não sobe → avisa e a aprovação não é registrada**; **gravação recusada → avisa e nada mais acontece** (nem demanda nem WhatsApp); e se **só a demanda do Laboratório** for recusada, a OS **fica aprovada** e o aviso diz que a demanda não foi criada (como na 7.23). O que foi digitado e a assinatura desenhada continuam na janela.
- **Reprovação:** igual ao Enviar Orçamento (perdia o motivo, mandava o WhatsApp). Agora avisa e para.
- **Entrega (OS do laboratório):** **assinatura ou foto de saída que não subia era descartada em silêncio** — a OS ficava "Entregue" **sem a prova da retirada** — e a gravação recusada mandava o WhatsApp de "OS entregue". Agora **avisa qual arquivo falhou e a entrega não é registrada**; assinatura, fotos e nome continuam na janela para tentar de novo.
- **Anexar:** arquivo que não subia era **descartado em silêncio** (a lista de anexos era gravada sem ele) e, com a gravação recusada, a janela **limpava a seleção como se tivesse enviado**. Agora, se um arquivo não sobe ou a gravação é recusada, **avisa e nada é anexado**; a seleção fica para tentar de novo. *(Suposição minha: tudo ou nada, como na Nova OS da 7.23.)*

**Como foi testado** (`teste_52`, navegador, leitura e gravação **simuladas** — com os avisos de WhatsApp **ligados** para ver se algum sairia; assinatura **desenhada no quadro de verdade** e arquivos **anexados pela janela**; nada chega ao banco): para cada janela, a gravação **aceita** (o que grava, a demanda, o WhatsApp, a janela fechando) e **cada falha** (assinatura que não sobe; foto que não sobe com a assinatura já enviada; arquivo que não sobe; gravação da OS recusada; demanda recusada). **Antes 8/22; depois 22/22.** Regressão: `teste_46` 16/16, `teste_47` 22/22, `teste_48` 7/7, `teste_45` 10/10, `teste_44` 24/24, `teste_43` 11/11, `teste_42` 9/9, `teste_40` 10/10, `teste_39` 8/8, `teste_38` 9/9; build ok.

**Fora / pendente:** as janelas do **fluxo de manutenção veicular** (aprovação de cotação, entrega do veículo, aceite, rejeição, itens, edição do orçamento, envio ao Fiscal) e as de **novo equipamento, responsável e financeiro** seguem com o mesmo defeito em partes e entram nas fatias **12d6 e 12d7**, cada uma com seu teste de "gravação recusada".

### ✅ Etapa 7.28 — SAC, janelas do fluxo de manutenção veicular: gravação recusada seguia como se tivesse dado certo

**Feito em:** 02/10/2026. **Achado** ao montar o teste de comportamento da Etapa 12d6 (a lição de 7.18/7.20/7.22/7.23/7.27), **corrigido antes** do "antes" da migração. **O mesmo defeito**, agora nas seis janelas do fluxo de manutenção veicular.

**Causa e o que mudou** (`SacTab.tsx`, só as funções dessas janelas; **nenhum dado foi alterado**): com a gravação recusada elas **fechavam a janela, perdiam o que foi digitado** e ainda **mandavam o WhatsApp ou registravam o histórico** de algo que não aconteceu. Agora cada uma **avisa o erro e para**; a janela continua aberta com o que a pessoa digitou:

- **Itens da Cotação** ("Salvar Itens"): perdia os itens e as horas cobradas — "Erro ao salvar os itens da cotação".
- **Aprovação de Cotação** (remota): mandava o WhatsApp de uma aprovação não gravada — "Erro ao registrar a aprovação".
- **Aceite SAC** — "Cliente Confirmou" (mandava o WhatsApp da data confirmada) e "Não Confirmou" (fechava sem devolver a OS para a Produção).
- **Editar Orçamento** (Produção): perdia as correções — "Erro ao salvar o orçamento".
- **Enviar para Fiscal**: mandava o WhatsApp de "enviado para o Fiscal" — "Erro ao enviar para o Fiscal".
- **Entrega de Veículo**: **registrava o histórico e mandava o WhatsApp de "veículo entregue"** com a gravação recusada — "Erro ao registrar a entrega do veículo".

**Como foi testado** (`teste_54`, navegador, leitura e gravação **simuladas**, com os avisos de WhatsApp **ligados**; nada chega ao banco): para cada janela, a gravação **aceita** (o que grava, o WhatsApp, o histórico, a janela fechando) e a **recusada** (o aviso, nada de WhatsApp nem histórico, a janela aberta com o texto). **Antes 8/17; depois 17/17.** Regressão: `teste_52` 22/22, `teste_46` 16/16, `teste_47` 22/22, `teste_48` 7/7, `teste_45` 10/10, `teste_42` 9/9; build ok.

**Pergunta ao usuário (02/10/2026):** o aviso da janela "Enviar para Fiscal" diz para informar o nº de série de cada item, mas o sistema deixa enviar em branco. **Resposta: deixar como está** (alguns itens, como cabo e parafuso, não têm número de série). Nada foi mudado.

### ✅ Etapa 7.29 — SAC, janela "Valores Financeiros": passa a gravar no histórico de alterações, e um 0 já gravado não volta como "vazio"

**Feito em:** 02/10/2026. **Pedido do usuário** (pergunta clicável ao fim da Etapa 12d7: "o financeiro da OS deve passar a gravar no histórico de alterações, como o responsável já grava?" — **resposta: sim**). O defeito do "0" foi **achado ao montar o teste** desta etapa.

**O que mudou** (`SacTab.tsx`, só a função que salva o financeiro; **nenhum dado existente foi alterado**):

- **Histórico:** depois que o banco aceita a gravação, o **valor total**, a **mão de obra** e a **data de faturamento** entram no histórico de alterações (`audit_log`) — **uma linha por campo que realmente mudou**, com quem mudou e em qual OS, e valores legíveis ("R$ 1.234,50", "01/10/2026", "—" para vazio). **Salvar sem mexer em nada não grava linha** (e uma data que o banco devolve com hora não vira "mudança" à toa). Como no responsável, a gravação do histórico **não espera nem avisa** se falhar: o valor já foi gravado, então o histórico recusado não atrapalha a janela. **Com a gravação da OS recusada, nada vai para o histórico.**
- **O zero:** o código tratava o número **0 como "campo em branco"** (o 0 é "falso" no JavaScript): uma OS com valor 0 **já gravado** voltava como **vazio** ao abrir a janela e salvar **sem mexer em nada**. Agora **só o campo em branco vira vazio**. **Mudança de comportamento:** o 0 que já estava gravado **fica 0**. Digitar "0" sempre gravou 0 (igual).
- **Efeito esperado, pelo desenho do `AuditSystem` (não conferido no navegador):** o histórico alimenta a marca de "alterada desde a última vez que você viu"; mudar o financeiro passa a marcar a OS como alterada para os **outros** usuários, como já acontece com o responsável.

**Como foi testado** (`teste_57`, navegador, leitura e gravação **simuladas**; nada chega ao banco): **16/16.** Os três valores mudando → **3 linhas** legíveis ("— → R$ 1.234,50", "— → R$ 200,00", "— → 01/10/2026"), com módulo, tipo, **id da OS** e quem fez; só o valor total → **1 linha**; **salvar sem mudar nada → 0 linhas** (na OS vazia e na que já tem data); trocar a data (28/09 → 05/10) e **limpar a data**; **OS recusada** (avisa, a janela fica aberta e o histórico **não** recebe linha); **histórico recusado** (a OS grava, a janela fecha, sem aviso); o **responsável continua com 1 linha**; e o **0**: abre com 0, salva **0** sem acusar mudança, apagar de propósito vira vazio e entra no histórico ("R$ 0,00 → —"), digitar 0 nos dois valores. **0 erros de console.** **Antes da correção do 0, o teste mostrou o defeito** (o corpo gravado trazia `valor_total: null` e o histórico acusava "R$ 0,00 → —" sem ninguém mexer). **Regressão:** o comportamento da 12d7 refeito — **5 dos 23 cenários mudaram, todos do financeiro, e em cada um a única diferença é a linha nova do histórico** (o corpo gravado na OS é idêntico); fotografia 18/18 iguais; `teste_46` 16/16, `teste_47` 22/22, `teste_52` 22/22, `teste_54` 17/17; build ok.

**O que ficou de fora / limites:**

- **Não consultei o banco de produção** para contar quantas OS reais têm valor 0 gravado (a mudança não altera dado nenhum; só deixa de trocar o 0 por vazio quando alguém salvar a janela).
- **Nenhuma tela do SAC lista o histórico** (só existe a marca de "alterada"): as linhas ficam gravadas para quando houver. As gravações do financeiro e do responsável **não atualizam o `atualizado_em`** da OS — como antes, fica como está.

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

### 🔧 Correção da Etapa 8 — ninguém conseguia aprovar compra (PC-DEBMAA parado)

**Achado em:** 30/09/2026, por relato do usuário ("foi selecionado a cotação vencedora, mas o Weber nem ninguém consegue aprovar depois dos últimos ajustes").

**Causa — duas, que se somavam:**

1. **A sessão do navegador nunca recebia a marca `pode_aprovar_compra`.** O login (`LoginTab.tsx`), o "ver como" (`AdminTab.tsx`) e a atualização da sessão (`DashboardTab.tsx`) copiam uma **lista fixa** de campos do usuário, e essa marca não estava nela. Desde a regra de 24/09 ("aprovar é de quatro pessoas"), `podeAprovarCompra(currentUser)` dava **falso para todo mundo**, inclusive para os quatro marcados no Admin (Luciano Spinelli, Bruna, Rafael Nunes e Raphael Weber Mello). Nada aparecia errado até alguém precisar aprovar; **o painel "Esperando a sua aprovação" da Etapa 8 também nunca apareceu em produção**.
2. **Não havia botão para aprovar uma alçada já pendente.** O botão "Aprovar esta cotação como vencedora" some quando há alçada pendente, e o painel de aprovação manda "aprovar clicando em ✅ Aprovar na cotação vencedora" — mas esse botão não existia (`aprovarNivelAtivo` não estava ligada a nada).

**O que aconteceu no PC-DEBMAA** (ATLASMAQ, R$ 55.421,18): às 15h38 o Weber escolheu a vencedora; o sistema, sem reconhecê-lo como aprovador, **criou a alçada de nível 1 e a deixou pendente**; em seguida o botão sumiu. Ficou sem saída para os quatro.

**Por que a Etapa 8 não pegou:** o `teste_17` (meu) **injetava `pode_aprovar_compra: true` direto na sessão do navegador**, coisa que o login real nunca faz. Ele provou a tela, não o caminho real. O `teste_26` novo usa a sessão **como o login a monta** (sem a marca) e os ids reais do Weber e do Luiz.

**Correção** (`LoginTab.tsx`, `AdminTab.tsx`, `DashboardTab.tsx`, `ComprasTab.tsx`; nenhum dado mexido):

- A marca entra no **login**, no **"ver como"** e na **leitura que atualiza a sessão** — quem já estava logado ganha a marca **ao reabrir o sistema**, sem novo login.
- A lista "Esperando a sua aprovação" **recarrega quando a marca chega** (antes o intervalo de 30 s ficava preso ao usuário sem a marca e o painel nunca carregava).
- A cotação **vencedora** ganha o botão **"✅ Aprovar"** quando há alçada pendente (só para quem aprova; pede a senha; **só resolve a pendência**: confere no banco que a alçada já está pendente para a mesma vencedora e **não cria outra linha de aprovação nem devolve o pedido à etapa**).

**Testado:** `teste_26` (navegador, dado real, gravações bloqueadas, senha **simulada**) **15/15**: a sessão do Weber recebe a marca; o painel aparece com os 2 pedidos; a Mesa do PC-DEBMAA mostra "Aprovação — Nível 1" com "Não aprovar" e o "✅ Aprovar" na ATLASMAQ; aprovar grava a aprovação do nível 1 em nome dele e passa o pedido para **Aprovado** com histórico, **sem** criar linha nova; o pedido sem vencedora (PC-N40GWU) segue com "Aprovar esta cotação como vencedora" nas duas cotações; **quem não aprova** (Luiz, do Compras) continua sem painel e sem botão e vê "Aguardando aprovação de: BRUNA, LUCIANO SPINELLI, RAFAEL NUNES, RAPHAEL WEBER MELLO". **O mesmo teste no código que estava no ar falha** (marca `undefined`, sem painel, sem botão). `teste_17` (painel da Etapa 8) 24/24. Build ok.

**Confirmado em produção (30/09/2026, 17h14):** o PC-DEBMAA foi **aprovado por RAFAEL NUNES** logo depois da publicação — histórico "Aprovações concluídas", **uma única** linha de aprovação, sem duplicar. Não aprovei em nome de ninguém. **O `teste_26` não se repete mais com dado real**, porque parte desse pedido pendente; o PC-N40GWU (sem vencedora) segue esperando.

**Fora / limites:**

- Quem escolhe a vencedora **sem ser aprovador** (o botão por cotação aparece para todos quando não há pendência) cria a alçada pendente e espera os aprovadores — agora esses conseguem aprovar. Não mudei quem vê o botão.
- **Mesmo vício em outra marca:** `ver_valores` (valores ocultos por pessoa no Admin) também **não chega à sessão**; hoje **os valores aparecem para todos**, inclusive para as 6 pessoas marcadas para não ver. Não mexi (ver "Perguntas em aberto").

### ✅ Etapa 9 — Reorganizar a tela do PCP

**Feito em:** 30/09/2026.

**Ponto de partida conferido em 30/09/2026** (dado real, tela aberta com as gravações bloqueadas): a Triagem **já tinha subido para o topo em 28/09**, então o problema não era mais "a Triagem em sexto lugar",
e sim o que vinha depois: cinco blocos de alerta (só aparecem quando há dado) com o mesmo peso, num total de **~6.270 px** de rolagem. Os dois mais altos — **Serralheria, 29 OPs, ~1.400 px**, e **Pendências de
fabricação/compra, 34 OPs, ~3.900 px** — tinham **zero linhas esperando o PCP**: eram só OPs aguardando a Serralheria e os setores. Já o que pedia ação (2 itens de "material em falta" e os botões de lote da Triagem) ficava
espremido entre eles.

**O que foi feito** (`PCPTab.tsx`; `OpPendencias.tsx` ganhou uma função; nenhuma tabela, coluna nem dado foi mexido; nenhum botão mudou de comportamento):

- **Faixa "O que pede o PCP agora"** no topo: um botão por bloco que tem dado, com o **total** e quantos **pedem ação do PCP** (destaque) ou "aguardando…" (cinza). Clicar **abre o bloco e leva até ele**. Bloco vazio não ganha botão;
  sem nenhum bloco de alerta, a faixa some.
- **Pede ação = o que tem botão do PCP na linha**: Triagem (kiting, produção, embalagem), material em falta (sanar), reposição (liberar), Serralheria (só as "Concluída", para sanar), Pendências (só as OPs em que o setor
  concluiu, o Almoxarifado recebeu e falta o "✔ Liberar" do PCP — nova `liberaveisPeloPcp`, a mesma condição do botão), Envio direto (as prontas para embalar).
- **Bloco que só acompanha abre recolhido**, com o cabeçalho e uma pílula ("só aguardando a Serralheria terminar"); **o que pede ação abre sozinho**. Quando um bloco passa a pedir ação (atualização de 30 s), ele **abre sozinho**;
  o que a pessoa abriu ou recolheu à mão **não é desfeito** pela atualização enquanto nada mudar.
- **Dentro do bloco, o que pede ação vem primeiro** (Serralheria: as "Concluída" primeiro; Pendências: as OPs que o PCP pode liberar primeiro).
- **Ordem dos blocos:** Triagem → material em falta → **reposição de estoque (subiu, era o último)** → Serralheria → Pendências → Envio direto.
- **Um controle só para recolher/abrir:** o painel da Serralheria tinha um estado próprio (mais uma setinha) **além** do recolhimento global do `DashboardTab`; saiu, para os dois não brigarem com o estado inicial.

**Testado** (navegador, gravações bloqueadas): `teste_18` **29/29** — com o dado real: a faixa tem 4 botões (Triagem 33 e 30 pedem ação, falta 2, Serralheria 29, Pendências 34), os totais batem com o banco, Serralheria e Pendências abrem
recolhidas (43 px cada) e o **conteúdo caiu de ~6.270 px para 990 px**; clicar no botão abre o bloco e o traz para a tela; o cabeçalho continua recolhendo e abrindo. Com **dados simulados só na leitura**: os seis blocos na ordem certa e todos
abertos quando todos pedem ação; a OP "para sanar" sobe na Serralheria e a que o PCP libera sobe nas Pendências; **"SANAR PENDÊNCIA" segue gravando o mesmo** (só se viu o corpo, nada chegou ao banco); só acompanhamento → 3 blocos
recolhidos e a faixa com 4 botões; **abertura automática** na atualização de 30 s sem desfazer o que a pessoa abriu; nada em alerta → sem faixa. **Nenhuma gravação** em nenhum cenário. Modo escuro e celular (390 px, sem rolagem
lateral) conferidos por captura de tela. Regressão: `teste_5x` 11/11, `teste_54` 21/21, `teste_63` 23/23, `teste_17` 24/24, `teste_7` 16/16, `teste_8` 31/31.

**O que ficou de fora:**

- **Envio direto continua repetindo linhas da Triagem** (as mesmas OPs aparecem nos dois blocos, como antes): tirar o bloco ou a duplicação muda o que o PCP vê e não estava na etapa.
- **Sem cor de urgência por tempo parado** (mesma linha da Etapa 6): a etapa separa "pede ação" de "aguarda outro setor", não ordena por atraso.
- **O bloco de Pendências, quando abre, ainda tem uma OP por linha** (~115 px cada): só as que pedem ação vêm primeiro. Uma lista mais densa (tabela) seria outra etapa.
- **"Demandas Avulsas", "OPs movimentadas" e o rodapé** (abaixo dos blocos) ficaram como estavam.
- **Só testei o dado real de hoje, em que nenhuma Serralheria/Pendência pede ação**: o caminho "pede ação" com dado real não existia para conferir; foi coberto com dado simulado.

### ✅ Etapa 10 — Ações em lote maiores no kiting

**Feito em:** 30/09/2026.

**Ponto de partida conferido em 30/09/2026 (o plano estava errado na premissa):** o plano dizia "pra um lote de 90 carros, isso é dezenas de cliques de checkbox". A marcação, porém, é **por peça sugerida, uma vez por lote**
(a lista sai da BOM da primeira OP do lote e a quantidade é "por OP × nº de OPs"), **não por carro**. Medido no banco: só **20 das 371 OPs têm BOM**; **10** têm sugestão de fabricação; o **máximo é 5 sugestões** por OP
(distribuição: 1→2 OPs, 2→1, 4→5, 5→2); **nenhuma repete peça** na lista; o catálogo tem 72 chicotes e 3 itens de serralheria "internos" ativos. O único lote esperando kiting hoje (0763.2609, 3 OPs) **não tem nenhuma sugestão**.
Ou seja: hoje são de 1 a 5 cliques. O botão em lote ganha peso quando as BOMs crescerem (a montagem automática das Renegade, por exemplo), e custa pouco; por isso foi feito, mas o ganho de hoje é pequeno.

**O que foi feito** (`PCPTab.tsx`, só a janela "Liberar kiting"; nenhuma tabela nem dado mexido):

- **Barra de ações na lista de sugestões:** contador **"n de N marcados"**, **"☑ Marcar todos (N)"**, **"☑ Todos de <setor> (n)"** (aparece só quando a lista tem os dois setores, Chicotes e Serralheria) e **"☐ Desmarcar todos"**.
  Cada botão some quando não tem o que fazer (tudo já marcado, nada marcado).
- **Nada vem marcado sozinho** (regra de 21/09/2026 mantida): a janela abre com "0 de N marcados"; marcar é sempre um clique da pessoa, agora podendo ser um clique para vários.
- **Um caminho só:** o clique numa sugestão e os botões passam pela mesma função (`aplicarSugestoes`). Ela **não desfaz** o que a pessoa fez à mão: a quantidade que ela ajustou numa peça já marcada e os itens que digitou continuam
  quando se marca ou desmarca outros; "Desmarcar todos" tira só o que veio das sugestões.
- **Defeito achado no caminho (existia no clique único):** se a **mesma peça aparece em duas linhas da BOM**, marcar a segunda **trocava** a primeira, e a demanda saía com a quantidade de uma linha só (2 + 3 pedia 3, e não 5).
  Agora **soma**, e desmarcar uma das linhas tira só a parte dela. **Nenhuma OP real tem peça repetida hoje** (medido), então nenhuma demanda já aberta foi afetada.

**Testado** (navegador, gravações bloqueadas; lote de **39 OPs simulado só na leitura**, com 6 sugestões — 4 chicotes, um deles em duas linhas, e 2 de serralheria — e um material comum que não é fabricado aqui): `teste_19` **19/19** — a janela abre
com "0 de 6 marcados" e as caixas vazias; "Marcar todos" marca 6 e **soma a peça repetida (2+3=5)**; "Desmarcar todos" zera; "Todos de Chicotes" marca 4 e o botão do setor some; a quantidade ajustada à mão (B=7) e o item digitado à mão
**sobrevivem** aos botões; desmarcar uma linha do chicote repetido cai de 5 para 3, a outra o remove, e remarcar em ordem inversa volta a 5; ao liberar, **tenta mudar as 39 OPs para "Aguardando Almox"** e abre **uma demanda por setor com
a quantidade × 39** (Chicotes A=195, B=39, C=117 e o digitado 4×39=156; Serralheria D=39, E=78), sem o material comum, e a demanda fica ligada às 39 OPs. Nada chegou ao banco (43 gravações tentadas, todas abortadas).
Regressão da tela do PCP: `teste_18` 29/29, `teste_5x` 11/11, `teste_54` 21/21, `teste_63` 23/23.

**O que ficou de fora:**

- **Só testei com lote simulado:** não há hoje OP real esperando kiting com sugestão para conferir.
- **A lista do lote vem da BOM da primeira OP** (como antes): se as unidades do lote tiverem BOMs diferentes, a janela não avisa. Não mudei.
- **A liberação individual do kiting** ("LIBERAR KITING" de uma OP só) usa a mesma janela e a mesma função, mas **não foi exercitada** à parte.
- **O editor de fabricação da Engenharia** (na liberação da BOM) **não usa** essa lista de sugestões e **não foi tocado**.
- **"Marcar só o que falta no estoque"** continua sendo o passo futuro já anotado no código (depende do controle de saldo e de estoque mínimo); esta etapa é só o atalho manual.

### ✅ Etapa 11 — Migrar Fiscal para o design system (piloto)

**Feito em:** 30/09/2026.

**Ponto de partida conferido em 30/09/2026:** a `FiscalTab.tsx` (497 linhas) tinha **61 `style` inline, 12 botões `acn-btn` com cor própria e 66 cores hex** escritas à mão. Na tela ela já parecia razoável porque o `design.css` e o `TonsVisuais`
repintam em tempo de execução (é exatamente o "remendo" da Etapa 13); o que faltava era a tela **usar as peças** em vez de depender do remendo. Com o dado real (25 OPs aguardando NF-e, 1 faturada, 0 OS) a tabela **passava da largura do quadro
e escondia o botão "Ver"** à direita.

**O que foi feito** (`FiscalTab.tsx`, parte visual; `design.css` ganhou 1 classe; **nenhuma regra, gravação ou dado foi mexido** — a lógica do topo do arquivo ficou byte a byte igual):

- **Botões:** os 12 `acn-btn` viraram `Botao`. Em cada OP, **"Faturado" é o botão principal** (próximo passo) e **"Ver detalhes" e "Devolver ao Comercial" foram para o menu ⋯** (como no PCP): a devolução é a saída de exceção. Faturados: "Confirmar entrega"
  principal e "Ver detalhes" no menu. Janelas: Cancelar (secundário) + Confirmar (principal / perigo na devolução).
- **Resumo:** os dois cartões de "Notas pendentes / emitidas" passaram para `acn-kpis` / `acn-kpi` (os mesmos do Dashboard).
- **Etiquetas e cabeçalhos:** os cabeçalhos dos quadros perderam a cor de fundo pintada (ficam neutros, com a contagem num `Selo`); **NF-e** virou `Selo` verde; "Lote" virou `Tag`; "sem modelo / sem chassi" e "sem serial" viraram `Selo` de atenção.
- **Tabela e barra:** `acn-tabela` e os filetes de linha do sistema (`acn-linha-nova` = alteração não vista, `acn-linha-marca` = OP de lote). A barra de **faturamento em lote** virou a **`acn-barra-selecao`** (fixa embaixo, como na Produção), com o mesmo campo de NF-e.
- **Classe nova `acn-nota-mono`** (`design.css`): o bloco de texto em fonte mono dos seriais e da lista "NF em lote", que antes levava cor e borda pintadas em cada um; já tem versão para o modo escuro.
- **Texto na tela:** acentos que faltavam ("emissão", "número", "ação") e emojis decorativos tirados (o sistema usa ícones). O aviso "⚠️ Não informado pelo Almoxarifado no kiting", repetido em cada linha, virou o selo **"Sem serial"** (o texto completo está na dica).
- **Largura:** cabeçalhos "Seriais" e "NF-e" (o texto completo na dica) e o botão da linha sem ícone. A tabela passou de **1.248 px** (não cabia nem em 1500 px) para **1.109 px**: cabe a partir de ~1.400 px de tela; abaixo disso rola dentro do quadro.

**Resultado no código:** `style` inline **61 → 16** (só largura e espaçamento, nenhum de cor), `acn-btn` **12 → 0**, cores hex **66 → 0**.

**Como foi testado (o teste vale para a tela velha E para a nova):** `teste_20` é escrito com os mesmos passos e as mesmas expectativas para as duas versões; rodei **antes de migrar (24/24)** e **depois (29/29: as mesmas 24 + 5 estruturais)**.
Cobre, com leitura e gravação **simuladas** (nada chegou ao banco): as 4 OPs, as 2 faturadas e as 2 OS aparecem; só as 2 unidades do lote vêm pré-marcadas; **faturar o lote** grava as 2 OPs com a mesma NF, o mesmo status, quem faturou, a observação com
chassi/placa/serial e a **trava contra faturar duas vezes** (`status_geral = Aguarda Emissao NF` na gravação); faturar uma OP sem NF avisa e não grava; **devolver** exige o motivo e grava "Devolvida Comercial"; **ver** abre o detalhe; **confirmar entrega**
exige o nome e grava "Faturado"; **faturar OS** grava a NF e o novo status; histórico e auditoria registrados; nada gravado fora das tabelas esperadas. Com o dado real: 25 + 1 linhas, iguais às de antes, sem rolagem lateral a 1500 px, sem nenhuma gravação só de abrir.
Modo escuro e celular (390 px, sem rolagem lateral da página) conferidos por captura. Regressão: `teste_18` 29/29, `teste_5x` 11/11, `teste_63` 23/23, `teste_status` 13/13, `teste_reenvio` 20/20; build ok.

**O que ficou de fora:**

- **`LinkOpl`, `VeiculoOuEnvio`, `BuscaOplInput`, `OplMovimentadas` e `DemandaFooter`** são componentes compartilhados de `AcnTabShared.tsx` e **ainda têm estilo inline próprio** (por exemplo o número da OP em azul e o "sem chassi" em vermelho): migrá-los mexe em todas as telas, então fica para a Etapa 12 ou 13.
- **Os campos de texto** continuam `<input className="acn-input">` (o `Interface.tsx` não tem componente de campo); os 16 `style` que sobram são larguras e espaços.
- **As janelas "Devolver" e "Confirmar entrega" continuam com o próprio `modal-overlay`** (só os botões mudaram); trocá-las pelo `pedirTexto` do `Feedback.tsx` mudaria o desenho da janela e não foi feito.
- **Menu ⋯ em vez de botões visíveis** para "Ver" e "Devolver": é uma escolha de desenho minha (igual ao PCP), sem confirmação do usuário — se a devolução precisar ficar à vista, é voltar um botão `perigo-sec`.
- **A tela SAC etc.** não foi tocada (Etapa 12).

**O que o piloto ensinou para a Etapa 12** (receita que funcionou): (1) escrever o teste de comportamento **antes**, com seletores que valham para a tela velha e a nova, e rodar nas duas; (2) trocar só a parte visual do arquivo, sem tocar na lógica;
(3) botão principal = próximo passo da linha, o resto no `MenuAcoes`; (4) cores e bordas viram `Selo` / `Tag` / classe do `design.css`, nunca hex; (5) **medir a largura da tabela com o dado real** — o design system engorda o espaço das células e uma tabela que "cabia" pode passar a rolar.

### ✅ Etapa 12 — Migrar SAC, RH, Logística, Relatórios
Depois do piloto validado, o resto na mesma linha. **Uma tela por vez**, cada uma sobe e funciona sozinha, começando pelas de menor risco (ordem combinada
com o usuário no fim da Etapa 11; medido em 30/09/2026):

| Fatia | Tela | Linhas | `style` inline | `acn-btn` | cores hex | Gravações no código | Estado |
|---|---|---|---|---|---|---|---|
| 12a | **Relatórios** | 1.582 | 273 | 18 | 241 | **0** (só leitura + planilha) | ✅ 30/09/2026 |
| 12b1 | **Logística — abas, Aguardando Recebimento, Relatório IN/OUT e janela "Receber Pedido"** | (do arquivo de 2.174) | 243 → 199 (arquivo todo) | 29 → 25 | 208 → 155 | 5 (todas na janela de recebimento) | ✅ 30/09/2026 |
| 12b2 | **Logística — Histórico / Novo Registro (formulário de manifesto, janelas "Ver" e "Fotos")** | (do arquivo de 2.169) | 199 → 136 (arquivo todo) | 25 → 15 | 155 → 124 | 4 (formulário e fotos) | ✅ 30/09/2026 |
| 12b3 | **Logística — Fretes (aproveitamento, solicitação, cotações, aprovação, trânsito e entrega)** | (do arquivo de 2.148) | 136 → 1 (arquivo todo) | 15 → 0 | 124 → 0 | 22 | ✅ 01/10/2026 |
| 12c1 | **RH — topo, KPI, Status dos Colaboradores, Desligados e Banco de Horas** | (do arquivo de 2.618) | 390 → 317 (arquivo todo) | 3 → 3 | 448 → 373 | 5 (status, desligar, corrigir/reativar, excluir, fechar mês) | ✅ 01/10/2026 |
| 12c2 | **RH — janelas de cadastro (Colaborador, Lançamento, Autorização) e a lista de Autorizações** | (do arquivo de 2.580) | 317 → 212 (arquivo todo) | 3 → 3 | 373 → 241 | 5 (colaborador: criar e editar; lançamento; autorização) | ✅ 01/10/2026 |
| 12c3 | **RH — Relatórios (Horas, Técnicos, Uniformes); só leitura** | (do trecho de 570 linhas) | 212 → 98 (arquivo todo); trecho 114 → 0 | 9 → 0 (trecho) | 241 → 154 (arquivo todo); trecho 99 → 12 (todos no HTML da impressão) | 0 (35 fotografias + 20 comportamentos, nenhuma gravação) | ✅ 01/10/2026 |
| 12c4 | **RH — Comissões de Técnicos e o Histórico de comissões** | (do trecho de 566 linhas) | 98 → 2 (arquivo todo); trecho 96 → 0 | 10 → 0 | 154 → 69 (arquivo todo; todos fora de tela); trecho 85 → 0 | 1 (aprovar; 45 fotografias + 10 comportamentos, gravação só simulada) | ✅ 01/10/2026 |
| 12d1 | **SAC — seletor de abas e Chamados NFC** | (do trecho de 183 linhas) | 570 → 527 (arquivo todo); trecho 43 → 0 | 79 → 79 (nenhum no trecho) | 570 → 511 (arquivo todo); trecho 59 → 0 | 1 (a do chamado; 26 fotografias + 13 comportamentos) | ✅ 01/10/2026 |
| 12d2 | **SAC — aba Cadastros (equipamentos, categorias, tipos de serviço)** | (do trecho de 147 linhas) | 527 → 493 (arquivo todo); trecho 34 → 0 | 79 → 69 (arquivo todo); trecho 10 → 0 | 511 → 486 (arquivo todo); trecho 25 → 0 | 7 (as das 3 listas; 21 fotografias + 24 comportamentos, gravação só simulada) | ✅ 01/10/2026 |
| 12d3 | **SAC — aba Ordens de Serviço: cabeçalho, legenda, filtros, tabela e botões de ação** | (do trecho de 306 linhas) | 380 → 311 (arquivo todo); trecho 68 → 0 | 67 → 40 (arquivo todo); trecho 27 → 0 | 364 → 293 (arquivo todo); trecho 68 → 0 | 5 (as ações da lista que gravam direto, já com o erro tratado na 7.22; 73 fotografias + 70 comportamentos, gravação só simulada) | ✅ 01/10/2026 |
| 12d4 | **SAC — janela "Nova OS"** | (do trecho de 407 linhas) | 311 → 197 (arquivo todo); trecho 114 → 0 | 40 → 37 (arquivo todo); trecho 3 → 0 | 293 → 232 (arquivo todo); trecho 61 → 0 | 1 (criar a OS, com as demandas e os arquivos; 38 fotografias + 26 comportamentos, gravação só simulada) | ✅ 01/10/2026 |
| 12d5 | **SAC — janelas de orçamento, aprovação, reprovação, entrega (laboratório) e anexar, e o quadro de assinatura** | (do trecho de 180 linhas) | 197 → 143 (arquivo todo); trecho 54 → 0 | 37 → 22 (arquivo todo); trecho 15 → 0 | 232 → 199 (arquivo todo); trecho 33 → 0 | 5 (enviar orçamento, aprovar, reprovar, entregar, anexar; 24 fotografias + 29 comportamentos, gravação só simulada) | ✅ 01/10/2026 |
| 12d6 | **SAC — janelas do fluxo de manutenção veicular (entrega, aprovação de cotação, itens, Fiscal, orçamento da produção e aceite)** | (do trecho de 318 linhas) | 143 → 20 (arquivo todo); trecho 123 → 0 | 22 → 6 (arquivo todo); trecho 16 → 0 | 199 → 117 (arquivo todo); trecho 82 → 0 | 7 ações (itens, aprovação de cotação, orçamento da produção, aceite e rejeição, Fiscal, entrega; 30 fotografias + 28 comportamentos, gravação só simulada) | ✅ 02/10/2026 |
| 12d7 | **SAC — janelas de novo equipamento, responsável e financeiro** (o "modal PDF" era código morto e foi apagado) | (do trecho de 66 linhas) | 20 → 1 (arquivo todo); trecho 19 → 0 | 6 → 0 (arquivo todo); trecho 6 → 0 | 117 → 110 (arquivo todo); trecho 7 → 0 | 3 (equipamento, responsável e financeiro; 18 fotografias + 22 comportamentos, gravação só simulada) | ✅ 02/10/2026 |
| ~~12d8~~ | ~~SAC — "Acompanhamento da OS"~~ — **cancelada**: as 301 linhas dessa fatia eram o componente `PrintOS`, **código que nenhuma tela abria**; apagado em 01/10/2026 (a janela de acompanhamento de verdade é o `OplAcompModal.tsx`, outro arquivo) | — | — | — | — | — | ✅ não precisa |

**Etapa 12 concluída em 02/10/2026:** Relatórios (12a), Logística (12b), RH (12c) e SAC (12d1 a 12d7) estão no design system; a 12d8 foi cancelada. **O que sobra de estilo escrito à mão está em componentes compartilhados** (`LinkOpl`, `VeiculoOuEnvio`, `BuscaOplInput`, `OplMovimentadas`, `DemandaFooter`, `ColaboradorSelect`, `ClienteAutocomplete`, `MencaoTextarea`, `OplAcompModal`) **e nos HTMLs de impressão/PDF** — é o assunto da **Etapa 13**.


#### ✅ 12a — Relatórios

**Feito em:** 30/09/2026. **Escolhida primeiro** por não gravar nada: dá para provar "a mesma informação" comparando fotografias das duas versões, sem risco ao dado.

**O que foi feito** (`RelatoriosTab.tsx`, parte visual; `design.css` ganhou classes; **nenhuma consulta, conta ou regra foi mexida**, e `OpDossie.tsx` — a 14ª aba, "Dossiê da OP" — não foi tocado):

- **Três peças locais** no lugar do que se repetia nos 13 relatórios: `Indicadores` (cartões `acn-kpi`, com o "clicável / esmaecido" do Por Setor), `FiltroPeriodo` ("De / Até / Filtrar" e "Imprimir") e `BotaoImprimir` (só o ícone, para o cabeçalho).
- **Barra de 14 abas → `Chips`**, que **quebra de linha**: todas visíveis, sem rolar para o lado (o `Abas` esconderia o excesso).
- **Status por família do design system**: a tabela de cores hex só para status (`STATUS_CORES`) saiu; `Selo` dá **uma cor por família**, igual às outras telas (ex.: "Aguardando CQ" âmbar, "Em produção" azul, "Faturado" verde, "Em espera PCP" cinza). O rótulo passou a sair formatado ("Em produção", "Aguardando início").
- **Tabelas** em `acn-tabela`; linha atrasada/parada em `acn-linha-alerta`, lote em `acn-linha-marca`; texto de atraso em `acn-txt-erro`.
- **Centro de Custo:** cada quadro nasce **recolhido** e abre/fecha pelo recolhimento global do sistema (a classe `sec-collapsed`, como no PCP); o estado local `expandido` saiu.
- **Comissões:** o aviso de "vendedores sem comissão cadastrada" virou `Faixa`; cada vendedor é um quadro (`sec-card`) com o percentual num `Selo`.
- **Markup e Em Serviço:** filtros em `Chips` e `Botao`; a exportação da planilha continua igual, agora num `Botao`. As cores das faixas do termômetro de markup continuam vindo de `MarkupTermometro.tsx` (são dado, não enfeite).
- **Classes novas no `design.css`:** `acn-rolagem`, `acn-texto-longo`, `acn-dir`, `acn-centro`, `acn-txt-erro`, `acn-selos`, `acn-filtros-campos` e as variações `acn-kpi.clicavel` / `.apagado`.
- **Emojis decorativos tirados** dos títulos, botões e avisos (o sistema usa ícones).

**Resultado no código:** `style` inline **273 → 6**, `acn-btn` **18 → 0**, cores hex **241 → 0**, `<button>` cru **23 → 0**, **1.582 → 1.452** linhas.

**Como foi testado (só leitura; a tela não grava nada):**

- **Fotografia comparada** (`snap_relatorios.cjs`, igual para a tela velha e a nova): percorre as **14 abas e cada sub-estado** (filtros de cada aba, agrupar, sub-abas, os 4 setores do Por Área, os 3 funis do Markup, 3 meses de Comissões, todos os
  centros abertos) e guarda **tabelas (cabeçalho e cada linha), indicadores, títulos e mensagens de vazio**, normalizados (sem acento, sem emoji). **125/125 comparações iguais** com o dado real. Como o dado real deixa vazios alguns estados (Comissões sem OP
  faturada no mês, Envios, Laboratório), uma segunda fotografia com **dados simulados só na leitura** (Comissões com 2 vendedores e um sem cadastro, recebimentos atrasado/recebido/em andamento, envios, demandas do Laboratório) deu **16/16 iguais**,
  incluindo os avisos e os totais soltos.
- **Comportamento** (`teste_21`, **13/13**): 14 abas visíveis e uma só marcada; trocar de aba; os dois botões de imprimir (ícone e texto); **"Filtrar" manda o período digitado para a consulta**; clicar no indicador "Engenharia" filtra igual ao botão; indicador
  sem OP fica esmaecido; **"Baixar Planilha" gera `Relatorio_OPs_OSs_em_Servico_<data>.xlsx`**; Centro de Custo nasce recolhido, abre (com a linha de TOTAL) e recolhe; o "Todos" do mês do Markup limpa o mês e some; **nenhuma gravação**; sem erro de console.
- Modo escuro e celular (390 px, sem rolagem lateral da página) conferidos por captura. Regressão: `teste_20` (Fiscal, que compartilha o `design.css`) 29/29, `teste_18` 29/29, `teste_17` 24/24, `teste_5x` 11/11, `teste_63` 23/23; build ok.

**O que ficou de fora / limites:**

- **Dossiê da OP** (`OpDossie.tsx`, `RelDossieOp`) e os componentes compartilhados (`VeiculoOuEnvio`, `Termometro`) **não foram migrados** — só conferi que a aba abre.
- **Comissões com dado real**: hoje há **11 vendedores com comissão cadastrada e nenhuma OP faturada no mês**, então a tabela de OPs por vendedor só foi verificada com dado simulado.
- **Atrasadas / Paradas vazias** ("Nenhuma OP atrasada!") não puderam ser vistas com dado real (as duas têm linhas); o texto continua o mesmo, sem o emoji e sem a cor verde.
- **As cores dos status mudam de propósito** (uma por família); quem se acostumou com "Aguardando CQ" roxo verá âmbar.
- **6 `style` inline** restam: a cor vinda do termômetro de markup (dado), um espaçamento e o ponto de cor do indicador.

**O que a fatia 12a ensinou para as próximas** (além da receita do piloto): (1) **fotografia antes/depois** é o teste certo para tela sem gravação, mas **o banco de produção anda** — na primeira tentativa 3 linhas diferiam porque uma OP mudou de etapa no meio; a solução foi
guardar a tela nova com `git stash`, refazer a "antes" e devolver, **em sequência**; (2) o normalizador do teste precisa conhecer os rótulos curtos do design system (`Aguardando inicio producao` → `Aguardando início`); (3) **procure o nome da classe antes de criar**:
`acn-quebra` já existia no `responsivo.css` e nas telas de cadastro, com outro sentido — a minha virou `acn-texto-longo`; (4) `overflow-wrap: anywhere` encolhe a coluna e quebra "Transformacao" ao meio, `break-word` não; (5) script com regex e barra invertida via heredoc perde a barra — use o `Edit`.

#### ✅ 12b1 — Logística: abas, Aguardando Recebimento, Relatório IN/OUT e a janela "Receber Pedido"

**Feito em:** 30/09/2026. **Por que dividi a 12b em três:** a Logística tem 4 abas e 2.174 linhas, e só o painel de Fretes passa de mil linhas e tem 22 dos 31 pontos de gravação (a janela de recebimento tem 5; o Histórico, 4). Cada fatia sobe e funciona sozinha: **12b1** = barra de abas + Aguardando Recebimento + Relatório IN/OUT (leitura) + a janela "Receber Pedido" (a única que grava aqui); **12b2** = Histórico / Novo Registro; **12b3** = Fretes.

**Antes da migração, um bug achado pela própria fotografia:** as datas dos manifestos apareciam **um dia antes** do real (Etapa 7.10, corrigida em passo e commit à parte, **antes** de tirar o "antes" desta fatia, para a comparação partir de uma tela certa).

**O que foi feito** (`LogisticaTab.tsx`, só a parte visual; `design.css`; **nenhuma consulta, conta, validação, texto de aviso ou gravação foi mexida**):

- **Barra de 4 abas → `Abas`** (ícone + rótulo; em tela estreita ela rola dentro da própria barra, a página não rola).
- **Relatório IN/OUT:** filtros em `acn-filtros` com `Botao`; **cartões de resumo em `acn-kpi`** (peça local `Indicadores`, com a linha de baixo "N un. · X kg") com um tom por tipo (recebimento verde, envio azul, transferência âmbar, saldo verde ou vermelho); tabelas em `acn-tabela`; o **tipo do manifesto vira `Selo`** (uma cor por família, igual às outras telas). A cor dos números por tipo na tabela "Por Tipo de Mercadoria" saiu — os cabeçalhos já dizem qual é qual.
- **Aguardando Recebimento:** `acn-tabela`; pedido atrasado em `acn-linha-alerta` mais o `Selo` "atrasado" (no lugar do ⚠ dentro do texto); "Receber" é `Botao` primário.
- **Janela "Receber Pedido":** a reposição de estoque virou `Faixa` verde; **a escolha "Confere com o pedido / Tem divergência" virou `Chips`** (era um quadro com dois botões); o aviso da divergência é `Faixa` âmbar; o botão principal é `Botao` verde ao conferir e **vermelho** ao registrar divergência. **Essa janela é compartilhada com o Compras** (mover o pedido de "Comprado" para "Recebido"): agora é igual nas duas telas.
- **Classes novas no `design.css`**, reutilizáveis nas 12b2/12b3: `acn-modal-larga`, `acn-modal-sub`, `acn-form-cheio`, `acn-modal-campo`, `acn-modal-acoes`. Emojis decorativos tirados dos títulos, botões e avisos.

**Resultado no código (medido no arquivo inteiro; as outras fatias ainda não foram migradas):** `style` inline **243 → 199**, `acn-btn` **29 → 25**, cores hex **208 → 155** (o plano registrou 197 com outra contagem; a de hoje usa `#rrggbb` e `#rgb`), `<button>` cru **41 → 31**, 2.174 → 2.169 linhas.

**Como foi testado (gravações bloqueadas; respostas de gravação simuladas dentro do navegador):**

- **Fotografia comparada** (`snap_log1.cjs`, igual para a tela velha e a nova): **12 cenários, 501 linhas de tabela, 12/12 iguais** — Aguardando Recebimento com dado real (4 pedidos), vazio e 3 pedidos simulados (atrasado, sem número/valor/fornecedor, e de **reposição de estoque**); Relatório IN/OUT em 2 períodos × 4 tipos e um cenário simulado com **Transferência** e quantidade/peso vazios. Estável entre duas rodadas.
- **Comportamento comparado** (`comport_log1.cjs`, grava o que a pessoa vê **e o que seria gravado** nas duas versões): **11 blocos iguais** — cada aba mostra o seu painel; a janela abre com os mesmos campos e valores; "Tem divergência"; NF obrigatória e observação obrigatória; cancelar; **confirmar o recebimento grava exatamente os mesmos 3 comandos com os mesmos corpos** (manifesto, pedido e liberação do faturamento); **registrar divergência grava os mesmos 3** (manifesto, pedido, demanda para o Compras); a reposição de estoque mostra o aviso e abre com a quantidade **comprada** (12); "Filtrar" manda o período e o tipo digitados para a consulta.
- **Entrada pelo Compras** (`teste_29`): **4/4** — mover um pedido "Comprado" para "Recebido" abre a mesma janela nova.
- **Capturas** em claro, escuro e celular (390 px): sem rolagem lateral da página. **Regressão:** `teste_20` (Fiscal, que compartilha o `design.css`) 29/29, `teste_21` (Relatórios) 13/13, `teste_17` (painel de aprovação) 24/24, `teste_18` 29/29, `teste_63` 23/23, `teste_28` (datas da Logística) 6/6, `teste_5x` 11/11 (na primeira passada, dentro da fila longa, uma checagem de tempo do banner da OP falhou; sozinho, duas vezes, deu 11/11); build ok.

**O que ficou de fora / limites:**

- **Histórico / Novo Registro e Fretes** (12b2 e 12b3), inclusive a janela "Ver", a de fotos e o **PDF do comprovante** (só a correção de data entrou, na 7.10).
- Os **tipos do manifesto** perdem as cores vivas de antes (verde/azul/âmbar chapados) e ficam no `Selo` suave; os **números por tipo** deixam de ser coloridos.
- A janela de recebimento **nunca foi confirmada com um pedido de reposição de estoque real** (hoje nenhum "Comprado" é de estoque): o aviso e a quantidade foram vistos com pedido **simulado**; o crédito no estoque não é tocado por esta fatia.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12b1 ensinou para as próximas:** (1) a **fotografia achou um bug** que a tela velha escondia (as datas); **uma comparação "igual à de antes" também compara os erros de antes** — bug é etapa própria, e se corrige **antes** de tirar o "antes"; (2) para tela que **grava**, comparar o **corpo do que seria gravado** nas duas versões é a prova mais forte (mascarar só as horas); (3) o toast de um cenário **fica na tela** no seguinte — o teste precisa tratar isso igual nas duas rodadas; (4) mensagem com hífen e ponto ("PC-CRM-632632") precisa do **mesmo normalizador** no navegador e no teste, senão o teste não acha a linha; (5) um teste que "pendurou" por 10 minutos era só uma execução simultânea — rode **uma de cada vez** no mesmo servidor.

**Correção posterior, feita na 12b2:** a tabela "Movimentos do Período" do Relatório IN/OUT, migrada aqui, passou a **rolar para o lado a 1400 px** (1.160 px contra 1.102 úteis; a versão anterior à 12b1 cabia) — não vi na época porque a fotografia compara texto, não largura. Corrigida com `acn-densa` e `acn-texto-medio` (ver o bloco da 12b2).

#### ✅ 12b2 — Logística: Histórico / Novo Registro (formulário de manifesto, janela "Ver", fotos)

**Feito em:** 30/09/2026. Segunda das três fatias da Logística; a 12b3 (Fretes) veio depois, em 01/10/2026.

**O que foi feito** (`LogisticaTab.tsx`, só a parte visual; `design.css`; **nenhuma consulta, validação, texto de aviso, gravação nem o gerador do PDF foi mexido** — `salvar`, `fetchAll`, `handleFotos`, `removerFoto` e `gerarPDF` ficaram como estavam):

- **Cartão do topo** com o botão "Novo Registro" em `Botao` primário (ícone de mais).
- **Formulário do manifesto** em `acn-form-cheio`, com os mesmos rótulos e os mesmos campos; os grupos largos (descrição, observações, pedido de compra) usam a classe nova `acn-campo-largo`.
- **Conferência técnica** (quando o recebimento é vinculado a um pedido de compra) virou um **quadro** (`acn-quadro`): números de série, volume, a caixa "NF do fornecedor confere com o que chegou" (`acn-check`) e o aviso de que, sem marcar, a compra continua "Comprado" — agora numa `Faixa` âmbar, e só aparece enquanto a caixa está desmarcada, como antes.
- **Fotos:** miniaturas em `acn-fotos`; o botão de remover (era um "x" solto) virou **ícone com o nome "Remover foto"**; "Foto" é `Botao` com ícone, e o seletor de arquivo continua escondido.
- **Botões do formulário:** "Registrar" (ocupa a largura toda) e "Cancelar" em `acn-modal-acoes`.
- **Histórico:** `acn-tabela` com o **tipo do manifesto em `Selo`** (mesma família de cores do Relatório IN/OUT, da 12b1); "Ver" e "PDF" em `Botao` com ícone, dentro de `acn-acoes-linha`, e "N foto(s)" em `Botao` só com texto.
- **Largura da tabela — achada e corrigida antes do commit** (a lição da 12a, de novo): com o dado real, a 1400 px (o quadro tem **1.102 px úteis**), a tabela nova do Histórico ficava com **1.355 px** e passava a **rolar para o lado, escondendo as colunas Obs. e Ação** (os botões "Ver" e "PDF"); a antiga tinha **1.102 px** e cabia. Causas: a coluna "Mercadoria" não encolhia (um registro tem uma **URL colada de 646 px** sem espaço, que a tabela antiga quebrava à força com `word-break`), os botões ficavam lado a lado (a antiga os empilhava) e o recuo de 10 px por lado de cada célula. Correção só visual, com três classes novas e opt-in no `design.css`: **`acn-densa`** (recuo de 7 px, só nesta tabela), **`acn-acoes-linha quebra`** (os botões da linha quebram de linha, como antes) e **`acn-texto-medio` / `acn-texto-curto`** (a coluna corta a palavra sem espaço, mas nunca fica menor que 130 px — 80 px nas observações —, para não partir "Transformacao" ao meio). Resultado a 1400 px: **1.102 px, igual à antiga, sem rolar**; a 1920 px, 1.622 px sem rolar; a 1100 px e no celular a tabela rola **dentro do quadro** (a antiga também rolava), com 1.068 px.
- **Achado na mesma medição, em tela da 12b1 já publicada:** a tabela "Movimentos do Período" do **Relatório IN/OUT** também rolava a 1400 px (**1.160 px** contra 1.102; a versão anterior à 12b1 cabia). Corrigida com as mesmas duas classes (`acn-densa` e `acn-texto-medio` na coluna Mercadoria). As outras tabelas da Logística (Aguardando Recebimento, resumo por mercadoria) já cabiam: **1.102 px = 1.102 px**.
- **Janelas "Detalhes do Manifesto" e "Fotos"** em classes novas (`acn-modal-media`, `acn-ficha-cab`, `acn-ficha-id`, `acn-ficha-linha`, `acn-ficha-fotos`, `acn-foto-grande`): a ficha é uma lista de "rótulo — valor" com o tipo em `Selo` e o ID no canto.
- Emojis decorativos tirados dos botões (👁, 📄, 📷). A função local `corTipo` do componente principal saiu (o `Selo` cuida da cor).

**Resultado no código (arquivo inteiro; só os Fretes seguem sem migrar; medido depois da correção de largura):** `style` inline **199 → 136**, `acn-btn` **25 → 15**, cores hex **155 → 124**, `<button>` cru **31 → 20**; 2.169 → 2.169 linhas.

**Como foi testado (gravações bloqueadas; respostas de gravação simuladas dentro do navegador):**

- **Fotografia comparada** (`snap_log2.cjs`, igual para a tela velha e a nova): **4 blocos iguais** — lista com dado real (156 manifestos), lista vazia, lista simulada (todos os tipos, campos vazios, vários pedidos e fotos) e as **8 janelas** de detalhes e fotos abertas a partir dela. Duas rodadas, mesmo resultado.
- **Comportamento comparado** (`comport_log2.cjs`, guarda o que a pessoa vê **e o que seria gravado** nas duas versões): **18 blocos iguais** — formulário fechado e aberto, valores padrão, "registrar" vazio (os avisos de campo obrigatório), Envio (**grava 1 manifesto**), o formulário volta ao estado limpo; lista de pedidos para vincular; vincular um pedido abre a conferência técnica e o aviso; marcar a NF; **recebimento conferido grava os mesmos 3 comandos com os mesmos corpos** (manifesto, pedido "Recebido", liberação do faturamento); **recebimento de pedido de reposição de estoque grava os mesmos 4** (os 3 anteriores mais a entrada no estoque); foto anexada, removida e anexada de novo; **registrar com foto grava o envio da imagem e o manifesto com o endereço dela**; cancelar.
- **Única equivalência declarada:** o botão de remover foto era o texto "x" e agora é um ícone com o nome "Remover foto" (o comparador trata os dois como a mesma coisa; nada mais foi relaxado).
- Conferido que o cenário das fotos **de fato rodou** na tela nova (houve o envio da imagem e o manifesto trouxe o endereço) e que o aviso da NF aparece e some ao marcar a caixa.
- **Capturas** em claro, escuro e celular (390 px) do formulário (com pedido vinculado e uma foto), da lista e da janela "Ver": **0 px de rolagem lateral da página** nos três; no celular a tabela rola dentro do próprio quadro. **Fotografia e comportamento foram refeitos depois da correção de largura**, com o mesmo resultado (4/4 e 18/18). Refeitas também as comparações da 12b1: **12/12** na fotografia e **10 de 11** no comportamento — a única diferença é o "+" do botão "Novo Registro", que passou a ser um ícone (o texto do botão deixou de trazer o sinal).
- **Regressão (rodada duas vezes: antes e depois da correção de largura):** `teste_20` (Fiscal, que divide o `design.css`) 29/29, `teste_21` (Relatórios) 13/13, `teste_17` 24/24, `teste_18` 29/29, `teste_63` 23/23, `teste_28` (datas da Logística, incluindo o Histórico) 6/6, `teste_29` (entrada pelo Compras) 4/4, `teste_5x` 11/11 (na primeira passada, dentro da fila longa, deu 10/11 — a mesma checagem de tempo do banner da OP que já tinha falhado na 12b1; sozinho e na segunda passada, 11/11); build ok. O `teste_26` não se repete mais com dado real (ver a Etapa 8).

**O que ficou de fora / limites:**

- **Os Fretes** (12b3, 22 pontos de gravação).
- **O PDF do comprovante não foi aberto**: o gerador (`gerarPDF`) carrega a biblioteca de um servidor externo, que o teste não alcança; o botão "PDF" e o "Gerar PDF" da ficha estão presentes e o código do gerador não foi tocado, mas **ninguém viu um PDF novo saindo**.
- **O envio da foto de verdade** (arquivo indo para o armazenamento) **não foi feito**: o teste anexa um arquivo na tela e a resposta do armazenamento é **simulada** no navegador — vale o que a tela mostra e o que ela mandaria gravar, não o arquivo chegando no servidor.
- **O crédito no estoque** só foi visto com **pedido simulado** (a resposta simulada da função do banco vem vazia, então o aviso "recebimento registrado, mas não foi possível creditar o estoque" aparece nas duas versões, igual) — como na 12b1, nenhum pedido "Comprado" real é de estoque hoje.
- O **tipo do manifesto** continua no `Selo` suave (já era assim na 12b1) e a **ficha "Ver"** troca o fundo cinza por linhas separadas: é desenho, não informação.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos. No celular, o botão de ajuda e o aviso fixo do sistema cobrem o canto inferior direito da janela "Ver" (já acontecia em outras telas; não é da Logística).

**O que a 12b2 ensinou para a 12b3:** (1) **seletor de arquivo escondido não é obstáculo**: o `uploadFile` do Puppeteer preenche e dispara a mudança; mas anexar **o mesmo arquivo de novo não dispara** — use um segundo arquivo; (2) a resposta de **gravação simulada dentro do navegador** (`escritaSimulada`) é o que permite exercitar o caminho inteiro (envio da imagem, manifesto, pedido, estoque) sem tocar no banco; (3) **o histórico e os pedidos não recarregam ao clicar de novo na aba**: entre um cenário e outro é preciso fechar a tela e voltar, nas duas versões; (4) quando a tela intencionalmente muda (o "x" virou ícone), **declare a equivalência no comparador, uma só, por escrito** — e não relaxe o resto; (5) **meça a largura de cada tabela com o dado real, a 1400 px, nas duas versões — mesmo na que já foi para produção**: a tela nova nasceu 253 px mais larga e o botão de ação, no fim da linha, sumia atrás da rolagem; a causa mais traiçoeira foi **uma única linha com uma URL colada** (a medição de "maior palavra" por coluna a achou); (6) `overflow-wrap: break-word` **não** diminui a largura mínima da coluna — `anywhere` sim, por isso a classe nova junta `anywhere` com uma **largura mínima**.

#### ✅ 12b3 — Logística: Fretes (aproveitamento, solicitação, cotações, aprovação, trânsito e entrega)

**Feito em:** 01/10/2026. Terceira e última fatia da Logística: **o arquivo `LogisticaTab.tsx` inteiro está no design system**.

**Antes da migração, dois bugs achados com dado real, cada um em passo e commit à parte** (para a comparação partir de uma tela certa): a **7.11** (os 5 fretes já em cotação não liberariam a OP ao serem entregues) e a **7.12** (o aproveitamento sugeria juntar envios de SC, RO e ES por causa de CEP de zeros).

**O que foi feito** (`LogisticaTab.tsx`, só a parte visual; `design.css`; **nenhuma consulta, conta, validação, texto de aviso, gravação, notificação nem regra de aprovação foi mexida**):

- **Cartão "Aproveitamento de frete":** borda lateral âmbar, cada oportunidade num quadro com o botão "Juntar numa carga" (`Botao`); a janela (7/15/30 dias) continua no cabeçalho.
- **Formulário "Novo Frete":** `form-row` / `form-group` como no resto; o **vínculo ao processo** virou `Chips` ("Só texto livre / Vincular a OP/OS / Vincular a Licitação") dentro de um quadro, e os **Dados do Transporte** são outro quadro. A busca de OP/OS e de licitação tem classes próprias (a lista não depende mais de cor escrita à mão).
- **Tabela:** `acn-tabela acn-densa`; **status em `Selo`** (uma cor por família: Cotação cinza, Aguardando aprovação âmbar, Em trânsito azul, Entregue verde, Cancelado vermelho); a "Carga agrupada" é uma `Tag` com o botão "desfazer"; **o botão principal da linha muda com o estado** ("Cotações" em destaque, "Canhoto" ou "Ver") e cancelar é um ícone com o nome "Cancelar frete"; a linha **não lida** usa `acn-linha-nova`.
- **Janela do frete** (uma por estado): o **vínculo** e o **resumo** viraram `Faixa` / quadros coloridos por tom; as **cotações** são cartões de escolha (o selecionado fica verde, com o `Selo` "Vencedora"); a nova cotação, a justificativa, os **níveis de aprovação** (aprovado/rejeitado em `Selo`; o nível ativo numa `Faixa` âmbar), o CT-e e rastreio e o **canhoto** (quadro âmbar) ficaram na mesma ordem de antes; Aprovar é botão principal e **Rejeitar é vermelho**.
- **Classes novas no `design.css`**, todas conferidas contra o resto do código antes de criar: `acn-sugestao*`, `acn-aprov*`, `acn-select-mini`, `acn-vinculado`, `acn-direcao`, `acn-sub-info`, `acn-agrupado`, `acn-modal-frete`, `acn-grade-2`, `acn-dados-grade`, `acn-resumo`, `acn-quadro.tom-*`, `acn-botao-cheio`, `acn-titulo-solto`, `acn-cotacoes`, `acn-cotacao*`, `acn-link-icone`, `acn-lista-niveis`, `acn-nivel*`. O recuo da tabela densa (`acn-densa`) passou de 7 para 6 px.
- Emojis decorativos tirados dos títulos, botões e avisos; o objeto de cores à mão do status (`COR_FRETE`) e o estilo dos botões (`btn`) saíram.

**Resultado no código (arquivo inteiro, agora sem pendência):** `style` inline **136 → 1** (a cor do ponto do indicador, que vem de um token), `acn-btn` **15 → 0**, cores hex **124 → 0**, `<button>` cru **20 → 0**; 2.169 → 2.148 linhas. **No total da Logística, desde a 12b1:** `style` 243 → 1, `acn-btn` 29 → 0, hex 208 → 0.

**Como foi testado (gravações bloqueadas; respostas de gravação simuladas dentro do navegador):** o banco real tem **5 solicitações, todas em "Cotação", sem nenhuma cotação, aprovação ou alçada** — então os outros estados foram **simulados só na leitura** (11 fretes: os cinco estados, carga agrupada, vínculo por OP e por licitação, dados do transporte completos, cotações com anexo, níveis de aprovação).

- **Fotografia comparada** (`snap_log3.cjs`, igual para a tela velha e a nova): **23 blocos iguais** — a lista com dado real, vazia e simulada (16 linhas de tabela), o cartão de aproveitamento, **a janela de cada um dos 12 fretes** (real e simulados), e o formulário aberto com os 3 vínculos, a busca simulada e o vínculo escolhido. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_log3.cjs`, o que a pessoa vê **e o corpo do que seria gravado**): **49 blocos iguais, em 16 caminhos de gravação e 51 comandos** — juntar numa carga (cancelar e confirmar) e desfazer; novo frete (validação, completo com OP e pedido de compra, com licitação, texto livre, cancelar); cotação (as duas validações, anexo, excluir com confirmação, sem vencedora, sem justificativa, confirmar **com alçada** — frete + auditoria + níveis + menção + e-mail — e **sem alçada**); aprovação (rejeitar: cancelar, sem motivo, com motivo; aprovar com próximo nível e o último); em trânsito (CT-e e rastreio, entrega sem canhoto, **entrega pela OP** — 8 comandos, até a OP sair de "Aguardando Cotacao Frete" — e **pela licitação**); cancelar (desistir e confirmar). Duas rodadas da tela antiga entre si: iguais.
- **Duas equivalências declaradas, por escrito, no comparador:** (1) a mensagem "Nenhum frete registrado." passou a usar a classe `acn-empty` (o **texto** é comparado em outro campo e é igual); (2) a lista de gravações é comparada **como conjunto**: o registro de auditoria e a baixa das menções são disparados sem esperar a resposta, então a **ordem** de chegada varia entre rodadas **da mesma versão** — o comando, o endereço e o corpo continuam comparados por inteiro.
- **Largura (a lição da 12b2, aplicada antes de fechar):** a 1400 px a tabela de Fretes cabe no quadro (**1.102 px** com dado real; a antiga ocupava o quadro sem recuo, 1.130 px); a 1100 px também cabe (802 px) com dado real e simulado; a 390 px rola dentro do quadro, **como a antiga**. Na primeira medição, o simulado a 1100 px passava 3 px: o recuo da tabela densa foi de 7 para 6 px (e as tabelas das 12b1 e 12b2 seguem cabendo a 1400 px). Linha média com dado real: 60 → 53 px.
- **Capturas** em claro, escuro e celular (390 px) da lista, do formulário (com busca e vínculo), e das janelas de cotação, aprovação, em trânsito e entregue: **0 px de rolagem lateral da página** nos três.
- **Regressão:** `teste_30` (a 7.11) 7/7 com o vínculo `'opl'` e com `'op_os'`, `teste_31` (a 7.12) 5/5, `teste_28` (datas da Logística) 6/6, `teste_29` (entrada pelo Compras) 4/4, `teste_20` (Fiscal, que divide o `design.css`) 29/29, `teste_21` 13/13, `teste_17` 24/24, `teste_18` 29/29, `teste_63` 23/23; build ok. **A comparação da 12b2 refeita com a tabela mais densa: 4/4 iguais.**

**O que ficou de fora / limites:**

- **A entrega "de verdade" não foi feita:** o canhoto, o anexo da cotação e o e-mail de aprovação são **respondidos por simulação** no navegador (nada chega ao armazenamento nem ao servidor de e-mail). Vale o que a tela mostra e o que ela **mandaria** gravar.
- **Só leitura simulada** para cotações, níveis de aprovação, alçadas e fretes além de "Cotação": **não existe dado real** nesses estados. A única ramificação não exercitada é a de **quem não é aprovador** ("Você não tem autorização…"): o usuário do teste é Admin, que sempre pode.
- **Não testado:** o atalho vindo do painel de **Menções** (abre o frete pelo aviso de aprovação) e o recarregamento do painel depois de uma gravação real.
- **A comparação da 12b1 não pôde ser refeita com o dado de hoje:** o Relatório IN/OUT abre no período "últimos 30 dias", e a data virou (agora 01/09 a 01/10); **9 dos 12 blocos** mudaram só por isso (os totais do período). A parte visual dessas telas não mudou nesta fatia, fora o recuo da tabela densa.
- **`teste_5x` deu 10/11, e dá 10/11 também sem a minha mudança** (guardei a tela nova e rodei a antiga): a checagem do Financeiro procura uma compra "Recebido" no mês corrente e o filtro abre em **outubro**, que ainda não tem compras ("0 compra(s) no período"). É dependência de data do teste, não da tela; deve voltar a passar quando entrar a primeira compra do mês.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos. O seletor de arquivo continua o do navegador (só tirei o fundo branco dentro do quadro).
- **Dado que não mexi:** os CEPs de zeros e os nomes de cidade "NAI SEI" / "NAO TEM" das 4 solicitações reais (ver 7.12).

**O que a 12b3 ensinou para as próximas (RH, SAC):** (1) **procure o nome da classe antes de criar — de novo:** `acn-busca` já era a busca do cabeçalho (`DashboardTab.tsx`, com `margin-left:auto`), e empurrou o campo de busca de OP para a direita; achei pela captura, não pela comparação de texto, e a classe virou `acn-sugestao` (conferi todas as outras com `grep` em `src` inteiro); (2) **leia o dado real antes de planejar o teste:** ele mostrou que só um dos cinco estados existe, e os dois bugs (7.11 e 7.12) saíram **da leitura dos dados reais**, não do código; (3) **ao abrir "o primeiro botão da linha", escolha o principal:** na linha de carga agrupada o primeiro é o "desfazer", que abria uma confirmação que ficava aberta e roubava o foco da digitação — nas **duas** versões; (4) **gravações disparadas sem esperar** (auditoria, menções) chegam em ordem variável: compare como conjunto, declarando isso; (5) um teste com dado **dependente da data** (o mês do Financeiro, o período do Relatório) vai falhar na virada sem que nada tenha mudado — rode também a versão antiga antes de concluir que a nova quebrou; (6) o **`grep` com `--include` depois do padrão e de um `--`** vira nome de arquivo: confira que o resultado "0" não é um erro.

#### ✅ 12c1 — RH: topo, KPI, Status dos Colaboradores, Desligados e Banco de Horas

**Feito em:** 01/10/2026. **Por que dividi a 12c em quatro:** o RH é **uma página só, de 2.618 linhas**, com nove quadros empilhados e três janelas de cadastro. Pelo que a pessoa vê, de cima para baixo: **12c1** = topo + KPI + Status + Desligados + Banco de Horas (cerca de 440 linhas, 5 gravações); **12c2** = as janelas de cadastro (Colaborador 268 linhas, Lançamento 136, Autorização 128) e a lista de Autorizações; **12c3** = os Relatórios (Horas, Técnicos, Uniformes — só leitura; o HTML das impressões fica de fora, é outro documento); **12c4** = Comissões de Técnicos e o Histórico. Duas telas das últimas fatias formatam data com `new Date(texto)` (`RelatorioTecnicos` e `HistoricoComissoes`): **só vão errar se a coluna for do tipo *date*** — conferir com dado real **antes** da comparação da 12c3 e da 12c4, como na 7.10.

**O que foi feito** (`RHTab.tsx`, só a parte visual dessas seções; `design.css`; **nenhuma consulta, conta, filtro, validação, texto de aviso ou gravação foi mexida**):

- **Topo:** os cinco contadores (Ativos, Viagem, Folga, Férias, Afastados) viram `acn-kpi` compactos, e os botões "Colaborador" (principal), "Lançar Horas" e "Autorização" viram `Botao`.
- **KPI — Absenteísmo & Horas:** os quatro filtros e o recolher ficam no cabeçalho; os cinco totais são `acn-kpi` (Faltas vermelho, Atestados cinza, Atrasos âmbar, Horas extras verde, Absenteísmo na cor da marca). **Gráfico:** as barras ganham as cores das famílias do design system **por classe** (a largura continua vindo do dado, no próprio elemento); os nomes aparecem inteiros. **Tabela de lançamentos:** `acn-tabela`, o tipo em `Selo` (uma cor por família: Hora Extra e Entrada Antecipada verdes; Atraso, Saída Antecipada e Declaração âmbar; Falta vermelho; Atestado cinza; Férias na cor da marca; Folga e Viagem azuis), duração com sinal em verde/vermelho.
- **Status dos Colaboradores:** `acn-tabela`; o tipo em `Selo` (Terceiro âmbar, Funcionário azul); **o status de presença continua sendo uma lista que muda o status ao escolher**, agora com a cor da família (Ativo verde, Em Viagem e Folga azuis, Férias na cor da marca, Afastado vermelho, Desligado cinza); editar e excluir viram ícone com nome; a linha com alteração não vista usa `acn-linha-nova`.
- **Desligados** (da 7.9, que já usava `Botao`/`Selo`/`acn-tabela`) e **a janela "Desligar / Corrigir desligamento"**: só o que sobrava de estilo solto.
- **Banco de Horas:** `acn-tabela`, crédito, débito e saldo em verde/vermelho, "Fechar" é `Botao`.
- **Recolher/abrir:** a lógica ficou igual (estado local mais o clique global do cabeçalho); o cabeçalho ganhou `no-collapse` para sumir a **seta global duplicada** (antes havia duas setas: a do sistema e a do próprio quadro) e o botão do quadro virou ícone.
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro antes de criar: `acn-kpis-compactos`, `acn-rh-topo`, `acn-rh-acoes`, `acn-cab-titulo`, `acn-cab-filtros`, `acn-sem-recuo`, `acn-modal-estreita`, `acn-txt-ok`, `acn-sel-status`, `acn-kpi-faixa`, `acn-grafico*`, `acn-barra-trilho`, `acn-barra-seg` (o nome `acn-barra` **já existia**, em outras telas: não usei).

**Resultado no código (arquivo inteiro; as outras fatias ainda não foram migradas):** `style` inline **390 → 317**, cores hex **448 → 373**, `<button>` cru **45 → 34**, `acn-btn` 3 → 3, 2.618 → 2.580 linhas. **Só no trecho desta fatia:** inline **75 → 2** (as larguras das barras do gráfico, que vêm do dado), hex **75 → 0**, `<button>` 11 → 0.

**Como foi testado (gravações bloqueadas; respostas de gravação simuladas no navegador):** o banco real tem **40 colaboradores ativos, 0 desligados e só 22 lançamentos (junho e julho de 2026)** — o mês corrente (outubro) fica zerado —, então os outros estados foram **simulados só na leitura, com gente inventada (ZZ …)**: todos os status de presença, os dois tipos, cargo comprido, 3 desligados (um sem data nem motivo) e lançamentos dos **10 tipos**.

- **Fotografia comparada** (`snap_rh1.cjs`, igual para a tela velha e a nova): **12 blocos iguais** (369 linhas de tabela) — topo, KPI (recolhido e aberto, com filtro por tipo, por pessoa, por mês), Status, Desligados e Banco de Horas, com dado real (em outubro e em julho) e simulado, e cada quadro recolhido e reaberto pelo cabeçalho. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_rh1.cjs`, o que a pessoa vê **e o corpo do que seria gravado**): **25 blocos iguais** — mudar o status (Folga, Em Viagem); **desligar** (a janela, sem motivo, data antes da admissão, gravação, cancelar); **corrigir** e **reativar** (com confirmação, cancelar e confirmar); **excluir** (cancelar e confirmar); **fechar o mês** do banco de horas (o aviso traz o saldo; cancelar e confirmar); os três botões do topo abrem as janelas de cadastro. Duas rodadas da tela antiga entre si: iguais.
- **Uma equivalência declarada, por escrito, no comparador:** a lista de gravações é comparada **como conjunto** (o registro de auditoria é disparado sem esperar a resposta, e a ordem varia entre rodadas da mesma versão). O comando, o endereço e o corpo continuam comparados por inteiro.
- **Largura (a lição da 12b2):** com dado real e simulado, a **1400 e a 1100 px** todas as tabelas cabem no quadro, como as antigas; a **390 px** rolam dentro do quadro, como as antigas; a página não rola.
- **Capturas** em claro, escuro e celular (390 px) do topo, do KPI aberto, do status, dos desligados, do banco de horas e da janela de desligar: **0 px de rolagem lateral da página**.
- **Regressão:** `teste_24` 28/28 (Equipe da OP e comissão do RH) e `teste_25` 20/20 (status Desligado), `teste_32` 19/19, `teste_31` 5/5, `teste_30` 7/7, `teste_28` 6/6, `teste_29` 4/4, `teste_61` 21/21, `teste_63` 23/23, `teste_17` 24/24, `teste_18` 29/29, `teste_21` 13/13, `teste_20` 29/29; build ok. `teste_5x` 10/11 (só o Financeiro, que depende de haver compra no mês corrente; igual sem a mudança).

**O que ficou de fora / limites:**

- **As janelas de cadastro** (Colaborador, Lançamento, Autorização), a **lista de Autorizações**, os **Relatórios** e as **Comissões** (12c2 a 12c4). Os três botões do topo **abrem** essas janelas, que continuam com o visual antigo.
- Com dado real, o **KPI e o Banco de Horas só têm lançamentos em julho** (e junho): em outubro estão zerados.
- **As cores mudam de propósito, por família:** Folga, Viagem e Em Viagem são todos azuis; Férias saiu do roxo para a cor da marca; os dez tipos de lançamento, que tinham dez cores, agora são seis famílias (o texto diz qual é qual).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12c1 ensinou para as próximas:** (1) **`grid` com `auto-fit` dentro de um item flexível colapsa para uma coluna** (os cinco contadores saíram empilhados na primeira captura): para uma fileira de tamanho natural use `flex` com `flex-wrap`; (2) **as regras globais de `select` ganham da família do status** — a cor só apareceu com `!important` num seletor mais específico (e ficou comentado no CSS); (3) **o quadro com recolher próprio tinha duas setas** (a global e a local): `no-collapse` no cabeçalho resolve sem mexer na lógica; (4) a primeira fotografia **já saiu igual** porque os textos foram mantidos palavra por palavra: manter o texto é o que faz a prova valer.

#### ✅ 12c2 — RH: janelas de cadastro (Colaborador, Lançamento, Autorização) e a lista de Autorizações

**Feito em:** 01/10/2026. **Antes da migração, um bug achado ao ler o código** (Etapa 7.14): a janela do colaborador tinha **dois pares de botões para "Recebe comissão?"** e um deles **não fazia nada**; corrigido em passo e commit à parte, **antes** de tirar o "antes" desta fatia.

**O que foi feito** (`RHTab.tsx`, só a parte visual dessas janelas; `design.css`; **nenhuma consulta, validação, texto de aviso, gravação ou o HTML da impressão foi mexido**):

- **As três janelas** deixam de ser camadas com estilo na própria tela (fundo, caixa, cabeçalho e rodapé escritos à mão) e passam a usar a `modal-overlay` / `modal-box` do sistema, com cabeçalho (título e "×" em ícone), corpo que rola e rodapé fixo (`acn-modal-cab`, `acn-modal-corpo`, `acn-modal-rodape`). Clicar no fundo continua fechando.
- **Colaborador:** os blocos viram `acn-quadro` (Dados, Uniforme, Endereço; Contato de emergência em vermelho suave, Remuneração em verde suave, Comissão em âmbar suave); os campos usam `acn-input`/`acn-label`; as fileiras de botões coloridos (**tipo de vínculo, recebe comissão, base da comissão**) viram `Chips` com as mesmas opções e o mesmo valor gravado; o aviso do CEP e a dica do contrato usam `acn-ajuda`; a nota sobre comissões vira `Faixa`.
- **Lançamento:** os dez tipos viram `Chips`; a dica "Crédito / Débito / Sem efeito no banco de horas" ganha a cor da **família** do tipo (a mesma da 12c1); o aviso de "sem duração" é uma `Faixa` (Falta âmbar, Atestado verde, o resto azul); a duração tem campos curtos para hora e minuto.
- **Autorização:** o aviso de Terceiro é uma `Faixa`; o tipo (Saída/Entrada, ou Comunicação) é `Chips`; os dois horários ficam lado a lado; "Salvar e Imprimir" é `Botao`.
- **Lista de Autorizações:** `acn-tabela` (variante densa), tipo em `Selo` (Saída âmbar, Entrada azul), motivo com a largura limitada, impressora em ícone com nome acessível; o cabeçalho perde a seta duplicada (`no-collapse`), como na 12c1.
- **Emojis decorativos** tirados dos títulos, botões e avisos.
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro: `acn-modal-cadastro` (e `.menor`), `acn-modal-cab`, `acn-modal-corpo`, `acn-modal-rodape`, `acn-grade-3`, `acn-grade-cep`, `acn-grade-num`, `acn-grade-uf`, `acn-ajuda`, `acn-duracao`, `acn-input-curto`, `acn-duracao-total`.

**Resultado no código (arquivo inteiro; as fatias 12c3 e 12c4 ainda não foram migradas):** `style` inline **317 → 212**, cores hex **373 → 241**, `<button>` cru **34 → 19**, 2.580 → 2.509 linhas. **Só no trecho desta fatia (as três janelas e a lista):** inline **105 → 0**, hex **130 → 0**, `<button>` **15 → 0**, 584 → 515 linhas. **Ficam 21 `style={campoDestaque(...)}`** nos campos do colaborador: é o destaque de "campo alterado por outra pessoa" do sistema de auditoria (`useFieldHighlight`), **que vem do dado** e não foi tocado.

**Como foi testado (gravações bloqueadas; respostas de gravação simuladas no navegador):** leitura simulada com gente inventada (ZZ …): colaborador de cadastro **completo** (comissão ligada, endereço, uniforme, contato de emergência), um **Terceiro** (CNPJ e valor de serviços) e outros esparsos; autorizações de funcionário e de terceiro; a lista real tem 6 autorizações.

- **Fotografia comparada** (`snap_rh2c.cjs`, igual para a tela velha e a nova): **28 blocos iguais** — a janela do colaborador novo (Funcionário, Terceiro, com comissão e cada uma das 3 bases), editando um cadastro completo, um de Terceiro e um esparso; a de lançamento em **cada um dos 10 tipos** e preenchida; a de autorização inicial, com Terceiro, com Funcionário e com Entrada; e a lista de Autorizações (real, simulada, vazia e recolhida). Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_rh2c.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, mais o **HTML que vai para a impressão**): **27 blocos iguais** — colaborador: salvar sem nome, **funcionário completo** (CEP que preenche rua, bairro, cidade e UF; uniforme, emergência, salário, comissão com percentual e base) e **Terceiro** (CNPJ e valor de serviços) com os mesmos corpos gravados; **CEP não encontrado** e CEP incompleto; **editar** um cadastro; fechar pelo "×" e pelo fundo; lançamento: sem funcionário, sem duração, **hora extra 1h30**, falta, atestado, viagem e atraso (corpo gravado idêntico, incluindo mês, ano e minutos); autorização: as três validações, **salvar e imprimir** de funcionário e de terceiro, e a **reimpressão** pela lista (o HTML da impressão, com o estilo mascarado, é idêntico). Duas rodadas da tela antiga entre si: iguais.
- **Uma equivalência declarada, por escrito, no comparador:** o emoji "ℹ️" do aviso de comissão saiu; a normalização do teste não o descartava porque o caractere é classificado como **letra** — por isso a comparação de texto o via.
- **Largura (a lição da 12b2):** a tabela da lista cabe a 1400 e 1100 px (1.102 e 802 px) e rola dentro do quadro a 390 px, **como a antiga**. As três janelas **não têm campo fora da caixa** a 1400 e a 390 px; no celular a caixa passa a ocupar a largura toda (comportamento do sistema para janelas).
- **Capturas** em claro, escuro e celular (390 px) das três janelas (inclusive o fim da do colaborador, com Remuneração e Comissão) e da lista: **0 px de rolagem lateral da página**.
- **Regressão:** `teste_34` (a 7.14) 4/4, `teste_24` 28/28, `teste_25` 20/20, `teste_32` 19/19, `teste_31` 5/5, `teste_30` 7/7, `teste_28` 6/6, `teste_29` 4/4, `teste_61` 21/21, `teste_63` 23/23, `teste_17` 24/24, `teste_18` 29/29, `teste_21` 13/13, `teste_20` 29/29; build ok. `teste_5x` 10/11 (só o Financeiro, que depende de haver compra no mês corrente; igual sem a mudança). O `teste_34` precisou de um ajuste de seletor (a janela deixou de ser o overlay antigo).

**O que ficou de fora / limites:**

- **Os Relatórios** e as **Comissões** (12c3 e 12c4), e a **impressão em si** (o gerador do HTML não foi tocado; o teste compara o HTML gerado, **mas ninguém abriu o diálogo de impressão do navegador**).
- A janela de **editar lançamento** (`lancEdit`) **não é alcançável** por nenhuma tela hoje (a página sempre passa `null`): o visual dela foi migrado junto, mas **não foi testado**.
- **Achado, não corrigido (comportamento já existente):** no cadastro do colaborador, depois de um "CEP não encontrado", **apagar um dígito não limpa o aviso** (ele só some quando o CEP volta a ter 8 dígitos e é achado).
- Os **destaques de campo alterado** (`campoDestaque`) não foram exercitados com mudança real de outra pessoa; o código não foi tocado.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12c2 ensinou para a 12c3 e a 12c4:** (1) **ler o código antes de planejar a fatia achou um bug** (a 7.14) — o botão "Sim" que não fazia nada estava escondido atrás de um comentário do próprio autor; (2) **ao mudar o tipo de janela, o teste que procura "a janela" precisa saber das duas** (a camada antiga e a `modal-overlay`) enquanto a migração está em andamento; (3) **um emoji do tipo "ℹ️" é "letra" para a normalização**: se o texto compara igual por todo lado e só aquele aviso diverge, é isso; (4) a janela **mantém o texto palavra por palavra** — a fotografia saiu igual na primeira passada, só a equivalência do emoji precisou ser declarada.

#### ✅ 12c3 — RH: Relatórios (Horas, Técnicos e Uniformes)

**Feito em:** 01/10/2026. **Antes da migração, dois achados** que já tinham virado etapas à parte e foram commitados **antes** de tirar o "antes" desta fatia: a **data das OPs no Relatório de Técnicos saía um dia antes** (Etapa 7.15) e o **recolher dos quadros do RH se desencontrava entre o cabeçalho e a seta** (Etapa 7.16).

**O que foi feito** (`RHTab.tsx`, só a parte visual dos três quadros; `design.css`; **nenhuma consulta, conta, validação, texto de aviso ou o HTML da impressão foi mexido**):

- **Relatórios de Horas:** as três abas (Individual, Parcial por Período, Consolidado) viram o seletor em pílulas do sistema (`Chips`); os filtros usam os campos padrão (`acn-input`); o "Imprimir" é o botão principal da linha. A **tabela de pré-visualização** vira `acn-tabela` (densa), com as colunas numéricas centradas, créditos/débitos/saldo na cor de crédito e débito das outras tabelas do RH e a **contagem de cada tipo num `Selo`** da mesma família do lançamento (Faltas vermelho, Atestados cinza, Declarações e Saídas Ant. âmbar, Entradas Ant. verde); a linha de **TOTAL** ganha classe própria.
- **Relatório de Técnicos:** deixa de ser uma caixa à parte e vira **cartão** como os outros quadros do RH, com cabeçalho (título, busca por nome, Imprimir e seta). Cada técnico: avatar, nome, cargo/departamento, **tipo (Funcionário/Terceiro) e as contagens de OS e OP em `Selo`**; ao abrir, as tabelas de **OS** (com tipo da avaliação e status em `Selo`) e de **OP**. Técnico **sem cadastro no RH** fica com o cabeçalho neutro e o avatar cinza.
- **Relatório de Uniformes:** também vira cartão; o resumo por tamanho (Camiseta, Calça, Sapato) vira três blocos suaves, o "N sem tamanho cadastrado" usa o aviso âmbar e a lista é `acn-tabela`.
- **Os três quadros recolhem como os outros** (a classe `sec-collapsed` segue o estado do quadro — a regra da Etapa 7.16) e a seta é ícone, sem o "▸/▾" de texto.
- **Emojis decorativos** tirados de títulos, abas e botões; as cores feitas à mão (roxo das OS, verde das OP, rosa e amarelo dos títulos de coluna) saem.
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro antes de criar: `acn-rel-abas`, `acn-rel-filtros`, `acn-input-filtro`, `acn-linha-total`, `acn-pecas`, `acn-peca`, `acn-tec` (e `-cab`, `-avatar`, `-info`, `-sub`, `-contagem`, `-corpo`) e `acn-compacta` (linha de 32 px para tabela longa dentro de um quadro aberto).

**Resultado no código (arquivo inteiro; falta só a 12c4):** `style` inline **212 → 98**, cores hex **241 → 154**, `<button>` cru **19 → 10**, 2.516 → 2.477 linhas. **Só no trecho desta fatia:** inline **114 → 0**, `<button>` **9 → 0**, hex **99 → 12** — **os 12 que ficam são todos de dentro do HTML da impressão** (papel não acompanha o tema da tela; o gerador não foi tocado).

**Como foi testado (gravações bloqueadas; nenhuma gravação nos dois testes):** leitura **real** (40 colaboradores ativos, lançamentos de junho e julho, as 200 OPs do relatório, 4 técnicos de verdade) e leitura **simulada** (gente inventada ZZ …: 3 técnicos — um sem cadastro e um Terceiro —, 5 OS em status variados, uniformes de vários tamanhos).

- **Fotografia comparada** (`snap_rh3.cjs`, igual para a tela velha e a nova): **35 blocos iguais** — Horas individual, parcial (sem período, jun–jul, uma pessoa só) e consolidado (julho real; outubro, setembro e dezembro simulados) com a tabela linha a linha; Uniformes aberto e com cada filtro (Todos, Funcionários, Terceiros); **Técnicos: os 4 reais abertos um a um (114 + 52 + 30 + 4 OPs, linha a linha)** e os 3 simulados, com a busca (acha / não acha) e recolhido. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_rh3.cjs`: o aviso de cada validação **e o HTML que cada "Imprimir" manda para a janela de impressão**, com a hora de emissão mascarada): **20 blocos iguais** — "Selecione um funcionário!" e "Selecione o período!", e a impressão de Horas (individual em dois meses, parcial de todos e de uma pessoa, consolidado em dois meses), de Técnicos (todos, filtrado, filtro sem resultado) e de Uniformes (todos, só terceiros, só funcionários) — **mais a impressão com dado real** (Técnicos: 35 mil caracteres de HTML; Uniformes; Horas consolidado de julho, parcial jun–jul e individual). Duas rodadas da tela antiga entre si: iguais. **0 gravações.**
- **Uma equivalência declarada, por escrito, no comparador** (`compara_rh3.cjs`): no cabeçalho do técnico, o selo do tipo vinha **colado** ao departamento no texto da tela antiga ("comercialfuncionario" — era só uma margem de 6 px); na nova são itens separados e o texto lê com um espaço. O comparador tira só esse espaço, só antes de "funcionario/terceiro" seguido da contagem de OS/OP.
- **Largura (a lição da 12b2):** nas três tabelas de Horas, na de Uniformes e nas de OS/OP, **a 1400 e a 1100 px a tabela cabe sem rolar** (1.102 e 802 px; as de Técnicos 1.076 e 776), como a antiga; **a 390 px rolam dentro do quadro**, como antes, e a **página nunca rola de lado** (0 px nos três tamanhos, real e simulado). **O custo é altura:** com 40 colaboradores a tabela de Horas passa de 1.201 para **1.838 px** e a de Uniformes de 1.167 para **1.794 px** (linha de 44 px do sistema, como no Status dos Colaboradores); o técnico aberto com 114 OPs passa de 3.267 para **3.676 px** (a linha compacta segurou o crescimento).
- **Capturas** em claro, escuro e celular (390 px) de Horas (consolidado e individual), Uniformes e Técnicos (um com cadastro e um sem). Duas correções saíram **das capturas**: o selo "N OS" estava num verde quase igual ao "N OP" (virou azul) e, no celular, o número da OS quebrava em três linhas ("OS-", "ZZ-", "1") — a primeira coluna das tabelas compactas agora não quebra.
- **Regressão** (um teste por vez): `teste_36` (7.16) 30/30, `teste_35` 3/3, `teste_34` 4/4, `teste_32` 19/19, `teste_31` 5/5, `teste_30` 7/7, `teste_29` 4/4, `teste_28` 6/6, `teste_54` 21/21, `teste_55` 5/5, `teste_56` 9/9, `teste_61` 21/21, `teste_62` 30/30, `teste_63` 23/23; build ok. `teste_5x` 10/11 (só o Financeiro, que depende de haver compra no mês corrente; igual sem a mudança). `teste_26` **dá erro por causa do dado** (a compra PC-DEBMAA, de que ele depende, saiu da fila "Aguardando Aprovação" do banco real) — **o mesmo erro aparece sem as minhas mudanças** (conferido guardando-as de lado), não é regressão.

**O que ficou de fora / limites:**

- **Achado, não corrigido — o Relatório de Técnicos só olha as 200 OPs mais recentes.** A consulta tem `.limit(200)`; o banco tem **369 OPs com responsável comercial** (Tatiana 228, Thiago 75, Letícia 41, Rute 11, 13 com o nome em branco e 1 "leticia" sem sobrenome). Hoje a tela mostra **Tatiana 114, Thiago 52, Letícia 30, Rute 4** — **números menores que os reais, sem nenhum aviso**. Não mexi: é regra de negócio (o que o relatório deve contar?) — ver "Perguntas em aberto".
- **Achado, não corrigido — o "Imprimir" do Relatório de Técnicos não trata o bloqueio de pop-up:** ele escreve direto na janela que o navegador devolve; se o pop-up estiver bloqueado, dá erro em vez de avisar (o de Uniformes já se protege). E os nomes não passam pelo `escHtml` no HTML da impressão (um nome de cliente com "<" quebraria o papel). Bug funcional é etapa à parte; não entrou aqui.
- **A impressão em si:** o teste compara o HTML gerado, **mas ninguém abriu o diálogo de impressão do navegador**.
- A coluna **Cliente** das OPs repete o nome em maiúsculas como veio do banco; o texto "Nao cadastrado no RH" continua **sem acento**, como estava (texto não foi mexido de propósito).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12c3 ensinou para a 12c4:** (1) **a primeira passada da fotografia só divergiu num espaço**: quando o antigo escrevia dois itens colados e o novo os separa, declarar a equivalência por escrito no comparador (e não afrouxar o teste inteiro) mantém a prova honesta; (2) **a tabela que cresce em altura é um custo real** de passar para a linha de 44 px — para listas longas dentro de quadro aberto existe agora a `acn-compacta`; (3) **conferir o número na tela contra o banco** (aqui, as 200 OPs) achou um defeito que a comparação "antes × depois" jamais acharia, porque os dois lados mentem igual — vale repetir isso na 12c4 com as comissões; (4) as capturas pegaram dois defeitos que o texto não vê (cores parecidas e quebra de linha).

#### ✅ 12c4 — RH: Comissões de Técnicos e Histórico de comissões

**Feito em:** 01/10/2026. **Antes da migração, um achado de dinheiro** (Etapa 7.17): a tela contava o período errado (o último dia ficava de fora). Foi corrigido e commitado **à parte, antes** de tirar o "antes" desta fatia; a fotografia abaixo já parte do período certo.

**O que foi feito** (`RHTab.tsx`, só a parte visual; `design.css`; **nenhuma consulta, conta de comissão, regra de apoio/serralheria/lote, validação, texto de aviso ou gravação foi mexida**):

- **O quadro vira cartão** como os outros do RH (a classe de recolhido segue o estado — regra da 7.16), com cabeçalho de ícone e título; "Cálculo" e "Histórico" viram o seletor em pílulas (`Chips`).
- **Filtros:** "Faturada / A Faturar" e "Mês/Ano / Período (De/Até)" viram `Chips` (mesmas opções, as mesmas dicas ao passar o mouse), os campos usam o padrão do sistema e "Calcular" é o botão principal. A linha "Período: … · …" usa o texto de apoio.
- **Pipeline (OP/OS por técnico, dupla e equipe):** cada grupo é um cartão com `Selo` do tipo (Equipe na cor da marca, Dupla azul, Individual cinza), o total de OP/OS, "N c/ apoio" em âmbar e a comissão em verde.
- **Um cartão por técnico:** cabeçalho com nome, "Incide em", percentual, quantidade de OP/OS, **Base** e **Comissão**; o técnico **já aprovado** fica com o cabeçalho verde e "Aprovado por …"; "Aprovar" é o botão principal. A lista de OP/OS é `acn-tabela` na **linha compacta de 32 px** (com 44 px, as 123 linhas do setembro real ficariam cerca de 1.500 px mais altas: 123 × 12 px), com **OP em verde, OS em azul, APOIO em âmbar, SERRALHERIA na cor da marca e "lote/N" em cinza**; valores à direita e em fonte de números alinhados; a comissão em azul.
- **Histórico:** `acn-tabela`, "Aprovado / Pendente" em `Selo`, busca com os campos e o botão do sistema.
- **Emojis decorativos** tirados dos títulos, botões e do aviso da origem; as cores feitas à mão saem.
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro antes de criar: `acn-com-barra`, `acn-com-resumo`, `acn-com-pipeline`, `acn-pipeline`, `acn-pipe-card` (e `-nome`, `-qtd`, `-apoio`), `acn-com-tec` (e `-cab`, `-id`, `-valores`, `-total`), `acn-aprovado`, `acn-txt-info`, `acn-txt-atencao`. (A `acn-compacta` é a da 12c3.)
- **A entrada "só Comissões"** (`ComissoesTecnicosStandalone`, para quem não tem a aba RH inteira) usa o mesmo quadro e foi testada com um usuário assim.

**Resultado no código (arquivo inteiro):** `style` inline **98 → 2**, cores hex **154 → 69**, `<button>` cru **10 → 0**, 2.484 → 2.462 linhas. **Só no trecho desta fatia:** inline **96 → 0**, hex **85 → 0**, `<button>` **10 → 0**. **O que sobra no arquivo não é tela:** os **2** inline são a largura das barras do gráfico do KPI (vem do dado), há mais **21** `style={campoDestaque(...)}` (destaque de campo alterado, do sistema de auditoria), e os **69 hex** são **53 dentro do HTML das impressões** (papel não acompanha o tema da tela) mais **16 nas constantes de cor do topo** (`STATUS_COR` e a `cor` de `TIPOS_LANCAMENTO`), que **parecem sem uso** — fica para a Etapa 3 (código órfão), com a confirmação do usuário antes de apagar.

**Como foi testado (gravações bloqueadas; a única gravação possível é respondida de mentira dentro do navegador):** leitura **real** (A Faturar de agosto: 6 técnicos e 107 linhas; de setembro: 6 e 123; o intervalo agosto–setembro: 7 e 230; o resto zerado) e leitura **simulada** (ZZ …: lote de 3 veículos, dupla, equipe, apoio, serralheria, técnico sem cadastro, percentual zero, uma OP emitida às 22h30 do último dia, OS de manutenção veicular e não veicular, uma comissão já aprovada e um Histórico com aprovado e pendente).

- **Fotografia comparada** (`snap_rh4.cjs`, igual para a tela velha e a nova): **45 blocos iguais** — real: Faturada e A Faturar × julho a outubro × "todas as origens"/"só Adaptação" (16), intervalo sem datas (com o aviso), intervalo agosto–setembro em A Faturar e em Faturada, o Histórico antes de buscar, buscando hoje e setembro, recolhido e reaberto; simulado: 18 estados (Faturada de setembro com e sem filtro de origem, meses vazios, A Faturar de agosto, intervalo de setembro e **de um dia só (o dia 30)**, voltar ao Mês/Ano, o Histórico de setembro, agosto e outubro, recolhido, as duas abas); e a entrada "só Comissões" (2). **Duas rodadas da tela antiga entre si: iguais; e a primeira passada da tela nova já saiu igual — nenhuma equivalência precisou ser declarada.**
- **Comportamento comparado** (`comport_rh4.cjs`, o que a pessoa vê **e o corpo do que seria gravado**): **10 blocos iguais** — **aprovar** a comissão de um técnico (o corpo gravado inteiro: percentual, base, comissão, 3 OPs e 1 OS no detalhe, quem aprovou) e o cartão passando a "Aprovado"; **erro ao gravar** (o aviso com a mensagem, o botão continua); onde o **"Aprovar" não aparece** (intervalo De/Até e A Faturar); e **quem não tem permissão** de aprovar (nenhum botão, em dois meses, nenhuma gravação). Duas rodadas da tela antiga entre si: iguais.
- **Largura (a lição da 12b2):** com dado real e simulado, a **1400 e a 1100 px as tabelas cabem sem rolar** (1.100 e 800 px; antes 1.104 e 804 — a diferença é a borda do cartão) e a **390 px rolam dentro do quadro**, como antes; a **página nunca rola de lado** (0 px). **O custo é altura:** com o setembro real (123 linhas) o quadro passa de **5.057 para 5.904 px** a 1400 px e de 7.164 para 8.350 px a 1100 px (+17%, já com a linha compacta). Tentei fixar a largura das colunas "Tipo" e "Nº" para alinhar os técnicos entre si e **desisti**: apertava a coluna Cliente e as linhas cresciam 50% — fica como era (cada tabela escolhe a sua).
- **Capturas** em claro, escuro e celular (390 px) do quadro vazio, do cálculo (Faturada de setembro, com todos os tipos de selo), do Histórico e de A Faturar: **0 px de rolagem lateral da página**. Uma correção saiu da captura: o ícone do título do Pipeline ficava numa linha acima do texto.
- **Regressão:** `teste_37` (7.17) 17/17, `teste_36` (recolher) **45/45** (estendi para cobrir também Técnicos, Uniformes e Comissões), `teste_35` 3/3, `teste_34` 4/4, `teste_32` 19/19, `teste_31` 5/5, `teste_30` 7/7, **`teste_24` 28/28 e `teste_25` 20/20**; build ok. **Esses dois últimos precisaram de ajuste:** localizavam os cartões por estilo inline e por botões com emoji, e comparavam com uma fotografia de setembro "A Faturar" tirada de 30/09 com o período errado — troquei os seletores (aceitam os dois jeitos) e **refiz a fotografia de referência com o código da 7.17** (6 técnicos, 123 linhas).

**O que ficou de fora / limites:**

- **A gravação do "Aprovar" não foi feita no banco de verdade** (respondida de mentira no navegador); o corpo que seria gravado foi comparado por inteiro. **O banco real não tem nenhuma comissão aprovada** e **nenhuma NF emitida com responsável apontado**, então a visão "Faturada" do dado real é sempre vazia: os casos de aprovado, apoio, serralheria, lote, dupla e equipe foram exercitados só com dado simulado.
- **As contas de comissão não foram reconferidas por conta independente** (a 7.17 conferiu o **conjunto de OPs** de cada período contra o banco). Nesta fatia a prova é "antes × depois": os mesmos valores em R$ em todos os 45 estados.
- **Achado, não corrigido:** na aba **Histórico**, a mensagem "Nenhum fechamento encontrado para o período." **aparece antes de a pessoa clicar em "Buscar"** (ainda não buscou nada) e a lista só vem depois do clique. Tende a passar a impressão de que não há nada gravado.
- **A impressão** não existe nesta tela (não há gerador de HTML aqui).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12c4 ensinou para a 12d (SAC, 3.025 linhas, 33 gravações):** (1) **ler o código de uma tela que calcula dinheiro achou um defeito de dado (7.17) que a comparação "antes × depois" jamais acharia**, porque os dois lados contam igual — para o SAC, conferir os números contra o banco antes de comparar; (2) **teste antigo escrito com seletor de estilo inline quebra na migração**: adaptar o seletor para aceitar os dois jeitos já na fatia, e **refazer a fotografia guardada** quando um achado mudar o número de propósito; (3) **fixar largura de coluna para alinhar tabelas de cartões diferentes custou altura e não valeu**; (4) para dividir o SAC, usar o mesmo critério do RH: **uma fatia por quadro da página, de cima para baixo, com as gravações juntas na fatia delas**.

#### ✅ 12d1 — SAC: seletor de abas e Chamados NFC

**Feito em:** 01/10/2026. **Por que dividi a 12d em oito:** o SAC é **uma página só, de 3.029 linhas, num componente único**, com três abas (Ordens de Serviço, Chamados NFC, Cadastros) e **18 janelas** (cada uma com seu estado: Nova OS, orçamento, aprovação, reprovação, saída, anexar, fluxo de manutenção veicular, acompanhamento…). Mesmo critério do RH: **uma fatia por quadro da página, de cima para baixo**, cada uma com as gravações dela junto. A **ordem de cima para baixo** é: 12d1 abas + Chamados NFC, 12d2 Cadastros, 12d3 lista de OS, 12d4 "Nova OS", 12d5 janelas de orçamento/aprovação/reprovação/saída/anexar, 12d6 janelas do fluxo veicular, 12d7 novo equipamento/responsável/financeiro/PDF, 12d8 acompanhamento da OS. A **impressão da OS** (`PrintOS`, outro documento) e o **widget da Agenda** (componente à parte) ficam de fora de todas.

**Antes da migração, um achado de comportamento** (Etapa 7.18, commit à parte): a tela dizia "Notas salvas!" mesmo com a gravação recusada. Corrigido **antes** de tirar o "antes" desta fatia.

**O que foi feito** (`SacTab.tsx`, só a parte visual do seletor e dos Chamados NFC; `design.css`; **nenhuma consulta, regra, texto de aviso ou gravação foi mexida**):

- **As três abas** (Ordens de Serviço, Chamados NFC, Cadastros) viram o `Abas` do sistema, com ícone; **no celular os ícones somem** para o nome inteiro caber sem rolar a faixa. Quem carrega os chamados continua sendo o clique em "Chamados NFC".
- **Chamados NFC:** o quadro vira cartão, com o cabeçalho (módulo, título, "N chamado(s) · N aberto(s)"), o filtro de status e o "Carregar" como `Botao`. Cada chamado é um cartão com a **lateral e o selo na cor da família do status** (Aberto vermelho, Em Atendimento âmbar, Concluído verde, Cancelado cinza), telefone e órgão com ícone, a descrição numa caixa suave e os botões **Atender / Concluir** (principal) e **Notas**.
- **A janela de notas** vira a `modal-overlay` do sistema (cabeçalho com "×", corpo, rodapé "Fechar" / "Salvar Notas"); clicar no fundo continua fechando; o texto das notas continua sendo lido do mesmo campo.
- **O cabeçalho do quadro não é `.sec-hdr` de propósito:** o clique global do cabeçalho (`DashboardTab.tsx`) recolhe qualquer cartão, e este quadro **nunca recolheu**.
- **Emojis decorativos** tirados dos botões, títulos e do telefone/órgão; as cores feitas à mão saem.
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro antes de criar: `acn-sac-abas`, `acn-nfc-cab`, `acn-nfc-lista`, `acn-nfc-card` (e `-info`, `-linha1`, `-tel`, `-orgao`, `-desc`, `-data`, `-acoes`) e uma regra de `.acn-modal-cab .modal-title` para título de janela com ícone.

**Resultado no código (arquivo inteiro; as outras fatias ainda não foram migradas):** `style` inline **570 → 527**, cores hex **570 → 511**, `<button>` cru **99 → 89**, `acn-btn` 79 → 79, 3.029 → 2.988 linhas (as contagens usam o mesmo método de hoje; o plano anterior dizia 552 hex). **Só no trecho desta fatia:** inline **43 → 0**, hex **59 → 0**, `<button>` **10 → 0**, 183 → 139 linhas.

**Como foi testado** (gravações bloqueadas; a única gravação, no chamado, respondida de mentira no navegador): o banco real tem **4 chamados (3 Concluído e 1 Em Atendimento; nenhum Aberto nem Cancelado)**, então os outros estados foram **simulados só na leitura, com gente inventada (ZZ …)**: 5 chamados em 4 status, um anônimo, uma descrição de mais de 180 caracteres, notas já preenchidas.

- **Fotografia comparada** (`snap_sac1.cjs`, igual para a tela velha e a nova): **26 blocos iguais** — real: as abas, a lista, cada filtro de status (Aberto e Cancelado voltam vazios), **o filtro que só vale ao clicar em "Carregar"**, a janela de notas aberta e fechada, e as abas Cadastros e Ordens de Serviço de volta; simulado: o mesmo, mais **a janela de notas de cada um dos 5 chamados**. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_sac1.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, hora mascarada): **13 blocos iguais** — abrir a aba (a leitura que ela faz), **Atender**, **Concluir**, abrir as notas, **salvar notas** em chamado Concluído, Cancelado (em branco) e Em Atendimento, o filtro sem e com "Carregar" (as leituras pedidas), e **a gravação recusada** em Atender e em Salvar Notas (o aviso de erro da 7.18). Duas rodadas da tela antiga entre si: iguais.
- **Uma equivalência declarada, por escrito, no comparador** (`compara_sac1.cjs`): a **lista de elementos `.acn-empty`** não é comparada — a mensagem "Nenhum chamado encontrado…" passou a ser um desses elementos (antes era texto solto); **o texto dela continua comparado por inteiro**.
- **Largura (a lição da 12b2):** a 1400, 1100 e 390 px o quadro e os cartões **cabem sem transbordar** e a **página nunca rola de lado** (0 px); a janela de notas tem 460 px (390 px no celular) e **nenhum campo fica fora da caixa**. **Duas coisas pioram em altura:** o cartão de chamado passa de **132 para 144 px** (1400 px) e, no celular, o quadro real de 4 chamados passa de **780 para 993 px**.
- **Capturas** em claro, escuro e celular (390 px) do seletor com o quadro, da janela de notas e da aba Cadastros por trás. Três correções saíram **das capturas**: no celular a aba "Cadastros" ficava cortada (os ícones somem agora); o `Icone` escreve `display:block` direto no elemento, então esconder por CSS pede `!important`; e o ícone do título da janela ficava numa linha acima do texto.
- **Regressão:** `teste_38` (7.18) 9/9, `teste_36` 45/45, `teste_37` 17/17, `teste_20` 24/24, `teste_30` 7/7, `teste_31` 5/5, `teste_32` 19/19; build ok.

**O que ficou de fora / limites:**

- **As outras duas abas e todas as janelas do SAC** (12d2 a 12d8), que continuam com o visual antigo. A faixa de abas já é a nova, mas **a aba "Ordens de Serviço" e a "Cadastros" por baixo dela são as de antes**.
- **Achados já registrados** (Etapa 7.18): "Salvar Notas" troca o atendente (pergunta aberta), o filtro só vale ao clicar em "Carregar" e o "N aberto(s)" conta só o que está carregado.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12d1 ensinou para a 12d2 a 12d8:** (1) **incluir "a gravação recusada" em todo teste de comportamento do SAC** — foi assim que o defeito da 7.18 apareceu; (2) **nunca usar `.sec-hdr` num quadro que não recolhia**: o clique global recolhe sozinho; (3) `Icone` escreve `display:block` direto no elemento (esconder pede `!important`; título com ícone pede `inline-flex`); (4) as janelas do SAC são **`position: fixed` com cabeçalhos coloridos escritos à mão**: usar de uma vez o molde da 12c2 (`modal-overlay` + `acn-modal-cab/corpo/rodape`) e a regra do título; (5) **a tela só tem um estado real** (4 chamados): simular tudo o que o banco ainda não tem, como no RH.

#### ✅ 12d2 — SAC: aba Cadastros (equipamentos, categorias e tipos de serviço)

**Feito em:** 01/10/2026. **Antes da migração, um achado de comportamento** (Etapa 7.20, commit à parte): com a gravação recusada, três das sete gravações desta aba falhavam em silêncio e **perdiam o que a pessoa digitou**. Corrigido **antes** de tirar o "antes" desta fatia. (A 12d2 veio logo depois das respostas **R24** e **R25**, aplicadas à parte nos Chamados NFC.)

**O que foi feito** (`SacTab.tsx`, só a parte visual da aba; `design.css`; **nenhuma consulta, validação, texto ou gravação foi mexida**):

- **As três sub-abas** (Equipamentos, Categorias, Tipos de Serviço) viram o seletor em pílulas do sistema (`Chips`).
- **Cada cadastro** continua sendo um cartão com o título (agora com ícone) e a barra de "novo": campo e **"Adicionar"** como botão principal; **Enter** continua adicionando. Na categoria, o campo, a caixinha "Exibe despesas de campo (Serviço Externo)" e o botão ficam lado a lado e quebram no celular.
- **As tabelas** viram `acn-tabela`: nome em destaque, **status em `Selo`** (Ativo/Ativa verde, Inativo/Inativa cinza), "Despesas de campo: SIM" em `Selo` âmbar com o carrinho, **"Desativar" em botão vermelho suave e "Ativar" em botão comum**, "Editar" com lápis; **a linha de um cadastro desativado fica esmaecida** (menos a categoria que está sendo editada — o antigo esmaecia a linha de edição inteira, e ela parecia desabilitada).
- **Os cartões continuam `.sec-card`/`.sec-hdr`**: o clique global do cabeçalho que recolhe o cartão já valia nesta aba e continua.
- **Emojis decorativos** tirados dos botões e das marcas; as cores feitas à mão saem; o trecho antigo `[...equipamentos, ...supabase && []].map ? … : null` virou um `equipamentos.map` simples (mesmo resultado).
- **Classes novas no `design.css`**, conferidas com `grep` em `src` inteiro antes de criar: `acn-cad-sub`, `acn-cad-barra`, `acn-cad-campo`, `acn-cad-campo-fixo`, `acn-cad-check` e `acn-linha-inativa`.

**Resultado no código (arquivo inteiro; as outras fatias ainda não foram migradas):** `style` inline **527 → 493**, cores hex **511 → 486**, `<button>` cru **89 → 79**, `acn-btn` **79 → 69**, 3.003 → 2.997 linhas. **Só no trecho desta fatia:** inline **34 → 0**, hex **25 → 0**, `<button>` **10 → 0**, `acn-btn` **10 → 0**, 147 → 141 linhas.

**Como foi testado** (gravações bloqueadas; as gravações das três tabelas respondidas de mentira no navegador, e o dado simulado muda como o banco mudaria): o banco real tem **4 equipamentos ativos (e 12 inativos que a tela não lista), 12 categorias e 8 tipos de serviço, todos ativos**; os outros estados foram **simulados só no navegador, com nomes inventados (ZZ …)**: cadastros desativados, categoria que exibe despesas, nome comprido e as três listas **vazias**.

- **Fotografia comparada** (`snap_sac2.cjs`, igual para a tela velha e a nova): **21 blocos iguais** — real: as três sub-abas, a **linha de edição** da categoria e o cancelar; simulado: o mesmo, mais o **campo preenchido, a caixinha marcada** e a edição de uma categoria **desativada**; e as **três listas vazias**. Duas rodadas da tela antiga entre si: iguais. **Nenhuma equivalência precisou ser declarada.**
- **Comportamento comparado** (`comport_sac2.cjs`, o que a pessoa vê **e o corpo do que seria gravado**): **24 cenários iguais** — **adicionar** pelo botão, pelo **Enter** e **vazio** (não grava), nos três cadastros (com o nome aparado e a caixinha da categoria); **desativar e ativar**; **editar** categoria (abrir, **nome vazio**, salvar, **cancelar**); e **a gravação recusada** em cada um (adicionar, editar, desativar). Duas rodadas da tela antiga entre si: iguais.
- **Largura (a lição da 12b2):** a 1400 e a 1100 px as três tabelas **cabem sem rolar** (1.130 e 830 px) e a **página nunca rola de lado** (0 px). **A 390 px a tabela de categorias rola dentro do quadro, como a antiga** (de 445 para 492 px de largura); as outras duas cabem. **O custo é altura:** com os 12 cadastros reais a tabela de categorias passa de **608 para 720 px** (a linha de 44 px do sistema), a de equipamentos de 308 para 348 px e a de tipos de 448 para 524 px.
- **Capturas** em claro, escuro e celular (390 px) das três sub-abas e da linha de edição: **0 px de rolagem lateral da página**. Uma correção saiu da captura: o esmaecimento da linha em edição.
- **Regressão:** `teste_42` (7.20) 9/9, `teste_38` 9/9, `teste_39` (R24) 8/8, `teste_40` (R25) 10/10, `teste_36` 45/45, `teste_37` 17/17, `teste_20` 24/24; build ok.

**O que ficou de fora / limites:**

- **A aba "Ordens de Serviço" e todas as janelas do SAC** (12d3 a 12d8) seguem com o visual antigo.
- **Achados já registrados** (Etapa 7.20): os equipamentos **desativados somem da tela e não dá para reativar** (12 no banco), pergunta aberta.
- **Achado, não corrigido:** quando a tabela de tipos de serviço **vem vazia do banco**, a tela mostra **4 tipos "de mentira"** (Orçamento, Conserto, Troca, Garantia, com código 1 a 4) e a mensagem "Nenhum tipo cadastrado…" **nunca aparece**; desativar um desses 4 não existe no banco (agora mostra o erro da 7.20). Com os 8 tipos reais isso não acontece. **Resposta do usuário em 01/10/2026: a lista está vazia só porque o SAC começou a ser usado de fato hoje e ainda vai ser preenchida — nada a fazer** (ver "Decisões tomadas").
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12d2 ensinou para a 12d3 a 12d8:** (1) **montar a gravação recusada no teste de comportamento antes da migração achou outro defeito de verdade (7.20)**: repetir em toda fatia com gravação; (2) **a fatia sem nenhuma equivalência declarada é possível** quando o texto é mantido palavra por palavra e os elementos de lista vazia já eram `.acn-empty`; (3) **a linha esmaecida de "inativo" pintada à mão também esmaecia a linha em edição**: ao trocar por classe, excluir o estado de edição; (4) o `.sec-card` + `.sec-hdr` do SAC **já recolhe pelo clique global**: manter, sem `no-collapse`.

#### ✅ 12d3 — SAC: aba Ordens de Serviço (cabeçalho, legenda, filtros, tabela e botões de ação)

**Feito em:** 01/10/2026. **Antes da migração, três commits à parte** (cada um com teste e plano): o **apagar do código morto** `PrintOS`/"modal PDF" (autorizado), a **Etapa 7.21** (datas "só dia" um dia antes na lista e no PDF, e o prazo de hoje em vermelho) e a **Etapa 7.22** (as cinco ações da lista que gravam direto seguiam como se tivesse dado certo, e uma mandava WhatsApp). Tudo corrigido **antes** de tirar o "antes" desta fatia.

**O que foi feito** (`SacTab.tsx`, só a parte visual da lista; `design.css`; **nenhuma consulta, regra, texto ou gravação foi mexida**):

- **Cabeçalho:** título com ícone e **"Nova OS" como botão principal** (o quadro continua `.sec-card`/`.sec-hdr`: o clique global que recolhe o cartão já valia e continua).
- **Legenda do fluxo** (Diagnóstico → … → Entregue): cada situação vira **`Selo`** na cor da sua família, com setas desenhadas; o resto do texto, em cinza.
- **Filtros:** a busca, os quatro seletores e o **"Limpar"** (botão do sistema), numa linha que quebra no celular. Os seletores ficaram um pouco mais largos: "Presencial / Remota" aparecia cortado.
- **Tabela** (`acn-tabela acn-densa`): **número da OS em destaque** com a **etiqueta da empresa embaixo, que continua sendo um botão** (ACN verde-água da marca, DETECH azul, "+ empresa" cinza); **Tipo** em texto (a pílula cinza comprida de "Manutenção Preventiva" alargava a coluna); **Atend.** em pílula com ícone (antena = remota, pino = presencial); **Equipamento** em duas linhas com **"sem modelo / sem chassi / sem série" em vermelho com o ícone de alerta**; **prazo atrasado em vermelho**; **KPI** e **valor** alinhados; as **horas cobradas × reais** da remota viram ícone de relógio com seta (▲ verde cobrou mais do que levou, ▼ vermelha), com a dica de sempre; **Status em `Selo`** pela família. **Linha nova** (alteração não vista) fica com a barra amarela; **linha reprovada**, com a barra vermelha e o fundo suave. **Saíram as cores de fundo de "Aprovado" (azul) e "Entregue" (verde)**: o selo já diz.
- **Cor de cada situação** (suposição minha, não confirmada): **pedindo ação ou resposta de alguém = âmbar** (Orç. Enviado, Aguardando Aprovação Cliente, Aguardando Aceite SAC, Aguardando Início, Aguardando CQ, Aguardando Envio Fiscal); **em andamento no laboratório/produção = verde-água da marca** (Orçamento Pronto, Em Execução, Em Provisionamento, Verificação e Orçamento, Em Manutenção); **só aberta/em análise = azul** (Diagnóstico, Aberta, Em Cotação, Aguardando Emissão NF); **tratado = verde** (Aprovado, Concluído, Entregue, Provisionada, Manutenção Concluída, Faturada); **Reprovado = vermelho**. O mapa está em `FAMILIA_STATUS_SAC`; o hexadecimal antigo (`STATUS_COR`) segue valendo só para as opções do filtro e para o **PDF** da OS.
- **Botões de ação** — **escolha do usuário em 01/10/2026 (pergunta clicável), com a lista real medida:** com **tudo à vista e com texto** a lista passava de **1.590 para 2.593 px** de altura a 1400 px de tela (os quatro botões que toda OS tem quebravam em três a cinco linhas). Ficou assim: **à vista, o `Acomp.` e o passo da situação** (Enviar, Aprovar, Entrega, Aceite SAC…), cada um com ícone — **o passo que a OS espera do SAC é o botão cheio, "Recusado/Reprovar" é vermelho vazado, "Resolver Revisão" é vermelho cheio** — e **"Resp.", "Financeiro", "Anexar" e "PDF" no menu ⋯ "Mais ações da OS"** (como no PCP, no Fiscal e na Produção), cada um com uma dica do que faz. **Os textos e o que cada um faz não mudaram**; "Resp." não aparece em OS entregue ou cancelada, como antes. "Aguardando Qualidade/Fiscal" continua em itálico cinza.
- **Emojis decorativos** tirados; as cores feitas à mão saem; **`EtiquetaEmpresaOS`** vira um `Selo` clicável (`COR_EMPRESA` fica só para a Nova OS).
- **Classes novas no `design.css`** (conferidas com `grep` em `src` inteiro antes de criar): `acn-sac-legenda`, `acn-sac-legenda-nota`, `acn-sac-filtros`, `acn-sac-busca`, `acn-sac-id`, `acn-sac-icone-texto`, `acn-sac-revisao`, `acn-sac-horas`, `acn-sac-espera`, `acn-sac-equip`, `acn-sac-valor`.

**Resultado no código (arquivo inteiro; as janelas ainda não foram migradas):** `style` inline **380 → 311**, cores hex **364 → 293**, `<button>` cru **77 → 49**, `acn-btn` **67 → 40**, 2.696 → 2.702 linhas. **Só no trecho desta fatia (ações + lista):** inline **68 → 0**, hex **68 → 0**, `<button>` **27 → 0**, `acn-btn` **27 → 0**, 306 → 300 linhas.

**Como foi testado** (gravações bloqueadas; leitura e gravação da OS respondidas de mentira no navegador; os avisos de WhatsApp **ligados** na simulação para ver se algum sairia): o banco real tem **19 OS em 5 situações** (Diagnóstico, Orçamento Pronto, Aguardando Aceite SAC, Em Provisionamento, Concluído); as demais foram **simuladas só no navegador, com nomes inventados (ZZ …)**: **25 OS, um exemplo de cada situação dos dois fluxos** (laboratório e manutenção veicular), com prazo de ontem e de hoje, sem modelo/chassi/série, revisão pendente, horas cobradas diferentes das reais, OS sem empresa e com ACN/DETECH.

- **Fotografia comparada** (`snap_sac3.cjs`, igual para a tela velha e a nova, texto sem acento): **73 blocos iguais** — real e simulado: a lista aberta, **cada uma das 22 situações no filtro**, os 4 tipos, as 3 avaliações, as 3 empresas, a **busca** com uma e com nenhuma OS, o "Limpar", e a lista **vazia**. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_sac3.cjs`, o que a pessoa vê **e o corpo do que seria gravado**): **70 cenários iguais** — **cada botão de cada situação**, com a gravação **aceita e recusada** (a janela que abre, a pergunta, o aviso, o que seria gravado, o HTML do PDF), o "Nova OS", a **etiqueta da empresa** (cancelar e aceitar, com e sem empresa, e recusada) e o **Reavaliar** (aceito e recusado); **0 erros de console**. Duas rodadas da tela antiga entre si: iguais (uma terceira rodada divergiu — ver "limites").
- **Uma equivalência declarada:** "Resp.", "Financeiro", "Anexar" e "PDF" agora ficam num menu que **só existe aberto**; o teste **abre o menu de cada OS, lê os itens e clica neles** (a lista de botões é comparada por inteiro, na mesma ordem), e o **texto** dessas quatro palavras sai da célula de ações e do texto do quadro, nos dois lados (`compara_sac3.cjs`).
- **Largura (a lição da 12b2), com o dado real:** a 1400, 1366 e 1280 px a tabela **cabe sem rolar** (1.362, 1.328 e 1.242 px); a **1100 px rola dentro do quadro, como a antiga** (1.207 px de tabela contra 1.149 antes, num quadro de 1.062), e a 390 px também (1.207 × 1.151). **A página nunca rola de lado** (0 px) em nenhuma largura. **Altura da lista com as 19 OS a 1400 px: 1.590 → 1.712 px** (+8%: a letra passa de 9–10 px para 13 px); a 1100 px **cai de 3.178 para 2.019 px**. Com o dado simulado (o pior caso, com "Faturada - Aguardando Entrega" e "Aguardando Qualidade" ao lado do botão) a 1366 px a tabela passa 13 px do quadro.
- **Capturas** em claro, escuro e celular (390 px), do real e do simulado, e do **menu ⋯ aberto**: 0 px de rolagem lateral da página. Quatro acertos saíram das capturas: a **cor do prazo atrasado e do KPI não aparecia** (a regra das células da tabela vence a classe quando ela está no `<td>`: a classe vai num `<span>` dentro da célula), "R$ 980,00" quebrava em duas linhas, "ZZ Rádio / Base" quebrava e "Presencial / Remota" aparecia cortado.
- **Regressão:** `teste_46` (7.22) 16/16, `teste_45` (7.21; confere a cor vermelha do prazo atrasado e a **não** vermelha do prazo de hoje) 10/10 e `teste_44` 24/24, `teste_43` 11/11, `teste_42` 9/9, `teste_40` 10/10, `teste_39` 8/8, `teste_38` 9/9, `teste_37` 17/17, `teste_36` 45/45; build ok.

**O que ficou de fora / limites:**

- **Todas as janelas do SAC** (12d4 a 12d7) seguem com o visual antigo — inclusive as que as ações da lista abrem. **As gravações das janelas que ainda ignoram o erro** (Etapa 7.22, "Fora/pendente") entram nas respectivas fatias.
- **O texto dos quatro botões do menu** ficou como era ("Resp.", "Financeiro", "Anexar", "PDF"): num menu "Resp." é curto e a dica explica; trocar para "Alterar responsável" é ajuste de redação, fica a seu critério.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.
- **Uma terceira rodada da tela antiga divergiu** nos últimos fluxos (etiqueta da empresa e Reavaliar, mais 2 erros de console) e **não achei a causa**; suspeito do aviso de WhatsApp, que é **assíncrono** (lê a configuração antes de enviar) e às vezes cai no botão seguinte — por isso o teste espera 2,2 s depois de cada clique. As outras duas rodadas ficaram iguais entre si **e iguais à tela nova** (a nova foi comparada com as duas). Se a divergência voltar numa fatia futura, o suspeito é o teste, não a migração.

**O que a 12d3 ensinou para a 12d4 a 12d7:** (1) **o que toda linha tem, e que o sistema já resolve num menu ⋯, vai para o menu — mas medir antes com o dado real**: a lista com tudo à vista ficou 60% mais alta, e foi essa medida que levou a pergunta ao usuário; (2) **classe de cor no `<td>` não vale**: a regra das células da tabela é mais forte; colocar a classe num `<span>` dentro; (3) **pílula cinza para texto comum alarga a coluna** (o "Tipo" do SAC): reservar `Selo` para status; (4) **o teste precisa saber abrir o menu** (`abreMenu`/`clicaBotao` no `lib_sac3.cjs`): vale para as janelas, que também têm botões em menu; (5) **o aviso de WhatsApp assíncrono** pede espera de 2 s depois de cada clique no teste de comportamento.

#### ✅ 12d4 — SAC: janela "Nova OS"

**Feito em:** 01/10/2026. **Antes da migração, duas etapas à parte** (cada uma com teste e plano; achadas ao montar o teste de comportamento): a **Etapa 7.23** (defeito obrigatório, o defeito na demanda do Laboratório, foto/documento que não sobe, demanda recusada) e a **Etapa 7.24** (o documento de uma abertura cancelada ia junto da OS seguinte). Tudo corrigido **antes** de tirar o "antes" desta fatia.

**O que foi feito** (`SacTab.tsx`, só a parte visual da janela; `design.css`; **nenhuma consulta, validação, texto, ordem de campo ou gravação foi mexida**):

- **Moldura:** a mesma das janelas do RH — cabeçalho com o título e o ícone, **✕ de fechar** (botão do sistema), corpo que rola e **rodapé fixo** com "ABRIR OS" (botão principal, à direita) e "Cancelar". Continua fechando **só** pelo ✕ ou pelo Cancelar (clicar fora não fecha, como antes). A janela passou de 700 para 760 px de largura.
- **Cada bloco virou um quadro** com o título em letra pequena: Classificação, Dados do Equipamento, Observações Gerais, Dados do Cliente, Prazos, Checklist de Acessórios, Fotos e Arquivos de Entrada, Dados de Faturamento e Vínculo Comercial/CRM. **Os que tinham cor própria mantêm uma cor, agora do sistema:** Despesas de Campo âmbar, Manutenção Veicular azul (era vermelho: não é um erro) e Valores Financeiros verde.
- **"OS de Veículo / Manutenção Veicular"** continua uma caixinha numa pílula, que se acende quando marcada; **ACN/DETECH** vira o seletor em pílulas do sistema (`Chips`); **Presencial/Remota** são pílulas com a caixa de opção de verdade (acessível pelo teclado) e ícone; o **"+ novo"** do tipo de equipamento é um botão pequeno ao lado do rótulo.
- **Equipamentos:** com mais de uma unidade, cada uma num cartão com o número em pílula ("#2 — Equipamento 2 de 3"). **Acessórios** viram etiquetas com caixinha e um × em botão. **Faixas de informação** ("A OS será encaminhada…" / "Garantia é aprovada automaticamente…") usam a `Faixa` do sistema. **A lista de oportunidades do CRM** usa as classes de sugestão já criadas na 12b3; o botão "Escolher arquivos" do navegador ganhou a cara dos botões do sistema.
- **Mantido de propósito, sem tocar:** o campo **"Nome do Cliente"** (`ClienteAutocomplete`, com a lupa e a janela "Buscar no cadastro") e o campo **Observações** (`MencaoTextarea`) são **componentes compartilhados** com outras telas e **ficam com o visual antigo**; o botão "Add" dos acessórios continua com esse texto (para a fotografia não mudar).
- **Emojis decorativos** tirados dos títulos e botões; as cores feitas à mão saem.
- **Classes novas no `design.css`** (conferidas com `grep` em `src` inteiro antes de criar): `acn-sac-nova`, `acn-sac-opcao`, `acn-sac-avaliacao`, `acn-sac-unid`, `acn-sac-unid-cab`, `acn-sac-add`, `acn-sac-acess`, `acn-sac-arquivos`, `acn-sac-contagem`, `acn-sac-dobro`, `acn-sac-qtd`, `acn-sac-equip-campo`, `acn-sac-valor-campo`, `acn-sac-total`, `acn-sac-rotulo-acao`, `acn-sac-crm-escolhido`, `acn-sac-crm-item`, `acn-sac-crm-buscando` e `acn-sac-rodape`.

**Resultado no código (arquivo inteiro; as outras janelas ainda não foram migradas):** `style` inline **311 → 197**, cores hex **293 → 232**, `<button>` cru **49 → 41**, `acn-btn` **40 → 37**, 2.717 → 2.688 linhas. **Só no trecho desta fatia:** inline **114 → 0**, hex **61 → 0**, `<button>` **8 → 0**, `acn-btn` **3 → 0**, 407 → 378 linhas.

**Como foi testado** (gravações bloqueadas; leitura e gravação respondidas de mentira no navegador; nada chega ao banco): os cadastros e clientes foram **simulados com nomes inventados (ZZ …)** para a fotografia não depender do banco (que muda todo dia); as fotos e documentos foram **anexados de verdade pela janela** (arquivos de teste).

- **Fotografia comparada** (`snap_sac4.cjs`, igual para a tela velha e a nova: texto sem acento, cada campo com rótulo/tipo/valor/opções, botões): **38 blocos iguais** — a janela aberta; ACN/DETECH; Garantia e Troca; OS de veículo (presencial, remota, com Engenharia); a categoria **Serviço Externo** (com as despesas e o total), **Manutenção Veicular** (o chassi no lugar do nº de série) e uma comum; **três equipamentos** (e voltar a um); acessórios (dois, desmarcar, remover); **cliente** (sugestões, escolhido, editado depois, pessoa física); **CRM** (sugestões, escolhido, removido); arquivos escolhidos; faturamento, financeiro e prazo; observações; "Buscar no cadastro" e "+ novo" equipamento (as janelas que abrem); as **quatro validações**; fechar pelo ✕ e pelo Cancelar e **reabrir** (o formulário volta vazio); e a **abertura vinda do CRM**, que já abre preenchida. Duas rodadas da tela antiga entre si: iguais.
- **Comportamento comparado** (`comport_sac4.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, hora mascarada): **26 cenários iguais** — as 4 validações; OS de laboratório mínima e **completa** (todos os campos, acessórios, faturamento, financeiro e CRM); garantia; troca; **três equipamentos**; veicular **presencial com Engenharia**, **remota** e **pela categoria**; serviço externo com despesas; **cliente escolhido do cadastro**; foto e documento; **cinco gravações recusadas** (a OS, a demanda do Laboratório, a da Engenharia, a foto e o documento); fechar pelo ✕ e pelo Cancelar e reabrir; e a abertura vinda do CRM até gravar. **0 erros de console.** Duas rodadas da tela antiga entre si: iguais.
- **Uma equivalência declarada:** a letra **"ℹ"** do emoji da faixa de informação (o texto normalizado não a remove) saiu do texto, nos dois lados — virou o ícone da `Faixa`.
- **Tamanho:** a janela fica **60 px mais larga** (700 → 760 px) e, no celular, ocupa a largura toda como antes; **sem nenhuma rolagem lateral** a 1400, 1100 e 390 px (página: 0 px). **O conteúdo da janela vazia** passa de **1.517 para 1.528 px** de altura no computador (+0,7%) e a cheia (veículo + serviço externo + 3 equipamentos + acessório + CRM) de **2.146 para 2.165 px**. **No celular (390 px) cresce: de 1.733 para 2.033 px (+17%) vazia e de 2.416 para 2.886 px (+19%) cheia** — os campos que antes ficavam três ou quatro por linha, espremidos, agora ficam **dois por linha** e os maiores ocupam a linha.
- **Capturas** em claro, escuro e celular, da janela vazia, cheia e com a lista do CRM aberta e o aviso de validação: 0 px de rolagem lateral da página. Acertos que saíram das capturas: o "+ novo" caía para baixo do rótulo e empurrava o campo, o celular espremia três colunas, e a largura dos campos era vencida pela regra geral de `.form-group` (especificidade).
- **Regressão:** `teste_47` (7.23) 22/22, `teste_48` (7.24) 7/7, `teste_46` 16/16, `teste_45` 10/10, `teste_44` 24/24, `teste_43` 11/11, `teste_42` 9/9, `teste_40` 10/10, `teste_39` 8/8, `teste_38` 9/9; a **lista de OS** (`comport_sac3`, que abre a janela "Nova OS") continua com **70 cenários iguais**; build ok.

**O que ficou de fora / limites:**

- **`ClienteAutocomplete` e `MencaoTextarea`** (compartilhados) seguem com o visual antigo, e a janela **"Buscar no cadastro"** e a de **"+ novo equipamento"** que ela abre também (a de equipamento é a **12d7**).
- **O clique fora da janela não fecha** (como antes): só o ✕ e o Cancelar.
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.
- A fotografia da janela "Buscar no cadastro" lê a lista de clientes do banco **real**; o teste espera o "Carregando…" terminar (sem isso, a fotografia dependia da pressa).

**O que a 12d4 ensinou para a 12d5 a 12d7:** (1) **montar o teste de comportamento ANTES achou mais três defeitos de verdade** (7.23 e 7.24): repetir o roteiro "gravação recusada + cancelar e abrir de novo" em toda janela; (2) **as classes de largura do `.form-group` perdem para a regra geral do `responsivo.css`/`DashboardTab`**: usar `html body .acn-…-janela .form-row > .form-group.classe`; (3) **componentes compartilhados com estilo próprio** (`ClienteAutocomplete`, `MencaoTextarea`) **não entram numa fatia de tela**: ficam para a Etapa 13; (4) **o rodapé "principal à direita" com o botão principal primeiro no HTML** (`flex-direction: row-reverse`) mantém a ordem que o teste lê; (5) **o teste agora tem um ajudante da janela** (`nova4.cjs`: preencher por rótulo, anexar arquivo, clicar texto) que serve às janelas seguintes.

#### ✅ 12d5 — SAC: janelas de Orçamento, Aprovação, Reprovação, Entrega e Anexar

**Feito em:** 01/10/2026. **Antes da migração, a Etapa 7.27** (gravação e envio de arquivo recusados seguiam como se tivesse dado certo — assinatura/foto de saída que não subia era descartada e a OS ficava "Aprovada"/"Entregue" sem elas), corrigida **antes** do "antes" desta fatia.

**O que foi feito** (`SacTab.tsx`, só a parte visual das janelas; `design.css`; **nenhuma validação, texto, ordem de campo ou gravação foi mexida**):

- **As cinco janelas** — **Enviar Orçamento**, **Aprovação de Orçamento**, **Reprovação**, **Entrega** (OS do laboratório) e **Anexar Arquivos** — passam para a moldura das janelas do RH: cabeçalho com o título e o ícone, corpo que rola e **rodapé fixo com o botão principal à direita** (e o Cancelar/Fechar à esquerda). Continuam **sem o ✕** e sem fechar ao clicar fora, como antes: só pelo Cancelar/Fechar.
- **Botões pela importância:** "ENVIAR AO CLIENTE", "CONFIRMAR APROVAÇÃO" e "CONFIRMAR ENTREGA" são o botão principal; **"REPROVAR" (na janela de aprovação) é vermelho vazado**; **"CONFIRMAR REPROVAÇÃO" é vermelho cheio**. Os textos são os de antes.
- **Faixas do sistema:** o **"Diagnóstico do Lab"** (azul) e o resumo **"Valor / Condições"** da aprovação (verde) usam a `Faixa`.
- **O quadro de assinatura** (`SignCanvas`, usado só pela aprovação e pela entrega) ganha botões do sistema — "Limpar" e "Confirmar Assinatura", **mesmos textos e mesma ordem** —, borda tracejada e **fundo branco de papel nos dois modos** (a tinta é escura); a assinatura já confirmada aparece em miniatura com o "Limpar" embaixo. **Mudança pequena que não existia:** o quadro passa a ter `touch-action: none`, para desenhar a assinatura **com o dedo no celular não rolar a página**.
- **Anexar:** os **arquivos já anexados** viram miniaturas (imagem) e "fichas" com ícone (documentos) num quadro; a área de envio continua tracejada, com o contador "N arquivo(s) selecionado(s)" em verde; o botão "Escolher arquivos" do navegador ganhou a cara dos botões do sistema.
- **Larguras:** Orçamento e Reprovação passam de 420/400 para **460 px**, Anexar de 480 para 460, Aprovação e Entrega de 520 para **500** (o molde do RH tem dois tamanhos).
- **Emojis decorativos** tirados dos títulos e botões; as cores feitas à mão saem.
- **Classes novas no `design.css`** (conferidas com `grep` em `src` inteiro antes de criar): `acn-sac-jan`, `acn-sac-assinar`, `acn-sac-canvas`, `acn-sac-assinar-acoes`, `acn-sac-assinatura`, `acn-sac-miniatura`, `acn-sac-anexo-doc` e `acn-sac-envio`.

**Resultado no código (arquivo inteiro; as janelas do fluxo veicular e as últimas ainda não foram migradas):** `style` inline **197 → 143**, cores hex **232 → 199**, `<button>` cru **41 → 26**, `acn-btn` **37 → 22**, 2.707 → 2.746 linhas. **Só no trecho desta fatia:** inline **54 → 0**, hex **33 → 0**, `<button>` **15 → 0**, `acn-btn` **15 → 0**, 180 → 219 linhas (o molde com cabeçalho/corpo/rodapé tem mais elementos, mas sem nenhum estilo escrito à mão).

**Como foi testado** (gravações bloqueadas; leitura e gravação respondidas de mentira no navegador, com os avisos de WhatsApp **ligados**; assinatura **desenhada no quadro de verdade** e arquivos **anexados pela janela**; OS inventadas, ZZ …):

- **Fotografia comparada** (`snap_sac5.cjs`, igual para a tela velha e a nova: texto sem acento, campos com rótulo/valor, botões, imagens): **24 blocos iguais** — cada janela aberta; as **validações** (sem valor, sem nome, sem assinatura, sem motivo); a **assinatura desenhada, confirmada e limpa**; o botão REPROVAR da aprovação levando à reprovação; foto de saída escolhida; **anexos já existentes** (miniatura e documento) e arquivo escolhido; e fechar cada janela. Duas rodadas da tela antiga entre si: iguais. **Nenhuma equivalência precisou ser declarada.**
- **Comportamento comparado** (`comport_sac5.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, hora e nome do arquivo mascarados): **29 cenários iguais** — cada janela com a gravação aceita; as validações; aprovação **sem a data prevista**; reprovação **só com o motivo**; entrega **com e sem foto**; e **todas as falhas da 7.27** (a gravação da OS recusada, a assinatura recusada, a foto recusada com a assinatura já enviada, a demanda do Laboratório recusada, o arquivo recusado). **0 erros de console.** Duas rodadas da tela antiga entre si: iguais.
- **Tamanho (1400 e 1100 px iguais; 390 px):** a janela fica **entre 1% mais baixa e 11% mais alta** (aprovação com o quadro de assinatura **468 → 493 px**, assinada **411 → 457**, entrega **407 → 432**, reprovação **333 → 357**, anexar **323 → 351**, orçamento **356 → 353**; no celular o orçamento vai de **356 para 395 px**), **sem nenhuma rolagem lateral** em nenhuma largura (página: 0 px).
- **Capturas** em claro, escuro e celular das cinco janelas e da assinatura desenhada: 0 px de rolagem lateral da página. **Um acerto saiu da captura:** o botão "Escolher arquivos" do navegador ficou com a cara do sistema também nesta janela.
- **Regressão:** `teste_52` (7.27) 22/22 (a verificação de "anexar" passou a contar também os 2 anexos que a OS de exemplo já tem), `teste_46` 16/16, `teste_47` 22/22, `teste_48` 7/7, `teste_45` 10/10, `teste_44` 24/24, `teste_43` 11/11, `teste_42` 9/9, `teste_40` 10/10, `teste_39` 8/8, `teste_38` 9/9; build ok. **A fotografia da lista de OS (12d3) tem 7 blocos diferentes só porque as OS de exemplo têm prazos "a partir de hoje" e o dia virou (de 01 para 02/10): não é da tela.**

**O que ficou de fora / limites:**

- **As janelas do fluxo de manutenção veicular** — **aprovação de cotação** e **entrega do veículo**, que estão no meio desse trecho do arquivo, itens da cotação, aceite, rejeição, edição do orçamento, envio ao Fiscal — **seguem com o visual antigo** (**12d6**), assim como as de novo equipamento, responsável e financeiro (**12d7**).
- Em **celular**, o botão flutuante do chat cobre parte do botão principal do rodapé das janelas (já era assim; vale para o sistema todo).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12d5 ensinou para a 12d6 e a 12d7:** (1) **o ajudante do teste procura o campo pelo rótulo** (o controle ligado a ele, o irmão logo depois ou o do mesmo grupo), então vale para as janelas antigas, que não usam grupos — `janelas5.cjs`; (2) **`.form-group` tem `flex: 1` por padrão**: dentro do corpo da janela (coluna) usar `flex: none`; (3) **o nome do arquivo da assinatura tem a hora no nome** (`assinatura_<hora>.png`): mascarar no teste de comportamento; (4) **a regra "assinatura ou foto que não sobe impede registrar"** (7.27) vale para as janelas veiculares também.

#### ✅ 12d6 — SAC: janelas do fluxo de manutenção veicular

**Feito em:** 02/10/2026. **Antes da migração, a Etapa 7.28** (gravação recusada seguia como se tivesse dado certo nas seis janelas), corrigida **antes** do "antes" desta fatia.

**O que foi feito** (`SacTab.tsx`, só a parte visual das janelas; `design.css`; **nenhuma validação, texto, ordem de campo ou gravação foi mexida**):

- **As seis janelas** — **Entrega de Veículo**, **Aprovação de Cotação**, **Itens da Cotação**, **Enviar para Fiscal**, **Orçamento da Produção** (ver e editar; também serve ao "resolver revisão" e ao "renegociar") e **Aceite SAC** — passam para a moldura das janelas do RH: cabeçalho com o título e o ícone, corpo que rola e **rodapé fixo com o botão principal à direita** (Cancelar/Fechar à esquerda). Continuam **sem o ✕**, como antes; **só a janela do Orçamento da Produção fecha ao clicar fora**, como já era.
- **Tabelas de itens** (Itens da Cotação, Enviar para Fiscal e as duas do Orçamento) passam para a tabela do guia (`acn-tabela`, versão densa), com a linha **TOTAL** em cinza do sistema (era verde) e o **×** de remover virou botão discreto de ícone com nome ("Remover item"), na mesma posição e com a mesma ação. As colunas mantêm as larguras de antes (código, quantidade e valores).
- **Orçamento da Produção:** as abas **Visualizar / Editar** viram os botões de escolha do sistema (`Chips`), com a **mesma lógica** — ao trocar de "Visualizar" para "Editar" o orçamento é copiado para a edição, como antes. O **"Total atual"** vira selo verde.
- **Faixas do sistema:** o quadro verde com **Cliente / Veículo** (Entrega) e **Cliente / Valor** (Aprovação), o aviso âmbar do **Fiscal** e do **"Editar o orçamento não altera a aprovação"** e o **"Confirme se o cliente aceitou esta data"** do Aceite usam a `Faixa`. A **data definida pela Produção** (Aceite) e as **Horas Cobradas** (Itens) viram quadros de cor suave.
- **Botões pela importância:** "CONFIRMAR ENTREGA", "CONFIRMAR APROVAÇÃO", "SALVAR ITENS", "ENVIAR PARA FISCAL", "SALVAR ALTERAÇÕES" e **"CLIENTE CONFIRMOU"** são o botão principal; **"NÃO CONFIRMOU" é vermelho vazado**. Os textos são os de antes (sem o emoji).
- **Larguras:** Entrega (400), Aprovação (420) e Aceite (440) passam para **460 px**; as quatro com tabela continuam em **980 px**.
- **Emojis decorativos** tirados dos títulos e botões; as cores feitas à mão saem.
- **Classes novas no `design.css`** (conferidas com `grep` no projeto antes de criar): `acn-sac-jan-larga`, `acn-sac-col-cod`, `acn-sac-col-qtd`, `acn-sac-col-valor`, `acn-sac-col-x`, `acn-sac-col-serie`, `acn-sac-in-centro`, `acn-sac-in-dir`, `acn-sac-tab-itens`, `acn-sac-horas-campo` e `acn-sac-data-grande`.

**Resultado no código (arquivo inteiro; restam as janelas de novo equipamento, responsável, financeiro e o acompanhamento):** `style` inline **143 → 20**, cores hex **199 → 117**, `<button>` cru **26 → 6**, `acn-btn` **22 → 6**, 2.756 → 2.793 linhas. **Só no trecho desta fatia:** inline **123 → 0**, hex **82 → 0**, `<button>` **20 → 0**, `acn-btn` **16 → 0**, 318 → 355 linhas.

**Como foi testado** (gravações bloqueadas; leitura e gravação respondidas de mentira no navegador, com os avisos de WhatsApp **ligados**; OS inventadas, ZZ …):

- **Fotografia comparada** (`snap_sac6.cjs`, igual para a tela velha e a nova: texto sem acento, campos com rótulo/valor, botões): **30 blocos iguais** — cada janela aberta; os campos digitados; **linha acrescentada e linha removida** (Itens e Orçamento); a **troca Visualizar ↔ Editar** nos dois sentidos; as **validações** (sem nome, sem itens); a OS **sem veículo na ficha** (Entrega); **clicar fora** (só o Orçamento fecha) e **Fechar/Cancelar** em cada janela. Duas rodadas da tela antiga entre si: iguais. **Duas equivalências declaradas** (as únicas): (1) a tela antiga **colava** o "Cliente ZZ 13" ao selo "Total atual" sem espaço, a nova tem o espaço; (2) o **"ℹ"** do aviso do Aceite virou o ícone da faixa.
- **Comportamento comparado** (`comport_sac6.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, hora mascarada): **28 cenários iguais** — Itens salvos **como estão**, **editados com linha nova**, **sem nenhum item** e **com as horas em branco**; Aprovação de Cotação **aceita** e **sem nome**; Orçamento da Produção **editado**, **vindo do "Visualizar"**, **sem itens**, **resolver revisão** e **renegociar**; Aceite **confirmou**, **não confirmou** (com a pergunta cancelada e confirmada); Fiscal **com e sem nº de série**; Entrega **faturada**, **manutenção concluída** e **sem nome**; e **toda gravação recusada da 7.28**. **0 erros de console** nas duas telas. Duas rodadas da tela antiga entre si: iguais.
- **Tamanho (1400 e 1100 px iguais):** Itens **980×392 → 980×467** (1 item) e **521 → 602** (4 itens); Aprovação **420×239 → 460×257**; Orçamento ver **287 → 334** e editar **379 → 424**; Aceite **440×281 → 460×306**; Fiscal **269 → 294**; Entrega **400×239 → 460×257**. **No celular (390 px):** Itens **426 → 484** e **555 → 619**, Orçamento ver **345 → 334** e editar **414 → 443**, Aprovação **239 → 257**, Fiscal **307 → 332**, Entrega **239 → 257**, Aceite **281 → 346** (os três botões do rodapé quebram em duas linhas em vez de sair da janela). **Rolagem lateral da página: 0 px** em todas as larguras.
- **Capturas** em claro, escuro e celular das seis janelas (e o Orçamento nos dois modos). **Três acertos saíram da medição e das capturas:** a janela larga saía com 760 px porque o sistema limita toda janela a 760 px (`max-width`) — a regra nova libera até 980; o rodapé do Aceite no celular tinha um botão fora da janela (passou a quebrar linha); e o ícone do relógio das Horas Cobradas ficava acima do texto.
- **Regressão:** `teste_54` (7.28) 17/17, `teste_53` 59/59, `teste_52` 22/22, `teste_51` 9/9, `teste_50` 5/5, `teste_49` 18/18, `teste_48` 7/7, `teste_47` 22/22, `teste_46` 16/16; build ok.

**O que ficou de fora / limites:**

- **No celular, Itens da Cotação e Orçamento (editar) rolam para o lado dentro da janela** (a tabela tem 520 px de largura mínima, para os campos de código, quantidade e valor continuarem legíveis). **Itens já rolava antes; o Orçamento (editar) antes não rolava.** A página em si não rola.
- **Comportamentos antigos que ficam como estão** (não eram desta fatia): "Itens da Cotação" **salva a lista vazia sem avisar**; "Enviar para Fiscal" **não exige o nº de série** (decisão do usuário); o **"Total atual"** do Orçamento só aparece quando a OS tem valor.
- **Novo equipamento, responsável e financeiro** (**12d7**, feita em seguida) seguiam com o visual antigo. A janela de **acompanhamento da OS** (`OplAcompModal.tsx`) é um componente **compartilhado** e fica para a Etapa 13 (a 12d8 foi cancelada).
- Em **celular**, o botão flutuante do chat cobre parte do botão principal do rodapé (já era assim; vale para o sistema todo).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12d6 ensinou para a 12d7:** (1) **toda janela do sistema tem `max-width: 760px` por padrão** (`DashboardTab`): janela mais larga precisa dizer o `max-width` no CSS, não só o `width`; (2) **rodapé com três botões precisa de `flex-wrap`** no celular; (3) **a medição de "controle fora da janela" ignora tabela que rola dentro da janela** (`.acn-rolagem`), senão acusa botões que estão ao alcance da rolagem (`mede_sac6.cjs`); (4) **etiqueta com ícone dentro de quadro** precisa de `display: flex` na etiqueta; (5) o teste de comportamento já traz "gravação recusada" para cada janela (7.28), então a 12d7 só repete o roteiro.

#### ✅ 12d7 — SAC: janelas de Novo equipamento, Responsável e Valores Financeiros

**Feito em:** 02/10/2026. **Nenhum defeito funcional novo** apareceu ao montar o teste de comportamento (o roteiro da 7.18/7.20/7.22/7.23/7.27/7.28 foi repetido): as três gravações **já conferiam o erro do banco**, avisam e deixam a janela aberta com o que a pessoa digitou. Por isso não houve etapa 7.x antes desta.

**O que foi feito** (`SacTab.tsx`, só a parte visual das janelas; `design.css`; **nenhuma validação, texto, ordem de campo ou gravação foi mexida**):

- **As três janelas** — **Novo Tipo de Equipamento** (aberta por cima da "Nova OS", pelo "+ novo" do campo Tipo de Equipamento), **Responsável** (item "Resp." do menu ⋯ da OS) e **Valores Financeiros** (item "Financeiro" do menu ⋯) — passam para a moldura das janelas do RH: cabeçalho com o título e o ícone, corpo e **rodapé fixo com o botão principal à direita**. Continuam **sem o ✕** e sem fechar ao clicar fora, como antes.
- **Botões:** "SALVAR" (equipamento e responsável) e "Salvar" (financeiro) são o botão principal; "Cancelar" ao lado. **No financeiro o Cancelar já vinha antes do Salvar no HTML:** a ordem se mantém e o rodapé é o comum (Salvar fica à direita do mesmo jeito); nas outras duas o principal vem primeiro no HTML, como antes.
- **Campos:** o nome do equipamento, o valor total, a mão de obra e a data de faturamento passam a ser grupos com rótulo; mesmos limites (`min 0`, `step 0,01`) e o mesmo "0,00" de exemplo.
- **O campo do colaborador** (`ColaboradorSelect`, **componente compartilhado**) **não foi mexido**: ele traz a letra, a borda e o **fundo branco escritos dentro do próprio elemento**. A janela só o alinha aos demais campos com uma classe (`acn-sac-colab`) que sobrepõe esses valores — resultado: **letra de 11 para 13 px, e a borda e o fundo seguem as cores do sistema** nos dois modos (conferido por captura).
- **Larguras:** 360 / 380 / 420 px passam para **460 px** (o molde do RH). Emojis dos títulos e botões saem; as cores feitas à mão saem.
- **Classe nova no `design.css`:** `acn-sac-colab` (conferida com `grep` no projeto antes de criar).

**Resultado no código (arquivo inteiro):** `style` inline **20 → 1**, cores hex **117 → 110**, `<button>` cru **6 → 0**, `acn-btn` **6 → 0**, 2.793 → 2.814 linhas. **Só no trecho desta fatia:** inline **19 → 0**, hex **7 → 0**, `<button>` **6 → 0**, `acn-btn` **6 → 0**, 66 → 87 linhas. **Sobra no `SacTab.tsx`:** 1 `style` (o recuo da aba) e as cores hex das constantes do topo e do **HTML do PDF/impressão da OS** (`gerarPdfOS`, outro documento — segue a regra da 12c3: o HTML impresso fica como está).

**Como foi testado** (gravações bloqueadas; leitura e gravação respondidas de mentira no navegador, com os avisos de WhatsApp **ligados**; OS e colaboradores inventados, ZZ …):

- **Fotografia comparada** (`snap_sac7.cjs`, igual para a tela velha e a nova: texto sem acento, campos com rótulo/valor, **opções do campo de escolha**, botões): **18 blocos iguais** — as três janelas abertas; nome digitado; **salvar sem nome**; **reabrir depois de cancelar**; equipamento salvo (e a "Nova OS" que fica por baixo); responsável escolhido, **vazio** e de outra OS; financeiro vazio, **com a data já gravada** e digitado; e o campo do responsável **com o RH sem ninguém cadastrado** (vira texto livre). Duas rodadas da tela antiga entre si: iguais. **Nenhuma equivalência precisou ser declarada.**
- **Comportamento comparado** (`comport_sac7.cjs`, o que a pessoa vê **e o corpo do que seria gravado**, hora mascarada): **22 cenários iguais** — equipamento **com espaços nas pontas** (grava sem eles), por **Enter**, **sem nome** e **só com espaços** (não faz nada, sem aviso), **recusado** pelo botão e pelo Enter, cancelar; responsável **outro**, **o mesmo** (só a troca de nome grava no histórico de alterações), **vazio** ("Informe o responsável."), de outra OS, **recusado** e cancelar; financeiro com **tudo**, **só o valor total**, **só a mão de obra**, **reabrindo a data antiga**, **limpando a data**, **tudo vazio** (grava vazio), **zeros** (grava 0), **recusado** e cancelar. **0 erros de console** nas duas telas. Duas rodadas da tela antiga entre si: iguais.
- **Tamanho (1400 e 1100 px iguais):** Novo equipamento **360×169 → 460×189**, Responsável **380×203 → 460×220**, Valores Financeiros **420×302 → 460×318**. **No celular (390 px)** a janela ocupa a largura toda, com **169 → 189, 203 → 220 e 302 → 318 px de altura**. **Sem rolagem lateral** em nenhuma largura (página: 0 px) e nenhum controle fora da janela.
- **Capturas** em claro, escuro e celular das três janelas (a de equipamento por cima da "Nova OS").
- **Regressão:** `teste_54` 17/17, `teste_52` 22/22, `teste_51` 9/9, `teste_48` 7/7, `teste_47` 22/22, `teste_46` 16/16 e o comportamento da **12d6 refeito: 28/28 iguais ao "antes"**; build ok.

**O que ficou de fora / limites:**

- **Comportamentos de antes que ficam como estão** (não eram desta fatia): o **"Cancelar" do novo equipamento guarda o texto digitado** (ao abrir de novo ele reaparece); **nome vazio ou só espaços não avisa nada**. **Resolvidos logo depois, na Etapa 7.29 (pedido do usuário):** o financeiro **não gravava no histórico de alterações** (o responsável gravava) e uma OS com **valor 0 gravado** virava **vazio** ao abrir e salvar a janela.
- **A janela de acompanhamento da OS** (`OplAcompModal.tsx`) é um **componente compartilhado por várias telas** (CRM, Compras, Logística, Produção, SAC e o `AcnTabShared.tsx`): **não é fatia do SAC** (a 12d8 foi cancelada) e entra na Etapa 13, junto do `ColaboradorSelect`, do `ClienteAutocomplete` e do `MencaoTextarea`.
- Em **celular**, o botão flutuante do chat cobre parte do botão principal do rodapé (já era assim; vale para o sistema todo).
- A comparação não vê **proporções e cores**: isso foi conferido por captura nos três modos.

**O que a 12d7 ensinou para a Etapa 13:** (1) **a escrita simulada do teste só conhecia a tabela de OS** — gravações em outras tabelas (equipamento, histórico de alterações) eram abortadas e pareciam falha do sistema: `sim7.cjs` estende a simulação, e todo teste novo que grava em tabela nova deve começar por aí; (2) **componente compartilhado com estilo dentro do próprio elemento só se alinha com `!important` no escopo da janela** — a troca de verdade é da Etapa 13; (3) **a ordem dos botões no HTML é o que o teste lê**: quando o Cancelar vinha antes, usa-se o rodapé comum; quando o principal vinha primeiro, o `row-reverse` do `acn-sac-rodape`.

### ⬜ Etapa 13 — Aposentar `TonsVisuais.ts` e o dark mode hex-a-hex — **bloqueada** (medido em 02/10/2026)

**Ponto de partida medido em 02/10/2026** (só leitura; contagem em `src/*.ts*` de `style={`, cores `#rrggbb`/`#rgb`, `<button`, `acn-btn` e usos dos componentes do sistema — `Botao`, `Selo`, `Faixa`, `Chips`, `Abas`, `MenuAcoes`, `CabecalhoTela`):

- **O sistema todo:** 80.133 linhas, **8.019 `style` inline, 8.291 cores hex, 1.200 `<button>` crus e 497 `acn-btn`**; só **441 usos** dos componentes do sistema (112 deles no `SacTab` e 65 no `RHTab`).
- **O que a Etapa 12 já cobriu** (SAC, RH, Logística, Relatórios, mais a Fiscal da Etapa 11) está limpo: `SacTab` 1 inline, `RHTab` 23, `FiscalTab` 16.
- **O que falta:** **67 arquivos concentram 7.781 dos 8.019 `style` inline (97%)**. Os maiores: **CRM** (4.926 linhas; 552 inline, 488 cores, 79 botões crus), **Admin** (3.558; 541/482/96), **Formação de Preços** (3.769; 521/525/68), **Produção** (2.932; 380/307/65), **Licitações** (3.014; 347/373/56), **Compras** (2.634; 337/285/71), **Cotações** (1.839; 322/343/34) e o compartilhado `AcnTabShared` (1.747; 267/267/33).

**Conclusão:** o `TonsVisuais` (que pinta botões e etiquetas pela cor que a tela escreveu) e o ajuste do modo escuro (cor por cor) **ainda seguram o visual de todas essas telas**: aposentá-los agora **desmontaria o visual dessas telas** (botões e etiquetas voltariam às cores escritas à mão e o modo escuro perderia a tradução). A Etapa 13 **não pode começar** antes de a migração cobrir o resto; a medida de "pronto" é **quase nenhum `style` inline de cor e nenhum botão cru fora dos documentos impressos**, e a etapa só vale a pena se isso for atingido (senão fica o remendo para sempre).

**Caminho proposto para destravar (a decidir pelo usuário — nada foi feito):** continuar a Etapa 12 nas telas que sobraram, **uma por vez, das menores para as maiores**, no mesmo método (fotografia e comportamento comparados nas duas versões, gravação bloqueada). As menores, que **dão para fazer em uma fatia cada**: **Painel TV** (342 linhas; 32 inline), **Demandas gerais** (`AjustesProjetoTab`, 345; 33), **Controle de qualidade** (388; 45), **Conciliação bancária** (440; 59), **Marketing** (437; 63), **Calendário** (499; 64), **Serralheria** e **Chicotes** (527; 67 e 65), **Clientes** (562; 75), **Vistorias de pátio** (610; 83). Depois as médias (**PCP** 1.029/112, **Engenharia** 1.079/126, **Financeiro** 804/144, **Almoxarifado** 1.351/154) e, por último, as grandes, que **precisam de várias fatias cada** (o SAC levou sete). **Ainda não se sabe** quais telas o pessoal usa mais — o critério de ordem é decisão do usuário.

### 🟡 Etapa 14 — Menu lateral: gaveta (14a ✅) e grupos (14b ⬜)

#### ✅ 14a — Menu lateral em gaveta

**Feito em:** 01/10/2026. **Pedido do usuário:** o menu lateral ocupava cerca de 232 px da tela o dia inteiro, e as pessoas costumam ficar na mesma tela. Ele passa a ficar **escondido**, abre **por cima da tela** por um **botão ao lado do logo** e **fecha ao escolher a tela**, para que **todas as telas usem a janela inteira**. Foi **avaliado antes** (medido nas 31 telas, sem alterar nada) e feito **antes da 12d3**, por escolha do usuário: as medidas de largura das fatias seguintes já nascem na tela final.

**Decisões do usuário** (perguntas clicáveis, opção recomendada primeiro): fazer **agora, antes da 12d3**; a gaveta abre **abaixo do cabeçalho** (o botão continua visível e fecha o menu); os avisos dos itens do menu vêm **somados no botão**.

**O que foi feito** (`DashboardTab.tsx` e `responsivo.css`; **nenhuma tela foi mexida** — todas aparecem dentro de uma única área de conteúdo e nenhuma sabe da largura do menu; **nenhum dado alterado**):

- **O menu vira gaveta em qualquer tela:** o mecanismo (menu fixo, escondido à esquerda, fundo escurecido, botão, fecha ao escolher) **já existia só para celular/tablet**; passou a valer para todas as larguras e as **três versões** que existiam (janela estreita, aparelho de toque e computador) viraram **uma só** (as regras de toque mantêm só o tamanho maior de letra e de alvo).
- **O botão do menu** aparece em todas as telas, com `aria-expanded`; **o logo saiu do menu e foi para o cabeçalho, ao lado do botão** (some em janela de até 700 px, onde o cabeçalho é estreito).
- **Com o menu fechado**, ele sai da ordem do Tab (`visibility: hidden`); **Esc**, **clicar no fundo** e **escolher uma tela** fecham.
- **Soma dos avisos no botão** (as análises técnicas de Engenharia/Produção e as mensagens de WhatsApp do CRM — só dos itens que a pessoa enxerga); aberto, cada item continua mostrando o seu.
- **Impressão:** o menu continua fora do papel; modo escuro e celular (toque) seguem funcionando.

**Como foi testado** (navegador, dado real, **gravações bloqueadas**, cliques de mouse e toque de verdade): `teste_44` **24/24** (antes: o botão nem existia no computador) — escondido por padrão; conteúdo na **janela inteira** (1400 e 1100 px); botão e logo ao lado; abre **por cima, abaixo do cabeçalho**, sem empurrar o conteúdo; os 31 itens do Admin; Esc, clique fora e escolher "Engenharia" fecham; o selo do botão é a soma dos avisos dos itens; escuro; celular (toque); impressão; **usuário restrito só vê as telas liberadas** (Dashboard, Painel TV e RH).

- **As 31 telas do menu, em 1100, 1400 e 1920 px, com o código real:** **área útil 868 → 1100, 1168 → 1400 e 1688 → 1920 px**; **nenhuma tela com rolagem lateral** na página nem dentro da área; **nenhuma tela deixou de ocupar a largura**; **tabelas que rolavam e deixaram de rolar:** 6 telas a 1400 px e 12 a 1100 px. **Uma tela apareceu com "mais uma tabela rolando" a 1100 px (Cadastro de itens)**: é **falso alarme** — a tabela tem 1.208 px, ainda não tinha carregado na medição antiga e já rolaria no menu fixo (868 px); agora rola menos. Só **7 de 31 telas** têm blocos de **largura máxima fixa** e todos são pequenos (um campo de 400 px, caixas de texto de 720 px para leitura, cartões de 380 px, a barra de abas do Financeiro). Dado real, 0 gravações, 0 erros de console.
- **Capturas** em claro, escuro e celular: menu fechado (com o selo no botão) e aberto; **0 px de rolagem lateral**.
- **Regressão:** `teste_20` 24/24, `teste_24` 28/28, `teste_25` 20/20, `teste_28` 6/6, `teste_29` 4/4, `teste_30` 7/7, `teste_31` 5/5, `teste_32` 19/19, `teste_34` 4/4, `teste_35` 3/3, `teste_36` 45/45, `teste_37` 17/17, `teste_38` 9/9, `teste_39` 8/8, `teste_40` 10/10, `teste_42` 9/9, `teste_43` 11/11; build ok. (Uma rodada do `teste_42` deu erro e passou 9/9 em três rodadas seguidas: oscilação.) Os testes que navegam clicando por script em `.sidebar-item` **continuam funcionando com o menu escondido**.

**O que muda para o trabalho daqui para frente:** a **área útil das telas passa a ser a janela inteira** (1400 → 1400, 1100 → 1100; 390 não muda). As medidas de largura das fatias 12d3 a 12d8 valem para esses números; as das fatias já feitas (a 1400 e 1100 px cabiam com folga a 1168 e 868 px) **só ganham espaço**.

**O que ficou de fora / limites:**

- **A 14b** (reorganizar os grupos) segue pendente. Com a gaveta, vale também **deixar a lista caber sem rolar em tela baixa**: em 860 px de altura os últimos grupos rolam **dentro** da gaveta.
- **Documentos fora do código que citam o "menu lateral"** e ficam desatualizados: **o Manual (`Manual_ACN_Sinal_Verde.docx` e o `.pdf`)** e **o treinamento (`ACN_Sinal_Verde_Treinamento.pptx`)**. Não os alterei (são arquivos do usuário).
- **Não testado em aparelho antigo** (iPad com iOS 10): o menu em gaveta que ele já usava é o mesmo, mas o computador agora também o usa.
- **Não feitos** (propostos na avaliação): atalho de teclado para abrir o menu e um "fixar menu" opcional. Não conferi o visual das 31 telas uma a uma (medi todas e olhei PCP, CRM e Painel TV).

**O que a 14a ensinou:** (1) **avaliar antes de mexer** — injetar o CSS no navegador de teste e passar por todas as telas mostrou o impacto real sem tocar no código; (2) **o sistema já tinha 90% do mecanismo** (gaveta do celular): a mudança foi unificar, não inventar; (3) o **medidor de tabelas que rolam depende de a tela ter carregado**: dar tempo antes de medir (foi o que gerou o falso alarme do Cadastro de itens).

#### ⬜ 14b — Reorganizar os grupos do menu
Separar "Administrativo" (12 itens) em grupos menores e mais previsíveis; com o menu em gaveta, também **fazer a lista caber sem rolar em tela baixa** (por exemplo, abrir só o grupo da tela atual por padrão).

---

## Respostas a aplicar — rodada de perguntas de 01/10/2026

Em 01/10/2026 o usuário respondeu, numa conversa só para isso (perguntas clicáveis, com a opção recomendada primeiro), **todas as perguntas que estavam em aberto neste plano**: as da seção "Perguntas em aberto" mais as que estavam escondidas dentro dos blocos das etapas. Foram **30 perguntas, 25 assuntos** (R1 a R25). **Nada foi aplicado ainda**: esta seção é o registro. As perguntas respondidas saíram da seção "Perguntas em aberto".

> **Instrução para o próximo `/ux-fluxo` (pedido do usuário em 01/10/2026):**
>
> 1. **Leia esta seção inteira** antes de escolher a etapa.
> 2. **Decida, para cada resposta, em que momento aplicar** — agora, junto de uma etapa que mexe nos mesmos arquivos, ou depois — e escreva na coluna **Momento** do quadro abaixo **antes de começar**.
> 3. **Comece a aplicar junto com a finalização do `/ux-fluxo`** (o que falta: 12d2 a 12d8 do SAC, 13 e 14; a 5.1c espera dados). Não deixe as respostas para depois de acabar todas as etapas.
> 4. **Uma resposta por vez**, cada uma com seu teste, seu plano atualizado e sua autorização de publicação (a regra de "uma etapa por vez" vale aqui também).
> 5. **Dado real:** o banco anda. Meça de novo antes, mexa **só no que a resposta autoriza** e relate quantas linhas mudaram (regra 4 do CLAUDE.md).
> 6. Ao aplicar, a resposta vira **uma linha em "Decisões tomadas"** e sai daqui (marque ✅ no quadro até lá). O que estiver marcado **a confirmar** é pergunta nova: faça ao usuário antes de construir.

**Natureza:** 🟢 só código/tela · 🟠 mexe em dado real (já autorizado pela resposta, com contagem) · 🔴 regra de negócio nova ou grande · ⚪ nada a fazer, só registro. **Tamanho:** P (um arquivo) · M · G (várias telas ou desenho com o usuário).

### O fluxo da OP até a Engenharia — como o usuário descreveu (R1 e R8)

Palavras dele, resumidas por mim sem mudar o sentido:

1. **Quem abre a OP** preenche os **itens vendidos** e seleciona o **carro**; conforme os itens vendidos, **responde as perguntas configuradas para aquele item** (ex.: "tem hack?").
2. **Na Engenharia:** se o item vendido **já foi adaptado naquele carro do catálogo** e já estão cadastrados os itens que compõem o Conjunto Elétrico (suporte, chicote, parafusos, porcas etc.), **só pede a aprovação da Engenharia** para passar ao PCP.
3. Se **algum item nunca foi adaptado naquele modelo** e não foi configurado o que entra no Conjunto Elétrico para aquele carro, **pede à Engenharia que informe os itens usados na adaptação** daquele item.
4. **Quando o item vendido não está configurado para o modelo selecionado, abre um modal para configurar**; se o item tem perguntas e respostas dadas pelo Comercial, **a configuração é feita por resposta**.
5. **Exemplo, Slimled:** a quantidade instalada na frente e na traseira muda o chicote — é um **chicote principal** e um **chicote de derivação** para as luzes frontais já com a quantidade, ou seja, **um chicote para cada quantidade frontal e um para cada quantidade traseira**.

**A conferir pelo `/ux-fluxo` (não foi conferido nesta conversa):** o que o sistema já faz disso (Etapas 7.4 e 7.5, `AplicarEstrutura.tsx`, `ConfigEstruturaTela.tsx`, o painel da estrutura na Engenharia) e o que falta — em especial o **item 4** (o modal de configurar na hora, por resposta) e o **item 5** (se uma pergunta de quantidade, com um chicote por quantidade, cabe no modelo de pergunta com opções de hoje, ou se é uma lacuna). Listar a diferença para o usuário antes de construir.

### As respostas

**Fluxo da OP e CRM**

- **R1 — OP criada sozinha quando o card vira Vencido** (`criarOpAutomatica`, `CrmTab.tsx`). *Resposta:* "Libera para criar OP, porém só segue para a Engenharia e o fluxo normal depois de preencher os campos obrigatórios". **Campos obrigatórios escolhidos:** fluxo de entrega; itens vendidos (pelo menos 1); veículo, quando o tipo de venda exige (a mesma regra do `NovaOpOsModal`, configurada no Admin); origem da venda (Licitação ou Venda direta) e quem paga o frete (CIF/FOB, quando termina em envio). Prazo e responsável já vêm do card. **Onde a OP fica parada:** reaproveitar **"Devolvida Comercial"** — a OP nasce já devolvida ao Comercial com o motivo "faltam: …", e ele completa e reenvia pela tela de reenvio da Etapa 3.1 (o contador e o aviso de R3 já servem). *Ponto de partida (Etapa 4):* de 199 OPs automáticas, 167 sem fluxo de entrega e 179 sem itens vendidos. *A confirmar:* se as **perguntas do carro** também entram nos obrigatórios (R8 sugere que sim); e **o que fazer com as OPs automáticas que já existem sem esses campos** — não mexer em massa (princípio 4), propor ao usuário. 🔴 G
- **R2 — Selo "onde está" no card do CRM:** mostrar em **qualquer coluna em que o card tenha OP** (hoje só em "Vencido"; há 2 cards em "Faturado" e 1 em "Enviado" em que ele mostraria um descompasso real). Tirar a restrição de coluna da 6.3. 🟢 P
- **R3 — OP devolvida ao Comercial sem aviso.** *Resposta:* "Contador na tela porém notificando os envolvidos naquele card, quem abriu e o seu gerente." Fazer o contador "N devolvidas ao Comercial" no topo do CRM e da aba "OPs em aberto" **e** notificar quem abriu o card/a OP e o gerente dessa pessoa quando a OP é devolvida. *A confirmar:* **como o sistema sabe quem é o gerente de quem abriu** (ver se há vínculo no cadastro de usuários; se não houver, perguntar) e **por qual canal** (usar o que já existe: avisos do sistema e `whatsappHelper.ts`). 🔴 M
- **R4 — Cinco OPs com defeito de digitação.** *Resposta:* "Corrigir os 5 óbvios". **Medido em 01/10/2026 (só leitura):** a OP `1516.2608` está com `data_prevista_entrega = 62026-10-20` → corrigir para **2026-10-20**; quatro números de OP com espaço sobrando nas pontas (`" A 1453.2607 - ESL AUTO CENTER"`, `" A 1470.2607 - PREMIUM AUTOMOTIVE"`, `" D 710.2607 - COMANDO MILITAR DO SUL"` e `"OPL A1436.2707 "`). **Ficam de fora (o usuário ainda confirma):** `" A 1470.2607"` com `prazo_entrega_producao = 0001-01-01` e `" D 710.2607"` com `data_prevista_entrega = 2027-07-14` (parece digitação, a OP é de 07/2026). **Cuidado:** o número da OP (`oples.opl`) é lido como texto em outras tabelas (histórico, CQ, frete, menções, anexos): **antes de aparar os espaços, conferir se alguma guarda o número com o espaço** — aparar só de um lado quebra o vínculo. Relatar a contagem. 🟠 P

**Avisos, compras e permissões**

- **R5 — Aviso de erro fica até fechar.** Em `Feedback.tsx`, a mensagem de **erro** (vermelha) só some quando a pessoa fecha; **atenção (7 s) e sucesso seguem como hoje**. Muda o comportamento de mais de 240 mensagens: conferir que todas têm botão de fechar visível e que erros empilhados não cobrem a tela. 🟢 P
- **R6 — Painel "Esperando a sua aprovação" (Etapa 8).** Acrescentar: **contador no menu** ("Compras (N)") para quem aprova, e **as alçadas por valor/departamento** (`pcp_aprovacoes`), que hoje só se resolvem dentro da Mesa de Cotações. **Sem alerta de cor por prazo** (ele não escolheu). *A confirmar ao construir:* quem aprova cada alçada — a regra de "qualquer aprovador resolve" (24/09) vale para a etapa de aprovação, mas a alçada pode ter aprovador próprio. 🔴 M
- **R7 — Valores ocultos que não estão ocultos.** *Resposta:* "Ligar exceto Fernando e Luiz" e, na confirmação, **ligar a marca dos dois no Admin**. Fazer a marca `ver_valores` **chegar à sessão** (login, "ver como" e atualização — como se fez com `pode_aprovar_compra` na correção da Etapa 8) e **esconder valores de JAIRO BORGES, SERGIO DANIEL HAMANN, MARLON DE AMORIM e MURIEL DOS REIS GOBEL**. **FERNANDO WAECHTER e LUIZ ALBANEZ continuam vendo**: para isso **ligar a marca "ver valores" dos dois no Admin (2 linhas; autorizado)**, relatando a contagem — **sem abrir exceção por nome no código**. Mapear todas as telas que mostram valor, porque hoje nenhuma lê a marca. **Testar a sessão como o login a monta**, sem injetar permissão à mão (decisão de 30/09). `pode_deletar_anexos` tem o mesmo vício e ninguém está marcado: corrigir junto, sem efeito hoje. 🔴 + 🟠 G
- **R8 — Perguntas do carro em OP já aberta (7.5).** O usuário **não** quer restringir quem responde por perfil: **quem abre a OP é quem sabe a resposta, e a Engenharia deve receber tudo preenchido** (fluxo acima). Consequência: a tela de resposta em lote da Engenharia passa a servir **só para OP antiga** (as 39 Renegade e as abertas antes de a pergunta existir); para a OP nova, as perguntas são respondidas na abertura e **entram nos obrigatórios** (ver R1). 🔴 (faz parte do fluxo acima)

**Cadastros e RH**

- **R9 — As 4 fichas de veículo (7.6/7.7).** *Resposta:* "Equipe corrige pela tela, mas 2 desses 4 modelos já foram corrigidos, certo?" **Medido em 01/10/2026: só 1 de 4.** A do **Toro** foi resolvida: o Thiago criou a ficha "Toro Freedom" em 30/09 às 18h e a OP D0778.2609 aponta para ela. **Seguem com o nome curto:** **Renegade 4x4** (39 OPs, lote 1673.2609), **Titano 4x4** (1 OP, A1678.2609; a observação da ficha diz "TITANO VOLCANO MULTIJET TURBODIESEL 4X4 DIESEL 26/26 AUTO") e **C3** (2 OPs, 1669.25609/01 e /02, que dizem "C3 YOU"). *A fazer:* **dizer ao usuário que são 3, não 2** (ele pode ter corrigido de um jeito que não enxergo) e que a equipe corrige pela tela "Editar veículo"; e **desativar a ficha antiga "Toro"** (ativa, 0 OPs) — **autorizado** —, **só se não tiver estrutura de material ligada** (`veiculo_item_materiais`); conferir, desativar e relatar. Nada apagado. 🟠 P
- **R10 — Quem edita a ficha (7.7):** **Admin, Gerente e Comercial/CRM.** Trocar a regra `ehAdminOuGerente` por uma que inclua o Comercial (o plano da 7.7 sugeria `temPoderDeGerente` — **conferir se esse inclui o Comercial/CRM** antes de usar). Sem botão de excluir. 🟢 P
- **R11 — Percentual de comissão dos serralheiros (7.8).** *Resposta:* "**RH define pessoa a pessoa**" e **um percentual por pessoa** (sem segundo percentual para a adaptação). **Pendente do RH:** o percentual de JORGE FERREIRA, MARLON PAULO, SALOMÃO e WESLEI (hoje "não recebe comissão"; só o MURIEL tem, 0,5%). Até lá, comissão R$ 0,00 com o selo "sem percentual no RH" (já é assim). **Nenhum código a fazer**; quando o RH informar, ligar "recebe comissão" e o percentual na tela do RH. ⚪
- **R12 — Os 6 cadastros escondidos pela lixeira (7.9):** **todos continuam escondidos**; nada a fazer. ⚪
- **R13 — Relatório de Técnicos (12c3): contar todas as OPs.** Tirar o corte das 200 mais recentes (hoje Tatiana aparece com 114 e tem 228; Thiago 52 e tem 75; Letícia 30 e tem 41; Rute 4 e tem 11). **Cuidado:** o servidor devolve no máximo 1.000 linhas por consulta (achados A8 e A9) — hoje são 369, mas vão passar; usar paginação por `.range` ou a conta feita no banco. 🟢 P
- **R14 — OPs sem responsável no mesmo relatório.** *Resposta:* "Linha sem responsável **porém indicando que precisa informar o responsável**." **Não mexer no cadastro.** São 13 OPs em branco e 1 com "leticia" sem sobrenome (*a confirmar:* essa entra na mesma linha, com o mesmo aviso). 🟢 P

**Datas, CEP, BOM e pequenos achados**

- **R16 — Datas que aparecem um dia antes (7.10).** *Resposta:* "Corrigir direto os que erram." São **52 lugares em 25 arquivos** com `new Date(x).toLocaleDateString` sem hora (maiores: `FormacaoPrecosTab` 7, `AcnTabShared` 5, `VistoriasPatio` 3, `SacTab` 3, `RelatoriosTab` 3, `HorasTarefasTab` 3, `CotacoesTab` 3). **Só erra quem recebe coluna do tipo *date*** — a maioria é data-e-hora, que está certa: **separar antes de mexer**. O dia vem **do texto AAAA-MM-DD**, nunca de `new Date(texto)` (decisão da 7.10). **Um arquivo por vez, relatando cada um**, com teste de data real. Em tela que a Etapa 12 ainda vai migrar, corrigir **antes** da migração visual (como na 7.10). Etapa própria. 🟢 M
- **R17 — CEP.** *Resposta:* "**Tudo que pede CEP deve se comportar assim.**" Levantar (por busca no código) **todos os campos de CEP do sistema** — criação e edição da OP, "Novo Frete", cadastros de cliente, fornecedor, transportadora, colaborador, SAC… — e aplicar a regra da 7.13 (CEP válido; cidade e UF preenchidas pelo CEP; ViaCEP e BrasilAPI), **reaproveitando o que a 7.13 criou, sem copiar**. As suposições da 7.13 (o CEP sobrescreve cidade e UF; "inexistente" só quando os dois serviços concordam; serviço fora do ar não barra; CEP gravado como 00000-000) são regra de negócio: **confirmar com o usuário** (R22). 🔴 G
- **R18 — Os 4 fretes reais com CEP de zeros:** **deixar como estão** (1654.2609, 0756.2609, 1560.2608/02 e 1650.2609). A correção do aproveitamento (7.12) já evita o estrago. ⚪
- **R19 — Serviços na BOM sugerida (7.4):** **tirar da lista de separação do Almoxarifado** a película, a instalação do kit e a garantia estendida; continuam na venda e na proposta. 🟢 P
- **R21 — Tela morta em `ProducaoTab.tsx`** ("Aguardando Agendamento Manutenção" / "Manutenção Agendada", 0 registros): **deixar como está.** ⚪ (sai da lista de limpeza futura)
- **R22 — Suposições "minhas, não confirmadas":** as **visuais** (cores por família, botões no menu ⋯, recolher blocos, linha compacta etc.) ficam **aceitas**. As de **regra de negócio** o `/ux-fluxo` **confirma com o usuário, uma por uma, ao tocar nelas**: 7.8 (apoio só na adaptação; caixinha de lote desmarcada por padrão — o percentual único já foi confirmado em R11), 7.9 (o login do sistema não é mexido ao desligar alguém), 7.11 e 7.12 (fretes antigos; não adivinhar região de CEP inválido), 7.13 (as quatro do R17), 7.17 (período inteiro), 8 (painel só para quem tem a permissão) e o tom dos avisos da Etapa 7 (recusa por permissão é vermelha).
- **R23 — Ordem geral:** o usuário **delegou ao próximo `/ux-fluxo`**: decidir o momento de cada ajuste e **intercalar com as etapas que faltam**. ⚪

### Quadro de acompanhamento — o `/ux-fluxo` preenche "Momento" antes de começar

| # | Assunto | Natureza | Tam. | Momento | Estado |
|---|---|---|---|---|---|
| R1 | OP automática: campos obrigatórios e "Devolvida Comercial" | 🔴 | G | depois da Etapa 12, **desenhar com o usuário** (junto de R8 e R3: o "fluxo da OP até a Engenharia") | ⬜ |
| R2 | Selo "onde está" em qualquer coluna com OP | 🟢 | P | rodada própria, depois (pequena, `CrmTab`) | ⬜ |
| R3 | OP devolvida: contador + notificar quem abriu e o gerente | 🔴 | M | junto de R1 e R8 | ⬜ |
| R4 | Corrigir 5 OPs com defeito de digitação | 🟠 | P | rodada própria, depois — **medir de novo antes** (dado real, 5 OPs) | ⬜ |
| R5 | Erro fica até fechar | 🟢 | P | rodada própria, depois (pequena, `Feedback.tsx`) | ⬜ |
| R6 | Painel de aprovação: contador no menu + alçadas | 🔴 | M | depois, **desenhar com o usuário** (confirmar quem aprova cada alçada) | ⬜ |
| R7 | `ver_valores` valendo (+ ligar a marca de Fernando e Luiz) | 🔴 + 🟠 | G | depois, **desenhar com o usuário**; testar a sessão como o login a monta; **medir de novo** antes das 2 linhas do Admin | ⬜ |
| R8 | Perguntas do carro respondidas na abertura da OP | 🔴 | G | junto de R1 | ⬜ |
| R9 | 3 fichas para a equipe + desativar a "Toro" antiga | 🟠 | P | rodada própria, depois — **medir de novo antes** (dizer ao usuário que são 3 fichas) | ⬜ |
| R10 | Comercial também edita a ficha de veículo | 🟢 | P | rodada própria, depois (pequena; conferir `temPoderDeGerente`) | ⬜ |
| R11 | Percentual dos serralheiros (espera o RH) | ⚪ | — | — | ⬜ espera o RH |
| R12 | 6 cadastros escondidos | ⚪ | — | — | ✅ nada a fazer |
| R13 | Relatório de Técnicos conta todas as OPs | 🟢 | P | rodada própria, depois (pequena); junto de R14 | ⬜ |
| R14 | Linha "Sem responsável" no mesmo relatório | 🟢 | P | junto de R13 (confirmar a "leticia" sem sobrenome) | ⬜ |
| R15 | Comissão Comercial em mês de 30 dias (Etapa 7.19) | 🟢 | P | **agora** (01/10/2026) | ✅ aplicada em 01/10/2026 (Etapa 7.19) |
| R16 | Datas um dia antes: corrigir os 52 lugares | 🟢 | M | etapa própria, um arquivo por vez; `SacTab` ✅ **feito na Etapa 7.21** (2 lugares reais; o 3º era do `PrintOS` apagado); restam **48 lugares em 24 arquivos**, um arquivo por vez — próximo: `RelatoriosTab` (3) | ⬜ |
| R17 | CEP validado em todo campo de CEP | 🔴 | G | depois, **desenhar com o usuário** (confirmar as quatro suposições do CEP, R22) | ⬜ |
| R18 | 4 fretes com CEP de zeros | ⚪ | — | — | ✅ nada a fazer |
| R19 | Serviços fora da lista de separação | 🟢 | P | rodada própria, depois (pequena, Almoxarifado/BOM) | ⬜ |
| R20 | Mensagem do Histórico de comissões só depois de buscar | 🟢 | P | **agora** (01/10/2026), logo depois da R15 | ✅ aplicada em 01/10/2026 (Etapa 7.26) |
| R21 | Tela morta do `ProducaoTab` | ⚪ | — | — | ✅ nada a fazer |
| R22 | Suposições: visuais aceitas; regras confirmadas ao tocar | ⚪ | — | ao tocar em cada suposição de regra de negócio | ⬜ |
| R23 | Ordem geral | ⚪ | — | — | ✅ delegada ao `/ux-fluxo` |
| R24 | Atendente do chamado NFC | 🟢 | P | **agora** (01/10/2026): mexe no mesmo arquivo da 12d | ✅ aplicada em 01/10/2026 |
| R25 | Filtro e contador dos Chamados NFC | 🟢 | P | **agora** (01/10/2026), logo depois da R24: mesmo arquivo e mesmo quadro da 12d1 | ✅ aplicada em 01/10/2026 |

*Agrupamento que eu sugeriria — o `/ux-fluxo` decide:* **pequenas e independentes, que cabem junto de qualquer etapa** (R2, R5, R10, R13, R14, R15, R19, R20, R24, R25); **as que mexem em dado real, já autorizadas, para fazer com contagem** (R4, R9, e as 2 linhas de R7); **as que tocam em tela que a Etapa 12 ainda vai migrar**, a fazer **antes** da migração visual dela (R24 e R25 no SAC; as partes de R16 em `SacTab` e `RelatoriosTab`); e **as regras grandes, que pedem desenho com o usuário** (R1 + R8 + R3, juntas, formam o "fluxo da OP até a Engenharia"; R6; R7; R17).

---

## Perguntas em aberto

**Nenhuma em 01/10/2026:** todas as perguntas anteriores foram respondidas pelo usuário — ver **"Respostas a aplicar"**, logo acima. Perguntas que surgirem ao aplicar entram aqui. As que já se sabe que vão surgir (nasceram das respostas):

- **Perguntas do carro na OP automática (R1/R8):** a OP que nasce sozinha só segue para a Engenharia com as perguntas do carro respondidas também? Provável que sim; confirmar ao construir.
- **Quem é o "gerente de quem abriu" (R3):** existe esse vínculo no cadastro de usuários? Se não, quem o define?
- **A OP da "leticia" sem sobrenome (R14):** entra na linha "Sem responsável"?
- **Quem aprova cada alçada (R6):** a alçada por valor/departamento tem aprovador próprio, ou vale "qualquer aprovador resolve"?
- **As duas datas suspeitas (R4):** o prazo de produção `0001-01-01` da OP `A 1470.2607` e a previsão `2027-07-14` da `D 710.2607` — quais são as datas certas?

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
| 30/09/2026 | **Etapa 9 (PCP):** em vez de abas, uma **faixa de resumo + blocos que só acompanham abrem recolhidos**; "pede ação" = o que tem botão do PCP na linha, o resto é acompanhamento de outro setor; quem pede ação abre sozinho e sobe dentro do bloco; a reposição de estoque sobe para logo abaixo do "material em falta". **Suposição minha, não confirmada com o usuário**: recolher por padrão o que não pede ação (um clique abre; o número continua no cabeçalho e na faixa). |
| 30/09/2026 | **Etapa 11 (Fiscal, piloto do design system):** migração **só visual**, testada com o mesmo teste na tela velha e na nova (24/24 → 29/29); "Faturado" é o botão principal da linha e "Ver" / "Devolver" foram para o menu ⋯ (igual ao PCP) — **suposição minha, não confirmada com o usuário**; os cartões de resumo viraram `acn-kpi`; a barra de faturamento em lote virou a barra fixa `acn-barra-selecao`; nova classe `acn-nota-mono`. Receita para a Etapa 12 no bloco da etapa. |
| 30/09/2026 | **Unificação de itens, rodada 2 (planilha decidida pelo usuário):** 7 SIM unificados no item de menor código; os 21 "sem candidato" e os 8 itens sem código marcados "se desativa" foram **desativados** (nada apagado); para os 8 em uso em OPs o usuário escolheu **só desativar, sem apontar as OPs para o item com código**. **Regra dele:** *o que não tem código se desativa; o que tem código se mantém.* Sobraram 11 itens ativos sem código (NÃO, diferentes) — **receberam os códigos 4413 a 4423 por pedido do usuário no mesmo dia**. |
| 30/09/2026 | **Versão do carro sem motorização (7.6, decisão do usuário):** para **carros**, a lista de modelos do "Cadastrar veículo" mostra **uma entrada por versão** (Toro Freedom, Polo Highline TSI, HUNTER HD 4x4 CTI, Strada Adventure CD) e tira só a **motorização** (1.0/2.0, cv, 16V, Flex, Diesel, Aut./Mec., 4p). Motivo dele: *no Fiat Toro o suporte muda de uma Adventure para uma Freedom; o motor não importa.* Ele escolheu a opção **"todas as versões"** (5.805 itens de carros, contra 1.557 antes) entre "só emblemas", "todas" e "emblemas + seletor", e **"só carros"**: motos e caminhões ficam como estavam. Emblemas de motor que funcionam como nome de versão (**TSI, CTI, TDI**) **ficam**. |
| 30/09/2026 | **Etapa 12 (ordem e passo):** **uma tela por vez**, das de menor risco para as de maior — Relatórios (sem gravação) → Logística → RH → SAC; cada fatia sobe e funciona sozinha e o plano ganha um bloco por fatia. **Relatórios (12a):** status pela **família do design system** (uma cor por família, não mais uma por status), 14 abas em `Chips` que quebram de linha, Centro de Custo **recolhido** por padrão — **suposições minhas, não confirmadas com o usuário**. |
| 30/09/2026 | **Etapa 10 (kiting):** "marcar todos" / "todos de <setor>" / "desmarcar todos" nas sugestões de fabricação, **sem marcar nada sozinho** (regra de 21/09/2026 mantida); peça repetida na BOM **soma** a quantidade; o que a pessoa ajustou ou digitou à mão nunca é desfeito pelos botões. A premissa do plano ("dezenas de cliques") estava errada: são de 1 a 5 hoje. |
| 30/09/2026 | **Editar veículo (7.7, pedido do usuário):** corrigir a ficha = **editar a mesma ficha**, não criar outra (as OPs e a estrutura de material apontam para ela). A tela é o mesmo modal do cadastro; a lista fica no Admin → "🚗 Veículos". O "Modelo" das OPs ligadas só é trocado **com a caixinha marcada e uma confirmação com a contagem** (vem marcada só se o nome mudou; o texto digitado à mão, como "C3 YOU", não é sobrescrito sem pedir). **Suposição minha, não confirmada com o usuário:** só Admin e Gerente editam; sem botão de excluir; o histórico guarda a ficha e cada OP mexida. |
| 30/09/2026 | **Equipe da OP (7.8, pedido do usuário):** quem trabalhou na **adaptação** (responsável/apoio) e na **serralheria** (lista nova, papel `serralheria` em `responsaveis_producao`) é apontado pelo gerente da produção e **pode ser corrigido em qualquer etapa até o Fiscal faturar**; depois **trava para todos, inclusive Admin**. Edita Admin, qualquer "Gerente …" e quem tem a aba Adaptação. Ao faturar, a comissão sai **sozinha** em cima da **MO de adaptação** (quem trabalhou na adaptação) e da **MO de serralheria** (quem trabalhou na serralheria). **Suposição minha, não confirmada:** serralheiro recebe o **percentual único do cadastro do RH**; apoio só na adaptação; caixinha de lote desmarcada por padrão. |
| 30/09/2026 | **Status "Desligado" no RH (7.9, pedido do usuário):** a pessoa desligada **sai das listas de trabalho** (`ativo = false`: seletor de responsável, Lançar Horas, Autorização) e fica num **bloco "Desligados"** com **data + motivo** (demissão pela empresa / pedido de demissão), podendo ser corrigida ou reativada; o nome e o percentual dela seguem nas **comissões, horas e autorizações** antigas. **Os 6 cadastros já escondidos pela lixeira ficam como estão** até ele dizer quais são desligados. **Nada é excluído** (horas, autorizações e fechamentos apagam em cascata). Suposição minha: o login do sistema não é mexido (a janela avisa). |
| 30/09/2026 | **OP 1450 duplicada unificada (correção de dado, pedido do usuário):** existiam `OPL A 1450.2607` (13/07, chassi HJ023180, modelo RANGER, CQ 12/12 OK) e `1450.2608` (27/08, R$ 20.000, ligada ao CRM, equipe apontada). **Ficou a 1450.2608**, que recebeu da antiga só o que estava **vazio** nela (chassi, previsão de entrega, observação comercial, tipo de projeto, anotações da engenharia); **onde as duas tinham valor, valeu o da mais nova** (inclusive cliente e modelo, que na nova são a descrição da OP, e não "RANGER"). Histórico (10), CQ (1), menções (4) e acompanhamentos (2) da antiga **passaram para a que ficou** — a OP passou a ter **2 CQs** (um com 12/12 OK, outro aprovado com os 12 itens pendentes). A antiga foi para a **Lixeira do Admin** (24 h) e há cópia completa fora do sistema. Nada mais foi tocado: o **card do CRM "OPL A 1450.2607 — POMERODE"** continua lá, sem OP ligada. |
| 30/09/2026 | **Aprovação de compra travada (correção da Etapa 8):** a marca `pode_aprovar_compra` **passa a fazer parte da sessão** (login, "ver como" e atualização), e a cotação vencedora ganha o botão **"✅ Aprovar"** para a alçada já pendente. **Teste de sessão deve usar a sessão como o login a monta**, sem injetar permissão à mão (o `teste_17` injetava e escondeu o erro). O PC-DEBMAA **não foi aprovado por mim**: segue pendente para quem aprova. |
| 30/09/2026 | **Datas da Logística (7.10):** o dia de uma coluna *date* vem **do texto AAAA-MM-DD**, nunca de `new Date(texto)` (que cai no dia anterior no Brasil). Bug funcional corrigido em passo próprio, **antes** da migração visual da Logística (12b), para a comparação "tela velha × nova" partir de uma tela certa. |
| 30/09/2026 | **Etapa 12b (Logística) dividida em três fatias** — 12b1 (abas + Aguardando Recebimento + Relatório IN/OUT + janela "Receber Pedido"), 12b2 (Histórico / Novo Registro) e 12b3 (Fretes) — porque a tela tem 2.174 linhas e 31 pontos de gravação (22 só nos Fretes); cada uma sobe sozinha. **Tela que grava é provada comparando o corpo do que seria gravado, nas duas versões.** A janela "Receber Pedido" é **compartilhada com o Compras**: migrar uma migra a outra. Suposições minhas, não confirmadas: o tipo do manifesto passa a usar o `Selo` por família; os números por tipo deixam de ser coloridos. |
| 30/09/2026 | **Largura das tabelas é critério de aceite da migração (achado na 12b2):** com o dado real, a 1400 px, a tabela migrada tem de **caber no quadro (1.102 px úteis) como a antiga cabia**; o design system engorda células e botões, e uma linha com texto sem espaço (uma URL colada) trava a coluna. A solução é classe opt-in no `design.css` (`acn-densa`, `acn-texto-medio` / `acn-texto-curto`, `acn-acoes-linha quebra`), não estilo solto na tela. A 12b1, já publicada, tinha o mesmo defeito no Relatório IN/OUT e foi corrigida junto. Suposições minhas, não confirmadas: recuo lateral de 7 px e botão "N foto(s)" sem ícone, só nas tabelas da Logística. |
| 30/09/2026 | **Fretes antigos (7.11):** a entrega do frete reconhece o vínculo de OP pelos **dois nomes** (`op_os`, o atual, e `opl`, o de antes da Etapa 1), **sem migrar as 5 linhas reais** — correção só de código, no espírito do princípio 4 (o código tolera as duas grafias). Suposição minha, não confirmada: não é preciso mexer no dado. |
| 30/09/2026 | **Aproveitamento de frete (7.12):** CEP só de zeros não vale como região — a comparação cai para o nome do destino; correção só de leitura, sem mexer nos CEPs gravados. Suposição minha, não confirmada: o sistema não deve tentar adivinhar a região de um CEP inválido. |
| 01/10/2026 | **Fretes migrados para o design system (12b3):** o status do frete vira `Selo` por família (Cotação cinza, Aguardando aprovação âmbar, Em trânsito azul, Entregue verde, Cancelado vermelho); **"Aprovar" é o botão principal e "Rejeitar" é vermelho**; cancelar e remover cotação viram ícone com nome; o vínculo ao processo vira `Chips`. **Nome de classe novo se confere com `grep` em `src` inteiro antes de criar** (a `acn-busca` já era a busca do cabeçalho). Nas comparações antes/depois, **gravações disparadas sem esperar a resposta são comparadas como conjunto**. Suposições minhas, não confirmadas: as cores do status por família (o "Aguardando aprovação" era laranja forte), os botões de ação como ícone e o botão "Cotações" em destaque na linha. |
| 01/10/2026 | **CEP na embalagem (7.13, decisão do usuário):** **CEP obrigatório e válido** e **cidade e UF preenchidas pelo CEP**, só na janela de embalagem do Almoxarifado. Suposições minhas: o CEP sobrescreve cidade e UF; "inexistente" só quando o ViaCEP e o BrasilAPI concordam; serviço fora do ar não barra a embalagem; CEP gravado como 00000-000. |
| 01/10/2026 | **Janela do colaborador (7.14):** o par de botões "Sim / Não" sob "Recebe Comissão?" saiu (não gravava nada); ficou só "Recebe Comissão / Sem Comissão". Correção só de tela; nenhum dado mexido. |
| 01/10/2026 | **Datas do Relatório de Técnicos (7.15):** coluna *date* nunca passa por `new Date(texto)`; o relatório tira o dia do texto (como na 7.10). Correção só de formatação; nenhum dado mexido. |
| 01/10/2026 | **Recolher dos quadros do RH (7.16):** quadro com estado próprio de recolher leva a classe global `sec-collapsed` conforme esse estado (`className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}`); o clique global do cabeçalho segue valendo para os outros cartões. Não auditei outras telas com o mesmo padrão. |
| 01/10/2026 | **Período das Comissões de Técnicos (7.17):** o mês é o mês de verdade em **horário de Brasília** (`-03:00` fixo, sem horário de verão), dia inicial às 00h até o dia seguinte ao final às 00h, nas colunas de data-e-hora; coluna só de data continua com a data pura. Suposição minha: "dentro do período" sempre quis dizer o período inteiro. |
| 01/10/2026 | **RH migrado em quatro fatias (12c1 a 12c4), por quadro da página, de cima para baixo.** Na 12c1: o status de presença e o tipo de lançamento passam a usar as **famílias de cor** do design system (o `Selo` e a classe `acn-sel-status`), o recolher dos quadros mantém a lógica e perde a seta duplicada (`no-collapse`). Suposições minhas, não confirmadas: Férias na cor da marca, Folga e Viagem no mesmo azul, e os 10 tipos de lançamento em 6 famílias. |
| 01/10/2026 | **Janelas de cadastro do RH (12c2):** as fileiras de botões coloridos viram `Chips` (mesmas opções, mesmo valor gravado); a janela passa a ser a `modal-overlay` do sistema. Suposições minhas, não confirmadas: o aviso de "sem duração" do lançamento usa Falta âmbar, Atestado verde e os demais azul; Saída âmbar e Entrada azul na lista de autorizações. |
| 01/10/2026 | **Relatórios do RH (12c3):** Técnicos e Uniformes passam a **cartão** (como os outros quadros do RH); as abas de Horas viram `Chips`; contagens viram `Selo` pela família do tipo de lançamento; o status da OS segue o mesmo jeito de reconhecer de antes (pela primeira palavra) com **Em Execução azul, Manutenção Concluída verde, Aguardando Início âmbar, demais cinza**; "N OS" azul e "N OP" verde; tipo da avaliação "Remota" azul e os demais na cor da marca; "Imprimir" é o botão principal nas Horas e secundário nos cabeçalhos de Técnicos e Uniformes. **Tabelas longas dentro de quadro aberto (as OS/OP dos técnicos) usam a nova linha compacta de 32 px**; as de Horas e Uniformes ficam na linha de 44 px do sistema. Suposições minhas, não confirmadas. |
| 01/10/2026 | **Comissões de Técnicos (12c4):** a lista de OP/OS de cada técnico usa a **linha compacta de 32 px** (como as de Técnicos, 12c3), porque o setembro real tem 123 linhas; OP verde, OS azul, APOIO âmbar, SERRALHERIA na cor da marca e "lote/N" cinza; técnico **já aprovado** com o cabeçalho verde; Equipe na cor da marca, Dupla azul e Individual cinza no Pipeline. O alinhamento das colunas entre os cartões **não foi forçado** (custava altura). Suposições minhas, não confirmadas. |
| 01/10/2026 | **SAC dividido em oito fatias (12d1 a 12d8), por quadro da página, de cima para baixo.** Na 12d1 (Chamados NFC): as abas usam `Abas` com ícone (somem no celular); o status do chamado usa as famílias (**Aberto vermelho, Em Atendimento âmbar, Concluído verde, Cancelado cinza**); "Atender" e "Concluir" são o botão principal do cartão; o cabeçalho do quadro **não** usa `.sec-hdr` (o quadro nunca recolheu). Suposições minhas, não confirmadas. |
| 01/10/2026 | **Chamados NFC — quem consta como atendente (R24, resposta do usuário):** **só quem clicou em Atender ou Concluir**; salvar apenas as notas **não** troca o atendente (`atualizarStatusNfc`, `SacTab.tsx`). Aplicada em 01/10/2026; `teste_39` 8/8 (antes 4/8). Nenhum dado alterado. |
| 01/10/2026 | **Chamados NFC — filtro e contador (R25, resposta do usuário):** **escolher o status no filtro já recarrega a lista** (o botão "Carregar" continua, relendo com o filtro escolhido) e o **"N aberto(s)" do cabeçalho é o total real de chamados abertos** (uma leitura à parte), não só os carregados (`carregarChamadosNfc`, `SacTab.tsx`). Aplicada em 01/10/2026; `teste_40` 10/10 (antes 3/10); contra o banco real só mudou o que a resposta pede. **Os testes de fotografia e de comportamento da 12d1 (`snap_sac1`/`comport_sac1`) tratavam "o filtro só vale ao clicar em Carregar" como comportamento igual: passam a divergir de propósito nesse ponto (4 blocos de 26) e ficam como referência histórica da 12d1.** Nenhum dado alterado. |
| 01/10/2026 | **Cadastros do SAC (12d2):** as sub-abas viram `Chips`; "Desativar" é o botão vermelho suave e "Ativar" o botão comum; Ativo/Ativa verde e Inativo/Inativa cinza; "Despesas de campo: SIM" em âmbar; a linha de um cadastro desativado fica esmaecida (menos a que está em edição). **Gravação recusada nesta aba agora avisa o erro e mantém o que foi digitado (7.20).** Suposições minhas, não confirmadas. |
| 01/10/2026 | **Equipamentos desativados no SAC (resposta do usuário à pergunta da 7.20):** a aba **Cadastros mostra também os equipamentos desativados**, **esmaecidos e com o botão "Ativar"** (ativos primeiro, depois os desativados, cada grupo em ordem de nome); desativar deixa de ser definitivo pela tela. A lista "Tipo de Equipamento" da janela **Nova OS continua só com os ativos**. Aplicada em 01/10/2026 (`SacTab.tsx`, uma só leitura traz todos): `teste_43` 11/11 (antes 2/11); com o banco real a aba mostra **16 equipamentos (4 ativos e 12 desativados, cada um com "Ativar")** e a Nova OS segue com os 4 ativos; nenhuma gravação, nenhum dado alterado. **Os testes de fotografia e de comportamento da 12d2 (`snap_sac2`/`comport_sac2`) tratavam "o desativado some da lista" como comportamento igual: passam a divergir de propósito nos blocos de equipamentos (12 de 46) e ficam como referência histórica da 12d2.** |
| 01/10/2026 | **Menu lateral em gaveta (14a, pedido do usuário):** o menu fica **escondido em todas as telas**, abre **por cima, abaixo do cabeçalho**, por um botão ao lado do logo (o logo vai para o cabeçalho; some em janela de até 700 px) e **fecha ao escolher a tela**, com Esc ou clicando fora; os avisos dos itens vêm **somados no botão**. **A área útil das telas passa a ser a janela inteira.** Feito **antes da 12d3**. Suposições minhas, não confirmadas: a soma do botão só conta os itens que a pessoa enxerga; o selo some com o menu aberto. |
| 01/10/2026 | **Lista de OS do SAC (12d3): os quatro botões que toda OS tem vão para o menu ⋯ (escolha do usuário, pergunta clicável).** Com a lista real (19 OS) medida: tudo à vista deixava a lista 60% mais alta (1.590 → 2.593 px a 1400 px). Ficam à vista o **Acomp.** e o **passo da situação**; **Resp., Financeiro, Anexar e PDF** passam para o menu ⋯ "Mais ações da OS". Os textos e o que cada um faz não mudaram. **Suposições minhas, não confirmadas:** a cor de cada situação (âmbar = pedindo ação ou resposta; verde-água = andando no laboratório/produção; azul = aberta/em análise; verde = tratado; vermelho = reprovado), o "Tipo" em texto comum em vez de pílula e a saída da cor de fundo de "Aprovado" e "Entregue". |
| 01/10/2026 | **Código morto do SAC apagado (autorizado pelo usuário, pergunta clicável):** o **"modal PDF"** e o componente **`PrintOS`** (318 linhas, 103 estilos soltos e 115 cores) **nunca eram abertos**: nenhum código chamava `setModalPrint` com uma OS (só existia `setModalPrint(null)`) e `PrintOS` só era usado dentro desse modal; o botão "🖨️ PDF" de verdade usa `gerarPdfOS`. Provado por busca em `src` inteiro, `public` e `index.html`. Apagados `modalPrint`, o modal e `PrintOS` num commit à parte; build e typecheck ok; fotografias do SAC e `teste_38`, `39`, `40`, `42`, `43` sem diferença. **A fatia 12d8 sai do plano** e a 12d7 encolhe. (A 12d1 contou 18 janelas: eram 17.) |
| 01/10/2026 | **Datas "só dia" no SAC (R16, Etapa 7.21):** colunas do tipo **date** (`prazo_orcamento`, `data_prevista_pos_aprovacao`) mostram o dia **direto do texto** (nunca por `new Date(texto)`); o **prazo é o fim do dia**: só fica vermelho (atrasado) depois que o dia passou, comparando com o **dia de hoje em Brasília**. Aplicada em 01/10/2026; `teste_45` 10/10 (antes 6/10); com o banco real os 9 prazos da lista batem (antes 0 de 9). Suposição minha, não confirmada: o prazo vence ao fim do dia, não ao começo. |
| 01/10/2026 | **Gravação recusada no SAC (7.18, 7.20 e 7.22):** toda gravação do SAC que ignorava o resultado passa a **avisar o erro e parar** (o aviso de WhatsApp, a atualização da lista e o fechar da janela só acontecem **se gravou**); a janela com o que a pessoa digitou **continua aberta**. Feito **fatia por fatia**, cada uma com o seu teste de "gravação recusada" — a 7.22 cobriu as cinco ações da lista; as das janelas entram nas fatias 12d4 a 12d7. |
| 01/10/2026 | **Gravação recusada no SAC — janelas de Orçamento, Aprovação, Reprovação, Entrega e Anexar (7.27):** **avisa o erro e para** (nada de WhatsApp, demanda ou fechar a janela como se tivesse gravado); **assinatura/foto de saída que não sobe impede registrar a aprovação/a entrega** (antes gravava sem ela); **demanda de execução do Laboratório recusada deixa a OS aprovada e avisa**; **anexar é tudo ou nada**. Suposições minhas, não confirmadas: o "tudo ou nada" do anexar e o impedimento por assinatura/foto que não sobe. |
| 01/10/2026 | **Janelas de Orçamento, Aprovação, Reprovação, Entrega e Anexar do SAC (12d5):** migradas para a moldura das janelas do RH, **sem mudar campos, textos, ordem ou gravação** e **sem o ✕** (só Cancelar/Fechar, como antes). **Suposições visuais minhas (aceitas pela regra R22):** botão principal à direita e "REPROVAR" em vermelho vazado; larguras de 460 e 500 px; o quadro de assinatura com fundo branco nos dois modos e **sem rolar a página ao desenhar com o dedo**. |
| 02/10/2026 | **Gravação recusada no SAC — janelas do fluxo de manutenção veicular (7.28):** mesma regra das anteriores — **avisa o erro e para** (sem WhatsApp, histórico ou fechar a janela como se tivesse gravado). **Nº de série no "Enviar para Fiscal" (resposta do usuário): deixar como está** — o aviso orienta, mas pode enviar em branco. |
| 02/10/2026 | **Janelas do fluxo de manutenção veicular do SAC (12d6):** migradas para a moldura das janelas do RH, **sem mudar campos, textos, ordem ou gravação** e **sem o ✕** (só Cancelar/Fechar, como antes; **só a do Orçamento da Produção fecha ao clicar fora**, como já era). **Suposições visuais minhas (aceitas pela regra R22):** botão principal à direita e **"NÃO CONFIRMOU" em vermelho vazado**; larguras de 460 px (as três sem tabela) e 980 px (as quatro com tabela); as tabelas no padrão do guia, com a linha TOTAL em cinza (era verde); as abas Visualizar/Editar como botões de escolha; **no celular, Itens e Orçamento (editar) rolam para o lado dentro da janela** e o rodapé do Aceite quebra em duas linhas. |
| 02/10/2026 | **Janelas de Novo equipamento, Responsável e Valores Financeiros do SAC (12d7):** migradas para a moldura das janelas do RH, **sem mudar campos, textos, ordem ou gravação** e **sem o ✕**. **Suposições visuais minhas (aceitas pela regra R22):** as três com **460 px**; "SALVAR" como botão principal à direita (no financeiro o Cancelar continua antes do Salvar no HTML); o campo do colaborador alinhado aos demais por uma classe, **sem mexer no `ColaboradorSelect`** (componente compartilhado, da Etapa 13). **A 12d8 não existe** (o acompanhamento da OS é o `OplAcompModal`, compartilhado, da Etapa 13). **Respondida pelo usuário depois:** o financeiro **passa a gravar no histórico de alterações**, como o responsável (Etapa 7.29). |
| 02/10/2026 | **Financeiro da OS no histórico de alterações (7.29, resposta do usuário em pergunta clicável):** valor total, mão de obra e data de faturamento passam a gravar **uma linha por campo que mudou**, como o responsável; salvar sem mexer não grava linha. **Correção junto, minha (achada no teste):** um **0 já gravado** deixa de voltar como **vazio** ao salvar sem mexer — só o campo em branco vira vazio. **Suposição minha, não confirmada:** o histórico mostra valores em R$ e datas em dd/mm/aaaa, e "—" para vazio. |
| 02/10/2026 | **Etapa 13 medida e marcada como bloqueada:** o sistema ainda tem **8.019 `style` inline e 8.291 cores escritas à mão em 67 arquivos principais** (a Etapa 12 cobriu só SAC, RH, Logística, Relatórios e Fiscal); aposentar o `TonsVisuais` e o modo escuro cor por cor agora desmontaria o visual das demais telas. **Proposta (a decidir pelo usuário):** continuar a migração tela por tela, das menores para as maiores. |
| 01/10/2026 | **Nova OS do SAC (7.23, resposta do usuário em pergunta clicável):** (1) **"Defeito Reclamado" passa a ser obrigatório** em cada equipamento da OS (o asterisco já estava na tela; 3 das 19 OS reais estão sem defeito); (2) a **demanda do Laboratório traz o defeito digitado**, só nas OS novas (10 das 12 demandas de hoje dizem "Ver OS"; nenhuma existente foi alterada). **Suposições minhas, não confirmadas:** foto ou documento que não sobe **impede abrir a OS** (a alternativa seria abrir a OS sem o arquivo e avisar); e demanda do Laboratório/Engenharia recusada **avisa e a OS fica** (a outra saída seria apagar a OS recém-criada, que não fiz). |
| 01/10/2026 | **Janela "Nova OS" do SAC (12d4):** migrada para a moldura das janelas do RH, **sem mudar campos, textos, ordem ou gravação**. **Suposições visuais minhas (aceitas pela regra R22):** os quadros por seção; **Manutenção Veicular em azul** (era vermelho), Despesas de Campo âmbar e Valores Financeiros verde; Presencial/Remota em pílulas; **no celular, dois campos por linha** (a janela fica 17% mais alta, para os campos não ficarem espremidos); o campo "Nome do Cliente" e o das Observações **ficam como estão** (componentes compartilhados). |
| 01/10/2026 | **Comissão Comercial (R15, Etapa 7.19):** corrigido o fim do mês (mês de 30 dias vinha **vazio sem aviso**; o dia 31 depois das 21h ficava de fora) e o relatório passa a contar **toda OP com NF emitida no mês, em qualquer situação** (**resposta do usuário**, pergunta clicável): antes só a OP exatamente em "Faturado", e ela saía do relatório ao avançar para "Faturado e Disponível para Entrega" (setembro: 3 OPs, nenhuma aparecia). O mesmo critério da Comissão de Técnicos. O erro do banco passa a ser avisado. **Setembro: de 0 para 3 OPs (base R$ 51.766,82), comissão R$ 0,00** (o THIAGO MEDEIROS não tem percentual no RH). O **valor de lote** é a Etapa 7.25 (pedido do usuário: dividir como no RH). |
| 01/10/2026 | **Valor de lote na Comissão Comercial (Etapa 7.25, pedido do usuário):** o relatório passa a usar o valor de **um veículo** do lote (total do lote ÷ nº de veículos), a mesma conta da Comissão de Técnicos, que agora mora num lugar só (`OpLotes.ts`). Setembro: base de **R$ 51.766,82 para R$ 8.045,27**; comissão segue R$ 0,00 (sem percentual do THIAGO no RH). Nenhum número da Comissão de Técnicos mudou (9 testes iguais). |
| 01/10/2026 | **Histórico das comissões (R20, Etapa 7.26):** "Nenhum fechamento encontrado para o período." só aparece **depois do Buscar**; antes a tela pede o período, e **trocar o mês ou o ano volta a pedir a busca** (a mensagem de uma busca vazia era do período anterior). A tabela de uma busca com resultado continua na tela quando se troca o mês, como sempre. O texto do pedido ("Escolha o mês e o ano e clique em Buscar.") é meu. |
| 01/10/2026 | **Tipos de serviço do SAC vazios (resposta do usuário ao achado da 12d2):** **nada a fazer** — a lista está vazia só porque o SAC começou a ser usado de fato hoje e ainda vai ser preenchida. Os 4 tipos "de mentira" mostrados quando a tabela vem vazia ficam como estão. |
| 01/10/2026 | **Como perguntar (pedido do usuário):** as perguntas que forem necessárias durante o trabalho são feitas **na hora em que surgem**, não em lote no fim. |
