// @ts-nocheck
import { supabase } from './supabaseClient';
import { confirmarRemocao } from './Feedback';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import { LinkLote } from './OpLote';
import { exigeEnderecoCompleto, enderecoQueFalta, enderecoEmLinha, CAMPOS_ENDERECO } from './EnderecoEntrega';
import { soEnvio, fluxoLabel, fluxoEfetivo, UFS, STATUS_EMBALAGEM, TIPO_VENDA_ENVIO, STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, statusDeLiberacaoComercial } from './FluxoEntrega';
import { estaNaFilaDe, aguardaOutroSetor, ehVendaComposta, linhasDoSetor, outroSetor, parteConcluida, partesEmbaladas, SETORES_DE_SEPARACAO, SETOR_ALMOXARIFADO, SETOR_TELECOM, STATUS_DE_SEPARACAO } from './SeparacaoEnvio';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import { notificarEvento, msg } from './whatsappHelper';
import { logChange, useUnreadMap } from './AuditSystem';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { VinculoPicker } from './VinculoPicker';
import type { VinculoValue } from './VinculoPicker';
import { ModalDevolverOp } from './DevolverOp';
import { ModalKitingLoteEnvio } from './KitingLoteEnvio';
import { loteTemEnvioEProducao, ehUnidadeDeEnvio } from './FluxoMisto';
import { SeloFluxosDoLote } from './FluxoMistoTela';
import { ConferenciaKit, conferenciaInicial, validarConferencia, divergencias, resumoDivergencias, registroConferencia, textoDosSeriais, seriaisOutrosDaOp } from './OpItens';
import { indicePendencias, travaKit100, travaRecebimento, textoFaltando, ChecklistPendencias } from './OpPendencias';
import { confirmar, mostrarAviso, pedirTexto } from './Feedback';
import { lerRemessas, lerRemessasAtivasDe, saldoDeUnidades, unidadesDaOp, proximoNumeroDeRemessa, resumoDeRemessas, mesclarSeriais, tirarSeriais, statusDepoisDaUltimaRemessa, contarFretesAbertosDaOp, descricaoDaRemessa } from './Remessas';
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

