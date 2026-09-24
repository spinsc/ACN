// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE — controle ligado item a item, para adotar aos poucos
//
// Regra definida com o usuário em 24/09/2026. O cadastro tem 4.436 itens e
// contar todos de uma vez é impossível, então o controle é OPT-IN: só vale
// para o item com `controla_estoque` marcado. Numa OP com 20 itens, se 2
// estiverem marcados, só esses 2 dão baixa, conferem mínimo e podem travar —
// os outros 18 seguem o fluxo de sempre. Assim dá para contar o estoque
// começando pelos mais usados e testar a compra automática com pouco volume,
// sem parar a fábrica por causa de item que ainda não foi contado.
//
// Quem mexe no saldo é SEMPRE a função `estoque_movimentar` no banco, nunca a
// tela: ler o saldo, somar e gravar de volta perde movimentação quando duas
// pessoas dão baixa ao mesmo tempo. A função trava a linha do item, grava
// saldo e extrato juntos, ignora item sem controle e ainda devolve se caiu
// abaixo do mínimo e quanto comprar para repor.
//
// Reposição: mínimo dispara, ideal diz até onde repor. Mínimo 10, ideal 50,
// saldo caiu para 8 → pede 42. Evita pedir de novo na semana seguinte.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { ehAdminOuGerente } from './utils/permissoes';
import { normalizarBusca, combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import { criarRequisicaoCompra } from './ComprasFluxo';
import { SelectBusca, MenuAcoes } from './Interface';
import { mdiPencilOutline, mdiCloseCircleOutline } from '@mdi/js';

/** Requisição de reposição aberta = ainda não virou material na prateleira.
 *  'Concluído' era o nome antigo de 'Recebido' e foi unificado em 24/09/2026
 *  (código e os 5 registros que restavam). Continua na lista de propósito: se
 *  algum caminho esquecido voltar a gravar o nome velho, o pior que acontece é
 *  o item não pedir reposição nunca mais — e isso falharia em silêncio. */
const COMPRA_ENCERRADA = ['Recebido', 'Concluído', 'Descartada'];

/** Quem conta é quem tem o material na mão: o Almoxarifado, mais a gerência. */
export const podeGerirEstoque = (u: any) =>
  String(u?.perfil || '').trim() === 'Almoxarifado' || ehAdminOuGerente(u);

/** De onde veio o movimento. Texto curto, aparece no extrato. */
export const MOTIVO = {
  CONTAGEM: 'contagem',
  KITING: 'kiting',
  RETIRADA: 'retirada',
  COMPRA_RECEBIDA: 'compra_recebida',
  AJUSTE: 'ajuste',
};

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const fmtQtd = (v: any) => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
};

/**
 * Abre a requisição de reposição — ou não abre, se já existe uma em aberto.
 *
 * A trava contra repetição é essencial: sem ela, cada saída abaixo do mínimo
 * empilharia um pedido novo do mesmo item, e o Compras acordaria com vinte
 * requisições do mesmo parafuso. Uma requisição aberta já significa "material
 * a caminho"; só depois de recebida (ou descartada) é que cabe pedir de novo.
 */
export async function garantirRequisicaoReposicao({ item, quantidade, saldo, currentUser }: any) {
  const { data: abertas } = await supabase.from('pcp_pedidos_compra')
    .select('id,numero_pedido,status_compra')
    .eq('vinculo_tipo', 'estoque').eq('vinculo_id', String(item.id))
    .not('status_compra', 'in', `(${COMPRA_ENCERRADA.map(s => `"${s}"`).join(',')})`);
  if (abertas?.length) {
    return { jaExistia: true, numero_pedido: abertas[0].numero_pedido, status: abertas[0].status_compra };
  }

  const qtd = Math.max(1, Math.ceil(num(quantidade)));
  const r = await criarRequisicaoCompra({
    titulo: `Reposição de estoque — ${item.nome}`,
    descricao: `Saldo chegou a ${fmtQtd(saldo)} ${item.unidade || 'UN'}, no mínimo de ${fmtQtd(item.estoque_minimo)}.`
      + (item.estoque_ideal != null ? ` Pedido para repor até o ideal de ${fmtQtd(item.estoque_ideal)}.` : ''),
    itens: [{ nome: item.nome, quantidade: qtd, descricao: item.codigo || '' }],
    observacoes: 'Requisição aberta automaticamente pelo controle de estoque — ninguém digitou.',
    vinculo: { tipo: 'estoque', id: item.id, descricao: `${item.codigo ? item.codigo + ' · ' : ''}${item.nome}` },
    origemSetor: 'Estoque (automático)',
    currentUser,
  });
  if (r?.erro) return { erro: r.erro };
  return { criada: true, numero_pedido: r.numero_pedido, quantidade: qtd };
}

