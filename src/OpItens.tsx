// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OpItens — o que foi vendido, o que a Engenharia planejou e o que saiu no kit
//
//   1. Vendido  (oples.itens_vendidos) — Comercial, ao gerar a OP. Obrigatório.
//      Pode vir da formação de preços da venda ou do item do edital, ou ser
//      preenchido à mão. No lote é POR UNIDADE (cada OP /NN recebe a lista).
//   2. BOM      (oples.bom_itens) — Engenharia, ao liberar a BOM. Material do
//      Cadastro de Itens (kit abre nos itens); item fora do cadastro é aceito,
//      mas fica marcado "não cadastrado". Sugerida a partir do vendido.
//   3. Separado (oples.kit_conferencia) — Almoxarifado, no kiting: a quantidade
//      separada de cada linha da BOM. Diferença exige observação e o kit sai
//      "com pendência".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import { BuscaCadastro, ItensDemandaEditor, itemVazio, itensPreenchidos, estruturaParaDemanda } from './DemandaItens';
import { SelectBusca } from './Interface';

const num = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const fmtQ = (v: any) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const lbl = { fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const };

// ── 1. VENDIDO ───────────────────────────────────────────────────────────────

/** Itens da formação de preços ligada à venda (card do CRM e/ou licitação) */
export async function itensDaFormacao({ crmId, licitacaoId }: { crmId?: string | null; licitacaoId?: string | null }) {
  const filtros = [crmId ? `and(tipo.eq.crm,processo_id.eq.${crmId})` : null, licitacaoId ? `and(tipo.eq.licitacao,processo_id.eq.${licitacaoId})` : null].filter(Boolean);
  if (!filtros.length) return { formacao: null, itens: [] };
  const { data: vinc } = await supabase.from('cotacoes_precos_vinculos').select('cotacao_id').or(filtros.join(','));
  const ids = [...new Set((vinc || []).map((v: any) => v.cotacao_id))];
  if (!ids.length) return { formacao: null, itens: [] };
  const { data } = await supabase.from('cotacoes_precos').select('id,nome,versao,status,vencedora,criado_em,itens').in('id', ids);
  // a oficial (vencedora); sem ela, a finalizada mais nova; senão a versão mais alta
  const f = [...(data || [])].sort((a: any, b: any) =>
    Number(!!b.vencedora) - Number(!!a.vencedora)
    || Number(b.status === 'finalizada') - Number(a.status === 'finalizada') || (b.versao || 1) - (a.versao || 1)
    || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
  if (!f) return { formacao: null, itens: [] };
  const itens = (f.itens || []).filter((l: any) => String(l.produto || '').trim()).map((l: any) => ({
    nome: String(l.produto).trim(),
    quantidade: num(l.qt) || 1,
    descricao: [l.marca, l.modelo, l.lote_nome && (/^lote/i.test(String(l.lote_nome).trim()) ? l.lote_nome : `Lote ${l.lote_nome}`)].filter(Boolean).join(' · '),
    produto_id: l.kit_id || null,
    item_id: l.item_id || null,
  }));
  return { formacao: f, itens };
}

/** Editor dos itens vendidos, com "carregar da formação" e "dividir por unidade" */
export function ItensVendidosEditor({ itens, onChange, crmId, licitacaoId, unidades = 1 }: {
  itens: any[]; onChange: (v: any[]) => void; crmId?: string | null; licitacaoId?: string | null; unidades?: number;
}) {
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const temVinculo = !!(crmId || licitacaoId);
  const carregar = async () => {
    setCarregando(true); setAviso('');
    const { formacao, itens: vindos } = await itensDaFormacao({ crmId, licitacaoId });
    setCarregando(false);
    if (!formacao || !vindos.length) { setAviso('Nenhuma formação de preços com itens ligada a esta venda. Preencha à mão.'); return; }
    const jaPreenchidos = itensPreenchidos(itens);
    onChange([...jaPreenchidos, ...vindos]);
    setAviso(`Carregado da formação ${formacao.vencedora ? 'oficial' : '(nenhuma marcada como oficial; usada a mais recente)'} "${formacao.nome || 'formação'}" v${formacao.versao || 1}: ${vindos.length} item(ns). Confira nomes e quantidades.`
      + (unidades > 1 ? ' As quantidades da formação são do total da venda.' : ''));
  };
  const dividir = () => {
    onChange(itens.map(i => {
      const q = num(i.quantidade);
      return { ...i, quantidade: q && q % unidades === 0 ? q / unidades : q };
    }));
    setAviso(`Quantidades divididas pelas ${unidades} unidades (as que não dividem exato ficaram como estavam).`);
  };
  return (
    <div style={{ border: '1.5px solid #bfdbfe', background: '#f8fbff', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ ...lbl, color: '#1d4ed8', fontSize: 10 }}>📦 Itens vendidos *{unidades > 1 ? ` — por unidade (cada uma das ${unidades} OPs)` : ''}</span>
        <span style={{ fontSize: 9, color: '#64748b' }}>Informa à Engenharia exatamente o que foi vendido.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {temVinculo && (
            <button type="button" onClick={carregar} disabled={carregando}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, border: '1px solid #2563eb', background: '#fff', color: '#1d4ed8', cursor: 'pointer' }}>
              {carregando ? 'Carregando...' : '⬇ Carregar da formação oficial'}
            </button>
          )}
          {unidades > 1 && itensPreenchidos(itens).length > 0 && (
            <button type="button" onClick={dividir}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, border: '1px solid #94a3b8', background: '#fff', color: '#475569', cursor: 'pointer' }}>
              ÷ Dividir por {unidades} unidades
            </button>
          )}
        </span>
      </div>
      {aviso && <div style={{ fontSize: 10, color: '#1e40af', marginBottom: 6 }}>{aviso}</div>}
      <ItensDemandaEditor itens={itens.length ? itens : [itemVazio()]} onChange={onChange} titulo="" />
    </div>
  );
}

