// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';


// ---- Painel de Relatorios do Setor ----
function RelatoriosSetor({ setor, cor }) {
  const [filtroInicio, setFiltroInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [filtroFim, setFiltroFim] = useState(new Date().toISOString().split('T')[0]);
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [abaRelat, setAbaRelat] = useState('resumo');

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setCarregando(true);
    const ini = filtroInicio + 'T00:00:00';
    const fim = filtroFim + 'T23:59:59';
    const { data } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('setor_destino', setor)
      .gte('data_abertura', ini)
      .lte('data_abertura', fim)
      .order('data_abertura', { ascending: false });
    setDados(data || []);
    setCarregando(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h != null ? `${Number(h).toFixed(1)}h` : '—';

  // Calculos
  const total     = dados.length;
  const pendentes = dados.filter(d => d.status === 'Pendente');
  const andamento = dados.filter(d => d.status === 'Em Andamento');
  const concluidos= dados.filter(d => d.status === 'Concluido');

  // Atrasados: Em Andamento ou Pendente criados há mais de 48h sem conclusao
  const agora = new Date();
  const atrasados = dados.filter(d => {
    if (d.status === 'Concluido') return false;
    const abertura = new Date(d.data_abertura || d.created_at || 0);
    return (agora - abertura) / 3600000 > 48;
  });

  const tempoMedio = (() => {
    const vals = concluidos.map(d => d.tempo_execucao_horas).filter(v => v != null && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a,b) => a+b, 0) / vals.length;
  })();

  // Agrupado por OPL
  const porOpl = dados.reduce((acc, d) => {
    const chave = d.numero_opl || 'Sem OPL';
    if (!acc[chave]) acc[chave] = [];
    acc[chave].push(d);
    return acc;
  }, {});

  // Agrupado por responsavel
  const porResp = dados.reduce((acc, d) => {
    const chave = d.responsavel_nome || 'Nao iniciada';
    if (!acc[chave]) acc[chave] = [];
    acc[chave].push(d);
    return acc;
  }, {});

  const corStatus = (s) => ({
    Pendente:'#f59e0b','Em Andamento':'#3b82f6',Concluido:'#22c55e',Atrasado:'#ef4444',
  })[s] || '#94a3b8';

  return (
    <div className="sec-card">
      <div className="sec-hdr" style={{background:'#1e293b'}}>
        <span style={{color:'white'}}>Relatorios — {setor}</span>
      </div>

      {/* FILTRO DE PERIODO */}
      <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
        <div className="form-row" style={{marginBottom:0}}>
          <div className="form-group">
            <label className="acn-label">Periodo — De</label>
            <input type="date" className="acn-input" style={{width:'100%'}} value={filtroInicio} onChange={e=>setFiltroInicio(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="acn-label">Ate</label>
            <input type="date" className="acn-input" style={{width:'100%'}} value={filtroFim} onChange={e=>setFiltroFim(e.target.value)} />
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:4}}>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
          </div>
          {/* ABAS RELATORIO */}
          <div style={{display:'flex',alignItems:'flex-end',gap:4,flexWrap:'wrap',marginLeft:'auto'}}>
            {[
              {id:'resumo',   label:'Resumo'},
              {id:'lista',    label:'Lista Completa'},
              {id:'atrasados',label:'Atrasados'},
              {id:'por_opl',  label:'Por OPL'},
              {id:'por_resp', label:'Por Responsavel'},
            ].map(a => (
              <button key={a.id} className="acn-btn"
                style={{background: abaRelat===a.id?'#1e293b':'#94a3b8',fontSize:10,padding:'4px 10px'}}
                onClick={()=>setAbaRelat(a.id)}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* CARDS RESUMO (sempre visíveis) */}
      <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {[
            {label:'Total no Periodo',  val:total,             cor:'#2563eb'},
            {label:'Pendentes',         val:pendentes.length,  cor:'#f59e0b'},
            {label:'Em Andamento',      val:andamento.length,  cor:'#3b82f6'},
            {label:'Concluidas',        val:concluidos.length, cor:'#22c55e'},
            {label:'Atrasadas (>48h)',  val:atrasados.length,  cor:'#ef4444'},
            {label:'Tempo Medio',       val: tempoMedio ? fmtH(tempoMedio) : '—', cor: tempoMedio&&tempoMedio<=24?'#22c55e':tempoMedio?'#f59e0b':'#94a3b8'},
          ].map(c => (
            <div key={c.label} style={{flex:'1 1 130px',minWidth:110,background:'white',border:`1px solid #e2e8f0`,borderTop:`3px solid ${c.cor}`,borderRadius:4,padding:'8px 12px'}}>
              <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>{c.label}</div>
              <div style={{fontSize:20,fontWeight:700,color:c.cor}}>{carregando?'...':c.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CONTEUDO DA ABA SELECIONADA */}
      <div className="sec-body" style={{overflowX:'auto'}}>
        {carregando ? <div className="acn-empty">Carregando...</div> : (

          /* LISTA COMPLETA */
          abaRelat === 'lista' ? (
            dados.length === 0 ? <div className="acn-empty">Nenhuma demanda no periodo.</div> : (
              <table>
                <thead><tr>
                  <th>Data Abertura</th><th>OPL Ref.</th><th>Descricao</th><th>Status</th>
                  <th>Responsavel</th><th>Inicio</th><th>Conclusao</th><th>Tempo</th><th>Obs.</th>
                </tr></thead>
                <tbody>
                  {dados.map(d => (
                    <tr key={d.id}>
                      <td>{fmtDt(d.data_abertura)}</td>
                      <td>{d.numero_opl||'—'}</td>
                      <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={d.descricao}>{d.descricao||'—'}</td>
                      <td><span className="acn-badge" style={{background:corStatus(d.status)}}>{d.status}</span></td>
                      <td>{d.responsavel_nome||'—'}</td>
                      <td>{fmtDtHr(d.data_inicio)}</td>
                      <td>{fmtDtHr(d.data_conclusao)}</td>
                      <td>{fmtH(d.tempo_execucao_horas)}</td>
                      <td style={{maxWidth:150,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.observacoes_execucao||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )

          /* ATRASADOS */
          : abaRelat === 'atrasados' ? (
            atrasados.length === 0
              ? <div className="acn-empty" style={{color:'#22c55e'}}>Nenhuma demanda atrasada no periodo.</div>
              : (
                <table>
                  <thead><tr>
                    <th>Data Abertura</th><th>OPL Ref.</th><th>Descricao</th><th>Status</th>
                    <th>Responsavel</th><th>Tempo Aberta (h)</th><th>Observacoes</th>
                  </tr></thead>
                  <tbody>
                    {atrasados.map(d => {
                      const horasAbertas = d.data_abertura ? (agora - new Date(d.data_abertura)) / 3600000 : 0;
                      return (
                        <tr key={d.id} style={{background:'#fff5f5'}}>
                          <td style={{color:'#dc2626',fontWeight:600}}>{fmtDt(d.data_abertura)}</td>
                          <td>{d.numero_opl||'—'}</td>
                          <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                          <td><span className="acn-badge" style={{background:'#ef4444'}}>{d.status}</span></td>
                          <td>{d.responsavel_nome||'Nao iniciada'}</td>
                          <td><strong style={{color:'#dc2626'}}>{horasAbertas.toFixed(0)}h</strong></td>
                          <td style={{maxWidth:150,fontSize:10}}>{d.observacoes_execucao||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
          )

          /* POR OPL */
          : abaRelat === 'por_opl' ? (
            Object.keys(porOpl).length === 0 ? <div className="acn-empty">Sem dados.</div> : (
              Object.entries(porOpl).map(([opl, itens]) => (
                <div key={opl} style={{marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:11,color:'#1e293b',background:'#f1f5f9',padding:'4px 10px',borderRadius:4,marginBottom:4,display:'flex',justifyContent:'space-between'}}>
                    <span>OPL: {opl}</span>
                    <span style={{color:'#64748b'}}>
                      {itens.length} demanda(s) |
                      <span style={{color:'#22c55e',marginLeft:4}}>{itens.filter(i=>i.status==='Concluido').length} concluidas</span>
                      <span style={{color:'#f59e0b',marginLeft:4}}>{itens.filter(i=>i.status==='Pendente').length} pendentes</span>
                    </span>
                  </div>
                  <table>
                    <thead><tr><th>Descricao</th><th>Status</th><th>Responsavel</th><th>Abertura</th><th>Conclusao</th><th>Tempo</th></tr></thead>
                    <tbody>
                      {itens.map(d => (
                        <tr key={d.id}>
                          <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                          <td><span className="acn-badge" style={{background:corStatus(d.status)}}>{d.status}</span></td>
                          <td>{d.responsavel_nome||'—'}</td>
                          <td>{fmtDt(d.data_abertura)}</td>
                          <td>{fmtDtHr(d.data_conclusao)}</td>
                          <td>{fmtH(d.tempo_execucao_horas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )
          )

          /* POR RESPONSAVEL */
          : abaRelat === 'por_resp' ? (
            Object.keys(porResp).length === 0 ? <div className="acn-empty">Sem dados.</div> : (
              Object.entries(porResp).sort((a,b)=>b[1].length-a[1].length).map(([resp, itens]) => {
                const conc = itens.filter(i=>i.status==='Concluido');
                const tempos = conc.map(i=>i.tempo_execucao_horas).filter(v=>v!=null&&v>0);
                const media = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : null;
                return (
                  <div key={resp} style={{marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:11,color:'#1e293b',background:'#f1f5f9',padding:'4px 10px',borderRadius:4,marginBottom:4,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:4}}>
                      <span>{resp}</span>
                      <span style={{color:'#64748b',fontSize:10}}>
                        {itens.length} total |
                        <span style={{color:'#22c55e',marginLeft:4}}>{conc.length} concluidas</span>
                        <span style={{color:'#f59e0b',marginLeft:4}}>{itens.filter(i=>i.status==='Pendente').length} pendentes</span>
                        {media && <span style={{color:'#2563eb',marginLeft:4}}>media: {fmtH(media)}</span>}
                      </span>
                    </div>
                    <table>
                      <thead><tr><th>OPL</th><th>Descricao</th><th>Status</th><th>Abertura</th><th>Conclusao</th><th>Tempo</th></tr></thead>
                      <tbody>
                        {itens.map(d => (
                          <tr key={d.id}>
                            <td>{d.numero_opl||'—'}</td>
                            <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                            <td><span className="acn-badge" style={{background:corStatus(d.status)}}>{d.status}</span></td>
                            <td>{fmtDt(d.data_abertura)}</td>
                            <td>{fmtDtHr(d.data_conclusao)}</td>
                            <td>{fmtH(d.tempo_execucao_horas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )
          )

          /* RESUMO (padrao) */
          : (
            <div style={{fontSize:11,color:'#64748b'}}>
              {dados.length === 0
                ? <div className="acn-empty">Nenhuma demanda no periodo selecionado.</div>
                : (
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {/* Distribuicao por status */}
                    <div style={{fontWeight:700,color:'#1e293b',marginBottom:4}}>Distribuicao por Status</div>
                    {[
                      {label:'Pendente',    itens: pendentes, cor:'#f59e0b'},
                      {label:'Em Andamento',itens: andamento, cor:'#3b82f6'},
                      {label:'Concluido',   itens: concluidos,cor:'#22c55e'},
                      {label:'Atrasado (>48h)',itens:atrasados,cor:'#ef4444'},
                    ].map(g => (
                      <div key={g.label} style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{minWidth:140,fontSize:11}}>{g.label}</span>
                        <div style={{flex:1,background:'#f1f5f9',borderRadius:3,height:16,overflow:'hidden'}}>
                          <div style={{width: total>0?`${(g.itens.length/total*100).toFixed(0)}%`:'0%', height:'100%', background:g.cor, transition:'width 0.4s'}} />
                        </div>
                        <span style={{minWidth:60,textAlign:'right',fontWeight:700,color:g.cor}}>
                          {g.itens.length} ({total>0?(g.itens.length/total*100).toFixed(0):0}%)
                        </span>
                      </div>
                    ))}
                    {tempoMedio != null && (
                      <div style={{marginTop:8,padding:'8px 12px',background:'#f0fdf4',borderRadius:4,border:'1px solid #bbf7d0',fontSize:11}}>
                        Tempo medio de conclusao: <strong style={{color:'#16a34a'}}>{fmtH(tempoMedio)}</strong>
                        {' '}({concluidos.length} amostras)
                      </div>
                    )}
                  </div>
                )
              }
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---- SetorDemandaTab principal ----
export default function SetorDemandaTab({ currentUser, setor, cor }) {
  const [demandas, setDemandas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('Pendente');
  const [modalObs, setModalObs] = useState(null);
  const [obsTexto, setObsTexto] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('demandas'); // demandas | relatorios
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelIniciar, setResponsavelIniciar] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(fetchDemandas, 30000);
    return () => clearInterval(t);
  }, [filtro, setor]);
  useEffect(() => { const t = setInterval(() => setTick(p => p + 1), 1000); return () => clearInterval(t); }, []);

  const fetchDemandas = async () => {
    setLoading(true);
    let q = supabase.from('demandas_setoriais').select('*').eq('setor_destino', setor).order('data_abertura', { ascending: false });
    if (filtro !== 'Todos') q = q.eq('status', filtro);
    const { data } = await q;
    setDemandas(data || []);
    setLoading(false);
  };

  const abrirIniciar = (d) => {
    setModalIniciar(d);
    setResponsavelIniciar(currentUser?.nome || '');
  };

  const confirmarIniciar = async () => {
    if (!responsavelIniciar.trim()) { alert('Informe o responsavel pela execucao!'); return; }
    const d = modalIniciar;
    const agora = new Date().toISOString();
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Iniciado. Responsavel: ${responsavelIniciar}`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Em Andamento', data_inicio: agora,
      responsavel_nome: responsavelIniciar, logs_demanda: logs,
    }).eq('id', d.id);
    setModalIniciar(null); setResponsavelIniciar('');
    fetchDemandas();
  };

  const addObservacao = async () => {
    if (!obsTexto.trim()) return;
    const d = modalObs;
    const logs = d.logs_demanda || [];
    logs.push({ texto: obsTexto, usuario: currentUser?.nome, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({
      observacoes_execucao: obsTexto, logs_demanda: logs,
    }).eq('id', d.id);
    setObsTexto(''); setModalObs(null); fetchDemandas();
  };

  const concluir = async (d) => {
    const agora = new Date().toISOString();
    const inicio = d.data_inicio ? new Date(d.data_inicio) : new Date(d.data_abertura || agora);
    const tempo = (new Date(agora) - inicio) / 3600000;
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Concluido. Tempo: ${tempo.toFixed(1)}h`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Concluido', data_conclusao: agora,
      tempo_execucao_horas: tempo, logs_demanda: logs,
    }).eq('id', d.id);
    fetchDemandas();
  };

  const corPrioridade = (p) => ({ Alta:'#ef4444', Media:'#f59e0b', Baixa:'#22c55e', Normal:'#94a3b8' })[p] || '#94a3b8';

  const tempoDecorrido = (inicio) => {
    if (!inicio) return '—';
    const seg = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const statusCor = { Pendente:'#f59e0b','Em Andamento':'#3b82f6',Concluido:'#22c55e' };
  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h != null ? `${Number(h).toFixed(1)}h` : '—';

  const pendentes   = demandas.filter(d=>d.status==='Pendente').length;
  const andamento   = demandas.filter(d=>d.status==='Em Andamento').length;
  const tempos      = demandas.filter(d=>d.tempo_execucao_horas).map(d=>d.tempo_execucao_horas);
  const mediaT      = tempos.length ? (tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;

  return (
    <div>
      {/* SELECTOR DEMANDAS / RELATORIOS */}
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:`2px solid ${cor||'#1e293b'}`}}>
        <button style={{flex:1,padding:'8px',background:abaAtiva==='demandas'?(cor||'#1e293b'):'white',color:abaAtiva==='demandas'?'white':(cor||'#1e293b'),border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaAtiva('demandas')}>Demandas Ativas</button>
        <button style={{flex:1,padding:'8px',background:abaAtiva==='relatorios'?(cor||'#1e293b'):'white',color:abaAtiva==='relatorios'?'white':(cor||'#1e293b'),border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaAtiva('relatorios')}>Relatorios</button>
      </div>

      {abaAtiva === 'relatorios' ? (
        <RelatoriosSetor setor={setor} cor={cor} />
      ) : (
        <>
          <div className="sec-card">
            <div className="sec-hdr" style={{background: cor||'#1e293b', color:'white'}}>
              <span>{setor} — Demandas Recebidas</span>
              <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:10,opacity:0.8}}>
                  {pendentes} pend. | {andamento} em andamento {mediaT ? `| media: ${fmtH(mediaT)}` : ''}
                </span>
                {['Pendente','Em Andamento','Concluido','Todos'].map(s => (
                  <button key={s} className="acn-btn"
                    style={{background: filtro===s?'white':'rgba(255,255,255,0.2)', color: filtro===s?(cor||'#1e293b'):'white', fontSize:10, padding:'3px 8px'}}
                    onClick={()=>setFiltro(s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="sec-body" style={{overflowX:'auto'}}>
              {loading ? <div className="acn-empty">Carregando...</div> : demandas.length === 0 ? (
                <div className="acn-empty">Nenhuma demanda {filtro !== 'Todos' ? `com status "${filtro}"` : ''} para {setor}.</div>
              ) : (
                <table>
                  <thead><tr>
                    <th>Data</th><th>OPL Ref.</th><th>Descricao</th><th>Status</th>
                    <th>Responsavel</th><th>Inicio</th><th>Tempo</th><th>Obs.</th><th>Acoes</th>
                  </tr></thead>
                  <tbody>
                    {demandas.map(d => {
                      const isAjuste = d.descricao?.startsWith('[AJUSTE]');
                      const descExibida = isAjuste ? d.descricao.replace('[AJUSTE] ', '') : (d.descricao || '—');
                      const rowBg = isAjuste
                        ? (d.status === 'Em Andamento' ? '#fefce8' : '#fffbeb')
                        : undefined;
                      return (
                      <tr key={d.id} style={{background: rowBg}}>
                        <td>{fmtDt(d.data_abertura)}</td>
                        <td>{d.numero_opl || '—'}</td>
                        <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={descExibida}>
                          {isAjuste && (
                            <span style={{background:'#f59e0b',color:'#fff',fontSize:8,fontWeight:700,padding:'1px 4px',borderRadius:2,marginRight:4}}>AJUSTE</span>
                          )}
                          {descExibida}
                        </td>
                        <td><span className="acn-badge" style={{background:statusCor[d.status]||'#94a3b8'}}>{d.status}</span></td>
                        <td>{d.responsavel_nome || '—'}</td>
                        <td>
                          {d.status === 'Em Andamento' && d.data_inicio
                            ? <span style={{fontFamily:'monospace',color:'#2563eb',fontWeight:700}}>{tempoDecorrido(d.data_inicio)}</span>
                            : fmtDt(d.data_inicio)
                          }
                        </td>
                        <td>{d.status !== 'Em Andamento' ? fmtH(d.tempo_execucao_horas) : ''}</td>
                        <td style={{maxWidth:120,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.observacoes_execucao || '—'}</td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            {d.status === 'Pendente' && (
                              <button className="acn-btn" style={{background: isAjuste?'#f59e0b':(cor||'#1e293b')}} onClick={()=>abrirIniciar(d)}>INICIAR</button>
                            )}
                            {d.status === 'Em Andamento' && (
                              <>
                                <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>OBS</button>
                                <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>concluir(d)}>CONCLUIR</button>
                              </>
                            )}
                            {d.status === 'Concluido' && (
                              <button className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={()=>{setModalObs(d);setObsTexto('');}}>VER LOG</button>
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

        <OplMovimentadas setor={setor} />
        <DemandaFooter setor={setor} />
      </>
    )}

    {/* MODAL INICIAR */}
    {modalIniciar && (
      <div className="modal-overlay">
        <div className="modal-box" style={{maxWidth:420}}>
          <div className="modal-title">Iniciar Execucao — {setor}</div>
          <div style={{fontSize:11,color:'#64748b',marginBottom:10,background:'#f8fafc',padding:'8px 10px',borderRadius:4}}>
            <strong>OPL:</strong> {modalIniciar.numero_opl || '—'}<br/>
            <strong>Descricao:</strong> {modalIniciar.descricao?.replace('[AJUSTE] ','') || '—'}
          </div>
          <label className="acn-label">Responsavel pela Execucao *</label>
          <input className="acn-input" style={{width:'100%',marginBottom:12}}
            placeholder="Nome do responsavel..."
            value={responsavelIniciar}
            onChange={e=>setResponsavelIniciar(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&confirmarIniciar()}
            autoFocus />
          <div style={{display:'flex',gap:8}}>
            <button className="acn-btn" style={{background: cor||'#1e293b',flex:1}} onClick={confirmarIniciar}>INICIAR</button>
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalIniciar(null)}>Cancelar</button>
          </div>
        </div>
      </div>
    )}

    {/* MODAL OBS / LOG */}
    {modalObs && (
      <div className="modal-overlay">
        <div className="modal-box" style={{maxWidth:500}}>
          <div className="modal-title">Observacoes / Log — {modalObs.descricao?.replace('[AJUSTE] ','')}</div>
          {/* Log existente */}
          {(modalObs.logs_demanda||[]).length > 0 && (
            <div style={{maxHeight:180,overflowY:'auto',marginBottom:12,background:'#f8fafc',borderRadius:4,padding:'8px 10px',border:'1px solid #e2e8f0'}}>
              {(modalObs.logs_demanda||[]).map((l,i) => (
                <div key={i} style={{marginBottom:6,fontSize:10,borderBottom:i<modalObs.logs_demanda.length-1?'1px solid #e2e8f0':'none',paddingBottom:4}}>
                  <span style={{color:'#94a3b8',fontSize:9}}>{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                  <div style={{color:'#374151',marginTop:2}}>{l.texto}</div>
                </div>
              ))}
            </div>
          )}
          {modalObs.status !== 'Concluido' && (
            <>
              <label className="acn-label">Nova Observacao</label>
              <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:8}}
                placeholder="Adicione uma observacao..."
                value={obsTexto}
                onChange={e=>setObsTexto(e.target.value)} />
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background: cor||'#1e293b',flex:1}} onClick={addObservacao}>SALVAR OBS.</button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalObs(null)}>Fechar</button>
              </div>
            </>
          )}
          {modalObs.status === 'Concluido' && (
            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalObs(null)}>Fechar</button>
          )}
        </div>
      </div>
    )}
  </div>
);
}
