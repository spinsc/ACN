// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LIST = ['Aberta','Em Análise','Analisada','Em Andamento','Vencida','Perdida','Descartada'];
const STATUS_COR: Record<string,string> = {
  'Aberta':       '#2563eb',
  'Em Análise':   '#d97706',
  'Analisada':    '#7c3aed',
  'Em Andamento': '#059669',
  'Vencida':      '#16a34a',
  'Perdida':      '#dc2626',
  'Descartada':   '#6b7280',
};
const MARCADORES = ['Em Recurso','Em Defesa','Impugnado'];
const PRIORIDADES = ['Alta','Média','Baixa'];
const PRIO_COR: Record<string,string> = { 'Alta':'#dc2626','Média':'#d97706','Baixa':'#16a34a' };
const TIPO_ANEXO_LABELS: Record<string,string> = {
  documento:   '📄 Documento',
  foto:        '🖼️ Foto',
  proposta:    '📋 Proposta',
  habilitacao: '🔑 Habilitação',
  orcamento:   '💰 Orçamento',
  anotacao:    '📝 Anotação',
  contato:     '👤 Contato',
};
const SORT_OPTIONS = [
  { value:'data_disputa',                label:'Data de Disputa' },
  { value:'data_limite_proposta',        label:'Limite de Proposta' },
  { value:'data_limite_analise_tecnica', label:'Limite Análise Técnica' },
  { value:'prioridade',                  label:'Prioridade' },
  { value:'orgao',                       label:'Órgão' },
  { value:'status',                      label:'Status' },
  { value:'criado_em',                   label:'Mais Recentes' },
];

const LICIT_VAZIO = {
  numero:'', nome_projeto:'', objeto_principal:'', orgao:'',
  classificacao:'Direta', prioridade:'Média',
  data_limite_esclarecimentos:'', data_limite_proposta:'',
  data_disputa:'', data_limite_analise_tecnica:'',
  analista_nome:'', analista_email:'',
  coordenador_nome:'', coordenador_email:'',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('pt-BR',{ day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit' });
};
const fmtDate = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
};
const isVencido = (v: string) => v && new Date(v) < new Date();
const diasRestantes = (v: string) => {
  if (!v) return null;
  const diff = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  return diff;
};

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  const ext  = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  return safeBase + ext;
}

async function uploadAnexo(file: File, licitacaoId: string, tipo: string): Promise<string|null> {
  const safeName = sanitizeFileName(file.name);
  const path = `licitacoes/${licitacaoId}/${tipo}/${Date.now()}_${safeName}`;
  // Force octet-stream for Office files to bypass bucket MIME restrictions
  const officeExts = /\.(docx?|xlsx?|pptx?)$/i;
  const contentType = officeExts.test(file.name) ? 'application/octet-stream' : file.type;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType });
  if (error || !data) { console.error('Upload erro Supabase:', error?.message); return null; }
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE DE PRAZO
// ─────────────────────────────────────────────────────────────────────────────
function PrazoBadge({ label, value }: { label:string; value:string }) {
  if (!value) return null;
  const dias = diasRestantes(value);
  const vencido = dias !== null && dias < 0;
  const urgente = dias !== null && dias >= 0 && dias <= 2;
  const cor = vencido ? '#dc2626' : urgente ? '#d97706' : '#374151';
  const bg  = vencido ? '#fef2f2' : urgente ? '#fffbeb' : '#f8fafc';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:bg,
      color:cor, border:`1px solid ${cor}30`, borderRadius:4, padding:'1px 6px', fontSize:9, fontWeight:700 }}>
      {label}: {fmtDT(value)}
      {vencido && ' ⚠️'}
      {urgente && ` (${dias}d)`}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE
// ─────────────────────────────────────────────────────────────────────────────
function LicitacaoModal({ licit, currentUser, onClose, onRefresh }) {
  const [tab, setTab] = useState<'info'|'anexos'|'historico'>('info');
  const [anexos, setAnexos] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [tipoAnexo, setTipoAnexo] = useState('documento');
  const [anotacaoTxt, setAnotacaoTxt] = useState('');
  const [contatoTxt, setContatoTxt] = useState('');
  const [fileInput, setFileInput] = useState<FileList|null>(null);
  const [obsEncerramento, setObsEncerramento] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = true; // acesso já controlado pelo dashboard
  const isAnalista = true;
  const isCoordenador = true;

  const fetchAnexos = useCallback(async () => {
    const { data } = await supabase.from('licitacao_anexos')
      .select('*').eq('licitacao_id', licit.id)
      .order('criado_em', { ascending: false });
    setAnexos(data || []);
  }, [licit.id]);

  useEffect(() => { fetchAnexos(); }, [fetchAnexos]);

  // ── Mudar status ────────────────────────────────────────────────────────
  const mudarStatus = async (novoStatus: string) => {
    setSalvando(true);
    const agora = new Date().toISOString();
    const hist = [...(licit.historico || []), {
      status: novoStatus,
      usuario: currentUser?.nome,
      data: agora,
      obs: obsEncerramento || '',
    }];
    await supabase.from('licitacoes').update({
      status: novoStatus,
      historico: hist,
      obs_encerramento: obsEncerramento || null,
      atualizado_em: agora,
    }).eq('id', licit.id);
    setConfirmStatus(null);
    setObsEncerramento('');
    setSalvando(false);
    onRefresh();
    onClose();
  };

  // ── Toggle marcador ─────────────────────────────────────────────────────
  const toggleMarcador = async (m: string) => {
    const atuais: string[] = licit.marcadores || [];
    const novos = atuais.includes(m) ? atuais.filter(x => x !== m) : [...atuais, m];
    await supabase.from('licitacoes').update({ marcadores: novos, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
    onRefresh();
  };

  // ── Upload de arquivo ───────────────────────────────────────────────────
  const salvarAnexo = async () => {
    setSalvando(true);
    if ((tipoAnexo === 'anotacao' || tipoAnexo === 'contato')) {
      const txt = tipoAnexo === 'anotacao' ? anotacaoTxt : contatoTxt;
      if (!txt.trim()) { setSalvando(false); return; }
      await supabase.from('licitacao_anexos').insert([{
        licitacao_id: licit.id, tipo: tipoAnexo,
        nome: tipoAnexo === 'anotacao' ? 'Anotação' : 'Contato',
        conteudo: txt,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]);
      setAnotacaoTxt(''); setContatoTxt('');
    } else if (fileInput && fileInput.length > 0) {
      for (let i = 0; i < fileInput.length; i++) {
        const url = await uploadAnexo(fileInput[i], licit.id, tipoAnexo);
        if (url) {
          await supabase.from('licitacao_anexos').insert([{
            licitacao_id: licit.id, tipo: tipoAnexo,
            nome: fileInput[i].name, url,
            criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
          }]);
        }
      }
      if (fileRef.current) fileRef.current.value = '';
      setFileInput(null);
    }
    await fetchAnexos();
    setSalvando(false);
  };

  const excluirAnexo = async (id: string) => {
    if (!confirm('Remover este anexo?')) return;
    await supabase.from('licitacao_anexos').delete().eq('id', id);
    fetchAnexos();
  };

  const s = licit.status;
  const marcadores: string[] = licit.marcadores || [];

  const botaoProximoStatus = () => {
    if (s === 'Aberta' && isAnalista)
      return { label:'📤 Enviar para Análise', next:'Em Análise' };
    if (s === 'Em Análise' && isCoordenador)
      return { label:'✅ Marcar como Analisada', next:'Analisada' };
    if (s === 'Analisada' && isAnalista)
      return { label:'🚀 Iniciar Andamento', next:'Em Andamento' };
    return null;
  };

  const btnProximo = botaoProximoStatus();

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'min(700px,95vw)', height:'100vh', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px #0003' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px', background:STATUS_COR[s]||'#374151', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:10, opacity:.8, fontWeight:600 }}>{s.toUpperCase()} · {licit.classificacao}</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{licit.numero} — {licit.nome_projeto}</div>
            <div style={{ fontSize:10, opacity:.85 }}>{licit.orgao}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        {/* Prioridade + Marcadores */}
        <div style={{ padding:'8px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flexShrink:0 }}>
          <span style={{ background:PRIO_COR[licit.prioridade]||'#374151', color:'#fff', borderRadius:4, padding:'1px 8px', fontSize:10, fontWeight:700 }}>
            ★ {licit.prioridade}
          </span>
          {s === 'Em Andamento' && MARCADORES.map(m => (
            <button key={m} onClick={() => toggleMarcador(m)}
              style={{ border:`1.5px solid ${marcadores.includes(m)?'#dc2626':'#d1d5db'}`,
                background: marcadores.includes(m)?'#fef2f2':'#fff',
                color: marcadores.includes(m)?'#dc2626':'#6b7280',
                borderRadius:4, padding:'2px 8px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              {marcadores.includes(m)?'✓ ':''}{m}
            </button>
          ))}
        </div>

        {/* Tabs de navegação */}
        <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
          {(['info','anexos','historico'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'8px 4px', border:'none', borderBottom: tab===t?'2px solid #2563eb':'2px solid transparent',
                background:'none', fontWeight:tab===t?700:400, color:tab===t?'#2563eb':'#6b7280', fontSize:11, cursor:'pointer' }}>
              {t==='info'?'📋 Informações':t==='anexos'?`📁 Documentos (${anexos.length})`:'📜 Histórico'}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>

          {/* ── TAB INFO ── */}
          {tab === 'info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <InfoRow label="Número" value={licit.numero} />
              <InfoRow label="Projeto" value={licit.nome_projeto} />
              <InfoRow label="Órgão" value={licit.orgao} />
              <InfoRow label="Objeto" value={licit.objeto_principal || '—'} />
              <InfoRow label="Classificação" value={licit.classificacao} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <InfoRow label="Registro" value={fmtDT(licit.data_registro)} />
                <InfoRow label="Limite Esclarecimentos/Impugnação" value={fmtDT(licit.data_limite_esclarecimentos)} alert={isVencido(licit.data_limite_esclarecimentos)} />
                <InfoRow label="Limite Proposta" value={fmtDT(licit.data_limite_proposta)} alert={isVencido(licit.data_limite_proposta)} />
                <InfoRow label="Data de Disputa" value={fmtDT(licit.data_disputa)} alert={isVencido(licit.data_disputa)} />
                <InfoRow label="Limite Análise Técnica" value={fmtDT(licit.data_limite_analise_tecnica)} alert={isVencido(licit.data_limite_analise_tecnica)} />
              </div>
              {licit.analista_nome && <InfoRow label="Analista" value={`${licit.analista_nome} (${licit.analista_email||''})`} />}
              {licit.coordenador_nome && <InfoRow label="Analista Técnico" value={`${licit.coordenador_nome} (${licit.coordenador_email||''})`} />}
              {licit.obs_encerramento && <InfoRow label="Obs. Encerramento" value={licit.obs_encerramento} />}
            </div>
          )}

          {/* ── TAB ANEXOS ── */}
          {tab === 'anexos' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Upload */}
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12 }}>
                <div style={{ fontWeight:700, fontSize:10, color:'#374151', marginBottom:8 }}>ADICIONAR</div>
                <select value={tipoAnexo} onChange={e=>setTipoAnexo(e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, marginBottom:8 }}>
                  {Object.entries(TIPO_ANEXO_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {tipoAnexo === 'anotacao' ? (
                  <textarea value={anotacaoTxt} onChange={e=>setAnotacaoTxt(e.target.value)}
                    placeholder="Anotação..." rows={3}
                    style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
                ) : tipoAnexo === 'contato' ? (
                  <textarea value={contatoTxt} onChange={e=>setContatoTxt(e.target.value)}
                    placeholder="Nome, telefone, e-mail, observações..." rows={3}
                    style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
                ) : (
                  <input type="file" multiple ref={fileRef}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={e=>setFileInput(e.target.files)}
                    style={{ width:'100%', fontSize:11 }} />
                )}
                <button onClick={salvarAnexo} disabled={salvando}
                  style={{ marginTop:8, background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'6px 16px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {salvando ? 'Salvando...' : '+ Adicionar'}
                </button>
              </div>

              {/* Lista de anexos por tipo */}
              {['proposta','habilitacao','orcamento','documento','foto','anotacao','contato'].map(tipo => {
                const lista = anexos.filter(a => a.tipo === tipo);
                if (!lista.length) return null;
                return (
                  <div key={tipo}>
                    <div style={{ fontWeight:700, fontSize:9, color:'#6b7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'.5px' }}>
                      {TIPO_ANEXO_LABELS[tipo]} ({lista.length})
                    </div>
                    {lista.map(a => (
                      <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 8px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:4, marginBottom:4 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          {a.url ? (
                            <a href={a.url} target="_blank" rel="noreferrer"
                              style={{ color:'#2563eb', fontSize:11, fontWeight:600, wordBreak:'break-all' }}>
                              📎 {a.nome}
                            </a>
                          ) : (
                            <div style={{ fontSize:11, color:'#374151', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{a.conteudo}</div>
                          )}
                          <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>
                            {a.criado_por_nome} · {fmtDT(a.criado_em)}
                          </div>
                        </div>
                        {isAdmin && (
                          <button onClick={() => excluirAnexo(a.id)}
                            style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 2px' }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {!anexos.length && <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Nenhum documento ainda.</div>}
            </div>
          )}

          {/* ── TAB HISTÓRICO ── */}
          {tab === 'historico' && (
            <div>
              {[...(licit.historico||[])].reverse().map((h: any, i: number) => (
                <div key={i} style={{ display:'flex', gap:10, marginBottom:10 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:STATUS_COR[h.status]||'#6b7280', marginTop:3, flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:11, color:STATUS_COR[h.status]||'#374151' }}>{h.status}</div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>{h.usuario} · {fmtDT(h.data)}</div>
                    {h.obs && <div style={{ fontSize:11, color:'#374151', marginTop:2 }}>{h.obs}</div>}
                  </div>
                </div>
              ))}
              {!(licit.historico||[]).length && (
                <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Histórico vazio.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer — botões de ação */}
        <div style={{ borderTop:'1px solid #e2e8f0', padding:'10px 16px', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>

          {/* Próximo status no fluxo */}
          {btnProximo && !confirmStatus && (
            <button onClick={() => setConfirmStatus(btnProximo.next)}
              style={{ background:STATUS_COR[btnProximo.next], color:'#fff', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              {btnProximo.label}
            </button>
          )}

          {/* Botões de encerramento (Em Andamento) */}
          {s === 'Em Andamento' && isAnalista && !confirmStatus && (
            <div style={{ display:'flex', gap:8 }}>
              {['Vencida','Perdida','Descartada'].map(ns => (
                <button key={ns} onClick={() => setConfirmStatus(ns)}
                  style={{ flex:1, background:STATUS_COR[ns], color:'#fff', border:'none', borderRadius:6, padding:'7px 8px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {ns === 'Vencida' ? '🏆 Vencida' : ns === 'Perdida' ? '😞 Perdida' : '🗑️ Descartada'}
                </button>
              ))}
            </div>
          )}

          {/* Confirmação de transição */}
          {confirmStatus && (
            <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:6, padding:10 }}>
              <div style={{ fontWeight:700, fontSize:11, marginBottom:6 }}>
                Mover para: <span style={{ color:STATUS_COR[confirmStatus] }}>{confirmStatus}</span>
              </div>
              <textarea value={obsEncerramento} onChange={e=>setObsEncerramento(e.target.value)}
                placeholder="Observação (opcional)..." rows={2}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'none', boxSizing:'border-box', marginBottom:6 }} />
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => mudarStatus(confirmStatus)} disabled={salvando}
                  style={{ flex:1, background:STATUS_COR[confirmStatus], color:'#fff', border:'none', borderRadius:4, padding:'6px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {salvando ? 'Salvando...' : '✓ Confirmar'}
                </button>
                <button onClick={() => { setConfirmStatus(null); setObsEncerramento(''); }}
                  style={{ padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:11, cursor:'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, alert }: { label:string; value:string; alert?: boolean }) {
  return (
    <div style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:6 }}>
      <div style={{ fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>{label}</div>
      <div style={{ fontSize:12, color: alert ? '#dc2626' : '#1f2937', fontWeight: alert ? 700 : 400 }}>
        {value}{alert ? ' ⚠️' : ''}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL NOVA LICITAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...LICIT_VAZIO, analista_nome: currentUser?.nome||'', analista_email: currentUser?.email||'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.numero.trim()) { alert('Número da licitação obrigatório!'); return; }
    if (!form.nome_projeto.trim()) { alert('Nome do projeto obrigatório!'); return; }
    if (!form.orgao.trim()) { alert('Órgão obrigatório!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const historico = [{ status:'Aberta', usuario: currentUser?.nome, data: agora, obs:'Licitação aberta.' }];
    await supabase.from('licitacoes').insert([{
      ...form,
      data_registro: agora,
      data_limite_esclarecimentos: form.data_limite_esclarecimentos || null,
      data_limite_proposta: form.data_limite_proposta || null,
      data_disputa: form.data_disputa || null,
      data_limite_analise_tecnica: form.data_limite_analise_tecnica || null,
      historico,
      marcadores: [],
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
    }]);
    setSalvando(false);
    onSaved();
    onClose();
  };

  const Input = ({ label, field, type='text', required=false }) => (
    <div>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}{required?' *':''}</label>
      <input type={type} value={form[field]} onChange={e=>set(field,e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:`1px solid ${required&&!form[field]?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(640px,95vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, color:'#1f2937', display:'flex', justifyContent:'space-between' }}>
          <span>+ Nova Licitação</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Número da Licitação" field="numero" required />
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Classificação *</label>
              <select value={form.classificacao} onChange={e=>set('classificacao',e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11 }}>
                <option>Direta</option>
                <option>Parceiro</option>
              </select>
            </div>
          </div>

          <Input label="Nome do Projeto" field="nome_projeto" required />
          <Input label="Órgão" field="orgao" required />
          <Input label="Objeto Principal" field="objeto_principal" />

          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Prioridade</label>
            <div style={{ display:'flex', gap:6 }}>
              {PRIORIDADES.map(p => (
                <button key={p} onClick={() => set('prioridade', p)}
                  style={{ flex:1, padding:'5px', border:`1.5px solid ${form.prioridade===p?PRIO_COR[p]:'#d1d5db'}`,
                    background: form.prioridade===p ? PRIO_COR[p]+'18' : '#fff',
                    color: form.prioridade===p ? PRIO_COR[p] : '#374151',
                    borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>PRAZOS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Esclarecimentos/Impugnação</label>
                <input type="datetime-local" value={form.data_limite_esclarecimentos} onChange={e=>set('data_limite_esclarecimentos',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Cadastro da Proposta</label>
                <input type="datetime-local" value={form.data_limite_proposta} onChange={e=>set('data_limite_proposta',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Data/Hora de Disputa</label>
                <input type="datetime-local" value={form.data_disputa} onChange={e=>set('data_disputa',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Análise Técnica</label>
                <input type="datetime-local" value={form.data_limite_analise_tecnica} onChange={e=>set('data_limite_analise_tecnica',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>RESPONSÁVEIS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Input label="Analista de Licitações" field="analista_nome" />
              <Input label="E-mail do Analista" field="analista_email" type="email" />
              <Input label="Analista Técnico" field="coordenador_nome" />
              <Input label="E-mail do Analista Técnico" field="coordenador_email" type="email" />
            </div>
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? 'Salvando...' : '+ Criar Licitação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE LICITAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function LicitCard({ l, onClick }) {
  const marcadores: string[] = l.marcadores || [];
  const dias = diasRestantes(l.data_disputa);
  const urgente = dias !== null && dias >= 0 && dias <= 5;
  const vencidoDisputa = dias !== null && dias < 0 && ['Aberta','Em Análise','Analisada','Em Andamento'].includes(l.status);

  return (
    <div onClick={onClick} style={{ background:'#fff', border:`1.5px solid ${STATUS_COR[l.status]||'#e2e8f0'}20`,
      borderLeft:`4px solid ${STATUS_COR[l.status]||'#e2e8f0'}`,
      borderRadius:6, padding:'10px 12px', cursor:'pointer', marginBottom:8,
      boxShadow:'0 1px 3px #0001', transition:'box-shadow .15s',
    }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 3px 8px #0002')}
      onMouseLeave={e=>(e.currentTarget.style.boxShadow='0 1px 3px #0001')}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ background:STATUS_COR[l.status], color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{l.status}</span>
            <span style={{ background: PRIO_COR[l.prioridade]+'18', color:PRIO_COR[l.prioridade], border:`1px solid ${PRIO_COR[l.prioridade]}40`, borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>{l.prioridade}</span>
            <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:600 }}>{l.classificacao}</span>
            {marcadores.map(m => (
              <span key={m} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 5px', fontSize:8, fontWeight:700 }}>{m}</span>
            ))}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1f2937', marginBottom:2 }}>{l.numero} — {l.nome_projeto}</div>
          <div style={{ fontSize:10, color:'#6b7280' }}>{l.orgao}</div>
          {l.objeto_principal && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>{l.objeto_principal}</div>}
        </div>
      </div>
      {/* Prazos */}
      <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
        {l.data_disputa && (
          <span style={{ fontSize:9, fontWeight:700, color: vencidoDisputa?'#dc2626': urgente?'#d97706':'#374151',
            background: vencidoDisputa?'#fef2f2': urgente?'#fffbeb':'#f8fafc',
            border:`1px solid ${vencidoDisputa?'#fca5a5':urgente?'#fcd34d':'#e2e8f0'}`,
            borderRadius:3, padding:'1px 6px' }}>
            ⚡ Disputa: {fmtDT(l.data_disputa)}{dias!==null&&dias>=0?` (${dias}d)`:''}
            {vencidoDisputa?' ⚠️':''}
          </span>
        )}
        {l.data_limite_proposta && (
          <span style={{ fontSize:9, color:'#6b7280', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:3, padding:'1px 6px' }}>
            📋 Proposta: {fmtDT(l.data_limite_proposta)}
          </span>
        )}
      </div>
      {l.analista_nome && (
        <div style={{ marginTop:4, fontSize:9, color:'#9ca3af' }}>👤 {l.analista_nome}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function LicitacoesTab({ currentUser }) {
  const [licitacoes, setLicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroAnalista, setFiltroAnalista] = useState<string>('');
  const [filtroPeriodoDe, setFiltroPeriodoDe] = useState('');
  const [filtroPeriodoAte, setFiltroPeriodoAte] = useState('');
  const [sortBy, setSortBy] = useState('data_disputa');
  const [modalNova, setModalNova] = useState(false);
  const [selected, setSelected] = useState<any|null>(null);

  const isAdmin = true; // acesso já controlado pelo dashboard
  const isAnalista = true;

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('licitacoes').select('*').order('criado_em', { ascending: false });
    setLicitacoes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // ── Filtros e ordenação ──────────────────────────────────────────────────
  const lista = licitacoes
    .filter(l => filtroStatus === 'todas' || l.status === filtroStatus)
    .filter(l => filtroTipo === 'todos' || l.classificacao === filtroTipo)
    .filter(l => !filtroAnalista || (l.analista_nome||'').toLowerCase().includes(filtroAnalista.toLowerCase()))
    .filter(l => {
      if (!filtroPeriodoDe && !filtroPeriodoAte) return true;
      const disp = l.data_disputa ? new Date(l.data_disputa) : null;
      if (!disp) return !filtroPeriodoDe;
      if (filtroPeriodoDe && disp < new Date(filtroPeriodoDe)) return false;
      if (filtroPeriodoAte && disp > new Date(filtroPeriodoAte + 'T23:59:59')) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'prioridade') {
        const ord = { 'Alta':0, 'Média':1, 'Baixa':2 };
        return (ord[a.prioridade]??1) - (ord[b.prioridade]??1);
      }
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'orgao') return (a.orgao||'').localeCompare(b.orgao||'');
      const da = a[sortBy] ? new Date(a[sortBy]).getTime() : Infinity;
      const db2 = b[sortBy] ? new Date(b[sortBy]).getTime() : Infinity;
      return da - db2;
    });

  // contadores por status
  const conts: Record<string,number> = {};
  licitacoes.forEach(l => { conts[l.status] = (conts[l.status]||0) + 1; });

  const analistasUnicos = [...new Set(licitacoes.map(l => l.analista_nome).filter(Boolean))];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f4f6f9' }}>

      {/* ── HEADER ── */}
      <div style={{ background:'#1e3a5f', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>🏛️ Licitações</div>
          <div style={{ fontSize:10, opacity:.75 }}>{licitacoes.length} total · {lista.length} exibindo</div>
        </div>
        {isAnalista && (
          <button onClick={() => setModalNova(true)}
            style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
            + Nova Licitação
          </button>
        )}
      </div>

      {/* ── STATUS CHIPS ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
        <button onClick={() => setFiltroStatus('todas')}
          style={{ border:'none', borderRadius:20, padding:'3px 12px', fontSize:10, fontWeight:700,
            background: filtroStatus==='todas'?'#1e3a5f':'#f1f5f9', color: filtroStatus==='todas'?'#fff':'#374151', cursor:'pointer' }}>
          Todas ({licitacoes.length})
        </button>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            style={{ border:`1.5px solid ${filtroStatus===s?STATUS_COR[s]:'transparent'}`,
              borderRadius:20, padding:'3px 10px', fontSize:10, fontWeight:700,
              background: filtroStatus===s ? STATUS_COR[s]+'15' : '#f1f5f9',
              color: filtroStatus===s ? STATUS_COR[s] : '#374151', cursor:'pointer' }}>
            {s} {conts[s]?`(${conts[s]})` : '(0)'}
          </button>
        ))}
      </div>

      {/* ── FILTROS ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>ORDENAR POR</div>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>TIPO</div>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="todos">Todos</option>
            <option>Direta</option>
            <option>Parceiro</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>ANALISTA</div>
          <select value={filtroAnalista} onChange={e=>setFiltroAnalista(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="">Todos</option>
            {analistasUnicos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>DISPUTA DE</div>
          <input type="date" value={filtroPeriodoDe} onChange={e=>setFiltroPeriodoDe(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }} />
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>ATÉ</div>
          <input type="date" value={filtroPeriodoAte} onChange={e=>setFiltroPeriodoAte(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }} />
        </div>
        {(filtroTipo!=='todos'||filtroAnalista||filtroPeriodoDe||filtroPeriodoAte) && (
          <button onClick={() => { setFiltroTipo('todos'); setFiltroAnalista(''); setFiltroPeriodoDe(''); setFiltroPeriodoAte(''); }}
            style={{ padding:'4px 10px', border:'1px solid #fca5a5', borderRadius:4, background:'#fef2f2', color:'#dc2626', fontSize:10, cursor:'pointer' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── LISTA ── */}
      <div style={{ flex:1, overflowY:'auto', padding:16 }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>Carregando...</div>
        ) : !lista.length ? (
          <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>
            {filtroStatus !== 'todas' ? `Nenhuma licitação com status "${filtroStatus}".` : 'Nenhuma licitação cadastrada.'}
          </div>
        ) : (
          lista.map(l => (
            <LicitCard key={l.id} l={l} onClick={() => setSelected(l)} />
          ))
        )}
      </div>

      {/* ── MODAIS ── */}
      {modalNova && (
        <ModalNova currentUser={currentUser} onClose={() => setModalNova(false)} onSaved={fetch} />
      )}
      {selected && (
        <LicitacaoModal
          licit={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            fetch();
            // Atualiza o selected com os dados novos
            supabase.from('licitacoes').select('*').eq('id', selected.id).single()
              .then(({ data }) => { if (data) setSelected(data); });
          }}
        />
      )}
    </div>
  );
}
