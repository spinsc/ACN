# Envio parcial com kit incompleto e complemento (pedido do usuário em 29/10/2026)

**O caso (OP A1562.2610, "Venda para Envio", 73 kits, pelo correio):** o cliente recebe em levas (25 / 25 / 23). Os primeiros 25 kits já saíram, **sem alguns itens**, que seguem depois.
Hoje o sistema só sabe enviar **unidades completas** em remessas (`op_remessas`, `Remessas.ts`, janela "EMBALAR" do Almoxarifado): a remessa diz quantas unidades saíram, nunca o que ficou faltando em cada kit.

## Decisões do usuário (29/10/2026)
1. **Remessa com itens faltando + complemento depois.** A remessa registra os kits que saíram e **quais itens (e quantas unidades de cada) ficaram faltando**. Depois se registra o **complemento**: os itens que saíram em separado, com data e rastreio. A OP só fecha o envio com kits e itens completos.
2. **Os 25 já enviados:** registro **retroativo** pela tela do Almoxarifado, depois de o PCP montar a BOM e liberar (a OP está em "Em Espera PCP", sem BOM, sem remessa). O sistema passa a aceitar **data de envio passada** e **itens faltando**.

## Etapas (uma por vez; cada uma funciona sozinha)
- **E1 — Remessa com data real, rastreio e itens faltando.** Colunas novas em `op_remessas`: `data_envio` (date, padrão hoje; aceita passada, não futura), `rastreio`, `faltando` (jsonb: `[{ item_id, nome, unidades }]`). Janela de embalagem ganha os três campos; a lista de remessas da OP mostra "faltam: …".
- **E2 — Complemento.** Tabela `op_remessa_complementos` (`remessa_id`, `opl_id`, `itens`, `data_envio`, `rastreio`, `nf_numero`, `observacoes`, quem/quando; política `etapa17_logado`). Botão "Registrar complemento" na remessa com itens pendentes; o pendente da remessa = `faltando` − complementos. Nunca apaga: complemento errado é cancelado com motivo.
- **E3 — A OP só sai da fila com tudo completo.** Última remessa com item pendente **não** leva a OP para a cotação de frete / liberação comercial: a OP fica na fila do Almoxarifado com selo "Falta enviar: …" até o último complemento. Aviso para quem acompanha quando passar de N dias com pendência.

## Fora desta rodada
Nota fiscal por remessa/complemento (a coluna `nf_numero` já existe na remessa); frete do complemento (hoje, um pedido de frete por remessa); qualquer mudança na comissão (continua só com a OP inteira faturada).
