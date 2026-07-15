// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Painel Inbox de Menções (@usuário)
// Abre via badge 💬 no header — lista menções não lidas do usuário logado
// Permite marcar como lida e navegar para a aba de origem
// ─────────────────────────────────────────────────────────────────────────────

const ABA_LABEL: Record<string, string> = {
  comercial:   '🏭 Comercial',
  engenharia:  '⚙️ Engenharia',
  pcp:         '📋 PCP',
  almoxarifado:'📦 Almoxarifado',
  producao:    '🔧 Produção',
  qualidade:   '✅ Qualidade',
  fiscal:      '🧾 Fiscal',
  logistica:   '🚚 Logística',
  crm:         '💼 CRM',
  licitacoes:  '🏛️ Licitações',
  sac:         '🎧 SAC',
  rh:          '👥 RH',
  compras:     '🛒 Compras',
  admin:       '⚙️ Admin',
};

const CONTEXTO_LABEL: Record<string, string> = {
  op:      'OP',
  os:      'OS',
  crm:     'CRM',
  demanda: 'Demanda',
  sac:     'SAC',
};

const fmtDT = (v: string) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });
  } catch { return v; }
};

interface Props {
  currentUser: any;
  onClose: () => void;
  onCountChange?: (n: number) => void;
  onNavigate?: (tab: string) => void;
}

