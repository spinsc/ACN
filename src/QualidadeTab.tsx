// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';


function SignatureCanvas({ onSave }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const getXY = (e) => {
    const rect = ref.current.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const {x,y} = getXY(e); const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(x,y); };
  const move = (e) => { e.preventDefault(); if (!drawing.current) return; const {x,y} = getXY(e); const ctx = ref.current.getContext('2d'); ctx.lineTo(x,y); ctx.stroke(); setHasStrokes(true); };
  const end = () => { drawing.current = false; };
  const clear = () => { const ctx = ref.current.getContext('2d'); ctx.clearRect(0,0,ref.current.width,ref.current.height); setHasStrokes(false); };
  const save = () => { if (hasStrokes) onSave(ref.current.toDataURL('image/png')); };

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  }, []);

  return (
    <div style={{textAlign:'center'}}>
      <canvas ref={ref} width={460} height={130}
        style={{border:'2px dashed #94a3b8',borderRadius:4,cursor:'crosshair',background:'white',display:'block',margin:'0 auto'}}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:6}}>
        <button className="acn-btn" style={{background:'#94a3b8'}} onClick={clear}>Limpar</button>
        <button className="acn-btn" style={{background:'#22c55e',opacity: hasStrokes?1:0.5}} onClick={save} disabled={!hasStrokes}>Salvar Assinatura</button>
      </div>
    </div>
  );
}

