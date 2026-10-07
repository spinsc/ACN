// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { contentTypeUpload } from './FormatosArquivo';
import { ColaboradorSelect } from './ColaboradorSelect';
import { ClienteAutocomplete } from './ClienteUtils';
import ContactosSection from './ContactosSection';
import Linkify from './Linkify';
import CrmAnexosWidget from './CrmAnexosWidget';
import { ModalSolicitarAnalise, AnaliseStatusBadge, AnaliseStatusPanel } from './AnaliseWidget';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import RichTextInput, { pareceHtmlFormatado } from './RichTextInput';
import NovaOpOsModal from './NovaOpOsModal';
import OplAnexosWidget from './OplAnexosWidget';
import OplAcompModal from './OplAcompModal';
import { OplDetalheModal, LinkOpl, dividirValorEmUnidades, VeiculoOuEnvio } from './AcnTabShared';
import { ModalEditarOplLote, podeEditarOplCompleta, ModalOplComercial } from './OplEdicao';
import { itensDaFormacao } from './OpItens';
import { CotacoesCrmPanel } from './CotacoesTab';
import { logChange, useUnreadChanges, useUnreadMap, useMarkAsRead } from './AuditSystem';
import FormacaoPrecosTab from './FormacaoPrecosTab';
import { useAlturaDeCards } from './KanbanColuna';
import { useCelular, useToque, SeletorEtapas, etapaInicial } from './Celular';
import { useModoSplit, estilosSplit, SeletorModoSplit } from './ModoSplit';
import AgendaWidget from './AgendaWidget';
import { notificarEvento, msg } from './whatsappHelper';
import { abrirVinculo, VinculoPicker } from './VinculoPicker';
import { ModalSolicitarCompra } from './SolicitacaoCompra';
import { carregarMarkupPorProcesso, carregarBandasMarkupPorTipo, MarkupBadge, MarkupBarraDistribuicao, TIPOS_NEGOCIO_CRM, BANDA_MARKUP_PADRAO } from './MarkupTermometro';
import { CabecalhoTela, Abas, Chips, Botao, MenuAcoes, Faixa, Selo, Tag, hojeISO } from './Interface';
import Icone from './Icone';
import { mdiUpdate, mdiFolderOpenOutline, mdiClipboardTextOutline, mdiWrenchOutline, mdiPlus, mdiPackageVariantClosed, mdiLinkVariant,
  mdiRestore, mdiGavel, mdiTrashCanOutline, mdiChevronUp, mdiChevronDown, mdiPencilOutline, mdiViewColumnOutline, mdiCalendarMonthOutline,
  mdiHistory, mdiChartBar, mdiCashMultiple, mdiCardAccountDetailsOutline, mdiClose, mdiCalendarClockOutline,
  mdiBankOutline, mdiAccountOutline, mdiCalendarOutline, mdiClockOutline,
  mdiTimerSand, mdiCheck, mdiBriefcaseOutline, mdiPinOutline, mdiFormatBold, mdiFormatItalic, mdiImageOutline, mdiContentSaveOutline,
  mdiPhoneOutline, mdiDomain, mdiAlertOutline,
  mdiTrafficLight, mdiCar, mdiCommentTextOutline, mdiUndoVariant, mdiCheckCircleOutline, mdiRefresh, mdiSendOutline, mdiSelectionOff,
  mdiTrophyOutline, mdiThermometer, mdiLockOutline, mdiCloseCircleOutline, mdiCancel } from '@mdi/js';
import { normalizarBusca, combinaBusca } from './SearchUtils';
import { fluxoLabel, soEnvio, STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, aguardaLiberacaoComercial } from './FluxoEntrega';
import { podeAlterarNumeroOplPv, perfilComPoderes } from './utils/permissoes';
import { renomearOpl } from './RenomearOpl';
import { origemDeOportunidade } from './OrigemVenda';
import { GruposLoteMisto, grupoInicial, validarGrupos, unidadesDosGrupos, type GrupoLote } from './LoteMisto';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { OndeEstaCelula } from './OndeEstaAgora';
import { desdeQuandoEmLote, desdeQuandoDaLista, COLUNAS_MARCOS_OP, diasDesde, textoDias, resumoDasOps } from './EtapasOp';
import { indicePendencias, travaConclusaoProducao } from './OpPendencias';
import { VeiculoDaOp } from './VeiculoCadastro';
import { centroDisponivel } from './CentroCustoShared';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtMoeda = (v: number | null) =>
  v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
// Valor cru do banco (número JS, ponto decimal) -> string editável no padrão
// brasileiro (vírgula decimal), pro <input> de valor nunca mostrar/receber um
// "1234.56" que o parser de salvar (que espera formato digitado por humano,
// "." = milhar / "," = decimal) interpretaria errado.
const fmtValorEdit = (v: number | string | null | undefined) =>
  v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (v: string | null) =>
  v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const diasAte = (v: string | null) => {
  if (!v) return null;
  return Math.ceil((new Date(v + 'T12:00:00').getTime() - Date.now()) / 86400000);
};
// Classificação explícita por crm_estagios_funil.tipo — não depende mais de
// adivinhar pelo nome do estágio (que quebrava toda vez que um estágio era
// renomeado). Mantém fallback por nome só pra estágios de outro funil
// (licitação) que ainda não têm `tipo` preenchido.
const isGanho       = (e: any) => e?.tipo === 'ganho'       || (!e?.tipo && /vencida|convertida/.test(e?.nome?.toLowerCase()||'') && !/não|nao /.test(e?.nome?.toLowerCase()||''));
const isFaturado    = (e: any) => e?.tipo === 'faturado';
const isDesistencia = (e: any) => e?.tipo === 'desistencia' || (!e?.tipo && e?.nome?.toLowerCase().includes('desist'));
const isFinalizada  = (e: any) => e?.tipo === 'faturado'    || (!e?.tipo && e?.nome?.toLowerCase().includes('finaliz'));
const isPerdido     = (e: any) => e?.tipo === 'perdido'     || (!e?.tipo && e?.is_final && !isGanho(e) && !isDesistencia(e) && !isFinalizada(e));

const VAZIO_OP: any = {
  funil: 'venda_direta',
  tipo_licitacao: 'ordinaria',
  titulo: '',
  numero_edital: '',
  orgao: '',
  data_sessao: '',
  hora_sessao: '',
  data_validade_ata: '',
  sub_status: 'andamento',
  empresa_vencedora: '',
  valor_registrado: '',
  valor_acn: '',
  numero_pv: '',
  faturamento_empresa: 'ACN',
  cliente_id: null,
  _cliente_nome: '',   // campo temporário — não vai para o banco
  estagio_id: '',
  responsavel_id: null,
  responsavel_nome: '',
  motivo_perda: '',
  // ── contato ──
  nome_contato:   '',
  contato:        '',  // telefone
  contato_email:  '',
  prox_contato:      '',
  hora_prox_contato: '',
  // ── quadro Lead (Fase 2) ──
  data_aceite_cliente:     '',
  cliente_final:           '',
  numero_proposta:         '',
  veiculo_modelo:          '',
  quantidade:              '',
  local_instalacao:        '',
  data_chegada_veiculo:    '',
  prazo_entrega_producao:  '',
  prazo_entrega_comercial: '',
  ctrl_ordem_servico:        '',
  ctrl_relatorio_fotografico:'',
  ctrl_nao_conformidades:    '',
  ctrl_desenhos:              '',
  ctrl_melhorias:             '',
  ctrl_pop:                   '',
  ctrl_protocolo_viagem:      '',
  ctrl_controle:              '',
  ctrl_data_entrada:          '',
  ctrl_data_saida:            '',
  ctrl_prazo_garantia:        '12 MESES',
};

const VAZIO_VENDA: any = {
  orgao_aderente: '',
  cliente_id: null,
  descricao: '',
  quantidade: '',
  valor_unitario: '',
  valor_total: '',
  status_faturamento: 'pendente',
  numero_nf: '',
  data_faturamento: '',
  operador_id: null,
  operador_nome: '',
  opl_id: null,
  numero_op: '',   // formato XXXX.XXXX
  observacoes: '',
};

// Mesma lista usada na criacao de OP (NovaOpOsModal.tsx) - so os rotulos, que
// e o que fica gravado em oples.tipo_projeto.
const TIPOS_PROJETO_OPL = [
  'Transformacao Veicular Ostensiva',
  'Transformacao Veicular Discreta',
  'Radio',
  'Modulo Expansivel',
  'Venda para Envio',
  'Flutuante',
  'Manutencao',
  'Garantia',
  'Orcamento',
  'Demanda Direta para Engenharia',
  'Reboque',
];


// Monta o estado editável (formOp) a partir de uma linha crua do banco —
// usado em todo lugar que abre o modal de oportunidade, pra garantir que
// valor_registrado/valor_acn sempre entrem no <input> já formatados em
// pt-BR (ver fmtValorEdit acima).
const formOpFromOp = (op: any) => ({
  ...VAZIO_OP, ...op,
  valor_registrado: fmtValorEdit(op?.valor_registrado),
  valor_acn:        fmtValorEdit(op?.valor_acn),
});

// Máscara de formato XXXX.XXXX para número de OP
function mascaraOp(valor: string): string {
  const num = valor.replace(/\D/g, '').slice(0, 8);
  if (num.length <= 4) return num;
  return num.slice(0, 4) + '.' + num.slice(4);
}

// MMAA do mês/ano atual (usado na numeração da OP gerada a partir do PV)
// Padrão do número da OP: A (ACN) ou D (Detech) + PV + "." + ano + mês (ex.: A1651.2609)
function mmaaAtual(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aa = String(d.getFullYear()).slice(-2);
  return aa + mm;
}

// Número da OP a partir do PV: A/D + 4 dígitos do PV + . + MMAA
function numOpDePv(empresa: 'ACN'|'DETECH', numeroPv: string): string {
  const letra = empresa === 'ACN' ? 'A' : 'D';
  return `${letra}${(numeroPv || '').padStart(4, '0')}.${mmaaAtual()}`;
}

