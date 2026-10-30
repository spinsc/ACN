# Aba Chamados NFC

## Para que serve

O cliente tem, no veículo, uma **etiqueta NFC** (ou um link/QR). Ao encostar o celular, abre a página do veículo e pode **abrir um chamado**: o **botão "Abrir Chamado de Garantia"**. Ele informa o nome, o telefone e descreve o defeito. O chamado **cai nesta aba**, para o SAC atender.

O chamado **não é uma OS**. É um pedido de ajuda. Quando o atendimento mostra que há serviço a fazer, **o SAC abre a OS (ou a ficha de garantia) à mão**.

![A aba Chamados NFC](img/40-chamados-nfc.jpg)

## A tela

- **Módulo NFC · Chamados de Suporte (NFC):** o título mostra **"N chamado(s) · N aberto(s)"**. O número de abertos é o **total real** de chamados abertos, mesmo quando o filtro mostra outra coisa.
- **Filtro de status:** *Todos os status, Aberto, Em Atendimento, Concluído, Cancelado*. **Ao escolher, a lista já recarrega.**
- **Carregar:** lê a lista de novo (serve para ver chamados que chegaram agora; a aba **não** atualiza sozinha).

Cada chamado é um cartão com:

| O que aparece | O que é |
|---|---|
| **Nome** e **telefone** (com link: no celular, toca para ligar) | Quem abriu o chamado. "Anônimo" se não informou o nome |
| **Selo de status** | **Aberto** (vermelho), **Em Atendimento** (âmbar), **Concluído** (verde), **Cancelado** (cinza) |
| **Chassi · placa · modelo** | O veículo do chamado |
| **Órgão / cliente** | De quem é o veículo |
| **Descrição do defeito** | O que o cliente escreveu (os primeiros 180 caracteres) |
| **Aberto: data e hora · Atendente: nome** | Quando chegou e quem atende |

A borda do cartão tem a cor do status: **vermelha** para o que ainda está **Aberto**.

## Passo a passo: atender um chamado

**Quando usar:** um chamado novo (Aberto) apareceu.

**Quem faz:** o SAC.

1. Abra a aba **Chamados NFC**. Confira o chamado e o telefone.
2. Clique **Atender**. O chamado passa a **Em Atendimento** e **você fica como atendente**.
3. Ligue ao cliente (clique no telefone), entenda o defeito e resolva.
4. Clique **Notas** para registrar o que foi feito (veja abaixo).
5. Terminou? Clique **Concluir**. O chamado passa a **Concluído** e você consta como quem concluiu.

**O que acontece:** o status e o nome do atendente ficam gravados. **A cada Atender ou Concluir o atendente é o último que clicou.**

> **Atenção:** **Salvar apenas as notas não troca o atendente.** Quem editar as notas de um chamado atendido por outra pessoa não passa a constar como atendente.

## Notas de atendimento

O botão **Notas** abre a janela do chamado, com o resumo (quem abriu, telefone, órgão e a descrição do defeito) e o campo **Notas de atendimento**: escreva as ações tomadas ("liguei, o cliente trocou o fusível, orientei a testar"). Clique **Salvar notas**. **Fechar** sai sem salvar.

![Notas do chamado](img/41-chamado-nfc-notas.jpg)

## O que o chamado vira depois

- **O chamado se resolveu por telefone** (orientação): **Concluir**.
- **Precisa de serviço**: abra uma **OS** (aba Ordens de Serviço > **Nova OS**) ou, se for caso de garantia, uma **ficha** (aba Garantia). **Anote nas Notas** o número da OS ou da ficha para o chamado não ficar solto. O chamado **não** abre a OS sozinho.
- **Não houve atendimento possível** (engano, duplicado): o status **Cancelado** existe no filtro, mas **esta tela não tem botão para cancelar**. Conclua e registre o motivo nas Notas.

> **Dica:** ao abrir a OS a partir do chamado, copie da tela do chamado o **chassi, a placa e o modelo**: eles já estão lá.

---

# Aba Garantia

## Para que serve

A **ficha de garantia** é o **prontuário** de um atendimento em garantia: do relato do cliente até o fim, **guarda tudo num lugar só**: a avaliação técnica, a consulta ao fornecedor, os custos, a conversa com o cliente, a autorização da direção, as peças que vão e voltam, o diário técnico e a OS de execução.

> **Regra de ouro:** **toda OS de garantia nasce de uma ficha.** Sem a ficha, a Nova OS de garantia não abre.

![A lista de atendimentos em garantia](img/50-garantia-lista.jpg)

## Quem faz o quê

