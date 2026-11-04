# CURSOR_PARALLEL_SYNC — diretriz mestre para qualquer agente no ERP ACN Sinal Verde

> **Para quem é:** qualquer instância de IA (Claude Code no desktop, Claude no Cursor em modo Composer/Agent, ou outra) que assuma este projeto numa máquina ou
> conta diferente, sem ter visto nenhuma conversa anterior. **Leia este arquivo inteiro antes de mexer em qualquer coisa.**
> **Criado em 04/11/2026**, a pedido do dono do projeto, a partir de como o trabalho já é conduzido (ver `CLAUDE.md`). Este arquivo **não substitui** o `CLAUDE.md`:
> ele diz como duas ou mais máquinas trabalham no mesmo projeto sem se atrapalhar. Onde houver conflito entre os dois, vale o `CLAUDE.md`.
> **Sempre em português do Brasil**: código comentado, mensagens de commit, textos de tela e relatos.

---

## 0. Em uma página

1. **A verdade está nos arquivos do repositório, não na sua memória nem na de outra sessão.** Leia na ordem da seção 1 antes de começar.
2. **Antes de criar qualquer coisa, procure se já existe** na tabela de utilitários do `CLAUDE.md`.
3. **Não há horário nem máquina "dona" de tarefa.** Dia, noite, notebook e desktop são hábito, não regra (seção 2).
4. **`npx vite build` verde antes de qualquer commit. Sem exceção** (seção 3).
5. **`git push` só com autorização explícita do dono, dada no chat.** A única exceção é o "modo noite" que ele mesmo ligou na sessão (seção 3.5).
6. **Banco de produção: não mexa em dado real sem pedido explícito, não apague nada, e teste sempre com gravação bloqueada ou registro `ZZTESTE`** (seção 4).
7. **Na dúvida, pergunte antes de agir.** Vale mais uma pergunta que um retrabalho (regra 3 do `CLAUDE.md`).

---

## 1. Arquitetura de arquivos como fonte da verdade

### 1.1 A memória de sessões anteriores não vale

Você não tem acesso ao que outra sessão, outra máquina ou outra conta conversou. Mesmo que o ambiente tenha algum tipo de "memória" local, ela **não é confiável
nem compartilhada**: pode estar vazia, defasada ou ser de outra conta. **Tudo o que precisa ser lembrado está commitado no repositório.** Se você aprender algo
que a próxima instância precisa saber (uma decisão de negócio, um cuidado, um número de teste), **escreva num arquivo do repositório no mesmo commit** (regra,
plano ou comentário de código com data). Conversa não é registro.

### 1.2 Ordem de leitura ao assumir o projeto

| # | Arquivo | O que é | Confiança |
|---|---|---|---|
| 1 | `CLAUDE.md` | **Contrato de trabalho**: regras que não se quebram, ambiente, banco, como escrever código, tabela de utilitários, testes e regras de negócio já decididas. É o arquivo mais atualizado. | **Máxima.** Manda sobre os demais. |
| 2 | `PLANO_*.md` **na raiz** | Os planos **não concluídos**. Hoje: `PLANO_UX_FLUXO_TRABALHO.md`. É a fonte da verdade do que está em andamento e do que falta. | Alta, mas **meça de novo** antes de codar (o plano é uma foto de uma data; o código anda). |
| 3 | `CONTEXTO_PROJETO.md` | Briefing da arquitetura (stack, telas, tabelas). | **Média.** Última alteração em 02/10/2026. Pode estar defasado. |
| 4 | `ESTADO_ATUAL_PROJETO.md` | Handoff antigo ("gerado em 2026-08-10"). | **Baixa. É histórico.** Não use como "estado atual": o estado atual são o `CLAUDE.md` e os planos. |
| 5 | `PLANOS CONCLUIDOS/PLANO_*.md` | Planos terminados (Garantia, SAC, Telecom, Estoque automático etc.). Só para consulta e ajuste. | Alta para o que decidiram; nada ali está "pendente". |
| 6 | `.claude/skills/<nome>/SKILL.md` | Procedimento de cada comando customizado (seção 2.2). | Alta para o procedimento. |