// ── 2. BOM ───────────────────────────────────────────────────────────────────
export const linhaBomVazia = () => ({ item_id: null, codigo: '', nome: '', unidade: 'UN', quantidade: 1, descricao: '', nao_cadastrado: false });
export const bomPreenchida = (linhas: any[]) => (linhas || [])
  .filter(l => String(l.nome || '').trim())
  .map(l => ({ ...l, nome: String(l.nome).trim(), descricao: String(l.descricao || '').trim(), quantidade: num(l.quantidade) || 1, nao_cadastrado: !l.item_id }));

/** BOM sugerida pelo vendido: kit/produto com estrutura abre nos itens; item do catálogo entra direto */
export async function sugerirBom(vendidos: any[]) {
  const porItem = new Map<string, any>();
  const somar = (l: any) => {
    const chave = l.item_id || `txt:${l.nome}`;
    const atual = porItem.get(chave);
    if (atual) atual.quantidade += l.quantidade; else porItem.set(chave, { ...l });
  };
  for (const v of vendidos || []) {
    const q = num(v.quantidade) || 1;
    if (v.produto_id) {
      const estrutura = v.estrutura?.length ? v.estrutura : await estruturaParaDemanda(v.produto_id);
      estrutura.forEach((e: any) => somar({ item_id: e.item_id, codigo: e.codigo || '', nome: e.nome, unidade: e.unidade || 'UN', quantidade: num(e.quantidade) * q, descricao: `do ${v.nome}`, nao_cadastrado: !e.item_id }));
    } else if (v.item_id) {
      const { data } = await supabase.from('cadastro_itens').select('id,codigo,nome,unidade').eq('id', v.item_id).maybeSingle();
      if (data) somar({ item_id: data.id, codigo: data.codigo || '', nome: data.nome, unidade: data.unidade || 'UN', quantidade: q, descricao: '', nao_cadastrado: false });
    }
  }
  // R19 (decidida com o usuário em 01/10/2026, aplicada em 06/10/2026): serviço e item genérico (categoria GENERICO:
  // película, instalação do kit, garantia estendida, plotagem, licença…) continuam na venda e na proposta, mas NÃO são
  // material para o Almoxarifado separar — saem da BOM sugerida. Se a leitura das categorias falhar, a lista segue
  // como estava (melhor sobrar um serviço do que sumir um material).
  const sugeridas = [...porItem.values()];
  const idsSug = sugeridas.map(l => l.item_id).filter(Boolean);
  if (!idsSug.length) return sugeridas;
  const { data: cats, error: erroCats } = await supabase.from('cadastro_itens').select('id,categoria').in('id', idsSug);
  if (erroCats) return sugeridas;
  const genericos = new Set((cats || []).filter((c: any) => String(c.categoria || '').trim().toUpperCase() === 'GENERICO').map((c: any) => String(c.id)));
  return sugeridas.filter(l => !l.item_id || !genericos.has(String(l.item_id)));
}

