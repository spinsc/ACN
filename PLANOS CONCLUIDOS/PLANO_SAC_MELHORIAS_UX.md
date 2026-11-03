# Plano: melhorias de uso, UX e UI do setor SAC

**Situação (03/11/2026): CONCLUÍDO — as Ondas 1 (A3, A4, A5 só os rótulos, B1, B4, M3, M11), 2 (A1, A2, A7, M2, M9), 3 (A6, M6, M7, M8), 4 (M4, M1, M5, M10, B2, B3) e 2b (A8) estão construídas, e o A5 (assinatura e fotos na entrega do veículo) foi decidido pelo usuário e construído no mesmo dia; nada mais está em aberto neste plano; movido para PLANOS CONCLUIDOS em 03/11/2026 a pedido do usuário. Só consulta ou ajuste.** Nasceu como análise e virou plano: cada código (A1, M3...) é uma fatia; o usuário diz quais fazer e em que ordem. Marque aqui cada achado como ✅ (com a data) quando for construído. Só o "Registrar atendimento já realizado" foi feito, antes da análise, e não está na lista. O manual do setor (`MANUAIS/sac`, aba **Manuais** do sistema) descreve a tela como ela é hoje: ao construir um achado, atualize o texto do manual e rode `node MANUAIS/gerar_manuais.cjs`.

**Data:** 30/10/2026 · **Pedido:** "faça uma análise se tem como melhorar o uso, o UX e a UI do SAC, para os operadores entenderem melhor como operar".
**Base:** leitura da tela inteira (Ordens de Serviço, Chamados NFC, Garantia, Cadastros), das regras de cada etapa e do passo a passo de 79 fotos tiradas com dados inventados.
**O que esta análise NÃO faz:** não muda a tela. Cada achado tem um código (A1, M3...) para você dizer "faz o A2 e o M1" e eu construir em fatias, cada uma com build, teste e o seu OK para publicar.

> Ponto de partida: o SAC já passou por uma limpeza forte em outubro (design system, barra de progresso, "quem tem que agir", OS parada, coluna do Fiscal, mover a OS, cancelar, registrar atendimento já realizado). O que sobra agora é **orientação** (a pessoa saber o que fazer e onde clicar) e **pontas soltas** de vocabulário e de proteção. Nada abaixo é bug de regra de negócio, exceto A3 (texto que diz o contrário do que acontece) e A4 (um botão que quebra o fluxo da garantia).

---

## O que já está bom (não mexer)

| O quê | Por que funciona |
|---|---|
| Barra "etapa N de M" em cada OS, pelo caminho dela | O operador vê quanto falta sem decorar o fluxo |
| Linha "Aguarda: SAC / Laboratório / Produção / Qualidade / Fiscal / Cliente" + "parada há N dias" | Responde "a OS está comigo ou com outro setor?" |
| Quadro com 4 colunas, a do Fiscal separada | A OS faturada não parece mais terminada |
| Movimentos do SAC só onde o SAC age; voltar uma etapa com motivo | Impede pular CQ e Fiscal |
| Toda gravação confere a etapa de antes | Duas pessoas não passam a mesma OS; a segunda recebe um aviso claro |
| Garantia: ficha com selo de situação em cada seção e trava "sem avaliação, não segue" | O processo é guiado pelas travas |
| Mensagens de falha dizem o que NÃO foi gravado ("A OS NÃO foi aberta") | A pessoa não fica na dúvida |

---

## Achados, em ordem de prioridade

### Alta — atrapalha o dia a dia ou induz a erro

