---
name: garantia
description: Construir o módulo de atendimento em garantia da ACN (G1 a G6 do PLANO_GARANTIA.md): ficha do atendimento, avaliação técnica, fornecedor, custos, autorização da direção, peças em garantia, partes/avisos e relatório semanal. Use quando o usuário pedir para iniciar ou continuar a garantia, ou digitar /garantia.
---

# Atendimento em garantia — iniciar e continuar

O estado **não está na sua memória** — está em `PLANO_GARANTIA.md`, na raiz do projeto (desenho aprovado e as etapas G1 a G6). Ele é a fonte da verdade, igual aos planos
`PLANO_ESTOQUE_AUTOMATICO.md` e `PLANO_UX_FLUXO_TRABALHO.md`.

## Como conduzir

1. **Leia `PLANO_GARANTIA.md` inteiro** e o final de `PLANO_UX_FLUXO_TRABALHO.md` (para saber o que já foi entregue e o visual a seguir).
2. **Confira as decisões que dependem dos setores** (lista "O que precisa ser decidido com os setores"): responsáveis por etapa, critério de autorização da direção, quem é a "direção" no
   sistema, campos obrigatórios finais e prazo para cobrar atendimento parado. A mensagem original pede ao Luciano que coordene isso. **Se algo estiver em aberto, pergunte ao usuário
   com perguntas clicáveis ANTES de construir a etapa que depende disso**; a G1 só precisa da lista de campos obrigatórios e de quem é copiado por padrão.
3. **Uma etapa por vez** (G1, depois G2…). Cada uma funciona sozinha e vai para produção sozinha. Não adiante a seguinte.
4. **Telas e janelas novas nascem no visual novo** (`Interface.tsx`, `Feedback.tsx`); sem `style` inline de cor, sem `<button>` cru. Reaproveite o que já existe: catálogo de veículos
   (`SelectVeiculo`), participantes e avisos (`Participantes.tsx`, menções), anexos com descrição (`DemandaExtras.tsx`), pedido de compra (`criarRequisicaoCompra`), PDF
   (`ComissaoDocumento.ts` como modelo), permissões (`utils/permissoes.ts`).
5. **Banco:** tabela nova com política de RLS permissiva (o gatilho `ensure_rls` recusa sem ela); migração por `apply_migration` com o porquê no comentário; nunca apagar
   atendimento (encerra, cancela com motivo ou reabre).
6. **Teste** com a gravação bloqueada (padrão do projeto) ou com registros `ZZTESTE` apagados depois, com a contagem conferida. `npx vite build` antes de commitar.
7. **Atualize `PLANO_GARANTIA.md` no mesmo commit** (etapa ✅, o que foi feito, números reais, o que ficou de fora). Etapa sem o plano atualizado não está concluída.
8. **Publicar:** `git push` só com a autorização do usuário (a regra do projeto), salvo se ele tiver autorizado o push contínuo para a sessão. Depois do push, acompanhar o deploy até o sucesso.
