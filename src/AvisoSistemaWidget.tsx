// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

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

// ─── componente ──────────────────────────────────────────────────────────────
export default function AvisoSistemaWidget({ currentUser }: any) {
  const [avisos, setAvisos]           = useState<any[]>([]);
  const [minimizado, setMinimizado]   = useState(false);
  const [mostraForm, setMostraForm]   = useState(false);
  const [form, setForm]               = useState<any>({ ...VAZIO_FORM });
  const [salvando, setSalvando]       = useState(false);
  const [pos, setPos]                 = useState<{ x: number; y: number } | null>(null);
  const [podePublicar, setPodePublicar] = useState(false);
  const drag = useRef<any>({ on: false });

  const user = currentUser || JSON.parse(localStorage.getItem('user') || '{}')

  // ── verifica permissão direto no banco (resolve usuários já logados antes da coluna existir) ──
  useEffect(() => {
    if (!user?.id) return;
    // parte rápida: checa localStorage primeiro
    if (user?.pode_enviar_avisos || user?.perfil === 'Admin') {
      setPodePublicar(true);
      return;
    }
    // busca fresca no banco para não depender de sessão antiga
    supabase
      .from('auth_usuarios')
      .select('pode_enviar_avisos, perfil')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const pode = !!(data.pode_enviar_avisos) || data.perfil === 'Admin';
        setPodePublicar(pode);
        // atualiza localStorage para que próximos renders não precisem consultar
        try {
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          stored.pode_enviar_avisos = data.pode_enviar_avisos || false;
          localStorage.setItem('user', JSON.stringify(stored));
        } catch (_) {}
      });
  }, [user?.id]);

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

  // posição inicial (canto superior direito)
  useEffect(() => {
    setPos({ x: Math.max(window.innerWidth - 336, 16), y: 72 });
  }, []);

  // ── drag ──────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, px: pos!.x, py: pos!.y };
    const move = (me: MouseEvent) => {
      if (!drag.current.on) return;
      setPos({ x: Math.max(0, drag.current.px + me.clientX - drag.current.sx), y: Math.max(0, drag.current.py + me.clientY - drag.current.sy) });
    };
    const up = () => { drag.current.on = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [pos]);

  // ── salvar novo aviso ─────────────────────────────────────────────────────
  const salvar = async () => {
    if (!form.titulo?.trim() || !form.mensagem?.trim()) return;
    setSalvando(true);
    await supabase.from('avisos_sistema').insert([{
      titulo:         form.titulo.trim(),
      mensagem:       form.mensagem.trim(),
      tipo:           form.tipo,
      criticidade:    form.criticidade,
      permanente:     !!form.permanente,
      data_expiracao: (!form.permanente && form.data_expiracao) ? new Date(form.data_expiracao).toISOString() : null,
      ativo:          true,
      criado_por:      user?.email || '',
      criado_por_nome: user?.nome  || '',
    }]);
    setForm({ ...VAZIO_FORM });
    setMostraForm(false);
    setSalvando(false);
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

      <div className="aviso-widget" style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1500, userSelect: 'none' }}>

        {/* ── MINIMIZADO ── */}
        {minimizado ? (
          <button
            onClick={() => setMinimizado(false)}
            className={pulsar ? 'aviso-pulse' : ''}
            title={avisos.length > 0 ? `${avisos.length} aviso(s) do sistema` : 'Avisos do Sistema'}
            style={{
              width: 46, height: 46, borderRadius: '50%',
              border: `2.5px solid ${cor.border}`, background: cor.bg,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          <div style={{ width: 320, borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 30px rgba(0,0,0,.28)' }}>

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
                    onClick={() => { setMostraForm(f => !f); }}
                    title="Novo Aviso"
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
                  onClick={() => { setMinimizado(true); setMostraForm(false); }}
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
                  📢 Novo Aviso
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
                      <option value="admin">👮 Admin</option>
                      <option value="diretoria">🏢 Diretoria</option>
                    </select>
                    <select value={form.criticidade} onChange={e => setForm({ ...form, criticidade: e.target.value })} style={inpStyle}>
                      <option value="baixa">🟡 Baixa</option>
                      <option value="media">🟠 Média</option>
                      <option value="alta">🔴 Alta</option>
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
                    {salvando ? 'Publicando...' : '📢 Publicar Aviso'}
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
                      {av.mensagem}
                    </div>
                    <div style={{ fontSize: 9, color: '#6b7280', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                      <span>✍️ {av.criado_por_nome || '—'}</span>
                      <span>{prazoLabel(av)}</span>
                    </div>
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