| Cód. | Onde | O que acontece hoje | Por que atrapalha | O que sugiro | Esforço |
|---|---|---|---|---|---|
| **A1** ✅ 03/11/2026 | Ordens de Serviço, topo da tela | A tela abre com agenda, legenda de três linhas de etapas, o painel "o que está com cada setor" (até 6 linhas) e os filtros **antes** do quadro. Em tela de 950 px o quadro só aparece depois de rolar | O operador usa o quadro/lista o dia todo e vê primeiro o que consulta de vez em quando | Recolher a legenda ("Como a OS caminha ▸", fechada por padrão, lembra a escolha da pessoa); painel mais baixo; filtros colados ao quadro | Pequeno |
| **A2** ✅ 03/11/2026 | Painel "o que está com cada setor hoje" | As linhas (OS, cliente, etapa, o que fazer) **não são clicáveis**; só mostra 6 e manda "usar o filtro SAC" | O painel diz o que fazer, mas a pessoa tem de procurar a OS para fazer | Clicar na linha abre o resumo da OS (ou já a janela do passo); "ver todas" leva à lista filtrada | Pequeno |
| **A3** ✅ 03/11/2026 | Nova OS de veículo, avaliação **Presencial** | O texto de ajuda diz *"SAC define data de entrega do veículo (Provisionamento)"* | É o contrário do fluxo: quem marca a data é a **Produção**; o SAC só dá o **aceite** depois. O painel "quem age" e o manual dizem outra coisa | Trocar o texto para "A Produção marca a data do atendimento; o SAC confirma com o cliente (Aceite SAC)" | Mínimo (uma frase) |
| **A4** ✅ 03/11/2026 | Cadastros > Tipos de Serviço | "Garantia" tem o botão **Desativar** (vermelho, sem confirmação), como qualquer tipo. O sistema reconhece a OS de garantia **pelo nome** "Garantia"; a OS de **veículo** também depende do **nome da categoria** (precisa conter "manutenção" ou "garantia" junto de "veicular" ou "veículo") | Quem desativar "Garantia" tira o tipo da Nova OS e a garantia deixa de abrir OS. O mesmo vale, sem confirmação, para equipamentos e categorias | Marcar "Garantia" como **tipo do sistema** (selo, sem botão de desativar) e pedir confirmação ao desativar qualquer cadastro | Pequeno |
| **A5** ✅ rótulos e entrega do veículo com assinatura e fotos, 03/11/2026 | Botões "Enviar ao Fiscal" e "Entrega" | Há **duas janelas** para ir ao Fiscal (veículo: pede o nº de série dos itens, botão "Enviar para Fiscal"; Laboratório: pede valor e CPF/CNPJ, botão "Enviar ao Fiscal") e **três** janelas de entrega (Laboratório: nome + fotos + assinatura; veículo: só o nome de quem recebeu; garantia do Laboratório igual à primeira) | O mesmo nome de botão pede coisas diferentes; o operador só descobre depois de clicar. A entrega do veículo **não colhe assinatura**, a do Laboratório colhe | Escrever no botão o que ele pede ("Enviar ao Fiscal — informar seriais" / "— valor e CPF/CNPJ") e **decidir com você** se a entrega do veículo também deve colher assinatura e fotos | Pequeno (texto) + decisão sua |
| **A6** ✅ 03/11/2026 | Chamados NFC | Mostra só a data de abertura, sem dizer há quantos dias; chamado aberto há dias não se destaca; "Concluir" fecha sem pedir nota | Chamado de cliente esquecido passa despercebido (na OS, 7 dias já vira alerta vermelho) | "Aberto há N dias", selo vermelho a partir de um prazo que você definir, e pedir uma nota ao concluir | Pequeno + decisão sua (prazo) |
| **A7** ✅ 03/11/2026 | Todas as listas | A lista só atualiza quando a pessoa age ou recarrega a página; não há atualização automática | Duas pessoas no SAC veem versões diferentes; o aviso "outra pessoa mexeu" só chega **depois** do clique | Atualizar sozinha a cada 60 s (ou botão "Atualizar" com a hora da última leitura) | Pequeno |
| **A8** ✅ 03/11/2026 | Veículo **sem cobrança** (garantia ou cortesia) na Produção | A regra diz: sem cotação, sem aprovação do cliente, caminho "Em Provisionamento → Provisionada → Em Execução → CQ → Concluído → Entrega". Mas a tela da Produção, pelo que o código faz, ainda leva o veículo por **"Verificação e Orçamento"** e **"Aguardando Aprovação Cliente"** (onde aparecem **Aprovado** e **Recusado** para o SAC) antes de iniciar. **A CONFIRMAR com dado de verdade: li o código, não vi acontecer** | Se acontecer, o SAC vê uma OS que "não devia" pedir aprovação e não sabe se aprova. A barra de progresso mostra etapas que a OS pulou | Conferir com a Produção; se confirmado, a Produção passa direto de "Provisionada" a "Aguardando Início" nas OS sem cobrança (e o SAC não vê Aprovado/Recusado) | Pequeno a médio (mexe na Produção) |

