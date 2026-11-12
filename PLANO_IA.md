# PLANO — IA no sistema, para ajudar nas tarefas dos usuários

> Criado em 12/11/2026, a partir de uma conversa com o usuário. **Nada foi construído ainda.** Este arquivo é o ponto de partida de qualquer sessão que retome o assunto; as dúvidas em aberto estão marcadas e precisam da decisão dele antes da Etapa I0.

## 1. O que o usuário pediu

Colocar uma IA no sistema para **ajudar os usuários nas tarefas deles e tirar relatórios**, começando com funções específicas.

**Fora do escopo, por pedido dele:** a IA **não analisa o código** do sistema e **não pensa em melhorias do sistema**. Ela só mexe com os dados e as tarefas das pessoas.

## 2. Decisões já tomadas (12/11/2026)

| Assunto | Decisão |
|---|---|
| Primeiras frentes | As quatro abaixo (F1 a F4). |
| Como ligar | **Pela API da Anthropic**, com chave da empresa e cobrança por uso. A **assinatura** (Pro/Max/Team) **não pode** ser usada por dentro de um sistema nosso: os termos da Anthropic proíbem o login da assinatura em produtos de terceiros (esclarecido em fev/2026). **A confirmar:** ler a redação atual dos termos Consumer e Commercial antes de contratar. |
| Controle de gasto | O usuário **consegue limitar o gasto por mês** no lado da Anthropic. Além disso o sistema terá teto próprio por pessoa (seção 5). **A confirmar:** o nome da opção no Console e se o limite é rígido ou só aviso. |
| Atalho opcional | Quem tiver assinatura pode usar o Claude (claude.ai) com um **conector** que lê os dados do sistema. Só vale para perguntas e relatórios; não preenche tela. Decidir depois da Etapa I1. |

## 3. As quatro frentes

| | Frente | Quem usa | Exemplos |
|---|---|---|---|
| **F1** | **Perguntas e relatórios** | Gerentes e direção, depois todos | "Onde está a OP A1766?", "o que está parado com o Almoxarifado há mais de 7 dias?", "perdas do CRM por motivo nos últimos 90 dias", "compras atrasadas por fornecedor", "fretes sem entrega", faturamento do mês. Resposta em texto, tabela, planilha ou PDF, com o link do registro. |
| **F2** | **Resumos e textos** (Comercial e SAC) | Vendedores, SAC | Resumir o andamento de um card, OS, ficha de garantia ou licitação; rascunho de follow-up, proposta e resposta ao cliente. A pessoa revisa antes de usar. |
| **F3** | **Licitações: ler o edital** | Equipe de Licitações | Ler o PDF e extrair datas, itens, exigências, prazos de entrega e documentos pedidos; resumir o processo. A pessoa confere e confirma o que vai para os campos. |
| **F4** | **Financeiro e Viagens: ler nota e comprovante** | Financeiro, Viagens | Ler foto ou PDF de nota e comprovante e preencher valor, data e tipo; sugerir a OP ou o centro de custo de um lançamento. A pessoa confirma antes de gravar. |

Ideias que apareceram e **ficaram para depois** (não foram escolhidas): cotação de fornecedor em PDF (Compras), foto de chassi e placa (Almoxarifado/Qualidade), sugestão de centro de custo nas compras, resumo da semana por setor para a direção, rascunho da nota de atualização e de legendas da tela Início.

## 4. Regras que não se quebram

