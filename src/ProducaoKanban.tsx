// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// KANBAN DA PRODUÇÃO — visualização alternativa à tabela.
//
// As colunas são por URGÊNCIA DE DATA, não por status. Motivo: as datas são
// contratuais (licitações), então o que o gerente precisa ver primeiro é o que
// vence antes — não em que etapa está. O status aparece no card.
//
// A prioridade é só DESEMPATE entre OPs do mesmo dia, como definido pelo
// usuário: ordena por data e, dentro do mesmo dia, pelo número de prioridade.
//
// Cada coluna mostra 10 cards e pagina (KanbanColuna), senão "Atrasadas" —
// que hoje tem 70 — viraria uma coluna sem fim.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import KanbanColuna from './KanbanColuna';
import { temSerralheria } from './FluxoEntrega';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const maisDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (d) => (d ? d.split('-').reverse().join('/') : '—');
const diasAtraso = (d) =>
  Math.round((new Date(hojeISO() + 'T12:00').getTime() - new Date(d + 'T12:00').getTime()) / 86400000);

export const COLUNAS = [
  { id: 'atrasadas', titulo: 'Atrasadas',    cor: '#dc2626', fundo: '#fef2f2' },
  { id: 'hoje',      titulo: 'Vencem hoje',  cor: '#ea580c', fundo: '#fff7ed' },
  { id: 'amanha',    titulo: 'Vencem amanhã',cor: '#ca8a04', fundo: '#fefce8' },
  { id: 'semana',    titulo: 'Esta semana',  cor: '#0891b2', fundo: '#ecfeff' },
  { id: 'depois',    titulo: 'Depois',       cor: '#4f46e5', fundo: '#eef2ff' },
  { id: 'sem_prazo', titulo: 'Sem prazo',    cor: '#64748b', fundo: '#f8fafc' },
];

export function colunaDe(o) {
  const d = o?.data_prevista_entrega;
  if (!d) return 'sem_prazo';
  const hoje = hojeISO();
  if (d < hoje)            return 'atrasadas';
  if (d === hoje)          return 'hoje';
  if (d === maisDias(1))   return 'amanha';
  if (d <= maisDias(7))    return 'semana';
  return 'depois';
}

/** Data primeiro (contratual), prioridade só desempata o mesmo dia.
 *  Sem prioridade vai depois das priorizadas daquele dia. */
export function ordenar(a, b) {
  const da = a.data_prevista_entrega || '9999-12-31';
  const db = b.data_prevista_entrega || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const pa = a.prioridade_dia ?? 999;
  const pb = b.prioridade_dia ?? 999;
  if (pa !== pb) return pa - pb;
  return (a.opl || '').localeCompare(b.opl || '');
}

export default function ProducaoKanban({ opls, onAction, onPrioridade, currentUser }: any) {
  const porColuna = (id) => opls.filter(o => colunaDe(o) === id).sort(ordenar);

  const card = (o) => {
    const emProd     = o.status_geral === 'Em Producao';
    const retrabalho = o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho';
    const semDono    = !o.responsavel_producao && !o.equipe_nome;
    const responsavel = (o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao) || null;

    return (
      <div key={o.id}
        style={{ background: '#fff', border: `1px solid ${retrabalho ? '#fca5a5' : '#e2e8f0'}`,
          borderLeft: `4px solid ${retrabalho ? '#dc2626' : emProd ? '#16a34a' : '#94a3b8'}`,
          borderRadius: 6, padding: '7px 9px', boxShadow: '0 1px 2px #0000000d' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{o.opl}</span>
          {o.prioridade_dia != null && (
            <span title="Prioridade no dia" style={{ fontSize: 8, fontWeight: 800, background: '#fef3c7',
              color: '#92400e', border: '1px solid #fcd34d', borderRadius: 3, padding: '0 4px' }}>
              {o.prioridade_dia}º
            </span>
          )}
          {temSerralheria(o) && (
            <span title="Passa pela serralheria" style={{ fontSize: 8, fontWeight: 800, background: '#e0e7ff',
              color: '#3730a3', border: '1px solid #a5b4fc', borderRadius: 3, padding: '0 4px' }}>🔩</span>
          )}
        </div>

        <div style={{ fontSize: 10, color: '#334155', fontWeight: 600, wordBreak: 'break-word' }}>
          {o.cliente_nome || '—'}
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8', wordBreak: 'break-word' }}>{o.modelo || '—'}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 8, fontWeight: 800, borderRadius: 3, padding: '1px 5px',
            background: emProd ? '#dcfce7' : retrabalho ? '#fee2e2' : '#f1f5f9',
            color: emProd ? '#166534' : retrabalho ? '#991b1b' : '#475569' }}>
            {o.status_geral}
          </span>
          {/* "Ninguém pegou" é o sinal mais acionável do quadro: separa decisão
              pendente do gerente de acompanhamento de trabalho em andamento. */}
          {semDono ? (
            <span style={{ fontSize: 8, fontWeight: 800, background: '#fff7ed', color: '#c2410c',
              border: '1px dashed #fdba74', borderRadius: 3, padding: '1px 5px' }}>
              sem responsável
            </span>
          ) : (
            <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>👤 {responsavel}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 5, gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: colunaDe(o) === 'atrasadas' ? '#dc2626' : '#475569' }}>
            {fmt(o.data_prevista_entrega)}
            {colunaDe(o) === 'atrasadas' && ` · ${diasAtraso(o.data_prevista_entrega)}d`}
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => onPrioridade(o)} title="Definir prioridade no dia"
              style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e' }}>
              ⇅
            </button>
            {/* 💬 fica sempre visível: é por onde sai a informação que o
                vendedor precisa, e escondê-lo é o mesmo que não existir. */}
            <button onClick={() => onAction('acomp', o)} title="Dar um recado sobre esta OP (1 clique)"
              style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca' }}>
              💬
            </button>
            {o.status_geral === 'Aguardando Inicio Producao' && (<>
              <button onClick={() => onAction('iniciar', o)} title="Inicia agora com você como responsável"
                style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                  border: 'none', background: '#16a34a', color: '#fff' }}>
                ▶ INICIAR
              </button>
              <button onClick={() => onAction('iniciar_opcoes', o)} title="Iniciar em dupla ou com uma equipe"
                style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid #16a34a', background: '#fff', color: '#16a34a' }}>
                👥
              </button>
            </>)}
            {emProd && (
              <button onClick={() => onAction('checklist', o)} title="Conclui a produção e envia para o Controle de Qualidade"
                style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                  border: 'none', background: '#0891b2', color: '#fff' }}>
                ✅ CONCLUIR
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
      {COLUNAS.map(c => (
        <KanbanColuna key={c.id} titulo={c.titulo} cor={c.cor} fundo={c.fundo}
          itens={porColuna(c.id)} renderCard={card} vazio="Nenhuma OP" />
      ))}
    </div>
  );
}
