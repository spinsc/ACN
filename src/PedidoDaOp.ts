// Quanto o pedido "falta para a OP" deve pedir de um item.
//
// Regra de 05/11/2026 (pedido do usuário, chicotes 64, 114 e 41 da OP A1749.2611): a falta que o estoque enxerga é a do item INTEIRO — as reservas de todas
// as OPs que ainda não baixaram o material, mais saldo atrasado — e a OP que acabava de ser liberada pedia 22, 32 e 36 chicotes para precisar de 1. O setor
// tinha de fabricar tudo isso para a OP andar. O pedido da OP é só o que ela leva: o resto da falta é das outras OPs (cada uma pede o seu ao ser liberada)
// e da reposição da prateleira, que sai à parte.

/** `faltaTotal`: o que falta no estoque todo; `jaPedido`: o que outras OPs já pediram e está em aberto; `necessidadeDaOp`: quanto ESTA OP leva do item
 *  (vazio ou zero = não se sabe, vale a conta de antes). Devolve 0 quando nada precisa ser pedido. */
export function quantidadeDoPedidoDaOp({ faltaTotal, jaPedido, necessidadeDaOp }: { faltaTotal: number; jaPedido: number; necessidadeDaOp?: number | null }): number {
  const falta = Math.max(0, Math.ceil(Number(faltaTotal) || 0) - (Number(jaPedido) || 0));
  if (falta <= 0) return 0;
  const daOp = Number(necessidadeDaOp) || 0;
  return daOp > 0 ? Math.min(falta, Math.ceil(daOp)) : falta;
}
