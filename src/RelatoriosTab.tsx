// @ts-nocheck
import { supabase } from './supabaseClient';
import { baseOplDe, lerDivisorPorBaseDeLote } from './OpLotes';
import { VeiculoOuEnvio } from './AcnTabShared';
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { labelHierarquico } from './CentroCustoShared';
import { MARKUP_BANDAS, corMarkup, markupPonderadoItens, cotacaoAlvo, Termometro } from './MarkupTermometro';
import { RelDossieOp } from './OpDossie';
import { hojeISO, diaISO, Botao, Chips, Selo, Tag, Faixa, rotuloStatus } from './Interface';
import Icone from './Icone';
import { mdiPrinterOutline, mdiFileExcelOutline, mdiLinkVariant } from '@mdi/js';
import { STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, STATUS_AGUARDANDO_LIBERACAO_COMERCIAL_ANTIGO, STATUS_LIBERACAO_COMERCIAL_TODOS } from './FluxoEntrega';


const SETORES_DEMANDA = ['Chicotes','Serralheria','Laboratorio','Compras'];
const semDado = (v) => !v || !String(v).trim();

function fmtDt(d) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fmtData(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }
function fmtH(h) { return h != null ? Number(h).toFixed(1)+'h' : '—'; }
function iniPeriodo() {
  const d = new Date(); d.setDate(d.getDate()-30);
  return diaISO(d);
}

// ── Peças que se repetiam nos 13 relatórios ──────────────────────────────────
// Etapa 12 do plano de UX (30/09/2026): os relatórios pintavam à mão, em cada um, o filtro de período, os cartões de resumo,
// os selos de status (uma tabela de cores hex só para isso) e a barra de abas. Agora usam o design system (Botao, Chips, Selo,
// Tag, Faixa, acn-kpi, acn-tabela, acn-filtros, acn-linha-*): o status tem uma cor por família, igual em todas as telas.
// Só aparência — as consultas, as contas e o que cada tabela mostra são os mesmos de antes.
const TOM = { neutro:'var(--acn-neutral)', atencao:'var(--acn-warn)', info:'var(--acn-info)', ok:'var(--acn-ok)', erro:'var(--acn-bad)', marca:'var(--acn-brand)' };

// cartões de resumo: { l: rótulo, v: valor, tom, onClick?, apagado? }
function Indicadores({ itens, carregando = false }) {
  return (
    <div className="acn-kpis">
      {itens.map(k => (
        <div key={k.l} className={'acn-kpi' + (k.onClick ? ' clicavel' : '') + (k.apagado ? ' apagado' : '')}
          onClick={k.onClick} role={k.onClick ? 'button' : undefined} tabIndex={k.onClick ? 0 : undefined}>
          <span className="rot"><i style={{ background: TOM[k.tom || 'neutro'] }} />{k.l}</span>
          <span className="val acn-num">{carregando ? '...' : k.v}</span>
        </div>
      ))}
    </div>
  );
}

// "De / Até / Filtrar" (+ Imprimir); o que mais o relatório tiver de filtro entra como children
function FiltroPeriodo({ ini, setIni, fim, setFim, onFiltrar, imprimir = false, children = null }) {
  return (
    <div className="acn-filtros acn-filtros-campos">
      <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" value={ini} onChange={e=>setIni(e.target.value)}/></div>
      <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" value={fim} onChange={e=>setFim(e.target.value)}/></div>
      <Botao variante="primario" onClick={onFiltrar}>Filtrar</Botao>
      {imprimir && <Botao variante="secundario" icone={mdiPrinterOutline} onClick={()=>window.print()}>Imprimir</Botao>}
      {children}
    </div>
  );
}

// botão de imprimir só com o ícone, para o cabeçalho de um quadro
const BotaoImprimir = () => <Botao pequeno variante="discreto" icone={mdiPrinterOutline} aria-label="Imprimir" title="Imprimir" onClick={()=>window.print()} />;