**Regra de precedência:** `CLAUDE.md` > plano ativo > `CONTEXTO_PROJETO.md` > `ESTADO_ATUAL_PROJETO.md`. Se dois arquivos se contradizem, **vale o mais recente e o de
maior precedência**, e você **corrige o defasado no mesmo commit** (ou avisa o dono se não tiver certeza). Quando um fato do `CONTEXTO`/`ESTADO` não bater com o código,
o código e o `CLAUDE.md` ganham. (Exemplo real: o `CLAUDE.md` fala da porta 5199, o `.claude/launch.json` declara 5173 e em 04/11/2026 o servidor subiu em 5173. Olhe a
porta que o `npm run dev` imprimir.)

### 1.3 Antes de criar QUALQUER componente, função ou tela

1. Abra a **tabela "Antes de criar algo novo, procure o utilitário que já existe"** do `CLAUDE.md` e leia as linhas que tocam o assunto.
2. Procure no código com busca por nome e por conceito (`Grep` em `src/`): o projeto tem ~200 arquivos e quase tudo já tem um ajudante.
3. Peças de tela vêm de `src/Interface.tsx` (`Botao`, `Selo`, `Faixa`, `Chips`, `Abas`, `MenuAcoes`, `hojeISO`, `diaISO`…) e `src/Feedback.tsx` (`confirmar`, `pedirTexto`,
   `mostrarAviso`). **Nada de `style` solto nem componente de botão novo.** Campo de CEP é `CampoCep`; **campo de telefone é `CampoTelefone`** (`Telefone.ts`); número digitado
   é `lerValorDigitado`; tabela grande é `lerPaginado`; erro do banco em português é `explicarErroDoBanco`.
4. **Se o utilitário não existe e você criou um, acrescente a linha na tabela do `CLAUDE.md` no mesmo commit** (assunto, arquivo, funções). É assim que a próxima
   instância o encontra. Sem isso, o utilitário vira duplicata daqui a um mês.
5. Convenções de código que valem sempre:
   - todo componente `.tsx` começa com `// @ts-nocheck` (não remover);
   - **comentário explica o porquê, não o quê**, com a decisão e a data ("regra definida com o dono em 04/11/2026: …");
   - alerta novo é **vermelho** (`--acn-bad`, tom de erro de `Botao`/`Selo`/`Faixa`); verde só para "deu certo"; âmbar para atenção leve;
   - não dê `.toISOString()` para obter o dia (devolve o dia de Londres): use `hojeISO`/`diaISO`;
   - edição grande de arquivo: **script no diretório temporário, com `assert` de ocorrência única**; evite heredoc de shell para gerar código (ele corrompe `\n` e `\u`);
   - **tela que o `/ux-fluxo` ainda não migrou para o design system**: faça antes a fatia dela (achados 7.x e migração) e só então a mudança; nos quatro arquivos grandes
     (Admin, `DemandaAvulsaPanel`, `CadastroProdutosTab`, `VeiculosNfcTab`) **pergunte ao dono** se vale construir só a peça nova no padrão.

### 1.4 Preferências do dono que podem não estar no `CLAUDE.md`

O `CLAUDE.md` traz as regras. Estas preferências foram combinadas em conversa e podem não ter ido para o arquivo; **trate-as como padrão, e quem as confirmar com o
dono deve passá-las para o `CLAUDE.md`**:

- decisão do dono vai em **pergunta objetiva com opções e uma recomendação** (no Cursor, pergunte no chat com as opções numeradas); pergunte **na hora em que a dúvida
  surge**, não em lote no fim;
- **comunicados de atualização do sistema** (`avisos_sistema`): primeira pessoa do singular, sem "nosso", sem pedido de desculpas e sem frase de abertura do tipo "Reuni
  aqui…"; defeito corrigido entra como item de correção; **uma nota por dia trabalhado**, com o horário do último commit do dia; expira em 48 h; sai em nome do Matheus;
- relatos em **linguagem de processo da fábrica**, com os números reais dos testes e o que ficou de fora; se algo falhou, diga que falhou.

