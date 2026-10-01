// @ts-nocheck
import { supabase } from './supabaseClient';
import { EXT_PLANILHAS } from './FormatosArquivo';
import React, { useState, useEffect, useRef } from 'react';
import { notificarEvento } from './whatsappHelper';
import { ClienteAutocomplete, clienteToForm, salvarClienteAuto } from './ClienteUtils';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';
import { combinaBusca } from './SearchUtils';
import Linkify from './Linkify';
import { ColaboradorSelect } from './ColaboradorSelect';
import AgendaWidget from './AgendaWidget';
import { logChange, useUnreadMap } from './AuditSystem';
import { confirmar, pedirTexto } from './Feedback';
import { Abas, Botao, Selo, Chips, MenuAcoes, hojeISO } from './Interface';
import Icone from './Icone';
import { mdiClipboardTextOutline, mdiCellphoneNfc, mdiCogOutline, mdiRefresh, mdiPhoneOutline, mdiDomain, mdiPlay, mdiCheck, mdiNoteEditOutline, mdiClose, mdiContentSaveOutline, mdiPlus, mdiPencilOutline, mdiCarOutline, mdiRadioHandheld, mdiShapeOutline, mdiClipboardListOutline,
  mdiMessageTextOutline, mdiSendOutline, mdiEyeOutline, mdiTruckDeliveryOutline, mdiAccountEditOutline, mdiPaperclip, mdiClipboardCheckOutline, mdiAlertOutline, mdiAccessPoint, mdiMapMarkerOutline, mdiMenuUp, mdiMenuDown, mdiCurrencyUsd, mdiTimerOutline, mdiWrenchOutline, mdiArrowRight, mdiPrinterOutline } from '@mdi/js';

// Fallback enquanto categorias não carregam do banco
const TIPOS_PROJETO_FALLBACK = [
  'Transformacao Veicular Ostensiva','Transformacao Veicular Administrativa',
  'Instalacao Equipamento','Manutencao Preventiva','Manutencao Corretiva',
  'Calibracao','Reforma','Projeto Especial','Servico Externo',
];

const STATUS_COR: Record<string, string> = {
  // Fluxo LAB (OS padrão)
  'Diagnóstico':                   '#0891b2',
  'Aberta':                        '#3b82f6',
  'Orçamento Pronto':              '#7c3aed',
  'Orç. Enviado':                  '#f59e0b',
  'Aprovado':                      '#22c55e',
  'Reprovado':                     '#ef4444',
  'Em Execução':                   '#8b5cf6',
  'Concluído':                     '#0d9488',
  'Entregue':                      '#166534',
  // Fluxo MANUTENÇÃO VEICULAR
  'Em Cotação':                    '#0891b2',
  'Aguardando Aprovação Cliente':  '#f59e0b',
  'Em Provisionamento':            '#7c3aed',
  'Aguardando Aceite SAC':         '#f59e0b',
  'Provisionada':                  '#16a34a',
  'Aguardando Início':             '#f59e0b',
  'Verificação e Orçamento':       '#8b5cf6',
  'Em Manutenção':                 '#dc2626',
  'Manutenção Concluída':          '#0d9488',
  'Aguardando CQ':                 '#8b5cf6',
  'Aguardando Envio Fiscal':       '#f59e0b',
  'Aguardando Emissão NF':         '#0891b2',
  'Faturada - Aguardando Entrega': '#166534',
};

// Etapa 12d3 (01/10/2026): na lista de OS a cor do status vem da FAMÍLIA do guia de interface (a mesma de todas as telas), não mais do hexadecimal acima — que segue valendo só para
// as opções do filtro e para o PDF da OS. Regra: pedindo ação ou resposta de alguém = atenção; em andamento no laboratório/produção = marca; já tratado = ok; recusado = erro.
const FAMILIA_STATUS_SAC: Record<string, string> = {
  'Diagnóstico': 'info', 'Aberta': 'info', 'Orçamento Pronto': 'marca', 'Orç. Enviado': 'atencao', 'Aprovado': 'ok', 'Reprovado': 'erro',
  'Em Execução': 'marca', 'Concluído': 'ok', 'Entregue': 'ok',
  'Em Cotação': 'info', 'Aguardando Aprovação Cliente': 'atencao', 'Em Provisionamento': 'marca', 'Aguardando Aceite SAC': 'atencao', 'Provisionada': 'ok',
  'Aguardando Início': 'atencao', 'Verificação e Orçamento': 'marca', 'Em Manutenção': 'marca', 'Manutenção Concluída': 'ok', 'Aguardando CQ': 'atencao',
  'Aguardando Envio Fiscal': 'atencao', 'Aguardando Emissão NF': 'info', 'Faturada - Aguardando Entrega': 'ok',
};

// Etapa 7.21 (01/10/2026, R16): prazo_orcamento e data_prevista_pos_aprovacao são do tipo DATE ("2026-09-30"). new Date("2026-09-30") é meia-noite de Londres, que no
// Brasil ainda é o dia anterior: a lista e o PDF mostravam essas datas um dia antes do real (9 das 19 OS reais têm prazo e todas apareciam um dia antes). Texto só com a data: o dia sai direto do texto.
// Data com hora (data_abertura, data_aprovacao, data_saida...) continua pelo fuso de quem usa. Mesmo erro já corrigido na Logística (7.10) e no RH (7.15).
const fmtDataSAC = (d: any) => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');

// Detecta OS de manutenção veicular
const isVeicular = (tp: string) => {
  const t = (tp||'').toLowerCase().replace(/[çc]/g,'c').replace(/[ãa]/g,'a').replace(/[êe]/g,'e');
  return (t.includes('manutencao') || t.includes('garantia')) &&
         (t.includes('veicular') || t.includes('veiculo'));
};

// ─── Canvas de Assinatura ────────────────────────────────────────────────────
function SignCanvas({ onSave }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);

  const xy = (e) => {
    const r = ref.current.getBoundingClientRect();
    // escala: no celular o canvas encolhe para caber na tela (no computador clientWidth = width, escala 1)
    const sx = ref.current.width / (ref.current.clientWidth || ref.current.width), sy = ref.current.height / (ref.current.clientHeight || ref.current.height);
    return e.touches
      ? { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy }
      : { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const {x,y}=xy(e); const c=ref.current.getContext('2d'); c.beginPath(); c.moveTo(x,y); };
  const move  = (e) => { e.preventDefault(); if (!drawing.current) return; const {x,y}=xy(e); const c=ref.current.getContext('2d'); c.lineTo(x,y); c.stroke(); setHas(true); };
  const end   = () => { drawing.current = false; };
  const clear = () => { ref.current.getContext('2d').clearRect(0,0,460,130); setHas(false); };

  useEffect(() => {
    const c = ref.current.getContext('2d');
    c.strokeStyle='#1e293b'; c.lineWidth=2; c.lineCap='round';
  }, []);

  return (
    <div style={{textAlign:'center'}}>
      <canvas ref={ref} width={460} height={120}
        style={{border:'2px dashed #94a3b8',borderRadius:4,cursor:'crosshair',background:'white',display:'block',margin:'0 auto',maxWidth:'100%'}}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:5}}>
        <button className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={clear}>Limpar</button>
        <button className="acn-btn" style={{background:'#22c55e',fontSize:10,opacity:has?1:0.5}} onClick={()=>has&&onSave(ref.current.toDataURL())} disabled={!has}>Confirmar Assinatura</button>
      </div>
    </div>
  );
}

