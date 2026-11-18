# Plano de ajustes de layout (celular, tablet e computador)

**Origem:** pedido do usuário em 16/11/2026 — análise completa do frontend, mobile e desktop, para achar erro de layout, itens se sobrepondo e coisas do tipo, e um plano de ajustes.
**Estado:** em andamento desde 18/11/2026. **L1 (folga no fim da tela) e L2 (botões cortados) feitas**; as outras fatias seguem a ordem da seção 3. Este arquivo é a fonte da verdade; as correções entram em fatias, uma por vez, cada uma com `npx vite build`, a auditoria rodada de novo na tela mexida e o plano atualizado no mesmo commit.

## 1. Como foi medido

Auditor automático no navegador (Chrome headless, gravações bloqueadas, conta ZZTESTE), que percorreu **as 35 telas do menu, as sub-abas (até 9 por tela) e até 3 janelas de "Novo/Cadastrar" por tela**, em **7 tamanhos**: desktop 1920×1080, notebook 1366×768, janela pela metade 960×900 (mouse), tablet deitado 1180×820 (toque), tablet em pé 820×1180, celular 390×844 e celular pequeno 360×740. Total: **611 vistas, 0 erro de página**, 155 grupos de problema (o mesmo problema em várias telas/tamanhos conta uma vez). O auditor confere: página rolando para o lado, caixa que vaza da outra, **cartão que corta botão sem dar rolagem**, caixa que rola para o lado escondendo botões, botão coberto por outro, botão flutuante em cima de conteúdo, janela maior que a tela, alvo de toque pequeno e letra miúda. Fotos com o ponto marcado ficam em `scratchpad/fstest/auditoria/<tamanho>/fotos`.

**O que NÃO apareceu (bom):** nenhuma tela com a página inteira rolando para o lado (o corpo é travado); nenhuma janela maior que a tela; nenhuma tela em branco. Duas rodadas de falsos positivos foram eliminadas (conteúdo de `<details>` fechado e texto que quebra em linhas ao lado de um selo), então **não há mais "sobreposição" de texto sobre texto a corrigir**.

**Limite honesto:** o teste usa dados reais lidos do banco, mas sem gravar nada; telas que só mostram estados raros (erro, vazio, muitos itens) podem esconder outros achados. A conferência visual foi feita nas fotos dos achados graves (listados abaixo como "visto na foto").

## 2. Achados, em ordem de prioridade

### P1 — Botão de ação cortado ou escondido (o usuário não consegue clicar)
| # | Onde | O que acontece | Tamanhos | Causa e correção sugerida |
|---|---|---|---|---|
| 1.1 | **Engenharia › Desenvolvimento** (`div.sec-card` de cada demanda, `.acn-pdp table.acn-densa`) | O cartão tem `overflow: hidden` e a tabela é mais larga: **"Iniciar", "Iniciar o tempo", "Entregar", "Cancelar" ficam cortados sem rolagem** (visto na foto, tablet). Inclui o cronômetro por item feito em 16/11. | tablet, tablet deitado, meia tela | Embrulhar a tabela em `overflow-x: auto` (ou tirar o `overflow: hidden` do cartão) e dar `min-width: 0` à `.acn-pdp`; abaixo de 1000 px mostrar cada item como cartão. |
| 1.2 | **Almoxarifado** (`.sec-card.acn-est-pe-cartao`) | 34 botões "Contar" e "Conferir" cortados sem rolagem (visto na foto: coluna Ações some pela direita) | tablet | Mesma correção: rolagem na tabela do estoque ou cartões no tablet. |
| 1.3 | **Telecom › Análises e demandas** (`div.acn-ana-item`, `.acn-ana-widget`) | O botão "Abrir" e o seletor "Ordenar por" ficam cortados | celular, celular pequeno | Deixar o item quebrar em duas linhas (título em cima, ação embaixo) e o `select#analise-ordem` com `max-width: 100%`. |
| 1.4 | **RH** (cartão recolhido) | "Funcionário" cortado no cabeçalho do cartão | celular pequeno | Cabeçalho do cartão com `flex-wrap`. |
| 1.5 | **Formação de preços › Preços Formados** | A área de conteúdo tem 404 px num celular de 390 px: a tela rola 14 px para o lado | celular, celular pequeno | Achar o culpado (um campo/selo 14 px mais largo) e limitar com `max-width: 100%`. |

