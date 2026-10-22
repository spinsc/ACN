# Plano — O Telecom separa, serializa e embala o que é de rádio (pedido do usuário em 22/10/2026)

**Pedido (nas palavras do usuário):** *"Quando uma OP for projeto de rádio e o fluxo foi venda para envio, quem separa, põe o serial e passa para cotação de frete é o setor de Telecom. Se na venda tiver rádio e acessórios de rádio para envio, mas também itens de adaptação de carro, se tem uma venda composta: material de adaptação é o Almoxarifado que separa e embala, e rádio e itens de rádio o Telecom que separa e embala. Para esse processo no Telecom, segue o mesmo do Almoxarifado, só não há, por enquanto, estoque."*

## Decisões do usuário (22/10/2026, em janela)

| Pergunta | Resposta |
|---|---|
| Como o sistema sabe o que é item de rádio? | **Campo no Cadastro de itens + ajuste na venda**: cada item do cadastro ganha "Quem separa" (Almoxarifado ou Telecom); ao gerar a OP a linha já vem com o setor do cadastro e o vendedor pode trocar; linha digitada à mão, ou vinda da formação de preços sem item do cadastro, vem como Almoxarifado e o vendedor marca as de rádio. **Numa OP do tipo Rádio em envio, todas as linhas vão para o Telecom automaticamente.** |
| Venda composta (rádio + adaptação na mesma OP): como anda? | **Uma OP, duas separações, um SÓ frete**: os dois setores separam e embalam o que é seu; o frete é um só, aberto quando o ÚLTIMO setor terminar (as duas caixas seguem juntas para o mesmo destino). |

## Como funciona (regra única: `SeparacaoEnvio.ts`)

- O "setor que separa" **não é um dado gravado na OP**: sai do tipo de projeto e do fluxo de entrega (e, na fatia T2, das linhas vendidas). Por isso a OP que já esperava no Almoxarifado aparece sozinha no Telecom, sem migrar nenhuma linha.
- `setorDaSeparacao(op)`: **tipo Rádio + fluxo "envio de material" → Telecom**; todo o resto → Almoxarifado (inclusive o tipo "Venda para Envio": ele só passa a ir ao Telecom, no todo ou em parte, pelas LINHAS vendidas, na fatia T2). Rádio com adaptação na matriz/externa, com envio para adaptação de terceiro ou com fabricação da serralheria **continua no Almoxarifado**.
- A tela é a **mesma do Almoxarifado** (`AlmoxarifadoTab` com `setor="Telecom"`): mesma fila, mesmo checklist de separação (quando a OP tem BOM), seriais, embalagem (peso, volumes, três medidas, CEP, CIF/FOB, endereço), cotação de frete para a Logística, "falta de material", "liberar com pendência", "devolver". **Sem estoque:** nada dá baixa, nada é reservado, a tela não mostra painel de estoque, fabricação pronta, reposição nem as demandas do Almoxarifado (as do Telecom ficam na aba "Análises e demandas").
- A OP **segue com os mesmos status** (`Aguardando Almox` → `Aguardando Cotacao Frete` / liberação comercial); só o nome do setor muda onde a OP aparece ("Onde está agora", barra de progresso, selo do card do CRM, dossiê) e o que o histórico escreve (`setor: Telecom`, evento "Separação: …" no lugar de "Kiting: …", módulo `telecom` no histórico de alterações). As colunas `status_almox`, `obs_almox`, `responsavel_almox` e `data_kiting` servem aos dois setores (o nome "almox" é histórico).

## Fatias

### T1 — OP de rádio em envio é do Telecom ✅ (22/10/2026)

