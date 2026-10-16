// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import Linkify from './Linkify';
import { normalizarBusca, combinaBusca, buscarPorPalavras } from './SearchUtils';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa } from './Interface';

const BROADCAST_CH = 'acn-chat-v1';

// Contextos com deep-link já funcionando (window.__acnDeepLink + acn:abrir-registro)
// que dá pra compartilhar via chat com abertura direta no processo.
// 7.x (13/10/2026): a busca passou a usar as colunas "_norm" (sem acento) e o utilitário do projeto, que também tira os caracteres que quebram o filtro do banco.
const REF_TIPOS = [
  { contexto: 'licitacao', aba: 'licitacoes', tabela: 'licitacoes',        campos: 'id,numero,nome_projeto,orgao', colunasBusca: ['nome_projeto_norm', 'orgao_norm'], label: (r: any) => `${r.numero || '—'} — ${r.nome_projeto || r.orgao || ''}`, icone: '🏛️' },
  { contexto: 'crm',       aba: 'crm',        tabela: 'crm_oportunidades', campos: 'id,titulo,orgao',              colunasBusca: ['titulo_norm', 'orgao_norm'],       label: (r: any) => r.titulo || r.orgao || '—', icone: '💼' },
];

// 12e62 (13/10/2026): o tamanho e o tom saem por atributo (data-t, data-tom) e o desenho fica no design.css — antes eram estilos soltos aqui dentro.
function Avatar({ nome, size = 26, tom }: any) {
  return <span className="acn-chat-av" data-t={size} data-tom={tom}>{(nome || '?')[0].toUpperCase()}</span>;
}

