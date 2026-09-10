// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// COLUNA DE KANBAN COM ROLAGEM
// A coluna tem a altura de 10 cards. Passando disso ela ROLA — como no Trello,
// onde a coluna nunca cresce até o infinito nem obriga a trocar de página pra
// ver o resto. A altura é medida do card real, não chutada: card de OP e card
// de oportunidade têm alturas diferentes, e uma altura fixa em pixels
// cortaria um e sobraria no outro.
//
// (Antes isto era paginado, com ‹ › no rodapé. Rolagem é o que foi pedido, e é
// melhor mesmo: com página, arrastar um card para outro que estava na página
// seguinte era impossível.)
//
// Usada pelos kanbans do sistema para o comportamento ficar igual em todos.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

export const CARDS_VISIVEIS = 10;

/**
 * Mede a altura que N cards ocupam e devolve [ref, altura] para virar
 * `maxHeight` do container que rola. Devolve altura null quando cabe tudo —
 * aí a coluna não ganha barra nenhuma.
 *
 * Roda a cada render de propósito: o conteúdo do card muda (badge que aparece,
 * nome que quebra em duas linhas) e a altura tem que acompanhar. Não faz laço
 * infinito porque o setState com valor igual não re-renderiza, e a margem de
 * 2px absorve o tremor de meio pixel que a barra de rolagem causa.
 */
export function useAlturaDeCards(quantosCabem = CARDS_VISIVEIS) {
  const ref = useRef(null);
  const [altura, setAltura] = useState(null);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const filhos = Array.from(el.children);
    if (filhos.length <= quantosCabem) {
      setAltura(a => (a === null ? a : null));
      return;
    }
    const topo   = el.getBoundingClientRect().top;
    const ultimo = filhos[quantosCabem - 1].getBoundingClientRect().bottom;
    // + el.scrollTop: getBoundingClientRect enxerga a posição JÁ rolada, então
    // sem isso a altura mudaria conforme o usuário rolasse a coluna.
    // + 10: deixa o 11º card espiando embaixo, que é o aviso de que há mais.
    const nova = Math.round(ultimo - topo + el.scrollTop) + 10;
    setAltura(a => (a !== null && Math.abs(a - nova) <= 2 ? a : nova));
  }, [quantosCabem]);

  // Toda renderização: o conteúdo do card muda (badge que aparece, nome que
  // quebra em duas linhas) e a altura tem que acompanhar.
  useLayoutEffect(medir);

  // E quando a janela muda de tamanho, que NÃO gera renderização sozinha —
  // sem isto a coluna fica com a altura medida no tamanho antigo.
  useEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);

  return [ref, altura];
}

export default function KanbanColuna({
  titulo,
  cor = '#64748b',
  fundo = '#f8fafc',
  itens = [],
  renderCard,
  visiveis = CARDS_VISIVEIS,
  larguraMin = 260,
  vazio = 'Nada aqui',
  rodape = null,
}: any) {
  const [refLista, maxAltura] = useAlturaDeCards(visiveis);
  const total = itens.length;

  return (
    <div style={{ flex: `1 1 ${larguraMin}px`, minWidth: larguraMin, maxWidth: 420,
      background: fundo, border: `1px solid ${cor}33`, borderRadius: 8, display: 'flex', flexDirection: 'column' }}>

      <div style={{ background: cor, color: '#fff', padding: '6px 10px', borderRadius: '7px 7px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.3px' }}>{titulo}</span>
        <span style={{ fontSize: 11, fontWeight: 800, background: '#ffffff33', borderRadius: 10, padding: '0 7px' }}>{total}</span>
      </div>

      <div ref={refLista}
        style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, flex: 1,
          boxSizing: 'border-box',
          maxHeight: maxAltura || undefined,
          overflowY: maxAltura ? 'auto' : 'visible',
          // Reserva o espaço da barra desde sempre: sem isto ela aparece, o
          // card fica mais estreito, o texto quebra diferente e a altura medida
          // muda — a coluna ficaria piscando.
          scrollbarGutter: 'stable' }}>
        {total === 0 ? (
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '14px 4px' }}>{vazio}</div>
        ) : itens.map(renderCard)}
      </div>

      {rodape}
    </div>
  );
}
