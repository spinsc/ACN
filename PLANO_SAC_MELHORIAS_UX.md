# Plano: melhorias de uso, UX e UI do setor SAC

**Situação (30/10/2026): PENDENTE, nada construído ainda.** Nasceu como análise e virou plano: cada código (A1, M3...) é uma fatia; o usuário diz quais fazer e em que ordem. Marque aqui cada achado como ✅ (com a data) quando for construído. Só o "Registrar atendimento já realizado" foi feito, antes da análise, e não está na lista. O manual do setor (`MANUAL_SAC/`) descreve a tela como ela é hoje: ao construir um achado, atualize o texto do manual e rode `node MANUAL_SAC/build_manual.cjs`.

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
| **A1** | Ordens de Serviço, topo da tela | A tela abre com agenda, legenda de três linhas de etapas, o painel "o que está com cada setor" (até 6 linhas) e os filtros **antes** do quadro. Em tela de 950 px o quadro só aparece depois de rolar | O operador usa o quadro/lista o dia todo e vê primeiro o que consulta de vez em quando | Recolher a legenda ("Como a OS caminha ▸", fechada por padrão, lembra a escolha da pessoa); painel mais baixo; filtros colados ao quadro | Pequeno |
| **A2** | Painel "o que está com cada setor hoje" | As linhas (OS, cliente, etapa, o que fazer) **não são clicáveis**; só mostra 6 e manda "usar o filtro SAC" | O painel diz o que fazer, mas a pessoa tem de procurar a OS para fazer | Clicar na linha abre o resumo da OS (ou já a janela do passo); "ver todas" leva à lista filtrada | Pequeno |
| **A3** | Nova OS de veículo, avaliação **Presencial** | O texto de ajuda diz *"SAC define data de entrega do veículo (Provisionamento)"* | É o contrário do fluxo: quem marca a data é a **Produção**; o SAC só dá o **aceite** depois. O painel "quem age" e o manual dizem outra coisa | Trocar o texto para "A Produção marca a data do atendimento; o SAC confirma com o cliente (Aceite SAC)" | Mínimo (uma frase) |
| **A4** | Cadastros > Tipos de Serviço | "Garantia" tem o botão **Desativar** (vermelho, sem confirmação), como qualquer tipo. O sistema reconhece a OS de garantia **pelo nome** "Garantia"; a OS de **veículo** também depende do **nome da categoria** (precisa conter "manutenção" ou "garantia" junto de "veicular" ou "veículo") | Quem desativar "Garantia" tira o tipo da Nova OS e a garantia deixa de abrir OS. O mesmo vale, sem confirmação, para equipamentos e categorias | Marcar "Garantia" como **tipo do sistema** (selo, sem botão de desativar) e pedir confirmação ao desativar qualquer cadastro | Pequeno |
| **A5** | Botões "Enviar ao Fiscal" e "Entrega" | Há **duas janelas** para ir ao Fiscal (veículo: pede o nº de série dos itens, botão "Enviar para Fiscal"; Laboratório: pede valor e CPF/CNPJ, botão "Enviar ao Fiscal") e **três** janelas de entrega (Laboratório: nome + fotos + assinatura; veículo: só o nome de quem recebeu; garantia do Laboratório igual à primeira) | O mesmo nome de botão pede coisas diferentes; o operador só descobre depois de clicar. A entrega do veículo **não colhe assinatura**, a do Laboratório colhe | Escrever no botão o que ele pede ("Enviar ao Fiscal — informar seriais" / "— valor e CPF/CNPJ") e **decidir com você** se a entrega do veículo também deve colher assinatura e fotos | Pequeno (texto) + decisão sua |
| **A6** | Chamados NFC | Mostra só a data de abertura, sem dizer há quantos dias; chamado aberto há dias não se destaca; "Concluir" fecha sem pedir nota | Chamado de cliente esquecido passa despercebido (na OS, 7 dias já vira alerta vermelho) | "Aberto há N dias", selo vermelho a partir de um prazo que você definir, e pedir uma nota ao concluir | Pequeno + decisão sua (prazo) |
| **A7** | Todas as listas | A lista só atualiza quando a pessoa age ou recarrega a página; não há atualização automática | Duas pessoas no SAC veem versões diferentes; o aviso "outra pessoa mexeu" só chega **depois** do clique | Atualizar sozinha a cada 60 s (ou botão "Atualizar" com a hora da última leitura) | Pequeno |
| **A8** | Veículo **sem cobrança** (garantia ou cortesia) na Produção | A regra diz: sem cotação, sem aprovação do cliente, caminho "Em Provisionamento → Provisionada → Em Execução → CQ → Concluído → Entrega". Mas a tela da Produção, pelo que o código faz, ainda leva o veículo por **"Verificação e Orçamento"** e **"Aguardando Aprovação Cliente"** (onde aparecem **Aprovado** e **Recusado** para o SAC) antes de iniciar. **A CONFIRMAR com dado de verdade: li o código, não vi acontecer** | Se acontecer, o SAC vê uma OS que "não devia" pedir aprovação e não sabe se aprova. A barra de progresso mostra etapas que a OS pulou | Conferir com a Produção; se confirmado, a Produção passa direto de "Provisionada" a "Aguardando Início" nas OS sem cobrança (e o SAC não vê Aprovado/Recusado) | Pequeno a médio (mexe na Produção) |

