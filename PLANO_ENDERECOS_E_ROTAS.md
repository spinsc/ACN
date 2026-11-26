# PLANO — Endereços e rotas no sistema (links, F5, voltar e avançar)

Proposto em 25/11/2026, a pedido do usuário. **Revisado contra o código publicado e decidido pelo usuário no mesmo dia** (seções 4 e 7). **Fase 1 construída, testada e publicada em 25/11/2026 (seção 3); as outras fases não foram começadas.**

## 1. O problema (como está hoje)

- A tela atual é uma variável interna (`activeTab`, em `DashboardTab.tsx`, que começa em `inicio`). Não há biblioteca de rotas nem nada que escreva na barra do navegador. Cerca de 20 pontos trocam de tela: o menu, o logo, a busca geral, os painéis de Avisos, Menções e Análises, o chat e os atalhos internos.
- Efeitos para quem usa: **F5 volta ao Início**; **voltar e avançar do navegador não funcionam**; **não dá para mandar o link** de uma OP, licitação, compra ou OS.
- Dentro de cada tela há mais estado local que também se perde: cerca de 28 arquivos (44 pontos) guardam a aba ou visão interna em `useState` (`aba`, `visao`, `abaAtiva`…).
- O que já existe e ajuda: um mecanismo interno de "abrir isto", usado pelos avisos e pelo Calendário: `window.__acnDeepLink` (70 usos em 31 arquivos), o evento `acn:ir-para-aba` (10 arquivos), `acn:abrir-registro` (25 arquivos) e `analise:abrir-origem` (8 arquivos). Ele abre a tela e o registro certos, mas só por dentro do sistema, sem endereço.
- **Conferido em 25/11/2026 no código publicado: nada atrapalha o endereço novo.** O sistema não mexe no endereço do navegador em lugar nenhum (nenhum `hashchange`, `pushState` ou link com `#`), os manuais abrem em moldura separada e os portais do cliente são páginas à parte. O título da aba do navegador é sempre "ACN - Sinal Verde Flow" (nenhuma tela o muda).

Isso **não depende do servidor nem do banco**: pode ser feito já, no sistema atual.

## 2. Desenho (revisado em 25/11/2026)

**Endereço com `#`** (decidido). O GitHub Pages não tem página de reserva (não existe `404.html`): um caminho direto daria "página não encontrada" no F5. O `#` funciona hoje sem mudar o hospedeiro e continua funcionando no servidor interno.

Dois formatos de endereço:

- **Tela e aba, e registro que mora dentro de uma tela:** `#/<tela>[/<aba interna>][/<tipo do registro>/<id>]`. Exemplos: `#/compras` · `#/compras/cotacoes` · `#/licitacoes/licitacao/<id>` · `#/crm/card/<id>` · `#/compras/pedido/<id>` · `#/sac/os/<id>`.
- **Registro sem tela dona: a OP.** `#/op/<número da OP ou código>` (ex.: `#/op/A1750.2611`). A OP aparece em quase todos os setores (PCP, Almoxarifado, Produção, Fiscal, Logística, CRM…) e já abre numa janela por cima de qualquer tela, que é como a busca geral a abre hoje. Amarrá-la a uma tela (`#/crm/op/<id>`, como a primeira versão deste plano) deixaria "sem acesso" quem a vê no Almoxarifado ou na Produção sem ter a aba CRM. O endereço aceita o número e o código interno; o botão "Copiar link" usa o número (a barra do lote é codificada). A tela da Produção já aceita os dois.
  - A **viagem** é o caso parecido (abre por cima de qualquer tela para quem não tem a aba Viagens, `ViagemPorMencao`): o endereço dela se decide quando chegar a vez (Fase 5).

Regras:

