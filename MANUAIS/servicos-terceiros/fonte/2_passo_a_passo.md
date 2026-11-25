# Passo a passo dos serviços

## Pedir um serviço

![A janela Pedir serviço de terceiro](img/08-pedir-servico.jpg)

**Quando usar:** quando um trabalho vai ser feito por alguém de fora e você quer que o sistema acompanhe o prestador, o dia, o valor e a conclusão.

**Quem faz:** qualquer usuário.

**Por onde se pede.** O mesmo pedido abre de vários lugares, sempre já ligado ao que você estava vendo:

| De onde | Onde fica o botão |
|---|---|
| Esta tela | **Solicitar serviço** (botão verde do alto) |
| OP | Menu **Mais ações da OP › Solicitar serviço de terceiro** e a caixinha **Necessita serviço de terceiro** da OP (no lote, um pedido para todos os carros da venda) |
| OS do SAC | Menu **⋯** da OS › **Serviço de terceiro** |
| Engenharia | No cartão do projeto do Desenvolvimento: **Solicitar serviço de terceiro** (corte e dobra com o desenho anexado) |
| Serralheria | No cabeçalho da tela da Serralheria: **Solicitar serviço de terceiro** |
| Almoxarifado | No Kiting: **Solicitar serviço de terceiro** (não aparece no Telecom) |

**Passo a passo**

1. Clique no botão de pedir. A janela **Pedir serviço de terceiro** abre.
2. Escolha o **Tipo de serviço \*** (Película, Lavagem, Corte e dobra…). Em **Onde é feito** diga se é **Na fábrica** ou **No prestador** (ou deixe em **A definir**).
3. Escreva **O que precisa ser feito \*** (pelo menos 3 letras).
4. Em **Ligado a**, escolha a **OP** ou a **OS** a que o serviço pertence. É opcional: o serviço pode ser **avulso**. Quando o pedido vem de uma OP (ou de uma OS), a ligação já vem preenchida e travada.
5. Se a OP é de uma venda com vários carros, a janela mostra **Carros que levam o serviço**, com **Marcar todos** e **Desmarcar todos**: marque quais recebem o serviço (**até 100 de uma vez**).
6. Escreva o **dia**. Em **película, plotagem e pintura** o campo se chama **Para quando você precisa**: é só um **pedido** de data, que a Adaptação lê e usa para marcar o dia de verdade. Nos outros tipos o campo é **Dia desejado**.
7. Se já souber, escolha o **Prestador (opcional)** (a lista traz só quem faz aquele tipo; quem pode cadastrar vê o atalho **Cadastrar prestador**) e o **Valor combinado (R$)** (o campo do valor só aparece para quem vê valores; com vários carros, o valor vale para cada um).
8. Em **Peças que vão ao prestador**, escreva cada uma (**Peça** e **Qtd**) e use **Adicionar peça**. É esta lista que sai impressa na ordem de serviço.
9. Se precisar, escreva uma **Observação** e use **Anexar arquivos** (desenho de corte e dobra, foto, orçamento): até **10 arquivos de 20 MB por pedido** e 30 por serviço.
10. Clique em **Pedir serviço** (ou **Pedir N serviços**, quando há vários carros).

**O que acontece:** nasce **um serviço por carro** (TS-00044, TS-00045…), todos juntos ou nenhum, **em A definir**. Quem pediu fica como o dono de cada um.

**Vai para:** coluna **A definir** do Quadro.

> **Atenção:** se um dos carros **já tem um serviço do mesmo tipo em aberto**, a janela avisa em vermelho qual número é e **deixa o carro de fora**. Se é outro serviço do mesmo tipo, marque **Pedir mesmo assim**. O banco confere de novo na hora de gravar.

> **Dica:** o botão fica em **Lendo os carros…** por um instante quando a janela vem da OP. Espere ele voltar a **Pedir serviço**: senão o pedido sairia só para o carro em que você clicou, e não para a venda inteira.

## Agendar