1. **Só lê e rascunha. Nada grava sozinho.** Toda gravação sai de um clique da pessoa, na tela de sempre, com as travas de sempre.
2. **Cada pessoa só enxerga o que já enxerga hoje.** A IA roda com o crachá de quem perguntou. Quem não tem a aba RH não recebe salário, comissão, CPF ou contato pela IA; WhatsApp, e-mail e cópia de segurança ficam fora.
3. **A IA não escreve consulta livre ao banco.** Ela só chama **funções prontas e fechadas** que nós definimos (uma lista pequena, cada uma com o que devolve). Isso também a mantém longe do código e da estrutura do sistema.
4. **Número vem do banco, não da "cabeça" da IA.** Em relatório, a conta é da função pronta; a IA escolhe a função, mostra o resultado e explica. Toda resposta traz de onde veio (link do registro).
5. **A chave da IA fica no servidor** (função do Supabase), nunca no navegador; a URL e a chave pública do banco já são as únicas no código e isso não muda.
6. **Tudo fica registrado:** quem perguntou, quando, qual função foi chamada, quanto custou. Sem guardar o conteúdo de dado sensível além do necessário.
7. **Preço de venda, aprovações e alteração de dado em massa não passam pela IA.** A conta de preço continua só em `FormacaoCalculo.ts`.
8. Valem as regras do projeto: português do Brasil, alerta em vermelho, `npx vite build` antes do commit, push só com a pergunta clicável.

## 5. Limites de custo (dois níveis)

- **Na Anthropic:** teto de gasto mensal da conta, de preferência em um "workspace" só para o sistema (para a chave de teste e a de uso real não se misturarem).
- **No sistema:** teto por pessoa por dia e por mês; aviso a quem administra quando o mês passa de 80% do teto; tamanho máximo de documento (um edital enorme não gasta o mês de uma vez); modelo barato para pergunta simples e modelo mais forte só para ler documento. Tabela de uso com a política padrão do banco (`etapa17_logado`) e a leitura do total só para Admin.

## 6. Etapas

| Etapa | O que é | Depende de |
|---|---|---|
| **I0** | Preparar a base: conta de API com teto, função no servidor que recebe a pergunta com o crachá, chama o modelo e registra o uso; tabela de uso e de limites; tela simples para o Admin ver o gasto. | Decisões da seção 7 |
| **I1** | **F1 — perguntas e relatórios.** Começa com 6 a 10 funções prontas escolhidas **a partir dos relatórios que as pessoas tiram hoje na mão** (levantamento com os gerentes). Saída em texto, tabela, planilha e PDF (reaproveitar `paraCsv` e a impressão que já existem). | I0 |
| **I2** | **F2 — resumos e textos** (Comercial e SAC), com botão na ficha e rascunho editável. | I1 |
| **I3** | **F3 — ler o edital** (Licitações), com tela de conferência campo a campo antes de gravar. | I1 |
| **I4** | **F4 — ler nota e comprovante** (Financeiro e Viagens), com o mesmo modelo de conferência. | I3 |
| **I5** | Decidir o atalho do conector com a assinatura (só leitura). | I1 |

Cada etapa vai para produção sozinha, com teste (gravações bloqueadas, respostas da IA simuladas) e este plano atualizado no mesmo commit.

## 7. Dúvidas em aberto (decidir com o usuário antes da I0)

1. **Privacidade:** o que pode ir para o provedor da IA? Dado de cliente e de licitação sairia do banco para a Anthropic. Algum tipo de dado deve ficar de fora (por exemplo valor de contrato, dados pessoais do RH)?
2. **Orçamento mensal:** qual o valor do teto na Anthropic e qual o teto por pessoa?
3. **Plano da assinatura:** qual é (Team, Enterprise, Pro) e para quantas pessoas? Decide se o atalho do conector (I5) vale a pena.
4. **Quem usa primeiro** (gerentes? uma equipe piloto?) e **quem administra** o gasto.
5. **Quais relatórios as pessoas tiram hoje na mão** em cada setor: é a lista que define as funções da I1.
6. **Idioma e tom** das respostas e dos textos (formal com cliente? o mesmo padrão das notas de atualização?).

## 8. Quadro de acompanhamento

| Etapa | Situação |
|---|---|
| I0 a I5 | ⬜ nada iniciado (plano escrito em 12/11/2026) |