| Quem | O que pode |
|---|---|
| **Abrir** a ficha | Admin, qualquer gerente, o Comercial, o SAC e quem tem a aba SAC liberada |
| **Ver** a ficha | Quem abriu, o **responsável**, os **copiados** e o Admin |
| **Editar, cancelar e reabrir** | Quem abriu, o responsável e a gerência |
| **Conduzir** (avaliação, fornecedor, custos, alinhamento, pedir autorização, quem executa, peças, apontamentos, encerrar) | O **responsável** pelo atendimento e a gerência |
| **Decidir a autorização** | **Só a direção** (perfil Admin) |
| **Ver o relatório semanal** | A gerência e o Admin |

## A lista

- **Atendimentos em garantia (N):** o título.
- **Abertos / Encerrados / Cancelados / Todos:** os filtros, com a contagem de cada um. O padrão é **Abertos**.
- **Busca:** por **número, cliente, placa, OP...**
- **Colunas:** Número (GAR-0001/2026), Cliente, Veículo, Placa/Chassi, Origem, Falha, Ocorrência, Responsável, **Etapa** e **Situação**.
- **Selo "Parado há N d" (âmbar):** o atendimento **aberto** e **sem nenhum movimento na ficha há 5 dias ou mais**. É o alerta para não deixar o cliente esperando.
- Clique numa linha para **abrir a ficha**.

![Os filtros da lista](img/69-garantia-filtros.jpg)

## Abrir um atendimento (nova ficha)

**Quando usar:** o cliente relatou uma falha num produto vendido (ainda em garantia ou não: **a ficha é aberta de qualquer jeito**; quem diz se está na garantia é a avaliação técnica).

**Passo a passo:**

1. Aba **Garantia** > **Novo atendimento**.
2. Preencha (tudo com **\*** é obrigatório):
   - **Cliente\*** e **Contato do cliente (telefone ou e-mail)\***;
   - **Veículo (catálogo)\***: procure por marca, modelo ou ano. Se não existir, **+ Novo** cadastra;
   - **Placa** ou **Chassi**: **ao menos um dos dois**. A placa é conferida (formato ABC1234 ou ABC1D23); o chassi tem 17 letras e números, sem I, O e Q. O sistema tira espaços e traços e deixa em maiúscula;
   - **Origem da venda\***: **OP**, **OS do SAC** ou **Nota fiscal da venda**. Para OP e OS, **digite o número e escolha na lista**; para nota fiscal, digite o número. Escolher a **OS** de origem já preenche cliente, contato e chassi (só o que está em branco);
   - **Descrição da falha\***: o que o cliente relata, quando começou, o que já foi tentado;
   - **Data da ocorrência\***: o dia da falha (**não pode ser futura**);
   - **Responsável pelo atendimento\***: vem você; troque se for outra pessoa;
   - **Quem é copiado\***: **ao menos uma pessoa**. Quem é copiado **recebe os avisos** do atendimento (**Selecionar todos** coloca todos).
3. Clique **Abrir atendimento**.

![Janela Novo atendimento em garantia](img/51-garantia-nova-ficha.jpg)

**O que acontece:**

- O **banco dá o número** (**GAR-0001/2026**, sequencial por ano, sem pular nem repetir).
- Você entra como **autor**. A abertura **avisa** o responsável e os copiados (na caixa de **Menções**, o sino).
- A janela fica aberta? Se faltar algo, ela diz **o que falta**, em português.

> **Atenção:** a janela **não fecha ao clicar fora**: um clique solto não perde o que você digitou. Para sair, **Cancelar**.

## A ficha por dentro

Ao clicar numa linha, abre a **ficha**. No alto: o **número**, a **etapa** e a **situação**, e os dados do atendimento (cliente, contato, veículo, placa, chassi, origem, data da ocorrência, responsável, quem abriu, descrição da falha e **copiados**).

![O topo da ficha](img/52b-garantia-ficha-topo.jpg)

Abaixo vêm as **seções**. **Cada seção tem um selo** que mostra a situação dela. A ficha caminha em **quatro etapas**:

FLUXO: Avaliação técnica > Fornecedor > Quem executa > Em atendimento

**Regra da ficha: "sem avaliação, não segue".** O fornecedor e quem executa só se registram **depois** da avaliação técnica.

![A ficha completa](img/54-garantia-ficha-completa.jpg)

### 1. Projeto de origem (Desenvolvimento)

![Projeto de origem](img/55-garantia-projeto-de-origem.jpg)

Mostra se o **veículo** tem projeto no Desenvolvimento da Engenharia. Quando tem, aparece o que a Engenharia deixou para a Garantia e o botão para **pedir uma mudança no projeto** (o pedido vai para o projeto, **ligado a esta ficha**). Se o veículo não tem projeto: *"Nenhum projeto do Desenvolvimento ligado a este veículo."*

### 2. Avaliação técnica

**Quando usar:** logo depois de abrir a ficha. **Quem faz:** o responsável ou a gerência.

