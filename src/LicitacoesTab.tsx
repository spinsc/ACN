// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ModalSolicitarAnalise, AnaliseStatusPanel, AnaliseStatusBadge } from './AnaliseWidget';
import MencaoTextarea from './MencaoTextarea';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LIST = ['Aguardando Licitação','Aberta','Em Análise','Analisada','Em Andamento','Vencida','Perdida','Descartada'];
const STATUS_COR: Record<string,string> = {
  'Aguardando Licitação': '#94a3b8',
  'Aberta':       '#2563eb',
  'Em Análise':   '#d97706',
  'Analisada':    '#7c3aed',
  'Em Andamento': '#059669',
  'Vencida':      '#16a34a',
  'Perdida':      '#dc2626',
  'Descartada':   '#6b7280',
};
const MARCADORES = ['Em Recurso','Em Defesa','Impugnado'];
const PRIORIDADES = ['Alta','Média','Baixa'];
const PRIO_COR: Record<string,string> = { 'Alta':'#dc2626','Média':'#d97706','Baixa':'#16a34a' };
const TIPO_ANEXO_LABELS: Record<string,string> = {
  documento:   '📄 Documento',
  foto:        '🖼️ Foto',
  proposta:    '📋 Proposta',
  habilitacao: '🔑 Habilitação',
  orcamento:   '💰 Orçamento',
  anotacao:    '📝 Anotação',
  contato:     '👤 Contato',
};
const SORT_OPTIONS = [
  { value:'data_disputa',                label:'Data de Disputa' },
  { value:'data_limite_proposta',        label:'Limite de Proposta' },
  { value:'data_limite_analise_tecnica', label:'Limite Análise Técnica' },
  { value:'prioridade',                  label:'Prioridade' },
  { value:'orgao',                       label:'Órgão' },
  { value:'status',                      label:'Status' },
  { value:'criado_em',                   label:'Mais Recentes' },
];

const LICIT_VAZIO = {
  numero:'', nome_projeto:'', objeto_principal:'', orgao:'',
  classificacao:'Direta', prioridade:'Média',
  data_limite_esclarecimentos:'', data_limite_proposta:'',
  data_disputa:'', data_limite_analise_tecnica:'',
  analista_nome:'', analista_email:'',
  coordenador_nome:'', coordenador_email:'',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('pt-BR',{ day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit' });
};
const fmtDate = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
};
const isVencido = (v: string) => v && new Date(v) < new Date();
const diasRestantes = (v: string) => {
  if (!v) return null;
  const diff = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  return diff;
};

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
  // Force octet-stream for Office files to bypass bucket MIME restrictions
  const officeExts = /\.(docx?|xlsx?|pptx?)$/i;
  const contentType = officeExts.test(file.name) ? 'application/octet-stream' : file.type;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType });
  if (error || !data) { console.error('Upload erro Supabase:', error?.message); return null; }
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
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
// MODAL DE DETALHE
// ─────────────────────────────────────────────────────────────────────────────
// Categorias para o painel direito
const TABS_DIREITO = [
  { key:'andamento',    label:'📝 Andamento' },
  { key:'processo',     label:'📂 Processo' },
  { key:'impugnacoes',  label:'⚠️ Impugnações' },
  { key:'recursos',     label:'📜 Recursos' },
  { key:'contratos',    label:'📋 Contratos' },
  { key:'empenhos',     label:'💰 Empenhos' },
  { key:'doc_terceiros',label:'📁 Doc Terceiros' },
  { key:'prospeccoes',  label:'🔍 Prospecções' },
  { key:'analise',      label:'🔬 Análise' },
] as const;

