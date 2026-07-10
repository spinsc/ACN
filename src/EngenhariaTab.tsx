// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget } from './AcnTabShared';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import OplAnexosWidget from './OplAnexosWidget';
import { notificarEvento, msg } from './whatsappHelper';


export default function EngenhariaTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalBom, setModalBom] = useState(null);
  const [obsBom, setObsBom] = useState('');
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelEng, setResponsavelEng] = useState('');

  // Acompanhamento SAC Veicular
  const [osAcomp, setOsAcomp] = useState([]);
  const [modalObsAcomp, setModalObsAcomp] = useState(null);
  const [novaObsAcomp, setNovaObsAcomp] = useState('');

  useEffect(() => { fetchAll(); fetchOsAcomp(); const t = setInterval(()=>{ fetchAll(); fetchOsAcomp(); }, 30000); return () => clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Em Espera Engenharia', 'Em Analise Engenharia', 'Devolvida para Engenharia'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    setLoading(false);
  };

  const fetchOsAcomp = async () => {
    const { data } = await supabase.from('sac_ordens_servico').select('*')
      .eq('acompanhamento_engenharia', true)
      .not('status', 'in', '("Entregue","Reprovado")')
      .order('data_abertura', { ascending: false });
    setOsAcomp(data || []);
  };

  const addObsAcompanhamento = async () => {
    if (!novaObsAcomp.trim()) return;
    const os = modalObsAcomp;
    const logs = Array.isArray(os.logs_acompanhamento_eng) ? [...os.logs_acompanhamento_eng] : [];
    logs.push({ texto: novaObsAcomp, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() });
    await supabase.from('sac_ordens_servico').update({ logs_acompanhamento_eng: logs }).eq('id', os.id);
    setNovaObsAcomp(''); setModalObsAcomp(null); fetchOsAcomp();
  };

  const abrirIniciarEng = (opl) => {
    setModalIniciar(opl);
    setResponsavelEng(currentUser?.nome || '');
  };

  const confirmarIniciarEng = async () => {
    if (!responsavelEng.trim()) { alert('Informe o responsavel pela execucao!'); return; }
    const opl = modalIniciar;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Em Analise Engenharia',
      responsavel_engenharia: responsavelEng,
      data_inicio_engenharia: agora,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `Inicio da analise de engenharia. Responsavel: ${responsavelEng}`,
      status_anterior: opl.status_geral, status_novo: 'Em Analise Engenharia',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalIniciar(null); setResponsavelEng('');
    fetchAll();
  };

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const opl = modalObs;
    const logs = opl.logs_engenharia || [];
    logs.push({ texto: novaObs, usuario: currentUser?.nome, hora: new Date().toISOString() });
    await supabase.from('oples').update({ logs_engenharia: logs }).eq('id', opl.id);
    setNovaObs(''); setModalObs(null); fetchAll();
  };

  const liberarBOM = async () => {
    const opl = modalBom;
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_engenharia ? new Date(opl.data_inicio_engenharia) : null;
    const tempo = inicio ? (new Date() - inicio) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Em Espera PCP',
      status_bom: 'BOM Liberado',
      obs_liberacao_bom: obsBom,
      data_liberacao_bom: agora,
      tempo_engenharia_horas: tempo,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `BOM liberado para PCP/Almoxarifado. Qtd: ${opl.quantidade||1} un. Obs: ${obsBom || 'Sem observacoes'}.`,
      status_anterior: opl.status_geral, status_novo: 'Em Espera PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('engenharia_libera_pcp', msg.oplEnviada(opl.opl,'PCP',currentUser?.nome));
    setModalBom(null); setObsBom(''); fetchAll();
  };

  const devolverComercial = async () => {
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Devolvida Comercial',
      obs_devolucao: obsDevolver,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `OPL devolvida para Comercial. Motivo: ${obsDevolver}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('engenharia_devolve_comerc', msg.oplDevolvida(opl.opl,'Comercial',obsDevolver,currentUser?.nome));
    setModalDevolver(null); setObsDevolver(''); fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h ? `${Number(h).toFixed(1)}h` : '—';

  const TIPOS_ENVIO_DIRETO = ['Envio de Material para Terceiro','Envio de Produto Vendido','Demanda Direta para Engenharia'];
  const isEnvioDireto = (o) => o.item_envio === true || TIPOS_ENVIO_DIRETO.some(t => (o.tipo_projeto||'').includes(t));


  return (
    <div>
      {/* OPLs em Espera ou Devolvidas */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPLs Aguardando Engenharia ({opls.length})</span>
          {opls.filter(isEnvioDireto).length > 0 && (
            <span style={{fontSize:10,background:'#fef3c7',color:'#92400e',padding:'3px 8px',borderRadius:10,border:'1px solid #fde68a',fontWeight:700}}>
              📤 {opls.filter(isEnvioDireto).length} envio(s) direto(s) — sem producao
            </span>
          )}
        </div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando Engenharia.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data Entrada</th><th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>Status</th>
                <th>Responsavel</th><th>Inicio</th><th>Tempo</th><th>Arquivos</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.map(o => {
                  const emAndamento = o.status_geral === 'Em Analise Engenharia';
                  const inicio = o.data_inicio_engenharia ? new Date(o.data_inicio_engenharia) : null;
                  const tempo = inicio ? ((new Date() - inicio) / 3600000) : null;
                  const envioDireto = isEnvioDireto(o);
                  return (
                    <tr key={o.id} style={envioDireto ? {background:'#fffbeb',borderLeft:'4px solid #f59e0b'} : {}}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td>
                        <strong style={{color:'#2563eb'}}>{o.opl}</strong>
                        {envioDireto && (
                          <div style={{marginTop:2}}>
                            <span style={{fontSize:9,fontWeight:700,background:'#f59e0b',color:'#78350f',padding:'1px 5px',borderRadius:10,letterSpacing:'0.5px'}}>
                              📤 ENVIO DIRETO
                            </span>
                          </div>
                        )}
                      </td>
                      <td>{o.chassi || '—'}</td>
                      <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                      <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                      <td><span className="acn-badge" style={{background: emAndamento?'#3b82f6':'#f59e0b'}}>
                        {o.status_geral}
                        {o.status_geral==='Devolvida para Engenharia' && <span style={{marginLeft:4,color:'#fef2f2',fontSize:9}}>REVISAO</span>}
                      </span></td>
                      <td>{o.responsavel_engenharia || '—'}</td>
                      <td>{fmtDt(o.data_inicio_engenharia)}</td>
                      <td>{emAndamento && tempo ? fmtH(tempo) : '—'}</td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          <OplAnexosWidget opl={o} setor="Engenharia" currentUser={currentUser} tipoFixo="proposta" compact={true} />
                          <OplAnexosWidget opl={o} setor="Engenharia" currentUser={currentUser} compact={true} />
                        </div>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {!emAndamento && (
                            <button className="acn-btn" style={{background:'#2563eb'}} onClick={()=>abrirIniciarEng(o)}>
                              INICIAR
                            </button>
                          )}
                          {emAndamento && (
                            <>
                              <button className="acn-btn" style={{background:'#475569'}} onClick={()=>{setModalObs(o);setNovaObs('');}}>
                                OBS
                              </button>
                              <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>{setModalBom(o);setObsBom('');}}>
                                  LIBERAR BOM
                                </button>
                              <button className="acn-btn" style={{background:'#ef4444'}} onClick={()=>{setModalDevolver(o);setObsDevolver('');}}>
                                DEVOLVER
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandaAvulsaPanel currentUser={currentUser} />

      {/* ── ACOMPANHAMENTO SAC VEICULAR ── */}
      {osAcomp.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fef2f2',borderBottom:'2px solid #dc2626'}}>
            <span style={{color:'#991b1b'}}>🚗 Acompanhamento de OS Veiculares ({osAcomp.length})</span>
            <span style={{fontSize:9,color:'#dc2626',fontStyle:'italic'}}>Somente observações — agendamento é exclusivo da Produção</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto',padding:0}}>
            <table>
              <thead><tr>
                <th>Nº OS</th><th>Cliente</th><th>Equipamento</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {osAcomp.map(os => {
                  const STATUS_COR_VEI: Record<string,string> = {
                    'Em Cotação':'#0891b2','Aguardando Aprovação Cliente':'#f59e0b',
                    'Em Provisionamento':'#7c3aed','Aguardando Aceite SAC':'#f59e0b',
                    'Provisionada':'#16a34a','Verificação e Orçamento':'#8b5cf6',
                    'Em Manutenção':'#dc2626','Manutenção Concluída':'#0d9488',
                  };
                  return (
                    <tr key={os.id}>
                      <td><strong style={{color:'#0f766e'}}>{os.numero_os}</strong></td>
                      <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{os.cliente_nome}</td>
                      <td style={{maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{os.equipamento_nome}</td>
                      <td><span style={{fontSize:9,background:'#e2e8f0',padding:'2px 6px',borderRadius:10}}>{os.tipo_avaliacao||'—'}</span></td>
                      <td><span className="acn-badge" style={{background:STATUS_COR_VEI[os.status]||'#94a3b8'}}>{os.status}</span></td>
                      <td style={{fontSize:10}}>{os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <button className="acn-btn" style={{background:'#2563eb',fontSize:9}}
                          onClick={()=>{ setModalObsAcomp(os); setNovaObsAcomp(''); }}>
                          📝 Obs.
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Observação de Acompanhamento */}
      {modalObsAcomp && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">📝 Acompanhamento — {modalObsAcomp.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:8}}>
              Cliente: {modalObsAcomp.cliente_nome} · Status: <strong>{modalObsAcomp.status}</strong>
            </div>
            {Array.isArray(modalObsAcomp.logs_acompanhamento_eng) && modalObsAcomp.logs_acompanhamento_eng.length > 0 && (
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:'8px 10px',marginBottom:10,maxHeight:160,overflowY:'auto'}}>
                {modalObsAcomp.logs_acompanhamento_eng.map((l,i) => (
                  <div key={i} style={{fontSize:10,borderBottom:'1px solid #e2e8f0',paddingBottom:4,marginBottom:4}}>
                    <span style={{color:'#94a3b8',fontSize:9}}>{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                    <div style={{color:'#374151',marginTop:2}}>{l.texto}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'6px 10px',marginBottom:10,fontSize:10,color:'#92400e'}}>
              ⚙️ Engenharia pode adicionar observações técnicas. Agendamento é exclusivo da Produção.
            </div>
            <label className="acn-label">Nova Observação</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:8}}
              placeholder="Observação técnica, pontos de atenção..."
              value={novaObsAcomp} onChange={e=>setNovaObsAcomp(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1}} onClick={addObsAcompanhamento}>SALVAR OBS.</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalObsAcomp(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <DemandasSetorWidget setor="Engenharia" cor="#2563eb" currentUser={currentUser} />
      <OplMovimentadas setor="Engenharia" />
      <DemandaFooter setor="Engenharia" />

      {/* MODAL INICIAR ENGENHARIA */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">Iniciar Analise — Engenharia</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12,background:'#f8fafc',padding:'8px 10px',borderRadius:4,border:'1px solid #e2e8f0'}}>
              <div><strong>OPL:</strong> {modalIniciar.opl} | <strong>Chassi:</strong> {modalIniciar.chassi || '—'}</div>
              <div style={{marginTop:3}}><strong>Tipo:</strong> {modalIniciar.tipo_projeto}</div>
              {isEnvioDireto(modalIniciar) && (
                <div style={{marginTop:4,background:'#fef3c7',padding:'4px 8px',borderRadius:4,color:'#92400e',fontWeight:700,fontSize:10}}>
                  📤 ENVIO DIRETO — sem producao na linha principal
                </div>
              )}
            </div>
            <label className="acn-label">Responsavel pela Execucao *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:4}}
              placeholder="Nome do responsavel..."
              value={responsavelEng}
              onChange={e=>setResponsavelEng(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&confirmarIniciarEng()}
              autoFocus />
            <div style={{fontSize:10,color:'#94a3b8',marginBottom:12}}>
              Pre-preenchido com seu nome. Altere se outra pessoa vai executar.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1,padding:'9px'}} onClick={confirmarIniciarEng}>
                CONFIRMAR INICIO
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOM */}
      {modalBom && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Liberar BOM — {modalBom.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Tipo: {modalBom.tipo_projeto} | Chassi: {modalBom.chassi || '—'}
            </div>
            {isEnvioDireto(modalBom) && (
              <div style={{background:'#fffbeb',border:'2px solid #f59e0b',borderRadius:6,padding:'8px 12px',marginBottom:10,fontSize:11}}>
                <strong style={{color:'#92400e'}}>📤 ENVIO DIRETO AO CLIENTE</strong>
                <div style={{color:'#78350f',marginTop:3}}>
                  Este item nao requer linha de producao. Apos BOM, PCP fara apenas a separacao no Almoxarifado
                  e o despacho direto. Chicotes / Serralheria / Lab somente se indicado no BOM.
                </div>
              </div>
            )}
            <label className="acn-label">Observacoes para PCP/Almoxarifado</label>
            <textarea className="acn-input" rows={4} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Detalhes do BOM, itens especiais, pendencias..."
              value={obsBom} onChange={e=>setObsBom(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={liberarBOM}>LIBERAR BOM</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalBom(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBS */}
      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Observacoes — {modalObs.opl}</div>
            {(modalObs.logs_engenharia||[]).length > 0 && (
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:8,marginBottom:10,maxHeight:160,overflowY:'auto'}}>
                {(modalObs.logs_engenharia||[]).map((l,i) => (
                  <div key={i} style={{fontSize:10,borderBottom:'1px solid #e2e8f0',paddingBottom:4,marginBottom:4}}>
                    <strong>{l.usuario}</strong> — {new Date(l.hora).toLocaleString('pt-BR')}<br/>{l.texto}
                  </div>
                ))}
              </div>
            )}
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:8}}
              placeholder="Nova observacao..."
              value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1}} onClick={addObs}>SALVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalObs(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVOLVER */}
      {modalDevolver && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Devolver para Comercial — {modalDevolver.opl}</div>
            <label className="acn-label">Motivo / Observacao *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Descreva o motivo da devolucao..."
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={devolverComercial}>CONFIRMAR DEVOLUCAO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDevolver(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
