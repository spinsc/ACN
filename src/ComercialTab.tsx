// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal } from './AcnTabShared';
import { ColaboradorSelect } from './ColaboradorSelect';
import OplAnexosWidget from './OplAnexosWidget';
import { notificarEvento, msg } from './whatsappHelper';
import { ClienteAutocomplete, clienteToForm, salvarClienteAuto } from './ClienteUtils';


const TIPOS_PROJETO = [
  { emoji:'🚔', label:'Transformacao Veicular Ostensiva' },
  { emoji:'🥷', label:'Transformacao Veicular Discreta' },
  { emoji:'📻', label:'Radio' },
  { emoji:'📦', label:'Modulo Expansivel' },
  { emoji:'⚓', label:'Flutuante' },
  { emoji:'🔧', label:'Manutencao' },
  { emoji:'⚠️', label:'Garantia' },
  { emoji:'📋', label:'Orcamento' },
  { emoji:'🔨', label:'Execucao por Terceiro' },
  { emoji:'📤', label:'Envio de Material para Terceiro' },
  { emoji:'🛒', label:'Envio de Produto Vendido' },
  { emoji:'🔀', label:'Demanda Direta para Engenharia' },
];

const TIPOS_CONTATO = ['Ligacao','WhatsApp','Email','Reuniao','Visita'];
const RESULTADOS_CONTATO = ['Contato Realizado','Nao Atendeu','Caixa Postal','Proposta Enviada','Pedido Fechado','Reagendado','Sem Interesse'];

const FORM_VAZIO = {
  opl:'', chassi:'', modelo:'', tipo_projeto:'Transformacao Veicular Ostensiva',
  tipo_op:'OPL', cliente_nome:'', responsavel_comercial:'',
  _cliente_id: null, _cliente_obj: null,
  data_entrada: new Date().toISOString().split('T')[0],
  data_prevista_entrega:'', item_envio:false, liberado_divulgacao:false, observacoes_comercial:'',
  quantidade: 1,
  valor_total: '', valor_mao_de_obra: '',
};

