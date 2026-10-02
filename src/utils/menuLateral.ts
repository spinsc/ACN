// Quais grupos do menu lateral vêm recolhidos quando a pessoa abre o menu.
// Regra definida com o usuário em 02/10/2026 (Etapa 14b): ao abrir, só o grupo da tela atual
// fica aberto — a lista inteira (31 itens para o Admin) passava de 1.200 px e rolava em notebook
// de 768 px de altura. O grupo sem título (o do Dashboard) nunca é recolhido: não tem título para
// reabrir. Dentro do menu, a pessoa abre e fecha cada grupo normalmente.
export function gruposParaRecolher(
  grupos: { section: string; items: { id: string }[] }[],
  telaAtual: string,
  semTitulo = 'Dashboard',
): Set<string> {
  const atual = grupos.find(g => g.items.some(i => i.id === telaAtual))?.section;
  return new Set(grupos.map(g => g.section).filter(s => s !== semTitulo && s !== atual));
}
