# Vendas do Telecom — comercial enxuto para o setor privado (pedido do usuário em 03/11/2026)

**O pedido:** uma contratação nova, para **vender ao setor privado** (shoppings, condomínios, empresas; **cliente final por enquanto**, sem representações), **só com itens de telecom**. O usuário pediu uma aba **dentro do Telecom**, "como um comercial/CRM mais enxuto", com **um operador** que abre as vendas.

## Decisões do usuário (03/11/2026)
1. **Mesmos cards do CRM, sem funil nem tabela própria.** O card é de `crm_oportunidades` (funil `venda_direta`) com a marca `setor_venda = 'telecom'`; o Comercial vê tudo no CRM; Formação de Preços e Nova OP continuam ligadas ao card; cliente e histórico não se duplicam. Os 232 cards antigos **não foram mexidos** (marca nula).
2. **Escopo: do contato à venda fechada** — registra o contato, cota pela Formação de Preços, acompanha as etapas, marca ganho/perdido e **gera a OP** (o usuário confirmou em 03/11/2026: "as vendas dessa aba também vão gerar OP"). **Sem agenda de visitas e sem GPS** (a ideia dos "vendedores externos" da conversa compartilhada ficou de fora).
3. **Etapas com nome de venda privada sobre as mesmas etapas do CRM** (o banco não muda): Lead (Estimativa, Lead) → Proposta enviada (Enviado, Aguardando empenho) → Pedido fechado (Empenhado) → Faturado; Perdido (Perdido, Desistência). Não existe etapa "Negociação": o operador anota a negociação no andamento do card.
4. **Representações:** inicialmente só cliente final.
5. **A OP nasce pela janela Nova OP preenchida** (e não pela criação automática do CRM, que quase sempre devolveria a OP ao Comercial por falta de tipo, fluxo e frete), **como Rádio em envio de material** (decidido em 03/11/2026).

## Fatias
### Fatia 1 — a marca e a aba Vendas ✅ (03/11/2026)
- Coluna `crm_oportunidades.setor_venda` (texto, só aceita `'telecom'` ou nulo; índice parcial) — `supabase/sql/crm_oportunidades_setor_venda.sql`.
- `VendasTelecom.ts` (regras, sem tela): colunas, `colunaDoTipo`, `movimentosDoTipo`, `erroDoCard` (cliente, assunto e o **contato obrigatório** do CRM; perdido/desistido não pede), `payloadDoCardNovo`, `erroDoEnvioDaProposta`, `contatoAtrasado`.
- `VendasTelecomTab.tsx` + `.acn-vtel-*` em `design.css`: quadro e lista, busca sem acento, **Novo contato** (nasce em Lead, no funil de venda direta, com o operador como responsável), janela do contato com **andamento** (mesma tabela `crm_historico` do CRM), **Enviar proposta** (a mesma exigência do CRM: PV de 4 dígitos sem repetir, só gerente troca PV já atribuído, temperatura, próximo contato; cria o compromisso na agenda do Comercial e a linha no histórico), **Registrar perda** e **O cliente desistiu** (motivo obrigatório), **Reativar contato** (desistência) e **Abrir no CRM**. Toda gravação de etapa confere a etapa de antes. Contato combinado que já passou = alerta vermelho.
- `TelecomTab.tsx`: terceira aba "Vendas"; quem já clicou numa aba **não é mais levado à separação** quando a contagem de OPs chega (antes o clique em "Vendas" nos primeiros segundos seria desfeito).
- **Pedido fechado e faturado ficam no CRM** (o card ganho abre a OP pela janela "Vencido"; o faturado exige as OPs faturadas): o operador só vê o card e tem o atalho "Abrir no CRM".
- Teste de navegador com gravações bloqueadas (`scratchpad/fstest/teste_vendas_telecom.cjs`): 33 verificações, todas OK (cinco colunas e contagens, resumo e alerta vermelho, lista, busca, contato novo com as validações e o corpo gravado, andamento, "Gravar" sem mexer na etapa, envio de proposta com PV/guarda/agenda/histórico, perda, desistência e reativar, "Abrir no CRM" sem a aba, e só as tabelas esperadas receberam gravação). Fotos conferidas no computador e no celular (400 px, sem rolagem lateral da página).

