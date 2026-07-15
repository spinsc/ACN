// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ColaboradorSelect } from './ColaboradorSelect';
import { supabase } from './supabaseClient';
import MencaoTextarea from './MencaoTextarea';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COR: Record<string, string> = {
  'Pendente':    '#d97706',
  'Em Andamento':'#2563eb',
  'Concluída':   '#16a34a',
};
const PRIO_COR: Record<string, string> = {
  'Alta':'#dc2626', 'Média':'#d97706', 'Baixa':'#16a34a',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
};
// Formata apenas a data (sem hora) — para prazos
const fmtDate = (v: string) => {
  if (!v) return '—';
  // Se vier YYYY-MM-DD, usa T12:00 para evitar shift de fuso
  const d = v.length === 10 ? new Date(v + 'T12:00') : new Date(v);
  return d.toLocaleDateString('pt-BR');
};
// Converte string "YYYY-MM-DD" para ISO evitando UTC shift
const dateToISO = (v: string) => v ? new Date(v + 'T12:00:00').toISOString() : null;
// Converte ISO/timestamp para "YYYY-MM-DD" (para popular input date)
const isoToDate = (v: string) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const fmtH = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
};
const diasParaVencer = (prazo: string): number | null => {
  if (!prazo) return null;
  return Math.ceil((new Date(prazo).getTime() - Date.now()) / 86400000);
};
const alertClass = (prazo: string, status: string): 'vencida' | 'urgente' | null => {
  if (!prazo || status === 'Concluída') return null;
  const d = diasParaVencer(prazo);
  if (d === null) return null;
  if (d < 0) return 'vencida';
  if (d <= 2) return 'urgente';
  return null;
};

