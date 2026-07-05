// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';

// ============================================
// CONFIGURAR SUPABASE
// ============================================
const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';
export default function BotoesLiberacao({ registro, setorAtual, currentUser, onUpdate }) {
  const [showHistorico, setShowHistorico] = useState(false);

  if (!registro) return null;

  const fluxo = FLUXO_LIBERACOES[setorAtual.toLowerCase()];
  if (!fluxo) return null;

  // Verificar se já foi liberado por este setor
  const jaFoiLiberado = registro.liberacoes?.[setorAtual.toLowerCase()]?.liberado;

  const handleLiberar = async () => {
    if (
      !window.confirm(
        `Liberar ${registro.opl} para ${fluxo.label}?\n\n${fluxo.descricao}`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const dataAtual = new Date().toISOString();

      // Construir novo objeto de liberações
      const novasLiberacoes = registro.liberacoes || {};
      novasLiberacoes[setorAtual.toLowerCase()] = {
        liberado: true,
        data: dataAtual,
        usuario: usuarioAtual.nome,
        email: usuarioAtual.email,
      };

      // Novo log
      const novoLog = `[${formatarDataHora(dataAtual)}] [${setorAtual.toUpperCase()}] ✅ Liberada para ${fluxo.label} - Por: ${usuarioAtual.nome}`;

      const logsAtuais = Array.isArray(registro.logs_operacionais_tracking)
        ? registro.logs_operacionais_tracking
        : [];

      // Atualizar no Supabase
      const { error } = await supabase
        .from('oples')
        .update({
          liberacoes: novasLiberacoes,
          logs_operacionais_tracking: [...logsAtuais, novoLog],
          status_geral: `Aguardando ${fluxo.label}`,
        })
        .eq('id', registro.id);

      if (!error) {
        alert(`✅ ${registro.opl} liberada para ${fluxo.label}!`);
        if (onLiberacaoSucesso) {
          onLiberacaoSucesso();
        }
      } else {
        alert('❌ Erro ao liberar: ' + error.message);
      }
    } catch (err) {
      console.error('Erro:', err);
      alert('❌ Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejeitar = async () => {
    const motivo = prompt(
      'Motivo da rejeição (será registrado no log):'
    );
    if (!motivo) return;

    setLoading(true);
    try {
      const dataAtual = new Date().toISOString();
      const novoLog = `[${formatarDataHora(dataAtual)}] [${setorAtual.toUpperCase()}] ❌ REJEITADA - Motivo: ${motivo} - Por: ${usuarioAtual.nome}`;

      const logsAtuais = Array.isArray(registro.logs_operacionais_tracking)
        ? registro.logs_operacionais_tracking
        : [];

      const { error } = await supabase
        .from('oples')
        .update({
          logs_operacionais_tracking: [...logsAtuais, novoLog],
          status_geral: 'Rejeitada - Análise Requerida',
        })
        .eq('id', registro.id);

      if (!error) {
        alert(`❌ ${registro.opl} rejeitada.\n\nMotivo: ${motivo}`);
        if (onLiberacaoSucesso) {
          onLiberacaoSucesso();
        }
      } else {
        alert('Erro ao rejeitar: ' + error.message);
      }
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComPendencia = async () => {
    const setorsPendentes = prompt(
      'Setores com pendência (separados por vírgula):\nEx: Serralheria, Chicotes'
    );
    if (!setorsPendentes) return;

    setLoading(true);
    try {
      const dataAtual = new Date().toISOString();
      const novoLog = `[${formatarDataHora(dataAtual)}] [${setorAtual.toUpperCase()}] ⚠️ Liberada COM PENDÊNCIA em: ${setorsPendentes} - Por: ${usuarioAtual.nome}`;

      const logsAtuais = Array.isArray(registro.logs_operacionais_tracking)
        ? registro.logs_operacionais_tracking
        : [];

      const novasLiberacoes = registro.liberacoes || {};
      novasLiberacoes[setorAtual.toLowerCase()] = {
        liberado: true,
        data: dataAtual,
        usuario: usuarioAtual.nome,
        comPendencia: true,
        setoresPendentes: setorsPendentes
          .split(',')
          .map((s) => s.trim()),
      };

      const { error } = await supabase
        .from('oples')
        .update({
          liberacoes: novasLiberacoes,
          logs_operacionais_tracking: [...logsAtuais, novoLog],
          status_geral: `Liberada c/ Pendência (${setorsPendentes})`,
        })
        .eq('id', registro.id);

      if (!error) {
        alert(
          `⚠️ ${registro.opl} liberada COM PENDÊNCIA!\n\nSetores: ${setorsPendentes}`
        );
        if (onLiberacaoSucesso) {
          onLiberacaoSucesso();
        }
      } else {
        alert('Erro: ' + error.message);
      }
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Botões de Ação */}
      <div style={styles.botoesContainer}>
        {!jaFoiLiberado ? (
          <>
            <button
              onClick={handleLiberar}
              disabled={loading}
              style={{
                ...styles.botao,
                ...styles.botaoSucesso,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? '⏳ Liberando...' : `✅ Liberar para ${fluxo.label}`}
            </button>

            {setorAtual.toLowerCase() === 'almoxarifado' && (
              <button
                onClick={handleComPendencia}
                disabled={loading}
                style={{
                  ...styles.botao,
                  ...styles.botaoAviso,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '⏳ Processando...' : '⚠️ Liberar com Pendência'}
              </button>
            )}

            <button
              onClick={handleRejeitar}
              disabled={loading}
              style={{
                ...styles.botao,
                ...styles.botaoRejeicao,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? '⏳ Processando...' : '❌ Rejeitar'}
            </button>
          </>
        ) : (
          <div style={styles.jaLiberado}>
            ✅ <strong>Já liberada para {fluxo.label}</strong>
            <br />
            <small style={styles.dataLiberacao}>
              {registro.liberacoes[setorAtual.toLowerCase()]?.usuario} •{' '}
              {formatarDataHora(
                registro.liberacoes[setorAtual.toLowerCase()]?.data
              )}
            </small>
          </div>
        )}
      </div>

      {/* Histórico */}
      <button
        onClick={() => setShowHistorico(!showHistorico)}
        style={styles.botaoHistorico}
      >
        {showHistorico ? '▼ Ocultar' : '▶ Mostrar'} Histórico ({registro.logs_operacionais_tracking?.length || 0})
      </button>

      {showHistorico && (
        <div style={styles.historico}>
          {registro.logs_operacionais_tracking &&
          registro.logs_operacionais_tracking.length > 0 ? (
            <div style={styles.logsList}>
              {registro.logs_operacionais_tracking.map((log, idx) => (
                <div key={idx} style={styles.logItem}>
                  <code style={styles.logText}>{log}</code>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.semLogs}>Nenhum log registrado</p>
          )}
        </div>
      )}

      {/* Status de Liberações */}
      <div style={styles.statusLiberacoes}>
        <h4 style={styles.statusTitulo}>📊 Status de Liberações</h4>
        <div style={styles.statusGrid}>
          {Object.entries(FLUXO_LIBERACOES).map(([setor, info]) => {
            const liberado = registro.liberacoes?.[setor]?.liberado;
            const usuario = registro.liberacoes?.[setor]?.usuario;

            return (
              <div key={setor} style={styles.statusItem}>
                <div
                  style={{
                    ...styles.statusBola,
                    backgroundColor: liberado ? '#22c55e' : '#e5e7eb',
                  }}
                >
                  {liberado ? '✅' : '○'}
                </div>
                <div style={styles.statusInfo}>
                  <div style={styles.statusSetor}>
                    {setor.charAt(0).toUpperCase() + setor.slice(1)}
                  </div>
                  {liberado && (
                    <div style={styles.statusUser}>por {usuario}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// UTILITÁRIOS
// ============================================
function formatarDataHora(isoString) {
  if (!isoString) return 'N/A';
  const data = new Date(isoString);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ============================================
// ESTILOS
// ============================================
const styles = {
  container: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '20px',
  },
  botoesContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  botao: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  botaoSucesso: {
    backgroundColor: '#22c55e',
    color: 'white',
  },
  botaoAviso: {
    backgroundColor: '#f59e0b',
    color: 'white',
  },
  botaoRejeicao: {
    backgroundColor: '#ef4444',
    color: 'white',
  },
  jaLiberado: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid #c3e6cb',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  dataLiberacao: {
    color: '#155724',
    fontSize: '11px',
    marginTop: '4px',
    display: 'block',
  },
  botaoHistorico: {
    backgroundColor: 'transparent',
    color: '#3b82f6',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '4px 0',
    marginBottom: '12px',
  },
  historico: {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  logsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  logItem: {
    padding: '8px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    borderLeft: '3px solid #3b82f6',
  },
  logText: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#333',
    lineHeight: '1.4',
  },
  semLogs: {
    color: '#999',
    fontSize: '12px',
    margin: 0,
    fontStyle: 'italic',
  },
  statusLiberacoes: {
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    padding: '12px',
  },
  statusTitulo: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#333',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: '#f9f9f9',
    borderRadius: '4px',
    fontSize: '12px',
  },
  statusBola: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    flexShrink: 0,
  },
  statusInfo: {
    flex: 1,
  },
  statusSetor: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: '11px',
  },
  statusUser: {
    color: '#666',
    fontSize: '10px',
    marginTop: '2px',
  },
};

