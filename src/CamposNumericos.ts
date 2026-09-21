// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS NUMÉRICOS — a rodinha do mouse não altera mais o valor
//
// Campo <input type="number"> em foco muda de valor quando a pessoa rola a
// rodinha por cima dele, no passo do campo. Na prática, rolar a tela para
// chegar num campo de baixo trocava, sem ninguém perceber, o markup de 100
// para 99,5 — e o preço da tela pulava de R$ 0,00 para R$ 612 mil
// (bug relatado no Cadastro de Itens em 21/09/2026).
//
// Aqui o campo em foco perde o foco ao primeiro giro: a página rola normal e
// o valor fica como estava. Vale para as 24 telas do sistema de uma vez, sem
// precisar mexer em cada input.
// ─────────────────────────────────────────────────────────────────────────────

export function iniciarCamposNumericos() {
  document.addEventListener('wheel', () => {
    const el = document.activeElement as HTMLInputElement | null;
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
  }, { passive: true, capture: true });
}