### Média — melhora o entendimento

| Cód. | Onde | Hoje | Sugestão |
|---|---|---|---|
| **M1** ✅ 03/11/2026 | Nova OS | Um formulário único de 13 blocos. Só 3 coisas são obrigatórias (cliente, tipo de equipamento, defeito reclamado), mas acessórios, fotos, faturamento, valores e vínculo com o CRM ocupam a mesma rolagem | Mostrar o essencial e recolher "Mais dados (acessórios, fotos, faturamento, valores, CRM)"; mostrar "Falta: …" perto do botão **Abrir OS** |
| **M2** ✅ 03/11/2026 | Menu ⋯ da OS | Até **12 itens** misturados: Resp., Financeiro, Compras, Anexar, PDF, Copiar, Cancelar OS, Entregar sem nota, Mover para…, Voltar para…, Registrar atendimento já realizado | Separar em grupos com linha (Dados da OS / Mover a OS / Encerrar), os destrutivos ao fim e em vermelho |
| **M3** ✅ 03/11/2026 | Rótulos | "Resp.", "Acomp.", "Atend.", "Orç.", "KPI Orç.", "KPI Exec.", "Qtd" | Por extenso onde couber (Responsável, Acompanhamento, Atendimento); "KPI" não diz o que mede: "Tempo do orçamento" / "Tempo da execução" |
| **M4** ✅ 03/11/2026 | Lote de OS | O cartão do lote só tem "Registrar atendimento já realizado". Para as outras passagens é preciso abrir o lote e repetir OS por OS (as 7 viaturas da Defesa Civil = 7 confirmações de "Seguir sem cotação") | Passagens em lote: marcar as OS do lote e aplicar a mesma passagem, no mesmo desenho do registro em lote |
| **M5** ✅ 03/11/2026 | Cores das etapas | "Aprovado" (Laboratório) e "Provisionada" aparecem **verdes**, como se estivessem prontas, mas ainda falta execução | Verde só no que terminou; "Aprovado" e "Provisionada" em tom de andamento |
| **M6** ✅ 03/11/2026 | Garantia, ficha | Janela com **11 seções empilhadas**; não diz qual é o próximo passo. Nomes parecidos: "Peças pedidas ao Compras" × "Peças em garantia (envio e retorno)" | Faixa no topo: "Próximo passo: registrar a avaliação técnica" (o sistema já sabe a etapa); seções concluídas recolhidas; renomear para "Compra de peça (reposição)" e "Peça defeituosa (envio ao fornecedor e retorno)" |
| **M7** ✅ 03/11/2026 | Garantia, lista | Sem coluna "o que falta" e sem ordenar pelos parados | Coluna "Próximo passo" e ordem por dias parado |
| **M8** ✅ 03/11/2026 | Chamados NFC | Botão "Carregar" (é atualizar); sem caminho do chamado para a OS ou a Garantia, embora o chassi, a placa e o modelo já estejam no chamado | "Atualizar"; botão "Abrir OS deste chamado" levando os dados à Nova OS |
| **M9** ✅ 03/11/2026 | Filtro "Tipo de serviço" | Lista fixa de 4 nomes (Orçamento, Conserto, Troca, Garantia), mas o cadastro aceita outros | Montar o filtro pelo cadastro |
| **M10** ✅ 03/11/2026 | Lista de OS | 12 colunas, com rolagem lateral em tela menor | Esconder as colunas de tempo atrás de "Mais colunas" |
| **M11** ✅ 03/11/2026 | Barra de progresso do veículo **presencial** | Depois que o SAC aprova o orçamento, a OS vai a "Aguardando Início", e a barra a desenha como "Provisionada" (as duas etapas valem a mesma casa). A barra **volta uma casa** | A pessoa acha que a OS retrocedeu. Quem lê "etapa 3 de 12" e depois "etapa 3 de 12" de novo não entende o que mudou | Dar a "Aguardando Início" a casa própria (depois de "Aguardando Aprovação Cliente") no caminho presencial |

### Baixa — acabamento e risco futuro

