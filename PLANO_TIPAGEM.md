# PLANO_TIPAGEM — sair do `// @ts-nocheck`, por etapas, sem mexer no que está no ar

> **Status: PROPOSTA para aprovação (27/11/2026).** Nada disto foi aplicado. O `CLAUDE.md` continua
> dizendo "não remover o `@ts-nocheck`" até o usuário aprovar o texto novo da seção 8.
> Tudo que está aqui foi **medido no código de 27/11/2026** (commit `1fa502a`), num experimento
> descartável (tirei a diretiva de todos os arquivos, rodei o `tsc`, desfiz com `git checkout`).
> O que é **estimativa** está escrito "estimativa".

---

## 1. Em duas frases

O `@ts-nocheck` não está derrubando o sistema, mas **desliga a checagem de tipos em 284 dos 399
arquivos (71%), que são 88% das linhas** — e, ao contrário do que parece, **a maior parte disso sai de
graça**: 203 desses 284 arquivos já passam na checagem como estão, sem corrigir uma vírgula.
O trabalho de verdade (e o que dá segurança de verdade) começa depois, ao ligar `noImplicitAny` e os tipos do banco.

---

## 2. Números medidos

### 2.1 Onde está a diretiva

| Tipo de arquivo | Arquivos | Com `@ts-nocheck` | Sem | Linhas com `@ts-nocheck` |
|---|---:|---:|---:|---:|
| Telas `*Tab.tsx` | 38 | **38 (100%)** | 0 | 54.675 |
| Componentes `.tsx` (não `Tab`) | 201 | **190** | 11 | 54.345 |
| Módulos `.ts` de regra e dados | 159 | **56** | 103 | 9.056 |
| Hooks `.ts` | 1 | 0 | 1 | 0 |
| **Total** | **399** | **284 (71%)** | **115** | **118.076 de 133.674 (88%)** |

Leitura: **as regras de negócio puras já estavam em boa parte checadas** (103 de 159 módulos `.ts`,
os que foram escritos nas últimas fases). O que está fora da checagem são as telas e quase todos os componentes.

### 2.2 Configuração atual (`tsconfig.app.json`)

