# Plano — Desenvolvimento de produto na Engenharia

> Pedido do usuário em 19/10/2026: "todas as etapas do desenvolvimento são iguais e têm as mesmas features; os processos
> estão certos, mas precisava ser algo mais concreto para um desenvolvimento de engenharia". Retomado pelo próprio
> `PLANO_DESENVOLVIMENTO_ENGENHARIA.md`: abrir este arquivo e seguir a próxima etapa não feita (quadro no fim).
>
> **Tela:** Engenharia > Desenvolvimento (`src/DesenvolvimentoPecasTab.tsx`). O pedido do PCP
> (`PedidoDesenvolvimentoPcp.tsx`, itens em `engenharia_desenvolvimento_itens`) **não muda**: ele tem o andamento dos itens
> e nunca teve as 8 etapas.

---

## 1. Como a tela é hoje (medido em 19/10/2026, só leitura)

- 4 demandas, todas manuais; nenhuma passou da 3ª etapa (Desenvolvimento); só 2 observações no total; uma demanda tem 13 anexos
  soltos. O conteúdo real do trabalho está em anexos sem nome de entregável.
- As 8 etapas (`Concepção, Criação, Desenvolvimento, Prototipagem, Validação, Produção, Acabamento, Entrega`) usam o mesmo painel:
  responsável + data prevista + iniciar, observação, concluir. Não há entregável, critério para passar, revisão do projeto,
  teste, custo, nem ligação com catálogo, lista de materiais ou estrutura de instalação.
- A tela ainda está no estilo antigo (51 `style` soltos): **pela regra de dia/noite, a fatia dela no `/ux-fluxo` (achados 7.x +
  migração) vem antes de qualquer função nova.** Não é um dos quatro arquivos grandes, então não precisa perguntar.

## 2. O que a pesquisa trouxe (e o que dela vira regra aqui)

| Fonte | Ideia | Vira |
|---|---|---|
| Stage-Gate (Cooper) | Cada etapa acaba numa **porta** com critérios; quem decide escolhe seguir, segurar, voltar ou matar. Rigor proporcional ao tamanho do projeto. | Porta de decisão por etapa; **tipo de desenvolvimento** muda o que é obrigatório |
| APQP / PPAP (AIAG, automotivo) | Plano → projeto do produto → projeto do processo → validação → lançamento. Pede análise de risco (FMEA), revisão de projeto, protótipo com plano de verificação, lote piloto. | Lista de riscos, revisão de projeto, registro de protótipos, primeira unidade conferida |
| PLM (Arena, Fusion Manage, Odoo PLM, Acumatica) | Revisões numeradas do projeto e da lista de materiais; depois de liberado, mudar exige **pedido de mudança** (motivo, impacto, aprovação) e fica histórico de quem mudou o quê. | Revisões do desenho (Rev A, B…); pedido de mudança após a liberação |
| Modelo em V | Cada requisito do início tem um teste no fim; validar é provar que serve ao pedido. | Requisitos na Concepção; plano de testes ligado a eles na Validação |
| Norma de trânsito (Resolução CONTRAN 970/2022, sinalização e iluminação) | Produto de sinalização tem exigência legal. **Não afirmar exigência de ensaio/homologação sem confirmar com o usuário.** | Campo "normas aplicáveis" na Concepção e uma linha de conferência na Validação, preenchidos por quem sabe |

## 3. Decisões do usuário (19/10/2026)

1. **Primeira entrega inclui tudo:** entregáveis por etapa + porta; tipo de desenvolvimento; revisões do projeto e custo meta × estimado;
   protótipos, testes e ligação com catálogo/estrutura/Garantia. A construção é **em fatias** (quadro abaixo), cada uma com
   build, teste no navegador com gravações bloqueadas e commit.
2. **Quem decide nas portas:** **solicitante + gerente da Engenharia**; na Validação, a **Qualidade** também dá parecer.
3. Escrever este plano na raiz (feito).

