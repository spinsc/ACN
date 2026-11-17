# PLANO — Entrega por fornecedor (cada fornecedor com a sua data, o seu recebimento e o seu alerta)

Pedido do usuário em 17/11/2026: *"Em Compras, quando efetivar a compra de um pedido e informar a data de entrega, poder informar a data de entrega de cada fornecedor e não uma data só para todo o pedido; cada fornecedor ou cotação tem a sua data de entrega."* Depois das três perguntas da mesma data, ele ampliou: **tratar cada data como sua — para recebimento, card da OP, calendário, atrasos e o resto —, "alterar o sistema todo para que possamos ter dados reais de quando chega o que".**

## Decisões do usuário (17/11/2026)

| Pergunta | Resposta |
|---|---|
| Como o sistema usa as datas de cada fornecedor | **Cada data é do seu fornecedor em tudo**: recebimento, card da OP, calendário, atraso, relatórios. Nada de "a data do pedido" quando o pedido tem mais de um fornecedor |
| Recebimento | **Por fornecedor.** A Logística recebe e confere cada fornecedor separado; o pedido só vira "Recebido" quando todos foram recebidos |
| Envio × coleta | **Só a data é por fornecedor.** "Como a mercadoria chega" (o fornecedor envia ou o Compras coleta) e o registro da coleta continuam um só para o pedido |

## O que existe hoje (medido em 17/11/2026)

- Um pedido de compra tem **uma** data (`pcp_pedidos_compra.data_prevista_recebimento`), preenchida na janela "Confirmar compra" (`ModalConfirmarCompra`, `ComprasFluxo.tsx`).
- Um pedido pode ter **mais de um fornecedor vencedor** (`vencedoras`: lista de `{cotacao_id, fornecedor, valor, itens: [posições]}`; `fornecedor` guarda "A + B"). No banco: 14 dos 183 pedidos com compra feita têm mais de uma vencedora (4 ainda em "Comprado").
- Quem lê a data única: o alerta de entrega atrasada (`calcularAlertasCompras`, marca `alerta_entrega_mencionado_em`), a lista e a janela de recebimento da Logística (`PainelRecebimento`, `ModalReceberPedido`: uma NF, uma data real e uma quantidade para o pedido todo), o card da OP (`AcnTabShared`), as pendências da OP (`OpPendencias`), a espera de material do Desenvolvimento (`EsperaDeMaterial`, `engenharia_item_chegou`), o Calendário (`calendario_eventos_base`, ramo 10), o card do CRM, Minhas Solicitações, o relatório de Compras, a conciliação bancária e a OC impressa.
- Recebimento fecha o pedido: `status_compra = 'Recebido'`, libera o faturamento (`pcp_pedidos_faturamento`), credita o estoque (reposição) e grava um manifesto de Logística.

## Desenho

**Uma linha por fornecedor num pedido comprado: a tabela `compras_entregas`.**

| Coluna | Para quê |
|---|---|
| `pedido_id`, `cotacao_id`, `fornecedor` | de quem é a entrega (a vencedora; pedido sem cotação = uma linha só, sem `cotacao_id`) |
| `itens` (posições) | quais itens do pedido esse fornecedor entrega (vazio = o pedido todo) |
| `data_prevista` | a data de entrega **daquele fornecedor** |
| `situacao` | `aguardando`, `divergencia` ou `recebida` |
| `numero_nf`, `data_recebimento_real`, `quantidade_recebida`, `observacoes`, `recebida_em`, `recebida_por` | o recebimento real daquela entrega |
| `alerta_mencionado_em` | o aviso de atraso, um por entrega |

- Política `etapa17_logado` (como o resto do Compras; sem valor: o valor continua na vencedora do pedido).
- **Pedido antigo (comprado antes desta mudança) não é regravado.** A tela e as regras tratam o pedido sem linhas como **uma entrega só**, montada na hora a partir das colunas do pedido (entrega "virtual"): nada de dado real mexido, e o recebimento antigo segue gravando no pedido.
- O campo `data_prevista_recebimento` do pedido **continua existindo** como a data mais distante das entregas ainda abertas (a data em que o pedido fica completo): serve só às telas que ainda mostram um valor único e às que não foram migradas; **toda tela migrada mostra uma data por fornecedor**.
- `pcp_pedidos_compra.status_compra` vira "Recebido" quando nenhuma entrega está aberta; o faturamento é liberado nessa hora (o Financeiro continua vendo o pedido, não a entrega: ideia de pagar por fornecedor fica de fora).
- Divergência é por entrega (a demanda `[DIVERGÊNCIA NO RECEBIMENTO]` diz o fornecedor); o pedido continua "Comprado" enquanto houver divergência aberta.

## Etapas (cada uma vai para produção sozinha)

