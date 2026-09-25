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
import { notificarEvento, msg } from './whatsappHelper';

// Fabricação interna: cada setor fabricante tem a sua categoria de produto
// (os modelos ficam em Produtos e mercadorias, com a estrutura de cada um)
export const SETORES_FABRICACAO = ['Chicotes', 'Serralheria'];
export const CATEGORIA_DO_SETOR: Record<string, string> = { Chicotes: 'Chicote', Serralheria: 'Serralheria' };

export type ItemDemanda = {
  nome: string;
  quantidade: number | string;
  descricao: string;
  produto_id?: string | null;
  produto_codigo?: string | null;
  item_id?: string | null;           // item do catálogo (cadastro_itens)
  valor_unitario?: number | string | null;  // Compras: quem pede ou o comprador informa
  estrutura?: any[];                 // por unidade do produto
};

export const itemVazio = (): ItemDemanda => ({ nome: '', quantidade: 1, descricao: '' });
// aceita "1.234,56" e "1234.56"
const num = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v ?? '').replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const fmtQ = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Itens preenchidos (sem as linhas em branco), com a quantidade como número */
export function itensPreenchidos(itens: ItemDemanda[]) {
  return (itens || [])
    .filter(i => String(i.nome || '').trim())
    .map(i => ({
      ...i, nome: String(i.nome).trim(), descricao: String(i.descricao || '').trim(), quantidade: num(i.quantidade) || 1,
      ...(i.valor_unitario !== undefined ? { valor_unitario: String(i.valor_unitario ?? '').trim() === '' ? null : num(i.valor_unitario) } : {}),
    }));
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Total dos itens com valor (null se nenhum tem valor) */
export function totalDosItens(itens: ItemDemanda[]) {
  const comValor = (itens || []).filter(i => i.valor_unitario != null && i.valor_unitario !== '');
  if (!comValor.length) return null;
  return comValor.reduce((s, i) => s + num(i.valor_unitario) * (num(i.quantidade) || 1), 0);
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
export function BuscaCadastro({ valor, onTexto, onEscolher, placeholder, categoriaPreferida = '' }) {
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
      buscarPorPalavras(supabase.from('cadastro_produtos').select('id,codigo,nome,unidade,categoria').eq('ativo', true), ['nome_norm', 'codigo_norm'], q).limit(8),
      buscarPorPalavras(supabase.from('cadastro_itens').select('id,codigo,nome,unidade'), ['nome_norm', 'codigo_norm'], q).limit(6),
    ]);
    // modelos da categoria do setor (ex.: Chicote) aparecem primeiro
    const produtos = [...(p.data || [])].sort((a: any, b: any) =>
      Number(b.categoria === categoriaPreferida) - Number(a.categoria === categoriaPreferida));
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
                {s.tipo === 'produto' ? (categoriaPreferida && s.categoria === categoriaPreferida ? '🧩 MODELO' : s.temEstrutura ? '🧩 PRODUTO' : 'PRODUTO') : 'ITEM'}
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
export function ItensDemandaEditor({ itens, onChange, titulo = 'Itens', categoriaPreferida = '', dica = '', comValor = false }: { itens: ItemDemanda[]; onChange: (v: ItemDemanda[]) => void; titulo?: string; categoriaPreferida?: string; dica?: string; comValor?: boolean }) {
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
      {dica && <div style={{ fontSize: 9, color: '#64748b', marginTop: -2, marginBottom: 4 }}>{dica}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((it, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <BuscaCadastro valor={it.nome} categoriaPreferida={categoriaPreferida}
                placeholder={categoriaPreferida ? `Modelo (${categoriaPreferida}) ou nome do item` : 'Nome do item — digite ou busque no cadastro'}
                onTexto={v => set(i, { nome: v, ...(it.produto_id || it.item_id ? { produto_id: null, item_id: null, produto_codigo: null, estrutura: [] } : {}) })}
                onEscolher={s => escolher(i, s)} />
              <input type="number" min="0" step="any" value={it.quantidade} aria-label="Quantidade"
                onChange={e => set(i, { quantidade: e.target.value })}
                style={{ width: 70, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
              {comValor && (
                <input inputMode="decimal" value={it.valor_unitario ?? ''} placeholder="R$ un." aria-label="Valor unitário"
                  onChange={e => set(i, { valor_unitario: e.target.value })}
                  style={{ width: 80, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
              )}
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
export function ItensDemandaView({ itens, mostrarValor = false, onSalvarValores }: {
  itens: ItemDemanda[]; mostrarValor?: boolean;
  // quando presente (comprador), permite preencher/ajustar o valor de cada item
  onSalvarValores?: (itens: ItemDemanda[]) => Promise<void>;
}) {
  const [abertos, setAbertos] = useState<Record<number, boolean>>({});
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  if (!itens?.length) return null;
  const faltaValor = itens.some(i => i.valor_unitario == null || i.valor_unitario === '');
  const total = totalDosItens(itens);
  const comecar = () => { setValores(itens.map(i => i.valor_unitario == null ? '' : String(i.valor_unitario).replace('.', ','))); setEditando(true); };
  const salvar = async () => {
    setSalvando(true);
    await onSalvarValores!(itens.map((it, k) => ({ ...it, valor_unitario: valores[k]?.trim() ? num(valores[k]) : null })));
    setSalvando(false); setEditando(false);
  };
  return (
    // flexShrink:0 não é enfeite. O overflow:hidden (que arredonda os cantos)
    // faz o flexbox considerar que esta caixa pode encolher até zero, e o corpo
    // do painel de demanda é um flex em coluna. Sem isso, com o painel cheio, a
    // lista era espremida e só sobrava o cabeçalho — o serralheiro via
    // "Itens (1)" sem saber qual peça fabricar (bug relatado em 25/09/2026).
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ background: '#f8fafc', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ flex: 1 }}>📦 Itens ({itens.length}){mostrarValor && total != null ? ` · total ${brl(total)}` : ''}</span>
        {onSalvarValores && !editando && (
          <button type="button" onClick={comecar}
            style={{ background: faltaValor ? '#16a34a' : '#fff', color: faltaValor ? '#fff' : '#15803d', border: '1px solid #16a34a', borderRadius: 4, padding: '2px 9px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
            💲 {faltaValor ? 'Preencher valores' : 'Ajustar valores'}
          </button>
        )}
        {editando && (
          <>
            <button type="button" onClick={salvar} disabled={salvando}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 9px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
              {salvando ? '...' : '✓ Salvar valores'}
            </button>
            <button type="button" onClick={() => setEditando(false)}
              style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 9px', fontSize: 9, cursor: 'pointer' }}>Cancelar</button>
          </>
        )}
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
            {editando ? (
              <input inputMode="decimal" value={valores[i] ?? ''} placeholder="R$ un." aria-label={`Valor unitário de ${it.nome}`}
                onChange={e => setValores(v => v.map((x, k) => k === i ? e.target.value : x))}
                style={{ width: 90, padding: '3px 6px', border: '1px solid #86efac', borderRadius: 4, fontSize: 11 }} />
            ) : mostrarValor && (
              <span style={{ fontSize: 10, color: it.valor_unitario != null && it.valor_unitario !== '' ? '#15803d' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {it.valor_unitario != null && it.valor_unitario !== ''
                  ? `${brl(num(it.valor_unitario))} un. · ${brl(num(it.valor_unitario) * (num(it.quantidade) || 1))}`
                  : 'sem valor'}
              </span>
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

// ── Fabricação interna na liberação de BOM / kiting ──────────────────────────
// Engenharia (ao liberar a BOM) ou PCP (ao liberar o kiting) indicam os modelos
// e quantidades de chicote e serralharia; o sistema abre a demanda avulsa de
// cada setor já com os itens, a estrutura e as OPs vinculadas.
export const fabricacaoVazia = () => Object.fromEntries(SETORES_FABRICACAO.map(s => [s, [itemVazio()]]));

// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO AUTOMÁTICA DE FABRICAÇÃO
// A partir da BOM da OP (ou, sem BOM, do que foi vendido), separa o que é
// fabricado aqui dentro e por qual setor. Quem responde isso é o cadastro do
// item: `origem_producao = 'interna'` + `setor_fabricante` — os mesmos campos
// que o PCP já usa para rotear a reposição do Almoxarifado.
//
// Só entra item ligado ao catálogo (item_id). Linha digitada à mão fica de
// fora de propósito: adivinhar pelo nome abriria demanda errada.
//
// IMPORTANTE: isto é SUGESTÃO, não pedido. Nem todo chicote precisa ser
// fabricado — muitas vezes já tem no estoque. Quem decide o que vai virar
// demanda é o PCP, marcando item a item ao liberar o kiting; nada vem
// marcado. Quando o estoque estiver controlado (saldo e estoque mínimo), a
// conta passa a ser automática: só sugere/abre o que faltar para a OP.
// ─────────────────────────────────────────────────────────────────────────────
const semAcento = (t: any) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export async function sugerirFabricacao(ops: any[]) {
  const vazio = { achados: [] as any[], origem: '' };
  const base = ops?.[0];
  if (!base) return vazio;
  const daBom = Array.isArray(base.bom_itens) && base.bom_itens.length;
  const linhas = daBom ? base.bom_itens : (Array.isArray(base.itens_vendidos) ? base.itens_vendidos : []);
  const ids = [...new Set(linhas.map((l: any) => l.item_id).filter(Boolean))];
  if (!ids.length) return vazio;

  const { data } = await supabase.from('cadastro_itens')
    .select('id,nome,origem_producao,setor_fabricante')
    .in('id', ids).eq('origem_producao', 'interna');
  const porId = new Map((data || []).map((i: any) => [i.id, i]));
  if (!porId.size) return vazio;

  const achados: any[] = [];
  for (const l of linhas) {
    const item: any = porId.get(l.item_id);
    if (!item?.setor_fabricante) continue;
    const setor = SETORES_FABRICACAO.find(s => semAcento(s) === semAcento(item.setor_fabricante));
    if (!setor) continue;                       // setor fabricante fora dos que abrem demanda
    achados.push({ setor, nome: l.nome, quantidade: num(l.quantidade) || 1,
      descricao: String(l.descricao || '').trim(), item_id: l.item_id });
  }
  return { achados, origem: daBom ? 'BOM da Engenharia' : 'itens vendidos' };
}
export const temFabricacao = (valor: any) => SETORES_FABRICACAO.some(s => itensPreenchidos(valor?.[s] || []).length > 0);

export function FabricacaoInternaEditor({ valor, onChange, qtdOps = 1, pinturaSlot = null }:
  { valor: any; onChange: (v: any) => void; qtdOps?: number;
    /** bloco de pintura da Serralheria, montado por quem usa o editor — fica
     *  aqui embaixo da lista de peças (ver PinturaSerralheria.tsx) */
    pinturaSlot?: React.ReactNode }) {
  const [aberto, setAberto] = useState(temFabricacao(valor));
  // A sugestão automática chega depois que o modal já abriu (é uma consulta):
  // quando ela preenche a lista, abre sozinha uma vez, para a pessoa conferir
  // o que vai ser aberto antes de liberar. Depois disso quem manda é o clique.
  const abriuSozinho = useRef(false);
  useEffect(() => {
    if (!abriuSozinho.current && temFabricacao(valor)) { abriuSozinho.current = true; setAberto(true); }
  }, [valor]);
  return (
    <div style={{ border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
      <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 800, color: '#6d28d9' }}>
        {aberto ? '▼' : '▶'} 🔌 Fabricação interna — chicotes e serralheria (opcional)
      </button>
      {aberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <div style={{ fontSize: 9, color: '#6b21a8' }}>
            Escolha o modelo e a quantidade{qtdOps > 1 ? ` por OP (vale para as ${qtdOps} OPs)` : ''}. Cada setor recebe uma demanda com os itens,
            a estrutura do modelo e as OPs vinculadas.
          </div>
          {SETORES_FABRICACAO.map(setor => (
            <div key={setor}>
              <ItensDemandaEditor titulo={setor} categoriaPreferida={CATEGORIA_DO_SETOR[setor]}
                itens={valor?.[setor] || [itemVazio()]} onChange={v => onChange({ ...valor, [setor]: v })} />
              {/* peça de serralheria pode ir para pintura (serviço de terceiro) */}
              {setor === 'Serralheria' && pinturaSlot && itensPreenchidos(valor?.[setor] || []).length > 0 && pinturaSlot}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Abre uma demanda avulsa por setor com itens. Quantidade do editor é por OP. */
export async function gerarDemandasFabricacao({ valor, ops, origem, currentUser, obs = '', pintura = null }: {
  valor: any; ops: any[]; origem: string; currentUser: any; obs?: string;
  /** Só para a Serralheria: { pintura, pintura_tipo } — ver PinturaSerralheria.tsx */
  pintura?: any;
}) {
  const agora = new Date().toISOString();
  const vinculos = ops.map(o => ({ tipo: 'op', id: String(o.id), descricao: `${o.opl} — ${o.cliente_nome || o.modelo || ''}`.replace(/ — $/, '') }));
  const base = ops.length > 1 ? String(ops[0].opl || '').replace(/\/\d+$/, '') : ops[0]?.opl;
  const quem = origem.startsWith('engenharia') ? 'Engenharia' : 'PCP';
  const criadas: string[] = [];
  const falhas: string[] = [];
  for (const setor of SETORES_FABRICACAO) {
    const itens = itensPreenchidos(valor?.[setor] || []).map(i => ({
      ...i,
      descricao: [i.descricao, ops.length > 1 ? `${i.quantidade} por OP × ${ops.length} OPs` : ''].filter(Boolean).join(' · '),
      quantidade: Number(i.quantidade) * ops.length,
    }));
    if (!itens.length) continue;
    const titulo = `${setor === 'Chicotes' ? 'Chicotes' : 'Serralheria'} — ${base}${ops.length > 1 ? ` (${ops.length} OPs)` : ''}`;
    const { error } = await supabase.from('demandas_avulsas').insert([{
      setor, titulo, status: 'Pendente', prioridade: 'Média',
      descricao: `Aberta pela ${quem} ao ${origem.endsWith('kiting') ? 'liberar o kiting' : 'liberar a BOM'}.${obs ? ' ' + obs : ''}`,
      itens, informacoes: [], etapas: [], origem,
      // pintura é coisa de peça de serralheria; o Chicotes não usa
      ...(setor === 'Serralheria' && pintura?.pintura
        ? { pintura: true, pintura_tipo: String(pintura.pintura_tipo || '').trim() || null } : {}),
      ...camposDosVinculos(vinculos),
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, criado_em: agora, atualizado_em: agora,
    }]);
    if (error) { falhas.push(`${setor}: ${error.message}`); continue; }
    criadas.push(setor);
    notificarEvento('demanda_criada_setor', msg.demandaCriada(setor, ops.map(o => o.opl).join(', '), titulo, currentUser?.nome || ''), setor);
  }
  return { criadas, falhas };
}