// ── Relatório por Área (demandas_setoriais) ──
function RelAreaDemandas() {
  const [setor, setSetor] = useState('Chicotes');
  const [ini, setIni] = useState(iniPeriodo);
  const [fim, setFim] = useState(hojeISO());
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
        <div className="acn-filtros acn-filtros-campos">
          <div className="form-group">
            <label className="acn-label">Setor</label>
            <Chips rotulo="Setor" ativo={setor} onChange={setSetor} itens={SETORES_DEMANDA.map(s => ({ id: s, rotulo: s }))} />
          </div>
          <div className="form-group"><label className="acn-label">De</label><input type="date" className="acn-input" value={ini} onChange={e=>setIni(e.target.value)}/></div>
          <div className="form-group"><label className="acn-label">Até</label><input type="date" className="acn-input" value={fim} onChange={e=>setFim(e.target.value)}/></div>
          <Botao variante="primario" onClick={buscar}>Filtrar</Botao>
        </div>
      </div>
      <Indicadores carregando={carregando} itens={[
        {l:'Total',v:dados.length,tom:'neutro'},
        {l:'Pendentes',v:pendentes.length,tom:'atencao'},
        {l:'Em Andamento',v:andamento.length,tom:'info'},
        {l:'Concluídas',v:concluidos.length,tom:'ok'},
        {l:'Atrasadas >48h',v:atrasados.length,tom:'erro'},
        {l:'Paradas >8h',v:paradas.length,tom:'atencao'},
        {l:'Tempo Médio',v:tempoMedio?fmtH(tempoMedio):'—',tom:tempoMedio&&tempoMedio<24?'ok':'atencao'},
      ]} />
      {/* tabela */}
      <div className="sec-card">
        <div className="sec-hdr">{setor} — {dados.length} registros no período</div>
        <div className="sec-body acn-rolagem">
          {carregando ? <div className="acn-empty">Carregando...</div> :
           dados.length===0 ? <div className="acn-empty">Nenhuma demanda no período.</div> : (
            <table className="acn-tabela">
              <thead><tr>
                <th>Data</th><th>OP</th><th>Descrição</th><th>Status</th>
                <th>Responsável</th><th>Abertura</th><th>Conclusão</th><th>Tempo</th>
              </tr></thead>
              <tbody>
                {dados.map(d=>{
                  const hrs = d.data_abertura ? (agora-new Date(d.data_abertura))/3600000 : 0;
                  const atras = d.status!=='Concluido' && hrs>48;
                  return (
                    <tr key={d.id} className={atras?'acn-linha-alerta':undefined}>
                      <td>{fmtData(d.data_abertura)}</td>
                      <td>{d.numero_opl||'—'}</td>
                      <td className="acn-texto-longo">{d.descricao||'—'}</td>
                      <td><Selo status={d.status} /></td>
                      <td>{d.responsavel_nome||'—'}</td>
                      <td>{fmtDt(d.data_abertura)}</td>
                      <td>{fmtDt(d.data_conclusao)}</td>
                      <td className={atras?'acn-txt-erro':undefined}>{fmtH(d.tempo_execucao_horas)}</td>
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
  const [fim, setFim] = useState(hojeISO());
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [agrupar, setAgrupar] = useState(true);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples').select(
      'id,opl,chassi,modelo,placa,tipo_projeto,status_geral,responsavel_producao,tecnicos_producao,data_inicio_producao,data_fim_producao,tempo_producao_horas,fluxo_entrega,quantidade'
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
  const conc   = ops.filter(o=>['Aguardando CQ',...STATUS_LIBERACAO_COMERCIAL_TODOS,'Faturado e Disponivel para Entrega','Faturado'].includes(o.status_geral)).length;
  const tempos = ops.map(o=>o.tempo_producao_horas).filter(v=>v>0);
  const tMedio = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : null;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">Relatório de Produção por Executor</div>
        <FiltroPeriodo ini={ini} setIni={setIni} fim={fim} setFim={setFim} onFiltrar={buscar}>
          <Botao variante={agrupar?'primario':'secundario'} onClick={()=>setAgrupar(!agrupar)}>{agrupar?'Agrupar: ON':'Agrupar: OFF'}</Botao>
        </FiltroPeriodo>
      </div>
      <Indicadores carregando={carregando} itens={[
        {l:'Total OPs',v:ops.length,tom:'neutro'},
        {l:'Em Produção',v:emProd,tom:'info'},
        {l:'Concluídas',v:conc,tom:'ok'},
        {l:'Tempo Médio',v:tMedio?fmtH(tMedio):'—',tom:'marca'},
        {l:'Executores',v:Object.keys(porResp).length,tom:'neutro'},
      ]} />
      {carregando ? <div className="acn-empty">Carregando...</div> : ops.length===0 ? <div className="acn-empty">Nenhum dado no período.</div> :
      agrupar ? (
        Object.entries(porResp).sort((a,b)=>b[1].length-a[1].length).map(([resp,itens])=>{
          const t = itens.map(i=>i.tempo_producao_horas).filter(v=>v>0);
          const med = t.length ? t.reduce((a,b)=>a+b,0)/t.length : null;
          const conc2 = itens.filter(i=>['Aguardando CQ',...STATUS_LIBERACAO_COMERCIAL_TODOS,'Faturado e Disponivel para Entrega','Faturado'].includes(i.status_geral)).length;
          return (
            <div key={resp} className="sec-card">
              <div className="sec-hdr">
                <span>{resp}</span>
                <span className="acn-fraco">
                  {itens.length} OPs | {conc2} concluídas
                  {med ? ` | média: ${fmtH(med)}` : ''}
                </span>
              </div>
              <div className="sec-body acn-rolagem">
                <table className="acn-tabela">
                  <thead><tr><th>OP</th><th>Veículo</th><th>Tipo</th><th>Status</th><th>Técnicos</th><th>Início Prod.</th><th>Fim Prod.</th><th>Tempo</th></tr></thead>
                  <tbody>
                    {itens.map(o=>(
                      <tr key={o.id}>
                        <td><strong className="acn-forte">{o.opl}</strong></td>
                        <td>
                          <VeiculoOuEnvio o={o} />
                        </td>
                        <td>{o.tipo_projeto}</td>
                        <td><Selo status={o.status_geral} /></td>
                        <td>{Array.isArray(o.tecnicos_producao)?o.tecnicos_producao.join(', '):'—'}</td>
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
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela">
              <thead><tr><th>OP</th><th>Veículo</th><th>Tipo</th><th>Status</th><th>Executor</th><th>Técnicos</th><th>Início Prod.</th><th>Tempo</th></tr></thead>
              <tbody>
                {ops.map(o=>(
                  <tr key={o.id}>
                    <td><strong className="acn-forte">{o.opl}</strong></td>
                    <td>
                      <VeiculoOuEnvio o={o} />
                    </td>
                    <td>{o.tipo_projeto}</td>
                    <td><Selo status={o.status_geral} /></td>
                    <td>{o.responsavel_producao||'—'}</td>
                    <td>{Array.isArray(o.tecnicos_producao)?o.tecnicos_producao.join(', '):'—'}</td>
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
  const [fim, setFim] = useState(hojeISO());
  const [ops, setOps] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [carregando, setCarregando] = useState(false);

  const GRUPOS = {
    'Em Andamento': ['Em Espera PCP','Em Analise Engenharia','Aguardando Almox','Kit OK - Pronto para Producao','Aguardando Inicio Producao','Em Producao','Aguardando CQ'],
    'Paradas': ['Devolvida para Engenharia','Devolvida Comercial','Retrabalho'],
    'Finalizadas': [...STATUS_LIBERACAO_COMERCIAL_TODOS,'Aguarda Emissao NF','Faturado e Disponivel para Entrega','Faturado'],
  };

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples').select(
      'id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,tempo_producao_horas,responsavel_engenharia,responsavel_producao,fluxo_entrega,quantidade'
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
        <div className="sec-hdr">Relatório Geral de OPs</div>
        <FiltroPeriodo ini={ini} setIni={setIni} fim={fim} setFim={setFim} onFiltrar={buscar}>
          <Chips rotulo="Grupo de status" className="acn-filtros-dir" ativo={filtroStatus} onChange={setFiltroStatus}
            itens={['Todos','Em Andamento','Paradas','Finalizadas'].map(s => ({ id: s, rotulo: s }))} />
        </FiltroPeriodo>
      </div>
      <Indicadores carregando={carregando} itens={[
        {l:'Total',v:ops.length,tom:'neutro'},
        {l:'Em Andamento',v:andamento,tom:'info'},
        {l:'Paradas/Devolvidas',v:paradas,tom:'erro'},
        {l:'Finalizadas',v:finalizadas,tom:'ok'},
        {l:'Atrasadas',v:atrasadas,tom:'erro'},
      ]} />
      <div className="sec-card">
        <div className="sec-hdr">{lista.length} OPs — {filtroStatus}</div>
        <div className="sec-body acn-rolagem">
          {carregando ? <div className="acn-empty">Carregando...</div> :
           lista.length===0 ? <div className="acn-empty">Nenhuma OP no filtro.</div> : (
            <table className="acn-tabela">
              <thead><tr>
                <th>Data Entrada</th><th>OP</th><th>Veículo</th><th>Tipo Projeto</th>
                <th>Status</th><th>Prev. Entrega</th><th>Engenharia</th><th>Produção</th>
              </tr></thead>
              <tbody>
                {lista.map(o=>{
                  const atras = o.data_prevista_entrega && new Date(o.data_prevista_entrega)<agora && !GRUPOS['Finalizadas'].includes(o.status_geral);
                  return (
                    <tr key={o.id} className={atras?'acn-linha-alerta':undefined}>
                      <td>{fmtData(o.data_entrada)}</td>
                      <td><strong className="acn-forte">{o.opl}</strong></td>
                      <td>
                        <VeiculoOuEnvio o={o} />
                      </td>
                      <td>{o.tipo_projeto}</td>
                      <td><Selo status={o.status_geral} /></td>
                      <td className={atras?'acn-txt-erro':undefined}>{fmtData(o.data_prevista_entrega)}</td>
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
  const [fim, setFim] = useState(hojeISO());
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const STATUS_FINAL = [...STATUS_LIBERACAO_COMERCIAL_TODOS,'Aguarda Emissao NF','Faturado e Disponivel para Entrega','Faturado'];

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,data_entrega,data_fim_producao,cliente_nome,responsavel_producao,fluxo_entrega,quantidade')
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
        <div className="sec-hdr">OPs Finalizadas por Período</div>
        <FiltroPeriodo ini={ini} setIni={setIni} fim={fim} setFim={setFim} onFiltrar={buscar} imprimir />
      </div>
      <Indicadores carregando={carregando} itens={[
        {l:'Total Finalizadas',v:ops.length,tom:'neutro'},
        {l:'Faturadas/Entregues',v:faturadas,tom:'ok'},
        {l:'Disp. Entrega',v:dispEntrega,tom:'info'},
      ]} />
      <div className="sec-card">
        <div className="sec-body acn-rolagem">
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty">Nenhuma OP finalizada no período.</div>:(
            <table className="acn-tabela"><thead><tr>
              <th>OP</th><th>Veículo</th><th>Cliente</th><th>Tipo</th><th>Status</th>
              <th>Entrada</th><th>Prev. Entrega</th><th>Data Entrega</th><th>Responsável Prod.</th>
            </tr></thead><tbody>
              {ops.map(o=>(
                <tr key={o.id}>
                  <td><strong className="acn-forte">{o.opl}</strong></td>
                  <td>
                    <VeiculoOuEnvio o={o} />
                  </td>
                  <td>{o.cliente_nome||'—'}</td>
                  <td>{o.tipo_projeto}</td>
                  <td><Selo status={o.status_geral} /></td>
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
    'Comercial/Fiscal':[...STATUS_LIBERACAO_COMERCIAL_TODOS,'Aguarda Emissao NF','Faturado e Disponivel para Entrega','Devolvida Comercial'],
    'Manutenção':     ['Aguardando Agendamento Manutenção','Manutenção Agendada'],
  };

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome,fluxo_entrega,quantidade')
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
        <div className="sec-hdr">OPs em Andamento — Distribuição por Setor</div>
        <div className="acn-filtros">
          <Chips rotulo="Setor" ativo={setor} onChange={setSetor}
            itens={['Todos',...Object.keys(SETORES_STATUS)].map(s => ({ id: s, rotulo: s }))} />
          <span className="acn-filtros-dir"><BotaoImprimir /></span>
        </div>
      </div>
      <Indicadores carregando={carregando} itens={[
        ...Object.entries(SETORES_STATUS).map(([s,statuses])=>{
          const n = ops.filter(o=>statuses.includes(o.status_geral)).length;
          return { l:s, v:n, tom:'info', onClick:()=>setSetor(s), apagado:n===0 };
        }),
        { l:'Atrasadas', v:atrasadas, tom:'erro' },
      ]} />
      <div className="sec-card">
        <div className="sec-hdr">{lista.length} OPs — {setor}</div>
        <div className="sec-body acn-rolagem">
          {carregando?<div className="acn-empty">Carregando...</div>:lista.length===0?<div className="acn-empty">Nenhuma OP.</div>:(
            <table className="acn-tabela"><thead><tr><th>OP</th><th>Veículo</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Entrada</th><th>Prev. Entrega</th></tr></thead>
            <tbody>{lista.map(o=>{
              const atras = o.data_prevista_entrega && new Date(o.data_prevista_entrega)<agora;
              return <tr key={o.id} className={atras?'acn-linha-alerta':undefined}>
                <td><strong className="acn-forte">{o.opl}</strong></td>
                <td>
                  <VeiculoOuEnvio o={o} />
                </td>
                <td>{o.cliente_nome||'—'}</td>
                <td>{o.tipo_projeto}</td>
                <td><Selo status={o.status_geral} /></td>
                <td>{fmtData(o.data_entrada)}</td>
                <td className={atras?'acn-txt-erro':undefined}>{fmtData(o.data_prevista_entrega)}</td>
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
      .select('id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome,responsavel_engenharia,responsavel_producao,fluxo_entrega,quantidade')
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
    'Comercial':[...STATUS_LIBERACAO_COMERCIAL_TODOS,'Aguarda Emissao NF','Devolvida Comercial'],
  };
  const porSetor = (o) => Object.entries(SETORES_STATUS).find(([,ss])=>ss.includes(o.status_geral))?.[0] || 'Outros';
  const diasAtraso = (o) => Math.floor((agora.getTime()-new Date(o.data_prevista_entrega).getTime())/86400000);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPs Atrasadas <Selo familia="erro" ponto={false}>{ops.length}</Selo></span>
          <BotaoImprimir />
        </div>
      </div>
      <Indicadores carregando={carregando} itens={Object.keys(SETORES_STATUS).map(s => {
        const n = ops.filter(o=>porSetor(o)===s).length;
        return { l:s, v:n, tom:n>0?'erro':'neutro' };
      })} />
      <div className="sec-card">
        <div className="sec-body acn-rolagem">
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty">Nenhuma OP atrasada!</div>:(
            <table className="acn-tabela"><thead><tr><th>OP</th><th>Veículo</th><th>Cliente</th><th>Setor Atual</th><th>Status</th><th>Prev. Entrega</th><th>Atraso</th></tr></thead>
            <tbody>{ops.map(o=>(
              <tr key={o.id} className="acn-linha-alerta">
                <td><strong className="acn-forte">{o.opl}</strong></td>
                <td>
                  <VeiculoOuEnvio o={o} />
                </td>
                <td>{o.cliente_nome||'—'}</td>
                <td><strong className="acn-txt-erro">{porSetor(o)}</strong></td>
                <td><Selo familia="erro" ponto={false}>{rotuloStatus(o.status_geral)}</Selo></td>
                <td className="acn-txt-erro">{fmtData(o.data_prevista_entrega)}</td>
                <td className="acn-txt-erro">{diasAtraso(o)}d</td>
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
  const [fim, setFim] = useState(hojeISO());
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
      supabase.from('oples').select('id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrega,data_prevista_entrega,cliente_nome,fluxo_entrega,quantidade')
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
        <FiltroPeriodo ini={ini} setIni={setIni} fim={fim} setFim={setFim} onFiltrar={buscar} imprimir />
        <div className="sec-body">
          <Chips rotulo="Mostrar" ativo={aba} onChange={setAba} itens={[
            { id: 'rec', rotulo: `Recebimentos de Mercadoria (${recebimentos.length})` },
            { id: 'env', rotulo: `Envios/Entregas (${envios.length})` },
          ]} />
        </div>
      </div>
      {aba==='rec' && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span>Recebimentos Previstos <Selo familia="info" ponto={false}>{recebimentos.length}</Selo></span>
          </div>
          <div className="sec-body acn-rolagem">
            {carregando?<div className="acn-empty">Carregando...</div>:recebimentos.length===0?<div className="acn-empty">Nenhum recebimento no período.</div>:(
              <table className="acn-tabela"><thead><tr><th>Nº Pedido</th><th>Descrição</th><th>Fornecedor</th><th>Qtd</th><th>Prev. Recebimento</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>{recebimentos.map(r=>{
                const hoje = new Date(); hoje.setHours(0,0,0,0);
                const dt = r.data_prevista_recebimento ? new Date(r.data_prevista_recebimento.slice(0,10)+'T00:00:00') : null;
                // 'Recebido' desde 22/09/2026 (era 'Concluído'): com o nome
                // antigo, compra já recebida continuava saindo como atrasada
                const atras = dt && dt < hoje && r.status_compra !== 'Recebido';
                return <tr key={r.id} className={atras?'acn-linha-alerta':undefined}>
                  <td><strong className="acn-forte">{r.numero_pedido||'—'}</strong></td>
                  <td className="acn-texto-longo">{r.descricao_material||'—'}</td>
                  <td>{r.fornecedor||'—'}</td>
                  <td>{r.quantidade||'—'}</td>
                  <td className={atras?'acn-txt-erro':undefined}>{fmtData(r.data_prevista_recebimento)}</td>
                  <td>{fmtVal(r.valor_compra)}</td>
                  <td><Selo familia={r.status_compra==='Recebido'?'ok':r.status_compra==='Em Andamento'?'info':'neutro'}>{r.status_compra||'—'}</Selo></td>
                </tr>;
              })}</tbody></table>
            )}
          </div>
        </div>
      )}
      {aba==='env' && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span>Envios/Entregas <Selo familia="ok" ponto={false}>{envios.length}</Selo></span>
          </div>
          <div className="sec-body acn-rolagem">
            {carregando?<div className="acn-empty">Carregando...</div>:envios.length===0?<div className="acn-empty">Nenhum envio no período.</div>:(
              <table className="acn-tabela"><thead><tr><th>OP</th><th>Veículo</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Data Entrega</th></tr></thead>
              <tbody>{envios.map(o=>(
                <tr key={o.id}>
                  <td><strong className="acn-forte">{o.opl}</strong></td>
                  <td>
                    <VeiculoOuEnvio o={o} />
                  </td>
                  <td>{o.cliente_nome||'—'}</td>
                  <td>{o.tipo_projeto}</td>
                  <td><Selo familia="ok">{rotuloStatus(o.status_geral)}</Selo></td>
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
  const [fim, setFim] = useState(hojeISO());
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
        <div className="sec-hdr">Demandas Avulsas (sem OP vinculada)</div>
        <FiltroPeriodo ini={ini} setIni={setIni} fim={fim} setFim={setFim} onFiltrar={buscar} imprimir />
      </div>
      <Indicadores itens={Object.entries(porSetor).sort((a,b)=>b[1]-a[1]).map(([s,n]) => ({ l:s, v:n, tom:'marca' }))} />
      <div className="sec-card">
        <div className="sec-hdr">{dados.length} Demandas Avulsas no período</div>
        <div className="sec-body acn-rolagem">
          {carregando?<div className="acn-empty">Carregando...</div>:dados.length===0?<div className="acn-empty">Nenhuma demanda avulsa no período.</div>:(
            <table className="acn-tabela"><thead><tr><th>Data</th><th>Setor</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Tempo</th></tr></thead>
            <tbody>{dados.map(d=>(
              <tr key={d.id}>
                <td>{fmtData(d.data_abertura)}</td>
                <td>{d.setor_destino||'—'}</td>
                <td className="acn-texto-longo">{d.descricao||'—'}</td>
                <td><Selo status={d.status} /></td>
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
      .select('id,opl,chassi,modelo,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,cliente_nome,responsavel_engenharia,responsavel_producao,fluxo_entrega,quantidade')
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
        <div className="sec-hdr">
          <span>OPs Paradas / Devolvidas <Selo familia="atencao" ponto={false}>{ops.length}</Selo></span>
          <BotaoImprimir />
        </div>
      </div>
      <Indicadores carregando={carregando} itens={STATUS_PARADA.map(s => {
        const n = ops.filter(o=>o.status_geral===s).length;
        return { l:s, v:n, tom:n>0?'atencao':'neutro' };
      })} />
      <div className="sec-card">
        <div className="sec-body acn-rolagem">
          {carregando?<div className="acn-empty">Carregando...</div>:ops.length===0?<div className="acn-empty">Nenhuma OP parada!</div>:(
            <table className="acn-tabela"><thead><tr><th>OP</th><th>Veículo</th><th>Cliente</th><th>Motivo</th><th>Entrada</th><th>Prev. Entrega</th><th>Dias Parada</th></tr></thead>
            <tbody>{ops.sort((a,b)=>diasParada(b)-diasParada(a)).map(o=>(
              <tr key={o.id} className="acn-linha-alerta">
                <td><strong className="acn-forte">{o.opl}</strong></td>
                <td>
                  <VeiculoOuEnvio o={o} />
                </td>
                <td>{o.cliente_nome||'—'}</td>
                <td><Selo familia="atencao">{rotuloStatus(o.status_geral)}</Selo></td>
                <td>{fmtData(o.data_entrada)}</td>
                <td className="acn-txt-erro">{fmtData(o.data_prevista_entrega)}</td>
                <td className="acn-txt-erro">{diasParada(o)}d</td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── REL CENTRO DE CUSTO ──
function RelCentroCusto() {
  const [rows, setRows] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data, error }, { data: dData }, { data: cData }] = await Promise.all([
        supabase.from('pcp_pedidos_compra')
          .select('id,numero_pedido,descricao_material,fornecedor,valor_total:valor_compra,centro_custo,centro_custo_id,status_compra,data_pedido:data_criacao')
          .or('centro_custo.not.is.null,centro_custo_id.not.is.null')
          .order('data_criacao',{ascending:false}),
        supabase.from('centro_custo_despesas').select('*').order('data',{ascending:false}),
        supabase.from('centros_custo').select('*'),
      ]);
      if (!error && data) setRows(data);
      setDespesas(dData || []);
      setCentrosCusto(cData || []);
      setLoading(false);
    })();
  }, []);

  // Normaliza despesas avulsas para o mesmo formato de linha das compras,
  // para poderem entrar na mesma tabela/agrupamento.
  const despesasComoLinhas = despesas
    .filter((d: any) => d.centro_custo_id)
    .map((d: any) => ({
      id: `desp-${d.id}`, numero_pedido: null, descricao_material: d.descricao || 'Despesa avulsa',
      fornecedor: d.criado_por_nome || null, valor_total: d.valor, centro_custo: null,
      centro_custo_id: d.centro_custo_id, status_compra: 'Despesa avulsa', data_pedido: d.data,
      isDespesa: true,
    }));
  const todasLinhas = [...rows, ...despesasComoLinhas];

  // Agrupar por centro de custo — prioriza a FK real (centro_custo_id, com
  // cadeia hierárquica no rótulo) sobre o texto livre legado, propagando
  // cada item também para todos os centros ANCESTRAIS (um pedido/despesa de
  // um centro filho conta também no total do pai, do avô, etc).
  const centrosPorId = Object.fromEntries(centrosCusto.map((c: any) => [c.id, c]));
  const ancestraisEDe = (centroId: string) => {
    const cadeia: any[] = [];
    let atual = centrosPorId[centroId];
    let guarda = 0;
    while (atual && guarda++ < 10) { cadeia.push(atual); atual = atual.parent_id ? centrosPorId[atual.parent_id] : null; }
    return cadeia;
  };
  const grupos: Record<string,any[]> = {};
  for (const r of todasLinhas) {
    if (r.centro_custo_id && centrosPorId[r.centro_custo_id]) {
      for (const c of ancestraisEDe(r.centro_custo_id)) {
        const k = labelHierarquico(c, centrosCusto) + ' — ' + c.nome;
        if (!grupos[k]) grupos[k] = [];
        grupos[k].push(r);
      }
    } else {
      const k = r.centro_custo || '—';
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(r);
    }
  }
  const centros = Object.keys(grupos).sort();

  const fmt = (v:any) => v!=null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
  const total = (g:any[]) => g.reduce((s,r)=>s+Number(r.valor_total||0),0);

  if (loading) return <div className="acn-empty">Carregando...</div>;
  if (centros.length===0) return <div className="acn-empty">Nenhuma compra ou despesa com centro de custo definido.</div>;

  const totalGeral = todasLinhas.reduce((s,r)=>s+Number(r.valor_total||0),0);

  return (
    <div>
      {/* Resumo geral */}
      <Indicadores itens={[
        { l:'CENTROS COM LANÇAMENTOS', v:centros.length, tom:'info' },
        { l:'TOTAL GERAL (COMPRAS + DESPESAS)', v:fmt(totalGeral), tom:'ok' },
        { l:'LANÇAMENTOS TOTAL', v:todasLinhas.length, tom:'atencao' },
      ]} />

      {/* Um quadro por centro de custo, RECOLHIDO ao abrir: o clique no cabeçalho abre e fecha (recolhimento do quadro, o mesmo do resto do sistema) */}
      {centros.map(centro => {
        const itens = grupos[centro];
        const tot = total(itens);
        const pct = totalGeral > 0 ? (tot/totalGeral*100).toFixed(1) : '0';
        return (
          <div key={centro} className="sec-card sec-collapsed">
            <div className="sec-hdr">
              <span className="acn-forte">{centro}</span>
              <span className="acn-fraco">{itens.length} pedido{itens.length!==1?'s':''}</span>
              <Selo familia="info" ponto={false}>{fmt(tot)}</Selo>
              <Tag>{pct}%</Tag>
            </div>
            <div className="sec-body acn-rolagem">
              <table className="acn-tabela">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Descrição</th>
                    <th>Fornecedor</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th className="acn-dir">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map(r=>(
                    <tr key={r.id}>
                      <td><strong className="acn-forte">{r.numero_pedido||'—'}</strong></td>
                      <td className="acn-texto-longo">{r.descricao_material||'—'}</td>
                      <td>{r.fornecedor||'—'}</td>
                      <td><Tag>{r.status_compra||'—'}</Tag></td>
                      <td>{r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="acn-dir acn-forte">{fmt(r.valor_total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="acn-dir acn-fraco">TOTAL {centro}</td>
                    <td className="acn-dir acn-forte">{fmt(tot)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── RELATÓRIO DE MARKUP POR VENDEDOR ──
// Agrupa as cotações vinculadas (cotacoes_precos_vinculos) por vendedor —
// responsável no Comercial/CRM, operador/analista em Licitações — usando a
// mesma regra de "cotação alvo" (vencedora, senão a de maior versão) e a
// mesma média por item que já alimenta o termômetro nos cards
// (markupPonderadoItens/cotacaoAlvo, MarkupTermometro.tsx — sem duplicar a conta).
function RelMarkupVendedor() {
  const hoje = new Date();
  const [mes, setMes]     = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`);
  const [funil, setFunil] = useState('todos'); // 'todos' | 'crm' | 'licitacao'
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      const tipos = funil === 'todos' ? ['crm', 'licitacao'] : [funil];
      const { data: vinc } = await supabase.from('cotacoes_precos_vinculos')
        .select('cotacao_id, processo_id, tipo').in('tipo', tipos);
      if (!vinc || !vinc.length) { setLinhas([]); setLoading(false); return; }

      const cotacaoIds = [...new Set(vinc.map((v) => v.cotacao_id))];
      const { data: cotacoes } = await supabase.from('cotacoes_precos')
        .select('id, itens, vencedora, versao, criado_em').in('id', cotacaoIds);
      const cotacaoPorId = {};
      (cotacoes || []).forEach((c) => { cotacaoPorId[c.id] = c; });

      // Agrupa por processo (tipo+id) — pode haver várias versões da mesma cotação
      const cotsPorProcesso = {};
      vinc.forEach((v) => {
        const c = cotacaoPorId[v.cotacao_id];
        if (!c) return;
        const chave = `${v.tipo}:${v.processo_id}`;
        (cotsPorProcesso[chave] ||= []).push(c);
      });

      // Resolve a cotação alvo de cada processo, filtra por mês (criado_em) e
      // calcula a média — separa os ids por tipo pra buscar o nome do vendedor
      const processosCrm = [], processosLic = [];
      const alvoPorProcesso = {};
      Object.entries(cotsPorProcesso).forEach(([chave, cots]) => {
        const [tipo, processoId] = chave.split(':');
        const alvo = cotacaoAlvo(cots);
        if (!alvo) return;
        if (mes && (alvo.criado_em || '').slice(0, 7) !== mes) return;
        const media = markupPonderadoItens(alvo.itens);
        if (media === null) return;
        alvoPorProcesso[chave] = { tipo, processoId, media };
        (tipo === 'crm' ? processosCrm : processosLic).push(processoId);
      });

      const [{ data: crmData }, { data: licData }] = await Promise.all([
        processosCrm.length ? supabase.from('crm_oportunidades').select('id, responsavel_nome').in('id', processosCrm) : Promise.resolve({ data: [] }),
        processosLic.length ? supabase.from('licitacoes').select('id, operador, analista_nome').in('id', processosLic) : Promise.resolve({ data: [] }),
      ]);
      const nomeCrm = {}; (crmData || []).forEach((o) => { nomeCrm[o.id] = o.responsavel_nome || null; });
      const nomeLic = {}; (licData || []).forEach((l) => { nomeLic[l.id] = l.operador || l.analista_nome || null; });

      // Agrupa por vendedor (nome + funil, pra não misturar quem atua nos 2)
      const porVendedor = {};
      Object.values(alvoPorProcesso).forEach(({ tipo, processoId, media }) => {
        const nome = tipo === 'crm' ? nomeCrm[processoId] : nomeLic[processoId];
        if (!nome) return;
        const chave = `${nome}__${tipo}`;
        if (!porVendedor[chave]) porVendedor[chave] = { nome, funil: tipo, qtd: 0, soma: 0, porFaixa: {} };
        const v = porVendedor[chave];
        v.qtd++; v.soma += media;
        const banda = corMarkup(media).id;
        v.porFaixa[banda] = (v.porFaixa[banda] || 0) + 1;
      });

      const resultado = Object.values(porVendedor)
        .map((v) => ({ ...v, mediaMarkup: v.soma / v.qtd }))
        .sort((a, b) => b.qtd - a.qtd);
      setLinhas(resultado);
      setLoading(false);
    };
    carregar();
  }, [mes, funil]);

  const [anoLabel, mesNumLabel] = mes ? mes.split('-') : [null, null];
  const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labelMes = mes ? `${nomesMes[Number(mesNumLabel) - 1]}/${anoLabel}` : 'todos os períodos';

  const FUNIS = [
    { id: 'todos', label: 'Todos' },
    { id: 'crm', label: 'Comercial/CRM' },
    { id: 'licitacao', label: 'Licitações' },
  ];

  return (
    <div>
      <div className="sec-card">
        <div className="acn-filtros acn-filtros-campos">
          <div className="form-group">
            <label className="acn-label">Mês de Referência</label>
            <input type="month" className="acn-input" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          {mes && <Botao variante="secundario" onClick={() => setMes('')}>Todos</Botao>}
          <div className="form-group">
            <label className="acn-label">Funil</label>
            <Chips rotulo="Funil" ativo={funil} onChange={setFunil} itens={FUNIS.map(f => ({ id: f.id, rotulo: f.label }))} />
          </div>
          {!loading && (
            <span className="acn-fraco">
              {linhas.length} vendedor(es) com cotação vinculada em {labelMes}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : linhas.length === 0 ? (
        <div className="acn-empty">
          Nenhuma cotação vinculada encontrada nesse período/funil.
        </div>
      ) : (
        <div className="sec-card">
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Funil</th>
                  <th className="acn-centro">Propostas</th>
                  <th>Markup Médio</th>
                  {MARKUP_BANDAS.map((b) => (
                    // a cor de cada faixa vem da escala do termômetro de markup (MarkupTermometro.tsx) — é dado, não enfeite
                    <th key={b.id} className="acn-centro" style={{ color: b.cor }} title={b.label}>
                      {b.id === 'dourado' ? '🥇' : '●'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((v) => (
                  <tr key={v.nome + v.funil}>
                    <td className="acn-forte">{v.nome}</td>
                    <td className="acn-fraco">{v.funil === 'crm' ? 'Comercial/CRM' : 'Licitações'}</td>
                    <td className="acn-centro acn-forte">{v.qtd}</td>
                    <td>
                      <span className="acn-acoes-linha" style={{ justifyContent: 'flex-start', gap: 5 }}>
                        <Termometro pct={v.mediaMarkup} size={16} />
                        <strong style={{ color: corMarkup(v.mediaMarkup).cor }}>{v.mediaMarkup.toFixed(1)}%</strong>
                      </span>
                    </td>
                    {MARKUP_BANDAS.map((b) => (
                      <td key={b.id} className={'acn-centro' + (v.porFaixa[b.id] ? ' acn-forte' : ' acn-fraco')}
                        style={v.porFaixa[b.id] ? { color: b.cor } : undefined}>
                        {v.porFaixa[b.id] || 0}
                      </td>
                    ))}
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

// ── RELATÓRIO DE COMISSÕES ──
function RelComissoes() {
  const hoje = new Date();
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`);
  const [funcionarios, setFuncionarios] = useState([]);
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [divisorLote, setDivisorLote] = useState<Record<string, number>>({});

  const fmtR = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';

  useEffect(() => {
    const carregar = async () => {
      setErro('');
      if (!/^\d{4}-\d{2}$/.test(mes)) { setFuncionarios([]); setOps([]); return; }   // campo de mês apagado: nada a consultar
      setLoading(true);
      // Etapa 7.19 (01/10/2026, R15): (1) o fim do mês era pedido como "AAAA-MM-31": em mês de 30 dias (e fevereiro) o banco RECUSAVA o pedido (data que não existe) e o relatório aparecia vazio,
      // sem aviso; em mês de 31 dias, data_emissao_nf é data-e-hora e "até o dia 31" vira meia-noite UTC — o dia 31 depois das 21h de Brasília ficava de fora. Agora o período é
      // [dia 1 às 00h, dia 1 do mês seguinte às 00h) em Brasília (-03:00, sem horário de verão desde 2019), como na Etapa 7.17. (2) Só contava a OP na situação exatamente "Faturado", e ela sai do
      // relatório ao avançar para "Faturado e Disponivel para Entrega" (em setembro, 3 OPs com NF emitida e nenhuma aparecia): por decisão do usuário, conta TODA OP com NF emitida no mês, em
      // qualquer situação — o mesmo critério da Comissão de Técnicos. (3) O erro do banco passa a ser avisado em vez de virar um relatório vazio.
      const [anoM, mesM] = mes.split('-').map(Number);
      const proximoMes = mesM === 12 ? `${anoM + 1}-01` : `${anoM}-${String(mesM + 1).padStart(2, '0')}`;
      const [resFuncs, resOps, divisores] = await Promise.all([
        supabase.from('rh_funcionarios').select('id,nome,cargo,percentual_comissao,incide_em,recebe_comissao').eq('recebe_comissao', true),
        supabase.from('oples').select('id,opl,responsavel_comercial,valor_total,cliente_nome,status_geral,data_emissao_nf')
          .gte('data_emissao_nf', `${mes}-01T00:00:00-03:00`)
          .lt('data_emissao_nf', `${proximoMes}-01T00:00:00-03:00`),
        lerDivisorPorBaseDeLote(),
      ]);
      const falha = resFuncs.error || resOps.error;
      if (falha) setErro(falha.message);
      setFuncionarios(resFuncs.data || []);
      setOps(resOps.data || []);
      setDivisorLote(divisores);
      setLoading(false);
    };
    carregar();
  }, [mes]);

  // Etapa 7.25 (01/10/2026, pedido do usuário): OP de lote (vários veículos) guarda em cada veículo o valor do LOTE inteiro — a base da comissão é o valor de UM veículo, como na
  // Comissão de Técnicos do RH (OpLotes.ts). Exemplo real: o lote 1560.2608 tem 16 veículos de R$ 46.636,32 e só o /15 foi faturado: a base é R$ 2.914,77, não os R$ 46.636,32.
  const divisorDe = (o) => divisorLote[baseOplDe(o.opl)] || 1;
  const valorDe = (o) => o.valor_total != null ? Number(o.valor_total) / divisorDe(o) : o.valor_total;

  // Calcular comissão por vendedor
  const comissoes = funcionarios.map(f => {
    const opsVendedor = ops.filter(o =>
      (o.responsavel_comercial || '').toLowerCase().trim() === (f.nome || '').toLowerCase().trim()
    );
    const baseTotal = opsVendedor.reduce((s, o) => s + (Number(valorDe(o)) || 0), 0);
    const comissao  = baseTotal * ((Number(f.percentual_comissao) || 0) / 100);
    return { ...f, opsVendedor, baseTotal, comissao };
  });

  // Vendedores com OPs faturadas mas sem cadastro no RH (aviso)
  const vendedoresOps = [...new Set(ops.map(o => o.responsavel_comercial).filter(Boolean))];
  const semCadastro   = vendedoresOps.filter(v =>
    !funcionarios.some(f => f.nome.toLowerCase().trim() === v.toLowerCase().trim())
  );

  const totalComissoes = comissoes.reduce((s, c) => s + c.comissao, 0);
  const totalBase      = comissoes.reduce((s, c) => s + c.baseTotal, 0);

  const [mesLabel] = mes.split('-').reverse();
  const [anoLabel, mesNumLabel] = mes.split('-');
  const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labelMes = `${nomesMes[Number(mesNumLabel)-1]}/${anoLabel}`;

  return (
    <div>
      {/* Seletor de mês */}
      <div className="sec-card">
        <div className="acn-filtros acn-filtros-campos">
          <div className="form-group">
            <label className="acn-label">Mês de Referência</label>
            <input type="month" className="acn-input" value={mes} onChange={e=>setMes(e.target.value)} />
          </div>
          {!loading && !erro && (
            <span className="acn-fraco">
              {ops.length} OP(s) faturada(s) em {labelMes} · {funcionarios.length} vendedor(es) com comissão cadastrada
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : erro ? (
        <Faixa tom="erro">Não consegui ler as OPs faturadas de {labelMes}: {erro}</Faixa>
      ) : (
        <>
          {/* Cards de resumo */}
          <Indicadores itens={[
            { l:'Total Faturado (Base)', v:fmtR(totalBase), tom:'info' },
            { l:'Total Comissões', v:fmtR(totalComissoes), tom:'ok' },
            { l:'OPs Faturadas', v:ops.length, tom:'neutro' },
          ]} />

          {/* Aviso de vendedores sem cadastro */}
          {semCadastro.length > 0 && (
            <Faixa tom="atencao">
              <strong>Vendedores com OPs faturadas mas sem comissão cadastrada no RH:</strong>{' '}
              {semCadastro.join(', ')}
            </Faixa>
          )}

          {/* Tabela de comissões */}
          {comissoes.length === 0 ? (
            <div className="acn-empty">
              Nenhum vendedor com comissão cadastrada encontrado. Configure em RH → Funcionários → Recebe Comissão.
            </div>
          ) : (
            comissoes.map(c => (
              <div key={c.id} className="sec-card">
                {/* Cabeçalho vendedor */}
                <div className="sec-hdr">
                  <span>
                    <span className="acn-forte">{c.nome}</span>
                    {c.cargo && <span className="acn-fraco"> {c.cargo}</span>}
                    {' '}<Selo familia="info" ponto={false}>{c.percentual_comissao}% sobre {c.incide_em || 'Faturamento'}</Selo>
                  </span>
                  <span className="acn-dir">
                    <span className="acn-fraco">Base: <strong>{fmtR(c.baseTotal)}</strong></span>
                    {' '}<strong className="acn-forte">Comissão: {fmtR(c.comissao)}</strong>
                  </span>
                </div>
                {/* OPs do vendedor */}
                {c.opsVendedor.length === 0 ? (
                  <div className="acn-empty">Nenhuma OP faturada em {labelMes}.</div>
                ) : (
                  <div className="sec-body acn-rolagem">
                    <table className="acn-tabela">
                      <thead>
                        <tr>
                          <th>OP</th>
                          <th>Cliente</th>
                          <th className="acn-dir">Valor Total</th>
                          <th className="acn-dir">Comissão</th>
                          <th>NF em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.opsVendedor.map((o) => {
                          const comOp = (Number(valorDe(o))||0) * ((Number(c.percentual_comissao)||0)/100);
                          return (
                            <tr key={o.id}>
                              <td className="acn-forte">{o.opl}</td>
                              <td>{o.cliente_nome || '—'}</td>
                              <td className="acn-dir acn-num">
                                {fmtR(valorDe(o))}
                                {divisorDe(o) > 1 && (
                                  <Selo familia="neutro" ponto={false} title={`Lote de ${divisorDe(o)} veículos — valor unitário (total do lote ÷ ${divisorDe(o)})`}>lote/{divisorDe(o)}</Selo>
                                )}
                              </td>
                              <td className="acn-dir acn-num acn-forte">{fmtR(comOp)}</td>
                              <td className="acn-fraco">
                                {o.data_emissao_nf ? new Date(o.data_emissao_nf).toLocaleDateString('pt-BR') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

// ── MAIN ──
// ── Relatório: OPs e OSs em Serviço (planilha) ──
const OP_STATUS_FINALIZADOS = [...STATUS_LIBERACAO_COMERCIAL_TODOS,'Aguarda Emissao NF','Faturado e Disponivel para Entrega','Faturado'];
const OS_STATUS_FINALIZADOS = ['Entregue','Cancelada'];

function obsResumoOpl(o) {
  const partes = [];
  if (o.observacoes_atencao) partes.push(`Atenção: ${o.observacoes_atencao}`);
  if (o.obs_devolucao) partes.push(`Devolução: ${o.obs_devolucao}`);
  if (o.obs_devolucao_pcp) partes.push(`Devolução PCP: ${o.obs_devolucao_pcp}`);
  if (o.obs_devolucao_producao) partes.push(`Devolução Produção: ${o.obs_devolucao_producao}`);
  if (o.obs_reprovacao_cq) partes.push(`Reprovação CQ: ${o.obs_reprovacao_cq}`);
  if (o.obs_almox) partes.push(`Almoxarifado: ${o.obs_almox}`);
  return partes.join(' | ');
}

function obsResumoOs(o) {
  const partes = [];
  if (o.observacoes) partes.push(o.observacoes);
  if (o.observacoes_manutencao) partes.push(`Manutenção: ${o.observacoes_manutencao}`);
  if (o.observacoes_lab) partes.push(`Laboratório: ${o.observacoes_lab}`);
  if (o.motivo_reprovacao) partes.push(`Reprovação: ${o.motivo_reprovacao}`);
  if (o.obs_reprovacao_cq) partes.push(`Reprovação CQ: ${o.obs_reprovacao_cq}`);
  return partes.join(' | ');
}

// Agrupa OPs/OSs desmembradas (mesmo número base, sufixos /02, /03...) numa única linha —
// mesma convenção de baseOplDe() usada em Engenharia/PCP/Almoxarifado/Produção.
// (a função baseOplDe vem de OpLotes.ts, importada no topo — a mesma conta que havia aqui)

function agruparLinhas(registros) {
  const grupos = {};
  const ordem = [];
  for (const r of registros) {
    const base = baseOplDe(r.numero);
    if (!grupos[base]) { grupos[base] = []; ordem.push(base); }
    grupos[base].push(r);
  }
  return ordem.map(base => {
    const itens = grupos[base];
    if (itens.length === 1) return { ...itens[0], qtd: 1, statusLista: [{ status: itens[0].status, qtd: 1 }] };
    const lead = itens.find(i => i.numero === base) || itens[0];
    const contagemStatus = {};
    for (const i of itens) contagemStatus[i.status] = (contagemStatus[i.status] || 0) + 1;
    const statusLista = Object.entries(contagemStatus).map(([status, qtd]) => ({ status, qtd }));
    const obsPorUnidade = itens.filter(i => i.obs && i.obs !== '—').map(i => `${i.numero}: ${i.obs}`);
    return {
      tipo: lead.tipo, numero: base, qtd: itens.length,
      placa: lead.placa, chassi: lead.chassi, modelo: lead.modelo, cliente: lead.cliente,
      statusLista, obs: obsPorUnidade.join(' | ') || '—',
    };
  });
}

const statusResumoTexto = (l) => l.statusLista.map(s => (l.qtd > 1 ? `${s.qtd}x ${s.status}` : s.status)).join(' | ');

function RelOpsOssEmServico() {
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('Todos');

  const buscar = async () => {
    setCarregando(true);
    const [opsRes, ossRes] = await Promise.all([
      supabase.from('oples').select(
        'id,opl,placa,chassi,modelo,cliente_nome,status_geral,observacoes_atencao,obs_devolucao,obs_devolucao_pcp,obs_devolucao_producao,obs_reprovacao_cq,obs_almox,fluxo_entrega,quantidade,tipo_projeto'
      ).order('opl'),
      supabase.from('sac_ordens_servico').select(
        'id,numero_os,numero_serie,modelo,cliente_nome,status,observacoes,observacoes_manutencao,observacoes_lab,motivo_reprovacao,obs_reprovacao_cq'
      ).order('numero_os'),
    ]);
    const ops = (opsRes.data || [])
      .filter(o => !OP_STATUS_FINALIZADOS.includes(o.status_geral))
      .map(o => ({
        tipo: 'OP', numero: o.opl, placa: o.placa || '—', chassi: o.chassi || '—', modelo: o.modelo || '—', _op: o,
        cliente: o.cliente_nome || '—', status: o.status_geral || '—', obs: obsResumoOpl(o) || '—',
      }));
    const oss = (ossRes.data || [])
      .filter(o => !OS_STATUS_FINALIZADOS.includes(o.status))
      .map(o => ({
        // sac_ordens_servico não tem coluna de placa — numero_serie faz as vezes de chassi/identificador do veículo/equipamento
        tipo: 'OS', numero: o.numero_os, placa: '—', chassi: o.numero_serie || '—', modelo: o.modelo || '—',
        cliente: o.cliente_nome || '—', status: o.status || '—', obs: obsResumoOs(o) || '—',
      }));
    setLinhas([...agruparLinhas(ops), ...agruparLinhas(oss)]);
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, []);

  const exportar = () => {
    const dados = linhasFiltradas.map(l => ({
      'Tipo': l.tipo, 'Número': l.numero, 'Qtd': l.qtd, 'Modelo': l.modelo, 'Chassi': l.chassi, 'Placa': l.placa,
      'Cliente': l.cliente, 'Status': statusResumoTexto(l), 'Observações': l.obs,
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws['!cols'] = [{wch:6},{wch:24},{wch:6},{wch:18},{wch:18},{wch:12},{wch:28},{wch:34},{wch:70}];
    ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Em Serviço');
    XLSX.writeFile(wb, `Relatorio_OPs_OSs_em_Servico_${hojeISO()}.xlsx`);
  };

  const totalOps = linhas.filter(l => l.tipo === 'OP').length;
  const totalOss = linhas.filter(l => l.tipo === 'OS').length;
  const totalUnidades = linhas.reduce((s, l) => s + l.qtd, 0);
  const totalLotes = linhas.filter(l => l.qtd > 1).length;

  const linhasFiltradas = filtroTipo === 'Todos' ? linhas : linhas.filter(l => l.tipo === filtroTipo);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPs e OSs em Serviço</span>
          <Botao variante="secundario" icone={mdiFileExcelOutline} onClick={exportar} disabled={carregando || linhasFiltradas.length===0}>
            Baixar Planilha (.xlsx)
          </Botao>
        </div>
        <div className="acn-filtros">
          <Chips rotulo="Tipo" ativo={filtroTipo} onChange={setFiltroTipo}
            itens={['Todos','OP','OS'].map(t => ({ id: t, rotulo: t==='Todos'?'Todos':t==='OP'?'Somente OPs':'Somente OSs' }))} />
        </div>
      </div>
      <Indicadores carregando={carregando} itens={[
        {l:'Unidades em Serviço',v:totalUnidades,tom:'marca'},
        {l:'OPs',v:totalOps,tom:'info'},
        {l:'OSs',v:totalOss,tom:'erro'},
        {l:'Lotes Agrupados',v:totalLotes,tom:'atencao'},
      ]} />
      <div className="sec-card">
        <div className="sec-hdr">{linhasFiltradas.length} linha(s) — {linhasFiltradas.reduce((s,l)=>s+l.qtd,0)} unidade(s)</div>
        <div className="sec-body acn-rolagem">
          {carregando ? <div className="acn-empty">Carregando...</div> :
           linhasFiltradas.length===0 ? <div className="acn-empty">Nenhuma OP/OS em serviço no momento.</div> : (
            <table className="acn-tabela">
              <thead><tr>
                <th>Tipo</th><th>Número</th><th>Qtd</th><th>Veículo</th><th>Cliente</th><th>Status</th><th>Observações</th>
              </tr></thead>
              <tbody>
                {linhasFiltradas.map((l,i)=>(
                  <tr key={l.tipo+l.numero+i} className={l.qtd>1?'acn-linha-marca':undefined}>
                    <td><Selo familia={l.tipo==='OP'?'info':'marca'} ponto={false}>{l.tipo}</Selo></td>
                    <td><strong className="acn-forte">{l.qtd>1 && <Icone path={mdiLinkVariant} size={14} style={{ display:'inline-block', verticalAlign:'-2px', marginRight:4 }} />}{l.numero}</strong></td>
                    <td className={'acn-centro' + (l.qtd>1 ? ' acn-forte' : '')}>{l.qtd}</td>
                    <td>
                      {/* OP: mesma célula das demais listas (kit/envio não têm veículo) */}
                      {l.tipo === 'OP' && l._op ? <VeiculoOuEnvio o={l._op} /> : (<>
                      <div>{l.modelo==='—' ? <Selo familia="atencao" ponto={false}>sem modelo</Selo> : l.modelo}</div>
                      <div className="acn-fraco">{l.chassi==='—' ? <Selo familia="atencao" ponto={false}>sem chassi</Selo> : l.chassi}</div>
                      <div className="acn-fraco">{l.placa==='—' ? (l.tipo==='OP' ? <Selo familia="atencao" ponto={false}>sem placa</Selo> : <span>—</span>) : l.placa}</div>
                      </>)}
                    </td>
                    <td className="acn-texto-longo" title={l.cliente}>{l.cliente}</td>
                    <td>
                      <div className="acn-selos">
                        {l.statusLista.map((s,si)=>(
                          <Selo key={si} status={s.status}>
                            {l.qtd>1 ? `${s.qtd}x ` : ''}{rotuloStatus(s.status)}
                          </Selo>
                        ))}
                      </div>
                    </td>
                    <td className="acn-texto-longo" title={l.obs}>{l.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RelatoriosTab({ currentUser }) {
  const [aba, setAba] = useState('opls');
  const ABAS = [
    {id:'servico',    label:'Em Serviço'},
    {id:'opls',       label:'OPs Geral'},
    {id:'finalizadas',label:'Finalizadas'},
    {id:'porsetor',   label:'Por Setor'},
    {id:'atrasadas',  label:'Atrasadas'},
    {id:'paradas',    label:'Paradas'},
    {id:'recebenv',   label:'Receb./Envios'},
    {id:'avulsas',    label:'Dem. Avulsas'},
    {id:'area',       label:'Por Área'},
    {id:'producao',   label:'Produção'},
    {id:'centrocusto',label:'Centro Custo'},
    {id:'comissoes',  label:'Comissões'},
    {id:'markup',     label:'Markup Vendedor'},
    {id:'dossie',     label:'Dossiê da OP'},
  ];

  return (
    <div>
      {/* Os 14 relatórios em "chips" que quebram de linha: todos visíveis, sem rolar para o lado (Etapa 12 do plano de UX, 30/09/2026) */}
      <div style={{marginBottom:12}}>
        <Chips rotulo="Relatório" ativo={aba} onChange={setAba} itens={ABAS.map(a => ({ id: a.id, rotulo: a.label }))} />
      </div>
      {aba==='servico'     && <RelOpsOssEmServico />}
      {aba==='opls'        && <RelOplsGeral />}
      {aba==='finalizadas' && <RelOplsFinalizadas />}
      {aba==='porsetor'    && <RelOplsPorSetor />}
      {aba==='atrasadas'   && <RelOplsAtrasadas />}
      {aba==='paradas'     && <RelOplsParadas />}
      {aba==='recebenv'    && <RelRecebimentosEnvios />}
      {aba==='avulsas'     && <RelDemandasAvulsas />}
      {aba==='area'        && <RelAreaDemandas />}
      {aba==='producao'    && <RelProducao />}
      {aba==='centrocusto' && <RelCentroCusto />}
      {aba==='comissoes'   && <RelComissoes />}
      {aba==='markup'      && <RelMarkupVendedor />}
      {aba==='dossie'      && <RelDossieOp />}
    </div>
  );
}
