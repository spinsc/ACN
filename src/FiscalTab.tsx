// @ts-nocheck
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';
import Linkify from './Linkify';
import { horasUteis } from './utils/horasUteis';
import { logChange, useUnreadMap } from './AuditSystem';
import { Botao, Selo, Tag, MenuAcoes } from './Interface';
import { mdiReceiptTextCheckOutline, mdiTruckCheckOutline, mdiEyeOutline, mdiUndoVariant, mdiClose } from '@mdi/js';

const semDado = (v) => !v || !String(v).trim();
const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [ordensOS, setOrdensOS] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});
  const [modalVer, setModalVer] = useState(null);
  const [busca, setBusca] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalEntregue, setModalEntregue] = useState(null);
  const [nomeRecebeu, setNomeRecebeu] = useState('');

  // ── Faturamento em grupo (OPs desmembradas — mesmo lote, 1 NF-e cobrindo todas) ─
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [nfLote, setNfLote] = useState('');
  const [faturandoLote, setFaturandoLote] = useState(false);
  const [faturandoId, setFaturandoId] = useState(null);
  const jaPreselecionou = React.useRef(false);

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, osRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
        .order('data_liberacao_comercial', { ascending: true }),
      supabase.from('sac_ordens_servico').select('*')
        .in('status', ['Aguardando Emissão NF','Faturada - Aguardando Entrega'])
        .eq('is_manutencao_veicular', true)
        .order('data_cq', { ascending: true }),
    ]);
    setOpls(oplsRes.data || []);
    setOrdensOS(osRes.data || []);
    if (!silent) setLoading(false);
  };

  // Pré-marca automaticamente, só na primeira carga, as OPs cujo lote (mesmo
  // número base) tem mais de 1 unidade aguardando NF-e ao mesmo tempo — nos
  // refreshes automáticos de 30s não mexe mais na seleção, pra não atropelar
  // um ajuste manual do usuário.
  useEffect(() => {
    if (jaPreselecionou.current) return;
    const aguardandoAgora = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
    if (aguardandoAgora.length === 0) return;
    jaPreselecionou.current = true;
    const porBase = {};
    aguardandoAgora.forEach(o => { const b = baseOplDe(o.opl); (porBase[b] = porBase[b] || []).push(o); });
    const novo = new Set();
    Object.values(porBase).forEach(irmaos => { if (irmaos.length > 1) irmaos.forEach(o => novo.add(o.id)); });
    setSelecionados(novo);
  }, [opls]);

  // ── Faturar em grupo — 1 NF-e cobrindo todas as OPs marcadas ────────────────
  // Trava contra faturar 2x o mesmo chassi (cada linha oples = 1 veículo):
  // o .eq('status_geral','Aguarda Emissao NF') vai junto no UPDATE, então só
  // "pega" quem ainda estiver de fato aguardando NF-e naquele instante — se
  // outra aba/usuário já faturou entre o carregamento da lista e o clique
  // aqui, o update não afeta a linha (retorna vazio) e ela é pulada, em vez
  // de sobrescrever um numero_nf que já existe.
  const faturarSelecionados = async () => {
    const nf = nfLote.trim();
    if (!nf) { alert('Informe o numero da NF-e!'); return; }
    const itens = opls.filter(o => selecionados.has(o.id) && o.status_geral === 'Aguarda Emissao NF');
    if (itens.length === 0) return;
    if (!await confirmar(`Faturar ${itens.length} OP(s) com a NF-e ${nf}?`)) return;
    setFaturandoLote(true);
    const agora = new Date().toISOString();
    const obsCombinado = itens.length > 1
      ? itens.map(o => {
          const partes = [];
          if (!semDado(o.chassi)) partes.push(`Chassi ${o.chassi}`);
          if (!semDado(o.placa)) partes.push(`Placa ${o.placa}`);
          if (!semDado(o.seriais_equipamentos)) partes.push(`Serial ${o.seriais_equipamentos}`);
          return `${o.opl}${partes.length ? ' — ' + partes.join(' | ') : ''}`;
        }).join('\n')
      : null;
    const faturadas = [];
    const jaFaturadasPorOutro = [];
    for (const o of itens) {
      const inicioFiscal = o.data_liberacao_comercial ? new Date(o.data_liberacao_comercial) : null;
      const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
      const novoRow = {
        status_geral: 'Faturado e Disponivel para Entrega',
        numero_nf: nf,
        data_emissao_nf: agora,
        responsavel_fiscal: currentUser?.nome,
        observacoes_faturamento: obsCombinado,
        ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      };
      const { data: upd } = await supabase.from('oples').update(novoRow)
        .eq('id', o.id).eq('status_geral', 'Aguarda Emissao NF').select();
      if (!upd || upd.length === 0) { jaFaturadasPorOutro.push(o.opl); continue; }
      faturadas.push(o);
      logChange({ module: 'fiscal', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
        oldRow: o, newRow: { ...o, ...novoRow }, user: currentUser });
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: o.id, numero_opl: o.opl, setor: 'Fiscal',
        evento: itens.length > 1
          ? `NF-e emitida em lote: ${nf} (junto com ${itens.length - 1} outra(s) unidade(s): ${itens.map(x=>x.opl).filter(n=>n!==o.opl).join(', ')}).`
          : `NF-e emitida: ${nf}. Disponivel para entrega.`,
        status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    if (faturadas.length > 0) {
      notificarEvento('fiscal_nf_emitida', msg.nfEmitida(faturadas.map(o=>o.opl).join(', '), nf, currentUser?.nome));
    }
    if (jaFaturadasPorOutro.length > 0) {
      alert(`Atenção: ${jaFaturadasPorOutro.join(', ')} já ${jaFaturadasPorOutro.length>1?'foram faturadas':'foi faturada'} por outra sessão enquanto você selecionava — não foram faturadas de novo. Confira a lista atualizada.`);
    }
    setSelecionados(new Set());
    setNfLote('');
    setFaturandoLote(false);
    fetchAll();
  };

  const faturar = async (opl) => {
    const nf = nfs[opl.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    if (!await confirmar(`Confirmar o faturamento da OP ${opl.opl} com a NF-e ${nf.trim()}?`)) return;
    setFaturandoId(opl.id);
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
    };
    const { data: upd } = await supabase.from('oples').update(novoRow)
      .eq('id', opl.id).eq('status_geral', 'Aguarda Emissao NF').select();
    if (!upd || upd.length === 0) {
      setFaturandoId(null);
      alert(`Esta OP já foi faturada por outra sessão enquanto você digitava. Atualizando a lista.`);
      fetchAll();
      return;
    }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `NF-e emitida: ${nf.trim()}. Disponivel para entrega.`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(opl.opl, nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    setFaturandoId(null);
    fetchAll();
  };

  const faturarOS = async (os) => {
    const nf = nfs[os.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    if (!await confirmar(`Confirmar o faturamento da OS ${os.numero_os || ''} com a NF-e ${nf.trim()}?`)) return;
    const agora = new Date().toISOString();
    const inicioFiscal = os.data_cq ? new Date(os.data_cq) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status: 'Faturada - Aguardando Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      atualizado_em: agora,
    };
    await supabase.from('sac_ordens_servico').update(novoRow).eq('id', os.id);
    logChange({ module: 'fiscal', entityType: 'sac_ordens_servico', entityId: os.id, changeType: 'UPDATE',
      oldRow: os, newRow: { ...os, ...novoRow }, user: currentUser });
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(os.numero_os, nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[os.id]; return n; });
    fetchAll();
  };

  // ── Devolver ao Comercial (inconsistência na OP/OS) ──────────────────────
  const devolverComercial = async () => {
    if (!obsDevolver.trim()) { alert('Descreva a inconsistência encontrada.'); return; }
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    const novoRow = { status_geral: 'Devolvida Comercial', obs_devolucao: obsDevolver.trim() };
    await supabase.from('oples').update(novoRow).eq('id', opl.id);
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `OP devolvida para Comercial. Inconsistência: ${obsDevolver.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_devolve_comerc', msg.oplDevolvida(opl.opl, 'Comercial', obsDevolver.trim(), currentUser?.nome));
    setModalDevolver(null); setObsDevolver('');
    fetchAll();
  };

  // ── Confirmar Entrega (fecha o ciclo: OP passa a status_geral='Faturado') ──
  const confirmarEntrega = async () => {
    if (!nomeRecebeu.trim()) { alert('Informe o nome de quem recebeu!'); return; }
    const opl = modalEntregue;
    const agora = new Date().toISOString();
    const novoRow = { status_geral: 'Faturado', cliente_recebeu_nome: nomeRecebeu.trim(), data_entrega: agora };
    const { error } = await supabase.from('oples').update(novoRow).eq('id', opl.id);
    if (error) { alert('Erro ao confirmar entrega: ' + error.message); return; }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `Equipamento entregue. Recebeu: ${nomeRecebeu.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Faturado',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('comercial_entregue', msg.entregue(opl.opl, opl.cliente_nome||'—', nomeRecebeu.trim()));
    setModalEntregue(null); setNomeRecebeu('');
    fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const aguardando = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
  const faturados = opls.filter(o => o.status_geral === 'Faturado e Disponivel para Entrega');
  const osAguardando = ordensOS.filter(o => o.status === 'Aguardando Emissão NF');
  const osFaturadas  = ordensOS.filter(o => o.status === 'Faturada - Aguardando Entrega');
  const totalPendentes = aguardando.length + osAguardando.length;
  const totalEmitidas  = faturados.length + osFaturadas.length;

  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', [...aguardando, ...faturados].map(o => o.id), currentUser);
  const { naoLidoSet: osNaoLidas } = useUnreadMap('sac_ordens_servico', [...osAguardando, ...osFaturadas].map(o => o.id), currentUser);

  const contagemPorBase = {};
  aguardando.forEach(o => { const b = baseOplDe(o.opl); contagemPorBase[b] = (contagemPorBase[b]||0) + 1; });
  const ehLote = (o) => contagemPorBase[baseOplDe(o.opl)] > 1;
  const toggleSelecionado = (id) => setSelecionados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Etapa 11 do plano de UX (30/09/2026): a parte visual desta tela passou para as peças do design system
  // (Botao, Selo, Tag, MenuAcoes e as classes acn-kpi / acn-tabela / acn-barra-selecao / acn-linha-*), no lugar
  // do estilo pintado à mão em cada elemento. Só aparência: os cliques, as gravações e as regras de cima são as mesmas.
  // O botão "Faturado" é o próximo passo da linha (principal); "Ver detalhes" e "Devolver ao Comercial" ficam no menu ⋯,
  // como no PCP — a devolução é a saída de exceção, não o caminho normal.
  return (
    <div>
      {/* RESUMO — notas pendentes / emitidas (OPs + OS veiculares, tudo que está na fila agora) */}
      <div className="acn-kpis">
        <div className="acn-kpi">
          <span className="rot"><i style={{ background: 'var(--acn-warn)' }} />Notas pendentes</span>
          <span className="val acn-num">{totalPendentes}</span>
          <span className="sub">{aguardando.length} OP{aguardando.length!==1?'s':''} · {osAguardando.length} OS</span>
        </div>
        <div className="acn-kpi">
          <span className="rot"><i style={{ background: 'var(--acn-ok)' }} />Notas emitidas</span>
          <span className="val acn-num">{totalEmitidas}</span>
          <span className="sub">{faturados.length} OP{faturados.length!==1?'s':''} · {osFaturadas.length} OS — aguardando entrega</span>
        </div>
      </div>

      {/* AGUARDANDO EMISSÃO */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPs aguardando emissão de NF-e <Selo familia="atencao" ponto={false}>{filtrarOpls(aguardando, busca).length}</Selo></span>
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />

        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : aguardando.length === 0 ? (
            <div className="acn-empty">Nenhuma OP aguardando emissão de NF-e.</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr>
                <th></th><th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo de projeto</th><th>Cliente</th><th>Lib. comercial</th>
                <th title="Seriais / nº de equipamentos, informados pelo Almoxarifado no kiting">Seriais</th><th title="Número da NF-e">NF-e</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {filtrarOpls(aguardando, busca).map(o => (
                  <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : ehLote(o) ? 'acn-linha-marca' : undefined}>
                    <td>
                      <input type="checkbox" checked={selecionados.has(o.id)} onChange={()=>toggleSelecionado(o.id)} />
                    </td>
                    <td>
                      <LinkOpl opl={o} currentUser={currentUser} />
                      {ehLote(o) && <div><Tag title="Faturada junto com as outras unidades do lote, numa NF-e só">Lote</Tag></div>}
                    </td>
                    <td>
                      <VeiculoOuEnvio o={o} />
                    </td>
                    <td><span className={'acn-num ' + ((o.quantidade||1)>1 ? 'acn-forte' : 'acn-fraco')}>{o.quantidade||1}</span></td>
                    <td>{o.tipo_projeto}</td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td className="acn-num">{fmtDt(o.data_liberacao_comercial)}</td>
                    <td>
                      {o.seriais_equipamentos ? (
                        <div className="acn-nota-mono"><Linkify text={o.seriais_equipamentos} /></div>
                      ) : (
                        <Selo familia="atencao" ponto={false} title="Não informado pelo Almoxarifado no kiting: os seriais / nº dos equipamentos não foram preenchidos">Sem serial</Selo>
                      )}
                    </td>
                    <td>
                      <input className="acn-input" style={{width:118}}
                        placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno variante="primario" disabled={faturandoId===o.id} onClick={()=>faturar(o)}>
                          {faturandoId===o.id ? '...' : 'Faturado'}
                        </Botao>
                        <MenuAcoes rotulo="Mais ações da OP" itens={[
                          { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) },
                          { rotulo: 'Devolver ao Comercial', icone: mdiUndoVariant, perigo: true, onClick: () => { setModalDevolver(o); setObsDevolver(''); } },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* JÁ FATURADOS */}
      {faturados.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span>Faturados — aguardando retirada/entrega <Selo familia="ok" ponto={false}>{faturados.length}</Selo></span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table className="acn-tabela">
              <thead><tr>
                <th>OP</th><th>Veículo</th><th>Cliente</th><th>NF-e</th><th>Data de emissão</th><th>Resp. fiscal</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {faturados.map(o => (
                  <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                    <td>
                      <VeiculoOuEnvio o={o} />
                    </td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      <Selo familia="ok" ponto={false}>#{o.numero_nf}</Selo>
                      {o.observacoes_faturamento && (
                        <div className="acn-nota-mono"><b>NF em lote:</b>{'\n'}{o.observacoes_faturamento}</div>
                      )}
                    </td>
                    <td className="acn-num">{fmtDt(o.data_emissao_nf)}</td>
                    <td>{o.responsavel_fiscal || '—'}</td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno variante="primario" icone={mdiTruckCheckOutline} onClick={()=>{setModalEntregue(o);setNomeRecebeu('');}}>Confirmar entrega</Botao>
                        <MenuAcoes rotulo="Mais ações da OP" itens={[
                          { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OS DE MANUTENÇÃO VEICULAR — AGUARDANDO EMISSÃO */}
      {osAguardando.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span>OS veiculares aguardando emissão de NF-e <Selo familia="atencao" ponto={false}>{osAguardando.length}</Selo></span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table className="acn-tabela">
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Número da NF-e</th><th>Ação</th></tr></thead>
              <tbody>
                {osAguardando.map(o => (
                  <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><strong className="acn-forte">{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      <div className="acn-duas">
                        <span>{semDado(o.veiculo_modelo) ? <Selo familia="atencao" ponto={false}>sem modelo</Selo> : o.veiculo_modelo}</span>
                        <small>{semDado(o.chassi) ? <Selo familia="atencao" ponto={false}>sem chassi</Selo> : `Chassi ${o.chassi}`}</small>
                      </div>
                    </td>
                    <td>
                      <input className="acn-input" style={{width:130}} placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturarOS(o)} />
                    </td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno variante="primario" icone={mdiReceiptTextCheckOutline} onClick={()=>faturarOS(o)}>Faturado</Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OS DE MANUTENÇÃO VEICULAR — JÁ FATURADAS */}
      {osFaturadas.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span>OS veiculares faturadas — aguardando entrega <Selo familia="ok" ponto={false}>{osFaturadas.length}</Selo></span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table className="acn-tabela">
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>NF-e</th><th>Data de emissão</th><th>Resp. fiscal</th></tr></thead>
              <tbody>
                {osFaturadas.map(o => (
                  <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><strong className="acn-forte">{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td><Selo familia="ok" ponto={false}>#{o.numero_nf}</Selo></td>
                    <td className="acn-num">{fmtDt(o.data_emissao_nf)}</td>
                    <td>{o.responsavel_fiscal || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OplMovimentadas setor="Fiscal" />
      <DemandaFooter setor="Fiscal" />

      {/* BARRA DE FATURAMENTO EM LOTE — OPs desmembradas (mesmo lote), uma NF-e para todas as marcadas */}
      {selecionados.size > 0 && (
        <div className="acn-barra-selecao">
          <strong className="acn-num">{selecionados.size} selecionada{selecionados.size!==1?'s':''}</strong>
          <input className="acn-input" style={{width:150}} placeholder="NF-e 000000000"
            value={nfLote} onChange={e=>setNfLote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
          <Botao pequeno variante="primario" icone={mdiReceiptTextCheckOutline} disabled={faturandoLote} onClick={faturarSelecionados}>
            {faturandoLote ? 'Faturando...' : `Faturar ${selecionados.size} selecionada${selecionados.size!==1?'s':''}`}
          </Botao>
          <Botao pequeno variante="discreto" icone={mdiClose} onClick={()=>setSelecionados(new Set())}>Limpar seleção</Botao>
        </div>
      )}

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL DEVOLVER AO COMERCIAL */}
      {modalDevolver && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalDevolver(null);}}>
          <div className="modal-box">
            <div className="modal-title">Devolver ao Comercial — {modalDevolver.opl}</div>
            <label className="acn-label">Inconsistência encontrada *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Descreva o que precisa ser corrigido pelo Comercial..."
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <Botao variante="secundario" onClick={()=>setModalDevolver(null)}>Cancelar</Botao>
              <Botao variante="perigo" style={{flex:1}} onClick={devolverComercial}>Confirmar devolução</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ENTREGA */}
      {modalEntregue && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalEntregue(null);}}>
          <div className="modal-box">
            <div className="modal-title">Confirmar entrega — {modalEntregue.opl}</div>
            <div className="acn-fraco" style={{marginBottom:12}}>NF: <strong className="acn-forte">#{modalEntregue.numero_nf}</strong></div>
            <label className="acn-label">Nome completo de quem recebeu o equipamento</label>
            <input className="acn-input" style={{width:'100%',marginBottom:14}}
              autoFocus placeholder="Nome do receptor" value={nomeRecebeu} onChange={e=>setNomeRecebeu(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmarEntrega()} />
            <div style={{display:'flex',gap:8}}>
              <Botao variante="secundario" onClick={()=>setModalEntregue(null)}>Cancelar</Botao>
              <Botao variante="primario" style={{flex:1}} onClick={confirmarEntrega}>Confirmar entrega</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
