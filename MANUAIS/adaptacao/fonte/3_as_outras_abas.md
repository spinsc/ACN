# As outras abas da Adaptação

## SAC veicular

**Para que serve:** o SAC abre as OS de **manutenção veicular** (revisão, conserto de um equipamento instalado, garantia) e, em cada etapa em que a bola está com a Produção, **é aqui que a Produção age**. As etapas do SAC (aceite, aprovação do cliente) acontecem na tela do SAC.

**Quem faz:** quem tem a aba Adaptação.

FLUXO: Em Provisionamento > Aguardando Aceite SAC > Provisionada > Verificação e Orçamento > Aguardando Aprovação Cliente > Aguardando Início > Em Execução > Aguardando CQ

> **Dica:** se a OS é **sem cobrança** (garantia ou cortesia), ela **não tem orçamento nem aprovação do cliente**: ao confirmar a chegada do carro, vai direto a **Aguardando Início**. Na avaliação **remota**, o SAC já leva a OS a "Aguardando Início" depois do aceite.

![A aba SAC veicular com uma OS em cada etapa](img/33-sac-veicular-lista.jpg)

A tabela mostra, por OS: o **número** e o tipo de avaliação, o **cliente**, o **veículo** (equipamento, modelo e chassi, com "sem modelo" ou "sem chassi" em vermelho quando falta), a **data provisionada**, o **status** (com o técnico, quando já há) e a **ação da Produção**. O botão **Atualizar** relê a lista (ela também se atualiza sozinha a cada 30 segundos).

O botão **VER** de qualquer linha abre o **relato do cliente** (defeito reclamado), as observações e os itens já orçados.

![A janela de leitura da OS, com o relato do cliente](img/44-ver-os.jpg)

### O que a Produção faz em cada etapa

| Status da OS | Botão | O que a Produção faz |
|---|---|---|
| **Em Provisionamento** | **Definir Data** | Diz quando o carro pode ser recebido |
| **Aguardando Aceite SAC** | — (aparece "Aguardando SAC") | Nada: o SAC confirma a data com o cliente |
| **Provisionada** | **Chegou** (e **Remarcar**, se atrasar) | Confirma que o carro chegou |
| **Verificação e Orçamento** | **Inserir Materiais** | Lista as peças e o serviço e envia para aprovação |
| **Aguardando Aprovação Cliente** | — ("Aguardando SAC") | Nada: o SAC negocia com o cliente |
| **Aguardando Início** | **Iniciar** | Escolhe quem vai executar |
| **Em Execução** | **Obs.**, **Itens**, **Concluir**, **EQUIPE** | Executa e conclui |

![A linha de uma OS que espera a Produção definir a data](img/34-linha-definir-data.jpg)

### Definir a data de recebimento

1. Na OS **Em Provisionamento**, clique em **Definir Data**.
2. Escolha a **Nova data de recebimento** (obrigatória) e o **Período** (**Manhã** ou **Tarde**).
3. Clique em **Confirmar**.

![A janela Definir Data](img/34-definir-data.jpg)

**O que acontece:** a OS passa a **Aguardando Aceite SAC** e o sistema avisa o SAC ("Produção definiu data — OS … — Data: …"). O SAC confirma com o cliente; a OS volta aqui como **Provisionada**.

### Confirmar a chegada do carro

1. Na OS **Provisionada**, clique em **Chegou**.
2. Confira o cliente, a **data prevista** e o **próximo status** que o sistema mostra.
3. Clique em **Confirmar Chegada**.

![A janela Confirmar Chegada](img/35-confirmar-chegada.jpg)

**O que acontece:** o sistema grava o dia e a hora da chegada e a OS vai para **Verificação e Orçamento** (ou direto para **Aguardando Início**, se é sem cobrança). O SAC é avisado ("Veículo chegou…").

**Carro que não chegou:** passados **mais de 2 dias da data marcada**, uma faixa vermelha avisa ("OS(s) — veículo não chegou há mais de 2 dias após data agendada!"), a linha fica em alerta e a data ganha um ⚠. Use **Remarcar**: abre a janela **Remarcar Data**, com a data anterior em vermelho, para marcar outra (escolha a data e o período e clique em **Confirmar**; a OS volta a **Aguardando Aceite SAC**, para o SAC combinar de novo com o cliente).

![A faixa vermelha do carro que não chegou](img/54-faixa-veiculo-atrasado.jpg)

![A linha da OS atrasada, com o botão Remarcar](img/53-linha-veiculo-atrasado.jpg)

### Verificação e orçamento

1. Na OS **Verificação e Orçamento**, clique em **Inserir Materiais**.
2. Preencha a lista: **Código**, **Descrição**, **Qtd** e **Vl. Unit.** (o total de cada linha e o **TOTAL** se calculam sozinhos). Use **Adicionar Item** para mais linhas e o **×** para tirar.
3. Clique em **Enviar para Aprovação**.

