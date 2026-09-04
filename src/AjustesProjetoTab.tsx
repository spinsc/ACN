// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { NovaDemandaModal } from './DemandaAvulsaPanel';

// Ajustes registrados ANTES desta unificação vivem em demandas_setoriais
// com descricao prefixada [AJUSTE] — a tabela abaixo ("Ajustes em Aberto" /
// "Histórico") continua lendo/agindo sobre eles exatamente como antes, sem
// mudança, pra não perder o que já existia. A partir de agora, "+ Nova
// Demanda" abre o formulário unificado de Demandas Avulsas (com vínculo
// real a OP/OS/PV/Compra/OFI e um setor de destino escolhido no ato) —
// os novos registros passam a aparecer na tela do setor que recebeu, não
// mais nesta lista (mesma filosofia do sistema antigo: quem acompanha o
// andamento é o setor receptor). Campos do formulário antigo sem
// equivalente direto (Requerente, Tipo de Solicitação, Centro de Custo)
// saem — o criador já é registrado (currentUser), igual em todo o resto do
// sistema unificado; Tipo de Solicitação já não era gravado há tempos
// (sempre null no insert antigo).
const SETORES_DESTINO = ['Comercial','Serralheria','Chicotes','Laboratorio','Compras','Almoxarifado','Engenharia','Producao','PCP'];