1. **Um único módulo** (`Rotas.ts`, regras puras: ler e montar o endereço) com um **quadro de nomes** "nome no endereço → tela", separado dos nomes internos que as permissões de cada pessoa guardam (o nome do menu pode mudar e o link antigo continua abrindo; nome novo só acrescenta, nunca remove), e **uma única função** para trocar de tela. Os eventos e o `__acnDeepLink` de hoje continuam funcionando por baixo, mas passam por ela (nada precisa ser reescrito de uma vez). **Só registros viram endereço; ações não** (por exemplo, "abrir a Nova vistoria já preenchida" continua só um pedido interno).
2. **Histórico.** Trocar de tela, de aba interna e abrir registro criam passo (voltar e avançar funcionam). Filtros (Fase 5) só trocam o endereço, sem criar passo. **Fechar a janela do registro** volta um passo; num **link colado** (não há passo anterior dentro do sistema) troca o endereço para o da tela de baixo, nunca joga a pessoa para fora do sistema. Não se inventa passo falso: o Voltar de um link colado sai do sistema, como em qualquer site. A janela sabe se há passo anterior por uma marca guardada no histórico.
3. **F5 reabre o mesmo lugar.** Ao entrar no sistema sem endereço, vale o Início (como hoje).
4. **Permissão.** **Todo atalho passa a conferir** (hoje só "ir para a aba" confere e avisa; abrir card ou licitação por Menção, trocar de aba e ir do CRM ao SAC não conferem): comportamento novo, decidido. Sem permissão, a pessoa vê um aviso claro ("você não tem acesso a esta tela"), nunca tela em branco. As permissões guardadas no navegador podem estar velhas (são relidas do banco logo depois que o sistema abre): num link, o sistema **espera a releitura** ("conferindo seu acesso…") antes de recusar, para quem acabou de ganhar uma aba não levar uma recusa falsa. Para **registro** só cabe **uma mensagem**: "Não encontrei este registro, ou você não tem acesso a ele" (o banco responde igual quando não existe e quando a pessoa não pode ver; vale também para OP excluída).
5. **Entrar, sair e "ver como".** Link de quem ainda não entrou: o endereço fica enquanto aparece o login e, depois de entrar, leva ao destino. Hoje o login recarrega a página na raiz (`/ACN/` escrito fixo em `LoginTab.tsx`) e isso apaga o endereço: passa a preservá-lo e a usar o endereço-base da configuração (a migração do servidor pode mudar isso). **Sair** (que hoje só limpa a sessão, sem recarregar) passa a zerar o endereço, para a próxima pessoa que entrar no mesmo computador não parar na tela da anterior; "ver como" e "voltar para Admin" já recarregam na raiz e continuam zerando (a outra pessoa pode nem ter aquela tela). Vale o Início.
6. **A tela lê o endereço quando fica pronta, não por relógio.** Hoje alguns atalhos (OS pela busca, Engenharia, o "depois" do ir-para-aba) trocam de tela e esperam 0,4 s antes de pedir "abra o registro tal"; com F5 e o banco lento isso falha. O endereço é a fonte; o `__acnDeepLink` fica só como recado de uso único traduzido para ele. Compras e Produção já funcionam assim e servem de modelo.
7. **Alteração não salva.** Só três telas perguntam hoje antes de descartar (Formação de Preços, Viagens e Cadastro de itens; só a Formação de Preços usa também o aviso do navegador no F5). **Elas continuam perguntando, inclusive no Voltar** (o Voltar do navegador não se cancela de forma limpa: o endereço já mudou quando o sistema fica sabendo; o jeito é restaurá-lo e perguntar, com um piscar). **Nenhuma tela ganha pergunta nova nesta rodada.**
8. **"Copiar link"** nos registros, conforme as fases. Em avisos, Menções e calendário se guarda **só a parte do endereço** (`#/op/…`), nunca o endereço inteiro: ele muda com a migração do servidor. O "Copiar link" monta o endereço inteiro na hora, com o endereço do sistema em uso.
9. **Voltar e avançar reabrem a tela do zero** (filtros, rolagem e o que foi digitado se perdem), como já acontece ao trocar de aba pelo menu. Aceito por ora: manter telas abertas escondidas não resolveria, porque cada uma continuaria rodando as próprias atualizações automáticas e pesaria no banco. Lembrar filtros é a Fase 5.
10. **De brinde:** título da aba do navegador por tela ("Compras · ACN"), para a lista do botão Voltar não ficar toda igual; e **Painel TV abrindo direto por endereço** (`#/painel-tv`; hoje F5 ou religar a TV volta ao Início; a sessão fica no navegador).
11. Os portais do cliente (`portal.html`, `veiculo.html`), os manuais e o Início (continua a tela de abertura) não mudam.

