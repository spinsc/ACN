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
- **M2 — As telas que falam do lote inteiro. ✅ feita em 27/10/2026.** Auditoria de tudo que agrupa OPs por lote (PCP, Almoxarifado, Produção, Fiscal, CRM, resumo e dossiê do lote, edição "do lote inteiro", Copiar OP, conta de
  comissão). **O que já funcionava:** o PCP já separava produção e embalagem unidade a unidade (as ações "produção em lote" e "embalagem em lote" só pegam as unidades certas); a Produção só enxerga as unidades que foram
  liberadas para ela; o Fiscal já aceita faturar só parte do lote; o Copiar OP copia uma unidade com o fluxo, o destino e o frete dela. **O que supunha lote homogêneo e foi corrigido** (só quando o lote tem fluxos diferentes; lote
  de um fluxo só e o lote antigo ficam como estavam):
  1. **Almoxarifado, ações em lote** ("importar seriais", "falta material", "com pendência"): num lote com unidades de produção e de envio valem só para as de produção (o kit em lote com a colagem de seriais entregaria serial de
     equipamento a unidade de envio); a linha do lote diz "N de envio (uma a uma)".
  2. **CRM, "OPs em aberto" e "Lançar chassi/placa/CNPJ — Lote":** a unidade de envio não entra na conta de "sem chassi/sem placa" (o lote nunca ficava "dados completos"), e a janela do lote deixa o envio de fora (a colagem de
     chassis distribui "em ordem entre as unidades sem chassi" e daria chassi a unidade de envio).
  3. **Edição "no lote inteiro"** (`EdicaoDeLote.ts`, a janela do lote, a edição do Comercial e a completa): o **fluxo, o frete, o destino e a mão de obra** só valem para as unidades do **mesmo fluxo** da unidade aberta; na janela
     do lote, que não tem unidade aberta, a pessoa escolhe em "Frete, destino e valores valem para" (sem escolher, esses campos não vão para ninguém e a tela explica); prazo, responsável e descrição seguem para todas. Sem isso, um
     "aplicar no lote" no frete ou no destino apagaria o destino dos grupos de envio, e a M.O. chegaria às unidades de envio.
  4. **Conta de comissão** (`OpLotes.ts`): o lote que nasceu do fluxo misto (envio e produção, com M.O. vazia em toda unidade de envio) **não é dividido de novo** pelo nº de unidades: cada unidade já guarda o seu valor.
  5. **Resumo e dossiê do lote (tela e PDF):** "Fluxo de entrega: Misto — 6 Adaptação na matriz · 4 Envio de material" (antes mostrava o da primeira OP), "Destino" por grupo (cidade/UF com as unidades de cada uma), coluna "Fluxo" na
     tabela carro a carro e "envio: sem chassi nem placa" no lugar do traço vermelho; as contagens de "sem chassi/placa" não somam o envio.
  6. **Selo "Fluxo misto: …"** na linha do lote no PCP, no Almoxarifado, no Fiscal e no CRM.
  **Números reais:** regras 23/23 e `aplicarNoLote` com banco falso 14/14; navegador 19/19 (lote de 10 unidades: selos e botões do PCP, Almoxarifado, Fiscal e CRM, janela de seriais só com as 6 de produção, janela de chassi só com as
  6, painel de dados do lote com escolha do fluxo: cidade só nas 4 de envio, prazo nas 10, M.O. só nas 6 da matriz); as rodadas anteriores seguem verdes (18/18 e 7/7 do M1, 22/22 da data da nota, 18/18 do contato); 11 defeitos
  plantados, 11 apontados. Nenhuma coluna nova e nenhum dado mexido. **Lote antigo conferido no banco:** o único lote existente com fluxos misturados (1560.2608, unidades sem fluxo + envio, M.O. 0) não é tratado como misto e a conta
  dele não mudou.
- **M3 — Depois de criada.** Trocar o grupo/fluxo de uma unidade com todas as consequências (destino, frete, fila, comissão) e o aviso de mensagem a quem acompanha; só se o uso mostrar que faz falta.

## O que ficou de fora de propósito

- Mudar OPs que já existem (nada de dado antigo é mexido).
- Faturamento: o Fiscal continua faturando o lote como "uma venda só", com a opção deliberada de faturamento parcial quando nem todas as unidades chegaram (as de envio chegam ao Fiscal em outro ritmo que as adaptadas).
- Um único frete para unidades de envio de um mesmo destino (hoje cada OP /NN abre o seu pedido de frete; ver M3).
- **Duas ambiguidades que já existiam no sistema e a M2 não mexeu** (valem para qualquer lote, misto ou não, e mexer pede decisão do usuário): (1) a conta de comissão e o "Valor do lote" do resumo tratam unidades com **o mesmo valor
  repetido** como "o valor do lote inteiro repetido" e dividem; uma venda dividida em partes exatamente iguais (ex.: R$ 100.000 em 10 unidades de R$ 10.000) parece, para essa regra, um valor repetido; (2) o lote misto só entre
  fluxos de produção (matriz + externa, sem envio) não tem a assinatura do "nasceu do fluxo misto" e segue a regra de sempre.
