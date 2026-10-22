// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OS TEXTOS DA OP (descrição e observações) — 22/10/2026
//
// Relato do Comercial/CRM: escreveu uma descrição/observação na OP e não achou nos resumos. A OP tem quatro textos livres (resumo dos serviços, especificações, observações comerciais e
// observações de atenção); a tela de detalhe da OP já os mostrava, mas o Resumo do lote, o dossiê do lote e o dossiê da OP não. Esta regra é a mesma nos três lugares.
// Num lote cada unidade tem o seu texto: o que é igual em todas aparece uma vez ("todas as N unidades"); se diferirem, cada variação vem com as suas unidades.
// ─────────────────────────────────────────────────────────────────────────────
export const CAMPOS_TEXTO_OP: { campo: string; rotulo: string; atencao?: boolean }[] = [
  { campo: 'observacoes_atencao', rotulo: 'Atenção', atencao: true },
  { campo: 'resumo_servicos', rotulo: 'Resumo dos serviços' },
  { campo: 'especificacoes', rotulo: 'Especificações' },
  { campo: 'observacoes_comercial', rotulo: 'Observações comerciais' },
];

const limpo = (v: any) => String(v ?? '').trim();

export type TextoDaOp = { campo: string; rotulo: string; atencao: boolean; grupos: { texto: string; unidades: string[]; todas: boolean }[] };

/** Os textos preenchidos de uma lista de OPs. `rotuloDaUnidade` devolve como chamar cada unidade (ex.: "/01"); numa OP só, o texto vem num grupo só. */
export function textosDasOps(ops: any[], rotuloDaUnidade: (op: any) => string = (o) => String(o?.opl || '')): TextoDaOp[] {
  const lista = Array.isArray(ops) ? ops.filter(Boolean) : [];
  const saida: TextoDaOp[] = [];
  for (const c of CAMPOS_TEXTO_OP) {
    const grupos: { texto: string; unidades: string[]; todas: boolean }[] = [];
    for (const o of lista) {
      const texto = limpo(o[c.campo]);
      if (!texto) continue;
      const g = grupos.find(x => x.texto === texto);
      if (g) g.unidades.push(rotuloDaUnidade(o)); else grupos.push({ texto, unidades: [rotuloDaUnidade(o)], todas: false });
    }
    if (!grupos.length) continue;
    grupos.forEach(g => { g.todas = g.unidades.length === lista.length; });
    grupos.sort((a, b) => b.unidades.length - a.unidades.length);
    saida.push({ campo: c.campo, rotulo: c.rotulo, atencao: !!c.atencao, grupos });
  }
  return saida;
}

/** "todas as 13 unidades" / "/01, /02" / "" (OP avulsa: sem legenda). */
export function legendaDasUnidades(g: { unidades: string[]; todas: boolean }, total: number): string {
  if (total <= 1) return '';
  return g.todas ? `todas as ${total} unidades` : g.unidades.join(', ');
}
