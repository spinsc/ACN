# Antes de começar

## Para quem é este manual

Este manual é para **todo mundo que pede, agenda ou confere um serviço feito por quem é de fora da fábrica**: película, plotagem, pintura, pintura eletrostática, lavagem, funilaria, mecânica, corte e dobra e outros. Ele mostra cada tela, o que cada botão faz, **o que o sistema grava** quando você clica e **quem é avisado** depois.

Todas as fotos usam **dados de exemplo** (clientes, vendas, prestadores e nomes inventados). Nenhum serviço real aparece aqui.

**Como cada passo a passo está escrito**

- **Quando usar:** a situação em que você precisa daquele passo.
- **Quem faz:** quem tem o botão.
- **Passo a passo:** os cliques, na ordem.
- **O que acontece:** o que o sistema grava e quem é avisado.
- **Vai para:** a coluna seguinte do quadro.

> **Dica:** os botões aparecem em **negrito**. O símbolo **⋯** é o menu de três pontinhos de cada cartão: as ações menos usadas ficam nele.

> **Atenção:** quando o texto vier numa caixa vermelha como esta, é algo que pode travar o trabalho ou fazer você perder um registro. Leia antes de clicar.

## O serviço em uma página

Um **serviço de terceiro** é um pedido de um trabalho que a fábrica entrega a um prestador de fora. Ele tem um número (**TS-00044**), um tipo, um prestador, um dia marcado, um valor combinado antes e um **valor final** depois que o trabalho é feito. **Todo mundo pode pedir e todo mundo vê todos os serviços; cada um mexe no que é seu.**

FLUXO: A definir > Agendado > Realizado

| Coluna | O que significa | Quem age |
|---|---|---|
| **A definir** | O serviço foi pedido; falta escolher o prestador e marcar o dia | Quem pediu (e, em película, plotagem e pintura, a Adaptação marca o dia) |
| **Agendado** | Prestador, dia e período marcados | Quem pediu ou a Adaptação dá como realizado |
| **Realizado** | O serviço foi feito e conferido, com o valor final | O Financeiro recebe o pedido de pagamento |
| **Cancelado** | O pedido foi cancelado, com o motivo (não aparece no quadro; fica no filtro **Cancelados**) | Ninguém: o cancelado não volta, peça de novo |

Voltar um serviço de coluna ou cancelar **sempre pede um motivo**, que fica no histórico. **Nada se apaga.**

Várias coisas **não são colunas**, são **selos** que o sistema calcula sozinho no cartão: *Sem prestador*, *Sem data*, *Atrasado*, *Choque de data*, *Hoje*, *No prestador desde…*, *A pagar*, *Pagamento pedido* e *Pago*. Assim ninguém precisa de um passo a mais para atualizar.

### Quem é quem

| Quem | O que faz no serviço |
|---|---|
| **Qualquer usuário** | Pede o serviço, vê todos os serviços (quadro, agenda, lista e a OP), imprime o contrato |
| **Quem pediu** | Edita o seu serviço (prestador, valor, dia), dá como realizado, cancela, pede o pagamento. **Menos o dia** de película, plotagem e pintura: esse é da Adaptação |
| **Adaptação** | Marca o dia de película, plotagem e pintura (mesmo quando o Comercial pediu), dá como realizado esses tipos, monta e fecha as ordens da pintura eletrostática, cadastra prestadores |
| **Gerentes e Admin** | Decidem sobre qualquer pedido. Só o **Admin** edita os tipos de serviço e o modelo do contrato |
| **Quem vê valores** | Vê o valor combinado, o final, a diferença, o contador **A pagar** e o relatório com dinheiro. Quem não vê valores vê só as quantidades |

## Palavras que aparecem na tela

| Palavra | O que significa |
|---|---|
| **Tipo de serviço** | A categoria do trabalho (Película, Lavagem, Corte e dobra…). O tipo diz **quem marca o dia** e se usa ordem em lote |
| **Prestador** | A empresa ou pessoa de fora que faz o serviço (cadastro próprio do módulo, não o de fornecedores do Compras) |
| **Ligação** | A OP, a OS do SAC, a demanda ou o projeto da Engenharia a que o serviço pertence |
| **Venda** | O número da venda sem o /NN da unidade. Os carros da mesma venda andam juntos num **cartão de grupo** |
| **Valor combinado** | O que ficou combinado com o prestador **antes** |
| **Valor final** | O que o prestador cobrou **depois**; é obrigatório ao dar como realizado, até zero |
| **Visita** | Os serviços da mesma venda, mesmo tipo, mesmo prestador e mesmo dia: contam **uma visita só** (no Quadro, na Agenda, no contrato e no choque de data) |
| **Choque de data** | O mesmo prestador tem **duas visitas diferentes** no mesmo dia e período. Só avisa, nunca impede |
| **Ordem de serviço em lote** | Para a pintura eletrostática: várias peças de vários serviços vão **juntas** ao prestador, numa ordem assinada (número **OT-00001**) |
| **Contrato** | A folha impressa que o prestador assina, de qualquer serviço |
| **Saída da vistoria** | O registro da Vistoria de pátio de que o carro ou a peça saiu para o prestador |

