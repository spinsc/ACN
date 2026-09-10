// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// COLUNA DE KANBAN COM PAGINAÇÃO
// Mostra no máximo N cards por vez (padrão 10) e pagina dentro da própria
// coluna, no estilo do Trello — em vez de virar uma coluna infinita que obriga
// a rolar sem fim e esconde o rodapé das outras.
//
// Usada por todos os kanbans do sistema para o comportamento ficar igual em
// todos: Produção, CRM e Licitações.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';

export const CARDS_POR_PAGINA = 10;

export default function KanbanColuna({
  titulo,
  cor = '#64748b',
  fundo = '#f8fafc',
  itens = [],
  renderCard,
  porPagina = CARDS_POR_PAGINA,
  larguraMin = 260,
  vazio = 'Nada aqui',
  rodape = null,
}: any) {
  const [pagina, setPagina] = useState(0);
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  // Se a lista encolher (filtro, item movido), a página atual pode deixar de
  // existir — sem isto a coluna ficaria em branco até alguém clicar.
  useEffect(() => { if (pagina > paginas - 1) setPagina(paginas - 1); }, [paginas, pagina]);

  const inicio = pagina * porPagina;
  const visiveis = itens.slice(inicio, inicio + porPagina);

  return (
    <div style={{ flex: `1 1 ${larguraMin}px`, minWidth: larguraMin, maxWidth: 420,
      background: fundo, border: `1px solid ${cor}33`, borderRadius: 8, display: 'flex', flexDirection: 'column' }}>

      <div style={{ background: cor, color: '#fff', padding: '6px 10px', borderRadius: '7px 7px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.3px' }}>{titulo}</span>
        <span style={{ fontSize: 11, fontWeight: 800, background: '#ffffff33', borderRadius: 10, padding: '0 7px' }}>{total}</span>
      </div>

      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {total === 0 ? (
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '14px 4px' }}>{vazio}</div>
        ) : visiveis.map(renderCard)}
      </div>

      {/* Paginação só aparece quando existe mais de uma página */}
      {paginas > 1 && (
        <div style={{ borderTop: `1px solid ${cor}33`, padding: '4px 8px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
            style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, cursor: pagina === 0 ? 'default' : 'pointer',
              border: `1px solid ${cor}55`, background: '#fff', color: cor, opacity: pagina === 0 ? .35 : 1 }}>
            ‹
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>
            {inicio + 1}–{Math.min(inicio + porPagina, total)} de {total}
          </span>
          <button onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1}
            style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, cursor: pagina >= paginas - 1 ? 'default' : 'pointer',
              border: `1px solid ${cor}55`, background: '#fff', color: cor, opacity: pagina >= paginas - 1 ? .35 : 1 }}>
            ›
          </button>
        </div>
      )}

      {rodape}
    </div>
  );
}