1. Clique **Registrar avaliação**.
2. Escreva o **Parecer técnico\***: o que foi encontrado, a causa provável e o que precisa ser feito.
3. Escolha a **Cobertura\***: **Dentro da garantia**, **Fora da garantia** ou **A confirmar**.
4. Clique **Registrar avaliação**.

![Registrar avaliação técnica](img/53-garantia-registrar-avaliacao.jpg)

**Apoio do sistema:** se a origem é uma OP com garantia e data de entrega, a ficha mostra, por exemplo: *"garantia da OP de 12 meses, entregue em 13/04/2026, termina em 13/04/2027. A falha foi em 19/10/2026: dentro do prazo (faltavam 176 dias)"*. **É só apoio**: quem decide é o técnico.

![Avaliação registrada, com o apoio de cobertura](img/56-garantia-avaliacao.jpg)

**O que acontece:** a etapa passa a **Fornecedor**. **Refazer a avaliação** troca o parecer (o histórico anota "avaliação refeita").

- **Dentro da garantia:** segue normalmente.
- **A confirmar:** não trava, mas a ficha avisa: *"Se ficar fora da garantia, será preciso o alinhamento com o cliente e a autorização da direção para seguir."*
- **Fora da garantia:** **trava** quem executa e o pedido de peça até haver **alinhamento aceito pelo cliente** **e** **autorização aprovada pela direção** (veja abaixo). Uma faixa amarela no alto da ficha diz o que falta.

![Ficha fora da garantia, com a faixa de trava](img/68-garantia-fora-da-garantia.jpg)

### 3. Fornecedor (garantia da peça)

**Quando usar:** depois da avaliação. O defeito pode estar numa peça que **o fornecedor cobre**: a ficha guarda a consulta.

**Opção A, consultar o fornecedor:**

1. Clique **Registrar consulta ao fornecedor**. Em **O que registrar**, deixe **Consulta ao fornecedor**.
2. Preencha **Fornecedor\***, **Protocolo**, **Data da consulta\*** (não pode ser futura) e **Prazo de resposta**.
3. Se o fornecedor **já respondeu**, escreva a **Resposta do fornecedor**. Aparecem **O fornecedor...\*** (**cobre**, **cobre em parte** ou **não cobre**) e a **Data da resposta\***. Se **ainda não respondeu**, deixe a resposta em branco.
4. Clique **Registrar**.

Depois, quando o fornecedor responder, o botão vira **Registrar a resposta**.

**Opção B, "Não se aplica":** em **O que registrar**, escolha **Não se aplica (justifique)** e escreva **por que a consulta não se aplica\***. Clique **Registrar**.

![Fornecedor: consulta registrada e respondida](img/57-garantia-fornecedor.jpg)

**O selo da seção** mostra: **Não registrado**, **Aguardando resposta**, **Resposta atrasada há N dias** (vermelho, quando passou o prazo de resposta), **O fornecedor cobre / Cobre em parte / Não cobre**, ou **Não se aplica**.

**O que acontece:** a etapa só passa a **Quem executa** quando a consulta está **respondida** ou **dispensada com justificativa**.

### 4. Quadro de custos

**Quando usar:** sempre que souber de uma despesa do atendimento.

1. Clique **Lançar custos** (na seção vazia) ou **Editar o quadro** (quando já há linhas).
2. Para cada linha (**Adicionar custo** acrescenta uma; o **×** tira):
   - **Tipo**: Diagnóstico, Deslocamento, Frete, Mão de obra, Peça, Terceiro ou Outro;
   - **Descrição** (opcional);
   - **Previsto R$\***;
   - **Negociado R$** (o valor que se conseguiu negociar; **em branco, vale o previsto**) e **Quem negociou** (**obrigatório se houver valor negociado**);
   - **Paga:** **Nós (empresa)**, **Cliente** ou **Fornecedor**;
   - **Aprovado:** marque quando o valor for aprovado (fica gravado **quem aprovou e quando**).
3. Clique **Salvar quadro de custos**.

![Quadro de custos](img/58-garantia-custos.jpg)

**Os totais** que o quadro mostra: **Previsto**, **Considerado** (o **negociado**, quando houver; senão o previsto), **Aprovado** e **quanto cada um paga** (empresa, cliente, fornecedor). Aceita até **40 linhas**. Cada alteração fica no histórico, dizendo **o que entrou e o que saiu**.

> **Dica:** se a execução for por **terceiro** com custo previsto, aparece o botão **Lançar o custo do terceiro (R$ ...)**, que põe esse custo no quadro com um clique. Só dá para lançar **uma vez**.

### 5. Alinhamento com o cliente

**Quando usar:** quando você conversa com o cliente sobre o atendimento, **principalmente se estiver fora da garantia**.