### P2 — Botão flutuante (📌 avisos e 💬 chat) em cima de botões e textos — o achado mais repetido
É o grupo com mais ocorrências: **41 grupos "controle coberto" + 8 "flutuante cobre conteúdo", em todos os 7 tamanhos e em ~25 telas** (Clientes, Cotações, Cadastro de itens, Compras, Adaptação, PCP, Almoxarifado, Fiscal, Vistorias de pátio, Logística › Fretes, Admin, CRM e outras). O 📌 e o 💬 ficam no canto inferior direito (`.aviso-widget.aviso-min` + `.acn-chat-raiz`, `design.css` ~3946 e ~4146) e **cobrem exatamente a coluna "Ações" das últimas linhas** ("🗑", "Ver", "Mais ações", "PDF", "Imprimir", "Cancelar frete", "Receber") e o "Avisos nada pendente 0" da tela Início no celular.
- **Causa:** o espaço reservado no fim da tela é de **96 px só no toque** (`responsivo.css:29`), mas as duas bolinhas ocupam ~**135 px** (chat 18+52 px, pino 84+46 px no celular); **no computador não há folga nenhuma** (a regra só vale em toque).
- **Correção (uma regra só):** `padding-bottom: 150px` no `.acn-main` em todos os tamanhos (e `calc(150px + env(safe-area-inset-bottom))` no toque), para a última linha poder subir acima das bolinhas. Opcional: no celular, juntar 📌 e 💬 num só botão (leque) e deixar o pino translúcido enquanto se rola.
- **Efeito esperado:** some quase todo o grupo (~49 grupos) de uma vez; é a melhor relação ganho/esforço do plano.

### P3 — Caixa que vaza da outra (texto, selo ou campo passando da borda)
| # | Onde | Detalhe | Correção |
|---|---|---|---|
| 3.1 | **Cabeçalho do sistema** (`header.acn-header > .acn-aba-selo > .acn-trilha-secao`) | Na janela de 960 px o caminho ("Controle de produção › Engenharia") passa 24–39 px da caixa, em 10 telas | `min-width: 0` + reticências no `.acn-aba-selo` |
| 3.2 | **Campos de data "De / Até"** dos relatórios (`input#rel-de`/`#rel-ate` em `.form-row > .form-group`): Compras, Serralheria, Chicotes, Laboratório, Logística › Relatório, Relatórios | Passa até 20 px da coluna no celular | `width: 100%; min-width: 0; box-sizing: border-box` nos campos de `.form-group`; é a regra já registrada no CLAUDE.md para campo em grade |
| 3.3 | **Aviso "sem modelo · sem chassi · sem placa"** (`.acn-aviso-mini`, `white-space: nowrap`, `design.css:381`) em **Adaptação e Controle de qualidade** | Passa 55 px e cobre a coluna de prazo (visto na foto, tablet) | permitir quebra (`white-space: normal`) abaixo de 1000 px |
| 3.4 | **SAC — cartão de lote** (`.acn-kb-card.acn-kb-lote`) | Texto e botões ("Registrar atendimento já realizado", "Passar as OS do lote") passam 53 px da borda do cartão (visto na foto) | `min-width: 0` e `overflow-wrap: anywhere` nos filhos; botões em largura 100% |
| 3.5 | **Marketing — cabeçalho do cartão** (`.acn-mkt-info`, grade sem `min-width: 0`, `design.css:954`) | Chips "Engenharia — PCP/Almox" cortados e "0 registros" colado nos chips (visto na foto, 360 px) | `min-width: 0` na grade e chips com quebra |
| 3.6 | **Licitações › Nova licitação** (janela) | `acn-quadro-titulo` passa 127–157 px: **a janela inteira fica mais larga que a tela e rola para o lado** no celular (visto na foto) | `overflow-wrap` no título e `min-width: 0` no `.acn-quadro` |
| 3.7 | **Engenharia › Estruturas** (chips `acn-selo` de "com algum de 38 itens (ex.: parachoque…)") e **PCP** (selos nos cabeçalhos `acn-alm-hdr-atencao` e `acn-pcp-hdr-marca`) | Selo de texto longo não quebra e passa 62–84 px (visto na foto) | `white-space: normal` e `max-width: 100%` nesses selos |
| 3.8 | **CRM › OPs em aberto** e Fiscal/PCP/Telecom (`.acn-ats-fob > .acn-selo`) | Selo "FOB/CIF" passa 6–18 px da coluna | `max-width: 100%` no selo |
| 3.9 | **Cotações** (`select.acn-cot-setor`, `design.css:2164`) | Passa 12 px da célula, em 270+ linhas no celular pequeno | `max-width: 100%` |
| 3.10 | **Engenharia** (`input` de data em `.acn-dev-campo-data`), **Clientes** (ícone do botão), **Dossiê NFC** (dica do PIN ao lado do campo) | Passam 3–7 px ou ficam apertados | ajustes pequenos de `box-sizing`/quebra |

