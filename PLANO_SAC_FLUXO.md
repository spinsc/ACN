# Plano — SAC: começo e fim de toda OS, Garantia coerente e chegada ao Fiscal

**Pedido do usuário em 27/10/2026** (a partir do relato do SAC e de um print de OS "Em Cotação · Garantia"):
"Preciso de uma análise na tela do SAC, preciso que OS sejam concluídas para serem faturadas no fiscal, hoje elas ficam presas sempre no mesmo status. [...] Pq aparece em cotação se é garantia?
[...] análise a fundo da tela do SAC e uma melhoria geral na tela para um funcionamento congruente, e que tenha início e fim uma OS em aberto e ou uma garantia, faça sentido a aba SAC com a aba
Garantia e que OS que sejam para faturamento cheguem nessa ETAPA."

> Este arquivo nasceu como **análise** (lida em 27/10/2026: `SacTab.tsx`, `GarantiaTab.tsx`, `FiscalTab.tsx`, `QualidadeTab.tsx`, `ProducaoTab.tsx`, `SetorDemandaTab.tsx`, `NovaOpOsModal.tsx`,
> `ComissaoCalculo.ts` e o banco). Nada foi construído nem mexido em dado real. As decisões que dependem do usuário estão no fim; cada etapa só começa depois delas.

## O que existe hoje (medido em 27/10/2026)

**32 OS no banco. Nenhuma foi faturada pelo Fiscal** (`numero_nf` vazio nas 32) e **só 1 foi entregue**. As 13 de tipo "Garantia" e as 19 pagas estão assim:

| Onde está | Quantas | Há quanto tempo | Quem precisa agir | O que o sistema oferece para essa pessoa |
|---|---|---|---|---|
| **Em Cotação** (garantia, veicular, remota) | 9 | hoje | SAC | "Itens" e "Enviar Cotação" — mandar cotação de preço ao cliente **de um atendimento em garantia** |
| **Orçamento Pronto** (laboratório) | 8 | **64 a 98 dias** | SAC | o botão "Enviar" ao cliente; **ninguém avisa que está parada** |
| **Provisionada** (veicular) | 6 | desde agosto | Produção | registrar a chegada do veículo e iniciar |
| **Em Provisionamento** (veicular) | 3 | 5 a 64 dias | Produção | marcar a data de atendimento |
| **Aberta** (lançada pelo card do CRM) | 3 | 20 dias e hoje | **ninguém** | **nada**: não tem botão, não tem demanda, o Laboratório não enxerga |
| **Diagnóstico** (laboratório) | 2 | 43 e 61 dias | Laboratório | terminar o diagnóstico e o orçamento |
| **Entregue** | 1 | — | — | — |

## Como a OS anda hoje — três caminhos que não se encontram

1. **Caminho do Laboratório** (OS "comum" e Garantia sem veículo): `Diagnóstico → Orçamento Pronto → Orç. Enviado → Aprovado → Em Execução → Concluído → Entregue`. **Termina na entrega: não passa pelo Fiscal.**
   O valor e a "data de faturamento" são digitados à mão pelo SAC (menu ⋯ › Financeiro) — e é essa data que a **comissão da OS** lê. A OS "faturada" aqui nunca teve nota.
2. **Caminho da manutenção veicular** (a OS que tem veículo, inclusive de Garantia): `Em Cotação` (avaliação remota) ou `Em Provisionamento` (presencial) `→ Aguardando Aprovação Cliente → Em Provisionamento → Aguardando Aceite SAC →
   Provisionada/Aguardando Início → Em Execução (Produção) → Aguardando CQ → Aguardando Envio Fiscal → [SAC informa os seriais] → Aguardando Emissão NF → Faturada - Aguardando Entrega → Entregue`.
   **É o único que chega ao Fiscal** — e nenhuma OS chegou até lá ainda.
3. **OS lançada pelo card do CRM** (a venda de serviço com PV): nasce `Aberta` e **para**. O código dela (`NovaOpOsModal.tsx`) só grava a OS: não cria a demanda do Laboratório (como a tela do SAC faz) nem define quem executa.

