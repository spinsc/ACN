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

// ─── utilitários ─────────────────────────────────────────────────────────────
function prazoLabel(av: any): string {
  if (av.permanente) return '📌 Permanente';
  if (av.data_expiracao) {
    const d = new Date(av.data_expiracao);
    return `⏱ Até ${d.toLocaleDateString('pt-BR')}`;
  }
  return '';
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function AvisoSistemaWidget({ currentUser }: any) {
  const [avisos, setAvisos]         = useState<any[]>([]);
  const [minimizado, setMinimizado] = useState(false);
  const [pos, setPos]               = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<any>({ on: false });

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
      const nx = drag.current.px + me.clientX - drag.current.sx;
      const ny = drag.current.py + me.clientY - drag.current.sy;
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
    };
    const up = () => { drag.current.on = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [pos]);

  // ── render ────────────────────────────────────────────────────────────────
  if (!pos) return null;

  const topCrit  = avisos[0]?.criticidade ?? 'baixa';
  const cor      = avisos.length > 0 ? COR[topCrit] : { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', dot: '#64748b' };
  const pulsar   = topCrit === 'alta' && avisos.length > 0;

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
                cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: .3 }}>
                📌 Avisos do Sistema
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{
                  background: '#334155', color: '#94a3b8', borderRadius: 10,
                  padding: '1px 7px', fontSize: 10, fontWeight: 700,
                }}>
                  {avisos.length}
                </span>
                <button
                  onClick={() => setMinimizado(true)}
                  title="Minimizar"
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                >
                  —
                </button>
              </div>
            </div>

            {/* lista de avisos */}
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
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
                      background: c.bg,
                      borderLeft: `4px solid ${c.border}`,
                      padding: '10px 12px',
                      borderBottom: i < avisos.length - 1 ? '1px solid rgba(0,0,0,.07)' : 'none',
                    }}
                  >
                    {/* título + badges */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 11.5, color: c.text, lineHeight: 1.3 }}>
                        {av.titulo}
                      </span>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <span style={{
                          background: av.tipo === 'diretoria' ? '#1e293b' : '#0369a1',
                          color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                        }}>
                          {av.tipo === 'diretoria' ? '🏢 Diretoria' : '👮 Admin'}
                        </span>
                        <span style={{
                          background: c.border, color: '#fff', borderRadius: 4,
                          padding: '1px 6px', fontSize: 9, fontWeight: 700, textTransform: 'capitalize',
                        }}>
                          {av.criticidade}
                        </span>
                      </div>
                    </div>

                    {/* mensagem */}
                    <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
                      {av.mensagem}
                    </div>

                    {/* rodapé */}
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
