// @ts-nocheck
// O dinheiro do pedido de compra e da demanda do Compras mora em tabelas à parte desde a onda V3 do "ver valores no banco"
// (decidido com o usuário em 24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 10). O banco só as entrega a quem tem a caixa "Ver valores" e ao Admin.
// O pedido guardava dinheiro em TRÊS lugares: a coluna `valor_compra`, a chave `valor` de cada item de `vencedoras` e a chave `valor_unitario` de cada item de `itens`.
// `anexarValoresDosPedidos` devolve o pedido com os três recolocados (ou sem eles, quando a pessoa não vê): o resto dessas listas (fornecedor, itens que cada vencedora cobre,
// quantidade comprada) não é dinheiro e nunca sai. Só mexe no que o pedido TEM na leitura: se a consulta não pediu `vencedoras`, nada é acrescentado.
// Leitura recusada devolve `erro` (nunca "sem valores"): quem calcula ou mostra dinheiro avisa em vez de contar com zero.
import { supabase } from './supabaseClient';

/** Lê as linhas de valor dos pedidos. `ids` vazio com `todos` lê a tabela inteira (uma consulta só, para as listas completas). */
export async function lerValoresDosPedidos(ids: string[], todos = false) {
  const mapa = new Map<string, any>();
  const colunas = 'pedido_id,valor_compra,vencedoras_valores,itens_valores';
  if (todos) {
    const { data, error } = await supabase.from('pcp_pedidos_compra_valores').select(colunas).limit(5000);
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l.pedido_id), l);
    return { mapa, erro: '' };
  }
  const unicos = [...new Set((ids || []).filter(Boolean).map(String))];
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('pcp_pedidos_compra_valores').select(colunas).in('pedido_id', unicos.slice(i, i + 150));
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l.pedido_id), l);
  }
  return { mapa, erro: '' };
}

/** Recoloca o dinheiro de UM pedido a partir da linha da tabela nova (`linha` pode ser indefinida: pessoa sem direito ou pedido sem valor). */
export function pedidoComValores(p: any, linha: any) {
  if (!p) return p;
  const novo = { ...p };
  if ('valor_compra' in p) novo.valor_compra = linha?.valor_compra ?? null;
  if (Array.isArray(p.vencedoras)) {
    const porCotacao = linha?.vencedoras_valores && typeof linha.vencedoras_valores === 'object' ? linha.vencedoras_valores : {};
    novo.vencedoras = p.vencedoras.map((v: any) => {
      if (!v || typeof v !== 'object') return v;
      const { valor, ...resto } = v;
      const guardado = v.cotacao_id != null ? porCotacao[String(v.cotacao_id)] : undefined;
      return guardado != null ? { ...resto, valor: guardado } : resto;
    });
  }
  if (Array.isArray(p.itens)) {
    const porPosicao = Array.isArray(linha?.itens_valores) ? linha.itens_valores : [];
    novo.itens = p.itens.map((it: any, i: number) => {
      if (!it || typeof it !== 'object') return it;
      const { valor_unitario, ...resto } = it;
      return porPosicao[i] != null ? { ...resto, valor_unitario: porPosicao[i] } : resto;
    });
  }
  return novo;
}

/** Devolve os pedidos com o dinheiro recolocado. `erro` diz se a leitura foi recusada; nesse caso os pedidos voltam como vieram. */
export async function anexarValoresDosPedidos(pedidos: any[], todos = false) {
  const lista = pedidos || [];
  if (!lista.length) return { pedidos: lista, erro: '' };
  const { mapa, erro } = await lerValoresDosPedidos(lista.map(p => p?.id), todos);
  if (erro) return { pedidos: lista, erro };
  return { pedidos: lista.map(p => (p?.id ? pedidoComValores(p, mapa.get(String(p.id))) : p)), erro: '' };
}

/** O mesmo para UM pedido (ou nenhum). */
export async function anexarValoresDoPedido(pedido: any) {
  if (!pedido) return { pedido, erro: '' };
  const r = await anexarValoresDosPedidos([pedido]);
  return { pedido: r.pedidos[0], erro: r.erro };
}

/** Demandas do Compras (`demandas_setoriais`): só a coluna `valor_compra`. */
export async function anexarValoresDasDemandas(demandas: any[]) {
  const lista = demandas || [];
  const ids = [...new Set(lista.map(d => d?.id).filter(Boolean).map(String))];
  if (!ids.length || !lista.some(d => d && 'valor_compra' in d)) return { demandas: lista, erro: '' };
  const mapa = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('demandas_setoriais_valores').select('demanda_id,valor_compra').in('demanda_id', ids.slice(i, i + 150));
    if (error) return { demandas: lista, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l.demanda_id), l);
  }
  return { demandas: lista.map(d => (d?.id && 'valor_compra' in d ? { ...d, valor_compra: mapa.get(String(d.id))?.valor_compra ?? null } : d)), erro: '' };
}
