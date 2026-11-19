// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// EsperaDeMaterial — um desenvolvimento da Engenharia que só pode começar quando chega o material de uma compra da OP
// (pedido do usuário em 28/10/2026: o suporte da barra sinalizadora só é desenvolvido quando chega o rack de teto comprado e a adaptação o põe no lugar).
//
// Desenho decidido com o usuário:
//  • a demanda liga a ITENS de uma OC (e não à OC inteira): vários desenvolvimentos podem esperar itens diferentes da mesma OC, cada um liberado quando o seu chega;
//  • a Logística marca a quantidade que chegou de cada item (tabela `compras_chegadas_itens`), sem mexer no recebimento da OC; a PRIMEIRA unidade já libera;
//    a OC virar "Recebido" também vale como chegada de todos os itens dela;
//  • enquanto falta item, nenhuma etapa inicia; só um gerente libera antes, com motivo;
//  • quem avisa é o banco (gatilho), com a mensagem na caixa de Menções das pessoas escolhidas ao ligar; a tela só LÊ.
// Aqui ficam as regras puras (a conta de cada item e as operações sobre a demanda, que `gravarDemanda` aplica sobre a linha lida agora) e as leituras.
// O estado GUARDADO da espera (aguardando, chegou, liberada) está em DesenvolvimentoModelo.ts (`estadoGuardadoDaEspera`), usado pela trava de início e pelo painel.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { ehGerenteDev, estadoGuardadoDaEspera } from './DesenvolvimentoModelo';
import { lerEntregas, entregasDoPedido, entregasDoItem } from './ComprasEntregas';

export const MAX_ITENS_ESPERA = 20;
export const MAX_AVISAR = 20;

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
/** O mesmo teste de nome que o banco faz (`lower(btrim(...))`): item da OC e item ligado têm que ter o mesmo nome. */
export const mesmoNome = (a: any, b: any) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const copiar = (v: any) => JSON.parse(JSON.stringify(v ?? null));

export type ItemDaOC = { chave: string; nome: string; quantidade: number | null };

/** Os itens de uma OC como a Logística e a Engenharia os enxergam: posição + nome (os itens da OC nem sempre têm código). Pedido antigo, sem lista de itens, é um item só (o material do pedido). */
export function itensDaOC(pedido: any): ItemDaOC[] {
  const lista = Array.isArray(pedido?.itens) ? pedido.itens.filter((i: any) => i && typeof i === 'object') : [];
  if (lista.length) return lista.map((it: any, i: number) => ({ chave: `i${i}`, nome: String(it.nome || it.descricao || `Item ${i + 1}`).trim(), quantidade: num(it.quantidade) }));
  return [{ chave: 'i0', nome: String(pedido?.descricao_material || 'Material da compra').trim(), quantidade: num(pedido?.quantidade_comprada ?? pedido?.quantidade) }];
}

export const numeroDaOC = (p: any) => p?.numero_oc || p?.numero_pedido || '—';

/** A posição do item na OC (0-based, a mesma das vencedoras): a chave é 'i0', 'i1'…; chave de outro formato não tem posição. */
const posicaoDaChave = (chave: any): number | null => { const m = /^i(\d+)$/.exec(String(chave ?? '')); return m ? Number(m[1]) : null; };

/**
 * O item chegou? Três maneiras, nesta ordem: a OC inteira "Recebido"; a chegada marcada pela Logística (mesma chave e mesmo nome, com quantidade); ou — desde a E4, 17/11/2026 —
 * a entrega do FORNECEDOR que traz o item foi recebida (a OC de vários fornecedores só vira "Recebido" quando o último chega, mas o rack do primeiro fornecedor já está aqui).
 * Só a entrega "recebida" vale: com divergência ela segue aberta, e a Logística marca a chegada à mão se o item veio. `chegadas` = linhas de `compras_chegadas_itens`; `linhasEntregas` = linhas de `compras_entregas`.
 * A mesma conta está no banco (`engenharia_item_chegou`), que é quem libera e avisa.
 */