export default function MencoesInboxPanel({ currentUser, onClose, onCountChange, onNavigate }: Props) {
  const [mencoes, setMencoes]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState<'nao_lidas' | 'todas'>('nao_lidas');
  const [marcando, setMarcando] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = String(currentUser?.id || '');
      const q = supabase
        .from('mencoes')
        .select('*')
        .eq('mencionado_id', uid)
        .order('criado_em', { ascending: false })
        .limit(100);
      if (filtro === 'nao_lidas') q.eq('lida', false);
      const { data, error } = await q;
      if (error) {
        console.error('[MencoesInbox] erro ao carregar:', error.message);
      }
      const lista = data || [];
      setMencoes(lista);
      const naoLidas = lista.filter(m => !m.lida).length;
      onCountChange?.(filtro === 'nao_lidas' ? lista.length : naoLidas);
    } catch (e) {
      console.error('[MencoesInbox] exceção:', e);
    }
    setLoading(false);
  }, [currentUser?.id, filtro]);

  useEffect(() => { load(); }, [load]);

  const marcarLida = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({ lida: true }).eq('id', m.id);
    await load();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const marcarTodasLidas = async () => {
    await supabase.from('mencoes')
      .update({ lida: true })
      .eq('mencionado_id', currentUser?.id)
      .eq('lida', false);
    await load();
  };

  const naoLidasCount = mencoes.filter(m => !m.lida).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Backdrop */}
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.35)' }} onClick={onClose} />

      {/* Painel lateral direito */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 480, maxWidth: '95vw', height: '100vh',
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{ background:'#6366f1', color:'white', padding:'14px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>💬 Minhas Menções</div>
              <div style={{ fontSize:10, opacity:.85, marginTop:2 }}>
                {naoLidasCount > 0
                  ? `${naoLidasCount} menção(ões) não lida(s)`
                  : 'Nenhuma menção pendente'}
              </div>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {naoLidasCount > 0 && (
                <button onClick={marcarTodasLidas}
                  style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4,
                    background:'rgba(255,255,255,.2)', color:'white', border:'none', cursor:'pointer' }}>
                  ✓ Todas lidas
                </button>
              )}
              <button onClick={onClose}
                style={{ background:'rgba(255,255,255,.2)', border:'none', color:'white',
                  borderRadius:4, width:28, height:28, cursor:'pointer', fontSize:14, fontWeight:700 }}>
                ✕
              </button>
            </div>
          </div>

          {/* Filtro */}
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {(['nao_lidas','todas'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                style={{
                  fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                  background: filtro===f ? 'white' : 'rgba(255,255,255,.2)',
                  color:      filtro===f ? '#6366f1' : 'white',
                  border: 'none',
                }}>
                {f === 'nao_lidas' ? 'Não lidas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:32, color:'#94a3b8', fontSize:11 }}>Carregando...</div>
          )}
          {!loading && mencoes.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
              <div style={{ fontSize:11 }}>
                {filtro === 'nao_lidas' ? 'Nenhuma menção não lida!' : 'Nenhuma menção registrada.'}
              </div>
            </div>
          )}

          {mencoes.map(m => {
            const abaLabel = ABA_LABEL[m.aba_destino] || m.aba_destino || '—';
            const ctxLabel = CONTEXTO_LABEL[m.contexto] || m.contexto || '—';
            const isMarcando = marcando[m.id];

            return (
              <div key={m.id} style={{
                border: `1px solid ${m.lida ? '#e2e8f0' : '#c7d2fe'}`,
                borderLeft: `3px solid ${m.lida ? '#cbd5e1' : '#6366f1'}`,
                borderRadius: 8, marginBottom: 8, padding:'10px 12px',
                background: m.lida ? '#f8fafc' : '#f5f3ff',
              }}>
                {/* Linha 1: quem mencionou + quando */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{
                      width:24, height:24, borderRadius:'50%',
                      background: m.lida ? '#94a3b8' : '#6366f1',
                      color:'white', display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:9, fontWeight:700, flexShrink:0,
                    }}>
                      {(m.mencionante_nome || '?')[0]}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, color: m.lida ? '#64748b' : '#4338ca' }}>
                      @você
                    </span>
                    <span style={{ fontSize:9, color:'#94a3b8' }}>
                      por <strong>{m.mencionante_nome || '—'}</strong>
                    </span>
                  </div>
                  <span style={{ fontSize:9, color:'#94a3b8' }}>{fmtDT(m.criado_em)}</span>
                </div>

                {/* Linha 2: contexto + descrição */}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap' }}>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3,
                    background: m.lida ? '#e2e8f0' : '#e0e7ff', color: m.lida ? '#64748b' : '#4338ca',
                  }}>
                    {ctxLabel}
                  </span>
                  {m.contexto_descricao && (
                    <span style={{ fontSize:9, color:'#475569', fontWeight:600 }}>{m.contexto_descricao}</span>
                  )}
                  {m.campo && (
                    <span style={{ fontSize:9, color:'#94a3b8' }}>campo: {m.campo}</span>
                  )}
                </div>

                {/* Trecho do texto */}
                {m.texto_trecho && (
                  <div style={{
                    fontSize:10, color:'#1e293b', background: m.lida ? '#f1f5f9' : '#ede9fe',
                    borderRadius:4, padding:'5px 8px', marginBottom:6,
                    borderLeft:'2px solid #818cf8', fontStyle:'italic',
                    whiteSpace:'pre-wrap', wordBreak:'break-word',
                  }}>
                    {m.texto_trecho.length > 200 ? m.texto_trecho.slice(0, 200) + '…' : m.texto_trecho}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {m.aba_destino && onNavigate && (
                    <button
                      onClick={() => { if (!m.lida) marcarLida(m); onNavigate(m.aba_destino); }}
                      style={{
                        fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4,
                        background:'#6366f1', color:'white', border:'none', cursor:'pointer',
                      }}>
                      {abaLabel} →
                    </button>
                  )}
                  {!m.lida && (
                    <button
                      onClick={() => marcarLida(m)}
                      disabled={isMarcando}
                      style={{
                        fontSize:9, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                        background:'none', color:'#6366f1', border:'1px solid #c7d2fe',
                        opacity: isMarcando ? .6 : 1,
                      }}>
                      {isMarcando ? '...' : '✓ Marcar lida'}
                    </button>
                  )}
                  {m.lida && (
                    <span style={{ fontSize:9, color:'#94a3b8' }}>✓ Lida</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{
          borderTop:'1px solid #e2e8f0', padding:'10px 14px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f8fafc',
        }}>
          <span style={{ fontSize:9, color:'#94a3b8' }}>
            {mencoes.length} menção(ões) exibida(s)
          </span>
          <button onClick={load}
            style={{ fontSize:9, fontWeight:700, padding:'4px 12px', borderRadius:4,
              background:'#6366f1', color:'white', border:'none', cursor:'pointer' }}>
            🔄 Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
