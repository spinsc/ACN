// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { SETOR_LABEL } from './AnaliseWidget';

// ─────────────────────────────────────────────────────────────────────────────
// Painel Inbox de Análises Orçamentárias
// Abre via badge 🔔 no header — mostra todas as solicitações em_andamento
// Permite que o analista finalize setores individualmente
// ─────────────────────────────────────────────────────────────────────────────

const SETOR_COR: Record<string, string> = {
  Comercial:   '#2563eb',
  Telecom:     '#0891b2',
  Engenharia:  '#16a34a',
  Orcamento:   '#b45309',
  Chicotes:    '#7c3aed',
  Serralheria: '#ea580c',
  Producao:    '#d97706',
  Laboratorio: '#dc2626',
};

const fmtDT = (v: string) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return v; }
};

interface Props {
  currentUser: any;
  onClose: () => void;
  onCountChange?: (n: number) => void;
  onNavigate?: (tab: string) => void;
}

export default function AnaliseInboxPanel({ currentUser, onClose, onCountChange, onNavigate }: Props) {
  const [analises, setAnalises]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState<Record<string, boolean>>({});
  const [notas, setNotas]           = useState<Record<string, string>>({});   // setorId → nota
  const [expandido, setExpandido]   = useState<Record<string, boolean>>({});  // solicitacaoId → bool
  const [filtro, setFiltro]         = useState<'pendente' | 'tudo'>('pendente');

  const load = useCallback(async () => {
    setLoading(true);
    const q = supabase
      .from('analise_solicitacoes')
      .select('*, analise_setores(*)')
      .order('criado_em', { ascending: false });
    if (filtro === 'pendente') q.eq('status', 'em_andamento');

    const { data } = await q;
    const lista = data || [];
    setAnalises(lista);
    const pendentes = lista.filter(a => a.status === 'em_andamento').length;
    onCountChange?.(pendentes);
    setLoading(false);
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  const concluirSetor = async (solicitacao: any, setor: any) => {
    const key = setor.id;
    setSalvando(prev => ({ ...prev, [key]: true }));
    try {
      await supabase.from('analise_setores').update({
        status:       'concluido',
        analisado_por: currentUser?.nome || 'Sistema',
        analisado_em:  new Date().toISOString(),
        notas:         notas[key]?.trim() || null,
      }).eq('id', key);

      // Verifica se todos os setores foram concluídos
      const setoresAtualizados = (solicitacao.analise_setores || []).map((s: any) =>
        s.id === key ? { ...s, status: 'concluido' } : s
      );
      const todosConcluidos = setoresAtualizados.every((s: any) => s.status === 'concluido');
      if (todosConcluidos) {
        await supabase.from('analise_solicitacoes')
          .update({ status: 'concluido' })
          .eq('id', solicitacao.id);
      }
      await load();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    }
    setSalvando(prev => ({ ...prev, [key]: false }));
  };

  const reabrirSetor = async (setor: any) => {
    await supabase.from('analise_setores').update({
      status: 'pendente', analisado_por: null, analisado_em: null, notas: null,
    }).eq('id', setor.id);
    // Garante que a solicitação volta para em_andamento
    await supabase.from('analise_solicitacoes').update({ status: 'em_andamento' }).eq('id', setor.solicitacao_id);
    await load();
  };

  const pendentesTotal = analises.filter(a => a.status === 'em_andamento').length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Backdrop semitransparente */}
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.35)' }} onClick={onClose} />

      {/* Painel lateral direito */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 480, maxWidth: '95vw', height: '100vh',
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{ background:'#b45309', color:'white', padding:'14px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>🔔 Análises Orçamentárias</div>
              <div style={{ fontSize:10, opacity:.85, marginTop:2 }}>
                {pendentesTotal > 0
                  ? `${pendentesTotal} solicitação(ões) aguardando análise`
                  : 'Nenhuma pendência no momento'}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,.2)', border:'none', color:'white',
                borderRadius:4, width:28, height:28, cursor:'pointer', fontSize:14, fontWeight:700 }}>
              ✕
            </button>
          </div>

          {/* Filtro */}
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {(['pendente','tudo'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                style={{
                  fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                  background: filtro===f ? 'white' : 'rgba(255,255,255,.2)',
                  color:      filtro===f ? '#b45309' : 'white',
                  border: 'none',
                }}>
                {f === 'pendente' ? 'Pendentes' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:32, color:'#94a3b8', fontSize:11 }}>Carregando...</div>
          )}
          {!loading && analises.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:11 }}>
                {filtro === 'pendente' ? 'Nenhuma análise pendente!' : 'Nenhuma análise registrada.'}
              </div>
            </div>
          )}

          {analises.map(sol => {
            const setores: any[] = sol.analise_setores || [];
            const pendentes = setores.filter(s => s.status !== 'concluido').length;
            const exp = expandido[sol.id] !== false; // padrão expandido
            const origem = sol.origem === 'licitacao' ? '🏛️ Licitação' : sol.origem === 'crm' ? '💼 CRM' : sol.origem;

            return (
              <div key={sol.id} style={{
                border: `1px solid ${sol.status === 'concluido' ? '#d1fae5' : '#fde68a'}`,
                borderRadius: 8, marginBottom: 10, overflow:'hidden',
                background: sol.status === 'concluido' ? '#f0fdf4' : '#fffbeb',
              }}>

                {/* Cabeçalho do card */}
                <div
                  style={{ padding:'10px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
                  onClick={() => setExpandido(prev => ({ ...prev, [sol.id]: !exp }))}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'#64748b',
                        background:'#e2e8f0', borderRadius:3, padding:'1px 6px' }}>
                        {origem}
                      </span>
                      {sol.origem_numero && (
                        <span style={{ fontSize:9, color:'#475569' }}>#{sol.origem_numero}</span>
                      )}
                      <span style={{
                        fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3,
                        background: sol.status === 'concluido' ? '#d1fae5' : '#fef3c7',
                        color:      sol.status === 'concluido' ? '#065f46' : '#92400e',
                      }}>
                        {sol.status === 'concluido' ? '✅ Concluída' : `⏳ ${pendentes} pendente(s)`}
                      </span>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginTop:3 }}>
                      {sol.origem_titulo || '(sem título)'}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:9, color:'#94a3b8' }}>
                        Solicitado em {fmtDT(sol.criado_em)} por {sol.criado_por || '—'}
                      </span>
                      {onNavigate && (
                        <button
                          onClick={e => { e.stopPropagation(); onNavigate(sol.origem === 'crm' ? 'crm' : 'licitacoes'); }}
                          style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:4, border:'none',
                            background: sol.origem === 'crm' ? '#0891b2' : '#7c3aed',
                            color:'white', cursor:'pointer' }}>
                          {sol.origem === 'crm' ? '💼 Abrir no CRM' : '🏛️ Abrir Licitações'}
                        </button>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize:12, color:'#94a3b8' }}>{exp ? '▲' : '▼'}</span>
                </div>

                {/* Setores */}
                {exp && (
                  <div style={{ borderTop:'1px solid #e2e8f0', padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
                    {setores.length === 0 && (
                      <div style={{ fontSize:10, color:'#94a3b8' }}>Nenhum setor cadastrado para esta análise.</div>
                    )}
                    {setores.map(setor => {
                      const concluido = setor.status === 'concluido';
                      const salvandoSetor = salvando[setor.id];
                      const cor = SETOR_COR[setor.setor] || '#64748b';
                      const label = SETOR_LABEL[setor.setor] || setor.setor;

                      return (
                        <div key={setor.id} style={{
                          border: `1px solid ${concluido ? '#d1fae5' : '#e2e8f0'}`,
                          borderLeft: `3px solid ${cor}`,
                          borderRadius: 6, padding:'8px 10px',
                          background: concluido ? '#f0fdf4' : 'white',
                        }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{
                              fontSize:10, fontWeight:700, color: concluido ? '#065f46' : cor,
                            }}>
                              {concluido ? '✅' : '⏳'} {label}
                            </span>
                            {concluido && setor.analisado_por && (
                              <span style={{ fontSize:9, color:'#64748b' }}>
                                por {setor.analisado_por} · {fmtDT(setor.analisado_em)}
                              </span>
                            )}
                            {concluido && (
                              <button onClick={() => reabrirSetor(setor)}
                                style={{ marginLeft:'auto', fontSize:8, color:'#94a3b8', background:'none',
                                  border:'1px solid #e2e8f0', borderRadius:3, padding:'1px 6px', cursor:'pointer' }}>
                                Reabrir
                              </button>
                            )}
                          </div>

                          {/* Nota do setor concluído */}
                          {concluido && setor.notas && (
                            <div style={{ fontSize:9, color:'#475569', marginTop:4, fontStyle:'italic' }}>
                              📝 {setor.notas}
                            </div>
                          )}

                          {/* Campo nota + botão concluir (apenas pendentes) */}
                          {!concluido && (
                            <div style={{ marginTop:6 }}>
                              <input
                                value={notas[setor.id] || ''}
                                onChange={e => setNotas(prev => ({ ...prev, [setor.id]: e.target.value }))}
                                placeholder="Observação / resultado da análise (opcional)..."
                                style={{ width:'100%', padding:'4px 8px', border:'1px solid #d1d5db',
                                  borderRadius:4, fontSize:9, boxSizing:'border-box', marginBottom:6 }}
                              />
                              <button
                                onClick={() => concluirSetor(sol, setor)}
                                disabled={salvandoSetor}
                                style={{
                                  fontSize:9, fontWeight:700, padding:'4px 12px', borderRadius:4,
                                  background: salvandoSetor ? '#94a3b8' : '#16a34a',
                                  color:'white', border:'none', cursor:'pointer',
                                  opacity: salvandoSetor ? .7 : 1,
                                }}>
                                {salvandoSetor ? '⏳ Salvando...' : '✅ Concluir este setor'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{ borderTop:'1px solid #e2e8f0', padding:'10px 14px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f8fafc' }}>
          <span style={{ fontSize:9, color:'#94a3b8' }}>
            {analises.length} registro(s) exibido(s)
          </span>
          <button onClick={load}
            style={{ fontSize:9, fontWeight:700, padding:'4px 12px', borderRadius:4,
              background:'#b45309', color:'white', border:'none', cursor:'pointer' }}>
            🔄 Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
