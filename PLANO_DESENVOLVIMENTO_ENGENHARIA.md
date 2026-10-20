# Plano — Desenvolvimento de produto na Engenharia

> Pedido do usuário em 19/10/2026: "todas as etapas do desenvolvimento são iguais e têm as mesmas features; os processos
> estão certos, mas precisava ser algo mais concreto para um desenvolvimento de engenharia". Retomado pelo próprio
> `PLANO_DESENVOLVIMENTO_ENGENHARIA.md`: abrir este arquivo e seguir a próxima etapa não feita (quadro no fim).
>
> **Tela:** Engenharia > Desenvolvimento (`src/DesenvolvimentoPecasTab.tsx`). O pedido do PCP
> (`PedidoDesenvolvimentoPcp.tsx`, itens em `engenharia_desenvolvimento_itens`) **não muda**: ele tem o andamento dos itens
> e nunca teve as 8 etapas.

---

## 1. Como a tela é hoje (medido em 19/10/2026, só leitura)

- 4 demandas, todas manuais; nenhuma passou da 3ª etapa (Desenvolvimento); só 2 observações no total; uma demanda tem 13 anexos
  soltos. O conteúdo real do trabalho está em anexos sem nome de entregável.
- As 8 etapas (`Concepção, Criação, Desenvolvimento, Prototipagem, Validação, Produção, Acabamento, Entrega`) usam o mesmo painel:
  responsável + data prevista + iniciar, observação, concluir. Não há entregável, critério para passar, revisão do projeto,
  teste, custo, nem ligação com catálogo, lista de materiais ou estrutura de instalação.
- A tela ainda está no estilo antigo (51 `style` soltos): **pela regra de dia/noite, a fatia dela no `/ux-fluxo` (achados 7.x +
  migração) vem antes de qualquer função nova.** Não é um dos quatro arquivos grandes, então não precisa perguntar.

## 2. O que a pesquisa trouxe (e o que dela vira regra aqui)

| Fonte | Ideia | Vira |
|---|---|---|
| Stage-Gate (Cooper) | Cada etapa acaba numa **porta** com critérios; quem decide escolhe seguir, segurar, voltar ou matar. Rigor proporcional ao tamanho do projeto. | Porta de decisão por etapa; **tipo de desenvolvimento** muda o que é obrigatório |
| APQP / PPAP (AIAG, automotivo) | Plano → projeto do produto → projeto do processo → validação → lançamento. Pede análise de risco (FMEA), revisão de projeto, protótipo com plano de verificação, lote piloto. | Lista de riscos, revisão de projeto, registro de protótipos, primeira unidade conferida |
| PLM (Arena, Fusion Manage, Odoo PLM, Acumatica) | Revisões numeradas do projeto e da lista de materiais; depois de liberado, mudar exige **pedido de mudança** (motivo, impacto, aprovação) e fica histórico de quem mudou o quê. | Revisões do desenho (Rev A, B…); pedido de mudança após a liberação |
| Modelo em V | Cada requisito do início tem um teste no fim; validar é provar que serve ao pedido. | Requisitos na Concepção; plano de testes ligado a eles na Validação |
| Norma de trânsito (Resolução CONTRAN 970/2022, sinalização e iluminação) | Produto de sinalização tem exigência legal. **Não afirmar exigência de ensaio/homologação sem confirmar com o usuário.** | Campo "normas aplicáveis" na Concepção e uma linha de conferência na Validação, preenchidos por quem sabe |

## 3. Decisões do usuário (19/10/2026)

1. **Primeira entrega inclui tudo:** entregáveis por etapa + porta; tipo de desenvolvimento; revisões do projeto e custo meta × estimado;
   protótipos, testes e ligação com catálogo/estrutura/Garantia. A construção é **em fatias** (quadro abaixo), cada uma com
   build, teste no navegador com gravações bloqueadas e commit.
2. **Quem decide nas portas:** **solicitante + gerente da Engenharia**; na Validação, a **Qualidade** também dá parecer.
3. Escrever este plano na raiz (feito).

