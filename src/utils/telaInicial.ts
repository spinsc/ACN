// Tela inicial de quem clica no logo do cabeçalho.
// Regra definida com o usuário em 02/10/2026: o logo leva ao Dashboard; se a pessoa não
// tiver acesso ao Dashboard, leva à primeira tela liberada para ela no menu (na mesma
// ordem em que o menu mostra). Hoje o Dashboard é liberado a todos, então o desvio fica
// guardado para o dia em que ele puder ser restringido.
export function telaInicialDoUsuario(
  grupos: { items: { id: string }[] }[],
  podeVer: (id: string) => boolean,
): string {
  if (podeVer('dashboard')) return 'dashboard';
  for (const grupo of grupos) {
    const item = grupo.items.find(i => podeVer(i.id));
    if (item) return item.id;
  }
  // ninguém liberado (não deveria acontecer): fica no Dashboard, que sempre existe
  return 'dashboard';
}
