# Envio parcial com kit incompleto e complemento (pedido do usuário em 29/10/2026) — CONSTRUÍDO em 03/11/2026 (E1, E2 e E3)

**O caso (OP A1562.2610, "Venda para Envio", 73 kits, pelo correio):** o cliente recebe em levas (25 / 25 / 23). Os primeiros 25 kits já saíram, **sem alguns itens**, que seguem depois.
Até esta entrega o sistema só sabia enviar **unidades completas** em remessas (`op_remessas`, `Remessas.ts`, janela "EMBALAR" do Almoxarifado): a remessa dizia quantas unidades saíram, nunca o que ficou faltando em cada kit.

## Decisões do usuário (29/10/2026, e as respostas de 03/11/2026)
1. **Remessa com itens faltando + complemento depois.** A remessa registra os kits que saíram e **quais itens (e quantas unidades de cada) ficaram faltando**. Depois se registra o **complemento**: os itens que saíram em separado, com data e rastreio. A OP só fecha o envio com kits e itens completos.
2. **Os 25 já enviados:** registro **retroativo** pela tela do Almoxarifado, depois de o PCP montar a BOM e liberar (a OP está em "Em Espera PCP", sem BOM, sem remessa). O sistema aceita **data de envio passada** e **itens faltando**.
3. **A falta é dita POR KIT** (decidido em 03/11/2026): "falta 1 cabo em cada kit"; o total da remessa é "por kit × kits da remessa".
4. **A lista de onde escolher os itens faltando é a BOM liberada pelo PCP** (e "Outro item" digitado à mão, para o que não está na BOM ou enquanto ela não existe).
5. **Rastreio e nota próprios, ambos opcionais**, em cada remessa e em cada complemento.
6. **Qualquer remessa pode ter item faltando** (não só a primeira).

## O que foi feito

### E1 — Remessa com data real, rastreio e itens faltando ✅ (03/11/2026)
- Colunas novas em `op_remessas`: `data_envio` (date), `rastreio` (text), `faltando` (jsonb: `[{ item_id, nome, codigo, por_kit, unidades }]`, `unidades` = `por_kit` × kits da remessa). Gatilho `op_remessas_conferir_data_envio`: data futura é recusada (dia de Brasília). **Remessas antigas não foram regravadas**: `data_envio` nula = vale o dia de `criado_em` (`dataDaRemessa`).
- Janela "EMBALAR" (quadro "Remessa N"): **Dia em que a remessa saiu** (vem com hoje; passada vale; futura é recusada na tela e no banco), **Rastreio** e **"Algum item ficou faltando nos kits desta remessa?"** (escolhe da BOM ou "Outro item"; quanto falta em cada kit; mostra o total). A lista de remessas anteriores mostra o dia real, o rastreio e **"faltam: …"** em vermelho.
- Qualquer um destes — item faltando, data passada, rastreio — faz a venda virar remessa (é ela que guarda), mesmo enviando o saldo inteiro.
- **Remessa que já saiu (data anterior a hoje)** é registrada **sem pedido de frete** para a Logística (não há o que cotar), com pergunta de confirmação antes. A OP não fica esperando uma cotação que não vai existir. `frete_responsavel` continua gravado como escolhido.

### E2 — Complemento ✅ (03/11/2026)
- Tabela `op_remessa_complementos` (`remessa_id`, `opl_id`, `itens`, `data_envio`, `rastreio`, `nf_numero`, `observacoes`, quem/quando, `cancelado` + motivo; RLS com a política `etapa17_logado`; sem direito para a chave pública). Mesmo gatilho de data futura.
- Janela `ComplementoDeRemessa.tsx` ("REGISTRAR COMPLEMENTO" na fila, ou clique no selo vermelho "Falta enviar"): escolhe a remessa (quando há mais de uma com pendência), as quantidades vêm **com tudo o que falta** e dá para baixar; dia (hoje por padrão), rastreio, nota, observações. **Quantidade acima do pendente é recusada** e o pendente é **conferido de novo no banco na hora de gravar** (outra pessoa pode ter registrado antes). Cada complemento vai ao histórico da OP, ao acompanhamento e à caixa de Menções de quem acompanha.
- O **pendente da remessa = `faltando` − complementos não cancelados** (`pendenteDaRemessa`, `pendenteDaOp`, em `Remessas.ts`). **Nada se apaga:** "Cancelar complemento" (motivo obrigatório) devolve os itens ao pendente. Remessa com complemento registrado **não pode ser cancelada** antes de cancelar o complemento.

### E3 — A OP só sai da fila com tudo completo ✅ (03/11/2026)
- Remessa com item faltando (ou com pendência de remessa anterior) **não leva a OP** para a cotação de frete / liberação comercial, mesmo saindo todas as unidades: a OP fica na fila do Almoxarifado, com a faixa vermelha na janela explicando.
- Na fila: selo vermelho **"Falta enviar: remessa 1: 25 × CABO USB, … · há N dia(s)"** e, quando só resta o complemento (todas as unidades já saíram), o botão vira **"REGISTRAR COMPLEMENTO"** no lugar de "EMBALAR".
- O **último complemento** fecha a OP: não nasce frete novo (cada remessa já tem o seu); se algum frete ainda não saiu a OP espera por ele em "Aguardando Cotacao Frete", senão vai para a liberação comercial.
- **Prazo de alerta: 7 dias** com item pendente (`PRAZO_PENDENCIA_ENVIO_DIAS`, **confirmado pelo usuário em 03/11/2026**): passou, o selo acrescenta "— ATRASADO".

## Testes (03/11/2026)
`npx vite build` verde; navegador com gravações bloqueadas (`scratchpad/fstest/teste_envio_parcial.cjs`, 5 cenários): remessa de 5 kits com falta de 1 cabo por kit e rastreio (a OP **não** muda de etapa, o frete da remessa nasce); remessa de data passada (confirmação, **sem** `pcp_fretes`); data futura recusada; fila com "Falta enviar … ATRASADO" e botão "REGISTRAR COMPLEMENTO"; complemento total (a OP vai a "Aguardando Liberacao Comercial"); complemento acima do pendente recusado e complemento parcial (a OP continua).

## Fica para depois / limites conhecidos
- **O uso real:** a OP A1562.2610 segue em "Em Espera PCP". Quando o PCP liberar a BOM, o Almoxarifado registra a remessa 1 (25 kits) com a **data real passada** e os itens que ficaram faltando; nada foi gravado nessa OP.
- **Aviso automático** para quem acompanha ao passar do prazo: hoje só o selo "ATRASADO" na fila (um aviso na caixa de Menções pediria uma rotina agendada no banco, como a do frete sem entrega).
- Nota fiscal por remessa/complemento no Fiscal (o número é só anotado); frete do complemento (hoje, um pedido de frete por remessa, e o complemento não abre frete); qualquer mudança na comissão (continua só com a OP inteira faturada).
- Cancelar uma remessa que já tem complemento exige cancelar o complemento antes (feito de propósito).