/**
 * Credita o estoque quando a compra chega.
 *
 * Entra a quantidade REALMENTE recebida, não a pedida: a requisição automática
 * pode ter pedido 100 e o Compras ter sido autorizado a comprar 50, ou ter
 * comprado 200 por causa do lote do fornecedor. Quem manda é o que desceu do
 * caminhão (regra do usuário em 24/09/2026).
 *
 * Só vale para requisição de reposição (vinculo_tipo 'estoque'), porque é ela
 * que sabe a qual item pertence. Compra de OP ou geral não credita nada — a
 * lista dela é texto livre e adivinhar o item seria pior que não creditar.
 *
 * Se mesmo com a entrada o saldo continuar no mínimo (comprou 50 dos 100 que
 * faltavam), a própria movimentação abre uma requisição nova — que é o certo.
 */
export async function creditarCompraRecebida({ pedido, quantidade, currentUser }: any) {
  if (pedido?.vinculo_tipo !== 'estoque' || !pedido?.vinculo_id) return { naoSeAplica: true };
  const qtd = num(quantidade);
  if (qtd <= 0) return { naoSeAplica: true, motivo: 'Sem quantidade recebida.' };

  const r = await movimentarEstoque({
    itemId: pedido.vinculo_id, tipo: 'entrada', quantidade: qtd,
    motivo: MOTIVO.COMPRA_RECEBIDA,
    observacoes: `Recebimento do pedido ${pedido.numero_pedido || pedido.numero_oc || '—'}`
      + (num(pedido.quantidade) !== qtd ? ` — pedido de ${fmtQtd(pedido.quantidade)}, recebido ${fmtQtd(qtd)}.` : ''),
    vinculo: { tipo: 'compra', id: pedido.id, descricao: pedido.numero_pedido || pedido.numero_oc || 'Pedido de compra' },
    currentUser,
  });
  return r;
}

/**
 * Único caminho para mexer no estoque — chama a função do banco.
 * Devolve o que ela responder:
 *   { ignorado: true }  → item sem controle, nada aconteceu (é o esperado)
 *   { ok: true, saldo_depois, abaixo_do_minimo, sugestao_compra, negativo }
 *   { erro: '...' }
 */
export async function movimentarEstoque({
  itemId, tipo, quantidade, motivo = null, observacoes = null,
  vinculo = null, retiradoPor = null, currentUser = null,
}: any) {
  if (!itemId) return { ignorado: true, motivo: 'Sem item cadastrado.' };
  const { data, error } = await supabase.rpc('estoque_movimentar', {
    p_item_id: itemId,
    p_tipo: tipo,
    p_quantidade: num(quantidade),
    p_motivo: motivo,
    p_observacoes: observacoes,
    p_vinculo_tipo: vinculo?.tipo || null,
    p_vinculo_id: vinculo?.id ? String(vinculo.id) : null,
    p_vinculo_descricao: vinculo?.descricao || null,
    p_retirado_por_nome: retiradoPor || null,
    p_criado_por: currentUser?.email || null,
    p_criado_por_nome: currentUser?.nome || null,
  });
  if (error) return { erro: error.message };
  const r = data || { erro: 'Resposta vazia do banco.' };

  // A compra automática mora aqui dentro de propósito: assim toda saída que
  // fura o mínimo pede reposição, venha ela do kiting, do balcão ou de uma
  // contagem que revelou menos do que se pensava. Nenhuma tela pode esquecer.
  if (r.ok && r.abaixo_do_minimo && num(r.sugestao_compra) > 0) {
    const { data: item } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,unidade,estoque_minimo,estoque_ideal').eq('id', itemId).maybeSingle();
    if (item) {
      r.requisicao = await garantirRequisicaoReposicao({
        item, quantidade: r.sugestao_compra, saldo: r.saldo_depois, currentUser,
      });
    }
  }
  return r;
}

/**
 * Baixa do kit de uma OP, a partir das linhas da conferência.
 *
 * Baixa a DIFERENÇA, não o valor cheio: o kit é conferido mais de uma vez
 * quando sai "liberado com pendência" e a pendência é sanada depois, e baixar
 * tudo de novo contaria o material duas vezes. Então soma o que esta OP já
 * consumiu no extrato e movimenta só o que falta — se a conferência diminuiu
 * (material voltou para a prateleira), devolve ao estoque.
 *
 * Linha sem `item_id` (item fora do cadastro) e item sem controle passam
 * batido, de propósito: é o controle progressivo combinado em 24/09/2026.
 */
/** Quanto cada item desta OP já saiu do estoque, pelo extrato. */
async function jaBaixadoNaOp(oplId: string) {
  const { data } = await supabase.from('estoque_movimentos')
    .select('item_id,tipo,quantidade')
    .eq('vinculo_tipo', 'op').eq('vinculo_id', String(oplId)).eq('motivo', MOTIVO.KITING);
  const mapa = new Map<string, number>();
  (data || []).forEach((m: any) => {
    const sinal = m.tipo === 'saida' ? 1 : -1;
    mapa.set(m.item_id, (mapa.get(m.item_id) || 0) + sinal * num(m.quantidade));
  });
  return mapa;
}