Pontos a fechar com o usuário **na hora de construir a fatia** (perguntar, não supor): quem é "gerente da Engenharia" nas permissões
(`utils/permissoes.ts`), e quem é o "solicitante" quando a demanda é manual sem setor.

## 4. O que cada etapa passa a ter

Todas continuam com responsável, data prevista, início/conclusão e observações. O novo é o miolo de cada uma:

| Etapa | Entregáveis (obrigatório = precisa estar feito para passar) | Porta |
|---|---|---|
| **1 Concepção** | Briefing (problema, quem pediu, OP/veículo) *obrig.*; **requisitos** com prioridade (obrigatório/desejável) *obrig.*; normas aplicáveis; meta de custo e prazo *obrig.*; similares pesquisados | Solicitante + gerente aprovam o briefing |
| **2 Criação** | 2 ou 3 conceitos com prós e contras e **matriz de escolha** (pesos e notas); croqui/render; conceito escolhido *obrig.* | Conceito aprovado |
| **3 Desenvolvimento** | Desenhos com **revisão** *obrig.*; lista de materiais preliminar com **custo estimado × meta** *obrig.*; **lista de riscos** (o que pode falhar, gravidade, ação); **revisão de projeto** registrada (quem participou: Produção, Compras, Qualidade) | Projeto liberado para protótipo |
| **4 Prototipagem** | **Registro de protótipos** (nº, revisão do desenho usada, o que foi feito, material e horas reais, fotos) *obrig.*; **problemas achados** com ação e a revisão que gerou | Protótipo pronto para teste |
| **5 Validação** | **Plano de testes** ligado aos requisitos (requisito → teste → critério → resultado → evidência) *obrig.*; teste de instalação em veículo; conferência das normas; parecer da Qualidade *obrig.* | Aprovado / aprovado com ressalva / **volta ao Desenvolvimento** (nova revisão) |
| **6 Produção** | **Liberação:** item no catálogo e estrutura de instalação criados ou vinculados *obrig.*; instrução de montagem; primeira unidade conferida *obrig.*; custo real × meta e preço pela formação de preços | Primeira unidade conforme |
| **7 Acabamento** | Padrão de acabamento, identificação, embalagem e manual; amostra aprovada *obrig.* | Amostra aprovada |
| **8 Entrega** | Pacote técnico final (desenho, lista de materiais, manual) *obrig.*; aceite do solicitante *obrig.*; lições aprendidas; ligação com a Garantia | Aceite registrado |

**Porta (igual em todas):** decisão = *seguir*, *seguir com ressalva* (a ressalva vira pendência com responsável), *voltar etapa*,
*pausar* ou *cancelar*; registra quem, quando e o motivo. A etapa só aceita "seguir" com os entregáveis obrigatórios feitos e as
aprovações exigidas dadas. "Voltar etapa" reabre a anterior sem apagar nada.

**Tipo de desenvolvimento** (escolhido ao criar a demanda; pode mudar enquanto a Concepção não foi aprovada):

| Tipo | O que exige |
|---|---|
| Produto novo | Tudo da tabela acima |
| Adaptação de produto existente | Sem matriz de conceitos; plano de testes só do que mudou |
| Melhoria / correção | Sem conceitos e sem lista de riscos; revisão do desenho e teste do ponto alterado |
| Peça avulsa (sob encomenda) | Briefing, desenho com revisão, primeira unidade conferida, aceite |

**Depois da liberação (etapa 6):** qualquer mudança no projeto é um **pedido de mudança** curto (motivo, o que muda, impacto em custo e
nas OPs abertas, aprovação solicitante + gerente) que gera a próxima revisão do desenho. Nada de editar a revisão liberada.

**Custo:** meta (Concepção) × estimado (lista de materiais preliminar) × real (primeira unidade). Alerta quando o estimado passa da meta.

## 5. Modelo de dados proposto (a confirmar na fatia D1)

