// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MODO DE EXIBIÇÃO DO CARD ABERTO (Licitações e Comercial/CRM)
// O card abre dividido: formulário à esquerda, abas (formação de preço,
// arquivos...) à direita. Aqui a pessoa escolhe trabalhar dividido, só com o
// formulário ou só com as abas — e volta ao dividido quando quiser.
//
// ESCONDER É SÓ VISUAL (display:none), NUNCA DESMONTAR. O lado direito tem a
// Formação de Preços, que guarda trabalho não salvo em memória; se o painel
// fosse removido da tela ao trocar de modo, esse trabalho sumiria — o mesmo tipo
// de perda que já aconteceu em 08/09. Com display:none tudo continua vivo.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';

export type ModoSplit = 'dividido' | 'esquerda' | 'direita';

/** Modo lembrado por tela (preferência de quem usa, não dado do card). */
export function useModoSplit(tela: string): [ModoSplit, (m: ModoSplit) => void] {
  const chave = `acn:modo-split:${tela}`;
  const [modo, setModoState] = useState<ModoSplit>(() => {
    try {
      const v = localStorage.getItem(chave);
      return v === 'esquerda' || v === 'direita' ? v : 'dividido';
    } catch { return 'dividido'; }
  });
  const setModo = useCallback((m: ModoSplit) => {
    setModoState(m);
    try { localStorage.setItem(chave, m); } catch { /* sem storage: vale só nesta sessão */ }
  }, [chave]);
  return [modo, setModo];
}

/** Estilos dos três pedaços do split para cada modo. */
export function estilosSplit(modo: ModoSplit, larguraEsqPct: number, minEsq: number) {
  return {
    esquerda: modo === 'direita'
      ? { display: 'none' }
      : modo === 'esquerda'
        ? { width: '100%', flex: 1 }
        : { width: `${larguraEsqPct}%`, minWidth: minEsq },
    divisor: modo === 'dividido' ? {} : { display: 'none' },
    direita: modo === 'esquerda' ? { display: 'none' } : {},
  };
}

const OPCOES: { valor: ModoSplit; icone: string; titulo: string }[] = [
  { valor: 'esquerda', icone: '◧', titulo: 'Só o formulário' },
  { valor: 'dividido', icone: '◫', titulo: 'Dividido (formulário + abas)' },
  { valor: 'direita',  icone: '◨', titulo: 'Só as abas (formação de preço, arquivos...)' },
];

/** Seletor de 3 botões. `escuro` = para cabeçalho colorido (texto branco). */
export function SeletorModoSplit({ modo, onModo, escuro = false }: { modo: ModoSplit; onModo: (m: ModoSplit) => void; escuro?: boolean }) {
  return (
    <div role="group" aria-label="Modo de exibição"
      style={{ display: 'inline-flex', borderRadius: 5, overflow: 'hidden', flexShrink: 0,
        border: `1px solid ${escuro ? 'rgba(255,255,255,.45)' : '#cbd5e1'}` }}>
      {OPCOES.map(o => {
        const ativo = modo === o.valor;
        return (
          <button key={o.valor} type="button" onClick={() => onModo(o.valor)}
            title={o.titulo} aria-pressed={ativo}
            style={{ border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: 13, lineHeight: 1.2,
              background: ativo ? (escuro ? 'rgba(255,255,255,.9)' : '#1e3a5f') : (escuro ? 'transparent' : '#fff'),
              color: ativo ? (escuro ? '#1e293b' : '#fff') : (escuro ? '#fff' : '#475569') }}>
            {o.icone}
          </button>
        );
      })}
    </div>
  );
}
