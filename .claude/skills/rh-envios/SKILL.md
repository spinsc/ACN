---
name: rh-envios
description: Continuar as demandas avulsas de 14/10/2026 (PLANO_RH_DEPARTAMENTOS_ENVIOS.md) — departamentos fixos e vários por pessoa no RH, responsáveis por setor em todas as telas, quadro de colaboradores completo (planilha) com sexo e relatório de uniformes, e envios parciais em "Venda para envio".
---

# RH (departamentos e quadro de colaboradores) e envios parciais — iniciar e continuar

O estado **não está na sua memória** — está em `PLANO_RH_DEPARTAMENTOS_ENVIOS.md`, na raiz do projeto. Ele é a fonte da verdade (igual aos outros planos).

## Como conduzir

1. **Leia `PLANO_RH_DEPARTAMENTOS_ENVIOS.md` inteiro**: o pedido do usuário, as respostas dele, o que foi medido no banco e na planilha, as fatias (1 a 5) e as suposições em aberto.
2. **Uma fatia por vez**, na ordem do plano. Cada uma funciona sozinha e vai para produção sozinha. Não adiante a seguinte.
3. **Dado real** (a migração dos 46 cadastros do RH, a importação da planilha, o sexo): só o que o plano autoriza, com **medida nova, cópia de segurança (tabela de cópia ou JSON em `scratchpad`) e contagem**, e **mostrando ao usuário a tabela de conferência antes de gravar** quando o plano diz isso (departamentos dos sem departamento, sexo por primeiro nome, quadro "tela → departamento"). **Nunca renomear pessoa** (o nome do RH é texto de responsável em OPs, tarefas e demandas). **Nunca apagar** cadastro.
4. **Telas e janelas novas nascem no visual novo** (`Interface.tsx`, `Feedback.tsx`; sem `style` inline de cor, sem `<button>` cru). Antes de criar, procure o que já existe (`ColaboradorSelect.tsx`, `utils/permissoes.ts` — `ehAdminOuGerente`, `perfilComPoderes`).
5. **Banco:** migração por `apply_migration` com o porquê no comentário; tabela nova com política de RLS permissiva; a lista "Departamentos (Compras)" do Admin é **outra coisa** e não se mexe.
6. **Teste** no padrão do projeto (gravação bloqueada, leituras simuladas, relógio parado, toque ligado no celular) ou com registros `ZZTESTE` apagados depois, com a contagem conferida; `npx vite build` antes de commitar; defeito plantado nas regras novas.
7. **Atualize o plano no mesmo commit** (fatia ✅, o que foi feito, números reais, o que ficou de fora, as suposições a confirmar).
8. **Publicar:** `git push` **só com a autorização do usuário** (pergunta clicável dedicada ao fim de cada fatia), salvo se ele autorizar o push contínuo. Depois do push, acompanhar o deploy até o sucesso.
9. **Dúvida de regra de negócio:** pergunte antes de construir (principalmente a fatia 5, que pede desenho com o usuário). **Nota de atualização do sistema:** uma por dia trabalhado, mostrada ao usuário antes de publicar.
