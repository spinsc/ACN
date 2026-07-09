// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


// ─── MODAL DE OBSERVAÇÕES ────────────────────────────────────────────────────
function ModalObservacao({ item, tabela, currentUser, onClose, onSaved }) {
  const [novaObs, setNovaObs]   = useState('');
  const [salvando, setSalvando] = useState(false);
  const obsExistentes = item.observacoes || '';

  const salvar = async () => {
    if (!novaObs.trim()) { alert('Digite uma observação!'); return; }
    setSalvando(true);
    const agora = new Date().toLocaleString('pt-BR');
    const linha = `[${agora} — ${currentUser?.nome || 'Sistema'}]: ${novaObs.trim()}`;
    const novoTexto = obsExistentes ? `${obsExistentes}\n${linha}` : linha;
    const { error } = await supabase.from(tabela).update({ observacoes: novoTexto }).eq('id', item.id);
    if (error) alert('Erro: ' + error.message);
    setSalvando(false);
    onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{maxWidth:500}}>
        <div className="modal-title">💬 Observações — {item.numero_pedido || item.numero_requisicao}</div>
        {obsExistentes ? (
          <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'10px',
            marginBottom:12,fontSize:10,color:'#374151',whiteSpace:'pre-wrap',maxHeight:200,overflowY:'auto',lineHeight:1.8}}>
            {obsExistentes}
          </div>
        ) : (
          <div style={{fontSize:10,color:'#9ca3af',marginBottom:12,fontStyle:'italic'}}>Sem observações anteriores.</div>
        )}
        <label className="acn-label">Nova observação</label>
        <textarea value={novaObs} onChange={e=>setNovaObs(e.target.value)} rows={4}
          placeholder="Ex: Fornecedor adiou prazo para 15/08. Aguardando confirmação..."
          style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:11,
            resize:'vertical',boxSizing:'border-box',marginBottom:12}} />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose}
            style={{padding:'7px 16px',border:'1px solid #d1d5db',borderRadius:6,background:'#fff',fontSize:11,cursor:'pointer'}}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{padding:'7px 20px',background:'#0891b2',color:'#fff',border:'none',borderRadius:6,fontWeight:700,fontSize:11,cursor:'pointer'}}>
            {salvando ? '...' : '💾 Salvar observação'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComprasTab({ currentUser }) {
  const [tab, setTab] = useState('vinculadas');
  const [pedidosVinculados, setPedidosVinculados] = useState([]);
  const [pedidosEspeciais, setPedidosEspeciais] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [modalObs, setModalObs] = useState<{item:any,tabela:string}|null>(null);
  const [editandoPrazo, setEditandoPrazo] = useState<{id:string,tabela:string,valor:string}|null>(null);
  const [formData, setFormData] = useState({
    tipoPedido: 'Projeto Especial',
    descricao: '',
    quantidade: 1,
    valor: 0,
    fornecedor: '',
    prazoEntrega: '',
    observacoes: '',
  });

  const [kpis, setKpis] = useState({
    totalPedidos: 0,
    concluidos: 0,
    pendentes: 0,
    percentualConclusao: 0,
    valorTotal: 0,
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [tab, filterStatus]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === 'vinculadas') {
        let query = supabase.from('pcp_pedidos_compra').select('*').order('data_prevista', { ascending: true });
        if (filterStatus) query = query.eq('status_solicitacao', filterStatus);
        const { data } = await query;
        setPedidosVinculados(data || []);
      } else {
        let query = supabase.from('compras_especiais').select('*').order('data_solicitacao', { ascending: false });
        if (filterStatus) query = query.eq('status_solicitacao', filterStatus);
        const { data } = await query;
        setPedidosEspeciais(data || []);
      }

      calcularKPIs(tab);
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  const calcularKPIs = async (tabAtiva) => {
    try {
      let data = [];
      if (tabAtiva === 'vinculadas') {
        const { data: d } = await supabase.from('pcp_pedidos_compra').select('*');
        data = d || [];
      } else {
        const { data: d } = await supabase.from('compras_especiais').select('*');
        data = d || [];
      }

      const total = data.length;
      const concluir = data.filter(p => p.status_solicitacao === 'Concluído').length;
      const pend = data.filter(p => p.status_solicitacao === 'Pendente').length;
      const percentual = total > 0 ? Math.round((concluir / total) * 100) : 0;

      const valores = data.map(p => (p.valor_unitario || 0) * (p.quantidade || 0)).reduce((a, b) => a + b, 0);

      setKpis({
        totalPedidos: total,
        concluidos: concluir,
        pendentes: pend,
        percentualConclusao: percentual,
        valorTotal: Math.round(valores * 100) / 100,
      });
    } catch (err) {
      console.error('Erro ao calcular KPIs:', err);
    }
  };

  const salvarPedidoEspecial = async () => {
    if (!formData.descricao || !formData.quantidade) {
      alert('Preencha os campos obrigatórios');
      return;
    }

    try {
      const { error } = await supabase.from('compras_especiais').insert([
        {
          numero_requisicao: `CMP-${Date.now()}`,
          tipo_pedido: formData.tipoPedido,
          descricao_material: formData.descricao,
          quantidade: formData.quantidade,
          valor_unitario: formData.valor || null,
          fornecedor: formData.fornecedor || null,
          prazo_entrega: formData.prazoEntrega || null,
          observacoes: formData.observacoes
            ? `[${new Date().toLocaleString('pt-BR')} — ${currentUser?.nome || 'Sistema'}]: ${formData.observacoes}`
            : '',
          criado_por: currentUser?.nome || 'Desconhecido',
          data_prevista: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);

      if (error) {
        alert('❌ Erro: ' + error.message);
      } else {
        alert('✅ Pedido criado!');
        setFormData({ tipoPedido: 'Projeto Especial', descricao: '', quantidade: 1, valor: 0, fornecedor: '', prazoEntrega: '', observacoes: '' });
        setShowForm(false);
        fetchData();
      }
    } catch (err) {
      alert('❌ ' + err.message);
    }
  };

  const salvarPrazo = async () => {
    if (!editandoPrazo) return;
    const { error } = await supabase.from(editandoPrazo.tabela)
      .update({ prazo_entrega: editandoPrazo.valor || null }).eq('id', editandoPrazo.id);
    if (error) alert('Erro: ' + error.message);
    setEditandoPrazo(null);
    fetchData();
  };

  const updateStatus = async (id, tabela, novoStatus) => {
    try {
      const updateData = { status_solicitacao: novoStatus };
      if (novoStatus === 'Concluído') {
        updateData.data_conclusao = new Date().toISOString();
      }

      const { error } = await supabase.from(tabela).update(updateData).eq('id', id);

      if (error) {
        alert('❌ Erro: ' + error.message);
      } else {
        alert('✅ Status atualizado!');
        fetchData();
      }
    } catch (err) {
      alert('❌ ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pendente':    '#fbbf24',
      'Em Andamento':'#3b82f6',
      'Comprado':    '#7c3aed',
      'Concluído':   '#22c55e',
    };
    return colors[status] || '#9ca3af';
  };

  const fmtPrazo = (d) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
    const str = dt.toLocaleDateString('pt-BR');
    if (diff < 0) return <span style={{color:'#dc2626',fontWeight:700}}>{str} ⚠️</span>;
    if (diff === 0) return <span style={{color:'#f59e0b',fontWeight:700}}>Hoje!</span>;
    if (diff <= 3) return <span style={{color:'#f59e0b',fontWeight:700}}>{str}</span>;
    return str;
  };

  const formatValor = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h2 style={styles.title}>💳 Requisições de Compra</h2>
        <div style={styles.filterRow}>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={styles.select}>
            <option value="">Todos os Status</option>
            <option value="Pendente">Pendente</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Comprado">Comprado</option>
            <option value="Concluído">Concluído</option>
          </select>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e0e0e0' }}>
        <button
          onClick={() => setTab('vinculadas')}
          style={{
            ...styles.tabButton,
            borderBottomColor: tab === 'vinculadas' ? '#22c55e' : 'transparent',
            color: tab === 'vinculadas' ? '#1a3a52' : '#666',
          }}
        >
          📦 OP Vinculada ({pedidosVinculados.length})
        </button>
        <button
          onClick={() => setTab('especiais')}
          style={{
            ...styles.tabButton,
            borderBottomColor: tab === 'especiais' ? '#22c55e' : 'transparent',
            color: tab === 'especiais' ? '#1a3a52' : '#666',
          }}
        >
          ⭐ Projeto Especial/Estoque ({pedidosEspeciais.length})
        </button>
      </div>

      {/* ABA: OP VINCULADA */}
      {tab === 'vinculadas' && (
        <div>
          <h3 style={styles.sectionTitle}>📋 Pedidos Vinculados a OP</h3>
          {loading ? (
            <div style={styles.loading}>Carregando...</div>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th>Número</th>
                    <th>OP</th>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Valor Unit.</th>
                    <th>Fornecedor</th>
                    <th>Prazo Entrega</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosVinculados.map((pedido) => (
                    <tr key={pedido.id} style={styles.tableRow}>
                      <td style={styles.tableCell}><strong>{pedido.numero_pedido}</strong></td>
                      <td style={styles.tableCell}>{pedido.opl}</td>
                      <td style={styles.tableCell}>{pedido.descricao_material?.substring(0, 35)}</td>
                      <td style={styles.tableCell}>{pedido.quantidade}</td>
                      <td style={styles.tableCell}>{formatValor(pedido.valor_unitario)}</td>
                      <td style={styles.tableCell}>{pedido.fornecedor?.substring(0, 20) || '—'}</td>
                      <td style={styles.tableCell}>
                        {editandoPrazo?.id === pedido.id ? (
                          <div style={{display:'flex',gap:4,alignItems:'center'}}>
                            <input type="date" value={editandoPrazo.valor}
                              onChange={e => setEditandoPrazo({...editandoPrazo, valor: e.target.value})}
                              style={{fontSize:10,padding:'2px 4px',border:'1px solid #d1d5db',borderRadius:4}} />
                            <button onClick={salvarPrazo} style={{...styles.buttonSmall,backgroundColor:'#22c55e',padding:'2px 6px'}}>✓</button>
                            <button onClick={() => setEditandoPrazo(null)} style={{...styles.buttonSmall,backgroundColor:'#9ca3af',padding:'2px 6px'}}>✕</button>
                          </div>
                        ) : (
                          <span onClick={() => setEditandoPrazo({id:pedido.id,tabela:'pcp_pedidos_compra',valor:pedido.prazo_entrega||''})}
                            style={{cursor:'pointer'}} title="Clique para editar">
                            {fmtPrazo(pedido.prazo_entrega)} <span style={{fontSize:9,color:'#94a3b8'}}>✏️</span>
                          </span>
                        )}
                      </td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '4px 10px', borderRadius: '4px', color: 'white', fontSize: '11px', fontWeight: 'bold', backgroundColor: getStatusColor(pedido.status_solicitacao) }}>
                          {pedido.status_solicitacao}
                        </span>
                      </td>
                      <td style={{ ...styles.tableCell, whiteSpace:'nowrap' }}>
                        {pedido.status_solicitacao === 'Pendente' && (
                          <button onClick={() => updateStatus(pedido.id, 'pcp_pedidos_compra', 'Em Andamento')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#3b82f6', marginRight: '4px' }} title="Iniciar">▶️</button>
                        )}
                        {pedido.status_solicitacao === 'Em Andamento' && (
                          <button onClick={() => updateStatus(pedido.id, 'pcp_pedidos_compra', 'Comprado')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#7c3aed', marginRight: '4px' }} title="Marcar como Comprado">🛒</button>
                        )}
                        {pedido.status_solicitacao === 'Comprado' && (
                          <button onClick={() => updateStatus(pedido.id, 'pcp_pedidos_compra', 'Concluído')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#22c55e', marginRight: '4px' }} title="Concluir">✅</button>
                        )}
                        <button onClick={() => setModalObs({ item: pedido, tabela: 'pcp_pedidos_compra' })}
                          style={{ ...styles.buttonSmall, backgroundColor: '#0891b2' }} title="Observações">💬</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA: PROJETO ESPECIAL/ESTOQUE */}
      {tab === 'especiais' && (
        <div>
          <h3 style={styles.sectionTitle}>⭐ Projetos Especiais e Estoque</h3>

          {!showForm && (
            <button onClick={() => setShowForm(true)} style={styles.buttonNew}>
              ➕ Novo Pedido Especial
            </button>
          )}

          {showForm && (
            <div style={styles.formCard}>
              <select value={formData.tipoPedido} onChange={(e) => setFormData({ ...formData, tipoPedido: e.target.value })} style={styles.input}>
                <option value="Projeto Especial">Projeto Especial</option>
                <option value="Estoque">Estoque</option>
              </select>

              <input
                type="text"
                placeholder="Descrição do material"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                style={styles.input}
              />

              <input
                type="number"
                placeholder="Quantidade"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) })}
                style={styles.input}
              />

              <input
                type="number"
                placeholder="Valor unitário"
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) })}
                style={styles.input}
              />

              <input
                type="text"
                placeholder="Fornecedor"
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                style={styles.input}
              />

              <div>
                <label style={{fontSize:11,color:'#6b7280',display:'block',marginBottom:4}}>Prazo de Entrega</label>
                <input
                  type="date"
                  value={formData.prazoEntrega}
                  onChange={(e) => setFormData({ ...formData, prazoEntrega: e.target.value })}
                  style={styles.input}
                />
              </div>

              <textarea
                placeholder="Observação inicial"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                style={{ ...styles.input, minHeight: '60px' }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => salvarPedidoEspecial()} style={{ ...styles.buttonSmall, backgroundColor: '#22c55e', flex: 1 }}>
                  💾 Salvar
                </button>
                <button onClick={() => { setShowForm(false); setFormData({ tipoPedido: 'Projeto Especial', descricao: '', quantidade: 1, valor: 0, fornecedor: '', prazoEntrega: '', observacoes: '' }); }} style={{ ...styles.buttonSmall, backgroundColor: '#9ca3af', flex: 1 }}>
                  ✖️ Cancelar
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={styles.loading}>Carregando...</div>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th>Número</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Valor Unit.</th>
                    <th>Fornecedor</th>
                    <th>Prazo Entrega</th>
                    <th>Observações</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosEspeciais.map((pedido) => (
                    <tr key={pedido.id} style={styles.tableRow}>
                      <td style={styles.tableCell}><strong>{pedido.numero_requisicao}</strong></td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '3px 7px', borderRadius: '4px', backgroundColor: pedido.tipo_pedido === 'Projeto Especial' ? '#f59e0b' : '#3b82f6', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>
                          {pedido.tipo_pedido}
                        </span>
                      </td>
                      <td style={styles.tableCell}>{pedido.descricao_material?.substring(0, 35)}</td>
                      <td style={styles.tableCell}>{pedido.quantidade}</td>
                      <td style={styles.tableCell}>{formatValor(pedido.valor_unitario)}</td>
                      <td style={styles.tableCell}>{pedido.fornecedor?.substring(0, 20) || '—'}</td>
                      <td style={styles.tableCell}>{fmtPrazo(pedido.prazo_entrega)}</td>
                      <td style={{ ...styles.tableCell, maxWidth:160 }}>
                        <small style={{color:'#6b7280',whiteSpace:'pre-wrap',display:'block',maxHeight:48,overflow:'hidden'}}>
                          {pedido.observacoes
                            ? pedido.observacoes.split('\n').slice(-1)[0]?.substring(0,60) + (pedido.observacoes.length > 60 ? '…' : '')
                            : '—'}
                        </small>
                      </td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '4px 10px', borderRadius: '4px', color: 'white', fontSize: '11px', fontWeight: 'bold', backgroundColor: getStatusColor(pedido.status_solicitacao) }}>
                          {pedido.status_solicitacao}
                        </span>
                      </td>
                      <td style={{ ...styles.tableCell, whiteSpace:'nowrap' }}>
                        {pedido.status_solicitacao === 'Pendente' && (
                          <button onClick={() => updateStatus(pedido.id, 'compras_especiais', 'Em Andamento')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#3b82f6', marginRight: '4px' }} title="Iniciar">▶️</button>
                        )}
                        {pedido.status_solicitacao === 'Em Andamento' && (
                          <button onClick={() => updateStatus(pedido.id, 'compras_especiais', 'Comprado')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#7c3aed', marginRight: '4px' }} title="Marcar como Comprado">🛒</button>
                        )}
                        {pedido.status_solicitacao === 'Comprado' && (
                          <button onClick={() => updateStatus(pedido.id, 'compras_especiais', 'Concluído')}
                            style={{ ...styles.buttonSmall, backgroundColor: '#22c55e', marginRight: '4px' }} title="Concluir">✅</button>
                        )}
                        <button onClick={() => setModalObs({ item: pedido, tabela: 'compras_especiais' })}
                          style={{ ...styles.buttonSmall, backgroundColor: '#0891b2' }} title="Observações">💬</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de Observações */}
      {modalObs && (
        <ModalObservacao
          item={modalObs.item}
          tabela={modalObs.tabela}
          currentUser={currentUser}
          onClose={() => setModalObs(null)}
          onSaved={fetchData}
        />
      )}

      {/* KPIs */}
      <div style={styles.kpiSection}>
        <h3 style={styles.sectionTitle}>⏱️ Indicadores de Desempenho</h3>
        <div style={styles.kpiGrid}>
          <div style={styles.kpiCard}>
            <div style={styles.kpiValue}>{kpis.totalPedidos}</div>
            <div style={styles.kpiLabel}>Total de Pedidos</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiValue}>{kpis.concluidos}</div>
            <div style={styles.kpiLabel}>Concluídos</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiValue}>{kpis.pendentes}</div>
            <div style={styles.kpiLabel}>Pendentes</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiValue}>{kpis.percentualConclusao}%</div>
            <div style={styles.kpiLabel}>Taxa de Conclusão</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiValue}>{formatValor(kpis.valorTotal)}</div>
            <div style={styles.kpiLabel}>Valor Total</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  header: {
    marginBottom: '30px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 15px 0',
    color: '#1a3a52',
  },
  filterRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    minWidth: '180px',
  },
  tabButton: {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '0 0 15px 0',
    color: '#1a3a52',
    paddingBottom: '10px',
    borderBottom: '2px solid #e0e0e0',
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '30px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    borderBottom: '2px solid #ddd',
  },
  tableRow: {
    borderBottom: '1px solid #eee',
  },
  tableCell: {
    padding: '12px 8px',
    textAlign: 'left',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
  },
  buttonNew: {
    backgroundColor: '#1a3a52',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginBottom: '15px',
  },
  buttonSmall: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  formCard: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box',
  },
  kpiSection: {
    marginTop: '30px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
  },
  kpiCard: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a3a52',
    margin: '0 0 8px 0',
  },
  kpiLabel: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
  },
};