export function chegadaDoItem(pedido: any, chegadas: any[], item: { chave: string; nome: string; quantidade?: number | null }, linhasEntregas: any[] = []) {
  if (pedido?.status_compra === 'Recebido') return { chegou: true, quantidade: item.quantidade ?? null, pelaOC: true, pelaEntrega: null, em: pedido.data_recebimento_real || pedido.data_conclusao || null, por: null };
  const c = (chegadas || []).find((x: any) => String(x.pedido_id) === String(pedido?.id) && x.chave === item.chave && mesmoNome(x.nome, item.nome) && Number(x.quantidade) > 0);
  if (c) return { chegou: true, quantidade: Number(c.quantidade), pelaOC: false, pelaEntrega: null, em: c.em || null, por: c.por || null };
  const pos = posicaoDaChave(item.chave);
  const dela = pos === null ? [] : entregasDoItem(entregasDoPedido(pedido, linhasEntregas), pos);
  if (dela.length && dela.every(e => e.situacao === 'recebida')) {
    const ultima = [...dela].sort((a, b) => String(a.recebida_em || a.data_recebimento_real || '').localeCompare(String(b.recebida_em || b.data_recebimento_real || ''))).pop();
    return { chegou: true, quantidade: item.quantidade ?? null, pelaOC: false, pelaEntrega: dela.map(e => e.fornecedor).join(' e '), em: ultima?.recebida_em || ultima?.data_recebimento_real || null, por: ultima?.recebida_por || null };
  }
  return { chegou: false, quantidade: 0, pelaOC: false, pelaEntrega: null, em: null, por: null };
}

/** A entrega que traz o item (a data e o fornecedor dele): a única que o cobre, ou a mais distante se mais de uma o cobre (cauteloso). Sem entrega, vazio. */
export function entregaQueTrazOItem(pedido: any, linhasEntregas: any[], item: { chave: string }) {
  const pos = posicaoDaChave(item.chave);
  if (pos === null) return null;
  const dela = entregasDoItem(entregasDoPedido(pedido, linhasEntregas), pos).filter(e => e.data_prevista);
  if (!dela.length) return null;
  return [...dela].sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista))).pop();
}

/** A situação de cada item ligado, com o que está lido AGORA: 'chegou', 'aguardando', 'descartada' (a OC foi descartada: nunca vai chegar), 'mudou' (o item não é mais o mesmo na OC) ou 'sumiu' (a OC não foi achada). */
export function situacaoDaEspera(espera: any, pedidos: any[], chegadas: any[], linhasEntregas: any[] = []) {
  const itens = (espera?.itens || []).map((l: any) => {
    const pedido = (pedidos || []).find((p: any) => String(p.id) === String(l.pedido_id));
    if (!pedido) return { ...l, estado: 'sumiu', pedido: null };
    if (pedido.status_compra === 'Descartada') return { ...l, estado: 'descartada', pedido };
    const atual = itensDaOC(pedido).find(i => i.chave === l.chave);
    if (!atual || !mesmoNome(atual.nome, l.nome)) return { ...l, estado: 'mudou', pedido };
    const c = chegadaDoItem(pedido, chegadas, atual, linhasEntregas);
    const entrega = entregaQueTrazOItem(pedido, linhasEntregas, atual);
    return { ...l, estado: c.chegou ? 'chegou' : 'aguardando', pedido, pedida: atual.quantidade, chegada: c, entrega };
  });
  const faltam = itens.filter((i: any) => i.estado !== 'chegou').length;
  return { itens, faltam, todos: itens.length > 0 && faltam === 0 };
}

// ── leituras (leitura recusada devolve `erro`, nunca "vazio") ─────────────────────────────────────────────────────────
const COLUNAS_PEDIDO = 'id,numero_pedido,numero_oc,descricao_material,fornecedor,status_compra,quantidade,quantidade_comprada,itens,opl,vinculo_tipo,vinculo_id,data_prevista_recebimento,prazo_entrega,data_recebimento_real,data_conclusao,data_criacao,vencedoras,vencedora_id,tem_divergencia';

export async function lerEsperaAgora(espera: any) {
  const ids = [...new Set((espera?.itens || []).map((i: any) => String(i.pedido_id)))];
  if (!ids.length) return { pedidos: [], chegadas: [], entregas: [], erro: '' };
  const [a, b, c] = await Promise.all([
    supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO).in('id', ids),
    supabase.from('compras_chegadas_itens').select('pedido_id,chave,nome,quantidade,em,por').in('pedido_id', ids),
    lerEntregas(ids),
  ]);
  const erro = a.error?.message || b.error?.message || c.erro || '';
  return { pedidos: a.data || [], chegadas: b.data || [], entregas: c.linhas, erro };
}

