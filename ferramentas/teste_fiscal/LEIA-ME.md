# Testes do módulo fiscal (preparação, 26/11/2026)

Dois testes, os dois **sem gravar nada no banco** e **só com XML inventado** (nenhuma nota real entra no repositório).

## 1. As regras puras (sem navegador, sem banco)

```powershell
node ferramentas/teste_fiscal/teste_fiscal.mjs     # 54 conferências em 26/11/2026
```

Prova `src/FiscalRegras.ts` (cadastros: CNPJ/CPF, indicador da inscrição, CEST, origem, série nova ≠ série atual…) e `src/FiscalXml.ts` (o leitor de XML e as travas da especificação do Fiscal, cada uma nos dois sentidos: a nota certa passa limpa e a nota com o defeito plantado é pega). Roda direto no Node 24 (os dois arquivos não importam nada do projeto).

## 2. As telas no navegador (gravações bloqueadas)

1. Servidor de desenvolvimento desta pasta de pé (`preview_start` com o `acn-dev` ou `npm run dev`) e a conta ZZTESTE (ver `../teste_enderecos/LEIA-ME.md`).
2. `puppeteer-core` não é dependência do projeto: `NODE_PATH` aponta para uma pasta `node_modules` que o tenha.

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
$env:BASE = "http://localhost:<porta>/ACN/"
node ferramentas/teste_fiscal/teste_fiscal_tela.cjs     # 37 conferências em 26/11/2026
```

Cobre: as empresas emitentes (ACN e DETECH, o aviso do certificado digital, gravação que falha não vira "salvo"), as transportadoras (cadastro, nome obrigatório, CNPJ), o relatório de clientes e de itens que faltam (totais, limite de 200 linhas na tela, "Preencher", ação em lote que grava **só a coluna escolhida**), a seção fiscal dentro do cliente, o Conferidor de XML (3 arquivos, filtro, busca, limpar, nada gravado) e a largura em celular de 390 px. As abas e os endereços (`#/fiscal`, `#/fiscal/cadastros`, `#/fiscal/conferidor`) são do cenário C46 do `../teste_enderecos` (`node teste_enderecos.cjs "^C46 fiscal"`).

**Leitura do banco de produção:** o teste lê clientes e itens inteiros (como a tela). Rode fora do horário de pico.
