// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const CANAL_COR: Record<string, string> = {
  'Geral':        '#0f766e',
  'Comercial':    '#2563eb',
  'Engenharia':   '#7c3aed',
  'PCP':          '#0891b2',
  'Laboratorio':  '#0d9488',
  'Producao':     '#ea580c',
  'Almoxarifado': '#16a34a',
  'CQ':           '#dc2626',
  'Logistica':    '#d97706',
  'SAC':          '#9333ea',
};

function Avatar({ nome, size=26, bg='#e2e8f0', color='#475569' }) {
  return (
    <span style={{
      width:size, height:size, borderRadius:'50%', background:bg,
      display:'flex', alignItems:'center', justifyContent:'center',
      color, fontWeight:700, fontSize:size*0.38, flexShrink:0,
    }}>
      {(nome||'?')[0].toUpperCase()}
    </span>
  );
}

export default function ChatWidget({ currentUser }) {
  const [aberto, setAberto]       = useState(false);
  const [aba, setAba]             = useState<'canais'|'diretos'>('canais');
  const [view, setView]           = useState<'lista'|'sala'>('lista');
  const [canais, setCanais]       = useState<any[]>([]);
  const [diretos, setDiretos]     = useState<any[]>([]);
  const [usuarios, setUsuarios]   = useState<any[]>([]);
  const [salaAtiva, setSalaAtiva] = useState<any>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [texto, setTexto]         = useState('');
  const [naoLidas, setNaoLidas]   = useState(0);
  const [enviando, setEnviando]   = useState(false);

  const endRef  = useRef<HTMLDivElement>(null);
  const subRef  = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uid   = currentUser?.id   || currentUser?.email || 'anon';
  const unome = currentUser?.nome || currentUser?.email || 'Usuário';

  // ── Inicialização ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    fetchCanais();
    fetchUsuarios();
    fetchDiretos();
    contarNaoLidas();
    // Subscription global para badge de não-lidas
    subRef.current = supabase.channel('chat-global-badge')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_mensagens' },
        () => { contarNaoLidas(); fetchDiretos(); })
      .subscribe();
    return () => { subRef.current?.unsubscribe(); };
  }, [currentUser]);

  // Auto-scroll ao fim
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [mensagens]);

  // Focus no input ao abrir sala
  useEffect(() => {
    if (view === 'sala') setTimeout(() => inputRef.current?.focus(), 100);
  }, [view, salaAtiva]);

  // ── Fetches ───────────────────────────────────────────────────────────────
  const fetchCanais = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo','canal').order('nome');
    setCanais(data || []);
  };

  const fetchDiretos = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo','direto');
    const minhas = (data||[]).filter(s => (s.membros||[]).some((m:any) => m.id === uid));
    setDiretos(minhas);
  };

  const fetchUsuarios = async () => {
    const { data } = await supabase.from('auth_usuarios').select('id,nome,email,perfil').order('nome');
    setUsuarios((data||[]).filter(u => (u.id||u.email) !== uid));
  };

  const contarNaoLidas = async () => {
    const { data } = await supabase.from('chat_mensagens').select('id,lida_por,remetente_id');
    const n = (data||[]).filter(m => m.remetente_id !== uid && !(m.lida_por||[]).includes(uid)).length;
    setNaoLidas(n);
  };

  const fetchMensagens = async (salaId: string) => {
    const { data } = await supabase.from('chat_mensagens').select('*').eq('sala_id', salaId).order('criado_em');
    setMensagens(data||[]);
    // Marcar como lidas
    for (const m of (data||[])) {
      if (m.remetente_id !== uid && !(m.lida_por||[]).includes(uid)) {
        supabase.from('chat_mensagens')
          .update({ lida_por: [...(m.lida_por||[]), uid] })
          .eq('id', m.id).then(() => {});
      }
    }
    setTimeout(() => contarNaoLidas(), 300);
  };

  // ── Abrir sala / DM ───────────────────────────────────────────────────────
  const abrirSala = async (sala: any) => {
    setSalaAtiva(sala);
    setView('sala');
    await fetchMensagens(sala.id);
    // Subscription em tempo real para esta sala
    subRef.current?.unsubscribe();
    subRef.current = supabase.channel(`chat-sala-${sala.id}`)
      .on('postgres_changes', {
        event:'INSERT', schema:'public', table:'chat_mensagens',
        filter:`sala_id=eq.${sala.id}`,
      }, async (payload) => {
        setMensagens(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        // Marcar como lida imediatamente se o chat está aberto
        if (payload.new.remetente_id !== uid) {
          supabase.from('chat_mensagens')
            .update({ lida_por: [...(payload.new.lida_por||[]), uid] })
            .eq('id', payload.new.id).then(() => contarNaoLidas());
        }
      })
      .subscribe();
  };

  const abrirDireto = async (usuario: any) => {
    const outroId   = usuario.id   || usuario.email;
    const outroNome = usuario.nome || usuario.email;
    const { data: todas } = await supabase.from('chat_salas').select('*').eq('tipo','direto');
    const existente = (todas||[]).find(s => {
      const ids = (s.membros||[]).map((m:any) => m.id);
      return ids.includes(uid) && ids.includes(outroId);
    });
    if (existente) { await abrirSala(existente); return; }
    const { data: nova } = await supabase.from('chat_salas').insert([{
      tipo:'direto', nome:null,
      membros:[{ id:uid, nome:unome }, { id:outroId, nome:outroNome }],
    }]).select().single();
    if (nova) { fetchDiretos(); await abrirSala(nova); }
  };

  // ── Enviar mensagem ────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!texto.trim() || !salaAtiva || enviando) return;
    setEnviando(true);
    const txt = texto.trim();
    setTexto('');
    await supabase.from('chat_mensagens').insert([{
      sala_id: salaAtiva.id,
      remetente_id: uid,
      remetente_nome: unome,
      texto: txt,
      lida_por: [uid],
    }]);
    setEnviando(false);
    inputRef.current?.focus();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const nomeDireto = (sala: any) => {
    const outro = (sala.membros||[]).find((m:any) => m.id !== uid);
    return outro?.nome || 'Conversa';
  };

  const fmtHora = (d: any) => d ? new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
  const fmtData = (d: any) => {
    if (!d) return '';
    const dt   = new Date(d);
    const hoje = new Date();
    if (dt.toDateString() === hoje.toDateString()) return 'Hoje';
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate()-1);
    if (dt.toDateString() === ontem.toDateString()) return 'Ontem';
    return dt.toLocaleDateString('pt-BR');
  };

  const agrupar = () => {
    const g: {data:string; msgs:any[]}[] = [];
    mensagens.forEach(m => {
      const d = fmtData(m.criado_em);
      const u = g[g.length-1];
      if (!u || u.data !== d) g.push({data:d, msgs:[m]});
      else u.msgs.push(m);
    });
    return g;
  };

  if (!currentUser) return null;

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{position:'fixed', bottom:18, right:18, zIndex:9500, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8}}>

      {/* ── Painel ── */}
      {aberto && (
        <div style={{
          width:360, height:530, background:'white', borderRadius:12,
          boxShadow:'0 12px 48px rgba(0,0,0,.20)', display:'flex',
          flexDirection:'column', border:'1px solid #e2e8f0', overflow:'hidden',
        }}>

          {/* Header */}
          <div style={{background:'#0f766e', padding:'9px 14px', display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
            {view === 'sala' ? (
              <>
                <button onClick={()=>{setView('lista'); subRef.current?.unsubscribe(); subRef.current=null;}}
                  style={{background:'none',border:'none',color:'white',cursor:'pointer',fontSize:17,padding:0,lineHeight:1,marginRight:2}}>←</button>
                {salaAtiva?.tipo==='canal'
                  ? <span style={{width:22,height:22,borderRadius:'50%',background:CANAL_COR[salaAtiva.nome]||'#475569',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:10,flexShrink:0}}>
                      {(salaAtiva.nome||'?')[0]}
                    </span>
                  : <Avatar nome={nomeDireto(salaAtiva)} size={22} bg='#dbeafe' color='#1d4ed8' />
                }
                <span style={{color:'white',fontWeight:700,fontSize:12,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {salaAtiva?.tipo==='canal' ? `# ${salaAtiva.nome}` : nomeDireto(salaAtiva)}
                </span>
              </>
            ) : (
              <span style={{color:'white',fontWeight:700,fontSize:13,flex:1}}>💬 Chat</span>
            )}
            <button onClick={()=>setAberto(false)}
              style={{background:'none',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',fontSize:16,padding:0,lineHeight:1,marginLeft:'auto'}}>✕</button>
          </div>

          {/* ── LISTA ── */}
          {view==='lista' && (
            <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
              {/* Sub-abas */}
              <div style={{display:'flex',borderBottom:'1px solid #e8ecf0',flexShrink:0}}>
                {(['canais','diretos'] as const).map(a => (
                  <button key={a} onClick={()=>setAba(a)} style={{
                    flex:1, padding:'7px 0', fontSize:10, fontWeight:700,
                    background: aba===a ? '#f0fdfa' : 'white',
                    color: aba===a ? '#0f766e' : '#94a3b8',
                    border:'none', borderBottom: aba===a ? '2px solid #0f766e' : '2px solid transparent',
                    cursor:'pointer', textTransform:'uppercase', letterSpacing:.5,
                  }}>
                    {a==='canais' ? '# Canais' : '✉ Diretos'}
                  </button>
                ))}
              </div>

              <div style={{flex:1,overflowY:'auto'}}>
                {aba==='canais' && canais.map(c => (
                  <div key={c.id} onClick={()=>abrirSala(c)} style={{
                    padding:'8px 14px', cursor:'pointer', display:'flex',
                    alignItems:'center', gap:10, borderBottom:'1px solid #f8fafc',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f0fdfa')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{
                      width:30, height:30, borderRadius:'50%',
                      background: CANAL_COR[c.nome]||'#0f766e',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      color:'white',fontWeight:700,fontSize:12,flexShrink:0,
                    }}>{(c.nome||'?')[0]}</span>
                    <div style={{fontSize:11,fontWeight:600,color:'#1e293b'}}># {c.nome}</div>
                  </div>
                ))}

                {aba==='diretos' && (
                  <>
                    <div style={{padding:'8px 14px 3px',fontSize:8,fontWeight:700,color:'#b0bac5',textTransform:'uppercase',letterSpacing:.5}}>
                      Nova conversa
                    </div>
                    {usuarios.map(u => (
                      <div key={u.id||u.email} onClick={()=>abrirDireto(u)} style={{
                        padding:'6px 14px', cursor:'pointer', display:'flex',
                        alignItems:'center', gap:8, borderBottom:'1px solid #f8fafc',
                        transition:'background .1s',
                      }}
                      onMouseEnter={e=>(e.currentTarget.style.background='#f0fdfa')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <Avatar nome={u.nome} size={28} />
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:'#1e293b'}}>{u.nome}</div>
                          <div style={{fontSize:9,color:'#94a3b8'}}>{u.perfil}</div>
                        </div>
                      </div>
                    ))}

                    {diretos.length > 0 && (
                      <>
                        <div style={{padding:'10px 14px 3px',fontSize:8,fontWeight:700,color:'#b0bac5',textTransform:'uppercase',letterSpacing:.5}}>
                          Recentes
                        </div>
                        {diretos.map(d => (
                          <div key={d.id} onClick={()=>abrirSala(d)} style={{
                            padding:'6px 14px', cursor:'pointer', display:'flex',
                            alignItems:'center', gap:8, borderBottom:'1px solid #f8fafc',
                            transition:'background .1s',
                          }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#f0fdfa')}
                          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                            <Avatar nome={nomeDireto(d)} size={28} bg='#dbeafe' color='#1d4ed8' />
                            <div style={{fontSize:11,fontWeight:600,color:'#1e293b'}}>{nomeDireto(d)}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── SALA ── */}
          {view==='sala' && (
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {/* Mensagens */}
              <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
                {mensagens.length===0 && (
                  <div style={{textAlign:'center',color:'#94a3b8',fontSize:10,marginTop:50}}>
                    Nenhuma mensagem ainda 👋
                  </div>
                )}
                {agrupar().map(grupo => (
                  <div key={grupo.data}>
                    <div style={{textAlign:'center',margin:'10px 0 8px',fontSize:9,color:'#b0bac5',fontWeight:700,letterSpacing:.5}}>
                      ── {grupo.data} ──
                    </div>
                    {grupo.msgs.map((m,i) => {
                      const proprio   = m.remetente_id === uid;
                      const mesmaPess = i>0 && grupo.msgs[i-1].remetente_id === m.remetente_id;
                      return (
                        <div key={m.id} style={{
                          display:'flex',
                          flexDirection: proprio ? 'row-reverse' : 'row',
                          gap:6, marginBottom: mesmaPess ? 2 : 8, alignItems:'flex-end',
                        }}>
                          {!proprio && (
                            mesmaPess
                              ? <span style={{width:26,flexShrink:0}} />
                              : <Avatar nome={m.remetente_nome} size={26} />
                          )}
                          <div style={{maxWidth:'76%'}}>
                            {!proprio && !mesmaPess && (
                              <div style={{fontSize:8,color:'#94a3b8',marginBottom:2,marginLeft:2,fontWeight:700,letterSpacing:.3}}>
                                {m.remetente_nome}
                              </div>
                            )}
                            <div style={{
                              background: proprio ? '#0f766e' : '#f1f5f9',
                              color: proprio ? 'white' : '#1e293b',
                              padding:'7px 11px',
                              borderRadius: proprio ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                              fontSize:11, lineHeight:1.5, wordBreak:'break-word',
                            }}>
                              {m.texto}
                            </div>
                            <div style={{fontSize:8,color:'#b0bac5',marginTop:2,textAlign:proprio?'right':'left',padding:'0 3px'}}>
                              {fmtHora(m.criado_em)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{padding:'8px 10px',borderTop:'1px solid #e8ecf0',display:'flex',gap:6,flexShrink:0}}>
                <input ref={inputRef}
                  style={{
                    flex:1, padding:'7px 12px', fontSize:11,
                    border:'1px solid #d1d5db', borderRadius:20,
                    outline:'none', color:'#1e293b', background:'white',
                  }}
                  placeholder="Mensagem... (Enter para enviar)"
                  value={texto}
                  onChange={e=>setTexto(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enviar(); }}}
                />
                <button onClick={enviar} disabled={!texto.trim()||enviando} style={{
                  width:34, height:34, borderRadius:'50%',
                  background: texto.trim() ? '#0f766e' : '#e2e8f0',
                  color: texto.trim() ? 'white' : '#94a3b8',
                  border:'none', cursor: texto.trim() ? 'pointer' : 'default',
                  fontSize:14, flexShrink:0, display:'flex',
                  alignItems:'center', justifyContent:'center',
                  transition:'background .15s',
                }}>➤</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bolha flutuante ── */}
      <button onClick={()=>setAberto(a=>!a)} style={{
        width:50, height:50, borderRadius:'50%',
        background: aberto ? '#0c5d58' : '#0f766e',
        border:'none', cursor:'pointer', color:'white', fontSize:20,
        boxShadow:'0 4px 18px rgba(15,118,110,.45)',
        position:'relative', display:'flex',
        alignItems:'center', justifyContent:'center',
        transition:'background .15s, transform .1s',
      }}
      onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.07)')}
      onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
        {aberto ? '✕' : '💬'}
        {!aberto && naoLidas > 0 && (
          <span style={{
            position:'absolute', top:-2, right:-2,
            background:'#ef4444', color:'white', borderRadius:'50%',
            width:18, height:18, fontSize:9, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'2px solid white', lineHeight:1,
          }}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