- Mantém `engenharia_desenvolvimento.etapas` (jsonb) e **estende cada etapa** com `entregaveis: [{id, nome, obrigatorio, feito, feito_por, feito_em, anexos[], observacao}]` e
  `porta: {decisao, por, em, motivo, aprovacoes:[{papel, por, em, decisao}]}`. As 4 demandas de hoje **não são alteradas**: ao abrir, a tela
  completa os entregáveis **na memória** a partir do tipo e só grava quando alguém edita.
- Colunas novas em `engenharia_desenvolvimento`: `tipo_desenvolvimento`, `requisitos` jsonb, `meta_custo`, `custo_estimado`, `custo_real`,
  `revisoes` jsonb (lista Rev A, B…, com motivo, quem, quando, anexo), `riscos` jsonb, `item_id` (catálogo).
- Tabelas novas (filhas, com policy permissiva de RLS): `engenharia_desenvolvimento_prototipos` e `engenharia_desenvolvimento_testes`
  (cada teste aponta o requisito) e `engenharia_desenvolvimento_mudancas`. Decidir na D1 entre tabela e jsonb conforme o volume esperado.
- Toda gravação confere a resposta do banco, e leitura recusada nunca parece "vazio" (padrão já adotado nas outras telas).
- Linha do tempo de cada demanda alimentada pelo `AuditSystem.tsx` (módulo `desenvolvimento`).

## 6. Etapas de execução

| Etapa | O que faz | Estado |
|---|---|---|
| **D0** | Fatia do `/ux-fluxo` da aba: achados 7.x e migração para `Interface.tsx`/`Feedback.tsx`/classes/`Botao`, sem mudar o comportamento | ✅ 19/10/2026 (12e68 no plano de UX; 29 verificações no navegador, nenhuma gravação) |
| **D1** | Base: tipo de desenvolvimento, entregáveis por etapa (lista própria de cada etapa, anexo por entregável), porta com aprovação solicitante + gerente, registro no histórico | ✅ 19/10/2026 (regras em `DesenvolvimentoModelo.ts`, tela em `DesenvolvimentoPorta.tsx`; 68 regras + 58 verificações no navegador; ver "Como ficou a D1") |
| **D2** | Concepção e Criação: requisitos com prioridade, meta de custo, normas, matriz de escolha de conceitos | ✅ 19/10/2026 (ver "Como ficou a D2"; 94 regras + 76 verificações no navegador) |
| **D3** | Desenvolvimento: revisões do desenho (Rev A, B…), lista de materiais preliminar, custo estimado × meta, lista de riscos, revisão de projeto | ✅ 19/10/2026 (ver "Como ficou a D3"; 125 regras + 99 verificações no navegador) |
| **D4** | Prototipagem e Validação: registro de protótipos, problemas com ação, plano de testes ligado aos requisitos, parecer da Qualidade, "volta ao Desenvolvimento" | ✅ 19/10/2026 (ver "Como ficou a D4"; 155 regras + 124 verificações no navegador) |
| **D5** | Produção, Acabamento e Entrega: liberação com item no catálogo e estrutura de instalação, primeira unidade, custo real, pedido de mudança, pacote técnico, aceite, ligação com a Garantia | ✅ 19/10/2026 (ver "Como ficou a D5"; 193 regras + 155 verificações no navegador) |
| **D6** | Painel: atrasadas, esperando aprovação, etapa parada há dias, custo estimado × meta; filtros novos | ✅ 19/10/2026 (ver "Como ficou a D6"; 214 regras + 177 verificações no navegador) |

### Como ficou a D1 (19/10/2026)

**Respostas do usuário na hora de construir:** o gerente é **Admin ou qualquer perfil "Gerente …"** (a regra que o sistema já tinha); o **solicitante** é quem criou a demanda, com campo para indicar outro na janela de nova demanda (na automática, quem iniciou a análise); a **Qualidade** é a pessoa que a Engenharia indica **ao iniciar a Validação** (só em "produto novo" e "adaptação").

**Banco (migração `desenvolvimento_tipo_portas_e_historico`):** colunas novas em `engenharia_desenvolvimento`: `tipo_desenvolvimento`, `solicitante_nome`, `solicitante_email`, `situacao` (ativa/pausada/cancelada) e `historico` (jsonb). As 4 demandas que existem **não mudaram** (continuam sem tipo = modelo antigo, medido depois: 4 linhas, 4 sem tipo, última atualização de 13/10).

