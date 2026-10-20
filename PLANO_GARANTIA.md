# Atendimento em garantia — desenho e etapas

> Proposta de **08/10/2026**, a pedido do usuário ("Lista pedido Bruna": procedimento de atendimento em garantia).
> **G1, G2 e G3 construídas em 19/10/2026 e a G4 em 20/10/2026** (ver "Como ficou a G1" a "G4" no fim); **G5 e G6 ainda não começaram.** Este arquivo é o desenho; cada etapa só começa depois do OK e vai para
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
| **G5** | **Partes e avisos**: responsáveis e copiados por atendimento, avisos automáticos a cada mudança. | 11 |
| **G6** | **Relatório semanal** (tela + PDF) e encerramento do atendimento. | 10 |

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

## Regras de segurança que valem em todas as etapas

- Tabelas novas com política de RLS permissiva (exigência do banco) e migração por `apply_migration`, com o porquê no comentário.
- Nada de apagar atendimento: encerra, cancela com motivo ou reabre.
- Teste só com a gravação bloqueada ou com registros `ZZTESTE` apagados depois, com a contagem conferida.
