// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { EXT_PLANILHAS, contentTypeUpload } from './FormatosArquivo';
import { ModalSolicitarAnalise, AnaliseStatusPanel } from './AnaliseWidget';
import { carregarMarkupPorProcesso, MarkupBadge, MarkupBarraDistribuicao, OPCOES_FAIXA_MARKUP, idFaixaMarkup } from './MarkupTermometro';
import AgendaWidget from './AgendaWidget';
import { UnreadBadge } from './useUnread';
import { salvarMencoes } from './MencaoTextarea';
import Linkify from './Linkify';
import { FLUXOS, UFS } from './FluxoEntrega';
import FormacaoPrecosTab, { calcItem } from './FormacaoPrecosTab';
import { estruturaFormacao } from './FormacaoCalculo';
import { useModoSplit, estilosSplit, SeletorModoSplit } from './ModoSplit';
import { EnderecosEntrega, ContratoEntregas } from './LicitacaoEntregas';
import RichTextInput, { htmlSeguro, pareceHtmlFormatado } from './RichTextInput';
import { logChange, useUnreadChanges, useMarkAsRead, useUnreadMap } from './AuditSystem';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { podeExcluirLicitacao, bloqueiosDeExclusao } from './ExclusaoDeCard';
import { CabecalhoTela, Botao, Chips, Selo, Faixa, Abas, diaISO } from './Interface';
import { podeEditarAtualizacao } from './utils/permissoes';
import { MarcaAtualizacaoEditada } from './AtualizacaoEditavel';
import Icone from './Icone';
import { ModalSolicitarCompra } from './SolicitacaoCompra';
import { mdiPlus, mdiClose, mdiChartBar, mdiArrowLeft, mdiHistory, mdiUpdate, mdiTrashCanOutline, mdiUndoVariant, mdiCheck,
  mdiChevronDown, mdiChevronRight, mdiPencilOutline, mdiEmailOutline, mdiCellphone, mdiPhoneOutline, mdiPaperclip, mdiAccountOutline, mdiClockOutline,
  mdiContentSaveOutline, mdiAlertOutline, mdiFormatBold, mdiFormatItalic, mdiFormatUnderline, mdiFormatStrikethrough, mdiPalette, mdiFormatColorHighlight,
  mdiLinkVariant, mdiImageOutline, mdiTablePlus, mdiTableRemove, mdiWindowMinimize, mdiTrophyOutline, mdiCheckCircleOutline, mdiPackageVariantClosed,
  mdiRocketLaunchOutline, mdiChevronUp, mdiNoteTextOutline } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LIST = ['Aberta','Em Andamento','Vencida','Finalizada','Perdida','Descartada','Suspenso'];
// (as cores de cada status agora vêm da família de cor do guia — ver FAMILIA_STATUS_LICIT; a tabela de hexadecimais saiu na 12e33)
// Marcadores. Os 3 primeiros sao situacoes juridicas (ja existiam); os de
// baixo sao situacoes operacionais que as pessoas vinham escrevendo NO NOME
// do processo ("CADASTRADO - PE 55/2026...", "PEGAR ATA - ...") por falta
// de campo. Escrever no nome quebra busca e relatorio, entao viraram
// marcador de verdade.
const MARCADORES = ['Em Recurso','Em Defesa','Impugnado','Cadastrado','Pendente','Pegar ATA','Esclarecimento','Arrematado','Perdida'];
// Marcadores da disputa em andamento: não mudam o status da licitação. "Perdida" aqui
// é estar perdendo no lance com a disputa ainda aberta (o status Perdida é o resultado).
const FAMILIA_MARCADOR: Record<string, string> = { Esclarecimento: 'info', Arrematado: 'ok', Perdida: 'atencao' };
// Termômetro da proposta — mesmas faixas e cores do Comercial/CRM
const TEMPERATURAS = [
  { v: 'frio',   label: 'Frio',   emoji: '🧊' },
  { v: 'morno',  label: 'Morno',  emoji: '🌤️' },
  { v: 'quente', label: 'Quente', emoji: '🔥' },
] as const;
const infoTemp = (t: string) => TEMPERATURAS.find(x => x.v === t);
const AJUDA_MARCADOR: Record<string, string> = {
  Esclarecimento: 'Em fase de esclarecimento',
  Arrematado: 'Arrematamos o lance; a disputa segue (habilitação/homologação)',
  Perdida: 'Perdendo no lance, disputa ainda em andamento (não é o status Perdida)',
};
// prefixos legados detectados nos nomes, usados pra sugerir a limpeza
const PREFIXOS_LEGADOS: Record<string,string> = {
  'CADASTRADO': 'Cadastrado', 'PENDENTE': 'Pendente', 'PEGAR ATA': 'Pegar ATA',
};
const PRIORIDADES = ['Alta','Média','Baixa'];
const FATURAMENTO_OPTIONS = ['ACN','Detech','ACN e Detech'];
const TIPO_CONTATO_OPCOES = ['Pregoeiro','Secretário','Supervisor','Diretor','Comprador','Outro'];
const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtDataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });

// ─────────────────────────────────────────────────────────────────────────────
// UNDO (Ctrl+Z) DE EXCLUSÕES — reaproveita a tabela `lixeira` já usada pelo
// painel Admin → "♻️ Lixeira (24h)" e por excluirLicitacao. Cada exclusão
// dentro de Licitações grava o registro completo na lixeira ANTES de
// deletar (mesmo padrão de excluirLicitacao), e dispara este evento — um
// toast global escuta e oferece "Ctrl+Z" por alguns segundos pra restaurar.
// ─────────────────────────────────────────────────────────────────────────────
// Etapa 7.61 (07/10/2026): antes cada exclusão apagava o registro e DEPOIS tentava guardar a cópia, ignorando os dois erros —
// se a cópia falhasse, o registro sumia sem volta; se a exclusão falhasse, o aviso de "excluído" aparecia mesmo assim.
// Agora: lê o registro INTEIRO (a lista da licitação não traz as Áreas Livres, e a cópia saía sem elas), guarda a cópia, só então apaga,
// e se apagar falhar a cópia é descartada. Devolve true só quando excluiu de verdade.
async function excluirComUndo(tabela: string, id: string, deletadoPor: string, rotulo: string | ((reg: any) => string)): Promise<boolean> {
  const { data: reg, error: erroLeitura } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
  if (erroLeitura || !reg) { alert('Não foi possível ler o registro antes de excluir (' + (erroLeitura?.message || 'não encontrado') + '). Nada foi excluído.'); return false; }
  const { data: lix, error: erroLixeira } = await supabase.from('lixeira').insert([{
    tabela, registro_id: reg.id, dados: reg, deletado_por: deletadoPor,
  }]).select('id').single();
  if (erroLixeira || !lix?.id) { alert('Não foi possível guardar a cópia de segurança (' + (erroLixeira?.message || 'sem resposta') + '). Nada foi excluído.'); return false; }
  const { data: apagados, error: erroExclusao } = await supabase.from(tabela).delete().eq('id', id).select('id');
  if (erroExclusao || !apagados?.length) {
    await supabase.from('lixeira').delete().eq('id', lix.id);   // o registro continua aí: a cópia não vale
    alert('Não foi possível excluir (' + (erroExclusao?.message || 'o banco não apagou nada') + ').');
    return false;
  }
  window.dispatchEvent(new CustomEvent('acn:undo-disponivel', { detail: { lixeiraId: lix.id, label: typeof rotulo === 'function' ? rotulo(reg) : rotulo } }));
  return true;
}

function UndoToast({ onRestaurado }: { onRestaurado?: () => void }) {
  const [pendente, setPendente] = useState<{ lixeiraId: string; label: string } | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const onDisponivel = (e: any) => {
      setPendente(e.detail);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPendente(null), 10000);
    };
    window.addEventListener('acn:undo-disponivel', onDisponivel);
    return () => { window.removeEventListener('acn:undo-disponivel', onDisponivel); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const desfazer = useCallback(async () => {
    if (!pendente) return;
    const { data: item } = await supabase.from('lixeira').select('*').eq('id', pendente.lixeiraId).maybeSingle();
    if (!item || item.restaurado) { setPendente(null); return; }
    const { error } = await supabase.from(item.tabela).insert([item.dados]);
    if (error) { alert('Não foi possível desfazer: ' + error.message); return; }
    await supabase.from('lixeira').update({ restaurado: true, restaurado_em: new Date().toISOString() }).eq('id', item.id);
    setPendente(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    onRestaurado?.();
    // Avisa quem mais mantém uma lista dessa tabela em memória (ex: contatos
    // e docs dentro do modal aberto) a recarregar — o registro voltou ao
    // banco, mas o estado local de cada lista só sabe disso ouvindo aqui.
    window.dispatchEvent(new CustomEvent('acn:undo-restaurado', { detail: { tabela: item.tabela } }));
  }, [pendente, onRestaurado]);

  useEffect(() => {
    if (!pendente) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); desfazer(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendente, desfazer]);

  if (!pendente) return null;
  return (
    <div className="acn-lic-undo" role="status">
      <span className="acn-lic-undo-txt"><Icone path={mdiTrashCanOutline} size={16} />{pendente.label} excluído(a).</span>
      <Botao pequeno icone={mdiUndoVariant} onClick={desfazer}>Desfazer (Ctrl+Z)</Botao>
    </div>
  );
}

// Agrupamento por período — calcula, a partir de data_disputa, a chave (pra
// ordenar cronologicamente) e o rótulo (pra mostrar no cabeçalho da seção)
// do bloco de semana/mês/bimestre/trimestre/semestre a que a data pertence.
function bucketPeriodo(dataStr: string, gran: string) {
  // data_disputa é timestamptz — supabase-js retorna ISO completo
  // ("2026-05-20T10:45:00+00:00"), não "YYYY-MM-DD" puro. .slice(0,10)
  // extrai só a data antes de montar meio-dia local (mesmo bug/fix já
  // recorrente neste projeto com outras colunas timestamptz).
  const d = new Date(dataStr.slice(0, 10) + 'T12:00:00');
  const ano = d.getFullYear();
  const mes = d.getMonth(); // 0-11
  if (gran === 'semana') {
    const dow = d.getDay() || 7; // 1=seg..7=dom
    const seg = new Date(d); seg.setDate(d.getDate() - dow + 1);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return { key: diaISO(seg), label: `Semana de ${fmtDataCurta(seg)} a ${fmtDataCurta(dom)}` };
  }
  if (gran === 'mes') {
    return { key: `${ano}-${String(mes + 1).padStart(2, '0')}`, label: `${MESES_NOMES[mes]}/${ano}` };
  }
  if (gran === 'bimestre') {
    const bi = Math.floor(mes / 2);
    return { key: `${ano}-B${bi + 1}`, label: `${MESES_NOMES[bi * 2].slice(0, 3)}-${MESES_NOMES[bi * 2 + 1].slice(0, 3)}/${ano}` };
  }
  if (gran === 'trimestre') {
    const tri = Math.floor(mes / 3);
    return { key: `${ano}-Q${tri + 1}`, label: `${tri + 1}º Trimestre/${ano}` };
  }
  if (gran === 'semestre') {
    const sem = mes < 6 ? 1 : 2;
    return { key: `${ano}-S${sem}`, label: `${sem}º Semestre/${ano}` };
  }
  return { key: '', label: '' };
}

const SORT_OPTIONS = [
  { value:'ultimas_alteracoes',          label:'🔔 Últimas Alterações' },
  { value:'data_disputa',                label:'Data de Disputa' },
  { value:'data_limite_proposta',        label:'Limite de Proposta' },
  { value:'data_limite_analise_tecnica', label:'Limite Análise Técnica' },
  { value:'orgao',                       label:'Órgão' },
  { value:'status',                      label:'Status' },
  { value:'disputa_recente',             label:'Mais Recentes (disputa)' },
];

const TABS_DIREITO = [
  { key:'formacao_precos', label:'💲 Formação de Preços' },
  { key:'processo',     label:'📂 Arquivos de Licitação' },
  { key:'docs_enviados',label:'📤 Documentos Enviados ao Órgão' },
  { key:'contratos',    label:'📋 Fase de Contrato' },
  { key:'atestado',     label:'🏅 Atestados' },
];

// Sub-quadros dentro de "Arquivos de Licitação" — cada um é uma categoria
// própria de licitacao_documentos, com upload/lista/Área Livre independentes
// (mesmo padrão do bloco genérico "DEMAIS ABAS", só que fixo por quadro em
// vez de seguir a aba selecionada). Migração de dados reais já feita: os
// documentos antigos de "impugnacoes" (só a licitação PE 90011.2026 restava
// viva) foram reclassificados por nome de arquivo, e os de "custos" viraram
// edital_anexos.
const SUBQUADROS_ARQUIVOS: { categoria: string; label: string }[][] = [
  // Cotações de Fornecedores foram para o rodapé da aba Formação de Preços; o lugar virou Erratas
  [{ categoria:'edital_anexos', label:'📄 Edital / Anexos' }, { categoria:'erratas', label:'📝 Erratas' }],
  [{ categoria:'impugnacao', label:'⚠️ Impugnações' }, { categoria:'impugnacao_decisao', label:'⚖️ Decisão' }],
  [{ categoria:'esclarecimento', label:'❓ Esclarecimento' }, { categoria:'esclarecimento_resposta', label:'💬 Respostas' }],
  [{ categoria:'recurso', label:'📮 Recursos' }, { categoria:'recurso_defesa', label:'🛡️ Defesa' }, { categoria:'recurso_decisao', label:'⚖️ Decisão' }],
];

// Abas cujas alterações (novo documento/anexo) ficam destacadas na barra de
// abas até o usuário clicar nela.
const TABS_DESTACAVEIS = ['processo','docs_enviados','contratos','atestado'];

const LICIT_VAZIO = {
  numero:'', nome_projeto:'', objeto_principal:'', orgao:'',
  classificacao:'Direta', prioridade:'Média',
  faturamento_empresa:'ACN', operador:'', valor_estimado:'',
  data_limite_esclarecimentos:'', data_limite_proposta:'',
  data_disputa:'',
  data_limite_analise_tecnica:'',
  analista_nome:'', analista_email:'',
  coordenador_nome:'', coordenador_email:'',
  // Novos campos (substituem Objeto Principal/Prioridade no formulário —
  // as colunas antigas continuam existindo no banco por compatibilidade
  // com registros já cadastrados, só pararam de aparecer aqui).
  tipo_objeto:'', julgamento:[] as string[], forma_disputa:'',
};
const JULGAMENTO_OPCOES = ['Item','Lote','Global','Grupo'];
const FORMA_DISPUTA_OPCOES = ['Aberto e Fechado','Aberto','Randômico'];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
// Ano fora de faixa quase sempre e digito a mais (ja houve prazo gravado no
// ano 62026, que virava "Invalid Date" na tela). Barra na hora de salvar.
const ANO_MIN = 2020, ANO_MAX = 2035;
function dataForaDeFaixa(v: any): boolean {
  if (!v) return false;
  const ano = Number(String(v).slice(0, 4));
  return !Number.isFinite(ano) || ano < ANO_MIN || ano > ANO_MAX;
}

const fmtDT = (v: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('pt-BR',{ day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit' });
};
// data_disputa/limites são timestamptz (UTC) no banco, mas os campos
// <input type="datetime-local"> não carregam fuso — o valor exibido/editado
// é sempre hora de Brasília. Sem essas conversões, ao ABRIR pra editar um
// registro já salvo o campo mostrava a hora UTC crua (3h adiantada em
// relação ao que foi realmente lançado, ex: lançou 06:00 e o campo mostrava
// 09:00). Brasil não tem mais horário de verão desde 2019, então -03:00 é
// fixo o ano todo.
const utcParaInputBR = (v: string) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
};
const inputBRParaUtc = (v: string) => v ? `${v}:00-03:00` : null;
const fmtDate = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
};
const diasRestantes = (v: string) => {
  if (!v) return null;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
};
// Destaque do card só no DIA EXATO do pregão, sem antecipação — compara por
// dia civil local (não por diferença de 24h cheias, que erra perto da
// virada do dia; mesmo cuidado com timestamptz já visto neste projeto).
const isDiaDisputa = (v: string) => {
  if (!v) return false;
  const d = new Date(v), hoje = new Date();
  return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
};

// timestamptz do banco (ex: "2026-09-15 10:30:00+00") → formato aceito por
// <input type="datetime-local"> (ex: "2026-09-15T10:30"). Sem isso o input
// recebe um valor inválido e o browser some com a data digitada.
// Máscara de moeda BR: aceita só dígitos digitados (últimos 2 = centavos) e
// devolve { display: "1.234,56", raw: "1234.56" } — raw é o que vai pro banco.
function maskMoedaBR(digitsInput: string): { display: string; raw: string } {
  const digits = digitsInput.replace(/\D/g, '');
  if (!digits) return { display: '', raw: '' };
  const num = parseInt(digits, 10) / 100;
  return { display: num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), raw: String(num) };
}
function fmtMoedaBR(raw: string | number): string {
  if (raw === '' || raw === null || raw === undefined) return '';
  const num = Number(raw);
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  const ext  = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  return safeBase + ext;
}

async function uploadAnexo(file: File, licitacaoId: string, tipo: string): Promise<string|null> {
  const safeName = sanitizeFileName(file.name);
  const path = `licitacoes/${licitacaoId}/${tipo}/${Date.now()}_${safeName}`;
  const contentType = contentTypeUpload(file);
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType });
  if (error || !data) { console.error('Upload erro:', error?.message); return null; }
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