**Como funciona:**
- **Tipo:** demanda nova escolhe o tipo na criação; a automática nasce "a definir" (a tela pede o tipo antes de iniciar a Concepção); a antiga ganha "Usar o novo modelo" (as etapas concluídas continuam concluídas). Trocar o tipo é livre até a Concepção ser aprovada; depois, só gerente.
- **Entregáveis:** cada etapa mostra a lista do tipo (obrigatório/opcional) com caixa de "feito" (guarda quem e quando), anexo por entregável (pasta da etapa, nome seguro) e nota. Fecham enquanto a porta espera decisão.
- **Porta:** "Pedir decisão da porta" só libera com os obrigatórios feitos. Aprovam o **solicitante** e o **gerente** (e a **Qualidade** na Validação). Cada pessoa **aprova**, **aprova com ressalva** (texto obrigatório; a ressalva fica em aberto na demanda até alguém marcar como resolvida) ou **devolve para ajustes** (texto obrigatório; a rodada fica guardada). Quando todos aprovam, a etapa conclui sozinha e a próxima abre pendente. **Admin** pode aprovar por qualquer papel; fica registrado "no lugar de".
- **Gerente:** menu "Ações do gerente" — voltar para a etapa anterior (as aprovações viram histórico e precisam ser dadas de novo), alterar o tipo, pausar, retomar, cancelar (nada é apagado) e reabrir. A demanda cancelada ganha o filtro **Canceladas**.
- **Histórico da demanda** (recolhido, no fim do cartão): tipo, início de etapa, pedido de porta, aprovações, ressalvas, devoluções, pausas. Fica no próprio registro (`historico`), **não** no `audit_log`: assim a leitura é uma lista só e cada decisão grava no mesmo UPDATE das etapas.
- **Gravação:** toda ação lê a demanda de novo, aplica a regra sobre o que está no banco e grava num **único UPDATE conferindo `atualizado_em`**; se outra pessoa mexeu no meio, não grava e avisa.

**Achado do teste:** a caixa de "feito" lia o valor depois da leitura do banco, quando a caixa controlada já tinha voltado ao valor antigo (marcava e não gravava); corrigido lendo o valor na hora do clique.

**Fica para as próximas fatias:** os formulários próprios de cada entregável (requisitos com prioridade, matriz de conceitos, revisões do desenho, protótipos, plano de testes — D2 a D5) e o painel (D6). Hoje cada entregável é "feito + anexos + nota".

### Como ficou a D2 (19/10/2026)

Sem mudança no banco: o conteúdo dos formulários fica em `etapa.entregaveis[id].dados` (jsonb que já existia). Regras em `DesenvolvimentoModelo.ts` (`faltaNoEntregavel`, `limparDados`, `salvarDados`, `ranking`); campos em `DesenvolvimentoFormularios.tsx`.

- **Concepção:** *Briefing* (problema a resolver obrigatório, aplicação, quem pediu); *Requisitos* (linhas com prioridade Obrigatório/Desejável; precisa de ao menos um obrigatório); *Normas* e *Similares* (linhas, ou "nenhuma norma se aplica"/"não achei similar"; similar aceita link); *Meta de custo e prazo* (custo alvo por unidade lido com `lerValorDigitado`, prazo e quantidade prevista opcional).
- **Criação:** *Matriz de conceitos* — critérios com peso de 1 a 5 (botão "Usar critérios sugeridos": custo, desempenho, segurança e normas, facilidade de fabricar, prazo de fabricação), de 2 a 8 conceitos, nota de 0 a 5 de cada conceito em cada critério, **pontuação ao vivo** (peso × nota) com o maior destacado; *Conceito escolhido* — escolhe entre os conceitos da matriz (com a pontuação), e **escolher um que não é o de maior nota exige explicar** (a justificativa é sempre obrigatória). Em adaptação (sem matriz) o conceito é um nome livre mais o porquê. O *croqui* continua anexo.
- **Regra:** o entregável com formulário **só pode ser marcado "feito" com o formulário completo** (a caixa fica travada e diz o que falta); editar um formulário já "feito" que deixe de estar completo **desmarca o "feito"**; trocar a matriz de modo que o conceito escolhido deixe de existir **reabre a escolha** em vez de apontar para o vazio. Tudo fecha com a porta, como antes.
- **Resumo do projeto:** o cartão ganhou um quadro recolhido com o que a Concepção e a Criação definiram (briefing, meta, requisitos, normas, conceito escolhido), para consulta nas etapas seguintes.
- **Para a D3:** a meta de custo (`custo_alvo`) é o que a lista de materiais preliminar será comparada; as normas listadas são as que a conferência de normas da Validação (D4) vai percorrer.