| Cód. | Onde | Hoje | Sugestão |
|---|---|---|---|
| **B1** ✅ 03/11/2026 | Cadastros vazios | Mensagem de programador: *"Rode o SQL sac_tipos_servico.sql no Supabase."* | "Nenhum tipo cadastrado. Avise a TI." |
| **B2** ✅ 03/11/2026 | Carga da lista | Lê todas as OS de uma vez, sem paginar; o banco corta em 1.000 por leitura. Hoje são centenas, mas ao passar de mil as mais antigas **somem sem aviso** | Usar a leitura paginada que o sistema já tem (`LerPaginado`) |
| **B3** ✅ 03/11/2026 | Erros do banco | Alguns avisos terminam em "Erro: " + texto técnico do banco (às vezes em inglês) | Traduzir os mais comuns (número repetido, sem permissão, sem conexão) |
| **B4** ✅ 03/11/2026 | Quadro no celular/tablet | Arrastar o cartão não funciona com o dedo; o menu "Mover para…" funciona, mas ninguém avisa | Frase fixa sob o quadro: "No celular, use ⋯ > Mover para…" |

---

## Proposta de ondas (se você quiser construir)

| Onda | O que entra | Por quê primeiro |
|---|---|---|
| **1 — textos e proteções** (meio dia) ✅ feita em 03/11/2026 | A3, A4, B1, B4, M3, A5 (só os rótulos), M11 | Sem mudar regra nenhuma; corrige o texto errado, a barra que volta uma casa e fecha o buraco do "Desativar Garantia" |
| **2 — encontrar e agir** ✅ feita em 03/11/2026 | A1, A2, A7, M2, M9 | O operador chega no quadro mais rápido e age a partir do painel |
| **2b — conferir com a Produção** ✅ feita em 03/11/2026 | A8 | Primeiro confirmar o que a Produção faz com a OS veicular sem cobrança; só então decidir se muda |
| **3 — Garantia e NFC** ✅ feita em 03/11/2026 | M6, M7, M8, A6 | Guia o "próximo passo" |
| **4 — lote e Nova OS** ✅ feita em 03/11/2026 | M4, M1, M5, M10, B2, B3 | Mexe em mais lugares; vale fazer depois de ver o uso das ondas anteriores |

## Decisões que são suas (não vou supor)

Nenhuma em aberto. (A5, respondida em 03/11/2026: **sim**, a entrega do veículo colhe assinatura e fotos como a do Laboratório.)

## Fora desta análise

Dados reais das OS-0044 a 0049 (Defesa Civil de Taió): **não foram mexidos**. Quando a atualização for publicada, o SAC usa **Registrar atendimento já realizado** (seção "Registrar atendimento já realizado" do manual).

## Onda 1 — o que foi feito (03/11/2026)

- **A3:** a ajuda de "Presencial" na Nova OS agora diz "A Produção marca a data do atendimento; o SAC confirma a data com o cliente (Aceite SAC)".
- **A4:** o tipo "Garantia" ganhou o selo "Tipo do sistema" e **não tem mais o botão Desativar** (a função também recusa); desativar tipo de serviço, equipamento ou categoria **pede confirmação** (a categoria de veículo avisa que o sistema a reconhece pelo nome).
- **A5 (só rótulos):** "Enviar ao Fiscal — informar seriais" (veículo), "Enviar ao Fiscal — valor e CPF/CNPJ" (Laboratório), "Entrega — nome de quem recebeu" (veículo) e "Entrega — assinatura e fotos" (Laboratório), com a dica do que a janela pede. **Não mudou regra nenhuma.**
- **B1:** a lista vazia de tipos diz "Nenhum tipo de serviço cadastrado. Avise a TI." (sem o texto de programador).
- **B4:** frase fixa acima do quadro: no celular e no tablet o arrastar não funciona, use o menu ⋯ > Mover para….
- **M3:** Acompanhamento, Responsável, Ver orçamento, Atendimento, Prazo do orçamento, Tempo do orçamento, Tempo da execução e Quantidade, por extenso.
- **M11:** o caminho do veículo presencial tem "Aguardando Início" como casa própria (agora 12 etapas, com "Aguardando Início" depois de "Aguardando Aprovação Cliente"); a barra não volta mais. A remota continua tratando "Aguardando Início" como "Provisionada".
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas (dica do quadro, rótulos do quadro e da lista, Garantia sem Desativar e com selo, confirmação ao desativar e cancelar sem gravar: 0 gravações); a barra presencial avança em todas as 7 etapas testadas (1/12 a 7/12) e a remota segue em 5/11 no "Aguardando Início". O manual do SAC foi ajustado (fonte, `mudancas`, `atualizadoEm` e gerador).

