// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';
import { confirmar } from './Feedback';
import { podePublicarAviso, podeMexerNoAviso } from './utils/permissoes';

// ─── paleta por criticidade ───────────────────────────────────────────────────
const COR: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  baixa: { bg: '#fef9c3', border: '#ca8a04', text: '#854d0e', dot: '#eab308' },
  media: { bg: '#ffedd5', border: '#ea580c', text: '#9a3412', dot: '#f97316' },
  alta:  { bg: '#fee2e2', border: '#dc2626', text: '#991b1b', dot: '#dc2626' },
};

const CRIT_ORDER = { alta: 0, media: 1, baixa: 2 };

const VAZIO_FORM = {
  titulo: '', mensagem: '', tipo: 'admin', criticidade: 'media',
  permanente: false, data_expiracao: '',
};

function prazoLabel(av: any): string {
  if (av.permanente) return '📌 Permanente';
  if (av.data_expiracao) return `⏱ Até ${new Date(av.data_expiracao).toLocaleDateString('pt-BR')}`;
  return '';
}

// Pedido do usuário em 29/09/2026: mostrar o horário em que o aviso foi
// publicado, não só quem publicou. `criado_em` já é gravado pelo banco
// (timestamptz), então é só exibir. Fica aqui para o painel flutuante e a tela
// de Admin mostrarem o mesmo formato.
export function criadoEmLabel(av: any): string {
  if (!av?.criado_em) return '';
  const d = new Date(av.criado_em);
  if (isNaN(d.getTime())) return '';
  return `🕐 ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

// "2026-10-04T13:19:45+00:00" → "2026-10-04T10:19": a hora de quem usa, no formato do campo de data e hora. Antes a edição cortava o texto em UTC e a validade abria 3 h adiantada.
export function paraCampoDataHora(iso: any): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function AvisoSistemaWidget({ currentUser }: any) {
  const [avisos, setAvisos]           = useState<any[]>([]);
  // Sempre inicia minimizado (só o "📌" no canto do header) — o painel
  // aberto por padrão a cada login incomodava. Ver também as duas posições
  // dedicadas (POS_MINIMIZADO/POS_EXPANDIDO) logo abaixo.
  const [minimizado, setMinimizado]   = useState(true);
  const minimizadoRef = useRef(true);
  minimizadoRef.current = minimizado;
  const [mostraForm, setMostraForm]   = useState(false);
  const [form, setForm]               = useState<any>({ ...VAZIO_FORM });
  const [salvando, setSalvando]       = useState(false);
  const [pos, setPos]                 = useState<{ x: number; y: number } | null>(null);
  const [podePublicar, setPodePublicar] = useState(false);
  const [ehDev, setEhDev]             = useState(false);
  const [editId, setEditId]           = useState<string|null>(null);
  const drag        = useRef<any>({ on: false });
  const dragMoved   = useRef(false);

  const user = currentUser || JSON.parse(localStorage.getItem('user') || '{}')

  // ── quem pode o quê (02/10/2026, pedido do usuário) ──
  // Só Admin publica um aviso (antes a caixa "pode publicar" do cadastro também liberava gerentes e o RH). Editar e excluir: só o autor do aviso ou quem tem a marca DEV.
  // A leitura fresca no banco resolve a sessão guardada antes de a marca DEV existir.
  useEffect(() => {
    if (!user?.id) return;
    setPodePublicar(podePublicarAviso(user));
    setEhDev(user?.eh_dev === true);
    supabase
      .from('auth_usuarios')
      .select('perfil, eh_dev')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPodePublicar(podePublicarAviso(data));
        setEhDev(data.eh_dev === true);
        try {
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          stored.eh_dev = data.eh_dev || false;
          localStorage.setItem('user', JSON.stringify(stored));
        } catch (_) {}
      });
  }, [user?.id]);
  // o usuário com o que vale AGORA (perfil e marca lidos do banco), para decidir o que cada aviso permite
  const eu = { ...user, perfil: podePublicar ? 'Admin' : user?.perfil, eh_dev: ehDev };

  // ── load ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('avisos_sistema')
      .select('*')
      .eq('ativo', true)
      .order('criado_em', { ascending: false });

    const now = new Date();
    const ativos = (data || []).filter(
      (av) => av.permanente || (av.data_expiracao && new Date(av.data_expiracao) > now),
    );
    ativos.sort((a, b) => (CRIT_ORDER[a.criticidade] ?? 9) - (CRIT_ORDER[b.criticidade] ?? 9));
    setAvisos(ativos);
  }, []);

  useEffect(() => {
    carregar();
    const ch = supabase
      .channel('avisos-sistema-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos_sistema' }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  // Minimizado: mede a posição real do bloco de ícones da direita do header
  // (.acn-right — motorola/tema/menções/análise/usuário) e encosta o pin
  // logo à esquerda dele. Evita usar um offset fixo de window.innerWidth,
  // que ficava sobrepondo esses botões conforme o conteúdo do header varia
  // (nome do usuário, badge de análise visível ou não, etc.).
  // O PIN FLUTUA NO CANTO, ACIMA DO CHAT (28/09/2026)
  //
  // Antes ele morava no header, encostado à esquerda do campo de busca. Ali
  // disputava espaço com a busca e com os ícones da direita, e a posição
  // mudava conforme o conteúdo do cabeçalho — nome do usuário mais longo,
  // selo de análise aparecendo. Fora que aviso não é ferramenta de cabeçalho:
  // é recado, e recado fica onde o resto dos recados está.
  //
  // Agora ele nasce empilhado sobre o botão do chat, no canto de baixo à
  // direita, alinhado com ele. Continua arrastável para quem quiser tirar da
  // frente.
  const PIN = 46;          // diâmetro do pin
  const CHAT = 52;         // diâmetro do botão do chat (ChatWidget)
  const MARGEM = 18;       // mesma margem que o chat usa
  const ENTRE = 10;        // respiro entre os dois botões

  const POS_MINIMIZADO = () => ({
    // centralizado sobre o botão do chat, que é um pouco maior
    x: Math.max(8, window.innerWidth - MARGEM - CHAT + (CHAT - PIN) / 2),
    y: Math.max(8, window.innerHeight - MARGEM - CHAT - ENTRE - PIN),
  });

  // Expandido: sobe a partir do canto, para o painel abrir perto de onde foi
  // clicado. A altura só se conhece depois de desenhar, então nasce numa
  // posição razoável e o efeito abaixo ajusta a altura real.
  const POS_EXPANDIDO = () => ({
    x: Math.max(8, window.innerWidth - 320 - MARGEM),
    y: Math.max(72, window.innerHeight - MARGEM - CHAT - ENTRE - 360),
  });

  // posição inicial — já nasce na âncora do estado minimizado (padrão atual)
  useEffect(() => {
    setPos(POS_MINIMIZADO());
    const aoRedimensionar = () => { if (minimizadoRef.current) setPos(POS_MINIMIZADO()); };
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  // Abriu o painel: encosta a base dele logo acima do chat, agora que dá para
  // medir a altura de verdade. Sem isto, painel curto ficava boiando e painel
  // comprido passava por cima do botão.
  const caixaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (minimizado || !caixaRef.current || dragMoved.current) return;
    const h = caixaRef.current.getBoundingClientRect().height;
    if (!h) return;
    const y = Math.max(72, window.innerHeight - MARGEM - CHAT - ENTRE - h);
    setPos(p => (p && Math.abs(p.y - y) < 2 ? p : { x: POS_EXPANDIDO().x, y }));
  }, [minimizado, avisos.length, mostraForm]);

  // ── drag ──────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragMoved.current = false;
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, px: pos!.x, py: pos!.y };
    const move = (me: MouseEvent) => {
      if (!drag.current.on) return;
      if (Math.abs(me.clientX - drag.current.sx) > 4 || Math.abs(me.clientY - drag.current.sy) > 4) {
        dragMoved.current = true;
      }
      setPos({ x: Math.max(0, drag.current.px + me.clientX - drag.current.sx), y: Math.max(0, drag.current.py + me.clientY - drag.current.sy) });
    };
    const up = () => { drag.current.on = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [pos]);

  // ── salvar (novo aviso ou edição) ─────────────────────────────────────────────────────
  const salvar = async () => {
    if (!form.titulo?.trim() || !form.mensagem?.trim()) return;
    const alvo = editId ? avisos.find((a: any) => a.id === editId) : null;
    if (editId ? !(alvo && podeMexerNoAviso(eu, alvo)) : !podePublicar) { alert('Você não tem permissão para fazer isso com este aviso.'); return; }
    setSalvando(true);
    const campos = {
      titulo:         form.titulo.trim(),
      mensagem:       form.mensagem.trim(),
      tipo:           form.tipo,
      criticidade:    form.criticidade,
      permanente:     !!form.permanente,
      data_expiracao: (!form.permanente && form.data_expiracao) ? new Date(form.data_expiracao).toISOString() : null,
    };
    // editar NÃO mexe em "ativo" nem no autor (antes o painel só sabia publicar)
    const { error } = editId
      ? await supabase.from('avisos_sistema').update(campos).eq('id', editId)
      : await supabase.from('avisos_sistema').insert([{ ...campos, ativo: true, criado_por: user?.email || '', criado_por_nome: user?.nome || '' }]);
    setSalvando(false);
    if (error) { alert('Erro ao salvar o aviso: ' + error.message); return; }
    setForm({ ...VAZIO_FORM });
    setEditId(null);
    setMostraForm(false);
    await carregar();
  };

  const iniciarEdicao = (av: any) => {
    if (!podeMexerNoAviso(eu, av)) return;
    setEditId(av.id);
    setForm({
      titulo: av.titulo, mensagem: av.mensagem, tipo: av.tipo, criticidade: av.criticidade,
      permanente: !!av.permanente, data_expiracao: paraCampoDataHora(av.data_expiracao),
    });
    setMostraForm(true);
  };

  const excluir = async (av: any) => {
    if (!podeMexerNoAviso(eu, av)) return;
    if (!await confirmar(`Excluir o aviso "${av.titulo}"?`)) return;
    const { error } = await supabase.from('avisos_sistema').delete().eq('id', av.id);
    if (error) { alert('Erro ao excluir o aviso: ' + error.message); return; }
    if (editId === av.id) { setEditId(null); setForm({ ...VAZIO_FORM }); setMostraForm(false); }
    await carregar();
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (!pos) return null;

  const topCrit = avisos[0]?.criticidade ?? 'baixa';
  const cor     = avisos.length > 0 ? COR[topCrit] : { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', dot: '#64748b' };
  const pulsar  = topCrit === 'alta' && avisos.length > 0;

  const inpStyle: React.CSSProperties = {
    width: '100%', padding: '5px 7px', border: '1px solid #cbd5e1',
    borderRadius: 4, fontSize: 10, boxSizing: 'border-box', background: '#fff',
  };

  return (
    <>
      <style>{`
        @keyframes aviso-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); }
          50%      { box-shadow: 0 0 0 10px rgba(220,38,38,0); }
        }
        .aviso-pulse { animation: aviso-pulse 1.8s ease-in-out infinite; }
        .aviso-widget { transition: none; }
      `}</style>

      <div className={`aviso-widget ${minimizado ? 'aviso-min' : 'aviso-aberto'}`} style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1500, userSelect: 'none' }}>

        {/* ── MINIMIZADO ── */}
        {minimizado ? (
          <button
            onMouseDown={onHeaderMouseDown}
            onClick={() => {
              if (dragMoved.current) return;
              setMinimizado(false);
              setPos(POS_EXPANDIDO()); // desce o painel pra não cobrir o header
            }}
            className={pulsar ? 'aviso-pulse' : ''}
            title={avisos.length > 0 ? `${avisos.length} aviso(s) — arraste para mover` : 'Avisos do Sistema — arraste para mover'}
            style={{
              width: 46, height: 46, borderRadius: '50%',
              border: `2.5px solid ${cor.border}`, background: cor.bg,
              cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, boxShadow: '0 2px 10px rgba(0,0,0,.25)', position: 'relative',
            }}
          >
            📌
            {avisos.length > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                background: cor.dot, color: '#fff', borderRadius: '50%',
                width: 20, height: 20, fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #fff',
              }}>
                {avisos.length}
              </span>
            )}
          </button>

        ) : (
          /* ── EXPANDIDO ── */
          <div ref={caixaRef} style={{ width: 320, borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 30px rgba(0,0,0,.28)' }}>

            {/* cabeçalho draggável */}
            <div
              onMouseDown={onHeaderMouseDown}
              style={{
                background: '#1e293b', color: '#f1f5f9', padding: '7px 10px',
                cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: .3 }}>📌 Avisos do Sistema</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ background: '#334155', color: '#94a3b8', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                  {avisos.length}
                </span>
                {/* botão novo aviso — só para quem tem permissão */}
                {podePublicar && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => { if (mostraForm) { setEditId(null); setForm({ ...VAZIO_FORM }); } setMostraForm(f => !f); }}
                    title={editId ? 'Cancelar a edição' : 'Novo Aviso'}
                    style={{
                      background: mostraForm ? '#dc2626' : '#16a34a',
                      border: 'none', borderRadius: 4, color: '#fff',
                      fontSize: 13, fontWeight: 900, cursor: 'pointer',
                      lineHeight: 1, padding: '2px 7px',
                    }}
                  >
                    {mostraForm ? '✕' : '+'}
                  </button>
                )}
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setMinimizado(true); setMostraForm(false); setEditId(null); setPos(POS_MINIMIZADO()); }}
                  title="Minimizar"
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                >
                  —
                </button>
              </div>
            </div>

            {/* ── FORMULÁRIO INLINE ── */}
            {mostraForm && (
              <div style={{ background: '#0f172a', padding: '10px 12px', borderBottom: '2px solid #334155' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
                  {editId ? '✏️ Editar Aviso' : '📢 Novo Aviso'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Título *"
                    style={inpStyle}
                  />
                  <textarea
                    value={form.mensagem}
                    onChange={e => setForm({ ...form, mensagem: e.target.value })}
                    placeholder="Mensagem *"
                    rows={3}
                    style={{ ...inpStyle, resize: 'vertical' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={inpStyle}>
                      <option value="admin">Admin</option>
                      <option value="diretoria">Diretoria</option>
                    </select>
                    <select value={form.criticidade} onChange={e => setForm({ ...form, criticidade: e.target.value })} style={inpStyle}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#cbd5e1', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.permanente}
                      onChange={e => setForm({ ...form, permanente: e.target.checked, data_expiracao: '' })}
                      style={{ accentColor: '#f97316' }}
                    />
                    📌 Manter permanentemente
                  </label>
                  {!form.permanente && (
                    <input
                      type="datetime-local"
                      value={form.data_expiracao}
                      onChange={e => setForm({ ...form, data_expiracao: e.target.value })}
                      placeholder="Válido até"
                      style={inpStyle}
                    />
                  )}
                  <button
                    onClick={salvar}
                    disabled={salvando || !form.titulo?.trim() || !form.mensagem?.trim()}
                    style={{
                      background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4,
                      padding: '6px 0', fontWeight: 800, fontSize: 11, cursor: 'pointer',
                      opacity: (!form.titulo?.trim() || !form.mensagem?.trim()) ? .4 : 1,
                    }}
                  >
                    {salvando ? (editId ? 'Salvando...' : 'Publicando...') : (editId ? '💾 Salvar alterações' : '📢 Publicar Aviso')}
                  </button>
                </div>
              </div>
            )}

            {/* lista de avisos */}
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {avisos.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 11, background: '#f8fafc' }}>
                  Nenhum aviso ativo no momento.
                </div>
              )}
              {avisos.map((av, i) => {
                const c = COR[av.criticidade] ?? COR.media;
                return (
                  <div
                    key={av.id}
                    style={{
                      background: c.bg, borderLeft: `4px solid ${c.border}`, padding: '10px 12px',
                      borderBottom: i < avisos.length - 1 ? '1px solid rgba(0,0,0,.07)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 11.5, color: c.text, lineHeight: 1.3 }}>{av.titulo}</span>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <span style={{ background: av.tipo === 'diretoria' ? '#1e293b' : '#0369a1', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
                          {av.tipo === 'diretoria' ? '🏢 Diretoria' : '👮 Admin'}
                        </span>
                        <span style={{ background: c.border, color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, textTransform: 'capitalize' }}>
                          {av.criticidade}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
                      <Linkify text={av.mensagem} />
                    </div>
                    <div style={{ fontSize: 9, color: '#6b7280', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                      <span>✍️ {av.criado_por_nome || '—'}{criadoEmLabel(av) ? ` · ${criadoEmLabel(av)}` : ''}</span>
                      <span>{prazoLabel(av)}</span>
                    </div>
                    {/* editar e excluir: só o autor do aviso ou quem tem a marca DEV (02/10/2026) */}
                    {podeMexerNoAviso(eu, av) && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                        <button onClick={() => iniciarEdicao(av)} title="Editar este aviso"
                          style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => excluir(av)} title="Excluir este aviso"
                          style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                          🗑 Excluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