1. Clique **Registrar alinhamento**.
2. Preencha **Com quem do cliente falou\***, **Dia da conversa\*** (não pode ser futuro), **Por onde\*** (Telefone, WhatsApp, E-mail, Presencial, Outro), **O cliente...\***: **aceitou**, **não aceitou** ou **aguardando o cliente**, e **O que ficou combinado (condições e quem paga)\***.
3. Clique **Registrar alinhamento**.

![Alinhamento com o cliente](img/59-garantia-alinhamento.jpg)

**O que acontece:** **cada conversa fica guardada** (só se acrescenta); **vale a última** para as travas. Só **"O cliente aceitou"** libera o atendimento fora da garantia.

### 6. Autorização da direção

**Quando usar:** despesa **fora da garantia** ou **cortesia**. **Tudo isso vai para a direção, sem faixa de valor.**

**Quem pede (o responsável ou a gerência):**

1. Clique **Pedir autorização à direção**.
2. Em **O que está sendo pedido\***, escolha **Despesa fora da garantia** ou **Cortesia**. Em **Valor (R$)\*** já vem o que a **empresa paga** no quadro de custos. Escreva o **Motivo\***.
3. Clique **Pedir à direção**. **Só pode haver um pedido esperando por vez.**

**Quem decide (só o Admin):**

- **Aprovar** (o sistema pergunta "Autorizar ... de R$ ...?") ou **Negar** (pergunta "Por que a autorização foi negada?": o motivo é **obrigatório**).

Quem pediu, o responsável e a gerência ainda podem usar **Cancelar o pedido** enquanto ele espera a direção (com motivo).

![Autorização da direção](img/60-garantia-direcao.jpg)

**O que acontece:** o pedido **avisa toda a direção** (todos os Admin) na caixa de Menções. A decisão **avisa** o responsável e os copiados. Fica gravado **quem decidiu e quando**.

### 7. Quem executa

**Quando usar:** com a avaliação e o fornecedor resolvidos (e, se fora da garantia, o alinhamento aceito e a autorização aprovada).

1. Clique **Definir quem executa**.
2. Em **Quem executa\***, escolha:
   - **Equipe própria:** escolha cada técnico na lista e clique **Adicionar técnico** (pelo menos um; o **×** tira);
   - **Terceiro:** digite o **Terceiro (empresa ou pessoa)\*** e o **Custo previsto (R$)** (pode ficar para depois).
3. Clique **Registrar**.

![Quem executa](img/61-garantia-quem-executa.jpg)

**O que acontece:** a etapa passa a **Em atendimento**. **Alterar** troca a escolha.

### 8. Ordens de serviço

**Quando usar:** a execução vai ser feita pela fábrica (Laboratório ou Produção) e **precisa de uma OS**.

1. Clique **Gerar OS de execução**.
2. A **Nova OS** abre **já preenchida** com cliente, contato, veículo, chassi e falha, **ligada a esta ficha**.
3. Em **Esta OS será**, escolha **Sem cobrança (garantia ou cortesia)** ou **Cobrada do cliente** (a sugestão vem da cobertura da ficha). Termine como qualquer OS (veja a Parte 2).

![A seção Ordens de serviço da ficha](img/62-garantia-ordens.jpg)

> **Atenção:** o botão só libera com a **avaliação técnica registrada**; se a cobertura é **fora da garantia**, falta o **alinhamento aceito** e a **autorização**. Quando não libera, o botão vira uma frase dizendo o que falta ("Para gerar a OS: ..."). E o botão só existe para quem tem a **aba SAC**.

**O que acontece:** a seção mostra **a lista das OS geradas**, com a **etapa de cada uma** e se é **sem cobrança** ou **cobrada**. O histórico da ficha registra "Ordem de serviço gerada: OS-0130/2026 (sem cobrança)". Na OS, o selo **Ficha GAR-...** leva de volta à ficha com um clique.

### 9. Peças pedidas ao Compras (reposição)

**Quando usar:** é preciso **comprar** uma peça para repor.

1. Clique **Pedir peça ao Compras**.
2. A solicitação abre **com o título "Peça em garantia — GAR-0001/2026"** e o contexto da ficha (cliente, veículo, fornecedor consultado). Preencha como qualquer solicitação de compra e envie.
3. O pedido **fica ligado à ficha**, com o número do pedido (**PC-0150/2026**).

![Peças pedidas ao Compras](img/63-garantia-pecas-compras.jpg)

> **Atenção:** o botão **fica desligado** até haver a **avaliação técnica** e a **consulta ao fornecedor respondida** (ou justificada). Quando está desligado, a frase embaixo diz o que falta. Se a ficha for **fora da garantia**, também exige alinhamento e autorização.

> **Dica:** se o pedido **nasceu no Compras mas a ficha não gravou**, o sistema avisa o **número do pedido**: **não abra outro**, avise a gerência para ligar o pedido ao atendimento.