/** As compras que podem ser esperadas por esta demanda: as da OP dela (pelo vínculo e pelo número em texto) ou, na busca, qualquer uma pelo número ou material. Descartada não entra. */
export async function lerComprasParaEspera(demanda: any, busca = '') {
  const idsOp = [demanda?.opl_id, ...(demanda?.opl_ids || [])].filter(Boolean).map(String);
  const vistos = new Map<string, any>();
  const juntar = (lista: any[]) => { for (const p of lista || []) if (p.status_compra !== 'Descartada') vistos.set(String(p.id), p); };
  const t = String(busca || '').trim().replace(/[,()%*"'\\]/g, ' ').trim();
  if (t.length >= 2) {
    const { data, error } = await supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO)
      .or(`numero_oc.ilike.%${t}%,numero_pedido.ilike.%${t}%,descricao_material.ilike.%${t}%`).order('data_criacao', { ascending: false }).limit(30);
    if (error) return { lista: [], erro: error.message };
    juntar(data);
    return { lista: [...vistos.values()], erro: '' };
  }
  if (idsOp.length) {
    const { data, error } = await supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO).eq('vinculo_tipo', 'op').in('vinculo_id', idsOp).order('data_criacao', { ascending: false });
    if (error) return { lista: [], erro: error.message };
    juntar(data);
  }
  if (demanda?.numero_opl) {
    const { data, error } = await supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO).is('vinculo_id', null).eq('opl', demanda.numero_opl).order('data_criacao', { ascending: false });
    if (error) return { lista: [], erro: error.message };
    juntar(data);
  }
  return { lista: [...vistos.values()], erro: '' };
}

/** As chegadas marcadas pela Logística e, desde a E4, as entregas de cada fornecedor dos mesmos pedidos (o item também chega pela entrega recebida). */
export async function lerChegadasDe(ids: string[]) {
  if (!ids.length) return { chegadas: [], entregas: [], erro: '' };
  const [a, b] = await Promise.all([
    supabase.from('compras_chegadas_itens').select('pedido_id,chave,nome,quantidade,em,por').in('pedido_id', ids),
    lerEntregas(ids),
  ]);
  return { chegadas: a.data || [], entregas: b.linhas, erro: a.error?.message || b.erro || '' };
}

/** Quem espera cada OC: as demandas de Desenvolvimento ligadas a ela (a Logística mostra "a Engenharia espera este item"). Mapa pedido_id → demandas. */
export async function lerDemandasQueEsperam(ids?: string[]) {
  const { data, error } = await supabase.from('engenharia_desenvolvimento').select('id,titulo,numero_opl,situacao,espera_material').not('espera_material', 'is', null).or('situacao.is.null,situacao.neq.cancelada');
  if (error) return { mapa: new Map(), erro: error.message };
  const mapa = new Map<string, any[]>();
  for (const d of data || []) {
    if (estadoGuardadoDaEspera(d) === 'sem') continue;
    for (const it of d.espera_material.itens || []) {
      const k = String(it.pedido_id);
      if (ids && !ids.includes(k)) continue;
      mapa.set(k, [...(mapa.get(k) || []), { demanda: d, item: it }]);
    }
  }
  return { mapa, erro: '' };
}

/** Marca (ou desfaz, com quantidade 0) a chegada de um item. Uma linha por item: refazer a marcação troca a quantidade. */
export async function marcarChegada({ pedido_id, chave, nome, quantidade, por }: any) {
  const q = num(quantidade);
  if (q === null || q < 0) return { erro: 'Informe a quantidade que chegou (um número, ou 0 para desfazer).' };
  if (q === 0) {
    const { error } = await supabase.from('compras_chegadas_itens').delete().eq('pedido_id', pedido_id).eq('chave', chave);
    return error ? { erro: error.message } : { ok: true };
  }
  const { error } = await supabase.from('compras_chegadas_itens').upsert({ pedido_id, chave, nome, quantidade: q, em: new Date().toISOString(), por: por || null }, { onConflict: 'pedido_id,chave' });
  return error ? { erro: error.message } : { ok: true };
}

