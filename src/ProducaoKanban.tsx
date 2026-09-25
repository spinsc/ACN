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
// Cada coluna tem a altura de 10 cards e rola (KanbanColuna), senão
// "Atrasadas" — que hoje tem 70 — viraria uma coluna sem fim.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import KanbanColuna from './KanbanColuna';
import { useCelular, SeletorEtapas, etapaInicial } from './Celular';
import { temSerralheria } from './FluxoEntrega';
import { OrigemVendaBadge } from './OrigemVenda';
import { Botao, Selo, Tag, hojeISO, diaISO } from './Interface';
import { mdiSwapVertical, mdiMessageTextOutline, mdiAccountGroupOutline, mdiPlay, mdiCheck, mdiTrayArrowDown, mdiChevronUp, mdiChevronDown } from '@mdi/js';

const maisDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return diaISO(d); };
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

const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

// Unidades do mesmo lote (/01, /02...) na mesma coluna viram UM cartão de lote,
// como na visão em tabela — antes um lote de 18 enchia a coluna com 18 cartões.
function agruparLotes(lista) {
  const feitos = new Set();
  const out = [];
  for (const o of lista) {
    const base = baseOplDe(o.opl);
    if (feitos.has(base)) continue;
    const irmaos = /\/\d+$/.test(o.opl || '') ? lista.filter(x => baseOplDe(x.opl) === base) : [o];
    if (irmaos.length > 1) {
      feitos.add(base);
      out.push({ _lote: true, base, irmaos: [...irmaos].sort((a, b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
    } else {
      out.push(o);
    }
  }
  return out;
}

export default function ProducaoKanban({ opls, onAction, onPrioridade, currentUser, onImportarLote }: any) {
  const porColuna = (id) => opls.filter(o => colunaDe(o) === id).sort(ordenar);
  const celular = useCelular();
  const [etapaCel, setEtapaCel] = useState(null);
  const [lotesAbertos, setLotesAbertos] = useState({});

  const card = (o) => {
    const emProd     = o.status_geral === 'Em Producao';
    const retrabalho = o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho';
    const semDono    = !o.responsavel_producao && !o.equipe_nome;
    const responsavel = (o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao) || null;
    const atrasada   = colunaDe(o) === 'atrasadas';

    return (
      <div key={o.id} className={'acn-kcard' + (retrabalho ? ' alerta' : emProd ? ' andamento' : '')}>
        <div className="acn-kmeta">
          <span className="acn-mono acn-forte">{o.opl}</span>
          <OrigemVendaBadge origem={o.origem_venda} />
          {o.prioridade_dia != null && <Tag title="Prioridade no dia">{o.prioridade_dia}º</Tag>}
          {temSerralheria(o) && <Tag title="Passa pela serralheria">Serralheria</Tag>}
        </div>

        <div>
          <h6>{o.cliente_nome || '—'}</h6>
          <div className="acn-kmeta">{o.modelo || '—'}</div>
        </div>

        <div className="acn-kmeta">
          <Selo status={o.status_geral} />
          {/* "Ninguém pegou" é o sinal mais acionável do quadro: separa decisão
              pendente do gerente de acompanhamento de trabalho em andamento. */}
          {semDono ? <Selo familia="atencao" ponto={false}>Sem responsável</Selo> : <span>{responsavel}</span>}
        </div>

        <div className="acn-kmeta">
          <span className="acn-num" style={atrasada ? { color: 'var(--acn-bad)', fontWeight: 500 } : undefined}>
            {fmt(o.data_prevista_entrega)}
            {atrasada && ` · ${diasAtraso(o.data_prevista_entrega)} d`}
          </span>
          <span className="dir-auto" style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Botao pequeno variante="discreto" icone={mdiSwapVertical} onClick={() => onPrioridade(o)}
              title="Definir prioridade no dia" aria-label="Definir prioridade no dia" />
            {/* Recado fica sempre visível: é por onde sai a informação que o
                vendedor precisa, e escondê-lo é o mesmo que não existir. */}
            <Botao pequeno variante="discreto" icone={mdiMessageTextOutline} onClick={() => onAction('acomp', o)}
              title="Dar um recado sobre esta OP (1 clique)" aria-label="Dar um recado sobre esta OP" />
            {o.status_geral === 'Aguardando Inicio Producao' && (<>
              <Botao pequeno variante="discreto" icone={mdiAccountGroupOutline} onClick={() => onAction('iniciar_opcoes', o)}
                title="Iniciar em dupla ou com uma equipe" aria-label="Iniciar em dupla ou com uma equipe" />
              <Botao pequeno variante="primario" icone={mdiPlay} onClick={() => onAction('iniciar', o)}
                title="Inicia agora com você como responsável">Iniciar</Botao>
            </>)}
            {emProd && (
              <Botao pequeno variante="secundario" icone={mdiCheck} onClick={() => onAction('checklist', o)}
                title="Conclui a produção e envia para o Controle de Qualidade">Concluir</Botao>
            )}
          </span>
        </div>
      </div>
    );
  };

  const cardLote = (g, colId) => {
    const chave = `${colId}::${g.base}`;
    const aberto = !!lotesAbertos[chave];
    const primeiro = g.irmaos[0];
    const qtdAguardando = g.irmaos.filter(o => o.status_geral === 'Aguardando Inicio Producao').length;
    const qtdEmProd     = g.irmaos.filter(o => o.status_geral === 'Em Producao').length;
    const qtdRetrab     = g.irmaos.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho').length;
    const qtdSemDono    = g.irmaos.filter(o => !o.responsavel_producao && !o.equipe_nome).length;
    const datas = g.irmaos.map(o => o.data_prevista_entrega).filter(Boolean).sort();
    return (
      <div key={'lote-' + chave} className={'acn-kcard ' + (qtdRetrab ? 'alerta' : 'lote')}>
        <div className="acn-kmeta">
          <span className="acn-mono acn-forte">{g.base}</span>
          <Tag>Lote · {g.irmaos.length} unidades</Tag>
          <OrigemVendaBadge origem={primeiro.origem_venda} />
        </div>
        <div>
          <h6>{primeiro.cliente_nome || '—'}</h6>
          <div className="acn-kmeta">{primeiro.modelo || primeiro.tipo_projeto || '—'}</div>
        </div>
        <div className="acn-kmeta">
          {qtdAguardando > 0 && <Selo familia="neutro">{qtdAguardando} aguardando início</Selo>}
          {qtdEmProd > 0 && <Selo familia="info">{qtdEmProd} em produção</Selo>}
          {qtdRetrab > 0 && <Selo familia="erro">{qtdRetrab} em retrabalho</Selo>}
          {qtdSemDono > 0 && <Selo familia="atencao" ponto={false}>{qtdSemDono} sem responsável</Selo>}
        </div>
        <div className="acn-kmeta">
          <span className="acn-num" style={colunaDe(primeiro) === 'atrasadas' ? { color: 'var(--acn-bad)', fontWeight: 500 } : undefined}>
            {datas.length ? fmt(datas[0]) : 'Sem prazo'}{datas.length > 1 && datas[0] !== datas[datas.length - 1] ? ` a ${fmt(datas[datas.length - 1])}` : ''}
          </span>
          <span className="dir-auto" style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {onImportarLote && (
              <Botao pequeno variante="discreto" icone={mdiTrayArrowDown} onClick={() => onImportarLote(g)}
                title="Importar técnicos/equipes para as unidades do lote" aria-label="Importar técnicos/equipes para as unidades do lote" />
            )}
            <Botao pequeno variante="secundario" icone={aberto ? mdiChevronUp : mdiChevronDown}
              onClick={() => setLotesAbertos(p => ({ ...p, [chave]: !p[chave] }))}>
              {aberto ? 'Ocultar' : `Ver ${g.irmaos.length} unidades`}
            </Botao>
          </span>
        </div>
        {aberto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            {g.irmaos.map(card)}
          </div>
        )}
      </div>
    );
  };
  const renderDaColuna = (colId) => (x) => (x._lote ? cardLote(x, colId) : card(x));

  // Celular: uma coluna por vez, escolhida na faixa de etapas
  if (celular) {
    const etapas = COLUNAS.map(c => ({ ...c, total: porColuna(c.id).length }));
    const ativa = etapas.find(e => e.id === etapaCel) ? etapaCel : etapaInicial(etapas);
    const col = COLUNAS.find(c => c.id === ativa);
    return (
      <div>
        <SeletorEtapas etapas={etapas} ativa={ativa} onChange={setEtapaCel} />
        <KanbanColuna key={col.id} titulo={col.titulo} cor={col.cor} fundo={col.fundo}
          itens={agruparLotes(porColuna(col.id))} contagem={porColuna(col.id).length}
          renderCard={renderDaColuna(col.id)} vazio="Nenhuma OP" larguraMin={0} visiveis={100000} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
      {COLUNAS.map(c => (
        <KanbanColuna key={c.id} titulo={c.titulo} cor={c.cor} fundo={c.fundo}
          itens={agruparLotes(porColuna(c.id))} contagem={porColuna(c.id).length}
          renderCard={renderDaColuna(c.id)} vazio="Nenhuma OP" />
      ))}
    </div>
  );
}