---

## 2. Operação agêntica flexível (sem regras fixas de horário)

### 2.1 Máquinas e turnos são hábito, não regra

O plano de UX registra um **modo de trabalho de hábito**: "de dia, os outros planos (Garantia, Etapa 17 etc.); de madrugada, o `/ux-fluxo`", e o dono usa um notebook e um
desktop. **Isso é só como as coisas costumam acontecer.** Valem estas consequências:

- **Qualquer máquina, a qualquer hora, pode assumir uma tarefa pesada ou um pequeno ajuste.** Não espere "a vez" de ninguém nem recuse um pedido porque "isso é trabalho da
  noite".
- **O que decide o que fazer é o pedido do dono no chat e o plano**, não o relógio.
- **O que NÃO é flexível** são os gates da seção 3 e a proteção de dados da seção 4. Eles valem igual em qualquer máquina e a qualquer hora.
- Trabalhando **em paralelo** (duas máquinas ao mesmo tempo):
  1. **Antes de começar:** `git status` (há algo pendente?) e `git fetch origin main` (a `main` andou?). Traga a `main` para a sua branch antes de editar.
  2. **Uma área por vez.** Se a outra máquina está num arquivo, não edite o mesmo arquivo. Na dúvida, pergunte ao dono quem está com o quê.
  3. **Commits pequenos e frequentes**, cada um com o plano atualizado, para o conflito ser pequeno se acontecer.
  4. **Nunca** `git push --force`, `git reset --hard` ou `git checkout -- .` sobre trabalho que você não fez (veja 3.2).
  5. **Plano `.md`:** edite só a etapa em que está trabalhando. Em conflito de plano, **mantenha as duas versões** (as duas máquinas fizeram algo real) e reconcilie.
  6. Se a tarefa tem **migração de banco**, veja a seção 4.5 (duas máquinas mexendo no mesmo banco).
- **Pasta de trabalho nova (worktree do Claude Desktop ou clone novo) não traz `node_modules`:** rode `npm install` uma vez antes do primeiro build.

### 2.2 Comandos customizados (`/ux-fluxo`, `/garantia`, …)

Os comandos com barra são **skills do Claude Code**: arquivos em `.claude/skills/<nome>/SKILL.md`. **Num ambiente que não tem a barra (como o Cursor), o dono continua
podendo escrever `/ux-fluxo` no chat: isso significa "abra o arquivo `.claude/skills/ux-fluxo/SKILL.md` e execute o procedimento dele".** Faça assim:

1. Abra o `SKILL.md` correspondente e leia **inteiro** (o cabeçalho `description` diz quando se aplica).
2. Execute como procedimento, junto com o `CLAUDE.md` e este arquivo. Se o skill mandar ler outro arquivo (por exemplo, um plano), leia.
3. Argumentos (`/ux-fluxo 3`) são o texto depois do nome.

| Comando | Arquivo | Para quê | Situação em 04/11/2026 |
|---|---|---|---|
| `/ux-fluxo` | `.claude/skills/ux-fluxo/SKILL.md` | Continuar o `PLANO_UX_FLUXO_TRABALHO.md`: fluxo do PV à entrega, polimento de UX, migração das telas para o design system, respostas a aplicar. Uma etapa por vez; o plano é atualizado no mesmo commit. Tem o **modo noite** (3.5). | **Em andamento** |
| `/garantia` | `.claude/skills/garantia/SKILL.md` | Atendimento em garantia (G1 a G6). | Concluído (20/10/2026): só consulta ou ajuste |
| `/estoque-auto` | `.claude/skills/estoque-auto/SKILL.md` | Estoque, reserva e automação da lista de material. | Concluído: só consulta |
| `/envio-parcial` | `.claude/skills/envio-parcial/SKILL.md` | Envio parcial com kit incompleto e complemento. | Concluído (03/11/2026): só consulta ou ajuste |
| `/rh-envios` | `.claude/skills/rh-envios/SKILL.md` | Demandas avulsas de RH (departamentos, uniformes) e envios parciais. | Concluído (14/10/2026): só consulta ou ajuste |