| Etapa | O que entrega | Estado |
|---|---|---|
| **E1 — Datas na compra** | tabela `compras_entregas`; regras em `ComprasEntregas.ts` (entrega virtual do pedido antigo, esperado por entrega, data mais distante); a janela "Confirmar compra" pede **uma data por fornecedor** (pedido de um fornecedor só: igual a hoje); "Alterar prazo de entrega" escolhe o fornecedor; a OC impressa e os quadros do Compras listam fornecedor e data; o recebimento ainda é do pedido inteiro e, ao receber, marca todas as entregas como recebidas (a ponte caiu na E2) | ✅ 17/11/2026, publicada |
| **E2 — Recebimento por fornecedor** | a lista da Logística tem uma linha por fornecedor, cada uma com a sua data e o selo "atrasado"; a janela de recebimento recebe UMA entrega (NF, data real, quantidade esperada pelos itens do fornecedor, conferência); o pedido só vira "Recebido" com todas recebidas; estoque, faturamento, manifesto e divergência por entrega; arrastar para "Recebido" no quadro do Compras pergunta qual fornecedor | ✅ 17/11/2026 |
| **E3 — Atrasos e Calendário** | alerta de entrega atrasada e aviso na caixa de Menções **por fornecedor** (`alerta_mencionado_em` da entrega); Calendário com um evento por entrega (função do banco, com ensaio de custo) e o aviso do calendário abrindo o pedido | ⬜ |
| **E4 — O resto do sistema** | card da OP e pendências da OP (cada entrega com a sua data e a situação), espera de material do Desenvolvimento (o item chega quando a entrega do fornecedor dele é recebida), card do CRM, Minhas Solicitações, relatório de Compras e conciliação bancária | ⬜ |

## Suposições a confirmar (escolhi o caminho mais conservador)

1. **Faturamento por pedido:** o pagamento ao fornecedor continua liberado quando o pedido inteiro foi recebido (não por entrega).
2. **Coleta:** o registro "coletado" é do pedido; num pedido de coleta com dois fornecedores, cada um tem o seu dia, mas a coleta se registra uma vez para o pedido todo. Se isso incomodar, a coleta por fornecedor é a evolução natural.
3. **Quantidade esperada de cada fornecedor** = soma da quantidade comprada dos itens que ele vence (a Mesa de Cotações já diz quais itens são de quem).
4. **Pedido de um fornecedor só** (a maioria) não muda nada na tela: continua uma data, com o nome do fornecedor.

## E1 — o que foi feito (17/11/2026)

- **Banco:** tabela `compras_entregas` (uma linha por fornecedor vencedor do pedido comprado: `pedido_id`, `cotacao_id`, `fornecedor`, `itens` = posições do pedido, `data_prevista`, `situacao` aguardando/divergencia/recebida, NF, dia, quem e quando recebeu, `alerta_mencionado_em`), RLS ligada e política `etapa17_logado` com `(select esta_logado())`, três índices; `supabase/sql/compras_entregas.sql` (e `_reverter.sql`, que recusa se houver linhas). Conferido no banco: 0 linhas, a chave pública não lê, quem entrou lê.
- **Regras (`ComprasEntregas.ts`):** pedido sem linhas vale como entrega virtual (uma por vencedora; com uma vencedora só, a do próprio pedido); a primeira correção de data de um pedido antigo de vários fornecedores cria as linhas de TODOS; `data_prevista_recebimento` do pedido continua como a data mais distante das entregas abertas (as telas ainda não migradas seguem lendo um valor só). **As posições dos itens nas vencedoras são 0-based** (conferido nos pedidos reais: PC-00089, PC-00109, PC-00156).
- **Telas:** a janela "Confirmar compra" pede uma data por fornecedor (pedido de um fornecedor só: igual a antes, uma data, com o texto de sempre no histórico); "Alterar prazo de entrega" mostra uma data por fornecedor com entrega aberta, grava só o que mudou (com a data de antes no histórico e na auditoria); tabela e cartão do Compras listam fornecedor e data (atrasada em vermelho); o Resumo do pedido tem o quadro "Entrega por fornecedor" com os itens de cada um; as Coletas mostram a data de cada fornecedor (a coleta em si continua sendo do pedido); a solicitação e a Ordem de Compra impressas dizem a data de cada fornecedor (a janela abre já no clique e, se a leitura das entregas falhar, nada é impresso: o papel do fornecedor não sai com a data errada).
- **Ponte do recebimento (até a E2):** receber o pedido na Logística (janela Receber ou "+ Novo Registro" com NF conferida) marca todas as entregas abertas como recebidas (NF, dia, quem e quando) ou com divergência; "Voltar para Comprado" de um pedido Recebido reabre as entregas (senão a compra refeita seria recusada). A quantidade recebida fica só no pedido.
- **Testes (gravações bloqueadas, Chrome headless):** 37 conferências no desktop e as mesmas 37 a 390 px, mais 16 da ponte do recebimento (recebimento conferido, com divergência e reprocesso); pedidos reais PC-00089 (3 fornecedores), PC-00109/PC-00156 (2) e PC-00238 (1); o pedido aprovado com dois fornecedores foi montado na tela (o banco real não tem). `vite build` verde. Os 9 px a mais de largura da página no celular são do botão do usuário no topo (anotado no CLAUDE.md), não desta tela.
- **Ficou de fora (é das próximas etapas):** recebimento por fornecedor (E2), alerta e calendário por fornecedor (E3), card da OP, pendências, espera de material, CRM, Minhas Solicitações, relatório, conciliação e busca/ordem (E4). Até lá essas telas leem a data mais distante do pedido.