### P4 — Caixas que rolam para o lado e escondem botões (decisão de design com o usuário)
São tabelas largas dentro de uma caixa com rolagem: funciona, mas **o botão de ação fica fora da vista até a pessoa arrastar**, sem nenhuma pista. Principais: **Compras** (459 controles fora da vista), **CRM › OPs em aberto** (928), **Cotações** (198), **Fiscal e Admin** (100), **PCP/Almoxarifado** (32, "Mais ações da OP"), **CRM quadro** (29, "Ações do cartão"), Demandas gerais/Clientes/Marketing. E as **barras de abas** que rolam no celular escondendo a aba da direita (Financeiro: "Conciliação bancária"; Logística: "Histórico / Novo Registro"; Engenharia: "Estruturas"; Marketing, SAC, Telecom, CRM).
- **Correção sugerida:** (a) deixar a coluna "Ações" **fixa à direita** (`position: sticky; right: 0`) nessas tabelas; (b) nas abas, sombra/seta no lado que tem mais conteúdo e rolar a aba ativa para a vista; (c) no tablet (640–1023 px), que hoje não recebe nem a rolagem nem os "cartões" do celular, **estender os cartões do celular até 1023 px** (`responsivo.css:200` vale só até 639 px; a camada inteira de toque até 1023 px).
- **Precisa do usuário:** em qual tela ele quer cartões em vez de tabela no tablet (a lista de P1 é a primeira candidata).

### P5 — Alvos de toque e letras pequenas (celular/tablet)
Pontos de 9×9 px do carrossel da tela Início e o contador "2 de 4"; setas ‹ › do Calendário (26×36); "O que mudou" dos Manuais (17 px de altura); ▾/▸ do Fiscal (12×36); telefones clicáveis do SAC › Chamados NFC (17 px); "Adicionar em Estimativa" e o ícone de temperatura no CRM (17–26 px); contadores Frio/Morno/Quente nas Licitações (16×20); "Fechar" da Nova Cotação (27×36). Letra de 9–10 px: meses NOV/DEZ/JAN no Início, "MT/TM" no CRM e 25 linhas do **Calendário** no celular ("Chega a compra PC-…", 10 px). **Correção:** área de toque mínima de 36 px (padding invisível) e letra mínima de 11 px nessas peças.

