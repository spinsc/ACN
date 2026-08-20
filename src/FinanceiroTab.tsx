// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { imprimirOrdemCompra } from './ComprasTab';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDt = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const STATUS_COR: Record<string, string> = {
  'Pendente':              '#f59e0b',
  'Em Andamento':          '#3b82f6',
  'Aguardando Aprovação':  '#ea580c',
  'Comprado':              '#7c3aed',
  'Concluído':             '#22c55e',
};

// ─── Modal CRUD de Centros de Custo ──────────────────────────────────────────
function ModalCentros({ centros, onClose, onAtualizar, currentUser }: any) {
  const [codigo, setCodigo] = useState('');
  const [nome,   setNome]   = useState('');
  const [salvando, setSalvando] = useState(false);

  const criar = async () => {
    if (!codigo.trim() || !nome.trim()) { alert('Informe código e nome.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('centros_custo').insert([{
      codigo: codigo.trim().toUpperCase(), nome: nome.trim(), ativo: true,
    }]);
    if (error) { alert('Erro: ' + error.message); }
    else { setCodigo(''); setNome(''); onAtualizar(); }
    setSalvando(false);
  };

  const toggleAtivo = async (c: any) => {
    await supabase.from('centros_custo').update({ ativo: !c.ativo }).eq('id', c.id);
    onAtualizar();
  };

  const inp: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5,
    fontSize: 11, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 520, maxWidth: '95vw',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#0f766e', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🏷️ Gerenciar Centros de Custo</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' }}>Novo Centro de Custo</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={codigo} onChange={e => setCodigo(e.target.value)}
              placeholder="Código (ex: RH, TI, PROD)" style={{ ...inp, width: 130 }} />
            <input value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Nome completo do centro" style={{ ...inp, flex: 1 }} />
            <button onClick={criar} disabled={salvando}
              style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 5,
                padding: '6px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                opacity: salvando ? .6 : 1 }}>
              + Criar
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                {['Código', 'Nome', 'Status', 'Ação'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', fontSize: 9, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centros.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                  Nenhum centro cadastrado.
                </td></tr>
              ) : centros.map((c: any, i: number) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0f766e' }}>{c.codigo}</td>
                  <td style={{ padding: '6px 10px', fontSize: 11 }}>{c.nome}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ background: c.ativo ? '#dcfce7' : '#fee2e2',
                      color: c.ativo ? '#15803d' : '#991b1b',
                      padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                      {c.ativo ? '✅ Ativo' : '⛔ Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <button onClick={() => toggleAtivo(c)}
                      style={{ background: c.ativo ? '#fef2f2' : '#f0fdf4',
                        border: `1px solid ${c.ativo ? '#fca5a5' : '#86efac'}`,
                        color: c.ativo ? '#dc2626' : '#16a34a',
                        borderRadius: 4, padding: '3px 10px', fontSize: 9, cursor: 'pointer', fontWeight: 700 }}>
                      {c.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: compras de um centro de custo ─────────────────────────────────────
function ModalComprasCentro({ centro, compras, onClose }: any) {
  const total = compras.reduce((s: number, p: any) => s + (Number(p.valor_compra) || 0), 0);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 700, maxWidth: '96vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#1e3a5f', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🛒 Compras — {centro.nome || centro}</div>
            <div style={{ fontSize: 9, opacity: .8 }}>{compras.length} compra(s) · Total: {fmtR(total)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {compras.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 11 }}>
              Nenhuma compra neste centro de custo.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                  {['Nº Pedido', 'Descrição', 'Fornecedor', 'Status', 'Ordem de Compra', 'Valor', 'Data'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compras.map((p: any, i: number) => (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, color: '#1e3a5f' }}>{p.numero_pedido || '—'}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, maxWidth: 200, wordBreak: 'break-word' }}>{p.descricao_material || '—'}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>{p.fornecedor || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <span style={{ background: (STATUS_COR[p.status_compra]||'#6b7280') + '22',
                        color: STATUS_COR[p.status_compra] || '#6b7280',
                        padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                        {p.status_compra || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }}>
                      {p.numero_oc ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#7c3aed', fontWeight: 700, fontFamily: 'monospace' }}>✓ {p.numero_oc}</span>
                          <button onClick={() => imprimirOrdemCompra(p)} title="Imprimir Ordem de Compra"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>🖨️</button>
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>— aguardando aprovação</span>
                      )}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#15803d', textAlign: 'right', fontFamily: 'monospace' }}>
                      {p.valor_compra ? fmtR(Number(p.valor_compra)) : '—'}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>
                      {fmtDt(p.data_criacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <td colSpan={5} style={{ padding: '6px 8px', fontWeight: 700, fontSize: 11, textAlign: 'right' }}>TOTAL</td>
                  <td style={{ padding: '6px 8px', fontWeight: 800, fontSize: 13, textAlign: 'right', fontFamily: 'monospace' }}>{fmtR(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanceiroTab({ currentUser }: { currentUser: any }) {
  const [centros,  setCentros]  = useState<any[]>([]);
  const [compras,  setCompras]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modalCentros, setModalCentros] = useState(false);
  const [modalCompras, setModalCompras] = useState<any>(null);

  // Filtros
  const now = new Date();
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroStatus, setFiltroStatus] = useState('');

  const isAdmin = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: pData }] = await Promise.all([
      supabase.from('centros_custo').select('*').order('codigo'),
      supabase.from('pcp_pedidos_compra').select('*').order('data_criacao', { ascending: false }),
    ]);
    setCentros(cData || []);
    setCompras(pData || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Filtra compras pelo período + status
  const comprasFiltradas = compras.filter(p => {
    const dt = p.data_criacao ? new Date(p.data_criacao) : null;
    const okMes = !filtroMes || !dt || String(dt.getMonth() + 1).padStart(2, '0') === filtroMes;
    const okAno = !filtroAno || !dt || String(dt.getFullYear()) === filtroAno;
    const okStatus = !filtroStatus || p.status_compra === filtroStatus;
    return okMes && okAno && okStatus;
  });

  // Agrupa por centro de custo
  const porCentro: Record<string, { nome: string; total: number; count: number; compras: any[] }> = {};
  for (const p of comprasFiltradas) {
    const key = p.centro_custo || '(Sem Centro)';
    if (!porCentro[key]) porCentro[key] = { nome: key, total: 0, count: 0, compras: [] };
    porCentro[key].total += Number(p.valor_compra) || 0;
    porCentro[key].count++;
    porCentro[key].compras.push(p);
  }
  const listacentros = Object.entries(porCentro)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.total - a.total);

  // KPIs
  const totalGasto    = comprasFiltradas.reduce((s, p) => s + (Number(p.valor_compra) || 0), 0);
  const totalConcluidas = comprasFiltradas.filter(p => p.status_compra === 'Concluído').length;
  const totalPendentes  = comprasFiltradas.filter(p => p.status_compra === 'Pendente').length;
  const totalSemCentro  = comprasFiltradas.filter(p => !p.centro_custo).length;

  // Bar chart simples (SVG)
  const maxBarVal = listacentros.length > 0 ? Math.max(...listacentros.map(c => c.total)) : 1;
  const BAR_COLORS = ['#0f766e', '#0369a1', '#7c3aed', '#b45309', '#16a34a', '#dc2626', '#0891b2', '#9333ea'];

  const anos = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div style={{ padding: 10, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '10px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>💰 Financeiro — Centro de Custos</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
            Controle de despesas de compras por centro de custo
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => setModalCentros(true)}
              style={{ padding: '6px 14px', background: '#0f766e', color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
              🏷️ Gerenciar Centros
            </button>
          )}
          <button onClick={carregar}
            style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0',
              borderRadius: 5, cursor: 'pointer', fontSize: 9, color: '#64748b' }}>
            🔄
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '8px 12px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Filtrar por:</div>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os meses</option>
          {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
            <option key={m} value={m}>{new Date(2000, Number(m)-1, 1).toLocaleString('pt-BR',{month:'long'})}</option>
          ))}
        </select>
        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os status</option>
          {['Pendente','Em Andamento','Aguardando Aprovação','Comprado','Concluído'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>
          {comprasFiltradas.length} compra(s) no período
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 11 }}>Carregando...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total Gasto', value: fmtR(totalGasto), sub: 'no período filtrado', cor: '#0f766e', bg: '#f0fdf4', border: '#86efac', icon: '💰' },
              { label: 'Centros Ativos', value: String(centros.filter(c => c.ativo).length), sub: 'centros de custo', cor: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', icon: '🏷️' },
              { label: 'Concluídas', value: String(totalConcluidas), sub: 'compras concluídas', cor: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '✅' },
              { label: 'Pendentes', value: String(totalPendentes), sub: 'aguardando', cor: '#b45309', bg: '#fef9c3', border: '#fde68a', icon: '⏳' },
              { label: 'Sem Centro', value: String(totalSemCentro), sub: 'sem alocação', cor: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '⚠️' },
            ].map(k => (
              <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`,
                borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{k.icon}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: k.cor, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.value}</div>
                <div style={{ fontSize: 8, color: '#6b7280', marginTop: 1 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Gráfico de barras */}
          {listacentros.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                📊 Despesas por Centro de Custo
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {listacentros.slice(0, 10).map((c, i) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 120, fontSize: 10, fontWeight: 600, color: '#374151',
                      textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flexShrink: 0 }}
                      title={c.nome}>
                      {c.nome}
                    </div>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                      <div style={{
                        width: `${maxBarVal > 0 ? (c.total / maxBarVal * 100) : 0}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                        height: '100%', borderRadius: 4,
                        transition: 'width .4s',
                        minWidth: c.total > 0 ? 4 : 0,
                      }} />
                    </div>
                    <div style={{ width: 110, fontWeight: 700, fontSize: 10, color: '#15803d',
                      fontFamily: 'monospace', textAlign: 'right', flexShrink: 0 }}>
                      {fmtR(c.total)}
                    </div>
                    <div style={{ width: 30, fontSize: 9, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
                      {c.count}pc
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de centros */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>
                🗂️ Consolidado por Centro de Custo
              </div>
              <div style={{ fontSize: 9, color: '#64748b' }}>
                Clique em um centro para ver as compras
              </div>
            </div>

            {listacentros.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                Nenhuma compra encontrada no período.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                      {['Centro de Custo', 'Qtd. Compras', 'Total Gasto', 'Concluídas', 'Pendentes', 'Ver'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', fontSize: 9, fontWeight: 700,
                          textAlign: h === 'Total Gasto' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listacentros.map((c, i) => {
                      const concl = c.compras.filter(p => p.status_compra === 'Concluído').length;
                      const pend  = c.compras.filter(p => p.status_compra === 'Pendente').length;
                      const semCC = c.key === '(Sem Centro)';
                      return (
                        <tr key={c.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa',
                          cursor: 'pointer', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                          onClick={() => setModalCompras({ centro: { nome: c.nome }, compras: c.compras })}>
                          <td style={{ padding: '7px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {semCC && <span style={{ color: '#dc2626' }}>⚠️</span>}
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 11, color: semCC ? '#dc2626' : '#0f766e' }}>
                                  {c.nome}
                                </div>
                                {semCC && <div style={{ fontSize: 9, color: '#9ca3af' }}>Sem centro de custo alocado</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: '#475569', textAlign: 'center' }}>
                            {c.count}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#15803d',
                            textAlign: 'right', fontFamily: 'monospace' }}>
                            {fmtR(c.total)}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            {concl > 0 && (
                              <span style={{ background: '#dcfce7', color: '#15803d',
                                padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                                {concl}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            {pend > 0 && (
                              <span style={{ background: '#fef9c3', color: '#92400e',
                                padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                                {pend}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); setModalCompras({ centro: { nome: c.nome }, compras: c.compras }); }}
                              style={{ background: '#0369a1', color: '#fff', border: 'none',
                                borderRadius: 4, padding: '3px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e293b', color: '#fff' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11 }}>TOTAL GERAL</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {comprasFiltradas.length}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>
                        {fmtR(totalGasto)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modais */}
      {modalCentros && (
        <ModalCentros
          centros={centros}
          currentUser={currentUser}
          onClose={() => setModalCentros(false)}
          onAtualizar={() => {
            supabase.from('centros_custo').select('*').order('codigo')
              .then(({ data }) => setCentros(data || []));
          }}
        />
      )}

      {modalCompras && (
        <ModalComprasCentro
          centro={modalCompras.centro}
          compras={modalCompras.compras}
          onClose={() => setModalCompras(null)}
        />
      )}
    </div>
  );
}
