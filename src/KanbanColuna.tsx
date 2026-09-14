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
  contagem = null,   // número mostrado no cabeçalho, quando difere da quantidade de cartões (ex.: lotes agrupados)
}: any) {
  const [refLista, maxAltura] = useAlturaDeCards(visiveis);
  const total = itens.length;

  // Visual do guia: coluna neutra, a cor da etapa fica só no ponto do cabeçalho
  // (`fundo` continua aceito por compatibilidade, mas não pinta mais a coluna).
  return (
    <div className="acn-kcol" style={{ flex: `1 1 ${larguraMin}px`, minWidth: larguraMin, maxWidth: 420 }}>

      <div className="acn-kcab">
        <i style={{ background: cor }} />
        <span>{titulo}</span>
        <em>{contagem ?? total}</em>
      </div>

      <div ref={refLista} className="acn-klista"
        style={{
          maxHeight: maxAltura || undefined,
          overflowY: maxAltura ? 'auto' : 'visible',
          // Reserva o espaço da barra desde sempre: sem isto ela aparece, o
          // card fica mais estreito, o texto quebra diferente e a altura medida
          // muda — a coluna ficaria piscando.
          scrollbarGutter: 'stable' }}>
        {total === 0 ? (
          <div className="acn-kvazio">{vazio}</div>
        ) : itens.map(renderCard)}
      </div>

      {rodape}
    </div>
  );
}
