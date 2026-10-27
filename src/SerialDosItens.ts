// ─────────────────────────────────────────────────────────────────────────────
// SERIAL DOS ITENS — a lista de seriais da Venda para Envio vem pronta (pedido do usuário em 27/10/2026)
//
// Antes o Almoxarifado digitava o produto E o serial de cada linha. Agora a lista nasce do que foi vendido: entram só os itens com a marca "Tem número de série"
// do Cadastro de itens (o Conjunto Elétrico nunca tem; frete e serviço também não) e o Almoxarifado digita apenas o serial. Quantas linhas: uma por unidade vendida
// de cada item (a quantidade da linha vendida; numa remessa parcial, a parte proporcional às unidades que saem agora, descontando o que já foi serializado).
// A marca começa desligada em todos os itens (ninguém foi alterado): venda sem nenhum item marcado segue com a digitação à mão de sempre.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { completarItensPeloNome } from './ConfigEstrutura';
import { estruturaParaDemanda } from './DemandaItens';
import { logChange } from './AuditSystem';
import { normalizarBusca } from './SearchUtils';

export type ModeloSerial = { produto: string; qtd: number };
export type LinhaDeSerial = { produto: string; serial: string; fixo?: boolean };

const chaveDe = (p: any) => normalizarBusca(String(p || '')).trim();

/**
 * Das linhas vendidas, as que recebem serial: item ligado ao cadastro com a marca "Tem serial" e que não é o Conjunto Elétrico. Linha sem vínculo é procurada pelo nome
 * exato (a mesma regra da estrutura de instalação). Leitura que falha devolve o erro (quem chama volta à digitação à mão e avisa; nunca vale como "nenhum item tem serial").
 */
export async function modeloDeSeriais(vendidos: any[]): Promise<{ erro: string | null; modelo: ModeloSerial[] }> {
  try {
    const base = await completarItensPeloNome(Array.isArray(vendidos) ? vendidos : []);
    // linha vendida que é um kit (produto com estrutura) vale pelos itens dele, multiplicados pela quantidade vendida: a marca de serial é do ITEM, e é nele que se marca na BOM
    const lista: any[] = [];
    for (const v of base) {
      if (!v) continue;
      if (v.item_id) { lista.push(v); continue; }
      if (v.produto_id) {
        const q = Number(v.quantidade) || 1;
        for (const e of await estruturaParaDemanda(v.produto_id)) if (e.item_id) lista.push({ item_id: e.item_id, nome: e.nome, quantidade: (Number(e.quantidade) || 1) * q });
      }
    }
    const ids = [...new Set(lista.map((v: any) => v?.item_id).filter(Boolean).map(String))];
    if (!ids.length) return { erro: null, modelo: [] };
    const { data, error } = await supabase.from('cadastro_itens').select('id,tem_serial,eh_conjunto_instalacao').in('id', ids);
    if (error) return { erro: error.message, modelo: [] };
    const com = new Set((data || []).filter((i: any) => i.tem_serial && !i.eh_conjunto_instalacao).map((i: any) => String(i.id)));
    const modelo = lista
      .filter((v: any) => v && v.item_id && com.has(String(v.item_id)) && Number(v.quantidade) > 0 && String(v.nome || '').trim())
      .map((v: any) => ({ produto: String(v.nome).trim(), qtd: Math.max(1, Math.round(Number(v.quantidade))) }));
    return { erro: null, modelo };
  } catch (e: any) {
    return { erro: String(e?.message || e), modelo: [] };
  }
}

/** Quais dos itens (ids do cadastro) têm a marca de serial: mapa id → { tem, conjunto }. Leitura que falha devolve o erro. */
export async function lerMarcasDeSerial(ids: string[]): Promise<{ erro: string | null; marcas: Record<string, { tem: boolean; conjunto: boolean }> }> {
  const lista = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!lista.length) return { erro: null, marcas: {} };
  const { data, error } = await supabase.from('cadastro_itens').select('id,tem_serial,eh_conjunto_instalacao').in('id', lista);
  if (error) return { erro: error.message, marcas: {} };
  return { erro: null, marcas: Object.fromEntries((data || []).map((i: any) => [String(i.id), { tem: !!i.tem_serial && !i.eh_conjunto_instalacao, conjunto: !!i.eh_conjunto_instalacao }])) };
}