## 3. Ordem de execução proposta (fatias)
1. **L1 — folga no fim da tela** (P2): ✅ **feita em 18/11/2026** (ver a seção 6).
2. ✅ **L2 (feita em 18/11/2026, ver a seção 6) — botões cortados** (P1.1 a P1.5): Engenharia, Almoxarifado, Telecom, RH, Formação de preços; **antes da migração visual dessas telas, conferir o quadro do `/ux-fluxo`** (Engenharia, Almoxarifado e Telecom já foram migradas; RH e Formação também) e, nos quatro arquivos grandes (Admin, `DemandaAvulsaPanel`, `CadastroProdutosTab`, `VeiculosNfcTab`), perguntar ao usuário antes de mexer.
3. **L3 — campos e selos que vazam** (P3.1 a P3.10): quase só CSS (`min-width: 0`, `max-width: 100%`, quebra de linha), uma regra genérica por padrão.
4. **L4 — tablet** (P4, item c): estender os cartões de tabela até 1023 px e coluna de Ações fixa.
5. **L5 — abas que rolam e alvos de toque** (P4 abas e P5).

## 4. Como conferir cada fatia
Rodar o auditor na tela mexida (`node auditoria_layout.cjs <perfil> "^Tela$"`), nos 7 tamanhos, e exigir **zero achado "alta"** daquele grupo; fotografar antes e depois. O auditor mora em **`ferramentas/auditoria_layout/`** (trazido do scratchpad em 18/11/2026; o `LEIA-ME.md` da pasta diz como rodar; `bash rodar_todos.sh` roda os 7 tamanhos, com as partidas escalonadas). As saídas (fotos, achados, leituras guardadas do banco) ficam em `ferramentas/auditoria_layout/auditoria/`, fora do git; a linha de base de 16/11/2026 está em `auditoria/linha_de_base_16-11/` (só nesta máquina).

## 5. Dúvidas para o usuário
- No tablet em pé (iPad 820 px): preferem **cartões** (como no celular) ou **tabela com a coluna de Ações fixa**?
- Os dois botões flutuantes (📌 avisos e 💬 chat): ficam como estão (só ganham folga no fim da tela) ou viram **um botão só** no celular?
- Algum dos quatro arquivos grandes entra nesta rodada (Admin tem achado de 100 controles fora da vista no tablet)?

## 6. Andamento

### L1 — folga no fim da tela (✅ 18/11/2026)

