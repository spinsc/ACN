// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


export default function AlmoxarifadoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalPend, setModalPend] = useState(null);
  const [obsPend, setObsPend] = useState('');
  const [modalFalta, setModalFalta] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [obsFalta, setObsFalta] = useState('');
  const [busca, setBusca] = useState('');
  // OPs desmembradas (mesmo numero base, sufixo /01../NN) agrupadas numa
  // linha de lote — mesmo padrao de EngenhariaTab.tsx / PCPTab.tsx.
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [processandoLote, setProcessandoLote] = useState(false);
  const [modalLoteAcao, setModalLoteAcao] = useState(null); // { tipo:'falta'|'pendencia', base, irmaos }
  const [obsLoteAcao, setObsLoteAcao] = useState('');
  // Numeros de serie agora sao informados aqui, no kiting, antes de liberar
  // para o PCP mandar para producao (antes eram no Comercial, na liberacao
  // para o Fiscal — mudou porque o produto ja deve sair do Almoxarifado
  // com o serial aplicado).
  const [modalSeriais, setModalSeriais] = useState(null); // opl aguardando confirmacao de kiting
  const [seriaisKitForm, setSeriaisKitForm] = useState('');

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguardando Almox'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    if (!silent) setLoading(false);
  };

  const setAlmox = async (opl, statusAlmox, statusGeral, obs='', extra={}) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_almox: statusAlmox,
      status_geral: statusGeral,
      obs_almox: obs,
      data_kiting: agora,
      responsavel_almox: currentUser?.nome,
      ...extra,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Almoxarifado',
      evento: `Kiting: ${statusAlmox}${obs ? ' — '+obs : ''}`,
      status_anterior: opl.status_geral, status_novo: statusGeral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
  };

  const abrirModalSeriais = (opl, pendenciaSanada=false) => {
    setSeriaisKitForm(opl.seriais_equipamentos || '');
    setModalSeriais({ ...opl, _pendenciaSanada: pendenciaSanada });
  };

  const confirmarKitOkComSeriais = async () => {
    if (!seriaisKitForm.trim()) { alert('Informe os números de série dos equipamentos deste kit.'); return; }
    const obs = modalSeriais._pendenciaSanada ? 'Pendencia sanada' : '';
    await setAlmox(modalSeriais, 'Kit OK', 'Kit OK - Aguardando PCP', obs, { seriais_equipamentos: seriaisKitForm.trim() });
    notificarEvento('kit_ok', msg.kitOk(modalSeriais.opl, currentUser?.nome));
    setModalSeriais(null); setSeriaisKitForm('');
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

  // Pendencia sanada tambem libera o kit — passa pelo mesmo modal de seriais.
  const sanarPendencia = (opl) => abrirModalSeriais(opl, true);

  // Numero base de uma OP desmembrada: "A1419.2607/02" -> "A1419.2607".
  const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
  const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

  const kitOkLote = async (grupo) => {
    const pendentes = grupo.irmaos.filter(o => o.status_almox !== 'Kit OK');
    if (pendentes.length === 0) { alert('Todas as unidades deste lote ja estao com kit 100%.'); return; }
    alert('Cada unidade do lote tem equipamentos com números de série diferentes — expanda o lote e confirme o kiting de cada unidade individualmente.');
    setLotesExpandidos(s => ({ ...s, [grupo.base]: true }));
  };

  const abrirLoteAcao = (tipo, grupo) => {
    setObsLoteAcao('');
    setModalLoteAcao({ tipo, base: grupo.base, irmaos: grupo.irmaos });
  };

  const confirmarLoteAcao = async () => {
    if (!obsLoteAcao.trim()) { alert('Descreva o material/pendencia.'); return; }
    const { tipo, base, irmaos } = modalLoteAcao;
    const alvo = irmaos.filter(o => tipo === 'falta' ? o.status_almox !== 'Falta de Material' : o.status_almox !== 'Liberado com Pendencia');
    if (alvo.length === 0) { alert('Nenhuma unidade deste lote se aplica.'); return; }
    setProcessandoLote(true);
    try {
      for (const opl of alvo) {
        await setAlmox(opl, tipo === 'falta' ? 'Falta de Material' : 'Liberado com Pendencia', 'Aguardando Almox', obsLoteAcao);
      }
      const evento = tipo === 'falta' ? 'kit_falta_material' : 'kit_pendencia';
      const msgFn = tipo === 'falta' ? msg.kitFaltaMaterial : msg.kitPendencia;
      notificarEvento(evento, msgFn(base, obsLoteAcao, currentUser?.nome) + ` (${alvo.length} unidades em lote)`);
    } finally {
      setProcessandoLote(false);
      setModalLoteAcao(null); setObsLoteAcao('');
      fetchAll();
    }
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Kiting — OPLs Aguardando Conferencia ({filtrarOpls(opls, busca).length})</span></div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
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
                {(() => {
                  const listaFiltrada = filtrarOpls(opls, busca);
                  const basesJaRenderizadas = new Set();
                  const itens = [];
                  for (const o of listaFiltrada) {
                    const base = baseOplDe(o.opl);
                    const irmaos = opls.filter(x => baseOplDe(x.opl) === base);
                    if (irmaos.length > 1) {
                      if (basesJaRenderizadas.has(base)) continue;
                      basesJaRenderizadas.add(base);
                      itens.push({ tipo: 'lote', base, irmaos: [...irmaos].sort((a,b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
                    } else {
                      itens.push({ tipo: 'single', row: o });
                    }
                  }

                  const renderLinhaOpl = (o) => (
                    <tr key={o.id}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td><LinkOpl opl={o} currentUser={currentUser} /></td>
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
                            <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>abrirModalSeriais(o)}>
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
                          <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                        </div>
                      </td>
                    </tr>
                  );

                  return itens.map(item => {
                    if (item.tipo === 'single') return renderLinhaOpl(item.row);

                    const { base, irmaos } = item;
                    const expandido = !!lotesExpandidos[base];
                    const rep = irmaos[0];
                    const qtdPendente = irmaos.filter(o => !o.status_almox).length;
                    const qtdKitOk = irmaos.filter(o => o.status_almox === 'Kit OK').length;
                    const qtdFalta = irmaos.filter(o => o.status_almox === 'Falta de Material').length;
                    const qtdComPendencia = irmaos.filter(o => o.status_almox === 'Liberado com Pendencia').length;
                    return (
                      <React.Fragment key={base}>
                        <tr style={{background:'#f5f3ff',borderLeft:'4px solid #7c3aed'}}>
                          <td>{fmtDt(rep.data_entrada)}</td>
                          <td>
                            <strong style={{color:'#6d28d9'}}>🔗 {base}</strong>
                            <div style={{marginTop:2}}>
                              <span style={{fontSize:9,fontWeight:700,background:'#7c3aed',color:'white',padding:'1px 6px',borderRadius:10}}>
                                LOTE — {irmaos.length} unidades
                              </span>
                            </div>
                          </td>
                          <td>—</td>
                          <td><span style={{fontWeight:700,color:'#7c3aed'}}>{irmaos.length}</span></td>
                          <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rep.tipo_projeto}</td>
                          <td colSpan={2} style={{fontSize:10}}>
                            {qtdPendente > 0 && <span className="acn-badge" style={{background:'#94a3b8',fontSize:9,marginRight:4}}>{qtdPendente} pendente</span>}
                            {qtdKitOk > 0 && <span className="acn-badge" style={{background:'#22c55e',fontSize:9,marginRight:4}}>{qtdKitOk} kit 100%</span>}
                            {qtdFalta > 0 && <span className="acn-badge" style={{background:'#ef4444',fontSize:9,marginRight:4}}>{qtdFalta} falta mat.</span>}
                            {qtdComPendencia > 0 && <span className="acn-badge" style={{background:'#f97316',fontSize:9}}>{qtdComPendencia} c/ pendência</span>}
                          </td>
                          <td>—</td>
                          <td>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                              {(qtdPendente + qtdFalta + qtdComPendencia) > 0 && (
                                <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} disabled={processandoLote} onClick={()=>kitOkLote(item)}>
                                  ✅ KITING 100% EM LOTE ({qtdPendente + qtdFalta + qtdComPendencia})
                                </button>
                              )}
                              <button className="acn-btn" style={{background:'#ef4444',fontSize:9}} disabled={processandoLote} onClick={()=>abrirLoteAcao('falta', item)}>
                                ❌ FALTA MATERIAL EM LOTE
                              </button>
                              <button className="acn-btn" style={{background:'#f97316',fontSize:9}} disabled={processandoLote} onClick={()=>abrirLoteAcao('pendencia', item)}>
                                🟠 C/ PENDÊNCIA EM LOTE
                              </button>
                              <button className="acn-btn" style={{background:'#94a3b8',fontSize:9}} onClick={()=>setLotesExpandidos(s=>({...s,[base]:!expandido}))}>
                                {expandido ? '▲ Ocultar unidades' : `▼ Ver ${irmaos.length} unidades`}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandido && irmaos.map(o => renderLinhaOpl(o))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandasSetorWidget setor="Almoxarifado" cor="#78716c" currentUser={currentUser} />
      <OplMovimentadas setor="Almoxarifado" />
      <DemandaFooter setor="Almoxarifado" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

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

      {/* MODAL SERIAIS — obrigatorio para confirmar Kiting 100% (ou sanar pendencia) */}
      {modalSeriais && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">🔢 Números de Série — OPL {modalSeriais.opl}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:10}}>
              Informe o(s) número(s) de série dos equipamentos deste kit antes de liberar para o PCP. O produto já sai do Almoxarifado com o serial aplicado.
            </div>
            <label className="acn-label">Números de série dos equipamentos instalados *</label>
            <textarea autoFocus className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10,fontFamily:'monospace'}}
              placeholder="Um por linha ou separados por vírgula. Ex: SN-00123, SN-00124..."
              value={seriaisKitForm} onChange={e=>setSeriaisKitForm(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={confirmarKitOkComSeriais}>CONFIRMAR KITING 100%</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setModalSeriais(null);setSeriaisKitForm('');}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FALTA/PENDENCIA EM LOTE — OPs desmembradas (mesmo numero base) */}
      {modalLoteAcao && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,width:'95vw'}}>
            <div className="modal-title">
              {modalLoteAcao.tipo === 'falta' ? '❌ Falta de Material em Lote' : '🟠 Liberar com Pendência em Lote'} — {modalLoteAcao.base}
            </div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Aplica a mesma descrição a todas as {modalLoteAcao.irmaos.length} unidades deste lote que ainda não estão nesta situação.
            </div>
            <label className="acn-label">
              {modalLoteAcao.tipo === 'falta' ? 'Descreva o(s) material(is) em falta *' : 'Descreva a pendência existente *'}
            </label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder={modalLoteAcao.tipo === 'falta' ? 'ex: Cabo de 70mm2 — 5m; Conector X — 2 unidades' : 'ex: Aguardando apenas parafuso M10, demais itens completos'}
              value={obsLoteAcao} onChange={e=>setObsLoteAcao(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background: modalLoteAcao.tipo === 'falta' ? '#ef4444' : '#f97316',flex:1,opacity:processandoLote?0.6:1}} onClick={confirmarLoteAcao} disabled={processandoLote}>
                {processandoLote ? 'Aplicando...' : 'CONFIRMAR EM LOTE'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalLoteAcao(null)} disabled={processandoLote}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