/**
 * Itens controlados que não têm saldo para o que o kit ainda precisa tirar.
 *
 * Olha a DIFERENÇA, pelo mesmo motivo da baixa: conferir de novo um kit já
 * baixado não pede material nenhum, e acusar falta aí seria mentira.
 * Devolve [] quando está tudo certo — inclusive quando não há item controlado.
 */
export async function faltaDeEstoqueNoKit({ opl, linhas }: any) {
  const comItem = (linhas || []).filter((l: any) => l?.item_id);
  if (!comItem.length) return [];
  const { data: itens } = await supabase.from('cadastro_itens')
    .select('id,codigo,nome,unidade,estoque_atual,controla_estoque')
    .in('id', comItem.map((l: any) => l.item_id));
  const controlados = new Map((itens || []).filter((i: any) => i.controla_estoque).map((i: any) => [i.id, i]));
  if (!controlados.size) return [];

  const jaBaixado = await jaBaixadoNaOp(opl.id);
  const faltando: any[] = [];
  for (const l of comItem) {
    const item: any = controlados.get(l.item_id);
    if (!item) continue;                                   // sem controle: passa batido
    const precisa = num(l.separado) - (jaBaixado.get(l.item_id) || 0);
    const saldo = num(item.estoque_atual);
    if (precisa > saldo) {
      faltando.push({ nome: item.nome, codigo: item.codigo, unidade: item.unidade,
        precisa, saldo, falta: precisa - saldo });
    }
  }
  return faltando;
}

/** Texto do que falta, para a mensagem da trava. */
export const textoFaltaEstoque = (faltando: any[]) =>
  (faltando || []).map(f => `• ${f.codigo ? f.codigo + ' — ' : ''}${f.nome}: precisa de ${fmtQtd(f.precisa)}, tem ${fmtQtd(f.saldo)} ${f.unidade || 'UN'} (faltam ${fmtQtd(f.falta)})`).join('\n');

export async function baixarKitDaOp({ opl, linhas, currentUser }: any) {
  const resumo = { movimentados: [] as any[], ignorados: 0, semCadastro: 0, negativos: [] as any[], erros: [] as string[], requisicoes: [] as any[] };
  const comItem = (linhas || []).filter((l: any) => l?.item_id);
  resumo.semCadastro = (linhas || []).length - comItem.length;
  if (!comItem.length) return resumo;

  const jaBaixado = await jaBaixadoNaOp(opl.id);
  const vinculo = { tipo: 'op', id: opl.id, descricao: `OP ${opl.opl}` };
  for (const l of comItem) {
    const delta = num(l.separado) - (jaBaixado.get(l.item_id) || 0);
    if (delta === 0) continue;
    const r = await movimentarEstoque({
      itemId: l.item_id,
      tipo: delta > 0 ? 'saida' : 'entrada',
      quantidade: Math.abs(delta),
      motivo: MOTIVO.KITING,
      observacoes: delta < 0 ? 'Devolução: a conferência do kit diminuiu.' : null,
      vinculo, currentUser,
    });
    if (r?.erro) { resumo.erros.push(`${l.nome}: ${r.erro}`); continue; }
    if (r?.ignorado) { resumo.ignorados++; continue; }
    resumo.movimentados.push({ nome: l.nome, delta, ...r });
    if (r?.negativo) resumo.negativos.push({ nome: l.nome, saldo: r.saldo_depois });
    if (r?.requisicao?.criada) resumo.requisicoes.push({ nome: l.nome, ...r.requisicao });
  }
  return resumo;
}

/** Frase curta do que a baixa fez, para o aviso na tela. '' quando não houve nada. */
export function textoDaBaixa(resumo: any) {
  if (!resumo) return '';
  const partes: string[] = [];
  if (resumo.movimentados?.length) partes.push(`${resumo.movimentados.length} item(ns) deram baixa no estoque`);
  if (resumo.ignorados) partes.push(`${resumo.ignorados} sem controle (seguiram normal)`);
  if (resumo.negativos?.length) partes.push(`⚠️ saldo negativo em: ${resumo.negativos.map((n: any) => n.nome).join(', ')}`);
  if (resumo.requisicoes?.length) partes.push(`reposição pedida ao Compras: ${resumo.requisicoes.map((r: any) => `${r.nome} (${r.numero_pedido})`).join(', ')}`);
  if (resumo.erros?.length) partes.push(`erro em: ${resumo.erros.join(' · ')}`);
  return partes.join(' · ');
}

/** Carrega os itens que estão sob controle, com saldo e mínimo. */
export async function carregarItensControlados() {
  const { data } = await supabase.from('cadastro_itens')
    .select('id,codigo,nome,unidade,estoque_atual,estoque_minimo,estoque_ideal,ativo')
    .eq('controla_estoque', true).order('nome');
  return data || [];
}

