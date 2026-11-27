// Custo e markup do cadastro de itens moram numa tabela à parte (`cadastro_itens_valores`) desde a onda V1 do "ver valores no banco"
// (decidido com o usuário em 24/11/2026; PLANO_VER_VALORES_NO_BANCO.md). O banco só entrega essa tabela a quem tem uma das abas de preço
// (cadastro_itens, cadastro_produtos, formacao_precos, cotacoes, crm, licitacoes, telecom) e ao Admin; as outras telas seguem lendo `cadastro_itens`
// sem os valores. Tela que precisa do custo lê o item e chama `anexarValoresAosItens`, que devolve o item com os quatro campos de volta.
// Leitura recusada devolve `erro` (nunca "sem valores"): quem calcula preço avisa em vez de calcular com custo zero.
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';

export const CAMPOS_DE_VALOR = ['custo_unit', 'custo_embalagem', 'custo_fixo_pct', 'markup_pct'];

/** Separa de uma linha de item o que é valor (vai para a tabela-irmã) do resto (continua em `cadastro_itens`). */
export function separarValores(linha: any) {
  const resto: any = {}; const valores: any = {};
  for (const [k, v] of Object.entries(linha || {})) {
    if (CAMPOS_DE_VALOR.includes(k)) valores[k] = v; else resto[k] = v;
  }
  return { resto, valores };
}

function valoresParaGravar(v: any) {
  const saida: any = {};
  for (const k of CAMPOS_DE_VALOR) if (k in (v || {})) saida[k] = v[k];
  return saida;
}

/** Lê os valores de uma lista de itens (por id). Devolve `{ mapa, erro }`; mapa vazio com erro vazio = esses itens não têm linha de valores. */
export async function lerValoresDosItens(ids: string[]) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  const mapa = new Map<string, any>();
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('cadastro_itens_valores')
      .select('item_id,' + CAMPOS_DE_VALOR.join(',')).in('item_id', unicos.slice(i, i + 150));
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    // o select monta a lista de colunas em tempo de execução, então o tipo da linha não é conhecido pelo compilador
    for (const l of (data || []) as any[]) mapa.set(l.item_id, l);
  }
  return { mapa, erro: '' };
}

/** Lê todos os valores (a lista do Cadastro de itens). */
export async function lerTodosOsValores() {
  const mapa = new Map<string, any>();
  try {
    const linhas = await lerPaginado(() => supabase.from('cadastro_itens_valores')
      .select('item_id,' + CAMPOS_DE_VALOR.join(',')).order('item_id'));
    for (const l of linhas) mapa.set(l.item_id, l);
    return { mapa, erro: '' };
  } catch (e: any) { return { mapa, erro: e?.message || 'sem resposta' }; }
}

/** Devolve os itens com custo_unit, custo_embalagem, custo_fixo_pct e markup_pct preenchidos; `erro` diz se a leitura dos valores foi recusada. */
export async function anexarValoresAosItens(itens: any[], todos = false) {
  const lista = itens || [];
  const { mapa, erro } = todos ? await lerTodosOsValores() : await lerValoresDosItens(lista.map(i => i?.id));
  return { itens: lista.map(i => (i && mapa.has(i.id) ? { ...i, ...mapa.get(i.id), item_id: undefined } : i)), erro };
}

/** O mesmo para linhas que trazem o item embutido (`cadastro_itens(*)` dentro de outra tabela). */
export async function anexarValoresAoItemEmbutido(linhas: any[], chave = 'cadastro_itens') {
  const itens = (linhas || []).map(l => l?.[chave]).filter(Boolean);
  const { mapa, erro } = await lerValoresDosItens(itens.map(i => i.id));
  return { linhas: (linhas || []).map(l => (l?.[chave] && mapa.has(l[chave].id) ? { ...l, [chave]: { ...l[chave], ...mapa.get(l[chave].id), item_id: undefined } } : l)), erro };
}

/** Grava (cria ou troca) os valores de UM item. Só vão os campos que vierem em `valores`. */
export async function gravarValoresDoItem(itemId: string, valores: any) {
  const corpo = { item_id: itemId, ...valoresParaGravar(valores), atualizado_em: new Date().toISOString() };
  const { error } = await supabase.from('cadastro_itens_valores').upsert([corpo], { onConflict: 'item_id' });
  return { erro: error ? (error.message || 'sem resposta') : '' };
}

/** Grava os valores de vários itens pelo CÓDIGO (a importação por planilha). Itens sem código achado são contados em `semItem`. */
export async function gravarValoresPorCodigo(linhas: any[]) {
  const comCodigo = (linhas || []).filter(l => l?.codigo);
  let semItem = 0;
  for (let i = 0; i < comCodigo.length; i += 150) {
    const lote = comCodigo.slice(i, i + 150);
    const { data, error } = await supabase.from('cadastro_itens').select('id,codigo').in('codigo', lote.map(l => l.codigo));
    if (error) return { erro: error.message || 'sem resposta', semItem };
    const idPorCodigo = new Map((data || []).map((x: any) => [x.codigo, x.id]));
    const corpo = [];
    for (const l of lote) {
      const id = idPorCodigo.get(l.codigo);
      if (!id) { semItem++; continue; }
      corpo.push({ item_id: id, ...valoresParaGravar(separarValores(l).valores), atualizado_em: new Date().toISOString() });
    }
    if (corpo.length) {
      const { error: e2 } = await supabase.from('cadastro_itens_valores').upsert(corpo, { onConflict: 'item_id' });
      if (e2) return { erro: e2.message || 'sem resposta', semItem };
    }
  }
  return { erro: '', semItem };
}
