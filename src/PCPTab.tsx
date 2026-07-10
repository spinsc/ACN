// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


const SETORES = ['Chicotes','Serralheria','Laboratorio','Compras'];

export default function PCPTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [oplsFalta, setOplsFalta] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalDevolver, setModalDevolver] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalDemanda, setModalDemanda] = useState(null); // null=fechado, false=avulsa, obj=com opl
  const [descDemanda, setDescDemanda] = useState('');
  const [setorDemanda, setSetorDemanda] = useState('Chicotes');

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll,30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [oplsRes, faltaRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP','Devolvida PCP','Retrabalho'])
        .order('data_entrada', { ascending: false }),
      supabase.from('oples').select('id,opl,chassi,tipo_projeto,status_almox,obs_almox,responsavel_almox,data_kiting')
        .in('status_almox', ['Falta de Material','Liberado com Pendencia']),
    ]);
    setOpls(oplsRes.data || []);
    setOplsFalta(faltaRes.data || []);
    setLoading(false);
  };

  const liberarProducao = async (opl) => {
    const agora = new Date().toISOString();
    const inicioPcp = opl.data_liberacao_bom ? new Date(opl.data_liberacao_bom) : null;
    const tempoPcp = inicioPcp ? (new Date() - inicioPcp) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Aguardando Inicio Producao',
      data_liberacao_pcp: agora,
      liberado_producao_por: currentUser?.nome,
      ...(tempoPcp != null ? { tempo_pcp_horas: tempoPcp } : {}),
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `OPL liberada para Producao por ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando Inicio Producao',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('pcp_libera_producao', msg.oplEnviada(opl.opl,'Produção',currentUser?.nome));
    fetchAll();
  };

  const devolverEngenharia = async () => {
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Devolvida para Engenharia',
      obs_devolucao_pcp: obsDevolver,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `Devolvida para Engenharia. Motivo: ${obsDevolver}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida para Engenharia',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('pcp_devolve_engenharia', msg.oplDevolvida(opl.opl,'Engenharia',obsDevolver,currentUser?.nome));
    setModalDevolver(null); setObsDevolver(''); fetchAll();
  };

  const criarDemanda = async () => {
    if (!descDemanda.trim()) { alert('Descreva a demanda!'); return; }
    const opl = modalDemanda;
    const payload = {
      setor_destino: setorDemanda,
      descricao: descDemanda,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      logs_demanda: [{ texto: `Demanda criada: ${descDemanda}`, usuario: currentUser?.nome, hora: new Date().toISOString() }],
    };
    if (opl && opl.id) {
      // opl_id removido (UUID incompativel com BIGINT); usar numero_opl como referencia textual
      payload.numero_opl = String(opl.opl);
    }
    const { error } = await supabase.from('demandas_setoriais').insert([payload]);
    if (error) { alert('Erro: ' + error.message); return; }
    if (opl && opl.id) {
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
        evento: `Demanda enviada para ${setorDemanda}: ${descDemanda}`,
        status_anterior: opl.status_geral, status_novo: opl.status_geral,
        usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
      }]);
    }
    setModalDemanda(null); setDescDemanda('');
    alert(`Demanda enviada para ${setorDemanda}!`);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const liberarAlmox = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Aguardando Almox',
      data_liberacao_pcp: agora,
      liberado_producao_por: currentUser?.nome,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `Liberado para Kiting — Almoxarifado. PCP: ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando Almox',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('pcp_libera_almox', msg.oplEnviada(opl.opl,'Almoxarifado (Kiting)',currentUser?.nome));
    fetchAll();
  };

  const sanarPendenciaPCP = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_almox: 'Kit OK',
      status_geral: 'Kit OK - Aguardando PCP',
      obs_almox: 'Pendencia/falta sanada pelo PCP.',
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `Pendencia/falta de material sanada. Kit liberado. PCP: ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Kit OK - Aguardando PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchAll();
  };

  const statusCor = (s) => ({
    'Em Espera PCP':       '#f59e0b',
    'Aguardando Almox':    '#3b82f6',
    'Kit OK - Aguardando PCP': '#16a34a',
    'Devolvida PCP':       '#ef4444',
    'Retrabalho':          '#f97316',
  })[s] || '#94a3b8';

  // PCP só pode liberar quando Almox concluiu (100% OK ou com pendência aceita)
  // Falta de Material = PCP vê o alerta mas NÃO pode liberar — aguarda reposição
  const podeLiberar = (o) =>
    o.status_geral === 'Kit OK - Aguardando PCP' ||           // Almox liberou 100%
    o.status_almox === 'Liberado com Pendencia';              // Almox liberou c/ pendência
  const kitOk = (o) => podeLiberar(o); // mantido por compatibilidade com Envio Direto

  const TIPOS_ENVIO_DIRETO = ['Envio de Material para Terceiro','Envio de Produto Vendido','Demanda Direta para Engenharia'];
  const isEnvioDireto = (o) => o.item_envio === true || TIPOS_ENVIO_DIRETO.some(t => (o.tipo_projeto||'').includes(t));

  return (
    <div>
      {/* ALERTA: MATERIAIS EM FALTA / COM PENDENCIA */}
      {oplsFalta.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fef2f2',borderBottom:'2px solid #ef4444'}}>
            <span style={{color:'#991b1b'}}>Alertas Almoxarifado — Materiais em Falta / Com Pendencia ({oplsFalta.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Tipo Projeto</th><th>Situacao</th>
                <th>Detalhamento da Pendencia / Falta</th><th>Resp. Almox</th><th>Data Apontamento</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {oplsFalta.map(o => (
                  <tr key={o.id} style={{background: o.status_almox==='Falta de Material'?'#fff5f5':'#fff7ed'}}>
                    <td><strong style={{color:'#dc2626'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>
                      <span className="acn-badge" style={{background: o.status_almox==='Falta de Material'?'#ef4444':'#f97316'}}>
                        {o.status_almox}
                      </span>
                    </td>
                    <td style={{color:'#7f1d1d',fontWeight:600,maxWidth:260,wordBreak:'break-word'}}>
                      {o.obs_almox || '—'}
                    </td>
                    <td>{o.responsavel_almox || '—'}</td>
                    <td>{fmtDtHr(o.data_kiting)}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#22c55e',fontSize:10}}
                          onClick={()=>sanarPendenciaPCP(o)}>
                          SANAR PENDENCIA
                        </button>
                        <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DEMANDA RAPIDA */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#f0fdf4',borderBottom:'2px solid #22c55e'}}>
          <span style={{color:'#166534'}}>Enviar Demanda para Setor</span>
          <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>{setModalDemanda(false);setDescDemanda('');setSetorDemanda('Chicotes');}}>
            + Demanda Avulsa
          </button>
        </div>
        <div className="sec-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {SETORES.map(s => (
              <button key={s} className="acn-btn" style={{background:'#1e293b',minWidth:120,padding:'8px 12px'}}
                onClick={()=>{ setSetorDemanda(s); setModalDemanda(false); setDescDemanda(''); }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ENVIO DIRETO ALERT */}
      {opls.filter(isEnvioDireto).length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fffbeb',borderBottom:'3px solid #f59e0b'}}>
            <span style={{color:'#78350f',fontWeight:700}}>📤 Itens de Envio Direto — Sem Linha de Producao ({opls.filter(isEnvioDireto).length})</span>
            <span style={{fontSize:10,color:'#92400e',background:'#fde68a',padding:'2px 8px',borderRadius:10}}>
              Apenas separacao Almox + Chicotes / Serralheria / Lab se necessario
            </span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>Data</th><th>OPL</th><th>Cliente</th><th>Tipo</th><th>Kit Almox</th><th>Pendencia</th><th>Prev. Entrega</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.filter(isEnvioDireto).map(o => (
                  <tr key={o.id} style={{background:'#fffbeb',borderLeft:'4px solid #f59e0b'}}>
                    <td>{fmtDt(o.data_entrada)}</td>
                    <td>
                      <strong style={{color:'#d97706'}}>{o.opl}</strong>
                      <div><span style={{fontSize:9,background:'#f59e0b',color:'#78350f',padding:'1px 5px',borderRadius:10,fontWeight:700}}>ENVIO DIRETO</span></div>
                    </td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:10}}>{o.tipo_projeto}</td>
                    <td>
                      {!o.status_almox && <span className="acn-badge" style={{background:'#94a3b8'}}>Pendente</span>}
                      {o.status_almox === 'Kit OK' && <span className="acn-badge" style={{background:'#22c55e'}}>Kit 100%</span>}
                      {o.status_almox === 'Falta de Material' && <span className="acn-badge" style={{background:'#ef4444'}}>Falta Mat.</span>}
                      {o.status_almox === 'Liberado com Pendencia' && <span className="acn-badge" style={{background:'#f97316'}}>Com Pendencia</span>}
                    </td>
                    <td style={{maxWidth:140,fontSize:10,color:'#7f1d1d',fontWeight: o.obs_almox?600:400}}>{o.obs_almox || '—'}</td>
                    <td>{fmtDt(o.data_prevista_entrega)}</td>
                    <td>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}}
                          onClick={()=>{setModalDemanda(o);setDescDemanda('');setSetorDemanda('Chicotes');}}>
                          + Demanda
                        </button>
                        {kitOk(o) && (
                          <button className="acn-btn" style={{background:'#f59e0b',color:'#78350f',fontWeight:700}}
                            onClick={()=>liberarProducao(o)}>
                            📤 LIBERAR ENVIO
                          </button>
                        )}
                        <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRIAGEM OPLs */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Triagem de OPLs — PCP ({opls.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL em triagem PCP.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>BOM</th>
                <th>Kit Almox</th><th>Pendencia/Falta</th><th>Status</th><th>Prev. Entrega</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.map(o => (
                  <tr key={o.id} style={isEnvioDireto(o)?{background:'#fffbeb',borderLeft:'3px solid #f59e0b'}:{}}>
                    <td>{fmtDt(o.data_entrada)}</td>
                    <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
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
                    <td style={{maxWidth:160,fontSize:10,color:'#7f1d1d',fontWeight: o.obs_almox?600:400}}>
                      {o.obs_almox || '—'}
                    </td>
                    <td><span className="acn-badge" style={{background:statusCor(o.status_geral)}}>{o.status_geral}</span></td>
                    <td>{fmtDt(o.data_prevista_entrega)}</td>
                    <td>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}}
                          onClick={()=>{setModalDemanda(o);setDescDemanda('');setSetorDemanda('Chicotes');}}>
                          + Demanda
                        </button>
                        {o.status_geral === 'Em Espera PCP' && (
                          <button className="acn-btn" style={{background:'#3b82f6'}} onClick={()=>liberarAlmox(o)}>
                            LIBERAR KITING
                          </button>
                        )}
                        {podeLiberar(o) && (
                          <button className="acn-btn"
                            style={{background: o.status_almox==='Kit OK' ? '#22c55e' : '#f97316'}}
                            onClick={()=>liberarProducao(o)}>
                            {o.status_almox==='Kit OK' ? 'LIBERAR PRODUCAO' : 'LIBERAR C/ PENDENCIA'}
                          </button>
                        )}
                        {o.status_geral === 'Aguardando Almox' && !o.status_almox && (
                          <span className="acn-badge" style={{background:'#cbd5e1',color:'#475569'}}>AGUARD. KITING</span>
                        )}
                        {o.status_almox === 'Falta de Material' && (
                          <span className="acn-badge" style={{background:'#ef4444'}}>🚫 FALTA MATERIAL</span>
                        )}
                        <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={()=>{setModalDevolver(o);setObsDevolver('');}}>
                          DEVOLVER
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

      <OplMovimentadas setor="PCP" />
      <DemandaFooter setor="PCP" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} />}

      {/* MODAL DEMANDA SETOR */}
      {modalDemanda !== null && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">
              Enviar Demanda{modalDemanda && modalDemanda.opl ? ` — OPL ${modalDemanda.opl}` : ' (Avulsa)'}
            </div>
            <div style={{marginBottom:12}}>
              <label className="acn-label">Setor de Destino</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
                {SETORES.map(s => (
                  <button key={s} className="acn-btn"
                    style={{background: setorDemanda===s?'#1e293b':'#94a3b8',flex:1,minWidth:80,padding:'7px'}}
                    onClick={()=>setSetorDemanda(s)}>{s}</button>
                ))}
              </div>
            </div>
            <label className="acn-label">Descricao da Demanda *</label>
            <textarea className="acn-input" rows={4} style={{width:'100%',resize:'vertical',marginBottom:12}}
              placeholder={`Descreva o que precisa de ${setorDemanda}...`}
              value={descDemanda} onChange={e=>setDescDemanda(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'8px'}} onClick={criarDemanda}>
                ENVIAR PARA {setorDemanda.toUpperCase()}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDemanda(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVOLVER */}
      {modalDevolver && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Devolver para Engenharia — OPL {modalDevolver.opl}</div>
            <label className="acn-label">Motivo / Problema identificado *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={devolverEngenharia}>CONFIRMAR DEVOLUCAO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDevolver(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
