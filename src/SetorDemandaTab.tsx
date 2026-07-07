// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';

// ─── Horas Úteis (Seg-Sex 8:00–17:30) ────────────────────────────────────────
function horasUteis(inicio, fim) {
  if (!inicio || !fim) return 0;
  const start = new Date(inicio);
  const end   = new Date(fim);
  if (end <= start) return 0;
  let total = 0;
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  while (d < end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const dI = new Date(d); dI.setHours(8, 0, 0, 0);
      const dF = new Date(d); dF.setHours(17, 30, 0, 0);
      const eI = new Date(Math.max(start.getTime(), dI.getTime()));
      const eF = new Date(Math.min(end.getTime(),   dF.getTime()));
      if (eF > eI) total += (eF.getTime() - eI.getTime()) / 3600000;
    }
    d.setDate(d.getDate() + 1);
  }
  return total;
}

function fmtHHMMSS(horas) {
  const total = Math.max(0, Math.floor(horas * 3600));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// SAC OS status → cor
const SAC_STATUS_COR = {
  'Diagnóstico':'#0891b2','Orçamento Pronto':'#7c3aed','Orç. Enviado':'#f59e0b',
  'Aprovado':'#22c55e','Reprovado':'#ef4444','Em Execução':'#8b5cf6',
  'Concluído':'#0d9488','Entregue':'#166534',
};

// ─── Relatórios do Setor ──────────────────────────────────────────────────────
function RelatoriosSetor({ setor, cor }) {
  const [filtroInicio, setFiltroInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [filtroFim, setFiltroFim] = useState(new Date().toISOString().split('T')[0]);
  const [dados, setDados]     = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [abaRelat, setAbaRelat]    = useState('resumo');

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('demandas_setoriais').select('*')
      .eq('setor_destino', setor)
      .gte('data_abertura', filtroInicio + 'T00:00:00')
      .lte('data_abertura', filtroFim + 'T23:59:59')
      .order('data_abertura', { ascending: false });
    setDados(data || []);
    setCarregando(false);
  };

  const fmtDt   = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH    = (h) => h != null ? `${Number(h).toFixed(1)}h` : '—';

  const agora      = new Date();
  const pendentes  = dados.filter(d => d.status === 'Pendente');
  const andamento  = dados.filter(d => d.status === 'Em Andamento');
  const concluidos = dados.filter(d => d.status === 'Concluido');
  const atrasados  = dados.filter(d => {
    if (d.status === 'Concluido') return false;
    return (agora - new Date(d.data_abertura || 0)) / 3600000 > 48;
  });

  const tempoMedio = (() => {
    const vals = concluidos.map(d => d.tempo_execucao_horas).filter(v => v != null && v > 0);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  })();

  const porOpl  = dados.reduce((acc,d)=>{ const k=d.numero_opl||'Sem OPL'; if(!acc[k]) acc[k]=[]; acc[k].push(d); return acc; }, {});
  const porResp = dados.reduce((acc,d)=>{ const k=d.responsavel_nome||'Nao iniciada'; if(!acc[k]) acc[k]=[]; acc[k].push(d); return acc; }, {});
  const corS    = (s) => ({Pendente:'#f59e0b','Em Andamento':'#3b82f6',Concluido:'#22c55e'})[s]||'#94a3b8';

  const total = dados.length;

  return (
    <div className="sec-card">
      <div className="sec-hdr" style={{background:'#1e293b'}}><span style={{color:'white'}}>Relatórios — {setor}</span></div>
      <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
        <div className="form-row" style={{marginBottom:0}}>
          <div className="form-group"><label className="acn-label">De</label>
            <input type="date" className="acn-input" style={{width:'100%'}} value={filtroInicio} onChange={e=>setFiltroInicio(e.target.value)} /></div>
          <div className="form-group"><label className="acn-label">Até</label>
            <input type="date" className="acn-input" style={{width:'100%'}} value={filtroFim} onChange={e=>setFiltroFim(e.target.value)} /></div>
          <div style={{display:'flex',alignItems:'flex-end'}}>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:4,flexWrap:'wrap',marginLeft:'auto'}}>
            {[{id:'resumo',label:'Resumo'},{id:'lista',label:'Lista'},{id:'atrasados',label:'Atrasados'},{id:'por_opl',label:'Por OPL'},{id:'por_resp',label:'Por Responsável'}].map(a=>(
              <button key={a.id} className="acn-btn" style={{background:abaRelat===a.id?'#1e293b':'#94a3b8',fontSize:10,padding:'4px 10px'}} onClick={()=>setAbaRelat(a.id)}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {[
            {label:'Total',          val:total,              cor:'#2563eb'},
            {label:'Pendentes',      val:pendentes.length,   cor:'#f59e0b'},
            {label:'Em Andamento',   val:andamento.length,   cor:'#3b82f6'},
            {label:'Concluídas',     val:concluidos.length,  cor:'#22c55e'},
            {label:'Atrasadas',      val:atrasados.length,   cor:'#ef4444'},
            {label:'Tempo Médio (útil)', val:tempoMedio?fmtH(tempoMedio):'—', cor:tempoMedio&&tempoMedio<=24?'#22c55e':tempoMedio?'#f59e0b':'#94a3b8'},
          ].map(c=>(
            <div key={c.label} style={{flex:'1 1 120px',minWidth:100,background:'white',border:`1px solid #e2e8f0`,borderTop:`3px solid ${c.cor}`,borderRadius:4,padding:'8px 10px'}}>
              <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>{c.label}</div>
              <div style={{fontSize:20,fontWeight:700,color:c.cor}}>{carregando?'...':c.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sec-body" style={{overflowX:'auto'}}>
        {carregando ? <div className="acn-empty">Carregando...</div> : (
          abaRelat==='lista' ? (
            dados.length===0 ? <div className="acn-empty">Nenhuma demanda no período.</div> : (
              <table><thead><tr><th>Data</th><th>OPL</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Início</th><th>Conclusão</th><th>Tempo Útil</th></tr></thead>
              <tbody>{dados.map(d=>(
                <tr key={d.id}>
                  <td>{fmtDt(d.data_abertura)}</td><td>{d.numero_opl||'—'}</td>
                  <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                  <td><span className="acn-badge" style={{background:corS(d.status)}}>{d.status}</span></td>
                  <td>{d.responsavel_nome||'—'}</td><td>{fmtDtHr(d.data_inicio)}</td>
                  <td>{fmtDtHr(d.data_conclusao)}</td><td>{fmtH(d.tempo_execucao_horas)}</td>
                </tr>
              ))}</tbody></table>
            )
          ) : abaRelat==='atrasados' ? (
            atrasados.length===0 ? <div className="acn-empty" style={{color:'#22c55e'}}>Nenhuma atrasada.</div> : (
              <table><thead><tr><th>Data</th><th>OPL</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Aberta há (h)</th></tr></thead>
              <tbody>{atrasados.map(d=>(
                <tr key={d.id} style={{background:'#fff5f5'}}>
                  <td style={{color:'#dc2626',fontWeight:600}}>{fmtDt(d.data_abertura)}</td>
                  <td>{d.numero_opl||'—'}</td>
                  <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                  <td><span className="acn-badge" style={{background:'#ef4444'}}>{d.status}</span></td>
                  <td>{d.responsavel_nome||'Nao iniciada'}</td>
                  <td><strong style={{color:'#dc2626'}}>{((agora-new Date(d.data_abertura))/3600000).toFixed(0)}h</strong></td>
                </tr>
              ))}</tbody></table>
            )
          ) : abaRelat==='por_opl' ? (
            Object.entries(porOpl).map(([opl,itens])=>(
              <div key={opl} style={{marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:11,background:'#f1f5f9',padding:'4px 10px',borderRadius:4,marginBottom:4,display:'flex',justifyContent:'space-between'}}>
                  <span>OPL: {opl}</span>
                  <span style={{color:'#64748b'}}>{itens.length} dem. | <span style={{color:'#22c55e'}}>{itens.filter(i=>i.status==='Concluido').length} conc.</span></span>
                </div>
                <table><thead><tr><th>Descrição</th><th>Status</th><th>Responsável</th><th>Abertura</th><th>Tempo Útil</th></tr></thead>
                <tbody>{itens.map(d=>(
                  <tr key={d.id}>
                    <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                    <td><span className="acn-badge" style={{background:corS(d.status)}}>{d.status}</span></td>
                    <td>{d.responsavel_nome||'—'}</td><td>{fmtDt(d.data_abertura)}</td>
                    <td>{fmtH(d.tempo_execucao_horas)}</td>
                  </tr>
                ))}</tbody></table>
              </div>
            ))
          ) : abaRelat==='por_resp' ? (
            Object.entries(porResp).sort((a,b)=>b[1].length-a[1].length).map(([resp,itens])=>{
              const conc=itens.filter(i=>i.status==='Concluido');
              const media=conc.length?conc.map(i=>i.tempo_execucao_horas||0).reduce((a,b)=>a+b,0)/conc.length:null;
              return (
                <div key={resp} style={{marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:11,background:'#f1f5f9',padding:'4px 10px',borderRadius:4,marginBottom:4,display:'flex',justifyContent:'space-between',flexWrap:'wrap'}}>
                    <span>{resp}</span>
                    <span style={{color:'#64748b',fontSize:10}}>{itens.length} total | <span style={{color:'#22c55e'}}>{conc.length} conc.</span>{media?<span style={{color:'#2563eb'}}> | média: {fmtH(media)}</span>:''}</span>
                  </div>
                  <table><thead><tr><th>OPL</th><th>Descrição</th><th>Status</th><th>Abertura</th><th>Tempo Útil</th></tr></thead>
                  <tbody>{itens.map(d=>(
                    <tr key={d.id}>
                      <td>{d.numero_opl||'—'}</td>
                      <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                      <td><span className="acn-badge" style={{background:corS(d.status)}}>{d.status}</span></td>
                      <td>{fmtDt(d.data_abertura)}</td><td>{fmtH(d.tempo_execucao_horas)}</td>
                    </tr>
                  ))}</tbody></table>
                </div>
              );
            })
          ) : (
            /* RESUMO */
            dados.length===0 ? <div className="acn-empty">Nenhuma demanda no período.</div> : (
              <div>
                <div style={{fontWeight:700,color:'#1e293b',marginBottom:6,fontSize:11}}>Distribuição por Status</div>
                {[{label:'Pendente',itens:pendentes,cor:'#f59e0b'},{label:'Em Andamento',itens:andamento,cor:'#3b82f6'},{label:'Concluído',itens:concluidos,cor:'#22c55e'},{label:'Atrasado (>48h)',itens:atrasados,cor:'#ef4444'}].map(g=>(
                  <div key={g.label} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{minWidth:140,fontSize:11}}>{g.label}</span>
                    <div style={{flex:1,background:'#f1f5f9',borderRadius:3,height:16,overflow:'hidden'}}>
                      <div style={{width:total>0?`${(g.itens.length/total*100).toFixed(0)}%`:'0%',height:'100%',background:g.cor,transition:'width 0.4s'}} />
                    </div>
                    <span style={{minWidth:60,textAlign:'right',fontWeight:700,color:g.cor}}>{g.itens.length} ({total>0?(g.itens.length/total*100).toFixed(0):0}%)</span>
                  </div>
                ))}
                {tempoMedio!=null&&<div style={{marginTop:8,padding:'8px 12px',background:'#f0fdf4',borderRadius:4,border:'1px solid #bbf7d0',fontSize:11}}>Tempo médio útil: <strong style={{color:'#16a34a'}}>{fmtH(tempoMedio)}</strong> ({concluidos.length} amostras)</div>}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SetorDemandaTab({ currentUser, setor, cor }) {
  const [demandas, setDemandas]       = useState([]);
  const [sacOrdensMap, setSacOrdensMap] = useState<Record<string,any>>({});
  const [loading, setLoading]         = useState(false);
  const [filtro, setFiltro]           = useState('Pendente');
  const [abaAtiva, setAbaAtiva]       = useState('demandas');
  const [tick, setTick]               = useState(0);

  // Modais demanda
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelIniciar, setResponsavelIniciar] = useState('');
  const [modalObs, setModalObs]         = useState(null);
  const [obsTexto, setObsTexto]         = useState('');

  // Modal Finalizar Orçamento (Lab SAC)
  const [modalFinalizarOrc, setModalFinalizarOrc]     = useState(null);
  const [finalizarOrcForm, setFinalizarOrcForm] = useState({ observacoes:'', valor:'', condicoes:'' });

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(fetchDemandas, 30000);
    return () => clearInterval(t);
  }, [filtro, setor]);
  useEffect(() => { const t = setInterval(()=>setTick(p=>p+1), 1000); return ()=>clearInterval(t); }, []);

  const fetchDemandas = async () => {
    setLoading(true);
    let q = supabase.from('demandas_setoriais').select('*').eq('setor_destino', setor).order('data_abertura', { ascending: false });
    if (filtro !== 'Todos') q = q.eq('status', filtro);
    const { data: lista } = await q;
    setDemandas(lista || []);

    // Para Laboratório: buscar OS SAC vinculadas
    if (setor === 'Laboratorio') {
      const sacIds = (lista||[]).filter(d=>d.sac_os_id).map(d=>d.sac_os_id);
      if (sacIds.length > 0) {
        const { data: osData } = await supabase.from('sac_ordens_servico')
          .select('id, numero_os, status, valor_orcamento, condicoes_pagamento, data_abertura, data_inicio_execucao_lab, observacoes_lab')
          .in('id', sacIds);
        const map: Record<string,any> = {};
        (osData||[]).forEach(o => { map[o.id] = o; });
        setSacOrdensMap(map);
      } else {
        setSacOrdensMap({});
      }
    }
    setLoading(false);
  };

  // ── Timer de horas úteis ──────────────────────────────────────────────────
  const timerUteis = (d) => {
    if (d.status !== 'Em Andamento' || !d.data_inicio) return null;
    const fim = d.pausado && d.data_pausa ? new Date(d.data_pausa) : new Date();
    const h = Math.max(0, horasUteis(new Date(d.data_inicio), fim) - (d.tempo_pausado_horas||0));
    return fmtHHMMSS(h);
  };

  // ── INICIAR ───────────────────────────────────────────────────────────────
  const abrirIniciar = (d) => { setModalIniciar(d); setResponsavelIniciar(currentUser?.nome||''); };

  const confirmarIniciar = async () => {
    if (!responsavelIniciar.trim()) { alert('Informe o responsável!'); return; }
    const d = modalIniciar;
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda||[]), { texto:`Iniciado. Responsável: ${responsavelIniciar}`, usuario:currentUser?.nome, hora:agora }];
    await supabase.from('demandas_setoriais').update({ status:'Em Andamento', data_inicio:agora, responsavel_nome:responsavelIniciar, logs_demanda:logs }).eq('id',d.id);

    // SAC: atualiza OS
    if (d.sac_os_id) {
      if (d.sac_fase === 'execucao') {
        await supabase.from('sac_ordens_servico').update({ data_inicio_execucao_lab:agora, status:'Em Execução', atualizado_em:agora }).eq('id',d.sac_os_id);
      } else if (d.sac_fase === 'diagnostico') {
        await supabase.from('sac_ordens_servico').update({ data_inicio_diagnostico:agora, atualizado_em:agora }).eq('id',d.sac_os_id);
      }
    }

    setModalIniciar(null); setResponsavelIniciar(''); fetchDemandas();
  };

  // ── OBSERVAÇÃO ────────────────────────────────────────────────────────────
  const addObservacao = async () => {
    if (!obsTexto.trim()) return;
    const d = modalObs;
    const logs = [...(d.logs_demanda||[]), { texto:obsTexto, usuario:currentUser?.nome, hora:new Date().toISOString() }];
    await supabase.from('demandas_setoriais').update({ observacoes_execucao:obsTexto, logs_demanda:logs }).eq('id',d.id);

    // SAC: atualiza observacoes_lab na OS
    if (d.sac_os_id) {
      const os = sacOrdensMap[d.sac_os_id];
      const novaObs = os?.observacoes_lab ? `${os.observacoes_lab}\n[${new Date().toLocaleString('pt-BR')}] ${obsTexto}` : obsTexto;
      await supabase.from('sac_ordens_servico').update({ observacoes_lab:novaObs, atualizado_em:new Date().toISOString() }).eq('id',d.sac_os_id);
    }

    setObsTexto(''); setModalObs(null); fetchDemandas();
  };

  // ── CONCLUIR (demanda regular) ────────────────────────────────────────────
  const concluir = async (d) => {
    if (!window.confirm('Confirmar conclusão?')) return;
    const agora = new Date().toISOString();
    const inicio = d.data_inicio ? new Date(d.data_inicio) : new Date(d.data_abertura||agora);
    const tempo  = Math.max(0, horasUteis(inicio, new Date()) - (d.tempo_pausado_horas||0));
    const logs = [...(d.logs_demanda||[]), { texto:`Concluído. Tempo útil: ${tempo.toFixed(1)}h`, usuario:currentUser?.nome, hora:agora }];
    await supabase.from('demandas_setoriais').update({ status:'Concluido', data_conclusao:agora, tempo_execucao_horas:tempo, logs_demanda:logs }).eq('id',d.id);

    // SAC execução: atualiza OS
    if (d.sac_os_id && d.sac_fase === 'execucao') {
      await supabase.from('sac_ordens_servico').update({
        status:'Concluído', data_finalizacao_execucao:agora, kpi_execucao_horas:tempo, atualizado_em:agora,
      }).eq('id',d.sac_os_id);
    }

    fetchDemandas();
  };

  // ── PAUSAR / RETOMAR ──────────────────────────────────────────────────────
  const pausar = async (d) => {
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda||[]), { texto:'Tarefa pausada manualmente.', usuario:currentUser?.nome, hora:agora }];
    await supabase.from('demandas_setoriais').update({ pausado:true, data_pausa:agora, logs_demanda:logs }).eq('id',d.id);
    fetchDemandas();
  };

  const retomar = async (d) => {
    const agora = new Date().toISOString();
    const horasPausadas = d.data_pausa ? horasUteis(new Date(d.data_pausa), new Date()) : 0;
    const novoTotal = (d.tempo_pausado_horas||0) + horasPausadas;
    const logs = [...(d.logs_demanda||[]), { texto:`Tarefa retomada. Pausa: ${horasPausadas.toFixed(2)}h úteis.`, usuario:currentUser?.nome, hora:agora }];
    await supabase.from('demandas_setoriais').update({ pausado:false, data_pausa:null, tempo_pausado_horas:novoTotal, logs_demanda:logs }).eq('id',d.id);
    fetchDemandas();
  };

  // ── FINALIZAR ORÇAMENTO (Lab SAC diagnóstico) ────────────────────────────
  const finalizarOrcamento = async () => {
    if (!finalizarOrcForm.valor) { alert('Informe o valor do orçamento!'); return; }
    const d  = modalFinalizarOrc;
    const os = sacOrdensMap[d.sac_os_id];
    const agora = new Date().toISOString();

    // KPI1: da abertura da OS até agora
    const kpi1 = horasUteis(new Date(os.data_abertura||d.data_abertura), new Date()) - (d.tempo_pausado_horas||0);
    const valorNum = parseFloat(finalizarOrcForm.valor.replace(',','.'));

    // Atualiza OS
    await supabase.from('sac_ordens_servico').update({
      status: 'Orçamento Pronto',
      observacoes_lab: finalizarOrcForm.observacoes || null,
      valor_orcamento: valorNum,
      condicoes_pagamento: finalizarOrcForm.condicoes || null,
      data_finalizacao_orcamento: agora,
      kpi_orcamento_horas: kpi1,
      atualizado_em: agora,
    }).eq('id', os.id);

    // Conclui demanda de diagnóstico
    const logs = [...(d.logs_demanda||[]), { texto:`Orçamento finalizado. Valor: R$ ${finalizarOrcForm.valor}. KPI elaboração: ${kpi1.toFixed(1)}h úteis.`, usuario:currentUser?.nome, hora:agora }];
    await supabase.from('demandas_setoriais').update({
      status:'Concluido', data_conclusao:agora, tempo_execucao_horas:kpi1,
      observacoes_execucao: finalizarOrcForm.observacoes||null, logs_demanda:logs,
    }).eq('id',d.id);

    setModalFinalizarOrc(null); setFinalizarOrcForm({ observacoes:'', valor:'', condicoes:'' });
    fetchDemandas();
  };

  // ── HELPERS ───────────────────────────────────────────────────────────────
  const corPrioridade = (p) => ({Alta:'#ef4444',Media:'#f59e0b',Baixa:'#22c55e',Normal:'#94a3b8'})[p]||'#94a3b8';
  const statusCor = { Pendente:'#f59e0b','Em Andamento':'#3b82f6',Concluido:'#22c55e' };
  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH  = (h) => h != null ? `${Number(h).toFixed(1)}h úteis` : '—';

  const pendentes = demandas.filter(d=>d.status==='Pendente').length;
  const andamento = demandas.filter(d=>d.status==='Em Andamento').length;
  const tempos    = demandas.filter(d=>d.tempo_execucao_horas).map(d=>d.tempo_execucao_horas);
  const mediaT    = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : null;

  // ── Badges e row style para SAC ───────────────────────────────────────────
  const sacOs = (d) => d.sac_os_id ? sacOrdensMap[d.sac_os_id] : null;
  const sacRowBg = (d, isAjuste) => {
    const os = sacOs(d);
    if (os) {
      if (os.status==='Reprovado') return '#fef2f2';
      if (['Aprovado','Em Execução'].includes(os.status) && d.sac_fase==='execucao') return '#eff6ff';
      if (['Concluído','Entregue'].includes(os.status)) return '#f0fdf4';
    }
    if (isAjuste) return d.status==='Em Andamento' ? '#fefce8' : '#fffbeb';
    return undefined;
  };

  const sacBadge = (d) => {
    const os = sacOs(d);
    if (!os) return null;
    const bg = SAC_STATUS_COR[os.status]||'#94a3b8';
    return <span className="acn-badge" style={{background:bg,fontSize:8,display:'block',marginBottom:2}}>{os.numero_os}</span>;
  };

  const sacFlagBadge = (d) => {
    const os = sacOs(d);
    if (!os) return null;
    if (os.status==='Reprovado') return <span className="acn-badge" style={{background:'#ef4444',fontSize:8}}>REPROVADO</span>;
    if (['Aprovado','Em Execução'].includes(os.status) && d.sac_fase==='execucao') return <span className="acn-badge" style={{background:'#22c55e',fontSize:8}}>APROVADO</span>;
    if (['Concluído','Entregue'].includes(os.status)) return <span className="acn-badge" style={{background:'#166534',fontSize:8}}>PRONTO</span>;
    if (d.sac_fase==='diagnostico') return <span className="acn-badge" style={{background:'#0891b2',fontSize:8}}>DIAGNÓSTICO</span>;
    return null;
  };

  // ── Ações por linha ───────────────────────────────────────────────────────
  const renderAcoes = (d) => {
    const isAjuste = d.descricao?.startsWith('[AJUSTE]');
    const os = sacOs(d);

    // SAC diagnóstico
    if (d.sac_os_id && d.sac_fase === 'diagnostico') {
      if (d.status === 'Pendente')
        return [<button key="ini" className="acn-btn" style={{background:'#0891b2'}} onClick={()=>abrirIniciar(d)}>INICIAR DIAGNÓSTICO</button>];
      if (d.status === 'Em Andamento')
        return [
          <button key="obs" className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>OBS</button>,
          <button key="orc" className="acn-btn" style={{background:'#7c3aed',fontSize:10}} onClick={()=>{setModalFinalizarOrc(d);setFinalizarOrcForm({observacoes:d.observacoes_execucao||'',valor:'',condicoes:''});}}>FINALIZAR ORÇAMENTO</button>,
          d.pausado
            ? <button key="ret" className="acn-btn" style={{background:'#16a34a',fontSize:10}} onClick={()=>retomar(d)}>▶ RETOMAR</button>
            : <button key="pau" className="acn-btn" style={{background:'#64748b',fontSize:10}} onClick={()=>pausar(d)}>⏸ PAUSAR</button>,
        ];
      if (d.status === 'Concluido')
        return [<button key="log" className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>VER LOG</button>];
    }

    // SAC execução
    if (d.sac_os_id && d.sac_fase === 'execucao') {
      if (d.status === 'Pendente' && os?.status !== 'Reprovado')
        return [<button key="ini" className="acn-btn" style={{background:'#22c55e'}} onClick={()=>abrirIniciar(d)}>INICIAR REPARO</button>];
      if (d.status === 'Em Andamento')
        return [
          <button key="obs" className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>OBS</button>,
          <button key="conc" className="acn-btn" style={{background:'#0d9488'}} onClick={()=>concluir(d)}>CONCLUIR REPARO</button>,
          d.pausado
            ? <button key="ret" className="acn-btn" style={{background:'#16a34a',fontSize:10}} onClick={()=>retomar(d)}>▶ RETOMAR</button>
            : <button key="pau" className="acn-btn" style={{background:'#64748b',fontSize:10}} onClick={()=>pausar(d)}>⏸ PAUSAR</button>,
        ];
      if (d.status === 'Concluido')
        return [<button key="log" className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>VER LOG</button>];
      // Reprovado
      if (os?.status === 'Reprovado')
        return [<button key="log" className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>VER LOG</button>];
    }

    // Demanda regular
    if (d.status === 'Pendente')
      return [<button key="ini" className="acn-btn" style={{background: isAjuste?'#f59e0b':(cor||'#1e293b')}} onClick={()=>abrirIniciar(d)}>INICIAR</button>];
    if (d.status === 'Em Andamento')
      return [
        <button key="obs"  className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>OBS</button>,
        <button key="conc" className="acn-btn" style={{background:'#22c55e'}} onClick={()=>concluir(d)}>CONCLUIR</button>,
        d.pausado
          ? <button key="ret" className="acn-btn" style={{background:'#16a34a',fontSize:10}} onClick={()=>retomar(d)}>▶ RETOMAR</button>
          : <butto