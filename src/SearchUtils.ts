// ─────────────────────────────────────────────────────────────────────────────
// SearchUtils — normalização compartilhada para busca de texto que ignora
// acento e maiúscula/minúscula (ex: buscar "jose" acha "José").
//
// A busca acha por PALAVRAS em qualquer ordem: "suporte slimled" acha
// "SLIMLED SUPORTE 4" e "suporte p/ slimled 2". Todas as palavras digitadas
// precisam aparecer; a ordem e o que vem entre elas não importam.
//
// No navegador use combinaBusca(campos, busca); no banco, buscarPorPalavras(),
// que monta uma condição por palavra (todas precisam bater) aceitando qualquer
// das colunas em cada uma. As colunas já normalizadas no banco (…_norm, geradas
// com lower+unaccent) ignoram acento também.
// ─────────────────────────────────────────────────────────────────────────────

/** Remove acentos e baixa a caixa — usar nos dois lados de toda comparação de busca. */
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palavras digitadas na busca, sem acento e em minúsculas. */
export function palavrasDaBusca(busca: string | null | undefined): string[] {
  return normalizarBusca(busca).split(/\s+/).filter(Boolean);
}

/**
 * true quando o texto tem TODAS as palavras digitadas, em qualquer ordem.
 * Aceita um campo, vários campos (array) ou o registro inteiro (objeto).
 */
export function combinaBusca(texto: any, busca: string | null | undefined): boolean {
  const palavras = palavrasDaBusca(busca);
  if (!palavras.length) return true;
  const partes = Array.isArray(texto) ? texto
    : (texto && typeof texto === 'object') ? Object.values(texto)
    : [texto];
  const alvo = normalizarBusca(partes.filter(v => v != null && typeof v !== 'object').join(' '));
  return palavras.every(p => alvo.includes(p));
}

/**
 * Mesma regra nas buscas feitas no banco: uma condição por palavra (todas
 * precisam bater) e, em cada condição, qualquer das colunas serve.
 * Passe as colunas …_norm para ignorar acento; com `cru` as palavras vão como
 * foram digitadas (colunas sem versão normalizada).
 */
export function buscarPorPalavras(query: any, colunas: string[], busca: string | null | undefined, opcoes: { cru?: boolean } = {}): any {
  const palavras = opcoes.cru
    ? String(busca || '').trim().split(/\s+/).filter(Boolean)
    : palavrasDaBusca(busca);
  let q = query;
  for (const palavra of palavras) {
    const termo = palavra.replace(/[%,()\\*]/g, '');  // caracteres que quebram o filtro do PostgREST
    if (!termo) continue;
    q = colunas.length === 1
      ? q.ilike(colunas[0], `%${termo}%`)
      : q.or(colunas.map(c => `${c}.ilike.%${termo}%`).join(','));
  }
  return q;
}
