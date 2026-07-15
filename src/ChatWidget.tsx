// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const BROADCAST_CH = 'acn-chat-v1';

function Avatar({ nome, size = 26, bg = '#e2e8f0', color = '#475569' }: any) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {(nome || '?')[0].toUpperCase()}
    </span>
  );
}

export default function ChatWidget({ currentUser }: any) {
  const [aberto, setAberto]       = useState(false);
  const [aba, setAba]             = useState<'canais' | 'diretos'>('canais');
  const [view, setView]           = useState<'lista' | 'sala'>('lista');
  const [canais, setCanais]       = useState<any[]>([]);
  const [diretos, setDiretos]     = useState<any[]>([]);
  const [usuarios, setUsuarios]   = useState<any[]>([]);
  const [salaAtiva, setSalaAtiva] = useState<any>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [texto, setTexto]         = useState('');
  const [naoLidas, setNaoLidas]   = useState(0);
  const [naoLidasPorSala, setNaoLidasPorSala] = useState<Record<string, number>>({});
  const [enviando, setEnviando]   = useState(false);
  const [toast, setToast]         = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mutado, setMutado]       = useState(() => localStorage.getItem('acn_chat_muted') === '1');

  const endRef       = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const salaAtivaRef = useRef<any>(null);
  const canaisRef    = useRef<any[]>([]);
  const diretosRef   = useRef<any[]>([]);
  const broadcastRef = useRef<any>(null);
  const prevCountRef = useRef(-1);
  const mutadoRef    = useRef(mutado);

  const uid   = String(currentUser?.id   ?? currentUser?.email ?? 'anon');
  const unome = currentUser?.nome || currentUser?.email || 'Usuário';

  // ── localStorage: último timestamp lido por sala ──────────────────────────
  const lrKey      = (salaId: string) => `acn_lr_${uid}_${salaId}`;
  const getLastRead = (salaId: string) => localStorage.getItem(lrKey(salaId)) || '1970-01-01T00:00:00Z';

  // Grava timestamp da última msg lida + 1s de buffer (compensa drift de relógio servidor/cliente)
  const markRead = (salaId: string, msgTs?: string) => {
    const ts = msgTs
      ? new Date(new Date(msgTs).getTime() + 1000).toISOString()
      : new Date(Date.now() + 2000).toISOString();
    localStorage.setItem(lrKey(salaId), ts);
  };

  // Sync refs
  useEffect(() => { canaisRef.current  = canais;  }, [canais]);
  useEffect(() => { diretosRef.current = diretos; }, [diretos]);
  useEffect(() => { mutadoRef.current  = mutado;  }, [mutado]);

  // ── Sirene via Web Audio API ──────────────────────────────────────────────
  const playAlerta = useCallback(() => {
    if (mutadoRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      const t = ctx.currentTime;
      // Sirene industrial: varre 400 → 900 → 400 Hz em 0.75s
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.35);
      osc.frequency.linearRampToValueAtTime(400, t + 0.75);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.68);
      gain.gain.linearRampToValueAtTime(0, t + 0.78);
      osc.start(t);
      osc.stop(t + 0.78);
      osc.onended = () => ctx.close();
    } catch {}
  }, []);

  // Auto-dismiss toast após 8s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast?.sala?.id, toast?.texto]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Focus ao entrar na sala
  useEffect(() => {
    if (view === 'sala') setTimeout(() => inputRef.current?.focus(), 80);
  }, [view, salaAtiva]);

  // ── Contar não-lidas (total + por sala) ───────────────────────────────────
  const contarNaoLidas = useCallback(async (lista?: any[]) => {
    let data = lista;
    if (!data) {
      const res = await supabase.from('chat_mensagens')
        .select('id,sala_id,remetente_id,criado_em')
        .order('criado_em', { ascending: false })
        .limit(500);
      data = res.data || [];
    }
    const porSala: Record<string, number> = {};
    let total = 0;
    for (const m of data as any[]) {
      if (String(m.remetente_id) === uid) continue;
      if (m.criado_em > getLastRead(m.sala_id)) {
        porSala[m.sala_id] = (porSala[m.sala_id] || 0) + 1;
        total++;
      }
    }
    setNaoLidas(total);
    setNaoLidasPorSala(porSala);
    return total;
  }, [uid]);

  // ── Polling badge / verificação de novas mensagens ────────────────────────
  const verificarNovas = useCallback(async () => {
    const { data } = await supabase.from('chat_mensagens')
      .select('id,sala_id,remetente_id,remetente_nome,texto,criado_em')
      .order('criado_em', { ascending: false })
      .limit(500);

    const todas = data || [];
    const naoLidasList = todas.filter((m: any) =>
      String(m.remetente_id) !== uid &&
      m.criado_em > getLastRead(m.sala_id)
    );
    const count = naoLidasList.length;

    const porSala: Record<string, number> = {};
    for (const m of naoLidasList) porSala[m.sala_id] = (porSala[m.sala_id] || 0) + 1;
    setNaoLidas(count);
    setNaoLidasPorSala(porSala);

    // Toast + som apenas se chegou mensagem nova
    if (prevCountRef.current >= 0 && count > prevCountRef.current && naoLidasList.length > 0) {
      const latest = naoLidasList[0];
      if (!salaAtivaRef.current || salaAtivaRef.current.id !== latest.sala_id) {
        const sala = [...canaisRef.current, ...diretosRef.current].find(s => s.id === latest.sala_id);
        if (sala) {
          setToast({ sala, remetente_nome: latest.remetente_nome, texto: latest.texto });
          playAlerta();
        }
      }
    }
    prevCountRef.current = count;
  }, [uid, playAlerta]);

  // ── Inicialização ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    fetchCanais();
    fetchUsuarios();
    fetchDiretos();
    contarNaoLidas().then(n => { prevCountRef.current = n; });

    broadcastRef.current = supabase.channel(BROADCAST_CH)
      .on('broadcast', { event: 'nova_msg' }, ({ payload }: any) => {
        if (String(payload.sender_id) === uid) return;

        if (payload.sala_tipo === 'direto') {
          const membro = (payload.membros || []).some((m: any) => String(m.id) === uid);
          if (!membro) return;
          fetchDiretos();
        }

        // Sala aberta: adiciona mensagem e marca lida com timestamp real
        if (salaAtivaRef.current?.id === payload.sala_id) {
          setMensagens(prev => {
            if (prev.find((m: any) => m.id === payload.msg_id)) return prev;
            markRead(payload.sala_id, payload.criado_em);
            contarNaoLidas();
            return [...prev, {
              id: payload.msg_id, sala_id: payload.sala_id,
              remetente_id: payload.sender_id, remetente_nome: payload.remetente_nome,
              texto: payload.texto, lida_por: [], criado_em: payload.criado_em,
            }];
          });
          return;
        }

        // Sala não ativa: toast + som + badge
        const sala = [...canaisRef.current, ...diretosRef.current].find(s => s.id === payload.sala_id)
          || { id: payload.sala_id, nome: payload.sala_nome, tipo: payload.sala_tipo, membros: payload.membros || [] };

        setToast({ sala, remetente_nome: payload.remetente_nome, texto: payload.texto });
        playAlerta();
        setNaoLidas(prev => { const n = prev + 1; prevCountRef.current = n; return n; });
        setNaoLidasPorSala(prev => ({ ...prev, [payload.sala_id]: (prev[payload.sala_id] || 0) + 1 }));
      })
      .subscribe();

    return () => { broadcastRef.current?.unsubscribe(); };
  }, [currentUser]);

  // Polling badge a cada 5s
  useEffect(() => {
    if (!currentUser) return;
    const t = setInterval(verificarNovas, 5000);
    return () => clearInterval(t);
  }, [currentUser, verificarNovas]);

  // Polling mensagens na sala aberta a cada 2s — marca lida automaticamente
  useEffect(() => {
    if (!salaAtiva || !aberto) return;
    const salaId = salaAtiva.id;
    const t = setInterval(async () => {
      const { data } = await supabase.from('chat_mensagens')
        .select('*').eq('sala_id', salaId).order('criado_em');
      if (!data) return;
      setMensagens(prev => {
        const real = prev.filter((m: any) => !m._temp);
        if (data.length <= real.length) return prev;
        const ultima = data.at(-1);
        markRead(salaId, ultima?.criado_em);
        contarNaoLidas();
        return data;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [salaAtiva?.id, aberto]);

  // ── Fetches ───────────────────────────────────────────────────────────────
  const fetchCanais = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'canal').order('nome');
    setCanais(data || []);
  };

  const fetchDiretos = async () => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
    const isAdmin = currentUser?.perfil === 'Admin';
    const lista = isAdmin
      ? (data || [])
      : (data || []).filter(s => (s.membros || []).some((m: any) => String(m.id) === uid));

    // Deduplica: mantém apenas 1 DM por outro usuário (a mais recente)
    const seen = new Map<string, any>();
    for (const d of lista) {
      const outroId = String((d.membros || []).find((m: any) => String(m.id) !== uid)?.id || d.id);
      const atual = seen.get(outroId);
      if (!atual || (d.criado_em || '') > (atual.criado_em || '')) {
        seen.set(outroId, d);
      }
    }
    setDiretos([...seen.values()]);
  };

  const fetchUsuarios = async () => {
    const { data } = await supabase.from('auth_usuarios').select('id,nome,email,perfil').order('nome');
    setUsuarios((data || []).filter(u => String(u.id || u.email) !== uid));
  };

  const fetchMensagens = async (salaId: string) => {
    const { data } = await supabase.from('chat_mensagens')
      .select('*').eq('sala_id', salaId).order('criado_em');
    setMensagens(data || []);
    const ultima = (data || []).at(-1);
    markRead(salaId, ultima?.criado_em); // Timestamp real da última msg + 1s
    contarNaoLidas();
  };

  // ── Abrir sala ────────────────────────────────────────────────────────────
  const abrirSala = async (sala: any) => {
    setSalaAtiva(sala);
    salaAtivaRef.current = sala;
    setMensagens([]);
    setView('sala');
    setToast(null);
    markRead(sala.id);
    contarNaoLidas();
    await fetchMensagens(sala.id);
  };

  const voltarLista = () => {
    setSalaAtiva(null);
    salaAtivaRef.current = null;
    setMensagens([]);
    setView('lista');
  };

  const abrirDireto = async (usuario: any) => {
    const outroId   = String(usuario.id || usuario.email);
    const outroNome = usuario.nome || usuario.email;
    const { data: todas } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
    const existente = (todas || []).find(s => {
      const ids = (s.membros || []).map((m: any) => String(m.id));
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
    setAba(t.sala?.tipo === 'direto' ? 'diretos' : 'canais');
    abrirSala(t.sala);
  };

  // ── Enviar mensagem ───────────────────────────────────────────────────────
  const enviar = async () => {
    if (!texto.trim() || !salaAtiva || enviando) return;
    setEnviando(true);
    const txt = texto.trim();
    setTexto('');

    const tempId = 'temp-' + Date.now();
    setMensagens(prev => [...prev, {
      id: tempId, _temp: true, sala_id: salaAtiva.id,
      remetente_id: uid, remetente_nome: unome,
      texto: txt, lida_por: [], criado_em: new Date().toISOString(),
    }]);

    const { data: inserido } = await supabase.from('chat_mensagens').insert([{
      sala_id: salaAtiva.id, remetente_id: uid,
      remetente_nome: unome, texto: txt, lida_por: [],
    }]).select().single();

    if (inserido) {
      setMensagens(prev => prev.map(m => m.id === tempId ? inserido : m));
      markRead(salaAtiva.id, inserido.criado_em);
      broadcastRef.current?.send({
        type: 'broadcast', event: 'nova_msg',
        payload: {
          msg_id: inserido.id, sala_id: salaAtiva.id,
          sala_nome: salaAtiva.nome || null, sala_tipo: salaAtiva.tipo,
          membros: salaAtiva.membros || [], sender_id: uid,
          remetente_nome: unome, texto: txt, criado_em: inserido.criado_em,
        },
      });
    }
    setEnviando(false);
    inputRef.current?.focus();
  };

  // ── Excluir DM ────────────────────────────────────────────────────────────
  const deletarSala = async (salaId: string) => {
    await supabase.from('chat_salas').delete().eq('id', salaId);
    localStorage.removeItem(lrKey(salaId));
    setDiretos(prev => prev.filter(d => d.id !== salaId));
    if (salaAtivaRef.current?.id === salaId) voltarLista();
    setConfirmDelete(null);
    contarNaoLidas();
  };

  // ── Toggle mudo ───────────────────────────────────────────────────────────
  const toggleMudo = () => {
    const novo = !mutado;
    setMutado(novo);
    mutadoRef.current = novo;
    localStorage.setItem('acn_chat_muted', novo ? '1' : '0');
    if (!novo) playAlerta(); // Toca um preview ao ativar o som
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const nomeDireto = (sala: any) => {
    const membros = sala?.membros || [];
    const outros = membros.filter((m: any) => String(m.id) !== uid);
    if (outros.length > 0) return outros[0].nome || 'Conversa';
    return membros.map((m: any) => m.nome).join(' ↔ ') || 'Conversa';
  };
  const nomeSala = (sala: any) => sala?.tipo === 'canal' ? `# ${sala.nome}` : nomeDireto(sala);

  const fmtHora = (d: any) =>
    d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  const fmtData = (d: any) => {
    if (!d) return '';
    const dt = new Date(d), hoje = new Date();
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

  const temNaoLidas = naoLidas > 0;

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 9500, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

      <style>{`
        @keyframes chatPop    { from{opacity:0;transform:translateY(10px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes chatPulse  { 0%,100%{box-shadow:0 4px 18px rgba(239,68,68,.55),0 0 0 0 rgba(239,68,68,.45)} 60%{box-shadow:0 4px 18px rgba(239,68,68,.55),0 0 0 10px rgba(239,68,68,0)} }
        @keyframes badgePop   { 0%{transform:scale(0)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }
      `}</style>

      {/* ── Toast de nova mensagem ── */}
      {toast && (
        <div onClick={() => abrirViaToast(toast)} style={{
          background: '#1e293b', color: 'white', borderRadius: 10,
          padding: '10px 14px', cursor: 'pointer', width: 284,
          boxShadow: '0 6px 28px rgba(0,0,0,.5)',
          display: 'flex', flexDirection: 'column', gap: 4,
          animation: 'chatPop .18s ease',
          border: '1px solid rgba(239,68,68,.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#fca5a5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>
              🔔 {nomeSala(toast.sala)}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={e => { e.stopPropagation(); toggleMudo(); }}
                title={mutado ? 'Ativar som' : 'Silenciar'}
                style={{ background: 'none', border: 'none', color: mutado ? '#475569' : '#fbbf24', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>
                {mutado ? '🔕' : '🔔'}
              </button>
              <button onClick={e => { e.stopPropagation(); setToast(null); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>{toast.remetente_nome}</div>
          <div style={{ fontSize: 10, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {toast.texto}
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>Clique para abrir a conversa</div>
        </div>
      )}

      {/* ── Painel de chat ── */}
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
            {/* Botão mudo/som */}
            <button onClick={toggleMudo} title={mutado ? 'Ativar som de notificação' : 'Silenciar notificações'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 4px', lineHeight: 1,
                color: mutado ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.8)' }}>
              {mutado ? '🔕' : '🔔'}
            </button>
            <button onClick={() => setAberto(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
          </div>

          {/* ── LISTA DE CANAIS/DIRETOS ── */}
          {view === 'lista' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
              {/* Abas */}
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
                {/* Canais */}
                {aba === 'canais' && canais.map(c => {
                  const unread = naoLidasPorSala[c.id] || 0;
                  return (
                    <div key={c.id} onClick={() => abrirSala(c)} style={{
                      padding: '8px 14px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 10, borderBottom: '1px solid #f8fafc',
                      background: unread > 0 ? '#f0fdf4' : 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
                    onMouseLeave={e => (e.currentTarget.style.background = unread > 0 ? '#f0fdf4' : 'transparent')}>
                      <span style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: CANAL_COR[c.nome] || '#0f766e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0,
                      }}>{(c.nome || '?')[0]}</span>
                      <div style={{ fontSize: 11, fontWeight: unread > 0 ? 700 : 600, color: '#1e293b', flex: 1 }}>
                        # {c.nome}
                      </div>
                      {unread > 0 && (
                        <span style={{
                          background: '#ef4444', color: 'white', borderRadius: 10,
                          padding: '1px 7px', fontSize: 9, fontWeight: 700, flexShrink: 0,
                          animation: 'badgePop .3s ease',
                        }}>{unread}</span>
                      )}
                    </div>
                  );
                })}

                {/* Diretos */}
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

                    {diretos.filter(d => (naoLidasPorSala[d.id] || 0) > 0).length > 0 && (
                      <>
                        <div style={{ padding: '10px 14px 3px', fontSize: 8, fontWeight: 700, color: '#b0bac5', textTransform: 'uppercase', letterSpacing: .5 }}>
                          💬 Não lidas
                        </div>
                        {diretos.filter(d => (naoLidasPorSala[d.id] || 0) > 0).map(d => {
                          const unread = naoLidasPorSala[d.id] || 0;
                          return (
                            <div key={d.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <div style={{
                                padding: '6px 14px', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: 8,
                                background: unread > 0 ? '#eff6ff' : 'transparent',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
                              onMouseLeave={e => (e.currentTarget.style.background = confirmDelete === d.id ? '#fff7ed' : unread > 0 ? '#eff6ff' : 'transparent')}>
                                <div onClick={() => abrirSala(d)} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                  <Avatar nome={nomeDireto(d)} size={28} bg='#dbeafe' color='#1d4ed8' />
                                  <div style={{ fontSize: 11, fontWeight: unread > 0 ? 700 : 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {nomeDireto(d)}
                                  </div>
                                  {unread > 0 && (
                                    <span style={{
                                      background: '#ef4444', color: 'white', borderRadius: 10,
                                      padding: '1px 7px', fontSize: 9, fontWeight: 700, flexShrink: 0,
                                      animation: 'badgePop .3s ease',
                                    }}>{unread}</span>
                                  )}
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmDelete(confirmDelete === d.id ? null : d.id); }}
                                  title="Apagar conversa"
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: confirmDelete === d.id ? '#ef4444' : '#cbd5e1',
                                    fontSize: 13, padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                                    transition: 'color .15s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                  onMouseLeave={e => (e.currentTarget.style.color = confirmDelete === d.id ? '#ef4444' : '#cbd5e1')}>
                                  🗑️
                                </button>
                              </div>

                              {confirmDelete === d.id && (
                                <div style={{ padding: '6px 14px 8px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 10, color: '#b91c1c', flex: 1 }}>
                                    Apagar esta conversa e todas as mensagens?
                                  </span>
                                  <button onClick={() => deletarSala(d.id)} style={{
                                    background: '#ef4444', color: 'white', border: 'none',
                                    borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}>Sim</button>
                                  <button onClick={() => setConfirmDelete(null)} style={{
                                    background: '#e2e8f0', color: '#475569', border: 'none',
                                    borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}>Não</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── SALA DE MENSAGENS ── */}
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
                      const proprio   = String(m.remetente_id) === uid;
                      const mesmaPess = i > 0 && grupo.msgs[i - 1].remetente_id === m.remetente_id;
                      return (
                        <div key={m.id} style={{
                          display: 'flex', flexDirection: proprio ? 'row-reverse' : 'row',
                          gap: 6, marginBottom: mesmaPess ? 2 : 8, alignItems: 'flex-end',
                        }}>
                          {!proprio && (mesmaPess
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
                              opacity: m._temp ? 0.55 : 1, transition: 'opacity .2s',
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
                    colorScheme: 'light',
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
                  fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .15s, transform .1s',
        // Pulsa vermelho quando há mensagens não lidas e o painel está fechado
        animation: temNaoLidas && !aberto ? 'chatPulse 1.8s ease-in-out infinite' : 'none',
        boxShadow: temNaoLidas && !aberto
          ? '0 4px 18px rgba(239,68,68,.55)'
          : '0 4px 18px rgba(15,118,110,.45)',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.07)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        {aberto ? '✕' : '💬'}
        {/* Badge sempre visível quando há não-lidas (inclusive com chat aberto) */}
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: '#ef4444', color: 'white', borderRadius: '50%',
            width: 19, height: 19, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white', lineHeight: 1,
            animation: 'badgePop .3s ease',
          }}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