/** Situação do item: só para pintar a tela, a conta que vale é a do banco. */
export function situacaoEstoque(item: any) {
  const saldo = num(item?.estoque_atual);
  const minimo = item?.estoque_minimo == null ? null : num(item.estoque_minimo);
  if (saldo < 0) return { chave: 'negativo', texto: 'saldo negativo', cor: '#b91c1c', fundo: '#fee2e2' };
  if (saldo === 0) return { chave: 'zerado', texto: 'sem saldo', cor: '#b91c1c', fundo: '#fee2e2' };
  if (minimo != null && saldo <= minimo) return { chave: 'abaixo', texto: 'abaixo do mínimo', cor: '#b45309', fundo: '#fef3c7' };
  return { chave: 'ok', texto: 'ok', cor: '#15803d', fundo: '#dcfce7' };
}

/** Selo de saldo, para as telas que mostram item controlado. */
export function SeloEstoque({ item, compacto = false }: any) {
  if (!item?.controla_estoque) return null;
  const s = situacaoEstoque(item);
  return (
    <span title={`Saldo ${fmtQtd(item.estoque_atual)}${item.estoque_minimo != null ? ` · mínimo ${fmtQtd(item.estoque_minimo)}` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: s.fundo, color: s.cor,
        fontSize: compacto ? 8.5 : 9.5, fontWeight: 800, padding: '1px 7px', borderRadius: 9, whiteSpace: 'nowrap' }}>
      📦 {fmtQtd(item.estoque_atual)} {item.unidade || 'UN'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS NO CADASTRO DO ITEM — o checkbox que liga tudo
// ─────────────────────────────────────────────────────────────────────────────
export function CamposEstoqueItem({ form, set, currentUser }: any) {
  const pode = podeGerirEstoque(currentUser);
  const ligado = !!form.controla_estoque;
  const inp = { width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
    fontSize: 11, boxSizing: 'border-box' as const, fontFamily: 'inherit' };
  const lbl = { fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 };

  return (
    <div style={{ marginBottom: 10, background: ligado ? '#f0fdf4' : '#f8fafc',
      border: `1px solid ${ligado ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 6, padding: '9px 11px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: pode ? 'pointer' : 'not-allowed',
        fontSize: 11, fontWeight: 700, color: ligado ? '#15803d' : '#334155', opacity: pode ? 1 : .6 }}>
        <input type="checkbox" checked={ligado} disabled={!pode}
          onChange={e => set('controla_estoque', e.target.checked)} style={{ cursor: pode ? 'pointer' : 'not-allowed' }} />
        📦 Controlar o estoque deste item
      </label>
      <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
        {ligado
          ? 'Ligado: este item dá baixa quando sai, confere o mínimo, pede compra sozinho quando falta e trava a liberação se não houver saldo.'
          : 'Desligado: o item circula normalmente, sem baixa, sem mínimo e sem travar nada. Ligue só depois de contar o que existe na prateleira.'}
      </div>
      {!pode && (
        <div style={{ fontSize: 9, color: '#b45309', marginTop: 3 }}>
          Só o Almoxarifado e a gerência ligam ou desligam o controle.
        </div>
      )}

      {ligado && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 9 }}>
          <div>
            <div style={lbl}>Saldo atual</div>
            <div style={{ ...inp, background: '#f1f5f9', color: '#475569', fontWeight: 700 }}>
              {fmtQtd(form.estoque_atual)} {form.unidade || 'UN'}
            </div>
            <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 2 }}>
              muda só por contagem, baixa ou entrada — não se digita aqui
            </div>
          </div>
          <div>
            <div style={lbl}>Estoque mínimo</div>
            <input type="number" min={0} step="any" style={inp} value={form.estoque_minimo ?? ''}
              disabled={!pode} onChange={e => set('estoque_minimo', e.target.value)} placeholder="ex.: 10" />
            <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 2 }}>quando chegar aqui, pede compra</div>
          </div>
          <div>
            <div style={lbl}>Estoque ideal</div>
            <input type="number" min={0} step="any" style={inp} value={form.estoque_ideal ?? ''}
              disabled={!pode} onChange={e => set('estoque_ideal', e.target.value)} placeholder="ex.: 50" />
            <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 2 }}>até onde repor na compra</div>
          </div>
        </div>
      )}
      {ligado && form.estoque_minimo != null && form.estoque_ideal != null
        && num(form.estoque_ideal) > 0 && num(form.estoque_ideal) <= num(form.estoque_minimo) && (
        <div style={{ fontSize: 9, color: '#b91c1c', marginTop: 6, fontWeight: 700 }}>
          ⚠️ O ideal precisa ser maior que o mínimo, senão a compra automática pede zero.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RETIRADA — alguém veio pedir material no balcão
//
// A lista é do que saiu, com quantidade e quem levou. Só aparecem itens sob
// controle: item sem controle não tem saldo para baixar, e registrar a saída
// dele aqui criaria um extrato que não movimenta nada — meia verdade pior que
// silêncio. Para passar a controlar um item, use o painel de estoque.
// ─────────────────────────────────────────────────────────────────────────────
const linhaRetiradaVazia = () => ({ item: null, quantidade: '' });

export function ModalRetirada({ currentUser, onClose, onFeito }: any) {
  const [linhas, setLinhas] = useState<any[]>([linhaRetiradaVazia()]);
  const [quemRetirou, setQuemRetirou] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [disponiveis, setDisponiveis] = useState<any[]>([]);

  useEffect(() => { carregarItensControlados().then(setDisponiveis); }, []);

  const set = (i: number, patch: any) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const preenchidas = linhas.filter(l => l.item && num(l.quantidade) > 0);

  const gravar = async () => {
    if (!quemRetirou.trim()) { alert('Informe quem retirou o material.'); return; }
    if (!preenchidas.length) { alert('Informe ao menos um item e a quantidade.'); return; }
    setSalvando(true);
    const falhas: string[] = [];
    const negativos: string[] = [];
    const pedidos: string[] = [];
    for (const l of preenchidas) {
      const r = await movimentarEstoque({
        itemId: l.item.id, tipo: 'saida', quantidade: l.quantidade,
        motivo: MOTIVO.RETIRADA, observacoes: observacoes.trim() || null,
        retiradoPor: quemRetirou.trim(), currentUser,
      });
      if (r?.erro) falhas.push(`${l.item.nome}: ${r.erro}`);
      else if (r?.negativo) negativos.push(`${l.item.nome} (saldo ${fmtQtd(r.saldo_depois)})`);
      if (r?.requisicao?.criada) pedidos.push(`${l.item.nome}: ${fmtQtd(r.requisicao.quantidade)} (${r.requisicao.numero_pedido})`);
    }
    setSalvando(false);
    if (falhas.length) { alert('Nem tudo foi registrado:\n' + falhas.join('\n')); return; }
    const avisos = [
      negativos.length ? `Ficou com saldo negativo em:\n${negativos.join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.` : '',
      pedidos.length ? `O estoque bateu no mínimo e a reposição foi pedida ao Compras sozinha:\n${pedidos.join('\n')}` : '',
    ].filter(Boolean);
    if (avisos.length) alert('Retirada registrada.\n\n' + avisos.join('\n\n'));
    onFeito?.();
    onClose();
  };

  const inp = { width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
    fontSize: 11, boxSizing: 'border-box' as const, fontFamily: 'inherit' };

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }}>
      <div className="modal-box" style={{ maxWidth: 620, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">📤 Registrar retirada de material</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Só aparecem itens sob controle de estoque. O que não está sob controle sai como sempre, sem registro.
        </div>

        <label className="acn-label">Quem retirou *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 10 }} value={quemRetirou} autoFocus
          onChange={e => setQuemRetirou(e.target.value)} placeholder="Nome de quem levou o material" />

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {linhas.map((l, i) => {
            const saldo = l.item ? num(l.item.estoque_atual) : null;
            const pedido = num(l.quantidade);
            const passaDoSaldo = l.item && pedido > saldo;
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 3 }}>
                  {/* select com busca: hoje são poucos itens sob controle, mas o
                      cadastro tem 4.436 e a lista vai crescer — rolar não serve,
                      tem que dar para digitar (pedido de 24/09/2026) */}
                  <SelectBusca
                    valor={l.item?.id || ''}
                    onChange={(v: string) => set(i, { item: disponiveis.find(d => d.id === v) || null })}
                    placeholder="— escolha o item —" vazio="— nenhum item —"
                    opcoes={disponiveis.map(d => ({
                      valor: d.id,
                      rotulo: `${d.codigo ? d.codigo + ' · ' : ''}${d.nome}`,
                      detalhe: `saldo ${fmtQtd(d.estoque_atual)} ${d.unidade || 'UN'}`,
                      busca: [d.codigo, d.nome],
                    }))} />
                  {passaDoSaldo && (
                    <div style={{ fontSize: 9, color: '#b45309', marginTop: 2 }}>
                      Pedido maior que o saldo ({fmtQtd(saldo)}): o saldo vai ficar negativo.
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input type="number" min={0} step="any" style={inp} value={l.quantidade}
                    onChange={e => set(i, { quantidade: e.target.value })} placeholder="Qtd" />
                </div>
                <button onClick={() => setLinhas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [linhaRetiradaVazia()])}
                  title="Remover linha"
                  style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}>✕</button>
              </div>
            );
          })}
          <button onClick={() => setLinhas(ls => [...ls, linhaRetiradaVazia()])}
            style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', border: '1px dashed #cbd5e1', borderRadius: 4, background: '#fff', color: '#475569', cursor: 'pointer' }}>
            ＋ Mais um item
          </button>
        </div>

        <label className="acn-label" style={{ marginTop: 10 }}>Observação</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 10 }} value={observacoes}
          onChange={e => setObservacoes(e.target.value)} placeholder="Ex.: para a manutenção da prensa" />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1, opacity: salvando ? .6 : 1 }}
            disabled={salvando} onClick={gravar}>
            {salvando ? 'Registrando...' : `Registrar retirada (${preenchidas.length} item${preenchidas.length === 1 ? '' : 's'})`}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO ALMOXARIFADO — os itens sob controle e a contagem
