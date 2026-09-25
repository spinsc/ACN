# ACN Sinal Verde — como trabalhar neste projeto

Sistema de gestão interno da ACN/DETECH: OPs de produção, licitações, CRM, compras,
almoxarifado, produção, qualidade, fiscal, logística, RH e formação de preços.
React 19 + TypeScript + Vite, Supabase como banco, publicado no GitHub Pages.

> Este arquivo é o **contrato de trabalho**: vale para qualquer sessão, em qualquer
> conta ou máquina. A arquitetura detalhada está em [CONTEXTO_PROJETO.md](CONTEXTO_PROJETO.md);
> o que está em andamento, em [ESTADO_ATUAL_PROJETO.md](ESTADO_ATUAL_PROJETO.md).

---

## Como falar

**Sempre em português do Brasil**, inclusive comentários de código, mensagens de
commit e textos de tela. Sem jargão de programador nas explicações: quem lê decide
pelo processo da fábrica, não pelo código.

---

## Regras que não se quebram

1. **`npx vite build` antes de qualquer commit.** O `tsc` já deixou passar erro de
   sintaxe que só o build pegou. Build vermelho não vira commit.
2. **Nunca dar `git push` sem aprovação explícita do usuário.** Commitar local pode;
   publicar é decisão dele, pedida a cada vez.
3. **Na dúvida, perguntar antes de agir.** Se o pedido não está 100% claro, pergunte
   em vez de supor — vale mais uma pergunta que um retrabalho.
4. **Não alterar dado real sem pedido explícito.** Nada de "aproveitei e arrumei".
   Correção em massa só com autorização, e sempre relatando quantas linhas mudaram.
5. **Nunca apagar dado do usuário.** Para remover coluna ou tabela, confirmar antes.
6. **Teste em produção só com dado sintético.** O banco é o de produção: use registros
   `ZZTESTE`, apague depois e confira a contagem. Melhor ainda, e o padrão aqui: rodar
   com as **gravações bloqueadas** (ver Testes) e simular só as respostas de leitura.

---

## Ambiente

```bash
npm install                 # uma vez
npm run dev                 # dev server (use preview_start com o nome "acn-dev")
npx vite build              # gate obrigatório antes de commitar
npm run typecheck           # tsc, complementar — não substitui o build
```

O app roda em `http://localhost:5199/ACN/` (a base `/ACN/` vem do `vite.config.ts`).
O dev server é declarado em `.claude/launch.json` como **acn-dev**.

**Deploy:** `git push` para `main` dispara o GitHub Actions (`.github/workflows/deploy.yml`)
e publica no GitHub Pages. Não precisa rodar `publicar.bat` — ele é o caminho manual antigo.
Depois do push, acompanhe com `gh run watch <id>` e só considere entregue quando o deploy
terminar com sucesso.

---

## Banco (Supabase)

Projeto `qgemelnuqdilnggxmrdw`, organização **ACN SINAL VERDE**. URL e chave anon ficam
**hardcoded** em `src/supabaseClient.ts` — não usar `.env`.

- Autenticação é pela tabela própria `auth_usuarios`, **não** pelo Supabase Auth.
- Tabela nova precisa de **policy permissiva de RLS** — existe um trigger `ensure_rls`
  que recusa tabela sem policy.
- Colunas `*_norm` guardam o texto sem acento para busca (ver `SearchUtils`).
- Toda migração é feita por `apply_migration`, com comentário explicando o porquê.

---

## Como escrever o código

- Todo componente começa com `// @ts-nocheck` — não remover.
- **Comentário explica o porquê, não o quê.** O padrão do projeto é registrar a decisão
  e a data ("regra definida com o usuário em 21/09/2026: ..."), para quem ler daqui a
  seis meses entender a razão.
- Edições grandes: script Python no scratchpad, com `assert` de ocorrência única e
  escrita com `newline=''` + `os.replace`. **Heredoc de bash corrompe `\n` e `\u`** —
  não use para gerar código.