![A janela Agendar serviço, com o choque de data em vermelho](img/09-agendar.jpg)

**Quando usar:** para escolher o prestador e marcar o dia e o período de um serviço **A definir**. Também serve para **reagendar** um serviço já agendado.

**Quem faz:** quem tem o poder de **marcar o dia** do tipo:

- **Película, plotagem e pintura:** a **Adaptação** (aba Adaptação), os gerentes e o Admin, **mesmo quando o Comercial pediu**. Quem pediu espera, com o selo **Sem data**, e a Adaptação vê o **dia desejado** que ele escreveu.
- **Os outros tipos:** quem pediu (mais gerentes e Admin).

O **Admin** muda essa regra por tipo na aba **Tipos de serviço**, sem mexer em código.

**Passo a passo**

1. No cartão, abra o menu **⋯** (grupo **Passar para**) e escolha **Agendar (prestador, dia e período)**; ou abra o serviço (ou o grupo de carros) e use o mesmo botão em **Passos do serviço**; ou arraste o cartão para a coluna **Agendado**.
2. Escolha o **Prestador \*** (a lista traz só os ativos que fazem aquele tipo).
3. Escolha o **Dia do serviço \*** e o **Período** (**Manhã**, **Tarde** ou **Dia todo**).
4. Se o mesmo prestador já tem **outra visita** nesse dia e período, aparece um **aviso vermelho de choque de data** com o que já está marcado. **Ele só avisa**: você pode agendar mesmo assim.
5. Clique em **Agendar**. Para mudar o dia, o período ou o prestador de um serviço já agendado, use **Reagendar (outro dia, período ou prestador)**: a janela se chama **Reagendar** e tem **Motivo do reagendamento (opcional)**.

**O que acontece:** o serviço fica com prestador, dia e período; o histórico guarda quem agendou e quando. **A mesma venda, tipo, prestador e dia contam uma visita só**: agendar os 10 carros de uma venda no mesmo dia **não** é choque entre eles.

**Vai para:** coluna **Agendado**. Aparece na **Agenda**, no **Calendário** e, se o dia passar sem baixa, vira **Atrasado**.

> **Atenção:** se o pedido está **numa ordem de serviço em lote** (pintura eletrostática), o dia é o da ordem: o serviço não se agenda sozinho (ver **A ordem de serviço em lote**, abaixo).

## Dar como realizado

![A janela Dar como realizado](img/10-realizar.jpg)

**Quando usar:** quando o prestador entregou o trabalho e você conferiu.

**Quem faz:** quem pediu; nos tipos da Adaptação (película, plotagem, pintura), quem pediu **ou a Adaptação**; gerentes e Admin sempre.

**Passo a passo**

1. No menu **⋯** do cartão (grupo **Passar para**), escolha **Dar como realizado**; ou use o mesmo botão em **Passos do serviço**, na janela do serviço; ou arraste para **Realizado**.
2. Se o serviço **ainda não tinha prestador**, a janela pede **Prestador que fez o serviço \***: escolha agora. Se já tinha, esse campo nem aparece (em vários carros, só vale para os que ainda não tinham).
3. Informe o **Dia em que foi feito \*** (não pode ser no futuro).
4. Informe o **Valor final cobrado (R$) \***. **É obrigatório até para quem não vê valores**, e **zero vale** (retrabalho sem cobrança). Em vários carros a janela pede **o valor final de cada serviço**.
5. Se quiser, escreva a **Observação (opcional)**.
6. Clique em **Dar como realizado**.

**O que acontece:** o serviço guarda o dia, o valor final e **quem conferiu** (você). A **diferença** entre o combinado e o final fica visível; o selo **Acima do combinado** (âmbar) aparece quando o prestador cobrou mais.

**Vai para:** coluna **Realizado**. Entra no **Relatório do mês** do mês do **dia em que foi feito**.

## Voltar, reabrir e cancelar

**Quando usar:** quando o dia mudou, o serviço foi dado como realizado por engano ou o pedido não vale mais.

