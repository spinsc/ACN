# Antes de começar

## Para quem é este manual

Este manual é para quem trabalha no **SAC**: abrir e acompanhar Ordens de Serviço (OS), atender chamados, conduzir os atendimentos em garantia e manter os cadastros. Ele mostra cada tela, o que cada botão faz, **o que o sistema grava** quando você clica e **para onde a OS vai** depois.

Todas as fotos usam **dados de exemplo** (clientes, veículos e nomes inventados). Nenhuma OS real aparece aqui.

**Como cada passo a passo está escrito**

- **Quando usar:** a situação em que você precisa daquele passo.
- **Quem faz:** quem tem o botão (você, o Laboratório, a Produção, a Qualidade, o Fiscal ou o cliente).
- **Passo a passo:** os cliques, na ordem.
- **O que acontece:** o que o sistema grava e quem é avisado.
- **Vai para:** a etapa seguinte da OS e quem age nela.

> **Dica:** os botões aparecem em **negrito**. O símbolo **⋯** é o menu de três pontinhos no fim de cada OS: as ações menos usadas ficam nele.

> **Atenção:** quando o texto vier numa caixa vermelha como esta, é algo que pode travar o trabalho ou apagar um registro. Leia antes de clicar.

## O SAC em uma página

O SAC tem **quatro abas**, no alto da tela:

| Aba | Para que serve | Quando você usa |
|---|---|---|
| **Ordens de Serviço** | Todo serviço em equipamento do Laboratório ou em veículo: orçamento, conserto, troca, garantia. É a aba principal | O dia todo |
| **Chamados NFC** | Chamados de suporte que o cliente abre sozinho pelo veículo (etiqueta NFC) | Para atender quem pediu ajuda |
| **Garantia** | A **ficha** de cada atendimento em garantia: avaliação, fornecedor, custos, autorização, peças, apontamentos | Antes de abrir qualquer OS de garantia |
| **Cadastros** | As listas que alimentam a Nova OS: tipos de equipamento, categorias e tipos de serviço | De vez em quando |

Acima das abas fica a **Agenda do SAC**: compromissos do setor, que você marca como concluídos ou exclui.

### A viagem de uma OS

Toda OS passa por **etapas**. Em cada etapa existe **uma** pessoa ou setor que precisa agir. O sistema mostra isso em cada OS com a linha **"Aguarda: …"**.

FLUXO: SAC abre a OS > Laboratório ou Produção avalia > SAC envia o orçamento ao cliente > Cliente aprova > Laboratório ou Produção executa > Qualidade confere (veículo) > SAC envia ao Fiscal > Fiscal emite a nota > SAC entrega ao cliente

Duas variações importantes:

- **OS sem cobrança** (garantia dentro da cobertura ou cortesia): **não tem orçamento nem aprovação do cliente e não vai ao Fiscal**. Termina na entrega.
- **OS de veículo**: a Produção marca a data, o SAC confirma com o cliente (o **aceite**), a Produção executa e a **Qualidade** confere antes de a OS voltar ao SAC.

### Quem é quem nas etapas

| Quem | O que faz na OS |
|---|---|
| **SAC** (você) | Abre a OS, envia orçamento, registra a resposta do cliente, confirma a data do veículo, envia ao Fiscal, entrega, cancela |
| **Laboratório** | Diagnostica e executa o conserto dos equipamentos |
| **Produção** | Marca a data, recebe o veículo, verifica, orça e executa a manutenção veicular |
| **Qualidade (CQ)** | Confere o serviço do veículo antes de voltar ao SAC |
| **Fiscal** | Emite a nota fiscal das OS cobradas |
| **Cliente** | Aprova ou recusa o orçamento e retira o equipamento |

## Palavras que aparecem na tela

| Palavra | O que significa |
|---|---|
| **OS** | Ordem de Serviço. Número no formato **OS-0044/2026** (sequência do ano) |
| **Etapa** | Em que ponto do caminho a OS está (aparece como selo colorido) |
| **Aguarda** | Quem precisa agir agora (SAC, Laboratório, Produção, Qualidade, Fiscal ou Cliente) |
| **OS parada** | OS que está **7 dias ou mais** na mesma etapa. Aparece em vermelho |
| **Cobrada / Sem cobrança** | Se o serviço será faturado ao cliente ou não (garantia ou cortesia) |
| **Lote** | Várias OS abertas juntas (por exemplo, 7 viaturas do mesmo cliente). Aparecem num cartão só no quadro |
| **Ficha** | O atendimento em garantia da aba **Garantia** (número **GAR-0001/2026**) |
| **PV** | Pedido de venda, quando a OS veio de uma venda do CRM |
| **Provisionamento** | Marcar a data em que o veículo será atendido |
| **Aceite SAC** | Você confirma com o cliente a data marcada pela Produção |
| **CQ** | Controle de Qualidade: a Qualidade confere o serviço do veículo |
| **Cortesia** | Serviço entregue sem cobrar, com motivo registrado |
| **Atendimento já realizado** | Serviço que foi feito fora da fábrica antes de a OS ser concluída no sistema |

