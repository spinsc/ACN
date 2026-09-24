// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO — KANBAN DE TAREFAS
//
// Pedido do usuário em 24/09/2026: um quadro por etapas (A Fazer → Em
// Andamento → Concluído), com responsável e aviso de vencimento — no mesmo
// espírito do sistema de avisos do Compras (ver ComprasFluxo.tsx:
// calcularAlertasCompras/JanelaParadasObrigatoria), mas com prazos próprios:
//
//   • 1 dia antes de vencer   → aviso informativo ("vence amanhã")
//   • no dia do vencimento    → aviso informativo ("vence hoje")
//   • depois de vencida       → aviso OBRIGATÓRIO: motivo do atraso + nova
//                                data de conclusão, numa janela que não fecha
//                                sozinha (só depois de responder cada uma)
//
// O quadro inteiro é visível pra quem tem a aba Financeiro — é um controle de
// equipe, não uma caixa de entrada pessoal. Só os avisos (e a trava) são por
// responsável.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { ColaboradorSelect } from './ColaboradorSelect';
import { confirmar } from './Feedback';

const ETAPAS = ['A Fazer', 'Em Andamento', 'Concluído'];
const COR_ETAPA = { 'A Fazer': '#64748b', 'Em Andamento': '#2563eb', 'Concluído': '#16a34a' };

const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const diasAte = (dataISO) => {
  if (!dataISO) return null;
  const hoje = new Date(hojeISO() + 'T12:00:00');
  const alvo = new Date(String(dataISO).slice(0, 10) + 'T12:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};
const fmtDt = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/** Avisos calculados a partir das tarefas ainda não concluídas. */
export function calcularAvisosFinanceiro(tarefas) {
  const avisos = [];
  for (const t of tarefas) {
    if (t.etapa === 'Concluído' || !t.data_vencimento) continue;
    const dias = diasAte(t.data_vencimento);
    if (dias === 1) avisos.push({ tipo: 'amanha', tarefa: t, dias });
    else if (dias === 0) avisos.push({ tipo: 'hoje', tarefa: t, dias });
    else if (dias < 0) avisos.push({ tipo: 'vencida', tarefa: t, dias: -dias });
  }
  return avisos;
}

const avisosDoUsuario = (avisos, u) =>
  avisos.filter(a => a.tarefa.responsavel_nome && a.tarefa.responsavel_nome === u?.nome);

// ─── Cartão de justificativa (aviso obrigatório de tarefa vencida) ────────────
function CartaoVencida({ tarefa, currentUser, onResolvida }) {
  const [motivo, setMotivo] = useState('');
  const [novaData, setNovaData] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo do atraso.'); return; }
    if (!novaData) { alert('Informe a nova data de conclusão.'); return; }
    if (novaData < hojeISO()) { alert('A nova data não pode ser no passado.'); return; }
    setSalvando(true);
    const patch = {
      data_vencimento: novaData,
      atraso_motivo: motivo.trim(),
      atraso_registrado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    const { error } = await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
      oldRow: { data_vencimento: tarefa.data_vencimento }, newRow: patch, user: currentUser });
    onResolvida?.();
  };

  return (
    <div style={{ border: '1px solid #fca5a5', borderLeft: '3px solid #dc2626', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{tarefa.titulo}</div>
      <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2, fontWeight: 700 }}>
        Venceu em {fmtDt(tarefa.data_vencimento)} — {diasAte(tarefa.data_vencimento) * -1} dia(s) de atraso
      </div>
      <textarea className="acn-input" rows={2} style={{ width: '100%', marginTop: 6, resize: 'vertical', boxSizing: 'border-box' }}
        placeholder="Motivo do atraso *" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 9, fontWeight: 700, color: '#475569' }}>Nova data de conclusão *</label>
        <input type="date" className="acn-input" style={{ width: 150 }} min={hojeISO()}
          value={novaData} onChange={e => setNovaData(e.target.value)} />
        <button onClick={salvar} disabled={salvando}
          style={{ marginLeft: 'auto', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5,
            padding: '6px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {salvando ? 'Salvando...' : 'Registrar e replanejar'}
        </button>
      </div>
    </div>
  );
}