## E2 — o que foi feito (17/11/2026)

Sem migração de banco: a tabela `compras_entregas` da E1 já tinha tudo (situação, NF, dia, quantidade, quem e quando recebeu).

- **Regras (`ComprasEntregas.ts`):** saiu a "ponte" da E1 (`registrarRecebimentoNasEntregas`: receber o pedido marcava todas as entregas). Entraram `receberEntrega` (recebe UM fornecedor; conferida = a entrega fica "recebida", com divergência = "divergencia", que continua aberta e pode ser recebida de novo; **quem diz se o pedido está completo é o banco, relido logo depois de marcar**, não a tela), `fechamentoDoPedido` (pura: o que o pedido guarda depois do recebimento — as NFs de todos juntas "A / B", o último dia, a soma recebida, a divergência de qualquer um, quem ainda falta e a data mais distante das abertas), `atualizarPedidoAposRecebimento` (grava no pedido; **só vira "Recebido"** — com `data_conclusao` — quando NENHUMA entrega está aberta; senão o pedido segue Comprado e a data dele passa a ser a mais distante das que faltam; só grava se o pedido ainda está em Comprado) e `fornecedoresJaRecebidos`.
- **Janela e lista da Logística (`LogisticaTab.tsx`):** a aba "Aguardando Recebimento" tem **uma linha por fornecedor** com a sua data (selo "atrasado" por entrega) e o botão Receber de cada um; a janela recebe UMA entrega (fornecedor no alto, quantidade esperada = a dos itens dele, NF, dia real, conferência ou divergência) e avisa, no último fornecedor, que o pedido vira "Recebido". O estoque entra por entrega (`creditarCompraRecebida` com a quantidade do fornecedor), o manifesto sai no nome do fornecedor, e o faturamento só é liberado quando o pedido fecha. Pedido de um fornecedor só: igual a antes (a janela não ganha quadro nem pergunta, e **a observação do recebimento só vai para o pedido quando ele tem um fornecedor só**; com vários fica na entrega de cada um). Pedido antigo sem linhas e com um fornecedor: recebe como sempre, sem criar linha; com vários: as linhas de TODOS nascem no primeiro recebimento. Nas linhas de vários fornecedores a descrição é o nome do pedido sem a lista de todos os itens (cada fornecedor mostra os seus).
- **Segurança de gravação:** recebimento de quem já foi recebido por outra pessoa é recusado (`.neq('situacao','recebida')` + conferência da linha devolvida, e uma leitura nova antes de gravar na janela: o aviso diz que outra pessoa já recebeu e nada é salvo); **leitura das entregas recusada nunca vale como "sem entregas"** (faixa vermelha, botão Receber desligado em todas as linhas, confirmação desligada).
- **Compras (`ComprasTab.tsx`, `ComprasFluxo.tsx`):** arrastar o cartão para "Recebido" abre a janela com a escolha do fornecedor quando há mais de um aberto; o histórico diz qual fornecedor foi recebido e quem ainda falta, ou "Recebimento do último fornecedor registrado e conferido". **Voltar a etapa (Comprado → Aprovado) e descartar um pedido em que um fornecedor JÁ foi recebido são barrados** com a lista de quem entrou (o material já está no estoque) — **decisão minha, a confirmar**. "+ Novo Registro" de recebimento ligado a pedido com mais de um fornecedor aberto é recusado antes de subir foto ou gravar manifesto (o recebimento é feito pela aba "Aguardando Recebimento").
- **Testes (gravações bloqueadas, Chrome headless, conta ZZTESTE):** `entrega_fornecedor_e2.cjs`, 10 cenas e 70 conferências no desktop e as mesmas 70 a 390 px — lista com uma linha por fornecedor; receber o primeiro (pedido segue Comprado, NF e datas certas); divergência (continua aberta e recebe de novo); o último fornecedor fecha o pedido (Recebido, faturamento liberado, NFs juntas); arrastar no Compras pergunta o fornecedor; voltar a etapa e descartar barrados; "+ Novo Registro" de vários fornecedores recusado; recebimento disputado (nada gravado); leitura recusada (faixa vermelha, tudo desligado); pedido de um fornecedor só (PC-00257), com e sem linha (nenhuma linha criada, o pedido recebe a observação, igual a antes). **Regressão da E1: 37 conferências, 0 falhas.** O teste da ponte (`entrega_fornecedor_e1_ponte.cjs`) ficou obsoleto: a ponte saiu e a E2 o substitui. `vite build` verde.
- **Ficou de fora (é das próximas etapas):** alerta de atraso e aviso em Menções por fornecedor e o Calendário (E3); card da OP, pendências, espera de material, CRM, Minhas Solicitações, relatório, conciliação e busca/ordem (E4). Até lá essas telas leem a data mais distante das entregas ainda abertas. A coleta continua sendo registrada uma vez para o pedido todo (suposição 2).