### Fatia 2 — fechamento e OP ✅ (03/11/2026) e cotação ✅ (04/11/2026)
- **Correção da Fatia 1:** o valor estimado ia para `valor_acn` (a parte da ACN em venda com parceiro/Detech); o do CRM é `valor_registrado` (aparece no card, soma no funil e vai para a OP). Corrigido antes de existir qualquer card marcado (0 no banco); `VendasTelecom.ts` e a tela leem e gravam `valor_registrado`.
- **Pedido fechado** (menu do card em Proposta enviada): escolhe a empresa que fatura (ACN ou Detech; vem do card), leva o card a Empenhado com `empresa_vencedora`, só se ele ainda está na etapa de antes, e anota no histórico. Exige o PV (a OP é numerada por ele; o PV nasce no "Enviar proposta").
- **Lançar OP:** logo depois de fechar, abre a `NovaOpOsModal` com o card, o PV, a empresa e os itens da formação, e com **tipo Rádio e fluxo envio de material** já escolhidos (prop nova `padroes`, que vale por cima dos dados do card e não muda nada para quem não a passa). Fechar a janela sem salvar deixa o card em Pedido fechado com o selo vermelho **"Sem OP"** e o menu oferece "Lançar OP" (pergunta antes se já houver OP). O passo 2 da Nova OP (anexar documentos) aparece normalmente. OP criada aparece como selo "OP A1234.2611" no card.
- Teste de navegador (gravações bloqueadas): 42 verificações OK, incluindo o corpo gravado, a guarda da etapa, a janela Nova OP aberta com Radio, envio de material, PV 7777, Detech e "D7777.2611".
- **Cotação pela Formação de Preços (04/11/2026):** do card (Lead, Proposta enviada e Pedido fechado) o menu abre **"Fazer a cotação"** (ou "Cotação (Formação de Preços)" quando já existe), numa janela grande com a `FormacaoPrecosTab` embutida e ligada ao card (`vinculo = {tipo:'crm', id}`, a mesma ligação `cotacoes_precos.crm_oportunidade_id` que o CRM usa); o card mostra o selo **"Cotação (N versões)"**, que também abre a janela. A janela **só fecha pelo botão Fechar** (clicar fora não fecha, para não perder formação não salva) e ao fechar o quadro é relido.
- **Limite a saber:** a ideia era restringir aos itens de telecom, mas o Cadastro de itens **não tem marca de telecom** (nenhum dos 4.429 itens ativos tem setor de separação nem categoria de telecom); por isso o catálogo é o inteiro. Para limitar é preciso antes marcar os itens (decisão do usuário).
- Teste de navegador (gravações bloqueadas): 48 verificações OK, incluindo o selo com 2 versões, o texto do menu com e sem formação, a janela aberta com a Formação embutida, clicar fora sem fechar e Fechar sem gravar nada. Fotografia conferida.

### Fatia 3 — acompanhamento do operador ⬜
- "Retornos de hoje" e cards parados há muitos dias (mesmo critério do CRM, `dias_lead_esquecido`), motivo de perda em relatório, @menção no andamento (o CRM usa `salvarMencoes`).

## O que ficou de fora / a saber
- **Quem é o operador:** ainda **não existe usuário** com esse papel. Hoje têm a aba Telecom a Thallita (Gerente Comercial), o Max e os administradores. O operador novo precisa ser cadastrado no Admin com a aba **Telecom** (e **CRM**, se for abrir o card por lá).
- **O banco ainda não separa por aba/perfil** (Etapa 17): a tela mostra só os cards do Telecom, mas quem entrou lê todos os cards pelo banco. Vale saber antes de pôr alguém novo.
- O **`CrmTab.tsx` não foi tocado** (ainda não migrado para o design system: fatias 12e40/12e41 do plano de UX). A aba nova nasceu no padrão novo.
- Faturamento da venda: o card nasce com `faturamento_empresa = 'ACN'` e `tipo_negocio = 'Venda'` (como o CRM); **a empresa de verdade é escolhida em "Pedido fechado"** (ACN ou Detech).
- A janela Nova OP mostra o quadro "Fotos do carro" mesmo para rádio em envio (comportamento que já existia no modal; não mexi).
