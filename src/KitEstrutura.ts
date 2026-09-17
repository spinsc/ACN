// ─────────────────────────────────────────────────────────────────────────────
// KitEstrutura — a composição de um kit (produto), com os sub-kits abertos
//
// Cada linha da estrutura é um item do catálogo OU outro kit (produto_filho_id).
// O sub-kit fica VINCULADO, não copiado: a composição lida é sempre a atual, então
// mudou no kit de origem, mudou em quem o usa e nas formações de preço feitas a
// partir dele. O kit responde pela COMPOSIÇÃO; custo, markup e demais valores são
// de cada formação de preço.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

export type LinhaKit = {
  item: any;          // registro de cadastro_itens
  quantidade: number; // já multiplicada pelas quantidades dos kits acima
  observacoes: string;
  origem: string[];   // kits por onde passou (vazio = item direto do kit)
};

const SELECT_LINHAS =
  'id, produto_id, item_id, item_nome, item_codigo, quantidade, unidade, observacoes, ordem, produto_filho_id, ' +
  'cadastro_itens(*), filho:cadastro_produtos!produto_filho_id(id, codigo, nome, categoria)';

/** Linhas do kit como estão gravadas (sub-kit continua uma linha só) */
export async function linhasDoKit(produtoId: string) {
  if (!produtoId) return [];
  const { data } = await supabase.from('cadastro_produtos_itens')
    .select(SELECT_LINHAS).eq('produto_id', produtoId).order('ordem');
  return data || [];
}

/** Estrutura do kit com os sub-kits abertos, item a item (protegida contra ciclo) */
export async function estruturaDoKit(produtoId: string, quantidade = 1, caminho: string[] = [], vistos: string[] = []): Promise<LinhaKit[]> {
  if (!produtoId || vistos.includes(produtoId)) return [];
  const linhas = await linhasDoKit(produtoId);
  const saida: LinhaKit[] = [];
  for (const l of linhas as any[]) {
    const qt = (Number(l.quantidade) || 1) * quantidade;
    if (l.produto_filho_id) {
      const nome = l.filho?.nome || l.item_nome || 'Kit';
      saida.push(...await estruturaDoKit(l.produto_filho_id, qt, [...caminho, nome], [...vistos, produtoId]));
    } else if (l.cadastro_itens) {
      saida.push({ item: l.cadastro_itens, quantidade: qt, observacoes: l.observacoes || '', origem: caminho });
    }
  }
  return saida;
}

/** Custo de uma linha do catálogo, com IPI e ST do item */
export function custoDoItem(item: any) {
  return (Number(item?.custo_unit) || 0)
    * (1 + (Number(item?.ipi_pct) || 0) / 100)
    * (1 + (Number(item?.st_pct) || 0) / 100);
}

/** Custo do kit inteiro (itens diretos + sub-kits) */
export async function custoDoKit(produtoId: string) {
  const linhas = await estruturaDoKit(produtoId);
  return linhas.reduce((s, l) => s + custoDoItem(l.item) * l.quantidade, 0);
}

/** Kits que usam este kit dentro deles */
export async function kitsQueUsam(produtoId: string) {
  const { data } = await supabase.from('cadastro_produtos_itens')
    .select('pai:cadastro_produtos!produto_id(id, codigo, nome)')
    .eq('produto_filho_id', produtoId);
  const porId = new Map<string, any>();
  (data || []).forEach((l: any) => { if (l.pai) porId.set(l.pai.id, l.pai); });
  return [...porId.values()];
}

/** Formações de preço feitas a partir deste kit (o vínculo fica na linha da formação) */
export async function formacoesQueUsam(produtoId: string) {
  const { data } = await supabase.from('cotacoes_precos')
    .select('id, nome, numero_cotacao, status')
    .contains('itens', JSON.stringify([{ kit_id: produtoId }]));
  return data || [];
}

/** Quem impede apagar o produto: kits que o usam e formações de preço feitas com ele */
export async function usosDoKit(produtoId: string) {
  const [kits, formacoes] = await Promise.all([kitsQueUsam(produtoId), formacoesQueUsam(produtoId)]);
  return { kits, formacoes, bloqueado: kits.length > 0 || formacoes.length > 0 };
}
