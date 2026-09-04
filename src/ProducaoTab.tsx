// @ts-nocheck
import { supabase } from './supabaseClient';
import { ColaboradorSelect, useColaboradores } from './ColaboradorSelect';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl } from './AcnTabShared';
import OplAnexosWidget from './OplAnexosWidget';
import AnaliseWidget from './AnaliseWidget';
import OplAcompModal from './OplAcompModal';
import { notificarEvento, msg } from './whatsappHelper';
import Linkify from './Linkify';
import { horasUteis } from './utils/horasUteis';
import { useTempoUtil, BotaoPausar, BadgeForaExpediente, pausarOpl, retomarOpl } from './PausaWidget';
import { logChange, useUnreadMap } from './AuditSystem';


const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
const semDado = (v) => !v || !String(v).trim();

// Statuses ativos do fluxo de OS de manutenção veicular (pós-reformulação
// 169d90d, 2026-08-21) — usado tanto pelo Calendário quanto pelo Painel SAC
// Veicular para não divergir quando o fluxo mudar de novo.
const STATUSES_VEICULAR_ATIVAS = ['Em Provisionamento','Aguardando Aceite SAC','Provisionada','Aguardando Início','Verificação e Orçamento','Aguardando Aprovação Cliente','Em Manutenção','Em Execução'];

