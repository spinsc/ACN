# Plano — Estoque, reserva e automação da lista de material

> **Documento vivo.** Cada etapa concluída é marcada aqui, com data e o que foi
> feito de verdade. Quem pegar o trabalho em outra máquina lê este arquivo e
> sabe exatamente onde parou e qual é a próxima etapa.

**Comando:** `/estoque-auto` — lê este documento e trabalha na próxima etapa
pendente. Sem argumento, segue a ordem. Com argumento (`/estoque-auto 4`),
trabalha na etapa indicada.

---

## Onde queremos chegar

A OP entra, o sistema sabe qual veículo é, quais itens foram vendidos para ele,
e explode sozinho tudo que precisa ser separado. Confere o estoque, **reserva**
o que tem, e o que falta vira pedido automático — compra, fabricação de chicote
ou serralheria, conforme o item. Conforme cada setor entrega, o Almoxarifado
confirma o recebimento, o material **sobe para o estoque sozinho** e o kiting
fecha 100% para o PCP liberar a produção.

No fim da estrada: escolher "Nissan Sentra 2022", marcar que vai barra
sinalizadora, responder se tem hack de teto, quantos slimled na frente e atrás —
e o sistema emitir toda a lista de material daquela adaptação sem ninguém
digitar item por item. Item ainda não configurado, o sistema avisa e pede para
configurar; configurado uma vez, vale para sempre naquele veículo.

Mais no micro: o chicote também tem estrutura — metros de fio por cor, conexões,
terminais. Mandar fabricar um chicote dá baixa nesses materiais e dispara a
compra deles quando faltar.

---

## Princípios que não se quebram

1. **A fábrica não pode parar.** Toda etapa entra ligada por item, por veículo ou
   por OP. Quem não foi configurado continua funcionando manual, exatamente como
   hoje. Nada de "vira a chave e todo mundo se vira".
2. **Do macro para o micro.** Primeiro o chicote inteiro entra e sai do estoque.
   Só muito depois o fio por metro.
3. **Nada é adivinhado.** Se o sistema não souber a qual item do cadastro uma
   demanda se refere, ele não movimenta estoque — avisa e deixa manual.
4. **Reserva não é baixa.** Reservar é segurar para a OP. A baixa acontece no
   kiting, que continua manual, feito pelo Almoxarifado.

---

## Ponto de partida — medido em 25/09/2026

O que **já existe** e vamos aproveitar:

| Peça | Situação |
|---|---|
| Controle de estoque por item (opt-in) | Pronto. `cadastro_itens.controla_estoque`, mínimo e ideal |
| Movimento de estoque | Pronto. Função `estoque_movimentar` no banco, trava a linha, recusa item sem controle |
| Baixa no kiting | Pronto. `baixarKitDaOp`, baixa por diferença |
| Trava de falta no Kit 100% | Pronto. `faltaDeEstoqueNoKit` |
| Reposição automática por mínimo | Pronto, **mas só gera compra** |
| Entrada por compra recebida | Pronto, **só para requisição de reposição** |
| Cadastro sabe o que é feito aqui dentro | Pronto. `origem_producao`, `setor_fabricante` |
| Demanda de chicote/serralheria | Existe, mas é **texto livre**, sem item e sem quantidade produzida |
| Entrada por fabricação | **Não existe** |
| Reserva de estoque | **Não existe** |
| Veículo estruturado na OPL | **Não existe** |
| Estrutura de produto por veículo | **Não existe** |

Números de 25/09/2026, **medidos duas vezes com uma hora de diferença**:

| | Primeira medição | Uma hora depois |
|---|---|---|
| Itens sob controle | 7 | **11** |
| Destes, chicotes | 3 | **7** |
| Abaixo do mínimo | 3 | **6** |

- **72 chicotes** cadastrados como fabricação interna do setor Chicotes — a base
  para ligar o controle já existe.
- **Estes números andam.** O usuário está colocando itens sob controle enquanto
  o trabalho acontece. Qualquer etapa deve **medir o banco de novo** antes de
  decidir qualquer coisa — nunca confiar nos números escritos aqui.
- Os chicotes controlados estavam **abaixo do mínimo sem ninguém ser avisado**,
  porque a reposição só disparava quando o item se movimentava. Resolvido na
  Etapa 2.

---

## Etapas

Estado: ⬜ não começou · 🟡 em andamento · ✅ concluída

---

### ✅ Etapa 1 — Fabricação interna dá entrada no estoque

**Feito em:** 25/09/2026, logo depois da Etapa 2.

**O que foi feito:**

- Migração `fabricacao_interna_credita_estoque`: em `demandas_setoriais`,
  `quantidade_produzida`, `estoque_creditado_em` e `estoque_creditado_por`, mais
  o índice da fila do Almoxarifado. A quantidade pedida **não** é sobrescrita —
  pediram 10 e o setor fez 8 são dois fatos, mesma regra da quantidade comprada.
- `Estoque.tsx`:
  - motivo novo `MOTIVO.FABRICACAO_RECEBIDA` (a função do banco já aceitava
    motivo livre, não precisou mexer nela);
  - `fabricacoesAguardandoCredito()` — a fila: tem item, ficou pronta, ainda não
    virou saldo;
  - `creditarFabricacaoRecebida()` — credita o que **chegou**, não o que foi
    pedido, e só marca a demanda depois de o saldo subir (se a movimentação
    falhar, a demanda continua na fila em vez de sumir sem virar estoque);
  - `PainelFabricacaoRecebimento` — painel no Almoxarifado, separado do painel
    de pendência de OP porque aqui não há OP nenhuma amarrada.
- `SetorDemandaTab.tsx`: ao concluir uma demanda **com item**, o setor informa
  quanto produziu, pré-preenchido com o pedido. Sem item, nada muda.
- `AcnTabShared.tsx`: mesma pergunta no `concluir` de lá, para as duas telas não
  divergirem.

**Testado** de ponta a ponta com item sintético (`ZZTESTE CHICOTE DE PROVA`,
saldo 2, mínimo 5, ideal 12) e demanda de 10:

| Passo | Resultado |
|---|---|
| Setor conclui informando 8 | pedida 10 e produzida 8 guardadas; **saldo continua 2** |
| Painel do Almoxarifado | "produziu 8 UN · pedido 10" |
| Almox confirma 8 | saldo **2 → 10** |
| Extrato | entrada 8, motivo `fabricacao_recebida`, "Fabricação do setor Chicotes — pedido de 10, recebido 8." |

Dado de teste apagado; banco conferido de volta em 132 demandas, 4.436 itens,
26 movimentos, zero resíduo.

**Armadilha encontrada no caminho:** existem **duas** telas que concluem demanda
setorial — `SetorDemandaTab.tsx` (a que os setores usam) e `AcnTabShared.tsx`.
Mexer só numa não tem efeito nenhum. Quem for mexer em conclusão de demanda
precisa olhar as duas.

**O que ficou de fora de propósito:** ao abrir uma demanda **à mão**, ainda não
dá para escolher o item do cadastro — só a reposição automática amarra o item.
Enquanto isso, quem quiser que uma fabricação vire saldo precisa deixar a
varredura abrir a demanda. Entra na Etapa 4, junto com a falta vinda da OP.

---

### ✅ Etapa 2 — Reposição enxerga quem fabrica aqui dentro

**Feito em:** 25/09/2026 (escolhida como primeira etapa pelo usuário, na frente
da Etapa 1, porque os mínimos calados eram uma falha ativa).

**O que foi feito:**

- Migração `demanda_setorial_aponta_item_do_cadastro`: coluna `item_id` em
  `demandas_setoriais`, opcional, com índice para a busca de "fabricação em
  aberto deste item". Demanda de desenvolvimento continua sem item, texto livre.
- `Estoque.tsx`:
  - `ehFabricacaoInterna(item)` — decide o caminho pela dupla
    `origem_producao` + `setor_fabricante`.
  - `reposicaoEmAberto(item)` — a trava contra pedir duas vezes agora olha os
    **dois** caminhos (compra e fabricação). Antes só olhava compra, e uma
    demanda de fabricação aberta não era enxergada por ninguém.
  - `abrirFabricacaoReposicao` — item interno abre demanda para o
    `setor_fabricante` em vez de requisição de compra.
  - `varrerMinimos` + `textoDaVarredura` — passa os olhos em **todos** os itens
    controlados, não só nos que se moveram.
  - `paraQuem(req)` — as mensagens de tela pararam de dizer "pedido ao Compras"
    para tudo; agora dizem o caminho certo.
  - `carregarItensControlados` passou a trazer `origem_producao` e
    `setor_fabricante`.