// Mesma máscara XXXX.XXXX, mas preserva um prefixo A/D (OP gerada a partir de PV)
function mascaraOpComLetra(valor: string): string {
  const letraMatch = valor.match(/^[AD]/i);
  const letra = letraMatch ? letraMatch[0].toUpperCase() : '';
  return letra + mascaraOp(valor.slice(letra.length));
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL COTAÇÕES DENTRO DO CARD CRM
// Wrapper local que carrega config de visibilidade e delega ao CotacoesCrmPanel
// ─────────────────────────────────────────────────────────────────────────────
function CotacoesCrmPanelCrm({ oportunidadeId, currentUser }) {
  const [cfg, setCfg] = React.useState({ verCustos: false, verFornec: false, verMarkup: false });
  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(perfilComPoderes(currentUser));

  React.useEffect(() => {
    supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['cotacoes_ver_custos_margens','cotacoes_ver_fornecedores','cotacoes_ver_markup'])
      .then(({ data }) => {
        if (data) {
          const m = Object.fromEntries(data.map(r => [r.chave, r.valor === 'true']));
          setCfg({
            verCustos: m['cotacoes_ver_custos_margens'] || false,
            verFornec: m['cotacoes_ver_fornecedores']   || false,
            verMarkup: m['cotacoes_ver_markup']         || false,
          });
        } else {
          setCfg({ verCustos: false, verFornec: false, verMarkup: false });
        }
      });
  }, [isAdmin]);

  return (
    <CotacoesCrmPanel
      oportunidadeId={oportunidadeId}
      currentUser={currentUser}
      verCustos={cfg.verCustos}
      verFornec={cfg.verFornec}
      verMarkup={cfg.verMarkup}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmTab({ currentUser, autoOpenOpId, onAutoOpenConsumed }: { currentUser: any; autoOpenOpId?: string|null; onAutoOpenConsumed?: () => void }) {
  // ── permissões ──
  const pcrm = currentUser?.permissoes_crm || [];
  const podeVerTotais       = pcrm.includes('totais_vendas')        || currentUser?.perfil === 'Admin';
  const podeVerFaturamentos = pcrm.includes('painel_faturamentos')  || currentUser?.perfil === 'Admin';
  const podeVerRelatorio    = pcrm.includes('relatorio_vendedores') || currentUser?.perfil === 'Admin';
  const podeVer             = podeVerTotais && currentUser?.ver_valores !== false;

  // ── estado principal ──
  const [secaoCrm, setSecaoCrm]     = useState<'funil'|'contatos'>('funil');
  const [funil, setFunil]           = useState<'licitacao'|'venda_direta'>('venda_direta');
  const [estagios, setEstagios]     = useState<any[]>([]);
  const [ops, setOps]               = useState<any[]>([]);
  const [itens, setItens]           = useState<any[]>([]);
  const [progresso, setProgresso]   = useState<any[]>([]);
  const [vendas, setVendas]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState('');
  const [abaInterna, setAbaInterna] = useState<'kanban'|'faturamentos'|'opls'|'relatorio'|'agenda'|'recentes'>('kanban');
  // Celular: kanban mostra uma etapa por vez e o card muda de etapa por "Mover para…" (sem arrastar)
  const celular = useCelular();
  const toque = useToque(); // celular ou tablet: sem arrastar
  const [etapaCel, setEtapaCel] = useState<string | null>(null);
  const [recentesCrm, setRecentesCrm] = useState<any[]>([]);
  const [recentesCrmLoading, setRecentesCrmLoading] = useState(false);
  const [oplsEmAberto, setOplsEmAberto] = useState<any[]>([]);
  // Quem devolveu cada OP parada em "Devolvida Comercial", e quando (id da OP ->
  // linha do log). É daí que sai o destino do reenvio — ver reenviarDevolvida.
  const [devolucoesOpl, setDevolucoesOpl] = useState<Record<string, any>>({});
  const [oplsLoading, setOplsLoading]   = useState(false);
  const [oplsFiltro, setOplsFiltro]     = useState<'todos'|'crm'|'sem_crm'>('todos');
  const [filtStatusOpl, setFiltStatusOpl] = useState('');
  // "Onde está / desde quando" de cada OP em aberto (Etapa 6.2 do PLANO_UX_FLUXO_TRABALHO.md,
  // 29/09/2026): id da OP -> desde quando; e as pendências de fabricação/compra que ainda
  // seguram cada uma. A ordem "parada há mais tempo" usa o primeiro.
  const [desdeOpls, setDesdeOpls] = useState<Record<string, any>>({});
  const [pendenciasOpls, setPendenciasOpls] = useState<Record<string, any[]>>({});
  const [oplsOrdem, setOplsOrdem] = useState<'entrada'|'parada'>('entrada');
  // OPs desmembradas (mesmo numero base, sufixo /01../NN) agrupadas numa
  // linha de lote — mesmo padrao de EngenhariaTab.tsx / AlmoxarifadoTab.tsx.
  const [lotesExpandidosOpls, setLotesExpandidosOpls] = useState<Record<string,boolean>>({});
  const [oplEditando, setOplEditando]   = useState<any|null>(null);   // OPL sendo editada
  const [oplAcomp, setOplAcomp]         = useState<any|null>(null);   // OPL com acompanhamento aberto
  const [oplFormEdit, setOplFormEdit]   = useState<any>({});
  const [oplSalvando, setOplSalvando]   = useState(false);
  // Seleção livre por checkbox (não precisa ser do mesmo lote/base) — ação
  // em massa: Liberar Fiscal e Confirmar Entrega, mesmo padrão do
  // ProducaoTab.tsx (Iniciar Produção/Liberar CQ em lote).
  const [oplsSelecionadas, setOplsSelecionadas] = useState<Set<string>>(new Set());
  // Admin/Gerente: alterar um campo (qualquer um, inclusive status) nas OPs marcadas
  const [editarLoteOpls, setEditarLoteOpls] = useState<any[] | null>(null);
  const abrirEditarLoteOpls = async () => {
    const { data, error } = await supabase.from('oples').select('*').in('id', [...oplsSelecionadas]);
    if (error) { alert('Não foi possível carregar as OPs: ' + error.message); return; }
    setEditarLoteOpls([...(data || [])].sort((a: any, b: any) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true })));
  };
  const toggleOplSelecionada = (id: string) => setOplsSelecionadas(prev => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const [aplicandoLoteOpls, setAplicandoLoteOpls] = useState(false);
  const [modalEntregaLote, setModalEntregaLote] = useState<any[]|null>(null); // OPLs selecionadas p/ confirmar entrega
  const [nomeRecebeuLote, setNomeRecebeuLote] = useState('');

  // Lançamento em lote de chassi/placa/CNPJ por unidade desmembrada
  const [modalLote, setModalLote]       = useState<any[]|null>(null); // irmaos do lote sendo editado
  const [loteForm, setLoteForm]         = useState<Record<string,any>>({}); // id -> {chassi,placa,cnpj_faturamento,razao_social_faturamento}
  const [loteColar, setLoteColar]       = useState('');
  const [loteSalvando, setLoteSalvando] = useState(false);

  // ── drag & drop ──
  const [dragging, setDragging]     = useState<string|null>(null);
  const [dragOver, setDragOver]     = useState<string|null>(null);
  const [dragOverItem, setDragOverItem] = useState<string|null>(null); // card sob o cursor (reorder)

  // ── modais ──
  const [modalOp, setModalOp]               = useState<any|null>(null);
  const [modalGate, setModalGate]           = useState<any|null>(null);
  const [modalConverter, setModalConverter] = useState<any|null>(null);
  const [modalConverterLicit, setModalConverterLicit] = useState<any|null>(null); // converter venda direta → licitação/ATA
  const [modalMotivo, setModalMotivo]         = useState<any|null>(null);
  const [modalDesist, setModalDesist]         = useState<any|null>(null);
  const [modalEmpresaVenc, setModalEmpresaVenc] = useState<any|null>(null);
  const [desistTexto, setDesistTexto]         = useState('');
  // ── gate Enviado: PV + temperatura + contato obrigatório ──
  const [modalEnviado, setModalEnviado]       = useState<any|null>(null); // {op, estagioDestId}
  const [pvTexto, setPvTexto]                 = useState('');
  const [temperaturaSel, setTemperaturaSel]   = useState<''|'frio'|'morno'|'quente'>('');
  const [enviadoContatoData, setEnviadoContatoData] = useState('');
  const [enviadoContatoHora, setEnviadoContatoHora] = useState('');
  const [salvandoEnviado, setSalvandoEnviado] = useState(false);
  // ── vincular PV/oportunidade a um processo licitatório (estágio Vencido) ──
  const [modalVincularLicit, setModalVincularLicit] = useState<any|null>(null); // op
  const [buscaVincularLicit, setBuscaVincularLicit] = useState('');
  const [resultVincularLicit, setResultVincularLicit] = useState<any[]>([]);
  // ── gate Faturado: bloqueia até a OP vinculada estar status_geral='Faturado' ──
  const [avisoFaturadoBloq, setAvisoFaturadoBloq] = useState<any|null>(null); // {op, oplsPendentes}
  // ── editar temperatura do lead a qualquer momento (não só no gate Enviado) ──
  const [modalEditarTemp, setModalEditarTemp] = useState<any|null>(null); // op
  const [tempEditSel, setTempEditSel]         = useState<''|'frio'|'morno'|'quente'>('');
  const [salvandoTempEdit, setSalvandoTempEdit] = useState(false);
  const [modalVenda, setModalVenda]         = useState<any|null>(null);
  const [tipoConverter, setTipoConverter]   = useState<'op'|'os'>('op');
  const [numOp, setNumOp]                   = useState('');
  const [resumoConv, setResumoConv]         = useState('');
  const [loteMistoConv, setLoteMistoConv]   = useState(false);        // adaptações diferentes por veículo
  const [gruposConv, setGruposConv]         = useState<GrupoLote[]>(grupoInicial(1));
  const [qtdVeiculosConv, setQtdVeiculosConv] = useState(1);
  const [veiculosConv, setVeiculosConv]     = useState<{chassi:string,placa:string}[]>([]);
  // ── compras ──
  const [modalCompras, setModalCompras]     = useState<any|null>(null); // op para criar pedido compra
  const [centrosCusto, setCentrosCusto]     = useState<any[]>([]); // cadastrados em Admin > Centros de Custo
  const [pedidosCompra, setPedidosCompra]   = useState<any[]>([]);
  // { pct ponderado pelo custo, min, max } por processo — ver MarkupTermometro
  const [markupPorOp, setMarkupPorOp]       = useState<Record<string, any>>({});
  // Cortes de markup por tipo de negócio (Revenda/Venda/Pós-vendas), configurados
  // em Admin → Faixas de Markup — ver MarkupTermometro.carregarBandasMarkupPorTipo
  const [bandasMarkup, setBandasMarkup]     = useState<Record<string, any>>({});
  // ── solicitar análise ──
  const [modalSolicitarAnalise, setModalSolicitarAnalise] = useState<any|null>(null); // op selecionada
  // ── andamento ──
  const [modalAndamento, setModalAndamento] = useState<any|null>(null); // op selecionada
  const [andamentoHistorico, setAndamentoHistorico] = useState<any[]>([]);
  const [novoAndamento, setNovoAndamento]   = useState('');
  const [salvandoAndamento, setSalvandoAndamento] = useState(false);
  const [motivoTexto, setMotivoTexto]       = useState('');
  const [formOp, setFormOp]                 = useState({ ...VAZIO_OP });
  const [formVenda, setFormVenda]           = useState({ ...VAZIO_VENDA });
  const [salvando, setSalvando]             = useState(false);
  const [filtFat, setFiltFat]               = useState<'todos'|'pendente'|'faturado'>('todos');
  const [filtFunil, setFiltFunil]           = useState<'todos'|'licitacao'|'venda_direta'>('todos');
  const [filtResp, setFiltResp]             = useState('');
  const [filtTemp, setFiltTemp]             = useState<''|'frio'|'morno'|'quente'>('');
  const [filtTipoNegocio, setFiltTipoNegocio] = useState('');
  // Filtro de mês dos cartões de pipeline (Em Negociação/Perdidas/Ganhas/
  // Aguardando Faturamento) — formato 'YYYY-MM', vazio = todos os meses.
  const [mesFiltroPipeline, setMesFiltroPipeline] = useState('');
  // ── cards colapsados (Set de IDs) ──
  const [cardsExpandidos, setCardsExpandidos] = useState<Set<string>>(new Set());
  // ── modal Nova OP/OS ──
  const [modalNovaOpOs, setModalNovaOpOs]   = useState<{ crmCard?: any } | null>(null);
  // Números das OPs já ligadas a cada card (id do card -> ['A1234.0926', ...]).
  // Serve para o card mostrar que a OP já existe e o menu não oferecer "Lançar
  // OP" como se ainda não houvesse — achado A4 do PLANO_UX_FLUXO_TRABALHO.md.
  const [oplsPorCard, setOplsPorCard]       = useState<Record<string, string[]>>({});
  // O mesmo, com o que o selo do card precisa para dizer "onde está": id, status e desde
  // quando (id do card -> OPs). Chega depois do selo simples, porque o "desde quando" vem de
  // uma função do banco (Etapa 6.3 do PLANO_UX_FLUXO_TRABALHO.md, 29/09/2026).
  const [oplsInfoPorCard, setOplsInfoPorCard] = useState<Record<string, any[]>>({});

  // ── modal ABRIR (split-screen CRM) ──
  const [modalAbrir, setModalAbrir]         = useState<any|null>(null);
  const [abrirTabDir, setAbrirTabDir]       = useState<string>('andamento');
  // Formação de Preços do card continua montada (escondida) depois de aberta —
  // trocar de aba desmontava e a edição ainda não salva (ex.: markup) sumia.
  const [formacaoMontadaId, setFormacaoMontadaId] = useState<string | null>(null);
  // OPs geradas a partir desta oportunidade (PV) — botão no card aberto leva até elas
  const [oplsDoCard, setOplsDoCard] = useState<any[]>([]);
  const [oplDoCardAberta, setOplDoCardAberta] = useState<any | null>(null);
  const [abrirDocs, setAbrirDocs]           = useState<any[]>([]);
  const [abrirAndamentoHist, setAbrirAndamentoHist] = useState<any[]>([]);
  const [abrirNovoText, setAbrirNovoText]   = useState('');
  const [abrirUploadFile, setAbrirUploadFile] = useState<File|null>(null);
  const [abrirUploadDesc, setAbrirUploadDesc] = useState('');
  const [abrirSalvandoDoc, setAbrirSalvandoDoc] = useState(false);
  const abrirUploadRef = useRef<HTMLInputElement>(null);
  const abrirNotaRef  = useRef<HTMLDivElement>(null);
  const abrirNotaImgRef = useRef<HTMLInputElement>(null);
  const [abrirNotaSalvando, setAbrirNotaSalvando] = useState(false);
  // ── resize + minimize do modal Abrir ──
  const [abrirLeftWidth, setAbrirLeftWidth]   = useState(42);
  // dividido / só formulário / só abas — ver ModoSplit.tsx (esconde sem desmontar)
  const [abrirModoSplit, setAbrirModoSplit]   = useModoSplit('crm');
  const abrirEstSplit = estilosSplit(abrirModoSplit, abrirLeftWidth, 280);
  const [abrirIsDragging, setAbrirIsDragging] = useState(false);
  const [abrirMinimized, setAbrirMinimized]   = useState(false);
  const abrirContainerRef = useRef<any>(null);
  const abrirDragStartX   = useRef(0);
  const abrirDragStartW   = useRef(0);

  // 7.62 (07/10/2026): leitura que falha não pode parecer "tela vazia" — cada uma guarda o motivo e a tela mostra uma faixa com "Tentar de novo"
  const [erroCarga, setErroCarga]           = useState('');   // o quadro (estágios, oportunidades, checklist, vendas)
  const [erroOpls, setErroOpls]             = useState('');   // a lista "OPs em aberto"
  const [erroAbrir, setErroAbrir]           = useState('');   // andamento/documentos do card aberto
  const [erroNota, setErroNota]             = useState('');   // a nota livre do card aberto — sem lê-la, salvar apagaria a que existe
  const [erroAndamentoModal, setErroAndamentoModal] = useState('');   // a janela "Atualizar andamento"
  const [erroRecentes, setErroRecentes]     = useState('');
  const [erroVincular, setErroVincular]     = useState('');
  // uma ação por vez nos botões que gravam: o estado "salvando" só muda no desenho seguinte e o clique duplo gravava duas vezes
  const emAcao = useRef(new Set<string>());
  const umaVez = (chave: string, fn: (...a: any[]) => Promise<any>) => async (...args: any[]) => {
    if (emAcao.current.has(chave)) return undefined;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  // ── auditoria/colaboração (POC — infraestrutura global, ver AuditSystem.tsx) ──
  const { camposNaoLidos, naoLidos } = useUnreadChanges('crm_oportunidades', modalAbrir?.id, currentUser);
  // Um item de lista (comentário, documento) é "não lido" se existe uma linha em
  // audit_log com metadata.ref_id apontando pro id dele — ver salvarAbrirAndamento/
  // salvarAbrirDoc, que gravam esse vínculo no momento de salvar.
  const itemNaoLido = (itemId: string) => naoLidos.some((n: any) => n.metadata?.ref_id === itemId);
  const marcarComoLido = useMarkAsRead('crm_oportunidades', modalAbrir?.id, currentUser);
  const fecharModalAbrir = () => {
    marcarComoLido();
    if (modalAbrir?.id) marcarCardLidoLocal(modalAbrir.id); // some o destaque do card na hora, sem esperar reload
    setModalAbrir(null); setAbrirMinimized(false);
  };
  // Caixa de destaque sutil em volta do campo inteiro (rótulo + input) quando ele
  // mudou e ainda não foi visto por este usuário — sempre com a mesma borda/padding
  // (transparente quando não destacado) pra não pular o layout ao ler.
  const campoDestaque = (field: string): React.CSSProperties => ({
    marginBottom: 7, borderRadius: 5, padding: '4px 6px', margin: '0 -6px 7px -6px',
    background: camposNaoLidos.has(field) ? '#fefce8' : 'transparent',
    border: `1px solid ${camposNaoLidos.has(field) ? '#fde047' : 'transparent'}`,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('crm_estagios_funil').select('*').order('ordem'),
      supabase.from('crm_oportunidades').select('*').order('posicao', { ascending: true }).order('criado_em', { ascending: false }),
      supabase.from('crm_checklist_itens').select('*').order('ordem'),
      supabase.from('crm_checklist_progresso').select('*'),
      supabase.from('crm_vendas').select('*').order('criado_em', { ascending: false }),
    ]);
    // 7.62: a leitura que falhava virava lista vazia — o quadro aparecia sem cartão nenhum, como se não houvesse oportunidade. Agora a lista que
    // já estava na tela fica, e a faixa diz o motivo.
    const falhou = [r1, r2, r3, r4, r5].find(r => r.error);
    if (falhou) { setErroCarga(falhou.error.message); if (!silent) setLoading(false); return; }
    setErroCarga('');
    setEstagios(r1.data || []);
    setOps(r2.data || []);
    setItens(r3.data || []);
    setProgresso(r4.data || []);
    setVendas(r5.data || []);
    // Carrega pedidos de compra vinculados ao CRM
    const { data: pcData, error: errPc } = await supabase
      .from('pcp_pedidos_compra')
      .select('*')
      .not('oportunidade_id','is',null);
    if (!errPc) setPedidosCompra(pcData || []);
    // OPs já lançadas a partir de cada card (uma consulta só para a tela inteira)
    const { data: oplsDosCards, error: errOplsCards } = await supabase
      .from('oples').select('id,opl,status_geral,crm_oportunidade_id,' + COLUNAS_MARCOS_OP).not('crm_oportunidade_id', 'is', null).order('opl');
    if (errOplsCards) { carregarMarkupPorProcesso('crm').then(setMarkupPorOp); carregarBandasMarkupPorTipo().then(setBandasMarkup); if (!silent) setLoading(false); return; }   // mantém o selo de OP que já estava nos cards
    const porCard: Record<string, string[]> = {};
    (oplsDosCards || []).forEach((o: any) => {
      const k = String(o.crm_oportunidade_id);
      (porCard[k] = porCard[k] || []).push(o.opl);
    });
    setOplsPorCard(porCard);
    // "Onde está" de cada OP dos cards: fora do caminho principal (não atrasa a tela; o selo
    // simples aparece antes e ganha o setor e os dias quando a função do banco responde).
    // Encerradas não precisam de "desde quando".
    const abertasDosCards = (oplsDosCards || []).filter((o: any) => !['Faturado', 'Cancelado'].includes(o.status_geral));
    desdeQuandoEmLote(abertasDosCards.map((o: any) => o.id)).then(eventos => {
      const info: Record<string, any[]> = {};
      (oplsDosCards || []).forEach((o: any) => {
        const k = String(o.crm_oportunidade_id);
        (info[k] = info[k] || []).push({ id: o.id, opl: o.opl, status_geral: o.status_geral, desde: desdeQuandoDaLista(o, eventos.get(String(o.id))) });
      });
      setOplsInfoPorCard(info);
    }).catch(e => console.error('Selo "onde está" dos cards:', e));
    // Termômetro de markup — busca em lote (1x por tela), não bloqueia o load principal
    carregarMarkupPorProcesso('crm').then(setMarkupPorOp);
    carregarBandasMarkupPorTipo().then(setBandasMarkup);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    // Etapa 15a (05/10/2026): só os que recebem lançamento e estão na vigência (o código já gravado na OP continua aparecendo no campo)
    supabase.from('centros_custo').select('codigo,nome,ativo,recebe_lancamento,vigencia_inicio,vigencia_fim').eq('ativo', true).order('codigo')
      .then(({ data }) => setCentrosCusto((data || []).filter(centroDisponivel)));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('crm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_oportunidades' }, ()=>load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_vendas' }, ()=>load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { setAbaInterna('kanban'); }, [funil]);

  // Auto-abrir card quando navegado da aba Telecom (ou outro setor) via analise:abrir-origem
  useEffect(() => {
    if (!autoOpenOpId || loading || ops.length === 0) return;
    const op = ops.find((o: any) => o.id === autoOpenOpId);
    if (op) {
      setFormOp(formOpFromOp(op));
      setModalAbrir(op);
      setAbrirTabDir('analise');  // abre direto na aba de Análise
      setAbrirNovoText('');
      onAutoOpenConsumed?.();
    }
  }, [autoOpenOpId, loading, ops]);

  // Deep-link genérico (Menções, Chat — "Oportunidade X" clicável, contexto
  // 'crm' -- mesmo contexto já gravado pelas @menções do Andamento CRM, ver
  // salvarMencoes acima) — mesmo padrão já usado em ComprasTab/SetorDemandaTab/
  // etc, que faltava aqui: abre o card direto (mesmo modal que abre ao clicar
  // no card do Kanban) em vez de só cair na aba.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'crm') return;
      (window as any).__acnDeepLink = null;
      supabase.from('crm_oportunidades').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data: op }) => {
          if (op) { setFormOp(formOpFromOp(op)); setModalAbrir(op); setAbrirTabDir('andamento'); setAbrirNovoText(''); }
        });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  // Carrega nome do cliente ao abrir modal de edição
  useEffect(() => {
    if (modalOp?.cliente_id) {
      supabase.from('clientes').select('id,nome').eq('id', modalOp.cliente_id).single()
        .then(({ data }) => {
          if (data) setFormOp(f => ({ ...f, _cliente_nome: data.nome }));
        });
    }
  }, [modalOp]);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVADOS
  // ─────────────────────────────────────────────────────────────────────────
  const estagiosFunil  = estagios.filter(e => e.funil === 'venda_direta');
  const opsFunil       = ops.filter(o => o.funil === 'venda_direta');
  const respUnicos     = [...new Set(opsFunil.map(o => o.responsavel_nome).filter(Boolean))].sort();
  // Contatos agendados para hoje (qualquer funil)
  const hoje           = hojeISO();
  const contatosHoje   = ops.filter(o =>
    o.prox_contato === hoje &&
    o.funil === 'venda_direta' &&
    o.responsavel_nome === currentUser?.nome
  );
  const opsFiltradas   = opsFunil.filter(o => {
    if (filtResp && o.responsavel_nome !== filtResp) return false;
    if (filtTemp && o.temperatura !== filtTemp) return false;
    if (filtTipoNegocio && o.tipo_negocio !== filtTipoNegocio) return false;
    return combinaBusca([o.titulo, o.orgao, o.numero_edital], busca);
  });

  // Quais cards do quadro têm alteração ainda não vista por este usuário — 2
  // consultas em lote (não N), pra colorir a lateral do card (ver renderCard).
  const { naoLidoSet: cardsNaoLidos, marcarLidoLocal: marcarCardLidoLocal } = useUnreadMap('crm_oportunidades', opsFiltradas.map(o => o.id), currentUser);
  // Mesmo destaque, agora pra linhas de OPL (tabela "OPLs em Aberto") — ver uso em
  // oplsFiltradas mais abaixo. A mesma tabela "oples" é editada por praticamente
  // todos os módulos do sistema, não só aqui — este Set cobre a visão do CRM.
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', oplsEmAberto.map((o: any) => o.id), currentUser);

  const getEst       = (id: string) => estagios.find(e => e.id === id);
  const getItensEst  = (estagioId: string) => itens.filter(i => i.estagio_id === estagioId);
  const getProgOp    = (opId: string) => progresso.filter(p => p.oportunidade_id === opId);
  const getVendasOp  = (opId: string) => vendas.filter(v => v.oportunidade_id === opId);

  const chkPct = (opId: string, estagioId: string) => {
    const its = getItensEst(estagioId);
    if (!its.length) return null;
    const prog = getProgOp(opId);
    const done = its.filter(i => prog.find(p => p.item_id === i.id && p.concluido)).length;
    return { done, total: its.length };
  };

  const totalVendidoOp = (opId: string) =>
    getVendasOp(opId).reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalFaturadoOp = (opId: string) =>
    getVendasOp(opId).filter(v => v.status_faturamento === 'faturado').reduce((s, v) => s + (v.valor_total || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // DRAG & DROP
  // ─────────────────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => setDragging(id);
  const handleDragEnd   = () => { setDragging(null); setDragOver(null); setDragOverItem(null); };

  // Reordenar dentro da mesma SUPER_COL — targetId recebido diretamente do onDrop do card wrapper
  const handleReorderWithTarget = async (colMatch: (o: any) => boolean, targetId: string) => {
    const fromId = dragging;
    setDragging(null); setDragOver(null); setDragOverItem(null);
    if (!fromId || fromId === targetId) return;
    const draggingOp = ops.find(o => o.id === fromId);
    const targetOp   = ops.find(o => o.id === targetId);
    if (!draggingOp || !targetOp || !colMatch(draggingOp) || !colMatch(targetOp)) return;

    const colCards = ops
      .filter(colMatch)
      .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0) || new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    const fromIdx = colCards.findIndex(c => c.id === fromId);
    const toIdx   = colCards.findIndex(c => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...colCards];
    const [moved]   = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const resultados = await Promise.all(
      reordered.map((c, i) => supabase.from('crm_oportunidades').update({ posicao: i + 1 }).eq('id', c.id))
    );
    const falhaOrdem = resultados.find((r: any) => r.error);
    if (falhaOrdem) mostrarAviso(`Não foi possível gravar a nova ordem dos cards\n${falhaOrdem.error.message}`, 'erro');   // 7.62: o erro era ignorado
    await load(true);
  };

  // opId: no celular o card é movido pelo seletor "Mover para…", sem arrastar
  const handleDrop = async (estagioDestId: string, opId: string | null = dragging) => {
    setDragOver(null);
    if (!opId) return;
    const op = ops.find(o => o.id === opId);
    if (!op || op.estagio_id === estagioDestId) { setDragging(null); return; }

    const estDest = getEst(estagioDestId);
    setDragging(null);

    if (estDest?.tipo === 'enviado') {
      setModalEnviado({ op, estagioDestId });
      setPvTexto(op.numero_pv || '');
      setTemperaturaSel(op.temperatura || '');
      setEnviadoContatoData(op.prox_contato || '');
      setEnviadoContatoHora(op.hora_prox_contato || '');
      return;
    }

    if (estDest?.tipo === 'faturado') {
      const { data: oplsVinc, error: errVinc } = await supabase.from('oples').select('opl,status_geral').eq('crm_oportunidade_id', op.id);
      if (errVinc) { mostrarAviso(`Não foi possível conferir as OPs deste card\n${errVinc.message}`, 'erro'); return; }   // 7.62: lia como "nenhuma OP vinculada" e mostrava o aviso errado
      const semOpl = !oplsVinc || oplsVinc.length === 0;
      const pendentes = (oplsVinc || []).filter(o => o.status_geral !== 'Faturado');
      if (semOpl || pendentes.length > 0) {
        setAvisoFaturadoBloq({ op, semOpl, pendentes });
        return;
      }
      await moverCard(op.id, estagioDestId);
      return;
    }

    if (isGanho(estDest)) {
      setModalEmpresaVenc({ op, estagioDestId });
      return;
    }

    if (isDesistencia(estDest)) {
      setModalDesist({ op, estagioDestId });
      setDesistTexto('');
      return;
    }

    if (isPerdido(estDest)) {
      setModalMotivo({ op, estagioDestId });
      setMotivoTexto('');
      return;
    }

    const its = getItensEst(op.estagio_id);
    const prog = getProgOp(op.id);
    const obrigPend = its.filter(i => i.obrigatorio && !prog.find(p => p.item_id === i.id && p.concluido));
    if (obrigPend.length > 0) {
      setModalGate({ op, estagioDestId, itens: its, prog });
      return;
    }

    await moverCard(op.id, estagioDestId);
  };

  // Devolve true se o card foi movido. 7.62: o erro da gravação era ignorado e quem chamava seguia como se tivesse movido (ex.: a janela "Vencido"
  // criava a OP de um card que não saiu do lugar); o registro no histórico também. Uma troca por vez por card (o clique duplo gravava duas vezes).
  const moverCard = async (opId: string, estagioId: string): Promise<boolean> => {
    const r = await umaVez('mover-' + opId, async () => {
      const { error } = await supabase.from('crm_oportunidades').update({
        estagio_id: estagioId,
        atualizado_em: new Date().toISOString(),
      }).eq('id', opId);
      if (error) { mostrarAviso(`Não foi possível mover o card\n${error.message}`, 'erro'); return false; }
      const { error: errH } = await supabase.from('crm_historico').insert({
        oportunidade_id: opId,
        tipo: 'status_change',
        estagio_novo: getEst(estagioId)?.nome,
        usuario_nome: currentUser?.nome || 'Sistema',
      });
      if (errH) mostrarAviso(`O card foi movido, mas o registro no histórico não foi gravado\n${errH.message}`, 'atencao');
      await load();
      return true;
    })();
    return !!r;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ANDAMENTO
  // ─────────────────────────────────────────────────────────────────────────
  const lerAndamentoCrm = async (opId: string) => {
    const { data, error: errH } = await supabase
      .from('crm_historico')
      .select('*')
      .eq('oportunidade_id', opId)
      .eq('tipo', 'observacao')
      .order('criado_em', { ascending: false });
    if (errH) {
      // criado_em pode não existir ainda — rodar SQL: ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now()
      const { data: d2, error: e2 } = await supabase.from('crm_historico').select('*').eq('oportunidade_id', opId).eq('tipo', 'observacao');
      // 7.62: se a segunda leitura também falha, a janela dizia "Nenhuma atualização registrada ainda" — agora diz o motivo e mantém o que já estava
      if (e2) { setErroAndamentoModal(e2.message); return; }
      setErroAndamentoModal('');
      setAndamentoHistorico(d2 || []);
    } else {
      setErroAndamentoModal('');
      setAndamentoHistorico(data || []);
    }
  };

  const abrirAndamento = async (op: any) => {
    setModalAndamento(op);
    setNovoAndamento('');
    setErroAndamentoModal('');
    setAndamentoHistorico([]);
    await lerAndamentoCrm(op.id);
  };

  const salvarAndamentoCrm = umaVez('andamento-crm', async () => {
    if (!novoAndamento.trim() || !modalAndamento) return;
    setSalvandoAndamento(true);
    try {
      const { error } = await supabase.from('crm_historico').insert({
        oportunidade_id: modalAndamento.id,
        tipo: 'observacao',
        texto: novoAndamento.trim(),
        usuario_nome: currentUser?.nome || currentUser?.email || 'Usuário',
        criado_em: new Date().toISOString(),
      });
      if (error) { alert('Erro ao salvar: ' + error.message); }
      else {
        // Salva @menções do andamento
        await salvarMencoes({
          texto: novoAndamento.trim(),
          mencionanteId: String(currentUser?.id || ''),
          mencionanteNome: currentUser?.nome || 'Sistema',
          contexto: 'crm',
          contextoId: String(modalAndamento.id),
          contextoDescricao: `CRM: ${modalAndamento.titulo || '—'}`,
          campo: 'andamento_crm',
          abaDestino: 'crm',
        });
        setNovoAndamento('');
        await lerAndamentoCrm(modalAndamento.id);
      }
    } finally {
      setSalvandoAndamento(false);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EMITIR PEDIDO DE COMPRA (vinculado ao card CRM)
  // ─────────────────────────────────────────────────────────────────────────
  // 05/10/2026: a janela e a gravação da solicitação de compra são as mesmas de todo o sistema (ver SolicitacaoCompra.tsx) — lista de itens,
  // prioridade, prazo, centro de custo, vínculo, fornecedor, link, anexos e observações com @menção. O que é só do CRM fica aqui: a nota no
  // histórico do card, que só faz sentido quando a compra saiu de um card com id real (a tela "OPLs em Aberto" pode não ter oportunidade).
  const aoCriarCompraCrm = async (r: any) => {
    if (modalCompras?.id) {
      const { error: errNota } = await supabase.from('crm_historico').insert({
        oportunidade_id: modalCompras.id,
        tipo: 'observacao',
        texto: `Pedido de Compra ${r.numero_pedido} emitido para o setor Compras.`,
        usuario_nome: currentUser?.nome || 'Sistema',
        criado_em: new Date().toISOString(),
      });
      if (errNota) mostrarAviso(`O pedido foi criado, mas a anotação no histórico do card não foi gravada\n${errNota.message}`, 'atencao');   // 7.62: o erro era ignorado
    }
    alert(`Pedido ${r.numero_pedido} criado! Acompanhe na aba Compras.`);
    setModalCompras(null);
    load(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR OP
  // ─────────────────────────────────────────────────────────────────────────
  // converte string vazia → null (evita 400 em colunas date/uuid no Postgres)
  const limpar = (v: any) => (v === '' || v === undefined) ? null : v;

  const salvarOportunidade = umaVez('salvar-oportunidade', async () => {
    if (!formOp.titulo?.trim()) return;
    setSalvando(true);
    const p: any = {
      funil,
      titulo:            formOp.titulo?.trim() || null,
      tipo_licitacao:    formOp.tipo_licitacao  || 'ordinaria',
      numero_edital:     limpar(formOp.numero_edital),
      orgao:             limpar(formOp.orgao),
      data_sessao:       limpar(formOp.data_sessao),
      hora_sessao:       limpar(formOp.hora_sessao) || null,
      sub_status:        formOp.sub_status || 'andamento',
      empresa_vencedora: limpar(formOp.empresa_vencedora) || null,
      data_validade_ata: limpar(formOp.data_validade_ata),
      data_prev_fechamento: limpar(formOp.data_prev_fechamento),
      valor_registrado:  formOp.valor_registrado
        ? parseFloat(String(formOp.valor_registrado).replace(/\./g,'').replace(',','.'))
        : null,
      valor_acn:         formOp.valor_acn
        ? parseFloat(String(formOp.valor_acn).replace(/\./g,'').replace(',','.'))
        : null,
      faturamento_empresa: formOp.faturamento_empresa || 'ACN',
      cliente_id:        limpar(formOp.cliente_id),
      estagio_id:        limpar(formOp.estagio_id),
      responsavel_id:    limpar(formOp.responsavel_id),
      responsavel_nome:  limpar(formOp.responsavel_nome),
      motivo_perda:      limpar(formOp.motivo_perda),
      nome_contato:      limpar(formOp.nome_contato),
      contato:           limpar(formOp.contato),
      contato_email:     limpar(formOp.contato_email),
      prox_contato:      limpar(formOp.prox_contato) || null,
      hora_prox_contato: limpar(formOp.hora_prox_contato) || null,
    };
    if (!p.estagio_id) {
      const first = estagiosFunil.find(e => !isGanho(e) && !isPerdido(e));
      if (first) p.estagio_id = first.id;
    }
    let saveError = null;
    if (modalOp?.id) {
      const { error } = await supabase.from('crm_oportunidades').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalOp.id);
      saveError = error;
      if (!error) logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: modalOp.id, changeType: 'UPDATE', oldRow: modalOp, newRow: p, user: currentUser });
    } else {
      const { data: inserido, error } = await supabase.from('crm_oportunidades').insert(p).select('id').single();
      saveError = error;
      if (!error && inserido) logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: inserido.id, changeType: 'CREATE', newRow: p, user: currentUser });
    }
    setSalvando(false);
    if (saveError) {
      console.error('[CRM] Erro ao salvar oportunidade:', saveError);
      alert('Erro ao salvar: ' + (saveError.message || JSON.stringify(saveError)));
      return;
    }
    setModalOp(null);
    await load();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ABRIR MODAL — split-screen
  // ─────────────────────────────────────────────────────────────────────────
  // 🟡 sutil no rótulo da aba quando ela tem alteração/adição ainda não vista
  // (mesmo marcador usado nos campos do formulário e no card do quadro) — a
  // aba "auditoria" abaixo só existe pra quem quiser ver o histórico completo,
  // não é o mecanismo principal de aviso.
  const tabLabel = (key: string, label: string) => camposNaoLidos.has(key) ? `${label} 🟡` : label;
  const TABS_CRM = [
    { key:'andamento',    label: tabLabel('andamento', '📝 Andamento') },
    { key:'cotacoes',     label:'💰 Cotações' },
    { key:'formacao_precos', label:'💲 Formação de Preços' },
    { key:'processo',     label: tabLabel('processo', '📂 Arquivos') },
    { key:'custos',       label: tabLabel('custos', '💰 Custos e Docs Técnicos') },
    { key:'informacoes',  label: tabLabel('informacoes', 'ℹ️ Informações Importantes') },
    { key:'analise',      label:'🔬 Análise' },
  ] as const;

  useEffect(() => {
    if (modalAbrir?.id && abrirTabDir === 'formacao_precos') setFormacaoMontadaId(modalAbrir.id);
  }, [modalAbrir?.id, abrirTabDir]);

  useEffect(() => {
    setOplsDoCard([]);
    if (!modalAbrir?.id) return;
    let vivo = true;
    supabase.from('oples').select('*').eq('crm_oportunidade_id', modalAbrir.id).order('opl')
      .then(({ data }) => { if (vivo) setOplsDoCard(data || []); });
    return () => { vivo = false; };
  }, [modalAbrir?.id]);

  useEffect(() => {
    if (!modalAbrir) return;
    fetchAbrirTabContent(modalAbrir, abrirTabDir);
    // pequeno delay para o DOM do contenteditable estar montado
    setTimeout(() => carregarNotaLivre(modalAbrir, abrirTabDir), 100);
  }, [modalAbrir?.id, abrirTabDir]);

  // Registra "últimas visualizadas" — upsert, dispara uma vez por abertura
  // (não por troca de aba dentro do mesmo processo já aberto).
  useEffect(() => {
    if (!modalAbrir?.id || !currentUser?.id) return;
    supabase.from('visualizacoes_recentes')
      .upsert(
        { usuario_id: currentUser.id, tipo: 'crm', registro_id: modalAbrir.id, visualizado_em: new Date().toISOString() },
        { onConflict: 'usuario_id,tipo,registro_id' }
      ).then(() => {});
  }, [modalAbrir?.id, currentUser?.id]);

  // Carrega a lista de "Últimas Visualizadas" (20 mais recentes do usuário)
  const carregarRecentesCrm = useCallback(async () => {
    if (!currentUser?.id) return;
    setRecentesCrmLoading(true);
    const { data, error } = await supabase.from('visualizacoes_recentes')
      .select('registro_id, visualizado_em')
      .eq('usuario_id', currentUser.id).eq('tipo', 'crm')
      .order('visualizado_em', { ascending: false }).limit(20);
    if (error) { setErroRecentes(error.message); setRecentesCrmLoading(false); return; }   // 7.62: lia como "nenhuma oportunidade visualizada"
    setErroRecentes('');
    setRecentesCrm(data || []);
    setRecentesCrmLoading(false);
  }, [currentUser?.id]);
  useEffect(() => { if (abaInterna === 'recentes') carregarRecentesCrm(); }, [abaInterna, carregarRecentesCrm]);

  // ── resize do modal Abrir (drag divider) ──
  useEffect(() => {
    if (!abrirIsDragging) return;
    const handleMove = (e: MouseEvent) => {
      const container = abrirContainerRef.current;
      if (!container) return;
      const containerW = container.getBoundingClientRect().width;
      const dx = e.clientX - abrirDragStartX.current;
      const newW = Math.min(70, Math.max(25, abrirDragStartW.current + (dx / containerW) * 100));
      setAbrirLeftWidth(newW);
    };
    const handleUp = () => setAbrirIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [abrirIsDragging]);

  /** Abre o modal de edição da OP com o formulário já preenchido. As datas vêm
   *  do banco como timestamp e o <input type="date"> só aceita AAAA-MM-DD. */
  const abrirEdicaoOpl = async (o: any) => {
    // A lista só carrega ALGUMAS colunas da OP. Partir dela abria o formulário com o resto vazio —
    // resumo dos serviços, origem da venda, seriais, terceiro, veículo do catálogo... — e o "Salvar"
    // gravava tudo, inclusive esses vazios que a pessoa nunca viu (achado em 29/09/2026, na OP
    // 1482.1502: o banco tinha o resumo e a origem, a tela abria em branco). Por isso o formulário
    // parte da OP INTEIRA, lida do banco na hora de abrir.
    const { data: completa, error } = await supabase.from('oples').select('*').eq('id', o.id).maybeSingle();
    if (error || !completa) {
      mostrarAviso(`Não foi possível abrir a edição\n${error?.message || 'A OP não foi encontrada — pode ter sido excluída. Atualize a tela.'}`, 'erro');
      return;
    }
    const soData = (v: any) => (v ? String(v).slice(0, 10) : '');
    setOplFormEdit({
      ...completa,
      data_entrada:             soData(completa.data_entrada),
      data_prevista_entrega:    soData(completa.data_prevista_entrega),
      data_chegada_veiculo:     soData(completa.data_chegada_veiculo),
      prazo_entrega_comercial:  soData(completa.prazo_entrega_comercial),
      prazo_entrega_producao:   soData(completa.prazo_entrega_producao),
      data_aceite_cliente:      soData(completa.data_aceite_cliente),
    });
    setOplEditando(completa);
  };

  const salvarOplEdit = umaVez('salvar-opl-edit', async () => {
    if (!oplEditando) return;
    setOplSalvando(true);

    const qtdAnterior = Number(oplEditando.quantidade) || 1;
    const qtdNova = Number(oplFormEdit.quantidade) || 1;
    const baseOpl = (oplEditando.opl || '').trim();
    const jaEhSufixo = /\/\d+$/.test(baseOpl);

    // Aumentar a quantidade numa OP já cadastrada não desmembra sozinho —
    // pergunta se quer desmembrar de verdade agora, gerando OPs /02../NN a
    // partir desta (que vira a unidade /01 implícita, sem renomear — o
    // texto "opl" original é referenciado por número em várias outras
    // tabelas, então não é seguro renomear uma OP já em andamento). Mesmo
    // padrão de sufixo da criação (NovaOpOsModal.tsx). Só oferece a opção
    // se esta OP não for ela mesma já um sufixo /NN de outra.
    // Envio direto (kit, material) não desmembra: não passa pela produção,
    // então não há veículo para acompanhar um a um — só muda a quantidade.
    const ehEnvio = soEnvio(oplFormEdit.fluxo_entrega || oplEditando.fluxo_entrega);
    if (qtdNova > qtdAnterior && qtdNova > 1 && !jaEhSufixo && !ehEnvio) {
      const desmembrar = await confirmar(
        `Quantidade aumentou de ${qtdAnterior} para ${qtdNova}.\n\n` +
        `Deseja DESMEMBRAR agora em ${qtdNova} OPs separadas (uma por veículo/unidade)? ` +
        `Esta OP (${baseOpl}) continua sendo a 1ª unidade, com todo o histórico/status atual preservado. ` +
        `Serão criadas mais ${qtdNova - 1} OPs novas (${baseOpl}/02 até ${baseOpl}/${String(qtdNova).padStart(2,'0')}), ` +
        `com os mesmos dados comerciais mas começando do zero (Em Espera Engenharia).\n\n` +
        `OK = desmembrar agora   |   Cancelar = só salvar a quantidade nesta OP mesmo, sem desmembrar`
      );
      if (desmembrar) {
        const { data: colisao } = await supabase.from('oples').select('id').eq('opl', `${baseOpl}/02`).maybeSingle();
        if (colisao) {
          setOplSalvando(false);
          alert(`Já existe uma OP "${baseOpl}/02" — parece que esta OP já foi parcialmente desmembrada antes. Ajuste manualmente.`);
          return;
        }
        const { data: completa, error: errFetch } = await supabase.from('oples').select('*').eq('id', oplEditando.id).single();
        if (errFetch || !completa) {
          setOplSalvando(false);
          alert('Erro ao buscar dados completos da OP: ' + (errFetch?.message || 'não encontrada'));
          return;
        }
        // Valor da OP original dividido igualmente entre as unidades (unidade
        // 1 = a própria OP original, unidades 2..N = as novas siblings) —
        // resto de arredondamento fica na última unidade.
        const valoresTotal   = dividirValorEmUnidades(completa.valor_total, qtdNova);
        const valoresMO      = dividirValorEmUnidades(completa.valor_mao_de_obra, qtdNova);
        const valoresMOSerr  = dividirValorEmUnidades(completa.valor_mao_de_obra_serralheria, qtdNova);

        const siblingBase = {
          tipo_op:                       completa.tipo_op,
          faturamento_empresa:           oplFormEdit.faturamento_empresa || 'ACN',
          tipo_projeto:                  completa.tipo_projeto,
          modelo:                        oplFormEdit.modelo || null,
          veiculo_id:                    oplFormEdit.veiculo_id || null,
          data_entrada:                  completa.data_entrada,
          data_prevista_entrega:         oplFormEdit.data_prevista_entrega || null,
          data_chegada_veiculo:          completa.data_chegada_veiculo,
          cliente_nome:                  completa.cliente_nome,
          responsavel_comercial:         oplFormEdit.responsavel_comercial || null,
          observacoes_comercial:         oplFormEdit.observacoes_comercial || null,
          centro_custo:                  oplFormEdit.centro_custo || null,
          crm_oportunidade_id:           completa.crm_oportunidade_id,
          origem_venda:                  completa.origem_venda,
          servico_terceiro:              completa.servico_terceiro,
          tipos_servico_terceiro:        completa.tipos_servico_terceiro,
          tipo_servico_terceiro:         completa.tipo_servico_terceiro,
          obs_servico_terceiro:          completa.obs_servico_terceiro,
          resumo_servicos:               completa.resumo_servicos,
        };
        const novasOps = [];
        for (let i = 2; i <= qtdNova; i++) {
          const suf = String(i).padStart(2, '0');
          novasOps.push({
            ...siblingBase,
            opl: `${baseOpl}/${suf}`,
            chassi: null,
            placa: null,
            quantidade: 1,
            valor_total:                   valoresTotal[i-1],
            valor_mao_de_obra:             valoresMO[i-1],
            valor_mao_de_obra_serralheria: valoresMOSerr[i-1],
            status_geral: 'Em Espera Engenharia',
            criado_por: currentUser?.email,
            criado_por_nome: currentUser?.nome,
          });
        }
        const { error: errSiblings } = await supabase.from('oples').insert(novasOps);
        if (errSiblings) {
          setOplSalvando(false);
          alert('Erro ao criar as OPs desmembradas: ' + errSiblings.message);
          return;
        }
        const { error: errOriginal } = await supabase.from('oples').update({
          chassi:                oplFormEdit.chassi || null,
          modelo:                oplFormEdit.modelo || null,
          veiculo_id:            oplFormEdit.veiculo_id || null,
          quantidade:            1,
          valor_total:                   valoresTotal[0],
          valor_mao_de_obra:             valoresMO[0],
          valor_mao_de_obra_serralheria: valoresMOSerr[0],
          data_prevista_entrega: oplFormEdit.data_prevista_entrega || null,
          centro_custo:          oplFormEdit.centro_custo || null,
          responsavel_comercial: oplFormEdit.responsavel_comercial || null,
          observacoes_comercial: oplFormEdit.observacoes_comercial || null,
          faturamento_empresa:   oplFormEdit.faturamento_empresa || 'ACN',
          data_atualizacao:      new Date().toISOString(),
        }).eq('id', oplEditando.id);
        setOplSalvando(false);
        if (errOriginal) { alert('Erro ao atualizar a OP original: ' + errOriginal.message); return; }
        await supabase.from('logs_movimentacao_opl').insert([{
          opl_id: oplEditando.id, numero_opl: baseOpl, setor: 'Comercial',
          evento: `OP desmembrada em ${qtdNova} unidades (${baseOpl}/02 até ${baseOpl}/${String(qtdNova).padStart(2,'0')} criadas).`,
          status_anterior: completa.status_geral, status_novo: completa.status_geral,
          usuario_nome: currentUser?.nome, usuario_email: currentUser?.email, data_hora: new Date().toISOString(),
        }]);
        alert(`Desmembrado: ${baseOpl} (unidade 1) + ${qtdNova - 1} OPs novas, de ${baseOpl}/02 até ${baseOpl}/${String(qtdNova).padStart(2,'0')}.`);
        setOplEditando(null);
        fetchOplsEmAberto();
        return;
      }
    }

    // Texto vazio vira null no banco; número vazio também (e não 0, que valeria
    // como "custa zero"). O modal entrega tudo como texto.
    const txt = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());
    const num = (v: any) => {
      const s = String(v ?? '').trim().replace(',', '.');
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const oplPayload: any = {
      // identificação
      cliente_nome:          txt(oplFormEdit.cliente_nome),
      cliente_final:         txt(oplFormEdit.cliente_final),
      tipo_projeto:          txt(oplFormEdit.tipo_projeto),
      faturamento_empresa:   txt(oplFormEdit.faturamento_empresa) || 'ACN',
      quantidade:            qtdNova,
      origem_venda:          txt(oplFormEdit.origem_venda),
      canal_venda:           txt(oplFormEdit.canal_venda),
      vendedor:              txt(oplFormEdit.vendedor),
      edital:                txt(oplFormEdit.edital),
      proposta:              txt(oplFormEdit.proposta),
      numero_nf:             txt(oplFormEdit.numero_nf),
      // veículo / envio
      fluxo_entrega:         txt(oplFormEdit.fluxo_entrega),
      veiculo_id:            txt(oplFormEdit.veiculo_id),
      modelo:                txt(oplFormEdit.modelo),
      veiculo:               txt(oplFormEdit.veiculo),
      chassi:                txt(oplFormEdit.chassi),
      placa:                 txt(oplFormEdit.placa),
      local_instalacao:      txt(oplFormEdit.local_instalacao),
      destino_cidade:        txt(oplFormEdit.destino_cidade),
      destino_uf:            txt(oplFormEdit.destino_uf),
      destino_cep:           txt(oplFormEdit.destino_cep),
      frete_responsavel:     txt(oplFormEdit.frete_responsavel),
      envio_obs:             txt(oplFormEdit.envio_obs),
      // datas e prazos
      data_entrada:            txt(oplFormEdit.data_entrada),
      data_chegada_veiculo:    txt(oplFormEdit.data_chegada_veiculo),
      data_prevista_entrega:   txt(oplFormEdit.data_prevista_entrega),
      prazo_entrega_comercial: txt(oplFormEdit.prazo_entrega_comercial),
      prazo_entrega_producao:  txt(oplFormEdit.prazo_entrega_producao),
      data_aceite_cliente:     txt(oplFormEdit.data_aceite_cliente),
      prazo_garantia:          txt(oplFormEdit.prazo_garantia),
      // faturamento
      cnpj_faturamento:         txt(oplFormEdit.cnpj_faturamento),
      razao_social_faturamento: txt(oplFormEdit.razao_social_faturamento),
      centro_custo:             txt(oplFormEdit.centro_custo),
      observacoes_faturamento:  txt(oplFormEdit.observacoes_faturamento),
      // responsáveis
      responsavel_comercial:  txt(oplFormEdit.responsavel_comercial),
      responsavel_engenharia: txt(oplFormEdit.responsavel_engenharia),
      responsavel_producao:   txt(oplFormEdit.responsavel_producao),
      responsavel_qualidade:  txt(oplFormEdit.responsavel_qualidade),
      responsavel_fiscal:     txt(oplFormEdit.responsavel_fiscal),
      responsavel_almox:      txt(oplFormEdit.responsavel_almox),
      // serviço de terceiro e textos
      servico_terceiro:       !!oplFormEdit.servico_terceiro,
      obs_servico_terceiro:   txt(oplFormEdit.obs_servico_terceiro),
      // a lista é o que manda (os selos na tela de detalhe leem dela); o campo
      // singular antigo continua espelhando o primeiro tipo, porque telas mais
      // velhas ainda leem dele. Desmarcar "precisa de terceiro" limpa os dois,
      // senão sobrava etiqueta de um serviço que já não existe (24/09/2026).
      tipos_servico_terceiro: oplFormEdit.servico_terceiro && Array.isArray(oplFormEdit.tipos_servico_terceiro)
        && oplFormEdit.tipos_servico_terceiro.length ? oplFormEdit.tipos_servico_terceiro : null,
      tipo_servico_terceiro:  oplFormEdit.servico_terceiro && Array.isArray(oplFormEdit.tipos_servico_terceiro)
        && oplFormEdit.tipos_servico_terceiro.length ? oplFormEdit.tipos_servico_terceiro[0] : null,
      resumo_servicos:        txt(oplFormEdit.resumo_servicos),
      especificacoes:         txt(oplFormEdit.especificacoes),
      observacoes_comercial:  txt(oplFormEdit.observacoes_comercial),
      observacoes_atencao:    txt(oplFormEdit.observacoes_atencao),
      seriais_equipamentos:   txt(oplFormEdit.seriais_equipamentos),
    };
    // Valor só é gravado por quem enxerga valor: para quem tem `ver_valores`
    // desligado o campo nem aparece no modal, e mandar o que ele não viu
    // apagaria o valor de venda sem ninguém perceber.
    if (currentUser?.ver_valores !== false) {
      oplPayload.valor_total                   = num(oplFormEdit.valor_total);
      oplPayload.valor_mao_de_obra             = num(oplFormEdit.valor_mao_de_obra);
      oplPayload.valor_mao_de_obra_serralheria = num(oplFormEdit.valor_mao_de_obra_serralheria);
    }
    // Só grava o que a pessoa MUDOU (29/09/2026). O "Salvar" mandava TODOS os campos do formulário;
    // campo que ninguém tocou não deve ser regravado — nem por engano de leitura, nem por cima do que
    // outro setor alterou enquanto a janela ficou aberta.
    const CAMPOS_DATA = new Set(['data_entrada', 'data_chegada_veiculo', 'data_prevista_entrega', 'prazo_entrega_comercial', 'prazo_entrega_producao', 'data_aceite_cliente']);
    const CAMPOS_NUM  = new Set(['quantidade', 'valor_total', 'valor_mao_de_obra', 'valor_mao_de_obra_serralheria']);
    const norm = (k: string, v: any) => {
      if (k === 'servico_terceiro') return v ? '1' : '0';
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '';
      if (Array.isArray(v)) return JSON.stringify(v);
      if (CAMPOS_DATA.has(k)) return String(v).slice(0, 10);
      if (CAMPOS_NUM.has(k)) return String(Number(v));
      return String(v).trim();
    };
    const mudados: Record<string, any> = Object.fromEntries(
      Object.entries(oplPayload).filter(([k, v]) => norm(k, v) !== norm(k, oplEditando[k])));
    if (!Object.keys(mudados).length) { setOplSalvando(false); setOplEditando(null); return; }
    const { error } = await supabase.from('oples').update({
      ...mudados, data_atualizacao: new Date().toISOString(),
    }).eq('id', oplEditando.id);
    setOplSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    logChange({ module: 'comercial', entityType: 'oples', entityId: oplEditando.id, changeType: 'UPDATE',
      oldRow: Object.fromEntries(Object.keys(mudados).map(k => [k, oplEditando[k]])), newRow: mudados, user: currentUser });
    setOplEditando(null);
    fetchOplsEmAberto();
  });

  // ── Lançamento em lote: chassi/placa/CNPJ de todas as unidades de um lote ──
  // (irmaos já vem ordenado por sufixo /01../NN pelo chamador)
  const abrirModalLote = (irmaos: any[]) => {
    const form: Record<string,any> = {};
    irmaos.forEach(o => {
      form[o.id] = {
        chassi: o.chassi || '', placa: o.placa || '',
        cnpj_faturamento: o.cnpj_faturamento || '', razao_social_faturamento: o.razao_social_faturamento || '',
        veiculo_id: o.veiculo_id || '', modelo: o.modelo || '',
      };
    });
    setLoteForm(form);
    setLoteColar('');
    setModalLote(irmaos);
  };

  const setLoteCampo = (id: string, campo: string, valor: string) =>
    setLoteForm(f => ({ ...f, [id]: { ...f[id], [campo]: valor } }));

  // Veículo do lote inteiro (pedido do usuário em 29/09/2026): o "🚗 Lote" só lançava chassi, placa e
  // CNPJ, mas o carro é o mesmo nas unidades — e é ele que permite guardar a configuração do Conjunto
  // Elétrico. Escolher aqui vale para todas; chassi e placa continuam por unidade (podem ficar vazios:
  // o carro chega zero km).
  const veiculoComumDoLote = () => {
    const ids = new Set((modalLote || []).map(o => loteForm[o.id]?.veiculo_id || ''));
    return ids.size === 1 ? [...ids][0] as string : '';
  };
  const aplicarVeiculoNoLote = (p: { veiculo_id: string; modelo?: string }) =>
    setLoteForm(f => {
      const novo = { ...f };
      (modalLote || []).forEach(o => {
        novo[o.id] = { ...novo[o.id], veiculo_id: p.veiculo_id, ...(p.modelo !== undefined ? { modelo: p.modelo } : {}) };
      });
      return novo;
    });

  // Cola uma lista vinda do Excel (Ctrl+C na planilha, Ctrl+V aqui) e aplica
  // às unidades do lote. Duas situações:
  //  - Veículo já emplacado: colando Placa + Chassi (2 colunas, em qualquer
  //    ordem — reconhece o formato da placa) cada linha é casada com a
  //    unidade que JÁ TEM aquela placa cadastrada, sem depender da ordem.
  //  - Veículo 0KM sem placa ainda: colando só uma coluna de chassis (ou
  //    linhas sem placa reconhecível), distribui em ordem entre as unidades
  //    do lote que ainda não têm chassi nem placa preenchidos.
  const REGEX_PLACA = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/i;
  const aplicarColaChassis = () => {
    if (!modalLote) return;
    const linhasRaw = loteColar.split('\n').map(l => l.trim()).filter(Boolean);
    if (linhasRaw.length === 0) return;

    const linhas = linhasRaw.map(l => {
      const partes = l.split(/\t|;/).map(p => p.trim()).filter(Boolean);
      if (partes.length < 2) return { chassi: partes[0] || '', placa: '' };
      const idxPlaca = partes.findIndex(p => REGEX_PLACA.test(p.replace(/\s/g, '')));
      if (idxPlaca >= 0) {
        return { placa: partes[idxPlaca], chassi: partes.find((_, i) => i !== idxPlaca) || '' };
      }
      // Nenhuma coluna parece placa — assume ordem [chassi, placa]
      return { chassi: partes[0], placa: partes[1] || '' };
    });

    setLoteForm(f => {
      const novo = { ...f };
      const usados = new Set<string>();

      // 1) Casa por placa já cadastrada na unidade (mais confiável que ordem)
      const semCasamento: typeof linhas = [];
      for (const linha of linhas) {
        let casou = false;
        if (linha.placa) {
          const alvo = modalLote.find(o => !usados.has(o.id) &&
            (novo[o.id]?.placa || '').trim().toUpperCase() === linha.placa.toUpperCase());
          if (alvo) {
            usados.add(alvo.id);
            novo[alvo.id] = {
              ...novo[alvo.id],
              chassi: linha.chassi || novo[alvo.id].chassi,
              placa: linha.placa || novo[alvo.id].placa,
            };
            casou = true;
          }
        }
        if (!casou) semCasamento.push(linha);
      }

      // 2) O restante (sem placa reconhecida/casada) distribui em ordem
      // entre as unidades ainda sem chassi e sem placa (veículo 0KM sem
      // vínculo definido ainda).
      const livres = modalLote.filter(o => !usados.has(o.id) && !novo[o.id]?.chassi && !novo[o.id]?.placa);
      semCasamento.forEach((linha, i) => {
        const alvo = livres[i];
        if (!alvo) return;
        novo[alvo.id] = {
          ...novo[alvo.id],
          chassi: linha.chassi || novo[alvo.id].chassi,
          placa: linha.placa || novo[alvo.id].placa,
        };
      });

      return novo;
    });
  };

  const salvarLote = umaVez('salvar-lote', async () => {
    if (!modalLote) return;
    setLoteSalvando(true);
    const agora = new Date().toISOString();
    const falhas: string[] = [];
    for (const o of modalLote) {
      const dados = loteForm[o.id] || {};
      const upd: any = {
        chassi: dados.chassi?.trim() || null,
        placa: dados.placa?.trim() || null,
        cnpj_faturamento: dados.cnpj_faturamento?.trim() || null,
        razao_social_faturamento: dados.razao_social_faturamento?.trim() || null,
        data_atualizacao: agora,
      };
      // o veículo só é regravado nas unidades em que mudou; o texto do modelo acompanha a ficha
      const trocouVeiculo = (dados.veiculo_id || '') !== (o.veiculo_id || '');
      if (trocouVeiculo) {
        upd.veiculo_id = dados.veiculo_id || null;
        if (dados.veiculo_id && dados.modelo) upd.modelo = dados.modelo;
      }
      const { error } = await supabase.from('oples').update(upd).eq('id', o.id);
      if (error) { falhas.push(`${o.opl}: ${error.message}`); continue; }
      if (trocouVeiculo) {
        logChange({ module: 'comercial', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
          oldRow: { veiculo_id: o.veiculo_id, modelo: o.modelo }, newRow: { veiculo_id: upd.veiculo_id, modelo: upd.modelo ?? o.modelo }, user: currentUser });
      }
    }
    setLoteSalvando(false);
    // antes o erro de uma unidade passava calado e a janela fechava como se tivesse salvo tudo
    if (falhas.length) { mostrarAviso(`Algumas unidades não foram salvas\n${falhas.join('\n')}`, 'erro'); fetchOplsEmAberto(); return; }
    setModalLote(null);
    fetchOplsEmAberto();
  });

  const fetchOplsEmAberto = async () => {
    setOplsLoading(true);
    const { data, error: errLista } = await supabase
      .from('oples')
      .select('id,opl,cliente_nome,modelo,chassi,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,faturamento_empresa,responsavel_comercial,crm_oportunidade_id,quantidade,cnpj_faturamento,razao_social_faturamento,centro_custo,observacoes_comercial,veiculo,fluxo_entrega,destino_cidade,destino_uf,destino_cep,prazo_garantia,obs_devolucao,pendencias_kit,veiculo_id,' + COLUNAS_MARCOS_OP)
      .not('status_geral', 'in', '("Faturado","Cancelado")')
      .order('data_entrada', { ascending: false });
    // 7.62: a leitura que falhava virava "Nenhuma OP em aberto" — e sumia com a lista que já estava na tela
    if (errLista) { setErroOpls(errLista.message); setOplsLoading(false); return; }
    setErroOpls('');
    const lista = data || [];
    setOplsEmAberto(lista);
    // Onde está / desde quando (Etapa 6.2). O histórico tem mais de 1.000 linhas e o servidor
    // corta em 1.000 por leitura, então a data do evento vem de uma função do banco; onde ela
    // não achou evento, vale o último marco da própria OP (marcado como aproximado).
    // A tela só aparece depois disto (oplsLoading), então a coluna nunca surge pela metade.
    const [desdeEvento, indice] = await Promise.all([
      desdeQuandoEmLote(lista.map((o: any) => o.id)),
      indicePendencias().catch((e: any) => { console.error('Pendências da lista de OPs:', e); return new Map(); }),
    ]);
    const desdeDe: Record<string, any> = {};
    const pendDe: Record<string, any[]> = {};
    lista.forEach((o: any) => {
      desdeDe[o.id] = desdeQuandoDaLista(o, desdeEvento.get(String(o.id)));
      const seguram = travaConclusaoProducao(indice.get(String(o.id)), o);
      if (seguram.length) pendDe[o.id] = seguram;
    });
    setDesdeOpls(desdeDe);
    setPendenciasOpls(pendDe);
    // Para as OPs devolvidas ao Comercial, busca no log quem devolveu e quando
    // (a coluna obs_devolucao guarda só o motivo). Uma consulta para todas.
    const devolvidas = lista.filter((o: any) => o.status_geral === 'Devolvida Comercial').map((o: any) => o.id);
    if (devolvidas.length) {
      const { data: logs, error: errLogs } = await supabase.from('logs_movimentacao_opl')
        .select('opl_id,setor,usuario_nome,data_hora')
        .in('opl_id', devolvidas).eq('status_novo', 'Devolvida Comercial')
        .order('data_hora', { ascending: false });
      const porOpl: Record<string, any> = {};
      (logs || []).forEach((l: any) => { if (!porOpl[l.opl_id]) porOpl[l.opl_id] = l; }); // a mais recente
      if (!errLogs) setDevolucoesOpl(porOpl);   // 7.62: sem o log, "reenviar" iria sempre para a Engenharia — mantém o que havia
    } else {
      setDevolucoesOpl({});
    }
    setOplsLoading(false);
  };

  useEffect(() => {
    if (abaInterna === 'opls') fetchOplsEmAberto();
  }, [abaInterna]);

  const fetchAbrirTabContent = async (op: any, tab: string) => {
    setAbrirDocs([]);
    setAbrirAndamentoHist([]);
    // 7.62: a leitura que falhava virava "Nenhuma atualização/nenhum documento registrado" — agora a aba mostra o motivo
    if (tab === 'andamento') {
      const { data, error } = await supabase.from('crm_historico')
        .select('*').eq('oportunidade_id', op.id).eq('tipo', 'observacao')
        .order('criado_em', { ascending: false });
      if (error) { setErroAbrir(error.message); return; }
      setErroAbrir('');
      setAbrirAndamentoHist(data || []);
    } else {
      const { data, error } = await supabase.from('licitacao_documentos')
        .select('*').eq('licitacao_id', op.id).eq('categoria', tab)
        .order('criado_em', { ascending: false });
      if (error) { setErroAbrir(error.message); return; }
      setErroAbrir('');
      setAbrirDocs(data || []);
    }
  };

  const salvarAbrirAndamento = umaVez('abrir-andamento', async () => {
    if (!abrirNovoText.trim() || !modalAbrir) return;
    setAbrirSalvandoDoc(true);
    try {
      const agora = new Date().toISOString();
      const { data: novoAndamento, error } = await supabase.from('crm_historico').insert([{
        oportunidade_id: modalAbrir.id,
        tipo: 'observacao',
        texto: abrirNovoText,
        usuario_nome: currentUser?.nome,
        criado_em: agora,
      }]).select('id').single();
      // 7.62: o erro era ignorado — as @menções e o histórico de alterações saíam como se o andamento existisse
      if (error) { mostrarAviso(`Não foi possível registrar o andamento\n${error.message}`, 'erro'); return; }
      await salvarMencoes({
        texto: abrirNovoText,
        mencionanteId: String(currentUser?.id || ''),
        mencionanteNome: currentUser?.nome || 'Sistema',
        contexto: 'crm',
        contextoId: String(modalAbrir.id),
        contextoDescricao: `CRM: ${modalAbrir.titulo || '—'}`,
        campo: 'andamento_crm',
        abaDestino: 'crm',
      });
      logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: modalAbrir.id, changeType: 'UPDATE',
        oldRow: { andamento: null }, newRow: { andamento: abrirNovoText.slice(0, 120) }, user: currentUser,
        metadata: { ref_id: novoAndamento?.id } });
      setAbrirNovoText('');
      await fetchAbrirTabContent(modalAbrir, 'andamento');
    } finally {
      setAbrirSalvandoDoc(false);
    }
  });

  const salvarAbrirDoc = umaVez('abrir-doc', async () => {
    if (!modalAbrir || (!abrirUploadFile && !abrirUploadDesc.trim())) return;
    setAbrirSalvandoDoc(true);
    try {
      const agora = new Date().toISOString();
      let url = '';
      let nome = '';
      if (abrirUploadFile) {
        const ext = abrirUploadFile.name.split('.').pop();
        const path = `crm-docs/${modalAbrir.id}/${abrirTabDir}/${Date.now()}.${ext}`;
        // Office/planilhas sobem como octet-stream — ver FormatosArquivo.ts
        const ct = contentTypeUpload(abrirUploadFile);
        const { error: upErr } = await supabase.storage.from('acn-media').upload(path, abrirUploadFile, { contentType: ct });
        if (upErr) {
          alert(`Falha ao enviar "${abrirUploadFile.name}": ${upErr.message}`);
          return;
        }
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        url = pub.publicUrl;
        nome = abrirUploadFile.name;
      }
      const { data: novoDoc, error: errDoc } = await supabase.from('licitacao_documentos').insert([{
        licitacao_id: modalAbrir.id,
        categoria: abrirTabDir,
        nome: nome || abrirUploadDesc,
        url: url || null,
        conteudo: abrirUploadDesc || null,
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
        criado_em: agora,
      }]).select('id').single();
      // 7.62: o erro era ignorado — o histórico de alterações dizia que o documento existia e o campo era limpo, perdendo a legenda digitada
      if (errDoc) { mostrarAviso(`Não foi possível registrar o documento\n${errDoc.message}`, 'erro'); return; }
      logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: modalAbrir.id, changeType: 'UPDATE',
        oldRow: { [abrirTabDir]: null }, newRow: { [abrirTabDir]: nome || abrirUploadDesc.slice(0, 80) }, user: currentUser,
        formatters: { [abrirTabDir]: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id } });
      setAbrirUploadFile(null);
      setAbrirUploadDesc('');
      if (abrirUploadRef.current) abrirUploadRef.current.value = '';
      await fetchAbrirTabContent(modalAbrir, abrirTabDir);
    } finally {
      setAbrirSalvandoDoc(false);
    }
  });

  const excluirAbrirDoc = async (id: string, tabela: string, label?: string) => {
    // Mensagem específica (mostra o que vai ser apagado) reduz o risco de
    // confirmar sem perceber — achado real: usuário apagou uma análise sem
    // notar, porque "Excluir este registro?" genérico não dizia qual era.
    const msg = label ? `Excluir "${label}"?` : 'Excluir este registro?';
    if (!await confirmar(msg)) return;
    await umaVez('excluir-' + id, async () => {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      // 7.62: o erro era ignorado — a lista era relida e o registro continuava lá, sem dizer por quê
      if (error) { mostrarAviso(`Não foi possível excluir\n${error.message}`, 'erro'); return; }
      await fetchAbrirTabContent(modalAbrir, abrirTabDir);
    })();
  };

  // ── Nota Livre (editor rico) ──
  const carregarNotaLivre = async (op: any, tab: string) => {
    // a mais recente (se por qualquer motivo houver duas linhas, "maybeSingle" sozinho falhava e a nota aparecia vazia)
    const { data, error } = await supabase.from('licitacao_documentos')
      .select('conteudo').eq('licitacao_id', op.id).eq('categoria', 'nota__' + tab).eq('nome', '__nota_livre__')
      .order('criado_em', { ascending: false }).limit(1)
      .maybeSingle();
    // 7.62: a leitura que falhava deixava o editor vazio — e salvar APAGAVA a nota que existia. Agora o editor avisa e o salvar fica travado.
    if (error) { setErroNota(error.message); return; }
    setErroNota('');
    const html = data?.conteudo || '';
    if (abrirNotaRef.current) abrirNotaRef.current.innerHTML = html;
  };

  // Antes: apagava a nota e depois gravava a nova — se a gravação falhasse, a nota que existia estava perdida; e os erros eram ignorados.
  // Agora: grava a nova primeiro, só então apaga a(s) anterior(es).
  const salvarNotaLivre = umaVez('nota-livre', async () => {
    if (!modalAbrir || !abrirNotaRef.current) return;
    if (erroNota) { mostrarAviso('Não dá para salvar a nota\nA nota que já existe não foi lida (' + erroNota + '); salvar agora a substituiria sem você ver. Use "Tentar de novo" acima do editor.', 'erro'); return; }
    setAbrirNotaSalvando(true);
    try {
      const html = abrirNotaRef.current.innerHTML;
      const cat = 'nota__' + abrirTabDir;
      const { data: antigas, error: errLer } = await supabase.from('licitacao_documentos').select('id')
        .eq('licitacao_id', modalAbrir.id).eq('categoria', cat).eq('nome', '__nota_livre__');
      if (errLer) { mostrarAviso(`Não foi possível salvar a nota\n${errLer.message}`, 'erro'); return; }
      const idsAntigos = (antigas || []).map((r: any) => r.id);
      const temTexto = !!(html && html.replace(/<br\s*\/?>/gi,'').trim());
      if (temTexto) {
        const { error: errNova } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: modalAbrir.id, categoria: cat, nome: '__nota_livre__',
          conteudo: html, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
          criado_em: new Date().toISOString(),
        }]);
        if (errNova) { mostrarAviso(`A nota NÃO foi salva — a que existia continua como estava\n${errNova.message}`, 'erro'); return; }
      }
      if (idsAntigos.length) {
        const { error: errDel } = await supabase.from('licitacao_documentos').delete().in('id', idsAntigos);
        if (errDel) mostrarAviso(temTexto ? `A nota foi salva, mas a versão anterior não foi removida\n${errDel.message}` : `Não foi possível apagar a nota\n${errDel.message}`, temTexto ? 'atencao' : 'erro');
        if (errDel && !temTexto) return;
      }
      if (temTexto) {
        logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: modalAbrir.id, changeType: 'UPDATE',
          oldRow: { [`nota_${abrirTabDir}`]: null }, newRow: { [`nota_${abrirTabDir}`]: 'editada' }, user: currentUser,
          formatters: { [`nota_${abrirTabDir}`]: () => '📝 Área Livre editada' } });
      }
    } finally {
      setAbrirNotaSalvando(false);
    }
  });

  const inserirImagemNota = async (file: File) => {
    if (!modalAbrir) return;
    const ext = file.name.split('.').pop();
    const path = `crm-docs/${modalAbrir.id}/nota/${Date.now()}.${ext}`;
    await supabase.storage.from('acn-media').upload(path, file);
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    abrirNotaRef.current?.focus();
    document.execCommand('insertHTML', false,
      `<img src="${pub.publicUrl}" style="max-width:100%;border-radius:4px;margin:4px 0;display:block;" />`);
  };

  const inserirLinkNota = async () => {
    const url = await pedirTexto('URL do link (ex: https://...)');
    if (!url) return;
    const sel = window.getSelection()?.toString();
    const label = sel || url;
    abrirNotaRef.current?.focus();
    document.execCommand('insertHTML', false,
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0369a1;text-decoration:underline;">${label}</a>`);
  };

  const salvarAbrirForm = umaVez('salvar-abrir-form', async () => {
    if (!formOp.titulo?.trim() || !modalAbrir) return;
    if (isGanho(getEst(formOp.estagio_id)) && !formOp.empresa_vencedora) {
      alert('Selecione a empresa vencedora.');
      return;
    }
    // Nº do PV agora é editável direto no painel (antes só era gravado pelo
    // gate "Enviar Proposta" do Kanban) — mesma validação/checagem de
    // duplicidade daquele gate (ver confirmarEnviado).
    let numeroPvFinal: string | null = null;
    if (String(formOp.numero_pv || '').trim()) {
      const pv = String(formOp.numero_pv).replace(/\D/g, '').slice(0, 4);
      if (!/^\d{4}$/.test(pv)) {
        alert('Nº do PV precisa ter 4 dígitos.');
        return;
      }
      const { data: dupPv, error: errDupPv } = await supabase.from('crm_oportunidades').select('id')
        .eq('numero_pv', pv).neq('id', modalAbrir.id).maybeSingle();
      // 7.62: sem conseguir conferir se o PV já existe, não grava às cegas
      if (errDupPv) { mostrarAviso(`Não foi possível conferir se o PV já existe\n${errDupPv.message}`, 'erro'); return; }
      if (dupPv) {
        alert('Já existe outra oportunidade com esse número de PV.');
        return;
      }
      numeroPvFinal = pv;
    }
    // Alterar (ou apagar) um PV já preenchido: só Admin e gerentes. A 1ª
    // atribuição continua livre. Confere o valor do BANCO — o da tela pode
    // estar desatualizado (outra pessoa pode ter atribuído o PV nesse meio-tempo).
    if (!podeAlterarNumeroOplPv(currentUser)) {
      const { data: pvBanco, error: errPvBanco } = await supabase.from('crm_oportunidades').select('numero_pv').eq('id', modalAbrir.id).maybeSingle();
      if (errPvBanco) { mostrarAviso(`Não foi possível conferir o PV gravado\n${errPvBanco.message}`, 'erro'); return; }
      const salvo = String(pvBanco?.numero_pv || '').trim();
      if (salvo && salvo !== (numeroPvFinal || '')) {
        alert(`O PV ${salvo} já foi atribuído a esta oportunidade.\n\nSó administradores e gerentes podem alterar o número do PV.`);
        return;
      }
    }
    setSalvando(true);
    const p: any = {
      numero_pv:         numeroPvFinal,
      titulo:            formOp.titulo?.trim() || null,
      tipo_licitacao:    formOp.tipo_licitacao  || 'ordinaria',
      numero_edital:     limpar(formOp.numero_edital),
      orgao:             limpar(formOp.orgao),
      data_sessao:       limpar(formOp.data_sessao),
      hora_sessao:       limpar(formOp.hora_sessao) || null,
      sub_status:        formOp.sub_status || 'andamento',
      empresa_vencedora: limpar(formOp.empresa_vencedora) || null,
      data_validade_ata: limpar(formOp.data_validade_ata),
      data_prev_fechamento: limpar(formOp.data_prev_fechamento),
      valor_registrado:  formOp.valor_registrado
        ? parseFloat(String(formOp.valor_registrado).replace(/\./g,'').replace(',','.'))
        : null,
      cliente_id:        limpar(formOp.cliente_id),
      estagio_id:        limpar(formOp.estagio_id),
      responsavel_id:    limpar(formOp.responsavel_id),
      responsavel_nome:  limpar(formOp.responsavel_nome),
      motivo_perda:      limpar(formOp.motivo_perda),
      nome_contato:      limpar(formOp.nome_contato),
      contato:           limpar(formOp.contato),
      contato_email:     limpar(formOp.contato_email),
      prox_contato:      limpar(formOp.prox_contato) || null,
      hora_prox_contato: limpar(formOp.hora_prox_contato) || null,
      faturamento_empresa: formOp.faturamento_empresa || 'ACN',
      // ── quadro Lead (Fase 2) ──
      data_aceite_cliente:     limpar(formOp.data_aceite_cliente),
      cliente_final:           limpar(formOp.cliente_final),
      numero_proposta:         limpar(formOp.numero_proposta),
      veiculo_modelo:          limpar(formOp.veiculo_modelo),
      quantidade:              limpar(formOp.quantidade),
      local_instalacao:        limpar(formOp.local_instalacao),
      data_chegada_veiculo:    limpar(formOp.data_chegada_veiculo),
      prazo_entrega_producao:  limpar(formOp.prazo_entrega_producao),
      prazo_entrega_comercial: limpar(formOp.prazo_entrega_comercial),
      ctrl_ordem_servico:         limpar(formOp.ctrl_ordem_servico),
      ctrl_relatorio_fotografico: limpar(formOp.ctrl_relatorio_fotografico),
      ctrl_nao_conformidades:     limpar(formOp.ctrl_nao_conformidades),
      ctrl_desenhos:              limpar(formOp.ctrl_desenhos),
      ctrl_melhorias:             limpar(formOp.ctrl_melhorias),
      ctrl_pop:                   limpar(formOp.ctrl_pop),
      ctrl_protocolo_viagem:      limpar(formOp.ctrl_protocolo_viagem),
      ctrl_controle:              limpar(formOp.ctrl_controle),
      ctrl_data_entrada:          limpar(formOp.ctrl_data_entrada),
      ctrl_data_saida:            limpar(formOp.ctrl_data_saida),
      ctrl_prazo_garantia:        limpar(formOp.ctrl_prazo_garantia) || '12 MESES',
    };
    // OBS: crm_historico já é preenchido automaticamente por trigger (tg_crm_audit_estagio)
    // sempre que estagio_id muda, então nenhum insert manual é necessário aqui.
    const entrouEmVencidoAgora = isGanho(getEst(formOp.estagio_id)) && !isGanho(getEst(modalAbrir.estagio_id));
    const { error: errSalvar } = await supabase.from('crm_oportunidades').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalAbrir.id);
    // 7.62: o erro era ignorado — o histórico de alterações registrava a mudança e, se o card entrasse em Vencido, a OP era criada, sem o card ter gravado
    if (errSalvar) { setSalvando(false); mostrarAviso(`Não foi possível salvar as alterações\n${errSalvar.message}`, 'erro'); return; }
    // Auditoria/colaboração (POC — ver AuditSystem.tsx): grava o diff campo a campo.
    logChange({
      module: 'crm', entityType: 'crm_oportunidades', entityId: modalAbrir.id, changeType: 'UPDATE',
      oldRow: modalAbrir, newRow: p, user: currentUser,
      formatters: { estagio_id: (v) => getEst(v)?.nome || '—' },
    });
    let oplCriada: string|null = null;
    let avisoOp: { tom: 'atencao'|'erro'; texto: string }|null = null;
    if (entrouEmVencidoAgora && formOp.empresa_vencedora) {
      const r = await criarOpAutomatica({ ...formOp, id: modalAbrir.id }, formOp.empresa_vencedora);
      oplCriada = r.opl;
      avisoOp = r.aviso;
    }
    setSalvando(false);
    await load(true);
    if (oplCriada) {
      alert(`OP ${oplCriada} criada automaticamente e enviada para Engenharia!`);
    } else if (avisoOp) {
      mostrarAviso(avisoOp.texto, avisoOp.tom);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE CHECKLIST
  // ─────────────────────────────────────────────────────────────────────────
  const toggleItem = async (opId: string, itemId: string, atual: boolean) => {
    await umaVez('item-' + opId + '-' + itemId, async () => {
      const ex = progresso.find(p => p.oportunidade_id === opId && p.item_id === itemId);
      // 7.62: o erro era ignorado — o item parecia marcado/desmarcado e a janela liberava (ou travava) o avanço de estágio por isso
      if (ex) {
        const { error } = await supabase.from('crm_checklist_progresso').update({
          concluido: !atual,
          concluido_por: currentUser?.nome,
          concluido_em: !atual ? new Date().toISOString() : null,
        }).eq('id', ex.id);
        if (error) { mostrarAviso(`Não foi possível gravar o item do checklist\n${error.message}`, 'erro'); return; }
      } else {
        const { error } = await supabase.from('crm_checklist_progresso').insert({
          oportunidade_id: opId, item_id: itemId, concluido: true,
          concluido_por: currentUser?.nome, concluido_em: new Date().toISOString(),
        });
        if (error) { mostrarAviso(`Não foi possível gravar o item do checklist\n${error.message}`, 'erro'); return; }
      }
      const { data, error: errLer } = await supabase.from('crm_checklist_progresso').select('*').eq('oportunidade_id', opId);
      if (errLer) { mostrarAviso(`O item foi gravado, mas não deu para reler o checklist\n${errLer.message}`, 'atencao'); return; }
      setProgresso(prev => [...prev.filter(p => p.oportunidade_id !== opId), ...(data || [])]);
      if (modalGate?.op?.id === opId) {
        setModalGate((g: any) => g ? { ...g, prog: data || [] } : null);
      }
    })();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CRIAR OP AUTOMATICAMENTE AO ENTRAR EM VENCIDO
  // ─────────────────────────────────────────────────────────────────────────
  // Antes exigia clicar manualmente em "📋 Lançar OP" — várias vendas
  // vencidas ficavam sem OP correspondente porque ninguém lembrava de criar.
  // Agora, assim que a oportunidade vira Vencido (com PV já atribuído no
  // Enviado), a OP nasce sozinha com o número A/D+PV+.+MMAA e já entra no
  // fluxo normal ("Em Espera Engenharia"). Idempotente: não cria de novo se
  // já existir uma OP vinculada a esta oportunidade, nem se o número gerado
  // já estiver em uso — nesses casos fica só o botão manual como fallback.
  //
  // Devolve { opl, aviso }. Quando não cria, `aviso` diz o porquê para quem
  // chamou mostrar na tela. Antes devolvia só null, e a colisão de número e o
  // erro de gravação passavam calados: a pessoa só descobria conferindo a lista
  // depois (achado A3 do PLANO_UX_FLUXO_TRABALHO.md, 29/09/2026). Se já existe
  // OP vinculada, não há aviso: é o esperado, não uma falha.
  // O tom vai explícito porque o Feedback adivinha pelo texto, e "não foi
  // criada" casa com "criad" e sairia verde, como se tivesse dado certo.
  const criarOpAutomatica = async (op: any, empresa: 'ACN'|'DETECH'): Promise<{ opl: string|null; aviso: { tom: 'atencao'|'erro'; texto: string }|null }> => {
    if (!op.numero_pv) {
      return { opl: null, aviso: { tom: 'atencao', texto: 'A OP não foi criada sozinha\nEsta oportunidade não tem PV atribuído, então não deu para gerar o número. Use "Lançar OP" no menu do card.' } };
    }

    const { data: jaExiste, error: errJaExiste } = await supabase.from('oples').select('id').eq('crm_oportunidade_id', op.id).limit(1).maybeSingle();
    // 7.62: sem conseguir conferir se já existe OP, não cria (podia duplicar)
    if (errJaExiste) return { opl: null, aviso: { tom: 'erro', texto: `A OP não foi criada sozinha\nNão deu para conferir se este card já tem OP (${errJaExiste.message}). Use "Lançar OP" no menu do card.` } };
    if (jaExiste) return { opl: null, aviso: null }; // já tem OP vinculada — não duplica

    const baseOpl = numOpDePv(empresa, op.numero_pv);
    const { data: colisao, error: errColisao } = await supabase.from('oples').select('id').eq('opl', baseOpl).maybeSingle();
    if (errColisao) return { opl: null, aviso: { tom: 'erro', texto: `A OP ${baseOpl} não foi criada sozinha\nNão deu para conferir se o número já está em uso (${errColisao.message}). Use "Lançar OP" no menu do card.` } };
    if (colisao) {
      return { opl: null, aviso: { tom: 'atencao', texto: `A OP ${baseOpl} não foi criada sozinha\nEsse número já está em uso por outra OP. Use "Lançar OP" no menu do card e informe outro número.` } };
    }

    const agora = new Date().toISOString();
    // itens vendidos: da formação de preços ligada ao card (oficial; senão a mais recente)
    const { itens: itensVendidos } = await itensDaFormacao({ crmId: op.id });
    const { data: novaOp, error } = await supabase.from('oples').insert([{
      opl:                   baseOpl,
      itens_vendidos:        itensVendidos || [],
      modelo:                op.titulo,
      valor_total:           op.valor_registrado ?? null,
      cliente_nome:          op.orgao || op.titulo,
      responsavel_comercial: op.responsavel_nome || null,
      status_geral:          'Em Espera Engenharia',
      data_entrada:          agora.slice(0, 10),
      criado_por_nome:       currentUser?.nome,
      criado_por:            currentUser?.email,
      crm_oportunidade_id:   op.id,
      origem_venda:          origemDeOportunidade(op),
      fluxo_entrega:         op.fluxo_entrega || null,
      destino_cidade:        op.destino_cidade || null,
      destino_uf:            op.destino_uf || null,
      destino_cep:           op.destino_cep || null,
    }]).select().single();
    if (error) {
      console.error('Erro ao gerar OP automática:', error);
      return { opl: null, aviso: { tom: 'erro', texto: `Não foi possível criar a OP ${baseOpl} sozinha\n${error.message}. Use "Lançar OP" no menu do card.` } };
    }
    if (novaOp) {
      await supabase.from('crm_historico').insert({
        oportunidade_id: op.id, tipo: 'conversao_op',
        conteudo: `OP criada automaticamente ao entrar em Vencido: ${baseOpl}${itensVendidos?.length ? ` (${itensVendidos.length} item(ns) vendido(s) da formação de preços)` : ' (sem formação de preços: informe os itens vendidos no detalhe da OP)'}`, usuario_nome: currentUser?.nome,
      });
    }
    return { opl: baseOpl, aviso: null };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERTER EM OP / OS
  // ─────────────────────────────────────────────────────────────────────────
  const converterGanho = async () => {
    if (!modalConverter) return;
    setSalvando(true);
    const op = modalConverter;
    const agora = new Date().toISOString();
    try {
        // OS: busca dados completos do cliente e redireciona para SAC
        let clienteObj = null;
        if (op.cliente_id) {
          const { data: cli } = await supabase.from('clientes').select('*').eq('id', op.cliente_id).single();
          clienteObj = cli || null;
        }
        // Monta dados para o formulário SAC
        const nomeCliente = clienteObj?.nome || op.orgao || op.titulo;
        const fones = Array.isArray(clienteObj?.telefones) && clienteObj.telefones.length
          ? (clienteObj.telefones[0]?.numero || clienteObj.telefones[0] || '')
          : '';
        const emails = Array.isArray(clienteObj?.emails) && clienteObj.emails.length
          ? (clienteObj.emails[0]?.email || clienteObj.emails[0] || '')
          : '';
        const endereco = [clienteObj?.endereco, clienteObj?.numero, clienteObj?.complemento].filter(Boolean).join(', ');
        sessionStorage.setItem('pendingOsFromCrm', JSON.stringify({
          defeito_reclamado: op.titulo,
          equipamento_nome:  op.titulo,
          cliente_nome:      nomeCliente,
          empresa_orgao:     clienteObj?.empresa || op.orgao || '',
          cpf_cnpj:          clienteObj?.documento || '',
          telefone:          fones,
          email:             emails,
          endereco:          endereco,
          cliente_obj:       clienteObj,
          cliente_id:        op.cliente_id || null,
          responsavel_nome:  op.responsavel_nome || '',
          observacoes:       `[CRM] Vendedor: ${op.responsavel_nome || 'não atribuído'}\nOportunidade: ${op.titulo}${op.numero_edital ? '\nEdital: ' + op.numero_edital : ''}${op.orgao ? '\nÓrgão: ' + op.orgao : ''}`,
        }));
        setModalConverter(null);
        setNumOp('');
        window.dispatchEvent(new CustomEvent('crm:navegar-sac'));
        setSalvando(false);
        return;
    } catch (e: any) {
      alert('Erro ao criar: ' + (e?.message || 'Verifique o console.'));
    }
    setSalvando(false);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GATE ENVIADO — PV + temperatura + contato obrigatório
  // ─────────────────────────────────────────────────────────────────────────
  const confirmarEnviado = umaVez('confirmar-enviado', async () => {
    if (!modalEnviado) return;
    const pv = pvTexto.replace(/\D/g, '').padStart(4, '0').slice(0, 4);
    if (!/^\d{4}$/.test(pv)) { alert('Informe um número de PV com 4 dígitos.'); return; }
    if (!temperaturaSel) { alert('Classifique a temperatura do lead (frio/morno/quente).'); return; }
    if (!enviadoContatoData) { alert('Informe a data do próximo contato.'); return; }

    setSalvandoEnviado(true);
    const op = modalEnviado.op;

    // PV já atribuído: só Admin e gerentes trocam (mesma regra do painel do card)
    if (!podeAlterarNumeroOplPv(currentUser)) {
      const { data: pvBanco, error: errPvBanco } = await supabase.from('crm_oportunidades').select('numero_pv').eq('id', op.id).maybeSingle();
      if (errPvBanco) { mostrarAviso(`Não foi possível conferir o PV gravado\n${errPvBanco.message}`, 'erro'); setSalvandoEnviado(false); return; }
      const salvo = String(pvBanco?.numero_pv || '').trim();
      if (salvo && salvo !== pv) {
        alert(`O PV ${salvo} já foi atribuído a esta oportunidade.\n\nSó administradores e gerentes podem alterar o número do PV.`);
        setSalvandoEnviado(false);
        return;
      }
    }

    const { data: dup, error: errDup } = await supabase.from('crm_oportunidades').select('id,titulo').eq('numero_pv', pv).neq('id', op.id).maybeSingle();
    if (errDup) { mostrarAviso(`Não foi possível conferir se o PV já existe\n${errDup.message}`, 'erro'); setSalvandoEnviado(false); return; }
    if (dup) {
      alert(`PV ${pv} já está em uso em "${dup.titulo}". Informe outro número.`);
      setSalvandoEnviado(false);
      return;
    }

    // 7.62: o erro desta gravação era ignorado e a agenda e o histórico eram criados mesmo com o card parado no estágio de antes
    const { error: errCard } = await supabase.from('crm_oportunidades').update({
      estagio_id:        modalEnviado.estagioDestId,
      numero_pv:         pv,
      temperatura:       temperaturaSel,
      prox_contato:      enviadoContatoData,
      hora_prox_contato: enviadoContatoHora || null,
      atualizado_em:      new Date().toISOString(),
    }).eq('id', op.id);
    if (errCard) { mostrarAviso(`Não foi possível enviar a proposta\n${errCard.message}`, 'erro'); setSalvandoEnviado(false); return; }

    let respEmail = currentUser?.email;
    if (op.responsavel_nome && op.responsavel_nome !== currentUser?.nome) {
      const { data: respUser } = await supabase.from('auth_usuarios').select('email').eq('nome', op.responsavel_nome).maybeSingle();
      if (respUser?.email) respEmail = respUser.email;
    }
    const { error: errAgenda } = await supabase.from('agenda_compromissos').insert([{
      setor:         'comercial',
      usuario_email: respEmail,
      usuario_nome:  op.responsavel_nome || currentUser?.nome,
      titulo:        `Contato — ${op.titulo}`,
      descricao:     `PV ${pv} · Temperatura: ${temperaturaSel}`,
      data_hora:     new Date(`${enviadoContatoData}T${enviadoContatoHora || '09:00'}:00`).toISOString(),
    }]);

    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: op.id, tipo: 'status_change',
      estagio_novo: getEst(modalEnviado.estagioDestId)?.nome,
      conteudo: `PV ${pv} atribuído · Temperatura: ${temperaturaSel} · Próximo contato: ${enviadoContatoData}${enviadoContatoHora ? ' ' + enviadoContatoHora : ''}`,
      usuario_nome: currentUser?.nome,
    });

    setSalvandoEnviado(false);
    setModalEnviado(null);
    setPvTexto(''); setTemperaturaSel(''); setEnviadoContatoData(''); setEnviadoContatoHora('');
    await load();
    const faltou: string[] = [];
    if (errAgenda) faltou.push(`o compromisso na agenda não foi criado (${errAgenda.message})`);
    if (errHist) faltou.push(`o registro no histórico não foi gravado (${errHist.message})`);
    if (faltou.length) mostrarAviso(`A proposta foi enviada, mas ${faltou.join(' e ')}`, 'atencao');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDITAR TEMPERATURA A QUALQUER MOMENTO (fora do gate Enviado)
  // ─────────────────────────────────────────────────────────────────────────
  // Janela "Qual empresa venceu?". 7.62: se o card não saía do lugar (gravação recusada), a OP era criada do mesmo jeito; e a gravação da empresa
  // vencedora também tinha o erro ignorado. Agora para no primeiro que falha e diz o que ficou feito. Uma vez só (o clique duplo criava duas OPs).
  const escolherEmpresaVencedora = umaVez('empresa-vencedora', async (emp: 'ACN'|'DETECH') => {
    if (!modalEmpresaVenc) return;
    const opVenc = modalEmpresaVenc.op;
    const moveu = await moverCard(opVenc.id, modalEmpresaVenc.estagioDestId);
    if (!moveu) return;   // o aviso já foi dado; a janela fica aberta para tentar de novo
    const { error: errEmp } = await supabase.from('crm_oportunidades').update({ empresa_vencedora: emp }).eq('id', opVenc.id);
    setModalEmpresaVenc(null);
    if (errEmp) {
      await load();
      mostrarAviso(`O card foi para "Vencido", mas a empresa vencedora não foi gravada\n${errEmp.message}. A OP não foi criada: abra o card, informe a empresa e salve.`, 'erro');
      return;
    }
    // OP nasce sozinha, já numerada a partir do PV (A/D+PV+.+MMAA)
    // e entra direto no fluxo normal — sem precisar de "Lançar OP" manual.
    const { opl: oplCriada, aviso } = await criarOpAutomatica(opVenc, emp);
    await load();
    if (oplCriada) {
      alert(`OP ${oplCriada} criada automaticamente e enviada para Engenharia!`);
    } else if (aviso) {
      mostrarAviso(aviso.texto, aviso.tom);
    }
  });

  // Liga (ou desliga, com null) o card a um processo licitatório. 7.62: o erro era ignorado e a janela fechava como se tivesse ligado.
  const ligarProcesso = umaVez('ligar-processo', async (licitacaoId: string | null) => {
    if (!modalVincularLicit) return;
    const { error } = await supabase.from('crm_oportunidades').update({ licitacao_processo_id: licitacaoId }).eq('id', modalVincularLicit.id);
    if (error) { mostrarAviso(`Não foi possível ${licitacaoId ? 'vincular' : 'desvincular'} o processo\n${error.message}`, 'erro'); return; }
    setModalVincularLicit(null);
    await load();
  });

  const confirmarEdicaoTemp = umaVez('editar-temperatura', async () => {
    if (!modalEditarTemp || !tempEditSel) return;
    setSalvandoTempEdit(true);
    const { error } = await supabase.from('crm_oportunidades').update({
      temperatura: tempEditSel, atualizado_em: new Date().toISOString(),
    }).eq('id', modalEditarTemp.id);
    // 7.62: o erro era ignorado — a janela fechava e o histórico dizia "Temperatura alterada" sem ter alterado
    if (error) { setSalvandoTempEdit(false); mostrarAviso(`Não foi possível salvar a temperatura\n${error.message}`, 'erro'); return; }
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: modalEditarTemp.id, tipo: 'observacao',
      conteudo: `Temperatura alterada para: ${tempEditSel}`, usuario_nome: currentUser?.nome,
    });
    setSalvandoTempEdit(false);
    setModalEditarTemp(null);
    setTempEditSel('');
    await load();
    if (errHist) mostrarAviso(`A temperatura foi salva, mas o registro no histórico não foi gravado\n${errHist.message}`, 'atencao');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TIPO DE NEGÓCIO (Revenda/Venda/Pós-vendas) — pedido do Rafael Nunes (dono
  // da empresa) em 23/09/2026, pra avaliar o markup com a régua certa por tipo
  // (ver MarkupTermometro.tsx). Edição direta no select do card, sem modal —
  // é só uma classificação, não precisa do fluxo de confirmação da temperatura.
  // ─────────────────────────────────────────────────────────────────────────
  const atualizarTipoNegocio = async (op: any, novoTipo: string | null) => {
    setOps(prev => prev.map(o => o.id === op.id ? { ...o, tipo_negocio: novoTipo } : o)); // otimista
    const { error } = await supabase.from('crm_oportunidades').update({
      tipo_negocio: novoTipo, atualizado_em: new Date().toISOString(),
    }).eq('id', op.id);
    // 7.62: o erro era ignorado — o card mostrava o tipo novo até a próxima leitura trazer o de antes de volta
    if (error) {
      setOps(prev => prev.map(o => o.id === op.id ? { ...o, tipo_negocio: op.tipo_negocio } : o));
      mostrarAviso(`Não foi possível salvar o tipo de negócio\n${error.message}`, 'erro');
      return;
    }
    if (novoTipo !== op.tipo_negocio) {
      await supabase.from('crm_historico').insert({
        oportunidade_id: op.id, tipo: 'observacao',
        conteudo: `Tipo de negócio alterado para: ${novoTipo || '(não definido)'}`, usuario_nome: currentUser?.nome,
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MOTIVO PERDA
  // ─────────────────────────────────────────────────────────────────────────
  const confirmarPerda = umaVez('confirmar-perda', async () => {
    if (!modalMotivo) return;
    const { error } = await supabase.from('crm_oportunidades').update({
      estagio_id: modalMotivo.estagioDestId,
      motivo_perda: motivoTexto,
      atualizado_em: new Date().toISOString(),
    }).eq('id', modalMotivo.op.id);
    // 7.62: o erro era ignorado — a janela fechava como se o card tivesse ido para Perdido
    if (error) { mostrarAviso(`Não foi possível registrar a perda\n${error.message}`, 'erro'); return; }
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: modalMotivo.op.id, tipo: 'status_change',
      estagio_novo: getEst(modalMotivo.estagioDestId)?.nome,
      conteudo: motivoTexto, usuario_nome: currentUser?.nome,
    });
    setModalMotivo(null);
    await load();
    if (errHist) mostrarAviso(`A perda foi registrada, mas o histórico não foi gravado\n${errHist.message}`, 'atencao');
  });

  const confirmarDesistencia = umaVez('confirmar-desistencia', async () => {
    if (!modalDesist) return;
    const { error } = await supabase.from('crm_oportunidades').update({
      estagio_id:          modalDesist.estagioDestId,
      motivo_desistencia:  desistTexto,
      atualizado_em:       new Date().toISOString(),
    }).eq('id', modalDesist.op.id);
    if (error) { mostrarAviso(`Não foi possível registrar a desistência\n${error.message}`, 'erro'); return; }
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: modalDesist.op.id, tipo: 'status_change',
      estagio_novo: getEst(modalDesist.estagioDestId)?.nome,
      conteudo: `Desistência: ${desistTexto}`, usuario_nome: currentUser?.nome,
    });
    setModalDesist(null);
    await load();
    if (errHist) mostrarAviso(`A desistência foi registrada, mas o histórico não foi gravado\n${errHist.message}`, 'atencao');
  });

  const reativarOp = async (op: any) => {
    const first = estagiosFunil.find(e => !isGanho(e) && !isPerdido(e) && !isDesistencia(e));
    if (!first) return;
    await umaVez('reativar-' + op.id, async () => {
      const { error } = await supabase.from('crm_oportunidades').update({
        estagio_id: first.id, motivo_desistencia: null, atualizado_em: new Date().toISOString(),
      }).eq('id', op.id);
      if (error) { mostrarAviso(`Não foi possível reativar\n${error.message}`, 'erro'); return; }
      await load();
    })();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR VENDA
  // ─────────────────────────────────────────────────────────────────────────
  const salvarVenda = umaVez('salvar-venda', async () => {
    if (!modalVenda || !formVenda.valor_total) return;
    setSalvando(true);
    const p: any = {
      oportunidade_id:   modalVenda.op.id,
      orgao_aderente:    limpar(formVenda.orgao_aderente),
      cliente_id:        limpar(formVenda.cliente_id),
      descricao:         limpar(formVenda.descricao),
      quantidade:        formVenda.quantidade || null,
      valor_unitario:    formVenda.valor_unitario
        ? parseFloat(String(formVenda.valor_unitario).replace(/\./g,'').replace(',','.'))
        : null,
      valor_total:       parseFloat(String(formVenda.valor_total).replace(/\./g,'').replace(',','.')),
      status_faturamento: formVenda.status_faturamento || 'pendente',
      numero_nf:         limpar(formVenda.numero_nf),
      data_faturamento:  limpar(formVenda.data_faturamento),
      operador_id:       limpar(formVenda.operador_id),
      operador_nome:     limpar(formVenda.operador_nome),
      opl_id:            limpar(formVenda.opl_id),
      numero_op:         limpar(formVenda.numero_op),
      observacoes:       limpar(formVenda.observacoes),
    };
    // 7.62: o erro era ignorado — a janela fechava como se a venda tivesse sido gravada
    const { error: errVenda } = modalVenda.venda?.id
      ? await supabase.from('crm_vendas').update(p).eq('id', modalVenda.venda.id)
      : await supabase.from('crm_vendas').insert(p);
    if (errVenda) { setSalvando(false); mostrarAviso(`Não foi possível salvar a venda\n${errVenda.message}`, 'erro'); return; }
    // Salva @menções das observações da venda
    if (formVenda.observacoes?.trim()) {
      await salvarMencoes({
        texto: formVenda.observacoes,
        mencionanteId: String(currentUser?.id || ''),
        mencionanteNome: currentUser?.nome || 'Sistema',
        contexto: 'crm',
        contextoId: String(modalVenda.op.id),
        contextoDescricao: `Venda CRM: ${modalVenda.op.titulo || '—'}`,
        campo: 'observacoes_venda',
        abaDestino: 'crm',
      });
    }
    setSalvando(false);
    setModalVenda(null);
    await load();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR OP
  // ─────────────────────────────────────────────────────────────────────────
  const excluirOp = async (op: any) => {
    if (!await confirmar(`Excluir "${op.titulo}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('crm_oportunidades').delete().eq('id', op.id);
    // 7.62: o erro era ignorado — o card seguia no quadro sem dizer por quê
    if (error) { mostrarAviso(`Não foi possível excluir\n${error.message}`, 'erro'); return; }
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOTAIS
  // ─────────────────────────────────────────────────────────────────────────
  const totalGeral         = vendas.reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalFaturadoGeral = vendas.filter(v => v.status_faturamento === 'faturado').reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalPendenteGeral = vendas.filter(v => v.status_faturamento === 'pendente').reduce((s, v) => s + (v.valor_total || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CARD
  // ─────────────────────────────────────────────────────────────────────────
  const renderCard = (op: any, col?: any) => {
    const est    = getEst(op.estagio_id);
    const ganho      = isGanho(est);
    const perdido    = isPerdido(est);
    const desistiu   = isDesistencia(est);
    const chk    = chkPct(op.id, op.estagio_id);
    const dias   = diasAte(op.data_sessao || op.data_prev_fechamento);
    const vds    = getVendasOp(op.id);
    const tvend  = totalVendidoOp(op.id);
    const tfat   = totalFaturadoOp(op.id);
    const naoLido = cardsNaoLidos.has(String(op.id));
    const expandido = cardsExpandidos.has(op.id);
    const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCardsExpandidos(prev => {
        const next = new Set(prev);
        next.has(op.id) ? next.delete(op.id) : next.add(op.id);
        return next;
      });
    };
    const isDetech = (op.faturamento_empresa || 'ACN') === 'Detech';
    const abrir = () => { setFormOp(formOpFromOp(op)); setModalAbrir(op); setAbrirTabDir('andamento'); setAbrirNovoText(''); };
    // OPs que este card já gerou. Não some com o "Lançar OP" porque há card com
    // mais de uma OP de verdade (4 de 53 em 29/09/2026: lotes e vendas
    // desmembradas), mas deixa de oferecer como se fosse a primeira e pede
    // confirmação antes de abrir o formulário — risco de lançamento em duplicidade.
    const opsDoCard = oplsPorCard[String(op.id)] || [];
    // "Onde está" (Etapa 6.3): setor + dias da OP mais parada do card, e clicar abre o detalhe da
    // OP (a primeira unidade, se forem várias — no detalhe há o "Resumo do lote"). Lê a linha
    // inteira, porque o card só guarda as colunas do resumo.
    const resumoOps = resumoDasOps(oplsInfoPorCard[String(op.id)] || []);
    const abrirOpDoCard = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const alvo = (oplsInfoPorCard[String(op.id)] || [])[0];
      if (!alvo) return;
      const { data } = await supabase.from('oples').select('*').eq('id', alvo.id).maybeSingle();
      if (!data) { mostrarAviso('Não foi possível abrir a OP\nEla não foi encontrada — pode ter sido excluída. Atualize a tela.', 'atencao'); return; }
      setOplDoCardAberta(data);
    };
    const lancarOp = async () => {
      if (opsDoCard.length) {
        const ja = opsDoCard.length === 1 ? `a OP ${opsDoCard[0]}` : `as OPs ${opsDoCard.join(', ')}`;
        if (!await confirmar(`Este card já tem ${ja}.\n\nLançar mais uma OP para o mesmo card?`)) return;
      }
      setModalNovaOpOs({ crmCard: op });
    };

    // Ações do cartão: "Atualizar" e as demais ficam no menu ⋯ (mesmas regras de antes)
    const acoes = [
      { rotulo: 'Atualizar andamento', icone: mdiUpdate, onClick: () => abrirAndamento(op) },
      { rotulo: 'Abrir', icone: mdiFolderOpenOutline, onClick: abrir, oculto: perdido || desistiu },
      { rotulo: opsDoCard.length ? 'Lançar outra OP' : 'Lançar OP', icone: mdiClipboardTextOutline, onClick: lancarOp, oculto: !ganho },
      { rotulo: 'Lançar OS', icone: mdiWrenchOutline, onClick: () => { setModalConverter(op); setTipoConverter('os'); setNumOp(''); }, oculto: !(ganho && funil === 'venda_direta') },
      { rotulo: 'Nova venda', icone: mdiPlus, onClick: () => { setModalVenda({ op, venda: null }); setFormVenda({ ...VAZIO_VENDA, operador_nome: op.responsavel_nome || '' }); }, oculto: !ganho },
      { rotulo: 'Compras', icone: mdiPackageVariantClosed, onClick: () => setModalCompras(op), oculto: !ganho },
      { rotulo: op.licitacao_processo_id ? 'Processo vinculado' : 'Vincular a processo licitatório', icone: mdiLinkVariant,
        onClick: () => { setModalVincularLicit(op); setBuscaVincularLicit(''); setResultVincularLicit([]); }, oculto: !ganho },
      { rotulo: 'Reativar', icone: mdiRestore, onClick: () => reativarOp(op), oculto: !desistiu },
      { rotulo: 'Converter em licitação/ATA', icone: mdiGavel, onClick: () => setModalConverterLicit(op), oculto: !(funil === 'venda_direta' && !desistiu && est?.tipo === 'estimativa') },
      { rotulo: 'Excluir', icone: mdiTrashCanOutline, onClick: () => excluirOp(op), perigo: true, oculto: currentUser?.perfil !== 'Admin' },
    ];

    return (
      <div
        key={op.id}
        draggable
        onDragStart={() => handleDragStart(op.id)}
        onDragEnd={handleDragEnd}
        className={'acn-kcard acn-crm-card' + (naoLido ? ' nova' : '') + (dragging === op.id ? ' arrastando' : '') + (dragOverItem === op.id && dragging !== op.id ? ' sobre' : '')}
        title={naoLido ? 'Este registro tem alteração(ões) que você ainda não visualizou' : undefined}
      >
        {/* ── Título (clique mostra os detalhes) ── */}
        <h6 onClick={toggleExpand} className="acn-crm-titulo" title={op.titulo}>{op.titulo}</h6>

        {/* ── Linha de apoio sempre visível ── */}
        <div className="acn-kmeta">
          <Tag>{isDetech ? 'DETECH' : 'ACN'}</Tag>
          {op.funil === 'licitacao' && <Tag>Licitação</Tag>}
          {op.tipo_negocio && <Tag>{op.tipo_negocio}</Tag>}
          {op.temperatura && (
            <span title={`Temperatura: ${op.temperatura}`} className="acn-crm-temp-emoji">
              {op.temperatura === 'quente' ? '🔥' : op.temperatura === 'morno' ? '🌤️' : '🧊'}
            </span>
          )}
          {op.data_sessao && (
            <span className="acn-num">{fmtData(op.data_sessao)}{op.hora_sessao ? ` · ${String(op.hora_sessao).slice(0,5)}` : ''}</span>
          )}
          <span className="dir-auto acn-crm-dir">
            {markupPorOp[op.id] !== undefined && (
              <MarkupBadge pct={markupPorOp[op.id].pct} min={markupPorOp[op.id].min}
                max={markupPorOp[op.id].max} discreto
                bandaCfg={op.tipo_negocio ? bandasMarkup[op.tipo_negocio] : undefined} />
            )}
            <Botao pequeno variante="discreto" icone={expandido ? mdiChevronUp : mdiChevronDown} onClick={toggleExpand}
              title={expandido ? 'Esconder detalhes' : 'Mostrar detalhes'} aria-label={expandido ? 'Esconder detalhes' : 'Mostrar detalhes'} aria-expanded={expandido} />
            <MenuAcoes itens={acoes} rotulo="Ações do cartão" />
          </span>
        </div>
        {desistiu && op.motivo_desistencia && (
          <div className="acn-kmeta acn-crm-aviso-warn" title={op.motivo_desistencia}>Desistência: {op.motivo_desistencia}</div>
        )}
        {perdido && op.motivo_perda && (
          <div className="acn-kmeta acn-crm-aviso-bad" title={op.motivo_perda}>Motivo: {op.motivo_perda}</div>
        )}

        {/* Sub-etapa — colunas abertas */}
        {col && !col.terminal && (
          <div className="acn-ksub" role="group" aria-label="Sub-etapa">
            {(['andamento','suspenso','aguardando'] as const).map(s => {
              const ativo = (op.sub_status || 'andamento') === s;
              return (
                <button key={s} type="button" className={ativo ? 'on' : ''} aria-pressed={ativo}
                  onClick={e => { e.stopPropagation(); atualizarSubStatus(op.id, s); }}>
                  {SUB_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        )}

        {/* Empresa vencedora — coluna Vencido */}
        {col?.tipo === 'ganho' && (
          <div className="acn-kmeta">
            <span>Vencedora</span>
            {op.empresa_vencedora ? <Tag>{op.empresa_vencedora}</Tag> : <span className="acn-fraco">— empresa</span>}
          </div>
        )}

        {/* OP já lançada — quem olha o card vê que não precisa lançar de novo. Regra definida com o usuário em 01/10/2026 (R2): aparece em QUALQUER coluna em que o card tenha OP (antes só em "Vencido"; há cards em Faturado e Enviado em que o selo mostra a situação real da OP) */}
        {opsDoCard.length > 0 && (
          <div className="acn-kmeta">
            <Selo familia="ok" title={`OP(s) lançada(s) a partir deste card: ${opsDoCard.join(', ')}`}
              onClick={resumoOps ? abrirOpDoCard : undefined}>
              {opsDoCard.length === 1 ? `OP ${opsDoCard[0]}` : `${opsDoCard.length} OPs`}
            </Selo>
            {resumoOps && (
              <Selo familia={resumoOps.familia} ponto={false} title={resumoOps.titulo} onClick={abrirOpDoCard}>
                {resumoOps.texto}
              </Selo>
            )}
          </div>
        )}

        {/* ── Detalhes (visível só quando expandido) ── */}
        {expandido && (
        <div className="acn-crm-detalhes">
          <div className="acn-kmeta">
            <Tag>{op.funil === 'licitacao' ? 'Licitação' : 'Venda direta'}</Tag>
            {op.tipo_licitacao === 'ata' && <Tag>Ata reg. preços</Tag>}
            <AnaliseStatusBadge origemId={op.id} />
          </div>

          {(op.orgao || op.numero_edital) && (
            <div className="acn-kmeta">
              {op.numero_edital && <span className="acn-forte">{op.numero_edital}</span>}
              {op.orgao}
            </div>
          )}

          {op.responsavel_nome && <div className="acn-kmeta">Responsável: {op.responsavel_nome}</div>}
          {op.funil === 'venda_direta' && (
            <div className="acn-kmeta">
              {op.temperatura ? (
                <Selo familia={op.temperatura === 'quente' ? 'erro' : op.temperatura === 'morno' ? 'marca' : 'info'}>
                  {op.temperatura === 'quente' ? 'Quente' : op.temperatura === 'morno' ? 'Morno' : 'Frio'}
                </Selo>
              ) : <span>Sem temperatura</span>}
              <Botao pequeno variante="discreto" icone={mdiPencilOutline} title="Editar temperatura" aria-label="Editar temperatura"
                onClick={e => { e.stopPropagation(); setModalEditarTemp(op); setTempEditSel(op.temperatura || ''); }} />
            </div>
          )}
          <div className="acn-kmeta" onClick={e => e.stopPropagation()}>
            <span className="acn-crm-tipo-rot">Tipo:</span>
            <select value={op.tipo_negocio || ''} onChange={e => atualizarTipoNegocio(op, e.target.value || null)}
              title="Tipo de negócio — usado pra escolher a régua de markup certa"
              className="acn-crm-tipo-sel">
              <option value="">— não definido —</option>
              {TIPOS_NEGOCIO_CRM.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {op.prox_contato && (
            <div className={'acn-kmeta acn-crm-prox' + (op.prox_contato === hoje ? ' hoje' : op.prox_contato < hoje ? ' atrasado' : '')}>
              Próximo contato: {op.prox_contato === hoje ? 'hoje' : op.prox_contato < hoje ? 'atrasado ·' : ''} {op.prox_contato}
              {op.hora_prox_contato && <span>· {op.hora_prox_contato}</span>}
              {op.nome_contato && <span className="acn-crm-leve">· {op.nome_contato}</span>}
            </div>
          )}

          <div className="acn-kmeta">
            <span className="acn-num acn-forte">{fmtMoeda(op.valor_registrado)}</span>
            <span className="dir-auto acn-crm-dir gap6">
              {op.hora_sessao && <span className="acn-num">{String(op.hora_sessao).slice(0,5)}</span>}
              {dias !== null && !ganho && !perdido && (
                <Selo familia={dias < 0 ? 'erro' : dias <= 3 ? 'atencao' : 'ok'} ponto={false}>
                  {dias < 0 ? `${Math.abs(dias)} d de atraso` : dias === 0 ? 'Hoje' : `em ${dias} d`}
                </Selo>
              )}
            </span>
          </div>

          {chk && !ganho && !perdido && (
            <div className="acn-kmeta" title="Checklist da etapa">
              <div className="acn-crm-barra">
                <div className={chk.done===chk.total ? 'ok' : undefined} style={{ width:`${(chk.done/chk.total)*100}%` }} />
              </div>
              <span className="acn-num">{chk.done}/{chk.total}</span>
            </div>
          )}

          {ganho && op.tipo_licitacao === 'ata' && (
            <div className="acn-kmeta">
              <span>Adesões: <strong>{vds.length}</strong></span>
              <span>Vendido: <strong>{fmtMoeda(tvend)}</strong></span>
              {podeVerTotais && <span>Faturado: <strong>{fmtMoeda(tfat)}</strong></span>}
              {op.data_validade_ata && (
                <span className={diasAte(op.data_validade_ata)! < 30 ? 'acn-crm-aviso-bad' : undefined}>
                  Validade: {fmtData(op.data_validade_ata)}
                </span>
              )}
            </div>
          )}

          {/* Previsão de entrega de compra */}
          {ganho && (() => {
            const pc = pedidosCompra.filter(p => p.oportunidade_id === op.id);
            const comprado = pc.find(p => p.status_compra === 'Comprado' && p.data_prevista_recebimento);
            const pendente = pc.find(p => ['Pendente','Em Andamento','Aguardando Aprovação','Aprovado'].includes(p.status_compra));
            if (comprado) return (
              <div><Botao pequeno variante="secundario" icone={mdiPackageVariantClosed}
                onClick={e => { e.stopPropagation(); abrirVinculo({ tipo:'compra', id: comprado.id, descricao: comprado.numero_pedido }); }}>
                Entrega prev.: {comprado.data_prevista_recebimento ? new Date(comprado.data_prevista_recebimento.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              </Botao></div>
            );
            if (pendente) return (
              <div><Botao pequeno variante="secundario" icone={mdiPackageVariantClosed}
                onClick={e => { e.stopPropagation(); abrirVinculo({ tipo:'compra', id: pendente.id, descricao: pendente.numero_pedido }); }}>
                Compra em andamento
              </Botao></div>
            );
            return null;
          })()}

          <div data-acn-rebaixar><CrmAnexosWidget op={op} currentUser={currentUser} /></div>
        </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RELATÓRIO POR ESTÁGIO
  // ─────────────────────────────────────────────────────────────────────────
  // Receita efetiva ACN: usa valor_acn quando é parceiro/Detech, senão valor_registrado
  const receitaEfetiva = (o: any): number => {
    const comParceiro = o.faturamento_empresa === 'Detech' || o.classificacao === 'Parceiro';
    if (comParceiro && o.valor_acn != null) return o.valor_acn;
    return o.valor_registrado || 0;
  };

  const renderResumoCards = () => {
    // Filtro de mês dos cartões de pipeline — usa atualizado_em (data em que
    // o registro entrou no estágio atual; também é tocado por edições sem
    // troca de estágio, é a aproximação mais próxima disponível sem campo
    // novo). Vazio = todos os meses.
    const noMes = (o: any) => !mesFiltroPipeline || (o.atualizado_em || '').slice(0,7) === mesFiltroPipeline;

    // "Em Negociação" agora também exclui isFaturado explicitamente — antes
    // um negócio já faturado (estágio "Faturado", tipo 'faturado') não era
    // excluído daqui por engano, contando como se ainda estivesse em
    // negociação.
    const opsAtivas      = opsFiltradas.filter(o => !isPerdido(getEst(o.estagio_id)) && !isGanho(getEst(o.estagio_id)) && !isFaturado(getEst(o.estagio_id)) && !isDesistencia(getEst(o.estagio_id)) && noMes(o));
    const opsPerdidas    = opsFiltradas.filter(o => isPerdido(getEst(o.estagio_id)) && noMes(o));
    const opsDesistencias = opsFiltradas.filter(o => isDesistencia(getEst(o.estagio_id)) && noMes(o));
    // Ganhas = todo negócio já vencido, faturado ou não. Aguardando
    // Faturamento = só quem está em "Vencido" e ainda não passou pra
    // "Faturado" (é o que "Ganhas" sozinho representava antes desta mudança).
    const opsAguardandoFaturamento = opsFiltradas.filter(o => isGanho(getEst(o.estagio_id)) && noMes(o));
    const opsGanhas      = opsFiltradas.filter(o => (isGanho(getEst(o.estagio_id)) || isFaturado(getEst(o.estagio_id))) && noMes(o));
    const totalPipeline      = opsAtivas.reduce((s, o) => s + (o.valor_registrado || 0), 0);
    const totalPipelineACN   = opsAtivas.reduce((s, o) => s + receitaEfetiva(o), 0);
    const totalPerdido       = opsPerdidas.reduce((s, o) => s + (o.valor_registrado || 0), 0);
    const totalGanho         = opsGanhas.reduce((s, o) => s + (o.valor_registrado || 0), 0);
    const totalAguardandoFaturamento = opsAguardandoFaturamento.reduce((s, o) => s + (o.valor_registrado || 0), 0);
    // "Total e por Vendedor" reaproveita o filtro Responsável já existente na
    // barra de ferramentas (filtResp) — opsFiltradas já vem filtrado por ele.
    const recorteLabel = filtResp || 'Total (todos os vendedores)';

    const totalMes = opsFiltradas.filter(noMes).length;
    const dist = [
      { rot: 'Negociação', n: opsAtivas.length, fam: 'info' },
      { rot: 'Ganhas', n: opsGanhas.length, fam: 'ok' },
      { rot: 'Perdidas', n: opsPerdidas.length, fam: 'erro' },
      { rot: 'Desistência', n: opsDesistencias.length, fam: 'neutro' },
    ];

    return (
      <div className="acn-crm-resumo">
        {/* Números do funil numa faixa só: valor, quantidade e distribuição */}
        <div className="sec-card acn-pipe">
          <div>
            <span className="rot">Em negociação</span>
            <span className="val acn-num">{podeVer ? fmtMoeda(totalPipeline) : opsAtivas.length}</span>
            <span className="sub">
              <span className="acn-num">{opsAtivas.length}</span> oportunidades
              {podeVer && totalPipelineACN !== totalPipeline && <> · Receita ACN: {fmtMoeda(totalPipelineACN)}</>}
            </span>
          </div>
          <div>
            <span className="rot">Ganhas</span>
            <span className="val acn-num acn-txt-ok">{podeVer ? fmtMoeda(totalGanho) : opsGanhas.length}</span>
            <span className="sub">
              <span className="acn-num">{opsGanhas.length}</span> · {opsAguardandoFaturamento.length} aguardando faturamento
              {podeVer && totalAguardandoFaturamento > 0 && <> ({fmtMoeda(totalAguardandoFaturamento)})</>}
            </span>
          </div>
          <div>
            <span className="rot">Perdidas</span>
            <span className="val acn-num acn-txt-erro">{podeVer ? fmtMoeda(totalPerdido) : opsPerdidas.length}</span>
            <span className="sub"><span className="acn-num">{opsPerdidas.length}</span> perdidas · {opsDesistencias.length} desistência{opsDesistencias.length !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="rot">Distribuição · <span className="acn-num">{totalMes}</span> registros</span>
            <div className="dist" aria-hidden="true">
              {dist.filter(d => d.n > 0).map(d => <i key={d.rot} title={`${d.rot}: ${d.n}`} data-acn-familia={d.fam} style={{ flex: d.n }} />)}
            </div>
            <span className="sub">{dist.map(d => `${d.rot} ${d.n}`).join(' · ')}</span>
            {podeVer && <MarkupBarraDistribuicao valores={opsAtivas.map(o => markupPorOp[o.id]?.pct)} />}
          </div>
        </div>
        <div className="acn-kmeta acn-crm-mes">
          <label htmlFor="crm-mes-pipeline">Mês do pipeline</label>
          <input id="crm-mes-pipeline" type="month" className="acn-input acn-crm-mes-in" value={mesFiltroPipeline} onChange={e => setMesFiltroPipeline(e.target.value)} />
          {mesFiltroPipeline && <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setMesFiltroPipeline('')}>Limpar</Botao>}
          {podeVer && <span>· Recorte: <strong className="acn-crm-recorte">{recorteLabel}</strong> (filtre por vendedor no seletor de responsável)</span>}
        </div>
      </div>
    );
  };

  const renderRelatorio = () => {
    return (
      <div className="acn-crm-rel">
        {renderResumoCards()}

        {/* ── Por estágio ── */}
        {estagiosFunil.map(est => {
          const items   = opsFiltradas.filter(o => o.estagio_id === est.id);
          if (items.length === 0) return null;
          const ganho    = isGanho(est);
          const perdido  = isPerdido(est);
          const desistiu = isDesistencia(est);
          const famEst   = perdido ? 'erro' : ganho ? 'ok' : desistiu ? 'atencao' : undefined;   // a cor do ponto: pela família; a das demais etapas é a que o Admin escolheu
          const totalEst    = items.reduce((s, o) => s + (o.valor_registrado || 0), 0);
          const totalEstACN = items.reduce((s, o) => s + receitaEfetiva(o), 0);
          const hoje2    = hojeISO();

          return (
            <div key={est.id} className="sec-card acn-crm-rel-bloco">
              {/* Header do estágio — cor só no ponto */}
              <div className="acn-kcab acn-crm-rel-cab">
                <i data-acn-familia={famEst} style={famEst ? undefined : { background: est.cor || 'var(--acn-ink)' }} />
                <span>{est.nome}</span>
                <em>{items.length}</em>
                {podeVer && totalEst > 0 && (
                  <span className="acn-crm-rel-tot">
                    <span className="acn-num acn-crm-rel-valor">{fmtMoeda(totalEst)}</span>
                    {totalEstACN !== totalEst && (
                      <span className="acn-num acn-crm-rel-acn">ACN: {fmtMoeda(totalEstACN)}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Linhas de ops */}
              {items.map((op) => (
                <div key={op.id}
                  onClick={() => { setFormOp(formOpFromOp(op)); setModalAbrir(op); setAbrirTabDir('andamento'); setAbrirNovoText(''); }}
                  className="acn-crm-rel-linha"
                >
                  {/* Cor funil */}
                  <span className={'acn-crm-rel-funil ' + (op.funil === 'licitacao' ? 'lic' : 'vd')} />

                  {/* Info principal */}
                  <div className="acn-crm-rel-info">
                    <div className="acn-crm-rel-tit">
                      {op.titulo}
                    </div>
                    <div className="acn-crm-rel-sub">
                      {op.orgao && <span><Icone path={mdiBankOutline} size={12} />{op.orgao}</span>}
                      {op.responsavel_nome && <span><Icone path={mdiAccountOutline} size={12} />{op.responsavel_nome}</span>}
                      {op.tipo_licitacao === 'ata' && <span className="acn-crm-rel-ata">ATA</span>}
                    </div>
                  </div>

                  {/* Coluna direita */}
                  <div className="acn-crm-rel-dir">
                    {podeVer && (op.valor_registrado || 0) > 0 && (
                      <>
                        <div className="acn-crm-rel-v">{fmtMoeda(op.valor_registrado)}</div>
                        {(op.faturamento_empresa==='Detech' || op.classificacao==='Parceiro') && op.valor_acn != null && (
                          <div className="acn-crm-rel-acn2">ACN: {fmtMoeda(op.valor_acn)}</div>
                        )}
                      </>
                    )}
                    {op.prox_contato && (
                      <div className={'acn-crm-rel-prox' + (op.prox_contato <= hoje2 ? ' atrasado' : '')}>
                        <Icone path={mdiCalendarOutline} size={12} />{op.prox_contato}
                        {op.hora_prox_contato && <span><Icone path={mdiClockOutline} size={12} />{String(op.hora_prox_contato).slice(0,5)}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // KANBAN — 5 super-colunas
  // ─────────────────────────────────────────────────────────────────────────
  const SUB_STATUS_LABEL: Record<string,string> = {
    andamento: 'Técnica',
    suspenso:  'Documental',
    aguardando:'Orçamentária',
  };
  /** Área de cards de uma coluna do kanban: altura de 10 cards, rola daí pra
 *  frente. Fica no escopo do módulo (e não dentro do CrmTab) porque componente
 *  declarado dentro de componente remonta a cada render — a coluna voltaria
 *  pro topo sozinha a cada digitada no filtro. */
function ColunaRolavel({ children }: any) {
  const [ref, maxAltura] = useAlturaDeCards();
  return (
    <div ref={ref} className="acn-crm-coluna-rol" style={{ maxHeight: maxAltura || undefined, overflowY: maxAltura ? 'auto' : 'visible' }}>
      {children}
    </div>
  );
}

  const atualizarSubStatus = async (opId: string, novoStatus: string) => {
    const { error } = await supabase.from('crm_oportunidades').update({ sub_status: novoStatus }).eq('id', opId);
    if (error) { mostrarAviso(`Não foi possível trocar a sub-etapa\n${error.message}`, 'erro'); return; }   // 7.62: o erro era ignorado
    await load();
  };

  // Uma coluna por estágio real (ordenado por `ordem`) — cada estágio já é
  // granular o suficiente, não precisa mais do agrupamento em super-colunas.
  const SUPER_COLS = [...estagiosFunil]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map(est => ({
      id:       est.id,
      label:    est.nome,
      tipo:     est.tipo,
      bg:       est.cor || '#1e3a5f',
      dropBg:   (est.cor || '#94a3b8') + '20',
      terminal: !!est.is_final,
      match:    (o: any) => o.estagio_id === est.id,
      estDrop:  () => est.id,
    }));

  // Cada coluna tem a altura de 10 cards e rola daí pra frente, como nos
  // demais kanbans do sistema (ver KanbanColuna.tsx). Aqui a coluna não usa o
  // componente porque ela carrega drag-and-drop, chips de sub-status e o
  // "+ Adicionar" — só a medida da altura é compartilhada.

  const renderKanban = () => {
    if (celular) {
      const etapas = SUPER_COLS.map(c => ({ id: c.id, titulo: c.label, cor: c.bg, total: opsFiltradas.filter(c.match).length }));
      const ativa = etapas.find(e => e.id === etapaCel) ? etapaCel : etapaInicial(etapas);
      const col = SUPER_COLS.find(c => c.id === ativa);
      return (
        <div>
          <SeletorEtapas etapas={etapas} ativa={ativa} onChange={setEtapaCel} />
          {col && renderColunaKanban(col, '100%')}
        </div>
      );
    }
    return (
    <div className="acn-crm-kanban">
      {SUPER_COLS.map(col => renderColunaKanban(col, 264))}
    </div>
    );
  };

  const renderColunaKanban = (col: any, largura: number | string) => {
        const cards = opsFiltradas.filter(col.match);
        const estId = col.estDrop();
        const isDragOver = dragOver === col.id;
        const adicionar = () => { setFormOp({ ...VAZIO_OP, funil, estagio_id: estId }); setModalOp({}); };

        return (
          <div key={col.id} className="acn-kcol acn-crm-col" style={{ width: largura }}>
            {/* Cabeçalho: a cor da etapa fica só no ponto */}
            <div className="acn-kcab">
              <i style={{ background: col.bg }} />
              <span title={col.label}>{col.label}</span>
              <em>{cards.length}</em>
              <span className="acn-crm-col-acoes">
                {col.tipo === 'ganho' && (
                  <Selo familia="neutro" ponto={false}>
                    ACN {cards.filter(o=>o.empresa_vencedora==='ACN').length} · DTC {cards.filter(o=>o.empresa_vencedora==='DETECH').length}
                  </Selo>
                )}
                {!col.terminal && (
                  <span className="acn-num acn-crm-col-sub" title="Técnica · Documental · Orçamentária">
                    {cards.filter(o=>(o.sub_status||'andamento')==='andamento').length} · {cards.filter(o=>o.sub_status==='suspenso').length} · {cards.filter(o=>o.sub_status==='aguardando').length}
                  </span>
                )}
                {!col.terminal && estId && (
                  <Botao pequeno variante="discreto" icone={mdiPlus} onClick={adicionar}
                    title="Adicionar nesta etapa" aria-label={`Adicionar em ${col.label}`} />
                )}
              </span>
            </div>

            {/* Drop zone — só recebe drops de FORA da coluna (cross-col move) */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => { setDragOver(null); estId && handleDrop(estId); }}
              className={'acn-crm-zona' + (isDragOver ? ' sobre' : '')}
            >
              <ColunaRolavel>
              {cards.map(op => (
                <div key={op.id}
                  onDragEnter={e => { e.preventDefault(); if (dragging && dragging !== op.id) setDragOverItem(op.id); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDragLeave={e => { const rel = e.nativeEvent.relatedTarget as Node; if (!e.currentTarget.contains(rel)) setDragOverItem(p => p === op.id ? null : p); }}
                  onDrop={e => {
                    e.stopPropagation(); // impede o drop zone de também processar
                    const draggingOp = ops.find(o => o.id === dragging);
                    if (draggingOp && col.match(draggingOp)) {
                      handleReorderWithTarget(col.match, op.id); // mesmo super-col → reorder
                    } else {
                      setDragOverItem(null);
                      estId && handleDrop(estId); // cross-col move
                    }
                  }}
                >
                  {renderCard(op, col)}

                  {/* Celular/tablet: mudar de etapa sem arrastar */}
                  {toque && (
                    <select value="" className="acn-input acn-crm-mover" onChange={e => { const destino = e.target.value; if (destino) handleDrop(destino, op.id); }}>
                      <option value="">Mover para…</option>
                      {SUPER_COLS.filter(c => c.id !== col.id).map(c => (
                        <option key={c.id} value={c.estDrop()}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              </ColunaRolavel>

              {/* Adicionar (só em etapas abertas) — fica FORA da área que rola,
                  senão numa coluna cheia ele sumiria lá no fim da rolagem. */}
              {!col.terminal && estId && (
                <button type="button" className="acn-kadd" onClick={adicionar}>+ Adicionar</button>
              )}
            </div>
          </div>
        );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PAINEL FATURAMENTOS
  // ─────────────────────────────────────────────────────────────────────────
  const vendasFiltradas = vendas.filter(v => {
    const op = ops.find(o => o.id === v.oportunidade_id);
    if (filtFunil !== 'todos' && op?.funil !== filtFunil) return false;
    if (filtFat   !== 'todos' && v.status_faturamento !== filtFat) return false;
    return true;
  });

  const renderFaturamentos = () => (
    <div>
      {podeVerTotais && (
        <div className="sec-card acn-pipe acn-crm-fat-kpis">
          {[
            { label:'Total vendido', val: totalGeral,         cor:'' },
            { label:'Faturado',      val: totalFaturadoGeral, cor:'acn-txt-ok' },
            { label:'A faturar',     val: totalPendenteGeral, cor:'acn-txt-atencao' },
          ].map(({ label, val, cor }) => (
            <div key={label}>
              <span className="rot">{label}</span>
              <span className={'val acn-num ' + cor}>{fmtMoeda(val)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="acn-crm-fat-filtros">
        <Chips rotulo="Situação do faturamento" ativo={filtFat} onChange={id => setFiltFat(id as any)}
          itens={[{ id:'todos', rotulo:'Todos' }, { id:'pendente', rotulo:'Pendentes', icone: mdiTimerSand }, { id:'faturado', rotulo:'Faturados', icone: mdiCheck }]} />
        <span className="acn-crm-fat-sep" aria-hidden="true" />
        <Chips rotulo="Funil" ativo={filtFunil} onChange={id => setFiltFunil(id as any)}
          itens={[{ id:'todos', rotulo:'Todos' }, { id:'licitacao', rotulo:'Licitações', icone: mdiBankOutline }, { id:'venda_direta', rotulo:'V. Diretas', icone: mdiBriefcaseOutline }]} />
      </div>

      <div className="sec-card acn-crm-fat-tabela">
        <table className="acn-tabela acn-densa">
          <thead>
            <tr>
              {['Funil','Oportunidade','Órgão/Aderente','Operador','Qtd','Valor Total','NF','Data Fat.','Status',''].map(h => (
                <th key={h} className={h === 'Qtd' ? 'centro' : 'esq'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendasFiltradas.length === 0 ? (
              <tr><td colSpan={10} className="acn-crm-fat-vazio">Nenhum registro encontrado</td></tr>
            ) : vendasFiltradas.map(v => {
              const opv = ops.find(o => o.id === v.oportunidade_id);
              return (
                <tr key={v.id}>
                  <td>
                    <Selo familia={opv?.funil==='licitacao' ? 'marca' : 'info'} ponto={false}>
                      {opv?.funil==='licitacao' ? 'Lic.' : 'VD'}
                    </Selo>
                  </td>
                  <td className="acn-crm-fat-op">
                    <strong title={opv?.titulo}>{opv?.titulo || '—'}</strong>
                  </td>
                  <td>{v.orgao_aderente || opv?.orgao || '—'}</td>
                  <td>{v.operador_nome || '—'}</td>
                  <td className="centro">{v.quantidade || '—'}</td>
                  <td className="acn-txt-ok">{currentUser?.ver_valores === false ? '***' : fmtMoeda(v.valor_total)}</td>
                  <td>{v.numero_nf || <span className="acn-txt-atencao">Pendente</span>}</td>
                  <td>{fmtData(v.data_faturamento)}</td>
                  <td>
                    <Selo familia={v.status_faturamento==='faturado' ? 'ok' : v.status_faturamento==='cancelado' ? 'erro' : 'atencao'} ponto={false}>
                      {v.status_faturamento==='faturado' ? 'Faturado' : v.status_faturamento==='cancelado' ? 'Cancelado' : 'Pendente'}
                    </Selo>
                  </td>
                  <td>
                    <Botao pequeno variante="discreto" icone={mdiPencilOutline} title="Editar venda" aria-label="Editar venda"
                      onClick={() => {
                        setModalVenda({ op: opv, venda: v });
                        // os valores entram no campo já no formato brasileiro (1.234,56): o "salvar" trata todo ponto
                        // como separador de milhar, e o número cru do banco (1234.56) virava 123456 ao salvar sem mexer
                        // no valor — 100 vezes maior (achado na revisão dos formulários de edição, 29/09/2026)
                        setFormVenda({ ...VAZIO_VENDA, ...v, valor_unitario: fmtValorEdit(v.valor_unitario), valor_total: fmtValorEdit(v.valor_total) });
                      }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vendasFiltradas.length > 0 && (
          <div className="acn-crm-fat-rodape">
            <span>{vendasFiltradas.length} registros</span>
            {podeVerTotais && currentUser?.ver_valores !== false && (
              <span>Total: <strong className="acn-txt-ok">
                {fmtMoeda(vendasFiltradas.reduce((s,v)=>s+(v.valor_total||0),0))}
              </strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ÁREA LIVRE (rich text editor reutilizável)
  // ─────────────────────────────────────────────────────────────────────────
  const notaNaoLida = camposNaoLidos.has(`nota_${abrirTabDir}`);
  // a faixa que diz por que a aba do card (andamento/documentos) não carregou — com o botão para tentar de novo
  const faixaErroAbrir = erroAbrir ? (
    <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchAbrirTabContent(modalAbrir, abrirTabDir)}>Tentar de novo</Botao>}>Não foi possível ler esta aba ({erroAbrir}). Isso não quer dizer que não haja nada registrado.</Faixa>
  ) : null;
  const NotaLivreEditor = (
    <div className={'acn-crm-nota' + (notaNaoLida ? ' nao-lida' : '')}>
      {erroNota && <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarNotaLivre(modalAbrir, abrirTabDir)}>Tentar de novo</Botao>}>Não foi possível ler a nota que já existe ({erroNota}). Para não apagá-la sem você ver, o botão "Salvar Nota" fica travado até a leitura dar certo.</Faixa>}
      <div className="acn-crm-nota-barra">
        <span className="acn-crm-nota-tit"><Icone path={mdiPinOutline} size={14} />Área Livre</span>
        <Botao pequeno icone={mdiFormatBold} title="Negrito" aria-label="Negrito" onMouseDown={e=>{ e.preventDefault(); document.execCommand('bold'); }} />
        <Botao pequeno icone={mdiFormatItalic} title="Itálico" aria-label="Itálico" onMouseDown={e=>{ e.preventDefault(); document.execCommand('italic'); }} />
        <Botao pequeno icone={mdiLinkVariant} title="Inserir link" aria-label="Inserir link" onMouseDown={e=>{ e.preventDefault(); inserirLinkNota(); }} />
        <Botao pequeno icone={mdiImageOutline} title="Inserir imagem" aria-label="Inserir imagem" onMouseDown={e=>{ e.preventDefault(); abrirNotaImgRef.current?.click(); }} />
        <input ref={abrirNotaImgRef} type="file" accept="image/*" className="acn-lic-oculto"
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagemNota(f); e.target.value=''; }} />
      </div>
      <div
        ref={abrirNotaRef}
        contentEditable
        suppressContentEditableWarning
        className="acn-crm-nota-editor"
        onPaste={e => {
          const items = Array.from(e.clipboardData?.items || []);
          // Se houver HTML no clipboard (ex: tabela colada do Excel/Word), deixa o browser
          // colar normalmente — só intercepta imagem pura (print screen, etc.)
          const hasHtml = items.some(i => i.type === 'text/html');
          const imageItem = items.find(i => i.type.startsWith('image/'));
          if (imageItem && !hasHtml) {
            e.preventDefault();
            const file = imageItem.getAsFile();
            if (file) inserirImagemNota(file);
          }
        }}
      />
      <div className="acn-crm-nota-rodape">
        <Botao variante="primario" pequeno icone={mdiContentSaveOutline} onClick={salvarNotaLivre} disabled={abrirNotaSalvando}>
          {abrirNotaSalvando ? 'Salvando...' : 'Salvar Nota'}
        </Botao>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding:20, color:'#64748b', fontSize:11 }}>Carregando CRM...</div>;

  return (
    <div>

      {/* ── Cabeçalho: título, criar à direita, abas logo abaixo ── */}
      <CabecalhoTela
        titulo={secaoCrm === 'contatos' ? 'Contatos' : funil === 'licitacao' ? 'Licitações' : 'Vendas diretas'}
        subtitulo={secaoCrm === 'funil' ? (
          <>
            <span className="acn-num">{opsFiltradas.length}</span> registros
            {podeVerTotais && <> · Pipeline: <span className="acn-num">{fmtMoeda(opsFiltradas.filter(o=>!isPerdido(getEst(o.estagio_id))&&!isGanho(getEst(o.estagio_id))).reduce((s,o)=>s+(o.valor_registrado||0),0))}</span></>}
          </>
        ) : undefined}
        acoes={secaoCrm === 'funil' && (<>
          <Botao variante="secundario" icone={mdiPlus} onClick={() => setModalNovaOpOs({})}>Nova OP / OS</Botao>
          <Botao variante="primario" icone={mdiPlus} onClick={() => { setFormOp({ ...VAZIO_OP, funil }); setModalOp({}); }}>Nova venda direta</Botao>
        </>)}
        abas={
          <Abas
            ativa={secaoCrm === 'contatos' ? 'contatos' : abaInterna}
            onChange={id => { if (id === 'contatos') setSecaoCrm('contatos'); else { setSecaoCrm('funil'); setAbaInterna(id as any); } }}
            itens={[
              { id:'kanban',    rotulo:'Kanban', icone: mdiViewColumnOutline },
              { id:'agenda',    rotulo:'Agenda', icone: mdiCalendarMonthOutline },
              { id:'recentes',  rotulo:'Últimas visualizadas', icone: mdiHistory },
              { id:'relatorio', rotulo:'Relatório', icone: mdiChartBar },
              { id:'opls',      rotulo:'OPs em aberto', icone: mdiWrenchOutline },
              ...(podeVerFaturamentos ? [{ id:'faturamentos', rotulo:'Faturamentos', icone: mdiCashMultiple }] : []),
              { id:'contatos',  rotulo:'Contatos', icone: mdiCardAccountDetailsOutline },
            ]}
          />
        }
      />

      {erroCarga && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>Não foi possível ler o quadro do CRM ({erroCarga}). Isso não quer dizer que não haja oportunidade{ops.length ? '; o que aparece é da última leitura que deu certo' : ''}.</Faixa>
      )}

      {/* ── Seção Contatos ── */}
      {secaoCrm === 'contatos' && (
        <ContactosSection currentUser={currentUser} />
      )}

      {/* ── Seção Funis (Kanban / Faturamentos) ── */}
      {secaoCrm === 'funil' && <>

      {/* ── Contatos do Dia ── */}
      {contatosHoje.length > 0 && (
        <Faixa tom="atencao" icone={mdiCalendarClockOutline}>
          <b>Contatos agendados para hoje ({contatosHoje.length})</b>
          <div className="acn-crm-hoje">
            {contatosHoje.map(o => (
              <div key={o.id} className="acn-contato-hoje">
                <div className="acn-forte">{o.titulo}</div>
                {o.nome_contato && <div>{o.nome_contato}</div>}
                {o.contato      && <div className="acn-num">{o.contato}</div>}
                <div className="acn-fraco">
                  {o.funil === 'licitacao' ? 'Licitação' : 'Venda direta'}{o.responsavel_nome ? ` · por ${o.responsavel_nome}` : ''}
                </div>
              </div>
            ))}
          </div>
        </Faixa>
      )}

      {/* ── Filtros ── */}
      <div className="acn-kmeta acn-crm-filtros">
        <input className="acn-input acn-crm-busca" placeholder="Título, órgão ou edital" aria-label="Buscar por título, órgão ou edital"
          value={busca} onChange={e => setBusca(e.target.value)} />
        {/* Filtro por responsável */}
        <select className="acn-input acn-crm-sel170" value={filtResp} onChange={e => setFiltResp(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {respUnicos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {filtResp && <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setFiltResp('')} title="Limpar responsável" aria-label="Limpar responsável" />}
        {/* Filtro por tipo de negócio (Revenda/Venda/Pós-vendas) */}
        <select className="acn-input acn-crm-sel140" value={filtTipoNegocio} onChange={e => setFiltTipoNegocio(e.target.value)} aria-label="Tipo de negócio">
          <option value="">Todos os tipos</option>
          {TIPOS_NEGOCIO_CRM.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {filtTipoNegocio && <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setFiltTipoNegocio('')} title="Limpar tipo" aria-label="Limpar tipo" />}
        {/* Filtro por temperatura do lead — mini gráfico de barras clicável */}
        {(() => {
          const contTemp: Record<string, number> = { frio:0, morno:0, quente:0 };
          opsFunil.forEach(o => { if (o.temperatura && contTemp[o.temperatura] !== undefined) contTemp[o.temperatura]++; });
          const maxTemp = Math.max(1, contTemp.frio, contTemp.morno, contTemp.quente);
          const BARRAS = [
            { v:'frio',   label:'🧊 Frio' },
            { v:'morno',  label:'🌤️ Morno' },
            { v:'quente', label:'🔥 Quente' },
          ] as const;
          return (
            <div title="Temperatura dos leads — clique numa barra para filtrar" className="acn-temp-barras">
              {BARRAS.map(b => {
                const n = contTemp[b.v];
                const ativo = filtTemp === b.v;
                const h = Math.max(3, Math.round((n / maxTemp) * 18));
                return (
                  <div key={b.v} onClick={() => setFiltTemp(ativo ? '' : b.v)} title={`${b.label}: ${n}`} className="acn-crm-temp-col">
                    <div className={'acn-crm-temp-barra' + (ativo || !filtTemp ? '' : ' apagada')} data-temp={b.v} style={{ height: h }} />
                  </div>
                );
              })}
            </div>
          );
        })()}
        {filtTemp && <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setFiltTemp('')}>{filtTemp}</Botao>}
      </div>

      {/* ── Conteúdo ── */}
      {abaInterna === 'kanban' && (
        <div>
          <div>{renderResumoCards()}</div>
          <div className="acn-crm-rolax">{renderKanban()}</div>
        </div>
      )}
      {abaInterna === 'agenda' && (
        <div className="acn-crm-agenda">
          <AgendaWidget setor="comercial" currentUser={currentUser} />
        </div>
      )}
      {abaInterna === 'recentes' && (
        <div className="acn-crm-recentes">
          {erroRecentes && <Faixa tom="erro" acao={<Botao pequeno onClick={carregarRecentesCrm}>Tentar de novo</Botao>}>Não foi possível ler as últimas visualizadas ({erroRecentes}). Isso não quer dizer que você não tenha aberto nenhuma.</Faixa>}
          {recentesCrmLoading ? (
            <div className="acn-empty acn-crm-vazio">Carregando...</div>
          ) : recentesCrm.length === 0 ? (
            erroRecentes ? null : <div className="acn-empty acn-crm-vazio">Nenhuma oportunidade visualizada ainda.</div>
          ) : (
            <div className="acn-crm-rec-lista">
              {recentesCrm.map((r: any) => {
                const op = ops.find(o => o.id === r.registro_id);
                if (!op) return null;
                return (
                  <div key={r.registro_id} onClick={() => { setFormOp(formOpFromOp(op)); setModalAbrir(op); setAbrirTabDir('andamento'); setAbrirNovoText(''); }}
                    className="acn-crm-rec-linha">
                    <div className="acn-crm-rec-info">
                      <div className="acn-forte acn-crm-rec-tit">{op.titulo}</div>
                      <div className="acn-ajuda">{op.orgao || '—'} · {getEst(op.estagio_id)?.nome || '—'}</div>
                    </div>
                    <div className="acn-ajuda acn-crm-rec-quando">
                      {new Date(r.visualizado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {abaInterna === 'relatorio' && (
        <div className="acn-crm-rel-pane">{renderRelatorio()}</div>
      )}
      {abaInterna === 'faturamentos' && renderFaturamentos()}
      {abaInterna === 'opls' && (() => {
        // A família de cor de cada status da OP (Engenharia, PCP, produção, liberação, entrega...). O que não está aqui fica cinza.
        const FAMILIA_STATUS_OPL: Record<string,string> = {
          'Em Espera Engenharia':                        'marca',
          'Em Analise Engenharia':                       'marca',
          'Devolvida para Engenharia':                   'erro',
          'Devolvida Comercial':                         'erro',
          'Em Espera PCP':                               'info',
          'Em Analise PCP':                              'info',
          'Em Producao':                                 'atencao',
          [STATUS_AGUARDANDO_LIBERACAO_COMERCIAL]:       'ok',
          'Aguarda Emissao NF':                          'info',
          'Faturado e Disponivel para Entrega':          'info',
          'Aguardando Agendamento Manutenção':           'atencao',
          'Manutenção Agendada':                         'atencao',
        };

        const liberarFiscalCrm = async (o: any) => {
          if (!await confirmar(`Liberar OP ${o.opl} para o Fiscal emitir a NF?`)) return;
          const agora = new Date().toISOString();
          const { error } = await supabase.from('oples').update({
            status_geral: 'Aguarda Emissao NF',
            data_liberacao_comercial: agora,
          }).eq('id', o.id);
          if (error) { alert('Erro: ' + error.message); return; }
          const { error: errLog } = await supabase.from('logs_movimentacao_opl').insert([{
            opl_id: o.id, numero_opl: o.opl, setor: 'Comercial',
            evento: 'OP liberada para emissão de NF pelo Fiscal.',
            status_anterior: o.status_geral, status_novo: 'Aguarda Emissao NF',
            usuario_nome: currentUser?.nome || null, data_hora: agora,
          }]);
          if (errLog) mostrarAviso(`A OP foi liberada, mas o registro no histórico dela não foi gravado\n${errLog.message}`, 'atencao');   // 7.62: o erro era ignorado
          fetchOplsEmAberto();
        };

        // REENVIAR OP DEVOLVIDA AO COMERCIAL (Etapa 3.1 do PLANO_UX_FLUXO_TRABALHO.md)
        //
        // O botão "reenviar" só existia no antigo ComercialTab (fora do menu desde
        // 23/07/2026, na unificação Comercial+CRM; apagado em 29/09/2026). Desde
        // então nenhuma tela viva
        // devolvia a OP para quem a devolveu: em 29/09/2026 havia 10 paradas em
        // "Devolvida Comercial", 4 delas devolvidas pela Engenharia em 17 e 18/09.
        //
        // Regra definida com o usuário em 29/09/2026: a OP volta para QUEM
        // DEVOLVEU — Engenharia -> "Em Espera Engenharia"; Fiscal -> "Aguarda
        // Emissao NF". O botão antigo mandava sempre para a Engenharia, o que
        // faria uma OP pronta, devolvida pelo Fiscal, refazer a análise de
        // engenharia. Sem registro de quem devolveu (status mexido à mão em
        // OplEdicao), vai para a Engenharia, como o botão antigo.
        const destinoDaDevolucao = (o: any) => {
          const dev = devolucoesOpl[o.id];
          const fiscal = dev?.setor === 'Fiscal';
          return {
            setor: fiscal ? 'Fiscal' : 'Engenharia',
            para: fiscal ? 'o Fiscal' : 'a Engenharia',
            status: fiscal ? 'Aguarda Emissao NF' : 'Em Espera Engenharia',
            registrado: !!dev,
          };
        };
        const reenviarDevolvida = async (o: any) => {
          const d = destinoDaDevolucao(o);
          const motivo = String(o.obs_devolucao || '').trim() || '—';
          if (!await confirmar(`Reenviar a OP ${o.opl} para ${d.para}?\n\nMotivo apontado: ${motivo}\n\nConfirme só depois de corrigir o que foi apontado.${d.registrado ? '' : '\n\nNão há registro de quem devolveu esta OP; ela vai para a Engenharia.'}`)) return;
          const agora = new Date().toISOString();
          const novo: any = { status_geral: d.status };
          // Voltando ao Fiscal, o relógio dele recomeça — mesmo que o "Liberar
          // Fiscal" faz —, senão o tempo da correção do Comercial entra na conta do Fiscal.
          if (d.setor === 'Fiscal') novo.data_liberacao_comercial = agora;
          // O .eq('status_geral', ...) vai junto: se outra pessoa já moveu a OP, não sobrescreve.
          const { data: mudou, error } = await supabase.from('oples').update(novo)
            .eq('id', o.id).eq('status_geral', 'Devolvida Comercial').select('id');
          if (error) { alert('Erro ao reenviar: ' + error.message); return; }
          if (!mudou?.length) { alert('Esta OP já mudou de status. A lista foi atualizada.'); fetchOplsEmAberto(); return; }
          const { error: errLogReenvio } = await supabase.from('logs_movimentacao_opl').insert([{
            opl_id: o.id, numero_opl: o.opl, setor: 'Comercial',
            evento: `OP reenviada para ${d.para} após correção do Comercial.`,
            status_anterior: 'Devolvida Comercial', status_novo: d.status,
            usuario_nome: currentUser?.nome || null, data_hora: agora,
          }]);
          if (errLogReenvio) mostrarAviso(`A OP foi reenviada, mas o registro no histórico dela não foi gravado\n${errLogReenvio.message}`, 'atencao');   // 7.62: o erro era ignorado
          logChange({ module: 'comercial', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
            oldRow: { status_geral: o.status_geral }, newRow: novo, user: currentUser });
          // Só a Engenharia tem evento de aviso para "OP enviada"; o "Liberar
          // Fiscal" desta tela também não avisa, então o Fiscal segue igual.
          if (d.setor === 'Engenharia') notificarEvento('op_enviada_engenharia', msg.oplEnviada(o.opl, 'Engenharia', currentUser?.nome));
          mostrarAviso(`OP ${o.opl} reenviada para ${d.para}.`, 'ok');
          fetchOplsEmAberto();
        };

        // Libera para o Fiscal todas as selecionadas de uma vez — mesma
        // regra do botão individual (só as que aguardam a liberação comercial;
        // ignora as demais).
        const LIBERAVEIS_FISCAL = [STATUS_AGUARDANDO_LIBERACAO_COMERCIAL];
        const liberarFiscalEmLote = async () => {
          const alvos = oplsEmAberto.filter((o: any) => oplsSelecionadas.has(o.id) && LIBERAVEIS_FISCAL.includes(o.status_geral));
          if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está pronta para liberação ao Fiscal.'); return; }
          if (!await confirmar(`Liberar ${alvos.length} OP(s) selecionada(s) para o Fiscal emitir a NF?`)) return;
          setAplicandoLoteOpls(true);
          const agora = new Date().toISOString();
          // 7.62: o erro de cada OP era ignorado — a barra fechava como se todas tivessem sido liberadas. Agora diz quais não foram (e só registra no histórico as que foram).
          const falhasLib: string[] = [];
          const semHistoricoLib: string[] = [];
          for (const o of alvos) {
            const { error: errLib } = await supabase.from('oples').update({ status_geral: 'Aguarda Emissao NF', data_liberacao_comercial: agora }).eq('id', o.id);
            if (errLib) { falhasLib.push(`${o.opl}: ${errLib.message}`); continue; }
            const { error: errLogLib } = await supabase.from('logs_movimentacao_opl').insert([{
              opl_id: o.id, numero_opl: o.opl, setor: 'Comercial',
              evento: 'OP liberada para emissão de NF pelo Fiscal (ação em lote).',
              status_anterior: o.status_geral, status_novo: 'Aguarda Emissao NF',
              usuario_nome: currentUser?.nome || null, data_hora: agora,
            }]);
            if (errLogLib) semHistoricoLib.push(`${o.opl}: ${errLogLib.message}`);
          }
          setAplicandoLoteOpls(false);
          setOplsSelecionadas(new Set());
          fetchOplsEmAberto();
          if (falhasLib.length) mostrarAviso(`Algumas OPs não foram liberadas\n${falhasLib.join('\n')}`, 'erro');
          if (semHistoricoLib.length) mostrarAviso(`As OPs foram liberadas, mas o registro no histórico de algumas não foi gravado\n${semHistoricoLib.join('\n')}`, 'atencao');
        };

        // Confirma a entrega ao cliente — usada tanto pelo botão individual
        // (1 OPL) quanto pela ação em lote (várias de uma vez, mesmo nome de
        // quem recebeu para todas — pensado para lote do mesmo cliente).
        const confirmarEntregaLote = umaVez('entrega-lote', async () => {
          if (!modalEntregaLote || modalEntregaLote.length === 0) return;
          if (!nomeRecebeuLote.trim()) { alert('Informe o nome de quem recebeu!'); return; }
          setAplicandoLoteOpls(true);
          const agora = new Date().toISOString();
          // 7.62: o erro de cada OP era ignorado — a janela fechava como se todas tivessem sido entregues, e o aviso de "entregue" saía mesmo com a gravação recusada
          const falhasEntrega: string[] = [];
          const semHistoricoEntrega: string[] = [];
          for (const o of modalEntregaLote) {
            const { error: errEntrega } = await supabase.from('oples').update({
              status_geral: 'Faturado', cliente_recebeu_nome: nomeRecebeuLote.trim(), data_entrega: agora,
            }).eq('id', o.id);
            if (errEntrega) { falhasEntrega.push(`${o.opl}: ${errEntrega.message}`); continue; }
            const { error: errLogEntrega } = await supabase.from('logs_movimentacao_opl').insert([{
              opl_id: o.id, numero_opl: o.opl, setor: 'Comercial',
              evento: `Equipamento entregue. Recebeu: ${nomeRecebeuLote.trim()}`,
              status_anterior: o.status_geral, status_novo: 'Faturado',
              usuario_nome: currentUser?.nome || null, data_hora: agora,
            }]);
            if (errLogEntrega) semHistoricoEntrega.push(`${o.opl}: ${errLogEntrega.message}`);
            notificarEvento('comercial_entregue', msg.entregue(o.opl, o.cliente_nome||'—', nomeRecebeuLote.trim()));
          }
          setAplicandoLoteOpls(false);
          setModalEntregaLote(null); setNomeRecebeuLote('');
          setOplsSelecionadas(new Set());
          fetchOplsEmAberto();
          if (falhasEntrega.length) mostrarAviso(`Algumas entregas não foram confirmadas\n${falhasEntrega.join('\n')}`, 'erro');
          if (semHistoricoEntrega.length) mostrarAviso(`As entregas foram confirmadas, mas o registro no histórico de algumas OPs não foi gravado\n${semHistoricoEntrega.join('\n')}`, 'atencao');
        });
        // Status distintos realmente presentes nas OPLs em aberto — opções do
        // filtro vêm dos dados, não de uma lista fixa (evita mostrar status
        // que hoje não tem nenhuma OPL, e cobre automaticamente algum status
        // novo que apareça no futuro).
        const statusOplDisponiveis = Array.from(new Set(oplsEmAberto.map(o => o.status_geral).filter(Boolean))).sort();

        const oplsFiltradas = oplsEmAberto.filter(o => {
          if (oplsFiltro === 'crm')     return !!o.crm_oportunidade_id;
          if (oplsFiltro === 'sem_crm') return !o.crm_oportunidade_id;
          return true;
        }).filter(o => {
          // Mesmos filtros "Responsável" e busca da barra de ferramentas
          // compartilhada com o Kanban — antes só apareciam na tela sem
          // nunca serem aplicados aqui.
          if (filtResp && o.responsavel_comercial !== filtResp) return false;
          if (filtStatusOpl && o.status_geral !== filtStatusOpl) return false;
          return combinaBusca([o.opl, o.cliente_nome, o.modelo], busca);
        }).sort((a, b) => {
          // "Parada há mais tempo": a data mais antiga primeiro; sem data vai para o fim. Na ordem
          // normal devolve 0 e o sort estável mantém a ordem da consulta (entrada, mais nova antes).
          if (oplsOrdem !== 'parada') return 0;
          const ta = desdeOpls[a.id] ? new Date(desdeOpls[a.id].data).getTime() : NaN;
          const tb = desdeOpls[b.id] ? new Date(desdeOpls[b.id].data).getTime() : NaN;
          if (isNaN(ta) && isNaN(tb)) return 0;
          if (isNaN(ta)) return 1;
          if (isNaN(tb)) return -1;
          return ta - tb;
        });
        return (
          <div className="acn-crm-opls">
            {/* Filtros */}
            <div className="acn-crm-opl-filtros">
              <Chips rotulo="Vínculo com o CRM" ativo={oplsFiltro} onChange={id => setOplsFiltro(id as any)}
                itens={[{ id:'todos', rotulo:'Todas' }, { id:'crm', rotulo:'Vinculadas ao CRM' }, { id:'sem_crm', rotulo:'Sem vínculo CRM' }]} />
              <select className={'acn-input acn-crm-opl-sel' + (filtStatusOpl ? ' ativo' : '')} value={filtStatusOpl} onChange={e => setFiltStatusOpl(e.target.value)}>
                <option value="">Status: Todos</option>
                {statusOplDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {filtStatusOpl && (
                <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setFiltStatusOpl('')} title="Limpar filtro de status" aria-label="Limpar filtro de status" />
              )}
              <select className={'acn-input acn-crm-opl-sel' + (oplsOrdem === 'parada' ? ' ativo' : '')} value={oplsOrdem} onChange={e => setOplsOrdem(e.target.value as any)}
                title="Parada há mais tempo: a OP que entrou na etapa de hoje há mais dias vem primeiro; o lote fica junto, na posição da unidade mais parada">
                <option value="entrada">Ordem: entrada (mais recentes)</option>
                <option value="parada">Ordem: parada há mais tempo</option>
              </select>
              <span className="acn-ajuda acn-crm-opl-conta">
                {oplsFiltradas.length} OP{oplsFiltradas.length !== 1 ? 's' : ''}
              </span>
              <Botao pequeno icone={mdiRefresh} onClick={fetchOplsEmAberto} title="Atualizar a lista" aria-label="Atualizar a lista" />
            </div>

            {erroOpls && <Faixa tom="erro" acao={<Botao pequeno onClick={fetchOplsEmAberto}>Tentar de novo</Botao>}>Não foi possível ler as OPs em aberto ({erroOpls}). Isso não quer dizer que não haja OP{oplsEmAberto.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.</Faixa>}
            {oplsLoading ? (
              <div className="acn-empty acn-crm-vazio">Carregando...</div>
            ) : oplsFiltradas.length === 0 ? (
              erroOpls ? null : <div className="acn-empty acn-crm-vazio">Nenhuma OP em aberto.</div>
            ) : (
              <div className="acn-crm-rolax">
                <table className="acn-tabela acn-densa">
                  <thead>
                    <tr>
                      <th></th>
                      {['OP','Cliente','Tipo/Veículo','Empresa','Status','Onde está / desde','Entrada','Prazo','Responsável','CRM','Ações'].map(h => (
                        <th key={h} className="esq">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
                      const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
                      const semDado = (v) => !v || !String(v).trim();
                      const hoje = hojeISO();

                      const basesJaRenderizadas = new Set();
                      const itens: any[] = [];
                      for (const o of oplsFiltradas) {
                        const base = baseOplDe(o.opl);
                        const irmaos = oplsFiltradas.filter(x => baseOplDe(x.opl) === base);
                        if (irmaos.length > 1) {
                          if (basesJaRenderizadas.has(base)) continue;
                          basesJaRenderizadas.add(base);
                          itens.push({ tipo: 'lote', base, irmaos: [...irmaos].sort((a,b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
                        } else {
                          itens.push({ tipo: 'single', row: o });
                        }
                      }

                      // A linha só mostra. Editar abre o modal com todos os campos
                      // da OP (ver ModalOplComercial em OplEdicao.tsx) — antes a
                      // própria linha virava formulário e abria uma faixa extra
                      // embaixo, onde só cabia parte dos dados (24/09/2026).
                      const renderLinhaOpl = (o: any) => {
                        const atrasada = o.data_prevista_entrega && o.data_prevista_entrega < hoje;
                        const crmCard  = ops.find(op => op.id === o.crm_oportunidade_id);
                        const oplNaoLida = oplsNaoLidas.has(String(o.id));
                        const linha = (
                          <tr key={o.id} className={'acn-crm-opl-linha' + (oplNaoLida ? ' nao-lida' : '')}
                            title={oplNaoLida ? 'Esta OP tem alteração(ões) que você ainda não visualizou' : undefined}>
                            <td className="centro">
                              <input type="checkbox" className="acn-crm-opl-check" checked={oplsSelecionadas.has(o.id)} onChange={()=>toggleOplSelecionada(o.id)} />
                            </td>
                            <td className="acn-forte acn-lic-nowrap">
                              <LinkOpl opl={o} currentUser={currentUser} />
                            </td>
                            <td className="acn-crm-opl-cli">
                              {o.cliente_nome||'—'}
                            </td>
                            <td className="acn-crm-opl-tipo">
                              <div className={'acn-crm-opl-fluxo' + (o.fluxo_entrega ? '' : ' sem')}>
                                <Icone path={mdiTrafficLight} size={13} />{fluxoLabel(o.fluxo_entrega)}
                              </div>
                              <div className="acn-ajuda">{o.tipo_projeto || '—'}</div>
                              <VeiculoOuEnvio o={o} />
                              {!semDado(o.cnpj_faturamento) && <div className="acn-crm-opl-cnpj"><Icone path={mdiDomain} size={13} />{o.cnpj_faturamento}</div>}
                            </td>
                            <td className="acn-lic-nowrap">
                              <Selo familia={o.faturamento_empresa==='Detech' ? 'atencao' : 'marca'} ponto={false}>
                                {o.faturamento_empresa||'ACN'}
                              </Selo>
                            </td>
                            <td className="acn-lic-nowrap">
                              <Selo familia={FAMILIA_STATUS_OPL[o.status_geral] || 'neutro'} ponto={false}>
                                {o.status_geral||'—'}
                              </Selo>
                              {o.status_geral === 'Devolvida Comercial' && (() => {
                                const dev = devolucoesOpl[o.id];
                                const motivo = String(o.obs_devolucao || '').trim();
                                return (
                                  <div title={motivo || undefined} className="acn-crm-opl-dev">
                                    ↩ {dev?.setor || 'Setor não registrado'}
                                    {dev?.usuario_nome ? ` · ${dev.usuario_nome}` : ''}
                                    {dev?.data_hora ? ` · ${new Date(dev.data_hora).toLocaleDateString('pt-BR')}` : ''}
                                    {motivo && <div className="acn-crm-opl-dev-obs">{motivo}</div>}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="acn-crm-opl-onde">
                              <OndeEstaCelula op={o} desde={desdeOpls[o.id] || null} pendencias={pendenciasOpls[o.id] || []} />
                            </td>
                            <td className="acn-fraco acn-lic-nowrap">
                              {o.data_entrada ? new Date(o.data_entrada+'T12:00').toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className={'acn-lic-nowrap ' + (atrasada ? 'acn-txt-erro' : 'acn-fraco')}>
                              {o.data_prevista_entrega ? new Date(o.data_prevista_entrega+'T12:00').toLocaleDateString('pt-BR') : '—'}
                              {atrasada && ' ⚠️'}
                            </td>
                            <td className="acn-crm-opl-resp">
                              {o.responsavel_comercial||'—'}
                            </td>
                            <td>
                              {crmCard ? (
                                <Botao pequeno icone={mdiLinkVariant} onClick={() => { setFormOp(formOpFromOp(crmCard)); setModalAbrir(crmCard); setAbrirTabDir('andamento'); setAbrirNovoText(''); }}>
                                  {crmCard.titulo?.slice(0,20)||'CRM'}
                                </Botao>
                              ) : (
                                <span className="acn-fraco">—</span>
                              )}
                            </td>
                            <td className="acn-lic-nowrap">
                              <div className="acn-crm-opl-acoes">
                                {/* Botão de liberação para Fiscal — aparece somente quando a OP aguarda a liberação comercial */}
                                {aguardaLiberacaoComercial(o.status_geral) && (
                                  <Botao pequeno variante="primario" icone={mdiSendOutline} onClick={() => liberarFiscalCrm(o)}>
                                    LIBERAR FISCAL
                                  </Botao>
                                )}
                                {o.status_geral === 'Devolvida Comercial' && (() => {
                                  const d = destinoDaDevolucao(o);
                                  return (
                                    <Botao pequeno icone={mdiUndoVariant} onClick={() => reenviarDevolvida(o)}
                                      title={`Corrija o que foi apontado e reenvie para ${d.para}`}>
                                      REENVIAR P/ {d.setor === 'Fiscal' ? 'FISCAL' : 'ENGENHARIA'}
                                    </Botao>
                                  );
                                })()}
                                {o.status_geral === 'Faturado e Disponivel para Entrega' && (
                                  <Botao pequeno variante="primario" icone={mdiCheckCircleOutline} onClick={() => { setModalEntregaLote([o]); setNomeRecebeuLote(''); }}>
                                    CONFIRMAR ENTREGA
                                  </Botao>
                                )}
                                <Botao pequeno icone={mdiPencilOutline} title="Editar todos os dados desta OP" onClick={() => abrirEdicaoOpl(o)}>
                                  Editar
                                </Botao>
                                <Botao pequeno icone={mdiCommentTextOutline} title="Acompanhamentos / Notas" onClick={() => setOplAcomp(o)}>
                                  Notas
                                </Botao>
                                <Botao pequeno icone={mdiPackageVariantClosed} title="Solicitar Compra pra esta OP"
                                  onClick={() => {
                                    setModalCompras({ id: o.crm_oportunidade_id || null,
                                      titulo: `OP ${o.opl} — ${o.cliente_nome || o.modelo || ''}`,
                                      orgao: null, _oplText: o.opl, _oplId: o.id,
                                      _oplDescricao: `${o.opl} — ${o.cliente_nome || o.modelo || ''}`.replace(/ — $/, '') });
                                  }}>
                                  Compra
                                </Botao>
                                <OplAnexosWidget opl={o} setor="Comercial/CRM" currentUser={currentUser} compact={true} />
                              </div>
                            </td>
                          </tr>
                        );
                        return linha;
                      };

                      return itens.map((item) => {
                        if (item.tipo === 'single') return renderLinhaOpl(item.row);
                        const { base, irmaos } = item;
                        const expandido = !!lotesExpandidosOpls[base];
                        const rep = irmaos[0];
                        const qtdSemChassi = irmaos.filter(o => semDado(o.chassi)).length;
                        const qtdSemPlaca  = irmaos.filter(o => semDado(o.placa)).length;
                        const qtdSemModelo = irmaos.filter(o => semDado(o.modelo)).length;
                        const todasLoteSelecionadas = irmaos.every((o:any) => oplsSelecionadas.has(o.id));
                        const maisParada = irmaos.map((o:any) => desdeOpls[o.id]).filter(Boolean)
                          .sort((a:any, b:any) => new Date(a.data).getTime() - new Date(b.data).getTime())[0];
                        return (
                          <React.Fragment key={base}>
                            <tr className="acn-crm-opl-lote">
                              <td className="centro">
                                <input type="checkbox" className="acn-crm-opl-check" checked={todasLoteSelecionadas} title="Selecionar todas as unidades deste lote"
                                  onChange={()=>setOplsSelecionadas(prev => {
                                    const novo = new Set(prev);
                                    irmaos.forEach((o:any) => { if (todasLoteSelecionadas) novo.delete(o.id); else novo.add(o.id); });
                                    return novo;
                                  })} />
                              </td>
                              <td className="acn-lic-nowrap">
                                <span className="acn-crm-opl-lote-base"><Icone path={mdiLinkVariant} size={13} />{base}</span>
                                <div>
                                  <Selo familia="marca" ponto={false}>LOTE — {irmaos.length} unidades</Selo>
                                </div>
                              </td>
                              <td>{rep.cliente_nome||'—'}</td>
                              <td className="acn-crm-opl-faltas">
                                {(qtdSemModelo + qtdSemChassi + qtdSemPlaca) > 0 ? (
                                  <div className="acn-crm-opl-faltas-col">
                                    {qtdSemModelo > 0 && <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={12} />{qtdSemModelo} sem modelo</span>}
                                    {qtdSemChassi > 0 && <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={12} />{qtdSemChassi} sem chassi</span>}
                                    {qtdSemPlaca  > 0 && <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={12} />{qtdSemPlaca} sem placa</span>}
                                  </div>
                                ) : <span className="acn-txt-ok">✓ dados completos</span>}
                              </td>
                              <td>
                                <Selo familia={rep.faturamento_empresa==='Detech' ? 'atencao' : 'marca'} ponto={false}>
                                  {rep.faturamento_empresa||'ACN'}
                                </Selo>
                              </td>
                              <td colSpan={5} className="acn-ajuda">
                                Ver unidades para detalhes individuais
                                {maisParada && (
                                  <div className="acn-crm-opl-parada" title="A unidade deste lote que está há mais tempo na etapa em que se encontra">
                                    ⏱ a mais parada: {maisParada.fonte === 'marco' ? '≈ ' : ''}{textoDias(diasDesde(maisParada.data))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="acn-crm-opl-acoes">
                                  <Botao pequeno variante="discreto" icone={expandido ? mdiChevronUp : mdiChevronDown} onClick={()=>setLotesExpandidosOpls(s=>({...s,[base]:!expandido}))}>
                                    {expandido ? 'Ocultar' : `Ver ${irmaos.length}`}
                                  </Botao>
                                  <Botao pequeno icone={mdiCar} title="Lançar chassi/placa/CNPJ de todas as unidades de uma vez"
                                    onClick={()=>abrirModalLote(irmaos)}>
                                    Lote
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
              </div>
            )}

            {/* ── Barra de ação em lote — seleção livre por checkbox, não precisa ser do mesmo lote/base ── */}
            {oplsSelecionadas.size > 0 && (
              <div className="acn-crm-lote-barra">
                <strong>{oplsSelecionadas.size} selecionada{oplsSelecionadas.size!==1?'s':''}</strong>
                <Botao pequeno variante="primario" icone={mdiSendOutline} disabled={aplicandoLoteOpls} onClick={liberarFiscalEmLote}>
                  {aplicandoLoteOpls ? 'Aplicando...' : 'Liberar Fiscal em Lote'}
                </Botao>
                <Botao pequeno variante="primario" icone={mdiCheckCircleOutline}
                  onClick={() => {
                    const alvos = oplsEmAberto.filter((o:any) => oplsSelecionadas.has(o.id) && o.status_geral === 'Faturado e Disponivel para Entrega');
                    if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está "Faturado e Disponível para Entrega".'); return; }
                    setModalEntregaLote(alvos); setNomeRecebeuLote('');
                  }}>
                  Confirmar Entrega em Lote
                </Botao>
                {podeEditarOplCompleta(currentUser) && (
                  <Botao pequeno icone={mdiPencilOutline} onClick={abrirEditarLoteOpls}
                    title="Alterar um campo em todas as OPs marcadas (Admin/Gerente)">
                    Editar selecionadas
                  </Botao>
                )}
                <Botao pequeno variante="discreto" icone={mdiSelectionOff} onClick={()=>setOplsSelecionadas(new Set())}>
                  Limpar seleção
                </Botao>
              </div>
            )}
            {editarLoteOpls && (
              <ModalEditarOplLote ops={editarLoteOpls} currentUser={currentUser} onClose={()=>setEditarLoteOpls(null)}
                onSalvo={()=>{ setEditarLoteOpls(null); setOplsSelecionadas(new Set()); fetchOplsEmAberto(); }} />
            )}

            {/* ── Modal Confirmar Entrega (individual e em lote — mesmo nome de quem recebeu para todas) ── */}
            {modalEntregaLote && (
              <div className="modal-overlay acn-crm-overlay acn-crm-ov-entrega" onClick={e=>{if(e.target===e.currentTarget && !aplicandoLoteOpls){setModalEntregaLote(null);setNomeRecebeuLote('');}}}>
                <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-entrega" role="dialog" aria-label="Confirmar Entrega">
                  <div className="acn-modal-cab">
                    <span className="modal-title"><Icone path={mdiCheckCircleOutline} size={18} />Confirmar Entrega{modalEntregaLote.length>1?` — ${modalEntregaLote.length} unidades`:` — ${modalEntregaLote[0]?.opl}`}</span>
                  </div>
                  <div className="acn-modal-corpo acn-form-cheio">
                    <div className="acn-ajuda">
                      {modalEntregaLote.length > 1
                        ? 'O nome informado será registrado como quem recebeu em todas as unidades selecionadas.'
                        : `Cliente: ${modalEntregaLote[0]?.cliente_nome || '—'}`}
                    </div>
                    <div>
                      <label className="acn-label">Nome de quem recebeu *</label>
                      <input className="acn-input" autoFocus
                        placeholder="Nome do receptor" value={nomeRecebeuLote} onChange={e=>setNomeRecebeuLote(e.target.value)}
                        onKeyDown={e=>e.key==='Enter' && confirmarEntregaLote()} />
                    </div>
                  </div>
                  <div className="acn-modal-rodape acn-sac-rodape">
                    <Botao variante="primario" disabled={aplicandoLoteOpls} onClick={confirmarEntregaLote}>
                      {aplicandoLoteOpls ? 'Aplicando...' : 'CONFIRMAR'}
                    </Botao>
                    <Botao disabled={aplicandoLoteOpls} onClick={()=>{setModalEntregaLote(null);setNomeRecebeuLote('');}}>Cancelar</Botao>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      </> /* fim secaoCrm === 'funil' */}

      {/* ══════ MODAL CRIAR/EDITAR OP ══════ */}
      {modalOp !== null && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-op">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-op" role="dialog" aria-label="Venda Direta">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={modalOp?.id ? mdiPencilOutline : mdiPlus} size={18} />{modalOp?.id ? 'Editar' : 'Nova'} Venda Direta</span>
            </div>

            <div className="acn-modal-corpo acn-form-cheio">
              {/* Campos texto */}
              {([
                { label:'Título *', key:'titulo', placeholder:'Ex: Projeto Rádios SESP 2025' },
                { label:'Valor Estimado (R$)', key:'valor_registrado', placeholder:'Ex: 280000' },
              ] as any[]).map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="acn-label">{label}</label>
                  <input className="acn-input" type={type||'text'} value={formOp[key]||''} placeholder={placeholder}
                    onChange={e => setFormOp(f => ({...f, [key]: e.target.value}))} />
                </div>
              ))}

              <div>
                <label className="acn-label">Cliente (opcional)</label>
                <ClienteAutocomplete
                  value={formOp._cliente_nome || ''}
                  onChange={v => setFormOp(f => ({ ...f, _cliente_nome: v, cliente_id: null }))}
                  onSelect={c => setFormOp(f => ({ ...f, _cliente_nome: c.nome, cliente_id: c.id }))}
                  placeholder="Vincular cliente do cadastro..."
                />
                {formOp.cliente_id && (
                  <div className="acn-ajuda acn-txt-ok">
                    <Icone path={mdiCheck} size={12} /> Cliente vinculado — dados serão puxados automaticamente ao lançar OS
                  </div>
                )}
              </div>

              <div>
                <label className="acn-label">Responsável / Operador</label>
                <ColaboradorSelect
                  value={formOp.responsavel_nome||''}
                  onChange={v => setFormOp(f => ({...f, responsavel_nome: v}))}
                  placeholder="Selecione o operador"
                />
              </div>

              {/* ── Campos de contato ── */}
              <div className="acn-quadro tom-info">
                <div className="acn-quadro-titulo acn-crm-tit-ic"><Icone path={mdiPhoneOutline} size={14} />CONTATO</div>
                <div>
                  <label className="acn-label">Nome</label>
                  <input className="acn-input" placeholder="Nome do contato"
                    value={formOp.nome_contato||''} onChange={e => setFormOp(f => ({...f, nome_contato: e.target.value}))} />
                </div>
                <div className="acn-grade-2">
                  <div>
                    <label className="acn-label">Telefone</label>
                    <input className="acn-input" placeholder="(99) 99999-9999"
                      value={formOp.contato||''} onChange={e => setFormOp(f => ({...f, contato: e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">E-mail</label>
                    <input className="acn-input" placeholder="email@exemplo.com"
                      value={formOp.contato_email||''} onChange={e => setFormOp(f => ({...f, contato_email: e.target.value}))} />
                  </div>
                </div>
                <div className="acn-grade-2">
                  <div>
                    <label className="acn-label">Próximo Contato</label>
                    <input type="date" className="acn-input"
                      value={formOp.prox_contato||''} onChange={e => setFormOp(f => ({...f, prox_contato: e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Hora do Contato</label>
                    <input type="time" className="acn-input"
                      value={formOp.hora_prox_contato||''} onChange={e => setFormOp(f => ({...f, hora_prox_contato: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* ── Empresa / Faturamento ── */}
              <div className="acn-quadro tom-atencao">
                <div className="acn-quadro-titulo acn-crm-tit-ic"><Icone path={mdiDomain} size={14} />EMPRESA / FATURAMENTO</div>
                <div className="acn-grade-2">
                  <div>
                    <label className="acn-label">Empresa Faturante</label>
                    <select className="acn-input"
                      value={formOp.faturamento_empresa||'ACN'}
                      onChange={e => setFormOp((f:any) => ({ ...f, faturamento_empresa: e.target.value }))}>
                      <option value="ACN">ACN</option>
                      <option value="Detech">Detech</option>
                    </select>
                  </div>
                  <div>
                    <label className="acn-label">
                      Valor ACN/Detech (R$)
                      <span className="acn-fraco"> parceiro</span>
                    </label>
                    <input className="acn-input" type="text"
                      placeholder="Valor que entra como receita"
                      value={formOp.valor_acn||''}
                      onChange={e => setFormOp((f:any) => ({ ...f, valor_acn: e.target.value }))} />
                  </div>
                </div>
                {(formOp.faturamento_empresa==='Detech' || formOp.classificacao==='Parceiro') && !formOp.valor_acn && (
                  <div className="acn-ajuda atencao acn-crm-aviso-ic">
                    <Icone path={mdiAlertOutline} size={12} />Preencha o Valor ACN/Detech para que o relatório contabilize corretamente a receita real.
                  </div>
                )}
              </div>
            </div>

            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalOp(null)}>Cancelar</Botao>
              <Botao variante="primario" onClick={salvarOportunidade} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CHECKLIST GATE ══════ */}
      {modalGate && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-gate">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-gate" role="dialog" aria-label="Checklist obrigatório">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiClipboardTextOutline} size={18} />Gate Lean — Checklist Obrigatório</span>
            </div>
            <div className="acn-modal-corpo">
              <Faixa tom="atencao">
                Para avançar para <strong>"{getEst(modalGate.estagioDestId)?.nome}"</strong>, conclua os itens obrigatórios:
              </Faixa>

              <div>
                {modalGate.itens.map((it: any) => {
                  const done = !!modalGate.prog?.find((p: any) => p.item_id === it.id && p.concluido);
                  return (
                    <div key={it.id} onClick={() => toggleItem(modalGate.op.id, it.id, done)} className="acn-crm-gate-item">
                      <span className={'acn-crm-gate-cx' + (done ? ' ok' : '')}>{done && <Icone path={mdiCheck} size={12} />}</span>
                      <span className="acn-crm-gate-txt">{it.item_texto}</span>
                      {it.obrigatorio && <span className="acn-crm-gate-obrig">OBRIG.</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {(() => {
              const ok = modalGate.itens.filter((i:any)=>i.obrigatorio).every((i:any)=>modalGate.prog?.find((p:any)=>p.item_id===i.id&&p.concluido));
              return (
                <div className="acn-modal-rodape">
                  <Botao onClick={() => setModalGate(null)}>Cancelar</Botao>
                  <Botao variante={ok ? 'primario' : 'secundario'} icone={ok ? mdiCheck : mdiLockOutline} className={ok ? undefined : 'pendente'}
                    onClick={() => { if (ok) { const alvo = modalGate; setModalGate(null); moverCard(alvo.op.id, alvo.estagioDestId); } }}>
                    {ok ? 'Avançar Estágio' : 'Itens pendentes'}
                  </Botao>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════ MODAL EMPRESA VENCEDORA ══════ */}
      {modalEmpresaVenc && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-emp">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-emp" role="dialog" aria-label="Qual empresa venceu?">
            <div className="acn-modal-cab">
              <span className="modal-title acn-crm-tit-ok"><Icone path={mdiTrophyOutline} size={18} />Licitação Vencida!</span>
            </div>
            <div className="acn-modal-corpo">
              <div>
                <strong>{modalEmpresaVenc.op.titulo}</strong><br/>
                Qual empresa venceu esta licitação?
              </div>
              <div className="acn-crm-emp-botoes">
                {(['ACN','DETECH'] as const).map(emp => (
                  <Botao key={emp} className={'acn-crm-emp-btn ' + (emp === 'ACN' ? 'acn' : 'dtc')} onClick={() => escolherEmpresaVencedora(emp)}>
                    {emp}
                  </Botao>
                ))}
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalEmpresaVenc(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL GATE ENVIADO — PV + TEMPERATURA + CONTATO ══════ */}
      {modalEnviado && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-enviado">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-enviado" role="dialog" aria-label="Enviar Proposta">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiSendOutline} size={18} />Enviar Proposta</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div><strong>{modalEnviado.op.titulo}</strong></div>

              <div>
                <label className="acn-label">Número do PV (4 dígitos) *</label>
                {(() => {
                  // PV já atribuído: só Admin e gerentes trocam (confirmarEnviado confere no banco)
                  const pvTravado = !!String(modalEnviado?.op?.numero_pv || '').trim() && !podeAlterarNumeroOplPv(currentUser);
                  return (
                    <input className={'acn-input acn-crm-pv' + (pvTravado ? ' travado' : '')}
                      value={pvTexto} placeholder="0000" maxLength={4} disabled={pvTravado}
                      title={pvTravado ? 'PV já atribuído. Só administradores e gerentes podem alterar o número.' : undefined}
                      onChange={e => setPvTexto(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus={!pvTravado} />
                  );
                })()}
              </div>

              <div>
                <label className="acn-label">Temperatura do Lead *</label>
                <div className="acn-crm-termo">
                  {temperaturaSel && (
                    <div className="acn-crm-termo-ponto" style={{ left: temperaturaSel==='frio' ? '0%' : temperaturaSel==='morno' ? '50%' : '100%' }} />
                  )}
                </div>
                <div className="acn-crm-temp-opcoes">
                  {([
                    { v:'frio',   label:'🧊 Frio' },
                    { v:'morno',  label:'🌤️ Morno' },
                    { v:'quente', label:'🔥 Quente' },
                  ] as const).map(t => (
                    <button key={t.v} type="button" onClick={() => setTemperaturaSel(t.v)} data-temp={t.v}
                      className={'acn-crm-temp-opc' + (temperaturaSel===t.v ? ' on' : '')}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="acn-label">Próximo Contato *</label>
                <div className="acn-crm-data-hora">
                  <input type="date" className="acn-input"
                    value={enviadoContatoData} onChange={e => setEnviadoContatoData(e.target.value)} />
                  <input type="time" className="acn-input"
                    value={enviadoContatoHora} onChange={e => setEnviadoContatoHora(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalEnviado(null)} disabled={salvandoEnviado}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiCheck} onClick={confirmarEnviado} disabled={salvandoEnviado}>
                {salvandoEnviado ? 'Salvando...' : 'Confirmar Envio'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL EDITAR TEMPERATURA (a qualquer momento) ══════ */}
      {modalEditarTemp && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-temp"
          onClick={e => { if (e.target === e.currentTarget) setModalEditarTemp(null); }}>
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-temp" role="dialog" aria-label="Temperatura do Lead">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiThermometer} size={18} />Temperatura do Lead</span>
            </div>
            <div className="acn-modal-corpo">
              <div><strong>{modalEditarTemp.titulo}</strong></div>
              <div>
                <div className="acn-crm-termo">
                  {tempEditSel && (
                    <div className="acn-crm-termo-ponto" style={{ left: tempEditSel==='frio' ? '0%' : tempEditSel==='morno' ? '50%' : '100%' }} />
                  )}
                </div>
                <div className="acn-crm-temp-opcoes">
                  {([
                    { v:'frio',   label:'🧊 Frio' },
                    { v:'morno',  label:'🌤️ Morno' },
                    { v:'quente', label:'🔥 Quente' },
                  ] as const).map(t => (
                    <button key={t.v} type="button" onClick={() => setTempEditSel(t.v)} data-temp={t.v}
                      className={'acn-crm-temp-opc' + (tempEditSel===t.v ? ' on' : '')}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalEditarTemp(null)} disabled={salvandoTempEdit}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiCheck} onClick={confirmarEdicaoTemp} disabled={salvandoTempEdit || !tempEditSel}>
                {salvandoTempEdit ? 'Salvando...' : 'Salvar'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ AVISO — BLOQUEIO DO ESTÁGIO FATURADO ══════ */}
      {avisoFaturadoBloq && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-fat"
          onClick={() => setAvisoFaturadoBloq(null)}>
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-fatbloq" role="dialog" aria-label="Ainda não pode ir para Faturado"
            onClick={e => e.stopPropagation()}>
            <div className="acn-modal-cab">
              <span className="modal-title acn-crm-tit-bad"><Icone path={mdiCancel} size={18} />Ainda não pode ir para Faturado</span>
            </div>
            <div className="acn-modal-corpo">
              <div><strong>{avisoFaturadoBloq.op.titulo}</strong></div>
              {avisoFaturadoBloq.semOpl ? (
                <div className="acn-ajuda">
                  Nenhuma OP está vinculada a esta oportunidade ainda. Lance a OP (botão "📋 Lançar OP") antes de faturar e entregar.
                </div>
              ) : (
                <div className="acn-ajuda">
                  Esta ainda tem OP(s) sem confirmação de faturamento/entrega:
                  <ul className="acn-crm-fatbloq-lista">
                    {avisoFaturadoBloq.pendentes.map((o: any) => (
                      <li key={o.opl}>{o.opl} — <em>{o.status_geral || 'sem status'}</em></li>
                    ))}
                  </ul>
                  <div className="acn-crm-fatbloq-nota">Confirme a entrega na aba Fiscal (tabela "Já Faturados") antes de mover para Faturado.</div>
                </div>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={() => setAvisoFaturadoBloq(null)}>Entendido</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL MOTIVO PERDA ══════ */}
      {modalMotivo && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-motivo">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-motivo" role="dialog" aria-label="Registrar como Não Vencida/Perdida">
            <div className="acn-modal-cab">
              <span className="modal-title acn-crm-tit-bad"><Icone path={mdiCloseCircleOutline} size={18} />Registrar como Não Vencida/Perdida</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div>
                Informe o motivo para <strong>"{modalMotivo.op.titulo}"</strong>:
              </div>
              <textarea className="acn-input acn-crm-motivo-txt" value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)}
                placeholder="Ex: Preço acima do mercado, prazo incompatível, concorrência..." />
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalMotivo(null)}>Cancelar</Botao>
              <Botao variante="perigo" onClick={confirmarPerda}>Confirmar Perda</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL DESISTÊNCIA ══════ */}
      {modalDesist && (
        <div className="modal-overlay acn-crm-overlay acn-crm-ov-motivo">
          <div className="modal-box acn-modal-cadastro acn-crm-jan acn-crm-motivo" role="dialog" aria-label="Registrar Desistência">
            <div className="acn-modal-cab">
              <span className="modal-title acn-crm-tit-warn"><Icone path={mdiCancel} size={18} />Registrar Desistência</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div>
                Motivo da desistência em <strong>"{modalDesist.op.titulo}"</strong>:
              </div>
              <textarea className="acn-input acn-crm-motivo-txt" value={desistTexto} onChange={e => setDesistTexto(e.target.value)}
                placeholder="Ex: Edital desfavorável, fora do escopo, capacidade técnica insuficiente, decisão estratégica..."
                autoFocus />
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={() => setModalDesist(null)}>Cancelar</Botao>
              <Botao variante="perigo" onClick={confirmarDesistencia}>Confirmar Desistência</Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL SOLICITAR ANÁLISE ══════ */}
      {modalSolicitarAnalise && (
        <ModalSolicitarAnalise
          origem="crm"
          origemId={modalSolicitarAnalise.id}
          origemTitulo={modalSolicitarAnalise.titulo}
          origemNumero={modalSolicitarAnalise.numero_edital || null}
          currentUser={currentUser}
          onClose={() => setModalSolicitarAnalise(null)}
          onSaved={() => setModalSolicitarAnalise(null)}
        />
      )}

      {/* ══════ MODAL ANDAMENTO ══════ */}
      {modalAndamento && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={()=>setModalAndamento(null)}>
          <div style={{ background:'white', borderRadius:8, width:'min(480px,96vw)', maxHeight:'85vh', display:'flex', flexDirection:'column',
            padding:'16px 18px', boxShadow:'0 8px 32px #0004' }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:12, color:'#7c3aed' }}>📝 Andamento da Negociação</div>
                <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>{modalAndamento.titulo}</div>
              </div>
              <button onClick={()=>setModalAndamento(null)} style={{ background:'none', border:'none', fontSize:16, color:'#94a3b8', cursor:'pointer' }}>✕</button>
            </div>
            {/* Nova observação */}
            <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:6, padding:10, marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#6d28d9', marginBottom:5 }}>✏️ Nova atualização</div>
              <RichTextInput
                mencoes
                value={novoAndamento}
                onChange={v => setNovoAndamento(v)}
                placeholder="Descreva o andamento da negociação... @Nome pra mencionar, selecione um trecho pra formatar"
                minHeight={54}
                style={{ border:'1px solid #c4b5fd', fontSize:11, marginBottom:6 }} />
              <button onClick={salvarAndamentoCrm} disabled={salvandoAndamento||!novoAndamento.trim()}
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'5px 14px',
                  fontWeight:700, fontSize:10, cursor:'pointer', opacity:novoAndamento.trim()?1:.5 }}>
                {salvandoAndamento ? 'Salvando...' : '+ Registrar'}
              </button>
            </div>
            {/* Histórico */}
            {erroAndamentoModal && <Faixa tom="erro" acao={<Botao pequeno onClick={() => lerAndamentoCrm(modalAndamento.id)}>Tentar de novo</Botao>}>Não foi possível ler o andamento ({erroAndamentoModal}). Isso não quer dizer que não haja atualização.</Faixa>}
            <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              {andamentoHistorico.length === 0 && !erroAndamentoModal && (
                <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:20 }}>Nenhuma atualização registrada ainda.</div>
              )}
              {andamentoHistorico.map((h,i)=>(
                <div key={h.id||i} style={{ padding:'8px 10px', background:'#fff', border:'1px solid #e2e8f0',
                  borderRadius:5, borderLeft:'3px solid #7c3aed' }}>
                  {pareceHtmlFormatado(h.texto)
                    ? <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }} dangerouslySetInnerHTML={{ __html: h.texto }} />
                    : <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}><Linkify text={h.texto} /></div>}
                  <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                    <span>👤 {h.usuario_nome||'—'}</span>
                    <span>🕒 {h.criado_em ? new Date(h.criado_em).toLocaleString('pt-BR') : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CONVERTER VENDA DIRETA → LICITAÇÃO/ATA ══════ */}
      {modalConverterLicit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1001, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalConverterLicit(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(460px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', marginBottom:10 }}>🏛️ Converter para Licitação / Adesão a ATA</div>
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, padding:'8px 10px', marginBottom:12, fontSize:10 }}>
              <strong>{modalConverterLicit.titulo}</strong>
              {modalConverterLicit.orgao && <div style={{ color:'#0369a1' }}>{modalConverterLicit.orgao}</div>}
            </div>
            <div style={{ fontSize:10, color:'#374151', marginBottom:12 }}>
              Escolha o tipo de processo licitatório:
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button
                style={{ background:'#1e3a5f', color:'#fff', border:'none', borderRadius:6, padding:'10px 14px', fontWeight:700, fontSize:11, cursor:salvando?'not-allowed':'pointer', opacity:salvando?.6:1, textAlign:'left' }}
                disabled={salvando}
                onClick={async () => {
                  if (!await confirmar('Converter em Licitação (status: Aberta)?')) return;
                  setSalvando(true);
                  const agora = new Date().toISOString();
                  const op = modalConverterLicit;
                  const historico = [{ status:'Aberta', usuario: currentUser?.nome, data: agora, obs: `Convertida de Venda Direta CRM: ${op.titulo}` }];
                  const { data: novaLic, error } = await supabase.from('licitacoes').insert([{
                    numero: op.numero_edital || `VD-${op.id.slice(0,6).toUpperCase()}`,
                    nome_projeto: op.titulo || '—',
                    orgao: op.orgao || '',
                    objeto_principal: op.descricao || '',
                    classificacao: 'Direta',
                    status: 'Aberta',
                    prioridade: 'Média',
                    analista_nome: op.responsavel_nome || currentUser?.nome || '',
                    analista_email: currentUser?.email || '',
                    historico,
                    marcadores: [],
                    criado_por: currentUser?.email,
                    criado_por_nome: currentUser?.nome,
                    criado_em: agora,
                    atualizado_em: agora,
                  }]).select().single();
                  setSalvando(false);
                  if (error) { alert('Erro: ' + error.message); return; }
                  if (novaLic) {
                    const { error: errLig } = await supabase.from('crm_oportunidades').update({ licitacao_processo_id: novaLic.id }).eq('id', op.id);
                    if (errLig) mostrarAviso(`A licitação foi criada, mas não foi ligada a este card\n${errLig.message}`, 'atencao');   // 7.62: o erro era ignorado
                  }
                  setModalConverterLicit(null);
                  await load();
                  alert('Licitação criada com status "Aberta"! Acesse a aba Licitações para acompanhar.');
                }}>
                🏛️ Processo Licitatório<br/>
                <span style={{ fontSize:9, fontWeight:400 }}>Cria nova licitação com status "Aberta"</span>
              </button>
              <button
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:6, padding:'10px 14px', fontWeight:700, fontSize:11, cursor:salvando?'not-allowed':'pointer', opacity:salvando?.6:1, textAlign:'left' }}
                disabled={salvando}
                onClick={async () => {
                  if (!await confirmar('Converter em Adesão a ATA?')) return;
                  setSalvando(true);
                  const agora = new Date().toISOString();
                  const op = modalConverterLicit;
                  const historico = [{ status:'Aberta', usuario: currentUser?.nome, data: agora, obs: `Convertida de Venda Direta CRM (Adesão a ATA): ${op.titulo}` }];
                  const { data: novaLic, error } = await supabase.from('licitacoes').insert([{
                    numero: op.numero_edital || `ATA-${op.id.slice(0,6).toUpperCase()}`,
                    nome_projeto: op.titulo || '—',
                    orgao: op.orgao || '',
                    objeto_principal: op.descricao || '',
                    classificacao: 'Adesão a ATA',
                    status: 'Aberta',
                    prioridade: 'Média',
                    analista_nome: op.responsavel_nome || currentUser?.nome || '',
                    analista_email: currentUser?.email || '',
                    historico,
                    marcadores: [],
                    criado_por: currentUser?.email,
                    criado_por_nome: currentUser?.nome,
                    criado_em: agora,
                    atualizado_em: agora,
                  }]).select().single();
                  setSalvando(false);
                  if (error) { alert('Erro: ' + error.message); return; }
                  if (novaLic) {
                    const { error: errLig } = await supabase.from('crm_oportunidades').update({ licitacao_processo_id: novaLic.id }).eq('id', op.id);
                    if (errLig) mostrarAviso(`A licitação foi criada, mas não foi ligada a este card\n${errLig.message}`, 'atencao');   // 7.62: o erro era ignorado
                  }
                  setModalConverterLicit(null);
                  await load();
                  alert('Adesão a ATA criada! Acesse a aba Licitações para acompanhar.');
                }}>
                📋 Adesão a ATA<br/>
                <span style={{ fontSize:9, fontWeight:400 }}>Cria registro de Adesão a Ata de Registro de Preços</span>
              </button>
            </div>
            <button style={{ marginTop:10, width:'100%', padding:'7px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}
              onClick={() => setModalConverterLicit(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ══════ MODAL VINCULAR A PROCESSO LICITATÓRIO ══════ */}
      {modalVincularLicit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalVincularLicit(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(460px,96vw)', maxHeight:'80vh', display:'flex', flexDirection:'column', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#0e7490', marginBottom:8 }}>🔗 Vincular a Processo Licitatório</div>
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, padding:'6px 10px', marginBottom:10, fontSize:10 }}>
              <strong>{modalVincularLicit.titulo}</strong> {modalVincularLicit.numero_pv && <span style={{ color:'#0369a1' }}>· PV {modalVincularLicit.numero_pv}</span>}
            </div>

            {modalVincularLicit.licitacao_processo_id && (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'8px 10px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#166534', fontWeight:700 }}>✓ Já vinculado a um processo</span>
                <button className="acn-btn" style={{ background:'#dc2626', fontSize:8, padding:'3px 8px' }}
                  onClick={() => ligarProcesso(null)}>
                  Desvincular
                </button>
              </div>
            )}

            <input
              placeholder="🔍 Buscar por número, nome do projeto ou órgão..."
              value={buscaVincularLicit}
              onChange={async e => {
                const v = e.target.value;
                setBuscaVincularLicit(v);
                if (v.trim().length < 2) { setResultVincularLicit([]); return; }
                const { data, error } = await supabase.from('licitacoes')
                  .select('id,numero,nome_projeto,orgao,status')
                  .or(`numero.ilike.%${v}%,nome_projeto.ilike.%${v}%,orgao.ilike.%${v}%`)
                  .limit(20);
                if (error) { setErroVincular(error.message); setResultVincularLicit([]); return; }   // 7.62: lia como "Nenhum processo encontrado"
                setErroVincular('');
                setResultVincularLicit(data || []);
              }}
              style={{ padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:10, marginBottom:8, boxSizing:'border-box' }}
              autoFocus
            />

            <div style={{ overflowY:'auto', flex:1, minHeight:100 }}>
              {resultVincularLicit.map(lic => (
                <div key={lic.id} onClick={() => ligarProcesso(lic.id)} style={{
                  padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:5, marginBottom:5, cursor:'pointer',
                }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#1e293b' }}>{lic.numero} — {lic.nome_projeto}</div>
                  <div style={{ fontSize:9, color:'#64748b' }}>{lic.orgao} · {lic.status}</div>
                </div>
              ))}
              {erroVincular && <Faixa tom="erro">Não foi possível buscar os processos ({erroVincular}). Isso não quer dizer que não exista nenhum.</Faixa>}
              {buscaVincularLicit.trim().length >= 2 && resultVincularLicit.length === 0 && !erroVincular && (
                <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', padding:'12px 0' }}>Nenhum processo encontrado</div>
              )}
            </div>

            <button style={{ marginTop:10, width:'100%', padding:'7px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}
              onClick={() => setModalVincularLicit(null)}>Fechar</button>
          </div>
        </div>
      )}

      {/* ══════ MODAL CONVERTER OP/OS ══════ */}
      {modalConverter && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(460px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#166534', marginBottom:8 }}>🏆 Negócio Ganho — Lançar no Sistema</div>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'8px 10px', marginBottom:12 }}>
              <div style={{ fontSize:8, fontWeight:700, color:'#166534', marginBottom:2 }}>OPORTUNIDADE</div>
              <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{modalConverter.titulo}</div>
              {modalConverter.orgao && <div style={{ fontSize:9, color:'#64748b' }}>{modalConverter.orgao}</div>}
              <div style={{ fontSize:10, color:'#0f766e', fontWeight:700, marginTop:2 }}>{fmtMoeda(modalConverter.valor_registrado)}</div>
            </div>

            <div style={{ fontSize:9, color:'#64748b', background:'#f8fafc', borderRadius:4, padding:'5px 8px', marginBottom:10 }}>
              Número da OS será gerado automaticamente.
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalConverter(null)}>Cancelar</button>
              <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px', background:'#ea580c', opacity: salvando?.5:1 }}
                onClick={converterGanho} disabled={salvando}>
                {salvando ? 'Criando...' : '🔧 Criar OS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL VENDA / ADESÃO ══════ */}
      {modalVenda && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalVenda(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(500px,96vw)', maxHeight:'88vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:8 }}>
              {modalVenda.venda ? '✏️ Editar Venda' : '+ Registrar Venda / Adesão'}
            </div>
            {modalVenda.op && (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'6px 10px', marginBottom:12, fontSize:9 }}>
                <strong>{modalVenda.op.titulo}</strong>
                {modalVenda.op.tipo_licitacao === 'ata' && (
                  <span style={{ marginLeft:8, fontSize:8, background:'#f5f3ff', color:'#7c3aed', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Ata</span>
                )}
              </div>
            )}

            {/* Número da OP vinculada — formato XXXX.XXXX */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nº da OP Vinculada (formato XXXX.XXXX)</div>
              <input value={formVenda.numero_op||''} placeholder="Ex: 2024.0001"
                maxLength={9}
                onChange={e => setFormVenda(f => ({...f, numero_op: mascaraOp(e.target.value)}))}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
              />
              <div style={{ fontSize:8, color:'#94a3b8', marginTop:1 }}>Formato XXXX.XXXX — identifica a OP de produção desta venda filha</div>
            </div>

            {([
              { label:'Órgão Aderente / Comprador *', key:'orgao_aderente', placeholder:'Ex: Corpo de Bombeiros / João Silva LTDA' },
              { label:'Descrição do Item / Serviço', key:'descricao', placeholder:'Ex: 50x Rádio DMR Motorola DP4801e' },
              { label:'Quantidade', key:'quantidade', placeholder:'50' },
              { label:'Valor Unitário (R$)', key:'valor_unitario', placeholder:'6400' },
              { label:'Valor Total (R$) *', key:'valor_total', placeholder:'320000' },
            ] as any[]).map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>{label}</div>
                <input value={formVenda[key]||''} placeholder={placeholder}
                  onChange={e => setFormVenda(f => ({...f,[key]:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Status Faturamento</div>
              <select value={formVenda.status_faturamento} onChange={e => setFormVenda(f => ({...f, status_faturamento: e.target.value}))}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                <option value="pendente">Pendente</option>
                <option value="faturado">✓ Faturado</option>
                <option value="cancelado">✕ Cancelado</option>
              </select>
            </div>

            {formVenda.status_faturamento === 'faturado' && (
              <>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Número da NF</div>
                  <input value={formVenda.numero_nf||''} placeholder="Ex: 004821"
                    onChange={e => setFormVenda(f => ({...f, numero_nf:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Data do Faturamento</div>
                  <input type="date" value={formVenda.data_faturamento||''}
                    onChange={e => setFormVenda(f => ({...f, data_faturamento:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
              </>
            )}

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Operador Responsável (Vendedor)</div>
              <ColaboradorSelect
                value={formVenda.operador_nome||''}
                onChange={v => setFormVenda(f => ({...f, operador_nome:v}))}
                placeholder="Selecione o operador"
              />
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Observações</div>
              <MencaoTextarea value={formVenda.observacoes||''} rows={2}
                placeholder="Notas adicionais sobre esta venda / adesão... @Nome para mencionar"
                onChange={v => setFormVenda(f => ({...f, observacoes:v}))} />
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalVenda(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarVenda} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Venda Filha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Compras ─────────────────────────────────────────── */}
      {modalCompras && (
        <ModalSolicitarCompra currentUser={currentUser}
          titulo={`Solicitar compra — ${modalCompras.titulo || '(sem título)'}`}
          valorInicial={{
            titulo: modalCompras._oplText ? `Compra para a OP ${modalCompras._oplText}` : (modalCompras.titulo || ''),
            // saindo de uma OP da lista, a compra já nasce ligada a ela (aparece como "Demanda de OP")
            vinculo: modalCompras._oplId ? { tipo: 'op', id: String(modalCompras._oplId), descricao: modalCompras._oplDescricao } : null,
          }}
          origemSetor={currentUser?.perfil || 'Comercial'}
          oportunidadeId={modalCompras.id || null}
          // número da OP (lista de OPs em aberto) ou do edital (card de licitação): o que o pedido sempre guardou em "opl"
          opl={modalCompras._oplText || modalCompras.numero_edital || null}
          contexto={[`Pedido de Compra — CRM: ${modalCompras.titulo || '—'}`, modalCompras.orgao ? `Órgão: ${modalCompras.orgao}` : ''].filter(Boolean).join('\n')}
          onClose={() => setModalCompras(null)} onCriada={aoCriarCompraCrm} />
      )}
      {/* ══════ MODAL ABRIR — split-screen ══════ */}
      {modalAbrir && abrirMinimized && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:1200, background:'#1e3a5f', color:'#fff',
          display:'flex', alignItems:'center', padding:'8px 14px', gap:10, boxShadow:'0 -2px 12px #0004' }}>
          <div style={{ flex:1, fontSize:11, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {modalAbrir.funil === 'licitacao' ? '🏛️' : '💼'} {modalAbrir.titulo}
          </div>
          <button onClick={() => setAbrirMinimized(false)}
            style={{ background:'#2563eb', border:'none', color:'#fff', borderRadius:4, padding:'4px 10px', fontSize:10, cursor:'pointer', fontWeight:700 }}>
            ⬆ Restaurar
          </button>
          <button onClick={fecharModalAbrir}
            style={{ background:'none', border:'none', color:'#fff', fontSize:16, cursor:'pointer', padding:'2px 6px' }}>✕</button>
        </div>
      )}
      {oplDoCardAberta && (
        // acima do card aberto (zIndex 1100) — o modal da OP sozinho fica em 1000
        <div style={{ position:'relative', zIndex:2000 }}>
          <OplDetalheModal opl={oplDoCardAberta} onClose={() => setOplDoCardAberta(null)} currentUser={currentUser} />
        </div>
      )}
      {modalAbrir && !abrirMinimized && (
        <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1100, display:'flex' }}>
          <div ref={abrirContainerRef} style={{ display:'flex', width:'100%', height:'100%' }}>

            {/* ── ESQUERDO: formulário editável ── */}
            <div style={{ display:'flex', flexDirection:'column', background:'#fff', boxShadow:'2px 0 12px #0002', ...abrirEstSplit.esquerda }}>
              {/* Header */}
              <div style={{ padding:'12px 14px', background:'#1e3a5f', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:9, opacity:.8, fontWeight:700, letterSpacing:.5 }}>
                    {modalAbrir.funil === 'licitacao' ? 'LICITAÇÃO CRM' : 'VENDA DIRETA'}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{modalAbrir.titulo}</div>
                  {modalAbrir.orgao && <div style={{ fontSize:9, opacity:.85 }}>{modalAbrir.orgao}</div>}
                  {oplsDoCard.length > 0 && (() => {
                    const primeira = oplsDoCard[0];
                    const base = String(primeira.opl || '').replace(/\/\d+$/, '');
                    return (
                      <button onClick={() => setOplDoCardAberta(primeira)}
                        title={oplsDoCard.length > 1 ? `Abre a 1ª unidade — no detalhe há o "Resumo do lote" com as ${oplsDoCard.length}` : 'Abrir o detalhe da OP gerada por este PV'}
                        style={{ marginTop:6, background:'#0891b2', color:'#fff', border:'none', borderRadius:5, padding:'4px 10px',
                          fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        🔧 Ir para a OP {oplsDoCard.length > 1 ? `${base} (${oplsDoCard.length} unidades)` : primeira.opl}
                      </button>
                    );
                  })()}
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <SeletorModoSplit modo={abrirModoSplit} onModo={setAbrirModoSplit} escuro />
                  <button onClick={() => setAbrirMinimized(true)}
                    title="Minimizar" style={{ background:'none', border:'none', color:'#fff', fontSize:16, cursor:'pointer', padding:'2px 6px', lineHeight:1 }}>─</button>
                  <button onClick={fecharModalAbrir}
                    style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', padding:'2px 6px' }}>✕</button>
                </div>
              </div>

              {/* Formulário (scrollável) */}
              <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>

                {modalAbrir.funil === 'licitacao' && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Tipo de Licitação</div>
                    <div style={{ display:'flex', gap:12 }}>
                      {([['ordinaria','📄 Ordinária'],['ata','📋 Ata de Registro']] as const).map(([t,label]) => (
                        <label key={t} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
                          <input type="radio" checked={formOp.tipo_licitacao===t} onChange={() => setFormOp(f => ({...f, tipo_licitacao:t}))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {([
                  { label:'Título *', key:'titulo', placeholder:'Ex: Pregão SESP 2025/041' },
                  ...(modalAbrir.funil==='licitacao' ? [
                    { label:'Número do Edital', key:'numero_edital', placeholder:'2025/041' },
                    { label:'Órgão', key:'orgao', placeholder:'Secretaria de Segurança Pública' },
                    { label:'Data da Sessão', key:'data_sessao', type:'date' },
                    ...(formOp.tipo_licitacao==='ata' ? [{ label:'Validade da Ata', key:'data_validade_ata', type:'date' }] : []),
                  ] : []),
                  { label:'Nº do Orçamento (Proposta)', key:'numero_proposta', placeholder:'Ex: 041/2025' },
                  { label:'Valor Estimado (R$)', key:'valor_registrado', placeholder:'Ex: 280000' },
                  { label:'Previsão de Fechamento', key:'data_prev_fechamento', type:'date' },
                  // a coluna existia (e o salvar já gravava), mas nunca teve campo na tela
                  { label:'Prazo de Entrega', key:'prazo_entrega_comercial', type:'date' },
                ] as any[]).map(({ label, key, placeholder, type }) => (
                  <div key={key} style={campoDestaque(key)}>
                    <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>{label}</div>
                    <input type={type||'text'} value={formOp[key]||''} placeholder={placeholder}
                      onChange={e => setFormOp(f => ({...f, [key]: e.target.value}))}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }} />
                  </div>
                ))}

                {/* Nº do PV — nem todo orçamento vira PV, por isso é um campo
                    à parte, editável a qualquer momento (não só pelo gate
                    "Enviar Proposta" do Kanban, que continua funcionando
                    igual como atalho quando o campo está vazio). */}
                {/* PV já preenchido: só Admin e gerentes alteram (o salvar
                    confere de novo no banco). Vazio: qualquer um preenche. */}
                {(() => {
                  const pvTravado = !!String(modalAbrir?.numero_pv || '').trim() && !podeAlterarNumeroOplPv(currentUser);
                  return (
                    <div style={campoDestaque('numero_pv')}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>
                        Nº do PV (4 dígitos){pvTravado && <span style={{ color:'#94a3b8', fontWeight:600 }}> · 🔒 só admin/gerente altera</span>}
                      </div>
                      <input type="text" value={formOp.numero_pv||''} placeholder="0000" maxLength={4}
                        disabled={pvTravado}
                        title={pvTravado ? 'PV já atribuído. Só administradores e gerentes podem alterar o número.' : undefined}
                        onChange={e => setFormOp(f => ({...f, numero_pv: e.target.value.replace(/\D/g, '').slice(0, 4)}))}
                        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box',
                          ...(pvTravado ? { background:'#f1f5f9', color:'#475569', cursor:'not-allowed' } : {}) }} />
                    </div>
                  );
                })()}

                <div style={campoDestaque('estagio_id')}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Estágio</div>
                  <select value={formOp.estagio_id||''} onChange={e => setFormOp(f => ({...f, estagio_id: e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                    <option value="">— Selecione —</option>
                    {estagiosFunil.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>

                {isGanho(getEst(formOp.estagio_id)) && (
                  <div style={campoDestaque('empresa_vencedora')}>
                    <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Empresa Vencedora *</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {(['ACN','DETECH'] as const).map(emp => (
                        <button key={emp} type="button" onClick={() => setFormOp(f => ({...f, empresa_vencedora: emp}))}
                          style={{ flex:1, padding:'6px', fontSize:10, fontWeight:700, borderRadius:4, border:'1.5px solid', cursor:'pointer',
                            background: formOp.empresa_vencedora===emp ? (emp==='ACN'?'#dbeafe':'#f3e8ff') : 'white',
                            color:       emp==='ACN' ? '#1e40af' : '#7c3aed',
                            borderColor: emp==='ACN' ? '#3b82f6' : '#a855f7' }}>
                          {emp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isPerdido(getEst(formOp.estagio_id)) && (
                  <div style={campoDestaque('motivo_perda')}>
                    <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Motivo da Perda</div>
                    <textarea value={formOp.motivo_perda||''} onChange={e => setFormOp(f => ({...f, motivo_perda: e.target.value}))}
                      rows={2} placeholder="Descreva o motivo..."
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box', resize:'vertical' }} />
                  </div>
                )}

                <div style={campoDestaque('cliente_id')}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Cliente (opcional)</div>
                  <ClienteAutocomplete
                    value={formOp._cliente_nome || ''}
                    onChange={v => setFormOp(f => ({ ...f, _cliente_nome: v, cliente_id: null }))}
                    onSelect={c => setFormOp(f => ({ ...f, _cliente_nome: c.nome, cliente_id: c.id }))}
                    placeholder="Vincular cliente..." />
                </div>

                <div style={{ ...campoDestaque('responsavel_nome'), marginBottom:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Responsável</div>
                  <ColaboradorSelect value={formOp.responsavel_nome||''} onChange={v => setFormOp(f => ({...f, responsavel_nome: v}))} placeholder="Selecione o operador" />
                </div>

                <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#0369a1', marginBottom:5 }}>📞 CONTATO</div>
                  <div style={campoDestaque('nome_contato')}>
                    <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Nome</div>
                    <input className="acn-input" style={{ width:'100%' }} placeholder="Nome do contato"
                      value={formOp.nome_contato||''} onChange={e => setFormOp(f => ({...f, nome_contato: e.target.value}))} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                    <div style={campoDestaque('contato')}>
                      <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Telefone</div>
                      <input className="acn-input" style={{ width:'100%' }} placeholder="(99) 99999-9999"
                        value={formOp.contato||''} onChange={e => setFormOp(f => ({...f, contato: e.target.value}))} />
                      {formOp.contato && (
                        <a href={`https://wa.me/55${(formOp.contato||'').replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ fontSize:8, color:'#16a34a', display:'flex', alignItems:'center', gap:3, marginTop:2, textDecoration:'none' }}>
                          💬 WhatsApp
                        </a>
                      )}
                    </div>
                    <div style={campoDestaque('contato_email')}>
                      <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>E-mail</div>
                      <input className="acn-input" style={{ width:'100%' }} placeholder="email@exemplo.com"
                        value={formOp.contato_email||''} onChange={e => setFormOp(f => ({...f, contato_email: e.target.value}))} />
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <div style={campoDestaque('prox_contato')}>
                      <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>📅 Próximo Contato</div>
                      <input type="date" className="acn-input" style={{ width:'100%' }}
                        value={formOp.prox_contato||''} onChange={e => setFormOp(f => ({...f, prox_contato: e.target.value}))} />
                    </div>
                    <div style={campoDestaque('hora_prox_contato')}>
                      <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>⏰ Hora do Contato</div>
                      <input type="time" className="acn-input" style={{ width:'100%' }}
                        value={formOp.hora_prox_contato||''} onChange={e => setFormOp(f => ({...f, hora_prox_contato: e.target.value}))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'10px 14px', borderTop:'1px solid #e2e8f0', display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={salvarAbrirForm} disabled={salvando}
                  style={{ flex:1, background:'#0f766e', color:'#fff', border:'none', borderRadius:5, padding:'7px 0', fontWeight:700, fontSize:11, cursor:'pointer', opacity:salvando?.6:1 }}>
                  {salvando ? 'Salvando...' : '💾 Salvar Alterações'}
                </button>
                <button onClick={fecharModalAbrir}
                  style={{ background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1', borderRadius:5, padding:'7px 12px', fontSize:10, cursor:'pointer' }}>
                  Fechar
                </button>
                <button onClick={() => setModalNovaOpOs({ crmCard: modalAbrir })}
                  style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:5, padding:'7px 12px', fontSize:10, cursor:'pointer', fontWeight:700 }}>
                  🔧 Nova OP / OS
                </button>
              </div>
            </div>

            {/* ── DIVIDER (drag resize) ── */}
            <div
              onMouseDown={e => {
                e.preventDefault();
                setAbrirIsDragging(true);
                abrirDragStartX.current = e.clientX;
                abrirDragStartW.current = abrirLeftWidth;
              }}
              style={{ width:6, background: abrirIsDragging ? '#93c5fd' : '#e2e8f0', cursor:'col-resize',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background .15s', ...abrirEstSplit.divisor }}>
              <div style={{ width:2, height:40, background:'#c0c0c0', borderRadius:1 }} />
            </div>

            {/* ── DIREITO: abas de documentos ── */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f4f6f9', overflow:'hidden', ...abrirEstSplit.direita }}>

              {/* Tab bar — quebra em linhas em vez de rolar horizontalmente, pra caber tudo na tela */}
              <div style={{ display:'flex', flexWrap:'wrap', borderBottom:'2px solid #e2e8f0', background:'#fff', flexShrink:0 }}>
                {TABS_CRM.map(t => (
                  <button key={t.key} onClick={() => setAbrirTabDir(t.key)}
                    style={{ flex:'0 0 auto', padding:'8px 10px', border:'none',
                      borderBottom: abrirTabDir===t.key ? '2px solid #0369a1' : '2px solid transparent',
                      background:'none', fontWeight: abrirTabDir===t.key ? 700 : 400,
                      color: abrirTabDir===t.key ? '#0369a1' : '#6b7280', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                    {t.label}
                  </button>
                ))}
                {abrirModoSplit === 'direita' && (
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'0 8px' }}>
                    <span title={modalAbrir.titulo} style={{ fontSize:10, fontWeight:700, color:'#334155', maxWidth:260,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{modalAbrir.titulo}</span>
                    <SeletorModoSplit modo={abrirModoSplit} onModo={setAbrirModoSplit} />
                    <button onClick={() => setAbrirMinimized(true)} title="Minimizar"
                      style={{ background:'none', border:'none', color:'#475569', fontSize:14, cursor:'pointer', padding:'2px 5px' }}>─</button>
                    <button onClick={fecharModalAbrir} title="Fechar"
                      style={{ background:'none', border:'none', color:'#475569', fontSize:16, cursor:'pointer', padding:'2px 5px' }}>✕</button>
                  </div>
                )}
              </div>

              {/* Conteúdo */}
              <div style={{ flex:1, overflowY:'auto', padding:14 }}>

                {/* ── COTAÇÕES ── */}
                {abrirTabDir === 'cotacoes' && (
                  <CotacoesCrmPanelCrm
                    oportunidadeId={modalAbrir.id}
                    currentUser={currentUser}
                  />
                )}

                {/* ── FORMAÇÃO DE PREÇOS (embutida, já vinculada a este processo) ── */}
                {(abrirTabDir === 'formacao_precos' || formacaoMontadaId === modalAbrir.id) && (
                  <div style={abrirTabDir === 'formacao_precos' ? undefined : { display:'none' }}>
                    <FormacaoPrecosTab
                      key={modalAbrir.id}
                      currentUser={currentUser}
                      vinculo={{ tipo:'crm', id: modalAbrir.id }}
                      rotulo={modalAbrir.titulo || ''}
                      embutido
                    />
                  </div>
                )}

                {/* ── ANÁLISE ── */}
                {abrirTabDir === 'analise' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

                    {/* Solicitações com setores, pareceres e cancelamento — o
                        mesmo painel da Licitação (antes aqui só havia o badge
                        e não dava para ver os pareceres nem cancelar). */}
                    <AnaliseStatusPanel
                      origemId={modalAbrir.id}
                      origemTitulo={modalAbrir.titulo}
                      origemNumero={modalAbrir.numero_edital || null}
                      origem="crm"
                      currentUser={currentUser}
                      onSolicitarNova={() => setModalSolicitarAnalise(modalAbrir)}
                    />

                    <hr style={{ border:'none', borderTop:'1px solid #e2e8f0', margin:'2px 0' }} />

                    {/* Área livre — nota + anexos */}
                    <div style={{ background:'#faf5ff', border:'1px solid #d8b4fe', borderRadius:6, padding:10 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#7c3aed', marginBottom:6, textTransform:'uppercase', letterSpacing:.4 }}>
                        📝 Notas / Observações
                      </div>
                      <textarea
                        value={abrirUploadDesc}
                        onChange={e => setAbrirUploadDesc(e.target.value)}
                        placeholder="Adicione observações da sua análise..."
                        rows={4}
                        style={{ width:'100%', padding:'7px 9px', border:'1px solid #d8b4fe', borderRadius:4,
                          fontSize:11, boxSizing:'border-box', resize:'vertical', fontFamily:'inherit',
                          background:'#fff', marginBottom:6 }}
                      />
                      <div style={{ marginBottom:6 }}>
                        <label style={{ fontSize:10, color:'#6b7280', display:'block', marginBottom:3 }}>📎 Anexar arquivo (opcional)</label>
                        <input ref={abrirUploadRef} type="file"
                          onChange={e => setAbrirUploadFile(e.target.files?.[0]||null)}
                          style={{ fontSize:10, width:'100%' }} />
                      </div>
                      <button onClick={salvarAbrirDoc}
                        disabled={abrirSalvandoDoc || (!abrirUploadFile && !abrirUploadDesc.trim())}
                        style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4,
                          padding:'5px 16px', fontWeight:700, fontSize:10, cursor:'pointer',
                          opacity:(!abrirUploadFile&&!abrirUploadDesc.trim())?.5:1 }}>
                        {abrirSalvandoDoc ? 'Salvando...' : '💾 Salvar Análise'}
                      </button>
                    </div>

                    {/* Lista de registros salvos */}
                    {faixaErroAbrir}
                    {abrirDocs.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.4 }}>
                          Histórico ({abrirDocs.length})
                        </div>
                        {abrirDocs.map((d,i) => (
                          <div key={d.id||i} style={{
                            background: itemNaoLido(d.id) ? '#fefce8' : '#fff',
                            border: `1px solid ${itemNaoLido(d.id) ? '#fde047' : '#e2e8f0'}`,
                            borderRadius:5, padding:'8px 10px', borderLeft:'3px solid #7c3aed' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                              <div style={{ flex:1 }}>
                                {d.conteudo && (
                                  <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', marginBottom: d.url ? 4 : 0 }}>
                                    <Linkify text={d.conteudo} />
                                  </div>
                                )}
                                {d.url && (
                                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize:10, color:'#7c3aed', wordBreak:'break-all', display:'flex', alignItems:'center', gap:3 }}>
                                    📎 {d.nome || 'Arquivo'}
                                  </a>
                                )}
                              </div>
                              {currentUser?.perfil==='Admin' && (
                                <button onClick={() => excluirAbrirDoc(d.id,'licitacao_documentos',
                                  (d.conteudo ? d.conteudo.slice(0,60) + (d.conteudo.length>60?'…':'') : d.nome) || 'este registro')}
                                  style={{ background:'none', border:'none', color:'#dc2626', fontSize:11, cursor:'pointer', flexShrink:0 }}>✕</button>
                              )}
                            </div>
                            <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                              <span>👤 {d.criado_por_nome||'—'}</span>
                              <span>🕒 {d.criado_em ? new Date(d.criado_em).toLocaleString('pt-BR') : '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Área livre (rich text persistido) */}
                    {NotaLivreEditor}
                  </div>
                )}

                {/* ── ANDAMENTO ── */}
                {abrirTabDir === 'andamento' && (
                  <div>
                    <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:6, padding:10, marginBottom:10 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#6d28d9', marginBottom:5 }}>✏️ Nova atualização</div>
                      <MencaoTextarea value={abrirNovoText} onChange={v => setAbrirNovoText(v)}
                        placeholder="Descreva o andamento... use @Nome para mencionar alguém"
                        rows={3} style={{ border:'1px solid #c4b5fd', fontSize:11, marginBottom:6 }} />
                      <button onClick={salvarAbrirAndamento} disabled={abrirSalvandoDoc || !abrirNovoText.trim()}
                        style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'5px 14px',
                          fontWeight:700, fontSize:10, cursor:'pointer', opacity:abrirNovoText.trim()?1:.5 }}>
                        {abrirSalvandoDoc ? 'Salvando...' : '+ Registrar'}
                      </button>
                    </div>
                    {faixaErroAbrir}
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                      {abrirAndamentoHist.length === 0 && !erroAbrir && (
                        <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:'10px 0' }}>Nenhuma atualização registrada ainda.</div>
                      )}
                      {abrirAndamentoHist.map((h,i) => (
                        <div key={h.id||i} style={{ padding:'8px 10px',
                          background: itemNaoLido(h.id) ? '#fefce8' : '#fff',
                          border: `1px solid ${itemNaoLido(h.id) ? '#fde047' : '#e2e8f0'}`,
                          borderRadius:5, borderLeft:'3px solid #7c3aed' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5, flex:1 }}><Linkify text={h.texto} /></div>
                            {currentUser?.perfil==='Admin' && (
                              <button onClick={() => excluirAbrirDoc(h.id,'crm_historico')}
                                style={{ background:'none', border:'none', color:'#dc2626', fontSize:11, cursor:'pointer', marginLeft:6 }}>✕</button>
                            )}
                          </div>
                          <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                            <span>👤 {h.usuario_nome||'—'}</span>
                            <span>🕒 {h.criado_em ? new Date(h.criado_em).toLocaleString('pt-BR') : '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* ── Área Livre ── */}
                    {NotaLivreEditor}
                  </div>
                )}

                {/* ── DEMAIS ABAS (documentos) ── */}
                {abrirTabDir !== 'andamento' && abrirTabDir !== 'analise' && abrirTabDir !== 'cotacoes' && (
                  <div>
                    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:10, marginBottom:10 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#0369a1', marginBottom:6 }}>
                        + Adicionar em {TABS_CRM.find(t=>t.key===abrirTabDir)?.label}
                      </div>
                      <div style={{ marginBottom:6 }}>
                        <input ref={abrirUploadRef} type="file"
                          onChange={e => setAbrirUploadFile(e.target.files?.[0]||null)}
                          style={{ fontSize:10, width:'100%', marginBottom:4 }} />
                        <input placeholder="Legenda / descrição (opcional)"
                          value={abrirUploadDesc} onChange={e => setAbrirUploadDesc(e.target.value)}
                          style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }} />
                      </div>
                      <button onClick={salvarAbrirDoc} disabled={abrirSalvandoDoc || (!abrirUploadFile && !abrirUploadDesc.trim())}
                        style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4, padding:'5px 14px',
                          fontWeight:700, fontSize:10, cursor:'pointer', opacity:(!abrirUploadFile&&!abrirUploadDesc.trim())?.5:1 }}>
                        {abrirSalvandoDoc ? 'Salvando...' : '+ Salvar'}
                      </button>
                    </div>
                    {faixaErroAbrir}
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                      {abrirDocs.length === 0 && !erroAbrir && (
                        <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:16 }}>Nenhum documento registrado.</div>
                      )}
                      {abrirDocs.map((d,i) => (
                        <div key={d.id||i} style={{
                          background: itemNaoLido(d.id) ? '#fefce8' : '#fff',
                          border: `1px solid ${itemNaoLido(d.id) ? '#fde047' : '#e2e8f0'}`,
                          borderRadius:5, padding:'8px 10px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ flex:1 }}>
                              {d.url && (
                                <a href={d.url} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize:11, color:'#0369a1', fontWeight:600, display:'block', marginBottom:2 }}>
                                  📎 {d.nome || 'Arquivo'}
                                </a>
                              )}
                              {d.conteudo && <div style={{ fontSize:10, color:'#475569', whiteSpace:'pre-wrap' }}><Linkify text={d.conteudo} /></div>}
                            </div>
                            {currentUser?.perfil==='Admin' && (
                              <button onClick={() => excluirAbrirDoc(d.id,'licitacao_documentos')}
                                style={{ background:'none', border:'none', color:'#dc2626', fontSize:11, cursor:'pointer', marginLeft:6 }}>✕</button>
                            )}
                          </div>
                          <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                            <span>👤 {d.criado_por_nome||'—'}</span>
                            <span>🕒 {d.criado_em ? new Date(d.criado_em).toLocaleString('pt-BR') : '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* ── Área Livre ── */}
                    {NotaLivreEditor}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    {/* ── Modal Editar OPL (aba OPLs em Aberto) ── */}

    {/* ── Modal Lançamento em Lote (chassi/placa/CNPJ por unidade desmembrada) ── */}
    {modalLote && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}
        onClick={e => { if (e.target===e.currentTarget) setModalLote(null); }}>
        <div style={{ background:'white', borderRadius:8, width:'min(700px,96vw)', maxHeight:'90vh', overflow:'auto', padding:'18px 20px', boxShadow:'0 8px 32px #0004' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', marginBottom:4 }}>
            🚗 Lançar Chassi/Placa/CNPJ — Lote {modalLote[0]?.opl.replace(/\/\d+$/, '')}
          </div>
          <div style={{ fontSize:9, color:'#94a3b8', marginBottom:12 }}>
            {modalLote.length} unidades. Cada veículo pode ter seu próprio CNPJ de faturamento, diferente do cliente.
          </div>

          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:10, marginBottom:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#075985', marginBottom:4 }}>🚗 Veículo de todas as unidades</div>
            <VeiculoDaOp veiculoId={veiculoComumDoLote()} currentUser={currentUser} onChange={aplicarVeiculoNoLote} />
            <div style={{ fontSize:8, color:'#64748b', marginTop:4 }}>
              {veiculoComumDoLote()
                ? `Vale para as ${modalLote.length} unidades e preenche o Modelo. Chassi e placa abaixo são por unidade e podem ficar vazios (carro 0 km).`
                : 'As unidades estão com veículos diferentes (ou sem veículo): escolher aqui aplica o mesmo a todas.'}
            </div>
          </div>

          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:10, marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Colar do Excel (Ctrl+C na planilha, Ctrl+V aqui)</div>
            <div style={{ fontSize:8, color:'#94a3b8', marginBottom:6 }}>
              Só chassi (uma coluna) → distribui em ordem entre as unidades ainda sem chassi e sem placa (0KM sem vínculo).
              Placa + Chassi (duas colunas, em qualquer ordem) → casa cada linha com a unidade que já tem aquela placa cadastrada,
              não importa a ordem.
            </div>
            <textarea className="acn-input" rows={3} placeholder={'Ex. só chassi:\n9BW...\n9BW...\n\nEx. placa + chassi:\nABC1D23\t9BW...\nDEF4G56\t9BW...'}
              value={loteColar} onChange={e=>setLoteColar(e.target.value)}
              style={{ width:'100%', resize:'vertical', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", fontSize:10 }} />
            <button onClick={aplicarColaChassis}
              style={{ marginTop:6, fontSize:9, padding:'4px 10px', background:'#0891b2', color:'white', border:'none', borderRadius:3, cursor:'pointer', fontWeight:700 }}>
              ⬇ Aplicar às unidades abaixo
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
            {modalLote.map(o => (
              <div key={o.id} style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0891b2', marginBottom:6 }}>
                  {o.opl}
                  <span style={{ fontWeight:400, color:'#64748b' }}> · {loteForm[o.id]?.modelo || 'sem modelo'}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:8, color:'#475569', marginBottom:2 }}>Chassi</div>
                    <input className="acn-input" value={loteForm[o.id]?.chassi||''} onChange={e=>setLoteCampo(o.id,'chassi',e.target.value)} style={{ width:'100%' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:8, color:'#475569', marginBottom:2 }}>Placa</div>
                    <input className="acn-input" value={loteForm[o.id]?.placa||''} onChange={e=>setLoteCampo(o.id,'placa',e.target.value)} style={{ width:'100%' }} />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
                  <div>
                    <div style={{ fontSize:8, color:'#475569', marginBottom:2 }}>CNPJ Faturamento</div>
                    <input className="acn-input" placeholder="Pode ser diferente do cliente"
                      value={loteForm[o.id]?.cnpj_faturamento||''} onChange={e=>setLoteCampo(o.id,'cnpj_faturamento',e.target.value)} style={{ width:'100%' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:8, color:'#475569', marginBottom:2 }}>Razão Social Faturamento</div>
                    <input className="acn-input"
                      value={loteForm[o.id]?.razao_social_faturamento||''} onChange={e=>setLoteCampo(o.id,'razao_social_faturamento',e.target.value)} style={{ width:'100%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => setModalLote(null)} style={{ padding:'7px 16px', border:'1px solid #e2e8f0', borderRadius:5, background:'#f8fafc', cursor:'pointer', fontSize:11 }}>Cancelar</button>
            <button onClick={salvarLote} disabled={loteSalvando}
              style={{ padding:'7px 18px', border:'none', borderRadius:5, background:'#7c3aed', color:'white', fontWeight:700, cursor:'pointer', fontSize:11, opacity:loteSalvando?.6:1 }}>
              {loteSalvando ? 'Salvando...' : `💾 Salvar ${modalLote.length} Unidades`}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal de edição da OP (substituiu a edição dentro da linha) ── */}
    {oplEditando && (
      <ModalOplComercial
        opl={oplEditando}
        form={oplFormEdit}
        onCampo={(campo: string, valor: any) => setOplFormEdit((f: any) => ({ ...f, [campo]: valor }))}
        currentUser={currentUser}
        centrosCusto={centrosCusto}
        tiposProjeto={TIPOS_PROJETO_OPL}
        salvando={oplSalvando}
        onSalvar={salvarOplEdit}
        onCancelar={() => setOplEditando(null)}
        onAlterarNumero={podeAlterarNumeroOplPv(currentUser) ? async () => {
          const novo = await renomearOpl(oplEditando, currentUser);
          if (!novo) return;
          setOplEditando((ed: any) => ed ? { ...ed, opl: novo } : ed);
          fetchOplsEmAberto();
        } : null}
      />
    )}

    {/* ── Modal Acompanhamentos/Notas OPL ── */}
    {oplAcomp && (
      <OplAcompModal
        referenciaId={oplAcomp.id}
        referenciaDesc={`OP ${oplAcomp.opl} — ${oplAcomp.cliente_nome||''}`}
        referenciaType="opl"
        setor="Comercial/CRM"
        currentUser={currentUser}
        onClose={() => setOplAcomp(null)}
      />
    )}

    {/* ── Modal Nova OP / OS ── */}
    {modalNovaOpOs && (
      <NovaOpOsModal
        isOpen={true}
        onClose={() => setModalNovaOpOs(null)}
        currentUser={currentUser}
        crmCard={modalNovaOpOs.crmCard}
        onSaved={() => { setModalNovaOpOs(null); load(true); }}
      />
    )}

    </div>
  );
}
