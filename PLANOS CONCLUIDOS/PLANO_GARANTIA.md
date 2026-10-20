# Atendimento em garantia — desenho e etapas

> **PLANO CONCLUÍDO — 20/10/2026.** As seis etapas (G1 a G6) estão em produção. O `/garantia` serve só para consulta ou ajuste.

> Proposta de **08/10/2026**, a pedido do usuário ("Lista pedido Bruna": procedimento de atendimento em garantia).
> **G1, G2 e G3 construídas em 19/10/2026 e G4, G5 e G6 em 20/10/2026** (ver "Como ficou a G1" a "G6" no fim). Este arquivo é o desenho; cada etapa só começa depois do OK e vai para
> produção sozinha, com teste e com este plano atualizado (mesmo padrão dos outros planos do projeto).

## Ponto de partida (o que existe hoje)

- No SAC, uma OS com tipo de serviço **"Garantia"** é aprovada sozinha e vai direto para execução. Não há avaliação de
  cobertura, consulta ao fornecedor, custos, autorização da direção, controle de peças nem relatório.
- O cadastro de produtos tem "Garantia padrão" (meses) e a OP tem `prazo_garantia`: servem de **consulta** para saber se
  o atendimento está dentro do prazo.
- Compras já recebe pedido ligado a uma OP (`criarRequisicaoCompra`) e o catálogo de veículos já existe.

## Como cada ponto do pedido vira função do sistema

| # | Pedido | O que o sistema passa a ter |
|---|---|---|
| 1 | Registro individual por atendimento (cliente, veículo, placa ou chassi), com histórico, custos e autorizações separados | **Ficha do atendimento**: um registro por atendimento, com número próprio (`GAR-0001/2026`), cliente, veículo do catálogo, placa/chassi e a OP/OS de origem (opcional). Tudo que vem depois (custos, autorizações, peças, histórico) fica **preso à ficha** e nunca se mistura com outro atendimento. |
| 2 | Avaliação técnica da ocorrência e da cobertura antes de definir o atendimento | Etapa **Avaliação técnica**: parecer do técnico + cobertura (**dentro**, **fora** ou **a confirmar**), mostrando o prazo de garantia da OP/produto como apoio. Sem avaliação, não segue. |
| 3 | Verificar a garantia com o fornecedor antes de comprar peça de reposição | Etapa **Fornecedor**: fornecedor, protocolo, resposta e prazo. O botão de pedir peça no Compras **só libera** depois dessa resposta registrada (ou justificativa de que não se aplica). |
| 4 | Confirmar e negociar antes os custos de diagnóstico, deslocamento, frete e outros | **Quadro de custos** do atendimento: cada linha tem tipo, valor previsto, valor negociado, quem negociou e se foi aprovado. O total aparece na ficha. |
| 5 | Execução por equipe própria ou terceiro | Campo **Quem executa**: equipe própria (técnicos) ou terceiro (nome e custo, que entra no quadro de custos). |
| 6 | Alinhar antes com o cliente as condições e quem paga se o problema não for do nosso fornecimento | Registro **Alinhamento com o cliente**: quem falou, quando, o que ficou combinado e se o cliente aceitou. Atendimento fora da garantia **não segue** sem esse registro. |
| 7 | Aprovação da direção para despesa fora da cobertura ou cortesia | **Autorização**: quem pede, valor, motivo, e decisão da direção (aprovou/negou/quando). Só a direção decide; fica gravado quem e quando. |
| 8 | Registro de falhas, peças usadas, horas técnicas, custos, técnicos e solução | **Apontamentos do atendimento**: falha encontrada, solução adotada, técnicos e horas, peças aplicadas. |
| 9 | Controle de envio e retorno das peças em garantia | **Peças em garantia**: cada peça com situação (a enviar, enviada ao fornecedor, em análise, retornou, reposta), datas e rastreio. Lista de "peças que ainda não voltaram". |
| 10 | Relatório semanal de atendimentos, custos e pendências | **Relatórios › Garantia**: semana escolhida, atendimentos abertos/encerrados, custos, o que está parado e há quantos dias, com PDF. |
| 11 | Definir quem recebe e quem é copiado em cada atendimento, da abertura ao encerramento | **Partes do atendimento**: lista de responsáveis e copiados, definida na abertura e usada em todos os avisos (menção + aviso no sistema) até o encerramento. |
| 12 | Informações obrigatórias na abertura do chamado | Formulário de abertura que **não grava** sem os campos obrigatórios (lista abaixo). |

