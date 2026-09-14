// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CELULAR — ajuda para as telas se reorganizarem no telefone.
//
// "Celular" = aparelho de TOQUE com tela até 639px (a mesma regra de
// responsivo.css). No computador, em qualquer largura de janela, useCelular()
// devolve false e as telas renderizam exatamente como sempre.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';

export const MQ_CELULAR = '(hover: none) and (pointer: coarse) and (max-width: 639.98px)';

// Toque = celular OU tablet (sem mouse, tela até 1023px): onde arrastar não funciona
export const MQ_TOQUE = '(hover: none) and (pointer: coarse) and (max-width: 1023.98px)';

function useMedia(mq: string): boolean {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(mq).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(mq);
    const mudou = () => setOk(m.matches);
    mudou();
    m.addEventListener?.('change', mudou);
    return () => m.removeEventListener?.('change', mudou);
  }, [mq]);
  return ok;
}

export function useToque(): boolean {
  return useMedia(MQ_TOQUE);
}

export function ehCelular(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MQ_CELULAR).matches;
}

export function useCelular(): boolean {
  return useMedia(MQ_CELULAR);
}

/**
 * Kanban no celular: uma etapa por vez. Faixa deslizante com as etapas e a
 * contagem de cada uma; a escolhida aparece embaixo em largura total.
 * etapas: [{ id, titulo, cor, total }]
 */
export function SeletorEtapas({ etapas, ativa, onChange }: any) {
  const ref = React.useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[data-ativa="1"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [ativa]);
  return (
    <div ref={ref} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 8px',
      scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch' }}>
      {etapas.map(e => {
        const sel = e.id === ativa;
        return (
          <button key={e.id} data-ativa={sel ? '1' : '0'} onClick={() => onChange(e.id)}
            style={{ flexShrink: 0, scrollSnapAlign: 'center', display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `2px solid ${e.cor || '#64748b'}`,
              background: sel ? (e.cor || '#64748b') : '#fff',
              color: sel ? '#fff' : (e.cor || '#334155') }}>
            {e.titulo}
            <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 10, padding: '0 7px',
              background: sel ? '#ffffff33' : `${e.cor || '#64748b'}1a` }}>{e.total}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Etapa inicial: a primeira que tem algo; se todas vazias, a primeira. */
export function etapaInicial(etapas: any[]) {
  return (etapas.find(e => e.total > 0) || etapas[0])?.id;
}