## Onda 2 — o que foi feito (03/11/2026)

- **A1:** a legenda das etapas virou o botão **"Como a OS caminha"**, fechado por padrão (a escolha de cada pessoa fica lembrada neste computador); o painel "o que está com cada setor" mostra 3 linhas em vez de 6; os filtros já ficam logo acima do quadro. A agenda do SAC (acima das abas) **não foi mexida**.
- **A2:** a linha do painel abre o **resumo da OS** (clique ou Enter); **"Ver todas na lista"** leva à lista filtrada por SAC. Não abre a janela do passo direto (o resumo já mostra o botão do passo).
- **A7:** a lista de OS se atualiza **sozinha a cada 60 s** (só com a aba SAC > Ordens de Serviço aberta e a página visível), com o botão **Atualizar** e a hora da última leitura. A leitura silenciosa não pisca "Carregando..." e, **se falhar, mantém a lista que já tinha** (antes uma falha esvaziava a lista sem avisar). **Só a lista de OS**; Chamados NFC e Garantia seguem com o botão Carregar de antes.
- **M2:** o menu ⋯ da OS ganhou três grupos com título (Dados da OS, Mover a OS, Encerrar a OS); o cancelamento fica por último e em vermelho. `MenuAcoes` aceita `grupo` em cada item (menus sem grupo não mudam).
- **M9:** o filtro "Tipo de serviço" vem do cadastro (mais os tipos que ainda existem em OS antigas), em ordem alfabética.
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas e leitura real (legenda fecha/abre/lembra após recarregar, painel com 3 linhas clicáveis que abrem o resumo, "Ver todas na lista", Atualizar lê de novo sem piscar, leitura automática em ~60 s, filtro com os 9 tipos do cadastro, menu com os três grupos e "Cancelar OS" em vermelho no fim; 0 gravações). Manual do SAC ajustado e as fotos 01 a 35 refeitas.

## Onda 3 — o que foi feito (03/11/2026)

- **Decisões do usuário (A6):** o chamado vira alerta vermelho com **3 dias** sem conclusão; **a nota é obrigatória** ao concluir.
- **A6:** o cartão do chamado Aberto ou Em Atendimento diz "aberto há N dia(s)"; a partir de 3 dias vira o selo vermelho "Aberto há N dias". **Concluir** pergunta "O que foi feito no chamado?"; sem texto não grava nada (aviso "a nota é obrigatória"); com texto, o status vira Concluído e a nota entra no fim das Notas com a data e o nome de quem concluiu (o texto de antes não se perde).
- **M8:** "Carregar" virou **Atualizar**; novo botão **Abrir OS** no chamado Aberto ou Em Atendimento abre a Nova OS do SAC já preenchida (cliente, telefone, e-mail, chassi, modelo, defeito e uma observação com a origem). O chamado **não guarda o número da OS** (anotar nas Notas, como antes); **não** há atalho "abrir ficha de garantia" a partir do chamado.
- **M7:** a lista da Garantia tem a ordem **Mais parados primeiro** (padrão) ou **Mais recentes**, e a coluna "Etapa" virou **"Etapa e próximo passo"**, com "Próximo: …" embaixo da etapa.
- **M6:** a ficha aberta mostra a faixa **"Próximo passo: …"** com o botão "Ir para a seção" (abre a seção recolhida e rola até ela); **avaliação registrada, fornecedor liberado e quem executa definido ficam recolhidos** (só essas três: as demais seções seguem abertas); as seções de peças foram renomeadas para **"Compra de peça (reposição)"** e **"Peça defeituosa (envio ao fornecedor e retorno)"**. O "próximo passo" é uma regra pura (`proximoPassoDaGarantia`, em `GarantiaModelo.ts`) que usa as mesmas travas que a ficha já usa; a regra do chamado está em `SacFluxo.ts` (`chamadoEsquecido`, `formularioDoChamadoNfc`, `textoDoFechamentoDoChamado`).
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas (3 chamados e 3 fichas simulados: selo vermelho só no de 5 dias, Concluir sem nota = 0 gravações, com nota = a gravação certa com o texto emendado, Abrir OS abre a Nova OS com chassi, defeito, cliente e telefone, lista da Garantia na ordem dos parados e depois dos recentes, ficha com a faixa, seções recolhidas e o clique no título reabrindo). Manual ajustado e as fotos 40, 41 e 50 a 70 refeitas.