### Campos obrigatórios na abertura (proposta inicial, a ser fechada com os setores)

Cliente (nome e contato) · veículo (catálogo) · placa **ou** chassi · OP/OS de origem **ou** nota fiscal da venda · descrição da
falha · data da ocorrência · quem abriu (automático) · responsável pelo atendimento · quem é copiado.

## Etapas de construção (proposta)

Cada etapa funciona sozinha e vai para produção sozinha.

| Etapa | Entrega | Cobre os pontos |
|---|---|---|
| **G1** ✅ | **Ficha e abertura**: tabela do atendimento, formulário com campos obrigatórios, lista/quadro dentro do SAC (aba "Garantia"), histórico de movimentação e permissões. | 1, 12 |
| **G2** ✅ | **Avaliação e fornecedor**: parecer técnico, cobertura, consulta ao fornecedor, quem executa; trava do pedido de peça no Compras. | 2, 3, 5 |
| **G3** ✅ | **Custos, cliente e direção**: quadro de custos, alinhamento com o cliente, autorização da direção. | 4, 6, 7 |
| **G4** ✅ | **Peças e apontamentos**: controle de envio/retorno de peças; falhas, horas, técnicos e solução. | 8, 9 |
| **G5** ✅ | **Partes e avisos**: responsáveis e copiados por atendimento, avisos automáticos a cada mudança. | 11 |
| **G6** ✅ | **Relatório semanal** (tela + PDF) e encerramento do atendimento. | 10 |

## O que precisa ser decidido com os setores (a mensagem original pede ao Luciano que coordene)

1. **Responsáveis por etapa**: quem faz a avaliação técnica, quem fala com o fornecedor, quem negocia custos.
2. **Critério de autorização**: tudo fora da garantia vai para a direção, ou há um valor abaixo do qual o gerente decide?
3. **Quem é a "direção"** no sistema (perfil ou pessoas nomeadas).
4. **Lista final de campos obrigatórios** e de quem é copiado por padrão.
5. **Prazo para cobrar** atendimento parado (ex.: sem movimento em 5 dias aparece no relatório).

## Decisões do usuário em 19/10/2026 (G1)

1. **Campos obrigatórios na abertura: os do plano, como estão** — cliente (nome e contato), veículo do catálogo, placa **ou** chassi, OP/OS de origem **ou** nota fiscal, descrição da falha, data da ocorrência, responsável e quem é copiado (ao menos uma pessoa); quem abriu entra sozinho.
2. **Quem abre:** SAC, Comercial e gerentes (Admin incluído). **Quem vê:** quem abriu, o responsável, os copiados e o Admin.
3. **Numeração:** `GAR-0001/2026` (sequencial por ano).

Continuam em aberto (não impedem a G1; entram quando a etapa que depende delas for construída): responsáveis por etapa, critério de autorização da direção, quem é a "direção" no sistema e o prazo para cobrar atendimento parado.

## Como ficou a G1 (19/10/2026)

**Banco (migração `garantia_g1_ficha_e_abertura`):** tabelas `garantia_atendimentos` (a ficha) e `garantia_contadores` (o número por ano) e a função **`garantia_abrir`**, que **dá o número e grava a ficha no mesmo passo**: se o cadastro é recusado por qualquer regra, o número volta junto (testado no banco, numa transação desfeita: abriu o 0001, uma abertura recusada e outra sem copiado **não consumiram número**, a seguinte saiu 0002; 0 linhas e 0 contadores ficaram). Os **campos obrigatórios também são regra do banco** (não só da tela): textos não vazios, placa **ou** chassi, ao menos um copiado, origem de um dos três tipos. **Atendimento não se apaga: o `DELETE` foi retirado do banco** para a chave pública e para quem está logado; só cancela (com motivo) e reabre. A tabela nasce com a regra "libera tudo" que o gatilho do banco exige (como as demais tabelas operacionais); **quem vê o quê vale na tela, e o banco só passa a filtrar por pessoa quando a Etapa 17 fechar as tabelas operacionais**.