function wppLink(num: string): string {
  const digits = num.replace(/\D/g,'');
  const br = digits.startsWith('55') ? digits : '55' + digits;
  return `https://wa.me/${br}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE DE PRAZO
// ─────────────────────────────────────────────────────────────────────────────
function PrazoBadge({ label, value }: { label:string; value:string }) {
  if (!value) return null;
  const dias = diasRestantes(value);
  const vencido = dias !== null && dias < 0;
  const urgente = dias !== null && dias >= 0 && dias <= 2;
  return (
    <Selo familia={vencido ? 'erro' : urgente ? 'atencao' : 'neutro'} ponto={false}>
      {label}: {fmtDT(value)}
      {vencido && ' ⚠️'}
      {urgente && ` (${dias}d)`}
    </Selo>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTATOS DO PROCESSO
// ─────────────────────────────────────────────────────────────────────────────
function ContatosSection({ licitacaoId, currentUser }) {
  const [contatos, setContatos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [editandoId, setEditandoId] = useState<string|null>(null);
  const contatoVazio = { nome:'', tipo_contato:'', email:'', observacao:'', telefones:[{ numero:'', tipo:'Celular' }] };
  const [form, setForm] = useState<any>(contatoVazio);
  const [erroLeitura, setErroLeitura] = useState('');   // 7.61: leitura que falha não pode parecer "nenhum contato"
  const emAcao = useRef(false);   // 7.61: salvar/excluir uma vez só (o clique duplo gravava duas vezes)

  const fetchContatos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('licitacao_contatos')
      .select('*').eq('licitacao_id', licitacaoId).order('criado_em');
    if (error) { setErroLeitura(error.message); setLoading(false); return; }
    setErroLeitura('');
    setContatos(data || []);
    setLoading(false);
  }, [licitacaoId]);

  useEffect(() => { fetchContatos(); }, [fetchContatos]);

  // Recarrega se um contato excluído foi restaurado via Ctrl+Z (UndoToast).
  useEffect(() => {
    const onRestaurado = (e: any) => { if (e.detail?.tabela === 'licitacao_contatos') fetchContatos(); };
    window.addEventListener('acn:undo-restaurado', onRestaurado);
    return () => window.removeEventListener('acn:undo-restaurado', onRestaurado);
  }, [fetchContatos]);

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const addTelefone = () => setForm((f: any) => ({ ...f, telefones: [...(f.telefones||[]), { numero:'', tipo:'Celular' }] }));
  const setTel = (i: number, k: string, v: string) => setForm((f: any) => {
    const tels = [...(f.telefones||[])];
    tels[i] = { ...tels[i], [k]: v };
    return { ...f, telefones: tels };
  });
  const removeTel = (i: number) => setForm((f: any) => {
    const tels = (f.telefones||[]).filter((_: any, idx: number) => idx !== i);
    return { ...f, telefones: tels.length ? tels : [{ numero:'', tipo:'Celular' }] };
  });

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Nome do contato obrigatório'); return; }
    if (emAcao.current) return;
    emAcao.current = true;
    try { await salvarInterno(); } finally { emAcao.current = false; }
  };
  const salvarInterno = async () => {
    const agora = new Date().toISOString();
    if (editandoId) {
      const { error } = await supabase.from('licitacao_contatos').update({
        nome: form.nome, tipo_contato: form.tipo_contato,
        email: form.email, observacao: form.observacao,
        telefones: form.telefones,
      }).eq('id', editandoId);
      if (error) { alert('Erro: ' + error.message); return; }
      setEditandoId(null);
    } else {
      const { error } = await supabase.from('licitacao_contatos').insert([{
        licitacao_id: licitacaoId,
        nome: form.nome, tipo_contato: form.tipo_contato,
        email: form.email, observacao: form.observacao,
        telefones: form.telefones,
        criado_em: agora,
      }]);
      if (error) { alert('Erro: ' + error.message); return; }
      setAdicionando(false);
    }
    setForm(contatoVazio);
    fetchContatos();
  };

  const excluir = async (id: string) => {
    if (!await confirmar('Remover este contato?')) return;
    if (emAcao.current) return;
    emAcao.current = true;
    try { await excluirComUndo('licitacao_contatos', id, currentUser?.nome || currentUser?.email, (reg) => `Contato "${reg.nome||'—'}"`); } finally { emAcao.current = false; }
    fetchContatos();
  };

  const iniciarEdicao = (c: any) => {
    setEditandoId(c.id);
    setForm({ nome: c.nome||'', tipo_contato: c.tipo_contato||'', email: c.email||'', observacao: c.observacao||'', telefones: c.telefones?.length ? c.telefones : [{ numero:'', tipo:'Celular' }] });
    setAdicionando(false);
  };

  const isMobile = (tipo: string) => tipo === 'Celular' || tipo === 'WhatsApp';

  // NAO voltar a usar isto como componente JSX: por estar definido dentro de
  // ContatosSection, cada render cria uma funcao nova, o React trata como um
  // tipo diferente e desmonta/remonta a arvore inteira. Como o form e
  // controlado, cada tecla disparava setForm -> render -> remount, e o input
  // perdia o foco: era preciso clicar de novo a cada caractere digitado.
  // Chamado como funcao, o JSX entra na arvore do proprio ContatosSection e
  // os inputs mantem identidade entre renders.
  const renderFormContato = () => (
    <div className="acn-quadro acn-lic-form-contato">
      <div className="acn-grade-2">
        <div>
          <label className="acn-label">NOME *</label>
          <input value={form.nome} onChange={e=>setF('nome',e.target.value)} className="acn-input acn-lic-cheio" placeholder="Nome" />
        </div>
        <div>
          <label className="acn-label">TIPO DE CONTATO</label>
          <select value={form.tipo_contato} onChange={e=>setF('tipo_contato',e.target.value)} className="acn-input acn-lic-cheio">
            <option value="">Selecione...</option>
            {TIPO_CONTATO_OPCOES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="acn-label">E-MAIL</label>
        <input type="email" value={form.email} onChange={e=>setF('email',e.target.value)} className="acn-input acn-lic-cheio" placeholder="email@exemplo.com" />
      </div>
      <div>
        <div className="acn-label acn-lic-tel-cab">
          <span>TELEFONES</span>
          <Botao pequeno icone={mdiPlus} onClick={addTelefone}>Adicionar</Botao>
        </div>
        {(form.telefones||[]).map((tel: any, i: number) => (
          <div key={i} className="acn-lic-tel-linha">
            <input value={tel.numero} onChange={e=>setTel(i,'numero',e.target.value)}
              className="acn-input acn-lic-tel-num" placeholder="(11) 99999-9999" />
            <select value={tel.tipo} onChange={e=>setTel(i,'tipo',e.target.value)} className="acn-input acn-lic-tel-tipo">
              <option>Celular</option><option>Fixo</option><option>WhatsApp</option>
            </select>
            {(form.telefones||[]).length > 1 && (
              <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover telefone" aria-label="Remover telefone" onClick={()=>removeTel(i)} />
            )}
          </div>
        ))}
      </div>
      <div>
        <label className="acn-label">OBSERVAÇÃO</label>
        <RichTextInput value={form.observacao} onChange={html=>setF('observacao',html)}
          style={{ width:'100%' }} minHeight={40} placeholder="Observações... (selecione um trecho pra formatar)" />
      </div>
      <div className="acn-lic-form-botoes">
        <Botao variante="primario" icone={editandoId ? mdiContentSaveOutline : mdiPlus} className="acn-lic-cresce" onClick={salvar}>
          {editandoId ? 'Salvar' : 'Adicionar'}
        </Botao>
        <Botao onClick={() => { setAdicionando(false); setEditandoId(null); setForm(contatoVazio); }}>
          Cancelar
        </Botao>
      </div>
    </div>
  );

  return (
    <div className="acn-lic-contatos">
      <div className="acn-lic-contatos-cab">
        <Botao variante="discreto" pequeno icone={expandido ? mdiChevronDown : mdiChevronRight} aria-expanded={expandido} onClick={() => setExpandido(e => !e)}>
          CONTATOS DO PROCESSO {contatos.length > 0 ? `(${contatos.length})` : ''}
        </Botao>
        {expandido && !adicionando && !editandoId && (
          <Botao pequeno icone={mdiPlus} onClick={() => { setAdicionando(true); setEditandoId(null); setForm(contatoVazio); }}>
            Contato
          </Botao>
        )}
      </div>

      {expandido && (
        <div>
          {(adicionando && !editandoId) && renderFormContato()}

          {loading && <div className="acn-ajuda acn-lic-centro">Carregando...</div>}

          {erroLeitura && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={fetchContatos}>Tentar de novo</Botao>}>Não foi possível ler os contatos ({erroLeitura}). Isso não quer dizer que não haja contato cadastrado.</Faixa>
          )}

          {contatos.map((c: any) => (
            <div key={c.id}>
              {editandoId === c.id ? renderFormContato() : (
                <div className="acn-lic-contato">
                  <div className="acn-lic-contato-corpo">
                    <div className="acn-lic-contato-nome">
                      <span className="acn-forte">{c.nome}</span>
                      {c.tipo_contato && <Selo familia="info" ponto={false}>{c.tipo_contato}</Selo>}
                    </div>
                    {c.email && (
                      <div>
                        <a href={`mailto:${c.email}`} className="acn-lic-link-info"><Icone path={mdiEmailOutline} size={14} />{c.email}</a>
                      </div>
                    )}
                    {(c.telefones||[]).length > 0 && (
                      <div className="acn-lic-tels">
                        {(c.telefones||[]).map((tel: any, i: number) => (
                          <span key={i} className="acn-lic-tel">
                            {isMobile(tel.tipo) ? (
                              <a href={wppLink(tel.numero)} target="_blank" rel="noreferrer" className="acn-lic-link-ok">
                                <Icone path={mdiCellphone} size={14} />{tel.numero}
                              </a>
                            ) : (
                              <span className="acn-lic-tel-fixo"><Icone path={mdiPhoneOutline} size={14} />{tel.numero}</span>
                            )}
                            <span className="acn-ajuda">({tel.tipo})</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {c.observacao && <div className="acn-ajuda acn-lic-contato-obs" dangerouslySetInnerHTML={{ __html: htmlSeguro(c.observacao) }} />}
                  </div>
                  <div className="acn-lic-contato-acoes">
                    <Botao variante="discreto" pequeno icone={mdiPencilOutline} title="Editar contato" aria-label="Editar contato" onClick={() => iniciarEdicao(c)} />
                    <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover contato" aria-label="Remover contato" onClick={() => excluir(c.id)} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loading && contatos.length === 0 && !adicionando && !erroLeitura && (
            <div className="acn-ajuda acn-lic-centro">Nenhum contato cadastrado.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ÁREA LIVRE POR ABA — editor rico com suporte a tabelas coladas do Excel/Word
// Salva em licitacoes.areas_livres[tabKey] como HTML
// ─────────────────────────────────────────────────────────────────────────────
// Ferramentas da barra da Área Livre — cada uma tem o comando do navegador, o ícone e o nome para quem usa leitor de tela
const FERRAMENTAS_AREA_LIVRE = [
  { cmd: 'bold',          rot: 'Negrito',    icone: mdiFormatBold },
  { cmd: 'italic',        rot: 'Itálico',    icone: mdiFormatItalic },
  { cmd: 'underline',     rot: 'Sublinhado', icone: mdiFormatUnderline },
  { cmd: 'strikeThrough', rot: 'Tachado',    icone: mdiFormatStrikethrough },
] as const;

function AreaLivre({ licitacaoId, tabKey, areasLivres, onAreasLivresChange, currentUser, naoLida }: any) {
  const editorRef  = useRef<any>(null);
  const imgInputRef = useRef<any>(null);
  const corTextoRef = useRef<any>(null);
  const corDestaqueRef = useRef<any>(null);
  const savedRangeRef = useRef<Range|null>(null);
  const timerRef   = useRef<any>(null);

  // O <input type="color"> nativo rouba o foco do editor ao abrir — sem isso
  // a seleção de texto se perde e a cor não teria o que colorir. Salva a
  // seleção antes de abrir o picker, restaura antes de aplicar a cor.
  const salvarSelecao = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restaurarSelecaoEAplicar = (cmd: string, valor: string) => {
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
  };
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo]       = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');   // 7.61: o autosave que falhava não dizia nada — a pessoa seguia digitando achando que estava gravado

  // Carrega conteúdo quando muda aba ou licitação
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = (areasLivres || {})[tabKey] || '';
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [tabKey, licitacaoId]);

  const salvarConteudo = async () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    setSalvando(true);
    const novasAreas = { ...(areasLivres || {}), [tabKey]: html };
    const { error } = await supabase.from('licitacoes')
      .update({ areas_livres: novasAreas, atualizado_em: new Date().toISOString() })
      .eq('id', licitacaoId);
    setSalvando(false);
    setErroSalvar(error ? error.message : '');
    if (!error) {
      onAreasLivresChange(novasAreas);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
      if (currentUser) {
        const campo = `area_livre_${tabKey}`;
        logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licitacaoId, changeType: 'UPDATE',
          oldRow: { [campo]: null }, newRow: { [campo]: 'editada' }, user: currentUser,
          formatters: { [campo]: () => '📝 Área Livre editada' } });
      }
    }
  };

  const autosave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(salvarConteudo, 1500);
  };

  const salvarAgora = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    salvarConteudo();
  };

  const inserirImagem = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `licitacoes/${licitacaoId}/area-livre/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (error) { alert('Erro ao inserir imagem: ' + error.message); return; }
    const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
    const url = urlData?.publicUrl;
    if (!url) return;
    document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;border-radius:4px;margin:4px 0" />`);
    autosave();
  };

  // Insere uma tabela em branco, editável célula a célula (mesmo <table>
  // contentEditable que já funciona pra tabelas coladas do Excel/Word —
  // ver handlePaste abaixo e o CSS .licit-area-livre table).
  const inserirTabela = async () => {
    const linhasStr = await pedirTexto('Quantas linhas?', '3');
    if (linhasStr === null) return;
    const colunasStr = await pedirTexto('Quantas colunas?', '3');
    if (colunasStr === null) return;
    const linhas  = Math.max(1, Math.min(50, parseInt(linhasStr, 10)  || 3));
    const colunas = Math.max(1, Math.min(20, parseInt(colunasStr, 10) || 3));
    let html = '<table><tbody>';
    for (let r = 0; r < linhas; r++) {
      html += '<tr>' + '<td>&nbsp;</td>'.repeat(colunas) + '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    autosave();
  };

  // Exclui a tabela onde o cursor/seleção está posicionado — antes não existia
  // NENHUMA forma de remover uma tabela já inserida (só dava pra criar).
  const excluirTabela = async () => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const el = anchor && (anchor.nodeType === 3 ? anchor.parentElement : (anchor as HTMLElement));
    const tabela = el?.closest?.('table');
    if (!tabela || !editorRef.current?.contains(tabela)) {
      alert('Posicione o cursor dentro de uma tabela para excluí-la.');
      return;
    }
    if (!await confirmar('Excluir esta tabela? Esta ação não pode ser desfeita.')) return;
    tabela.remove();
    autosave();
  };

  const handlePaste = (e: any) => {
    const items = Array.from(e.clipboardData?.items || []);
    // Se há HTML no clipboard (Excel/Word), deixa o browser colar a tabela
    const hasHtml = items.some((i: any) => i.type === 'text/html');
    const imageItem = items.find((i: any) => i.type.startsWith('image/')) as any;
    if (imageItem && !hasHtml) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) inserirImagem(file);
    }
    // else: browser lida — tabelas HTML do Excel colam e ficam editáveis
    setTimeout(autosave, 100);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className={'acn-lic-area' + (naoLida ? ' nao-lida' : '')}>
      {/* Toolbar */}
      <div className="acn-lic-area-barra">
        <span className="acn-lic-area-tit"><Icone path={mdiPencilOutline} size={14} />Área Livre</span>
        {FERRAMENTAS_AREA_LIVRE.map(f => (
          <Botao key={f.cmd} pequeno icone={f.icone} title={f.rot} aria-label={f.rot}
            onMouseDown={e => { e.preventDefault(); document.execCommand(f.cmd); }} />
        ))}
        {/* Cor de texto e destaque/pintado — reaproveita o padrão de input
            escondido já usado para inserir imagem (imgInputRef abaixo). */}
        <Botao pequeno icone={mdiPalette} title="Cor do texto" aria-label="Cor do texto"
          onMouseDown={e => { e.preventDefault(); salvarSelecao(); corTextoRef.current?.click(); }} />
        <input ref={corTextoRef} type="color" className="acn-lic-oculto"
          onChange={e => { restaurarSelecaoEAplicar('foreColor', e.target.value); autosave(); }} />
        <Botao pequeno icone={mdiFormatColorHighlight} title="Destacar / pintar fundo do texto" aria-label="Destacar o texto"
          onMouseDown={e => { e.preventDefault(); salvarSelecao(); corDestaqueRef.current?.click(); }} />
        <input ref={corDestaqueRef} type="color" className="acn-lic-oculto"
          onChange={e => { restaurarSelecaoEAplicar('hiliteColor', e.target.value); autosave(); }} />
        <Botao pequeno icone={mdiLinkVariant} title="Inserir link" aria-label="Inserir link"
          onMouseDown={async e => {
            e.preventDefault();
            const url = await pedirTexto('URL do link:');
            if (url) document.execCommand('createLink', false, url);
          }} />
        <Botao pequeno icone={mdiImageOutline} title="Inserir imagem" aria-label="Inserir imagem"
          onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click(); }} />
        <input ref={imgInputRef} type="file" accept="image/*" className="acn-lic-oculto"
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagem(f); e.target.value = ''; }} />
        <Botao pequeno icone={mdiTablePlus} title="Inserir tabela editável" aria-label="Inserir tabela"
          onMouseDown={e => { e.preventDefault(); inserirTabela(); }} />
        <Botao pequeno variante="perigo-sec" icone={mdiTableRemove} title="Excluir tabela (posicione o cursor dentro dela)" aria-label="Excluir tabela"
          onMouseDown={e => { e.preventDefault(); excluirTabela(); }} />
        <div className="acn-lic-cresce" />
        {salvando && <span className="acn-txt-atencao">Salvando...</span>}
        {salvo && !salvando && <span className="acn-txt-ok acn-lic-estado"><Icone path={mdiCheck} size={14} />Salvo</span>}
        {erroSalvar && !salvando && <span className="acn-txt-erro acn-lic-estado" title={erroSalvar}><Icone path={mdiAlertOutline} size={14} />NÃO salvou: {erroSalvar}</span>}
        {/* Discreto de propósito — já autosalva 1.5s após parar de digitar; o
            botão em destaque da tela é "Salvar Alterações" (registro
            inteiro), este aqui só força salvar antes desse intervalo. */}
        <Botao variante="discreto" pequeno icone={mdiContentSaveOutline} onClick={salvarAgora} disabled={salvando}
          title="Forçar salvar agora (já autosalva sozinho)" aria-label="Salvar agora" />
      </div>
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="licit-area-livre"
        onInput={autosave}
        onPaste={handlePaste}
        data-placeholder="Notas livres, cole tabelas do Excel, imagens, links..."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-QUADRO DE DOCUMENTOS — usado dentro de "Arquivos de Licitação", um por