async function uploadAnexo(file: File, demandaId: string): Promise<string | null> {
  const path = `demandas-avulsas/${demandaId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

// Status geral calculado pelas etapas
function calcStatusEtapas(etapas: any[]): string {
  if (!etapas || etapas.length === 0) return 'Pendente';
  if (etapas.every(e => e.status === 'Concluída')) return 'Concluída';
  if (etapas.some(e => e.status === 'Em Andamento')) return 'Em Andamento';
  return 'Pendente';
}

function etapaVencida(e: any) {
  return alertClass(e.prazo, e.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE ETAPA (dentro do ModalDetalhe)
// ─────────────────────────────────────────────────────────────────────────────
function EtapaCard({ etapa, idx, total, onUpdate, currentUser }) {
  const [obsExec, setObsExec] = useState('');
  const [salvando, setSalvando] = useState(false);
  const al = etapaVencida(etapa);
  const diasV = diasParaVencer(etapa.prazo);
  const corBorda = al === 'vencida' ? '#dc2626' : al === 'urgente' ? '#d97706' : STATUS_COR[etapa.status] || '#e2e8f0';

  const iniciar = async () => {
    if (!confirm(`Iniciar Etapa ${idx + 1}?`)) return;
    setSalvando(true);
    await onUpdate(idx, { status: 'Em Andamento', data_inicio: new Date().toISOString() });
    setSalvando(false);
  };
  const concluir = async () => {
    if (!confirm(`Concluir Etapa ${idx + 1}?`)) return;
    setSalvando(true);
    await onUpdate(idx, { status: 'Concluída', data_fim: new Date().toISOString() });
    setSalvando(false);
  };
  const addObs = async () => {
    if (!obsExec.trim()) return;
    setSalvando(true);
    const obs_lista = [...(etapa.obs_execucao || []), { texto: obsExec, usuario: currentUser?.nome, data: new Date().toISOString() }];
    await onUpdate(idx, { obs_execucao: obs_lista });
    setObsExec('');
    setSalvando(false);
  };

  const inicio = etapa.data_inicio ? new Date(etapa.data_inicio) : null;
  const fim = etapa.data_fim ? new Date(etapa.data_fim) : null;
  const tempoH = inicio ? ((fim || new Date()).getTime() - inicio.getTime()) / 3600000 : null;

  return (
    <div style={{ border:`1.5px solid ${corBorda}`, borderRadius:8, marginBottom:10, overflow:'hidden' }}>
      {/* Header da etapa */}
      <div style={{ background: corBorda + '15', borderBottom:`1px solid ${corBorda}30`, padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ background: corBorda, color:'#fff', borderRadius:12, padding:'1px 8px', fontSize:9, fontWeight:800 }}>
            ETAPA {idx + 1}/{total}
          </span>
          <span style={{ background: STATUS_COR[etapa.status], color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:9, fontWeight:700 }}>
            {etapa.status}
          </span>
          {al && (
            <span style={{ fontSize:9, fontWeight:700, color: al === 'vencida' ? '#dc2626' : '#d97706' }}>
              {al === 'vencida' ? '🔴 VENCIDA' : `🟡 ${diasV}d`}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:5 }}>
          {etapa.status === 'Pendente' && (
            <button onClick={iniciar} disabled={salvando}
              style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              ▶ Iniciar
            </button>
          )}
          {etapa.status === 'Em Andamento' && (
            <button onClick={concluir} disabled={salvando}
              style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              ✓ Concluir
            </button>
          )}
        </div>
      </div>

      {/* Body da etapa */}
      <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div>
            <div style={{ fontSize:8, color:'#9ca3af', fontWeight:700, textTransform:'uppercase' }}>Responsável</div>
            <div style={{ fontSize:11, fontWeight:600 }}>{etapa.responsavel_nome || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize:8, color:'#9ca3af', fontWeight:700, textTransform:'uppercase' }}>Prazo</div>
            <div style={{ fontSize:11, fontWeight: al ? 700 : 400, color: al === 'vencida' ? '#dc2626' : al === 'urgente' ? '#d97706' : '#1f2937' }}>
              {fmtDate(etapa.prazo)}
            </div>
          </div>
          <div>
            <div style={{ fontSize:8, color:'#9ca3af', fontWeight:700, textTransform:'uppercase' }}>
              {etapa.data_fim ? 'Tempo Total' : etapa.data_inicio ? 'Em andamento' : 'KPI'}
            </div>
            <div style={{ fontSize:11, color:'#2563eb', fontWeight:700 }}>
              {tempoH !== null ? fmtH(tempoH) : '—'}
            </div>
          </div>
        </div>

        {etapa.obs_criacao && (
          <div style={{ fontSize:10, color:'#6b7280', background:'#f8fafc', borderRadius:4, padding:'4px 8px' }}>
            {etapa.obs_criacao}
          </div>
        )}

        {/* Histórico de obs de execução */}
        {(etapa.obs_execucao || []).length > 0 && (
          <div style={{ borderLeft:'2px solid #2563eb', paddingLeft:8 }}>
            {[...(etapa.obs_execucao || [])].reverse().map((o: any, i: number) => (
              <div key={i} style={{ marginBottom:4 }}>
                <span style={{ fontSize:8, color:'#9ca3af' }}>{o.usuario} · {fmtDT(o.data)}</span>
                <div style={{ fontSize:10, color:'#1f2937' }}>{o.texto}</div>
              </div>
            ))}
          </div>
        )}

        {/* Adicionar obs de execução */}
        {etapa.status !== 'Concluída' && (
          <div style={{ display:'flex', gap:6 }}>
            <input value={obsExec} onChange={e => setObsExec(e.target.value)}
              placeholder="Observação durante execução..."
              style={{ flex:1, padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
              onKeyDown={e => e.key === 'Enter' && addObs()} />
            <button onClick={addObs} disabled={salvando || !obsExec.trim()}
              style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'4px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE / EDIÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function ModalDetalhe({ demanda: initial, currentUser, onClose, onRefresh }) {
  const [d, setD] = useState(initial);
  const [anexos, setAnexos] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novaInfo, setNovaInfo] = useState('');
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({ titulo: initial.titulo, descricao: initial.descricao || '', observacoes: initial.observacoes || '', prioridade: initial.prioridade });
  const [designarForm, setDesignarForm] = useState({ responsavel_nome: initial.responsavel_nome || '', responsavel_email: initial.responsavel_email || '', prazo: initial.prazo ? isoToDate(initial.prazo) : '' });
  const [reprogramarForm, setReprogramarForm] = useState({ nova_data: '', motivo: '' });
  const [mostrarReprogramar, setMostrarReprogramar] = useState(false);
  const [mostrarDesignar, setMostrarDesignar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const temEtapas = (d.etapas || []).length > 0;

  const reload = useCallback(async () => {
    const [{ data: dem }, { data: anx }] = await Promise.all([
      supabase.from('demandas_avulsas').select('*').eq('id', d.id).single(),
      supabase.from('demanda_avulsa_anexos').select('*').eq('demanda_id', d.id).order('criado_em', { ascending: false }),
    ]);
    if (dem) setD(dem);
    setAnexos(anx || []);
  }, [d.id]);

  useEffect(() => { reload(); }, [reload]);

  // ── Salvar edição básica ─────────────────────────────────────────────────
  const salvarEdicao = async () => {
    setSalvando(true);
    await supabase.from('demandas_avulsas').update({ ...editForm, atualizado_em: new Date().toISOString() }).eq('id', d.id);
    setEditando(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Designar responsável (somente demandas simples) ──────────────────────
  const salvarDesignar = async () => {
    if (!designarForm.responsavel_nome.trim()) { alert('Informe o responsável!'); return; }
    if (!designarForm.prazo) { alert('Informe o prazo!'); return; }
    setSalvando(true);
    await supabase.from('demandas_avulsas').update({
      responsavel_nome: designarForm.responsavel_nome,
      responsavel_email: designarForm.responsavel_email,
      prazo: dateToISO(designarForm.prazo),
      atualizado_em: new Date().toISOString(),
    }).eq('id', d.id);
    setMostrarDesignar(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Reprogramar prazo ────────────────────────────────────────────────────
  const salvarReprogramar = async () => {
    if (!reprogramarForm.nova_data) { alert('Informe a nova data!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const entrada = {
      tipo: 'reprogramacao',
      prazo_anterior: d.prazo,
      novo_prazo: dateToISO(reprogramarForm.nova_data),
      motivo: reprogramarForm.motivo || '',
      usuario: currentUser?.nome || '',
      data: agora,
      texto: `📅 Prazo reprogramado de ${fmtDate(d.prazo)} → ${fmtDate(reprogramarForm.nova_data)}${reprogramarForm.motivo ? ` — Motivo: ${reprogramarForm.motivo}` : ''}`,
    };
    const infoAtual = [...(d.informacoes || []), entrada];
    await supabase.from('demandas_avulsas').update({
      prazo: dateToISO(reprogramarForm.nova_data),
      informacoes: infoAtual,
      atualizado_em: agora,
    }).eq('id', d.id);
    setReprogramarForm({ nova_data: '', motivo: '' });
    setMostrarReprogramar(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Ações da demanda simples ─────────────────────────────────────────────
  const iniciar = async () => {
    if (!confirm('Marcar início da execução agora?')) return;
    const agora = new Date().toISOString();
    await supabase.from('demandas_avulsas').update({ status: 'Em Andamento', data_inicio: agora, atualizado_em: agora }).eq('id', d.id);
    await reload(); onRefresh();
  };
  const concluir = async () => {
    if (!confirm('Marcar como concluída?')) return;
    const agora = new Date().toISOString();
    await supabase.from('demandas_avulsas').update({ status: 'Concluída', data_fim: agora, atualizado_em: agora }).eq('id', d.id);
    await reload(); onRefresh();
  };

  // ── Atualizar etapa individual ───────────────────────────────────────────
  const updateEtapa = async (idx: number, patch: any) => {
    const etapas = [...(d.etapas || [])];
    etapas[idx] = { ...etapas[idx], ...patch };
    // Recalcula status geral
    const novoStatus = calcStatusEtapas(etapas);
    const agora = new Date().toISOString();
    const upd: any = { etapas, atualizado_em: agora };
    if (novoStatus !== d.status) {
      upd.status = novoStatus;
      if (novoStatus === 'Em Andamento' && !d.data_inicio) upd.data_inicio = agora;
      if (novoStatus === 'Concluída') upd.data_fim = agora;
    }
    await supabase.from('demandas_avulsas').update(upd).eq('id', d.id);
    await reload(); onRefresh();
  };

  // ── Nova informação ──────────────────────────────────────────────────────
  const adicionarInfo = async () => {
    if (!novaInfo.trim()) return;
    setSalvando(true);
    const lista = [...(d.informacoes || []), { texto: novaInfo, usuario: currentUser?.nome, data: new Date().toISOString() }];
    await supabase.from('demandas_avulsas').update({ informacoes: lista, atualizado_em: new Date().toISOString() }).eq('id', d.id);
    setNovaInfo('');
    await reload();
    setSalvando(false);
  };

  // ── Upload de arquivo ────────────────────────────────────────────────────
  const uploadFiles = async (files: FileList) => {
    setSalvando(true);
    for (let i = 0; i < files.length; i++) {
      const url = await uploadAnexo(files[i], d.id);
      if (url) {
        const isImg = files[i].type.startsWith('image/');
        await supabase.from('demanda_avulsa_anexos').insert([{
          demanda_id: d.id, nome: files[i].name, url,
          tipo: isImg ? 'foto' : 'documento',
          criado_por: currentUser?.nome,
        }]);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    setSalvando(false);
  };

  const excluirAnexo = async (id: string) => {
    if (!confirm('Remover este arquivo?')) return;
    await supabase.from('demanda_avulsa_anexos').delete().eq('id', id);
    await reload();
  };

  const alerta = alertClass(d.prazo, d.status);
  const diasV = diasParaVencer(d.prazo);
  const corStatus = STATUS_COR[d.status] || '#6b7280';

  // Progresso de etapas
  const etapas: any[] = d.etapas || [];
  const etapasConcluidas = etapas.filter(e => e.status === 'Concluída').length;
  const pct = etapas.length > 0 ? Math.round((etapasConcluidas / etapas.length) * 100) : 0;

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'min(620px,96vw)', height:'100vh', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px #0003' }}>

        {/* Header */}
        <div style={{ background: corStatus, color:'#fff', padding:'12px 16px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, opacity:.8, fontWeight:600 }}>{d.status.toUpperCase()} · {d.prioridade}</div>
            <div style={{ fontSize:14, fontWeight:700, lineHeight:1.3 }}>{d.titulo}</div>
            {temEtapas ? (
              <div style={{ fontSize:10, opacity:.9, marginTop:2 }}>
                {etapasConcluidas}/{etapas.length} etapas concluídas
              </div>
            ) : (
              d.responsavel_nome && <div style={{ fontSize:10, opacity:.85 }}>👤 {d.responsavel_nome}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', flexShrink:0 }}>✕</button>
        </div>

        {/* Barra de progresso (etapas múltiplas) */}
        {temEtapas && (
          <div style={{ height:5, background:'#e2e8f0', flexShrink:0 }}>
            <div style={{ height:'100%', width:`${pct}%`, background:'#16a34a', transition:'width .4s' }} />
          </div>
        )}

        {/* Alertas de prazo */}
        {alerta && (
          <div style={{ padding:'6px 16px', background: alerta === 'vencida' ? '#fef2f2' : '#fffbeb',
            borderBottom:`1px solid ${alerta === 'vencida' ? '#fca5a5' : '#fcd34d'}`,
            color: alerta === 'vencida' ? '#dc2626' : '#d97706', fontWeight:700, fontSize:11, flexShrink:0 }}>
            {alerta === 'vencida' ? '🔴 TAREFA VENCIDA' : `🟡 Vence em ${diasV} dia${diasV === 1 ? '' : 's'}`} — {fmtDate(d.prazo)}
          </div>
        )}

        {/* Barra de ações */}
        <div style={{ padding:'8px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
          {!temEtapas && d.status === 'Pendente' && (
            <button onClick={iniciar} style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              ▶ Iniciar Execução
            </button>
          )}
          {!temEtapas && d.status === 'Em Andamento' && (
            <button onClick={concluir} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              ✓ Concluir
            </button>
          )}
          {!temEtapas && (
            <button onClick={() => setMostrarDesignar(v => !v)}
              style={{ background: mostrarDesignar ? '#6b7280' : '#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              👤 {d.responsavel_nome ? 'Reatribuir' : 'Designar'}
            </button>
          )}
          {d.status !== 'Concluída' && (
            <button onClick={() => { setMostrarReprogramar(v => !v); setMostrarDesignar(false); setEditando(false); }}
              style={{ background: mostrarReprogramar ? '#6b7280' : '#f97316', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              📅 Reprogramar
            </button>
          )}
          <button onClick={() => { setEditando(v => !v); setMostrarDesignar(false); setMostrarReprogramar(false); }}
            style={{ background: editando ? '#6b7280' : '#475569', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            ✏️ Editar
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:12 }}>

          {/* ── Designar responsável (demanda simples) ── */}
          {mostrarDesignar && !temEtapas && (
            <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:6, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:10, color:'#5b21b6', marginBottom:8 }}>👤 DESIGNAR RESPONSÁVEL</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>NOME *</label>
                  <ColaboradorSelect value={designarForm.responsavel_nome}
                    onChange={v=>setDesignarForm(f=>({...f,responsavel_nome:v}))}
                    placeholder="Selecione" style={{ width:'100%', padding:'5px 8px', border:'1px solid #c4b5fd', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>E-MAIL</label>
                  <input type="email" value={designarForm.responsavel_email} onChange={e=>setDesignarForm(f=>({...f,responsavel_email:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #c4b5fd', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>PRAZO *</label>
                <input type="date" value={designarForm.prazo} onChange={e=>setDesignarForm(f=>({...f,prazo:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #c4b5fd', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={salvarDesignar} disabled={salvando}
                  style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'6px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {salvando ? '...' : '✓ Salvar'}
                </button>
                <button onClick={() => setMostrarDesignar(false)}
                  style={{ padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:11, cursor:'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Reprogramar prazo ── */}
          {mostrarReprogramar && (
            <div style={{ background:'#fff7ed', border:'1px solid #fdba74', borderRadius:6, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:10, color:'#c2410c', marginBottom:8 }}>📅 REPROGRAMAR PRAZO</div>
              <div style={{ fontSize:10, color:'#64748b', marginBottom:8 }}>
                Prazo atual: <strong style={{ color: alerta==='vencida'?'#dc2626':'#1e293b' }}>{fmtDate(d.prazo)}</strong>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>NOVA DATA *</label>
                  <input type="date" value={reprogramarForm.nova_data} onChange={e=>setReprogramarForm(f=>({...f,nova_data:e.target.value}))}
                    min={new Date().toISOString().substring(0,10)}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #fdba74', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>MOTIVO</label>
                  <input value={reprogramarForm.motivo} onChange={e=>setReprogramarForm(f=>({...f,motivo:e.target.value}))}
                    placeholder="Ex: cliente solicitou, aguardando peça..."
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #fdba74', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={salvarReprogramar} disabled={salvando}
                  style={{ background:'#f97316', color:'#fff', border:'none', borderRadius:4, padding:'6px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {salvando ? '...' : '✓ Confirmar'}
                </button>
                <button onClick={() => setMostrarReprogramar(false)}
                  style={{ padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:11, cursor:'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Editar dados básicos ── */}
          {editando && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:10, color:'#374151', marginBottom:8 }}>✏️ EDITAR</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>TÍTULO</label>
                  <input value={editForm.titulo} onChange={e=>setEditForm(f=>({...f,titulo:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>DESCRIÇÃO</label>
                  <MencaoTextarea value={editForm.descricao} onChange={v=>setEditForm(f=>({...f,descricao:v}))} rows={2} style={{fontSize:11}} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>PRIORIDADE</label>
                  <div style={{ display:'flex', gap:6 }}>
                    {['Alta','Média','Baixa'].map(p => (
                      <button key={p} onClick={() => setEditForm(f=>({...f,prioridade:p}))}
                        style={{ flex:1, padding:'4px', border:`1.5px solid ${editForm.prioridade===p?PRIO_COR[p]:'#d1d5db'}`,
                          background: editForm.prioridade===p ? PRIO_COR[p]+'18' : '#fff',
                          color: editForm.prioridade===p ? PRIO_COR[p] : '#374151',
                          borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>OBSERVAÇÕES</label>
                  <MencaoTextarea value={editForm.observacoes} onChange={v=>setEditForm(f=>({...f,observacoes:v}))} rows={3} style={{fontSize:11}} />
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={salvarEdicao} disabled={salvando}
                    style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'6px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    {salvando ? '...' : '✓ Salvar'}
                  </button>
                  <button onClick={() => setEditando(false)}
                    style={{ padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:11, cursor:'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Info principal (demanda simples) ── */}
          {!editando && !temEtapas && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <InfoBlock label="Prazo" value={fmtDate(d.prazo)} alert={alerta} />
              <InfoBlock label="Prioridade" value={d.prioridade} color={PRIO_COR[d.prioridade]} />
              <InfoBlock label="Início Execução" value={fmtDT(d.data_inicio)} />
              <InfoBlock label="Conclusão" value={fmtDT(d.data_fim)} />
              {d.data_inicio && (
                <InfoBlock label={d.data_fim ? 'Tempo Total' : 'Tempo em Andamento'}
                  value={fmtH(((d.data_fim ? new Date(d.data_fim) : new Date()).getTime() - new Date(d.data_inicio).getTime()) / 3600000)}
                  color="#2563eb" />
              )}
              <InfoBlock label="Criado por" value={`${d.criado_por_nome} · ${fmtDT(d.criado_em)}`} />
              {d.descricao && <div style={{ gridColumn:'1/-1' }}><InfoBlock label="Descrição" value={d.descricao} /></div>}
              {d.observacoes && <div style={{ gridColumn:'1/-1' }}><InfoBlock label="Observações" value={d.observacoes} /></div>}
            </div>
          )}

          {/* ── ETAPAS MÚLTIPLAS ── */}
          {temEtapas && !editando && (
            <div>
              <div style={{ fontWeight:700, fontSize:10, color:'#374151', textTransform:'uppercase', marginBottom:10,
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>📋 Etapas ({etapasConcluidas}/{etapas.length} concluídas)</span>
                <span style={{ fontSize:11, fontWeight:700, color: pct === 100 ? '#16a34a' : '#2563eb' }}>{pct}%</span>
              </div>
              {etapas.map((e, i) => (
                <EtapaCard key={i} etapa={e} idx={i} total={etapas.length} onUpdate={updateEtapa} currentUser={currentUser} />
              ))}
            </div>
          )}

          {/* ── Nova Informação ── */}
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:12 }}>
            <div style={{ fontWeight:700, fontSize:10, color:'#1d4ed8', marginBottom:8 }}>📝 NOVA INFORMAÇÃO GERAL</div>
            <textarea value={novaInfo} onChange={e=>setNovaInfo(e.target.value)}
              placeholder="Atualização geral, ocorrência, decisão..." rows={3}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #bfdbfe', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box', marginBottom:6 }} />
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={adicionarInfo} disabled={salvando || !novaInfo.trim()}
                style={{ background:'#1d4ed8', color:'#fff', border:'none', borderRadius:4, padding:'6px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                {salvando ? '...' : '+ Adicionar'}
              </button>
              <label style={{ fontSize:10, color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                📎 Anexar arquivo
                <input type="file" multiple ref={fileRef}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); }}
                  style={{ display:'none' }} />
              </label>
            </div>
          </div>

          {/* ── Informações anteriores ── */}
          {(d.informacoes || []).length > 0 && (
            <div>
              <div style={{ fontWeight:700, fontSize:9, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>
                Histórico ({d.informacoes.length})
              </div>
              {[...(d.informacoes || [])].reverse().map((info: any, i: number) => {
                const isReprog = info.tipo === 'reprogramacao';
                return (
                  <div key={i} style={{ borderLeft:`3px solid ${isReprog?'#f97316':'#2563eb'}`, paddingLeft:10, marginBottom:8,
                    background: isReprog?'#fff7ed':'transparent', borderRadius: isReprog?'0 4px 4px 0':'0', padding: isReprog?'6px 10px':'0 10px' }}>
                    <div style={{ fontSize:9, color:'#9ca3af' }}>
                      {isReprog && <span style={{ fontWeight:700, color:'#f97316', marginRight:4 }}>📅 REPROGRAMAÇÃO</span>}
                      {info.usuario} · {fmtDT(info.data)}
                    </div>
                    <div style={{ fontSize:11, color: isReprog?'#9a3412':'#1f2937', marginTop:2, fontWeight: isReprog?600:400 }}>{info.texto}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Anexos ── */}
          {anexos.length > 0 && (
            <div>
              <div style={{ fontWeight:700, fontSize:9, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>
                Arquivos ({anexos.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {anexos.map(a => (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:4 }}>
                    <span style={{ fontSize:14 }}>{a.tipo === 'foto' ? '🖼️' : '📄'}</span>
                    <a href={a.url} target="_blank" rel="noreferrer"
                      style={{ flex:1, fontSize:11, color:'#2563eb', fontWeight:600, wordBreak:'break-all' }}>
                      {a.nome}
                    </a>
                    <span style={{ fontSize:9, color:'#9ca3af', flexShrink:0 }}>{a.criado_por}</span>
                    <button onClick={() => excluirAnexo(a.id)}
                      style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, alert = null, color = null }) {
  return (
    <div style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:5 }}>
      <div style={{ fontSize:8, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>{label}</div>
      <div style={{ fontSize:11, fontWeight: (alert || color) ? 700 : 400,
        color: alert === 'vencida' ? '#dc2626' : alert === 'urgente' ? '#d97706' : color || '#1f2937' }}>
        {value}{alert === 'vencida' ? ' 🔴' : alert === 'urgente' ? ' 🟡' : ''}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL NOVA DEMANDA (com suporte a múltiplas etapas)
// ─────────────────────────────────────────────────────────────────────────────
const etapaVazia = (num: number) => ({
  num,
  responsavel_nome: '',
  responsavel_email: '',
  prazo: '',
  obs_criacao: '',
  obs_execucao: [],
  status: 'Pendente',
  data_inicio: null,
  data_fim: null,
});

function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ titulo:'', descricao:'', prioridade:'Média', observacoes:'' });
  const [qtdEtapas, setQtdEtapas] = useState(1);
  const [etapas, setEtapas] = useState<any[]>([etapaVazia(1)]);
  const [salvando, setSalvando] = useState(false);
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}));

  // Ajusta array de etapas quando qtd muda
  const mudarQtd = (n: number) => {
    const q = Math.max(1, Math.min(10, n));
    setQtdEtapas(q);
    setEtapas(prev => {
      const novo = [...prev];
      while (novo.length < q) novo.push(etapaVazia(novo.length + 1));
      return novo.slice(0, q);
    });
  };

  const setEtapa = (idx: number, k: string, v: string) => {
    setEtapas(prev => prev.map((e, i) => i === idx ? { ...e, [k]: v } : e));
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { alert('Informe o título!'); return; }
    if (qtdEtapas > 1) {
      for (let i = 0; i < etapas.length; i++) {
        if (!etapas[i].responsavel_nome.trim()) { alert(`Informe o responsável da Etapa ${i+1}!`); return; }
        if (!etapas[i].prazo) { alert(`Informe o prazo da Etapa ${i+1}!`); return; }
      }
    }
    setSalvando(true);
    const agora = new Date().toISOString();
    const payload: any = {
      ...form,
      setor: 'Engenharia',
      status: 'Pendente',
      informacoes: [],
      etapas: qtdEtapas > 1 ? etapas.map(e => ({
        ...e,
        prazo: e.prazo ? dateToISO(e.prazo) : null,
      })) : [],
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
    };
    // Para demanda simples, deixa campos no nível raiz vazios
    if (qtdEtapas === 1) {
      payload.responsavel_nome = etapas[0].responsavel_nome || null;
      payload.responsavel_email = etapas[0].responsavel_email || null;
      payload.prazo = etapas[0].prazo ? dateToISO(etapas[0].prazo) : null;
    }
    await supabase.from('demandas_avulsas').insert([payload]);
    setSalvando(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(560px,97vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between', flexShrink:0 }}>
          <span>+ Nova Demanda Avulsa</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:16, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Dados principais */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Título *</label>
              <input value={form.titulo} onChange={e=>set('titulo',e.target.value)} autoFocus
                placeholder="Ex: Revisar BOM do projeto X"
                style={{ width:'100%', padding:'6px 8px', border: form.titulo ? '1px solid #d1d5db' : '1px solid #fca5a5', borderRadius:4, fontSize:12, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Descrição</label>
              <MencaoTextarea value={form.descricao} onChange={v=>set('descricao',v)} rows={2} style={{fontSize:11}} />
            </div>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4, textTransform:'uppercase' }}>Prioridade</label>
              <div style={{ display:'flex', gap:6 }}>
                {['Alta','Média','Baixa'].map(p => (
                  <button key={p} onClick={() => set('prioridade',p)}
                    style={{ flex:1, padding:'6px', border:`1.5px solid ${form.prioridade===p?PRIO_COR[p]:'#d1d5db'}`,
                      background: form.prioridade===p ? PRIO_COR[p]+'18' : '#fff',
                      color: form.prioridade===p ? PRIO_COR[p] : '#374151',
                      borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Seletor de quantidade de etapas */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:12 }}>
            <label style={{ fontSize:9, fontWeight:700, color:'#166534', display:'block', marginBottom:8, textTransform:'uppercase' }}>
              Quantidade de Etapas
            </label>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button onClick={() => mudarQtd(qtdEtapas - 1)} disabled={qtdEtapas <= 1}
                style={{ width:32, height:32, border:'1.5px solid #16a34a', borderRadius:6, background:'#fff', color:'#16a34a', fontSize:18, fontWeight:700, cursor:'pointer', lineHeight:1 }}>−</button>
              <span style={{ fontSize:22, fontWeight:800, color:'#16a34a', minWidth:32, textAlign:'center' }}>{qtdEtapas}</span>
              <button onClick={() => mudarQtd(qtdEtapas + 1)} disabled={qtdEtapas >= 10}
                style={{ width:32, height:32, border:'1.5px solid #16a34a', borderRadius:6, background:'#fff', color:'#16a34a', fontSize:18, fontWeight:700, cursor:'pointer', lineHeight:1 }}>+</button>
              <span style={{ fontSize:10, color:'#6b7280' }}>
                {qtdEtapas === 1 ? 'Demanda simples' : `${qtdEtapas} etapas independentes`}
              </span>
            </div>
          </div>

          {/* Formulários por etapa */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {etapas.map((e, i) => (
              <div key={i} style={{ border:`1.5px solid ${qtdEtapas > 1 ? '#2563eb' : '#e2e8f0'}`, borderRadius:8, padding:12, background: qtdEtapas > 1 ? '#eff6ff' : '#f8fafc' }}>
                {qtdEtapas > 1 && (
                  <div style={{ fontWeight:700, fontSize:10, color:'#1d4ed8', marginBottom:8 }}>
                    ETAPA {i + 1} de {qtdEtapas}
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  <div>
                    <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>
                      Responsável{qtdEtapas > 1 ? ' *' : ''}
                    </label>
                    <ColaboradorSelect value={e.responsavel_nome}
                      onChange={v=>setEtapa(i,'responsavel_nome',v)}
                      placeholder="Selecione o responsável"
                      style={{ width:'100%', padding:'5px 8px', border:`1px solid ${qtdEtapas>1&&!e.responsavel_nome?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>E-mail</label>
                    <input type="email" value={e.responsavel_email} onChange={ev=>setEtapa(i,'responsavel_email',ev.target.value)}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                  </div>
                </div>
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>
                    Prazo{qtdEtapas > 1 ? ' *' : ''}
                  </label>
                  <input type="date" value={e.prazo} onChange={ev=>setEtapa(i,'prazo',ev.target.value)}
                    style={{ width:'100%', padding:'5px 8px', border:`1px solid ${qtdEtapas>1&&!e.prazo?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Observações</label>
                  <textarea value={e.obs_criacao} onChange={ev=>setEtapa(i,'obs_criacao',ev.target.value)} rows={2}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? 'Salvando...' : `+ Criar${qtdEtapas > 1 ? ` (${qtdEtapas} etapas)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DA LISTA
// ─────────────────────────────────────────────────────────────────────────────
function DemandaCard({ d, onClick }) {
  const alerta = alertClass(d.prazo, d.status);
  const diasV = diasParaVencer(d.prazo);
  const corBorda = alerta === 'vencida' ? '#dc2626' : alerta === 'urgente' ? '#d97706' : STATUS_COR[d.status] || '#e2e8f0';
  const bgCard = alerta === 'vencida' ? '#fff5f5' : alerta === 'urgente' ? '#fffbeb' : '#fff';
  const etapas: any[] = d.etapas || [];
  const temEtapas = etapas.length > 0;
  const etapasConcluidas = etapas.filter(e => e.status === 'Concluída').length;
  const pct = temEtapas ? Math.round((etapasConcluidas / etapas.length) * 100) : 0;

  // Alertas nas etapas
  const etapasVencidas = etapas.filter(e => alertClass(e.prazo, e.status) === 'vencida').length;
  const etapasUrgentes = etapas.filter(e => alertClass(e.prazo, e.status) === 'urgente').length;

  return (
    <div onClick={onClick}
      style={{ background:bgCard, border:`1px solid ${corBorda}40`, borderLeft:`4px solid ${corBorda}`,
        borderRadius:6, padding:'9px 12px', cursor:'pointer', marginBottom:6, boxShadow:'0 1px 2px #0001' }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 2px 8px #0002')}
      onMouseLeave={e=>(e.currentTarget.style.boxShadow='0 1px 2px #0001')}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:3, flexWrap:'wrap' }}>
            <span style={{ background:STATUS_COR[d.status], color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{d.status}</span>
            <span style={{ background:PRIO_COR[d.prioridade]+'18', color:PRIO_COR[d.prioridade], border:`1px solid ${PRIO_COR[d.prioridade]}40`, borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>{d.prioridade}</span>
            {temEtapas && (
              <span style={{ background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>
                📋 {etapasConcluidas}/{etapas.length} etapas
              </span>
            )}
            {etapasVencidas > 0 && <span style={{ fontSize:9, fontWeight:700, color:'#dc2626' }}>🔴 {etapasVencidas} etapa(s) vencida(s)</span>}
            {etapasUrgentes > 0 && etapasVencidas === 0 && <span style={{ fontSize:9, fontWeight:700, color:'#d97706' }}>🟡 {etapasUrgentes} urgente(s)</span>}
            {!temEtapas && alerta && (
              <span style={{ fontSize:9, fontWeight:700, color: alerta==='vencida'?'#dc2626':'#d97706' }}>
                {alerta==='vencida' ? '🔴 VENCIDA' : `🟡 ${diasV}d`}
              </span>
            )}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1f2937' }}>{d.titulo}</div>
          {d.descricao && <div style={{ fontSize:10, color:'#6b7280', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:380 }}>{d.descricao}</div>}

          {/* Barra de progresso (multi-etapa) */}
          {temEtapas && (
            <div style={{ marginTop:6, background:'#e2e8f0', borderRadius:3, height:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'#16a34a':'#2563eb', transition:'width .3s' }} />
            </div>
          )}

          {!temEtapas && (
            <div style={{ marginTop:5, display:'flex', gap:10, flexWrap:'wrap' }}>
              {d.responsavel_nome && <span style={{ fontSize:9, color:'#374151' }}>👤 {d.responsavel_nome}</span>}
              {d.prazo && <span style={{ fontSize:9, color: alerta?corBorda:'#6b7280' }}>⏰ {fmtDate(d.prazo)}</span>}
              {d.data_inicio && !d.data_fim && (
                <span style={{ fontSize:9, color:'#2563eb' }}>▶ {fmtH((Date.now() - new Date(d.data_inicio).getTime()) / 3600000)}</span>
              )}
            </div>
          )}
        </div>
        {(d.informacoes?.length > 0) && (
          <span style={{ fontSize:9, color:'#9ca3af', flexShrink:0 }}>💬 {d.informacoes.length}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function DemandaAvulsaPanel({ currentUser }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('ativas');
  const [filtroResp, setFiltroResp] = useState<string>('');
  const [filtroStatusSpec, setFiltroStatusSpec] = useState<string>('');
  const [modalNova, setModalNova] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const fetch = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('demandas_avulsas')
      .select('*').eq('setor', 'Engenharia')
      .order('criado_em', { ascending: false });
    setDemandas(data || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { fetch(); const t = setInterval(()=>fetch(true), 30000); return () => clearInterval(t); }, [fetch]);

  const isVencida = (d: any) => {
    if (d.status === 'Concluída') return false;
    const etapas = d.etapas || [];
    if (etapas.length > 0) return etapas.some((e: any) => alertClass(e.prazo, e.status) === 'vencida');
    return alertClass(d.prazo, d.status) === 'vencida';
  };

  const lista = demandas.filter(d => {
    // Filtro principal de aba
    if (filtroStatus === 'ativas' && d.status === 'Concluída') return false;
    if (filtroStatus === 'concluidas' && d.status !== 'Concluída') return false;
    if (filtroStatus === 'vencidas' && !isVencida(d)) return false;
    // Filtro por status específico
    if (filtroStatusSpec && d.status !== filtroStatusSpec) return false;
    // Filtro por responsável
    if (filtroResp) {
      const resp = d.responsavel_nome || '';
      if (!resp.toLowerCase().includes(filtroResp.toLowerCase())) return false;
    }
    return true;
  });

  // Lista de responsáveis únicos para o dropdown
  const responsaveis = Array.from(new Set(
    demandas.map(d => d.responsavel_nome).filter(Boolean)
  )).sort() as string[];

  const vencidas = demandas.filter(isVencida).length;
  const urgentes = demandas.filter(d => {
    if (d.status === 'Concluída') return false;
    const etapas = d.etapas || [];
    if (etapas.length > 0) return etapas.some((e: any) => alertClass(e.prazo, e.status) === 'urgente') && !etapas.some((e: any) => alertClass(e.prazo, e.status) === 'vencida');
    return alertClass(d.prazo, d.status) === 'urgente';
  }).length;

  return (
    <div className="sec-card" style={{ marginTop:12 }}>
      <div className="sec-hdr">
        <span style={{ display:'flex', alignItems:'center', gap:8 }}>
          ⚡ Demandas Avulsas — Engenharia
          {vencidas > 0 && (
            <span onClick={() => setFiltroStatus(filtroStatus==='vencidas'?'ativas':'vencidas')}
              style={{ background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700, cursor:'pointer',
                outline: filtroStatus==='vencidas'?'2px solid white':'none' }}>
              🔴 {vencidas} vencida{vencidas>1?'s':''}
            </span>
          )}
          {urgentes > 0 && filtroStatus!=='vencidas' && (
            <span style={{ background:'#d97706', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700 }}>
              🟡 {urgentes} urgente{urgentes>1?'s':''}
            </span>
          )}
        </span>
        <button onClick={() => setModalNova(true)}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
          + Nova Demanda
        </button>
      </div>

      <div style={{ padding:'6px 12px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
        {[['ativas','Ativas'],['concluidas','Concluídas'],['vencidas','Vencidas'],['todas','Todas']].map(([v,l]) => (
          <button key={v} onClick={() => setFiltroStatus(v)}
            style={{ border:'none', borderRadius:12, padding:'2px 10px', fontSize:9, fontWeight:700, cursor:'pointer',
              background: filtroStatus===v?(v==='vencidas'?'#dc2626':'#2563eb'):'#f1f5f9',
              color: filtroStatus===v?'#fff':'#374151' }}>
            {v==='vencidas'?'🔴 ':''}{ l}
          </button>
        ))}
        <div style={{ width:1, background:'#e2e8f0', height:18, margin:'0 2px' }} />
        {/* Filtro por status específico */}
        <select value={filtroStatusSpec} onChange={e=>{setFiltroStatusSpec(e.target.value);if(filtroStatus==='concluidas'&&e.target.value&&e.target.value!=='Concluída')setFiltroStatus('ativas');}}
          style={{ fontSize:9, padding:'2px 6px', border:'1px solid #e2e8f0', borderRadius:8, background:'#f8fafc', color:'#374151', cursor:'pointer' }}>
          <option value="">Status: Todos</option>
          <option value="Pendente">Pendente</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Concluída">Concluída</option>
        </select>
        {/* Filtro por responsável */}
        {responsaveis.length > 0 && (
          <select value={filtroResp} onChange={e=>setFiltroResp(e.target.value)}
            style={{ fontSize:9, padding:'2px 6px', border:'1px solid #e2e8f0', borderRadius:8, background:'#f8fafc', color:'#374151', cursor:'pointer' }}>
            <option value="">Responsável: Todos</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {(filtroResp || filtroStatusSpec) && (
          <button onClick={() => { setFiltroResp(''); setFiltroStatusSpec(''); }}
            style={{ fontSize:9, padding:'2px 8px', border:'1px solid #fca5a5', borderRadius:8, background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>
            ✕ Limpar filtros
          </button>
        )}
        <span style={{ marginLeft:'auto', fontSize:9, color:'#9ca3af', lineHeight:'22px' }}>{lista.length} demandas</span>
      </div>

      <div className="sec-body" style={{ padding:'10px 12px' }}>
        {loading ? (
          <div className="acn-empty">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="acn-empty">
            {filtroStatus === 'ativas' ? 'Nenhuma demanda ativa. Clique em "+ Nova Demanda" para criar.' : 'Nenhuma demanda encontrada.'}
          </div>
        ) : (
          lista.map(d => (
            <DemandaCard key={d.id} d={d} onClick={() => setSelected(d)} />
          ))
        )}
      </div>

      {modalNova && (
        <ModalNova currentUser={currentUser} onClose={() => setModalNova(false)} onSaved={fetch} />
      )}
      {selected && (
        <ModalDetalhe
          demanda={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            fetch();
            supabase.from('demandas_avulsas').select('*').eq('id', selected.id).single()
              .then(({ data }) => { if (data) setSelected(data); });
          }}
        />
      )}
    </div>
  );
}