- Antes de criar algo novo, procure o utilitário que já existe:

| Assunto | Onde |
|---|---|
| Preço de venda (conta oficial) | `FormacaoCalculo.ts` — `custoComImpostos`, `precoUnitario` |
| Rota da entrega e filas | `FluxoEntrega.ts` |
| O que está ligado a uma OP | `OpVinculos.ts` |
| Pendências que travam a OP | `OpPendencias.tsx` |
| Itens vendidos × BOM × kiting | `OpItens.tsx` |
| Itens e vínculos de demanda | `DemandaItens.tsx` |
| Requisição de compra | `ComprasFluxo.tsx` — `criarRequisicaoCompra`, `origemDaRequisicao` |
| Pintura da serralheria | `PinturaSerralheria.tsx` |
| Busca sem acento | `SearchUtils.ts` |
| Data de hoje / dia de uma data | `Interface.tsx` — `hojeISO`, `diaISO` (nunca `toISOString`, que devolve o dia de Londres) |
| Botões, abas, selos, menus | `Interface.tsx` |
| Confirmar / pedir texto | `Feedback.tsx` — `confirmar`, `pedirTexto` |
| Auditoria e destaque de campo | `AuditSystem.tsx` |
| Permissões | `utils/permissoes.ts` |

---

## Testes no navegador

O padrão do projeto é Puppeteer headless em `scratchpad/fstest/`, com o Chrome do
Windows (`C:/Program Files/Google/Chrome/Application/chrome.exe`):

- injetar o usuário em `localStorage.user` para entrar no sistema;
- **interceptar e abortar toda requisição externa que não seja GET/HEAD/OPTIONS** —
  assim nenhum teste grava em produção, e dá para ler o corpo do que *seria* gravado;
- para simular um cenário que não existe nos dados reais, responder a consulta com
  `r.respond(...)` — e os cabeçalhos de CORS precisam incluir
  `Access-Control-Allow-Headers` com `authorization` e `apikey`, senão o navegador recusa;
- `decodeURIComponent(url.replace(/\+/g, ' '))` ao inspecionar URL do supabase-js.

Sempre rodar `npx vite build` **antes** do teste de navegador: erro de compilação deixa
a tela em branco e o teste engana.

---

## Regras de negócio que já foram decididas

- **Preço:** uma conta só no sistema inteiro —
  `preço = custo (com IPI e ST) × (1 + markup) ÷ (1 − DIFAL)`. Imposto e custo fixo
  descontam da margem, não entram no preço.
- **Markup, custo e DIFAL são da formação de preços**, livres por proposta (global ou
  item a item). Cadastro de Itens é só sugestão de partida. DIFAL começa zerado.
- **Numeração de OP:** `A` (ACN) ou `D` (Detech) + PV + ano + mês. Número repetido é
  bloqueado.
- **Kit 100%** não fecha com demanda de Serralheria, Chicotes ou Compras em aberto —
  o caminho nesse caso é "liberar com pendência". A **Produção não conclui** enquanto
  a pendência não fechar, e cada pendência fecha em três etapas: setor conclui →
  Almoxarifado confirma o recebimento → PCP libera.
- **Fabricação interna é sugestão, não pedido:** ao liberar o kiting o PCP vê o que é
  fabricado aqui dentro e marca o que quer solicitar. Nada vem marcado.
- **Compras é uma tela só:** toda demanda de compra vira requisição no quadro, com
  cotação e aprovação. Diferença é só o selo "Demanda de OP" ou "Demanda geral".
- **Serralheria com pintura:** quem abre a demanda descreve o tipo em texto livre;
  ao concluir a peça, a requisição de pintura nasce sozinha para o Compras.
- **Avisos de atualização** (`avisos_sistema`) expiram em 48h e saem em nome do Matheus.

---

## Entregando

Relate o que foi feito em linguagem de processo, com os números reais dos testes e o
que ficou de fora. Se algo falhou, diga que falhou — não arredonde.
