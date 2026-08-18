// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ─── Constantes ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';

const fmtR = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};

function calcItem(item, params) {
  const qt             = Number(item.qt)             || 1;
  const custo_unit     = Number(item.custo_unit)     || 0;
  const ipi_pct        = Number(item.ipi_pct)        || 0;
  const st_pct         = Number(item.st_pct)         || 0;
  const markup_pct     = Number(item.markup_pct)     || 0;
  const difal_pct      = Number(item.difal_pct)      || 0;
  const imposto_pct    = Number(item.imposto_pct)    || 0;
  const custo_fixo_pct = Number(item.custo_fixo_pct) || 0;
  const fx = item.moeda === 'DOLAR' ? (Number(params.ptax_dolar) || 5.85)
           : item.moeda === 'EURO'  ? (Number(params.ptax_euro)  || 6.40)
           : 1;
  const custoUnitBrl = custo_unit * (1 + ipi_pct / 100) * (1 + st_pct / 100) * fx;
  const custoTotal   = custoUnitBrl * qt;
  const valorUnit    = difal_pct < 100
    ? custoUnitBrl * (1 + markup_pct / 100) / (1 - difal_pct / 100)
    : 0;
  const valorTotal   = valorUnit * qt;
  const totalDifal   = valorTotal * (difal_pct / 100);
  const receitaBruta = custoUnitBrl * (1 + markup_pct / 100) * qt;
  const totalImposto = receitaBruta * (imposto_pct / 100);
  const margem       = receitaBruta - totalImposto - (custo_fixo_pct / 100 * receitaBruta) - custoTotal;
  const lucroPct     = (valorTotal - totalDifal) > 0 ? (margem / (valorTotal - totalDifal)) * 100 : 0;
  return { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct };
}

const STATUS_CORES = {
  rascunho:          { bg:'#f1f5f9', color:'#475569', label:'Rascunho' },
  ativa:             { bg:'#dbeafe', color:'#1d4ed8', label:'Ativa' },
  aprovada:          { bg:'#dcfce7', color:'#16a34a', label:'Aprovada' },
  proposta_gerada:   { bg:'#fef9c3', color:'#92400e', label:'Proposta Gerada' },
  vinculada:         { bg:'#ede9fe', color:'#6d28d9', label:'Vinculada' },
  cancelada:         { bg:'#fee2e2', color:'#dc2626', label:'Cancelada' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CORES[status] || { bg:'#f1f5f9', color:'#475569', label: status || '—' };
  return (
    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:3, padding:'2px 7px',
      fontSize:9, fontWeight:700, letterSpacing:.2 }}>
      {cfg.label}
    </span>
  );
}