---

# Aba Ordens de Serviço

## A tela, de cima para baixo

![A aba Ordens de Serviço inteira, com os dados de exemplo](img/01-tela-inicial.jpg)

A tela tem sete partes, nesta ordem:

1. **Agenda do SAC.** Compromissos do setor. Filtros **Hoje, Semana, Mês, Todos**; **Meus** ou **Todos**; **Ver concluídos**. O botão **+ Nova** abre o *Novo Compromisso*: título, descrição (use **@Nome** para avisar alguém), data e hora e os participantes.
2. **As quatro abas** (Ordens de Serviço, Chamados NFC, Garantia, Cadastros).
3. **O título "SAC — Ordens de Serviço (N)"** com o número de OS que passam pelos filtros, o seletor **Lista | Kanban** e o botão verde **Nova OS**.
4. **A legenda de fluxo.** Três linhas com as etapas de cada caminho (Laboratório, Veículo presencial, Veículo remota). Serve de consulta: mostra por quais etapas a OS passa.
5. **O painel "O que está com cada setor hoje".**
6. **Os filtros.**
7. **O quadro (Kanban) ou a lista.**

![As quatro abas](img/02-abas.jpg)

### O painel "O que está com cada setor hoje"

![Painel que mostra quem tem que agir](img/04-painel-quem-age.jpg)

- Os botões **SAC, Laboratório, Produção, Qualidade, Fiscal, Cliente** mostram quantas OS aguardam cada um e quantas já estão paradas (por exemplo, *SAC (12 · 3 paradas)*). **Clique num deles** para filtrar o quadro e a lista só com as OS daquele setor. **Todos** limpa.
- A **faixa vermelha** aparece quando há OS esperando o SAC há 7 dias ou mais. Diz qual é a mais parada. O botão **Ver na lista** abre a lista já filtrada por SAC e por "paradas".
- A **tabela** mostra as **6 OS mais paradas que são do SAC**, com a etapa, **o que fazer** e **há quantos dias** a OS está na etapa. Para ver todas, use o botão **SAC** do painel.

> **Dica:** comece o dia pela faixa vermelha. Ela lista justamente o que está esperando por você.

### Os filtros

![Linha de filtros](img/05-filtros.jpg)

| Filtro | O que faz |
|---|---|
| **Buscar OS / cliente / equip.** | Procura pelo número da OS, nome do cliente ou equipamento. Não diferencia acento nem maiúscula |
| **Todos os status** | Mostra só uma etapa (por exemplo, "Orç. Enviado") |
| **Todos os tipos** | Orçamento, Conserto, Troca ou Garantia |
| **Presencial / Remota** | **Veiculares** (todas as OS de veículo), **Presencial** ou **Remota** |
| **Todas as empresas** | ACN, DETECH ou **Sem empresa** (OS antigas) |
| **Parada há…** | OS paradas há 7, 15 ou 30 dias ou mais |
| **Limpar** | Desliga todos os filtros de uma vez, incluindo o painel e a busca |

> **Atenção:** se uma OS "sumiu", confira se há filtro ligado (o número em "(N)" no título diz quantas passaram). As OS **Reprovadas** e **Canceladas** não aparecem no quadro: ficam na lista, pelo filtro de status.

### O quadro (Kanban)

![O quadro com as quatro colunas](img/06-quadro.jpg)

O quadro tem **quatro colunas**. Cada OS fica na coluna da etapa em que está:

| Coluna | Etapas dentro dela |
|---|---|
| **PENDENTE** | Aberta, Diagnóstico |
| **EM ANDAMENTO** | Orçamento Pronto, Orç. Enviado, Aprovado, Em Execução, Em Cotação, Aguardando Aprovação Cliente, Em Provisionamento, Aguardando Aceite SAC, Provisionada, Aguardando Início, Verificação e Orçamento, Aguardando CQ |
| **NO FISCAL / AGUARDANDO ENTREGA** | Aguardando Envio Fiscal, Aguardando Emissão NF, Faturada - Aguardando Entrega |
| **CONCLUÍDO** | Concluído, Entregue |

O número no canto de cada coluna é a quantidade de cartões. Você pode **arrastar o cartão** de uma coluna para outra: veja *Mover a OS entre as etapas*.

Duas faixas podem aparecer acima do quadro: **"N OS reprovadas ficam fora do quadro"** e **"N OS canceladas ficam fora do quadro e da lista"**. O botão **Ver na lista** leva até elas.

### A lista

![A lista de OS](img/11-lista.jpg)

