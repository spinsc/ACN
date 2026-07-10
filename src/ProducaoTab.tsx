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

  const load = async () => {
    const [agRes, aguRes] = await Promise.all([
      supabase.from('agendamentos_manutencao').select('*').order('data_agendamento', { ascending: true }),
      supabase.from('oples').select('id,opl,chassi,cliente_nome,modelo,data_prevista_entrega')
        .in('status_geral', ['Aguardando Agendamento Manutenção','Manutenção Agendada'])
        .order('data_entrada', { ascending: false }),
    ]);
    setAgendamentos(agRes.data || []);
    setAguardando(aguRes.data || []);
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

  const agDoMes = agendamentos.filter(ag => {
    if (!ag.data_agendamento) return false;
    const dt = new Date(ag.data_agendamento+'T00:00:00');
    return dt.getMonth()===mes && dt.getFullYear()===ano;
  });

  const agPorDia = (d) => agDoMes.filter(ag => new Date(ag.data_agendamento+'T00:00:00').getDate()===d);

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
                    {ags.map((ag,i)=>(
                      <div key={ag.id} title={`${ag.numero_opl} · ${ag.chassi} · ${ag.cliente_nome}`}
                        style={{background:ag.periodo==='Manhã'?'#dbeafe':'#fed7aa',borderRadius:3,padding:'1px 4px',fontSize:8,fontWeight:600,
                          color:ag.periodo==='Manhã'?'#1e40af':'#9a3412',marginBottom:1,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}
                        onClick={()=>cancelarAgendamento(ag)}>
                        {ag.periodo==='Manhã'?'🌅':'🌆'} {ag.numero_opl}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{display:'flex',gap:12,marginTop:8,fontSize:9,color:'#6b7280'}}>
              <span><span style={{background:'#dbeafe',padding:'1px 6px',borderRadius:3,color:'#1e40af'}}>🌅 Manhã</span></span>
              <span><span style={{background:'#fed7aa',padding:'1px 6px',borderRadius:3,color:'#9a3412'}}>🌆 Tarde</span></span>
              <span style={{marginLeft:'auto'}}>Clique no agendamento para cancelar</span>
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
        <button style={{flex:1,padding:'8px',background:abaProducao==='agenda'?'#f97316':'white',color:abaProducao==='agenda'?'white':'#f97316',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('agenda')}>📅 Agendamentos Manutenção</button>
      </div>

      {abaProducao === 'agenda' && <CalendarioManutencao currentUser={currentUser} />}
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
