// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hojeStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function amanhaStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtHora(hora: string) {
  return hora ? hora.slice(0, 5) : '';
}

// Chave de dismissal para evitar reexibir alertas já vistos nesta sessão
function keyDismiss(id: string, tipo: string) {
  return `alerta_comercial_${tipo}_${id}_${hojeStr()}`;
}

function isDismissed(id: string, tipo: string) {
  try { return !!sessionStorage.getItem(keyDismiss(id, tipo)); } catch { return false; }
}

function dismiss(id: string, tipo: string) {
  try { sessionStorage.setItem(keyDismiss(id, tipo), '1'); } catch {}
}

// ─── BANNER (1 dia antes / no dia) ─────────────────────────────────────────────
function BannerComercial({ contatos, titulo, cor, corBg, onClose, offsetBottom }) {
  return (
    <div style={{
      position: 'fixed', bottom: offsetBottom, right: 20, zIndex: 8000,
      width: 'min(360px, 95vw)',
      background: '#fff', border: `2px solid ${cor}`,
      borderRadius: 10, boxShadow: '0 8px 32px #0003', overflow: 'hidden',
    }}>
      <div style={{ background: cor, color: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, fontSize: 12 }}>{titulo} ({contatos.length})</div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '10px 14px', maxHeight: 220, overflowY: 'auto', background: corBg }}>
        {contatos.map(c => (
          <div key={c.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #0001' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{c.titulo}</div>
            <div style={{ fontSize: 10, color: cor, fontWeight: 700 }}>
              📅 {c.prox_contato}
              {c.hora_prox_contato && <span> ⏰ {fmtHora(c.hora_prox_contato)}</span>}
            </div>
            {c.responsavel_nome && <div style={{ fontSize: 10, color: '#64748b' }}>👤 Vendedor: {c.responsavel_nome}</div>}
            {c.nome_contato && <div style={{ fontSize: 10, color: '#64748b' }}>Contato: {c.nome_contato}{c.contato ? ` · ${c.contato}` : ''}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// Alerta comercial (aba CRM/Comercial): avisa o vendedor responsável E o
// gestor dele (via auth_usuarios.gestor_id) 1 dia antes e no dia do
// próximo contato agendado — cliente-side (polling), sem infra de servidor.
export default function ContatoComercialAlertWidget({ currentUser }) {
  const [alertasAmanha, setAlertasAmanha] = useState<any[]>([]);
  const [alertasHoje, setAlertasHoje]     = useState<any[]>([]);
  const [showAmanha, setShowAmanha]       = useState(false);
  const [showHoje, setShowHoje]           = useState(false);
  const timerRef = useRef<any>(null);

  const verificar = useCallback(async () => {
    if (!currentUser?.nome) return;
    const hoje   = hojeStr();
    const amanha = amanhaStr();

    // Nomes dos vendedores que este usuário gerencia (se for gestor de alguém)
    const { data: liderados } = await supabase
      .from('auth_usuarios').select('nome').eq('gestor_id', currentUser.id);
    const nomesEquipe = (liderados || []).map(u => u.nome).filter(Boolean);
    const nomesRelevantes = [...new Set([currentUser.nome, ...nomesEquipe])];

    const { data } = await supabase
      .from('crm_oportunidades')
      .select('id, titulo, responsavel_nome, prox_contato, hora_prox_contato, nome_contato, contato, numero_pv')
      .in('prox_contato', [hoje, amanha])
      .in('responsavel_nome', nomesRelevantes);

    if (!data) return;

    const novosHoje = data.filter(c => c.prox_contato === hoje && !isDismissed(c.id, 'hoje'));
    const novosAmanha = data.filter(c => c.prox_contato === amanha && !isDismissed(c.id, 'amanha'));

    if (novosHoje.length > 0)   { setAlertasHoje(novosHoje);     setShowHoje(true); }
    if (novosAmanha.length > 0) { setAlertasAmanha(novosAmanha); setShowAmanha(true); }
  }, [currentUser?.id, currentUser?.nome]);

  useEffect(() => {
    if (!currentUser?.id) return;
    verificar();
    timerRef.current = setInterval(verificar, 60_000);
    return () => clearInterval(timerRef.current);
  }, [verificar]);

  const fecharHoje = () => {
    alertasHoje.forEach(c => dismiss(c.id, 'hoje'));
    setShowHoje(false);
    setAlertasHoje([]);
  };

  const fecharAmanha = () => {
    alertasAmanha.forEach(c => dismiss(c.id, 'amanha'));
    setShowAmanha(false);
    setAlertasAmanha([]);
  };

  return (
    <>
      {showHoje && alertasHoje.length > 0 && (
        <BannerComercial contatos={alertasHoje} titulo="📞 Contato comercial HOJE" cor="#dc2626" corBg="#fef2f2" onClose={fecharHoje} offsetBottom={20} />
      )}
      {showAmanha && alertasAmanha.length > 0 && (
        <BannerComercial contatos={alertasAmanha} titulo="📅 Contato comercial amanhã" cor="#d97706" corBg="#fffbeb" onClose={fecharAmanha} offsetBottom={showHoje && alertasHoje.length > 0 ? 210 : 20} />
      )}
    </>
  );
}
