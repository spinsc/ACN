// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

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
  const [designarForm, setDesignarForm] = useState({ responsavel_nome: initial.responsavel_nome || '', responsavel_email: initial.responsavel_email || '', prazo: initial.prazo ? initial.prazo.substring(0, 16) : '' });
  const [mostrarDesignar, setMostrarDesignar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.perfil === 'Admin' || currentUser?.perfil === 'Engenharia' || currentUser?.perfil === 'Gerente';

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

  // ── Designar responsável ─────────────────────────────────────────────────
  const salvarDesignar = async () => {
    if (!designarForm.responsavel_nome.trim()) { alert('Informe o responsável!'); return; }
    if (!designarForm.prazo) { alert('Informe o prazo!'); return; }
    setSalvando(true);
    await supabase.from('demandas_avulsas').update({
      responsavel_nome: designarForm.responsavel_nome,
      responsavel_email: designarForm.responsavel_email,
      prazo: new Date(designarForm.prazo).toISOString(),
      atualizado_em: new Date().toISOString(),
    }).eq('id', d.id);
    setMostrarDesignar(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Marcar início ────────────────────────────────────────────────────────
  const iniciar = async () => {
    if (!confirm('Marcar início da execução agora?')) return;
    const agora = new Date().toISOString();
    await supabase.from('demandas_avulsas').update({ status: 'Em Andamento', data_inicio: agora, atualizado_em: agora }).eq('id', d.id);
    await reload();
    onRefresh();
  };

  // ── Marcar fim ───────────────────────────────────────────────────────────
  const concluir = async () => {
    if (!confirm('Marcar como concluída?')) return;
    const agora = new Date().toISOString();
    await supabase.from('demandas_avulsas').update({ status: 'Concluída', data_fim: agora, atualizado_em: agora }).eq('id', d.id);
    await reload();
    onRefresh();
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

  // KPI
  const inicio = d.data_inicio ? new Date(d.data_inicio) : null;
  const fim = d.data_fim ? new Date(d.data_fim) : null;
  const tempoH = inicio ? ((fim || new Date()).getTime() - inicio.getTime()) / 3600000 : null;
  const alerta = alertClass(d.prazo, d.status);
  const diasV = diasParaVencer(d.prazo);
  const corStatus = STATUS_COR[d.status] || '#6b7280';

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'min(580px,96vw)', height:'100vh', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px #0003' }}>

        {/* Header */}
        <div style={{ background: corStatus, color:'#fff', padding:'12px 16px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, opacity:.8, fontWeight:600 }}>{d.status.toUpperCase()} · {d.prioridade}</div>
            <div style={{ fontSize:14, fontWeight:700, lineHeight:1.3 }}>{d.titulo}</div>
            {d.responsavel_nome && <div style={{ fontSize:10, opacity:.85 }}>👤 {d.responsavel_nome}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', flexShrink:0 }}>✕</button>
        </div>

        {/* Alertas de prazo */}
        {alerta && (
          <div style={{ padding:'6px 16px', background: alerta === 'vencida' ? '#fef2f2' : '#fffbeb',
            borderBottom:`1px solid ${alerta === 'vencida' ? '#fca5a5' : '#fcd34d'}`,
            color: alerta === 'vencida' ? '#dc2626' : '#d97706', fontWeight:700, fontSize:11 }}>
            {alerta === 'vencida' ? '🔴 TAREFA VENCIDA' : `🟡 Vence em ${diasV} dia${diasV === 1 ? '' : 's'}`} — prazo: {fmtDT(d.prazo)}
          </div>
        )}

        {/* Barra de ações */}
        <div style={{ padding:'8px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
          {d.status === 'Pendente' && (
            <button onClick={iniciar}
              style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              ▶ Iniciar Execução
            </button>
          )}
          {d.status === 'Em Andamento' && (
            <button onClick={concluir}
              style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              ✓ Concluir
            </button>
          )}
          <button onClick={() => setMostrarDesignar(v => !v)}
            style={{ background: mostrarDesignar ? '#6b7280' : '#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            👤 {d.responsavel_nome ? 'Reatribuir' : 'Designar'}
          </button>
          <button onClick={() => setEditando(v => !v)}
            style={{ background: editando ? '#6b7280' : '#475569', color:'#fff', border:'none', borderRadius:4, padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            ✏️ Editar
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:12 }}>

          {/* ── Designar responsável ── */}
          {mostrarDesignar && (
            <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:6, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:10, color:'#5b21b6', marginBottom:8 }}>👤 DESIGNAR RESPONSÁVEL</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>NOME *</label>
                  <input value={designarForm.responsavel_nome} onChange={e=>setDesignarForm(f=>({...f,responsavel_nome:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #c4b5fd', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>E-MAIL</label>
                  <input type="email" value={designarForm.responsavel_email} onChange={e=>setDesignarForm(f=>({...f,responsavel_email:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #c4b5fd', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>PRAZO DE EXECUÇÃO *</label>
                <input type="datetime-local" value={designarForm.prazo} onChange={e=>setDesignarForm(f=>({...f,prazo:e.target.value}))}
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
                  <textarea value={editForm.descricao} onChange={e=>setEditForm(f=>({...f,descricao:e.target.value}))} rows={2}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
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
                  <textarea value={editForm.observacoes} onChange={e=>setEditForm(f=>({...f,observacoes:e.target.value}))} rows={3}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
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

          {/* ── Info principal ── */}
          {!editando && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <InfoBlock label="Prazo" value={fmtDT(d.prazo)} alert={alerta} />
              <InfoBlock label="Prioridade" value={d.prioridade} color={PRIO_COR[d.prioridade]} />
              <InfoBlock label="Início Execução" value={fmtDT(d.data_inicio)} />
              <InfoBlock label="Conclusão" value={fmtDT(d.data_fim)} />
              {tempoH !== null && (
                <InfoBlock label={d.data_fim ? 'Tempo Total' : 'Tempo em Andamento'} value={fmtH(tempoH)} color="#2563eb" />
              )}
              <InfoBlock label="Criado por" value={`${d.criado_por_nome} · ${fmtDT(d.criado_em)}`} />
              {d.descricao && <div style={{ gridColumn:'1/-1' }}><InfoBlock label="Descrição" value={d.descricao} /></div>}
              {d.observacoes && <div style={{ gridColumn:'1/-1' }}><InfoBlock label="Observações" value={d.observacoes} /></div>}
            </div>
          )}

          {/* ── Nova Informação ── */}
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:12 }}>
            <div style={{ fontWeight:700, fontSize:10, color:'#1d4ed8', marginBottom:8 }}>📝 NOVA INFORMAÇÃO</div>
            <textarea value={novaInfo} onChange={e=>setNovaInfo(e.target.value)}
              placeholder="Descreva uma atualização, observação ou ocorrência..." rows={3}
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
                Histórico de Informações ({d.informacoes.length})
              </div>
              {[...(d.informacoes || [])].reverse().map((info: any, i: number) => (
                <div key={i} style={{ borderLeft:'3px solid #2563eb', paddingLeft:10, marginBottom:8 }}>
                  <div style={{ fontSize:9, color:'#9ca3af' }}>{info.usuario} · {fmtDT(info.data)}</div>
                  <div style={{ fontSize:11, color:'#1f2937', marginTop:2 }}>{info.texto}</div>
                </div>
              ))}
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

function InfoBlock({ label, value, alert = null, color = null }: { label:string; value:string; alert?:string|null; color?:string|null }) {
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
// MODAL NOVA DEMANDA
// ─────────────────────────────────────────────────────────────────────────────
function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ titulo:'', descricao:'', prioridade:'Média', observacoes:'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}));

  const salvar = async () => {
    if (!form.titulo.trim()) { alert('Informe o título!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    await supabase.from('demandas_avulsas').insert([{
      ...form,
      setor: 'Engenharia',
      status: 'Pendente',
      informacoes: [],
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
    }]);
    setSalvando(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(480px,95vw)', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
          <span>+ Nova Demanda Avulsa</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Título *</label>
            <input value={form.titulo} onChange={e=>set('titulo',e.target.value)} autoFocus
              placeholder="Ex: Revisar BOM do projeto X"
              style={{ width:'100%', padding:'6px 8px', border: form.titulo ? '1px solid #d1d5db' : '1px solid #fca5a5', borderRadius:4, fontSize:12, boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Descrição</label>
            <textarea value={form.descricao} onChange={e=>set('descricao',e.target.value)} rows={3}
              placeholder="Detalhes da demanda..."
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
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
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Observações</label>
            <textarea value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} rows={2}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? 'Salvando...' : '+ Criar'}
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
            {alerta && (
              <span style={{ fontSize:9, fontWeight:700, color: alerta==='vencida'?'#dc2626':'#d97706' }}>
                {alerta==='vencida' ? '🔴 VENCIDA' : `🟡 ${diasV}d para vencer`}
              </span>
            )}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1f2937' }}>{d.titulo}</div>
          {d.descricao && <div style={{ fontSize:10, color:'#6b7280', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:340 }}>{d.descricao}</div>}
          <div style={{ marginTop:5, display:'flex', gap:10, flexWrap:'wrap' }}>
            {d.responsavel_nome && <span style={{ fontSize:9, color:'#374151' }}>👤 {d.responsavel_nome}</span>}
            {d.prazo && <span style={{ fontSize:9, color: alerta?corBorda:'#6b7280' }}>⏰ {fmtDT(d.prazo)}</span>}
            {d.data_inicio && !d.data_fim && (
              <span style={{ fontSize:9, color:'#2563eb' }}>
                ▶ {fmtH((Date.now() - new Date(d.data_inicio).getTime()) / 3600000)} em andamento
              </span>
            )}
            {d.data_fim && d.data_inicio && (
              <span style={{ fontSize:9, color:'#16a34a' }}>
                ✓ {fmtH((new Date(d.data_fim).getTime() - new Date(d.data_inicio).getTime()) / 3600000)}
              </span>
            )}
          </div>
        </div>
        {(d.informacoes?.length > 0) && (
          <span style={{ fontSize:9, color:'#9ca3af', flexShrink:0 }}>💬 {d.informacoes.length}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL PRINCIPAL (exportado para EngenhariaTab)
// ─────────────────────────────────────────────────────────────────────────────
export default function DemandaAvulsaPanel({ currentUser }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('ativas');
  const [modalNova, setModalNova] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('demandas_avulsas')
      .select('*').eq('setor', 'Engenharia')
      .order('criado_em', { ascending: false });
    setDemandas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); const t = setInterval(fetch, 30000); return () => clearInterval(t); }, [fetch]);

  const lista = demandas.filter(d => {
    if (filtroStatus === 'ativas') return d.status !== 'Concluída';
    if (filtroStatus === 'concluidas') return d.status === 'Concluída';
    return true;
  });

  const vencidas = demandas.filter(d => alertClass(d.prazo, d.status) === 'vencida').length;
  const urgentes = demandas.filter(d => alertClass(d.prazo, d.status) === 'urgente').length;

  return (
    <div className="sec-card" style={{ marginTop:12 }}>
      {/* Header */}
      <div className="sec-hdr">
        <span style={{ display:'flex', alignItems:'center', gap:8 }}>
          ⚡ Demandas Avulsas — Engenharia
          {vencidas > 0 && (
            <span style={{ background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700 }}>
              🔴 {vencidas} vencida{vencidas>1?'s':''}
            </span>
          )}
          {urgentes > 0 && (
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

      {/* Filtros */}
      <div style={{ padding:'6px 12px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:6 }}>
        {[['ativas','Ativas'],['concluidas','Concluídas'],['todas','Todas']].map(([v,l]) => (
          <button key={v} onClick={() => setFiltroStatus(v)}
            style={{ border:'none', borderRadius:12, padding:'2px 10px', fontSize:9, fontWeight:700,
              background: filtroStatus===v?'#2563eb':'#f1f5f9', color: filtroStatus===v?'#fff':'#374151', cursor:'pointer' }}>
            {l}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:9, color:'#9ca3af', lineHeight:'22px' }}>{lista.length} demandas</span>
      </div>

      {/* Lista */}
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

      {/* Modais */}
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