## 3. Fases (reordenadas na revisão)

| Fase | O que entrega | Tamanho (estimativa minha, a confirmar) |
|---|---|---|
| **1. Tela e aba da tela** ✅ *(25/11/2026, publicada)* | Menu lateral reflete o endereço; F5, voltar, avançar e link de TELA; quadro de nomes e função única; conferência de permissão em todos os atalhos, com "conferindo seu acesso…" e "sem acesso"; login que preserva o endereço e sair que o zera; título da aba por tela; Painel TV por endereço. **Só arquivos da parte central do sistema** (`App.tsx`, `LoginTab.tsx`, `AdminTab.tsx`, `DashboardTab.tsx` e o `Rotas.ts` novo): não colide com a "Ver valores". | poucos dias |
| **2. Link da OP** | `#/op/<número ou código>` abre a janela da OP por cima de qualquer tela; botão "Copiar link"; a busca geral e as Menções passam pelo endereço; fechar a janela volta um passo (e, em link colado, leva à tela de baixo). | alguns dias |
| **3. Demais registros** | Licitação e card do CRM, compra e OS, um tipo por vez, cada um com o seu "Copiar link"; a tela lê o endereço quando fica pronta. | uns dias, por tipo |
| **4. Abas internas** | As cerca de 28 telas com aba ou visão interna, **junto de cada tela, na mesma fatia que já estiver mexendo nela** (quem mexe liga a aba ao endereço no mesmo commit; vale para a rotina `/ux-fluxo` e para a "Ver valores"). **Logística e Fiscal só depois da V4b a V4d.** Sem prazo fixo. | contínua, tela a tela |
| **5. Acabamento (opcional)** | Filtros principais no endereço (setor, período; trocam o endereço sem criar passo) e lembrar filtros ao voltar; demanda, viagem e serviço de terceiro; avisos do Calendário e Menções dos tipos que faltarem. | a decidir |

Cada fase entra sozinha, é publicada e testada, e o sistema continua funcionando entre uma e outra. **Prazo (decidido): as Fases 1 e 2 antes de 18/12**, para o ramo da migração do servidor já nascer com elas. O prazo e a migração do servidor só aparecem neste plano; nenhum outro documento do projeto os descreve.

### Fase 1 — o que foi feito (25/11/2026; **publicada no mesmo dia**)

**Entregue:**