async function uploadFoto(file: File, pasta: string): Promise<string | null> {
  const path = `sac/${pasta}/${Date.now()}_${file.name.replace(/\s/g,'_')}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

async function uploadAssinatura(dataUrl: string, pasta: string): Promise<string | null> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `sac/${pasta}/assinatura_${Date.now()}.png`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

async function gerarNumeroOS(): Promise<string> {
  // Usa função RPC atômica no Postgres — imune a race condition
  const { data: rpcData, error: rpcErr } = await supabase.rpc('proximo_numero_os');
  if (!rpcErr && rpcData) return rpcData as string;

  // Fallback (caso acn_fix_numero_os.sql ainda não tenha sido rodado)
  const ano = new Date().getFullYear();
  const { data } = await supabase
    .from('sac_ordens_servico')
    .select('numero_os')
    .like('numero_os', `OS-%-${ano}`);
  let max = 0;
  for (const row of (data || [])) {
    const match = row.numero_os?.match(/^OS-(\d+)\//);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `OS-${String(max + 1).padStart(4, '0')}/${ano}`;
}

// Empresa da OS (ACN ou DETECH), como o faturamento da OP. OS antigas não
// têm (null) e podem ser definidas clicando na etiqueta da lista.
const EMPRESAS_OS = ['ACN', 'DETECH'];
const COR_EMPRESA: Record<string, { bg: string; fg: string }> = {
  ACN:    { bg:'#0f766e', fg:'#fff' },
  DETECH: { bg:'#1d4ed8', fg:'#fff' },
};

const FORM_VAZIO = {
  empresa:'ACN',
  tipo_servico:'Orçamento', tipo_projeto:'', equipamento_nome:'',
  marca:'', modelo:'', numero_serie:'', quantidade:1,
  defeito_reclamado:'', observacoes:'',
  cliente_nome:'', empresa_orgao:'', endereco:'', cpf_cnpj:'', telefone:'', email:'',
  _cliente_id: null as string|null, _cliente_obj: null as any,
  prazo_orcamento:'', data_prevista_entrega:'',
  acessorios: [] as {descricao:string; presente:boolean}[],
  despesa_deslocamento:'', despesa_hospedagem:'', despesa_alimentacao:'',
  // Manutenção Veicular
  is_veiculo: false,
  tipo_avaliacao: 'Presencial' as 'Presencial'|'Remota',
  acompanhamento_engenharia: false,
  itens_cotacao: [] as {codigo:string;descricao:string;quantidade:number;valor_unitario:number}[],
  // Faturamento
  cnpj_faturamento:'', razao_social_faturamento:'', endereco_faturamento:'',
  // Financeiro / Comissões
  valor_total: '' as string|number, valor_mao_de_obra: '' as string|number, data_faturamento: '',
  // Vínculo CRM
  crm_oportunidade_id: null as string|null,
  _crm_titulo: '',
};

// Etiqueta ACN/DETECH na lista. Clique define/troca (OS antigas não têm).
function EtiquetaEmpresaOS({ os, onTrocar }: { os: any; onTrocar: (os: any) => void }) {
  // Etapa 12d3: o mesmo botão de antes (clique troca a empresa), agora um Selo do guia — ACN verde-água da marca, DETECH azul, OS sem empresa cinza com "+ empresa"
  const familia = os.empresa === 'ACN' ? 'marca' : os.empresa === 'DETECH' ? 'info' : 'neutro';
  return (
    <Selo familia={familia} ponto={false} onClick={() => onTrocar(os)}
      title={COR_EMPRESA[os.empresa] ? 'Clique para trocar a empresa desta OS' : 'OS sem empresa — clique para definir'}>
      {os.empresa || '+ empresa'}
    </Selo>
  );
}

export default function SacTab({ currentUser }) {
  const [abaAtiva, setAbaAtiva]         = useState<'os'|'cadastros'|'chamados_nfc'>('os');
  const [chamadosNfc,  setChamadosNfc]  = useState<any[]>([]);
  const [loadNfc,      setLoadNfc]      = useState(false);
  const [nfcStatus,    setNfcStatus]    = useState('');
  const [nfcAbertos,   setNfcAbertos]   = useState(0); // total REAL de chamados "Aberto" (R25): não depende do filtro nem do que está carregado
  const [modalNfc,     setModalNfc]     = useState<any>(null);
  const [ordens, setOrdens]             = useState([]);
  // Linhas/cards com alteração não vista por este usuário — mesmo padrão
  // usado nas telas de OP (ver AuditSystem.tsx).
  const { naoLidoSet: ordensNaoLidas } = useUnreadMap('sac_ordens_servico', ordens.map((o: any) => o.id), currentUser);
  const [equipamentos, setEquipamentos] = useState([]); // só os ATIVOS: é a lista do campo "Tipo de Equipamento" da Nova OS
  const [equipamentosTodos, setEquipamentosTodos] = useState<any[]>([]); // ativos e desativados: é a lista da aba Cadastros
  const [categorias, setCategorias]     = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [filtroStatus, setFiltroStatus]       = useState('');
  const [filtroTipo, setFiltroTipo]         = useState('');
  const [filtroAvaliacao, setFiltroAvaliacao] = useState('');
  const [filtroEmpresa, setFiltroEmpresa]     = useState('');
  const [busca, setBusca]               = useState('');
  const [modalAcomp, setModalAcomp]     = useState<any>(null); // acompanhamento OS

  // Cadastros estados
  const [abaCad, setAbaCad]             = useState<'equipamentos'|'categorias'|'tipos_servico'>('equipamentos');
  const [novoEquipCad, setNovoEquipCad] = useState('');
  const [novaCat, setNovaCat]           = useState({ nome:'', tem_despesas: false });
  const [editCat, setEditCat]           = useState<any>(null);
  // Tipos de serviço dinâmicos
  const [tiposServico, setTiposServico]       = useState<any[]>([]);
  const [novoTipoServico, setNovoTipoServico] = useState('');

  const [modalNova, setModalNova]       = useState(false);
  const [crmBusca, setCrmBusca]         = useState('');
  const [crmSugestoes, setCrmSugestoes] = useState<any[]>([]);
  const [crmBuscando, setCrmBuscando]   = useState(false);
  const [modalOrc, setModalOrc]         = useState(null);
  const [modalAprov, setModalAprov]     = useState(null);
  const [modalAprovCotacao, setModalAprovCotacao] = useState<any>(null);
  const [aprovCotacaoNome, setAprovCotacaoNome]   = useState('');
  const [modalRepr, setModalRepr]       = useState(null);
  const [modalSaida, setModalSaida]     = useState(null);
  const [modalNovoEquip, setModalNovoEquip] = useState(false);

  const [form, setForm]                 = useState<typeof FORM_VAZIO>({ ...FORM_VAZIO });
  const [acessInput, setAcessInput]     = useState('');
  const [fotosEntradaFiles, setFotosEntradaFiles] = useState([]);
  const [salvando, setSalvando]         = useState(false);

  const [orcForm, setOrcForm]           = useState({ valor:'', condicoes:'' });
  const [aprovForm, setAprovForm]       = useState({ nome:'', sig: null as string|null, data_entrega:'' });
  const [reprForm, setReprForm]         = useState({ motivo:'', data_retirada:'', nome_retirada:'' });
  const [saidaForm, setSaidaForm]       = useState({ nome:'', sig: null as string|null });
  const [fotosSaidaFiles, setFotosSaidaFiles] = useState([]);
  const [novoEquip, setNovoEquip]       = useState('');

  // Manutenção Veicular — modais extras
  const [modalAceiteSAC, setModalAceiteSAC]       = useState<any>(null);
  const [modalItens, setModalItens]               = useState<any>(null); // ver/editar itens cotação (Em Cotação)
  const [localItens, setLocalItens]               = useState<any[]>([]); // itens editáveis do modal de cotação
  const [horasCobradas, setHorasCobradas]         = useState<string>(''); // horas cobradas na cotação remota
  const [modalEnviarFiscal, setModalEnviarFiscal] = useState<any>(null); // Aguardando Envio Fiscal — captura nº de série
  const [fiscalItens, setFiscalItens]             = useState<any[]>([]);
  const [modalOrcProd, setModalOrcProd]           = useState<any>(null); // ver/editar orçamento vindo da Produção
  const [orcProdModo, setOrcProdModo]             = useState<'ver'|'editar'>('ver');
  const [orcProdItens, setOrcProdItens]           = useState<any[]>([]);
  const [anexosSendoUpload, setAnexosSendoUpload] = useState(false);
  const [modalAnexar, setModalAnexar] = useState<any>(null);
  const [anexarFiles, setAnexarFiles]   = useState<File[]>([]);
  const [modalEntregaVeic, setModalEntregaVeic] = useState<any>(null);
  const [nomeRecebeuVeic, setNomeRecebeuVeic]   = useState('');
  const [modalFinanceiro, setModalFinanceiro] = useState<any>(null);
  const [financeiroForm, setFinanceiroForm] = useState({ valor_total:'', valor_mao_de_obra:'', data_faturamento:'' });
  // Editar responsável da OS
  const [modalEditRespOS, setModalEditRespOS] = useState<any>(null);
  const [editRespOSNome, setEditRespOSNome]   = useState('');
  const [arquivosEntradaFiles, setArquivosEntradaFiles] = useState<File[]>([]);

  // Lista de equipamentos por item (cresce/diminui conforme quantidade)
  const EQUIP_VAZIO = { marca:'', modelo:'', numero_serie:'', chassi:'', defeito:'' };
  const [equipLista, setEquipLista]     = useState([{ ...EQUIP_VAZIO }]);

  useEffect(() => {
    fetchOrdens(); fetchEquipamentos(); fetchCategorias(); fetchTiposServico();
    // Pré-preenchimento vindo do CRM (sessionStorage)
    const raw = sessionStorage.getItem('pendingOsFromCrm');
    if (raw) {
      try {
        const d = JSON.parse(raw);
        sessionStorage.removeItem('pendingOsFromCrm');
        // Se veio objeto bruto do cliente, usa clienteToForm para extrair campos completos
        const cli = d.cliente_obj ? clienteToForm(d.cliente_obj) : null;
        setForm(f => ({
          ...f,
          defeito_reclamado: d.defeito_reclamado || '',
          equipamento_nome:  d.equipamento_nome  || '',
          observacoes:       d.observacoes       || '',
          // dados do cliente — prioriza objeto completo, senão usa campos planos enviados
          cliente_nome:  cli?.cliente_nome  || d.cliente_nome  || '',
          empresa_orgao: cli?.empresa_orgao || d.empresa_orgao || '',
          cpf_cnpj:      cli?.cpf_cnpj      || d.cpf_cnpj      || '',
          telefone:      cli?.telefone      || d.telefone      || '',
          email:         cli?.email         || d.email         || '',
          endereco:      cli?.endereco      || d.endereco      || '',
          _cliente_id:   cli?._cliente_id   || d.cliente_id    || null,
          _cliente_obj:  cli?._cliente_obj  || d.cliente_obj   || null,
        }));
        setEquipLista([{ marca:'', modelo:'', numero_serie:'', defeito: d.defeito_reclamado || '' }]);
        setModalNova(true);
      } catch (_) {}
    }
  }, []);

  const fetchCategorias = async () => {
    const { data } = await supabase.from('sac_categorias').select('*').order('nome');
    setCategorias(data || []);
  };

  const fetchTiposServico = async () => {
    const { data } = await supabase.from('sac_tipos_servico').select('*').order('nome');
    setTiposServico(data || []);
    // fallback se tabela ainda não existe
    if (!data?.length) {
      setTiposServico([
        { id:'1', nome:'Orçamento', ativo:true },
        { id:'2', nome:'Conserto', ativo:true },
        { id:'3', nome:'Troca', ativo:true },
        { id:'4', nome:'Garantia', ativo:true },
      ]);
    }
  };

  const salvarTipoServico = async () => {
    if (!novoTipoServico.trim()) return;
    // Etapa 7.20 (01/10/2026): as gravações desta aba ignoravam o resultado — com a gravação recusada, o nome digitado sumia sem aviso (tipo de serviço),
    // a edição da categoria fechava e perdia o que foi digitado, e desativar/ativar falhava em silêncio. Agora avisa o erro e mantém o que foi digitado
    // (o mesmo aviso "Erro: …" que adicionar equipamento e adicionar categoria já mostravam).
    const { error } = await supabase.from('sac_tipos_servico').insert([{ nome: novoTipoServico.trim() }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setNovoTipoServico('');
    fetchTiposServico();
  };

  const toggleTipoServico = async (t: any) => {
    const { error } = await supabase.from('sac_tipos_servico').update({ ativo: !t.ativo }).eq('id', t.id);
    if (error) { alert('Erro: ' + error.message); return; }
    fetchTiposServico();
  };

  const fetchOrdens = async () => {
    setLoading(true);
    const { data } = await supabase.from('sac_ordens_servico').select('*').order('data_abertura', { ascending: false });
    setOrdens(data || []);
    setLoading(false);
  };

  // Deep-link vindo do painel de Menções ("OS X" clicável) — abre o
  // acompanhamento da OS em vez de só cair na aba SAC genérica. Cobre os
  // contextos 'sac' (SacTab) e 'sac_revisao_orcamento' (criado em
  // ProducaoTab.tsx, mas resolvido aqui via botão "🔁 Resolver Revisão").
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || (pend.contexto !== 'sac' && pend.contexto !== 'sac_revisao_orcamento')) return;
      (window as any).__acnDeepLink = null;
      supabase.from('sac_ordens_servico').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalAcomp(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  // Resposta do usuário em 01/10/2026: a aba Cadastros mostra TAMBÉM os equipamentos desativados, esmaecidos e com o botão "Ativar" (antes a lista só trazia
  // os ativos e desativar era definitivo pela tela — o banco tinha 12 desativados que ninguém via). Uma só leitura traz todos; a Nova OS continua só com os ativos.
  const fetchEquipamentos = async () => {
    const { data } = await supabase.from('sac_equipamentos').select('*').order('nome');
    const todos = data || [];
    setEquipamentos(todos.filter((e: any) => e.ativo === true));
    // ativos primeiro, desativados depois (cada grupo em ordem de nome)
    setEquipamentosTodos([...todos].sort((a: any, b: any) => (b.ativo === true ? 1 : 0) - (a.ativo === true ? 1 : 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR')));
  };

  // ── Computados ────────────────────────────────────────────────────────────
  const categoriasAtivas = categorias.filter(c => c.ativo);
  const tiposProjeto = categoriasAtivas.length > 0 ? categoriasAtivas.map(c => c.nome) : TIPOS_PROJETO_FALLBACK;
  const catSelecionada = categorias.find(c => c.nome === form.tipo_projeto);
  const hasDespesas = catSelecionada?.tem_despesas || form.tipo_projeto?.toLowerCase().includes('externo');

  // Redimensiona equipLista conforme quantidade
  const handleQtdChange = (n: number) => {
    const newN = Math.max(1, n || 1);
    setForm(f => ({ ...f, quantidade: newN }));
    setEquipLista(prev => {
      const cur = [...prev];
      while (cur.length < newN) cur.push({ ...EQUIP_VAZIO });
      return cur.slice(0, newN);
    });
  };

  // ── CRIAR OS ──────────────────────────────────────────────────────────────
  const criarOS = async () => {
    if (!form.cliente_nome.trim()) { alert('Nome do cliente obrigatório!'); return; }
    if (!form.equipamento_nome.trim()) { alert('Informe o equipamento!'); return; }
    // Etapa 7.23 (resposta do usuário em 01/10/2026): o asterisco de "Defeito Reclamado *" sempre esteve na tela, mas a OS abria sem — 3 das 19 OS reais estão sem defeito. Agora é obrigatório, em cada equipamento da OS.
    const semDefeito = equipLista.findIndex(e => !String(e.defeito || '').trim());
    if (semDefeito >= 0) { alert(equipLista.length > 1 ? `Informe o defeito reclamado do equipamento ${semDefeito + 1}!` : 'Informe o defeito reclamado!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const isGarantia = form.tipo_servico === 'Garantia';
    const ehVeicular = form.is_veiculo || isVeicular(form.tipo_projeto);

    // Gera primeiro número e faz upload de fotos (uma única vez)
    let numero = await gerarNumeroOS();
    const urlsFotos: string[] = [];
    // Etapa 7.23: foto ou documento que não subiu era descartado em silêncio e a OS abria sem ele (a prova de como o equipamento chegou se perdia). Agora a OS NÃO abre: avisa qual arquivo falhou e
    // deixa o formulário e os arquivos escolhidos como estão, para tentar de novo ou tirar o arquivo da lista. (Suposição minha, registrada no plano.)
    for (const f of fotosEntradaFiles) {
      const url = await uploadFoto(f, `os_${numero.replace('/','_')}/entrada`);
      if (!url) { alert(`Não consegui enviar a foto "${f.name}". A OS NÃO foi aberta: tente de novo ou tire a foto da lista.`); setSalvando(false); return; }
      urlsFotos.push(url);
    }
    const urlsArquivos: any[] = [];
    for (const f of arquivosEntradaFiles) {
      const result = await uploadArquivo(f, `os_${numero.replace('/','_')}/arquivos`);
      if (!result) { alert(`Não consegui enviar o documento "${f.name}". A OS NÃO foi aberta: tente de novo ou tire o documento da lista.`); setSalvando(false); return; }
      urlsArquivos.push({ ...result, enviado_em: new Date().toISOString(), enviado_por: currentUser?.nome||'' });
    }

    // Payload base sem numero_os (será preenchido em cada tentativa)
    const payloadBase = {
      empresa: form.empresa || 'ACN',
      tipo_servico: form.tipo_servico,
      tipo_projeto: form.tipo_projeto || null,
      equipamento_nome: form.equipamento_nome,
      marca: equipLista[0]?.marca || null,
      modelo: equipLista[0]?.modelo || null,
      numero_serie: equipLista[0]?.numero_serie || null,
      chassi: equipLista[0]?.chassi || null,
      quantidade: form.quantidade || 1,
      defeito_reclamado: equipLista[0]?.defeito || null,
      equipamentos_lista: equipLista,
      observacoes: form.observacoes || null,
      cliente_nome: form.cliente_nome,
      empresa_orgao: form.empresa_orgao || null,
      endereco: form.endereco || null,
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      prazo_orcamento: !isGarantia ? (form.prazo_orcamento || null) : null,
      data_prevista_entrega: isGarantia ? (form.data_prevista_entrega || null) : null,
      status: ehVeicular
        ? (form.tipo_avaliacao === 'Remota' ? 'Em Cotação' : 'Em Provisionamento')
        : (isGarantia ? 'Aprovado' : 'Diagnóstico'),
      aprovado: isGarantia && !ehVeicular ? true : null,
      is_manutencao_veicular: ehVeicular,
      tipo_avaliacao: ehVeicular ? form.tipo_avaliacao : null,
      acompanhamento_engenharia: form.acompanhamento_engenharia || false,
      itens_cotacao: form.itens_cotacao?.length > 0 ? form.itens_cotacao : null,
      cnpj_faturamento: form.cnpj_faturamento || null,
      razao_social_faturamento: form.razao_social_faturamento || null,
      endereco_faturamento: form.endereco_faturamento || null,
      acessorios: form.acessorios,
      fotos_entrada: urlsFotos,
      arquivos_os: urlsArquivos.length > 0 ? urlsArquivos : [],
      data_abertura: agora,
      criado_por_nome: currentUser?.nome,
      criado_por_email: currentUser?.email,
      atualizado_em: agora,
      despesa_deslocamento: hasDespesas && form.despesa_deslocamento ? parseFloat(form.despesa_deslocamento.replace(',','.')) : null,
      despesa_hospedagem:   hasDespesas && form.despesa_hospedagem   ? parseFloat(form.despesa_hospedagem.replace(',','.'))   : null,
      despesa_alimentacao:  hasDespesas && form.despesa_alimentacao  ? parseFloat(form.despesa_alimentacao.replace(',','.'))  : null,
      total_despesas: hasDespesas ? (
        (parseFloat(form.despesa_deslocamento.replace(',','.')) || 0) +
        (parseFloat(form.despesa_hospedagem.replace(',','.'))   || 0) +
        (parseFloat(form.despesa_alimentacao.replace(',','.'))  || 0)
      ) : null,
      valor_total: form.valor_total ? parseFloat(String(form.valor_total).replace(',','.')) : null,
      valor_mao_de_obra: form.valor_mao_de_obra ? parseFloat(String(form.valor_mao_de_obra).replace(',','.')) : null,
      data_faturamento: form.data_faturamento || null,
      crm_oportunidade_id: form.crm_oportunidade_id || null,
    };

    // INSERT com retry automático: se número já existe (23505), gera o próximo e tenta de novo
    let osData = null;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      if (tentativa > 0) numero = await gerarNumeroOS();
      const { data, error } = await supabase
        .from('sac_ordens_servico')
        .insert([{ ...payloadBase, numero_os: numero }])
        .select('id').single();
      if (!error) { osData = data; break; }
      if (error.code !== '23505') { alert('Erro: ' + error.message); setSalvando(false); return; }
    }

    if (!osData) { alert('Não foi possível gerar número único. Tente novamente.'); setSalvando(false); return; }

    if (form.observacoes) {
      await salvarMencoes({
        texto:             form.observacoes,
        mencionanteId:     String(currentUser?.id || ''),
        mencionanteNome:   currentUser?.nome || currentUser?.email || 'Usuário',
        contexto:          'sac',
        contextoId:        osData.id,
        contextoDescricao: `OS ${numero} — ${form.equipamento_nome || ''}`,
        campo:             'observacoes',
        abaDestino:        'sac',
      });
    }

    // Etapa 7.23: a OS já existe a partir daqui; se uma das demandas não for criada o aviso diz qual, em vez de a OS ficar parada sem ninguém saber (o Laboratório só enxerga a OS pela demanda).
    const falhasDemanda: string[] = [];
    // Auto-criar demanda para Laboratório (apenas OS não veiculares)
    if (!ehVeicular) {
      const sac_fase = isGarantia ? 'execucao' : 'diagnostico';
      // Etapa 7.23 (resposta do usuário em 01/10/2026): a demanda dizia sempre "Ver OS" porque lia form.defeito_reclamado, que a tela nunca preenche (o defeito digitado fica em equipLista); só vale para OS novas
      const defeitoDemanda = String(equipLista[0]?.defeito || '').trim() || form.defeito_reclamado || 'Ver OS';
      const descDemanda = isGarantia
        ? `[SAC-EXEC] ${numero} — ${form.equipamento_nome} | ${defeitoDemanda}`
        : `[SAC-DIAG] ${numero} — ${form.equipamento_nome} | ${defeitoDemanda}`;
      const { error: errLab } = await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Laboratorio',
        descricao: descDemanda,
        numero_opl: numero,
        status: 'Pendente',
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
        data_abertura: agora,
        sac_os_id: osData?.id,
        sac_fase,
        logs_demanda: [{
          texto: isGarantia
            ? `OS Garantia — aprovada automaticamente. Encaminhada para execução.`
            : `OS aberta para diagnóstico e elaboração de orçamento.`,
          usuario: currentUser?.nome, hora: agora,
        }],
      }]);
      if (errLab) falhasDemanda.push(`a demanda para o Laboratório não foi criada (${errLab.message})`);
    }

    // Se acompanhamento_engenharia: criar demanda para Engenharia
    if (form.acompanhamento_engenharia) {
      const { error: errEng } = await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Engenharia',
        descricao: `[SAC-ENG] ${numero} — ${form.equipamento_nome} | Acompanhamento de Engenharia`,
        numero_opl: numero,
        status: 'Pendente',
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
        data_abertura: agora,
        sac_os_id: osData?.id,
        sac_fase: 'acompanhamento',
        logs_demanda: [{ texto: 'OS aberta com acompanhamento de engenharia solicitado.', usuario: currentUser?.nome, hora: agora }],
      }]);
      if (errEng) falhasDemanda.push(`a demanda para a Engenharia não foi criada (${errEng.message})`);
    }
    if (falhasDemanda.length) alert(`A OS ${numero} foi aberta, mas ${falhasDemanda.join(' e ')}. Avise o PCP ou a TI: a OS existe e precisa dessa demanda para seguir.`);

    notificarEvento('sac_os_aberta', `*Nova OS ${numero}*\nCliente: ${form.cliente_nome}\nEquip: ${form.equipamento_nome}\nTipo: ${form.tipo_servico}\nPor: ${currentUser?.nome}`);

    const _savedCliente = { formData: { ...form }, clienteId: form._cliente_id };
    setForm({ ...FORM_VAZIO }); setFotosEntradaFiles([]); setArquivosEntradaFiles([]); setAnexarFiles([]); setAcessInput('');
    setEquipLista([{ ...EQUIP_VAZIO }]);
    setCrmBusca(''); setCrmSugestoes([]);
    setModalNova(false); setSalvando(false); fetchOrdens();
    if (_savedCliente.formData.cliente_nome?.trim()) salvarClienteAuto(_savedCliente.formData, _savedCliente.clienteId).catch(console.error);
  };

  // ── ENVIAR ORÇAMENTO ──────────────────────────────────────────────────────
  const enviarOrcamento = async () => {
    if (!orcForm.valor) { alert('Informe o valor do orçamento!'); return; }
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Orç. Enviado',
      valor_orcamento: parseFloat(orcForm.valor.replace(',','.')),
      condicoes_pagamento: orcForm.condicoes || null,
      data_envio_orcamento: agora,
      atualizado_em: agora,
    }).eq('id', modalOrc.id);
    notificarEvento('sac_orcamento_enviado', `*Orçamento enviado — ${modalOrc.numero_os}*\nCliente: ${modalOrc.cliente_nome}\nValor: R$ ${orcForm.valor}\nPor: ${currentUser?.nome}`);
    setModalOrc(null); setOrcForm({ valor:'', condicoes:'' }); fetchOrdens();
  };

  // ── APROVAÇÃO ─────────────────────────────────────────────────────────────
  const salvarAprovacao = async () => {
    if (!aprovForm.nome.trim()) { alert('Informe o nome do aprovador!'); return; }
    if (!aprovForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(aprovForm.sig, `os_${modalAprov.numero_os.replace('/','_')}`);
    const agora = new Date().toISOString();

    await supabase.from('sac_ordens_servico').update({
      status: 'Aprovado',
      aprovado: true,
      aprovador_nome: aprovForm.nome,
      data_aprovacao: agora,
      assinatura_aprovacao_url: url || '',
      data_prevista_pos_aprovacao: aprovForm.data_entrega || null,
      atualizado_em: agora,
    }).eq('id', modalAprov.id);
    logChange({ module: 'sac', entityType: 'sac_ordens_servico', entityId: modalAprov.id, changeType: 'UPDATE',
      oldRow: { status: modalAprov.status }, newRow: { status: 'Aprovado' }, user: currentUser });

    // Auto-criar demanda de EXECUÇÃO para Laboratório
    await supabase.from('demandas_setoriais').insert([{
      setor_destino: 'Laboratorio',
      descricao: `[SAC-EXEC] ${modalAprov.numero_os} — ${modalAprov.equipamento_nome} | Aguarda execução do reparo`,
      numero_opl: modalAprov.numero_os,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      sac_os_id: modalAprov.id,
      sac_fase: 'execucao',
      logs_demanda: [{
        texto: `Cliente aprovou orçamento ${fmtVal(modalAprov.valor_orcamento)}. Aprovador: ${aprovForm.nome}. Data prevista: ${aprovForm.data_entrega || 'não definida'}.`,
        usuario: currentUser?.nome, hora: agora,
      }],
    }]);

    notificarEvento('sac_os_aprovada', `*OS ${modalAprov.numero_os} APROVADA*\nCliente: ${modalAprov.cliente_nome}\nAprovador: ${aprovForm.nome}\nPor: ${currentUser?.nome}`);
    setModalAprov(null); setAprovForm({ nome:'', sig:null, data_entrega:'' }); fetchOrdens();
  };

  // ── REPROVAÇÃO ────────────────────────────────────────────────────────────
  const reprovar = async () => {
    if (!reprForm.motivo.trim()) { alert('Informe o motivo!'); return; }
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Reprovado', aprovado: false,
      motivo_reprovacao: reprForm.motivo,
      data_retirada_reprovacao: reprForm.data_retirada || null,
      nome_retirada_reprovacao: reprForm.nome_retirada || null,
      atualizado_em: agora,
    }).eq('id', modalRepr.id);
    notificarEvento('sac_os_reprovada', `*OS ${modalRepr.numero_os} REPROVADA*\nCliente: ${modalRepr.cliente_nome}\nMotivo: ${reprForm.motivo}`);
    setModalRepr(null); setReprForm({ motivo:'', data_retirada:'', nome_retirada:'' }); fetchOrdens();
  };

  // ── SAÍDA / ENTREGA ───────────────────────────────────────────────────────
  const salvarSaida = async () => {
    if (!saidaForm.nome.trim()) { alert('Informe o nome de quem retirou!'); return; }
    if (!saidaForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(saidaForm.sig, `os_${modalSaida.numero_os.replace('/','_')}_saida`);
    const agora = new Date().toISOString();
    const urlsFotos: string[] = [];
    for (const f of fotosSaidaFiles) {
      const u = await uploadFoto(f, `os_${modalSaida.numero_os.replace('/','_')}/saida`);
      if (u) urlsFotos.push(u);
    }
    await supabase.from('sac_ordens_servico').update({
      status: 'Entregue',
      nome_retirada_saida: saidaForm.nome,
      assinatura_saida_url: url || '',
      data_saida: agora,
      fotos_saida: urlsFotos,
      atualizado_em: agora,
    }).eq('id', modalSaida.id);
    notificarEvento('sac_os_entregue', `*OS ${modalSaida.numero_os} ENTREGUE*\nCliente: ${modalSaida.cliente_nome}\nRetirado por: ${saidaForm.nome}`);
    setModalSaida(null); setSaidaForm({ nome:'', sig:null }); setFotosSaidaFiles([]); fetchOrdens();
  };

  // ── FLUXO MANUTENÇÃO VEICULAR ─────────────────────────────────────────────

  const salvarItensOS = async (osId: string, itens: any[], horasCobradasVal?: string) => {
    const agora = new Date().toISOString();
    const hc = horasCobradasVal !== undefined && horasCobradasVal !== '' ? Number(horasCobradasVal) : null;
    await supabase.from('sac_ordens_servico').update({
      itens_cotacao: itens,
      horas_cobradas_cotacao: hc,
      atualizado_em: agora,
    }).eq('id', osId);
    fetchOrdens();
  };

  const enviarCotacaoCliente = async (os: any) => {
    const agora = new Date().toISOString();
    const total = (os.itens_cotacao||[]).reduce((s,i)=>s+(i.quantidade||1)*(i.valor_unitario||0),0);
    // Etapa 7.22 (01/10/2026): as ações da lista que gravam direto ignoravam o resultado — com a gravação recusada elas seguiam como se tivesse dado certo e esta
    // ainda mandava o aviso de WhatsApp de uma cotação que não foi enviada. Agora a falha avisa o erro e NADA mais acontece (nem o aviso, nem a atualização da lista).
    const { error } = await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Aprovação Cliente',
      valor_orcamento: total,
      data_envio_orcamento: agora,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (error) { alert('Erro ao enviar a cotação: ' + error.message); return; }
    notificarEvento('sac_cotacao_enviada', `*Cotação enviada — ${os.numero_os}*\nCliente: ${os.cliente_nome}\nTotal: R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}`);
    fetchOrdens();
  };

  const aprovarCotacao = (os: any) => {
    setAprovCotacaoNome('');
    setModalAprovCotacao(os);
  };

  const confirmarAprovCotacao = async () => {
    if (!aprovCotacaoNome.trim()) { alert('Informe o nome de quem aprovou!'); return; }
    const os = modalAprovCotacao;
    const agora = new Date().toISOString();
    const total = (os.itens_cotacao||[]).reduce((s:number,i:any)=>s+(i.quantidade||1)*(i.valor_unitario||0),0);
    await supabase.from('sac_ordens_servico').update({
      status: 'Em Provisionamento',
      aprovado: true,
      data_aprovacao: agora,
      aprovador_nome: aprovCotacaoNome.trim(),
      atualizado_em: agora,
    }).eq('id', os.id);
    const msg2 = `✅ *Cotação APROVADA — ${os.numero_os}*