- `strict: false`, `noImplicitAny: false` (escrito de propósito, explícito), `noUnusedLocals/Parameters: false`.
- Ligados: `skipLibCheck`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`.
- `npm run typecheck` = `tsc --noEmit -p tsconfig.app.json`: **passa limpo hoje, em ~8 s**, porque só olha os 115 arquivos sem a diretiva.
- **O `vite build` não checa tipos** (só empacota) e o **GitHub Actions só roda `npx vite build`**
  (`.github/workflows/deploy.yml`): **nem o `typecheck` roda antes de publicar**.
- O cliente do Supabase é **sem tipos** (`createClient(...)` puro, 181 tabelas citadas em `.from('…')`, ~1.750 chamadas
  a `.from(`/`.rpc(`): toda linha que volta do banco é `any`.
- Uso de `any` explícito (`: any`, `as any`, `<any>`): **845** nos arquivos já checados e **5.031** nos com diretiva. Ou seja,
  **tirar o `@ts-nocheck` não elimina `any`**; só faz o `tsc` olhar o resto.

### 2.3 O que acontece se a diretiva sair de TODOS os arquivos (medido, não extrapolado)

Como o `tsc` consegue ler o projeto inteiro em 35 s, **não precisei estimar por amostra: medi os 284 arquivos de uma vez**,
em quatro níveis de rigor.

| Rigor | Erros no total | Arquivos que ainda passariam limpos (dos 284) |
|---|---:|---:|
| **Como está hoje** (`strict` desligado) | **457** em 81 arquivos | **203** (52.259 linhas) |
| + `noImplicitAny` | **3.650** em 171 arquivos | 118 |
| + só `strictNullChecks` | **3.441** em 125 arquivos | 160 |
| `strict` completo (com `noImplicitAny`) | **6.411** em 171 arquivos | 117 |

Por tipo de arquivo (dos 284 com diretiva), no nível de hoje: módulos `.ts` **50 de 56 já limpos**; componentes **139 de 190**;
telas **14 de 38**. No `strict` completo: módulos `.ts` 46/56 limpos, componentes 70/190, telas 1/38. Erros por mil linhas no
`strict` completo: módulos **4**, componentes **54**, telas **63**.

Os 457 erros de hoje distribuem-se assim (dá a ordem de ataque da etapa 2):

| Tamanho do arquivo-problema | Arquivos | Erros |
|---|---:|---:|
| 1 erro | 33 | 33 |
| 2 a 3 erros | 19 | 50 |
| 4 a 10 erros | 19 | 119 |
| 11 ou mais | 10 | 255 |

Os dez maiores (`FiscalCadastrosTela`, `AplicarEstrutura`, `RHTab`, `BotoesLiberacao`, `ProducaoTab`, `FiscalRegrasTela`,
`Estoque`, `RelatoriosTab`, `FiscalArquivoTela`, `SetorDemandaTab`) respondem por 56% do total.
Os quatro arquivos grandes que o `CLAUDE.md` manda perguntar antes (Admin, `DemandaAvulsaPanel`, `CadastroProdutosTab`,
`VeiculosNfcTab`) têm **6, 0, 0 e 0** erros hoje.

**Amostra de 21 arquivos** (pedida no briefing; vale como ilustração, os totais acima são do projeto inteiro):

| Arquivo | Linhas | Hoje | + noImplicitAny | + strictNull | strict |
|---|---:|---:|---:|---:|---:|
| `FormacaoFamilia.ts` | 19 | 0 | 0 | 0 | 0 |
| `ContatoObrigatorio.ts` | 63 | 0 | 0 | 0 | 0 |
| `PedidoValores.ts` | 93 | 0 | 0 | 0 | 0 |
| `PontoRh.ts` | 189 | 0 | 0 | 0 | 0 |
| `ComprasEntregas.ts` | 495 | 0 | 1 | 0 | 0 |
| `GarantiaModelo.ts` | 627 | 0 | 2 | 0 | 0 |
| `SacFluxo.ts` | 693 | 0 | 0 | 1 | 1 |
| `CampoDataDaNota.tsx` | 21 | 0 | 0 | 0 | 0 |
| `ViagemRelatorioTela.tsx` | 86 | 1 | 1 | 1 | 1 |
| `AdminPainelChecklist.tsx` | 152 | 0 | 0 | 0 | 0 |
| `TerceirosAcoes.tsx` | 250 | 0 | 17 | 2 | 19 |
| `InicioGerenciar.tsx` | 312 | 1 | 1 | 2 | 2 |
| `AdminPainelDados.tsx` | 396 | 0 | 0 | 0 | 0 |
| `MencoesInboxPanel.tsx` | 532 | 0 | 0 | 0 | 0 |
| `TelecomTab.tsx` | 66 | 1 | 2 | 1 | 2 |
| `GarantiaTab.tsx` | 455 | 3 | 3 | 4 | 4 |
| `FiscalTab.tsx` | 1.027 | 3 | 81 | 127 | 193 |
| `HorasTarefasTab.tsx` | 1.276 | 1 | 2 | 1 | 2 |
| `LogisticaTab.tsx` | 2.555 | 7 | 40 | 87 | 122 |
| `ProducaoTab.tsx` | 3.189 | 27 | 162 | 341 | 435 |
| `ComprasTab.tsx` | 3.283 | 3 | 27 | 6 | 30 |

Duas coisas se veem aqui: (1) **o tamanho do arquivo não prevê a dor** — `ComprasTab` (3.283 linhas) tem 30 erros no `strict` e
`FiscalTab` (1.027) tem 193; depende de o código ter sido escrito com tipos "no espírito" ou não; (2) o estilo recente do projeto
(módulos pequenos, regra pura separada da tela) é exatamente o que passa limpo.

### 2.4 Causas dos 457 erros de hoje (agrupadas)

| Causa | Erros | O que é, em português |
|---|---:|---|
| Campo que a tela lê mas o objeto de estado não declarou (`TS2339`, `TS2353`, `TS2345`) | 193 | `useState({...})` com um formato inicial e depois se usa um campo que não estava lá (ex.: `AdminTab`, `RHTab`: `form.cep`, `form.empresa`). Em JavaScript funciona; o tipo só está incompleto |
| Valor do tipo errado ou incompleto (`TS2322`, `TS2739`, `TS2741`) | 186 | prop obrigatória que na prática é opcional (`acima` do banner), resposta do Supabase passada onde se espera `Promise`, texto num campo tipado como lista fechada |
| Nome que não existe (`TS2304`) | 29 | **todos no arquivo morto `BotoesLiberacao.tsx`** (ver 3.2) |
| Conversão forçada duvidosa (`TS2352`), aritmética com tipo não numérico (`TS2362/2363`) | 32 | tipos escritos de forma frouxa; datas e números |
| Número de argumentos diferente do declarado (`TS2554`, `TS2794`, `TS1345`, `TS2367`, `TS2698`, `TS2769`) | 16 | quase todos com a declaração desatualizada (ver 3.2) |
| `require` sem tipo (`TS2591`) | 1 | `MencaoTextarea.tsx` — **falso alarme**, ver 3.2 |

Esta tabela é por familia de código de erro (`TS…`), conferida lendo algumas dezenas de exemplos; não é uma análise linha a linha dos 457.

---

## 3. O `@ts-nocheck` é um problema aqui? (franqueza)

### 3.1 O que é aparência (para quem revisar de fora)

- Quem rodar `grep -r ts-nocheck src` vê **284 acertos em 399 arquivos** e conclui "o projeto não usa TypeScript de verdade".
  É uma leitura rápida e injusta em parte: **103 módulos de regra já são checados** e passam até quase no `strict`
  (nos 115 arquivos que já checam, só 6 erros aparecem se ligar o `strict` completo).
- O que o revisor vai de fato estranhar: `strict: false` + `noImplicitAny: false` escrito à mão + cliente do banco sem tipos +
  5.876 `any`. **Isso é mais pesado que a diretiva**, e tirar só a diretiva não resolve.
- Dá para vender "TypeScript de verdade" com honestidade? **Hoje, não.** Depois da etapa 2 (zero `@ts-nocheck`), parcialmente
  (checa nome, argumento, propriedade, mas não exige tipo). Depois da etapa 4 (tipos do banco + `noImplicitAny`), sim.

### 3.2 O que é risco real (e o que NÃO é)

Fui atrás dos tipos de erro que costumam esconder bug (nome inexistente, número de argumentos, comparação impossível).
Resultado honesto: **entre os 457 não achei nenhum bug que esteja quebrando coisa hoje em produção.** O que achei:

1. **Um arquivo morto e quebrado: `src/BotoesLiberacao.tsx`** (449 linhas, **ninguém importa**). Usa `FLUXO_LIBERACOES`,
   `setLoading`, `usuarioAtual`, `onLiberacaoSucesso`… que não existem. Se alguém o importasse, quebraria na hora; com a diretiva,
   nenhum aviso. Os dois outros nomes estranhos (`AdminTab-NOVO.tsx`, `PCPTab-COM-PERMISSOES.tsx`) são arquivos de uma linha (`export {};`).
   → candidatos a apagar, **com OK do usuário** (regra 5).
2. **O custo já aparece no próprio código**: o comentário de `src/ErroDeArquivo.ts` (linha 36) diz que **não se mudou o que as
   funções devolvem "de propósito: os componentes são `@ts-nocheck`, então um chamador esquecido que trocasse 'nada' por um objeto
   passaria a tratar toda falha como sucesso, sem nenhum aviso"**. E `AuditSystem.tsx` (linha 52) tem uma queixa parecida. Ou seja:
   **a equipe já deixa de melhorar assinaturas por medo de quebrar um chamador em arquivo sem checagem.** Esse é o risco real:
   **o módulo `.ts` checado muda, o componente sem checagem que o chama quebra em silêncio, e só se descobre em uso.**
3. **Assinaturas desatualizadas**: `atualizarEntregavel` (`DesenvolvimentoModelo.ts`) declara `mudar` com 1 parâmetro e o chama com 2;
   `carregarLote` declara `aoProgresso = () => {}` e o chama com 2 argumentos; `OplEdicao.tsx` compara com `'cep'` e `'telefone'` num tipo
   que não os lista. Nenhum quebra hoje, mas são exatamente o tipo de descuido que, numa refatoração, vira bug.
4. **Falso alarme que eu quase contei como bug:** `MencaoTextarea.tsx:351` usa `require('react-dom')` (o `tsc` reclama e, num navegador
   comum, `require` não existe). **Conferi no pacote que o `vite build` gera: o empacotador resolve esse `require` e o portal funciona.**
   Não é bug em produção; é só um estilo antigo (deveria ser um `import`). Registro aqui porque mostra o que é ruído.
5. **Campo lido que nunca foi inicializado** (`RHTab`: `form.cep`, `form.empresa`; `ProducaoTab`: `tecnico_producao_id`, `status_geral`):
   em JavaScript dá `undefined` e a tela segue. Pode causar um aviso de campo "não controlado" ou um valor vazio onde se esperava texto.
   Não verifiquei um a um se algum causa defeito visível.

**Veredito:** o `@ts-nocheck` é **dívida real, mas barata de pagar na parte "olhar o que já existe"** (a etapa 1 e a 2 juntas são
457 erros, um número pequeno para 133 mil linhas), e **o ganho de segurança grande não vem de tirar a diretiva, vem de tipar o banco
e de ligar `noImplicitAny`**. Para o plano de negócio (produto vendável) o ganho mais visível é o de imagem + a rede de proteção
que a equipe nova vai querer; para o dia a dia da fábrica, é **proteção contra regressão** em refatorações futuras (nome de campo,
assinatura de função), não correção de defeito atual.

---

## 4. Princípios do plano

1. **Tirar uma linha de comentário não muda o programa.** O `vite build` não checa tipos e o JavaScript gerado é o mesmo; por isso
   a etapa 1 tem **risco de execução zero**. O único risco é de processo (o `typecheck` ficar vermelho): por isso só tiro a diretiva
   do arquivo que **já passa**.
2. **O `typecheck` fica sempre verde.** Nunca commitar com ele vermelho, nem "para consertar depois".
3. **Só anotar tipo, nunca mexer na lógica.** Corrigir tipo não pode virar "aproveitei e arrumei". Se o `tsc` apontar um bug de
   verdade, **ele sai num commit separado, com OK do usuário**, porque muda comportamento (regra 4 do `CLAUDE.md`).
4. **Nada disto toca o banco nem regrava dado.** Tipo é só do navegador. A única ferramenta que consulta o banco (gerar tipos do
   esquema, etapa 3) **só lê a estrutura das tabelas, nunca as linhas**.
5. **Uma etapa por vez, cada uma publicável sozinha** e com a marca de que não piora nada (o ratchet da seção 5).

---

## 5. Etapas

### Etapa 0 — Arrumar a casa (½ dia)

- Apagar `src/BotoesLiberacao.tsx`, `src/AdminTab-NOVO.tsx`, `src/PCPTab-COM-PERMISSOES.tsx` (**só com OK**; o histórico do git guarda).
- **Rede de proteção no deploy:** acrescentar `- run: npm run typecheck` antes do `npx vite build` em `.github/workflows/deploy.yml`.
  Hoje um erro de tipo nunca barra a publicação. (Mexer no workflow muda o deploy: **decisão do usuário**.)
- Criar o **ratchet da diretiva** (`ferramentas/tipagem/conferir_nocheck.cjs` + `ferramentas/tipagem/nocheck.lista.txt`):
  a lista é o retrato dos arquivos que ainda têm `@ts-nocheck`. O script **falha** se (a) um arquivo tem a diretiva e não está na
  lista (arquivo novo nasceu "sem checagem") ou (b) um arquivo está na lista mas já não tem a diretiva (esqueceram de atualizar a lista).
  A lista só encolhe. Entra em `npm run conferir` (= `typecheck` + esse script).
- **Verificação:** `npm run conferir` verde; `npx vite build` verde; rodar o script contra um arquivo novo de teste e ver que barra.
- **Reverter:** `git revert` do commit. Sem efeito em produção.

### Etapa 1 — Tirar a diretiva dos 203 arquivos que já passam (1 dia, **sem corrigir nada**)

- **Em três commits**, para dar para reverter por grupo: (a) 50 módulos `.ts`; (b) 139 componentes `.tsx`; (c) 14 telas `*Tab.tsx`.
  A lista exata dos 203 sai do próprio experimento (rodar `tsc` sem a diretiva e pegar quem tem zero erros; script guardado em
  `ferramentas/tipagem/`).
- Atualizar `nocheck.lista.txt` no mesmo commit.
- **Verificação:** (1) o diff de cada commit **só remove a linha da diretiva** (script confere linha a linha, nenhum outro byte muda);
  (2) `npm run conferir` verde; (3) `npx vite build` verde; (4) **ideal:** comparar o conteúdo dos arquivos gerados do build antes e
  depois (devem ser idênticos, já que só um comentário saiu); (5) os testes existentes de regras:
  `node ferramentas/teste_fiscal/teste_fiscal.mjs`, `node ferramentas/teste_enderecos/teste_rotas.mjs` (puros, sem banco).
  Não precisa de teste no navegador, porque o programa gerado não muda.
- **Ganho:** de 284 para **81** arquivos com a diretiva (29%) em um dia; 203 arquivos (52.259 linhas) passam a ter rede de proteção
  contra nome inexistente, argumento a mais ou a menos e propriedade inexistente.
- **Reverter:** `git revert` do grupo.
- **Estimativa de esforço:** 1 dia (a maior parte é montar o script e conferir; a mudança em si é mecânica).

### Etapa 2 — Zerar os 81 arquivos restantes (457 erros, **estimativa 3 a 5 dias**)

- Ordem: primeiro os **33 arquivos de 1 erro** e os **19 de 2 a 3** (52 arquivos, 83 erros: ~1 dia), depois os **19 de 4 a 10**
  (119 erros: ~1 a 2 dias) e por último os **10 grandes** (255 erros, ~1 a 2 dias). Um arquivo por commit ou grupo pequeno; a diretiva
  sai quando o arquivo zera.
- Técnicas permitidas (nesta ordem de preferência): declarar o tipo do estado (`useState<Form>(…)` com os campos todos); tornar opcional
  a prop que na prática é opcional; tipar o retorno; só **em último caso** `as` ou `any` explícito **com um comentário dizendo o porquê**
  (padrão do projeto: comentário explica a decisão).
- **O `any` explícito não é bem-vindo como atalho** (ver 3.1): serve para destravar o arquivo, e fica contado para a etapa 5.
- **Efeito dominó (estimativa +20 a 30%):** tipar o estado de um arquivo pode fazer aparecer erro em outro que o usa. Por isso 3 a 5 dias, e não
  um dia só pela conta bruta.
- **Verificação por arquivo:** `npm run conferir` verde; `npx vite build` verde; **diff revisado**: só anotação de tipo, nenhuma lógica
  mudou (revisão por leitura; arquivo grande de tela passa por um teste de navegador com gravações bloqueadas, como o padrão do projeto,
  nas telas mais mexidas: Produção, RH, Estoque, Relatórios).
- **Telas dos quatro arquivos grandes** do `CLAUDE.md`: têm 0 a 6 erros, então **o problema da pergunta ("migrar a tela inteira?") não
  aparece aqui**; o Admin (6 erros) é o único a avisar o usuário antes.
- (O arquivo morto `BotoesLiberacao.tsx`, se for apagado na etapa 0, leva 32 desses erros: sobram 425 em 80 arquivos.)
- **Gate de saída:** **zero `@ts-nocheck` em `src/`**, `nocheck.lista.txt` vazia. O script do ratchet passa a só conferir "nenhum arquivo
  tem a diretiva".
- **Reverter:** por commit.

### Etapa 3 — Tipos do banco no cliente Supabase (experimento de ½ dia, depois **estimativa 1 a 2 semanas**)

É aqui que mora o ganho grande de segurança: hoje toda linha lida do banco é `any`, então um erro de digitação em
`select('codigo,nome')` ou em `.eq('opl_id', …)` só aparece quando alguém usa a tela.

1. **Experimento primeiro (descartável, no worktree):** gerar os tipos do esquema (ferramenta do Supabase, **só estrutura, sem linhas**), pôr em
   `src/banco.tipos.ts`, trocar para `createClient<Database>(…)` e **contar os erros novos** (não sei quantos serão: não medi; pode ser
   centenas nas telas). Decidir depois com o número na mão.
2. Se vale: aplicar em fatias por tela (começando por Fiscal, Financeiro e Compras, onde o erro custa mais), com o ratchet por arquivo
   da etapa 4.
3. **Cuidados:** (a) o repositório é público: o esquema já está em `supabase/sql/` e nos `.sql` da raiz, mas confirmar com o usuário que um
   arquivo único com todas as tabelas não incomoda; (b) visões e funções (`rpc`) têm tipos próprios no gerador; as colunas `*_valores`
   (V4, dinheiro restrito) e as visões mascaradas (`*_basico`) devem aparecer com o tipo certo; (c) o arquivo gerado precisa ser
   **refeito a cada migração** (acrescentar ao roteiro de migração do `CLAUDE.md`: "rodar `npm run tipos:banco`").
- **Verificação:** `npm run conferir`; `vite build`; cada tela tocada em teste de navegador com gravações bloqueadas.
- **Reverter:** voltar `createClient` para o sem tipos (uma linha) — o resto continua funcionando, pois os tipos só avisam.

### Etapa 4 — `noImplicitAny` por arquivo, com o ratchet de erros (**estimativa 3 a 4 semanas de trabalho contínuo para o projeto todo;
recomendo NÃO varrer tudo de uma vez**)

- Hoje seriam **3.650 erros** (1.725 parâmetros sem tipo, 1.149 desestruturações sem tipo, 215 acessos por chave de texto, o resto
  mistura). Sozinho, isso é mecânico, mas **só vale se os tipos forem de verdade** (tipos do banco da etapa 3 ou `interface` do domínio:
  `Op`, `Pedido`, `Usuario`…); preencher `(u: any)` só para calar o `tsc` é maquiagem.
- Mecanismo (**ratchet por arquivo**): `tsconfig.estrito.json` (herda o `tsconfig.app.json` com `strict` e `noImplicitAny` ligados) e um
  script (`ferramentas/tipagem/orcamento_erros.cjs`) que roda o `tsc` com ele e compara **o número de erros de cada arquivo** com um
  orçamento guardado (`ferramentas/tipagem/orcamento_erros.json`, um número por arquivo com dívida). Regras: um arquivo **pode baixar** o
  número, **nunca subir**; **arquivo que não está no orçamento tem zero** — ou seja, **arquivo novo já nasce estrito**, sem precisar de
  diretiva para nada. (Foi preciso pensar nisto assim porque o `include` do `tsc` arrasta os arquivos importados e o `tsc` não tem
  "estrito só nesses".)
- Ordem sugerida: módulos `.ts` (46 já passam; ~10 erros no total) → componentes pequenos → telas por risco (Fiscal, Financeiro, Compras,
  Estoque, Produção) → resto. **Regra do escoteiro:** mexeu numa tela por outro motivo, deixa o arquivo estrito (o orçamento baixa).
- **Verificação:** `npm run conferir` (`typecheck` + ratchet da diretiva + ratchet do orçamento); `vite build`.
- **Reverter:** apagar o `tsconfig.estrito.json` e o script; o código continua igual (só ficou com mais tipos).

### Etapa 5 (opcional, só se o produto pedir) — `strictNullChecks` e o resto do `strict`

- **Hoje: 3.441 erros só de `strictNullChecks`; 6.411 no `strict` completo.** São os que mais pegam bug de verdade (`undefined`
  numa conta, `null` que viaja) e **os mais trabalhosos** (cada um é decisão de comportamento: "e se vier vazio?").
- **Recomendo** ligar **só nos módulos de dinheiro e fiscal** (`Fiscal*.ts`, `PedidoValores.ts`, `CustoMaoDeObra.ts`, preço/formação),
  pelo mesmo ratchet, e **não** nas telas inteiras. Só depois, e só se houver motivo, `no-explicit-any` no lint para atacar os 5.876 `any`.
- **Reverter:** idem etapa 4.

### Resumo do esforço (todas as estimativas são estimativa, uma pessoa, em tempo de trabalho concentrado)

| Etapa | O que fica verdade no fim | Esforço | Erros a resolver |
|---|---|---|---:|
| 0 | arquivo morto fora, `typecheck` no deploy, trava para arquivo novo | ½ dia | 0 |
| 1 | 203 arquivos checados; 81 com diretiva | 1 dia | 0 |
| 2 | **zero `@ts-nocheck`** | 3–5 dias | 457 |
| 3 | banco tipado (nome de coluna e de tabela conferidos) | ½ dia de experimento + 1–2 semanas | desconhecido até o experimento |
| 4 | `noImplicitAny` por arquivo, arquivo novo nasce estrito | 3–4 semanas se for tudo; rende por escoteiro | 3.650 |
| 5 | `strictNullChecks` nos módulos de dinheiro e fiscal | a medir | 3.441 (projeto todo) |

**As etapas 0 a 2 juntas são ~1 semana e já resolvem a aparência e o risco de "mudar uma função e quebrar um chamador sem aviso".**

---

## 6. Ligar `strict` aos poucos vale a pena?

**Sim, mas por arquivo (ratchet), nunca global de uma vez**, e na ordem: `noImplicitAny` → tipos do banco → `strictNullChecks` →
o resto do `strict`. Ligar `strict: true` no `tsconfig.app.json` hoje geraria **6.411 erros** de uma vez e travaria qualquer commit.
O mecanismo da etapa 4 resolve isso: o orçamento por arquivo trava o que já está limpo, deixa a dívida visível e mensurável
("3.650 → 3.100 → …") e faz todo arquivo novo nascer limpo. Dá até um número simples para mostrar a um comprador ou revisor:
"X% das linhas sob `strict`".

---

## 7. Riscos e como cada um é tratado

| Risco | Tratamento |
|---|---|
| Mudar comportamento em produção "sem querer" ao anotar tipo | Etapa 1 só remove um comentário (programa gerado idêntico). Etapas 2+ só anotam; diff revisado; bug achado vira commit separado com OK do usuário |
| `typecheck` vermelho travando o trabalho do dia | Nunca commitar vermelho; etapa 1 só nos arquivos que já passam; etapa 4 com orçamento, não com `strict` global |
| Duas sessões mexendo no mesmo arquivo (há várias conversas em paralelo neste projeto) | Cada etapa em fatia pequena e publicada logo; conferir `git fetch` antes de começar uma fatia (padrão do projeto) |
| Tipo "inventado" que mente sobre o banco | Etapa 3 usa os tipos gerados do esquema real, não escritos à mão; o arquivo é refeito a cada migração |
| Regravar dado | **Impossível por construção**: tipo não é dado. A única consulta ao banco é a leitura da estrutura (etapa 3) |
| Deixar o `any` virar o novo `@ts-nocheck` | Contar os `any` (845 + 5.031 hoje) e reportar a cada etapa; `any` só com comentário do porquê |
| Etapa 4 virar projeto sem fim | Ela é por orçamento e por escoteiro, com número no `ESTADO_ATUAL_PROJETO.md`; não bloqueia o produto |
| O plano disputar tempo com o `/ux-fluxo` e os outros planos | Etapas 0 e 1 cabem em um dia; a 2 em fatias de meio dia, "de dia", como os outros planos (regra de 16/10/2026) |

---

## 8. Proposta de texto novo para o `CLAUDE.md` (NÃO aplicado)

Hoje (linha 124): `- Todo componente começa com `// @ts-nocheck` — não remover.`

Proposta, **para entrar quando a etapa 0 for aprovada e aplicada** (e atualizar depois conforme as etapas avançam):

```markdown
- **Tipos (plano `PLANO_TIPAGEM.md`, aprovado em <data>).** Arquivo NOVO nasce **sem** `// @ts-nocheck` e precisa passar
  `npm run conferir` (`typecheck` + trava das diretivas). O `// @ts-nocheck` que já existe em arquivo antigo fica **até a etapa
  do plano chegar nele** — não remover à mão sem rodar `npm run conferir`, e **só tirar quando o arquivo passa limpo** (o plano
  vai tirando em lote, com a lista em `ferramentas/tipagem/nocheck.lista.txt`, que só encolhe). Nunca acrescentar a diretiva a um arquivo
  que não tem; se um arquivo novo "não fecha" no tipo, anote o tipo, não desligue a checagem. Corrigir tipo é **só anotação**: se o
  `tsc` apontar um erro que muda o comportamento, avise o usuário e faça em commit separado. `any` explícito só com um comentário
  dizendo o porquê.
```

E, na seção "Ambiente": `npm run conferir  # typecheck + trava das diretivas; gate junto com o vite build (a partir da etapa 0)`.
Depois da etapa 2, a primeira frase vira: "`// @ts-nocheck` é proibido em `src/`". Depois da etapa 4, acrescentar a regra do orçamento de erros.

---

## 9. Primeira etapa sugerida

**Etapa 0 + Etapa 1** (1 a 1,5 dia, risco de execução zero): é o que **mais muda a aparência e a segurança por hora gasta** (284 → 81
arquivos com a diretiva, com 52 mil linhas ganhando checagem), não exige decidir nada de arquitetura e não toca em tela nem em dado.
Decisões que dependem do usuário **antes** de começar: (1) apagar os três arquivos mortos; (2) aceitar o `typecheck` no GitHub Actions
(muda o deploy); (3) aprovar o texto da seção 8.

---

## 10. Como esta medição foi feita (para repetir)

- Contagem: percorrer `src/`, ver se a diretiva está nas 5 primeiras linhas (284 de 399; um `grep -rl` simples dá 285, porque `ErroDeArquivo.ts`
  só cita a palavra num comentário).
- Experimento: script que apaga a primeira linha-diretiva `// @ts-nocheck…` dos 284 arquivos, `npx tsc --noEmit -p tsconfig.app.json`
  (35 s), repetido com `--noImplicitAny`, `--strictNullChecks` e `--strict --noImplicitAny` (o `--strict` sozinho **não** liga o
  `noImplicitAny`, porque o `tsconfig.app.json` o desliga de forma explícita), agrupado por código de erro e por arquivo; depois
  `git checkout -- src` (nada ficou alterado). A cascata entre arquivos não muda a contagem de quem já passa: a diretiva só silencia
  mensagens, os tipos exportados são os mesmos.
- Os scripts ficaram fora do repositório (diretório de rascunho); na etapa 0 eles entram em `ferramentas/tipagem/` já limpos.
- Build de conferência do estado atual: `npx vite build` passou (1 min 22 s) em 27/11/2026; `npm run typecheck` passa em ~8 s.