/**
 * COPIAR A LISTA DE MATERIAL DE OUTRA OP (28/09/2026)
 *
 * Pedido da Engenharia. Carro parecido já adaptado antes tem a lista pronta, e
 * redigitar item por item é trabalho jogado fora — além de ser onde nasce a
 * diferença entre duas OPs que deviam ser iguais.
 *
 * A armadilha é a quantidade: a OP de origem pode ser de um lote de 3 carros e
 * esta de um só. Copiar cru traria o triplo de material. Por isso, quando as
 * quantidades diferem, o painel ajusta na proporção e diz que está ajustando —
 * com como desligar, para o caso de a lista de origem já ser por unidade.
 */
export function CopiarBomDeOutraOp({ oplAtual, onCopiar }: any) {
  const [aberto, setAberto] = useState(false);
  const [ops, setOps] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [escolhidaId, setEscolhidaId] = useState('');
  const [ajustar, setAjustar] = useState(true);

  const abrir = async () => {
    setAberto(true);
    if (ops.length) return;
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,cliente_nome,modelo,quantidade,bom_itens,data_liberacao_bom')
      .not('bom_itens', 'is', null)
      .order('data_liberacao_bom', { ascending: false, nullsFirst: false })
      .limit(300);
    setOps((data || [])
      .filter((o: any) => Array.isArray(o.bom_itens) && o.bom_itens.length && o.id !== oplAtual?.id));
    setCarregando(false);
  };

  const origem = ops.find(o => o.id === escolhidaId);
  const qtdOrigem = Math.max(1, Number(origem?.quantidade) || 1);
  const qtdAtual  = Math.max(1, Number(oplAtual?.quantidade) || 1);
  const precisaAjuste = qtdOrigem !== qtdAtual;
  const fator = precisaAjuste && ajustar ? qtdAtual / qtdOrigem : 1;

  const linhasCopiadas = () => (origem?.bom_itens || []).map((l: any) => ({
    ...l,
    quantidade: Math.round(num(l.quantidade) * fator * 1000) / 1000,
    descricao: [l.descricao, `copiado da OP ${origem.opl}`].filter(Boolean).join(' · '),
  }));

  if (!aberto) {
    return (
      <button type="button" onClick={abrir}
        style={{ fontSize: 10, fontWeight: 700, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
          border: '1px dashed #94a3b8', background: '#fff', color: '#475569', marginBottom: 8 }}>
        📋 Copiar a lista de outra OP
      </button>
    );
  }

  return (
    <div style={{ border: '1.5px solid #c7d2fe', background: '#eef2ff', borderRadius: 8, padding: '9px 11px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ ...lbl, color: '#3730a3', fontSize: 10, flex: 1 }}>📋 Copiar a lista de material de outra OP</div>
        <button type="button" onClick={() => { setAberto(false); setEscolhidaId(''); }}
          style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {carregando ? (
        <div style={{ fontSize: 10, color: '#4338ca' }}>Procurando OPs com lista pronta…</div>
      ) : !ops.length ? (
        <div style={{ fontSize: 10, color: '#64748b' }}>
          Nenhuma outra OP tem lista de material montada ainda.
        </div>
      ) : (
        <>
          <SelectBusca valor={escolhidaId} onChange={setEscolhidaId}
            placeholder="— procure a OP pelo número, cliente ou veículo —" vazio="— nenhuma —"
            opcoes={ops.map(o => ({
              valor: o.id,
              rotulo: `OP ${o.opl}`,
              detalhe: [o.cliente_nome, o.modelo, `${o.bom_itens.length} itens`,
                        (Number(o.quantidade) || 1) > 1 ? `lote de ${o.quantidade}` : ''].filter(Boolean).join(' · '),
              busca: [o.opl, o.cliente_nome, o.modelo],
            }))} />

          {origem && (
            <div style={{ marginTop: 8 }}>
              {precisaAjuste && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer',
                  fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d',
                  borderRadius: 5, padding: '6px 8px', marginBottom: 7 }}>
                  <input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} style={{ marginTop: 1 }} />
                  <span>
                    A OP {origem.opl} é de <b>{qtdOrigem} unidade(s)</b> e esta é de <b>{qtdAtual}</b>.
                    Ajustar as quantidades na proporção. Desmarque se a lista de origem já for por unidade.
                  </span>
                </label>
              )}
              <div style={{ fontSize: 9.5, color: '#475569', marginBottom: 7 }}>
                {origem.bom_itens.length} item(ns):{' '}
                {origem.bom_itens.slice(0, 4).map((l: any) => `${fmtQ(num(l.quantidade) * fator)}× ${l.nome}`).join(' · ')}
                {origem.bom_itens.length > 4 ? ` … e mais ${origem.bom_itens.length - 4}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => { onCopiar(linhasCopiadas(), 'somar'); setAberto(false); }}
                  style={{ fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
                    border: 'none', background: '#4338ca', color: '#fff' }}>
                  Somar à lista atual
                </button>
                <button type="button" onClick={() => { onCopiar(linhasCopiadas(), 'substituir'); setAberto(false); }}
                  style={{ fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid #cbd5e1', background: '#fff', color: '#475569' }}>
                  Substituir a lista
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BomEditor({ linhas, onChange, vendidos = [] }: { linhas: any[]; onChange: (v: any[]) => void; vendidos?: any[] }) {
  const [sugerindo, setSugerindo] = useState(false);
  const lista = linhas.length ? linhas : [linhaBomVazia()];
  const set = (i: number, patch: any) => onChange(lista.map((l, j) => j === i ? { ...l, ...patch } : l));
  const escolher = async (i: number, s: any) => {
    if (s.tipo === 'item') {
      set(i, { item_id: s.id, codigo: s.codigo || '', nome: s.nome, unidade: s.unidade || 'UN', nao_cadastrado: false });
      return;
    }
    // produto/kit: troca a linha pelos itens da estrutura (multiplicados pela quantidade da linha)
    const q = num(lista[i].quantidade) || 1;
    const estrutura = await estruturaParaDemanda(s.id);
    if (!estrutura.length) {
      set(i, { item_id: null, codigo: s.codigo || '', nome: s.nome, nao_cadastrado: true, descricao: 'produto sem estrutura cadastrada' });
      return;
    }
    const novas = estrutura.map((e: any) => ({ item_id: e.item_id, codigo: e.codigo || '', nome: e.nome, unidade: e.unidade || 'UN', quantidade: num(e.quantidade) * q, descricao: `do ${s.nome}`, nao_cadastrado: !e.item_id }));
    onChange([...lista.slice(0, i), ...novas, ...lista.slice(i + 1)]);
  };
  const sugerir = async () => {
    setSugerindo(true);
    const sug = await sugerirBom(vendidos);
    setSugerindo(false);
    if (!sug.length) { alert('Os itens vendidos não têm estrutura nem código do cadastro para sugerir a BOM. Monte a lista buscando os itens.'); return; }
    onChange([...bomPreenchida(lista), ...sug]);
  };
  const naoCad = bomPreenchida(lista).filter(l => l.nao_cadastrado).length;
  return (
    <div style={{ border: '1.5px solid #bbf7d0', background: '#f7fdf9', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ ...lbl, color: '#15803d', fontSize: 10 }}>🔩 BOM — material para executar (por unidade) *</span>
        {vendidos.length > 0 && (
          <button type="button" onClick={sugerir} disabled={sugerindo} style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, border: '1px solid #16a34a', background: '#fff', color: '#15803d', cursor: 'pointer' }}>
            {sugerindo ? 'Montando...' : '✨ Sugerir pelo que foi vendido'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lista.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <BuscaCadastro valor={l.nome} placeholder="Item do cadastro (ou kit, que abre nos itens)"
              onTexto={v => set(i, { nome: v, item_id: null, codigo: '', nao_cadastrado: true })}
              onEscolher={s => escolher(i, s)} />
            {l.codigo && <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{l.codigo}</span>}
            {String(l.nome || '').trim() && !l.item_id && (
              <span title="Item fora do Cadastro de Itens — cadastre para controlar o estoque" style={{ fontSize: 9, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>não cadastrado</span>
            )}
            <input type="number" min="0" step="any" value={l.quantidade} aria-label="Quantidade na BOM"
              onChange={e => set(i, { quantidade: e.target.value })}
              style={{ width: 64, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }} />
            <span style={{ fontSize: 10, color: '#64748b', width: 26 }}>{l.unidade || 'UN'}</span>
            <input value={l.descricao || ''} placeholder="Descrição" aria-label="Descrição na BOM"
              onChange={e => set(i, { descricao: e.target.value })}
              style={{ width: 150, padding: '5px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10 }} />
            <button type="button" aria-label="Remover linha" title="Remover" onClick={async () => { if (!await confirmarRemocao('esta linha da lista')) return; onChange(lista.length > 1 ? lista.filter((_, j) => j !== i) : [linhaBomVazia()]); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <button type="button" onClick={() => onChange([...lista, linhaBomVazia()])}
          style={{ background: '#fff', border: '1.5px dashed #94a3b8', color: '#475569', borderRadius: 4, padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          +1 item
        </button>
        {naoCad > 0 && <span style={{ fontSize: 10, color: '#b45309' }}>{naoCad} item(ns) fora do cadastro — dá para liberar, mas cadastre para controlar o estoque.</span>}
      </div>
    </div>
  );
}

// ── 3. CONFERÊNCIA DO KITING ─────────────────────────────────────────────────
/**
 * Estado inicial do checklist de separação.
 *
 * Começa VAZIO: quem marca é o Almoxarifado, conforme coloca a peça na caixa
 * (decidido com o usuário em 28/09/2026). Antes vinha tudo preenchido com a
 * quantidade da BOM e "separado" passava no automático — a conferência dizia
 * que alguém tinha olhado sem que ninguém tivesse olhado.
 *
 * Separação salva pela metade volta de onde parou.
 *
 * `completo` é para o kiting em lote, onde não há conferência linha a linha e a
 * BOM inteira é registrada como separada de uma vez.
 */
export const conferenciaInicial = (opl: any, { completo = false }: any = {}) => {
  const anteriores = opl?.kit_conferencia?.linhas || [];
  return (opl?.bom_itens || []).map((b: any, i: number) => {
    const ant = anteriores[i]?.nome === b.nome ? anteriores[i] : null;
    return {
      ...b, planejado: num(b.quantidade),
      separado: ant ? num(ant.separado) : (completo ? num(b.quantidade) : 0),
      obs: ant?.obs || '',
    };
  });
};
export const divergencias = (linhas: any[]) => (linhas || []).filter(l => num(l.separado) !== num(l.planejado));
/** Texto curto das diferenças (vai para a observação do kit) */
export const resumoDivergencias = (linhas: any[]) => divergencias(linhas)
  .map(l => `${l.nome}: BOM ${fmtQ(l.planejado)}, separado ${fmtQ(l.separado)}${l.obs ? ` (${l.obs})` : ''}`).join('; ');
/** Valida: toda diferença precisa de observação. Devolve mensagem de erro ou '' */
export const validarConferencia = (linhas: any[]) => {
  const semObs = divergencias(linhas).filter(l => !String(l.obs || '').trim());
  return semObs.length ? `Explique a diferença em: ${semObs.map(l => l.nome).join(', ')}.` : '';
};
export const registroConferencia = (linhas: any[], currentUser: any, emLote = false) => ({
  linhas: (linhas || []).map(l => ({ item_id: l.item_id, codigo: l.codigo, nome: l.nome, unidade: l.unidade, planejado: num(l.planejado), separado: num(l.separado), obs: String(l.obs || '').trim() })),
  divergente: divergencias(linhas).length > 0,
  conferido_por: currentUser?.nome || null,
  conferido_em: new Date().toISOString(),
  em_lote: emLote,
});

/**
 * O que ainda precisa sair da prateleira para esta linha — e se dá para tirar.
 *
 * Numa separação salva pela metade o saldo já caiu do que saiu antes, então o
 * que falta tirar é o planejado menos o que esta OP já baixou.
 */
export const situacaoDaLinha = (l: any, saldos: any = {}) => {
  const s = saldos?.[l?.item_id] || null;
  const aTirar = num(l.planejado) - num(s?.jaBaixado || 0);
  const semSaldo = !!s?.controla && aTirar > 0 && num(s.saldo) < aTirar;
  return { ...(s || {}), aTirar, semSaldo, temSaldoInfo: !!s };
};

/**
 * CHECKLIST DE SEPARAÇÃO (Etapa 8 — 28/09/2026)
 *
 * A lista de material virou checklist: o Almoxarifado marca item a item
 * conforme coloca na caixa. Marcar e desmarcar NÃO movem estoque — a baixa
 * acontece quando a separação é salva. O raciocínio do usuário: o material já
 * está reservado para aquela OP de qualquer jeito, então não há corrida por
 * peça durante a conferência e marcar errado não exige estorno.
 *
 * Item sob controle sem saldo não marca. A saída continua sendo separar o que
 * tem, salvar, e fechar o kit quando o resto chegar.
 */
export function ConferenciaKit({ linhas, onChange, saldos = {} }: { linhas: any[]; onChange: (v: any[]) => void; saldos?: any }) {
  if (!linhas?.length) return null;
  const set = (i: number, patch: any) => onChange(linhas.map((l, j) => j === i ? { ...l, ...patch } : l));
  const div = divergencias(linhas).length;
  const prontas = linhas.filter(l => num(l.separado) >= num(l.planejado) && num(l.planejado) > 0).length;
  const tudo = prontas === linhas.length;
  const marcarTudo = (ligar: boolean) => onChange(linhas.map(l => {
    if (!ligar) return { ...l, separado: 0 };
    return situacaoDaLinha(l, saldos).semSaldo ? l : { ...l, separado: num(l.planejado) };
  }));
  return (
    <div style={{ border: `1.5px solid ${tudo ? '#bbf7d0' : '#fdba74'}`, background: tudo ? '#f7fdf9' : '#fffbf5', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ ...lbl, color: tudo ? '#15803d' : '#c2410c', fontSize: 10 }}>
          📦 Separação — {prontas} de {linhas.length} {tudo ? 'itens separados' : 'itens separados, faltam ' + (linhas.length - prontas)}
        </div>
        <button type="button" onClick={() => marcarTudo(!tudo)}
          style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid #cbd5e1', background: '#fff', color: '#475569' }}>
          {tudo ? 'desmarcar tudo' : 'marcar tudo que tem saldo'}
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>
          <th style={{ width: 22 }}></th>
          <th style={{ textAlign: 'left', padding: '2px 4px' }}>Item</th>
          <th style={{ textAlign: 'right', padding: '2px 4px' }}>BOM</th>
          <th style={{ textAlign: 'right', padding: '2px 4px' }}>Separado</th>
          <th style={{ textAlign: 'left', padding: '2px 4px' }}>Observação</th>
        </tr></thead>
        <tbody>
          {linhas.map((l, i) => {
            const difere = num(l.separado) !== num(l.planejado);
            const marcado = num(l.separado) > 0;
            const st = situacaoDaLinha(l, saldos);
            const travado = st.semSaldo && !marcado;
            return (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: travado ? '#fef2f2' : difere ? '#fff7ed' : undefined }}>
                <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                  <input type="checkbox" checked={!difere && marcado} disabled={travado}
                    aria-label={`Separar ${l.nome}`}
                    title={travado ? 'Sem saldo no estoque para separar este item' : ''}
                    onChange={e => set(i, { separado: e.target.checked ? num(l.planejado) : 0 })}
                    style={{ cursor: travado ? 'not-allowed' : 'pointer', width: 15, height: 15 }} />
                </td>
                <td style={{ padding: '3px 4px' }}>
                  {l.nome}{l.codigo && <span style={{ color: '#94a3b8', fontSize: 9, marginLeft: 4 }}>{l.codigo}</span>}
                  {!l.item_id && <span style={{ color: '#b45309', fontSize: 9, marginLeft: 4 }}>não cadastrado</span>}
                  {l.descricao && <span style={{ color: '#94a3b8', fontSize: 9, marginLeft: 4 }}>{l.descricao}</span>}
                  {st.semSaldo && <div style={{ color: '#b91c1c', fontSize: 9 }}>
                    sem saldo: precisa de {fmtQ(st.aTirar)} e tem {fmtQ(st.saldo)} {st.unidade || l.unidade}
                  </div>}
                </td>
                <td style={{ padding: '3px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQ(l.planejado)} {l.unidade}</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                  <input type="number" min="0" step="any" value={l.separado} aria-label={`Separado de ${l.nome}`}
                    onChange={e => set(i, { separado: e.target.value })}
                    style={{ width: 64, padding: '3px 5px', border: `1px solid ${difere ? '#fb923c' : '#d1d5db'}`, borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                </td>
                <td style={{ padding: '3px 4px' }}>
                  <input value={l.obs || ''} placeholder={difere ? 'Obrigatório: por que mudou?' : ''} aria-label={`Observação de ${l.nome}`}
                    onChange={e => set(i, { obs: e.target.value })}
                    style={{ width: '100%', padding: '3px 5px', border: `1px solid ${difere && !String(l.obs || '').trim() ? '#f87171' : '#e2e8f0'}`, borderRadius: 4, fontSize: 10, boxSizing: 'border-box' }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 5 }}>
        Marcar e desmarcar não mexem no estoque. A baixa acontece quando você salva a separação.
      </div>
    </div>
  );
}

// ── Leitura: Vendido × BOM × Separado (detalhe da OP) ─────────────────────────
export function QuadroItensOp({ opl }: { opl: any }) {
  const vendidos = opl?.itens_vendidos || [];
  const bom = opl?.bom_itens || [];
  const conf = opl?.kit_conferencia?.linhas || [];
  if (!vendidos.length && !bom.length) return null;
  const th = { textAlign: 'left' as const, padding: '3px 6px', fontSize: 9, color: '#64748b', textTransform: 'uppercase' as const };
  const td = { padding: '3px 6px', fontSize: 11, borderTop: '1px solid #f1f5f9' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 8 }}>
      <div style={{ border: '1px solid #bfdbfe', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ background: '#eff6ff', padding: '5px 8px', fontSize: 10, fontWeight: 800, color: '#1d4ed8' }}>📦 Vendido ({vendidos.length})</div>
        {vendidos.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            {vendidos.map((v: any, i: number) => (
              <tr key={i}><td style={{ ...td, width: 40, textAlign: 'right', fontWeight: 700 }}>{fmtQ(v.quantidade)}×</td>
                <td style={td}>{v.nome}{v.descricao && <div style={{ fontSize: 9, color: '#64748b' }}>{v.descricao}</div>}</td></tr>
            ))}
          </tbody></table>
        ) : <div style={{ padding: 8, fontSize: 10, color: '#94a3b8' }}>Não informado (OP anterior à lista obrigatória).</div>}
      </div>
      <div style={{ border: '1px solid #bbf7d0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ background: '#f0fdf4', padding: '5px 8px', fontSize: 10, fontWeight: 800, color: '#15803d' }}>
          🔩 BOM × separado no kit {opl?.kit_conferencia?.divergente && <span style={{ color: '#c2410c' }}>· com diferença</span>}
        </div>
        {bom.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: 'right' }}>BOM</th><th style={{ ...th, textAlign: 'right' }}>Separado</th></tr></thead>
            <tbody>
              {bom.map((b: any, i: number) => {
                const c = conf[i] && conf[i].nome === b.nome ? conf[i] : null;
                const difere = c && num(c.separado) !== num(b.quantidade);
                return (
                  <tr key={i} style={{ background: difere ? '#fff7ed' : undefined }}>
                    <td style={td}>{b.nome}{b.codigo && <span style={{ color: '#94a3b8', fontSize: 9, marginLeft: 4 }}>{b.codigo}</span>}
                      {c?.obs && <div style={{ fontSize: 9, color: '#c2410c' }}>{c.obs}</div>}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQ(b.quantidade)} {b.unidade}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: difere ? 800 : 400, color: difere ? '#c2410c' : undefined }}>{c ? fmtQ(c.separado) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div style={{ padding: 8, fontSize: 10, color: '#94a3b8' }}>BOM ainda não liberada pela Engenharia.</div>}
        {opl?.kit_conferencia?.conferido_por && (
          <div style={{ fontSize: 9, color: '#94a3b8', padding: '3px 8px' }}>
            Conferido por {opl.kit_conferencia.conferido_por}{opl.kit_conferencia.em_lote ? ' (em lote)' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
