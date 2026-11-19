# Auditoria de layout (celular, tablet e computador)

Criada em 16/11/2026 e trazida para o repositório em 18/11/2026 (antes morava no `scratchpad`, que some). Ela percorre **as telas do menu, as sub-abas e até 3 janelas de "Novo/Cadastrar" por tela**, em vários tamanhos, e anota o que está errado no layout: botão cortado ou coberto, caixa que vaza da outra, tela que rola para o lado escondendo botão, alvo de toque pequeno, letra miúda. **Só lê; todas as gravações ficam bloqueadas** (`lib.cjs`).

Quem usa: o plano `PLANO_AJUSTES_LAYOUT.md` (cada fatia roda a auditoria na tela mexida, nos 7 tamanhos, e exige zero achado "alta" daquele grupo).

## Como rodar

1. Dev server de pé (`npm run dev`, ou `preview_start` com o nome `acn-dev`). A ferramenta abre `http://localhost:5173/ACN/`; para outra porta: `BASE=http://localhost:5199/ACN/`.
2. A conta de teste ZZTESTE precisa da senha em `%USERPROFILE%\.acn-teste\zzteste.json` (`{"email","senha"}`; ver `cracha_teste.cjs`).
3. `puppeteer-core` não é dependência do projeto: aponte `NODE_PATH` para uma pasta `node_modules` que o tenha (`npm install puppeteer-core --prefix <pasta>`).
4. Na pasta desta ferramenta:

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
node auditoria_layout.cjs <perfil> "^Tela$"     # sem o 2º argumento audita todas as telas do menu
node consolidar.cjs                              # junta os perfis e agrupa por problema -> auditoria/consolidado.txt e .json
node resumo.cjs <perfil> [tipo]                  # conta por tipo e lista as telas de um perfil
```

Perfis (`auditoria_layout.cjs`): `desktop` 1920×1080, `notebook` 1366×768, `desktop-meia-tela` 960×900 (mouse), `tablet-paisagem` 1180×820 (toque), `tablet` 820×1180 (toque), `celular` 390×844 e `celular-pequeno` 360×740. Os de toque ligam `isMobile` e `hasTouch`, senão o `responsivo.css` não é exercitado.

## O que sai

Tudo em `auditoria/` (fora do git): `auditoria/<perfil>/achados.jsonl` (um registro por tela/sub-aba/janela), `auditoria/<perfil>/fotos/` (a tela com o ponto marcado em magenta, só quando há achado "alta"), `auditoria/consolidado.txt`. As leituras do banco são guardadas em `auditoria/cache_leituras/` e reaproveitadas pelos outros perfis, para não sobrecarregar o banco de produção; **apague essa pasta para medir dados novos**.

## Limites

Usa os dados reais lidos do banco, sem gravar; tela que só mostra estado raro (erro, vazio, muitos itens) pode esconder achados. A conferência visual das fotos continua sendo necessária.
