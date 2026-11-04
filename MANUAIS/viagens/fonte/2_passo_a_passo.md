# Passo a passo: da montagem à aprovação

## Montar a viagem (Nova viagem)

**Quando usar:** uma equipe vai sair da fábrica para um cliente.

**Quem faz:** quem tem a aba Viagens.

![A janela Viagem aberta, com a parte de cima](img/07-viagem-aberta-inteira.jpg)

### Passo a passo

1. Na tela de Viagens, clique em **Nova viagem** (botão verde, no alto à direita). A janela **Viagem** abre vazia.
   ![A janela Nova viagem, vazia](img/06-nova-viagem-vazia.jpg)
2. **Dados da viagem.** Preencha:
   - **Título\*:** o nome que aparece no cartão (por exemplo, "Instalação de 12 viaturas — Prefeitura de Demonstração/SC").
   - **Data de saída** e **Horário de saída:** o horário vale para todos os dias do roteiro.
   - **Pessoas:** quantas pessoas vão (entra na conta da alimentação).
   ![Bloco Dados da viagem](img/12-dados-da-viagem.jpg)
3. **Ligada a (OP, PV, Licitação).** Escolha o tipo (**OP**, **PV** ou **Licitação**), busque e clique no registro. Pode ligar mais de uma coisa. Clicar numa ligação **abre o registro** (se houver algo não salvo na viagem, o sistema pergunta antes). As OPs que geraram a viagem sozinhas aparecem com "gerou a viagem" e não se tiram à mão.
4. **Roteiro.** Veja o próximo tópico.
5. **Custos** e **Orçamento.** Veja os tópicos seguintes.
6. Clique em **Salvar viagem**.

**O que acontece:** a viagem é gravada em **Aberta**, com você como quem criou, e aparece no quadro.

**Vai para:** nada muda de coluna; quando estiver pronta, use **Enviar para aprovação**.

