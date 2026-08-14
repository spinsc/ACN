// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});
  const [modalVer, setModalVer] = useState(null);
  const [busca, setBusca] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
      .order('data_liberacao_comercial', { ascending: true });
    setOpls(data || []);
    if (!silent) setLoading(false);
  };

  const faturar = async (opl) => {
    const nf = nfs[opl.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? (new Date() - inicioFiscal) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `NF-e emitida: ${nf.trim()}. Disponivel para entrega.`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(opl.opl, nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    fetchAll();
  };

  // ── Devolver ao Comercial (inconsistência na OP/OS) ──────────────────────
  const devolverComercial = async () => {
    if (!obsDevolver.trim()) { alert('Descreva a inconsistência encontrada.'); return; }
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Devolvida Comercial',
      obs_devolucao: obsDevolver.trim(),
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `OPL devolvida para Comercial. Inconsistência: ${obsDevolver.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_devolve_comerc', msg.oplDevolvida(opl.opl, 'Comercial', obsDevolver.trim(), currentUser?.nome));
    setModalDevolver(null); setObsDevolver('');
    fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const aguardando = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
  const faturados = opls.filter(o => o.status_geral === 'Faturado e Disponivel para Entrega');

  return (
    <div>
      {/* AGUARDANDO EMISSAO */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}>
          <span style={{color:'#92400e'}}>OPLs Aguardando Emissao de NF-e ({filtrarOpls(aguardando, busca).length})</span>
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : aguardando.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando emissao de NF-e.</div>
          ) : (
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>Cliente</th><th>Lib. Comercial</th>
                <th>Seriais / Nº Equipamentos</th><th>Numero NF-e</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {filtrarOpls(aguardando, busca).map(o => (
                  <tr key={o.id}>
                    <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                    <td>{o.chassi || '—'}</td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>{fmtDt(o.data_liberacao_comercial)}</td>
                    <td>
                      {o.seriais_equipamentos ? (
                        <div style={{width:180,fontSize:10,fontFamily:'monospace',whiteSpace:'pre-wrap',color:'#1e3a8a',background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:4,padding:'4px 7px'}}>
                          {o.seriais_equipamentos}
                        </div>
                      ) : (
                        <span style={{fontSize:9,color:'#dc2626',fontStyle:'italic'}}>⚠️ Não informado pelo Comercial</span>
                      )}
                    </td>
                    <td>
                      <input className="acn-input" style={{width:120}}
                        placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>faturar(o)}>
                          FATURADO
                        </button>
                        <button className="acn-btn" style={{background:'#ef4444',fontSize:9}} onClick={()=>{setModalDevolver(o);setObsDevolver('');}}>
                          ↩ Devolver
                        </button>
                        <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* JA FATURADOS */}
      {faturados.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0fdf4',borderBottom:'2px solid #22c55e'}}>
            <span style={{color:'#166534'}}>Faturados — Aguardando Retirada/Entrega ({faturados.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Cliente</th><th>NF-e</th><th>Data Emissao</th><th>Resp. Fiscal</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {faturados.map(o => (
                  <tr key={o.id}>
                    <td><LinkOpl opl={o} currentUser={currentUser} color="#22c55e" /></td>
                    <td>{o.chassi || '—'}</td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td><strong style={{color:'#22c55e'}}>#{o.numero_nf}</strong></td>
                    <td>{fmtDt(o.data_emissao_nf)}</td>
                    <td>{o.responsavel_fiscal || '—'}</td>
                    <td><button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OplMovimentadas setor="Fiscal" />
      <DemandaFooter setor="Fiscal" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL DEVOLVER AO COMERCIAL */}
      {modalDevolver && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalDevolver(null);}}>
          <div className="modal-box">
            <div className="modal-title">↩ Devolver para Comercial — {modalDevolver.opl}</div>
            <label className="acn-label">Inconsistência encontrada *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Descreva o que precisa ser corrigido pelo Comercial..."
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={devolverComercial}>CONFIRMAR DEVOLUÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDevolver(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
