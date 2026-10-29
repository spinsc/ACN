---
name: envio-parcial
description: Envio parcial com kit incompleto e complemento (OP A1562.2610, Venda para Envio, 73 kits em levas 25/25/23). Use quando o usuário pedir para iniciar ou continuar o envio parcial por itens, ou digitar /envio-parcial.
---

# Envio parcial com kit incompleto — iniciar e continuar

O estado **não está na sua memória**: está em `PLANO_ENVIO_PARCIAL_ITENS.md`, na raiz do projeto (decisões do usuário de 29/10/2026 e as etapas E1, E2 e E3).

## Como conduzir
1. **Leia `PLANO_ENVIO_PARCIAL_ITENS.md`** e `src/Remessas.ts` (remessas por unidade, que já existem) e a janela "EMBALAR" do `AlmoxarifadoTab.tsx` (onde a remessa é gravada).
2. **O usuário disse que ainda não tem toda a informação** e que a configuração se faz nesta conversa. **Comece perguntando, com janela clicável, o que falta:** quais itens ficaram faltando nos 25 kits que já saíram e em que quantidade por kit; se as levas seguintes (25 e 23) vão completas ou também com falta; se o complemento sai com rastreio e nota próprios.
3. **Uma etapa por vez** (E1, depois E2, depois E3); cada uma funciona sozinha e vai para produção sozinha.
4. A OP A1562.2610 estava "Em Espera PCP", sem BOM e sem remessa. Os 25 kits já enviados são registrados **depois de o PCP liberar**, pela tela do Almoxarifado, com data real (retroativa). Não grave nada na OP sem pedido do usuário.
5. Regras do projeto valem: `npx vite build` antes de commitar; testes com gravação bloqueada; atualizar o plano no mesmo commit; push só com a pergunta clicável de autorização; tabela nova com RLS e a política `etapa17_logado`.