**A aba Garantia** (`garantia_atendimentos`, G1 a G6, concluída em 20/10/2026) tem **0 atendimentos**. Os 13 atendimentos em garantia que existem estão como **OS** de tipo "Garantia", fora da ficha: sem avaliação de cobertura,
sem consulta ao fornecedor, sem custos nem autorização da direção — exatamente o que a ficha existe para tratar. As duas abas do SAC não se falam: a ficha pode apontar uma OS (busca), mas a OS não aponta a ficha, e abrir a OS não pede a ficha.

## O que está errado (e por quê)

| # | Achado | Efeito |
|---|---|---|
| P1 | **Garantia com veículo entra na cotação** (`criarOS`: veículo ⇒ fluxo veicular; `Remota` ⇒ "Em Cotação"). A regra "garantia é aprovada sozinha" só vale para OS **sem** veículo | Atendimento em garantia vira cotação de preço para o cliente aprovar, e depois quer ir para o Fiscal. É o relato do SAC |
| P2 | **Só a manutenção veicular chega ao Fiscal.** Laboratório e as demais OS terminam em "Entregue" sem nota | O que o usuário pediu ("OS concluídas para faturar no Fiscal") não acontece para a maioria das OS pagas |
| P3 | **A OS faturada pelo Fiscal não grava a data de faturamento da OS** (`faturarOS` grava `data_emissao_nf`, não `data_faturamento`), e é `data_faturamento` que a comissão lê | Uma OS faturada de verdade **não entra** na comissão até o SAC digitar a data à mão; e o contrário também: OS "faturada" por digitação sem nota entra |
| P4 | **OS lançada pelo CRM nasce `Aberta` e não tem caminho** (sem botão para o SAC, sem demanda para o Laboratório) | 3 OS paradas sem dono |
| P5 | **Não existe "cancelar/encerrar" a OS.** O menu até prevê o status "Cancelada", mas nada o grava; só "Reprovado" sai do quadro | OS desistida, duplicada ou criada errada fica para sempre "em aberto" (é por isso que a lista só cresce) |
| P6 | **Nenhum alerta de OS parada.** A lista mostra a etapa, mas não há dias nem "quem tem que agir" | 8 OS esperando o SAC enviar o orçamento há mais de 60 dias, sem ninguém ser cobrado |
| P7 | **Etapa morta com atalho que pula o CQ e o Fiscal:** `Manutenção Concluída` mostra "Entrega" direto, mas **nada mais grava esse status** (a Produção manda para `Aguardando CQ`) | Código que um dia deixaria entregar sem auditar nem faturar |
| P8 | **Nomes diferentes para a mesma coisa:** a lista do SAC tem cor e filtro para `Em Manutenção`, mas a Produção grava `Em Execução`; "Concluído" (Laboratório) × "Manutenção Concluída" × "Aguardando CQ" | A barra de progresso do cartão só conhece o caminho do Laboratório (7 etapas); a OS veicular não tem barra |
| P9 | **Dois quadros que não dizem o mesmo:** o Kanban tem 3 colunas ("Pendente / Em andamento / Concluído") e `Faturada` cai em "Concluído" mesmo faltando entregar; `Reprovado` some do quadro | A OS faturada parece terminada e não é |
| P10 | **O Fiscal não enxerga a OS pelo mesmo caminho da OP**: a lista "OS veiculares" é separada, sem busca, sem lote, sem "Corrigir data" | Trabalho duplicado para quem fatura |

## Como deveria ser — começo e fim claros, uma ordem só

Duas perguntas decidem o caminho de qualquer OS, **na abertura**: **"é garantia dentro da cobertura?"** (não se cobra) e **"tem veículo?"** (muda quem executa, não o resto).

```
INÍCIO      Abertura da OS (SAC ou card do CRM)  — toda OS nasce com: quem executa, se é cobrada ou não, e a etapa em que está
              │
              ├─ GARANTIA (sem cobrança): [Ficha da Garantia: avaliação, cobertura, fornecedor, autorização] → execução (Laboratório ou Produção) → Concluída → ENTREGUE   (fim: não vai ao Fiscal)
              │       └─ a ficha diz "fora da cobertura" ou "cortesia paga": a OS passa a ser COBRADA ↓
              └─ COBRADA: cotação/orçamento → aprovação do cliente → execução → [CQ, se veicular] → Concluída → ENVIAR AO FISCAL → Aguardando Emissão NF → Faturada → ENTREGUE   (fim)

QUALQUER ETAPA → Cancelada (com motivo)  /  Reprovada pelo cliente (segue como hoje)
```

