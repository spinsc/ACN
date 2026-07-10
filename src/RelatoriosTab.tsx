// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


const SETORES_DEMANDA = ['Chicotes','Serralheria','Laboratorio','Compras'];
const STATUS_CORES = {
  Pendente:'#f59e0b','Em Andamento':'#3b82f6',Concluido:'#22c55e',
  'Em Espera PCP':'#f59e0b','Em Analise Engenharia':'#6366f1',
  'Aguardando Inicio Producao':'#3b82f6','Em Producao':'#0891b2',
  'Aguardando CQ':'#8b5cf6','Aprovado CQ - Aguardando Liberacao Comercial':'#16a34a',
  'Faturado e Disponivel para Entrega':'#059669','Faturado':'#374151',
};

function fmtDt(d) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fmtData(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }
function fmtH(h) { return h != null ? Number(h).toFixed(1)+'h' : '—'; }
function iniPeriodo() {
  const d = new Date(); d.setDate(d.getDate()-30);
  return d.toISOString().split('T')[0];
}

// ── Relatório por Área (demandas_setoriais) ──
function RelAreaDemandas() {
  const [setor, setSetor] = useState('Chicotes');
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('demandas_setoriais').select('*')
      .eq('setor_destino', setor)
      .gte('data_abertura', ini+'T00:00:00')
      .lte('data_abertura', fim+'T23:59:59')
      .order('data_abertura', { ascending: false });
    setDados(data || []);
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, [setor]);

  const agora = new Date();
  const pendentes   = dados.filter(d => d.status === 'Pendente');
  const andamento   = dados.filter(d => d.status === 'Em Andamento');
  const concluidos  = dados.filter(d => d.status === 'Concluido');
  const atrasados   = dados.filter(d => d.status !== 'Concluido' && (agora - new Date(d.data_abertura || 0)) / 3600000 > 48);
  const paradas     = dados.filter(d => d.status === 'Pendente' && (agora - new Date(d.data_abertura || 0)) / 3600000 > 8);
  const tempos      = concluidos.map(d => d.tempo_execucao_horas).filter(v => v > 0);
  const tempoMedio  = tempos.length ? tempos.reduce((a,b) => a+b,0)/tempos.length : null;

  return (
    <div>
      {/* filtros */}
      <div className="sec-card">
        <div className="sec-hdr">Relatório por Área — Demandas Setoriais</div>
        <div className="sec-body">
          {/* Linha 1: Setores */}
          <div style={{marginBottom:10}}>
            <label className="acn-label" style={{display:'block',marginBottom:6}}>Setor</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {SETORES_DEMANDA.map(s=>(
                <button key={s} className="acn-btn"
                  style={{background: setor===s?'#1e293b':'#94a3b8', minWidth:100}}
                  onClick={()=>setSetor(s)}>{s}</button>
              ))}
            </div>
          </div>
          {/* Linha 2: Período + Filtrar */}
          <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div className="form-group" style={{minWidth:140}}>
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/>
            </div>
            <div className="form-group" style={{minWidth:140}}>
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/>
            </div>
            <button className="acn-btn" style={{background:'#1e293b',padding:'8px 20px'}} onClick={buscar}>Filtrar</button>
          </div>
          {/* KPI cards */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {[
              {l:'Total',v:dados.length,c:'#374151'},
              {l:'Pendentes',v:pendentes.length,c:'#f59e0b'},
              {l:'Em Andamento',v:andamento.length,c:'#3b82f6'},
              {l:'Concluídas',v:concluidos.length,c:'#22c55e'},
              {l:'Atrasadas >48h',v:atrasados.length,c:'#ef4444'},
              {l:'Paradas >8h',v:paradas.length,c:'#f97316'},
              {l:'Tempo Médio',v:tempoMedio?fmtH(tempoMedio):'—',c:tempoMedio&&tempoMedio<24?'#22c55e':'#f59e0b'},
            ].map(k=>(
              <div key={k.l} style={{flex:'1 1 110px',background:'var(--bg-card)',border:`1px solid var(--border)`,borderTop:`3px solid ${k.c}`,borderRadius:4,padding:'7px 10px'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:k.c}}>{carregando?'...':k.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* tabela */}
      <div className="sec-card">
        <div className="sec-hdr">{setor} — {dados.length} registros no período</div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> :
           dados.length===0 ? <div className="acn-empty">Nenhuma demanda no período.</div> : (
            <table>
              <thead><tr>
                <th>Data</th><th>OPL</th><th>Descrição</th><th>Status</th>
                <th>Responsável</th><th>Abertura</th><th>Conclusão</th><th>Tempo</th>
              </tr></thead>
              <tbody>
                {dados.map(d=>{
                  const hrs = d.data_abertura ? (agora-new Date(d.data_abertura))/3600000 : 0;
                  const atras = d.status!=='Concluido' && hrs>48;
                  return (
                    <tr key={d.id} style={atras?{background:'#fef2f2'}:{}}>
                      <td>{fmtData(d.data_abertura)}</td>
                      <td>{d.numero_opl||'—'}</td>
                      <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                      <td><span className="acn-badge" style={{background:STATUS_CORES[d.status]||'#94a3b8'}}>{d.status}</span></td>
                      <td>{d.responsavel_nome||'—'}</td>
                      <td>{fmtDt(d.data_abertura)}</td>
                      <td>{fmtDt(d.data_conclusao)}</td>
                      <td style={{color:atras?'#dc2626':'inherit',fontWeight:atras?700:400}}>{fmtH(d.tempo_execucao_horas)}</td>
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

// ── Relatório de Produção por Responsável ──
function RelProducao() {
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [agrupar, setAgrupar] = useState(true);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples').select(
      'id,opl,chassi,tipo_projeto,status_geral,responsavel_producao,tecnicos_producao,data_inicio_producao,data_fim_producao,tempo_producao_horas'
    )
      .gte('data_entrada', ini+'T00:00:00')
      .lte('data_entrada', fim+'T23:59:59')
      .not('responsavel_producao','is',null)
      .order('data_inicio_producao', { ascending: false });
    setOps(data || []);
    setCarregando(false);
  };

  useEffect(()=>{ buscar(); },[]);

  // agrupa por responsavel
  const porResp = ops.reduce((acc, o) => {
    const resp = o.responsavel_producao || 'Não informado';
    if (!acc[resp]) acc[resp] = [];
    acc[resp].push(o);
    return acc;
  }, {});

  const agora = new Date();
  const emProd = ops.filter(o=>o.status_geral==='Em Producao').length;
  const conc   = ops.filter(o=>['Aguardando CQ','Aprovado CQ - Aguardando Liberacao Comercial','Faturado e Disponivel para Entrega','Faturado'].includes(o.status_geral)).length;
  const tempos = ops.map(o=>o.tempo_producao_horas).filter(v=>v>0);
  const tMedio = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : null;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">Relatório de Produção por Executor</div>
        <div className="sec-body">
          <div className="form-row" style={{alignItems:'flex-end'}}>
            <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/></div>
            <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/></div>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            <button className="acn-btn" style={{background: agrupar?'#6366f1':'#94a3b8'}} onClick={()=>setAgrupar(!agrupar)}>{agrupar?'Agrupar: ON':'Agrupar: OFF'}</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {[
              {l:'Total OPs',v:ops.length,c:'#374151'},
              {l:'Em Produção',v:emProd,c:'#0891b2'},
              {l:'Concluídas',v:conc,c:'#22c55e'},
              {l:'Tempo Médio',v:tMedio?fmtH(tMedio):'—',c:'#6366f1'},
              {l:'Executores',v:Object.keys(porResp).length,c:'#374151'},
            ].map(k=>(
              <div key={k.l} style={{flex:'1 1 110px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:`3px solid ${k.c}`,borderRadius:4,padding:'7px 10px'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:k.c}}>{carregando?'...':k.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {carregando ? <div className="acn-empty">Carregando...</div> : ops.length===0 ? <div className="acn-empty">Nenhum dado no período.</div> :
      agrupar ? (
        Object.entries(porResp).sort((a,b)=>b[1].length-a[1].length).map(([resp,itens])=>{
          const t = itens.map(i=>i.tempo_producao_horas).filter(v=>v>0);
          const med = t.length ? t.reduce((a,b)=>a+b,0)/t.length : null;
          const conc2 = itens.filter(i=>['Aguardando CQ','Aprovado CQ - Aguardando Liberacao Comercial','Faturado e Disponivel para Entrega','Faturado'].includes(i.status_geral)).length;
          return (
            <div key={resp} className="sec-card">
              <div className="sec-hdr" style={{background:'#1e293b',color:'white'}}>
                <span>{resp}</span>
                <span style={{fontSize:9,opacity:.8}}>
                  {itens.length} OPs | {conc2} concluídas
                  {med ? ` | média: ${fmtH(med)}` : ''}
                </span>
              </div>
              <div className="sec-body" style={{overflowX:'auto'}}>
                <table>
                  <thead><tr><th>OPL</th><th>Chassi</th><th>Tipo</th><th>Status</th><th>Técnicos</th><th>Início Prod.</th><th>Fim Prod.</th><th>Tempo</th></tr></thead>
                  <tbody>
                    {itens.map(o=>(
                      <tr key={o.id}>
                        <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                        <td>{o.chassi||'—'}</td>
                        <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                        <td><span className="acn-badge" style={{background:STATUS_CORES[o.status_geral]||'#94a3b8'}}>{o.status_geral}</span></td>
                        <td style={{fontSize:9}}>{Array.isArray(o.tecnicos_producao)?o.tecnicos_producao.join(', '):'—'}</td>
                        <td>{fmtDt(o.data_inicio_producao)}</td>
                        <td>{fmtDt(o.data_fim_producao)}</td>
                        <td>{fmtH(o.tempo_producao_horas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      ) : (
        <div className="sec-card">
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>OPL</th><th>Chassi</th><th>Tipo</th><th>Status</th><th>Executor</th><th>Técnicos</th><th>Início Prod.</th><th>Tempo</th></tr></thead>
              <tbody>
                {ops.map(o=>(
                  <tr key={o.id}>
                    <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                    <td>{o.chassi||'—'}</td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td><span className="acn-badge" style={{background:STATUS_CORES[o.status_geral]||'#94a3b8'}}>{o.status_geral}</span></td>
                    <td>{o.responsavel_producao||'—'}</td>
                    <td style={{fontSize:9}}>{Array.isArray(o.tecnicos_producao)?o.tecnicos_producao.join(', '):'—'}</td>
                    <td>{fmtDt(o.data_inicio_producao)}</td>
                    <td>{fmtH(o.tempo_producao_horas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório Geral de OPLs por Status ──
function RelOplsGeral() {
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [ops, setOps] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [carregando, setCarregando] = useState(false);

  const GRUPOS = {
    'Em Andamento': ['Em Espera PCP','Em Analise Engenharia','Aguardando Almox','Kit OK - Pronto para Producao','Aguardando Inicio Producao','Em Producao','Aguardando CQ'],
    'Paradas': ['Devolvida para Engenharia','Devolvida Comercial','Retrabalho'],
    'Finalizadas': ['Aprovado CQ - Aguardando Liberacao Comercial','Aguarda Emissao NF','Faturado e Disponivel para Entrega','Faturado'],
  };

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples').select(
      'id,opl,chassi,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,tempo_producao_horas,responsavel_engenharia,responsavel_producao'
    )
      .gte('data_entrada', ini+'T00:00:00')
      .lte('data_entrada', fim+'T23:59:59')
      .order('data_entrada', { ascending: false });
    setOps(data || []);
    setCarregando(false);
  };

  useEffect(()=>{ buscar(); },[]);

  const filtrar = () => {
    if (filtroStatus === 'Todos') return ops;
    const grupo = GRUPOS[filtroStatus];
    if (grupo) return ops.filter(o=>grupo.includes(o.status_geral));
    return ops.filter(o=>o.status_geral===filtroStatus);
  };
  const lista = filtrar();

  const agora = new Date();
  const andamento = ops.filter(o=>GRUPOS['Em Andamento'].includes(o.status_geral)).length;
  const paradas   = ops.filter(o=>GRUPOS['Paradas'].includes(o.status_geral)).length;
  const finalizadas = ops.filter(o=>GRUPOS['Finalizadas'].includes(o.status_geral)).length;
  const atrasadas = ops.filter(o=>{
    if (!o.data_prevista_entrega) return false;
    return new Date(o.data_prevista_entrega) < agora && !GRUPOS['Finalizadas'].includes(o.status_geral);
  }).length;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">Relatório Geral de OPLs</div>
        <div className="sec-body">
          <div className="form-row" style={{alignItems:'flex-end'}}>
            <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/></div>
            <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/></div>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {[
              {l:'Total',v:ops.length,c:'#374151'},
              {l:'Em Andamento',v:andamento,c:'#3b82f6'},
              {l:'Paradas/Devolvidas',v:paradas,c:'#ef4444'},
              {l:'Finalizadas',v:finalizadas,c:'#22c55e'},
              {l:'Atrasadas',v:atrasadas,c:'#dc2626'},
            ].map(k=>(
              <div key={k.l} style={{flex:'1 1 110px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:`3px solid ${k.c}`,borderRadius:4,padding:'7px 10px'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:k.c}}>{carregando?'...':k.v}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:10}}>
            {['Todos','Em Andamento','Paradas','Finalizadas'].map(s=>(
              <button key={s} className="acn-btn"
                style={{background:filtroStatus===s?'#1e293b':'#94a3b8',fontSize:9}}
                onClick={()=>setFiltroStatus(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-hdr">{lista.length} OPLs — {filtroStatus}</div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> :
           lista.length===0 ? <div className="acn-empty">Nenhuma OPL no filtro.</div> : (
            <table>
              <thead><tr>
                <th>Data Entrada</th><th>OPL</th><th>Chassi</th><th>Tipo Projeto</th>
                <th>Status</th><th>Prev. Entrega</th><th>Engenharia</th><th>Produção</th>
              </tr></thead>
              <tbody>
                {lista.map(o=>{
                  const atras = o.data_prevista_entrega && new Date(o.data_prevista_entrega)<agora && !GRUPOS['Finalizadas'].includes(o.status_geral);
                  return (
                    <tr key={o.id} style={atras?{background:'#fef2f2'}:{}}>
                      <td>{fmtData(o.data_entrada)}</td>
                      <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                      <td>{o.chassi||'—'}</td>
                      <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                      <td><span className="acn-badge" style={{background:STATUS_CORES[o.status_geral]||'#94a3b8',fontSize:8}}>{o.status_geral}</span></td>
                      <td style={{color:atras?'#dc2626':'inherit',fontWeight:atras?700:400}}>{fmtData(o.data_prevista_entrega)}</td>
                      <td>{o.responsavel_engenharia||'—'}</td>
                      <td>{o.responsavel_producao||'—'}</td>
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

// ── Relatório: OPLs Finalizadas ──
function RelOplsFinalizadas() {
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const STATUS_FINAL = ['Aprovado CQ - Aguardando Liberacao Comercial','Aguarda Emissao NF','Faturado e Disponivel para Entrega','Faturado'];

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,data_entrega,data_fim_producao,cliente_nome,responsavel_producao')
      .in('status_geral', STATUS_FINAL)
      .gte('data_entrada', ini+'T00:00:00')
      .lte('data_entrada', fim+'T23:59:59')
      .order('data_entrega', { ascending: false });
    setOps(data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const faturadas  = ops.filter(o=>o.status_geral==='Faturado').length;
  const dispEntrega = ops.filter(o=>o.status_geral==='Faturado e Disponivel para Entrega').length;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">OPLs Finalizadas por Período</div>
        <div className="sec-body">
          <div className="form-row" style={{alignItems:'flex-end'}}>
            <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/></div>
            <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/></div>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            <button className="acn-btn" style={{background:'#475569'}} onClick={()=>window.print()}>🖨️ Imprimir</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {[{l:'Total Finalizadas',v:ops.length,c:'#374151'},{l:'Faturadas/Entregues',v:faturadas,c:'#22c55e'},{l:'Disp. Entrega',v:dispEntrega,c:'#3b82f6'}]
              .map(k=><div key={k.l} style={{flex:'1 1 120px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:`3px solid ${k.c}`,borderRadius:4,padding:'7px 10px'}}>
                <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:k.c}}>{carregando?'...':k.v}</div>
              </div>)}
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty">Nenhuma OPL finalizada no período.</div>:(
            <table><thead><tr>
              <th>OPL</th><th>Chassi</th><th>Cliente</th><th>Tipo</th><th>Status</th>
              <th>Entrada</th><th>Prev. Entrega</th><th>Data Entrega</th><th>Responsável Prod.</th>
            </tr></thead><tbody>
              {ops.map(o=>(
                <tr key={o.id}>
                  <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                  <td>{o.chassi||'—'}</td>
                  <td>{o.cliente_nome||'—'}</td>
                  <td style={{fontSize:9}}>{o.tipo_projeto}</td>
                  <td><span className="acn-badge" style={{background:STATUS_CORES[o.status_geral]||'#22c55e',fontSize:8}}>{o.status_geral}</span></td>
                  <td>{fmtData(o.data_entrada)}</td>
                  <td>{fmtData(o.data_prevista_entrega)}</td>
                  <td>{fmtData(o.data_entrega)||'—'}</td>
                  <td>{o.responsavel_producao||'—'}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Relatório: OPLs por Setor (onde estão agora) ──
function RelOplsPorSetor() {
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [setor, setSetor] = useState('Todos');

  const SETORES_STATUS = {
    'Engenharia':     ['Em Espera Engenharia','Em Analise Engenharia','Devolvida para Engenharia'],
    'PCP/Almox':      ['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP','Devolvida PCP'],
    'Produção':       ['Aguardando Inicio Producao','Em Producao','Retrabalho'],
    'Qualidade':      ['Aguardando CQ'],
    'Comercial/Fiscal':['Aprovado CQ - Aguardando Liberacao Comercial','Aguarda Emissao NF','Faturado e Disponivel para Entrega','Devolvida Comercial'],
    'Manutenção':     ['Aguardando Agendamento Manutenção','Manutenção Agendada'],
  };

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome')
      .not('status_geral','in','("Faturado","Cancelado")')
      .order('data_entrada', { ascending: false });
    setOps(data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const agora = new Date();
  const lista = setor==='Todos' ? ops : ops.filter(o=>(SETORES_STATUS[setor]||[]).includes(o.status_geral));
  const atrasadas = lista.filter(o=>o.data_prevista_entrega&&new Date(o.data_prevista_entrega)<agora).length;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">OPLs em Andamento — Distribuição por Setor</div>
        <div className="sec-body">
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {['Todos',...Object.keys(SETORES_STATUS)].map(s=>(
              <button key={s} className="acn-btn" style={{background:setor===s?'#1e293b':'#94a3b8',fontSize:9}} onClick={()=>setSetor(s)}>{s}</button>
            ))}
            <button className="acn-btn" style={{background:'#475569',marginLeft:'auto'}} onClick={()=>window.print()}>🖨️</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(SETORES_STATUS).map(([s,statuses])=>{
              const n = ops.filter(o=>statuses.includes(o.status_geral)).length;
              return <div key={s} style={{flex:'1 1 100px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:'3px solid #3b82f6',borderRadius:4,padding:'6px 10px',cursor:'pointer',opacity:n>0?1:.4}}
                onClick={()=>setSetor(s)}>
                <div style={{fontSize:8,color:'var(--text-muted)'}}>{s}</div>
                <div style={{fontSize:20,fontWeight:700,color:'#3b82f6'}}>{carregando?'...':n}</div>
              </div>;
            })}
            <div style={{flex:'1 1 100px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:'3px solid #dc2626',borderRadius:4,padding:'6px 10px'}}>
              <div style={{fontSize:8,color:'var(--text-muted)'}}>Atrasadas</div>
              <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{atrasadas}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-hdr">{lista.length} OPLs — {setor}</div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando?<div className="acn-empty">Carregando...</div>:lista.length===0?<div className="acn-empty">Nenhuma OPL.</div>:(
            <table><thead><tr><th>OPL</th><th>Chassi</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Entrada</th><th>Prev. Entrega</th></tr></thead>
            <tbody>{lista.map(o=>{
              const atras = o.data_prevista_entrega && new Date(o.data_prevista_entrega)<agora;
              return <tr key={o.id} style={atras?{background:'#fef2f2'}:{}}>
                <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                <td>{o.chassi||'—'}</td>
                <td>{o.cliente_nome||'—'}</td>
                <td style={{fontSize:9}}>{o.tipo_projeto}</td>
                <td><span className="acn-badge" style={{background:STATUS_CORES[o.status_geral]||'#94a3b8',fontSize:8}}>{o.status_geral}</span></td>
                <td>{fmtData(o.data_entrada)}</td>
                <td style={{color:atras?'#dc2626':'inherit',fontWeight:atras?700:400}}>{fmtData(o.data_prevista_entrega)}</td>
              </tr>;
            })}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Relatório: OPLs Atrasadas por Setor ──
function RelOplsAtrasadas() {
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const STATUS_FINAL = ['Faturado','Cancelado'];

  const buscar = async () => {
    setCarregando(true);
    const agora = new Date().toISOString();
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome,responsavel_engenharia,responsavel_producao')
      .not('status_geral','in','("Faturado","Cancelado","Faturado e Disponivel para Entrega")')
      .lt('data_prevista_entrega', agora)
      .not('data_prevista_entrega','is',null)
      .order('data_prevista_entrega', { ascending: true });
    setOps(data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const agora = new Date();
  const SETORES_STATUS = {
    'Engenharia':['Em Espera Engenharia','Em Analise Engenharia','Devolvida para Engenharia'],
    'PCP/Almox':['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP'],
    'Produção':['Aguardando Inicio Producao','Em Producao','Retrabalho'],
    'Qualidade':['Aguardando CQ'],
    'Comercial':['Aprovado CQ - Aguardando Liberacao Comercial','Aguarda Emissao NF','Devolvida Comercial'],
  };
  const porSetor = (o) => Object.entries(SETORES_STATUS).find(([,ss])=>ss.includes(o.status_geral))?.[0] || 'Outros';
  const diasAtraso = (o) => Math.floor((agora.getTime()-new Date(o.data_prevista_entrega).getTime())/86400000);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef2f2'}}>
          <span style={{color:'#dc2626'}}>⚠️ OPLs Atrasadas ({ops.length})</span>
          <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>window.print()}>🖨️</button>
        </div>
        <div className="sec-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.keys(SETORES_STATUS).map(s=>{
              const n = ops.filter(o=>porSetor(o)===s).length;
              return <div key={s} style={{flex:'1 1 100px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:`3px solid ${n>0?'#dc2626':'#e5e7eb'}`,borderRadius:4,padding:'6px 10px'}}>
                <div style={{fontSize:8,color:'var(--text-muted)'}}>{s}</div>
                <div style={{fontSize:20,fontWeight:700,color:n>0?'#dc2626':'#94a3b8'}}>{carregando?'...':n}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty" style={{color:'#22c55e'}}>✅ Nenhuma OPL atrasada!</div>:(
            <table><thead><tr><th>OPL</th><th>Chassi</th><th>Cliente</th><th>Setor Atual</th><th>Status</th><th>Prev. Entrega</th><th>Atraso</th></tr></thead>
            <tbody>{ops.map(o=>(
              <tr key={o.id} style={{background:'#fef2f2'}}>
                <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                <td>{o.chassi||'—'}</td>
                <td>{o.cliente_nome||'—'}</td>
                <td><strong style={{color:'#dc2626'}}>{porSetor(o)}</strong></td>
                <td><span className="acn-badge" style={{background:'#dc2626',fontSize:8}}>{o.status_geral}</span></td>
                <td style={{color:'#dc2626',fontWeight:700}}>{fmtData(o.data_prevista_entrega)}</td>
                <td style={{color:'#dc2626',fontWeight:700}}>{diasAtraso(o)}d</td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Relatório: Recebimentos e Envios ──
function RelRecebimentosEnvios() {
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [recebimentos, setRecebimentos] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState('rec');

  const buscar = async () => {
    setCarregando(true);
    const [recRes, envRes] = await Promise.all([
      supabase.from('pcp_pedidos_compra').select('*')
        .gte('data_prevista_recebimento', ini)
        .lte('data_prevista_recebimento', fim)
        .order('data_prevista_recebimento', { ascending: true }),
      supabase.from('oples').select('id,opl,chassi,tipo_projeto,status_geral,data_entrega,data_prevista_entrega,cliente_nome')
        .in('status_geral',['Faturado e Disponivel para Entrega','Faturado'])
        .gte('data_entrada', ini+'T00:00:00')
        .lte('data_entrada', fim+'T23:59:59')
        .order('data_entrega', { ascending: false }),
    ]);
    setRecebimentos(recRes.data || []);
    setEnvios(envRes.data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const fmtVal = (v) => v ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v) : '—';

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">Recebimentos e Envios</div>
        <div className="sec-body">
          <div className="form-row" style={{alignItems:'flex-end'}}>
            <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/></div>
            <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/></div>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            <button className="acn-btn" style={{background:'#475569'}} onClick={()=>window.print()}>🖨️</button>
          </div>
          <div style={{display:'flex',gap:0,marginTop:10,borderRadius:5,overflow:'hidden',border:'1px solid #e5e7eb'}}>
            <button style={{flex:1,padding:'7px 0',border:'none',borderBottom:aba==='rec'?'2px solid #0891b2':'2px solid transparent',background:'transparent',fontWeight:700,fontSize:10,cursor:'pointer',color:aba==='rec'?'#0891b2':'#94a3b8'}} onClick={()=>setAba('rec')}>📦 Recebimentos de Mercadoria ({recebimentos.length})</button>
            <button style={{flex:1,padding:'7px 0',border:'none',borderBottom:aba==='env'?'2px solid #16a34a':'2px solid transparent',background:'transparent',fontWeight:700,fontSize:10,cursor:'pointer',color:aba==='env'?'#16a34a':'#94a3b8'}} onClick={()=>setAba('env')}>🚚 Envios/Entregas ({envios.length})</button>
          </div>
        </div>
      </div>
      {aba==='rec' && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0f9ff'}}>
            <span style={{color:'#0891b2'}}>📦 Recebimentos Previstos ({recebimentos.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            {carregando?<div className="acn-empty">Carregando...</div>:recebimentos.length===0?<div className="acn-empty">Nenhum recebimento no período.</div>:(
              <table><thead><tr><th>Nº Pedido</th><th>Descrição</th><th>Fornecedor</th><th>Qtd</th><th>Prev. Recebimento</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>{recebimentos.map(r=>{
                const hoje = new Date(); hoje.setHours(0,0,0,0);
                const dt = r.data_prevista_recebimento ? new Date(r.data_prevista_recebimento+'T00:00:00') : null;
                const atras = dt && dt < hoje && r.status_compra !== 'Concluído';
                return <tr key={r.id} style={atras?{background:'#fef2f2'}:{}}>
                  <td><strong>{r.numero_pedido||'—'}</strong></td>
                  <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descricao_material||'—'}</td>
                  <td>{r.fornecedor||'—'}</td>
                  <td>{r.quantidade||'—'}</td>
                  <td style={{color:atras?'#dc2626':'inherit',fontWeight:atras?700:400}}>{fmtData(r.data_prevista_recebimento)}</td>
                  <td>{fmtVal(r.valor_compra)}</td>
                  <td><span className="acn-badge" style={{background:r.status_compra==='Concluído'?'#22c55e':r.status_compra==='Em Andamento'?'#3b82f6':'#94a3b8',fontSize:8}}>{r.status_compra||'—'}</span></td>
                </tr>;
              })}</tbody></table>
            )}
          </div>
        </div>
      )}
      {aba==='env' && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0fdf4'}}>
            <span style={{color:'#16a34a'}}>🚚 Envios/Entregas ({envios.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            {carregando?<div className="acn-empty">Carregando...</div>:envios.length===0?<div className="acn-empty">Nenhum envio no período.</div>:(
              <table><thead><tr><th>OPL</th><th>Chassi</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Data Entrega</th></tr></thead>
              <tbody>{envios.map(o=>(
                <tr key={o.id}>
                  <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                  <td>{o.chassi||'—'}</td>
                  <td>{o.cliente_nome||'—'}</td>
                  <td style={{fontSize:9}}>{o.tipo_projeto}</td>
                  <td><span className="acn-badge" style={{background:'#22c55e',fontSize:8}}>{o.status_geral}</span></td>
                  <td>{fmtData(o.data_entrega)||'—'}</td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório: Demandas Avulsas ──
function RelDemandasAvulsas() {
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(new Date().toISOString().split('T')[0]);
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('demandas_setoriais')
      .select('*')
      .or('numero_opl.is.null,numero_opl.eq.')
      .gte('data_abertura', ini+'T00:00:00')
      .lte('data_abertura', fim+'T23:59:59')
      .order('data_abertura', { ascending: false });
    setDados(data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const porSetor = dados.reduce((acc,d)=>{
    const s = d.setor_destino||'Sem setor';
    acc[s] = (acc[s]||0)+1;
    return acc;
  },{});

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">Demandas Avulsas (sem OPL vinculada)</div>
        <div className="sec-body">
          <div className="form-row" style={{alignItems:'flex-end'}}>
            <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" style={{width:'100%'}} value={ini} onChange={e=>setIni(e.target.value)}/></div>
            <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" style={{width:'100%'}} value={fim} onChange={e=>setFim(e.target.value)}/></div>
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            <button className="acn-btn" style={{background:'#475569'}} onClick={()=>window.print()}>🖨️</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {Object.entries(porSetor).sort((a,b)=>b[1]-a[1]).map(([s,n])=>(
              <div key={s} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:'3px solid #6366f1',borderRadius:4,padding:'6px 10px'}}>
                <div style={{fontSize:8,color:'var(--text-muted)'}}>{s}</div>
                <div style={{fontSize:18,fontWeight:700,color:'#6366f1'}}>{n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-hdr">{dados.length} Demandas Avulsas no período</div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando?<div className="acn-empty">Carregando...</div>:dados.length===0?<div className="acn-empty">Nenhuma demanda avulsa no período.</div>:(
            <table><thead><tr><th>Data</th><th>Setor</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Tempo</th></tr></thead>
            <tbody>{dados.map(d=>(
              <tr key={d.id}>
                <td>{fmtData(d.data_abertura)}</td>
                <td>{d.setor_destino||'—'}</td>
                <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.descricao||'—'}</td>
                <td><span className="acn-badge" style={{background:STATUS_CORES[d.status]||'#94a3b8'}}>{d.status}</span></td>
                <td>{d.responsavel_nome||'—'}</td>
                <td>{fmtH(d.tempo_execucao_horas)}</td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Relatório: OPLs Paradas ──
function RelOplsParadas() {
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const STATUS_PARADA = ['Devolvida para Engenharia','Devolvida PCP','Devolvida Comercial','Retrabalho','Aguardando Agendamento Manutenção'];

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome,responsavel_engenharia,responsavel_producao')
      .in('status_geral', STATUS_PARADA)
      .order('data_entrada', { ascending: true });
    setOps(data || []);
    setCarregando(false);
  };
  useEffect(()=>{ buscar(); },[]);

  const agora = new Date();
  const diasParada = (o) => Math.floor((agora.getTime()-new Date(o.data_entrada).getTime())/86400000);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fff7ed'}}>
          <span style={{color:'#c2410c'}}>🚧 OPLs Paradas / Devolvidas ({ops.length})</span>
          <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>window.print()}>🖨️</button>
        </div>
        <div className="sec-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {STATUS_PARADA.map(s=>{
              const n = ops.filter(o=>o.status_geral===s).length;
              return <div key={s} style={{flex:'1 1 100px',background:'var(--bg-card)',border:'1px solid var(--border)',borderTop:`3px solid ${n>0?'#f97316':'#e5e7eb'}`,borderRadius:4,padding:'6px 10px'}}>
                <div style={{fontSize:8,color:'var(--text-muted)'}}>{s}</div>
                <div style={{fontSize:20,fontWeight:700,color:n>0?'#f97316':'#94a3b8'}}>{carregando?'...':n}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
      <div className="sec-card">
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty" style={{color:'#22c55e'}}>✅ Nenhuma OPL parada!</div>:(
            <table><thead><tr><th>OPL</th><th>Chassi</th><th>Cliente</th><th>Motivo</th><th>Entrada</th><th>Prev. Entrega</th><th>Dias Parada</th></tr></thead>
            <tbody>{ops.sort((a,b)=>diasParada(b)-diasParada(a)).map(o=>(
              <tr key={o.id} style={{background:'#fff7ed'}}>
                <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                <td>{o.chassi||'—'}</td>
                <td>{o.cliente_nome||'—'}</td>
                <td><span className="acn-badge" style={{background:'#f97316',fontSize:8}}>{o.status_geral}</span></td>
                <td>{fmtData(o.data_entrada)}</td>
                <td style={{color:'#dc2626'}}>{fmtData(o.data_prevista_entrega)}</td>
                <td style={{color:'#dc2626',fontWeight:700}}>{diasParada(o)}d</td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──
export default function RelatoriosTab({ currentUser }) {
  const [aba, setAba] = useState('opls');
  const ABAS = [
    {id:'opls',       label:'OPLs Geral'},
    {id:'finalizadas',label:'Finalizadas'},
    {id:'porsetor',   label:'Por Setor'},
    {id:'atrasadas',  label:'Atrasadas'},
    {id:'paradas',    label:'Paradas'},
    {id:'recebenv',   label:'Receb./Envios'},
    {id:'avulsas',    label:'Dem. Avulsas'},
    {id:'area',       label:'Por Área'},
    {id:'producao',   label:'Produção'},
  ];

  return (
    <div>
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:5,overflow:'hidden',border:'1px solid #e5e7eb',background:'var(--bg-card)',flexWrap:'wrap'}}>
        {ABAS.map(a=>(
          <button key={a.id} onClick={()=>setAba(a.id)}
            style={{flex:'1 1 80px',padding:'8px 4px',border:'none',borderBottom: aba===a.id?'2px solid #1e293b':'2px solid transparent',
              background:'transparent',fontWeight:700,fontSize:9,cursor:'pointer',
              color: aba===a.id?'#1e293b':'#94a3b8',letterSpacing:'.3px',textTransform:'uppercase'}}>
            {a.label}
          </button>
        ))}
      </div>
      {aba==='opls'        && <RelOplsGeral />}
      {aba==='finalizadas' && <RelOplsFinalizadas />}
      {aba==='porsetor'    && <RelOplsPorSetor />}
      {aba==='atrasadas'   && <RelOplsAtrasadas />}
      {aba==='paradas'     && <RelOplsParadas />}
      {aba==='recebenv'    && <RelRecebimentosEnvios />}
      {aba==='avulsas'     && <RelDemandasAvulsas />}
      {aba==='area'        && <RelAreaDemandas />}
      {aba==='producao'    && <RelProducao />}
    </div>
  );
}
