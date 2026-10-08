# Atendimento em garantia — desenho e etapas

> Proposta de **08/10/2026**, a pedido do usuário ("Lista pedido Bruna": procedimento de atendimento em garantia).
> **Nada foi construído ainda.** Este arquivo é o desenho para aprovação; cada etapa só começa depois do OK e vai para
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
| **G1** | **Ficha e abertura**: tabela do atendimento, formulário com campos obrigatórios, lista/quadro dentro do SAC (aba "Garantia"), histórico de movimentação e permissões. | 1, 12 |
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

## Regras de segurança que valem em todas as etapas

- Tabelas novas com política de RLS permissiva (exigência do banco) e migração por `apply_migration`, com o porquê no comentário.
- Nada de apagar atendimento: encerra, cancela com motivo ou reabre.
- Teste só com a gravação bloqueada ou com registros `ZZTESTE` apagados depois, com a contagem conferida.