Se o dono digitar `/algo` que não está nessa tabela, **liste `.claude/skills/`** antes de dizer que não existe. A lista pode ter crescido.

---

## 3. Protocolo obrigatório de pré-commit e deploy (gates de segurança)

### 3.1 Gate 1: `npx vite build` antes de qualquer commit

- **`npx vite build` verde antes de todo commit.** O `tsc` já deixou passar erro de sintaxe que só o build pegou. **Build vermelho não vira commit.**
- `npm run typecheck` (`tsc`) é **complementar**, nunca substitui o build.
- Tela alterada: depois do build, **teste no navegador** (seção 4.4: gravação bloqueada). Rode o build **antes** do teste de navegador: erro de compilação deixa a tela em
  branco e o teste engana.
- Mudou botão, etapa ou regra de uma tela que tem manual (hoje só o SAC, `MANUAIS/sac`)? Atualize a `fonte`, o `manual.json` (`mudancas`, `atualizadoEm`) e rode
  `node MANUAIS/gerar_manuais.cjs` **no mesmo commit** (o deploy não roda o gerador).

### 3.2 Gate 2: conferência pré-push (o agente confere e corrige sozinho)

Antes de pedir autorização para o push, **você mesmo verifica e conserta** o que for necessário para o build de produção e o deploy darem certo:

1. **Modificações locais pendentes:** `git status` e `git diff`.
   - O que é da **sua** tarefa e está pronto: entra no commit.
   - O que é da sua tarefa mas está incompleto: termine ou tire do commit.
   - **O que você não reconhece** (pode ser trabalho de outra instância ou do dono): **não descarte, não sobrescreva e não commite às cegas.** Olhe o `diff`, diga ao dono
     o que é e pergunte.
2. **A `main` andou?** `git fetch origin main`. Se andou, **traga ela para a sua branch** (merge; no Claude Desktop use a ação de sincronizar com a branch base; no Cursor,
   `git merge origin/main`). **Resolva conflitos de código sozinho**, com cuidado: entenda as duas mudanças e preserve as duas intenções. Conflito que mexe em **regra de
   negócio** de um lado e do outro: pare e pergunte.
3. **Rode o build DE NOVO depois do merge.** O build de antes do merge não vale mais (em 04/11/2026 a `main` tinha ganho uma tela nova que mexia no mesmo arquivo do
   telefone; só o build pós-merge provou que o conjunto fechava).
4. **Coerência código × banco:**
   - O código novo depende de coluna, tabela, função ou política que ainda não existe no banco? **Aplique a migração antes do push** (seção 4), compatível com o código
     antigo (acrescentar, não renomear nem apagar), senão o site publicado quebra até a migração chegar.
   - O banco tem algo que o código no repositório não conhece (outra máquina aplicou migração)? Compare `list_migrations` com os arquivos de `supabase/sql/` e traga o
     que faltar.
5. **Incoerência de arquivos:** plano `.md` com a etapa feita mas sem ✅; linha nova faltando na tabela de utilitários; manual desatualizado; arquivo de SQL sem o que foi
   aplicado. Arrume no mesmo commit.
6. **Dependências e ambiente:** `node_modules` ausente (`npm install`); aviso de CRLF do Git no Windows é só aviso.

> **Autonomia, com limite.** "Consertar sozinho" vale para o que **trava o build ou o deploy dentro do escopo da tarefa** (erro de sintaxe, import faltando, conflito
> de merge de código, plano desatualizado, migração compatível que falta). **Não** vale para: mudar regra de negócio por conta própria, mexer em dado real, descartar
> trabalho de outra pessoa/instância, nem **dar o push sem a autorização do 3.4**.

### 3.3 Commit

- Mensagem em **português**, no padrão do histórico (assunto curto que diz o que mudou para o usuário e, no corpo, o porquê).
- Termine com a linha de co-autoria que o seu ambiente indicar, se houver.
- **O plano `.md` atualizado vai no mesmo commit do código** (etapa ✅, "Feito em", "O que foi feito" com arquivos, migrações, números dos testes e o que ficou de fora).
  Uma etapa sem o plano atualizado **não está concluída**: a próxima máquina vai se perder.