Pontos a fechar com o usuário **na hora de construir a fatia** (perguntar, não supor): quem é "gerente da Engenharia" nas permissões
(`utils/permissoes.ts`), e quem é o "solicitante" quando a demanda é manual sem setor.

## 4. O que cada etapa passa a ter

Todas continuam com responsável, data prevista, início/conclusão e observações. O novo é o miolo de cada uma:

| Etapa | Entregáveis (obrigatório = precisa estar feito para passar) | Porta |
|---|---|---|
| **1 Concepção** | Briefing (problema, quem pediu, OP/veículo) *obrig.*; **requisitos** com prioridade (obrigatório/desejável) *obrig.*; normas aplicáveis; meta de custo e prazo *obrig.*; similares pesquisados | Solicitante + gerente aprovam o briefing |
| **2 Criação** | 2 ou 3 conceitos com prós e contras e **matriz de escolha** (pesos e notas); croqui/render; conceito escolhido *obrig.* | Conceito aprovado |
| **3 Desenvolvimento** | Desenhos com **revisão** *obrig.*; lista de materiais preliminar com **custo estimado × meta** *obrig.*; **lista de riscos** (o que pode falhar, gravidade, ação); **revisão de projeto** registrada (quem participou: Produção, Compras, Qualidade) | Projeto liberado para protótipo |
| **4 Prototipagem** | **Registro de protótipos** (nº, revisão do desenho usada, o que foi feito, material e horas reais, fotos) *obrig.*; **problemas achados** com ação e a revisão que gerou | Protótipo pronto para teste |
| **5 Validação** | **Plano de testes** ligado aos requisitos (requisito → teste → critério → resultado → evidência) *obrig.*; teste de instalação em veículo; conferência das normas; parecer da Qualidade *obrig.* | Aprovado / aprovado com ressalva / **volta ao Desenvolvimento** (nova revisão) |
| **6 Produção** | **Liberação:** item no catálogo e estrutura de instalação criados ou vinculados *obrig.*; instrução de montagem; primeira unidade conferida *obrig.*; custo real × meta e preço pela formação de preços | Primeira unidade conforme |
| **7 Acabamento** | Padrão de acabamento, identificação, embalagem e manual; amostra aprovada *obrig.* | Amostra aprovada |
| **8 Entrega** | Pacote técnico final (desenho, lista de materiais, manual) *obrig.*; aceite do solicitante *obrig.*; lições aprendidas; ligação com a Garantia | Aceite registrado |

**Porta (igual em todas):** decisão = *seguir*, *seguir com ressalva* (a ressalva vira pendência com responsável), *voltar etapa*,
*pausar* ou *cancelar*; registra quem, quando e o motivo. A etapa só aceita "seguir" com os entregáveis obrigatórios feitos e as
aprovações exigidas dadas. "Voltar etapa" reabre a anterior sem apagar nada.

**Tipo de desenvolvimento** (escolhido ao criar a demanda; pode mudar enquanto a Concepção não foi aprovada):

| Tipo | O que exige |
|---|---|
| Produto novo | Tudo da tabela acima |
| Adaptação de produto existente | Sem matriz de conceitos; plano de testes só do que mudou |
| Melhoria / correção | Sem conceitos e sem lista de riscos; revisão do desenho e teste do ponto alterado |
| Peça avulsa (sob encomenda) | Briefing, desenho com revisão, primeira unidade conferida, aceite |

**Depois da liberação (etapa 6):** qualquer mudança no projeto é um **pedido de mudança** curto (motivo, o que muda, impacto em custo e
nas OPs abertas, aprovação solicitante + gerente) que gera a próxima revisão do desenho. Nada de editar a revisão liberada.

**Custo:** meta (Concepção) × estimado (lista de materiais preliminar) × real (primeira unidade). Alerta quando o estimado passa da meta.

## 5. Modelo de dados proposto (a confirmar na fatia D1)

