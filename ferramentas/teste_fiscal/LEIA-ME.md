# Testes do módulo fiscal (preparação, 26/11/2026)

Dois testes, os dois **sem gravar nada no banco** e **só com XML inventado** (nenhuma nota real entra no repositório).

## 1. As regras puras (sem navegador, sem banco)

```powershell
node ferramentas/teste_fiscal/teste_fiscal.mjs     # 103 conferências em 27/11/2026
```

Prova `src/FiscalArquivo.ts` (numeração, situação, ligação nota ↔ OP nos dois sentidos, o que vai ao banco), `src/FiscalProntidao.ts` a ligação da OP ao cliente (`src/FiscalLigacaoDaOp.ts`: agrupar por nome, sugestão, quem entra na lista) e o mapa de tipos de nota (`src/FiscalTiposDeNota.ts`: o que a OP pede e a conferência com a nota informada) (a OP está pronta para virar nota? cliente, itens e empresa, cada um estragado de um jeito; a ligação do cliente (o id gravado na OP manda, depois o CPF/CNPJ e o nome) e a do item, quando não se acham ou se acham em dois),  `src/FiscalRegras.ts` (cadastros: CNPJ/CPF, indicador da inscrição, CEST, origem, série nova ≠ série atual…) e `src/FiscalXml.ts` (o leitor de XML e as travas da especificação do Fiscal, cada uma nos dois sentidos: a nota certa passa limpa e a nota com o defeito plantado é pega). Roda direto no Node 24 (`FiscalProntidao.ts` importa só `FiscalRegras.ts`, com a extensão `.ts`; os demais não importam nada do projeto).

`node ferramentas/teste_fiscal/plantar_defeitos_prontidao.cjs` (rodar da raiz do projeto) estraga, um de cada vez, a regra da prontidão (`src/FiscalProntidao.ts`) e a da ligação OP ↔ cliente (`src/FiscalLigacaoDaOp.ts`) e confere que o teste acima pega cada defeito (25 de 25 em 27/11/2026); devolve os arquivos ao que eram no fim.

## 2. As telas no navegador (gravações bloqueadas)

1. Servidor de desenvolvimento desta pasta de pé (`preview_start` com o `acn-dev` ou `npm run dev`) e a conta ZZTESTE (ver `../teste_enderecos/LEIA-ME.md`).
2. `puppeteer-core` não é dependência do projeto: `NODE_PATH` aponta para uma pasta `node_modules` que o tenha.

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
$env:BASE = "http://localhost:<porta>/ACN/"
node ferramentas/teste_fiscal/teste_fiscal_tela.cjs     # 109 conferências em 27/11/2026 (inclui as visões Cadastros fiscais › OPs sem cliente e › Tipos de nota, com OPs, clientes e itens simulados)
```

Cobre: o arquivo de notas emitidas (dados SIMULADOS: lista, filtros, situação, ligação com a OP, janela da nota com o XML, numeração com buraco e inutilização, OPs sem XML), o botão "Guardar no arquivo" (o que SERIA enviado, sucesso e falha), as empresas emitentes (ACN e DETECH, o aviso do certificado digital, gravação que falha não vira "salvo"), as transportadoras (cadastro, nome obrigatório, CNPJ), o relatório de clientes e de itens que faltam (totais, limite de 200 linhas na tela, "Preencher", ação em lote que grava **só a coluna escolhida**), a seção fiscal dentro do cliente, o Conferidor de XML (3 arquivos, filtro, busca, limpar, nada gravado), **a prontidão da OP no Faturamento (selo, cartão do alto, resumo do lote, janela do detalhe, leitura recusada sem selo) e o quadro "Nota fiscal" do Dossiê da OP (prontidão, nota guardada e "Sem XML guardado"), com OPs e cadastros SIMULADOS** e a largura em celular de 390 px. As abas e os endereços (`#/fiscal`, `#/fiscal/cadastros`, `#/fiscal/conferidor`) são do cenário C46 do `../teste_enderecos` (`node teste_enderecos.cjs "^C46 fiscal"`).

**Leitura do banco de produção:** o teste lê clientes e itens inteiros (como a tela). Rode fora do horário de pico.

## 3. A função de gravação no banco

`supabase/sql/fiscal_arquivo_de_notas_teste.sql` (10 conferências, tudo desfeito no fim, relatório na mensagem de erro "TESTE FISCAL"): grava notas inventadas pela conta ZZTESTE e confere a gravação tudo ou nada, o que já estava guardado não ser regravado, a nota sem protocolo receber o protocolo depois, a recusa de quem não vê valores, a de chave com menos de 44 dígitos e a da chave pública.
