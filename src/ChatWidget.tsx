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

function Avatar({ nome, size=26, bg='#e2e8f0', color='#475569' }: any) {
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

export default function ChatWidget({ currentUser }: any) {
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
  const [toast, setToast]         = useState<any>(null); // { sala, remetente_nome, texto }

  const endRef       = useRef<HTMLDivElement>(null);
  const subRef       = useRef<any>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  // Refs síncronos usados dentro de callbacks Realtime (evitam stale closure)
  const salaAtivaRef = useRef<any>(null);
  const abertoRef    = useRef(false);
  const canaisRef    = useRef<any[]>([]);
  const diretosRef   = useRef<any[]>([]);

  const uid   = currentUser?.id   || currentUser?.email || 'anon';
  const unome = currentUser?.nome || currentUser?.email || 'Usuário';

  // Manter refs sincronizados com state
  useEffect(() => { canaisRef.current  = canais;  }, [canais]);
  useEffect(() => { diretosRef.current = diretos; }, [diretos]);
  useEffect(() => { abertoRef.current  = aberto;  }, [aberto]);

  // Auto-dismiss toast após 6s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Inicialização ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    fetchCanais();
    fetchUsuarios();
    fetchDiretos();
    contarNaoLidas();

    // Subscription global única — recebe TODOS inserts e filtra client-side
    subRef.current = supabase
      .channel('chat-global-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' },
        async (payload: any) => {
          const msg = payload.new;

          // Ignorar próprias mensagens para badge/toast
          if (msg.remetente_id === uid) return;

          contarNaoLidas();
          fetchDiretos();

          // Se a sala ativa está aberta, adiciona a mensagem
          if (salaAtivaRef.current && msg.sala_id === salaAtivaRef.current.id) {
            setMensagens(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            // Marcar como lida imediatamente
            supabase.from('chat_mensagens')
              .update({ lida_por: [...(msg.lida_por || []), uid] })
              .eq('id', msg.id)
              .then(() => contarNaoLidas());
            return;
          }

          // Caso contrário: mostrar toast de notificação
          const sala = [...canaisRef.current, ...diretosRef.current].find(s => s.id === msg.sala_id);
          if (!sala) {
            // Tenta buscar a sala do banco (pode ser DM recém criada)
            const { data } = await supabase.from('chat_salas').select('*').eq('id', msg.sala_id).single();
            if (data) {
              // Verifica se é DM do usuário atual
              if (data.tipo === 'direto') {
                const membro = (data.membros||[]).some((m:any) => m.id === uid);
                if (membro) {
                  await fetchDiretos();
                  setToast({ sala: data, remetente_nome: msg.remetente_nome, texto: msg.texto });
                }
              }
            }
            return;
          }
          setToast({ sala, remetente_nome: msg.remetente_nome, texto: msg.texto });
        })
      .subscribe();

    return () => { subRef.current?.unsubscribe(); };
  }, [currentUser]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Focus no input ao entrar na sala
  useEffect(() => {
    if (view === 'sala') setTimeout(() => inputRef.current?.focus(), 100);
  }, [view, salaAtiva]);

  // ── Fetches ───────────────────────────────────────────────────────────────
  const fetchCanais = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'canal').order('nome');
    setCanais(data || []);
  };

  const fetchDiretos = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
    const minhas = (data || []).filter(s => (s.membros || []).some((m: any) => m.id === uid));
    setDiretos(minhas);
  };

  const fetchUsuarios = async () => {
    const { data } = await supabase.from('auth_usuarios').select('id,nome,email,perfil').order('nome');
    setUsuarios((data || []).filter(u => (u.id || u.email) !== uid));
  };

  const contarNaoLidas = async () => {
    const { data } = await supabase.from('chat_mensagens').select('id,lida_por,remetente_id');
    const n = (data || []).filter(m => m.remetente_id !== uid && !(m.lida_por || []).includes(uid)).length;
    setNaoLidas(n);
  };

  const fetchMensagens = async (salaId: string) => {
    const { data } = await supabase.from('chat_mensagens')
      .select('*').eq('sala_id', salaId).order('criado_em');
    setMensagens(data || []);
    for (const m of (data || [])) {
      if (m.remetente_id !== uid && !(m.lida_por || []).includes(uid)) {
        supabase.from('chat_mensagens')
          .update({ lida_por: [...(m.lida_por || []), uid] })
          .eq('id', m.id).then(() => {});
      }
    }
    setTimeout(() => contarNaoLidas(), 400);
  };

  // ── Abrir sala ─────────────────────────────────────────────────────────
  const abrirSala = async (sala: any) => {
    setSalaAtiva(sala);
    salaAtivaRef.current = sala;
    setMensagens([]);
    setView('sala');
    setToast(null);
    await fetchMensagens(sala.id);
  };

  const voltarLista = () => {
    setSalaAtiva(null);
    salaAtivaRef.current = null;
    setMensagens([]);
    setView('lista');
  };

  const abrirDireto = async (usuario: any) => {
    const outroId   = usuario.id   || usuario.email;
    const outroNome = usuario.nome || usuario.email;
    const { data: todas } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
    const existente = (todas || []).find(s => {
      const ids = (s.membros || []).map((m: any) => m.id);
      return ids.includes(uid) && ids.includes(outroId);
    });
    if (existente) { await abrirSala(existente); return; }
    const { data: nova } = await supabase.from('chat_salas').insert([{
      tipo: 'direto', nome: null,
      membros: [{ id: uid, nome: unome }, { id: outroId, nome: outroNome }],
    }]).select().single();
    if (nova) { fetchDiretos(); await abrirSala(nova); }
  };

  const abrirViaToast = (t: any) => {
    setAberto(true);
    abertoRef.current = true;
    if (t.sala.tipo === 'direto') setAba('diretos');
    else setAba('canais');
    abrirSala(t.sala);
  };

  // ── Enviar mensagem ────────────────────────────────────────────────────
  const enviar = async () => {
    if (!texto.trim() || !salaAtiva || enviando) return;
    setEnviando(true);
    const txt = texto.trim();
    setTexto('');

    // Optimistic: remetente vê imediatamente
    const tempId = 'temp-' + Date.now();
    setMensagens(prev => [...prev, {
      id: tempId, _temp: true,
      sala_id: salaAtiva.id,
      remetente_id: uid, remetente_nome: unome,
      texto: txt, lida_por: [uid],
      criado_em: new Date().toISOString(),
    }]);

    const { data: inserido } = await supabase.from('chat_mensagens').insert([{
      sala_id: salaAtiva.id,
      remetente_id: uid,
      remetente_nome: unome,
      texto: txt,
      lida_por: [uid],
    }]).select().single();

    if (inserido) {
      setMensagens(prev => prev.map(m => m.id === tempId ? inserido : m));
    }

    setEnviando(false);
    inputRef.current?.focus();
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const nomeDireto = (sala: any) => {
    const outro = (sala.membros || []).find((m: any) => m.id !== uid);
    return outro?.nome || 'Conversa';
  };
  const nomeSala = (sala: any) =>
    sala.tipo === 'canal' ? `# ${sala.nome}` : nomeDireto(sala);

  const fmtHora = (d: any) =>
    d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  const fmtData = (d: any) => {
    if (!d) return '';
    const dt   = new Date(d);
    const hoje = new Date();
    if (dt.toDateString() === hoje.toDateString()) return 'Hoje';
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (dt.toDateString() === ontem.toDateString()) return 'Ontem';
    return dt.toLocaleDateString('pt-BR');
  };

  const agrupar = () => {
    const g: { data: string; msgs: any[] }[] = [];
    mensagens.forEach(m => {
      const d = fmtData(m.criado_em);
      const u = g[g.length - 1];
      if (!u || u.data !== d) g.push({ data: d, msgs: [m] });
      else u.msgs.push(m);
    });
    return g;
  };

  if (!currentUser) return null;

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 9500, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

      {/* ── Toast de nova mensagem ── */}
      {toast && (
        <div
          onClick={() => abrirViaToast(toast)}
          style={{
            background: '#1e293b', color: 'white', borderRadius: 10,
            padding: '10px 14px', cursor: 'pointer', width: 270,
            boxShadow: '0 6px 24px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', gap: 3,
            animation: 'slideUp .2s ease',
          }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>
              💬 {nomeSala(toast.sala)}
            </span>
            <button
              onClick={e => { e.stopPropagation(); setToast(null); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{toast.remetente_nome}</div>
          <div style={{ fontSize: 10, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {toast.texto}
          </div>
        </div>
      )}

      {/* ── Painel ── */}
      {aberto && (
        <div style={{
          width: 360, height: 530, background: '#ffffff', borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,.22)', display: 'flex',
          flexDirection: 'column', border: '1px solid #d1d5db', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{ background: '#0f766e', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {view === 'sala' ? (
              <>
                <button onClick={voltarLista}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 17, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
                {salaAtiva?.tipo === 'canal'
                  ? <span style={{ width: 22, height: 22, borderRadius: '50%', background: CANAL_COR[salaAtiva.nome] || '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
                      {(salaAtiva.nome || '?')[0]}
                    </span>
                  : <Avatar nome={nomeDireto(salaAtiva)} size={22} bg='#dbeafe' color='#1d4ed8' />
                }
                <span style={{ color: 'white', fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nomeSala(salaAtiva)}
                </span>
              </>
            ) : (
              <span style={{ color: 'white', fontWeight: 700, fontSize: 13, flex: 1 }}>💬 Chat</span>
            )}
            <button onClick={() => setAberto(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, marginLeft: 'auto' }}>✕</button>
          </div>

          {/* ── LISTA ── */}
          {view === 'lista' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #e8ecf0', flexShrink: 0 }}>
                {(['canais', 'diretos'] as const).map(a => (
                  <button key={a} onClick={() => setAba(a)} style={{
                    flex: 1, padding: '7px 0', fontSize: 10, fontWeight: 700,
                    background: aba === a ? '#f0fdfa' : '#fff',
                    color: aba === a ? '#0f766e' : '#94a3b8',
                    border: 'none', borderBottom: aba === a ? '2px solid #0f766e' : '2px solid transparent',
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: .5,
                  }}>
                    {a === 'canais' ? '# Canais' : '✉ Diretos'}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {aba === 'canais' && canais.map(c => (
                  <div key={c.id} onClick={() => abrirSala(c)} style={{
                    padding: '8px 14px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 10, borderBottom: '1px solid #f8fafc',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: CANAL_COR[c.nome] || '#0f766e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0,
                    }}>{(c.nome || '?')[0]}</span>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}># {c.nome}</div>
                  </div>
                ))}

                {aba === 'diretos' && (
                  <>
                    <div style={{ padding: '8px 14px 3px', fontSize: 8, fontWeight: 700, color: '#b0bac5', textTransform: 'uppercase', letterSpacing: .5 }}>
                      Nova conversa
                    </div>
                    {usuarios.map(u => (
                      <div key={u.id || u.email} onClick={() => abrirDireto(u)} style={{
                        padding: '6px 14px', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: 8, borderBottom: '1px solid #f8fafc',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Avatar nome={u.nome} size={28} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{u.nome}</div>
                          <div style={{ fontSize: 9, color: '#94a3b8' }}>{u.perfil}</div>
                        </div>
                      </div>
                    ))}

                    {diretos.length > 0 && (
                      <>
                        <div style={{ padding: '10px 14px 3px', fontSize: 8, fontWeight: 700, color: '#b0bac5', textTransform: 'uppercase', letterSpacing: .5 }}>
                          Recentes
                        </div>
                        {diretos.map(d => (
                          <div key={d.id} onClick={() => abrirSala(d)} style={{
                            padding: '6px 14px', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: 8, borderBottom: '1px solid #f8fafc',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <Avatar nome={nomeDireto(d)} size={28} bg='#dbeafe' color='#1d4ed8' />
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{nomeDireto(d)}</div>
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
          {view === 'sala' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                {mensagens.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10, marginTop: 50 }}>
                    Nenhuma mensagem ainda 👋
                  </div>
                )}
                {agrupar().map(grupo => (
                  <div key={grupo.data}>
                    <div style={{ textAlign: 'center', margin: '10px 0 8px', fontSize: 9, color: '#b0bac5', fontWeight: 700, letterSpacing: .5 }}>
                      ── {grupo.data} ──
                    </div>
                    {grupo.msgs.map((m, i) => {
                      const proprio   = m.remetente_id === uid;
                      const mesmaPess = i > 0 && grupo.msgs[i - 1].remetente_id === m.remetente_id;
                      return (
                        <div key={m.id} style={{
                          display: 'flex',
                          flexDirection: proprio ? 'row-reverse' : 'row',
                          gap: 6, marginBottom: mesmaPess ? 2 : 8, alignItems: 'flex-end',
                        }}>
                          {!proprio && (
                            mesmaPess
                              ? <span style={{ width: 26, flexShrink: 0 }} />
                              : <Avatar nome={m.remetente_nome} size={26} />
                          )}
                          <div style={{ maxWidth: '76%' }}>
                            {!proprio && !mesmaPess && (
                              <div style={{ fontSize: 8, color: '#94a3b8', marginBottom: 2, marginLeft: 2, fontWeight: 700, letterSpacing: .3 }}>
                                {m.remetente_nome}
                              </div>
                            )}
                            <div style={{
                              background: proprio ? '#0f766e' : '#f1f5f9',
                              color: proprio ? 'white' : '#1e293b',
                              padding: '7px 11px',
                              borderRadius: proprio ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                              fontSize: 11, lineHeight: 1.5, wordBreak: 'break-word',
                              opacity: m._temp ? 0.55 : 1,
                              transition: 'opacity .2s',
                            }}>
                              {m.texto}
                            </div>
                            <div style={{ fontSize: 8, color: '#b0bac5', marginTop: 2, textAlign: proprio ? 'right' : 'left', padding: '0 3px' }}>
                              {m._temp ? '⏳' : fmtHora(m.criado_em)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <div style={{ padding: '8px 10px', borderTop: '1px solid #e8ecf0', display: 'flex', gap: 6, flexShrink: 0, background: '#fff' }}>
                <input ref={inputRef}
                  style={{
                    flex: 1, padding: '7px 12px', fontSize: 11,
                    border: '1px solid #d1d5db', borderRadius: 20,
                    outline: 'none', color: '#1e293b', background: 'white',
                  }}
                  placeholder="Mensagem... (Enter para enviar)"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                />
                <button onClick={enviar} disabled={!texto.trim() || enviando} style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: texto.trim() ? '#0f766e' : '#e2e8f0',
                  color: texto.trim() ? 'white' : '#94a3b8',
                  border: 'none', cursor: texto.trim() ? 'pointer' : 'default',
                  fontSize: 14, flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s',
                }}>➤</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Botão flutuante ── */}
      <button onClick={() => setAberto(a => !a)} style={{
        width: 50, height: 50, borderRadius: '50%',
        background: aberto ? '#0c5d58' : '#0f766e',
        border: 'none', cursor: 'pointer', color: 'white', fontSize: 20,
        boxShadow: '0 4px 18px rgba(15,118,110,.45)',
        position: 'relative', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        transition: 'background .15s, transform .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.07)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        {aberto ? '✕' : '💬'}
        {!aberto && naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: '#ef4444', color: 'white', borderRadius: '50%',
            width: 18, height: 18, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white', lineHeight: 1,
          }}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