- **O endereço da tela mora na barra do navegador** (`#/compras`, `#/pcp`, `#/painel-tv`…): **F5 reabre a mesma tela**, **Voltar e Avançar funcionam** e **o link de uma tela abre a tela** (para quem tem a aba). Sem endereço, abre o Início e a barra passa a mostrar `#/inicio` (sem criar passo). Clicar na tela em que já está não cria passo; trocar de tela pelo menu cria um.
- **Uma só função para trocar de tela** (`irParaTela`, do gancho `useNavegacao`): o menu, o logo, a busca geral, o chat, os painéis de Avisos, Menções e Análise, o Início, as Cotações e os atalhos internos (`acn:ir-para-aba`, `acn:trocar-aba`, `analise:abrir-origem`, `crm:navegar-sac`) — 22 pontos no `DashboardTab` — passam por ela, e **todos conferem a permissão** (antes só o "ir para a aba" conferia). Quem não tem a tela vê "Você não tem acesso a essa aba. Peça a liberação a um Admin." e nada troca (o recado de uso único `__acnDeepLink` também é apagado, para não abrir um registro na tela errada depois).
- **Link de tela sem acesso:** a faixa "Conferindo o seu acesso a esta tela…" enquanto o sistema relê as permissões do banco; depois, se continua sem acesso, a faixa vermelha "Você não tem acesso a esta tela (…)" com o botão "Ir para a tela inicial" (que troca o endereço sem criar passo: não deixa um beco sem saída no Voltar). **Quem acabou de ganhar a aba nunca leva a recusa falsa**: a tela abre sozinha quando a releitura chega, mesmo se ela demorar mais que a espera de 8 s (passados os 8 s, ou se a leitura falhar, o sistema decide com o que há). Permissão guardada que já libera abre na hora, e a releitura não derruba a tela aberta.
- **Entrar e sair:** o login recarrega a página **no mesmo endereço** (antes ia para `/ACN/` escrito fixo e apagava o `#`): link → entrar → destino. **Sair zera o endereço** (a próxima pessoa não cai na tela da anterior); a sessão vencida mantém o endereço; "ver como" e "voltar para Admin" já recarregavam na raiz e continuam zerando.
- **Brindes:** título da aba por tela ("Compras · ACN"; "Conferindo o acesso · ACN" e "Sem acesso · ACN" nas duas faixas; volta ao título original ao sair) e **Painel TV por endereço** (`#/painel-tv`: F5 ou religar a TV mantém a tela, com a sessão no navegador).
- **Quadro de nomes** (`Rotas.ts`): o nome no endereço é o id da tela com hífen no lugar do sublinhado (`painel_tv` → `painel-tv`; o nome com sublinhado não vale); **tela nova no menu já ganha endereço sozinha**; `NOMES_ESPECIAIS` troca o nome de uma tela e `APELIDOS` guarda nome antigo para o link antigo continuar abrindo (as duas listas estão vazias hoje); `conferirQuadroDeNomes` pega nome repetido, nome reservado (`op`, `viagem`) e apelido que aponta para tela que não existe — as 38 telas do menu passam. Formas aceitas na barra: `#/compras`, `#compras`, `#/compras/`, maiúsculas; o que vier depois de `?` é ignorado.
- **Arquivos:** novos `src/Rotas.ts` (regras puras), `src/EnderecoDoNavegador.ts` (escrever o endereço, passo no histórico com marca do sistema, ouvir Voltar e Avançar, zerar), `src/useNavegacao.ts` (a tela aberta e `irParaTela`), `src/AvisoDeEndereco.tsx` e `src/endereco.css`; alterados `DashboardTab.tsx` (as trocas de tela; o título; `isVisible` virou função para o gancho poder usá-la na primeira leitura), `App.tsx` (sair zera o endereço), `LoginTab.tsx` (recarregar no mesmo endereço) e `VinculoPicker.tsx` (só um comentário). **`AdminTab.tsx` não precisou mudar.**

**Como foi conferido (números reais):**

- Regras puras em Node: **49 conferências** (as 38 telas lidas do próprio menu; formas do endereço; `%` solto sem derrubar; a decisão entre abrir, conferindo, sem acesso e desconhecido).
- Navegador (Puppeteer, conta ZZTESTE, gravações bloqueadas, 15 cenários em série, um navegador novo para cada): **130 de 130**, rodados de uma vez no código final. Admin (menu, Voltar, Avançar, F5, link direto, endereço digitado, endereço desconhecido, Painel TV); pessoa com poucas abas (sem acesso com "conferindo" antes; permissão velha que nega e o banco libera; permissão velha que libera e o banco já tirou; releitura que demora 11 s; releitura que falha; sem lista de abas marcada); os cinco atalhos internos recusados, com o aviso uma vez só e sem trocar de tela; link sem estar entrado → entrar → destino → sair → entrar de novo (cai no Início); sessão vencida (usuário guardado, sem crachá) → entrada com o aviso, endereço mantido → destino; "ver como" recarregando na raiz; e o aviso em celular 390×844, celular 360×740, tablet 820×1180 e meia tela 960×900 (sem rolagem para o lado, botão inteiro e de 32 px ou mais).
- **Os cenários principais repetidos no pacote de produção** (o que vai para o ar, minificado): **86 de 86**.
- **Três defeitos plantados de propósito** (recusar antes de reler as permissões; atalho que não confere a permissão; sair sem zerar o endereço) **foram pegos pelos testes**, e os arquivos voltaram iguais ao que eram.
- `npm run typecheck` com 0 erros; `npx vite build` passou. As gravações que o sistema tentou durante os testes (entrar simulado, encerrar "ver como", assinar as imagens do carrossel) foram todas abortadas: nada chegou ao banco.
- **Depois de integrar o `main`** (o commit 12e78, da edição da OP, feito por outra sessão em outros arquivos: `OplEdicao.tsx`, `design.css` e o plano de UX; nenhum arquivo em comum com esta fase): `typecheck` 0 erros, `vite build` passou, as 49 conferências das regras passaram e os cenários C1, C5, C8 e C9 repetidos no pacote de produção deram **62 de 62**. Os 15 cenários inteiros não foram repetidos depois da integração.

