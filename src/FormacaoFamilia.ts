// @ts-nocheck
// A "família" de uma formação de preço: a raiz das versões (`versao_raiz_id`, ou o id da própria v1). As ligações da formação (com outra formação, 22/10/2026, e com a Ordem de
// compra do Compras, 26/10/2026) valem para a FAMÍLIA, então quem abre qualquer versão enxerga a mesma ligação. Mora aqui, num arquivo pequeno, para a tela de Formação de Preços e o
// Compras usarem a mesma regra sem importar uma da outra.

/** A raiz da família a que a formação pertence. */
export const raizDaCotacao = (m: any) => m?.versao_raiz_id || m?.id;

/** A última versão de uma família (maior `versao`; empate pela criação mais recente). */
export const ultimaVersaoDe = (lista: any[]) =>
  [...lista].sort((a: any, b: any) => (b.versao || 1) - (a.versao || 1) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];

/** Agrupa linhas de formação por família e devolve a última versão de cada uma: [{ raiz, cot }]. */
export function familiasDe(cotacoes: any[]): { raiz: string; cot: any }[] {
  const porFamilia = new Map<string, any[]>();
  (cotacoes || []).forEach((c: any) => { const k = raizDaCotacao(c); porFamilia.set(k, [...(porFamilia.get(k) || []), c]); });
  return [...porFamilia.entries()].map(([raiz, lista]) => ({ raiz, cot: ultimaVersaoDe(lista) }));
}
