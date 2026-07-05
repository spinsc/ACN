// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


const CATEGORIAS = ['Producao em Linha','Acabamento e Detalhes','Antes e Depois','Entrega ao Cliente','Equipe de Trabalho','Equipamento Instalado','Teste e Demonstracao','Evento ou Feira','Geral'];
const TURNOS = ['Manha (06h-14h)','Tarde (14h-22h)','Noite (22h-06h)','Horario Especifico'];
const TIPOS_REG = ['Foto','Video','Foto e Video'];

const PEDIDO_VAZIO = {
  numero_opl: '', local_registro: '', hora_turno: 'Manha (06h-14h)',
  tipo: 'Foto', categoria: 'Producao em Linha', observacoes: '',
};

// Pipeline de status de uma OPL
function PipelineStatus({ opl }) {
  const s = opl.status_geral || '';
  const etapas = [
    {
      label: 'Engenharia',
      ok: !!(opl.status_bom === 'BOM Liberado' || opl.status_bom === 'Envio Direto - Sem Producao' ||
             s.includes('PCP') || s.includes('Almox') || s.includes('Producao') || s.includes('CQ') || s.includes('Faturado')),
      atual: s.includes('Analise Engenharia') || s.includes('Espera PCP') && !opl.status_bom,
    },
    {
      label: 'PCP/Almox',
      ok: !!(opl.status_almox === 'Kit OK' || s.includes('Inicio Producao') || s.includes('Em Producao') || s.includes('CQ') || s.includes('Faturado')),
      atual: (s.includes('Espera PCP') || s.includes('Almox')) && opl.status_almox !== 'Kit OK',
    },
    {
      label: 'Producao',
      ok: !!(s.includes('Aguardando CQ') || s.includes('Aprovado CQ') || s.includes('Faturado') || s.includes('Retrabalho')),
      atual: s.includes('Em Producao') || s.includes('Inicio Producao'),
    },
    {
      label: 'CQ',
      ok: !!(s.includes('Aprovado CQ') || s.includes('Liberacao Comercial') || s.includes('Faturado')),
      atual: s.includes('Aguardando CQ'),
    },
  ];

  return (
    <div style={{display:'flex',alignItems:'center',gap:0,margin:'4px 0'}}>
      {etapas.map((e, i) => (
        <React.Fragment key={e.label}>
          <div style={{
            fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap',
            background: e.ok ? '#dcfce7' : e.atual ? '#dbeafe' : '#f1f5f9',
            color: e.ok ? '#166534' : e.atual ? '#1d4ed8' : '#94a3b8',
            border: `1px solid ${e.ok ? '#86efac' : e.atual ? '#93c5fd' : '#e2e8f0'}`,
          }}>
            {e.ok ? '✓ ' : e.atual ? '▶ ' : '○ '}{e.label}
          </div>
          {i < etapas.length - 1 && (
            <div style={{width:12,height:1,background: e.ok?'#86efac':'#e2e8f0'}} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Card de uma OPL com intervenções
function OplCard({ opl, currentUser, intervencoes, onAddIntervencao }) {
  const [expanded, setExpanded] = useState(false);
  const [novaObs, setNovaObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const minhas = intervencoes.filter(v => v.numero_opl === String(opl.opl));
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const salvarIntervencao = async () => {
    if (!novaObs.trim()) { alert('Informe a observacao!'); return; }
    setSalvando(true);
    const { error } = await supabase.from('mkt_intervencoes').insert([{
      opl_id: opl.id,
      numero_opl: String(opl.opl),
      observacoes: novaObs,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    if (error) { alert('Erro: ' + error.message); }
    else { setNovaObs(''); onAddIntervencao(); }
    setSalvando(false);
  };

  const corStatus = (s) => {
    if (!s) return '#94a3b8';
    if (s.includes('Faturado') || s.includes('Aprovado CQ')) return '#22c55e';
    if (s.includes('Producao') || s.includes('CQ')) return '#3b82f6';
    if (s.includes('PCP') || s.includes('Almox')) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div style={{border:'1px solid #e2e8f0',borderRadius:6,marginBottom:8,overflow:'hidden',background:'white'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#f8fafc',cursor:'pointer',borderBottom: expanded?'1px solid #e2e8f0':'none'}}
        onClick={()=>setExpanded(!expanded)}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <strong style={{color:'#2563eb',fontSize:12}}>OPL {opl.opl}</strong>
            <span style={{fontSize:10,color:'#64748b'}}>{opl.cliente_nome || '—'}</span>
            <span style={{fontSize:9,background:corStatus(opl.status_geral),color:'white',padding:'1px 6px',borderRadius:10,fontWeight:700}}>
              {opl.status_geral}
            </span>
            {opl.item_envio && <span style={{fontSize:9,background:'#f59e0b',color:'#78350f',padding:'1px 6px',borderRadius:10,fontWeight:700}}>📤 ENVIO DIRETO</span>}
          </div>
          <div style={{marginTop:3}}><PipelineStatus opl={opl} /></div>
          <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{opl.tipo_projeto} {opl.chassi ? `| Chassi: ${opl.chassi}` : ''}</div>
        </div>
        <div style={{textAlign:'right',minWidth:80}}>
          <div style={{fontSize:11,fontWeight:700,color: minhas.length>0?'#7c3aed':'#94a3b8'}}>
            {minhas.length} registro{minhas.length!==1?'s':''}
          </div>
          <div style={{fontSize:16,color:'#94a3b8'}}>{expanded ? '▲' : '▼'}</div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{padding:'10px 12px'}}>
          {/* Historico */}
          <div style={{fontWeight:700,fontSize:11,color:'#1e293b',marginBottom:6}}>Histórico de Intervenções MKT</div>
          {minhas.length === 0 ? (
            <div style={{fontSize:11,color:'#94a3b8',fontStyle:'italic',marginBottom:8}}>Nenhuma intervenção registrada ainda.</div>
          ) : (
            <div style={{maxHeight:180,overflowY:'auto',marginBottom:8}}>
              {minhas.map(v => (
                <div key={v.id} style={{borderLeft:'3px solid #7c3aed',padding:'5px 8px',marginBottom:5,background:'#faf5ff',borderRadius:'0 4px 4px 0'}}>
                  <div style={{fontSize:9,color:'#94a3b8',marginBottom:2}}>
                    <strong style={{color:'#7c3aed'}}>{v.criado_por_nome || v.criado_por}</strong> — {fmtDtHr(v.created_at)}
                  </div>
                  <div style={{fontSize:11,color:'#1e293b'}}>{v.observacoes}</div>
                </div>
              ))}
            </div>
          )}
          {/* Nova intervencao */}
          <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
            <textarea
              style={{flex:1,border:'1px solid #e2e8f0',borderRadius:4,padding:'5px 8px',fontSize:11,resize:'none',outline:'none'}}
              rows={2} placeholder="Descreva a intervencao / material criado / observacao..."
              value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
            <button
              style={{background:'#7c3aed',color:'white',border:'none',borderRadius:4,padding:'8px 12px',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',opacity:salvando?0.6:1}}
              onClick={salvarIntervencao} disabled={salvando}>
              + Registrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarketingTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [intervencoes, setIntervencoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState('opls'); // opls | pedidos
  const [showFormPedido, setShowFormPedido] = useState(false);
  const [pedidoForm, setPedidoForm] = useState(PEDIDO_VAZIO);
  const [salvandoPedido, setSalvandoPedido] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('Todos');

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 60000); return () => clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [oplsRes, intRes, pedRes] = await Promise.all([
      supabase.from('oples').select('*').eq('liberado_divulgacao', true).order('data_entrada', { ascending: false }),
      supabase.from('mkt_intervencoes').select('*').order('created_at', { ascending: false }),
      supabase.from('mkt_pedidos_registro').select('*').order('created_at', { ascending: false }),
    ]);
    setOpls(oplsRes.data || []);
    setIntervencoes(intRes.data || []);
    setPedidos(pedRes.data || []);
    setLoading(false);
  };

  const salvarPedido = async () => {
    if (!pedidoForm.local_registro || !pedidoForm.categoria) { alert('Preencha local e categoria!'); return; }
    setSalvandoPedido(true);
    const { error } = await supabase.from('mkt_pedidos_registro').insert([{
      ...pedidoForm,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    if (error) { alert('Erro: ' + error.message); }
    else { setPedidoForm(PEDIDO_VAZIO); setShowFormPedido(false); fetchAll(); }
    setSalvandoPedido(false);
  };

  const atualizarStatusPedido = async (id, status) => {
    await supabase.from('mkt_pedidos_registro').update({ status }).eq('id', id);
    fetchAll();
  };

  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const corStatusPedido = (s) => ({ Pendente:'#f59e0b', Realizado:'#22c55e', Cancelado:'#ef4444' })[s] || '#94a3b8';

  const oplsFiltradas = filtroStatus === 'Todos' ? opls
    : filtroStatus === 'Em Producao' ? opls.filter(o => (o.status_geral||'').includes('Producao') || (o.status_geral||'').includes('CQ'))
    : filtroStatus === 'Concluidas' ? opls.filter(o => (o.status_geral||'').includes('Faturado') || (o.status_geral||'').includes('Aprovado CQ'))
    : opls.filter(o => !((o.status_geral||'').includes('Producao') || (o.status_geral||'').includes('Faturado')));

  const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente').length;

  return (
    <div>
      {/* ABAS */}
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:'2px solid #7c3aed'}}>
        <button style={{flex:1,padding:'8px',background:aba==='opls'?'#7c3aed':'white',color:aba==='opls'?'white':'#7c3aed',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAba('opls')}>
          📸 OPs Liberadas para Divulgação ({opls.length})
        </button>
        <button style={{flex:1,padding:'8px',background:aba==='pedidos'?'#7c3aed':'white',color:aba==='pedidos'?'white':'#7c3aed',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAba('pedidos')}>
          🎬 Pedidos de Registro {pedidosPendentes>0 ? `(${pedidosPendentes} pendente${pedidosPendentes>1?'s':''})` : ''}
        </button>
      </div>

      {/* ABA OPLs */}
      {aba === 'opls' && (
        <div>
          <div className="sec-card">
            <div className="sec-hdr" style={{background:'#7c3aed'}}>
              <span style={{color:'white'}}>OPs Autorizadas para Divulgação</span>
              <div style={{display:'flex',gap:6}}>
                {['Todos','Em Andamento','Em Producao','Concluidas'].map(f => (
                  <button key={f} className="acn-btn"
                    style={{background: filtroStatus===f?'white':'rgba(255,255,255,0.2)', color: filtroStatus===f?'#7c3aed':'white', fontSize:10, padding:'3px 8px'}}
                    onClick={()=>setFiltroStatus(f)}>{f}</button>
                ))}
              </div>
            </div>
            <div className="sec-body">
              {loading ? (
                <div className="acn-empty">Carregando...</div>
              ) : oplsFiltradas.length === 0 ? (
                <div className="acn-empty">
                  {opls.length === 0
                    ? 'Nenhuma OP liberada para divulgacao. Marque "Liberado para Divulgacao" ao cadastrar a OP no Comercial.'
                    : 'Nenhuma OP neste filtro.'}
                </div>
              ) : (
                <div>
                  {oplsFiltradas.map(opl => (
                    <OplCard
                      key={opl.id}
                      opl={opl}
                      currentUser={currentUser}
                      intervencoes={intervencoes}
                      onAddIntervencao={fetchAll}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA PEDIDOS DE REGISTRO */}
      {aba === 'pedidos' && (
        <div>
          <div className="sec-card">
            <div className="sec-hdr" style={{background:'#7c3aed'}}>
              <span style={{color:'white'}}>Pedidos de Registro — Foto / Video</span>
              <button className="acn-btn" style={{background:'white',color:'#7c3aed',fontWeight:700}}
                onClick={()=>{setPedidoForm(PEDIDO_VAZIO);setShowFormPedido(!showFormPedido);}}>
                + Novo Pedido
              </button>
            </div>

            {/* FORM NOVO PEDIDO */}
            {showFormPedido && (
              <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0',background:'#faf5ff'}}>
                <div style={{fontWeight:700,fontSize:11,color:'#7c3aed',marginBottom:8}}>Novo Pedido de Registro</div>
                <div className="form-row">
                  <div className="form-group" style={{flex:2}}>
                    <label className="acn-label">Local dos Registros *</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="Ex: Linha de producao, Patio, Sala de montagem..."
                      value={pedidoForm.local_registro} onChange={e=>setPedidoForm({...pedidoForm,local_registro:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Horario / Turno</label>
                    <select className="acn-input" style={{width:'100%'}} value={pedidoForm.hora_turno} onChange={e=>setPedidoForm({...pedidoForm,hora_turno:e.target.value})}>
                      {TURNOS.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Tipo de Registro</label>
                    <select className="acn-input" style={{width:'100%'}} value={pedidoForm.tipo} onChange={e=>setPedidoForm({...pedidoForm,tipo:e.target.value})}>
                      {TIPOS_REG.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="acn-label">Categoria *</label>
                    <select className="acn-input" style={{width:'100%'}} value={pedidoForm.categoria} onChange={e=>setPedidoForm({...pedidoForm,categoria:e.target.value})}>
                      {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="acn-label">OP Vinculada (opcional)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="Numero da OPL ou OPD..."
                      value={pedidoForm.numero_opl} onChange={e=>setPedidoForm({...pedidoForm,numero_opl:e.target.value})} />
                  </div>
                  <div className="form-group" style={{flex:2}}>
                    <label className="acn-label">Observacoes / Instrucoes</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="Detalhe o que deve ser registrado..."
                      value={pedidoForm.observacoes} onChange={e=>setPedidoForm({...pedidoForm,observacoes:e.target.value})} />
                  </div>
                </div>
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  <button className="acn-btn" style={{background:'#7c3aed',flex:1,padding:'7px',opacity:salvandoPedido?0.6:1}} onClick={salvarPedido} disabled={salvandoPedido}>
                    {salvandoPedido ? 'Salvando...' : 'CRIAR PEDIDO'}
                  </button>
                  <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setShowFormPedido(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* LISTA PEDIDOS */}
            <div className="sec-body" style={{overflowX:'auto'}}>
              {pedidos.length === 0 ? (
                <div className="acn-empty">Nenhum pedido de registro criado.</div>
              ) : (
                <table>
                  <thead><tr>
                    <th>Data</th><th>OP</th><th>Local</th><th>Horario/Turno</th>
                    <th>Tipo</th><th>Categoria</th><th>Observacoes</th><th>Solicitante</th><th>Status</th><th>Acao</th>
                  </tr></thead>
                  <tbody>
                    {pedidos.map(p => (
                      <tr key={p.id} style={{background: p.status==='Pendente'?'#faf5ff': p.status==='Realizado'?'#f0fdf4':'white'}}>
                        <td style={{whiteSpace:'nowrap'}}>{fmtDtHr(p.created_at)}</td>
                        <td>{p.numero_opl || '—'}</td>
                        <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.local_registro || '—'}</td>
                        <td style={{whiteSpace:'nowrap'}}>{p.hora_turno || '—'}</td>
                        <td>
                          <span style={{fontSize:10,fontWeight:700,background: p.tipo==='Video'?'#dbeafe': p.tipo==='Foto e Video'?'#fae8ff':'#dcfce7',
                            color: p.tipo==='Video'?'#1d4ed8': p.tipo==='Foto e Video'?'#7c3aed':'#166534',
                            padding:'1px 6px',borderRadius:10}}>
                            {p.tipo==='Foto'?'📷':p.tipo==='Video'?'🎬':'📷🎬'} {p.tipo}
                          </span>
                        </td>
                        <td>{p.categoria || '—'}</td>
                        <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:10}}>{p.observacoes || '—'}</td>
                        <td style={{fontSize:10}}>{p.criado_por_nome || '—'}</td>
                        <td>
                          <span className="acn-badge" style={{background:corStatusPedido(p.status)}}>{p.status}</span>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:3}}>
                            {p.status === 'Pendente' && (
                              <button className="acn-btn" style={{background:'#22c55e',fontSize:10}} onClick={()=>atualizarStatusPedido(p.id,'Realizado')}>
                                REALIZADO
                              </button>
                            )}
                            {p.status === 'Pendente' && (
                              <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={()=>atualizarStatusPedido(p.id,'Cancelado')}>
                                CANCELAR
                              </button>
                            )}
                            {p.status !== 'Pendente' && (
                              <button className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={()=>atualizarStatusPedido(p.id,'Pendente')}>
                                REABRIR
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
        </div>
      )}
    </div>
  );
}
