# Passo a passo

## Montar a viagem e enviar para aprovação

**Quando usar:** uma equipe vai sair da fábrica.
**Quem faz:** quem tem a aba Viagens.

1. Clique em **Nova viagem** e preencha o título, a data e o horário de saída e o número de pessoas.
2. Em **Ligada a**, escolha a OP, o PV ou a licitação a que a viagem pertence (pode ligar mais de uma coisa). Clicar numa ligação abre o registro.
3. Em **Roteiro**, busque o ponto de saída e as paradas e diga quantos dias a equipe fica em cada uma. O **dia da chegada conta como o dia 1**: com 3 dias a equipe chega, trabalha, dorme duas noites e sai no fim do dia 3.
4. Clique em **Calcular rota**. O sistema mostra o km, o tempo e o roteiro dia a dia.
5. Confira os **Custos** e o **Orçamento** e clique em **Salvar viagem**.
6. Clique em **Enviar para aprovação**.

**O que acontece:** a viagem passa para **Em aprovação** e fica no histórico. Para ir à aprovação ela precisa de título, data de saída, ponto de saída, uma parada e a rota calculada e atualizada.

> **Atenção:** se você mudar o roteiro depois de calcular a rota, o sistema avisa que o km e os custos são os da rota antiga. Calcule de novo antes de enviar.

## Aprovar ou recusar

**Quem faz:** a direção (Admin e gerentes; a equipe do Comercial e das Licitações vale como gerente do setor).

1. Abra a viagem em **Em aprovação** (pelo aviso na caixa de **Menções** ou pelo quadro).
2. Confira o roteiro e o orçamento.
3. Clique em **Aprovar (vai para Provisionamento)** ou em **Não aprovar** e escreva o motivo.

**Vai para:** Provisionamento, ou Não aprovada.

## Preencher a sua parte em Provisionamento

Quando a viagem é aprovada, o sistema **avisa na caixa de Menções** cada setor com o que falta. Quem não tem a aba Viagens abre a viagem **direto pelo aviso**, por cima de qualquer tela, e preenche só a parte do seu setor; o resto fica só para leitura.

| Setor | O que preenche |
|---|---|
| **Adaptação** | Equipe que vai, veículo da frota (a placa vem do veículo), km do carro na saída |
| **Comercial** | Descrição do serviço, observações do contrato e os arquivos do contrato |
| **Financeiro** | Verba total, pedágio (reembolso ou convênio) e os dados do hotel |

O aviso do Comercial vai ao vendedor ou responsável comercial da OP que gerou a viagem (ou a quem criou a viagem). Cada pessoa grava **só o grupo que pode editar**, e cada setor deixa uma linha no histórico: quem salva a parte de um não apaga o que o outro preencheu.

> **Atenção:** a viagem **só pode sair para Andamento** com a equipe, o veículo, o km de saída e a verba total preenchidos. Hotel, pedágio, serviço e contrato **não travam** a saída.

### Aviso de conflito de datas

Ao escolher a equipe e o veículo, o sistema confere as **outras viagens** que ainda ocupam gente e carro (de Aberta até Andamento). Se a mesma pessoa ou o mesmo veículo estiver em outra viagem com datas que se sobrepõem, aparece uma faixa vermelha dizendo qual viagem e quais dias. Ao clicar em **A equipe saiu**, o sistema pergunta de novo.

> **Dica:** o aviso **não trava**. Às vezes a equipe volta de manhã e sai à tarde; quem decide é a Adaptação. A viagem em Andamento continua ocupando equipe e carro até ser finalizada.

## Imprimir a ficha da equipe

**Quando usar:** antes de a equipe sair.

Com a viagem em Provisionamento ou depois, clique em **Ficha da equipe** (na janela da viagem, ao lado de Imprimir, ou no menu **⋯** do cartão). Sai uma folha com o roteiro dia a dia, o veículo e o km de saída, a equipe, o serviço e o contrato, o hotel e a verba. Ela **não leva o orçamento nem a margem**. No pé, há espaços para anotar o km na volta, os gastos e as ocorrências, e para assinar.

## A equipe saiu e voltou

1. **Saída:** clique em **A equipe saiu (iniciar a viagem)**. A viagem vai para **Andamento**.
2. **Volta:** a Adaptação informa o **Km do carro na volta** (obrigatório, e maior que o da saída) e clica em **A equipe voltou (finalizar)**.
3. O Financeiro lança o **custo real** em **CUSTO REAL × ORÇADO**: combustível, pedágios, hospedagem, alimentação, outros e observações. O custo real **não trava** a finalização, porque a prestação de contas costuma chegar depois.

**O que acontece:** o km de volta vira o **km atual do veículo** na frota (só se for maior que o que o cadastro já tem). A tabela mostra cada item orçado × real, a diferença em vermelho quando passou do orçado, e a sobra ou falta contra a verba liberada. O desgaste do veículo é custo calculado e fica fora da comparação.

## Quando a OP da viagem volta ou é cancelada

Se uma OP ligada à viagem for **cancelada** ou **devolvida** (ao PCP ou ao Comercial), a viagem ganha uma nota no histórico e quem aprova recebe um aviso na caixa de Menções para conferir se a viagem ainda faz sentido. O sistema **não muda a viagem sozinho**.
