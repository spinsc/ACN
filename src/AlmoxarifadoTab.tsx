// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import { soEnvio, fluxoLabel, fluxoEfetivo, UFS, STATUS_EMBALAGEM, TIPO_VENDA_ENVIO, STATUS_AGUARDANDO_LIBERACAO_COMERCIAL } from './FluxoEntrega';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import { notificarEvento, msg } from './whatsappHelper';
import { logChange, useUnreadMap } from './AuditSystem';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { VinculoPicker } from './VinculoPicker';
import type { VinculoValue } from './VinculoPicker';
import { ModalDevolverOp } from './DevolverOp';
import { ModalKitingLoteEnvio } from './KitingLoteEnvio';
import { ConferenciaKit, conferenciaInicial, validarConferencia, divergencias, resumoDivergencias, registroConferencia } from './OpItens';
import { indicePendencias, travaKit100, travaRecebimento, textoFaltando, ChecklistPendencias } from './OpPendencias';
import { confirmar, mostrarAviso } from './Feedback';
import { formatarCep, soDigitosCep, cepComFormatoValido, consultarCep } from './Cep';
import { normalizarBusca } from './SearchUtils';
import { diaBR, Faixa, Botao, Chips, Selo } from './Interface';
import Icone from './Icone';
import {
  mdiToolboxOutline, mdiPackageVariantClosed, mdiArrowULeftTop, mdiEyeOutline, mdiLinkVariant, mdiTrayArrowDown,
  mdiCloseCircleOutline, mdiAlertOutline, mdiChevronUp, mdiChevronDown, mdiTruckOutline, mdiClose, mdiNumeric,
  mdiContentSaveOutline, mdiCheckCircleOutline, mdiSendOutline,
} from '@mdi/js';
import { PainelEstoque, PainelFabricacaoRecebimento, baixarKitDaOp, textoDaBaixa, faltaDeEstoqueNoKit, textoFaltaEstoque, reservaDeOutrasNoKit, textoReservaDeOutras, saldosDoKit } from './Estoque';

const semDado = (v) => !v || !String(v).trim();