// categoria fixa (edital_anexos, impugnacao, impugnacao_decisao, etc). Autônomo
// (upload/lista/exclusão próprios) porque vários quadros ficam
// visíveis ao mesmo tempo na tela, ao contrário do bloco genérico de
// documentos que segue a aba única selecionada (tabDir).
// ─────────────────────────────────────────────────────────────────────────────
function SubQuadroDocumentos({ licitacaoId, categoria, label, currentUser, podeExcluir, areasLivres, onAreasLivresChange, itemNaoLido, areaLivreNaoLida }: any) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadDesc, setUploadDesc] = useState('');
  const [salvando, setSalvando] = useState(false);
  const uploadRef = useRef<any>(null);
  const [erroLeitura, setErroLeitura] = useState('');   // 7.61: leitura que falha não pode parecer "nenhum documento"
  const emAcao = useRef(false);   // 7.61: adicionar/excluir uma vez só

  const htmlAntigo = (areasLivres || {})[`processo:${categoria}`] || '';
  const temLetra = htmlAntigo.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
  const textoAntigo = temLetra ? htmlAntigo : '';

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('licitacao_documentos').select('*')
      .eq('licitacao_id', licitacaoId).eq('categoria', categoria)
      .order('criado_em', { ascending: false });
    if (error) { setErroLeitura(error.message); setLoading(false); return; }
    setErroLeitura('');
    setDocs(data || []);
    setLoading(false);
  }, [licitacaoId, categoria]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Recarrega se um documento excluído deste quadro foi restaurado via
  // Ctrl+Z (UndoToast) — o evento não sabe a categoria, então sempre
  // recarrega quando a tabela bate; é uma query leve.
  useEffect(() => {
    const onRestaurado = (e: any) => { if (e.detail?.tabela === 'licitacao_documentos') fetchDocs(); };
    window.addEventListener('acn:undo-restaurado', onRestaurado);
    return () => window.removeEventListener('acn:undo-restaurado', onRestaurado);
  }, [fetchDocs]);

  const salvar = async () => {
    if (uploadFiles.length === 0 && !uploadDesc.trim()) return;
    if (emAcao.current) return;
    emAcao.current = true;
    setSalvando(true);
    const agora = new Date().toISOString();
    const autor = currentUser?.nome || currentUser?.email || 'Usuário';
    const falhas: string[] = [];
    try {
      if (uploadFiles.length === 0 && uploadDesc.trim()) {
        const { data: novoDoc, error: erroDoc } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licitacaoId, categoria,
          nome: uploadDesc.slice(0,80) || 'Documento',
          url: null, conteudo: uploadDesc.trim(),
          criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
        }]).select('id').single();
        // 7.61: o erro era ignorado e o histórico de alterações registrava um anexo que não existia
        if (erroDoc) { alert('Erro: ' + erroDoc.message); return; }
        logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licitacaoId, changeType: 'UPDATE',
          oldRow: { processo: null }, newRow: { processo: (uploadDesc.slice(0,80) || 'Documento') }, user: currentUser,
          formatters: { processo: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id, categoria } });
      } else {
        for (const file of uploadFiles) {
          const url = await uploadAnexo(file, licitacaoId, categoria);
          // 7.61: o envio que falhava devolvia vazio e o documento era registrado SEM arquivo, só com o nome
          if (!url) { falhas.push(file.name + ' (o envio do arquivo falhou)'); continue; }
          const { data: novoDoc, error: erroDoc } = await supabase.from('licitacao_documentos').insert([{
            licitacao_id: licitacaoId, categoria, nome: file.name, url,
            conteudo: uploadDesc.trim() || null,
            criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
          }]).select('id').single();
          if (erroDoc) { falhas.push(file.name + ' (' + erroDoc.message + ')'); continue; }
          logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licitacaoId, changeType: 'UPDATE',
            oldRow: { processo: null }, newRow: { processo: file.name }, user: currentUser,
            formatters: { processo: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id, categoria } });
        }
      }
      if (falhas.length) alert('Estes arquivos NÃO foram anexados: ' + falhas.join('; ') + '.');
      setUploadFiles([]);
      setUploadDesc('');
      if (uploadRef.current) uploadRef.current.value = '';
      await fetchDocs();
    } finally {
      setSalvando(false);
      emAcao.current = false;
    }
  };

  const excluir = async (d: any) => {
    if (!podeExcluir) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!await confirmar('Remover este registro?')) return;
    if (emAcao.current) return;
    emAcao.current = true;
    try { await excluirComUndo('licitacao_documentos', d.id, currentUser?.nome || currentUser?.email, label); } finally { emAcao.current = false; }
    fetchDocs();
  };

  return (
    <div className="acn-lic-docs">
      <div className="acn-forte">{label}</div>
      <input type="file" ref={uploadRef} multiple
        accept={`.pdf,.doc,.docx,${EXT_PLANILHAS},.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar`}
        onChange={e => setUploadFiles(Array.from(e.target.files||[]))}
        className="acn-lic-arquivo" />
      {uploadFiles.length > 0 && <div className="acn-lic-doc-anexos"><Icone path={mdiPaperclip} size={13} />{uploadFiles.length} arquivo(s)</div>}
      <input type="text" placeholder="Descrição / legenda (opcional)" value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
        className="acn-input acn-lic-cheio" />
      <Botao variante="primario" pequeno icone={mdiPlus} className="acn-lic-doc-add" onClick={salvar} disabled={salvando||(uploadFiles.length===0&&!uploadDesc.trim())}>
        {salvando ? 'Salvando...' : 'Adicionar'}
      </Botao>
      {loading && <div className="acn-ajuda acn-lic-centro">Carregando...</div>}
      {erroLeitura && <Faixa tom="erro" acao={<Botao pequeno onClick={fetchDocs}>Tentar de novo</Botao>}>Não foi possível ler os documentos ({erroLeitura}). Isso não quer dizer que não haja nenhum.</Faixa>}
      {!loading && docs.length === 0 && !erroLeitura && <div className="acn-ajuda acn-lic-centro">Nenhum documento.</div>}
      {docs.map(d => (
        <div key={d.id} className={'acn-lic-doc' + (itemNaoLido?.(d.id) ? ' nao-lido' : '')}>
          <div className="acn-lic-doc-corpo">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="acn-lic-link-info acn-lic-doc-link"><Icone path={mdiPaperclip} size={13} />{d.nome}</a>
            ) : (
              <div className="acn-forte">{d.nome}</div>
            )}
            {d.conteudo && <div className="acn-ajuda acn-lic-doc-txt"><Linkify text={d.conteudo} /></div>}
            <div className="acn-ajuda acn-lic-doc-meta"><Icone path={mdiAccountOutline} size={12} />{d.criado_por_nome||'—'} · <Icone path={mdiClockOutline} size={12} />{fmtDT(d.criado_em)}</div>
          </div>
          {podeExcluir && (
            <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover documento" aria-label="Remover documento" onClick={()=>excluir(d)} />
          )}
        </div>
      ))}
      {/* Sem campo de texto livre nesta aba, a pedido do usuário: aqui é só
          arquivo. Mas 3 licitações tinham texto escrito na antiga "Área Livre"
          destes quadros (uma tabela de itens colada do Excel, inclusive), e
          apagar o editor sem mais nada deixaria esse conteúdo invisível. Então
          o que já existe aparece para LEITURA; não dá mais para escrever.
          Nada foi apagado do banco (licitacoes.areas_livres). */}
      {textoAntigo && (
        <div className="acn-lic-antiga">
          <div className="acn-quadro-titulo">
            Anotação antiga (somente leitura)
          </div>
          <div className="acn-lic-antiga-corpo" dangerouslySetInnerHTML={{ __html: htmlSeguro(textoAntigo) }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE
// ─────────────────────────────────────────────────────────────────────────────
// Quadro no formulário da licitação (lado esquerdo): valor de cada lote e o
// unitário do lote (soma dos unitários dos itens) da ÚLTIMA versão da formação
// de preços vinculada. Só leitura; atualiza sozinho quando a formação é salva.
function QuadroFormacaoLicitacao({ licitacaoId }: any) {
  const [cot, setCot] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data: vinc } = await supabase.from('cotacoes_precos_vinculos')
      .select('cotacao_id').eq('tipo', 'licitacao').eq('processo_id', licitacaoId);
    const ids = [...new Set((vinc || []).map((v: any) => v.cotacao_id))];
    if (!ids.length) { setCot(null); setCarregando(false); return; }
    const { data } = await supabase.from('cotacoes_precos')
      .select('id,nome,versao,criado_em,atualizado_em,itens,parametros_globais,status').in('id', ids);
    const ultima = [...(data || [])].sort((a: any, b: any) =>
      (b.versao || 1) - (a.versao || 1) || String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;
    setCot(ultima);
    setCarregando(false);
  }, [licitacaoId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const h = (e: any) => { if (!e.detail?.vinculo || e.detail.vinculo.id === licitacaoId) carregar(); };
    window.addEventListener('acn:formacao-salva', h);
    return () => window.removeEventListener('acn:formacao-salva', h);
  }, [carregar, licitacaoId]);

  if (carregando || !cot) return null;
  const est = estruturaFormacao(cot.itens || [], cot.parametros_globais || {}, calcItem);
  if (!est.lotes.length) return null;
  const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <div className="acn-quadro tom-info acn-lic-formacao">
      <div className="acn-lic-formacao-cab">
        <span className="acn-quadro-titulo">Formação de preços</span>
        <span className="acn-ajuda">
          v{cot.versao || 1}{cot.nome ? ` · ${cot.nome}` : ''}{cot.status === 'finalizada' ? ' · final' : ''}
        </span>
      </div>
      <table className="acn-lic-mini">
        <thead>
          <tr>
            <th className="esq">Lote</th>
            <th className="dir" title="Soma do unitário de cada item do lote">Valor unitário</th>
            <th className="dir">Valor do lote</th>
          </tr>
        </thead>
        <tbody>
          {est.lotes.map((l: any) => (
            <tr key={l.nome}>
              <td className="esq acn-forte">{l.nome}</td>
              <td className="dir">{brl(l.unit.totVendas)}</td>
              <td className="dir acn-forte acn-txt-info">{brl(l.total.totVendas)}</td>
            </tr>
          ))}
          {est.lotes.length > 1 && (
            <tr className="total">
              <td className="esq acn-forte">Total</td>
              <td />
              <td className="dir acn-forte acn-txt-info">{brl(est.geral.totVendas)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Colunas da lista de licitações — todas menos areas_livres (ver fetchLicit).
const COLUNAS_LISTA_LICITACOES = 'id,numero,nome_projeto,objeto_principal,orgao,classificacao,status,marcadores,prioridade,'
  + 'data_registro,data_limite_esclarecimentos,data_limite_proposta,data_disputa,data_limite_analise_tecnica,'
  + 'analista_nome,analista_email,coordenador_nome,coordenador_email,obs_encerramento,historico,criado_por,criado_por_nome,'
  + 'criado_em,atualizado_em,faturamento_empresa,operador,valor_estimado,horario_sessao,tipo_objeto,julgamento,forma_disputa,'
  + 'fluxo_entrega,destino_cidade,destino_uf,destino_cep,prazo_entrega,epp,temperatura';

function LicitacaoModal({ licit: licitProp, currentUser, onClose, onRefresh, onExcluir }) {
  const [licit, setLicit] = useState<any>(licitProp);

  // Marcadores têm estado PRÓPRIO. `licit` acima é uma cópia tirada só na
  // abertura do card e nunca é atualizada, então ler os marcadores dele dava
  // dois defeitos: (1) o botão não acendia ao clicar — só ao fechar e abrir de
  // novo; (2) perda de dado — marcar "Em Recurso" e depois "Pegar ATA"
  // gravava só "Pegar ATA", porque o segundo clique partia da lista congelada.
  // O ref guarda sempre a lista mais recente, mesmo com cliques seguidos antes
  // de o React re-renderizar.
  // A coluna é jsonb: um valor que não seja lista (objeto, texto) derrubaria
  // a tela. Hoje os 59 registros são listas, mas um só fora do formato basta.
  const marcadoresIniciais = Array.isArray(licitProp?.marcadores) ? licitProp.marcadores : [];
  const [marcadores, setMarcadores] = useState<string[]>(marcadoresIniciais);
  const marcadoresRef = useRef<string[]>(marcadoresIniciais);
  // Gravações em fila: duas requisições em paralelo podem chegar ao banco fora
  // de ordem, e a mais antiga sobrescreveria a mais nova.
  const filaMarcadoresRef = useRef<Promise<any>>(Promise.resolve());

  // ── auditoria/colaboração (mesmo padrão do CRM, ver AuditSystem.tsx) ───────
  const { camposNaoLidos, naoLidos } = useUnreadChanges('licitacoes', licit?.id, currentUser);
  // Um item de lista (comentário, documento) é "não lido" se existe uma linha em
  // audit_log com metadata.ref_id apontando pro id dele — ver salvarAndamento/
  // salvarDoc/SubQuadroDocumentos.salvar, que gravam esse vínculo ao salvar.
  const itemNaoLido = (itemId: string) => naoLidos.some((n: any) => n.metadata?.ref_id === itemId);
  const marcarComoLidoAudit = useMarkAsRead('licitacoes', licit?.id, currentUser);
  // Caixa de destaque sutil em volta do campo inteiro (rótulo + input) quando ele
  // mudou e ainda não foi visto por este usuário — mesma receita do CRM.
  const campoCls = (field: string, extra = '') =>
    'acn-lic-campo' + (extra ? ' ' + extra : '') + (camposNaoLidos.has(field) ? ' nao-lido' : '');
  // Fecha o modal marcando como lido — nunca automaticamente no mount, só ao
  // sair da tela. O card na lista (useUnreadMap) se limpa sozinho via Realtime
  // em entity_views, sem precisar de callback direto pra cá.
  const fecharModal = () => { marcarComoLidoAudit(); onClose(); };

  // ── Resize do painel ──────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(40);
  // dividido / só formulário / só abas — ver ModoSplit.tsx (esconde sem desmontar)
  const [modoSplit, setModoSplit] = useModoSplit('licitacao');
  const estSplit = estilosSplit(modoSplit, leftWidth, 260);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<any>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // ── Minimizar ─────────────────────────────────────────────────────────────
  const [minimized, setMinimized] = useState(false);

  // ── LEFT FORM ─────────────────────────────────────────────────────────────
  const [formEdit, setFormEdit] = useState<any>({
    ...licit,
    data_limite_esclarecimentos: utcParaInputBR(licit.data_limite_esclarecimentos),
    data_limite_proposta:        utcParaInputBR(licit.data_limite_proposta),
    data_disputa:                utcParaInputBR(licit.data_disputa),
    data_limite_analise_tecnica: utcParaInputBR(licit.data_limite_analise_tecnica),
  });
  const [salvandoForm, setSalvandoForm] = useState(false);
  const setF = (k: string, v: any) => setFormEdit((f: any) => ({ ...f, [k]: v }));

  // ── Áreas livres ──────────────────────────────────────────────────────────
  // Vindo da lista, a licitação chega sem areas_livres (pesado) — busca aqui.
  // Enquanto não chegou fica null e a Área Livre não aparece: salvar sobre um
  // objeto vazio apagaria o texto das outras áreas.
  const [areasLivres, setAreasLivres] = useState<any>(licitProp.areas_livres === undefined ? null : (licitProp.areas_livres || {}));
  const [erroAreas, setErroAreas] = useState('');
  useEffect(() => {
    if (licitProp.areas_livres !== undefined) return;
    let vivo = true;
    supabase.from('licitacoes').select('areas_livres').eq('id', licitProp.id).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        // 7.61: a leitura que falhava virava "{}" — exatamente o que o comentário acima manda evitar: o próximo salvamento da Área Livre
        // gravava um objeto sem as outras áreas e APAGAVA o texto delas. Falhou, fica null e a Área Livre não abre.
        if (error) { setErroAreas(error.message); return; }
        setErroAreas('');
        setAreasLivres(data?.areas_livres || {});
      });
    return () => { vivo = false; };
  }, [licitProp.id]);

  // ── ANDAMENTO — agora fixo abaixo do formulário da esquerda, não é mais aba ─
  const [andDocs, setAndDocs] = useState<any[]>([]);
  const [andDocsLegacy, setAndDocsLegacy] = useState<any[]>([]);
  const [loadingAndDocs, setLoadingAndDocs] = useState(false);
  const [novoText, setNovoText] = useState('');
  const [novoAnexoFiles, setNovoAnexoFiles] = useState<File[]>([]);
  const [salvandoAndamento, setSalvandoAndamento] = useState(false);
  const [editandoDocId, setEditandoDocId] = useState<string|null>(null);
  const [editandoDocTexto, setEditandoDocTexto] = useState('');
  const novoAnexoRef = useRef<any>(null);
  // Recolhido por padrão, mesmo padrão hide/show de CONTATOS DO PROCESSO —
  // histórico é consulta ocasional, não precisa ocupar espaço sempre.
  const [historicoExpandido, setHistoricoExpandido] = useState(false);

  // ── RIGHT PANEL ───────────────────────────────────────────────────────────
  const [tabDir, setTabDir] = useState<string>('processo');
  // A Formação de Preços continua montada (escondida) depois de aberta: trocar
  // de aba desmontava o componente e a edição ainda não salva (ex.: markup) sumia.
  const [formacaoMontada, setFormacaoMontada] = useState(false);
  useEffect(() => { if (tabDir === 'formacao_precos') setFormacaoMontada(true); }, [tabDir]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [salvandoDoc, setSalvandoDoc] = useState(false);
  const [uploadDesc, setUploadDesc] = useState('');
  const uploadRef = useRef<any>(null);

  // ── Abas destacadas (alteração desde a última vez que o usuário abriu a aba)
  const [abaAlteracoes, setAbaAlteracoes] = useState<Record<string,string>>({}); // categoria -> última alteração
  const [abaLidoEm, setAbaLidoEm] = useState<Record<string,string>>({});         // categoria -> última leitura do usuário

  // ── Status / fluxo ────────────────────────────────────────────────────────
  const [showModalSolicitar, setShowModalSolicitar] = useState(false);
  const [showAcoesVencida, setShowAcoesVencida] = useState(false);
  const [modalCompraAberto, setModalCompraAberto] = useState(false);
  const [pedidoEmitido, setPedidoEmitido] = useState<string|null>(null);
  const [salvando, setSalvando] = useState(false);
  const [obsEncerramento, setObsEncerramento] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<string|null>(null);
  // 7.61: uma ação por vez nos botões que gravam — o estado `salvando` só muda no desenho seguinte e o clique duplo gravava duas vezes
  const emAcao = useRef(new Set<string>());
  const umaVez = (chave: string, fn: (...a: any[]) => Promise<any>) => async (...args: any[]) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };
  const [erroDocs, setErroDocs] = useState('');
  const [erroAndamento, setErroAndamento] = useState('');

  const isAdmin = true;
  const isAnalista = true;
  const podeExcluirAnexos = currentUser?.pode_deletar_anexos === true || isAdmin;

  // ── Drag resize ───────────────────────────────────────────────────────────
  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.getBoundingClientRect().width;
      const dx = e.clientX - dragStartX.current;
      const newW = Math.min(70, Math.max(25, dragStartWidth.current + (dx / containerW) * 100));
      setLeftWidth(newW);
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [isDragging]);

  // ── Fetch docs (abas de documentos) ──
  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase.from('licitacao_documentos')
      .select('*').eq('licitacao_id', licit.id).eq('categoria', tabDir)
      .order('criado_em', { ascending: false });
    if (error) { setErroDocs(error.message); setLoadingDocs(false); return; }   // 7.61: lia como "nenhum documento"
    setErroDocs('');
    setDocs(data || []);
    setLoadingDocs(false);
  }, [licit.id, tabDir]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Fetch Andamento (sempre visível, abaixo do formulário — não é mais aba) ─
  const fetchAndamento = useCallback(async () => {
    setLoadingAndDocs(true);
    const [novosRes, legacyRes] = await Promise.all([
      supabase.from('licitacao_documentos').select('*')
        .eq('licitacao_id', licit.id).eq('categoria', 'andamento')
        .order('criado_em', { ascending: false }),
      supabase.from('licitacao_anexos').select('*')
        .eq('licitacao_id', licit.id).eq('tipo', 'andamento')
        .order('criado_em', { ascending: false }),
    ]);
    if (novosRes.error || legacyRes.error) { setErroAndamento((novosRes.error || legacyRes.error).message); setLoadingAndDocs(false); return; }   // 7.61: lia como "nenhum andamento"
    setErroAndamento('');
    setAndDocs(novosRes.data || []);
    setAndDocsLegacy(legacyRes.data || []);
    setLoadingAndDocs(false);
  }, [licit.id]);

  useEffect(() => { fetchAndamento(); }, [fetchAndamento]);

  // Recarrega docs/andamento se um registro excluído foi restaurado via
  // Ctrl+Z (UndoToast) — inclui licitacao_anexos (formato legado).
  useEffect(() => {
    const onRestaurado = (e: any) => {
      if (['licitacao_documentos','licitacao_anexos'].includes(e.detail?.tabela)) { fetchDocs(); fetchAndamento(); }
    };
    window.addEventListener('acn:undo-restaurado', onRestaurado);
    return () => window.removeEventListener('acn:undo-restaurado', onRestaurado);
  }, [fetchDocs, fetchAndamento]);

  // ── Fetch alterações por aba (destaque na barra de abas) ────────────────────
  const fetchAbaAlteracoes = useCallback(async () => {
    const [docsRes, leiturasRes] = await Promise.all([
      supabase.from('licitacao_documentos')
        .select('categoria, criado_em, atualizado_em')
        .eq('licitacao_id', licit.id)
        .in('categoria', TABS_DESTACAVEIS),
      currentUser?.email
        ? supabase.from('registro_leituras')
            .select('registro_id, lido_em')
            .eq('tabela', 'licitacao_aba')
            .eq('usuario_email', currentUser.email)
            .in('registro_id', TABS_DESTACAVEIS.map(c => `${licit.id}:${c}`))
        : Promise.resolve({ data: [] }),
    ]);
    const maxPorCategoria: Record<string,string> = {};
    (docsRes.data || []).forEach((d: any) => {
      const ts = d.atualizado_em || d.criado_em;
      if (!ts) return;
      if (!maxPorCategoria[d.categoria] || new Date(ts) > new Date(maxPorCategoria[d.categoria])) {
        maxPorCategoria[d.categoria] = ts;
      }
    });
    const lidoMap: Record<string,string> = {};
    (leiturasRes.data || []).forEach((r: any) => {
      const cat = r.registro_id.split(':')[1];
      lidoMap[cat] = r.lido_em;
    });
    setAbaAlteracoes(maxPorCategoria);
    setAbaLidoEm(lidoMap);
  }, [licit.id, currentUser?.email]);

  useEffect(() => { fetchAbaAlteracoes(); }, [fetchAbaAlteracoes]);

  const isAbaDestacada = (key: string) => {
    const alterado = abaAlteracoes[key];
    if (!alterado) return false;
    const lido = abaLidoEm[key];
    if (!lido) return true;
    return new Date(alterado) > new Date(lido);
  };

  const marcarAbaLida = async (key: string) => {
    if (!TABS_DESTACAVEIS.includes(key) || !currentUser?.email || !isAbaDestacada(key)) return;
    const agora = new Date().toISOString();
    await supabase.from('registro_leituras').upsert({
      tabela: 'licitacao_aba',
      registro_id: `${licit.id}:${key}`,
      usuario_email: currentUser.email,
      lido_em: agora,
    }, { onConflict: 'tabela,registro_id,usuario_email' });
    setAbaLidoEm(prev => ({ ...prev, [key]: agora }));
  };

  // Marca a aba ativa como lida sempre que ela tiver alteração pendente — cobre
  // tanto a aba padrão ao abrir o modal (nunca passa pelo onClick da aba) quanto
  // uma alteração feita nela mesma enquanto o usuário está com ela aberta.
  useEffect(() => { marcarAbaLida(tabDir); }, [tabDir, abaAlteracoes]);

  // ── Salvar form esquerdo ──────────────────────────────────────────────────
  const salvarForm = umaVez('form', async () => {
    // Barra data absurda antes de gravar (digito a mais no ano)
    const camposData: [string,string][] = [
      ['data_limite_esclarecimentos','Limite de Esclarecimentos'],
      ['data_limite_proposta','Limite de Proposta'],
      ['data_disputa','Data da Disputa'],
      ['data_limite_analise_tecnica','Limite de Análise Técnica'],
    ];  // Prazo de Entrega agora é texto livre
    for (const [campo, rotulo] of camposData) {
      if (dataForaDeFaixa((formEdit as any)[campo])) {
        alert(`${rotulo}: ano fora da faixa (${ANO_MIN}–${ANO_MAX}). Confira se não sobrou um dígito a mais.`);
        return;
      }
    }
    setSalvandoForm(true);
    const agora = new Date().toISOString();
    // areas_livres e marcadores são salvos por caminhos próprios (AreaLivre.salvarConteudo
    // e toggleMarcador) direto no banco — formEdit é uma cópia tirada só na abertura do
    // modal e nunca é resincronizada, então incluir esses campos aqui sobrescreveria
    // qualquer alteração feita por esses outros caminhos com o valor antigo do mount.
    const { _cliente_id, _cliente_obj, historico, status, criado_em, criado_por, id, areas_livres, marcadores, ...editaveis } = formEdit;
    const novoRow = {
      ...editaveis,
      data_limite_esclarecimentos: inputBRParaUtc(editaveis.data_limite_esclarecimentos),
      data_limite_proposta:        inputBRParaUtc(editaveis.data_limite_proposta),
      data_disputa:                inputBRParaUtc(editaveis.data_disputa),
      data_limite_analise_tecnica: inputBRParaUtc(editaveis.data_limite_analise_tecnica),
      prazo_entrega: (editaveis.prazo_entrega || '').trim() || null,   // texto livre (ex.: 30 dias após o empenho)
      // campo de valor apagado = sem valor (antes ia texto vazio e o banco recusava o salvamento)
      ...Object.fromEntries(Object.keys(editaveis).filter(k => k.startsWith('valor_'))
        .map(k => [k, editaveis[k] === '' || editaveis[k] == null ? null : Number(editaveis[k])])),
      atualizado_em: agora,
    };
    const { error } = await supabase.from('licitacoes').update(novoRow).eq('id', licit.id);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
        oldRow: licit, newRow: { ...licit, ...novoRow }, user: currentUser });
      onRefresh();
    }
    setSalvandoForm(false);
  });

  // ── Salvar nova atualização de Andamento ────────────────────────────────────
  const salvarAndamento = umaVez('andamento', async () => {
    if (!novoText.trim() && novoAnexoFiles.length === 0) return;
    setSalvandoAndamento(true);
    const agora = new Date().toISOString();
    const autor = currentUser?.nome || currentUser?.email || 'Usuário';
    try {
      let primeiroAnexoUrl: string|null = null;
      let primeiroAnexoNome: string|null = null;
      // upload primeiro arquivo (principal)
      if (novoAnexoFiles.length > 0) {
        primeiroAnexoUrl = await uploadAnexo(novoAnexoFiles[0], licit.id, 'andamento');
        primeiroAnexoNome = novoAnexoFiles[0].name;
        // 7.61: o envio que falhava devolvia vazio e o andamento era gravado com o nome do arquivo e SEM o arquivo
        if (!primeiroAnexoUrl) { alert('O envio do arquivo "' + primeiroAnexoNome + '" falhou. O andamento NÃO foi gravado — tente de novo.'); return; }
      }
      const { data: novoAndamento, error } = await supabase.from('licitacao_documentos').insert([{
        licitacao_id: licit.id, categoria: 'andamento',
        nome: 'Andamento', conteudo: novoText.trim(),
        anexo_url: primeiroAnexoUrl, anexo_nome: primeiroAnexoNome,
        criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
      }]).select('id').single();
      // 7.61: o erro só era conferido DEPOIS de registrar no histórico e de gravar os arquivos extras — com o andamento recusado,
      // o histórico dizia que ele existia e os extras ficavam soltos. Agora para aqui.
      if (error) { alert('Erro: ' + error.message); return; }
      logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
        oldRow: { andamento: null }, newRow: { andamento: novoText.trim().slice(0, 120) }, user: currentUser,
        metadata: { ref_id: novoAndamento?.id } });
      // uploads adicionais (arquivos extras sem texto)
      const falhasExtras: string[] = [];
      for (let i = 1; i < novoAnexoFiles.length; i++) {
        const url = await uploadAnexo(novoAnexoFiles[i], licit.id, 'andamento');
        if (!url) { falhasExtras.push(novoAnexoFiles[i].name + ' (o envio do arquivo falhou)'); continue; }
        const { error: erroExtra } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licit.id, categoria: 'andamento',
          nome: 'Andamento', conteudo: null,
          anexo_url: url, anexo_nome: novoAnexoFiles[i].name,
          criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
        }]);
        if (erroExtra) falhasExtras.push(novoAnexoFiles[i].name + ' (' + erroExtra.message + ')');
      }
      if (falhasExtras.length) alert('O andamento foi gravado, mas estes arquivos NÃO foram anexados: ' + falhasExtras.join('; ') + '.');
      {
        await salvarMencoes({
          texto:             novoText.trim(),
          mencionanteId:     String(currentUser?.id || ''),
          mencionanteNome:   autor,
          contexto:          'licitacao',
          contextoId:        licit.id,
          contextoDescricao: licit.nome_projeto || licit.numero || '',
          campo:             'andamento',
          abaDestino:        'licitacoes',
        });
        setNovoText('');
        setNovoAnexoFiles([]);
        if (novoAnexoRef.current) novoAnexoRef.current.value = '';
      }
      await fetchAndamento();
    } finally {
      setSalvandoAndamento(false);
    }
  });

  // ── Editar andamento existente ────────────────────────────────────────────
  // Regra de 07/10/2026 (decidida com o usuário, igual à do Comercial): só o AUTOR da atualização e quem tem a marca DEV editam; a edição guarda quem e quando (editado_em/editado_por) para a marca
  // "editada". Antes qualquer pessoa que abrisse a licitação editava o texto de outra, sem deixar rastro.
  const salvarEdicaoAndamento = umaVez('edicao-andamento', async () => {
    if (!editandoDocId) return;
    const alvo = andDocs.find((x: any) => x.id === editandoDocId);
    if (alvo && !podeEditarAtualizacao(currentUser, alvo.criado_por_nome, alvo.criado_por)) { alert('Só quem escreveu a atualização (ou a equipe DEV) pode editá-la.'); return; }
    const agoraEd = new Date().toISOString();
    const { error } = await supabase.from('licitacao_documentos')
      .update({ conteudo: editandoDocTexto, atualizado_em: agoraEd, editado_em: agoraEd, editado_por: currentUser?.nome || currentUser?.email || 'Usuário' })
      .eq('id', editandoDocId);
    if (error) { alert('Erro: ' + error.message); return; }
    await salvarMencoes({
      texto:             editandoDocTexto,
      mencionanteId:     String(currentUser?.id || ''),
      mencionanteNome:   currentUser?.nome || currentUser?.email || 'Usuário',
      contexto:          'licitacao',
      contextoId:        licit.id,
      contextoDescricao: licit.nome_projeto || licit.numero || '',
      campo:             'andamento',
      abaDestino:        'licitacoes',
    });
    setEditandoDocId(null);
    setEditandoDocTexto('');
    fetchAndamento();
  });

  // ── Excluir entrada de Andamento ────────────────────────────────────────────
  const excluirAndamentoDoc = async (id: string, tabela: 'licitacao_documentos'|'licitacao_anexos') => {
    if (!podeExcluirAnexos) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!await confirmar('Remover este registro?')) return;
    await umaVez('exclusao-' + id, () => excluirComUndo(tabela, id, currentUser?.nome || currentUser?.email, 'Registro de andamento'))();
    fetchAndamento();
  };

  // ── Salvar novo doc nas demais abas ─────────────────────────────────────────
  const salvarDoc = umaVez('doc', async () => {
    if (uploadFiles.length === 0 && !uploadDesc.trim()) return;
    setSalvandoDoc(true);
    const falhas: string[] = [];
    const agora = new Date().toISOString();
    const autor = currentUser?.nome || currentUser?.email || 'Usuário';
    try {
      if (uploadFiles.length === 0 && uploadDesc.trim()) {
        // só texto, sem arquivo
        const { data: novoDoc, error } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licit.id, categoria: tabDir,
          nome: uploadDesc.slice(0,80) || 'Documento',
          url: null, conteudo: uploadDesc.trim(),
          criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
        }]).select('id').single();
        if (error) alert('Erro: ' + error.message);
        else logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
          oldRow: { [tabDir]: null }, newRow: { [tabDir]: (uploadDesc.slice(0,80) || 'Documento') }, user: currentUser,
          formatters: { [tabDir]: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id } });
      } else {
        // upload de cada arquivo
        for (const file of uploadFiles) {
          const url = await uploadAnexo(file, licit.id, tabDir);
          // 7.61: o envio que falhava devolvia vazio e o documento era registrado SEM arquivo; o erro de gravação também era ignorado
          if (!url) { falhas.push(file.name + ' (o envio do arquivo falhou)'); continue; }
          const { data: novoDoc, error: erroDoc } = await supabase.from('licitacao_documentos').insert([{
            licitacao_id: licit.id, categoria: tabDir,
            nome: file.name, url,
            conteudo: uploadDesc.trim() || null,
            criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
          }]).select('id').single();
          if (erroDoc) { falhas.push(file.name + ' (' + erroDoc.message + ')'); continue; }
          logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
            oldRow: { [tabDir]: null }, newRow: { [tabDir]: file.name }, user: currentUser,
            formatters: { [tabDir]: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id } });
        }
      }
      if (falhas.length) alert('Estes arquivos NÃO foram anexados: ' + falhas.join('; ') + '.');
      setUploadFiles([]);
      setUploadDesc('');
      if (uploadRef.current) uploadRef.current.value = '';
      await fetchDocs();
      await fetchAbaAlteracoes();
    } finally {
      setSalvandoDoc(false);
    }
  });

  // ── Excluir doc ───────────────────────────────────────────────────────────
  const excluirDoc = async (id: string, tabela: 'licitacao_documentos'|'licitacao_anexos') => {
    if (!podeExcluirAnexos) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!await confirmar('Remover este registro?')) return;
    await umaVez('exclusao-' + id, () => excluirComUndo(tabela, id, currentUser?.nome || currentUser?.email, 'Documento/anexo'))();
    fetchDocs();
    fetchAbaAlteracoes();
  };

  // ── Mudar status ──────────────────────────────────────────────────────────
  const mudarStatus = umaVez('status', async (novoStatus: string) => {
    setSalvando(true);
    const agora = new Date().toISOString();
    const hist = [...(licit.historico || []), { status: novoStatus, usuario: currentUser?.nome, data: agora, obs: obsEncerramento || '' }];
    const novoRow = { status: novoStatus, historico: hist, obs_encerramento: obsEncerramento || null, atualizado_em: agora };
    const { error: erroStatus } = await supabase.from('licitacoes').update(novoRow).eq('id', licit.id);
    // 7.61: o erro era ignorado — a janela fechava como se a licitação tivesse mudado de status (inclusive "Vencida") e o histórico registrava a troca
    if (erroStatus) { alert('Não foi possível mudar o status para "' + novoStatus + '": ' + erroStatus.message); setSalvando(false); return; }
    logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
      oldRow: licit, newRow: { ...licit, ...novoRow }, user: currentUser });
    setConfirmStatus(null);
    setObsEncerramento('');
    setSalvando(false);
    onRefresh();
    if (novoStatus === 'Vencida') { setShowAcoesVencida(true); } else { fecharModal(); }
  });

  // ── Emitir Pedido de Compra ───────────────────────────────────────────────
  // 05/10/2026: abre a MESMA solicitação de compra de todo o sistema (lista de itens, prioridade, anexos...). Antes gravava uma linha com o
  // número da licitação como "material" e quantidade 1, e quem precisava listar o material escrevia na descrição.
  const emitirPedidoCompra = () => setModalCompraAberto(true);
  const aoCriarCompraLicit = (r: any) => setPedidoEmitido(r.numero_pedido);

  // ── Toggle marcador ───────────────────────────────────────────────────────
  const alternar = (lista: string[], m: string) =>
    lista.includes(m) ? lista.filter(x => x !== m) : [...lista, m];

  // EPP fica no topo junto dos marcadores e grava na hora, como eles
  const alternarEpp = async () => {
    const novo = !formEdit.epp;
    setFormEdit((f: any) => ({ ...f, epp: novo }));
    const { error } = await supabase.from('licitacoes')
      .update({ epp: novo, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
    if (error) {
      setFormEdit((f: any) => ({ ...f, epp: !novo }));
      alert('Não foi possível salvar o EPP: ' + error.message);
      return;
    }
    onRefresh();
  };

  const trocarTemperatura = async (t: string) => {
    const nova = formEdit.temperatura === t ? null : t;   // clicar de novo limpa
    const antes = formEdit.temperatura || null;
    setFormEdit((f: any) => ({ ...f, temperatura: nova }));
    const { error } = await supabase.from('licitacoes')
      .update({ temperatura: nova, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
    if (error) {
      setFormEdit((f: any) => ({ ...f, temperatura: antes }));
      alert('Não foi possível salvar a temperatura: ' + error.message);
      return;
    }
    onRefresh();
  };

  const toggleMarcador = (m: string) => {
    const novos = alternar(marcadoresRef.current, m);
    marcadoresRef.current = novos;
    setMarcadores(novos);                       // acende/apaga NA HORA
    filaMarcadoresRef.current = filaMarcadoresRef.current.then(async () => {
      const { error } = await supabase.from('licitacoes')
        .update({ marcadores: novos, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
      if (error) {
        // desfaz só este marcador, sem perder os outros cliques
        marcadoresRef.current = alternar(marcadoresRef.current, m);
        setMarcadores(marcadoresRef.current);
        alert('Não foi possível salvar o marcador "' + m + '": ' + error.message);
        return;
      }
      onRefresh();                               // atualiza o card na lista
    });
  };

  const s = licit.status;
  // Vencida: entrega (fluxo, endereços) e o controle de contrato só existem aqui.
  // `licit` é a cópia da abertura; logo após marcar como Vencida o status dela
  // ainda é o antigo — por isso vale também o painel de ações da vitória.
  const ehVencida = s === 'Vencida' || showAcoesVencida;

  const botaoProximoStatus = () => {
    if (s === 'Aberta' && isAnalista) return { label:'Iniciar Andamento', next:'Em Andamento' };   // o foguete agora é o ícone do botão
    return null;
  };
  const btnProximo = botaoProximoStatus();

  // ── Voltar fase ──────────────────────────────────────────────────────────
  // Um registro finalizado pode precisar voltar (ex: Finalizada → Vencida,
  // Vencida → Em Andamento). Licitações não usa Kanban/gates de estágio como
  // o CRM — é status simples por botão, sem automação de banco amarrada à
  // troca, então retroceder é seguro (só grava mais uma entrada no histórico).
  const statusAnterior = (): string | null => {
    if (s === 'Em Andamento') return 'Aberta';
    if (['Vencida','Finalizada','Perdida','Descartada','Suspenso'].includes(s)) return 'Em Andamento';
    return null;
  };
  const voltarFase = async () => {
    const anterior = statusAnterior();
    if (!anterior) return;
    if (!await confirmar(`Voltar de "${s}" para "${anterior}"?`)) return;
    mudarStatus(anterior);
  };

  // ── Minimizado ────────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="acn-lic-min">
        <div className="acn-lic-min-txt">
          <span className="acn-lic-min-st">{s}</span>
          <span className="acn-forte">{licit.numero} — {licit.nome_projeto}</span>
          <span className="acn-fraco">{licit.orgao}</span>
        </div>
        <div className="acn-lic-min-acoes">
          <Botao pequeno variante="primario" icone={mdiChevronUp} onClick={() => setMinimized(false)}>Restaurar</Botao>
          <Botao pequeno variante="discreto" icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>
      </div>
    );
  }

  // ── Renderização principal ────────────────────────────────────────────────
  return (
    <div className="modal-overlay acn-lic-overlay acn-lic-ov-card">
      <div ref={containerRef} className={'acn-lic-cont' + (isDragging ? ' arrastando' : '')}>

        {/* ══ PAINEL ESQUERDO: Formulário ══ */}
        <div className="acn-lic-esq" style={estSplit.esquerda}>

          {/* Header */}
          <div className="acn-lic-cab" data-acn-familia={FAMILIA_STATUS_LICIT[s] || 'neutro'}>
            <div className="acn-lic-cab-info">
              <div className="acn-lic-cab-linha1">{s.toUpperCase()} · {licit.classificacao} · {formEdit.faturamento_empresa||'ACN'}</div>
              <div className="acn-lic-cab-titulo">{licit.numero} — {licit.nome_projeto}</div>
              <div className="acn-lic-cab-orgao">{licit.orgao}</div>
            </div>
            <div className="acn-lic-cab-acoes">
              <SeletorModoSplit modo={modoSplit} onModo={setModoSplit} escuro />
              <Botao variante="discreto" pequeno icone={mdiWindowMinimize} title="Minimizar" aria-label="Minimizar" onClick={() => setMinimized(true)} />
              <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={fecharModal} />
            </div>
          </div>

          {/* Marcadores */}
          <div className="acn-lic-marcadores">
            <Botao pequeno variante={formEdit.epp ? 'primario' : 'secundario'} icone={formEdit.epp ? mdiCheck : undefined} aria-pressed={!!formEdit.epp}
              title="Empresas de pequeno porte (ME/EPP): licitação exclusiva ou com cota reservada" onClick={() => alternarEpp()}>
              EPP
            </Botao>
            <span className="acn-lic-temp" role="radiogroup" aria-label="Temperatura da proposta" title="Temperatura da proposta">
              {TEMPERATURAS.map(t => {
                const sel = formEdit.temperatura === t.v;
                return (
                  <button key={t.v} type="button" role="radio" aria-checked={sel} data-temp={t.v} className={'acn-lic-temp-btn' + (sel ? ' on' : '')}
                    onClick={() => trocarTemperatura(t.v)} title={`${t.label}${sel ? ' (clique de novo para limpar)' : ''}`}>
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </span>
            {MARCADORES.map(m => {
              const ligado = marcadores.includes(m);
              return (
                <Botao key={m} pequeno variante={ligado ? 'perigo-sec' : 'secundario'} icone={ligado ? mdiCheck : undefined} aria-pressed={ligado}
                  title={AJUDA_MARCADOR[m]} onClick={() => toggleMarcador(m)}>
                  {m}
                </Botao>
              );
            })}
          </div>

          {/* Form (scrollable) */}
          <div className="acn-lic-form">

            {/* Seletores compactos: faturamento, classificação e tipo numa linha */}
            <div className="acn-grade-3">
              <div className={campoCls('faturamento_empresa')}>
                <label className="acn-label">ACN / Detech</label>
                <select value={formEdit.faturamento_empresa||''} onChange={e=>setF('faturamento_empresa',e.target.value)} className="acn-input acn-lic-cheio">
                  {!formEdit.faturamento_empresa && <option value="">—</option>}
                  {FATURAMENTO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div className={campoCls('classificacao')}>
                <label className="acn-label">Classificação</label>
                <select value={formEdit.classificacao||'Direta'} onChange={e=>setF('classificacao',e.target.value)} className="acn-input acn-lic-cheio">
                  <option>Direta</option><option>Parceiro</option><option>Adesão a ATA</option>
                </select>
              </div>
              <div className={campoCls('tipo_objeto')}>
                <label className="acn-label">Tipo</label>
                <select value={formEdit.tipo_objeto||''} onChange={e=>setF('tipo_objeto',e.target.value)} className="acn-input acn-lic-cheio">
                  <option value="">—</option>
                  {['Registro de Preços','Contrato'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            <div className={campoCls('numero')}><FInput label="Nome do Projeto" value={formEdit.numero} onChange={v=>setF('numero',v)} /></div>

            {/* Fluxo de Entrega e endereços: só em Vencida (nos outros status não
                há o que entregar ainda). Mesma classificação usada na OP. */}
            {ehVencida && (<>
            <div className={campoCls('fluxo_entrega', 'acn-lic-fluxo')}>
              <label className="acn-label">Fluxo de Entrega</label>
              <select value={formEdit.fluxo_entrega||''} onChange={e=>setF('fluxo_entrega',e.target.value)} className="acn-input acn-lic-cheio">
                <option value="">— Ainda não definido —</option>
                {FLUXOS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
              </select>
              <div className="acn-lic-fluxo-ajuda">
                {formEdit.fluxo_entrega
                  ? FLUXOS.find(f => f.valor === formEdit.fluxo_entrega)?.ajuda
                  : 'Define se, ao virar OP, o processo vai para a Adaptação, para a Fabricação ou direto para envio.'}
              </div>
            </div>

            {/* Vários endereços (antes era um só): cada pedido de entrega escolhe o seu */}
            <EnderecosEntrega licitacaoId={licit.id} />
            </>)}

            <div className={campoCls('nome_projeto')}><FInput label="Nome completo do Órgão" value={formEdit.nome_projeto} onChange={v=>setF('nome_projeto',v)} /></div>
            <div className={campoCls('orgao')}><FInput label="Portal" value={formEdit.orgao} onChange={v=>setF('orgao',v)} /></div>

            <QuadroFormacaoLicitacao licitacaoId={licit.id} />
            <div className="acn-lic-linha-valor">
              <div className={campoCls('valor_estimado', 'acn-lic-c-valor')}><FInput label="Valor Global Previsto (R$)" value={formEdit.valor_estimado} onChange={v=>setF('valor_estimado',v)} type="money" /></div>
              <div className={campoCls('julgamento', 'acn-lic-c-julg')}>
                <label className="acn-label">Julgamento</label>
                <div className="acn-lic-opcoes quebra">
                  {JULGAMENTO_OPCOES.map(opt => {
                    const ativos: string[] = formEdit.julgamento || [];
                    const sel = ativos.includes(opt);
                    return (
                      <Botao key={opt} pequeno variante={sel ? 'primario' : 'secundario'} aria-pressed={sel} icone={sel ? mdiCheck : undefined}
                        onClick={() => setFormEdit((f:any) => {
                          const at = f.julgamento || [];
                          return { ...f, julgamento: at.includes(opt) ? at.filter((x:string)=>x!==opt) : [...at, opt] };
                        })}>
                        {opt}
                      </Botao>
                    );
                  })}
                </div>
              </div>
              <div className={campoCls('forma_disputa', 'acn-lic-c-forma')}>
                <label className="acn-label">Forma de Disputa</label>
                <select value={formEdit.forma_disputa||''} onChange={e=>setF('forma_disputa',e.target.value)} className="acn-input acn-lic-cheio">
                  <option value="">—</option>
                  {FORMA_DISPUTA_OPCOES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            {/* PRAZOS */}
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">PRAZOS</div>
              <div className="acn-grade-2">
                <div className={campoCls('data_limite_esclarecimentos')}><FInput label="Limite Esclarecimentos/Impugnação" value={formEdit.data_limite_esclarecimentos} onChange={v=>setF('data_limite_esclarecimentos',v)} type="datetime-local" /></div>
                <div className={campoCls('data_limite_proposta')}><FInput label="Limite Proposta" value={formEdit.data_limite_proposta} onChange={v=>setF('data_limite_proposta',v)} type="datetime-local" /></div>
                <div className={campoCls('data_disputa')}><FInput label="Data/Hora de Disputa" value={formEdit.data_disputa} onChange={v=>setF('data_disputa',v)} type="datetime-local" /></div>
                <div className={campoCls('data_limite_analise_tecnica')}><FInput label="Limite Análise Técnica" value={formEdit.data_limite_analise_tecnica} onChange={v=>setF('data_limite_analise_tecnica',v)} type="datetime-local" /></div>
                <div className={campoCls('prazo_entrega')}><FInput label="Prazo de Entrega" value={formEdit.prazo_entrega} onChange={v=>setF('prazo_entrega',v)} placeholder="Ex.: 30 dias após o empenho" /></div>
              </div>
            </div>

            {/* CONTATOS DO PROCESSO */}
            <ContatosSection licitacaoId={licit.id} currentUser={currentUser} />

            {/* HISTÓRICO — mesmo padrão hide/show de CONTATOS DO PROCESSO, começa recolhido */}
            {(licit.historico||[]).length > 0 && (
              <div className="acn-lic-secao">
                <Botao variante="discreto" pequeno icone={historicoExpandido ? mdiChevronDown : mdiChevronRight} aria-expanded={historicoExpandido}
                  onClick={() => setHistoricoExpandido(e => !e)}>
                  HISTÓRICO ({licit.historico.length})
                </Botao>
                {historicoExpandido && [...(licit.historico||[])].reverse().slice(0,5).map((h: any, i: number) => (
                  <div key={i} className="acn-lic-hist" data-acn-familia={FAMILIA_STATUS_LICIT[h.status] || 'neutro'}>
                    <i className="acn-lic-hist-ponto" />
                    <div>
                      <div className="acn-lic-hist-status">{h.status}</div>
                      <div className="acn-ajuda">{h.usuario} · {fmtDT(h.data)}</div>
                      {h.obs && <div className="acn-ajuda acn-lic-hist-obs" dangerouslySetInnerHTML={{ __html: htmlSeguro(h.obs) }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ANDAMENTO — sempre visível, abaixo do formulário (não é mais aba) */}
            <div className="acn-lic-secao">
              <div className="acn-quadro-titulo acn-lic-and-tit"><Icone path={mdiNoteTextOutline} size={14} />Andamento</div>

              {/* Análise — migrada pra dentro do Andamento, não é mais aba própria do painel direito */}
              <div className="acn-lic-and-analise">
                <AnaliseStatusPanel
                  origemId={licit.id}
                  origemTitulo={licit.nome_projeto}
                  origemNumero={licit.numero}
                  origem="licitacao"
                  currentUser={currentUser}
                  onSolicitarNova={() => setShowModalSolicitar(true)}
                />
              </div>

              <div className="acn-lic-and-lista">
                {/* Nova entrada */}
                <div className="acn-quadro tom-ok acn-lic-and-nova">
                  <div className="acn-lic-and-nova-tit"><Icone path={mdiPencilOutline} size={14} />Nova Atualização</div>
                  <RichTextInput mencoes value={novoText} onChange={v=>setNovoText(v)}
                    placeholder="Descreva o andamento... @Nome para mencionar, selecione um trecho pra formatar" minHeight={54}
                    style={{ fontSize:11 }} />
                  <div className="acn-lic-and-anexos">
                    <label className="acn-lic-anexar">
                      <Icone path={mdiPaperclip} size={14} />Vincular arquivo(s)
                      <input type="file" ref={novoAnexoRef} className="acn-lic-oculto" multiple
                        accept={`.pdf,.doc,.docx,${EXT_PLANILHAS},.txt,.png,.jpg,.jpeg`}
                        onChange={e => setNovoAnexoFiles(Array.from(e.target.files||[]))} />
                    </label>
                    {novoAnexoFiles.length > 0 && (
                      <span className="acn-lic-and-qtd">
                        <Icone path={mdiPaperclip} size={14} />{novoAnexoFiles.length} arquivo(s)
                        <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Tirar os arquivos escolhidos" aria-label="Tirar os arquivos escolhidos"
                          onClick={() => { setNovoAnexoFiles([]); if(novoAnexoRef.current) novoAnexoRef.current.value=''; }} />
                      </span>
                    )}
                  </div>
                  <Botao variante="primario" icone={mdiPlus} className="acn-lic-and-registrar" onClick={salvarAndamento} disabled={salvandoAndamento||(!novoText.trim()&&novoAnexoFiles.length===0)}>
                    {salvandoAndamento ? 'Salvando...' : 'Registrar'}
                  </Botao>
                </div>

                {/* Lista de entradas */}
                {andDocs.map((d: any) => (
                  <div key={d.id} className={'acn-lic-and' + (itemNaoLido(d.id) ? ' nao-lido' : '')}>
                    <div className="acn-lic-and-corpo">
                      {editandoDocId === d.id ? (
                        <div>
                          <RichTextInput mencoes value={editandoDocTexto} onChange={v=>setEditandoDocTexto(v)}
                            minHeight={54} style={{ fontSize:11 }} />
                          <div className="acn-lic-form-botoes acn-lic-and-edit-botoes">
                            <Botao variante="primario" pequeno icone={mdiContentSaveOutline} onClick={salvarEdicaoAndamento}>
                              Salvar Nota
                            </Botao>
                            <Botao pequeno onClick={() => { setEditandoDocId(null); setEditandoDocTexto(''); }}>
                              Cancelar
                            </Botao>
                          </div>
                        </div>
                      ) : (
                        <>
                          {d.conteudo && (
                            pareceHtmlFormatado(d.conteudo)
                              ? <div className="acn-lic-and-txt" dangerouslySetInnerHTML={{ __html: d.conteudo }} />
                              : <div className="acn-lic-and-txt"><Linkify text={d.conteudo} /></div>
                          )}
                          {d.anexo_url && (
                            <a href={d.anexo_url} target="_blank" rel="noreferrer" className="acn-lic-link-info acn-lic-and-arquivo">
                              <Icone path={mdiPaperclip} size={13} />{d.anexo_nome||'Arquivo'}
                            </a>
                          )}
                          <div className="acn-ajuda acn-lic-and-meta">
                            <span><Icone path={mdiAccountOutline} size={12} />{d.criado_por_nome||'—'}</span>
                            <span><Icone path={mdiClockOutline} size={12} />{fmtDT(d.criado_em)}</span>
                            <MarcaAtualizacaoEditada editadoEm={d.editado_em} editadoPor={d.editado_por} />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="acn-lic-and-acoes">
                      {editandoDocId !== d.id && podeEditarAtualizacao(currentUser, d.criado_por_nome, d.criado_por) && (
                        <Botao variante="discreto" pequeno icone={mdiPencilOutline} title="Editar" aria-label="Editar"
                          onClick={() => { setEditandoDocId(d.id); setEditandoDocTexto(d.conteudo||''); }} />
                      )}
                      {podeExcluirAnexos && (
                        <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover registro" aria-label="Remover registro"
                          onClick={() => excluirAndamentoDoc(d.id,'licitacao_documentos')} />
                      )}
                    </div>
                  </div>
                ))}

                {/* Legado */}
                {andDocsLegacy.length > 0 && (
                  <>
                    <div className="acn-ajuda acn-lic-centro acn-lic-and-sep">— registros anteriores —</div>
                    {andDocsLegacy.map((a: any) => (
                      <div key={a.id} className="acn-lic-and legado">
                        <div className="acn-lic-and-corpo">
                          <div className="acn-lic-and-txt"><Linkify text={a.conteudo} /></div>
                          <div className="acn-ajuda acn-lic-and-meta">
                            <span><Icone path={mdiAccountOutline} size={12} />{a.criado_por_nome||'—'}</span>
                            <span><Icone path={mdiClockOutline} size={12} />{fmtDT(a.criado_em)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {erroAndamento && (
                  <Faixa tom="erro" acao={<Botao pequeno onClick={fetchAndamento}>Tentar de novo</Botao>}>Não foi possível ler o andamento ({erroAndamento}). Isso não quer dizer que não haja atualização{andDocs.length || andDocsLegacy.length ? '; o que aparece é da última leitura que deu certo' : ''}.</Faixa>
                )}
                {andDocs.length === 0 && andDocsLegacy.length === 0 && !loadingAndDocs && !erroAndamento && (
                  <div className="acn-empty acn-lic-vazio">Nenhuma atualização ainda.</div>
                )}

                {/* Área Livre desta seção */}
                {areasLivres === null && erroAreas ? (
                  <Faixa tom="erro">Não foi possível ler a Área Livre ({erroAreas}). Ela fica fechada para não correr o risco de apagar o texto das outras áreas — feche e abra a licitação de novo.</Faixa>
                ) : areasLivres === null ? (
                  <div className="acn-ajuda acn-lic-centro">Carregando área livre…</div>
                ) : (
                  <AreaLivre licitacaoId={licit.id} tabKey="andamento" areasLivres={areasLivres} onAreasLivresChange={setAreasLivres}
                    currentUser={currentUser} naoLida={camposNaoLidos.has('area_livre_andamento')} />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="acn-lic-rodape">

            {modalCompraAberto && (
              <ModalSolicitarCompra currentUser={currentUser}
                titulo="Emitir pedido de compra"
                subtitulo={`${licit.classificacao === 'Direta' ? 'Venda direta' : 'Licitação'} vencida — ${licit.numero || licit.nome_projeto || ''}`}
                valorInicial={{ titulo: `Compra — ${licit.numero || licit.tipo_objeto || licit.objeto_principal || ''}`.replace(/ — $/, '') }}
                origemSetor={currentUser?.perfil || 'Licitações'}
                opl={licit.numero || null}
                contexto={[
                  `Pedido de Compra Direta — ${licit.classificacao === 'Direta' ? 'Venda Direta' : 'Licitação'} Vencida`,
                  `Nome do Projeto: ${licit.numero || '—'}`, `Nome do Órgão: ${licit.nome_projeto || '—'}`,
                  `Portal: ${licit.orgao || '—'}`, `Tipo: ${licit.tipo_objeto || licit.objeto_principal || '—'}`,
                ].join('\n')}
                onClose={() => setModalCompraAberto(false)} onCriada={aoCriarCompraLicit} />
            )}

            {showAcoesVencida && (
              <div className="acn-quadro tom-ok acn-lic-vencida">
                <div className="acn-lic-vencida-tit"><Icone path={mdiTrophyOutline} size={18} />VENCIDA! Emita os documentos:</div>
                {pedidoEmitido ? (
                  <div className="acn-lic-pedido-ok"><Icone path={mdiCheckCircleOutline} size={16} />Pedido {pedidoEmitido} emitido!</div>
                ) : (
                  <Botao variante="primario" icone={mdiPackageVariantClosed} className="acn-botao-cheio" onClick={emitirPedidoCompra}>
                    Emitir Pedido de Compra
                  </Botao>
                )}
                <Botao icone={mdiPackageVariantClosed} className="acn-botao-cheio" onClick={() => { setTabDir('entregas'); if (modoSplit === 'esquerda') setModoSplit('dividido'); }}>
                  Contrato e Entregas — registrar pedidos e gerar OPs
                </Botao>
                <Botao className="acn-botao-cheio" onClick={fecharModal}>
                  Fechar
                </Botao>
              </div>
            )}

            {confirmStatus && (
              <div className="acn-quadro tom-atencao acn-lic-confirma">
                <div className="acn-forte">
                  Mover para: <span className="acn-lic-status-cor" data-acn-familia={FAMILIA_STATUS_LICIT[confirmStatus] || 'neutro'}>{confirmStatus}</span>
                </div>
                <RichTextInput value={obsEncerramento} onChange={html=>setObsEncerramento(html)}
                  placeholder="Observação (opcional)... (selecione um trecho pra formatar)" minHeight={36}
                  style={{ width:'100%' }} />
                <div className="acn-lic-form-botoes">
                  <Botao variante="primario" icone={mdiCheck} className="acn-lic-cresce" onClick={() => mudarStatus(confirmStatus)} disabled={salvando}>
                    {salvando ? '...' : 'Confirmar'}
                  </Botao>
                  <Botao onClick={() => { setConfirmStatus(null); setObsEncerramento(''); }}>
                    Cancelar
                  </Botao>
                </div>
              </div>
            )}

            {!showAcoesVencida && !confirmStatus && (
              <>
                {/* Botão principal da tela — único em evidência para salvar o
                    registro. Os demais "salvar" (Área Livre, nota de andamento,
                    contato) ficam discretos de propósito: cada um grava um
                    sub-recurso à parte (Área Livre já autosalva sozinha). */}
                <Botao variante="primario" icone={mdiContentSaveOutline} className="acn-lic-salvar" onClick={salvarForm} disabled={salvandoForm}>
                  {salvandoForm ? 'Salvando...' : 'Salvar Alterações'}
                </Botao>

                {btnProximo && (
                  <Botao icone={mdiRocketLaunchOutline} onClick={() => setConfirmStatus(btnProximo.next)}>
                    {btnProximo.label}
                  </Botao>
                )}

                {/* Era 5 botões lado a lado (quebrava em 2 linhas) — virou select
                    pra ocupar uma linha só (pedido do usuário em 24/09/2026). */}
                {s === 'Em Andamento' && isAnalista && (
                  <select value="" onChange={e => { if (e.target.value) setConfirmStatus(e.target.value); }} className="acn-input acn-lic-cheio acn-lic-mudar">
                    <option value="">Mudar status para...</option>
                    {['Vencida','Finalizada','Perdida','Descartada','Suspenso'].map(ns => (
                      <option key={ns} value={ns}>
                        {ns === 'Vencida' ? '🏆 Vencida' : ns === 'Finalizada' ? '🏁 Finalizada' : ns === 'Perdida' ? '😞 Perdida' : ns === 'Descartada' ? '🗑️ Descartada' : '⏸️ Suspenso'}
                      </option>
                    ))}
                  </select>
                )}

                {statusAnterior() && (
                  <Botao pequeno icone={mdiArrowLeft} onClick={voltarFase} disabled={salvando} title={`Voltar para "${statusAnterior()}"`}>
                    Voltar Fase (para {statusAnterior()})
                  </Botao>
                )}

                {/* "Solicitar Análise" saiu daqui: fica só o do Andamento (corpo do card) */}
                <div className="acn-lic-rodape-fim">
                  {podeExcluirLicitacao(currentUser) && (
                    <Botao variante="perigo-sec" pequeno icone={mdiTrashCanOutline} onClick={onExcluir}>
                      Excluir
                    </Botao>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ══ DIVISOR REDIMENSIONÁVEL ══ */}
        <div className={'acn-lic-divisor' + (isDragging ? ' arrastando' : '')} onMouseDown={onDividerMouseDown} style={estSplit.divisor}>
          <div className="acn-lic-divisor-marca" />
        </div>

        {/* ══ PAINEL DIREITO: Abas ══ */}
        <div className="acn-lic-dir" style={estSplit.direita}>

          {/* Tab bar — quebra em linhas em vez de rolar horizontalmente, pra caber tudo na tela */}
          <div className="acn-lic-abas-barra">
            <Abas className="acn-lic-abas" ativa={tabDir} onChange={(k) => { setTabDir(k); marcarAbaLida(k); }}
              itens={(ehVencida ? [...TABS_DIREITO, { key:'entregas', label:'📦 Contrato e Entregas' }] : TABS_DIREITO).map(t => {
                const destacada = tabDir !== t.key && (isAbaDestacada(t.key) || camposNaoLidos.has(t.key));
                return { id: t.key, rotulo: <>{t.label}{destacada && <i className="acn-lic-aba-ponto" />}</>, classe: destacada ? 'destacada' : '' };
              })} />
            {modoSplit === 'direita' && (
              <div className="acn-lic-abas-fim">
                <span title={licit.numero} className="acn-lic-abas-num">{licit.numero}</span>
                <SeletorModoSplit modo={modoSplit} onModo={setModoSplit} />
                <Botao variante="discreto" pequeno icone={mdiWindowMinimize} title="Minimizar" aria-label="Minimizar" onClick={() => setMinimized(true)} />
                <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={fecharModal} />
              </div>
            )}
          </div>

          {/* Conteúdo da aba */}
          <div className="acn-lic-dir-corpo">

            {/* ── FORMAÇÃO DE PREÇOS (embutida, já vinculada a este processo) ── */}
            {(tabDir === 'formacao_precos' || formacaoMontada) && (
              <div className={tabDir === 'formacao_precos' ? undefined : 'acn-lic-oculto'}>
                <FormacaoPrecosTab
                  currentUser={currentUser}
                  vinculo={{ tipo:'licitacao', id: licit.id }}
                  rotulo={licit.numero || licit.nome_projeto || ''}
                  embutido
                />
                {/* Rodapé: cotações dos fornecedores usadas para montar os custos */}
                <div className="acn-lic-form-rodape">
                  <SubQuadroDocumentos licitacaoId={licit.id} categoria="cotacoes_fornecedores" label="🧾 Cotações de Fornecedores"
                    currentUser={currentUser} podeExcluir={podeExcluirAnexos}
                    areasLivres={areasLivres} onAreasLivresChange={setAreasLivres}
                    itemNaoLido={itemNaoLido} areaLivreNaoLida={camposNaoLidos.has('area_livre_processo:cotacoes_fornecedores')} />
                </div>
              </div>
            )}

            {/* ── CONTRATO E ENTREGAS (só Vencida) ── usa o fluxo/prazo do formulário,
                que é o valor atual; `licit` é a cópia da abertura */}
            {tabDir === 'entregas' && ehVencida && (
              <ContratoEntregas currentUser={currentUser}
                licit={{ ...licit, fluxo_entrega: formEdit.fluxo_entrega, prazo_entrega: formEdit.prazo_entrega }} />
            )}

            {/* ── ARQUIVOS DE LICITAÇÃO — sub-quadros por categoria fixa ── */}
            {tabDir === 'processo' && (
              <div className="acn-lic-processo">
                {SUBQUADROS_ARQUIVOS.map((linha, i) => (
                  <div key={i} className="acn-lic-processo-linha">
                    {linha.map(sq => (
                      <SubQuadroDocumentos key={sq.categoria}
                        licitacaoId={licit.id} categoria={sq.categoria} label={sq.label}
                        currentUser={currentUser} podeExcluir={podeExcluirAnexos}
                        areasLivres={areasLivres} onAreasLivresChange={setAreasLivres}
                        itemNaoLido={itemNaoLido} areaLivreNaoLida={camposNaoLidos.has(`area_livre_processo:${sq.categoria}`)} />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── ABAS DE DOCUMENTOS (demais abas — Docs Enviados, Fase Contrato, Atestados) ── */}
            {tabDir !== 'formacao_precos' && tabDir !== 'processo' && tabDir !== 'entregas' && (
            <div className="acn-lic-docs-aba">
                {/* Upload */}
                <div className="acn-quadro acn-lic-upload">
                  <div className="acn-quadro-titulo acn-lic-upload-tit">
                    <Icone path={mdiPlus} size={14} />Adicionar em {TABS_DIREITO.find(t=>t.key===tabDir)?.label}
                  </div>
                  <input type="file" ref={uploadRef} multiple
                    accept={`.pdf,.doc,.docx,${EXT_PLANILHAS},.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar`}
                    onChange={e => setUploadFiles(Array.from(e.target.files||[]))}
                    className="acn-lic-arquivo" />
                  {uploadFiles.length > 0 && (
                    <div className="acn-lic-doc-anexos"><Icone path={mdiPaperclip} size={13} />{uploadFiles.length} arquivo(s) selecionado(s)</div>
                  )}
                  <input type="text" placeholder="Descrição / legenda (opcional)"
                    value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
                    className="acn-input acn-lic-cheio" />
                  <Botao variante="primario" icone={mdiPlus} className="acn-lic-doc-add" onClick={salvarDoc} disabled={salvandoDoc||(uploadFiles.length===0&&!uploadDesc.trim())}>
                    {salvandoDoc ? 'Salvando...' : 'Adicionar'}
                  </Botao>
                </div>

                {/* Lista */}
                {loadingDocs && <div className="acn-ajuda acn-lic-centro">Carregando...</div>}
                {erroDocs && (
                  <Faixa tom="erro" acao={<Botao pequeno onClick={fetchDocs}>Tentar de novo</Botao>}>Não foi possível ler os documentos desta categoria ({erroDocs}). Isso não quer dizer que não haja nenhum.</Faixa>
                )}
                {!loadingDocs && docs.length === 0 && !erroDocs && (
                  <div className="acn-empty acn-lic-vazio">Nenhum documento nesta categoria.</div>
                )}
                {docs.map((d: any) => (
                  <div key={d.id} className={'acn-lic-doc' + (itemNaoLido(d.id) ? ' nao-lido' : '')}>
                    <div className="acn-lic-doc-corpo">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="acn-lic-link-info acn-lic-doc-link">
                          <Icone path={mdiPaperclip} size={13} />{d.nome}
                        </a>
                      ) : (
                        <div className="acn-forte">{d.nome}</div>
                      )}
                      {d.conteudo && <div className="acn-ajuda acn-lic-doc-txt"><Linkify text={d.conteudo} /></div>}
                      <div className="acn-ajuda acn-lic-doc-meta">
                        <Icone path={mdiAccountOutline} size={12} />{d.criado_por_nome||'—'} · <Icone path={mdiClockOutline} size={12} />{fmtDT(d.criado_em)}
                      </div>
                    </div>
                    {podeExcluirAnexos && (
                      <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover documento" aria-label="Remover documento"
                        onClick={() => excluirDoc(d.id,'licitacao_documentos')} />
                    )}
                  </div>
                ))}
                {/* Área Livre genérica por aba removida daqui — fica só em
                    Andamento (painel esquerdo). "Arquivos de Licitação" ganha
                    áreas livres próprias, estruturadas em sub-quadros. */}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Solicitar Análise */}
      {showModalSolicitar && (
        <ModalSolicitarAnalise
          origem="licitacao"
          origemId={licit.id}
          origemTitulo={licit.nome_projeto}
          origemNumero={licit.numero}
          currentUser={currentUser}
          onClose={() => setShowModalSolicitar(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campo de edição de LicitacaoModal — definido FORA do componente (mesmo
// bug/fix que ModalNovaInput logo abaixo já resolve: se ficasse dentro de
// LicitacaoModal, uma nova função seria criada a cada re-render/tecla
// digitada, fazendo o React desmontar e remontar o <input> e tirar o foco).
// ─────────────────────────────────────────────────────────────────────────────
function FInput({ label, value, onChange, type='text', placeholder }: { label:string; value:any; onChange:(v:string)=>void; type?:string; placeholder?:string }) {
  if (type === 'money') {
    return (
      <div>
        <label className="acn-label">{label}</label>
        <input type="text" inputMode="decimal" placeholder="0,00" value={fmtMoedaBR(value)} className="acn-input acn-lic-cheio"
          onChange={e=>onChange(maskMoedaBR(e.target.value).raw)} />
      </div>
    );
  }
  return (
    <div>
      <label className="acn-label">{label}</label>
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="acn-input acn-lic-cheio" />
    </div>
  );
}

// MODAL NOVA LICITAÇÃO
// Definido FORA de ModalNova: se ficasse dentro, uma nova função seria criada a
// cada re-render (cada tecla digitada), fazendo o React desmontar e remontar o
// <input>, o que tira o foco do campo a cada caractere digitado.
function ModalNovaInput({ label, field, value, onChange, type='text', required=false }: any) {
  const classe = 'acn-input acn-lic-cheio' + (required && !value ? ' acn-lic-obrig' : '');
  if (type === 'money') {
    return (
      <div>
        <label className="acn-label">{label}{required?' *':''}</label>
        <input type="text" inputMode="decimal" placeholder="0,00" value={fmtMoedaBR(value)} className={classe}
          onChange={e=>onChange(field, maskMoedaBR(e.target.value).raw)} />
      </div>
    );
  }
  return (
    <div>
      <label className="acn-label">{label}{required?' *':''}</label>
      <input type={type} value={value||''} onChange={e=>onChange(field,e.target.value)} className={classe} />
    </div>
  );
}

function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...LICIT_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const emAcao = useRef(false);   // 7.61: o clique duplo criava a licitação duas vezes
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.numero.trim()) { alert('Número da licitação obrigatório!'); return; }
    if (!form.nome_projeto.trim()) { alert('Nome do projeto obrigatório!'); return; }
    if (!form.orgao.trim()) { alert('Órgão obrigatório!'); return; }
    if (emAcao.current) return;
    emAcao.current = true;
    setSalvando(true);
    const agora = new Date().toISOString();
    const historico = [{ status:'Aberta', usuario: currentUser?.nome, data: agora, obs:'Licitação aberta.' }];
    const { error } = await supabase.from('licitacoes').insert([{
      ...form,
      valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null,
      data_registro: agora,
      data_limite_esclarecimentos: inputBRParaUtc(form.data_limite_esclarecimentos),
      data_limite_proposta: inputBRParaUtc(form.data_limite_proposta),
      data_disputa: inputBRParaUtc(form.data_disputa),
      data_limite_analise_tecnica: inputBRParaUtc(form.data_limite_analise_tecnica),
      historico,
      marcadores: [],
      areas_livres: {},
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
    }]);
    setSalvando(false);
    emAcao.current = false;
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay acn-lic-overlay acn-lic-ov-nova">
      <div className="modal-box acn-modal-cadastro acn-lic-jan acn-lic-nova" role="dialog" aria-label="Nova Licitação">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPlus} size={18} />Nova Licitação</span>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>

        <div className="acn-modal-corpo acn-form-cheio">

          {/* ACN / Detech */}
          <div>
            <label className="acn-label">ACN / Detech *</label>
            <div className="acn-lic-opcoes">
              {FATURAMENTO_OPTIONS.map(opt => (
                <Botao key={opt} pequeno variante={form.faturamento_empresa===opt ? 'primario' : 'secundario'} aria-pressed={form.faturamento_empresa===opt}
                  className="acn-lic-opc" onClick={() => set('faturamento_empresa', opt)}>
                  {opt}
                </Botao>
              ))}
            </div>
          </div>

          <div className="acn-grade-2">
            <ModalNovaInput label="Nome do Projeto" field="numero" value={form.numero} onChange={set} required />
            <div>
              <label className="acn-label">Classificação *</label>
              <select className="acn-input acn-lic-cheio" value={form.classificacao} onChange={e=>set('classificacao',e.target.value)}>
                <option>Direta</option>
                <option>Parceiro</option>
                <option>Adesão a ATA</option>
              </select>
            </div>
          </div>

          <ModalNovaInput label="Nome completo do Órgão" field="nome_projeto" value={form.nome_projeto} onChange={set} required />
          <ModalNovaInput label="Portal" field="orgao" value={form.orgao} onChange={set} required />

          <div>
            <label className="acn-label">Tipo</label>
            <div className="acn-lic-opcoes">
              {['Registro de Preços','Contrato'].map(opt => (
                <Botao key={opt} pequeno variante={form.tipo_objeto===opt ? 'primario' : 'secundario'} aria-pressed={form.tipo_objeto===opt}
                  className="acn-lic-opc" onClick={() => set('tipo_objeto', opt)}>
                  {opt}
                </Botao>
              ))}
            </div>
          </div>

          <div className="acn-grade-2">
            <ModalNovaInput label="Valor Global Previsto (R$) — opcional" field="valor_estimado" value={form.valor_estimado} onChange={set} type="money" />
            <div>
              <label className="acn-label">Julgamento</label>
              <div className="acn-lic-opcoes quebra">
                {JULGAMENTO_OPCOES.map(opt => {
                  const ativos: string[] = form.julgamento || [];
                  const sel = ativos.includes(opt);
                  return (
                    <Botao key={opt} pequeno variante={sel ? 'primario' : 'secundario'} aria-pressed={sel}
                      icone={sel ? mdiCheck : undefined}
                      onClick={() => setForm((f:any) => {
                        const at = f.julgamento || [];
                        return { ...f, julgamento: at.includes(opt) ? at.filter((x:string)=>x!==opt) : [...at, opt] };
                      })}>
                      {opt}
                    </Botao>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="acn-label">Forma de Disputa</label>
            <div className="acn-lic-opcoes quebra">
              {FORMA_DISPUTA_OPCOES.map(opt => (
                <Botao key={opt} pequeno variante={form.forma_disputa===opt ? 'primario' : 'secundario'} aria-pressed={form.forma_disputa===opt}
                  className="acn-lic-opc terco" onClick={() => set('forma_disputa', opt)}>
                  {opt}
                </Botao>
              ))}
            </div>
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">PRAZOS</div>
            <div className="acn-grade-2">
              <ModalNovaInput label="Limite Esclarecimentos/Impugnação" field="data_limite_esclarecimentos" value={form.data_limite_esclarecimentos} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Limite Cadastro da Proposta" field="data_limite_proposta" value={form.data_limite_proposta} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Data/Hora de Disputa" field="data_disputa" value={form.data_disputa} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Limite Análise Técnica" field="data_limite_analise_tecnica" value={form.data_limite_analise_tecnica} onChange={set} type="datetime-local" />
            </div>
          </div>
        </div>

        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiPlus} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Licitação'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE LICITAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
// Família de cor de cada status — o card da lista e o relatório por status usam a mesma
const FAMILIA_STATUS_LICIT: Record<string, string> = { 'Aberta':'info', 'Em Andamento':'info', 'Vencida':'ok', 'Finalizada':'ok', 'Perdida':'erro', 'Descartada':'neutro', 'Suspenso':'atencao' };

function LicitCard({ l, onClick, unread = false, markup = undefined }) {
  const dias = diasRestantes(l.data_disputa);
  const urgente = isDiaDisputa(l.data_disputa);
  const vencidoDisputa = dias !== null && dias < 0 && ['Aberta','Em Andamento'].includes(l.status);
  const orgaoEhLink = !!l.orgao && /^https?:\/\//i.test(l.orgao.trim());

  const familia = FAMILIA_STATUS_LICIT[l.status] || 'neutro';

  return (
    <div onClick={onClick} className={'acn-licit' + (unread ? ' nova' : '')} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}>
      <div className="acn-licit-corpo">
        {/* Identificação: os marcadores que estão ligados + o nome do projeto.
            O órgão saiu daqui a pedido do usuário. Atenção aos nomes de coluna,
            que são antigos e enganam: `numero` é o que a tela chama de "Nome do
            Projeto", e `nome_projeto` é o "Nome completo do Órgão" — por isso o
            título usa `numero`, e não `nome_projeto`. */}
        <h6>
          {(Array.isArray(l.marcadores) ? l.marcadores : []).map(m => (
            <Selo key={m} familia={FAMILIA_MARCADOR[m] || 'erro'} ponto={false}>{m}</Selo>
          ))}
          {l.epp && <Selo familia="neutro" ponto={false}>EPP</Selo>}
          {l.classificacao && <Selo familia="neutro" ponto={false}>{l.classificacao}</Selo>}
          {infoTemp(l.temperatura) && (
            <span title={`Temperatura: ${infoTemp(l.temperatura).label}`} className="acn-lic-temp-emoji">{infoTemp(l.temperatura).emoji}</span>
          )}
          <span>{l.numero || '—'}</span>
        </h6>
        <div className="acn-kmeta">
          {unread && <UnreadBadge show />}
          <Selo familia={familia}>{l.status}</Selo>
          {l.data_limite_proposta && <span className="acn-num">Proposta: {fmtDT(l.data_limite_proposta)}</span>}
          {l.data_disputa && (
            <span className={'acn-num acn-lic-disputa' + (vencidoDisputa ? ' vencida' : urgente ? ' urgente' : '')}>
              Disputa: {fmtDT(l.data_disputa)}{dias!==null&&dias>=0?` · ${dias} d`:''}{vencidoDisputa ? ' · passou' : ''}
            </span>
          )}
          {l.orgao ? (
            orgaoEhLink ? (
              <a href={l.orgao} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="acn-lic-orgao-link">
                {l.orgao}
              </a>
            ) : <span>{l.orgao}</span>
          ) : null}
        </div>
      </div>
      <div className="acn-licit-acoes">
        <MarkupBadge pct={markup?.pct} min={markup?.min} max={markup?.max} discreto />
        <Botao pequeno variante="secundario" icone={mdiUpdate} onClick={e => { e.stopPropagation(); onClick(); }}>Atualizar</Botao>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE STATUS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDtRel = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
const fmtValRel = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';

// Cada grupo tem a sua família de cor (o ponto do cartão e a barrinha do título vêm dela)
const GRUPOS_RELATORIO = [
  { rot:'Em Andamento',    key:'Em Andamento', familia:'ok' },
  { rot:'Vencidas',        key:'Vencida',      familia:'ok' },
  { rot:'Finalizadas',     key:'Finalizada',   familia:'ok' },
  { rot:'Adesões a ATA',   key:'__adesao',     familia:'info' },
  { rot:'Perdidas',        key:'Perdida',      familia:'erro' },
  { rot:'Descartadas',     key:'Descartada',   familia:'neutro' },
  { rot:'Suspensas',       key:'Suspenso',     familia:'atencao' },
];

function RelatorioStatus({ licitacoes, loading, onOpenLicit, markupPorLicit = {} }) {
  const [anoFiltro, setAnoFiltro] = useState('');

  const anos = [...new Set(
    licitacoes.map(l => l.data_disputa ? new Date(l.data_disputa).getFullYear() : null).filter(Boolean)
  )].sort((a,b) => b - a);

  const filtradas = anoFiltro
    ? licitacoes.filter(l => l.data_disputa && new Date(l.data_disputa).getFullYear() === Number(anoFiltro))
    : licitacoes;

  // Montar grupos
  const getGrupo = (key) => {
    if (key === '__adesao') return filtradas.filter(l => l.classificacao === 'Adesão a ATA');
    return filtradas.filter(l => l.status === key);
  };

  if (loading) return <div className="acn-empty acn-lic-vazio">Carregando...</div>;

  return (
    <div className="acn-lic-rel">
      {/* Filtro de ano */}
      <div className="acn-lic-rel-filtro">
        <span className="acn-forte">Filtrar por ano:</span>
        <select className="acn-input acn-lic-auto" value={anoFiltro} onChange={e=>setAnoFiltro(e.target.value)}>
          <option value="">Todos os anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="acn-ajuda">{filtradas.length} licitações{anoFiltro ? ` em ${anoFiltro}` : ''}</span>
      </div>

      {/* Cards de resumo */}
      <div className="acn-kpis acn-lic-rel-kpis">
        {GRUPOS_RELATORIO.map(g => {
          const grupo = getGrupo(g.key);
          return (
            <div key={g.key} className="acn-kpi">
              <span className="rot"><i data-acn-familia={g.familia} />{g.rot}</span>
              <span className="val acn-num">{grupo.length}</span>
              <span className="sub">
                {grupo.filter(l => l.valor_proposta || l.valor_estimado).length > 0
                  ? fmtValRel(grupo.reduce((s,l) => s + (Number(l.valor_proposta) || Number(l.valor_estimado) || 0), 0))
                  : 'sem valores'}
              </span>
            </div>
          );
        })}
      </div>

      <MarkupBarraDistribuicao valores={
        filtradas.filter(l => l.status === 'Em Andamento' || l.status === 'Aberta').map(l => markupPorLicit[l.id]?.pct)
      } />

      {/* Tabelas por grupo */}
      {GRUPOS_RELATORIO.map(g => {
        const grupo = getGrupo(g.key);
        if (grupo.length === 0) return null;
        return (
          <div key={g.key} className="acn-lic-rel-grupo">
            <div className="acn-lic-rel-grupo-cab" data-acn-familia={g.familia}>
              <i className="acn-lic-rel-barra" />
              <span className="acn-lic-rel-grupo-tit">{g.rot}</span>
              <span className="acn-ajuda">({grupo.length})</span>
            </div>
            <div className="sec-card acn-lic-rel-tabela">
              <table className="acn-tabela acn-densa">
                <thead>
                  <tr>
                    <th className="esq">Nº</th>
                    <th className="esq">Projeto / Órgão</th>
                    <th className="esq">Tipo</th>
                    <th className="dir">Valor</th>
                    <th className="esq">Disputa</th>
                    <th className="esq">Status</th>
                    <th className="centro">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map(l => (
                    <tr key={l.id} className="acn-lic-linha" onClick={() => onOpenLicit(l)}>
                      <td className="acn-forte acn-lic-nowrap">{l.numero || '—'}</td>
                      <td className="acn-lic-projeto">
                        <div className="acn-forte">{l.nome_projeto || '—'}</div>
                        <div className="acn-ajuda">{l.orgao || ''}</div>
                      </td>
                      <td>{l.classificacao || '—'}</td>
                      <td className="dir acn-txt-ok">
                        {fmtValRel(l.valor_proposta || l.valor_estimado)}
                      </td>
                      <td className="acn-lic-nowrap">{fmtDtRel(l.data_disputa)}</td>
                      <td><Selo familia={FAMILIA_STATUS_LICIT[l.status] || 'neutro'}>{l.status}</Selo></td>
                      <td className="centro">
                        <Botao pequeno onClick={e => { e.stopPropagation(); onOpenLicit(l); }}>Ver</Botao>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARTÕES DE PIPELINE — mesmo conceito/estilo do CRM (CrmTab.tsx,
// renderResumoCards): Em Negociação / Perdidas / Ganhas / Aguardando
// Faturamento, com filtro de mês. Mapeamento de status de Licitações
// (STATUS_LIST) pros conceitos de pipeline do CRM:
//   Em Negociação = Aberta + Em Andamento
//   Perdidas       = Perdida  (Descartada fica de fora, é categoria à
//                    parte, mesmo padrão do CRM que separa Perdido de
//                    Desistência)
//   Ganhas         = Vencida (Finalizada NÃO entra — ao contrário do CRM,
//                    onde Vencido→Faturado é sequencial, em Licitações
//                    "Vencida" e "Finalizada" são status PARALELOS e
//                    independentes, ambos alcançáveis direto a partir de
//                    "Em Andamento" — ver statusAnterior()/botões de
//                    status acima. "Finalizada" não significa "vencida e
//                    já faturada", é outro desfecho.
//   Aguardando Faturamento = mesmo conjunto de "Ganhas" (Vencida) — ao
//                    contrário do CRM, `licitacoes` não tem nenhum campo
//                    que diferencie "vencida, aguardando faturar" de
//                    "vencida, já faturada" (isso acontece só depois, na
//                    OP/OS gerada a partir da licitação vencida, sem
//                    vínculo de volta pra cá — oples não tem
//                    licitacao_id). Cartão fica igual ao de Ganhas até
//                    que esse rastreamento exista de verdade.
// Filtro de mês usa `atualizado_em` (data em que entrou no status atual;
// também é tocado por edições sem troca de status).
// ─────────────────────────────────────────────────────────────────────────────
function PipelineCardsLicitacoes({ licitacoes, total = null }: any) {
  const [mesFiltro, setMesFiltro] = useState('');
  // quando os filtros da lista recortam o pipeline, diz em cima de quantas
  // licitações ele está contando — senão o número muda e ninguém sabe por quê
  const recortado = total != null && licitacoes.length !== total;
  const noMes = (l: any) => !mesFiltro || (l.atualizado_em || '').slice(0,7) === mesFiltro;
  // `valor_proposta` nunca existiu na tabela — o código lia um campo fantasma e
  // caía no estimado por acidente. O valor do pipeline é o ESTIMADO, e é isso
  // que o rodapé diz (28/09/2026). Valor de proposta fechada mora na formação
  // de preços e ainda não tem caminho de volta para cá.
  const valorDe = (l: any) => Number(l.valor_estimado) || 0;

  const emNegociacao = licitacoes.filter((l:any) => ['Aberta','Em Andamento'].includes(l.status) && noMes(l));
  const perdidas     = licitacoes.filter((l:any) => l.status === 'Perdida' && noMes(l));
  const ganhas       = licitacoes.filter((l:any) => l.status === 'Vencida' && noMes(l));
  const aguardando   = ganhas;

  const totalNegociacao = emNegociacao.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalPerdidas    = perdidas.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalGanhas      = ganhas.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalAguardando  = aguardando.reduce((s:number,l:any) => s + valorDe(l), 0);

  const cartoes = [
    { rot: 'Em negociação', n: emNegociacao.length, total: totalNegociacao, cor: '',                sub: 'licitações abertas ou em andamento' },
    { rot: 'Ganhas',        n: ganhas.length,       total: totalGanhas,     cor: 'acn-txt-ok',      sub: 'vencidas' },
    { rot: 'Perdidas',      n: perdidas.length,     total: totalPerdidas,   cor: 'acn-txt-erro',    sub: 'perdidas' },
    { rot: 'Aguardando faturamento', n: aguardando.length, total: totalAguardando, cor: 'acn-txt-atencao', sub: 'ganhas ainda não faturadas' },
  ];
  return (
    <div className="acn-lic-pipe-bloco">
      {/* Mesma faixa do Comercial/CRM: valor, quantidade e o que significa */}
      <div className="sec-card acn-pipe acn-lic-pipe4">
        {cartoes.map(c => (
          <div key={c.rot}>
            <span className="rot">{c.rot}</span>
            <span className={'val acn-num ' + c.cor}>{c.total > 0 ? fmtValRel(c.total) : c.n}</span>
            <span className="sub"><span className="acn-num">{c.n}</span> {c.sub}</span>
          </div>
        ))}
      </div>
      <div className="acn-kmeta acn-lic-pipe-mes">
        <label htmlFor="licit-mes-pipeline">Mês do pipeline</label>
        <input id="licit-mes-pipeline" type="month" className="acn-input acn-lic-mes" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} />
        {mesFiltro && <Botao pequeno variante="discreto" icone={mdiClose} onClick={() => setMesFiltro('')}>Limpar</Botao>}
        <span className="acn-ajuda">
          valores pelo <b>estimado</b>
          {recortado && <> · contando <b>{licitacoes.length}</b> de {total} licitações, pelos filtros da lista</>}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function LicitacoesTab({ currentUser, autoOpenLicitId, onAutoOpenConsumed }: any) {
  const [licitacoes, setLicitacoes] = useState<any[]>([]);
  // { pct ponderado pelo custo, min, max } por licitação — ver MarkupTermometro
  const [markupPorLicit, setMarkupPorLicit] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('Aberta');
  const [filtroTipo, setFiltroTipo] = useState<string>('Direta');
  const [filtroTemp, setFiltroTemp] = useState<string>('');
  const [filtroMarkup, setFiltroMarkup] = useState<string>('');   // faixa de markup (07/10/2026)
  const [filtroAnaliseSetor, setFiltroAnaliseSetor] = useState<string>('todas');
  const [analisesPendentesPorLicit, setAnalisesPendentesPorLicit] = useState<Record<string,string[]>>({});
  const [filtroPeriodoDe, setFiltroPeriodoDe] = useState('');
  const [filtroPeriodoAte, setFiltroPeriodoAte] = useState('');
  const [sortBy, setSortBy] = useState('data_disputa');
  const [modalNova, setModalNova] = useState(false);
  const [selected, setSelected] = useState<any|null>(null);
  const [vistaRelatorio, setVistaRelatorio] = useState(false);
  const [modoRecentes, setModoRecentes] = useState(false);
  const [agrupamentoPeriodo, setAgrupamentoPeriodo] = useState<''|'semana'|'mes'|'bimestre'|'trimestre'|'semestre'>('');
  const [recentesLicit, setRecentesLicit] = useState<any[]>([]);
  const [recentesLicitLoading, setRecentesLicitLoading] = useState(false);
  const [erroLista, setErroLista] = useState('');   // 7.61: leitura que falha não pode parecer "nenhuma licitação"

  const isAdmin = true;
  const isAnalista = true;

  // Rastreamento de não lidos — mesmo sistema de auditoria/colaboração usado no
  // CRM (AuditSystem.tsx), substitui o antigo useUnread (baseado só em
  // atualizado_em, sem saber qual campo mudou) por um destaque granular por
  // campo/item dentro do modal + borda lateral amarela no card aqui.
  const { naoLidoSet: licitacoesNaoLidas } = useUnreadMap('licitacoes', licitacoes.map(l => l.id), currentUser);

  // Auto-abre licitação quando navegado via Telecom (analise:abrir-origem)
  useEffect(() => {
    if (!autoOpenLicitId || loading || licitacoes.length === 0) return;
    const l = licitacoes.find(x => x.id === autoOpenLicitId);
    if (l) {
      setSelected(l);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenLicitId, loading, licitacoes]);

  // Deep-link genérico (Menções, Chat — "Licitação X" clicável, contexto
  // 'licitacao') — mesmo padrão já usado em ComprasTab/SetorDemandaTab/etc,
  // que faltava aqui: abre o detalhe direto em vez de só cair na aba.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'licitacao') return;
      (window as any).__acnDeepLink = null;
      supabase.from('licitacoes').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setSelected(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  // Registra "últimas visualizadas" — upsert, dispara toda vez que uma
  // licitação diferente é aberta no detalhe.
  useEffect(() => {
    if (!selected?.id || !currentUser?.id) return;
    supabase.from('visualizacoes_recentes')
      .upsert(
        { usuario_id: currentUser.id, tipo: 'licitacao', registro_id: selected.id, visualizado_em: new Date().toISOString() },
        { onConflict: 'usuario_id,tipo,registro_id' }
      ).then(() => {});
  }, [selected?.id, currentUser?.id]);

  // Carrega a lista de "Últimas Visualizadas" (20 mais recentes do usuário)
  const carregarRecentesLicit = useCallback(async () => {
    if (!currentUser?.id) return;
    setRecentesLicitLoading(true);
    const { data } = await supabase.from('visualizacoes_recentes')
      .select('registro_id, visualizado_em')
      .eq('usuario_id', currentUser.id).eq('tipo', 'licitacao')
      .order('visualizado_em', { ascending: false }).limit(20);
    setRecentesLicit(data || []);
    setRecentesLicitLoading(false);
  }, [currentUser?.id]);
  useEffect(() => { if (modoRecentes) carregarRecentesLicit(); }, [modoRecentes, carregarRecentesLicit]);

  const excluirLicitacao = async (l: any) => {
    // Regra de 07/10/2026 (pedido do usuário): só Admin e o Gerente de Licitações excluem uma licitação (antes o botão aparecia para todos: `isAdmin` era fixo em true); e com OP lançada
    // a partir dos pedidos ou formação de preços vinculada ela NÃO é excluída (ver ExclusaoDeCard.ts).
    if (!podeExcluirLicitacao(currentUser)) { mostrarAviso('Só o Admin e o Gerente de Licitações podem excluir uma licitação.', 'atencao'); return; }
    const bloq = await bloqueiosDeExclusao('licitacao', l.id);
    if (bloq.erro) { mostrarAviso(`Não foi possível conferir o que está ligado a "${l.numero}" (${bloq.erro}). Por segurança, nada foi excluído.`, 'erro'); return; }
    if (bloq.motivos.length) { mostrarAviso(`"${l.numero}" não pode ser excluída porque tem:\n• ${bloq.motivos.join('\n• ')}\nDesfaça esses vínculos antes de excluir.`, 'atencao'); return; }
    if (!await confirmar(`Excluir "${l.numero} — ${l.nome_projeto}"?`)) return;
    // 7.61: a cópia de segurança saía da linha da LISTA (sem as Áreas Livres) e era guardada depois de apagar; ver excluirComUndo
    const ok = await excluirComUndo('licitacoes', l.id, currentUser?.nome || currentUser?.email, `Licitação "${l.numero}"`);
    if (!ok) return;
    setSelected(null);
    fetchLicit();
  };

  const fetchLicit = useCallback(async () => {
    setLoading(true);
    // A lista NÃO traz areas_livres: é o texto rico das Áreas Livres, com imagens
    // coladas dentro (mais de 8 MB somando todas; um registro tem 2 MB). Com
    // select('*') a lista estourava o tempo limite do banco e não carregava.
    // O card busca areas_livres ao abrir (LicitacaoModal). Coluna nova na tabela
    // precisa entrar aqui também.
    const { data, error } = await supabase.from('licitacoes')
      .select(COLUNAS_LISTA_LICITACOES)
      .order('criado_em', { ascending: false });
    if (error) { setErroLista(error.message); setLoading(false); return; }   // mantém a lista que já estava na tela
    setErroLista('');
    setLicitacoes(data || []);
    // Termômetro de markup — busca em lote (1x por tela), não bloqueia o load principal
    carregarMarkupPorProcesso('licitacao').then(setMarkupPorLicit);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLicit(); }, [fetchLicit]);

  // Filtro "por Análise" — mapeia licitação → setores com solicitação de
  // análise pendente (analise_solicitacoes/analise_setores, mesma estrutura
  // usada em AnaliseWidget.tsx). Busca em lote, refeita sempre que a lista
  // de licitações mudar.
  useEffect(() => {
    const ids = licitacoes.map(l => l.id);
    if (!ids.length) { setAnalisesPendentesPorLicit({}); return; }
    supabase.from('analise_solicitacoes')
      .select('origem_id, analise_setores(setor, status)')
      .eq('origem', 'licitacao').eq('status', 'em_andamento')
      .in('origem_id', ids)
      .then(({ data }) => {
        const mapa: Record<string,string[]> = {};
        (data || []).forEach((sol: any) => {
          const pendentes = (sol.analise_setores || []).filter((s: any) => s.status === 'pendente').map((s: any) => s.setor);
          if (pendentes.length) mapa[sol.origem_id] = [...(mapa[sol.origem_id]||[]), ...pendentes];
        });
        setAnalisesPendentesPorLicit(mapa);
      });
  }, [licitacoes]);

  // "Últimas Visualizadas" — ignora os demais filtros/ordenação, mostra
  // exatamente as 20 mais recentes do usuário, na ordem em que foram vistas.
  const listaRecentes = modoRecentes
    ? recentesLicit.map(r => licitacoes.find(l => l.id === r.registro_id)).filter(Boolean)
    : null;

  /**
   * A BASE DO PIPELINE — todos os filtros MENOS o de status (28/09/2026)
   *
   * Em 25/09 o pipeline foi congelado no total geral para corrigir um bug: ele
   * seguia o filtro de status e, ao filtrar "Aberta", os cartões de Ganhas,
   * Perdidas e Aguardando faturamento zeravam — status é o próprio eixo que o
   * pipeline mostra. A correção resolveu o zero mas tirou o pipeline do ar:
   * filtrar por tipo, temperatura ou período não mexia mais nele.
   *
   * Agora ele acompanha tudo que não seja status. Filtrar "Dispensa" mostra o
   * pipeline das dispensas; escolher um período mostra o pipeline do período;
   * e os quatro cartões continuam de pé em qualquer um dos casos.
   */
  const baseSemStatus = licitacoes
    .filter(l => filtroTipo === 'todos' || l.classificacao === filtroTipo)
    .filter(l => !filtroTemp || l.temperatura === filtroTemp)
    .filter(l => !filtroMarkup || idFaixaMarkup(markupPorLicit[l.id]?.pct) === filtroMarkup)
    .filter(l => filtroAnaliseSetor === 'todas' || (analisesPendentesPorLicit[l.id]||[]).includes(filtroAnaliseSetor))
    .filter(l => {
      if (!filtroPeriodoDe && !filtroPeriodoAte) return true;
      const disp = l.data_disputa ? new Date(l.data_disputa) : null;
      if (!disp) return !filtroPeriodoDe;
      if (filtroPeriodoDe && disp < new Date(filtroPeriodoDe)) return false;
      if (filtroPeriodoAte && disp > new Date(filtroPeriodoAte + 'T23:59:59')) return false;
      return true;
    });

  const lista = listaRecentes || baseSemStatus
    .filter(l => filtroStatus === 'todas' || l.status === filtroStatus)
    .filter(l => {
      // "Últimas Alterações" filtra, além de ordenar — só processos alterados
      // desde o login anterior ao atual. Sem login anterior registrado (1º
      // acesso), não há linha de corte: mostra tudo.
      if (sortBy !== 'ultimas_alteracoes') return true;
      const desde = currentUser?.ultimo_login_anterior;
      if (!desde) return true;
      return !!l.atualizado_em && new Date(l.atualizado_em) > new Date(desde);
    })
    .sort((a, b) => {
      if (sortBy === 'ultimas_alteracoes') {
        const da = a.atualizado_em ? new Date(a.atualizado_em).getTime() : 0;
        const db2 = b.atualizado_em ? new Date(b.atualizado_em).getTime() : 0;
        return db2 - da;
      }
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'orgao') return (a.orgao||'').localeCompare(b.orgao||'');
      if (sortBy === 'disputa_recente') {
        // disputa mais recente primeiro; sem data de disputa vai para o fim
        const da = a.data_disputa ? new Date(a.data_disputa).getTime() : -Infinity;
        const db2 = b.data_disputa ? new Date(b.data_disputa).getTime() : -Infinity;
        return db2 - da;
      }
      const da = a[sortBy] ? new Date(a[sortBy]).getTime() : Infinity;
      const db2 = b[sortBy] ? new Date(b[sortBy]).getTime() : Infinity;
      return da - db2;
    });

  // Agrupamento por período (semana/mês/bimestre/trimestre/semestre) — só
  // faz sentido sobre a lista normal, não sobre "Últimas Visualizadas".
  const gruposPeriodo = (agrupamentoPeriodo && !modoRecentes) ? (() => {
    const mapa: Record<string, { label: string; itens: any[] }> = {};
    const semPrevisao: any[] = [];
    lista.forEach((l: any) => {
      if (!l.data_disputa) { semPrevisao.push(l); return; }
      const { key, label } = bucketPeriodo(l.data_disputa, agrupamentoPeriodo);
      if (!mapa[key]) mapa[key] = { label, itens: [] };
      mapa[key].itens.push(l);
    });
    const grupos = Object.keys(mapa).sort().map(k => mapa[k]);
    if (semPrevisao.length) grupos.push({ label: 'Sem previsão', itens: semPrevisao });
    return grupos;
  })() : null;

  const conts: Record<string,number> = {};
  licitacoes.forEach(l => { conts[l.status] = (conts[l.status]||0) + 1; });

  return (
    <div className="acn-lic-tela">
      <UndoToast onRestaurado={fetchLicit} />

      <CabecalhoTela
        titulo="Licitações"
        subtitulo={<><span className="acn-num">{licitacoes.length}</span> no total · {lista.length} exibindo</>}
        acoes={isAnalista && <Botao variante="primario" icone={mdiPlus} onClick={() => setModalNova(true)}>Nova licitação</Botao>}
      />

      {/* AGENDA */}
      <div className="acn-lic-agenda">
        <AgendaWidget setor="licitacoes" currentUser={currentUser} />
      </div>

      {/* PIPELINE — mesma faixa do Comercial/CRM */}
      <div className="acn-lic-fixo">
        {/* Segue tipo, temperatura, setor de análise e período — só não segue
            o status, que é o eixo dos próprios cartões (ver baseSemStatus). */}
        <PipelineCardsLicitacoes licitacoes={baseSemStatus} total={licitacoes.length} />
      </div>

      <div className="sec-card acn-lic-filtros-card">
        {/* STATUS + RELATÓRIO */}
        <div className="acn-filtros">
          <Botao pequeno variante={vistaRelatorio ? 'primario' : 'secundario'} icone={vistaRelatorio ? mdiArrowLeft : mdiChartBar}
            onClick={() => setVistaRelatorio(v => !v)}>{vistaRelatorio ? 'Voltar à lista' : 'Relatório'}</Botao>
          <Botao pequeno variante={modoRecentes ? 'primario' : 'secundario'} icone={mdiHistory}
            onClick={() => setModoRecentes(v => !v)} aria-pressed={modoRecentes}>Últimas visualizadas</Botao>
          <Chips rotulo="Status" ativo={filtroStatus} onChange={setFiltroStatus}
            itens={[{ id:'todas', rotulo:'Todas', contagem: licitacoes.length }, ...STATUS_LIST.map(st => ({ id: st, rotulo: st, contagem: conts[st] || 0 }))]} />
          {/* Temperatura das propostas — mini gráfico de barras clicável (mesmo do CRM) */}
          {(() => {
            const base = licitacoes.filter(l => filtroStatus === 'todas' || l.status === filtroStatus);
            const cont: Record<string, number> = { frio: 0, morno: 0, quente: 0 };
            base.forEach(l => { if (cont[l.temperatura] !== undefined) cont[l.temperatura]++; });
            const max = Math.max(1, cont.frio, cont.morno, cont.quente);
            return (
              <div title="Temperatura das propostas — clique numa barra para filtrar" className="acn-temp-barras">
                {TEMPERATURAS.map(t => {
                  const n = cont[t.v];
                  const ativo = filtroTemp === t.v;
                  return (
                    <div key={t.v} role="button" tabIndex={0} aria-pressed={ativo} aria-label={`${t.label}: ${n}`}
                      onClick={() => setFiltroTemp(ativo ? '' : t.v)} onKeyDown={e => { if (e.key === 'Enter') setFiltroTemp(ativo ? '' : t.v); }}
                      title={`${t.emoji} ${t.label}: ${n}`}
                      className="acn-lic-temp-col">
                      <div className={'acn-lic-temp-barra' + (ativo || !filtroTemp ? '' : ' apagada')} data-temp={t.v} style={{ height: Math.max(3, Math.round((n / max) * 18)) }} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {filtroTemp && (
            <Botao pequeno variante="discreto" onClick={() => setFiltroTemp('')} title="Limpar filtro de temperatura">
              {infoTemp(filtroTemp)?.emoji} {infoTemp(filtroTemp)?.label} ✕
            </Botao>
          )}
        </div>

        {/* FILTROS */}
        <div className="acn-filtros acn-lic-filtros-fim">
          <div>
            <label className="acn-label">Ordenar por</label>
            <select className="acn-input acn-lic-auto" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="acn-label">Tipo</label>
            <select className="acn-input acn-lic-auto" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              <option>Direta</option><option>Parceiro</option><option>Adesão a ATA</option>
            </select>
          </div>
          <div>
            <label className="acn-label">Markup</label>
            <select className="acn-input acn-lic-auto" value={filtroMarkup} onChange={e=>setFiltroMarkup(e.target.value)} aria-label="Faixa de markup">
              <option value="">Todas as faixas</option>
              {OPCOES_FAIXA_MARKUP.filter(f => f.id !== 'sem_regua').map(f => {
                const n = licitacoes.filter(l => idFaixaMarkup(markupPorLicit[l.id]?.pct) === f.id).length;
                return (n > 0 || filtroMarkup === f.id) ? <option key={f.id} value={f.id}>{f.label} ({n})</option> : null;
              })}
            </select>
          </div>
          <div>
            <label className="acn-label">Análise</label>
            <select className="acn-input acn-lic-auto" value={filtroAnaliseSetor} onChange={e=>setFiltroAnaliseSetor(e.target.value)}>
              <option value="todas">Todas</option>
              <option value="Orcamento">Orçamentária</option>
              <option value="Telecom">Telecom</option>
              <option value="Engenharia">Engenharia</option>
              <option value="Comercial">Comercial</option>
            </select>
          </div>
          <div>
            <label className="acn-label">Disputa de</label>
            <input className="acn-input acn-lic-auto" type="date" value={filtroPeriodoDe} onChange={e=>setFiltroPeriodoDe(e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Até</label>
            <input className="acn-input acn-lic-auto" type="date" value={filtroPeriodoAte} onChange={e=>setFiltroPeriodoAte(e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Agrupar por período</label>
            <select className="acn-input acn-lic-auto" value={agrupamentoPeriodo} onChange={e=>setAgrupamentoPeriodo(e.target.value as any)}>
              <option value="">Não agrupar</option>
              <option value="semana">Semana</option>
              <option value="mes">Mês</option>
              <option value="bimestre">Bimestre</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
            </select>
          </div>
          {(filtroTipo!=='Direta'||filtroAnaliseSetor!=='todas'||filtroMarkup||filtroPeriodoDe||filtroPeriodoAte||agrupamentoPeriodo) && (
            <Botao pequeno variante="discreto" icone={mdiClose}
              onClick={() => { setFiltroTipo('Direta'); setFiltroAnaliseSetor('todas'); setFiltroMarkup(''); setFiltroPeriodoDe(''); setFiltroPeriodoAte(''); setAgrupamentoPeriodo(''); }}>
              Limpar filtros
            </Botao>
          )}
        </div>
      </div>

      {erroLista && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={fetchLicit}>Tentar de novo</Botao>}>Não foi possível ler as licitações ({erroLista}). Isso não quer dizer que não haja licitação{licitacoes.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.</Faixa>
      )}

      {/* LISTA ou RELATÓRIO */}
      {vistaRelatorio ? (
        <RelatorioStatus licitacoes={licitacoes} loading={loading} onOpenLicit={setSelected} markupPorLicit={markupPorLicit} />
      ) : (
        <div className="acn-lic-lista">
          {loading || (modoRecentes && recentesLicitLoading) ? (
            <div className="acn-empty acn-lic-vazio">Carregando...</div>
          ) : !lista.length ? (
            erroLista ? null : <div className="acn-empty acn-lic-vazio">
              {modoRecentes ? 'Nenhuma licitação visualizada ainda.'
                : filtroStatus !== 'todas' ? `Nenhuma licitação com status "${filtroStatus}".` : 'Nenhuma licitação cadastrada.'}
            </div>
          ) : gruposPeriodo ? (
            gruposPeriodo.map((g, i) => (
              <div key={i} className="acn-lic-grupo">
                <div className="acn-kcab acn-lic-grupo-cab">
                  <span>{g.label}</span><em>{g.itens.length}</em>
                </div>
                {g.itens.map((l:any) => <LicitCard key={l.id} l={l} unread={licitacoesNaoLidas.has(String(l.id))} onClick={() => setSelected(l)} markup={markupPorLicit[l.id]} />)}
              </div>
            ))
          ) : (
            lista.map(l => <LicitCard key={l.id} l={l} unread={licitacoesNaoLidas.has(String(l.id))} onClick={() => setSelected(l)} markup={markupPorLicit[l.id]} />)
          )}
        </div>
      )}

      {/* MODAIS */}
      {modalNova && (
        <ModalNova currentUser={currentUser} onClose={() => setModalNova(false)} onSaved={fetchLicit} />
      )}
      {selected && (
        <LicitacaoModal
          licit={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onExcluir={() => excluirLicitacao(selected)}
          onRefresh={() => {
            fetchLicit();
            supabase.from('licitacoes').select('*').eq('id', selected.id).single()
              .then(({ data }) => { if (data) setSelected(data); });
          }}
        />
      )}
    </div>
  );
}
