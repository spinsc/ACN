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

### ⬜ Etapa 3 — Reserva de estoque · **PRÓXIMA**

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

**Ponto de atenção:** esta etapa mexe no caminho do kiting, que está em uso
diário. Precisa de teste de navegador com as gravações bloqueadas antes de subir.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 4 — A falta da OP vira pedido automático, considerando o lote

**O caso do usuário:** 20 chicotes em estoque, OP com lote de 30 carros. O
sistema tem que ver que faltam 10 e pedir os 10 — não parar no ideal de 50.

**O que muda:**
1. Ao reservar, o que não couber no disponível vira **falta**.
2. A falta abre pedido automático pelo caminho certo do item: compra, chicotes
   ou serralheria.
3. A quantidade pedida é **a maior entre** repor até o ideal e cobrir a falta da
   OP. Um lote de 90 carros não pode ser limitado pelo ideal de 30.
4. O pedido nasce amarrado à OP que o provocou, para o Almoxarifado saber por
   que ele existe.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 5 — Veículo pela FIPE na abertura da OPL

**O que muda:** na abertura da OPL, três campos em cascata — **marca**,
**modelo**, **ano** — vindos da API da Tabela FIPE, cada um como `SelectBusca`
(digita e filtra, como os outros selects com busca do sistema).

**Cuidados:**
- A resposta da FIPE precisa ser **guardada no banco** (tabela de cache), senão
  toda abertura de OPL depende de um serviço de fora estar no ar.
- Se a API não responder, o campo continua aceitando texto livre. Abertura de OP
  não pode depender de internet de terceiro.
- A OPL guarda marca, modelo, ano **e o código FIPE**, que é o que amarra a
  estrutura de produto depois.

**A validar antes de começar:** qual API usar e se ela aguenta o uso. Confirmar
que devolve marca → modelo → ano em cascata.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 6 — Estrutura de produto: veículo × item vendido

**O coração da automação.** Para cada combinação de veículo e item vendido,
qual é a lista de material da adaptação.

**O que muda:**
1. Tela de configuração: escolhe veículo (da Etapa 5) e item vendido, e monta a
   lista de material — incluindo qual chicote entra.
2. **Perguntas de configuração:** a estrutura pode ter perguntas que mudam a
   lista ("tem hack de teto?", "quantos slimled na frente?"). A resposta entra
   no cálculo da quantidade.
3. Item vendido sem estrutura para aquele veículo: o sistema **avisa e pede para
   configurar**, sem travar. Configurou uma vez, vale para sempre.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 7 — Explosão automática da lista da OP

**O que muda:** ao registrar os itens vendidos da OP, o sistema explode as
estruturas e monta sozinho a lista de material — que então alimenta a reserva
(Etapa 3) e o pedido automático (Etapa 4). O PCP revisa em vez de digitar.

**Como fica gradual:** o que tem estrutura vem preenchido; o que não tem
continua sendo listado à mão, lado a lado, na mesma tela.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 8 — Estrutura do chicote (o micro)

**O que muda:** o chicote ganha sua própria estrutura — metros de fio por cor,
conexões, terminais. Mandar fabricar dá baixa nesses materiais e dispara a
compra deles quando faltar.

**Só faz sentido depois** que o chicote inteiro já entra e sai do estoque
direito (Etapas 1 a 4) e que o setor esteja confortável com o controle.

**Feito em:** —
**O que foi feito:** —

---

## Decisões tomadas

| Data | Decisão |
|---|---|
| 25/09/2026 | A maioria dos chicotes é de estoque. Só chicote de veículo ainda não adaptado precisa de desenvolvimento — e esse continua como demanda de texto livre. |
| 25/09/2026 | O pedido de chicote/serralheria vindo da Engenharia ou do PCP era solução temporária. No futuro fica só para chicote que precisa ser desenvolvido. |
| 25/09/2026 | Reserva ≠ baixa. A baixa continua no kiting, manual, feito pelo Almoxarifado. |
| 25/09/2026 | A quantidade a pedir considera o lote da OP, não só o estoque ideal. |
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
- **Etapa 6:** as perguntas de configuração valem por veículo, por item vendido,
  ou pela combinação dos dois?
