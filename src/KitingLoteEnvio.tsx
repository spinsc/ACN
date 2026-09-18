// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// KitingLoteEnvio — kiting 100% do lote inteiro de Venda para Envio
//
// Uma tela só com todas as unidades do lote e, em cada uma, uma linha por
// produto vendido (produto + serial ACN), no mesmo formato da embalagem
// (oples.seriais_itens). Dá para colar do Excel ("produto<TAB>serial", uma linha
// por produto): preenche a partir da linha clicada e segue para as próximas
// unidades. Confirmar dá Kit OK em todas de uma vez; a embalagem continua sendo
// por unidade e já abre com estes seriais.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';

type Linha = { opId: string; opl: string; produto: string; serial: string };

const linhasIniciais = (ops: any[]): Linha[] => ops.flatMap(o => {
  const ja = Array.isArray(o.seriais_itens) ? o.seriais_itens : [];
  const qtd = Math.max(1, Number(o.quantidade) || 1, ja.length);
  return Array.from({ length: qtd }, (_, i) => ({ opId: String(o.id), opl: o.opl, produto: ja[i]?.produto || '', serial: ja[i]?.serial || '' }));
});

export function ModalKitingLoteEnvio({ base, ops, onClose, onConfirmar }: {
  base: string; ops: any[]; onClose: () => void;
  onConfirmar: (porOp: Record<string, { produto: string; serial: string }[]>) => Promise<void>;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(ops));
  const [produtoPadrao, setProdutoPadrao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (i: number, k: 'produto' | 'serial', v: string) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const colar = (i: number, e: any) => {
    const txt = e.clipboardData?.getData('text') || '';
    if (!txt.includes('\n') && !txt.includes('\t')) return;
    e.preventDefault();
    const coladas = txt.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean).map((l: string) => {
      const c = l.split('\t');
      return c.length > 1 ? { produto: c[0].trim(), serial: c.slice(1).join(' ').trim() } : { produto: '', serial: c[0].trim() };
    });
    setLinhas(ls => ls.map((l, j) => {
      const c = coladas[j - i];
      return j >= i && c ? { ...l, produto: c.produto || l.produto, serial: c.serial } : l;
    }));
  };
  const aplicarProdutoPadrao = () => {
    if (!produtoPadrao.trim()) return;
    setLinhas(ls => ls.map(l => l.produto.trim() ? l : { ...l, produto: produtoPadrao.trim() }));
  };
  const completas = linhas.filter(l => l.produto.trim() && l.serial.trim()).length;
  const confirmar = async () => {
    const faltando = linhas.filter(l => !l.produto.trim() || !l.serial.trim());
    if (faltando.length) { alert(`Faltam produto ou serial em ${faltando.length} linha(s). Preencha todas para dar o kit 100% do lote.`); return; }
    const seriais = linhas.map(l => l.serial.trim().toUpperCase());
    const repetido = seriais.find((s, i) => seriais.indexOf(s) !== i);
    if (repetido) { alert(`O serial ${repetido} aparece mais de uma vez.`); return; }
    const porOp: Record<string, any[]> = {};
    linhas.forEach(l => { (porOp[l.opId] ||= []).push({ produto: l.produto.trim(), serial: l.serial.trim() }); });
    setSalvando(true);
    await onConfirmar(porOp);
    setSalvando(false);
  };
  let ultimaOp = '';
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 720, width: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">📦 Kiting 100% em lote — {base}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
          Venda para Envio: informe o serial ACN de cada produto de cada unidade. Pode colar do Excel (produto e serial em colunas,
          uma linha por produto). Confirmar dá Kit OK nas {ops.length} unidades; a embalagem continua por unidade e já abre com estes seriais.
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <input className="acn-input" style={{ flex: 1, minWidth: 200 }} placeholder="Produto padrão (preenche as linhas sem produto)"
            value={produtoPadrao} onChange={e => setProdutoPadrao(e.target.value)} aria-label="Produto padrão" />
          <button className="acn-btn" style={{ background: '#475569' }} onClick={aplicarProdutoPadrao}>Aplicar</button>
          <span style={{ fontSize: 11, fontWeight: 700, color: completas === linhas.length ? '#15803d' : '#b45309' }}>
            {completas}/{linhas.length} preenchidas
          </span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', fontSize: 10, padding: '5px 8px' }}>Unidade</th>
                <th style={{ textAlign: 'left', fontSize: 10, padding: '5px 8px' }}>Produto</th>
                <th style={{ textAlign: 'left', fontSize: 10, padding: '5px 8px' }}>Serial ACN</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const novaOp = l.opl !== ultimaOp;
                ultimaOp = l.opl;
                return (
                  <tr key={i} style={{ borderTop: novaOp ? '2px solid #cbd5e1' : '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: novaOp ? 700 : 400, color: novaOp ? '#1e293b' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {novaOp ? l.opl : '↳'}
                    </td>
                    <td style={{ padding: '3px 4px' }}>
                      <input value={l.produto} onChange={e => set(i, 'produto', e.target.value)} onPaste={e => colar(i, e)}
                        aria-label={`Produto ${l.opl} linha ${i + 1}`}
                        style={{ width: '100%', padding: '4px 6px', border: `1px solid ${l.produto.trim() ? '#d1d5db' : '#fca5a5'}`, borderRadius: 4, fontSize: 11, boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '3px 4px' }}>
                      <input value={l.serial} onChange={e => set(i, 'serial', e.target.value)} onPaste={e => colar(i, e)}
                        aria-label={`Serial ${l.opl} linha ${i + 1}`}
                        style={{ width: '100%', padding: '4px 6px', border: `1px solid ${l.serial.trim() ? '#d1d5db' : '#fca5a5'}`, borderRadius: 4, fontSize: 11,
                          boxSizing: 'border-box', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="acn-btn" style={{ background: '#22c55e', flex: 1, opacity: salvando ? .6 : 1 }} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Aplicando...' : `✅ Kit 100% nas ${ops.length} unidades`}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