# A tela de Serviços de terceiros

## Visão geral

![A tela de Serviços de terceiros: o Quadro com as três colunas](img/01-quadro.jpg)

No alto ficam o título e dois botões: **Atualizar** e **Solicitar serviço** (botão verde). Logo abaixo ficam as abas e, nas três visões dos serviços (Quadro, Agenda e Lista), a barra de contadores e filtros.

| Aba | Para que serve | Quem edita |
|---|---|---|
| **Quadro** | Abre primeiro: os serviços em três colunas, com o número de serviços em aberto na aba | Quem pode mexer em cada serviço |
| **Agenda** | Quem está onde em cada dia: semana ou mês, por prestador ou por tipo | (só consulta; clicar abre o serviço) |
| **Lista** | Os mesmos serviços em tabela, para conferir e filtrar | Quem pode mexer em cada serviço |
| **Relatório do mês** | Por prestador, no mês: quantos serviços, quanto combinado, quanto cobrado e o que falta pedir ao Financeiro | (só consulta) |
| **Ordens de pintura** | A fila de serviços esperando ordem e as ordens em lote da pintura eletrostática | Admin, gerentes e Adaptação |
| **Prestadores** | O cadastro de quem faz os serviços | Admin, gerentes e Adaptação |
| **Tipos de serviço** | Os tipos, com quem marca o dia | Só o Admin |
| **Modelo do contrato** | O texto e os dados das empresas que saem no contrato e na ordem | Só o Admin (todos leem) |

O sistema **lembra a última visão** (Quadro, Agenda ou Lista) de cada pessoa neste computador.

### Contadores e filtros

![Os contadores e os filtros do alto](img/02-contadores-e-filtros.jpg)

Os **contadores** do alto contam e também filtram (clique para ligar, clique de novo para desligar). Eles valem **nas três visões**.

| Contador | O que conta |
|---|---|
| **Sem prestador** | Pedidos em A definir que ainda não têm prestador escolhido |
| **Sem data** | Pedidos em A definir sem dia marcado |
| **Atrasados** | Agendados cujo dia já passou e que não foram dados como realizados |
| **Choque de data** | Agendados em que o mesmo prestador tem outra visita no mesmo dia e período |
| **A pagar** | Realizados, com valor final maior que zero, cujo pagamento **ainda não foi pedido** ao Financeiro (**só aparece para quem vê valores**) |

A fileira dos contadores começa com **Tudo** (sem nenhum contador ligado). Embaixo vêm a **busca** (número, descrição, OP, prestador, quem pediu), as listas de **tipo**, **prestador**, **quem pediu** (com a opção **Só os que eu pedi**) e **setor** de quem pediu, o período (**dois campos de data, de … a …**, que olham o **dia do serviço**: o dia feito, o agendado ou, se ainda não foi marcado, o desejado) e os botões **Ativos**, **Cancelados** e **Todos**. Quando há filtro ligado aparece **Limpar filtros (N)**.

> **Dica:** por padrão a tela mostra o que está em aberto e o que terminou **nos últimos 120 dias**. Se houver serviços mais antigos de fora, uma linha avisa quantos são, com o botão **Mostrar todos**.

## O Quadro

O cartão mostra o tipo, o número (**TS-…**), a descrição, a ligação (OP, OS, demanda ou projeto), o prestador, o dia e o período, o valor combinado (só para quem vê valores) e os **selos**.

### Cartão de grupo (venda com vários carros)

![A janela de um grupo de carros](img/03-grupo-de-carros.jpg)

**O veículo e o que será feito nele.** Todo cartão de serviço ligado a uma OP ou a uma OS mostra, logo abaixo da descrição, o **veículo** (modelo e placa, ou o chassi quando não há placa) e as **peças** que vão ao prestador. Nos serviços de **pintura** e de **pintura eletrostática** a lista de peças se chama **O que será pintado**; nos outros, **Peças**. O cartão de grupo mostra quantos carros de cada modelo há ("2 Ranger · 1 Hilux SW4"). A mesma informação aparece na janela do serviço (linha **Veículo**), na janela do grupo, na **Agenda** (dentro da visita) e na **busca**: dá para achar o serviço pela placa, pelo chassi ou pelo modelo. Quando a OP não tem modelo, placa nem chassi cadastrados, o cartão diz, em cinza, **Sem veículo informado na OP** (quem cadastra a OP completa o dado). Se o sistema não conseguir ler o veículo, aparece, em vermelho, **Veículo não lido** e uma faixa com **Tentar de novo**.

Uma venda com vários carros gera **um serviço por carro** (cada OP /NN). Para não virar dezenas de cartões iguais, o Quadro junta **os carros da mesma venda, do mesmo tipo, da mesma coluna, do mesmo prestador e do mesmo dia** num **cartão de grupo** ("Película · venda 1673.2609 · 10 carros"). Clique nele para abrir a lista dos carros, **marque os carros** que quer mexer (há **Marcar todos**) e use os botões da janela: os **passos** (**Agendar**, **Dar como realizado**…), **Ajustar os marcados** (prestador, valor combinado, dia desejado e observação de todos de uma vez, deixando em branco o que não quer mudar), **Montar ordem de serviço** e **Imprimir contrato**. Tudo vale só para os marcados e é **tudo ou nada**: se um falhar, nenhum muda. O carro que sai do grupo (outro dia, outro prestador, cancelado) vira cartão próprio.

