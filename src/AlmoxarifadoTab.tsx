// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


export default function AlmoxarifadoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalPend, setModalPend] = useState(null);
  const [obsPend, setObsPend] = useState('');
  const [modalFalta, setModalFalta] = useState(null);
  const [obsFalta, setObsFalta] = useState('');

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll,30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguardando Almox'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    setLoading(false);
  };

  const setAlmox = async (opl, statusAlmox, statusGeral, obs='') => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_almox: statusAlmox,
      status_geral: statusGeral,
      obs_almox: obs,
      data_kiting: agora,
      responsavel_almox: currentUser?.nome,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Almoxarifado',
      evento: `Kiting: ${statusAlmox}${obs ? ' — '+obs : ''}`,
      status_anterior: opl.status_geral, status_novo: statusGeral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
  };

  const kitOk = async (opl) => {
    await setAlmox(opl, 'Kit OK', 'Kit OK - Aguardando PCP');
    notificarEvento('kit_ok', msg.kitOk(opl.opl, currentUser?.nome));
    fetchAll();
  };

  const faltaMaterial = async () => {
    await setAlmox(modalFalta, 'Falta de Material', 'Aguardando Almox', obsFalta);
    notificarEvento('kit_falta_material', msg.kitFaltaMaterial(modalFalta.opl, obsFalta, currentUser?.nome));
    setModalFalta(null); setObsFalta(''); fetchAll();
  };

  const liberarPendencia = async () => {
    await setAlmox(modalPend, 'Liberado com Pendencia', 'Aguardando Almox', obsPend);
    notificarEvento('kit_pendencia', msg.kitPendencia(modalPend.opl, obsPend, currentUser?.nome));
    setModalPend(null); setObsPend(''); fetchAll();
  };

  const sanarPendencia = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_almox: 'Kit OK',
      status_geral: 'Kit OK - Aguardando PCP',
      obs_almox: 'Pendencia sanada',
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Almoxarifado',
      evento: 'Pendencia sanada. Kit completo — aguardando liberacao PCP.',
      status_anterior: 'Aguardando Almox', status_novo: 'Kit OK - Aguardando PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('kit_ok', msg.kitOk(opl.opl, currentUser?.nome));
    fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Kiting — OPLs Aguardando Conferencia ({opls.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando Almoxarifado.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>BOM</th>
                <th>Status Kit</th><th>Obs. Almox</th><th>Responsavel</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.map(o => (
                  <tr key={o.id}>
                    <td>{fmtDt(o.data_entrada)}</td>
                    <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>
                      {o.status_bom === 'BOM Liberado'
                        ? <span className="acn-badge" style={{background:'#22c55e'}}>BOM OK</span>
                        : <span className="acn-badge" style={{background:'#f59e0b'}}>Aguard. BOM</span>}
                    </td>
                    <td>
                      {!o.status_almox && <span className="acn-badge" style={{background:'#94a3b8'}}>Pendente</span>}
                      {o.status_almox === 'Kit OK' && <span className="acn-badge" style={{background:'#22c55e'}}>Kit 100%</span>}
                      {o.status_almox === 'Falta de Material' && <span className="acn-badge" style={{background:'#ef4444'}}>Falta Mat.</span>}
                      {o.status_almox === 'Liberado com Pendencia' && <span className="acn-badge" style={{background:'#f97316'}}>Com Pendencia</span>}
                    </td>
                    <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:10}}>{o.obs_almox || '—'}</td>
                    <td>{o.responsavel_almox || '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {o.status_almox !== 'Kit OK' && (
                          <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>kitOk(o)}>
                            KITING 100%
                          </button>
                        )}
                        <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={()=>{setModalFalta(o);setObsFalta('');}}>
                          FALTA MATERIAL
                        </button>
                        <button className="acn-btn" style={{background:'#f97316',fontSize:10}} onClick={()=>{setModalPend(o);setObsPend('');}}>
                          LIBERAR C/ PENDENCIA
                        </button>
                        {o.status_almox === 'Liberado com Pendencia' && (
                          <button className="acn-btn" style={{background:'#2563eb',fontSize:10}} onClick={()=>sanarPendencia(o)}>
                            SANAR PENDENCIA
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandasSetorWidget setor="Almoxarifado" cor="#78716c" currentUser={currentUser} />
      <OplMovimentadas setor="Almoxarifado" />
      <DemandaFooter setor="Almoxarifado" />

      {/* MODAL FALTA */}
      {modalFalta && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Apontar Falta de Material — OPL {modalFalta.opl}</div>
            <label className="acn-label">Descreva o(s) material(is) em falta *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="ex: Cabo de 70mm2 — 5m; Conector X — 2 unidades"
              value={obsFalta} onChange={e=>setObsFalta(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={faltaMaterial}>CONFIRMAR FALTA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalFalta(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PENDENCIA */}
      {modalPend && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Liberar com Pendencia — OPL {modalPend.opl}</div>
            <label className="acn-label">Descreva a pendencia existente *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="ex: Aguardando apenas parafuso M10, demais itens completos"
              value={obsPend} onChange={e=>setObsPend(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#f97316',flex:1}} onClick={liberarPendencia}>LIBERAR COM PENDENCIA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalPend(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
