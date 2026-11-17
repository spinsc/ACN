// Nome do pedido de compra (pedido do usuário em 16/11/2026): o pedido é identificado pelo número (PC-00123) e pelo título; os itens pedidos NÃO entram no nome
// (eles continuam dentro do pedido, na lista de itens). Decisão do usuário: "não precisa mostrar os itens no nome da demanda, o restante mantém igual".
// Até então a descrição gravada era "título + motivo + uma linha 'N× item' por item"; os pedidos antigos continuam assim no banco (nada foi regravado), então a tela tira
// as linhas de item na hora de mostrar. Se a descrição for SÓ a lista de itens (pedido antigo digitado à mão), mostra o texto como está: nome vazio seria pior.
const LINHA_DE_ITEM = /^\s*\d+(?:[.,]\d+)?\s*[×x]\s+/;

/** Monta a linha de item que o pedido já guardou na descrição ("2× parafuso (inox)"). */
export const linhaDeItem = (i: any): string => `${i?.quantidade || 1}× ${i?.nome}${i?.descricao ? ` (${i.descricao})` : ''}`;

/** A descrição do pedido sem as linhas dos itens. */
export function nomeDoPedido(textoOuPedido: any): string {
  const bruta = String(typeof textoOuPedido === 'string' ? textoOuPedido : textoOuPedido?.descricao_material || '');
  const sem = bruta.split('\n').filter(l => !LINHA_DE_ITEM.test(l)).join('\n').trim();
  return sem || bruta.trim();
}