**Tela (aba "Garantia" dentro do SAC; `GarantiaTab.tsx`, regras em `GarantiaModelo.ts`):**
- **Lista** com filtros Abertos / Encerrados / Cancelados / Todos (com contagem), busca sem acento (número, cliente, veículo, placa, OP, falha, responsável) e só o que a pessoa pode ver; leitura recusada mostra uma faixa de erro, nunca "nenhum atendimento".
- **Abrir:** janela com todos os campos; o **veículo vem do catálogo** (o mesmo seletor das OPs); a **OP ou a OS é escolhida numa busca** (a OP traz o cliente; a OS traz cliente, contato e chassi, só no que estava em branco) e a **nota fiscal é só o número**; **placa e chassi** se escrevem em maiúscula e sem traço e são conferidos (placa antiga ou Mercosul; chassi de 17 caracteres sem I, O e Q); a data da ocorrência não pode ser futura; o responsável já vem sendo quem abre; os copiados usam o seletor de pessoas que o resto do sistema usa (a G5 usará essa lista para os avisos). Faltando algo, a tela lista tudo o que falta de uma vez e não grava.
- **Detalhe** com todos os dados, o **histórico do atendimento** (aberto, alterado com o nome do campo, cancelado, reaberto) e, para quem abriu, o responsável e a gerência: **Editar** (só aberto), **Cancelar atendimento** (pede o motivo e confirma) e **Reabrir**. Quem é só copiado vê e não mexe.
- Toda gravação **relê a ficha e só grava se ninguém mexeu desde a leitura** (confere `atualizado_em`); se mexeram, avisa e não grava por cima.

**Testado:** 36 verificações das regras e **31 no navegador** (banco da garantia e a função de abertura simulados em memória; nenhuma gravação real): quem vê o quê para cinco perfis, abrir vazio, OP e OS escolhidas na lista, placa inválida e corrigida, a carga exata que vai ao banco, o detalhe com o número, editar (só a carga, com o campo no histórico), cancelar com motivo, reabrir, conflito e leitura recusada. **Nenhum dado real foi alterado** (o banco real ficou com 0 atendimentos).

**Fica para as próximas etapas:** avaliação técnica e fornecedor (G2), custos, cliente e direção (G3), peças e apontamentos (G4), avisos aos copiados e responsáveis (G5; hoje abrir **não avisa ninguém**), relatório semanal e **encerramento** (G6; a situação "encerrado" já existe no banco, mas nenhuma tela encerra ainda).

## Decisões do usuário em 19/10/2026 (G2)

1. **Quem registra a avaliação técnica:** o **responsável pelo atendimento** e a **gerência** (Admin e perfis "Gerente …").
2. **Quem registra a consulta ao fornecedor e pede a peça ao Compras:** a mesma regra — o responsável e a gerência.

Com isso, da lista de decisões com os setores só restam **o critério de autorização da direção, quem é a "direção" no sistema e o prazo para cobrar atendimento parado** (G3, G5 e G6).

## Como ficou a G2 (19/10/2026)

**Banco (migração `garantia_g2_avaliacao_fornecedor_execucao`):** na própria ficha, quatro colunas novas — `avaliacao`, `fornecedor`, `execucao` (jsonb, vazias) e `pedidos_compra` (jsonb, padrão vazio). As fichas existentes não mudam. A coluna `etapa` passa a ser gravada a cada registro.