### Média — melhora o entendimento

| Cód. | Onde | Hoje | Sugestão |
|---|---|---|---|
| **M1** | Nova OS | Um formulário único de 13 blocos. Só 3 coisas são obrigatórias (cliente, tipo de equipamento, defeito reclamado), mas acessórios, fotos, faturamento, valores e vínculo com o CRM ocupam a mesma rolagem | Mostrar o essencial e recolher "Mais dados (acessórios, fotos, faturamento, valores, CRM)"; mostrar "Falta: …" perto do botão **Abrir OS** |
| **M2** | Menu ⋯ da OS | Até **12 itens** misturados: Resp., Financeiro, Compras, Anexar, PDF, Copiar, Cancelar OS, Entregar sem nota, Mover para…, Voltar para…, Registrar atendimento já realizado | Separar em grupos com linha (Dados da OS / Mover a OS / Encerrar), os destrutivos ao fim e em vermelho |
| **M3** | Rótulos | "Resp.", "Acomp.", "Atend.", "Orç.", "KPI Orç.", "KPI Exec.", "Qtd" | Por extenso onde couber (Responsável, Acompanhamento, Atendimento); "KPI" não diz o que mede: "Tempo do orçamento" / "Tempo da execução" |
| **M4** | Lote de OS | O cartão do lote só tem "Registrar atendimento já realizado". Para as outras passagens é preciso abrir o lote e repetir OS por OS (as 7 viaturas da Defesa Civil = 7 confirmações de "Seguir sem cotação") | Passagens em lote: marcar as OS do lote e aplicar a mesma passagem, no mesmo desenho do registro em lote |
| **M5** | Cores das etapas | "Aprovado" (Laboratório) e "Provisionada" aparecem **verdes**, como se estivessem prontas, mas ainda falta execução | Verde só no que terminou; "Aprovado" e "Provisionada" em tom de andamento |
| **M6** | Garantia, ficha | Janela com **11 seções empilhadas**; não diz qual é o próximo passo. Nomes parecidos: "Peças pedidas ao Compras" × "Peças em garantia (envio e retorno)" | Faixa no topo: "Próximo passo: registrar a avaliação técnica" (o sistema já sabe a etapa); seções concluídas recolhidas; renomear para "Compra de peça (reposição)" e "Peça defeituosa (envio ao fornecedor e retorno)" |
| **M7** | Garantia, lista | Sem coluna "o que falta" e sem ordenar pelos parados | Coluna "Próximo passo" e ordem por dias parado |
| **M8** | Chamados NFC | Botão "Carregar" (é atualizar); sem caminho do chamado para a OS ou a Garantia, embora o chassi, a placa e o modelo já estejam no chamado | "Atualizar"; botão "Abrir OS deste chamado" levando os dados à Nova OS |
| **M9** | Filtro "Tipo de serviço" | Lista fixa de 4 nomes (Orçamento, Conserto, Troca, Garantia), mas o cadastro aceita outros | Montar o filtro pelo cadastro |
| **M10** | Lista de OS | 12 colunas, com rolagem lateral em tela menor | Esconder as colunas de tempo atrás de "Mais colunas" |
| **M11** | Barra de progresso do veículo **presencial** | Depois que o SAC aprova o orçamento, a OS vai a "Aguardando Início", e a barra a desenha como "Provisionada" (as duas etapas valem a mesma casa). A barra **volta uma casa** | A pessoa acha que a OS retrocedeu. Quem lê "etapa 3 de 12" e depois "etapa 3 de 12" de novo não entende o que mudou | Dar a "Aguardando Início" a casa própria (depois de "Aguardando Aprovação Cliente") no caminho presencial |