// ─────────────────────────────────────────────────────────────────────────────
export function PainelEstoque({ currentUser }: any) {
  const [itens, setItens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [contando, setContando] = useState<any>(null);   // item em contagem
  const [valorContagem, setValorContagem] = useState('');
  const [obsContagem, setObsContagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [procurarNovo, setProcurarNovo] = useState('');
  const [achados, setAchados] = useState<any[]>([]);
  const [retirando, setRetirando] = useState(false);
  const [definindo, setDefinindo] = useState<any>(null);   // item ajustando mínimo/ideal
  const [formLimites, setFormLimites] = useState({ minimo: '', ideal: '' });
  const [movimentos, setMovimentos] = useState<any[]>([]);
  const [verExtrato, setVerExtrato] = useState(false);
  const pode = podeGerirEstoque(currentUser);

  const recarregar = async () => {
    setCarregando(true);
    setItens(await carregarItensControlados());
    const { data } = await supabase.from('estoque_movimentos')
      .select('id,item_nome,tipo,quantidade,saldo_depois,motivo,retirado_por_nome,vinculo_descricao,criado_por_nome,criado_em')
      .order('criado_em', { ascending: false }).limit(15);
    setMovimentos(data || []);
    setCarregando(false);
  };
  useEffect(() => { recarregar(); }, []);

  // busca no cadastro inteiro para COLOCAR um item sob controle — é assim que
  // o controle cresce aos poucos, um item de cada vez
  useEffect(() => {
    const t = setTimeout(async () => {
      const termo = procurarNovo.trim();
      if (termo.length < 3) { setAchados([]); return; }
      const { data } = await supabase.from('cadastro_itens')
        .select('id,codigo,nome,unidade,controla_estoque')
        .eq('ativo', true).eq('controla_estoque', false)
        .or(`nome_norm.ilike.%${normalizarBusca(termo)}%,codigo_norm.ilike.%${normalizarBusca(termo)}%`)
        .limit(8);
      setAchados(data || []);
    }, 350);
    return () => clearTimeout(t);
  }, [procurarNovo]);

  const ligarControle = async (item: any) => {
    if (!await confirmar(`Colocar "${item.nome}" sob controle de estoque?\n\nEle começa com saldo zero — conte a prateleira logo em seguida, senão a primeira saída já vai acusar falta.`)) return;
    await supabase.from('cadastro_itens').update({ controla_estoque: true }).eq('id', item.id);
    setProcurarNovo(''); setAchados([]);
    recarregar();
  };

  const abrirLimites = (item: any) => {
    setFormLimites({ minimo: item.estoque_minimo ?? '', ideal: item.estoque_ideal ?? '' });
    setDefinindo(item);
  };

  const gravarLimites = async () => {
    const min = formLimites.minimo === '' ? null : num(formLimites.minimo);
    const ideal = formLimites.ideal === '' ? null : num(formLimites.ideal);
    if (min != null && ideal != null && ideal <= min) {
      alert('O ideal precisa ser maior que o mínimo, senão a compra automática pediria zero.');
      return;
    }
    const { error } = await supabase.from('cadastro_itens')
      .update({ estoque_minimo: min, estoque_ideal: ideal }).eq('id', definindo.id);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    setDefinindo(null);
    recarregar();
  };

  /** Desligar o controle não apaga o saldo: se o item voltar para o controle
   *  depois, o número anterior continua lá — mas provavelmente estará velho,
   *  e por isso o aviso pede uma contagem na volta. */
  const desabilitarControle = async (item: any) => {
    if (!await confirmar(
      `Tirar "${item.nome}" do controle de estoque?\n\n` +
      `Ele volta a circular como qualquer outro item: não dá mais baixa, não confere mínimo, ` +
      `não pede compra sozinho e não trava liberação.\n\n` +
      `O saldo de ${fmtQtd(item.estoque_atual)} e o extrato ficam guardados. Se um dia voltar ao controle, ` +
      `conte a prateleira antes de confiar nesse número.`)) return;
    const { error } = await supabase.from('cadastro_itens')
      .update({ controla_estoque: false }).eq('id', item.id);
    if (error) { alert('Não foi possível desabilitar: ' + error.message); return; }
    recarregar();
  };

  const gravarContagem = async () => {
    if (valorContagem === '' || Number(valorContagem) < 0) { alert('Informe a quantidade contada.'); return; }
    setSalvando(true);
    const r = await movimentarEstoque({
      itemId: contando.id, tipo: 'contagem', quantidade: valorContagem,
      motivo: MOTIVO.CONTAGEM, observacoes: obsContagem.trim() || null, currentUser,
    });
    setSalvando(false);
    if (r?.erro) { alert('Não foi possível gravar a contagem: ' + r.erro); return; }
    if (r?.ignorado) { alert('Este item não está sob controle de estoque.'); return; }
    // contagem que revela menos do que se pensava também pede reposição
    if (r?.requisicao?.criada) {
      alert(`Contagem gravada. O saldo ficou em ${fmtQtd(r.saldo_depois)}, no mínimo ou abaixo dele, então a reposição de ${fmtQtd(r.requisicao.quantidade)} foi pedida ao Compras sozinha (${r.requisicao.numero_pedido}).`);
    } else if (r?.requisicao?.jaExistia) {
      alert(`Contagem gravada. O saldo está no mínimo, mas já existe uma reposição em aberto no Compras (${r.requisicao.numero_pedido}), então nenhum pedido novo foi criado.`);
    }
    setContando(null); setValorContagem(''); setObsContagem('');
    recarregar();
  };

  const lista = itens.filter(i => combinaBusca([i.nome, i.codigo], busca));
  const abaixo = itens.filter(i => ['abaixo', 'zerado', 'negativo'].includes(situacaoEstoque(i).chave));

  return (
    <div className="sec-card" style={{ marginTop: 12 }}>
      <div className="sec-hdr" style={{ background: '#f0fdf4', borderBottom: '2px solid #16a34a' }}>
        <span style={{ color: '#15803d' }}>📦 Estoque sob controle ({itens.length})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {abaixo.length > 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 10 }}>
              {abaixo.length} precisando de reposição
            </span>
          )}
          {pode && itens.length > 0 && (
            <button onClick={e => { e.stopPropagation(); setRetirando(true); }}
              title="Registrar o que alguém veio buscar no balcão"
              style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', border: 'none', borderRadius: 4, background: '#0f766e', color: '#fff', cursor: 'pointer' }}>
              📤 Registrar retirada
            </button>
          )}
        </div>
      </div>
      <div className="sec-body">
        <div style={{ fontSize: 10, color: '#166534', marginBottom: 8 }}>
          Só os itens desta lista têm controle. Os demais circulam normalmente, sem baixa e sem travar nada —
          é assim que dá para contar a prateleira aos poucos, começando pelos itens mais usados.
        </div>

        {pode && (
          <div style={{ marginBottom: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              ＋ Colocar mais um item sob controle
            </div>
            <input value={procurarNovo} onChange={e => setProcurarNovo(e.target.value)}
              placeholder="Procure pelo nome ou código do item (3 letras ou mais)"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
            {achados.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 10.5, flex: 1 }}>
                  {a.codigo ? <b>{a.codigo}</b> : null} {a.nome}
                </span>
                <button onClick={() => ligarControle(a)}
                  style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none', borderRadius: 4, background: '#16a34a', color: '#fff', cursor: 'pointer' }}>
                  Controlar
                </button>
              </div>
            ))}
          </div>
        )}

        {itens.length > 6 && (
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar a lista..."
            style={{ width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, marginBottom: 8, boxSizing: 'border-box' }} />
        )}

        {carregando ? (
          <div className="acn-empty">Carregando...</div>
        ) : !itens.length ? (
          <div className="acn-empty">
            Nenhum item sob controle ainda. Comece pelos que mais saem — um ou dois já bastam para testar o caminho inteiro.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                {['Código', 'Item', 'Saldo', 'Mínimo', 'Ideal', 'Situação', ''].map(h => (
                  <th key={h} style={{ padding: '4px 7px', fontSize: 9, fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(i => {
                const s = situacaoEstoque(i);
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>{i.codigo || '—'}</td>
                    <td style={{ padding: '4px 7px' }}>{i.nome}</td>
                    <td style={{ padding: '4px 7px', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtQtd(i.estoque_atual)} {i.unidade || 'UN'}</td>
                    <td style={{ padding: '4px 7px', color: '#64748b' }}>{i.estoque_minimo == null ? '—' : fmtQtd(i.estoque_minimo)}</td>
                    <td style={{ padding: '4px 7px', color: '#64748b' }}>{i.estoque_ideal == null ? '—' : fmtQtd(i.estoque_ideal)}</td>
                    <td style={{ padding: '4px 7px' }}>
                      <span style={{ background: s.fundo, color: s.cor, fontSize: 8.5, fontWeight: 800, padding: '1px 7px', borderRadius: 9, whiteSpace: 'nowrap' }}>
                        {s.texto}
                      </span>
                    </td>
                    <td style={{ padding: '4px 7px', textAlign: 'right' }}>
                      {pode && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setContando(i); setValorContagem(String(i.estoque_atual ?? '')); setObsContagem(''); }}
                            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', color: '#334155', cursor: 'pointer' }}>
                            Contar
                          </button>
                          <MenuAcoes itens={[
                            { rotulo: 'Definir mínimo e ideal', icone: mdiPencilOutline, onClick: () => abrirLimites(i) },
                            { rotulo: 'Tirar do controle de estoque', icone: mdiCloseCircleOutline, perigo: true,
                              onClick: () => desabilitarControle(i) },
                          ]} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* extrato recente: é o que dá confiança de que o saldo não muda sozinho */}
        {movimentos.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
            <button onClick={() => setVerExtrato(v => !v)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 9.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
              {verExtrato ? '▾' : '▸'} Últimos movimentos ({movimentos.length})
            </button>
            {verExtrato && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 6 }}>
                <tbody>
                  {movimentos.map(m => {
                    const sinal = m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : '=';
                    const cor = m.tipo === 'saida' ? '#b91c1c' : m.tipo === 'entrada' ? '#15803d' : '#475569';
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '3px 6px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '3px 6px' }}>{m.item_nome}</td>
                        <td style={{ padding: '3px 6px', fontWeight: 800, color: cor, whiteSpace: 'nowrap' }}>
                          {sinal}{fmtQtd(m.quantidade)}
                        </td>
                        <td style={{ padding: '3px 6px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          saldo {fmtQtd(m.saldo_depois)}
                        </td>
                        <td style={{ padding: '3px 6px', color: '#64748b' }}>
                          {m.motivo === MOTIVO.RETIRADA && m.retirado_por_nome ? `retirada — ${m.retirado_por_nome}`
                            : m.motivo === MOTIVO.KITING ? `kiting — ${m.vinculo_descricao || ''}`
                            : m.motivo === MOTIVO.CONTAGEM ? `contagem — ${m.criado_por_nome || ''}`
                            : m.motivo || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {retirando && (
        <ModalRetirada currentUser={currentUser} onClose={() => setRetirando(false)} onFeito={recarregar} />
      )}

      {definindo && (
        <div className="modal-overlay" style={{ zIndex: 2100 }}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-title">🎯 Mínimo e ideal — {definindo.nome}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
              O mínimo é onde a compra dispara. O ideal é até onde repor: o pedido é a diferença entre
              o saldo e o ideal, para não pedir de novo na semana seguinte.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="acn-label">Estoque mínimo</label>
                <input type="number" min={0} step="any" autoFocus className="acn-input" style={{ width: '100%' }}
                  value={formLimites.minimo} onChange={e => setFormLimites(f => ({ ...f, minimo: e.target.value }))}
                  placeholder="ex.: 10" />
              </div>
              <div>
                <label className="acn-label">Estoque ideal</label>
                <input type="number" min={0} step="any" className="acn-input" style={{ width: '100%' }}
                  value={formLimites.ideal} onChange={e => setFormLimites(f => ({ ...f, ideal: e.target.value }))}
                  placeholder="ex.: 50" />
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', margin: '8px 0 10px' }}>
              Saldo de hoje: <b>{fmtQtd(definindo.estoque_atual)} {definindo.unidade || 'UN'}</b>.
              {formLimites.minimo !== '' && formLimites.ideal !== '' && num(formLimites.ideal) > num(formLimites.minimo) && (
                <> Batendo o mínimo, o pedido sairia com {fmtQtd(Math.max(num(formLimites.ideal) - num(formLimites.minimo), 0))} ou mais.</>
              )}
              {formLimites.minimo === '' && <> Sem mínimo, este item não pede compra sozinho.</>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: '#16a34a', flex: 1 }} onClick={gravarLimites}>Salvar</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setDefinindo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {contando && (
        <div className="modal-overlay" style={{ zIndex: 2100 }}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-title">📦 Contagem — {contando.nome}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
              O saldo passa a ser exatamente o que você contar. A diferença fica registrada no extrato,
              com o saldo de antes e o de depois — nada é apagado.
            </div>
            <label className="acn-label">Quantidade contada na prateleira *</label>
            <input type="number" min={0} step="any" autoFocus className="acn-input" style={{ width: '100%', marginBottom: 8 }}
              value={valorContagem} onChange={e => setValorContagem(e.target.value)} />
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
              Sistema diz {fmtQtd(contando.estoque_atual)} {contando.unidade || 'UN'}
              {valorContagem !== '' && Number(valorContagem) !== Number(contando.estoque_atual || 0) && (
                <b style={{ color: '#b45309' }}>
                  {' '}· diferença de {fmtQtd(Number(valorContagem) - Number(contando.estoque_atual || 0))}
                </b>
              )}
            </div>
            <label className="acn-label">Observação</label>
            <input className="acn-input" style={{ width: '100%', marginBottom: 10 }} value={obsContagem}
              onChange={e => setObsContagem(e.target.value)} placeholder="Ex.: sobrou caixa fechada no fundo" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: '#16a34a', flex: 1, opacity: salvando ? .6 : 1 }}
                disabled={salvando} onClick={gravarContagem}>
                {salvando ? 'Gravando...' : 'Gravar contagem'}
              </button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando}
                onClick={() => setContando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
