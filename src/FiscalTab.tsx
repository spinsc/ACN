// @ts-nocheck
import { supabase } from './supabaseClient';
import { intervaloVisivel } from './IntervaloVisivel';
import { confirmar, mostrarAviso } from './Feedback';
import { lerRemessasAtivasDe } from './Remessas';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import Linkify from './Linkify';
import { horasUteis } from './utils/horasUteis';
import { logChange, useUnreadMap } from './AuditSystem';
import { Botao, Selo, Tag, MenuAcoes, Faixa } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import { mdiReceiptTextCheckOutline, mdiTruckCheckOutline, mdiEyeOutline, mdiUndoVariant, mdiClose, mdiAccountMultipleOutline, mdiCalendarEditOutline, mdiChevronDown, mdiChevronRight } from '@mdi/js';
import { EquipeDaOpModal, lerSituacaoDaEquipe, faltaApontar } from './EquipeDaOp';
import { podeEditarEquipeDaOp } from './utils/permissoes';
import { FiscalAntecipadas } from './FaturamentoAntecipado';
import CampoDataDaNota from './CampoDataDaNota';
import CorrigirDataDaNotaModal from './CorrigirDataDaNotaModal';
import { equipamentoDaOsParaOFiscal, dataDeFaturamentoDaNota, STATUS_AGUARDANDO_NOTA, STATUS_OS_FATURADA } from './SacFluxo';
import { SeloFluxosDoLote } from './FluxoMistoTela';
import { resolverDataDaNota, avisoDaDataRetroativa, textoDaDataNoHistorico, instanteDaNota, lerFechamentosAprovadosDoMes } from './DataDaNota';

const semDado = (v) => !v || !String(v).trim();
const STATUS_FATURADA = ['Faturado e Disponivel para Entrega', 'Faturado'];
// A nota informada pode ser a NF-e de material, a NFS-e de serviço ou as duas: às vezes vende-se só serviço,
// às vezes só material, às vezes os dois juntos (regra definida com o usuário em 05/10/2026). Pelo menos uma.
const descricaoNotas = (nf, nfServ) => [nf && `NF-e ${nf}`, nfServ && `NFS-e ${nfServ}`].filter(Boolean).join(' · ');
const AVISO_SEM_NOTA = 'Informe ao menos uma nota: a NF-e (material) ou a NFS-e (serviço).';
const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

import { podeCorrigirDataDaNota } from './utils/permissoes';