**Ficou de fora (de propósito):**

- As esperas de 0,4 s da busca geral (OS e Engenharia) e do "depois" do `acn:ir-para-aba` **continuam** até as fases dos registros (regra 6).
- **Nenhum registro, nenhuma aba interna e nenhum "Copiar link" ainda** (Fases 2 a 4). `#/op/…` hoje é um endereço desconhecido: mostra o aviso e abre o Início, até a Fase 2.
- Um endereço digitado fora da forma exata (`#PCP/`) abre a tela, mas **não é reescrito** na barra: reescrever apagaria o que vem depois da tela, que as Fases 3 e 4 vão usar.
- O Painel TV abre dentro do sistema (com o menu e o cabeçalho); um modo "tela cheia sem menu" não foi pedido.
- **Achado fora do escopo, não mexido:** uma Menção criada pela aba de demandas do setor (`SetorDemandaTab.tsx`, linha 686) tem como destino `demandas_gerais`, que não é uma tela do menu (a tela das demandas gerais é `ajustes`). Antes o clique abria uma área em branco; agora avisa "Não encontrei a tela de destino". Corrigir o destino é decisão do usuário.
- **Depois de publicar (feito em 25/11/2026; deploy terminado às 21h06, horário de Brasília):** o site no ar serve os mesmos arquivos do pacote conferido (`index-CndU_kig.js` e `index-legacy-BWPLJG-i.js`), com as frases novas do aviso. O `/saude-banco` deu CPU de 404 a 439 ms por ciclo (o normal é cerca de 400), zero timeouts desde as 19h10 e nenhuma tela consultando demais: os dois picos de volume (cerca de 1.500 pedidos por minuto das 19h10 às 19h30 e 490 por minuto das 20h30 às 20h50) eram navegadores de teste (97% a 99% dos pedidos) e, fora eles, o tráfego ficou de 8 a 18 pedidos por minuto, com uma janela de 91. Nenhuma consulta nova entre as mais caras (a de 268 ms em média, `entidades_com_alteracao_nao_vista`, 389 chamadas, é de 29/09 e não tem relação com esta fase). **Falta:** conferir o aviso num computador de uso real.

## 4. Decisões do usuário (25/11/2026)

1. **Formato:** `#`.
2. **Abrir registro cria passo no histórico:** sim (Voltar fecha a janela).
3. **"Copiar link" primeiro em:** OP, licitação e card do CRM, compra e OS (demanda, viagem e serviço de terceiro depois; a OP sai primeiro porque não tem tela dona).
4. **Quando começar:** a Fase 1 já; as abas internas junto de cada tela (Logística e Fiscal depois da V4b a V4d).
5. **Prazo de 18/12:** as Fases 1 e 2 (tela, aba da tela e link da OP).
6. **Padrões da revisão, aceitos:** (a) todo atalho passa a conferir a permissão; (b) sair e "ver como" zeram o endereço; (c) só as três telas que já perguntam antes de descartar perguntam, inclusive no Voltar; (d) voltar e avançar reabrem a tela do zero, sem lembrar filtros; (e) os brindes (título da aba por tela, Painel TV por endereço, link da OP também pelo número, só a parte do endereço guardada nos avisos).
7. **Registro:** este arquivo, editado onde estava (cópia do original em 25/11/2026 guardada fora do projeto). Na Fase 1 ele passou para a raiz do projeto, no mesmo commit do código, e **a cópia que ficou na outra pasta de trabalho (`inspiring-mclaren-fa5fdb`) deixa de valer**.