Cliente: ${os.cliente_nome}
Aprovado por: ${aprovCotacaoNome.trim()}
Total: R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}
⚙️ Produção: definir data de atendimento`;
    notificarEvento('sac_aprovacao_remota', msg2);
    setModalAprovCotacao(null);
    fetchOrdens();
  }

  const recusarCotacao = async (os: any) => {
    const motivo = await pedirTexto('Motivo da recusa (opcional):');
    if (motivo === null) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('sac_ordens_servico').update({
      status: 'Reprovado',
      aprovado: false,
      motivo_reprovacao: motivo,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (error) { alert('Erro ao registrar a recusa: ' + error.message); return; }
    fetchOrdens();
  };

  // SAC recebe OS de volta depois que Produção definiu data → confirma com cliente
  const confirmarAceiteSAC = async (os: any) => {
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: os.tipo_avaliacao === 'Remota' ? 'Aguardando Início' : 'Provisionada',
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('sac_aceite_data', `*SAC confirmou data — ${os.numero_os}*\nCliente: ${os.cliente_nome}\nData: ${os.data_provisionamento ? new Date(os.data_provisionamento+'T12:00').toLocaleDateString('pt-BR') : '—'} (${os.periodo_provisionamento||''})`);
    setModalAceiteSAC(null);
    fetchOrdens();
  };

  // SAC: cliente não confirmou a data → volta para Produção redefinir
  const rejeitarAceiteSAC = async (os: any) => {
    if (!await confirmar('Confirmar: cliente não aceitou a data e OS voltará para Produção redefinir?')) return;
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Em Provisionamento',
      data_provisionamento: null,
      periodo_provisionamento: null,
      atualizado_em: agora,
    }).eq('id', os.id);
    setModalAceiteSAC(null);
    fetchOrdens();
  };

  // SAC aprova orçamento de verificação presencial → Produção atribui técnico
  // (unificado com o caminho Remota: os dois passam por "Aguardando Início"
  // antes de iniciar o trabalho de fato, em vez de pular direto pra execução).
  const aprovarOrcamentoPresencial = async (os: any) => {
    if (!await confirmar(`Confirmar aprovação do orçamento de manutenção pelo cliente — ${os.numero_os}?`)) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Início',
      aprovado: true,
      data_aprovacao: agora,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (error) { alert('Erro ao registrar a aprovação: ' + error.message); return; }
    fetchOrdens();
  };

  // SAC edita orçamento que veio da Produção (Presencial — Aguardando Aprovação
  // Cliente, ou renegociação em Manutenção Concluída/revisão pendente). Ao
  // salvar, também resolve uma eventual revisão pendente (ver salvarConclusao
  // em ProducaoTab.tsx): a Adaptação fica livre pra concluir de novo.
  const salvarEdicaoOrcProd = async () => {
    if (!modalOrcProd) return;
    if (!orcProdItens.length) { alert('Adicione ao menos um item!'); return; }
    const total = orcProdItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      itens_cotacao: orcProdItens,
      valor_orcamento: total,
      revisao_pendente: false,
      valor_orcamento_revisado: null,
      itens_revisados: null,
      atualizado_em: agora,
    }).eq('id', modalOrcProd.id);
    setModalOrcProd(null); setOrcProdItens([]);
    fetchOrdens();
  };

  // SAC envia OS aprovada no CQ para o Fiscal, registrando o nº de série de
  // cada item instalado (mesma lista de materiais_utilizados, agora com o
  // campo numero_serie preenchido) → Fiscal passa a enxergar essa OS.
  const enviarParaFiscal = async () => {
    const os = modalEnviarFiscal;
    if (!os) return;
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      materiais_utilizados: fiscalItens,
      status: 'Aguardando Emissão NF',
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('sac_enviado_fiscal', `*Enviado para o Fiscal — ${os.numero_os}*\nCliente: ${os.cliente_nome}`);
    setModalEnviarFiscal(null); setFiscalItens([]);
    fetchOrdens();
  };

  const liberarEntregaVeicular = (os: any) => {
    setNomeRecebeuVeic('');
    setModalEntregaVeic(os);
  };

  const confirmarEntregaVeicular = async () => {
    if (!nomeRecebeuVeic.trim()) { alert('Informe o nome de quem recebeu o veículo!'); return; }
    const os = modalEntregaVeic;
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Entregue',
      data_saida: agora,
      nome_retirada_saida: nomeRecebeuVeic.trim(),
      atualizado_em: agora,
    }).eq('id', os.id);
    logChange({ module: 'sac', entityType: 'sac_ordens_servico', entityId: os.id, changeType: 'UPDATE',
      oldRow: { status: os.status }, newRow: { status: 'Entregue' }, user: currentUser });
    notificarEvento('sac_os_entregue', `*Veículo entregue — ${os.numero_os}*
Cliente: ${os.cliente_nome}
Recebido por: ${nomeRecebeuVeic.trim()}`);
    setModalEntregaVeic(null);
    fetchOrdens();
  };

  // Upload genérico de arquivo
  const uploadArquivo = async (file: File, pasta: string): Promise<{nome:string;url:string;tipo:string}|null> => {
    const path = `sac/${pasta}/${Date.now()}_${file.name.replace(/\s/g,'_')}`;
    const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert:true, contentType:'application/octet-stream' });
    if (error||!data) return null;
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    return { nome: file.name, url: pub?.publicUrl||'', tipo: file.type };
  };

  const anexarArquivos = async (os: any, files: File[]) => {
    if (!files.length) return;
    setAnexosSendoUpload(true);
    const existentes: any[] = Array.isArray(os.arquivos_os) ? os.arquivos_os : [];
    const novos: any[] = [];
    for (const f of files) {
      const result = await uploadArquivo(f, `os_${os.numero_os.replace('/','_')}/arquivos`);
      if (result) novos.push(result);
    }
    await supabase.from('sac_ordens_servico').update({
      arquivos_os: [...existentes, ...novos],
      atualizado_em: new Date().toISOString(),
    }).eq('id', os.id);
    setAnexosSendoUpload(false);
    fetchOrdens();
  };

  // ── NOVO EQUIPAMENTO ──────────────────────────────────────────────────────
  const salvarEquipamento = async () => {
    if (!novoEquip.trim()) return;
    const { error } = await supabase.from('sac_equipamentos').insert([{ nome: novoEquip.trim() }]);
    if (error) { alert('Erro: ' + error.message); return; }
    await fetchEquipamentos();
    setForm(f => ({ ...f, equipamento_nome: novoEquip.trim() }));
    setNovoEquip(''); setModalNovoEquip(false);
  };

  // Define/troca a empresa de uma OS já aberta (as antigas não têm).
  const trocarEmpresaOS = async (os: any) => {
    const nova = os.empresa === 'ACN' ? 'DETECH' : 'ACN';
    const pergunta = os.empresa
      ? `Trocar a empresa da ${os.numero_os} de ${os.empresa} para ${nova}?`
      : `Definir a empresa da ${os.numero_os}.