- Botão **🔎 Conferir mínimos** no painel de estoque do Almoxarifado.

**Testado** no navegador com as gravações bloqueadas, lendo o corpo do que
*seria* gravado: 11 itens conferidos, 6 abaixo do mínimo, 5 demandas de
fabricação montadas para o setor Chicotes (com `item_id`, quantidade = ideal −
saldo) e 1 disco **pulado** por já ter a compra PC-FU6DS9 em aberto. Conferido
no banco depois: 132 demandas antes e depois, nenhuma com `item_id` — nada
vazou para produção.

**O que ficou de fora de propósito:** a demanda de fabricação ainda **não
credita o estoque** quando a peça fica pronta. Isso é a Etapa 1, que virou a
próxima. Até lá, a demanda aparece para o setor e o saldo continua sendo
ajustado por contagem.

---

### ✅ Etapa 3 — Reserva de estoque

**O conceito que falta.** Hoje só existe saldo. Passa a existir **saldo
disponível = saldo − reservado**.

**O que muda:**
1. Tabela `estoque_reservas`: item, OP, quantidade, situação
   (reservada / consumida / liberada), quem e quando.
2. **Quando o PCP libera a OP para o Almoxarifado** (decidido com o usuário em
   25/09/2026), o sistema reserva o que aquela OP precisa dos itens controlados.
3. O kiting **consome a reserva** em vez de dar baixa por cima dela — senão o
   material sairia duas vezes do saldo.
4. Mínimo, ideal e a trava de falta passam a olhar o **disponível**.
5. OP cancelada ou devolvida **libera** a reserva.

**Como fica gradual:** item sem controle não gera reserva; OP sem item
controlado na lista se comporta como hoje.

**Feito em:** 25/09/2026.

**O que foi feito:**

- Migração `estoque_reservas`: tabela com item, OP, quantidade e situação
  (reservada / consumida / liberada), com **índice único** que impede reservar a
  mesma OP e item duas vezes. Mais a view `vw_estoque_disponivel`, que entrega
  saldo, reservado e disponível prontos.
- `Estoque.tsx`: `reservadoPorItem`, `reservaDaOp`, `reservarParaOp`
  (idempotente), `consumirReserva`, `liberarReservaDaOp`, `reservaDeOutrasNoKit`
  e `textoReservaDeOutras`.
- `PCPTab.tsx`: reserva ao liberar para o Almoxarifado, na liberação individual
  **e** na de lote — o lote não pode ser a porta por onde o material escapa sem
  dono.
- `Estoque.tsx / baixarKitDaOp`: a baixa do kiting **consome** a reserva.
- `DevolverOp.tsx`: devolução para a **Engenharia** solta a reserva (a BOM vai
  ser revista). Devolução ao **Almoxarifado** não solta — a OP continua de pé.
- Painel de estoque ganhou as colunas **Reservado** e **Disponível**.

**Erro de desenho pego no teste, antes de subir:** a trava do Kit 100% estava
comparando a necessidade com o *disponível*, descontando a reserva das outras
OPs. Com 20 peças na prateleira e duas OPs querendo 15, **as duas ficavam
travadas** — mesmo havendo material para uma. Na hora do kiting o que vale é o
saldo físico: quem chega primeiro leva, e a outra vira falta. A trava voltou a
olhar o saldo, e a reserva alheia virou **aviso** que não impede nada.

**Testado** com cenário sintético: item com 20, duas OPs querendo 15 cada.

| Passo | Resultado |
|---|---|
| PCP libera OP A | reserva 15 · disponível 5 |
| PCP libera OP B | reserva 15 · disponível **−10** |
| Almox fecha o kit de A | avisa "outra OP conta com 15, sobram 5 — ficam 10 a descoberto" |
| Confirmado | saldo 20 → 5 · reserva de A **consumida** |
| OP B devolvida à Engenharia | reserva **liberada**, com o motivo gravado |
| Reserva em dobro | recusada pelo banco |

Dado de teste apagado; banco conferido sem resíduo.

**O que ficou de fora de propósito:** o **mínimo ainda olha o saldo físico**, não
o disponível. Um item todo reservado aparece "ok" mesmo sem nada livre. É a
Etapa 4 que fecha isso, junto com a falta virando pedido — e é lá que o
disponível negativo (aquele −10) vira compra ou fabricação.

---

### ✅ Etapa 4 — A falta da OP vira pedido automático, considerando o lote

**O caso do usuário:** 20 chicotes em estoque, OP com lote de 30 carros. O
sistema tem que ver que faltam 10 e pedir os 10 — não parar no ideal de 50.

**Feito em:** 25/09/2026.

**A decisão que mudou o desenho:** perguntado se deveria pedir 40 (cobrir a
falta e repor até o ideal num pedido só) ou 10 (só o que falta), o usuário
escolheu um terceiro caminho, melhor que os dois: **saem DUAS demandas**. Uma
com o número exato para a OP andar, outra para repor a prateleira. Assim o setor
atende primeiro a da OP, que tem carro parado, e faz a da prateleira depois. Um
pedido só, somando tudo, obrigaria o setor a terminar os 40 antes de liberar os
10 de que a OP precisa.

**O que foi feito:**

- `necessidadeDeReposicao` passou a devolver **dois números**: `faltaOp` (o que
  falta para atender o que já foi prometido) e `reposicao` (o que falta para a
  prateleira voltar ao ideal, contando que as OPs vão levar tudo).
- **Tudo passou a olhar o disponível, não a prateleira.** Antes a conta usava o
  saldo físico, e um item com 20 no saldo e 20 reservados aparecia "ok". Vale
  para a varredura, para a movimentação de estoque e para o gatilho da reserva.
  O `abaixo_do_minimo` que o banco devolve deixou de ser usado: ele só enxerga a
  prateleira.
- `reservarParaOp` chama `pedirOQueFaltou`, que abre as duas demandas quando for
  o caso — a da OP amarrada a ela (`tipo_solicitacao = 'falta_op'`,
  `opl_id` preenchido) e a da prateleira solta (`reposicao_estoque`).
- **A trava anti-duplicação passou a ser por tipo.** Antes bloqueava qualquer
  segundo pedido do mesmo item, o que impediria a segunda demanda de nascer.
  Agora um item pode ter um pedido de OP e um de prateleira ao mesmo tempo, mas
  nunca dois do mesmo tipo.
- `motivoDaReposicao` conta o porquê na tela de quem vai atender, incluindo
  quanto está reservado — dizer só "saldo 20, mínimo 30" quando 15 já têm dono
  esconde o problema.
- PCP avisa ao liberar, separando "para esta OP andar (prioridade)" de "para
  repor a prateleira (depois)". Na liberação em lote o aviso é resumido, senão
  um lote de 90 carros viraria um alerta por OP.

**Testado** com o cenário exato do usuário — item com 20, mínimo 5, ideal 30,
OP de 30:

| | |
|---|---|
| Disponível após reservar | **−10** |
| Demanda 1 (`falta_op`) | **10**, amarrada à OP, "FALTA PARA A OP …" |
| Demanda 2 (`reposicao_estoque`) | **30**, sem OP, "Reposição de estoque" |
| Repetir | as duas travas bloqueiam, cada uma no seu tipo |

Dado de teste apagado; banco conferido em 325 OPs, 4.437 itens, 140 demandas,
zero reservas e zero resíduo.

**O que ficou de fora:** a varredura manual ("Conferir mínimos") abre só a
demanda de prateleira — a falta de uma OP específica nasce na liberação dela,
que é quando se sabe de quem é a falta.

---

### ✅ Etapa 5 — Veículo pela FIPE na abertura da OPL

**Plano reescrito em 25/09/2026**, depois de medir a API e conversar com o
usuário. O desenho original (a OPL falando direto com a FIPE) foi descartado.

**O que a medição mostrou:**

- Vocês adaptam **carros, motos e caminhões** — e a FIPE tem catálogo separado
  para cada um. O tipo precisa vir antes da marca.
