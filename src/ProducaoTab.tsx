// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget } from './AcnTabShared';


function useTimer(start) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!start) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(start).getTime()) / 1000));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [start]);
  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function OplRow({ o, onAction }) {
  const emProd       = o.status_geral === 'Em Producao';
  const aguardando   = o.status_geral === 'Aguardando Inicio Producao';
  const retrabalho   = o.status_geral === 'Retrabalho';
  const emRetrab     = o.status_geral === 'Em Retrabalho';

  const timerProd  = useTimer(emProd    ? o.data_inicio_producao    : null);
  const timerRetrab = useTimer(emRetrab ? o.data_inicio_retrabalho  : null);

  const rowStyle = retrabalho || emRetrab
    ? { background: '#fef2f2', borderLeft: '4px solid #ef4444' }
    : o.liberado_divulgacao
    ? { background: '#faf5ff', borderLeft: '3px solid #7c3aed' }
    : {};

  return (
    <>
      <tr style={rowStyle}>
        <td>
          <strong style={{ color: retrabalho || emRetrab ? '#dc2626' : '#2563eb' }}>{o.opl}</strong>
          {o.liberado_divulgacao && !retrabalho && !emRetrab && (
            <div><span style={{fontSize:9,background:'#7c3aed',color:'white',padding:'1px 5px',borderRadius:10,fontWeight:700}}>📸 MKT</span></div>
          )}
          {(retrabalho || emRetrab) && (
            <div><span style={{fontSize:9,background:'#ef4444',color:'white',padding:'1px 5px',borderRadius:10,fontWeight:700}}>🔁 RETRABALHO</span></div>
          )}
        </td>
        <td>{o.chassi || '—'}</td>
        <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
        <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
        <td>{o.responsavel_producao || '—'}</td>
        <td>
          {emProd   && <span style={{fontFamily:'monospace',color:'#2563eb',fontWeight:700,fontSize:12}}>{timerProd}</span>}
          {emRetrab && <span style={{fontFamily:'monospace',color:'#dc2626',fontWeight:700,fontSize:12}}>{timerRetrab}</span>}
          {(aguardando || retrabalho) && '—'}
        </td>
        <td>
          <span className="acn-badge" style={{
            background: emProd?'#3b82f6': aguardando?'#f59e0b': (retrabalho||emRetrab)?'#ef4444':'#94a3b8'
          }}>{o.status_geral}</span>
        </td>
        <td>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {aguardando && (
              <button className="acn-btn" style={{background:'#2563eb'}} onClick={()=>onAction('iniciar',o)}>INICIAR</button>
            )}
            {emProd && (
              <>
                <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>onAction('checklist',o)}>LIB. CQ</button>
                <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={()=>onAction('devolver',o)}>DEV. PCP</button>
              </>
            )}
            {retrabalho && (
              <button className="acn-btn" style={{background:'#ef4444',fontWeight:700}} onClick={()=>onAction('iniciar_retrabalho',o)}>
                🔁 INICIAR RETRABALHO
              </button>
            )}
            {emRetrab && (
              <button className="acn-btn" style={{background:'#22c55e',fontWeight:700}} onClick={()=>onAction('concluir_retrabalho',o)}>
                ✅ CONCLUIR → CQ
              </button>
            )}
          </div>
        </td>
      </tr>
      {/* Linha extra: motivo da reprovação CQ */}
      {(retrabalho || emRetrab) && o.obs_reprovacao_cq && (
        <tr style={{background:'#fef2f2'}}>
          <td colSpan={7} style={{padding:'4px 10px'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 8px',background:'#fee2e2',borderRadius:4,border:'1px solid #fca5a5'}}>
              <span style={{fontSize:14,flexShrink:0}}>⚠️</span>
              <div style={{flex:1}}>
                <span style={{fontSize:9,fontWeight:700,color:'#991b1b',textTransform:'uppercase',letterSpacing:'0.5px'}}>
                  Motivo da reprovacao CQ — Auditor: {o.cq_auditor || '—'}
                </span>
                <div style={{fontSize:11,color:'#7f1d1d',marginTop:2,fontWeight:600}}>{o.obs_reprovacao_cq}</div>
              </div>
              {o.tempo_retrabalho_horas && (
                <span style={{fontSize:10,color:'#dc2626',fontWeight:700,whiteSpace:'nowrap'}}>
                  Ret. anterior: {Number(o.tempo_retrabalho_horas).toFixed(1)}h
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ProducaoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [respNome, setRespNome] = useState('');

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 30000); return () => clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguardando Inicio Producao', 'Em Producao', 'Retrabalho', 'Em Retrabalho'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    setLoading(false);
  };

  const iniciarProducao = async () => {
    const opl = modalIniciar;
    const agora = new Date().toISOString();
    const resp = respNome || currentUser?.nome;
    await supabase.from('oples').update({
      status_geral: 'Em Producao',
      data_inicio_producao: agora,
      responsavel_producao: resp,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Inicio da producao. Responsavel: ${resp}`,
      status_anterior: opl.status_geral, status_novo: 'Em Producao',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalIniciar(null); setRespNome(''); fetchAll();
  };

  const liberarChecklist = async (opl) => {
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_producao ? new Date(opl.data_inicio_producao) : null;
    const tempo = inicio ? (new Date() - inicio) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      data_conclusao_producao: agora,
      data_entrada_cq: agora,
      tempo_producao_horas: tempo,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Producao concluida. Liberado para CQ. Tempo: ${tempo ? tempo.toFixed(1) + 'h' : '—'}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando CQ',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchAll();
  };

  const iniciarRetrabalho = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Em Retrabalho',
      data_inicio_retrabalho: agora,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Retrabalho iniciado. Motivo CQ: ${opl.obs_reprovacao_cq || '—'}`,
      status_anterior: 'Retrabalho', status_novo: 'Em Retrabalho',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchAll();
  };

  const concluirRetrabalho = async (opl) => {
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_retrabalho ? new Date(opl.data_inicio_retrabalho) : null;
    const tempo = inicio ? (new Date() - inicio) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      tempo_retrabalho_horas: tempo,
      obs_reprovacao_cq: null,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Retrabalho concluido. Liberado novamente para CQ. Tempo retrabalho: ${tempo ? tempo.toFixed(1) + 'h' : '—'}`,
      status_anterior: 'Em Retrabalho', status_novo: 'Aguardando CQ',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchAll();
  };

  const devolverPCP = async () => {
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Devolvida PCP',
      obs_devolucao_producao: obsDevolver,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Devolvida para PCP. Motivo: ${obsDevolver}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalDevolver(null); setObsDevolver(''); fetchAll();
  };

  const handleAction = (tipo, opl) => {
    if (tipo === 'iniciar')            { setModalIniciar(opl); setRespNome(currentUser?.nome || ''); }
    if (tipo === 'checklist')          liberarChecklist(opl);
    if (tipo === 'devolver')           { setModalDevolver(opl); setObsDevolver(''); }
    if (tipo === 'iniciar_retrabalho') iniciarRetrabalho(opl);
    if (tipo === 'concluir_retrabalho') concluirRetrabalho(opl);
  };

  const emRetrabalho = opls.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho');

  return (
    <div>
      {/* ALERTA RETRABALHO */}
      {emRetrabalho.length > 0 && (
        <div style={{background:'#fef2f2',border:'2px solid #ef4444',borderRadius:6,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:22}}>🔁</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:11,color:'#dc2626'}}>
              {emRetrabalho.length} OP(s) reprovada(s) pelo CQ — aguardando ou em retrabalho
            </div>
            <div style={{fontSize:10,color:'#991b1b',marginTop:2}}>
              Verifique o motivo da reprovacao nas linhas destacadas em vermelho abaixo e inicie o retrabalho.
            </div>
          </div>
        </div>
      )}

      {/* ALERTA MKT */}
      {opls.filter(o => o.liberado_divulgacao && (o.status_geral === 'Em Producao')).length > 0 && (
        <div style={{background:'#faf5ff',border:'2px solid #7c3aed',borderRadius:6,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:20}}>📸</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:11,color:'#7c3aed'}}>
              {opls.filter(o=>o.liberado_divulgacao && o.status_geral==='Em Producao').length} OP(s) em producao COM AUTORIZACAO MKT — momento ideal para registro!
            </div>
            <div style={{fontSize:10,color:'#6d28d9',marginTop:2}}>Avise o Marketing para agendar foto/video.</div>
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPLs em Producao / Retrabalho ({opls.length})</span>
          {emRetrabalho.length > 0 && (
            <span style={{fontSize:10,background:'#ef4444',color:'white',padding:'2px 8px',borderRadius:10,fontWeight:700}}>
              🔁 {emRetrabalho.length} em retrabalho
            </span>
          )}
        </div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL em producao no momento.</div>
          ) : (
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>Responsavel</th><th>Tempo</th><th>Status</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.map(o => <OplRow key={o.id} o={o} onAction={handleAction} currentUser={currentUser} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandasSetorWidget setor="Producao" cor="#7c3aed" currentUser={currentUser} />
      <OplMovimentadas setor="Producao" />
      <DemandaFooter setor="Producao" />

      {/* MODAL INICIAR */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Iniciar Producao — OPL {modalIniciar.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Tipo: {modalIniciar.tipo_projeto} | Chassi: {modalIniciar.chassi || '—'}
            </div>
            {modalIniciar.liberado_divulgacao && (
              <div style={{background:'#faf5ff',border:'1px solid #c4b5fd',borderRadius:4,padding:'7px 10px',marginBottom:10,fontSize:10,color:'#5b21b6'}}>
                📸 <strong>Esta OP esta liberada para divulgacao pelo Marketing.</strong><br/>
                Avise o time de MKT para agendar os registros de foto/video.
              </div>
            )}
            <label className="acn-label">Responsavel pela Producao</label>
            <input className="acn-input" style={{width:'100%',marginBottom:12}}
              value={respNome} onChange={e=>setRespNome(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&iniciarProducao()} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1}} onClick={iniciarProducao}>INICIAR PRODUCAO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVOLVER PCP */}
      {modalDevolver && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Devolver para PCP — OPL {modalDevolver.opl}</div>
            <label className="acn-label">Motivo / Problema *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={devolverPCP}>CONFIRMAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDevolver(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
