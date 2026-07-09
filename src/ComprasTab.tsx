// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';

// ─── MODAL INICIAR COMPRA ────────────────────────────────────────────────────
function ModalIniciarCompra({ item, onClose, onSaved }) {
  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState(item.prazo_entrega || '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const updates: any = { status_solicitacao: 'Em Andamento' };
    if (valor) updates.valor_compra = parseFloat(valor.replace(',', '.'));
    if (prazo) updates.prazo_entrega = prazo;
    const { error } = await supabase.from('pcp_pedidos_compra').update(updates).eq('id', item.id);
    if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(420px,96vw)', padding:24, boxShadow:'0 8px 32px #0004' }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4, color:'#1a3a52' }}>
          ▶️ Iniciar Compra — {item.numero_pedido}
        </div>
        <div style={{ fontSize:11, color:'#6b7280', marginBottom:18 }}>
          {item.descricao_material} · Qtd: {item.quantidade}
        </div>

        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>
          Valor da compra (R$) <span style={{ color:'#9ca3af', fontWeight:400 }}>— visível só para Compras/Gerência/Admin</span>
        </label>
        <input type="number" step="0.01" min="0" value={valor}
          onChange={e => setValor(e.target.value)}
          placeholder="Ex: 1500.00"
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, boxSizing:'border-box', marginBottom:14 }} />

        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>
          Prazo previsto de entrega
        </label>
        <input type="date" value={prazo}
          onChange={e => setPrazo(e.target.value)}
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, boxSizing:'border-box', marginBottom:22 }} />

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 18px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'8px 22px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? '...' : '▶️ Iniciar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE OBSERVAÇÕES ────────────────────────────────────────────────────
function ModalObservacao({ item, currentUser, onClose, onSaved }) {
  const [novaObs, setNovaObs]   = useState('');
  const [salvando, setSalvando] = useState(false);
  const obsExistentes = item.observacoes || '';

  const salvar = async () => {
    if (!novaObs.trim()) { alert('Digite uma observação!'); return; }
    setSalvando(true);
    const agora = new Date().toLocaleString('pt-BR');
    const linha = `[${agora} — ${currentUser?.nome || 'Sistema'}]: ${novaObs.trim()}`;
    const novoTexto = obsExistentes ? `${obsExistentes}\n${linha}` : linha;
    const { error } = await supabase.from('pcp_pedidos_compra').update({ observacoes: novoTexto }).eq('id', item.id);
    if (error) alert('Erro: ' + error.message);
    setSalvando(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(500px,96vw)', padding:24, boxShadow:'0 8px 32px #0004' }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4, color:'#1a3a52' }}>
          💬 Observações — {item.numero_pedido}
        </div>
        <div style={{ fontSize:10, color:'#6b7280', marginBottom:14 }}>{item.descricao_material}</div>

        {obsExistentes ? (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:10,
            marginBottom:14, fontSize:10, color:'#374151', whiteSpace:'pre-wrap', maxHeight:200, overflowY:'auto', lineHeight:1.8 }}>
            {obsExistentes}
          </div>
        ) : (
          <div style={{ fontSize:10, color:'#9ca3af', marginBottom:14, fontStyle:'italic' }}>Sem observações anteriores.</div>
        )}

        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>Nova observação</label>
        <textarea value={novaObs} onChange={e => setNovaObs(e.target.value)} rows={4}
          placeholder="Ex: Fornecedor adiou entrega para 15/08. Aguardando nova confirmação..."
          style={{ width:'100%', padding:8, border:'1px solid #d1d5db', borderRadius:6, fontSize:11,
            resize:'vertical', boxSizing:'border-box', marginBottom:14 }} />

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#0891b2', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? '...' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ComprasTab({ currentUser }) {
  const [pedidos, setPedidos]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [filterStatus, setFilter]   = useState('');
  const [modalIniciar, setModalIniciar] = useState<any>(null);
  const [modalObs, setModalObs]     = useState<any>(null);
  const [editPrazo, setEditPrazo]   = useState<{id:string,valor:string}|null>(null);

  // Quem pode ver valor da compra
  const canVerValor = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const fmtBRL = (v: any) => v ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';

  const fmtPrazo = (d: string) => {
    if (!d) return <span style={{ color:'#9ca3af' }}>—</span>;
    const dt = new Date(d + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
    const str = dt.toLocaleDateString('pt-BR');
    if (diff < 0)  return <span style={{ color:'#dc2626', fontWeight:700 }}>{str} ⚠️</span>;
    if (diff === 0) return <span style={{ color:'#f59e0b', fontWeight:700 }}>Hoje!</span>;
    if (diff <= 3)  return <span style={{ color:'#f59e0b', fontWeight:600 }}>{str}</span>;
    return <span>{str}</span>;
  };

  const statusCor: Record<string, string> = {
    'Pendente':     '#fbbf24',
    'Em Andamento': '#3b82f6',
    'Comprado':     '#7c3aed',
    'Concluído':    '#22c55e',
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [filterStatus]);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('pcp_pedidos_compra').select('*').order('data_prevista', { ascending: true });
    if (filterStatus) q = q.eq('status_solicitacao', filterStatus);
    const { data } = await q;
    setPedidos(data || []);
    setLoading(false);
  };

  const updateStatus = async (id: string, novoStatus: string) => {
    const updates: any = { status_solicitacao: novoStatus };
    if (novoStatus === 'Concluído') updates.data_conclusao = new Date().toISOString();
    const { error } = await supabase.from('pcp_pedidos_compra').update(updates).eq('id', id);
    if (error) alert('Erro: ' + error.message);
    else load();
  };

  const salvarPrazo = async () => {
    if (!editPrazo) return;
    await supabase.from('pcp_pedidos_compra').update({ prazo_entrega: editPrazo.valor || null }).eq('id', editPrazo.id);
    setEditPrazo(null);
    load();
  };

  // KPIs
  const total      = pedidos.length;
  const concluidos = pedidos.filter(p => p.status_solicitacao === 'Concluído').length;
  const pendentes  = pedidos.filter(p => p.status_solicitacao === 'Pendente').length;
  const emAndamento = pedidos.filter(p => p.status_solicitacao === 'Em Andamento').length;
  const comprados  = pedidos.filter(p => p.status_solicitacao === 'Comprado').length;
  const pct        = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  return (
    <div style={{ background:'#fff', borderRadius:8, padding:20, marginTop:16, boxShadow:'0 1px 3px #0001' }}>

      {/* ── CABEÇALHO ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:'#1a3a52', margin:0 }}>
          🛒 Requisições de Compra — OP Vinculada
        </h2>
        <select value={filterStatus} onChange={e => setFilter(e.target.value)}
          style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12 }}>
          <option value="">Todos os status</option>
          <option value="Pendente">Pendente</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Comprado">Comprado</option>
          <option value="Concluído">Concluído</option>
        </select>
      </div>

      {/* ── TABELA ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:12 }}>Nenhuma requisição encontrada.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f1f5f9' }}>
                <th style={th}>Nº Pedido</th>
                <th style={th}>OP</th>
                <th style={th}>Descrição</th>
                <th style={th}>Qtd</th>
                {canVerValor && <th style={th}>Valor Compra</th>}
                <th style={th}>Fornecedor</th>
                <th style={th}>Prazo Entrega</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={td}><strong>{p.numero_pedido}</strong></td>
                  <td style={td}>{p.opl || '—'}</td>
                  <td style={{ ...td, maxWidth:180 }}>{p.descricao_material}</td>
                  <td style={td}>{p.quantidade}</td>

                  {canVerValor && (
                    <td style={td}>{fmtBRL(p.valor_compra)}</td>
                  )}

                  <td style={td}>{p.fornecedor || '—'}</td>

                  {/* Prazo com edição inline */}
                  <td style={td}>
                    {editPrazo?.id === p.id ? (
                      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                        <input type="date" value={editPrazo.valor}
                          onChange={e => setEditPrazo({ id: p.id, valor: e.target.value })}
                          style={{ fontSize:10, padding:'2px 4px', border:'1px solid #d1d5db', borderRadius:4 }} />
                        <button onClick={salvarPrazo}
                          style={{ ...btnSmall, background:'#22c55e', padding:'2px 6px' }}>✓</button>
                        <button onClick={() => setEditPrazo(null)}
                          style={{ ...btnSmall, background:'#9ca3af', padding:'2px 6px' }}>✕</button>
                      </div>
                    ) : (
                      <span onClick={() => setEditPrazo({ id: p.id, valor: p.prazo_entrega || '' })}
                        style={{ cursor:'pointer' }} title="Clique para editar o prazo">
                        {fmtPrazo(p.prazo_entrega)} <span style={{ fontSize:9, color:'#cbd5e1' }}>✏️</span>
                      </span>
                    )}
                  </td>

                  <td style={td}>
                    <span style={{ padding:'3px 10px', borderRadius:4, color:'#fff', fontSize:10, fontWeight:700,
                      background: statusCor[p.status_solicitacao] || '#9ca3af' }}>
                      {p.status_solicitacao}
                    </span>
                  </td>

                  <td style={{ ...td, whiteSpace:'nowrap' }}>
                    {/* ▶️ abre modal com valor + prazo */}
                    {p.status_solicitacao === 'Pendente' && (
                      <button onClick={() => setModalIniciar(p)}
                        style={{ ...btnSmall, background:'#3b82f6', marginRight:3 }} title="Iniciar compra">▶️</button>
                    )}
                    {p.status_solicitacao === 'Em Andamento' && (
                      <button onClick={() => updateStatus(p.id, 'Comprado')}
                        style={{ ...btnSmall, background:'#7c3aed', marginRight:3 }} title="Marcar como Comprado">🛒</button>
                    )}
                    {p.status_solicitacao === 'Comprado' && (
                      <button onClick={() => updateStatus(p.id, 'Concluído')}
                        style={{ ...btnSmall, background:'#22c55e', marginRight:3 }} title="Concluir">✅</button>
                    )}
                    {/* 💬 sempre disponível */}
                    <button onClick={() => setModalObs(p)}
                      style={{ ...btnSmall, background: p.observacoes ? '#0891b2' : '#94a3b8' }}
                      title={p.observacoes ? 'Ver/adicionar observações' : 'Adicionar observação'}>
                      💬
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10 }}>
        {[
          { label:'Total', valor: total, cor:'#1e293b' },
          { label:'Pendentes', valor: pendentes, cor:'#fbbf24' },
          { label:'Em Andamento', valor: emAndamento, cor:'#3b82f6' },
          { label:'Comprados', valor: comprados, cor:'#7c3aed' },
          { label:'Concluídos', valor: concluidos, cor:'#22c55e' },
          { label:'Conclusão', valor: pct + '%', cor:'#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 8px', textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:700, color: k.cor }}>{k.valor}</div>
            <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── MODAIS ── */}
      {modalIniciar && (
        <ModalIniciarCompra
          item={modalIniciar}
          currentUser={currentUser}
          onClose={() => setModalIniciar(null)}
          onSaved={load}
        />
      )}
      {modalObs && (
        <ModalObservacao
          item={modalObs}
          currentUser={currentUser}
          onClose={() => setModalObs(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── ESTILOS BASE ──
const th: React.CSSProperties = {
  padding:'8px 10px', textAlign:'left', fontWeight:700, fontSize:11, color:'#475569', borderBottom:'2px solid #e2e8f0',
};
const td: React.CSSProperties = {
  padding:'10px 10px', verticalAlign:'middle',
};
const btnSmall: React.CSSProperties = {
  padding:'5px 9px', border:'none', borderRadius:4, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer',
};