- **O que mudou:** um token novo `--acn-folga-flutuantes: 140px` (`design.css`, no `:root`) e o `.acn-main` passa a reservar essa folga **embaixo em todos os tamanhos** (`design.css`: `padding: 14px 18px var(--acn-folga-flutuantes)`; `responsivo.css`: no toque, `calc(var(--acn-folga-flutuantes) + env(safe-area-inset-bottom))`, que era 96 px; na impressão a folga volta a 14 px). O 📌 e o 💬 ocupam juntos até 126 px da borda (chat 18 + 52 px, pino 10 px acima + 46 px; no celular o pino fica 84 px acima da borda); 140 px deixa 10 a 14 px de ar. O Painel TV fica de fora, como sempre.
- **Medido antes (preço da regra):** com 140 px de folga, das 34 telas do menu **nenhuma ganha barra de rolagem que não tinha** (no notebook 1366×768; as que já rolavam rolam 126 px a mais, e as sete que preenchem a altura apenas encolhem).
- **Medido depois (auditor nos 7 tamanhos, 87 a 88 vistas em cada um, as mesmas telas, sub-abas e janelas da medição de 16/11):** achados de "botão flutuante cobre conteúdo" **na vista do FIM da tela** (a que importa: ali não há mais para onde rolar): desktop 16 → 1, notebook 21 → 2, meia tela 18 → 2, tablet deitado 19 → 2, tablet em pé 4 → 1, celular 2 → 0, celular pequeno 2 → 0. **Nenhum achado novo de outro tipo** (os totais de rolagem lateral, vazamento, corte e alvo de toque ficaram iguais ou 1 a 4 abaixo, por variação dos dados). Os que sobraram são 7 da tela Comercial / CRM (o quadro tem rolagem própria por coluna e o auditor mede o fim da página, não o da coluna) e 1 do SAC (de gravidade baixa); a foto do CRM no fim da rolagem mostra o canto vazio, então tratamos como falso positivo do auditor até alguém ver o contrário.
- **Correção do que o plano dizia na seção 2 (P2):** os "41 grupos de controle coberto + 8 de flutuante cobre conteúdo, em ~25 telas" misturavam duas coisas. **A maioria vinha da vista do TOPO da tela, onde um botão flutuante sempre cobre o que está embaixo dele e a pessoa resolve rolando — isso não é defeito.** O defeito real é o do fim da tela (última linha sem poder subir acima das bolinhas), e foi esse que a folga resolveu. Para o auditor não voltar a contar o que é inerente, ele agora **descarta o que o 📌/💬 cobrem na vista do topo quando a tela rola** (fica só o número `flutuanteNoTopo` no registro) e mantém o achado quando a tela NÃO rola.
- **Ferramentas:** `ferramentas/auditoria_layout/` (a auditoria foi trazida do scratchpad: `auditoria_layout.cjs`, `auditoria_dom.js`, `consolidar.cjs`, `resumo.cjs`, `lib.cjs`, `cracha_teste.cjs`, `rodar_todos.sh`, `LEIA-ME.md`; `cracha_teste.cjs` lê o `supabaseClient.ts` pelo caminho relativo). **Armadilha achada:** rodar vários tamanhos no mesmo instante derrubava o login da conta de teste ("Email link is invalid or has expired", 5 dos 7 tamanhos falharam na primeira rodada); o `rodar_todos.sh` agora escalona as partidas em 20 s.
- **O que ficou de fora (de propósito):** juntar o 📌 e o 💬 num botão só no celular (pergunta da seção 5): com a folga o problema que motivava a ideia sumiu; segue em aberto só se o usuário achar que os dois botões atrapalham. Teste de celular com toque: o `responsivo.css` foi exercitado pelos perfis `tablet`, `celular` e `celular-pequeno` (toque ligado).

### Decisões do usuário (18/11/2026)
- Tablet em pé e meia tela: **coluna Ações fixa à direita** (não cartões), vale para as tabelas largas de uma vez (fatia L4).
- Os quatro arquivos grandes (Admin, `DemandaAvulsaPanel`, `CadastroProdutosTab`, `VeiculosNfcTab`): **só correções de CSS**, sem migrar a tela.

### L2 — botões cortados (✅ 18/11/2026)
- **Feito:** tabela do pedido de Desenvolvimento (Engenharia) e tabela do estoque (Almoxarifado) dentro de `<div className="acn-rolagem">` (o `.sec-card` corta o que passa da borda); cartão e seletor "Ordenar por" das Análises do Telecom, cartão de Preços Formados e seletor do KPI do RH passam a quebrar linha / limitar a largura (só CSS em `design.css`: `.acn-ana-*`, `.acn-fp-card*`, `.acn-select-mini`, `.acn-cab-filtros`).
- **Achado novo e corrigido:** no celular o 💬 cobria o botão "+ Criar" da janela "Nova Demanda Avulsa", porque essa janela (e outras camadas de tela cheia: painel da demanda, janela da OP, card do CRM, gavetas) trocou o estilo solto por classe e saiu da regra do `responsivo.css` que esconde o pino e o chat com janela aberta. As classes entraram na lista; camada de tela cheia nova com classe própria deve entrar nela.
- **Medido (auditor, 611 vistas, antes = após L1):** corte escondendo controle 18 → 0, área que rola para o lado 2 → 0, culpado da área 10 → 0, vazamento "alta" 155 → 148, controle coberto 0. Rolagem lateral "média" 170 → 173: são as tabelas que agora rolam dentro do cartão (esperado; o botão fica alcançável, e a coluna fixa da L4 o deixa sempre à vista).
- Restam em "alta" os da L3 (caminho do cabeçalho a 960 px, selos de Engenharia › Estruturas, aviso das OPs, SAC lote, Marketing, Licitações › Nova licitação, datas De/Até, CRM FOB). `vite build` verde.