**Quem faz:** quem pode mexer no serviço (os mesmos de dar como realizado).

| Passo | Onde está | O que faz |
|---|---|---|
| **Voltar para A definir (tira o dia marcado)** | Serviço **Agendado** | Apaga o dia e o período; o prestador fica |
| **Reabrir (volta para Agendado)** | Serviço **Realizado** | Apaga o dia feito e o valor final; o serviço volta para Agendado |
| **Cancelar o pedido** (serviço A definir) / **Cancelar o serviço** (Agendado) | Grupo **Encerrar** do menu | Encerra o serviço |

Estes passos aparecem em dois lugares: no menu **⋯** do cartão (os de voltar e reabrir ficam em **Passar para**; o cancelar, em **Encerrar**) e, na janela do serviço, nos botões de **Passos do serviço** (o cancelar em vermelho).

**Todos pedem o motivo** (pelo menos 5 letras), que vai para o histórico. O **cancelado não volta**: se for preciso, peça o serviço de novo. Para ver os cancelados, use o filtro **Ver** (**Ativos**, **Cancelados** ou **Todos**) da barra de filtros.

> **Atenção:** se o pagamento do serviço **já foi pedido ao Financeiro**, reabrir ou cancelar o serviço **não desfaz** a demanda do Financeiro: fale com o Financeiro para cancelar o pedido de pagamento primeiro.

## Pedir o pagamento ao Financeiro

![O serviço realizado, com o selo A pagar e o botão Pedir pagamento](img/11-servico-realizado.jpg)

![A janela Pedir pagamento, já preenchida](img/12-pedir-pagamento.jpg)

**Quando usar:** com o serviço **Realizado** e o valor final **maior que zero**. É o que faz o contador **A pagar** baixar.

**Quem faz:** quem pode mexer no serviço. (O contador **A pagar** só aparece para quem vê valores.)

**Passo a passo**

1. Abra o serviço (ou o grupo de carros) e, na caixa **Pagamento ao prestador**, clique em **Pedir pagamento · R$ …**.
2. A janela já vem preenchida: **Favorecido (quem recebe) \***, **CNPJ ou CPF** (do cadastro do prestador).
3. Escolha o **Tipo de custo**, o **Vencimento \***, a **Forma de pagamento** e escreva os **Dados para pagar** (chave Pix, linha digitável do boleto, banco e conta) e as **Observações**.
4. Clique em **Pedir ao Financeiro**.

**O que acontece:**

- Nasce **uma demanda no Financeiro**, já preenchida.
- **O valor nunca vem da tela:** o banco **soma os valores finais gravados** dos serviços do pedido.
- **Um pedido por visita ou por ordem, de um prestador só.** Os carros de uma mesma visita entram juntos.
- O serviço ganha o selo **Pagamento pedido**; quando o Financeiro conclui a demanda, vira **Pago**. Se a demanda for **cancelada**, o serviço **volta a "A pagar"** e dá para pedir de novo.

> **Atenção:** se o sistema **não conseguir ler** a situação da demanda do Financeiro, o selo vira o neutro **Pagamento pedido, situação não lida**. Ele **nunca** diz "a pagar" nem "pago" no escuro: a próxima leitura que der certo mostra a verdade.

## Quando o carro ou a peça sai: a Vistoria de pátio

![A saída da vistoria ligada ao serviço](img/13-saida-vistoria.jpg)

**Quando usar:** quando o serviço é **no prestador** (o carro ou a peça sai da fábrica). O serviço aponta a **saída da Vistoria de pátio** e mostra se o carro já saiu e voltou.

**Quem faz:** quem pode mexer no serviço.

**Passo a passo**

1. Abra o serviço (ou o grupo) **Agendado ou Realizado** e olhe a caixa **Saída da vistoria de pátio**.
2. **Registrar a saída:** abre a Vistoria de pátio **já preenchida** (o tipo de saída vem do tipo do serviço: pintura eletrostática = "Pecas para Pintura", lavagem = "Lavagem" etc.). Salve a saída lá; ela é ligada ao serviço sozinha.
3. **Ligar a uma saída que já existe:** escolha, na lista das saídas que ainda não voltaram, a que já foi registrada.
4. **Desligar da saída:** desfaz a ligação (pede motivo).

