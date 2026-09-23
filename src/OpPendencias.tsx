// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PENDÊNCIAS DE FABRICAÇÃO E COMPRA — o que segura a OP e como ela se libera
//
// Regra definida pelo usuário em 21/09/2026:
//   • o Almoxarifado NÃO fecha "Kit 100%" com demanda de Serralheria, Chicotes
//     ou Compras em aberto — nesse caso ele usa "Liberar com pendência", que
//     continua funcionando como sempre;
//   • com kit liberado com pendência, o PCP libera a produção normalmente;
//   • a Produção NÃO conclui a sua etapa enquanto a pendência não fechar;
//   • e uma pendência só fecha em TRÊS etapas:
//        1. o setor responsável conclui a demanda;
//        2. o Almoxarifado confirma o recebimento do material;
//        3. o PCP libera aquela pendência para a produção.
//   • enquanto isso, um checklist discreto mostra o que falta, até 100%.
//
// O que está ligado à OP quem responde é OpVinculos.ts. Aqui só se decide o
// que segura, em que etapa está, e se desenha o checklist.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { vinculosDaOp } from './OpVinculos';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';

/** Setores cuja demanda em aberto segura a OP. Engenharia e Laboratório ficam
 *  de fora de propósito: são apoio e nem sempre a OP depende deles para sair. */
export const SETORES_QUE_SEGURAM = ['Serralheria', 'Chicotes', 'Compras'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Demanda/compra cancelada ou descartada não vai virar material nenhum —
 *  não é pendência, é trabalho que parou de existir. Achado em 23/09/2026:
 *  itens cancelados ficavam pedindo "recebimento pelo Almoxarifado" de algo
 *  que nunca seria fabricado, e a OP nunca mais fechava. */
const foiCancelada = (v) => /cancelad|descartad/.test(norm(v.status));
const seguraAOp = (v) => {
  if (foiCancelada(v)) return false;
  if (v.grupo === 'compra') return true;
  if (v.grupo !== 'demanda') return false;
  return SETORES_QUE_SEGURAM.some(s => norm(v.setor) === norm(s));
};

/** Etapas de uma pendência. `op.pendencias_kit[id]` guarda as etapas 2 e 3. */
export function etapasDaPendencia(v, op) {
  const reg = (op?.pendencias_kit || {})[v.id] || {};
  return {
    setor:    !v.aberto,                 // status da própria demanda
    recebido: !!reg.recebido,
    liberado: !!reg.liberado,
    quemRecebeu:  reg.recebido || null,
    quemLiberou:  reg.liberado || null,
  };
}
export const pendenciaFechada = (v, op) => {
  const e = etapasDaPendencia(v, op);
  return e.setor && e.recebido && e.liberado;
};

/** Pendências da OP: as demandas de fabricação/compra que ainda não fecharam
 *  as três etapas. Lista vazia = OP sem nada segurando. */
export function pendenciasDaOp(vinculos, op) {
  return (vinculos || []).filter(seguraAOp).filter(v => !pendenciaFechada(v, op));
}

/** Quantas das 3 etapas já foram cumpridas, somando todas as pendências. */
export function progressoPendencias(vinculos, op) {
  const todas = (vinculos || []).filter(seguraAOp);
  if (!todas.length) return { total: 0, feitas: 0, pct: 100, pendentes: [] };
  const feitas = todas.reduce((s, v) => {
    const e = etapasDaPendencia(v, op);
    return s + Number(e.setor) + Number(e.recebido) + Number(e.liberado);
  }, 0);
  const total = todas.length * 3;
  return { total, feitas, pct: Math.round((feitas / total) * 100), pendentes: pendenciasDaOp(todas, op) };
}

/** Carrega as pendências de uma OP (usado pelas telas que precisam travar). */
export async function carregarPendencias(op) {
  const vinculos = await vinculosDaOp(op);
  const todas = vinculos.filter(seguraAOp);
  return { todas, abertas: pendenciasDaOp(todas, op) };
}

/** Mensagem de bloqueio, ou '' quando pode seguir. */
export function motivoBloqueio(abertas, acao) {
  if (!abertas?.length) return '';
  const lista = abertas.map(v => `• ${v.setor || 'Setor'}: ${v.titulo}`).join('\n');
  return `${acao} com ${abertas.length} pendência(s) de fabricação/compra em aberto:\n\n${lista}`;
}

// ── Gravação das etapas 2 e 3 ────────────────────────────────────────────────
async function marcarEtapa(op, vinculo, etapa, currentUser, onFeito) {
  const agora = new Date().toISOString();
  const atual = { ...(op.pendencias_kit || {}) };
  const reg = { ...(atual[vinculo.id] || {}) };
  reg[etapa] = { por: currentUser?.nome || currentUser?.email || '—', em: agora };
  atual[vinculo.id] = reg;
  const { error } = await supabase.from('oples').update({ pendencias_kit: atual }).eq('id', op.id);
  if (error) { alert('Não foi possível registrar: ' + error.message); return false; }
  const texto = etapa === 'recebido'
    ? `Almoxarifado confirmou o recebimento de "${vinculo.titulo}" (${vinculo.setor || '—'}).`
    : `PCP liberou a pendência "${vinculo.titulo}" (${vinculo.setor || '—'}) para a produção.`;
  await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: op.id, numero_opl: op.opl, setor: etapa === 'recebido' ? 'Almoxarifado' : 'PCP',
    evento: texto, status_anterior: op.status_geral, status_novo: op.status_geral,
    usuario_nome: currentUser?.nome, data_hora: agora,
  }]);
  logChange({ module: etapa === 'recebido' ? 'almoxarifado' : 'pcp', entityType: 'oples', entityId: op.id,
    changeType: 'UPDATE', oldRow: { pendencias_kit: op.pendencias_kit }, newRow: { pendencias_kit: atual }, user: currentUser });
  onFeito?.(atual);
  return true;
}