### 10. Peças em garantia (envio e retorno)

**Quando usar:** a **peça defeituosa** vai ao fornecedor para análise ou troca, e depois **volta** (ou é reposta ou descartada). É diferente do "Pedir peça ao Compras": aqui você acompanha **a peça que saiu**.

**Cadastrar a peça:**

1. Clique **Cadastrar peça em garantia**.
2. Informe a **Peça\*** (por exemplo, "fonte 12V da barra"), a **Quantidade\*** (inteiro, 1 ou mais) e o **Número de série**.
3. Clique **Cadastrar peça**. A peça entra como **A enviar**.

**Registrar cada passo da peça** (botão **Registrar movimento**, dentro da peça): ela segue **um caminho**:

FLUXO: A enviar > Enviada ao fornecedor > Em análise > Retornou / Reposta / Descartada

| De | Pode ir para |
|---|---|
| **A enviar** | Enviada ao fornecedor · Descartada |
| **Enviada ao fornecedor** | Em análise · Retornou · Reposta · Descartada |
| **Em análise** | Retornou · Reposta · Descartada |
| **Retornou, Reposta, Descartada** | (fim do caminho) |

4. Em cada movimento informe **Agora a peça está\*** (só aparecem as situações possíveis), a **Data\*** (não pode ser futura nem antes do movimento anterior), o **Rastreio** (código ou transportadora) e a **Observação**. Para **Descartada**, o campo vira **Por que foi descartada\*** e é obrigatório. Clique **Registrar movimento**.
5. A **Trilha da peça (N)** mostra, do mais novo ao mais antigo, cada movimento com data e quem registrou.

![Peças em garantia (envio e retorno)](img/64-garantia-pecas-envio-retorno.jpg)

**Errou?**

- **Desfazer o último movimento:** aparece quando a peça já teve movimento; volta um passo (nunca o primeiro) e **pede o motivo**, que fica no histórico.
- **Tirar a peça:** aparece só enquanto a peça **nunca saiu do começo** (cadastrada por engano). Se já tem movimento, desfaça os movimentos antes.

A seção mostra o selo **"N ainda não voltou"** para as peças que ainda não chegaram a um fim, e o aviso de **dias parada**; a partir de **5 dias** vira atenção.

### 11. Apontamentos do atendimento (diário técnico)

**Quando usar:** a cada dia de trabalho no atendimento.

1. Clique **Registrar apontamento** (ou **Editar os apontamentos**, quando já há).
2. Para cada linha (**Adicionar apontamento** acrescenta uma; o **×** tira): **Dia** (não pode ser futuro), **Técnico** (escolha na lista de colaboradores), **Horas\*** (de 0 a 24), **Falha encontrada\***, **Solução adotada** (pode ficar para depois) e **Peças aplicadas** (opcional).
3. Clique **Salvar apontamentos**.

![Apontamentos do atendimento](img/65-garantia-apontamentos.jpg)

**O que acontece:** a seção mostra o **total de horas** (e por técnico). Aceita até **200 apontamentos**. **Para encerrar o atendimento é preciso ao menos um apontamento com a solução adotada.**

### 12. Histórico do atendimento

![Histórico do atendimento](img/66-garantia-historico.jpg)

A lista de **tudo que aconteceu na ficha**, com **data, hora e quem fez** (abertura, avaliação, fornecedor, execução, custos, alinhamento, autorização, peças, apontamentos, OS gerada, edição, cancelamento, reabertura, encerramento). Não se apaga nada: **a ficha só acrescenta**.

## O rodapé da ficha

![O rodapé da ficha](img/67-garantia-rodape.jpg)

| Botão | O que faz | Quem |
|---|---|---|
| **Editar** | Abre a mesma janela da abertura (cliente, veículo, origem, falha, responsável, copiados); o botão final é **Salvar alterações**. **Só com a ficha aberta.** O histórico diz **quais campos mudaram**; se nada mudou, o sistema avisa "Nada foi alterado" | Quem abriu, o responsável, a gerência |
| **Cancelar atendimento** (vermelho) | Pede o **motivo** (obrigatório) e uma confirmação. **Nada é apagado** | Quem abriu, o responsável, a gerência |
| **Reabrir** | Pede confirmação e reabre a ficha **cancelada** ou **encerrada** | Cancelada: quem abriu, o responsável, a gerência. Encerrada: o responsável e a gerência |
| **Encerrar atendimento** | Pede o **texto de fechamento** ("o que foi feito e como o atendimento terminou") e uma confirmação. Depois de encerrado, **não recebe mais registros** (dá para reabrir) | O responsável e a gerência |
| **Fechar** | Fecha a janela da ficha | Todos |

**Para o botão Encerrar liberar** a ficha precisa ter:

