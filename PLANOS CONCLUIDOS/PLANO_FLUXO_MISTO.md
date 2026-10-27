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
- **M3 — Depois de criada. ✅ feita em 27/10/2026 (pedida pelo usuário no mesmo dia, antes de o uso mostrar a necessidade; ainda não existe venda mista real no banco).** Duas partes, com três decisões do usuário em 27/10/2026:
  1. **Trocar o fluxo de UMA unidade já criada** (`TrocaDeFluxo.ts` — regras e gravação; `TrocarFluxoModal.tsx` — a janela; item **"Trocar o fluxo desta unidade"** no menu "Mais ações da OP", só para quem tem poder de gerente e só em unidade de lote /NN).
     • **Até onde:** só até o Almoxarifado fechar o kit — etapas **Em Espera PCP, Devolvida PCP e Aguardando Almox** (decidido). Depois a janela abre e explica o motivo, sem oferecer escolha. As etapas **anteriores ao PCP** (Engenharia, devolvida ao Comercial) ficaram de fora por não terem sido pedidas: lá o fluxo se muda por "Editar OP" (que **não** limpa chassi, mão de obra nem destino: é a edição livre de sempre). Também não troca com **remessa de envio registrada**, com **parte embalada** (venda composta) nem na "Venda para Envio" (sempre envio de material); se a leitura das remessas ou da regra do veículo falhar, não troca.
     • **O que a troca faz:** grava o fluxo novo. Para um fluxo que **termina em envio** pede CIF/FOB, o destino e, no envio de material com CIF, o endereço completo (a mesma regra da criação; o formulário já vem com o destino e o frete do grupo de envio que existe no lote). Para **envio puro** zera chassi, placa, data de chegada, fotos de entrada, mão de obra, mão de obra da serralheria e serviço de terceiro — **a janela lista ANTES o que vai ficar em branco** e a **auditoria guarda o valor de antes** (nada some calado). Na **volta para a produção** o frete deixa de valer, o destino volta a ser o da venda (o de uma unidade de produção do lote; sem nenhuma, fica como está e a janela avisa), a **mão de obra é digitada** (já vem a das outras unidades de produção; em branco = unidade sem M.O. e a janela avisa que a comissão não a conta) e chassi/placa se lançam depois. O veículo obrigatório segue a configuração da Administração para o fluxo novo.
     • **Mão de obra (decidido):** **sai com a unidade** quando ela vira envio (o total do lote cai e a janela diz quanto); não é redistribuída.
     • **Segurança da gravação:** só pega se a unidade ainda estiver numa etapa permitida e no fluxo de quando a janela abriu (a linha devolvida confirma); outra pessoa que mexeu no meio-tempo faz a troca recusar sem tocar em nada. **Motivo obrigatório**; vai para o histórico da OP, o acompanhamento e a caixa de **Menções** de quem abriu a OP, quem vendeu, a Engenharia e os administradores (quem trocou não é avisado do próprio aviso).
  2. **Frete único das unidades de envio do mesmo destino — decidido: usar o "Aproveitamento de frete" que a Logística já tem** (`AproveitamentoFrete.ts`: sugere juntar fretes em cotação da mesma região e da mesma semana, e a Logística junta numa "carga agrupada" e cota uma vez). Nada novo foi construído; conferido que os fretes das unidades de envio de um lote misto (mesmo destino e prazo) entram numa só oportunidade, com peso e volumes somados, e que destinos diferentes (cliente × terceiro) nunca se misturam. **Limite que fica:** o aproveitamento só olha frete com data prevista; **unidade sem prazo de entrega na OP gera frete sem data e não aparece como oportunidade** (23 de 420 OPs abertas estavam sem prazo em 27/10/2026). Cada unidade de envio continua com a sua embalagem e o seu pedido de frete; a Logística é quem junta.
  **Números reais:** regras e gravação (banco falso) 74/74; permissão do menu 12/12; aproveitamento de frete 8/8; navegador 27/27 (lote de 10 unidades: matriz→envio com o que fica em branco e a M.O. que sai, envio→matriz com a M.O. sugerida e o destino da venda, bloqueio depois do kit e com remessa, sem o item em OP que não é de lote); regressões do fluxo misto 18/18, 7/7 e 19/19; 30 defeitos plantados, 30 apontados; build ok; visual conferido no computador e no celular. Nenhuma coluna nova e nenhum dado real mexido. **Não exercitado no navegador:** quem não é gerente não ver o item (o teste de navegador do robô entra sempre como Admin); a regra é a mesma do "Copiar OP" e está coberta na parte de permissão.

## O que ficou de fora de propósito

- Mudar OPs que já existem (nada de dado antigo é mexido).
- Faturamento: o Fiscal continua faturando o lote como "uma venda só", com a opção deliberada de faturamento parcial quando nem todas as unidades chegaram (as de envio chegam ao Fiscal em outro ritmo que as adaptadas).
- Embalagem e frete **únicos de verdade** para as unidades de envio de um mesmo destino (hoje cada OP /NN tem a sua embalagem e o seu pedido de frete; a Logística junta pelo Aproveitamento de frete — ver M3). Se isso não bastar, o passo seguinte é o Almoxarifado embalar o grupo de envio de uma vez.
- Trocar o fluxo de várias unidades de uma vez (hoje é uma unidade por vez) e trocar o fluxo antes de a OP chegar ao PCP.
- **Duas ambiguidades que já existiam no sistema e a M2 não mexeu** (valem para qualquer lote, misto ou não, e mexer pede decisão do usuário): (1) a conta de comissão e o "Valor do lote" do resumo tratam unidades com **o mesmo valor
  repetido** como "o valor do lote inteiro repetido" e dividem; uma venda dividida em partes exatamente iguais (ex.: R$ 100.000 em 10 unidades de R$ 10.000) parece, para essa regra, um valor repetido; (2) o lote misto só entre
  fluxos de produção (matriz + externa, sem envio) não tem a assinatura do "nasceu do fluxo misto" e segue a regra de sempre.