### Baixa — acabamento e risco futuro

| Cód. | Onde | Hoje | Sugestão |
|---|---|---|---|
| **B1** | Cadastros vazios | Mensagem de programador: *"Rode o SQL sac_tipos_servico.sql no Supabase."* | "Nenhum tipo cadastrado. Avise a TI." |
| **B2** | Carga da lista | Lê todas as OS de uma vez, sem paginar; o banco corta em 1.000 por leitura. Hoje são centenas, mas ao passar de mil as mais antigas **somem sem aviso** | Usar a leitura paginada que o sistema já tem (`LerPaginado`) |
| **B3** | Erros do banco | Alguns avisos terminam em "Erro: " + texto técnico do banco (às vezes em inglês) | Traduzir os mais comuns (número repetido, sem permissão, sem conexão) |
| **B4** | Quadro no celular/tablet | Arrastar o cartão não funciona com o dedo; o menu "Mover para…" funciona, mas ninguém avisa | Frase fixa sob o quadro: "No celular, use ⋯ > Mover para…" |

---

## Proposta de ondas (se você quiser construir)

| Onda | O que entra | Por quê primeiro |
|---|---|---|
| **1 — textos e proteções** (meio dia) | A3, A4, B1, B4, M3, A5 (só os rótulos), M11 | Sem mudar regra nenhuma; corrige o texto errado, a barra que volta uma casa e fecha o buraco do "Desativar Garantia" |
| **2 — encontrar e agir** | A1, A2, A7, M2, M9 | O operador chega no quadro mais rápido e age a partir do painel |
| **2b — conferir com a Produção** | A8 | Primeiro confirmar o que a Produção faz com a OS veicular sem cobrança; só então decidir se muda |
| **3 — Garantia e NFC** | M6, M7, M8, A6 | Guia o "próximo passo" |
| **4 — lote e Nova OS** | M4, M1, M5, M10, B2, B3 | Mexe em mais lugares; vale fazer depois de ver o uso das ondas anteriores |

## Decisões que são suas (não vou supor)

1. **A5:** a entrega do **veículo** deve colher assinatura e fotos como a do Laboratório? (Hoje pede só o nome de quem recebeu.)
2. **A6:** a partir de quantos dias um chamado NFC aberto vira alerta vermelho? (Na OS é 7; na peça da Garantia, 5.)
3. **M5:** "Aprovado" e "Provisionada" deixam de ser verdes? (Muda a cor de um selo que o SAC já conhece.)
4. **Nova OS (M1):** o quadro de valores (comissão) e o de faturamento ficam recolhidos para todo mundo, ou só quando a OS é sem cobrança?

## Fora desta análise

Dados reais das OS-0044 a 0049 (Defesa Civil de Taió): **não foram mexidos**. Quando a atualização for publicada, o SAC usa **Registrar atendimento já realizado** (seção "Registrar atendimento já realizado" do manual).