1. a **avaliação técnica** registrada;
2. **nenhuma peça em garantia que ainda não voltou** (todas **Retornou, Reposta ou Descartada**);
3. **nenhum pedido de autorização esperando** a direção (decida ou cancele);
4. **ao menos um apontamento com a solução adotada**.

Enquanto faltar algo, o botão fica desligado e a frase ao lado diz **o que falta** ("Para encerrar falta: dar fim a 1 peça em garantia que ainda não voltou...").

> **Atenção:** a ficha **nunca se apaga**. Para desfazer algo, use **Cancelar** (com motivo) e, se precisar, **Reabrir**.

**Faixas no topo da ficha** (leia antes de mexer): **verde**, "Atendimento encerrado por ... em ... " com o texto de fechamento; **âmbar**, "Atendimento parado: sem nenhum movimento na ficha há N dias" (com o último movimento); **âmbar**, "Atendimento cancelado. Motivo: ... Nada foi apagado".

## Quem é avisado, e quando

**Todo evento novo do histórico da ficha avisa** o **responsável** e os **copiados** (**quem fez a ação não é avisado**), na caixa de **Menções** (o sino). O aviso **leva direto à ficha**.

- **Sempre avisam:** abertura, cancelamento, reabertura, **pedido de autorização** (e aí **toda a direção**, ou seja, **todos os Admin**) e a **decisão da direção**.
- **Também avisam:** avaliação, fornecedor, quem executa, peça pedida ao Compras, alinhamento, quadro de custos, cada movimento de peça, apontamentos e OS gerada.
- Quem **entra ou sai** do atendimento numa edição (responsável ou copiados) **é avisado** com uma frase dizendo o que mudou para ele.

## O relatório semanal

**Quando usar:** a gerência e o Admin fazem a reunião semanal da garantia.

**Passo a passo:** na lista da aba Garantia, clique **Relatório semanal** (só aparece para a gerência e o Admin).

![O relatório semanal de garantia](img/70-garantia-relatorio-semanal.jpg)

- **Semana anterior / Semana seguinte / Esta semana / data:** escolhem a semana. **Semana é de segunda a domingo.**
- **Cartões do resumo:** *Abertos na semana, Encerrados na semana, Cancelados na semana, **Em aberto hoje**, **Parados há 5 dias ou mais**, **Peças que não voltaram**, **Esperando a direção**, Horas apontadas na semana, Custo considerado (movimentados).*
- **Tabelas:** *Atendimentos movimentados na semana* (com custo considerado, pago pela empresa e horas), *Encerrados na semana* (com o texto de fechamento), *Parados há 5 dias ou mais*, *Peças em garantia que ainda não voltaram* e *Esperando a decisão da direção*.
- **Baixar PDF:** gera o mesmo relatório para imprimir ou enviar.

> **Atenção:** o que depende da semana escolhida (abertos, encerrados, movimentados, horas) usa **os dias da semana**. O que é **"agora"** (em aberto, parados, peças que não voltaram, esperando a direção) é **sempre a situação de hoje**, qualquer que seja a semana: a ficha só guarda o último estado, então não dá para reconstruir o que estava parado numa semana antiga. O relatório avisa isso na tela.

---

# Aba Cadastros

## Para que serve

Os **Cadastros** são as **listas** que aparecem nas escolhas da **Nova OS**. Se um tipo de equipamento, uma categoria ou um tipo de serviço **não está aqui**, **não aparece** na Nova OS.

Há **três listas**, nas abas internas: **Equipamentos**, **Categorias (Tipo Projeto)** e **Tipos de Serviço**.

> **Atenção:** nada se **apaga**: você **desativa** (o item some da Nova OS) e pode **Ativar** de novo. As OS antigas **não mudam**: guardam o texto que tinham.

## Equipamentos

![Cadastro de tipos de equipamento](img/80-cadastros-equipamentos.jpg)

**Para que serve:** a lista do campo **Tipo de equipamento** da Nova OS.

**Passo a passo:**

1. Aba **Cadastros > Equipamentos**.
2. Digite o nome em **"Nome do tipo de equipamento..."** e clique **Adicionar**.
3. Para tirar um tipo da Nova OS, clique **Desativar** (vermelho). O tipo fica **cinza**, marcado **Inativo**, com o botão **Ativar**.

> **Dica:** na própria Nova OS, o link **+ novo**, ao lado de **Tipo de equipamento**, cadastra um tipo na hora (sem sair da janela).

## Categorias (Tipo Projeto)

![Cadastro de categorias](img/81-cadastros-categorias.jpg)

**Para que serve:** a lista do campo **Categoria (tipo projeto)** da Nova OS. A categoria também **muda o que a Nova OS pede**.

**Passo a passo:**

