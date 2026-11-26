# A tela Adaptação

## Para que serve

A tela **Adaptação** é onde a equipe de produção vê **o que está na fila para adaptar**, avisa **quem pegou cada carro e em que BOX ele está**, acompanha o trabalho até o fim e entrega para o **CQ** (Controle de Qualidade). É também por ela que a Adaptação cuida da manutenção veicular do SAC, dos agendamentos de manutenção, dos vouchers de serviços e das equipes.

A tela tem **cinco abas**, logo abaixo do título:

| Aba | Para que serve |
|---|---|
| **Produção** | A fila das OPs: iniciar, trocar BOX, pausar, concluir, retrabalho. É a aba que abre primeiro. |
| **SAC veicular** | As OS de manutenção veicular que o SAC manda para a Produção (definir data, receber o carro, orçar, executar, concluir). |
| **Agendamentos** | Calendário das manutenções: OPs de manutenção esperando data e as OS do SAC já marcadas. |
| **Voucher** | Emitir e imprimir vouchers de serviços feitos por terceiros (lavagem, película etc.). |
| **Equipes** | Cadastro das equipes (head line e membros) que aparecem ao iniciar uma OP. |

![A tela Adaptação aberta na aba Produção](img/01-tela-inicial.jpg)

> **Dica:** cada aba tem endereço próprio na barra do navegador. Ao apertar F5, você volta para a mesma aba; e dá para mandar o link de uma aba para um colega.

## O alto da tela

![O alto da tela: título, contadores, abas e avisos](img/02-alto-da-tela.jpg)

De cima para baixo:

