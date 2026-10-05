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
import { mdiReceiptTextCheckOutline, mdiTruckCheckOutline, mdiEyeOutline, mdiUndoVariant, mdiClose, mdiAccountMultipleOutline } from '@mdi/js';
import { EquipeDaOpModal, situacaoDaEquipe, faltaApontar } from './EquipeDaOp';
import { podeEditarEquipeDaOp } from './utils/permissoes';

const semDado = (v) => !v || !String(v).trim();
const STATUS_FATURADA = ['Faturado e Disponivel para Entrega', 'Faturado'];
const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [ordensOS, setOrdensOS] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});
  // Nota de serviço (NFS-e) ao lado da NF-e de material — só os faturamentos que saem com as duas preenchem (05/10/2026)
  const [nfsServico, setNfsServico] = useState({});
  const [modalVer, setModalVer] = useState(null);
  // Quem trabalhou em cada OP (30/09/2026): a comissão dos técnicos sai do apontamento quando o Fiscal
  // fatura, e depois de faturar ele trava. Por isso o aviso e a correção aparecem AQUI, antes do clique.
  const [modalEquipe, setModalEquipe] = useState(null);
  const [situacaoEquipe, setSituacaoEquipe] = useState(null);   // null = ainda não carregou (sem falso alarme)
  const [busca, setBusca] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalEntregue, setModalEntregue] = useState(null);
  const [nomeRecebeu, setNomeRecebeu] = useState('');

  // ── Faturamento em grupo (OPs desmembradas — mesmo lote, 1 NF-e cobrindo todas) ─
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [nfLote, setNfLote] = useState('');
  const [nfServicoLote, setNfServicoLote] = useState('');
  const [faturandoLote, setFaturandoLote] = useState(false);
  const [faturandoId, setFaturandoId] = useState(null);
  // Todas as unidades de cada lote, em qualquer fase (base -> [{id, opl, status_geral, numero_nf}]).
  // null = ainda não carregou: o bloco do lote não acusa "faltam unidades" sem ter certeza.
  const [unidadesDoLote, setUnidadesDoLote] = useState(null);
  const [lotesDesmarcados, setLotesDesmarcados] = useState(() => new Set());   // unidades que o Fiscal tirou da nota
  const [lotesAbertos, setLotesAbertos] = useState({});

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, osRes, lotesRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
        .order('data_liberacao_comercial', { ascending: true }),
      supabase.from('sac_ordens_servico').select('*')
        .in('status', ['Aguardando Emissão NF','Faturada - Aguardando Entrega'])
        .eq('is_manutencao_veicular', true)
        .order('data_cq', { ascending: true }),
      // todas as unidades com sufixo /NN, de qualquer fase, para o bloco do lote saber
      // quantas já chegaram, quantas já foram faturadas e quantas ainda faltam
      supabase.from('oples').select('id,opl,status_geral,numero_nf').like('opl', '%/%'),
    ]);
    const porBase = {};
    (lotesRes.data || []).forEach(u => { if (/\/\d+$/.test(u.opl || '')) { const b = baseOplDe(u.opl); (porBase[b] = porBase[b] || []).push(u); } });
    setUnidadesDoLote(porBase);
    setOpls(oplsRes.data || []);
    setOrdensOS(osRes.data || []);
    situacaoDaEquipe((oplsRes.data || []).filter(o => o.status_geral === 'Aguarda Emissao NF').map(o => o.id))
      .then(setSituacaoEquipe);
    if (!silent) setLoading(false);
  };

  // ── Faturar em grupo — 1 NF-e cobrindo todas as OPs de uma lista ─────────────
  // Trava contra faturar 2x o mesmo chassi (cada linha oples = 1 veículo):
  // o .eq('status_geral','Aguarda Emissao NF') vai junto no UPDATE, então só
  // "pega" quem ainda estiver de fato aguardando NF-e naquele instante — se
  // outra aba/usuário já faturou entre o carregamento da lista e o clique
  // aqui, o update não afeta a linha (retorna vazio) e ela é pulada, em vez
  // de sobrescrever um numero_nf que já existe.
  //
  // Este é o miolo, usado pelas duas portas de entrada: a barra de OPs avulsas
  // marcadas (faturarSelecionados) e o bloco do lote (faturarLote). Quem chama
  // pergunta, valida e limpa a tela; aqui só se grava.
  const executarFaturamento = async ({ itens, nf, nfServ, notaNoHistorico = '' }) => {
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
        numero_nf_servico: nfServ || null,
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
        evento: (itens.length > 1
          ? `NF-e emitida em lote: ${nf}${nfServ ? ` · NFS-e ${nfServ}` : ''} (junto com ${itens.length - 1} outra(s) unidade(s): ${itens.map(x=>x.opl).filter(n=>n!==o.opl).join(', ')}).`
          : `NF-e emitida: ${nf}${nfServ ? ` · NFS-e ${nfServ}` : ''}. Disponivel para entrega.`) + notaNoHistorico,
        status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    if (faturadas.length > 0) {
      notificarEvento('fiscal_nf_emitida',
        msg.nfEmitida(faturadas.map(o=>o.opl).join(', '), nfServ ? `${nf} + NFS-e ${nfServ}` : nf, currentUser?.nome));
    }
    if (jaFaturadasPorOutro.length > 0) {
      alert(`Atenção: ${jaFaturadasPorOutro.join(', ')} já ${jaFaturadasPorOutro.length>1?'foram faturadas':'foi faturada'} por outra sessão enquanto você selecionava — não foram faturadas de novo. Confira a lista atualizada.`);
    }
    return faturadas;
  };

  // Barra de baixo: OPs AVULSAS marcadas à mão (vendas diferentes na mesma nota).
  // As unidades de um lote não passam por aqui — têm o bloco próprio.
  const faturarSelecionados = async () => {
    const nf = nfLote.trim();
    const nfServ = nfServicoLote.trim();
    if (!nf) { alert('Informe o numero da NF-e!'); return; }
    const itens = opls.filter(o => selecionados.has(o.id) && o.status_geral === 'Aguarda Emissao NF');
    if (itens.length === 0) return;
    if (!await confirmar(`Faturar ${itens.length} OP(s) com a NF-e ${nf}${nfServ ? ` e a NFS-e ${nfServ}` : ''}?`)) return;
    setFaturandoLote(true);
    await executarFaturamento({ itens, nf, nfServ });
    setSelecionados(new Set());
    setNfLote('');
    setNfServicoLote('');
    setFaturandoLote(false);
    fetchAll();
  };

  // ── Faturar um LOTE como uma venda só (05/10/2026) ─────────────────────────
  // O lote existe para a produção; para a nota, a venda é uma só. Por isso o
  // padrão é a nota cobrir o lote inteiro. Mas há casos de nota 1 a 1, de
  // algumas unidades juntas e de cliente que só aceita tudo junto — então o
  // parcial é possível, só que DE PROPÓSITO: o botão muda de cara e a pergunta
  // de confirmação diz o que vai ficar de fora e que vai precisar de outra nota.
  const faturarLote = async ({ base, chegaram, faltam }) => {
    const chave = `lote:${base}`;
    const nf = (nfs[chave] || '').trim();
    const nfServ = (nfsServico[chave] || '').trim();
    const marcadas = chegaram.filter(u => !lotesDesmarcados.has(u.id));
    const deFora = chegaram.filter(u => lotesDesmarcados.has(u.id));
    if (!nf) { alert('Informe o numero da NF-e do lote!'); return; }
    if (marcadas.length === 0) { alert('Marque ao menos uma unidade do lote para faturar.'); return; }
    const parcial = faltam.length > 0 || deFora.length > 0;
    const notas = `NF-e ${nf}${nfServ ? ` e NFS-e ${nfServ}` : ''}`;
    const textoFalta = faltam.length ? `Ainda não chegaram ao Fiscal: ${faltam.map(u => `${u.opl} (${u.status_geral})`).join(', ')}.` : '';
    const textoFora = deFora.length ? `Você deixou de fora: ${deFora.map(u => u.opl).join(', ')}.` : '';
    const pergunta = parcial
      ? [`FATURAMENTO PARCIAL do lote ${base}.`, textoFalta, textoFora,
         `Estas ${marcadas.length} unidade(s) saem na ${notas}; as demais vão precisar de OUTRA nota.`,
         `Se o cliente exige nota única, espere o lote completo.`, '\nFaturar assim mesmo?'].filter(Boolean).join('\n')
      : `Faturar o lote ${base} inteiro — ${marcadas.length} unidade(s), uma venda só — com a ${notas}?`;
    if (!await confirmar(pergunta)) return;
    setFaturandoId(chave);
    await executarFaturamento({
      itens: marcadas, nf, nfServ,
      notaNoHistorico: parcial ? ` Faturamento PARCIAL do lote ${base}${faltam.length ? `; faltavam: ${faltam.map(u => u.opl).join(', ')}` : ''}${deFora.length ? `; deixadas de fora: ${deFora.map(u => u.opl).join(', ')}` : ''}.` : '',
    });
    setNfs(prev => { const n = {...prev}; delete n[chave]; return n; });
    setNfsServico(prev => { const n = {...prev}; delete n[chave]; return n; });
    setLotesDesmarcados(prev => { const n = new Set(prev); marcadas.forEach(u => n.delete(u.id)); return n; });
    setFaturandoId(null);
    fetchAll();
  };

  const faturar = async (opl) => {
    const nf = nfs[opl.id];
    const nfServ = (nfsServico[opl.id] || '').trim();
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    if (!await confirmar(`Confirmar o faturamento da OP ${opl.opl} com a NF-e ${nf.trim()}${nfServ ? ` e a NFS-e ${nfServ}` : ''}?`)) return;
    setFaturandoId(opl.id);
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf.trim(),
      numero_nf_servico: nfServ || null,
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
      evento: `NF-e emitida: ${nf.trim()}${nfServ ? ` · NFS-e ${nfServ}` : ''}. Disponivel para entrega.`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(opl.opl, nfServ ? `${nf.trim()} + NFS-e ${nfServ}` : nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    setNfsServico(prev => { const n={...prev}; delete n[opl.id]; return n; });
    setFaturandoId(null);
    fetchAll();
  };

  const faturarOS = async (os) => {
    const nf = nfs[os.id];
    const nfServ = (nfsServico[os.id] || '').trim();
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    if (!await confirmar(`Confirmar o faturamento da OS ${os.numero_os || ''} com a NF-e ${nf.trim()}${nfServ ? ` e a NFS-e ${nfServ}` : ''}?`)) return;
    const agora = new Date().toISOString();
    const inicioFiscal = os.data_cq ? new Date(os.data_cq) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status: 'Faturada - Aguardando Entrega',
      numero_nf: nf.trim(),
      numero_nf_servico: nfServ || null,
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      atualizado_em: agora,
    };
    await supabase.from('sac_ordens_servico').update(novoRow).eq('id', os.id);
    logChange({ module: 'fiscal', entityType: 'sac_ordens_servico', entityId: os.id, changeType: 'UPDATE',
      oldRow: os, newRow: { ...os, ...novoRow }, user: currentUser });
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(os.numero_os, nfServ ? `${nf.trim()} + NFS-e ${nfServ}` : nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[os.id]; return n; });
    setNfsServico(prev => { const n={...prev}; delete n[os.id]; return n; });
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
  const ehLote = (o) => /\/\d+$/.test(o.opl || '');
  const toggleSelecionado = (id) => setSelecionados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // ── O LOTE NA FILA: uma venda, um bloco (05/10/2026) ────────────────────────
  // Antes o lote só era tratado como lote quando 2 ou mais unidades estavam na
  // fila AO MESMO TEMPO. Como o Comercial libera unidade por unidade, a primeira
  // a chegar parecia uma OP comum, com campo de NF próprio — e era faturada
  // sozinha, depois a /02 de novo. Agora toda unidade com sufixo /NN é de lote,
  // chegue sozinha ou junto, e o lote aparece num bloco só com a nota no cabeçalho.
  const ehDeLote = (o) => /\/\d+$/.test(o.opl || '');
  const visiveisAguardando = filtrarOpls(aguardando, busca);
  const unicasAguardando = visiveisAguardando.filter(o => !ehDeLote(o));
  const basesDeLote = [...new Set(visiveisAguardando.filter(ehDeLote).map(o => baseOplDe(o.opl)))];

  const renderLote = (base) => {
    const chave = `lote:${base}`;
    const chegaram = aguardando.filter(o => ehDeLote(o) && baseOplDe(o.opl) === base)
      .sort((a, b) => sufixoNum(a.opl) - sufixoNum(b.opl));
    // todas as unidades do lote, em qualquer fase — null = ainda não carregou (sem falso alarme)
    const todas = unidadesDoLote ? (unidadesDoLote[base] || []) : null;
    const idsChegaram = new Set(chegaram.map(o => o.id));
    const ativas = todas ? todas.filter(u => u.status_geral !== 'Cancelado') : chegaram;
    const jaFaturadas = todas ? ativas.filter(u => STATUS_FATURADA.includes(u.status_geral)) : [];
    const faltam = todas
      ? ativas.filter(u => !idsChegaram.has(u.id) && !STATUS_FATURADA.includes(u.status_geral))
          .sort((a, b) => sufixoNum(a.opl) - sufixoNum(b.opl))
      : [];
    const marcadas = chegaram.filter(u => !lotesDesmarcados.has(u.id));
    const parcial = faltam.length > 0 || marcadas.length < chegaram.length;
    const aberto = lotesAbertos[base] ?? (chegaram.length <= 6);
    const faturando = faturandoId === chave;
    const nfsJaEmitidas = [...new Set(jaFaturadas.map(u => u.numero_nf).filter(Boolean))];
    const totalVenda = ativas.length;
    const naoLida = chegaram.some(o => oplsNaoLidas.has(String(o.id)));
    const alternar = (id) => setLotesDesmarcados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
      <React.Fragment key={chave}>
        <tr className={naoLida ? 'acn-linha-nova' : 'acn-linha-marca'}>
          <td colSpan={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setLotesAbertos(p => ({ ...p, [base]: !aberto }))}
                title={aberto ? 'Esconder as unidades' : 'Ver as unidades'}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: 0 }}>{aberto ? '▾' : '▸'}</button>
              <strong className="acn-forte">🔗 {base}</strong>
              <Tag title="O lote é da produção; a nota é de uma venda só">Lote · {totalVenda || chegaram.length} unidades</Tag>
              <span className="acn-fraco">{chegaram[0]?.cliente_nome || ''}</span>
            </div>
            <div className="acn-fraco" style={{ marginTop: 3, fontSize: 10 }}>
              {chegaram.length} aguardando nota
              {jaFaturadas.length > 0 && <> · {jaFaturadas.length} já faturada(s){nfsJaEmitidas.length ? ` (NF-e ${nfsJaEmitidas.join(', ')})` : ''}</>}
              {faltam.length > 0 && (
                <span style={{ marginLeft: 6 }}>
                  <Selo familia="atencao" ponto={false}
                    title={faltam.map(u => `${u.opl} — ${u.status_geral}`).join('\n')}>
                    Faltam {faltam.length} chegar ao Fiscal
                  </Selo>
                </span>
              )}
              {jaFaturadas.length > 0 && (
                <span style={{ marginLeft: 6 }}>
                  <Selo familia="atencao" ponto={false}
                    title="Parte deste lote já saiu em outra nota. Conferir se o cliente aceita notas separadas.">
                    Lote já faturado em parte
                  </Selo>
                </span>
              )}
            </div>
          </td>
          <td>
            <input className="acn-input" style={{ width: 118 }} placeholder="NF-e do lote"
              value={nfs[chave] || ''}
              onChange={e => setNfs(prev => ({ ...prev, [chave]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && faturarLote({ base, chegaram, faltam })} />
          </td>
          <td>
            <input className="acn-input" style={{ width: 118 }} placeholder="NFS-e (se houver)"
              value={nfsServico[chave] || ''}
              onChange={e => setNfsServico(prev => ({ ...prev, [chave]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && faturarLote({ base, chegaram, faltam })} />
          </td>
          <td>
            <div className="acn-acoes-linha">
              <Botao pequeno variante={parcial ? 'secundario' : 'primario'} disabled={faturando || marcadas.length === 0}
                title={parcial
                  ? 'Faturamento parcial: nem todas as unidades do lote entram nesta nota'
                  : 'Fatura o lote inteiro, como uma venda só'}
                onClick={() => faturarLote({ base, chegaram, faltam })}>
                {faturando ? '...' : parcial
                  ? `Faturar ${marcadas.length} de ${totalVenda || chegaram.length}`
                  : `Faturar lote inteiro (${marcadas.length})`}
              </Botao>
            </div>
          </td>
        </tr>
        {aberto && chegaram.map(o => (
          <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
            <td>
              <input type="checkbox" checked={!lotesDesmarcados.has(o.id)} onChange={() => alternar(o.id)}
                title="Desmarque para deixar esta unidade fora da nota (vira faturamento parcial)" />
            </td>
            <td style={{ paddingLeft: 22 }}>
              <LinkOpl opl={o} currentUser={currentUser} />
              {situacaoEquipe && faltaApontar(o, situacaoEquipe[o.id]).algum && (
                <div>
                  <Selo familia="atencao" ponto={false}
                    title="Tem mão de obra lançada e ninguém apontado para recebê-la: sem isso não sai comissão. Depois de faturar, a equipe trava. Use ⋯ › Equipe.">
                    Equipe não apontada
                  </Selo>
                </div>
              )}
            </td>
            <td><VeiculoOuEnvio o={o} /></td>
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
            <td colSpan={2} />
            <td>
              <div className="acn-acoes-linha">
                <MenuAcoes rotulo="Mais ações da OP" itens={[
                  { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) },
                  { rotulo: 'Equipe (quem trabalhou)', icone: mdiAccountMultipleOutline, onClick: () => setModalEquipe(o), oculto: !podeEditarEquipeDaOp(currentUser) },
                  { rotulo: 'Devolver ao Comercial', icone: mdiUndoVariant, perigo: true, onClick: () => { setModalDevolver(o); setObsDevolver(''); } },
                ]} />
              </div>
            </td>
          </tr>
        ))}
      </React.Fragment>
    );
  };

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
                <th title="Seriais / nº de equipamentos, informados pelo Almoxarifado no kiting">Seriais</th><th title="Número da NF-e de venda de material">NF-e (material)</th><th title="Número da NFS-e de serviço — só quando o faturamento sai com as duas notas">NFS-e (serviço)</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {basesDeLote.map(renderLote)}
                {unicasAguardando.map(o => (
                  <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : ehLote(o) ? 'acn-linha-marca' : undefined}>
                    <td>
                      <input type="checkbox" checked={selecionados.has(o.id)} onChange={()=>toggleSelecionado(o.id)} />
                    </td>
                    <td>
                      <LinkOpl opl={o} currentUser={currentUser} />
                      {ehLote(o) && <div><Tag title="Faturada junto com as outras unidades do lote, numa NF-e só">Lote</Tag></div>}
                      {situacaoEquipe && faltaApontar(o, situacaoEquipe[o.id]).algum && (
                        <div>
                          <Selo familia="atencao" ponto={false}
                            title="Tem mão de obra lançada e ninguém apontado para recebê-la: sem isso não sai comissão. Depois de faturar, a equipe trava. Use ⋯ › Equipe.">
                            Equipe não apontada
                          </Selo>
                        </div>
                      )}
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
                      <input className="acn-input" style={{width:118}}
                        placeholder="NFS-e (se houver)"
                        value={nfsServico[o.id] || ''}
                        onChange={e => setNfsServico(prev => ({...prev,[o.id]:e.target.value}))}
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
                          { rotulo: 'Equipe (quem trabalhou)', icone: mdiAccountMultipleOutline, onClick: () => setModalEquipe(o), oculto: !podeEditarEquipeDaOp(currentUser) },
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
                <th>OP</th><th>Veículo</th><th>Cliente</th><th>Notas</th><th>Data de emissão</th><th>Resp. fiscal</th><th>Ação</th>
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
                      <Selo familia="ok" ponto={false} title="NF-e de venda de material">NF-e #{o.numero_nf}</Selo>
                      {o.numero_nf_servico && (
                        <div style={{marginTop:3}}><Selo familia="ok" ponto={false} title="NFS-e de serviço">NFS-e #{o.numero_nf_servico}</Selo></div>
                      )}
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
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>NF-e (material)</th><th>NFS-e (serviço)</th><th>Ação</th></tr></thead>
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
                      <input className="acn-input" style={{width:130}} placeholder="NFS-e (se houver)"
                        value={nfsServico[o.id] || ''}
                        onChange={e => setNfsServico(prev => ({...prev,[o.id]:e.target.value}))}
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
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Notas</th><th>Data de emissão</th><th>Resp. fiscal</th></tr></thead>
              <tbody>
                {osFaturadas.map(o => (
                  <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><strong className="acn-forte">{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      <Selo familia="ok" ponto={false} title="NF-e de venda de material">NF-e #{o.numero_nf}</Selo>
                      {o.numero_nf_servico && (
                        <div style={{marginTop:3}}><Selo familia="ok" ponto={false} title="NFS-e de serviço">NFS-e #{o.numero_nf_servico}</Selo></div>
                      )}
                    </td>
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

      {/* BARRA DE OPs AVULSAS — uma NF-e para várias vendas marcadas à mão. O lote tem o bloco próprio, com a nota no cabeçalho. */}
      {selecionados.size > 0 && (
        <div className="acn-barra-selecao">
          <strong className="acn-num">{selecionados.size} selecionada{selecionados.size!==1?'s':''}</strong>
          <input className="acn-input" style={{width:150}} placeholder="NF-e 000000000"
            value={nfLote} onChange={e=>setNfLote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
          <input className="acn-input" style={{width:150}} placeholder="NFS-e (se houver)"
            title="Nota de serviço do mesmo lote — deixe em branco se o faturamento só tem a NF-e de material"
            value={nfServicoLote} onChange={e=>setNfServicoLote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
          <Botao pequeno variante="primario" icone={mdiReceiptTextCheckOutline} disabled={faturandoLote} onClick={faturarSelecionados}>
            {faturandoLote ? 'Faturando...' : `Faturar ${selecionados.size} selecionada${selecionados.size!==1?'s':''}`}
          </Botao>
          <Botao pequeno variante="discreto" icone={mdiClose} onClick={()=>setSelecionados(new Set())}>Limpar seleção</Botao>
        </div>
      )}

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}
      {modalEquipe && (
        <EquipeDaOpModal opl={modalEquipe} currentUser={currentUser}
          aoFechar={()=>{ setModalEquipe(null); fetchAll(true); }} />
      )}

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
            <div className="acn-fraco" style={{marginBottom:12}}>
              NF-e: <strong className="acn-forte">#{modalEntregue.numero_nf}</strong>
              {modalEntregue.numero_nf_servico && <> · NFS-e: <strong className="acn-forte">#{modalEntregue.numero_nf_servico}</strong></>}
            </div>
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