/** Janela bloqueada: não fecha sozinha enquanto sobrar tarefa vencida do usuário. */
function JanelaVencidasObrigatoria({ tarefas, currentUser, onMudou }) {
  const minhas = avisosDoUsuario(calcularAvisosFinanceiro(tarefas), currentUser).filter(a => a.tipo === 'vencida');
  if (!minhas.length) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, width: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title" style={{ color: '#dc2626' }}>
          ⚠️ {minhas.length} tarefa(s) sua(s) vencida(s) no Financeiro
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          Antes de continuar, registre o motivo do atraso e uma nova data de conclusão de cada uma.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {minhas.map(a => <CartaoVencida key={a.tarefa.id} tarefa={a.tarefa} currentUser={currentUser} onResolvida={onMudou} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Painel de avisos (informativo — amanhã / hoje / vencidas de todo mundo) ──
function PainelAvisos({ tarefas, currentUser, isAdmin, onClose }) {
  const todos = calcularAvisosFinanceiro(tarefas);
  const meus = avisosDoUsuario(todos, currentUser);
  const listaBase = isAdmin ? todos : meus;
  const porTipo = (tipo) => listaBase.filter(a => a.tipo === tipo);
  const LABEL = { amanha: 'Vencem amanhã', hoje: 'Vencem hoje', vencida: 'Vencidas' };
  const COR = { amanha: '#b45309', hoje: '#b45309', vencida: '#dc2626' };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.35)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 440, maxWidth: '100vw', height: '100%', background: '#f8fafc',
        boxShadow: '-4px 0 20px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Avisos — Financeiro</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {isAdmin ? 'Toda a equipe' : 'Suas tarefas'} · {listaBase.length ? `${listaBase.length} aviso(s)` : 'nada pendente'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listaBase.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 20 }}>Nada por aqui.</div>
          )}
          {['vencida', 'hoje', 'amanha'].map(tipo => porTipo(tipo).length > 0 && (
            <div key={tipo}>
              <div style={{ fontSize: 10, fontWeight: 800, color: COR[tipo], textTransform: 'uppercase', marginBottom: 4 }}>{LABEL[tipo]}</div>
              {porTipo(tipo).map(a => (
                <div key={a.tarefa.id} style={{ border: '1px solid #e2e8f0', borderLeft: `3px solid ${COR[tipo]}`, borderRadius: 6,
                  padding: '6px 10px', background: '#fff', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{a.tarefa.titulo}</div>
                  <div style={{ fontSize: 9, color: '#64748b' }}>
                    {a.tarefa.responsavel_nome || 'sem responsável'} · vencimento {fmtDt(a.tarefa.data_vencimento)}
                    {tipo === 'vencida' ? ` · ${a.dias} dia(s) de atraso` : ''}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de nova tarefa / edição ─────────────────────────────────────────────
function ModalTarefa({ tarefa, currentUser, onClose, onSalvo }) {
  const editando = !!tarefa?.id;
  const [titulo, setTitulo] = useState(tarefa?.titulo || '');
  const [descricao, setDescricao] = useState(tarefa?.descricao || '');
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel_nome || '');
  const [vencimento, setVencimento] = useState(tarefa?.data_vencimento || '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!titulo.trim()) { alert('Informe o título da tarefa.'); return; }
    setSalvando(true);
    if (editando) {
      const patch = { titulo: titulo.trim(), descricao: descricao.trim() || null,
        responsavel_nome: responsavel.trim() || null, data_vencimento: vencimento || null,
        atualizado_em: new Date().toISOString() };
      const { error } = await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
      setSalvando(false);
      if (error) { alert('Não foi possível salvar: ' + error.message); return; }
      logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
        oldRow: tarefa, newRow: { ...tarefa, ...patch }, user: currentUser });
    } else {
      const { error } = await supabase.from('financeiro_tarefas').insert([{
        titulo: titulo.trim(), descricao: descricao.trim() || null, etapa: 'A Fazer',
        responsavel_nome: responsavel.trim() || null, data_vencimento: vencimento || null,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]);
      setSalvando(false);
      if (error) { alert('Não foi possível criar: ' + error.message); return; }
    }
    onSalvo();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 460, width: '95vw' }}>
        <div className="modal-title">{editando ? 'Editar tarefa' : '+ Nova tarefa'}</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Título *</label>
          <input className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }} value={titulo}
            onChange={e => setTitulo(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Descrição</label>
          <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
            value={descricao} onChange={e => setDescricao(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Responsável</label>
            <ColaboradorSelect value={responsavel} onChange={setResponsavel} incluirUsuariosDaAba="financeiro" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Vencimento</label>
            <input type="date" className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={vencimento || ''} onChange={e => setVencimento(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #d1d5db',
            borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ background: '#0f766e', color: '#fff', border: 'none',
            borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cartão do quadro ───────────────────────────────────────────────────────
function CartaoTarefa({ tarefa, onEditar, onMover, onExcluir, podeExcluir }) {
  const dias = diasAte(tarefa.data_vencimento);
  const vencida = tarefa.etapa !== 'Concluído' && dias != null && dias < 0;
  const urgente = tarefa.etapa !== 'Concluído' && dias != null && dias <= 1 && dias >= 0;
  const idx = ETAPAS.indexOf(tarefa.etapa);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${vencida ? '#dc2626' : urgente ? '#f59e0b' : COR_ETAPA[tarefa.etapa]}`,
      borderRadius: 6, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' }}
      onClick={() => onEditar(tarefa)}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#0f172a' }}>{tarefa.titulo}</div>
      {tarefa.descricao && <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{tarefa.descricao.slice(0, 90)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {tarefa.responsavel_nome && (
          <span style={{ fontSize: 9, background: '#f1f5f9', color: '#475569', borderRadius: 8, padding: '1px 7px' }}>
            👤 {tarefa.responsavel_nome}
          </span>
        )}
        {tarefa.data_vencimento && (
          <span style={{ fontSize: 9, fontWeight: 700, color: vencida ? '#dc2626' : urgente ? '#b45309' : '#64748b' }}>
            {vencida ? `⚠️ venceu ${fmtDt(tarefa.data_vencimento)}` : `📅 ${fmtDt(tarefa.data_vencimento)}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
        {idx > 0 && (
          <button onClick={() => onMover(tarefa, ETAPAS[idx - 1])}
            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
            ← {ETAPAS[idx - 1]}
          </button>
        )}
        {idx < ETAPAS.length - 1 && (
          <button onClick={() => onMover(tarefa, ETAPAS[idx + 1])}
            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none', borderRadius: 4, background: COR_ETAPA[ETAPAS[idx + 1]], color: '#fff', cursor: 'pointer' }}>
            {ETAPAS[idx + 1]} →
          </button>
        )}
        {podeExcluir && (
          <button onClick={() => onExcluir(tarefa)}
            style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 8px', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function FinanceiroKanban({ currentUser }) {
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalTarefa, setModalTarefa] = useState(null); // {} = nova; objeto = editar
  const [painelAvisos, setPainelAvisos] = useState(false);

  const isAdmin = ['Admin', 'Gerente', 'Gerente administrativo'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('financeiro_tarefas').select('*').order('data_vencimento', { ascending: true, nullsFirst: false });
    setTarefas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const mover = async (tarefa, novaEtapa) => {
    const patch = { etapa: novaEtapa, atualizado_em: new Date().toISOString(),
      ...(novaEtapa === 'Concluído' ? { concluido_em: new Date().toISOString() } : {}) };
    await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
    logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
      oldRow: { etapa: tarefa.etapa }, newRow: patch, user: currentUser });
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, ...patch } : t));
  };

  const excluir = async (tarefa) => {
    if (!await confirmar(`Excluir a tarefa "${tarefa.titulo}"?`)) return;
    await supabase.from('financeiro_tarefas').delete().eq('id', tarefa.id);
    setTarefas(prev => prev.filter(t => t.id !== tarefa.id));
  };

  const meusAvisos = avisosDoUsuario(calcularAvisosFinanceiro(tarefas), currentUser);
  const totalAvisos = isAdmin ? calcularAvisosFinanceiro(tarefas).length : meusAvisos.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', flex: 1 }}>📋 Tarefas do Financeiro</div>
        <button onClick={() => setPainelAvisos(true)}
          style={{ background: totalAvisos ? '#fef3c7' : '#fff', color: totalAvisos ? '#b45309' : '#475569',
            border: `1px solid ${totalAvisos ? '#fcd34d' : '#d1d5db'}`, borderRadius: 6, padding: '6px 12px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          🔔 Avisos{totalAvisos ? ` (${totalAvisos})` : ''}
        </button>
        <button onClick={() => setModalTarefa({})}
          style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + Nova tarefa
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, 1fr)`, gap: 12 }}>
          {ETAPAS.map(etapa => {
            const doEtapa = tarefas.filter(t => t.etapa === etapa);
            return (
              <div key={etapa} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, minHeight: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: COR_ETAPA[etapa] }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>{etapa}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>({doEtapa.length})</span>
                </div>
                {doEtapa.length === 0 && <div style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', padding: 10 }}>Vazio</div>}
                {doEtapa.map(t => (
                  <CartaoTarefa key={t.id} tarefa={t} onEditar={setModalTarefa} onMover={mover} onExcluir={excluir} podeExcluir={isAdmin} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {modalTarefa && (
        <ModalTarefa tarefa={modalTarefa.id ? modalTarefa : null} currentUser={currentUser}
          onClose={() => setModalTarefa(null)}
          onSalvo={() => { setModalTarefa(null); carregar(); }} />
      )}
      {painelAvisos && (
        <PainelAvisos tarefas={tarefas} currentUser={currentUser} isAdmin={isAdmin} onClose={() => setPainelAvisos(false)} />
      )}
      {!loading && <JanelaVencidasObrigatoria tarefas={tarefas} currentUser={currentUser} onMudou={carregar} />}
    </div>
  );
}