### 3.4 Push: só com autorização explícita

- **Nunca `git push` sem aprovação explícita do dono, dada no chat, para aquela tarefa** (regra 2 do `CLAUDE.md`). Aprovação de uma tarefa **não vale** para a seguinte.
- Peça com **uma pergunta dedicada e objetiva** ao fim do trabalho ("Posso publicar?"), **nunca embutida em outra pergunta** e nunca em texto corrido.
- Se o dono já escreveu na própria mensagem "commita, faz o push e corrige se der erro no deploy", isso é a autorização, **inclusive para o push de correção** do deploy
  daquela tarefa. Sem essa frase, o push de correção pede autorização de novo.
- Deploy: `git push` para `main` dispara `.github/workflows/deploy.yml` e publica no GitHub Pages. **Não use `publicar.bat`** (caminho manual antigo). Branch que não é a
  `main` não publica nada; se você trabalha numa branch ou worktree, o push de publicação é `git push origin HEAD:main` (depois de trazer a `main`).

### 3.5 Modo noite (exceção de autorização)

O skill `/ux-fluxo` descreve uma rotina automática: escolher o próximo passo do plano, implementar, build + teste, atualizar o plano, commitar, **dar push** e acompanhar o
deploy, e repetir sem parar para perguntar. **Ela só vale quando o dono liga o modo na própria sessão** ("o mesmo plano de toda noite", "tudo automático" ou equivalente).
**A autorização de uma sessão antiga não passa para a sua.** Se ele não disse, você está no modo normal: pergunte antes do push. "Pare no próximo commit" interrompe o
modo.

### 3.6 Monitoramento do GitHub Actions após o push

1. `gh run list --limit 3` e pegue a execução do **seu** commit (confira o título e a hora).
2. `gh run watch <id> --exit-status` até terminar. Não confie na primeira resposta da API: ela já devolveu erro 500 passageiro. Tente de novo.
3. **O workflow tem `concurrency: cancel-in-progress`**: um push mais novo **cancela** o deploy em andamento do anterior. Se aparecer "cancelado", veja se não há uma
   execução mais nova; é essa que você acompanha.
4. **Só considere entregue quando o deploy terminar com sucesso.** Falhou? `gh run view <id> --log-failed`, corrija a causa, rode o build, faça um commit novo e (com a
   autorização do 3.4) novo push. Repita até funcionar.
5. Se a falha for do ambiente do GitHub (e não do código), diga isso ao dono em vez de mexer no código.
6. Relate: número da execução, se passou, e o que ficou de fora.

---

## 4. Protocolo de banco de dados (Supabase via MCP)

### 4.1 Onde e com quê

- Projeto Supabase **`qgemelnuqdilnggxmrdw`** (organização ACN SINAL VERDE). **O banco é o de produção. Não existe banco de teste.**
- URL e chave pública (anon) ficam **hardcoded** em `src/supabaseClient.ts`. **Não use `.env`.**
- Autenticação é pela tabela própria `auth_usuarios`, não pelo Supabase Auth. Desde 22/10/2026 o banco **só aceita quem entrou** (crachá = sessão do banco,
  `SessaoBanco.ts`), exceto os dois portais do cliente (`public/portal.html` e `public/veiculo.html`, 4 tabelas).
- **Ferramentas:** o servidor MCP do Supabase.
  - `apply_migration`: **toda mudança de estrutura** (tabela, coluna, índice, política, função, gatilho) e toda **correção em massa de dados autorizada**. Nome em
    `snake_case` e **comentário no SQL explicando o porquê**.
  - `execute_sql`: **leitura** (conferir, contar, medir). Escrever dado por aqui só com pedido explícito do dono, e relatando a contagem.
  - Outras úteis: `list_tables`, `list_migrations`, `get_advisors` (segurança e desempenho), `query_logs`.