**Tela (seções no detalhe do atendimento; `GarantiaEtapas.tsx`, regras em `GarantiaModelo.ts`):**
- **Avaliação técnica:** parecer (obrigatório) e **cobertura: dentro, fora ou a confirmar** (obrigatória). Ao avaliar, a tela lê a **garantia da OP** (`prazo_garantia`, ex. "12 MESES", e o dia da entrega) quando a origem é uma OP e mostra o **apoio**: "garantia de 12 meses, entregue em 10/01/2026, termina em 10/01/2027; a falha foi em 10/10/2026: dentro do prazo (faltavam 92 dias)". **É só apoio: quem decide é o técnico**; o apoio do momento fica gravado com a avaliação. Sem OP, sem prazo ou sem dia de entrega a tela **não afirma nada** e manda decidir pelo contrato ou pela nota; se a leitura da OP falhar, diz que não conseguiu ler. Dá para refazer a avaliação (fica no histórico).
- **Sem avaliação, não segue:** fornecedor e "quem executa" só se registram depois da avaliação; a tela avisa e não oferece o botão. A etapa do atendimento (Avaliação técnica → Fornecedor → Quem executa → Em atendimento) aparece no cabeçalho e na lista.
- **Fornecedor:** **consulta** (fornecedor, protocolo, data da consulta, prazo de resposta, a resposta com a decisão — *cobre*, *cobre em parte* ou *não cobre* — e a data) ou **"não se aplica" com justificativa**. A consulta pode ser registrada sem resposta e completada depois; **resposta atrasada** (passou o prazo) vira selo vermelho. Datas no futuro e resposta antes da consulta são recusadas.
- **Quem executa:** **equipe própria** (um ou mais técnicos, sem repetir) ou **terceiro** (nome e custo previsto em reais; o custo pode ficar em branco por enquanto — entra no quadro de custos na G3).
- **Pedido de peça ao Compras:** o botão **só abre com a avaliação registrada e a consulta ao fornecedor respondida (ou dispensada com justificativa)**; fechado, a tela diz o que falta. Aberto, usa **a mesma janela de solicitação de compra do resto do sistema** (itens, centro de custo, anexos…), com o título "Peça em garantia — GAR-…", o vínculo com a OP (a compra aparece como "Demanda de OP") e, nas observações, o número da garantia, o cliente, o veículo e a resposta do fornecedor; o setor de origem é "Garantia". O pedido que nasce é **registrado na ficha e no histórico**; se a ficha não gravar depois de o pedido já ter nascido, a tela dá o número do pedido para ninguém abrir outro. **A trava vale no botão da ficha**: uma compra aberta por outro caminho do Compras não sabe que é de garantia.
- Só o responsável e a gerência registram; quem abriu e os copiados **veem as seções, sem botões**. Atendimento cancelado não recebe registro.

**Testado:** 67 verificações das regras (as 36 da G1 e 31 novas) e **56 no navegador** (as 31 da G1 e 25 novas; fichas, a garantia da OP e o pedido de compra simulados em memória, nenhuma gravação real): a etapa inicial; sem avaliação, fornecedor e execução recusam; o apoio "dentro do prazo (faltavam 92 dias)"; avaliação sem parecer recusada e com ele gravada com o apoio; consulta sem fornecedor recusada; consulta sem resposta mantém a trava; resposta sem a decisão recusada; resposta completa libera o botão; terceiro sem nome recusado e com custo gravado; o pedido nasce no Compras com o número da garantia, o fornecedor, o setor e o vínculo da OP e fica na ficha e no histórico; o copiado não vê botão e o Admin conduz qualquer ficha. **Achado do teste:** depois de gravar, o formulário da seção ficava aberto (a rotina de gravação não devolvia o resultado); corrigido. **Nenhum dado real foi alterado.**

**Fica para as próximas etapas:** custos negociados, alinhamento com o cliente e autorização da direção (G3; é lá que "fora da garantia" passa a ter consequência — na G2 a cobertura só informa), peças em garantia com envio e retorno e os apontamentos (G4), avisos (G5) e relatório e encerramento (G6).

## Decisões do usuário em 19/10/2026 (G3)

1. **A "direção" é quem tem o perfil Admin** (hoje 4 pessoas); não há cadastro novo.
2. **Critério de autorização: tudo vai para a direção** — qualquer despesa fora da garantia e qualquer cortesia espera a direção, **sem faixa de valor** (o gerente não decide).
3. **Quem registra custos, alinhamento com o cliente e pede a autorização:** o responsável pelo atendimento e a gerência.

Da lista de decisões com os setores, só resta **o prazo para cobrar atendimento parado** (G6).

## Como ficou a G3 (19/10/2026)

**Banco (migração `garantia_g3_custos_cliente_direcao`):** três colunas novas na ficha — `custos`, `alinhamentos` e `autorizacoes` (jsonb, padrão vazio); as fichas existentes não mudam.