// ---- CRM removido — use a aba CRM independente ----
function CRMSection({ currentUser }) { return null; }
function _UNUSED_CRMSection({ currentUser }) {
  const [clientes, setClientes] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [showFormCliente, setShowFormCliente] = useState(false);
  const [crmForm, setCrmForm] = useState(CRM_VAZIO);
  const [modalContato, setModalContato] = useState(null); // cliente selecionado para registrar contato
  const [contatoForm, setContatoForm] = useState({ tipo_contato:'Ligacao', resultado:'Contato Realizado', observacoes:'', proxima_data:'' });
  const [modalHistorico, setModalHistorico] = useState(null); // cliente para ver historico
  const [histCliente, setHistCliente] = useState([]);
  // Relatorios
  const [abaRelat, setAbaRelat] = useState(null);
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState(new Date().toISOString().split('T')[0]);
  const [relatData, setRelatData] = useState([]);

  useEffect(() => { fetchCRM(); }, []);

  const fetchCRM = async () => {
    const [cliRes, histRes] = await Promise.all([
      supabase.from('crm_clientes').select('*').order('data_proximo_contato', { ascending: true }),
      supabase.from('crm_historico_contatos').select('*').order('data_contato', { ascending: false }).limit(200),
    ]);
    setClientes(cliRes.data || []);
    setHistorico(histRes.data || []);
  };

  const salvarCliente = async () => {
    if (!crmForm.nome_cliente) { alert('Informe o nome!'); return; }
    await supabase.from('crm_clientes').insert([{ ...crmForm, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome }]);
    setCrmForm(CRM_VAZIO); setShowFormCliente(false); fetchCRM();
  };

  const registrarContato = async () => {
    const c = modalContato;
    if (!contatoForm.observacoes.trim() && contatoForm.resultado === 'Contato Realizado') {
      if (!window.confirm('Registrar contato sem observacao?')) return;
    }
    const agora = new Date().toISOString();
    // Insert historico
    await supabase.from('crm_historico_contatos').insert([{
      cliente_id: c.id,
      nome_cliente: c.nome_cliente,
      empresa: c.empresa,
      tipo_contato: contatoForm.tipo_contato,
      resultado: contatoForm.resultado,
      observacoes: contatoForm.observacoes,
      data_contato: agora,
      proxima_data: contatoForm.proxima_data || null,
      operador_nome: currentUser?.nome,
      operador_email: currentUser?.email,
    }]);
    // Atualizar cliente
    const upd = {
      ultimo_resultado: contatoForm.resultado,
      data_ultimo_contato: agora,
      total_contatos: (c.total_contatos || 0) + 1,
    };
    if (contatoForm.proxima_data) upd.data_proximo_contato = contatoForm.proxima_data + 'T09:00:00';
    await supabase.from('crm_clientes').update(upd).eq('id', c.id);
    setModalContato(null);
    setContatoForm({ tipo_contato:'Ligacao', resultado:'Contato Realizado', observacoes:'', proxima_data:'' });
    fetchCRM();
  };

  const verHistoricoCliente = async (c) => {
    const { data } = await supabase.from('crm_historico_contatos')
      .select('*').eq('cliente_id', c.id).order('data_contato', { ascending: false });
    setHistCliente(data || []);
    setModalHistorico(c);
  };

  const buscarRelatorio = async (tipo) => {
    setAbaRelat(tipo);
    let data = [];
    if (tipo === 'periodo') {
      const ini = filtroInicio ? filtroInicio + 'T00:00:00' : '2020-01-01T00:00:00';
      const fim = filtroFim ? filtroFim + 'T23:59:59' : new Date().toISOString();
      const { data: d } = await supabase.from('crm_historico_contatos')
        .select('*').gte('data_contato', ini).lte('data_contato', fim)
        .order('data_contato', { ascending: false });
      data = d || [];
    } else if (tipo === 'atrasados') {
      const limite = new Date(); limite.setDate(limite.getDate() - 2);
      const { data: d } = await supabase.from('crm_clientes')
        .select('*').lt('data_proximo_contato', limite.toISOString())
        .order('data_proximo_contato', { ascending: true });
      data = d || [];
    } else if (tipo === 'por_operador') {
      const { data: d } = await supabase.from('crm_historico_contatos')
        .select('operador_nome, resultado, data_contato, nome_cliente, observacoes')
        .order('operador_nome', { ascending: true });
      data = d || [];
    } else if (tipo === 'funil') {
      const { data: d } = await supabase.from('crm_historico_contatos').select('resultado');
      const counts = {};
      (d || []).forEach(r => { counts[r.resultado] = (counts[r.resultado] || 0) + 1; });
      data = Object.entries(counts).map(([resultado, total]) => ({ resultado, total })).sort((a,b) => b.total - a.total);
    } else if (tipo === 'sem_contato') {
      const { data: d } = await supabase.from('crm_clientes')
        .select('*').is('data_ultimo_contato', null)
        .order('created_at', { ascending: false });
      data = d || [];
    }
    setRelatData(data);
  };

  const isOverdue = (dt) => dt && (new Date() - new Date(dt)) / 86400000 > 2;
  const diasAtraso = (dt) => dt ? Math.floor((new Date() - new Date(dt)) / 86400000) : 0;
  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const overdue = clientes.filter(c => isOverdue(c.data_proximo_contato));
  const ok = clientes.filter(c => !isOverdue(c.data_proximo_contato));

  const corResultado = (r) => ({
    'Contato Realizado':'#22c55e','Pedido Fechado':'#2563eb','Proposta Enviada':'#7c3aed',
    'Nao Atendeu':'#f59e0b','Caixa Postal':'#94a3b8','Reagendado':'#f97316','Sem Interesse':'#ef4444',
  })[r] || '#94a3b8';

  // Relatorios agrupados por operador
  const porOperador = abaRelat === 'por_operador' ? relatData.reduce((acc, r) => {
    const op = r.operador_nome || 'Sem operador';
    if (!acc[op]) acc[op] = [];
    acc[op].push(r);
    return acc;
  }, {}) : {};

  return (
    <div>
      {/* ALERTA ATRASADOS */}
      {overdue.length > 0 && (
        <div style={{background:'#fef2f2',border:'2px solid #ef4444',borderRadius:6,padding:'8px 12px',marginBottom:10,display:'flex',alignItems:'center',gap:10}}>
          <span style={{color:'#dc2626',fontWeight:700,fontSize:12}}>ATENCAO — {overdue.length} contato(s) atrasado(s):</span>
          {overdue.slice(0,5).map(c => (
            <span key={c.id} className="acn-badge" style={{background:'#dc2626'}}>
              {c.nome_cliente} ({diasAtraso(c.data_proximo_contato)}d)
            </span>
          ))}
        </div>
      )}

      {/* LISTA CRM */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#eff6ff',borderBottom:'2px solid #3b82f6'}}>
          <span style={{color:'#1e40af'}}>CRM — Controle de Contatos Comerciais ({clientes.length})</span>
          <div style={{display:'flex',gap:6}}>
            <button className="acn-btn" style={{background:'#2563eb'}} onClick={()=>setShowFormCliente(s=>!s)}>
              {showFormCliente ? 'Cancelar' : '+ Novo Cliente/Contato'}
            </button>
          </div>
        </div>

        {showFormCliente && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group"><label className="acn-label">Nome *</label>
                <input className="acn-input" style={{width:'100%'}} value={crmForm.nome_cliente} onChange={e=>setCrmForm({...crmForm,nome_cliente:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Empresa</label>
                <input className="acn-input" style={{width:'100%'}} value={crmForm.empresa} onChange={e=>setCrmForm({...crmForm,empresa:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Telefone/WhatsApp</label>
                <input className="acn-input" style={{width:'100%'}} value={crmForm.telefone} onChange={e=>setCrmForm({...crmForm,telefone:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">E-mail</label>
                <input className="acn-input" style={{width:'100%'}} value={crmForm.email} onChange={e=>setCrmForm({...crmForm,email:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Operador Resp.</label>
                <input className="acn-input" style={{width:'100%'}} value={crmForm.operador_responsavel||currentUser?.nome} onChange={e=>setCrmForm({...crmForm,operador_responsavel:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Data Proximo Contato</label>
                <input type="date" className="acn-input" style={{width:'100%'}} value={crmForm.data_proximo_contato} onChange={e=>setCrmForm({...crmForm,data_proximo_contato:e.target.value})} /></div>
            </div>
            <div><label className="acn-label">Observacao inicial</label>
              <input className="acn-input" style={{width:'100%'}} value={crmForm.observacoes} onChange={e=>setCrmForm({...crmForm,observacoes:e.target.value})} /></div>
            <button className="acn-btn" style={{background:'#2563eb',width:'100%',marginTop:8,padding:'7px'}} onClick={salvarCliente}>+ Cadastrar</button>
          </div>
        )}

        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          <table>
            <thead><tr>
              <th>Cliente</th><th>Empresa</th><th>Telefone</th><th>Operador</th>
              <th>Ult. Contato</th><th>Ult. Resultado</th><th>Prox. Contato</th><th>Total Cont.</th><th>Acoes</th>
            </tr></thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr><td colSpan={9} className="acn-empty">Nenhum cliente cadastrado.</td></tr>
              ) : clientes.map(c => {
                const atrasado = isOverdue(c.data_proximo_contato);
                return (
                  <tr key={c.id} style={atrasado ? {background:'#fff5f5'} : {}}>
                    <td><strong style={{color: atrasado?'#dc2626':'#1e293b'}}>{c.nome_cliente}</strong>
                      {atrasado && <span style={{marginLeft:4,fontSize:9,background:'#dc2626',color:'white',padding:'1px 4px',borderRadius:3}}>ATRASADO {diasAtraso(c.data_proximo_contato)}d</span>}
                    </td>
                    <td>{c.empresa||'—'}</td>
                    <td>{c.telefone||'—'}</td>
                    <td>{c.operador_responsavel||'—'}</td>
                    <td>{fmtDtHr(c.data_ultimo_contato)}</td>
                    <td>
                      {c.ultimo_resultado
                        ? <span className="acn-badge" style={{background:corResultado(c.ultimo_resultado)}}>{c.ultimo_resultado}</span>
                        : <span style={{fontSize:10,color:'#94a3b8'}}>Sem contato</span>}
                    </td>
                    <td style={{color: atrasado?'#dc2626':'#1e293b',fontWeight:atrasado?700:400}}>
                      {fmtDt(c.data_proximo_contato)}
                    </td>
                    <td style={{textAlign:'center'}}>{c.total_contatos||0}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#22c55e',fontSize:10}}
                          onClick={()=>{setModalContato(c);setContatoForm({tipo_contato:'Ligacao',resultado:'Contato Realizado',observacoes:'',proxima_data:''});}}>
                          CONTATO
                        </button>
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>verHistoricoCliente(c)}>
                          HISTORICO
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RELATORIOS */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#f8fafc',borderBottom:'2px solid #1e293b'}}>
          <span style={{color:'#1e293b'}}>Relatorios CRM</span>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {[
              {key:'periodo',    label:'Por Periodo'},
              {key:'atrasados',  label:'Atrasados por Op.'},
              {key:'por_operador',label:'Por Operador'},
              {key:'funil',      label:'Funil de Resultados'},
              {key:'sem_contato',label:'Sem Contato'},
            ].map(r => (
              <button key={r.key} className="acn-btn"
                style={{background: abaRelat===r.key?'#1e293b':'#94a3b8',fontSize:10}}
                onClick={()=>buscarRelatorio(r.key)}>{r.label}</button>
            ))}
          </div>
        </div>

        {abaRelat === 'periodo' && (
          <div className="sec-body">
            <div className="form-row" style={{marginBottom:10}}>
              <div className="form-group"><label className="acn-label">De</label>
                <input type="date" className="acn-input" value={filtroInicio} onChange={e=>setFiltroInicio(e.target.value)} /></div>
              <div className="form-group"><label className="acn-label">Ate</label>
                <input type="date" className="acn-input" value={filtroFim} onChange={e=>setFiltroFim(e.target.value)} /></div>
              <div style={{display:'flex',alignItems:'flex-end'}}>
                <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>buscarRelatorio('periodo')}>Filtrar</button>
              </div>
            </div>
            {relatData.length === 0 ? <div className="acn-empty">Nenhum contato no periodo.</div> : (
              <>
                <div style={{fontSize:11,color:'#64748b',marginBottom:6}}>
                  <strong>{relatData.length}</strong> contatos | <strong>{[...new Set(relatData.map(r=>r.operador_nome))].length}</strong> operadores
                </div>
                <table>
                  <thead><tr><th>Data/Hora</th><th>Cliente</th><th>Empresa</th><th>Tipo</th><th>Resultado</th><th>Operador</th><th>Observacao</th><th>Prox. Contato</th></tr></thead>
                  <tbody>
                    {relatData.map(r => (
                      <tr key={r.id}>
                        <td>{fmtDtHr(r.data_contato)}</td>
                        <td>{r.nome_cliente}</td>
                        <td>{r.empresa||'—'}</td>
                        <td>{r.tipo_contato}</td>
                        <td><span className="acn-badge" style={{background:corResultado(r.resultado)}}>{r.resultado}</span></td>
                        <td>{r.operador_nome}</td>
                        <td style={{maxWidth:200,fontSize:10}}>{r.observacoes||'—'}</td>
                        <td>{r.proxima_data ? new Date(r.proxima_data).toLocaleDateString('pt-BR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {abaRelat === 'atrasados' && (
          <div className="sec-body" style={{overflowX:'auto'}}>
            {relatData.length === 0 ? <div className="acn-empty" style={{color:'#22c55e'}}>Nenhum contato atrasado.</div> : (
              <>
                <div style={{fontSize:11,color:'#dc2626',marginBottom:6,fontWeight:700}}>
                  {relatData.length} cliente(s) com contato atrasado h2 dias
                </div>
                <table>
                  <thead><tr><th>Cliente</th><th>Empresa</th><th>Operador Resp.</th><th>Prox. Contato era</th><th>Atraso</th><th>Ult. Resultado</th><th>Telefone</th></tr></thead>
                  <tbody>
                    {relatData.map(c => (
                      <tr key={c.id} style={{background:'#fff5f5'}}>
                        <td><strong style={{color:'#dc2626'}}>{c.nome_cliente}</strong></td>
                        <td>{c.empresa||'—'}</td>
                        <td>{c.operador_responsavel||'—'}</td>
                        <td style={{color:'#dc2626',fontWeight:700}}>{fmtDt(c.data_proximo_contato)}</td>
                        <td><span className="acn-badge" style={{background:'#dc2626'}}>{diasAtraso(c.data_proximo_contato)}d</span></td>
                        <td>{c.ultimo_resultado ? <span className="acn-badge" style={{background:corResultado(c.ultimo_resultado)}}>{c.ultimo_resultado}</span> : '—'}</td>
                        <td>{c.telefone||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {abaRelat === 'por_operador' && (
          <div className="sec-body">
            {Object.keys(porOperador).length === 0 ? <div className="acn-empty">Sem dados.</div> : (
              Object.entries(porOperador).map(([op, contatos]) => (
                <div key={op} style={{marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:12,color:'#1e293b',background:'#f1f5f9',padding:'5px 10px',borderRadius:4,marginBottom:6,display:'flex',justifyContent:'space-between'}}>
                    <span>{op}</span>
                    <span style={{color:'#64748b'}}>{contatos.length} contato(s)</span>
                  </div>
                  <table>
                    <thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Resultado</th><th>Observacao</th></tr></thead>
                    <tbody>
                      {contatos.map((c,i) => (
                        <tr key={i}>
                          <td>{fmtDtHr(c.data_contato)}</td>
                          <td>{c.nome_cliente}</td>
                          <td>{c.tipo_contato}</td>
                          <td><span className="acn-badge" style={{background:corResultado(c.resultado)}}>{c.resultado}</span></td>
                          <td style={{maxWidth:200,fontSize:10}}>{c.observacoes||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        )}

        {abaRelat === 'funil' && (
          <div className="sec-body">
            {relatData.length === 0 ? <div className="acn-empty">Sem dados.</div> : (
              <>
                <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
                  Total de registros: <strong>{relatData.reduce((s,r)=>s+r.total,0)}</strong>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {relatData.map(r => {
                    const pct = Math.round(r.total / relatData.reduce((s,x)=>s+x.total,0) * 100);
                    return (
                      <div key={r.resultado} style={{flex:'1 1 180px',minWidth:150,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'10px 14px'}}>
                        <div style={{fontSize:10,color:'#64748b',marginBottom:4}}>{r.resultado}</div>
                        <div style={{fontSize:22,fontWeight:700,color: corResultado(r.resultado)}}>{r.total}</div>
                        <div style={{marginTop:4,height:4,background:'#e2e8f0',borderRadius:2}}>
                          <div style={{width:pct+'%',height:'100%',background:corResultado(r.resultado),borderRadius:2}} />
                        </div>
                        <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {abaRelat === 'sem_contato' && (
          <div className="sec-body" style={{overflowX:'auto'}}>
            {relatData.length === 0 ? <div className="acn-empty" style={{color:'#22c55e'}}>Todos os clientes ja foram contactados.</div> : (
              <>
                <div style={{fontSize:11,color:'#f59e0b',marginBottom:6,fontWeight:700}}>
                  {relatData.length} cliente(s) sem nenhum contato registrado
                </div>
                <table>
                  <thead><tr><th>Cliente</th><th>Empresa</th><th>Telefone</th><th>Operador Resp.</th><th>Cadastrado em</th><th>Prox. Contato</th></tr></thead>
                  <tbody>
                    {relatData.map(c => (
                      <tr key={c.id} style={{background:'#fffbeb'}}>
                        <td><strong>{c.nome_cliente}</strong></td>
                        <td>{c.empresa||'—'}</td>
                        <td>{c.telefone||'—'}</td>
                        <td>{c.operador_responsavel||'—'}</td>
                        <td>{fmtDt(c.created_at||c.criado_em)}</td>
                        <td style={{color:'#f59e0b'}}>{fmtDt(c.data_proximo_contato)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {!abaRelat && (
          <div className="sec-body">
            <div style={{fontSize:11,color:'#94a3b8',textAlign:'center',padding:'16px 0'}}>
              Selecione um relatorio acima para visualizar.
            </div>
            {historico.length > 0 && (
              <div style={{marginTop:8}}>
                <div style={{fontWeight:700,fontSize:11,color:'#1e293b',marginBottom:8}}>Ultimos contatos registrados</div>
                <table>
                  <thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Resultado</th><th>Operador</th><th>Observacao</th></tr></thead>
                  <tbody>
                    {historico.slice(0,10).map(h => (
                      <tr key={h.id}>
                        <td>{fmtDtHr(h.data_contato)}</td>
                        <td>{h.nome_cliente}</td>
                        <td>{h.tipo_contato}</td>
                        <td><span className="acn-badge" style={{background:corResultado(h.resultado)}}>{h.resultado}</span></td>
                        <td>{h.operador_nome}</td>
                        <td style={{maxWidth:180,fontSize:10}}>{h.observacoes||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR CONTATO */}
      {modalContato && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:500}}>
            <div className="modal-title">Registrar Contato — {modalContato.nome_cliente}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>
              {modalContato.empresa} | {modalContato.telefone||'—'} | Operador: {currentUser?.nome}
            </div>
            <div className="form-row">
              <div style={{flex:1}}>
                <label className="acn-label">Tipo de Contato</label>
                <select className="acn-input" style={{width:'100%'}} value={contatoForm.tipo_contato} onChange={e=>setContatoForm({...contatoForm,tipo_contato:e.target.value})}>
                  {TIPOS_CONTATO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <label className="acn-label">Resultado</label>
                <select className="acn-input" style={{width:'100%'}} value={contatoForm.resultado} onChange={e=>setContatoForm({...contatoForm,resultado:e.target.value})}>
                  {RESULTADOS_CONTATO.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <label className="acn-label">Observacoes / Detalhes do Contato</label>
            <textarea className="acn-input" rows={4} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="O que foi discutido? Interesse demonstrado? Proximos passos?..."
              value={contatoForm.observacoes} onChange={e=>setContatoForm({...contatoForm,observacoes:e.target.value})} />
            <label className="acn-label">Data do Proximo Contato</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:14}}
              value={contatoForm.proxima_data} onChange={e=>setContatoForm({...contatoForm,proxima_data:e.target.value})} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'8px'}} onClick={registrarContato}>SALVAR CONTATO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalContato(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORICO CLIENTE */}
      {modalHistorico && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:620}}>
            <div className="modal-title">Historico de Contatos — {modalHistorico.nome_cliente}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>{modalHistorico.empresa} | Total: {histCliente.length} contato(s)</div>
            {histCliente.length === 0 ? <div className="acn-empty">Sem historico registrado.</div> : (
              <div style={{maxHeight:400,overflowY:'auto'}}>
                {histCliente.map((h,i) => (
                  <div key={h.id} style={{borderBottom:'1px solid #e2e8f0',padding:'8px 0',marginBottom:4}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:4}}>
                      <div>
                        <span className="acn-badge" style={{background:corResultado(h.resultado)}}>{h.resultado}</span>
                        <span style={{marginLeft:6,fontSize:10,color:'#64748b'}}>{h.tipo_contato}</span>
                      </div>
                      <div style={{fontSize:10,color:'#94a3b8'}}>{fmtDtHr(h.data_contato)} — {h.operador_nome}</div>
                    </div>
                    {h.observacoes && <div style={{fontSize:11,color:'#1e293b',marginTop:4,lineHeight:1.4}}>{h.observacoes}</div>}
                    {h.proxima_data && <div style={{fontSize:10,color:'#2563eb',marginTop:2}}>Proximo contato agendado: {new Date(h.proxima_data).toLocaleDateString('pt-BR')}</div>}
                  </div>
                ))}
              </div>
            )}
            <button className="acn-btn" style={{background:'#94a3b8',width:'100%',marginTop:12}} onClick={()=>setModalHistorico(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ComercialTab principal ----
export default function ComercialTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(FORM_VAZIO);
  const [editId, setEditId] = useState(null);
  const [oneNoteUrl, setOneNoteUrl] = useState('');
  const [modalEntregue, setModalEntregue] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [nomeRecebeu, setNomeRecebeu] = useState('');

  // Categorias de tipo de projeto (sac_categorias + hardcoded)
  const [categoriasExtra, setCategoriasExtra] = useState<string[]>([]);
  const [mostraNovaCat, setMostraNovaCat] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');

  const fetchCategoriasExtra = async () => {
    const { data } = await supabase.from('sac_categorias').select('nome').eq('ativo', true).order('nome');
    const nomesBD = (data||[]).map(c=>c.nome);
    const nomesBase = TIPOS_PROJETO.map(t=>t.label);
    const extras = nomesBD.filter(n => !nomesBase.includes(n));
    setCategoriasExtra(extras);
  };

  const salvarNovaCategoria = async () => {
    const nome = novaCategoriaNome.trim();
    if (!nome) return;
    await supabase.from('sac_categorias').insert([{ nome, ativo: true }]);
    setFormData(f=>({...f, tipo_projeto: nome}));
    setNovaCategoriaNome(''); setMostraNovaCat(false);
    fetchCategoriasExtra();
  };

  useEffect(() => { fetchOpls(); fetchCategoriasExtra(); const t = setInterval(fetchOpls, 30000); return () => clearInterval(t); }, []);

  const [oplsMkt, setOplsMkt] = useState([]);

  const fetchOplsMkt = async () => {
    const { data } = await supabase.from('oples').select('id,opl,chassi,tipo_projeto,status_geral,status_bom,status_almox,data_prevista_entrega,cliente_nome')
      .eq('liberado_divulgacao', true)
      .not('status_geral', 'in', '("Faturado","Cancelado")')
      .order('data_entrada', { ascending: false });
    setOplsMkt(data || []);
  };

  const fetchOpls = async () => {
    setLoading(true);
    const { data } = await supabase.from('oples').select('*').order('data_entrada', { ascending: false });
    setOpls(data || []);
    setLoading(false);
  };

  const salvarOPL = async () => {
    if (!formData.opl || !formData.modelo) { alert('Preencha numero da OP e Modelo!'); return; }
    const isManutencao = (formData.tipo_projeto||'').toLowerCase().includes('manutencao') || (formData.tipo_projeto||'').toLowerCase().includes('manutenção');
    const statusInicial = editId ? formData.status_geral : (isManutencao ? 'Aguardando Agendamento Manutenção' : 'Em Espera Engenharia');
    const { _cliente_id: _cid, _cliente_obj: _cobj, ...formLimpo } = formData;
    const payload = { ...formLimpo, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, status_geral: statusInicial };
    if (editId) {
      // Buscar dados anteriores para log
      const { data: anterior } = await supabase.from('oples').select('opl,status_geral,cliente_nome,modelo,chassi,data_prevista_entrega,quantidade').eq('id', editId).single();
      const { error } = await supabase.from('oples').update(payload).eq('id', editId);
      if (error) { alert('Erro ao atualizar: ' + error.message); return; }
      // Registrar log da alteração
      const alteracoes = [];
      if (anterior?.modelo !== formData.modelo) alteracoes.push(`Modelo: "${anterior?.modelo}" → "${formData.modelo}"`);
      if (anterior?.chassi !== formData.chassi) alteracoes.push(`Chassi: "${anterior?.chassi}" → "${formData.chassi}"`);
      if (anterior?.cliente_nome !== formData.cliente_nome) alteracoes.push(`Cliente: "${anterior?.cliente_nome}" → "${formData.cliente_nome}"`);
      if (anterior?.data_prevista_entrega?.slice(0,10) !== formData.data_prevista_entrega) alteracoes.push(`Prev. Entrega: "${anterior?.data_prevista_entrega?.slice(0,10)||'—'}" → "${formData.data_prevista_entrega}"`);
      if (anterior?.quantidade !== formData.quantidade) alteracoes.push(`Quantidade: ${anterior?.quantidade} → ${formData.quantidade}`);
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: editId,
        numero_opl: anterior?.opl || formData.opl,
        setor: 'Comercial',
        evento: `OP alterada pelo Comercial.${alteracoes.length ? ' Alterações: ' + alteracoes.join('; ') : ''}`,
        status_anterior: anterior?.status_geral,
        status_novo: anterior?.status_geral,
        usuario_nome: currentUser?.nome,
        usuario_email: currentUser?.email,
        data_hora: new Date().toISOString(),
      }]);
    } else {
      const { data: existente } = await supabase.from('oples').select('id').eq('opl', formData.opl).maybeSingle();
      if (existente) { alert(`OP "${formData.opl}" ja esta cadastrada. Clique no numero da OP no historico para editar.`); return; }
      const { error } = await supabase.from('oples').insert([payload]);
      if (error) { alert('Erro ao cadastrar: ' + error.message); return; }
      const { data: nova } = await supabase.from('oples').select('id').eq('opl', formData.opl).single();
      if (nova) {
        await supabase.from('logs_movimentacao_opl').insert([{
          opl_id: nova.id, numero_opl: formData.opl, setor: 'Comercial',
          evento: 'Demanda cadastrada e enviada para Engenharia.',
          status_anterior: '', status_novo: 'Em Espera PCP',
          usuario_nome: currentUser?.nome, usuario_email: currentUser?.email, data_hora: new Date().toISOString(),
        }]);
      }
    }
    const savedCliente = formData.cliente_nome;
    const savedClienteId = formData._cliente_id;
    const savedClienteObj = { ...formData };
    setFormData(FORM_VAZIO); setShowForm(false); setEditId(null); fetchOpls();
    if (!editId) notificarEvento('op_enviada_engenharia', msg.oplEnviada(formData.opl,'Engenharia',currentUser?.nome));
    if (savedCliente) salvarClienteAuto(savedClienteObj, savedClienteId).catch(console.error);
  };

  const enviarParaEngenharia = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({ status_geral: 'Em Espera Engenharia' }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial',
      evento: 'OP reenviada para Engenharia após revisão Comercial.',
      status_anterior: 'Devolvida Comercial', status_novo: 'Em Espera Engenharia',
      usuario_nome: currentUser?.nome, usuario_email: currentUser?.email, data_hora: agora,
    }]);
    notificarEvento('op_enviada_engenharia', msg.oplEnviada(opl.opl,'Engenharia',currentUser?.nome));
    fetchOpls();
  };

  const liberarFaturamento = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({ status_geral: 'Aguarda Emissao NF', status_fiscal: 'Aguardando', data_liberacao_comercial: agora }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{ opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial', evento: 'OPL liberada para faturamento Fiscal.', status_anterior: opl.status_geral, status_novo: 'Aguarda Emissao NF', usuario_nome: currentUser?.nome, data_hora: agora }]);
    notificarEvento('fiscal_nf_emitida', msg.oplEnviada(opl.opl,'Fiscal (Emissão NF)',currentUser?.nome));
    fetchOpls();
  };

  const confirmarEntrega = async () => {
    if (!nomeRecebeu.trim()) { alert('Informe o nome de quem recebeu!'); return; }
    const opl = modalEntregue;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({ status_geral: 'Faturado', cliente_recebeu_nome: nomeRecebeu, data_entrega: agora }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{ opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial', evento: `Equipamento entregue. Recebeu: ${nomeRecebeu}`, status_anterior: opl.status_geral, status_novo: 'Faturado', usuario_nome: currentUser?.nome, data_hora: agora }]);
    notificarEvento('comercial_entregue', msg.entregue(opl.opl, opl.cliente_nome||'—', nomeRecebeu));
    setModalEntregue(null); setNomeRecebeu(''); fetchOpls();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const diasAtraso = (prev) => { if (!prev) return null; const d = Math.ceil((new Date() - new Date(prev)) / 86400000); return d > 0 ? d : null; };
  const statusCor = (s) => ({ 'Em Espera PCP':'#f59e0b','Em Producao':'#3b82f6','Faturado':'#22c55e','Aguarda Emissao NF':'#ef4444' })[s] || '#94a3b8';

  const oplsFaturar  = opls.filter(o => o.status_geral === 'Aprovado CQ - Aguardando Liberacao Comercial' || o.status_geral === 'Aguardando Liberacao Comercial');
  const oplsEntrega  = opls.filter(o => o.status_geral === 'Faturado e Disponivel para Entrega');
  const oplsManutAgendada = opls.filter(o => o.status_geral === 'Manutenção Agendada');

  // Filtros do histórico
  const [filtroResp,        setFiltroResp]        = useState('');
  const [filtroHistDataIni, setFiltroHistDataIni]  = useState('');
  const [filtroHistDataFim, setFiltroHistDataFim]  = useState('');
  const [filtroTipo,        setFiltroTipo]         = useState('');
  const [filtroBusca,       setFiltroBusca]        = useState('');
  const [buscaInput,        setBuscaInput]         = useState('');

  const responsaveis = [...new Set(opls.map(o => o.responsavel_comercial || o.criado_por_nome).filter(Boolean))].sort();
  const tiposProjeto = [...new Set(opls.map(o => o.tipo_projeto).filter(Boolean))].sort();

  const temFiltroAtivo = filtroResp || filtroHistDataIni || filtroHistDataFim || filtroTipo || filtroBusca;

  const limparFiltros = () => {
    setFiltroResp(''); setFiltroHistDataIni(''); setFiltroHistDataFim('');
    setFiltroTipo(''); setFiltroBusca(''); setBuscaInput('');
  };

  const oplsFiltrados = opls.filter(o => {
    if (filtroResp && (o.responsavel_comercial || o.criado_por_nome || '') !== filtroResp) return false;
    if (filtroHistDataIni && (o.data_entrada || '') < filtroHistDataIni) return false;
    if (filtroHistDataFim && (o.data_entrada || '') > filtroHistDataFim + 'T') return false;
    if (filtroTipo && (o.tipo_projeto || '') !== filtroTipo) return false;
    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase().trim();
      const match = Object.values(o).some(v =>
        v != null && typeof v !== 'object' && String(v).toLowerCase().includes(termo)
      );
      if (!match) return false;
    }
    return true;
  });

  const liberarManutencaoEngenharia = async (opl) => {
    const agora = new Date().toISOString();
    await supabase.from('oples').update({ status_geral: 'Em Espera Engenharia' }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial',
      evento: `Manutenção agendada confirmada. Liberada para Engenharia por ${currentUser?.nome}.`,
      status_anterior: 'Manutenção Agendada', status_novo: 'Em Espera Engenharia',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchOpls();
  };

  return (
    <div>
      {/* ENTRADA */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef9c3',borderBottom:'2px solid #fde047'}}>
          <span style={{color:'#713f12'}}>{editId ? '✏️ Editando OP' : 'Entrada de Demanda Comercial'}</span>
          {!showForm && <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setFormData(FORM_VAZIO);setEditId(null);setShowForm(true);}}>+ Nova OP</button>}
        </div>
        {showForm && (
          <div className="sec-body">
            <div className="form-row">
              <div className="form-group"><label className="acn-label">Data Entrada</label><input type="date" className="acn-input" style={{width:'100%'}} value={formData.data_entrada} onChange={e=>setFormData({...formData,data_entrada:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Numero da OP *</label><input className="acn-input" style={{width:'100%'}} value={formData.opl} onChange={e=>setFormData({...formData,opl:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Chassi / ID</label><input className="acn-input" style={{width:'100%'}} value={formData.chassi} onChange={e=>setFormData({...formData,chassi:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Modelo *</label><input className="acn-input" style={{width:'100%'}} value={formData.modelo} onChange={e=>setFormData({...formData,modelo:e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div style={{flex:2,minWidth:200}}><label className="acn-label">Tipo de Projeto</label>
                <select className="acn-input" style={{width:'100%'}} value={formData.tipo_projeto}
                  onChange={e=>{
                    if (e.target.value === '___NOVA___') { setMostraNovaCat(true); }
                    else { setMostraNovaCat(false); setFormData({...formData,tipo_projeto:e.target.value}); }
                  }}>
                  {TIPOS_PROJETO.map(t=><option key={t.label} value={t.label}>{t.emoji} {t.label}</option>)}
                  {categoriasExtra.map(n=><option key={n} value={n}>📌 {n}</option>)}
                  <option value="___NOVA___">➕ Nova Categoria...</option>
                </select>
                {mostraNovaCat && (
                  <div style={{display:'flex',gap:6,marginTop:4}}>
                    <input className="acn-input" style={{flex:1}} placeholder="Nome da nova categoria..."
                      value={novaCategoriaNome} onChange={e=>setNovaCategoriaNome(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&salvarNovaCategoria()} autoFocus />
                    <button className="acn-btn" style={{background:'#22c55e',fontSize:10,padding:'4px 10px'}} onClick={salvarNovaCategoria}>✓</button>
                    <button className="acn-btn" style={{background:'#94a3b8',fontSize:10,padding:'4px 10px'}} onClick={()=>{setMostraNovaCat(false);setNovaCategoriaNome('');}}>✕</button>
                  </div>
                )}
              </div>
              <div className="form-group"><label className="acn-label">Tipo OP</label>
                <select className="acn-input" style={{width:'100%'}} value={formData.tipo_op} onChange={e=>setFormData({...formData,tipo_op:e.target.value})}>
                  <option value="OPL">OP - ACN</option><option value="OPD">OP - DETECH</option>
                </select>
              </div>
              <div className="form-group"><label className="acn-label">Cliente</label>
                <ClienteAutocomplete
                  value={formData.cliente_nome}
                  onChange={v=>setFormData({...formData,cliente_nome:v,_cliente_id:null,_cliente_obj:null})}
                  onSelect={c=>{ const d=clienteToForm(c); setFormData({...formData,cliente_nome:d.cliente_nome,_cliente_id:d._cliente_id,_cliente_obj:d._cliente_obj}); }}
                />
              </div>
              <div className="form-group"><label className="acn-label">Responsável</label><ColaboradorSelect value={formData.responsavel_comercial||''} onChange={v=>setFormData({...formData,responsavel_comercial:v})} placeholder="Selecione o responsável" className="acn-input" style={{width:'100%'}} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="acn-label">Prev. Entrega</label><input type="date" className="acn-input" style={{width:'100%'}} value={formData.data_prevista_entrega} onChange={e=>setFormData({...formData,data_prevista_entrega:e.target.value})} /></div>
              <div className="form-group" style={{maxWidth:110}}><label className="acn-label">Qtd. Unidades *</label><input type="number" min={1} className="acn-input" style={{width:'100%'}} value={formData.quantidade||1} onChange={e=>setFormData({...formData,quantidade:parseInt(e.target.value)||1})} /></div>
              <div className="form-group" style={{maxWidth:140}}><label className="acn-label">Valor Total (R$)</label><input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00" value={formData.valor_total||''} onChange={e=>setFormData({...formData,valor_total:e.target.value})} /></div>
              <div className="form-group" style={{maxWidth:140}}><label className="acn-label">Mão de Obra (R$)</label><input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00" value={formData.valor_mao_de_obra||''} onChange={e=>setFormData({...formData,valor_mao_de_obra:e.target.value})} /></div>
              <div style={{flex:3}}><label className="acn-label">Observacoes</label><input className="acn-input" style={{width:'100%'}} value={formData.observacoes_comercial} onChange={e=>setFormData({...formData,observacoes_comercial:e.target.value})} /></div>
              <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
                <label style={{fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={formData.item_envio} onChange={e=>setFormData({...formData,item_envio:e.target.checked})} style={{marginRight:4}}/>Item de Envio</label>
              </div>
              <div style={{display:'flex',alignItems:'flex-end',paddingBottom:2}}>
                <label style={{fontSize:11,cursor:'pointer',whiteSpace:'nowrap',color:'#7c3aed',fontWeight:600}}>
                  <input type='checkbox' checked={formData.liberado_divulgacao} onChange={e=>setFormData({...formData,liberado_divulgacao:e.target.checked})} style={{marginRight:4,accentColor:'#7c3aed'}}/>
                  📸 Liberar para Divulgacao (MKT)
                </label>
              </div>
            </div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px'}} onClick={salvarOPL}>{editId?'Atualizar':'Liberar para Engenharia'}</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setShowForm(false);setEditId(null);}}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* AGUARDANDO LIBERACAO */}
      {/* MANUTENÇÕES AGENDADAS — aguardando liberação para Engenharia */}
      {oplsManutAgendada.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fff7ed',borderBottom:'2px solid #f97316'}}>
            <span style={{color:'#c2410c'}}>🔧 Manutenções Agendadas — Aguardando Liberação para Engenharia ({oplsManutAgendada.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table><thead><tr>
              <th>OPL</th><th>Chassi</th><th>Cliente</th><th>Modelo</th>
              <th>Data Agendamento</th><th>Período</th><th>Ação</th>
            </tr></thead><tbody>
              {oplsManutAgendada.map(o=>(
                <tr key={o.id}>
                  <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                  <td>{o.chassi||'—'}</td>
                  <td>{o.cliente_nome||'—'}</td>
                  <td>{o.modelo||'—'}</td>
                  <td>{o.data_agendamento_manutencao ? new Date(o.data_agendamento_manutencao+'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{o.periodo_agendamento||'—'}</td>
                  <td>
                    <button className="acn-btn" style={{background:'#f97316',fontSize:10}}
                      onClick={()=>liberarManutencaoEngenharia(o)}>
                      ▶ LIBERAR PARA ENGENHARIA
                    </button>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {oplsFaturar.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#ecfdf5',borderBottom:'2px solid #22c55e'}}><span style={{color:'#166534'}}>Aprovado CQ — Aguardando Liberacao Comercial ({oplsFaturar.length})</span></div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table><thead><tr><th>OPL</th><th>Chassi</th><th>Tipo</th><th>Prev. Entrega</th><th>Acao</th></tr></thead>
            <tbody>{oplsFaturar.map(o=>(
              <tr key={o.id}><td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td><td>{o.chassi||'—'}</td><td>{o.tipo_projeto}</td>
              <td>{fmtDt(o.data_prevista_entrega)}</td>
              <td><button className="acn-btn" style={{background:'#f59e0b'}} onClick={()=>liberarFaturamento(o)}>LIBERAR FATURAMENTO</button></td></tr>
            ))}</tbody></table>
          </div>
        </div>
      )}

      {/* AGUARDANDO ENTREGA */}
      {oplsEntrega.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#eff6ff',borderBottom:'2px solid #3b82f6'}}><span style={{color:'#1e40af'}}>Faturado — Disponivel para Entrega ({oplsEntrega.length})</span></div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table><thead><tr><th>OPL</th><th>Chassi</th><th>NF</th><th>Cliente</th><th>Checklist/Arquivos</th><th>Acao</th></tr></thead>
            <tbody>{oplsEntrega.map(o=>(
              <tr key={o.id}><td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td><td>{o.chassi||'—'}</td>
              <td><strong style={{color:'#22c55e'}}>#{o.numero_nf}</strong></td><td>{o.cliente_nome||'—'}</td>
              <td>
                <div style={{display:'flex',gap:4}}>
                  <OplAnexosWidget opl={o} setor="Comercial" currentUser={currentUser} tipoFixo="checklist_entrega" compact={true} />
                  <OplAnexosWidget opl={o} setor="Comercial" currentUser={currentUser} compact={true} />
                </div>
              </td>
              <td><button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>{setModalEntregue(o);setNomeRecebeu('');}}>ENTREGUE</button></td></tr>
            ))}</tbody></table>
          </div>
        </div>
      )}

      {/* CRM movido para aba CRM independente */}

      {/* ONENOTE */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}><span style={{color:'#92400e'}}>OneNote — Propostas Enviadas</span></div>
        <div className="sec-body"><div style={{display:'flex',gap:6}}>
          <input className="acn-input" style={{flex:1}} placeholder="https://onenote.com/..." value={oneNoteUrl} onChange={e=>setOneNoteUrl(e.target.value)} />
          <button className="acn-btn" style={{background:'#7c3aed'}} onClick={()=>oneNoteUrl&&window.open(oneNoteUrl,'_blank')}>Abrir OneNote</button>
        </div></div>
      </div>

      {/* HISTORICO */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Historico de Projetos & Expedicao Comercial</span></div>

        {/* FILTROS */}
        <div style={{padding:'10px 12px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
          {/* Linha 1: busca livre */}
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:8,fontWeight:700,color:'#475569',textTransform:'uppercase',marginBottom:2}}>🔍 Busca livre (pesquisa em todos os campos)</div>
              <div style={{display:'flex',gap:4}}>
                <input
                  value={buscaInput}
                  onChange={e => setBuscaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setFiltroBusca(buscaInput.trim())}
                  placeholder="Digite qualquer palavra — nº OP, chassi, cliente, modelo, status..."
                  style={{flex:1,fontSize:10,padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,background:'white',color:'#374151'}} />
                <button onClick={() => setFiltroBusca(buscaInput.trim())}
                  style={{fontSize:10,fontWeight:700,padding:'4px 12px',background:'#1e293b',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>
                  Buscar
                </button>
                {filtroBusca && (
                  <button onClick={() => { setFiltroBusca(''); setBuscaInput(''); }}
                    style={{fontSize:10,padding:'4px 8px',background:'#fee2e2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',fontWeight:700}}>
                    ✕ {filtroBusca}
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Linha 2: filtros por campo */}
          <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:8,fontWeight:700,color:'#475569',textTransform:'uppercase',marginBottom:2}}>Tipo de Projeto</div>
              <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
                style={{fontSize:10,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,background:'white',color:'#374151',minWidth:180}}>
                <option value="">Todos</option>
                {tiposProjeto.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:8,fontWeight:700,color:'#475569',textTransform:'uppercase',marginBottom:2}}>Operador</div>
              <select value={filtroResp} onChange={e=>setFiltroResp(e.target.value)}
                style={{fontSize:10,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,background:'white',color:'#374151',minWidth:150}}>
                <option value="">Todos</option>
                {responsaveis.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:8,fontWeight:700,color:'#475569',textTransform:'uppercase',marginBottom:2}}>Data entrada de</div>
              <input type="date" value={filtroHistDataIni} onChange={e=>setFiltroHistDataIni(e.target.value)}
                style={{fontSize:10,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,background:'white',color:'#374151'}} />
            </div>
            <div>
              <div style={{fontSize:8,fontWeight:700,color:'#475569',textTransform:'uppercase',marginBottom:2}}>até</div>
              <input type="date" value={filtroHistDataFim} onChange={e=>setFiltroHistDataFim(e.target.value)}
                style={{fontSize:10,padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,background:'white',color:'#374151'}} />
            </div>
            {temFiltroAtivo && (
              <button onClick={limparFiltros}
                style={{fontSize:10,padding:'4px 10px',background:'#f1f5f9',color:'#64748b',border:'1px solid #d1d5db',borderRadius:4,cursor:'pointer'}}>
                ✕ Limpar filtros
              </button>
            )}
            <span style={{marginLeft:'auto',fontSize:9,color:'#94a3b8',paddingBottom:2}}>
              {oplsFiltrados.length} de {opls.length} registro(s)
            </span>
          </div>
        </div>

        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : (
            <table>
              <thead><tr><th>Data</th><th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo</th><th>Operador</th><th>Prev. Entrega</th><th>Atraso</th><th>Status</th><th>Proposta</th><th>Acao</th></tr></thead>
              <tbody>
                {oplsFiltrados.length === 0 ? <tr><td colSpan={11} className="acn-empty">Nenhuma OP encontrada.</td></tr>
                : oplsFiltrados.map(o => {
                  const atraso = diasAtraso(o.data_prevista_entrega);
                  const podeFaturar = o.status_geral === 'Aprovado CQ - Aguardando Liberacao Comercial' || o.status_geral === 'Aguardando Liberacao Comercial';
                  const podeEntregue = o.status_geral === 'Faturado e Disponivel para Entrega';
                  return (
                    <tr key={o.id} style={{background: o.status_geral==='Devolvida Comercial' ? '#fff5f5' : ''}}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td><strong style={{color:'#2563eb',cursor:'pointer'}} onClick={()=>{setFormData({...FORM_VAZIO,...o,data_entrada:(o.data_entrada||'').slice(0,10),data_prevista_entrega:(o.data_prevista_entrega||'').slice(0,10)});setEditId(o.id);setShowForm(true);}}>{o.opl}</strong></td>
                      <td>{o.chassi||'—'}</td>
                      <td><span style={{fontWeight:700,color: (o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                      <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                      <td style={{fontSize:10,color:'#475569'}}>{o.responsavel_comercial || o.criado_por_nome || '—'}</td>
                      <td>{fmtDt(o.data_prevista_entrega)}</td>
                      <td>{atraso?<span className="acn-badge" style={{background:'#f59e0b'}}>{atraso}d</span>:<span style={{color:'#22c55e',fontSize:10}}>No prazo</span>}</td>
                      <td>
                        <span className="acn-badge" style={{background:statusCor(o.status_geral)}}>{o.status_geral}</span>
                        {o.liberado_divulgacao && <div style={{marginTop:2}}><span style={{fontSize:9,background:'#7c3aed',color:'white',padding:'1px 5px',borderRadius:10,fontWeight:700}}>📸 MKT</span></div>}
                      </td>
                      <td>
                        <OplAnexosWidget opl={o} setor="Comercial" currentUser={currentUser} tipoFixo="proposta" compact={true} />
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          <button className="acn-btn" style={{background:'#2563eb',fontSize:10}} onClick={()=>{
                            setFormData({...FORM_VAZIO,...o,data_entrada:(o.data_entrada||'').slice(0,10),data_prevista_entrega:(o.data_prevista_entrega||'').slice(0,10)});
                            setEditId(o.id); setShowForm(true); window.scrollTo({top:0,behavior:'smooth'});
                          }}>✏️ EDITAR</button>
                          {o.status_geral === 'Devolvida Comercial' && (
                            <button className="acn-btn" style={{background:'#7c3aed',fontSize:10}} onClick={()=>enviarParaEngenharia(o)}>
                              ↩ ENVIAR ENGENHARIA
                            </button>
                          )}
                          {podeFaturar && <button className="acn-btn" style={{background:'#f59e0b',fontSize:10}} onClick={()=>liberarFaturamento(o)}>LIBERAR FATURAMENTO</button>}
                          {podeEntregue && <button className="acn-btn" style={{background:'#22c55e',fontSize:10}} onClick={()=>{setModalEntregue(o);setNomeRecebeu('');}}>ENTREGUE</button>}
                          <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
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

      <OplMovimentadas setor="Comercial" />
      <DemandaFooter setor="Comercial" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} />}

      {/* MODAL ENTREGUE */}
      {modalEntregue && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Confirmar Entrega — OPL {modalEntregue.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>NF: <strong>#{modalEntregue.numero_nf}</strong></div>
            <label className="acn-label">Nome completo de quem recebeu o equipamento</label>
            <input className="acn-input" style={{width:'100%',marginBottom:14,fontSize:13,padding:'8px'}}
              autoFocus placeholder="Nome do receptor" value={nomeRecebeu} onChange={e=>setNomeRecebeu(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmarEntrega()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'8px'}} onClick={confirmarEntrega}>CONFIRMAR ENTREGA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEntregue(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
}