![A janela Verificação e Orçamento, com os itens e o total](img/36-verificacao-orcamento.jpg)

> **Atenção:** é preciso **pelo menos um item** para enviar. Ao enviar, a OS aguarda a aprovação do SAC e do cliente **antes de iniciar a manutenção**; o SAC é avisado com o total do orçamento.

### Iniciar a manutenção

1. Na OS **Aguardando Início**, clique em **Iniciar**.
2. Escolha o **Modo de execução** (**Individual**, **Dupla** ou **Equipe**) e quem é. O funcionamento é o mesmo de [iniciar uma OP](#iniciar-a-produção).
3. Clique em **Iniciar Manutenção**.

![A janela Iniciar Manutenção, no modo Equipe](img/37-iniciar-manutencao.jpg)

**O que acontece:** a OS vai para **Em Execução** e o **KPI de manutenção** (o cronômetro da execução) começa a contar. As pessoas escolhidas entram na lista da janela **EQUIPE** da OS.

### Durante a execução

Uma OS **Em Execução** tem quatro botões:

![A linha de uma OS em execução, com os botões Obs., Itens, Concluir e EQUIPE](img/38-linha-em-execucao.jpg)

| Botão | Para que serve |
|---|---|
| **Obs.** | Guarda uma observação **sem concluir** ("visível na impressão da OS"). |
| **Itens** | **Conferência de itens:** revise os itens do orçamento, tire (×) o que não foi feito e acrescente os extras. O SAC enxerga as mudanças. Clique em **Salvar Itens**. |
| **Concluir** | Conclui a manutenção. Veja abaixo. |
| **EQUIPE** | Quem trabalhou: **responsáveis** (comissão pelo percentual deles) e **apoios** (0,1% fixo da mão de obra da OS). |

![A janela Observação de Produção](img/43-obs-producao.jpg)

![A janela Conferência de Itens](img/39-conferencia-de-itens.jpg)

![A janela Equipe da OS](img/41-equipe-da-os.jpg)

### Concluir a manutenção

1. Clique em **Concluir**. A janela traz os **Materiais utilizados** (já preenchidos com o que foi conferido ou orçado).
2. Ajuste os itens, se for o caso, e escreva as **Observações**.
3. Clique em **CONCLUIR MANUTENÇÃO**.

![A janela Concluir Manutenção](img/40-concluir-manutencao.jpg)

**O que acontece, e depende do total:**

- **O total dos itens bate com o orçamento aprovado** (ou a OS é sem cobrança): a OS vai para **Aguardando CQ** e o tempo da execução fica gravado.
- **O total não bate:** a OS **não avança**. Ela fica **pendente de revisão** (a linha mostra "Revisão pendente — aguardando SAC") e o SAC é avisado para negociar o novo valor com o cliente. **Depois que o SAC resolver, conclua de novo.**

![A linha de uma OS com revisão pendente](img/42-linha-revisao-pendente.jpg)

> **Atenção:** se não for possível avisar o SAC automaticamente, a tela diz isso: avise o SAC por conta própria. A OS **só segue** depois da resolução dele.

## Agendamentos

**Para que serve:** marcar o dia em que o carro de uma **OP de manutenção** é recebido e ver, no calendário do mês, tudo o que já está marcado: as OPs de manutenção e as OS do SAC que têm data.

**Quem faz:** quem tem a aba Adaptação.

![A aba Agendamentos: OPs esperando data e o calendário do mês](img/45-agendamentos.jpg)

### Agendar uma OP

1. No quadro âmbar **"N OP(s) de Manutenção aguardando agendamento"**, ache a OP (o número abre a OP) e clique em **AGENDAR**.
2. Preencha a **Data de recebimento do carro** (obrigatória), o **Período** (**Manhã** ou **Tarde**) e as **Observações** (defeitos relatados, histórico…).
3. Em **Quem mais participa**, escolha quem deve ver o agendamento na agenda dele (opcional).
4. Clique em **Confirmar Agendamento**.

![A janela Agendar Manutenção](img/46-agendar-manutencao.jpg)

**O que acontece:** a OP passa a **Manutenção Agendada**, aparece no calendário, o histórico da OP registra o dia e o período e **as pessoas escolhidas são avisadas**. Se a OP não conseguir mudar de situação, o agendamento é desfeito para você tentar de novo sem duplicar.

> **Atenção:** a OP sem modelo ou sem chassi aparece com "sem modelo" ou "sem chassi" em vermelho. Peça para o Comercial ou o PCP corrigir.

### Ler o calendário

- As setas **‹ ›** mudam o mês.
- **O dia de hoje** fica destacado.
- Cada etiqueta é um agendamento. A cor diz o tipo e o período:

| Etiqueta | Quer dizer |
|---|---|
| **OP Manhã** (azul) / **OP Tarde** (âmbar) | OP de manutenção agendada |
| **SAC Manhã** (verde) / **SAC Tarde** (roxo) | OS do SAC com data de recebimento |

- Passe o mouse sobre a etiqueta para ler a OP, o chassi e o cliente.

### Cancelar um agendamento

Clique na etiqueta **da OP** no calendário (a legenda diz "Clique no agendamento OP para cancelar") e confirme. A OP **volta a "Aguardando agendamento"**. As etiquetas do **SAC** não se cancelam por aqui: quando o carro de uma OS do SAC atrasa, a data se muda pelo botão **Remarcar**, na aba SAC veicular.

### Lista e impressão

O botão **Lista** troca o calendário por uma tabela com todos os agendamentos (data, período, OP, chassi, cliente, observações) e o botão **Cancelar** de cada linha. **Calendário** volta. **Imprimir** abre uma folha com a lista, pronta para imprimir.

![A lista dos agendamentos](img/47-agendamentos-lista.jpg)

## Voucher

**Para que serve:** emitir o **voucher de serviço** que o prestador (lava-rápido, instalador de película, plotagem, funilaria…) apresenta para fazer o serviço em um ou mais carros da empresa, e guardar o histórico dos vouchers emitidos.

**Quem faz:** quem tem a aba Adaptação.

### Emitir um voucher

1. Na aba **Voucher**, no quadro **Novo Voucher de Serviço**, escolha o **Tipo de serviço** (obrigatório).
2. Preencha o **Nº PV / OP** (obrigatório), a **Data do serviço**, o **Prestador do serviço** e **Autorizado por**.
3. Na tabela **Veículos / Itens do serviço**, preencha uma linha por carro: **Placa / Chassi**, **Modelo** e o **Valor do serviço** (R$). O **VALOR TOTAL** se soma sozinho. Use **Adicionar Veículo** para mais carros e o **×** para tirar uma linha.
4. Clique em **Salvar Voucher**. **Limpar** apaga o que foi digitado.

![O formulário Novo Voucher de Serviço preenchido](img/48-voucher-formulario.jpg)

> **Atenção:** sem o **Tipo de serviço** e o **Nº PV / OP** o sistema não salva e avisa.

### Cadastrar um tipo de serviço novo

1. Ao lado da lista de tipos, clique no **+** (verde).
2. Aparece o **Cadastro de Tipos de Serviço**, com os tipos que já existem. Escreva o nome do novo tipo e clique em **Salvar**: ele já fica escolhido no formulário.
3. Para tirar um tipo, clique no **×** dele e confirme.

![O cadastro de tipos de serviço](img/49-voucher-tipos.jpg)

### Imprimir ou excluir um voucher emitido

O quadro **Vouchers Emitidos** lista os últimos 100, com número, tipo, veículos, valor total, data, prestador e quem autorizou.

![A lista de vouchers emitidos](img/50-voucher-lista.jpg)

| Botão | O que faz |
|---|---|
| **Imprimir** | Abre a folha do voucher (dados do serviço, veículos com valor e total, e o aviso de que o voucher é válido para os serviços descritos e deve ser apresentado ao prestador) e já chama a impressão. Se o navegador bloquear a janela, libere os pop-ups do sistema. |
| Lixeira (vermelha) | **Exclui** o voucher, depois da pergunta "Excluir este voucher?". |

## Equipes

**Para que serve:** cadastrar as equipes de produção. Cada equipe tem um **head line** (técnico líder) e **membros**. É esta lista que aparece quando se **inicia uma OP no modo Equipe** e na importação de técnicos.

**Quem faz:** quem tem a aba Adaptação.

![A lista de equipes de produção](img/51-equipes-lista.jpg)

### Criar uma equipe

1. Clique em **Nova Equipe**.
2. Escreva o **Nome da equipe** (obrigatório).
3. Escolha o **Head line** (obrigatório): a lista traz os técnicos do departamento de produção.
4. Em **Membros da equipe**, escolha o técnico e clique em **Adicionar**. Repita. O **×** de cada nome tira.
5. Clique em **Criar Equipe**.

![A janela Nova Equipe](img/52-nova-equipe.jpg)

### Editar ou excluir

- **Editar** abre a mesma janela com os dados da equipe; clique em **Salvar Alterações**.
- A **lixeira** vermelha tira a equipe da lista, depois da pergunta "Excluir equipe …?". As OPs que já foram iniciadas com essa equipe continuam mostrando o nome dela.

> **Dica:** mudar uma equipe **não muda as OPs que já estão em produção**. Para trocar quem trabalha numa OP em andamento, use **Editar responsável** ou **Equipe** no menu ⋯ da OP.
