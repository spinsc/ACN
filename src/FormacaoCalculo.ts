// ─────────────────────────────────────────────────────────────────────────────
// ESTRUTURA E TOTAIS DA FORMAÇÃO DE PREÇOS — Lote › Item › (Subgrupo) › Produtos
//
// Regras decididas com o usuário em 13/09/2026:
//  • A quantidade de cada PRODUTO é para 1 UNIDADE do item (ex.: 1 rádio por
//    viatura). Total do item = soma dos produtos × quantidade do item;
//    unitário do item = soma dos produtos. (Antes a tela fazia as duas contas
//    ao mesmo tempo — dividia e multiplicava. Nenhuma formação salva tinha
//    quantidade de item > 1, então nenhum valor salvo mudou.)
//  • Item com SUBGRUPOS (ex.: Nivus 6 un.: 3 com conjunto A, 2 com A + cela,
//    1 só cela): cada subgrupo tem a sua quantidade e os seus produtos;
//    quantidade do item = soma dos subgrupos; total = soma dos subgrupos;
//    unitário do item = MÉDIO (total ÷ quantidade), que é o preço unitário
//    que vai na proposta da licitação.
//  • Lote: total = soma dos itens; unitário = SOMA DOS UNITÁRIOS dos itens
//    (1 unidade de cada item do lote).
//  • "Multiplicador geral" (Parâmetros Globais) continua à parte: multiplica a
//    formação inteira no quadro próprio.
//
// Usado pela tela da formação, pela lista de Preços Formados, pela geração de
// propostas (CotacoesTab) e pela importação de itens do contrato da licitação.
// ─────────────────────────────────────────────────────────────────────────────

export const loteDe     = (item: any): string => item?.lote_nome || 'Lote 1';
export const grupoDe    = (item: any): string => item?.grupo_nome || 'Item 1';
export const subgrupoDe = (item: any): string | null => (item?.subgrupo_nome ? String(item.subgrupo_nome) : null);

export const chaveItem = (lote: string, grupo: string) => `${lote}::${grupo}`;
export const chaveSub  = (lote: string, grupo: string, sub: string) => `${lote}::${grupo}::${sub}`;

/** Quantidade do item (antigo "Lote deste Item"). Lê a chave "lote::item" e,
 *  para formação antiga (tudo no Lote 1), a chave velha só com o item. */
export function qtdDoItem(params: any, lote: string, grupo: string): number {
  const m = params?.lote_por_grupo || {};
  const v = m[chaveItem(lote, grupo)] ?? (lote === 'Lote 1' ? m[grupo] : undefined);
  return Number(v) || 1;
}

export function qtdDoSubgrupo(params: any, lote: string, grupo: string, sub: string): number {
  return Number((params?.qtd_subgrupo || {})[chaveSub(lote, grupo, sub)]) || 1;
}

export type Totais = { totVendas: number; totCustos: number; totDifal: number; totImposto: number; totMargem: number; lucroPct: number };

const lucro = (t: Omit<Totais, 'lucroPct'>) => (t.totVendas - t.totDifal) > 0 ? t.totMargem / (t.totVendas - t.totDifal) * 100 : 0;

/** Soma resultados de calcItem() (1 unidade). */
export function somarResultados(results: any[]): Totais {
  const t = {
    totVendas:  results.reduce((s, r) => s + (r?.valorTotal   || 0), 0),
    totCustos:  results.reduce((s, r) => s + (r?.custoTotal   || 0), 0),
    totDifal:   results.reduce((s, r) => s + (r?.totalDifal   || 0), 0),
    totImposto: results.reduce((s, r) => s + (r?.totalImposto || 0), 0),
    totMargem:  results.reduce((s, r) => s + (r?.margem       || 0), 0),
  };
  return { ...t, lucroPct: lucro(t) };
}

export function escalar(t: Totais, k: number): Totais {
  return { totVendas: t.totVendas * k, totCustos: t.totCustos * k, totDifal: t.totDifal * k,
           totImposto: t.totImposto * k, totMargem: t.totMargem * k, lucroPct: t.lucroPct };
}

