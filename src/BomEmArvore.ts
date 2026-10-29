// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// BomEmArvore — a BOM em PAI e FILHO (pedido do usuário em 29/10/2026)
//
// O material que a estrutura de instalação calcula serve para INSTALAR um item vendido: o parafuso, o suporte e o chicote da sirene são "filhos" da sirene. Cada linha da BOM calculada
// guarda `pai_item_id` (o item que ela instala) e `pai_nome`. A lista continua PLANA no banco (é um array, todos os consumidores seguem lendo igual); a árvore é só o jeito de mostrar
// e de imprimir: o item pai primeiro e os filhos logo abaixo, recuados. Linha sem `pai_item_id` (BOM antiga, linha digitada à mão) fica solta, como sempre foi.
//
// O mesmo material pode aparecer sob pais diferentes (o parafuso do Interled2 e o do amplificador): são linhas separadas, cada uma com a quantidade do seu pai. Quem soma por item
// (estoque, compras) já somava linhas repetidas.
// ─────────────────────────────────────────────────────────────────────────────

export type GrupoDaArvore = {
  chave: string;
  /** índice da linha do próprio pai na lista, ou null quando o pai não está na BOM (ex.: o Conjunto Elétrico não é separado: só o que ele instala) */
  idx: number | null;
  nome: string;
  pai_item_id: string | null;
  /** índices das linhas filhas, na ordem da lista */
  filhos: number[];
};

/** A chave que identifica uma linha: o mesmo item sob pais diferentes são linhas diferentes. */
export const chaveDaLinhaBom = (l: any) => `${l?.pai_item_id || ''}|${l?.item_id || `txt:${l?.nome}`}`;

/** Agrupa as linhas da BOM em árvore, sem mexer na lista: devolve os grupos na ordem em que aparecem, cada um com o índice do pai (se houver) e os índices dos filhos. */
export function agruparEmArvore(linhas: any[]): GrupoDaArvore[] {
  const lista = linhas || [];
  const grupos: GrupoDaArvore[] = [];
  const porPai = new Map<string, GrupoDaArvore>();   // pai_item_id → grupo
  const doPai = (id: string, nome: string, idx: number | null) => {
    let g = porPai.get(id);
    if (!g) { g = { chave: `pai:${id}`, idx, nome, pai_item_id: id, filhos: [] }; porPai.set(id, g); grupos.push(g); }
    else if (g.idx === null && idx !== null) { g.idx = idx; g.nome = nome || g.nome; }
    return g;
  };
  lista.forEach((l, i) => {
    const pai = l?.pai_item_id ? String(l.pai_item_id) : '';
    if (pai) { doPai(pai, String(l.pai_nome || ''), null).filhos.push(i); return; }
    // linha sem pai: se algum filho aponta para ela (mesmo item), ela é o pai desse grupo; senão fica solta
    const id = l?.item_id ? String(l.item_id) : '';
    const jaTemFilhos = id && porPai.get(id);
    if (jaTemFilhos && jaTemFilhos.idx === null) { jaTemFilhos.idx = i; jaTemFilhos.nome = String(l.nome || jaTemFilhos.nome || ''); return; }
    if (id && !porPai.has(id)) { const g: GrupoDaArvore = { chave: `pai:${id}`, idx: i, nome: String(l.nome || ''), pai_item_id: id, filhos: [] }; porPai.set(id, g); grupos.push(g); return; }
    grupos.push({ chave: `solta:${i}`, idx: i, nome: String(l?.nome || ''), pai_item_id: null, filhos: [] });
  });
  return grupos;
}

/** A lista na ordem de leitura da árvore: pai, filhos, pai, filhos… Cada item diz se é filho e de quem. Serve a quem só precisa percorrer (impressão). */
export function linhasEmOrdemDeArvore(linhas: any[]): { idx: number; filha: boolean; paiNome: string }[] {
  const saida: { idx: number; filha: boolean; paiNome: string }[] = [];
  for (const g of agruparEmArvore(linhas)) {
    if (g.idx !== null) saida.push({ idx: g.idx, filha: false, paiNome: '' });
    for (const f of g.filhos) saida.push({ idx: f, filha: true, paiNome: g.nome });
  }
  return saida;
}

/** A lista tem algum filho? (sem filho a tela mostra a lista plana de sempre) */
export const temFilhos = (linhas: any[]) => (linhas || []).some(l => !!l?.pai_item_id);