export default function QualidadeTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [modalAudit, setModalAudit] = useState(null);
  const [checkStates, setCheckStates] = useState({});
  const [obsAudit, setObsAudit] = useState('');
  const [signData, setSignData] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll,30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [oplsRes, ckRes] = await Promise.all([
      supabase.from('oples').select('*').eq('status_geral','Aguardando CQ').order('data_entrada',{ascending:false}),
      supabase.from('cq_checklist_itens').select('*').eq('ativo',true).order('ordem',{ascending:true}),
    ]);
    setOpls(oplsRes.data || []);
    setChecklist(ckRes.data || []);
    setLoading(false);
  };

  // checkStates: null=PENDENTE, true=OK, false=NOK, 'na'=N/A
  const abrirAuditoria = (opl) => {
    const states = {};
    checklist.forEach(it => states[it.id] = null);
    setCheckStates(states);
    setObsAudit('');
    setSignData(null);
    setModalAudit(opl);
  };

  const aprovar = async () => {
    if (!signData) { alert('Assine o checklist antes de aprovar!'); return; }
    setUploading(true);
    const opl = modalAudit;
    const agora = new Date().toISOString();
    // Upload assinatura
    let sigUrl = null;
    try {
      const blob = await (await fetch(signData)).blob();
      const path = `assinaturas/cq_${opl.opl}_${Date.now()}.png`;
      const { data: up } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert:true });
      if (up) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        sigUrl = pub?.publicUrl;
      }
    } catch(e) { console.warn('Signature upload failed', e); }

    // Salvar auditoria
    await supabase.from('cq_auditorias').insert([{
      opl_id: opl.id, numero_opl: opl.opl,
      resultado: 'Aprovado',
      itens_checklist: Object.entries(checkStates).map(([id,val]) => ({
        item_id: id,
        item_descricao: checklist.find(c=>c.id==id)?.item_texto || id,
        resultado: val === true ? 'OK' : val === false ? 'NOK' : val === 'na' ? 'NA' : 'PENDENTE',
      })),
      observacoes: obsAudit,
      assinatura_url: sigUrl,
      auditor_nome: currentUser?.nome,
      data_auditoria: agora,
    }]);

    const iniciosCq = opl.data_entrada_cq ? new Date(opl.data_entrada_cq) : null;
    const tempoCq = iniciosCq ? (new Date() - iniciosCq) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Aprovado CQ - Aguardando Liberacao Comercial',
      data_cq: agora,
      resultado_cq: 'Aprovado',
      cq_auditor: currentUser?.nome,
      ...(tempoCq != null ? { tempo_qualidade_horas: tempoCq } : {}),
    }).eq('id', opl.id);

    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'CQ',
      evento: `Auditoria CQ APROVADA. Auditor: ${currentUser?.nome}`,
      status_anterior: 'Aguardando CQ', status_novo: 'Aprovado CQ - Aguardando Liberacao Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);

    setUploading(false); setModalAudit(null); fetchAll();
  };

  const reprovar = async () => {
    if (!obsAudit.trim()) { alert('Informe o motivo da reprovacao!'); return; }
    const opl = modalAudit;
    const agora = new Date().toISOString();
    await supabase.from('cq_auditorias').insert([{
      opl_id: opl.id, numero_opl: opl.opl, resultado: 'Reprovado',
      itens_checklist: Object.entries(checkStates).map(([id,val]) => ({
        item_id: id, item_descricao: checklist.find(c=>c.id==id)?.item_texto || id,
        resultado: val === true ? 'OK' : val === false ? 'NOK' : val === 'na' ? 'NA' : 'PENDENTE',
      })),
      observacoes: obsAudit, auditor_nome: currentUser?.nome, data_auditoria: agora,
    }]);
    await supabase.from('oples').update({
      status_geral: 'Retrabalho',
      resultado_cq: 'Reprovado',
      obs_reprovacao_cq: obsAudit,
      cq_auditor: currentUser?.nome,
      data_cq: agora,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'CQ',
      evento: `Auditoria CQ REPROVADA. Motivo: ${obsAudit}`,
      status_anterior: 'Aguardando CQ', status_novo: 'Retrabalho',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalAudit(null); fetchAll();
  };

  // Todos respondidos quando cada item é OK, NOK ou N/A (não null)
  const allChecked = checklist.length > 0 && checklist.every(it => checkStates[it.id] !== null && checkStates[it.id] !== undefined);
  const hasNok = checklist.some(it => checkStates[it.id] === false);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Controle de Qualidade — OPLs para Auditoria ({opls.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando auditoria de qualidade.</div>
          ) : (
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>Producao por</th><th>Tempo Producao</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {opls.map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>{o.responsavel_producao || '—'}</td>
                    <td>{o.tempo_producao_horas ? Number(o.tempo_producao_horas).toFixed(1)+'h' : '—'}</td>
                    <td>
                      <button className="acn-btn" style={{background:'#7c3aed'}} onClick={()=>abrirAuditoria(o)}>
                        EXECUTAR AUDITORIA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <OplMovimentadas setor="CQ" />
      <DemandaFooter setor="Controle de Qualidade" />

      {/* MODAL AUDITORIA */}
      {modalAudit && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:560,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">Auditoria CQ — OPL {modalAudit.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>
              Chassi: {modalAudit.chassi || '—'} | Tipo: {modalAudit.tipo_projeto}
            </div>

            {/* CHECKLIST */}
            <div style={{fontWeight:700,fontSize:11,color:'#1e293b',marginBottom:6}}>Checklist de Auditoria</div>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:8,marginBottom:12,maxHeight:220,overflowY:'auto'}}>
              {checklist.length === 0 ? (
                <div style={{fontSize:11,color:'#94a3b8'}}>Nenhum item de checklist configurado. Configure no Admin.</div>
              ) : checklist.map(it => {
                const val = checkStates[it.id];
                return (
                  <div key={it.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 0',borderBottom:'1px solid #e2e8f0',fontSize:11}}>
                    <span style={{flex:1,color: val===null?'#94a3b8':val===false?'#ef4444':val===true?'#15803d':'#6b7280'}}>{it.item_texto}</span>
                    <div style={{display:'flex',gap:3,flexShrink:0}}>
                      <button onClick={()=>setCheckStates(s=>({...s,[it.id]:val===true?null:true}))}
                        style={{fontSize:9,padding:'2px 7px',border:'1px solid',borderRadius:3,cursor:'pointer',fontWeight:700,
                          background:val===true?'#22c55e':'transparent',
                          borderColor:val===true?'#22c55e':'#d1d5db',
                          color:val===true?'white':'#6b7280'}}>✓ OK</button>
                      <button onClick={()=>setCheckStates(s=>({...s,[it.id]:val===false?null:false}))}
                        style={{fontSize:9,padding:'2px 7px',border:'1px solid',borderRadius:3,cursor:'pointer',fontWeight:700,
                          background:val===false?'#ef4444':'transparent',
                          borderColor:val===false?'#ef4444':'#d1d5db',
                          color:val===false?'white':'#6b7280'}}>✗ NOK</button>
                      <button onClick={()=>setCheckStates(s=>({...s,[it.id]:val==='na'?null:'na'}))}
                        style={{fontSize:9,padding:'2px 7px',border:'1px solid',borderRadius:3,cursor:'pointer',fontWeight:700,
                          background:val==='na'?'#94a3b8':'transparent',
                          borderColor:val==='na'?'#94a3b8':'#d1d5db',
                          color:val==='na'?'white':'#6b7280'}}>N/A</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OBSERVACOES */}
            <label className="acn-label">Observacoes / Nao conformidades</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:12}}
              placeholder="Descreva qualquer nao conformidade encontrada..."
              value={obsAudit} onChange={e=>setObsAudit(e.target.value)} />

            {/* ASSINATURA */}
            <div style={{fontWeight:700,fontSize:11,color:'#1e293b',marginBottom:6}}>Assinatura do Auditor</div>
            {signData ? (
              <div style={{textAlign:'center',marginBottom:10}}>
                <img src={signData} alt="Assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:460,height:100,objectFit:'contain',background:'white'}} />
                <div><button className="acn-btn" style={{background:'#94a3b8',marginTop:4}} onClick={()=>setSignData(null)}>Limpar Assinatura</button></div>
              </div>
            ) : (
              <SignatureCanvas onSave={setSignData} />
            )}

            {!allChecked && checklist.length > 0 && (
              <div style={{fontSize:10,color:'#f59e0b',background:'#fef3c7',padding:'6px 8px',borderRadius:4,marginTop:8,marginBottom:4}}>
                Atencao: ha itens pendentes (sem OK, NOK ou N/A).
              </div>
            )}
            {hasNok && (
              <div style={{fontSize:10,color:'#dc2626',background:'#fef2f2',padding:'6px 8px',borderRadius:4,marginBottom:4,fontWeight:700}}>
                ✗ {checklist.filter(it=>checkStates[it.id]===false).length} item(s) NOK — descreva nas observacoes.
              </div>
            )}

            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'9px',opacity:uploading?0.6:1}} onClick={aprovar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'APROVADO'}
              </button>
              <button className="acn-btn" style={{background:'#ef4444',flex:1,padding:'9px'}} onClick={reprovar}>
                REPROVAR
              </button>
              <button className="acn-btn" style={{background:'#94a3b8',padding:'9px'}} onClick={()=>setModalAudit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