// ── operações sobre a demanda (puras: recebem a linha lida agora, devolvem { erro } ou { patch }) ────────────────────────
const evento = (tipo: string, u: any, texto: string, agora: string) => ({ em: agora, por: u?.nome || '', tipo, etapa: null, texto });
const finalizada = (d: any) => (d?.etapas || []).length > 0 && (d.etapas || []).every((e: any) => e.status === 'concluida');
const ehAbertaParaMudar = (d: any) => d?.situacao === 'cancelada' ? 'A demanda foi cancelada.' : d?.origem === 'pcp' ? 'O pedido do PCP não tem etapas: a espera por material não se aplica.' : '';

/** Liga (ou troca) os itens esperados. `jaChegaram`: true se, lido agora, todos os itens escolhidos já chegaram (a demanda nasce liberada, sem esperar aviso). */
export function ligarItens(d: any, itens: any[], avisar: any[], u: any, jaChegaram: boolean, agora: string) {
  const bloqueio = ehAbertaParaMudar(d); if (bloqueio) return { erro: bloqueio };
  if (finalizada(d)) return { erro: 'A demanda já está concluída: não há o que esperar.' };
  const vistos = new Set<string>();
  const lista = (itens || []).filter(i => i?.pedido_id && i?.chave && String(i.nome || '').trim()).filter(i => { const k = `${i.pedido_id}|${i.chave}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map(i => ({ pedido_id: String(i.pedido_id), chave: String(i.chave), nome: String(i.nome).trim(), numero: String(i.numero || ''), fornecedor: String(i.fornecedor || '') }));
  if (!lista.length) return { erro: 'Escolha pelo menos um item da compra.' };
  if (lista.length > MAX_ITENS_ESPERA) return { erro: `No máximo ${MAX_ITENS_ESPERA} itens por demanda.` };
  const emails = new Set<string>();
  const quem = (avisar || []).filter(p => p?.email).filter(p => { const k = String(p.email).toLowerCase(); if (emails.has(k)) return false; emails.add(k); return true; })
    .slice(0, MAX_AVISAR).map(p => ({ email: String(p.email), nome: String(p.nome || p.email) }));
  const antes = d.espera_material;
  const historico = copiar(d.historico) || [];
  const resumo = lista.map(i => `${i.nome}${i.numero ? ` (${i.numero})` : ''}`).join('; ');
  historico.push(evento('espera_ligada', u, `${antes?.itens?.length ? 'Itens alterados' : 'Esperando'}: ${resumo}${jaChegaram ? '. Todos já chegaram.' : ''}`, agora));
  return { patch: { espera_material: { itens: lista, avisar: quem, ligada_em: antes?.ligada_em || agora, ligada_por: antes?.ligada_por || u?.nome || '', chegou_em: jaChegaram ? agora : null, liberada: null }, historico } };
}

export function retirarEspera(d: any, u: any, motivo: string, agora: string) {
  if (estadoGuardadoDaEspera(d) === 'sem') return { erro: 'Esta demanda não espera material. A tela foi atualizada.' };
  if (d.situacao === 'cancelada') return { erro: 'A demanda foi cancelada.' };
  const m = String(motivo || '').trim();
  if (m.length < 3) return { erro: 'Escreva o motivo de retirar a espera.' };
  const historico = copiar(d.historico) || [];
  historico.push(evento('espera_retirada', u, m, agora));
  return { patch: { espera_material: null, historico } };
}

/** Só Admin ou gerente: libera o desenvolvimento ANTES do material chegar (o projeto pode começar sem a peça). Fica no histórico com o motivo. */
export function liberarEspera(d: any, u: any, motivo: string, agora: string) {
  if (!ehGerenteDev(u)) return { erro: 'Só Admin ou gerente pode liberar antes de o material chegar.' };
  if (estadoGuardadoDaEspera(d) !== 'aguardando') return { erro: 'A demanda já não está esperando material. A tela foi atualizada.' };
  if (d.situacao === 'cancelada') return { erro: 'A demanda foi cancelada.' };
  const m = String(motivo || '').trim();
  if (m.length < 3) return { erro: 'Escreva o motivo da liberação.' };
  const historico = copiar(d.historico) || [];
  historico.push(evento('espera_liberada', u, m, agora));
  return { patch: { espera_material: { ...d.espera_material, liberada: { por: u?.nome || '', em: agora, motivo: m } }, historico } };
}