function LicitacaoModal({ licit, currentUser, onClose, onRefresh, onExcluir }) {
  // ── LEFT FORM (edição) ───────────────────────────────────────────────────
  const [formEdit, setFormEdit] = useState<any>({ ...licit });
  const [salvandoForm, setSalvandoForm] = useState(false);
  const setF = (k: string, v: any) => setFormEdit((f: any) => ({ ...f, [k]: v }));

  // ── RIGHT PANEL (abas de documentos) ────────────────────────────────────
  const [tabDir, setTabDir] = useState<string>('andamento');
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLegacy, setDocsLegacy] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [novoText, setNovoText] = useState('');
  const [novoAnexoFile, setNovoAnexoFile] = useState<File|null>(null);
  const [uploadFile, setUploadFile] = useState<File|null>(null);
  const [salvandoDoc, setSalvandoDoc] = useState(false);
  const [uploadDesc, setUploadDesc] = useState('');
  const novoAnexoRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Status / fluxo ──────────────────────────────────────────────────────
  const [showModalSolicitar, setShowModalSolicitar] = useState(false);
  const [showAcoesVencida, setShowAcoesVencida] = useState(false);
  const [emitindoPedido, setEmitindoPedido] = useState(false);
  const [pedidoEmitido, setPedidoEmitido] = useState<string|null>(null);
  const [salvando, setSalvando] = useState(false);
  const [obsEncerramento, setObsEncerramento] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<string|null>(null);

  const isAdmin = true;
  const isAnalista = true;
  const isCoordenador = true;

  // ── Fetch documentos por categoria ──────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    if (tabDir === 'analise') return;
    setLoadingDocs(true);
    const [novosRes, legacyRes] = await Promise.all([
      supabase.from('licitacao_documentos')
        .select('*').eq('licitacao_id', licit.id).eq('categoria', tabDir)
        .order('criado_em', { ascending: false }),
      tabDir === 'andamento'
        ? supabase.from('licitacao_anexos').select('*')
            .eq('licitacao_id', licit.id).eq('tipo', 'andamento')
            .order('criado_em', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    setDocs(novosRes.data || []);
    setDocsLegacy(legacyRes.data || []);
    setLoadingDocs(false);
  }, [licit.id, tabDir]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Salvar form editável (lado esquerdo) ────────────────────────────────
  const salvarForm = async () => {
    setSalvandoForm(true);
    const agora = new Date().toISOString();
    const { _cliente_id, _cliente_obj, historico, status, criado_em, criado_por, id, ...editaveis } = formEdit;
    const { error } = await supabase.from('licitacoes').update({ ...editaveis, atualizado_em: agora }).eq('id', licit.id);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else { onRefresh(); }
    setSalvandoForm(false);
  };

  // ── Salvar documento/andamento (lado direito) ────────────────────────────
  const salvarDoc = async () => {
    if (tabDir === 'andamento' && !novoText.trim() && !novoAnexoFile) return;
    if (tabDir !== 'andamento' && !uploadFile && !uploadDesc.trim()) return;
    setSalvandoDoc(true);
    const agora = new Date().toISOString();
    const autor = currentUser?.nome || currentUser?.email || 'Usuário';
    try {
      if (tabDir === 'andamento') {
        // Upload do anexo opcional
        let anexoUrl: string|null = null;
        let anexoNome: string|null = null;
        if (novoAnexoFile) {
          anexoUrl = await uploadAnexo(novoAnexoFile, licit.id, 'andamento');
          anexoNome = novoAnexoFile.name;
        }
        const { error } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licit.id, categoria: 'andamento',
          nome: 'Andamento', conteudo: novoText.trim(),
          anexo_url: anexoUrl, anexo_nome: anexoNome,
          criado_por: currentUser?.email, criado_por_nome: autor,
          criado_em: agora,
        }]);
        if (error) { alert('Erro: ' + error.message); }
        else { setNovoText(''); setNovoAnexoFile(null); if (novoAnexoRef.current) novoAnexoRef.current.value = ''; }
      } else {
        let url: string|null = null;
        let nome: string|null = uploadFile?.name || null;
        if (uploadFile) {
          url = await uploadAnexo(uploadFile, licit.id, tabDir);
        }
        const { error } = await supabase.from('licitacao_documentos').insert([{
          licitacao_id: licit.id, categoria: tabDir,
          nome: nome || uploadDesc.slice(0,80) || 'Documento',
          url, conteudo: uploadDesc.trim() || null,
          criado_por: currentUser?.email, criado_por_nome: autor,
          criado_em: agora,
        }]);
        if (error) { alert('Erro: ' + error.message); }
        else { setUploadFile(null); setUploadDesc(''); if (uploadRef.current) uploadRef.current.value = ''; }
      }
      await fetchDocs();
    } finally {
      setSalvandoDoc(false);
    }
  };

  const excluirDoc = async (id: string, tabela: 'licitacao_documentos'|'licitacao_anexos') => {
    if (!confirm('Remover este registro?')) return;
    await supabase.from(tabela).delete().eq('id', id);
    fetchDocs();
  };

  // ── Mudar status ────────────────────────────────────────────────────────
  const mudarStatus = async (novoStatus: string) => {
    setSalvando(true);
    const agora = new Date().toISOString();
    const hist = [...(licit.historico || []), {
      status: novoStatus,
      usuario: currentUser?.nome,
      data: agora,
      obs: obsEncerramento || '',
    }];
    await supabase.from('licitacoes').update({
      status: novoStatus,
      historico: hist,
      obs_encerramento: obsEncerramento || null,
      atualizado_em: agora,
    }).eq('id', licit.id);
    setConfirmStatus(null);
    setObsEncerramento('');
    setSalvando(false);
    onRefresh();
    // Licitação vencida: mostra painel de ações ao invés de fechar
    if (novoStatus === 'Vencida') {
      setShowAcoesVencida(true);
    } else {
      onClose();
    }
  };

  // ── Emitir Pedido de Compra Direta ────────────────────────────────────────
  const emitirPedidoCompra = async () => {
    setEmitindoPedido(true);
    const agora = new Date().toISOString();
    const numRef = licit.numero ? licit.numero.replace(/\D/g,'').slice(-6) : Date.now().toString().slice(-6);
    const numero = `PC-L${numRef}`;
    const obs = [
      `Pedido de Compra Direta — ${licit.classificacao === 'Direta' ? 'Venda Direta' : 'Licitação'} Vencida`,
      `Número: ${licit.numero || '—'}`,
      `Projeto: ${licit.nome_projeto || '—'}`,
      `Órgão/Cliente: ${licit.orgao || '—'}`,
      `Objeto: ${licit.objeto_principal || '—'}`,
      `Solicitado por: ${currentUser?.nome || '—'}`,
      `Data: ${new Date().toLocaleString('pt-BR')}`,
    ].join('\n');
    const { error } = await supabase.from('pcp_pedidos_compra').insert([{
      numero_pedido: numero,
      opl: licit.numero || null,
      descricao_material: licit.objeto_principal || licit.nome_projeto || '—',
      quantidade: 1,
      status_compra: 'Pendente',
      observacoes_compra: obs,
      data_criacao: agora,
    }]);
    setEmitindoPedido(false);
    if (error) { alert('Erro ao emitir pedido de compra: ' + error.message); return; }
    setPedidoEmitido(numero);
  };

  // ── Preparar pré-preenchimento da OP no Comercial ────────────────────────
  const prepararOpComercial = () => {
    const prefill = {
      cliente_nome: licit.orgao || '',
      modelo: licit.nome_projeto || '',
      observacoes_comercial: `${licit.classificacao === 'Direta' ? 'Venda Direta' : 'Licitação'} vencida: ${licit.numero} — ${licit.nome_projeto}`,
    };
    localStorage.setItem('acn_nova_op_prefill', JSON.stringify(prefill));
    alert('✅ Dados salvos!\n\nVá para a aba Comercial e clique em "+ Nova OP" para pré-preencher o formulário com os dados desta licitação.');
  };

  // ── Toggle marcador ─────────────────────────────────────────────────────
  const toggleMarcador = async (m: string) => {
    const atuais: string[] = licit.marcadores || [];
    const novos = atuais.includes(m) ? atuais.filter(x => x !== m) : [...atuais, m];
    await supabase.from('licitacoes').update({ marcadores: novos, atualizado_em: new Date().toISOString() }).eq('id', licit.id);
    onRefresh();
  };

  const s = licit.status;
  const marcadores: string[] = licit.marcadores || [];

  const botaoProximoStatus = () => {
    if (s === 'Aberta' && isAnalista)
      return { label:'📤 Enviar para Análise', next:'Em Análise' };
    if (s === 'Em Análise' && isCoordenador)
      return { label:'✅ Marcar como Analisada', next:'Analisada' };
    if (s === 'Analisada' && isAnalista)
      return { label:'🚀 Iniciar Andamento', next:'Em Andamento' };
    return null;
  };

  const btnProximo = botaoProximoStatus();

  // helper de campo editável
  const FInput = ({ label, field, type='text' }: { label:string; field:string; type?:string }) => (
    <div>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}</label>
      <input type={type} value={formEdit[field]||''} onChange={e=>setF(field,e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex' }}>
      <div style={{ display:'flex', width:'100%', height:'100%' }}>

        {/* ══════════════ ESQUERDO: Formulário Editável ══════════════ */}
        <div style={{ width:'42%', minWidth:320, display:'flex', flexDirection:'column', background:'#fff', borderRight:'2px solid #e2e8f0', boxShadow:'2px 0 12px #0002' }}>

          {/* Header */}
          <div style={{ padding:'12px 14px', background:STATUS_COR[s]||'#374151', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div>
              <div style={{ fontSize:9, opacity:.8, fontWeight:700, letterSpacing:.5 }}>{s.toUpperCase()} · {licit.classificacao}</div>
              <div style={{ fontSize:13, fontWeight:700 }}>{licit.numero} — {licit.nome_projeto}</div>
              <div style={{ fontSize:9, opacity:.85 }}>{licit.orgao}</div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', padding:'2px 6px' }}>✕</button>
          </div>

          {/* Marcadores + Prioridade */}
          <div style={{ padding:'6px 12px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', flexShrink:0 }}>
            <span style={{ background:PRIO_COR[formEdit.prioridade]||'#374151', color:'#fff', borderRadius:4, padding:'1px 7px', fontSize:9, fontWeight:700 }}>★ {formEdit.prioridade}</span>
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

          {/* Form editável (scrollable) */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <FInput label="Número" field="numero" />
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Classificação</label>
                <select value={formEdit.classificacao||'Direta'} onChange={e=>setF('classificacao',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11 }}>
                  <option>Direta</option><option>Parceiro</option><option>Adesão a ATA</option>
                </select>
              </div>
            </div>

            <FInput label="Nome do Projeto" field="nome_projeto" />
            <FInput label="Órgão" field="orgao" />
            <FInput label="Objeto Principal" field="objeto_principal" />

            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>Prioridade</label>
              <div style={{ display:'flex', gap:6 }}>
                {PRIORIDADES.map(p => (
                  <button key={p} onClick={() => setF('prioridade', p)}
                    style={{ flex:1, padding:'4px', border:`1.5px solid ${formEdit.prioridade===p?PRIO_COR[p]:'#d1d5db'}`,
                      background: formEdit.prioridade===p ? PRIO_COR[p]+'18' : '#fff',
                      color: formEdit.prioridade===p ? PRIO_COR[p] : '#374151',
                      borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>PRAZOS</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <FInput label="Limite Esclarecimentos/Impugnação" field="data_limite_esclarecimentos" type="datetime-local" />
                <FInput label="Limite Proposta" field="data_limite_proposta" type="datetime-local" />
                <FInput label="Data/Hora de Disputa" field="data_disputa" type="datetime-local" />
                <FInput label="Limite Análise Técnica" field="data_limite_analise_tecnica" type="datetime-local" />
              </div>
            </div>

            <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>RESPONSÁVEIS</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <FInput label="Analista de Licitações" field="analista_nome" />
                <FInput label="E-mail Analista" field="analista_email" type="email" />
                <FInput label="Analista Técnico" field="coordenador_nome" />
                <FInput label="E-mail Analista Técnico" field="coordenador_email" type="email" />
              </div>
            </div>

            {/* Histórico de status */}
            {(licit.historico||[]).length > 0 && (
              <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>HISTÓRICO</div>
                {[...(licit.historico||[])].reverse().slice(0,5).map((h: any, i: number) => (
                  <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COR[h.status]||'#6b7280', marginTop:3, flexShrink:0 }} />
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:STATUS_COR[h.status]||'#374151' }}>{h.status}</div>
                      <div style={{ fontSize:9, color:'#6b7280' }}>{h.usuario} · {fmtDT(h.data)}</div>
                      {h.obs && <div style={{ fontSize:9, color:'#374151' }}>{h.obs}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer: Salvar + Status + Ações */}
          <div style={{ borderTop:'1px solid #e2e8f0', padding:'10px 14px', flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>

            {/* Pós-vitória */}
            {showAcoesVencida && (
              <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:6, padding:10, marginBottom:4 }}>
                <div style={{ fontWeight:700, color:'#166534', fontSize:12, marginBottom:6 }}>🏆 VENCIDA! Emita os documentos:</div>
                {pedidoEmitido ? (
                  <div style={{ background:'#dcfce7', borderRadius:4, padding:'6px 10px', fontSize:10, color:'#166534', fontWeight:700, marginBottom:4 }}>
                    ✅ Pedido {pedidoEmitido} emitido! Veja aba Compras.
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
                <button onClick={onClose}
                  style={{ width:'100%', background:'#fff', color:'#374151', border:'1px solid #d1d5db', borderRadius:4, padding:'5px', fontSize:10, cursor:'pointer' }}>
                  Fechar
                </button>
              </div>
            )}

            {/* Confirmação de transição de status */}
            {confirmStatus && (
              <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:4, padding:8 }}>
                <div style={{ fontWeight:700, fontSize:10, marginBottom:5 }}>
                  Mover para: <span style={{ color:STATUS_COR[confirmStatus] }}>{confirmStatus}</span>
                </div>
                <textarea value={obsEncerramento} onChange={e=>setObsEncerramento(e.target.value)}
                  placeholder="Observação (opcional)..." rows={2}
                  style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, resize:'none', boxSizing:'border-box', marginBottom:5 }} />
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
                {/* Botão Salvar */}
                <button onClick={salvarForm} disabled={salvandoForm}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6, padding:'8px', fontWeight:700, fontSize:12, cursor:'pointer', opacity:salvandoForm?.6:1 }}>
                  {salvandoForm ? 'Salvando...' : '💾 Salvar Alterações'}
                </button>

                {/* Próximo status */}
                {btnProximo && (
                  <button onClick={() => setConfirmStatus(btnProximo.next)}
                    style={{ background:STATUS_COR[btnProximo.next], color:'#fff', border:'none', borderRadius:6, padding:'7px', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    {btnProximo.label}
                  </button>
                )}

                {/* Encerramento (Em Andamento) */}
                {s === 'Em Andamento' && isAnalista && (
                  <div style={{ display:'flex', gap:6 }}>
                    {['Vencida','Perdida','Descartada'].map(ns => (
                      <button key={ns} onClick={() => setConfirmStatus(ns)}
                        style={{ flex:1, background:STATUS_COR[ns], color:'#fff', border:'none', borderRadius:4, padding:'5px 4px', fontWeight:700, fontSize:9, cursor:'pointer' }}>
                        {ns === 'Vencida' ? '🏆 Vencida' : ns === 'Perdida' ? '😞 Perdida' : '🗑️ Descartada'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Solicitar Análise + Excluir */}
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

        {/* ══════════════ DIREITO: Abas de Documentos ══════════════ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f4f6f9', overflow:'hidden' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', overflowX:'auto', borderBottom:'2px solid #e2e8f0', background:'#fff', flexShrink:0, scrollbarWidth:'none' }}>
            {TABS_DIREITO.map(t => (
              <button key={t.key} onClick={() => setTabDir(t.key)}
                style={{ flex:'0 0 auto', padding:'9px 12px', border:'none',
                  borderBottom: tabDir===t.key ? '2px solid #2563eb' : '2px solid transparent',
                  background: 'none', fontWeight: tabDir===t.key ? 700 : 400,
                  color: tabDir===t.key ? '#2563eb' : '#6b7280', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Conteúdo da aba */}
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>

            {/* ── ANÁLISE ── */}
            {tabDir === 'analise' && (
              <AnaliseStatusPanel
                origemId={licit.id}
                origemTitulo={licit.nome_projeto}
                origemNumero={licit.numero}
                origem="licitacao"
                currentUser={currentUser}
                onSolicitarNova={() => setShowModalSolicitar(true)}
              />
            )}

            {/* ── ANDAMENTO (com legado + novo) ── */}
            {tabDir === 'andamento' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Input de nova entrada */}
                <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:10, color:'#166534', marginBottom:6 }}>✏️ Nova Atualização</div>
                  <MencaoTextarea value={novoText} onChange={v=>setNovoText(v)}
                    placeholder="Descreva o andamento... @Nome para mencionar" rows={3}
                    style={{ fontSize:11 }} />
                  {/* Anexo opcional */}
                  <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                    <label style={{ fontSize:10, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:4, background:'#e0f2fe', borderRadius:4, padding:'3px 8px', border:'1px solid #7dd3fc' }}>
                      📎 Vincular arquivo
                      <input type="file" ref={novoAnexoRef} style={{ display:'none' }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                        onChange={e=>setNovoAnexoFile(e.target.files?.[0]||null)} />
                    </label>
                    {novoAnexoFile && (
                      <span style={{ fontSize:9, color:'#0369a1', fontWeight:600 }}>
                        📎 {novoAnexoFile.name}
                        <button onClick={()=>{setNovoAnexoFile(null);if(novoAnexoRef.current)novoAnexoRef.current.value='';}}
                          style={{ marginLeft:4, background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:10 }}>✕</button>
                      </span>
                    )}
                  </div>
                  <button onClick={salvarDoc} disabled={salvandoDoc||(!novoText.trim()&&!novoAnexoFile)}
                    style={{ marginTop:8, background:'#16a34a', color:'#fff', border:'none', borderRadius:4, padding:'6px 18px', fontWeight:700, fontSize:11, cursor:'pointer', opacity:(novoText.trim()||novoAnexoFile)?1:.5 }}>
                    {salvandoDoc ? 'Salvando...' : '+ Registrar'}
                  </button>
                </div>

                {/* Entradas novas (licitacao_documentos) */}
                {docs.map((d: any) => (
                  <div key={d.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, borderLeft:'3px solid #2563eb', padding:'10px 12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        {d.conteudo && <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}>{d.conteudo}</div>}
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
                      </div>
                      {isAdmin && (
                        <button onClick={() => excluirDoc(d.id,'licitacao_documentos')}
                          style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 2px', flexShrink:0 }}>✕</button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Entradas legadas (licitacao_anexos tipo=andamento) */}
                {docsLegacy.length > 0 && (
                  <>
                    <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textAlign:'center', padding:'4px 0' }}>— registros anteriores —</div>
                    {docsLegacy.map((a: any) => (
                      <div key={a.id} style={{ background:'#fafafa', border:'1px solid #e2e8f0', borderRadius:6, borderLeft:'3px solid #94a3b8', padding:'8px 12px' }}>
                        <div style={{ fontSize:11, color:'#1e293b', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.5 }}>{a.conteudo}</div>
                        <div style={{ marginTop:4, fontSize:9, color:'#9ca3af', display:'flex', gap:8 }}>
                          <span>👤 {a.criado_por_nome||'—'}</span>
                          <span>🕒 {fmtDT(a.criado_em)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {docs.length === 0 && docsLegacy.length === 0 && !loadingDocs && (
                  <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Nenhuma atualização ainda.</div>
                )}
              </div>
            )}

            {/* ── OUTRAS ABAS DE DOCUMENTOS ── */}
            {tabDir !== 'andamento' && tabDir !== 'analise' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Upload */}
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:10, color:'#374151', marginBottom:8 }}>
                    + Adicionar em {TABS_DIREITO.find(t=>t.key===tabDir)?.label}
                  </div>
                  <input type="file" ref={uploadRef}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar"
                    onChange={e=>setUploadFile(e.target.files?.[0]||null)}
                    style={{ width:'100%', fontSize:11, marginBottom:8 }} />
                  <input type="text" placeholder="Descrição / legenda (opcional)"
                    value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box', marginBottom:8 }} />
                  <button onClick={salvarDoc} disabled={salvandoDoc||(!uploadFile&&!uploadDesc.trim())}
                    style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4, padding:'6px 16px', fontSize:11, fontWeight:700, cursor:'pointer', opacity:(uploadFile||uploadDesc.trim())?1:.5 }}>
                    {salvandoDoc ? 'Salvando...' : '+ Adicionar'}
                  </button>
                </div>

                {/* Lista */}
                {loadingDocs && <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:16 }}>Carregando...</div>}
                {!loadingDocs && docs.length === 0 && (
                  <div style={{ color:'#9ca3af', fontSize:12, textAlign:'center', padding:24 }}>Nenhum documento nesta categoria.</div>
                )}
                {docs.map((d: any) => (
                  <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer"
                          style={{ color:'#2563eb', fontSize:11, fontWeight:600, wordBreak:'break-all', display:'flex', alignItems:'center', gap:4 }}>
                          📎 {d.nome}
                        </a>
                      ) : (
                        <div style={{ fontSize:11, color:'#374151', fontWeight:600 }}>{d.nome}</div>
                      )}
                      {d.conteudo && <div style={{ fontSize:10, color:'#64748b', marginTop:2, whiteSpace:'pre-wrap' }}>{d.conteudo}</div>}
                      <div style={{ fontSize:9, color:'#9ca3af', marginTop:3 }}>
                        👤 {d.criado_por_nome||'—'} · 🕒 {fmtDT(d.criado_em)}
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => excluirDoc(d.id,'licitacao_documentos')}
                        style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, padding:'0 2px' }}>✕</button>
                    )}
                  </div>
                ))}
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
          onSaved={() => setTabDir('analise')}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, alert }: { label:string; value:string; alert?: boolean }) {
  return (
    <div style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:6 }}>
      <div style={{ fontSize:9, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px' }}>{label}</div>
      <div style={{ fontSize:12, color: alert ? '#dc2626' : '#1f2937', fontWeight: alert ? 700 : 400 }}>
        {value}{alert ? ' ⚠️' : ''}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL NOVA LICITAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function ModalNova({ currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({ ...LICIT_VAZIO, analista_nome: currentUser?.nome||'', analista_email: currentUser?.email||'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.numero.trim()) { alert('Número da licitação obrigatório!'); return; }
    if (!form.nome_projeto.trim()) { alert('Nome do projeto obrigatório!'); return; }
    if (!form.orgao.trim()) { alert('Órgão obrigatório!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const historico = [{ status:'Aberta', usuario: currentUser?.nome, data: agora, obs:'Licitação aberta.' }];
    await supabase.from('licitacoes').insert([{
      ...form,
      data_registro: agora,
      data_limite_esclarecimentos: form.data_limite_esclarecimentos || null,
      data_limite_proposta: form.data_limite_proposta || null,
      data_disputa: form.data_disputa || null,
      data_limite_analise_tecnica: form.data_limite_analise_tecnica || null,
      historico,
      marcadores: [],
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
    }]);
    setSalvando(false);
    onSaved();
    onClose();
  };

  const Input = ({ label, field, type='text', required=false }) => (
    <div>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>{label}{required?' *':''}</label>
      <input type={type} value={form[field]} onChange={e=>set(field,e.target.value)}
        style={{ width:'100%', padding:'5px 8px', border:`1px solid ${required&&!form[field]?'#fca5a5':'#d1d5db'}`, borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(640px,95vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, color:'#1f2937', display:'flex', justifyContent:'space-between' }}>
          <span>+ Nova Licitação</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Número da Licitação" field="numero" required />
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Classificação *</label>
              <select value={form.classificacao} onChange={e=>set('classificacao',e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11 }}>
                <option>Direta</option>
                <option>Parceiro</option>
              </select>
            </div>
          </div>

          <Input label="Nome do Projeto" field="nome_projeto" required />
          <Input label="Órgão" field="orgao" required />
          <Input label="Objeto Principal" field="objeto_principal" />

          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Prioridade</label>
            <div style={{ display:'flex', gap:6 }}>
              {PRIORIDADES.map(p => (
                <button key={p} onClick={() => set('prioridade', p)}
                  style={{ flex:1, padding:'5px', border:`1.5px solid ${form.prioridade===p?PRIO_COR[p]:'#d1d5db'}`,
                    background: form.prioridade===p ? PRIO_COR[p]+'18' : '#fff',
                    color: form.prioridade===p ? PRIO_COR[p] : '#374151',
                    borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>PRAZOS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Esclarecimentos/Impugnação</label>
                <input type="datetime-local" value={form.data_limite_esclarecimentos} onChange={e=>set('data_limite_esclarecimentos',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Cadastro da Proposta</label>
                <input type="datetime-local" value={form.data_limite_proposta} onChange={e=>set('data_limite_proposta',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Data/Hora de Disputa</label>
                <input type="datetime-local" value={form.data_disputa} onChange={e=>set('data_disputa',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 }}>Limite Análise Técnica</label>
                <input type="datetime-local" value={form.data_limite_analise_tecnica} onChange={e=>set('data_limite_analise_tecnica',e.target.value)}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>RESPONSÁVEIS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Input label="Analista de Licitações" field="analista_nome" />
              <Input label="E-mail do Analista" field="analista_email" type="email" />
              <Input label="Analista Técnico" field="coordenador_nome" />
              <Input label="E-mail do Analista Técnico" field="coordenador_email" type="email" />
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
function LicitCard({ l, onClick }) {
  const marcadores: string[] = l.marcadores || [];
  const dias = diasRestantes(l.data_disputa);
  const urgente = dias !== null && dias >= 0 && dias <= 5;
  const vencidoDisputa = dias !== null && dias < 0 && ['Aberta','Em Análise','Analisada','Em Andamento'].includes(l.status);

  return (
    <div onClick={onClick} style={{ background:'#fff', border:`1.5px solid ${STATUS_COR[l.status]||'#e2e8f0'}20`,
      borderLeft:`4px solid ${STATUS_COR[l.status]||'#e2e8f0'}`,
      borderRadius:6, padding:'10px 12px', cursor:'pointer', marginBottom:8,
      boxShadow:'0 1px 3px #0001', transition:'box-shadow .15s',
    }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 3px 8px #0002')}
      onMouseLeave={e=>(e.currentTarget.style.boxShadow='0 1px 3px #0001')}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ background:STATUS_COR[l.status], color:'#fff', borderRadius:3, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{l.status}</span>
            <span style={{ background: PRIO_COR[l.prioridade]+'18', color:PRIO_COR[l.prioridade], border:`1px solid ${PRIO_COR[l.prioridade]}40`, borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>{l.prioridade}</span>
            <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:600 }}>{l.classificacao}</span>
            {marcadores.map(m => (
              <span key={m} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 5px', fontSize:8, fontWeight:700 }}>{m}</span>
            ))}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1f2937', marginBottom:2 }}>{l.numero} — {l.nome_projeto}</div>
          <div style={{ fontSize:10, color:'#6b7280' }}>{l.orgao}</div>
          {l.objeto_principal && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>{l.objeto_principal}</div>}
        </div>
      </div>
      {/* Prazos */}
      <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
        {l.data_disputa && (
          <span style={{ fontSize:9, fontWeight:700, color: vencidoDisputa?'#dc2626': urgente?'#d97706':'#374151',
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
        {l.analista_nome && (
          <span style={{ fontSize:9, color:'#9ca3af' }}>👤 {l.analista_nome}</span>
        )}
        <AnaliseStatusBadge origemId={l.id} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function LicitacoesTab({ currentUser }) {
  const [licitacoes, setLicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroAnalista, setFiltroAnalista] = useState<string>('');
  const [filtroPeriodoDe, setFiltroPeriodoDe] = useState('');
  const [filtroPeriodoAte, setFiltroPeriodoAte] = useState('');
  const [sortBy, setSortBy] = useState('data_disputa');
  const [modalNova, setModalNova] = useState(false);
  const [selected, setSelected] = useState<any|null>(null);

  const isAdmin = true; // acesso já controlado pelo dashboard
  const isAnalista = true;

  const excluirLicitacao = async (l: any) => {
    if (!confirm(`Excluir "${l.numero} — ${l.nome_projeto}"?\n\nEsta ação não pode ser desfeita.`)) return;
    // salva na lixeira
    await supabase.from('lixeira').insert([{
      tabela: 'licitacoes',
      registro_id: l.id,
      dados: l,
      deletado_por: currentUser?.nome || currentUser?.email,
    }]).then(() => {});
    await supabase.from('licitacoes').delete().eq('id', l.id);
    setSelected(null);
    fetch();
  };

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('licitacoes').select('*').order('criado_em', { ascending: false });
    setLicitacoes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // ── Filtros e ordenação ──────────────────────────────────────────────────
  const lista = licitacoes
    .filter(l => filtroStatus === 'todas' || l.status === filtroStatus)
    .filter(l => filtroTipo === 'todos' || l.classificacao === filtroTipo)
    .filter(l => !filtroAnalista || (l.analista_nome||'').toLowerCase().includes(filtroAnalista.toLowerCase()))
    .filter(l => {
      if (!filtroPeriodoDe && !filtroPeriodoAte) return true;
      const disp = l.data_disputa ? new Date(l.data_disputa) : null;
      if (!disp) return !filtroPeriodoDe;
      if (filtroPeriodoDe && disp < new Date(filtroPeriodoDe)) return false;
      if (filtroPeriodoAte && disp > new Date(filtroPeriodoAte + 'T23:59:59')) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'prioridade') {
        const ord = { 'Alta':0, 'Média':1, 'Baixa':2 };
        return (ord[a.prioridade]??1) - (ord[b.prioridade]??1);
      }
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'orgao') return (a.orgao||'').localeCompare(b.orgao||'');
      const da = a[sortBy] ? new Date(a[sortBy]).getTime() : Infinity;
      const db2 = b[sortBy] ? new Date(b[sortBy]).getTime() : Infinity;
      return da - db2;
    });

  // contadores por status
  const conts: Record<string,number> = {};
  licitacoes.forEach(l => { conts[l.status] = (conts[l.status]||0) + 1; });

  const analistasUnicos = [...new Set(licitacoes.map(l => l.analista_nome).filter(Boolean))];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f4f6f9' }}>

      {/* ── HEADER ── */}
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

      {/* ── STATUS CHIPS ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 16px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
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
            {s} {conts[s]?`(${conts[s]})` : '(0)'}
          </button>
        ))}
      </div>

      {/* ── FILTROS ── */}
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
            <option>Direta</option>
            <option>Parceiro</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:2 }}>👤 RESPONSÁVEL</div>
          <select value={filtroAnalista} onChange={e=>setFiltroAnalista(e.target.value)}
            style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="">Todos</option>
            {analistasUnicos.map(a => <option key={a} value={a}>{a}</option>)}
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
        {(filtroTipo!=='todos'||filtroAnalista||filtroPeriodoDe||filtroPeriodoAte) && (
          <button onClick={() => { setFiltroTipo('todos'); setFiltroAnalista(''); setFiltroPeriodoDe(''); setFiltroPeriodoAte(''); }}
            style={{ padding:'4px 10px', border:'1px solid #fca5a5', borderRadius:4, background:'#fef2f2', color:'#dc2626', fontSize:10, cursor:'pointer' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── LISTA ── */}
      <div style={{ flex:1, overflowY:'auto', padding:16 }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>Carregando...</div>
        ) : !lista.length ? (
          <div style={{ textAlign:'center', color:'#9ca3af', padding:40 }}>
            {filtroStatus !== 'todas' ? `Nenhuma licitação com status "${filtroStatus}".` : 'Nenhuma licitação cadastrada.'}
          </div>
        ) : (
          lista.map(l => (
            <LicitCard key={l.id} l={l} onClick={() => setSelected(l)} />
          ))
        )}
      </div>

      {/* ── MODAIS ── */}
      {modalNova && (
        <ModalNova currentUser={currentUser} onClose={() => setModalNova(false)} onSaved={fetch} />
      )}
      {selected && (
        <LicitacaoModal
          licit={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onExcluir={() => excluirLicitacao(selected)}
          onRefresh={() => {
            fetch();
            // Atualiza o selected com os dados novos
            supabase.from('licitacoes').select('*').eq('id', selected.id).single()
              .then(({ data }) => { if (data) setSelected(data); });
          }}
        />
      )}
    </div>
  );
}
