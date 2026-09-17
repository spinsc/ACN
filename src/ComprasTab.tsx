// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import MencaoTextarea, { salvarMencoes, resolverMencoesRespondidas } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';
import Linkify from './Linkify';
import { CentrosCustoManager, ordenarArvore, labelHierarquico } from './CentroCustoShared';
import { logChange, useUnreadMap } from './AuditSystem';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { abrirVinculo, VinculoPicker, TIPO_LABEL } from './VinculoPicker';
import KanbanColuna from './KanbanColuna';
import { useCelular, SeletorEtapas, etapaInicial } from './Celular';
import { confirmar, pedirTexto } from './Feedback';
import { Botao, MenuAcoes, Selo } from './Interface';
import { mdiPencilOutline, mdiUndoVariant, mdiCloseCircleOutline, mdiRestore, mdiArrowRight } from '@mdi/js';
import { ModalReceberPedido } from './LogisticaTab';
import { ETAPAS_COMPRA, DESCARTADA, COR_ETAPA_COMPRA, ETAPA_ANTERIOR, PROXIMA_ETAPA, podeGerirCompras, ehSolicitante,
  podeEditarSolicitacao, registrarHistorico, mencionarSolicitante, ModalVoltarEtapa, ModalDescartar, ModalReativar,
  ModalIniciarCotacao, ModalConfirmarCompra, ModalEditarSolicitacao, AnexosCompra, HistoricoCompra } from './ComprasFluxo';

const VAZIO_COTACAO = {
  fornecedor_nome: '', valor_unitario: '', quantidade: '', condicao_pagamento: '', prazo_entrega: '',
  frete_tipo: 'gratis', frete_valor: '', servicos: [] as { descricao: string; valor: string }[], desconto_valor: '', outras_taxas: '',
};
// Mesmo parse pt-BR já usado em todo o arquivo pra campos de valor digitados
// (ex: "1.500,00" -> 1500.00) — separador de milhar "." e decimal ",".
const parseValorBr = (v: any) => parseFloat(String(v ?? '').replace(/\./g,'').replace(',','.')) || null;
const valorBrTexto = (n: any) => n == null || n === '' ? '' : String(Number(n).toFixed(2)).replace('.', ',');

// Composição do preço de um orçamento: itens (unitário × quantidade) + frete +
// serviços adicionais + outras taxas − desconto. O total é sempre calculado.
function totalComposicao(f: any) {
  const unit = parseValorBr(f.valor_unitario) || 0;
  const qtd = Number(String(f.quantidade ?? '').replace(',', '.')) || 0;
  const itens = unit * qtd;
  const frete = f.frete_tipo === 'pago' ? (parseValorBr(f.frete_valor) || 0) : 0;
  const servicos = (f.servicos || []).reduce((s: number, x: any) => s + (parseValorBr(x.valor) || 0), 0);
  const taxas = parseValorBr(f.outras_taxas) || 0;
  const desconto = parseValorBr(f.desconto_valor) || 0;
  return { itens, frete, servicos, taxas, desconto, total: Math.max(0, itens + frete + servicos + taxas - desconto) };
}

// Linha da cotação para o formulário (nova ou corrigir)
function formDaCotacao(c: any, qtdPedido: any) {
  const qtd = c.quantidade ?? qtdPedido ?? 1;
  const unit = c.valor_unitario ?? (c.valor != null && Number(qtd) ? Number(c.valor) / Number(qtd) : null);
  return {
    fornecedor_nome: c.fornecedor_nome || '', valor_unitario: valorBrTexto(unit), quantidade: String(qtd),
    condicao_pagamento: c.condicao_pagamento || '', prazo_entrega: c.prazo_entrega || '',
    frete_tipo: c.frete_tipo || 'gratis', frete_valor: valorBrTexto(c.frete_valor),
    servicos: Array.isArray(c.servicos) ? c.servicos.map((s: any) => ({ descricao: s.descricao || '', valor: valorBrTexto(s.valor) })) : [],
    desconto_valor: valorBrTexto(c.desconto_valor), outras_taxas: valorBrTexto(c.outras_taxas),
  };
}

function payloadDaCotacao(f: any) {
  const t = totalComposicao(f);
  return {
    fornecedor_nome: f.fornecedor_nome.trim(),
    valor_unitario: parseValorBr(f.valor_unitario),
    quantidade: Number(String(f.quantidade).replace(',', '.')) || null,
    valor: Number(t.total.toFixed(2)),
    condicao_pagamento: String(f.condicao_pagamento || '').trim() || null,
    prazo_entrega: String(f.prazo_entrega || '').trim() || null,
    frete_tipo: f.frete_tipo || 'gratis',
    frete_valor: f.frete_tipo === 'pago' ? parseValorBr(f.frete_valor) : null,
    servicos: (f.servicos || []).filter((s: any) => s.descricao.trim() || parseValorBr(s.valor))
      .map((s: any) => ({ descricao: s.descricao.trim(), valor: parseValorBr(s.valor) || 0 })),
    desconto_valor: parseValorBr(f.desconto_valor),
    outras_taxas: parseValorBr(f.outras_taxas),
  };
}

const moedaBr = (v: any) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(v) || 0);