Mostra as mesmas OS em linhas. As colunas são: **Nº OS** (com empresa, PV, ficha e lote), **Tipo**, **Atend.** (Presencial ou Remota), **Equipamento**, **Cliente**, **Abertura**, **Prazo Orç.**, **Valor**, **KPI Orç.**, **KPI Exec.**, **Status** e **Ações**.

- A linha fica **rosada** quando a OS está **Reprovada** ou **parada**.
- **KPI Exec.** só aparece na OS remota: compara as **horas cobradas na cotação** com as **horas reais** apontadas pela Produção. **▲** quer dizer que você cobrou mais horas do que a Produção levou; **▼**, menos.
- Os botões da coluna **Ações** são os mesmos do cartão do quadro.

## Como ler o cartão de uma OS

![Um cartão de OS no quadro](img/07-cartao-da-os.jpg)

| O que você vê | O que significa |
|---|---|
| **OS-0103/2026** | Número da OS |
| **ACN** ou **DETECH** | Empresa da OS. **Clique** para trocar (ou para definir, em OS antiga sem empresa) |
| **PV 0999** | Pedido de venda de origem, quando a OS veio do CRM |
| **Ficha GAR-0003/2026** | A ficha de garantia da OS. **Clique** para abrir a ficha |
| **Lote** | A OS faz parte de um lote |
| **Central de comando · CC-20** | Equipamento e modelo |
| Nome do cliente | Cliente |
| **Selo colorido** (por exemplo, *Orçamento Pronto*) | A etapa atual, seguida do tipo de serviço |
| **Aguarda: SAC** | Quem tem que agir agora |
| **há 3 dias nesta etapa** | Tempo na etapa. Vira **"parada há 9 dias"**, em vermelho, a partir de 7 dias |
| **Barra com "etapa 2 de 9"** | Quanto da viagem a OS já fez, pelo caminho dela. As partes **verdes** estão feitas, a **azul** é a atual |
| **Abertura, Prazo orç., R$** | Datas e valor |
| **Acomp.** | Acompanhamento da OS (anotações do setor) |
| **Botão verde** (por exemplo, **Enviar**) | O passo que a OS espera de **você** nesta etapa |
| **⋯** | Menu com as outras ações |

> **Dica:** **clique no cartão** (fora dos botões) para abrir o **resumo completo** da OS: andamento, dados do serviço e do cliente, valores, itens, compras, responsáveis, observações, arquivos e fotos.

![O resumo da OS](img/10b-resumo-topo.jpg)

Quando a etapa é de **outro setor**, no lugar do botão verde aparece um texto cinza: **"Aguardando Qualidade"**, **"Aguardando Fiscal"**, **"Aguardando o Laboratório iniciar"** ou **"Em execução no Laboratório"**. Não há nada a fazer até o setor agir.

## Os caminhos da OS

Cada OS segue **um** dos cinco caminhos abaixo. A barra de progresso do cartão mostra o caminho dela.

![A legenda de fluxo, com os caminhos](img/03-legenda-de-fluxo.jpg)

### Caminho 1: Laboratório, cobrada

FLUXO: Diagnóstico > Orçamento Pronto > Orç. Enviado > Aprovado > Em Execução > Concluído > Aguardando Emissão NF > Faturada - Aguardando Entrega > Entregue

| Etapa | Quem age | O que acontece | Vai para |
|---|---|---|---|
| **Diagnóstico** | Laboratório | A OS nasce aqui e o Laboratório recebe uma demanda de diagnóstico. Ele examina e informa o valor | Orçamento Pronto |
| **Orçamento Pronto** | **SAC** | Você envia o orçamento ao cliente | Orç. Enviado |
| **Orç. Enviado** | Cliente (o SAC cobra) | Você registra a resposta: **Aprovar** ou **Reprovar** | Aprovado ou Reprovado |
| **Aprovado** | Laboratório | Nasce a demanda de execução. O Laboratório inicia | Em Execução |
| **Em Execução** | Laboratório | Conserto em andamento | Concluído |
| **Concluído** | **SAC** | Você envia ao Fiscal (valor e CPF/CNPJ da nota) | Aguardando Emissão NF |
| **Aguardando Emissão NF** | Fiscal | O Fiscal emite a nota | Faturada - Aguardando Entrega |
| **Faturada - Aguardando Entrega** | **SAC** | Você entrega ao cliente, com assinatura | Entregue |

### Caminho 2: Laboratório, sem cobrança

FLUXO: Aprovado > Em Execução > Concluído > Entregue

A OS **já nasce "Aprovado"** (aprovação automática) e o Laboratório recebe a demanda de execução na hora. Depois de **Concluído**, o SAC faz a **Entrega**. Não há orçamento e **não vai ao Fiscal**.

### Caminho 3: veículo, avaliação remota, cobrada

