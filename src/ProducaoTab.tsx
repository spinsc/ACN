// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


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

// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO DE MANUTENÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function CalendarioManutencao({ currentUser }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [agendamentos, setAgendamentos] = useState([]);
  const [aguardando, setAguardando] = useState([]);
  const [modalAgendar, setModalAgendar] = useState(null);
  const [formAg, setFormAg] = useState({ data:'', periodo:'Manhã', obs:'' });
  const [salvando, setSalvando] = useState(false);
  const [vistaLista, setVistaLista] = useState(false);
  const [sacOrdens, setSacOrdens]   = useState([]);

  const load = async () => {
    const [agRes, aguRes, sacRes] = await Promise.all([
      supabase.from('agendamentos_manutencao').select('*').order('data_agendamento', { ascending: true }),
      supabase.from('oples').select('id,opl,chassi,cliente_nome,modelo,data_prevista_entrega')
        .in('status_geral', ['Aguardando Agendamento Manutenção','Manutenção Agendada'])
        .order('data_entrada', { ascending: false }),
      supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome,veiculo_placa,veiculo_modelo,data_provisionamento,periodo_provisionamento,status')
        .eq('is_manutencao_veicular', true)
        .in('status', ['Provisionada','Em Execução','Manutenção Concluída'])
        .not('data_provisionamento', 'is', null),
    ]);
    setAgendamentos(agRes.data || []);
    setAguardando(aguRes.data || []);
    setSacOrdens(sacRes.data || []);
  };
  useEffect(() => { load(); }, []);

  const confirmarAgendamento = async () => {
    if (!formAg.data) { alert('Selecione uma data.'); return; }
    setSalvando(true);
    const opl = modalAgendar;
    const { error: errAg } = await supabase.from('agendamentos_manutencao').insert([{
      opl_id: opl.id, numero_opl: opl.opl, chassi: opl.chassi,
      cliente_nome: opl.cliente_nome, modelo: opl.modelo,
      data_agendamento: formAg.data, periodo: formAg.periodo,
      observacoes: formAg.obs, agendado_por: currentUser?.nome,
    }]);
    if (errAg) { alert('Erro ao agendar: ' + errAg.message); setSalvando(false); return; }
    await supabase.from('oples').update({
      status_geral: 'Manutenção Agendada',
      data_agendamento_manutencao: formAg.data,
      periodo_agendamento: formAg.periodo,
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Manutenção agendada para ${new Date(formAg.data+'T00:00:00').toLocaleDateString('pt-BR')} (${formAg.periodo})`,
      status_anterior: 'Aguardando Agendamento Manutenção', status_novo: 'Manutenção Agendada',
      usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    setModalAgendar(null); setFormAg({ data:'', periodo:'Manhã', obs:'' }); setSalvando(false);
    load();
  };

  const cancelarAgendamento = async (ag) => {
    if (!window.confirm(`Cancelar agendamento de ${ag.numero_opl}?`)) return;
    await supabase.from('agendamentos_manutencao').delete().eq('id', ag.id);
    await supabase.from('oples').update({ status_geral: 'Aguardando Agendamento Manutenção' }).eq('id', ag.opl_id);
    load();
  };

  // ── Calendário ──
  const primeiroDia = new Date(ano, mes, 1).getDay(); // 0=Dom
  const diasNoMes   = new Date(ano, mes+1, 0).getDate();
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DIAS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const allEntries = [
    ...agendamentos.map(ag => ({ ...ag, _tipo: 'opl', _data: ag.data_agendamento, _periodo: ag.periodo, _label: ag.numero_opl })),
    ...sacOrdens.map(os => ({ id: os.id, _tipo: 'sac', _data: os.data_provisionamento, _periodo: os.periodo_provisionamento||'Manhã', _label: os.numero_os, numero_opl: os.numero_os, chassi: os.veiculo_placa||'—', cliente_nome: os.cliente_nome, modelo: os.veiculo_modelo, status: os.status })),
  ];

  const agDoMes = allEntries.filter(ag => {
    if (!ag._data) return false;
    const dt = new Date(ag._data+'T00:00:00');
    return dt.getMonth()===mes && dt.getFullYear()===ano;
  });

  const agPorDia = (d) => agDoMes.filter(ag => new Date(ag._data+'T00:00:00').getDate()===d);

  const imprimirLista = () => {
    const rows = agendamentos.map(ag => `<tr>
      <td>${new Date(ag.data_agendamento+'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td>${ag.periodo}</td>
      <td><strong>${ag.numero_opl||'—'}</strong></td>
      <td>${ag.chassi||'—'}</td>
      <td>${ag.cliente_nome||'—'}</td>
      <td>${ag.modelo||'—'}</td>
      <td>${ag.observacoes||'—'}</td>
      <td>${ag.agendado_por||'—'}</td>
    </tr>`).join('');
    const html = `<html><head><title>Agendamentos Manutenção</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:24px}h2{color:#1a3a52;border-bottom:2px solid #1a3a52;padding-bottom:6px}
    table{width:100%;border-collapse:collapse}th{background:#1a3a52;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
    td{padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:10px}.footer{margin-top:20px;font-size:9px;color:#9ca3af}
    @media print{button{display:none}}</style></head>
    <body><h2>📅 Agendamentos de Manutenção</h2>
    <table><thead><tr><th>Data</th><th>Período</th><th>OPL</th><th>Chassi</th><th>Cliente</th><th>Modelo</th><th>Obs.</th><th>Agendado por</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
    <script>window.onload=()=>window.print();</script></body></html>`;
    const w = window.open('','_blank','width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const aguardandoNovos = aguardando.filter(o=>o.status_geral==='Aguardando Agendamento Manutenção'||!o.status_geral?.includes('Agendada'));

  return (
    <div>
      {/* PAINEL: OPLs aguardando agendamento */}
      {aguardandoNovos.length > 0 && (
        <div style={{background:'#fff7ed',border:'2px solid #f97316',borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:12,color:'#c2410c',marginBottom:10}}>
            🔔 {aguardandoNovos.length} OPL(s) de Manutenção aguardando agendamento
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {aguardandoNovos.map(o=>(
              <div key={o.id} style={{background:'white',borderRadius:6,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',border:'1px solid #fed7aa'}}>
                <div>
                  <strong style={{color:'#2563eb'}}>{o.opl}</strong>
                  <span style={{margin:'0 8px',color:'#9ca3af'}}>·</span>
                  {o.chassi||'—'}
                  <span style={{margin:'0 8px',color:'#9ca3af'}}>·</span>
                  {o.cliente_nome||'—'}
                  {o.modelo && <span style={{margin:'0 8px',color:'#6b7280',fontSize:10}}>({o.modelo})</span>}
                </div>
                <button className="acn-btn" style={{background:'#f97316'}}
                  onClick={()=>{ setModalAgendar(o); setFormAg({ data:'', periodo:'Manhã', obs:'' }); }}>
                  📅 AGENDAR
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CALENDÁRIO */}
      <div style={{background:'white',borderRadius:8,boxShadow:'0 1px 3px #0001',overflow:'hidden'}}>
        {/* Cabeçalho calendário */}
        <div style={{background:'#1a3a52',color:'white',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>{ if(mes===0){setMes(11);setAno(a=>a-1);}else setMes(m=>m-1); }}
              style={{background:'rgba(255,255,255,.2)',border:'none',color:'white',borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:14}}>‹</button>
            <strong style={{fontSize:14}}>{MESES[mes]} {ano}</strong>
            <button onClick={()=>{ if(mes===11){setMes(0);setAno(a=>a+1);}else setMes(m=>m+1); }}
              style={{background:'rgba(255,255,255,.2)',border:'none',color:'white',borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:14}}>›</button>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="acn-btn" style={{background:'rgba(255,255,255,.2)',fontSize:9}} onClick={()=>setVistaLista(!vistaLista)}>
              {vistaLista?'📅 Calendário':'📋 Lista'}
            </button>
            <button className="acn-btn" style={{background:'rgba(255,255,255,.2)',fontSize:9}} onClick={imprimirLista}>🖨️ Imprimir</button>
          </div>
        </div>

        {!vistaLista ? (
          /* VISTA CALENDÁRIO */
          <div style={{padding:8}}>
            {/* Dias da semana */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
              {DIAS.map(d=>(
                <div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:'#6b7280',padding:'4px 0'}}>{d}</div>
              ))}
            </div>
            {/* Grid de dias */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
              {/* células vazias antes do primeiro dia */}
              {Array.from({length:primeiroDia}).map((_,i)=>(
                <div key={'e'+i} style={{minHeight:70,background:'#f9fafb',borderRadius:4}}></div>
              ))}
              {/* dias do mês */}
              {Array.from({length:diasNoMes},(_,i)=>i+1).map(d=>{
                const ags = agPorDia(d);
                const isHoje = d===hoje.getDate()&&mes===hoje.getMonth()&&ano===hoje.getFullYear();
                return (
                  <div key={d} style={{minHeight:70,background:isHoje?'#eff6ff':'#fafafa',borderRadius:4,border:isHoje?'2px solid #3b82f6':'1px solid #e5e7eb',padding:3}}>
                    <div style={{fontSize:10,fontWeight:isHoje?700:400,color:isHoje?'#2563eb':'#374151',marginBottom:2}}>{d}</div>
                    {ags.map((ag,i)=>{
                      const isSac = ag._tipo==='sac';
                      const bgM = isSac?'#d1fae5':'#dbeafe'; const bgT = isSac?'#fef3c7':'#fed7aa';
                      const clM = isSac?'#065f46':'#1e40af'; const clT = isSac?'#92400e':'#9a3412';
                      return (
                        <div key={ag.id+(ag._tipo||'')} title={ag._label+' · '+ag.chassi+' · '+ag.cliente_nome+(isSac?' [SAC '+ag.status+']':'')}
                          style={{background:ag._periodo==='Manhã'?bgM:bgT,borderRadius:3,padding:'1px 4px',fontSize:8,fontWeight:600,
                            color:ag._periodo==='Manhã'?clM:clT,marginBottom:1,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:isSac?'default':'pointer'}}
                          onClick={()=>{ if(!isSac) cancelarAgendamento(ag); }}>
                          {isSac?'🔧':'📦'} {ag._label}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex',gap:12,marginTop:8,fontSize:9,color:'#6b7280',flexWrap:'wrap'}}>
              <span><span style={{background:'#dbeafe',padding:'1px 6px',borderRadius:3,color:'#1e40af'}}>📦 OPL Manhã</span></span>
              <span><span style={{background:'#fed7aa',padding:'1px 6px',borderRadius:3,color:'#9a3412'}}>📦 OPL Tarde</span></span>
              <span><span style={{background:'#d1fae5',padding:'1px 6px',borderRadius:3,color:'#065f46'}}>🔧 SAC Manhã</span></span>
              <span><span style={{background:'#fef3c7',padding:'1px 6px',borderRadius:3,color:'#92400e'}}>🔧 SAC Tarde</span></span>
              <span style={{marginLeft:'auto'}}>Clique no agendamento OPL para cancelar</span>
            </div>
          </div>
        ) : (
          /* VISTA LISTA */
          <div style={{padding:12,overflowX:'auto'}}>
            {agendamentos.length===0 ? <div style={{textAlign:'center',color:'#9ca3af',padding:24,fontSize:12}}>Nenhum agendamento.</div> : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr style={{background:'#f1f5f9'}}>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Data</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Período</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>OPL</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Chassi</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Cliente</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Obs.</th>
                  <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>Ações</th>
                </tr></thead>
                <tbody>{agendamentos.map(ag=>(
                  <tr key={ag.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'8px 10px'}}><strong>{new Date(ag.data_agendamento+'T00:00:00').toLocaleDateString('pt-BR')}</strong></td>
                    <td style={{padding:'8px 10px'}}>
                      <span style={{background:ag.periodo==='Manhã'?'#dbeafe':'#fed7aa',color:ag.periodo==='Manhã'?'#1e40af':'#9a3412',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700}}>
                        {ag.periodo==='Manhã'?'🌅':'🌆'} {ag.periodo}
                      </span>
                    </td>
                    <td style={{padding:'8px 10px'}}><strong style={{color:'#2563eb'}}>{ag.numero_opl}</strong></td>
                    <td style={{padding:'8px 10px'}}>{ag.chassi||'—'}</td>
                    <td style={{padding:'8px 10px'}}>{ag.cliente_nome||'—'}</td>
                    <td style={{padding:'8px 10px',fontSize:10,color:'#6b7280'}}>{ag.observacoes||'—'}</td>
                    <td style={{padding:'8px 10px'}}>
                      <button onClick={()=>cancelarAgendamento(ag)}
                        style={{background:'none',border:'1px solid #fca5a5',color:'#dc2626',borderRadius:4,padding:'2px 7px',fontSize:9,cursor:'pointer'}}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* MODAL AGENDAR */}
      {modalAgendar && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalAgendar(null);}}>
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">📅 Agendar Manutenção</div>
            <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:6,padding:'8px 12px',marginBottom:14,fontSize:11}}>
              <strong>{modalAgendar.opl}</strong> · {modalAgendar.chassi||'—'} · {modalAgendar.cliente_nome||'—'}
              {modalAgendar.modelo && <div style={{color:'#6b7280',fontSize:10,marginTop:2}}>{modalAgendar.modelo}</div>}
            </div>
            <div style={{marginBottom:12}}>
              <label className="acn-label">📅 Data de recebimento do carro *</label>
              <input type="date" className="acn-input" style={{width:'100%'}}
                value={formAg.data} onChange={e=>setFormAg(f=>({...f,data:e.target.value}))} />
            </div>
            <div style={{marginBottom:12}}>
              <label className="acn-label">⏰ Período</label>
              <div style={{display:'flex',gap:8}}>
                {['Manhã','Tarde'].map(p=>(
                  <button key={p} onClick={()=>setFormAg(f=>({...f,periodo:p}))}
                    style={{flex:1,padding:'8px',border:`2px solid ${formAg.periodo===p?'#3b82f6':'#e5e7eb'}`,
                      borderRadius:6,background:formAg.periodo===p?'#eff6ff':'white',
                      fontWeight:700,fontSize:12,cursor:'pointer',color:formAg.periodo===p?'#2563eb':'#6b7280'}}>
                    {p==='Manhã'?'🌅 Manhã':'🌆 Tarde'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label className="acn-label">📝 Observações</label>
              <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}}
                value={formAg.obs} onChange={e=>setFormAg(f=>({...f,obs:e.target.value}))}
                placeholder="Defeitos relatados, histórico, etc." />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAgendar(null)}>Cancelar</button>
              <button className="acn-btn" style={{background:'#f97316'}} onClick={confirmarAgendamento} disabled={salvando}>
                {salvando?'...':'✅ Confirmar Agendamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Componente reutilizável de tabela de itens/materiais ───────────────────
function ItemTable({ itens, setItens }) {
  const total = itens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
  const set = (idx, k, v) => setItens(p=>p.map((x,i)=>i===idx?{...x,[k]:v}:x));
  const add = () => setItens(p=>[...p,{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]);
  const rem = (idx) => setItens(p=>p.filter((_,i)=>i!==idx));
  return (
    <>
      <table style={{width:'100%',borderCollapse:'collapse',marginBottom:6}}>
        <thead><tr style={{background:'#f1f5f9'}}>
          <th style={{padding:'5px 7px',fontSize:10,textAlign:'left',borderBottom:'1px solid #e2e8f0',width:80}}>Código</th>
          <th style={{padding:'5px 7px',fontSize:10,textAlign:'left',borderBottom:'1px solid #e2e8f0'}}>Descrição</th>
          <th style={{padding:'5px 7px',fontSize:10,textAlign:'center',borderBottom:'1px solid #e2e8f0',width:55}}>Qtd</th>
          <th style={{padding:'5px 7px',fontSize:10,textAlign:'right',borderBottom:'1px solid #e2e8f0',width:95}}>Vl. Unit.</th>
          <th style={{padding:'5px 7px',fontSize:10,textAlign:'right',borderBottom:'1px solid #e2e8f0',width:95}}>Total</th>
          <th style={{width:28,borderBottom:'1px solid #e2e8f0'}}></th>
        </tr></thead>
        <tbody>
          {itens.map((item,idx)=>(
            <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
              <td style={{padding:'3px 5px'}}><input className="acn-input" style={{width:'100%',fontSize:10}} value={item.codigo} onChange={e=>set(idx,'codigo',e.target.value)} /></td>
              <td style={{padding:'3px 5px'}}><input className="acn-input" style={{width:'100%',fontSize:10}} value={item.descricao} onChange={e=>set(idx,'descricao',e.target.value)} placeholder="Peça / serviço..." /></td>
              <td style={{padding:'3px 5px'}}><input type="number" min={1} className="acn-input" style={{width:'100%',fontSize:10,textAlign:'center'}} value={item.quantidade} onChange={e=>set(idx,'quantidade',Number(e.target.value)||1)} /></td>
              <td style={{padding:'3px 5px'}}><input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%',fontSize:10,textAlign:'right'}} value={item.valor_unitario} onChange={e=>set(idx,'valor_unitario',Number(e.target.value)||0)} /></td>
              <td style={{padding:'3px 7px',fontSize:10,textAlign:'right',fontWeight:700,color:'#0f766e'}}>{((Number(item.quantidade)||1)*(Number(item.valor_unitario)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td><button style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}} onClick={()=>rem(idx)}>×</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr style={{background:'#f0fdf4'}}>
          <td colSpan={4} style={{padding:'6px',fontWeight:700,fontSize:11,textAlign:'right',color:'#166534'}}>TOTAL:</td>
          <td style={{padding:'6px',fontWeight:800,fontSize:12,textAlign:'right',color:'#166534'}}>R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <button className="acn-btn" style={{background:'#e2e8f0',color:'#1e293b',fontSize:10,marginBottom:10}} onClick={add}>+ Adicionar Item</button>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PAINEL SAC VEICULAR — ações exclusivas da Produção no fluxo de manutenção
// ─────────────────────────────────────────────────────────────────────────────
function PainelSacVeicular({ currentUser }) {
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalProvisionar, setModalProvisionar]             = useState(null);
  const [provisionarForm, setProvisionarForm]               = useState({ data_provisao:'', periodo:'Manhã' });
  const [modalConfirmarChegada, setModalConfirmarChegada]   = useState(null);
  const [modalVerificacao, setModalVerificacao]             = useState(null);
  const [verificacaoItens, setVerificacaoItens]             = useState([]);
  const [modalConcluirManu, setModalConcluirManu]           = useState(null);
  const [concluirManuForm, setConcluirManuForm]             = useState({ observacoes:'', itens_usados:[] });
  const [modalItensExecucao, setModalItensExecucao]         = useState(null);
  const [itensExecucao, setItensExecucao]                   = useState([]);

  const STATUSES_PROD = ['Em Provisionamento','Aguardando Aceite SAC','Provisionada','Verificação e Orçamento','Aguardando Aprovação Cliente','Em Manutenção','Em Execução'];

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('sac_ordens_servico').select('*')
      .eq('is_manutencao_veicular', true)
      .in('status', STATUSES_PROD)
      .order('data_abertura', { ascending: false });
    setOrdens(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';

  const STATUS_COR_VEI = {
    'Em Provisionamento':           '#7c3aed',
    'Aguardando Aceite SAC':        '#f59e0b',
    'Provisionada':                 '#16a34a',
    'Verificação e Orçamento':      '#8b5cf6',
    'Aguardando Aprovação Cliente': '#f59e0b',
    'Em Manutenção':                '#dc2626',
    'Em Execução':                  '#0891b2',
  };

  // Produção define data → status: Aguardando Aceite SAC
  const salvarProvisionamento = async () => {
    if (!provisionarForm.data_provisao) { alert('Informe a data!'); return; }
    const os = modalProvisionar;
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Aceite SAC',
      data_provisionamento: provisionarForm.data_provisao,
      periodo_provisionamento: provisionarForm.periodo,
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('sac_data_definida', `Producao definiu data — ${os.numero_os} — Cliente: ${os.cliente_nome} — Data: ${new Date(provisionarForm.data_provisao+'T12:00').toLocaleDateString('pt-BR')} (${provisionarForm.periodo})`);
    setModalProvisionar(null); setProvisionarForm({ data_provisao:'', periodo:'Manhã' }); load();
  };

  // Produção confirma chegada → Presencial: Verificação e Orçamento / Remota: Em Manutenção
  const confirmarChegada = async () => {
    const os = modalConfirmarChegada;
    const agora = new Date().toISOString();
    const novoStatus = os.tipo_avaliacao === 'Remota' ? 'Em Execução' : 'Verificação e Orçamento';
    await supabase.from('sac_ordens_servico').update({
      status: novoStatus,
      data_chegada_veiculo: agora,
      ...(os.tipo_avaliacao === 'Remota' ? { data_inicio_manutencao: agora } : {}),
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('sac_veiculo_chegou', `Veiculo chegou — ${os.numero_os} — ${os.cliente_nome} — Status: ${novoStatus}`);
    setModalConfirmarChegada(null); load();
  };

  // Produção insere materiais e envia ao SAC → Aguardando Aprovação Cliente
  const enviarVerificacao = async () => {
    const os = modalVerificacao;
    if (!verificacaoItens.length) { alert('Adicione pelo menos um item!'); return; }
    const total = verificacaoItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Aprovação Cliente',
      itens_cotacao: verificacaoItens,
      valor_orcamento: total,
      data_envio_orcamento: agora,
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('sac_verificacao_enviada', `Orcamento de verificacao — ${os.numero_os} — ${os.cliente_nome} — Total: ${fmtVal(total)}`);
    setModalVerificacao(null); setVerificacaoItens([]); load();
  };

  // Produção conclui manutenção → Manutenção Concluída
  const salvarConclusao = async () => {
    const os = modalConcluirManu;
    const agora = new Date().toISOString();
    const kpi = os.data_inicio_manutencao
      ? Number(((new Date().getTime()-new Date(os.data_inicio_manutencao).getTime())/3600000).toFixed(2))
      : null;
    await supabase.from('sac_ordens_servico').update({
      status: 'Manutenção Concluída',
      data_conclusao_manutencao: agora,
      materiais_utilizados: concluirManuForm.itens_usados,
      observacoes_manutencao: concluirManuForm.observacoes || null,
      kpi_execucao_horas: kpi,
      atualizado_em: agora,
    }).eq('id', os.id);
    setModalConcluirManu(null); setConcluirManuForm({ observacoes:'', itens_usados:[] }); load();
  };

  // Produção salva itens conferidos durante execução (sem concluir)
  const salvarItensExecucao = async () => {
    const os = modalItensExecucao;
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      materiais_utilizados: itensExecucao,
      atualizado_em: agora,
    }).eq('id', os.id);
    setModalItensExecucao(null); setItensExecucao([]); load();
  };

  const isAtrasada = (os) => {
    if (os.status !== 'Provisionada' || !os.data_provisionamento) return false;
    const limite = new Date(new Date(os.data_provisionamento+'T23:59:59').getTime() + 2*24*60*60*1000);
    return new Date() > limite;
  };



  return (
    <div>
      {ordens.filter(isAtrasada).length > 0 && (
        <div style={{background:'#fef2f2',border:'2px solid #ef4444',borderRadius:6,padding:'10px 14px',marginBottom:10,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={{fontWeight:700,fontSize:11,color:'#dc2626'}}>
              {ordens.filter(isAtrasada).length} OS(s) — veículo não chegou há mais de 2 dias após data agendada!
            </div>
            <div style={{fontSize:10,color:'#991b1b',marginTop:2}}>Use o botão "Remarcar" para reagendar.</div>
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef2f2',borderBottom:'2px solid #dc2626'}}>
          <span style={{color:'#991b1b'}}>🔧 SAC Veicular — Ações da Produção ({ordens.length})</span>
          <button className="acn-btn" style={{background:'#dc2626',fontSize:10}} onClick={load}>↻ Atualizar</button>
        </div>
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : ordens.length === 0 ? (
            <div className="acn-empty">Nenhuma OS veicular aguardando ação da Produção.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Nº OS</th><th>Cliente</th><th>Equip.</th><th>Tipo</th><th>Data Prov.</th><th>Status</th><th>Ação Produção</th>
              </tr></thead>
              <tbody>
                {ordens.map(os => {
                  const atrasada = isAtrasada(os);
                  return (
                    <tr key={os.id} style={{background:atrasada?'#fef2f2':undefined,borderLeft:atrasada?'4px solid #ef4444':undefined}}>
                      <td>
                        <strong style={{color:'#0f766e'}}>{os.numero_os}</strong>
                        {os.tipo_avaliacao && <div><span style={{fontSize:8,background:'#e2e8f0',padding:'1px 5px',borderRadius:10}}>{os.tipo_avaliacao}</span></div>}
                      </td>
                      <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{os.cliente_nome}</td>
                      <td style={{maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{os.equipamento_nome}</td>
                      <td><span style={{fontSize:9,background:'#e2e8f0',padding:'2px 6px',borderRadius:10}}>{os.tipo_avaliacao||'—'}</span></td>
                      <td style={{fontSize:10}}>
                        {os.data_provisionamento
                          ? <span style={{color:atrasada?'#dc2626':'inherit',fontWeight:atrasada?700:400}}>
                              {new Date(os.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}
                              {atrasada ? ' ⚠️' : ''}
                            </span>
                          : '—'}
                      </td>
                      <td><span className="acn-badge" style={{background:STATUS_COR_VEI[os.status]||'#94a3b8'}}>{os.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {os.status === 'Em Provisionamento' && (
                            <button className="acn-btn" style={{background:'#7c3aed',fontSize:9}}
                              onClick={()=>{ setProvisionarForm({data_provisao:'',periodo:'Manhã'}); setModalProvisionar(os); }}>
                              📅 Definir Data
                            </button>
                          )}
                          {os.status === 'Provisionada' && (
                            <>
                              <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={()=>setModalConfirmarChegada(os)}>
                                🚗 Chegou
                              </button>
                              {atrasada && (
                                <button className="acn-btn" style={{background:'#ef4444',fontSize:9}}
                                  onClick={()=>{ setProvisionarForm({data_provisao:os.data_provisionamento||'',periodo:os.periodo_provisionamento||'Manhã'}); setModalProvisionar(os); }}>
                                  📅 Remarcar
                                </button>
                              )}
                            </>
                          )}
                          {os.status === 'Verificação e Orçamento' && (
                            <button className="acn-btn" style={{background:'#8b5cf6',fontSize:9}}
                              onClick={()=>{ setVerificacaoItens(Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalVerificacao(os); }}>
                              🔧 Inserir Materiais
                            </button>
                          )}
                          {os.status === 'Em Manutenção' && (
                            <button className="acn-btn" style={{background:'#0d9488',fontSize:9}}
                              onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)?os.materiais_utilizados.map(i=>({...i})):[]}); }}>
                              ✅ Concluir
                            </button>
                          )}
                          {os.status === 'Em Execução' && (
                            <>
                              <button className="acn-btn" style={{background:'#0891b2',fontSize:9}}
                                onClick={()=>{ setItensExecucao(Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalItensExecucao(os); }}>
                                📋 Itens
                              </button>
                              <button className="acn-btn" style={{background:'#0d9488',fontSize:9}}
                                onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[]}); }}>
                                ✅ Concluir
                              </button>
                            </>
                          )}
                          {(os.status === 'Aguardando Aprovação Cliente' || os.status === 'Aguardando Aceite SAC') && (
                            <span style={{fontSize:9,color:'#94a3b8',fontStyle:'italic'}}>Aguardando SAC</span>
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

      {/* MODAL: Definir / Remarcar Data */}
      {modalProvisionar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">
              📅 {modalProvisionar.data_provisionamento ? 'Remarcar' : 'Definir'} Data — {modalProvisionar.numero_os}
            </div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>Cliente: {modalProvisionar.cliente_nome}</div>
            {modalProvisionar.data_provisionamento && (
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:4,padding:'8px 10px',marginBottom:10,fontSize:11}}>
                Data anterior: <strong>{new Date(modalProvisionar.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}</strong>
                {' '}({modalProvisionar.periodo_provisionamento||''})
              </div>
            )}
            <label className="acn-label">Nova Data de Recebimento *</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={provisionarForm.data_provisao}
              onChange={e=>setProvisionarForm(f=>({...f,data_provisao:e.target.value}))} />
            <label className="acn-label">Período</label>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {['Manhã','Tarde'].map(p=>(
                <button key={p} className="acn-btn"
                  style={{flex:1,background:provisionarForm.periodo===p?'#7c3aed':'#e2e8f0',color:provisionarForm.periodo===p?'white':'#1e293b'}}
                  onClick={()=>setProvisionarForm(f=>({...f,periodo:p}))}>
                  {p==='Manhã'?'🌅':'🌇'} {p}
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#7c3aed',flex:1}} onClick={salvarProvisionamento}>✓ Confirmar</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalProvisionar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Chegada */}
      {modalConfirmarChegada && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">🚗 Confirmar Chegada — {modalConfirmarChegada.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:8}}>Cliente: {modalConfirmarChegada.cliente_nome}</div>
            {modalConfirmarChegada.data_provisionamento && (
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:4,padding:'8px 10px',marginBottom:10,fontSize:11}}>
                📅 Data prevista: <strong>{new Date(modalConfirmarChegada.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}</strong>
                {' '}({modalConfirmarChegada.periodo_provisionamento||''})
              </div>
            )}
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:4,padding:'10px',marginBottom:14,fontSize:11}}>
              ✅ Próximo status: <strong>{modalConfirmarChegada.tipo_avaliacao === 'Remota' ? 'Em Execução' : 'Verificação e Orçamento'}</strong>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={confirmarChegada}>🚗 Confirmar Chegada</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalConfirmarChegada(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Verificação e Orçamento */}
      {modalVerificacao && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:680,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">🔧 Verificação e Orçamento — {modalVerificacao.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: {modalVerificacao.cliente_nome}</div>
            <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:8}}>Materiais / Itens do Orçamento</div>
            <ItemTable itens={verificacaoItens} setItens={setVerificacaoItens} />
            <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
              ⚠️ Ao enviar, a OS aguardará aprovação do SAC/Cliente antes de iniciar manutenção.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#8b5cf6',flex:1}} onClick={enviarVerificacao}>📤 Enviar para Aprovação</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalVerificacao(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Concluir Manutenção */}
      {modalConcluirManu && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:680,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">✅ Concluir Manutenção — {modalConcluirManu.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: {modalConcluirManu.cliente_nome}</div>
            <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:6}}>Materiais Utilizados</div>
            <ItemTable
              itens={concluirManuForm.itens_usados}
              setItens={(fn) => setConcluirManuForm(f=>({...f, itens_usados: typeof fn === 'function' ? fn(f.itens_usados) : fn}))}
            />
            <label className="acn-label">Observações</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:14}}
              value={concluirManuForm.observacoes}
              onChange={e=>setConcluirManuForm(f=>({...f,observacoes:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0d9488',flex:1}} onClick={salvarConclusao}>✓ CONCLUIR MANUTENÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalConcluirManu(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Conferência de Itens (Em Execução — Remota) */}
      {modalItensExecucao && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:680,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">📋 Conferência de Itens — {modalItensExecucao.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:6}}>Cliente: {modalItensExecucao.cliente_nome}</div>
            <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
              ℹ️ Revise os itens do orçamento: remova os não executados (×) e adicione extras. O SAC visualizará as alterações.
            </div>
            <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:6}}>Itens Executados</div>
            <ItemTable itens={itensExecucao} setItens={setItensExecucao} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0891b2',flex:1}} onClick={salvarItensExecucao}>💾 Salvar Itens</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalItensExecucao(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER DE SERVIÇOS
// SQL necessário (rodar uma vez no Supabase):
// CREATE TABLE IF NOT EXISTS vouchers_servico (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tipo_servico text, numero_pvop text, data_servico date,
//   prestador text, autorizado_por text, criado_por text,
//   itens_voucher jsonb, valor_total numeric,
//   criado_em timestamptz DEFAULT now()
// );
// ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS itens_voucher jsonb;
// ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS valor_total numeric;
//
// CREATE TABLE IF NOT EXISTS tipos_servico_voucher (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   nome text NOT NULL UNIQUE,
//   criado_em timestamptz DEFAULT now()
// );
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_VOUCHER_VAZIO = { placa_chassi: '', modelo: '', valor: '' };
const VOUCHER_VAZIO = { tipo_servico:'', numero_pvop:'', data_servico:'', prestador:'', autorizado_por:'', itens:[{ ...ITEM_VOUCHER_VAZIO }] };

function VoucherItemTable({ itens, setItens }) {
  const total = itens.reduce((s,i) => s + (Number(i.valor) || 0), 0);
  const setField = (idx, k, v) => setItens(p => p.map((x,i) => i===idx ? {...x,[k]:v} : x));
  const add = () => setItens(p => [...p, { ...ITEM_VOUCHER_VAZIO }]);
  const rem = (idx) => setItens(p => p.filter((_,i) => i!==idx));
  return (
    <>
      <table style={{width:'100%',borderCollapse:'collapse',marginBottom:6}}>
        <thead><tr style={{background:'#f1f5f9'}}>
          <th style={{padding:'5px 8px',fontSize:10,textAlign:'left',borderBottom:'1px solid #e2e8f0'}}>Placa / Chassi</th>
          <th style={{padding:'5px 8px',fontSize:10,textAlign:'left',borderBottom:'1px solid #e2e8f0'}}>Modelo</th>
          <th style={{padding:'5px 8px',fontSize:10,textAlign:'right',borderBottom:'1px solid #e2e8f0',width:140}}>Valor do Serviço (R$)</th>
          <th style={{width:28,borderBottom:'1px solid #e2e8f0'}}></th>
        </tr></thead>
        <tbody>
          {itens.map((item,idx) => (
            <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
              <td style={{padding:'3px 5px'}}>
                <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.placa_chassi}
                  onChange={e=>setField(idx,'placa_chassi',e.target.value)} placeholder="Ex: ABC-1234" />
              </td>
              <td style={{padding:'3px 5px'}}>
                <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.modelo}
                  onChange={e=>setField(idx,'modelo',e.target.value)} placeholder="Ex: Fiat Strada 2023" />
              </td>
              <td style={{padding:'3px 5px'}}>
                <input type="number" min={0} step="0.01" className="acn-input"
                  style={{width:'100%',fontSize:10,textAlign:'right'}} value={item.valor}
                  onChange={e=>setField(idx,'valor',e.target.value)} placeholder="0,00" />
              </td>
              <td>
                <button style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}}
                  onClick={()=>rem(idx)} title="Remover linha">×</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{background:'#f0fdf4'}}>
            <td colSpan={2} style={{padding:'7px 8px',fontWeight:700,fontSize:11,textAlign:'right',color:'#166534'}}>VALOR TOTAL:</td>
            <td style={{padding:'7px 8px',fontWeight:800,fontSize:13,textAlign:'right',color:'#166534'}}>
              R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <button className="acn-btn" style={{background:'#e2e8f0',color:'#1e293b',fontSize:10,marginBottom:10}} onClick={add}>
        + Adicionar Veículo
      </button>
    </>
  );
}

function VoucherServicos({ currentUser }) {
  const [vouchers, setVouchers]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [form, setForm]                 = useState({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] });
  const [salvando, setSalvando]         = useState(false);
  const [tiposServico, setTiposServico] = useState([]);
  const [novoTipo, setNovoTipo]         = useState('');
  const [addingTipo, setAddingTipo]     = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const base = import.meta.env.BASE_URL;

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItens = (fn) => setForm(f => ({ ...f, itens: typeof fn === 'function' ? fn(f.itens) : fn }));

  const loadTipos = async () => {
    try {
      const { data, error } = await supabase.from('tipos_servico_voucher').select('*').order('nome');
      if (!error) setTiposServico(data || []);
      // se tabela não existe ainda, ignora silenciosamente
    } catch { /* tabela ainda não criada */ }
  };

  const salvarTipo = async () => {
    if (!novoTipo.trim()) return;
    setSalvandoTipo(true);
    const { error } = await supabase.from('tipos_servico_voucher').insert([{ nome: novoTipo.trim() }]);
    if (error) { alert(error.code === '23505' ? 'Tipo já existe!' : error.message); setSalvandoTipo(false); return; }
    setForm(f => ({ ...f, tipo_servico: novoTipo.trim() }));
    setNovoTipo(''); setAddingTipo(false); setSalvandoTipo(false);
    loadTipos();
  };

  const excluirTipo = async (id) => {
    if (!window.confirm('Remover este tipo de serviço?')) return;
    await supabase.from('tipos_servico_voucher').delete().eq('id', id);
    loadTipos();
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('vouchers_servico').select('*').order('criado_em', { ascending: false }).limit(100);
    setVouchers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); loadTipos(); }, []);

  const salvar = async () => {
    if (!form.tipo_servico || !form.numero_pvop) { alert('Informe ao menos o Tipo de Serviço e Nº PV/OP!'); return; }
    const itens = form.itens.filter(i => i.placa_chassi || i.modelo || Number(i.valor));
    const valor_total = itens.reduce((s,i) => s + (Number(i.valor)||0), 0);
    setSalvando(true);
    const { error } = await supabase.from('vouchers_servico').insert([{
      tipo_servico: form.tipo_servico,
      numero_pvop: form.numero_pvop,
      data_servico: form.data_servico || null,
      prestador: form.prestador || null,
      autorizado_por: form.autorizado_por || null,
      itens_voucher: itens,
      valor_total,
      criado_por: currentUser?.nome || 'Sistema',
    }]);
    if (error) { alert('Erro ao salvar: ' + error.message); setSalvando(false); return; }
    setForm({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] });
    setSalvando(false);
    load();
  };

  const excluir = async (id) => {
    if (!window.confirm('Excluir este voucher?')) return;
    await supabase.from('vouchers_servico').delete().eq('id', id);
    load();
  };

  const imprimirVoucher = (v) => {
    const w = window.open('', '_blank', 'width=800,height=950,scrollbars=yes');
    if (!w) return;
    const fmtVal = (val) => val != null && val !== '' ? `R$ ${Number(val).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
    const fmtDt  = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR') : '—';
    // Suporte a registros antigos (chassi_placa/modelo_carro) e novos (itens_voucher)
    const itens = Array.isArray(v.itens_voucher) && v.itens_voucher.length > 0
      ? v.itens_voucher
      : (v.chassi_placa || v.modelo_carro ? [{ placa_chassi: v.chassi_placa, modelo: v.modelo_carro, valor: v.valor_voucher }] : []);
    const total = v.valor_total != null ? v.valor_total
      : itens.reduce((s,i) => s + (Number(i.valor)||0), 0);
    const itensRows = itens.map((item, idx) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:center;width:36px;color:#64748b">${idx+1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:600">${item.placa_chassi||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px">${item.modelo||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:right;font-weight:700;color:#0f766e">${fmtVal(item.valor)}</td>
    </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Voucher ${v.numero_pvop}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1e293b; padding: 28px; font-size: 12px; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px; }
      .logo { height: 56px; object-fit: contain; }
      .title { text-align: center; flex: 1; padding: 0 16px; }
      .badge { background: #0f766e; color: white; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; }
      .section { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
      .sec-title { background: #f8fafc; padding: 7px 12px; font-weight: 700; font-size: 11px; color: #0f766e; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: .4px; }
      .info-table { width: 100%; border-collapse: collapse; }
      .info-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
      .info-table td:first-child { width: 150px; font-weight: 600; color: #64748b; }
      .itens-table { width: 100%; border-collapse: collapse; }
      .itens-table thead th { background: #1e293b; color: #cbd5e1; padding: 7px 10px; font-size: 10px; text-align: left; }
      .itens-table thead th:last-child { text-align: right; }
      .total-row td { background: #f0fdf4; padding: 8px 10px; font-weight: 800; font-size: 13px; color: #166534; }
      .footer { border-top: 2px solid #0f766e; padding-top: 10px; margin-top: 16px; display: flex; align-items: center; justify-content: space-between; }
      .footer-text { font-size: 9.5px; color: #64748b; line-height: 1.7; }
      .footer-logo { height: 50px; object-fit: contain; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div class="header">
      <img src="${window.location.origin}${base}logo.png" class="logo" alt="ACN" onerror="this.style.display='none'" />
      <div class="title">
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;text-transform:uppercase">Voucher de Serviço</div>
        <div style="font-size:20px;font-weight:800;color:#1e293b">${v.numero_pvop}</div>
      </div>
      <span class="badge">VOUCHER</span>
    </div>

    <div class="section">
      <div class="sec-title">Dados do Serviço</div>
      <table class="info-table"><tbody>
        <tr><td>Tipo de Serviço</td><td>${v.tipo_servico || '—'}</td></tr>
        <tr><td>Nº PV / OP</td><td>${v.numero_pvop || '—'}</td></tr>
        <tr><td>Data do Serviço</td><td>${fmtDt(v.data_servico)}</td></tr>
        <tr><td>Prestador</td><td>${v.prestador || '—'}</td></tr>
        <tr><td>Autorizado por</td><td>${v.autorizado_por || '—'}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="sec-title">Veículos / Itens do Serviço</div>
      <table class="itens-table">
        <thead><tr>
          <th style="width:36px;text-align:center">#</th>
          <th>Placa / Chassi</th>
          <th>Modelo</th>
          <th style="text-align:right">Valor do Serviço</th>
        </tr></thead>
        <tbody>${itensRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:11px">Nenhum item</td></tr>'}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3" style="text-align:right">VALOR TOTAL:</td>
            <td style="text-align:right">${fmtVal(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;text-align:center;margin-bottom:14px;font-size:10px;color:#64748b">
      Este voucher é válido para o(s) serviço(s) especificado(s) acima e deve ser apresentado ao prestador no ato da realização.
    </div>

    <div class="footer">
      <div class="footer-text">
        <strong style="color:#0f766e">ACN Sinal Verde</strong><br/>
        📍 Rua Osvaldo Souza, 104 — Aririu, Palhoça - SC — CEP 88135-028<br/>
        📞 (48) 3240-0336 &nbsp;|&nbsp; ✉️ acn@acn.com.br<br/>
        📸 @ledflex_br &nbsp;|&nbsp; instagram.com/ledflex_br<br/>
        <span style="color:#94a3b8">Emitido em ${new Date().toLocaleString('pt-BR')} por ${v.criado_por || '—'}</span>
      </div>
      <img src="${window.location.origin}${base}motorola.png" class="footer-logo" alt="Motorola" onerror="this.style.display='none'" />
    </div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div>
      {/* FORMULÁRIO */}
      <div className="sec-card" style={{marginBottom:12}}>
        <div className="sec-hdr" style={{background:'#7c3aed'}}>
          <span style={{color:'white'}}>🎟️ Novo Voucher de Serviço</span>
        </div>
        <div className="sec-body">
          {/* Campos gerais */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10,marginBottom:14}}>
            <div>
              <label className="acn-label">Tipo de Serviço *</label>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <select className="acn-input" style={{flex:1}} value={form.tipo_servico}
                  onChange={e=>setField('tipo_servico',e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tiposServico.map(t => (
                    <option key={t.id} value={t.nome}>{t.nome}</option>
                  ))}
                </select>
                <button title="Gerenciar tipos de serviço"
                  style={{background:'#7c3aed',border:'none',color:'white',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontSize:13,flexShrink:0,fontWeight:700}}
                  onClick={()=>setAddingTipo(a=>!a)}>+</button>
              </div>
              {/* Mini-painel para cadastrar novo tipo */}
              {addingTipo && (
                <div style={{marginTop:6,background:'#f5f3ff',border:'1px solid #c4b5fd',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontWeight:700,fontSize:9,color:'#6d28d9',marginBottom:6,textTransform:'uppercase'}}>
                    Cadastro de Tipos de Serviço
                  </div>
                  {/* Lista dos existentes */}
                  {tiposServico.length > 0 && (
                    <div style={{marginBottom:8,display:'flex',flexWrap:'wrap',gap:4}}>
                      {tiposServico.map(t => (
                        <span key={t.id} style={{background:'white',border:'1px solid #c4b5fd',borderRadius:4,padding:'2px 7px',fontSize:10,display:'inline-flex',alignItems:'center',gap:4}}>
                          {t.nome}
                          <button onClick={()=>excluirTipo(t.id)}
                            style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12,padding:0,lineHeight:1}}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{display:'flex',gap:4}}>
                    <input className="acn-input" style={{flex:1,fontSize:10}} value={novoTipo}
                      onChange={e=>setNovoTipo(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&salvarTipo()}
                      placeholder="Nome do novo tipo..." autoFocus />
                    <button className="acn-btn" style={{background:'#7c3aed',flexShrink:0}} onClick={salvarTipo} disabled={salvandoTipo||!novoTipo.trim()}>
                      {salvandoTipo?'...':'Salvar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="acn-label">Nº PV / OP *</label>
              <input className="acn-input" style={{width:'100%'}} value={form.numero_pvop}
                onChange={e=>setField('numero_pvop',e.target.value)} placeholder="Ex: PV-2024-001" />
            </div>
            <div>
              <label className="acn-label">Data do Serviço</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={form.data_servico}
                onChange={e=>setField('data_servico',e.target.value)} />
            </div>
            <div>
              <label className="acn-label">Prestador do Serviço</label>
              <input className="acn-input" style={{width:'100%'}} value={form.prestador}
                onChange={e=>setField('prestador',e.target.value)} placeholder="Nome do prestador..." />
            </div>
            <div>
              <label className="acn-label">Autorizado por</label>
              <input className="acn-input" style={{width:'100%'}} value={form.autorizado_por}
                onChange={e=>setField('autorizado_por',e.target.value)} placeholder="Nome do autorizador..." />
            </div>
          </div>

          {/* Tabela de itens */}
          <div style={{fontWeight:700,fontSize:9,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:6}}>
            Veículos / Itens do Serviço
          </div>
          <VoucherItemTable itens={form.itens} setItens={setItens} />

          <div style={{marginTop:4,display:'flex',gap:8}}>
            <button className="acn-btn" style={{background:'#7c3aed'}} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : '💾 Salvar Voucher'}
            </button>
            <button className="acn-btn" style={{background:'#64748b'}}
              onClick={()=>setForm({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] })}>
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* LISTA DE VOUCHERS */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#7c3aed'}}>
          <span style={{color:'white'}}>🗂 Vouchers Emitidos ({vouchers.length})</span>
          <button className="acn-btn" style={{background:'rgba(255,255,255,.2)',fontSize:10}} onClick={load}>↻</button>
        </div>
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : vouchers.length === 0 ? (
            <div className="acn-empty">Nenhum voucher emitido ainda.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Nº PV/OP</th><th>Tipo</th><th>Veículos</th>
                <th>Valor Total</th><th>Data</th><th>Prestador</th><th>Autorizado por</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {vouchers.map(v => {
                  const itens = Array.isArray(v.itens_voucher) ? v.itens_voucher : [];
                  const total = v.valor_total != null ? v.valor_total
                    : (v.valor_voucher != null ? v.valor_voucher
                    : itens.reduce((s,i) => s+(Number(i.valor)||0), 0));
                  return (
                    <tr key={v.id}>
                      <td><strong style={{color:'#7c3aed'}}>{v.numero_pvop}</strong></td>
                      <td>{v.tipo_servico}</td>
                      <td style={{fontSize:9,color:'#64748b'}}>
                        {itens.length > 0
                          ? itens.map(i => i.placa_chassi || i.modelo || '—').filter(Boolean).join(', ')
                          : (v.chassi_placa || v.modelo_carro || '—')}
                      </td>
                      <td style={{fontWeight:700,color:'#0f766e'}}>
                        {total != null ? `R$ ${Number(total).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                      </td>
                      <td>{v.data_servico ? new Date(v.data_servico+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>{v.prestador || '—'}</td>
                      <td>{v.autorizado_por || '—'}</td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          <button className="acn-btn" style={{background:'#0f766e',fontSize:9}} onClick={()=>imprimirVoucher(v)}>🖨 Imprimir</button>
                          <button className="acn-btn" style={{background:'#ef4444',fontSize:9}} onClick={()=>excluir(v.id)}>🗑</button>
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
    </div>
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
    notificarEvento('producao_finaliza', msg.producaoFinalizada(opl.opl, currentUser?.nome));
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

  const [abaProducao, setAbaProducao] = useState('producao');
  const emRetrabalho = opls.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho');

  return (
    <div>
      {/* TABS */}
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:'2px solid #1e293b'}}>
        <button style={{flex:1,padding:'8px',background:abaProducao==='producao'?'#1e293b':'white',color:abaProducao==='producao'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('producao')}>⚙️ Produção</button>
        <button style={{flex:1,padding:'8px',background:abaProducao==='veicular'?'#dc2626':'white',color:abaProducao==='veicular'?'white':'#dc2626',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('veicular')}>🔧 SAC Veicular</button>
        <button style={{flex:1,padding:'8px',background:abaProducao==='agenda'?'#f97316':'white',color:abaProducao==='agenda'?'white':'#f97316',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('agenda')}>📅 Agendamentos</button>
        <button style={{flex:1,padding:'8px',background:abaProducao==='voucher'?'#7c3aed':'white',color:abaProducao==='voucher'?'white':'#7c3aed',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('voucher')}>🎟️ Voucher</button>
      </div>

      {abaProducao === 'veicular' && <PainelSacVeicular currentUser={currentUser} />}
      {abaProducao === 'agenda' && <CalendarioManutencao currentUser={currentUser} />}
      {abaProducao === 'voucher' && <VoucherServicos currentUser={currentUser} />}
      {abaProducao === 'producao' && <div>
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
    </div>}
    </div>
  );
}