**Tela (seções no detalhe, depois do fornecedor; `GarantiaCustos.tsx`, regras em `GarantiaModelo.ts`):**
- **Quadro de custos:** cada linha tem **tipo** (diagnóstico, deslocamento, frete, mão de obra, peça, terceiro, outro), descrição, **valor previsto**, **valor negociado** (e **quem negociou**, obrigatório quando há negociado), **quem paga** (nós, cliente ou fornecedor — acréscimo meu, porque o alinhamento com o cliente trata justamente de quem paga) e **aprovado** (guarda quem aprovou e quando). Mostra **previsto, considerado (o negociado quando há, senão o previsto), aprovado e a divisão por quem paga**. O quadro **não exige a avaliação** (o diagnóstico vem antes dela). Dá para tirar uma linha: o histórico diz qual saiu. **O custo previsto do terceiro (G2) entra no quadro com um clique** ("Lançar o custo do terceiro"), uma vez só.
- **Alinhamento com o cliente:** com quem do cliente se falou, o dia, por onde (telefone, WhatsApp, e-mail, presencial ou outro), o que ficou combinado (condições e **quem paga**) e se o cliente **aceitou**, **não aceitou** ou **está aguardando**. **Só se acrescenta** (cada conversa é um registro, nada se reescreve) e **vale o último**.
- **Autorização da direção:** pedido com **tipo** (despesa fora da garantia ou cortesia), **valor** (já vem o que a empresa paga no quadro) e **motivo**. **Só a direção (Admin) aprova ou nega**; negar exige o porquê; fica gravado **quem decidiu e quando**; o pedido negado continua no histórico e dá para pedir de novo; um pedido esperando a direção por vez; quem pediu ou a gerência cancela com motivo. **O responsável e o gerente não decidem** (nem o próprio responsável).
- **A regra "fora da garantia não segue":** se a avaliação diz **fora da garantia**, **definir quem executa** e **pedir peça ao Compras** ficam travados até haver **o alinhamento aceito pelo cliente** e **uma autorização aprovada pela direção**; a ficha mostra uma faixa dizendo exatamente o que falta e o botão de peça mostra o mesmo motivo. **"Dentro" e "a confirmar" não travam**, mas "a confirmar" mostra um aviso (se ficar fora, será preciso o alinhamento e a autorização). A cortesia pode ser pedida em qualquer cobertura.
- As janelas da Garantia ficaram **largas** (o quadro de custos não cabia em 500 px).

**Testado:** **102 verificações das regras** (as 67 anteriores e 35 novas) e **86 no navegador** (as 56 anteriores e 30 novas; banco da garantia simulado em memória, nenhuma gravação real): fora da garantia a faixa diz o que falta; custo com valor que não é número e negociado sem "quem negociou" são recusados; custo gravado em reais; alinhamento "aguardando" não libera e o "aceitou" acrescentado vale; o valor do pedido já vem com o que a empresa paga; **quem pediu não vê Aprovar/Negar**; **quem executa recusa e o pedido de peça fica desligado** enquanto falta a direção; a direção nega (com o porquê) e depois aprova um novo pedido; com as duas condições o atendimento segue; o custo do terceiro entra no quadro e o total passa a somar os dois; aprovar linha guarda quem aprovou; o copiado vê sem nenhum botão. **Achado do teste:** o banco devolve os campos de uma linha em outra ordem e, sem cuidado, "salvar igual" pareceria mudança — a comparação ignora a ordem (testado). **Nenhum dado real foi alterado.**

**Fica para as próximas etapas:** controle de envio e retorno das peças em garantia e os apontamentos de falha, horas, técnicos e solução (G4); avisos aos copiados e responsáveis (G5 — a direção também só vai saber do pedido de autorização quando a G5 avisar; hoje ela precisa abrir a ficha); relatório semanal e encerramento (G6).

## Decisão do usuário em 20/10/2026 (G4)

**Quem registra os apontamentos e o envio/retorno das peças:** o **responsável pelo atendimento** e a **gerência** (a mesma regra das etapas anteriores, inclusive as horas dos técnicos).

## Como ficou a G4 (20/10/2026)

**Banco (migração `garantia_g4_pecas_e_apontamentos`):** duas colunas novas na ficha — `pecas` e `apontamentos` (jsonb, padrão vazio); as fichas existentes não mudam.

