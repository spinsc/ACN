# Atendimento em garantia — desenho e etapas

> Proposta de **08/10/2026**, a pedido do usuário ("Lista pedido Bruna": procedimento de atendimento em garantia).
> **G1 construída em 19/10/2026** (ver "Como ficou a G1" no fim); **G2 a G6 ainda não começaram.** Este arquivo é o desenho; cada etapa só começa depois do OK e vai para
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
| **G2** | **Avaliação e fornecedor**: parecer técnico, cobertura, consulta ao fornecedor, quem executa; trava do pedido de peça no Compras. | 2, 3, 5 |
| **G3** | **Custos, cliente e direção**: quadro de custos, alinhamento com o cliente, autorização da direção. | 4, 6, 7 |
| **G4** | **Peças e apontamentos**: controle de envio/retorno de peças; falhas, horas, técnicos e solução. | 8, 9 |
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

## Regras de segurança que valem em todas as etapas

- Tabelas novas com política de RLS permissiva (exigência do banco) e migração por `apply_migration`, com o porquê no comentário.
- Nada de apagar atendimento: encerra, cancela com motivo ou reabre.
- Teste só com a gravação bloqueada ou com registros `ZZTESTE` apagados depois, com a contagem conferida.