function GroupIcon({ size = 26 }: any) {
  return <span className="acn-chat-gi" data-t={size}>👥</span>;
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
  const [compartilharErro, setCompartilharErro] = useState<string | null>(null);

  // 7.x (13/10/2026) — falhas que antes passavam em silêncio: a leitura que falha não pode parecer "lista vazia" nem "conversa nova".
  const [erroSalas, setErroSalas]         = useState<string | null>(null);
  const [erroUsuarios, setErroUsuarios]   = useState<string | null>(null);
  const [erroMensagens, setErroMensagens] = useState<string | null>(null);
  const [criandoGrupo, setCriandoGrupo]   = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const erroSalasRef      = useRef<string | null>(null);   // a leitura de 5 em 5 s tenta de novo sozinha enquanto estiver com erro
  const erroUsuariosRef   = useRef<string | null>(null);
  const criandoGrupoRef   = useRef(false);                 // trava o clique duplo em "Criar Grupo"
  const abrindoConversaRef = useRef(false);                // trava o clique duplo numa pessoa da lista "Nova conversa"
  const buscaSeqRef       = useRef(0);                     // descarta a resposta de uma busca que já foi superada por outra
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

  // Apagar "para todos" (pedido do usuário em 05/10/2026, como o WhatsApp): só quem enviou, e só enquanto a mensagem é recente (48 h).
  // A mensagem não sai do banco — fica marcada (apagada_em / anexo_apagado_em) e a tela mostra "mensagem apagada" para todos.
  const JANELA_APAGAR_MS = 48 * 60 * 60 * 1000;
  const podeApagar = (m: any) => !m._temp && !m.apagada_em && String(m.remetente_id) === uid
    && (Date.now() - new Date(m.criado_em).getTime()) <= JANELA_APAGAR_MS;
  const apagarMensagem = async (m: any, soAnexo = false) => {
    if (!podeApagar(m)) { mostrarAviso('Só dá para apagar a sua mensagem em até 2 dias depois de enviada.', 'atencao'); return; }
    const pergunta = soAnexo
      ? `Apagar só o anexo "${m.anexo_nome || ''}" para todos?\n\nO texto da mensagem continua.`
      : 'Apagar esta mensagem para todos?\n\nAs outras pessoas passam a ver "Esta mensagem foi apagada".';
    if (!await confirmar(pergunta)) return;
    const agora = new Date().toISOString();
    const marca = soAnexo ? { anexo_apagado_em: agora } : { apagada_em: agora, apagada_por: uid };
    const { error } = await supabase.from('chat_mensagens').update(marca).eq('id', m.id).eq('remetente_id', uid);
    if (error) { mostrarAviso('Não foi possível apagar: ' + error.message, 'erro'); return; }
    setMensagens(prev => prev.map((x: any) => x.id === m.id ? { ...x, ...marca } : x));
    atualizarContadorEPreview();
  };

  // Texto de prévia da última mensagem (estilo WhatsApp: "Você: ...", anexo/
  // referência viram um rótulo curto em vez do texto cru).
  const previewMsg = (m: any) => {
    if (!m) return '';
    const prefixo = String(m.remetente_id) === uid ? 'Você: ' : '';
    if (m.apagada_em) return `${prefixo}🚫 Mensagem apagada`;
    if (m.ref_desc) return `${prefixo}🔗 ${m.ref_desc}`;
    if (m.anexo_nome) return `${prefixo}📎 ${m.anexo_nome}`;
    return `${prefixo}${m.texto || ''}`;
  };

  // ── Dados derivados ───────────────────────────────────────────────────────
  const buscaL = normalizarBusca(busca);

  // Lista unificada (diretos + grupos), ordenada por atividade mais recente
  // primeiro — igual WhatsApp. O badge/negrito continuam sinalizando não-lida,
  // mas não reordenam mais a lista.
  const salasOrdenadas = [...salas]
    .filter(s => !busca || combinaBusca(nomeSala(s), busca))
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
    return combinaBusca([u.nome, u.email], busca);
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
        .select('id,sala_id,remetente_id,remetente_nome,texto,anexo_nome,ref_desc,criado_em,apagada_em')
        .in('sala_id', idsMinhasSalas)
        .order('criado_em', { ascending: false })
        .limit(500);
      // 7.x (13/10/2026): leitura que falha não zera o contador (antes o selo sumia e, na volta, o aviso e o som disparavam de novo por mensagens já conhecidas); -1 = "sem referência ainda".
      if (res.error || !res.data) return -1;
      data = res.data;
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
    // 7.x (13/10/2026): se a lista de conversas ou de pessoas falhou ao carregar, tenta de novo a cada volta (antes ficava vazia até recarregar a página).
    if (erroSalasRef.current) fetchSalas();
    if (erroUsuariosRef.current) fetchUsuarios();
    const idsMinhasSalas = salasRef.current.map((s: any) => s.id);
    if (idsMinhasSalas.length === 0) { setNaoLidas(0); setNaoLidasPorSala({}); prevCountRef.current = 0; return; }
    const { data, error } = await supabase.from('chat_mensagens')
      .select('id,sala_id,remetente_id,remetente_nome,texto,anexo_nome,ref_desc,criado_em,apagada_em')
      .in('sala_id', idsMinhasSalas)
      .order('criado_em', { ascending: false })
      .limit(500);
    if (error || !data) return;   // 7.x: leitura que falha mantém o contador que já estava (ver atualizarContadorEPreview)

    const todas = data;
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
          setToast({ sala, remetente_nome: latest.remetente_nome, texto: latest.texto || latest.anexo_nome || latest.ref_desc || '' });   // 7.x: mensagem só com anexo ou processo também diz o que é (o aviso que chega pelo canal ao vivo já dizia)
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
      const { data, error } = await supabase.from('chat_mensagens')
        .select('*').eq('sala_id', salaId).order('criado_em');
      if (error || !data) return;
      setErroMensagens(null);   // 7.x: a leitura voltou — some a faixa de "não foi possível carregar as mensagens"
      setMensagens(prev => {
        const real = prev.filter((m: any) => !m._temp);
        // Assinatura: quantas mensagens e quantas apagadas (mensagem ou anexo). Apagar não muda a contagem, então só ela não bastava (05/10/2026).
        const assinatura = (l: any[]) => l.length + ':' + l.filter((m: any) => m.apagada_em || m.anexo_apagado_em).length;
        if (assinatura(data) === assinatura(real) || data.length < real.length) return prev;
        const ultima = data.at(-1);
        if (data.length > real.length) markRead(salaId, ultima?.criado_em);
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
    const { data, error } = await supabase.from('chat_salas').select('*').in('tipo', ['direto', 'grupo']);
    // 7.x (13/10/2026): leitura que falha não esvazia a lista (antes a tela mostrava "nenhuma conversa" e o selo de não lidas zerava, sem aviso): mantém o que já estava e mostra a faixa com "Tentar de novo".
    if (error || !data) { erroSalasRef.current = error?.message || 'sem resposta'; setErroSalas(erroSalasRef.current); return salasRef.current; }
    erroSalasRef.current = null; setErroSalas(null);
    const minhas = data.filter(s => (s.membros || []).some((m: any) => String(m.id) === uid));

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
      // 7.x (13/10/2026): erro de leitura não troca a lista de pessoas por uma lista vazia/parcial (antes "Nova conversa" ficava sem ninguém e sem explicação).
      if (error) { erroUsuariosRef.current = error.message; setErroUsuarios(error.message); return; }
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    erroUsuariosRef.current = null; setErroUsuarios(null);
    setUsuarios(all.filter(u => String(u.id || u.email) !== uid));
  };

  // Nomes (maiúsculo/trim) de quem está Afastado ou de Férias agora — casa
  // por NOME com auth_usuarios porque rh_funcionarios.usuario_id não vem
  // preenchido nos cadastros existentes (e-mails também divergem às vezes).
  const fetchAusentes = async () => {
    // 14/10/2026 (Etapa 17b): lê a visão rh_funcionarios_basico (só nome, cargo, departamento, situação e comissão) em vez da tabela inteira, que traz CPF e salário e vai fechar para quem não é do RH
    const { data } = await supabase.from('rh_funcionarios_basico')
      .select('nome,status_presenca').in('status_presenca', ['Afastado', 'Férias']);
    setAusentesNomes(new Set((data || []).map((f: any) => (f.nome || '').trim().toUpperCase())));
  };

  const fetchMensagens = async (salaId: string) => {
    const { data, error } = await supabase.from('chat_mensagens')
      .select('*').eq('sala_id', salaId).order('criado_em');
    // 7.x (13/10/2026): leitura que falha não vira "Nenhuma mensagem ainda. Diga olá!" nem marca como lido o que a pessoa não viu: mostra a faixa com "Tentar de novo" (e a leitura de 2 em 2 s também tenta).
    if (error || !data) { setErroMensagens(error?.message || 'sem resposta'); return; }
    setErroMensagens(null);
    setMensagens(data);
    const ultima = data.at(-1);
    markRead(salaId, ultima?.criado_em);
    atualizarContadorEPreview();
  };

  // ── Abrir sala ────────────────────────────────────────────────────────────
  const abrirSala = async (sala: any) => {
    setSalaAtiva(sala);
    salaAtivaRef.current = sala;
    setMensagens([]);
    setErroMensagens(null);
    setView('sala');
    setToast(null);
    // 7.x (13/10/2026): quem marca a conversa como lida agora é fetchMensagens, depois de ler as mensagens de verdade (antes marcava aqui, antes de ler, e uma leitura que falhava deixava tudo "lido" sem a pessoa ter visto).
    await fetchMensagens(sala.id);
  };

  const voltarLista = () => {
    setSalaAtiva(null);
    salaAtivaRef.current = null;
    setMensagens([]);
    setErroMensagens(null);
    setView('lista');
    setModalInfoGrupo(false);
  };

  const abrirDireto = async (usuario: any) => {
    // 7.x (13/10/2026): clique duplo na mesma pessoa criava duas conversas (a lista só mostra a mais recente, e as mensagens se dividiam).
    if (abrindoConversaRef.current) return;
    abrindoConversaRef.current = true;
    try {
      const outroId   = String(usuario.id || usuario.email);
      const outroNome = usuario.nome || usuario.email;
      const { data: todas, error: erroLer } = await supabase.from('chat_salas').select('*').eq('tipo', 'direto');
      // 7.x: se a leitura falha não dá para saber se a conversa já existe — antes criava uma duplicada (e o histórico antigo sumia da lista).
      if (erroLer || !todas) { mostrarAviso('Não foi possível abrir a conversa: ' + (erroLer?.message || 'sem resposta do servidor') + '.', 'erro'); return; }
      const existente = todas.find(s => {
        const ids = (s.membros || []).map((m: any) => String(m.id));
        return ids.includes(uid) && ids.includes(outroId);
      });
      if (existente) { await abrirSala(existente); return; }
      const { data: nova, error: erroNova } = await supabase.from('chat_salas').insert([{
        tipo: 'direto', nome: null,
        membros: [{ id: uid, nome: unome }, { id: outroId, nome: outroNome }],
      }]).select().single();
      if (erroNova || !nova) { mostrarAviso('Não foi possível iniciar a conversa: ' + (erroNova?.message || 'sem resposta do servidor') + '.', 'erro'); return; }
      fetchSalas(); await abrirSala(nova);
    } finally {
      abrindoConversaRef.current = false;
    }
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
    // 7.x (13/10/2026): clique duplo criava dois grupos iguais; e a falha de gravação fechava a janela e apagava o nome e os participantes sem avisar.
    if (!novoGrupoNome.trim() || novoGrupoMembros.size === 0 || criandoGrupoRef.current) return;
    criandoGrupoRef.current = true; setCriandoGrupo(true);
    const membrosSel = usuariosVisiveis
      .filter(u => novoGrupoMembros.has(String(u.id || u.email)))
      .map(u => ({ id: String(u.id || u.email), nome: u.nome || u.email }));
    const { data: novo, error } = await supabase.from('chat_salas').insert([{
      tipo: 'grupo', nome: novoGrupoNome.trim(),
      membros: [{ id: uid, nome: unome }, ...membrosSel],
      criado_por: uid, criado_por_nome: unome,
    }]).select().single();
    criandoGrupoRef.current = false; setCriandoGrupo(false);
    if (error || !novo) { mostrarAviso('Não foi possível criar o grupo: ' + (error?.message || 'sem resposta do servidor') + '. O nome e os participantes continuam na janela.', 'erro'); return; }
    setModalNovoGrupo(false);
    setNovoGrupoNome('');
    setNovoGrupoMembros(new Set());
    await fetchSalas(); await abrirSala(novo);
  };

  const atualizarMembrosGrupo = async (novosMembros: any[]) => {
    if (!salaAtiva) return;
    const { data, error } = await supabase.from('chat_salas')
      .update({ membros: novosMembros }).eq('id', salaAtiva.id).select().single();
    // 7.x (13/10/2026): antes, se a gravação falhasse a janela continuava igual, sem aviso, e a pessoa achava que tinha adicionado/removido.
    if (error || !data) { mostrarAviso('Não foi possível atualizar os participantes: ' + (error?.message || 'sem resposta do servidor') + '.', 'erro'); return; }
    setSalaAtiva(data); salaAtivaRef.current = data; fetchSalas();
  };

  const removerMembroGrupo = async (id: string) => {
    const quem = (salaAtiva.membros || []).find((m: any) => String(m.id) === String(id));
    if (!await confirmarRemocao((quem?.nome ? '"' + quem.nome + '"' : 'este membro') + ' do grupo')) return;
    const novos = (salaAtiva.membros || []).filter((m: any) => String(m.id) !== String(id));
    atualizarMembrosGrupo(novos);
  };

  const adicionarMembroGrupo = (u: any) => {
    const id = String(u.id || u.email);
    if ((salaAtiva.membros || []).some((m: any) => String(m.id) === id)) return;
    atualizarMembrosGrupo([...(salaAtiva.membros || []), { id, nome: u.nome || u.email }]);
  };

  // 7.x (13/10/2026): a sala vai como argumento. A lista chamava esta função logo depois de "ativar" a sala, mas a função ainda enxergava a sala nula e saía sem fazer nada — a pessoa tinha de clicar "Sim" duas vezes, e entre os dois cliques a sala ficava "ativa" por baixo
  // (a leitura de 2 em 2 s corria, o aviso e o som do grupo ficavam mudos e as mensagens novas entravam como lidas). "jaConfirmado": o "Sim" da lista já é a confirmação, então não pergunta de novo.
  const sairDoGrupo = async (sala: any = salaAtiva, jaConfirmado = false) => {
    if (!sala) return;
    if (!jaConfirmado && !await confirmar(`Sair do grupo "${nomeSala(sala)}"?`)) return;
    const novos = (sala.membros || []).filter((m: any) => String(m.id) !== uid);
    const { error } = await supabase.from('chat_salas').update({ membros: novos }).eq('id', sala.id);
    if (error) { mostrarAviso('Não foi possível sair do grupo: ' + error.message + '.', 'erro'); return; }   // antes a tela agia como se tivesse saído
    setModalInfoGrupo(false);
    setConfirmDelete(null);
    await fetchSalas();
    if (salaAtivaRef.current?.id === sala.id) voltarLista();
  };

  // ── Enviar mensagem (texto / anexo / referência) ────────────────────────
  const inserirEEnviar = async (extra: any, textoTemp?: string) => {
    if (!salaAtiva) return null;
    if (enviando) { mostrarAviso('Aguarde a mensagem anterior terminar de enviar e tente de novo.', 'atencao'); return null; }
    setEnviando(true);

    const tempId = 'temp-' + Date.now();
    setMensagens(prev => [...prev, {
      id: tempId, _temp: true, sala_id: salaAtiva.id,
      remetente_id: uid, remetente_nome: unome,
      texto: textoTemp || '', lida_por: [], criado_em: new Date().toISOString(),
      ...extra,
    }]);

    const { data: inserido, error } = await supabase.from('chat_mensagens').insert([{
      sala_id: salaAtiva.id, remetente_id: uid,
      remetente_nome: unome, texto: textoTemp || '', lida_por: [],
      ...extra,
    }]).select().single();

    // 7.x (13/10/2026): se a gravação falhava, a bolha ficava para sempre como "enviando…" (a leitura de 2 em 2 s a mantém) e o texto já tinha saído da caixa, sem nenhum aviso.
    // Agora a bolha some, quem chamou devolve o texto à caixa e a pessoa é avisada.
    if (error || !inserido) {
      setMensagens(prev => prev.filter(m => m.id !== tempId));
      setEnviando(false);
      mostrarAviso('Não foi possível enviar a mensagem: ' + (error?.message || 'sem resposta do servidor') + '.', 'erro');
      return null;
    }
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
    // 7.x (13/10/2026): com uma mensagem ainda gravando, a segunda era apagada da caixa e nunca enviada (a trava do envio devolvia sem avisar). Agora o texto fica na caixa até dar para enviar.
    if (!texto.trim() || enviando) return;
    const txt = texto.trim();
    setTexto('');
    const enviada = await inserirEEnviar({ texto: txt }, txt);
    if (!enviada) setTexto(atual => atual ? txt + ' ' + atual : txt);   // falhou: o texto volta à caixa (antes se perdia)
    inputRef.current?.focus();
  };

  // ── Fase 4: anexo ─────────────────────────────────────────────────────────
  const enviarAnexo = async (file: File) => {
    if (!salaAtiva) return;
    // 7.x (13/10/2026): o campo de arquivo só era limpo no caminho que dava certo; depois de um erro (arquivo grande, falha no envio), escolher o MESMO arquivo de novo não fazia nada.
    const limparCampo = () => { if (anexoInputRef.current) anexoInputRef.current.value = ''; };
    if (file.size > 15 * 1024 * 1024) { alert(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 15 MB.`); limparCampo(); return; }
    setEnviandoAnexo(true);
    const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `chat/${salaAtiva.id}/${Date.now()}_${nomeLimpo}`;
    const { error: errUp } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (errUp) { alert('Não foi possível enviar o anexo: ' + explicarErroDeEnvio(errUp, file)); setEnviandoAnexo(false); limparCampo(); return; }
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    await inserirEEnviar({ anexo_url: pub?.publicUrl || null, anexo_nome: file.name, anexo_tipo: file.type || null });
    setEnviandoAnexo(false);
    limparCampo();
  };

  // ── Fase 5: compartilhar processo/demanda ───────────────────────────────
  // 7.x (13/10/2026): a busca montava o filtro com o texto cru — uma vírgula ou parêntese ("Prefeitura de X, SC") quebrava o filtro do banco e a tela dizia "Nada encontrado"; não ignorava acento; uma resposta lenta de uma digitação anterior
  // sobrescrevia a mais nova; e o erro de leitura também virava "Nada encontrado". Agora usa o utilitário do projeto (palavras em qualquer ordem, colunas sem acento, caracteres perigosos tirados), descarta resposta velha e mostra o erro.
  const buscarParaCompartilhar = async (texto: string) => {
    setCompartilharBusca(texto);
    const minha = ++buscaSeqRef.current;
    if (texto.trim().length < 2) { setCompartilharResultados([]); setCompartilharErro(null); setCompartilharBuscando(false); return; }
    setCompartilharBuscando(true);
    setCompartilharErro(null);
    const todos: any[] = [];
    let erro: string | null = null;
    for (const rt of REF_TIPOS) {
      const { data, error } = await buscarPorPalavras(supabase.from(rt.tabela).select(rt.campos), rt.colunasBusca, texto).limit(6);
      if (error) { erro = error.message; continue; }
      (data || []).forEach((r: any) => todos.push({ ...r, _tipo: rt }));
    }
    if (minha !== buscaSeqRef.current) return;   // a pessoa já digitou outra coisa: esta resposta é velha
    setCompartilharResultados(todos);
    setCompartilharErro(erro);
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
    const { error } = await supabase.from('chat_salas').delete().eq('id', salaId);
    // 7.x (13/10/2026): a conversa saía da lista mesmo com a exclusão recusada e voltava na leitura seguinte, sem explicação.
    if (error) { mostrarAviso('Não foi possível apagar a conversa: ' + error.message + '.', 'erro'); return; }
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
    <div className="acn-chat-raiz">

      {/* ── Aviso de mensagem nova ── */}
      {toast && (
        <div className="acn-chat-aviso" onClick={() => abrirViaToast(toast)}>
          <div className="acn-chat-aviso-topo">
            <span className="acn-chat-aviso-sala">
              🔔 {nomeSala(toast.sala)}
            </span>
            <div className="acn-chat-aviso-acoes">
              <Botao variante="discreto" pequeno className="acn-chat-b acn-chat-mini acn-chat-aviso-sino" data-mudo={mutado ? '1' : undefined}
                onClick={e => { e.stopPropagation(); toggleMudo(); }}
                title={mutado ? 'Ativar som' : 'Silenciar'}>
                {mutado ? '🔕' : '🔔'}
              </Botao>
              <Botao variante="discreto" pequeno className="acn-chat-b acn-chat-mini acn-chat-aviso-x"
                onClick={e => { e.stopPropagation(); setToast(null); }}>✕</Botao>
            </div>
          </div>
          <div className="acn-chat-aviso-nome">{toast.remetente_nome}</div>
          <div className="acn-chat-aviso-texto">
            {toast.texto}
          </div>
          <div className="acn-chat-aviso-dica">Clique para abrir a conversa</div>
        </div>
      )}

      {/* ── Painel principal ── */}
      {aberto && (
        <div className="acn-chat-painel">

          {/* Header */}
          <div className="acn-chat-cab">
            {view === 'sala' ? (
              <>
                <Botao variante="discreto" className="acn-chat-b acn-chat-cab-bt acn-chat-cab-voltar" onClick={voltarLista}>←</Botao>
                {salaAtiva?.tipo === 'grupo' ? <GroupIcon size={24} /> : <Avatar nome={nomeDireto(salaAtiva)} size={24} tom="azul" />}
                <div className="acn-chat-cab-info" data-grupo={salaAtiva?.tipo === 'grupo' ? '1' : undefined}
                  onClick={() => salaAtiva?.tipo === 'grupo' && setModalInfoGrupo(true)}>
                  <div className="acn-chat-cab-nome">
                    {nomeSala(salaAtiva)}
                  </div>
                  {salaAtiva?.tipo === 'grupo' && (
                    <div className="acn-chat-cab-sub">{(salaAtiva.membros || []).length} participantes · toque para ver</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="acn-chat-cab-titulo">💬 Chat ACN</span>
                <Botao variante="secundario" className="acn-chat-cab-novo" onClick={() => setModalNovoGrupo(true)} title="Novo grupo">
                  👥+
                </Botao>
              </>
            )}
            <Botao variante="discreto" className="acn-chat-b acn-chat-cab-bt acn-chat-cab-sino" data-mudo={mutado ? '1' : undefined}
              onClick={toggleMudo} title={mutado ? 'Ativar som' : 'Silenciar'}>
              {mutado ? '🔕' : '🔔'}
            </Botao>
            <Botao variante="discreto" className="acn-chat-b acn-chat-cab-bt acn-chat-cab-x" onClick={() => setAberto(false)}>✕</Botao>
          </div>

          {/* ── LISTA ── */}
          {view === 'lista' && (
            <div className="acn-chat-lista">

              {/* Campo de busca */}
              <div className="acn-chat-busca">
                <div className="acn-chat-busca-in">
                  <span className="acn-chat-busca-lupa">🔍</span>
                  <input
                    className="acn-chat-busca-campo"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar conversa ou usuário..."
                  />
                  {busca && (
                    <Botao variante="discreto" pequeno className="acn-chat-b acn-chat-busca-limpa" onClick={() => setBusca('')}>
                      ✕
                    </Botao>
                  )}
                </div>
              </div>

              {/* Conteúdo scrollável */}
              <div className="acn-chat-rolagem">
                {/* 7.x (13/10/2026): leitura que falhou aparece como erro, não como "lista vazia" */}
                {(erroSalas || erroUsuarios) && (
                  <div className="acn-chat-erro">
                    <Faixa tom="erro" acao={<Botao pequeno onClick={() => { fetchSalas(); fetchUsuarios(); }}>Tentar de novo</Botao>}>
                      Não foi possível carregar {erroSalas ? 'as conversas' : 'a lista de pessoas'} ({erroSalas || erroUsuarios}).
                    </Faixa>
                  </div>
                )}
                {/* Conversas + grupos, ordenados por atividade recente */}
                {salasOrdenadas.length > 0 && (
                  <>
                    <div className="acn-chat-secao">
                      Conversas
                    </div>
                    {salasOrdenadas.map(s => {
                      const unread    = naoLidasPorSala[s.id] || 0;
                      const ultima    = ultimasMsg[s.id];
                      const ehGrupo   = s.tipo === 'grupo';
                      const nova      = unread > 0 ? '1' : undefined;
                      return (
                        <div key={s.id} className="acn-chat-sala">
                          <div
                            className="acn-chat-linha dm-item-row"
                            data-estado={confirmDelete === s.id ? 'confirma' : unread > 0 ? 'nova' : undefined}
                          >
                            <div className="acn-chat-linha-abrir" onClick={() => abrirSala(s)}>
                              {ehGrupo ? <GroupIcon size={32} /> : <Avatar nome={nomeDireto(s)} size={32} tom="azul" />}
                              <div className="acn-chat-linha-corpo">
                                <div className="acn-chat-linha-topo">
                                  <span className="acn-chat-linha-nome" data-nova={nova}>
                                    {nomeSala(s)}
                                  </span>
                                  {ultima && (
                                    <span className="acn-chat-linha-hora" data-nova={nova}>
                                      {fmtHoraLista(ultima.criado_em)}
                                    </span>
                                  )}
                                </div>
                                <div className="acn-chat-linha-previa" data-nova={nova}>
                                  {ultima ? previewMsg(ultima) : (ehGrupo ? 'Grupo criado' : 'Nenhuma mensagem ainda')}
                                </div>
                              </div>
                              {unread > 0 && (
                                <span className="acn-chat-linha-n">{unread}</span>
                              )}
                            </div>
                            <Botao variante="discreto" pequeno
                              className="acn-chat-b dm-del-btn acn-chat-lixeira"
                              data-confirma={confirmDelete === s.id ? '1' : undefined}
                              onClick={e => { e.stopPropagation(); setConfirmDelete(confirmDelete === s.id ? null : s.id); }}
                              title={ehGrupo ? 'Sair do grupo' : 'Apagar conversa'}>
                              🗑️
                            </Botao>
                          </div>

                          {confirmDelete === s.id && (
                            <div className="acn-chat-confirma">
                              <span className="acn-chat-confirma-txt">
                                {ehGrupo ? 'Sair deste grupo?' : 'Apagar esta conversa e todas as mensagens?'}
                              </span>
                              <Botao variante="perigo" pequeno className="acn-chat-confirma-bt"
                                onClick={() => { if (ehGrupo) sairDoGrupo(s, true); else deletarSala(s.id); }}>Sim</Botao>
                              <Botao variante="secundario" pequeno className="acn-chat-confirma-bt nao"
                                onClick={() => setConfirmDelete(null)}>Não</Botao>
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
                    <div className="acn-chat-secao" data-sep={salasOrdenadas.length > 0 ? '1' : undefined}>
                      ✉ Nova conversa
                    </div>
                    {usuariosParaNovaDM.length === 0 && busca ? (
                      <div className="acn-chat-vazio curto">
                        Nenhum usuário encontrado
                      </div>
                    ) : (
                      usuariosParaNovaDM.map(u => (
                        <div key={u.id || u.email} onClick={() => abrirDireto(u)} className="acn-chat-pessoa">
                          <Avatar nome={u.nome} size={30} />
                          <div>
                            <div className="acn-chat-pessoa-nome">{u.nome}</div>
                            <div className="acn-chat-pessoa-perfil">{u.perfil}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Estado vazio total */}
                {salas.length === 0 && usuariosVisiveis.length === 0 && !busca && !erroSalas && !erroUsuarios && (
                  <div className="acn-chat-vazio">
                    Nenhum usuário disponível
                  </div>
                )}
                {salas.length === 0 && usuariosParaNovaDM.length === 0 && !busca && usuariosVisiveis.length > 0 && !erroSalas && (
                  <div className="acn-chat-vazio">
                    Todas as conversas iniciadas!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SALA DE MENSAGENS ── */}
          {view === 'sala' && (
            <div className="acn-chat-sala-corpo">
              <div className="acn-chat-msgs">
                {mensagens.length === 0 && erroMensagens && (
                  <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchMensagens(salaAtiva.id)}>Tentar de novo</Botao>}>
                    Não foi possível carregar as mensagens ({erroMensagens}).
                  </Faixa>
                )}
                {mensagens.length === 0 && !erroMensagens && (
                  <div className="acn-chat-vazio sala">
                    👋 Nenhuma mensagem ainda. Diga olá!
                  </div>
                )}
                {agrupar().map(grupo => (
                  <div key={grupo.data}>
                    <div className="acn-chat-dia">
                      <span className="acn-chat-dia-linha" />
                      {grupo.data}
                      <span className="acn-chat-dia-linha" />
                    </div>
                    {grupo.msgs.map((m, i) => {
                      const proprio   = String(m.remetente_id) === uid;
                      const mesmaPess = i > 0 && grupo.msgs[i - 1].remetente_id === m.remetente_id;
                      const meu       = proprio ? '1' : undefined;
                      return (
                        <div key={m.id} className="acn-chat-m" data-proprio={meu} data-seguida={mesmaPess ? '1' : undefined}>
                          {!proprio && (mesmaPess
                            ? <span className="acn-chat-m-vazio" />
                            : <Avatar nome={m.remetente_nome} size={28} />
                          )}
                          <div className="acn-chat-m-col">
                            {!proprio && !mesmaPess && (
                              <div className="acn-chat-m-nome">
                                {m.remetente_nome}
                              </div>
                            )}

                            {/* Mensagem apagada pelo autor (para todos) */}
                            {m.apagada_em && (
                              <div className="acn-chat-apagada">
                                🚫 {proprio ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
                              </div>
                            )}

                            {/* Referência a processo/demanda — cartão clicável */}
                            {!m.apagada_em && m.ref_contexto_id && (
                              <div className="acn-chat-ref" data-proprio={meu} onClick={() => abrirReferencia(m)}>
                                <span className="acn-chat-ref-icone">{REF_TIPOS.find(r => r.contexto === m.ref_contexto)?.icone || '🔗'}</span>
                                <div className="acn-chat-ref-corpo">
                                  <div className="acn-chat-ref-tipo">
                                    {m.ref_contexto === 'licitacao' ? 'Licitação' : 'CRM'}
                                  </div>
                                  <div className="acn-chat-ref-desc">
                                    {m.ref_desc}
                                  </div>
                                </div>
                                <span className="acn-chat-ref-abrir">Abrir →</span>
                              </div>
                            )}

                            {/* Anexo apagado (só o anexo; o texto continua) */}
                            {!m.apagada_em && m.anexo_url && m.anexo_apagado_em && (
                              <div className="acn-chat-apagada anexo">
                                🚫 Anexo apagado
                              </div>
                            )}

                            {/* Anexo */}
                            {!m.apagada_em && m.anexo_url && !m.anexo_apagado_em && (
                              ehImagem(m.anexo_tipo) ? (
                                <a className="acn-chat-img" href={m.anexo_url} target="_blank" rel="noreferrer">
                                  <img src={m.anexo_url} alt={m.anexo_nome} />
                                </a>
                              ) : (
                                <a className="acn-chat-arq" data-proprio={meu} href={m.anexo_url} target="_blank" rel="noreferrer">
                                  <span className="acn-chat-arq-icone">📄</span>
                                  <span className="acn-chat-arq-nome">
                                    {m.anexo_nome}
                                  </span>
                                </a>
                              )
                            )}

                            {/* Texto (se houver) */}
                            {!m.apagada_em && m.texto && (
                              <div className="acn-chat-balao" data-proprio={meu} data-temp={m._temp ? '1' : undefined}>
                                <Linkify text={m.texto} />
                              </div>
                            )}
                            <div className="acn-chat-hora" data-proprio={meu}>
                              {m._temp ? '⏳ enviando…' : fmtHora(m.criado_em)}
                              {podeApagar(m) && (
                                <>
                                  {' · '}
                                  <span role="button" tabIndex={0} aria-label="Apagar mensagem" title="Apagar para todos (até 2 dias depois de enviada)"
                                    className="acn-chat-apagar"
                                    onClick={() => apagarMensagem(m)} onKeyDown={e => { if (e.key === 'Enter') apagarMensagem(m); }}>Apagar</span>
                                  {m.anexo_url && !m.anexo_apagado_em && m.texto && (
                                    <>
                                      {' · '}
                                      <span role="button" tabIndex={0} aria-label="Apagar só o anexo" title="Apagar só o anexo para todos"
                                        className="acn-chat-apagar"
                                        onClick={() => apagarMensagem(m, true)} onKeyDown={e => { if (e.key === 'Enter') apagarMensagem(m, true); }}>Apagar só o anexo</span>
                                    </>
                                  )}
                                </>
                              )}
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
              <div className="acn-chat-entrada">
                <input ref={anexoInputRef} type="file" className="acn-chat-arquivo"
                  onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); }} />
                <Botao variante="discreto" className="acn-chat-b acn-chat-ic" onClick={() => anexoInputRef.current?.click()} disabled={enviandoAnexo} title="Anexar arquivo">
                  📎
                </Botao>
                <Botao variante="discreto" className="acn-chat-b acn-chat-ic compart" onClick={() => setModalCompartilhar(true)} title="Compartilhar processo/licitação">
                  🔗
                </Botao>
                <input ref={inputRef}
                  className="acn-chat-msg-in"
                  placeholder={enviandoAnexo ? 'Enviando anexo…' : 'Mensagem… (Enter para enviar)'}
                  value={texto}
                  disabled={enviandoAnexo}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                />
                <Botao variante={texto.trim() ? 'primario' : 'secundario'} className="acn-chat-enviar" data-pronto={texto.trim() ? '1' : undefined}
                  onClick={enviar} disabled={!texto.trim() || enviando}>
                  ➤
                </Botao>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: Novo Grupo ── */}
      {modalNovoGrupo && (
        <div className="modal-overlay acn-chat-ov"
          onClick={e => { if (e.target === e.currentTarget) setModalNovoGrupo(false); }}>
          <div className="acn-chat-caixa">
            <div className="acn-chat-caixa-tit">👥 Novo Grupo</div>
            <div className="acn-chat-caixa-campo">
              <label className="acn-chat-rotulo">Nome do grupo</label>
              <input className="acn-chat-in" value={novoGrupoNome} onChange={e => setNovoGrupoNome(e.target.value)} placeholder="Ex: Equipe Produção" autoFocus />
            </div>
            <div className="acn-chat-subtit">
              Participantes ({novoGrupoMembros.size} selecionado{novoGrupoMembros.size !== 1 ? 's' : ''})
            </div>
            <div className="acn-chat-membros">
              {usuariosVisiveis.map(u => {
                const id = String(u.id || u.email);
                const sel = novoGrupoMembros.has(id);
                return (
                  <div key={id} onClick={() => toggleNovoGrupoMembro(id)} className="acn-chat-membro" data-sel={sel ? '1' : undefined}>
                    <input type="checkbox" checked={sel} onChange={() => {}} className="acn-chat-membro-cx" />
                    <Avatar nome={u.nome} size={26} />
                    <span className="acn-chat-membro-nome" data-sel={sel ? '1' : undefined}>{u.nome}</span>
                  </div>
                );
              })}
            </div>
            <div className="acn-chat-caixa-rodape">
              <Botao variante={(!novoGrupoNome.trim() || novoGrupoMembros.size === 0) ? 'secundario' : 'primario'} className="acn-chat-caixa-bt acn-chat-criar" data-vazio={(!novoGrupoNome.trim() || novoGrupoMembros.size === 0) ? '1' : undefined}
                onClick={criarGrupo} disabled={!novoGrupoNome.trim() || novoGrupoMembros.size === 0 || criandoGrupo}>
                Criar Grupo
              </Botao>
              <Botao variante="secundario" className="acn-chat-caixa-bt acn-chat-cancelar"
                onClick={() => { setModalNovoGrupo(false); setNovoGrupoNome(''); setNovoGrupoMembros(new Set()); }}>
                Cancelar
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Info do Grupo ── */}
      {modalInfoGrupo && salaAtiva?.tipo === 'grupo' && (
        <div className="acn-chat-ov"
          onClick={e => { if (e.target === e.currentTarget) setModalInfoGrupo(false); }}>
          <div className="acn-chat-caixa">
            <div className="acn-chat-info-cab">
              <GroupIcon size={36} />
              <div className="acn-chat-info-quem">
                <div className="acn-chat-info-nome">{nomeSala(salaAtiva)}</div>
                <div className="acn-chat-info-por">Criado por {salaAtiva.criado_por_nome || '—'}</div>
              </div>
            </div>
            <div className="acn-chat-subtit info">
              {(salaAtiva.membros || []).length} participantes
            </div>
            <div className="acn-chat-info-lista">
              {(salaAtiva.membros || []).map((m: any) => (
                <div key={m.id} className="acn-chat-info-membro">
                  <Avatar nome={m.nome} size={28} />
                  <span className="acn-chat-info-membro-nome">
                    {m.nome}{String(m.id) === String(salaAtiva.criado_por) && <span className="acn-chat-info-admin"> · admin</span>}
                  </span>
                  {souAdmin(salaAtiva) && String(m.id) !== uid && (
                    <Botao variante="discreto" pequeno className="acn-chat-b acn-chat-info-remover" onClick={() => removerMembroGrupo(m.id)} title="Remover do grupo">🗑️</Botao>
                  )}
                </div>
              ))}
            </div>
            {souAdmin(salaAtiva) && (
              <div className="acn-chat-info-add">
                <input className="acn-chat-in menor" value={addMembroBusca} onChange={e => setAddMembroBusca(e.target.value)} placeholder="+ Adicionar participante..." />
                {addMembroBusca.trim().length > 0 && usuariosVisiveis
                  .filter(u => !(salaAtiva.membros || []).some((m: any) => String(m.id) === String(u.id || u.email)))
                  .filter(u => combinaBusca(u.nome, addMembroBusca))
                  .slice(0, 5)
                  .map(u => (
                    <div key={u.id || u.email} onClick={() => { adicionarMembroGrupo(u); setAddMembroBusca(''); }}
                      className="acn-chat-info-opcao">
                      <Avatar nome={u.nome} size={22} />
                      <span className="acn-chat-info-opcao-nome">{u.nome}</span>
                    </div>
                  ))}
              </div>
            )}
            <div className="acn-chat-caixa-rodape">
              <Botao variante="perigo-sec" className="acn-chat-caixa-bt acn-chat-sair" onClick={() => sairDoGrupo()}>
                🚪 Sair do grupo
              </Botao>
              <Botao variante="secundario" className="acn-chat-caixa-bt acn-chat-cancelar" onClick={() => setModalInfoGrupo(false)}>
                Fechar
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Compartilhar processo ── */}
      {modalCompartilhar && (
        <div className="acn-chat-ov"
          onClick={e => { if (e.target === e.currentTarget) { setModalCompartilhar(false); setCompartilharBusca(''); setCompartilharResultados([]); } }}>
          <div className="acn-chat-caixa compart">
            <div className="acn-chat-caixa-tit">🔗 Compartilhar Processo</div>
            <div className="acn-chat-caixa-campo">
              <input className="acn-chat-in" value={compartilharBusca} onChange={e => buscarParaCompartilhar(e.target.value)}
                placeholder="Buscar licitação ou oportunidade CRM..." autoFocus />
              <div className="acn-chat-dica">Busca em Licitações e Comercial/CRM</div>
            </div>
            <div className="acn-chat-res">
              {compartilharBuscando && <div className="acn-chat-vazio res">Buscando...</div>}
              {!compartilharBuscando && compartilharErro && (
                <Faixa tom="erro">{compartilharResultados.length ? 'A busca falhou em uma das listas' : 'Não foi possível buscar'} ({compartilharErro}).</Faixa>
              )}
              {!compartilharBuscando && !compartilharErro && compartilharBusca.trim().length >= 2 && compartilharResultados.length === 0 && (
                <div className="acn-chat-vazio res">Nada encontrado</div>
              )}
              {compartilharResultados.map((r, i) => (
                <div key={i} onClick={() => compartilharRegistro(r)} className="acn-chat-res-item">
                  <span className="acn-chat-res-icone">{r._tipo.icone}</span>
                  <div className="acn-chat-res-corpo">
                    <div className="acn-chat-res-tipo">{r._tipo.contexto === 'licitacao' ? 'Licitação' : 'CRM'}</div>
                    <div className="acn-chat-res-nome">{r._tipo.label(r)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="acn-chat-caixa-rodape">
              <Botao variante="secundario" className="acn-chat-caixa-bt acn-chat-cancelar largo"
                onClick={() => { setModalCompartilhar(false); setCompartilharBusca(''); setCompartilharResultados([]); }}>
                Cancelar
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ── Botão flutuante ── */}
      <Botao variante="primario" className="acn-chat-fab" data-aberto={aberto ? '1' : undefined} data-novas={temNaoLidas && !aberto ? '1' : undefined}
        onClick={() => setAberto(a => !a)}>
        {aberto ? '✕' : '💬'}
        {naoLidas > 0 && (
          <span className="acn-chat-fab-n">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </Botao>
    </div>
  );
}
