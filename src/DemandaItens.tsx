// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DemandaItens — lista de itens e vínculos múltiplos da demanda avulsa
//
// Itens: cada linha tem nome, quantidade e descrição. O nome é digitado à mão ou
// escolhido do cadastro (produto ou item do catálogo). Produto com estrutura leva
// a estrutura junto, por unidade, e ela aparece multiplicada pela quantidade.
// A estrutura é gravada na demanda como estava na hora (foto do momento): mudar o
// produto depois não altera uma demanda já emitida.
//
// Vínculos: a demanda pode ficar ligada a várias OPs (ou ao lote inteiro) e a
// outros processos. O primeiro também vai para vinculo_tipo/id/descricao, que é
// onde as telas antigas procuram.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { buscarPorPalavras } from './SearchUtils';
import { estruturaDoKit } from './KitEstrutura';
import { VinculoPicker, abrirVinculo, TIPO_LABEL } from './VinculoPicker';
import { ProdutoArquivos } from './ProdutoArquivos';
import type { VinculoValue } from './VinculoPicker';

export type ItemDemanda = {
  nome: string;
  quantidade: number | string;
  descricao: string;
  produto_id?: string | null;
  produto_codigo?: string | null;
  item_id?: string | null;           // item do catálogo (cadastro_itens)
  estrutura?: any[];                 // por unidade do produto
};

export const itemVazio = (): ItemDemanda => ({ nome: '', quantidade: 1, descricao: '' });
const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmtQ = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Itens preenchidos (sem as linhas em branco), com a quantidade como número */
export function itensPreenchidos(itens: ItemDemanda[]) {
  return (itens || [])
    .filter(i => String(i.nome || '').trim())
    .map(i => ({ ...i, nome: String(i.nome).trim(), descricao: String(i.descricao || '').trim(), quantidade: num(i.quantidade) || 1 }));
}

/** Estrutura do produto (sub-kits abertos), por unidade, no formato gravado na demanda */
export async function estruturaParaDemanda(produtoId: string) {
  const linhas = await estruturaDoKit(produtoId);
  // junta o mesmo item que aparece em mais de um sub-kit
  const porItem = new Map<string, any>();
  for (const l of linhas) {
    const chave = l.item?.id || l.item?.nome;
    const atual = porItem.get(chave);
    if (atual) atual.quantidade += l.quantidade;
    else porItem.set(chave, { item_id: l.item?.id || null, codigo: l.item?.codigo || '', nome: l.item?.nome || '', unidade: l.item?.unidade || 'UN', quantidade: l.quantidade });
  }
  return [...porItem.values()];
}