## Onda 4 — o que foi feito (03/11/2026)

- **Decisões do usuário:** M5 — Aprovado e Provisionada saem do verde e ganham o tom de **andamento** (azul); M1 — acessórios, fotos, faturamento, valores e vínculo com o CRM ficam **recolhidos para todo mundo**; M4 — o lote passa em bloco **Seguir sem cotação**, **os passos sem janela própria** e **Cancelar OS**.
- **M4:** o cartão do lote e o menu ⋯ da OS de lote têm **Passar as OS do lote…** (janela `PassagemEmLoteModal.tsx`): escolhe a passagem, preenche o que ela pede (cancelar = um motivo só, com faixa vermelha), desmarca as OS que não devem ir e confirma. Só entram as OS que **podem** dar o passo. Cada OS é gravada conferindo a etapa de antes (`.eq('status', …).select('id')`); a demanda aberta do setor recebe o recado e **não é fechada**, como na passagem de uma OS só. Regras puras em `SacFluxo.ts` (`PROCESSOS_EM_LOTE`, `passagensEmLote`, `camposDaPassagem`, `validarDadosDaPassagem`, `patchDaPassagem`); em `SacTab.tsx`, os efeitos de um passo (histórico, recado à demanda, abertura da demanda) saíram de `gravarMovimento` para `efeitosDoMovimento`, usado também pelo lote. No "Seguir como vendida" em lote, o valor da venda preenchido vale para todas as marcadas; em branco, cada OS mantém o seu. Os passos com janela própria (aprovar, enviar ao Fiscal, entregar) seguem OS por OS.
- **M1:** a Nova OS mostra o essencial (classificação, equipamento, cliente, prazos, veículo e avisos) e o bloco **"Mais dados"** recolhido; diz "Preenchido: …" quando há algo dentro e abre sozinho quando a OS já vem preenchida (cópia, CRM, garantia). Ao lado do **ABRIR OS** aparece em vermelho **"Falta: …"** (`faltaNaNovaOS`, em `SacFluxo.ts`, na mesma ordem em que o botão confere).
- **M5:** `STATUS_COR` e `FAMILIA_STATUS_SAC` de Aprovado e Provisionada passam a azul/`info`.
- **M10:** a lista mostra 10 colunas; **Mais colunas** / **Menos colunas** (só na lista) liga e desliga Tempo do orçamento e Tempo da execução.
- **B2:** `lerOrdens` usa `lerPaginado` (blocos de 1.000, desempate por `id`): passando de mil OS, nenhuma some.
- **B3:** `ErroDoBanco.ts` (`explicarErroDoBanco`) traduz número de OS repetido, falta de permissão, sessão vencida, sem conexão, demora, campo obrigatório, vínculo inexistente, valor ou texto inválido e registro não encontrado; os 48 avisos da `SacTab.tsx` que mostravam o texto cru do banco passam por ele. Erro desconhecido sai com o texto original e "(se repetir, avise a TI)".
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas (lote de 4 OS: janela com as passagens certas, 4 gravações cada uma conferindo `status=eq.Em Cotação`, cancelar sem motivo = 0 gravações, com motivo o patch de cancelamento, recado na demanda; a OS sem lote não tem o item no menu; o passo de uma OS só continua igual — Iniciar a execução grava só se ainda estava Aprovado e deixa o recado; Mais dados recolhido, resumo "Preenchido", abertura automática, "Falta: …" mudando a cada campo; cores azuis; Mais colunas liga e desliga; leitura paginada pedindo o bloco seguinte; mensagens de erro traduzidas; 0 gravações indevidas). Manual ajustado e as fotos 01 a 35 refeitas, novas 29b, 34f0 e 34m.
- **Ainda em aberto:** a decisão A5, que foi respondida e construída depois (ver "A5 — o que foi feito").