export default function AlmoxarifadoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  // Linhas com alteração não vista por este usuário ganham borda amarela —
  // mesmo padrão usado nas outras telas de OP (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', opls.map((o: any) => o.id), currentUser);
  const [modalPend, setModalPend] = useState(null);
  const [obsPend, setObsPend] = useState('');
  const [modalFalta, setModalFalta] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [obsFalta, setObsFalta] = useState('');
  const [busca, setBusca] = useState('');
  // OPs desmembradas (mesmo numero base, sufixo /01../NN) agrupadas numa
  // linha de lote — mesmo padrao de EngenhariaTab.tsx / PCPTab.tsx.
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [processandoLote, setProcessandoLote] = useState(false);
  const [modalLoteAcao, setModalLoteAcao] = useState(null); // { tipo:'falta'|'pendencia', base, irmaos }
  const [obsLoteAcao, setObsLoteAcao] = useState('');
  // Numeros de serie agora sao informados aqui, no kiting, antes de liberar
  // para o PCP mandar para producao (antes eram no Comercial, na liberacao
  // para o Fiscal — mudou porque o produto ja deve sair do Almoxarifado
  // com o serial aplicado).
  const [modalSeriais, setModalSeriais] = useState(null); // opl aguardando confirmacao de kiting
  const [seriaisKitForm, setSeriaisKitForm] = useState('');
  // Importação em lote dos seriais — uma linha colada por unidade, na
  // ordem /01../NN (cada unidade tem equipamentos/seriais diferentes, não
  // dá para repetir o mesmo valor para todas de uma vez).
  const [modalSeriaisLote, setModalSeriaisLote] = useState(null); // { base, irmaos }
  const [seriaisLoteTexto, setSeriaisLoteTexto] = useState('');
  const [aplicandoSeriaisLote, setAplicandoSeriaisLote] = useState(false);
  // Venda para Envio: kiting 100% do lote com os seriais de todos os produtos
  const [modalKitEnvioLote, setModalKitEnvioLote] = useState(null); // { base, ops }
  // Conferência do kit contra a BOM da Engenharia (quando a OP tem BOM)
  const [conferencia, setConferencia] = useState<any[]>([]);
  // em lote não há conferência linha a linha: registra a BOM como separada inteira
  // (`completo`, porque desde 28/09/2026 o checklist unitário começa vazio)
  const conferenciaLote = (o) => (o?.bom_itens || []).length
    ? { kit_conferencia: registroConferencia(conferenciaInicial({ bom_itens: o.bom_itens }, { completo: true }), currentUser, true) } : {};

  /**
   * O kiting em lote também dá baixa no estoque (28/09/2026).
   *
   * Até aqui o lote registrava a conferência como separada inteira mas NUNCA
   * movimentava estoque: OP fechada em lote saía com o material na mão e o
   * saldo intacto. O unitário sempre baixou; o lote não.
   *
   * Vale só para OP que ainda NÃO passou pelo Almoxarifado, como o usuário
   * pediu: o que já foi fechado antes fica como está, sem correção retroativa.
   * O `status_almox` já preenchido é a marca de quem já passou. E mesmo que
   * uma OP volte para refazer o kit, `baixarKitDaOp` trabalha por diferença e
   * não conta o material duas vezes.
   */
  const baixarNoLote = async (o) => {
    if (o?.status_almox) return null;                       // já passou pelo almox: ignora
    const linhas = conferenciaInicial({ bom_itens: o?.bom_itens || [] }, { completo: true });
    if (!linhas.length) return null;
    return await baixarKitDaOp({ opl: o, linhas, currentUser });
  };
  // saldo de cada item da lista, para o checklist saber o que dá para marcar
  const [saldosKit, setSaldosKit] = useState({});
  const [salvandoSeparacao, setSalvandoSeparacao] = useState(false);
  const [modalDevolver, setModalDevolver] = useState(null);
  // Solicitação de reposição de estoque (nova) — pedido de compra/fabricação
  // interna que precisa de liberação do PCP antes de cair no setor certo.
  const [modalReposicao, setModalReposicao] = useState(false);
  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState([]);

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);
  useEffect(() => { fetchSolicitacoes(); }, []);

  // Etapa 7.50: leitura que falha não pode parecer "nenhuma OP aguardando" nem "nenhuma solicitação ainda"
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroSolicitacoes, setErroSolicitacoes] = useState('');
  const fetchSolicitacoes = async () => {
    const { data, error } = await supabase.from('almoxarifado_solicitacoes_reposicao')
      .select('*').order('criado_em', { ascending: false }).limit(20);
    if (error) { setErroSolicitacoes(error.message); return; }
    setErroSolicitacoes('');
    setMinhasSolicitacoes(data || []);
  };

  // Quais OPs têm demanda de Serralheria/Chicotes/Compras pendurada — o kit
  // 100% fica barrado enquanto o material não estiver aqui dentro.
  const [pendPorOp, setPendPorOp] = useState(new Map());
  const pendenciasDe = (o) => pendPorOp.get(String(o?.id)) || [];
  const faltandoPara = (o) => travaKit100(pendenciasDe(o), o);

  // Pendências que fecharam no setor DEPOIS que a OP já saiu do Almoxarifado
  // (kit liberado com pendência, produção começou, e só então a Serralheria/
  // Chicotes concluiu). Sem esta lista à parte, essas OPs somem da tela do
  // Almoxarifado (que só mostra "Aguardando Almox"/"Aguardando Embalagem") e
  // ninguém consegue mais confirmar o recebimento — a pendência trava a
  // Produção para sempre. Achado em 23/09/2026 com as OPs 1653.2609/01 e /02.
  const [oplsPendenciaAlmox, setOplsPendenciaAlmox] = useState([]);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const mapa = await indicePendencias();
    setPendPorOp(mapa);
    const { data, error: erroOpls } = await supabase.from('oples').select('*')
      // 'Aguardando Embalagem' = OP que JA foi produzida (hoje: fabricação da
      // serralheria com envio) e voltou só para ser pesada, medida e embalada.
      // É uma segunda passagem pelo Almoxarifado, com trabalho diferente do
      // kiting — por isso status próprio (ver FluxoEntrega.ts).
      .in('status_geral', ['Aguardando Almox', STATUS_EMBALAGEM])
      .order('data_entrada', { ascending: false });
    // se a leitura falhou, fica a lista que já estava na tela (em vez de esvaziar e dizer "nenhuma OP aguardando")
    if (erroOpls) { setErroLeitura(erroOpls.message); if (!silent) setLoading(false); return; }
    setErroLeitura('');
    setOpls(data || []);

    // O painel de recebimento lista TODA OP com material esperando conferência,
    // inclusive as que ainda estão na fila de kiting aqui em cima.
    //
    // Antes ele excluía quem estava na lista de kiting, para não repetir a OP
    // na tela. Só que isso criava um beco sem saída (caso da A1656.2609, em
    // 24/09/2026): a OP em "Aguardando Almox" ficava de fora do painel, e o
    // único lugar de confirmar o recebimento era o checklist dentro do modal
    // de kiting — que não abre, porque o botão KITING 100% fica desabilitado
    // exatamente enquanto o material não é recebido. O chicote ficava pronto,
    // e ninguém tinha onde dizer que ele chegou.
    //
    // Aparecer nos dois lugares é de propósito: em cima é a fila de separar,
    // aqui embaixo é o que dá para resolver agora.
    const ids = [...mapa.keys()];
    if (ids.length) {
      const { data: pend, error: erroPend } = await supabase.from('oples')
        .select('id,opl,cliente_nome,modelo,status_geral,pendencias_kit')
        .in('id', ids)
        .not('status_geral', 'in', '("Faturado","Faturado e Disponivel para Entrega","Cancelado")');
      if (erroPend) { setErroLeitura(erroPend.message); if (!silent) setLoading(false); return; }
      setOplsPendenciaAlmox((pend || []).filter(o => travaRecebimento(mapa.get(String(o.id)) || [], o).length));
    } else {
      setOplsPendenciaAlmox([]);
    }
    if (!silent) setLoading(false);
  };

  const setAlmox = async (opl, statusAlmox, statusGeral, obs='', extra={}) => {
    const agora = new Date().toISOString();
    const { error: erroOp } = await supabase.from('oples').update({
      status_almox: statusAlmox,
      status_geral: statusGeral,
      obs_almox: obs,
      data_kiting: agora,
      responsavel_almox: currentUser?.nome,
      ...extra,
    }).eq('id', opl.id);
    // Etapa 7.50 (06/10/2026): a gravação recusada seguia como se tivesse dado certo (aviso no WhatsApp, janela fechada, "Kit 100%"
    // dito na tela com a OP parada no banco). Agora devolve false e quem chamou para; o estoque já baixado não duplica ao repetir
    // (a baixa trabalha por diferença).
    if (erroOp) { alert(`Não foi possível atualizar a OP ${opl.opl}: ${erroOp.message}`); return false; }
    logChange({ module: 'almoxarifado', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_almox: opl.status_almox, status_geral: opl.status_geral, obs_almox: opl.obs_almox },
      newRow: { status_almox: statusAlmox, status_geral: statusGeral, obs_almox: obs }, user: currentUser });
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Almoxarifado',
      evento: `Kiting: ${statusAlmox}${obs ? ' — '+obs : ''}`,
      status_anterior: opl.status_geral, status_novo: statusGeral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    if (erroLog) mostrarAviso(`A OP ${opl.opl} foi atualizada, mas o histórico de movimentação não foi gravado: ${erroLog.message}`, 'atencao');
    return true;
  };

  // ── Embalagem (Fase 2) ─────────────────────────────────────────────────────
  // Só para OP de fluxo "envio": não vai pra Produção, vai ser embalada e
  // enviada. Aqui o Almoxarifado fecha a caixa (peso/medidas/volumes) e isso
  // CRIA a solicitação de frete em pcp_fretes — que é o que faltava pro módulo
  // de Fretes (existe desde ago/2026 e estava com 0 linhas) ser alimentado.
  const [modalEmbalagem, setModalEmbalagem] = useState<any|null>(null);
  const [embForm, setEmbForm] = useState<any>({});
  const [salvandoEmb, setSalvandoEmb] = useState(false);
  // CEP da embalagem (Etapa 7.13, pedido do usuário em 01/10/2026): o que a conferência do CEP respondeu, e um contador para
  // descartar a resposta de uma consulta antiga quando a pessoa já digitou outro CEP
  const [cepInfo, setCepInfo] = useState<{ estado: string; texto: string }>({ estado: 'ocioso', texto: '' });
  const cepSeq = useRef(0);

  // Venda para Envio: seriais ACN produto a produto, linha a linha (decidido
  // com o usuário em 13/09). Não conclui sem pelo menos um serial por unidade
  // vendida. Guardado em oples.seriais_itens e repetido em texto em
  // seriais_equipamentos (e-mail ao Fiscal e telas antigas leem esse).
  const ehVendaEnvioOp = (o) => o?.tipo_projeto === TIPO_VENDA_ENVIO;
  // "Venda para Envio" vale como envio mesmo sem o campo Fluxo de Entrega preenchido
  const ehEnvio = (o) => soEnvio(fluxoEfetivo(o?.tipo_projeto, o?.fluxo_entrega));
  const linhasSeriaisIniciais = (o) => {
    if (Array.isArray(o?.seriais_itens) && o.seriais_itens.length) return o.seriais_itens.map(x => ({ produto: x.produto || '', serial: x.serial || '' }));
    return Array.from({ length: Math.max(1, Number(o?.quantidade) || 1) }, () => ({ produto: '', serial: '' }));
  };
  const setLinhaSerial = (i, k, v) => setEmbForm(f => ({ ...f, itens: f.itens.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  // Colar do Excel: cada linha "produto<TAB>serial" (ou só o serial) preenche a partir da linha clicada
  const colarSeriais = (i, e) => {
    const txt = e.clipboardData?.getData('text') || '';
    if (!txt.includes('\n') && !txt.includes('\t')) return;   // colagem simples: deixa o input tratar
    e.preventDefault();
    const linhas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const c = l.split('\t');
      return c.length > 1 ? { produto: c[0].trim(), serial: c.slice(1).join(' ').trim() } : { produto: '', serial: c[0].trim() };
    });
    setEmbForm(f => {
      const itens = [...f.itens];
      linhas.forEach((l, k) => {
        const alvo = i + k;
        const atual = itens[alvo] || { produto: '', serial: '' };
        itens[alvo] = { produto: l.produto || atual.produto, serial: l.serial };
      });
      return { ...f, itens };
    });
  };

  // O CEP manda na cidade e na UF (pedido do usuário em 01/10/2026, Etapa 7.13): ao digitar — ou ao abrir a janela com um CEP de formato
  // válido que veio da OP — consulta e preenche. A pessoa ainda pode corrigir à mão depois; o que o sistema não deixa mais é embalar sem
  // um CEP válido (4 das 5 solicitações de frete reais tinham CEP de zeros e cidade "NAI SEI" / "NAO TEM").
  const aplicarCep = async (valor, cidadeAntes, ufAntes, aoAbrir = false) => {
    const seq = ++cepSeq.current;
    const d = soDigitosCep(valor);
    if (!d) { setCepInfo({ estado: 'ocioso', texto: '' }); return; }
    if (!cepComFormatoValido(valor)) {
      // enquanto digita (menos de 8 dígitos) fica quieto; reclama quando já são 8 dígitos ou quando a OP já veio com um CEP assim
      setCepInfo(d.length === 8 || aoAbrir
        ? { estado: 'invalido', texto: 'CEP inválido — informe os 8 dígitos do CEP de entrega (não vale só zeros).' }
        : { estado: 'ocioso', texto: '' });
      return;
    }
    setCepInfo({ estado: 'buscando', texto: 'Consultando o CEP…' });
    const r = await consultarCep(valor);
    if (seq !== cepSeq.current) return;   // a pessoa já digitou outro CEP
    if (r.status === 'ok') {
      const tinhaAlgo = !!(String(cidadeAntes || '').trim() || ufAntes);
      const mudou = tinhaAlgo && (normalizarBusca(cidadeAntes) !== normalizarBusca(r.cidade) || String(ufAntes || '') !== r.uf);
      setEmbForm(f => ({ ...f, destino_cidade: r.cidade, destino_uf: r.uf }));
      const rua = [r.logradouro, r.bairro].filter(Boolean).join(', ');
      setCepInfo({ estado: 'ok', texto: `CEP encontrado — cidade e UF preenchidas: ${r.cidade} / ${r.uf}` + (rua ? ` (${rua})` : '') + (mudou ? ` · antes: ${[cidadeAntes, ufAntes].filter(Boolean).join(' / ')}` : '') });
    } else if (r.status === 'inexistente') {
      setCepInfo({ estado: 'inexistente', texto: 'CEP não encontrado — confira os números.' });
    } else {
      setCepInfo({ estado: 'indisponivel', texto: 'Não consegui consultar o CEP agora. Digite a cidade e a UF; o CEP segue válido pelo formato.' });
    }
  };

  const abrirModalEmbalagem = async (opl) => {
    // se o kit já foi conferido (kiting em lote), não pede de novo
    const linhas = opl.kit_conferencia ? [] : conferenciaInicial(opl);
    setConferencia(linhas);
    setSaldosKit({});
    if (linhas.length) saldosDoKit({ opl, linhas }).then(setSaldosKit);
    setEmbForm({
      itens: linhasSeriaisIniciais(opl),
      seriais: opl.seriais_equipamentos || '',
      peso_total: '', volumes: '1',
      altura: '', largura: '', comprimento: '',
      destino_cidade: opl.destino_cidade || '',
      destino_uf: opl.destino_uf || '',
      destino_cep: formatarCep(opl.destino_cep),
      // CIF/FOB decide se esta OP abre cotação de frete ou vai direto para o
      // Comercial. Quando a OP chega aqui sem resposta, é aqui que ela é dada
      // — antes seguia calada como CIF (regra do usuário em 24/09/2026).
      frete_responsavel: opl.frete_responsavel || '',
      observacoes: '',
    });
    setModalEmbalagem(opl);
    aplicarCep(opl.destino_cep, opl.destino_cidade, opl.destino_uf, true);
  };

  const confirmarEmbalagem = async () => {
    const f = embForm;
    const vendaEnvio = ehVendaEnvioOp(modalEmbalagem);
    const itensSeriais = vendaEnvio
      ? (f.itens || []).map(x => ({ produto: String(x.produto || '').trim(), serial: String(x.serial || '').trim() })).filter(x => x.serial)
      : [];
    if (vendaEnvio) {
      const qtdVendida = Math.max(1, Number(modalEmbalagem.quantidade) || 1);
      if (itensSeriais.some(x => !x.produto)) { alert('Informe o produto de cada serial.'); return; }
      if (itensSeriais.length < qtdVendida) {
        alert(`Informe o serial ACN de cada produto: são ${qtdVendida} unidade(s) vendida(s) e há ${itensSeriais.length} serial(is).`);
        return;
      }
    } else if (!f.seriais?.trim())  { alert('Informe os números de série dos equipamentos.'); return; }
    if (!f.peso_total)       { alert('Informe o peso da embalagem.'); return; }
    const erroConf = validarConferencia(conferencia);
    // texto montado na hora, sempre uma pendência de preenchimento: tom explícito (29/09/2026)
    if (erroConf) { mostrarAviso(erroConf, 'atencao'); return; }
    // CEP obrigatório e válido (pedido do usuário em 01/10/2026, Etapa 7.13). Texto montado aqui = pendência de preenchimento: tom explícito.
    if (!soDigitosCep(f.destino_cep)) {
      mostrarAviso('Informe o CEP de entrega. É por ele que a cidade e a UF são preenchidas e que a Logística cota o frete.', 'atencao'); return;
    }
    if (!cepComFormatoValido(f.destino_cep)) {
      mostrarAviso('CEP inválido: informe os 8 dígitos do CEP de entrega (não vale só zeros).', 'atencao'); return;
    }
    setSalvandoEmb(true);
    const cepConferido = await consultarCep(f.destino_cep);
    setSalvandoEmb(false);
    if (cepConferido.status === 'inexistente') {
      mostrarAviso('CEP não encontrado: confira os números do CEP de entrega.', 'atencao'); return;
    }
    // serviço de terceiro fora do ar não pode parar a embalagem: segue com o CEP de formato válido e deixa dito
    if (cepConferido.status === 'indisponivel') {
      mostrarAviso('Não consegui conferir o CEP agora; segui com o CEP informado. Confira a cidade e a UF.', 'atencao');
    }
    if (!f.destino_cidade?.trim() || !f.destino_uf) {
      alert('Informe a cidade e a UF de entrega.'); return;
    }
    // Sem CIF/FOB não dá para saber se a Logística precisa cotar. Em vez de
    // seguir como CIF calada (como era até 24/09/2026), a resposta é pedida
    // aqui, e fica gravada na OP.
    if (!f.frete_responsavel) {
      alert('Informe quem paga o frete desta OP: CIF (a empresa) ou FOB (o cliente).\n\nÉ isso que decide se a Logística vai cotar o frete ou se a OP segue direto para a liberação comercial.');
      return;
    }
    // Fluxo de envio: aqui a mercadoria sai da empresa. Se ainda há peça de
    // fabricação ou compra em aberto, o risco é enviar incompleto — então
    // avisa e pede confirmação (bloquear de vez pararia envio parcial, que é
    // legítimo; o Kit 100% do kiting esse sim fica barrado).
    const faltaEnvio = faltandoPara(modalEmbalagem);
    if (faltaEnvio.length && !await confirmar(
      `Esta OP tem ${faltaEnvio.length} item(ns) de fabricação/compra em aberto:

${textoFaltando(faltaEnvio)}

Embalar e enviar assim mesmo?`)) return;
    setSalvandoEmb(true);
    const opl = modalEmbalagem;
    const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
    // FOB = o cliente paga o frete: não há o que a Logística cotar, então a OP
    // pula direto pra liberação comercial (regra pedida pelo usuário em
    // 24/09/2026 — ver a pergunta CIF/FOB na criação da OP, NovaOpOsModal.tsx).
    // Vale o que está na tela: a OP pode ter chegado aqui sem resposta, ou o
    // Almoxarifado pode estar corrigindo o que o Comercial respondeu.
    const freteComCliente = f.frete_responsavel === 'FOB';

    // 1) a OP sai do caminho da produção — pra cotação de frete (CIF) ou já
    //    pra liberação comercial (FOB, sem cotação)
    const difEmb = divergencias(conferencia).length ? 'Diferença com a BOM — ' + resumoDivergencias(conferencia) : '';
    // OP de envio direto não passa pelo kiting: a conferência dela acontece
    // aqui, então é aqui que o material dá baixa. Quem já foi conferido no
    // kiting chega com `conferencia` vazia e não movimenta nada de novo.
    const baixaEmb = conferencia.length
      ? await baixarKitDaOp({ opl, linhas: conferencia, currentUser })
      : null;
    const gravouOp = await setAlmox(opl, 'Kit OK', freteComCliente ? STATUS_AGUARDANDO_LIBERACAO_COMERCIAL : 'Aguardando Cotacao Frete',
      [f.observacoes, difEmb, textoDaBaixa(baixaEmb)].filter(Boolean).join(' · '), {
      ...(conferencia.length ? { kit_conferencia: registroConferencia(conferencia, currentUser) } : {}),
      seriais_equipamentos: vendaEnvio ? itensSeriais.map(x => `${x.produto}: ${x.serial}`).join('\n') : f.seriais.trim(),
      ...(vendaEnvio ? { seriais_itens: itensSeriais } : {}),
      destino_cidade: f.destino_cidade.trim(),
      destino_uf: f.destino_uf,
      destino_cep: formatarCep(f.destino_cep),
      // a resposta dada (ou corrigida) aqui fica na OP: da próxima vez que
      // alguém abrir esta OP, o selo mostra quem paga o frete
      frete_responsavel: f.frete_responsavel,
    });
    // 7.50: sem a OP atualizada não abre frete, não avisa ninguém e a janela fica aberta para tentar de novo
    if (!gravouOp) { setSalvandoEmb(false); return; }

    // 2) nasce a solicitação de frete (status default 'Cotação') pra Logística
    //    — só quando é a empresa quem paga (CIF)
    const { error } = freteComCliente ? { error: null } : await supabase.from('pcp_fretes').insert([{
      direcao: 'outbound',
      descricao: `OP ${opl.opl} — ${opl.cliente_nome || ''} (${fluxoLabel(opl.fluxo_entrega)})`.trim(),
      destino: [f.destino_cidade.trim(), f.destino_uf].filter(Boolean).join(' / '),
      cep_destino: formatarCep(f.destino_cep),
      data_prevista: opl.data_prevista_entrega || null,
      quantidade_volumes: f.volumes === '' ? null : parseInt(f.volumes, 10),
      peso_total:         num(f.peso_total),
      medida_altura:      num(f.altura),
      medida_largura:     num(f.largura),
      medida_comprimento: num(f.comprimento),
      // 'op_os' (não 'opl') é o valor que o resto do sistema espera pra "isto
      // pertence a uma OP" — é o que o formulário manual de frete usa
      // (LogisticaTab.tsx) e o único que postarAndamentoVinculo reconhece pra
      // avisar a OP quando o frete é entregue. Bug achado em 29/09/2026 na
      // varredura de UX: com 'opl' aqui, a entrega do frete não acontecia
      // pra ninguém — nem o recado no acompanhamento, nem o avanço de status.
      vinculo_tipo: 'op_os', vinculo_id: opl.id, vinculo_desc: `OP ${opl.opl}`,
      observacoes: f.observacoes || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]);
    // 3) quem vendeu precisa poder responder ao cliente sem perguntar a
    //    ninguém: "embalado, foi para cotação de frete" é exatamente o
    //    recado que falta hoje. Registra no acompanhamento e notifica.
    const recado = freteComCliente
      ? `Embalado: ${f.volumes || 1} volume(s), ${f.peso_total} kg, destino ${[f.destino_cidade, f.destino_uf].filter(Boolean).join('/')}. Frete por conta do cliente (FOB) — liberado direto para o Comercial.`
      : `Embalado: ${f.volumes || 1} volume(s), ${f.peso_total} kg, destino ${[f.destino_cidade, f.destino_uf].filter(Boolean).join('/')}. Solicitação de frete aberta para a Logística cotar.`;
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: opl.opl, referencia_tipo: 'op', referencia_desc: `OP ${opl.opl}`,
      setor: 'Almoxarifado', texto: recado,
      usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema',
      criado_em: new Date().toISOString(),
    });
    await notificarEnvolvidosOp({
      ref: opl.opl, texto: recado, assunto: 'Embalagem e frete',
      autorId: currentUser?.id ? String(currentUser.id) : null,
      autorNome: currentUser?.nome || null,
    });

    setSalvandoEmb(false);
    if (error) { alert('OP finalizada, mas houve erro ao abrir a solicitação de frete: ' + error.message); }
    else if (freteComCliente) { alert(`Embalagem registrada. Frete por conta do cliente — OP ${opl.opl} liberada direto para o Comercial.`); }
    else { alert(`Embalagem registrada. Solicitação de frete aberta para a Logística cotar (OP ${opl.opl}).`); }
    setModalEmbalagem(null);
    fetchAll();
  };

  const abrirModalSeriais = async (opl, pendenciaSanada=false) => {
    const linhas = conferenciaInicial(opl);
    setConferencia(linhas);
    setSaldosKit({});
    setSeriaisKitForm(opl.seriais_equipamentos || '');
    setModalSeriais({ ...opl, _pendenciaSanada: pendenciaSanada });
    setSaldosKit(await saldosDoKit({ opl, linhas }));
  };

  const confirmarKitOkComSeriais = async () => {
    if (!seriaisKitForm.trim()) { alert('Informe os números de série dos equipamentos deste kit.'); return; }
    // Kit 100% quer dizer "está tudo aqui". Com peça de Serralheria/Chicotes ou
    // compra ainda em aberto (ou já pronta mas não recebida), o caminho é
    // LIBERAR C/ PENDÊNCIA — que continua do lado, funcionando como sempre.
    const falta = faltandoPara(modalSeriais);
    if (falta.length) {
      alert(`Não dá para fechar o Kit 100%: ${falta.length} item(ns) de fabricação/compra ainda não chegaram.\n\n${textoFaltando(falta)}\n\nUse LIBERAR C/ PENDÊNCIA e confirme o recebimento no checklist quando o material chegar.`);
      return;
    }
    const erroConf = validarConferencia(conferencia);
    if (erroConf) { mostrarAviso(erroConf, 'atencao'); return; }

    // Item sob controle sem saldo não fecha Kit 100% — mesma regra que já vale
    // para peça de fabricação/compra que não chegou. A saída continua sendo
    // LIBERAR C/ PENDÊNCIA, que a fábrica já conhece (decidido em 24/09/2026).
    // Item sem controle não entra nesta conta.
    const semSaldo = await faltaDeEstoqueNoKit({ opl: modalSeriais, linhas: conferencia });
    if (semSaldo.length) {
      alert(`Não dá para fechar o Kit 100%: ${semSaldo.length} item(ns) sob controle sem saldo no estoque.\n\n${textoFaltaEstoque(semSaldo)}\n\nConfira a prateleira — se o material estiver lá, faça uma contagem no painel de estoque. Se não estiver, use LIBERAR C/ PENDÊNCIA.`);
      return;
    }

    // Tem saldo para esta OP, mas levar o material deixa outra OP já liberada a
    // descoberto. Não trava — quem chega primeiro leva —, só conta a verdade
    // para o Almoxarifado decidir com a informação na mão.
    const roubandoDeOutra = await reservaDeOutrasNoKit({ opl: modalSeriais, linhas: conferencia });
    if (roubandoDeOutra.length) {
      const segue = await confirmar(
        `Atenção: este kit usa material que outra OP já tinha reservado.\n\n${textoReservaDeOutras(roubandoDeOutra)}\n\n`
        + `Pode seguir — a outra OP vira falta e entra na fila de compra ou fabricação. Fechar o kit assim mesmo?`);
      if (!segue) return;
    }

    const extra: any = { seriais_equipamentos: seriaisKitForm.trim() };
    if (conferencia.length) extra.kit_conferencia = registroConferencia(conferencia, currentUser);

    // O material sai da prateleira aqui, tanto no Kit OK quanto no liberado com
    // pendência — nos dois casos o que foi separado já saiu. Só item com
    // controle de estoque movimenta; o resto passa batido (ver Estoque.tsx).
    // A baixa é da diferença, então conferir de novo (pendência sanada) não
    // conta o material duas vezes.
    const baixa = await baixarKitDaOp({ opl: modalSeriais, linhas: conferencia, currentUser });
    const recado = textoDaBaixa(baixa);

    if (divergencias(conferencia).length) {
      // separado diferente da BOM: o kit segue, mas com pendência visível para PCP e Engenharia
      const texto = 'Diferença com a BOM — ' + resumoDivergencias(conferencia);
      if (!await setAlmox(modalSeriais, 'Liberado com Pendencia', 'Aguardando Almox',
        [texto, recado].filter(Boolean).join(' · '), extra)) return;
      notificarEvento('kit_pendencia', msg.kitPendencia(modalSeriais.opl, texto, currentUser?.nome));
      if (baixa.negativos.length) {
        alert(`Kit liberado com pendência, mas o estoque ficou negativo em:\n${baixa.negativos.map(n => `• ${n.nome} (saldo ${n.saldo})`).join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.`);
      }
      setModalSeriais(null); setSeriaisKitForm('');
      fetchAll();
      return;
    }
    const obs = [modalSeriais._pendenciaSanada ? 'Pendencia sanada' : '', recado].filter(Boolean).join(' · ');
    if (!await setAlmox(modalSeriais, 'Kit OK', 'Kit OK - Aguardando PCP', obs, extra)) return;
    notificarEvento('kit_ok', msg.kitOk(modalSeriais.opl, currentUser?.nome));
    if (baixa.negativos.length) {
      alert(`Kit confirmado, mas o estoque ficou negativo em:\n${baixa.negativos.map(n => `• ${n.nome} (saldo ${n.saldo})`).join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.`);
    }
    setModalSeriais(null); setSeriaisKitForm('');
    fetchAll();
  };

  /**
   * Salva a separação pela metade (Etapa 8 — 28/09/2026).
   *
   * O Almoxarifado separa o que tem hoje, salva, e continua amanhã de onde
   * parou. O que foi marcado sai da prateleira agora — e a reserva é consumida
   * só na medida do que saiu, senão o disponível mentiria para mais.
   *
   * A OP não muda de status: continua esperando o kit fechar. Por isso aqui
   * não se cobra observação de diferença — item ainda não separado não é
   * divergência, é trabalho pela metade. A cobrança fica no fechamento.
   */
  const salvarSeparacaoParcial = async () => {
    const opl = modalSeriais;
    if (!conferencia.some(l => Number(l.separado) > 0)) {
      alert('Marque ao menos um item para salvar a separação.'); return;
    }
    setSalvandoSeparacao(true);
    try {
      const baixa = await baixarKitDaOp({ opl, linhas: conferencia, currentUser });
      const recado = textoDaBaixa(baixa);
      const prontas = conferencia.filter(l => Number(l.separado) >= Number(l.planejado)).length;
      const { error: erroSep } = await supabase.from('oples').update({
        kit_conferencia: registroConferencia(conferencia, currentUser),
        responsavel_almox: currentUser?.nome,
      }).eq('id', opl.id);
      // 7.50: o estoque já baixou; se a conferência não gravou, a pessoa precisa saber para salvar de novo (não baixa duas vezes)
      if (erroSep) { alert(`O material já deu baixa no estoque, mas a separação não foi gravada na OP: ${erroSep.message}\n\nClique em SALVAR SEPARAÇÃO de novo (o estoque não baixa duas vezes).`); return; }
      const { error: erroLogSep } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Almoxarifado',
        evento: `Separação salva: ${prontas} de ${conferencia.length} item(ns)${recado ? ' — ' + recado : ''}`,
        status_anterior: opl.status_geral, status_novo: opl.status_geral,
        usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
      }]);
      if (erroLogSep) mostrarAviso(`Separação salva, mas o histórico de movimentação não foi gravado: ${erroLogSep.message}`, 'atencao');
      if (baixa.negativos.length) {
        alert(`Separação salva, mas o estoque ficou negativo em:\n${baixa.negativos.map(n => `• ${n.nome} (saldo ${n.saldo})`).join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.`);
      } else {
        alert(`Separação salva: ${prontas} de ${conferencia.length} item(ns).${recado ? '\n\n' + recado : ''}\n\nA OP continua no Almoxarifado, esperando o resto.`);
      }
      setModalSeriais(null); setSeriaisKitForm('');
      fetchAll();
    } finally { setSalvandoSeparacao(false); }
  };

  const faltaMaterial = async () => {
    if (!await setAlmox(modalFalta, 'Falta de Material', 'Aguardando Almox', obsFalta)) return;
    notificarEvento('kit_falta_material', msg.kitFaltaMaterial(modalFalta.opl, obsFalta, currentUser?.nome));
    setModalFalta(null); setObsFalta(''); fetchAll();
  };

  const liberarPendencia = async () => {
    if (!await setAlmox(modalPend, 'Liberado com Pendencia', 'Aguardando Almox', obsPend)) return;
    notificarEvento('kit_pendencia', msg.kitPendencia(modalPend.opl, obsPend, currentUser?.nome));
    setModalPend(null); setObsPend(''); fetchAll();
  };

  // Pendencia sanada tambem libera o kit — passa pelo mesmo modal de seriais.
  const sanarPendencia = (opl) => abrirModalSeriais(opl, true);

  // Numero base de uma OP desmembrada: "A1419.2607/02" -> "A1419.2607".
  const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
  const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

  const kitOkLote = async (grupo) => {
    const comFalta = grupo.irmaos.filter(o => faltandoPara(o).length);
    if (comFalta.length) {
      alert(`Não dá para fechar o Kit 100% em lote: ${comFalta.length} unidade(s) ainda esperam material de fabricação/compra (${comFalta.map(o => o.opl).join(', ')}).\n\nUse C/ PENDÊNCIA EM LOTE.`);
      return;
    }
    const pendentes = grupo.irmaos.filter(o => o.status_almox !== 'Kit OK');
    if (pendentes.length === 0) { alert('Todas as unidades deste lote ja estao com kit 100%.'); return; }
    setSeriaisLoteTexto('');
    setModalSeriaisLote({ base: grupo.base, irmaos: pendentes });
  };

  // Cada linha colada (Ctrl+C na planilha, Ctrl+V aqui) = uma unidade, na
  // ordem /01../NN das que ainda não têm kit — como cada unidade leva
  // equipamento(s)/serial(is) diferentes, não dá pra casar por chassi/placa
  // como no import de técnicos; a ordem da lista é o identificador.
  const aplicarSeriaisLote = async () => {
    const linhas = seriaisLoteTexto.split('\n').map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) return;
    const { irmaos } = modalSeriaisLote;
    setAplicandoSeriaisLote(true);
    try {
      const avisos = [];
      // 7.50: se uma OP não grava, o lote PARA ali (as seguintes não são tentadas) e o aviso diz até onde foi
      let aplicadas = 0, parouEm = null;
      for (let i = 0; i < linhas.length && i < irmaos.length; i++) {
        const baixa = await baixarNoLote(irmaos[i]);
        if (baixa?.negativos?.length) avisos.push(`${irmaos[i].opl}: ${baixa.negativos.map(n => n.nome).join(', ')}`);
        const gravou = await setAlmox(irmaos[i], 'Kit OK', 'Kit OK - Aguardando PCP', textoDaBaixa(baixa),
          { seriais_equipamentos: linhas[i], ...conferenciaLote(irmaos[i]) });
        if (!gravou) { parouEm = irmaos[i].opl; break; }
        aplicadas++;
      }
      if (avisos.length) {
        alert(`Kit fechado em lote, mas o estoque ficou negativo em:\n${avisos.join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.`);
      }
      if (parouEm) alert(`O lote parou na OP ${parouEm}: ${aplicadas} unidade(s) fecharam o kit e as demais continuam como estavam. Confira a lista e repita para as que faltam.`);
      if (aplicadas > 0) notificarEvento('kit_ok', msg.kitOk(modalSeriaisLote.base, currentUser?.nome) + ` (${aplicadas} unidades em lote)`);
    } finally {
      setAplicandoSeriaisLote(false);
      setModalSeriaisLote(null); setSeriaisLoteTexto('');
      fetchAll();
    }
  };

  // Kit 100% do lote de Venda para Envio: seriais produto a produto (mesmo formato da
  // embalagem) e a OP segue direto para a embalagem, como no EMBALAR E ENVIAR unitário.
  const aplicarKitEnvioLote = async (porOp) => {
    const { base, ops } = modalKitEnvioLote;
    setProcessandoLote(true);
    try {
      let aplicadas = 0, parouEm = null;
      for (const o of ops) {
        const itens = porOp[String(o.id)] || [];
        const baixa = await baixarNoLote(o);
        const gravou = await setAlmox(o, 'Kit OK', STATUS_EMBALAGEM,
          [`Kit 100% em lote (${ops.length} unidades de ${base})`, textoDaBaixa(baixa)].filter(Boolean).join(' · '), {
          seriais_itens: itens,
          seriais_equipamentos: itens.map(x => `${x.produto}: ${x.serial}`).join('\n'),
          ...conferenciaLote(o),
        });
        if (!gravou) { parouEm = o.opl; break; }   // 7.50: para na primeira que não grava
        aplicadas++;
      }
      if (parouEm) alert(`O lote parou na OP ${parouEm}: ${aplicadas} unidade(s) fecharam o kit e as demais continuam como estavam. Confira a lista e repita para as que faltam.`);
      if (aplicadas > 0) notificarEvento('kit_ok', msg.kitOk(base, currentUser?.nome) + ` (${aplicadas} unidades em lote — seguem para embalagem)`);
    } finally {
      setProcessandoLote(false);
      setModalKitEnvioLote(null);
      fetchAll();
    }
  };

  const abrirLoteAcao = (tipo, grupo) => {
    setObsLoteAcao('');
    setModalLoteAcao({ tipo, base: grupo.base, irmaos: grupo.irmaos });
  };

  const confirmarLoteAcao = async () => {
    if (!obsLoteAcao.trim()) { alert('Descreva o material/pendencia.'); return; }
    const { tipo, base, irmaos } = modalLoteAcao;
    const alvo = irmaos.filter(o => tipo === 'falta' ? o.status_almox !== 'Falta de Material' : o.status_almox !== 'Liberado com Pendencia');
    if (alvo.length === 0) { alert('Nenhuma unidade deste lote se aplica.'); return; }
    setProcessandoLote(true);
    try {
      let aplicadas = 0, parouEm = null;
      for (const opl of alvo) {
        const gravou = await setAlmox(opl, tipo === 'falta' ? 'Falta de Material' : 'Liberado com Pendencia', 'Aguardando Almox', obsLoteAcao);
        if (!gravou) { parouEm = opl.opl; break; }   // 7.50
        aplicadas++;
      }
      if (parouEm) alert(`O lote parou na OP ${parouEm}: ${aplicadas} unidade(s) foram marcadas e as demais continuam como estavam. Confira a lista e repita para as que faltam.`);
      const evento = tipo === 'falta' ? 'kit_falta_material' : 'kit_pendencia';
      const msgFn = tipo === 'falta' ? msg.kitFaltaMaterial : msg.kitPendencia;
      if (aplicadas > 0) notificarEvento(evento, msgFn(base, obsLoteAcao, currentUser?.nome) + ` (${aplicadas} unidades em lote)`);
    } finally {
      setProcessandoLote(false);
      setModalLoteAcao(null); setObsLoteAcao('');
      fetchAll();
    }
  };

  // Data de entrada da OP é coluna do tipo date: o dia vem do texto (R16, 05/10/2026). Antes era `new Date(d)`, que mostrava o dia anterior (0 de 4 batiam com o banco).
  const fmtDt = (d) => diaBR(d);

  // Etapa 12e12 (06/10/2026): a tela inteira no molde do guia (tabela, selos, botões, janelas). Nenhum campo, texto, consulta,
  // gravação ou regra foi mexido: só a aparência. A cor de cada situação vem da família do guia, não de hex escrito à mão.
  const FAMILIA_STATUS_KIT = { 'Kit OK': 'ok', 'Falta de Material': 'erro', 'Liberado com Pendencia': 'atencao' };
  const ROTULO_STATUS_KIT = { 'Kit OK': 'Kit 100%', 'Falta de Material': 'Falta Mat.', 'Liberado com Pendencia': 'Com Pendencia' };

  return (
    <div>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchAll()}>Tentar de novo</Botao>}>
          Não foi possível ler as OPs do Almoxarifado ({erroLeitura}). Isso não quer dizer que não haja OP aguardando{opls.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}
      {oplsPendenciaAlmox.length > 0 && (
        <div className="sec-card">
          {/* o ▾/▸ e o mostra/esconde do corpo são só do collapse global (clique em
              qualquer .sec-hdr, ver DashboardTab.tsx) — um estado próprio aqui
              brigava com ele e o painel nunca aparecia, mesmo com dado carregado
              (achado em 23/09/2026, o mesmo bug do painel de pendências do PCP). */}
          <div className="sec-hdr acn-alm-hdr-atencao">
            <span className="acn-alm-titulo"><Icone path={mdiToolboxOutline} size={16} /> Material de pendência aguardando recebimento ({oplsPendenciaAlmox.length})</span>
          </div>
          <div className="sec-body">
              <div className="acn-ajuda acn-alm-espaco">
                O setor concluiu o item — falta só confirmar aqui que o material chegou.
                Vale para OP que já está em produção (liberada com pendência) e também para a que
                ainda está na fila de kiting acima: sem esta confirmação, o Kit 100% não fecha.
              </div>
              {oplsPendenciaAlmox.map(o => (
                <div key={o.id} className="acn-alm-pend">
                  <div className="acn-alm-pend-titulo">
                    <LinkOpl opl={o} currentUser={currentUser} />
                    <span className="acn-ajuda">{o.cliente_nome || '—'} · {o.status_geral}</span>
                  </div>
                  <ChecklistPendencias op={o} vinculos={(pendPorOp.get(String(o.id)) || []).map(p => ({ ...p, grupo: 'demanda' }))}
                    modo="almox" currentUser={currentUser} compacto
                    onMudou={() => fetchAll(true)} />
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr"><span>Kiting — OPs Aguardando Conferencia ({filtrarOpls(opls, busca).length})</span></div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OP aguardando Almoxarifado.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data</th><th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>BOM</th>
                <th>Status Kit</th><th>Obs. Almox</th><th>Responsavel</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {(() => {
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

                  const renderLinhaOpl = (o) => (
                    <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td>
                        <LinkOpl opl={o} currentUser={currentUser} />
                        {/* Sem isto a linha fica idêntica a uma de kiting — e
                            o "Status Kit" dela já é Kit 100% da primeira
                            passagem, o que faria parecer que não há o que fazer. */}
                        {o.status_geral === STATUS_EMBALAGEM && (
                          <div className="acn-alm-embalar"><Selo familia="info" ponto={false}>
                            <Icone path={mdiPackageVariantClosed} size={13} /> {ehEnvio(o) ? 'EMBALAR — NÃO PASSA POR PRODUÇÃO' : 'EMBALAR — PRODUÇÃO CONCLUÍDA'}
                          </Selo></div>
                        )}
                      </td>
                      <td className="acn-alm-veic">
                        <VeiculoOuEnvio o={o} />
                      </td>
                      <td><span className={(o.quantidade||1)>1 ? 'acn-txt-info' : 'acn-ajuda'}>{o.quantidade||1}</span></td>
                      <td className="acn-texto-medio">{o.tipo_projeto}</td>
                      <td>
                        {o.status_bom === 'BOM Liberado'
                          ? <Selo familia="ok" ponto={false}>BOM OK</Selo>
                          : <Selo familia="atencao" ponto={false}>Aguard. BOM</Selo>}
                      </td>
                      <td>
                        {!o.status_almox && <Selo familia="neutro" ponto={false}>Pendente</Selo>}
                        {FAMILIA_STATUS_KIT[o.status_almox] && <Selo familia={FAMILIA_STATUS_KIT[o.status_almox]} ponto={false}>{ROTULO_STATUS_KIT[o.status_almox]}</Selo>}
                      </td>
                      <td className="acn-texto-medio acn-alm-obs">{o.obs_almox || '—'}</td>
                      <td>{o.responsavel_almox || '—'}</td>
                      <td className="acn-alm-celula-acoes">
                        <div className="acn-acoes-linha quebra">
                          {/* OP que voltou da produção só para embalar não tem
                              kiting nem falta de material: o material já virou
                              produto. A única ação é fechar a caixa — e o
                              status_almox dela já é 'Kit OK' desde a primeira
                              passagem, então essa checagem não serve aqui. */}
                          {o.status_geral === STATUS_EMBALAGEM ? (
                            <Botao variante="primario" pequeno icone={mdiPackageVariantClosed}
                              title="Produção concluída: pesar, medir e abrir a cotação de frete"
                              onClick={()=>abrirModalEmbalagem(o)}>
                              EMBALAR E ENVIAR
                            </Botao>
                          ) : (<>
                          {o.status_almox !== 'Kit OK' && (
                            ehEnvio(o) ? (
                              <Botao variante="primario" pequeno icone={mdiPackageVariantClosed}
                                title="Esta OP não passa por produção: separar, embalar e enviar"
                                onClick={()=>abrirModalEmbalagem(o)}>
                                EMBALAR E ENVIAR
                              </Botao>
                            ) : (
                              (() => {
                                const falta = faltandoPara(o);
                                return (
                                  <Botao variante="primario" pequeno
                                    disabled={!!falta.length}
                                    title={falta.length
                                      ? `Esperando material de fabricação/compra:\n${textoFaltando(falta)}\n\nUse LIBERAR C/ PENDENCIA.`
                                      : 'Fechar o kit: tudo separado e conferido'}
                                    onClick={()=>abrirModalSeriais(o)}>
                                    KITING 100%{falta.length ? ` (${falta.length} p/ chegar)` : ''}
                                  </Botao>
                                );
                              })()
                            )
                          )}
                          <Botao variante="perigo-sec" pequeno onClick={()=>{setModalFalta(o);setObsFalta('');}}>
                            FALTA MATERIAL
                          </Botao>
                          <Botao pequeno onClick={()=>{setModalPend(o);setObsPend('');}}>
                            LIBERAR C/ PENDENCIA
                          </Botao>
                          {o.status_almox === 'Liberado com Pendencia' && (
                            <Botao pequeno onClick={()=>sanarPendencia(o)}>
                              SANAR PENDENCIA
                            </Botao>
                          )}
                          </>)}
                          <Botao variante="perigo-sec" pequeno icone={mdiArrowULeftTop} title="Devolver para refazer o kit ou para a Engenharia reanalisar"
                            onClick={()=>setModalDevolver(o)}>
                            DEVOLVER
                          </Botao>
                          <Botao variante="discreto" pequeno icone={mdiEyeOutline} onClick={()=>setModalVer(o)}>Ver</Botao>
                        </div>
                      </td>
                    </tr>
                  );

                  return itens.map(item => {
                    if (item.tipo === 'single') return renderLinhaOpl(item.row);

                    const { base, irmaos } = item;
                    const expandido = !!lotesExpandidos[base];
                    const rep = irmaos[0];
                    const qtdPendente = irmaos.filter(o => !o.status_almox).length;
                    const qtdKitOk = irmaos.filter(o => o.status_almox === 'Kit OK').length;
                    const qtdFalta = irmaos.filter(o => o.status_almox === 'Falta de Material').length;
                    const qtdComPendencia = irmaos.filter(o => o.status_almox === 'Liberado com Pendencia').length;
                    return (
                      <React.Fragment key={base}>
                        <tr className="acn-linha-marca">
                          <td>{fmtDt(rep.data_entrada)}</td>
                          <td>
                            <strong className="acn-alm-lote"><Icone path={mdiLinkVariant} size={14} /> {base}</strong>
                            <div className="acn-alm-lote-selo">
                              <Selo familia="marca" ponto={false}>
                                LOTE — {irmaos.length} unidades
                              </Selo>
                            </div>
                          </td>
                          <td>—</td>
                          <td><span className="acn-txt-info">{irmaos.length}</span></td>
                          <td className="acn-texto-medio">{rep.tipo_projeto}</td>
                          <td colSpan={2}>
                            <div className="acn-selos">
                              {qtdPendente > 0 && <Selo familia="neutro" ponto={false}>{qtdPendente} pendente</Selo>}
                              {qtdKitOk > 0 && <Selo familia="ok" ponto={false}>{qtdKitOk} kit 100%</Selo>}
                              {qtdFalta > 0 && <Selo familia="erro" ponto={false}>{qtdFalta} falta mat.</Selo>}
                              {qtdComPendencia > 0 && <Selo familia="atencao" ponto={false}>{qtdComPendencia} c/ pendência</Selo>}
                            </div>
                          </td>
                          <td>—</td>
                          {/* 12e12: a linha do lote tinha uma coluna a menos e os botões caíam sob "Responsavel"; esta célula os põe sob "Acoes" */}
                          <td>—</td>
                          <td className="acn-alm-celula-acoes">
                            <div className="acn-acoes-linha quebra">
                              {(qtdPendente + qtdFalta + qtdComPendencia) > 0 && (irmaos.every(ehVendaEnvioOp) ? (
                                <Botao variante="primario" pequeno icone={mdiPackageVariantClosed} disabled={processandoLote}
                                  title="Venda para Envio: seriais de todos os produtos de todas as unidades numa tela só"
                                  onClick={()=>{
                                    const ops = irmaos.filter(o => o.status_geral === 'Aguardando Almox' && o.status_almox !== 'Kit OK');
                                    if (!ops.length) { alert('Nenhuma unidade do lote está aguardando kit.'); return; }
                                    setModalKitEnvioLote({ base, ops });
                                  }}>
                                  KITING 100% EM LOTE ({qtdPendente + qtdFalta + qtdComPendencia})
                                </Botao>
                              ) : (
                                <Botao variante="primario" pequeno icone={mdiTrayArrowDown} disabled={processandoLote} onClick={()=>kitOkLote(item)}>
                                  IMPORTAR SERIAIS EM LOTE ({qtdPendente + qtdFalta + qtdComPendencia})
                                </Botao>
                              ))}
                              <Botao variante="perigo-sec" pequeno icone={mdiCloseCircleOutline} disabled={processandoLote} onClick={()=>abrirLoteAcao('falta', item)}>
                                FALTA MATERIAL EM LOTE
                              </Botao>
                              <Botao pequeno icone={mdiAlertOutline} disabled={processandoLote} onClick={()=>abrirLoteAcao('pendencia', item)}>
                                C/ PENDÊNCIA EM LOTE
                              </Botao>
                              <Botao variante="discreto" pequeno icone={expandido ? mdiChevronUp : mdiChevronDown} onClick={()=>setLotesExpandidos(s=>({...s,[base]:!expandido}))}>
                                {expandido ? 'Ocultar unidades' : `Ver ${irmaos.length} unidades`}
                              </Botao>
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

      {/* FABRICAÇÃO PRONTA — peça feita aqui dentro esperando a conferência que
          faz o saldo subir. Vem antes do painel de estoque de propósito: é fila
          de balcão, tem gente esperando do outro lado. */}
      <PainelFabricacaoRecebimento currentUser={currentUser} onCreditou={() => fetchAll(true)} />

      {/* ESTOQUE SOB CONTROLE — a lista dos itens que já têm saldo contado, o
          mínimo definido e a contagem. Ver Estoque.tsx para a regra do opt-in. */}
      <PainelEstoque currentUser={currentUser} />

      {/* SOLICITAÇÃO DE REPOSIÇÃO DE ESTOQUE — pede fabricação interna (OFI) ao
          setor que fabrica aquele item, ou Compras quando não é fabricação
          interna. Passa por liberação do PCP antes de cair na fila certa. */}
      <div className="sec-card acn-alm-reposicao">
        <div className="sec-hdr">
          <span className="acn-alm-titulo"><Icone path={mdiPackageVariantClosed} size={16} /> Solicitar Reposição de Estoque</span>
          <Botao pequeno onClick={() => setModalReposicao(true)}>
            + Nova Solicitação
          </Botao>
        </div>
        <div className="sec-body acn-alm-solic-corpo">
          {erroSolicitacoes && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={fetchSolicitacoes}>Tentar de novo</Botao>}>
              Não foi possível ler as solicitações ({erroSolicitacoes}).
            </Faixa>
          )}
          {minhasSolicitacoes.length === 0 && !erroSolicitacoes ? (
            <div className="acn-empty">Nenhuma solicitação de reposição ainda.</div>
          ) : (
            minhasSolicitacoes.map((s: any) => (
              <div key={s.id} className="acn-alm-solic">
                <span className="acn-alm-solic-texto">
                  <strong>{s.item_nome}</strong> — {s.quantidade}
                  {s.vinculo_descricao && <span className="acn-sub-info"> · <Icone path={mdiLinkVariant} size={12} /> {s.vinculo_descricao}</span>}
                </span>
                <Selo ponto={false} familia={s.status === 'Aguardando Liberação PCP' ? 'atencao' : s.status.startsWith('Roteado') ? 'ok' : 'erro'}>
                  {s.status}
                </Selo>
              </div>
            ))
          )}
        </div>
      </div>
      {modalReposicao && (
        <ModalSolicitarReposicao currentUser={currentUser}
          onClose={() => setModalReposicao(false)}
          onSaved={() => { setModalReposicao(false); fetchSolicitacoes(); }} />
      )}

      <DemandasSetorWidget setor="Almoxarifado" cor="#78716c" currentUser={currentUser} />
      <DemandaAvulsaPanel currentUser={currentUser} setor="Almoxarifado" />
      <OplMovimentadas setor="Almoxarifado" />
      <DemandaFooter setor="Almoxarifado" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL FALTA */}
      {modalFalta && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-alm-jan" role="dialog" aria-label="Apontar falta de material">
            <div className="acn-modal-cab">
              <span className="modal-title">Apontar Falta de Material — OP {modalFalta.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-falta">Descreva o(s) material(is) em falta *</label>
                <textarea id="alm-falta" className="acn-input" rows={3}
                  placeholder="ex: Cabo de 70mm2 — 5m; Conector X — 2 unidades"
                  value={obsFalta} onChange={e=>setObsFalta(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="perigo" onClick={faltaMaterial}>CONFIRMAR FALTA</Botao>
              <Botao onClick={()=>setModalFalta(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PENDENCIA */}
      {modalPend && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-alm-jan" role="dialog" aria-label="Liberar com pendência">
            <div className="acn-modal-cab">
              <span className="modal-title">Liberar com Pendencia — OP {modalPend.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-pend">Descreva a pendencia existente *</label>
                <textarea id="alm-pend" className="acn-input" rows={3}
                  placeholder="ex: Aguardando apenas parafuso M10, demais itens completos"
                  value={obsPend} onChange={e=>setObsPend(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={liberarPendencia}>LIBERAR COM PENDENCIA</Botao>
              <Botao onClick={()=>setModalPend(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SERIAIS — obrigatorio para confirmar Kiting 100% (ou sanar pendencia) */}
      {/* Modal de embalagem — para OP de fluxo "envio" (que nem passa por
          produção) e para OP que voltou da produção só para ser embalada. */}
      {modalEmbalagem && (
        <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) setModalEmbalagem(null); }}>
          <div className="modal-box acn-modal-cadastro acn-alm-emb" role="dialog" aria-label="Embalar e enviar">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiPackageVariantClosed} size={16} /> Embalar e enviar — OP {modalEmbalagem.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalEmbalagem.cliente_nome} · {fluxoLabel(modalEmbalagem.fluxo_entrega)} ·{' '}
                {modalEmbalagem.status_geral === STATUS_EMBALAGEM ? 'produção concluída' : 'não passa por produção'}
              </div>

              {/* Quem paga o frete decide para onde esta OP vai daqui. Vinha
                  respondido do Comercial, mas nem todo fluxo era perguntado —
                  quando chega em branco, é aqui que se responde (24/09/2026). */}
              <div className={'acn-quadro' + (embForm.frete_responsavel ? '' : ' tom-erro')}>
                <div className="acn-quadro-titulo">
                  <Icone path={mdiTruckOutline} size={14} /> Frete * {!modalEmbalagem.frete_responsavel && (
                    <span className="acn-txt-erro">— esta OP chegou sem resposta, informe agora</span>
                  )}
                </div>
                <Chips ativo={embForm.frete_responsavel || ''} onChange={v => setEmbForm(f => ({ ...f, frete_responsavel: v }))}
                  itens={[
                    { id: 'CIF', rotulo: 'CIF — a empresa paga' },
                    { id: 'FOB', rotulo: 'FOB — o cliente paga' },
                  ]} />
                <div className="acn-ajuda">
                  {embForm.frete_responsavel === 'FOB'
                    ? 'Ao concluir, esta OP vai direto para a liberação comercial — a Logística não coteia nada.'
                    : embForm.frete_responsavel === 'CIF'
                    ? 'Ao concluir, nasce o pedido de frete para a Logística cotar.'
                    : 'Sem essa resposta não dá para saber se a Logística precisa cotar o frete.'}
                </div>
              </div>

              {ehVendaEnvioOp(modalEmbalagem) ? (
                <div className="acn-alm-bloco">
                  <div className="acn-label">
                    Seriais ACN por produto * <span className="acn-ajuda">
                      — pelo menos {Math.max(1, Number(modalEmbalagem.quantidade) || 1)} (uma por unidade vendida). Dá para colar do Excel: produto ⇥ serial.
                    </span>
                  </div>
                  <div className="acn-alm-seriais">
                    {(embForm.itens || []).map((x, i) => (
                      <div key={i} className="acn-alm-serial-linha">
                        <span className="acn-ajuda">{i + 1}</span>
                        <input className="acn-input" placeholder="Produto" value={x.produto}
                          onPaste={e => colarSeriais(i, e)} onChange={e => setLinhaSerial(i, 'produto', e.target.value)} />
                        <input className="acn-input" placeholder="Serial ACN" value={x.serial}
                          onPaste={e => colarSeriais(i, e)} onChange={e => setLinhaSerial(i, 'serial', e.target.value)} />
                        <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover linha" aria-label="Remover linha"
                          onClick={() => setEmbForm(f => ({ ...f, itens: f.itens.length > 1 ? f.itens.filter((_, j) => j !== i) : [{ produto:'', serial:'' }] }))} />
                      </div>
                    ))}
                  </div>
                  <div className="acn-kb-linha">
                    <Botao pequeno onClick={() => setEmbForm(f => ({ ...f, itens: [...(f.itens || []), { produto:'', serial:'' }] }))}>
                      + Linha
                    </Botao>
                    {(() => {
                      const n = (embForm.itens || []).filter(x => String(x.serial || '').trim()).length;
                      const q = Math.max(1, Number(modalEmbalagem.quantidade) || 1);
                      return <span className={n >= q ? 'acn-txt-ok' : 'acn-txt-atencao'}>{n} de {q} serial(is)</span>;
                    })()}
                  </div>
                </div>
              ) : (<>
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-seriais">Números de série *</label>
                <textarea id="alm-seriais" className="acn-input" rows={2}
                  value={embForm.seriais||''} onChange={e=>setEmbForm(f=>({...f, seriais:e.target.value}))}
                  placeholder="Um por linha" />
              </div>
              </>)}

              <div className="acn-quadro-titulo acn-alm-secao">
                {/* o destino depende do CIF/FOB — o texto fixo "vai para a cotação
                    de frete" mentia em OP FOB, que não passa pela Logística */}
                {embForm.frete_responsavel === 'FOB'
                  ? 'Embalagem (segue direto para a liberação comercial)'
                  : embForm.frete_responsavel === 'CIF'
                  ? 'Embalagem (vai para a cotação de frete)'
                  : 'Embalagem'}
              </div>
              <div className="acn-alm-grade5">
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-peso">Peso total (kg) *</label>
                  <input id="alm-peso" className="acn-input" value={embForm.peso_total||''}
                    onChange={e=>setEmbForm(f=>({...f, peso_total:e.target.value}))} placeholder="Ex: 12,5" />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-vol">Volumes</label>
                  <input id="alm-vol" className="acn-input" type="number" min={1} value={embForm.volumes||'1'}
                    onChange={e=>setEmbForm(f=>({...f, volumes:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-alt">Altura (cm)</label>
                  <input id="alm-alt" className="acn-input" value={embForm.altura||''}
                    onChange={e=>setEmbForm(f=>({...f, altura:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-larg">Largura (cm)</label>
                  <input id="alm-larg" className="acn-input" value={embForm.largura||''}
                    onChange={e=>setEmbForm(f=>({...f, largura:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-comp">Comprimento (cm)</label>
                  <input id="alm-comp" className="acn-input" value={embForm.comprimento||''}
                    onChange={e=>setEmbForm(f=>({...f, comprimento:e.target.value}))} />
                </div>
              </div>

              <div className="acn-quadro-titulo acn-alm-secao">
                Destino da entrega
              </div>
              <div className="acn-alm-grade-cep">
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-cep">CEP *</label>
                  <input id="alm-cep" className="acn-input" value={embForm.destino_cep||''} inputMode="numeric" maxLength={9}
                    onChange={e=>{ const v = formatarCep(e.target.value); setEmbForm(f=>({...f, destino_cep:v})); aplicarCep(v, embForm.destino_cidade, embForm.destino_uf); }} placeholder="00000-000" />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-cidade">Cidade *</label>
                  <input id="alm-cidade" className="acn-input" value={embForm.destino_cidade||''}
                    onChange={e=>setEmbForm(f=>({...f, destino_cidade:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-uf">UF *</label>
                  <select id="alm-uf" className="acn-input" value={embForm.destino_uf||''}
                    onChange={e=>setEmbForm(f=>({...f, destino_uf:e.target.value}))}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {cepInfo.texto && (
                  <div className={'acn-alm-cep-info ' + (cepInfo.estado === 'ok' ? 'acn-txt-ok' : cepInfo.estado === 'buscando' ? 'acn-ajuda' : cepInfo.estado === 'indisponivel' ? 'acn-txt-atencao' : 'acn-txt-erro')}>
                    {cepInfo.texto}
                  </div>
                )}
              </div>

              <ConferenciaKit linhas={conferencia} onChange={setConferencia} saldos={saldosKit} />
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-obs">Observações</label>
                <textarea id="alm-obs" className="acn-input" rows={2}
                  value={embForm.observacoes||''} onChange={e=>setEmbForm(f=>({...f, observacoes:e.target.value}))} />
              </div>
            </div>

            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalEmbalagem(null)}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiPackageVariantClosed} disabled={salvandoEmb} onClick={confirmarEmbalagem}>
                {/* o botão dizia sempre "solicitar frete", inclusive em OP FOB,
                    onde nenhum frete é solicitado (24/09/2026) */}
                {salvandoEmb ? 'Salvando...'
                  : embForm.frete_responsavel === 'FOB' ? 'Finalizar e liberar para o Comercial'
                  : 'Finalizar e solicitar frete'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {modalSeriais && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-alm-kiting" role="dialog" aria-label="Kiting">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiNumeric} size={16} /> Kiting — OP {modalSeriais.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Informe o(s) número(s) de série dos equipamentos deste kit antes de liberar para o PCP. O produto já sai do Almoxarifado com o serial aplicado.
              </div>
              <ConferenciaKit linhas={conferencia} onChange={setConferencia} saldos={saldosKit} />
              <ChecklistPendencias op={modalSeriais} vinculos={pendenciasDe(modalSeriais).map(p => ({ ...p, grupo: 'demanda' }))}
                modo="almox" currentUser={currentUser}
                onMudou={(novo) => setModalSeriais(m => ({ ...m, pendencias_kit: novo }))} />
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-seriais-kit">Números de série dos equipamentos instalados *</label>
                <textarea id="alm-seriais-kit" autoFocus className="acn-input acn-alm-mono" rows={3}
                  placeholder="Um por linha ou separados por vírgula. Ex: SN-00123, SN-00124..."
                  value={seriaisKitForm} onChange={e=>setSeriaisKitForm(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={confirmarKitOkComSeriais}>
                {divergencias(conferencia).length ? 'CONFIRMAR KIT COM PENDÊNCIA' : 'CONFIRMAR KITING 100%'}
              </Botao>
              {/* separar o que tem hoje e continuar amanhã: a OP fica onde está */}
              {conferencia.length > 0 && (
                <Botao icone={mdiContentSaveOutline} disabled={salvandoSeparacao}
                  title="Dá baixa no que já foi marcado e guarda o resto para depois. A OP continua no Almoxarifado."
                  onClick={salvarSeparacaoParcial}>
                  {salvandoSeparacao ? 'Salvando...' : 'SALVAR SEPARAÇÃO'}
                </Botao>
              )}
              <Botao onClick={()=>{setModalSeriais(null);setSeriaisKitForm('');}}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR SERIAIS EM LOTE — cada linha colada = uma unidade, na ordem /01..NN */}
      {modalKitEnvioLote && (
        <ModalKitingLoteEnvio base={modalKitEnvioLote.base} ops={modalKitEnvioLote.ops}
          onClose={() => setModalKitEnvioLote(null)} onConfirmar={aplicarKitEnvioLote} />
      )}
      {modalDevolver && (
        <ModalDevolverOp opl={modalDevolver} setorOrigem="Almoxarifado" currentUser={currentUser}
          // refazer o kit só faz sentido se já houve kit; senão, só a Engenharia
          destinos={modalDevolver.status_almox === 'Kit OK' || modalDevolver.status_geral === STATUS_EMBALAGEM || modalDevolver.status_almox ? ['almox', 'engenharia'] : ['engenharia']}
          onClose={() => setModalDevolver(null)} onFeito={() => { setModalDevolver(null); fetchAll(); }} />
      )}

      {modalSeriaisLote && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget && !aplicandoSeriaisLote) setModalSeriaisLote(null);}}>
          <div className="modal-box acn-modal-cadastro acn-alm-lote-jan" role="dialog" aria-label="Importar seriais em lote">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiTrayArrowDown} size={16} /> Importar Seriais em Lote — <Icone path={mdiLinkVariant} size={16} /> {modalSeriaisLote.base}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalSeriaisLote.irmaos.length} unidade(s) sem kit ainda. Cole do Excel (Ctrl+C na planilha, Ctrl+V aqui) —
                cada linha vira o(s) serial(is) de uma unidade, <strong>na ordem abaixo</strong> (não há chassi/placa para
                casar aqui, então a ordem da lista importa). Uma célula pode ter mais de um serial (separados por vírgula).
              </div>
              <div className="acn-alm-lote-tabela">
                <table className="acn-tabela acn-densa">
                  <thead><tr>
                    <th>#</th>
                    <th>OP</th>
                    <th>Serial(is) a aplicar</th>
                  </tr></thead>
                  <tbody>
                    {modalSeriaisLote.irmaos.map((o, i) => {
                      const linha = seriaisLoteTexto.split('\n').map(l=>l.trim()).filter(Boolean)[i];
                      return (
                        <tr key={o.id}>
                          <td className="acn-ajuda">{i+1}</td>
                          <td><strong>{o.opl}</strong></td>
                          <td className={linha ? 'acn-txt-ok' : 'acn-ajuda'}>{linha || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <textarea autoFocus className="acn-input acn-alm-mono" rows={Math.min(8, modalSeriaisLote.irmaos.length)} aria-label="Seriais colados"
                placeholder={'Ex:\nSN-00123\nSN-00124, SN-00125\nSN-00126'}
                value={seriaisLoteTexto} onChange={e=>setSeriaisLoteTexto(e.target.value)} />
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheckCircleOutline}
                onClick={aplicarSeriaisLote} disabled={aplicandoSeriaisLote || !seriaisLoteTexto.trim()}>
                {aplicandoSeriaisLote ? 'Aplicando...' : `Confirmar Kiting 100% (${Math.min(seriaisLoteTexto.split('\n').map(l=>l.trim()).filter(Boolean).length, modalSeriaisLote.irmaos.length)})`}
              </Botao>
              <Botao disabled={aplicandoSeriaisLote} onClick={()=>{setModalSeriaisLote(null);setSeriaisLoteTexto('');}}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FALTA/PENDENCIA EM LOTE — OPs desmembradas (mesmo numero base) */}
      {modalLoteAcao && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-alm-jan" role="dialog" aria-label="Ação em lote">
            <div className="acn-modal-cab">
              <span className="modal-title">
                <Icone path={modalLoteAcao.tipo === 'falta' ? mdiCloseCircleOutline : mdiAlertOutline} size={16} /> {modalLoteAcao.tipo === 'falta' ? 'Falta de Material em Lote' : 'Liberar com Pendência em Lote'} — {modalLoteAcao.base}
              </span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Aplica a mesma descrição a todas as {modalLoteAcao.irmaos.length} unidades deste lote que ainda não estão nesta situação.
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-lote-obs">
                  {modalLoteAcao.tipo === 'falta' ? 'Descreva o(s) material(is) em falta *' : 'Descreva a pendência existente *'}
                </label>
                <textarea id="alm-lote-obs" className="acn-input" rows={3}
                  placeholder={modalLoteAcao.tipo === 'falta' ? 'ex: Cabo de 70mm2 — 5m; Conector X — 2 unidades' : 'ex: Aguardando apenas parafuso M10, demais itens completos'}
                  value={obsLoteAcao} onChange={e=>setObsLoteAcao(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante={modalLoteAcao.tipo === 'falta' ? 'perigo' : 'primario'} onClick={confirmarLoteAcao} disabled={processandoLote}>
                {processandoLote ? 'Aplicando...' : 'CONFIRMAR EM LOTE'}
              </Botao>
              <Botao onClick={()=>setModalLoteAcao(null)} disabled={processandoLote}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SOLICITAR REPOSIÇÃO — item + quantidade + motivo + vínculo opcional.
// Fica "Aguardando Liberação PCP" até alguém do PCP liberar (ver PCPTab.tsx),
// que então roteia pra uma OFI (fabricação interna) ou pra Compras, conforme
// cadastro_itens.origem_producao/setor_fabricante daquele item.
// ─────────────────────────────────────────────────────────────────────────────
function ModalSolicitarReposicao({ currentUser, onClose, onSaved }) {
  const [q, setQ] = useState('');
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [item, setItem] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [vinculo, setVinculo] = useState<VinculoValue | null>(null);
  const [salvando, setSalvando] = useState(false);
  const timerRef = useRef<any>(null);

  const buscarItem = async (texto: string) => {
    if (!texto || texto.length < 2) { setSugestoes([]); return; }
    setBuscando(true);
    const { data, error } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,origem_producao,setor_fabricante')
      .or(`codigo.ilike.%${texto}%,nome.ilike.%${texto}%`).eq('ativo', true).order('nome').limit(8);
    // 7.50: busca que falha não pode dizer "Nada encontrado."
    setErroBusca(error ? error.message : '');
    setSugestoes(error ? [] : (data || []));
    setBuscando(false);
  };

  const handleChangeQ = (v: string) => {
    setQ(v); setItem(null);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscarItem(v), 300);
  };

  const salvar = async () => {
    if (!item) { alert('Selecione um item do cadastro!'); return; }
    if (!quantidade || Number(quantidade) <= 0) { alert('Informe a quantidade!'); return; }
    setSalvando(true);
    const { error } = await supabase.from('almoxarifado_solicitacoes_reposicao').insert([{
      item_id: item.id, item_codigo: item.codigo, item_nome: item.nome,
      quantidade: Number(quantidade), motivo: motivo || null,
      status: 'Aguardando Liberação PCP',
      vinculo_tipo: vinculo?.tipo || null, vinculo_id: vinculo?.id || null, vinculo_descricao: vinculo?.descricao || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSaved();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-alm-jan" role="dialog" aria-label="Solicitar reposição de estoque">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPackageVariantClosed} size={16} /> Solicitar Reposição de Estoque</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="form-group">
            <label className="acn-label" htmlFor="alm-rep-item">Item *</label>
            {item ? (
              <div className="acn-quadro tom-ok acn-alm-item-escolhido">
                <span className="acn-kb-cresce"><strong>{item.codigo}</strong> — {item.nome}</span>
                <Botao variante="discreto" pequeno icone={mdiClose} title="Trocar o item" aria-label="Trocar o item" onClick={() => setItem(null)} />
              </div>
            ) : (
              <div className="acn-sugestao">
                <input id="alm-rep-item" className="acn-input" value={q} onChange={e=>handleChangeQ(e.target.value)}
                  placeholder="Buscar por código ou nome..." autoFocus />
                {q.length >= 2 && (
                  <div className="acn-sugestao-lista">
                    {sugestoes.map((it:any) => (
                      <div key={it.id} className="acn-sugestao-item" onMouseDown={() => { setItem(it); setQ(''); setSugestoes([]); }}>
                        <strong>{it.codigo}</strong> — {it.nome}
                        {it.origem_producao === 'interna' && (
                          <span className="acn-sub-info"> · fabricação interna ({it.setor_fabricante})</span>
                        )}
                      </div>
                    ))}
                    {buscando && <div className="acn-sugestao-vazio">Buscando...</div>}
                    {!buscando && erroBusca && <div className="acn-sugestao-vazio acn-txt-erro">Não foi possível buscar ({erroBusca}).</div>}
                    {!buscando && !erroBusca && sugestoes.length===0 && <div className="acn-sugestao-vazio">Nada encontrado.</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="acn-label" htmlFor="alm-rep-qtd">Quantidade *</label>
            <input id="alm-rep-qtd" className="acn-input" type="number" min="0"
              value={quantidade} onChange={e=>setQuantidade(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="acn-label" htmlFor="alm-rep-motivo">Motivo</label>
            <textarea id="alm-rep-motivo" className="acn-input" rows={2}
              placeholder="ex: estoque mínimo atingido" value={motivo} onChange={e=>setMotivo(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="acn-label">Vincular a um processo (opcional)</label>
            <VinculoPicker value={vinculo} onSelect={setVinculo} onClear={() => setVinculo(null)} />
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" icone={mdiSendOutline} onClick={salvar} disabled={salvando}>
            {salvando ? 'Enviando...' : 'Solicitar'}
          </Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