### Como ficou a D3 (19/10/2026)

Sem mudança no banco (os dados ficam em `entregaveis[id].dados`). Regras em `DesenvolvimentoModelo.ts` (`letraDaRevisao`, `revisaoVigente`, `custoEstimado`, `custoContraMeta`, `nivelDoRisco`); campos em `DesenvolvimentoFormularios.tsx`; o envio de arquivos virou `enviarArquivos` em `DesenvolvimentoPorta.tsx`.

- **Desenhos com revisão:** cada revisão tem a letra (Rev A, B … Z, AA — **a letra é do sistema, não da tela**), o que mudou, ao menos um arquivo, quem registrou e quando. **Só se acrescenta**: revisão registrada não se reescreve nem se apaga (mudou o desenho, é a próxima letra); se algum arquivo falhar no envio, a revisão **não é registrada** (nada de revisão pela metade guardada para sempre).
- **Lista de materiais preliminar:** material, quantidade, unidade e custo unitário; mostra o **custo de uma unidade** e compara com a **meta de custo da Concepção** em reais e em %. **Estimado acima da meta exige a justificativa** (sem ela a caixa de "feito" continua travada). Sem meta (melhoria ou peça avulsa sem meta) não compara nem exige.
- **Riscos:** descrição, gravidade e probabilidade de 1 a 5, nível pela multiplicação (15 ou mais alto, 8 a 14 médio, abaixo baixo), ação e responsável. **Risco médio ou alto exige ação**; dá para marcar "não vi risco relevante".
- **Revisão de projeto:** data, participantes (com a área), pontos levantados com "resolvido", conclusão (aprovado, aprovado com ajustes, reprovado) e ata. **Produto novo exige alguém de Produção, Compras e Qualidade** (a janela já sugere as áreas); reprovada não vale; aprovada com ajustes só vale com os pontos resolvidos. **A revisão guarda para qual Rev do desenho foi feita:** registrar uma nova revisão do desenho **derruba o "feito" da revisão de projeto** e a tela pede para repeti-la (como no PLM: aprovar uma versão não aprova a seguinte).
- **Resumo do projeto** no cartão passou a incluir desenhos (revisões), lista de materiais com o % contra a meta, riscos e a revisão de projeto.
- **Para a D4:** os protótipos vão referenciar a Rev do desenho; os riscos da D3 alimentam o plano de testes.

**Uso real já em andamento (conferido só por leitura, 19/10/2026):** a Engenharia já usa a D1/D2 em produção — uma demanda nova ("produto novo") e uma antiga que passou ao modelo novo. Entregável marcado como "feito" antes da D3 sem formulário **continua feito** (a regra de "só feito com formulário completo" vale daqui para a frente, ao marcar ou editar); o dado dessas demandas não foi tocado.

### Como ficou a D4 (19/10/2026)

Sem mudança no banco. Regras em `DesenvolvimentoModelo.ts` (`requisitosSemTeste`, `riscosSemTeste`, `normasSemResposta`); campos em `DesenvolvimentoFormularios.tsx`; o parecer da Qualidade está em `DesenvolvimentoPorta.tsx` e em `decidirPorta`.