function OplRow({ o, onAction, currentUser, selecionado, onToggleSelecionar, naoLido }) {
  const emProd       = o.status_geral === 'Em Producao';
  const aguardando   = o.status_geral === 'Aguardando Inicio Producao';
  const retrabalho   = o.status_geral === 'Retrabalho';
  const emRetrab     = o.status_geral === 'Em Retrabalho';

  // Cronômetro em horas úteis (Seg-Sex 8h-17:45) -- já desconta pausa manual
  // (o.pausado/data_pausa/tempo_pausado_horas) e some fora do expediente sem
  // precisar de nenhum código especial (horasUteis não soma essas horas).
  const timerProd   = useTempoUtil(emProd   ? o.data_inicio_producao   : null, o.pausado, o.data_pausa, o.tempo_pausado_horas).texto;
  const timerRetrab = useTempoUtil(emRetrab ? o.data_inicio_retrabalho : null, o.pausado, o.data_pausa, o.tempo_pausado_horas).texto;

  const rowStyle = retrabalho || emRetrab
    ? { background: '#fef2f2', borderLeft: '4px solid #ef4444' }
    : o.liberado_divulgacao
    ? { background: '#faf5ff', borderLeft: '3px solid #7c3aed' }
    : naoLido
    ? { background: '#fffdf0', borderLeft: '4px solid #eab308' }
    : {};

  return (
    <>
      <tr style={rowStyle}>
        {onToggleSelecionar && (
          <td style={{textAlign:'center'}}>
            <input type="checkbox" checked={!!selecionado} onChange={()=>onToggleSelecionar(o.id)} style={{cursor:'pointer'}} />
          </td>
        )}
        <td>
          <LinkOpl opl={o} currentUser={currentUser} color={retrabalho || emRetrab ? '#dc2626' : '#2563eb'} />
          {o.liberado_divulgacao && !retrabalho && !emRetrab && (
            <div><span style={{fontSize:9,background:'#7c3aed',color:'white',padding:'1px 5px',borderRadius:10,fontWeight:700}}>📸 MKT</span></div>
          )}
          {(retrabalho || emRetrab) && (
            <div><span style={{fontSize:9,background:'#ef4444',color:'white',padding:'1px 5px',borderRadius:10,fontWeight:700}}>🔁 RETRABALHO</span></div>
          )}
        </td>
        <td style={{fontSize:10}}>
          <div>{semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}</div>
          <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
          <div style={{color:'#94a3b8'}}>{semDado(o.placa) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem placa</span> : `🚘 ${o.placa}`}</div>
        </td>
        <td>{o.cliente_nome || '—'}</td>
        <td>{o.data_prevista_entrega ? new Date(o.data_prevista_entrega+'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
        <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
        <td style={{ maxWidth:110, wordBreak:'break-word' }}>{o.tipo_projeto}</td>
        <td>
          {o.modo_execucao === 'equipe'
            ? <span>🏷️ <strong>{o.equipe_nome || '—'}</strong></span>
            : o.modo_execucao === 'dupla'
            ? <span>{o.responsavel_producao || '—'}{o.tecnico_producao_2_nome ? <><br/><span style={{fontSize:9,color:'#6366f1'}}>+ {o.tecnico_producao_2_nome}</span></> : ''}</span>
            : o.responsavel_producao || '—'
          }
        </td>
        <td>
          {emProd && (
            <div>
              <span style={{fontFamily:'monospace',color: o.pausado?'#f59e0b':'#2563eb',fontWeight:700,fontSize:12}}>
                {o.pausado && '⏸ '}{timerProd}
              </span>
              <div><BadgeForaExpediente /></div>
            </div>
          )}
          {emRetrab && (
            <div>
              <span style={{fontFamily:'monospace',color: o.pausado?'#f59e0b':'#dc2626',fontWeight:700,fontSize:12}}>
                {o.pausado && '⏸ '}{timerRetrab}
              </span>
              <div><BadgeForaExpediente /></div>
            </div>
          )}
          {(aguardando || retrabalho) && '—'}
        </td>
        <td>
          <span className="acn-badge" style={{
            background: emProd?'#3b82f6': aguardando?'#f59e0b': (retrabalho||emRetrab)?'#ef4444':'#94a3b8'
          }}>{o.status_geral}</span>
        </td>
        <td>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            <button className="acn-btn" style={{background:'#0891b2',fontSize:10}} onClick={()=>onAction('ver',o)}>👁 VER</button>
            <OplAnexosWidget opl={o} setor="Producao" currentUser={currentUser} compact={true} />
            <button className="acn-btn" style={{background:'#6366f1',fontSize:9}} onClick={()=>onAction('acomp',o)}>💬 ACOMP.</button>
            {aguardando && (
              <button className="acn-btn" style={{background:'#2563eb'}} onClick={()=>onAction('iniciar',o)}>INICIAR</button>
            )}
            {emProd && (
              <>
                <BotaoPausar pausado={o.pausado} onPausar={()=>onAction('pausar',o)} onRetomar={()=>onAction('retomar',o)} />
                <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>onAction('checklist',o)}>LIB. CQ</button>
                <button className="acn-btn" style={{background:'#6366f1',fontSize:9}} onClick={()=>onAction('editar_resp',o)}>✏️ RESP.</button>
                <button className="acn-btn" style={{background:'#0f766e',fontSize:9}} onClick={()=>onAction('gerenciar_equipe',o)}>👥 EQUIPE</button>
                <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={()=>onAction('devolver',o)}>DEV. PCP</button>
              </>
            )}
            {emRetrab && (
              <>
                <BotaoPausar pausado={o.pausado} onPausar={()=>onAction('pausar',o)} onRetomar={()=>onAction('retomar',o)} />
                <button className="acn-btn" style={{background:'#6366f1',fontSize:9}} onClick={()=>onAction('editar_resp',o)}>✏️ RESP.</button>
                <button className="acn-btn" style={{background:'#0f766e',fontSize:9}} onClick={()=>onAction('gerenciar_equipe',o)}>👥 EQUIPE</button>
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
          <td colSpan={onToggleSelecionar ? 11 : 10} style={{padding:'4px 10px'}}>
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
      supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome,veiculo_modelo,numero_serie,data_provisionamento,periodo_provisionamento,status')
        .eq('is_manutencao_veicular', true)
        .in('status', STATUSES_VEICULAR_ATIVAS)
        .not('data_provisionamento', 'is', null),
    ]);
    setAgendamentos(agRes.data || []);
    setAguardando(aguRes.data || []);
    if (sacRes.error) console.error('Erro ao carregar OS veicular no calendário:', sacRes.error);
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
    ...sacOrdens.map(os => ({ id: os.id, _tipo: 'sac', _data: os.data_provisionamento, _periodo: os.periodo_provisionamento||'Manhã', _label: os.numero_os, numero_opl: os.numero_os, chassi: os.numero_serie||'—', cliente_nome: os.cliente_nome, modelo: os.veiculo_modelo, status: os.status })),
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
                  <LinkOpl opl={o} currentUser={currentUser} />
                  <span style={{margin:'0 8px',color:'#9ca3af'}}>·</span>
                  {o.cliente_nome||'—'}
                  <span style={{margin:'0 8px',color:'#9ca3af'}}>·</span>
                  {semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}
                  <span style={{margin:'0 8px',color:'#9ca3af'}}>·</span>
                  {semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}
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
  const { list: colaboradoresList } = useColaboradores();

  const [modalProvisionar, setModalProvisionar]             = useState(null);
  const [provisionarForm, setProvisionarForm]               = useState({ data_provisao:'', periodo:'Manhã' });
  const [modalConfirmarChegada, setModalConfirmarChegada]   = useState(null);
  const [modalVerificacao, setModalVerificacao]             = useState(null);
  const [verificacaoItens, setVerificacaoItens]             = useState([]);
  const [modalConcluirManu, setModalConcluirManu]           = useState(null);
  const [concluirManuForm, setConcluirManuForm]             = useState({ observacoes:'', itens_usados:[] });
  const [modalIniciarManu, setModalIniciarManu]             = useState(null);
  const [iniciarManuTecnico, setIniciarManuTecnico]         = useState('');
  const [iniciarManuTecnicoId, setIniciarManuTecnicoId]     = useState<string|null>(null);
  // Modo de execução (individual/dupla/equipe) — mesmo padrão da Produção de OPL
  const [iniciarManuModo, setIniciarManuModo]                 = useState<'individual'|'dupla'|'equipe'>('individual');
  const [iniciarManuTecnico2, setIniciarManuTecnico2]         = useState('');
  const [iniciarManuTecnico2Id, setIniciarManuTecnico2Id]     = useState<string|null>(null);
  const [equipesManu, setEquipesManu]                         = useState<any[]>([]);
  const [iniciarManuEquipeSel, setIniciarManuEquipeSel]       = useState<any>(null);
  const [modalObsProd, setModalObsProd]                     = useState(null);
  const [obsText, setObsText]                               = useState('');
  // Ver diagnóstico/relato da OS antes de provisionar (estimar tempo) — só leitura, sem query nova (registro já em memória)
  const [modalVerOs, setModalVerOs]                         = useState(null);
  const [modalItensExecucao, setModalItensExecucao]         = useState(null);
  const [itensExecucao, setItensExecucao]                   = useState([]);
  // Gerenciar equipe (responsáveis/apoios livres pós-início) — OS
  const [modalGerenciarEquipeOS, setModalGerenciarEquipeOS] = useState<any>(null);
  const [equipeAtualOS, setEquipeAtualOS]                   = useState<any[]>([]);
  const [novoRespNomeOS, setNovoRespNomeOS]                 = useState('');
  const [novoRespIdOS, setNovoRespIdOS]                     = useState<string|null>(null);
  const [novoApoioNomeOS, setNovoApoioNomeOS]               = useState('');
  const [novoApoioIdOS, setNovoApoioIdOS]                   = useState<string|null>(null);

  const load = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('sac_ordens_servico').select('*')
      .eq('is_manutencao_veicular', true)
      .in('status', STATUSES_VEICULAR_ATIVAS)
      .order('data_abertura', { ascending: false });
    setOrdens(data || []);
    if (!silent) setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(()=>load(true), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome')
      .then(({ data }) => setEquipesManu(data || []));
  }, []);

  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';

  const STATUS_COR_VEI = {
    'Em Provisionamento':           '#7c3aed',
    'Aguardando Aceite SAC':        '#f59e0b',
    'Provisionada':                 '#16a34a',
    'Aguardando Início':             '#f59e0b',
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

  // Produção confirma chegada → Verificação e Orçamento.
  // 'Provisionada' só é alcançado pelo caminho Presencial (a Remota já pula
  // direto pra 'Aguardando Início' em confirmarAceiteSAC, em SacTab.tsx, já
  // que a cotação é feita antes de agendar) — então esta função é sempre
  // presencial na prática, sem precisar checar tipo_avaliacao aqui.
  const confirmarChegada = async () => {
    const os = modalConfirmarChegada;
    const agora = new Date().toISOString();
    const novoStatus = 'Verificação e Orçamento';
    await supabase.from('sac_ordens_servico').update({
      status: novoStatus,
      data_chegada_veiculo: agora,
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

  // Avisa o SAC (via menção, mesmo padrão do ComprasTab) que uma OS concluiu
  // com itens diferentes do orçamento aprovado e precisa negociar o novo
  // valor com o cliente — a OS fica parada (não avança pro CQ) até isso ser
  // resolvido em SacTab.tsx (botão "🔁 Resolver Revisão").
  const notificarRevisaoOrcamento = async (os: any, novoTotal: number) => {
    try {
      if (!os.criado_por_email) return;
      const { data: criador } = await supabase.from('auth_usuarios')
        .select('id, nome').eq('email', os.criado_por_email).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'sac_revisao_orcamento', contexto_id: String(os.id),
        contexto_descricao: `OS ${os.numero_os}`,
        campo: 'revisao_orcamento',
        texto_trecho: `Orçamento revisado na OS ${os.numero_os} (${os.cliente_nome}) — novo total: ${fmtVal(novoTotal)} (aprovado: ${fmtVal(os.valor_orcamento)}). Negocie a aprovação do novo custo com o cliente.`,
        aba_destino: 'sac', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar SAC sobre revisão de orçamento:', e); }
  };

  // Produção conclui manutenção → compara o total apurado com o orçamento
  // aprovado (os.valor_orcamento). Se bater, segue pro CQ (Aguardando CQ);
  // se não bater, a OS permanece onde está (não avança) e o SAC é avisado
  // pra negociar o novo valor com o cliente.
  const salvarConclusao = async () => {
    const os = modalConcluirManu;
    const agora = new Date().toISOString();
    const kpi = os.data_inicio_manutencao
      ? Number(horasUteis(os.data_inicio_manutencao, new Date()).toFixed(2))
      : null;
    const novoTotal = concluirManuForm.itens_usados.reduce((s:number,i:any)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
    const totalAprovado = Number(os.valor_orcamento) || 0;
    const bateu = Math.abs(novoTotal - totalAprovado) < 0.01;

    if (!bateu) {
      await supabase.from('sac_ordens_servico').update({
        revisao_pendente: true,
        valor_orcamento_revisado: novoTotal,
        itens_revisados: concluirManuForm.itens_usados,
        atualizado_em: agora,
      }).eq('id', os.id);
      await notificarRevisaoOrcamento(os, novoTotal);
      setModalConcluirManu(null); setConcluirManuForm({ observacoes:'', itens_usados:[] }); load();
      alert('Os itens não batem com o orçamento aprovado. A OS ficou pendente de revisão e o SAC foi avisado para negociar o novo valor com o cliente — conclua novamente depois que o SAC resolver.');
      return;
    }

    await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando CQ',
      data_conclusao_manutencao: agora,
      materiais_utilizados: concluirManuForm.itens_usados,
      observacoes_manutencao: concluirManuForm.observacoes || null,
      kpi_execucao_horas: kpi,
      revisao_pendente: false,
      valor_orcamento_revisado: null,
      itens_revisados: null,
      atualizado_em: agora,
    }).eq('id', os.id);
    setModalConcluirManu(null); setConcluirManuForm({ observacoes:'', itens_usados:[] }); load();
  };

  // Produção inicia manutenção: registra técnico(s)/equipe + inicia KPI —
  // mesmo padrão individual/dupla/equipe da Produção de OPL.
  const iniciarManutencao = async () => {
    const os = modalIniciarManu;
    const agora = new Date().toISOString();
    let upd: any = { status: 'Em Execução', data_inicio_manutencao: agora, atualizado_em: agora, modo_execucao: iniciarManuModo };

    if (iniciarManuModo === 'individual') {
      if (!iniciarManuTecnico.trim()) { alert('Informe o nome do técnico!'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuTecnico.trim(), tecnico_producao_id: iniciarManuTecnicoId || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
    } else if (iniciarManuModo === 'dupla') {
      if (!iniciarManuTecnico.trim() || !iniciarManuTecnico2.trim()) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuTecnico.trim(), tecnico_producao_id: iniciarManuTecnicoId || null,
               tecnico_producao_2_nome: iniciarManuTecnico2.trim(), tecnico_producao_2_id: iniciarManuTecnico2Id || null,
               equipe_id: null, equipe_nome: null };
    } else if (iniciarManuModo === 'equipe') {
      if (!iniciarManuEquipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuEquipeSel.head_line_nome, tecnico_producao_id: iniciarManuEquipeSel.head_line_id || null,
               equipe_id: iniciarManuEquipeSel.id, equipe_nome: iniciarManuEquipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
    }

    await supabase.from('sac_ordens_servico').update(upd).eq('id', os.id);
    // Semeia a lista livre de responsáveis, igual acontece em iniciarProducao (OP).
    const seedResponsaveis = [
      upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.tecnico_responsavel } : null,
      upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
    ].filter(Boolean);
    if (seedResponsaveis.length > 0) {
      await supabase.from('responsaveis_producao').insert(seedResponsaveis.map((r: any) => ({
        tipo: 'os', referencia_id: os.id, papel: 'responsavel',
        tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
        adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
      })));
    }
    setModalIniciarManu(null); setIniciarManuTecnico(''); setIniciarManuTecnicoId(null);
    setIniciarManuModo('individual'); setIniciarManuTecnico2(''); setIniciarManuTecnico2Id(null); setIniciarManuEquipeSel(null);
    load();
  };

  // ── Gerenciar Equipe (responsáveis/apoios livres, pós-início) — OS ─────────
  const carregarEquipeAtualOS = async (os: any) => {
    const { data } = await supabase.from('responsaveis_producao')
      .select('*').eq('tipo', 'os').eq('referencia_id', os.id).order('criado_em');
    setEquipeAtualOS(data || []);
  };

  const abrirGerenciarEquipeOS = (os: any) => {
    setModalGerenciarEquipeOS(os);
    setNovoRespNomeOS(''); setNovoRespIdOS(null);
    setNovoApoioNomeOS(''); setNovoApoioIdOS(null);
    carregarEquipeAtualOS(os);
  };

  const adicionarMembroEquipeOS = async (papel: 'responsavel'|'apoio') => {
    const os = modalGerenciarEquipeOS;
    if (!os) return;
    const nome = papel === 'responsavel' ? novoRespNomeOS : novoApoioNomeOS;
    const id   = papel === 'responsavel' ? novoRespIdOS   : novoApoioIdOS;
    if (!nome.trim()) { alert('Selecione um técnico.'); return; }
    await supabase.from('responsaveis_producao').insert([{
      tipo: 'os', referencia_id: os.id, papel, tecnico_id: id, tecnico_nome: nome,
      adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
    }]);
    if (papel === 'responsavel') { setNovoRespNomeOS(''); setNovoRespIdOS(null); }
    else { setNovoApoioNomeOS(''); setNovoApoioIdOS(null); }
    carregarEquipeAtualOS(os);
  };

  const removerMembroEquipeOS = async (membro: any) => {
    if (!confirm(`Remover ${membro.tecnico_nome} (${membro.papel})?`)) return;
    await supabase.from('responsaveis_producao').delete().eq('id', membro.id);
    carregarEquipeAtualOS(modalGerenciarEquipeOS);
  };

  // Salva observação de produção sem concluir (durante execução)
  const salvarObsProducao = async () => {
    await supabase.from('sac_ordens_servico').update({
      observacoes_manutencao: obsText.trim() || null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', modalObsProd.id);
    setModalObsProd(null); setObsText(''); load();
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
                <th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Tipo</th><th>Data Prov.</th><th>Status</th><th>Ação Produção</th>
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
                      <td style={{ maxWidth:110, wordBreak:'break-word' }}>{os.cliente_nome}</td>
                      <td style={{maxWidth:130,fontSize:10}}>
                        <div style={{ wordBreak:'break-word' }}>{os.equipamento_nome}</div>
                        <div>{semDado(os.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : os.modelo}</div>
                        <div style={{color:'#94a3b8'}}>{semDado(os.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${os.chassi}`}</div>
                      </td>
                      <td><span style={{fontSize:9,background:'#e2e8f0',padding:'2px 6px',borderRadius:10}}>{os.tipo_avaliacao||'—'}</span></td>
                      <td style={{fontSize:10}}>
                        {os.data_provisionamento
                          ? <span style={{color:atrasada?'#dc2626':'inherit',fontWeight:atrasada?700:400}}>
                              {new Date(os.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}
                              {atrasada ? ' ⚠️' : ''}
                            </span>
                          : '—'}
                      </td>
                      <td>
                        <span className="acn-badge" style={{background:STATUS_COR_VEI[os.status]||'#94a3b8'}}>{os.status}</span>
                        {os.revisao_pendente && (
                          <div style={{fontSize:8,color:'#dc2626',fontWeight:700,marginTop:2}}>⚠️ Revisão pendente — aguardando SAC</div>
                        )}
                        {os.tecnico_responsavel && (
                          <div style={{fontSize:9,color:'#475569',marginTop:2}}>
                            {os.modo_execucao === 'equipe'
                              ? <>🏷️ <strong>{os.equipe_nome || os.tecnico_responsavel}</strong></>
                              : <>👤 {os.tecnico_responsavel}{os.tecnico_producao_2_nome ? <> + {os.tecnico_producao_2_nome}</> : ''}</>}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          <button className="acn-btn" style={{background:'#e2e8f0',color:'#475569',fontSize:9}}
                            onClick={()=>setModalVerOs(os)} title="Ver diagnóstico/relato antes de provisionar">
                            👁 VER
                          </button>
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
                          {os.status === 'Aguardando Início' && (
                            <button className="acn-btn" style={{background:'#f59e0b',fontSize:9}}
                              onClick={()=>{ setIniciarManuTecnico(''); setIniciarManuTecnicoId(null);
                                setIniciarManuModo('individual'); setIniciarManuTecnico2(''); setIniciarManuTecnico2Id(null); setIniciarManuEquipeSel(null);
                                setModalIniciarManu(os); }}>
                              ▶️ Iniciar
                            </button>
                          )}
                          {os.status === 'Verificação e Orçamento' && (
                            <button className="acn-btn" style={{background:'#8b5cf6',fontSize:9}}
                              onClick={()=>{ setVerificacaoItens(Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalVerificacao(os); }}>
                              🔧 Inserir Materiais
                            </button>
                          )}
                          {os.status === 'Em Manutenção' && (
                            <>
                              <button className="acn-btn" style={{background:'#0d9488',fontSize:9}}
                                onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)?os.materiais_utilizados.map(i=>({...i})):[]}); }}>
                                ✅ Concluir
                              </button>
                              <button className="acn-btn" style={{background:'#0f766e',fontSize:9}} onClick={()=>abrirGerenciarEquipeOS(os)}>👥 EQUIPE</button>
                            </>
                          )}
                          {os.status === 'Em Execução' && (
                            <>
                              <button className="acn-btn" style={{background:'#64748b',fontSize:9}}
                                onClick={()=>{ setObsText(os.observacoes_manutencao||''); setModalObsProd(os); }}>
                                💬 Obs.
                              </button>
                              <button className="acn-btn" style={{background:'#0891b2',fontSize:9}}
                                onClick={()=>{ setItensExecucao(Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalItensExecucao(os); }}>
                                📋 Itens
                              </button>
                              <button className="acn-btn" style={{background:'#0d9488',fontSize:9}}
                                onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[]}); }}>
                                ✅ Concluir
                              </button>
                              <button className="acn-btn" style={{background:'#0f766e',fontSize:9}} onClick={()=>abrirGerenciarEquipeOS(os)}>👥 EQUIPE</button>
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
              ✅ Próximo status: <strong>Verificação e Orçamento</strong>
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

      {/* MODAL: Observação de Produção */}
      {modalObsProd && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:460}}>
            <div className="modal-title">💬 Observação de Produção — {modalObsProd.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Cliente: <strong>{modalObsProd.cliente_nome}</strong>
            </div>
            <label className="acn-label">Observação (visível na impressão da OS)</label>
            <textarea className="acn-input" rows={5} autoFocus style={{width:'100%',resize:'vertical',marginBottom:14}}
              placeholder="Descreva o andamento, peças utilizadas, observações técnicas..."
              value={obsText} onChange={e=>setObsText(e.target.value)} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0891b2',flex:1}} onClick={salvarObsProducao}>💾 Salvar</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalObsProd(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver OS (somente leitura) — diagnóstico/relato antes de provisionar */}
      {modalVerOs && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,maxHeight:'85vh',overflowY:'auto'}}>
            <div className="modal-title">👁 {modalVerOs.numero_os} — {modalVerOs.cliente_nome}</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12,fontSize:11,color:'#475569'}}>
              {modalVerOs.tipo_avaliacao && <span style={{background:'#e2e8f0',padding:'2px 8px',borderRadius:10}}>{modalVerOs.tipo_avaliacao}</span>}
              <span className="acn-badge" style={{background:STATUS_COR_VEI[modalVerOs.status]||'#94a3b8'}}>{modalVerOs.status}</span>
            </div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12,lineHeight:1.6}}>
              <strong>Veículo/Equipamento:</strong> {modalVerOs.equipamento_nome||'—'}<br/>
              <strong>Marca/Modelo:</strong> {[modalVerOs.marca,modalVerOs.modelo].filter(Boolean).join(' / ')||'—'}<br/>
              <strong>Chassi/Série:</strong> {modalVerOs.chassi||modalVerOs.numero_serie||'—'}
            </div>
            <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:4}}>🗣️ Defeito Reclamado (relato do cliente)</div>
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11,whiteSpace:'pre-wrap'}}>
              {modalVerOs.defeito_reclamado ? <Linkify text={modalVerOs.defeito_reclamado} /> : <span style={{color:'#94a3b8'}}>Nenhum defeito reclamado registrado.</span>}
            </div>
            {modalVerOs.observacoes && (
              <>
                <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:4}}>📝 Observações</div>
                <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11,whiteSpace:'pre-wrap'}}>
                  <Linkify text={modalVerOs.observacoes} />
                </div>
              </>
            )}
            {Array.isArray(modalVerOs.itens_cotacao) && modalVerOs.itens_cotacao.length > 0 && (
              <>
                <div style={{fontWeight:700,fontSize:9,color:'#475569',textTransform:'uppercase',marginBottom:4}}>
                  🔧 Itens já orçados {modalVerOs.valor_orcamento!=null && `— Total: ${fmtVal(modalVerOs.valor_orcamento)}`}
                </div>
                <div style={{marginBottom:12}}>
                  {modalVerOs.itens_cotacao.map((it,i)=>(
                    <div key={i} style={{fontSize:10,color:'#374151',padding:'3px 0',borderBottom:i<modalVerOs.itens_cotacao.length-1?'1px solid #f1f5f9':'none'}}>
                      {it.quantidade||1}x {it.descricao||it.codigo||'—'} {it.valor_unitario ? `— ${fmtVal(it.valor_unitario)}` : ''}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalVerOs(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Iniciar Manutenção */}
      {modalIniciarManu && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">▶️ Iniciar Manutenção — {modalIniciarManu.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>
              Cliente: <strong>{modalIniciarManu.cliente_nome}</strong>
              {modalIniciarManu.veiculo_modelo && <> &nbsp;|&nbsp; Veículo: <strong>{modalIniciarManu.veiculo_modelo}</strong></>}
            </div>
            <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
              ⏱️ A contagem do KPI de manutenção inicia ao confirmar.
            </div>
            {/* Seletor de modo — mesmo padrão individual/dupla/equipe da Produção de OPL */}
            <label className="acn-label">Modo de Execução</label>
            <div style={{display:'flex',gap:0,marginBottom:14,borderRadius:6,overflow:'hidden',border:'1.5px solid #d1d5db'}}>
              {(['individual','dupla','equipe'] as const).map(m => (
                <button key={m} onClick={()=>setIniciarManuModo(m)} style={{
                  flex:1, padding:'7px 4px', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                  background: iniciarManuModo===m ? '#f59e0b' : 'white',
                  color: iniciarManuModo===m ? 'white' : '#475569',
                  borderRight: m!=='equipe' ? '1px solid #d1d5db' : 'none',
                }}>
                  {m==='individual'?'👤 Individual':m==='dupla'?'👥 Dupla':'🏷️ Equipe'}
                </button>
              ))}
            </div>

            {iniciarManuModo === 'individual' && (
              <>
                <label className="acn-label">Técnico Responsável *</label>
                <ColaboradorSelect
                  value={iniciarManuTecnico} onChange={(nome)=>{ setIniciarManuTecnico(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnicoId(colab?.id||null); }}
                  placeholder="Selecione o técnico responsável"
                  className="acn-input" style={{width:'100%',marginBottom:14}}
                  autoFocus onKeyDown={e=>e.key==='Enter'&&iniciarManutencao()} />
              </>
            )}

            {iniciarManuModo === 'dupla' && (
              <>
                <label className="acn-label">Head Line (Técnico 1) *</label>
                <ColaboradorSelect
                  value={iniciarManuTecnico} onChange={(nome)=>{ setIniciarManuTecnico(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnicoId(colab?.id||null); }}
                  placeholder="Selecione o head line"
                  className="acn-input" style={{width:'100%',marginBottom:8}} />
                <label className="acn-label">Auxiliar (Técnico 2) *</label>
                <ColaboradorSelect
                  value={iniciarManuTecnico2} onChange={(nome)=>{ setIniciarManuTecnico2(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnico2Id(colab?.id||null); }}
                  placeholder="Selecione o auxiliar"
                  className="acn-input" style={{width:'100%',marginBottom:14}} />
              </>
            )}

            {iniciarManuModo === 'equipe' && (
              <>
                <label className="acn-label">Selecione a Equipe (pelo Head Line)</label>
                {equipesManu.length === 0 ? (
                  <div style={{fontSize:10,color:'#ef4444',marginBottom:14}}>Nenhuma equipe cadastrada. Vá em 🏷️ Equipes para criar.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                    {equipesManu.map(eq => (
                      <div key={eq.id} onClick={()=>setIniciarManuEquipeSel(eq)} style={{
                        padding:'9px 12px', borderRadius:6, cursor:'pointer', fontSize:11,
                        border: iniciarManuEquipeSel?.id===eq.id ? '2px solid #f59e0b' : '1.5px solid #e2e8f0',
                        background: iniciarManuEquipeSel?.id===eq.id ? '#fffbeb' : 'white',
                      }}>
                        <strong>{eq.nome}</strong>
                        <span style={{color:'#475569',marginLeft:8,fontSize:10}}>Head: {eq.head_line_nome}</span>
                        {(eq.membros||[]).length>0 && (
                          <span style={{color:'#6366f1',marginLeft:8,fontSize:9}}>+{eq.membros.length} membros</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#f59e0b',flex:1}} onClick={iniciarManutencao}>▶️ Iniciar Manutenção</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalIniciarManu(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR EQUIPE — responsáveis/apoios livres, pós-início (OS) */}
      {modalGerenciarEquipeOS && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">👥 Equipe — OS {modalGerenciarEquipeOS.numero_os}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
              Responsáveis recebem comissão pelo próprio percentual configurado. Apoios recebem 0,1% fixo
              do valor de mão de obra desta OS, além do que os responsáveis já recebem.
            </div>

            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>RESPONSÁVEIS</div>
            {equipeAtualOS.filter(m=>m.papel==='responsavel').length === 0 ? (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:10}}>Nenhum responsável ainda.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                {equipeAtualOS.filter(m=>m.papel==='responsavel').map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'6px 10px',background:'#eef2ff',borderRadius:6,fontSize:11}}>
                    <span>{m.tecnico_nome}</span>
                    <button onClick={()=>removerMembroEquipeOS(m)}
                      style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              <ColaboradorSelect value={novoRespNomeOS}
                onChange={nome=>{ setNovoRespNomeOS(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoRespIdOS(c?.id||null); }}
                placeholder="Adicionar responsável..." className="acn-input" style={{flex:1}} />
              <button className="acn-btn" style={{background:'#6366f1',fontSize:10}} onClick={()=>adicionarMembroEquipeOS('responsavel')}>+ Add</button>
            </div>

            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>APOIOS (0,1% da mão de obra)</div>
            {equipeAtualOS.filter(m=>m.papel==='apoio').length === 0 ? (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:10}}>Nenhum apoio ainda.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                {equipeAtualOS.filter(m=>m.papel==='apoio').map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'6px 10px',background:'#f0fdf4',borderRadius:6,fontSize:11}}>
                    <span>{m.tecnico_nome}</span>
                    <button onClick={()=>removerMembroEquipeOS(m)}
                      style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              <ColaboradorSelect value={novoApoioNomeOS}
                onChange={nome=>{ setNovoApoioNomeOS(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoApoioIdOS(c?.id||null); }}
                placeholder="Adicionar apoio..." className="acn-input" style={{flex:1}} />
              <button className="acn-btn" style={{background:'#16a34a',fontSize:10}} onClick={()=>adicionarMembroEquipeOS('apoio')}>+ Add</button>
            </div>

            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalGerenciarEquipeOS(null)}>Fechar</button>
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

// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO DE EQUIPES DE PRODUÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function EquipesSection({ currentUser }) {
  const { list: colabs } = useColaboradores();
  const [equipes, setEquipes]   = useState<any[]>([]);
  const [modal, setModal]       = useState<'nova'|'editar'|null>(null);
  const [editando, setEditando] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const FORM_VAZIO = { nome:'', head_line_id:'', head_line_nome:'', membros:[] as any[] };
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [membroAdd, setMembroAdd] = useState('');

  const load = async () => {
    const { data } = await supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome');
    setEquipes(data || []);
  };
  useEffect(() => { load(); }, []);

  const abrirNova = () => { setForm({ ...FORM_VAZIO }); setEditando(null); setModal('nova'); };
  const abrirEditar = (eq: any) => {
    setForm({ nome: eq.nome, head_line_id: eq.head_line_id || '', head_line_nome: eq.head_line_nome, membros: eq.membros || [] });
    setEditando(eq);
    setModal('editar');
  };

  const salvar = async () => {
    if (!form.nome.trim() || !form.head_line_nome.trim()) { alert('Informe nome da equipe e Head Line.'); return; }
    setSalvando(true);
    const payload = {
      nome: form.nome.trim(),
      head_line_id: form.head_line_id || null,
      head_line_nome: form.head_line_nome.trim(),
      membros: form.membros,
      ativa: true,
    };
    if (editando) {
      await supabase.from('producao_equipes').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('producao_equipes').insert([payload]);
    }
    setSalvando(false); setModal(null); setEditando(null); load();
  };

  const excluir = async (eq: any) => {
    if (!window.confirm(`Excluir equipe "${eq.nome}"?`)) return;
    await supabase.from('producao_equipes').update({ ativa: false }).eq('id', eq.id);
    load();
  };

  const addMembro = () => {
    const nome = membroAdd.trim();
    if (!nome) return;
    const colab = colabs.find(c => c.nome === nome);
    if (form.membros.some(m => m.nome === nome)) return;
    setForm(f => ({ ...f, membros: [...f.membros, { id: colab?.id || null, nome }] }));
    setMembroAdd('');
  };

  const remMembro = (nome: string) => setForm(f => ({ ...f, membros: f.membros.filter(m => m.nome !== nome) }));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>🏷️ Equipes de Produção</div>
        <button className="acn-btn" style={{ background:'#0f766e' }} onClick={abrirNova}>+ Nova Equipe</button>
      </div>

      {equipes.length === 0 ? (
        <div className="acn-empty">Nenhuma equipe cadastrada.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {equipes.map(eq => (
            <div key={eq.id} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:4 }}>{eq.nome}</div>
                  <div style={{ fontSize:10, color:'#475569', marginBottom:6 }}>
                    👑 Head Line: <strong>{eq.head_line_nome}</strong>
                  </div>
                  {(eq.membros || []).length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {(eq.membros || []).map((m: any) => (
                        <span key={m.nome} style={{ background:'#eff6ff', color:'#1d4ed8', borderRadius:12, padding:'2px 10px', fontSize:10, fontWeight:600 }}>
                          👤 {m.nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="acn-btn" style={{ background:'#6366f1', fontSize:10 }} onClick={() => abrirEditar(eq)}>✏️ Editar</button>
                  <button className="acn-btn" style={{ background:'#ef4444', fontSize:10 }} onClick={() => excluir(eq)}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL EQUIPE */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth:460 }}>
            <div className="modal-title">{modal === 'nova' ? 'Nova Equipe' : 'Editar Equipe'}</div>

            <label className="acn-label">Nome da Equipe *</label>
            <input className="acn-input" style={{ width:'100%', marginBottom:10 }}
              value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Equipe Alpha" />

            <label className="acn-label">👑 Head Line (Técnico Responsável) *</label>
            <ColaboradorSelect
              value={form.head_line_nome}
              onChange={nome => { const c = colabs.find(x => x.nome === nome); setForm(f => ({ ...f, head_line_nome: nome, head_line_id: c?.id || '' })); }}
              placeholder="Selecione o técnico líder"
              className="acn-input" style={{ width:'100%', marginBottom:12 }} />

            <label className="acn-label">👥 Membros da Equipe</label>
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              <ColaboradorSelect
                value={membroAdd}
                onChange={v => setMembroAdd(v)}
                placeholder="Adicionar técnico..."
                className="acn-input" style={{ flex:1 }} />
              <button className="acn-btn" style={{ background:'#0f766e', whiteSpace:'nowrap' }} onClick={addMembro}>+ Adicionar</button>
            </div>
            {form.membros.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12, padding:'8px 10px', background:'#f8fafc', borderRadius:6, border:'1px solid #e2e8f0' }}>
                {form.membros.map(m => (
                  <span key={m.nome} style={{ background:'#eff6ff', color:'#1d4ed8', borderRadius:12, padding:'3px 10px', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                    👤 {m.nome}
                    <button onClick={() => remMembro(m.nome)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontWeight:700, fontSize:11, padding:0 }}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#0f766e', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : modal === 'nova' ? 'Criar Equipe' : 'Salvar Alterações'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Importação em lote de Técnico(s)/Equipe por OP desmembrada (Adaptação) ──
// Cola do Excel (Ctrl+C/Ctrl+V): cada linha identifica a OP pelo chassi e/ou
// placa (já cadastrados nela) e traz o nome do responsável — que pode ser um
// técnico (individual), "Técnico A + Técnico B" (dupla) ou o nome de uma
// equipe já cadastrada (🏷️ Equipes). Não depende da ordem das linhas: casa
// sempre pelo chassi/placa já vinculado à OP, nunca por posição.
const REGEX_PLACA_PROD = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/i;

function resolverResponsavel(texto, equipesList, colaboradoresList) {
  const t = (texto || '').trim();
  if (!t) return null;
  const norm = (s) => s.trim().toUpperCase();
  // Dupla: "Fulano + Beltrano" ou "Fulano / Beltrano"
  if (/[+/]/.test(t)) {
    const partes = t.split(/[+/]/).map(p => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
      const c1 = colaboradoresList.find(c => norm(c.nome) === norm(partes[0]));
      const c2 = colaboradoresList.find(c => norm(c.nome) === norm(partes[1]));
      if (c1 && c2) return { modo: 'dupla', nome: c1.nome, id: c1.id, nome2: c2.nome, id2: c2.id };
    }
  }
  // Nome exato de equipe cadastrada sempre ganha (ex: "Head Line Tiago").
  const eqPorNome = equipesList.find(e => norm(e.nome) === norm(t));
  if (eqPorNome) return { modo: 'equipe', equipe: eqPorNome };
  // Nome de um técnico individual ganha do head_line_nome de uma equipe —
  // "JUNIOR" sozinho deve virar técnico individual, não a equipe dele.
  const c = colaboradoresList.find(x => norm(x.nome) === norm(t));
  if (c) return { modo: 'individual', nome: c.nome, id: c.id };
  // Só cai pra equipe pelo head_line_nome se não bateu como técnico —
  // cobre o caso de o head line não estar cadastrado em rh_funcionarios.
  const eqPorHead = equipesList.find(e => norm(e.head_line_nome) === norm(t));
  if (eqPorHead) return { modo: 'equipe', equipe: eqPorHead };
  return null;
}

function calcularPlanoImportacaoTecnicos(linhasRaw, irmaos, equipesList, colaboradoresList) {
  const linhas = linhasRaw.map(l => l.trim()).filter(Boolean);
  const plano = [];
  const naoReconhecidas = [];
  for (const linha of linhas) {
    const partes = linha.split(/\t|;/).map(p => p.trim()).filter(Boolean);
    if (partes.length < 2) { naoReconhecidas.push({ linha, motivo: 'linha incompleta (faltou chassi/placa ou responsável)' }); continue; }
    const respTexto = partes[partes.length - 1];
    const chaves = partes.slice(0, -1);
    const alvo = irmaos.find(o =>
      chaves.some(k => (o.chassi && o.chassi.trim().toUpperCase() === k.trim().toUpperCase()) ||
                        (o.placa  && o.placa.trim().toUpperCase()  === k.trim().toUpperCase())));
    if (!alvo) { naoReconhecidas.push({ linha, motivo: `nenhuma OP do lote tem chassi/placa "${chaves.join(' / ')}"` }); continue; }
    const resp = resolverResponsavel(respTexto, equipesList, colaboradoresList);
    if (!resp) { naoReconhecidas.push({ linha, motivo: `"${respTexto}" não é um técnico nem equipe cadastrada` }); continue; }
    plano.push({ alvo, resp, respTexto });
  }
  return { plano, naoReconhecidas };
}

function ModalImportarTecnicosEquipe({ base, irmaos, equipes, colaboradoresList, currentUser, onClose, onImportado }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const { plano, naoReconhecidas } = calcularPlanoImportacaoTecnicos(texto.split('\n'), irmaos, equipes, colaboradoresList);

  const confirmar = async () => {
    setSalvando(true);
    let ok = 0, falhas = 0;
    const agora = new Date().toISOString();
    for (const { alvo, resp } of plano) {
      let upd = { modo_execucao: resp.modo };
      if (resp.modo === 'individual') {
        upd = { ...upd, responsavel_producao: resp.nome, tecnico_producao_id: resp.id,
                 tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      } else if (resp.modo === 'dupla') {
        upd = { ...upd, responsavel_producao: resp.nome, tecnico_producao_id: resp.id,
                 tecnico_producao_2_nome: resp.nome2, tecnico_producao_2_id: resp.id2, equipe_id: null, equipe_nome: null };
      } else if (resp.modo === 'equipe') {
        upd = { ...upd, responsavel_producao: resp.equipe.head_line_nome, tecnico_producao_id: resp.equipe.head_line_id || null,
                 equipe_id: resp.equipe.id, equipe_nome: resp.equipe.nome, tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      }
      // Só inicia a produção (status + data) se ainda não tinha começado —
      // reatribuir uma OP já em produção não mexe no status nem reinicia o KPI.
      if (alvo.status_geral === 'Aguardando Inicio Producao') {
        upd.status_geral = 'Em Producao';
        upd.data_inicio_producao = agora;
      }
      const { error } = await supabase.from('oples').update(upd).eq('id', alvo.id);
      if (error) { falhas++; continue; }
      ok++;
      const seed = [
        upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.responsavel_producao } : null,
        upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
      ].filter(Boolean);
      if (seed.length > 0) {
        await supabase.from('responsaveis_producao').insert(seed.map(r => ({
          tipo: 'op', referencia_id: alvo.id, papel: 'responsavel',
          tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
          adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
        })));
      }
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: alvo.id, numero_opl: alvo.opl, setor: 'Producao',
        evento: `Responsável definido via importação em lote — ${upd.responsavel_producao}${upd.equipe_nome ? ` (Equipe ${upd.equipe_nome})` : ''}${upd.tecnico_producao_2_nome ? ` + ${upd.tecnico_producao_2_nome}` : ''}.`,
        status_anterior: alvo.status_geral, status_novo: upd.status_geral || alvo.status_geral,
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    setSalvando(false);
    setResultado({ ok, falhas });
    onImportado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title">📥 Importar Técnicos/Equipes — {base === 'Seleção' ? '☑️ Seleção' : `🔗 ${base}`}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
          {irmaos.length} unidade(s) {base === 'Seleção' ? 'selecionada(s)' : 'neste lote'}. Cole do Excel (Ctrl+C na planilha, Ctrl+V aqui) — cada linha:
          <strong> Chassi (ou Placa) [tab] Responsável</strong>, ou <strong>Chassi [tab] Placa [tab] Responsável</strong>.
          Responsável pode ser um técnico, "Técnico A + Técnico B" (dupla) ou o nome de uma equipe cadastrada.
          O casamento é sempre pelo chassi/placa já vinculado à OP, nunca pela ordem das linhas.
        </div>

        <textarea className="acn-input" rows={5} style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 10, marginBottom: 8 }}
          placeholder={'Ex:\n9BW1234567890\tJUNIOR\nABC1D23\tHead Line Tiago\n9BW...\tFELIPE + JONATAN'}
          value={texto} onChange={e => setTexto(e.target.value)} />

        {texto.trim() && !resultado && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              Prévia — {plano.length} serão aplicadas, {naoReconhecidas.length} sem correspondência.
            </div>
            {plano.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '5px 8px', textAlign: 'left' }}>OPL destino</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left' }}>Responsável</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left' }}>Modo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.map(({ alvo, resp, respTexto }, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 700 }}>{alvo.opl}</td>
                        <td style={{ padding: '4px 8px' }}>{respTexto}</td>
                        <td style={{ padding: '4px 8px', color: resp.modo === 'equipe' ? '#7c3aed' : '#0369a1', fontWeight: 600 }}>
                          {resp.modo === 'equipe' ? '🏷️ Equipe' : resp.modo === 'dupla' ? '👥 Dupla' : '👤 Individual'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {naoReconhecidas.length > 0 && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 10px', borderRadius: 6, fontSize: 10 }}>
                {naoReconhecidas.map((n, i) => <div key={i}>⚠️ "{n.linha}" — {n.motivo}</div>)}
              </div>
            )}
          </div>
        )}

        {resultado && (
          <div style={{ background: '#f0fdf4', color: '#15803d', padding: '10px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            ✅ {resultado.ok} unidade(s) atualizada(s){resultado.falhas ? `, ${resultado.falhas} falha(s)` : ''}.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {texto.trim() && !resultado && (
            <button className="acn-btn" style={{ background: '#16a34a', flex: 1 }} disabled={salvando || plano.length === 0} onClick={confirmar}>
              {salvando ? 'Aplicando...' : `✅ Confirmar e aplicar (${plano.length})`}
            </button>
          )}
          <button className="acn-btn" style={{ background: '#94a3b8', flex: resultado ? 1 : 'none' }} onClick={onClose}>
            {resultado ? 'Fechar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProducaoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const { list: colaboradoresList } = useColaboradores();

  // Filtros da lista de Produção
  const [filtroBusca, setFiltroBusca]     = useState('');
  const [filtroStatus, setFiltroStatus]   = useState('Todos');
  const [filtroTecnico, setFiltroTecnico] = useState('Todos');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEntregaDe, setFiltroEntregaDe]   = useState('');
  const [filtroEntregaAte, setFiltroEntregaAte] = useState('');
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [modalImportarLoteProducao, setModalImportarLoteProducao] = useState<any>(null); // { base, irmaos }
  // Seleção livre por checkbox (não precisa ser do mesmo lote/base) — pra
  // ação em massa: iniciar produção e/ou atribuir técnicos/equipes de uma vez.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const toggleSelecionar = (id: string) => setSelecionados(prev => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const [aplicandoIniciarLote, setAplicandoIniciarLote] = useState(false);
  const [modalDevolver, setModalDevolver] = useState(null);
  const [modalVerOpl, setModalVerOpl]     = useState<any>(null);
  const [modalAcomp,  setModalAcomp]      = useState<any>(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [respNome, setRespNome] = useState('');
  const [respId, setRespId] = useState<string|null>(null);
  // Dupla / Equipe
  const [modoExecucao, setModoExecucao] = useState<'individual'|'dupla'|'equipe'>('individual');
  const [respNome2, setRespNome2] = useState('');
  const [respId2, setRespId2] = useState<string|null>(null);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [equipeSel, setEquipeSel] = useState<any>(null);
  // Editar responsável
  const [modalEditResp, setModalEditResp] = useState<any>(null);
  const [editModo, setEditModo] = useState<'individual'|'dupla'|'equipe'>('individual');
  const [editResp1Nome, setEditResp1Nome] = useState('');
  const [editResp1Id, setEditResp1Id] = useState<string|null>(null);
  const [editResp2Nome, setEditResp2Nome] = useState('');
  const [editResp2Id, setEditResp2Id] = useState<string|null>(null);
  const [editEquipeSel, setEditEquipeSel] = useState<any>(null);
  // Gerenciar equipe (responsáveis/apoios livres pós-início)
  const [modalGerenciarEquipe, setModalGerenciarEquipe] = useState<any>(null);
  const [equipeAtual, setEquipeAtual] = useState<any[]>([]);
  const [novoRespNome, setNovoRespNome] = useState('');
  const [novoRespId, setNovoRespId] = useState<string|null>(null);
  const [novoApoioNome, setNovoApoioNome] = useState('');
  const [novoApoioId, setNovoApoioId] = useState<string|null>(null);

  useEffect(() => {
    fetchAll();
    fetchEquipes();
    const t = setInterval(()=>fetchAll(true), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguardando Inicio Producao', 'Em Producao', 'Retrabalho', 'Em Retrabalho'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    if (!silent) setLoading(false);
  };

  const fetchEquipes = async () => {
    const { data } = await supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome');
    setEquipes(data || []);
  };

  const iniciarProducao = async () => {
    const opl = modalIniciar;
    const agora = new Date().toISOString();
    let upd: any = { status_geral: 'Em Producao', data_inicio_producao: agora, modo_execucao: modoExecucao,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0 };
    let logResp = '';

    if (modoExecucao === 'individual') {
      const resp = respNome || currentUser?.nome;
      upd = { ...upd, responsavel_producao: resp, tecnico_producao_id: respId || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      logResp = resp;
    } else if (modoExecucao === 'dupla') {
      if (!respNome || !respNome2) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, responsavel_producao: respNome, tecnico_producao_id: respId || null,
               tecnico_producao_2_nome: respNome2, tecnico_producao_2_id: respId2 || null,
               equipe_id: null, equipe_nome: null };
      logResp = `${respNome} + ${respNome2}`;
    } else if (modoExecucao === 'equipe') {
      if (!equipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, responsavel_producao: equipeSel.head_line_nome,
               tecnico_producao_id: equipeSel.head_line_id || null,
               equipe_id: equipeSel.id, equipe_nome: equipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      logResp = `Equipe ${equipeSel.nome} (Head: ${equipeSel.head_line_nome})`;
    }

    await supabase.from('oples').update(upd).eq('id', opl.id);
    logChange({ module: 'producao', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral, responsavel_producao: opl.responsavel_producao },
      newRow: { status_geral: upd.status_geral, responsavel_producao: upd.responsavel_producao }, user: currentUser });
    // Semeia a lista livre de responsáveis (responsaveis_producao) com quem foi
    // definido ao iniciar — daqui pra frente essa lista é editável livremente
    // via "👥 Equipe", sem mexer mais nesses campos legados.
    const seedResponsaveis = [
      upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.responsavel_producao } : null,
      upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
    ].filter(Boolean);
    if (seedResponsaveis.length > 0) {
      await supabase.from('responsaveis_producao').insert(seedResponsaveis.map((r:any) => ({
        tipo: 'op', referencia_id: opl.id, papel: 'responsavel',
        tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
        adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
      })));
    }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Inicio da producao. Responsavel: ${logResp}`,
      status_anterior: opl.status_geral, status_novo: 'Em Producao',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalIniciar(null); setRespNome(''); setRespId(null); setRespNome2(''); setRespId2(null);
    setModoExecucao('individual'); setEquipeSel(null); fetchAll();
  };

  // Inicia produção de todas as selecionadas de uma vez, sem definir
  // responsável ainda (fica "Em Producao" sem técnico) — o usuário atribui
  // depois via "📥 Importar Técnicos/Equipes" na mesma seleção. Só afeta as
  // que ainda estão "Aguardando Inicio Producao"; ignora as demais.
  const iniciarProducaoEmLote = async () => {
    const alvos = opls.filter((o: any) => selecionados.has(o.id) && o.status_geral === 'Aguardando Inicio Producao');
    if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está "Aguardando Início Produção".'); return; }
    if (!confirm(`Iniciar produção de ${alvos.length} OP(s) selecionada(s)? Você atribui o técnico/equipe depois, na mesma seleção.`)) return;
    setAplicandoIniciarLote(true);
    const agora = new Date().toISOString();
    for (const opl of alvos) {
      await supabase.from('oples').update({ status_geral: 'Em Producao', data_inicio_producao: agora,
        pausado: false, data_pausa: null, tempo_pausado_horas: 0 }).eq('id', opl.id);
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
        evento: 'Início da produção em lote (ação em massa por seleção) — responsável a definir.',
        status_anterior: opl.status_geral, status_novo: 'Em Producao',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    setAplicandoIniciarLote(false);
    setSelecionados(new Set());
    fetchAll();
  };

  // Libera para CQ todas as selecionadas que estão "Em Producao" de uma vez
  // — mesmo cálculo de tempo de produção do botão individual "LIB. CQ".
  const liberarChecklistEmLote = async () => {
    const alvos = opls.filter((o: any) => selecionados.has(o.id) && o.status_geral === 'Em Producao');
    if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está "Em Produção".'); return; }
    if (!confirm(`Liberar ${alvos.length} OP(s) selecionada(s) para o CQ?`)) return;
    setAplicandoIniciarLote(true);
    for (const opl of alvos) {
      await liberarChecklist(opl);
    }
    setAplicandoIniciarLote(false);
    setSelecionados(new Set());
  };

  const editarResponsavel = async () => {
    const opl = modalEditResp;
    if (!opl) return;
    const agora = new Date().toISOString();
    let upd: any = { modo_execucao: editModo };
    let logResp = '';

    if (editModo === 'individual') {
      if (!editResp1Nome) { alert('Informe o técnico.'); return; }
      upd = { ...upd, responsavel_producao: editResp1Nome, tecnico_producao_id: editResp1Id || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      logResp = editResp1Nome;
    } else if (editModo === 'dupla') {
      if (!editResp1Nome || !editResp2Nome) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, responsavel_producao: editResp1Nome, tecnico_producao_id: editResp1Id || null,
               tecnico_producao_2_nome: editResp2Nome, tecnico_producao_2_id: editResp2Id || null,
               equipe_id: null, equipe_nome: null };
      logResp = `${editResp1Nome} + ${editResp2Nome}`;
    } else if (editModo === 'equipe') {
      if (!editEquipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, responsavel_producao: editEquipeSel.head_line_nome,
               tecnico_producao_id: editEquipeSel.head_line_id || null,
               equipe_id: editEquipeSel.id, equipe_nome: editEquipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      logResp = `Equipe ${editEquipeSel.nome} (Head: ${editEquipeSel.head_line_nome})`;
    }

    await supabase.from('oples').update(upd).eq('id', opl.id);
    logChange({ module: 'producao', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { responsavel_producao: opl.responsavel_producao }, newRow: { responsavel_producao: upd.responsavel_producao }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Responsavel alterado para: ${logResp}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalEditResp(null); fetchAll();
  };

  // ── Gerenciar Equipe (responsáveis/apoios livres, pós-início) ──────────────
  const carregarEquipeAtual = async (opl: any) => {
    const { data } = await supabase.from('responsaveis_producao')
      .select('*').eq('tipo', 'op').eq('referencia_id', opl.id).order('criado_em');
    setEquipeAtual(data || []);
  };

  const abrirGerenciarEquipe = (opl: any) => {
    setModalGerenciarEquipe(opl);
    setNovoRespNome(''); setNovoRespId(null);
    setNovoApoioNome(''); setNovoApoioId(null);
    carregarEquipeAtual(opl);
  };

  const adicionarMembroEquipe = async (papel: 'responsavel'|'apoio') => {
    const opl = modalGerenciarEquipe;
    if (!opl) return;
    const nome = papel === 'responsavel' ? novoRespNome : novoApoioNome;
    const id   = papel === 'responsavel' ? novoRespId   : novoApoioId;
    if (!nome.trim()) { alert('Selecione um técnico.'); return; }
    await supabase.from('responsaveis_producao').insert([{
      tipo: 'op', referencia_id: opl.id, papel, tecnico_id: id, tecnico_nome: nome,
      adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
    }]);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `${papel === 'responsavel' ? 'Responsável' : 'Apoio'} adicionado: ${nome}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    if (papel === 'responsavel') { setNovoRespNome(''); setNovoRespId(null); }
    else { setNovoApoioNome(''); setNovoApoioId(null); }
    carregarEquipeAtual(opl);
  };

  const removerMembroEquipe = async (membro: any) => {
    if (!confirm(`Remover ${membro.tecnico_nome} (${membro.papel})?`)) return;
    const opl = modalGerenciarEquipe;
    await supabase.from('responsaveis_producao').delete().eq('id', membro.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `${membro.papel === 'responsavel' ? 'Responsável' : 'Apoio'} removido: ${membro.tecnico_nome}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    carregarEquipeAtual(opl);
  };

  const liberarChecklist = async (opl) => {
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_producao ? new Date(opl.data_inicio_producao) : null;
    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : null;
    await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      data_conclusao_producao: agora,
      data_entrada_cq: agora,
      tempo_producao_horas: tempo,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
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
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
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
    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : null;
    await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      tempo_retrabalho_horas: tempo,
      obs_reprovacao_cq: null,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
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
    if (tipo === 'iniciar')            {
      setModalIniciar(opl); setRespNome(currentUser?.nome || '');
      setModoExecucao('individual'); setRespNome2(''); setRespId2(null); setEquipeSel(null);
    }
    if (tipo === 'checklist')          liberarChecklist(opl);
    if (tipo === 'pausar')             pausarOpl(supabase, opl).then(fetchAll);
    if (tipo === 'retomar')            retomarOpl(supabase, opl).then(fetchAll);
    if (tipo === 'devolver')           { setModalDevolver(opl); setObsDevolver(''); }
    if (tipo === 'ver')                setModalVerOpl(opl);
    if (tipo === 'acomp')              setModalAcomp(opl);
    if (tipo === 'iniciar_retrabalho') iniciarRetrabalho(opl);
    if (tipo === 'concluir_retrabalho') concluirRetrabalho(opl);
    if (tipo === 'editar_resp') {
      setModalEditResp(opl);
      setEditModo((opl.modo_execucao as any) || 'individual');
      setEditResp1Nome(opl.responsavel_producao || '');
      setEditResp1Id(opl.tecnico_producao_id || null);
      setEditResp2Nome(opl.tecnico_producao_2_nome || '');
      setEditResp2Id(opl.tecnico_producao_2_id || null);
      setEditEquipeSel(opl.equipe_id ? { id: opl.equipe_id, nome: opl.equipe_nome, head_line_nome: opl.responsavel_producao } : null);
    }
    if (tipo === 'gerenciar_equipe') abrirGerenciarEquipe(opl);
  };

  const [abaProducao, setAbaProducao] = useState('producao');
  const emRetrabalho = opls.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho');

  // Técnicos únicos presentes na lista atual, para popular o filtro
  const tecnicosDisponiveis = [...new Set(
    opls.map(o => o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao).filter(Boolean)
  )].sort();

  const oplsFiltradas = opls.filter(o => {
    if (filtroStatus !== 'Todos' && o.status_geral !== filtroStatus) return false;
    if (filtroTecnico !== 'Todos') {
      const tec = o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao;
      if (tec !== filtroTecnico) return false;
    }
    if (filtroCliente.trim() && !o.cliente_nome?.toLowerCase().includes(filtroCliente.trim().toLowerCase())) return false;
    if (filtroEntregaDe && (!o.data_prevista_entrega || o.data_prevista_entrega < filtroEntregaDe)) return false;
    if (filtroEntregaAte && (!o.data_prevista_entrega || o.data_prevista_entrega > filtroEntregaAte)) return false;
    if (filtroBusca.trim()) {
      const t = filtroBusca.trim().toLowerCase();
      if (!(o.opl?.toLowerCase().includes(t) || o.chassi?.toLowerCase().includes(t) || o.cliente_nome?.toLowerCase().includes(t))) return false;
    }
    return true;
  });
  // Mesmo destaque usado em outras telas — linha fica com a lateral amarela
  // quando a OP tem alteração não vista por este usuário (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', oplsFiltradas.map(o => o.id), currentUser);

  const filtrosAtivos = filtroBusca || filtroStatus !== 'Todos' || filtroTecnico !== 'Todos' || filtroCliente || filtroEntregaDe || filtroEntregaAte;
  const limparFiltros = () => {
    setFiltroBusca(''); setFiltroStatus('Todos'); setFiltroTecnico('Todos');
    setFiltroCliente(''); setFiltroEntregaDe(''); setFiltroEntregaAte('');
  };

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
        <button style={{flex:1,padding:'8px',background:abaProducao==='equipes'?'#0891b2':'white',color:abaProducao==='equipes'?'white':'#0891b2',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaProducao('equipes')}>🏷️ Equipes</button>
      </div>

      {abaProducao === 'veicular' && <PainelSacVeicular currentUser={currentUser} />}
      {abaProducao === 'agenda' && <CalendarioManutencao currentUser={currentUser} />}
      {abaProducao === 'voucher' && <VoucherServicos currentUser={currentUser} />}
      {abaProducao === 'equipes' && <EquipesSection currentUser={currentUser} />}
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
          <span>Filtros</span>
          {filtrosAtivos && (
            <button className="acn-btn" style={{background:'#94a3b8',fontSize:10,padding:'3px 8px'}} onClick={limparFiltros}>✕ Limpar filtros</button>
          )}
        </div>
        <div className="sec-body">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Buscar (OPL, chassi, cliente)</label>
              <input className="acn-input" style={{width:'100%'}} value={filtroBusca} onChange={e=>setFiltroBusca(e.target.value)} placeholder="Digite para buscar..." />
            </div>
            <div className="form-group">
              <label className="acn-label">Status</label>
              <select className="acn-input" style={{width:'100%'}} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
                <option value="Todos">Todos</option>
                <option value="Aguardando Inicio Producao">Aguardando Início Produção</option>
                <option value="Em Producao">Em Produção</option>
                <option value="Retrabalho">Retrabalho</option>
                <option value="Em Retrabalho">Em Retrabalho</option>
              </select>
            </div>
            <div className="form-group">
              <label className="acn-label">Técnico / Equipe</label>
              <select className="acn-input" style={{width:'100%'}} value={filtroTecnico} onChange={e=>setFiltroTecnico(e.target.value)}>
                <option value="Todos">Todos</option>
                {tecnicosDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="acn-label">Cliente</label>
              <input className="acn-input" style={{width:'100%'}} value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} placeholder="Nome do cliente..." />
            </div>
            <div className="form-group">
              <label className="acn-label">Entrega prevista — de</label>
              <input className="acn-input" type="date" style={{width:'100%'}} value={filtroEntregaDe} onChange={e=>setFiltroEntregaDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Entrega prevista — até</label>
              <input className="acn-input" type="date" style={{width:'100%'}} value={filtroEntregaAte} onChange={e=>setFiltroEntregaAte(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPLs em Producao / Retrabalho ({oplsFiltradas.length}{oplsFiltradas.length !== opls.length ? ` de ${opls.length}` : ''})</span>
          {emRetrabalho.length > 0 && (
            <span style={{fontSize:10,background:'#ef4444',color:'white',padding:'2px 8px',borderRadius:10,fontWeight:700}}>
              🔁 {emRetrabalho.length} em retrabalho
            </span>
          )}
        </div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : oplsFiltradas.length === 0 ? (
            <div className="acn-empty">{opls.length === 0 ? 'Nenhuma OPL em producao no momento.' : 'Nenhuma OPL encontrada para os filtros aplicados.'}</div>
          ) : (
            <table>
              <thead><tr>
                <th></th><th>OPL</th><th>Veículo</th><th>Cliente</th><th>Entrega Prevista</th><th>Qtd</th><th>Tipo Projeto</th><th>Responsavel</th><th>Tempo</th><th>Status</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {(() => {
                  const basesJaRenderizadas = new Set();
                  const itens = [];
                  for (const o of oplsFiltradas) {
                    const base = baseOplDe(o.opl);
                    const irmaos = oplsFiltradas.filter(x => baseOplDe(x.opl) === base);
                    if (irmaos.length > 1) {
                      if (basesJaRenderizadas.has(base)) continue;
                      basesJaRenderizadas.add(base);
                      itens.push({ tipo: 'lote', base, irmaos: [...irmaos].sort((a,b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
                    } else {
                      itens.push({ tipo: 'single', row: o });
                    }
                  }
                  return itens.map(item => {
                    if (item.tipo === 'single') {
                      return <OplRow key={item.row.id} o={item.row} onAction={handleAction} currentUser={currentUser}
                        selecionado={selecionados.has(item.row.id)} onToggleSelecionar={toggleSelecionar}
                        naoLido={oplsNaoLidas.has(String(item.row.id))} />;
                    }
                    const grupo = item;
                    const expandido = !!lotesExpandidos[grupo.base];
                    const qtdAguardando  = grupo.irmaos.filter(o => o.status_geral === 'Aguardando Inicio Producao').length;
                    const qtdEmProducao  = grupo.irmaos.filter(o => o.status_geral === 'Em Producao').length;
                    const qtdRetrabalho  = grupo.irmaos.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho').length;
                    const todosSelecionados = grupo.irmaos.every((o:any) => selecionados.has(o.id));
                    const loteNaoLido = grupo.irmaos.some((o:any) => oplsNaoLidas.has(String(o.id)));
                    return (
                      <React.Fragment key={grupo.base}>
                        <tr style={{background:'#f5f3ff',borderLeft: loteNaoLido ? '4px solid #eab308' : '4px solid #7c3aed'}}>
                          <td style={{textAlign:'center'}}>
                            <input type="checkbox" checked={todosSelecionados} title="Selecionar todas as unidades deste lote"
                              onChange={()=>setSelecionados(prev => {
                                const novo = new Set(prev);
                                grupo.irmaos.forEach((o:any) => { if (todosSelecionados) novo.delete(o.id); else novo.add(o.id); });
                                return novo;
                              })} style={{cursor:'pointer'}} />
                          </td>
                          <td>
                            <strong>🔗 {grupo.base}</strong>
                            <div><span className="acn-badge" style={{background:'#7c3aed'}}>LOTE — {grupo.irmaos.length} unidades</span></div>
                          </td>
                          <td colSpan={8}>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {qtdAguardando > 0 && <span className="acn-badge" style={{background:'#f59e0b'}}>{qtdAguardando} aguardando início</span>}
                              {qtdEmProducao > 0 && <span className="acn-badge" style={{background:'#3b82f6'}}>{qtdEmProducao} em produção</span>}
                              {qtdRetrabalho > 0 && <span className="acn-badge" style={{background:'#ef4444'}}>{qtdRetrabalho} em retrabalho</span>}
                            </div>
                          </td>
                          <td>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                              <button className="acn-btn" style={{background:'#7c3aed',fontSize:10}}
                                onClick={()=>setLotesExpandidos(prev => ({...prev, [grupo.base]: !prev[grupo.base]}))}>
                                {expandido ? `▲ Ocultar` : `▼ Ver ${grupo.irmaos.length} unidades`}
                              </button>
                              <button className="acn-btn" style={{background:'#2563eb',fontSize:10}}
                                onClick={()=>setModalImportarLoteProducao({base:grupo.base,irmaos:grupo.irmaos})}>
                                📥 Importar Técnicos/Equipes
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandido && grupo.irmaos.map(o => (
                          <OplRow key={o.id} o={o} onAction={handleAction} currentUser={currentUser}
                            selecionado={selecionados.has(o.id)} onToggleSelecionar={toggleSelecionar}
                            naoLido={oplsNaoLidas.has(String(o.id))} />
                        ))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnaliseWidget setor="Producao" currentUser={currentUser} />
      <DemandasSetorWidget setor="Producao" cor="#7c3aed" currentUser={currentUser} />
      <OplMovimentadas setor="Producao" />
      <DemandaFooter setor="Producao" />

      {/* MODAL INICIAR */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:440}}>
            <div className="modal-title">▶️ Iniciar Produção — OPL {modalIniciar.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Tipo: {modalIniciar.tipo_projeto} | Chassi: {modalIniciar.chassi || '—'}
            </div>
            {modalIniciar.liberado_divulgacao && (
              <div style={{background:'#faf5ff',border:'1px solid #c4b5fd',borderRadius:4,padding:'7px 10px',marginBottom:10,fontSize:10,color:'#5b21b6'}}>
                📸 <strong>OP liberada para divulgacao pelo Marketing.</strong> Avise o MKT.
              </div>
            )}

            {/* Seletor de modo */}
            <label className="acn-label">Modo de Execução</label>
            <div style={{display:'flex',gap:0,marginBottom:14,borderRadius:6,overflow:'hidden',border:'1.5px solid #d1d5db'}}>
              {(['individual','dupla','equipe'] as const).map(m => (
                <button key={m} onClick={()=>setModoExecucao(m)} style={{
                  flex:1, padding:'7px 4px', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                  background: modoExecucao===m ? '#2563eb' : 'white',
                  color: modoExecucao===m ? 'white' : '#475569',
                  borderRight: m!=='equipe' ? '1px solid #d1d5db' : 'none',
                }}>
                  {m==='individual'?'👤 Individual':m==='dupla'?'👥 Dupla':'🏷️ Equipe'}
                </button>
              ))}
            </div>

            {/* Individual */}
            {modoExecucao === 'individual' && (
              <>
                <label className="acn-label">Técnico Responsável</label>
                <ColaboradorSelect value={respNome}
                  onChange={nome=>{ setRespNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId(c?.id||null); }}
                  placeholder="Selecione o técnico"
                  className="acn-input" style={{width:'100%',marginBottom:12}} autoFocus />
              </>
            )}

            {/* Dupla */}
            {modoExecucao === 'dupla' && (
              <>
                <label className="acn-label">Técnico 1</label>
                <ColaboradorSelect value={respNome}
                  onChange={nome=>{ setRespNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId(c?.id||null); }}
                  placeholder="Selecione o 1º técnico"
                  className="acn-input" style={{width:'100%',marginBottom:8}} />
                <label className="acn-label">Técnico 2</label>
                <ColaboradorSelect value={respNome2}
                  onChange={nome=>{ setRespNome2(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId2(c?.id||null); }}
                  placeholder="Selecione o 2º técnico"
                  className="acn-input" style={{width:'100%',marginBottom:12}} />
              </>
            )}

            {/* Equipe */}
            {modoExecucao === 'equipe' && (
              <>
                <label className="acn-label">Selecione a Equipe (pelo Head Line)</label>
                {equipes.length === 0 ? (
                  <div style={{fontSize:10,color:'#ef4444',marginBottom:12}}>Nenhuma equipe cadastrada. Vá em 🏷️ Equipes para criar.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                    {equipes.map(eq => (
                      <div key={eq.id} onClick={()=>setEquipeSel(eq)} style={{
                        padding:'9px 12px', borderRadius:6, cursor:'pointer', fontSize:11,
                        border: equipeSel?.id===eq.id ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                        background: equipeSel?.id===eq.id ? '#eff6ff' : 'white',
                      }}>
                        <strong>{eq.nome}</strong>
                        <span style={{color:'#475569',marginLeft:8,fontSize:10}}>Head: {eq.head_line_nome}</span>
                        {(eq.membros||[]).length>0 && (
                          <span style={{color:'#6366f1',marginLeft:8,fontSize:9}}>+{eq.membros.length} membros</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1}} onClick={iniciarProducao}>▶️ INICIAR PRODUÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR RESPONSÁVEL */}
      {modalEditResp && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:440}}>
            <div className="modal-title">✏️ Editar Responsável — OPL {modalEditResp.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Atual: <strong>{modalEditResp.responsavel_producao || '—'}</strong>
              {modalEditResp.tecnico_producao_2_nome && <> + <strong>{modalEditResp.tecnico_producao_2_nome}</strong></>}
              {modalEditResp.equipe_nome && <> · Equipe: <strong>{modalEditResp.equipe_nome}</strong></>}
            </div>

            <label className="acn-label">Modo de Execução</label>
            <div style={{display:'flex',gap:0,marginBottom:14,borderRadius:6,overflow:'hidden',border:'1.5px solid #d1d5db'}}>
              {(['individual','dupla','equipe'] as const).map(m => (
                <button key={m} onClick={()=>setEditModo(m)} style={{
                  flex:1, padding:'7px 4px', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                  background: editModo===m ? '#6366f1' : 'white',
                  color: editModo===m ? 'white' : '#475569',
                  borderRight: m!=='equipe' ? '1px solid #d1d5db' : 'none',
                }}>
                  {m==='individual'?'👤 Individual':m==='dupla'?'👥 Dupla':'🏷️ Equipe'}
                </button>
              ))}
            </div>

            {editModo === 'individual' && (
              <>
                <label className="acn-label">Técnico Responsável</label>
                <ColaboradorSelect value={editResp1Nome}
                  onChange={nome=>{ setEditResp1Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp1Id(c?.id||null); }}
                  placeholder="Selecione o técnico"
                  className="acn-input" style={{width:'100%',marginBottom:12}} />
              </>
            )}
            {editModo === 'dupla' && (
              <>
                <label className="acn-label">Técnico 1</label>
                <ColaboradorSelect value={editResp1Nome}
                  onChange={nome=>{ setEditResp1Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp1Id(c?.id||null); }}
                  placeholder="Selecione o 1º técnico"
                  className="acn-input" style={{width:'100%',marginBottom:8}} />
                <label className="acn-label">Técnico 2</label>
                <ColaboradorSelect value={editResp2Nome}
                  onChange={nome=>{ setEditResp2Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp2Id(c?.id||null); }}
                  placeholder="Selecione o 2º técnico"
                  className="acn-input" style={{width:'100%',marginBottom:12}} />
              </>
            )}
            {editModo === 'equipe' && (
              <>
                <label className="acn-label">Selecione a Equipe</label>
                {equipes.length === 0 ? (
                  <div style={{fontSize:10,color:'#ef4444',marginBottom:12}}>Nenhuma equipe cadastrada.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                    {equipes.map(eq => (
                      <div key={eq.id} onClick={()=>setEditEquipeSel(eq)} style={{
                        padding:'9px 12px', borderRadius:6, cursor:'pointer', fontSize:11,
                        border: editEquipeSel?.id===eq.id ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                        background: editEquipeSel?.id===eq.id ? '#eef2ff' : 'white',
                      }}>
                        <strong>{eq.nome}</strong>
                        <span style={{color:'#475569',marginLeft:8,fontSize:10}}>Head: {eq.head_line_nome}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#6366f1',flex:1}} onClick={editarResponsavel}>✏️ SALVAR ALTERAÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEditResp(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR EQUIPE — responsáveis/apoios livres, pós-início */}
      {modalGerenciarEquipe && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">👥 Equipe — OPL {modalGerenciarEquipe.opl}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
              Responsáveis recebem comissão pelo próprio percentual configurado. Apoios recebem 0,1% fixo
              do valor de mão de obra desta OP, além do que os responsáveis já recebem.
            </div>

            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>RESPONSÁVEIS</div>
            {equipeAtual.filter(m=>m.papel==='responsavel').length === 0 ? (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:10}}>Nenhum responsável ainda.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                {equipeAtual.filter(m=>m.papel==='responsavel').map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'6px 10px',background:'#eef2ff',borderRadius:6,fontSize:11}}>
                    <span>{m.tecnico_nome}</span>
                    <button onClick={()=>removerMembroEquipe(m)}
                      style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              <ColaboradorSelect value={novoRespNome}
                onChange={nome=>{ setNovoRespNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoRespId(c?.id||null); }}
                placeholder="Adicionar responsável..." className="acn-input" style={{flex:1}} />
              <button className="acn-btn" style={{background:'#6366f1',fontSize:10}} onClick={()=>adicionarMembroEquipe('responsavel')}>+ Add</button>
            </div>

            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>APOIOS (0,1% da mão de obra)</div>
            {equipeAtual.filter(m=>m.papel==='apoio').length === 0 ? (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:10}}>Nenhum apoio ainda.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                {equipeAtual.filter(m=>m.papel==='apoio').map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'6px 10px',background:'#f0fdf4',borderRadius:6,fontSize:11}}>
                    <span>{m.tecnico_nome}</span>
                    <button onClick={()=>removerMembroEquipe(m)}
                      style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              <ColaboradorSelect value={novoApoioNome}
                onChange={nome=>{ setNovoApoioNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoApoioId(c?.id||null); }}
                placeholder="Adicionar apoio..." className="acn-input" style={{flex:1}} />
              <button className="acn-btn" style={{background:'#16a34a',fontSize:10}} onClick={()=>adicionarMembroEquipe('apoio')}>+ Add</button>
            </div>

            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalGerenciarEquipe(null)}>Fechar</button>
          </div>
        </div>
      )}

      {/* MODAL VER OPL */}
      {modalVerOpl && <OplDetalheModal opl={modalVerOpl} onClose={()=>setModalVerOpl(null)} currentUser={currentUser} />}

      {modalImportarLoteProducao && (
        <ModalImportarTecnicosEquipe
          base={modalImportarLoteProducao.base}
          irmaos={modalImportarLoteProducao.irmaos}
          equipes={equipes}
          colaboradoresList={colaboradoresList}
          currentUser={currentUser}
          onClose={()=>setModalImportarLoteProducao(null)}
          onImportado={()=>{fetchAll();setSelecionados(new Set());}}
        />
      )}

      {/* BARRA DE AÇÃO EM LOTE — seleção livre por checkbox, não precisa ser do mesmo lote/base */}
      {selecionados.size > 0 && (
        <div style={{position:'fixed',left:'50%',transform:'translateX(-50%)',bottom:16,zIndex:1500,
          background:'#1e293b',color:'white',borderRadius:8,padding:'10px 16px',boxShadow:'0 8px 24px rgba(0,0,0,.3)',
          display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',maxWidth:'92vw'}}>
          <strong style={{fontSize:12}}>{selecionados.size} selecionada{selecionados.size!==1?'s':''}</strong>
          <button className="acn-btn" style={{background:'#2563eb',fontSize:10}} disabled={aplicandoIniciarLote} onClick={iniciarProducaoEmLote}>
            {aplicandoIniciarLote ? 'Aplicando...' : '▶️ Iniciar Produção em Lote'}
          </button>
          <button className="acn-btn" style={{background:'#7c3aed',fontSize:10}}
            onClick={()=>setModalImportarLoteProducao({base:'Seleção', irmaos: opls.filter((o:any)=>selecionados.has(o.id))})}>
            📥 Atribuir Técnicos/Equipes
          </button>
          <button className="acn-btn" style={{background:'#22c55e',fontSize:10}} disabled={aplicandoIniciarLote} onClick={liberarChecklistEmLote}>
            {aplicandoIniciarLote ? 'Aplicando...' : '✅ Liberar Checklist (CQ) em Lote'}
          </button>
          <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>setSelecionados(new Set())}>
            ✕ Limpar seleção
          </button>
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

      {/* MODAL ACOMPANHAMENTO DA OP */}
      {modalAcomp && (
        <OplAcompModal
          referenciaId={modalAcomp.opl || String(modalAcomp.id)}
          referenciaDesc={`OP ${modalAcomp.opl || '—'}`}
          referenciaType="op"
          setor="Producao"
          currentUser={currentUser}
          onClose={() => setModalAcomp(null)}
        />
      )}
    </div>}
    </div>
  );
}
