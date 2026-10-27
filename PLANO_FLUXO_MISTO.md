# Plano — Fluxo misto na mesma venda (parte adaptada aqui, parte enviada)

**Pedido do usuário em 26/10/2026:** "Precisamos ter fluxos mistos nas OPs, da mesma forma que temos lote customizável e inclusive poder ter os dois: tem vendas que adaptamos parte na
empresa e enviamos parte para um cliente ou terceiro, tudo em uma venda só; então tenho a possibilidade de gerar uma OP com lote para envio e adaptação ao mesmo tempo."

## O que existe hoje (lido em 26/10/2026)

- Cada OP tem **um** `fluxo_entrega` (`adaptacao_matriz`, `adaptacao_externa`, `fabricacao_serralheria_envio`, `envio_adaptacao_terceiro`, `envio_material`), e **todas as filas, telas e regras leem
  o fluxo da própria linha** (`FluxoEntrega.ts`: `filaDe`, `soEnvio`, `terminaEmEnvio`). Por isso uma venda com unidades de fluxos diferentes já funciona, desde que cada OP /NN nasça com o seu fluxo.
- O formulário da **Nova OP** só tem **um** fluxo para a venda toda. Com fluxo de envio ele cria **uma OP só, com quantidade** ("sem lote"); com adaptação cria o lote /01../NN.
- O **lote customizável** (`LoteMisto.tsx`, grupos de veículos com serviços e itens diferentes) existe e continua como está; o fluxo misto é **mais uma coisa que o grupo escolhe**.
- A edição da OP (`OplEdicao.tsx`) já permite trocar o fluxo de uma unidade depois de criada.

## Decisões (todas do usuário, em 26/10/2026)

1. **Cada unidade vira uma OP /NN com o fluxo do seu grupo**, no mesmo número da venda (não uma OP única de envio com quantidade). As adaptadas e as enviadas são irmãs do mesmo lote.
2. **O fluxo é escolhido por grupo do lote customizável**, e dá para ter os dois ao mesmo tempo (itens/serviços diferentes **e** fluxos diferentes). No campo Fluxo de Entrega da venda aparece a opção **"Misto (cada grupo do lote escolhe o seu)"**.
3. **Todos os grupos levam o modelo do veículo** (o kit é para aquele carro e a estrutura de instalação usa o modelo); **só a adaptação pede chassi e placa**.
4. **Cada grupo de envio tem o seu destino e o seu frete** (quem recebe, cidade/UF/CEP, endereço completo quando for CIF de envio de material, e CIF ou FOB), porque um grupo pode ir para o cliente e outro para um terceiro (o "cliente ou terceiro" já está no próprio fluxo: *envio de material* ou *envio para adaptação de terceiro*).

## Regras do desenho (para não se perder)

- A opção "Misto" é **só da tela**: nenhuma OP grava `misto`; cada OP grava o fluxo do seu grupo.
- **Mão de obra** (`valor_mao_de_obra*`) e **serviço de terceiro** só valem para as unidades de adaptação; o total de M.O. é dividido **só entre elas**; unidade de envio fica com M.O. vazia (a comissão lê M.O.).
- Unidade de envio: **sem chassi, placa, data de chegada do veículo nem fotos de entrada**.
- Unidade de adaptação mantém o destino da venda (cidade/UF/CEP opcionais) como hoje.
- Fluxo misto exige **2 ou mais unidades** e **todos os grupos com fluxo**; grupo de envio exige **frete** e, em envio de material com CIF, o **endereço completo** (mesma regra de `EnderecoEntrega.ts`).
- Veículo obrigatório segue a configuração da Administração **por fluxo do grupo**.
- Venda do tipo "Venda para Envio" não tem fluxo para escolher (é sempre envio de material): a opção Misto não aparece.

## Etapas (uma por vez; cada uma funciona sozinha)

- **M1 — Criar a venda com fluxo misto (Nova OP). ✅ feita em 26/10/2026.** Regras puras em `FluxoMisto.ts` (validar, ajustar o que cada OP grava, dividir a M.O.); fluxo e destino/frete por grupo em
  `GruposLoteMisto` (peça de tela em `FluxoMistoTela.tsx`); opção "Misto" no campo de fluxo da `NovaOpOsModal`; a criação do lote usa o fluxo de cada grupo.
  **Números reais:** regras 30/30; navegador 18/18 (venda de 10 unidades, 6 na matriz + 4 em envio de material: 10 OPs /01 a /10, fluxo certo em cada uma, frete FOB e destino do grupo nas 4 de envio, M.O. de R$ 10.000
  dividida só entre as 6, sem chassi/placa/fotos nas de envio, "misto" nunca gravado, itens e serviços de cada grupo) e 7/7 de regressão (veículo obrigatório só nas unidades dos grupos de adaptação; lote igual na matriz,
  envio de material com quantidade e lote customizável comum saem **exatamente como antes**); 12 defeitos plantados nas regras, 12 apontados; visual conferido no computador e no celular. Nenhuma coluna nova e nenhum dado mexido.
  **Atenção ao usar:** cada unidade de envio é uma OP /NN, então 4 unidades de envio abrem 4 embalagens e 4 pedidos de frete (a decisão do usuário foi essa; juntar num frete só é a M3).
- **M2 — As telas que falam do lote inteiro.** Conferir e ajustar o que supõe "um fluxo por lote": dossiê e resumo do lote (hoje mostram o fluxo da primeira OP), bloco do lote no Fiscal, card do lote no CRM,
  edição de lote e Copiar OP. Cada tela com teste.
- **M3 — Depois de criada.** Trocar o grupo/fluxo de uma unidade com todas as consequências (destino, frete, fila, comissão) e o aviso de mensagem a quem acompanha; só se o uso mostrar que faz falta.

## O que ficou de fora de propósito

- Mudar OPs que já existem (nada de dado antigo é mexido).
- Faturamento: o Fiscal continua faturando o lote como "uma venda só", com a opção deliberada de faturamento parcial quando nem todas as unidades chegaram (as de envio chegam ao Fiscal em outro ritmo que as adaptadas).
- Um único frete para unidades de envio de um mesmo destino (hoje cada OP /NN abre o seu pedido de frete; ver M3).
