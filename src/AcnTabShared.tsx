// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


export function OplMovimentadas({ setor }: { setor: string }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [opls, setOpls] = useState<any[]>([]);

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const fetchData = async () => {
    const [logsRes, oplsRes] = await Promise.all([
      supabase.from('logs_movimentacao_opl').select('*').order('data_hora', { ascending: false }).limit(10),
      supabase.from('oples').select('id,opl,cliente_nome,tipo_projeto,status_geral').not('status_geral', 'in', '("Faturado","Cancelado")').order('data_entrada', { ascending: false }).limit(30),
    ]);
    setLogs(logsRes.data || []);
    setOpls(oplsRes.data || []);
  };

  const fmtDt = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div style={{ marginTop: 10 }}>
      <div
        className="opl-mov-hdr"
        onClick={() => setOpen(o => !o)}
      >
        <span>OPL Movimentadas — Ultimas 10 Finalizadas + Todos em Processo</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="opl-mov-body">
          <table className="acn-tbl">
            <thead>
              <tr>
                <th>OPL</th><th>Cliente</th><th>Tipo</th><th>Status Atual</th><th>Ultimo Log</th><th>Log Completo</th>
              </tr>
            </thead>
            <tbody>
              {opls.length === 0 ? (
                <tr><td colSpan={6} className="acn-empty">Sem OPLs em processo no periodo.</td></tr>
              ) : opls.map(o => {
                const log = logs.find(l => l.opl_id === o.id);
                return (
                  <tr key={o.id}>
                    <td><strong>{o.opl}</strong></td>
                    <td>{(o.cliente_nome || '—').substring(0, 20)}</td>
                    <td>{o.tipo_projeto || '—'}</td>
                    <td><span className="acn-badge" style={{ background: '#3b82f6' }}>{o.status_geral}</span></td>
                    <td style={{ fontSize: 10, color: '#64748b' }}>{log ? log.evento + ' — ' + fmtDt(log.data_hora) : '—'}</td>
                    <td style={{ fontSize: 10 }}>{logs.filter(l => l.opl_id === o.id).length} eventos</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DemandaFooter({ setor }: { setor: string }) {
  return (
    <div className="acn-footer-setor">
      <span>Demandas Recebidas — <strong>{setor}</strong></span>
      <span>Mostrando demandas para este setor.</span>
    </div>
  );
}

export function DemandasSetorWidget({ setor, cor, currentUser }: { setor: string; cor?: string; currentUser: any }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [modalIniciar, setModalIniciar] = useState<any>(null);
  const [modalObs, setModalObs] = useState<any>(null);
  const [responsavel, setResponsavel] = useState('');
  const [obsTexto, setObsTexto] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(fetchDemandas, 30000);
    return () => clearInterval(t);
  }, [setor]);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchDemandas = async () => {
    const { data } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('setor_destino', setor)
      .in('status', ['Pendente', 'Em Andamento'])
      .order('data_abertura', { ascending: false });
    setDemandas(data || []);
  };

  const iniciar = async () => {
    if (!responsavel.trim()) { alert('Informe o responsavel!'); return; }
    const d = modalIniciar;
    const agora = new Date().toISOString();
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Iniciado. Responsavel: ${responsavel}`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Em Andamento', data_inicio: agora,
      responsavel_nome: responsavel, logs_demanda: logs,
    }).eq('id', d.id);
    setModalIniciar(null); setResponsavel('');
    fetchDemandas();
  };

  const concluir = async (d: any) => {
    const agora = new Date().toISOString();
    const inicio = d.data_inicio ? new Date(d.data_inicio) : new Date(d.data_abertura || agora);
    const tempo = (new Date(agora).getTime() - inicio.getTime()) / 3600000;
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Concluido. Tempo: ${tempo.toFixed(1)}h`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Concluido', data_conclusao: agora,
      tempo_execucao_horas: tempo, logs_demanda: logs,
    }).eq('id', d.id);
    fetchDemandas();
  };

  const salvarObs = async () => {
    if (!obsTexto.trim()) return;
    const d = modalObs;
    const logs = d.logs_demanda || [];
    logs.push({ texto: obsTexto, usuario: currentUser?.nome, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({ observacoes_execucao: obsTexto, logs_demanda: logs }).eq('id', d.id);
    setObsTexto(''); setModalObs(null);
    fetchDemandas();
  };

  const tempoDecorrido = (inicio: string) => {
    const seg = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  if (demandas.length === 0) return null;

  return (
    <div className="sec-card" style={{ marginTop: 10 }}>
      <div className="sec-hdr" style={{ background: cor || '#1e293b', color: 'white' }}>
        <span>Demandas / Ajustes para {setor} ({demandas.length})</span>
      </div>
      <div className="sec-body" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th>Data</th><th>OPL</th><th>Descricao</th><th>Status</th>
            <th>Responsavel</th><th>Tempo</th><th>Acoes</th>
          </tr></thead>
          <tbody>
            {demandas.map(d => {
              const isAjuste = d.descricao?.startsWith('[AJUSTE]');
              const desc = isAjuste ? d.descricao.replace('[AJUSTE] ', '') : (d.descricao || '—');
              return (
                <tr key={d.id} style={{ background: isAjuste ? '#fffbeb' : undefined }}>
                  <td>{d.data_abertura ? new Date(d.data_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{d.numero_opl || '—'}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>
                    {isAjuste && <span style={{ background: '#f59e0b', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, marginRight: 4 }}>AJUSTE</span>}
                    {desc}
                  </td>
                  <td><span className="acn-badge" style={{ background: d.status === 'Em Andamento' ? '#3b82f6' : '#f59e0b' }}>{d.status}</span></td>
                  <td>{d.responsavel_nome || '—'}</td>
                  <td>
                    {d.status === 'Em Andamento' && d.data_inicio
                      ? <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700 }}>{tempoDecorrido(d.data_inicio)}</span>
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {d.status === 'Pendente' && (
                        <button className="acn-btn" style={{ background: cor || '#1e293b' }} onClick={() => { setModalIniciar(d); setResponsavel(currentUser?.nome || ''); }}>INICIAR</button>
                      )}
                      {d.status === 'Em Andamento' && (
                        <>
                          <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }} onClick={() => { setModalObs(d); setObsTexto(''); }}>OBS</button>
                          <button className="acn-btn" style={{ background: '#22c55e' }} onClick={() => concluir(d)}>CONCLUIR</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-title">Iniciar — {modalIniciar.descricao?.replace('[AJUSTE] ', '')}</div>
            <label className="acn-label">Responsavel *</label>
            <input className="acn-input" style={{ width: '100%', marginBottom: 12 }}
              value={responsavel} onChange={e => setResponsavel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && iniciar()} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={iniciar}>INICIAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-title">Observacao — {modalObs.descricao?.replace('[AJUSTE] ', '')}</div>
            <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
              placeholder="Adicione uma observacao..." value={obsTexto} onChange={e => setObsTexto(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={salvarObs}>SALVAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalObs(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
