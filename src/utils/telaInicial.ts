// Tela inicial de quem clica no logo do cabeçalho (e em que o sistema abre).
// Regra definida com o usuário em 02/10/2026: o logo leva ao Dashboard; se a pessoa não
// tiver acesso ao Dashboard, leva à primeira tela liberada para ela no menu (na mesma
// ordem em que o menu mostra). Hoje o Dashboard é liberado a todos, então o desvio fica
// guardado para o dia em que ele puder ser restringido.
// 09/11/2026 (pedido do RH, decidido com o usuário): a tela de abertura passou a ser o Início (carrossel de
// comunicados, tempo, aniversariantes); o Dashboard geral continua no menu. O Início é liberado a todos,
// como o Dashboard, e o mesmo desvio vale se um dia ele puder ser restrito.
export function telaInicialDoUsuario(
  grupos: { items: { id: string }[] }[],
  podeVer: (id: string) => boolean,
): string {
  if (podeVer('inicio')) return 'inicio';
  if (podeVer('dashboard')) return 'dashboard';
  for (const grupo of grupos) {
    const item = grupo.items.find(i => podeVer(i.id));
    if (item) return item.id;
  }
  // ninguém liberado (não deveria acontecer): fica no Início, que sempre existe
  return 'inicio';
}
