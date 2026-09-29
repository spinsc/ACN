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
ter o nome antigo desde a migração de 29/09/2026 (`select count(*) … where
status_geral = 'Aprovado CQ - Aguardando Liberacao Comercial'` deve dar zero, por
alguns dias: abas antigas ainda abertas podiam gravá-lo). Esse é o passo "aperta o
código" do princípio 4. Manter a leitura do nome antigo em qualquer tela que
consulte **histórico**, se aparecer alguma.

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

### ⬜ Etapa 6 — Painel único "onde está isso agora" — o coração do pedido
Um componente (provavelmente estendendo `OplDetalheModal`/`OpVinculos.ts`,
que já existem) que mostre, num lugar só: estágio do funil → OP → status
atual → pendências abertas → frete (se houver) → faturamento. Reaproveitar
`OPL_PIPELINE`/barra de progresso já existente, hoje subutilizada. Levar um
resumo disso pro card do Kanban do CRM também, sem precisar abrir o
detalhe.

### ⬜ Etapa 7 — Trocar `alert`/`confirm` nativos pelo padrão do sistema
Generalizar `Feedback.tsx` (`confirmar`/`pedirTexto` já existem) para cobrir
também mensagens de sucesso/erro com a hierarquia visual do sistema, e
trocar os usos mais críticos primeiro (aprovações, exclusões).

### ⬜ Etapa 8 — Aba "pendente da minha aprovação" em Compras
Hoje só existe menção/e-mail. Uma aba/filtro dedicado pra quem tem
`pode_aprovar_compra=true` ver de cara o que está esperando por ele.

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
| 29/09/2026 | "OPL" só vira "OP" onde é texto para ler. **Ficam:** `tipo_op` (OPL = OP da ACN, OPD = da Detech), o tipo de documento de Vistorias, o par "OPL ou OPD", identificadores, comentários, o que as pessoas digitaram e o histórico já gravado. |