**Tela (duas seções no detalhe, depois do pedido de peça ao Compras; `GarantiaPecas.tsx`, regras em `GarantiaModelo.ts`):**
- **Peças em garantia (envio e retorno):** cada peça tem descrição, quantidade (inteira, de 1 para cima) e número de série e uma **trilha de movimentos**: *a enviar* → *enviada ao fornecedor* → *em análise* → *retornou*, *reposta* ou *descartada*. Cada movimento leva **data** (não futura e não antes do movimento anterior), **rastreio** e observação; **descartar exige o porquê**. A tela só oferece os passos seguintes possíveis (de "a enviar" só vai a "enviada" ou "descartada"); *retornou*, *reposta* e *descartada* são o **fim** do caminho. A trilha **só se acrescenta**: engano se corrige com **"Desfazer o último movimento"** (pede o motivo, que vai ao histórico); a peça cadastrada por engano só pode ser **tirada da ficha enquanto não teve nenhum movimento**. A seção mostra **"N ainda não voltaram"** e, em cada peça pendente, **há quantos dias** está parada no último movimento — a base do "o que está parado" do relatório da G6.
- **Apontamentos do atendimento (diário técnico):** **dia** (não futuro), **técnico**, **horas** (entre 0 e 24), **falha encontrada** (obrigatória), **solução adotada** e **peças aplicadas** (opcionais, podem ser preenchidas depois). Mostra o total de horas, geral e por técnico. Editar mantém o mesmo apontamento (mesmo id); o histórico diz quantos entraram e saíram e o total de horas.
- **Não exigem avaliação nem fornecedor** (o diagnóstico e o envio de peça para análise acontecem antes), e **não são travados pela regra do "fora da garantia"** (que trava quem executa e o pedido de peça ao Compras). Só o responsável e a gerência registram; quem abriu e os copiados veem sem botões; atendimento cancelado não recebe registro.
- **Horas não viram custo sozinhas** (não há valor da hora cadastrado): o custo de mão de obra continua sendo lançado no quadro de custos.

**Testado:** **127 verificações das regras** (as 102 anteriores e 25 novas) e **106 no navegador** (as 86 anteriores e 20 novas; banco da garantia simulado em memória, nenhuma gravação real): cadastro da peça com quantidade e série, as opções de movimento por situação, o rastreio gravado, descartar sem motivo recusado, "retornou" como fim (a seção passa a "Todas resolvidas"), desfazer com motivo, tirar só a peça sem movimento, apontamento sem horas / com horas que não são número / sem a falha recusados, o total de horas por técnico e completar a solução mantendo o mesmo apontamento. **Achado do teste:** o banco devolve os campos em outra ordem e, sem cuidado, "salvar igual" pareceria mudança — a comparação ignora a ordem (testado também nos apontamentos). **Nenhum dado real foi alterado.**

**Fica para as próximas etapas:** avisos aos responsáveis e copiados a cada mudança (G5 — hoje nada avisa ninguém); relatório semanal (inclusive as peças que não voltaram e os atendimentos parados) e encerramento (G6).

## Decisão do usuário em 20/10/2026 (G5)

- **Onde o aviso chega:** na caixa de **Menções (o sino)**, levando direto à ficha do atendimento; vai ao **responsável e aos copiados**, e **quem fez a ação não se avisa**.
- **Sempre avisam:** abertura, cancelamento, reabertura, **pedido de autorização** (e aí a **direção toda**, isto é, todos os Admin ativos) e a **decisão da direção**.
- **Também avisam (o usuário marcou todas as categorias opcionais):** avaliação, fornecedor, quem executa e peça pedida ao Compras; alinhamento com o cliente e quadro de custos; **cada movimento** de peça em garantia (cadastro, envio, retorno, desfazer, tirar); apontamentos do diário técnico.

## Como ficou a G5 (20/10/2026)

**Sem mudança no banco:** o aviso é uma linha na tabela de menções que já existia (`contexto = 'garantia'`, `contexto_id` = a ficha, aba de destino SAC); nenhuma migração.