export function somarTotais(lista: Totais[]): Totais {
  const t = {
    totVendas:  lista.reduce((s, x) => s + x.totVendas, 0),
    totCustos:  lista.reduce((s, x) => s + x.totCustos, 0),
    totDifal:   lista.reduce((s, x) => s + x.totDifal, 0),
    totImposto: lista.reduce((s, x) => s + x.totImposto, 0),
    totMargem:  lista.reduce((s, x) => s + x.totMargem, 0),
  };
  return { ...t, lucroPct: lucro(t) };
}

export type SubgrupoCalc = { nome: string; qtd: number; indices: number[]; unit: Totais; total: Totais };
export type ItemCalc = { lote: string; nome: string; qtd: number; indices: number[]; subgrupos: SubgrupoCalc[]; unit: Totais; total: Totais };
export type LoteCalc = { nome: string; itens: ItemCalc[]; unit: Totais; total: Totais };
export type EstruturaFormacao = { results: any[]; lotes: LoteCalc[]; itens: ItemCalc[]; geral: Totais };

/**
 * Monta a estrutura com totais. `calc` é o calcItem da tela que chama (a tela
 * da formação aplica antes os parâmetros globais em cada componente).
 * `results[i]` corresponde a `componentes[i]`.
 */
export function estruturaFormacao(componentes: any[], params: any, calc: (it: any, p: any) => any): EstruturaFormacao {
  const lista = Array.isArray(componentes) ? componentes : [];
  const results = lista.map(it => calc(it, params || {}));

  const ordemLotes: string[] = [];
  const ordemItens: Record<string, string[]> = {};
  lista.forEach(it => {
    const l = loteDe(it), g = grupoDe(it);
    if (!ordemLotes.includes(l)) { ordemLotes.push(l); ordemItens[l] = []; }
    if (!ordemItens[l].includes(g)) ordemItens[l].push(g);
  });

  const todosItens: ItemCalc[] = [];
  const lotes: LoteCalc[] = ordemLotes.map(l => {
    const itens: ItemCalc[] = ordemItens[l].map(g => {
      const indices = lista.map((it, i) => ({ it, i })).filter(({ it }) => loteDe(it) === l && grupoDe(it) === g).map(({ i }) => i);
      const nomesSub: string[] = [];
      indices.forEach(i => { const s = subgrupoDe(lista[i]); if (s && !nomesSub.includes(s)) nomesSub.push(s); });

      let item: ItemCalc;
      if (nomesSub.length === 0) {
        const unit = somarResultados(indices.map(i => results[i]));
        const qtd = qtdDoItem(params, l, g);
        item = { lote: l, nome: g, qtd, indices, subgrupos: [], unit, total: escalar(unit, qtd) };
      } else {
        // componente sem subgrupo num item que tem subgrupos (não deveria
        // acontecer pela tela) entra como um subgrupo próprio, para não sumir da conta
        const semSub = indices.filter(i => !subgrupoDe(lista[i]));
        const subgrupos: SubgrupoCalc[] = [...nomesSub, ...(semSub.length ? [''] : [])].map(s => {
          const idx = s ? indices.filter(i => subgrupoDe(lista[i]) === s) : semSub;
          const unit = somarResultados(idx.map(i => results[i]));
          const qtd = s ? qtdDoSubgrupo(params, l, g, s) : 1;
          return { nome: s || '(sem subgrupo)', qtd, indices: idx, unit, total: escalar(unit, qtd) };
        });
        const qtd = subgrupos.reduce((s, x) => s + x.qtd, 0) || 1;
        const total = somarTotais(subgrupos.map(x => x.total));
        item = { lote: l, nome: g, qtd, indices, subgrupos, unit: escalar(total, 1 / qtd), total };
      }
      todosItens.push(item);
      return item;
    });
    return { nome: l, itens, unit: somarTotais(itens.map(x => x.unit)), total: somarTotais(itens.map(x => x.total)) };
  });

  return { results, lotes, itens: todosItens, geral: somarTotais(lotes.map(x => x.total)) };
}

/** Quantidade de cada item (lote, item) já considerando subgrupos. */
export function quantidadesDosItens(componentes: any[], params: any): { lote: string; grupo: string; qtd: number; produtos: string[] }[] {
  const est = estruturaFormacao(componentes, params, () => ({}));
  return est.itens.map(it => ({
    lote: it.lote, grupo: it.nome, qtd: it.qtd,
    produtos: it.indices.map(i => componentes[i]?.produto).filter(Boolean),
  }));
}