- **Protótipos:** cada um é **P1, P2… pela ordem** (o número muda se um for tirado, o `id` não), com a **revisão do desenho construída** (já vem a vigente; se o desenho já mudou, o protótipo mostra "foi feito na Rev A; o desenho hoje está na Rev B"), o que se fez, material, **horas (obrigatórias)**, custo e fotos. Valem como feito com descrição, revisão (que exista nos desenhos) e horas.
- **Problemas e ações:** problema, protótipo de origem, ação, **revisão do desenho que o corrigiu** e "resolvido". Só vale como feito com **todos resolvidos e com ação**; dá para marcar "nenhum problema apareceu".
- **Plano de testes (modelo em V):** cada teste liga a um **requisito da Concepção** e, se quiser, a um **risco médio/alto da etapa anterior**, com critério para passar, resultado (ainda não testado, aprovado, reprovado) e evidência. **Todo requisito obrigatório precisa de ao menos um teste** (a tela lista o que ainda não tem; o teste novo já vem ligado ao primeiro requisito sem teste); só vale como feito com **todos os testes aprovados**, com critério e evidência. Risco médio/alto sem teste é **aviso**, não trava.
- **Instalação em veículo:** veículo, data, resultado e fotos; só vale **aprovada**.
- **Conferência das normas:** percorre **as normas listadas na Concepção** (atende / não atende / não se aplica, com observação). **"Não atende" trava** até o projeto ser ajustado; se a Concepção não listou normas, não há o que conferir.
- **Parecer da Qualidade:** quem aprova pela Qualidade (a pessoa indicada ao iniciar a Validação, ou o Admin cobrindo esse papel) **precisa escrever o parecer**; o texto fica na decisão e no histórico. Solicitante e gerente continuam só confirmando.
- **Resumo do projeto** inclui protótipos, problemas, plano de testes, instalação e conferência de normas.
- **Para a D5:** o item do catálogo e a estrutura de instalação nascem do que ficou aprovado aqui; a primeira unidade da Produção é conferida contra a Rev vigente do desenho.

### Como ficou a D5 (19/10/2026)

**Banco (migração `desenvolvimento_pedidos_de_mudanca`):** coluna nova `mudancas` (jsonb, padrão vazio) em `engenharia_desenvolvimento`; as demandas existentes não mudam. Regras em `DesenvolvimentoModelo.ts`; campos em `DesenvolvimentoFormularios.tsx`; o quadro de mudanças em `DesenvolvimentoMudancas.tsx`.

- **Item no catálogo e estrutura de instalação (Produção):** escolhe o item entre os ativos do catálogo (`cadastro_itens`, busca por código ou nome) e os **veículos de aplicação**; a janela **confere no banco** (`veiculo_item_materiais`) quais veículos já têm a estrutura daquele item, mostra "Estrutura cadastrada / Sem estrutura" com o atalho **"Cadastrar estrutura"** (o mesmo da Engenharia) e **regrava a conferência a cada "Salvar"**, para o que fica gravado ser a de agora. Só vale como feito com a estrutura em **todos** os veículos, ou com a justificativa de que o item não entra em estrutura. **Decisão de projeto: a janela só liga e confere; não cria nem muda nada no catálogo** (cadastrar o item continua sendo feito na tela do catálogo).
- **Primeira unidade conferida:** data, OP ou unidade, resultado (só "conforme o desenho" vale), observações e fotos; **guarda a Rev do desenho conferida** e, se o desenho mudar depois, pede para repetir.
- **Custo real × meta:** custo real por unidade comparado com a **meta da Concepção** e com o **estimado da lista de materiais** (em %); **acima da meta exige justificativa**.
- **Instrução de montagem** (passos em ordem e tempo), **padrão de acabamento** (pintura, identificação, embalagem e manual: texto ou "não se aplica" em cada um) e **amostra** (data e onde está guardada, com fotos).
- **Entrega:** **pacote técnico** (arquivos, guarda a Rev do pacote; se o desenho mudar depois, pede para atualizar) com o campo **"Para a Garantia"** — **hoje é só uma anotação guardada**; a ligação de verdade com o atendimento em garantia nasce quando o `PLANO_GARANTIA.md` começar — e **lições aprendidas** (o que funcionou, o que faria diferente). O aceite do solicitante é a própria porta da Entrega.
- **Pedido de mudança depois da liberação** (Produção concluída): o projeto liberado não se edita. Pede-se a mudança com **motivo, o que muda, impacto em custo e impacto nas OPs abertas** (todos obrigatórios; "nenhum" vale); **solicitante e gerente aprovam** (uma recusa, com o porquê, encerra); a mudança aprovada **gera a próxima revisão do desenho** (Rev C, D…, ligada à M1, M2…, com arquivo obrigatório) — **a única forma de mexer no desenho depois da liberação**; a Rev anterior fica como estava. Uma mudança por vez; quem pediu ou um gerente cancela. Tudo vai ao histórico da demanda.
- **Resumo do projeto** inclui os novos entregáveis.