**A regra é uma só (`GarantiaAvisos.ts`, regra pura):** **cada evento novo do histórico da ficha gera aviso.** Como todas as categorias opcionais foram marcadas, não há chave para ligar e desligar por categoria; se um dia a gerência quiser silenciar uma categoria, é um filtro por tipo de evento nessa função.
- Quem recebe: o **responsável e os copiados** da ficha, sem repetir, **menos quem gravou**. O **pedido de autorização** também vai a **todo Admin ativo** (com a frase "Pedido de autorização à direção: …"). A **decisão da direção** vai também a **quem fez o pedido**, mesmo que ele não seja responsável nem copiado (a pessoa é achada pelo nome gravado no pedido).
- **Edição das partes:** quem **entrou** na ficha recebe "Você passou a participar deste atendimento"; quem **saiu** recebe "Você saiu deste atendimento"; os que ficam recebem a frase de sempre ("Dados alterados: copiados").
- **Quando sai:** logo depois de cada gravação que deu certo (`gravarGarantia`) e depois da abertura (a ficha é relida do banco, para o aviso sair com o número e o histórico reais). **Falha de aviso não desfaz a gravação:** a tela diz "Gravado, mas não foi possível avisar: fulano (motivo)" em vermelho e parada.
- **O link do aviso:** o sino (`MencoesInboxPanel`) ganhou o selo **Garantia** e **não oferece "Responder"** nesses avisos (a conversa é na ficha). Clicar em "SAC →" abre a aba **Garantia** do SAC **e a ficha**, esteja o SAC fechado ou já aberto em outra aba (`window.__acnDeepLink`, o mesmo padrão de Compras e Engenharia). O link **só abre ficha que a pessoa pode ver**.
- **Copiado sem a aba SAC liberada:** recebe o aviso do mesmo jeito (ele pode ser de outro setor, como a Engenharia). Para essa pessoa o SAC abre **só com a Garantia**: as abas de ordens de serviço, chamados e cadastros continuam fechadas, como estão para ela no menu (`SacTab.tsx`, `semAcessoAoSac`, mesma regra do menu).
- **Quem abriu a ficha** só é avisado se for o responsável ou um copiado (a decisão foi "responsável e copiados"); como a janela de abertura já põe quem abre como responsável, o caso comum fica coberto. Se o autor indicar outra pessoa como responsável e não se copiar, ele deixa de receber os avisos.

**Testado:** **30 verificações da regra de avisos** (quem recebe e o texto, em cada tipo de evento, com direção, quem pediu, quem entrou e quem saiu, sem lista de usuários e sem evento novo), as **127 das regras da ficha** e as **214 do Desenvolvimento** sem mudança, e **133 no navegador** (as 106 anteriores e 27 novas; banco da garantia, lista de usuários e caixa de menções simulados em memória, nenhuma gravação real): o fluxo inteiro de autorização gera os avisos certos (direção toda duas vezes, decisão a quem pediu, Admin inativo e autor sem aviso); cancelar, reabrir e editar avisam o copiado; com a caixa de menções fora do ar a gravação vale e a tela diz quem ficou sem aviso; o sino mostra o aviso com o número e o cliente, sem caixa de resposta; o link abre a ficha com o SAC fechado e com o SAC aberto em outra aba; quem não tem a aba SAC vê só a Garantia; link para ficha de outra pessoa não abre nada. **Nenhum dado real foi alterado.**

**Fica para a próxima etapa:** relatório semanal (inclusive as peças que não voltaram e os atendimentos parados) e **encerramento** (a situação "encerrado" já existe no banco, mas nenhuma tela encerra). Continua em aberto o **prazo para cobrar atendimento parado** (G6).

## Decisões do usuário em 20/10/2026 (G6)

1. **Prazo para cobrar atendimento parado: 5 dias** sem nenhum movimento na ficha (o mesmo prazo vale para a peça que não voltou). Era a última decisão em aberto da lista com os setores.
2. **Quem encerra:** o **responsável pelo atendimento** e a **gerência** (a mesma regra das etapas anteriores).
3. **O que impede de encerrar** (o usuário marcou as quatro): peça em garantia que ainda não voltou; pedido de autorização esperando a direção; falta de apontamento com a solução adotada; falta da avaliação técnica. Sempre com um **texto de fechamento**.
4. **Onde fica o relatório e quem o vê:** dentro da aba **Garantia** do SAC (botão "Relatório semanal"), para a **gerência e o Admin**, com **todos** os atendimentos — não só os que a pessoa vê na lista. (Por isso o plano original, "Relatórios › Garantia", não foi usado: a tela de Relatórios ainda não foi migrada para o visual novo.)

## Como ficou a G6 (20/10/2026)

**Banco (migração `garantia_g6_encerramento`):** uma coluna nova na ficha, `encerramento` (jsonb: texto, quem, quando), vazia nas fichas existentes. A situação "encerrado" já existia.

