// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';

export default function ComprasTab({ currentUser }) {
  const [pedidos, setPedidos]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [filterStatus, setFilter] = useState('');
  const [modalObs, setModalObs]   = useState<any>(null);
  const [obsTexto, setObsTexto]   = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);

  // Inline form para "Em Andamento → Concluir Compra"
  const [concluindoId, setConcluindoId] = useState<string|null>(null);
  const [formValor, setFormValor] = useState('');
  const [formPrazo, setFormPrazo] = useState('');
  const [salvando, setSalvando]   = useState(false);

  const canVerValor = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const fmtBRL = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';

  const fmtPrazo = (d: string) => {
    if (!d) return <span style={{ color:'#9ca3af' }}>—</span>;
    const dt   = new Date(d + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
    const str  = dt.toLocaleDateString('pt-BR');
    if (diff < 0)   return <span style={{ color:'#dc2626', fontWeight:700 }}>{str} ⚠️</span>;
    if (diff === 0) return <span style={{ color:'#f59e0b', fontWeight:700 }}>Hoje!</span>;
    if (diff <= 3)  return <span style={{ color:'#f59e0b', fontWeight:600 }}>{str}</span>;
    return <span>{str}</span>;
  };

  const statusCor: Record<string,string> = {
    'Pendente':     '#fbbf24',
    'Em Andamento': '#3b82f6',
    'Comprado':     '#7c3aed',
    'Concluído':    '#22c55e',
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [filterStatus]);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('pcp_pedidos_compra').select('*').order('data_prevista', { ascending:true });
    if (filterStatus) q = q.eq('status_solicitacao', filterStatus);
    const { data } = await q;
    setPedidos(data || []);
    setLoading(false);
  };

  const updateStatus = async (id: string, novoStatus: string) => {
    const updates: any = { status_solicitacao: novoStatus };
    if (novoStatus === 'Concluído') updates.data_conclusao = new Date().toISOString();
    const { error } = await supabase.from('pcp_pedidos_compra').update(updates).eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    setFilter('');
    load();
  };

  // Abre o formulário inline para concluir compra
  const abrirConcluir = (p: any) => {
    setConcluindoId(p.id);
    setFormValor(p.valor_compra ? String(p.valor_compra) : '');
    setFormPrazo(p.prazo_entrega || '');
  };

  const confirmarCompra = async () => {
    if (!formValor) { alert('Informe o valor total da compra.'); return; }
    if (!formPrazo)  { alert('Informe a previsão de recebimento.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      status_solicitacao: 'Comprado',
      valor_compra:       parseFloat(formValor.replace(',', '.')),
      prazo_entrega:      formPrazo,
    }).eq('id', concluindoId);
    if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
    setConcluindoId(null);
    setFormValor(''); setFormPrazo('');
    setFilter('');
    setSalvando(false);
    load();
  };

  const salvarObs = async () => {
    if (!obsTexto.trim() || !modalObs) return;
    setSalvandoObs(true);
    const agora = new Date().toLocaleString('pt-BR');
    const linha = `[${agora} — ${currentUser?.nome || 'Sistema'}]: ${obsTexto.trim()}`;
    const atual = modalObs.observacoes || '';
    const novoTexto = atual ? `${atual}\n${linha}` : linha;
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ observacoes: novoTexto }).eq('id', modalObs.id);
    if (error) { alert('Erro: ' + error.message); } else { setObsTexto(''); setModalObs(null); load(); }
    setSalvandoObs(false);
  };

  // KPIs calculados sobre TODOS os pedidos (sem filtro)
  const total       = pedidos.length;
  const pendentes   = pedidos.filter(p => p.status_solicitacao === 'Pendente').length;
  const emAndamento = pedidos.filter(p => p.status_solicitacao === 'Em Andamento').length;
  const comprados   = pedidos.filter(p => p.status_solicitacao === 'Comprado').length;
  const concluidos  = pedidos.filter(p => p.status_solicitacao === 'Concluído').length;
  const pct         = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  return (
    <div style={{ background:'#fff', borderRadius:8, padding:20, marginTop:16, boxShadow:'0 1px 3px #0001' }}>

      {/* ── CABEÇALHO ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:'#1a3a52', margin:0 }}>
          🛒 Requisições de Compra — OP Vinculada
        </h2>
        <select value={filterStatus} onChange={e => setFilter(e.target.value)}
          style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:11 }}>
          <option value="">Todos os status</option>
          <option value="Pendente">Pendente</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Comprado">Comprado</option>
          <option value="Concluído">Concluído</option>
        </select>
      </div>

      {/* ── TABELA ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:30, color:'#9ca3af' }}>Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:12 }}>Nenhuma requisição encontrada.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f1f5f9', borderBottom:'2px solid #e2e8f0' }}>
                <th style={th}>Nº Pedido</th>
                <th style={th}>OP</th>
                <th style={th}>Descrição</th>
                <th style={th}>Qtd</th>
                {canVerValor && <th style={th}>Valor Compra</th>}
                <th style={th}>Prev. Recebimento</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => {
                const isConcluindo = concluindoId === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <tr style={{ borderBottom: isConcluindo ? 'none' : '1px solid #f1f5f9',
                      background: isConcluindo ? '#f0fdf4' : 'transparent' }}>

                      <td style={td}><strong>{p.numero_pedido}</strong></td>
                      <td style={td}>{p.opl || '—'}</td>
                      <td style={{ ...td, maxWidth:160 }}>
                        <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.descricao_material}
                        </span>
                      </td>
                      <td style={td}>{p.quantidade}</td>

                      {canVerValor && (
                        <td style={td}>
                          {p.valor_compra
                            ? <strong style={{ color:'#16a34a' }}>{fmtBRL(p.valor_compra)}</strong>
                            : <span style={{ color:'#9ca3af' }}>—</span>}
                        </td>
                      )}

                      <td style={td}>{fmtPrazo(p.prazo_entrega)}</td>

                      <td style={td}>
                        <span style={{ padding:'3px 9px', borderRadius:4, color:'#fff', fontSize:10, fontWeight:700,
                          background: statusCor[p.status_solicitacao] || '#9ca3af' }}>
                          {p.status_solicitacao}
                        </span>
                      </td>

                      <td style={{ ...td, whiteSpace:'nowrap' }}>
                        {/* ▶️ Pendente → Em Andamento */}
                        {p.status_solicitacao === 'Pendente' && !isConcluindo && (
                          <button onClick={() => updateStatus(p.id, 'Em Andamento')}
                            style={{ ...btn, background:'#3b82f6', marginRight:4 }}>▶️ Iniciar</button>
                        )}

                        {/* ✅ Em Andamento → abre campos inline */}
                        {p.status_solicitacao === 'Em Andamento' && !isConcluindo && (
                          <button onClick={() => abrirConcluir(p)}
                            style={{ ...btn, background:'#16a34a', marginRight:4 }}>
                            ✅ Concluir Compra
                          </button>
                        )}

                        {/* 📦 Comprado → Concluído */}
                        {p.status_solicitacao === 'Comprado' && (
                          <button onClick={() => updateStatus(p.id, 'Concluído')}
                            style={{ ...btn, background:'#0891b2', marginRight:4 }}>📦 Recebido</button>
                        )}

                        {/* 💬 sempre */}
                        <button onClick={() => { setModalObs(p); setObsTexto(''); }}
                          style={{ ...btn, background: p.observacoes ? '#0891b2' : '#64748b' }}>
                          💬 Obs
                        </button>
                      </td>
                    </tr>

                    {/* ── LINHA INLINE: campos de valor + prazo ── */}
                    {isConcluindo && (
                      <tr style={{ background:'#f0fdf4', borderBottom:'2px solid #16a34a' }}>
                        <td colSpan={canVerValor ? 8 : 7} style={{ padding:'10px 14px' }}>
                          <div style={{ display:'flex', alignItems:'flex-end', gap:12, flexWrap:'wrap' }}>
                            <div>
                              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#166534', marginBottom:4 }}>
                                💰 Valor total da compra (R$) *
                              </label>
                              <input
                                type="number" step="0.01" min="0"
                                value={formValor}
                                onChange={e => setFormValor(e.target.value)}
                                placeholder="0,00"
                                autoFocus
                                style={{ padding:'7px 10px', border:'2px solid #16a34a', borderRadius:6,
                                  fontSize:13, width:160, outline:'none' }}
                              />
                            </div>
                            <div>
                              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#166534', marginBottom:4 }}>
                                📅 Previsão de recebimento *
                              </label>
                              <input
                                type="date"
                                value={formPrazo}
                                onChange={e => setFormPrazo(e.target.value)}
                                style={{ padding:'7px 10px', border:'2px solid #16a34a', borderRadius:6,
                                  fontSize:13, width:160, outline:'none' }}
                              />
                            </div>
                            <div style={{ display:'flex', gap:8, paddingBottom:1 }}>
                              <button onClick={confirmarCompra} disabled={salvando}
                                style={{ ...btn, background:'#16a34a', padding:'8px 18px', fontSize:12 }}>
                                {salvando ? 'Salvando...' : '✅ Confirmar Compra'}
                              </button>
                              <button onClick={() => setConcluindoId(null)}
                                style={{ ...btn, background:'#94a3b8', padding:'8px 14px', fontSize:12 }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))', gap:10 }}>
        {[
          { label:'Total',        valor: total,       cor:'#1e293b' },
          { label:'Pendentes',    valor: pendentes,   cor:'#fbbf24' },
          { label:'Em Andamento', valor: emAndamento, cor:'#3b82f6' },
          { label:'Comprados',    valor: comprados,   cor:'#7c3aed' },
          { label:'Concluídos',   valor: concluidos,  cor:'#22c55e' },
          { label:'Conclusão',    valor: pct + '%',   cor:'#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 6px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color:k.cor }}>{k.valor}</div>
            <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── MODAL OBSERVAÇÕES ── */}
      {modalObs && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setModalObs(null); setObsTexto(''); } }}>
          <div className="modal-box" style={{ maxWidth:500 }}>
            <div className="modal-title">💬 Observações — {modalObs.numero_pedido}</div>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:10 }}>{modalObs.descricao_material}</div>

            {modalObs.observacoes ? (
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:10,
                marginBottom:12, fontSize:10, whiteSpace:'pre-wrap', maxHeight:200, overflowY:'auto', lineHeight:1.8, color:'#374151' }}>
                {modalObs.observacoes}
              </div>
            ) : (
              <div style={{ fontSize:10, color:'#9ca3af', marginBottom:12, fontStyle:'italic' }}>Sem observações anteriores.</div>
            )}

            <label className="acn-label">Nova observação</label>
            <textarea className="acn-input" rows={4} value={obsTexto}
              onChange={e => setObsTexto(e.target.value)}
              placeholder="Ex: Fornecedor adiou entrega. Aguardando nova data..."
              style={{ width:'100%', resize:'vertical', marginBottom:12 }} />

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8' }}
                onClick={() => { setModalObs(null); setObsTexto(''); }}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0891b2' }}
                onClick={salvarObs} disabled={salvandoObs}>
                {salvandoObs ? '...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── estilos base ──
const th: React.CSSProperties = {
  padding:'8px 10px', textAlign:'left', fontWeight:700, fontSize:10, color:'#475569',
};
const td: React.CSSProperties = {
  padding:'9px 10px', verticalAlign:'middle',
};
const btn: React.CSSProperties = {
  padding:'5px 10px', border:'none', borderRadius:4, color:'#fff',
  fontSize:10, fontWeight:700, cursor:'pointer',
};