Cada etapa diz **quem tem que agir** (SAC, Laboratório, Produção, Qualidade, Fiscal, cliente) e **há quantos dias** está lá.

## Etapas (uma por vez; cada uma funciona sozinha; decisões do usuário no quadro abaixo)

- **S1 — Garantia coerente. ✅ feita em 27/10/2026.** (`SacFluxo.ts` — as regras; migração `sac_os_cobranca_e_ficha_da_garantia`: `sac_ordens_servico.cobranca` e `garantia_id`, **nenhuma linha antiga regravada**.)
  • **A OS de garantia nasce sem cotação:** garantia veicular nasce em "Em Provisionamento" (a Produção marca a data), qualquer que seja a avaliação "Remota/Presencial" (para a sem cobrança o formulário nem pergunta); a do Laboratório nasce "Aprovado" e a
  demanda é de execução direta. A cobrada (garantia fora da cobertura, cobrada do cliente) segue o fluxo pago de sempre. Depois do CQ, a OS **sem cobrança** vai a **"Concluído"** e à **Entrega** — **não vai ao Fiscal** (`QualidadeTab`: `statusAposCQ`); a cobrada vai a "Aguardando Envio Fiscal".
  • **A ficha é a porta de entrada:** a OS de tipo "Garantia" **pede a ficha** (a primeira coisa conferida ao "Abrir OS"); a Nova OS lista só as fichas que já podem gerar OS — **avaliação técnica registrada** e, fora da garantia, alinhamento aceito pelo cliente e autorização da
  direção; o cliente, o contato, o veículo do catálogo, o chassi e a falha **vêm preenchidos**; a cobrança vem **sugerida** (dentro da garantia ou "a confirmar" = sem cobrança; fora da garantia = cobrada, **a não ser que a direção tenha aprovado uma cortesia**) e quem abre a OS pode trocar.
  Na ficha (aba Garantia, dentro do SAC) há a seção **"Ordens de serviço"** com as OS geradas, a etapa de cada uma e o botão **"Gerar OS de execução"** (abre a Nova OS preenchida; sem avaliação ou fora da garantia sem alinhamento/autorização o botão não aparece e a frase diz o que falta). A ficha registra no histórico
  "Ordem de serviço gerada: OS-… (sem cobrança)" e o responsável e os copiados são avisados (como em todo evento novo da ficha). **Copiar OS** de uma OS de garantia mantém a ficha e a cobrança. O card do CRM deixou de oferecer o tipo "Garantia" (abriria sem ficha).
  • **As 9 OS de garantia que já estavam em "Em Cotação"** não foram mexidas: ganharam o botão **"Seguir sem cotação"** (uma por vez, com confirmação; grava `Em Provisionamento`, `cobranca = garantia` e avaliação presencial, só se ainda estiver em "Em Cotação"); "Itens" e "Enviar Cotação" saíram das OS sem cobrança. A OS veicular
  sem cobrança já concluída mostra "Entrega".
  • **Suposição minha (a confirmar):** a ficha libera a OS com a **avaliação** feita (e a trava de "fora da garantia"); o **fornecedor** e **quem executa** seguem em paralelo na ficha e **não travam** a abertura da OS.
  • **Números reais:** regras 50/50 (matriz de cobrança, etapa inicial, etapa depois do CQ, ficha que libera/não libera, cobrança sugerida, preenchimento) e cópia da OS 6/6; navegador 27/27 (Nova OS de garantia sem ficha barrada; só a ficha liberada aparece; veicular nasce "Em Provisionamento"; Laboratório nasce "Aprovado" com demanda de execução; cobrada com avaliação remota volta à cotação; "Gerar OS" na ficha; fichas sem avaliação e fora da garantia sem o botão; "Seguir sem cotação" e a OS cobrada em cotação intacta); 17 defeitos plantados, 17 apontados; build ok; visual conferido no computador e no celular.
  **Não exercitado no navegador:** a aprovação do CQ da OS (a regra do status depois do CQ é a `statusAposCQ`, testada em unidade).