## Onda 2b — o que foi feito (03/11/2026)

- **Conferido:** o código da Produção (`ProducaoTab.tsx`, `confirmarChegada`) levava TODO veículo de "Provisionada" a "Verificação e Orçamento" e, depois do orçamento, a "Aguardando Aprovação Cliente" (o SAC aprova), inclusive a garantia e a cortesia. No banco, em 03/11/2026, nenhuma OS estava nessas duas etapas e 4 OS (3 de garantia/sem cobrança, nula ou marcada) estavam em "Provisionada", prestes a cair nisso.
- **Decisão do usuário:** a OS veicular sem cobrança pula a verificação, o orçamento e a aprovação: **Chegou → Aguardando Início**.
- **O que mudou:** `confirmarChegada` vai a "Aguardando Início" quando `osSemCobranca(os)` (a janela diz o próximo status) e passou a conferir a etapa de antes (`.eq('status', …).select('id')`); `salvarConclusao` não compara com o orçamento na OS sem cobrança (antes, sem orçamento aprovado e com materiais lançados, ela ficaria presa em "revisão pendente"). A OS cobrada segue como sempre. Nenhuma OS existente foi mexida.
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas (garantia e OS antiga de tipo Garantia: grava "Aguardando Início" só se ainda "Provisionada"; cobrada: "Verificação e Orçamento"; concluir da garantia com materiais vai ao CQ; concluir da cobrada com total diferente continua em revisão pendente).

## A5 — entrega do veículo com assinatura e fotos (o que foi feito, 03/11/2026)

- **Decisão do usuário:** "sim, a entrega do veículo colhe assinatura e fotos".
- **O que mudou:** a janela "Entrega de Veículo" (OS veicular sem cobrança "Concluído" ou "Faturada - Aguardando Entrega") passa a pedir **nome de quem recebeu\*, fotos do veículo na entrega (opcionais, como no Laboratório) e assinatura de quem recebeu\* (obrigatória)**. O botão, nos dois fluxos, é **"Entrega — assinatura e fotos"** (saiu "Entrega — nome de quem recebeu"). Suposição registrada: as **fotos seguem opcionais**, como no Laboratório; se o SAC quiser exigir ao menos uma foto do veículo, é uma linha em `confirmarEntregaVeicular`.
- **Como foi feito (`SacTab.tsx`):** o envio da assinatura e das fotos virou um passo só, `subirProvaDaEntrega`, usado pela entrega do Laboratório (`salvarSaida`, mesmas mensagens de antes) e do veículo (`confirmarEntregaVeicular`): sobe tudo **antes** de gravar a OS e, se algo falhar, nada é gravado e a janela fica como está. A janela do veículo reaproveita o formulário da do Laboratório (`saidaForm`, `fotosSaidaFiles`; só uma entrega fica aberta por vez) e saiu o estado `nomeRecebeuVeic`. A gravação do veículo passou a **conferir a etapa de antes** (`.eq('status', os.status).select('id')`): se outra pessoa já entregou, avisa e atualiza a lista. A assinatura e as fotos gravam nas colunas que já existiam (`assinatura_saida_url`, `fotos_saida`), então o resumo da OS ("Assinatura da saída", "N foto(s) de saída") e o PDF já as mostram. Nenhuma coluna nem OS existente foi mexida.
- **Manual:** o passo "Entregar ao cliente" descreve as duas janelas como uma; o "Apêndice: pontos de melhoria" ficou sem itens abertos. Sem foto nova (a janela do veículo é a do Laboratório mais o cabeçalho com cliente, modelo e placa).
- **Teste:** `npx vite build` verde; navegador com gravações bloqueadas, 15 verificações: o botão certo nas três situações (veículo "Concluído", veículo "Faturada - Aguardando Entrega", Laboratório); a janela do veículo com nome, fotos e assinatura; sem nome e sem assinatura = 0 gravações e aviso; com os dois, a assinatura sobe e a OS grava "Entregue" com nome, `assinatura_saida_url` e `fotos_saida` vazia, só se `status=eq.Concluído`; com 1 foto, 2 arquivos sobem e grava só se `status=eq.Faturada - Aguardando Entrega`; a entrega do Laboratório continua igual; nenhuma gravação fora da OS e do armazenamento.
