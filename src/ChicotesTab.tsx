// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


export default function ChicotesTab({ currentUser }) {
  const [tab, setTab] = useState('vinculadas');
  const [pedidosVinculados, setPedidosVinculados] = useState([]);
  const [pedidosEspeciais, setPedidosEspeciais] = useState([]);
  const [opsDisponiveis, setOpsDisponiveis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    tipoPedido: 'Projeto Especial',
    descricao: '',
    quantidade: 1,
    observacoes: '',
  });

  const [kpis, setKpis] = useState({
    totalPedidos: 0,
    concluidos: 0,
    pendentes: 0,
    tempoMedio: 0,
    percentualConclusao: 0,
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [tab, filterStatus]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Carregar OPs disponíveis
      const { data: opsData } = await supabase
        .from('oples')
        .select('id, opl, cliente_nome, categoria_servico')
        .order('opl', { ascending: false });
      setOpsDisponiveis(opsData || []);

      if (tab === 'vinculadas') {
        // Carregar pedidos vinculados
        let query = supabase.from('pcp_pedidos_chicotes').select('*').order('data_prevista', { ascending: true });
        if (filterStatus) query = query.eq('status_solicitacao', filterStatus);
        const { data } = await query;
        setPedidosVinculados(data || []);
      } else {
        // Carregar pedidos especiais
        let query = supabase.from('chicotes_especiais').select('*').order('data_solicitacao', { ascending: false });
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
        const { data: d } = await supabase.from('pcp_pedidos_chicotes').select('*');
        data = d || [];
      } else {
        const { data: d } = await supabase.from('chicotes_especiais').select('*');
        data = d || [];
      }

      const total = data.length;
      const concluir = data.filter(p => p.status_solicitacao === 'Concluído').length;
      const pend = data.filter(p => p.status_solicitacao === 'Pendente').length;
      const percentual = total > 0 ? Math.round((concluir / total) * 100) : 0;

      setKpis({
        totalPedidos: total,
        concluidos: concluir,
        pendentes: pend,
        tempoMedio: 0,
        percentualConclusao: percentual,
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
      const { error } = await supabase.from('chicotes_especiais').insert([
        {
          numero_pedido: `CHE-${Date.now()}`,
          tipo_pedido: formData.tipoPedido,
          descricao: formData.descricao,
          quantidade: formData.quantidade,
          observacoes: formData.observacoes,
          criado_por: currentUser?.nome || 'Desconhecido',
          data_prevista: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);

      if (error) {
        alert('❌ Erro: ' + error.message);
      } else {
        alert('✅ Pedido criado!');
        setFormData({ tipoPedido: 'Projeto Especial', descricao: '', quantidade: 1, observacoes: '' });
        setShowForm(false);
        fetchData();
      }
    } catch (err) {
      alert('❌ ' + err.message);
    }
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
      'Pendente': '#fbbf24',
      'Em Andamento': '#3b82f6',
      'Concluído': '#22c55e',
    };
    return colors[status] || '#9ca3af';
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h2 style={styles.title}>🔧 Montagem de Chicotes</h2>
        <div style={styles.filterRow}>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={styles.select}>
            <option value="">Todos os Status</option>
            <option value="Pendente">Pendente</option>
            <option value="Em Andamento">Em Andamento</option>
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
                    <th>Cliente</th>
                    <th>Descrição</th>
                    <th>Quantidade</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosVinculados.map((pedido) => (
                    <tr key={pedido.id} style={styles.tableRow}>
                      <td style={styles.tableCell}><strong>{pedido.numero_pedido}</strong></td>
                      <td style={styles.tableCell}>{pedido.opl}</td>
                      <td style={styles.tableCell}>—</td>
                      <td style={styles.tableCell}>{pedido.descricao_chicote?.substring(0, 30)}</td>
                      <td style={styles.tableCell}>{pedido.quantidade}</td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '6px 12px', borderRadius: '4px', color: 'white', fontSize: '12px', fontWeight: 'bold', backgroundColor: getStatusColor(pedido.status_solicitacao) }}>
                          {pedido.status_solicitacao}
                        </span>
                      </td>
                      <td style={styles.tableCell}>
                        {pedido.status_solicitacao !== 'Concluído' && (
                          <>
                            {pedido.status_solicitacao === 'Pendente' && (
                              <button onClick={() => updateStatus(pedido.id, 'pcp_pedidos_chicotes', 'Em Andamento')} style={{ ...styles.buttonSmall, backgroundColor: '#3b82f6', marginRight: '5px' }}>
                                ▶️
                              </button>
                            )}
                            {pedido.status_solicitacao === 'Em Andamento' && (
                              <button onClick={() => updateStatus(pedido.id, 'pcp_pedidos_chicotes', 'Concluído')} style={{ ...styles.buttonSmall, backgroundColor: '#22c55e' }}>
                                ✅
                              </button>
                            )}
                          </>
                        )}
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
                placeholder="Descrição"
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

              <textarea
                placeholder="Observações detalhadas"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                style={{ ...styles.input, minHeight: '80px' }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => salvarPedidoEspecial()} style={{ ...styles.buttonSmall, backgroundColor: '#22c55e', flex: 1 }}>
                  💾 Salvar
                </button>
                <button onClick={() => { setShowForm(false); setFormData({ tipoPedido: 'Projeto Especial', descricao: '', quantidade: 1, observacoes: '' }); }} style={{ ...styles.buttonSmall, backgroundColor: '#9ca3af', flex: 1 }}>
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
                    <th>Quantidade</th>
                    <th>Observações</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosEspeciais.map((pedido) => (
                    <tr key={pedido.id} style={styles.tableRow}>
                      <td style={styles.tableCell}><strong>{pedido.numero_pedido}</strong></td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: pedido.tipo_pedido === 'Projeto Especial' ? '#f59e0b' : '#3b82f6', color: 'white', fontSize: '11px', fontWeight: 'bold' }}>
                          {pedido.tipo_pedido}
                        </span>
                      </td>
                      <td style={styles.tableCell}>{pedido.descricao?.substring(0, 30)}</td>
                      <td style={styles.tableCell}>{pedido.quantidade}</td>
                      <td style={styles.tableCell}><small>{pedido.observacoes?.substring(0, 40) || '—'}</small></td>
                      <td style={styles.tableCell}>
                        <span style={{ padding: '6px 12px', borderRadius: '4px', color: 'white', fontSize: '12px', fontWeight: 'bold', backgroundColor: getStatusColor(pedido.status_solicitacao) }}>
                          {pedido.status_solicitacao}
                        </span>
                      </td>
                      <td style={styles.tableCell}>
                        {pedido.status_solicitacao !== 'Concluído' && (
                          <>
                            {pedido.status_solicitacao === 'Pendente' && (
                              <button onClick={() => updateStatus(pedido.id, 'chicotes_especiais', 'Em Andamento')} style={{ ...styles.buttonSmall, backgroundColor: '#3b82f6', marginRight: '5px' }}>
                                ▶️
                              </button>
                            )}
                            {pedido.status_solicitacao === 'Em Andamento' && (
                              <button onClick={() => updateStatus(pedido.id, 'chicotes_especiais', 'Concluído')} style={{ ...styles.buttonSmall, backgroundColor: '#22c55e' }}>
                                ✅
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