FLUXO: Em Cotação > Aguardando Aprovação Cliente > Em Provisionamento > Aguardando Aceite SAC > Aguardando Início > Em Execução > Aguardando CQ > Aguardando Envio Fiscal > Aguardando Emissão NF > Faturada - Aguardando Entrega > Entregue

Na avaliação **remota** o preço sai **antes** de o veículo chegar. Você monta os itens da cotação e envia ao cliente. Só depois de aprovada a Produção marca a data.

| Etapa | Quem age | O que acontece |
|---|---|---|
| **Em Cotação** | **SAC** | Monta os **Itens** e usa **Enviar Cotação** |
| **Aguardando Aprovação Cliente** | Cliente (o SAC registra) | **Aprovado** ou **Recusado** |
| **Em Provisionamento** | Produção | Marca a data e o período do atendimento |
| **Aguardando Aceite SAC** | **SAC** | Confirma a data com o cliente |
| **Aguardando Início** | Produção | Recebe o veículo e inicia |
| **Em Execução** | Produção | Manutenção em andamento |
| **Aguardando CQ** | Qualidade | Confere o serviço |
| **Aguardando Envio Fiscal** | **SAC** | Informa o número de série de cada item e envia ao Fiscal |
| **Aguardando Emissão NF** | Fiscal | Emite a nota |
| **Faturada - Aguardando Entrega** | **SAC** | Entrega o veículo |

### Caminho 4: veículo, avaliação presencial, cobrada

FLUXO: Em Provisionamento > Aguardando Aceite SAC > Provisionada > Verificação e Orçamento > Aguardando Aprovação Cliente > Aguardando Início > Em Execução > Aguardando CQ > Aguardando Envio Fiscal > Aguardando Emissão NF > Faturada - Aguardando Entrega > Entregue

Na avaliação **presencial** o veículo vem primeiro e o orçamento sai da **verificação** feita pela Produção.

| Etapa | Quem age | O que acontece |
|---|---|---|
| **Em Provisionamento** | Produção | Marca a data do atendimento |
| **Aguardando Aceite SAC** | **SAC** | Confirma a data com o cliente |
| **Provisionada** | Produção | Aguarda o veículo. Quando ele chega, a Produção marca **Chegou** |
| **Verificação e Orçamento** | Produção | Examina o veículo e **insere os materiais** do orçamento |
| **Aguardando Aprovação Cliente** | **SAC** | Você vê (ou edita) o orçamento e registra **Aprovado** ou **Recusado** |
| **Aguardando Início** | Produção | Atribui o técnico e inicia |
| **Em Execução, Aguardando CQ** | Produção, Qualidade | Executam e conferem |
| **Aguardando Envio Fiscal** e depois | **SAC**, Fiscal | Igual ao caminho 3 |

> **Atenção:** a barra de progresso do cartão, neste caminho, **volta uma casa** quando você aprova o orçamento (a etapa "Aguardando Início" é desenhada como "Provisionada"). A OS não voltou: é só o desenho da barra.

### Caminho 5: veículo, sem cobrança (garantia ou cortesia)

FLUXO: Em Provisionamento > Aguardando Aceite SAC > Provisionada > Em Execução > Aguardando CQ > Concluído > Entregue

A OS **nasce em "Em Provisionamento"**, sem cotação. A Produção marca a data, o SAC dá o **aceite**, o veículo é atendido e, depois da Qualidade, a OS vai direto a **Concluído**; o SAC faz a **Entrega** do veículo. **Não vai ao Fiscal.**

> **Atenção:** pelo que a tela da Produção faz hoje (conferido no código, **ainda não visto acontecendo**), o veículo desta OS pode passar por **"Verificação e Orçamento"** e por **"Aguardando Aprovação Cliente"** (onde aparecem os botões **Aprovado** e **Recusado** do SAC) antes de iniciar. Se isso acontecer, clique **Aprovado**. Nessas etapas e na do aceite, a **barra de progresso some**, porque elas não fazem parte do caminho da OS sem cobrança. A diferença entre este caminho e o que a Produção faz está registrada como ponto de melhoria (**a confirmar** com a Produção).

### Caminho 6: OS lançada pelo card do CRM

A OS que nasce da **venda** (janela *Nova OP / OS* do card do CRM) já vem **vendida**: cobrada, aprovada, **sem cotação**, com o valor da venda e o pedido de venda (selo **PV**). Quem lançou escolheu **quem executa**:

- **Laboratório:** nasce **Aprovado** e o Laboratório recebe a demanda de execução. No cartão aparece **"Aguardando o Laboratório iniciar"** e depois **"Em execução no Laboratório"**.
- **O SAC conclui:** nasce **Em Execução** e o botão verde é **Concluir OS**.

Depois de **Concluído**, a OS segue o caminho 1: **Enviar ao Fiscal** e **Entrega**.

---
