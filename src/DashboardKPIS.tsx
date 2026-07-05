import React, { useState, useEffect } from 'react';

export default function DashboardTab() {
  const [kpis, setKpis] = useState({
    oples_total: 0,
    oples_concluidas: 0,
    oples_pendentes: 0,
    tempo_medio_horas: 0,
    taxa_atraso_percent: 0
  });

  const [filtro, setFiltro] = useState('30');

  useEffect(() => {
    // Simular carregamento de dados
    carregarKPIs();
  }, [filtro]);

  const carregarKPIs = async () => {
    // Aqui você faria a chamada ao Supabase
    // Por enquanto, usando dados mockados
    setKpis({
      oples_total: 45,
      oples_concluidas: 32,
      oples_pendentes: 13,
      tempo_medio_horas: 72.5,
      taxa_atraso_percent: 8.9
    });
  };

  const percentualConclusao = ((kpis.oples_concluidas / kpis.oples_total) * 100).toFixed(1);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* TÍTULO */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px', color: '#1a3a52', fontSize: '28px' }}>
          📊 Dashboard Operacional
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Acompanhamento de OPLs e indicadores de desempenho
        </p>
      </div>

      {/* FILTRO DE PERÍODO */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px' }}>
        {[
          { valor: '7', label: 'Últimos 7 dias' },
          { valor: '30', label: 'Últimos 30 dias' },
          { valor: '60', label: 'Últimos 60 dias' },
          { valor: '90', label: 'Últimos 90 dias' }
        ].map(periodo => (
          <button
            key={periodo.valor}
            onClick={() => setFiltro(periodo.valor)}
            style={{
              backgroundColor: filtro === periodo.valor ? '#22c55e' : '#ffffff',
              color: filtro === periodo.valor ? '#ffffff' : '#1a3a52',
              border: '1px solid #e0e0e0',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: filtro === periodo.valor ? '600' : '500',
              transition: 'all 0.2s'
            }}
          >
            {periodo.label}
          </button>
        ))}
      </div>

      {/* KPIs - GRID 5 COLUNAS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        {/* KPI 1: Total de OPLs */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Total de OPLs
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1a3a52' }}>
            {kpis.oples_total}
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            Período: {filtro} dias
          </div>
        </div>

        {/* KPI 2: OPLs Concluídas */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #22c55e'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Concluídas
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#16a34a' }}>
            {kpis.oples_concluidas}
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            {percentualConclusao}% do total
          </div>
        </div>

        {/* KPI 3: OPLs Pendentes */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #f59e0b'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Pendentes
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#d97706' }}>
            {kpis.oples_pendentes}
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            Aguardando ação
          </div>
        </div>

        {/* KPI 4: Tempo Médio */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #8b5cf6'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Tempo Médio
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#7c3aed' }}>
            {kpis.tempo_medio_horas}h
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            Lead time total
          </div>
        </div>

        {/* KPI 5: Taxa de Atraso */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #ef4444'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Taxa de Atraso
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#dc2626' }}>
            {kpis.taxa_atraso_percent}%
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            OPLs atrasadas
          </div>
        </div>
      </div>

      {/* GRÁFICOS SIMULADOS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '20px'
      }}>
        {/* GRÁFICO 1: Distribuição por Status */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 20px', color: '#1a3a52', fontSize: '16px' }}>
            📈 Distribuição por Status
          </h3>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: '150px',
                backgroundColor: '#22c55e',
                borderRadius: '8px 8px 0 0',
                marginBottom: '10px'
              }} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a3a52' }}>
                Concluídas
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>32 OPLs</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: '80px',
                backgroundColor: '#f59e0b',
                borderRadius: '8px 8px 0 0',
                marginBottom: '10px'
              }} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a3a52' }}>
                Pendentes
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>13 OPLs</div>
            </div>
          </div>
        </div>

        {/* GRÁFICO 2: Evolução Temporal */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 20px', color: '#1a3a52', fontSize: '16px' }}>
            📊 Evolução Temporal
          </h3>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', height: '150px' }}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((dia, idx) => (
              <div key={dia} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: `${50 + (idx * 15)}px`,
                  backgroundColor: '#3b82f6',
                  borderRadius: '8px 8px 0 0',
                  marginBottom: '10px'
                }} />
                <div style={{ fontSize: '12px', color: '#666' }}>{dia}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* INFORMAÇÕES ADICIONAIS */}
      <div style={{
        backgroundColor: '#e0f2fe',
        border: '1px solid #7dd3fc',
        padding: '16px',
        borderRadius: '8px',
        marginTop: '30px',
        fontSize: '13px',
        color: '#0369a1'
      }}>
        <strong>💡 Dica:</strong> Os dados acima são ilustrativos. Para dados reais, configure as abas específicas e verifique os relatórios detalhados em cada departamento.
      </div>
    </div>
  );
}