- O "modelo" da FIPE é **versão**, não modelo: o HB20S tem **48 entradas**
  ("Impress 1.6 Flex 16V Aut.", "5 Anos 1.0 Flex 12V Mec."…). Fiat tem 585
  entradas, GM 556, VW 549. As 12 maiores marcas de carro somam **3.940**;
  os três catálogos juntos, cerca de **15 mil**.
- Os **anos** só vêm numa chamada separada **por modelo**. Baixar tudo com anos
  seria ~15 mil chamadas numa API pública gratuita.
- Veículo real pode **não estar na FIPE**: a Tenere 700 não existe na lista da
  Yamaha (só XT 600 Z, XTZ 250 e XTZ 750).
- Hoje o campo `modelo` é texto livre: 281 das 325 OPs preenchidas, **91 valores
  distintos**, com "CRETA" e "NEW CRETA" separados e pelo menos um que não é
  modelo nenhum.

**Decisões do usuário:**

| Decisão | Escolha |
|---|---|
| Identidade do veículo | **marca + modelo + ano** — a versão da FIPE não entra |
| Papel da FIPE | alimenta um **catálogo nosso**; a OPL nunca fala com a API |
| Sincronização | **marcas e modelos** a cada 15 dias (~330 chamadas); **anos sob demanda**, na primeira vez que o modelo é usado |
| Anteriores a 2010 | aparecem num "ver anos antigos" — já vêm na mesma chamada |
| Veículo fora da FIPE | ação manual "baixar marca/modelo/ano específico", e cadastro à mão |
| Nome do veículo | vem preenchido da FIPE mas **editável**: "Nivus Comfortline 1.0 200 TSI Flex Aut." vira "Nivus" |
| Modelos em texto livre antigos | ficam como estão, intocados |
| Faixa de anos | o veículo guarda **ano de** e **ano até**: "Nissan Sentra 2022 a 2024" é um cadastro só |

**O que construir:**

1. Tabelas do espelho da FIPE: `veiculos_fipe_marcas`, `veiculos_fipe_modelos`
   (cheias pela sincronização) e `veiculos_fipe_anos` (preenchida sob demanda).
2. Tabela `veiculos` — o catálogo da ACN: tipo, marca, modelo, **ano_de**,
   **ano_ate**, nome de exibição editável e o código FIPE de origem.
3. Ação de sincronização com "última atualização" na tela e aviso quando passar
   de 15 dias.
4. Modal de cadastro de veículo: tipo → marca → modelo (tudo do banco local,
   com busca) → ano (busca na FIPE na primeira vez) → nome editável e faixa de
   anos.
5. Campo de veículo na OPL: um `SelectBusca` sobre o catálogo da ACN, com botão
   de cadastrar na hora. O campo `modelo` antigo continua existindo ao lado.

**Feito em:** 25/09/2026.

**O que foi feito:**

- Migração `catalogo_de_veiculos`: `veiculos_fipe_marcas`, `veiculos_fipe_modelos`,
  `veiculos_fipe_anos` (o espelho), `veiculos` (o catálogo da casa, com
  `ano_de`/`ano_ate`), `veiculos_fipe_sync` (quando a última atualização rodou) e
  `oples.veiculo_id`, opcional.
- `Veiculos.tsx`: `sincronizarFipe` (marcas e modelos dos três tipos, por
  upsert — nada é apagado, para veículo já usado não sumir se a FIPE mudar),
  `anosDoModelo` (busca na FIPE uma vez e guarda), `veiculoQueCobre` (resolve
  marca+modelo+ano para o cadastro que cobre aquela faixa) e `PainelFipeSync`.
- `VeiculoCadastro.tsx`: o modal de cadastro e o `SelectVeiculo` da OPL.
- Aba **🚗 Veículos** na administração e campo de veículo na abertura da OP,
  acima do texto livre, que continua existindo.

**Testado** com a VW carregada de verdade (549 versões gravadas por upsert):
marca → modelo → os anos vieram da FIPE na hora (2021 a 2027) → nome encurtado
à mão de "Nivus Comfortline 1.0 200 TSI Flex Aut." para "Nivus" → salvo como
**2022 a 2024**, com o código FIPE e a origem preservados. Espelho e veículo de
teste apagados depois.

**Dois defeitos encontrados no caminho:**

1. **`.modal-content` não existe neste projeto** — a classe certa é `.modal-box`,
   definida no bloco de estilo dentro de `DashboardTab.tsx`. Eu tinha inventado
   a outra, e o modal saía **sem fundo**, transparente por cima da tela. Isso
   atingia também o modal de "dar entrada no estoque" da **Etapa 1, que já
   estava publicado**. Corrigido nos dois.
2. A FIPE marca o zero-km como ano **32000** — "32000 Flex" aparecia na lista de
   anos como se fosse defeito. Agora aparece como "0 km".

**Ponto em aberto:** o projeto não tem backend nem tarefa agendada — é site
estático mais Supabase. A sincronização é um **botão** na administração, com
aviso de "catálogo desatualizado" passados 15 dias. Automatizar de verdade
pediria uma Edge Function, que fica como melhoria depois.

**Atenção na primeira vez:** o catálogo está **vazio**. Alguém precisa apertar
"Atualizar da FIPE" uma vez — são ~330 consultas e alguns minutos.

---

### ✅ Etapa 5.1 — Correção: o lote precisa de um veículo por unidade

**Falha encontrada na revisão de 26/09/2026**, ao conferir o plano contra o
fluxo detalhado pelo usuário.

A Etapa 5 gravou `veiculo_id` na OP, mas na criação em lote **todas as OPs irmãs
recebem o mesmo veículo**: o `makePayload` usa `form.veiculo_id`, enquanto
chassi, placa e modelo já vêm por unidade. Isso mata o **lote customizado** que
o usuário descreveu — um PV com vários carros diferentes.

**Detalhado pelo usuário em 26/09/2026**, e virou mais que a correção:

1. **Os itens vendidos passam a ser a PRIMEIRA coisa a preencher** ao gerar uma
   OP. Não é preferência de tela: são eles que decidem quais perguntas o carro
   vai receber. Sem isso, a Etapa 7 não teria onde se encaixar.
2. Preenchido o primeiro carro, aparecem **dois botões**:
   - **Lote igual** — informa só a quantidade e o sistema gera as OPs iguais.
   - **Lote customizável** — abre os campos do próximo carro: marca, modelo,
     ano e, mais adiante, as perguntas daquele carro conforme os itens vendidos.
3. Cada unidade grava o **seu** `veiculo_id`. A lista de unidades (hoje
   `{chassi, placa, modelo}`) ganha o veículo, com o do cabeçalho como padrão.

