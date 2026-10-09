// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CELULAR — ajuda para as telas se reorganizarem no telefone.
//
// "Celular" = aparelho de TOQUE com tela até 639px (a mesma regra de
// responsivo.css). No computador, em qualquer largura de janela, useCelular()
// devolve false e as telas renderizam exatamente como sempre.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Botao } from './Interface';

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
  // 12e58 (09/10/2026): só aparência — a faixa, as pílulas e o contador foram para o design.css (`acn-set-*`). Medido antes de mexer: o sistema já repintava estas
  // pílulas em tempo de execução (branca com borda cinza, e a escolhida em verde-marca, quase sem a cor da etapa); agora o CSS diz isso por si — botão secundário/primário
  // do guia no formato de pílula. A cor da etapa (dado) fica só no pontinho antes do título, como já é no cabeçalho das colunas do Kanban (KanbanColuna).
  return (
    <div ref={ref} className="acn-set">
      {etapas.map(e => {
        const sel = e.id === ativa;
        return (
          <Botao key={e.id} variante={sel ? 'primario' : 'secundario'} data-ativa={sel ? '1' : '0'} onClick={() => onChange(e.id)} className="acn-set-bt">
            {e.cor && <i className="acn-set-ponto" style={{ background: e.cor }} />}
            {e.titulo}
            <span className="acn-set-n">{e.total}</span>
          </Botao>
        );
      })}
    </div>
  );
}

/** Etapa inicial: a primeira que tem algo; se todas vazias, a primeira. */
export function etapaInicial(etapas: any[]) {
  return (etapas.find(e => e.total > 0) || etapas[0])?.id;
}
