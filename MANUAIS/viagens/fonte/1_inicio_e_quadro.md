# Antes de começar

## Para quem é este manual

Este manual é para quem monta, aprova ou prepara **viagens de equipe**: levar a equipe da fábrica até o cliente para instalar, ajustar ou treinar. Ele mostra cada tela, o que cada botão faz, **o que o sistema grava** quando você clica e **para onde a viagem vai** depois.

Todas as fotos usam **dados de exemplo** (clientes, cidades, veículos e nomes inventados). Nenhuma viagem real aparece aqui.

**Como cada passo a passo está escrito**

- **Quando usar:** a situação em que você precisa daquele passo.
- **Quem faz:** quem tem o botão (quem monta, a direção, a Adaptação, o Comercial ou o Financeiro).
- **Passo a passo:** os cliques, na ordem.
- **O que acontece:** o que o sistema grava e quem é avisado.
- **Vai para:** a coluna seguinte do quadro.

> **Dica:** os botões aparecem em **negrito**. O símbolo **⋯** é o menu de três pontinhos de cada cartão: as ações menos usadas ficam nele.

> **Atenção:** quando o texto vier numa caixa vermelha como esta, é algo que pode travar o trabalho ou apagar um registro. Leia antes de clicar.

## A viagem em uma página

Uma viagem é uma **ida da equipe até o cliente e a volta**. Ela nasce com o roteiro e o orçamento, é aprovada pela direção, ganha a parte de cada setor (equipe e carro, contrato, dinheiro), acontece e, no fim, tem o custo real conferido contra o orçado.

FLUXO: Aberta > Em aprovação > Provisionamento > Andamento > Finalizada

| Coluna | O que significa | Quem age |
|---|---|---|
| **Aberta** | O roteiro e o orçamento estão sendo montados | Quem tem a aba Viagens |
| **Em aprovação** | Espera a direção aprovar ou recusar | Direção (Admin e gerentes) |
| **Provisionamento** | Aprovada: cada setor preenche a sua parte | Adaptação, Comercial e Financeiro |
| **Andamento** | A equipe saiu e está viajando | Adaptação (informa a volta) |
| **Finalizada** | A equipe voltou e a viagem foi encerrada | Financeiro lança o custo real |
| **Não aprovada** | A direção recusou (pede um motivo); pode ser reaberta | Quem montou |

Voltar uma viagem de coluna, recusar ou reabrir **sempre pede um motivo**, que fica no histórico da viagem.

### Quem é quem

| Quem | O que faz na viagem |
|---|---|
| **Quem tem a aba Viagens** | Monta o roteiro e o orçamento, envia para aprovação, vê todas as partes, usa a Agenda, o relatório de Custos e a Frota |
| **Direção** (Admin e gerentes; a equipe do Comercial e das Licitações vale como gerente do setor) | Aprova ou recusa, volta uma viagem já aprovada, reabre uma finalizada |
| **Adaptação** | Escolhe a equipe, o veículo da frota e o km de saída; marca que a equipe saiu e voltou; informa o km de volta |
| **Comercial** | Descreve o serviço, anota o contrato e sobe os arquivos do contrato |
| **Financeiro** | Libera a verba, define o pedágio e o hotel, lança o custo real e anexa os comprovantes |

## Palavras que aparecem na tela

| Palavra | O que significa |
|---|---|
| **Roteiro** | O ponto de saída, as paradas e quantos dias a equipe fica em cada uma |
| **Rota** | O caminho calculado pelo sistema: km, tempo de direção e trechos |
| **Roteiro dia a dia** | A rota desenhada dia por dia: onde a equipe anda, onde dorme e onde trabalha |
| **Orçado** | O custo que o sistema calcula antes de a viagem sair |
| **Verba** | O dinheiro que o Financeiro libera para a equipe levar |
| **Custo real** | O que a viagem custou de fato, lançado depois pelo Financeiro |
| **Frota** | O cadastro dos veículos da empresa usados em viagem |
| **Uso interno** | O veículo ocupado um dia ou mais **fora de viagem** (buscar ou levar material, visita, reparo). Aparece na Agenda e trava a saída de uma viagem que caia em cima |
| **Comprovante** | A nota ou o recibo de um item do custo real |

# A tela de Viagens

## Visão geral

