// ─────────────────────────────────────────────────────────────────────────────
// SearchUtils — normalização compartilhada para busca de texto que ignora
// acento e maiúscula/minúscula (ex: buscar "jose" acha "José").
//
// Fase 1 (client-side): usado nos filtros que já rodam no navegador
// (`.toLowerCase().includes(...)`) — troca direta, sem mexer em banco.
// Fase 2 (server-side, futura): as buscas via Supabase `.ilike()` continuam
// sensíveis a acento até vir a extensão `unaccent` + colunas normalizadas no
// banco — fora do escopo desta função.
// ─────────────────────────────────────────────────────────────────────────────

/** Remove acentos e baixa a caixa — usar nos dois lados de toda comparação de busca. */
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