export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [ordensOS, setOrdensOS] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});
  // Nota de serviço (NFS-e) ao lado da NF-e de material — só os faturamentos que saem com as duas preenchem (05/10/2026)
  const [nfsServico, setNfsServico] = useState({});
  // Data da nota (26/10/2026): o Fiscal lança também notas de meses passados. Guarda só o que a pessoa escolheu (chave = a mesma das notas acima); vazio = hoje, o instante do clique, como sempre foi.
  const [datasNota, setDatasNota] = useState({});
  const [dataNotaLote, setDataNotaLote] = useState('');
  // Remessas (fatia 5, entrega 2 — 14/10/2026): OP que saiu em partes pode ter UMA NF-e para todas as remessas ou UMA POR REMESSA. `remessasPorOp` = as remessas ativas de cada OP da tela;
  // `oplsNfPorRemessa` = as OPs em que o Fiscal ligou "uma NF para cada remessa"; `nfsRemessa` = o número digitado em cada remessa. A comissão e o "faturado" seguem contando só com a OP inteira faturada.
  const [remessasPorOp, setRemessasPorOp] = useState<Map<string, any[]>>(() => new Map());
  const [oplsNfPorRemessa, setOplsNfPorRemessa] = useState<Set<string>>(() => new Set());
  const [nfsRemessa, setNfsRemessa] = useState<Record<string, string>>({});
  const [modalVer, setModalVer] = useState(null);
  // Corrigir a data de uma nota já emitida (27/10/2026): `{}` abre a busca; `{ op }` abre já com a OP escolhida (atalho do menu da linha de "Faturados")
  const [corrigindoData, setCorrigindoData] = useState<{ op?: any } | null>(null);
  // Quem trabalhou em cada OP (30/09/2026): a comissão dos técnicos sai do apontamento quando o Fiscal
  // fatura, e depois de faturar ele trava. Por isso o aviso e a correção aparecem AQUI, antes do clique.
  const [modalEquipe, setModalEquipe] = useState(null);
  const [situacaoEquipe, setSituacaoEquipe] = useState(null);   // null = ainda não carregou (sem falso alarme)
  const [busca, setBusca] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalEntregue, setModalEntregue] = useState(null);
  const [nomeRecebeu, setNomeRecebeu] = useState('');
  // 7.x (24/11/2026): leitura que falha não vale como "fila vazia", nem como "lote completo", nem como "equipe toda apontada":
  // a tela guarda o que não deu para ler, mantém o que já estava e avisa em vermelho (antes a atualização de 30 s apagava a fila em silêncio).
  const [falhas, setFalhas] = useState({ ops: false, os: false, lotes: false });
  const [falhaEquipe, setFalhaEquipe] = useState(false);
  const [gravandoModal, setGravandoModal] = useState(false);   // trava o clique duplo dos botões das duas janelas (devolver e confirmar entrega)

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

  useEffect(() => { fetchAll(); const t = intervaloVisivel(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, osRes, lotesRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
        .order('data_liberacao_comercial', { ascending: true }),
      // S2 (27/10/2026): toda OS COBRADA enviada ao Fiscal aparece aqui — a veicular (depois do CQ) e a do Laboratório (depois de concluída); antes só a manutenção veicular chegava
      supabase.from('sac_ordens_servico').select('*')
        .in('status', [STATUS_AGUARDANDO_NOTA, STATUS_OS_FATURADA])
        .order('data_envio_fiscal', { ascending: true, nullsFirst: false }).order('data_cq', { ascending: true }),
      // todas as unidades com sufixo /NN, de qualquer fase, para o bloco do lote saber
      // quantas já chegaram, quantas já foram faturadas e quantas ainda faltam
      supabase.from('oples').select('id,opl,status_geral,numero_nf,numero_nf_servico,fluxo_entrega,tipo_projeto').like('opl', '%/%'),   // fluxo e tipo: para o selo "Fluxo misto" do bloco do lote (27/10/2026)
    ]);
    setFalhas({ ops: !!oplsRes.error, os: !!osRes.error, lotes: !!lotesRes.error });
    // as unidades dos lotes: se a leitura falhou, fica o que já estava (null = nunca leu) e o faturamento do lote se recusa até conseguir ler
    if (!lotesRes.error) {
      const porBase = {};
      (lotesRes.data || []).forEach(u => { if (/\/\d+$/.test(u.opl || '')) { const b = baseOplDe(u.opl); (porBase[b] = porBase[b] || []).push(u); } });
      setUnidadesDoLote(porBase);
    }
    if (!oplsRes.error) {
      setOpls(oplsRes.data || []);
      // remessas ativas das OPs da tela (leitura que falha deixa as que já estavam; a lista de OPs não depende disto)
      const rem = await lerRemessasAtivasDe((oplsRes.data || []).map(o => o.id));
      if (!rem.erro) setRemessasPorOp(rem.porOp);
      lerSituacaoDaEquipe((oplsRes.data || []).filter(o => o.status_geral === 'Aguarda Emissao NF').map(o => o.id))
        .then(r => { setFalhaEquipe(!!r.erro); if (!r.erro) setSituacaoEquipe(r.mapa); });
    }
    if (!osRes.error) setOrdensOS(osRes.data || []);
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
  // NF-e compartilhada: o mesmo número em todas as remessas ativas das OPs faturadas. A OP já foi faturada quando isto roda: se falhar, só avisa (a nota da OP não se perde).
  const gravarNfNasRemessas = async (oplIds, nf) => {
    if (!nf || !oplIds.length) return;
    const { porOp, erro } = await lerRemessasAtivasDe(oplIds);
    if (erro) { mostrarAviso(`A NF-e foi gravada na OP, mas não consegui ler as remessas para gravar a nota nelas: ${erro}`, 'atencao'); return; }
    const ids = [...porOp.values()].flat().map(r => r.id);
    if (!ids.length) return;
    const { error } = await supabase.from('op_remessas').update({ nf_numero: nf }).in('id', ids);
    if (error) mostrarAviso(`A NF-e foi gravada na OP, mas não nas remessas dela: ${error.message}`, 'atencao');
  };

  // Confere a data da nota ANTES da pergunta de confirmação: recusa data inválida ou futura e devolve o aviso que segue junto da pergunta (em que mês a nota entra e se o mês
  // já tem comissão aprovada). Leitura recusada do fechamento não vira "nenhum": o aviso diz que não deu para conferir. null = parou (o motivo já foi mostrado).
  const conferirDataDaNota = async (entrada, tipo = 'op') => {
    const dataNota = resolverDataDaNota(entrada);
    if (dataNota.erro) { alert(dataNota.erro); return null; }
    // a comissão da OS também lê o dia da nota (S2 do SAC, 27/10/2026): a conferência do mês aprovado vale para as duas
    const fechamentos = dataNota.retroativa ? await lerFechamentosAprovadosDoMes(supabase, dataNota.dia) : null;
    return { dataNota, aviso: avisoDaDataRetroativa(dataNota, { tipo, fechamentos }) };
  };
  const limparDataNota = (chave) => setDatasNota(prev => { const n = { ...prev }; delete n[chave]; return n; });

  // 7.x (24/11/2026): o histórico da OP é gravado DEPOIS da mudança de etapa; antes uma falha aqui passava calada e a OP ficava sem a linha de quem fez o quê.
  // A mudança já está feita e não se desfaz: a falha só avisa.
  const registrarHistorico = async (linha, oQueFoiFeito) => {
    const { error } = await supabase.from('logs_movimentacao_opl').insert([linha]);
    if (error) mostrarAviso(`${oQueFoiFeito}, mas o histórico da OP ${linha.numero_opl} não foi gravado (${explicarErroDoBanco(error)}).`, 'atencao');
  };

  const executarFaturamento = async ({ itens, nf, nfServ, notaNoHistorico = '', dataNota = { retroativa: false } }) => {
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
    const comErro = [];   // o banco recusou (não é "outra sessão já faturou"): a nota digitada fica na tela para tentar de novo
    for (const o of itens) {
      const inicioFiscal = o.data_liberacao_comercial ? new Date(o.data_liberacao_comercial) : null;
      const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
      const novoRow = {
        status_geral: 'Faturado e Disponivel para Entrega',
        numero_nf: nf || null,
        numero_nf_servico: nfServ || null,
        data_emissao_nf: instanteDaNota(dataNota, agora),
        responsavel_fiscal: currentUser?.nome,
        observacoes_faturamento: obsCombinado,
        ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      };
      const { data: upd, error: erroUpd } = await supabase.from('oples').update(novoRow)
        .eq('id', o.id).eq('status_geral', 'Aguarda Emissao NF').select();
      if (erroUpd) { comErro.push({ id: o.id, opl: o.opl, motivo: explicarErroDoBanco(erroUpd) }); continue; }
      if (!upd || upd.length === 0) { jaFaturadasPorOutro.push(o.opl); continue; }
      faturadas.push(o);
      logChange({ module: 'fiscal', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
        oldRow: o, newRow: { ...o, ...novoRow }, user: currentUser });
      await registrarHistorico({
        opl_id: o.id, numero_opl: o.opl, setor: 'Fiscal',
        evento: (itens.length > 1
          ? `Faturado em lote: ${descricaoNotas(nf, nfServ)} (junto com ${itens.length - 1} outra(s) unidade(s): ${itens.map(x=>x.opl).filter(n=>n!==o.opl).join(', ')}).`
          : `Faturado: ${descricaoNotas(nf, nfServ)}. Disponivel para entrega.`) + notaNoHistorico + textoDaDataNoHistorico(dataNota),
        status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }, `A OP ${o.opl} foi faturada`);
    }
    if (faturadas.length > 0) {
      await gravarNfNasRemessas(faturadas.map(o => o.id), nf);   // OP com remessas: o mesmo número em cada remessa
    }
    if (jaFaturadasPorOutro.length > 0) {
      alert(`Atenção: ${jaFaturadasPorOutro.join(', ')} já ${jaFaturadasPorOutro.length>1?'foram faturadas':'foi faturada'} por outra sessão enquanto você selecionava — não foram faturadas de novo. Confira a lista atualizada.`);
    }
    if (comErro.length > 0) {
      alert(`Não foi possível faturar ${comErro.map(e => e.opl).join(', ')} (${[...new Set(comErro.map(e => e.motivo))].join('; ')}). ${comErro.length > 1 ? 'Essas OPs não foram alteradas' : 'Essa OP não foi alterada'}${faturadas.length ? `; as outras ${faturadas.length} foram faturadas` : ''}. As notas digitadas continuam na tela.`);
    }
    return { faturadas, comErro };
  };

  // Barra de baixo: OPs AVULSAS marcadas à mão (vendas diferentes na mesma nota).
  // As unidades de um lote não passam por aqui — têm o bloco próprio.
  const faturarSelecionados = async () => {
    const nf = nfLote.trim();
    const nfServ = nfServicoLote.trim();
    if (!nf && !nfServ) { alert(AVISO_SEM_NOTA); return; }
    const itens = opls.filter(o => selecionados.has(o.id) && o.status_geral === 'Aguarda Emissao NF');
    if (itens.length === 0) return;
    const conf = await conferirDataDaNota(dataNotaLote);
    if (!conf) return;
    if (!await confirmar(`Faturar ${itens.length} OP(s) com ${descricaoNotas(nf, nfServ).replace(' · ', ' e ')}?${conf.aviso}`)) return;
    setFaturandoLote(true);
    const { comErro } = await executarFaturamento({ itens, nf, nfServ, dataNota: conf.dataNota });
    if (comErro.length === 0) {
      setSelecionados(new Set());
      setNfLote('');
      setNfServicoLote('');
      setDataNotaLote('');
    } else {
      setSelecionados(new Set(comErro.map(e => e.id)));   // ficam marcadas só as que o banco recusou, com a nota digitada, para tentar de novo
    }
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
    // 7.x (24/11/2026): sem ter lido as unidades do lote não dá para saber se faltam unidades; antes a leitura que falhava deixava o lote parecer completo ("o lote inteiro, uma venda só")
    if (unidadesDoLote === null) { alert('Não foi possível faturar o lote agora: a lista das unidades dos lotes ainda não foi lida. Atualize a lista e tente de novo.'); return; }
    const chave = `lote:${base}`;
    const nf = (nfs[chave] || '').trim();
    const nfServ = (nfsServico[chave] || '').trim();
    const marcadas = chegaram.filter(u => !lotesDesmarcados.has(u.id));
    const deFora = chegaram.filter(u => lotesDesmarcados.has(u.id));
    if (!nf && !nfServ) { alert(AVISO_SEM_NOTA); return; }
    if (marcadas.length === 0) { alert('Marque ao menos uma unidade do lote para faturar.'); return; }
    const parcial = faltam.length > 0 || deFora.length > 0;
    const notas = descricaoNotas(nf, nfServ).replace(' · ', ' e ');
    const textoFalta = faltam.length ? `Ainda não chegaram ao Fiscal: ${faltam.map(u => `${u.opl} (${u.status_geral})`).join(', ')}.` : '';
    const textoFora = deFora.length ? `Você deixou de fora: ${deFora.map(u => u.opl).join(', ')}.` : '';
    const conf = await conferirDataDaNota(datasNota[chave]);
    if (!conf) return;
    const pergunta = parcial
      ? [`FATURAMENTO PARCIAL do lote ${base}.`, textoFalta, textoFora,
         `Estas ${marcadas.length} unidade(s) saem na ${notas}; as demais vão precisar de OUTRA nota.`,
         `Se o cliente exige nota única, espere o lote completo.`, conf.aviso, '\nFaturar assim mesmo?'].filter(Boolean).join('\n')
      : `Faturar o lote ${base} inteiro — ${marcadas.length} unidade(s), uma venda só — com a ${notas}?${conf.aviso}`;
    if (!await confirmar(pergunta)) return;
    setFaturandoId(chave);
    const { comErro } = await executarFaturamento({
      itens: marcadas, nf, nfServ, dataNota: conf.dataNota,
      notaNoHistorico: parcial ? ` Faturamento PARCIAL do lote ${base}${faltam.length ? `; faltavam: ${faltam.map(u => u.opl).join(', ')}` : ''}${deFora.length ? `; deixadas de fora: ${deFora.map(u => u.opl).join(', ')}` : ''}.` : '',
    });
    if (comErro.length === 0) {
      setNfs(prev => { const n = {...prev}; delete n[chave]; return n; });
      setNfsServico(prev => { const n = {...prev}; delete n[chave]; return n; });
      limparDataNota(chave);
      setLotesDesmarcados(prev => { const n = new Set(prev); marcadas.forEach(u => n.delete(u.id)); return n; });
    }   // com recusa do banco, a nota digitada e as marcas ficam como estavam, para tentar de novo
    setFaturandoId(null);
    fetchAll();
  };

  const faturar = async (opl) => {
    // OP que saiu em remessas (2 ou mais): uma NF-e para todas (o campo de sempre) ou, se o Fiscal ligou, uma NF-e por remessa; a OP guarda os números distintos juntos ("111 / 222")
    const rems = remessasPorOp.get(opl.id) || [];
    const porRemessa = rems.length >= 2 && oplsNfPorRemessa.has(opl.id);
    const numerosRemessa = porRemessa ? rems.map(r => (nfsRemessa[r.id] || '').trim()) : [];
    if (porRemessa && numerosRemessa.some(n => !n)) { alert('Informe a NF-e de cada remessa — ou desligue "uma NF-e para cada remessa" para usar uma nota só.'); return; }
    const nf = porRemessa ? [...new Set(numerosRemessa)].join(' / ') : (nfs[opl.id] || '').trim();
    const nfServ = (nfsServico[opl.id] || '').trim();
    if (!nf && !nfServ) { alert(AVISO_SEM_NOTA); return; }
    const detalheRemessas = porRemessa ? ' (' + rems.map((r, i) => `remessa ${r.numero}: ${numerosRemessa[i]}`).join('; ') + ')' : '';
    const conf = await conferirDataDaNota(datasNota[opl.id]);
    if (!conf) return;
    if (!await confirmar(`Confirmar o faturamento da OP ${opl.opl} com ${descricaoNotas(nf, nfServ).replace(' · ', ' e ')}${detalheRemessas}?${conf.aviso}`)) return;
    setFaturandoId(opl.id);
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf || null,
      numero_nf_servico: nfServ || null,
      data_emissao_nf: instanteDaNota(conf.dataNota, agora),
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
    };
    const { data: upd, error: erroUpd } = await supabase.from('oples').update(novoRow)
      .eq('id', opl.id).eq('status_geral', 'Aguarda Emissao NF').select();
    // 7.x (24/11/2026): o erro do banco antes valia como "já foi faturada por outra sessão" e o Fiscal desistia sem saber que nada tinha sido gravado
    if (erroUpd) {
      setFaturandoId(null);
      alert(`Não foi possível faturar a OP ${opl.opl} (${explicarErroDoBanco(erroUpd)}). Nada foi alterado; a nota digitada continua na tela.`);
      return;
    }
    if (!upd || upd.length === 0) {
      setFaturandoId(null);
      alert(`Esta OP já foi faturada por outra sessão enquanto você digitava. Atualizando a lista.`);
      fetchAll();
      return;
    }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await registrarHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `Faturado: ${descricaoNotas(nf, nfServ)}${detalheRemessas}. Disponivel para entrega.${textoDaDataNoHistorico(conf.dataNota)}`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }, `A OP ${opl.opl} foi faturada`);
    // remessas: cada uma recebe o seu número (uma NF-e por remessa) ou o mesmo número (NF-e compartilhada); a OP já está faturada, então uma falha aqui só avisa
    if (rems.length) {
      const erros = [];
      if (porRemessa) {
        for (let i = 0; i < rems.length; i++) {
          const { error } = await supabase.from('op_remessas').update({ nf_numero: numerosRemessa[i] }).eq('id', rems[i].id);
          if (error) erros.push(`remessa ${rems[i].numero}: ${error.message}`);
        }
      } else if (nf) {
        const { error } = await supabase.from('op_remessas').update({ nf_numero: nf }).in('id', rems.map(r => r.id));
        if (error) erros.push(error.message);
      }
      if (erros.length) mostrarAviso(`A OP foi faturada, mas a NF-e não ficou gravada nas remessas (${erros.join('; ')}).`, 'atencao');
    }
    setOplsNfPorRemessa(prev => { const n = new Set(prev); n.delete(opl.id); return n; });
    setNfsRemessa(prev => { const n = {...prev}; rems.forEach(r => delete n[r.id]); return n; });
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    setNfsServico(prev => { const n={...prev}; delete n[opl.id]; return n; });
    limparDataNota(opl.id);
    setFaturandoId(null);
    fetchAll();
  };

  const faturarOS = async (os) => {
    const nf = (nfs[os.id] || '').trim();
    const nfServ = (nfsServico[os.id] || '').trim();
    if (!nf && !nfServ) { alert(AVISO_SEM_NOTA); return; }
    const conf = await conferirDataDaNota(datasNota[os.id], 'os');
    if (!conf) return;
    if (!await confirmar(`Confirmar o faturamento da OS ${os.numero_os || ''} com ${descricaoNotas(nf, nfServ).replace(' · ', ' e ')}?${conf.aviso}`)) return;
    setFaturandoId(os.id);   // 7.x: o botão fica travado durante a gravação, como o da OP
    const agora = new Date().toISOString();
    // o Fiscal conta o tempo dele do dia em que o SAC enviou a OS (a do Laboratório não passa por CQ); OS antiga sem esse dia segue contando do CQ
    const inicioDoFiscal = os.data_envio_fiscal || os.data_cq;
    const inicioFiscal = inicioDoFiscal ? new Date(inicioDoFiscal) : null;
    const tempoFiscal = inicioFiscal ? horasUteis(inicioFiscal, new Date()) : null;
    const novoRow = {
      status: STATUS_OS_FATURADA,
      numero_nf: nf || null,
      numero_nf_servico: nfServ || null,
      data_emissao_nf: instanteDaNota(conf.dataNota, agora),
      // decidido com o usuário em 27/10/2026: o DIA da nota é a data de faturamento da OS (a da comissão); o SAC deixou de digitá-la
      data_faturamento: dataDeFaturamentoDaNota(conf.dataNota.dia),
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      atualizado_em: agora,
    };
    // só pega se a OS ainda espera a nota (outra aba ou pessoa pode ter faturado); antes a gravação recusada seguia como se tivesse dado certo
    const { data: gravada, error: erroFatura } = await supabase.from('sac_ordens_servico').update(novoRow).eq('id', os.id).eq('status', STATUS_AGUARDANDO_NOTA).select('id');
    if (erroFatura) { setFaturandoId(null); alert(`Não foi possível faturar a OS ${os.numero_os || ''} (${explicarErroDoBanco(erroFatura)}). Nada foi alterado.`); return; }
    if (!gravada?.length) { setFaturandoId(null); alert(`A OS ${os.numero_os || ''} já não está aguardando a nota (outra pessoa pode ter faturado). A lista foi atualizada.`); fetchAll(); return; }
    logChange({ module: 'fiscal', entityType: 'sac_ordens_servico', entityId: os.id, changeType: 'UPDATE',
      oldRow: os, newRow: { ...os, ...novoRow }, user: currentUser });
    setNfs(prev => { const n={...prev}; delete n[os.id]; return n; });
    setNfsServico(prev => { const n={...prev}; delete n[os.id]; return n; });
    limparDataNota(os.id);
    setFaturandoId(null);
    fetchAll();
  };

  // ── Devolver ao Comercial (inconsistência na OP/OS) ──────────────────────
  const devolverComercial = async () => {
    if (gravandoModal) return;
    if (!obsDevolver.trim()) { alert('Descreva a inconsistência encontrada.'); return; }
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    const novoRow = { status_geral: 'Devolvida Comercial', obs_devolucao: obsDevolver.trim() };
    setGravandoModal(true);
    // 7.x (24/11/2026): antes a gravação não conferia o erro nem a etapa: com o banco recusando, o Comercial recebia o aviso de que a OP voltou e a OP seguia aqui;
    // e a devolução podia desfazer um faturamento que outra pessoa acabava de fazer. Agora só devolve a OP que ainda espera a nota.
    const { data: devolvida, error: erroDev } = await supabase.from('oples').update(novoRow)
      .eq('id', opl.id).eq('status_geral', 'Aguarda Emissao NF').select('id');
    if (erroDev) { setGravandoModal(false); alert(`Não foi possível devolver a OP ${opl.opl} ao Comercial (${explicarErroDoBanco(erroDev)}). Nada foi alterado; o texto continua na janela.`); return; }
    if (!devolvida?.length) {
      setGravandoModal(false); setModalDevolver(null); setObsDevolver('');
      alert(`A OP ${opl.opl} já não está aguardando a nota (outra pessoa pode ter faturado ou devolvido). A lista foi atualizada.`);
      fetchAll();
      return;
    }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await registrarHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `OP devolvida para Comercial. Inconsistência: ${obsDevolver.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }, `A OP ${opl.opl} foi devolvida ao Comercial`);
    setModalDevolver(null); setObsDevolver('');
    setGravandoModal(false);
    fetchAll();
  };

  // ── Confirmar Entrega (fecha o ciclo: OP passa a status_geral='Faturado') ──
  const confirmarEntrega = async () => {
    if (gravandoModal) return;
    if (!nomeRecebeu.trim()) { alert('Informe o nome de quem recebeu!'); return; }
    const opl = modalEntregue;
    const agora = new Date().toISOString();
    const novoRow = { status_geral: 'Faturado', cliente_recebeu_nome: nomeRecebeu.trim(), data_entrega: agora };
    setGravandoModal(true);
    // 7.x (24/11/2026): sem conferir a etapa, o clique duplo (ou duas pessoas) gravava a entrega duas vezes: duas linhas no histórico e dois avisos de "entregue" ao Comercial
    const { data: entregue, error } = await supabase.from('oples').update(novoRow)
      .eq('id', opl.id).eq('status_geral', 'Faturado e Disponivel para Entrega').select('id');
    if (error) { setGravandoModal(false); alert('Erro ao confirmar entrega: ' + explicarErroDoBanco(error) + '. Nada foi alterado.'); return; }
    if (!entregue?.length) {
      setGravandoModal(false); setModalEntregue(null); setNomeRecebeu('');
      alert(`A entrega da OP ${opl.opl} já foi confirmada (outra pessoa pode ter confirmado). A lista foi atualizada.`);
      fetchAll();
      return;
    }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: opl, newRow: { ...opl, ...novoRow }, user: currentUser });
    await registrarHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `Equipamento entregue. Recebeu: ${nomeRecebeu.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Faturado',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }, `A entrega da OP ${opl.opl} foi confirmada`);
    setModalEntregue(null); setNomeRecebeu('');
    setGravandoModal(false);
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
    const nfsJaEmitidas = [...new Set(jaFaturadas.map(u => descricaoNotas(u.numero_nf, u.numero_nf_servico)).filter(Boolean))];
    const totalVenda = ativas.length;
    const naoLida = chegaram.some(o => oplsNaoLidas.has(String(o.id)));
    const alternar = (id) => setLotesDesmarcados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
      <React.Fragment key={chave}>
        <tr className={naoLida ? 'acn-linha-nova' : 'acn-linha-marca'}>
          <td colSpan={8}>
            <div className="acn-fis-lote-topo">
              <Botao pequeno variante="discreto" icone={aberto ? mdiChevronDown : mdiChevronRight} aria-expanded={aberto}
                aria-label={aberto ? 'Esconder as unidades' : 'Ver as unidades'}
                title={aberto ? 'Esconder as unidades' : 'Ver as unidades'}
                onClick={() => setLotesAbertos(p => ({ ...p, [base]: !aberto }))} />
              <strong className="acn-forte">🔗 {base}</strong>
              <Tag title="O lote é da produção; a nota é de uma venda só">Lote · {totalVenda || chegaram.length} unidades</Tag>
              {/* fluxo misto (M2): as unidades de envio chegam ao Fiscal em outro ritmo que as adaptadas; faturar só parte do lote é a saída deliberada, já prevista abaixo */}
              <SeloFluxosDoLote unidades={todas ? ativas : chegaram} />
              <span className="acn-fraco">{chegaram[0]?.cliente_nome || ''}</span>
            </div>
            <div className="acn-fraco acn-fis-lote-resumo">
              {chegaram.length} aguardando nota
              {jaFaturadas.length > 0 && <> · {jaFaturadas.length} já faturada(s){nfsJaEmitidas.length ? ` (${nfsJaEmitidas.join('; ')})` : ''}</>}
              {faltam.length > 0 && (
                <span className="acn-fis-lote-selo">
                  <Selo familia="atencao" ponto={false}
                    title={faltam.map(u => `${u.opl} — ${u.status_geral}`).join('\n')}>
                    Faltam {faltam.length} chegar ao Fiscal
                  </Selo>
                </span>
              )}
              {jaFaturadas.length > 0 && (
                <span className="acn-fis-lote-selo">
                  <Selo familia="atencao" ponto={false}
                    title="Parte deste lote já saiu em outra nota. Conferir se o cliente aceita notas separadas.">
                    Lote já faturado em parte
                  </Selo>
                </span>
              )}
            </div>
          </td>
          <td>
            <input className="acn-input acn-fis-nf" placeholder="NF-e (material)"
              value={nfs[chave] || ''}
              onChange={e => setNfs(prev => ({ ...prev, [chave]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && faturarLote({ base, chegaram, faltam })} />
          </td>
          <td>
            <input className="acn-input acn-fis-nf" placeholder="NFS-e (serviço)"
              value={nfsServico[chave] || ''}
              onChange={e => setNfsServico(prev => ({ ...prev, [chave]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && faturarLote({ base, chegaram, faltam })} />
          </td>
          <td>
            <CampoDataDaNota valor={datasNota[chave]} onChange={v => setDatasNota(prev => ({ ...prev, [chave]: v }))}
              onEnter={() => faturarLote({ base, chegaram, faltam })} />
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
            <td className="acn-fis-unidade">
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
            <td colSpan={3} />
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
      {/* Faturamento antecipado (08/10/2026): OPs que o Comercial liberou para faturar antes de terminar a adaptação */}
      <FiscalAntecipadas currentUser={currentUser} />
      {/* 7.x (24/11/2026): leitura que falha avisa em vermelho; a tela mantém o que já tinha e nunca mostra "nenhuma" no lugar de "não consegui ler" */}
      {(falhas.ops || falhas.os || falhas.lotes || falhaEquipe) && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={() => fetchAll()}>Tentar de novo</Botao>}>
          {(falhas.ops || falhas.os || falhas.lotes) && <>Não foi possível ler {[falhas.ops && 'as OPs', falhas.os && 'as OS do SAC', falhas.lotes && 'as unidades dos lotes'].filter(Boolean).join(', ')} agora; o que está na tela pode estar desatualizado{falhas.lotes && unidadesDoLote === null ? ' e o faturamento de lote fica barrado até a leitura voltar' : ''}.</>}
          {falhaEquipe && <>{(falhas.ops || falhas.os || falhas.lotes) ? ' ' : ''}Não foi possível conferir a equipe apontada em cada OP: o aviso "Equipe não apontada" pode não aparecer, e depois de faturar a equipe trava.</>}
        </Faixa>
      )}
      {/* RESUMO — notas pendentes / emitidas (OPs + OS veiculares, tudo que está na fila agora) */}
      <div className="acn-kpis">
        <div className="acn-kpi">
          <span className="rot"><i data-acn-familia="atencao" />Notas pendentes</span>
          <span className="val acn-num">{totalPendentes}</span>
          <span className="sub">{aguardando.length} OP{aguardando.length!==1?'s':''} · {osAguardando.length} OS</span>
        </div>
        <div className="acn-kpi">
          <span className="rot"><i data-acn-familia="ok" />Notas emitidas</span>
          <span className="val acn-num">{totalEmitidas}</span>
          <span className="sub">{faturados.length} OP{faturados.length!==1?'s':''} · {osFaturadas.length} OS — aguardando entrega</span>
        </div>
      </div>
      <div className="acn-fis-barra">
        {podeCorrigirDataDaNota(currentUser) && <Botao pequeno icone={mdiCalendarEditOutline} onClick={() => setCorrigindoData({})}
          title="Procura uma nota já emitida (também as de OP já entregue) e corrige o dia em que ela foi emitida">Corrigir a data de uma nota emitida</Botao>}
      </div>

      {/* AGUARDANDO EMISSÃO */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPs aguardando emissão de nota fiscal <Selo familia="atencao" ponto={false}>{filtrarOpls(aguardando, busca).length}</Selo></span>
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />

        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : aguardando.length === 0 ? (
            <div className="acn-empty">{falhas.ops ? 'Não foi possível ler as OPs agora.' : 'Nenhuma OP aguardando emissão de nota fiscal.'}</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr>
                <th></th><th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo de projeto</th><th>Cliente</th><th>Lib. comercial</th>
                <th title="Seriais / nº de equipamentos, informados pelo Almoxarifado no kiting">Seriais</th><th title="NF-e de venda de material — informe esta, a de serviço ou as duas">NF-e (material)</th><th title="NFS-e de serviço — informe esta, a de material ou as duas">NFS-e (serviço)</th><th title="Dia em que a nota foi emitida. Deixe em hoje para registrar agora; escolha um dia anterior para lançar uma nota de mês passado.">Data da nota</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {basesDeLote.map(renderLote)}
                {unicasAguardando.map(o => { const rems = remessasPorOp.get(o.id) || []; const porRem = rems.length >= 2 && oplsNfPorRemessa.has(o.id); return (
                  <React.Fragment key={o.id}>
                  <tr className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : ehLote(o) ? 'acn-linha-marca' : undefined}>
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
                      <input className="acn-input acn-fis-nf"
                        placeholder="NF-e (material)"
                        value={porRem ? 'uma por remessa ↓' : (nfs[o.id] || '')}
                        disabled={porRem}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <input className="acn-input acn-fis-nf"
                        placeholder="NFS-e (serviço)"
                        value={nfsServico[o.id] || ''}
                        onChange={e => setNfsServico(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <CampoDataDaNota valor={datasNota[o.id]} onChange={v => setDatasNota(prev => ({ ...prev, [o.id]: v }))} onEnter={() => faturar(o)} />
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
                  {/* Remessas (fatia 5, entrega 2): a OP saiu em partes — uma NF-e para todas (o campo acima) ou uma por remessa */}
                  {rems.length >= 2 && (
                    <tr className="acn-linha-remessas" data-teste="linha-remessas">
                      <td></td>
                      <td colSpan={11}>
                        <div className="acn-fis-remessas">
                          <span className="acn-forte">Esta OP saiu em {rems.length} remessas</span>
                          <label className="acn-fis-remessas-opcao">
                            <input type="checkbox" checked={porRem}
                              onChange={e => setOplsNfPorRemessa(prev => { const n = new Set(prev); e.target.checked ? n.add(o.id) : n.delete(o.id); return n; })} />
                            {' '}Uma NF-e para cada remessa
                          </label>
                          {porRem ? rems.map(r => (
                            <label key={r.id} className="acn-fis-remessa-nf">
                              <span>Remessa {r.numero} ({r.unidades} un.)</span>
                              <input className="acn-input acn-fis-nf" placeholder="NF-e da remessa" aria-label={`NF-e da remessa ${r.numero}`}
                                value={nfsRemessa[r.id] || ''}
                                onChange={e => setNfsRemessa(prev => ({...prev,[r.id]:e.target.value}))}
                                onKeyDown={e => e.key === 'Enter' && faturar(o)} />
                            </label>
                          )) : (
                            <span className="acn-ajuda">Todas as remessas saem na NF-e informada acima.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ); })}
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
          <div className="sec-body acn-rolagem">
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
                      {o.numero_nf && <Selo familia="ok" ponto={false} title="NF-e de venda de material">NF-e #{o.numero_nf}</Selo>}
                      {o.numero_nf_servico && (
                        <div className="acn-fis-selo-sub"><Selo familia="ok" ponto={false} title="NFS-e de serviço">NFS-e #{o.numero_nf_servico}</Selo></div>
                      )}
                      {/* OP que saiu em remessas com NF-e diferentes: qual nota levou cada remessa */}
                      {(() => { const rs = remessasPorOp.get(o.id) || [];
                        return rs.length >= 2 && new Set(rs.map(r => r.nf_numero).filter(Boolean)).size > 1
                          ? <div className="acn-nota-mono" data-teste="nf-por-remessa">{rs.map(r => `Remessa ${r.numero}: NF-e ${r.nf_numero || '—'}`).join('\n')}</div> : null; })()}
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
                          { rotulo: 'Corrigir a data da nota', icone: mdiCalendarEditOutline, onClick: () => setCorrigindoData({ op: o }), oculto: !podeCorrigirDataDaNota(currentUser) },
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
            <span>OS aguardando emissão de nota fiscal <Selo familia="atencao" ponto={false}>{osAguardando.length}</Selo></span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela">
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Veículo / equipamento</th><th>Faturar para</th><th>Valor</th><th>NF-e (material)</th><th>NFS-e (serviço)</th><th title="Dia em que a nota foi emitida. Deixe em hoje para registrar agora; escolha um dia anterior para lançar uma nota de mês passado.">Data da nota</th><th>Ação</th></tr></thead>
              <tbody>
                {osAguardando.map(o => (
                  <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><strong className="acn-forte">{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      {(() => { const e = equipamentoDaOsParaOFiscal(o); return (
                        <div className="acn-duas">
                          <span>{semDado(e.titulo) ? <Selo familia="atencao" ponto={false}>{o.is_manutencao_veicular ? 'sem modelo' : 'sem equipamento'}</Selo> : e.titulo}</span>
                          <small>{semDado(e.detalhe) ? (o.is_manutencao_veicular ? <Selo familia="atencao" ponto={false}>sem chassi</Selo> : null) : e.detalhe}</small>
                        </div>); })()}
                    </td>
                    <td>
                      <div className="acn-duas" data-teste="faturar-para">
                        <span>{o.razao_social_faturamento || o.cliente_nome || '—'}</span>
                        <small>{semDado(o.cnpj_faturamento || o.cpf_cnpj) ? <Selo familia="atencao" ponto={false}>sem CPF/CNPJ</Selo> : (o.cnpj_faturamento || o.cpf_cnpj)}</small>
                      </div>
                    </td>
                    <td className="acn-num" data-teste="valor-da-os">{currentUser?.ver_valores === false ? '—' : (o.valor_total ?? o.valor_orcamento) == null ? '—' : Number(o.valor_total ?? o.valor_orcamento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>
                      <input className="acn-input acn-fis-nf-os" placeholder="NF-e (material)"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturarOS(o)} />
                    </td>
                    <td>
                      <input className="acn-input acn-fis-nf-os" placeholder="NFS-e (serviço)"
                        value={nfsServico[o.id] || ''}
                        onChange={e => setNfsServico(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturarOS(o)} />
                    </td>
                    <td>
                      <CampoDataDaNota valor={datasNota[o.id]} onChange={v => setDatasNota(prev => ({ ...prev, [o.id]: v }))} onEnter={() => faturarOS(o)} />
                    </td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno variante="primario" icone={mdiReceiptTextCheckOutline} disabled={faturandoId===o.id} onClick={()=>faturarOS(o)}>{faturandoId===o.id ? '...' : 'Faturado'}</Botao>
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
            <span>OS faturadas — aguardando entrega <Selo familia="ok" ponto={false}>{osFaturadas.length}</Selo></span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela">
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Notas</th><th>Data de emissão</th><th>Resp. fiscal</th></tr></thead>
              <tbody>
                {osFaturadas.map(o => (
                  <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                    <td><strong className="acn-forte">{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      {o.numero_nf && <Selo familia="ok" ponto={false} title="NF-e de venda de material">NF-e #{o.numero_nf}</Selo>}
                      {o.numero_nf_servico && (
                        <div className="acn-fis-selo-sub"><Selo familia="ok" ponto={false} title="NFS-e de serviço">NFS-e #{o.numero_nf_servico}</Selo></div>
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
          <input className="acn-input acn-fis-nf-barra" placeholder="NF-e (material)"
            value={nfLote} onChange={e=>setNfLote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
          <input className="acn-input acn-fis-nf-barra" placeholder="NFS-e (serviço)"
            title="Nota de serviço — informe uma das duas notas, ou as duas"
            value={nfServicoLote} onChange={e=>setNfServicoLote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
          <CampoDataDaNota valor={dataNotaLote} onChange={setDataNotaLote} onEnter={faturarSelecionados} />
          <Botao pequeno variante="primario" icone={mdiReceiptTextCheckOutline} disabled={faturandoLote} onClick={faturarSelecionados}>
            {faturandoLote ? 'Faturando...' : `Faturar ${selecionados.size} selecionada${selecionados.size!==1?'s':''}`}
          </Botao>
          <Botao pequeno variante="discreto" icone={mdiClose} onClick={()=>setSelecionados(new Set())}>Limpar seleção</Botao>
        </div>
      )}

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}
      {corrigindoData && <CorrigirDataDaNotaModal currentUser={currentUser} inicial={corrigindoData.op || null} onClose={() => setCorrigindoData(null)} onCorrigida={() => fetchAll(true)} />}
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
            <textarea className="acn-input acn-fis-modal-texto" rows={3}
              placeholder="Descreva o que precisa ser corrigido pelo Comercial..."
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} autoFocus />
            <div className="acn-fis-modal-rodape">
              <Botao variante="secundario" onClick={()=>setModalDevolver(null)}>Cancelar</Botao>
              <Botao variante="perigo" className="acn-fis-confirma" disabled={gravandoModal} onClick={devolverComercial}>{gravandoModal ? 'Devolvendo...' : 'Confirmar devolução'}</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ENTREGA */}
      {modalEntregue && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalEntregue(null);}}>
          <div className="modal-box">
            <div className="modal-title">Confirmar entrega — {modalEntregue.opl}</div>
            <div className="acn-fraco acn-fis-modal-notas">
              {modalEntregue.numero_nf && <>NF-e: <strong className="acn-forte">#{modalEntregue.numero_nf}</strong></>}
              {modalEntregue.numero_nf && modalEntregue.numero_nf_servico && ' · '}
              {modalEntregue.numero_nf_servico && <>NFS-e: <strong className="acn-forte">#{modalEntregue.numero_nf_servico}</strong></>}
            </div>
            <label className="acn-label">Nome completo de quem recebeu o equipamento</label>
            <input className="acn-input acn-fis-modal-nome"
              autoFocus placeholder="Nome do receptor" value={nomeRecebeu} onChange={e=>setNomeRecebeu(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmarEntrega()} />
            <div className="acn-fis-modal-rodape">
              <Botao variante="secundario" onClick={()=>setModalEntregue(null)}>Cancelar</Botao>
              <Botao variante="primario" className="acn-fis-confirma" disabled={gravandoModal} onClick={confirmarEntrega}>{gravandoModal ? 'Gravando...' : 'Confirmar entrega'}</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