1. Aba **Cadastros > Categorias (Tipo Projeto)**.
2. Digite o **Nome da categoria**.
3. Se esta categoria tem **gastos de campo**, marque **"Exibe despesas de campo (Serviço Externo)"**: a Nova OS passa a pedir **Deslocamento, Hospedagem e Alimentação**.
4. Clique **Adicionar**.
5. **Editar** troca o nome e a marca de despesas. **Desativar / Ativar** liga e desliga.

> **Atenção:** o sistema **reconhece a OS de veículo pelo nome da categoria**: nomes que têm "manutenção" (ou "garantia") **e** "veicular" (ou "veículo") levam a OS para o **caminho do veículo**. **Não renomeie** a categoria **Manutenção Veicular** nem crie outra com nome parecido sem avisar a TI.

## Tipos de Serviço

![Cadastro de tipos de serviço](img/82-cadastros-tipos-de-servico.jpg)

**Para que serve:** a lista do campo **Tipo de serviço** da Nova OS. Hoje: **Orçamento, Conserto, Troca e Garantia**.

**Passo a passo:**

1. Aba **Cadastros > Tipos de Serviço**.
2. Digite o nome em **"Nome do tipo de serviço..."** e clique **Adicionar**.
3. **Desativar / Ativar** liga e desliga.

> **Atenção:** o tipo **Garantia** é **especial**: o sistema reconhece a OS de garantia **por esse nome** (a ficha, a OS sem cobrança, tudo depende dele). **Não desative nem renomeie o tipo "Garantia"**: se desativar, **a garantia deixa de abrir OS**. A tela hoje **não protege** esse botão: está nos pontos de melhoria.

> **Atenção:** quando uma lista está **vazia**, a tela mostra uma mensagem técnica ("Rode o SQL ... no Supabase"). Se você a vir, **avise a TI**: significa que o cadastro não foi montado. A lista de tipos de serviço tem uma reserva (Orçamento, Conserto, Troca, Garantia) que aparece sozinha.

---

# Dúvidas do dia a dia

## "O que fazer quando..."

| Situação | O que fazer |
|---|---|
| **O serviço já foi feito fora da fábrica, mas a OS está em Em Cotação** (ou em outra etapa antes da execução) | Menu ⋯ da OS > **Registrar atendimento já realizado**. Para um lote, use o botão **Registrar atendimento já realizado** do cartão do lote. A OS vai para **Concluído** |
| **Registrei o atendimento por engano** | Na OS concluída por esse registro, menu ⋯ > **Desfazer o registro do atendimento** (pede o motivo) |
| **A OS é garantia, mas apareceu em "Em Cotação"** | OS antiga: botão **Seguir sem cotação** (uma por vez). OS nova de garantia nasce sem cotação |
| **Preciso abrir uma OS de garantia** | Primeiro a **ficha** (aba Garantia). Depois **Gerar OS de execução** na ficha |
| **O cliente aprovou, mas a assinatura não subiu** | A aprovação **não foi registrada**. A janela fica aberta com o que você digitou: tente de novo (confira a conexão) |
| **A OS "sumiu" da lista** | Confira os **filtros** (botão **Limpar**) e a faixa acima do quadro: OS **Reprovada** e **Cancelada** ficam fora do quadro e só aparecem na lista, pelo filtro de status |
| **A OS está parada em outra etapa** | O cartão diz **"Aguarda: ..."** e **"parada há N dias"**. Use **Acomp.** para registrar a cobrança e **@Nome** para avisar o setor |
| **A OS está num setor e eu preciso adiantar** | Se é do **Laboratório**, o menu ⋯ tem **Mover para ...**. Se está com **Produção, Qualidade ou Fiscal**, o SAC **não move**: peça ao setor |
| **Abri a OS por engano ou o cliente desistiu** | Menu ⋯ > **Cancelar OS** (com motivo). Se já está no Fiscal, o cancelamento passa pelo Fiscal |
| **O cliente quer a OS sem cobrança, e ela já está concluída** | Menu ⋯ > **Entregar sem nota (cortesia)** (com motivo) |
| **Chegaram vários equipamentos iguais** | Na **Nova OS**, aumente a **Qtd** e marque a caixa do lote. Para repetir uma OS existente: **Copiar OS** |
| **Preciso do PDF para o cliente assinar** | Menu ⋯ > **PDF**. A assinatura do cliente fica no pé da folha |
| **Duas pessoas mexeram na mesma OS** | O sistema avisa **"a OS já mudou de etapa (outra pessoa mexeu nela)"** e atualiza a lista. Confira e refaça se for o caso |
| **Chamado NFC de cliente** | Aba **Chamados NFC** > **Atender** > **Notas** > **Concluir**. Se há serviço, abra a **OS** ou a **ficha** |

## O que o sistema avisa por WhatsApp

Se o aviso estiver **ligado na configuração do sistema**, o grupo configurado recebe uma mensagem a cada um destes passos:

