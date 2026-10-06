// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import AnaliseWidget from './AnaliseWidget';
import { ColaboradorSelect } from './ColaboradorSelect';
import Linkify from './Linkify';
import { centrosParaApontar, motivoBloqueio, labelHierarquico } from './CentroCustoShared';
import { notificarEvento } from './whatsappHelper';
import { horasUteis } from './utils/horasUteis';
import { abrirVinculo, TIPO_LABEL } from './VinculoPicker';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { confirmar, pedirTexto } from './Feedback';
import { hojeISO, diaISO, Faixa, Botao, Chips, Abas, Selo } from './Interface';
import Icone from './Icone';
import {
  mdiFactory, mdiLinkVariant, mdiPlayOutline, mdiCheckCircleOutline, mdiPlay, mdiPause, mdiWrenchOutline, mdiMagnify, mdiPrinterOutline, mdiClockOutline, mdiChevronUp, mdiChevronDown, mdiMicroscope, mdiCartOutline, mdiCashMultiple, mdiCalendarOutline, mdiTagOutline, mdiPaperclip, mdiReceiptTextOutline,
} from '@mdi/js';

function fmtHHMMSS(horas) {
  const total = Math.max(0, Math.floor(horas * 3600));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// SAC OS status → família de cor do guia (Etapa 12e15)
const SAC_STATUS_FAMILIA = {
  'Diagnóstico':'info','Orçamento Pronto':'marca','Orç. Enviado':'atencao',
  'Aprovado':'ok','Reprovado':'erro','Em Execução':'marca',
  'Concluído':'ok','Entregue':'ok',
};

// ─── Fila de OFI (Ordem de Fabricação Interna) ────────────────────────────────
// Mostrada só para setores que fabricam internamente (Chicotes/Serralheria/
// Laboratorio) — recebe pedidos roteados pelo PCP a partir da Solicitação de
// Reposição do Almoxarifado (ver AlmoxarifadoTab.tsx/PCPTab.tsx).
function OfiQueueSection({ setor, cor, currentUser }) {
  const [ofis, setOfis] = useState<any[]>([]);
  const [modalVerOfi, setModalVerOfi] = useState<any>(null);
  const [atualizando, setAtualizando] = useState<string|null>(null);

  // Etapa 7.53 (06/10/2026): leitura que falha não pode parecer "nenhuma OFI" (e a de 30 s que falhar não esvazia a fila)
  const [erroOfis, setErroOfis] = useState('');
  const fetchOfis = async () => {
    const { data, error } = await supabase.from('ofis').select('*')
      .eq('setor_destino', setor).neq('status', 'Concluida')
      .order('criado_em', { ascending: false });
    if (error) { setErroOfis(error.message); return; }
    setErroOfis('');
    setOfis(data || []);
  };

  useEffect(() => { fetchOfis(); const t = setInterval(fetchOfis, 30000); return () => clearInterval(t); }, [setor]);

  // Deep-link — ver VinculoPicker.tsx's abrirVinculo(). Guardado por
  // setor_destino porque cada setor monta sua própria instância deste
  // componente, todas ouvindo o mesmo evento global 'acn:abrir-registro'.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'ofi') return;
      supabase.from('ofis').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => {
          if (data && data.setor_destino === setor) {
            (window as any).__acnDeepLink = null;
            setModalVerOfi(data);
          }
        });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, [setor]);

  const avancarStatus = async (ofi: any) => {
    const proximo = ofi.status === 'Pendente' ? 'Em Andamento' : 'Concluida';
    setAtualizando(ofi.id);
    const patch: any = { status: proximo };
    if (proximo === 'Concluida') { patch.concluido_em = new Date().toISOString(); patch.responsavel_nome = currentUser?.nome; }
    const { error } = await supabase.from('ofis').update(patch).eq('id', ofi.id);
    setAtualizando(null);
    if (error) { alert(`Não foi possível atualizar a OFI ${ofi.numero_ofi}: ${error.message}`); return; }   // 7.53
    fetchOfis();
  };

  return (
    <>
      {erroOfis && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={fetchOfis}>Tentar de novo</Botao>}>
          Não foi possível ler as Ordens de Fabricação Interna ({erroOfis}). Isso não quer dizer que não haja OFI.
        </Faixa>
      )}
      {ofis.length > 0 && (
        <div className="sec-card acn-set-espaco">
          <div className="sec-hdr">
            <span className="acn-alm-titulo"><Icone path={mdiFactory} size={16} /> Ordens de Fabricação Interna ({ofis.length})</span>
          </div>
          <div className="sec-body acn-alm-solic-corpo">
            {ofis.map(ofi => (
              <div key={ofi.id} className="acn-alm-solic">
                <div className="acn-alm-solic-texto">
                  <strong>{ofi.numero_ofi}</strong> — {ofi.descricao} · {ofi.quantidade}
                  {ofi.vinculo_descricao && (
                    <div className="acn-sub-info acn-set-link" onClick={() => abrirVinculo({ tipo: ofi.vinculo_tipo, id: ofi.vinculo_id, descricao: ofi.vinculo_descricao })}>
                      <Icone path={mdiLinkVariant} size={12} /> {TIPO_LABEL[ofi.vinculo_tipo] || ofi.vinculo_tipo}: {ofi.vinculo_descricao}
                    </div>
                  )}
                  {ofi.origem === 'almoxarifado' && (
                    <div className="acn-ajuda">origem: solicitação de reposição do Almoxarifado</div>
                  )}
                </div>
                <Selo familia={ofi.status === 'Pendente' ? 'atencao' : 'info'} ponto={false}>
                  {ofi.status}
                </Selo>
                <Botao variante="primario" pequeno icone={atualizando === ofi.id ? undefined : ofi.status === 'Pendente' ? mdiPlayOutline : mdiCheckCircleOutline}
                  onClick={() => avancarStatus(ofi)} disabled={atualizando === ofi.id}>
                  {atualizando === ofi.id ? '...' : ofi.status === 'Pendente' ? 'Iniciar' : 'Concluir'}
                </Botao>
              </div>
            ))}
          </div>
        </div>
      )}
      {modalVerOfi && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget) setModalVerOfi(null);}}>
          <div className="modal-box acn-modal-cadastro acn-set-ver" role="dialog" aria-label="Ordem de fabricação interna">
            <div className="acn-modal-cab">
              <span className="modal-title">{modalVerOfi.numero_ofi} — {modalVerOfi.setor_destino}</span>
            </div>
            <div className="acn-modal-corpo">
              <div>{modalVerOfi.descricao} · {modalVerOfi.quantidade}</div>
              {modalVerOfi.vinculo_descricao && (
                <div className="acn-sub-info">
                  <Icone path={mdiLinkVariant} size={12} /> {TIPO_LABEL[modalVerOfi.vinculo_tipo] || modalVerOfi.vinculo_tipo}: {modalVerOfi.vinculo_descricao}
                </div>
              )}
              <div>Status: <strong>{modalVerOfi.status}</strong></div>
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalVerOfi(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Relatórios do Setor ──────────────────────────────────────────────────────
function RelatoriosSetor({ setor, cor }) {
  const [filtroInicio, setFiltroInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return diaISO(d);
  });
  const [filtroFim, setFiltroFim] = useState(hojeISO());
  const [dados, setDados]     = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [abaRelat, setAbaRelat]    = useState('resumo');

  useEffect(() => { buscar(); }, []);

  // 7.53: leitura que falha não pode parecer "Nenhuma demanda no período"
  const [erroBusca, setErroBusca] = useState('');
  const buscar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('demandas_setoriais').select('*')
      .eq('setor_destino', setor)
      .gte('data_abertura', filtroInicio + 'T00:00:00')
      .lte('data_abertura', filtroFim + 'T23:59:59')
      .order('data_abertura', { ascending: false });
    if (error) { setErroBusca(error.message); setCarregando(false); return; }
    setErroBusca('');
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

  const porOpl  = dados.reduce((acc,d)=>{ const k=d.numero_opl||'Sem OP'; if(!acc[k]) acc[k]=[]; acc[k].push(d); return acc; }, {});
  const porResp = dados.reduce((acc,d)=>{ const k=d.responsavel_nome||'Nao iniciada'; if(!acc[k]) acc[k]=[]; acc[k].push(d); return acc; }, {});
  // Etapa 12e15 (06/10/2026): a cor de cada situação vem da família do guia, não de hex escrito à mão.
  const famS    = (s) => ({Pendente:'atencao','Em Andamento':'info',Concluido:'ok'})[s]||'neutro';

  const total = dados.length;

  return (
    <div className="sec-card">
      <div className="sec-hdr"><span>Relatórios — {setor}</span></div>
      <div className="sec-body acn-set-filtros">
        <div className="form-row">
          <div className="form-group"><label className="acn-label" htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" className="acn-input" value={filtroInicio} onChange={e=>setFiltroInicio(e.target.value)} /></div>
          <div className="form-group"><label className="acn-label" htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" className="acn-input" value={filtroFim} onChange={e=>setFiltroFim(e.target.value)} /></div>
          <div className="acn-set-alinha-base">
            <Botao variante="primario" onClick={buscar}>Filtrar</Botao>
          </div>
          <div className="acn-set-alinha-base acn-kb-empurra">
            <Chips ativo={abaRelat} onChange={setAbaRelat} itens={[{id:'resumo',rotulo:'Resumo'},{id:'lista',rotulo:'Lista'},{id:'atrasados',rotulo:'Atrasados'},{id:'por_opl',rotulo:'Por OP'},{id:'por_resp',rotulo:'Por Responsável'}]} />
          </div>
        </div>
      </div>

      <div className="sec-body">
        <div className="acn-kpis">
          {[
            {label:'Total',          val:total,              fam:'info'},
            {label:'Pendentes',      val:pendentes.length,   fam:'atencao'},
            {label:'Em Andamento',   val:andamento.length,   fam:'info'},
            {label:'Concluídas',     val:concluidos.length,  fam:'ok'},
            {label:'Atrasadas',      val:atrasados.length,   fam:'erro'},
            {label:'Tempo Médio (útil)', val:tempoMedio?fmtH(tempoMedio):'—', fam:tempoMedio&&tempoMedio<=24?'ok':tempoMedio?'atencao':'neutro'},
          ].map(c=>(
            <div key={c.label} className="acn-kpi">
              <span className="rot"><i data-acn-familia={c.fam} />{c.label}</span>
              <span className="val acn-num">{carregando?'...':c.val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sec-body acn-rolagem">
        {erroBusca && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={buscar}>Tentar de novo</Botao>}>
            Não foi possível ler as demandas do período ({erroBusca}). Isso não quer dizer que não haja demanda.
          </Faixa>
        )}
        {carregando ? <div className="acn-empty">Carregando...</div> : (
          abaRelat==='lista' ? (
            dados.length===0 ? <div className="acn-empty">Nenhuma demanda no período.</div> : (
              <table className="acn-tabela acn-densa"><thead><tr><th>Data</th><th>OP</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Início</th><th>Conclusão</th><th>Tempo Útil</th></tr></thead>
              <tbody>{dados.map(d=>(
                <tr key={d.id}>
                  <td>{fmtDt(d.data_abertura)}</td><td>{d.numero_opl||'—'}</td>
                  <td className="acn-texto-medio">{d.descricao||'—'}</td>
                  <td><Selo familia={famS(d.status)} ponto={false}>{d.status}</Selo></td>
                  <td>{d.responsavel_nome||'—'}</td><td>{fmtDtHr(d.data_inicio)}</td>
                  <td>{fmtDtHr(d.data_conclusao)}</td><td>{fmtH(d.tempo_execucao_horas)}</td>
                </tr>
              ))}</tbody></table>
            )
          ) : abaRelat==='atrasados' ? (
            atrasados.length===0 ? <div className="acn-empty acn-txt-ok">Nenhuma atrasada.</div> : (
              <table className="acn-tabela acn-densa"><thead><tr><th>Data</th><th>OP</th><th>Descrição</th><th>Status</th><th>Responsável</th><th>Aberta há (h)</th></tr></thead>
              <tbody>{atrasados.map(d=>(
                <tr key={d.id} className="acn-linha-alerta">
                  <td><span className="acn-txt-erro">{fmtDt(d.data_abertura)}</span></td>
                  <td>{d.numero_opl||'—'}</td>
                  <td className="acn-texto-medio">{d.descricao||'—'}</td>
                  <td><Selo familia="erro" ponto={false}>{d.status}</Selo></td>
                  <td>{d.responsavel_nome||'Nao iniciada'}</td>
                  <td><strong className="acn-txt-erro">{((agora-new Date(d.data_abertura))/3600000).toFixed(0)}h</strong></td>
                </tr>
              ))}</tbody></table>
            )
          ) : abaRelat==='por_opl' ? (
            Object.entries(porOpl).map(([opl,itens])=>(
              <div key={opl} className="acn-set-grupo">
                <div className="acn-set-grupo-cab">
                  <span>OP: {opl}</span>
                  <span className="acn-ajuda">{itens.length} dem. | <span className="acn-txt-ok">{itens.filter(i=>i.status==='Concluido').length} conc.</span></span>
                </div>
                <table className="acn-tabela acn-densa"><thead><tr><th>Descrição</th><th>Status</th><th>Responsável</th><th>Abertura</th><th>Tempo Útil</th></tr></thead>
                <tbody>{itens.map(d=>(
                  <tr key={d.id}>
                    <td className="acn-texto-medio">{d.descricao||'—'}</td>
                    <td><Selo familia={famS(d.status)} ponto={false}>{d.status}</Selo></td>
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
                <div key={resp} className="acn-set-grupo">
                  <div className="acn-set-grupo-cab">
                    <span>{resp}</span>
                    <span className="acn-ajuda">{itens.length} total | <span className="acn-txt-ok">{conc.length} conc.</span>{media?<span className="acn-txt-info"> | média: {fmtH(media)}</span>:''}</span>
                  </div>
                  <table className="acn-tabela acn-densa"><thead><tr><th>OP</th><th>Descrição</th><th>Status</th><th>Abertura</th><th>Tempo Útil</th></tr></thead>
                  <tbody>{itens.map(d=>(
                    <tr key={d.id}>
                      <td>{d.numero_opl||'—'}</td>
                      <td className="acn-texto-medio">{d.descricao||'—'}</td>
                      <td><Selo familia={famS(d.status)} ponto={false}>{d.status}</Selo></td>
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
                <div className="acn-quadro-titulo">Distribuição por Status</div>
                <div className="acn-fin-barras">
                {[{label:'Pendente',itens:pendentes,fam:'atencao'},{label:'Em Andamento',itens:andamento,fam:'info'},{label:'Concluído',itens:concluidos,fam:'ok'},{label:'Atrasado (>48h)',itens:atrasados,fam:'erro'}].map(g=>(
                  <div key={g.label} className="acn-fin-barra">
                    <span className="acn-set-barra-nome">{g.label}</span>
                    <div className="acn-fin-barra-trilho" data-acn-familia={g.fam}>
                      <i style={{width:total>0?`${(g.itens.length/total*100).toFixed(0)}%`:'0%'}} />
                    </div>
                    <span className="acn-set-barra-valor" data-acn-familia={g.fam}>{g.itens.length} ({total>0?(g.itens.length/total*100).toFixed(0):0}%)</span>
                  </div>
                ))}
                </div>
                {tempoMedio!=null&&<div className="acn-quadro tom-ok"><div>Tempo médio útil: <strong>{fmtH(tempoMedio)}</strong> ({concluidos.length} amostras)</div></div>}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// layoutUnico + slotRequisicoes: a tela do Compras deixou de ter abas e de ter
// uma lista de demandas avulsas própria — tudo vira requisição no quadro. A
// ordem pedida pelo usuário em 21/09/2026 é: relatório, requisições, análise,
// "Compras — Demandas" e histórico de movimentações. Os outros setores seguem
// com as duas abas de sempre.
export default function SetorDemandaTab({ currentUser, setor, cor, layoutUnico = false, slotRequisicoes = null }) {
  const [demandas, setDemandas]       = useState([]);
  const [sacOrdensMap, setSacOrdensMap] = useState<Record<string,any>>({});
  const [loading, setLoading]         = useState(false);
  const [filtro, setFiltro]           = useState('Todos');
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [abaAtiva, setAbaAtiva]       = useState('demandas');
  const [tick, setTick]               = useState(0);

  // Modais demanda
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelIniciar, setResponsavelIniciar] = useState('');
  const [modalObs, setModalObs]         = useState(null);
  const [obsTexto, setObsTexto]         = useState('');
  const [modalVer, setModalVer]         = useState(null);

  // Modal Finalizar Orçamento (Lab SAC)
  const [modalFinalizarOrc, setModalFinalizarOrc]     = useState(null);
  const [finalizarOrcForm, setFinalizarOrcForm] = useState({ observacoes:'', valor:'', condicoes:'' });

  // Modal Concluir Compra (setor Compras)
  const [modalConcluirCompra, setModalConcluirCompra] = useState(null);
  const [compraForm, setCompraForm] = useState({ valor:'', prazo:'', centro_custo_id:'', numero_opl:'' });
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [opBuscaCompra, setOpBuscaCompra] = useState('');
  const [opResultadosCompra, setOpResultadosCompra] = useState<any[]>([]);
  const [anexosCotacao, setAnexosCotacao] = useState<{nome:string,url:string}[]>([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const canVerValorCompra = ['Admin','Gerente','Compras'].includes(currentUser?.perfil);
  // 7.53: leitura que falha não pode parecer "nenhuma demanda", e um clique duplo em Iniciar/Concluir/Pausar/Salvar gravava duas vezes
  // (dois registros no log da demanda e, na conclusão, duas sincronizações com a OS/OP). Uma ação por vez, por demanda e tipo.
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroCentros, setErroCentros] = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(()=>fetchDemandas(true), 30000);
    return () => clearInterval(t);
  }, [filtro, setor]);
  useEffect(() => { const t = setInterval(()=>setTick(p=>p+1), 1000); return ()=>clearInterval(t); }, []);
  useEffect(() => {
    if (setor !== 'Compras') return;
    supabase.from('centros_custo').select('*').eq('ativo', true).order('codigo').then(({ data, error }) => {
      if (error) { setErroCentros(error.message); return; }   // 7.53: sem a lista não dá para escolher o centro (era "— Selecionar —" vazio)
      setErroCentros(''); setCentrosCusto(data || []);
    });
  }, [setor]);

  const buscarOpCompra = async (q: string) => {
    setOpBuscaCompra(q);
    if (!q.trim()) { setOpResultadosCompra([]); return; }
    const { data, error } = await supabase.from('oples').select('id,opl,cliente_nome').ilike('opl', `%${q}%`).limit(8);
    if (error) { alert('Não foi possível buscar a OP: ' + error.message); return; }   // 7.53
    setOpResultadosCompra(data || []);
  };

  const uploadAnexoCotacao = async (file: File, demandaId: string) => {
    setEnviandoAnexo(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 100);
    const path = `demandas-cotacoes/${demandaId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType: file.type });
    if (error) alert(`Não subiu "${file.name}": ${error.message}`);   // 7.53: o envio falhava em silêncio e o anexo não aparecia
    else {
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      setAnexosCotacao(prev => [...prev, { nome: file.name, url: pub?.publicUrl || '' }]);
    }
    setEnviandoAnexo(false);
  };

  // Deep-link vindo do painel de Menções ("Demanda X" clicável, contexto
  // 'demanda_cotacao') — abre o detalhe da demanda em vez de só cair na
  // aba do setor genérica.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'demanda_cotacao') return;
      (window as any).__acnDeepLink = null;
      supabase.from('demandas_setoriais').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalVer(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const fetchDemandas = async (silent=false) => {
    if (!silent) setLoading(true);
    let q = supabase.from('demandas_setoriais').select('*').eq('setor_destino', setor).order('data_abertura', { ascending: false });
    if (filtro !== 'Todos') q = q.eq('status', filtro);
    const { data: lista, error: erroLista } = await q;
    if (erroLista) { setErroLeitura(erroLista.message); if (!silent) setLoading(false); return; }   // 7.53: fica a lista que já estava na tela
    setErroLeitura('');
    setDemandas(lista || []);

    // Para Laboratório: buscar OS SAC vinculadas
    if (setor === 'Laboratorio') {
      const sacIds = (lista||[]).filter(d=>d.sac_os_id).map(d=>d.sac_os_id);
      if (sacIds.length > 0) {
        const { data: osData, error: erroOs } = await supabase.from('sac_ordens_servico')
          .select('id, numero_os, status, valor_orcamento, condicoes_pagamento, data_abertura, data_inicio_execucao_lab, observacoes_lab')
          .in('id', sacIds);
        if (erroOs) setErroLeitura(erroOs.message);   // 7.53: sem a OS os botões de diagnóstico/reparo somem sem aviso
        else {
        const map: Record<string,any> = {};
        (osData||[]).forEach(o => { map[o.id] = o; });
        setSacOrdensMap(map);
        }
      } else {
        setSacOrdensMap({});
      }
    }
    if (!silent) setLoading(false);
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

  const confirmarIniciar = umaVez('iniciar', async () => {
    if (!responsavelIniciar.trim()) { alert('Informe o responsável!'); return; }
    const d = modalIniciar;
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda||[]), { texto:`Iniciado. Responsável: ${responsavelIniciar}`, usuario:currentUser?.nome, hora:agora }];
    const { error: erroIni } = await supabase.from('demandas_setoriais').update({ status:'Em Andamento', data_inicio:agora, responsavel_nome:responsavelIniciar, logs_demanda:logs }).eq('id',d.id);
    // 7.53: gravação recusada seguia como se a demanda tivesse começado (janela fechada, OS do SAC marcada "Em Execução")
    if (erroIni) { alert('Não foi possível iniciar a demanda: ' + erroIni.message); return; }

    // SAC: atualiza OS
    if (d.sac_os_id) {
      let erroSac = null;
      if (d.sac_fase === 'execucao') {
        ({ error: erroSac } = await supabase.from('sac_ordens_servico').update({ data_inicio_execucao_lab:agora, status:'Em Execução', atualizado_em:agora }).eq('id',d.sac_os_id));
      } else if (d.sac_fase === 'diagnostico') {
        ({ error: erroSac } = await supabase.from('sac_ordens_servico').update({ data_inicio_diagnostico:agora, atualizado_em:agora }).eq('id',d.sac_os_id));
      }
      if (erroSac) alert('A demanda foi iniciada, mas a OS do SAC não foi atualizada: ' + erroSac.message);
    }

    setModalIniciar(null); setResponsavelIniciar(''); fetchDemandas();
  });

  // ── OBSERVAÇÃO ────────────────────────────────────────────────────────────
  const addObservacao = umaVez('obs', async () => {
    if (!obsTexto.trim()) return;
    const d = modalObs;
    const logs = [...(d.logs_demanda||[]), { texto:obsTexto, usuario:currentUser?.nome, hora:new Date().toISOString() }];
    const { error: erroObs } = await supabase.from('demandas_setoriais').update({ observacoes_execucao:obsTexto, logs_demanda:logs }).eq('id',d.id);
    if (erroObs) { alert('Não foi possível salvar a observação: ' + erroObs.message); return; }   // 7.53

    // SAC: atualiza observacoes_lab na OS
    if (d.sac_os_id) {
      const os = sacOrdensMap[d.sac_os_id];
      const novaObs = os?.observacoes_lab ? `${os.observacoes_lab}\n[${new Date().toLocaleString('pt-BR')}] ${obsTexto}` : obsTexto;
      const { error: erroSac } = await supabase.from('sac_ordens_servico').update({ observacoes_lab:novaObs, atualizado_em:new Date().toISOString() }).eq('id',d.sac_os_id);
      if (erroSac) alert('A observação foi salva na demanda, mas não foi para o corpo da OS do SAC: ' + erroSac.message);
    }

    setObsTexto(''); setModalObs(null); fetchDemandas();
  });

  // ── CONCLUIR (demanda regular) ────────────────────────────────────────────
  const concluir = (d) => umaVez('concluir-' + d.id, concluirDemanda)(d);
  const concluirDemanda = async (d) => {
    // Demanda que aponta para um item do cadastro vira saldo na prateleira, e
    // para isso precisamos saber quanto saiu da bancada DE VERDADE: pediram 44
    // e o setor pode ter feito 40 porque acabou o fio. É a mesma regra da
    // quantidade comprada no Compras. Demanda de texto livre (chicote de
    // desenvolvimento) não pergunta nada e segue como sempre foi.
    // Regra definida com o usuário em 25/09/2026.
    let produzida = null;
    if (d?.item_id) {
      const resposta = await pedirTexto(
        `Quanto foi produzido de verdade?\n\nPedido: ${d.quantidade || 0} ${d.unidade || 'un'}. ` +
        `Esta quantidade entra no estoque quando o Almoxarifado conferir o recebimento.`,
        String(d.quantidade ?? ''));
      if (resposta === null) return;
      produzida = Number(String(resposta).replace(',', '.'));
      if (!Number.isFinite(produzida) || produzida <= 0) { alert('Informe uma quantidade maior que zero.'); return; }
    } else if (!await confirmar('Confirmar conclusão?')) {
      return;
    }
    const agora = new Date().toISOString();
    const inicio = d.data_inicio ? new Date(d.data_inicio) : new Date(d.data_abertura||agora);
    const tempo  = Math.max(0, horasUteis(inicio, new Date()) - (d.tempo_pausado_horas||0));
    const logs = [...(d.logs_demanda||[]), { texto:`Concluído. Tempo útil: ${tempo.toFixed(1)}h`
      + (produzida != null ? ` Produzido: ${produzida} ${d.unidade||'un'} (pedido: ${d.quantidade||0}).` : ''),
      usuario:currentUser?.nome, hora:agora }];
    const campos = { status:'Concluido', data_conclusao:agora, tempo_execucao_horas:tempo, logs_demanda:logs };
    if (produzida != null) campos.quantidade_produzida = produzida;
    const { error: erroConc } = await supabase.from('demandas_setoriais').update(campos).eq('id',d.id);
    // 7.53: gravação recusada seguia como "Demanda concluída com N un" (e liberava a OS do SAC e o aviso ao PCP)
    if (erroConc) { alert('Não foi possível concluir a demanda: ' + erroConc.message); return; }
    if (produzida != null) {
      alert(`Demanda concluída com ${produzida} ${d.unidade||'un'}. `
        + `O estoque sobe quando o Almoxarifado conferir o recebimento.`);
    }

    // SAC execução: atualiza OS
    if (d.sac_os_id && d.sac_fase === 'execucao') {
      const { error: erroSac } = await supabase.from('sac_ordens_servico').update({
        status:'Concluído', data_finalizacao_execucao:agora, kpi_execucao_horas:tempo, atualizado_em:agora,
      }).eq('id',d.sac_os_id);
      if (erroSac) alert('A demanda foi concluída, mas a OS do SAC não foi atualizada: ' + erroSac.message);   // 7.53
    }

    // Liberação parcial de BOM (Engenharia → Serralheria): devolve o aviso
    // pro PCP via trilha paralela oples.serralheria_status — não mexe no
    // status_geral normal da OP.
    if (d.tipo_solicitacao === 'liberacao_parcial_bom' && d.numero_opl) {
      const { data: opl, error: erroOpl } = await supabase.from('oples').select('id,opl,status_geral').eq('opl', d.numero_opl).maybeSingle();
      if (erroOpl) alert('A demanda foi concluída, mas não consegui ler a OP para avisar o PCP: ' + erroOpl.message + '. Avise o PCP para sanar a pendência.');   // 7.53
      if (opl) {
        const { error: erroMarca } = await supabase.from('oples').update({ serralheria_status: 'Concluido' }).eq('id', opl.id);
        if (erroMarca) alert(`A demanda foi concluída, mas a OP ${opl.opl} não foi marcada como "Serralheria concluída": ${erroMarca.message}. Avise o PCP para sanar a pendência.`);   // 7.53
        await supabase.from('logs_movimentacao_opl').insert([{
          opl_id: opl.id, numero_opl: opl.opl, setor: 'Serralheria',
          evento: 'Serralheria concluiu a liberação parcial. Aguardando PCP sanar a pendência.',
          status_anterior: opl.status_geral, status_novo: opl.status_geral,
          usuario_nome: currentUser?.nome, data_hora: agora,
        }]);
        notificarEvento('serralheria_conclui_parcial', `*Serralheria concluiu* — OP ${opl.opl}\nPor: ${currentUser?.nome}`, 'PCP');
      }
    }

    fetchDemandas();
  };

  // ── IMPRIMIR DEMANDA ─────────────────────────────────────────────────────
  const imprimirDemanda = (d: any) => {
    const fmtDtBR = (v: string) => v ? new Date(v).toLocaleString('pt-BR') : '—';
    const fmtDataBR = (v: string) => v ? new Date(v+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const fmtVal = (v: any) => v ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v) : null;
    const descExibida = d.descricao?.replace('[AJUSTE] ','').replace('[SAC-DIAG] ','').replace('[SAC-EXEC] ','') || '—';
    const logs: any[] = d.logs_demanda || [];
    const corStatus: Record<string,string> = { Concluido:'#22c55e', 'Em Andamento':'#3b82f6', Pendente:'#94a3b8' };
    const html = `<html><head><title>Demanda — ${setor}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:30px;color:#000}
      h2{color:#1a3a52;border-bottom:2px solid #1a3a52;padding-bottom:6px;margin-bottom:16px}
      table.info{width:100%;border-collapse:collapse;margin-bottom:16px}
      table.info th{background:#1a3a52;color:#fff;padding:7px 10px;text-align:left;font-size:11px;width:35%}
      table.info td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;white-space:pre-wrap}
      .badge{display:inline-block;padding:3px 10px;border-radius:4px;color:#fff;font-weight:bold;font-size:11px}
      .log-section h3{font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px}
      .log-item{border-left:3px solid #3b82f6;padding:6px 10px;margin-bottom:6px;font-size:10px;background:#f8fafc}
      .log-meta{color:#6b7280;font-size:9px;margin-top:2px}
      .footer{margin-top:24px;font-size:9px;color:#9ca3af;border-top:1px solid #e2e8f0;padding-top:8px}
      @media print{button{display:none}}
    </style></head><body>
      <h2>Demanda — ${setor}</h2>
      <table class="info">
        <tr><th>Data de Abertura</th><td>${fmtDtBR(d.data_abertura)}</td></tr>
        <tr><th>OP / Referência</th><td>${d.numero_opl||'—'}</td></tr>
        <tr><th>Setor</th><td>${d.setor_destino||setor}</td></tr>
        <tr><th>Responsável</th><td>${d.responsavel_nome||'—'}</td></tr>
        <tr><th>Descrição</th><td>${descExibida}</td></tr>
        ${d.data_inicio?`<tr><th>Data de Início</th><td>${fmtDtBR(d.data_inicio)}</td></tr>`:''}
        <tr><th>Status</th><td><span class="badge" style="background:${corStatus[d.status]||'#94a3b8'}">${d.status}</span></td></tr>
        ${d.status==='Concluido'?`<tr><th>Data de Conclusão</th><td>${fmtDtBR(d.data_conclusao)}</td></tr>`:''}
        ${d.status==='Concluido'&&d.tempo_execucao_horas?`<tr><th>Tempo de Execução</th><td>${Number(d.tempo_execucao_horas).toFixed(1)}h úteis</td></tr>`:''}
        ${d.data_prevista_recebimento?`<tr><th>Previsão de Recebimento</th><td>${fmtDataBR(d.data_prevista_recebimento)}</td></tr>`:''}
        ${fmtVal(d.valor_compra)?`<tr><th>Valor da Compra</th><td>${fmtVal(d.valor_compra)}</td></tr>`:''}
        ${d.observacoes_execucao?`<tr><th>Observações</th><td>${d.observacoes_execucao}</td></tr>`:''}
      </table>
      ${logs.length>0?`<div class="log-section"><h3>Histórico</h3>${logs.map(l=>`
        <div class="log-item">${l.texto||'—'}<div class="log-meta">${l.usuario||''} · ${l.hora?new Date(l.hora).toLocaleString('pt-BR'):''}</div></div>`).join('')}
      </div>`:''}
      <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')} · Sistema ACN</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
    const w = window.open('','_blank','width=820,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── CONCLUIR COMPRA (modal com valor + prazo + centro de custo) ──────────
  const confirmarConcluirCompra = umaVez('compra', async () => {
    if (!compraForm.prazo) { alert('Informe a previsão de recebimento.'); return; }
    if (!compraForm.centro_custo_id) { alert('Informe o centro de custo.'); return; }
    const d = modalConcluirCompra;
    const isCotacao = d.tipo_solicitacao === 'cotacao';
    const agora = new Date().toISOString();
    const inicio = d.data_inicio ? new Date(d.data_inicio) : new Date(d.data_abertura||agora);
    const tempo  = Math.max(0, horasUteis(inicio, new Date()) - (d.tempo_pausado_horas||0));
    const centroSel = centrosCusto.find(c => c.id === compraForm.centro_custo_id);
    const centroLabel = centroSel ? labelHierarquico(centroSel, centrosCusto) + ' — ' + centroSel.nome : '';
    const updates: any = {
      status: 'Concluido',
      data_conclusao: agora,
      tempo_execucao_horas: tempo,
      data_prevista_recebimento: compraForm.prazo,
      centro_custo_id: compraForm.centro_custo_id,
      centro_custo: centroLabel,
      ...(compraForm.numero_opl ? { numero_opl: compraForm.numero_opl } : {}),
      ...(anexosCotacao.length ? { anexos: anexosCotacao } : {}),
      logs_demanda: [...(d.logs_demanda||[]), {
        texto: `${isCotacao ? 'Cotação' : 'Compra'} concluída. Centro de custo: ${centroLabel}. Prev. recebimento: ${new Date(compraForm.prazo+'T00:00:00').toLocaleDateString('pt-BR')}${compraForm.valor ? `. Valor: R$ ${compraForm.valor}` : ''}. Tempo útil: ${tempo.toFixed(1)}h`,
        usuario: currentUser?.nome, hora: agora,
      }],
    };
    if (compraForm.valor) updates.valor_compra = parseFloat(compraForm.valor.replace(',','.'));
    const { error: erroCompra } = await supabase.from('demandas_setoriais').update(updates).eq('id', d.id);
    // 7.53: gravação recusada seguia como compra concluída (e avisava o solicitante da cotação com o valor)
    if (erroCompra) { alert('Não foi possível concluir a compra: ' + erroCompra.message); return; }

    // Cotação: avisa quem solicitou que o valor foi lançado
    if (isCotacao && compraForm.valor && d.criado_por) {
      try {
        const { data: solicitante } = await supabase.from('auth_usuarios')
          .select('id, nome').eq('email', d.criado_por).maybeSingle();
        if (solicitante) {
          await supabase.from('mencoes').insert({
            mencionado_id: String(solicitante.id), mencionado_nome: solicitante.nome,
            mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
            contexto: 'demanda_cotacao', contexto_id: String(d.id),
            contexto_descricao: d.descricao?.slice(0, 120) || 'Cotação de Compras',
            campo: 'valor_cotado',
            texto_trecho: `Sua cotação foi finalizada. Valor: R$ ${compraForm.valor}`,
            aba_destino: 'demandas_gerais', lida: false, criado_em: new Date().toISOString(),
          });
        }
      } catch (e) { console.warn('Falha ao notificar solicitante da cotação:', e); }
    }

    setModalConcluirCompra(null); setCompraForm({ valor:'', prazo:'', centro_custo_id:'', numero_opl:'' });
    setAnexosCotacao([]); setOpBuscaCompra(''); setOpResultadosCompra([]);
    fetchDemandas();
  });

  // ── PAUSAR / RETOMAR ──────────────────────────────────────────────────────
  const pausar = (d) => umaVez('pausa-' + d.id, async () => {
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda||[]), { texto:'Tarefa pausada manualmente.', usuario:currentUser?.nome, hora:agora }];
    const { error } = await supabase.from('demandas_setoriais').update({ pausado:true, data_pausa:agora, logs_demanda:logs }).eq('id',d.id);
    if (error) { alert('Não foi possível pausar: ' + error.message); return; }   // 7.53
    fetchDemandas();
  })();

  const retomar = (d) => umaVez('pausa-' + d.id, async () => {
    const agora = new Date().toISOString();
    const horasPausadas = d.data_pausa ? horasUteis(new Date(d.data_pausa), new Date()) : 0;
    const novoTotal = (d.tempo_pausado_horas||0) + horasPausadas;
    const logs = [...(d.logs_demanda||[]), { texto:`Tarefa retomada. Pausa: ${horasPausadas.toFixed(2)}h úteis.`, usuario:currentUser?.nome, hora:agora }];
    const { error } = await supabase.from('demandas_setoriais').update({ pausado:false, data_pausa:null, tempo_pausado_horas:novoTotal, logs_demanda:logs }).eq('id',d.id);
    if (error) { alert('Não foi possível retomar: ' + error.message); return; }   // 7.53
    fetchDemandas();
  })();

  // ── FINALIZAR ORÇAMENTO (Lab SAC diagnóstico) ────────────────────────────
  const finalizarOrcamento = umaVez('orcamento', async () => {
    if (!finalizarOrcForm.valor) { alert('Informe o valor do orçamento!'); return; }
    const d  = modalFinalizarOrc;
    const os = sacOrdensMap[d.sac_os_id];
    const agora = new Date().toISOString();

    // KPI1: da abertura da OS até agora
    const kpi1 = horasUteis(new Date(os.data_abertura||d.data_abertura), new Date()) - (d.tempo_pausado_horas||0);
    const valorNum = parseFloat(finalizarOrcForm.valor.replace(',','.'));

    // Atualiza OS
    const { error: erroOrc } = await supabase.from('sac_ordens_servico').update({
      status: 'Orçamento Pronto',
      observacoes_lab: finalizarOrcForm.observacoes || null,
      valor_orcamento: valorNum,
      condicoes_pagamento: finalizarOrcForm.condicoes || null,
      data_finalizacao_orcamento: agora,
      kpi_orcamento_horas: kpi1,
      atualizado_em: agora,
    }).eq('id', os.id);
    // 7.53: se a OS não gravar, o orçamento NÃO foi enviado ao SAC; seguia concluindo a demanda do diagnóstico
    if (erroOrc) { alert('Não foi possível enviar o orçamento ao SAC: ' + erroOrc.message); return; }

    // Conclui demanda de diagnóstico
    const logs = [...(d.logs_demanda||[]), { texto:`Orçamento finalizado. Valor: R$ ${finalizarOrcForm.valor}. KPI elaboração: ${kpi1.toFixed(1)}h úteis.`, usuario:currentUser?.nome, hora:agora }];
    const { error: erroDem } = await supabase.from('demandas_setoriais').update({
      status:'Concluido', data_conclusao:agora, tempo_execucao_horas:kpi1,
      observacoes_execucao: finalizarOrcForm.observacoes||null, logs_demanda:logs,
    }).eq('id',d.id);
    if (erroDem) alert('O orçamento foi enviado ao SAC, mas a demanda do diagnóstico não foi concluída: ' + erroDem.message + '. Não envie de novo.');

    setModalFinalizarOrc(null); setFinalizarOrcForm({ observacoes:'', valor:'', condicoes:'' });
    fetchDemandas();
  });

  // ── HELPERS ───────────────────────────────────────────────────────────────
  // Etapa 12e15 (06/10/2026): a cor de cada situação vem da família do guia (a cor do setor, `cor`, deixa de pintar o cabeçalho).
  const statusFam = { Pendente:'atencao','Em Andamento':'info',Concluido:'ok' };
  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH  = (h) => h != null ? `${Number(h).toFixed(1)}h úteis` : '—';

  const pendentes = demandas.filter(d=>d.status==='Pendente').length;
  const andamento = demandas.filter(d=>d.status==='Em Andamento').length;
  const tempos    = demandas.filter(d=>d.tempo_execucao_horas).map(d=>d.tempo_execucao_horas);
  const mediaT    = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : null;

  // ── Badges e marca da linha para SAC ──────────────────────────────────────
  const sacOs = (d) => d.sac_os_id ? sacOrdensMap[d.sac_os_id] : null;
  const sacRowClasse = (d, isAjuste) => {
    const os = sacOs(d);
    if (os) {
      if (os.status==='Reprovado') return 'acn-linha-alerta';
      if (['Aprovado','Em Execução'].includes(os.status) && d.sac_fase==='execucao') return 'acn-linha-info';
    }
    if (isAjuste) return 'acn-linha-envio';
    return undefined;
  };

  const sacBadge = (d) => {
    const os = sacOs(d);
    if (!os) return null;
    return <div className="acn-set-selo-linha"><Selo familia={SAC_STATUS_FAMILIA[os.status]||'neutro'} ponto={false}>{os.numero_os}</Selo></div>;
  };

  const sacFlagBadge = (d) => {
    const os = sacOs(d);
    if (!os) return null;
    if (os.status==='Reprovado') return <Selo familia="erro" ponto={false}>REPROVADO</Selo>;
    if (['Aprovado','Em Execução'].includes(os.status) && d.sac_fase==='execucao') return <Selo familia="ok" ponto={false}>APROVADO</Selo>;
    if (['Concluído','Entregue'].includes(os.status)) return <Selo familia="ok" ponto={false}>PRONTO</Selo>;
    if (d.sac_fase==='diagnostico') return <Selo familia="info" ponto={false}>DIAGNÓSTICO</Selo>;
    return null;
  };

  // ── Ações por linha ───────────────────────────────────────────────────────
  const abrirObs = (d) => { setModalObs(d); setObsTexto(''); };
  const botaoPausa = (d) => d.pausado
    ? <Botao key="ret" pequeno icone={mdiPlay} onClick={()=>retomar(d)}>RETOMAR</Botao>
    : <Botao key="pau" pequeno icone={mdiPause} onClick={()=>pausar(d)}>PAUSAR</Botao>;
  const renderAcoes = (d) => {
    const isAjuste = d.descricao?.startsWith('[AJUSTE]');
    const os = sacOs(d);

    // SAC diagnóstico
    if (d.sac_os_id && d.sac_fase === 'diagnostico') {
      if (d.status === 'Pendente')
        return [<Botao key="ini" variante="primario" pequeno onClick={()=>abrirIniciar(d)}>INICIAR DIAGNÓSTICO</Botao>];
      if (d.status === 'Em Andamento')
        return [
          <Botao key="obs" pequeno onClick={()=>abrirObs(d)}>OBS</Botao>,
          <Botao key="orc" variante="primario" pequeno onClick={()=>{setModalFinalizarOrc(d);setFinalizarOrcForm({observacoes:d.observacoes_execucao||'',valor:'',condicoes:''});}}>FINALIZAR ORÇAMENTO</Botao>,
          botaoPausa(d),
        ];
      if (d.status === 'Concluido')
        return [<Botao key="log" variante="discreto" pequeno onClick={()=>abrirObs(d)}>VER LOG</Botao>];
    }

    // SAC execução
    if (d.sac_os_id && d.sac_fase === 'execucao') {
      if (d.status === 'Pendente' && os?.status !== 'Reprovado')
        return [<Botao key="ini" variante="primario" pequeno onClick={()=>abrirIniciar(d)}>INICIAR REPARO</Botao>];
      if (d.status === 'Em Andamento')
        return [
          <Botao key="obs" pequeno onClick={()=>abrirObs(d)}>OBS</Botao>,
          <Botao key="conc" variante="primario" pequeno onClick={()=>concluir(d)}>CONCLUIR REPARO</Botao>,
          botaoPausa(d),
        ];
      if (d.status === 'Concluido')
        return [<Botao key="log" variante="discreto" pequeno onClick={()=>abrirObs(d)}>VER LOG</Botao>];
      // Reprovado
      if (os?.status === 'Reprovado')
        return [<Botao key="log" variante="discreto" pequeno onClick={()=>abrirObs(d)}>VER LOG</Botao>];
    }

    // Demanda regular
    if (d.status === 'Pendente')
      return [<Botao key="ini" variante={isAjuste ? 'secundario' : 'primario'} pequeno onClick={()=>abrirIniciar(d)}>INICIAR</Botao>];
    if (d.status === 'Em Andamento')
      return [
        <Botao key="obs" pequeno onClick={()=>abrirObs(d)}>OBS</Botao>,
        <Botao key="conc" variante="primario" pequeno onClick={()=>{
          if (setor === 'Compras') {
            setModalConcluirCompra(d);
            setCompraForm({
              valor: d.valor_compra ? String(d.valor_compra) : '',
              prazo: d.data_prevista_recebimento || '',
              centro_custo_id: d.centro_custo_id || '',
              numero_opl: d.numero_opl || '',
            });
            setOpBuscaCompra(d.numero_opl || ''); setOpResultadosCompra([]);
            setAnexosCotacao(Array.isArray(d.anexos) ? d.anexos : []);
          }
          else concluir(d);
        }}>CONCLUIR</Botao>,
        botaoPausa(d),
      ];
    if (d.status === 'Concluido')
      return [<Botao key="log" variante="discreto" pequeno onClick={()=>abrirObs(d)}>VER LOG</Botao>];
    return [];
  };

  const renderDemandaRow = (d:any) => {
    const isAjuste = d.descricao?.startsWith('[AJUSTE]');
    const descExibida = isAjuste
      ? d.descricao.replace('[AJUSTE] ','').replace('[SAC-DIAG] ','').replace('[SAC-EXEC] ','')
      : d.descricao?.replace('[SAC-DIAG] ','').replace('[SAC-EXEC] ','') || '—';
    const timer = timerUteis(d);
    return (
      <tr key={d.id} className={sacRowClasse(d,isAjuste)}>
        <td className="acn-set-data">{fmtDt(d.data_abertura)}</td>
        <td>{d.numero_opl||'—'}</td>
        <td className="acn-set-desc-cel">
          <div className="acn-selos">
            {isAjuste && <Selo familia="atencao" ponto={false}>AJUSTE</Selo>}
            {setor === 'Compras' && d.tipo_solicitacao && (
              <Selo familia={d.tipo_solicitacao==='cotacao' ? 'marca' : 'info'} ponto={false}>
                {d.tipo_solicitacao==='cotacao' ? 'COTAÇÃO' : 'COMPRA'}
              </Selo>
            )}
            {setor === 'Serralheria' && d.tipo_solicitacao === 'liberacao_parcial_bom' && (
              <Selo familia="marca" ponto={false}><Icone path={mdiWrenchOutline} size={12} /> LIB. PARCIAL BOM</Selo>
            )}
          </div>
          {sacBadge(d)}
          {sacFlagBadge(d)}
          {d.pausado && <span className="acn-txt-atencao acn-set-pausado"><Icone path={mdiPause} size={12} /> PAUSADO</span>}
          {/* Descrição em até 3 linhas: pedido de compra com especificação longa
              deixava a linha com meia tela de altura. O texto completo está no
              Resumo (e no título, ao passar o mouse). */}
          <span title={descExibida} className="acn-set-desc">{descExibida}</span>
          <Botao variante="discreto" pequeno icone={mdiMagnify} onClick={() => setModalVer(d)} title="Resumo da demanda: descrição completa, origem, OP, prazos, valores e observações">
            RESUMO
          </Botao>
        </td>
        <td><Selo familia={statusFam[d.status]||'neutro'} ponto={false}>{d.status}</Selo></td>
        <td>{d.responsavel_nome||'—'}</td>
        <td>
          {timer
            ? <span className={'acn-set-timer ' + (d.pausado ? 'acn-txt-atencao' : 'acn-txt-info')}>{timer}</span>
            : <span className="acn-ajuda">{d.status==='Concluido' ? fmtH(d.tempo_execucao_horas) : fmtDt(d.data_inicio)}</span>
          }
        </td>
        <td><span className="acn-txt-ok">{d.status==='Concluido'?fmtH(d.tempo_execucao_horas):''}</span></td>
        <td className="acn-set-celula-acoes"><div className="acn-acoes-linha quebra">
          {renderAcoes(d)}
          <Botao variante="discreto" pequeno icone={mdiPrinterOutline} onClick={()=>imprimirDemanda(d)} title="Imprimir demanda" aria-label="Imprimir demanda" />
        </div></td>
      </tr>
    );
  };

  const agruparPorStatusDemanda = filtro === 'Todos';
  const demandasAtivas     = agruparPorStatusDemanda ? demandas.filter((d:any) => d.status !== 'Concluido') : demandas;
  const demandasConcluidas = agruparPorStatusDemanda ? demandas.filter((d:any) => d.status === 'Concluido') : [];

  // Usados nas duas disposições (setor comum e tela única do Compras)
  const cardDemandas = (
      <div className="sec-card">
        <div className="sec-hdr">
          <span>{setor} — Demandas</span>
          <div className="acn-set-hdr-controles">
            <span className="acn-ajuda">
              {pendentes} pend. | {andamento} em and. {mediaT?`| média: ${fmtH(mediaT)}`:''}
            </span>
            <Chips ativo={filtro} onChange={setFiltro} itens={['Pendente','Em Andamento','Concluido','Todos'].map(s => ({ id: s, rotulo: s }))} />
          </div>
        </div>

        {/* Legenda horas úteis */}
        <div className="acn-set-legenda">
          <Icone path={mdiClockOutline} size={14} />
          <span>KPIs em <strong>horas úteis</strong> (Seg–Sex 8:00–17:45) · Timer pausa fora do horário e quando PAUSADO manualmente</span>
        </div>

        {erroLeitura && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchDemandas()}>Tentar de novo</Botao>}>
            Não foi possível ler as demandas ({erroLeitura}). Isso não quer dizer que não haja demanda{demandas.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
          </Faixa>
        )}
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : demandas.length===0 ? (
            <div className="acn-empty">Nenhuma demanda {filtro!=='Todos'?`com status "${filtro}"`:''}.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data</th><th>OP Ref.</th><th>Descrição</th><th>Status</th>
                <th>Responsável</th><th>Timer (h úteis)</th><th>KPI</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {demandasAtivas.map(renderDemandaRow)}
                {agruparPorStatusDemanda && demandasConcluidas.length > 0 && (
                  <tr>
                    <td colSpan={8} className="acn-set-concluidas-cel">
                      <Botao variante="discreto" icone={mostrarConcluidas ? mdiChevronUp : mdiChevronDown} className="acn-set-concluidas" onClick={()=>setMostrarConcluidas(v=>!v)}>
                        {mostrarConcluidas ? 'Ocultar' : 'Mostrar'} Concluídas ({demandasConcluidas.length})
                      </Botao>
                    </td>
                  </tr>
                )}
                {agruparPorStatusDemanda && mostrarConcluidas && demandasConcluidas.map(renderDemandaRow)}
              </tbody>
            </table>
          )}
        </div>
      </div>
  );

  const painelAnalise = (
      <AnaliseWidget
        setor={setor}
        currentUser={currentUser}
        onAbrirOrigem={(origem, origemId) => {
          window.dispatchEvent(new CustomEvent('analise:abrir-origem', { detail: { origem, origemId } }));
        }}
      />
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* SELETOR ABAS — a tela do Compras é uma só, sem abas */}
      {!layoutUnico && (
        <Abas className="acn-set-abas" ativa={abaAtiva} onChange={setAbaAtiva}
          itens={[{ id: 'demandas', rotulo: 'Demandas Ativas' }, { id: 'relatorios', rotulo: 'Relatórios' }]} />
      )}

      {layoutUnico ? (
        /* Ordem pedida: relatório → requisições → análise → demandas → histórico */
        <>
          <RelatoriosSetor setor={setor} cor={cor} />
          {slotRequisicoes}
          {painelAnalise}
          {cardDemandas}
          <OplMovimentadas setor={setor} />
          <DemandaFooter setor={setor} />
        </>
      ) : abaAtiva === 'relatorios' ? <RelatoriosSetor setor={setor} cor={cor} /> : (
        <>
          {cardDemandas}

          {['Chicotes','Serralheria','Laboratorio'].includes(setor) && (
            <OfiQueueSection setor={setor} cor={cor} currentUser={currentUser} />
          )}

          {/* Recebe demandas endereçadas por PCPTab.tsx/AjustesProjetoTab.tsx
              (que agora despacham pra cá em vez do antigo demandas_setoriais). */}
          <DemandaAvulsaPanel currentUser={currentUser} setor={setor} />

          {painelAnalise}
          <OplMovimentadas setor={setor} />
          <DemandaFooter setor={setor} />
        </>
      )}

      {/* ════════ MODAL INICIAR ════════ */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-set-jan" role="dialog" aria-label="Iniciar demanda">
            <div className="acn-modal-cab">
              <span className="modal-title">
                {modalIniciar.sac_fase==='diagnostico' ? <><Icone path={mdiMicroscope} size={16} /> Iniciar Diagnóstico SAC</> : modalIniciar.sac_fase==='execucao' ? <><Icone path={mdiWrenchOutline} size={16} /> Iniciar Reparo SAC</> : `Iniciar — ${setor}`}
              </span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              {modalIniciar.sac_os_id && sacOrdensMap[modalIniciar.sac_os_id] && (
                <div className="acn-quadro tom-ok">
                  <div>
                    <strong>OS:</strong> {sacOrdensMap[modalIniciar.sac_os_id].numero_os} &nbsp;|&nbsp;
                    {modalIniciar.sac_fase==='execucao'?<span className="acn-txt-ok"><Icone path={mdiCheckCircleOutline} size={13} /> Aprovado — KPI execução inicia agora</span>:<span className="acn-txt-info">KPI orçamento em andamento</span>}
                  </div>
                </div>
              )}
              <div className="acn-quadro">
                <div><strong>Demanda:</strong> {modalIniciar.descricao?.replace('[AJUSTE] ','').replace('[SAC-DIAG] ','').replace('[SAC-EXEC] ','') || '—'}</div>
              </div>
              <div className="form-group">
                <label className="acn-label">Responsável pela Execução *</label>
                <ColaboradorSelect
                  value={responsavelIniciar} onChange={setResponsavelIniciar}
                  placeholder="Selecione o responsável"
                  className="acn-input"
                  autoFocus onKeyDown={e=>e.key==='Enter'&&confirmarIniciar()} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={confirmarIniciar}>INICIAR</Botao>
              <Botao onClick={()=>setModalIniciar(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL OBSERVAÇÃO / LOG ════════ */}
      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-set-jan acn-set-obs" role="dialog" aria-label="Observações e log">
            <div className="acn-modal-cab">
              <span className="modal-title">Observações / Log</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              {(modalObs.logs_demanda||[]).length>0 && (
                <div className="acn-quadro acn-eng-logs">
                  {(modalObs.logs_demanda||[]).map((l,i)=>(
                    <div key={i} className="acn-eng-log">
                      <span className="acn-ajuda">{l.hora?new Date(l.hora).toLocaleString('pt-BR'):''} · {l.usuario||''}</span>
                      <div>{l.texto}</div>
                    </div>
                  ))}
                </div>
              )}
              {modalObs.status !== 'Concluido' && (
                <div className="form-group">
                  <label className="acn-label" htmlFor="set-obs">Nova Observação {modalObs.sac_os_id?'(vai para o corpo da OS)':''}</label>
                  <textarea id="set-obs" className="acn-input" rows={3}
                    value={obsTexto} onChange={e=>setObsTexto(e.target.value)} />
                </div>
              )}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              {modalObs.status !== 'Concluido' && <Botao variante="primario" onClick={addObservacao}>SALVAR OBS.</Botao>}
              <Botao onClick={()=>setModalObs(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL VER DESCRIÇÃO COMPLETA ════════ */}
      {modalVer && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalVer(null);}}>
          <div className="modal-box acn-modal-cadastro acn-set-ver" role="dialog" aria-label="Resumo da demanda">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiMagnify} size={16} /> Resumo — {modalVer.numero_demanda || modalVer.numero_opl || 'Demanda'}</span>
            </div>
            <div className="acn-modal-corpo">
              {(() => {
                const m = modalVer;
                const itens = [
                  ['Status', m.status],
                  ['Tipo', m.tipo_solicitacao === 'cotacao' ? 'Cotação' : m.tipo_solicitacao === 'compra' ? 'Compra' : m.tipo_solicitacao],
                  ['Setor', [m.setor_origem, m.setor_destino].filter(Boolean).join(' → ')],
                  ['OP', m.numero_opl || m.opl],
                  ['Quantidade', m.quantidade ? `${m.quantidade} ${m.unidade || ''}`.trim() : null],
                  ['Solicitado por', m.criado_por_nome || m.criado_por],
                  ['Aberta em', m.data_abertura ? new Date(m.data_abertura).toLocaleString('pt-BR') : null],
                  ['Responsável', m.responsavel_nome],
                  ['Concluída em', m.data_conclusao ? new Date(m.data_conclusao).toLocaleString('pt-BR') : null],
                  ['Tempo de execução', m.tempo_execucao_horas != null ? `${Number(m.tempo_execucao_horas).toFixed(1)}h úteis` : null],
                  ['Valor da compra', m.valor_compra != null ? Number(m.valor_compra).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) : null],
                  ['Prev. recebimento', m.data_prevista_recebimento ? new Date(String(m.data_prevista_recebimento).slice(0,10) + 'T00:00:00').toLocaleDateString('pt-BR') : null],
                  ['Centro de custo', m.centro_custo],
                  ['Prioridade', m.prioridade],
                ].filter(([, v]) => v !== null && v !== undefined && v !== '');
                return (
                  <div>
                    {itens.map(([k, v]) => (
                      <div key={k} className="acn-ficha-linha">
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="acn-quadro-titulo">Descrição</div>
              <div className="acn-quadro acn-set-texto-longo">
                <Linkify text={modalVer.descricao?.replace('[AJUSTE] ','').replace('[SAC-DIAG] ','').replace('[SAC-EXEC] ','') || '—'} />
              </div>
              {Array.isArray(modalVer.anexos) && modalVer.anexos.length > 0 && (
                <div className="acn-selos">
                  <strong>Anexos: </strong>
                  {modalVer.anexos.map((a:any, i:number) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" className="acn-tag"><Icone path={mdiPaperclip} size={12} /> {a.nome || 'arquivo'}</a>
                  ))}
                </div>
              )}
              {(modalVer.observacoes_execucao) && (
                <>
                  <div className="acn-quadro-titulo">Observações de execução:</div>
                  <div className="acn-quadro tom-ok acn-set-texto-longo">
                    <Linkify text={modalVer.observacoes_execucao} />
                  </div>
                </>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalVer(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL CONCLUIR COMPRA ════════ */}
      {modalConcluirCompra && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModalConcluirCompra(null);}}}>
          <div className="modal-box acn-modal-cadastro acn-set-jan" role="dialog" aria-label="Concluir compra">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiCartOutline} size={16} /> Concluir Compra</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalConcluirCompra.descricao?.substring(0,80)}{modalConcluirCompra.descricao?.length>80?'...':''}
              </div>
              {erroCentros && (
                <Faixa tom="erro">Não foi possível ler os centros de custo ({erroCentros}). Sem eles não dá para concluir a compra; feche e abra de novo.</Faixa>
              )}

              {canVerValorCompra && (
                <div className="form-group">
                  <label className="acn-label" htmlFor="cc-valor"><Icone path={mdiCashMultiple} size={13} /> Valor total da compra (R$)</label>
                  <input id="cc-valor" className="acn-input" type="number" step="0.01" min="0"
                    value={compraForm.valor}
                    onChange={e=>setCompraForm(f=>({...f,valor:e.target.value}))}
                    placeholder="Ex: 1500.00" />
                </div>
              )}

              <div className="form-group">
                <label className="acn-label" htmlFor="cc-prazo"><Icone path={mdiCalendarOutline} size={13} /> Previsão de recebimento *</label>
                <input id="cc-prazo" className="acn-input" type="date"
                  value={compraForm.prazo}
                  onChange={e=>setCompraForm(f=>({...f,prazo:e.target.value}))} />
              </div>

              <div className="form-group">
                <label className="acn-label" htmlFor="cc-centro"><Icone path={mdiTagOutline} size={13} /> Centro de Custo *</label>
                <select id="cc-centro" className="acn-input"
                  value={compraForm.centro_custo_id||''}
                  onChange={e=>setCompraForm(f=>({...f,centro_custo_id:e.target.value}))}>
                  <option value="">— Selecionar —</option>
                  {/* Etapa 15a (05/10/2026): só agrupa / fora da vigência não é oferecido (o que já está gravado continua visível) */}
                  {centrosParaApontar(centrosCusto, compraForm.centro_custo_id || null).map(c => (
                    <option key={c.id} value={c.id} disabled={c.bloqueado}>{'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo} — {c.nome}{c.bloqueado ? ` (${motivoBloqueio(c)})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="acn-label" htmlFor="cc-op"><Icone path={mdiLinkVariant} size={13} /> Vincular a uma OP/OS (opcional)</label>
                <input id="cc-op" className="acn-input"
                  placeholder="Buscar por número da OP..."
                  value={opBuscaCompra} onChange={e=>buscarOpCompra(e.target.value)} />
                {opResultadosCompra.length > 0 && (
                  <div className="acn-sugestao-lista acn-set-sugestoes">
                    {opResultadosCompra.map(o => (
                      <div key={o.id} className="acn-sugestao-item" onClick={()=>{setCompraForm(f=>({...f,numero_opl:o.opl}));setOpBuscaCompra(o.opl);setOpResultadosCompra([]);}}>
                        <strong>{o.opl}</strong> — {o.cliente_nome||'—'}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {modalConcluirCompra.tipo_solicitacao === 'cotacao' && (
                <div className="acn-quadro">
                  <div className="acn-label"><Icone path={mdiPaperclip} size={13} /> Anexar cotação (PDF, imagem, planilha)</div>
                  <div className="acn-selos">
                    {anexosCotacao.map((a,i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="acn-tag">
                        <Icone path={mdiPaperclip} size={12} /> {a.nome}
                      </a>
                    ))}
                  </div>
                  <input type="file" id="anexo-cotacao-input" hidden
                    onChange={e=>{const f=e.target.files?.[0]; if(f) uploadAnexoCotacao(f, modalConcluirCompra.id); e.target.value='';}} />
                  <Botao pequeno icone={mdiPaperclip} disabled={enviandoAnexo}
                    onClick={()=>document.getElementById('anexo-cotacao-input')?.click()}>
                    {enviandoAnexo ? 'Enviando...' : 'Anexar Arquivo'}
                  </Botao>
                  <div className="acn-ajuda">
                    O solicitante será avisado automaticamente ao confirmar, com o valor cotado.
                  </div>
                </div>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalConcluirCompra(null)}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiCheckCircleOutline} onClick={confirmarConcluirCompra}>Confirmar Conclusão</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL FINALIZAR ORÇAMENTO (Lab SAC) ════════ */}
      {modalFinalizarOrc && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-set-jan" role="dialog" aria-label="Finalizar orçamento">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiReceiptTextOutline} size={16} /> Finalizar Orçamento — {sacOrdensMap[modalFinalizarOrc.sac_os_id]?.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <Faixa tom="info">
                Este orçamento será enviado ao SAC para aprovação do cliente. O KPI de elaboração será calculado agora.
              </Faixa>
              <div className="form-group">
                <label className="acn-label" htmlFor="orc-laudo">Laudo / Observações do Diagnóstico</label>
                <textarea id="orc-laudo" className="acn-input" rows={3}
                  placeholder="Descreva o diagnóstico, componentes a substituir, procedimentos..."
                  value={finalizarOrcForm.observacoes} onChange={e=>setFinalizarOrcForm(f=>({...f,observacoes:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="orc-valor">Valor do Orçamento (R$) *</label>
                <input id="orc-valor" className="acn-input" placeholder="Ex: 1.500,00"
                  value={finalizarOrcForm.valor} onChange={e=>setFinalizarOrcForm(f=>({...f,valor:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="orc-cond">Condições de Pagamento</label>
                <input id="orc-cond" className="acn-input" placeholder="Ex: À vista ou 50%+50%"
                  value={finalizarOrcForm.condicoes} onChange={e=>setFinalizarOrcForm(f=>({...f,condicoes:e.target.value}))} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={finalizarOrcamento}>FINALIZAR E ENVIAR AO SAC</Botao>
              <Botao onClick={()=>setModalFinalizarOrc(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