- **S2 — Fim da OS: concluir e ir ao Fiscal.** Toda OS cobrada, concluída, ganha "Enviar ao Fiscal" (hoje só a veicular): o SAC confere dados de faturamento e seriais; o Fiscal fatura (mesma tela e mesma busca das OPs, com lote e correção de data); a OS volta ao
  SAC "Faturada - Aguardando Entrega" e termina em "Entregue". O faturamento grava a `data_faturamento` da OS (comissão). *(depende das decisões 2 e 3)*
- **S3 — Início da OS: nenhuma OS nasce sem caminho.** OS lançada pelo card do CRM passa a nascer no mesmo fluxo da OS do SAC (demanda para quem executa, e o SAC vê o que fazer). *(depende da decisão 4)*
- **S4 — Fim por cancelamento e OS paradas.** "Cancelar OS" com motivo (histórico e aviso), a etapa "Cancelada" fora do quadro, **dias parada e "quem tem que agir"** em cada OS, filtro "Paradas há mais de N dias" e um
  painel "o que está com o SAC hoje". As 32 OS de hoje **não são mexidas**: o painel mostra o que está parado e o SAC decide o que cancelar, enviar ou cobrar.
- **S5 — Tela do SAC congruente.** Um só vocabulário de etapas (acaba o `Em Manutenção` × `Em Execução`, sai o `Manutenção Concluída` morto), uma barra de progresso que serve aos dois caminhos, o quadro com uma coluna a mais
  ("No Fiscal / aguardando entrega") para a OS faturada não parecer terminada, e a aba Garantia ligada à OS. *(migra a tela para o design system se ainda houver pendência, como manda o `/ux-fluxo`)*

## Decisões do usuário em 27/10/2026 (todas na opção recomendada)

1. **A ficha da Garantia é a porta de entrada da OS de garantia.** A avaliação da cobertura, o fornecedor, os custos e a autorização já existem na ficha; "Gerar OS" a partir da ficha abre a Nova OS já preenchida (a mesma tela do SAC, com o
   lote para campanha de recall), e a OS de tipo "Garantia" aberta direto pelo SAC **pede a ficha** (escolhe uma liberada; sem ficha liberada a tela manda para a aba Garantia). Garantia nunca passa por cotação.
2. **Vai ao Fiscal toda OS cobrada** (veicular e de Laboratório), depois de concluída. Garantia dentro da cobertura e atendimento sem cobrança terminam em "Entregue", sem Fiscal; garantia fora da cobertura entra no fluxo cobrado.
3. **A data da comissão da OS passa a ser a data da nota que o Fiscal emitiu** (como nas OPs); o SAC deixa de digitar a "data de faturamento".
4. **OS lançada pelo card do CRM: o SAC marca como concluída.** O valor e o PV já vêm da venda: sem cotação; a OS vai direto para execução, o responsável conclui e ela segue para o Fiscal.

**Como o desenho fica no sistema (S1 em diante):** a OS ganha a marca **`cobranca`** (`garantia` = sem cobrança, `cobrada`) e **`garantia_id`** (a ficha). OS antiga sem a marca vale pelo tipo de serviço (tipo "Garantia" = sem cobrança): nenhuma linha antiga é regravada.
A marca decide três coisas: a etapa em que a OS **nasce** (garantia veicular nasce em "Em Provisionamento", sem cotação), a etapa **depois do CQ** (sem cobrança vai a "Concluído" e à entrega; cobrada vai ao Fiscal) e se o botão "Enviar ao Fiscal" aparece.

## O que não será mexido sem pedido

Nenhuma OS existente muda de etapa sozinha; nenhuma OS é cancelada, enviada ao cliente ou faturada por mim; as 9 OS "Em Cotação" de garantia de hoje e as 8 "Orçamento Pronto" só mudam por decisão do SAC (ou autorização explícita
do usuário, com contagem). Comissão: nenhum cálculo é alterado antes da decisão 3.