**Encerrar (no detalhe, ao lado de Editar e Cancelar; regras em `GarantiaModelo.ts`):**
- O botão **"Encerrar atendimento"** é do responsável e da gerência e fica **desligado enquanto algo impede**; ao lado, a tela diz em português o que falta ("Para encerrar falta: registrar a avaliação técnica; dar fim a 1 peça em garantia que ainda não voltou…"). Liberado, pede o **texto de fechamento** e uma confirmação.
- Encerrado, a ficha mostra a faixa verde com quem encerrou, quando e o texto, e **deixa de receber registros** (mesma regra do cancelado). O encerramento **avisa** o responsável e os copiados (G5).
- **Reabrir** vale para o cancelado (quem abriu, responsável e gerência, como antes) e agora também para o **encerrado**, só para o **responsável e a gerência** (a mesma regra de quem encerra); limpa o encerramento e o histórico guarda "encerrado" e "reaberto".
- **Atendimento parado:** aberto e sem movimento há **5 dias ou mais** ganha o selo **"Parado há N d"** na lista e uma faixa de aviso no detalhe com o último movimento. Qualquer registro novo zera a conta.

**Relatório semanal (`GarantiaRelatorio.ts` a conta, `GarantiaRelatorioTela.tsx` a tela, `GarantiaRelatorioPdf.ts` o PDF em A4 paisagem, no desenho do documento de comissões):**
- **Semana de segunda a domingo**, com "Semana anterior", "Semana seguinte", "Esta semana" e um campo para escolher um dia. **Nove indicadores:** abertos, encerrados e cancelados na semana; em aberto hoje; parados; peças que não voltaram; esperando a direção; horas apontadas na semana; custo considerado dos movimentados.
- **Seções:** atendimentos **movimentados na semana** (situação, etapa, custo considerado, quanto a empresa paga e horas, com total no rodapé), **encerrados** (com o texto de fechamento), **parados** (com os dias), **peças que não voltaram** (peça, quantidade, situação, rastreio e dias parada), **esperando a direção** (valor, quem pediu e há quantos dias) e **horas por técnico**. Seção sem nada diz "Nenhum…" em vez de tabela vazia.
- **O que é da semana e o que é de hoje:** abertos, encerrados, cancelados, movimentados e horas contam os dias da semana escolhida; em aberto, parados, peças pendentes e pedidos esperando a direção são sempre a **situação de hoje** (a ficha só guarda o último estado, não dá para reconstruir o que estava parado numa semana passada) — o relatório diz isso no cabeçalho. Atendimento cancelado fica fora da soma de custos e de horas.
- A tela e o PDF saem do **mesmo modelo**: o que uma soma, o outro soma.

**Testado:** **49 verificações das regras novas** (o que impede de encerrar, encerrar e reabrir com as permissões, atendimento parado, as contas da semana e do relatório, e o **PDF gerado de verdade**, com e sem dados), as **127 das regras da ficha**, as **30 dos avisos** e as **214 do Desenvolvimento** sem mudança, e **165 no navegador** (as 133 anteriores e 32 novas; banco da garantia, usuários e menções simulados em memória, nenhuma gravação real): selo e faixa de parado, o botão de encerrar desligado com o que falta (avaliação, peça que não voltou), encerrar com texto vazio recusado, encerrar de verdade com o aviso ao copiado, reabrir, o copiado sem botão de reabrir nem encerrar, o botão do relatório só para a gerência e o Admin (inclusive o gerente que nem vê as fichas), a semana certa, os indicadores e seções com os números esperados, navegar de semana e **o PDF baixado de fato pelo navegador**. **Nenhum dado real foi alterado** (o banco da garantia continua sem nenhum atendimento).

**Pontas que ficam fora do plano:** a **ligação real da Garantia com o Desenvolvimento** (o campo "Para a Garantia" do pacote técnico continua só uma anotação, ver `PLANO_DESENVOLVIMENTO_ENGENHARIA.md`) e o **fechamento do banco por perfil** (Etapa 17: hoje a visibilidade da Garantia vale na tela e o banco ainda não filtra por pessoa).

## Regras de segurança que valem em todas as etapas

- Tabelas novas com política de RLS permissiva (exigência do banco) e migração por `apply_migration`, com o porquê no comentário.
- Nada de apagar atendimento: encerra, cancela com motivo ou reabre.
- Teste só com a gravação bloqueada ou com registros `ZZTESTE` apagados depois, com a contagem conferida.