![A tela de Viagens: o quadro com as seis colunas](img/01-tela-inicial.jpg)

No alto ficam o título e dois botões: **Frota** (cadastro dos veículos) e **Nova viagem** (botão verde). Logo abaixo ficam a forma de ver, os filtros e a busca; depois, o quadro.

### Barra do alto

![A barra do alto: formas de ver, filtro de data e busca](img/02-barra-do-alto.jpg)

- **Forma de ver:** **Quadro** (as colunas), **Lista** (uma linha por viagem), **Agenda** (quem está onde, por dia) e **Custos** (relatório de custo real × orçado).
- **Filtro de data de saída:** **Todas as datas**, **Saída atrasada** (a data passou e a equipe não saiu), **Saem em 7 dias** e **Sem data**. O número entre parênteses é quantas viagens cabem em cada filtro.
- **Busca:** procura no título, nas cidades, na OP ou PV ligados e em quem criou a viagem.

> **Dica:** o filtro de data e a busca valem para o Quadro e a Lista. Na Agenda e em Custos eles ficam escondidos.

### O cartão da viagem

![Um cartão com o selo vermelho de saída próxima](img/03-cartao-saida-proxima.jpg)

Cada viagem é um cartão. De cima para baixo:

- **Título** e o menu **⋯**.
- **O caminho:** do ponto de saída às paradas, e a palavra **volta** quando é ida e volta.
- **Data de saída**, **dias** da viagem e **km**.
- **Selo de saída:** "Sai amanhã", "Sai em N dias" ou, em vermelho, "Saída atrasada há N dia(s)".
- **Selo vermelho "Falta para sair: …"**: aparece em Provisionamento quando a saída está a 2 dias ou menos e ainda falta alguma parte (veja [o aviso de saída próxima](#aviso-de-saída-próxima)).
- **"há N dias nesta etapa":** há quanto tempo a viagem está na coluna.
- **Veículo, placa e quantas pessoas na equipe** (quando já foram escolhidos).
- **O valor orçado**, em negrito.
- **O botão do próximo passo** (por exemplo, **Enviar para aprovação** ou **A equipe saiu**), só se você pode dar aquele passo.

### O menu ⋯ do cartão

![O menu ⋯: abrir, duplicar, ficha da equipe e passar para…](img/04-menu-do-cartao.jpg)

| Item | O que faz |
|---|---|
| **Abrir a viagem** | Abre a janela da viagem |
| **Duplicar a viagem** | Abre uma nova viagem com o mesmo roteiro (veja [Duplicar uma viagem](#duplicar-uma-viagem)) |
| **Ficha da equipe (imprimir)** | Só a partir de Provisionamento: a folha que a equipe leva |
| **Passar para…** | Os passos que você pode dar: avançar, voltar (com motivo), recusar (com motivo) ou reabrir (com motivo) |

### Arrastar o cartão

Você também pode **arrastar o cartão** para outra coluna. É o mesmo passo do botão: o sistema confere o que falta, pede o motivo quando for o caso e, se não puder, diz por quê. Só grava se a viagem ainda estiver na coluna que você viu: se outra pessoa mexeu antes, o sistema avisa e não passa por cima.

### A Lista

![A Lista: uma linha por viagem](img/05-lista.jpg)

A Lista mostra as mesmas viagens em linhas, com as mesmas ações no menu **⋯**. É a visão para procurar uma viagem específica ou ver tudo de uma vez, sem rolar o quadro. Clicar na linha abre a viagem.

## De onde a viagem vem

- **Pela aba Viagens**, no botão **Nova viagem**: você monta o roteiro, calcula a rota e envia para aprovação.
- **Duplicando outra viagem**, quando a mesma rota sai de novo.
- **Sozinha, pela OP de Adaptação externa**: quando o Almoxarifado fecha o kit dessa OP, o sistema cria a viagem já em **Em aprovação**, com o destino da OP anotado e a OP ligada. Uma viagem por lote e destino: as OPs do mesmo lote que vão ao mesmo lugar entram na mesma viagem.

> **Atenção:** a OP de Adaptação externa **só aparece na fila da Adaptação depois que a viagem é aprovada**. Enquanto a viagem estiver Aberta, Em aprovação ou Não aprovada, a Produção vê a faixa "N OP(s) esperam a aprovação da viagem".
