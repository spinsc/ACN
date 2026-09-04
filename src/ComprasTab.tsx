// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import MencaoTextarea, { salvarMencoes, resolverMencoesRespondidas } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';
import Linkify from './Linkify';
import { CentrosCustoManager, ordenarArvore, labelHierarquico } from './CentroCustoShared';
import { logChange, useUnreadMap } from './AuditSystem';

const VAZIO_COTACAO = { fornecedor_nome: '', valor: '', condicao_pagamento: '', prazo_entrega: '' };

async function uploadCotacaoArquivo(file: File): Promise<{ url: string; nome: string; error?: string }> {
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `pcp-cotacoes/${Date.now()}_${nomeLimpo}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return { url: '', nome: '', error: error?.message || 'Falha desconhecida ao enviar.' };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  if (!pub?.publicUrl) return { url: '', nome: '', error: 'Não foi possível gerar o link público do arquivo.' };
  return { url: pub.publicUrl, nome: file.name };
}

function imprimirSolicitacao(p: any) {
  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const html = `
    <html><head><title>Solicitação de Compra</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 30px; color: #000; }
      h2 { color: #1a3a52; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #1a3a52; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      .badge { display:inline-block; padding:2px 8px; border-radius:4px; color:#fff; font-weight:bold; background:#16a34a; }
      .footer { margin-top:30px; font-size:10px; color:#6b7280; }
      @media print { button { display:none; } }
    </style></head>
    <body>
      <h2>🛒 Solicitação de Compra</h2>
      <table>
        <tr><th>Campo</th><th>Informação</th></tr>
        <tr><td><b>Nº Pedido</b></td><td>${p.numero_pedido || '—'}</td></tr>
        <tr><td><b>OP Referência</b></td><td>${p.opl || '—'}</td></tr>
        <tr><td><b>Descrição</b></td><td>${p.descricao_material || '—'}</td></tr>
        <tr><td><b>Quantidade</b></td><td>${p.quantidade || '—'}</td></tr>
        <tr><td><b>Fornecedor</b></td><td>${p.fornecedor || '—'}</td></tr>
        <tr><td><b>Valor Total da Compra</b></td><td>${fmt(p.valor_compra)}</td></tr>
        <tr><td><b>Previsão de Recebimento</b></td><td>${fmtDt(p.data_prevista_recebimento)}</td></tr>
        <tr><td><b>Status</b></td><td><span class="badge">${p.status_compra || '—'}</span></td></tr>
        <tr><td><b>Data da Solicitação</b></td><td>${p.data_criacao ? new Date(p.data_criacao).toLocaleDateString('pt-BR') : '—'}</td></tr>
        ${p.observacoes_compra ? `<tr><td><b>Observações</b></td><td style="white-space:pre-wrap">${p.observacoes_compra}</td></tr>` : ''}
      </table>
      <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

export function imprimirOrdemCompra(p: any) {
  if (!p.numero_oc) return;
  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const html = `
    <html><head><title>Ordem de Compra ${p.numero_oc}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 30px; color: #000; }
      h2 { color: #1a3a52; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #1a3a52; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      .badge { display:inline-block; padding:2px 8px; border-radius:4px; color:#fff; font-weight:bold; background:#7c3aed; }
      .footer { margin-top:30px; font-size:10px; color:#6b7280; }
      @media print { button { display:none; } }
    </style></head>
    <body>
      <h2>📋 Ordem de Compra — <span class="badge">${p.numero_oc}</span></h2>
      <table>
        <tr><th>Campo</th><th>Informação</th></tr>
        <tr><td><b>Nº Pedido</b></td><td>${p.numero_pedido || '—'}</td></tr>
        <tr><td><b>OP Referência</b></td><td>${p.opl || '—'}</td></tr>
        <tr><td><b>Descrição</b></td><td>${p.descricao_material || '—'}</td></tr>
        <tr><td><b>Quantidade</b></td><td>${p.quantidade || '—'}</td></tr>
        <tr><td><b>Fornecedor</b></td><td>${p.fornecedor || '—'}</td></tr>
        <tr><td><b>Valor Total da Compra</b></td><td>${fmt(p.valor_compra)}</td></tr>
        <tr><td><b>Centro de Custo</b></td><td>${p.centro_custo || '—'}</td></tr>
        <tr><td><b>Previsão de Recebimento</b></td><td>${fmtDt(p.data_prevista_recebimento)}</td></tr>
        <tr><td><b>Justificativa da Vencedora</b></td><td>${p.justificativa_vencedora || '—'}</td></tr>
      </table>
      <div class="footer">Emitido em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ÁREA LIVRE POR COTAÇÃO — editor rico com suporte a tabelas coladas do
// Excel/Word, pra embasar a decisão de qual cotação vence. Mesmo padrão do
// AreaLivre de LicitacoesTab.tsx, mas independente (salva em
// pcp_cotacoes_fornecedores.area_livre, não em licitacoes.areas_livres).
// ─────────────────────────────────────────────────────────────────────────────
function CotacaoAreaLivre({ cotacao, onSaved }: any) {
  const editorRef   = useRef<any>(null);
  const imgInputRef = useRef<any>(null);
  const timerRef    = useRef<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo]       = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = cotacao.area_livre || '';
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [cotacao.id]);

  const salvarConteudo = async () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    setSalvando(true);
    const { error } = await supabase.from('pcp_cotacoes_fornecedores')
      .update({ area_livre: html }).eq('id', cotacao.id);
    setSalvando(false);
    if (!error) {
      onSaved?.(html);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
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
    const path = `pcp-cotacoes/${cotacao.id}/area-livre/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (error) { alert('Erro ao inserir imagem: ' + error.message); return; }
    const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
    const url = urlData?.publicUrl;
    if (!url) return;
    document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;border-radius:4px;margin:4px 0" />`);
    autosave();
  };

  const handlePaste = (e: any) => {
    const items = Array.from(e.clipboardData?.items || []);
    const hasHtml = items.some((i: any) => i.type === 'text/html');
    const imageItem = items.find((i: any) => i.type.startsWith('image/')) as any;
    if (imageItem && !hasHtml) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) inserirImagem(file);
    }
    setTimeout(autosave, 100);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden', marginTop:6 }}>
      <div style={{ background:'#f1f5f9', borderBottom:'1px solid #e2e8f0', padding:'3px 6px',
        display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ fontSize:8, fontWeight:700, color:'#6b7280', marginRight:2 }}>✏️ Área Livre</span>
        {(['bold','italic'] as const).map(cmd => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); }}
            title={cmd === 'bold' ? 'Negrito' : 'Itálico'}
            style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
              padding:'1px 6px', fontSize:10, fontWeight: cmd==='bold' ? 700 : 400,
              fontStyle: cmd==='italic' ? 'italic' : 'normal', cursor:'pointer', lineHeight:1.4 }}>
            {cmd === 'bold' ? 'B' : 'I'}
          </button>
        ))}
        <button onMouseDown={e => {
          e.preventDefault();
          const url = window.prompt('URL do link:');
          if (url) document.execCommand('createLink', false, url);
        }} title="Inserir link"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'1px 6px', fontSize:10, cursor:'pointer', lineHeight:1.4 }}>
          🔗
        </button>
        <button onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click(); }}
          title="Inserir imagem"
          style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:3,
            padding:'1px 6px', fontSize:10, cursor:'pointer', lineHeight:1.4 }}>
          📷
        </button>
        <input ref={imgInputRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagem(f); e.target.value = ''; }} />
        <div style={{ flex:1 }} />
        {salvando && <span style={{ fontSize:8, color:'#d97706' }}>Salvando...</span>}
        {salvo && !salvando && <span style={{ fontSize:8, color:'#16a34a' }}>✓ Salvo</span>}
        <button onClick={salvarAgora} disabled={salvando} title="Salvar agora"
          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:3,
            padding:'1px 8px', fontSize:8, fontWeight:700, cursor:'pointer', opacity: salvando ? .6 : 1 }}>
          💾 Salvar
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="cotacao-area-livre"
        onInput={autosave}
        onPaste={handlePaste}
        style={{ minHeight:50, padding:'8px 10px', fontSize:10, color:'#1e293b',
          lineHeight:1.5, outline:'none', background:'#fff', wordBreak:'break-word' }}
        data-placeholder="Notas sobre esta cotação, cole tabelas, imagens, links..."
      />
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .cotacao-area-livre table { border-collapse:collapse; width:100%; }
        .cotacao-area-livre td, .cotacao-area-livre th {
          border:1px solid #d1d5db; padding:3px 5px; font-size:9px; }
      `}</style>
    </div>
  );
}

export default function ComprasTab({ currentUser }) {
  const [pedidos, setPedidos]   = useState([]);
  // Linhas com alteração não vista por este usuário ganham borda amarela —
  // mesmo padrão usado nas outras telas (ver AuditSystem.tsx).
  const { naoLidoSet: pedidosNaoLidos } = useUnreadMap('pcp_pedidos_compra', pedidos.map((p: any) => p.id), currentUser);
  const [loading, setLoading]   = useState(false);
  const [filtro, setFiltro]     = useState('');
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [modalObs, setModalObs] = useState<any>(null);
  const [obsTexto, setObsTexto] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);
  // Centro de Custo
  const [centrosCusto, setCentrosCusto]         = useState<any[]>([]);
  const [modalCentro, setModalCentro]           = useState<any>(null); // pedido em edição
  const [centroTipo, setCentroTipo]             = useState<'op'|'custom'|'livre'>('op');
  const [centroLivre, setCentroLivre]           = useState('');
  const [centroCustom, setCentroCustom]         = useState('');
  const [opBusca, setOpBusca]                   = useState('');
  const [opResultados, setOpResultados]         = useState<any[]>([]);
  const [opSelecionada, setOpSelecionada]       = useState('');
  const [salvandoCentro, setSalvandoCentro]     = useState(false);
  const [modalGerCentros, setModalGerCentros]   = useState(false);

  // Departamento (aprovação por gestor)
  const [departamentosConfig, setDepartamentosConfig] = useState<any[]>([]);
  const [modalDepartamento, setModalDepartamento]     = useState<any>(null); // pedido em edição
  const [departamentoSelecionado, setDepartamentoSelecionado] = useState('');
  const [salvandoDepartamento, setSalvandoDepartamento]       = useState(false);

  // Mesa de Cotações (Fase 1)
  const [modalCotacoes, setModalCotacoes]       = useState<any>(null); // pedido em cotação
  const [cotacoes, setCotacoes]                 = useState<any[]>([]);
  const [loadingCotacoes, setLoadingCotacoes]   = useState(false);
  const [novaCotacao, setNovaCotacao]           = useState({ ...VAZIO_COTACAO });
  const [novoAnexoCotacao, setNovoAnexoCotacao] = useState<File|null>(null);
  const [enviandoCotacao, setEnviandoCotacao]   = useState(false);
  const [vencedoraId, setVencedoraId]           = useState<string|null>(null);
  // Aprovar cotação com senha (substitui o antigo fluxo de rádio + justificativa + confirmar)
  const [modalConfirmarSenha, setModalConfirmarSenha] = useState<any>(null); // cotação sendo aprovada
  const [senhaConfirmacao, setSenhaConfirmacao] = useState('');
  const [verificandoSenha, setVerificandoSenha] = useState(false);
  const [erroSenha, setErroSenha]               = useState('');

  // Alçadas de Aprovação (Fase 2)
  const [alcadasConfig, setAlcadasConfig]       = useState<any[]>([]);
  const [aprovacoesPedido, setAprovacoesPedido] = useState<any[]>([]);
  const [respondendoAprovacao, setRespondendoAprovacao] = useState(false);

  // Prazo Prometido de Entrega (Fase 1)
  const [modalPrazoProm, setModalPrazoProm]     = useState<any>(null);
  const [prazoPromData, setPrazoPromData]       = useState('');
  const [prazoPromDestino, setPrazoPromDestino] = useState<'producao'|'cliente'>('producao');
  const [salvandoPrazoProm, setSalvandoPrazoProm] = useState(false);

  // Acompanhamento (timeline) — reaproveita OplAcompModal
  const [modalAcomp, setModalAcomp]             = useState<any>(null);

  // Valores inline por pedido: { [id]: { valor, prazo, salvando } }
  const [inline, setInline] = useState<Record<string,{valor:string,prazo:string,salvando:boolean}>>({});

  const canVerValor = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';

  const fmtData = (d: string) => {
    if (!d) return <span style={{color:'#9ca3af'}}>—</span>;
    // data_prevista_recebimento é timestamptz no banco — supabase-js retorna ISO completo
    // (ex: "2026-08-30T00:00:00+00:00"), não só "YYYY-MM-DD". Pega só a data antes de remontar.
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime()-hoje.getTime())/86400000);
    const str = dt.toLocaleDateString('pt-BR');
    if (diff < 0)   return <span style={{color:'#dc2626',fontWeight:700}}>{str} ⚠️</span>;
    if (diff === 0) return <span style={{color:'#f59e0b',fontWeight:700}}>Hoje!</span>;
    if (diff <= 3)  return <span style={{color:'#f59e0b'}}>{str}</span>;
    return str;
  };

  const COR: Record<string,string> = {
    'Pendente':'#fbbf24','Em Andamento':'#3b82f6','Aguardando Aprovação':'#ea580c','Comprado':'#7c3aed','Concluído':'#22c55e',
  };

  useEffect(() => {
    load();
    loadCentros();
    loadAlcadas();
    loadDepartamentos();
    const t = setInterval(()=>load(true), 30000);
    return () => clearInterval(t);
  }, [filtro]);

  // Deep-link vindo do painel de Menções ("Pedido X" clicável): abre a Mesa de
  // Cotações do pedido direto, em vez de só cair na aba Compras genérica. Usa um
  // global (window.__acnDeepLink) além do evento porque, se esta aba ainda não
  // estava montada quando o link foi clicado, o listener abaixo só existe DEPOIS
  // do mount — o global cobre esse caso lendo no próprio efeito de mount.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || (pend.contexto !== 'compra' && pend.contexto !== 'compra_aprovacao')) return;
      (window as any).__acnDeepLink = null;
      supabase.from('pcp_pedidos_compra').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) abrirModalCotacoes(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const loadCentros = async () => {
    const { data } = await supabase.from('centros_custo').select('*').eq('ativo', true).order('codigo');
    setCentrosCusto(data || []);
  };

  const loadAlcadas = async () => {
    const { data } = await supabase.from('compras_alcadas_aprovacao').select('*').order('nivel');
    setAlcadasConfig(data || []);
  };

  const loadDepartamentos = async () => {
    const { data } = await supabase.from('compras_departamentos').select('*').eq('ativo', true).order('nome');
    setDepartamentosConfig(data || []);
  };

  const buscarOps = async (q: string) => {
    if (!q.trim()) { setOpResultados([]); return; }
    const { data } = await supabase.from('oples').select('id,opl,cliente_nome,tipo_projeto')
      .ilike('opl', `%${q}%`).limit(8);
    setOpResultados(data || []);
  };

  const abrirModalCentro = (p: any) => {
    setModalCentro(p);
    setCentroTipo(p.centro_custo_id ? 'custom' : 'op');
    setOpBusca(p.opl || '');
    setOpSelecionada(p.opl ? (p.centro_custo?.startsWith('OP') ? p.centro_custo : `OP ${p.opl}`) : '');
    setCentroCustom(p.centro_custo_id || '');
    setCentroLivre(p.centro_custo_id ? '' : (p.centro_custo || ''));
    setOpResultados([]);
  };

  const salvarCentro = async () => {
    if (!modalCentro) return;
    setSalvandoCentro(true);
    if (centroTipo === 'custom') {
      if (!centroCustom) { alert('Selecione um centro de custo.'); setSalvandoCentro(false); return; }
      // Grava a FK real (centro_custo_id) e também o texto (fallback para
      // telas que ainda leem só centro_custo — ex: agrupamento no Financeiro).
      const centro = centrosCusto.find((c:any) => c.id === centroCustom);
      const label = centro ? labelHierarquico(centro, centrosCusto) + ' — ' + centro.nome : '';
      await supabase.from('pcp_pedidos_compra').update({ centro_custo_id: centroCustom, centro_custo: label }).eq('id', modalCentro.id);
      setSalvandoCentro(false);
      setModalCentro(null); load();
      return;
    }
    let valor = '';
    if (centroTipo === 'op') {
      if (!opSelecionada) { alert('Selecione uma OP.'); setSalvandoCentro(false); return; }
      valor = opSelecionada;
    } else {
      if (!centroLivre.trim()) { alert('Informe o centro de custo.'); setSalvandoCentro(false); return; }
      valor = centroLivre.trim();
    }
    await supabase.from('pcp_pedidos_compra').update({ centro_custo: valor, centro_custo_id: null }).eq('id', modalCentro.id);
    setSalvandoCentro(false);
    setModalCentro(null);
    load();
  };

  const abrirModalDepartamento = (p: any) => {
    setModalDepartamento(p);
    setDepartamentoSelecionado(p.departamento_id || '');
  };

  const salvarDepartamento = async () => {
    if (!modalDepartamento) return;
    if (!departamentoSelecionado) { alert('Selecione um departamento.'); return; }
    setSalvandoDepartamento(true);
    await supabase.from('pcp_pedidos_compra')
      .update({ departamento_id: departamentoSelecionado }).eq('id', modalDepartamento.id);
    setSalvandoDepartamento(false);
    setModalDepartamento(null);
    load();
  };

  const [queryError, setQueryError] = useState<string|null>(null);

  const load = async (silent=false) => {
    if (!silent) setLoading(true);
    setQueryError(null);
    let q = supabase.from('pcp_pedidos_compra').select('*').order('data_criacao', {ascending:false});
    if (filtro) q = q.eq('status_compra', filtro);
    const { data, error } = await q;
    if (error) { setQueryError(error.message); if (!silent) setLoading(false); setPedidos([]); return; }
    setPedidos(data || []);
    if (silent) {
      // Refresh silencioso (polling a cada 30s): não sobrescrever edições em
      // andamento (ex: campos abertos na Mesa de Cotações) — só adiciona
      // pedidos novos que ainda não têm entrada em `inline`.
      setInline((prev: any) => {
        const next = { ...prev };
        (data||[]).forEach((p:any) => {
          if (!next[p.id]) {
            next[p.id] = {
              valor:    p.valor_compra  ? String(p.valor_compra)  : '',
              prazo:    p.data_prevista_recebimento || '',
              salvando: false,
            };
          }
        });
        return next;
      });
    } else {
      const init: any = {};
      (data||[]).forEach((p:any) => {
        init[p.id] = {
          valor:    p.valor_compra  ? String(p.valor_compra)  : '',
          prazo:    p.data_prevista_recebimento || '',
          salvando: false,
        };
      });
      setInline(init);
    }
    if (!silent) setLoading(false);
  };

  const setInlineField = (id: string, field: string, val: string) =>
    setInline(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const avancarStatus = async (p: any) => {
    // 'Comprado' → 'Concluído' não está mais aqui de propósito — a partir da
    // Fase 3, só fecha via conferência técnica na Logística (seriais/volume/NF).
    const prox: Record<string,string> = {
      'Pendente':'Em Andamento',
    };
    const novoStatus = prox[p.status_compra];
    if (!novoStatus) return;
    const updates: any = { status_compra: novoStatus };
    const { error } = await supabase.from('pcp_pedidos_compra').update(updates).eq('id', p.id);
    if (error) alert('Erro: ' + error.message);
    else {
      logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: p.id, changeType: 'UPDATE',
        oldRow: { status_compra: p.status_compra }, newRow: { status_compra: novoStatus }, user: currentUser });
      setFiltro(''); load();
    }
  };

  // ── Mesa de Cotações ──────────────────────────────────────────────────────
  // Removido de propósito: existia um atalho manual "✅ Concluir" que fechava
  // a compra direto (valor + prazo digitados na linha), sem passar pelas 3
  // cotações mínimas nem pela aprovação por departamento/alçada — driblava
  // o controle inteiro desta feature. A Mesa de Cotações (abrirModalCotacoes)
  // é agora o único caminho de Em Andamento → Comprado.
  const abrirModalCotacoes = async (p: any) => {
    setModalCotacoes(p);
    setNovaCotacao({ ...VAZIO_COTACAO });
    setNovoAnexoCotacao(null);
    setVencedoraId(p.vencedora_id || null);
    setLoadingCotacoes(true);
    const { data } = await supabase.from('pcp_cotacoes_fornecedores')
      .select('*').eq('pedido_id', p.id).order('criado_em', { ascending: true });
    setCotacoes(data || []);
    setLoadingCotacoes(false);
    carregarAprovacoes(p.id);
  };

  const carregarAprovacoes = async (pedidoId: string) => {
    const { data } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedidoId).order('nivel', { ascending: true });
    setAprovacoesPedido(data || []);
    return data || [];
  };

  const adicionarCotacao = async () => {
    if (!modalCotacoes) return;
    if (!novaCotacao.fornecedor_nome.trim() || !novaCotacao.valor) {
      alert('Informe ao menos o nome do fornecedor e o valor.'); return;
    }
    if (novoAnexoCotacao && novoAnexoCotacao.size > 10 * 1024 * 1024) {
      alert(`Anexo muito grande (${(novoAnexoCotacao.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCotacao(true);
    let anexo: { url:string; nome:string } | null = null;
    if (novoAnexoCotacao) {
      const res = await uploadCotacaoArquivo(novoAnexoCotacao);
      if (res.error) { alert('Erro ao enviar anexo: ' + res.error); setEnviandoCotacao(false); return; }
      anexo = res;
    }
    const { error } = await supabase.from('pcp_cotacoes_fornecedores').insert([{
      pedido_id: modalCotacoes.id,
      fornecedor_nome: novaCotacao.fornecedor_nome.trim(),
      valor: parseFloat(String(novaCotacao.valor).replace(/\./g,'').replace(',','.')) || null,
      condicao_pagamento: novaCotacao.condicao_pagamento.trim() || null,
      prazo_entrega: novaCotacao.prazo_entrega.trim() || null,
      anexo_url: anexo?.url || null,
      anexo_nome: anexo?.nome || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setEnviandoCotacao(false);
    if (error) { alert('Erro ao salvar cotação: ' + error.message); return; }
    // Era a 1ª cotação deste pedido e ele tem departamento definido: dispara a
    // aprovação do gestor do departamento (camada adicional à alçada por valor,
    // que só dispara depois, ao confirmar a compra com vencedora).
    if (cotacoes.length === 0 && modalCotacoes.departamento_id) {
      await dispararAprovacaoDepartamento(modalCotacoes);
    }
    setNovaCotacao({ ...VAZIO_COTACAO });
    setNovoAnexoCotacao(null);
    abrirModalCotacoes(modalCotacoes);
  };

  // ── Aprovação por Departamento ────────────────────────────────────────────
  const dispararAprovacaoDepartamento = async (pedido: any) => {
    const departamento = departamentosConfig.find((d:any) => d.id === pedido.departamento_id);
    if (!departamento) return;
    await supabase.from('pcp_aprovacoes').insert([{
      pedido_id: pedido.id, tipo: 'departamento', nivel: 0, nivel_nome: departamento.nome,
      aprovador_id: departamento.gestor_id, aprovador_nome: departamento.gestor_nome,
      valor_no_momento: null, status: 'pendente',
      solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
    }]);
    await notificarGestorDepartamento(pedido, departamento);
  };

  const notificarGestorDepartamento = async (pedido: any, departamento: any) => {
    try {
      const texto = `Nova cotação lançada — pedido ${pedido.numero_pedido} (${departamento.nome}): ${pedido.descricao_material}`;
      await supabase.from('mencoes').insert({
        mencionado_id: departamento.gestor_id, mencionado_nome: departamento.gestor_nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
        contexto_descricao: `Pedido ${pedido.numero_pedido}`,
        campo: 'aprovacao_departamento', texto_trecho: texto,
        aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
      });
      const { data: gestor } = await supabase.from('auth_usuarios')
        .select('email').eq('id', departamento.gestor_id).maybeSingle();
      if (gestor?.email) {
        const html = `<h3>Nova cotação para avaliar</h3>
          <p><strong>Departamento: ${departamento.nome}</strong></p>
          <p>Pedido: ${pedido.numero_pedido}<br>Descrição: ${pedido.descricao_material}</p>
          <p>Acesse o sistema (aba Compras) para acompanhar, aprovar ou rejeitar.</p>`;
        await supabase.functions.invoke('send-email', {
          body: { to: [gestor.email], subject: `Nova cotação — Pedido ${pedido.numero_pedido}`, html },
        });
      }
    } catch (e) { console.warn('Falha ao notificar gestor do departamento:', e); }
  };

  const excluirCotacao = async (id: string) => {
    if (!confirm('Remover esta cotação?')) return;
    await supabase.from('pcp_cotacoes_fornecedores').delete().eq('id', id);
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalCotacoes(modalCotacoes);
  };

  // ── Alçadas de Aprovação (Fase 2) ─────────────────────────────────────────
  const notificarAprovadoresNivel = async (pedido: any, nivelRow: any) => {
    try {
      const perfis = nivelRow.perfis_aprovadores || [];
      if (perfis.length === 0) return;
      const { data: aprovadores } = await supabase.from('auth_usuarios')
        .select('id, nome, email').in('perfil', perfis).eq('ativo', true);
      if (!aprovadores || aprovadores.length === 0) return;
      const valorFmt = fmt(pedido.valor_compra);
      const texto = `Aprovação necessária (Nível ${nivelRow.nivel} — ${nivelRow.nome}): pedido ${pedido.numero_pedido} — ${pedido.descricao_material} — ${valorFmt}`;
      for (const ap of aprovadores) {
        await supabase.from('mencoes').insert({
          mencionado_id: String(ap.id), mencionado_nome: ap.nome,
          mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
          contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
          contexto_descricao: `Pedido ${pedido.numero_pedido}`,
          campo: 'aprovacao_nivel', texto_trecho: texto,
          aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
        });
      }
      const emails = aprovadores.map((a:any) => a.email).filter(Boolean);
      if (emails.length > 0) {
        const html = `<h3>Aprovação de compra necessária</h3>
          <p><strong>Nível ${nivelRow.nivel} — ${nivelRow.nome}</strong></p>
          <p>Pedido: ${pedido.numero_pedido}<br>Descrição: ${pedido.descricao_material}<br>Valor: ${valorFmt}</p>
          <p>Acesse o sistema (aba Compras) para aprovar ou rejeitar.</p>`;
        await supabase.functions.invoke('send-email', {
          body: { to: emails, subject: `Aprovação necessária — Pedido ${pedido.numero_pedido}`, html },
        });
      }
    } catch (e) { console.warn('Falha ao notificar aprovadores:', e); }
  };

  const notificarCriadorPedido = async (pedido: any, mensagem: string) => {
    try {
      if (!pedido.criado_por) return;
      const { data: criador } = await supabase.from('auth_usuarios')
        .select('id, nome').eq('email', pedido.criado_por).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
        contexto_descricao: `Pedido ${pedido.numero_pedido}`,
        campo: 'resultado_aprovacao', texto_trecho: mensagem,
        aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar criador do pedido:', e); }
  };

  // Depois que a compra fecha (status_compra='Comprado'), cria uma demanda em
  // "Compras — Demandas" pra ela seguir o fluxo normal a partir dali (ex:
  // acompanhamento de recebimento/logística) — busca o pedido fresco pra já
  // pegar o numero_oc gerado pelo trigger na mesma atualização.
  const criarDemandaComprasFinalizada = async (pedidoId: string) => {
    try {
      const { data: pedido } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', pedidoId).maybeSingle();
      if (!pedido) return;
      await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Compras',
        descricao: `[COMPRA CONCLUÍDA] Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''} — ${pedido.descricao_material || ''} — Fornecedor: ${pedido.fornecedor || '—'} — ${fmt(pedido.valor_compra)}`,
        numero_opl: pedido.opl || null,
        status: 'Pendente',
        tipo_solicitacao: 'compra',
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
        data_abertura: new Date().toISOString(),
        logs_demanda: [{ texto: `Compra confirmada${pedido.numero_oc ? ` — OC ${pedido.numero_oc}` : ''}.`, usuario: currentUser?.nome, hora: new Date().toISOString() }],
      }]);
    } catch (e) { console.warn('Falha ao criar demanda de compra concluída:', e); }
  };

  // Ponto único que decide, ao confirmar uma compra, se ela precisa de aprovação
  // (alçada disparada pelo valor) ou se pode ir direto pra 'Comprado' como antes.
  const dispararOuConfirmar = async (pedidoId: string, extraUpdates: any) => {
    const valorCompra = extraUpdates.valor_compra;
    const niveis = alcadasConfig
      .filter(a => a.ativo && Number(a.valor_minimo) <= Number(valorCompra || 0))
      .sort((a,b) => a.nivel - b.nivel);
    // Pode já existir uma linha de aprovação por departamento pendente, criada na
    // 1ª cotação (ver dispararAprovacaoDepartamento) — nesse caso a compra também
    // precisa aguardar, mesmo que nenhuma alçada por valor tenha disparado agora.
    const { data: pendentesExistentes } = await supabase.from('pcp_aprovacoes')
      .select('id').eq('pedido_id', pedidoId).eq('status', 'pendente').limit(1);
    const jaTemPendencia = (pendentesExistentes?.length || 0) > 0;
    if (niveis.length === 0 && !jaTemPendencia) {
      const { error } = await supabase.from('pcp_pedidos_compra')
        .update({ ...extraUpdates, status_compra: 'Comprado' }).eq('id', pedidoId);
      if (!error) await criarDemandaComprasFinalizada(pedidoId);
      return { error };
    }
    const { data: pedidoAtual } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', pedidoId).maybeSingle();
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ ...extraUpdates, status_compra: 'Aguardando Aprovação' }).eq('id', pedidoId);
    if (error) return { error };
    if (niveis.length > 0) {
      await supabase.from('pcp_aprovacoes').insert(niveis.map(n => ({
        pedido_id: pedidoId, nivel: n.nivel, nivel_nome: n.nome, valor_no_momento: valorCompra,
        status: 'pendente', solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
      })));
    }
    // Notifica o nível pendente de menor número — pode ser a linha de departamento
    // (nivel 0, já notificada quando criada) ou o 1º nível de alçada recém-criado.
    const { data: pendentesOrdenados } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedidoId).eq('status', 'pendente').order('nivel', { ascending: true });
    const proximaPendencia = pendentesOrdenados?.[0];
    if (proximaPendencia && proximaPendencia.tipo !== 'departamento') {
      const nivelConfig = alcadasConfig.find(a => a.nivel === proximaPendencia.nivel);
      if (nivelConfig) await notificarAprovadoresNivel({ ...pedidoAtual, ...extraUpdates, id: pedidoId }, nivelConfig);
    }
    return { error: null, aguardandoAprovacao: true };
  };

  // Marca a pendência de menor nível (de `lista`) como aprovada e resolve em
  // cascata — notifica o próximo nível se sobrar alçada, ou fecha pra
  // "Comprado" se não sobrar nada e já existir vencedora. Recebe `lista`/`pedido`
  // como parâmetro (em vez de ler do state) pra poder ser chamada logo após um
  // fetch fresco, sem depender do próximo render pra enxergar dados recém-criados.
  const resolverPendenciaComoAprovada = async (lista: any[], pedido: any) => {
    const nivelAtivo = lista.find(a => a.status === 'pendente');
    if (!nivelAtivo) return;
    await supabase.from('pcp_aprovacoes').update({
      status: 'aprovado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(),
    }).eq('id', nivelAtivo.id);
    // Este usuário acabou de agir sobre a pendência dele — resolve a menção
    // de "aprovação necessária" que o trouxe até aqui.
    resolverMencoesRespondidas({ contexto: 'compra_aprovacao', contextoId: pedido.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    const { data: restantes } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedido.id).eq('status', 'pendente').order('nivel', { ascending: true });
    if (restantes && restantes.length > 0) {
      if (restantes[0].tipo !== 'departamento') {
        const proximaAlcada = alcadasConfig.find(a => a.nivel === restantes[0].nivel);
        if (proximaAlcada) await notificarAprovadoresNivel(pedido, proximaAlcada);
      }
      // linha de departamento: já foi notificada quando criada, nada a fazer aqui.
    } else {
      // Só fecha a compra se já existe cotação vencedora escolhida — aprovar cedo
      // a linha de departamento (antes do comprador confirmar a compra) não deve
      // sozinho fechar o pedido.
      const { data: pedidoAtual } = await supabase.from('pcp_pedidos_compra')
        .select('vencedora_id').eq('id', pedido.id).maybeSingle();
      if (pedidoAtual?.vencedora_id) {
        await supabase.from('pcp_pedidos_compra').update({ status_compra: 'Comprado' }).eq('id', pedido.id);
        await criarDemandaComprasFinalizada(pedido.id);
        await notificarCriadorPedido(pedido, `Compra aprovada e confirmada — pedido ${pedido.numero_pedido}.`);
      }
    }
  };

  // Checa se o usuário logado pode aprovar a pendência atual — mesma regra pra
  // departamento (aprovador_id específico) e alçada (perfil dentro de
  // perfis_aprovadores). Sem pendência nenhuma, não há autorização especial a checar.
  const souAprovadorPara = (pendencia: any) => {
    if (!pendencia) return true;
    if (pendencia.tipo === 'departamento') {
      return String(currentUser?.id) === pendencia.aprovador_id || currentUser?.perfil === 'Admin';
    }
    const alcada = alcadasConfig.find(a => a.nivel === pendencia.nivel);
    return !!(alcada && (alcada.perfis_aprovadores||[]).includes(currentUser?.perfil));
  };

  const aprovarNivelAtivo = async () => {
    if (!modalCotacoes) return;
    setRespondendoAprovacao(true);
    await resolverPendenciaComoAprovada(aprovacoesPedido, modalCotacoes);
    setRespondendoAprovacao(false);
    setModalCotacoes(null);
    setFiltro('');
    load();
  };

  const rejeitarNivelAtivo = async () => {
    const nivelAtivo = aprovacoesPedido.find(a => a.status === 'pendente');
    if (!nivelAtivo || !modalCotacoes) return;
    // Mesma checagem de autorização que "Aprovar" já faz — rejeitar não pode
    // ser mais permissivo que aprovar.
    if (!souAprovadorPara(nivelAtivo)) {
      const quem = nivelAtivo.tipo === 'departamento'
        ? nivelAtivo.aprovador_nome
        : (alcadasConfig.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para rejeitar este pedido. Aguardando: ' + (quem || '—'));
      return;
    }
    const motivo = prompt('Motivo da rejeição:');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Informe o motivo.'); return; }
    setRespondendoAprovacao(true);
    await supabase.from('pcp_aprovacoes').update({
      status: 'rejeitado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(), resposta: motivo.trim(),
    }).eq('id', nivelAtivo.id);
    resolverMencoesRespondidas({ contexto: 'compra_aprovacao', contextoId: modalCotacoes.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    await supabase.from('pcp_aprovacoes').update({ status: 'cancelado' })
      .eq('pedido_id', modalCotacoes.id).eq('status', 'pendente');
    await supabase.from('pcp_pedidos_compra').update({
      status_compra: 'Em Andamento', vencedora_id: null, justificativa_vencedora: null,
    }).eq('id', modalCotacoes.id);
    await notificarCriadorPedido(modalCotacoes, `Compra rejeitada (Nível ${nivelAtivo.nivel} — ${nivelAtivo.nivel_nome}). Motivo: ${motivo.trim()}`);
    setRespondendoAprovacao(false);
    setVencedoraId(null);
    setModalCotacoes(null);
    setFiltro('');
    load();
  };

  // Clique em "✅ Aprovar" numa cotação específica: valida as regras de sempre
  // (prazo definido) e, se houver uma pendência de aprovação em aberto,
  // confirma que ESTE usuário tem autorização pra resolvê-la antes de
  // sequer abrir o prompt de senha. 3 cotações é o recomendado, não mais
  // obrigatório — nem sempre dá pra conseguir 3 fornecedores pro mesmo item.
  const aprovarCotacaoComoVencedora = (cotacao: any) => {
    if (!modalCotacoes) return;
    const row = inline[modalCotacoes.id];
    if (!row?.prazo) { alert('Informe a previsão de recebimento antes de aprovar.'); return; }
    const pendencia = aprovacoesPedido.find(a => a.status === 'pendente');
    if (pendencia && !souAprovadorPara(pendencia)) {
      const quem = pendencia.tipo === 'departamento'
        ? pendencia.aprovador_nome
        : (alcadasConfig.find(a=>a.nivel===pendencia.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para aprovar este pedido. Aguardando: ' + (quem || '—'));
      return;
    }
    setModalConfirmarSenha(cotacao);
    setSenhaConfirmacao('');
    setErroSenha('');
  };

  // Confirma a senha de quem está aprovando e, se bater, seleciona a cotação
  // como vencedora e resolve a aprovação pendente (se houver e for desta pessoa).
  const confirmarAprovacaoComSenha = async () => {
    const cotacao = modalConfirmarSenha;
    if (!cotacao || !modalCotacoes) return;
    if (!senhaConfirmacao) { setErroSenha('Digite sua senha.'); return; }
    setVerificandoSenha(true);
    const { data: usuarioAtual } = await supabase.from('auth_usuarios')
      .select('senha').eq('id', currentUser?.id).maybeSingle();
    if (!usuarioAtual || usuarioAtual.senha !== senhaConfirmacao) {
      setVerificandoSenha(false);
      setErroSenha('Senha incorreta.');
      return;
    }
    const row = inline[modalCotacoes.id];
    const textoJustificativa = (cotacao.area_livre || '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      || `Cotação vencedora: ${cotacao.fornecedor_nome}`;
    const { error } = await dispararOuConfirmar(modalCotacoes.id, {
      vencedora_id: cotacao.id,
      justificativa_vencedora: textoJustificativa,
      fornecedor: cotacao.fornecedor_nome,
      valor_compra: cotacao.valor,
      data_prevista_recebimento: row.prazo,
    });
    if (error) {
      setVerificandoSenha(false);
      setErroSenha('Erro: ' + error.message);
      return;
    }
    // Pode ter nascido uma alçada nova (ou já existir uma pendência de
    // departamento) — busca fresco e resolve na hora se for algo que ESTE
    // usuário pode aprovar; senão fica "Aguardando Aprovação" normalmente.
    const listaFresca = await carregarAprovacoes(modalCotacoes.id);
    const pendenciaFresca = listaFresca.find((a:any) => a.status === 'pendente');
    if (pendenciaFresca && souAprovadorPara(pendenciaFresca)) {
      await resolverPendenciaComoAprovada(listaFresca, modalCotacoes);
    }
    setVerificandoSenha(false);
    setModalConfirmarSenha(null);
    setModalCotacoes(null);
    setFiltro('');
    load();
  };

  // ── Prazo Prometido de Entrega ────────────────────────────────────────────
  const abrirModalPrazoProm = (p: any) => {
    setModalPrazoProm(p);
    setPrazoPromData(p.prazo_prometido_entrega || '');
    setPrazoPromDestino(p.prazo_prometido_destino || 'producao');
  };

  const salvarPrazoProm = async () => {
    if (!modalPrazoProm) return;
    if (!prazoPromData) { alert('Informe a data prometida.'); return; }
    setSalvandoPrazoProm(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      prazo_prometido_entrega: prazoPromData,
      prazo_prometido_destino: prazoPromDestino,
    }).eq('id', modalPrazoProm.id);
    setSalvandoPrazoProm(false);
    if (error) { alert('Erro: ' + error.message); return; }
    logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: modalPrazoProm.id, changeType: 'UPDATE',
      oldRow: { prazo_prometido_entrega: modalPrazoProm.prazo_prometido_entrega, prazo_prometido_destino: modalPrazoProm.prazo_prometido_destino },
      newRow: { prazo_prometido_entrega: prazoPromData, prazo_prometido_destino: prazoPromDestino }, user: currentUser });
    setModalPrazoProm(null);
    load();
  };

  const salvarObs = async () => {
    if (!obsTexto.trim() || !modalObs) return;
    setSalvandoObs(true);
    const agora = new Date().toLocaleString('pt-BR');
    const linha = `[${agora} — ${currentUser?.nome||'Sistema'}]: ${obsTexto.trim()}`;
    const atual = modalObs.observacoes_compra || '';
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ observacoes_compra: atual ? `${atual}\n${linha}` : linha }).eq('id', modalObs.id);
    if (!error) {
      await salvarMencoes({
        texto: obsTexto,
        mencionanteId: String(currentUser?.id || ''),
        mencionanteNome: currentUser?.nome || 'Sistema',
        contexto: 'compra',
        contextoId: String(modalObs.id),
        contextoDescricao: `Pedido ${modalObs.numero_pedido || ''}`,
        campo: 'observacoes_compra',
        abaDestino: 'compras',
      });
      logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: modalObs.id, changeType: 'UPDATE',
        oldRow: { observacoes: null }, newRow: { observacoes: obsTexto.trim().slice(0,120) }, user: currentUser });
      setModalObs(null); setObsTexto(''); load();
    }
    else alert('Erro: ' + error.message);
    setSalvandoObs(false);
  };

  const total = pedidos.length;
  const kpis = ['Pendente','Em Andamento','Aguardando Aprovação','Comprado','Concluído'].map(s => ({
    label: s, n: pedidos.filter(p=>p.status_compra===s).length, cor: COR[s],
  }));

  // Concluídos ficam agrupados/colapsados no fim da lista, pendentes e em
  // andamento sempre no topo — só quando a visão é "Todos os status"; um
  // filtro de status específico (ex: só "Concluído") continua mostrando
  // exatamente o que foi filtrado, sem o agrupamento.
  const agruparPorStatus  = filtro === '';
  const pedidosAtivos     = agruparPorStatus ? pedidos.filter((p:any) => p.status_compra !== 'Concluído') : pedidos;
  const pedidosConcluidos = agruparPorStatus ? pedidos.filter((p:any) => p.status_compra === 'Concluído') : [];

  const renderPedidoRow = (p: any) => {
    const row   = inline[p.id] || {valor:'',prazo:'',salvando:false};
    const isEM  = p.status_compra === 'Em Andamento';
    const isAguardandoAprovacao = p.status_compra === 'Aguardando Aprovação';
    const naoLido = pedidosNaoLidos.has(String(p.id));
    return (
      <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9',
        background: naoLido ? '#fffdf0' : isEM ? '#f0fdf4' : isAguardandoAprovacao ? '#fff7ed' : undefined,
        borderLeft: naoLido ? '4px solid #eab308' : undefined}}>
        <td style={td}><strong>{p.numero_pedido}</strong></td>
        <td style={td}>{p.opl||'—'}</td>
        <td style={{...td,maxWidth:150}}>
          <span style={{ display:'block', wordBreak:'break-word' }}>
            {p.descricao_material}
          </span>
        </td>
        <td style={td}>{p.quantidade}</td>
        <td style={td}>{p.fornecedor||'—'}</td>

        {/* VALOR — somente leitura; só é definido ao escolher a cotação vencedora na Mesa de Cotações */}
        {canVerValor && (
          <td style={td}>
            {p.valor_compra
              ? <strong style={{color:'#16a34a'}}>{fmt(p.valor_compra)}</strong>
              : <span style={{color:'#9ca3af'}}>—</span>}
          </td>
        )}

        {/* CENTRO DE CUSTO */}
        <td style={{...td,maxWidth:130}}>
          {p.centro_custo ? (
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{ background:'#eff6ff', color:'#1d4ed8', borderRadius:10, padding:'2px 8px', fontSize:9, fontWeight:700, maxWidth:100, wordBreak:'break-word' }} title={p.centro_custo}>
                {p.centro_custo}
              </span>
              <button onClick={()=>abrirModalCentro(p)} title="Alterar centro de custo"
                style={{...btn,background:'transparent',color:'#6366f1',fontSize:12,padding:'0 2px'}}>✏️</button>
            </div>
          ) : (
            <button onClick={()=>abrirModalCentro(p)}
              style={{...btn,background:'#f1f5f9',color:'#6366f1',fontSize:9,border:'1px dashed #a5b4fc'}}>
              + Definir
            </button>
          )}
        </td>

        {/* DEPARTAMENTO */}
        <td style={{...td,maxWidth:130}}>
          {(() => {
            const dep = departamentosConfig.find((d:any) => d.id === p.departamento_id);
            return dep ? (
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{ background:'#f0fdf4', color:'#15803d', borderRadius:10, padding:'2px 8px', fontSize:9, fontWeight:700, maxWidth:100, wordBreak:'break-word' }} title={dep.nome}>
                  {dep.nome}
                </span>
                <button onClick={()=>abrirModalDepartamento(p)} title="Alterar departamento"
                  style={{...btn,background:'transparent',color:'#15803d',fontSize:12,padding:'0 2px'}}>✏️</button>
              </div>
            ) : (
              <button onClick={()=>abrirModalDepartamento(p)}
                style={{...btn,background:'#f1f5f9',color:'#15803d',fontSize:9,border:'1px dashed #86efac'}}>
                + Definir
              </button>
            );
          })()}
        </td>

        {/* PRAZO — editável direto para itens Em Andamento */}
        <td style={td}>
          {isEM ? (
            <input type="date"
              value={row.prazo}
              onChange={e => setInlineField(p.id,'prazo',e.target.value)}
              style={{width:130,padding:'5px 7px',border:'2px solid #16a34a',borderRadius:5,fontSize:12,outline:'none'}}
            />
          ) : (
            fmtData(p.data_prevista_recebimento)
          )}
        </td>

        {/* PRAZO PROMETIDO — compromisso com Produção ou Cliente, independente do prazo do fornecedor */}
        <td style={{...td,maxWidth:130}}>
          {p.prazo_prometido_entrega ? (
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span title={p.prazo_prometido_destino==='cliente'?'Prometido ao cliente':'Prometido à Produção'}>
                {p.prazo_prometido_destino==='cliente' ? '👤' : '🏭'}
              </span>
              {fmtData(p.prazo_prometido_entrega)}
              <button onClick={()=>abrirModalPrazoProm(p)} title="Alterar prazo prometido"
                style={{...btn,background:'transparent',color:'#6366f1',fontSize:12,padding:'0 2px'}}>✏️</button>
            </div>
          ) : (
            <button onClick={()=>abrirModalPrazoProm(p)}
              style={{...btn,background:'#f1f5f9',color:'#6366f1',fontSize:9,border:'1px dashed #a5b4fc'}}>
              + Definir
            </button>
          )}
        </td>

        <td style={td}>
          <span style={{padding:'3px 9px',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,
            background:COR[p.status_compra]||'#9ca3af'}}>
            {p.status_compra||'—'}
          </span>
          {p.numero_oc && (
            <div style={{marginTop:4}}>
              <span style={{fontSize:9,fontWeight:700,color:'#7c3aed',fontFamily:'monospace'}} title="Ordem de Compra">
                📋 {p.numero_oc}
              </span>
            </div>
          )}
        </td>

        <td style={{...td,whiteSpace:'nowrap'}}>
          {/* ▶️ Pendente → Em Andamento */}
          {p.status_compra==='Pendente' && (
            <button onClick={()=>avancarStatus(p)} style={{...btn,background:'#3b82f6',marginRight:3}}>▶️ Iniciar</button>
          )}

          {/* 🏷️ Mesa de Cotações — fluxo recomendado para Em Andamento → Comprado */}
          {isEM && (
            <button onClick={()=>abrirModalCotacoes(p)}
              style={{...btn,background:'#d97706',marginRight:3}}>
              🏷️ Cotações{p.vencedora_id ? ' ✓' : ''}
            </button>
          )}

          {/* 🔒 Aguardando Aprovação — abre a mesma mesa de cotações, agora mostrando a seção de aprovação */}
          {isAguardandoAprovacao && (
            <button onClick={()=>abrirModalCotacoes(p)}
              style={{...btn,background:'#ea580c',marginRight:3}}>
              🔒 Ver Aprovação
            </button>
          )}

          {/* 📦 Comprado → Concluído — só via conferência técnica na Logística (Fase 3) */}
          {p.status_compra==='Comprado' && (
            <span title="Registre o recebimento (seriais/volume/NF conferida) na aba Logística pra fechar"
              style={{fontSize:9,color:'#78716c',marginRight:6,fontStyle:'italic'}}>
              📦 Aguarda recebimento na Logística
            </span>
          )}

          {/* 🗨️ Acompanhamento — timeline/chat do pedido */}
          <button onClick={()=>setModalAcomp(p)}
            style={{...btn,background:'#7c3aed',marginRight:3}}>
            🗨️
          </button>

          {/* 💬 Observações (registro curto, aparece na impressão) */}
          <button onClick={()=>{setModalObs(p);setObsTexto('');}}
            style={{...btn,background:p.observacoes_compra?'#0891b2':'#64748b',marginRight:3}}>
            💬
          </button>

          {/* 🖨️ Imprimir */}
          <button onClick={()=>imprimirSolicitacao(p)}
            style={{...btn,background:'#475569'}}>🖨️</button>

          {/* 📋 Imprimir Ordem de Compra — só existe depois de Comprado */}
          {p.numero_oc && (
            <button onClick={()=>imprimirOrdemCompra(p)} title={`Imprimir ${p.numero_oc}`}
              style={{...btn,background:'#7c3aed',marginLeft:3}}>📋 OC</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div style={{background:'#fff',borderRadius:8,padding:20,marginTop:16,boxShadow:'0 1px 3px #0001'}}>

      {/* CABEÇALHO */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <h2 style={{fontSize:15,fontWeight:700,color:'#1a3a52',margin:0}}>🛒 Requisições de Compra — OP Vinculada</h2>
          <button onClick={()=>setModalGerCentros(true)}
            style={{...btn,background:'#6366f1',fontSize:10,whiteSpace:'nowrap'}}>⚙️ Centros de Custo</button>
        </div>
        <select value={filtro} onChange={e=>setFiltro(e.target.value)}
          style={{padding:'5px 10px',border:'1px solid #d1d5db',borderRadius:6,fontSize:11}}>
          <option value="">Todos os status</option>
          {['Pendente','Em Andamento','Aguardando Aprovação','Comprado','Concluído'].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {queryError && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'10px 14px',marginBottom:12,fontSize:11,color:'#dc2626'}}>
          ⚠️ Erro ao carregar dados: <strong>{queryError}</strong>
        </div>
      )}

      {loading ? <div style={{textAlign:'center',padding:30,color:'#9ca3af'}}>Carregando...</div>
        : pedidos.length===0 ? <div style={{textAlign:'center',padding:30,color:'#9ca3af',fontSize:12}}>Nenhuma requisição encontrada. {queryError ? '' : '(tabela vazia ou sem permissão)'}</div>
        : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                <th style={th}>Nº Pedido</th>
                <th style={th}>OP</th>
                <th style={th}>Descrição</th>
                <th style={th}>Qtd</th>
                <th style={th}>Fornecedor</th>
                {canVerValor && <th style={th}>💰 Valor da Compra</th>}
                <th style={th}>🏷️ Centro de Custo</th>
                <th style={th}>🏢 Departamento</th>
                <th style={th}>📅 Prev. Recebimento</th>
                <th style={th}>🎯 Prazo Prometido</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidosAtivos.map(renderPedidoRow)}
              {agruparPorStatus && pedidosConcluidos.length > 0 && (
                <tr>
                  <td colSpan={canVerValor ? 12 : 11} style={{padding:0}}>
                    <button onClick={()=>setMostrarConcluidos(v=>!v)}
                      style={{width:'100%',padding:'7px 10px',border:'none',borderTop:'2px solid #e2e8f0',
                        background:'#f8fafc',color:'#475569',fontSize:11,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                      {mostrarConcluidos ? '▲ Ocultar' : '▼ Mostrar'} Concluídos ({pedidosConcluidos.length})
                    </button>
                  </td>
                </tr>
              )}
              {agruparPorStatus && mostrarConcluidos && pedidosConcluidos.map(renderPedidoRow)}
            </tbody>
          </table>
        </div>
      )}

      {/* KPIs */}
      <div style={{marginTop:16,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10}}>
        <div style={{...kpi,borderColor:'#1e293b'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#1e293b'}}>{total}</div>
          <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>Total</div>
        </div>
        {kpis.map(k=>(
          <div key={k.label} style={{...kpi,borderColor:k.cor}}>
            <div style={{fontSize:20,fontWeight:700,color:k.cor}}>{k.n}</div>
            <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* MODAL CENTRO DE CUSTO */}
      {modalCentro && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalCentro(null);}}>
          <div className="modal-box" style={{maxWidth:460}}>
            <div className="modal-title">🏷️ Centro de Custo — {modalCentro.numero_pedido}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:10}}>{modalCentro.descricao_material}</div>

            {/* Seletor de tipo */}
            <div style={{display:'flex',gap:0,marginBottom:14,borderRadius:6,overflow:'hidden',border:'1.5px solid #d1d5db'}}>
              {([['op','📋 OP/OS'],['custom','🏷️ Centro'],['livre','✏️ Livre']] as const).map(([t,l])=>(
                <button key={t} onClick={()=>setCentroTipo(t as any)} style={{
                  flex:1,padding:'7px 4px',border:'none',cursor:'pointer',fontSize:10,fontWeight:700,
                  background:centroTipo===t?'#6366f1':'white',
                  color:centroTipo===t?'white':'#475569',
                  borderRight:t!=='livre'?'1px solid #d1d5db':'none',
                }}>{l}</button>
              ))}
            </div>

            {/* OP/OS */}
            {centroTipo==='op' && (
              <>
                <label className="acn-label">Número da OP</label>
                <input className="acn-input" style={{width:'100%',marginBottom:6}}
                  value={opBusca} placeholder="Digite o número da OP para buscar..."
                  onChange={e=>{ setOpBusca(e.target.value); buscarOps(e.target.value); }} />
                {opResultados.length>0 && (
                  <div style={{border:'1px solid #e2e8f0',borderRadius:6,marginBottom:10,maxHeight:160,overflowY:'auto'}}>
                    {opResultados.map((o:any)=>(
                      <div key={o.id} onClick={()=>{setOpSelecionada(`OP ${o.opl}`);setOpBusca(o.opl);setOpResultados([]);}}
                        style={{padding:'7px 12px',cursor:'pointer',fontSize:10,
                          background:opSelecionada===`OP ${o.opl}`?'#eff6ff':'white',
                          borderBottom:'1px solid #f1f5f9'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')}
                        onMouseLeave={e=>(e.currentTarget.style.background=opSelecionada===`OP ${o.opl}`?'#eff6ff':'white')}>
                        <strong>{o.opl}</strong>
                        <span style={{color:'#64748b',marginLeft:8}}>{o.cliente_nome||''} {o.tipo_projeto?`— ${o.tipo_projeto}`:''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {opSelecionada && <div style={{fontSize:10,color:'#1d4ed8',marginBottom:10}}>✔ Selecionado: <strong>{opSelecionada}</strong></div>}
              </>
            )}

            {/* Centro personalizado */}
            {centroTipo==='custom' && (
              <>
                <label className="acn-label">Centro de Custo</label>
                {centrosCusto.length===0 ? (
                  <div style={{fontSize:10,color:'#ef4444',marginBottom:10}}>
                    Nenhum centro cadastrado. Use ⚙️ Centros de Custo para criar.
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10,maxHeight:200,overflowY:'auto'}}>
                    {ordenarArvore(centrosCusto).map((c:any)=>(
                      <div key={c.id} onClick={()=>setCentroCustom(c.id)} style={{
                        padding:'8px 12px',marginLeft:c.nivel*16,borderRadius:6,cursor:'pointer',fontSize:11,
                        border:centroCustom===c.id?'2px solid #6366f1':'1.5px solid #e2e8f0',
                        background:centroCustom===c.id?'#eef2ff':'white',
                      }}>
                        {c.nivel>0 && <span style={{color:'#94a3b8',marginRight:4}}>└</span>}
                        <strong style={{color:'#4f46e5'}}>{c.codigo}</strong>
                        <span style={{marginLeft:8}}>{c.nome}</span>
                        {c.descricao && <span style={{color:'#94a3b8',marginLeft:6,fontSize:9}}>{c.descricao}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Texto livre */}
            {centroTipo==='livre' && (
              <>
                <label className="acn-label">Descrição do Centro de Custo</label>
                <input className="acn-input" style={{width:'100%',marginBottom:10}}
                  value={centroLivre} onChange={e=>setCentroLivre(e.target.value)}
                  placeholder="Ex: Evento, Marketing, Infraestrutura..." />
              </>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#6366f1',flex:1}} onClick={salvarCentro} disabled={salvandoCentro}>
                {salvandoCentro?'Salvando...':'💾 Salvar Centro de Custo'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalCentro(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEPARTAMENTO */}
      {modalDepartamento && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalDepartamento(null);}}>
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">🏢 Departamento — {modalDepartamento.numero_pedido}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
              {modalDepartamento.descricao_material} · o gestor deste departamento será mencionado
              assim que a 1ª cotação for lançada.
            </div>

            <label className="acn-label">Departamento *</label>
            <select className="acn-input" style={{width:'100%',marginBottom:14}}
              value={departamentoSelecionado} onChange={e=>setDepartamentoSelecionado(e.target.value)}>
              <option value="">Selecione...</option>
              {departamentosConfig.map((d:any) => (
                <option key={d.id} value={d.id}>{d.nome} — {d.gestor_nome}</option>
              ))}
            </select>
            {departamentosConfig.length === 0 && (
              <div style={{fontSize:10,color:'#dc2626',marginBottom:14}}>
                Nenhum departamento cadastrado ainda. Cadastre em Admin → 🏢 Departamentos (Compras).
              </div>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={salvarDepartamento} disabled={salvandoDepartamento}>
                {salvandoDepartamento?'Salvando...':'💾 Salvar Departamento'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDepartamento(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR CENTROS DE CUSTO */}
      {modalGerCentros && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalGerCentros(false);}}>
          <div className="modal-box" style={{maxWidth:560,maxHeight:'85vh',overflowY:'auto'}}>
            <div className="modal-title">⚙️ Centros de Custo</div>
            <CentrosCustoManager embutido currentUser={currentUser} />
            <div style={{marginTop:14}}>
              <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>{setModalGerCentros(false);loadCentros();}}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBSERVAÇÕES */}
      {modalObs && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModalObs(null);setObsTexto('');}}}>
          <div className="modal-box" style={{maxWidth:500}}>
            <div className="modal-title">💬 Observações — {modalObs.numero_pedido}</div>
            <div style={{fontSize:10,color:'#6b7280',marginBottom:10}}>{modalObs.descricao_material}</div>
            {modalObs.observacoes_compra ? (
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:10,
                marginBottom:12,fontSize:10,whiteSpace:'pre-wrap',maxHeight:180,overflowY:'auto',lineHeight:1.8}}>
                <Linkify text={modalObs.observacoes_compra} />
              </div>
            ) : (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:12,fontStyle:'italic'}}>Sem observações anteriores.</div>
            )}
            <label className="acn-label">Nova observação</label>
            <MencaoTextarea value={obsTexto} rows={4} onChange={v=>setObsTexto(v)}
              placeholder="Ex: Fornecedor adiou entrega. Aguardando nova data... @Nome para mencionar"
              style={{marginBottom:12}} />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setModalObs(null);setObsTexto('');}}>Cancelar</button>
              <button className="acn-btn" style={{background:'#0891b2'}} onClick={salvarObs} disabled={salvandoObs}>
                {salvandoObs?'...':'💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRAZO PROMETIDO DE ENTREGA */}
      {modalPrazoProm && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalPrazoProm(null);}}>
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">🎯 Prazo Prometido de Entrega — {modalPrazoProm.numero_pedido}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:10}}>{modalPrazoProm.descricao_material}</div>
            <label className="acn-label">Data prometida *</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={prazoPromData} onChange={e=>setPrazoPromData(e.target.value)} />
            <label className="acn-label">Prometido para</label>
            <div style={{display:'flex',gap:0,marginBottom:14,borderRadius:6,overflow:'hidden',border:'1.5px solid #d1d5db'}}>
              {([['producao','🏭 Produção Interna'],['cliente','👤 Cliente Direto']] as const).map(([t,l])=>(
                <button key={t} onClick={()=>setPrazoPromDestino(t as any)} style={{
                  flex:1,padding:'7px 4px',border:'none',cursor:'pointer',fontSize:10,fontWeight:700,
                  background:prazoPromDestino===t?'#6366f1':'white',
                  color:prazoPromDestino===t?'white':'#475569',
                  borderRight:t==='producao'?'1px solid #d1d5db':'none',
                }}>{l}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#6366f1',flex:1}} onClick={salvarPrazoProm} disabled={salvandoPrazoProm}>
                {salvandoPrazoProm?'Salvando...':'💾 Salvar'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalPrazoProm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MESA DE COTAÇÕES */}
      {modalCotacoes && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalCotacoes(null);}}>
          <div className="modal-box" style={{maxWidth:640}}>
            <div className="modal-title">🏷️ Mesa de Cotações — {modalCotacoes.numero_pedido}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
              {modalCotacoes.descricao_material} · recomendado 3 cotações, mas pode aprovar com menos quando não houver 3 fornecedores disponíveis.
            </div>

            <div style={{marginBottom:14}}>
              <label className="acn-label">📅 Previsão de Recebimento *</label>
              <input type="date" className="acn-input" style={{width:'100%'}}
                value={inline[modalCotacoes.id]?.prazo || ''}
                onChange={e=>setInlineField(modalCotacoes.id,'prazo',e.target.value)} />
            </div>

            {aprovacoesPedido.length > 0 && (() => {
              const nivelAtivo = aprovacoesPedido.find(a => a.status === 'pendente');
              const isDepartamento = nivelAtivo?.tipo === 'departamento';
              const alcadaAtiva = (nivelAtivo && !isDepartamento) ? alcadasConfig.find(a => a.nivel === nivelAtivo.nivel) : null;
              const souAprovador = isDepartamento
                ? (String(currentUser?.id) === nivelAtivo.aprovador_id || currentUser?.perfil === 'Admin')
                : !!(alcadaAtiva && (alcadaAtiva.perfis_aprovadores||[]).includes(currentUser?.perfil));
              const historico = aprovacoesPedido.filter(a => a.status !== 'pendente');
              const todosAprovados = historico.length > 0 && historico.every(a => a.status === 'aprovado');
              return (
                <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8,padding:12,marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#9a3412',marginBottom:8}}>
                    🔒 Aprovação {nivelAtivo ? (isDepartamento ? `— Departamento: ${nivelAtivo.nivel_nome}` : `— Nível ${nivelAtivo.nivel}: ${nivelAtivo.nivel_nome}`) : todosAprovados ? 'concluída' : 'anterior (histórico)'}
                  </div>
                  {nivelAtivo ? (
                    souAprovador ? (
                      <div style={{display:'flex',gap:8}}>
                        <div style={{flex:1,fontSize:9,color:'#92400e',alignSelf:'center'}}>
                          Aprove clicando em "✅ Aprovar" na cotação vencedora, abaixo.
                        </div>
                        <button className="acn-btn" style={{background:'#ef4444'}} onClick={rejeitarNivelAtivo} disabled={respondendoAprovacao}>
                          ❌ Rejeitar
                        </button>
                      </div>
                    ) : (
                      <div style={{fontSize:10,color:'#92400e'}}>
                        Aguardando aprovação de: {isDepartamento ? (nivelAtivo.aprovador_nome || '—') : ((alcadaAtiva?.perfis_aprovadores||[]).join(', ') || '—')}
                      </div>
                    )
                  ) : todosAprovados ? (
                    <div style={{fontSize:10,color:'#16a34a',fontWeight:700}}>Todos os níveis aprovados.</div>
                  ) : (
                    <div style={{fontSize:10,color:'#78716c'}}>Nenhuma aprovação pendente no momento.</div>
                  )}
                  {historico.length > 0 && (
                    <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4}}>
                      {historico.map(a => (
                        <div key={a.id} style={{fontSize:9,color:'#78716c'}}>
                          {a.tipo==='departamento' ? `Departamento ${a.nivel_nome}` : `Nível ${a.nivel} (${a.nivel_nome})`}: {a.status==='aprovado'?'✅ Aprovado':a.status==='rejeitado'?'❌ Rejeitado':'Cancelado'}
                          {a.respondido_por_nome ? ` por ${a.respondido_por_nome}` : ''}
                          {a.resposta ? ` — "${a.resposta}"` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {loadingCotacoes ? (
              <div style={{textAlign:'center',padding:20,color:'#9ca3af',fontSize:11}}>Carregando...</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14,maxHeight:220,overflowY:'auto'}}>
                {cotacoes.length===0 && (
                  <div style={{textAlign:'center',color:'#9ca3af',fontSize:11,padding:14}}>Nenhuma cotação registrada ainda.</div>
                )}
                {cotacoes.map((c:any) => (
                  <div key={c.id} style={{
                    padding:'8px 10px',borderRadius:6,
                    border: vencedoraId===c.id ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                    background: vencedoraId===c.id ? '#f0fdf4' : '#fff',
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>
                          {c.fornecedor_nome}
                          {vencedoraId===c.id && <span style={{marginLeft:6,color:'#16a34a',fontSize:9,fontWeight:700}}>✓ VENCEDORA</span>}
                        </div>
                        <div style={{fontSize:9,color:'#64748b',marginTop:2}}>
                          {c.valor ? fmt(c.valor) : '—'}
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                          {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                        </div>
                        {c.anexo_url && (
                          <a href={c.anexo_url} target="_blank" rel="noreferrer" style={{fontSize:9,color:'#2563eb'}}>📎 {c.anexo_nome}</a>
                        )}
                      </div>
                      <button onClick={()=>excluirCotacao(c.id)} title="Remover"
                        style={{...btn,background:'#ef4444',padding:'2px 7px',fontSize:9}}>🗑️</button>
                    </div>
                    <CotacaoAreaLivre cotacao={c}
                      onSaved={(html:string)=>setCotacoes(prev=>prev.map(x=>x.id===c.id?{...x,area_livre:html}:x))} />
                    {!aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento') && (
                      <button className="acn-btn" style={{background:'#16a34a',width:'100%',marginTop:6}}
                        onClick={()=>aprovarCotacaoComoVencedora(c)}>
                        ✅ Aprovar esta cotação como vencedora
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Nova cotação — escondida enquanto há aprovação de ALÇADA pendente (a vencedora já foi
                travada). Uma pendência de DEPARTAMENTO não trava, pois ela nasce na 1ª cotação — o
                comprador ainda precisa poder lançar a 2ª e 3ª enquanto o gestor avalia em paralelo. */}
            {!aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento') ? (<>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>+ Nova Cotação de Fornecedor</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div>
                  <label className="acn-label">Fornecedor *</label>
                  <input className="acn-input" style={{width:'100%'}} value={novaCotacao.fornecedor_nome}
                    onChange={e=>setNovaCotacao(f=>({...f,fornecedor_nome:e.target.value}))} />
                </div>
                <div>
                  <label className="acn-label">Valor (R$) *</label>
                  <input className="acn-input" style={{width:'100%'}} value={novaCotacao.valor}
                    placeholder="Ex: 1.500,00"
                    onChange={e=>setNovaCotacao(f=>({...f,valor:e.target.value}))} />
                </div>
                <div>
                  <label className="acn-label">Condição de Pagamento</label>
                  <input className="acn-input" style={{width:'100%'}} value={novaCotacao.condicao_pagamento}
                    placeholder="Ex: 30/60 dias"
                    onChange={e=>setNovaCotacao(f=>({...f,condicao_pagamento:e.target.value}))} />
                </div>
                <div>
                  <label className="acn-label">Prazo de Entrega</label>
                  <input className="acn-input" style={{width:'100%'}} value={novaCotacao.prazo_entrega}
                    placeholder="Ex: 10 dias úteis"
                    onChange={e=>setNovaCotacao(f=>({...f,prazo_entrega:e.target.value}))} />
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <label className="acn-label">Anexo (PDF ou imagem)</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg"
                  onChange={e=>setNovoAnexoCotacao(e.target.files?.[0]||null)} />
              </div>
              <button className="acn-btn" style={{background:'#d97706',width:'100%'}} onClick={adicionarCotacao} disabled={enviandoCotacao}>
                {enviandoCotacao?'Enviando...':'+ Adicionar Cotação'}
              </button>
            </div>

            {cotacoes.length >= 1 && (
              <div style={{fontSize:9,color:'#64748b',marginBottom:10}}>
                Escreva na área livre de cada cotação e clique em "✅ Aprovar" na vencedora, acima.
              </div>
            )}

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalCotacoes(null)}>Fechar</button>
            </div>
            </>) : (
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalCotacoes(null)}>Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR SENHA — reconfirma identidade antes de aprovar uma cotação */}
      {modalConfirmarSenha && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalConfirmarSenha(null);}}>
          <div className="modal-box" style={{maxWidth:380}}>
            <div className="modal-title">🔒 Confirmar Aprovação</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>
              Confirme sua senha para aprovar <strong>{modalConfirmarSenha.fornecedor_nome}</strong> como
              cotação vencedora ({fmt(modalConfirmarSenha.valor)}).
            </div>
            <label className="acn-label">Sua senha</label>
            <input type="password" className="acn-input" style={{width:'100%',marginBottom:6}}
              value={senhaConfirmacao} onChange={e=>{setSenhaConfirmacao(e.target.value);setErroSenha('');}}
              onKeyDown={e=>e.key==='Enter'&&confirmarAprovacaoComSenha()}
              autoFocus placeholder="Mesma senha do login" />
            {erroSenha && <div style={{fontSize:10,color:'#dc2626',marginBottom:8}}>{erroSenha}</div>}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={confirmarAprovacaoComSenha} disabled={verificandoSenha}>
                {verificandoSenha?'Verificando...':'✅ Confirmar'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalConfirmarSenha(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACOMPANHAMENTO (timeline/chat) */}
      {modalAcomp && (
        <OplAcompModal
          referenciaId={modalAcomp.id}
          referenciaDesc={`Pedido ${modalAcomp.numero_pedido || ''}`}
          referenciaType="compra"
          setor="Compras"
          currentUser={currentUser}
          onClose={()=>setModalAcomp(null)}
        />
      )}
    </div>
  );
}

const th: React.CSSProperties = {padding:'8px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'};
const td: React.CSSProperties = {padding:'9px 10px',verticalAlign:'middle'};
const btn: React.CSSProperties = {padding:'5px 9px',border:'none',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'};
const kpi: React.CSSProperties = {background:'#f8fafc',border:'2px solid #e2e8f0',borderRadius:8,padding:'10px 6px',textAlign:'center' as const};
