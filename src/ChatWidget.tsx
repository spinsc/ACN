// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

const CANAL_COR: Record<string, string> = {
  'Geral':        '#0f766e',
  'Comercial':    '#2563eb',
  'Licitações':   '#7c3aed',
  'CRM':          '#db2777',
  'Engenharia':   '#6d28d9',
  'PCP':          '#0891b2',
  'Laboratorio':  '#0d9488',
  'Producao':     '#ea580c',
  'Serralheria':  '#b45309',
  'Chicotes':     '#92400e',
  'Almoxarifado': '#16a34a',
  'Qualidade':    '#dc2626',
  'CQ':           '#dc2626',
  'Logistica':    '#d97706',
  'Fiscal':       '#059669',
  'Compras':      '#0369a1',
  'RH':           '#be185d',
  'SAC':          '#9333ea',
  'Marketing':    '#e11d48',
  'Telecom':      '#0284c7',
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
  // ── State ─────────────────────────────────────────────────────────────────
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
  const [busca, setBusca]         = useState('');
  const [hoveredDM, setHoveredDM] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const lrKey       = (salaId: string) => `acn_lr_${uid}_${salaId}`;
  const getLastRead = (salaId: string) => localStorage.getItem(lrKey(salaId)) || '1970-01-01T00:00:00Z';
  const markRead    = (salaId: string, msgTs?: string) => {
    const ts = msgTs
      ? new Date(new Date(msgTs).getTime() + 1000).toISOString()
      : new Date(Date.now() + 2000).toISOString();
    localStorage.setItem(lrKey(salaId), ts);
  };

  const nomeDireto = (sala: any) => {
    const membros = sala?.membros || [];
    const outros  = membros.filter((m: any) => String(m.id) !== uid);
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

  // ── Dados derivados ───────────────────────────────────────────────────────
  const buscaL = busca.toLowerCase();

  const diretosOrdenados = [...diretos]
    .filter(d => !busca || nomeDireto(d).toLowerCase().includes(buscaL))
    .sort((a, b) => {
      const ua = naoLidasPorSala[a.id] || 0;
      const ub = naoLidasPorSala[b.id] || 0;
      return ub - ua; // não-lidas primeiro
    });

  // IDs de usuários que já têm DM ativa com o usuário atual
  const idsComDM = new Set(
    diretos.flatMap(d =>
      (d.membros || []).map((m: any) => String(m.id)).filter(id => id !== uid)
    )
  );

  // Usuários para "Nova conversa": exclui quem já tem DM, filtra pela busca
  const usuariosParaNovaDM = usuarios.filter(u => {
    const id = String(u.id || u.email);
    if (idsComDM.has(id)) return false;
    if (!busca) return true;
    return (u.nome || u.email || '').toLowerCase().includes(buscaL);
  });

  const canaisFiltrados = canais.filter(c =>
    !busca || (c.nome || '').toLowerCase().includes(buscaL)
  );

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => { canaisRef.current  = canais;  }, [canais]);
  useEffect(() => { diretosRef.current = diretos; }, [diretos]);
  useEffect(() => { mutadoRef.current  = mutado;  }, [mutado]);

  // ── Sirene via Web Audio API ──────────────────────────────────────────────
  const playAlerta = useCallback(() => {
    if (mutadoRef.current) return;
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.35);
      osc.frequency.linearRampToValueAtTime(400, t + 0.75);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.68);
      gain.gain.linearRampToValueAtTime(0, t + 0.78);
      osc.start(t); osc.stop(t + 0.78);
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

  // Limpar busca ao mudar de aba
  useEffect(() => { setBusca(''); }, [aba]);

  // ── Contar não-lidas ──────────────────────────────────────────────────────
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

  // ── Polling badge ─────────────────────────────────────────────────────────
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

    // Inicializa: carrega salas, marca salas nunca abertas como "já lidas"
    // para evitar que mensagens antigas apareçam como não-lidas
    const init = async () => {
      const [todosCanais, todosDiretos] = await Promise.all([fetchCanais(), fetchDiretos()]);
      fetchUsuarios();
      for (const s of [...todosCanais, ...todosDiretos]) {
        if (!localStorage.getItem(lrKey(s.id))) markRead(s.id);
      }
      const n = await contarNaoLidas();
      prevCountRef.current = n;
    };
    init();

    broadcastRef.current = supabase.channel(BROADCAST_CH)
      .on('broadcast', { event: 'nova_msg' }, ({ payload }: any) => {
        if (String(payload.sender_id) === uid) return;

        if (payload.sala_tipo === 'direto') {
          const membro = (payload.membros || []).some((m: any) => String(m.id) === uid);
          if (!membro) return;
          fetchDiretos();
        }

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

        const sala = [...canaisRef.current, ...diretosRef.current].find(s => s.id === payload.sala_id)
          || { id: payload.sala_id, nome: payload.sala_nome, tipo: payload.sala_tipo, membros: payload.membros || [] };

        setToast({ sala, remetente_nome: payload.remetente_nome, texto: payload.texto });
        playAlerta();
        setNaoLidas(prev => { const n = prev + 1; prevCountRef.current = n; return n; });
        setNaoLidasPorSala(prev => ({ ...prev, [payload.sala_id]: (prev[payload.sala_id] || 0) + 1 }));
      })
      .subscribe();

    return () => { broadcastRef.current?.unsubscribe(); };
  }, [currentUser?.id]);

  // Polling badge a cada 5s
  useEffect(() => {
    if (!currentUser) return;
    const t = setInterval(verificarNovas, 5000);
    return () => clearInterval(t);
  }, [currentUser?.id, verificarNovas]);

  // Polling mensagens na sala aberta a cada 2s
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
  const fetchCanais = async (): Promise<any[]> => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'canal').order('nome');
    const list = data || [];
    setCanais(list);
    return list;
  };

  const fetchDiretos = async (): Promise<any[]> => {
    const { data } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
    const isAdmin = currentUser?.perfil === 'Admin';
    const lista = isAdmin
      ? (data || [])
      : (data || []).filter(s => (s.membros || []).some((m: any) => String(m.id) === uid));

    const seen = new Map<string, any>();
    for (const d of lista) {
      const outroId = String((d.membros || []).find((m: any) => String(m.id) !== uid)?.id || d.id);
      const atual = seen.get(outroId);
      if (!atual || (d.criado_em || '') > (atual.criado_em || '')) seen.set(outroId, d);
    }
    const finalList = [...seen.values()];
    setDiretos(finalList);
    return finalList;
  };

  const fetchUsuarios = async () => {
    let all: any[] = [];
    const PAGE = 100;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('auth_usuarios').select('id,nome,email,perfil').order('nome')
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setUsuarios(all.filter(u => String(u.id || u.email) !== uid));
  };

  const fetchMensagens = async (salaId: string) => {
    const { data } = await supabase.from('chat_mensagens')
      .select('*').eq('sala_id', salaId).order('criado_em');
    setMensagens(data || []);
    const ultima = (data || []).at(-1);
    markRead(salaId, ultima?.criado_em);
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
    if (!novo) playAlerta();
  };

  if (!currentUser) return null;

  const temNaoLidas = naoLidas > 0;

  // Não-lidas por aba
  const naoLidasCanais  = canais.reduce((acc, c)  => acc + (naoLidasPorSala[c.id]  || 0), 0);
  const naoLidasDiretos = diretos.reduce((acc, d) => acc + (naoLidasPorSala[d.id] || 0), 0);

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 9500, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

      <style>{`
        @keyframes chatPop   { from{opacity:0;transform:translateY(10px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes chatPulse { 0%,100%{box-shadow:0 4px 18px rgba(239,68,68,.55),0 0 0 0 rgba(239,68,68,.45)} 60%{box-shadow:0 4px 18px rgba(239,68,68,.55),0 0 0 10px rgba(239,68,68,0)} }
        @keyframes badgePop  { 0%{transform:scale(0)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }
        .chat-row-hover:hover { background: #f0fdfa !important; }
        .dm-del-btn { opacity: 0; transition: opacity .15s; }
        .dm-item-row:hover .dm-del-btn { opacity: 1; }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div onClick={() => abrirViaToast(toast)} style={{
          background: '#1e293b', color: 'white', borderRadius: 10,
          padding: '10px 14px', cursor: 'pointer', width: 290,
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
          <div style={{ fontSize: 8, color: '#64748b', marginTop: 1 }}>Clique para abrir a conversa</div>
        </div>
      )}

      {/* ── Painel principal ── */}
      {aberto && (
        <div style={{
          width: 380, height: 580, background: '#ffffff', borderRadius: 14,
          boxShadow: '0 16px 56px rgba(0,0,0,.22)', display: 'flex',
          flexDirection: 'column', border: '1px solid #e2e8f0', overflow: 'hidden',
          animation: 'chatPop .18s ease',
        }}>

          {/* Header */}
          <div style={{ background: '#0f766e', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {view === 'sala' ? (
              <>
                <button onClick={voltarLista}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
                {salaAtiva?.tipo === 'canal'
                  ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: CANAL_COR[salaAtiva.nome] || '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                      {(salaAtiva.nome || '?')[0]}
                    </span>
                  : <Avatar nome={nomeDireto(salaAtiva)} size={24} bg='#dbeafe' color='#1d4ed8' />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nomeSala(salaAtiva)}
                  </div>
                  {salaAtiva?.tipo === 'canal' && (
                    <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 9 }}>Canal</div>
                  )}
                </div>
              </>
            ) : (
              <span style={{ color: 'white', fontWeight: 700, fontSize: 14, flex: 1 }}>💬 Chat ACN</span>
            )}
            <button onClick={toggleMudo} title={mutado ? 'Ativar som' : 'Silenciar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 4px', lineHeight: 1,
                color: mutado ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.75)' }}>
              {mutado ? '🔕' : '🔔'}
            </button>
            <button onClick={() => setAberto(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontSize: 17, padding: 0, lineHeight: 1 }}>✕</button>
          </div>

          {/* ── LISTA ── */}
          {view === 'lista' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>

              {/* Abas com badge */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e8ecf0', flexShrink: 0 }}>
                {(['canais', 'diretos'] as const).map(a => {
                  const badge = a === 'canais' ? naoLidasCanais : naoLidasDiretos;
                  return (
                    <button key={a} onClick={() => setAba(a)} style={{
                      flex: 1, padding: '9px 0', fontSize: 11, fontWeight: 700,
                      background: aba === a ? '#f0fdfa' : '#fff',
                      color: aba === a ? '#0f766e' : '#94a3b8',
                      border: 'none', borderBottom: aba === a ? '2px solid #0f766e' : '2px solid transparent',
                      cursor: 'pointer', textTransform: 'uppercase', letterSpacing: .5,
                      marginBottom: -2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      {a === 'canais' ? '# Canais' : '✉ Diretos'}
                      {badge > 0 && (
                        <span style={{ background: '#ef4444', color: 'white', borderRadius: 9, padding: '0px 5px', fontSize: 9, fontWeight: 700, lineHeight: '16px' }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Campo de busca */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, background: '#fafafa' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder={aba === 'canais' ? 'Filtrar canais...' : 'Buscar conversa ou usuário...'}
                    style={{
                      width: '100%', padding: '6px 10px 6px 28px', fontSize: 11,
                      border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
                      background: 'white', color: '#1e293b', boxSizing: 'border-box',
                    }}
                  />
                  {busca && (
                    <button onClick={() => setBusca('')}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: 0, lineHeight: 1 }}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Conteúdo scrollável */}
              <div style={{ flex: 1, overflowY: 'auto' }}>

                {/* ─── CANAIS ─── */}
                {aba === 'canais' && (
                  canaisFiltrados.length === 0
                    ? <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40, padding: '0 20px' }}>
                        {busca ? 'Nenhum canal encontrado' : 'Nenhum canal disponível'}
                      </div>
                    : canaisFiltrados.map(c => {
                        const unread = naoLidasPorSala[c.id] || 0;
                        return (
                          <div key={c.id} onClick={() => abrirSala(c)}
                            className="chat-row-hover"
                            style={{
                              padding: '9px 14px', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', gap: 11, borderBottom: '1px solid #f8fafc',
                              background: unread > 0 ? '#f0fdf4' : 'transparent',
                            }}>
                            <span style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: CANAL_COR[c.nome] || '#0f766e',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0,
                            }}>{(c.nome || '?')[0]}</span>
                            <div style={{ fontSize: 12, fontWeight: unread > 0 ? 700 : 500, color: '#1e293b', flex: 1 }}>
                              # {c.nome}
                            </div>
                            {unread > 0 && (
                              <span style={{
                                background: '#ef4444', color: 'white', borderRadius: 10,
                                padding: '2px 8px', fontSize: 9, fontWeight: 700, flexShrink: 0,
                                animation: 'badgePop .3s ease',
                              }}>{unread}</span>
                            )}
                          </div>
                        );
                      })
                )}

                {/* ─── DIRETOS ─── */}
                {aba === 'diretos' && (
                  <>
                    {/* Conversas existentes */}
                    {diretosOrdenados.length > 0 && (
                      <>
                        <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .7, background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          Conversas
                        </div>
                        {diretosOrdenados.map(d => {
                          const unread   = naoLidasPorSala[d.id] || 0;
                          const isHovered = hoveredDM === d.id;
                          return (
                            <div key={d.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <div
                                className="dm-item-row"
                                style={{
                                  padding: '8px 12px', cursor: 'pointer', display: 'flex',
                                  alignItems: 'center', gap: 9,
                                  background: confirmDelete === d.id ? '#fff7ed' : unread > 0 ? '#eff6ff' : 'transparent',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa'; setHoveredDM(d.id); }}
                                onMouseLeave={e => { e.currentTarget.style.background = confirmDelete === d.id ? '#fff7ed' : unread > 0 ? '#eff6ff' : 'transparent'; setHoveredDM(null); }}
                              >
                                <div onClick={() => abrirSala(d)} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                                  <Avatar nome={nomeDireto(d)} size={32} bg='#dbeafe' color='#1d4ed8' />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: unread > 0 ? 700 : 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {nomeDireto(d)}
                                    </div>
                                    {unread > 0 && (
                                      <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 600 }}>
                                        {unread} mensagem{unread > 1 ? 'ns' : ''} não lida{unread > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                  {unread > 0 && (
                                    <span style={{
                                      background: '#3b82f6', color: 'white', borderRadius: 10,
                                      padding: '2px 8px', fontSize: 9, fontWeight: 700, flexShrink: 0,
                                      animation: 'badgePop .3s ease',
                                    }}>{unread}</span>
                                  )}
                                </div>
                                <button
                                  className="dm-del-btn"
                                  onClick={e => { e.stopPropagation(); setConfirmDelete(confirmDelete === d.id ? null : d.id); }}
                                  title="Apagar conversa"
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: confirmDelete === d.id ? '#ef4444' : '#94a3b8',
                                    fontSize: 13, padding: '2px 5px', borderRadius: 5, flexShrink: 0,
                                    opacity: (isHovered || confirmDelete === d.id) ? 1 : 0,
                                    transition: 'color .15s',
                                  }}>
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
                                    borderRadius: 5, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}>Sim</button>
                                  <button onClick={() => setConfirmDelete(null)} style={{
                                    background: '#e2e8f0', color: '#475569', border: 'none',
                                    borderRadius: 5, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}>Não</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Nova conversa — usuários sem DM */}
                    {(usuariosParaNovaDM.length > 0 || (busca && diretosOrdenados.length === 0)) && (
                      <>
                        <div style={{
                          padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8',
                          textTransform: 'uppercase', letterSpacing: .7, background: '#f8fafc',
                          borderTop: diretosOrdenados.length > 0 ? '2px solid #e8ecf0' : 'none',
                          borderBottom: '1px solid #f1f5f9',
                        }}>
                          ✉ Nova conversa
                        </div>
                        {usuariosParaNovaDM.length === 0 && busca ? (
                          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: '20px 0' }}>
                            Nenhum usuário encontrado
                          </div>
                        ) : (
                          usuariosParaNovaDM.map(u => (
                            <div key={u.id || u.email} onClick={() => abrirDireto(u)}
                              className="chat-row-hover"
                              style={{
                                padding: '7px 14px', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: 9, borderBottom: '1px solid #f8fafc',
                              }}>
                              <Avatar nome={u.nome} size={30} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{u.nome}</div>
                                <div style={{ fontSize: 9, color: '#94a3b8' }}>{u.perfil}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    )}

                    {/* Estado vazio total */}
                    {diretos.length === 0 && usuarios.length === 0 && !busca && (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40 }}>
                        Nenhum usuário disponível
                      </div>
                    )}
                    {diretos.length === 0 && usuariosParaNovaDM.length === 0 && !busca && usuarios.length > 0 && (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40 }}>
                        Todas as conversas iniciadas!
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── SALA DE MENSAGENS ── */}
          {view === 'sala' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                {mensagens.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 60 }}>
                    👋 Nenhuma mensagem ainda. Diga olá!
                  </div>
                )}
                {agrupar().map(grupo => (
                  <div key={grupo.data}>
                    <div style={{ textAlign: 'center', margin: '12px 0 10px', fontSize: 10, color: '#b0bac5', fontWeight: 600, letterSpacing: .5, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 1, background: '#e8ecf0' }} />
                      {grupo.data}
                      <span style={{ flex: 1, height: 1, background: '#e8ecf0' }} />
                    </div>
                    {grupo.msgs.map((m, i) => {
                      const proprio   = String(m.remetente_id) === uid;
                      const mesmaPess = i > 0 && grupo.msgs[i - 1].remetente_id === m.remetente_id;
                      return (
                        <div key={m.id} style={{
                          display: 'flex', flexDirection: proprio ? 'row-reverse' : 'row',
                          gap: 7, marginBottom: mesmaPess ? 3 : 10, alignItems: 'flex-end',
                        }}>
                          {!proprio && (mesmaPess
                            ? <span style={{ width: 28, flexShrink: 0 }} />
                            : <Avatar nome={m.remetente_nome} size={28} />
                          )}
                          <div style={{ maxWidth: '78%' }}>
                            {!proprio && !mesmaPess && (
                              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3, marginLeft: 3, fontWeight: 700, letterSpacing: .3 }}>
                                {m.remetente_nome}
                              </div>
                            )}
                            <div style={{
                              background: proprio ? '#0f766e' : '#f1f5f9',
                              color: proprio ? 'white' : '#1e293b',
                              padding: '8px 12px',
                              borderRadius: proprio ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word',
                              opacity: m._temp ? 0.55 : 1, transition: 'opacity .2s',
                              boxShadow: '0 1px 2px rgba(0,0,0,.06)',
                            }}>
                              {m.texto}
                            </div>
                            <div style={{ fontSize: 9, color: '#b0bac5', marginTop: 3, textAlign: proprio ? 'right' : 'left', padding: '0 3px' }}>
                              {m._temp ? '⏳ enviando…' : fmtHora(m.criado_em)}
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
              <div style={{ padding: '10px 12px', borderTop: '1px solid #e8ecf0', display: 'flex', gap: 7, flexShrink: 0, background: '#fafafa' }}>
                <input ref={inputRef}
                  style={{
                    flex: 1, padding: '9px 14px', fontSize: 12,
                    border: '1.5px solid #d1d5db', borderRadius: 22,
                    outline: 'none', color: '#1e293b', background: 'white',
                    colorScheme: 'light', transition: 'border-color .15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#0f766e')}
                  onBlur={e  => (e.target.style.borderColor = '#d1d5db')}
                  placeholder="Mensagem… (Enter para enviar)"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                />
                <button onClick={enviar} disabled={!texto.trim() || enviando} style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: texto.trim() ? '#0f766e' : '#e2e8f0',
                  color: texto.trim() ? 'white' : '#94a3b8',
                  border: 'none', cursor: texto.trim() ? 'pointer' : 'default',
                  fontSize: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s, transform .1s',
                  boxShadow: texto.trim() ? '0 2px 8px rgba(15,118,110,.35)' : 'none',
                }}
                onMouseEnter={e => { if (texto.trim()) e.currentTarget.style.transform = 'scale(1.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                  ➤
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Botão flutuante ── */}
      <button onClick={() => setAberto(a => !a)} style={{
        width: 52, height: 52, borderRadius: '50%',
        background: aberto ? '#0c5d58' : '#0f766e',
        border: 'none', cursor: 'pointer', color: 'white', fontSize: 22,
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .15s, transform .1s',
        animation: temNaoLidas && !aberto ? 'chatPulse 1.8s ease-in-out infinite' : 'none',
        boxShadow: temNaoLidas && !aberto
          ? '0 4px 18px rgba(239,68,68,.55)'
          : '0 4px 18px rgba(15,118,110,.45)',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        {aberto ? '✕' : '💬'}
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: '#ef4444', color: 'white', borderRadius: '50%',
            width: 20, height: 20, fontSize: 9, fontWeight: 700,
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