**O que fica para a Etapa 7:** as perguntas por carro ("tem hack? qual altura?
tem câmera no para-brisa?") entram nesta mesma tela quando a árvore existir. A
tela nasce preparada para recebê-las — é por isso que ela vem antes.

**Feito em:** 26/09/2026.

**O que foi feito:**

- `NovaOpOsModal.tsx`: itens vendidos subiram para o topo do formulário, como
  bloco "1 · O QUE FOI VENDIDO"; dois botões **Lote igual / Lote customizável**
  acima da lista de unidades; **select de veículo em cada unidade**, que ao ser
  escolhido preenche o modelo em texto livre daquela unidade; `makePayload`
  passou a gravar `veiculo?.veiculo_id || form.veiculo_id`.
- `VeiculoCadastro.tsx`: `SelectVeiculo` ganhou `compacto` (esconde o "+ Novo",
  para não repetir 30 botões iguais numa lista de unidades) e `recarregarEm`.
- `Interface.tsx`: a lista do `SelectBusca` ganhou **largura mínima de 260px**.
  Num campo estreito o nome aparecia cortado em duas letras e a busca ficava
  inutilizável — apareceu justamente na coluna de veículo por unidade.

**Três defeitos de layout corrigidos no caminho**, todos achados na tela:

1. Dropdown estreito demais (acima).
2. O nome do veículo esticava a coluna e **empurrava a Placa para fora**. A
   grade virou `minmax(132px, 1.4fr)` para a coluna do veículo e `minmax(0, 1fr)`
   nas outras — sem o piso a coluna sumia; sem o `minmax(0,…)` ela transbordava.
3. Os dois botões do lote saíam **sem destaque nenhum**: o roxo `#f5f3ff` que eu
   usei tem luminosidade acima de 97,5%, e o sistema de tons do projeto
   (`TonsVisuais.ts`) classifica isso como botão neutro e normaliza. Trocado por
   `#ede9fe`, que o próprio projeto já usa, e o selecionado passou a aparecer.

**Como a gravação foi verificada, já que criar OP pela tela não deu certo:**

Tentei criar a OP de verdade e não consegui — o formulário tem sete campos
obrigatórios e o modal fechava a cada tentativa de automação. Em vez de insistir,
a verificação fechou por dois lados:

1. **O estado da tela**, provado: escolhido um veículo na unidade 02, só ela
   ficou com ele (HB20S) e o modelo daquela unidade preencheu sozinho. Para o
   select exibir isso, `form.veiculos[1].veiculo_id` tem de estar preenchido.
2. **O código compilado**, conferido no `dist`:
   ```
   chassi:     t?.chassi     || a.chassi     || null
   placa:      t?.placa      || a.placa      || null
   modelo:     t?.modelo     || a.modelo     || null
   veiculo_id: t?.veiculo_id || a.veiculo_id || null
   ```
   `t` é o objeto da unidade. O `veiculo_id` é **simétrico** ao chassi, à placa e
   ao modelo, que já gravam por unidade há meses.

Mesmo assim, **vale conferir a primeira OP em lote de verdade** — é barato e
fecha o que a automação não fechou.

---

### ✅ Etapa 6 — A árvore de configuração: veículo × item vendido

**O coração da automação.** Detalhado pelo usuário em 26/09/2026.

**As situações reais que o modelo precisa aguentar:**

- Um mesmo veículo tem **variações**: uma Nivus pode ter hack de teto ou não; se
  tiver, **alto ou baixo**. A resposta leva a **outra pergunta** — é árvore, não
  lista.
- **Slimled:** se são 4, precisa saber quantos na frente e quantos atrás, porque
  muda **o tipo de chicote**.
- **Parachoque de impulsão:** vendido frontal e traseiro, **não precisa de
  suporte** — e isso não se pergunta, o sistema conclui pelos itens da venda.
- **Suporte** tem modelo universal e modelos por carro que servem em vários
  carros. **Cada tipo de sirene tem o seu suporte.**

**O que construir:**
1. Tabelas da árvore: pergunta, opção e item de material, com a opção apontando
   para o próximo nó (outra pergunta) ou para materiais.
2. Tela de configuração por par (veículo, item vendido).
3. **Regras por combinação de itens** (detalhado pelo usuário em 26/09/2026).
   Não é só "o item X também foi vendido": o sistema precisa olhar **combinações**
   e a regra pode fazer três coisas diferentes com o material —
   - **trocar** um suporte por outro,
   - **excluir** suportes que deixaram de ser necessários,
   - **acrescentar** algo específico daquela combinação.

   O parachoque é um caso disso: vendido frontal e traseiro junto com slimled,
   **exclui** o suporte. A regra responde sozinha, sem perguntar.
4. **Botão "aplicar nesta OP"**: responde as perguntas na hora e **preenche a
   `bom_itens`**. É o que faz esta etapa valer sozinha, sem esperar a 7 — o PCP
   já usa no dia seguinte, à mão, e a 7 só automatiza o disparo.

**Estado em 28/09/2026: completa. O cadastro e o motor entraram em 26/09; o botão
"aplicar nesta OP" entrou na Etapa 7, no modal de liberar BOM da Engenharia.**

**O que foi feito:**

- Migração `arvore_de_configuracao_veiculo_item`: `config_estruturas` (o par
  veículo × item), `config_perguntas` (com `opcao_pai_id`, que é o que permite
  uma resposta levar a outra pergunta), `config_opcoes` (com
  `auto_quando_itens`, a regra por combinação), `config_materiais` (com
  `acao` adicionar/remover) e `op_configuracao_respostas`, que a Etapa 7 vai
  preencher.
- `ConfigEstrutura.ts` — o motor: `carregarArvore`, `perguntasPendentes` (só
  mostra a pergunta cujo pai já foi respondido), `respostasAutomaticas` (resolve
  as regras de combinação sem perguntar), `materialDaConfiguracao` (monta a
  lista; **adiciona tudo antes de remover**, senão a regra do parachoque falharia
  em silêncio) e `juntarMateriais`.
- `ConfigEstruturaTela.tsx` — a tela, na aba **🧩 Estruturas** da administração.

**Testado** com o cenário que o usuário descreveu, montado inteiro:

| Situação | Material gerado |
|---|---|
| Sem hack de teto | cabo + **suporte universal** |
| Com hack **alto** | cabo + **suporte hack alto** |
| Venda com parachoque frontal **e** traseiro | **só o cabo** — o suporte saiu sozinho, sem perguntar |

E o aninhamento: "Hack alto ou baixo?" só entra na fila depois de alguém
responder "Tem". Dado de teste apagado, banco conferido zerado.

**Por que escreve em `bom_itens` e não numa tabela nova:** a `bom_itens` já é a
lista de material da OP, e é dela que leem a conferência do kiting, a reserva
(Etapa 3), a trava de falta e a baixa. Criar uma lista paralela obrigaria a
remendar as quatro. A árvore alimenta a lista que já existe.

**Feito em:** —
**O que foi feito:** —

---

### ✅ Etapa 7 — Responder e explodir na BOM

**Onde as perguntas são respondidas, no fluxo do usuário:**

1. **Comercial ou Licitações** informa os itens vendidos e o carro, e responde
   as perguntas. Um PV pode virar **lote customizado**: vários carros, itens
   diferentes por carro (depende da Etapa 5.1).
2. Na **abertura da OPL**, carro e ano ficam precisos.
3. **Engenharia** olha a venda e decide se precisa desenvolver algo.
4. **PCP** preenche a estrutura quando aquele carro naquela configuração ainda
   não existir.

Alvo: **qualquer Creta com os itens de sempre anda sozinha pela esteira.**

**O que construir:**
- Guardar as **respostas por unidade** (cada carro do lote tem as suas).
- **Kit explode antes:** venda de KIT é composta dos mesmos itens individuais;
  muda só que o preço foi formado para o kit. Abre nos itens e segue igual.
- Explosão automática ao fechar a venda / abrir a OPL, preenchendo a `bom_itens`.
- **Previsão de falta sem reservar:** assim que a lista existe, mostrar o que vai
  faltar. A reserva continua nascendo só quando o PCP libera (decisão de
  25/09/2026), mas esperar até lá para **descobrir** a falta desperdiça o prazo
  de compra — que é o motivo de tudo isto existir.
- Lembrar as respostas anteriores do mesmo veículo como sugestão.

**Feito em:** 28/09/2026.

**Uma descoberta que encurtou a etapa:** a **explosão de kit já existia**. O
`sugerirBom` (OpItens.tsx) abre o kit nos itens individuais desde antes, quando
o item vendido tem `produto_id`. Venda de kit e venda avulsa já caíam na mesma
lista — não havia nada a construir aí.

**O que foi feito:**

- `AplicarEstrutura.tsx`: `arvoresDaOp` (acha a configuração de cada item
  vendido para aquele veículo), `previsaoDeFalta` (compara com o disponível sem
  reservar nada) e `ModalAplicarEstrutura`.
- Botão **"🧩 Usar a configuração do veículo"** dentro do modal de liberar BOM
  da Engenharia. A BOM continua sendo revisada e liberada por lá, como sempre —
  o botão só preenche.
- Ao aplicar, as respostas ficam gravadas em `op_configuracao_respostas`, com
  quem respondeu e se foi automática.
- A junção com a BOM **soma quantidade de item repetido** em vez de duplicar a
  linha.

**Testado** de ponta a ponta com OP de 2 barras numa Nivus:

| Passo | Resultado |
|---|---|
| Abrir o modal | já mostra **4 cabos** (2 por barra × 2 barras), o material fixo |
| Responder "Tem hack" | a segunda pergunta **aparece sozinha** |
| Responder "Alto" | soma **6 suportes** (3 × 2) |
| Previsão | "precisa de 6, disponível 2 — **faltam 4**", com o aviso de que nada foi reservado |
| Jogar na BOM | as 3 linhas entraram, somadas à barra que já estava |
| Respostas | gravadas com autor e horário |

Dado de teste apagado; banco conferido zerado.

**O que ficou de fora:** a explosão **automática** na venda (hoje é o botão, a
pedido de um humano) e lembrar as respostas do carro anterior como sugestão.
Nenhuma das duas trava o uso — e ambas ficam melhores depois de algumas semanas
de uso real mostrando o que se repete.

---

### ✅ Etapa 7.1 — Reestruturação: pergunta no item, material no veículo, conjunto elétrico como interruptor

**Alinhamento de 28/09/2026.** Comparando o construído com o que o usuário
descreveu, apareceram três divergências — e uma peça do processo que eu não
conhecia e que muda o desenho todo.

---

#### 1. A peça que faltava: o CONJUNTO ELÉTRICO

É um **item de catálogo vendido à parte**. Existe porque em licitação tudo
precisa ser especificado: ele aparece na nota, no PV, compõe o preço final. E
representa o material de instalação — **suportes, chicotes, parafusos, porcas,
arruelas, EVAs, colas** — para a nota não virar uma lista micro de parafuso.

**O vendedor só seleciona esse item quando vai precisar.** Se o cliente usa
suporte e chicote de terceiros, ele não seleciona — e aí **a estrutura cadastrada
não é usada**.

> **É o interruptor.** A presença do Conjunto Elétrico na venda é o que liga a
> explosão da estrutura. Sem ele, o sistema não monta material de instalação.

Ao gerar a OPL, o conjunto é **preenchido** com os itens de instalação dos
outros itens vendidos, conforme o que já está cadastrado para aquele modelo e
ano.

---

#### 2. As perguntas pertencem ao ITEM, não ao par

> "barra sinalizadora, é nela que fica perguntas do hack — todo produto deve ter
> opção de registrar perguntas"

"Tem hack de teto?" é pergunta **da barra sinalizadora**, e vale em qualquer
carro. O que muda de carro para carro é **o material que cada resposta consome**.

A Etapa 6 amarrou a pergunta ao par (veículo × item). Consequência: seria
preciso redigitar "tem hack?" em cada carro onde a barra é vendida. Errado.

| | Onde fica |
|---|---|
| Pergunta e respostas possíveis | no **item** |
| Material que cada resposta consome | no **veículo × item × resposta** |
| Regra por combinação de itens | na **resposta** |

---

#### 3. Quem responde é o vendedor

Na **abertura da OPL**, não na Engenharia — é ele que está com o cliente e sabe
se o carro tem hack, se tem câmera no para-brisa. No lote customizável, o
**primeiro carro serve de padrão** para os seguintes, e o vendedor só muda o que
for diferente.

---

#### 4. A BOM da Engenharia é conferência

Mostra a lista completa — o vendido mais o que instala — e a Engenharia confere.

**E sinaliza o que falta.** Numa lista de 5 itens, se 4 já foram adaptados
naquele carro e 1 não: o conjunto recebe o que os 4 trazem, e **só o item novo é
cobrado** — a Engenharia cadastra a composição dele para aquele modelo e ano.
Cadastrou, passa a ser automático dali em diante. É assim que o sistema vai
ficando completo sozinho, um carro de cada vez.

---

**O que fazer:**

1. Tabelas novas: `item_perguntas` e `item_pergunta_opcoes` (a pergunta no item,
   com aninhamento e a regra por combinação) e `veiculo_item_materiais` (o
   material por veículo × item × resposta).
2. Marcar no cadastro qual item **é** o conjunto de instalação.
3. As tabelas `config_*` da Etapa 6 saem — **não há dado a migrar**, estavam
   zeradas em 28/09/2026.
4. Perguntas na **abertura da OPL**, por carro, com o primeiro servindo de padrão.
5. A OP nasce com a `bom_itens` montada — **só se o Conjunto Elétrico estiver na
   venda**.
6. Na Engenharia, painel de **conferência** com o aviso destacado dos itens sem
   estrutura para aquele veículo.

**Feito em:** 28/09/2026.

**O que foi feito:**

- Migração `pergunta_no_item_material_no_veiculo`: as `config_*` saíram e
  entraram `item_perguntas`, `item_pergunta_opcoes` e `veiculo_item_materiais`,
  mais `cadastro_itens.eh_conjunto_instalacao` — o interruptor.
- `ConfigEstrutura.ts` reescrito: `perguntasDoItem`, `materiaisDoVeiculo`,
  `itensSemEstrutura` (a pergunta "este item já foi adaptado neste carro?" é
  literalmente "existe linha aqui?"), `itensConjunto` e `vendaTemConjunto`.
- `ConfigEstruturaTela.tsx` em duas partes: pergunta no item, material no carro.
- `AplicarEstrutura.tsx` virou `PainelConferenciaEstrutura`, dentro do modal de
  liberar BOM — não é mais um botão que abre modal.

**Testado** com duas OPs no mesmo carro e a mesma barra vendida:

| OP | O que tinha | O que o painel disse |
|---|---|---|
| **com** Conjunto Elétrico | barra + conjunto + item novo | material calculado (**4 cabos**), aviso de **1 pergunta sem resposta** e **⚠ 1 item nunca adaptado neste carro**, com onde cadastrar |
| **sem** Conjunto Elétrico | só a barra | *"Sem Conjunto de Instalação nesta venda — é o caso de quem usa suporte e chicote de terceiros"*, e nada é montado |

O interruptor funciona: mesmo carro, mesma venda de barra, comportamento
oposto conforme o conjunto estar ou não na lista.

**O que ficou de fora:** os itens 4 e 5 — as perguntas ainda **não** foram para
a abertura da OPL, e a OP ainda não nasce com a `bom_itens` montada. O painel da
Engenharia já lê as respostas que estiverem gravadas, então quando elas passarem
a ser dadas na venda tudo se encaixa sem mexer nele. Fica para a **Etapa 7.3**.

---
### ✅ Etapa 7.2 — O formulário da OPL fica adaptativo

**Detalhado pelo usuário em 28/09/2026.** Mexe na mesma tela da 7.1 — vale
fazer junto para não reabrir o arquivo duas vezes —, mas pode subir sozinha.

#### Nem todo tipo de venda precisa saber o veículo

- **Adaptação** (na matriz ou externa): o veículo é **obrigatório** — é ele que
  está sendo adaptado.
- **Envio**: às vezes precisa saber o carro **só para escolher o suporte** que
  vai na caixa; às vezes é só o item e o cliente se vira para instalar, e aí o
  veículo **não faz falta nenhuma**.

Como isso varia por fluxo e pode mudar com o tempo, **quem decide é a
Administração**, não o código: para cada tipo de venda, o veículo fica
**oculto**, **opcional** ou **obrigatório**.

Os cinco fluxos de hoje, como ponto de partida a confirmar com o usuário:

| Fluxo | Sugestão |
|---|---|
| Adaptação na matriz | obrigatório |
| Adaptação externa | obrigatório |
| Fabricação serralheria com envio | opcional |
| Envio para adaptação de terceiro | opcional |
| Envio de material | opcional |

#### O campo de modelo em texto livre some quando o veículo aparece

Na Etapa 5.1 eu pus **os dois** na mesma linha: o select de veículo e o campo de
modelo em texto livre. É redundante e confunde. A regra certa:

> **Ou o select de veículo, ou o texto livre — nunca os dois.**

Fluxo com veículo ligado mostra o select (com o "+ Novo" para cadastrar na
hora). Fluxo com veículo oculto mostra o texto livre, opcional, como sempre foi.

#### O princípio maior

O formulário passa a se **adaptar de cima para baixo**: conforme os campos vão
sendo preenchidos, os seguintes aparecem, somem ou mudam de obrigatoriedade. O
vendedor não deve ver campo que não se aplica à venda que está fazendo.

**O que fazer:**
1. Tabela de configuração por fluxo, com o modo do veículo.
2. Tela na Administração para definir isso.
3. `NovaOpOsModal` lê a configuração e mostra, esconde ou exige o veículo.
4. O texto livre de modelo só aparece quando o veículo está oculto.

**Feito em:** 28/09/2026.

**O que foi feito:** tabela `fluxo_config`, tela **🚦 Venda × Veículo** na
administração e o `NovaOpOsModal` lendo o modo. O select de veículo e o texto
livre viraram excludentes, no cabeçalho e em cada unidade do lote. Validação
nova: fluxo obrigatório não deixa abrir OP sem veículo, e num lote cobra o de
cada carro.

**Testado** na tela: adaptação na matriz (obrigatório) mostra o select e some
com o texto livre; envio de material posto como "não pergunta" esconde os dois;
posto como obrigatório mostra o select — ou seja, a configuração manda mesmo
num fluxo de envio, que era a dúvida. A configuração foi **restaurada** ao
estado original depois do teste.

---

### ✅ Etapa 7.3 — As perguntas vão para a abertura da OPL

Ficou de fora da 7.1 por tamanho. É o que falta para o vendedor responder na
venda, como ele deve.

1. Mostrar as perguntas dos itens vendidos na abertura da OPL, **por carro** —
   no lote customizável cada unidade responde as suas, com o **primeiro carro
   servindo de padrão** para os seguintes.
2. Gravar as respostas depois do insert (na criação a OP ainda não tem `id`).
3. Montar a `bom_itens` ali, para a OP já nascer com o material — **só quando o
   Conjunto Elétrico estiver na venda**.

O painel da Engenharia **já lê** as respostas gravadas, então quando elas
passarem a vir da venda tudo se encaixa sem mexer nele.

**Feito em:** 28/09/2026
**O que foi feito:**

O bloco **"🚗 Sobre o carro — o que muda a instalação"** entrou no formulário da
OPL, logo abaixo dos itens vendidos. Quem responde é o vendedor, que é quem está
com o cliente.

- **O Conjunto Elétrico é o interruptor.** Sem ele na venda o bloco nem aparece:
  é o caso de quem traz suporte e chicote de terceiros, e aí não há material de
  instalação a montar.
- **A pergunta vem do item vendido** e aparece etiquetada com ele — "Tem hack de
  teto? *(BARRA SINALIZADORA)*" — para o vendedor saber por que está sendo
  perguntado.
- **O que a própria venda responde, o sistema já responde** e marca como
  "o sistema já sabia"; o vendedor só mexe no que sobra.
- **No lote, o primeiro carro é o padrão.** Os seguintes mostram "igual ao 01"
  com um "responder diferente" ao lado. Num lote de 30 isso é a diferença entre
  responder 2 perguntas e responder 60.
- A gravação roda **depois do insert**, porque durante o preenchimento a OP
  ainda não tem `id`. Grava as respostas em `op_configuracao_respostas` e soma o
  material calculado na `bom_itens`, juntando com o que já veio do vendido.
- **Falha no cálculo não derruba a venda.** Se algo der errado a OP nasce mesmo
  assim, só sem o material montado — a Engenharia ainda confere a BOM antes de
  liberar. Travar a venda por causa do cálculo seria pior que a OP nascer sem ele.

**Teste — o que foi conferido e o que não foi**

Conferido na tela: o bloco só aparece depois que o Conjunto Elétrico entra na
venda; a pergunta vem etiquetada com o item de origem; responder mostra
"✓ Tem hack de teto? **Tem**" com o "trocar" ao lado; e a Etapa 7.2 continua de
pé (veículo obrigatório pede o carro, o modelo em texto livre some, o aviso
limpa quando o carro é escolhido).

**Não consegui completar a criação de uma OP pela tela** — são 7 campos
obrigatórios com estado em cascata e o modal fecha no meio. Os dois pontos de
gravação foram conferidos **por leitura do pacote compilado**, não por execução:
o caminho do lote chamando com o índice da unidade e o da OP única chamando com
o índice 0. É a mesma limitação que ficou registrada na Etapa 5.1 — vale
confirmar com a primeira OP real que nascer com Conjunto Elétrico.

Dado de teste apagado (4 itens `ZZT-`, 1 veículo, 1 pergunta, 2 materiais) e
contagem conferida zerada nas quatro tabelas.

---

### ✅ Etapa 7.4 — O Conjunto Elétrico sai da lista e entra o conteúdo dele

Correção de dois erros da 7.3, apontados pelo usuário em 28/09/2026 ao conferir
o modelo. Estiveram no ar por cerca de uma hora.

**O que estava errado**

1. **A OP nascia só com o material de instalação.** Os produtos vendidos ficavam
   de fora — a barra sinalizadora, que é o que de fato vai ser instalado, sumia
   da lista que o Almoxarifado separa. Como a lista já nascia preenchida, a
   Engenharia não disparava mais a sugestão automática e ninguém percebia a
   falta.
2. **O Conjunto Elétrico virava linha para separar.** Ele é a caixa, não a peça:
   não existe "conjunto elétrico" na prateleira. O Almoxarifado receberia uma
   linha impossível de separar, e o motor de estoque poderia abrir requisição de
   compra dele.

**O desenho correto, na palavra do usuário**

> lista de material = itens vendidos (menos o Conjunto Elétrico) + o material
> calculado, que **é** o conteúdo do Conjunto Elétrico

O Conjunto continua na venda, na nota e no PV — licitação exige tudo
especificado. Quem perde a linha é só o Almoxarifado, que separa peça de
verdade. Cada linha calculada sai marcada **"do CONJUNTO ELÉTRICO"**, no mesmo
padrão que o sistema já usa para produto com estrutura ("do BARRA
SINALIZADORA").

**Onde a correção NÃO alcança (de propósito)**

Se o Conjunto está na venda mas aquele veículo ainda não tem material
configurado, nada é escrito e a Engenharia sugere a lista como sempre fez — e aí
o Conjunto ainda aparece como linha, para o engenheiro abrir na mão. É o caminho
antigo, intacto: quem não foi configurado continua funcionando manual.

**Teste — executado de verdade desta vez**

Pelo padrão do projeto: dev server com as gravações bloqueadas, lendo o corpo do
que *seria* gravado. A função de gravação foi chamada direto pelo módulo, o que
contorna o formulário de 7 campos que travou o teste da 7.3.

| Cenário | Lista montada |
|---|---|
| Conjunto na venda, 3 carros, "tem hack" | BARRA ×3 · SUPORTE ALTO ×6 · CABO ×12 |
| Conjunto na venda, 1 carro, "não tem hack" | BARRA ×1 · SUPORTE **BAIXO** ×2 · CABO ×4 |
| **Sem** Conjunto (suporte de terceiro) | nada gravado |
| Conjunto na venda, pergunta sem resposta | BARRA ×1 · CABO ×4 (o suporte não entra) |

O Conjunto Elétrico **não aparece** em nenhuma das listas, e a resposta troca o
suporte de verdade. A quantidade multiplica pelo número de carros.

Dado de teste apagado (5 itens `ZZT-`, 1 veículo, 1 pergunta, 2 opções, 3
materiais) e contagem conferida zerada em sete tabelas.

---
### ✅ Etapa 7.5 — Um só Conjunto Elétrico e a estrutura automática no lote (teste com as 39 Renegade)

**Feito em 29/09/2026, por pedido do usuário.** Detalhe completo na **Etapa 7.4 do `PLANO_UX_FLUXO_TRABALHO.md`**; aqui o que muda para este projeto:

- **O Conjunto Elétrico é um item só, o 1687**, o único gatilho (`eh_conjunto_instalacao`). Os outros 436 "CONJUNTO ELETRICO PV …" foram **unificados nele** (inativos, nada apagado) e o banco **recusa**
  outro Conjunto Elétrico ativo ou outra marca de gatilho; o 1687 não pode ser desativado, mudar de código nem ser excluído. A caixa "Este item é o Conjunto Elétrico" saiu de Administração → Estruturas.
- **Itens novos ganham código do sistema** (4410 em diante) — o usuário não vai mais importar do ERP.
- **A janela "LIBERAR BOM EM LOTE" da Engenharia agora tem o painel da estrutura** (antes só a liberação individual tinha), calculado sobre a primeira OP marcada, com aviso se as marcadas diferem em veículo/itens.
  **Serviço/`GENERICO` não é cobrado** como "nunca adaptado" e **"Jogar na BOM" tira a linha do Conjunto Elétrico** da lista de separação (é a caixa, não a peça) e marca o material "do CONJUNTO ELETRICO".
- **Teste com as 39 Renegade 4x4** (OPs 1673.2609/01–39, veículo "Renegade 4x4" 2015+, cada uma vende 13 itens incluindo o 1687): fluxo verificado de ponta a ponta com estrutura **simulada só na leitura**
  (18/18): o painel cobra os 9 itens físicos, calcula o material multiplicado pela quantidade vendida e libera a mesma BOM para as 39. **Falta cadastrar a estrutura de verdade** (0 linhas de material e 0 perguntas hoje) em
  Administração → Estruturas: 225, 226, 222, 244, 245, 1177, 1287, 1356 e 2894 × Renegade 4x4.
- **Ponto que estava aberto — resolvido na Etapa 7.6:** não havia tela para responder perguntas de uma OP que já existe.

### ✅ Etapa 7.6 — Tela de resposta em lote das perguntas sobre o carro

**Feito em 29/09/2026, por pedido do usuário.** Detalhe completo na **Etapa 7.5 do `PLANO_UX_FLUXO_TRABALHO.md`**. Resumo para este projeto:

- **Nova tela `RespostasEmLote.tsx`**, aberta por **"Responder agora (n OPs)"** no painel da estrutura da Engenharia (no lote atende todas as marcadas). **Padrão para todas as OPs** + **exceções por OP**; pergunta filha só aparece depois da
  resposta-pai; mostra o que já está gravado hoje. Só entram OPs com veículo do catálogo e o 1687 na venda.
- **Grava em `op_configuracao_respostas`** (o mesmo lugar da abertura da OP; upsert por OP + pergunta) e uma linha no histórico de cada OP. Trocar a resposta-pai **apaga as filhas** (o painel também passou a ignorar filha órfã: `podarRespostas`).
  A BOM que a OP já tenha **não é refeita sozinha**.
- **Liberação em lote:** aviso quando as OPs marcadas têm respostas diferentes (a mesma BOM iria para todas); lista do lote agora em ordem de número; a sugestão inicial da BOM passou a **somar** em vez de substituir a lista (corrida antiga).
- **Testado** com as 39 Renegade reais e perguntas/material simulados só na leitura: **26/26**.

### ✅ Etapa 8 — Checklist de separação no Almoxarifado, com baixa por item

**O que muda:** a lista de material vira um **checklist** que o Almoxarifado vai
marcando até fechar 100%.

- Item sob controle **só marca como separado se houver saldo**.
- **Marcar e desmarcar não move estoque.** A baixa acontece quando a separação é
  **salva** (decidido com o usuário em 26/09/2026). O raciocínio dele: o material
  já está reservado para aquela OP de qualquer jeito — e se não estiver, é porque
  está esperando uma demanda. Então não há corrida por material durante a
  conferência, e marcar errado não exige estorno.

**Substitui, não soma:** hoje `baixarKitDaOp` baixa tudo de uma vez ao fechar o
Kit 100%, e é lá que a **reserva é consumida** (Etapa 3). Ao passar para baixa
por item, o consumo da reserva vai junto, item a item. Se isso for esquecido, o
disponível passa a mentir — é a emenda mais provável deste plano, e está
anotada aqui para não acontecer.

**Feito em:** 28/09/2026
**O que foi feito:**

**Duas decisões tomadas com o usuário antes de escrever código (28/09/2026):**
o checklist começa **vazio** — quem marca é o Almoxarifado, conforme coloca a
peça na caixa; e **dá para salvar pela metade** — separa o que tem hoje, salva,
continua amanhã.

**O checklist.** A lista de material virou checklist com caixa de marcar por
item, contador de progresso ("2 de 3 itens separados, falta 1") e um "marcar
tudo que tem saldo". A quantidade continua editável para quem precisar separar
parcial. Item sob controle **sem saldo não marca**: a caixa fica travada e a
linha explica por quê ("sem saldo: precisa de 3 e tem 1 UN"). Quando o material
chega, a trava solta sozinha.

Marcar e desmarcar **não mexem no estoque** — a baixa acontece no salvar. O
raciocínio do usuário (26/09/2026): o material já está reservado para aquela OP
de qualquer jeito, então não há corrida por peça durante a conferência e marcar
errado não exige estorno.

**Salvar pela metade.** Botão novo no kiting: dá baixa no que está marcado,
guarda o progresso e **deixa a OP onde está**, esperando o resto. Não cobra
observação de diferença — item ainda não separado não é divergência, é trabalho
pela metade; a cobrança continua no fechamento do kit.

**A emenda que o plano previu — e que era real.** `baixarKitDaOp` já baixava
item a item e por diferença, mas `consumirReserva` encerrava a reserva do item
**inteira**, sem olhar quantidade. Com a baixa acontecendo uma vez só, batia. Com
salvamento parcial, baixar 2 de 6 encerraria a reserva dos 6: o saldo cairia 2 e
o reservado cairia 6. O disponível passaria a mentir **para mais** — quatro
peças que não existem livres.

Agora a reserva registra **quanto** já saiu (coluna `quantidade_consumida`) e só
vira "consumida" quando alcança a quantidade. O `vw_estoque_disponivel` conta o
que ainda não saiu. E a volta também foi fechada: se a conferência diminui, o
material volta para a prateleira **e para a reserva**.

**Teste — executado com gravação real em dado sintético**

Item com 10 em estoque, OP pedindo 6:

| Passo | Saldo | Reservado | **Disponível** |
|---|---|---|---|
| antes de tudo | 10 | 0 | 10 |
| PCP liberou: reserva de 6 | 10 | 6 | **4** |
| separou 2 de 6 e salvou | 8 | 4 | **4** |
| separou os 6 e fechou | 4 | 0 | **4** |
| corrigiu para 4: 2 voltaram | 6 | 2 | **4** |

O disponível **não se move** — é o invariante da etapa. Com o código antigo, no
terceiro passo ele saltaria para 8.

Na tela, conferido com o componente montado de verdade: começa com tudo
desmarcado e "0 de 3"; marcar e desmarcar mexem no contador; o item sem saldo
fica travado com a explicação; o "marcar tudo que tem saldo" pula o travado; e
quando o saldo sobe, a trava solta.

Dado de teste apagado (1 item, 1 OP, 1 reserva, 3 movimentos) e contagem
conferida zerada.

**O kiting em lote — resolvido no mesmo dia**

O lote registrava a conferência como separada inteira mas **nunca deu baixa no
estoque**: OP fechada em lote saía com o material na mão e o saldo intacto. O
unitário sempre baixou; o lote não.

Corrigido em 28/09/2026, com a regra que o usuário pediu: vale **só para OP que
ainda não passou pelo Almoxarifado** — o `status_almox` já preenchido é a marca
de quem já passou, e o que foi fechado antes fica como está, sem correção
retroativa. Como `baixarKitDaOp` trabalha por diferença, OP que volta para
refazer o kit também não conta o material duas vezes.

Conferido com gravação real: OP nova baixou 3 de um saldo de 20 (ficou 17); OP
já passada pelo almox foi ignorada, saldo intacto; repetir a mesma OP não
movimentou nada.

---

### ✅ Etapa 9 — Estrutura do chicote (o micro)

**O que muda:** o chicote ganha sua própria estrutura — metros de fio por cor,
conexões, terminais. Mandar fabricar dá baixa nesses materiais e dispara a
compra deles quando faltar.

**Só faz sentido depois** que o chicote inteiro já entra e sai do estoque
direito e que o setor esteja confortável com o controle. Perguntado antes de
começar (28/09/2026, com o número real do banco — 12 de 72 chicotes
cadastrados já sob controle, subiu de 3 em três dias): usuário confirmou que
sim, pode seguir.

**Feito em:** 28/09/2026.

**O que foi feito:**

- Migração `estrutura_do_chicote`: tabela `chicote_materiais` (chicote ×
  material, quantidade por unidade fabricada, único por par).
- `Estoque.tsx`:
  - `materiaisDoChicote`, `adicionarMaterialChicote`, `removerMaterialChicote`,
    `materiaisAConsumir` (a mesma conta serve pra prévia na tela e pra baixa de
    verdade — quantidade produzida × quantidade por chicote).
  - `creditarFabricacaoRecebida` passou a, depois de creditar o chicote, olhar
    a estrutura dele e descontar cada material — pelo **mesmo**
    `movimentarEstoque` de sempre. Foi por isso que "dispara a compra quando
    faltar" não pediu nada novo: o gatilho de reposição automática (Etapa 2/4)
    já mora dentro do movimento, não na tela. Falha ao descontar um material
    não desfaz o crédito do chicote — vira aviso, não trava a fabricação.
  - `CamposEstruturaChicote` — editor embutido no Cadastro de Itens: lista os
    materiais do chicote com botão de remover, e um `SelectBusca` + quantidade
    para adicionar. Só aparece no item já salvo, fabricado aqui dentro, do
    setor Chicotes.
  - `PainelFabricacaoRecebimento` ganhou a prévia: antes de confirmar a
    entrada, mostra o que também vai ser descontado, na proporção da
    quantidade digitada.
- `CadastroItensTab.tsx`: nova seção "🧵 Estrutura do chicote (Etapa 9)",
  logo depois de "Origem do item".

**Testado** de ponta a ponta, com gravação real em dados sintéticos
(`ZZT-CHI9` chicote, `ZZT-FIO9` fio vermelho, `ZZT-TER9` terminal — 2m de fio
e 4 terminais por chicote):

| Passo | Resultado |
|---|---|
| Estrutura cadastrada pela tela (Cadastro de Itens) | os dois materiais aparecem certos, com botão de remover |
| Demanda com 8 produzidos (pedido de 10) na fila do Almoxarifado | aparece em "Fabricação pronta para conferir" |
| Modal de dar entrada | prévia mostra **16 M de fio** e **32 PC de terminal** (8 × 2 e 8 × 4) |
| Confirmado | chicote **0 → 8**; fio **100 → 84**; terminal **40 → 8** |
| Terminal ficou abaixo do mínimo (20) | pediu compra sozinho — **PC-LXMCXL**, avisado na hora na mensagem de confirmação |

Dado de teste apagado (3 itens, 1 demanda, 1 estrutura, 3 movimentos, 1
requisição de compra); banco conferido de volta em 4.438 itens (4.429 ativos),
como antes.

**Achado no caminho, fora do escopo desta etapa:** a fila de
`fabricacoesAguardandoCredito()` filtra status `['Concluido', 'Concluída']`
(sem acento numa grafia, com acento na outra), mas o banco tem hoje demandas
de verdade com status **`Concluida`** (sem acento, feminino) — uma terceira
grafia que não bate com nenhuma das duas do filtro. Uma demanda nesse status
nunca aparece na fila de crédito de estoque. Não mexi nisso porque é um dado
real e um comportamento fora do que a Etapa 9 pediu — fica anotado para
decisão à parte.

**O que ficou de fora de propósito:** nada. A etapa era a última do plano
principal (ver "Onde queremos chegar" e a Revisão de arquitetura de
26/09/2026) — o que resta é o que já estava listado como aberto nas etapas
anteriores (ver "Perguntas em aberto", abaixo).

---

## Revisão de arquitetura — 26/09/2026

Feita a pedido do usuário, olhando o que já está pronto contra o fluxo completo,
para o resultado não ficar remendado.

**O que está certo e não precisa mexer:**

- **Etapas 1 a 4 seguem de pé.** A explosão da estrutura entrega material na
  `bom_itens`, que é de onde a reserva, a falta e o kiting já leem. Chicote que
  a estrutura pedir cai sozinho na rota de fabricação interna da Etapa 2 e na
  falta da Etapa 4. Nada disso precisa ser refeito.
- **`bom_itens` é a fonte única da lista de material** e continua sendo. Tudo
  que for gerado automaticamente escreve nela.

**O que precisa voltar:**

- **Etapa 5.1**, acima: veículo por unidade no lote.

**O que precisa ser feito com cuidado para não virar emenda:**

- O consumo da reserva tem que migrar junto com a baixa, na Etapa 8.
- A Etapa 6 precisa entregar valor sozinha (o "aplicar nesta OP" manual), senão
  a fábrica fica meses sem ver nada enquanto 6 e 7 não fecham juntas.

---
## Decisões tomadas

| Data | Decisão |
|---|---|
| 25/09/2026 | A maioria dos chicotes é de estoque. Só chicote de veículo ainda não adaptado precisa de desenvolvimento — e esse continua como demanda de texto livre. |
| 25/09/2026 | O pedido de chicote/serralheria vindo da Engenharia ou do PCP era solução temporária. No futuro fica só para chicote que precisa ser desenvolvido. |
| 25/09/2026 | Reserva ≠ baixa. A baixa continua no kiting, manual, feito pelo Almoxarifado. |
| 25/09/2026 | Faltando para OP e para a prateleira, saem DUAS demandas: a da OP (prioridade) e a de reposição. |
| 25/09/2026 | Campos de veículo (marca/modelo/ano) vêm da FIPE e são selects com busca. |
| 25/09/2026 | **A reserva nasce quando o PCP libera a OP para o Almoxarifado.** |
| 25/09/2026 | A Etapa 2 foi feita antes da 1: mínimo calado era falha ativa. |
| 25/09/2026 | Reposição de item interno é demanda para o setor, nunca compra. |

---

## Perguntas em aberto

- **Etapa 2 (para observar):** a varredura hoje é um botão que alguém aprecia.
  Depois de algumas semanas de uso, decidir se vale rodar sozinha — e com que
  frequência, sem encher o setor de demanda repetida.
- **Etapa 4:** quando a falta é de fabricação interna, o pedido deve nascer já
  designado a alguém do setor ou entra na fila geral?
- **Etapa 5:** confirmar qual API da FIPE usar e se há limite de uso.
- **Etapa 6 (resolvido em 26/09/2026):** as perguntas formam uma ÁRVORE por par
  (veículo × item vendido) — resposta leva a outra pergunta ou a itens de material.
- **Etapa 7 (resolvido em 26/09/2026):** o lote customizado ganha tela própria na
  Etapa 5.1 — dois botões, "lote igual" e "lote customizável", com os itens
  vendidos preenchidos primeiro.
- **Etapa 8 (resolvido em 26/09/2026):** marcar e desmarcar não movem estoque; a
  baixa só acontece ao salvar a separação. Sem estorno, sem contagem.

---

## Decisões de 26/09/2026 (detalhamento do fluxo)

| Decisão | |
|---|---|
| Perguntas de configuração | formam uma **árvore**: a resposta leva a outra pergunta ou a itens de material |
| Parachoque de impulsão | resposta **automática** — se foi vendido frontal e traseiro, não precisa de suporte |
| Kit vendido | explode nos itens individuais e segue o mesmo fluxo; o kit só muda como o preço é formado |
| Quem responde as perguntas | Comercial ou Licitações, junto com a venda |
| Quem preenche estrutura que falta | PCP, depois de a Engenharia decidir se precisa de desenvolvimento |
| Baixa no Almoxarifado | passa a ser **por item**, ao marcar no checklist de separação |
| Itens vendidos | são a **primeira coisa** a preencher ao gerar a OP — eles decidem as perguntas |
| Lote | dois botões: **igual** (só a quantidade) ou **customizável** (carro a carro) |
| Regras de combinação | podem **trocar**, **excluir** ou **acrescentar** material |
| Baixa na separação | acontece ao **salvar**, não ao marcar; marcar e desmarcar são livres |

---

## Decisões de 28/09/2026 (alinhamento)

| Decisão | |
|---|---|
| Quem responde as perguntas | o **vendedor**, na abertura da OPL — ele é quem sabe do carro |
| Conjunto elétrico | é o **coringa**: muda de carro, modelo e às vezes ano. É o caso que a estrutura por veículo existe para resolver |
| BOM da Engenharia | é **conferência**, não montagem |
| Item nunca adaptado naquele carro | a BOM tem de **sinalizar**, para a estrutura ser cadastrada |
| Conjunto Elétrico | é **item de catálogo vendido à parte** — aparece na nota e no PV, e representa suportes, chicotes, parafusos, porcas, arruelas, EVAs e colas |
| A presença dele na venda | é o **interruptor** da explosão: sem ele (peças de terceiros), a estrutura não é usada |
| Perguntas | ficam no **item**, não no par veículo × item |
| Material de cada resposta | fica no **veículo × item × resposta** |
| Lote customizável | o **primeiro carro serve de padrão** para os seguintes |
| Veículo por tipo de venda | quem decide é a **Administração**: oculto, opcional ou obrigatório por fluxo |
| Select de veículo × texto livre | **nunca os dois juntos** — um ou outro, conforme o fluxo |
| Formulário da OPL | **adaptativo de cima para baixo**: campo que não se aplica não aparece |