| Passo | Mensagem |
|---|---|
| Nova OS | "Nova OS ..., cliente, equipamento, tipo, por quem" (no lote, **um aviso** com todos os números) |
| Orçamento enviado | "Orçamento enviado — OS ..., cliente, valor" |
| Cotação enviada | "Cotação enviada — OS ..., cliente, total" |
| Cotação aprovada | "Cotação APROVADA ... Produção: definir data de atendimento" |
| OS aprovada | "OS ... APROVADA, cliente, aprovador" |
| OS reprovada | "OS ... REPROVADA, cliente, motivo" |
| Aceite da data | "SAC confirmou data — OS ..., data e período" |
| Enviado ao Fiscal | "Enviado para o Fiscal — OS ..." |
| OS entregue | "OS ... ENTREGUE, cliente, retirado por" |
| OS cancelada | "OS ... CANCELADA, motivo, setores que devem encerrar a demanda" |

## Todas as etapas e quem age

| Etapa | Quem age | O que fazer |
|---|---|---|
| **Aberta** | SAC | OS sem caminho: decidir se segue, cancela ou cobra |
| **Diagnóstico** | Laboratório (veículo: Produção) | Terminar o diagnóstico e o orçamento |
| **Orçamento Pronto** | **SAC** | Enviar o orçamento ao cliente |
| **Orç. Enviado** | Cliente | Resposta ao orçamento (o SAC cobra) |
| **Aprovado** | Laboratório | Iniciar a execução |
| **Em Cotação** | **SAC** | Montar e enviar a cotação (garantia: seguir sem cotação) |
| **Aguardando Aprovação Cliente** | Cliente | Aprovação da cotação ou do orçamento (o SAC cobra e registra) |
| **Em Provisionamento** | Produção | Marcar a data do atendimento |
| **Aguardando Aceite SAC** | **SAC** | Confirmar a data com o cliente |
| **Provisionada / Aguardando Início** | Produção | Receber o veículo e iniciar |
| **Verificação e Orçamento** | Produção | Verificar o veículo e orçar |
| **Em Execução** | Laboratório ou Produção (ou o SAC, na OS lançada pelo card com "O SAC conclui") | Executar o serviço |
| **Aguardando CQ** | Qualidade | Auditar a OS |
| **Concluído** | **SAC** | Enviar ao Fiscal (cobrada) ou Entregar (sem cobrança) |
| **Aguardando Envio Fiscal** | **SAC** | Informar os seriais e enviar ao Fiscal |
| **Aguardando Emissão NF** | Fiscal | Emitir a nota |
| **Faturada - Aguardando Entrega** | **SAC** | Entregar ao cliente |
| **Entregue** | ninguém | Fim do caminho |
| **Reprovado** | **SAC** | Reavaliar ou encerrar a OS |
| **Cancelada** | ninguém | Fim do caminho |

## Quando algo dá errado

- **"Não foi possível gravar" / "A OS NÃO foi aberta":** o texto diz **o que não foi gravado**. Nada pela metade: a janela continua aberta com o que você digitou. Tente de novo.
- **"A OS já mudou de etapa (outra pessoa mexeu nela)":** o sistema atualizou a lista. Confira a etapa nova antes de refazer.
- **Arquivo que não sobe:** o nome tem **caractere especial**, o arquivo é **grande demais**, a **conexão caiu** ou falta **permissão**. A mensagem diz qual é o caso. Renomeie o arquivo sem acento e símbolos e tente de novo.
- **Faltou a demanda do Laboratório ou da Engenharia** (aviso depois de abrir ou aprovar a OS): a OS **existe**, mas o setor só enxerga o trabalho pela **demanda**. **Avise o PCP ou a TI.**
- **A tela mostra algo estranho depois de eu mexer em outra aba:** clique de novo no filtro ou recarregue a página. A lista de OS **não atualiza sozinha**.

---

# Apêndice: pontos de melhoria já mapeados

A análise do setor (arquivo **ANALISE_UX_SAC.md**) lista o que pode ficar mais claro na tela. Os que mais afetam quem opera hoje:

- A **ajuda de "Presencial"** na Nova OS diz que o SAC define a data; **quem marca é a Produção**.
- **Dois botões "Enviar ao Fiscal"** pedem coisas diferentes (seriais, ou valor e CPF/CNPJ); **três janelas de entrega** (a do veículo não colhe assinatura).
- **"Garantia"** em Cadastros tem o botão **Desativar** sem confirmação.
- **Chamados NFC** não mostram há quantos dias estão abertos.
- A **barra de progresso** da OS de veículo presencial **volta uma casa** depois da aprovação do orçamento (é só o desenho).
- A OS de **veículo sem cobrança** ainda aparece nas etapas de verificação e aprovação, que, pela regra, ela não deveria ter (**a confirmar** com a Produção).
