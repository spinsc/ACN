// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';

const BROADCAST_CH = 'acn-chat-v1';

// Contextos com deep-link já funcionando (window.__acnDeepLink + acn:abrir-registro)
// que dá pra compartilhar via chat com abertura direta no processo.
const REF_TIPOS = [
  { contexto: 'licitacao', aba: 'licitacoes', tabela: 'licitacoes',        campos: 'id,numero,nome_projeto,orgao', label: (r: any) => `${r.numero || '—'} — ${r.nome_projeto || r.orgao || ''}`, icone: '🏛️' },
  { contexto: 'crm',       aba: 'crm',        tabela: 'crm_oportunidades', campos: 'id,titulo,orgao',              label: (r: any) => r.titulo || r.orgao || '—', icone: '💼' },
];

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

function GroupIcon({ size = 26 }: any) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: '#ede9fe',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#6d28d9', fontSize: size * 0.5, flexShrink: 0,
    }}>👥</span>
  );
}

export default function ChatWidget({ currentUser, onNavigate }: any) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [aberto, setAberto]       = useState(false);
  const [view, setView]           = useState<'lista' | 'sala'>('lista');
  const [salas, setSalas]         = useState<any[]>([]); // diretos + grupos, unificado
  const [usuarios, setUsuarios]   = useState<any[]>([]);
  const [ausentesNomes, setAusentesNomes] = useState<Set<string>>(new Set());
  const [salaAtiva, setSalaAtiva] = useState<any>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [ultimasMsg, setUltimasMsg] = useState<Record<string, any>>({});
  const [texto, setTexto]         = useState('');
  const [naoLidas, setNaoLidas]   = useState(0);
  const [naoLidasPorSala, setNaoLidasPorSala] = useState<Record<string, number>>({});
  const [enviando, setEnviando]   = useState(false);
  const [toast, setToast]         = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mutado, setMutado]       = useState(() => localStorage.getItem('acn_chat_muted') === '1');
  const [busca, setBusca]         = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Fase 2 — grupos
  const [modalNovoGrupo, setModalNovoGrupo] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome]   = useState('');
  const [novoGrupoMembros, setNovoGrupoMembros] = useState<Set<string>>(new Set());
  const [modalInfoGrupo, setModalInfoGrupo] = useState(false);
  const [addMembroBusca, setAddMembroBusca] = useState('');

  // Fase 4 — anexo
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const anexoInputRef = useRef<HTMLInputElement>(null);

  // Fase 5 — compartilhar processo
  const [modalCompartilhar, setModalCompartilhar] = useState(false);
  const [compartilharBusca, setCompartilharBusca] = useState('');
  const [compartilharResultados, setCompartilharResultados] = useState<any[]>([]);
  const [compartilharBuscando, setCompartilharBuscando] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const endRef       = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const salaAtivaRef = useRef<any>(null);
  const salasRef      = useRef<any[]>([]);
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
  const nomeSala  = (sala: any) => sala?.tipo === 'grupo' ? (sala.nome || 'Grupo') : nomeDireto(sala);
  const souAdmin  = (sala: any) => sala?.tipo === 'grupo' && String(sala.criado_por) === uid;

  const fmtHora = (d: any) =>
    d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  const fmtHoraLista = (d: any) => {
    if (!d) return '';
    const dt = new Date(d), hoje = new Date();
    if (dt.toDateString() === hoje.toDateString()) return fmtHora(d);
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (dt.toDateString() === ontem.toDateString()) return 'Ontem';
    const diffDias = Math.floor((hoje.getTime() - dt.getTime()) / 86400000);
    if (diffDias < 7) return dt.toLocaleDateString('pt-BR', { weekday: 'short' });
    return dt.toLocaleDateString('pt-BR');
  };

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

  // Texto de prévia da última mensagem (estilo WhatsApp: "Você: ...", anexo/
  // referência viram um rótulo curto em vez do texto cru).
  const previewMsg = (m: any) => {
    if (!m) return '';
    const prefixo = String(m.remetente_id) === uid ? 'Você: ' : '';
    if (m.ref_desc) return `${prefixo}🔗 ${m.ref_desc}`;
    if (m.anexo_nome) return `${prefixo}📎 ${m.anexo_nome}`;
    return `${prefixo}${m.texto || ''}`;
  };

  // ── Dados derivados ───────────────────────────────────────────────────────
  const buscaL = busca.toLowerCase();

  // Lista unificada (diretos + grupos), ordenada por atividade mais recente
  // primeiro — igual WhatsApp. O badge/negrito continuam sinalizando não-lida,
  // mas não reordenam mais a lista.
  const salasOrdenadas = [...salas]
    .filter(s => !busca || nomeSala(s).toLowerCase().includes(buscaL))
    .sort((a, b) => {
      const ta = ultimasMsg[a.id]?.criado_em || a.criado_em || '';
      const tb = ultimasMsg[b.id]?.criado_em || b.criado_em || '';
      return tb.localeCompare(ta);
    });

  // IDs de usuários que já têm DM ativa com o usuário atual
  const idsComDM = new Set(
    salas.filter(s => s.tipo === 'direto').flatMap(d =>
      (d.membros || []).map((m: any) => String(m.id)).filter(id => id !== uid)
    )
  );

  // Usuários visíveis no chat: nunca eu mesmo, nunca afastado/férias.
  const usuariosVisiveis = usuarios.filter(u => !ausentesNomes.has((u.nome || '').trim().toUpperCase()));

  // Usuários para "Nova conversa": exclui quem já tem DM, filtra pela busca
  const usuariosParaNovaDM = usuariosVisiveis.filter(u => {
    const id = String(u.id || u.email);
    if (idsComDM.has(id)) return false;
    if (!busca) return true;
    return (u.nome || u.email || '').toLowerCase().includes(buscaL);
  });

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => { salasRef.current  = salas;  }, [salas]);
  useEffect(() => { mutadoRef.current = mutado; }, [mutado]);

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

  // ── Contar não-lidas + montar prévia da última mensagem por sala ───────────
  // Uma única busca serve pros dois: não conta mensagem de sala que não é
  // minha (antes buscava chat_mensagens inteiro sem filtro de sala — qualquer
  // conversa nunca aberta, inclusive de outras pessoas, contava como "não
  // lida" e o bullet nunca zerava de verdade).
  const atualizarContadorEPreview = useCallback(async (lista?: any[]) => {
    const idsMinhasSalas = salasRef.current.map((s: any) => s.id);
    if (idsMinhasSalas.length === 0) { setNaoLidas(0); setNaoLidasPorSala({}); setUltimasMsg({}); return 0; }
    let data = lista;
    if (!data) {
      const res = await supabase.from('chat_mensagens')
        .select('id,sala_id,remetente_id,remetente_nome,texto,anexo_nome,ref_desc,criado_em')
        .in('sala_id', idsMinhasSalas)
        .order('criado_em', { ascending: false })
        .limit(500);
      data = res.data || [];
    }
    const porSala: Record<string, number> = {};
    const previews: Record<string, any> = {};
    let total = 0;
    for (const m of data as any[]) {
      if (!previews[m.sala_id]) previews[m.sala_id] = m; // primeira ocorrência = mais recente (desc)
      if (String(m.remetente_id) === uid) continue;
      if (m.criado_em > getLastRead(m.sala_id)) {
        porSala[m.sala_id] = (porSala[m.sala_id] || 0) + 1;
        total++;
      }
    }
    setNaoLidas(total);
    setNaoLidasPorSala(porSala);
    setUltimasMsg(prev => ({ ...prev, ...previews }));
    return total;
  }, [uid]);

  // ── Polling badge ─────────────────────────────────────────────────────────
  const verificarNovas = useCallback(async () => {
    const idsMinhasSalas = salasRef.current.map((s: any) => s.id);
    if (idsMinhasSalas.length === 0) { setNaoLidas(0); setNaoLidasPorSala({}); prevCountRef.current = 0; return; }
    const { data } = await supabase.from('chat_mensagens')
      .select('id,sala_id,remetente_id,remetente_nome,texto,anexo_nome,ref_desc,criado_em')
      .in('sala_id', idsMinhasSalas)
      .order('criado_em', { ascending: false })
      .limit(500);

    const todas = data || [];
    const previews: Record<string, any> = {};
    for (const m of todas) if (!previews[m.sala_id]) previews[m.sala_id] = m;
    setUltimasMsg(prev => ({ ...prev, ...previews }));

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
        const sala = salasRef.current.find((s: any) => s.id === latest.sala_id);
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

    const init = async () => {
      const todasSalas = await fetchSalas();
      fetchUsuarios();
      fetchAusentes();
      for (const s of todasSalas) {
        if (!localStorage.getItem(lrKey(s.id))) markRead(s.id);
      }
      const n = await atualizarContadorEPreview();
      prevCountRef.current = n;
    };
    init();

    broadcastRef.current = supabase.channel(BROADCAST_CH)
      .on('broadcast', { event: 'nova_msg' }, ({ payload }: any) => {
        if (String(payload.sender_id) === uid) return;

        const membro = (payload.membros || []).some((m: any) => String(m.id) === uid);
        if (!membro) return; // não é uma conversa minha — ignora completamente
        fetchSalas();

        if (salaAtivaRef.current?.id === payload.sala_id) {
          setMensagens(prev => {
            if (prev.find((m: any) => m.id === payload.msg_id)) return prev;
            markRead(payload.sala_id, payload.criado_em);
            atualizarContadorEPreview();
            return [...prev, {
              id: payload.msg_id, sala_id: payload.sala_id,
              remetente_id: payload.sender_id, remetente_nome: payload.remetente_nome,
              texto: payload.texto, lida_por: [], criado_em: payload.criado_em,
              anexo_url: payload.anexo_url || null, anexo_nome: payload.anexo_nome || null, anexo_tipo: payload.anexo_tipo || null,
              ref_contexto: payload.ref_contexto || null, ref_contexto_id: payload.ref_contexto_id || null, ref_desc: payload.ref_desc || null,
            }];
          });
          return;
        }

        const sala = salasRef.current.find((s: any) => s.id === payload.sala_id)
          || { id: payload.sala_id, nome: payload.sala_nome, tipo: payload.sala_tipo || 'direto', membros: payload.membros || [] };

        setToast({ sala, remetente_nome: payload.remetente_nome, texto: payload.texto || payload.anexo_nome || payload.ref_desc || '' });
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
        atualizarContadorEPreview();
        return data;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [salaAtiva?.id, aberto]);

  // ── Fetches ───────────────────────────────────────────────────────────────
  // Sempre filtra pelas conversas que o usuário realmente participa — mesmo
  // Admin só vê as próprias, nunca as DMs/grupos alheios.
  const fetchSalas = async (): Promise<any[]> => {
    const { data } = await supabase.from('chat_salas').select('*').in('tipo', ['direto', 'grupo']);
    const minhas = (data || []).filter(s => (s.membros || []).some((m: any) => String(m.id) === uid));

    // DMs duplicadas (mesmo par de usuários) — fica só a mais recente.
    const seen = new Map<string, any>();
    const grupos: any[] = [];
    for (const s of minhas) {
      if (s.tipo === 'grupo') { grupos.push(s); continue; }
      const outroId = String((s.membros || []).find((m: any) => String(m.id) !== uid)?.id || s.id);
      const atual = seen.get(outroId);
      if (!atual || (s.criado_em || '') > (atual.criado_em || '')) seen.set(outroId, s);
    }
    const finalList = [...seen.values(), ...grupos];
    setSalas(finalList);
    if (salaAtivaRef.current) {
      const atualizada = finalList.find(s => s.id === salaAtivaRef.current.id);
      if (atualizada) { setSalaAtiva(atualizada); salaAtivaRef.current = atualizada; }
    }
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

  // Nomes (maiúsculo/trim) de quem está Afastado ou de Férias agora — casa
  // por NOME com auth_usuarios porque rh_funcionarios.usuario_id não vem
  // preenchido nos cadastros existentes (e-mails também divergem às vezes).
  const fetchAusentes = async () => {
    const { data } = await supabase.from('rh_funcionarios')
      .select('nome,status_presenca').in('status_presenca', ['Afastado', 'Férias']);
    setAusentesNomes(new Set((data || []).map((f: any) => (f.nome || '').trim().toUpperCase())));
  };

  const fetchMensagens = async (salaId: string) => {
    const { data } = await supabase.from('chat_mensagens')
      .select('*').eq('sala_id', salaId).order('criado_em');
    setMensagens(data || []);
    const ultima = (data || []).at(-1);
    markRead(salaId, ultima?.criado_em);
    atualizarContadorEPreview();
  };

  // ── Abrir sala ────────────────────────────────────────────────────────────
  const abrirSala = async (sala: any) => {
    setSalaAtiva(sala);
    salaAtivaRef.current = sala;
    setMensagens([]);
    setView('sala');
    setToast(null);
    markRead(sala.id);
    atualizarContadorEPreview();
    await fetchMensagens(sala.id);
  };

  const voltarLista = () => {
    setSalaAtiva(null);
    salaAtivaRef.current = null;
    setMensagens([]);
    setView('lista');
    setModalInfoGrupo(false);
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
    if (nova) { fetchSalas(); await abrirSala(nova); }
  };

  const abrirViaToast = (t: any) => {
    setAberto(true);
    abrirSala(t.sala);
  };

  // ── Fase 2: grupos ───────────────────────────────────────────────────────
  const toggleNovoGrupoMembro = (id: string) => {
    setNovoGrupoMembros(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const criarGrupo = async () => {
    if (!novoGrupoNome.trim() || novoGrupoMembros.size === 0) return;
    const membrosSel = usuariosVisiveis
      .filter(u => novoGrupoMembros.has(String(u.id || u.email)))
      .map(u => ({ id: String(u.id || u.email), nome: u.nome || u.email }));
    const { data: novo } = await supabase.from('chat_salas').insert([{
      tipo: 'grupo', nome: novoGrupoNome.trim(),
      membros: [{ id: uid, nome: unome }, ...membrosSel],
      criado_por: uid, criado_por_nome: unome,
    }]).select().single();
    setModalNovoGrupo(false);
    setNovoGrupoNome('');
    setNovoGrupoMembros(new Set());
    if (novo) { await fetchSalas(); await abrirSala(novo); }
  };

  const atualizarMembrosGrupo = async (novosMembros: any[]) => {
    if (!salaAtiva) return;
    const { data } = await supabase.from('chat_salas')
      .update({ membros: novosMembros }).eq('id', salaAtiva.id).select().single();
    if (data) { setSalaAtiva(data); salaAtivaRef.current = data; fetchSalas(); }
  };

  const removerMembroGrupo = (id: string) => {
    const novos = (salaAtiva.membros || []).filter((m: any) => String(m.id) !== String(id));
    atualizarMembrosGrupo(novos);
  };

  const adicionarMembroGrupo = (u: any) => {
    const id = String(u.id || u.email);
    if ((salaAtiva.membros || []).some((m: any) => String(m.id) === id)) return;
    atualizarMembrosGrupo([...(salaAtiva.membros || []), { id, nome: u.nome || u.email }]);
  };

  const sairDoGrupo = async () => {
    if (!salaAtiva) return;
    if (!window.confirm(`Sair do grupo "${nomeSala(salaAtiva)}"?`)) return;
    const novos = (salaAtiva.membros || []).filter((m: any) => String(m.id) !== uid);
    await supabase.from('chat_salas').update({ membros: novos }).eq('id', salaAtiva.id);
    setModalInfoGrupo(false);
    await fetchSalas();
    voltarLista();
  };

  // ── Enviar mensagem (texto / anexo / referência) ────────────────────────
  const inserirEEnviar = async (extra: any, textoTemp?: string) => {
    if (!salaAtiva || enviando) return;
    setEnviando(true);

    const tempId = 'temp-' + Date.now();
    setMensagens(prev => [...prev, {
      id: tempId, _temp: true, sala_id: salaAtiva.id,
      remetente_id: uid, remetente_nome: unome,
      texto: textoTemp || '', lida_por: [], criado_em: new Date().toISOString(),
      ...extra,
    }]);

    const { data: inserido } = await supabase.from('chat_mensagens').insert([{
      sala_id: salaAtiva.id, remetente_id: uid,
      remetente_nome: unome, texto: textoTemp || '', lida_por: [],
      ...extra,
    }]).select().single();

    if (inserido) {
      setMensagens(prev => prev.map(m => m.id === tempId ? inserido : m));
      markRead(salaAtiva.id, inserido.criado_em);
      setUltimasMsg(prev => ({ ...prev, [salaAtiva.id]: inserido }));
      broadcastRef.current?.send({
        type: 'broadcast', event: 'nova_msg',
        payload: {
          msg_id: inserido.id, sala_id: salaAtiva.id,
          sala_nome: salaAtiva.nome || null, sala_tipo: salaAtiva.tipo,
          membros: salaAtiva.membros || [], sender_id: uid,
          remetente_nome: unome, texto: inserido.texto, criado_em: inserido.criado_em,
          anexo_url: inserido.anexo_url, anexo_nome: inserido.anexo_nome, anexo_tipo: inserido.anexo_tipo,
          ref_contexto: inserido.ref_contexto, ref_contexto_id: inserido.ref_contexto_id, ref_desc: inserido.ref_desc,
        },
      });
    }
    setEnviando(false);
    return inserido;
  };

  const enviar = async () => {
    if (!texto.trim()) return;
    const txt = texto.trim();
    setTexto('');
    await inserirEEnviar({ texto: txt }, txt);
    inputRef.current?.focus();
  };

  // ── Fase 4: anexo ─────────────────────────────────────────────────────────
  const enviarAnexo = async (file: File) => {
    if (!salaAtiva) return;
    if (file.size > 15 * 1024 * 1024) { alert(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 15 MB.`); return; }
    setEnviandoAnexo(true);
    const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `chat/${salaAtiva.id}/${Date.now()}_${nomeLimpo}`;
    const { error: errUp } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (errUp) { alert('Erro ao enviar anexo: ' + errUp.message); setEnviandoAnexo(false); return; }
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    await inserirEEnviar({ anexo_url: pub?.publicUrl || null, anexo_nome: file.name, anexo_tipo: file.type || null });
    setEnviandoAnexo(false);
    if (anexoInputRef.current) anexoInputRef.current.value = '';
  };

  // ── Fase 5: compartilhar processo/demanda ───────────────────────────────
  const buscarParaCompartilhar = async (texto: string) => {
    setCompartilharBusca(texto);
    if (texto.trim().length < 2) { setCompartilharResultados([]); return; }
    setCompartilharBuscando(true);
    const todos: any[] = [];
    for (const rt of REF_TIPOS) {
      const campoTexto = rt.tabela === 'licitacoes' ? 'nome_projeto' : 'titulo';
      const { data } = await supabase.from(rt.tabela).select(rt.campos)
        .or(`${campoTexto}.ilike.%${texto}%,orgao.ilike.%${texto}%`).limit(6);
      (data || []).forEach((r: any) => todos.push({ ...r, _tipo: rt }));
    }
    setCompartilharResultados(todos);
    setCompartilharBuscando(false);
  };

  const compartilharRegistro = async (r: any) => {
    const rt = r._tipo;
    await inserirEEnviar({
      ref_contexto: rt.contexto, ref_contexto_id: String(r.id), ref_desc: rt.label(r),
    });
    setModalCompartilhar(false);
    setCompartilharBusca('');
    setCompartilharResultados([]);
  };

  const abrirReferencia = (m: any) => {
    if (!m.ref_contexto || !m.ref_contexto_id) return;
    const rt = REF_TIPOS.find(r => r.contexto === m.ref_contexto);
    (window as any).__acnDeepLink = { contexto: m.ref_contexto, contextoId: m.ref_contexto_id };
    window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail: (window as any).__acnDeepLink }));
    if (rt && onNavigate) { onNavigate(rt.aba); setAberto(false); }
  };

  // ── Excluir DM ────────────────────────────────────────────────────────────
  const deletarSala = async (salaId: string) => {
    await supabase.from('chat_salas').delete().eq('id', salaId);
    localStorage.removeItem(lrKey(salaId));
    setSalas(prev => prev.filter(d => d.id !== salaId));
    if (salaAtivaRef.current?.id === salaId) voltarLista();
    setConfirmDelete(null);
    atualizarContadorEPreview();
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
  const ehImagem = (tipo: string) => (tipo || '').startsWith('image/');

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
                {salaAtiva?.tipo === 'grupo' ? <GroupIcon size={24} /> : <Avatar nome={nomeDireto(salaAtiva)} size={24} bg='#dbeafe' color='#1d4ed8' />}
                <div onClick={() => salaAtiva?.tipo === 'grupo' && setModalInfoGrupo(true)}
                  style={{ flex: 1, minWidth: 0, cursor: salaAtiva?.tipo === 'grupo' ? 'pointer' : 'default' }}>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nomeSala(salaAtiva)}
                  </div>
                  {salaAtiva?.tipo === 'grupo' && (
                    <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 9 }}>{(salaAtiva.membros || []).length} participantes · toque para ver</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <span style={{ color: 'white', fontWeight: 700, fontSize: 14, flex: 1 }}>💬 Chat ACN</span>
                <button onClick={() => setModalNovoGrupo(true)} title="Novo grupo"
                  style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, padding: '5px 9px', borderRadius: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  👥+
                </button>
              </>
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

              {/* Campo de busca */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, background: '#fafafa' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar conversa ou usuário..."
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
                {/* Conversas + grupos, ordenados por atividade recente */}
                {salasOrdenadas.length > 0 && (
                  <>
                    <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .7, background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      Conversas
                    </div>
                    {salasOrdenadas.map(s => {
                      const unread    = naoLidasPorSala[s.id] || 0;
                      const isHovered = hoveredRow === s.id;
                      const ultima    = ultimasMsg[s.id];
                      const ehGrupo   = s.tipo === 'grupo';
                      return (
                        <div key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <div
                            className="dm-item-row"
                            style={{
                              padding: '8px 12px', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', gap: 9,
                              background: confirmDelete === s.id ? '#fff7ed' : unread > 0 ? '#eff6ff' : 'transparent',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa'; setHoveredRow(s.id); }}
                            onMouseLeave={e => { e.currentTarget.style.background = confirmDelete === s.id ? '#fff7ed' : unread > 0 ? '#eff6ff' : 'transparent'; setHoveredRow(null); }}
                          >
                            <div onClick={() => abrirSala(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                              {ehGrupo ? <GroupIcon size={32} /> : <Avatar nome={nomeDireto(s)} size={32} bg='#dbeafe' color='#1d4ed8' />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: unread > 0 ? 700 : 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {nomeSala(s)}
                                  </span>
                                  {ultima && (
                                    <span style={{ fontSize: 9, color: unread > 0 ? '#3b82f6' : '#b0bac5', fontWeight: unread > 0 ? 700 : 400, flexShrink: 0 }}>
                                      {fmtHoraLista(ultima.criado_em)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: unread > 0 ? '#1e293b' : '#94a3b8', fontWeight: unread > 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ultima ? previewMsg(ultima) : (ehGrupo ? 'Grupo criado' : 'Nenhuma mensagem ainda')}
                                </div>
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
                              onClick={e => { e.stopPropagation(); setConfirmDelete(confirmDelete === s.id ? null : s.id); }}
                              title={ehGrupo ? 'Sair do grupo' : 'Apagar conversa'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: confirmDelete === s.id ? '#ef4444' : '#94a3b8',
                                fontSize: 13, padding: '2px 5px', borderRadius: 5, flexShrink: 0,
                                opacity: (isHovered || confirmDelete === s.id) ? 1 : 0,
                                transition: 'color .15s',
                              }}>
                              🗑️
                            </button>
                          </div>

                          {confirmDelete === s.id && (
                            <div style={{ padding: '6px 14px 8px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, color: '#b91c1c', flex: 1 }}>
                                {ehGrupo ? 'Sair deste grupo?' : 'Apagar esta conversa e todas as mensagens?'}
                              </span>
                              <button onClick={() => { if (ehGrupo) { setSalaAtiva(s); salaAtivaRef.current = s; sairDoGrupo(); } else deletarSala(s.id); }} style={{
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
                {(usuariosParaNovaDM.length > 0 || (busca && salasOrdenadas.length === 0)) && (
                  <>
                    <div style={{
                      padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8',
                      textTransform: 'uppercase', letterSpacing: .7, background: '#f8fafc',
                      borderTop: salasOrdenadas.length > 0 ? '2px solid #e8ecf0' : 'none',
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
                {salas.length === 0 && usuariosVisiveis.length === 0 && !busca && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40 }}>
                    Nenhum usuário disponível
                  </div>
                )}
                {salas.length === 0 && usuariosParaNovaDM.length === 0 && !busca && usuariosVisiveis.length > 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40 }}>
                    Todas as conversas iniciadas!
                  </div>
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

                            {/* Referência a processo/demanda — cartão clicável */}
                            {m.ref_contexto_id && (
                              <div onClick={() => abrirReferencia(m)} style={{
                                background: proprio ? '#0d5c56' : '#fff', border: `1px solid ${proprio ? 'rgba(255,255,255,.25)' : '#e2e8f0'}`,
                                borderRadius: '12px 12px 4px 12px', padding: '9px 11px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
                                boxShadow: '0 1px 2px rgba(0,0,0,.06)',
                              }}>
                                <span style={{ fontSize: 18 }}>{REF_TIPOS.find(r => r.contexto === m.ref_contexto)?.icone || '🔗'}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, color: proprio ? '#99f6e4' : '#64748b' }}>
                                    {m.ref_contexto === 'licitacao' ? 'Licitação' : 'CRM'}
                                  </div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: proprio ? '#fff' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.ref_desc}
                                  </div>
                                </div>
                                <span style={{ fontSize: 10, color: proprio ? '#99f6e4' : '#0f766e', fontWeight: 700 }}>Abrir →</span>
                              </div>
                            )}

                            {/* Anexo */}
                            {m.anexo_url && (
                              ehImagem(m.anexo_tipo) ? (
                                <a href={m.anexo_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 2 }}>
                                  <img src={m.anexo_url} alt={m.anexo_nome} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 10, display: 'block', objectFit: 'cover' }} />
                                </a>
                              ) : (
                                <a href={m.anexo_url} target="_blank" rel="noreferrer" style={{
                                  display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                                  background: proprio ? '#0d5c56' : '#fff', border: `1px solid ${proprio ? 'rgba(255,255,255,.25)' : '#e2e8f0'}`,
                                  borderRadius: '12px 12px 4px 12px', padding: '9px 11px', marginBottom: 2,
                                }}>
                                  <span style={{ fontSize: 16 }}>📄</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: proprio ? '#fff' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.anexo_nome}
                                  </span>
                                </a>
                              )
                            )}

                            {/* Texto (se houver) */}
                            {m.texto && (
                              <div style={{
                                background: proprio ? '#0f766e' : '#f1f5f9',
                                color: proprio ? 'white' : '#1e293b',
                                padding: '8px 12px',
                                borderRadius: proprio ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word',
                                opacity: m._temp ? 0.55 : 1, transition: 'opacity .2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,.06)',
                              }}>
                                <Linkify text={m.texto} />
                              </div>
                            )}
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
              <div style={{ padding: '10px 12px', borderTop: '1px solid #e8ecf0', display: 'flex', gap: 6, flexShrink: 0, background: '#fafafa', alignItems: 'center' }}>
                <input ref={anexoInputRef} type="file" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); }} />
                <button onClick={() => anexoInputRef.current?.click()} disabled={enviandoAnexo} title="Anexar arquivo"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, padding: 4, color: '#64748b', flexShrink: 0, opacity: enviandoAnexo ? .5 : 1 }}>
                  📎
                </button>
                <button onClick={() => setModalCompartilhar(true)} title="Compartilhar processo/licitação"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4, color: '#64748b', flexShrink: 0 }}>
                  🔗
                </button>
                <input ref={inputRef}
                  style={{
                    flex: 1, padding: '9px 14px', fontSize: 12,
                    border: '1.5px solid #d1d5db', borderRadius: 22,
                    outline: 'none', color: '#1e293b', background: 'white',
                    colorScheme: 'light', transition: 'border-color .15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#0f766e')}
                  onBlur={e  => (e.target.style.borderColor = '#d1d5db')}
                  placeholder={enviandoAnexo ? 'Enviando anexo…' : 'Mensagem… (Enter para enviar)'}
                  value={texto}
                  disabled={enviandoAnexo}
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

      {/* ── MODAL: Novo Grupo ── */}
      {modalNovoGrupo && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9700 }}
          onClick={e => { if (e.target === e.currentTarget) setModalNovoGrupo(false); }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 320, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>👥 Novo Grupo</div>
            <div style={{ padding: '12px 16px' }}>
              <label style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Nome do grupo</label>
              <input value={novoGrupoNome} onChange={e => setNovoGrupoNome(e.target.value)} placeholder="Ex: Equipe Produção"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ padding: '0 16px 6px', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
              Participantes ({novoGrupoMembros.size} selecionado{novoGrupoMembros.size !== 1 ? 's' : ''})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', minHeight: 120 }}>
              {usuariosVisiveis.map(u => {
                const id = String(u.id || u.email);
                const sel = novoGrupoMembros.has(id);
                return (
                  <div key={id} onClick={() => toggleNovoGrupoMembro(id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: sel ? '#f0fdfa' : 'transparent' }}>
                    <input type="checkbox" checked={sel} onChange={() => {}} style={{ pointerEvents: 'none' }} />
                    <Avatar nome={u.nome} size={26} />
                    <span style={{ fontSize: 11, color: '#1e293b', fontWeight: sel ? 700 : 500 }}>{u.nome}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
              <button onClick={criarGrupo} disabled={!novoGrupoNome.trim() || novoGrupoMembros.size === 0}
                style={{ flex: 1, background: (!novoGrupoNome.trim() || novoGrupoMembros.size === 0) ? '#e2e8f0' : '#0f766e', color: (!novoGrupoNome.trim() || novoGrupoMembros.size === 0) ? '#94a3b8' : '#fff', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Criar Grupo
              </button>
              <button onClick={() => { setModalNovoGrupo(false); setNovoGrupoNome(''); setNovoGrupoMembros(new Set()); }}
                style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Info do Grupo ── */}
      {modalInfoGrupo && salaAtiva?.tipo === 'grupo' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9700 }}
          onClick={e => { if (e.target === e.currentTarget) setModalInfoGrupo(false); }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 320, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <GroupIcon size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{nomeSala(salaAtiva)}</div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>Criado por {salaAtiva.criado_por_nome || '—'}</div>
              </div>
            </div>
            <div style={{ padding: '10px 16px 4px', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
              {(salaAtiva.membros || []).length} participantes
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
              {(salaAtiva.membros || []).map((m: any) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px' }}>
                  <Avatar nome={m.nome} size={28} />
                  <span style={{ fontSize: 11, color: '#1e293b', flex: 1 }}>
                    {m.nome}{String(m.id) === String(salaAtiva.criado_por) && <span style={{ color: '#0f766e', fontWeight: 700 }}> · admin</span>}
                  </span>
                  {souAdmin(salaAtiva) && String(m.id) !== uid && (
                    <button onClick={() => removerMembroGrupo(m.id)} title="Remover do grupo"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                  )}
                </div>
              ))}
            </div>
            {souAdmin(salaAtiva) && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9' }}>
                <input value={addMembroBusca} onChange={e => setAddMembroBusca(e.target.value)} placeholder="+ Adicionar participante..."
                  style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, boxSizing: 'border-box', marginBottom: 4 }} />
                {addMembroBusca.trim().length > 0 && usuariosVisiveis
                  .filter(u => !(salaAtiva.membros || []).some((m: any) => String(m.id) === String(u.id || u.email)))
                  .filter(u => (u.nome || '').toLowerCase().includes(addMembroBusca.toLowerCase()))
                  .slice(0, 5)
                  .map(u => (
                    <div key={u.id || u.email} onClick={() => { adicionarMembroGrupo(u); setAddMembroBusca(''); }}
                      className="chat-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: 'pointer' }}>
                      <Avatar nome={u.nome} size={22} />
                      <span style={{ fontSize: 11, color: '#1e293b' }}>{u.nome}</span>
                    </div>
                  ))}
              </div>
            )}
            <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
              <button onClick={sairDoGrupo} style={{ flex: 1, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                🚪 Sair do grupo
              </button>
              <button onClick={() => setModalInfoGrupo(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Compartilhar processo ── */}
      {modalCompartilhar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9700 }}
          onClick={e => { if (e.target === e.currentTarget) { setModalCompartilhar(false); setCompartilharBusca(''); setCompartilharResultados([]); } }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 320, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>🔗 Compartilhar Processo</div>
            <div style={{ padding: '10px 16px' }}>
              <input value={compartilharBusca} onChange={e => buscarParaCompartilhar(e.target.value)}
                placeholder="Buscar licitação ou oportunidade CRM..." autoFocus
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>Busca em Licitações e Comercial/CRM</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px', minHeight: 100 }}>
              {compartilharBuscando && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 16 }}>Buscando...</div>}
              {!compartilharBuscando && compartilharBusca.trim().length >= 2 && compartilharResultados.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 16 }}>Nada encontrado</div>
              )}
              {compartilharResultados.map((r, i) => (
                <div key={i} onClick={() => compartilharRegistro(r)} className="chat-row-hover"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px', borderRadius: 6, cursor: 'pointer' }}>
                  <span style={{ fontSize: 18 }}>{r._tipo.icone}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{r._tipo.contexto === 'licitacao' ? 'Licitação' : 'CRM'}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r._tipo.label(r)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => { setModalCompartilhar(false); setCompartilharBusca(''); setCompartilharResultados([]); }}
                style={{ width: '100%', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
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