// `setor` (pedido do usuário em 22/10/2026): a mesma tela serve ao Telecom. OP de RÁDIO em envio é separada, serializada e embalada pelo Telecom, com o MESMO processo do
// Almoxarifado, só que SEM ESTOQUE por enquanto (nada dá baixa, nada é reservado, sem painel de estoque nem reposição). Quem decide de quem é cada OP é `estaNaFilaDe` (as linhas vendidas e a venda composta, T2 e T3)
// (SeparacaoEnvio.ts); cada fila mostra só as suas. O padrão é o Almoxarifado: sem a propriedade, a tela se comporta exatamente como sempre.
export default function AlmoxarifadoTab({ currentUser, setor = SETOR_ALMOXARIFADO }) {
  const doTelecom = setor === SETOR_TELECOM;
  const modulo = doTelecom ? 'telecom' : 'almoxarifado';   // módulo do histórico de alterações (AuditSystem)
  const [opls, setOpls] = useState([]);
  // vendas compostas em que este setor já embalou a sua parte e o outro ainda não (Telecom, T3, 22/10/2026)
  const [aguardandoOutro, setAguardandoOutro] = useState<any[]>([]);
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
  // Remessas (envio parcial de Venda para Envio — fatia 5 do PLANO_RH_DEPARTAMENTOS_ENVIOS.md, 14/10/2026): as remessas ativas de cada OP da fila (a linha mostra "enviadas 2 de 5")
  // e, com a janela de embalagem aberta, as da OP dela (todas, inclusive canceladas: o número da próxima depende delas)
  const [remessasPorOp, setRemessasPorOp] = useState<Map<string, any[]>>(new Map());
  const [remessasDaOp, setRemessasDaOp] = useState<any[]>([]);
  const [erroRemessas, setErroRemessas] = useState('');
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
    if (doTelecom) return null;                             // Telecom: ainda não há estoque (22/10/2026)
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
  useEffect(() => { if (!doTelecom) fetchSolicitacoes(); }, []);   // reposição de estoque é do Almoxarifado

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
      .in('status_geral', STATUS_DE_SEPARACAO)
      .order('data_entrada', { ascending: false });
    // se a leitura falhou, fica a lista que já estava na tela (em vez de esvaziar e dizer "nenhuma OP aguardando")
    if (erroOpls) { setErroLeitura(erroOpls.message); if (!silent) setLoading(false); return; }
    setErroLeitura('');
    // cada setor vê só as OPs que são dele (22/10/2026): rádio em envio é do Telecom, o resto do Almoxarifado (SeparacaoEnvio.ts)
    // (venda composta, T3, 22/10/2026: a OP entra na fila dos dois setores até cada um embalar a sua parte; quem já embalou a dele vê a OP no painel "aguardando o outro setor")
    const daFila = (data || []).filter(o => estaNaFilaDe(o, setor));
    setOpls(daFila);
    setAguardandoOutro((data || []).filter(o => aguardaOutroSetor(o, setor)));
    // remessas ativas das Vendas para Envio da fila; leitura que falha deixa a que já estava na tela (a lista de OPs não depende disto)
    const rem = await lerRemessasAtivasDe(daFila.filter(o => o.tipo_projeto === TIPO_VENDA_ENVIO).map(o => o.id));
    if (!rem.erro) setRemessasPorOp(rem.porOp);

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
    const ids = doTelecom ? [] : [...mapa.keys()];   // o painel de recebimento de pendência (fabricação/compra) é do Almoxarifado
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
    logChange({ module: modulo, entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_almox: opl.status_almox, status_geral: opl.status_geral, obs_almox: opl.obs_almox },
      newRow: { status_almox: statusAlmox, status_geral: statusGeral, obs_almox: obs }, user: currentUser });
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor,
      evento: `${doTelecom ? 'Separação' : 'Kiting'}: ${statusAlmox}${obs ? ' — '+obs : ''}`,
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
  // a OP já teve remessa? então o botão é o da próxima (fatia 5, 14/10/2026)
  const rotuloEmbalar = (o) => (remessasPorOp.get(String(o?.id)) || []).length ? 'EMBALAR PRÓXIMA REMESSA' : 'EMBALAR E ENVIAR';
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

  // Seriais da embalagem de envio que NÃO é "Venda para Envio" (23/10/2026): com a lista de separação na tela, cada item tem o seu serial e a caixa de texto vira "outros seriais";
  // sem lista (kit já conferido antes), a caixa de texto continua sendo a única — como sempre foi.
  const seriaisDaEmbalagem = (f) => (conferencia.length ? textoDosSeriais(conferencia, f.seriais) : String(f.seriais || '').trim());

  const abrirModalEmbalagem = async (opl) => {
    // venda composta (Telecom, T3, 22/10/2026): a BOM é do material de adaptação, então o checklist de separação é da parte do Almoxarifado; a do Telecom não tem checklist
    const composta = ehVendaComposta(opl);
    // se o kit já foi conferido (kiting em lote), não pede de novo
    const linhas = (opl.kit_conferencia || (composta && doTelecom)) ? [] : conferenciaInicial(opl);
    setConferencia(linhas);
    setSaldosKit({});
    // Telecom (22/10/2026): o checklist de separação é o mesmo, mas sem estoque — não consulta saldo (sem saldo nenhuma linha fica travada) e, ao concluir, nada dá baixa
    if (linhas.length && !doTelecom) saldosDoKit({ opl, linhas }).then(setSaldosKit);
    // fatia 5 (14/10/2026): Venda para Envio pode sair em remessas. Lê as da OP; com remessas anteriores, a janela começa pelo SALDO (os seriais já enviados não voltam para a tela)
    // Venda composta não sai em remessas: cada setor embala a parte dele e o frete é um só (T3)
    let remessas: any[] = []; let erroRem = '';
    if (ehVendaEnvioOp(opl) && !composta) { const r = await lerRemessas(opl.id); remessas = r.remessas; erroRem = r.erro || ''; }
    setRemessasDaOp(remessas); setErroRemessas(erroRem);
    const saldo = ehVendaEnvioOp(opl) ? (composta ? unidadesDaOp(opl) : Math.max(1, saldoDeUnidades(opl, remessas))) : 0;
    const jaTemRemessa = remessas.some(r => !r.cancelada);
    setEmbForm({
      itens: ehVendaEnvioOp(opl) && jaTemRemessa ? Array.from({ length: saldo }, () => ({ produto: '', serial: '' })) : linhasSeriaisIniciais(opl),
      unidades: ehVendaEnvioOp(opl) ? String(saldo) : '',   // o padrão é mandar tudo o que falta: quem envia de uma vez só não muda nada
      seriais: opl.seriais_equipamentos || '',
      peso_total: '', volumes: '1',
      altura: '', largura: '', comprimento: '',
      destino_cidade: opl.destino_cidade || '',
      destino_uf: opl.destino_uf || '',
      destino_cep: formatarCep(opl.destino_cep),
      // endereço completo que o vendedor informou ao gerar a OP (15/10/2026); o Almoxarifado confere e, se preciso, ajusta — e o ajuste fica no histórico
      destino_logradouro: opl.destino_logradouro || '', destino_numero: opl.destino_numero || '', destino_bairro: opl.destino_bairro || '',
      destino_complemento: opl.destino_complemento || '', destino_destinatario: opl.destino_destinatario || '', destino_telefone: opl.destino_telefone || '',
      // CIF/FOB decide se esta OP abre cotação de frete ou vai direto para o
      // Comercial. Quando a OP chega aqui sem resposta, é aqui que ela é dada
      // — antes seguia calada como CIF (regra do usuário em 24/09/2026).
      frete_responsavel: opl.frete_responsavel || '',
      observacoes: '',
    });
    setModalEmbalagem(opl);
    aplicarCep(opl.destino_cep, opl.destino_cidade, opl.destino_uf, true);
  };

  // ── Venda composta, fatia T3 (22/10/2026): uma OP, duas separações, um só frete ─────────────────────────────────────────────────────────────────────────────────
  // Cada setor embala a parte dele (as linhas vendidas dele). A parte é gravada em oples.envio_partes pela função do banco `oples_gravar_parte_envio` (uma gravação só, com a linha travada:
  // os dois podem embalar ao mesmo tempo sem um apagar a parte do outro); a resposta traz as partes de agora e é ela que diz quem é o ÚLTIMO. Quem não é o último deixa a OP "aguardando o
  // outro setor" (ela some da fila dele); o último abre o frete único — peso e volumes somados, as medidas de cada caixa descritas (decidido com o usuário em 22/10/2026) — e a OP segue como hoje.
  const concluirParteDaVendaComposta = async (f, itensSeriais) => {
    const opl = modalEmbalagem; const outro = outroSetor(setor); const agora = new Date().toISOString();
    const vendaEnvio = ehVendaEnvioOp(opl);
    const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
    const freteComCliente = f.frete_responsavel === 'FOB';
    setSalvandoEmb(true);
    // 1) o material do checklist (só a parte do Almoxarifado tem) dá baixa no estoque; a baixa trabalha por diferença, então repetir não conta duas vezes
    const difEmb = divergencias(conferencia).length ? 'Diferença com a BOM — ' + resumoDivergencias(conferencia) : '';
    const baixaEmb = conferencia.length && !doTelecom ? await baixarKitDaOp({ opl, linhas: conferencia, currentUser }) : null;
    const obsEmb = [f.observacoes, difEmb, textoDaBaixa(baixaEmb)].filter(Boolean).join(' · ');
    // 2) grava a parte deste setor
    const parte = {
      concluida_em: agora, por: currentUser?.nome || null,
      seriais: vendaEnvio ? itensSeriais.map(x => `${x.produto}: ${x.serial}`).join('\n') : seriaisDaEmbalagem(f),
      ...(vendaEnvio ? { seriais_itens: itensSeriais } : {}),
      peso_total: num(f.peso_total), volumes: f.volumes === '' ? null : parseInt(f.volumes, 10),
      altura: num(f.altura), largura: num(f.largura), comprimento: num(f.comprimento),
      observacoes: f.observacoes || null,
    };
    const { data: partes, error: erroParte } = await supabase.rpc('oples_gravar_parte_envio', { p_id: opl.id, p_setor: setor, p_parte: parte });
    if (erroParte || !partes) {
      setSalvandoEmb(false);
      alert(`Não foi possível gravar a parte do ${setor} da OP ${opl.opl}: ${erroParte?.message || 'sem resposta'}\n\nNada foi enviado; tente de novo (o estoque já baixado não baixa duas vezes).`);
      return;
    }
    const ultima = !!partes[outro]?.concluida_em;
    // 3) dados da OP comuns aos dois casos: destino, quem paga o frete, conferência do kit e os seriais das duas partes juntos
    const serialTexto = SETORES_DE_SEPARACAO.map(s => partes[s]?.seriais).filter(Boolean).join('\n');
    const serialItens = SETORES_DE_SEPARACAO.reduce((acc, s) => mesclarSeriais(acc, partes[s]?.seriais_itens || []), []);
    const extraOp = {
      ...(conferencia.length ? { kit_conferencia: registroConferencia(conferencia, currentUser, false, vendaEnvio ? '' : f.seriais) } : {}),
      seriais_equipamentos: serialTexto,
      ...(vendaEnvio ? { seriais_itens: serialItens } : {}),
      destino_cidade: f.destino_cidade.trim(), destino_uf: f.destino_uf, destino_cep: formatarCep(f.destino_cep),
      destino_logradouro: f.destino_logradouro?.trim() || null, destino_numero: f.destino_numero?.trim() || null, destino_bairro: f.destino_bairro?.trim() || null,
      destino_complemento: f.destino_complemento?.trim() || null, destino_destinatario: f.destino_destinatario?.trim() || null, destino_telefone: f.destino_telefone?.trim() || null,
      frete_responsavel: f.frete_responsavel,
    };
    const destinoTxt = [f.destino_cidade, f.destino_uf].filter(Boolean).join('/');
    const registrarRecado = async (texto, assunto) => {
      await supabase.from('op_acompanhamentos').insert({
        referencia_id: opl.opl, referencia_tipo: 'op', referencia_desc: `OP ${opl.opl}`, setor, texto,
        usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema', criado_em: new Date().toISOString(),
      });
      await notificarEnvolvidosOp({ ref: opl.opl, texto, assunto, autorId: currentUser?.id ? String(currentUser.id) : null, autorNome: currentUser?.nome || null });
    };

    if (!ultima) {
      // 4a) primeira parte a ficar pronta: a OP não anda; só recebe a parte, o destino e os seriais, e fica "aguardando o outro setor"
      const { error: erroOp } = await supabase.from('oples').update({ obs_almox: obsEmb, responsavel_almox: currentUser?.nome, ...extraOp }).eq('id', opl.id);
      if (erroOp) {
        setSalvandoEmb(false); fetchAll();
        alert(`A parte do ${setor} foi gravada, mas os dados da OP ${opl.opl} não foram atualizados: ${erroOp.message}\n\nA OP está em "aguardando o ${outro}"; use "Refazer a parte" se quiser embalar de novo.`);
        return;
      }
      logChange({ module: modulo, entityType: 'oples', entityId: opl.id, changeType: 'UPDATE', oldRow: { envio_partes: opl.envio_partes }, newRow: { envio_partes: partes }, user: currentUser });
      const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor,
        evento: `Parte do ${setor} embalada (${f.volumes || 1} volume(s), ${f.peso_total} kg) — a OP espera o ${outro}; o frete único abre quando ele terminar`,
        status_anterior: opl.status_geral, status_novo: opl.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
      }]);
      if (erroLog) mostrarAviso(`A parte foi registrada, mas o histórico de movimentação da OP ${opl.opl} não foi gravado: ${erroLog.message}`, 'atencao');
      await registrarRecado(`Parte do ${setor} embalada: ${f.volumes || 1} volume(s), ${f.peso_total} kg. A OP espera o ${outro} para abrir o frete único.`, 'Parte da venda embalada');
      setSalvandoEmb(false);
      alert(`Parte do ${setor} registrada. A OP ${opl.opl} sai da sua fila e espera o ${outro}; o frete único abre quando ele terminar.`);
      setModalEmbalagem(null); fetchAll();
      return;
    }

    // 4b) a última parte: as caixas de cada setor viram UM pedido de frete (peso e volumes somados; as medidas de cada caixa descritas; nas três colunas vão as da caixa maior)
    const caixas = SETORES_DE_SEPARACAO.map(s => ({ s, p: partes[s] })).filter(c => c.p);
    const soma = (k) => caixas.reduce((t, c) => t + (Number(c.p[k]) || 0), 0);
    const pesoTotal = soma('peso_total'); const volumesTotal = soma('volumes') || null;
    const volumeCm3 = (p) => (Number(p.altura) || 0) * (Number(p.largura) || 0) * (Number(p.comprimento) || 0);
    const maior = [...caixas].sort((a, b) => volumeCm3(b.p) - volumeCm3(a.p))[0].p;
    const fmtN = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const descCaixas = caixas.map(c => `Caixa ${c.s}: ${fmtN(c.p.altura)} × ${fmtN(c.p.largura)} × ${fmtN(c.p.comprimento)} cm, ${fmtN(c.p.peso_total)} kg, ${c.p.volumes || 1} volume(s)`).join(' · ');
    const obsFrete = [descCaixas, ...caixas.map(c => c.p.observacoes && `${c.s}: ${c.p.observacoes}`)].filter(Boolean).join(' · ');
    const statusDepois = freteComCliente ? statusDeLiberacaoComercial(opl) : 'Aguardando Cotacao Frete';
    const gravouOp = await setAlmox(opl, 'Kit OK', statusDepois, obsEmb, extraOp);
    if (!gravouOp) {
      setSalvandoEmb(false); fetchAll();
      alert(`As duas partes estão embaladas, mas a OP ${opl.opl} não andou. Abra "EMBALAR" de novo no ${setor} para concluir (a parte do ${outro} já está guardada).`);
      return;
    }
    const { data: freteCriado, error } = freteComCliente ? { data: null, error: null } : await supabase.from('pcp_fretes').insert([{
      direcao: 'outbound',
      descricao: `OP ${opl.opl} — ${opl.cliente_nome || ''} (${fluxoLabel(opl.fluxo_entrega)}) — venda composta: ${SETORES_DE_SEPARACAO.join(' + ')}`.trim(),
      destino: [f.destino_cidade.trim(), f.destino_uf].filter(Boolean).join(' / '),
      cep_destino: formatarCep(f.destino_cep),
      destino_endereco: enderecoEmLinha(f) || null,
      destino_destinatario: f.destino_destinatario?.trim() || null,
      destino_telefone: f.destino_telefone?.trim() || null,
      data_prevista: opl.data_prevista_entrega || null,
      quantidade_volumes: volumesTotal, peso_total: pesoTotal,
      medida_altura: num(maior.altura), medida_largura: num(maior.largura), medida_comprimento: num(maior.comprimento),
      vinculo_tipo: 'op_os', vinculo_id: opl.id, vinculo_desc: `OP ${opl.opl}`,
      observacoes: obsFrete || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]).select('id');
    {
      const CHAVES = ['destino_cep', 'destino_cidade', 'destino_uf', ...CAMPOS_ENDERECO.map(c => c.campo)];
      const norm = (k: string, v: any) => (k === 'destino_cep' ? String(v ?? '').replace(/\D/g, '') : String(v ?? '').trim());
      const mudou = CHAVES.filter(k => norm(k, opl[k]) !== norm(k, f[k]));
      if (mudou.length) {
        const rot = (k: string) => k === 'destino_cep' ? 'CEP' : k === 'destino_cidade' ? 'cidade' : k === 'destino_uf' ? 'UF' : (CAMPOS_ENDERECO.find(c => c.campo === k)?.rotulo.split(' (')[0] || k);
        const texto = mudou.map(k => `${rot(k)}: ${String(opl[k] ?? '').trim() || '—'} → ${String(f[k] ?? '').trim() || '—'}`).join('; ');
        const { error: erroEnd } = await supabase.from('logs_movimentacao_opl').insert([{
          opl_id: opl.id, numero_opl: opl.opl, setor,
          evento: `Endereço de entrega conferido/ajustado na embalagem por ${currentUser?.nome || '—'} — ${texto}`,
          status_anterior: opl.status_geral, status_novo: opl.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
        }]);
        if (erroEnd) mostrarAviso(`A embalagem foi gravada, mas o histórico do ajuste de endereço da OP ${opl.opl} não: ${erroEnd.message}`, 'atencao');
      }
    }
    logChange({ module: modulo, entityType: 'oples', entityId: opl.id, changeType: 'UPDATE', oldRow: { envio_partes: opl.envio_partes }, newRow: { envio_partes: partes }, user: currentUser });
    await registrarRecado(`Última parte embalada (${setor}): ${volumesTotal || 1} volume(s) no total, ${fmtN(pesoTotal)} kg, destino ${destinoTxt}. ${descCaixas}. `
      + (freteComCliente ? 'Frete por conta do cliente (FOB) — liberado direto para o Comercial.' : 'Solicitação de frete único aberta para a Logística cotar.'), 'Embalagem e frete único');
    setSalvandoEmb(false);
    if (error) alert(`As duas partes estão embaladas, mas houve erro ao abrir a solicitação de frete: ${error.message}`);
    else if (freteComCliente) alert(`Última parte registrada. Frete por conta do cliente — OP ${opl.opl} liberada direto para o Comercial.`);
    else alert(`Última parte registrada. Solicitação de frete único aberta para a Logística cotar (OP ${opl.opl}): ${volumesTotal || 1} volume(s), ${fmtN(pesoTotal)} kg.`);
    setModalEmbalagem(null); fetchAll();
  };

  // O setor que já embalou a parte dele pode desfazê-la enquanto o outro não terminou (a OP volta para a fila dele). O estoque que já deu baixa não volta sozinho: acerta-se por contagem.
  const refazerMinhaParte = async (o) => {
    if (!await confirmar(`Refazer a parte do ${setor} da OP ${o.opl}?\n\nA parte que foi embalada é descartada e a OP volta para a sua fila. O estoque que já deu baixa não volta sozinho: se precisar, acerte por contagem.`)) return;
    const { error } = await supabase.rpc('oples_gravar_parte_envio', { p_id: o.id, p_setor: setor, p_parte: null });
    if (error) { alert(`Não foi possível reabrir a parte do ${setor} da OP ${o.opl}: ${error.message}`); return; }
    logChange({ module: modulo, entityType: 'oples', entityId: o.id, changeType: 'UPDATE', oldRow: { envio_partes: o.envio_partes }, newRow: { envio_partes: 'parte do ' + setor + ' reaberta' }, user: currentUser });
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: o.id, numero_opl: o.opl, setor, evento: `Parte do ${setor} reaberta para refazer — a OP volta para a fila do ${setor}`,
      status_anterior: o.status_geral, status_novo: o.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    if (erroLog) mostrarAviso(`A parte foi reaberta, mas o histórico de movimentação da OP ${o.opl} não foi gravado: ${erroLog.message}`, 'atencao');
    fetchAll();
  };

  const confirmarEmbalagem = async () => {
    const f = embForm;
    const vendaEnvio = ehVendaEnvioOp(modalEmbalagem);
    const itensSeriais = vendaEnvio
      ? (f.itens || []).map(x => ({ produto: String(x.produto || '').trim(), serial: String(x.serial || '').trim() })).filter(x => x.serial)
      : [];
    // fatia 5 (14/10/2026): remessa. `unidadesRemessa` = quantas unidades saem agora (o padrão da janela é o saldo inteiro: envio de uma vez só = o caminho de sempre, sem registro de remessa).
    // Parcial = menos que o saldo: grava a remessa, abre o frete dela e a OP continua na fila. Última remessa (já há remessa anterior): grava a remessa e a OP segue como sempre seguiu.
    if (vendaEnvio && erroRemessas) { mostrarAviso(`Não consegui ler as remessas desta OP (${erroRemessas}). Sem isso não dá para saber o que já foi enviado — feche a janela e tente de novo.`, 'atencao'); return; }
    // venda composta (Telecom, T3, 22/10/2026): cada setor embala a parte dele, sem remessas; o serial é de quem serializa (o Telecom) e a parte do Almoxarifado pode seguir sem ele
    const composta = ehVendaComposta(modalEmbalagem);
    const serialObrig = !(composta && !doTelecom);
    const saldoOp = vendaEnvio ? (composta ? unidadesDaOp(modalEmbalagem) : Math.max(1, saldoDeUnidades(modalEmbalagem, remessasDaOp))) : 0;
    const unidadesRemessa = vendaEnvio ? (composta ? saldoOp : Math.floor(Number(f.unidades))) : 0;
    if (vendaEnvio && !(unidadesRemessa >= 1 && unidadesRemessa <= saldoOp)) { alert(`Informe quantas unidades vão nesta remessa: de 1 a ${saldoOp}.`); return; }
    const remessasAtivas = composta ? [] : remessasDaOp.filter(r => !r.cancelada);
    const parcial = vendaEnvio && !composta && unidadesRemessa < saldoOp;
    const comRemessa = vendaEnvio && !composta && (parcial || remessasAtivas.length > 0);
    if (vendaEnvio) {
      const qtdVendida = unidadesRemessa;
      if (itensSeriais.some(x => !x.produto)) { alert('Informe o produto de cada serial.'); return; }
      if (serialObrig && itensSeriais.length < qtdVendida) {
        alert(`Informe o serial ACN de cada produto: ${comRemessa ? `são ${qtdVendida} unidade(s) nesta remessa` : `são ${qtdVendida} unidade(s) vendida(s)`} e há ${itensSeriais.length} serial(is).`);
        return;
      }
    } else if (serialObrig && !seriaisDaEmbalagem(f))  { alert(conferencia.length ? 'Informe o número de série de pelo menos um item da lista de separação (coluna Serial) ou em "Outros números de série".' : 'Informe os números de série dos equipamentos.'); return; }
    if (!f.peso_total)       { alert('Informe o peso da embalagem.'); return; }
    // Medidas obrigatórias (pedido do usuário em 15/10/2026): o frete nasce desta janela e a transportadora cota pelas medidas;
    // uma embalagem foi gravada só com o peso e o frete seguiu para cotação sem as três medidas.
    // (conta local: o `num` desta função só é declarado mais abaixo e usá-lo aqui daria erro de execução)
    const medidaValida = (v: any) => Number(String(v ?? '').replace(',', '.')) > 0;
    if (!(medidaValida(f.altura) && medidaValida(f.largura) && medidaValida(f.comprimento))) {
      mostrarAviso('Informe as três medidas da embalagem (altura, largura e comprimento, em cm): é com elas que a Logística cota o frete.', 'atencao'); return;
    }
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
    // Pedido do usuário em 15/10/2026: Venda para Envio com frete por conta da empresa exige o endereço completo — é o que a Logística vê na cotação.
    // Quem deveria ter informado é o vendedor (ao gerar a OP); a OP antiga, sem ele, é completada aqui.
    if (exigeEnderecoCompleto(modalEmbalagem.tipo_projeto, modalEmbalagem.fluxo_entrega, f.frete_responsavel)) {
      const faltaEnd = enderecoQueFalta(f);
      if (faltaEnd.length) {
        mostrarAviso(`Frete por conta da empresa: a Logística cota o frete pelo endereço de entrega. Falta: ${faltaEnd.join(', ')}.`, 'atencao'); return;
      }
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
    // venda composta: a parte deste setor é gravada à parte e o frete único só nasce quando o último setor terminar (T3, 22/10/2026)
    if (composta) { await concluirParteDaVendaComposta(f, itensSeriais); return; }
    setSalvandoEmb(true);
    const opl = modalEmbalagem;
    const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
    // FOB = o cliente paga o frete: não há o que a Logística cotar, então a OP
    // pula direto pra liberação comercial (regra pedida pelo usuário em
    // 24/09/2026 — ver a pergunta CIF/FOB na criação da OP, NovaOpOsModal.tsx).
    // Vale o que está na tela: a OP pode ter chegado aqui sem resposta, ou o
    // Almoxarifado pode estar corrigindo o que o Comercial respondeu.
    const freteComCliente = f.frete_responsavel === 'FOB';

    // fatia 5 (14/10/2026): na ÚLTIMA remessa, a OP só vai direto para o Comercial (FOB) se nenhum frete de remessa anterior ainda estiver aberto — lido ANTES de gravar qualquer coisa,
    // para uma leitura que falha não deixar a OP no meio do caminho
    let fretesAbertosAntes = 0;
    if (comRemessa && !parcial) {
      const ab = await contarFretesAbertosDaOp(opl.id);
      if (ab.erro) { setSalvandoEmb(false); mostrarAviso(`Não consegui conferir os fretes das remessas anteriores (${ab.erro}). Tente de novo.`, 'atencao'); return; }
      fretesAbertosAntes = ab.abertos;
    }
    // para onde a OP vai depois desta embalagem: pra cotação de frete (CIF) ou já pra liberação comercial (FOB, sem cotação); a remessa parcial NÃO muda a etapa da OP
    const statusDepois = comRemessa && !parcial
      ? statusDepoisDaUltimaRemessa({ freteComCliente, fretesAbertos: fretesAbertosAntes, statusLiberacao: statusDeLiberacaoComercial(opl) })
      : (freteComCliente ? statusDeLiberacaoComercial(opl) : 'Aguardando Cotacao Frete');

    // 1) a OP sai do caminho da produção
    const difEmb = divergencias(conferencia).length ? 'Diferença com a BOM — ' + resumoDivergencias(conferencia) : '';
    // OP de envio direto não passa pelo kiting: a conferência dela acontece
    // aqui, então é aqui que o material dá baixa. Quem já foi conferido no
    // kiting chega com `conferencia` vazia e não movimenta nada de novo.
    // (Com remessas, a conferência e a baixa são do kit INTEIRO e acontecem uma vez só, na primeira remessa: depois dela `kit_conferencia` já está gravado.)
    const baixaEmb = conferencia.length && !doTelecom   // Telecom: ainda não há estoque, nada dá baixa (22/10/2026)
      ? await baixarKitDaOp({ opl, linhas: conferencia, currentUser })
      : null;
    const obsEmb = [f.observacoes, difEmb, textoDaBaixa(baixaEmb)].filter(Boolean).join(' · ');
    // seriais da OP: com remessa, o que já estava + os das remessas ativas + os desta, sem repetir serial (gravar de novo não duplica linha)
    const seriaisDaOp = comRemessa ? mesclarSeriais(mesclarSeriais(opl.seriais_itens, remessasAtivas.flatMap(r => r.itens || [])), itensSeriais) : itensSeriais;
    const extraOp = {
      ...(conferencia.length ? { kit_conferencia: registroConferencia(conferencia, currentUser, false, vendaEnvio ? '' : f.seriais) } : {}),
      seriais_equipamentos: vendaEnvio ? seriaisDaOp.map(x => `${x.produto}: ${x.serial}`).join('\n') : seriaisDaEmbalagem(f),
      ...(vendaEnvio ? { seriais_itens: seriaisDaOp } : {}),
      destino_cidade: f.destino_cidade.trim(),
      destino_uf: f.destino_uf,
      destino_cep: formatarCep(f.destino_cep),
      destino_logradouro: f.destino_logradouro?.trim() || null, destino_numero: f.destino_numero?.trim() || null, destino_bairro: f.destino_bairro?.trim() || null,
      destino_complemento: f.destino_complemento?.trim() || null, destino_destinatario: f.destino_destinatario?.trim() || null, destino_telefone: f.destino_telefone?.trim() || null,
      // a resposta dada (ou corrigida) aqui fica na OP: da próxima vez que
      // alguém abrir esta OP, o selo mostra quem paga o frete
      frete_responsavel: f.frete_responsavel,
    };

    // 1a) a remessa é gravada ANTES de a OP andar: é ela que diz quantas unidades já saíram. Se esta gravação falhar, nada mais é mexido
    // (o estoque já baixado não duplica ao repetir: a baixa trabalha por diferença). O número é único por OP: janela desatualizada não grava a mesma remessa duas vezes.
    const numeroRemessa = proximoNumeroDeRemessa(remessasDaOp);
    let remessaId: string | null = null;
    if (comRemessa) {
      const { data: remNova, error: erroRem } = await supabase.from('op_remessas').insert([{
        opl_id: opl.id, numero: numeroRemessa, unidades: unidadesRemessa, itens: itensSeriais,
        peso_total: num(f.peso_total), volumes: f.volumes === '' ? null : parseInt(f.volumes, 10),
        medida_altura: num(f.altura), medida_largura: num(f.largura), medida_comprimento: num(f.comprimento),
        destino_cep: formatarCep(f.destino_cep), destino_cidade: f.destino_cidade.trim(), destino_uf: f.destino_uf,
        frete_responsavel: f.frete_responsavel, observacoes: f.observacoes || null,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]).select('id');
      if (erroRem || !remNova?.[0]?.id) {
        setSalvandoEmb(false);
        alert(erroRem?.code === '23505'
          ? `A remessa ${numeroRemessa} desta OP já foi gravada (outra pessoa embalou ao mesmo tempo, ou esta janela ficou aberta). Feche a janela e abra "EMBALAR" de novo.`
          : 'Não foi possível gravar a remessa: ' + (erroRem?.message || 'sem resposta') + '\n\nNada foi enviado; tente de novo.');
        return;
      }
      remessaId = remNova[0].id;
    }

    // 1b) a OP: parcial não muda de etapa (continua na fila do Almoxarifado com o saldo; só recebe seriais, a conferência do kit, o destino e o recado); as demais andam como sempre andaram
    if (parcial) {
      const { error: erroOp } = await supabase.from('oples').update({ obs_almox: obsEmb, responsavel_almox: currentUser?.nome, ...extraOp }).eq('id', opl.id);
      if (erroOp) {
        setSalvandoEmb(false); fetchAll();
        alert(`A remessa ${numeroRemessa} foi gravada, mas a OP ${opl.opl} não foi atualizada: ${erroOp.message}\n\nAbra "EMBALAR" de novo e use "Cancelar remessa ${numeroRemessa}" para refazer.`);
        return;
      }
      logChange({ module: modulo, entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
        oldRow: { seriais_itens: opl.seriais_itens, obs_almox: opl.obs_almox }, newRow: { seriais_itens: seriaisDaOp, obs_almox: obsEmb }, user: currentUser });
      const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor,
        evento: `Remessa ${numeroRemessa} embalada (${unidadesRemessa} de ${unidadesDaOp(opl)} un.) — a OP continua no ${setor}`,
        status_anterior: opl.status_geral, status_novo: opl.status_geral,
        usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
      }]);
      if (erroLog) mostrarAviso(`A remessa foi registrada, mas o histórico de movimentação da OP ${opl.opl} não foi gravado: ${erroLog.message}`, 'atencao');
    } else {
      const gravouOp = await setAlmox(opl, 'Kit OK', statusDepois, obsEmb, extraOp);
      // 7.50: sem a OP atualizada não abre frete, não avisa ninguém e a janela fica aberta para tentar de novo
      if (!gravouOp) {
        setSalvandoEmb(false);
        if (remessaId) { fetchAll(); alert(`A remessa ${numeroRemessa} foi gravada, mas a OP ${opl.opl} não andou. Abra "EMBALAR" de novo e use "Cancelar remessa ${numeroRemessa}" para refazer.`); }
        return;
      }
    }

    // 2) nasce a solicitação de frete (status default 'Cotação') pra Logística
    //    — só quando é a empresa quem paga (CIF); com remessa, um pedido de frete por remessa
    const { data: freteCriado, error } = freteComCliente ? { data: null, error: null } : await supabase.from('pcp_fretes').insert([{
      direcao: 'outbound',
      descricao: `OP ${opl.opl} — ${opl.cliente_nome || ''} (${fluxoLabel(opl.fluxo_entrega)})`.trim() + (comRemessa ? ` — ${descricaoDaRemessa(opl, numeroRemessa, unidadesRemessa)}` : ''),
      destino: [f.destino_cidade.trim(), f.destino_uf].filter(Boolean).join(' / '),
      cep_destino: formatarCep(f.destino_cep),
      // endereço completo, tirado da OP no momento da embalagem: é o que a Logística lê na cotação
      destino_endereco: enderecoEmLinha(f) || null,
      destino_destinatario: f.destino_destinatario?.trim() || null,
      destino_telefone: f.destino_telefone?.trim() || null,
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
      vinculo_tipo: 'op_os', vinculo_id: opl.id, vinculo_desc: `OP ${opl.opl}` + (comRemessa ? ` · remessa ${numeroRemessa}` : ''),
      observacoes: f.observacoes || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]).select('id');
    if (remessaId && freteCriado?.[0]?.id) {
      const { error: erroLig } = await supabase.from('op_remessas').update({ frete_id: freteCriado[0].id }).eq('id', remessaId);
      if (erroLig) mostrarAviso(`O frete da remessa ${numeroRemessa} foi aberto, mas não consegui ligá-lo à remessa (${erroLig.message}); o cancelamento da remessa não conseguirá cancelar o frete sozinho.`, 'atencao');
    }
    // o ajuste do endereço de entrega pelo Almoxarifado fica no histórico da OP (quem informou foi o vendedor; aqui só se confere e corrige)
    {
      const CHAVES = ['destino_cep', 'destino_cidade', 'destino_uf', ...CAMPOS_ENDERECO.map(c => c.campo)];
      const norm = (k: string, v: any) => (k === 'destino_cep' ? String(v ?? '').replace(/\D/g, '') : String(v ?? '').trim());
      const mudou = CHAVES.filter(k => norm(k, opl[k]) !== norm(k, f[k]));
      if (mudou.length) {
        const rot = (k: string) => k === 'destino_cep' ? 'CEP' : k === 'destino_cidade' ? 'cidade' : k === 'destino_uf' ? 'UF' : (CAMPOS_ENDERECO.find(c => c.campo === k)?.rotulo.split(' (')[0] || k);
        const texto = mudou.map(k => `${rot(k)}: ${String(opl[k] ?? '').trim() || '—'} → ${String(f[k] ?? '').trim() || '—'}`).join('; ');
        const { error: erroEnd } = await supabase.from('logs_movimentacao_opl').insert([{
          opl_id: opl.id, numero_opl: opl.opl, setor,
          evento: `Endereço de entrega conferido/ajustado na embalagem por ${currentUser?.nome || '—'} — ${texto}`,
          status_anterior: opl.status_geral, status_novo: opl.status_geral,
          usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
        }]);
        if (erroEnd) mostrarAviso(`A embalagem foi gravada, mas o histórico do ajuste de endereço da OP ${opl.opl} não: ${erroEnd.message}`, 'atencao');
      }
    }

    // 3) quem vendeu precisa poder responder ao cliente sem perguntar a
    //    ninguém: "embalado, foi para cotação de frete" é exatamente o
    //    recado que falta hoje. Registra no acompanhamento e notifica.
    const destinoTxt = [f.destino_cidade, f.destino_uf].filter(Boolean).join('/');
    const irDireto = freteComCliente && statusDepois !== 'Aguardando Cotacao Frete';
    const recado = comRemessa
      ? `Remessa ${numeroRemessa} embalada (${unidadesRemessa} de ${unidadesDaOp(opl)} unidade(s)): ${f.volumes || 1} volume(s), ${f.peso_total} kg, destino ${destinoTxt}. `
        + (parcial ? `Faltam ${saldoOp - unidadesRemessa} unidade(s): a OP continua no ${setor}. ` : 'Foi a última remessa: a OP segue. ')
        + (freteComCliente ? 'Frete por conta do cliente (FOB).' : 'Solicitação de frete aberta para a Logística cotar.')
      : freteComCliente
      ? `Embalado: ${f.volumes || 1} volume(s), ${f.peso_total} kg, destino ${destinoTxt}. Frete por conta do cliente (FOB) — liberado direto para o Comercial.`
      : `Embalado: ${f.volumes || 1} volume(s), ${f.peso_total} kg, destino ${destinoTxt}. Solicitação de frete aberta para a Logística cotar.`;
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: opl.opl, referencia_tipo: 'op', referencia_desc: `OP ${opl.opl}`,
      setor, texto: recado,
      usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema',
      criado_em: new Date().toISOString(),
    });
    await notificarEnvolvidosOp({
      ref: opl.opl, texto: recado, assunto: parcial ? 'Remessa parcial e frete' : 'Embalagem e frete',
      autorId: currentUser?.id ? String(currentUser.id) : null,
      autorNome: currentUser?.nome || null,
    });

    setSalvandoEmb(false);
    if (parcial) {
      alert(`Remessa ${numeroRemessa} registrada (${unidadesRemessa} de ${unidadesDaOp(opl)} unidades). `
        + (error ? `Houve erro ao abrir a solicitação de frete: ${error.message}. ` : freteComCliente ? 'Frete por conta do cliente (FOB). ' : 'Solicitação de frete aberta para a Logística cotar. ')
        + `A OP ${opl.opl} continua no ${setor} com ${saldoOp - unidadesRemessa} unidade(s) por enviar.`);
    }
    else if (error) { alert('OP finalizada, mas houve erro ao abrir a solicitação de frete: ' + error.message); }
    else if (irDireto) { alert(`Embalagem registrada. Frete por conta do cliente — OP ${opl.opl} liberada direto para o Comercial.`); }
    else if (freteComCliente) { alert(`Última remessa registrada. Frete por conta do cliente, mas ainda há frete de remessa anterior em aberto — a OP ${opl.opl} espera a entrega dele para seguir para o Comercial.`); }
    else { alert(`Embalagem registrada. Solicitação de frete aberta para a Logística cotar (OP ${opl.opl}).`); }
    setModalEmbalagem(null);
    fetchAll();
  };

  // Cancelar uma remessa (fatia 5, 14/10/2026): marca como cancelada (nada é apagado), cancela o frete dela se ainda não foi entregue e devolve as unidades — e os seriais — ao saldo da OP.
  // Só existe aqui, na janela de embalagem, ou seja, enquanto a OP ainda está na fila do Almoxarifado.
  const cancelarRemessa = async (r) => {
    const opl = modalEmbalagem; if (!opl) return;
    const motivo = await pedirTexto(`Motivo do cancelamento da remessa ${r.numero} (${r.unidades} unidade(s)):`);
    if (motivo === null) return;
    if (!String(motivo).trim()) { mostrarAviso('Escreva o motivo do cancelamento.', 'atencao'); return; }
    if (r.frete_id) {
      const { data: fr, error: erroFr } = await supabase.from('pcp_fretes').select('id,status,observacoes').eq('id', r.frete_id).maybeSingle();
      if (erroFr) { alert('Não consegui conferir o frete desta remessa: ' + erroFr.message); return; }
      if (fr?.status === 'Entregue') { alert(`O frete da remessa ${r.numero} já foi entregue — não dá para cancelar a remessa.`); return; }
      if (fr && fr.status !== 'Cancelado') {
        const { error: erroCf } = await supabase.from('pcp_fretes').update({ status: 'Cancelado', observacoes: [fr.observacoes, `Cancelado: remessa ${r.numero} cancelada no ${setor} — ${String(motivo).trim()}`].filter(Boolean).join(' · ') }).eq('id', fr.id);
        if (erroCf) { alert('Não consegui cancelar o frete desta remessa: ' + erroCf.message + '\n\nNada foi cancelado.'); return; }
      }
    }
    const { error: erroRm } = await supabase.from('op_remessas').update({ cancelada: true, cancelada_em: new Date().toISOString(), cancelada_por_nome: currentUser?.nome || null, motivo_cancelamento: String(motivo).trim() }).eq('id', r.id);
    if (erroRm) { alert('Não foi possível cancelar a remessa: ' + erroRm.message); return; }
    // os seriais da remessa voltam ao saldo (a OP deixa de listá-los como enviados)
    const sobraram = tirarSeriais(opl.seriais_itens, r.itens);
    const { error: erroOp } = await supabase.from('oples').update({ seriais_itens: sobraram, seriais_equipamentos: sobraram.map(x => `${x.produto}: ${x.serial}`).join('\n') }).eq('id', opl.id);
    if (erroOp) mostrarAviso(`A remessa foi cancelada, mas não consegui tirar os seriais dela da OP: ${erroOp.message}`, 'atencao');
    logChange({ module: modulo, entityType: 'op_remessas', entityId: r.id, changeType: 'UPDATE', oldRow: { cancelada: false }, newRow: { cancelada: true, motivo_cancelamento: String(motivo).trim() }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor, evento: `Remessa ${r.numero} cancelada (${r.unidades} unidade(s) voltam ao saldo) — ${String(motivo).trim()}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: opl.opl, referencia_tipo: 'op', referencia_desc: `OP ${opl.opl}`, setor,
      texto: `Remessa ${r.numero} cancelada (${r.unidades} unidade(s) voltam ao saldo): ${String(motivo).trim()}.`,
      usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema', criado_em: new Date().toISOString(),
    });
    // a janela passa a mostrar o saldo novo
    const novas = await lerRemessas(opl.id); setRemessasDaOp(novas.remessas); setErroRemessas(novas.erro || '');
    const saldo = Math.max(1, saldoDeUnidades(opl, novas.remessas));
    setModalEmbalagem(o => o && ({ ...o, seriais_itens: sobraram }));
    setEmbForm(fm => ({ ...fm, unidades: String(saldo), itens: novas.remessas.some(x => !x.cancelada) ? Array.from({ length: saldo }, () => ({ produto: '', serial: '' })) : linhasSeriaisIniciais({ ...opl, seriais_itens: sobraram }) }));
    fetchAll(true);
  };

  const abrirModalSeriais = async (opl, pendenciaSanada=false) => {
    const linhas = conferenciaInicial(opl);
    setConferencia(linhas);
    setSaldosKit({});
    setSeriaisKitForm(seriaisOutrosDaOp(opl));   // o serial de cada item volta na própria linha da conferência; aqui só os "outros" (e o texto antigo das OPs de uma caixa só)
    setModalSeriais({ ...opl, _pendenciaSanada: pendenciaSanada });
    setSaldosKit(await saldosDoKit({ opl, linhas }));
  };

  const confirmarKitOkComSeriais = async () => {
    const textoSeriais = textoDosSeriais(conferencia, seriaisKitForm);
    if (!textoSeriais) { alert(conferencia.length ? 'Informe o número de série de pelo menos um item do kit (coluna Serial) ou em "Outros números de série".' : 'Informe os números de série dos equipamentos deste kit.'); return; }
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

    const extra: any = { seriais_equipamentos: textoSeriais };
    if (conferencia.length) extra.kit_conferencia = registroConferencia(conferencia, currentUser, false, seriaisKitForm);

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
        kit_conferencia: registroConferencia(conferencia, currentUser, false, seriaisKitForm),   // guarda também o serial já digitado em cada item
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
          Não foi possível ler as OPs {doTelecom ? 'do Telecom' : 'do Almoxarifado'} ({erroLeitura}). Isso não quer dizer que não haja OP aguardando{opls.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
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
        <div className="sec-hdr"><span>{doTelecom ? 'Separação e envio — OPs de rádio aguardando o Telecom' : 'Kiting — OPs Aguardando Conferencia'} ({filtrarOpls(opls, busca).length})</span></div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OP aguardando {doTelecom ? 'o Telecom' : 'Almoxarifado'}.</div>
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
                        {/* Telecom, T3 (22/10/2026): venda com linhas dos dois setores. Cada um separa e embala só as linhas dele; o frete é um só, aberto quando o último terminar */}
                        {ehVendaComposta(o) && (
                          <div className="acn-alm-embalar"><Selo familia="atencao" ponto={false}
                            title={`Suas linhas nesta venda: ${linhasDoSetor(o, setor).map(l => `${l.quantidade}× ${l.nome}`).join('; ')}\n\nLinhas do ${outroSetor(setor)}: ${linhasDoSetor(o, outroSetor(setor)).map(l => `${l.quantidade}× ${l.nome}`).join('; ')}`}>
                            VENDA COMPOSTA — você separa {linhasDoSetor(o, setor).length} linha(s){parteConcluida(o, outroSetor(setor)) ? `; o ${outroSetor(setor)} já embalou a dele` : `; o ${outroSetor(setor)} separa as outras`}
                          </Selo></div>
                        )}
                        {(remessasPorOp.get(String(o.id)) || []).length > 0 && (
                          <div className="acn-alm-embalar"><Selo familia="atencao" ponto={false} title="Envio parcial: cada remessa tem o seu frete; a OP só segue quando tudo tiver saído">
                            <Icone path={mdiTruckOutline} size={13} /> ENVIO PARCIAL — {resumoDeRemessas(o, remessasPorOp.get(String(o.id)))}
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
                              {rotuloEmbalar(o)}
                            </Botao>
                          ) : (<>
                          {o.status_almox !== 'Kit OK' && (
                            ehEnvio(o) ? (
                              <Botao variante="primario" pequeno icone={mdiPackageVariantClosed}
                                title="Esta OP não passa por produção: separar, embalar e enviar"
                                onClick={()=>abrirModalEmbalagem(o)}>
                                {rotuloEmbalar(o)}
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
                          <Botao variante="perigo-sec" pequeno icone={mdiArrowULeftTop} title="Devolver para refazer o kit ou para o PCP rever a BOM"
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
                    // Fluxo misto (M2, 27/10/2026): num lote com unidades de produção E de envio, o kit em lote, o "falta material" e o "com pendência" valem só para as de PRODUÇÃO (as de envio são
                    // separadas, embaladas e enviadas uma a uma, cada uma com o seu destino); os números e os botões do lote falam só delas
                    const mistoNoLote = loteTemEnvioEProducao(irmaos);
                    const alvoLote = mistoNoLote ? irmaos.filter(o => !ehUnidadeDeEnvio(o)) : irmaos;
                    const itemAlvo = mistoNoLote ? { ...item, irmaos: alvoLote } : item;
                    const qtdPendente = alvoLote.filter(o => !o.status_almox).length;
                    const qtdKitOk = alvoLote.filter(o => o.status_almox === 'Kit OK').length;
                    const qtdFalta = alvoLote.filter(o => o.status_almox === 'Falta de Material').length;
                    const qtdComPendencia = alvoLote.filter(o => o.status_almox === 'Liberado com Pendencia').length;
                    return (
                      <React.Fragment key={base}>
                        <tr className="acn-linha-marca">
                          <td>{fmtDt(rep.data_entrada)}</td>
                          <td>
                            <LinkLote base={base} currentUser={currentUser} />
                            <div className="acn-alm-lote-selo">
                              <Selo familia="marca" ponto={false}>
                                LOTE — {irmaos.length} unidades
                              </Selo>
                              <SeloFluxosDoLote unidades={irmaos} />
                            </div>
                          </td>
                          <td>—</td>
                          <td><span className="acn-txt-info">{irmaos.length}</span></td>
                          <td className="acn-texto-medio">{rep.tipo_projeto}</td>
                          <td colSpan={2}>
                            <div className="acn-selos">
                              {mistoNoLote && <Selo familia="info" ponto={false} title="As unidades de envio deste lote são separadas e embaladas uma a uma; as ações em lote abaixo valem só para as de produção">{irmaos.length - alvoLote.length} de envio (uma a uma)</Selo>}
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
                                <Botao variante="primario" pequeno icone={mdiTrayArrowDown} disabled={processandoLote} onClick={()=>kitOkLote(itemAlvo)}>
                                  IMPORTAR SERIAIS EM LOTE ({qtdPendente + qtdFalta + qtdComPendencia})
                                </Botao>
                              ))}
                              <Botao variante="perigo-sec" pequeno icone={mdiCloseCircleOutline} disabled={processandoLote} onClick={()=>abrirLoteAcao('falta', itemAlvo)}>
                                FALTA MATERIAL EM LOTE
                              </Botao>
                              <Botao pequeno icone={mdiAlertOutline} disabled={processandoLote} onClick={()=>abrirLoteAcao('pendencia', itemAlvo)}>
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

      {/* Venda composta (T3, 22/10/2026): a parte deste setor já está embalada e a OP espera o outro; enquanto ele não terminar dá para refazer a parte */}
      {aguardandoOutro.length > 0 && (
        <div className="sec-card" data-teste="aguardando-outro-setor">
          <div className="sec-hdr"><span>Minha parte já embalada — aguardando o {outroSetor(setor)} ({aguardandoOutro.length})</span></div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>OP</th><th>Cliente</th><th>Parte embalada</th><th>Aguardando</th><th>Acoes</th></tr></thead>
              <tbody>
                {aguardandoOutro.map(o => {
                  const p = partesEmbaladas(o)[setor] || {};
                  return (
                    <tr key={o.id}>
                      <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                      <td>{o.cliente_nome || '—'}</td>
                      <td className="acn-texto-medio">{diaBR(p.concluida_em)} · {p.por || '—'} · {p.volumes || 1} volume(s), {p.peso_total} kg</td>
                      <td><Selo familia="atencao" ponto={false}>{outroSetor(setor)} separa {linhasDoSetor(o, outroSetor(setor)).length} linha(s)</Selo></td>
                      <td><Botao pequeno variante="perigo-sec" icone={mdiArrowULeftTop} title="Desfazer a parte embalada: a OP volta para a sua fila" onClick={() => refazerMinhaParte(o)}>Refazer a parte</Botao></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Telecom (22/10/2026): só a fila de separar e embalar. Estoque, reposição, fabricação pronta e as demandas do setor não existem para o Telecom por enquanto
          (as demandas e as análises dele vivem na outra aba da tela do Telecom). */}
      {!doTelecom && (<>
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
      </>)}

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

              {/* Venda composta (T3, 22/10/2026): cada setor embala só as linhas dele; o frete é um só */}
              {ehVendaComposta(modalEmbalagem) && (
                <Faixa tom="info">
                  <strong>Venda composta.</strong> Aqui o {setor} separa e embala: {linhasDoSetor(modalEmbalagem, setor).map(l => `${l.quantidade}× ${l.nome}`).join('; ')}.{' '}
                  {parteConcluida(modalEmbalagem, outroSetor(setor))
                    ? `O ${outroSetor(setor)} já embalou a parte dele: ao concluir, nasce o pedido de frete único (peso e volumes somados, as medidas de cada caixa descritas).`
                    : `O ${outroSetor(setor)} ainda não embalou a parte dele: ao concluir, esta OP sai da sua fila e espera; o frete único abre quando ele terminar.`}
                </Faixa>
              )}

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

              {/* Remessa (fatia 5, 14/10/2026): Venda para Envio com mais de uma unidade pode sair em partes. O padrão é o saldo inteiro: enviar tudo de uma vez não muda nada. */}
              {ehVendaEnvioOp(modalEmbalagem) && !ehVendaComposta(modalEmbalagem) && (unidadesDaOp(modalEmbalagem) > 1 || remessasDaOp.length > 0) && (() => {
                const saldo = Math.max(1, saldoDeUnidades(modalEmbalagem, remessasDaOp));
                const n = Math.floor(Number(embForm.unidades));
                const parcial = n >= 1 && n < saldo;
                const ativas = remessasDaOp.filter(r => !r.cancelada);
                return (
                  <div className={'acn-quadro' + (parcial ? ' tom-atencao' : '')} data-teste="quadro-remessa">
                    <div className="acn-quadro-titulo"><Icone path={mdiTruckOutline} size={14} /> Remessa {proximoNumeroDeRemessa(remessasDaOp)}</div>
                    {erroRemessas && <Faixa tom="erro">Não consegui ler as remessas desta OP ({erroRemessas}). Sem isso não dá para saber o que já foi enviado: feche a janela e tente de novo.</Faixa>}
                    <div className="acn-ajuda">
                      {ativas.length ? resumoDeRemessas(modalEmbalagem, remessasDaOp) + '.' : `Esta OP tem ${unidadesDaOp(modalEmbalagem)} unidades.`}
                    </div>
                    {ativas.map(r => (
                      <div key={r.id} className="acn-alm-remessa-linha" data-teste="remessa-anterior">
                        <span><strong>Remessa {r.numero}</strong> — {r.unidades} un. · {diaBR(r.criado_em)} · {r.frete_responsavel === 'FOB' ? 'frete do cliente (FOB)' : r.frete_id ? 'frete aberto' : 'sem frete ligado'}</span>
                        <Botao variante="perigo-sec" pequeno icone={mdiClose} title={`Cancelar a remessa ${r.numero}: as ${r.unidades} unidade(s) voltam ao saldo`} onClick={() => cancelarRemessa(r)}>Cancelar remessa {r.numero}</Botao>
                      </div>
                    ))}
                    <div className="form-group">
                      <label className="acn-label" htmlFor="alm-unidades">Quantas unidades vão nesta remessa? *</label>
                      <input id="alm-unidades" className="acn-input" type="number" min={1} max={saldo} value={embForm.unidades || ''} disabled={!!erroRemessas}
                        onChange={e => setEmbForm(f => ({ ...f, unidades: e.target.value }))} />
                      <div className="acn-ajuda">
                        {parcial
                          ? `Remessa parcial: sobram ${saldo - n} unidade(s) e a OP continua aqui no ${setor} para a próxima remessa.`
                          : `Saldo: ${saldo} unidade(s). Enviando todas, a OP segue para o próximo passo.`}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {ehVendaEnvioOp(modalEmbalagem) ? (
                <div className="acn-alm-bloco">
                  <div className="acn-label">
                    Seriais ACN por produto{ehVendaComposta(modalEmbalagem) && !doTelecom ? '' : ' *'} <span className="acn-ajuda">
                      {ehVendaComposta(modalEmbalagem) && !doTelecom
                        ? '— opcional nesta parte (quem serializa a venda composta é o Telecom). Dá para colar do Excel: produto ⇥ serial.'
                        : `— pelo menos ${Math.max(1, Math.floor(Number(embForm.unidades)) || 1)} (uma por unidade ${(unidadesDaOp(modalEmbalagem) > 1 || remessasDaOp.length > 0) ? 'desta remessa' : 'vendida'}). Dá para colar do Excel: produto ⇥ serial.`}
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
                          onClick={async () => { if (!await confirmarRemocao('esta linha do volume', !(x.produto || x.serial))) return; setEmbForm(f => ({ ...f, itens: f.itens.length > 1 ? f.itens.filter((_, j) => j !== i) : [{ produto:'', serial:'' }] })); }} />
                      </div>
                    ))}
                  </div>
                  <div className="acn-kb-linha">
                    <Botao pequeno onClick={() => setEmbForm(f => ({ ...f, itens: [...(f.itens || []), { produto:'', serial:'' }] }))}>
                      + Linha
                    </Botao>
                    {(() => {
                      const n = (embForm.itens || []).filter(x => String(x.serial || '').trim()).length;
                      const q = Math.max(1, Math.floor(Number(embForm.unidades)) || 1);
                      return <span className={n >= q ? 'acn-txt-ok' : 'acn-txt-atencao'}>{n} de {q} serial(is)</span>;
                    })()}
                  </div>
                </div>
              ) : (<>
              {!conferencia.length && (
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-seriais">Números de série{ehVendaComposta(modalEmbalagem) && !doTelecom ? ' (opcional nesta parte)' : ' *'}</label>
                <textarea id="alm-seriais" className="acn-input" rows={2}
                  value={embForm.seriais||''} onChange={e=>setEmbForm(f=>({...f, seriais:e.target.value}))}
                  placeholder="Um por linha" />
              </div>
              )}
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
                  <label className="acn-label" htmlFor="alm-alt">Altura (cm) *</label>
                  <input id="alm-alt" className="acn-input" value={embForm.altura||''}
                    onChange={e=>setEmbForm(f=>({...f, altura:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-larg">Largura (cm) *</label>
                  <input id="alm-larg" className="acn-input" value={embForm.largura||''}
                    onChange={e=>setEmbForm(f=>({...f, largura:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-comp">Comprimento (cm) *</label>
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

              {/* Endereço completo (15/10/2026): vem preenchido pelo vendedor; com frete CIF a Logística cota por ele. Obrigatório em Venda para Envio. */}
              {embForm.frete_responsavel === 'CIF' && (() => {
                const obrig = exigeEnderecoCompleto(modalEmbalagem?.tipo_projeto, modalEmbalagem?.fluxo_entrega, 'CIF');
                const campo = (id: string, chave: string, rotulo: string, extra: any = {}) => (
                  <div className="form-group">
                    <label className="acn-label" htmlFor={id}>{rotulo}{obrig ? ' *' : ''}</label>
                    <input id={id} className="acn-input" value={embForm[chave] || ''} {...extra}
                      onChange={e => setEmbForm(f => ({ ...f, [chave]: e.target.value }))} />
                  </div>
                );
                return (
                  <>
                    <div className="acn-quadro-titulo acn-alm-secao">Endereço de entrega (a Logística cota o frete com ele)</div>
                    <div className="form-row">
                      {campo('alm-rua', 'destino_logradouro', 'Rua')}
                      {campo('alm-num', 'destino_numero', 'Número')}
                      {campo('alm-bairro', 'destino_bairro', 'Bairro')}
                    </div>
                    <div className="form-row">
                      {campo('alm-compl', 'destino_complemento', 'Complemento', { placeholder: 'Se não houver: sem complemento' })}
                      {campo('alm-dest', 'destino_destinatario', 'Quem recebe')}
                      {campo('alm-tel', 'destino_telefone', 'Telefone de quem recebe', { inputMode: 'tel', placeholder: '(00) 00000-0000' })}
                    </div>
                  </>
                );
              })()}

              <ConferenciaKit linhas={conferencia} onChange={setConferencia} saldos={saldosKit} semEstoque={doTelecom} comSerial={!ehVendaEnvioOp(modalEmbalagem)} opl={modalEmbalagem} setor={setor} />
              {/* o serial de cada item vai na linha dele (coluna Serial da separação, logo acima); esta caixa é só para serial de algo que NÃO está na lista (e guarda o texto de OPs antigas) */}
              {conferencia.length > 0 && !ehVendaEnvioOp(modalEmbalagem) && (
                <div className="form-group">
                  <label className="acn-label" htmlFor="alm-seriais">Outros números de série (de algo que não está na lista de separação){ehVendaComposta(modalEmbalagem) && !doTelecom ? ' — opcional' : ' — opcional se já informou nos itens'}</label>
                  <textarea id="alm-seriais" className="acn-input" rows={2}
                    value={embForm.seriais||''} onChange={e=>setEmbForm(f=>({...f, seriais:e.target.value}))}
                    placeholder="Um por linha" />
                </div>
              )}
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
                {(() => {
                  // venda composta (T3): o primeiro setor só registra a parte dele; o frete único abre quando o último terminar
                  if (ehVendaComposta(modalEmbalagem) && !parteConcluida(modalEmbalagem, outroSetor(setor))) {
                    return salvandoEmb ? 'Salvando...' : `Registrar a minha parte (o frete único abre quando o ${outroSetor(setor)} terminar)`;
                  }
                  // remessa parcial (fatia 5): a OP não anda; só nasce a remessa (e o frete dela, se CIF)
                  const n = Math.floor(Number(embForm.unidades));
                  const parcialBtn = ehVendaEnvioOp(modalEmbalagem) && n >= 1 && n < Math.max(1, saldoDeUnidades(modalEmbalagem, remessasDaOp));
                  return salvandoEmb ? 'Salvando...'
                    : parcialBtn ? (embForm.frete_responsavel === 'FOB' ? 'Registrar remessa (frete do cliente)' : 'Registrar remessa e solicitar frete')
                    : embForm.frete_responsavel === 'FOB' ? 'Finalizar e liberar para o Comercial'
                    : 'Finalizar e solicitar frete';
                })()}
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
                Informe o número de série de cada equipamento na linha do próprio item (coluna Serial) antes de liberar para o PCP. O produto já sai do Almoxarifado com o serial aplicado.
              </div>
              <ConferenciaKit linhas={conferencia} onChange={setConferencia} saldos={saldosKit} comSerial opl={modalSeriais} setor={setor} />
              <ChecklistPendencias op={modalSeriais} vinculos={pendenciasDe(modalSeriais).map(p => ({ ...p, grupo: 'demanda' }))}
                modo="almox" currentUser={currentUser}
                onMudou={(novo) => setModalSeriais(m => ({ ...m, pendencias_kit: novo }))} />
              {/* o serial de cada item vai na linha dele (coluna Serial); esta caixa é só para serial de algo que NÃO está na lista (e guarda o texto de OPs antigas) */}
              <div className="form-group">
                <label className="acn-label" htmlFor="alm-seriais-kit">{conferencia.length ? 'Outros números de série (de algo que não está na lista acima) — opcional' : 'Números de série dos equipamentos instalados *'}</label>
                <textarea id="alm-seriais-kit" autoFocus={!conferencia.length} className="acn-input acn-alm-mono" rows={conferencia.length ? 2 : 3}
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
        <ModalDevolverOp opl={modalDevolver} setorOrigem={setor} currentUser={currentUser}
          // refazer o kit só faz sentido se já houve kit; senão, só o PCP (18e, 13/10/2026: a BOM agora é dele, a Engenharia não recebe mais OP).
          // Telecom (22/10/2026): não há "kit" a refazer (sem estoque nem conferência), então a devolução é sempre para o PCP rever.
          destinos={!doTelecom && (modalDevolver.status_almox === 'Kit OK' || modalDevolver.status_geral === STATUS_EMBALAGEM || modalDevolver.status_almox) ? ['almox', 'pcp'] : ['pcp']}
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
