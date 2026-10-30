// ─────────────────────────────────────────────────────────────────────────────
// DIVISÃO DO PEDIDO DE COMPRA (pedido do usuário em 30/10/2026)
//
// Numa lista de materiais, o item que ainda não tem cotação não pode segurar os que já têm. Ao aprovar, quem tem poder escolhe
// "Aprovar e separar o resto": os itens que NENHUMA cotação cobre saem do pedido e viram um pedido novo (PC-00123-B, em "Pendente",
// com o mesmo solicitante, vínculo, centro de custo, comprador e anexos), e o original segue o fluxo normal só com o que tem cotação.
// A gravação inteira é a função do banco `compras_dividir_pedido` (tudo ou nada): a escolha de vencedora e as cotações apontam para a
// POSIÇÃO do item, e ela muda quando os itens saem, então o banco renumera tudo junto e devolve o mapa (posição antiga → nova).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabaseClient';

type Item = { indice: number; nome: string; [k: string]: any };

const numerados = (pedido: any): Item[] => Array.isArray(pedido?.itens)
  ? pedido.itens.map((i: any, indice: number) => ({ ...i, indice })).filter((i: any) => String(i?.nome || '').trim()) : [];

/** A lista de itens do pedido foi editada depois das cotações? (a cotação aponta para a posição do item; o nome na posição tem de ser o mesmo) */
export function listaAlteradaDepoisDeCotar(pedido: any, cotacoes: any[]): boolean {
  const nomeDe = (s: any) => String(s ?? '').trim().toLowerCase();
  return (cotacoes || []).some((c: any) => Array.isArray(c.itens) && c.itens.some((ci: any) => nomeDe(ci.nome) !== nomeDe(pedido?.itens?.[Number(ci.indice)]?.nome)));
}

/**
 * Dá para separar o resto ao aprovar? Só quando: o pedido tem vários itens e está na coluna "Aguardando Aprovação" (cotações já lançadas, ainda sem aprovação),
 * há item que nenhuma cotação cobre, e a escolha de agora (`escolhidos`, os itens da cotação que está sendo aprovada) mais as vencedoras
 * das outras cotações (`vencedoras`) completam TODOS os itens que têm cotação. Cotação do formato antigo (sem lista de itens) cobre o
 * pedido inteiro: então não existe item "sem cotação".
 */
export function situacaoDaDivisao({ pedido, cotacoes, vencedoras, escolhidos, cotacaoId, vencedoraId }: {
  pedido: any; cotacoes: any[]; vencedoras: any[]; escolhidos: number[]; cotacaoId: string; vencedoraId?: string | null;
}): { pode: boolean; fora: Item[] } {
  const nao = { pode: false, fora: [] as Item[] };
  const itens = numerados(pedido);
  if (itens.length < 2 || vencedoraId) return nao;
  // pedido do usuário em 30/10/2026: só na coluna "Aguardando Aprovação" (em "Em Andamento" o comprador só lança as cotações antes de o pedido mudar de coluna)
  if (String(pedido?.status_compra) !== 'Aguardando Aprovação') return nao;
  const lista = cotacoes || [];
  if (!lista.length || lista.some((c: any) => !Array.isArray(c.itens) || !c.itens.length)) return nao;
  // as cotações apontam para a POSIÇÃO do item: se a lista foi editada depois de cotar (PC-00141), as posições já não batem e separar levaria o item errado
  if (listaAlteradaDepoisDeCotar(pedido, lista)) return nao;
  const cobertos = new Set<number>(lista.flatMap((c: any) => c.itens.map((i: any) => Number(i.indice))));
  const fora = itens.filter(i => !cobertos.has(i.indice));
  const comCotacao = itens.filter(i => cobertos.has(i.indice));
  if (!fora.length || !comCotacao.length) return nao;
  const decididos = new Set<number>([
    ...(vencedoras || []).filter((v: any) => v.cotacao_id !== cotacaoId).flatMap((v: any) => (v.itens || []).map(Number)),
    ...(escolhidos || []).map(Number),
  ]);
  if (comCotacao.some(i => !decididos.has(i.indice))) return nao;
  return { pode: true, fora };
}

/** Troca a posição antiga dos itens pela nova (o mapa vem do banco) nas vencedoras. */
export function renumerarVencedoras(vencedoras: any[], mapa: Record<string, number>) {
  return (vencedoras || []).map((v: any) => ({ ...v, itens: (v.itens || []).map((ix: number) => mapa[String(ix)]) }));
}

/** Separa os itens `indicesFora` num pedido novo. Devolve { novo_id, novo_numero, mapa } ou { erro }. */
export async function dividirPedido(pedidoId: string, indicesFora: number[], user: any): Promise<any> {
  const { data, error } = await supabase.rpc('compras_dividir_pedido', {
    p_pedido_id: pedidoId, p_indices_fora: indicesFora, p_usuario_email: user?.email || null, p_usuario_nome: user?.nome || null,
  });
  if (error) return { erro: error.message };
  return data;
}
