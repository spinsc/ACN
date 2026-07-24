// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';
import { ClienteAutocomplete } from './ClienteUtils';
import ContactosSection from './ContactosSection';
import CrmAnexosWidget from './CrmAnexosWidget';
import { ModalSolicitarAnalise, AnaliseStatusBadge } from './AnaliseWidget';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import NovaOpOsModal from './NovaOpOsModal';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtMoeda = (v: number | null) =>
  v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
const fmtData = (v: string | null) =>
  v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const diasAte = (v: string | null) => {
  if (!v) return null;
  return Math.ceil((new Date(v + 'T12:00:00').getTime() - Date.now()) / 86400000);
};
const isGanho       = (e: any) => e?.nome?.toLowerCase().includes('vencida') || e?.nome?.toLowerCase().includes('convertida');
const isDesistencia = (e: any) => e?.nome?.toLowerCase().includes('desist');
const isPerdido     = (e: any) => e?.is_final && !isGanho(e) && !isDesistencia(e);

const VAZIO_OP: any = {
  funil: 'licitacao',
  tipo_licitacao: 'ordinaria',
  titulo: '',
  numero_edital: '',
  orgao: '',
  data_sessao: '',
  data_validade_ata: '',
  valor_registrado: '',
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
  prox_contato:   '',
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

const VAZIO_COMPRA: any = {
  descricao_material: '',
  quantidade: 1,
  fornecedor: '',
  observacoes_compra: '',
};

// Máscara de formato XXXX.XXXX para número de OP
function mascaraOp(valor: string): string {
  const num = valor.replace(/\D/g, '').slice(0, 8);
  if (num.length <= 4) return num;
  return num.slice(0, 4) + '.' + num.slice(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmTab({ currentUser }: { currentUser: any }) {
  // ── permissões ──
  const pcrm = currentUser?.permissoes_crm || [];
  const podeVerTotais       = pcrm.includes('totais_vendas')        || currentUser?.perfil === 'Admin';
  const podeVerFaturamentos = pcrm.includes('painel_faturamentos')  || currentUser?.perfil === 'Admin';
  const podeVerRelatorio    = pcrm.includes('relatorio_vendedores') || currentUser?.perfil === 'Admin';

  // ── estado principal ──
  const [secaoCrm, setSecaoCrm]     = useState<'funil'|'contatos'>('funil');
  const [funil, setFunil]           = useState<'licitacao'|'venda_direta'>('licitacao');
  const [estagios, setEstagios]     = useState<any[]>([]);
  const [ops, setOps]               = useState<any[]>([]);
  const [itens, setItens]           = useState<any[]>([]);
  const [progresso, setProgresso]   = useState<any[]>([]);
  const [vendas, setVendas]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState('');
  const [abaInterna, setAbaInterna] = useState<'kanban'|'faturamentos'>('kanban');

  // ── drag & drop ──
  const [dragging, setDragging]     = useState<string|null>(null);
  const [dragOver, setDragOver]     = useState<string|null>(null);

  // ── modais ──
  const [modalOp, setModalOp]               = useState<any|null>(null);
  const [modalGate, setModalGate]           = useState<any|null>(null);
  const [modalConverter, setModalConverter] = useState<any|null>(null);
  const [modalConverterLicit, setModalConverterLicit] = useState<any|null>(null); // converter venda direta → licitação/ATA
  const [modalMotivo, setModalMotivo]       = useState<any|null>(null);
  const [modalDesist, setModalDesist]       = useState<any|null>(null);
  const [desistTexto, setDesistTexto]       = useState('');
  const [modalVenda, setModalVenda]         = useState<any|null>(null);
  const [tipoConverter, setTipoConverter]   = useState<'op'|'os'>('op');
  const [numOp, setNumOp]                   = useState('');
  // ── compras ──
  const [modalCompras, setModalCompras]     = useState<any|null>(null); // op para criar pedido compra
  const [formCompras, setFormCompras]       = useState({ ...VAZIO_COMPRA });
  const [pedidosCompra, setPedidosCompra]   = useState<any[]>([]);
  const [salvandoCompra, setSalvandoCompra] = useState(false);
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
  // ── modal Nova OP/OS ──
  const [modalNovaOpOs, setModalNovaOpOs]   = useState<{ crmCard?: any } | null>(null);

  // ── modal ABRIR (split-screen CRM) ──
  const [modalAbrir, setModalAbrir]         = useState<any|null>(null);
  const [abrirTabDir, setAbrirTabDir]       = useState<string>('andamento');
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
  const [abrirIsDragging, setAbrirIsDragging] = useState(false);
  const [abrirMinimized, setAbrirMinimized]   = useState(false);
  const abrirContainerRef = useRef<any>(null);
  const abrirDragStartX   = useRef(0);
  const abrirDragStartW   = useRef(0);

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('crm_estagios_funil').select('*').order('ordem'),
      supabase.from('crm_oportunidades').select('*').order('criado_em', { ascending: false }),
      supabase.from('crm_checklist_itens').select('*').order('ordem'),
      supabase.from('crm_checklist_progresso').select('*'),
      supabase.from('crm_vendas').select('*').order('criado_em', { ascending: false }),
    ]);
    setEstagios(r1.data || []);
    setOps(r2.data || []);
    setItens(r3.data || []);
    setProgresso(r4.data || []);
    setVendas(r5.data || []);
    // Carrega pedidos de compra vinculados ao CRM
    const { data: pcData } = await supabase
      .from('pcp_pedidos_compra')
      .select('*')
      .not('oportunidade_id','is',null);
    setPedidosCompra(pcData || []);
    if (!silent) setLoading(false);
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
  const estagiosFunil  = estagios.filter(e => e.funil === funil);
  const opsFunil       = ops.filter(o => o.funil === funil);
  const respUnicos     = [...new Set(opsFunil.map(o => o.responsavel_nome).filter(Boolean))].sort();
  // Contatos agendados para hoje (qualquer funil)
  const hoje           = new Date().toISOString().slice(0, 10);
  const contatosHoje   = ops.filter(o => o.prox_contato === hoje);
  const opsFiltradas   = opsFunil.filter(o => {
    if (filtResp && o.responsavel_nome !== filtResp) return false;
    if (!busca) return true;
    return (
      o.titulo?.toLowerCase().includes(busca.toLowerCase()) ||
      o.orgao?.toLowerCase().includes(busca.toLowerCase()) ||
      o.numero_edital?.toLowerCase().includes(busca.toLowerCase())
    );
  });

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
  const handleDragEnd   = () => { setDragging(null); setDragOver(null); };

  const handleDrop = async (estagioDestId: string) => {
    setDragOver(null);
    if (!dragging) return;
    const op = ops.find(o => o.id === dragging);
    if (!op || op.estagio_id === estagioDestId) { setDragging(null); return; }

    const estDest = getEst(estagioDestId);
    setDragging(null);

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

  const moverCard = async (opId: string, estagioId: string) => {
    await supabase.from('crm_oportunidades').update({
      estagio_id: estagioId,
      atualizado_em: new Date().toISOString(),
    }).eq('id', opId);
    await supabase.from('crm_historico').insert({
      oportunidade_id: opId,
      tipo: 'status_change',
      estagio_novo: getEst(estagioId)?.nome,
      usuario_nome: currentUser?.nome || 'Sistema',
    });
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ANDAMENTO
  // ─────────────────────────────────────────────────────────────────────────
  const abrirAndamento = async (op: any) => {
    setModalAndamento(op);
    setNovoAndamento('');
    const { data, error: errH } = await supabase
      .from('crm_historico')
      .select('*')
      .eq('oportunidade_id', op.id)
      .eq('tipo', 'observacao')
      .order('criado_em', { ascending: false });
    if (errH) {
      // criado_em pode não existir ainda — rodar SQL: ALTER TABLE crm_historico ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now()
      const { data: d2 } = await supabase.from('crm_historico').select('*').eq('oportunidade_id', op.id).eq('tipo', 'observacao');
      setAndamentoHistorico(d2 || []);
    } else {
      setAndamentoHistorico(data || []);
    }
  };

  const salvarAndamentoCrm = async () => {
    if (!novoAndamento.trim() || !modalAndamento) return;
    setSalvandoAndamento(true);
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
      const { data: dH, error: eH } = await supabase
        .from('crm_historico')
        .select('*')
        .eq('oportunidade_id', modalAndamento.id)
        .eq('tipo', 'observacao')
        .order('criado_em', { ascending: false });
      if (eH) {
        const { data: d2 } = await supabase.from('crm_historico').select('*').eq('oportunidade_id', modalAndamento.id).eq('tipo', 'observacao');
        setAndamentoHistorico(d2 || []);
      } else {
        setAndamentoHistorico(dH || []);
      }
    }
    setSalvandoAndamento(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EMITIR PEDIDO DE COMPRA (vinculado ao card CRM)
  // ─────────────────────────────────────────────────────────────────────────
  const emitirPedidoCompraCrm = async () => {
    if (!modalCompras) return;
    setSalvandoCompra(true);
    const agora = new Date().toISOString();
    const numRef = modalCompras.numero_edital ? modalCompras.numero_edital.replace(/\D/g,'').slice(-6) : Date.now().toString().slice(-6);
    const numeroPedido = `PC-CRM-${numRef}`;
    const obsCompleta = [
      `Pedido de Compra — CRM: ${modalCompras.titulo || '—'}`,
      `Órgão: ${modalCompras.orgao || '—'}`,
      formCompras.observacoes_compra || '',
      `Solicitado por: ${currentUser?.nome || '—'}`,
    ].filter(Boolean).join('\n');

    const { error } = await supabase.from('pcp_pedidos_compra').insert([{
      numero_pedido:        numeroPedido,
      opl:                  modalCompras.numero_edital || null,
      descricao_material:   formCompras.descricao_material || modalCompras.titulo || '—',
      quantidade:           formCompras.quantidade || 1,
      fornecedor:           formCompras.fornecedor || null,
      status_compra:        'Pendente',
      observacoes_compra:   obsCompleta,
      oportunidade_id:      modalCompras.id,
      data_criacao:         agora,
    }]);
    setSalvandoCompra(false);
    if (error) { alert('Erro ao emitir pedido: ' + error.message); return; }
    // Salva @menções das observações da compra
    if (formCompras.observacoes_compra?.trim()) {
      await salvarMencoes({
        texto: formCompras.observacoes_compra,
        mencionanteId: String(currentUser?.id || ''),
        mencionanteNome: currentUser?.nome || 'Sistema',
        contexto: 'crm',
        contextoId: String(modalCompras.id),
        contextoDescricao: `Compra CRM: ${modalCompras.titulo || '—'}`,
        campo: 'observacoes_compra',
        abaDestino: 'compras',
      });
    }
    // Nota no histórico do card
    await supabase.from('crm_historico').insert({
      oportunidade_id: modalCompras.id,
      tipo: 'observacao',
      texto: `📦 Pedido de Compra ${numeroPedido} emitido para o setor Compras.`,
      usuario_nome: currentUser?.nome || 'Sistema',
      criado_em: agora,
    });
    alert(`✅ Pedido ${numeroPedido} criado! Acompanhe na aba Compras.`);
    setModalCompras(null);
    setFormCompras({ ...VAZIO_COMPRA });
    load(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR OP
  // ─────────────────────────────────────────────────────────────────────────
  // converte string vazia → null (evita 400 em colunas date/uuid no Postgres)
  const limpar = (v: any) => (v === '' || v === undefined) ? null : v;

  const salvarOportunidade = async () => {
    if (!formOp.titulo?.trim()) return;
    setSalvando(true);
    const p: any = {
      funil,
      titulo:            formOp.titulo?.trim() || null,
      tipo_licitacao:    formOp.tipo_licitacao  || 'ordinaria',
      numero_edital:     limpar(formOp.numero_edital),
      orgao:             limpar(formOp.orgao),
      data_sessao:       limpar(formOp.data_sessao),
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
    };
    if (!p.estagio_id) {
      const first = estagiosFunil.find(e => !isGanho(e) && !isPerdido(e));
      if (first) p.estagio_id = first.id;
    }
    if (modalOp?.id) {
      await supabase.from('crm_oportunidades').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalOp.id);
    } else {
      await supabase.from('crm_oportunidades').insert(p);
    }
    setSalvando(false);
    setModalOp(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ABRIR MODAL — split-screen
  // ─────────────────────────────────────────────────────────────────────────
  const TABS_CRM = [
    { key:'andamento',    label:'📝 Andamento' },
    { key:'processo',     label:'📂 Arquivos de Licitação' },
    { key:'impugnacoes',  label:'⚠️ Impugnações e Esclarecimentos' },
    { key:'custos',       label:'💰 Custos e Docs Técnicos' },
    { key:'docs_enviados',label:'📤 Docs Enviados ao Processo' },
    { key:'contratos',    label:'📋 Fase de Contrato' },
    { key:'atestado',     label:'🏅 Atestado' },
    { key:'informacoes',  label:'ℹ️ Informações Importantes' },
    { key:'analise',      label:'🔬 Análise' },
  ] as const;

  useEffect(() => {
    if (!modalAbrir) return;
    fetchAbrirTabContent(modalAbrir, abrirTabDir);
    // pequeno delay para o DOM do contenteditable estar montado
    setTimeout(() => carregarNotaLivre(modalAbrir, abrirTabDir), 100);
  }, [modalAbrir?.id, abrirTabDir]);

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

  const fetchAbrirTabContent = async (op: any, tab: string) => {
    setAbrirDocs([]);
    setAbrirAndamentoHist([]);
    if (tab === 'andamento') {
      const { data } = await supabase.from('crm_historico')
        .select('*').eq('oportunidade_id', op.id).eq('tipo', 'observacao')
        .order('criado_em', { ascending: false });
      setAbrirAndamentoHist(data || []);
    } else if (tab !== 'analise') {
      const { data } = await supabase.from('licitacao_documentos')
        .select('*').eq('licitacao_id', op.id).eq('categoria', tab)
        .order('criado_em', { ascending: false });
      setAbrirDocs(data || []);
    }
  };

  const salvarAbrirAndamento = async () => {
    if (!abrirNovoText.trim() || !modalAbrir) return;
    setAbrirSalvandoDoc(true);
    const agora = new Date().toISOString();
    await supabase.from('crm_historico').insert([{
      oportunidade_id: modalAbrir.id,
      tipo: 'observacao',
      texto: abrirNovoText,
      usuario_nome: currentUser?.nome,
      criado_em: agora,
    }]);
    await salvarMencoes(abrirNovoText, {
      mencionadoPor: String(currentUser?.id || ''),
      mencionadoPorNome: currentUser?.nome || '',
      contextoId: String(modalAbrir.id),
      contextoDescricao: `CRM: ${modalAbrir.titulo || '—'}`,
      campo: 'andamento_crm',
    });
    setAbrirNovoText('');
    await fetchAbrirTabContent(modalAbrir, 'andamento');
    setAbrirSalvandoDoc(false);
  };

  const salvarAbrirDoc = async () => {
    if (!modalAbrir || (!abrirUploadFile && !abrirUploadDesc.trim())) return;
    setAbrirSalvandoDoc(true);
    const agora = new Date().toISOString();
    let url = '';
    let nome = '';
    if (abrirUploadFile) {
      const ext = abrirUploadFile.name.split('.').pop();
      const path = `crm-docs/${modalAbrir.id}/${abrirTabDir}/${Date.now()}.${ext}`;
      await supabase.storage.from('acn-media').upload(path, abrirUploadFile);
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      url = pub.publicUrl;
      nome = abrirUploadFile.name;
    }
    await supabase.from('licitacao_documentos').insert([{
      licitacao_id: modalAbrir.id,
      categoria: abrirTabDir,
      nome: nome || abrirUploadDesc,
      url: url || null,
      conteudo: abrirUploadDesc || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
    }]);
    setAbrirUploadFile(null);
    setAbrirUploadDesc('');
    if (abrirUploadRef.current) abrirUploadRef.current.value = '';
    await fetchAbrirTabContent(modalAbrir, abrirTabDir);
    setAbrirSalvandoDoc(false);
  };

  const excluirAbrirDoc = async (id: string, tabela: string) => {
    if (!window.confirm('Excluir este registro?')) return;
    await supabase.from(tabela).delete().eq('id', id);
    await fetchAbrirTabContent(modalAbrir, abrirTabDir);
  };

  // ── Nota Livre (editor rico) ──
  const carregarNotaLivre = async (op: any, tab: string) => {
    const { data } = await supabase.from('licitacao_documentos')
      .select('conteudo').eq('licitacao_id', op.id).eq('categoria', 'nota__' + tab).eq('nome', '__nota_livre__')
      .maybeSingle();
    const html = data?.conteudo || '';
    if (abrirNotaRef.current) abrirNotaRef.current.innerHTML = html;
  };

  const salvarNotaLivre = async () => {
    if (!modalAbrir || !abrirNotaRef.current) return;
    setAbrirNotaSalvando(true);
    const html = abrirNotaRef.current.innerHTML;
    const cat = 'nota__' + abrirTabDir;
    await supabase.from('licitacao_documentos').delete()
      .eq('licitacao_id', modalAbrir.id).eq('categoria', cat).eq('nome', '__nota_livre__');
    if (html && html.replace(/<br\s*\/?>/gi,'').trim()) {
      await supabase.from('licitacao_documentos').insert([{
        licitacao_id: modalAbrir.id, categoria: cat, nome: '__nota_livre__',
        conteudo: html, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
        criado_em: new Date().toISOString(),
      }]);
    }
    setAbrirNotaSalvando(false);
  };

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

  const inserirLinkNota = () => {
    const url = window.prompt('URL do link (ex: https://...)');
    if (!url) return;
    const sel = window.getSelection()?.toString();
    const label = sel || url;
    abrirNotaRef.current?.focus();
    document.execCommand('insertHTML', false,
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0369a1;text-decoration:underline;">${label}</a>`);
  };

  const salvarAbrirForm = async () => {
    if (!formOp.titulo?.trim() || !modalAbrir) return;
    setSalvando(true);
    const p: any = {
      titulo:            formOp.titulo?.trim() || null,
      tipo_licitacao:    formOp.tipo_licitacao  || 'ordinaria',
      numero_edital:     limpar(formOp.numero_edital),
      orgao:             limpar(formOp.orgao),
      data_sessao:       limpar(formOp.data_sessao),
      data_validade_ata: limpar(formOp.data_validade_ata),
      data_prev_fechamento: limpar(formOp.data_prev_fechamento),
      valor_registrado:  formOp.valor_registrado
        ? parseFloat(String(formOp.valor_registrado).replace(/\./g,'').replace(',','.'))
        : null,
      cliente_id:        limpar(formOp.cliente_id),
      estagio_id:        limpar(formOp.estagio_id),
      responsavel_id:    limpar(formOp.responsavel_id),
      responsavel_nome:  limpar(formOp.responsavel_nome),
      nome_contato:      limpar(formOp.nome_contato),
      contato:           limpar(formOp.contato),
      contato_email:     limpar(formOp.contato_email),
      prox_contato:      limpar(formOp.prox_contato) || null,
    };
    await supabase.from('crm_oportunidades').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalAbrir.id);
    setSalvando(false);
    await load(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE CHECKLIST
  // ─────────────────────────────────────────────────────────────────────────
  const toggleItem = async (opId: string, itemId: string, atual: boolean) => {
    const ex = progresso.find(p => p.oportunidade_id === opId && p.item_id === itemId);
    if (ex) {
      await supabase.from('crm_checklist_progresso').update({
        concluido: !atual,
        concluido_por: currentUser?.nome,
        concluido_em: !atual ? new Date().toISOString() : null,
      }).eq('id', ex.id);
    } else {
      await supabase.from('crm_checklist_progresso').insert({
        oportunidade_id: opId, item_id: itemId, concluido: true,
        concluido_por: currentUser?.nome, concluido_em: new Date().toISOString(),
      });
    }
    const { data } = await supabase.from('crm_checklist_progresso').select('*').eq('oportunidade_id', opId);
    setProgresso(prev => [...prev.filter(p => p.oportunidade_id !== opId), ...(data || [])]);
    if (modalGate?.op?.id === opId) {
      setModalGate((g: any) => g ? { ...g, prog: data || [] } : null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERTER EM OP / OS
  // ─────────────────────────────────────────────────────────────────────────
  const converterGanho = async () => {
    if (!modalConverter) return;
    if (tipoConverter === 'op' && !numOp.trim()) {
      alert('Informe o número da OP.');
      return;
    }
    setSalvando(true);
    const op = modalConverter;
    const agora = new Date().toISOString();
    try {
      if (tipoConverter === 'op') {
        // Checa duplicata antes de inserir
        const { data: existente } = await supabase.from('oples').select('id').eq('opl', numOp.trim()).maybeSingle();
        if (existente) {
          alert(`OP "${numOp.trim()}" já está cadastrada. Use outro número.`);
          setSalvando(false);
          return;
        }
        const { data: novaOp, error } = await supabase.from('oples').insert({
          opl:                   numOp.trim(),
          modelo:                op.titulo,
          cliente_nome:          op.orgao || op.titulo,
          responsavel_comercial: op.responsavel_nome || null,
          status_geral:          'Em Espera Engenharia',
          data_entrada:          agora.slice(0, 10),
          criado_por_nome:       currentUser?.nome,
          criado_por:            currentUser?.email,
        }).select().single();
        if (error) throw error;
        if (novaOp) {
          await supabase.from('crm_historico').insert({
            oportunidade_id: op.id, tipo: 'conversao_op',
            conteudo: `OP criada: ${numOp.trim()}`, usuario_nome: currentUser?.nome,
          });
        }
      } else {
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
      }
      setModalConverter(null);
      setNumOp('');
      alert(`OP ${numOp.trim()} criada! Acesse a aba Engenharia para acompanhar.`);
    } catch (e: any) {
      alert('Erro ao criar: ' + (e?.message || 'Verifique o console.'));
    }
    setSalvando(false);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MOTIVO PERDA
  // ─────────────────────────────────────────────────────────────────────────
  const confirmarPerda = async () => {
    if (!modalMotivo) return;
    await supabase.from('crm_oportunidades').update({
      estagio_id: modalMotivo.estagioDestId,
      motivo_perda: motivoTexto,
      atualizado_em: new Date().toISOString(),
    }).eq('id', modalMotivo.op.id);
    await supabase.from('crm_historico').insert({
      oportunidade_id: modalMotivo.op.id, tipo: 'status_change',
      estagio_novo: getEst(modalMotivo.estagioDestId)?.nome,
      conteudo: motivoTexto, usuario_nome: currentUser?.nome,
    });
    setModalMotivo(null);
    await load();
  };

  const confirmarDesistencia = async () => {
    if (!modalDesist) return;
    await supabase.from('crm_oportunidades').update({
      estagio_id:          modalDesist.estagioDestId,
      motivo_desistencia:  desistTexto,
      atualizado_em:       new Date().toISOString(),
    }).eq('id', modalDesist.op.id);
    await supabase.from('crm_historico').insert({
      oportunidade_id: modalDesist.op.id, tipo: 'status_change',
      estagio_novo: getEst(modalDesist.estagioDestId)?.nome,
      conteudo: `Desistência: ${desistTexto}`, usuario_nome: currentUser?.nome,
    });
    setModalDesist(null);
    await load();
  };

  const reativarOp = async (op: any) => {
    const first = estagiosFunil.find(e => !isGanho(e) && !isPerdido(e) && !isDesistencia(e));
    if (!first) return;
    await supabase.from('crm_oportunidades').update({
      estagio_id: first.id, motivo_desistencia: null, atualizado_em: new Date().toISOString(),
    }).eq('id', op.id);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR VENDA
  // ─────────────────────────────────────────────────────────────────────────
  const salvarVenda = async () => {
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
    if (modalVenda.venda?.id) {
      await supabase.from('crm_vendas').update(p).eq('id', modalVenda.venda.id);
    } else {
      await supabase.from('crm_vendas').insert(p);
    }
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
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR OP
  // ─────────────────────────────────────────────────────────────────────────
  const excluirOp = async (op: any) => {
    if (!confirm(`Excluir "${op.titulo}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('crm_oportunidades').delete().eq('id', op.id);
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
  const renderCard = (op: any) => {
    const est    = getEst(op.estagio_id);
    const ganho      = isGanho(est);
    const perdido    = isPerdido(est);
    const desistiu   = isDesistencia(est);
    const chk    = chkPct(op.id, op.estagio_id);
    const dias   = diasAte(op.data_sessao || op.data_prev_fechamento);
    const vds    = getVendasOp(op.id);
    const tvend  = totalVendidoOp(op.id);
    const tfat   = totalFaturadoOp(op.id);
    const accent = funil === 'licitacao' ? '#7c3aed' : '#0891b2';

    return (
      <div
        key={op.id}
        draggable
        onDragStart={() => handleDragStart(op.id)}
        onDragEnd={handleDragEnd}
        style={{
          background: dragging === op.id ? '#e0f2fe' : 'white',
          borderRadius: 5, padding: '7px 8px',
          boxShadow: '0 1px 3px rgba(0,0,0,.1)',
          cursor: 'grab', marginBottom: 5,
          borderLeft: `3px solid ${accent}`,
          opacity: dragging === op.id ? .6 : 1,
          userSelect: 'none',
        }}
      >
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom: (op.tipo_licitacao === 'ata' || true) ? 4 : 0 }}>
          <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3, display:'inline-block',
            background: op.funil === 'licitacao' ? '#f5f3ff' : '#ecfeff',
            color:      op.funil === 'licitacao' ? '#7c3aed'  : '#0e7490' }}>
            {op.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda Direta'}
          </span>
          {op.tipo_licitacao === 'ata' && (
            <span style={{ fontSize:8, fontWeight:700, background:'#fdf4ff', color:'#a21caf', padding:'1px 5px', borderRadius:3, display:'inline-block' }}>
              📋 Ata Reg. Preços
            </span>
          )}
        </div>

        <div style={{ fontSize:10, fontWeight:700, color:'#1e293b', lineHeight:1.3, marginBottom:3, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:4 }}>
          <span>{op.titulo}</span>
          <AnaliseStatusBadge origemId={op.id} />
        </div>

        {(op.orgao || op.numero_edital) && (
          <div style={{ fontSize:8, color:'#64748b', marginBottom:3 }}>
            {op.numero_edital && <span style={{ fontWeight:600 }}>{op.numero_edital} · </span>}
            {op.orgao}
          </div>
        )}

        {op.responsavel_nome && (
          <div style={{ fontSize:8, color:'#94a3b8', marginBottom:3 }}>👤 {op.responsavel_nome}</div>
        )}
        {op.prox_contato && (
          <div style={{
            fontSize:8, fontWeight:700, marginBottom:3,
            color: op.prox_contato === hoje ? '#92400e' : op.prox_contato < hoje ? '#dc2626' : '#0369a1',
          }}>
            📅 {op.prox_contato === hoje ? '⚡ HOJE' : op.prox_contato < hoje ? '⚠️ ATRASADO' : ''} {op.prox_contato}
            {op.nome_contato && <span style={{ fontWeight:400 }}> · {op.nome_contato}</span>}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#0f766e' }}>{fmtMoeda(op.valor_registrado)}</span>
          {dias !== null && !ganho && !perdido && (
            <span style={{
              fontSize:8, padding:'1px 5px', borderRadius:3, fontWeight:700,
              background: dias < 0 ? '#fee2e2' : dias <= 3 ? '#fef9c3' : '#dcfce7',
              color:      dias < 0 ? '#991b1b' : dias <= 3 ? '#854d0e' : '#166534',
            }}>
              {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `+${dias}d`}
            </span>
          )}
        </div>

        {chk && !ganho && !perdido && (
          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px dashed #e2e8f0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ flex:1, height:4, background:'#e2e8f0', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:`${(chk.done/chk.total)*100}%`, height:'100%', borderRadius:2,
                  background: chk.done===chk.total ? '#22c55e' : '#f59e0b' }} />
              </div>
              <span style={{ fontSize:8, color:'#64748b', fontWeight:600 }}>{chk.done}/{chk.total}</span>
            </div>
          </div>
        )}

        {ganho && op.tipo_licitacao === 'ata' && (
          <div style={{ marginTop:5, paddingTop:4, borderTop:'2px solid #86efac', fontSize:8, display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ color:'#64748b' }}>Adesões: <strong>{vds.length}</strong></span>
            <span style={{ color:'#0f766e' }}>Vendido: <strong>{fmtMoeda(tvend)}</strong></span>
            {podeVerTotais && <span style={{ color:'#166534' }}>Faturado: <strong>{fmtMoeda(tfat)}</strong></span>}
            {op.data_validade_ata && (
              <span style={{ color: diasAte(op.data_validade_ata)! < 30 ? '#991b1b' : '#64748b' }}>
                Validade: {fmtData(op.data_validade_ata)}
              </span>
            )}
          </div>
        )}

        {perdido && op.motivo_perda && (
          <div style={{ marginTop:4, fontSize:8, color:'#991b1b', fontWeight:600, fontStyle:'italic' }}>
            Motivo: {op.motivo_perda}
          </div>
        )}

        {desistiu && op.motivo_desistencia && (
          <div style={{ marginTop:4, fontSize:8, color:'#b45309', fontWeight:600, fontStyle:'italic' }}>
            Desistência: {op.motivo_desistencia}
          </div>
        )}

        {/* Badge de previsão de entrega de compra */}
        {ganho && (() => {
          const pc = pedidosCompra.filter(p => p.oportunidade_id === op.id);
          const comprado = pc.find(p => p.status_compra === 'Comprado' && p.data_prevista_recebimento);
          const pendente = pc.find(p => p.status_compra === 'Pendente' || p.status_compra === 'Em Andamento');
          if (comprado) return (
            <div style={{ marginTop:4, fontSize:9, color:'#166534', background:'#dcfce7', borderRadius:4, padding:'2px 7px', fontWeight:700, display:'inline-block' }}>
              📦 Entrega prev.: {new Date(comprado.data_prevista_recebimento + 'T12:00:00').toLocaleDateString('pt-BR')}
            </div>
          );
          if (pendente) return (
            <div style={{ marginTop:4, fontSize:9, color:'#92400e', background:'#fef3c7', borderRadius:4, padding:'2px 7px', fontWeight:700, display:'inline-block' }}>
              📦 Compra em andamento
            </div>
          );
          return null;
        })()}

        <div style={{ display:'flex', gap:3, marginTop:5, flexWrap:'wrap' }}>
          {ganho && (
            <>
              <button className="acn-btn" style={{ background:'#2563eb' }}
                onClick={() => { setModalConverter(op); setTipoConverter('op'); setNumOp(''); }}>
                📋 Lançar OP
              </button>
              {funil === 'venda_direta' && (
                <button className="acn-btn" style={{ background:'#ea580c' }}
                  onClick={() => { setModalConverter(op); setTipoConverter('os'); setNumOp(''); }}>
                  🔧 Lançar OS
                </button>
              )}
              <button className="acn-btn" style={{ background:'#0f766e' }}
                onClick={() => { setModalVenda({ op, venda: null }); setFormVenda({ ...VAZIO_VENDA, operador_nome: op.responsavel_nome || '' }); }}>
                + Venda
              </button>
              <button className="acn-btn" style={{ background:'#0369a1' }}
                onClick={() => { setModalCompras(op); setFormCompras({ ...VAZIO_COMPRA }); }}>
                📦 Compras
              </button>
            </>
          )}
          {desistiu && (
            <button className="acn-btn" style={{ background:'#d97706' }}
              onClick={() => reativarOp(op)}>
              ↩ Reativar
            </button>
          )}
          {!perdido && !desistiu && (
            <button className="acn-btn" style={{ background:'#0369a1' }}
              onClick={e => { e.stopPropagation(); setFormOp({ ...VAZIO_OP, ...op }); setModalAbrir(op); setAbrirTabDir('andamento'); setAbrirNovoText(''); }}>
              📂 Abrir
            </button>
          )}
          {funil === 'venda_direta' && !desistiu && (
            <button className="acn-btn" style={{ background:'#7c3aed', fontSize:8 }}
              onClick={() => setModalConverterLicit(op)}>
              🏛️ → Licitação/ATA
            </button>
          )}
          {currentUser?.perfil === 'Admin' && (
            <button className="acn-btn" style={{ background:'#ef4444' }} onClick={() => excluirOp(op)}>✕</button>
          )}
          <CrmAnexosWidget op={op} currentUser={currentUser} />
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // KANBAN
  // ─────────────────────────────────────────────────────────────────────────
  const renderKanban = () => (
    <div style={{ display:'flex', gap:8, alignItems:'flex-start', paddingBottom:8, minWidth:'max-content' }}>
      {estagiosFunil.map(est => {
        const cards   = opsFiltradas.filter(o => o.estagio_id === est.id);
        const ganho      = isGanho(est);
        const perdido    = isPerdido(est);
        const desistiu   = isDesistencia(est);
        const hdrBg      = perdido ? '#991b1b' : ganho ? '#166534' : desistiu ? '#92400e' : (est.cor || '#1e293b');

        return (
          <div key={est.id} style={{ width:200, flexShrink:0 }}>
            <div style={{ background:hdrBg, color:'white', padding:'4px 8px', borderRadius:'5px 5px 0 0',
              fontSize:9, fontWeight:700, display:'flex', justifyContent:'space-between', alignItems:'center',
              textTransform:'uppercase', letterSpacing:'.4px' }}>
              <span>{est.nome}</span>
              <span style={{ background:'rgba(255,255,255,.2)', borderRadius:8, padding:'1px 6px', fontSize:8 }}>
                {cards.length}
              </span>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(est.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(est.id)}
              style={{
                background: dragOver === est.id ? '#dbeafe' : perdido ? '#fee2e260' : ganho ? '#dcfce760' : desistiu ? '#fef3c760' : '#e8ecf0',
                borderRadius:'0 0 5px 5px', padding:5, minHeight:100, transition:'background .15s',
                border: dragOver === est.id ? '2px dashed #3b82f6' : '2px solid transparent',
              }}
            >
              {cards.map(op => renderCard(op))}
              {!perdido && !ganho && !desistiu && (
                <div
                  onClick={() => { setFormOp({ ...VAZIO_OP, funil, estagio_id: est.id }); setModalOp({}); }}
                  style={{ background:'white', border:'1px dashed #cbd5e1', borderRadius:5, padding:'5px 8px',
                    textAlign:'center', color:'#94a3b8', fontSize:9, cursor:'pointer', marginTop: cards.length ? 4 : 0 }}>
                  + Adicionar
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

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
        <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { label:'Total Vendido',  val: totalGeral,         cor:'#0f766e', bg:'#f0fdf4' },
            { label:'Faturado',       val: totalFaturadoGeral, cor:'#166534', bg:'#dcfce7' },
            { label:'A Faturar',      val: totalPendenteGeral, cor:'#854d0e', bg:'#fef9c3' },
          ].map(({ label, val, cor, bg }) => (
            <div key={label} style={{ background:bg, border:`1px solid ${cor}30`, borderRadius:6, padding:'7px 14px', minWidth:140 }}>
              <div style={{ fontSize:8, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:14, fontWeight:700, color:cor }}>{fmtMoeda(val)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {(['todos','pendente','faturado'] as const).map(f => (
          <button key={f} className="acn-btn"
            style={{ background: filtFat===f ? '#1e293b' : '#94a3b8' }}
            onClick={() => setFiltFat(f)}>
            {f === 'todos' ? 'Todos' : f === 'pendente' ? '⏳ Pendentes' : '✓ Faturados'}
          </button>
        ))}
        <span style={{ color:'#e2e8f0' }}>|</span>
        {(['todos','licitacao','venda_direta'] as const).map(f => (
          <button key={f} className="acn-btn"
            style={{ background: filtFunil===f ? '#1e293b' : '#94a3b8' }}
            onClick={() => setFiltFunil(f)}>
            {f === 'todos' ? 'Todos' : f === 'licitacao' ? '🏛️ Licitações' : '💼 V. Diretas'}
          </button>
        ))}
      </div>

      <div style={{ background:'white', borderRadius:8, border:'1px solid #e2e8f0', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
          <thead>
            <tr>
              {['Funil','Oportunidade','Órgão/Aderente','Operador','Qtd','Valor Total','NF','Data Fat.','Status',''].map(h => (
                <th key={h} style={{ background:'#1e293b', color:'#cbd5e1', padding:'4px 7px', fontWeight:600, textAlign:'left', fontSize:8, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendasFiltradas.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign:'center', padding:'20px', color:'#94a3b8', fontSize:10 }}>Nenhum registro encontrado</td></tr>
            ) : vendasFiltradas.map(v => {
              const opv = ops.find(o => o.id === v.oportunidade_id);
              return (
                <tr key={v.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'5px 7px' }}>
                    <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3,
                      background: opv?.funil==='licitacao' ? '#f5f3ff' : '#ecfeff',
                      color:      opv?.funil==='licitacao' ? '#7c3aed'  : '#0e7490' }}>
                      {opv?.funil==='licitacao' ? '🏛️ Lic.' : '💼 VD'}
                    </span>
                  </td>
                  <td style={{ padding:'5px 7px', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    <strong title={opv?.titulo}>{opv?.titulo || '—'}</strong>
                  </td>
                  <td style={{ padding:'5px 7px' }}>{v.orgao_aderente || opv?.orgao || '—'}</td>
                  <td style={{ padding:'5px 7px' }}>{v.operador_nome || '—'}</td>
                  <td style={{ padding:'5px 7px', textAlign:'center' }}>{v.quantidade || '—'}</td>
                  <td style={{ padding:'5px 7px', fontWeight:700, color:'#0f766e' }}>{fmtMoeda(v.valor_total)}</td>
                  <td style={{ padding:'5px 7px' }}>{v.numero_nf || <span style={{ color:'#f59e0b' }}>Pendente</span>}</td>
                  <td style={{ padding:'5px 7px' }}>{fmtData(v.data_faturamento)}</td>
                  <td style={{ padding:'5px 7px' }}>
                    <span style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:10,
                      background: v.status_faturamento==='faturado' ? '#dcfce7' : v.status_faturamento==='cancelado' ? '#fee2e2' : '#fef9c3',
                      color:      v.status_faturamento==='faturado' ? '#166534' : v.status_faturamento==='cancelado' ? '#991b1b' : '#854d0e' }}>
                      {v.status_faturamento==='faturado' ? '✓ Faturado' : v.status_faturamento==='cancelado' ? 'Cancelado' : '⏳ Pendente'}
                    </span>
                  </td>
                  <td style={{ padding:'5px 7px' }}>
                    <button className="acn-btn" style={{ background:'#475569' }}
                      onClick={() => { setModalVenda({ op: opv, venda: v }); setFormVenda({ ...VAZIO_VENDA, ...v }); }}>
                      ✏️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vendasFiltradas.length > 0 && (
          <div style={{ padding:'5px 10px', background:'#f8fafc', borderTop:'1px solid #e2e8f0', display:'flex', gap:12, fontSize:9, color:'#64748b' }}>
            <span>{vendasFiltradas.length} registros</span>
            {podeVerTotais && (
              <span>Total: <strong style={{ color:'#0f766e' }}>
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
  const NotaLivreEditor = (
    <div style={{ marginTop:16, border:'1px solid #d1d5db', borderRadius:6, overflow:'hidden' }}>
      <div style={{ background:'#f1f5f9', padding:'5px 8px', borderBottom:'1px solid #d1d5db',
        display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
        <span style={{ fontSize:9, fontWeight:700, color:'#475569', marginRight:4 }}>📌 Área Livre</span>
        <button onMouseDown={e=>{ e.preventDefault(); document.execCommand('bold'); }}
          title="Negrito" style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, fontWeight:700, cursor:'pointer', lineHeight:1.4 }}>
          <b>B</b>
        </button>
        <button onMouseDown={e=>{ e.preventDefault(); document.execCommand('italic'); }}
          title="Itálico" style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, fontStyle:'italic', cursor:'pointer', lineHeight:1.4 }}>
          <i>I</i>
        </button>
        <button onMouseDown={e=>{ e.preventDefault(); inserirLinkNota(); }}
          title="Inserir link" style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          🔗
        </button>
        <button onMouseDown={e=>{ e.preventDefault(); abrirNotaImgRef.current?.click(); }}
          title="Inserir imagem" style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          📷
        </button>
        <input ref={abrirNotaImgRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagemNota(f); e.target.value=''; }} />
      </div>
      <div
        ref={abrirNotaRef}
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight:100, padding:'10px 12px', fontSize:12, color:'#1e293b',
          lineHeight:1.6, outline:'none', background:'#fff', wordBreak:'break-word' }}
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
      <div style={{ background:'#f8fafc', borderTop:'1px solid #e2e8f0', padding:'6px 10px', display:'flex', justifyContent:'flex-end' }}>
        <button onClick={salvarNotaLivre} disabled={abrirNotaSalvando}
          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
            padding:'5px 14px', fontWeight:700, fontSize:10, cursor:'pointer',
            opacity: abrirNotaSalvando ? .6 : 1 }}>
          {abrirNotaSalvando ? 'Salvando...' : '💾 Salvar Nota'}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding:20, color:'#64748b', fontSize:11 }}>Carregando CRM...</div>;

  return (
    <div style={{ padding:'8px 12px' }}>

      {/* ── Navegação principal CRM ── */}
      <div style={{ display:'flex', background:'#0f172a', margin:'-8px -12px 0', padding:'0 12px' }}>
        {/* Funis */}
        {([['licitacao','🏛️ Licitações'],['venda_direta','💼 Vendas Diretas']] as const).map(([f, label]) => (
          <div key={f} onClick={() => { setFunil(f); setSecaoCrm('funil'); }} style={{
            padding:'7px 18px', fontSize:11, fontWeight:700, cursor:'pointer',
            color: secaoCrm==='funil' && funil===f ? (f==='licitacao'?'#a78bfa':'#38bdf8') : '#64748b',
            borderBottom: secaoCrm==='funil' && funil===f ? `3px solid ${f==='licitacao'?'#7c3aed':'#0891b2'}` : '3px solid transparent',
          }}>{label}</div>
        ))}
        {/* Contatos */}
        <div onClick={() => setSecaoCrm('contatos')} style={{
          padding:'7px 18px', fontSize:11, fontWeight:700, cursor:'pointer',
          color: secaoCrm==='contatos' ? '#fb923c' : '#64748b',
          borderBottom: secaoCrm==='contatos' ? '3px solid #ea580c' : '3px solid transparent',
        }}>📇 Contatos</div>

        <div style={{ flex:1 }} />
        {secaoCrm === 'funil' && podeVerFaturamentos && (
          <div style={{ display:'flex', alignItems:'center', gap:4, paddingRight:4 }}>
            {(['kanban','faturamentos'] as const).map(a => (
              <div key={a} onClick={() => setAbaInterna(a)} style={{
                padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer',
                color: abaInterna===a ? 'white' : '#64748b',
                background: abaInterna===a ? '#0f766e' : 'transparent',
                borderRadius:4, margin:'4px 0',
              }}>
                {a==='kanban' ? '📋 Kanban' : '💰 Faturamentos'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Seção Contatos ── */}
      {secaoCrm === 'contatos' && (
        <ContactosSection currentUser={currentUser} />
      )}

      {/* ── Seção Funis (Kanban / Faturamentos) ── */}
      {secaoCrm === 'funil' && <>

      {/* ── Contatos do Dia ── */}
      {contatosHoje.length > 0 && (
        <div style={{ background:'#fefce8', border:'1.5px solid #fde047', borderRadius:6, padding:'8px 12px', marginBottom:8 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#854d0e', marginBottom:6 }}>
            📅 CONTATOS AGENDADOS PARA HOJE ({contatosHoje.length})
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {contatosHoje.map(o => (
              <div key={o.id} style={{
                background:'white', border:'1px solid #fde047', borderRadius:5,
                padding:'5px 10px', fontSize:9,
              }}>
                <div style={{ fontWeight:700, color:'#1e293b' }}>{o.titulo}</div>
                {o.nome_contato && <div style={{ color:'#475569' }}>👤 {o.nome_contato}</div>}
                {o.contato      && <div style={{ color:'#0891b2' }}>📞 {o.contato}</div>}
                {o.responsavel_nome && <div style={{ color:'#94a3b8' }}>por {o.responsavel_nome}</div>}
                <div style={{ fontSize:8, color:'#64748b', marginTop:2 }}>
                  {o.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda Direta'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display:'flex', gap:6, alignItems:'center', margin:'8px 0', flexWrap:'wrap' }}>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:9, padding:'3px 10px' }}
          onClick={() => { setFormOp({ ...VAZIO_OP, funil }); setModalOp({}); }}>
          + Nova {funil==='licitacao' ? 'Licitação' : 'Venda Direta'}
        </button>
        <button className="acn-btn" style={{ background:'#7c3aed', fontSize:9, padding:'3px 10px' }}
          onClick={() => setModalNovaOpOs({})}>
          🔧 Nova OP / OS
        </button>
        <input
          placeholder={`🔍 Título, órgão ou edital...`}
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:9, width:180 }}
        />
        {/* Filtro por responsável */}
        <select value={filtResp} onChange={e => setFiltResp(e.target.value)}
          style={{ padding:'3px 7px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:9 }}>
          <option value="">👤 Todos os responsáveis</option>
          {respUnicos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {filtResp && (
          <button onClick={() => setFiltResp('')}
            style={{ fontSize:9, padding:'2px 7px', border:'1px solid #fca5a5', borderRadius:4, background:'#fef2f2', color:'#dc2626', cursor:'pointer' }}>
            ✕
          </button>
        )}
        <span style={{ fontSize:9, color:'#94a3b8' }}>
          {opsFiltradas.length} registros
          {podeVerTotais && ` · Pipeline: ${fmtMoeda(opsFiltradas.filter(o=>!isPerdido(getEst(o.estagio_id))&&!isGanho(getEst(o.estagio_id))).reduce((s,o)=>s+(o.valor_registrado||0),0))}`}
        </span>
      </div>

      {/* ── Conteúdo ── */}
      {abaInterna === 'kanban' ? (
        <div style={{ overflowX:'auto' }}>{renderKanban()}</div>
      ) : (
        renderFaturamentos()
      )}

      </> /* fim secaoCrm === 'funil' */}

      {/* ══════ MODAL CRIAR/EDITAR OP ══════ */}
      {modalOp !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalOp(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(540px,96vw)', maxHeight:'90vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'#1e293b' }}>
              {modalOp?.id ? '✏️ Editar' : '+ Nova'} {funil==='licitacao' ? 'Licitação' : 'Venda Direta'}
            </div>

            {funil === 'licitacao' && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Tipo de Licitação</div>
                <div style={{ display:'flex', gap:12 }}>
                  {([['ordinaria','📄 Licitação Ordinária'],['ata','📋 Ata de Registro de Preços']] as const).map(([t,label]) => (
                    <label key={t} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
                      <input type="radio" checked={formOp.tipo_licitacao===t}
                        onChange={() => setFormOp(f => ({...f, tipo_licitacao:t}))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Campos texto */}
            {([
              { label:'Título *', key:'titulo', placeholder:'Ex: Pregão SESP 2025/041' },
              ...(funil==='licitacao' ? [
                { label:'Número do Edital', key:'numero_edital', placeholder:'2025/041' },
                { label:'Órgão', key:'orgao', placeholder:'Secretaria de Segurança Pública' },
                { label:'Data da Sessão', key:'data_sessao', type:'date' },
                ...(formOp.tipo_licitacao==='ata' ? [{ label:'Validade da Ata', key:'data_validade_ata', type:'date' }] : []),
              ] : []),
              { label:'Valor Estimado (R$)', key:'valor_registrado', placeholder:'Ex: 280000' },
            ] as any[]).map(({ label, key, placeholder, type }) => (
              <div key={key} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>{label}</div>
                <input type={type||'text'} value={formOp[key]||''} placeholder={placeholder}
                  onChange={e => setFormOp(f => ({...f, [key]: e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Cliente (opcional)</div>
              <ClienteAutocomplete
                value={formOp._cliente_nome || ''}
                onChange={v => setFormOp(f => ({ ...f, _cliente_nome: v, cliente_id: null }))}
                onSelect={c => setFormOp(f => ({ ...f, _cliente_nome: c.nome, cliente_id: c.id }))}
                placeholder="Vincular cliente do cadastro..."
              />
              {formOp.cliente_id && (
                <div style={{ fontSize:8, color:'#059669', marginTop:2 }}>
                  ✓ Cliente vinculado — dados serão puxados automaticamente ao lançar OS
                </div>
              )}
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Responsável / Operador</div>
              <ColaboradorSelect
                value={formOp.responsavel_nome||''}
                onChange={v => setFormOp(f => ({...f, responsavel_nome: v}))}
                placeholder="Selecione o operador"
              />
            </div>

            {/* ── Campos de contato ── */}
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, padding:'8px 10px', marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#0369a1', marginBottom:6 }}>📞 CONTATO</div>
              <div style={{ marginBottom:5 }}>
                <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Nome</div>
                <input className="acn-input" style={{ width:'100%' }} placeholder="Nome do contato"
                  value={formOp.nome_contato||''} onChange={e => setFormOp(f => ({...f, nome_contato: e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Telefone</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="(99) 99999-9999"
                    value={formOp.contato||''} onChange={e => setFormOp(f => ({...f, contato: e.target.value}))} />
                </div>
                <div>
                  <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>E-mail</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="email@exemplo.com"
                    value={formOp.contato_email||''} onChange={e => setFormOp(f => ({...f, contato_email: e.target.value}))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Próximo Contato</div>
                <input type="date" className="acn-input" style={{ width:'100%' }}
                  value={formOp.prox_contato||''} onChange={e => setFormOp(f => ({...f, prox_contato: e.target.value}))} />
              </div>
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalOp(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarOportunidade} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CHECKLIST GATE ══════ */}
      {modalGate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(420px,96vw)', maxHeight:'80vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:4 }}>📋 Gate Lean — Checklist Obrigatório</div>
            <div style={{ fontSize:9, color:'#92400e', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:4, padding:'5px 8px', marginBottom:10 }}>
              ⚠️ Para avançar para <strong>"{getEst(modalGate.estagioDestId)?.nome}"</strong>, conclua os itens obrigatórios:
            </div>

            {modalGate.itens.map((it: any) => {
              const done = !!modalGate.prog?.find((p: any) => p.item_id === it.id && p.concluido);
              return (
                <div key={it.id} onClick={() => toggleItem(modalGate.op.id, it.id, done)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px dashed #f1f5f9', cursor:'pointer' }}>
                  <div style={{
                    width:16, height:16, borderRadius:3, flexShrink:0,
                    border:`2px solid ${done?'#22c55e':'#d1d5db'}`,
                    background: done ? '#22c55e' : 'white',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    {done && <span style={{ color:'white', fontSize:10, fontWeight:900 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:10, color:'#374151', flex:1 }}>{it.item_texto}</span>
                  {it.obrigatorio && <span style={{ fontSize:7, color:'#ef4444', fontWeight:700, flexShrink:0 }}>OBRIG.</span>}
                </div>
              );
            })}

            {(() => {
              const ok = modalGate.itens.filter((i:any)=>i.obrigatorio).every((i:any)=>modalGate.prog?.find((p:any)=>p.item_id===i.id&&p.concluido));
              return (
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:12 }}>
                  <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalGate(null)}>Cancelar</button>
                  <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px',
                    background: ok ? '#22c55e' : '#94a3b8', cursor: ok ? 'pointer' : 'not-allowed' }}
                    onClick={() => { if (ok) { moverCard(modalGate.op.id, modalGate.estagioDestId); setModalGate(null); } }}>
                    {ok ? '✓ Avançar Estágio' : '🔒 Itens pendentes'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════ MODAL MOTIVO PERDA ══════ */}
      {modalMotivo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(380px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#991b1b', marginBottom:8 }}>❌ Registrar como Não Vencida/Perdida</div>
            <div style={{ fontSize:10, color:'#374151', marginBottom:10 }}>
              Informe o motivo para <strong>"{modalMotivo.op.titulo}"</strong>:
            </div>
            <textarea value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)}
              placeholder="Ex: Preço acima do mercado, prazo incompatível, concorrência..."
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, height:80, resize:'vertical', boxSizing:'border-box' }}
            />
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:10 }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalMotivo(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#991b1b', fontSize:10, padding:'4px 12px' }} onClick={confirmarPerda}>Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL DESISTÊNCIA ══════ */}
      {modalDesist && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(380px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#92400e', marginBottom:8 }}>🚫 Registrar Desistência</div>
            <div style={{ fontSize:10, color:'#374151', marginBottom:10 }}>
              Motivo da desistência em <strong>"{modalDesist.op.titulo}"</strong>:
            </div>
            <textarea value={desistTexto} onChange={e => setDesistTexto(e.target.value)}
              placeholder="Ex: Edital desfavorável, fora do escopo, capacidade técnica insuficiente, decisão estratégica..."
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, height:80, resize:'vertical', boxSizing:'border-box' }}
              autoFocus
            />
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:10 }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalDesist(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#92400e', fontSize:10, padding:'4px 12px' }} onClick={confirmarDesistencia}>Confirmar Desistência</button>
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
              <MencaoTextarea
                value={novoAndamento}
                onChange={v => setNovoAndamento(v)}
                placeholder="Descreva o andamento da negociação... use @Nome para mencionar alguém"
                rows={3}
                style={{ border:'1px solid #c4b5fd', fontSize:11, marginBottom:6 }} />
              <button onClick={salvarAndamentoCrm} disabled={salvandoAndamento||!novoAndamento.trim()}
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'5px 14px',
                  fontWeight:700, fontSize:10, cursor:'pointer', opacity:novoAndamento.trim()?1:.5 }}>
                {salvandoAndamento ? 'Salvando...' : '+ Registrar'}
              </button>
            </div>
            {/* Histórico */}
            <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              {andamentoHistorico.length === 0 && (
                <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:20 }}>Nenhuma atualização registrada ainda.</div>
              )}
              {andamentoHistorico.map((h,i)=>(
                <div key={h.id||i} style={{ padding:'8px 10px', background:'#fff', border:'1px solid #e2e8f0',
                  borderRadius:5, borderLeft:'3px solid #7c3aed' }}>
                  <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}>{h.texto}</div>
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
                  if (!window.confirm('Converter em Licitação (status: Aguardando Licitação)?')) return;
                  setSalvando(true);
                  const agora = new Date().toISOString();
                  const op = modalConverterLicit;
                  const historico = [{ status:'Aguardando Licitação', usuario: currentUser?.nome, data: agora, obs: `Convertida de Venda Direta CRM: ${op.titulo}` }];
                  const { error } = await supabase.from('licitacoes').insert([{
                    numero: op.numero_edital || `VD-${op.id.slice(0,6).toUpperCase()}`,
                    nome_projeto: op.titulo || '—',
                    orgao: op.orgao || '',
                    objeto_principal: op.descricao || '',
                    classificacao: 'Direta',
                    status: 'Aguardando Licitação',
                    prioridade: 'Média',
                    analista_nome: op.responsavel_nome || currentUser?.nome || '',
                    analista_email: currentUser?.email || '',
                    historico,
                    marcadores: [],
                    criado_por: currentUser?.email,
                    criado_por_nome: currentUser?.nome,
                    criado_em: agora,
                    atualizado_em: agora,
                  }]);
                  setSalvando(false);
                  if (error) { alert('Erro: ' + error.message); return; }
                  setModalConverterLicit(null);
                  alert('✅ Licitação criada com status "Aguardando Licitação"! Acesse a aba Licitações para acompanhar.');
                }}>
                🏛️ Processo Licitatório<br/>
                <span style={{ fontSize:9, fontWeight:400 }}>Cria nova licitação com status "Aguardando Licitação"</span>
              </button>
              <button
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:6, padding:'10px 14px', fontWeight:700, fontSize:11, cursor:salvando?'not-allowed':'pointer', opacity:salvando?.6:1, textAlign:'left' }}
                disabled={salvando}
                onClick={async () => {
                  if (!window.confirm('Converter em Adesão a ATA?')) return;
                  setSalvando(true);
                  const agora = new Date().toISOString();
                  const op = modalConverterLicit;
                  const historico = [{ status:'Aguardando Licitação', usuario: currentUser?.nome, data: agora, obs: `Convertida de Venda Direta CRM (Adesão a ATA): ${op.titulo}` }];
                  const { error } = await supabase.from('licitacoes').insert([{
                    numero: op.numero_edital || `ATA-${op.id.slice(0,6).toUpperCase()}`,
                    nome_projeto: op.titulo || '—',
                    orgao: op.orgao || '',
                    objeto_principal: op.descricao || '',
                    classificacao: 'Adesão a ATA',
                    status: 'Aguardando Licitação',
                    prioridade: 'Média',
                    analista_nome: op.responsavel_nome || currentUser?.nome || '',
                    analista_email: currentUser?.email || '',
                    historico,
                    marcadores: [],
                    criado_por: currentUser?.email,
                    criado_por_nome: currentUser?.nome,
                    criado_em: agora,
                    atualizado_em: agora,
                  }]);
                  setSalvando(false);
                  if (error) { alert('Erro: ' + error.message); return; }
                  setModalConverterLicit(null);
                  alert('✅ Adesão a ATA criada! Acesse a aba Licitações para acompanhar.');
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

            <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:8 }}>Tipo de lançamento:</div>
            <div style={{ display:'grid', gridTemplateColumns: funil==='venda_direta' ? '1fr 1fr' : '1fr', gap:8, marginBottom:12 }}>
              {([
                { tipo:'op', icon:'📋', title:'Ordem de Produção', desc:'Equipamentos / instalação / fabricação', dest:'→ Aba Engenharia', cor:'#2563eb' },
                ...(funil==='venda_direta' ? [{ tipo:'os', icon:'🔧', title:'Ordem de Serviço', desc:'Manutenção / suporte técnico / garantia', dest:'→ Aba SAC', cor:'#ea580c' }] : []),
              ] as any[]).map(({ tipo, icon, title, desc, dest, cor }) => (
                <div key={tipo} onClick={() => setTipoConverter(tipo)}
                  style={{ border:`2px solid ${tipoConverter===tipo ? cor : '#e2e8f0'}`,
                    borderRadius:6, padding:'10px 8px', textAlign:'center', cursor:'pointer',
                    background: tipoConverter===tipo ? `${cor}12` : 'white', transition:'all .15s' }}>
                  <div style={{ fontSize:24, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#1e293b' }}>{title}</div>
                  <div style={{ fontSize:8, color:'#64748b', margin:'3px 0' }}>{desc}</div>
                  <div style={{ fontSize:8, color:cor, fontWeight:700 }}>{dest}</div>
                </div>
              ))}
            </div>

            {tipoConverter === 'op' && (
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:9, fontWeight:700, color:'#374151', display:'block', marginBottom:3 }}>
                  Número da OP *
                </label>
                <input
                  className="acn-input"
                  style={{ width:'100%', fontSize:11 }}
                  placeholder="Ex: 2024.0001"
                  value={numOp}
                  onChange={e => setNumOp(mascaraOp(e.target.value))}
                  maxLength={9}
                  autoFocus
                />
                <div style={{ fontSize:8, color:'#94a3b8', marginTop:2 }}>Formato: XXXX.XXXX (ex: 2024.0001)</div>
              </div>
            )}

            <div style={{ fontSize:9, color:'#64748b', background:'#f8fafc', borderRadius:4, padding:'5px 8px', marginBottom:10 }}>
              {tipoConverter === 'op'
                ? 'Título → Modelo, Órgão → Cliente. Status: Em Espera Engenharia.'
                : 'Número da OS será gerado automaticamente.'}
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => { setModalConverter(null); setNumOp(''); }}>Cancelar</button>
              <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px',
                background: tipoConverter==='op' ? '#2563eb' : '#ea580c', opacity: salvando?.5:1 }}
                onClick={converterGanho} disabled={salvando}>
                {salvando ? 'Criando...' : tipoConverter==='op' ? '📋 Criar OP' : '🔧 Criar OS'}
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
                <option value="pendente">⏳ Pendente</option>
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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:8, padding:20, width:420, maxWidth:'95vw', boxShadow:'0 8px 32px rgba(0,0,0,.3)' }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'#0f766e' }}>
              📦 Solicitar Compra — {modalCompras.titulo || '(sem título)'}
            </div>

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Descrição do Material / Serviço *</div>
              <input value={formCompras.descricao_material}
                onChange={e => setFormCompras(f => ({...f, descricao_material:e.target.value}))}
                placeholder="Ex: Câmeras IP, instalação elétrica..."
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
              />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Quantidade</div>
                <input type="number" min={1} value={formCompras.quantidade}
                  onChange={e => setFormCompras(f => ({...f, quantidade: Number(e.target.value)||1 }))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Fornecedor (opcional)</div>
                <input value={formCompras.fornecedor}
                  onChange={e => setFormCompras(f => ({...f, fornecedor:e.target.value}))}
                  placeholder="Nome do fornecedor..."
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Observações</div>
              <MencaoTextarea value={formCompras.observacoes_compra||''} rows={2}
                placeholder="Especificações técnicas, urgência, referências... @Nome para mencionar"
                onChange={v => setFormCompras(f => ({...f, observacoes_compra:v}))} />
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }}
                onClick={() => { setModalCompras(null); setFormCompras({...VAZIO_COMPRA}); }}>
                Cancelar
              </button>
              <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 12px', opacity: salvandoCompra?.5:1 }}
                onClick={emitirPedidoCompraCrm} disabled={salvandoCompra || !formCompras.descricao_material.trim()}>
                {salvandoCompra ? 'Enviando...' : '📦 Enviar para Compras'}
              </button>
            </div>
          </div>
        </div>
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
          <button onClick={() => { setModalAbrir(null); setAbrirMinimized(false); }}
            style={{ background:'none', border:'none', color:'#fff', fontSize:16, cursor:'pointer', padding:'2px 6px' }}>✕</button>
        </div>
      )}
      {modalAbrir && !abrirMinimized && (
        <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1100, display:'flex' }}>
          <div ref={abrirContainerRef} style={{ display:'flex', width:'100%', height:'100%' }}>

            {/* ── ESQUERDO: formulário editável ── */}
            <div style={{ width:`${abrirLeftWidth}%`, minWidth:280, display:'flex', flexDirection:'column', background:'#fff', boxShadow:'2px 0 12px #0002' }}>
              {/* Header */}
              <div style={{ padding:'12px 14px', background:'#1e3a5f', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:9, opacity:.8, fontWeight:700, letterSpacing:.5 }}>
                    {modalAbrir.funil === 'licitacao' ? 'LICITAÇÃO CRM' : 'VENDA DIRETA'}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{modalAbrir.titulo}</div>
                  {modalAbrir.orgao && <div style={{ fontSize:9, opacity:.85 }}>{modalAbrir.orgao}</div>}
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={() => setAbrirMinimized(true)}
                    title="Minimizar" style={{ background:'none', border:'none', color:'#fff', fontSize:16, cursor:'pointer', padding:'2px 6px', lineHeight:1 }}>─</button>
                  <button onClick={() => setModalAbrir(null)}
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
                  { label:'Valor Estimado (R$)', key:'valor_registrado', placeholder:'Ex: 280000' },
                  { label:'Previsão de Fechamento', key:'data_prev_fechamento', type:'date' },
                ] as any[]).map(({ label, key, placeholder, type }) => (
                  <div key={key} style={{ marginBottom:7 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>{label}</div>
                    <input type={type||'text'} value={formOp[key]||''} placeholder={placeholder}
                      onChange={e => setFormOp(f => ({...f, [key]: e.target.value}))}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }} />
                  </div>
                ))}

                <div style={{ marginBottom:7 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Estágio</div>
                  <select value={formOp.estagio_id||''} onChange={e => setFormOp(f => ({...f, estagio_id: e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                    <option value="">— Selecione —</option>
                    {estagiosFunil.filter(e => !isPerdido(e) && !isGanho(e)).map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom:7 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Cliente (opcional)</div>
                  <ClienteAutocomplete
                    value={formOp._cliente_nome || ''}
                    onChange={v => setFormOp(f => ({ ...f, _cliente_nome: v, cliente_id: null }))}
                    onSelect={c => setFormOp(f => ({ ...f, _cliente_nome: c.nome, cliente_id: c.id }))}
                    placeholder="Vincular cliente..." />
                </div>

                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:2 }}>Responsável</div>
                  <ColaboradorSelect value={formOp.responsavel_nome||''} onChange={v => setFormOp(f => ({...f, responsavel_nome: v}))} placeholder="Selecione o operador" />
                </div>

                <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#0369a1', marginBottom:5 }}>📞 CONTATO</div>
                  <div style={{ marginBottom:5 }}>
                    <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Nome</div>
                    <input className="acn-input" style={{ width:'100%' }} placeholder="Nome do contato"
                      value={formOp.nome_contato||''} onChange={e => setFormOp(f => ({...f, nome_contato: e.target.value}))} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                    <div>
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
                    <div>
                      <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>E-mail</div>
                      <input className="acn-input" style={{ width:'100%' }} placeholder="email@exemplo.com"
                        value={formOp.contato_email||''} onChange={e => setFormOp(f => ({...f, contato_email: e.target.value}))} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Próximo Contato</div>
                    <input type="date" className="acn-input" style={{ width:'100%' }}
                      value={formOp.prox_contato||''} onChange={e => setFormOp(f => ({...f, prox_contato: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'10px 14px', borderTop:'1px solid #e2e8f0', display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={salvarAbrirForm} disabled={salvando}
                  style={{ flex:1, background:'#0f766e', color:'#fff', border:'none', borderRadius:5, padding:'7px 0', fontWeight:700, fontSize:11, cursor:'pointer', opacity:salvando?.6:1 }}>
                  {salvando ? 'Salvando...' : '💾 Salvar Alterações'}
                </button>
                <button onClick={() => setModalAbrir(null)}
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
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background .15s' }}>
              <div style={{ width:2, height:40, background:'#c0c0c0', borderRadius:1 }} />
            </div>

            {/* ── DIREITO: abas de documentos ── */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f4f6f9', overflow:'hidden' }}>

              {/* Tab bar */}
              <div style={{ display:'flex', overflowX:'auto', borderBottom:'2px solid #e2e8f0', background:'#fff', flexShrink:0, scrollbarWidth:'none' }}>
                {TABS_CRM.map(t => (
                  <button key={t.key} onClick={() => setAbrirTabDir(t.key)}
                    style={{ flex:'0 0 auto', padding:'9px 11px', border:'none',
                      borderBottom: abrirTabDir===t.key ? '2px solid #0369a1' : '2px solid transparent',
                      background:'none', fontWeight: abrirTabDir===t.key ? 700 : 400,
                      color: abrirTabDir===t.key ? '#0369a1' : '#6b7280', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Conteúdo */}
              <div style={{ flex:1, overflowY:'auto', padding:14 }}>

                {/* ── ANÁLISE ── */}
                {abrirTabDir === 'analise' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <AnaliseStatusBadge origemId={modalAbrir.id} />
                    <button className="acn-btn" style={{ background:'#7c3aed', alignSelf:'flex-start' }}
                      onClick={() => setModalSolicitarAnalise(modalAbrir)}>
                      🔬 Solicitar / Ver Análise
                    </button>
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
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                      {abrirAndamentoHist.length === 0 && (
                        <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:'10px 0' }}>Nenhuma atualização registrada ainda.</div>
                      )}
                      {abrirAndamentoHist.map((h,i) => (
                        <div key={h.id||i} style={{ padding:'8px 10px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:5, borderLeft:'3px solid #7c3aed' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5, flex:1 }}>{h.texto}</div>
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
                {abrirTabDir !== 'andamento' && abrirTabDir !== 'analise' && (
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
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                      {abrirDocs.length === 0 && (
                        <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:16 }}>Nenhum documento registrado.</div>
                      )}
                      {abrirDocs.map((d,i) => (
                        <div key={d.id||i} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:5, padding:'8px 10px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ flex:1 }}>
                              {d.url && (
                                <a href={d.url} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize:11, color:'#0369a1', fontWeight:600, display:'block', marginBottom:2 }}>
                                  📎 {d.nome || 'Arquivo'}
                                </a>
                              )}
                              {d.conteudo && <div style={{ fontSize:10, color:'#475569', whiteSpace:'pre-wrap' }}>{d.conteudo}</div>}
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

    {/* ── Modal Nova OP / OS ── */}
    {modalNovaOpOs && (
      <NovaOpOsModal
        isOpen={true}
        onClose={() => setModalNovaOpOs(null)}
        currentUser={currentUser}
        crmCard={modalNovaOpOs.crmCard}
        onSaved={() => setModalNovaOpOs(null)}
      />
    )}

    </div>
  );
}