1. **Título e contadores.** "12 OPs na fila · 2 em retrabalho · 1 com autorização de marketing". Os números contam tudo o que a tela lê, sem olhar o filtro.
2. **Tabela / Kanban** (à direita): duas formas de ver a mesma lista. Veja [o Kanban](#o-kanban).
3. **As cinco abas.**
4. **Faixas de aviso**, que só aparecem quando há o que avisar:

| Faixa | O que significa | O que fazer |
|---|---|---|
| **Azul** — "OP de Adaptação externa espera a aprovação da viagem para chegar aqui" | A OP é de adaptação fora da fábrica e a viagem ainda não foi aprovada. A OP **não aparece na fila** até a aprovação. | Nada a fazer aqui. Quando a direção aprovar a viagem, a OP entra na fila sozinha. |
| **Vermelha** — "OP(s) reprovada(s) pelo CQ" | O CQ reprovou e mandou a OP de volta. O motivo está nas linhas com filete vermelho. | Clique em **Ver OP** ou procure a linha. Veja [Retrabalho](#retrabalho-quando-o-cq-reprova). |
| **Verde** — "OP(s) em produção com autorização do Marketing" | O Marketing autorizou foto e vídeo desse carro. | Avise o Marketing para agendar o registro enquanto o carro está na oficina. |

## Filtros e filas

![Filtros: busca, status, técnico, mais filtros e as filas](img/03-filtros.jpg)

| Filtro | Como usar |
|---|---|
| **OP, chassi ou cliente** | Digite parte do número da OP, do chassi ou do nome do cliente. Não precisa de acento. |
| **Status** | Aguardando Início Produção, Em Produção, Retrabalho ou Em Retrabalho. |
| **Técnico** | Mostra só o que está com um técnico ou equipe. A lista traz só quem aparece na fila de agora. |
| **Mais filtros** | Abre **Cliente** e **Entrega prevista de … até …**. |
| **Limpar filtros** | Aparece quando algum filtro está ligado. Também aparece "11 de 12": quantas linhas passam do total. |

À direita ficam as **filas**, com a contagem de cada uma:

![As filas: Adaptação, Fabricação, Envio, Serralheria e Todas](img/04-filas.jpg)

| Fila | O que mostra |
|---|---|
| **Adaptação** | Veículos adaptados aqui ou pela nossa equipe no local. **É a que abre por padrão.** |
| **Fabricação** | Itens que a serralheria fabrica inteiros; ao concluir a serralheria, a OP passa para a Adaptação. |
| **Envio** | OPs que não passam por produção (só separar, embalar e enviar). |
| **Serralheria** | Tudo o que passa pela serralheria: carretinhas inteiras e a etapa de serralheria dentro de adaptações. |
| **Todas** | As filas juntas. |

> **Atenção:** se uma OP "sumiu", confira a fila escolhida. Uma OP de envio não aparece na fila Adaptação.

## A tabela

A tabela tem uma linha por OP, com estas colunas:

| Coluna | O que mostra |
|---|---|
| (caixinha) | Marcar a OP para ações em lote. Veja [Várias OPs de uma vez](#várias-ops-de-uma-vez). |
| **OP** | Número da OP (clique para abrir os detalhes) e, embaixo, selos: quantas unidades, anexos, "Autorização de marketing", a serralheria e a viagem. |
| **Veículo e cliente** | Modelo, chassi, placa, cliente e tipo de projeto. O que falta aparece em vermelho ("sem placa", "sem modelo"). |
| **Entrega** | Data prevista. Passou do dia, fica em vermelho com os dias de atraso ("23/11/2026 · 3 d"). |
| **Responsável** | Quem trabalha na OP e, em produção, o **BOX**. |
| **Status** | A situação e, quando está em produção, o **cronômetro**. |
| **Ações** | O botão principal da situação e o menu **⋯** com o resto. |

### Cada situação tem uma linha diferente

**Aguardando início** — ninguém pegou ainda. Botão **Iniciar**.

![Linha de uma OP aguardando início](img/05-linha-aguardando.jpg)

**Em produção** — mostra o responsável, o BOX e o cronômetro. Botão **Concluir**. O selo roxo "Autorização de marketing" e o selo "Serralheria · Em execução" aparecem embaixo do número.

![Linha de uma OP em produção](img/06-linha-em-producao.jpg)

**Pausada** — o cronômetro para e aparece "Pausado". O botão passa a ser **Retomar**.

![Linha de uma OP pausada](img/07-linha-pausada.jpg)

**Atrasada e sem BOX** — a data fica em vermelho e, onde estaria o BOX, aparece em âmbar **"Sem BOX informado"**: alguém precisa informar em qual BOX o carro está.

![Linha de uma OP atrasada e sem BOX informado](img/08-linha-atrasada-sem-box.jpg)

**Adaptação externa** — a OP tem uma viagem. O botão **Viagem · Provisionamento** (a etapa da viagem aparece no nome) abre a janela da viagem. O aviso "sem placa" em âmbar diz que falta preencher.

![Linha de uma OP de adaptação externa com o botão da viagem](img/09-linha-adaptacao-externa.jpg)

**Retrabalho** — filete vermelho e, logo abaixo, o motivo da reprovação do CQ. Veja [Retrabalho](#retrabalho-quando-o-cq-reprova).

![Linha de uma OP em retrabalho com o motivo do CQ](img/16-retrabalho.jpg)

### O menu ⋯

O menu muda conforme a situação da OP. Antes de iniciar, ele só tem três itens:

![Menu de uma OP que aguarda início](img/10-menu-aguardando.jpg)

Com a OP em produção, o menu cresce:

![Menu de uma OP em produção](img/11-menu-em-producao.jpg)

| Item | Aparece quando | O que faz |
|---|---|---|
| **Ver detalhes** | sempre | Abre a janela completa da OP. |
| **Acompanhamento** | sempre | Escrever um recado sobre a OP. |
| **Viagem desta OP** | a OP tem viagem | Abre a viagem. |
| **Anexos** | sempre | Ver e anexar arquivos. O número aparece quando já há anexos. |
| **BOX do carro** | em produção ou retrabalho | Informar ou trocar o BOX. |
| **Pausar** | em produção ou retrabalho, andando | Para o cronômetro. |
| **Concluir** / **Concluir → CQ** | pausada | Concluir mesmo pausada. |
| **Editar responsável** | em produção ou retrabalho | Trocar quem trabalha. |
| **Equipe** | em produção ou retrabalho | Responsáveis, apoios e serralheria da OP. |
| **Serralheria: …** | a OP passa pela serralheria | Mudar o andamento da serralheria. |
| **Devolver ao PCP** (vermelho) | em produção | Mandar a OP de volta ao PCP com um motivo. |

## O Kanban

O botão **Kanban** (no alto, à direita) mostra as mesmas OPs, **já filtradas**, em colunas pela **data de entrega**:

![Kanban da Adaptação com as colunas por prazo](img/12-kanban.jpg)

| Coluna | Reúne |
|---|---|
| **Atrasadas** | entrega já passou |
| **Vencem hoje** | entrega hoje |
| **Vencem amanhã** | entrega amanhã |
| **Esta semana** | entrega nos próximos 7 dias |
| **Depois** | entrega mais adiante |
| **Sem prazo** | sem data de entrega |

Dentro de cada coluna, as OPs ficam em ordem de data. **A prioridade só desempata o mesmo dia** (a data manda, porque é contratual nas licitações).

![Um cartão do Kanban](img/13-cartao-kanban.jpg)

Cada cartão traz o número da OP (clicável), a origem (**Licitação** ou **Venda direta**), o selo da prioridade ("1º"), o cliente, o modelo, a situação, o responsável e a data. Os ícones do rodapé:

| Ícone | O que faz |
|---|---|
| ↕ (setas) | **Definir prioridade no dia.** Pede um número de 1 a 99 (1 = primeira); vazio tira a prioridade. |
| 💬 | Dar um recado sobre a OP (Acompanhamento). |
| 👥 (só antes de iniciar) | **Iniciar em dupla ou com uma equipe.** |
| **Iniciar** / **Concluir** | O mesmo botão da tabela. |

> **Atenção:** o botão **Iniciar** do cartão do Kanban abre a mesma janela da tabela, com BOX obrigatório. O ícone 👥 só deixa a janela aberta já no modo para escolher dupla ou equipe.

## Lotes

Quando uma venda tem várias unidades (OP A1844.2611/01, /02, /03…), a tabela mostra **uma linha só para o lote**, com a contagem por situação ("2 aguardando início · 1 em produção").

![Lote fechado: uma linha com a contagem por situação](img/14-lote-fechado.jpg)

Clique em **Ver unidades** para abrir cada unidade, que age sozinha (iniciar, concluir, BOX…). **Ocultar unidades** fecha de novo. A caixinha do lote **marca todas as unidades** de uma vez.

![Lote aberto, com cada unidade em uma linha](img/15-lote-aberto.jpg)

O menu **⋯** do lote tem **Importar técnicos/equipes**, para atribuir quem trabalha em cada unidade de uma vez. Veja [Várias OPs de uma vez](#várias-ops-de-uma-vez).

## Palavras que aparecem na tela

| Palavra | O que quer dizer |
|---|---|
| **Aguardando início** | A OP chegou à Adaptação, mas ninguém iniciou o trabalho. |
| **Em produção** | Alguém iniciou; o cronômetro está contando. |
| **Pausado** | O cronômetro parou; a OP segue na oficina. |
| **Retrabalho / Em retrabalho** | O CQ reprovou. "Retrabalho" espera alguém iniciar o conserto; "Em retrabalho" já está sendo refeito. |
| **Head line** | O técnico líder de uma equipe. |
| **BOX** | A vaga da oficina em que o carro está (BOX 01 a 09 e BOX EXTRA). |
| **Apoio** | Quem ajuda na OP e recebe 0,1% fixo da mão de obra, além do que os responsáveis recebem. |
| **CQ** | Controle de Qualidade, a etapa depois da Adaptação. |
| **Pendência** | Peça que depende de outro setor (compra, fabricação, chicote…) e ainda não chegou. |