> **Atenção:** salvar uma viagem cuja rota está desatualizada pede confirmação (veja o alerta amarelo no [Roteiro](#roteiro-e-rota)).

## Roteiro e rota

![Bloco Roteiro: saída, paradas, calcular rota e trechos](img/08-roteiro.jpg)

1. **Saída (origem):** busque o ponto de saída (a fábrica, em geral) digitando a cidade ou o endereço e clique no candidato certo. O botão **trocar** muda o ponto.
2. **Paradas:** busque cada parada do mesmo jeito e clique em **Buscar**. Para cada uma diga **quantos dias no local** a equipe fica. As setas **↑ ↓** mudam a ordem e o **×** tira a parada. **Colar vários endereços** abre uma caixa para colar uma lista (um endereço ou cidade por linha): o sistema busca todos, mostra o local achado para cada um (você pode trocar o candidato) e as linhas que não achou voltam para a caixa; clique para adicionar os achados como paradas.
3. Escolha as opções:
   - **Ida e volta (retorna ao ponto de saída):** marcada por padrão.
   - **Achar a melhor ordem das paradas:** o sistema reorganiza as paradas para o caminho ficar mais curto.
4. Clique em **Calcular rota**. O sistema mostra, trecho a trecho, a **distância** e o **tempo**, e o **total (ida e volta)**.

> **Dica:** "Dias no local" contam o **dia da chegada como o dia 1**. Com 3 dias, a equipe chega, trabalha no dia 1, dorme duas noites e sai no fim do dia 3.

> **Atenção:** se você mudar o roteiro depois de calcular a rota, aparece um alerta amarelo: **"O roteiro mudou depois do último cálculo"**. O km, o tempo e os custos mostrados são os da rota antiga. Clique em **Calcular rota** de novo antes de enviar para aprovação.

### Roteiro dia a dia

![O roteiro desenhado dia por dia](img/09-roteiro-dia-a-dia.jpg)

Depois de calculada a rota, o sistema desenha **cada dia**: a hora de saída, onde a equipe chega, onde **pernoita**, os dias de trabalho em cada parada e a chegada de volta. Os horários consideram só o tempo de direção, **sem almoço, abastecimento nem descanso**, e os dias contam sábado e domingo. O botão **Copiar roteiro** copia o texto para você colar numa mensagem.

## Custos e orçamento

![Bloco Custos: os números que entram na conta](img/10-custos.jpg)

Os campos de **Custos** alimentam a conta do orçamento:

| Campo | Para que serve |
|---|---|
| **Consumo do veículo** (km/l) e **Combustível** (R$/l) | Custo do combustível pelo km da rota |
| **Desgaste do veículo** (R$/km) | Pneus, manutenção, depreciação. É custo calculado, não sai dinheiro |
| **Direção por dia** (h/dia) | Quantas horas a equipe dirige por dia: define os dias de estrada |
| **Diária do quarto** e **Quartos** | A hospedagem |
| **Noites de hotel** | Em branco = automático (dias − 1) |
| **Alimentação** (R$/pessoa/dia) | Vezes as pessoas e os dias |
| **Valor do km rodado** | O que se cobra ou reembolsa por km. Em branco = o custo real por km |
| **Margem sobre o custo** (%) | Entra no valor do orçamento |
| **Pedágios** e **Outros custos** | Linhas lançadas à mão (**Adicionar linha**): as fontes gratuitas de mapa não informam pedágio |

![Quadro Orçamento: o resultado da conta](img/11-orcamento.jpg)

O quadro **Orçamento** mostra o percurso (km, horas de direção, dias e noites), cada custo e o total. O mesmo valor aparece em negrito no cartão.

## Enviar para aprovação

**Quando usar:** o roteiro e o orçamento estão prontos.

**Quem faz:** quem tem a aba Viagens.

1. Abra a viagem (**Aberta**) e clique em **Enviar para aprovação**, no rodapé da janela, ou no botão do cartão.
2. Se algo faltar, o sistema diz o quê: para ir à aprovação a viagem precisa de **título, data de saída, ponto de saída, pelo menos uma parada e a rota calculada e atualizada**.

**O que acontece:** a viagem passa para **Em aprovação** e fica no histórico.

**Vai para:** Em aprovação, com a direção.

## Aprovar ou recusar

**Quem faz:** a direção (Admin e gerentes; a equipe do Comercial e das Licitações vale como gerente do setor).

![A viagem Em aprovação, aberta pela direção](img/13-em-aprovacao-janela.jpg)

1. Abra a viagem em **Em aprovação**: pelo quadro ou pela caixa de **Menções** (quando a viagem nasce de uma OP, quem aprova recebe um aviso).
2. Confira o roteiro, os custos e o orçamento.
3. Use um dos botões do rodapé:

![Os botões do rodapé em Em aprovação](img/14-botoes-da-aprovacao.jpg)

- **Aprovar (vai para Provisionamento)**
- **Não aprovar:** pede o **motivo**, que fica no histórico.
- **Devolver para Aberta:** pede o motivo; quem montou ajusta e envia de novo.

**Vai para:** Provisionamento, Não aprovada ou Aberta.

> **Dica:** a viagem **Não aprovada** não se perde: o botão **Reabrir (volta para Aberta)**, com motivo, devolve a viagem para quem montou ajustar.

# Passo a passo: Provisionamento e a saída

## Preencher a sua parte em Provisionamento

Quando a viagem é aprovada, o sistema **avisa na caixa de Menções** cada setor com o que falta (Adaptação e Financeiro: quem tem aquela aba; Comercial: o vendedor ou responsável comercial da OP, ou quem criou a viagem). Quem não tem a aba Viagens abre a viagem **direto pelo aviso**, por cima de qualquer tela, e preenche só a parte do seu setor; o resto fica só para leitura.

![A janela em Provisionamento, com as partes de cada setor](img/15-provisionamento-janela.jpg)

Cada pessoa grava **só o grupo que pode editar**, e cada setor deixa uma linha no histórico: quem salva a parte de um não apaga o que o outro preencheu.

| Setor | O que preenche |
|---|---|
| **Adaptação** | Equipe que vai, veículo da frota (a placa vem do veículo), km do carro na saída |
| **Comercial** | Descrição do serviço, observações do contrato e os arquivos do contrato |
| **Financeiro** | Verba total, pedágio (reembolso ou convênio) e os dados do hotel |

### Parte da Adaptação: equipe e veículo

![Equipe e veículo](img/16-parte-adaptacao.jpg)

1. **Equipe que vai\*:** abra a lista e escolha as pessoas (aparecem como etiquetas).
2. **Veículo da frota\*:** escolha o veículo; a **placa** vem sozinha. O veículo vem do cadastro da [Frota](#a-frota).
3. **Km do carro na saída\*:** o que o painel marca na hora de sair. Ao escolher o veículo, o sistema sugere o km do cadastro.
4. Clique em **Salvar viagem**.

### Parte do Comercial: serviço e contrato

![Serviço e contrato](img/17-parte-comercial.jpg)

- **Descrição do serviço:** o que a equipe vai fazer no local.
- **Contrato com o cliente:** número do contrato, cláusulas que a equipe precisa saber, quem assina no local.
- **Arquivos do contrato:** clique para anexar. O arquivo **sobe e fica ligado à viagem na hora**, sem precisar salvar.

### Parte do Financeiro: verba, pedágio e hotel

![Verba, pedágio e hotel](img/18-parte-financeiro.jpg)

- **Verba total\*:** o dinheiro liberado para a equipe levar.
- **Pedágio:** **Reembolso** (a equipe paga e depois pede o reembolso) ou **Convênio** (passa pela tag, sem pagar na cancela).
- **Hotel:** nome, telefone, endereço e reserva/observações.

> **Atenção:** a viagem **só pode sair para Andamento** com a **equipe, o veículo, o km de saída e a verba total** preenchidos. Hotel, pedágio, serviço e contrato **não travam** a saída.

## Aviso de saída próxima

Quando a viagem está em Provisionamento, falta **2 dias ou menos** para a saída (ou a data já passou) e ainda falta alguma parte, o cartão ganha o selo vermelho **"Falta para sair: …"**, dizendo o que falta (equipe, veículo da frota, km de saída ou verba total). Na janela da viagem, as partes que faltam aparecem vazias (equipe, veículo, km de saída, verba):

![Viagem que sai amanhã com as partes ainda vazias](img/19-provisionamento-faltando.jpg)

Além do selo, o sistema **avisa na caixa de Menções**, de segunda a sexta às 8h: a **Adaptação** (se falta a parte dela) e o **Financeiro** (se falta a verba). O aviso vai **uma vez só por viagem** e some sozinho quando a viagem sai de Provisionamento.

> **Dica:** a conta é a mesma da trava de saída: o que o selo lista é exatamente o que impede o botão **A equipe saiu**.

## Aviso de conflito de datas

![Faixa vermelha: o veículo e a pessoa já estão em outra viagem](img/20-aviso-de-conflito.jpg)

Ao escolher a equipe e o veículo, o sistema confere as **outras viagens** que ainda ocupam gente e carro (de Aberta até Andamento). Se a mesma pessoa ou o mesmo veículo estiver em outra viagem com datas que se sobrepõem, aparece uma **faixa vermelha** dizendo qual viagem e quais dias. Ao clicar em **A equipe saiu**, o sistema pergunta de novo se quer iniciar mesmo assim.

> **Dica:** o aviso **não trava**. Às vezes a equipe volta de manhã e sai à tarde; quem decide é a Adaptação. A viagem em Andamento continua ocupando equipe e carro até ser finalizada. A [Agenda](#a-agenda) mostra o mesmo conflito antes de você escolher.

## Imprimir a ficha da equipe

**Quando usar:** antes de a equipe sair.

**Quem faz:** quem tem a aba Viagens.

![A ficha da equipe, como sai na impressão](img/30-ficha-da-equipe.jpg)

Com a viagem em Provisionamento ou depois, clique em **Ficha da equipe**: na janela da viagem, ao lado de Imprimir, ou no menu **⋯** do cartão. Sai uma folha com:

- a saída, o percurso, a equipe, o veículo e o km de saída;
- a verba liberada e o pedágio;
- o roteiro dia a dia e os trechos;
- **no pé**, espaços para escrever à mão o km na volta, a data e hora da chegada, os gastos, as ocorrências, e as linhas de **assinatura** (responsável pela equipe e conferência da Adaptação).

A ficha **não leva o orçamento nem a margem**.

> **Atenção:** se o navegador bloquear a janela de impressão, o sistema avisa. Libere pop-ups para este site e tente de novo.

## A equipe saiu

**Quem faz:** quem tem a aba Viagens (em geral, a Adaptação).

1. Confira o aviso de conflito (se houver).
2. Clique em **A equipe saiu (iniciar a viagem)**, no cartão ou no rodapé da janela.
3. Se faltar algo, o sistema diz o quê e não grava.

**O que acontece:** a viagem passa para **Andamento** e o histórico ganha a linha. A equipe e o carro continuam ocupados na Agenda.

**Vai para:** Andamento.

# Passo a passo: volta e fechamento

## A equipe voltou

**Quem faz:** a Adaptação informa o km de volta; quem tem a aba Viagens finaliza.

![A janela em Andamento, com a parte Volta da equipe](img/21-andamento-janela.jpg)

1. Abra a viagem em **Andamento**.
2. Na parte **Volta da equipe**, informe o **Km do carro na volta**.

![Volta da equipe](img/22-volta-da-equipe.jpg)

3. Clique em **A equipe voltou (finalizar)**.

**O que acontece:** o km de volta é **obrigatório e precisa ser maior que o da saída**; sem ele o sistema não finaliza e diz o que falta. Ao finalizar, o **km de volta vira o km atual do veículo** na frota (só se for maior que o do cadastro).

**Vai para:** Finalizada.

## Custo real × orçado e comprovantes

**Quem faz:** o Financeiro.

![A janela de uma viagem Finalizada](img/23-finalizada-janela.jpg)

Na viagem **Finalizada**, a parte **Custo real × orçado** pede o que a viagem custou de fato:

![Custo real × orçado, com a coluna dos comprovantes](img/24-custo-real-e-comprovantes.jpg)

1. Preencha **combustível, pedágios, hospedagem, alimentação e outros custos**, e, se quiser, as **observações da prestação de contas**.
2. Na **tabela**, confira item por item o **orçado**, o **real** e a **diferença** (em vermelho quando passou do orçado). A última linha traz o total. Embaixo, o sistema compara com a **verba liberada** e diz se **sobrou** ou **faltou**.
3. Na coluna **Comprovantes**, clique em **Anexar** na linha do item e escolha a nota ou o recibo (até 20 MB por arquivo; pode anexar mais de um). O arquivo **sobe e fica ligado à viagem na hora**, sem precisar salvar. O **×** ao lado do nome tira o arquivo da lista (ele continua guardado no armazenamento). Clicar no nome abre o arquivo.
4. Clique em **Salvar viagem** para gravar os valores.

**O que acontece:** item com valor lançado e **sem comprovante** ganha a faixa vermelha **"Falta comprovante de: …"**. É só um lembrete: **não trava nada**. O custo real também **não trava** a finalização, porque a prestação de contas costuma chegar depois; a viagem finalizada sem custo lançado aparece em vermelho no relatório de [Custos](#o-relatório-de-custos).

> **Dica:** o **desgaste do veículo** é custo calculado, não sai dinheiro. Por isso ele fica fora da comparação, e o sistema mostra a observação embaixo da tabela.

# Passo a passo: outras ações

## Voltar uma etapa, recusar e reabrir

- **Devolver para Aberta** (de Em aprovação): quem montou ajusta e envia de novo.
- **Voltar para Em aprovação** (de Provisionamento) e **Voltar para Provisionamento** (de Andamento): só a **direção**.
- **Reabrir a viagem (volta para Andamento)** (de Finalizada): só a **direção**, para corrigir algo depois de finalizar.
- **Reabrir (volta para Aberta)** (de Não aprovada).

Todos pedem o **motivo**, que fica no histórico da viagem. Nada se apaga.

## Duplicar uma viagem

**Quando usar:** a mesma rota sai de novo (uma instalação em outra data, por exemplo).

**Quem faz:** quem tem a aba Viagens.

![A nova viagem aberta pelo Duplicar](img/29-duplicar-viagem.jpg)

1. No menu **⋯** do cartão (ou da linha, na Lista), clique em **Duplicar a viagem**.
2. Abre uma **nova viagem** com o título "(cópia)", as pessoas, o roteiro, a rota e os custos orçados.
3. Confira a **data de saída** (que vem vazia) e ajuste o que precisar.
4. Clique em **Salvar viagem**.

**O que não vai na cópia:** a data, as ligações com OP/PV/licitação, a equipe, o veículo, os km, a verba, o hotel, o serviço, o contrato, o custo real, os comprovantes e o histórico. **Nada é gravado** até você clicar em **Salvar viagem**: se fechar a janela, nada acontece.

## Apagar uma viagem

O botão **Apagar** (vermelho, no rodapé da janela) existe só para **Admin e gerentes** e para **quem criou a viagem**. O sistema pergunta antes e **não dá para desfazer**.

> **Atenção:** prefira **Devolver para Aberta** ou **Não aprovar** quando a viagem só precisa de ajuste: elas guardam o histórico; apagar não.

## Quando a OP da viagem volta ou é cancelada

Se uma OP ligada à viagem for **cancelada** ou **devolvida** (ao PCP ou ao Comercial), a viagem ganha uma nota no histórico e quem aprova recebe um aviso na caixa de Menções para conferir se a viagem ainda faz sentido. O sistema **não muda a viagem sozinho**.

## Abrir a viagem pelo aviso de Menções

Quando você recebe uma Menção de viagem (por exemplo, "a viagem foi aprovada e falta a sua parte"), o clique abre a janela da viagem **por cima da tela em que você está**, mesmo que você não tenha a aba Viagens. Aparece uma faixa avisando que você pode preencher só a parte do seu setor; o resto fica só para leitura.