### Mover um serviço

- **Arrastar** o cartão para outra coluna (só no computador), ou
- o menu **⋯** do cartão, no grupo **Passar para** (no celular e no tablet é o caminho).

Quando o serviço não pode ir para a coluna escolhida, a tela diz **o motivo** (por exemplo: "o dia de película é marcado pela Adaptação"). Soltar na coluna **Agendado** abre a janela de agendar; soltar em **Realizado** abre a de dar como realizado; voltar de coluna ou cancelar pede o motivo.

> **Atenção:** o serviço que está numa **ordem de serviço em lote montada ou enviada** não se arrasta nem se edita sozinho. A janela dele mostra uma faixa azul e o botão **Abrir a ordem**: quem mexe é a ordem.

## A Agenda

![A Agenda da semana, por prestador, com um choque de data em vermelho](img/04-agenda-semana.jpg)

A Agenda mostra **a visita**, não cada carro. Uma visita é o mesmo agrupamento do Quadro: "manhã · Película · 3 carros · venda 1673.2609".

- **Semana** (segunda a domingo) ou **Mês** (grade; mostra até 3 visitas por dia e **mais N**, que leva à semana).
- **Por prestador** (uma linha por prestador, com **Sem prestador** por último) ou **por tipo**.
- Os botões **anterior**, **esta** e **próxima** andam no tempo; o sistema lembra a escolha.
- **Choque de data** aparece **em vermelho** no cartão, no dia e na faixa do alto.
- **Atrasado há N dias**, **hoje**, o realizado esmaecido e o pedido que só tem **dia desejado** (tracejado).
- Clicar na visita abre a janela do serviço (ou a do grupo, ou a da ordem).

## A Lista

![A Lista dos serviços, em tabela](img/05-lista.jpg)

A Lista tem os mesmos serviços, filtros e contadores em tabela, para conferência. A coluna **Veículo** mostra o modelo e a placa (ou o chassi) do carro, e, embaixo da descrição, aparecem as peças (ou **O que será pintado**, nos serviços de pintura). A coluna **Ações** fica fixa à direita. O menu **⋯** de cada linha é o mesmo do Quadro.

## O Relatório do mês

![O Relatório do mês: cartões, por prestador e por tipo](img/06-relatorio.jpg)

O relatório responde: **quantos serviços cada prestador fez no mês, quanto estava combinado, quanto cobrou e o que ainda falta pedir ao Financeiro.**

**A regra que vale para todas as contas:** o serviço conta **no mês em que foi dado como realizado** (o **dia em que foi feito**). Ao lado vem **Ainda a fazer**: os serviços **agendados para o mês** que ainda não foram dados como realizados. Pedidos sem dia marcado e cancelados não entram.

No alto ficam o mês (**◀** anterior, **▶** seguinte, **Este mês**), **Atualizar**, **Baixar planilha** e **Imprimir**. Abaixo, os cartões:

| Cartão | O que mostra |
|---|---|
| **Serviços realizados** | Quantos e em quantos prestadores |
| **Combinado** | A soma dos valores combinados dos realizados (diz quantos estão sem valor combinado) |
| **Cobrado** | A soma dos valores finais |
| **Diferença** | Cobrado menos combinado, só dos serviços que têm os dois valores (vermelho quando cobrou **mais**) |
| **A pedir ao Financeiro** | O valor dos realizados sem pedido de pagamento: **a mesma conta do contador A pagar do Quadro** |
| **Ainda a fazer** | Agendados no mês e sem baixa, com o combinado |

![Um prestador aberto no relatório, com cada serviço](img/07-relatorio-prestador.jpg)

Em **Por prestador**, clique no **nome do prestador** para abrir a lista dos serviços dele: o número (clique para abrir o serviço), o tipo, a descrição e a ligação, o dia, os valores e a **situação do pagamento** (**Pago**, **Pedido ao Financeiro**, **A pedir**, **Sem valor a pagar** ou **Não conferido**). **Por tipo de serviço** repete as contas por tipo.

> **Atenção:** **quem não vê valores** vê só as quantidades: sem colunas de dinheiro, sem o cartão **A pedir** (dizer que há serviço a pagar é dizer que há valor), e na planilha e na folha impressa também.

> **Atenção:** se um serviço foi **agendado em mês anterior e continua sem baixa**, uma faixa **âmbar** avisa quantos são. Eles **não entram nas contas do mês**: confira na Lista, no filtro **Atrasados**.

> **Dica:** se a leitura do banco falhar, a faixa vermelha diz que **não foi possível ler** e oferece **Tentar de novo**. O relatório **nunca** mostra "nenhum serviço" no lugar de um erro, e não deixa os números de outro mês na tela como se fossem do mês escolhido.
