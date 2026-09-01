// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls } from './AcnTabShared';
import AnaliseWidget from './AnaliseWidget';
import { ColaboradorSelect } from './ColaboradorSelect';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import OplAnexosWidget from './OplAnexosWidget';
import { notificarEvento, msg } from './whatsappHelper';
import AgendaWidget from './AgendaWidget';
import DesenvolvimentoPecasTab, { criarDemandaDesenvolvimento } from './DesenvolvimentoPecasTab';
import HorasTarefasTab from './HorasTarefasTab';
import { horasUteis } from './utils/horasUteis';

const semDado = (v) => !v || !String(v).trim();

export default function EngenhariaTab({ currentUser }) {
  const [abaEng, setAbaEng] = useState('analise');
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalBom, setModalBom] = useState(null);
  const [obsBom, setObsBom] = useState('');
  // Liberação parcial de BOM p/ Serralheria — Engenharia antecipa a parte
  // metálica/estrutural sem esperar terminar o resto do BOM. Trilha própria
  // (oples.serralheria_status), não mexe no status_geral normal.
  const [modalSerralheria, setModalSerralheria] = useState(null);
  const [obsSerralheria, setObsSerralheria] = useState('');
  const [enviandoSerralheria, setEnviandoSerralheria] = useState(false);
  // Liberação de BOM em lote — OPs desmembradas (mesmo número base, sufixo
  // /01../NN) costumam compartilhar o mesmo BOM, então liberar uma por uma
  // é retrabalho. selecionadosLote guarda os ids marcados no modal (todos
  // marcados por padrão, dá pra desmarcar exceções antes de confirmar).
  const [modalBomLote, setModalBomLote] = useState(null); // { base, irmaos: [] }
  const [obsBomLote, setObsBomLote] = useState('');
  const [selecionadosLote, setSelecionadosLote] = useState({});
  const [liberandoLote, setLiberandoLote] = useState(false);
  const [iniciandoLote, setIniciandoLote] = useState(false);
  // Grupos desmembrados aparecem colapsados numa única linha "LOTE" na
  // tabela — expande[base]=true mostra as unidades individuais por baixo.
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelEng, setResponsavelEng] = useState('');
  const [precisaDesenvolvimento, setPrecisaDesenvolvimento] = useState(false);
  const [descDesenvolvimento, setDescDesenvolvimento] = useState('');

  // Acompanhamento SAC Veicular
  const [osAcomp, setOsAcomp] = useState([]);
  const [modalObsAcomp, setModalObsAcomp] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [novaObsAcomp, setNovaObsAcomp] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => { fetchAll(); fetchOsAcomp(); const t = setInterval(()=>{ fetchAll(true); fetchOsAcomp(); }, 30000); return () => clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Em Espera Engenharia', 'Em Analise Engenharia', 'Devolvida para Engenharia'])
      .order('data_entrada', { ascending: false });
    setOpls(data || []);
    if (!silent) setLoading(false);
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
    setPrecisaDesenvolvimento(false);
    setDescDesenvolvimento('');
  };

  const confirmarIniciarEng = async () => {
    if (!responsavelEng.trim()) { alert('Informe o responsavel pela execucao!'); return; }
    if (precisaDesenvolvimento && !descDesenvolvimento.trim()) { alert('Descreva o que precisa ser desenvolvido!'); return; }
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
    if (precisaDesenvolvimento) {
      await criarDemandaDesenvolvimento({ opl, descricao: descDesenvolvimento.trim(), currentUser });
    }
    setModalIniciar(null); setResponsavelEng(''); setPrecisaDesenvolvimento(false); setDescDesenvolvimento('');
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
    const tempo = inicio ? horasUteis(inicio, new Date()) : null;
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

  // Libera só a parte da Serralheria (metálica/estrutural), antecipando o
  // serviço sem esperar o resto do BOM ficar pronto. Não mexe no
  // status_geral — a OP continua "Em Analise Engenharia" normalmente, e o
  // "LIBERAR BOM" (saldo completo) segue disponível a qualquer momento,
  // independente de a Serralheria já ter terminado ou não.
  const liberarParcialSerralheria = async () => {
    if (!obsSerralheria.trim()) { alert('Descreva o que a Serralheria precisa fazer!'); return; }
    const opl = modalSerralheria;
    setEnviandoSerralheria(true);
    const agora = new Date().toISOString();
    // Usa a mesma tabela/tela que a Serralheria já usa de verdade
    // (demandas_setoriais + SetorDemandaTab.tsx) — tipo_solicitacao marca
    // essa demanda como liberação parcial de BOM, pra SetorDemandaTab.tsx
    // saber que precisa sincronizar oples.serralheria_status ao concluir.
    const { error: errDemanda } = await supabase.from('demandas_setoriais').insert([{
      setor_destino: 'Serralheria', setor_origem: 'Engenharia', tipo_solicitacao: 'liberacao_parcial_bom',
      numero_opl: opl.opl, chassi: opl.chassi || null, descricao: obsSerralheria.trim(),
      status: 'Pendente', criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      logs_demanda: [{ texto: `Liberação parcial de BOM (Engenharia): ${obsSerralheria.trim()}`, usuario: currentUser?.nome, hora: agora }],
    }]);
    if (errDemanda) { alert('Erro ao criar demanda para Serralheria: ' + errDemanda.message); setEnviandoSerralheria(false); return; }
    await supabase.from('oples').update({ serralheria_status: 'Pendente' }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `Liberação parcial de BOM para Serralheria. Obs: ${obsSerralheria.trim()}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('engenharia_libera_serralheria', `🔧 *Liberação parcial p/ Serralheria* — OPL ${opl.opl}\n${obsSerralheria.trim()}\nPor: ${currentUser?.nome}`, 'Serralheria');
    setEnviandoSerralheria(false);
    setModalSerralheria(null); setObsSerralheria(''); fetchAll();
  };

  // Número base de uma OP desmembrada: "A1419.2607/02" -> "A1419.2607".
  // A unidade "01" fica sem sufixo (não renomeada, ver ComercialTab/CrmTab),
  // então o próprio número original também serve de base do grupo.
  const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
  const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

  const abrirBomLote = (opl) => {
    const base = baseOplDe(opl.opl);
    const irmaos = opls.filter(o => baseOplDe(o.opl) === base);
    const marcados = {};
    irmaos.forEach(o => { marcados[o.id] = true; });
    setSelecionadosLote(marcados);
    setObsBomLote('');
    setModalBomLote({ base, irmaos });
  };

  // Inicia de uma vez a analise de todas as unidades ainda nao iniciadas
  // de um lote (status "Em Espera Engenharia" ou "Devolvida para
  // Engenharia") — responsavel = quem clicou. As ja iniciadas ficam como
  // estao (podem ter responsaveis/observacoes diferentes).
  const iniciarLote = async (grupo) => {
    const pendentes = grupo.irmaos.filter(o => o.status_geral === 'Em Espera Engenharia' || o.status_geral === 'Devolvida para Engenharia');
    if (pendentes.length === 0) { alert('Todas as unidades deste lote ja foram iniciadas.'); return; }
    if (!confirm(`Iniciar a analise de engenharia para ${pendentes.length} unidade(s) de ${grupo.base}?\n\nResponsavel: ${currentUser?.nome}.`)) return;
    setIniciandoLote(true);
    const agora = new Date().toISOString();
    try {
      for (const opl of pendentes) {
        await supabase.from('oples').update({
          status_geral: 'Em Analise Engenharia',
          responsavel_engenharia: currentUser?.nome,
          data_inicio_engenharia: agora,
        }).eq('id', opl.id);
      }
      await supabase.from('logs_movimentacao_opl').insert(pendentes.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
        evento: `Inicio de analise em lote (${pendentes.length} OPs do grupo ${grupo.base}). Responsavel: ${currentUser?.nome}.`,
        status_anterior: opl.status_geral, status_novo: 'Em Analise Engenharia',
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
    } finally {
      setIniciandoLote(false);
      fetchAll();
    }
  };

  const liberarBomLote = async () => {
    const { irmaos } = modalBomLote;
    const selecionados = irmaos.filter(o => selecionadosLote[o.id]);
    if (selecionados.length === 0) { alert('Selecione ao menos uma OP.'); return; }
    setLiberandoLote(true);
    const agora = new Date().toISOString();
    try {
      for (const opl of selecionados) {
        const inicio = opl.data_inicio_engenharia ? new Date(opl.data_inicio_engenharia) : null;
        const tempo = inicio ? horasUteis(inicio, new Date()) : 0;
        await supabase.from('oples').update({
          status_geral: 'Em Espera PCP',
          status_bom: 'BOM Liberado',
          obs_liberacao_bom: obsBomLote,
          data_liberacao_bom: agora,
          tempo_engenharia_horas: tempo,
          responsavel_engenharia: opl.responsavel_engenharia || currentUser?.nome,
          data_inicio_engenharia: opl.data_inicio_engenharia || agora,
        }).eq('id', opl.id);
      }
      await supabase.from('logs_movimentacao_opl').insert(selecionados.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
        evento: `BOM liberado em lote (${selecionados.length} OPs do grupo ${modalBomLote.base}). Obs: ${obsBomLote || 'Sem observacoes'}.`,
        status_anterior: opl.status_geral, status_novo: 'Em Espera PCP',
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
      notificarEvento('engenharia_libera_pcp', `📦 *BOM liberado em lote* — ${modalBomLote.base}\n${selecionados.length} OPs enviadas para PCP.\nPor: ${currentUser?.nome}`);
    } finally {
      setLiberandoLote(false);
      setModalBomLote(null); setObsBomLote(''); setSelecionadosLote({});
      fetchAll();
    }
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
      {/* SELETOR DE SUB-ABAS */}
      <div style={{display:'flex',gap:0,margin:'12px 12px 0',borderRadius:6,overflow:'hidden',border:'2px solid #1e293b'}}>
        <button style={{flex:1,padding:'8px',background:abaEng==='analise'?'#1e293b':'white',color:abaEng==='analise'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaEng('analise')}>📐 Análise</button>
        <button style={{flex:1,padding:'8px',background:abaEng==='desenvolvimento'?'#7c3aed':'white',color:abaEng==='desenvolvimento'?'white':'#7c3aed',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaEng('desenvolvimento')}>🔩 Desenvolvimento</button>
        <button style={{flex:1,padding:'8px',background:abaEng==='horas'?'#0891b2':'white',color:abaEng==='horas'?'white':'#0891b2',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaEng('horas')}>⏱️ Horas/Tarefas</button>
      </div>

      {abaEng === 'desenvolvimento' ? (
        <div style={{ padding:'0 12px' }}>
          <DesenvolvimentoPecasTab currentUser={currentUser} />
        </div>
      ) : abaEng === 'horas' ? (
        <div style={{ padding:'0 12px' }}>
          <HorasTarefasTab currentUser={currentUser} />
        </div>
      ) : <>
      {/* AGENDA */}
      <div style={{ padding:'12px 12px 0' }}>
        <AgendaWidget setor="engenharia" currentUser={currentUser} />
      </div>
      {/* OPLs em Espera ou Devolvidas */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPLs Aguardando Engenharia ({filtrarOpls(opls, busca).length})</span>
          {opls.filter(isEnvioDireto).length > 0 && (
            <span style={{fontSize:10,background:'#fef3c7',color:'#92400e',padding:'3px 8px',borderRadius:10,border:'1px solid #fde68a',fontWeight:700}}>
              📤 {opls.filter(isEnvioDireto).length} envio(s) direto(s) — sem producao
            </span>
          )}
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando Engenharia.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data Entrada</th><th>OPL</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>Status</th>
                <th>Responsavel</th><th>Inicio</th><th>Tempo</th><th>Arquivos</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {(() => {
                  // Agrupa por número base (antes do sufixo /NN) — grupos com
                  // mais de 1 unidade colapsam numa única linha "LOTE" com
                  // ações em lote, ao invés de poluir a tabela com dezenas de
                  // linhas idênticas. Individual continua linha normal.
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

                  const renderLinhaOpl = (o) => {
                    const emAndamento = o.status_geral === 'Em Analise Engenharia';
                    const inicio = o.data_inicio_engenharia ? new Date(o.data_inicio_engenharia) : null;
                    const tempo = inicio ? horasUteis(inicio, new Date()) : null;
                    const envioDireto = isEnvioDireto(o);
                    const emEspera = o.status_geral === 'Em Espera Engenharia';
                    const horasSemIniciar = emEspera && !o.data_inicio_engenharia && o.data_entrada
                      ? horasUteis(o.data_entrada, new Date())
                      : 0;
                    const kpi48h = emEspera && horasSemIniciar > 48;
                    const rowStyle = kpi48h
                      ? { background:'#fef2f2', borderLeft:'4px solid #ef4444' }
                      : envioDireto ? { background:'#fffbeb', borderLeft:'4px solid #f59e0b' } : {};
                    return (
                      <tr key={o.id} style={rowStyle}>
                        <td>{fmtDt(o.data_entrada)}</td>
                        <td>
                          <LinkOpl opl={o} currentUser={currentUser} />
                          {envioDireto && (
                            <div style={{marginTop:2}}>
                              <span style={{fontSize:9,fontWeight:700,background:'#f59e0b',color:'#78350f',padding:'1px 5px',borderRadius:10,letterSpacing:'0.5px'}}>
                                📤 ENVIO DIRETO
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{fontSize:10}}>
                          <div>{semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}</div>
                          <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
                          <div style={{color:'#94a3b8'}}>{semDado(o.placa) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem placa</span> : `🚘 ${o.placa}`}</div>
                        </td>
                        <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                        <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                        <td>
                          <span className="acn-badge" style={{background: emAndamento?'#3b82f6': kpi48h?'#ef4444':'#f59e0b'}}>
                            {o.status_geral}
                            {o.status_geral==='Devolvida para Engenharia' && <span style={{marginLeft:4,color:'#fef2f2',fontSize:9}}>REVISAO</span>}
                          </span>
                          {o.serralheria_status && (
                            <div style={{marginTop:2}}>
                              <span style={{fontSize:9,fontWeight:700,background:o.serralheria_status==='Pendente'?'#7c3aed':'#16a34a',color:'white',padding:'1px 6px',borderRadius:10}}>
                                {o.serralheria_status==='Pendente' ? '🔧 Liberado Parcial (Serralheria)' : '✅ Serralheria concluída'}
                              </span>
                            </div>
                          )}
                          {kpi48h && (
                            <div style={{marginTop:2}}>
                              <span style={{fontSize:9,fontWeight:700,background:'#ef4444',color:'white',padding:'1px 5px',borderRadius:10}}>
                                🔴 {Math.floor(horasSemIniciar)}h sem iniciar
                              </span>
                            </div>
                          )}
                        </td>
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
                                {!o.serralheria_status && (
                                  <button className="acn-btn" style={{background:'#7c3aed',fontSize:9}} title="Antecipar a parte metálica/estrutural pra Serralheria sem esperar o resto do BOM"
                                    onClick={()=>{setModalSerralheria(o);setObsSerralheria('');}}>
                                    🔧 Parcial Serralheria
                                  </button>
                                )}
                                <button className="acn-btn" style={{background:'#ef4444'}} onClick={()=>{setModalDevolver(o);setObsDevolver('');}}>
                                  DEVOLVER
                                </button>
                              </>
                            )}
                            <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                          </div>
                        </td>
                      </tr>
                    );
                  };

                  return itens.map(item => {
                    if (item.tipo === 'single') return renderLinhaOpl(item.row);

                    const { base, irmaos } = item;
                    const expandido = !!lotesExpandidos[base];
                    const qtdEspera = irmaos.filter(o => o.status_geral === 'Em Espera Engenharia' || o.status_geral === 'Devolvida para Engenharia').length;
                    const qtdAndamento = irmaos.filter(o => o.status_geral === 'Em Analise Engenharia').length;
                    const rep = irmaos[0];
                    const envioDireto = isEnvioDireto(rep);
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
                              {envioDireto && (
                                <span style={{marginLeft:4,fontSize:9,fontWeight:700,background:'#f59e0b',color:'#78350f',padding:'1px 5px',borderRadius:10}}>
                                  📤 ENVIO DIRETO
                                </span>
                              )}
                            </div>
                          </td>
                          <td>—</td>
                          <td><span style={{fontWeight:700,color:'#7c3aed'}}>{irmaos.length}</span></td>
                          <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rep.tipo_projeto}</td>
                          <td>
                            {qtdEspera > 0 && <div><span className="acn-badge" style={{background:'#f59e0b',fontSize:9}}>{qtdEspera} aguardando</span></div>}
                            {qtdAndamento > 0 && <div style={{marginTop:2}}><span className="acn-badge" style={{background:'#3b82f6',fontSize:9}}>{qtdAndamento} em análise</span></div>}
                          </td>
                          <td colSpan={3} style={{fontSize:10,color:'#7c6f9c'}}>Ver unidades para detalhes individuais</td>
                          <td>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                              {qtdEspera > 0 && (
                                <button className="acn-btn" style={{background:'#2563eb',fontSize:9}} disabled={iniciandoLote} onClick={()=>iniciarLote(item)}>
                                  ▶️ INICIAR EM LOTE ({qtdEspera})
                                </button>
                              )}
                              <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={()=>abrirBomLote(rep)}>
                                ✅ LIBERAR BOM EM LOTE
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
                <th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Ação</th>
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
                      <td style={{maxWidth:130,fontSize:10}}>
                        <div>{semDado(os.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : os.modelo}</div>
                        <div style={{color:'#94a3b8'}}>{semDado(os.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${os.chassi}`}</div>
                      </td>
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

      <AnaliseWidget setor="Engenharia" currentUser={currentUser} />
      <DemandasSetorWidget setor="Engenharia" cor="#2563eb" currentUser={currentUser} />
      <OplMovimentadas setor="Engenharia" />
      <DemandaFooter setor="Engenharia" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

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
            <label className="acn-label">Responsável pela Execução *</label>
            <ColaboradorSelect
              value={responsavelEng} onChange={setResponsavelEng}
              placeholder="Selecione o responsável"
              className="acn-input" style={{width:'100%',marginBottom:4}}
              autoFocus onKeyDown={e=>e.key==='Enter'&&confirmarIniciarEng()} />
            <div style={{fontSize:10,color:'#94a3b8',marginBottom:12}}>
              Pre-preenchido com seu nome. Altere se outra pessoa vai executar.
            </div>

            <div style={{background: precisaDesenvolvimento ? '#f5f3ff' : '#f8fafc', border:`1.5px solid ${precisaDesenvolvimento ? '#c4b5fd' : '#e2e8f0'}`, borderRadius:6, padding:'8px 10px', marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                <input type="checkbox" checked={precisaDesenvolvimento}
                  onChange={e=>setPrecisaDesenvolvimento(e.target.checked)}
                  style={{width:15,height:15,cursor:'pointer',accentColor:'#7c3aed'}} />
                <span style={{fontSize:11,fontWeight:700,color: precisaDesenvolvimento ? '#6d28d9' : '#475569'}}>
                  🔩 Precisa de Desenvolvimento
                </span>
              </label>
              {precisaDesenvolvimento && (
                <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical',marginTop:8}}
                  placeholder="O que precisa ser desenvolvido? (gera demanda automática na aba Desenvolvimento)"
                  value={descDesenvolvimento} onChange={e=>setDescDesenvolvimento(e.target.value)} />
              )}
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

      {/* MODAL LIBERAÇÃO PARCIAL SERRALHERIA — antecipa a parte metálica/estrutural sem esperar o resto do BOM */}
      {modalSerralheria && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">🔧 Liberar Parcial p/ Serralheria — {modalSerralheria.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              A Serralheria começa essa parte já; você continua a análise e libera o saldo do BOM pro PCP
              normalmente quando terminar (essa liberação parcial não interfere na liberação do BOM completo).
            </div>
            <label className="acn-label">O que a Serralheria precisa fazer *</label>
            <textarea className="acn-input" rows={4} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Descreva a parte metálica/estrutural a ser feita..."
              value={obsSerralheria} onChange={e=>setObsSerralheria(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#7c3aed',flex:1}} disabled={enviandoSerralheria} onClick={liberarParcialSerralheria}>
                {enviandoSerralheria ? 'Enviando...' : 'ENVIAR PARA SERRALHERIA'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} disabled={enviandoSerralheria} onClick={()=>{setModalSerralheria(null);setObsSerralheria('');}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOM EM LOTE — OPs desmembradas (mesmo numero base) */}
      {modalBomLote && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:560,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">🏷️ Liberar BOM em Lote — {modalBomLote.base}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              {modalBomLote.irmaos.length} OPs desmembradas deste número. Desmarque as que não devem receber este BOM
              (ex: alguma unidade com especificação diferente das demais).
            </div>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:8,marginBottom:10,maxHeight:220,overflowY:'auto'}}>
              {modalBomLote.irmaos.map(o => (
                <label key={o.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 2px',fontSize:11,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!selecionadosLote[o.id]}
                    onChange={e=>setSelecionadosLote(s=>({...s,[o.id]:e.target.checked}))}
                    style={{width:14,height:14,cursor:'pointer'}} />
                  <span style={{flex:1}}>{o.opl}</span>
                  <span style={{fontSize:9,color:'#94a3b8'}}>{o.status_geral}</span>
                </label>
              ))}
            </div>
            <label className="acn-label">Observações para PCP/Almoxarifado (aplicadas a todas as selecionadas)</label>
            <textarea className="acn-input" rows={4} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Detalhes do BOM, itens especiais, pendencias..."
              value={obsBomLote} onChange={e=>setObsBomLote(e.target.value)} />
            <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px',marginBottom:10,fontSize:10,color:'#92400e'}}>
              ⚠️ OPs que ainda não foram iniciadas na Engenharia serão marcadas como iniciadas agora mesmo (responsável: você),
              já que a liberação em lote pula a etapa individual de "Iniciar".
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#7c3aed',flex:1,opacity:liberandoLote?0.6:1}} onClick={liberarBomLote} disabled={liberandoLote}>
                {liberandoLote ? 'Liberando...' : `LIBERAR BOM PARA ${Object.values(selecionadosLote).filter(Boolean).length} OPs`}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalBomLote(null)} disabled={liberandoLote}>Cancelar</button>
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
      </>}
    </div>
  );
}