**O que acontece:** o serviço mostra **No prestador desde dd/mm** e, quando a Vistoria registra o retorno, **Voltou em dd/mm**. **Vários serviços podem ligar à mesma saída.**

> **Dica:** se a leitura da Vistoria falhar, o serviço mostra só **Saída ligada**, sem afirmar se já voltou. Se a saída foi salva e a ligação falhou, a saída **fica registrada** e a tela avisa para ligar pelo serviço.

## A ordem de serviço em lote (pintura eletrostática)

**Quando usar:** quando várias peças, de vários serviços do **mesmo prestador**, vão **juntas** para a pintura eletrostática. Em vez de um papel por serviço, sai **uma ordem** (**OT-00001**) com a **relação de todas as peças**, que o prestador **assina**.

**Quem faz:** **Admin, gerentes e Adaptação**. Quem só pediu vê a ordem e o selo, mas não mexe.

FLUXO: Aguardando assinatura > Peças no prestador > Fechada

### Montar a ordem

![A fila de serviços esperando uma ordem](img/14-ordens-fila.jpg)

1. Abra a aba **Ordens de pintura**. A fila **Serviços esperando uma ordem** lista os serviços do tipo que usa ordem em lote, em **A definir** ou **Agendado** e fora de outra ordem ativa.
2. **Marque** os serviços que vão juntos (**Marcar todos**) e clique em **Montar ordem com N**. (Também dá para montar pelo grupo de carros, em **Montar ordem de serviço**.)

![A janela Montar ordem de serviço](img/15-montar-ordem.jpg)

3. Escolha o **Prestador \*** (só aparece quem faz **todos** os tipos marcados), o **Dia do envio das peças \*** e a **Previsão de retorno \*** (quando o prestador promete devolver as peças pintadas), e a **Observação (opcional)** (por exemplo, "cor RAL 9005, cuidar do vidro").
4. Clique em **Montar a ordem**.

**O que acontece:** a ordem nasce **Aguardando assinatura**. O prestador e o dia da ordem **valem para todos os serviços**, que passam para **Agendado** e **andam juntos**.

> **Atenção:** um serviço sem **peças listadas** entra mesmo assim, mas a relação impressa sai com a linha "(sem peças listadas)" e as peças se conferem à mão. Liste as peças ao pedir o serviço.

### Imprimir, assinar e enviar as peças

![A janela da ordem, aguardando a assinatura](img/16-ordem-aberta.jpg)

1. Na janela da ordem, clique em **Imprimir a ordem**: sai a folha com a **relação de peças** e **uma caixinha de conferência por linha**.

![A folha da ordem de serviço, com a relação de peças](img/20-folha-da-ordem.jpg)

2. Leve as peças e a ordem ao prestador e traga a **cópia assinada**.
3. Clique em **Enviar as peças**.

![A janela Enviar as peças ao prestador](img/17-enviar-pecas.jpg)

4. Informe o **Dia em que as peças saíram \*** e a **Previsão de retorno \***, e **anexe a cópia assinada**.
5. Confirme.

**O que acontece:** **a ordem só vira "Enviada" com a cópia assinada anexada.** A cópia sobe **antes** da gravação e, se o banco recusar, ela sai de novo: nada fica pela metade. A ordem passa a **Peças no prestador**.

### Registrar o retorno

![A janela Registrar o retorno das peças](img/18-retorno.jpg)

1. Quando as peças voltarem, abra a ordem e clique em **Registrar o retorno**.
2. Informe o **Dia em que as peças voltaram \***.
3. Informe o **valor final de cada serviço** (ou use **Mesmo valor para todos (R$)**; **zero vale**, negativo não). Quem vê valores vê o total ao lado do combinado.
4. Clique em **Fechar a ordem**.

