---
name: ux-fluxo
description: Continuar o plano de visualização do fluxo de trabalho e polimento de UX da ACN — do PV à entrega, bugs de elo quebrado, código órfão, nomenclatura, painel "onde está isso agora" e migração para o design system. Use quando o usuário pedir para seguir o próximo passo do plano de UX/fluxo, ou digitar /ux-fluxo.
---

# Continuar o plano de UX e fluxo de trabalho

Este projeto é longo e o usuário trabalha nele em várias máquinas, intercalando
com outras tarefas. O estado **não está na sua memória** — está no arquivo
`PLANO_UX_FLUXO_TRABALHO.md`, na raiz do projeto. Ele é a fonte da verdade.

## Como conduzir

1. **Leia `PLANO_UX_FLUXO_TRABALHO.md` inteiro** antes de qualquer coisa. Ele
   traz o mapa do fluxo, os achados (A a F), as 15 etapas e quais já estão ✅.

1b. **Leia a seção "Respostas a aplicar" do plano** (rodada de perguntas de
   01/10/2026: o usuário respondeu todas as perguntas que estavam em aberto,
   e nada foi aplicado ainda). Antes de escolher a etapa, **decida para cada
   resposta o momento de aplicar** — agora, junto de uma etapa que mexe nos
   mesmos arquivos, ou depois — e escreva na coluna "Momento" do quadro da
   própria seção. **Comece a aplicar junto com a finalização das etapas que
   faltam**, sem esperar acabar todas; uma resposta por vez, cada uma com seu
   teste, seu plano atualizado e sua autorização de publicação. Resposta que
   mexe em dado real só depois de medir de novo, só no que ela autoriza e
   relatando a contagem. O que a seção marca "a confirmar" é pergunta nova:
   faça ao usuário antes de construir. Ao aplicar, a resposta vira linha de
   "Decisões tomadas" e sai da seção.

2. **Escolha a etapa.** Se o usuário deu um número (`/ux-fluxo 3`), é essa.
   **PRIORIDADE (decidida pelo usuário em 05/10/2026): enquanto a Etapa 15
   (Centros de custo, subetapas 15a a 15e) não estiver ✅, ela é a próxima** —
   pegue a primeira subetapa ⬜ dela, **antes** de qualquer outra etapa, de
   telas a migrar, de R19, R4 e R9. Só depois que a 15e estiver ✅ o resto do
   plano segue "de forma natural". Sem número e sem a Etapa 15 pendente, é a
   primeira que não estiver ✅. A ordem do plano é uma
   sugestão do usuário aceita em 29/09/2026: bug funcional primeiro, depois
   o que atrapalha entender, depois visualização, por fim polimento.

3. **Confira o ponto de partida antes de escrever código.** O plano foi
   medido em 29/09/2026; o banco é de produção e o código anda. Os arquivos e
   linhas citados podem ter mudado, e os achados podem já ter sido resolvidos
   por outra sessão. Meça de novo (`Grep`, consulta ao banco) e, se divergir do
   que o plano diz, corrija o plano.

4. **Se a etapa tiver decisão de negócio em aberto** (seção "Perguntas em
   aberto" do plano) e a resposta mudar o que você vai construir, pergunte ao
   usuário antes de começar. Se não mudar, siga e registre a suposição.

5. **Implemente uma etapa por vez.** Não adiante a seguinte, mesmo parecendo
   fácil — cada uma vai para produção sozinha e precisa funcionar sozinha.

6. **Teste antes de entregar**, no padrão do projeto: `npx vite build`, depois
   teste de navegador com as gravações bloqueadas (ver "Testes no navegador"
   no CLAUDE.md), ou dado `ZZTESTE` apagado depois com a contagem conferida.
   Se a etapa depende de anexar arquivo (`<input type="file">`), a automação
   não preenche: reproduza a gravação chamando o mesmo `supabase` do app e
   diga isso no relato, como fez a Etapa 1.

7. **Atualize o plano no mesmo commit do código.** Marque a etapa ✅, preencha
   "Feito em" e "O que foi feito" com o que realmente aconteceu — arquivos
   mexidos, migrações aplicadas, números dos testes, e o que ficou de fora.
   Registre decisões novas na tabela de decisões e apague as perguntas que
   foram respondidas. **Uma etapa sem o plano atualizado não está concluída**
   — a próxima máquina vai se perder.

8. **Peça autorização para publicar** ao fim, com pergunta clicável dedicada,
   como manda o CLAUDE.md. Nunca `git push` sem essa resposta.

## Cuidados por etapa

- **Etapa 3 (código órfão):** antes de apagar qualquer arquivo ou função,
  prove que ninguém usa (busca por import e por nome, inclusive dinâmico) e
  confira se ele guarda alguma regra de negócio que ainda vale. Liste o que
  pretende apagar e **peça confirmação ao usuário** antes de apagar.
- **Etapa 4 (criação de OP num caminho só):** exige decisão do usuário — o
  formulário simplificado do CRM morre ou vira "modo rápido"? Pergunte antes.
- **Etapa 5 (nomenclatura):** nome de status só muda **migrando o dado
  junto**, com a contagem de linhas relatada; o código tolera as duas grafias
  durante a transição e só depois se aperta. Migração por `apply_migration`,
  com comentário explicando o porquê.
- **Etapas 11 a 13 (design system):** uma tela por vez, sempre pelo que já
  existe em `Interface.tsx` e `Feedback.tsx`. Não mude regra de negócio no
  meio de uma migração visual.

- **Etapa 15 (centros de custo, 15a a 15e):** as respostas do usuário às 6
  perguntas estão no quadro da própria etapa — **não repergunte**; pergunte só
  o que a subetapa lista em "Perguntas ao começar". **Telas e janelas novas já
  nascem no visual novo** (`Interface.tsx`); a migração do resto do Financeiro
  é depois da 15e. **Dado real** (classificar os 38 centros, preencher compras
  "sem centro", competência das despesas antigas): só com o OK explícito dele,
  mostrando a lista e relatando a contagem. O **realizado** e o **comprometido**
  seguem a definição do plano (e o total precisa bater com o "Total gasto" da
  tela de hoje, conferido contra o banco). O alerta de estouro **só avisa**,
  nunca bloqueia. Visão por gerente está **fora** da etapa.

## O que não fazer

- Não faça "polimento" que mude comportamento sem estar na etapa. Bug
  funcional é sempre etapa própria, relatada como tal.
- Não apague nada sem entender por quê existe (princípio 2 do plano).
- Não mexa em dado real fora do que a etapa exige, e nunca sem relatar quantas
  linhas mudaram.
- Não repita trabalho de outra sessão em andamento (o plano cita, no achado C,
  a correção de `'Concluida'` das demandas setoriais, rodando à parte).