// ── Checklist discreto ───────────────────────────────────────────────────────
const Passo = ({ ok, texto, quem }) => (
  <span title={quem ? `${quem.por} · ${new Date(quem.em).toLocaleString('pt-BR')}` : undefined}
    style={{ fontSize: 9.5, color: ok ? '#16a34a' : '#94a3b8', whiteSpace: 'nowrap' }}>
    {ok ? '☑' : '☐'} {texto}
  </span>
);

/**
 * modo: 'almox'  → botão de confirmar recebimento
 *       'pcp'    → botão de liberar a pendência
 *       'ver'    → só leitura (Produção, dossiê, detalhe da OP)
 */
export function ChecklistPendencias({ op, vinculos, modo = 'ver', currentUser, onMudou, compacto = false }) {
  const [reg, setReg] = useState(op?.pendencias_kit || {});
  const [salvando, setSalvando] = useState(null);
  useEffect(() => { setReg(op?.pendencias_kit || {}); }, [op?.id, op?.pendencias_kit]);

  const opAtual = { ...op, pendencias_kit: reg };
  const todas = (vinculos || []).filter(seguraAOp);
  if (!todas.length) return null;
  const { pct } = progressoPendencias(todas, opAtual);

  const agir = async (v, etapa) => {
    const pergunta = etapa === 'recebido'
      ? `Confirmar que o Almoxarifado recebeu "${v.titulo}"?`
      : `Liberar a pendência "${v.titulo}" para a produção?`;
    if (!await confirmar(pergunta)) return;
    setSalvando(v.id);
    await marcarEtapa(opAtual, v, etapa, currentUser, (novo) => { setReg(novo); onMudou?.(novo); });
    setSalvando(null);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: compacto ? '5px 8px' : '7px 10px',
      background: pct === 100 ? '#f0fdf4' : '#fffbeb', marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: pct === 100 ? '#15803d' : '#b45309', textTransform: 'uppercase' }}>
          {pct === 100 ? '✅ Pendências resolvidas' : `Pendências de fabricação/compra — ${pct}%`}
        </span>
        <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', minWidth: 60 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#f59e0b' }} />
        </div>
      </div>
      {todas.map(v => {
        const e = etapasDaPendencia(v, opAtual);
        const fechada = e.setor && e.recebido && e.liberado;
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '3px 0', borderTop: '1px solid #f1f5f9', opacity: fechada ? .65 : 1 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, flex: '1 1 160px', minWidth: 120 }}>
              <span style={{ color: '#7c3aed', fontWeight: 800 }}>{v.setor || '—'}</span> · {v.titulo}
            </span>
            <Passo ok={e.setor}    texto="setor concluiu" />
            <Passo ok={e.recebido} texto="almox recebeu"  quem={e.quemRecebeu} />
            <Passo ok={e.liberado} texto="PCP liberou"    quem={e.quemLiberou} />
            {modo === 'almox' && e.setor && !e.recebido && (
              <button onClick={() => agir(v, 'recebido')} disabled={salvando === v.id}
                style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none', borderRadius: 4,
                  background: '#0f766e', color: '#fff', cursor: 'pointer' }}>
                {salvando === v.id ? '...' : '✔ Recebi'}
              </button>
            )}
            {modo === 'pcp' && e.setor && e.recebido && !e.liberado && (
              <button onClick={() => agir(v, 'liberado')} disabled={salvando === v.id}
                style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none', borderRadius: 4,
                  background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}>
                {salvando === v.id ? '...' : '✔ Liberar'}
              </button>
            )}
            {modo === 'almox' && !e.setor && (
              <span style={{ fontSize: 9, color: '#b45309' }}>aguardando o setor concluir</span>
            )}
            {modo === 'pcp' && !e.liberado && (
              <span style={{ fontSize: 9, color: '#b45309' }}>
                {!e.setor ? 'aguardando o setor concluir' : !e.recebido ? 'aguardando o Almoxarifado receber' : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Carrega os vínculos e desenha o checklist — para telas que não têm a lista. */
export function ChecklistPendenciasAuto({ op, modo = 'ver', currentUser, onMudou, compacto = false }) {
  const [vinculos, setVinculos] = useState(null);
  useEffect(() => {
    if (!op?.id) return;
    let vivo = true;
    vinculosDaOp(op).then(v => { if (vivo) setVinculos(v); });
    return () => { vivo = false; };
  }, [op?.id]);
  if (!vinculos) return null;
  return <ChecklistPendencias op={op} vinculos={vinculos} modo={modo} currentUser={currentUser}
    onMudou={onMudou} compacto={compacto} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICE REVERSO — quais OPs têm pendência, numa consulta só
//
// O caminho normal (OpVinculos.vinculosDaOp) parte da OP e faz ~13 consultas.
// Para uma LISTA de OPs isso não serve, então aqui a busca é ao contrário:
// parte das demandas em aberto dos três setores e devolve as OPs que elas
// seguram. Duas consultas para a tela inteira.
// ─────────────────────────────────────────────────────────────────────────────
const ENCERRADOS = ['Concluido', 'Concluído', 'Concluida', 'Concluída', 'Cancelada', 'Cancelado', 'Descartado'];
/** Cancelada/Descartado sai da lista de vez: não é pendência aguardando
 *  recebimento, é trabalho que não vai mais existir (ver foiCancelada acima). */
const CANCELADOS_RE = /cancelad|descartad/i;

export async function indicePendencias() {
  const mapa = new Map();               // opId -> [{id, setor, titulo, aberto}]
  const add = (opId, item) => {
    if (!opId || CANCELADOS_RE.test(item.statusBruto || '')) return;
    const k = String(opId);
    if (!mapa.has(k)) mapa.set(k, []);
    if (!mapa.get(k).some(x => x.id === item.id)) mapa.get(k).push(item);
  };

  const [setoriais, avulsas, compras] = await Promise.all([
    supabase.from('demandas_setoriais').select('id,opl_id,setor_destino,descricao,status')
      .not('opl_id', 'is', null).in('setor_destino', SETORES_QUE_SEGURAM),
    supabase.from('demandas_avulsas').select('id,setor,titulo,status,vinculo_id,vinculos')
      .in('setor', SETORES_QUE_SEGURAM),
    supabase.from('pcp_pedidos_compra').select('id,vinculo_id,numero_pedido,descricao_material,status_compra')
      .not('vinculo_id', 'is', null),
  ]);

  (setoriais.data || []).forEach(d => add(d.opl_id, {
    id: d.id, setor: d.setor_destino, titulo: d.descricao || `Demanda ${d.setor_destino}`,
    aberto: !ENCERRADOS.includes(String(d.status || '')), statusBruto: d.status,
  }));

  (avulsas.data || []).forEach(d => {
    const item = { id: d.id, setor: d.setor, titulo: d.titulo || `Demanda ${d.setor}`,
      aberto: !ENCERRADOS.includes(String(d.status || '')), statusBruto: d.status };
    add(d.vinculo_id, item);
    (Array.isArray(d.vinculos) ? d.vinculos : []).forEach(v => { if (v?.tipo === 'op' || !v?.tipo) add(v?.id, item); });
  });

  (compras.data || []).forEach(c => add(c.vinculo_id, {
    id: c.id, setor: 'Compras', titulo: c.descricao_material || c.numero_pedido || 'Pedido de compra',
    aberto: !ENCERRADOS.includes(String(c.status_compra || '')), statusBruto: c.status_compra,
  }));

  return mapa;
}

/** O Almoxarifado só fecha "Kit 100%" quando tem tudo em mãos: nenhuma demanda
 *  dos três setores pode estar em aberto nem esperando o recebimento. */
export function travaKit100(pendenciasDaOp, op) {
  const faltando = (pendenciasDaOp || []).filter(p => {
    const reg = (op?.pendencias_kit || {})[p.id] || {};
    return p.aberto || !reg.recebido;
  });
  return faltando;
}

/** Só os itens que o SETOR JÁ CONCLUIU e ainda esperam o Almoxarifado confirmar
 *  o recebimento — a etapa que só ele cumpre. Diferente de travaKit100 (que
 *  também lista o que o setor ainda nem terminou): aqui é só o que dá pra agir
 *  agora. Usado no painel de OPs que já saíram do kiting (ver AlmoxarifadoTab). */
export function travaRecebimento(pendenciasDaOp, op) {
  return (pendenciasDaOp || []).filter(p => {
    const reg = (op?.pendencias_kit || {})[p.id] || {};
    return !p.aberto && !reg.recebido;
  });
}

/** A Produção só conclui com as três etapas cumpridas em todas as pendências. */
export function travaConclusaoProducao(pendenciasDaOp, op) {
  return (pendenciasDaOp || []).filter(p => {
    const reg = (op?.pendencias_kit || {})[p.id] || {};
    return p.aberto || !reg.recebido || !reg.liberado;
  });
}

export const textoFaltando = (faltando) =>
  (faltando || []).map(p => `• ${p.setor}: ${p.titulo}`).join('\n');