OK = ACN   |   Cancelar = DETECH`;
    let escolhida = nova;
    if (os.empresa) { if (!await confirmar(pergunta)) return; }
    else escolhida = await confirmar(pergunta) ? 'ACN' : 'DETECH';
    const { error } = await supabase.from('sac_ordens_servico')
      .update({ empresa: escolhida, atualizado_em: new Date().toISOString() }).eq('id', os.id);
    if (error) { alert('Erro ao salvar a empresa: ' + error.message); return; }
    setOrdens(prev => prev.map((x: any) => x.id === os.id ? { ...x, empresa: escolhida } : x));
  };

  // ── FILTROS ───────────────────────────────────────────────────────────────
  const ordensFiltradas = ordens.filter(o => {
    if (filtroStatus && o.status !== filtroStatus) return false;
    if (filtroTipo && o.tipo_servico !== filtroTipo) return false;
    if (filtroAvaliacao === 'Remota' && o.tipo_avaliacao !== 'Remota') return false;
    if (filtroAvaliacao === 'Presencial' && o.tipo_avaliacao !== 'Presencial') return false;
    if (filtroAvaliacao === 'Veicular' && !o.is_manutencao_veicular) return false;
    if (filtroEmpresa === 'sem' && o.empresa) return false;
    if (filtroEmpresa && filtroEmpresa !== 'sem' && o.empresa !== filtroEmpresa) return false;
    if (busca) return combinaBusca([o.numero_os, o.cliente_nome, o.equipamento_nome], busca);
    return true;
  });

  const fmtDt  = fmtDataSAC;
  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}` : '—';

  // ── AÇÕES POR STATUS ──────────────────────────────────────────────────────
  // Etapa 12d3 (01/10/2026): só aparência. Os textos, a ordem e o que cada botão faz são os de antes; cada botão ganha ícone e a variante pela importância:
  // o passo que a OS espera do SAC naquele status é o botão cheio (primário) e recusar é vermelho vazado. Escolha do usuário em 01/10/2026 (com a lista real medida: tudo à vista deixava
  // a lista 60% mais alta, de 1.590 para 2.593 px): o que TODA OS tem — Resp., Financeiro, Anexar e PDF — vai para o menu ⋯ da linha, como no PCP, no Fiscal e na Produção; o Acomp. fica à vista.
  const renderAcoes = (os) => {
    const btns = [
      // Botão de acompanhamento — sempre visível em qualquer status
      <Botao key="acomp" pequeno icone={mdiMessageTextOutline}
        onClick={()=>setModalAcomp(os)}>Acomp.</Botao>,
    ];
    const eh = os.is_manutencao_veicular;

    // ── FLUXO VEICULAR ──────────────────────────────────────────────────────
    if (eh) {
      // Orçamento revisado durante a execução (itens não bateram com o
      // aprovado) → SAC negocia com o cliente e resolve, independente do
      // status atual (a OS fica parada em Em Execução até isso ser resolvido).
      if (os.revisao_pendente) {
        const itensRevisao = Array.isArray(os.itens_revisados) && os.itens_revisados.length > 0
          ? os.itens_revisados.map((i:any) => ({...i}))
          : Array.isArray(os.itens_cotacao) && os.itens_cotacao.length > 0
            ? os.itens_cotacao.map((i:any) => ({...i}))
            : [{codigo:'',descricao:'',quantidade:1,valor_unitario:0}];
        btns.push(
          <Botao key="revisao" pequeno variante="perigo" icone={mdiRefresh}
            onClick={()=>{ setOrcProdItens(itensRevisao); setOrcProdModo('editar'); setModalOrcProd(os); }}>
            Resolver Revisão ({fmtVal(os.valor_orcamento_revisado)})
          </Botao>
        );
      }
      // Remota: Em Cotação → SAC insere itens e envia cotação
      if (os.status === 'Em Cotação') {
        btns.push(
          <Botao key="itens" pequeno icone={mdiClipboardListOutline}
            onClick={()=>{ setLocalItens(Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setHorasCobradas(os.horas_cobradas_cotacao!=null?String(os.horas_cobradas_cotacao):''); setModalItens(os); }}>
            Itens
          </Botao>,
          <Botao key="enviar" pequeno variante="primario" icone={mdiSendOutline}
            onClick={()=>{ if(!(os.itens_cotacao?.length>0)){alert('Adicione os itens antes de enviar!');return;} enviarCotacaoCliente(os); }}>
            Enviar Cotação
          </Botao>
        );
      }
      // Aguardando Aprovação Cliente → SAC registra resposta do cliente
      if (os.status === 'Aguardando Aprovação Cliente') {
        if (os.tipo_avaliacao === 'Remota' && !os.data_chegada_veiculo) {
          // Remota: cotação aguardando → aprovação envia para Produção provisionar
          btns.push(
            <Botao key="aprov" pequeno variante="primario" icone={mdiCheck} onClick={()=>aprovarCotacao(os)}>Aprovado</Botao>,
            <Botao key="repr" pequeno variante="perigo-sec" icone={mdiClose} onClick={()=>recusarCotacao(os)}>Recusado</Botao>
          );
        } else {
          // Presencial: orçamento de verificação aguardando → aprovação inicia manutenção
          btns.push(
            <Botao key="ver" pequeno icone={mdiEyeOutline}
              onClick={()=>{ setOrcProdItens(Array.isArray(os.itens_cotacao)?os.itens_cotacao.map(i=>({...i})):[]); setOrcProdModo('ver'); setModalOrcProd(os); }}>
              Ver Orç.
            </Botao>,
            <Botao key="edit" pequeno icone={mdiPencilOutline}
              onClick={()=>{ setOrcProdItens(Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setOrcProdModo('editar'); setModalOrcProd(os); }}>
              Editar
            </Botao>,
            <Botao key="aprov" pequeno variante="primario" icone={mdiCheck} onClick={()=>aprovarOrcamentoPresencial(os)}>Aprovado</Botao>,
            <Botao key="repr" pequeno variante="perigo-sec" icone={mdiClose} onClick={()=>recusarCotacao(os)}>Recusado</Botao>
          );
        }
      }
      // Aguardando Aceite SAC → SAC confirma ou rejeita data definida pela Produção
      if (os.status === 'Aguardando Aceite SAC') {
        btns.push(
          <Botao key="aceite" pequeno variante="primario" icone={mdiClipboardCheckOutline}
            onClick={()=>setModalAceiteSAC(os)}>
            Aceite SAC
          </Botao>
        );
      }
      // Manutenção Concluída → SAC faz entrega ou renegocia itens
      if (os.status === 'Manutenção Concluída') {
        const itensRenegoc = Array.isArray(os.materiais_utilizados) && os.materiais_utilizados.length > 0
          ? os.materiais_utilizados.map((i:any) => ({...i}))
          : Array.isArray(os.itens_cotacao) && os.itens_cotacao.length > 0
            ? os.itens_cotacao.map((i:any) => ({...i}))
            : [{codigo:'',descricao:'',quantidade:1,valor_unitario:0}];
        btns.push(
          <Botao key="renegoc" pequeno icone={mdiPencilOutline}
            onClick={()=>{ setOrcProdItens(itensRenegoc); setOrcProdModo('editar'); setModalOrcProd(os); }}>
            Renegociar
          </Botao>
        );
        btns.push(
          <Botao key="entrega" pequeno variante="primario" icone={mdiTruckDeliveryOutline} onClick={()=>liberarEntregaVeicular(os)}>Entrega</Botao>
        );
      }
      // Aguardando CQ → sem ação do SAC, Qualidade que audita
      if (os.status === 'Aguardando CQ') {
        btns.push(<span key="cq" className="acn-fraco acn-sac-espera">Aguardando Qualidade</span>);
      }
      // Aguardando Envio Fiscal → SAC informa nº de série dos itens e envia ao Fiscal
      if (os.status === 'Aguardando Envio Fiscal') {
        btns.push(
          <Botao key="envfiscal" pequeno variante="primario" icone={mdiSendOutline}
            onClick={()=>{
              const itens = Array.isArray(os.materiais_utilizados) && os.materiais_utilizados.length > 0
                ? os.materiais_utilizados.map((i:any) => ({...i}))
                : [{codigo:'',descricao:'',quantidade:1,valor_unitario:0,numero_serie:''}];
              setFiscalItens(itens); setModalEnviarFiscal(os);
            }}>
            Enviar para Fiscal
          </Botao>
        );
      }
      // Aguardando Emissão NF → sem ação do SAC, Fiscal que emite
      if (os.status === 'Aguardando Emissão NF') {
        btns.push(<span key="nf" className="acn-fraco acn-sac-espera">Aguardando Fiscal</span>);
      }
      // Faturada - Aguardando Entrega → SAC entrega o veículo
      if (os.status === 'Faturada - Aguardando Entrega') {
        btns.push(
          <Botao key="entrega2" pequeno variante="primario" icone={mdiTruckDeliveryOutline} onClick={()=>liberarEntregaVeicular(os)}>Entrega</Botao>
        );
      }
      // Reprovado veicular → reavaliar
      if (os.status === 'Reprovado') {
        btns.push(
          <Botao key="reaval" pequeno icone={mdiRefresh}
            onClick={async ()=>{ if(await confirmar(`Reabrir ${os.numero_os}?`)) { const { error } = await supabase.from('sac_ordens_servico').update({status:os.tipo_avaliacao==='Remota'?'Em Cotação':'Em Provisionamento',aprovado:null,motivo_reprovacao:null,atualizado_em:new Date().toISOString()}).eq('id',os.id); if (error) { alert('Erro ao reabrir a OS: ' + error.message); return; } fetchOrdens(); } }}>
            Reavaliar
          </Botao>
        );
      }
    } else {
      // ── FLUXO LAB (padrão) ────────────────────────────────────────────────
      // Orçamento finalizado pelo Lab → SAC envia ao cliente
      if (os.status === 'Orçamento Pronto')
        btns.push(
          <Botao key="enviar" pequeno variante="primario" icone={mdiSendOutline}
            onClick={()=>{ setModalOrc(os); setOrcForm({ valor: os.valor_orcamento ? String(os.valor_orcamento) : '', condicoes: os.condicoes_pagamento || '' }); }}>
            Enviar
          </Botao>
        );

      // Cliente respondendo o orçamento enviado
      if (os.status === 'Orç. Enviado')
        btns.push(
          <Botao key="aprov" pequeno variante="primario" icone={mdiCheck} onClick={()=>{setModalAprov(os);setAprovForm({nome:'',sig:null,data_entrega:''});}}>Aprovar</Botao>,
          <Botao key="repr" pequeno variante="perigo-sec" icone={mdiClose} onClick={()=>{setModalRepr(os);setReprForm({motivo:'',data_retirada:'',nome_retirada:''});}}>Reprovar</Botao>
        );

      // Reprovado — reagendar / reavaliar
      if (os.status === 'Reprovado')
        btns.push(
          <Botao key="reaval" pequeno icone={mdiRefresh}
            onClick={async ()=>{ if(await confirmar(`Reabrir OS ${os.numero_os} para novo orçamento?`)) { const { error } = await supabase.from('sac_ordens_servico').update({status:'Diagnóstico',aprovado:null,motivo_reprovacao:null,atualizado_em:new Date().toISOString()}).eq('id',os.id); if (error) { alert('Erro ao reabrir a OS: ' + error.message); return; } fetchOrdens(); } }}>
            Reavaliar
          </Botao>
        );

      // Lab concluiu o reparo → SAC faz a entrega
      if (os.status === 'Concluído')
        btns.push(
          <Botao key="saida" pequeno variante="primario" icone={mdiTruckDeliveryOutline} onClick={()=>{setModalSaida(os);setSaidaForm({nome:'',sig:null});setFotosSaidaFiles([]);}}>Entrega</Botao>
        );
    }

    // Menu ⋯ com o que toda OS tem. Alterar responsável: disponível enquanto a OS não estiver encerrada
    btns.push(<MenuAcoes key="mais" rotulo="Mais ações da OS" itens={[
      { rotulo: 'Resp.', titulo: 'Alterar o responsável da OS', icone: mdiAccountEditOutline, oculto: ['Entregue','Cancelada'].includes(os.status),
        onClick: ()=>{ setEditRespOSNome(os.responsavel_nome||''); setModalEditRespOS(os); } },
      { rotulo: 'Financeiro', titulo: 'Valor total, mão de obra e data de faturamento', icone: mdiCurrencyUsd,
        onClick: ()=>{setFinanceiroForm({valor_total:os.valor_total??'',valor_mao_de_obra:os.valor_mao_de_obra??'',data_faturamento:(os.data_faturamento||'').slice(0,10)});setModalFinanceiro(os);} },
      { rotulo: 'Anexar', titulo: 'Anexar arquivos à OS', icone: mdiPaperclip, onClick: ()=>{setAnexarFiles([]);setModalAnexar(os);} },
      { rotulo: 'PDF', titulo: 'Gerar o PDF da OS', icone: mdiPrinterOutline, onClick: ()=>gerarPdfOS(os) },
    ]} />);
    return btns;
  };

  // ── ALTERAR RESPONSÁVEL DA OS ────────────────────────────────────────────
  const salvarRespOS = async () => {
    if (!modalEditRespOS) return;
    if (!editRespOSNome.trim()) { alert('Informe o responsável.'); return; }
    const { error } = await supabase.from('sac_ordens_servico')
      .update({ responsavel_nome: editRespOSNome.trim() })
      .eq('id', modalEditRespOS.id);
    if (error) { alert('Erro: ' + error.message); return; }
    logChange({ module: 'sac', entityType: 'sac_ordens_servico', entityId: modalEditRespOS.id, changeType: 'UPDATE',
      oldRow: { responsavel_nome: modalEditRespOS.responsavel_nome }, newRow: { responsavel_nome: editRespOSNome.trim() }, user: currentUser });
    setModalEditRespOS(null);
    fetchOrdens();
  };

  // ── SALVAR FINANCEIRO DA OS ───────────────────────────────────────────────
  const salvarFinanceiroOS = async () => {
    if (!modalFinanceiro) return;
    const payload: any = {
      valor_total: financeiroForm.valor_total ? parseFloat(String(financeiroForm.valor_total).replace(',','.')) : null,
      valor_mao_de_obra: financeiroForm.valor_mao_de_obra ? parseFloat(String(financeiroForm.valor_mao_de_obra).replace(',','.')) : null,
      data_faturamento: financeiroForm.data_faturamento || null,
    };
    const { error } = await supabase.from('sac_ordens_servico').update(payload).eq('id', modalFinanceiro.id);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    setModalFinanceiro(null);
    fetchOrdens();
  };

  // ── GERAR PDF DA OS ───────────────────────────────────────────────────────
  const gerarPdfOS = (os: any) => {
    const fmtDt  = fmtDataSAC;
    const fmtVal = (v: any) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
    const cor = (STATUS_COR as any)[os.status] || '#94a3b8';

    const equipLista: any[] = Array.isArray(os.equipamentos_lista) && os.equipamentos_lista.length > 0
      ? os.equipamentos_lista
      : [{ marca: os.marca||'', modelo: os.modelo||'', numero_serie: os.numero_serie||'', chassi: os.chassi||'', defeito: os.defeito_reclamado||'' }];

    const equipRows = equipLista.map((eq: any, idx: number) => `
      <tr style="background:${idx%2===0?'#f8fafc':'white'}">
        <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #e2e8f0">${equipLista.length>1?`#${idx+1} — `:''}<strong>${os.equipamento_nome||'—'}</strong></td>
        <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #e2e8f0">${eq.marca||'—'}</td>
        <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #e2e8f0">${eq.modelo||'—'}</td>
        <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #e2e8f0">${os.is_manutencao_veicular ? (eq.chassi||'—') : (eq.numero_serie||'—')}</td>
        <td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #e2e8f0">${eq.defeito||'—'}</td>
      </tr>`).join('');

    const acessoriosHtml = Array.isArray(os.acessorios) && os.acessorios.length > 0
      ? `<div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
          <div style="background:#f8fafc;padding:6px 10px;font-weight:700;font-size:11px;color:#0f766e;border-bottom:1px solid #e2e8f0">ACESSÓRIOS</div>
          <div style="padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px">
            ${os.acessorios.map((a: any)=>`<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${a.presente?'#dcfce7':'#fee2e2'};color:${a.presente?'#166534':'#991b1b'};border:1px solid ${a.presente?'#86efac':'#fca5a5'}">${a.presente?'✓':'✗'} ${a.descricao}</span>`).join('')}
          </div>
        </div>` : '';

    const orcamentoHtml = os.valor_orcamento ? `
      <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
        <div style="background:#f8fafc;padding:6px 10px;font-weight:700;font-size:11px;color:#0f766e;border-bottom:1px solid #e2e8f0">ORÇAMENTO</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="font-weight:600;color:#64748b;width:160px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Valor</td><td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${fmtVal(os.valor_orcamento)}</td></tr>
          <tr><td style="font-weight:600;color:#64748b;width:160px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Condições</td><td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.condicoes_pagamento||'—'}</td></tr>
          <tr><td style="font-weight:600;color:#64748b;width:160px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Enviado em</td><td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${fmtDt(os.data_envio_orcamento)}</td></tr>
          <tr><td style="font-weight:600;color:#64748b;width:160px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">KPI Elaboração</td><td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.kpi_orcamento_horas?`${Number(os.kpi_orcamento_horas).toFixed(1)}h úteis`:'—'}</td></tr>
          <tr><td style="font-weight:600;color:#64748b;width:160px;padding:4px 8px;font-size:11px">Situação</td><td style="padding:4px 8px;font-size:11px">${os.aprovado===true?'✅ APROVADO':os.aprovado===false?'❌ REPROVADO':'Aguardando'}</td></tr>
        </table>
      </div>` : '';

    const aprovacaoHtml = os.aprovado ? `
      <div style="margin-bottom:12px;border:1px solid #86efac;border-radius:4px;overflow:hidden">
        <div style="background:#f0fdf4;padding:6px 10px;font-weight:700;font-size:11px;color:#166534;border-bottom:1px solid #86efac">APROVAÇÃO</div>
        <div style="padding:10px;display:flex;align-items:center;gap:16px">
          <div style="flex:1;font-size:11px">
            <div><strong>Aprovado por:</strong> ${os.aprovador_nome||'—'}</div>
            <div><strong>Data:</strong> ${fmtDt(os.data_aprovacao)}</div>
            ${os.data_prevista_pos_aprovacao?`<div><strong>Entrega prevista:</strong> ${fmtDt(os.data_prevista_pos_aprovacao)}</div>`:''}
            ${os.kpi_execucao_horas?`<div><strong>KPI Execução:</strong> ${Number(os.kpi_execucao_horas).toFixed(1)}h úteis</div>`:''}
          </div>
          ${os.assinatura_aprovacao_url?`<img src="${os.assinatura_aprovacao_url}" style="height:60px;border:1px solid #e2e8f0;border-radius:4px;background:white" />`:''}
        </div>
      </div>` : '';

    const retiradaHtml = os.data_saida ? `
      <div style="margin-bottom:12px;border:1px solid #86efac;border-radius:4px;overflow:hidden">
        <div style="background:#f0fdf4;padding:6px 10px;font-weight:700;font-size:11px;color:#166534;border-bottom:1px solid #86efac">RETIRADA</div>
        <div style="padding:10px;display:flex;align-items:center;gap:16px">
          <div style="flex:1;font-size:11px">
            <div><strong>Retirado por:</strong> ${os.nome_retirada_saida||'—'}</div>
            <div><strong>Data:</strong> ${fmtDt(os.data_saida)}</div>
          </div>
          ${os.assinatura_saida_url?`<img src="${os.assinatura_saida_url}" style="height:60px;border:1px solid #e2e8f0;border-radius:4px;background:white" />`:''}
        </div>
      </div>` : '';

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>OS ${os.numero_os}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;color:#1e293b;background:white;padding:20px}
        @page{size:A4;margin:15mm}
        @media print{body{padding:0}}
      </style>
    </head><body>

      <!-- Cabeçalho -->
      <div style="background:#0f766e;color:white;padding:14px 16px;border-radius:4px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700;font-size:18px">${os.empresa === 'DETECH' ? 'DETECH' : 'ACN SINAL VERDE'}</div>
          <div style="font-size:11px;opacity:.85">Ordem de Serviço</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:20px">${os.numero_os}</div>
          <div style="font-size:10px">Abertura: ${fmtDt(os.data_abertura)}</div>
        </div>
      </div>

      <!-- Status -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <span style="background:${cor};color:white;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">${os.status}</span>
        <span style="background:#e2e8f0;padding:3px 12px;border-radius:20px;font-size:11px">${os.tipo_servico}</span>
        ${os.tipo_projeto?`<span style="background:#e2e8f0;padding:3px 12px;border-radius:20px;font-size:11px">${os.tipo_projeto}</span>`:''}
      </div>

      <!-- Cliente -->
      <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
        <div style="background:#f8fafc;padding:6px 10px;font-weight:700;font-size:11px;color:#0f766e;border-bottom:1px solid #e2e8f0">CLIENTE</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="font-weight:600;color:#64748b;width:130px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Nome</td>
            <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.cliente_nome||'—'}</td>
            <td style="font-weight:600;color:#64748b;width:130px;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Empresa / Órgão</td>
            <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.empresa_orgao||'—'}</td>
          </tr>
          <tr>
            <td style="font-weight:600;color:#64748b;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">CPF/CNPJ</td>
            <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.cpf_cnpj||'—'}</td>
            <td style="font-weight:600;color:#64748b;padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">Telefone</td>
            <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">${os.telefone||'—'}</td>
          </tr>
          <tr>
            <td style="font-weight:600;color:#64748b;padding:4px 8px;font-size:11px">E-mail</td>
            <td style="padding:4px 8px;font-size:11px">${os.email||'—'}</td>
            <td style="font-weight:600;color:#64748b;padding:4px 8px;font-size:11px">Endereço</td>
            <td style="padding:4px 8px;font-size:11px">${os.endereco||'—'}</td>
          </tr>
        </table>
      </div>

      <!-- Equipamentos -->
      <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
        <div style="background:#f8fafc;padding:6px 10px;font-weight:700;font-size:11px;color:#0f766e;border-bottom:1px solid #e2e8f0">EQUIPAMENTO(S) — Qtd: ${os.quantidade||1}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #e2e8f0">Tipo</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #e2e8f0">Marca</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #e2e8f0">Modelo</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #e2e8f0">${os.is_manutencao_veicular ? 'Chassi' : 'Nº Série'}</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;border-bottom:1px solid #e2e8f0">Defeito Reclamado</th>
            </tr>
          </thead>
          <tbody>${equipRows}</tbody>
        </table>
      </div>

      <!-- Observações -->
      ${os.observacoes||os.observacoes_lab ? `
      <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
        <div style="background:#f8fafc;padding:6px 10px;font-weight:700;font-size:11px;color:#0f766e;border-bottom:1px solid #e2e8f0">OBSERVAÇÕES</div>
        <div style="padding:8px 10px;font-size:11px">
          ${os.observacoes?`<div>${os.observacoes}</div>`:''}
          ${os.observacoes_lab?`<div style="margin-top:6px;color:#0891b2"><strong>Diagnóstico Lab:</strong> ${os.observacoes_lab}</div>`:''}
        </div>
      </div>` : ''}

      ${acessoriosHtml}
      ${orcamentoHtml}
      ${aprovacaoHtml}
      ${retiradaHtml}

      <!-- Rodapé -->
      <div style="border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px;font-size:10px;color:#94a3b8;text-align:center">
        ACN Sinal Verde — Documento gerado em ${new Date().toLocaleString('pt-BR')}
      </div>

      <script>window.onload=function(){window.print()}</script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups neste site para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
  };

  // ── CADASTROS: salvar equipamento ─────────────────────────────────────────
  const salvarEquipamentoCad = async () => {
    if (!novoEquipCad.trim()) return;
    const { error } = await supabase.from('sac_equipamentos').insert([{ nome: novoEquipCad.trim() }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setNovoEquipCad('');
    fetchEquipamentos();
  };

  const toggleEquipamento = async (e) => {
    const { error } = await supabase.from('sac_equipamentos').update({ ativo: !e.ativo }).eq('id', e.id);
    if (error) { alert('Erro: ' + error.message); return; }
    fetchEquipamentos();
  };

  const salvarCategoria = async () => {
    if (!novaCat.nome.trim()) return;
    const { error } = await supabase.from('sac_categorias').insert([{ nome: novaCat.nome.trim(), tem_despesas: novaCat.tem_despesas }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setNovaCat({ nome:'', tem_despesas:false });
    fetchCategorias();
  };

  const salvarEdicaoCategoria = async () => {
    if (!editCat?.nome?.trim()) return;
    const { error } = await supabase.from('sac_categorias').update({ nome: editCat.nome.trim(), tem_despesas: editCat.tem_despesas }).eq('id', editCat.id);
    if (error) { alert('Erro: ' + error.message); return; }
    setEditCat(null);
    fetchCategorias();
  };

  const toggleCategoria = async (c) => {
    const { error } = await supabase.from('sac_categorias').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) { alert('Erro: ' + error.message); return; }
    fetchCategorias();
  };

  // ── Chamados NFC ──────────────────────────────────────────────────────────
  // R25 (01/10/2026, resposta do usuário): escolher o status no filtro JÁ recarrega a lista (antes só valia ao clicar em "Carregar") e o "N aberto(s)" do
  // cabeçalho é o total real de chamados abertos — antes contava só os carregados e, filtrando "Concluído", dizia "0 aberto(s)". O parâmetro tem padrão para
  // quem chama sem argumento (abrir a aba, depois de gravar); o botão "Carregar" chama sem argumento de propósito (o clique não pode virar o filtro).
  const carregarChamadosNfc = async (statusFiltro: string = nfcStatus) => {
    setLoadNfc(true);
    let q = supabase.from('chamados_suporte').select('*').order('created_at', { ascending: false });
    if (statusFiltro) q = q.eq('status', statusFiltro);
    const [{ data }, { data: abertos }] = await Promise.all([q, supabase.from('chamados_suporte').select('id').eq('status', 'Aberto')]);
    setChamadosNfc(data || []);
    setNfcAbertos((abertos || []).length);
    setLoadNfc(false);
  };

  const atualizarStatusNfc = async (id, novoStatus, notas?) => {
    const payload: any = { status: novoStatus, atualizado_em: new Date().toISOString() };
    // Regra definida com o usuário em 01/10/2026 (R24): consta como atendente SÓ quem clicou em Atender ou Concluir. Salvar apenas as notas
    // (notas !== undefined) não troca o atendente — antes, quem editava as notas de um chamado já atendido passava a constar como o atendente.
    if (notas === undefined && (novoStatus === 'Em Atendimento' || novoStatus === 'Concluído')) {
      payload.atendido_por = currentUser?.nome || currentUser?.email || 'Sistema';
    }
    if (notas !== undefined) payload.notas_atendimento = notas;
    // Etapa 7.18 (01/10/2026): antes o resultado da gravação era ignorado — "Salvar Notas" dizia "Notas salvas!" mesmo com a gravação recusada, e
    // "Atender" / "Concluir" falhavam em silêncio (a pessoa achava que tinha gravado). Agora o erro aparece e a função devolve se gravou.
    const { error } = await supabase.from('chamados_suporte').update(payload).eq('id', id);
    if (error) { alert('Erro ao gravar o chamado: ' + error.message); return false; }
    carregarChamadosNfc();
    if (modalNfc?.id === id) setModalNfc(prev => ({ ...prev, status: novoStatus, ...payload }));
    return true;
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* AGENDA */}
      <div style={{ padding:'12px 12px 0' }}>
        <AgendaWidget setor="sac" currentUser={currentUser} />
      </div>
      {/* ── SELETOR DE ABA ── */}
      {/* Etapa 12d1 (01/10/2026): só aparência — as abas viram as do sistema; quem carrega os chamados continua sendo o clique em "Chamados NFC" */}
      <Abas className="acn-sac-abas" ativa={abaAtiva} onChange={id => { setAbaAtiva(id as any); if (id === 'chamados_nfc') carregarChamadosNfc(); }} itens={[
        { id:'os',           rotulo:'Ordens de Serviço', icone:mdiClipboardTextOutline },
        { id:'chamados_nfc', rotulo:'Chamados NFC',      icone:mdiCellphoneNfc },
        { id:'cadastros',    rotulo:'Cadastros',         icone:mdiCogOutline },
      ]} />

      {/* ── ABA CHAMADOS NFC ── */}
      {abaAtiva === 'chamados_nfc' && (
        <div className="sec-card">
          {/* Header + filtro (não é .sec-hdr de propósito: o clique global do cabeçalho recolheria o quadro, e este nunca recolheu) */}
          <div className="acn-nfc-cab">
            <div>
              <div className="acn-quadro-titulo">Módulo NFC</div>
              <div className="acn-cab-titulo acn-forte"><Icone path={mdiCellphoneNfc} size={16} /> Chamados de Suporte (NFC)</div>
              <div className="acn-ajuda">
                {chamadosNfc.length} chamado(s) · {nfcAbertos} aberto(s)
              </div>
            </div>
            <div className="acn-cab-filtros">
              <select className="acn-input acn-select-mini" aria-label="Status do chamado" value={nfcStatus} onChange={e=>{setNfcStatus(e.target.value); carregarChamadosNfc(e.target.value);}}>
                <option value="">Todos os status</option>
                <option value="Aberto">Aberto</option>
                <option value="Em Atendimento">Em Atendimento</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
              <Botao pequeno icone={mdiRefresh} onClick={()=>carregarChamadosNfc()}>Carregar</Botao>
            </div>
          </div>

          {/* Lista */}
          <div className="sec-body">
            {loadNfc ? (
              <div className="acn-empty">Carregando...</div>
            ) : chamadosNfc.length === 0 ? (
              <div className="acn-empty">
                Nenhum chamado encontrado. Clique em "Carregar" para atualizar.
              </div>
            ) : (
              <div className="acn-nfc-lista">
                {chamadosNfc.map(c => {
                  // a cor da lateral e do selo vem da família do status: Concluído verde, Em Atendimento âmbar, Cancelado cinza, o resto (Aberto) vermelho
                  const familia = c.status==='Concluído' ? 'ok' : c.status==='Em Atendimento' ? 'atencao' : c.status==='Cancelado' ? 'neutro' : 'erro';
                  return (
                    <div key={c.id} className="acn-nfc-card" data-acn-familia={familia}>
                      <div className="acn-nfc-info">
                        <div className="acn-nfc-linha1">
                          <span className="acn-forte">
                            {c.nome_solicitante || 'Anônimo'}
                          </span>
                          {c.contato_telefone && (
                            <a className="acn-nfc-tel" href={`tel:${c.contato_telefone}`}>
                              <Icone path={mdiPhoneOutline} size={13} /> {c.contato_telefone}
                            </a>
                          )}
                          <Selo familia={familia}>{c.status}</Selo>
                        </div>
                        <div>
                          <strong>{c.chassi}</strong>
                          {c.placa && ` · ${c.placa}`}
                          {c.modelo && <span className="acn-fraco"> · {c.modelo}</span>}
                        </div>
                        {c.orgao_cliente && (
                          <div className="acn-nfc-orgao">
                            <Icone path={mdiDomain} size={13} /> {c.orgao_cliente}
                          </div>
                        )}
                        {c.descricao_defeito && (
                          <div className="acn-nfc-desc">
                            {c.descricao_defeito.slice(0,180)}{c.descricao_defeito.length>180?'...':''}
                          </div>
                        )}
                        <div className="acn-fraco acn-nfc-data">
                          Aberto: {new Date(c.created_at).toLocaleString('pt-BR')}
                          {c.atendido_por && ` · Atendente: ${c.atendido_por}`}
                        </div>
                      </div>
                      <div className="acn-nfc-acoes">
                        {c.status === 'Aberto' && (
                          <Botao pequeno variante="primario" icone={mdiPlay} onClick={()=>atualizarStatusNfc(c.id,'Em Atendimento')}>Atender</Botao>
                        )}
                        {c.status === 'Em Atendimento' && (
                          <Botao pequeno variante="primario" icone={mdiCheck} onClick={()=>atualizarStatusNfc(c.id,'Concluído')}>Concluir</Botao>
                        )}
                        <Botao pequeno icone={mdiNoteEditOutline} onClick={()=>setModalNfc(c)}>Notas</Botao>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal de notas */}
          {modalNfc && (
            <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalNfc(null)}}>
              <div className="modal-box acn-modal-cadastro menor">
                <div className="acn-modal-cab">
                  <span className="modal-title"><Icone path={mdiPhoneOutline} size={16} /> Chamado NFC — {modalNfc.chassi}</span>
                  <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={()=>setModalNfc(null)} />
                </div>
                <div className="acn-modal-corpo acn-form-cheio">
                  <div>
                    <strong>{modalNfc.nome_solicitante}</strong>
                    {modalNfc.contato_telefone && ` · ${modalNfc.contato_telefone}`}
                    {modalNfc.orgao_cliente && ` · ${modalNfc.orgao_cliente}`}
                  </div>
                  {modalNfc.descricao_defeito && (
                    <div className="acn-nfc-desc">
                      {modalNfc.descricao_defeito}
                    </div>
                  )}
                  <div>
                    <label className="acn-label" htmlFor="nfc-notas-input">
                      Notas de Atendimento
                    </label>
                    <textarea className="acn-input" defaultValue={modalNfc.notas_atendimento||''}
                      id="nfc-notas-input" rows={4}
                      placeholder="Registre aqui as ações tomadas..." />
                  </div>
                </div>
                <div className="acn-modal-rodape">
                  <Botao onClick={()=>setModalNfc(null)}>Fechar</Botao>
                  <Botao variante="primario" icone={mdiContentSaveOutline} onClick={async()=>{
                    const notas=(document.getElementById('nfc-notas-input') as HTMLTextAreaElement)?.value||'';
                    if (await atualizarStatusNfc(modalNfc.id, modalNfc.status, notas)) alert('Notas salvas!');
                  }}>
                    Salvar Notas
                  </Botao>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA CADASTROS ── */}
      {/* Etapa 12d2 (01/10/2026): só aparência — as sub-abas viram o seletor em pílulas, os campos e botões usam os do sistema e as tabelas a do guia. As
          gravações, as validações (nome vazio, Enter) e os textos são os de antes. Os cartões continuam .sec-card/.sec-hdr: o clique global do cabeçalho
          que recolhe o cartão já valia aqui. */}
      {abaAtiva === 'cadastros' && (
        <div>
          {/* Sub-abas */}
          <div className="acn-cad-sub">
            <Chips ativo={abaCad} onChange={id=>setAbaCad(id as any)} rotulo="Cadastro" itens={[
              { id:'equipamentos',  rotulo:'Equipamentos' },
              { id:'categorias',    rotulo:'Categorias (Tipo Projeto)' },
              { id:'tipos_servico', rotulo:'Tipos de Serviço' },
            ]} />
          </div>

          {/* ── Equipamentos ── */}
          {abaCad === 'equipamentos' && (
            <div className="sec-card">
              <div className="sec-hdr"><span className="acn-cab-titulo"><Icone path={mdiRadioHandheld} size={16} /> Tipos de Equipamento</span></div>
              <div className="sec-body acn-cad-barra">
                <input className="acn-input acn-cad-campo" placeholder="Nome do equipamento..."
                  value={novoEquipCad} onChange={e=>setNovoEquipCad(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&salvarEquipamentoCad()} />
                <Botao variante="primario" icone={mdiPlus} onClick={salvarEquipamentoCad}>Adicionar</Botao>
              </div>
              <div className="sec-body acn-rolagem acn-sem-recuo">
                <table className="acn-tabela">
                  <thead><tr><th>Nome</th><th>Status</th><th>Ação</th></tr></thead>
                  <tbody>
                    {equipamentosTodos.length === 0 && <tr><td colSpan={3}><div className="acn-empty">Nenhum equipamento cadastrado.</div></td></tr>}
                    {equipamentosTodos.map((e: any) => (
                      <tr key={e.id} className={e.ativo ? '' : 'acn-linha-inativa'}>
                        <td className="acn-forte">{e.nome}</td>
                        <td><Selo familia={e.ativo ? 'ok' : 'neutro'} ponto={false}>{e.ativo?'Ativo':'Inativo'}</Selo></td>
                        <td>
                          <Botao pequeno variante={e.ativo ? 'perigo-sec' : 'secundario'} onClick={()=>toggleEquipamento(e)}>{e.ativo?'Desativar':'Ativar'}</Botao>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Categorias ── */}
          {abaCad === 'categorias' && (
            <div className="sec-card">
              <div className="sec-hdr"><span className="acn-cab-titulo"><Icone path={mdiShapeOutline} size={16} /> Categorias (Tipos de Projeto)</span></div>
              <div className="sec-body acn-cad-barra">
                <div>
                  <label className="acn-label">Nome da Categoria</label>
                  <input className="acn-input acn-cad-campo-fixo" placeholder="Ex: Serviço de Emergência..."
                    value={novaCat.nome} onChange={e=>setNovaCat(f=>({...f,nome:e.target.value}))} />
                </div>
                <label className="acn-cad-check">
                  <input type="checkbox" checked={novaCat.tem_despesas}
                    onChange={e=>setNovaCat(f=>({...f,tem_despesas:e.target.checked}))} />
                  <span>Exibe despesas de campo (Serviço Externo)</span>
                </label>
                <Botao variante="primario" icone={mdiPlus} onClick={salvarCategoria}>Adicionar</Botao>
              </div>
              <div className="sec-body acn-rolagem acn-sem-recuo">
                <table className="acn-tabela">
                  <thead><tr><th>Nome</th><th>Despesas de Campo</th><th>Status</th><th>Ações</th></tr></thead>
                  <tbody>
                    {categorias.length === 0 && <tr><td colSpan={4}><div className="acn-empty">Nenhuma categoria.</div></td></tr>}
                    {categorias.map((c: any) => (
                      <tr key={c.id} className={c.ativo || editCat?.id === c.id ? '' : 'acn-linha-inativa'}>
                        <td className={editCat?.id === c.id ? '' : 'acn-forte'}>
                          {editCat?.id === c.id ? (
                            <input className="acn-input" value={editCat.nome} onChange={e=>setEditCat(f=>({...f,nome:e.target.value}))} />
                          ) : c.nome}
                        </td>
                        <td>
                          {editCat?.id === c.id ? (
                            <label className="acn-cad-check">
                              <input type="checkbox" checked={editCat.tem_despesas} onChange={e=>setEditCat(f=>({...f,tem_despesas:e.target.checked}))} />
                              Sim
                            </label>
                          ) : (
                            c.tem_despesas
                              ? <Selo familia="atencao" ponto={false}><Icone path={mdiCarOutline} size={13} />SIM</Selo>
                              : <span className="acn-fraco">—</span>
                          )}
                        </td>
                        <td><Selo familia={c.ativo ? 'ok' : 'neutro'} ponto={false}>{c.ativo?'Ativa':'Inativa'}</Selo></td>
                        <td>
                          <div className="acn-acoes-linha">
                            {editCat?.id === c.id ? (
                              <>
                                <Botao pequeno variante="primario" onClick={salvarEdicaoCategoria}>Salvar</Botao>
                                <Botao pequeno onClick={()=>setEditCat(null)}>Cancel</Botao>
                              </>
                            ) : (
                              <Botao pequeno icone={mdiPencilOutline} onClick={()=>setEditCat({...c})}>Editar</Botao>
                            )}
                            <Botao pequeno variante={c.ativo ? 'perigo-sec' : 'secundario'} onClick={()=>toggleCategoria(c)}>{c.ativo?'Desativar':'Ativar'}</Botao>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tipos de Serviço ── */}
          {abaCad === 'tipos_servico' && (
            <div className="sec-card">
              <div className="sec-hdr"><span className="acn-cab-titulo"><Icone path={mdiClipboardListOutline} size={16} /> Tipos de Serviço</span></div>
              <div className="sec-body acn-cad-barra">
                <input className="acn-input acn-cad-campo" placeholder="Nome do tipo de serviço..."
                  value={novoTipoServico} onChange={e=>setNovoTipoServico(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&salvarTipoServico()} />
                <Botao variante="primario" icone={mdiPlus} onClick={salvarTipoServico}>Adicionar</Botao>
              </div>
              <div className="sec-body acn-rolagem acn-sem-recuo">
                <table className="acn-tabela">
                  <thead><tr><th>Nome</th><th>Status</th><th>Ação</th></tr></thead>
                  <tbody>
                    {tiposServico.length === 0 && <tr><td colSpan={3}><div className="acn-empty">Nenhum tipo cadastrado. Rode o SQL sac_tipos_servico.sql no Supabase.</div></td></tr>}
                    {tiposServico.map((t: any) => (
                      <tr key={t.id} className={t.ativo ? '' : 'acn-linha-inativa'}>
                        <td className="acn-forte">{t.nome}</td>
                        <td><Selo familia={t.ativo ? 'ok' : 'neutro'} ponto={false}>{t.ativo?'Ativo':'Inativo'}</Selo></td>
                        <td>
                          <Botao pequeno variante={t.ativo ? 'perigo-sec' : 'secundario'} onClick={()=>toggleTipoServico(t)}>{t.ativo?'Desativar':'Ativar'}</Botao>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA OS (condicional) ── */}
      {abaAtiva === 'os' && <div>

      {/* ── HEADER ── */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiClipboardTextOutline} size={16} /> SAC — Ordens de Serviço ({ordensFiltradas.length})</span>
          <Botao variante="primario" icone={mdiPlus} // Etapa 7.24 (01/10/2026): só as fotos eram zeradas ao abrir; o documento escolhido numa abertura CANCELADA ficava na memória (o contador mostrava "1 arquivo(s)" com o campo vazio) e ia junto da OS seguinte
            onClick={()=>{setForm({...FORM_VAZIO});setFotosEntradaFiles([]);setArquivosEntradaFiles([]);setAcessInput('');setEquipLista([{...EQUIP_VAZIO}]);setModalNova(true);}}>
            Nova OS
          </Botao>
        </div>

        {/* Legenda de fluxo */}
        <div className="sec-body acn-sac-legenda">
          <span className="acn-fraco">Fluxo:</span>
          {['Diagnóstico','Orçamento Pronto','Orç. Enviado','Aprovado','Em Execução','Concluído','Entregue'].map((s,i,arr) => (
            <React.Fragment key={s}>
              <Selo familia={FAMILIA_STATUS_SAC[s] || 'neutro'}>{s}</Selo>
              {i < arr.length-1 && <Icone path={mdiArrowRight} size={14} className="acn-fraco" />}
            </React.Fragment>
          ))}
          <span className="acn-fraco acn-sac-legenda-nota">(Lab executa diagnóstico e reparo)</span>
        </div>

        {/* Filtros */}
        <div className="sec-body acn-sac-filtros">
          <input className="acn-input acn-sac-busca" aria-label="Buscar OS" placeholder="Buscar OS / cliente / equip."
            value={busca} onChange={e=>setBusca(e.target.value)} />
          <select className="acn-input" aria-label="Status da OS" value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.keys(STATUS_COR).map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="acn-input" aria-label="Tipo de serviço" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {['Orçamento','Conserto','Troca','Garantia'].map(t=><option key={t}>{t}</option>)}
          </select>
          <select className="acn-input" aria-label="Presencial ou remota" value={filtroAvaliacao} onChange={e=>setFiltroAvaliacao(e.target.value)}>
            <option value="">Presencial / Remota</option>
            <option value="Veicular">Veiculares</option>
            <option value="Presencial">Presencial</option>
            <option value="Remota">Remota</option>
          </select>
          <select className="acn-input" aria-label="Empresa da OS" value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}>
            <option value="">Todas as empresas</option>
            {EMPRESAS_OS.map(e=><option key={e} value={e}>{e}</option>)}
            <option value="sem">Sem empresa</option>
          </select>
          <Botao pequeno onClick={()=>{setFiltroStatus('');setFiltroTipo('');setFiltroAvaliacao('');setFiltroEmpresa('');setBusca('');}}>Limpar</Botao>
        </div>

        {/* ── TABELA ── */}
        <div className="sec-body acn-rolagem acn-sem-recuo">
          {loading ? <div className="acn-empty">Carregando...</div> : ordensFiltradas.length === 0 ? (
            <div className="acn-empty">Nenhuma OS encontrada.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Nº OS</th><th>Tipo</th><th>Atend.</th><th>Equipamento</th><th>Cliente</th>
                <th>Abertura</th><th>Prazo Orç.</th><th className="acn-dir">Valor</th>
                <th>KPI Orç.</th><th>KPI Exec.</th><th>Status</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {ordensFiltradas.map(o => {
                  // horas cobradas na cotação × horas reais da execução (só OS remota): ▲ cobrou mais do que levou, ▼ cobrou menos
                  const difHoras = o.tipo_avaliacao==='Remota' && o.horas_cobradas_cotacao!=null && o.kpi_execucao_horas!=null && Math.abs(Number(o.horas_cobradas_cotacao)-Number(o.kpi_execucao_horas))>0.01;
                  const cobrouMais = Number(o.horas_cobradas_cotacao)>Number(o.kpi_execucao_horas);
                  return (
                  <tr key={o.id} className={ordensNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : o.status==='Reprovado' ? 'acn-linha-alerta' : ''}>
                    <td>
                      <div className="acn-duas acn-sac-id">
                        <strong className="acn-forte">{o.numero_os}</strong>
                        <EtiquetaEmpresaOS os={o} onTrocar={trocarEmpresaOS} />
                      </div>
                    </td>
                    <td className="acn-texto-curto">{o.tipo_servico}</td>
                    <td>{o.tipo_avaliacao==='Remota' ? <Selo familia="neutro" ponto={false}><Icone path={mdiAccessPoint} size={13} /> Remota</Selo> : o.tipo_avaliacao==='Presencial' ? <Selo familia="neutro" ponto={false}><Icone path={mdiMapMarkerOutline} size={13} /> Presencial</Selo> : <span className="acn-fraco">—</span>}</td>
                    <td className="acn-texto-longo acn-sac-equip">
                      <div className="acn-duas">
                        <span>{o.equipamento_nome}</span>
                        <small>{o.modelo ? o.modelo : <span className="acn-txt-erro acn-sac-icone-texto"><Icone path={mdiAlertOutline} size={12} /> sem modelo</span>}</small>
                        {o.is_manutencao_veicular ? (
                          <small>{o.chassi ? <span className="acn-sac-icone-texto"><Icone path={mdiWrenchOutline} size={12} /> {o.chassi}</span> : <span className="acn-txt-erro acn-sac-icone-texto"><Icone path={mdiAlertOutline} size={12} /> sem chassi</span>}</small>
                        ) : (
                          <small>{o.numero_serie ? `SN ${o.numero_serie}` : <span className="acn-txt-erro acn-sac-icone-texto"><Icone path={mdiAlertOutline} size={12} /> sem série</span>}</small>
                        )}
                      </div>
                    </td>
                    <td className="acn-texto-longo">{o.cliente_nome}</td>
                    <td className="acn-num">{fmtDt(o.data_abertura)}</td>
                    <td className="acn-num">
                      {/* a classe de cor vai no span: a regra das células da tabela vence a classe quando ela está no <td> */}
                      <span className={o.prazo_orcamento && String(o.prazo_orcamento).slice(0,10) < hojeISO() && ['Diagnóstico','Aberta'].includes(o.status) ? 'acn-txt-erro' : ''}>{fmtDt(o.prazo_orcamento)}</span>
                    </td>
                    <td className="acn-num acn-dir acn-sac-valor">{(() => {
                      const v = Number(o.valor_orcamento) || 0;
                      const itensTotal = Array.isArray(o.itens_cotacao) && o.itens_cotacao.length
                        ? o.itens_cotacao.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0)
                        : 0;
                      const total = v > 0 ? v : (itensTotal > 0 ? itensTotal : null);
                      return fmtVal(total);
                    })()}</td>
                    <td className="acn-num">
                      <span className={o.kpi_orcamento_horas ? 'acn-txt-info' : 'acn-fraco'}>{o.kpi_orcamento_horas ? `${Number(o.kpi_orcamento_horas).toFixed(1)}h` : '—'}</span>
                    </td>
                    <td className="acn-num">
                      <span className={o.kpi_execucao_horas ? 'acn-forte' : 'acn-fraco'}>{o.kpi_execucao_horas ? `${Number(o.kpi_execucao_horas).toFixed(1)}h` : '—'}</span>
                      {difHoras && (
                        <span className={'acn-sac-horas ' + (cobrouMais ? 'acn-txt-ok' : 'acn-txt-erro')}
                          title={`Cobrado: ${Number(o.horas_cobradas_cotacao).toFixed(1)}h | Real: ${Number(o.kpi_execucao_horas).toFixed(1)}h`}>
                          <Icone path={mdiTimerOutline} size={12} /><Icone path={cobrouMais ? mdiMenuUp : mdiMenuDown} size={16} />
                        </span>
                      )}
                    </td>
                    <td>
                      <Selo familia={FAMILIA_STATUS_SAC[o.status] || 'neutro'}>{o.status}</Selo>
                      {o.revisao_pendente && (
                        <div><span className="acn-txt-erro acn-sac-icone-texto acn-sac-revisao"><Icone path={mdiAlertOutline} size={12} /> Revisão pendente</span></div>
                      )}
                    </td>
                    <td><div className="acn-acoes-linha quebra">{renderAcoes(o)}</div></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ════════ MODAL NOVA OS ════════ */}
      {modalNova && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:700,width:'95vw',maxHeight:'92vh',overflowY:'auto',padding:0}}>

            {/* Header */}
            <div style={{background:'#0f766e',padding:'14px 20px',borderRadius:'8px 8px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'white',letterSpacing:.3}}>📋 Nova Ordem de Serviço</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,.7)',marginTop:2}}>Preencha os dados para abertura da OS</div>
              </div>
              <button style={{background:'rgba(255,255,255,.15)',border:'none',color:'white',borderRadius:4,cursor:'pointer',padding:'4px 10px',fontSize:12}} onClick={()=>setModalNova(false)}>✕</button>
            </div>

            <div style={{padding:'16px 20px 20px'}}>

            {/* CLASSIFICAÇÃO */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Classificação</div>

              {/* Toggle: OS de Veículo */}
              <div style={{marginBottom:10}}>
                <label style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer',
                  padding:'8px 14px',border:`2px solid ${form.is_veiculo?'#dc2626':'#e2e8f0'}`,
                  borderRadius:6,background:form.is_veiculo?'#fff5f5':'#f8fafc',userSelect:'none',
                  transition:'all .15s'}}>
                  <input type="checkbox" checked={form.is_veiculo}
                    onChange={e=>setForm(f=>({...f,is_veiculo:e.target.checked}))}
                    style={{accentColor:'#dc2626',width:14,height:14}} />
                  <span style={{fontWeight:700,fontSize:11,color:form.is_veiculo?'#dc2626':'#64748b'}}>
                    🚗 OS de Veículo / Manutenção Veicular
                  </span>
                  <span style={{fontSize:9,color:'#94a3b8'}}>
                    {form.is_veiculo
                      ? '→ Fluxo de manutenção veicular habilitado'
                      : '(marque se for manutenção de veículo)'}
                  </span>
                </label>
              </div>

              <div className="form-group" style={{marginBottom:8}}>
                <label className="acn-label">Empresa *</label>
                <div style={{display:'flex',gap:6}}>
                  {EMPRESAS_OS.map(emp => (
                    <button key={emp} type="button" onClick={()=>setForm(f=>({...f,empresa:emp}))}
                      style={{padding:'5px 18px',borderRadius:6,fontSize:11,fontWeight:800,cursor:'pointer',
                        border:`2px solid ${COR_EMPRESA[emp].bg}`,
                        background: form.empresa===emp ? COR_EMPRESA[emp].bg : '#fff',
                        color: form.empresa===emp ? COR_EMPRESA[emp].fg : COR_EMPRESA[emp].bg}}>
                      {emp}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="acn-label">Tipo de Serviço *</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.tipo_servico} onChange={e=>setForm(f=>({...f,tipo_servico:e.target.value}))}>
                    {tiposServico.filter(t=>t.ativo).map(t=>(
                      <option key={t.id} value={t.nome}>{t.nome}</option>
                    ))}
                    {tiposServico.length === 0 && (
                      <><option>Orçamento</option><option>Conserto</option><option>Troca</option><option>Garantia</option></>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label className="acn-label">Categoria (Tipo Projeto)</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.tipo_projeto}
                    onChange={e=>setForm(f=>({...f,tipo_projeto:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {tiposProjeto.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="acn-label">Tipo de Equipamento *
                    <button type="button" style={{marginLeft:6,fontSize:9,padding:'1px 6px',background:'#0f766e',color:'white',border:'none',borderRadius:3,cursor:'pointer'}}
                      onClick={()=>setModalNovoEquip(true)}>+ novo</button>
                  </label>
                  <select className="acn-input" style={{width:'100%'}} value={form.equipamento_nome}
                    onChange={e=>setForm(f=>({...f,equipamento_nome:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {equipamentos.map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{maxWidth:90}}>
                  <label className="acn-label">Qtd</label>
                  <input type="number" min={1} max={20} className="acn-input" style={{width:'100%'}} value={form.quantidade}
                    onChange={e=>handleQtdChange(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* EQUIPAMENTOS — um card por unidade */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>
                Dados do{equipLista.length > 1 ? 's' : ''} Equipamento{equipLista.length > 1 ? 's' : ''} ({equipLista.length})
              </div>
              {equipLista.map((eq, idx) => (
                <div key={idx} style={{border:'1px solid var(--border)',borderRadius:6,padding:'10px 12px',marginBottom:8}}>
                  {equipLista.length > 1 && (
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <span style={{background:'#0f766e',color:'white',fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10}}>#{idx+1}</span>
                      <span style={{fontSize:10,opacity:.6}}>Equipamento {idx+1} de {equipLista.length}</span>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="acn-label">Marca</label>
                      <input className="acn-input" style={{width:'100%'}} value={eq.marca}
                        onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,marca:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="acn-label">Modelo</label>
                      <input className="acn-input" style={{width:'100%'}} value={eq.modelo}
                        onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,modelo:e.target.value}:x))} />
                    </div>
                    {(form.is_veiculo || isVeicular(form.tipo_projeto)) ? (
                      <div className="form-group">
                        <label className="acn-label">Chassi</label>
                        <input className="acn-input" style={{width:'100%'}} value={eq.chassi}
                          onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,chassi:e.target.value}:x))} />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label className="acn-label">Nº de Série</label>
                        <input className="acn-input" style={{width:'100%'}} value={eq.numero_serie}
                          onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,numero_serie:e.target.value}:x))} />
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{marginTop:4}}>
                    <label className="acn-label">Defeito Reclamado *</label>
                    <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}} value={eq.defeito}
                      onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,defeito:e.target.value}:x))} />
                  </div>
                </div>
              ))}
            </div>

            {/* OBSERVAÇÕES GERAIS */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Observações Gerais</div>
              <MencaoTextarea value={form.observacoes||''} rows={2}
                placeholder="Observações adicionais... @Nome para mencionar alguém"
                onChange={v=>setForm(f=>({...f,observacoes:v}))} />
            </div>

            {/* DADOS DO CLIENTE */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Dados do Cliente</div>
              <div className="form-row">
                <div className="form-group" style={{flex:2}}><label className="acn-label">Nome do Cliente *</label>
                  <ClienteAutocomplete
                    value={form.cliente_nome}
                    onChange={v=>setForm(f=>({...f,cliente_nome:v.toUpperCase(),_cliente_id:null,_cliente_obj:null}))}
                    onSelect={c=>{ const d=clienteToForm(c); setForm(f=>({...f,cliente_nome:d.cliente_nome,empresa_orgao:d.empresa_orgao,cpf_cnpj:d.cpf_cnpj,telefone:d.telefone,email:d.email,endereco:d.endereco,_cliente_id:d._cliente_id,_cliente_obj:d._cliente_obj})); }}
                  /></div>
                <div className="form-group"><label className="acn-label">Empresa / Órgão</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.empresa_orgao} onChange={e=>setForm(f=>({...f,empresa_orgao:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">CPF / CNPJ</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.cpf_cnpj} onChange={e=>setForm(f=>({...f,cpf_cnpj:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{flex:2}}><label className="acn-label">Endereço</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.endereco} onChange={e=>setForm(f=>({...f,endereco:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">Telefone</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">E-mail</label>
                  <input type="email" className="acn-input" style={{width:'100%'}} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
            </div>

            {/* PRAZOS */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Prazos</div>
              <div className="form-row">
                {form.tipo_servico !== 'Garantia' && (
                  <div className="form-group"><label className="acn-label">Prazo para Orçamento</label>
                    <input type="date" className="acn-input" style={{width:'100%'}} value={form.prazo_orcamento}
                      onChange={e=>setForm(f=>({...f,prazo_orcamento:e.target.value}))} /></div>
                )}
                {form.tipo_servico === 'Garantia' && (
                  <div className="form-group"><label className="acn-label">Data Prevista de Entrega</label>
                    <input type="date" className="acn-input" style={{width:'100%'}} value={form.data_prevista_entrega}
                      onChange={e=>setForm(f=>({...f,data_prevista_entrega:e.target.value}))} /></div>
                )}
              </div>
            </div>

            {/* Despesas — Serviço Externo */}
            {hasDespesas && (
              <div style={{border:'1px solid rgba(245,158,11,.35)',borderRadius:6,padding:'10px 12px',marginBottom:12,background:'rgba(245,158,11,.06)'}}>
                <div style={{fontWeight:700,fontSize:9,color:'#b45309',letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>🚗 Despesas de Campo</div>
                <div className="form-row">
                  <div className="form-group"><label className="acn-label">Deslocamento (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_deslocamento} onChange={e=>setForm(f=>({...f,despesa_deslocamento:e.target.value}))} /></div>
                  <div className="form-group"><label className="acn-label">Hospedagem (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_hospedagem} onChange={e=>setForm(f=>({...f,despesa_hospedagem:e.target.value}))} /></div>
                  <div className="form-group"><label className="acn-label">Alimentação (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_alimentacao} onChange={e=>setForm(f=>({...f,despesa_alimentacao:e.target.value}))} /></div>
                  <div className="form-group" style={{alignSelf:'flex-end'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#b45309',padding:'4px 8px',background:'rgba(245,158,11,.15)',borderRadius:4,border:'1px solid rgba(245,158,11,.3)'}}>
                      Total: R$ {(
                        (parseFloat(form.despesa_deslocamento.replace(',','.')||'0')||0) +
                        (parseFloat(form.despesa_hospedagem.replace(',','.')||'0')||0) +
                        (parseFloat(form.despesa_alimentacao.replace(',','.')||'0')||0)
                      ).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Acessórios */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Checklist de Acessórios</div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                <input className="acn-input" style={{flex:1}} placeholder="Ex: Carregador, Manual, Cabo USB..."
                  value={acessInput} onChange={e=>setAcessInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}} />
                <button className="acn-btn" style={{background:'#0f766e',fontSize:10}} onClick={()=>{ if(acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}}>+ Add</button>
              </div>
              {form.acessorios.length === 0 ? (
                <div style={{fontSize:10,opacity:.5}}>Nenhum acessório adicionado.</div>
              ) : (
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {form.acessorios.map((a,i) => (
                    <label key={i} style={{display:'flex',alignItems:'center',gap:4,border:'1px solid var(--border)',borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer'}}>
                      <input type="checkbox" checked={a.presente}
                        onChange={()=>setForm(f=>({...f,acessorios:f.acessorios.map((x,j)=>j===i?{...x,presente:!x.presente}:x)}))} />
                      {a.descricao}
                      <button type="button" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11,lineHeight:1,padding:'0 2px'}}
                        onClick={()=>setForm(f=>({...f,acessorios:f.acessorios.filter((_,j)=>j!==i)}))}>×</button>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Fotos / Arquivos entrada */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Fotos e Arquivos de Entrada</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <div>
                  <div style={{fontSize:9,color:'#6b7280',marginBottom:3}}>Fotos (imagens)</div>
                  <input type="file" accept="image/*" multiple
                    onChange={e=>setFotosEntradaFiles(Array.from(e.target.files||[]))} />
                  {fotosEntradaFiles.length > 0 && <div style={{fontSize:10,color:'#22c55e',marginTop:2}}>{fotosEntradaFiles.length} foto(s)</div>}
                </div>
                <div>
                  <div style={{fontSize:9,color:'#6b7280',marginBottom:3}}>Documentos (PDF, Word, etc.)</div>
                  <input type="file" multiple
                    onChange={e=>setArquivosEntradaFiles(Array.from(e.target.files||[]))} />
                  {arquivosEntradaFiles.length > 0 && <div style={{fontSize:10,color:'#22c55e',marginTop:2}}>{arquivosEntradaFiles.length} arquivo(s)</div>}
                </div>
              </div>
            </div>

            {/* Manutenção Veicular — campos específicos */}
            {form.is_veiculo && (
              <div style={{border:'2px solid #dc2626',borderRadius:6,padding:'12px',marginBottom:12,background:'#fff5f5'}}>
                <div style={{fontWeight:700,fontSize:9,color:'#dc2626',letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>🚗 Manutenção Veicular</div>
                <div className="form-row" style={{marginBottom:8}}>
                  <div className="form-group">
                    <label className="acn-label">Tipo de Avaliação *</label>
                    <div style={{display:'flex',gap:8}}>
                      {['Presencial','Remota'].map(v=>(
                        <label key={v} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,cursor:'pointer',
                          padding:'5px 12px',border:`2px solid ${form.tipo_avaliacao===v?'#dc2626':'#d1d5db'}`,
                          borderRadius:4,background:form.tipo_avaliacao===v?'#fee2e2':'white',fontWeight:form.tipo_avaliacao===v?700:400}}>
                          <input type="radio" name="tipo_avaliacao" value={v}
                            checked={form.tipo_avaliacao===v}
                            onChange={()=>setForm(f=>({...f,tipo_avaliacao:v as any}))} style={{display:'none'}} />
                          {v==='Presencial'?'🔧':'📡'} {v}
                        </label>
                      ))}
                    </div>
                    <div style={{fontSize:9,color:'#6b7280',marginTop:4}}>
                      {form.tipo_avaliacao==='Presencial'
                        ? '→ SAC define data de entrega do veículo (Provisionamento)'
                        : '→ SAC insere itens e envia cotação ao cliente para aprovação'}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="acn-label" style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="checkbox" checked={form.acompanhamento_engenharia}
                        onChange={e=>setForm(f=>({...f,acompanhamento_engenharia:e.target.checked}))}
                        style={{accentColor:'#2563eb'}} />
                      <span>⚙️ Acompanhamento de Engenharia</span>
                    </label>
                    <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>Cria demanda adicional para a Engenharia acompanhar.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Dados de Faturamento */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Dados de Faturamento (Fiscal / NF)</div>
              <div className="form-row">
                <div className="form-group"><label className="acn-label">CNPJ / CPF Faturamento</label>
                  <input className="acn-input" style={{width:'100%'}} placeholder="Pode ser diferente do cliente"
                    value={form.cnpj_faturamento} onChange={e=>setForm(f=>({...f,cnpj_faturamento:e.target.value}))} /></div>
                <div className="form-group" style={{flex:2}}><label className="acn-label">Razão Social / Nome Faturamento</label>
                  <input className="acn-input" style={{width:'100%'}}
                    value={form.razao_social_faturamento} onChange={e=>setForm(f=>({...f,razao_social_faturamento:e.target.value}))} /></div>
              </div>
              <div className="form-group"><label className="acn-label">Endereço Faturamento</label>
                <input className="acn-input" style={{width:'100%'}}
                  value={form.endereco_faturamento} onChange={e=>setForm(f=>({...f,endereco_faturamento:e.target.value}))} /></div>
            </div>

            {/* Financeiro / Comissões */}
            <div style={{border:'1px solid rgba(16,185,129,.3)',borderRadius:6,padding:'10px 14px',marginBottom:12,background:'rgba(16,185,129,.04)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#059669',marginBottom:8}}>💰 Valores Financeiros (Comissões)</div>
              <div className="form-row">
                <div className="form-group" style={{maxWidth:160}}><label className="acn-label">Valor Total (R$)</label>
                  <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00"
                    value={form.valor_total||''} onChange={e=>setForm(f=>({...f,valor_total:e.target.value}))} /></div>
                <div className="form-group" style={{maxWidth:160}}><label className="acn-label">Mão de Obra (R$)</label>
                  <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00"
                    value={form.valor_mao_de_obra||''} onChange={e=>setForm(f=>({...f,valor_mao_de_obra:e.target.value}))} /></div>
                <div className="form-group" style={{maxWidth:160}}><label className="acn-label">Data Faturamento</label>
                  <input type="date" className="acn-input" style={{width:'100%'}}
                    value={form.data_faturamento||''} onChange={e=>setForm(f=>({...f,data_faturamento:e.target.value}))} /></div>
              </div>
            </div>

            {/* Info */}
            {!form.is_veiculo && form.tipo_servico !== 'Garantia' && (
              <div style={{border:'1px solid rgba(59,130,246,.3)',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:11,background:'rgba(59,130,246,.06)'}}>
                ℹ️ A OS será encaminhada automaticamente para o <strong>Laboratório</strong> para diagnóstico e elaboração do orçamento.
              </div>
            )}
            {!form.is_veiculo && form.tipo_servico === 'Garantia' && (
              <div style={{border:'1px solid rgba(34,197,94,.3)',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:11,background:'rgba(34,197,94,.06)'}}>
                ✅ Garantia é <strong>aprovada automaticamente</strong>. O Laboratório receberá a OS para execução direta.
              </div>
            )}

            {/* ── Vínculo CRM (opcional) ── */}
            <div style={{marginBottom:12,background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:6,padding:'10px 12px'}}>
              <div style={{fontWeight:700,fontSize:9,color:'#7c3aed',marginBottom:6,letterSpacing:.5,textTransform:'uppercase'}}>🔗 Vínculo Comercial/CRM (opcional)</div>
              {form.crm_oportunidade_id ? (
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{flex:1,fontSize:10,color:'#5b21b6',fontWeight:600}}>✓ {form._crm_titulo}</span>
                  <button type="button" style={{fontSize:9,padding:'2px 8px',background:'#e9d5ff',color:'#7c3aed',border:'none',borderRadius:3,cursor:'pointer'}}
                    onClick={()=>{setForm(f=>({...f,crm_oportunidade_id:null,_crm_titulo:''}));setCrmBusca('');setCrmSugestoes([]);}}>
                    ✕ remover
                  </button>
                </div>
              ) : (
                <div style={{position:'relative'}}>
                  <input className="acn-input" style={{width:'100%'}} placeholder="Buscar oportunidade CRM para vincular..."
                    value={crmBusca}
                    onChange={async e => {
                      const q = e.target.value;
                      setCrmBusca(q);
                      if (q.length < 2) { setCrmSugestoes([]); return; }
                      setCrmBuscando(true);
                      const { data } = await supabase.from('crm_oportunidades')
                        .select('id,titulo,orgao,funil')
                        .or(`titulo.ilike.%${q}%,orgao.ilike.%${q}%`)
                        .order('atualizado_em', { ascending: false })
                        .limit(8);
                      setCrmSugestoes(data || []);
                      setCrmBuscando(false);
                    }}
                  />
                  {crmBuscando && <span style={{position:'absolute',right:8,top:6,fontSize:9,color:'#94a3b8'}}>...</span>}
                  {crmSugestoes.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:'white',border:'1px solid #ddd6fe',borderRadius:4,boxShadow:'0 4px 12px #0002',maxHeight:160,overflowY:'auto'}}>
                      {crmSugestoes.map(c => (
                        <div key={c.id} style={{padding:'6px 10px',cursor:'pointer',fontSize:10,borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:6}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#f5f3ff')}
                          onMouseLeave={e=>(e.currentTarget.style.background='white')}
                          onClick={()=>{setForm(f=>({...f,crm_oportunidade_id:c.id,_crm_titulo:c.titulo||c.orgao||'—'}));setCrmBusca('');setCrmSugestoes([]);}}>
                          <span style={{fontSize:8,color:c.funil==='licitacao'?'#7c3aed':'#0e7490',fontWeight:700,flexShrink:0}}>
                            {c.funil==='licitacao'?'🏛️':'💼'}
                          </span>
                          <span style={{flex:1}}>{c.titulo||'—'}</span>
                          {c.orgao && <span style={{fontSize:8,color:'#94a3b8',flexShrink:0}}>{c.orgao}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button className="acn-btn" style={{background:'#0f766e',flex:1,padding:'10px',fontSize:11,opacity:salvando?0.6:1}}
                onClick={criarOS} disabled={salvando}>{salvando?'Salvando...':'ABRIR OS'}</button>
              <button className="acn-btn" style={{background:'#64748b',padding:'10px'}} onClick={()=>setModalNova(false)}>Cancelar</button>
            </div>

            </div>{/* fim padding wrapper */}
          </div>
        </div>
      )}

      {/* ════════ MODAL ORÇAMENTO (confirmar/editar antes de enviar) ════════ */}
      {modalOrc && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">📤 Enviar Orçamento ao Cliente — {modalOrc.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>Cliente: {modalOrc.cliente_nome} | {modalOrc.equipamento_nome}</div>
            {modalOrc.observacoes_lab && (
              <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
                <strong>Diagnóstico do Lab:</strong> {modalOrc.observacoes_lab}
              </div>
            )}
            <label className="acn-label">Valor do Orçamento (R$) *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}} placeholder="Ex: 1.500,00"
              value={orcForm.valor} onChange={e=>setOrcForm(f=>({...f,valor:e.target.value}))} />
            <label className="acn-label">Condições de Pagamento</label>
            <textarea className="acn-input" rows={2} style={{width:'100%',marginBottom:12,resize:'vertical'}}
              placeholder="Ex: 50% entrada + 50% na retirada"
              value={orcForm.condicoes} onChange={e=>setOrcForm(f=>({...f,condicoes:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#7c3aed',flex:1}} onClick={enviarOrcamento}>ENVIAR AO CLIENTE</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalOrc(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL APROVAÇÃO ════════ */}
      {modalAprov && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">✅ Aprovação de Orçamento — {modalAprov.numero_os}</div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:4,padding:8,marginBottom:12,fontSize:11}}>
              <strong>Valor:</strong> {fmtVal(modalAprov.valor_orcamento)} &nbsp;|&nbsp;
              <strong>Condições:</strong> {modalAprov.condicoes_pagamento || '—'}
            </div>
            <label className="acn-label">Nome do Aprovador *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}}
              value={aprovForm.nome} onChange={e=>setAprovForm(f=>({...f,nome:e.target.value}))} />
            <label className="acn-label">Data Prevista de Entrega</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={aprovForm.data_entrega} onChange={e=>setAprovForm(f=>({...f,data_entrega:e.target.value}))} />
            <label className="acn-label">Assinatura do Aprovador *</label>
            {aprovForm.sig ? (
              <div style={{textAlign:'center',marginBottom:8}}>
                <img src={aprovForm.sig} alt="Assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:'100%',height:90,objectFit:'contain',background:'white'}} />
                <button className="acn-btn" style={{background:'#94a3b8',marginTop:4,fontSize:10}} onClick={()=>setAprovForm(f=>({...f,sig:null}))}>Limpar</button>
              </div>
            ) : <SignCanvas onSave={(d)=>setAprovForm(f=>({...f,sig:d}))} />}
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={salvarAprovacao}>CONFIRMAR APROVAÇÃO</button>
              <button className="acn-btn" style={{background:'#ef4444'}} onClick={()=>{setModalRepr(modalAprov);setReprForm({motivo:'',data_retirada:'',nome_retirada:''});setModalAprov(null);}}>REPROVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAprov(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL REPROVAÇÃO ════════ */}
      {modalRepr && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">❌ Reprovação — {modalRepr.numero_os}</div>
            <label className="acn-label">Motivo da Reprovação *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              value={reprForm.motivo} onChange={e=>setReprForm(f=>({...f,motivo:e.target.value}))} />
            <label className="acn-label">Data de Retirada do Equipamento</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={reprForm.data_retirada} onChange={e=>setReprForm(f=>({...f,data_retirada:e.target.value}))} />
            <label className="acn-label">Nome de Quem Retirou</label>
            <input className="acn-input" style={{width:'100%',marginBottom:12}}
              value={reprForm.nome_retirada} onChange={e=>setReprForm(f=>({...f,nome_retirada:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={reprovar}>CONFIRMAR REPROVAÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalRepr(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL SAÍDA / ENTREGA ════════ */}
      {/* ════════ MODAL ENTREGA VEICULAR ════════ */}
      {modalEntregaVeic && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">🚚 Entrega de Veículo — {modalEntregaVeic.numero_os}</div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:4,padding:8,marginBottom:12,fontSize:11}}>
              <strong>Cliente:</strong> {modalEntregaVeic.cliente_nome}<br/>
              {modalEntregaVeic.veiculo_modelo && <><strong>Veículo:</strong> {modalEntregaVeic.veiculo_modelo} — {modalEntregaVeic.veiculo_placa}</>}
            </div>
            <label className="acn-label">Nome de quem recebeu o veículo *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:14}} autoFocus
              placeholder="Nome completo do receptor"
              value={nomeRecebeuVeic} onChange={e=>setNomeRecebeuVeic(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&confirmarEntregaVeicular()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#166534',flex:1}} onClick={confirmarEntregaVeicular}>✅ Confirmar Entrega</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEntregaVeic(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL ANEXAR ════════ */}
      {modalAnexar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">📎 Anexar Arquivos — {modalAnexar.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: <strong>{modalAnexar.cliente_nome}</strong></div>

            {/* Anexos existentes */}
            {Array.isArray(modalAnexar.arquivos_os) && modalAnexar.arquivos_os.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Arquivos já anexados</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {modalAnexar.arquivos_os.map((a:any,i:number)=>{
                    const isImg = a.tipo&&a.tipo.startsWith('image/');
                    return isImg ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" title={a.nome}>
                        <img src={a.url} alt={a.nome} style={{height:52,width:52,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                      </a>
                    ) : (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer"
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:10, color:'#0f766e', textDecoration:'none', background:'#f8fafc', maxWidth:180, wordBreak:'break-word' }}>
                        📄 {a.nome}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upload novos */}
            <div style={{border:'2px dashed #cbd5e1',borderRadius:6,padding:'14px',textAlign:'center',marginBottom:14,background:'#f8fafc'}}>
              <div style={{fontSize:11,color:'#64748b',marginBottom:8}}>Imagens, PDFs, Word, Excel…</div>
              <input type="file" multiple accept={`image/*,.pdf,.doc,.docx,${EXT_PLANILHAS},.txt,.zip`}
                onChange={e=>setAnexarFiles(Array.from(e.target.files||[]))}
                style={{fontSize:11}} />
              {anexarFiles.length > 0 && (
                <div style={{marginTop:8,fontSize:11,color:'#22c55e',fontWeight:700}}>{anexarFiles.length} arquivo(s) selecionado(s)</div>
              )}
            </div>

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0369a1',flex:1}}
                disabled={!anexarFiles.length||anexosSendoUpload}
                onClick={async()=>{
                  await anexarArquivos(modalAnexar,anexarFiles);
                  setAnexarFiles([]);
                  // Refresh modalAnexar with updated data
                  const {data} = await supabase.from('sac_ordens_servico').select('*').eq('id',modalAnexar.id).single();
                  if(data) setModalAnexar(data);
                }}>
                {anexosSendoUpload ? '⏳ Enviando...' : '⬆️ Enviar Arquivos'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAnexar(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modalAprovCotacao && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">✅ Aprovação de Cotação — {modalAprovCotacao.numero_os}</div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:4,padding:8,marginBottom:12,fontSize:11}}>
              <strong>Cliente:</strong> {modalAprovCotacao.cliente_nome}<br/>
              <strong>Valor:</strong> {fmtVal(modalAprovCotacao.valor_orcamento || (modalAprovCotacao.itens_cotacao||[]).reduce((s:number,i:any)=>s+(i.quantidade||1)*(i.valor_unitario||0),0))}
            </div>
            <label className="acn-label">Nome de quem aprovou *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:14}} autoFocus
              placeholder="Nome completo do aprovador"
              value={aprovCotacaoNome} onChange={e=>setAprovCotacaoNome(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&confirmarAprovCotacao()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={confirmarAprovCotacao}>✅ Confirmar Aprovação</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAprovCotacao(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalSaida && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">🚚 Entrega — {modalSaida.numero_os}</div>
            <label className="acn-label">Nome de Quem Retirou *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}}
              value={saidaForm.nome} onChange={e=>setSaidaForm(f=>({...f,nome:e.target.value}))} />
            <label className="acn-label">Fotos de Saída</label>
            <input type="file" accept="image/*" multiple style={{marginBottom:10}}
              onChange={e=>setFotosSaidaFiles(Array.from(e.target.files||[]))} />
            <label className="acn-label">Assinatura de Retirada *</label>
            {saidaForm.sig ? (
              <div style={{textAlign:'center',marginBottom:8}}>
                <img src={saidaForm.sig} alt="Assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:'100%',height:90,objectFit:'contain',background:'white'}} />
                <button className="acn-btn" style={{background:'#94a3b8',marginTop:4,fontSize:10}} onClick={()=>setSaidaForm(f=>({...f,sig:null}))}>Limpar</button>
              </div>
            ) : <SignCanvas onSave={(d)=>setSaidaForm(f=>({...f,sig:d}))} />}
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="acn-btn" style={{background:'#166534',flex:1}} onClick={salvarSaida}>CONFIRMAR ENTREGA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalSaida(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAIS FLUXO VEICULAR ════════ */}

      {/* Modal: Itens da Cotação */}
      {modalItens && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth: 980,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">📋 Itens da Cotação — {modalItens.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: {modalItens.cliente_nome}</div>
            {/* Tabela de itens */}
            <>
              <table style={{width:'100%',borderCollapse:'collapse',marginBottom:8}}>
                <thead>
                  <tr style={{background:'#f1f5f9'}}>
                    <th style={{padding:'6px 8px',fontSize:10,textAlign:'left',borderBottom:'2px solid #e2e8f0',width:90}}>Código</th>
                    <th style={{padding:'6px 8px',fontSize:10,textAlign:'left',borderBottom:'2px solid #e2e8f0'}}>Descrição</th>
                    <th style={{padding:'6px 8px',fontSize:10,textAlign:'center',borderBottom:'2px solid #e2e8f0',width:60}}>Qtd</th>
                    <th style={{padding:'6px 8px',fontSize:10,textAlign:'right',borderBottom:'2px solid #e2e8f0',width:100}}>Vl. Unit. (R$)</th>
                    <th style={{padding:'6px 8px',fontSize:10,textAlign:'right',borderBottom:'2px solid #e2e8f0',width:100}}>Total</th>
                    <th style={{width:30,borderBottom:'2px solid #e2e8f0'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {localItens.map((item, idx) => (
                    <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                      <td style={{padding:'4px 6px'}}>
                        <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.codigo}
                          onChange={e=>setLocalItens(p=>p.map((x,i)=>i===idx?{...x,codigo:e.target.value}:x))} placeholder="Cód." />
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.descricao}
                          onChange={e=>setLocalItens(p=>p.map((x,i)=>i===idx?{...x,descricao:e.target.value}:x))} placeholder="Descrição do item..." />
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <input type="number" min={1} className="acn-input" style={{width:'100%',fontSize:10,textAlign:'center'}} value={item.quantidade}
                          onChange={e=>setLocalItens(p=>p.map((x,i)=>i===idx?{...x,quantidade:Number(e.target.value)||1}:x))} />
                      </td>
                      <td style={{padding:'4px 6px'}}>
                        <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%',fontSize:10,textAlign:'right'}} value={item.valor_unitario}
                          onChange={e=>setLocalItens(p=>p.map((x,i)=>i===idx?{...x,valor_unitario:Number(e.target.value)||0}:x))} />
                      </td>
                      <td style={{padding:'4px 8px',fontSize:10,textAlign:'right',fontWeight:700,color:'#0f766e'}}>
                        {((Number(item.quantidade)||1)*(Number(item.valor_unitario)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </td>
                      <td style={{padding:'4px'}}>
                        <button style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,lineHeight:1}}
                          onClick={()=>setLocalItens(p=>p.filter((_,i)=>i!==idx))}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:'#f0fdf4'}}>
                    <td colSpan={4} style={{padding:'8px',fontWeight:700,fontSize:11,textAlign:'right',color:'#166534'}}>TOTAL:</td>
                    <td style={{padding:'8px',fontWeight:800,fontSize:13,textAlign:'right',color:'#166534'}}>
                      R$ {localItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <button className="acn-btn" style={{background:'#e2e8f0',color:'#1e293b',fontSize:10,marginBottom:12}}
                onClick={()=>setLocalItens(p=>[...p,{codigo:'',descricao:'',quantidade:1,valor_unitario:0}])}>+ Adicionar Linha</button>
              {/* Horas cobradas na cotação remota */}
              <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6,padding:'10px 12px',marginBottom:12}}>
                <label className="acn-label" style={{color:'#c2410c'}}>⏱️ Horas Cobradas na Cotação (h)</label>
                <input type="number" min={0} step="0.5" className="acn-input" style={{width:140}}
                  placeholder="Ex: 2.5"
                  value={horasCobradas}
                  onChange={e=>setHorasCobradas(e.target.value)} />
                <div style={{fontSize:9,color:'#9a3412',marginTop:4}}>
                  Será comparado com as horas reais apontadas na Produção (KPI).
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#0f766e',flex:1}} onClick={()=>{ salvarItensOS(modalItens.id, localItens, horasCobradas); setModalItens(null); }}>✓ Salvar Itens</button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalItens(null)}>Fechar</button>
              </div>
            </>
          </div>
        </div>
      )}

      {/* MODAL: Enviar para Fiscal — captura nº de série dos itens instalados */}
      {modalEnviarFiscal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth: 980,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">📤 Enviar para Fiscal — {modalEnviarFiscal.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: {modalEnviarFiscal.cliente_nome}</div>
            <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
              ⚠️ Informe o nº de série de cada item instalado antes de enviar — o Fiscal precisa dessa informação para emitir a NF-e.
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
              <thead>
                <tr style={{background:'#f1f5f9'}}>
                  <th style={{padding:'6px 8px',fontSize:10,textAlign:'left',borderBottom:'2px solid #e2e8f0'}}>Descrição</th>
                  <th style={{padding:'6px 8px',fontSize:10,textAlign:'center',borderBottom:'2px solid #e2e8f0',width:60}}>Qtd</th>
                  <th style={{padding:'6px 8px',fontSize:10,textAlign:'left',borderBottom:'2px solid #e2e8f0',width:180}}>Nº de Série</th>
                </tr>
              </thead>
              <tbody>
                {fiscalItens.map((item, idx) => (
                  <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'4px 6px',fontSize:11}}>{item.descricao || '—'}</td>
                    <td style={{padding:'4px 6px',fontSize:11,textAlign:'center'}}>{item.quantidade || 1}</td>
                    <td style={{padding:'4px 6px'}}>
                      <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.numero_serie || ''}
                        placeholder="Nº de série..."
                        onChange={e=>setFiscalItens(p=>p.map((x,i)=>i===idx?{...x,numero_serie:e.target.value}:x))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#f59e0b',flex:1}} onClick={enviarParaFiscal}>📤 Enviar para Fiscal</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{ setModalEnviarFiscal(null); setFiscalItens([]); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver / Editar Orçamento da Produção (Presencial) */}
      {modalOrcProd && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModalOrcProd(null);setOrcProdItens([]);}}}>
          <div className="modal-box" style={{maxWidth: 980,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">
              {orcProdModo==='ver' ? '👁 Orçamento da Produção' : '✏️ Editar Orçamento'} — {modalOrcProd.numero_os}
            </div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Cliente: <strong>{modalOrcProd.cliente_nome}</strong>
              {modalOrcProd.valor_orcamento && (
                <span style={{marginLeft:12,background:'#f0fdf4',border:'1px solid #86efac',padding:'2px 10px',borderRadius:20,fontWeight:700,color:'#166534'}}>
                  Total atual: R$ {Number(modalOrcProd.valor_orcamento).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                </span>
              )}
            </div>

            {/* Tabs Ver / Editar */}
            <div style={{display:'flex',gap:0,marginBottom:12,borderRadius:6,overflow:'hidden',border:'1px solid #e2e8f0'}}>
              <button style={{flex:1,padding:'7px',background:orcProdModo==='ver'?'#0891b2':'white',color:orcProdModo==='ver'?'white':'#64748b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
                onClick={()=>setOrcProdModo('ver')}>👁 Visualizar</button>
              <button style={{flex:1,padding:'7px',background:orcProdModo==='editar'?'#7c3aed':'white',color:orcProdModo==='editar'?'white':'#64748b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
                onClick={()=>{ if(orcProdModo==='ver') setOrcProdItens(Array.isArray(modalOrcProd.itens_cotacao)&&modalOrcProd.itens_cotacao.length>0?modalOrcProd.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setOrcProdModo('editar'); }}>
                ✏️ Editar
              </button>
            </div>

            {orcProdModo === 'ver' ? (
              /* MODO VER — somente leitura */
              <div>
                {(!orcProdItens || orcProdItens.length === 0) ? (
                  <div style={{textAlign:'center',color:'#94a3b8',padding:24,fontSize:12}}>Nenhum item inserido pela Produção ainda.</div>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr style={{background:'#f1f5f9'}}>
                      <th style={{padding:'6px 8px',textAlign:'left',fontSize:10}}>Código</th>
                      <th style={{padding:'6px 8px',textAlign:'left',fontSize:10}}>Descrição</th>
                      <th style={{padding:'6px 8px',textAlign:'center',fontSize:10,width:55}}>Qtd</th>
                      <th style={{padding:'6px 8px',textAlign:'right',fontSize:10,width:100}}>Vl. Unit.</th>
                      <th style={{padding:'6px 8px',textAlign:'right',fontSize:10,width:100}}>Total</th>
                    </tr></thead>
                    <tbody>
                      {orcProdItens.map((item,i)=>(
                        <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                          <td style={{padding:'6px 8px',color:'#64748b'}}>{item.codigo||'—'}</td>
                          <td style={{padding:'6px 8px',fontWeight:600}}>{item.descricao||'—'}</td>
                          <td style={{padding:'6px 8px',textAlign:'center'}}>{item.quantidade||1}</td>
                          <td style={{padding:'6px 8px',textAlign:'right'}}>R$ {Number(item.valor_unitario||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:'#0f766e'}}>R$ {((Number(item.quantidade)||1)*(Number(item.valor_unitario)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{background:'#f0fdf4'}}>
                      <td colSpan={4} style={{padding:'8px',fontWeight:700,textAlign:'right',color:'#166534'}}>TOTAL:</td>
                      <td style={{padding:'8px',fontWeight:800,fontSize:13,textAlign:'right',color:'#166534'}}>
                        R$ {orcProdItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </td>
                    </tr></tfoot>
                  </table>
                )}
                <div style={{display:'flex',gap:8,marginTop:14}}>
                  <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setModalOrcProd(null);setOrcProdItens([])}}>Fechar</button>
                </div>
              </div>
            ) : (
              /* MODO EDITAR */
              <div>
                <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px',marginBottom:10,fontSize:10}}>
                  ⚠️ Editar o orçamento não altera a aprovação — use para corrigir valores antes de comunicar o cliente.
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',marginBottom:6}}>
                  <thead><tr style={{background:'#f1f5f9'}}>
                    <th style={{padding:'5px 7px',fontSize:10,textAlign:'left',width:80}}>Código</th>
                    <th style={{padding:'5px 7px',fontSize:10,textAlign:'left'}}>Descrição</th>
                    <th style={{padding:'5px 7px',fontSize:10,textAlign:'center',width:55}}>Qtd</th>
                    <th style={{padding:'5px 7px',fontSize:10,textAlign:'right',width:95}}>Vl. Unit.</th>
                    <th style={{padding:'5px 7px',fontSize:10,textAlign:'right',width:95}}>Total</th>
                    <th style={{width:28}}></th>
                  </tr></thead>
                  <tbody>
                    {orcProdItens.map((item,idx)=>(
                      <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'3px 5px'}}>
                          <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.codigo||''} onChange={e=>setOrcProdItens(p=>p.map((x,i)=>i===idx?{...x,codigo:e.target.value}:x))} />
                        </td>
                        <td style={{padding:'3px 5px'}}>
                          <input className="acn-input" style={{width:'100%',fontSize:10}} value={item.descricao||''} onChange={e=>setOrcProdItens(p=>p.map((x,i)=>i===idx?{...x,descricao:e.target.value}:x))} placeholder="Peça / serviço..." />
                        </td>
                        <td style={{padding:'3px 5px'}}>
                          <input type="number" min={1} className="acn-input" style={{width:'100%',fontSize:10,textAlign:'center'}} value={item.quantidade||1} onChange={e=>setOrcProdItens(p=>p.map((x,i)=>i===idx?{...x,quantidade:Number(e.target.value)||1}:x))} />
                        </td>
                        <td style={{padding:'3px 5px'}}>
                          <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%',fontSize:10,textAlign:'right'}} value={item.valor_unitario||0} onChange={e=>setOrcProdItens(p=>p.map((x,i)=>i===idx?{...x,valor_unitario:Number(e.target.value)||0}:x))} />
                        </td>
                        <td style={{padding:'3px 7px',fontSize:10,textAlign:'right',fontWeight:700,color:'#0f766e'}}>
                          {((Number(item.quantidade)||1)*(Number(item.valor_unitario)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </td>
                        <td>
                          <button style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14}} onClick={()=>setOrcProdItens(p=>p.filter((_,i)=>i!==idx))}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{background:'#f0fdf4'}}>
                    <td colSpan={4} style={{padding:'6px',fontWeight:700,fontSize:11,textAlign:'right',color:'#166534'}}>TOTAL:</td>
                    <td style={{padding:'6px',fontWeight:800,fontSize:12,textAlign:'right',color:'#166534'}}>
                      R$ {orcProdItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </td>
                    <td></td>
                  </tr></tfoot>
                </table>
                <button className="acn-btn" style={{background:'#e2e8f0',color:'#1e293b',fontSize:10,marginBottom:12}}
                  onClick={()=>setOrcProdItens(p=>[...p,{codigo:'',descricao:'',quantidade:1,valor_unitario:0}])}>
                  + Adicionar Item
                </button>
                <div style={{display:'flex',gap:8}}>
                  <button className="acn-btn" style={{background:'#7c3aed',flex:1}} onClick={salvarEdicaoOrcProd}>💾 Salvar Alterações</button>
                  <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setModalOrcProd(null);setOrcProdItens([])}}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Aceite SAC — confirma data definida pela Produção com o cliente */}
      {modalAceiteSAC && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:440}}>
            <div className="modal-title">📋 Aceite SAC — {modalAceiteSAC.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>Cliente: {modalAceiteSAC.cliente_nome}</div>
            <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:11}}>
              <div style={{fontWeight:700,color:'#0369a1',marginBottom:4}}>📅 Data definida pela Produção:</div>
              <div style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>
                {modalAceiteSAC.data_provisionamento
                  ? new Date(modalAceiteSAC.data_provisionamento+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
                  : '—'}
                {modalAceiteSAC.periodo_provisionamento ? ` — ${modalAceiteSAC.periodo_provisionamento}` : ''}
              </div>
            </div>
            <div style={{fontSize:11,color:'#374151',marginBottom:14,background:'#fefce8',border:'1px solid #fde68a',borderRadius:4,padding:'8px 10px'}}>
              ℹ️ Confirme se o cliente aceitou esta data para entrega/chegada do veículo.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={()=>confirmarAceiteSAC(modalAceiteSAC)}>✅ Cliente Confirmou</button>
              <button className="acn-btn" style={{background:'#ef4444'}} onClick={()=>rejeitarAceiteSAC(modalAceiteSAC)}>❌ Não Confirmou</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAceiteSAC(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL NOVO EQUIPAMENTO ════════ */}
      {modalNovoEquip && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:360}}>
            <div className="modal-title">+ Novo Tipo de Equipamento</div>
            <label className="acn-label">Nome do Equipamento *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:12}} value={novoEquip}
              onChange={e=>setNovoEquip(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&salvarEquipamento()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0f766e',flex:1}} onClick={salvarEquipamento}>SALVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalNovoEquip(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL EDITAR RESPONSÁVEL OS ════════ */}
      {modalEditRespOS && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380,width:'95vw'}}>
            <div className="modal-title">✏️ Responsável — {modalEditRespOS.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10}}>
              Atual: <strong>{modalEditRespOS.responsavel_nome || '—'}</strong>
            </div>
            <label className="acn-label">Novo Responsável</label>
            <ColaboradorSelect
              value={editRespOSNome}
              onChange={v => setEditRespOSNome(v)}
              placeholder="Selecione o responsável..."
              className="acn-input"
              style={{width:'100%',marginBottom:16}}
            />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#6366f1',flex:1}} onClick={salvarRespOS}>✏️ SALVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEditRespOS(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL FINANCEIRO ════════ */}
      {modalFinanceiro && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420,width:'95vw'}}>
            <div className="modal-title">💰 Valores Financeiros — {modalFinanceiro.numero_os}</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:'4px 0 16px'}}>
              <div><label className="acn-label">Valor Total (R$)</label>
                <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00"
                  value={financeiroForm.valor_total} onChange={e=>setFinanceiroForm(f=>({...f,valor_total:e.target.value}))} /></div>
              <div><label className="acn-label">Mão de Obra (R$)</label>
                <input type="number" min={0} step="0.01" className="acn-input" style={{width:'100%'}} placeholder="0,00"
                  value={financeiroForm.valor_mao_de_obra} onChange={e=>setFinanceiroForm(f=>({...f,valor_mao_de_obra:e.target.value}))} /></div>
              <div><label className="acn-label">Data Faturamento</label>
                <input type="date" className="acn-input" style={{width:'100%'}}
                  value={financeiroForm.data_faturamento} onChange={e=>setFinanceiroForm(f=>({...f,data_faturamento:e.target.value}))} /></div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalFinanceiro(null)}>Cancelar</button>
              <button className="acn-btn" style={{background:'#059669'}} onClick={salvarFinanceiroOS}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACOMPANHAMENTO DA OS */}
      {modalAcomp && (
        <OplAcompModal
          referenciaId={String(modalAcomp.id)}
          referenciaDesc={`OS ${modalAcomp.numero_os || '—'}`}
          referenciaType="os"
          setor="SAC"
          currentUser={currentUser}
          onClose={() => setModalAcomp(null)}
        />
      )}
    </div>}  {/* fim abaAtiva === 'os' */}
    </div>
  );
}
