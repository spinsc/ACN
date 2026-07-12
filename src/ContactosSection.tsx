// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

const fmtTel = (n: string | null) => {
  if (!n) return null;
  const d = n.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  return n;
};

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;

const initials = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

const TIPO_ICON: Record<string, string> = {
  ligacao:  '📞',
  whatsapp: '💬',
  email:    '📧',
  reuniao:  '🤝',
  visita:   '🏢',
  outro:    '📝',
};
const TIPO_COR: Record<string, string> = {
  ligacao:  '#2563eb',
  whatsapp: '#16a34a',
  email:    '#7c3aed',
  reuniao:  '#0891b2',
  visita:   '#ea580c',
  outro:    '#64748b',
};
const RESULTADO_COR: Record<string, string> = {
  positivo: '#16a34a',
  neutro:   '#64748b',
  negativo: '#dc2626',
};

const VAZIO_CONTATO: any = {
  nome: '', cargo: '', empresa: '', cliente_id: null, _cliente_nome: '',
  whatsapp: '', email: '', telefone: '', linkedin: '', observacoes: '',
  operador_nome: '', foco_id: '',
};
const VAZIO_INTERACAO: any = {
  tipo: 'whatsapp', descricao: '', resultado: 'positivo',
  data_interacao: new Date().toISOString().slice(0, 16),
  oportunidade_id: null, audio_url: null, transcricao: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ContactosSection({ currentUser }: { currentUser: any }) {
  const isGerente = ['Admin', 'Gerente Comercial'].includes(currentUser?.perfil);

  // dados
  const [contatos, setContatos]       = useState<any[]>([]);
  const [interacoes, setInteracoes]   = useState<any[]>([]);
  const [oportunidades, setOps]       = useState<any[]>([]);
  const [clientes, setClientes]       = useState<any[]>([]);
  const [waMsgs, setWaMsgs]           = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  // UI
  const [busca, setBusca]             = useState('');
  const [filtroOp, setFiltroOp]       = useState('');
  const [contatoSel, setContatoSel]   = useState<any | null>(null);
  const [abaDetalhe, setAbaDetalhe]   = useState<'info'|'historico'|'whatsapp'>('info');

  // modais
  const [modalContato, setModalContato]     = useState<any | null>(null); // null=fechado, {}=novo, obj=editar
  const [modalInteracao, setModalInteracao] = useState<any | null>(null); // {contato}
  const [formC, setFormC]   = useState({ ...VAZIO_CONTATO });
  const [formI, setFormI]   = useState({ ...VAZIO_INTERACAO });
  const [salvando, setSalvando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const audioRef = useRef<HTMLInputElement>(null);

  // ─── carga ───
  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('crm_contatos').select('*').order('nome'),
      supabase.from('crm_interacoes').select('*').order('data_interacao', { ascending: false }),
      supabase.from('crm_oportunidades').select('id, titulo, funil').order('titulo'),
      supabase.from('clientes').select('id, nome').order('nome'),
      supabase.from('crm_whatsapp_msgs').select('*').order('data_msg', { ascending: false }),
    ]);
    setContatos(r1.data || []);
    setInteracoes(r2.data || []);
    setOps(r3.data || []);
    setClientes(r4.data || []);
    setWaMsgs(r5.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // atualiza contato selecionado quando dados recarregam
  useEffect(() => {
    if (contatoSel) {
      const atualizado = contatos.find(c => c.id === contatoSel.id);
      if (atualizado) setContatoSel(atualizado);
    }
  }, [contatos]);

  // ─── filtros ───
  const contatosFiltrados = contatos.filter(c => {
    if (!isGerente && c.operador_nome !== currentUser?.nome) return false;
    if (filtroOp && c.operador_nome !== filtroOp) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return c.nome?.toLowerCase().includes(b)
          || c.empresa?.toLowerCase().includes(b)
          || c.cargo?.toLowerCase().includes(b)
          || c.whatsapp?.includes(b)
          || c.email?.toLowerCase().includes(b);
    }
    return true;
  });

  const interacoesContato = (id: string) =>
    interacoes.filter(i => i.contato_id === id).slice(0, 30);
  const waMsgsContato = (id: string) =>
    waMsgs.filter(m => m.contato_id === id);
  const opsContato = (c: any) =>
    oportunidades.filter(o => o.cliente_id === c.cliente_id && c.cliente_id);

  // ─── operadores únicos (para filtro gerente) ───
  const operadoresUnicos = [...new Set(contatos.map(c => c.operador_nome).filter(Boolean))].sort();

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const limpar = (v: any) => (v === '' || v === undefined) ? null : v;

  const salvarContato = async () => {
    if (!formC.nome?.trim()) return;
    setSalvando(true);
    const p = {
      nome:          formC.nome.trim(),
      cargo:         limpar(formC.cargo),
      empresa:       limpar(formC.empresa),
      cliente_id:    limpar(formC.cliente_id),
      whatsapp:      limpar(formC.whatsapp),
      email:         limpar(formC.email),
      telefone:      limpar(formC.telefone),
      linkedin:      limpar(formC.linkedin),
      observacoes:   limpar(formC.observacoes),
      foco_id:       limpar(formC.foco_id),
      operador_nome: formC.operador_nome || currentUser?.nome,
      operador_id:   currentUser?.id || null,
      ativo:         true,
    };
    if (modalContato?.id) {
      await supabase.from('crm_contatos').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalContato.id);
    } else {
      const { data } = await supabase.from('crm_contatos').insert(p).select().single();
      if (data) setContatoSel(data);
    }
    setSalvando(false);
    setModalContato(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const excluirContato = async (c: any) => {
    if (!confirm(`Excluir "${c.nome}"?`)) return;
    await supabase.from('crm_contatos').delete().eq('id', c.id);
    if (contatoSel?.id === c.id) setContatoSel(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR INTERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────
  const salvarInteracao = async () => {
    if (!modalInteracao || !formI.descricao?.trim()) return;
    setSalvando(true);
    await supabase.from('crm_interacoes').insert({
      ...formI,
      contato_id:    modalInteracao.contato.id,
      operador_nome: currentUser?.nome,
      data_interacao: formI.data_interacao || new Date().toISOString(),
    });
    setSalvando(false);
    setModalInteracao(null);
    setFormI({ ...VAZIO_INTERACAO });
    if (audioRef.current) audioRef.current.value = '';
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // UPLOAD ÁUDIO + TRANSCRIÇÃO
  // ─────────────────────────────────────────────────────────────────────────
  const uploadAudio = async (file: File) => {
    const path = `interacoes/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data, error } = await supabase.storage.from('crm-audios').upload(path, file, { upsert: true });
    if (error || !data) { alert('Erro ao enviar áudio: ' + error?.message); return; }
    const { data: pub } = supabase.storage.from('crm-audios').getPublicUrl(path);
    setFormI(f => ({ ...f, audio_url: pub?.publicUrl || null }));
  };

  const transcreverAudio = async () => {
    if (!formI.audio_url) return;
    setTranscrevendo(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcrever-audio', {
        body: { audio_url: formI.audio_url },
      });
      if (error || !data?.transcricao) throw error || new Error('Sem transcrição');
      setFormI(f => ({ ...f, transcricao: data.transcricao, descricao: f.descricao || data.transcricao }));
    } catch (e: any) {
      alert('Erro na transcrição: ' + (e?.message || 'Verifique a Edge Function e a chave OpenAI.'));
    }
    setTranscrevendo(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MARCAR MSG COMO LIDA
  // ─────────────────────────────────────────────────────────────────────────
  const marcarLida = async (msgId: string) => {
    await supabase.from('crm_whatsapp_msgs').update({ lida: true }).eq('id', msgId);
    setWaMsgs(prev => prev.map(m => m.id === msgId ? { ...m, lida: true } : m));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER CARD CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const renderCard = (c: any) => {
    const isSel = contatoSel?.id === c.id;
    const nInter = interacoes.filter(i => i.contato_id === c.id).length;
    const nWA    = waMsgs.filter(m => m.contato_id === c.id && !m.lida).length;
    const ini    = initials(c.nome);
    const BG_COLORS = ['#7c3aed','#0891b2','#0f766e','#b45309','#be185d','#1d4ed8'];
    const bg = BG_COLORS[ini.charCodeAt(0) % BG_COLORS.length];

    return (
      <div key={c.id} onClick={() => { setContatoSel(isSel ? null : c); setAbaDetalhe('info'); }}
        style={{
          background: isSel ? '#f0f9ff' : 'white',
          borderRadius:8, padding:'10px 12px',
          border: `1.5px solid ${isSel ? '#0891b2' : '#e2e8f0'}`,
          cursor:'pointer', marginBottom:6,
          transition:'all .15s',
        }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
          {/* Avatar */}
          <div style={{ width:36, height:36, borderRadius:'50%', background:bg,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'white', fontSize:12, fontWeight:700, flexShrink:0 }}>
            {ini}
          </div>
          {/* Info */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginBottom:1 }}>{c.nome}</div>
            {(c.cargo || c.empresa) && (
              <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>
                {[c.cargo, c.empresa].filter(Boolean).join(' · ')}
              </div>
            )}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:3 }}>
              {c.whatsapp && (
                <span style={{ fontSize:8, background:'#dcfce7', color:'#166534', padding:'1px 6px', borderRadius:10, fontWeight:600 }}>
                  💬 {fmtTel(c.whatsapp)}
                </span>
              )}
              {c.email && (
                <span style={{ fontSize:8, background:'#f3e8ff', color:'#6b21a8', padding:'1px 6px', borderRadius:10, fontWeight:600 }}>
                  📧
                </span>
              )}
              {nInter > 0 && (
                <span style={{ fontSize:8, background:'#e0f2fe', color:'#0369a1', padding:'1px 6px', borderRadius:10, fontWeight:600 }}>
                  {nInter} interação{nInter !== 1 ? 'ões' : ''}
                </span>
              )}
              {nWA > 0 && (
                <span style={{ fontSize:8, background:'#dcfce7', color:'#166534', padding:'2px 6px', borderRadius:10, fontWeight:700 }}>
                  {nWA} msg{nWA !== 1 ? 's' : ''} não lida{nWA !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {isGerente && c.operador_nome && (
              <div style={{ fontSize:8, color:'#94a3b8', marginTop:2 }}>👤 {c.operador_nome}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PAINEL DETALHE
  // ─────────────────────────────────────────────────────────────────────────
  const renderDetalhe = () => {
    if (!contatoSel) return null;
    const c = contatoSel;
    const ini = initials(c.nome);
    const BG_COLORS = ['#7c3aed','#0891b2','#0f766e','#b45309','#be185d','#1d4ed8'];
    const bg = BG_COLORS[ini.charCodeAt(0) % BG_COLORS.length];
    const interacoesC = interacoesContato(c.id);
    const waMsgsC = waMsgsContato(c.id);
    const opsC = opsContato(c);

    return (
      <div style={{ width:340, flexShrink:0, background:'white', borderRadius:8,
        border:'1px solid #e2e8f0', display:'flex', flexDirection:'column',
        maxHeight:'calc(100vh - 180px)', overflow:'hidden' }}>
        {/* Header do painel */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:bg,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'white', fontSize:16, fontWeight:700, flexShrink:0 }}>
              {ini}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{c.nome}</div>
              {(c.cargo || c.empresa) && (
                <div style={{ fontSize:10, color:'#64748b' }}>{[c.cargo, c.empresa].filter(Boolean).join(' — ')}</div>
              )}
            </div>
            <button onClick={() => setContatoSel(null)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#94a3b8', padding:2 }}>✕</button>
          </div>

          {/* Ações rápidas */}
          <div style={{ display:'flex', gap:4, marginTop:10, flexWrap:'wrap' }}>
            {c.whatsapp && (
              <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#16a34a', color:'white',
                  border:'none', borderRadius:4, padding:'3px 8px', fontSize:9, fontWeight:700, textDecoration:'none' }}>
                💬 WhatsApp
              </a>
            )}
            <button className="acn-btn" style={{ background:'#0891b2' }}
              onClick={() => { setModalInteracao({ contato: c }); setFormI({ ...VAZIO_INTERACAO }); }}>
              + Registrar contato
            </button>
            <button className="acn-btn" style={{ background:'#475569' }}
              onClick={() => { setFormC({ ...VAZIO_CONTATO, ...c }); setModalContato(c); }}>
              ✏️ Editar
            </button>
            {(isGerente || c.operador_nome === currentUser?.nome) && (
              <button className="acn-btn" style={{ background:'#ef4444' }} onClick={() => excluirContato(c)}>✕</button>
            )}
          </div>
        </div>

        {/* Abas internas */}
        <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
          {([['info','ℹ️ Info'],['historico',`📋 Histórico (${interacoesC.length})`],['whatsapp',`💬 WA (${waMsgsC.length})`]] as const).map(([aba, label]) => (
            <div key={aba} onClick={() => setAbaDetalhe(aba)}
              style={{ padding:'5px 10px', fontSize:9, fontWeight:700, cursor:'pointer',
                color: abaDetalhe===aba ? '#0891b2' : '#64748b',
                borderBottom: abaDetalhe===aba ? '2px solid #0891b2' : '2px solid transparent',
              }}>
              {label}
            </div>
          ))}
        </div>

        {/* Conteúdo aba */}
        <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>

          {/* ── Info ── */}
          {abaDetalhe === 'info' && (
            <div>
              {[
                { label:'WhatsApp', val: c.whatsapp ? fmtTel(c.whatsapp) : null, icon:'💬' },
                { label:'E-mail',   val: c.email,    icon:'📧' },
                { label:'Telefone', val: c.telefone,  icon:'📞' },
                { label:'LinkedIn', val: c.linkedin,  icon:'🔗', link: c.linkedin },
              ].filter(r => r.val).map(({ label, val, icon, link }) => (
                <div key={label} style={{ display:'flex', gap:6, marginBottom:6, alignItems:'flex-start' }}>
                  <span style={{ fontSize:12, flexShrink:0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize:8, color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{label}</div>
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" style={{ fontSize:10, color:'#2563eb' }}>{val}</a>
                    ) : (
                      <div style={{ fontSize:10, color:'#1e293b' }}>{val}</div>
                    )}
                  </div>
                </div>
              ))}

              {c.foco_id && (
                <div style={{ fontSize:8, color:'#94a3b8', padding:'4px 8px', background:'#f8fafc', borderRadius:4, marginTop:4 }}>
                  🔗 Foco ID: <code>{c.foco_id}</code>
                </div>
              )}

              {c.observacoes && (
                <div style={{ marginTop:10, padding:'7px 10px', background:'#fffbeb', border:'1px solid #fed7aa', borderRadius:6, fontSize:10, color:'#92400e' }}>
                  {c.observacoes}
                </div>
              )}

              {/* Oportunidades ligadas */}
              {opsC.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Oportunidades</div>
                  {opsC.map(op => (
                    <div key={op.id} style={{ padding:'5px 8px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, marginBottom:4 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#0369a1' }}>{op.titulo}</div>
                      <div style={{ fontSize:8, color:'#64748b' }}>{op.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda Direta'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quem cadastrou */}
              <div style={{ marginTop:12, fontSize:8, color:'#94a3b8', paddingTop:8, borderTop:'1px dashed #e2e8f0' }}>
                Cadastrado por {c.operador_nome || '—'}
              </div>
            </div>
          )}

          {/* ── Histórico de interações ── */}
          {abaDetalhe === 'historico' && (
            <div>
              <button className="acn-btn" style={{ background:'#0891b2', marginBottom:10 }}
                onClick={() => { setModalInteracao({ contato: c }); setFormI({ ...VAZIO_INTERACAO }); }}>
                + Nova interação
              </button>

              {interacoesC.length === 0 ? (
                <div style={{ textAlign:'center', color:'#94a3b8', fontSize:10, padding:16 }}>
                  Nenhuma interação registrada ainda.
                </div>
              ) : interacoesC.map(i => (
                <div key={i.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px dashed #f1f5f9' }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:13 }}>{TIPO_ICON[i.tipo] || '📝'}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:9, fontWeight:700, color: TIPO_COR[i.tipo] || '#64748b', textTransform:'uppercase' }}>
                        {i.tipo}
                      </span>
                      {i.resultado && (
                        <span style={{ fontSize:8, marginLeft:6, padding:'1px 5px', borderRadius:10, fontWeight:700,
                          background: i.resultado === 'positivo' ? '#dcfce7' : i.resultado === 'negativo' ? '#fee2e2' : '#f1f5f9',
                          color: RESULTADO_COR[i.resultado] || '#64748b' }}>
                          {i.resultado}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize:8, color:'#94a3b8' }}>{fmtDT(i.data_interacao)}</span>
                  </div>
                  {i.descricao && (
                    <div style={{ fontSize:10, color:'#374151', lineHeight:1.4, paddingLeft:19 }}>{i.descricao}</div>
                  )}
                  {i.transcricao && (
                    <div style={{ marginTop:4, paddingLeft:19 }}>
                      <div style={{ fontSize:8, fontWeight:700, color:'#7c3aed', marginBottom:2 }}>🎙️ Transcrição</div>
                      <div style={{ fontSize:9, color:'#4c1d95', background:'#f5f3ff', borderRadius:4, padding:'4px 8px', lineHeight:1.4 }}>
                        {i.transcricao}
                      </div>
                    </div>
                  )}
                  {i.audio_url && !i.transcricao && (
                    <div style={{ paddingLeft:19, marginTop:4 }}>
                      <a href={i.audio_url} target="_blank" rel="noreferrer"
                        style={{ fontSize:9, color:'#2563eb' }}>🎵 Ouvir áudio</a>
                    </div>
                  )}
                  <div style={{ fontSize:8, color:'#94a3b8', paddingLeft:19, marginTop:2 }}>{i.operador_nome}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Mensagens WhatsApp ── */}
          {abaDetalhe === 'whatsapp' && (
            <div>
              {!c.whatsapp && (
                <div style={{ textAlign:'center', color:'#94a3b8', fontSize:10, padding:16 }}>
                  Nenhum número WhatsApp cadastrado para este contato.
                </div>
              )}
              {c.whatsapp && waMsgsC.length === 0 && (
                <div style={{ textAlign:'center', padding:16 }}>
                  <div style={{ fontSize:10, color:'#94a3b8', marginBottom:8 }}>Nenhuma mensagem sincronizada.</div>
                  <div style={{ fontSize:9, color:'#64748b', background:'#f8fafc', borderRadius:6, padding:'8px 10px', textAlign:'left' }}>
                    💡 Para sincronizar automaticamente, configure o webhook da <strong>Evolution API</strong> para gravar mensagens nesta tabela.<br /><br />
                    Endpoint: <code style={{ fontSize:8 }}>POST /functions/v1/whatsapp-webhook</code>
                  </div>
                  <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"
                    style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#16a34a', color:'white',
                      borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700, textDecoration:'none', marginTop:10 }}>
                    💬 Abrir no WhatsApp
                  </a>
                </div>
              )}
              {waMsgsC.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {waMsgsC.map(m => (
                    <div key={m.id} onClick={() => !m.lida && marcarLida(m.id)}
                      style={{
                        padding:'7px 10px', borderRadius:8, maxWidth:'88%', cursor: m.lida ? 'default' : 'pointer',
                        alignSelf: m.direcao === 'saida' ? 'flex-end' : 'flex-start',
                        background: m.direcao === 'saida' ? '#dcfce7' : m.lida ? '#f8fafc' : '#fff',
                        border: `1px solid ${m.lida ? '#e2e8f0' : '#bae6fd'}`,
                        fontWeight: m.lida ? 400 : 600,
                      }}>
                      <div style={{ fontSize:10, color:'#1e293b', lineHeight:1.4 }}>{m.conteudo || m.transcricao || '🎵 Áudio'}</div>
                      {m.transcricao && m.tipo_msg === 'audio' && (
                        <div style={{ fontSize:8, color:'#7c3aed', marginTop:2 }}>🎙️ Transcrito</div>
                      )}
                      <div style={{ fontSize:8, color:'#94a3b8', marginTop:3, textAlign:'right' }}>
                        {fmtDT(m.data_msg)} {!m.lida && <span style={{ color:'#0369a1' }}>● novo</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding:20, color:'#64748b', fontSize:11 }}>Carregando contatos...</div>;

  return (
    <div style={{ padding:'8px 0' }}>
      {/* ── Toolbar ── */}
      <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
        <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'3px 10px' }}
          onClick={() => { setFormC({ ...VAZIO_CONTATO, operador_nome: currentUser?.nome }); setModalContato({}); }}>
          + Novo Contato
        </button>
        <input
          placeholder="🔍 Nome, empresa, WhatsApp..."
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:9, width:200 }}
        />
        {isGerente && operadoresUnicos.length > 1 && (
          <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
            style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:9 }}>
            <option value="">Todos os operadores</option>
            {operadoresUnicos.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        )}
        <span style={{ fontSize:9, color:'#94a3b8', marginLeft:'auto' }}>
          {contatosFiltrados.length} contato{contatosFiltrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Layout: lista + painel ── */}
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        {/* Lista */}
        <div style={{ flex:1, minWidth:0 }}>
          {contatosFiltrados.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>
              <div style={{ fontSize:14, marginBottom:6 }}>📇</div>
              <div style={{ fontSize:11 }}>
                {busca ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado ainda.'}
              </div>
            </div>
          ) : contatosFiltrados.map(c => renderCard(c))}
        </div>

        {/* Painel detalhe */}
        {contatoSel && renderDetalhe()}
      </div>

      {/* ══════ MODAL CRIAR/EDITAR CONTATO ══════ */}
      {modalContato !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalContato(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(540px,96vw)',
            maxHeight:'90vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>

            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'#1e293b' }}>
              {modalContato?.id ? '✏️ Editar Contato' : '+ Novo Contato'}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 12px' }}>
              {/* Nome */}
              <div style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nome *</div>
                <input value={formC.nome||''} placeholder="Nome completo"
                  onChange={e => setFormC(f => ({...f, nome:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* Cargo */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Cargo</div>
                <input value={formC.cargo||''} placeholder="Ex: Diretor de Compras"
                  onChange={e => setFormC(f => ({...f, cargo:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* Empresa */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Empresa / Órgão</div>
                <input value={formC.empresa||''} placeholder="Ex: Prefeitura de SP"
                  onChange={e => setFormC(f => ({...f, empresa:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* Cliente vinculado */}
              <div style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Vincular a Cliente Cadastrado (opcional)</div>
                <select value={formC.cliente_id||''} onChange={e => setFormC(f => ({...f, cliente_id: e.target.value||null}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                  <option value="">— Sem vínculo —</option>
                  {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                </select>
              </div>

              {/* WhatsApp */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>WhatsApp (55DDD+número)</div>
                <input value={formC.whatsapp||''} placeholder="5511987654321"
                  onChange={e => setFormC(f => ({...f, whatsapp:e.target.value.replace(/\D/g,'')}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* E-mail */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>E-mail</div>
                <input type="email" value={formC.email||''} placeholder="contato@empresa.com"
                  onChange={e => setFormC(f => ({...f, email:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* Telefone */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Telefone fixo</div>
                <input value={formC.telefone||''} placeholder="(11) 3000-0000"
                  onChange={e => setFormC(f => ({...f, telefone:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* LinkedIn */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>LinkedIn</div>
                <input value={formC.linkedin||''} placeholder="https://linkedin.com/in/..."
                  onChange={e => setFormC(f => ({...f, linkedin:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>

              {/* Operador */}
              {isGerente && (
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Operador Responsável</div>
                  <ColaboradorSelect
                    value={formC.operador_nome||''}
                    onChange={v => setFormC(f => ({...f, operador_nome:v}))}
                    placeholder="Selecione o operador"
                  />
                </div>
              )}

              {/* Observações */}
              <div style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Observações</div>
                <textarea value={formC.observacoes||''} placeholder="Notas importantes sobre este contato..."
                  onChange={e => setFormC(f => ({...f, observacoes:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, height:60, resize:'vertical', boxSizing:'border-box' }}
                />
              </div>

              {/* Foco ID */}
              <div style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
                  Foco ID <span style={{ color:'#94a3b8', fontWeight:400' }}>(integração futura)</span>
                </div>
                <input value={formC.foco_id||''} placeholder="ID do contato no Sistema Foco"
                  onChange={e => setFormC(f => ({...f, foco_id:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:14 }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }}
                onClick={() => setModalContato(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0891b2', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarContato} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Contato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL REGISTRAR INTERAÇÃO ══════ */}
      {modalInteracao && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalInteracao(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(500px,96vw)',
            maxHeight:'90vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>

            <div style={{ fontWeight:700, fontSize:12, marginBottom:4, color:'#1e293b' }}>
              📋 Registrar Interação
            </div>
            <div style={{ fontSize:9, color:'#64748b', marginBottom:12, background:'#f8fafc',
              borderRadius:4, padding:'4px 8px' }}>
              Contato: <strong>{modalInteracao.contato?.nome}</strong>
            </div>

            {/* Tipo */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Tipo de Interação</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {['ligacao','whatsapp','email','reuniao','visita','outro'].map(t => (
                  <button key={t} onClick={() => setFormI(f => ({...f, tipo:t}))}
                    style={{ fontSize:9, padding:'3px 10px', borderRadius:14, fontWeight:700, cursor:'pointer', border:'none',
                      background: formI.tipo===t ? TIPO_COR[t] : '#f1f5f9',
                      color: formI.tipo===t ? 'white' : '#64748b',
                    }}>
                    {TIPO_ICON[t]} {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Resultado */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Resultado</div>
              <div style={{ display:'flex', gap:5 }}>
                {[['positivo','✅'],['neutro','➖'],['negativo','❌']].map(([r, icon]) => (
                  <button key={r} onClick={() => setFormI(f => ({...f, resultado:r}))}
                    style={{ fontSize:9, padding:'3px 10px', borderRadius:14, fontWeight:700, cursor:'pointer', border:'none',
                      background: formI.resultado===r ? RESULTADO_COR[r] : '#f1f5f9',
                      color: formI.resultado===r ? 'white' : '#64748b',
                    }}>
                    {icon} {r.charAt(0).toUpperCase()+r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Data */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Data e Hora</div>
              <input type="datetime-local" value={formI.data_interacao}
                onChange={e => setFormI(f => ({...f, data_interacao:e.target.value}))}
                style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, width:'100%', boxSizing:'border-box' }}
              />
            </div>

            {/* Descrição */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Resumo da interação *</div>
              <textarea value={formI.descricao} onChange={e => setFormI(f => ({...f, descricao:e.target.value}))}
                placeholder="O que foi conversado? Qual o próximo passo?"
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, height:80, resize:'vertical', boxSizing:'border-box' }}
              />
            </div>

            {/* Vincular oportunidade */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Vincular a Oportunidade (opcional)</div>
              <select value={formI.oportunidade_id||''} onChange={e => setFormI(f => ({...f, oportunidade_id:e.target.value||null}))}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                <option value="">— Sem vínculo —</option>
                {oportunidades.map(op => <option key={op.id} value={op.id}>{op.funil==='licitacao'?'🏛️':'💼'} {op.titulo}</option>)}
              </select>
            </div>

            {/* Upload áudio */}
            <div style={{ marginBottom:12, padding:'10px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:6 }}>🎙️ Áudio da conversa (opcional)</div>
              <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                <label style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#7c3aed', color:'white',
                  borderRadius:4, padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                  📎 Anexar áudio
                  <input ref={audioRef} type="file" accept="audio/*"
                    onChange={e => { if (e.target.files?.[0]) uploadAudio(e.target.files[0]); }}
                    style={{ display:'none' }} />
                </label>
                {formI.audio_url && (
                  <>
                    <span style={{ fontSize:9, color:'#16a34a', fontWeight:700 }}>✓ Áudio enviado</span>
                    <button className="acn-btn"
                      style={{ background: transcrevendo ? '#94a3b8' : '#7c3aed', opacity: transcrevendo?.7:1 }}
                      onClick={transcreverAudio} disabled={transcrevendo}>
                      {transcrevendo ? '⏳ Transcrevendo...' : '🎙️ Transcrever (IA)'}
                    </button>
                  </>
                )}
              </div>
              {formI.transcricao && (
                <div style={{ marginTop:8, padding:'6px 8px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:5 }}>
                  <div style={{ fontSize:8, fontWeight:700, color:'#7c3aed', marginBottom:2 }}>Transcrição</div>
                  <div style={{ fontSize:10, color:'#4c1d95', lineHeight:1.4 }}>{formI.transcricao}</div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }}
                onClick={() => setModalInteracao(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0891b2', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarInteracao} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Interação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