/**
 * Marca (ou desmarca) que o item recebe número de série, direto no Cadastro de itens (pedido do usuário em 27/10/2026: quem monta a BOM sabe se o item leva serial e não deveria ter que ir
 * ao cadastro para dizer isso). O Conjunto Elétrico nunca tem. Devolve a mensagem de erro, ou null quando gravou; a alteração fica no histórico do item.
 */
export async function gravarMarcaDeSerial(item: { id: string; nome?: string }, tem: boolean, user?: any): Promise<string | null> {
  const { data: atual, error: erroLeitura } = await supabase.from('cadastro_itens').select('id,tem_serial,eh_conjunto_instalacao').eq('id', item.id).maybeSingle();
  if (erroLeitura) return erroLeitura.message;
  if (!atual) return 'o item não foi encontrado no cadastro';
  if (atual.eh_conjunto_instalacao) return 'o Conjunto Elétrico nunca tem número de série';
  const { error } = await supabase.from('cadastro_itens').update({ tem_serial: !!tem }).eq('id', item.id);
  if (error) return error.message;
  logChange({ module: 'cadastro_itens', entityType: 'cadastro_itens', entityId: item.id, changeType: 'UPDATE', oldRow: { tem_serial: !!atual.tem_serial }, newRow: { tem_serial: !!tem }, user });
  return null;
}

/** O modelo de várias OPs de uma vez (o kiting em lote): mapa id da OP → modelo. Uma leitura que falha derruba só o resultado todo (devolve o erro). */
export async function modelosDasOps(ops: any[]): Promise<{ erro: string | null; modelos: Record<string, ModeloSerial[]> }> {
  const rs = await Promise.all((ops || []).map(async o => ({ id: String(o.id), r: await modeloDeSeriais(o.itens_vendidos) })));
  const erro = rs.find(x => x.r.erro)?.r.erro || null;
  return { erro, modelos: Object.fromEntries(rs.map(x => [x.id, x.r.modelo])) };
}

/** Quantos seriais de cada produto já existem (as remessas anteriores), por nome sem acento e sem caixa. */
export function jaSerializadoPorProduto(seriaisItens: any[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const s of seriaisItens || []) { const k = chaveDe(s?.produto); if (k && String(s?.serial || '').trim()) mapa[k] = (mapa[k] || 0) + 1; }
  return mapa;
}

/**
 * As linhas da lista para `unidades` unidades de `totalUnidades` da OP, já descontado o que foi serializado antes (`ja`). Com todas as unidades saindo, é a quantidade vendida
 * de cada item; numa remessa parcial, a parte proporcional (arredondada para cima, e nunca mais que o que falta). `atuais` preserva os seriais já digitados quando a
 * quantidade de unidades muda (o k-ésimo serial de cada produto continua na k-ésima linha dele).
 */
export function linhasDeSerial(modelo: ModeloSerial[], unidades: number, totalUnidades: number, ja: Record<string, number> = {}, atuais: LinhaDeSerial[] = []): LinhaDeSerial[] {
  const total = Math.max(1, Math.floor(totalUnidades) || 1);
  const un = Math.min(total, Math.max(1, Math.floor(unidades) || 1));
  const digitados = new Map<string, string[]>();
  for (const a of atuais || []) { const k = chaveDe(a.produto); digitados.set(k, [...(digitados.get(k) || []), String(a.serial || '')]); }
  const restanteJa = { ...ja };
  const vistos = new Map<string, number>();
  const saida: LinhaDeSerial[] = [];
  for (const m of modelo || []) {
    const k = chaveDe(m.produto);
    const descontado = Math.min(restanteJa[k] || 0, m.qtd);
    restanteJa[k] = (restanteJa[k] || 0) - descontado;
    const falta = m.qtd - descontado;
    const linhas = un >= total ? falta : Math.min(falta, Math.ceil((m.qtd * un) / total));
    for (let i = 0; i < linhas; i++) {
      const n = vistos.get(k) || 0; vistos.set(k, n + 1);
      saida.push({ produto: m.produto, serial: (digitados.get(k) || [])[n] || '', fixo: true });
    }
  }
  return saida;
}