// ── Busca no cadastro (produtos e itens do catálogo) ─────────────────────────
function BuscaCadastro({ valor, onTexto, onEscolher, placeholder }) {
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [aberto, setAberto] = useState(false);
  const timer = useRef<any>(null);
  const wrap = useRef<any>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const buscar = async (q: string) => {
    if (q.trim().length < 2) { setSugestoes([]); setAberto(false); return; }
    const [p, i] = await Promise.all([
      buscarPorPalavras(supabase.from('cadastro_produtos').select('id,codigo,nome,unidade').eq('ativo', true), ['nome_norm', 'codigo_norm'], q).limit(6),
      buscarPorPalavras(supabase.from('cadastro_itens').select('id,codigo,nome,unidade'), ['nome_norm', 'codigo_norm'], q).limit(6),
    ]);
    const produtos = p.data || [];
    // quais produtos têm estrutura
    const ids = produtos.map((x: any) => x.id);
    let comEstrutura = new Set<string>();
    if (ids.length) {
      const { data } = await supabase.from('cadastro_produtos_itens').select('produto_id').in('produto_id', ids);
      comEstrutura = new Set((data || []).map((x: any) => x.produto_id));
    }
    setSugestoes([
      ...produtos.map((x: any) => ({ ...x, tipo: 'produto', temEstrutura: comEstrutura.has(x.id) })),
      ...(i.data || []).map((x: any) => ({ ...x, tipo: 'item' })),
    ]);
    setAberto(true);
  };
  return (
    <div ref={wrap} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input value={valor} placeholder={placeholder} autoComplete="off" aria-label="Nome do item"
        onChange={e => { onTexto(e.target.value); clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => buscar(v), 300); }}
        onFocus={() => sugestoes.length && setAberto(true)}
        style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
      {aberto && sugestoes.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #d1d5db',
          borderRadius: 6, boxShadow: '0 4px 12px #0002', marginTop: 2, maxHeight: 240, overflowY: 'auto' }}>
          {sugestoes.map(s => (
            <div key={s.tipo + s.id} onMouseDown={() => { setAberto(false); onEscolher(s); }}
              style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <span style={{ fontSize: 9, fontWeight: 700, color: s.tipo === 'produto' ? '#7c3aed' : '#0369a1', minWidth: 52 }}>
                {s.tipo === 'produto' ? (s.temEstrutura ? '🧩 PRODUTO' : 'PRODUTO') : 'ITEM'}
              </span>
              {s.codigo && <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 10 }}>{s.codigo}</span>}
              <span style={{ flex: 1 }}>{s.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editor da lista de itens ─────────────────────────────────────────────────
export function ItensDemandaEditor({ itens, onChange, titulo = 'Itens' }: { itens: ItemDemanda[]; onChange: (v: ItemDemanda[]) => void; titulo?: string }) {
  const [abertos, setAbertos] = useState<Record<number, boolean>>({});
  const set = (i: number, patch: Partial<ItemDemanda>) => onChange(itens.map((x, j) => j === i ? { ...x, ...patch } : x));
  const escolher = async (i: number, s: any) => {
    if (s.tipo === 'produto') {
      set(i, { nome: s.nome, produto_id: s.id, produto_codigo: s.codigo || null, item_id: null, estrutura: [] });
      const estrutura = s.temEstrutura ? await estruturaParaDemanda(s.id) : [];
      onChange(itens.map((x, j) => j === i ? { ...x, nome: s.nome, produto_id: s.id, produto_codigo: s.codigo || null, item_id: null, estrutura } : x));
    } else {
      set(i, { nome: s.nome, item_id: s.id, produto_id: null, produto_codigo: s.codigo || null, estrutura: [] });
    }
  };
  const remover = (i: number) => onChange(itens.length > 1 ? itens.filter((_, j) => j !== i) : [itemVazio()]);
  return (
    <div>
      <label style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{titulo}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((it, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <BuscaCadastro valor={it.nome} placeholder="Nome do item — digite ou busque no cadastro"
                onTexto={v => set(i, { nome: v, ...(it.produto_id || it.item_id ? { produto_id: null, item_id: null, produto_codigo: null, estrutura: [] } : {}) })}
                onEscolher={s => escolher(i, s)} />
              <input type="number" min="0" step="any" value={it.quantidade} aria-label="Quantidade"
                onChange={e => set(i, { quantidade: e.target.value })}
                style={{ width: 70, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
              <button type="button" onClick={() => remover(i)} title="Remover item" aria-label="Remover item"
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
            <input value={it.descricao} onChange={e => set(i, { descricao: e.target.value })} placeholder="Descrição (opcional)" aria-label="Descrição do item"
              style={{ width: '100%', marginTop: 4, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10, boxSizing: 'border-box' }} />
            {(it.produto_codigo || it.estrutura?.length > 0) && (
              <div style={{ fontSize: 9, color: '#7c3aed', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
                {it.produto_codigo && <span>Cadastro: {it.produto_codigo}</span>}
                {it.estrutura?.length > 0 && (
                  <button type="button" onClick={() => setAbertos(a => ({ ...a, [i]: !a[i] }))}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 9, fontWeight: 700, padding: 0 }}>
                    🧩 estrutura com {it.estrutura.length} item(ns) {abertos[i] ? '▲' : '▼'}
                  </button>
                )}
              </div>
            )}
            {abertos[i] && <TabelaEstrutura estrutura={it.estrutura} quantidade={num(it.quantidade) || 1} />}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...itens, itemVazio()])}
        style={{ marginTop: 6, background: '#fff', border: '1.5px dashed #94a3b8', color: '#475569', borderRadius: 4, padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
        +1 item
      </button>
    </div>
  );
}

function TabelaEstrutura({ estrutura, quantidade }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontSize: 10 }}>
      <thead>
        <tr style={{ color: '#64748b' }}>
          <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 700 }}>Código</th>
          <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 700 }}>Item da estrutura</th>
          <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 700 }}>Por unidade</th>
          <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 700 }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {(estrutura || []).map((e, k) => (
          <tr key={k} style={{ borderTop: '1px solid #ede9fe' }}>
            <td style={{ padding: '2px 4px', fontFamily: 'monospace', color: '#64748b' }}>{e.codigo || '—'}</td>
            <td style={{ padding: '2px 4px' }}>{e.nome}</td>
            <td style={{ padding: '2px 4px', textAlign: 'right' }}>{fmtQ(num(e.quantidade))} {e.unidade}</td>
            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 700 }}>{fmtQ(num(e.quantidade) * quantidade)} {e.unidade}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Leitura (detalhe da demanda) ─────────────────────────────────────────────
export function ItensDemandaView({ itens }: { itens: ItemDemanda[] }) {
  const [abertos, setAbertos] = useState<Record<number, boolean>>({});
  if (!itens?.length) return null;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ background: '#f8fafc', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
        📦 Itens ({itens.length})
      </div>
      {itens.map((it, i) => (
        <div key={i} style={{ padding: '6px 10px', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: 11 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <strong style={{ minWidth: 40, textAlign: 'right', color: '#1e293b' }}>{fmtQ(num(it.quantidade))}×</strong>
            <span style={{ flex: 1 }}>
              {it.nome}
              {it.produto_codigo && <span style={{ color: '#64748b', fontSize: 9, marginLeft: 6 }}>{it.produto_codigo}</span>}
            </span>
            {it.estrutura?.length > 0 && (
              <button type="button" onClick={() => setAbertos(a => ({ ...a, [i]: !a[i] }))}
                style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
                🧩 estrutura {abertos[i] ? '▲' : '▼'}
              </button>
            )}
          </div>
          {it.descricao && <div style={{ fontSize: 10, color: '#64748b', marginLeft: 48 }}>{it.descricao}</div>}
          {it.produto_id && <div style={{ marginLeft: 48 }}><ProdutoArquivos produtoId={it.produto_id} somenteLeitura compacto /></div>}
          {abertos[i] && <TabelaEstrutura estrutura={it.estrutura} quantidade={num(it.quantidade) || 1} />}
        </div>
      ))}
    </div>
  );
}

// ── Vínculos (várias OPs, lote, outros processos) ───────────────────────────
// descrição do vínculo de OP é "<opl> — <cliente>"; o lote é o número sem o "/NN" final
const baseDaOpl = (desc: string) => {
  const opl = String(desc || '').split(' — ')[0].trim();
  const m = opl.match(/^(.+)\/\d+$/);
  return m ? m[1] : null;
};

/** Vínculos da demanda: lista nova + o vínculo antigo de campo único */
export function vinculosDaDemanda(d: any): VinculoValue[] {
  const lista: VinculoValue[] = Array.isArray(d?.vinculos) ? [...d.vinculos] : [];
  if (d?.vinculo_tipo && d?.vinculo_id && !lista.some(v => v.tipo === d.vinculo_tipo && String(v.id) === String(d.vinculo_id))) {
    lista.unshift({ tipo: d.vinculo_tipo, id: d.vinculo_id, descricao: d.vinculo_descricao });
  }
  return lista;
}

/** Campos a gravar na demanda para uma lista de vínculos */
export function camposDosVinculos(vinculos: VinculoValue[]) {
  const v0 = vinculos[0];
  return {
    vinculos,
    vinculo_tipo: v0?.tipo || null,
    vinculo_id: v0?.id || null,
    vinculo_descricao: v0?.descricao || null,
  };
}

export function VinculosEditor({ vinculos, onChange }: { vinculos: VinculoValue[]; onChange: (v: VinculoValue[]) => void }) {
  const [lote, setLote] = useState<{ base: string; ops: any[] } | null>(null);
  const jaTem = (v: VinculoValue) => vinculos.some(x => x.tipo === v.tipo && String(x.id) === String(v.id));

  // escolheu uma OP de lote: oferece incluir as outras unidades
  useEffect(() => {
    const ultimaOp = [...vinculos].reverse().find(v => v.tipo === 'op');
    const base = ultimaOp ? baseDaOpl(ultimaOp.descricao) : null;
    if (!base) { setLote(null); return; }
    let vivo = true;
    supabase.from('oples').select('id,opl,cliente_nome,modelo').ilike('opl', `${base}/%`).order('opl').then(({ data }) => {
      if (!vivo) return;
      const faltam = (data || []).filter((o: any) => !vinculos.some(v => v.tipo === 'op' && String(v.id) === String(o.id)));
      setLote(faltam.length ? { base, ops: faltam } : null);
    });
    return () => { vivo = false; };
  }, [vinculos]);

  const adicionarLote = () => {
    if (!lote) return;
    onChange([...vinculos, ...lote.ops.map((o: any) => ({ tipo: 'op', id: String(o.id), descricao: `${o.opl} — ${o.cliente_nome || o.modelo || ''}`.replace(/ — $/, '') }))]);
  };

  return (
    <div>
      {vinculos.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {vinculos.map((v, i) => (
            <span key={v.tipo + v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
              border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: 12, fontSize: 10 }}>
              <strong style={{ color: '#1d4ed8' }}>{TIPO_LABEL[v.tipo] || v.tipo}</strong> {v.descricao}
              <button type="button" onClick={() => onChange(vinculos.filter((_, j) => j !== i))} aria-label={`Remover vínculo ${v.descricao}`}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      {lote && (
        <button type="button" onClick={adicionarLote}
          style={{ marginBottom: 6, background: '#f0f9ff', border: '1px solid #7dd3fc', color: '#0369a1', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          + Lote inteiro {lote.base} (mais {lote.ops.length} OP{lote.ops.length > 1 ? 's' : ''})
        </button>
      )}
      <VinculoPicker value={null} onSelect={v => { if (!jaTem(v)) onChange([...vinculos, v]); }} onClear={() => {}} />
    </div>
  );
}

/** Vínculos em leitura, clicáveis */
export function VinculosView({ vinculos }: { vinculos: VinculoValue[] }) {
  if (!vinculos.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {vinculos.map(v => (
        <span key={v.tipo + v.id} onClick={() => abrirVinculo(v)} role="link" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') abrirVinculo(v); }}
          style={{ padding: '3px 9px', border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: 12, fontSize: 10, cursor: 'pointer' }}>
          🔗 <strong style={{ color: '#1d4ed8' }}>{TIPO_LABEL[v.tipo] || v.tipo}</strong> <span style={{ textDecoration: 'underline' }}>{v.descricao}</span>
        </span>
      ))}
    </div>
  );
}