// ─── Modal de Desconto / Proposta ────────────────────────────────────────────
// ─── GERADOR DE HTML DA PROPOSTA FINAL ───────────────────────────────────────
function gerarPropostaHTML(cotacao, proposta, { orgaoCliente, validade, refPv, formato, prazoEntrega, incluirFotos = true, descricaoServico }) {
  const prms     = cotacao.parametros_globais || {};
  const itens    = cotacao.itens || [];
  const results  = itens.map(it => calcItem(it, prms));
  const totalBruto = results.reduce((s, r) => s + r.valorTotal, 0);
  const descPct  = proposta?.desconto_pct || 0;
  // Sempre recalcula a partir dos itens ATUAIS da cotação (não confia no
  // valor_com_desconto salvo na proposta) — se a cotação foi corrigida depois
  // de gerar a proposta, o valor exibido/cobrado reflete o preço certo, com
  // o mesmo % de desconto que foi aprovado.
  const totalLiq = totalBruto * (1 - descPct/100);
  const descVal  = totalBruto - totalLiq;
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const empresa  = cotacao.empresa || 'ACN';
  const logoBase = 'https://spinsc.github.io/ACN/';
  const apl = window.location.hostname === 'localhost' ? '/' : logoBase;

  const fmtBRL = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  // A proposta ao cliente mostra UMA linha consolidada (a descrição do
  // serviço/produto, editável pelo vendedor na emissão) em vez do
  // detalhamento interno de itens/insumos usado para compor o preço —
  // esse detalhamento é informação de custo interna, não deve ir ao cliente.
  const descricaoLinha = (descricaoServico || cotacao.nome || 'Serviço/Produto proposto')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linhasItens = `
      <tr>
        <td>${descricaoLinha}</td>
        <td style="text-align:center">1</td>
        <td style="text-align:center">—</td>
        <td style="text-align:right">${fmtBRL(totalBruto)}</td>
        <td style="text-align:right"><strong>${fmtBRL(totalBruto)}</strong></td>
      </tr>`;

  // Fotos dos produtos — inclusão opcional, escolhida pelo vendedor na emissão
  const todasFotos = incluirFotos ? itens.flatMap(it => Array.isArray(it.fotos) ? it.fotos : []).slice(0, 6) : [];
  const fotosHTML = todasFotos.length > 0 ? `
  <div class="bloco">
    <h2>&#128247; Fotos do Produto</h2>
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      ${todasFotos.map(url => `<img src="${url}" style="height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0" />`).join('')}
    </div>
    ${itens.some(it => it.catalogo_url) ? `<p style="margin-top:8px;font-size:9pt"><a href="${itens.find(it=>it.catalogo_url)?.catalogo_url}" target="_blank" style="color:#1e3a5f">&#128196; Ver cat\u00e1logo completo do produto</a></p>` : ''}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Proposta Comercial — ${cotacao.numero_cotacao || ''}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,sans-serif; color:#1e293b; font-size:11pt; }
    .page { max-width:780px; margin:0 auto; padding:32px 28px; }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #1e3a5f; padding-bottom:16px; margin-bottom:22px; }
    .logos { display:flex; align-items:center; gap:16px; }
    .logos img { height:44px; object-fit:contain; }
    .header-info { text-align:right; }
    .header-info h1 { font-size:17pt; font-weight:800; color:#1e3a5f; }
    .header-info p { font-size:9pt; color:#475569; }
    .bloco { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; margin-bottom:16px; }
    .bloco h2 { font-size:9pt; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px; }
    .grade { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
    .grade .campo label { font-size:8pt; color:#94a3b8; font-weight:700; }
    .grade .campo p { font-size:11pt; font-weight:600; color:#1e293b; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    thead { background:#1e3a5f; color:#fff; }
    thead th { padding:8px 10px; font-size:9pt; font-weight:600; }
    tbody tr:nth-child(even) { background:#f1f5f9; }
    tbody td { padding:7px 10px; font-size:10pt; border-bottom:1px solid #e2e8f0; }
    .total-row { background:#1e3a5f !important; color:#fff; }
    .total-row td { padding:9px 10px; font-weight:800; font-size:11pt; }
    .financeiro { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px; }
    .fin-card { border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; text-align:center; }
    .fin-card.destaque { background:#1e3a5f; color:#fff; border-color:#1e3a5f; }
    .fin-card label { font-size:8pt; font-weight:700; opacity:.7; display:block; margin-bottom:4px; }
    .fin-card span { font-size:16pt; font-weight:800; }
    .rodape { border-top:2px solid #e2e8f0; padding-top:16px; margin-top:8px; font-size:9pt; color:#64748b; display:flex; justify-content:space-between; align-items:flex-end; }
    .assinatura { border-top:1px solid #94a3b8; width:200px; text-align:center; padding-top:6px; font-size:9pt; }
    @media print {
      body { font-size:10pt; }
      .page { padding:18px 14px; }
      @page { size:A4; margin:15mm; }
    }
  </style>
</head>
<body>
<div class="page">
  <!-- HEADER -->
  <div class="header">
    <div class="logos">
      <img src="${apl}logo.png" alt="${empresa}" onerror="this.style.display='none'" />
    </div>
    <div class="header-info">
      <h1>PROPOSTA COMERCIAL</h1>
      <p>Nº ${cotacao.numero_cotacao || '—'} · ${dataHoje}</p>
      <p>${empresa}</p>
    </div>
  </div>

  <!-- DADOS DO CLIENTE -->
  <div class="bloco">
    <h2>📋 Dados do Cliente</h2>
    <div class="grade">
      <div class="campo">
        <label>ÓRGÃO / CLIENTE</label>
        <p>${orgaoCliente || cotacao.orgao_cliente || '—'}</p>
      </div>
      <div class="campo">
        <label>REFERÊNCIA</label>
        <p>${cotacao.opl_numero || refPv || '—'}</p>
      </div>
      <div class="campo">
        <label>VALIDADE DA PROPOSTA</label>
        <p>${validade || '30'} dias</p>
      </div>
      ${prazoEntrega ? `<div class="campo"><label>PRAZO DE ENTREGA</label><p>${prazoEntrega}</p></div>` : ''}
    </div>
  </div>

  <!-- PRODUTOS -->
  <div class="bloco">
    <h2>📦 Produtos e Serviços</h2>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Descrição</th>
          <th style="text-align:center">Qtd</th>
          <th style="text-align:center">Unid.</th>
          <th style="text-align:right">Valor Unit.</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${linhasItens}
        ${descVal > 0.005 ? `
        <tr>
          <td colspan="4" style="text-align:right">Valor Total</td>
          <td style="text-align:right">${fmtBRL(totalBruto)}</td>
        </tr>
        <tr>
          <td colspan="4" style="text-align:right">Desconto</td>
          <td style="text-align:right;color:#dc2626">- ${fmtBRL(descVal)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="4" style="text-align:right">VALOR TOTAL COM DESCONTO</td>
          <td style="text-align:right">${fmtBRL(totalLiq)}</td>
        </tr>` : `
        <tr class="total-row">
          <td colspan="4" style="text-align:right">VALOR TOTAL</td>
          <td style="text-align:right">${fmtBRL(totalLiq)}</td>
        </tr>`}
      </tbody>
    </table>
  </div>

  <!-- FOTOS -->
  ${fotosHTML}

  <!-- VALOR FINAL -->
  <div class="financeiro">
    ${descVal > 0.005 ? `
    <div class="fin-card">
      <label>VALOR TOTAL</label>
      <span>${fmtBRL(totalBruto)}</span>
    </div>
    <div class="fin-card destaque">
      <label>VALOR COM DESCONTO</label>
      <span>${fmtBRL(totalLiq)}</span>
    </div>` : `
    <div class="fin-card destaque" style="grid-column:span 2">
      <label>VALOR DA PROPOSTA</label>
      <span>${fmtBRL(totalLiq)}</span>
    </div>`}
  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    <div>
      <p>⏳ Proposta válida por <strong>${validade || '30'} dias</strong> a partir de ${dataHoje}.</p>
      ${prazoEntrega ? `<p style="margin-top:4px">Prazo de entrega: <strong>${prazoEntrega}</strong>.</p>` : ''}
      <p style="margin-top:4px">Preços sujeitos a alteração após o prazo de validade.</p>
    </div>
    <div class="assinatura">
      <p>${cotacao.criado_por || ''}</p>
      <p>Responsável Comercial</p>
    </div>
  </div>
</div>
${formato === 'pdf' ? '<script>window.onload=()=>{window.print();}<\/script>' : ''}
</body>
</html>`;
}

// ─── Modal para emitir proposta final (HTML / PDF) ────────────────────────────
function ModalEmitirProposta({ cotacao, proposta, onClose }) {
  const [orgaoCliente, setOrgaoCliente] = useState(cotacao.orgao_cliente || '');
  const [validade,     setValidade]     = useState('30');
  const [refPv,        setRefPv]        = useState(cotacao.opl_numero || '');
  const [formato,      setFormato]      = useState<'html'|'pdf'>('html');
  const [prazoEntrega, setPrazoEntrega] = useState(proposta?.prazo_entrega || '');
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [emailCliente, setEmailCliente] = useState('');
  const [whatsapp,     setWhatsapp]     = useState('');
  // Descrição da linha do serviço/produto mostrada ao cliente — pré-preenchida
  // com o título da cotação, mas o vendedor pode renomear antes de emitir.
  const [descricaoServico, setDescricaoServico] = useState(cotacao.nome || '');

  const getHTML = (fmt = formato) =>
    gerarPropostaHTML(cotacao, proposta, { orgaoCliente, validade, refPv, formato: fmt, prazoEntrega, incluirFotos, descricaoServico });

  const emitir = () => {
    const html = getHTML();
    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups para gerar a proposta.'); return; }
    win.document.write(html);
    win.document.close();
    if (proposta?.id && prazoEntrega !== (proposta?.prazo_entrega || '')) {
      supabase.from('cotacoes_propostas').update({ prazo_entrega: prazoEntrega }).eq('id', proposta.id);
    }
    onClose();
  };

  const prms = cotacao.parametros_globais || {};
  const itens = cotacao.itens || [];
  const results = itens.map(it => calcItem(it, prms));
  // Sempre recalculado a partir dos itens atuais — ver mesmo comentário em gerarPropostaHTML.
  const totalLiq = results.reduce((s, r) => s + r.valorTotal, 0) * (1 - (proposta?.desconto_pct || 0) / 100);

  const enviarEmail = () => {
    if (!emailCliente.trim()) { alert('Informe o e-mail do cliente.'); return; }
    const assunto = encodeURIComponent(`Proposta Comercial ${cotacao.numero_cotacao || ''} — ACN`);
    const corpo = encodeURIComponent(
      `Prezado(a),

Segue nossa proposta comercial.

Número: ${cotacao.numero_cotacao || ''}
Valor: ${Number(totalLiq).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
Validade: ${validade} dias

Atenciosamente,
${cotacao.criado_por || 'ACN'}`
    );
    window.open(`mailto:${emailCliente.trim()}?subject=${assunto}&body=${corpo}`, '_blank');
  };

  const enviarWhatsApp = () => {
    const num = whatsapp.replace(/\D/g, '');
    if (!num) { alert('Informe o telefone WhatsApp.'); return; }
    const msg = encodeURIComponent(
      `Olá! Segue nossa proposta comercial.\n\n📋 Nº ${cotacao.numero_cotacao || ''}\n💰 Valor: ${Number(totalLiq).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n⏳ Validade: ${validade} dias\n\nQualquer dúvida, estamos à disposição!`
    );
    window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
  };

  const inp11: React.CSSProperties = { width:'100%', border:'1px solid #d1d5db', borderRadius:6, padding:'8px 10px', fontSize:11 };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:10, width:'min(560px,95vw)',
        boxShadow:'0 8px 32px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ background:'#1e3a5f', color:'#fff', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:13 }}>📄 Emitir Proposta Final ao Cliente</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:12, maxHeight:'80vh', overflowY:'auto' }}>
          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 }}>ÓRGÃO / CLIENTE</label>
            <input value={orgaoCliente} onChange={e=>setOrgaoCliente(e.target.value)}
              placeholder="Nome do órgão ou cliente..." style={inp11} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 }}>
              DESCRIÇÃO DO SERVIÇO/PRODUTO (como aparece na proposta)
            </label>
            <input value={descricaoServico} onChange={e=>setDescricaoServico(e.target.value)}
              placeholder="Ex: Reforma cela PCSC Palhoça" style={inp11} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 }}>VALIDADE (DIAS)</label>
              <input type="number" min={1} value={validade} onChange={e=>setValidade(e.target.value)} style={inp11} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 }}>REF. OP/OS/PV</label>
              <input value={refPv} onChange={e=>setRefPv(e.target.value)}
                placeholder="Número da OP, OS ou PV..." style={inp11} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 }}>PRAZO DE ENTREGA</label>
              <input value={prazoEntrega} onChange={e=>setPrazoEntrega(e.target.value)}
                placeholder="Ex: 15 dias úteis" style={inp11} />
            </div>
          </div>

          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:6 }}>FORMATO DE SAÍDA</label>
            <div style={{ display:'flex', gap:10 }}>
              {([['html','🌐 HTML'],['pdf','🖨️ PDF']] as const).map(([val,lbl])=>(
                <label key={val} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, cursor:'pointer',
                  padding:'8px 14px', border:`2px solid ${formato===val?'#1e3a5f':'#e2e8f0'}`,
                  borderRadius:6, background: formato===val?'#f0f4ff':'#fff', flex:1, justifyContent:'center' }}>
                  <input type="radio" name="formato" value={val} checked={formato===val}
                    onChange={()=>setFormato(val)} style={{ display:'none' }} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'#374151', cursor:'pointer',
            background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 12px' }}>
            <input type="checkbox" checked={incluirFotos} onChange={e=>setIncluirFotos(e.target.checked)}
              style={{ width:15, height:15, cursor:'pointer', accentColor:'#1e3a5f' }} />
            📷 Incluir fotos do produto e link do catálogo na proposta
          </label>

          {/* Envio por e-mail */}
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#0369a1', marginBottom:8 }}>📧 Enviar por E-mail</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={emailCliente} onChange={e=>setEmailCliente(e.target.value)}
                placeholder="email@cliente.com.br" type="email"
                style={{ ...inp11, flex:1 }} />
              <button onClick={enviarEmail}
                style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:6,
                  padding:'8px 14px', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                Enviar
              </button>
            </div>
          </div>

          {/* Envio por WhatsApp */}
          <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#15803d', marginBottom:8 }}>💬 Enviar por WhatsApp</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)}
                placeholder="11999998888" type="tel"
                style={{ ...inp11, flex:1 }} />
              <button onClick={enviarWhatsApp}
                style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6,
                  padding:'8px 14px', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                Enviar
              </button>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
            <button onClick={onClose}
              style={{ padding:'8px 18px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={emitir}
              style={{ padding:'8px 24px', background:'#1e3a5f', color:'#fff', border:'none',
                borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
              {formato === 'pdf' ? '🖨️ Gerar PDF' : '🌐 Gerar HTML'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalDesconto({ cotacao, currentUser, onClose, onSalvo, verCustos, verMarkup, pedirAprovacao }) {
  const [desconto, setDesconto] = useState(0);
  const [obs,      setObs]      = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo]         = useState('proposta'); // 'proposta' | 'aprovacao'

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const results   = itens.map(it => calcItem(it, prms));
  const totVendas  = results.reduce((s, r) => s + r.valorTotal,   0);
  const totImposto = results.reduce((s, r) => s + r.totalImposto, 0);
  const maxDesc    = Number(cotacao.desconto_maximo_pct) || 0;
  const valorDesc  = totVendas * desconto / 100;
  const valorFinal = totVendas - valorDesc;

  // Sem teto configurado (maxDesc <= 0) não significa "sem limite" — significa
  // que nenhum desconto tem aprovação automática, então qualquer desconto > 0
  // precisa passar por aprovação. Evita a brecha de dar até 50% de desconto
  // sem ninguém saber quando o campo "Desconto Máximo" nunca foi preenchido.
  const precisaAprovacao = desconto > 0 && (maxDesc <= 0 || desconto > maxDesc);

  const salvar = async () => {
    setSalvando(true);
    if (precisaAprovacao) {
      // Envia para aprovação
      const { error } = await supabase.from('cotacoes_aprovacoes').insert([{
        cotacao_id:          cotacao.id,
        cotacao_nome:        cotacao.nome,
        numero_cotacao:      cotacao.numero_cotacao,
        solicitado_por:      currentUser?.email,
        desconto_pct:        desconto,
        motivo:              obs,
        status:              'pendente',
        crm_oportunidade_id: cotacao.crm_oportunidade_id || null,
      }]);
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
      alert(`✅ Solicitação de aprovação enviada! Desconto de ${desconto}% aguardando aprovação.`);
      onSalvo && onSalvo();
      onClose();
    } else {
      // Salva proposta diretamente
      const { error } = await supabase.from('cotacoes_propostas').insert([{
        cotacao_id:          cotacao.id,
        cotacao_nome:        cotacao.nome,
        opl_numero:          cotacao.opl_numero || null,
        desconto_pct:        desconto,
        valor_total:         totVendas,
        valor_com_desconto:  valorFinal,
        prazo_entrega:       prazoEntrega.trim() || null,
        criado_por:          currentUser?.email,
        observacoes:         obs,
      }]);
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
      // Atualiza status
      await supabase.from('cotacoes_precos').update({ status: 'proposta_gerada' }).eq('id', cotacao.id);
      alert('✅ Proposta salva!');
      onSalvo && onSalvo();
      onClose();
    }
    setSalvando(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:420, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color:'#1e293b' }}>📄 Gerar Proposta</div>
            <div style={{ fontSize:9, color:'#64748b' }}>{cotacao.numero_cotacao} · {cotacao.nome}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#6b7280', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:16 }}>
          {/* Resumo de valor — valor de venda + impostos */}
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Valor de Venda</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{fmtR(totVendas)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid #bae6fd' }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Impostos</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>{fmtR(totImposto)}</span>
            </div>
          </div>

          {/* Slider de desconto — limitado ao maxDesc configurado */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
              <span>Desconto (%)</span>
              <span style={{ color:'#0f766e', fontWeight:800 }}>{desconto}%</span>
            </div>
            <input type="range" min={0}
              max={maxDesc > 0 ? maxDesc : 50}
              step={maxDesc > 0 ? Math.min(0.5, maxDesc / 10) : 0.5}
              value={desconto}
              onChange={e => setDesconto(Number(e.target.value))}
              style={{ width:'100%', accentColor:'#0f766e' }} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#9ca3af' }}>
              <span>0%</span>
              {maxDesc > 0
                ? <><span>{(maxDesc / 2).toFixed(1)}%</span><span>{maxDesc}%</span></>
                : <><span>25%</span><span>50%</span></>}
            </div>
          </div>

          {/* Resultado */}
          <div style={{ background: precisaAprovacao ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${precisaAprovacao ? '#fca5a5' : '#86efac'}`,
            borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Desconto</span>
              <span style={{ fontSize:10, color:'#dc2626', fontWeight:700 }}>- {fmtR(valorDesc)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#374151' }}>Valor Final</span>
              <span style={{ fontSize:13, fontWeight:800, color: precisaAprovacao ? '#dc2626' : '#16a34a' }}>{fmtR(valorFinal)}</span>
            </div>
            {precisaAprovacao && (
              <div style={{ marginTop:8, padding:'6px 10px', background:'#fee2e2', borderRadius:5, fontSize:9, color:'#991b1b' }}>
                ⚠️ Desconto acima do limite. Esta proposta precisará de <strong>aprovação do gestor</strong>.
              </div>
            )}
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:9, fontWeight:700, color:'#475569', display:'block', marginBottom:4 }}>
              Prazo de Entrega
            </label>
            <input value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)}
              placeholder="Ex: 15 dias úteis"
              style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 8px', fontSize:10, boxSizing:'border-box' }} />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:9, fontWeight:700, color:'#475569', display:'block', marginBottom:4 }}>
              {precisaAprovacao ? 'Justificativa (obrigatória)' : 'Observações (opcional)'}
            </label>
            <textarea value={obs} onChange={e => setObs(e.target.value)}
              placeholder={precisaAprovacao ? 'Explique o motivo do desconto extra...' : 'Observações para o cliente...'}
              rows={3}
              style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 8px', fontSize:10, boxSizing:'border-box', fontFamily:'inherit', resize:'vertical' }} />
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:5,
              padding:'7px 16px', fontSize:10, color:'#475569', cursor:'pointer', fontWeight:600 }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || (precisaAprovacao && !obs.trim())}
              style={{ background: precisaAprovacao ? '#dc2626' : '#0f766e', color:'#fff', border:'none',
                borderRadius:5, padding:'7px 18px', fontSize:10, fontWeight:700, cursor:'pointer',
                opacity: (salvando || (precisaAprovacao && !obs.trim())) ? .5 : 1 }}>
              {salvando ? 'Salvando...' : precisaAprovacao ? '📤 Enviar para Aprovação' : '💾 Gerar Proposta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Detalhe de Cotação ─────────────────────────────────────────────────
function ModalDetalhe({ cotacao, currentUser, verCustos, verFornec, verMarkup,
  onClose, onAbrirDesconto, onVincularOp, onOpenCrm, recarregar }) {
  const [propostas,   setPropostas]   = useState([]);
  const [aprovacoes,  setAprovacoes]  = useState([]);
  const [opBusca,     setOpBusca]     = useState('');
  const [opOpts,      setOpOpts]      = useState([]);
  const [buscandoOp,  setBuscandoOp]  = useState(false);
  const [vinculando,  setVinculando]  = useState(false);
  const [emitindoProposta, setEmitindoProposta] = useState<any>(null);
  const timerRef = useRef(null);

  const isAdmin  = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);

  useEffect(() => {
    supabase.from('cotacoes_propostas').select('*')
      .eq('cotacao_id', cotacao.id).order('criado_em', { ascending: false })
      .then(({ data }) => setPropostas(data || []));
    supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false })
      .then(({ data }) => setAprovacoes(data || []));
  }, [cotacao.id]);

  const buscarOp = (texto) => {
    setOpBusca(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setOpOpts([]); return; }
    timerRef.current = setTimeout(async () => {
      setBuscandoOp(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .ilike('opl', `%${texto}%`).limit(8);
      setOpOpts(data || []);
      setBuscandoOp(false);
    }, 260);
  };

  const vincularOp = async (op) => {
    setVinculando(true);
    await supabase.from('cotacoes_precos').update({
      opl_id:     op.id,
      opl_numero: op.opl,
      status:     'vinculada',
    }).eq('id', cotacao.id);
    setOpBusca('');
    setOpOpts([]);
    setVinculando(false);
    recarregar && recarregar();
    onClose();
  };

  const aprovarSolicitacao = async (aprov) => {
    if (!isAdmin) return;
    const resposta = prompt('Resposta (aprovado/rejeitado):');
    if (!resposta) return;
    const status = resposta.toLowerCase().includes('rej') ? 'rejeitado' : 'aprovado';
    await supabase.from('cotacoes_aprovacoes').update({
      status, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(), resposta: resposta,
    }).eq('id', aprov.id);
    if (status === 'aprovado') {
      await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', cotacao.id);
    }
    const { data } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false });
    setAprovacoes(data || []);
    recarregar && recarregar();
  };

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const results   = itens.map(it => calcItem(it, prms));
  const totVendas = results.reduce((s, r) => s + r.valorTotal,   0);
  const totCusto  = results.reduce((s, r) => s + r.custoTotal,   0);
  const totDifal  = results.reduce((s, r) => s + r.totalDifal,   0);
  // Mesma fórmula usada em FormacaoPrecosTab (totMargem/lucroGeral) e no
  // calcItem de cada linha — soma a margem real (já líquida de imposto e
  // custo fixo), não apenas venda-custo, que ficava artificialmente alta.
  const margem    = results.reduce((s, r) => s + r.margem, 0);
  const margemPct = (totVendas - totDifal) > 0 ? margem / (totVendas - totDifal) * 100 : 0;

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1900, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:700, maxWidth:'95vw', maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 8px 32px #0003', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px', background:'#1e3a5f', color:'#fff', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, opacity:.75, fontWeight:700, letterSpacing:.5, marginBottom:2 }}>
              COTAÇÃO · {cotacao.numero_cotacao || '—'}
            </div>
            <div style={{ fontSize:14, fontWeight:800 }}>{cotacao.nome}</div>
            <div style={{ fontSize:9, opacity:.85, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>{cotacao.tipo} · {cotacao.empresa}</span>
              {cotacao.opl_numero && <span>🔗 OP: {cotacao.opl_numero}</span>}
              {cotacao.crm_oportunidade_id && (
                <button onClick={() => onOpenCrm && onOpenCrm(cotacao.crm_oportunidade_id)}
                  style={{ background:'none', border:'none', color:'#93c5fd', fontSize:9,
                    cursor:'pointer', textDecoration:'underline', padding:0 }}>
                  🏛️ Ver no CRM
                </button>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <StatusBadge status={cotacao.status} />
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:16, flex:1, overflowY:'auto' }}>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns: verCustos ? '1fr 1fr 1fr' : '1fr', gap:10, marginBottom:14 }}>
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#16a34a', fontWeight:700, marginBottom:3 }}>PREÇO DE VENDA</div>
              <div style={{ fontSize:16, fontWeight:800, color:'#15803d' }}>{fmtR(totVendas)}</div>
            </div>
            {verCustos && (
              <>
                <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#92400e', fontWeight:700, marginBottom:3 }}>CUSTO TOTAL</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#78350f' }}>{fmtR(totCusto)}</div>
                </div>
                <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#6d28d9', fontWeight:700, marginBottom:3 }}>MARGEM</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#5b21b6' }}>{fmtR(margem)} ({fmtPct(margemPct)})</div>
                </div>
              </>
            )}
          </div>

          {/* Tabela de itens */}
          <div style={{ overflowX:'auto', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'#1e293b', color:'#cbd5e1' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>Item</th>
                  <th style={{ padding:'6px 8px', textAlign:'center' }}>Qt</th>
                  {verFornec && <th style={{ padding:'6px 8px', textAlign:'left' }}>Fornecedor</th>}
                  {verFornec && <th style={{ padding:'6px 8px', textAlign:'left' }}>Marca</th>}
                  {verCustos && <th style={{ padding:'6px 8px', textAlign:'right' }}>Custo</th>}
                  {verMarkup && <th style={{ padding:'6px 8px', textAlign:'right' }}>Markup</th>}
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Preço Unit.</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => {
                  const r = results[i];
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding:'5px 8px', maxWidth:220, wordBreak:'break-word' }}>
                        <div style={{ fontWeight:600, color:'#1e293b' }}>{it.produto || '—'}</div>
                        {it.unidade && <div style={{ fontSize:8, color:'#9ca3af' }}>{it.unidade}</div>}
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center', color:'#374151' }}>{it.qt || 1}</td>
                      {verFornec && <td style={{ padding:'5px 8px', color:'#374151' }}>{it.fornecedor || '—'}</td>}
                      {verFornec && <td style={{ padding:'5px 8px', color:'#374151' }}>{it.marca || '—'}</td>}
                      {verCustos && <td style={{ padding:'5px 8px', textAlign:'right', color:'#92400e' }}>{fmtR(r.custoTotal)}</td>}
                      {verMarkup && <td style={{ padding:'5px 8px', textAlign:'right', color:'#6d28d9' }}>{fmtPct(it.markup_pct)}</td>}
                      <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600 }}>{fmtR(r.valorUnit)}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#15803d' }}>{fmtR(r.valorTotal)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background:'#1e293b', color:'#fff' }}>
                  <td colSpan={2 + (verFornec?2:0) + (verCustos?1:0) + (verMarkup?1:0)}
                    style={{ padding:'7px 8px', fontWeight:700, fontSize:11, textAlign:'right' }}>
                    TOTAL
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:800, fontSize:12 }}>{fmtR(totVendas)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Vincular OP/OS */}
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>🔗 Vincular OP/OS</div>
            {cotacao.opl_numero ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:10, color:'#16a34a', fontWeight:700 }}>✅ OP Vinculada: {cotacao.opl_numero}</span>
                {isAdmin && (
                  <button onClick={async () => {
                    await supabase.from('cotacoes_precos').update({ opl_id: null, opl_numero: null }).eq('id', cotacao.id);
                    recarregar && recarregar();
                    onClose();
                  }} style={{ fontSize:8, background:'#fee2e2', border:'1px solid #fca5a5', color:'#dc2626',
                    borderRadius:3, padding:'2px 6px', cursor:'pointer' }}>
                    Desvincular
                  </button>
                )}
              </div>
            ) : (
              <div style={{ position:'relative' }}>
                <input value={opBusca} onChange={e => buscarOp(e.target.value)}
                  placeholder="Buscar OP pelo número..."
                  style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 8px',
                    fontSize:10, boxSizing:'border-box' }} />
                {buscandoOp && <div style={{ fontSize:9, color:'#6b7280', padding:'4px 0' }}>Buscando...</div>}
                {opOpts.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff',
                    border:'1px solid #e2e8f0', borderRadius:5, boxShadow:'0 4px 12px #0002', zIndex:10 }}>
                    {opOpts.map(op => (
                      <div key={op.id} onClick={() => vincularOp(op)}
                        style={{ padding:'7px 10px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                          fontSize:10, display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontWeight:600 }}>{op.opl}</span>
                        <span style={{ color:'#6b7280' }}>{op.cliente_nome}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Histórico de aprovações */}
          {aprovacoes.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>📋 Solicitações de Aprovação</div>
              {aprovacoes.map(a => (
                <div key={a.id} style={{ background: a.status==='aprovado' ? '#f0fdf4' : a.status==='rejeitado' ? '#fef2f2' : '#fef9c3',
                  border:`1px solid ${a.status==='aprovado'?'#86efac':a.status==='rejeitado'?'#fca5a5':'#fde68a'}`,
                  borderRadius:6, padding:'8px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700 }}>
                      {a.status==='aprovado'?'✅':a.status==='rejeitado'?'❌':'⏳'} Desconto: {a.desconto_pct}%
                    </span>
                    <span style={{ fontSize:9, color:'#6b7280' }}>{a.status}</span>
                  </div>
                  <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Por: {a.solicitado_por} · {new Date(a.solicitado_em).toLocaleString('pt-BR')}</div>
                  {a.motivo && <div style={{ fontSize:9, color:'#374151' }}>Motivo: {a.motivo}</div>}
                  {a.resposta && <div style={{ fontSize:9, color:'#374151', marginTop:3 }}>Resposta: {a.resposta} (por {a.aprovado_por})</div>}
                  {isAdmin && a.status === 'pendente' && (
                    <button onClick={() => aprovarSolicitacao(a)}
                      style={{ marginTop:8, background:'#0f766e', color:'#fff', border:'none', borderRadius:4,
                        padding:'4px 12px', fontSize:9, cursor:'pointer', fontWeight:700 }}>
                      ✅ Responder
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Propostas geradas */}
          {propostas.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>📄 Propostas Geradas</div>
              {propostas.map(p => (
                <div key={p.id} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6,
                  padding:'8px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <span style={{ fontSize:11, fontWeight:700, color:'#15803d' }}>{fmtR(p.valor_com_desconto)}</span>
                      {p.desconto_pct > 0 && (
                        <span style={{ fontSize:9, color:'#dc2626', marginLeft:8 }}>({p.desconto_pct}% de desconto)</span>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:9, color:'#9ca3af' }}>{new Date(p.criado_em).toLocaleString('pt-BR')}</span>
                      <button onClick={() => setEmitindoProposta(p)}
                        style={{ background:'#1e3a5f', color:'#fff', border:'none', borderRadius:4,
                          padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                        📄 Emitir
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize:9, color:'#475569', marginTop:3 }}>
                    Total sem desconto: {fmtR(p.valor_total)} · por {p.criado_por}
                  </div>
                  {p.observacoes && <div style={{ fontSize:9, color:'#374151', marginTop:3 }}>Obs: {p.observacoes}</div>}
                </div>
              ))}
            </div>
          )}

          {emitindoProposta && (
            <ModalEmitirProposta
              cotacao={cotacao}
              proposta={emitindoProposta}
              onClose={() => setEmitindoProposta(null)}
            />
          )}
        </div>

        {/* Footer de ações */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => onAbrirDesconto && onAbrirDesconto()}
            style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:5,
              padding:'7px 16px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            💰 Gerar Proposta / Desconto
          </button>
          <button onClick={onClose}
            style={{ background:'#f1f5f9', color:'#475569', border:'none', borderRadius:5,
              padding:'7px 14px', fontSize:10, cursor:'pointer' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Aprovações Pendentes (para Admin/Gestor) ───────────────────────
function PainelAprovacoes({ currentUser, onClose }) {
  const [lista, setLista]   = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('status', 'pendente').order('solicitado_em', { ascending: false });
    setLista(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (aprov, decisao) => {
    const resposta = decisao === 'aprovado'
      ? 'Aprovado pelo gestor.'
      : prompt('Motivo da rejeição:') || 'Rejeitado.';
    await supabase.from('cotacoes_aprovacoes').update({
      status: decisao, aprovado_por: currentUser?.email,
      aprovado_em: new Date().toISOString(), resposta,
    }).eq('id', aprov.id);
    if (decisao === 'aprovado') {
      await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', aprov.cotacao_id);
    }
    carregar();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:560, maxWidth:'95vw', maxHeight:'80vh',
        overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:13, color:'#1e293b' }}>⏳ Aprovações Pendentes</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#6b7280', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:16 }}>
          {loading && <div style={{ textAlign:'center', color:'#9ca3af', padding:20 }}>Carregando...</div>}
          {!loading && lista.length === 0 && (
            <div style={{ textAlign:'center', color:'#9ca3af', padding:24, fontSize:11 }}>
              ✅ Nenhuma aprovação pendente.
            </div>
          )}
          {lista.map(a => (
            <div key={a.id} style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:8,
              padding:'10px 14px', marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:11, color:'#1e293b', marginBottom:4 }}>
                {a.cotacao_nome || a.numero_cotacao || a.cotacao_id}
              </div>
              <div style={{ fontSize:10, color:'#475569', marginBottom:6 }}>
                Desconto solicitado: <strong style={{ color:'#dc2626' }}>{a.desconto_pct}%</strong>
                {' '}por <strong>{a.solicitado_por}</strong>
                {' '}· {new Date(a.solicitado_em).toLocaleString('pt-BR')}
              </div>
              {a.motivo && <div style={{ fontSize:9, color:'#374151', marginBottom:8 }}>Motivo: {a.motivo}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => responder(a, 'aprovado')}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 16px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  ✅ Aprovar
                </button>
                <button onClick={() => responder(a, 'rejeitado')}
                  style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  ❌ Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: Combinar múltiplas formações em uma proposta ─────────────────────
function ModalCombinarPropostas({ cotacoes, currentUser, onClose, onSalvo }) {
  const [nome,     setNome]     = useState(`Proposta Combinada — ${new Date().toLocaleDateString('pt-BR')}`);
  const [desconto, setDesconto] = useState(0);
  const [salvando, setSalvando] = useState(false);

  // Agrega todos os itens de todas as cotações selecionadas (apenas produtos)
  const todosItens = cotacoes.flatMap(c => (c.itens || []).map(it => ({ ...it, _origem_cotacao: c.numero_cotacao || c.id })));
  const todosResults = cotacoes.flatMap(c => {
    const prms = c.parametros_globais || {};
    return (c.itens || []).map(it => calcItem(it, prms));
  });
  const totalBruto = todosResults.reduce((s, r) => s + r.valorTotal, 0);
  const totalImpostos = todosResults.reduce((s, r) => s + r.totalImposto, 0);
  const descVal = totalBruto * (desconto / 100);
  const totalLiquido = totalBruto - descVal;

  const salvar = async () => {
    if (!nome.trim()) { alert('Informe o nome da proposta.'); return; }
    setSalvando(true);
    // Salva proposta combinada no primeiro cotação como referência, ou como avulsa
    const { error } = await supabase.from('cotacoes_propostas').insert([{
      cotacao_id:          cotacoes[0].id,
      nome_proposta:       nome.trim(),
      desconto_pct:        desconto,
      valor_total:         totalBruto,
      valor_com_desconto:  totalLiquido,
      criado_por:          currentUser?.email,
      observacoes:         `Proposta combinada de ${cotacoes.length} formações: ${cotacoes.map(c=>c.numero_cotacao||c.nome).join(', ')}`,
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    alert('✅ Proposta combinada salva!');
    onSalvo();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:10, width:'min(720px,96vw)', maxHeight:'88vh',
        overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,.25)', display:'flex', flexDirection:'column' }}>
        <div style={{ background:'#7c3aed', color:'#fff', padding:'14px 18px', borderRadius:'10px 10px 0 0',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:14 }}>🔗 Combinar Formações em Proposta</div>
            <div style={{ fontSize:10, opacity:.85 }}>{cotacoes.length} formações selecionadas (apenas produtos)</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:14 }}>
          {/* Resumo das formações */}
          <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:700, fontSize:10, color:'#6d28d9', marginBottom:8 }}>📦 Formações incluídas</div>
            {cotacoes.map(c => {
              const prms = c.parametros_globais || {};
              const res  = (c.itens||[]).map(it => calcItem(it, prms));
              const tot  = res.reduce((s,r)=>s+r.valorTotal,0);
              return (
                <div key={c.id} style={{ display:'flex', justifyContent:'space-between', fontSize:10, padding:'4px 0',
                  borderBottom:'1px solid #ede9fe' }}>
                  <span style={{ fontWeight:600 }}>{c.numero_cotacao || '—'} · {c.nome}</span>
                  <span style={{ color:'#15803d', fontWeight:700 }}>{fmtR(tot)}</span>
                </div>
              );
            })}
          </div>

          {/* Nome da proposta */}
          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:4 }}>
              NOME DA PROPOSTA COMBINADA
            </label>
            <input value={nome} onChange={e=>setNome(e.target.value)}
              style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:6, padding:'8px 10px', fontSize:11 }} />
          </div>

          {/* Desconto */}
          <div>
            <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#6b7280', marginBottom:4 }}>
              DESCONTO GLOBAL %
            </label>
            <input type="number" min={0} max={100} step="0.5" value={desconto}
              onChange={e=>setDesconto(parseFloat(e.target.value)||0)}
              style={{ width:100, border:'1px solid #d1d5db', borderRadius:6, padding:'8px 10px', fontSize:11 }} />
          </div>

          {/* Resumo financeiro */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px',
            display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#6b7280' }}>Total Bruto</div>
              <div style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>{fmtR(totalBruto)}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#6b7280' }}>Impostos ({((totalImpostos/totalBruto)*100||0).toFixed(1)}%)</div>
              <div style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>{fmtR(totalImpostos)}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#6b7280' }}>Líquido c/ {desconto}% desc.</div>
              <div style={{ fontWeight:800, fontSize:14, color:'#15803d' }}>{fmtR(totalLiquido)}</div>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button onClick={onClose}
              style={{ padding:'8px 18px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff',
                fontSize:11, cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              style={{ padding:'8px 22px', background:'#7c3aed', color:'#fff', border:'none',
                borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer', opacity: salvando ? .6 : 1 }}>
              {salvando ? 'Salvando...' : '💾 Salvar Proposta Combinada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nova Cotação a partir do Catálogo de Produtos ────────────────────
function ModalNovaCotacao({ currentUser, onClose, onSalvo }) {
  const [nomeCliente,  setNomeCliente]  = useState('');
  const [opNumero,     setOpNumero]     = useState('');
  const [busca,        setBusca]        = useState('');
  const [resultados,   setResultados]   = useState([]);
  const [selecionados, setSelecionados] = useState([]); // {produto, qt}
  const [salvando,     setSalvando]     = useState(false);
  const busRef = useRef(null);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    clearTimeout(busRef.current);
    busRef.current = setTimeout(async () => {
      const { data } = await supabase.from('cadastro_produtos')
        .select('id,codigo,nome,unidade,preco_venda,markup_pct,difal_pct,imposto_pct,custo_fixo_pct,fotos,catalogo_url,garantia_meses')
        .eq('ativo', true)
        .ilike('nome', `%${busca.trim()}%`)
        .limit(10);
      setResultados(data || []);
    }, 250);
    return () => clearTimeout(busRef.current);
  }, [busca]);

  const addProduto = (prod) => {
    if (selecionados.find(s => s.produto.id === prod.id)) return;
    setSelecionados(prev => [...prev, { produto: prod, qt: 1 }]);
    setBusca('');
    setResultados([]);
  };

  const removeItem = (id) => setSelecionados(prev => prev.filter(s => s.produto.id !== id));
  const setQt = (id, qt) =>
    setSelecionados(prev => prev.map(s => s.produto.id === id ? { ...s, qt: Math.max(1, Number(qt)||1) } : s));

  const salvar = async () => {
    if (!nomeCliente.trim() || selecionados.length === 0) return;
    setSalvando(true);

    // Para cada produto, busca custo do BOM
    const itensComCusto = await Promise.all(selecionados.map(async ({ produto, qt }) => {
      const { data: bom } = await supabase
        .from('cadastro_produtos_itens')
        .select('quantidade, cadastro_itens(custo_unit, ipi_pct, st_pct)')
        .eq('produto_id', produto.id);
      const custoUnit = (bom || []).reduce((acc, l) => {
        const item = l.cadastro_itens || {};
        const cu = Number(item.custo_unit) || 0;
        const cu_c = cu * (1 + (Number(item.ipi_pct)||0)/100) * (1 + (Number(item.st_pct)||0)/100);
        return acc + cu_c * (Number(l.quantidade)||1);
      }, 0);
      return {
        produto:        produto.nome,
        produto_id:     produto.id,
        codigo:         produto.codigo || '',
        qt,
        unidade:        produto.unidade || 'UN',
        custo_unit:     custoUnit,
        ipi_pct:        0,
        st_pct:         0,
        markup_pct:     Number(produto.markup_pct) || 30,
        difal_pct:      Number(produto.difal_pct) || 16,
        imposto_pct:    Number(produto.imposto_pct) || 16,
        custo_fixo_pct: Number(produto.custo_fixo_pct) || 3,
        moeda:          'REAL',
        fotos:          produto.fotos || [],
        catalogo_url:   produto.catalogo_url || null,
        garantia_meses: produto.garantia_meses || 12,
      };
    }));

    const now = new Date();
    const nn = `COT-${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;

    const { error } = await supabase.from('cotacoes_precos').insert([{
      numero_cotacao:     nn,
      nome:               `${nomeCliente.trim()} — ${selecionados.map(s=>s.produto.nome).join(', ')}`,
      tipo:               'Produto',
      empresa:            'ACN',
      status:             'rascunho',
      itens:              itensComCusto,
      parametros_globais: { ptax_dolar: 5.85, ptax_euro: 6.40 },
      desconto_maximo_pct: 10,
      opl_numero:         opNumero.trim() || null,
      orgao_cliente:      nomeCliente.trim(),
      criado_por:         currentUser?.email,
    }]);

    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSalvo();
    onClose();
  };

  const prms = { ptax_dolar: 5.85, ptax_euro: 6.40 };

  const inp: React.CSSProperties = {
    width:'100%', border:'1px solid #d1d5db', borderRadius:6, padding:'7px 10px', fontSize:11, boxSizing:'border-box',
  };
  const lbl: React.CSSProperties = { display:'block', fontSize:9, fontWeight:700, color:'#64748b', marginBottom:4 };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2500,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:'min(660px,95vw)', maxHeight:'88vh',
        boxShadow:'0 8px 32px rgba(0,0,0,.3)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        <div style={{ background:'#0f766e', color:'#fff', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:13 }}>📋 Nova Cotação — Catálogo de Produtos</div>
            <div style={{ fontSize:9, opacity:.85, marginTop:1 }}>Selecione produtos do catálogo configurado</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:16, flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12 }}>
          {/* Dados da cotação */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={lbl}>CLIENTE / ÓRGÃO *</label>
              <input value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)}
                placeholder="Nome do cliente..." style={inp} />
            </div>
            <div>
              <label style={lbl}>OP/OS (opcional)</label>
              <input value={opNumero} onChange={e=>setOpNumero(e.target.value)}
                placeholder="Ex: 1212.2608" style={inp} />
            </div>
          </div>

          {/* Busca de produtos */}
          <div style={{ position:'relative' }}>
            <label style={lbl}>🔍 BUSCAR PRODUTO DO CATÁLOGO</label>
            <input value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Digite o nome do produto..."
              style={inp} />
            {resultados.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff',
                border:'1px solid #e2e8f0', borderRadius:6, boxShadow:'0 8px 24px rgba(0,0,0,.15)',
                zIndex:10, maxHeight:220, overflowY:'auto' }}>
                {resultados.map(p => (
                  <div key={p.id} onClick={() => addProduto(p)}
                    style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                    onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:11 }}>{p.nome}</div>
                      <div style={{ fontSize:9, color:'#9ca3af' }}>
                        {p.codigo ? `${p.codigo} · ` : ''}{p.unidade} · Garantia: {p.garantia_meses}m
                      </div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#15803d', whiteSpace:'nowrap', marginLeft:12 }}>
                      {p.preco_venda ? `R$ ${Number(p.preco_venda).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Produtos selecionados */}
          {selecionados.length > 0 && (
            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
              <div style={{ background:'#1e293b', color:'#cbd5e1', padding:'6px 10px', fontSize:9, fontWeight:700 }}>
                📦 PRODUTOS SELECIONADOS ({selecionados.length})
              </div>
              {selecionados.map(({ produto, qt }) => (
                <div key={produto.id} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'8px 10px', borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:11 }}>{produto.nome}</div>
                    <div style={{ fontSize:9, color:'#9ca3af' }}>
                      {produto.unidade} · markup {produto.markup_pct}% · garantia {produto.garantia_meses}m
                      {Array.isArray(produto.fotos) && produto.fotos.length > 0 && ` · 📸 ${produto.fotos.length} foto(s)`}
                      {produto.catalogo_url && ' · 📄 catálogo'}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <label style={{ fontSize:9, color:'#64748b' }}>Qtd:</label>
                    <input type="number" min={1} value={qt} onChange={e=>setQt(produto.id, e.target.value)}
                      style={{ width:60, border:'1px solid #d1d5db', borderRadius:4, padding:'4px 6px', fontSize:11, textAlign:'right' }} />
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#15803d', minWidth:80, textAlign:'right' }}>
                    {produto.preco_venda
                      ? `R$ ${(Number(produto.preco_venda)*qt).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
                      : '—'}
                  </div>
                  <button onClick={() => removeItem(produto.id)}
                    style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:14 }}>✕</button>
                </div>
              ))}
              <div style={{ padding:'8px 10px', background:'#f0fdf4', display:'flex', justifyContent:'flex-end' }}>
                <div style={{ fontWeight:800, fontSize:12, color:'#15803d' }}>
                  Total estimado: R$ {selecionados.reduce((acc, {produto, qt}) => acc + (Number(produto.preco_venda)||0)*qt, 0)
                    .toLocaleString('pt-BR',{minimumFractionDigits:2})}
                </div>
              </div>
            </div>
          )}

          {selecionados.length === 0 && (
            <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11,
              border:'2px dashed #e2e8f0', borderRadius:8, fontStyle:'italic' }}>
              Nenhum produto selecionado. Busque acima para adicionar.
            </div>
          )}
        </div>

        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0, background:'#fafafa' }}>
          <button onClick={onClose}
            style={{ padding:'7px 18px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar}
            disabled={salvando || !nomeCliente.trim() || selecionados.length === 0}
            style={{ padding:'7px 22px', background: (!nomeCliente.trim()||selecionados.length===0) ? '#9ca3af' : '#0f766e',
              color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11,
              cursor: (!nomeCliente.trim()||selecionados.length===0) ? 'not-allowed' : 'pointer',
              opacity: salvando ? .6 : 1 }}>
            {salvando ? 'Criando...' : '✅ Criar Cotação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN: CotacoesTab ────────────────────────────────────────────────────────
export default function CotacoesTab({ currentUser, onAbrirCrmCard }) {
  const [cotacoes,    setCotacoes]    = useState([]);
  const [carregando,  setCarregando]  = useState(true);
  const [busca,       setBusca]       = useState('');
  const [filtroStatus,setFiltroStatus]= useState('');
  const [abaLista,    setAbaLista]    = useState('todas'); // 'todas' | 'avulsas'
  const [modalDetalhe,setModalDetalhe]= useState(null);
  const [modalDesc,   setModalDesc]   = useState(null);
  const [modalAprovs, setModalAprovs] = useState(false);
  const [pendCount,   setPendCount]   = useState(0);
  const [simplificada, setSimplificada] = useState(false);
  const [selecionadas,  setSelecionadas]  = useState<string[]>([]);
  const [modalCombinar, setModalCombinar] = useState(false);
  const [modalNovaCotacao, setModalNovaCotacao] = useState(false);

  // Visibilidade controlada pelo admin
  const [cfg, setCfg] = useState({
    verCustos:  false,
    verFornec:  false,
    verMarkup:  false,
  });

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);
  const isVendedor = !isAdmin;

  // Carregar configurações de visibilidade
  const carregarConfig = useCallback(async () => {
    const { data } = await supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['cotacoes_ver_custos_margens','cotacoes_ver_fornecedores','cotacoes_ver_markup']);
    if (data) {
      const m = Object.fromEntries(data.map(r => [r.chave, r.valor === 'true']));
      // Respeita o config para TODOS — admin controla via painel, não por perfil
      setCfg({
        verCustos: m['cotacoes_ver_custos_margens'] || false,
        verFornec: m['cotacoes_ver_fornecedores']   || false,
        verMarkup: m['cotacoes_ver_markup']         || false,
      });
    } else {
      // Se tabela não existe ainda, ninguém vê dados sensíveis
      setCfg({ verCustos: false, verFornec: false, verMarkup: false });
    }
  }, [isAdmin]);

  const carregarCotacoes = useCallback(async () => {
    setCarregando(true);
    let q = supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    // Vendedores só veem cotações ativas ou acima de rascunho
    if (isVendedor) {
      q = q.neq('status', 'rascunho');
    }
    const { data } = await q;
    setCotacoes(data || []);
    setCarregando(false);
  }, [isVendedor]);

  const carregarPendentes = useCallback(async () => {
    if (!isAdmin) return;
    const { count } = await supabase.from('cotacoes_aprovacoes')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    setPendCount(count || 0);
  }, [isAdmin]);

  useEffect(() => {
    carregarConfig();
    carregarCotacoes();
    carregarPendentes();
  }, [carregarConfig, carregarCotacoes, carregarPendentes]);

  const cotacoesFiltradas = cotacoes.filter(c => {
    const ok_busca = !busca ||
      (c.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.numero_cotacao || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.opl_numero || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.criado_por || '').toLowerCase().includes(busca.toLowerCase());
    const ok_status = !filtroStatus || c.status === filtroStatus;
    const ok_aba    = abaLista === 'todas' || !c.crm_oportunidade_id;
    return ok_busca && ok_status && ok_aba;
  });

  const qtdAvulsas = cotacoes.filter(c => !c.crm_oportunidade_id).length;

  const statusOpcoes = [...new Set(cotacoes.map(c => c.status).filter(Boolean))];

  return (
    <div style={{ padding:'0 0 24px', fontFamily:'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>📋 Cotações</div>
            <div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>
              {cotacoesFiltradas.length} cotação(ões) · {cotacoes.filter(c=>c.status==='ativa').length} ativas
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {isAdmin && pendCount > 0 && (
              <button onClick={() => setModalAprovs(true)}
                style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:5,
                  padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:5 }}>
                ⏳ Aprovações Pendentes
                <span style={{ background:'#fff', color:'#dc2626', borderRadius:10, padding:'0 5px', fontSize:9, fontWeight:800 }}>
                  {pendCount}
                </span>
              </button>
            )}
            {selecionadas.length >= 2 && (
              <button onClick={() => setModalCombinar(true)}
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:5,
                  padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                🔗 Combinar em Proposta ({selecionadas.length})
              </button>
            )}
            <button onClick={() => setSimplificada(v => !v)}
              style={{ background: simplificada ? '#0369a1' : '#f1f5f9',
                border: simplificada ? 'none' : '1px solid #e2e8f0', borderRadius:5,
                padding:'6px 12px', fontSize:9,
                color: simplificada ? '#fff' : '#475569', cursor:'pointer', fontWeight:700 }}>
              {simplificada ? '📋 Completo' : '📊 Simplificado'}
            </button>
            <button onClick={() => setModalNovaCotacao(true)}
              style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:5,
                padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              ➕ Nova Cotação
            </button>
            <button onClick={() => { carregarCotacoes(); carregarPendentes(); }}
              style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:5,
                padding:'6px 12px', fontSize:9, color:'#475569', cursor:'pointer' }}>
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Tabs: Todas / Avulsas */}
        <div style={{ marginTop:12, display:'flex', gap:0, borderBottom:'2px solid #e2e8f0' }}>
          {[
            { id:'todas',   label:'📋 Todas',  count: cotacoes.length },
            { id:'avulsas', label:'📁 Avulsas', count: qtdAvulsas,
              title:'Cotações sem vínculo com oportunidade CRM' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setAbaLista(tab.id)} title={tab.title}
              style={{ background:'none', border:'none', borderBottom: abaLista===tab.id
                ? '2px solid #0369a1' : '2px solid transparent',
                marginBottom:-2, padding:'7px 16px', fontSize:10, fontWeight:700, cursor:'pointer',
                color: abaLista===tab.id ? '#0369a1' : '#64748b',
                display:'flex', alignItems:'center', gap:5 }}>
              {tab.label}
              <span style={{ background: abaLista===tab.id ? '#0369a1' : '#e2e8f0',
                color: abaLista===tab.id ? '#fff' : '#64748b',
                borderRadius:10, padding:'0 6px', fontSize:9, fontWeight:800 }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, número, OP..."
            style={{ flex:'1 1 220px', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 10px',
              fontSize:10, outline:'none' }} />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ border:'1px solid #d1d5db', borderRadius:5, padding:'6px 10px', fontSize:10 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CORES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso de campos ocultos */}
      {isVendedor && (!cfg.verCustos || !cfg.verFornec || !cfg.verMarkup) && (
        <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:6,
          padding:'8px 12px', marginBottom:10, fontSize:9, color:'#78350f' }}>
          ℹ️ Alguns campos desta cotação estão ocultos por configuração do administrador.
        </div>
      )}

      {/* Tabela */}
      {carregando ? (
        <div style={{ textAlign:'center', padding:32, color:'#9ca3af' }}>Carregando...</div>
      ) : cotacoesFiltradas.length === 0 ? (
        <div style={{ textAlign:'center', padding:32, color:'#9ca3af', fontSize:11 }}>
          Nenhuma cotação encontrada.
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'#1e293b', color:'#cbd5e1' }}>
                  <th style={{ padding:'8px 6px', width:28 }}>
                    <input type="checkbox"
                      checked={selecionadas.length === cotacoesFiltradas.length && cotacoesFiltradas.length > 0}
                      onChange={e => setSelecionadas(e.target.checked ? cotacoesFiltradas.map(c=>c.id) : [])}
                      style={{ accentColor:'#7c3aed' }} />
                  </th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Número</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Nome</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Status</th>
                  {!simplificada && <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Tipo</th>}
                  {!simplificada && <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Empresa</th>}
                  {!simplificada && <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>OP</th>}
                  <th style={{ padding:'8px 10px', textAlign:'right', fontWeight:600 }}>Valor Total</th>
                  <th style={{ padding:'8px 10px', textAlign:'right', fontWeight:600 }}>% Impostos</th>
                  {!simplificada && <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Criado em</th>}
                  <th style={{ padding:'8px 10px', textAlign:'center', fontWeight:600 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {cotacoesFiltradas.map((c, i) => {
                  const itens   = c.itens || [];
                  const prms    = c.parametros_globais || {};
                  const results = itens.map(it => calcItem(it, prms));
                  const totVendas  = results.reduce((s, r) => s + r.valorTotal, 0);
                  const totImposto = results.reduce((s, r) => s + r.totalImposto, 0);
                  const impostoPct = totVendas > 0 ? (totImposto / totVendas * 100) : (prms.imposto_pct || 0);
                  const sel = selecionadas.includes(c.id);

                  return (
                    <tr key={c.id} style={{ background: sel ? '#f5f3ff' : i%2===0?'#fff':'#f8fafc',
                      cursor:'pointer', transition:'background .1s' }}
                      onMouseEnter={e => { if(!sel) e.currentTarget.style.background='#f0fdf4'; }}
                      onMouseLeave={e => { if(!sel) e.currentTarget.style.background=i%2===0?'#fff':'#f8fafc'; }}>
                      <td style={{ padding:'7px 6px', textAlign:'center' }}>
                        <input type="checkbox" checked={sel}
                          onChange={e => setSelecionadas(p => e.target.checked ? [...p, c.id] : p.filter(x=>x!==c.id))}
                          style={{ accentColor:'#7c3aed' }} />
                      </td>
                      <td style={{ padding:'7px 10px', fontWeight:700, color:'#0369a1' }}>
                        {c.crm_oportunidade_id && onAbrirCrmCard ? (
                          <button onClick={() => onAbrirCrmCard(c.crm_oportunidade_id)}
                            style={{ background:'none', border:'none', color:'#0369a1', cursor:'pointer',
                              fontWeight:700, fontSize:10, padding:0, textDecoration:'underline' }}>
                            {c.numero_cotacao || '—'}
                          </button>
                        ) : (
                          <span>{c.numero_cotacao || '—'}</span>
                        )}
                      </td>
                      <td style={{ padding:'7px 10px', maxWidth:200, wordBreak:'break-word' }}>
                        <div style={{ fontWeight:600, color:'#1e293b' }}>{c.nome}</div>
                        {!simplificada && c.criado_por && <div style={{ fontSize:8, color:'#9ca3af' }}>{c.criado_por}</div>}
                      </td>
                      <td style={{ padding:'7px 10px' }}><StatusBadge status={c.status} /></td>
                      {!simplificada && <td style={{ padding:'7px 10px', color:'#475569' }}>{c.tipo || '—'}</td>}
                      {!simplificada && <td style={{ padding:'7px 10px', color:'#475569' }}>{c.empresa || '—'}</td>}
                      {!simplificada && <td style={{ padding:'7px 10px' }}>
                        {c.opl_numero
                          ? <span style={{ fontWeight:700, color:'#16a34a' }}>🔗 {c.opl_numero}</span>
                          : <span style={{ color:'#9ca3af', fontSize:9 }}>—</span>}
                      </td>}
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#15803d' }}>
                        {totVendas > 0 ? fmtR(totVendas) : '—'}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#dc2626', fontWeight:600 }}>
                        {impostoPct > 0 ? `${impostoPct.toFixed(1)}%` : '—'}
                      </td>
                      {!simplificada && <td style={{ padding:'7px 10px', color:'#6b7280', fontSize:9 }}>
                        {c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '—'}
                      </td>}
                      <td style={{ padding:'7px 10px', textAlign:'center' }}>
                        <button onClick={() => setModalDetalhe(c)}
                          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
                            padding:'4px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalDetalhe && (
        <ModalDetalhe
          cotacao={modalDetalhe}
          currentUser={currentUser}
          verCustos={cfg.verCustos}
          verFornec={cfg.verFornec}
          verMarkup={cfg.verMarkup}
          onClose={() => setModalDetalhe(null)}
          onAbrirDesconto={() => { setModalDesc(modalDetalhe); setModalDetalhe(null); }}
          onOpenCrm={(opId) => {
            setModalDetalhe(null);
            onAbrirCrmCard && onAbrirCrmCard(opId);
          }}
          recarregar={() => carregarCotacoes()}
        />
      )}

      {modalDesc && (
        <ModalDesconto
          cotacao={modalDesc}
          currentUser={currentUser}
          verCustos={cfg.verCustos}
          verMarkup={cfg.verMarkup}
          onClose={() => setModalDesc(null)}
          onSalvo={() => { carregarCotacoes(); carregarPendentes(); }}
        />
      )}

      {modalAprovs && (
        <PainelAprovacoes
          currentUser={currentUser}
          onClose={() => { setModalAprovs(false); carregarPendentes(); carregarCotacoes(); }}
        />
      )}

      {modalCombinar && selecionadas.length >= 2 && (
        <ModalCombinarPropostas
          cotacoes={cotacoes.filter(c => selecionadas.includes(c.id))}
          currentUser={currentUser}
          onClose={() => setModalCombinar(false)}
          onSalvo={() => { setSelecionadas([]); carregarCotacoes(); }}
        />
      )}

      {modalNovaCotacao && (
        <ModalNovaCotacao
          currentUser={currentUser}
          onClose={() => setModalNovaCotacao(false)}
          onSalvo={() => { setModalNovaCotacao(false); carregarCotacoes(); }}
        />
      )}
    </div>
  );
}

// ─── Componente embutido para uso dentro do card CRM ─────────────────────────
export function CotacoesCrmPanel({ oportunidadeId, currentUser, verCustos, verFornec, verMarkup }) {
  const [cotacoes,   setCotacoes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modalDesc,  setModalDesc]  = useState(null);

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('cotacoes_precos').select('*')
      .eq('crm_oportunidade_id', oportunidadeId)
      .order('criado_em', { ascending: false });
    setCotacoes(data || []);
    setLoading(false);
  }, [oportunidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div style={{ color:'#9ca3af', fontSize:10, padding:10 }}>Carregando cotações...</div>;

  if (cotacoes.length === 0) return (
    <div style={{ textAlign:'center', color:'#9ca3af', padding:24, fontSize:10 }}>
      Nenhuma cotação vinculada a este card.
    </div>
  );

  return (
    <div>
      {cotacoes.map(c => {
        const itens = c.itens || [];
        const prms  = c.parametros_globais || {};
        const results = itens.map(it => calcItem(it, prms));
        const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);
        const totCusto  = results.reduce((s, r) => s + r.custoTotal, 0);
        return (
          <div key={c.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8,
            padding:'10px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <div>
                <span style={{ fontWeight:700, color:'#0369a1', fontSize:10, marginRight:8 }}>
                  {c.numero_cotacao || '—'}
                </span>
                <StatusBadge status={c.status} />
                <div style={{ fontSize:10, fontWeight:600, color:'#1e293b', marginTop:3 }}>{c.nome}</div>
                <div style={{ fontSize:9, color:'#6b7280' }}>
                  {c.tipo} · {c.empresa}
                  {c.opl_numero ? ` · OP: ${c.opl_numero}` : ''}
                  {` · Criado: ${c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—'}`}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#15803d' }}>{fmtR(totVendas)}</div>
                {verCustos && <div style={{ fontSize:9, color:'#92400e' }}>Custo: {fmtR(totCusto)}</div>}
              </div>
            </div>

            {/* Itens resumidos */}
            {itens.length > 0 && (
              <div style={{ overflowX:'auto', marginBottom:8 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
                  <thead>
                    <tr style={{ background:'#f1f5f9' }}>
                      <th style={{ padding:'3px 6px', textAlign:'left', fontWeight:600 }}>Item</th>
                      <th style={{ padding:'3px 6px', textAlign:'center' }}>Qt</th>
                      {verFornec && <th style={{ padding:'3px 6px', textAlign:'left' }}>Fornecedor</th>}
                      {verMarkup && <th style={{ padding:'3px 6px', textAlign:'right' }}>Markup</th>}
                      {verCustos && <th style={{ padding:'3px 6px', textAlign:'right' }}>Custo</th>}
                      <th style={{ padding:'3px 6px', textAlign:'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.slice(0, 5).map((it, i) => {
                      const r = results[i] || {};
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'3px 6px', color:'#374151' }}>{it.produto || '—'}</td>
                          <td style={{ padding:'3px 6px', textAlign:'center' }}>{it.qt || 1}</td>
                          {verFornec && <td style={{ padding:'3px 6px', color:'#475569' }}>{it.fornecedor||'—'}</td>}
                          {verMarkup && <td style={{ padding:'3px 6px', textAlign:'right', color:'#6d28d9' }}>{fmtPct(it.markup_pct)}</td>}
                          {verCustos && <td style={{ padding:'3px 6px', textAlign:'right', color:'#92400e' }}>{fmtR(r.custoTotal)}</td>}
                          <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:600 }}>{fmtR(r.valorTotal)}</td>
                        </tr>
                      );
                    })}
                    {itens.length > 5 && (
                      <tr><td colSpan={5} style={{ padding:'3px 6px', color:'#9ca3af', fontStyle:'italic' }}>
                        + {itens.length - 5} itens adicionais...
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setModalDesc(c)}
              style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:4,
                padding:'4px 12px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              💰 Gerar Proposta
            </button>
          </div>
        );
      })}

      {modalDesc && (
        <ModalDesconto
          cotacao={modalDesc}
          currentUser={currentUser}
          verCustos={verCustos}
          verMarkup={verMarkup}
          onClose={() => setModalDesc(null)}
          onSalvo={() => carregar()}
        />
      )}
    </div>
  );
}