function ComposicaoCotacao({ form, setForm }: any) {
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const t = totalComposicao(form);
  const servicos = form.servicos || [];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8 }}>
        <div>
          <label className="acn-label">Fornecedor *</label>
          <input className="acn-input" style={{width:'100%'}} value={form.fornecedor_nome} onChange={e=>set('fornecedor_nome', e.target.value)} />
        </div>
        <div>
          <label className="acn-label">Valor unitário (R$) *</label>
          <input className="acn-input" style={{width:'100%'}} value={form.valor_unitario} placeholder="Ex: 15,00" inputMode="decimal"
            onChange={e=>set('valor_unitario', e.target.value)} />
        </div>
        <div>
          <label className="acn-label">Quantidade *</label>
          <input className="acn-input" style={{width:'100%'}} value={form.quantidade} inputMode="decimal"
            onChange={e=>set('quantidade', e.target.value)} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div>
          <label className="acn-label">Frete</label>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <div className="acn-chips" role="group" aria-label="Frete">
              <button type="button" className={form.frete_tipo !== 'pago' ? 'on' : ''} aria-pressed={form.frete_tipo !== 'pago'} onClick={()=>set('frete_tipo','gratis')}>Grátis</button>
              <button type="button" className={form.frete_tipo === 'pago' ? 'on' : ''} aria-pressed={form.frete_tipo === 'pago'} onClick={()=>set('frete_tipo','pago')}>Pago</button>
            </div>
            {form.frete_tipo === 'pago' && (
              <input className="acn-input" style={{flex:1, minWidth:0}} value={form.frete_valor} placeholder="Valor do frete" inputMode="decimal"
                onChange={e=>set('frete_valor', e.target.value)} aria-label="Valor do frete" />
            )}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label className="acn-label">Outras taxas (R$)</label>
            <input className="acn-input" style={{width:'100%'}} value={form.outras_taxas} inputMode="decimal" onChange={e=>set('outras_taxas', e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Desconto (R$)</label>
            <input className="acn-input" style={{width:'100%'}} value={form.desconto_valor} inputMode="decimal" onChange={e=>set('desconto_valor', e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <label className="acn-label">Serviços adicionais</label>
        {servicos.map((s: any, i: number) => (
          <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}>
            <input className="acn-input" style={{flex:2, minWidth:0}} value={s.descricao} placeholder="Ex.: instalação, montagem, garantia estendida"
              onChange={e=>set('servicos', servicos.map((x: any, j: number) => j === i ? { ...x, descricao: e.target.value } : x))} aria-label="Descrição do serviço" />
            <input className="acn-input" style={{flex:1, minWidth:0}} value={s.valor} placeholder="Valor" inputMode="decimal"
              onChange={e=>set('servicos', servicos.map((x: any, j: number) => j === i ? { ...x, valor: e.target.value } : x))} aria-label="Valor do serviço" />
            <button type="button" className="acn-b acn-b-discreto acn-b-p" aria-label="Remover serviço"
              onClick={()=>set('servicos', servicos.filter((_: any, j: number) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="acn-b acn-b-secundario acn-b-p" onClick={()=>set('servicos', [...servicos, { descricao:'', valor:'' }])}>+ Serviço</button>
      </div>
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label className="acn-label">Condição de pagamento</label>
            <input className="acn-input" style={{width:'100%'}} value={form.condicao_pagamento} placeholder="Ex: 30/60 dias" onChange={e=>set('condicao_pagamento', e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Prazo de entrega</label>
            <input className="acn-input" style={{width:'100%'}} value={form.prazo_entrega} placeholder="Ex: 10 dias úteis" onChange={e=>set('prazo_entrega', e.target.value)} />
          </div>
        </div>
      </div>
      <div style={{ background:'var(--acn-surface)', border:'1px solid var(--acn-line)', borderRadius:8, padding:'8px 10px', fontSize:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}><span>Itens ({form.quantidade || 0} × {moedaBr(parseValorBr(form.valor_unitario))})</span><span className="acn-num">{moedaBr(t.itens)}</span></div>
        <div style={{ display:'flex', justifyContent:'space-between', color:'var(--acn-muted)' }}><span>Frete {form.frete_tipo === 'pago' ? '' : '(grátis)'}</span><span className="acn-num">{moedaBr(t.frete)}</span></div>
        {t.servicos > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'var(--acn-muted)' }}><span>Serviços adicionais</span><span className="acn-num">{moedaBr(t.servicos)}</span></div>}
        {t.taxas > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'var(--acn-muted)' }}><span>Outras taxas</span><span className="acn-num">{moedaBr(t.taxas)}</span></div>}
        {t.desconto > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'var(--acn-ok)' }}><span>Desconto</span><span className="acn-num">− {moedaBr(t.desconto)}</span></div>}
        <div style={{ display:'flex', justifyContent:'space-between', fontWeight:600, color:'var(--acn-ink)', borderTop:'1px solid var(--acn-line-soft)', marginTop:4, paddingTop:4 }}>
          <span>Total do orçamento</span><span className="acn-num">{moedaBr(t.total)}</span>
        </div>
      </div>
    </div>
  );
}

// Texto curto da composição (lista de cotações e resumo)
function textoComposicao(c: any) {
  const partes: string[] = [];
  if (c.valor_unitario != null && c.quantidade != null) partes.push(`${c.quantidade} × ${moedaBr(c.valor_unitario)}`);
  else if (c.valor_unitario != null) partes.push(`${moedaBr(c.valor_unitario)}/un.`);
  if (c.frete_tipo === 'pago') partes.push(`frete ${moedaBr(c.frete_valor)}`);
  else if (c.frete_tipo === 'gratis') partes.push('frete grátis');
  const serv = Array.isArray(c.servicos) ? c.servicos.reduce((s: number, x: any) => s + (Number(x.valor) || 0), 0) : 0;
  if (serv > 0) partes.push(`serviços ${moedaBr(serv)}`);
  if (Number(c.outras_taxas) > 0) partes.push(`taxas ${moedaBr(c.outras_taxas)}`);
  if (Number(c.desconto_valor) > 0) partes.push(`desconto ${moedaBr(c.desconto_valor)}`);
  return partes.join(' · ');
}

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
      <h2>Solicitação de Compra</h2>
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
      <h2>Ordem de Compra — <span class="badge">${p.numero_oc}</span></h2>
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
        <button onMouseDown={async e => {
          e.preventDefault();
          const url = await pedirTexto('URL do link:');
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

// ─── STATUS (colunas do Kanban e ordem do fluxo) ───────────────────────────────
const STATUS_COMPRAS = [...ETAPAS_COMPRA, DESCARTADA];
const COR_STATUS_COMPRA: Record<string,string> = COR_ETAPA_COMPRA;

// ─── DESCRIÇÃO COMPACTA ───────────────────────────────────────────────────────
// A descrição da compra ocupava a linha inteira (e o card do kanban) quando o
// pedido vinha com especificação longa. Mostra 2 linhas e "ver mais"; o texto
// completo também está no Resumo.
function DescricaoCompacta({ texto, linhas = 2 }: { texto: string; linhas?: number }) {
  const [aberta, setAberta] = useState(false);
  const t = String(texto || '').trim();
  if (!t) return <span style={{ color:'#9ca3af' }}>—</span>;
  const longa = t.length > 70 || t.includes('\n');
  return (
    <span style={{ display:'block' }} title={longa && !aberta ? t : undefined}>
      <span style={aberta || !longa ? { display:'block', whiteSpace:'pre-wrap', wordBreak:'break-word' } : {
        display:'-webkit-box', WebkitLineClamp: linhas, WebkitBoxOrient:'vertical', overflow:'hidden', wordBreak:'break-word' }}>
        {t}
      </span>
      {longa && (
        <button type="button" onClick={e => { e.stopPropagation(); setAberta(a => !a); }}
          style={{ background:'none', border:'none', padding:0, color:'#2563eb', fontSize:9, fontWeight:700, cursor:'pointer' }}>
          {aberta ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </span>
  );
}

// ─── VÍNCULO / LINK na requisição ──────────────────────────────────────────────
function VinculoLinkCompra({ p, compacto = false }: { p: any; compacto?: boolean }) {
  if (!p?.vinculo_tipo && !p?.link_url) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1, marginTop: compacto ? 2 : 3 }}>
      {p.vinculo_tipo && (
        <button type="button" onClick={e => { e.stopPropagation(); abrirVinculo({ tipo: p.vinculo_tipo, id: p.vinculo_id, descricao: p.vinculo_descricao }); }}
          title="Abrir registro vinculado"
          style={{ background:'none', border:'none', padding:0, color:'#0369a1', fontSize:9, fontWeight:700, cursor:'pointer', textAlign:'left', textDecoration:'underline' }}>
          🔗 {TIPO_LABEL[p.vinculo_tipo] || p.vinculo_tipo}: {p.vinculo_descricao}
        </button>
      )}
      {p.link_url && (
        <a href={p.link_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          style={{ color:'#0f766e', fontSize:9, fontWeight:700, wordBreak:'break-all' }}>🌐 link</a>
      )}
    </div>
  );
}

function ModalVinculoCompra({ pedido, onClose, onSalvo }) {
  const [vinculo, setVinculo] = useState(pedido.vinculo_tipo ? { tipo: pedido.vinculo_tipo, id: pedido.vinculo_id, descricao: pedido.vinculo_descricao } : null);
  const [link, setLink] = useState(pedido.link_url || '');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) { alert('O link precisa começar com http:// ou https://'); return; }
    if (vinculo?.tipo === 'compra' && String(vinculo.id) === String(pedido.id)) { alert('Não dá para vincular a requisição a ela mesma.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      vinculo_tipo: vinculo?.tipo || null, vinculo_id: vinculo?.id || null, vinculo_descricao: vinculo?.descricao || null, link_url: l || null,
    }).eq('id', pedido.id);
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSalvo();
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:480 }}>
        <div className="modal-title">🔗 Vínculo e link — {pedido.numero_pedido}</div>
        <div style={{ fontSize:10, color:'#64748b', marginBottom:10 }}><DescricaoCompacta texto={pedido.descricao_material} /></div>
        <label className="acn-label">Vincular a um PV, OP, OS, outra compra ou OFI</label>
        <div style={{ marginBottom:12 }}>
          <VinculoPicker value={vinculo} onSelect={setVinculo} onClear={() => setVinculo(null)} />
        </div>
        <label className="acn-label">Link (opcional)</label>
        <input className="acn-input" style={{ width:'100%', marginBottom:14 }} placeholder="https://..."
          value={link} onChange={e => setLink(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#0369a1', flex:1 }} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : '💾 Salvar'}</button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── RESUMO DA SOLICITAÇÃO ─────────────────────────────────────────────────────
function ResumoCompraModal({ pedido: p, canVerValor, departamentos, onClose, currentUser }) {
  const [cotacoes, setCotacoes] = useState<any[] | null>(null);
  const [aprovacoes, setAprovacoes] = useState<any[]>([]);
  const [acomp, setAcomp] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('pcp_cotacoes_fornecedores').select('*').eq('pedido_id', p.id).order('criado_em', { ascending: true })
      .then(({ data }) => setCotacoes(data || []));
    supabase.from('pcp_aprovacoes').select('*').eq('pedido_id', p.id).order('nivel', { ascending: true })
      .then(({ data }) => setAprovacoes(data || []));
    supabase.from('op_acompanhamentos').select('*').eq('referencia_id', String(p.id)).order('criado_em', { ascending: false }).limit(20)
      .then(({ data }) => setAcomp(data || []));
  }, [p.id]);
  const moeda = (v: any) => v != null && v !== '' ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(v)) : '—';
  const data = (d: any) => d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR') : '—';
  const dep = (departamentos || []).find((d: any) => d.id === p.departamento_id);
  const Linha = ({ k, v }) => (v === null || v === undefined || v === '' ? null : (
    <div style={{ display:'grid', gridTemplateColumns:'150px 1fr', gap:8, padding:'4px 0', borderBottom:'1px solid #f1f5f9', fontSize:11 }}>
      <span style={{ color:'#64748b', fontWeight:700, fontSize:10 }}>{k}</span><span style={{ color:'#1e293b', wordBreak:'break-word' }}>{v}</span>
    </div>
  ));
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:680, width:'95vw', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1a3a52' }}>🔍 Resumo — {p.numero_pedido}</div>
            <span style={{ padding:'2px 9px', borderRadius:4, color:'#fff', fontSize:10, fontWeight:700, background: COR_STATUS_COMPRA[p.status_compra] || '#9ca3af' }}>{p.status_compra || '—'}</span>
            {p.numero_oc && <span style={{ marginLeft:8, fontSize:10, fontWeight:700, color:'#7c3aed' }}>📋 {p.numero_oc}</span>}
          </div>
          <button className="acn-btn" style={{ background:'#475569' }} onClick={() => imprimirSolicitacao(p)}>🖨️ Imprimir</button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Fechar</button>
        </div>
        <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'8px 0 4px' }}>Solicitação</div>
        <div style={{ fontSize:12, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 10px', whiteSpace:'pre-wrap', wordBreak:'break-word', marginBottom:6 }}>
          {p.descricao_material || '—'}
        </div>
        <Linha k="Quantidade" v={p.quantidade} />
        <Linha k="OP" v={p.opl} />
        <Linha k="Vínculo" v={p.vinculo_tipo ? `${TIPO_LABEL[p.vinculo_tipo] || p.vinculo_tipo}: ${p.vinculo_descricao || ''}` : null} />
        <Linha k="Link" v={p.link_url ? <a href={p.link_url} target="_blank" rel="noreferrer">{p.link_url}</a> : null} />
        <Linha k="Fornecedor" v={p.fornecedor} />
        {canVerValor && <Linha k="Valor da compra" v={p.valor_compra ? moeda(p.valor_compra) : null} />}
        <Linha k="Centro de custo" v={p.centro_custo} />
        <Linha k="Departamento" v={dep?.nome} />
        <Linha k="Prev. recebimento" v={p.data_prevista_recebimento ? data(p.data_prevista_recebimento) : null} />
        <Linha k="Prazo prometido" v={p.prazo_prometido_entrega ? `${data(p.prazo_prometido_entrega)} (${p.prazo_prometido_destino === 'cliente' ? 'cliente' : 'produção'})` : null} />
        <Linha k="NF" v={p.numero_nf} />
        <Linha k="Solicitado por" v={[p.criado_por_nome || p.criado_por, p.data_criacao ? data(p.data_criacao) : null].filter(Boolean).join(' · ')} />
        <Linha k="Comprador" v={p.comprador_nome} />
        <Linha k="Reprocessos" v={p.reprocessos > 0 ? `${p.reprocessos} (ver histórico)` : null} />
        <Linha k="Descarte" v={p.status_compra === 'Descartada' ? `${p.motivo_descarte || '—'}${p.descartado_por_nome ? ` — ${p.descartado_por_nome}` : ''}` : null} />
        {p.observacoes_compra && (
          <>
            <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'10px 0 4px' }}>Observações</div>
            <div style={{ fontSize:11, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#334155' }}><Linkify text={p.observacoes_compra} /></div>
          </>
        )}
        <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'12px 0 4px' }}>Cotações de fornecedores</div>
        {cotacoes === null ? <div style={{ fontSize:10, color:'#94a3b8' }}>Carregando...</div> : cotacoes.length === 0 ? (
          <div style={{ fontSize:10, color:'#94a3b8' }}>Nenhuma cotação lançada.</div>
        ) : cotacoes.map((c: any) => (
          <div key={c.id} style={{ display:'flex', gap:8, alignItems:'center', fontSize:11, padding:'4px 6px', borderBottom:'1px solid #f1f5f9',
            background: c.id === p.vencedora_id ? '#f0fdf4' : undefined }}>
            <span style={{ flex:1, fontWeight: c.id === p.vencedora_id ? 800 : 600 }}>{c.id === p.vencedora_id ? '🏆 ' : ''}{c.fornecedor_nome}</span>
            {canVerValor && <span style={{ color:'#64748b', fontSize:10 }}>{textoComposicao(c)}</span>}
            {canVerValor && <span>{moeda(c.valor)}</span>}
            {c.prazo_entrega && <span style={{ color:'#64748b', fontSize:10 }}>prazo {c.prazo_entrega}</span>}
            {c.arquivo_url && <a href={c.arquivo_url} target="_blank" rel="noreferrer" style={{ fontSize:10 }}>📎</a>}
          </div>
        ))}
        {aprovacoes.length > 0 && (
          <>
            <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'12px 0 4px' }}>Aprovações</div>
            {aprovacoes.map((a: any) => (
              <div key={a.id} style={{ fontSize:11, padding:'3px 6px', borderBottom:'1px solid #f1f5f9' }}>
                {a.status === 'aprovado' ? '✅' : a.status === 'reprovado' ? '❌' : '⏳'} {a.nivel_nome || `Nível ${a.nivel}`}
                <span style={{ color:'#64748b', fontSize:10 }}> · {a.status}{a.respondido_por_nome ? ` por ${a.respondido_por_nome}` : ''}</span>
              </div>
            ))}
          </>
        )}
        <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'12px 0 4px' }}>Anexos</div>
        <AnexosCompra pedido={p} currentUser={currentUser} podeEditar={podeEditarSolicitacao(p, currentUser)} />
        <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'12px 0 4px' }}>Histórico da requisição</div>
        <HistoricoCompra pedidoId={p.id} />
        {acomp.length > 0 && (
          <>
            <div style={{ fontSize:10, fontWeight:800, color:'#475569', textTransform:'uppercase', margin:'12px 0 4px' }}>Acompanhamento (últimos)</div>
            {acomp.map((a: any) => (
              <div key={a.id} style={{ fontSize:11, padding:'4px 6px', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ color:'#94a3b8', fontSize:9 }}>{a.criado_em ? new Date(a.criado_em).toLocaleString('pt-BR') : ''} · {a.usuario_nome}</span>
                <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}><Linkify text={a.texto} /></div>
              </div>
            ))}
          </>
        )}
      </div>
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
  // Corrigir uma cotação já lançada (Admin) — id da cotação em edição + form
  const [editandoCotacaoId, setEditandoCotacaoId] = useState<string|null>(null);
  const [editCotacaoForm, setEditCotacaoForm]     = useState<any>({});
  const [salvandoEdicaoCotacao, setSalvandoEdicaoCotacao] = useState(false);
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
  // Resumo da solicitação e vínculo/link
  const [modalResumo, setModalResumo]           = useState<any>(null);
  const [modalVinculo, setModalVinculo]         = useState<any>(null);
  // Tabela x Kanban (por status) — lembra a escolha neste navegador
  const [visao, setVisaoState] = useState<'tabela'|'kanban'>(() => {
    try { return localStorage.getItem('acn:compras-visao') === 'kanban' ? 'kanban' : 'tabela'; } catch { return 'tabela'; }
  });
  const setVisao = (v: 'tabela'|'kanban') => { setVisaoState(v); try { localStorage.setItem('acn:compras-visao', v); } catch {} };
  // Celular: kanban mostra um status por vez
  const celular = useCelular();
  const [etapaCel, setEtapaCel] = useState<string | null>(null);

  // Fluxo: voltar etapa (reprocesso), descartar, reativar, iniciar, confirmar compra, editar, receber
  const [modalFluxo, setModalFluxo] = useState<{ tipo: string; pedido: any } | null>(null);
  const abrirFluxo = (tipo: string, pedido: any) => setModalFluxo({ tipo, pedido });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);

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
    ...COR_ETAPA_COMPRA, 'Pendente':'#fbbf24',
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

  // Pendente → Em Andamento: pede o comprador responsável (ModalIniciarCotacao)
  const avancarStatus = (p: any) => abrirFluxo('iniciar', p);

  // Mover uma requisição (arrastar no kanban, "Mover para…" no toque ou menu):
  // avançar abre a janela com o que a etapa exige; voltar é reprocesso com motivo.
  const moverPara = (p: any, destino: string) => {
    const atual = p.status_compra;
    if (!destino || destino === atual) return;
    const gestor = podeGerirCompras(currentUser);
    if (destino === DESCARTADA) {
      if (atual === 'Concluído') { alert('Uma compra concluída não pode ser descartada.'); return; }
      if (!gestor && !ehSolicitante(p, currentUser)) { alert('Só Compras, gerentes, administradores ou quem solicitou podem descartar.'); return; }
      abrirFluxo('descartar', p); return;
    }
    if (atual === DESCARTADA) {
      if (!gestor) { alert('Só Compras, gerentes ou administradores podem reativar uma requisição.'); return; }
      abrirFluxo('reativar', p); return;
    }
    const iA = ETAPAS_COMPRA.indexOf(atual), iD = ETAPAS_COMPRA.indexOf(destino);
    if (iD < iA) {
      if (!gestor) { alert('Só Compras, gerentes ou administradores podem voltar a etapa.'); return; }
      if (ETAPA_ANTERIOR[atual] !== destino) { alert(`Volte uma etapa por vez: de "${atual}" a etapa anterior é "${ETAPA_ANTERIOR[atual]}".`); return; }
      abrirFluxo('voltar', p); return;
    }
    // avançar
    if (atual === 'Pendente' && destino === 'Em Andamento') {
      if (!gestor) { alert('Só Compras, gerentes ou administradores iniciam a cotação.'); return; }
      abrirFluxo('iniciar', p); return;
    }
    if ((atual === 'Em Andamento' && ['Aguardando Aprovação', 'Aprovado'].includes(destino)) || (atual === 'Aguardando Aprovação' && destino === 'Aprovado')) {
      abrirModalCotacoes(p);
      mostrarDica(atual === 'Em Andamento'
        ? 'Para avançar, lance as cotações e aprove a vencedora (com a previsão de recebimento). Se houver alçada, ela vai para Aguardando Aprovação.'
        : 'Para aprovar, o aprovador clica em "Aprovar" na cotação vencedora.');
      return;
    }
    if (atual === 'Aprovado' && destino === 'Comprado') {
      if (!gestor) { alert('Só Compras, gerentes ou administradores confirmam a compra.'); return; }
      abrirFluxo('confirmar', p); return;
    }
    if (atual === 'Comprado' && destino === 'Concluído') {
      if (!gestor && currentUser?.perfil !== 'Almoxarifado') { alert('O recebimento é registrado por Compras, Almoxarifado, gerentes ou administradores.'); return; }
      abrirFluxo('receber', p); return;
    }
    alert(`Avance uma etapa por vez: depois de "${atual}" vem "${PROXIMA_ETAPA[atual] || '—'}".`);
  };
  const mostrarDica = (t: string) => alert(t);

  // ── Mesa de Cotações ──────────────────────────────────────────────────────
  // Removido de propósito: existia um atalho manual "✅ Concluir" que fechava
  // a compra direto (valor + prazo digitados na linha), sem passar pelas 3
  // cotações mínimas nem pela aprovação por departamento/alçada — driblava
  // o controle inteiro desta feature. A Mesa de Cotações (abrirModalCotacoes)
  // é agora o único caminho de Em Andamento → Comprado.
  const abrirModalCotacoes = async (p: any) => {
    setModalCotacoes(p);
    setNovaCotacao({ ...VAZIO_COTACAO, quantidade: String(p.quantidade || 1) });
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
    if (!novaCotacao.fornecedor_nome.trim() || !parseValorBr(novaCotacao.valor_unitario) || !(Number(String(novaCotacao.quantidade).replace(',', '.')) > 0)) {
      alert('Informe o fornecedor, o valor unitário e a quantidade.'); return;
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
      ...payloadDaCotacao(novaCotacao),
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
    setNovaCotacao({ ...VAZIO_COTACAO, quantidade: String(modalCotacoes.quantidade || 1) });
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
    // A vencedora, uma vez que a compra já foi Aprovada/Comprada, não pode
    // simplesmente sumir — se o valor dela estava errado, o caminho é
    // corrigir (✏️ Editar), não excluir (perderia o registro/rastreio).
    if (id === vencedoraId && ['Aprovado','Comprado'].includes(modalCotacoes?.status_compra)) {
      alert('Esta é a cotação vencedora de uma compra já aprovada/comprada — use "Editar" para corrigir o valor em vez de excluir.');
      return;
    }
    if (!await confirmar('Remover esta cotação?')) return;
    await supabase.from('pcp_cotacoes_fornecedores').delete().eq('id', id);
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalCotacoes(modalCotacoes);
  };

  const iniciarEdicaoCotacao = (c: any) => {
    setEditandoCotacaoId(c.id);
    setEditCotacaoForm(formDaCotacao(c, modalCotacoes?.quantidade));
  };

  // Corrige uma cotação já lançada (Admin). Se for a vencedora do pedido,
  // propaga o novo total pra pcp_pedidos_compra.valor_compra — é esse o
  // campo que Centro de Custo/Financeiro de fato leem, então é aqui que o
  // erro "entrou errado no centro de custo" se corrige de verdade.
  const salvarEdicaoCotacao = async (c: any) => {
    if (!editCotacaoForm.fornecedor_nome?.trim() || !parseValorBr(editCotacaoForm.valor_unitario) || !(Number(String(editCotacaoForm.quantidade).replace(',', '.')) > 0)) {
      alert('Informe o fornecedor, o valor unitário e a quantidade.'); return;
    }
    setSalvandoEdicaoCotacao(true);
    const payload: any = { ...payloadDaCotacao(editCotacaoForm), atualizado_em: new Date().toISOString(), atualizado_por_nome: currentUser?.nome || null };
    const novoValorTotal = payload.valor;
    const { error } = await supabase.from('pcp_cotacoes_fornecedores').update(payload).eq('id', c.id);
    if (error) { setSalvandoEdicaoCotacao(false); alert('Erro ao salvar correção: ' + error.message); return; }
    logChange({ module: 'compras', entityType: 'pcp_cotacoes_fornecedores', entityId: c.id, changeType: 'UPDATE',
      oldRow: { fornecedor_nome: c.fornecedor_nome, valor_unitario: c.valor_unitario, valor: c.valor },
      newRow: payload, user: currentUser });
    if (c.id === vencedoraId && novoValorTotal != null && novoValorTotal !== c.valor) {
      await supabase.from('pcp_pedidos_compra').update({ valor_compra: novoValorTotal }).eq('id', modalCotacoes.id);
      logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: modalCotacoes.id, changeType: 'UPDATE',
        oldRow: { valor_compra: c.valor }, newRow: { valor_compra: novoValorTotal }, user: currentUser });
    }
    setSalvandoEdicaoCotacao(false);
    setEditandoCotacaoId(null);
    await abrirModalCotacoes(modalCotacoes);
    setFiltro(''); load();
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
  // (alçada disparada pelo valor) ou se pode ir direto pra 'Aprovado' (aguardando
  // a confirmação real da compra, ver confirmarCompra) como antes.
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
        .update({ ...extraUpdates, status_compra: 'Aprovado' }).eq('id', pedidoId);
      if (!error) await registrarHistorico(pedidoId, { tipo: 'avanco', de: 'Em Andamento', para: 'Aprovado',
        motivo: `Vencedora: ${extraUpdates.fornecedor || '—'} (${fmt(extraUpdates.valor_compra)})` }, currentUser);
      return { error };
    }
    const { data: pedidoAtual } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', pedidoId).maybeSingle();
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ ...extraUpdates, status_compra: 'Aguardando Aprovação' }).eq('id', pedidoId);
    if (error) return { error };
    await registrarHistorico(pedidoId, { tipo: 'avanco', de: pedidoAtual?.status_compra || 'Em Andamento', para: 'Aguardando Aprovação',
      motivo: `Vencedora: ${extraUpdates.fornecedor || '—'} (${fmt(extraUpdates.valor_compra)})` }, currentUser);
    if (pedidoAtual) await mencionarSolicitante(pedidoAtual,
      `Sua requisição ${pedidoAtual.numero_pedido} (${String(pedidoAtual.descricao_material || '').slice(0, 80)}) está aguardando aprovação — vencedora: ${extraUpdates.fornecedor || '—'}, ${fmt(extraUpdates.valor_compra)}.`,
      currentUser, 'aguardando_aprovacao');
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
      // Só marca como Aprovado se já existe cotação vencedora escolhida — aprovar
      // cedo a linha de departamento (antes do comprador confirmar a compra) não
      // deve sozinho fechar o pedido. A compra em si só fecha em confirmarCompra,
      // numa ação separada e explícita.
      const { data: pedidoAtual } = await supabase.from('pcp_pedidos_compra')
        .select('vencedora_id').eq('id', pedido.id).maybeSingle();
      if (pedidoAtual?.vencedora_id) {
        await supabase.from('pcp_pedidos_compra').update({ status_compra: 'Aprovado' }).eq('id', pedido.id);
        await registrarHistorico(pedido.id, { tipo: 'avanco', de: 'Aguardando Aprovação', para: 'Aprovado', motivo: 'Aprovações concluídas.' }, currentUser);
        await notificarCriadorPedido(pedido, `Compra aprovada — aguardando confirmação de compra — pedido ${pedido.numero_pedido}.`);
      }
    }
  };

  // Ação explícita e separada da aprovação: só aqui a compra de fato "fecha"
  // (status_compra='Comprado'), gera número de OC (trigger) e cria a demanda de
  // acompanhamento — antes disso, o pedido fica em 'Aprovado' esperando essa
  // confirmação, mesmo que quem aprovou também tenha alçada pra isso.
  const confirmarCompra = async (pedido: any, prazo?: string) => {
    const upd: any = { status_compra: 'Comprado' };
    if (prazo) upd.data_prevista_recebimento = prazo;
    const { error } = await supabase.from('pcp_pedidos_compra').update(upd).eq('id', pedido.id);
    if (error) { alert('Erro ao confirmar compra: ' + error.message); return false; }
    logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: pedido.id, changeType: 'UPDATE',
      oldRow: { status_compra: 'Aprovado' }, newRow: upd, user: currentUser });
    await registrarHistorico(pedido.id, { tipo: 'avanco', de: 'Aprovado', para: 'Comprado',
      motivo: prazo ? `Prazo de entrega: ${new Date(prazo + 'T12:00:00').toLocaleDateString('pt-BR')}` : null }, currentUser);
    await criarDemandaComprasFinalizada(pedido.id);
    await notificarCriadorPedido(pedido, `Compra confirmada — pedido ${pedido.numero_pedido}.`);
    setFiltro('');
    load();
    return true;
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
    const motivo = await pedirTexto('Não aprovar e devolver para refazer a cotação.\nMotivo:');
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
      reprocessos: (Number(modalCotacoes.reprocessos) || 0) + 1,
    }).eq('id', modalCotacoes.id);
    await registrarHistorico(modalCotacoes.id, { tipo: 'retorno', de: 'Aguardando Aprovação', para: 'Em Andamento', motivo: `Não aprovado — ${motivo.trim()}`,
      dados: { refazer: 'Rever as cotações e reenviar para aprovação', nivel: nivelAtivo.nivel_nome, reprocesso: (Number(modalCotacoes.reprocessos) || 0) + 1 } }, currentUser);
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

  const itensMenuFluxo = (p: any) => {
    const gestor = podeGerirCompras(currentUser);
    const st = p.status_compra;
    return [
      { rotulo: 'Editar solicitação', icone: mdiPencilOutline, onClick: () => abrirFluxo('editar', p), oculto: !podeEditarSolicitacao(p, currentUser) },
      { rotulo: `Avançar para ${PROXIMA_ETAPA[st] === 'Aprovado' && st === 'Em Andamento' ? 'aprovação' : PROXIMA_ETAPA[st] || ''}`, icone: mdiArrowRight,
        onClick: () => moverPara(p, PROXIMA_ETAPA[st]), oculto: !PROXIMA_ETAPA[st] || !(gestor || (st === 'Comprado' && currentUser?.perfil === 'Almoxarifado')) },
      { rotulo: `Voltar para ${ETAPA_ANTERIOR[st] || ''} (reprocesso)`, icone: mdiUndoVariant, onClick: () => moverPara(p, ETAPA_ANTERIOR[st]), oculto: !ETAPA_ANTERIOR[st] || !gestor },
      { rotulo: 'Reativar', icone: mdiRestore, onClick: () => moverPara(p, 'Pendente'), oculto: st !== DESCARTADA || !gestor },
      { rotulo: 'Descartar', icone: mdiCloseCircleOutline, onClick: () => moverPara(p, DESCARTADA), perigo: true,
        oculto: st === DESCARTADA || st === 'Concluído' || !(gestor || ehSolicitante(p, currentUser)) },
    ];
  };

  const total = pedidos.length;
  const kpis = [...ETAPAS_COMPRA, DESCARTADA].map(s => ({
    label: s, n: pedidos.filter(p=>p.status_compra===s).length, cor: COR[s],
  }));

  // Concluídos ficam agrupados/colapsados no fim da lista, pendentes e em
  // andamento sempre no topo — só quando a visão é "Todos os status"; um
  // filtro de status específico (ex: só "Concluído") continua mostrando
  // exatamente o que foi filtrado, sem o agrupamento.
  const agruparPorStatus  = filtro === '';
  const pedidosAtivos     = agruparPorStatus ? pedidos.filter((p:any) => !['Concluído', DESCARTADA].includes(p.status_compra)) : pedidos;
  const pedidosConcluidos = agruparPorStatus ? pedidos.filter((p:any) => ['Concluído', DESCARTADA].includes(p.status_compra)) : [];

  const renderPedidoRow = (p: any) => {
    const row   = inline[p.id] || {valor:'',prazo:'',salvando:false};
    const isEM  = p.status_compra === 'Em Andamento';
    const isAguardandoAprovacao = p.status_compra === 'Aguardando Aprovação';
    const isAprovado = p.status_compra === 'Aprovado';
    const naoLido = pedidosNaoLidos.has(String(p.id));
    return (
      <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9',
        background: naoLido ? '#fffdf0' : isEM ? '#f0fdf4' : isAguardandoAprovacao ? '#fff7ed' : isAprovado ? '#f0f9ff' : undefined,
        borderLeft: naoLido ? '4px solid #eab308' : undefined}}>
        <td style={td}><strong>{p.numero_pedido}</strong></td>
        <td style={td}>
          {p.opl ? (
            <button onClick={async () => {
              const { data } = await supabase.from('oples').select('id').eq('opl', p.opl).maybeSingle();
              if (!data) { alert(`OP ${p.opl} não encontrada no cadastro.`); return; }
              abrirVinculo({ tipo:'op', id: data.id, descricao: p.opl });
            }} style={{ background:'none', border:'none', padding:0, color:'#2563eb', fontWeight:700, cursor:'pointer', textDecoration:'underline', font:'inherit' }}>
              {p.opl}
            </button>
          ) : '—'}
          {p.oportunidade_id && (
            <div>
              <button onClick={()=>abrirVinculo({ tipo:'pv', id:p.oportunidade_id, descricao:p.numero_pedido })}
                style={{ background:'none', border:'none', padding:0, color:'#7c3aed', fontSize:9, fontWeight:700, cursor:'pointer', textDecoration:'underline', whiteSpace:'nowrap' }}>
                🔗 Proposta
              </button>
            </div>
          )}
          <VinculoLinkCompra p={p} />
        </td>
        <td style={{...td,minWidth:200,maxWidth:300}}>
          <DescricaoCompacta texto={p.descricao_material} />
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
          {p.reprocessos > 0 && <div style={{marginTop:4}}><Selo familia="atencao" ponto={false} title="Voltou de etapa — veja o motivo no Resumo">Reprocesso nº {p.reprocessos}</Selo></div>}
          {p.status_compra === DESCARTADA && p.motivo_descarte && <div style={{marginTop:4,fontSize:10,color:'#64748b',maxWidth:180}} title={p.motivo_descarte}>{String(p.motivo_descarte).slice(0,60)}</div>}
          {p.numero_oc && (
            <div style={{marginTop:4}}>
              <span style={{fontSize:9,fontWeight:700,color:'#7c3aed',fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace"}} title="Ordem de Compra">
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

          {/* 🛒 Aprovado → Comprado — ação explícita e separada da aprovação */}
          {isAprovado && (
            <button onClick={()=>abrirFluxo('confirmar', p)} style={{...btn,background:'#0ea5e9',marginRight:3}}>
              🛒 Confirmar Compra
            </button>
          )}

          {/* 🔍 Ver/Corrigir Cotações — depois de Aprovado/Comprado, o botão normal de
              Cotações some (é pra quando ainda se está decidindo); esse reabre a mesma
              Mesa de Cotações em modo consulta/correção (edição só Admin, ver excluirCotacao). */}
          {['Aprovado','Comprado'].includes(p.status_compra) && (
            <button onClick={()=>abrirModalCotacoes(p)} title="Ver cotações e corrigir valores se necessário"
              style={{...btn,background:'#6366f1',marginRight:3}}>
              🔍 Ver/Corrigir Cotações
            </button>
          )}

          {/* 📦 Comprado → Concluído — só via conferência técnica na Logística (Fase 3) */}
          {p.status_compra==='Comprado' && (
            <span title="Registre o recebimento (seriais/volume/NF conferida) na aba Logística pra fechar"
              style={{fontSize:9,color:'#78716c',marginRight:6,fontStyle:'italic'}}>
              📦 Aguarda recebimento na Logística
            </span>
          )}

          {/* 🔍 Resumo da solicitação */}
          <button onClick={()=>setModalResumo(p)} title="Resumo da solicitação"
            style={{...btn,background:'#0f766e',marginRight:3}}>
            🔍 Resumo
          </button>

          {/* 🔗 Vínculo (PV/OP/OS/compra/OFI) e link */}
          <button onClick={()=>setModalVinculo(p)} title={p.vinculo_tipo || p.link_url ? 'Editar vínculo/link' : 'Vincular a PV, OP, OS, outra compra ou OFI / adicionar link'}
            style={{...btn,background:(p.vinculo_tipo || p.link_url)?'#0369a1':'#94a3b8',marginRight:3}}>
            🔗
          </button>

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
          <span style={{ display:'inline-block', verticalAlign:'middle', marginLeft:3 }}><MenuAcoes itens={itensMenuFluxo(p)} rotulo="Etapa, edição e descarte" /></span>

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
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{ display:'flex', border:'1px solid #cbd5e1', borderRadius:6, overflow:'hidden' }}>
          {([['tabela','☰ Tabela'],['kanban','▦ Kanban']] as const).map(([v,l]) => (
            <button key={v} onClick={()=>setVisao(v)}
              style={{ fontSize:10, fontWeight:800, padding:'5px 12px', cursor:'pointer', border:'none',
                background: visao===v ? '#1e293b' : '#fff', color: visao===v ? '#fff' : '#64748b' }}>
              {l}
            </button>
          ))}
        </div>
        <select value={filtro} onChange={e=>setFiltro(e.target.value)}
          style={{padding:'5px 10px',border:'1px solid #d1d5db',borderRadius:6,fontSize:11}}>
          <option value="">Todos os status</option>
          {[...ETAPAS_COMPRA, DESCARTADA].map(s=><option key={s}>{s}</option>)}
        </select>
        </div>
      </div>

      {queryError && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'10px 14px',marginBottom:12,fontSize:11,color:'#dc2626'}}>
          ⚠️ Erro ao carregar dados: <strong>{queryError}</strong>
        </div>
      )}

      {!loading && pedidos.length > 0 && visao === 'kanban' && (() => {
        const colunas = STATUS_COMPRAS.filter(st => !filtro || st === filtro);
        const etapas = colunas.map(st => ({ id: st, titulo: st, cor: COR_STATUS_COMPRA[st], total: pedidos.filter((p:any) => p.status_compra === st).length }));
        const ativa = etapas.find(e => e.id === etapaCel) ? etapaCel : etapaInicial(etapas);
        return (<>
        {celular && <SeletorEtapas etapas={etapas} ativa={ativa} onChange={setEtapaCel} />}
        <div style={{ display:'flex', gap:8, overflowX:'auto', alignItems:'flex-start', paddingBottom:6 }}>
          {colunas.filter(st => !celular || st === ativa).map(st => (
            <div key={st} style={{ flex: celular ? '1 1 auto' : '1 1 230px', minWidth: celular ? 0 : 230, maxWidth: 420, display:'flex', borderRadius:10,
                outline: colunaAlvo === st && arrastando ? '2px dashed var(--acn-brand)' : undefined, outlineOffset: 2,
                background: colunaAlvo === st && arrastando ? 'var(--acn-brand-soft)' : undefined }}
              onDragOver={e => { if (!arrastando) return; e.preventDefault(); if (colunaAlvo !== st) setColunaAlvo(st); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setColunaAlvo(c => c === st ? null : c); }}
              onDrop={e => { e.preventDefault(); const p = pedidos.find((x:any) => x.id === arrastando); setArrastando(null); setColunaAlvo(null); if (p) moverPara(p, st); }}>
            <KanbanColuna titulo={st} cor={COR_STATUS_COMPRA[st]} fundo="#f8fafc" larguraMin={0}
              {...(celular ? { visiveis: 100000 } : {})}
              itens={pedidos.filter((p:any) => p.status_compra === st)} vazio="Nenhuma requisição"
              renderCard={(p:any) => {
                const naoLido = pedidosNaoLidos.has(String(p.id));
                return (
                  <div key={p.id} draggable={!celular}
                    onDragStart={e => { setArrastando(p.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch {} }}
                    onDragEnd={() => { setArrastando(null); setColunaAlvo(null); }}
                    title={celular ? undefined : 'Arraste para outra etapa'}
                    style={{ background:'#fff', border:`1px solid ${naoLido ? '#eab308' : '#e2e8f0'}`, borderLeft:`4px solid ${COR_STATUS_COMPRA[st]}`,
                    borderRadius:6, padding:'7px 9px', boxShadow:'0 1px 2px #0000000d', fontSize:11, cursor: celular ? undefined : 'grab', opacity: arrastando === p.id ? .55 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                      <strong style={{ fontSize:11, color:'#1e293b' }}>{p.numero_pedido}</strong>
                      {p.numero_oc && <span style={{ fontSize:8, fontWeight:700, color:'#7c3aed' }}>📋 {p.numero_oc}</span>}
                    </div>
                    <div style={{ fontSize:10, color:'#334155', margin:'3px 0' }}><DescricaoCompacta texto={p.descricao_material} /></div>
                    <div style={{ fontSize:9, color:'#64748b' }}>
                      Qtd {p.quantidade || 1}{p.fornecedor ? ` · ${p.fornecedor}` : ''}{p.opl ? ` · OP ${p.opl}` : ''}
                    </div>
                    <VinculoLinkCompra p={p} compacto />
                    {(p.reprocessos > 0 || p.status_compra === DESCARTADA) && (
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                        {p.reprocessos > 0 && <Selo familia="atencao" ponto={false}>Reprocesso nº {p.reprocessos}</Selo>}
                        {p.status_compra === DESCARTADA && p.motivo_descarte && <span style={{ fontSize:10, color:'#64748b' }} title={p.motivo_descarte}>{String(p.motivo_descarte).slice(0,70)}</span>}
                      </div>
                    )}
                    {celular && (
                      <select className="acn-input" value="" style={{ width:'100%', marginTop:6 }} aria-label="Mover para outra etapa"
                        onChange={e => { const d = e.target.value; if (d) moverPara(p, d); }}>
                        <option value="">Mover para…</option>
                        {STATUS_COMPRAS.filter(x => x !== p.status_compra).map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    )}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4, marginTop:5, flexWrap:'wrap' }}>
                      <span style={{ fontSize:9 }}>
                        {canVerValor && p.valor_compra ? <strong style={{ color:'#16a34a', marginRight:6 }}>{fmt(p.valor_compra)}</strong> : null}
                        {p.data_prevista_recebimento ? fmtData(p.data_prevista_recebimento) : null}
                      </span>
                      <div style={{ display:'flex', gap:3 }}>
                        {p.status_compra==='Pendente' && <button onClick={()=>avancarStatus(p)} style={{...btn,background:'#3b82f6',padding:'2px 6px',fontSize:9}}>▶️ Iniciar</button>}
                        {p.status_compra==='Em Andamento' && <button onClick={()=>abrirModalCotacoes(p)} style={{...btn,background:'#d97706',padding:'2px 6px',fontSize:9}}>🏷️ Cotações{p.vencedora_id ? ' ✓' : ''}</button>}
                        {p.status_compra==='Aguardando Aprovação' && <button onClick={()=>abrirModalCotacoes(p)} style={{...btn,background:'#ea580c',padding:'2px 6px',fontSize:9}}>🔒 Aprovação</button>}
                        {p.status_compra==='Aprovado' && <button onClick={()=>abrirFluxo('confirmar', p)} style={{...btn,background:'#0ea5e9',padding:'2px 6px',fontSize:9}}>🛒 Confirmar</button>}
                        <button onClick={()=>setModalResumo(p)} title="Resumo" style={{...btn,background:'#0f766e',padding:'2px 6px',fontSize:9}}>🔍</button>
                        <button onClick={()=>setModalVinculo(p)} title="Vínculo e link" style={{...btn,background:(p.vinculo_tipo||p.link_url)?'#0369a1':'#94a3b8',padding:'2px 6px',fontSize:9}}>🔗</button>
                        <button onClick={()=>setModalAcomp(p)} title="Acompanhamento" style={{...btn,background:'#7c3aed',padding:'2px 6px',fontSize:9}}>🗨️</button>
                        <MenuAcoes itens={itensMenuFluxo(p)} rotulo="Etapa, edição e descarte" />
                      </div>
                    </div>
                  </div>
                );
              }} />
            </div>
          ))}
        </div>
        </>);
      })()}

      {loading ? <div style={{textAlign:'center',padding:30,color:'#9ca3af'}}>Carregando...</div>
        : pedidos.length===0 ? <div style={{textAlign:'center',padding:30,color:'#9ca3af',fontSize:12}}>Nenhuma requisição encontrada. {queryError ? '' : '(tabela vazia ou sem permissão)'}</div>
        : visao === 'kanban' ? null : (
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
                      {mostrarConcluidos ? '▲ Ocultar' : '▼ Mostrar'} Concluídos e descartados ({pedidosConcluidos.length})
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

      <DemandaAvulsaPanel currentUser={currentUser} setor="Compras" />

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
                          ↩ Não aprovar (devolver para refazer)
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
                  {nivelAtivo && (ehSolicitante(modalCotacoes, currentUser) || podeGerirCompras(currentUser)) && (
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,paddingTop:8,borderTop:'1px dashed #fdba74'}}>
                      <span style={{flex:1,fontSize:10,color:'#92400e'}}>A compra não é mais necessária? Quem solicitou pode descartar em vez de aguardar a aprovação.</span>
                      <Botao pequeno variante="perigo-sec" icone={mdiCloseCircleOutline} onClick={()=>{ const p = modalCotacoes; setModalCotacoes(null); abrirFluxo('descartar', p); }}>Descartar solicitação</Botao>
                    </div>
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
                {cotacoes.map((c:any) => {
                  const compraDecidida = ['Aprovado','Comprado'].includes(modalCotacoes?.status_compra);
                  const emEdicao = editandoCotacaoId === c.id;
                  return (
                  <div key={c.id} style={{
                    padding:'8px 10px',borderRadius:6,
                    border: vencedoraId===c.id ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                    background: vencedoraId===c.id ? '#f0fdf4' : '#fff',
                  }}>
                    {emEdicao ? (
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        <ComposicaoCotacao form={editCotacaoForm} setForm={setEditCotacaoForm} />
                        <div style={{display:'flex',gap:6}}>
                          <button className="acn-btn" style={{background:'#16a34a',flex:1}} disabled={salvandoEdicaoCotacao}
                            onClick={()=>salvarEdicaoCotacao(c)}>
                            {salvandoEdicaoCotacao ? 'Salvando...' : '💾 Salvar Correção'}
                          </button>
                          <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setEditandoCotacaoId(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (<>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>
                          {c.fornecedor_nome}
                          {vencedoraId===c.id && <span style={{marginLeft:6,color:'#16a34a',fontSize:9,fontWeight:700}}>✓ VENCEDORA</span>}
                        </div>
                        <div style={{fontSize:9,color:'#64748b',marginTop:2}}>
                          {textoComposicao(c) ? `${textoComposicao(c)} · ` : ''}
                          <strong style={{color:'#1e293b'}}>{c.valor ? fmt(c.valor) : '—'}</strong>
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                          {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                        </div>
                        {c.anexo_url && (
                          <a href={c.anexo_url} target="_blank" rel="noreferrer" style={{fontSize:9,color:'#2563eb'}}>📎 {c.anexo_nome}</a>
                        )}
                      </div>
                      {podeGerirCompras(currentUser) && (
                        <button onClick={()=>iniciarEdicaoCotacao(c)} title="Corrigir valores desta cotação"
                          style={{...btn,background:'#6366f1',padding:'2px 7px',fontSize:9}}>✏️</button>
                      )}
                      <button onClick={()=>excluirCotacao(c.id)} title="Remover"
                        style={{...btn,background:'#ef4444',padding:'2px 7px',fontSize:9}}>🗑️</button>
                    </div>
                    <CotacaoAreaLivre cotacao={c}
                      onSaved={(html:string)=>setCotacoes(prev=>prev.map(x=>x.id===c.id?{...x,area_livre:html}:x))} />
                    {!compraDecidida && !aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento') && (
                      <button className="acn-btn" style={{background:'#16a34a',width:'100%',marginTop:6}}
                        onClick={()=>aprovarCotacaoComoVencedora(c)}>
                        ✅ Aprovar esta cotação como vencedora
                      </button>
                    )}
                    </>)}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Nova cotação — escondida enquanto há aprovação de ALÇADA pendente (a vencedora já foi
                travada), ou quando a compra já foi Aprovada/Comprada (a essa altura, já foi decidida —
                pra corrigir um valor errado, usar "✏️ Editar" na cotação vencedora acima). Uma pendência
                de DEPARTAMENTO não trava, pois ela nasce na 1ª cotação — o comprador ainda precisa poder
                lançar a 2ª e 3ª enquanto o gestor avalia em paralelo. */}
            {(!['Aprovado','Comprado'].includes(modalCotacoes?.status_compra) &&
              !aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento')) ? (<>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>+ Nova Cotação de Fornecedor</div>
              {modalCotacoes?.quantidade > 1 && (
                <div style={{fontSize:9,color:'#94a3b8',marginBottom:6}}>Quantidade do pedido: {modalCotacoes.quantidade}</div>
              )}
              <div style={{marginBottom:8}}>
                <ComposicaoCotacao form={novaCotacao} setForm={setNovaCotacao} />
              </div>
              <div style={{marginBottom:8}}>
                <label className="acn-label">Anexo (PDF, imagem, planilha…)</label>
                <input type="file"
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
      {modalResumo && (
        <ResumoCompraModal pedido={modalResumo} canVerValor={canVerValor} departamentos={departamentosConfig}
          currentUser={currentUser} onClose={()=>setModalResumo(null)} />
      )}
      {modalFluxo?.tipo === 'voltar' && <ModalVoltarEtapa pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)} onFeito={()=>{ setModalFluxo(null); setFiltro(''); load(); }} />}
      {modalFluxo?.tipo === 'descartar' && <ModalDescartar pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)} onFeito={()=>{ setModalFluxo(null); load(); }} />}
      {modalFluxo?.tipo === 'reativar' && <ModalReativar pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)} onFeito={()=>{ setModalFluxo(null); load(); }} />}
      {modalFluxo?.tipo === 'iniciar' && <ModalIniciarCotacao pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)} onFeito={()=>{ setModalFluxo(null); setFiltro(''); load(); }} />}
      {modalFluxo?.tipo === 'confirmar' && <ModalConfirmarCompra pedido={modalFluxo.pedido} onClose={()=>setModalFluxo(null)} onConfirmar={confirmarCompra} />}
      {modalFluxo?.tipo === 'editar' && <ModalEditarSolicitacao pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)} onFeito={()=>{ setModalFluxo(null); load(); }} />}
      {modalFluxo?.tipo === 'receber' && (
        <ModalReceberPedido pedido={modalFluxo.pedido} currentUser={currentUser} onClose={()=>setModalFluxo(null)}
          onFeito={async (confere: boolean) => {
            const p = modalFluxo.pedido;
            await registrarHistorico(p.id, confere
              ? { tipo: 'avanco', de: 'Comprado', para: 'Concluído', motivo: 'Recebimento registrado e conferido.' }
              : { tipo: 'posicao_entrega', de: 'Comprado', para: 'Comprado', motivo: 'Recebimento com divergência — a compra continua em Comprado até resolver.' }, currentUser);
            setModalFluxo(null); load();
          }} />
      )}
      {modalVinculo && (
        <ModalVinculoCompra pedido={modalVinculo} onClose={()=>setModalVinculo(null)}
          onSalvo={()=>{ setModalVinculo(null); load(true); }} />
      )}

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