- **Não existe uso da CLI do Supabase neste projeto** nem chave de serviço (`service_role`) no repositório. **Se o seu ambiente não tem o MCP do Supabase conectado
  (pode ser o caso do Cursor), pare:** escreva o SQL em `supabase/sql/`, explique o que ele faz e **peça ao dono que o aplique ou que conecte o MCP**. Não improvise
  com outra credencial, outra ferramenta ou chave encontrada em arquivo.
- Funções de servidor (`supabase/functions/`: `send-whatsapp`, `send-email`, `whatsapp-admin`, `whatsapp-webhook`, `transcrever-audio`, `save-email-config`) **são produção
  também**: não faça deploy delas sem pedido explícito do dono. (Regra proposta neste documento, por prudência.)

### 4.2 Registro em `supabase/sql/` (o log que a próxima máquina lê)

- **Toda migração aplicada e toda correção em massa deixa um arquivo `.sql` em `supabase/sql/`**, com o **mesmo SQL** aplicado e um cabeçalho em comentário: o pedido, a
  data, a regra, o que **não** entra e como desfazer. Exemplo a imitar: `supabase/sql/telefones_padrao_brasileiro.sql`.
- O arquivo vai **no mesmo commit** do código que depende dele. Nome em `snake_case` que descreve o assunto (e a onda, quando houver).
- Quando houver ensaio e reversão, guarde também os arquivos `*_ensaio_*` e `*_reverter.sql` (como na Etapa 17).
- SQL idempotente sempre que der (`if not exists`, `create or replace`, `drop … if exists`), porque duas máquinas podem tentar a mesma coisa.

### 4.3 Veto: dado real de produção

- **Não altere dado real sem pedido explícito do dono** (regra 4). Nada de "aproveitei e arrumei". Correção em massa **só com autorização, e sempre relatando quantas
  linhas mudaram** (antes e depois).
- **Nunca apague dado do usuário** (regra 5). Remover coluna ou tabela: **confirme antes**.
- Correção em massa autorizada: (1) conte o que muda antes (`select count(*)` com a mesma condição); (2) **copie o valor antigo** para uma tabela
  `<assunto>_antes_<aaaammdd>`; (3) aplique com `apply_migration`; (4) confira a contagem depois; (5) se desligou gatilhos para a troca, **religue e confira**
  (`pg_trigger.tgenabled`); (6) relate os números e **o que ficou como estava e por quê**.
- **Valor do dono é valor do dono:** não "normalize" campo livre, não preencha campo vazio e não mude status por conta própria.

### 4.4 Testes: gravação bloqueada ou `ZZTESTE`

- **Padrão do projeto:** teste de navegador com **todas as gravações bloqueadas** (interceptar e abortar qualquer requisição que não seja GET/HEAD/OPTIONS) e, quando
  precisar de um cenário que não existe nos dados reais, **responder a leitura com dado simulado** (`respond(...)`, com os cabeçalhos de CORS incluindo
  `Access-Control-Allow-Headers: authorization, apikey`). Isso permite ler o corpo do que **seria** gravado. Puppeteer headless em `scratchpad/fstest/`, com o Chrome do
  Windows; use `decodeURIComponent(url.replace(/\+/g, ' '))` ao inspecionar URL do supabase-js.
- Se **precisar** gravar de verdade: só registros **`ZZTESTE`**, **apague depois e confira a contagem**.
- Para entrar no sistema nos testes: usuário em `localStorage.user` **e** o crachá real da conta de teste em `localStorage.acn_sessao_banco`. A conta de teste é
  `ZZTESTE (conta de teste)` (`zzteste@teste.acn.invalid`). **A senha NÃO está no repositório:** fica em `%USERPROFILE%\.acn-teste\zzteste.json`
  (`{"email","senha"}`) em cada máquina; se não existir, peça ao dono. **Nunca** escreva senha, token ou chave em arquivo do repositório, em commit ou em relato.
- A conta `ZZTESTE` tinha 33 abas em 04/11/2026: **não prova bloqueio por aba**. Para provar um bloqueio, use a leitura de uma pessoa real com poucas abas.
- O menu lateral é uma gaveta escondida: troque de tela por script clicando em `.sidebar-item` pelo texto de `.sidebar-rotulo`.