export default function AjustesProjetoTab({ currentUser }) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .ilike('descricao', '[AJUSTE]%')
      .order('data_abertura', { ascending: false });
    if (error) console.error('AjustesProjetoTab fetchAll:', error);
    setAjustes(data || []);
    setLoading(false);
  };

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const a = modalObs;
    const logs = a.logs_demanda || [];
    logs.push({ texto: novaObs, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({ logs_demanda: logs }).eq('id', a.id);
    logChange({ module: 'demandas_gerais', entityType: 'demandas_setoriais', entityId: a.id, changeType: 'UPDATE',
      oldRow: { observacao: null }, newRow: { observacao: novaObs.slice(0, 120) }, user: currentUser });
    setNovaObs(''); fecharModalObs(); fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h != null ? Number(h).toFixed(1) + 'h' : '—';
  const tempoDecorrido = (inicio) => {
    if (!inicio) return '—';
    const diff = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    const hh = Math.floor(diff / 3600).toString().padStart(2, '0');
    const mm = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const ss = (diff % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const corPrioridade = (logs) => {
    const txt = (logs?.[0]?.texto || '').toLowerCase();
    if (txt.includes('prioridade: alta')) return '#ef4444';
    if (txt.includes('prioridade: media')) return '#f59e0b';
    if (txt.includes('prioridade: baixa')) return '#22c55e';
    return '#94a3b8';
  };

  const getPrioridade = (logs) => {
    const txt = logs?.[0]?.texto || '';
    const m = txt.match(/Prioridade:\s*(\w+)/);
    return m ? m[1] : 'Normal';
  };

  const abertos = ajustes.filter(a => a.status !== 'Concluido');
  const concluidos = ajustes.filter(a => a.status === 'Concluido');
  const { naoLidoSet: ajustesNaoLidos, marcarLidoLocal: marcarAjusteLidoLocal } = useUnreadMap('demandas_setoriais', ajustes.map(a => a.id), currentUser);
  const marcarAjusteLido = useMarkAsRead('demandas_setoriais', modalObs?.id, currentUser);
  const fecharModalObs = () => { marcarAjusteLido(); if (modalObs?.id) marcarAjusteLidoLocal(modalObs.id); setModalObs(null); };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b' }}>
          <span style={{ color: '#92400e' }}>Demandas Gerais</span>
          <button className="acn-btn" style={{ background: '#1e293b' }} onClick={() => setModalNova(true)}>
            + Nova Demanda
          </button>
        </div>
        <div className="sec-body" style={{ fontSize: 10, color: '#92400e' }}>
          Vincule a uma OP/OS/PV/Compra/OFI se for o caso, escolha o setor de destino e a demanda já cai
          direto na tela daquele setor — mesmo formulário rico usado em Engenharia/Almoxarifado/PCP/Compras.
        </div>
      </div>

      {modalNova && (
        <NovaDemandaModal currentUser={currentUser} setoresDestino={SETORES_DESTINO}
          onClose={() => setModalNova(false)} onSaved={() => setModalNova(false)} />
      )}

      {/* AJUSTES ABERTOS — histórico do sistema antigo, registrado antes desta unificação */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Ajustes em Aberto (histórico) ({abertos.length})</span></div>
        <div className="sec-body" style={{ overflowX: 'auto' }}>
          {loading ? <div className="acn-empty">Carregando...</div> : abertos.length === 0 ? (
            <div className="acn-empty">Nenhum ajuste em aberto.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>OPL Ref.</th><th>Requerente</th><th>Descricao</th>
                <th>Setor</th><th>Prioridade</th><th>Status</th><th>Responsavel</th><th>Tempo</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {abertos.map(a => {
                  const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                  const prio = getPrioridade(a.logs_demanda);
                  const naoLida = ajustesNaoLidos.has(String(a.id));
                  return (
                    <tr key={a.id} style={naoLida
                      ? { background:'#fffdf0', boxShadow:'inset 3px 0 0 #eab308' }
                      : { background: a.status === 'Em Andamento' ? '#fefce8' : '#fffbeb' }}>
                      <td>{fmtDt(a.data_abertura)}</td>
                      <td>{a.numero_opl || '—'}</td>
                      <td>{a.criado_por_nome || '—'}</td>
                      <td style={{ maxWidth: 180, wordBreak:'break-word' }} title={desc}>{desc}</td>
                      <td>
                        {a.setor_destino || '—'}
                        {a.setor_destino === 'Compras' && a.tipo_solicitacao && (
                          <div style={{ fontSize: 8, fontWeight: 700, color: a.tipo_solicitacao === 'cotacao' ? '#7c3aed' : '#0891b2', marginTop: 1 }}>
                            {a.tipo_solicitacao === 'cotacao' ? '📋 Cotação' : '🛒 Compra'}
                          </div>
                        )}
                      </td>
                      <td><span className="acn-badge" style={{ background: corPrioridade(a.logs_demanda) }}>{prio}</span></td>
                      <td>
                        <span className="acn-badge" style={{ background: a.status === 'Em Andamento' ? '#3b82f6' : '#f59e0b' }}>
                          {a.status}
                        </span>
                      </td>
                      <td>{a.responsavel_nome || '—'}</td>
                      <td>
                        {a.status === 'Em Andamento' && a.data_inicio
                          ? <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700 }}>{tempoDecorrido(a.data_inicio)}</span>
                          : fmtH(a.tempo_execucao_horas)
                        }
                      </td>
                      <td>
                        <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }}
                          onClick={() => { setModalObs(a); setNovaObs(''); }}>
                          VER / OBS
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* HISTORICO */}
      {concluidos.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Historico de Ajustes Concluidos ({concluidos.length})</span></div>
          <div className="sec-body" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Data</th><th>OPL Ref.</th><th>Requerente</th><th>Descricao</th>
              <th>Setor</th><th>Responsavel</th><th>Conclusao</th><th>Tempo</th>
            </tr></thead>
            <tbody>
              {concluidos.map(a => {
                const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                return (
                  <tr key={a.id}>
                    <td>{fmtDt(a.data_abertura)}</td>
                    <td>{a.numero_opl || '—'}</td>
                    <td>{a.criado_por_nome || '—'}</td>
                    <td style={{ maxWidth:200, wordBreak:'break-word' }} title={desc}>{desc}</td>
                    <td>{a.setor_destino || '—'}</td>
                    <td>{a.responsavel_nome || '—'}</td>
                    <td>{fmtDt(a.data_conclusao)}</td>
                    <td>{fmtH(a.tempo_execucao_horas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* MODAL OBS */}
    {modalObs && (
      <div className="modal-overlay">
        <div className="modal-box" style={{maxWidth:500}}>
          <div className="modal-title">Historico — {modalObs.descricao?.replace('[AJUSTE] ','')}</div>
          <div style={{maxHeight:180,overflowY:'auto',marginBottom:12,background:'#f8fafc',borderRadius:4,padding:'8px 10px',border:'1px solid #e2e8f0'}}>
            {(modalObs.logs_demanda||[]).length === 0
              ? <div style={{fontSize:10,color:'#94a3b8'}}>Sem historico de logs.</div>
              : (modalObs.logs_demanda||[]).map((l,i) => (
                <div key={i} style={{marginBottom:6,fontSize:10,borderBottom:'1px solid #e2e8f0',paddingBottom:4}}>
                  <span style={{color:'#94a3b8',fontSize:9}}>{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                  <div style={{color:'#374151',marginTop:2}}>{l.texto}</div>
                </div>
              ))
            }
          </div>
          <label className="acn-label">Nova Observacao</label>
          <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:8}}
            placeholder="Adicione uma observacao..." value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
          <div style={{display:'flex',gap:8}}>
            <button className="acn-btn" style={{background:'#1e293b',flex:1}} onClick={addObs}>SALVAR</button>
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={fecharModalObs}>Fechar</button>
          </div>
        </div>
      </div>
    )}

    <OplMovimentadas setor="Ajustes" />
    <DemandaFooter setor="Ajustes de Projeto" />
  </div>
);
}
