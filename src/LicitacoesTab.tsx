// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ModalSolicitarAnalise, AnaliseStatusPanel, AnaliseStatusBadge } from './AnaliseWidget';
import AgendaWidget from './AgendaWidget';
import { UnreadBadge } from './useUnread';
import { salvarMencoes } from './MencaoTextarea';
import Linkify from './Linkify';
import FormacaoPrecosTab from './FormacaoPrecosTab';
import RichTextInput, { htmlSeguro, pareceHtmlFormatado } from './RichTextInput';
import { logChange, useUnreadChanges, useMarkAsRead, useUnreadMap } from './AuditSystem';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LIST = ['Aberta','Em Andamento','Vencida','Finalizada','Perdida','Descartada','Suspenso'];
const STATUS_COR: Record<string,string> = {
  'Aberta':       '#2563eb',
  'Em Andamento': '#059669',
  'Vencida':      '#16a34a',
  'Finalizada':   '#0d9488',
  'Perdida':      '#dc2626',
  'Descartada':   '#6b7280',
  'Suspenso':     '#d97706',
};
const MARCADORES = ['Em Recurso','Em Defesa','Impugnado'];
const PRIORIDADES = ['Alta','Média','Baixa'];
const PRIO_COR: Record<string,string> = { 'Alta':'#dc2626','Média':'#d97706','Baixa':'#16a34a' };
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
async function registrarExclusaoParaUndo(tabela: string, dados: any, deletadoPor: string, label: string) {
  const { data } = await supabase.from('lixeira').insert([{
    tabela, registro_id: dados.id, dados, deletado_por: deletadoPor,
  }]).select('id').single();
  if (data?.id) {
    window.dispatchEvent(new CustomEvent('acn:undo-disponivel', { detail: { lixeiraId: data.id, label } }));
  }
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
    <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', zIndex:5000,
      background:'#1e293b', color:'#fff', borderRadius:8, padding:'10px 16px',
      display:'flex', alignItems:'center', gap:12, boxShadow:'0 4px 16px #0004', fontSize:11 }}>
      <span>🗑️ {pendente.label} excluído(a).</span>
      <button onClick={desfazer}
        style={{ background:'#f59e0b', color:'#1e293b', border:'none', borderRadius:4, padding:'4px 12px', fontWeight:800, fontSize:10, cursor:'pointer' }}>
        ↩ Desfazer (Ctrl+Z)
      </button>
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
    return { key: seg.toISOString().slice(0, 10), label: `Semana de ${fmtDataCurta(seg)} a ${fmtDataCurta(dom)}` };
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
  { value:'criado_em',                   label:'Mais Recentes' },
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
  [{ categoria:'edital_anexos', label:'📄 Edital / Anexos' }],
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
  const officeExts = /\.(docx?|xlsx?|pptx?)$/i;
  const contentType = officeExts.test(file.name) ? 'application/octet-stream' : file.type;
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
  const cor = vencido ? '#dc2626' : urgente ? '#d97706' : '#374151';
  const bg  = vencido ? '#fef2f2' : urgente ? '#fffbeb' : '#f8fafc';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:bg,
      color:cor, border:`1px solid ${cor}30`, borderRadius:4, padding:'1px 6px', fontSize:9, fontWeight:700 }}>
      {label}: {fmtDT(value)}
      {vencido && ' ⚠️'}
      {urgente && ` (${dias}d)`}
    </span>
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

  const fetchContatos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('licitacao_contatos')
      .select('*').eq('licitacao_id', licitacaoId).order('criado_em');
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
    if (!confirm('Remover este contato?')) return;
    const { data: reg } = await supabase.from('licitacao_contatos').select('*').eq('id', id).maybeSingle();
    await supabase.from('licitacao_contatos').delete().eq('id', id);
    if (reg) registrarExclusaoParaUndo('licitacao_contatos', reg, currentUser?.nome || currentUser?.email, `Contato "${reg.nome||'—'}"`);
    fetchContatos();
  };

  const iniciarEdicao = (c: any) => {
    setEditandoId(c.id);
    setForm({ nome: c.nome||'', tipo_contato: c.tipo_contato||'', email: c.email||'', observacao: c.observacao||'', telefones: c.telefones?.length ? c.telefones : [{ numero:'', tipo:'Celular' }] });
    setAdicionando(false);
  };

  const isMobile = (tipo: string) => tipo === 'Celular' || tipo === 'WhatsApp';

  const inputStyle = { width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' as const };

  const FormContato = () => (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:10, marginBottom:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
        <div>
          <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:1 }}>NOME *</label>
          <input value={form.nome} onChange={e=>setF('nome',e.target.value)} style={inputStyle} placeholder="Nome" />
        </div>
        <div>
          <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:1 }}>TIPO DE CONTATO</label>
          <select value={form.tipo_contato} onChange={e=>setF('tipo_contato',e.target.value)} style={inputStyle}>
            <option value="">Selecione...</option>
            {TIPO_CONTATO_OPCOES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:6 }}>
        <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:1 }}>E-MAIL</label>
        <input type="email" value={form.email} onChange={e=>setF('email',e.target.value)} style={inputStyle} placeholder="email@exemplo.com" />
      </div>
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:4, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>TELEFONES</span>
          <button onClick={addTelefone} style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:3, padding:'1px 6px', fontSize:9, cursor:'pointer' }}>+ Adicionar</button>
        </div>
        {(form.telefones||[]).map((tel: any, i: number) => (
          <div key={i} style={{ display:'flex', gap:4, marginBottom:4, alignItems:'center' }}>
            <input value={tel.numero} onChange={e=>setTel(i,'numero',e.target.value)}
              style={{ ...inputStyle, flex:2 }} placeholder="(11) 99999-9999" />
            <select value={tel.tipo} onChange={e=>setTel(i,'tipo',e.target.value)} style={{ ...inputStyle, flex:1 }}>
              <option>Celular</option><option>Fixo</option><option>WhatsApp</option>
            </select>
            {(form.telefones||[]).length > 1 && (
              <button onClick={()=>removeTel(i)} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 3px', flexShrink:0 }}>✕</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginBottom:8 }}>
        <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:1 }}>OBSERVAÇÃO</label>
        <RichTextInput value={form.observacao} onChange={html=>setF('observacao',html)}
          style={{ ...inputStyle }} minHeight={40} placeholder="Observações... (selecione um trecho pra formatar)" />
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={salvar} style={{ flex:1, background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'5px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
          {editandoId ? '💾 Salvar' : '+ Adicionar'}
        </button>
        <button onClick={() => { setAdicionando(false); setEditandoId(null); setForm(contatoVazio); }}
          style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:10, cursor:'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <button onClick={() => setExpandido(e => !e)}
          style={{ fontSize:9, fontWeight:700, color:'#374151', textTransform:'uppercase', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
          {expandido ? '▼' : '▶'} CONTATOS DO PROCESSO {contatos.length > 0 ? `(${contatos.length})` : ''}
        </button>
        {expandido && !adicionando && !editandoId && (
          <button onClick={() => { setAdicionando(true); setEditandoId(null); setForm(contatoVazio); }}
            style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontWeight:700 }}>
            + Contato
          </button>
        )}
      </div>

      {expandido && (
        <div>
          {(adicionando && !editandoId) && <FormContato />}

          {loading && <div style={{ fontSize:10, color:'#9ca3af', padding:4 }}>Carregando...</div>}

          {contatos.map((c: any) => (
            <div key={c.id}>
              {editandoId === c.id ? <FormContato /> : (
                <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:5, padding:'7px 10px', marginBottom:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:2 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{c.nome}</span>
                        {c.tipo_contato && (
                          <span style={{ fontSize:9, background:'#e0f2fe', color:'#0369a1', borderRadius:3, padding:'1px 5px', fontWeight:700 }}>{c.tipo_contato}</span>
                        )}
                      </div>
                      {c.email && (
                        <div style={{ fontSize:10, color:'#2563eb', marginBottom:2 }}>
                          <a href={`mailto:${c.email}`} style={{ color:'#2563eb', textDecoration:'none' }}>✉ {c.email}</a>
                        </div>
                      )}
                      {(c.telefones||[]).length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {(c.telefones||[]).map((tel: any, i: number) => (
                            <span key={i} style={{ fontSize:10, color:'#374151' }}>
                              {isMobile(tel.tipo) ? (
                                <a href={wppLink(tel.numero)} target="_blank" rel="noreferrer"
                                  style={{ color:'#16a34a', textDecoration:'none', fontWeight:600 }}>
                                  📱 {tel.numero}
                                </a>
                              ) : (
                                <span>📞 {tel.numero}</span>
                              )}
                              <span style={{ fontSize:8, color:'#9ca3af', marginLeft:2 }}>({tel.tipo})</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {c.observacao && <div style={{ fontSize:9, color:'#6b7280', marginTop:2, fontStyle:'italic', wordBreak:'break-word' }} dangerouslySetInnerHTML={{ __html: htmlSeguro(c.observacao) }} />}
                    </div>
                    <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                      <button onClick={() => iniciarEdicao(c)}
                        style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:11, padding:'0 3px' }}>✏️</button>
                      <button onClick={() => excluir(c.id)}
                        style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:11, padding:'0 3px' }}>✕</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loading && contatos.length === 0 && !adicionando && (
            <div style={{ fontSize:10, color:'#9ca3af', textAlign:'center', padding:'8px 0' }}>Nenhum contato cadastrado.</div>
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
  const inserirTabela = () => {
    const linhasStr = window.prompt('Quantas linhas?', '3');
    if (linhasStr === null) return;
    const colunasStr = window.prompt('Quantas colunas?', '3');
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
  const excluirTabela = () => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const el = anchor && (anchor.nodeType === 3 ? anchor.parentElement : (anchor as HTMLElement));
    const tabela = el?.closest?.('table');
    if (!tabela || !editorRef.current?.contains(tabela)) {
      alert('Posicione o cursor dentro de uma tabela para excluí-la.');
      return;
    }
    if (!window.confirm('Excluir esta tabela? Esta ação não pode ser desfeita.')) return;
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
    <div style={{ background:'#f8fafc', border:`1px solid ${naoLida ? '#fde047' : '#e2e8f0'}`, borderRadius:6, overflow:'hidden', marginTop:10,
      boxShadow: naoLida ? '0 0 0 3px #fefce8' : 'none' }}>
      {/* Toolbar */}
      <div style={{ background:'#f1f5f9', borderBottom:'1px solid #e2e8f0', padding:'4px 8px',
        display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginRight:4 }}>✏️ Área Livre</span>
        {(['bold','italic','underline','strikeThrough'] as const).map(cmd => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); }}
            title={cmd === 'bold' ? 'Negrito' : cmd === 'italic' ? 'Itálico' : cmd === 'underline' ? 'Sublinhado' : 'Tachado'}
            style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
              padding:'2px 7px', fontSize:11, fontWeight: cmd==='bold' ? 700 : 400,
              fontStyle: cmd==='italic' ? 'italic' : 'normal',
              textDecoration: cmd==='underline' ? 'underline' : cmd==='strikeThrough' ? 'line-through' : 'none',
              cursor:'pointer', lineHeight:1.4 }}>
            {cmd === 'bold' ? 'B' : cmd === 'italic' ? 'I' : cmd === 'underline' ? 'S' : 'X'}
          </button>
        ))}
        {/* Cor de texto e destaque/pintado — reaproveita o padrão de input
            escondido já usado para inserir imagem (imgInputRef abaixo). */}
        <button onMouseDown={e => { e.preventDefault(); salvarSelecao(); corTextoRef.current?.click(); }}
          title="Cor do texto"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          🎨
        </button>
        <input ref={corTextoRef} type="color" style={{ display:'none' }}
          onChange={e => { restaurarSelecaoEAplicar('foreColor', e.target.value); autosave(); }} />
        <button onMouseDown={e => { e.preventDefault(); salvarSelecao(); corDestaqueRef.current?.click(); }}
          title="Destacar / pintar fundo do texto"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          🖍️
        </button>
        <input ref={corDestaqueRef} type="color" style={{ display:'none' }}
          onChange={e => { restaurarSelecaoEAplicar('hiliteColor', e.target.value); autosave(); }} />
        <button onMouseDown={e => {
          e.preventDefault();
          const url = window.prompt('URL do link:');
          if (url) document.execCommand('createLink', false, url);
        }} title="Inserir link"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          🔗
        </button>
        <button onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click(); }}
          title="Inserir imagem"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          📷
        </button>
        <input ref={imgInputRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagem(f); e.target.value = ''; }} />
        <button onMouseDown={e => { e.preventDefault(); inserirTabela(); }}
          title="Inserir tabela editável"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4 }}>
          ⊞
        </button>
        <button onMouseDown={e => { e.preventDefault(); excluirTabela(); }}
          title="Excluir tabela (posicione o cursor dentro dela)"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 7px', fontSize:11, cursor:'pointer', lineHeight:1.4, color:'#dc2626' }}>
          ⊟
        </button>
        <div style={{ flex:1 }} />
        {salvando && <span style={{ fontSize:9, color:'#d97706' }}>Salvando...</span>}
        {salvo && !salvando && <span style={{ fontSize:9, color:'#16a34a' }}>✓ Salvo</span>}
        {/* Discreto de propósito — já autosalva 1.5s após parar de digitar; o
            botão em destaque da tela é "💾 Salvar Alterações" (registro
            inteiro), este aqui só força salvar antes desse intervalo. */}
        <button onClick={salvarAgora} disabled={salvando} title="Forçar salvar agora (já autosalva sozinho)"
          style={{ background:'#f1f5f9', color:'#64748b', border:'1px solid #d1d5db', borderRadius:3,
            padding:'2px 8px', fontSize:9, fontWeight:600, cursor:'pointer', opacity: salvando ? .6 : 1 }}>
          💾
        </button>
      </div>
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="licit-area-livre"
        onInput={autosave}
        onPaste={handlePaste}
        style={{ minHeight:90, padding:'10px 12px', fontSize:11, color:'#1e293b',
          lineHeight:1.6, outline:'none', background:'#fff', wordBreak:'break-word' }}
        data-placeholder="Notas livres, cole tabelas do Excel, imagens, links..."
      />
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        /* Tabelas coladas do Excel ficam com estilo básico */
        .licit-area-livre table { border-collapse:collapse; width:100%; }
        .licit-area-livre td, .licit-area-livre th {
          border:1px solid #d1d5db; padding:4px 6px; font-size:10px; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-QUADRO DE DOCUMENTOS — usado dentro de "Arquivos de Licitação", um por
// categoria fixa (edital_anexos, impugnacao, impugnacao_decisao, etc). Autônomo
// (upload/lista/exclusão/Área Livre próprios) porque vários quadros ficam
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

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('licitacao_documentos').select('*')
      .eq('licitacao_id', licitacaoId).eq('categoria', categoria)
      .order('criado_em', { ascending: false });
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
    setSalvando(true);
    const agora = new Date().toISOString();
    const autor = currentUser?.nome || currentUser?.email || 'Usuário';
    try {
      if (uploadFiles.length === 0 && uploadDesc.trim()) {
        const { data: novoDoc } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licitacaoId, categoria,
          nome: uploadDesc.slice(0,80) || 'Documento',
          url: null, conteudo: uploadDesc.trim(),
          criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
        }]).select('id').single();
        logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licitacaoId, changeType: 'UPDATE',
          oldRow: { processo: null }, newRow: { processo: (uploadDesc.slice(0,80) || 'Documento') }, user: currentUser,
          formatters: { processo: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id, categoria } });
      } else {
        for (const file of uploadFiles) {
          const url = await uploadAnexo(file, licitacaoId, categoria);
          const { data: novoDoc } = await supabase.from('licitacao_documentos').insert([{
            licitacao_id: licitacaoId, categoria, nome: file.name, url,
            conteudo: uploadDesc.trim() || null,
            criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
          }]).select('id').single();
          logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licitacaoId, changeType: 'UPDATE',
            oldRow: { processo: null }, newRow: { processo: file.name }, user: currentUser,
            formatters: { processo: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id, categoria } });
        }
      }
      setUploadFiles([]);
      setUploadDesc('');
      if (uploadRef.current) uploadRef.current.value = '';
      await fetchDocs();
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (d: any) => {
    if (!podeExcluir) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!confirm('Remover este registro?')) return;
    await supabase.from('licitacao_documentos').delete().eq('id', d.id);
    registrarExclusaoParaUndo('licitacao_documentos', d, currentUser?.nome || currentUser?.email, label);
    fetchDocs();
  };

  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:10, display:'flex', flexDirection:'column', gap:8, minWidth:0, flex:'1 1 260px' }}>
      <div style={{ fontWeight:700, fontSize:10, color:'#374151' }}>{label}</div>
      <input type="file" ref={uploadRef} multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar"
        onChange={e => setUploadFiles(Array.from(e.target.files||[]))}
        style={{ width:'100%', fontSize:9 }} />
      {uploadFiles.length > 0 && <div style={{ fontSize:9, color:'#0369a1' }}>📎 {uploadFiles.length} arquivo(s)</div>}
      <input type="text" placeholder="Descrição / legenda (opcional)" value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
        style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }} />
      <button onClick={salvar} disabled={salvando||(uploadFiles.length===0&&!uploadDesc.trim())}
        style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'5px 10px', fontSize:10, fontWeight:700, cursor:'pointer', alignSelf:'flex-start', opacity:(uploadFiles.length>0||uploadDesc.trim())?1:.5 }}>
        {salvando ? 'Salvando...' : '+ Adicionar'}
      </button>
      {loading && <div style={{ color:'#9ca3af', fontSize:10, textAlign:'center' }}>Carregando...</div>}
      {!loading && docs.length === 0 && <div style={{ color:'#9ca3af', fontSize:10, textAlign:'center', padding:8 }}>Nenhum documento.</div>}
      {docs.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:6, padding:'6px 8px',
          background: itemNaoLido?.(d.id) ? '#fefce8' : '#f8fafc',
          border: `1px solid ${itemNaoLido?.(d.id) ? '#fde047' : '#e2e8f0'}`, borderRadius:4 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:10, fontWeight:600, wordBreak:'break-all' }}>📎 {d.nome}</a>
            ) : (
              <div style={{ fontSize:10, color:'#374151', fontWeight:600 }}>{d.nome}</div>
            )}
            {d.conteudo && <div style={{ fontSize:9, color:'#64748b', marginTop:2, whiteSpace:'pre-wrap' }}><Linkify text={d.conteudo} /></div>}
            <div style={{ fontSize:8, color:'#9ca3af', marginTop:2 }}>👤 {d.criado_por_nome||'—'} · 🕒 {fmtDT(d.criado_em)}</div>
          </div>
          {podeExcluir && (
            <button onClick={()=>excluir(d)} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:11, padding:'0 2px' }}>✕</button>
          )}
        </div>
      ))}
      <AreaLivre licitacaoId={licitacaoId} tabKey={`processo:${categoria}`} areasLivres={areasLivres} onAreasLivresChange={onAreasLivresChange}
        currentUser={currentUser} naoLida={areaLivreNaoLida} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE
// ─────────────────────────────────────────────────────────────────────────────
function LicitacaoModal({ licit: licitProp, currentUser, onClose, onRefresh, onExcluir }) {
  const [licit, setLicit] = useState<any>(licitProp);

  // ── auditoria/colaboração (mesmo padrão do CRM, ver AuditSystem.tsx) ───────
  const { camposNaoLidos, naoLidos } = useUnreadChanges('licitacoes', licit?.id, currentUser);
  // Um item de lista (comentário, documento) é "não lido" se existe uma linha em
  // audit_log com metadata.ref_id apontando pro id dele — ver salvarAndamento/
  // salvarDoc/SubQuadroDocumentos.salvar, que gravam esse vínculo ao salvar.
  const itemNaoLido = (itemId: string) => naoLidos.some((n: any) => n.metadata?.ref_id === itemId);
  const marcarComoLidoAudit = useMarkAsRead('licitacoes', licit?.id, currentUser);
  // Caixa de destaque sutil em volta do campo inteiro (rótulo + input) quando ele
  // mudou e ainda não foi visto por este usuário — mesma receita do CRM.
  const campoDestaque = (field: string): React.CSSProperties => ({
    borderRadius: 5, padding: '4px 6px', margin: '0 -6px 0 -6px',
    background: camposNaoLidos.has(field) ? '#fefce8' : 'transparent',
    border: `1px solid ${camposNaoLidos.has(field) ? '#fde047' : 'transparent'}`,
  });
  // Fecha o modal marcando como lido — nunca automaticamente no mount, só ao
  // sair da tela. O card na lista (useUnreadMap) se limpa sozinho via Realtime
  // em entity_views, sem precisar de callback direto pra cá.
  const fecharModal = () => { marcarComoLidoAudit(); onClose(); };

  // ── Resize do painel ──────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(40);
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
  const [areasLivres, setAreasLivres] = useState<any>(licit.areas_livres || {});

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

  // ── RIGHT PANEL ───────────────────────────────────────────────────────────
  const [tabDir, setTabDir] = useState<string>('processo');
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
  const [emitindoPedido, setEmitindoPedido] = useState(false);
  const [pedidoEmitido, setPedidoEmitido] = useState<string|null>(null);
  const [salvando, setSalvando] = useState(false);
  const [obsEncerramento, setObsEncerramento] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<string|null>(null);

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
    const { data } = await supabase.from('licitacao_documentos')
      .select('*').eq('licitacao_id', licit.id).eq('categoria', tabDir)
      .order('criado_em', { ascending: false });
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
  const salvarForm = async () => {
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
  };

  // ── Salvar nova atualização de Andamento ────────────────────────────────────
  const salvarAndamento = async () => {
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
      }
      const { data: novoAndamento, error } = await supabase.from('licitacao_documentos').insert([{
        licitacao_id: licit.id, categoria: 'andamento',
        nome: 'Andamento', conteudo: novoText.trim(),
        anexo_url: primeiroAnexoUrl, anexo_nome: primeiroAnexoNome,
        criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
      }]).select('id').single();
      logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
        oldRow: { andamento: null }, newRow: { andamento: novoText.trim().slice(0, 120) }, user: currentUser,
        metadata: { ref_id: novoAndamento?.id } });
      // uploads adicionais (arquivos extras sem texto)
      for (let i = 1; i < novoAnexoFiles.length; i++) {
        const url = await uploadAnexo(novoAnexoFiles[i], licit.id, 'andamento');
        await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licit.id, categoria: 'andamento',
          nome: 'Andamento', conteudo: null,
          anexo_url: url, anexo_nome: novoAnexoFiles[i].name,
          criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
        }]);
      }
      if (error) { alert('Erro: ' + error.message); }
      else {
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
  };

  // ── Editar andamento existente ────────────────────────────────────────────
  const salvarEdicaoAndamento = async () => {
    if (!editandoDocId) return;
    const { error } = await supabase.from('licitacao_documentos')
      .update({ conteudo: editandoDocTexto, atualizado_em: new Date().toISOString() })
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
  };

  // ── Excluir entrada de Andamento ────────────────────────────────────────────
  const excluirAndamentoDoc = async (id: string, tabela: 'licitacao_documentos'|'licitacao_anexos') => {
    if (!podeExcluirAnexos) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!confirm('Remover este registro?')) return;
    const { data: reg } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    await supabase.from(tabela).delete().eq('id', id);
    if (reg) registrarExclusaoParaUndo(tabela, reg, currentUser?.nome || currentUser?.email, 'Registro de andamento');
    fetchAndamento();
  };

  // ── Salvar novo doc nas demais abas ─────────────────────────────────────────
  const salvarDoc = async () => {
    if (uploadFiles.length === 0 && !uploadDesc.trim()) return;
    setSalvandoDoc(true);
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
          const { data: novoDoc } = await supabase.from('licitacao_documentos').insert([{
            licitacao_id: licit.id, categoria: tabDir,
            nome: file.name, url,
            conteudo: uploadDesc.trim() || null,
            criado_por: currentUser?.email, criado_por_nome: autor, criado_em: agora,
          }]).select('id').single();
          logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
            oldRow: { [tabDir]: null }, newRow: { [tabDir]: file.name }, user: currentUser,
            formatters: { [tabDir]: (v: string) => v ? `📎 ${v}` : '—' }, metadata: { ref_id: novoDoc?.id } });
        }
      }
      setUploadFiles([]);
      setUploadDesc('');
      if (uploadRef.current) uploadRef.current.value = '';
      await fetchDocs();
      await fetchAbaAlteracoes();
    } finally {
      setSalvandoDoc(false);
    }
  };

  // ── Excluir doc ───────────────────────────────────────────────────────────
  const excluirDoc = async (id: string, tabela: 'licitacao_documentos'|'licitacao_anexos') => {
    if (!podeExcluirAnexos) { alert('Você não tem permissão para excluir arquivos.'); return; }
    if (!confirm('Remover este registro?')) return;
    const { data: reg } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    await supabase.from(tabela).delete().eq('id', id);
    if (reg) registrarExclusaoParaUndo(tabela, reg, currentUser?.nome || currentUser?.email, 'Documento/anexo');
    fetchDocs();
    fetchAbaAlteracoes();
  };

  // ── Mudar status ──────────────────────────────────────────────────────────
  const mudarStatus = async (novoStatus: string) => {
    setSalvando(true);
    const agora = new Date().toISOString();
    const hist = [...(licit.historico || []), { status: novoStatus, usuario: currentUser?.nome, data: agora, obs: obsEncerramento || '' }];
    const novoRow = { status: novoStatus, historico: hist, obs_encerramento: obsEncerramento || null, atualizado_em: agora };
    await supabase.from('licitacoes').update(novoRow).eq('id', licit.id);
    logChange({ module: 'licitacoes', entityType: 'licitacoes', entityId: licit.id, changeType: 'UPDATE',
      oldRow: licit, newRow: { ...licit, ...novoRow }, user: currentUser });
    setConfirmStatus(null);
    setObsEncerramento('');
    setSalvando(false);
    onRefresh();
    if (novoStatus === 'Vencida') { setShowAcoesVencida(true); } else { fecharModal(); }
  };

  // ── Emitir Pedido de Compra ───────────────────────────────────────────────
  const emitirPedidoCompra = async () => {
    setEmitindoPedido(true);
    const agora = new Date().toISOString();
    const numRef = licit.numero ? licit.numero.replace(/\D/g,'').slice(-6) : Date.now().toString().slice(-6);
    const numero = `PC-L${numRef}`;
    const obs = [
      `Pedido de Compra Direta — ${licit.classificacao === 'Direta' ? 'Venda Direta' : 'Licitação'} Vencida`,
      `Nome do Projeto: ${licit.numero || '—'}`, `Nome do Órgão: ${licit.nome_projeto || '—'}`,
      `Portal: ${licit.orgao || '—'}`, `Tipo: ${licit.tipo_objeto || licit.objeto_principal || '—'}`,
      `Solicitado por: ${currentUser?.nome || '—'}`, `Data: ${new Date().toLocaleString('pt-BR')}`,
    ].join('\n');
    const { error } = await supabase.from('pcp_pedidos_compra').insert([{
      numero_pedido: numero, opl: licit.numero || null,
      descricao_material: licit.numero || licit.tipo_objeto || licit.objeto_principal || '—',
      quantidade: 1, status_compra: 'Pendente', observacoes_compra: obs, data_criacao: agora,
    }]);
    setEmitindoPedido(false);
    if (error) { alert('Erro ao emitir pedido de compra: ' + error.message); return; }
    setPedidoEmitido(numero);
  };

  const prepararOpComercial = () => {
    const prefill = {
      cliente_nome: licit.nome_projeto || '',
      modelo: licit.numero || '',
      observacoes_comercial: `${licit.classificacao === 'Direta' ? 'Venda Direta' : 'Licitação'} vencida: ${licit.numero} — ${licit.nome_projeto}`,
    };
    localStorage.setItem('acn_nova_op_prefill', JSON.stringify(prefill));
    alert('✅ Dados salvos!\n\nVá para a aba Comercial e clique em "+ Nova OP".');
  };

  // ── Toggle marcador ───────────────────────────────────────────────────────
  const toggleMarcador = async (m: string) => {
    const atuais: string[] = licit.marcadores || [];
    const novos = atuais.includes(m) ? atuais.filter(x => x !== m) : [...atuais, m];
    await supabase.from('licitacoes').update({ marcadores: novos, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
    onRefresh();
  };

  const s = licit.status;
  const marcadores: string[] = licit.marcadores || [];

  const botaoProximoStatus = () => {
    if (s === 'Aberta' && isAnalista) return { label:'🚀 Iniciar Andamento', next:'Em Andamento' };
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
  const voltarFase = () => {
    const anterior = statusAnterior();
    if (!anterior) return;
    if (!confirm(`Voltar de "${s}" para "${anterior}"?`)) return;
    mudarStatus(anterior);
  };

  // ── Minimizado ────────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:1000, background:'#1e3a5f', color:'#fff', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 -2px 12px #0004' }}>
        <div>
          <span style={{ fontSize:9, opacity:.75, marginRight:8, textTransform:'uppercase' }}>{s}</span>
          <span style={{ fontSize:12, fontWeight:700 }}>{licit.numero} — {licit.nome_projeto}</span>
          <span style={{ fontSize:10, opacity:.7, marginLeft:8 }}>{licit.orgao}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setMinimized(false)}
            style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'4px 12px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            ⬆ Restaurar
          </button>
          <button onClick={onClose}
            style={{ background:'none', border:'1px solid #fff4', borderRadius:4, color:'#fff', padding:'4px 10px', fontSize:10, cursor:'pointer' }}>
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ── Renderização principal ────────────────────────────────────────────────
  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex' }}>
      <div ref={containerRef} style={{ display:'flex', width:'100%', height:'100%', cursor: isDragging ? 'col-resize' : 'default', userSelect: isDragging ? 'none' : 'auto' }}>

        {/* ══ PAINEL ESQUERDO: Formulário ══ */}
        <div style={{ width:`${leftWidth}%`, minWidth:260, display:'flex', flexDirection:'column', background:'#fff', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'10px 14px', background:STATUS_COR[s]||'#374151', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:9, opacity:.85, fontWeight:700, letterSpacing:.5 }}>{s.toUpperCase()} · {licit.classificacao} · {formEdit.faturamento_empresa||'ACN'}</div>
              <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{licit.numero} — {licit.nome_projeto}</div>
              <div style={{ fontSize:9, opacity:.85 }}>{licit.orgao}</div>
            </div>
            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
              <button onClick={() => setMinimized(true)}
                title="Minimizar"
                style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', fontSize:14, cursor:'pointer', padding:'3px 6px', borderRadius:3 }}>
                ─
              </button>
              <button onClick={fecharModal}
                style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', fontSize:16, cursor:'pointer', padding:'3px 6px', borderRadius:3 }}>
                ✕
              </button>
            </div>
          </div>

          {/* Marcadores */}
          <div style={{ padding:'6px 12px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', flexShrink:0 }}>
            {formEdit.forma_disputa && (
              <span style={{ background:'#374151', color:'#fff', borderRadius:4, padding:'1px 7px', fontSize:9, fontWeight:700 }}>⚖️ {formEdit.forma_disputa}</span>
            )}
            {MARCADORES.map(m => (
              <button key={m} onClick={() => toggleMarcador(m)}
                style={{ border:`1.5px solid ${marcadores.includes(m)?'#dc2626':'#d1d5db'}`,
                  background: marcadores.includes(m)?'#fef2f2':'#fff',
                  color: marcadores.includes(m)?'#dc2626':'#6b7280',
                  borderRadius:4, padding:'1px 7px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                {marcadores.includes(m)?'✓ ':''}{m}
              </button>
            ))}
          </div>

          {/* Form (scrollable) */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>

            {/* Faturamento — sempre visível */}
            <div style={campoDestaque('faturamento_empresa')}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>ACN / Detech</label>
              <div style={{ display:'flex', gap:6 }}>
                {FATURAMENTO_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => setF('faturamento_empresa', opt)}
                    style={{ flex:1, padding:'5px 4px', fontSize:10, fontWeight:700, cursor:'pointer', borderRadius:4,
                      border:`1.5px solid ${formEdit.faturamento_empresa===opt?'#2563eb':'#d1d5db'}`,
                      background: formEdit.faturamento_empresa===opt ? '#dbeafe' : '#fff',
                      color: formEdit.faturamento_empresa===opt ? '#1d4ed8' : '#374151' }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={campoDestaque('numero')}><FInput label="Nome do Projeto" value={formEdit.numero} onChange={v=>setF('numero',v)} /></div>
              <div style={campoDestaque('classificacao')}>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Classificação</label>
                <select value={formEdit.classificacao||'Direta'} onChange={e=>setF('classificacao',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11 }}>
                  <option>Direta</option><option>Parceiro</option><option>Adesão a ATA</option>
                </select>
              </div>
            </div>

            <div style={campoDestaque('nome_projeto')}><FInput label="Nome completo do Órgão" value={formEdit.nome_projeto} onChange={v=>setF('nome_projeto',v)} /></div>
            <div style={campoDestaque('orgao')}><FInput label="Portal" value={formEdit.orgao} onChange={v=>setF('orgao',v)} /></div>

            <div style={campoDestaque('tipo_objeto')}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Tipo</label>
              <div style={{ display:'flex', gap:6 }}>
                {['Registro de Preços','Contrato'].map(opt => (
                  <button key={opt} onClick={() => setF('tipo_objeto', opt)}
                    style={{ flex:1, padding:'5px 4px', fontSize:10, fontWeight:700, cursor:'pointer', borderRadius:4,
                      border:`1.5px solid ${formEdit.tipo_objeto===opt?'#2563eb':'#d1d5db'}`,
                      background: formEdit.tipo_objeto===opt ? '#dbeafe' : '#fff',
                      color: formEdit.tipo_objeto===opt ? '#1d4ed8' : '#374151' }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={campoDestaque('valor_estimado')}><FInput label="Valor Global Previsto (R$)" value={formEdit.valor_estimado} onChange={v=>setF('valor_estimado',v)} type="money" /></div>
              <div style={campoDestaque('julgamento')}>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Julgamento</label>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {JULGAMENTO_OPCOES.map(opt => {
                    const ativos: string[] = formEdit.julgamento || [];
                    const sel = ativos.includes(opt);
                    return (
                      <button key={opt} onClick={() => setFormEdit((f:any) => {
                          const at = f.julgamento || [];
                          return { ...f, julgamento: at.includes(opt) ? at.filter((x:string)=>x!==opt) : [...at, opt] };
                        })}
                        style={{ padding:'4px 8px', fontSize:9, fontWeight:700, cursor:'pointer', borderRadius:4,
                          border:`1.5px solid ${sel?'#2563eb':'#d1d5db'}`,
                          background: sel ? '#dbeafe' : '#fff', color: sel ? '#1d4ed8' : '#374151' }}>
                        {sel?'✓ ':''}{opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={campoDestaque('forma_disputa')}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Forma de Disputa</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {FORMA_DISPUTA_OPCOES.map(opt => (
                  <button key={opt} onClick={() => setF('forma_disputa', opt)}
                    style={{ flex:'1 0 30%', padding:'4px', border:`1.5px solid ${formEdit.forma_disputa===opt?'#2563eb':'#d1d5db'}`,
                      background: formEdit.forma_disputa===opt ? '#dbeafe' : '#fff',
                      color: formEdit.forma_disputa===opt ? '#1d4ed8' : '#374151',
                      borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* PRAZOS */}
            <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>PRAZOS</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={campoDestaque('data_limite_esclarecimentos')}><FInput label="Limite Esclarecimentos/Impugnação" value={formEdit.data_limite_esclarecimentos} onChange={v=>setF('data_limite_esclarecimentos',v)} type="datetime-local" /></div>
                <div style={campoDestaque('data_limite_proposta')}><FInput label="Limite Proposta" value={formEdit.data_limite_proposta} onChange={v=>setF('data_limite_proposta',v)} type="datetime-local" /></div>
                <div style={campoDestaque('data_disputa')}><FInput label="Data/Hora de Disputa" value={formEdit.data_disputa} onChange={v=>setF('data_disputa',v)} type="datetime-local" /></div>
                <div style={campoDestaque('data_limite_analise_tecnica')}><FInput label="Limite Análise Técnica" value={formEdit.data_limite_analise_tecnica} onChange={v=>setF('data_limite_analise_tecnica',v)} type="datetime-local" /></div>
              </div>
            </div>

            {/* CONTATOS DO PROCESSO */}
            <ContatosSection licitacaoId={licit.id} currentUser={currentUser} />

            {/* HISTÓRICO */}
            {(licit.historico||[]).length > 0 && (
              <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>HISTÓRICO</div>
                {[...(licit.historico||[])].reverse().slice(0,5).map((h: any, i: number) => (
                  <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COR[h.status]||'#6b7280', marginTop:3, flexShrink:0 }} />
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:STATUS_COR[h.status]||'#374151' }}>{h.status}</div>
                      <div style={{ fontSize:9, color:'#6b7280' }}>{h.usuario} · {fmtDT(h.data)}</div>
                      {h.obs && <div style={{ fontSize:9, color:'#374151', wordBreak:'break-word' }} dangerouslySetInnerHTML={{ __html: htmlSeguro(h.obs) }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ANDAMENTO — sempre visível, abaixo do formulário (não é mais aba) */}
            <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>📝 Andamento</div>

              {/* Análise — migrada pra dentro do Andamento, não é mais aba própria do painel direito */}
              <div style={{ marginBottom:10 }}>
                <AnaliseStatusPanel
                  origemId={licit.id}
                  origemTitulo={licit.nome_projeto}
                  origemNumero={licit.numero}
                  origem="licitacao"
                  currentUser={currentUser}
                  onSolicitarNova={() => setShowModalSolicitar(true)}
                />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Nova entrada */}
                <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:10, color:'#166534', marginBottom:6 }}>✏️ Nova Atualização</div>
                  <RichTextInput mencoes value={novoText} onChange={v=>setNovoText(v)}
                    placeholder="Descreva o andamento... @Nome para mencionar, selecione um trecho pra formatar" minHeight={54}
                    style={{ fontSize:11 }} />
                  <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <label style={{ fontSize:10, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:4, background:'#e0f2fe', borderRadius:4, padding:'3px 8px', border:'1px solid #7dd3fc' }}>
                      📎 Vincular arquivo(s)
                      <input type="file" ref={novoAnexoRef} style={{ display:'none' }} multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                        onChange={e => setNovoAnexoFiles(Array.from(e.target.files||[]))} />
                    </label>
                    {novoAnexoFiles.length > 0 && (
                      <span style={{ fontSize:9, color:'#0369a1', fontWeight:600 }}>
                        📎 {novoAnexoFiles.length} arquivo(s)
                        <button onClick={() => { setNovoAnexoFiles([]); if(novoAnexoRef.current) novoAnexoRef.current.value=''; }}
                          style={{ marginLeft:4, background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:10 }}>✕</button>
                      </span>
                    )}
                  </div>
                  <button onClick={salvarAndamento} disabled={salvandoAndamento||(!novoText.trim()&&novoAnexoFiles.length===0)}
                    style={{ marginTop:8, background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'6px 18px', fontWeight:700, fontSize:11, cursor:'pointer', opacity:(novoText.trim()||novoAnexoFiles.length>0)?1:.5 }}>
                    {salvandoAndamento ? 'Salvando...' : '+ Registrar'}
                  </button>
                </div>

                {/* Lista de entradas */}
                {andDocs.map((d: any) => (
                  <div key={d.id} style={{
                    background: itemNaoLido(d.id) ? '#fefce8' : '#fff',
                    border: `1px solid ${itemNaoLido(d.id) ? '#fde047' : '#e2e8f0'}`,
                    borderRadius:6, borderLeft:'3px solid #2563eb', padding:'10px 12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        {editandoDocId === d.id ? (
                          <div>
                            <RichTextInput mencoes value={editandoDocTexto} onChange={v=>setEditandoDocTexto(v)}
                              minHeight={54} style={{ fontSize:11 }} />
                            <div style={{ display:'flex', gap:6, marginTop:6 }}>
                              <button onClick={salvarEdicaoAndamento}
                                style={{ background:'#475569', color:'#fff', border:'none', borderRadius:4, padding:'4px 14px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
                                💾 Salvar Nota
                              </button>
                              <button onClick={() => { setEditandoDocId(null); setEditandoDocTexto(''); }}
                                style={{ padding:'4px 10px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:10, cursor:'pointer' }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {d.conteudo && (
                              pareceHtmlFormatado(d.conteudo)
                                ? <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }} dangerouslySetInnerHTML={{ __html: d.conteudo }} />
                                : <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}><Linkify text={d.conteudo} /></div>
                            )}
                            {d.anexo_url && (
                              <a href={d.anexo_url} target="_blank" rel="noreferrer"
                                style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, color:'#2563eb', fontWeight:600, marginTop:4 }}>
                                📎 {d.anexo_nome||'Arquivo'}
                              </a>
                            )}
                            <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                              <span>👤 {d.criado_por_nome||'—'}</span>
                              <span>🕒 {fmtDT(d.criado_em)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:4, flexShrink:0, marginLeft:6 }}>
                        {editandoDocId !== d.id && (
                          <button onClick={() => { setEditandoDocId(d.id); setEditandoDocTexto(d.conteudo||''); }}
                            title="Editar" style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:11, padding:'0 2px' }}>✏️</button>
                        )}
                        {podeExcluirAnexos && (
                          <button onClick={() => excluirAndamentoDoc(d.id,'licitacao_documentos')}
                            style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 2px' }}>✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Legado */}
                {andDocsLegacy.length > 0 && (
                  <>
                    <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textAlign:'center', padding:'4px 0' }}>— registros anteriores —</div>
                    {andDocsLegacy.map((a: any) => (
                      <div key={a.id} style={{ background:'#fafafa', border:'1px solid #e2e8f0', borderRadius:6, borderLeft:'3px solid #94a3b8', padding:'8px 12px' }}>
                        <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}><Linkify text={a.conteudo} /></div>
                        <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                          <span>👤 {a.criado_por_nome||'—'}</span>
                          <span>🕒 {fmtDT(a.criado_em)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {andDocs.length === 0 && andDocsLegacy.length === 0 && !loadingAndDocs && (
                  <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Nenhuma atualização ainda.</div>
                )}

                {/* Área Livre desta seção */}
                <AreaLivre licitacaoId={licit.id} tabKey="andamento" areasLivres={areasLivres} onAreasLivresChange={setAreasLivres}
                  currentUser={currentUser} naoLida={camposNaoLidos.has('area_livre_andamento')} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop:'1px solid #e2e8f0', padding:'10px 14px', flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>

            {showAcoesVencida && (
              <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:6, padding:10, marginBottom:4 }}>
                <div style={{ fontWeight:700, color:'#166534', fontSize:12, marginBottom:6 }}>🏆 VENCIDA! Emita os documentos:</div>
                {pedidoEmitido ? (
                  <div style={{ background:'#dcfce7', borderRadius:4, padding:'6px 10px', fontSize:10, color:'#166534', fontWeight:700, marginBottom:4 }}>
                    ✅ Pedido {pedidoEmitido} emitido!
                  </div>
                ) : (
                  <button onClick={emitirPedidoCompra} disabled={emitindoPedido}
                    style={{ width:'100%', background:'#0369a1', color:'#fff', border:'none', borderRadius:4, padding:'6px', fontWeight:700, fontSize:10, cursor:'pointer', marginBottom:4, opacity:emitindoPedido?.6:1 }}>
                    {emitindoPedido ? 'Emitindo...' : '📦 Emitir Pedido de Compra'}
                  </button>
                )}
                <button onClick={prepararOpComercial}
                  style={{ width:'100%', background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'6px', fontWeight:700, fontSize:10, cursor:'pointer', marginBottom:4 }}>
                  🏭 Preparar OP no Comercial
                </button>
                <button onClick={fecharModal}
                  style={{ width:'100%', background:'#fff', color:'#374151', border:'1px solid #d1d5db', borderRadius:4, padding:'5px', fontSize:10, cursor:'pointer' }}>
                  Fechar
                </button>
              </div>
            )}

            {confirmStatus && (
              <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:4, padding:8 }}>
                <div style={{ fontWeight:700, fontSize:10, marginBottom:5 }}>
                  Mover para: <span style={{ color:STATUS_COR[confirmStatus] }}>{confirmStatus}</span>
                </div>
                <RichTextInput value={obsEncerramento} onChange={html=>setObsEncerramento(html)}
                  placeholder="Observação (opcional)... (selecione um trecho pra formatar)" minHeight={36}
                  style={{ width:'100%', marginBottom:5 }} />
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => mudarStatus(confirmStatus)} disabled={salvando}
                    style={{ flex:1, background:STATUS_COR[confirmStatus], color:'#fff', border:'none', borderRadius:4, padding:'5px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
                    {salvando ? '...' : '✓ Confirmar'}
                  </button>
                  <button onClick={() => { setConfirmStatus(null); setObsEncerramento(''); }}
                    style={{ padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:4, background:'#fff', fontSize:10, cursor:'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!showAcoesVencida && !confirmStatus && (
              <>
                {/* Botão principal da tela — único em evidência para salvar o
                    registro. Os demais "salvar" (Área Livre, nota de andamento,
                    contato) ficam discretos de propósito: cada um grava um
                    sub-recurso à parte (Área Livre já autosalva sozinha). */}
                <button onClick={salvarForm} disabled={salvandoForm}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6, padding:'10px', fontWeight:800, fontSize:13, cursor:'pointer', opacity:salvandoForm?.6:1, boxShadow:'0 2px 6px #16a34a40' }}>
                  {salvandoForm ? 'Salvando...' : '💾 Salvar Alterações'}
                </button>

                {btnProximo && (
                  <button onClick={() => setConfirmStatus(btnProximo.next)}
                    style={{ background:STATUS_COR[btnProximo.next], color:'#fff', border:'none', borderRadius:6, padding:'7px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    {btnProximo.label}
                  </button>
                )}

                {s === 'Em Andamento' && isAnalista && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {['Vencida','Finalizada','Perdida','Descartada','Suspenso'].map(ns => (
                      <button key={ns} onClick={() => setConfirmStatus(ns)}
                        style={{ flex:'1 0 30%', background:STATUS_COR[ns], color:'#fff', border:'none', borderRadius:4, padding:'5px 4px', fontWeight:700, fontSize:9, cursor:'pointer' }}>
                        {ns === 'Vencida' ? '🏆 Vencida' : ns === 'Finalizada' ? '🏁 Finalizada' : ns === 'Perdida' ? '😞 Perdida' : ns === 'Descartada' ? '🗑️ Descartada' : '⏸️ Suspenso'}
                      </button>
                    ))}
                  </div>
                )}

                {statusAnterior() && (
                  <button onClick={voltarFase} disabled={salvando}
                    title={`Voltar para "${statusAnterior()}"`}
                    style={{ background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1', borderRadius:4,
                      padding:'5px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
                    ◀ Voltar Fase (para {statusAnterior()})
                  </button>
                )}

                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setShowModalSolicitar(true)}
                    style={{ flex:1, background:'#0369a1', color:'#fff', border:'none', borderRadius:4, padding:'5px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
                    🔍 Solicitar Análise
                  </button>
                  {isAdmin && (
                    <button onClick={onExcluir}
                      style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:4, padding:'5px 10px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
                      🗑️ Excluir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ══ DIVISOR REDIMENSIONÁVEL ══ */}
        <div
          onMouseDown={onDividerMouseDown}
          style={{ width:6, background: isDragging ? '#2563eb40' : '#e2e8f0', cursor:'col-resize', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
        >
          <div style={{ width:2, height:40, background:'#c0c0c0', borderRadius:1 }} />
        </div>

        {/* ══ PAINEL DIREITO: Abas ══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f4f6f9', overflow:'hidden' }}>

          {/* Tab bar — quebra em linhas em vez de rolar horizontalmente, pra caber tudo na tela */}
          <div style={{ display:'flex', flexWrap:'wrap', borderBottom:'2px solid #e2e8f0', background:'#fff', flexShrink:0 }}>
            {TABS_DIREITO.map(t => {
              const destacada = tabDir !== t.key && (isAbaDestacada(t.key) || camposNaoLidos.has(t.key));
              return (
                <button key={t.key} onClick={() => { setTabDir(t.key); marcarAbaLida(t.key); }}
                  style={{ flex:'0 0 auto', padding:'8px 11px', border:'none',
                    borderBottom: tabDir===t.key ? '2px solid #2563eb' : '2px solid transparent',
                    background: destacada ? '#fef9c3' : 'none', fontWeight: (tabDir===t.key||destacada) ? 700 : 400,
                    color: tabDir===t.key ? '#2563eb' : destacada ? '#92400e' : '#6b7280', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                  {t.label}
                  {destacada && (
                    <span style={{ marginLeft:5, display:'inline-block', width:7, height:7, borderRadius:'50%',
                      background:'#dc2626', boxShadow:'0 0 0 2px #fee2e2', verticalAlign:'middle' }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Conteúdo da aba */}
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>

            {/* ── FORMAÇÃO DE PREÇOS (embutida, já vinculada a este processo) ── */}
            {tabDir === 'formacao_precos' && (
              <FormacaoPrecosTab
                currentUser={currentUser}
                vinculo={{ tipo:'licitacao', id: licit.id }}
                embutido
              />
            )}

            {/* ── ARQUIVOS DE LICITAÇÃO — sub-quadros por categoria fixa ── */}
            {tabDir === 'processo' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {SUBQUADROS_ARQUIVOS.map((linha, i) => (
                  <div key={i} style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
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
            {tabDir !== 'formacao_precos' && tabDir !== 'processo' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Upload */}
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:10, color:'#374151', marginBottom:8 }}>
                    + Adicionar em {TABS_DIREITO.find(t=>t.key===tabDir)?.label}
                  </div>
                  <input type="file" ref={uploadRef} multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar"
                    onChange={e => setUploadFiles(Array.from(e.target.files||[]))}
                    style={{ width:'100%', fontSize:11, marginBottom:8 }} />
                  {uploadFiles.length > 0 && (
                    <div style={{ fontSize:10, color:'#0369a1', marginBottom:6 }}>📎 {uploadFiles.length} arquivo(s) selecionado(s)</div>
                  )}
                  <input type="text" placeholder="Descrição / legenda (opcional)"
                    value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box', marginBottom:8 }} />
                  <button onClick={salvarDoc} disabled={salvandoDoc||(uploadFiles.length===0&&!uploadDesc.trim())}
                    style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'6px 16px', fontSize:11, fontWeight:700, cursor:'pointer', opacity:(uploadFiles.length>0||uploadDesc.trim())?1:.5 }}>
                    {salvandoDoc ? 'Salvando...' : '+ Adicionar'}
                  </button>
                </div>

                {/* Lista */}
                {loadingDocs && <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:16 }}>Carregando...</div>}
                {!loadingDocs && docs.length === 0 && (
                  <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Nenhum documento nesta categoria.</div>
                )}
                {docs.map((d: any) => (
                  <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px',
                    background: itemNaoLido(d.id) ? '#fefce8' : '#fff',
                    border: `1px solid ${itemNaoLido(d.id) ? '#fde047' : '#e2e8f0'}`, borderRadius:6 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer"
                          style={{ color:'#2563eb', fontSize:11, fontWeight:600, wordBreak:'break-all', display:'flex', alignItems:'center', gap:4 }}>
                          📎 {d.nome}
                        </a>
                      ) : (
                        <div style={{ fontSize:11, color:'#374151', fontWeight:600 }}>{d.nome}</div>
                      )}
                      {d.conteudo && <div style={{ fontSize:10, color:'#64748b', marginTop:2, whiteSpace:'pre-wrap' }}><Linkify text={d.conteudo} /></div>}
                      <div style={{ fontSize:9, color:'#9ca3af', marginTop:3 }}>
                        👤 {d.criado_por_nome||'—'} · 🕒 {fmtDT(d.criado_em)}
                      </div>
                    </div>
                    {podeExcluirAnexos && (
                      <button onClick={() => excluirDoc(d.id,'licitacao_documentos')}
                        style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 2px' }}>✕</button>
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
function FInput({ label, value, onChange, type='text' }: { label:string; value:any; onChange:(v:string)=>void; type?:string }) {
  if (type === 'money') {
    return (
      <div>
        <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}</label>
        <input type="text" inputMode="decimal" placeholder="0,00" value={fmtMoedaBR(value)}
          onChange={e=>onChange(maskMoedaBR(e.target.value).raw)}
          style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
      </div>
    );
  }
  return (
    <div>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}</label>
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );
}

// MODAL NOVA LICITAÇÃO
// Definido FORA de ModalNova: se ficasse dentro, uma nova função seria criada a
// cada re-render (cada tecla digitada), fazendo o React desmontar e remontar o
// <input>, o que tira o foco do campo a cada caractere digitado.
function ModalNovaInput({ label, field, value, onChange, type='text', required=false }: any) {
  if (type === 'money') {
    return (
      <div>
        <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}{required?' *':''}</label>
        <input type="text" inputMode="decimal" placeholder="0,00" value={fmtMoedaBR(value)}
          onChange={e=>onChange(field, maskMoedaBR(e.target.value).raw)}
          style={{ width:'100%', padding:'5px 8px', border:`1px solid ${required&&!value?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
      </div>
    );
  }
  return (
    <div>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}{required?' *':''}</label>
      <input type={type} value={value||''} onChange={e=>onChange(field,e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:`1px solid ${required&&!value?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );
}

function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...LICIT_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.numero.trim()) { alert('Número da licitação obrigatório!'); return; }
    if (!form.nome_projeto.trim()) { alert('Nome do projeto obrigatório!'); return; }
    if (!form.orgao.trim()) { alert('Órgão obrigatório!'); return; }
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
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(660px,95vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, color:'#1f2937', display:'flex', justifyContent:'space-between' }}>
          <span>+ Nova Licitação</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>

        <div style={{ overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>

          {/* ACN / Detech */}
          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>ACN / Detech *</label>
            <div style={{ display:'flex', gap:6 }}>
              {FATURAMENTO_OPTIONS.map(opt => (
                <button key={opt} onClick={() => set('faturamento_empresa', opt)}
                  style={{ flex:1, padding:'5px 4px', fontSize:11, fontWeight:700, cursor:'pointer', borderRadius:4,
                    border:`1.5px solid ${form.faturamento_empresa===opt?'#2563eb':'#d1d5db'}`,
                    background: form.faturamento_empresa===opt ? '#dbeafe' : '#fff',
                    color: form.faturamento_empresa===opt ? '#1d4ed8' : '#374151' }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <ModalNovaInput label="Nome do Projeto" field="numero" value={form.numero} onChange={set} required />
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Classificação *</label>
              <select value={form.classificacao} onChange={e=>set('classificacao',e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11 }}>
                <option>Direta</option>
                <option>Parceiro</option>
                <option>Adesão a ATA</option>
              </select>
            </div>
          </div>

          <ModalNovaInput label="Nome completo do Órgão" field="nome_projeto" value={form.nome_projeto} onChange={set} required />
          <ModalNovaInput label="Portal" field="orgao" value={form.orgao} onChange={set} required />

          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Tipo</label>
            <div style={{ display:'flex', gap:6 }}>
              {['Registro de Preços','Contrato'].map(opt => (
                <button key={opt} onClick={() => set('tipo_objeto', opt)}
                  style={{ flex:1, padding:'5px 4px', fontSize:11, fontWeight:700, cursor:'pointer', borderRadius:4,
                    border:`1.5px solid ${form.tipo_objeto===opt?'#2563eb':'#d1d5db'}`,
                    background: form.tipo_objeto===opt ? '#dbeafe' : '#fff',
                    color: form.tipo_objeto===opt ? '#1d4ed8' : '#374151' }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <ModalNovaInput label="Valor Global Previsto (R$) — opcional" field="valor_estimado" value={form.valor_estimado} onChange={set} type="money" />
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Julgamento</label>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {JULGAMENTO_OPCOES.map(opt => {
                  const ativos: string[] = form.julgamento || [];
                  const sel = ativos.includes(opt);
                  return (
                    <button key={opt} onClick={() => setForm((f:any) => {
                        const at = f.julgamento || [];
                        return { ...f, julgamento: at.includes(opt) ? at.filter((x:string)=>x!==opt) : [...at, opt] };
                      })}
                      style={{ padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer', borderRadius:4,
                        border:`1.5px solid ${sel?'#2563eb':'#d1d5db'}`,
                        background: sel ? '#dbeafe' : '#fff', color: sel ? '#1d4ed8' : '#374151' }}>
                      {sel?'✓ ':''}{opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Forma de Disputa</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {FORMA_DISPUTA_OPCOES.map(opt => (
                <button key={opt} onClick={() => set('forma_disputa', opt)}
                  style={{ flex:'1 0 30%', padding:'5px', border:`1.5px solid ${form.forma_disputa===opt?'#2563eb':'#d1d5db'}`,
                    background: form.forma_disputa===opt ? '#dbeafe' : '#fff',
                    color: form.forma_disputa===opt ? '#1d4ed8' : '#374151',
                    borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>PRAZOS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <ModalNovaInput label="Limite Esclarecimentos/Impugnação" field="data_limite_esclarecimentos" value={form.data_limite_esclarecimentos} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Limite Cadastro da Proposta" field="data_limite_proposta" value={form.data_limite_proposta} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Data/Hora de Disputa" field="data_disputa" value={form.data_disputa} onChange={set} type="datetime-local" />
              <ModalNovaInput label="Limite Análise Técnica" field="data_limite_analise_tecnica" value={form.data_limite_analise_tecnica} onChange={set} type="datetime-local" />
            </div>
          </div>
        </div>

        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? 'Salvando...' : '+ Criar Licitação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE LICITAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function LicitCard({ l, onClick, unread = false }) {
  const marcadores: string[] = l.marcadores || [];
  const dias = diasRestantes(l.data_disputa);
  const urgente = isDiaDisputa(l.data_disputa);
  const vencidoDisputa = dias !== null && dias < 0 && ['Aberta','Em Andamento'].includes(l.status);

  return (
    <div onClick={onClick} style={{ background: unread ? '#fefce8' : '#fff',
      border:`1.5px solid ${STATUS_COR[l.status]||'#e2e8f0'}20`,
      borderLeft:`4px solid ${unread ? '#f59e0b' : (STATUS_COR[l.status]||'#e2e8f0')}`,
      borderRadius:6, padding:'10px 12px', cursor:'pointer', marginBottom:8,
      boxShadow: unread ? '0 0 0 1px #fcd34d40' : '0 1px 3px #0001',
      transition:'box-shadow .15s' }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 3px 8px #0002')}
      onMouseLeave={e=>(e.currentTarget.style.boxShadow=unread?'0 0 0 1px #fcd34d40':'0 1px 3px #0001')}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginBottom:3 }}>
            {unread && <UnreadBadge show />}
            <span style={{ background:STATUS_COR[l.status], color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{l.status}</span>
            {l.forma_disputa && (
              <span style={{ background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>⚖️ {l.forma_disputa}</span>
            )}
            <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:600 }}>{l.classificacao}</span>
            {l.faturamento_empresa && l.faturamento_empresa !== 'ACN' && (
              <span style={{ background:'#ede9fe', color:'#6d28d9', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:600 }}>{l.faturamento_empresa}</span>
            )}
            {marcadores.map(m => (
              <span key={m} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 5px', fontSize:8, fontWeight:700 }}>{m}</span>
            ))}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1f2937', marginBottom:2 }}>{l.numero} — {l.nome_projeto}</div>
          <div style={{ fontSize:10, color:'#6b7280' }}>{l.orgao}</div>
          {(l.tipo_objeto || l.objeto_principal) && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.tipo_objeto || l.objeto_principal}</div>}
        </div>
      </div>
      <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
        {l.data_disputa && (
          <span style={{ fontSize:9, fontWeight:700,
            color: vencidoDisputa?'#dc2626': urgente?'#d97706':'#374151',
            background: vencidoDisputa?'#fef2f2': urgente?'#fffbeb':'#f8fafc',
            border:`1px solid ${vencidoDisputa?'#fca5a5':urgente?'#fcd34d':'#e2e8f0'}`,
            borderRadius:3, padding:'1px 6px' }}>
            ⚡ Disputa: {fmtDT(l.data_disputa)}{dias!==null&&dias>=0?` (${dias}d)`:''}
            {vencidoDisputa?' ⚠️':''}
          </span>
        )}
        {l.data_limite_proposta && (
          <span style={{ fontSize:9, color:'#6b7280', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:3, padding:'1px 6px' }}>
            📋 Proposta: {fmtDT(l.data_limite_proposta)}
          </span>
        )}
      </div>
      <div style={{ marginTop:4, display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <span style={{ fontSize:9, color:'#9ca3af' }}>
          {l.operador || l.analista_nome ? `👤 ${l.operador || l.analista_nome}` : ''}
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <AnaliseStatusBadge origemId={l.id} />
          <button onClick={e => { e.stopPropagation(); onClick(); }}
            style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontWeight:700 }}>
            ⬆ Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE STATUS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDtRel = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
const fmtValRel = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';

const GRUPOS_RELATORIO = [
  { label:'🟢 Em Andamento', key:'Em Andamento', cor:'#059669', bgCor:'#ecfdf5' },
  { label:'🏆 Vencidas',     key:'Vencida',      cor:'#16a34a', bgCor:'#f0fdf4' },
  { label:'🏁 Finalizadas',  key:'Finalizada',   cor:'#0d9488', bgCor:'#f0fdfa' },
  { label:'📋 Adesões a ATA', key:'__adesao',    cor:'#0891b2', bgCor:'#f0f9ff' },
  { label:'❌ Perdidas',     key:'Perdida',       cor:'#dc2626', bgCor:'#fef2f2' },
  { label:'🚫 Descartadas',  key:'Descartada',   cor:'#6b7280', bgCor:'#f9fafb' },
  { label:'⏸️ Suspensas',    key:'Suspenso',     cor:'#d97706', bgCor:'#fffbeb' },
];

function RelatorioStatus({ licitacoes, loading, onOpenLicit }) {
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

  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af' }}>Carregando...</div>;

  return (
    <div style={{ flex:1, overflowY:'auto', padding:16 }}>
      {/* Filtro de ano */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#475569' }}>Filtrar por ano:</span>
        <select value={anoFiltro} onChange={e=>setAnoFiltro(e.target.value)}
          style={{ padding:'4px 10px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
          <option value="">Todos os anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ fontSize:10, color:'#94a3b8' }}>{filtradas.length} licitações{anoFiltro ? ` em ${anoFiltro}` : ''}</span>
      </div>

      {/* Cards de resumo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8, marginBottom:16 }}>
        {GRUPOS_RELATORIO.map(g => {
          const grupo = getGrupo(g.key);
          return (
            <div key={g.key} style={{ background:g.bgCor, border:`1.5px solid ${g.cor}30`, borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:g.cor, marginBottom:4 }}>{g.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color:g.cor }}>{grupo.length}</div>
              <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>
                {grupo.filter(l => l.valor_proposta || l.valor_estimado).length > 0
                  ? fmtValRel(grupo.reduce((s,l) => s + (Number(l.valor_proposta) || Number(l.valor_estimado) || 0), 0))
                  : 'sem valores'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabelas por grupo */}
      {GRUPOS_RELATORIO.map(g => {
        const grupo = getGrupo(g.key);
        if (grupo.length === 0) return null;
        return (
          <div key={g.key} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ width:4, height:18, background:g.cor, borderRadius:2 }} />
              <span style={{ fontWeight:800, fontSize:12, color:g.cor }}>{g.label}</span>
              <span style={{ fontSize:10, color:'#94a3b8' }}>({grupo.length})</span>
            </div>
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'left', color:'#64748b' }}>Nº</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'left', color:'#64748b' }}>Projeto / Órgão</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'left', color:'#64748b' }}>Tipo</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'right', color:'#64748b' }}>Valor</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'left', color:'#64748b' }}>Disputa</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'left', color:'#64748b' }}>Status</th>
                    <th style={{ padding:'6px 10px', fontWeight:700, textAlign:'center', color:'#64748b' }}>Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((l, idx) => (
                    <tr key={l.id}
                      style={{ borderTop:'1px solid #f1f5f9', background: idx%2===0 ? '#fff' : '#fafafa', cursor:'pointer' }}
                      onClick={() => onOpenLicit(l)}>
                      <td style={{ padding:'6px 10px', fontWeight:700, color:'#1e293b', whiteSpace:'nowrap' }}>{l.numero || '—'}</td>
                      <td style={{ padding:'6px 10px', maxWidth:220 }}>
                        <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.nome_projeto || '—'}</div>
                        <div style={{ fontSize:9, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.orgao || ''}</div>
                      </td>
                      <td style={{ padding:'6px 10px', color:'#475569' }}>{l.classificacao || '—'}</td>
                      <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:700, color:'#0f766e' }}>
                        {fmtValRel(l.valor_proposta || l.valor_estimado)}
                      </td>
                      <td style={{ padding:'6px 10px', color:'#475569', whiteSpace:'nowrap' }}>{fmtDtRel(l.data_disputa)}</td>
                      <td style={{ padding:'6px 10px' }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:10,
                          background:(STATUS_COR[l.status]||'#94a3b8')+'20',
                          color: STATUS_COR[l.status]||'#64748b' }}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ padding:'6px 10px', textAlign:'center' }}>
                        <button onClick={e => { e.stopPropagation(); onOpenLicit(l); }}
                          style={{ background:'#1e3a5f', color:'#fff', border:'none', borderRadius:4,
                            padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                          Ver
                        </button>
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
function PipelineCardsLicitacoes({ licitacoes }: any) {
  const [mesFiltro, setMesFiltro] = useState('');
  const noMes = (l: any) => !mesFiltro || (l.atualizado_em || '').slice(0,7) === mesFiltro;
  const valorDe = (l: any) => Number(l.valor_proposta) || Number(l.valor_estimado) || 0;

  const emNegociacao = licitacoes.filter((l:any) => ['Aberta','Em Andamento'].includes(l.status) && noMes(l));
  const perdidas     = licitacoes.filter((l:any) => l.status === 'Perdida' && noMes(l));
  const ganhas       = licitacoes.filter((l:any) => l.status === 'Vencida' && noMes(l));
  const aguardando   = ganhas;

  const totalNegociacao = emNegociacao.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalPerdidas    = perdidas.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalGanhas      = ganhas.reduce((s:number,l:any) => s + valorDe(l), 0);
  const totalAguardando  = aguardando.reduce((s:number,l:any) => s + valorDe(l), 0);

  return (
    <div style={{ padding:'10px 16px 0' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#475569' }}>📅 Filtrar pipeline por mês:</span>
        <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}
          style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }} />
        {mesFiltro && (
          <button onClick={() => setMesFiltro('')}
            style={{ background:'#f1f5f9', border:'none', borderRadius:4, padding:'4px 10px', fontSize:9, fontWeight:700, color:'#475569', cursor:'pointer' }}>
            Limpar
          </button>
        )}
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:4, flexWrap:'wrap' }}>
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'8px 14px', minWidth:110 }}>
          <div style={{ fontSize:8, color:'#3b82f6', fontWeight:700, marginBottom:2 }}>🤝 PIPELINE EM NEGOCIAÇÃO</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#1e293b', lineHeight:1 }}>{emNegociacao.length}</div>
          {totalNegociacao > 0 && <div style={{ fontSize:9, color:'#3b82f6', marginTop:2 }}>{fmtValRel(totalNegociacao)}</div>}
        </div>
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 14px', minWidth:110 }}>
          <div style={{ fontSize:8, color:'#dc2626', fontWeight:700, marginBottom:2 }}>❌ PIPELINE PERDIDAS</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#dc2626', lineHeight:1 }}>{perdidas.length}</div>
          {totalPerdidas > 0 && <div style={{ fontSize:9, color:'#ef4444', marginTop:2 }}>{fmtValRel(totalPerdidas)}</div>}
        </div>
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'8px 14px', minWidth:110 }}>
          <div style={{ fontSize:8, color:'#16a34a', fontWeight:700, marginBottom:2 }}>🏆 PIPELINE GANHAS</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#16a34a', lineHeight:1 }}>{ganhas.length}</div>
          {totalGanhas > 0 && <div style={{ fontSize:9, color:'#16a34a', marginTop:2 }}>{fmtValRel(totalGanhas)}</div>}
        </div>
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:6, padding:'8px 14px', minWidth:130 }}>
          <div style={{ fontSize:8, color:'#a16207', fontWeight:700, marginBottom:2 }}>🕐 GANHAS — AGUARDANDO FATURAMENTO</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#a16207', lineHeight:1 }}>{aguardando.length}</div>
          {totalAguardando > 0 && <div style={{ fontSize:9, color:'#a16207', marginTop:2 }}>{fmtValRel(totalAguardando)}</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function LicitacoesTab({ currentUser, autoOpenLicitId, onAutoOpenConsumed }: any) {
  const [licitacoes, setLicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
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
    if (!confirm(`Excluir "${l.numero} — ${l.nome_projeto}"?`)) return;
    await supabase.from('licitacoes').delete().eq('id', l.id);
    registrarExclusaoParaUndo('licitacoes', l, currentUser?.nome || currentUser?.email, `Licitação "${l.numero}"`);
    setSelected(null);
    fetchLicit();
  };

  const fetchLicit = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('licitacoes').select('*').order('criado_em', { ascending: false });
    setLicitacoes(data || []);
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

  const lista = listaRecentes || licitacoes
    .filter(l => filtroStatus === 'todas' || l.status === filtroStatus)
    .filter(l => filtroTipo === 'todos' || l.classificacao === filtroTipo)
    .filter(l => filtroAnaliseSetor === 'todas' || (analisesPendentesPorLicit[l.id]||[]).includes(filtroAnaliseSetor))
    .filter(l => {
      if (!filtroPeriodoDe && !filtroPeriodoAte) return true;
      const disp = l.data_disputa ? new Date(l.data_disputa) : null;
      if (!disp) return !filtroPeriodoDe;
      if (filtroPeriodoDe && disp < new Date(filtroPeriodoDe)) return false;
      if (filtroPeriodoAte && disp > new Date(filtroPeriodoAte + 'T23:59:59')) return false;
      return true;
    })
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
    <div style={{ display:'flex', flexDirection:'column', background:'#f4f6f9' }}>
      <UndoToast onRestaurado={fetchLicit} />

      {/* HEADER */}
      <div style={{ background:'#1e3a5f', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>🏛️ Licitações</div>
          <div style={{ fontSize:10, opacity:.75 }}>{licitacoes.length} total · {lista.length} exibindo</div>
        </div>
        {isAnalista && (
          <button onClick={() => setModalNova(true)}
            style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
            + Nova Licitação
          </button>
        )}
      </div>

      {/* AGENDA */}
      <div style={{ padding:'12px 16px 0', flexShrink:0 }}>
        <AgendaWidget setor="licitacoes" currentUser={currentUser} />
      </div>

      {/* PIPELINE — mesmos cartões do Comercial/CRM (Em Negociação / Perdidas / Ganhas / Aguardando Faturamento) */}
      <div style={{ flexShrink:0 }}>
        <PipelineCardsLicitacoes licitacoes={licitacoes} />
      </div>

      {/* STATUS CHIPS + BOTÃO RELATÓRIO */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
        {/* Botão Relatório — destaque laranja */}
        <button onClick={() => setVistaRelatorio(v => !v)}
          style={{ background: vistaRelatorio ? '#1e3a5f' : '#f59e0b', color:'#fff', border:'none', borderRadius:20,
            padding:'3px 14px', fontSize:10, fontWeight:800, cursor:'pointer', marginRight:6 }}>
          {vistaRelatorio ? '← Lista' : '📊 Relatório'}
        </button>
        <button onClick={() => setModoRecentes(v => !v)}
          style={{ background: modoRecentes ? '#7c3aed' : '#f1f5f9', color: modoRecentes ? '#fff' : '#374151', border:'none', borderRadius:20,
            padding:'3px 12px', fontSize:10, fontWeight:700, cursor:'pointer', marginRight:6 }}>
          🕐 Últimas Visualizadas
        </button>
        <div style={{ width:1, height:18, background:'#e2e8f0', marginRight:6 }} />
        <button onClick={() => setFiltroStatus('todas')}
          style={{ border:'none', borderRadius:20, padding:'3px 12px', fontSize:10, fontWeight:700,
            background: filtroStatus==='todas'?'#1e3a5f':'#f1f5f9', color: filtroStatus==='todas'?'#fff':'#374151', cursor:'pointer' }}>
          Todas ({licitacoes.length})
        </button>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            style={{ border:`1.5px solid ${filtroStatus===s?STATUS_COR[s]:'transparent'}`,
              borderRadius:20, padding:'3px 10px', fontSize:10, fontWeight:700,
              background: filtroStatus===s ? STATUS_COR[s]+'15' : '#f1f5f9',
              color: filtroStatus===s ? STATUS_COR[s] : '#374151', cursor:'pointer' }}>
            {s} ({conts[s]||0})
          </button>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>ORDENAR POR</div>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>TIPO</div>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="todos">Todos</option>
            <option>Direta</option><option>Parceiro</option><option>Adesão a ATA</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>🔍 ANÁLISE</div>
          <select value={filtroAnaliseSetor} onChange={e=>setFiltroAnaliseSetor(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="todas">Todas</option>
            <option value="Orcamento">Orçamentária</option>
            <option value="Telecom">Telecom</option>
            <option value="Engenharia">Engenharia</option>
            <option value="Comercial">Comercial</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>DISPUTA DE</div>
          <input type="date" value={filtroPeriodoDe} onChange={e=>setFiltroPeriodoDe(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }} />
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>ATÉ</div>
          <input type="date" value={filtroPeriodoAte} onChange={e=>setFiltroPeriodoAte(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }} />
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>AGRUPAR POR PERÍODO</div>
          <select value={agrupamentoPeriodo} onChange={e=>setAgrupamentoPeriodo(e.target.value as any)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="">Não agrupar</option>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
            <option value="bimestre">Bimestre</option>
            <option value="trimestre">Trimestre</option>
            <option value="semestre">Semestre</option>
          </select>
        </div>
        {(filtroTipo!=='todos'||filtroAnaliseSetor!=='todas'||filtroPeriodoDe||filtroPeriodoAte||agrupamentoPeriodo) && (
          <button onClick={() => { setFiltroTipo('todos'); setFiltroAnaliseSetor('todas'); setFiltroPeriodoDe(''); setFiltroPeriodoAte(''); setAgrupamentoPeriodo(''); }}
            style={{ padding:'4px 10px', border:'1px solid #fca5a5', borderRadius:4, background:'#fef2f2', color:'#dc2626', fontSize:10, cursor:'pointer' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* LISTA ou RELATÓRIO */}
      {vistaRelatorio ? (
        <RelatorioStatus licitacoes={licitacoes} loading={loading} onOpenLicit={setSelected} />
      ) : (
        <div style={{ height:'100vh', overflowY:'auto', padding:16 }}>
          {loading || (modoRecentes && recentesLicitLoading) ? (
            <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>Carregando...</div>
          ) : !lista.length ? (
            <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>
              {modoRecentes ? 'Nenhuma licitação visualizada ainda.'
                : filtroStatus !== 'todas' ? `Nenhuma licitação com status "${filtroStatus}".` : 'Nenhuma licitação cadastrada.'}
            </div>
          ) : gruposPeriodo ? (
            gruposPeriodo.map((g, i) => (
              <div key={i} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:.4,
                  padding:'4px 0', borderBottom:'2px solid #e2e8f0', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                  {g.label}
                  <span style={{ background:'#1e3a5f', color:'#fff', borderRadius:10, padding:'1px 8px', fontSize:9, fontWeight:700 }}>{g.itens.length}</span>
                </div>
                {g.itens.map((l:any) => <LicitCard key={l.id} l={l} unread={licitacoesNaoLidas.has(String(l.id))} onClick={() => setSelected(l)} />)}
              </div>
            ))
          ) : (
            lista.map(l => <LicitCard key={l.id} l={l} unread={licitacoesNaoLidas.has(String(l.id))} onClick={() => setSelected(l)} />)
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
