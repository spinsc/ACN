# Ferramentas da tipagem (PLANO_TIPAGEM.md, 27/11/2026)

Tudo aqui é só do navegador/código: **nada toca o banco**. Rode da raiz do projeto.

| Comando | O que faz |
|---|---|
| `npm run conferir` | `typecheck` + a trava das diretivas. É o que o deploy roda antes do `vite build`. Rode antes de commitar, junto do build. |
| `node ferramentas/tipagem/conferir_nocheck.cjs` | Só a trava: os arquivos de `src/` com `// @ts-nocheck` têm de ser **exatamente** os de `nocheck.lista.txt`. Arquivo novo com a diretiva = falha; arquivo que saiu e continua na lista = falha. |
| `node ferramentas/tipagem/conferir_nocheck.cjs --gravar` | Regrava a lista com o estado atual. **Só depois de TIRAR a diretiva de arquivos**, nunca para aceitar um arquivo novo. |
| `node ferramentas/tipagem/listar_limpos.cjs saida.txt` | Diz quais arquivos da lista já passariam no `tsc` sem a diretiva (tira a diretiva de todos, roda o `tsc`, restaura tudo no fim). Rode com a árvore sem alterações em `src/` (demora ~40 s). `--rigor=noImplicitAny` ou `--rigor=strict` mede o rigor maior. |
| `node ferramentas/tipagem/tirar_diretiva.cjs saida.txt` | Tira a diretiva dos arquivos da lista `saida.txt`, **prova que mais nada mudou em cada arquivo** e os tira de `nocheck.lista.txt`. Não faz commit. |

Regras (decididas no plano): a lista **só encolhe**; arquivo novo nasce **sem** a diretiva; corrigir tipo é só anotar,
nunca mudar lógica; `any` explícito só com comentário dizendo o porquê.

Para tirar a diretiva de mais arquivos (etapa 2 em diante): conserte o arquivo até o `npm run typecheck` ficar verde **sem** a diretiva,
tire a linha à mão, rode `node ferramentas/tipagem/conferir_nocheck.cjs --gravar` e depois `npm run conferir`.