**O que acontece:** **todos os serviços da ordem passam para Realizado de uma vez**, cada um com o seu valor final e o dia do retorno. A ordem fica **Fechada**.

> **Atenção:** passou da previsão de retorno e as peças não voltaram? A ordem e a lista mostram o selo vermelho **Retorno atrasado**.

### Alterar, incluir, tirar e cancelar

Cada botão vale só em uma fase da ordem:

| Botão | Quando aparece | O que faz |
|---|---|---|
| **Alterar** | Aguardando assinatura ou Peças no prestador | Muda o prestador, a previsão de retorno e a observação (no atraso, é aqui que se combina outra previsão) |
| **Incluir serviços** | Só Aguardando assinatura | Traz outros serviços do mesmo prestador para a ordem |
| **Tirar os marcados** | Só Aguardando assinatura | Tira serviços da ordem (**pede motivo**; a ordem nunca fica sem serviços) |
| **Cancelar a ordem** | Só Aguardando assinatura | Cancela a ordem inteira (**pede motivo**); os serviços voltam a ser mexidos um a um |

Depois que as peças **foram enviadas**, a ordem não pode mais ser cancelada nem ter serviços incluídos ou tirados: o caminho é **Registrar o retorno**. **Imprimir a ordem** e **Imprimir contrato** valem em qualquer fase (menos na ordem cancelada).

> **Atenção:** **o serviço que está numa ordem montada ou enviada só se mexe pela ordem.** O banco recusa agendar, reabrir, cancelar ou alterar o serviço sozinho, e o cartão não se arrasta.

## Imprimir o contrato

![O contrato impresso](img/19-contrato.jpg)

**Quando usar:** em **todo** serviço, antes de o prestador começar: é a folha **simples** que o prestador assina.

**Quem faz:** qualquer usuário.

**Passo a passo**

1. No menu **⋯** do cartão, na janela do serviço, na do grupo ou na da ordem, clique em **Imprimir contrato**.
2. Abre a janela pequena **Imprimir o contrato**. Escolha a **Empresa que contrata \*** (**ACN** ou **DETECH**). Ela já vem sugerida pela OP: **começa com D = DETECH, com A = ACN**.
3. Clique em **Imprimir**. A folha abre numa janela nova do navegador, pronta para imprimir ou salvar em PDF.

**O que acontece:**

- **Um contrato por visita, com a lista dos carros.**
- O que o cadastro não tem (CNPJ do prestador, endereço, chassi…) **sai em branco para escrever à mão**.
- **Quem não vê valores imprime sem o valor.**
- Se o prestador ainda não foi definido, ou se os serviços têm prestadores diferentes, a janela avisa em amarelo antes de imprimir.
- Se o texto do contrato **ainda não foi aprovado**, a janela avisa em **vermelho** que a folha vai sair como **minuta**.

> **Atenção:** enquanto o **Admin não aprovar o texto** na aba **Modelo do contrato**, **toda folha sai com a faixa vermelha "MINUTA"**. Não assine uma folha em minuta.

> **Dica:** se o navegador **barrar a janela de impressão**, a tela diz isso em vermelho ("Libere as janelas deste endereço e tente de novo"). Ela nunca avisa "imprimiu" sem ter aberto a janela.

## A pintura da Serralheria

**Quando acontece:** quando a Serralheria conclui uma peça **com pintura** pedida.

- Ao concluir, o sistema abre sozinho um serviço de **Pintura eletrostática** em **A definir**, ligado à demanda, **em nome de quem concluiu**.
- **Não nasce mais a requisição de compra no Compras** para a pintura.
- A **Produção** recebe o aviso no WhatsApp: "escolha o prestador e o dia (ou entre numa ordem de pintura)".
- Se a abertura do serviço **falhar**, a demanda **conclui mesmo assim** e ganha o botão **Pedir a pintura agora** (para demandas concluídas há até 30 dias e ainda sem pedido).
- A demanda antiga, que já tinha pedido no Compras, **não muda**.