**Em aberto:** o endereço da viagem (abre por cima de qualquer tela para quem não tem a aba Viagens) e se demanda e serviço de terceiro seguem o mesmo molde da compra e da OS.

## 5. Como será conferido

Teste no navegador (Puppeteer, gravações bloqueadas, conta ZZTESTE): F5 mantém a tela; voltar e avançar; link de tela, de aba e de registro abrindo no lugar certo; **link da OP por cima de uma tela que a pessoa tem e por cima do Início logo depois de um F5**; link para tela sem acesso; **permissão recém-concedida não gera recusa falsa**; link de quem não entrou volta ao destino depois do login; **sair e "ver como" zeram o endereço**; **fechar a janela num link colado não sai do sistema**; alteração não salva pergunta nas três telas, inclusive no Voltar; **F5 com o banco lento (resposta simulada devagar) abre o registro mesmo assim**; mensagem única de "não encontrei"; **renomear um item do menu não quebra o link antigo**; título da aba; Painel TV direto; celular. Build (`npx vite build`) antes de cada commit; publicação só com o OK do usuário. Depois de publicar, `/saude-banco` (voltar e avançar reabrem as telas e releem o banco).

## 6. Riscos

- Telas antigas decidem muita coisa por estado local; a Fase 4 pode revelar abas que dependem da ordem em que foram abertas. Por isso é feita tela a tela, junto de quem já mexe nelas.
- **Conflito de arquivos:** `DashboardTab.tsx` (cerca de 1.900 linhas) é editado por várias sessões. A Fase 1 entra pequena, é testada e publicada logo; as abas internas de Logística e Fiscal esperam a V4b a V4d.
- O Voltar de um link colado sai do sistema, como em qualquer site; não se inventa passo falso (a ideia de que "a primeira entrada do histórico é sempre o Início" saiu: não se garante).
- Cada voltar ou avançar reabre a tela e relê o banco, que é pequeno e já travou por excesso de consultas: conferir a carga depois de publicar.
- Endereço publicado vira compromisso: o link antigo precisa continuar abrindo (por isso o quadro de nomes só acrescenta).
- Links antigos guardados em avisos e no Calendário (a "chave" `fonte:ref:dia`) continuam valendo; não são trocados.

## 7. O que a revisão de 25/11/2026 mudou no plano

| O plano dizia | Agora |
|---|---|
| OP em `#/crm/op/<id>` | OP sem tela dona: `#/op/<número ou código>` (quem a vê em outro setor não cai em "sem acesso") |
| Nomes das telas no endereço | Quadro "nome no endereço → tela", separado dos nomes internos das permissões |
| "Link sem permissão: aviso claro" | Todo atalho passa a conferir (muda o comportamento de quatro atalhos que não conferiam) e espera a releitura das permissões antes de recusar |
| Atalhos "passam pela função" | A tela lê o endereço quando fica pronta; sai a espera de 0,4 s |
| "Link de quem não entrou: login e depois destino" | O login hoje apaga o endereço (recarrega na raiz, com `/ACN/` fixo): passa a preservar; sair e "ver como" zeram |
| "Fechar a janela equivale a voltar" e "a primeira entrada é sempre o Início" | Não há janela padrão: a ligação vai nos tipos principais, um a um; em link colado fechar leva à tela de baixo; sem passo falso |
| "Pergunta antes, no mesmo padrão das janelas que já fazem isso" | Só três telas perguntam hoje; elas seguem perguntando, também no Voltar; nenhuma ganha pergunta nova |
| Duas mensagens ("sem acesso" e "não existe mais") | Para registro, uma só: o banco responde igual nos dois casos |
| (não dito) | Voltar e avançar reabrem a tela do zero: aceito, medir; lembrar filtros na Fase 5 |
| Fases 1 e 2 (inclui as abas internas) antes de 18/12 | Fases 1 e 2 = tela e link da OP antes de 18/12; abas internas junto de cada tela, sem prazo fixo |
| (não dito) | Título da aba por tela; Painel TV por endereço; link da OP pelo número; só a parte do endereço guardada nos avisos |