- Mantém `engenharia_desenvolvimento.etapas` (jsonb) e **estende cada etapa** com `entregaveis: [{id, nome, obrigatorio, feito, feito_por, feito_em, anexos[], observacao}]` e
  `porta: {decisao, por, em, motivo, aprovacoes:[{papel, por, em, decisao}]}`. As 4 demandas de hoje **não são alteradas**: ao abrir, a tela
  completa os entregáveis **na memória** a partir do tipo e só grava quando alguém edita.
- Colunas novas em `engenharia_desenvolvimento`: `tipo_desenvolvimento`, `requisitos` jsonb, `meta_custo`, `custo_estimado`, `custo_real`,
  `revisoes` jsonb (lista Rev A, B…, com motivo, quem, quando, anexo), `riscos` jsonb, `item_id` (catálogo).
- Tabelas novas (filhas, com policy permissiva de RLS): `engenharia_desenvolvimento_prototipos` e `engenharia_desenvolvimento_testes`
  (cada teste aponta o requisito) e `engenharia_desenvolvimento_mudancas`. Decidir na D1 entre tabela e jsonb conforme o volume esperado.
- Toda gravação confere a resposta do banco, e leitura recusada nunca parece "vazio" (padrão já adotado nas outras telas).
- Linha do tempo de cada demanda alimentada pelo `AuditSystem.tsx` (módulo `desenvolvimento`).

## 6. Etapas de execução

| Etapa | O que faz | Estado |
|---|---|---|
| **D0** | Fatia do `/ux-fluxo` da aba: achados 7.x e migração para `Interface.tsx`/`Feedback.tsx`/classes/`Botao`, sem mudar o comportamento | não feita |
| **D1** | Base: tipo de desenvolvimento, entregáveis por etapa (lista própria de cada etapa, anexo por entregável), porta com aprovação solicitante + gerente, registro no histórico | não feita |
| **D2** | Concepção e Criação: requisitos com prioridade, meta de custo, normas, matriz de escolha de conceitos | não feita |
| **D3** | Desenvolvimento: revisões do desenho (Rev A, B…), lista de materiais preliminar, custo estimado × meta, lista de riscos, revisão de projeto | não feita |
| **D4** | Prototipagem e Validação: registro de protótipos, problemas com ação, plano de testes ligado aos requisitos, parecer da Qualidade, "volta ao Desenvolvimento" | não feita |
| **D5** | Produção, Acabamento e Entrega: liberação com item no catálogo e estrutura de instalação, primeira unidade, custo real, pedido de mudança, pacote técnico, aceite, ligação com a Garantia | não feita |
| **D6** | Painel: atrasadas, esperando aprovação, etapa parada há dias, custo estimado × meta; filtros novos | não feita |

Regras de cada fatia: `npx vite build` antes de commitar; teste no navegador com gravações bloqueadas (padrão `scratchpad/fstest/`);
nenhum dado real alterado; relatar números reais; push só com a pergunta clicável de autorização.

## 7. Fora do escopo desta rodada

- Pedido do PCP e seus itens (continuam como estão).
- Gerar documento de homologação ou afirmar exigência legal: só o campo para registrar o que o setor definir.
- Modelagem 3D/CAD dentro do sistema (continua anexo).
- Integração com programas externos de PLM.

## 8. Fontes consultadas (19/10/2026)

- Stage-Gate (Robert G. Cooper) e APQP/PPAP (AIAG, 3ª edição de 2024), pelas descrições públicas.
- [Odoo — Engineering change orders](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)
- [Autodesk — Engineering change management process](https://www.autodesk.com/blogs/design-and-manufacturing/engineering-change-management-process/)
- [Acumatica — Engineering Change Control](https://cdn.acumatica.com/media/2020/05/Acumatica_Manufacturing_Engineering_Change_Control_Datasheet_220316.pdf)
- [Resolução CONTRAN 970/2022](https://www.legisweb.com.br/legislacao/?id=433065) (apenas para saber que existe norma; conteúdo a confirmar com o setor)