### Como ficou a D6 (19/10/2026)

Sem mudança no banco. A conta de cada alerta é uma só, `alertasDaDemanda` em `DesenvolvimentoModelo.ts`; a tela está em `DesenvolvimentoPainel.tsx`.

- **Seis cartões no alto da aba**, cada um também um **filtro da lista** (clicar de novo desliga; soma com o filtro de situação e com a busca): **Esperando a minha decisão** (portas e mudanças que EU posso decidir, pelo mesmo cálculo dos botões de aprovar), **Esperando decisão** (qualquer porta ou mudança pedida), **Atrasadas** (a data prevista da etapa em andamento passou, ou o prazo do projeto da Concepção venceu), **Paradas há 7+ dias** (ninguém gravou nada na demanda), **Custo acima da meta** (estimado ou real maior que a meta) e **Com ressalva em aberto**.
- **Selos no cartão de cada demanda** dizem o mesmo, com os dias ("Etapa atrasada há 5 dias", "Parada há 10 dias", "Esperando a sua decisão", "Custo acima da meta", "1 ressalva em aberto").
- **Tabela "Custo estimado × meta por demanda"** (recolhida): meta, estimado e real de cada demanda, com a diferença em %.
- **Regras:** cancelada e pedido do PCP ficam de fora; **pausada não conta como atrasada nem parada** (a pausa já é a explicação); concluída por inteiro também não. O limite de "parada" (7 dias) está numa constante (`DIAS_PARADA`).
- **Achado do teste:** o teste montou as datas com `toISOString` (dia de Londres) e errou por um dia à noite — o mesmo erro que o projeto já evita com `hojeISO`; a tela sempre usou a data local.

**Plano concluído:** as sete fatias (D0 a D6) estão feitas. O que o plano deixou conscientemente para depois: a **ligação de verdade com a Garantia** (hoje o campo "Para a Garantia" do pacote técnico é só anotação) e **não criar o item no catálogo pela tela** (a Produção só liga e confere).

Regras de cada fatia: `npx vite build` antes de commitar; teste no navegador com gravações bloqueadas (padrão `scratchpad/fstest/`);
nenhum dado real alterado; relatar números reais; push só com a pergunta clicável de autorização.

## 7. Fora do escopo desta rodada

- Pedido do PCP e seus itens (continuam como estão).
- Gerar documento de homologação ou afirmar exigência legal: só o campo para registrar o que o setor definir.
- Modelagem 3D/CAD dentro do sistema (continua anexo).
- Integração com programas externos de PLM.

## 8. Fontes consultadas (19/10/2026)

- Stage-Gate (Robert G. Cooper) e APQP/PPAP (AIAG, 3ª edição de 2024), pelas descrições públicas.
- [Odoo — Engineering change orders](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)
- [Autodesk — Engineering change management process](https://www.autodesk.com/blogs/design-and-manufacturing/engineering-change-management-process/)
- [Acumatica — Engineering Change Control](https://cdn.acumatica.com/media/2020/05/Acumatica_Manufacturing_Engineering_Change_Control_Datasheet_220316.pdf)
- [Resolução CONTRAN 970/2022](https://www.legisweb.com.br/legislacao/?id=433065) (apenas para saber que existe norma; conteúdo a confirmar com o setor)
