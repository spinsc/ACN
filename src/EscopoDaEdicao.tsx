// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// "ESTA ALTERAÇÃO VALE PARA" — o seletor das telas de edição quando a OP é uma unidade de lote (pedido do usuário em 16/10/2026).
// A regra de verdade mora em EdicaoDeLote.ts. Começa SEMPRE em "só esta unidade": aplicar no lote inteiro é uma escolha consciente.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { baseDoLoteDe, sufixoDoLoteDe, ehUnidadeDeLote } from './EdicaoDeLote';

/** Quantas unidades tem o lote desta OP (0 se a OP não é de lote). Só a contagem; leitura que falha vale como "não sei" (null). */
export function useTamanhoDoLote(opl: any): number | null {
  const [n, setN] = useState<number | null>(0);
  useEffect(() => {
    if (!ehUnidadeDeLote(opl)) { setN(0); return; }
    let vivo = true;
    supabase.from('oples').select('id', { count: 'exact', head: true }).like('opl', `${baseDoLoteDe(opl)}/%`)
      .then(({ count, error }) => { if (vivo) setN(error ? null : (count || 0)); });
    return () => { vivo = false; };
  }, [opl]);
  return n;
}

export function SeletorEscopo({ opl, tamanho, valor, onChange, texto = '' }: { opl: string; tamanho: number | null; valor: 'unidade' | 'lote'; onChange: (v: 'unidade' | 'lote') => void; texto?: string }) {
  if (!ehUnidadeDeLote(opl) || !(tamanho > 1)) return null;
  const suf = sufixoDoLoteDe(opl);
  const opcoes = [
    { v: 'unidade', rotulo: `Só esta unidade (/${suf})` },
    { v: 'lote', rotulo: `O lote inteiro (${tamanho} unidades)` },
  ];
  return (
    <div className="acn-escopo" role="group" aria-label="Esta alteração vale para" data-escopo={valor}
      style={{ margin: '0 0 10px', padding: '8px 10px', border: `1px solid ${valor === 'lote' ? '#fde68a' : '#e2e8f0'}`, borderRadius: 6, background: valor === 'lote' ? '#fffbeb' : '#f8fafc' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 5 }}>Esta alteração vale para</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {opcoes.map(o => (
          <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => onChange(o.v)}
            style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${valor === o.v ? '#0f766e' : '#cbd5e1'}`, background: valor === o.v ? '#0f766e' : '#fff', color: valor === o.v ? '#fff' : '#334155' }}>
            {o.rotulo}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: valor === 'lote' ? '#92400e' : '#64748b', marginTop: 5 }}>
        {valor === 'lote'
          ? `Só o que você alterar vai para as outras ${tamanho - 1} unidades. Chassi, placa, veículo, status e NF são de cada carro e não mudam. Unidade já faturada ou cancelada não é mexida. ${texto}`
          : 'Só esta OP muda. Para valer em todos os carros, escolha "O lote inteiro".'}
      </div>
    </div>
  );
}
