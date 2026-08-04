// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hojeStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function daqui2Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

function horaAtualMinutos() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function horaParaMinutos(hora: string) {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function fmtHora(hora: string) {
  return hora ? hora.slice(0, 5) : '';
}

// Chave de dismissal para evitar reexibir alertas já vistos nesta sessão
function keyDismiss(id: string, tipo: string) {
  return `alerta_${tipo}_${id}_${hojeStr()}`;
}

function isDismissed(id: string, tipo: string) {
  try { return !!sessionStorage.getItem(keyDismiss(id, tipo)); } catch { return false; }
}

function dismiss(id: string, tipo: string) {
  try { sessionStorage.setItem(keyDismiss(id, tipo), '1'); } catch {}
}

// ─── POPUP 15 MINUTOS ─────────────────────────────────────────────────────────
function Popup15Min({ contatos, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0009', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: 'min(440px, 95vw)',
        boxShadow: '0 20px 60px #0005', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: '#dc2626', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>🔔</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>CONTATO EM 15 MINUTOS!</div>
            <div style={{ fontSize: 10, opacity: 0.9 }}>Você tem {contatos.length} contato{contatos.length > 1 ? 's' : ''} agendado{contatos.length > 1 ? 's' : ''} agora</div>
          </div>
        </div>

        {/* Lista */}
        <div style={{ padding: '14px 18px', maxHeight: 320, overflowY: 'auto' }}>
          {contatos.map(c => (
            <div key={c.id} style={{
              border: '1.5px solid #fca5a5', borderRadius: 8, padding: '10px 14px',
              marginBottom: 8, background: '#fef2f2',
            }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{c.titulo}</div>
              <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginTop: 3 }}>
                ⏰ {fmtHora(c.hora_prox_contato)} — {c.prox_contato}
              </div>
              {c.nome_contato && (
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                  👤 {c.nome_contato}
                  {c.contato && <span> · 📱 {c.contato}</span>}
                </div>
              )}
              {c.orgao && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>🏛️ {c.orgao}</div>}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #fee2e2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 22px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            ✓ Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BANNER 2 DIAS ────────────────────────────────────────────────────────────
function Banner2Dias({ contatos, onClose }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 8000,
      width: 'min(360px, 95vw)',
      background: '#fff', border: '2px solid #f59e0b',
      borderRadius: 10, boxShadow: '0 8px 32px #0003', overflow: 'hidden',
    }}>
      <div style={{ background: '#f59e0b', color: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, fontSize: 12 }}>
          📅 {contatos.length} contato{contatos.length > 1 ? 's' : ''} em 2 dias
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '10px 14px', maxHeight: 200, overflowY: 'auto' }}>
        {contatos.map(c => (
          <div key={c.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #fef3c7' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{c.titulo}</div>
            <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700 }}>
              📅 {c.prox_contato}
              {c.hora_prox_contato && <span> ⏰ {fmtHora(c.hora_prox_contato)}</span>}
            </div>
            {c.nome_contato && <div style={{ fontSize: 10, color: '#64748b' }}>👤 {c.nome_contato}{c.contato ? ` · ${c.contato}` : ''}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function ContatoAlertWidget({ currentUser }) {
  const [alertas15, setAlertas15]   = useState<any[]>([]);
  const [alertas2d, setAlertas2d]   = useState<any[]>([]);
  const [popup15, setPopup15]       = useState(false);
  const [banner2d, setBanner2d]     = useState(false);
  const timerRef = useRef<any>(null);

  const verificar = useCallback(async () => {
    const hoje   = hojeStr();
    const em2d   = daqui2Dias();
    const agora  = horaAtualMinutos();
    const nomeUser = currentUser?.nome || '';

    // Busca contatos agendados para hoje e em 2 dias para este usuário
    const { data } = await supabase
      .from('crm_oportunidades')
      .select('id, titulo, orgao, responsavel_nome, prox_contato, hora_prox_contato, nome_contato, contato')
      .in('prox_contato', [hoje, em2d])
      .eq('responsavel_nome', nomeUser);

    if (!data) return;

    // 15 min antes: prox_contato === hoje E hora dentro dos próximos 15 min (ou até 5 min passados)
    const novos15 = data.filter(c => {
      if (c.prox_contato !== hoje) return false;
      if (!c.hora_prox_contato) return false;
      if (isDismissed(c.id, '15min')) return false;
      const horaC = horaParaMinutos(c.hora_prox_contato);
      if (horaC === null) return false;
      const diff = horaC - agora; // positivo = ainda não chegou, negativo = passou
      return diff >= -5 && diff <= 15; // janela: -5min a +15min
    });

    // 2 dias antes: prox_contato === daqui 2 dias
    const novos2d = data.filter(c => {
      if (c.prox_contato !== em2d) return false;
      if (isDismissed(c.id, '2dias')) return false;
      return true;
    });

    if (novos15.length > 0) { setAlertas15(novos15); setPopup15(true); }
    if (novos2d.length > 0) { setAlertas2d(novos2d); setBanner2d(true); }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.nome) return;
    verificar(); // verifica imediatamente
    timerRef.current = setInterval(verificar, 60_000); // repete a cada 1 min
    return () => clearInterval(timerRef.current);
  }, [verificar]);

  const fecharPopup15 = () => {
    alertas15.forEach(c => dismiss(c.id, '15min'));
    setPopup15(false);
    setAlertas15([]);
  };

  const fecharBanner2d = () => {
    alertas2d.forEach(c => dismiss(c.id, '2dias'));
    setBanner2d(false);
    setAlertas2d([]);
  };

  return (
    <>
      {popup15 && alertas15.length > 0 && (
        <Popup15Min contatos={alertas15} onClose={fecharPopup15} />
      )}
      {banner2d && alertas2d.length > 0 && (
        <Banner2Dias contatos={alertas2d} onClose={fecharBanner2d} />
      )}
    </>
  );
}
