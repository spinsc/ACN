// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState } from 'react';

const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';
export default function PedidoCompraList({ currentUser, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    numero_pedido: '',
    opl: '',
    descricao_material: '',
    quantidade: '',
    fornecedor: '',
    data_prevista_recebimento: '',
  });

  const gerarNumeroPedido = async () => {
    const { data } = await supabase
      .from('pcp_pedidos_compra')
      .select('numero_pedido')
      .like('numero_pedido', 'PC-%')
      .order('numero_pedido', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const ultimo = parseInt(data[0].numero_pedido.split('-')[1]);
      return `PC-${String(ultimo + 1).padStart(3, '0')}`;
    }
    return 'PC-001';
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.opl || !formData.descricao_material || !formData.quantidade) {
      alert('Preencha os campos obrigatórios');
      return;
    }

    try {
      const numero = formData.numero_pedido || (await gerarNumeroPedido());

      const dados = {
        ...formData,
        numero_pedido: numero,
        criado_por: currentUser.email,
        criado_por_nome: currentUser.nome,
        criado_por_setor: 'PCP',
        data_criacao: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('pcp_pedidos_compra')
        .insert([dados]);

      if (!error) {
        alert('✅ Pedido criado!');
        setShowForm(false);
        setFormData({
          numero_pedido: '',
          opl: '',
          descricao_material: '',
          quantidade: '',
          fornecedor: '',
          data_prevista_recebimento: '',
        });
        onRefresh();
      } else {
        alert('❌ Erro: ' + error.message);
      }
    } catch (err) {
      alert('❌ Erro: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar pedido?')) return;

    try {
      const { error } = await supabase
        .from('pcp_pedidos_compra')
        .delete()
        .eq('id', id);

      if (!error) {
        alert('✅ Deletado!');
        onRefresh();
      }
    } catch (err) {
      alert('❌ Erro: ' + err.message);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>📋 Pedidos de Compra</h3>

      {showForm && (
        <div style={styles.formCard}>
          <form onSubmit={handleSave} style={styles.form}>
            <div style={styles.formRow}>
              <input
                type="text"
                placeholder="OPL *"
                value={formData.opl}
                onChange={(e) => setFormData({ ...formData, opl: e.target.value })}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="Fornecedor"
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                style={styles.input}
              />
              <input
                type="number"
                placeholder="Quantidade *"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formRow}>
              <textarea
                placeholder="Descrição do Material *"
                value={formData.descricao_material}
                onChange={(e) => setFormData({ ...formData, descricao_material: e.target.value })}
                style={{ ...styles.input, minHeight: '80px' }}
              />
            </div>

            <div style={styles.formRow}>
              <input
                type="date"
                value={formData.data_prevista_recebimento}
                onChange={(e) =>
                  setFormData({ ...formData, data_prevista_recebimento: e.target.value })
                }
                style={styles.input}
              />
            </div>

            <div style={styles.formActions}>
              <button type="submit" style={styles.buttonSave}>
                💾 Salvar
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={styles.buttonCancel}
              >
                ✖️ Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && (
        <button onClick={() => setShowForm(true)} style={styles.buttonNew}>
          ➕ Novo Pedido de Compra
        </button>
      )}

      {loading ? (
        <div style={styles.loading}>Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div style={styles.emptyState}>Nenhum pedido registrado</div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th>Número</th>
                <th>OPL</th>
                <th>Material</th>
                <th>Qtd</th>
                <th>Fornecedor</th>
                <th>Previsão</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => (
                <tr key={pedido.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <strong>{pedido.numero_pedido}</strong>
                  </td>
                  <td style={styles.tableCell}>{pedido.opl}</td>
                  <td style={styles.tableCell}>
                    <small>{pedido.descricao_material?.substring(0, 30)}...</small>
                  </td>
                  <td style={styles.tableCell}>{pedido.quantidade}</td>
                  <td style={styles.tableCell}>{pedido.fornecedor || '—'}</td>
                  <td style={styles.tableCell}>
                    {pedido.data_prevista_recebimento
                      ? new Date(pedido.data_prevista_recebimento).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td style={styles.tableCell}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        ...(pedido.status_compra === 'Recebido Integral'
                          ? { backgroundColor: '#d4edda', color: '#155724' }
                          : pedido.status_compra === 'Recebido com Divergência'
                          ? { backgroundColor: '#fff3cd', color: '#856404' }
                          : { backgroundColor: '#e2e3e5', color: '#383d41' }),
                      }}
                    >
                      {pedido.status_compra}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <button
                      onClick={() => handleDelete(pedido.id)}
                      style={{
                        ...styles.actionButton,
                        backgroundColor: '#ef4444',
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '0 0 15px 0',
    color: '#1a3a52',
  },
  formCard: {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '15px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  formRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: '120px',
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '12px',
  },
  formActions: {
    display: 'flex',
    gap: '10px',
  },
  buttonSave: {
    flex: 1,
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  buttonCancel: {
    flex: 1,
    backgroundColor: '#9ca3af',
    color: 'white',
    border: 'none',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  buttonNew: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginBottom: '10px',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
  },
  tableHeader: {
    backgroundColor: '#e5e7eb',
    borderBottom: '1px solid #ddd',
  },
  tableRow: {
    borderBottom: '1px solid #f3f4f6',
  },
  tableCell: {
    padding: '8px',
    textAlign: 'left',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '3px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  actionButton: {
    padding: '4px 8px',
    border: 'none',
    borderRadius: '3px',
    fontSize: '11px',
    cursor: 'pointer',
    color: 'white',
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#999',
  },
  emptyState: {
    textAlign: 'center',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '4px',
    color: '#999',
    fontSize: '12px',
  },
};