### 4.5 Duas máquinas, um só banco

1. **Antes de aplicar qualquer migração:** olhe o estado **real** (`list_tables`, consulta a `information_schema`, `list_migrations`). A outra máquina pode ter acabado de
   aplicar algo parecido.
2. **Uma migração por vez em cada tabela.** Se outra máquina está mexendo na mesma tabela, avise o dono antes.
3. **Aditivo primeiro, destrutivo depois:** acrescente a coluna/tabela, publique o código, e só depois (com confirmação) retire o que ficou sem uso.
4. Depois de aplicar, **escreva o arquivo em `supabase/sql/` e commite**: é o que avisa a outra máquina.
5. Se `list_migrations` mostrar uma migração que **não** tem arquivo no repositório, não a ignore: avise o dono, e traga o SQL para `supabase/sql/` se ele permitir.

### 4.6 Regras de segurança para objeto novo (Etapa 17)

- **Tabela nova:** RLS ligada (o gatilho `ensure_rls` já liga) e a política `etapa17_logado`
  (`for all to authenticated using (public.esta_logado()) with check (public.esta_logado())`). Sem política, ninguém lê.
- **Nunca** dar direito à chave pública (`anon`) nem criar política "libera tudo".
- Tabela que só algumas abas usam: política `etapa17_abas` com `public.tem_alguma_aba(array['aba1','aba2'])`. **Antes de separar por aba, conte quantos usuários ativos
  têm essas abas** (`auth_usuarios.abas_permitidas`): se quase todos têm, a separação não protege ninguém.
- **Tela que só precisa achar um card** (título, órgão, PV, responsável, datas) **lê `crm_oportunidades_basico` / `licitacoes_basico`, nunca a tabela cheia.**
- **Função nova:** quem entrou executa; a chave pública não. **Função de gatilho nova:** `revoke all … from public, anon, authenticated`.
- Dado sensível (RH, WhatsApp, e-mail, cópia de segurança) já nasce com regra por perfil (`supabase/sql/etapa17_onda1a.sql`).
- Gatilho de tabela fechada por aba que grava OUTRA tabela deve ser `security definer`.

---

## 5. Checklist rápido (cole mentalmente antes de cada entrega)

- [ ] Li `CLAUDE.md`, o plano ativo e (se for comando) o `SKILL.md`; conferi o que o plano diz contra o código atual.
- [ ] Procurei na tabela de utilitários antes de criar; se criei utilitário, **acrescentei a linha**.
- [ ] `git fetch` feito; a `main` está dentro da minha branch; nada de trabalho alheio descartado.
- [ ] Migração (se houver): estado real conferido, aplicada por `apply_migration`, arquivo em `supabase/sql/`, contagem relatada.
- [ ] `npx vite build` verde **depois** do último merge. Tela alterada testada com gravação bloqueada.
- [ ] Plano `.md` (e manual, se houver) atualizado **no mesmo commit**.
- [ ] Mensagem de commit em português; sem segredo em lugar nenhum.
- [ ] **Autorização de push dada pelo dono para esta tarefa** (ou modo noite ligado por ele nesta sessão).
- [ ] Deploy acompanhado até o sucesso; relato com números reais e o que ficou de fora.

## 6. Quando parar e perguntar

- O pedido tem mais de uma leitura possível, ou a resposta muda o que será construído.
- Vai mexer em **dado real**, apagar algo, ou remover coluna/tabela.
- Há mudança local ou migração no banco que você **não reconhece**.
- Conflito de merge que envolve **regra de negócio**.
- Falta uma ferramenta (MCP do Supabase, `gh`, senha da conta de teste) e a única saída seria improvisar.
- O build ou o deploy falham por um motivo que não é do código.

---

*Manutenção deste arquivo:* quem mudar a forma de trabalhar (nova regra de gate, nova máquina, novo comando em `.claude/skills/`) atualiza a seção correspondente e a data
no cabeçalho **no mesmo commit**. Se este arquivo e o `CLAUDE.md` divergirem, corrija este.
