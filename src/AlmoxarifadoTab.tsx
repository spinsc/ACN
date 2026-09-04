// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';
import { logChange, useUnreadMap } from './AuditSystem';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { VinculoPicker } from './VinculoPicker';
import type { VinculoValue } from './VinculoPicker';

const semDado = (v) => !v || !String(v).trim();

export default function AlmoxarifadoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  // Linhas com alteração não vista por este usuário ganham borda amarela —
  // mesmo padrão usado nas outras telas de OP (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', opls.map((o: any) => o.id), currentUser);
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
  // Importação em lote dos seriais — uma linha colada por unidade, na
  // ordem /01../NN (cada unidade tem equipamentos/seriais diferentes, não
  // dá para repetir o mesmo valor para todas de uma vez).
  const [modalSeriaisLote, setModalSeriaisLote] = useState(null); // { base, irmaos }
  const [seriaisLoteTexto, setSeriaisLoteTexto] = useState('');
  const [aplicandoSeriaisLote, setAplicandoSeriaisLote] = useState(false);
  // Solicitação de reposição de estoque (nova) — pedido de compra/fabricação
  // interna que precisa de liberação do PCP antes de cair no setor certo.
  const [modalReposicao, setModalReposicao] = useState(false);
  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState([]);

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);
  useEffect(() => { fetchSolicitacoes(); }, []);

  const fetchSolicitacoes = async () => {
    const { data } = await supabase.from('almoxarifado_solicitacoes_reposicao')
      .select('*').order('criado_em', { ascending: false }).limit(20);
    setMinhasSolicitacoes(data || []);
  };

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
    logChange({ module: 'almoxarifado', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_almox: opl.status_almox, status_geral: opl.status_geral, obs_almox: opl.obs_almox },
      newRow: { status_almox: statusAlmox, status_geral: statusGeral, obs_almox: obs }, user: currentUser });
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
    setSeriaisLoteTexto('');
    setModalSeriaisLote({ base: grupo.base, irmaos: pendentes });
  };

  // Cada linha colada (Ctrl+C na planilha, Ctrl+V aqui) = uma unidade, na
  // ordem /01../NN das que ainda não têm kit — como cada unidade leva
  // equipamento(s)/serial(is) diferentes, não dá pra casar por chassi/placa
  // como no import de técnicos; a ordem da lista é o identificador.
  const aplicarSeriaisLote = async () => {
    const linhas = seriaisLoteTexto.split('\n').map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) return;
    const { irmaos } = modalSeriaisLote;
    setAplicandoSeriaisLote(true);
    try {
      for (let i = 0; i < linhas.length && i < irmaos.length; i++) {
        await setAlmox(irmaos[i], 'Kit OK', 'Kit OK - Aguardando PCP', '', { seriais_equipamentos: linhas[i] });
      }
      notificarEvento('kit_ok', msg.kitOk(modalSeriaisLote.base, currentUser?.nome) + ` (${Math.min(linhas.length, irmaos.length)} unidades em lote)`);
    } finally {
      setAplicandoSeriaisLote(false);
      setModalSeriaisLote(null); setSeriaisLoteTexto('');
      fetchAll();
    }
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
                <th>Data</th><th>OPL</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>BOM</th>
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
                    <tr key={o.id} style={oplsNaoLidas.has(String(o.id)) ? {background:'#fffdf0',borderLeft:'4px solid #eab308'} : {}}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                      <td style={{fontSize:10}}>
                        <div>{semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}</div>
                        <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
                        <div style={{color:'#94a3b8'}}>{semDado(o.placa) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem placa</span> : `🚘 ${o.placa}`}</div>
                      </td>
                      <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                      <td style={{ maxWidth:130, wordBreak:'break-word' }}>{o.tipo_projeto}</td>
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
                      <td style={{ maxWidth:150, fontSize:10, wordBreak:'break-word' }}>{o.obs_almox || '—'}</td>
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
                          <td style={{ maxWidth:130, wordBreak:'break-word' }}>{rep.tipo_projeto}</td>
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
                                  📥 IMPORTAR SERIAIS EM LOTE ({qtdPendente + qtdFalta + qtdComPendencia})
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

      {/* SOLICITAÇÃO DE REPOSIÇÃO DE ESTOQUE — pede fabricação interna (OFI) ao
          setor que fabrica aquele item, ou Compras quando não é fabricação
          interna. Passa por liberação do PCP antes de cair na fila certa. */}
      <div className="sec-card" style={{ marginTop:12 }}>
        <div className="sec-hdr">
          <span>📦 Solicitar Reposição de Estoque</span>
          <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px' }} onClick={() => setModalReposicao(true)}>
            + Nova Solicitação
          </button>
        </div>
        <div className="sec-body" style={{ padding:'10px 12px' }}>
          {minhasSolicitacoes.length === 0 ? (
            <div className="acn-empty">Nenhuma solicitação de reposição ainda.</div>
          ) : (
            minhasSolicitacoes.map((s: any) => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                border:'1px solid #e2e8f0', borderRadius:6, marginBottom:6, fontSize:11 }}>
                <span style={{ flex:1 }}>
                  <strong>{s.item_nome}</strong> — {s.quantidade}
                  {s.vinculo_descricao && <span style={{ color:'#1d4ed8' }}> · 🔗 {s.vinculo_descricao}</span>}
                </span>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:10,
                  background: s.status === 'Aguardando Liberação PCP' ? '#fef9c3' : s.status.startsWith('Roteado') ? '#dcfce7' : '#fee2e2',
                  color: s.status === 'Aguardando Liberação PCP' ? '#854d0e' : s.status.startsWith('Roteado') ? '#166534' : '#991b1b' }}>
                  {s.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {modalReposicao && (
        <ModalSolicitarReposicao currentUser={currentUser}
          onClose={() => setModalReposicao(false)}
          onSaved={() => { setModalReposicao(false); fetchSolicitacoes(); }} />
      )}

      <DemandasSetorWidget setor="Almoxarifado" cor="#78716c" currentUser={currentUser} />
      <DemandaAvulsaPanel currentUser={currentUser} setor="Almoxarifado" />
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

      {/* MODAL IMPORTAR SERIAIS EM LOTE — cada linha colada = uma unidade, na ordem /01..NN */}
      {modalSeriaisLote && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget && !aplicandoSeriaisLote) setModalSeriaisLote(null);}}>
          <div className="modal-box" style={{maxWidth:560,width:'95vw'}}>
            <div className="modal-title">📥 Importar Seriais em Lote — 🔗 {modalSeriaisLote.base}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              {modalSeriaisLote.irmaos.length} unidade(s) sem kit ainda. Cole do Excel (Ctrl+C na planilha, Ctrl+V aqui) —
              cada linha vira o(s) serial(is) de uma unidade, <strong>na ordem abaixo</strong> (não há chassi/placa para
              casar aqui, então a ordem da lista importa). Uma célula pode ter mais de um serial (separados por vírgula).
            </div>
            <div style={{maxHeight:160,overflowY:'auto',border:'1px solid #e2e8f0',borderRadius:6,marginBottom:10}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                <thead><tr style={{background:'#f8fafc'}}>
                  <th style={{padding:'4px 8px',textAlign:'left'}}>#</th>
                  <th style={{padding:'4px 8px',textAlign:'left'}}>OPL</th>
                  <th style={{padding:'4px 8px',textAlign:'left'}}>Serial(is) a aplicar</th>
                </tr></thead>
                <tbody>
                  {modalSeriaisLote.irmaos.map((o, i) => {
                    const linha = seriaisLoteTexto.split('\n').map(l=>l.trim()).filter(Boolean)[i];
                    return (
                      <tr key={o.id} style={{borderTop:'1px solid #f1f5f9'}}>
                        <td style={{padding:'4px 8px',color:'#94a3b8'}}>{i+1}</td>
                        <td style={{padding:'4px 8px',fontWeight:700}}>{o.opl}</td>
                        <td style={{padding:'4px 8px',color: linha ? '#15803d' : '#cbd5e1'}}>{linha || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <textarea autoFocus className="acn-input" rows={Math.min(8, modalSeriaisLote.irmaos.length)} style={{width:'100%',resize:'vertical',marginBottom:10,fontFamily:'monospace',fontSize:11}}
              placeholder={'Ex:\nSN-00123\nSN-00124, SN-00125\nSN-00126'}
              value={seriaisLoteTexto} onChange={e=>setSeriaisLoteTexto(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,opacity:aplicandoSeriaisLote?0.6:1}}
                onClick={aplicarSeriaisLote} disabled={aplicandoSeriaisLote || !seriaisLoteTexto.trim()}>
                {aplicandoSeriaisLote ? 'Aplicando...' : `✅ Confirmar Kiting 100% (${Math.min(seriaisLoteTexto.split('\n').map(l=>l.trim()).filter(Boolean).length, modalSeriaisLote.irmaos.length)})`}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} disabled={aplicandoSeriaisLote} onClick={()=>{setModalSeriaisLote(null);setSeriaisLoteTexto('');}}>Cancelar</button>
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

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SOLICITAR REPOSIÇÃO — item + quantidade + motivo + vínculo opcional.
// Fica "Aguardando Liberação PCP" até alguém do PCP liberar (ver PCPTab.tsx),
// que então roteia pra uma OFI (fabricação interna) ou pra Compras, conforme
// cadastro_itens.origem_producao/setor_fabricante daquele item.
// ─────────────────────────────────────────────────────────────────────────────
function ModalSolicitarReposicao({ currentUser, onClose, onSaved }) {
  const [q, setQ] = useState('');
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [item, setItem] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [vinculo, setVinculo] = useState<VinculoValue | null>(null);
  const [salvando, setSalvando] = useState(false);
  const timerRef = useRef<any>(null);

  const buscarItem = async (texto: string) => {
    if (!texto || texto.length < 2) { setSugestoes([]); return; }
    setBuscando(true);
    const { data } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,origem_producao,setor_fabricante')
      .or(`codigo.ilike.%${texto}%,nome.ilike.%${texto}%`).eq('ativo', true).order('nome').limit(8);
    setSugestoes(data || []);
    setBuscando(false);
  };

  const handleChangeQ = (v: string) => {
    setQ(v); setItem(null);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscarItem(v), 300);
  };

  const salvar = async () => {
    if (!item) { alert('Selecione um item do cadastro!'); return; }
    if (!quantidade || Number(quantidade) <= 0) { alert('Informe a quantidade!'); return; }
    setSalvando(true);
    const { error } = await supabase.from('almoxarifado_solicitacoes_reposicao').insert([{
      item_id: item.id, item_codigo: item.codigo, item_nome: item.nome,
      quantidade: Number(quantidade), motivo: motivo || null,
      status: 'Aguardando Liberação PCP',
      vinculo_tipo: vinculo?.tipo || null, vinculo_id: vinculo?.id || null, vinculo_descricao: vinculo?.descricao || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSaved();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth:480 }}>
        <div className="modal-title">📦 Solicitar Reposição de Estoque</div>

        <label className="acn-label">Item *</label>
        {item ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', border:'1px solid #86efac',
            background:'#f0fdf4', borderRadius:6, marginBottom:10, fontSize:11 }}>
            <span style={{ flex:1 }}><strong>{item.codigo}</strong> — {item.nome}</span>
            <button onClick={() => setItem(null)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer' }}>✕</button>
          </div>
        ) : (
          <div style={{ position:'relative', marginBottom:10 }}>
            <input className="acn-input" style={{ width:'100%' }} value={q} onChange={e=>handleChangeQ(e.target.value)}
              placeholder="Buscar por código ou nome..." autoFocus />
            {q.length >= 2 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:50, background:'#fff',
                border:'1px solid #d1d5db', borderRadius:6, boxShadow:'0 4px 12px #0002', maxHeight:200, overflowY:'auto' }}>
                {sugestoes.map((it:any) => (
                  <div key={it.id} onMouseDown={() => { setItem(it); setQ(''); setSugestoes([]); }}
                    style={{ padding:'7px 10px', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:11 }}
                    onMouseEnter={e=>(e.currentTarget.style.background='#f0f9ff')}
                    onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                    <strong>{it.codigo}</strong> — {it.nome}
                    {it.origem_producao === 'interna' && (
                      <span style={{ color:'#7c3aed', fontSize:9 }}> · fabricação interna ({it.setor_fabricante})</span>
                    )}
                  </div>
                ))}
                {buscando && <div style={{ padding:8, fontSize:10, color:'#94a3b8', textAlign:'center' }}>Buscando...</div>}
                {!buscando && sugestoes.length===0 && <div style={{ padding:8, fontSize:10, color:'#94a3b8', textAlign:'center' }}>Nada encontrado.</div>}
              </div>
            )}
          </div>
        )}

        <label className="acn-label">Quantidade *</label>
        <input className="acn-input" type="number" min="0" style={{ width:'100%', marginBottom:10 }}
          value={quantidade} onChange={e=>setQuantidade(e.target.value)} />

        <label className="acn-label">Motivo</label>
        <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical', marginBottom:10 }}
          placeholder="ex: estoque mínimo atingido" value={motivo} onChange={e=>setMotivo(e.target.value)} />

        <label className="acn-label">Vincular a um processo (opcional)</label>
        <div style={{ marginBottom:12 }}>
          <VinculoPicker value={vinculo} onSelect={setVinculo} onClear={() => setVinculo(null)} />
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#78716c', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Enviando...' : '📤 Solicitar'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose} disabled={salvando}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
