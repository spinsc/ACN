// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ClienteAutocomplete, ClienteSalvarModal, clienteToForm } from './ClienteUtils';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const COLUNAS = ['Prospectado','Contatado','Em Negociação','Convertido'];
const COR_COLUNA: Record<string,string> = {
  'Prospectado':   '#6366f1',
  'Contatado':     '#0891b2',
  'Em Negociação': '#d97706',
  'Convertido':    '#16a34a',
};

const LEAD_VAZIO = {
  nome_cliente:'', empresa:'', cargo:'', telefone:'', email:'',
  _cliente_id: null as string|null, _cliente_obj: null as any,
  data_proximo_contato:'', observacoes:'', operador_responsavel:'',
  status_kanban:'Prospectado',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (v:string) => {
  if (!v) return null;
  return new Date(v).toLocaleDateString('pt-BR');
};
const fmtDT = (v:string) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR',{ day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
};
const diasSemContato = (lead: any): number => {
  const ref = lead.ultimo_contato || lead.created_at || lead.criado_em;
  if (!ref) return 999;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
};
const isEsquecido = (lead: any, maxDias: number) => {
  if (lead.status_kanban === 'Convertido') return false;
  return diasSemContato(lead) >= maxDias;
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE LEAD
// ─────────────────────────────────────────────────────────────────────────────
function LeadModal({ lead: initialLead, currentUser, onClose, onRefresh }) {
  const [lead, setLead] = useState(initialLead);
  const [historico, setHistorico] = useState<any[]>([]);
  const [novoContato, setNovoContato] = useState({ obs:'', data_proximo_contato:'' });
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({ ...initialLead });

  const isAdmin = currentUser?.perfil === 'Admin';

  const fetchHistorico = useCallback(async () => {
    const { data } = await supabase.from('crm_historico_contatos')
      .select('*').eq('cliente_id', lead.id)
      .order('data_contato', { ascending: false });
    setHistorico(data || []);
  }, [lead.id]);

  useEffect(() => { fetchHistorico(); }, [fetchHistorico]);

  const registrarContato = async () => {
    if (!novoContato.obs.trim()) { alert('Informe o que foi tratado no contato!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    await supabase.from('crm_historico_contatos').insert([{
      cliente_id: lead.id,
      data_contato: agora,
      resultado: novoContato.obs,
      operador: currentUser?.nome,
    }]);
    // Atualiza ultimo_contato e próximo contato
    const upd: any = { ultimo_contato: agora, atualizado_em: agora };
    if (novoContato.data_proximo_contato) upd.data_proximo_contato = novoContato.data_proximo_contato;
    await supabase.from('crm_clientes').update(upd).eq('id', lead.id);
    setNovoContato({ obs:'', data_proximo_contato:'' });
    await fetchHistorico();
    // Recarrega lead
    const { data } = await supabase.from('crm_clientes').select('*').eq('id', lead.id).single();
    if (data) setLead(data);
    setSalvando(false);
    onRefresh();
  };

  const moverColuna = async (novoStatus: string) => {
    await supabase.from('crm_clientes').update({ status_kanban: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    const { data } = await supabase.from('crm_clientes').select('*').eq('id', lead.id).single();
    if (data) setLead(data);
    onRefresh();
  };

  const salvarEdicao = async () => {
    setSalvando(true);
    await supabase.from('crm_clientes').update({ ...editForm, atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    const { data } = await supabase.from('crm_clientes').select('*').eq('id', lead.id).single();
    if (data) { setLead(data); setEditForm(data); }
    setEditando(false);
    setSalvando(false);
    onRefresh();
  };

  const excluir = async () => {
    if (!confirm('Excluir este lead permanentemente?')) return;
    await supabase.from('crm_clientes').delete().eq('id', lead.id);
    onClose();
    onRefresh();
  };

  const cor = COR_COLUNA[lead.status_kanban] || '#374151';
  const idx = COLUNAS.indexOf(lead.status_kanban);

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'min(560px,95vw)', height:'100vh', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px #0003' }}>

        {/* Header */}
        <div style={{ background:cor, color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, opacity:.8, fontWeight:600 }}>{lead.status_kanban.toUpperCase()}</div>
            <div style={{ fontSize:15, fontWeight:700 }}>{lead.nome_cliente}</div>
            {lead.empresa && <div style={{ fontSize:10, opacity:.85 }}>{lead.empresa}{lead.cargo ? ` · ${lead.cargo}` : ''}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        {/* Mover entre colunas */}
        <div style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginRight:4 }}>MOVER:</span>
          {COLUNAS.filter(c => c !== lead.status_kanban).map(c => (
            <button key={c} onClick={() => moverColuna(c)}
              style={{ background:COR_COLUNA[c]+'18', color:COR_COLUNA[c], border:`1px solid ${COR_COLUNA[c]}40`,
                borderRadius:4, padding:'2px 8px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              → {c}
            </button>
          ))}
          <div style={{ flex:1 }} />
          {isAdmin && (
            <button onClick={excluir} style={{ fontSize:9, color:'#dc2626', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>
              🗑️ Excluir
            </button>
          )}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:14 }}>

          {/* ── Info do Lead ── */}
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#374151', textTransform:'uppercase' }}>Dados do Lead</span>
              <button onClick={() => setEditando(e => !e)}
                style={{ fontSize:9, color:'#2563eb', background:'none', border:'1px solid #bfdbfe', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>
                {editando ? '✕ Cancelar' : '✏️ Editar'}
              </button>
            </div>
            {editando ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[['Nome *','nome_cliente'],['Empresa','empresa'],['Cargo','cargo'],['Telefone','telefone'],['E-mail','email'],['Responsável','operador_responsavel']].map(([lbl,k]) => (
                  <div key={k}>
                    <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>{lbl}</label>
                    <input value={editForm[k]||''} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>OBSERVAÇÕES</label>
                  <textarea value={editForm.observacoes||''} onChange={e=>setEditForm(f=>({...f,observacoes:e.target.value}))}
                    rows={3} style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
                </div>
                <button onClick={salvarEdicao} disabled={salvando}
                  style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'7px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {salvando ? 'Salvando...' : '✓ Salvar'}
                </button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[['Telefone',lead.telefone],['E-mail',lead.email],['Cargo',lead.cargo],['Responsável',lead.operador_responsavel]].filter(([,v])=>v).map(([k,v]) => (
                  <div key={k}>
                    <div style={{ fontSize:8, fontWeight:700, color:'#9ca3af', textTransform:'uppercase' }}>{k}</div>
                    <div style={{ fontSize:11, color:'#1f2937' }}>{v}</div>
                  </div>
                ))}
                {lead.observacoes && (
                  <div style={{ gridColumn:'1/-1' }}>
                    <div style={{ fontSize:8, fontWeight:700, color:'#9ca3af', textTransform:'uppercase' }}>Observações</div>
                    <div style={{ fontSize:11, color:'#374151' }}>{lead.observacoes}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Próximo Contato ── */}
          {lead.data_proximo_contato && !editando && (
            <div style={{ background: new Date(lead.data_proximo_contato) < new Date() ? '#fef2f2' : '#f0fdf4',
              border:`1px solid ${new Date(lead.data_proximo_contato) < new Date() ? '#fca5a5' : '#86efac'}`,
              borderRadius:6, padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>{new Date(lead.data_proximo_contato) < new Date() ? '⚠️' : '📅'}</span>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#6b7280' }}>PRÓXIMO CONTATO</div>
                <div style={{ fontSize:12, fontWeight:700, color: new Date(lead.data_proximo_contato) < new Date() ? '#dc2626' : '#16a34a' }}>
                  {fmtDate(lead.data_proximo_contato)}
                  {new Date(lead.data_proximo_contato) < new Date() ? ' — ATRASADO' : ''}
                </div>
              </div>
            </div>
          )}

          {/* ── Registrar Contato ── */}
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#1d4ed8', marginBottom:8 }}>📞 REGISTRAR CONTATO</div>
            <textarea value={novoContato.obs} onChange={e=>setNovoContato(f=>({...f,obs:e.target.value}))}
              placeholder="O que foi tratado? Resultado da conversa..." rows={3}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #bfdbfe', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box', marginBottom:8 }} />
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2 }}>AGENDAR PRÓXIMO CONTATO</label>
                <input type="date" value={novoContato.data_proximo_contato}
                  onChange={e=>setNovoContato(f=>({...f,data_proximo_contato:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #bfdbfe', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <button onClick={registrarContato} disabled={salvando}
                style={{ background:'#1d4ed8', color:'#fff', border:'none', borderRadius:4, padding:'7px 14px', fontWeight:700, fontSize:11, cursor:'pointer', flexShrink:0 }}>
                {salvando ? '...' : '✓ Registrar'}
              </button>
            </div>
          </div>

          {/* ── Histórico de contatos ── */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:8 }}>📋 HISTÓRICO DE CONTATOS ({historico.length})</div>
            {historico.length === 0 && (
              <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:16 }}>Nenhum contato registrado.</div>
            )}
            {historico.map(h => (
              <div key={h.id} style={{ borderLeft:'3px solid #6366f1', paddingLeft:10, marginBottom:10 }}>
                <div style={{ fontSize:9, color:'#6b7280', fontWeight:600 }}>
                  {fmtDT(h.data_contato)} · {h.operador}
                </div>
                <div style={{ fontSize:11, color:'#1f2937', marginTop:2 }}>{h.resultado}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DO LEAD NO KANBAN
// ─────────────────────────────────────────────────────────────────────────────
function LeadCard({ lead, maxDias, onClick }) {
  const esquecido = isEsquecido(lead, maxDias);
  const proximo = lead.data_proximo_contato;
  const proxAtrasado = proximo && new Date(proximo) < new Date();

  return (
    <div onClick={onClick}
      style={{ background:'#fff', border:`1.5px solid ${esquecido?'#fca5a5':'#e2e8f0'}`,
        borderRadius:6, padding:'9px 11px', cursor:'pointer', marginBottom:8,
        boxShadow: esquecido ? '0 0 0 2px #fca5a540' : '0 1px 3px #0001',
        transition:'box-shadow .15s' }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 3px 8px #0002')}
      onMouseLeave={e=>(e.currentTarget.style.boxShadow=esquecido?'0 0 0 2px #fca5a540':'0 1px 3px #0001')}>
      {esquecido && (
        <div style={{ fontSize:9, fontWeight:700, color:'#dc2626', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 6px', marginBottom:5, display:'inline-block' }}>
          ⚠️ Lead esquecido ({diasSemContato(lead)}d sem contato)
        </div>
      )}
      <div style={{ fontWeight:700, fontSize:12, color:'#1f2937', marginBottom:2 }}>{lead.nome_cliente}</div>
      {lead.empresa && <div style={{ fontSize:10, color:'#6b7280' }}>{lead.empresa}{lead.cargo ? ` · ${lead.cargo}` : ''}</div>}
      {lead.telefone && <div style={{ fontSize:10, color:'#374151', marginTop:3 }}>📱 {lead.telefone}</div>}
      {lead.email && <div style={{ fontSize:10, color:'#374151' }}>✉️ {lead.email}</div>}
      {proximo && (
        <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:4,
          color: proxAtrasado ? '#dc2626' : '#16a34a',
          fontSize:9, fontWeight:700 }}>
          {proxAtrasado ? '⚠️' : '📅'}
          {proxAtrasado ? 'Contato atrasado: ' : 'Próximo contato: '}
          {fmtDate(proximo)}
        </div>
      )}
      {lead.operador_responsavel && (
        <div style={{ marginTop:4, fontSize:9, color:'#9ca3af' }}>👤 {lead.operador_responsavel}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO DE CONTATOS (semanal simplificado)
// ─────────────────────────────────────────────────────────────────────────────
function CalendarioContatos({ leads, filtroUser, onSelectLead }) {
  const hoje = new Date();
  // Próximos 14 dias
  const dias: Date[] = Array.from({ length:14 }, (_,i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    return d;
  });

  const leadsComData = leads.filter(l => l.data_proximo_contato && (!filtroUser || l.operador_responsavel === filtroUser));

  const porDia = (dia: Date) => {
    const ds = dia.toISOString().split('T')[0];
    return leadsComData.filter(l => l.data_proximo_contato?.startsWith(ds));
  };

  const fmtDiaSem = (d: Date) => d.toLocaleDateString('pt-BR',{ weekday:'short', day:'2-digit', month:'2-digit' });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, padding:12, overflowY:'auto', maxHeight:400 }}>
      {dias.map((dia, i) => {
        const itens = porDia(dia);
        const isHoje = i === 0;
        const passado = dia < hoje && i > 0;
        if (!itens.length && !isHoje) return null;
        return (
          <div key={i} style={{ borderRadius:6, border:`1px solid ${isHoje?'#bfdbfe':'#e2e8f0'}`,
            background: isHoje ? '#eff6ff' : '#fff', padding:'6px 10px' }}>
            <div style={{ fontSize:9, fontWeight:700, color: isHoje ? '#1d4ed8' : '#6b7280', marginBottom:itens.length?4:0 }}>
              {isHoje ? '📍 HOJE — ' : ''}{fmtDiaSem(dia)}
            </div>
            {itens.map(l => (
              <div key={l.id} onClick={() => onSelectLead(l)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 6px', background: COR_COLUNA[l.status_kanban]+'15',
                  borderLeft:`3px solid ${COR_COLUNA[l.status_kanban]}`, borderRadius:3, marginBottom:3, cursor:'pointer' }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#1f2937' }}>{l.nome_cliente}</div>
                  {l.empresa && <div style={{ fontSize:9, color:'#6b7280' }}>{l.empresa}</div>}
                </div>
                {l.operador_responsavel && <span style={{ marginLeft:'auto', fontSize:8, color:'#9ca3af' }}>{l.operador_responsavel}</span>}
              </div>
            ))}
            {isHoje && !itens.length && (
              <div style={{ fontSize:10, color:'#9ca3af' }}>Nenhum contato agendado para hoje.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL NOVO LEAD
// ─────────────────────────────────────────────────────────────────────────────
function ModalNovoLead({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...LEAD_VAZIO, operador_responsavel: currentUser?.nome || '' });
  const [salvando, setSalvando] = useState(false);
  const [clienteSalvarPendente, setClienteSalvarPendente] = useState<any>(null);
  const set = (k:string, v:string) => setForm(f => ({...f,[k]:v}));

  const salvar = async () => {
    if (!form.nome_cliente.trim()) { alert('Nome obrigatório!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    await supabase.from('crm_clientes').insert([{
      ...form,
      status_kanban: form.status_kanban || 'Prospectado',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      created_at: agora,
      atualizado_em: agora,
    }]);
    const _savedCliente = { formData: { ...form, cliente_nome: form.nome_cliente }, clienteId: form._cliente_id };
    setSalvando(false);
    onSaved();
    onClose();
    if (_savedCliente.formData.nome_cliente?.trim()) setClienteSalvarPendente(_savedCliente);
  };

  const Inp = ({ label, field, type='text', required=false }) => (
    <div>
      <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>{label}{required?' *':''}</label>
      <input type={type} value={form[field]||''} onChange={e=>set(field,e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:`1px solid ${required&&!form[field]?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(520px,95vw)', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
          <span>+ Novo Lead</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Nome *</label>
            <ClienteAutocomplete
              value={form.nome_cliente}
              onChange={v=>setForm(f=>({...f,nome_cliente:v,_cliente_id:null,_cliente_obj:null}))}
              onSelect={c=>{ const d=clienteToForm(c); setForm(f=>({...f,nome_cliente:d.nome_cliente,empresa:d.empresa||f.empresa,cargo:d.cargo||f.cargo,telefone:d.telefone||f.telefone,email:d.email||f.email,_cliente_id:d._cliente_id,_cliente_obj:d._cliente_obj})); }}
              placeholder="Nome do contato / lead..."
            />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Inp label="Empresa" field="empresa" />
            <Inp label="Cargo" field="cargo" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Inp label="Telefone" field="telefone" />
            <Inp label="E-mail" field="email" type="email" />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Estágio Inicial</label>
            <div style={{ display:'flex', gap:6 }}>
              {COLUNAS.map(c => (
                <button key={c} onClick={() => set('status_kanban',c)}
                  style={{ flex:1, padding:'5px 4px', border:`1.5px solid ${form.status_kanban===c?COR_COLUNA[c]:'#d1d5db'}`,
                    background: form.status_kanban===c ? COR_COLUNA[c]+'18' : '#fff',
                    color: form.status_kanban===c ? COR_COLUNA[c] : '#374151',
                    borderRadius:4, fontSize:9, fontWeight:700, cursor:'pointer' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Inp label="Responsável" field="operador_responsavel" />
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Próximo Contato</label>
            <input type="date" value={form.data_proximo_contato} onChange={e=>set('data_proximo_contato',e.target.value)}
              style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Observações</label>
            <textarea value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} rows={3}
              style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#6366f1', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? 'Salvando...' : '+ Criar Lead'}
          </button>
        </div>
      </div>
      {clienteSalvarPendente && (
        <ClienteSalvarModal
          formData={clienteSalvarPendente.formData}
          clienteId={clienteSalvarPendente.clienteId}
          onClose={()=>setClienteSalvarPendente(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmTab({ currentUser }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [maxDias, setMaxDias] = useState(7);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any|null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [verCalendario, setVerCalendario] = useState(false);
  const [filtroUser, setFiltroUser] = useState('');
  const [busca, setBusca] = useState('');

  const isAdmin = currentUser?.perfil === 'Admin';

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const [{ data: clientes }, { data: cfg }] = await Promise.all([
      supabase.from('crm_clientes').select('*').order('nome_cliente', { ascending: true }),
      supabase.from('crm_config').select('*').eq('id', 1).single(),
    ]);
    setLeads(clientes || []);
    if (cfg?.dias_lead_esquecido) setMaxDias(cfg.dias_lead_esquecido);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const salvarMaxDias = async (dias: number) => {
    await supabase.from('crm_config').upsert({ id:1, dias_lead_esquecido: dias, atualizado_em: new Date().toISOString() });
    setMaxDias(dias);
  };

  // Leads filtrados para busca
  const leadsFiltrados = leads.filter(l => {
    if (busca) {
      const b = busca.toLowerCase();
      if (!(l.nome_cliente||'').toLowerCase().includes(b) &&
          !(l.empresa||'').toLowerCase().includes(b) &&
          !(l.telefone||'').includes(b) &&
          !(l.email||'').toLowerCase().includes(b)) return false;
    }
    if (filtroUser && l.operador_responsavel !== filtroUser) return false;
    return true;
  });

  const usuariosUnicos = [...new Set(leads.map(l => l.operador_responsavel).filter(Boolean))];
  const totalEsquecidos = leads.filter(l => isEsquecido(l, maxDias)).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f4f6f9' }}>

      {/* ── HEADER ── */}
      <div style={{ background:'#4338ca', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>
            🎯 CRM — Gestão de Leads
            {totalEsquecidos > 0 && (
              <span style={{ marginLeft:8, background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>
                ⚠️ {totalEsquecidos} esquecido{totalEsquecidos>1?'s':''}
              </span>
            )}
          </div>
          <div style={{ fontSize:10, opacity:.75 }}>{leads.length} leads · {totalEsquecidos} esquecidos (+ {maxDias}d)</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setVerCalendario(v=>!v)}
            style={{ background: verCalendario?'#fff':'rgba(255,255,255,.15)', color: verCalendario?'#4338ca':'#fff',
              border:'1px solid rgba(255,255,255,.3)', borderRadius:6, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            {verCalendario ? '📋 Kanban' : '📅 Calendário'}
          </button>
          <button onClick={() => setModalNovo(true)}
            style={{ background:'#6366f1', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
            + Novo Lead
          </button>
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>
        <input placeholder="Buscar nome, empresa, telefone..." value={busca} onChange={e=>setBusca(e.target.value)}
          style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:11, width:220 }} />
        <div>
          <select value={filtroUser} onChange={e=>setFiltroUser(e.target.value)}
            style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="">Todos os responsáveis</option>
            {usuariosUnicos.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:10, color:'#6b7280', fontWeight:700 }}>⚙️ Lead esquecido após</span>
            <input type="number" min={1} max={90} value={maxDias}
              onChange={e => salvarMaxDias(parseInt(e.target.value)||7)}
              style={{ width:50, padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, textAlign:'center' }} />
            <span style={{ fontSize:10, color:'#6b7280' }}>dias</span>
          </div>
        )}
      </div>

      {/* ── VISTA CALENDÁRIO ── */}
      {verCalendario ? (
        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          <div style={{ fontWeight:700, fontSize:12, color:'#374151', marginBottom:8 }}>📅 Agenda de Contatos — Próximos 14 dias</div>
          <CalendarioContatos leads={leadsFiltrados} filtroUser={filtroUser} onSelectLead={setSelectedLead} />
        </div>
      ) : (
        /* ── KANBAN ── */
        <div style={{ flex:1, display:'flex', gap:0, overflowX:'auto', padding:0 }}>
          {COLUNAS.map(coluna => {
            const items = leadsFiltrados.filter(l => (l.status_kanban || 'Prospectado') === coluna);
            const esquecidosNaColuna = items.filter(l => isEsquecido(l, maxDias)).length;
            return (
              <div key={coluna} style={{ flex:'0 0 calc(25% - 1px)', minWidth:220, display:'flex', flexDirection:'column',
                borderRight:'1px solid #e2e8f0', background:'#f8fafc' }}>
                {/* Cabeçalho da coluna */}
                <div style={{ padding:'10px 12px', background:COR_COLUNA[coluna], color:'#fff', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontWeight:700, fontSize:11, flex:1 }}>{coluna}</span>
                  <span style={{ background:'rgba(255,255,255,.25)', borderRadius:10, padding:'1px 8px', fontSize:10, fontWeight:700 }}>{items.length}</span>
                  {esquecidosNaColuna > 0 && (
                    <span style={{ background:'#dc2626', borderRadius:10, padding:'1px 6px', fontSize:9, fontWeight:700 }}>⚠️{esquecidosNaColuna}</span>
                  )}
                </div>
                {/* Cards */}
                <div style={{ flex:1, overflowY:'auto', padding:'8px 8px' }}>
                  {items.length === 0 && (
                    <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:20 }}>Nenhum lead</div>
                  )}
                  {items.map(l => (
                    <LeadCard key={l.id} lead={l} maxDias={maxDias} onClick={() => setSelectedLead(l)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAIS ── */}
      {modalNovo && (
        <ModalNovoLead currentUser={currentUser} onClose={() => setModalNovo(false)} onSaved={fetchLeads} />
      )}
      {selectedLead && (
        <LeadModal lead={selectedLead} currentUser={currentUser}
          onClose={() => setSelectedLead(null)}
          onRefresh={fetchLeads} />
      )}
    </div>
  );
}
