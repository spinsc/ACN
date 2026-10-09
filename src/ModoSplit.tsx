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
import { Botao } from './Interface';

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
// 12e58 (09/10/2026): só aparência — a moldura e as cores dos três botões (claro, ativo, e a versão `escuro` para cabeçalho colorido) foram para o design.css (`acn-msp-*`).
export function SeletorModoSplit({ modo, onModo, escuro = false }: { modo: ModoSplit; onModo: (m: ModoSplit) => void; escuro?: boolean }) {
  return (
    <div role="group" aria-label="Modo de exibição" className={'acn-msp' + (escuro ? ' escuro' : '')}>
      {OPCOES.map(o => {
        const ativo = modo === o.valor;
        return (
          <Botao key={o.valor} variante="discreto" pequeno onClick={() => onModo(o.valor)} title={o.titulo} aria-pressed={ativo} className="acn-msp-bt">
            {o.icone}
          </Botao>
        );
      })}
    </div>
  );
}
