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

Números reais de hoje:

- **7 itens** sob controle de estoque: 4 de consumo (discos) e **3 chicotes**.
- **72 chicotes** cadastrados como fabricação interna do setor Chicotes — ou
  seja, a base para ligar o controle já está cadastrada.
- Os 3 chicotes controlados estão **abaixo do mínimo** (6/30, 11/30, 14/30) e
  **ninguém foi avisado**, porque a reposição só dispara quando o item se
  movimenta e eles nunca se movimentaram. Isso é tratado na Etapa 2.

---

## Etapas

Estado: ⬜ não começou · 🟡 em andamento · ✅ concluída

---

### ⬜ Etapa 1 — Fabricação interna dá entrada no estoque

**Por que primeiro:** é o menor pedaço que fecha um ciclo inteiro e destrava
todo o resto. Sem entrada por fabricação, reservar chicote não adianta.

**Hoje:** o setor conclui a demanda, o Almoxarifado confirma o recebimento, e o
estoque não é tocado. A demanda nem sabe a qual item se refere, nem quanto foi
realmente produzido.

**O que muda:**
1. A demanda de fabricação passa a poder **apontar para um item do cadastro**
   (`SelectBusca`, opcional, filtrando por `origem_producao = 'interna'`).
2. Ao concluir, o setor informa **quanto produziu de verdade** — como o Compras
   informa a quantidade comprada. Vem preenchido com o pedido.
3. Ao o Almoxarifado confirmar o recebimento, o estoque é creditado, com motivo
   novo `fabricacao_recebida`, registrando OP, setor e demanda no extrato.

**Como fica gradual:** demanda sem item vinculado segue idêntica a hoje — sem
quantidade produzida e sem movimentar estoque.

**Como testar:** demanda `ZZTESTE` de chicote apontando para um dos 3 chicotes
controlados; concluir informando quantidade diferente da pedida; confirmar o
recebimento; conferir saldo e extrato; apagar e conferir a contagem.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 2 — Reposição enxerga quem fabrica aqui dentro

**Hoje:** item abaixo do mínimo sempre vira **pedido de compra**, mesmo sendo
chicote que a gente mesmo faz. E só dispara quando o item se movimenta.

**O que muda:**
1. Item com `origem_producao = 'interna'` abre **demanda de fabricação** para o
   `setor_fabricante`, não requisição de compra.
2. **Varredura de mínimos:** uma verificação que olha todos os itens
   controlados, não só os que se mexeram. Resolve os 3 chicotes hoje calados.
3. A trava contra repetição passa a valer para os dois caminhos — demanda de
   fabricação aberta também significa "material a caminho".

**Como fica gradual:** só afeta item controlado. Item externo continua gerando
compra como hoje.

**Feito em:** —
**O que foi feito:** —

---

### ⬜ Etapa 3 — Reserva de estoque

**O conceito que falta.** Hoje só existe saldo. Passa a existir **saldo
disponível = saldo − reservado**.

**O que muda:**
1. Tabela `estoque_reservas`: item, OP, quantidade, situação
   (reservada / consumida / liberada), quem e quando.
2. Quando a OP é liberada para o Almoxarifado, o sistema reserva o que aquela OP
   precisa dos itens controlados.
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

---

## Perguntas em aberto

- **Etapa 3:** quando exatamente a reserva nasce — ao PCP liberar o kiting, ou
  já na entrada da OP no Almoxarifado? O usuário descreveu "quando a OP vai para
  o almox".
- **Etapa 4:** quando a falta é de fabricação interna, o pedido deve nascer já
  designado a alguém do setor ou entra na fila geral?
- **Etapa 5:** confirmar qual API da FIPE usar e se há limite de uso.
- **Etapa 6:** as perguntas de configuração valem por veículo, por item vendido,
  ou pela combinação dos dois?