## Onde ver os serviços de uma OP ou de uma OS

No **Dossiê da OP** e no **resumo da OS** do SAC há o quadro **Serviços de terceiros**:

![O quadro Serviços de terceiros no Dossiê da OP](img/24-quadro-na-op.jpg)

- Lista **todos** os serviços ligados (os cancelados também), com situação, prestador, dia e valor (para quem vê valores).
- O botão **Pedir serviço de terceiro** já vem ligado àquela OP ou OS.
- **Abrir** leva à janela do serviço.
- Lê uma vez ao abrir. Se a leitura falhar, uma faixa vermelha avisa e oferece **Tentar de novo**: **nunca** diz "nenhum serviço" no lugar do erro (nem deixa você pedir de novo sem conferir: o serviço pode já existir).
- O **PDF do Dossiê** não leva os serviços.

## A OP que é só serviço de terceiro

**Quando acontece:** a venda é **só** um serviço de terceiro (por exemplo, só a plotagem do carro) e não há nada a fabricar, separar nem adaptar. Em vez de passar pelo PCP, pelo Almoxarifado e pela Adaptação, a OP vai direto ao prestador.

FLUXO: Nova OP > Aguardando serviço de terceiro > Todos os serviços realizados > Liberação Comercial > Fiscal

- Na **Nova OP**, o **Fluxo de Entrega** tem a opção **Somente serviço de terceiro**. Ao escolhê-la, a tela pede os **tipos de serviço** (película, blindagem, plotagem, pintura ou outro) e o **prazo de entrega** (uma data). **Não pede** valor de mão de obra, previsão de chegada do veículo nem o prazo em dias da adaptação.
- A OP **nasce direto em "Aguardando serviço de terceiro"**: **não passa pelo PCP**, não aparece na fila do Almoxarifado nem na da Adaptação.
- O **serviço nasce sozinho** ao criar a OP: **um por tipo marcado e por unidade** (num lote de 3 carros com plotagem e película, são 6 serviços), todos em **A definir**, com a descrição "Tipo — cliente" e o prazo da OP na observação. Aparecem no **Quadro** como qualquer outro serviço.
- Daí em diante é o passo a passo de sempre: **agendar**, **dar como realizado**, pedir o pagamento ao Financeiro.
- **Quando todos os serviços da OP estão realizados** (os cancelados não contam, mas ao menos um precisa ter sido feito), o **sistema leva a OP sozinho** à **Liberação Comercial** (ou direto ao Fiscal, se o faturamento foi antecipado). **Não há Controle de Qualidade** nesse caminho. A mudança fica no histórico da OP, com o setor "Serviços de terceiros".
- Se um serviço é **reaberto** (volta de Realizado para Agendado) **antes de o Comercial liberar**, a OP **volta a esperar o prestador**.
- Se **todos** os serviços forem **cancelados**, a OP **fica parada** onde está, para alguém decidir (pedir outro serviço ou cancelar a OP).
- No **Dossiê da OP**, se a OP é só de terceiro e **não tem nenhum serviço**, o quadro **Serviços de terceiros** mostra uma faixa vermelha avisando que ela não anda sem serviço, com o botão **Pedir serviço de terceiro**.
- Se a abertura dos serviços falhar ao criar a OP, a tela avisa em vermelho que a OP foi criada **sem** o serviço; abra a OP e use **Pedir serviço de terceiro**.
- **Copiar OP** de uma OP só de terceiro também abre os serviços de cada cópia.

> **Atenção:** o fluxo **Somente serviço de terceiro** **não se troca depois** pela troca de fluxo da unidade nem pela edição do Comercial: ele muda a etapa da OP. Só o Admin troca, pela edição completa da OP, mudando a fase junto.

> **Dica:** o dia de plotagem, película e pintura continua sendo marcado **pela Adaptação** (regra do tipo), mesmo a OP não passando pela fila dela.