- **Feito:** `src/SeparacaoEnvio.ts` (a regra), `src/TelecomTab.tsx` (a tela do setor ganhou duas abas: **"Separação e envio"**, com o número de OPs esperando, e **"Análises e demandas"**, que é a tela de sempre; abre na separação quando há OP esperando), `AlmoxarifadoTab.tsx` (propriedade `setor`; cada fila mostra só as suas OPs; Telecom sem estoque; textos, histórico e módulo em nome do setor; devolver só ao PCP), `EtapasOp.ts`/`OndeEstaAgora.tsx`/`AcnTabShared.tsx`/`OpDossie.tsx`/`OpDossieLote.tsx`/`CrmTab.tsx` ("onde está" diz Telecom), `OpItens.tsx` (`ConferenciaKit` com `semEstoque`: o rodapé não promete baixa), `DevolverOp.tsx` (módulo `telecom`), `DashboardTab.tsx` (a aba Telecom abre a nova tela).
- **Testes:** regras puras **20 de 20** (`unit_telecom.ts`: 7 combinações de rádio × fluxo, venda para envio, OP vazia, e a etapa "onde está" com e sem OP); navegador **39 de 39** com o crachá real e as OPs inventadas (`spec_telecom1.cjs`): o Almoxarifado deixa de listar a OP de rádio em envio e mantém as demais, estoque e reposição; o Telecom lista só ela, com as mesmas ações, sem painel de estoque, e a aba de análises segue igual; a embalagem do Telecom cobra a separação, grava OP, frete (peso e medidas), histórico, recado e módulo **em nome do Telecom, com ZERO movimentação de estoque ou reserva**; o Almoxarifado, na mesma embalagem, **continua dando baixa de estoque** e escrevendo "Almoxarifado/Kiting"; devolver (só ao PCP, mesmo com falta de material marcada) e falta de material em nome do Telecom. **Defeitos plantados: 4** (fila sem filtro, baixa de estoque no Telecom, histórico sempre "Almoxarifado", devolução com "refazer o kiting") — **os 4 foram apontados** (o 4º só depois de eu acrescentar uma OP com falta de material marcada: sem ela a devolução já caía só no PCP e o teste não o via). Varredura das 32 telas do menu: nenhum pedido recusado. `npx vite build` ok.
- **Ficou de fora de propósito:** **serial por produto** no Telecom (hoje é o campo de texto "Números de série", como o Almoxarifado faz para OP que não é "Venda para Envio"; o serial por produto vem na T2, quando a venda tiver linhas de rádio); contador de OPs do Telecom no painel do Dashboard; ajuste do texto dos filtros do PCP ("aguardando o Almoxarifado") para OP de rádio em envio.

### T2 — Quem separa cada linha vendida ⬜

- Campo **"Quem separa"** (Almoxarifado/Telecom) no Cadastro de itens (coluna nova `cadastro_itens.setor_separacao`; vazio = Almoxarifado).
- Coluna **"Quem separa"** nas linhas vendidas da OP (`itens_vendidos[].setor`): vem do cadastro e o vendedor troca; na OP de tipo Rádio em envio tudo é Telecom; ao editar a venda na OP o campo também aparece.
- `setorDaSeparacao` passa a olhar as linhas: OP de "Venda para Envio" **só com linhas de rádio** vai inteira ao Telecom, com **serial por produto**.
- Pergunta a fazer ao usuário antes: o que fazer com as OPs de Venda para Envio que **já estão na fila** do Almoxarifado (20 abertas, sem a marca nas linhas) — a sugestão é nada mudar nelas.

### T3 — Venda composta: duas separações, um só frete ⬜

- Uma OP com linhas dos dois setores aparece **nas duas filas**, cada uma só com as suas linhas; cada setor separa, põe serial e embala o que é seu.
- O estado de cada parte fica em `oples.envio_partes` (coluna nova, `jsonb`: por setor, status, seriais, peso, volumes, medidas, quem e quando). O setor que termina primeiro **guarda a sua parte** e a OP some da fila dele ("aguardando o outro setor"); **quando o último termina, nasce o frete único** (peso e volumes somados; as medidas de cada caixa vão descritas na observação) e a OP segue como hoje.
- A conferir com o usuário na hora: se o frete único leva as medidas da maior caixa ou das duas descritas; e o que acontece se um dos dois setores devolver a OP.

## Suposições registradas (a confirmar)

1. **Só o "envio de material" vai ao Telecom**; rádio com envio para adaptação de terceiro fica no Almoxarifado.
2. **Devolver:** o Telecom só devolve ao PCP (não há "kit a refazer").
3. **Avisos de WhatsApp** (falta de material, liberar com pendência) seguem os mesmos eventos e destinatários configurados no Admin; o texto cita a OP, não o setor.
4. Quem trabalha no Telecom precisa da aba **Telecom** liberada; a conta de cada pessoa não muda.
