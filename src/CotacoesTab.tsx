// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { combinaBusca, buscarPorPalavras } from './SearchUtils';
import { estruturaFormacao } from './FormacaoCalculo';
import { pedirTexto } from './Feedback';
import { Faixa, Botao, Selo, Abas, CabecalhoTela } from './Interface';
import Icone from './Icone';
import { mdiTimerSand, mdiLinkVariant, mdiFormatListBulleted, mdiChartBar, mdiPlus, mdiRefresh, mdiFolderOutline, mdiCashMultiple,
  mdiBankOutline, mdiClose, mdiCheckCircleOutline, mdiCloseCircleOutline, mdiCheck, mdiFileDocumentOutline, mdiSendOutline, mdiContentSaveOutline,
  mdiWeb, mdiPrinterOutline, mdiCameraOutline, mdiEmailOutline, mdiWhatsapp, mdiPackageVariantClosed, mdiMagnify } from '@mdi/js';
import { perfilComPoderes } from './utils/permissoes';

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

// ─── Visibilidade por setor (pedido do usuário em 24/09/2026) ─────────────────
// setor da cotação: 'Comercial' | 'Licitações' | RESERVADO (só Admin/Gerente,
// até alguém liberar pra um setor) | null (cotação de antes dessa regra —
// vale pra todo mundo, igual sempre foi).
export const RESERVADO = 'reservado';
export const SETORES_COTACAO = ['Comercial', 'Licitações'];
const SETOR_POR_PERFIL = { 'Gerente Comercial': 'Comercial', 'Gerente de Licitações': 'Licitações' };
/** Setor "dono" de quem está logado, pra saber o que ele cria e o que ele vê.
 *  null = perfil sem setor natural aqui (Admin, Gerente genérico...). */
export function setorDoUsuario(perfil) {
  return SETOR_POR_PERFIL[perfil] || (SETORES_COTACAO.includes(perfil) ? perfil : null);
}

const STATUS_CORES = {
  rascunho:          { label:'Rascunho' },
  ativa:             { label:'Ativa' },
  aprovada:          { label:'Aprovada' },
  proposta_gerada:   { label:'Proposta Gerada' },
  vinculada:         { label:'Vinculada' },
  cancelada:         { label:'Cancelada' },
};
// a cor de cada status vem da família do guia (Etapa 12e28, 07/10/2026)
const FAMILIA_COTACAO = { rascunho:'neutro', ativa:'info', aprovada:'ok', proposta_gerada:'atencao', vinculada:'marca', cancelada:'erro' };

function StatusBadge({ status }) {
  const cfg = STATUS_CORES[status] || { label: status || '—' };
  return <Selo familia={FAMILIA_COTACAO[status] || 'neutro'} ponto={false}>{cfg.label}</Selo>;
}

// ─── Modal de Desconto / Proposta ────────────────────────────────────────────
// ─── GERADOR DE HTML DA PROPOSTA FINAL ───────────────────────────────────────
function gerarPropostaHTML(cotacao, proposta, { orgaoCliente, validade, refPv, formato, prazoEntrega, incluirFotos = true, descricaoServico }) {
  const prms     = cotacao.parametros_globais || {};
  const itens    = cotacao.itens || [];
  const results  = itens.map(it => calcItem(it, prms));
  // total já × quantidade do item/subgrupo (produto = 1 unidade) — FormacaoCalculo.ts
  const totalBruto = estruturaFormacao(itens, prms, calcItem).geral.totVendas;
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
      <img src="${apl}logo.svg" alt="${empresa}" onerror="this.style.display='none'" />
    </div>
    <div class="header-info">
      <h1>PROPOSTA COMERCIAL</h1>
      <p>Nº ${cotacao.numero_cotacao || '—'} · ${dataHoje}</p>
      <p>${empresa}</p>
    </div>
  </div>

  <!-- DADOS DO CLIENTE -->
  <div class="bloco">
    <h2>Dados do Cliente</h2>
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
    <h2>Produtos e Serviços</h2>
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
      <p>Proposta válida por <strong>${validade || '30'} dias</strong> a partir de ${dataHoje}.</p>
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
      // Etapa 7.60 (07/10/2026): o erro era ignorado — a proposta saía com o prazo novo e o registro ficava com o antigo
      supabase.from('cotacoes_propostas').update({ prazo_entrega: prazoEntrega }).eq('id', proposta.id)
        .then(({ error }) => { if (error) alert('A proposta foi aberta, mas o novo prazo de entrega NÃO foi gravado (' + error.message + ').'); });
    }
    onClose();
  };

  const prms = cotacao.parametros_globais || {};
  const itens = cotacao.itens || [];
  // Sempre recalculado a partir dos itens atuais — ver mesmo comentário em gerarPropostaHTML.
  const totalLiq = estruturaFormacao(itens, prms, calcItem).geral.totVendas * (1 - (proposta?.desconto_pct || 0) / 100);

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

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-emitir">
      <div className="modal-box acn-modal-cadastro acn-cot-jan" role="dialog" aria-label="Emitir Proposta Final ao Cliente">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiFileDocumentOutline} size={18} />Emitir Proposta Final ao Cliente</span>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div>
            <label className="acn-label">ÓRGÃO / CLIENTE</label>
            <input className="acn-input" value={orgaoCliente} onChange={e=>setOrgaoCliente(e.target.value)}
              placeholder="Nome do órgão ou cliente..." />
          </div>
          <div>
            <label className="acn-label">
              DESCRIÇÃO DO SERVIÇO/PRODUTO (como aparece na proposta)
            </label>
            <input className="acn-input" value={descricaoServico} onChange={e=>setDescricaoServico(e.target.value)}
              placeholder="Ex: Reforma cela PCSC Palhoça" />
          </div>
          <div className="acn-cot-grade2">
            <div>
              <label className="acn-label">VALIDADE (DIAS)</label>
              <input className="acn-input" type="number" min={1} value={validade} onChange={e=>setValidade(e.target.value)} />
            </div>
            <div>
              <label className="acn-label">REF. OP/OS/PV</label>
              <input className="acn-input" value={refPv} onChange={e=>setRefPv(e.target.value)}
                placeholder="Número da OP, OS ou PV..." />
            </div>
            <div>
              <label className="acn-label">PRAZO DE ENTREGA</label>
              <input className="acn-input" value={prazoEntrega} onChange={e=>setPrazoEntrega(e.target.value)}
                placeholder="Ex: 15 dias úteis" />
            </div>
          </div>

          <div>
            <label className="acn-label">FORMATO DE SAÍDA</label>
            <div className="acn-cot-formatos">
              {([['html','HTML', mdiWeb],['pdf','PDF', mdiPrinterOutline]] as const).map(([val,lbl,ic])=>(
                <label key={val} className={'acn-cot-formato' + (formato===val ? ' on' : '')}>
                  <input type="radio" name="formato" value={val} checked={formato===val}
                    onChange={()=>setFormato(val)} />
                  <Icone path={ic} size={16} /> {lbl}
                </label>
              ))}
            </div>
          </div>

          <label className="acn-cot-check">
            <input type="checkbox" checked={incluirFotos} onChange={e=>setIncluirFotos(e.target.checked)} />
            <Icone path={mdiCameraOutline} size={16} /> Incluir fotos do produto e link do catálogo na proposta
          </label>

          {/* Envio por e-mail */}
          <div className="acn-quadro tom-info">
            <div className="acn-quadro-titulo"><Icone path={mdiEmailOutline} size={14} /> Enviar por E-mail</div>
            <div className="acn-cot-envio">
              <input className="acn-input" value={emailCliente} onChange={e=>setEmailCliente(e.target.value)}
                placeholder="email@cliente.com.br" type="email" />
              <Botao variante="primario" onClick={enviarEmail}>
                Enviar
              </Botao>
            </div>
          </div>

          {/* Envio por WhatsApp */}
          <div className="acn-quadro tom-ok">
            <div className="acn-quadro-titulo"><Icone path={mdiWhatsapp} size={14} /> Enviar por WhatsApp</div>
            <div className="acn-cot-envio">
              <input className="acn-input" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)}
                placeholder="11999998888" type="tel" />
              <Botao variante="primario" onClick={enviarWhatsApp}>
                Enviar
              </Botao>
            </div>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone={formato === 'pdf' ? mdiPrinterOutline : mdiWeb} onClick={emitir}>
            {formato === 'pdf' ? 'Gerar PDF' : 'Gerar HTML'}
          </Botao>
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
  const emAcao = useRef(false);   // 7.60: o clique duplo gravava a proposta (ou o pedido de aprovação) duas vezes

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const { totVendas, totImposto } = estruturaFormacao(itens, prms, calcItem).geral;   // × quantidades
  const maxDesc    = Number(cotacao.desconto_maximo_pct) || 0;
  const valorDesc  = totVendas * desconto / 100;
  const valorFinal = totVendas - valorDesc;

  // Sem teto configurado (maxDesc <= 0) não significa "sem limite" — significa
  // que nenhum desconto tem aprovação automática, então qualquer desconto > 0
  // precisa passar por aprovação. Evita a brecha de dar até 50% de desconto
  // sem ninguém saber quando o campo "Desconto Máximo" nunca foi preenchido.
  const precisaAprovacao = desconto > 0 && (maxDesc <= 0 || desconto > maxDesc);

  const salvar = async () => {
    if (emAcao.current) return;
    emAcao.current = true;
    try { await salvarInterno(); } finally { emAcao.current = false; }
  };
  const salvarInterno = async () => {
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
      alert(`Solicitação de aprovação enviada! Desconto de ${desconto}% aguardando aprovação.`);
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
      const { error: erroStatus } = await supabase.from('cotacoes_precos').update({ status: 'proposta_gerada' }).eq('id', cotacao.id);
      // 7.60: o erro era ignorado e o aviso dizia só "Proposta salva!" com a cotação ainda no status antigo
      alert(erroStatus ? 'Proposta salva, mas o status da cotação NÃO foi atualizado para "Proposta Gerada" (' + erroStatus.message + ').' : 'Proposta salva!');
      onSalvo && onSalvo();
      onClose();
    }
    setSalvando(false);
  };

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-desc" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cot-jan acn-cot-pequena" role="dialog" aria-label="Gerar Proposta">
        <div className="acn-modal-cab">
          <div>
            <span className="modal-title"><Icone path={mdiFileDocumentOutline} size={18} />Gerar Proposta</span>
            <div className="acn-ajuda">{cotacao.numero_cotacao} · {cotacao.nome}</div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {/* Resumo de valor — valor de venda + impostos */}
          <div className="acn-quadro tom-info">
            <div className="acn-cot-linha-val">
              <span className="acn-ajuda">Valor de Venda</span>
              <span className="acn-cot-val-g">{fmtR(totVendas)}</span>
            </div>
            <div className="acn-cot-linha-val com-divisor">
              <span className="acn-ajuda">Impostos</span>
              <span className="acn-cot-val-m acn-txt-erro">{fmtR(totImposto)}</span>
            </div>
          </div>

          {/* Slider de desconto — limitado ao maxDesc configurado */}
          <div>
            <div className="acn-cot-linha-val">
              <span className="acn-label">Desconto (%)</span>
              <span className="acn-cot-desc-v">{desconto}%</span>
            </div>
            <input type="range" min={0}
              max={maxDesc > 0 ? maxDesc : 50}
              step={maxDesc > 0 ? Math.min(0.5, maxDesc / 10) : 0.5}
              value={desconto}
              onChange={e => setDesconto(Number(e.target.value))}
              className="acn-cot-range" />
            <div className="acn-cot-escala">
              <span>0%</span>
              {maxDesc > 0
                ? <><span>{(maxDesc / 2).toFixed(1)}%</span><span>{maxDesc}%</span></>
                : <><span>25%</span><span>50%</span></>}
            </div>
          </div>

          {/* Resultado */}
          <div className={'acn-quadro ' + (precisaAprovacao ? 'tom-erro' : 'tom-ok')}>
            <div className="acn-cot-linha-val">
              <span className="acn-ajuda">Desconto</span>
              <span className="acn-cot-val-m acn-txt-erro">- {fmtR(valorDesc)}</span>
            </div>
            <div className="acn-cot-linha-val">
              <span className="acn-cot-val-rot">Valor Final</span>
              <span className={'acn-cot-val-g ' + (precisaAprovacao ? 'acn-txt-erro' : 'acn-txt-ok')}>{fmtR(valorFinal)}</span>
            </div>
            {precisaAprovacao && (
              <Faixa tom="erro">
                Desconto acima do limite. Esta proposta precisará de <strong>aprovação do gestor</strong>.
              </Faixa>
            )}
          </div>

          <div>
            <label className="acn-label">
              Prazo de Entrega
            </label>
            <input className="acn-input" value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)}
              placeholder="Ex: 15 dias úteis" />
          </div>

          <div>
            <label className="acn-label">
              {precisaAprovacao ? 'Justificativa (obrigatória)' : 'Observações (opcional)'}
            </label>
            <textarea className="acn-input acn-cot-obs" value={obs} onChange={e => setObs(e.target.value)}
              placeholder={precisaAprovacao ? 'Explique o motivo do desconto extra...' : 'Observações para o cliente...'}
              rows={3} />
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>
            Cancelar
          </Botao>
          <Botao variante={precisaAprovacao ? 'perigo' : 'primario'} icone={precisaAprovacao ? mdiSendOutline : mdiContentSaveOutline}
            onClick={salvar} disabled={salvando || (precisaAprovacao && !obs.trim())}>
            {salvando ? 'Salvando...' : precisaAprovacao ? 'Enviar para Aprovação' : 'Gerar Proposta'}
          </Botao>
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
  const [erroLeitura, setErroLeitura] = useState('');   // 7.60: leitura que falha não pode parecer "sem propostas"
  const emAcaoRef = useRef(false);   // 7.60: vincular, desvincular e responder uma vez só (o clique duplo gravava duas vezes)

  const isAdmin  = ['Admin','Gerente','Gerente Comercial'].includes(perfilComPoderes(currentUser));
  // Aprovar cotação: só gerentes de verdade (a equipe comercial não aprova)
  const podeAprovar = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);

  useEffect(() => {
    supabase.from('cotacoes_propostas').select('*')
      .eq('cotacao_id', cotacao.id).order('criado_em', { ascending: false })
      .then(({ data, error }) => { if (error) setErroLeitura(error.message); else setPropostas(data || []); });
    supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false })
      .then(({ data, error }) => { if (error) setErroLeitura(error.message); else setAprovacoes(data || []); });
  }, [cotacao.id]);

  const umaVezDetalhe = async (fn: () => Promise<any>) => {
    if (emAcaoRef.current) return;
    emAcaoRef.current = true;
    try { return await fn(); } finally { emAcaoRef.current = false; }
  };

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

  const vincularOp = (op) => umaVezDetalhe(async () => {
    setVinculando(true);
    const novoRow = { opl_id: op.id, opl_numero: op.opl, status: 'vinculada' };
    const { error } = await supabase.from('cotacoes_precos').update(novoRow).eq('id', cotacao.id);
    // 7.60: o erro era ignorado — a janela fechava como se tivesse vinculado e o histórico de alterações registrava uma mudança que não houve
    if (error) { alert('Não foi possível vincular a OP: ' + error.message); setVinculando(false); return; }
    logChange({ module: 'cotacoes', entityType: 'cotacoes_precos', entityId: cotacao.id, changeType: 'UPDATE',
      oldRow: cotacao, newRow: { ...cotacao, ...novoRow }, user: currentUser });
    setOpBusca('');
    setOpOpts([]);
    setVinculando(false);
    recarregar && recarregar();
    onClose();
  });

  const desvincularOp = () => umaVezDetalhe(async () => {
    const { error } = await supabase.from('cotacoes_precos').update({ opl_id: null, opl_numero: null }).eq('id', cotacao.id);
    if (error) { alert('Não foi possível desvincular a OP: ' + error.message); return; }   // 7.60: o erro era ignorado
    recarregar && recarregar();
    onClose();
  });

  const aprovarSolicitacao = (aprov) => umaVezDetalhe(async () => {
    if (!podeAprovar) return;
    const resposta = await pedirTexto('Resposta (aprovado/rejeitado):');
    if (!resposta) return;
    const status = resposta.toLowerCase().includes('rej') ? 'rejeitado' : 'aprovado';
    const { error: erroAprov } = await supabase.from('cotacoes_aprovacoes').update({
      status, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(), resposta: resposta,
    }).eq('id', aprov.id);
    // 7.60: os dois passos ignoravam o erro — a tela seguia como se a resposta tivesse sido gravada
    if (erroAprov) { alert('Não foi possível registrar a resposta: ' + erroAprov.message); return; }
    if (status === 'aprovado') {
      const { error: erroCot } = await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', cotacao.id);
      if (erroCot) {
        // a aprovação não pode ficar "aprovada" com a cotação parada no status antigo: devolve a solicitação para pendente
        const { error: erroVolta } = await supabase.from('cotacoes_aprovacoes').update({ status: 'pendente', aprovado_por: null, aprovado_em: null, resposta: null }).eq('id', aprov.id);
        alert('Não foi possível aprovar a cotação (' + erroCot.message + ').' + (erroVolta
          ? '\n\nATENÇÃO: a solicitação ficou marcada como aprovada, mas a cotação não mudou de status. Avise o suporte para conferir.'
          : ' A solicitação voltou a ficar pendente.'));
      } else {
        logChange({ module: 'cotacoes', entityType: 'cotacoes_precos', entityId: cotacao.id, changeType: 'UPDATE',
          oldRow: cotacao, newRow: { ...cotacao, status: 'aprovada' }, user: currentUser });
      }
    }
    const { data, error: erroRelida } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false });
    if (erroRelida) setErroLeitura(erroRelida.message); else setAprovacoes(data || []);
    recarregar && recarregar();
  });

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const results   = itens.map(it => calcItem(it, prms));
  // Totais pela mesma estrutura da Formação de Preços (× quantidade do
  // item/subgrupo; produto = 1 unidade) — ver FormacaoCalculo.ts. A margem é a
  // real (já líquida de imposto e custo fixo), não apenas venda-custo.
  const geralF    = estruturaFormacao(itens, prms, calcItem).geral;
  const totVendas = geralF.totVendas;
  const totCusto  = geralF.totCustos;
  const totDifal  = geralF.totDifal;
  const margem    = geralF.totMargem;
  const margemPct = geralF.lucroPct;

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-det" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cot-jan acn-cot-det" role="dialog" aria-label="Detalhe da cotação">

        {/* Header */}
        <div className="acn-modal-cab acn-cot-det-cab">
          <div className="acn-cot-det-tit">
            <div className="acn-ajuda">
              COTAÇÃO · {cotacao.numero_cotacao || '—'}
            </div>
            <span className="modal-title">{cotacao.nome}</span>
            <div className="acn-cot-det-meta">
              <span>{cotacao.tipo} · {cotacao.empresa}</span>
              {cotacao.opl_numero && <span><Icone path={mdiLinkVariant} size={13} /> OP: {cotacao.opl_numero}</span>}
              {cotacao.crm_oportunidade_id && (
                <Botao variante="discreto" pequeno icone={mdiBankOutline} onClick={() => onOpenCrm && onOpenCrm(cotacao.crm_oportunidade_id)}>
                  Ver no CRM
                </Botao>
              )}
            </div>
          </div>
          <div className="acn-cot-det-lado">
            <StatusBadge status={cotacao.status} />
            <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
          </div>
        </div>

        <div className="acn-modal-corpo">

          {/* KPIs */}
          <div className={'acn-cot-kpis' + (verCustos ? ' tres' : '')}>
            <div className="acn-kpi">
              <span className="rot"><i data-acn-familia="ok" />PREÇO DE VENDA</span>
              <span className="acn-num acn-cot-kpi-v" data-acn-familia="ok">{fmtR(totVendas)}</span>
            </div>
            {verCustos && (
              <>
                <div className="acn-kpi">
                  <span className="rot"><i data-acn-familia="atencao" />CUSTO TOTAL</span>
                  <span className="acn-num acn-cot-kpi-v" data-acn-familia="atencao">{fmtR(totCusto)}</span>
                </div>
                <div className="acn-kpi">
                  <span className="rot"><i data-acn-familia="info" />MARGEM</span>
                  <span className="acn-num acn-cot-kpi-v" data-acn-familia="info">{fmtR(margem)} ({fmtPct(margemPct)})</span>
                </div>
              </>
            )}
          </div>

          {/* Tabela de itens */}
          <div className="acn-cot-tabela">
            <table className="acn-tabela acn-densa">
              <thead>
                <tr>
                  <th className="esq">Item</th>
                  <th className="centro">Qt</th>
                  {verFornec && <th className="esq">Fornecedor</th>}
                  {verFornec && <th className="esq">Marca</th>}
                  {verCustos && <th className="dir">Custo</th>}
                  {verMarkup && <th className="dir">Markup</th>}
                  <th className="dir">Preço Unit.</th>
                  <th className="dir">Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => {
                  const r = results[i];
                  return (
                    <tr key={i}>
                      <td className="acn-cot-nome">
                        <div className="acn-cot-nome-t">{it.produto || '—'}</div>
                        {it.unidade && <div className="acn-ajuda">{it.unidade}</div>}
                      </td>
                      <td className="centro">{it.qt || 1}</td>
                      {verFornec && <td>{it.fornecedor || '—'}</td>}
                      {verFornec && <td>{it.marca || '—'}</td>}
                      {verCustos && <td className="dir acn-txt-atencao">{fmtR(r.custoTotal)}</td>}
                      {verMarkup && <td className="dir">{fmtPct(it.markup_pct)}</td>}
                      <td className="dir acn-forte">{fmtR(r.valorUnit)}</td>
                      <td className="dir acn-forte acn-txt-ok">{fmtR(r.valorTotal)}</td>
                    </tr>
                  );
                })}
                <tr className="acn-linha-total">
                  <td colSpan={2 + (verFornec?2:0) + (verCustos?1:0) + (verMarkup?1:0)} className="dir">
                    TOTAL
                  </td>
                  <td className="dir">{fmtR(totVendas)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Vincular OP/OS */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo"><Icone path={mdiLinkVariant} size={14} /> Vincular OP/OS</div>
            {cotacao.opl_numero ? (
              <div className="acn-cot-opl-linha">
                <span className="acn-cot-opl"><Icone path={mdiCheckCircleOutline} size={14} /> OP Vinculada: {cotacao.opl_numero}</span>
                {isAdmin && (
                  <Botao variante="perigo-sec" pequeno onClick={desvincularOp}>
                    Desvincular
                  </Botao>
                )}
              </div>
            ) : (
              <div className="acn-cot-busca-op">
                <input className="acn-input" value={opBusca} onChange={e => buscarOp(e.target.value)}
                  placeholder="Buscar OP pelo número..." />
                {buscandoOp && <div className="acn-ajuda">Buscando...</div>}
                {opOpts.length > 0 && (
                  <div className="acn-cot-sug">
                    {opOpts.map(op => (
                      <div key={op.id} className="acn-cot-sug-item" onClick={() => vincularOp(op)}>
                        <span className="acn-cot-sug-opl">{op.opl}</span>
                        <span className="acn-ajuda">{op.cliente_nome}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {erroLeitura && (
            <Faixa tom="erro">Não foi possível ler as propostas e as solicitações de aprovação desta cotação ({erroLeitura}). Isso não quer dizer que não existam — o que aparece abaixo pode estar incompleto.</Faixa>
          )}

          {/* Histórico de aprovações */}
          {aprovacoes.length > 0 && (
            <div className="acn-cot-bloco">
              <div className="acn-quadro-titulo"><Icone path={mdiFormatListBulleted} size={14} /> Solicitações de Aprovação</div>
              {aprovacoes.map(a => (
                <div key={a.id} className="acn-cot-aprov" data-acn-familia={a.status==='aprovado' ? 'ok' : a.status==='rejeitado' ? 'erro' : 'atencao'}>
                  <div className="acn-cot-aprov-topo">
                    <span className="acn-cot-aprov-tit">
                      <Icone path={a.status==='aprovado' ? mdiCheckCircleOutline : a.status==='rejeitado' ? mdiCloseCircleOutline : mdiTimerSand} size={15} /> Desconto: {a.desconto_pct}%
                    </span>
                    <span className="acn-ajuda">{a.status}</span>
                  </div>
                  <div className="acn-ajuda">Por: {a.solicitado_por} · {new Date(a.solicitado_em).toLocaleString('pt-BR')}</div>
                  {a.motivo && <div className="acn-cot-aprov-txt">Motivo: {a.motivo}</div>}
                  {a.resposta && <div className="acn-cot-aprov-txt">Resposta: <Linkify text={a.resposta} /> (por {a.aprovado_por})</div>}
                  {podeAprovar && a.status === 'pendente' && (
                    <Botao variante="primario" pequeno icone={mdiCheck} onClick={() => aprovarSolicitacao(a)}>
                      Responder
                    </Botao>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Propostas geradas */}
          {propostas.length > 0 && (
            <div className="acn-cot-bloco">
              <div className="acn-quadro-titulo"><Icone path={mdiFileDocumentOutline} size={14} /> Propostas Geradas</div>
              {propostas.map(p => (
                <div key={p.id} className="acn-cot-prop">
                  <div className="acn-cot-prop-topo">
                    <div>
                      <span className="acn-cot-prop-v">{fmtR(p.valor_com_desconto)}</span>
                      {p.desconto_pct > 0 && (
                        <span className="acn-cot-prop-desc">({p.desconto_pct}% de desconto)</span>
                      )}
                    </div>
                    <div className="acn-cot-prop-lado">
                      <span className="acn-ajuda">{new Date(p.criado_em).toLocaleString('pt-BR')}</span>
                      <Botao pequeno icone={mdiFileDocumentOutline} onClick={() => setEmitindoProposta(p)}>
                        Emitir
                      </Botao>
                    </div>
                  </div>
                  <div className="acn-ajuda">
                    Total sem desconto: {fmtR(p.valor_total)} · por {p.criado_por}
                  </div>
                  {p.observacoes && <div className="acn-cot-aprov-txt">Obs: {p.observacoes}</div>}
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
        <div className="acn-modal-rodape acn-sac-rodape acn-cot-rodape">
          <Botao variante="primario" icone={mdiCashMultiple} onClick={() => onAbrirDesconto && onAbrirDesconto()}>
            Gerar Proposta / Desconto
          </Botao>
          <Botao onClick={onClose}>
            Fechar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Aprovações Pendentes (para Admin/Gestor) ───────────────────────
function PainelAprovacoes({ currentUser, onClose }) {
  const [lista, setLista]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [erroLeitura, setErroLeitura] = useState('');   // 7.60: leitura que falha não pode parecer "nenhuma aprovação pendente"
  const emAcaoRef = useRef(false);   // 7.60: aprovar/rejeitar uma vez só (o clique duplo gravava duas vezes)

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('status', 'pendente').order('solicitado_em', { ascending: false });
    if (error) { setErroLeitura(error.message); setLoading(false); return; }
    setErroLeitura('');
    setLista(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (aprov, decisao) => {
    if (emAcaoRef.current) return;
    emAcaoRef.current = true;
    try {
      const resposta = decisao === 'aprovado'
        ? 'Aprovado pelo gestor.'
        : await pedirTexto('Motivo da rejeição:') || 'Rejeitado.';
      const { error: erroAprov } = await supabase.from('cotacoes_aprovacoes').update({
        status: decisao, aprovado_por: currentUser?.email,
        aprovado_em: new Date().toISOString(), resposta,
      }).eq('id', aprov.id);
      // 7.60: os dois passos ignoravam o erro — a lista só relia e a solicitação parecia nunca ter sido respondida
      if (erroAprov) { alert('Não foi possível registrar a resposta: ' + erroAprov.message); return; }
      if (decisao === 'aprovado') {
        const { error: erroCot } = await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', aprov.cotacao_id);
        if (erroCot) {
          const { error: erroVolta } = await supabase.from('cotacoes_aprovacoes').update({ status: 'pendente', aprovado_por: null, aprovado_em: null, resposta: null }).eq('id', aprov.id);
          alert('Não foi possível aprovar a cotação (' + erroCot.message + ').' + (erroVolta
            ? '\n\nATENÇÃO: a solicitação ficou marcada como aprovada, mas a cotação não mudou de status. Avise o suporte para conferir.'
            : ' A solicitação voltou a ficar pendente.'));
        } else {
          logChange({ module: 'cotacoes', entityType: 'cotacoes_precos', entityId: aprov.cotacao_id, changeType: 'UPDATE',
            oldRow: { status: 'pendente_aprovacao' }, newRow: { status: 'aprovada' }, user: currentUser });
        }
      }
      carregar();
    } finally { emAcaoRef.current = false; }
  };

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-aprov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cot-jan acn-cot-media" role="dialog" aria-label="Aprovações Pendentes">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTimerSand} size={18} />Aprovações Pendentes</span>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo">
          {erroLeitura && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as aprovações pendentes ({erroLeitura}). Isso não quer dizer que não haja nenhuma{lista.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.</Faixa>
          )}
          {loading && <div className="acn-cot-vazio">Carregando...</div>}
          {!loading && lista.length === 0 && !erroLeitura && (
            <div className="acn-cot-vazio">
              <Icone path={mdiCheckCircleOutline} size={16} /> Nenhuma aprovação pendente.
            </div>
          )}
          {lista.map(a => (
            <div key={a.id} className="acn-cot-aprov" data-acn-familia="atencao">
              <div className="acn-cot-aprov-nome">
                {a.cotacao_nome || a.numero_cotacao || a.cotacao_id}
              </div>
              <div className="acn-cot-aprov-txt">
                Desconto solicitado: <strong className="acn-txt-erro">{a.desconto_pct}%</strong>
                {' '}por <strong>{a.solicitado_por}</strong>
                {' '}· {new Date(a.solicitado_em).toLocaleString('pt-BR')}
              </div>
              {a.motivo && <div className="acn-cot-aprov-txt">Motivo: {a.motivo}</div>}
              <div className="acn-cot-aprov-acoes">
                <Botao variante="primario" pequeno icone={mdiCheck} onClick={() => responder(a, 'aprovado')}>
                  Aprovar
                </Botao>
                <Botao variante="perigo" pequeno icone={mdiClose} onClick={() => responder(a, 'rejeitado')}>
                  Rejeitar
                </Botao>
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
  const emAcao = useRef(false);   // 7.60: o clique duplo gravava a proposta combinada duas vezes

  // Agrega todos os itens de todas as cotações selecionadas (apenas produtos)
  const todosItens = cotacoes.flatMap(c => (c.itens || []).map(it => ({ ...it, _origem_cotacao: c.numero_cotacao || c.id })));
  // Etapa 7.60 (07/10/2026): somava o valor de cada produto SEM as quantidades do item e do subgrupo (nem o "dividir por"),
  // e o total gravado na proposta saía diferente do da Formação de Preços — a regra do projeto é uma conta só (FormacaoCalculo.ts)
  const geraisCot = cotacoes.map(c => estruturaFormacao(c.itens || [], c.parametros_globais || {}, calcItem).geral);
  const totalBruto = geraisCot.reduce((s, gg) => s + gg.totVendas, 0);
  const totalImpostos = geraisCot.reduce((s, gg) => s + gg.totImposto, 0);
  const descVal = totalBruto * (desconto / 100);
  const totalLiquido = totalBruto - descVal;

  const salvar = async () => {
    if (!nome.trim()) { alert('Informe o nome da proposta.'); return; }
    if (emAcao.current) return;
    emAcao.current = true;
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
    emAcao.current = false;
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    alert('Proposta combinada salva!');
    onSalvo();
    onClose();
  };

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-comb">
      <div className="modal-box acn-modal-cadastro acn-cot-jan acn-cot-larga" role="dialog" aria-label="Combinar Formações em Proposta">
        <div className="acn-modal-cab">
          <div>
            <span className="modal-title"><Icone path={mdiLinkVariant} size={18} />Combinar Formações em Proposta</span>
            <div className="acn-ajuda">{cotacoes.length} formações selecionadas (apenas produtos)</div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>

        <div className="acn-modal-corpo acn-form-cheio">
          {/* Resumo das formações */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo"><Icone path={mdiPackageVariantClosed} size={14} /> Formações incluídas</div>
            {cotacoes.map(c => {
              const tot  = estruturaFormacao(c.itens || [], c.parametros_globais || {}, calcItem).geral.totVendas;
              return (
                <div key={c.id} className="acn-cot-linha-val com-borda">
                  <span className="acn-cot-val-rot">{c.numero_cotacao || '—'} · {c.nome}</span>
                  <span className="acn-cot-val-m acn-txt-ok">{fmtR(tot)}</span>
                </div>
              );
            })}
          </div>

          {/* Nome da proposta */}
          <div>
            <label className="acn-label">
              NOME DA PROPOSTA COMBINADA
            </label>
            <input className="acn-input" value={nome} onChange={e=>setNome(e.target.value)} />
          </div>

          {/* Desconto */}
          <div>
            <label className="acn-label">
              DESCONTO GLOBAL %
            </label>
            <input className="acn-input acn-fp-in-110" type="number" min={0} max={100} step="0.5" value={desconto}
              onChange={e=>setDesconto(parseFloat(e.target.value)||0)} />
          </div>

          {/* Resumo financeiro */}
          <div className="acn-quadro tom-ok acn-cot-resumo3">
            <div className="acn-cot-centro">
              <div className="acn-ajuda">Total Bruto</div>
              <div className="acn-cot-val-g">{fmtR(totalBruto)}</div>
            </div>
            <div className="acn-cot-centro">
              <div className="acn-ajuda">Impostos ({((totalImpostos/totalBruto)*100||0).toFixed(1)}%)</div>
              <div className="acn-cot-val-m acn-txt-erro">{fmtR(totalImpostos)}</div>
            </div>
            <div className="acn-cot-centro">
              <div className="acn-ajuda">Líquido c/ {desconto}% desc.</div>
              <div className="acn-cot-val-g acn-txt-ok">{fmtR(totalLiquido)}</div>
            </div>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Proposta Combinada'}
          </Botao>
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
  const [erroBusca,    setErroBusca]    = useState('');   // 7.60: busca que falha não pode parecer "nenhum produto"
  const emAcao = useRef(false);   // 7.60: o clique duplo criava duas cotações iguais
  const busRef = useRef(null);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    clearTimeout(busRef.current);
    busRef.current = setTimeout(async () => {
      const { data, error } = await buscarPorPalavras(supabase.from('cadastro_produtos')
        .select('id,codigo,nome,unidade,preco_venda,markup_pct,difal_pct,imposto_pct,custo_fixo_pct,fotos,catalogo_url,garantia_meses')
        .eq('ativo', true), ['nome_norm', 'codigo_norm'], busca).limit(10);
      setErroBusca(error ? error.message : '');
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
    if (emAcao.current) return;
    emAcao.current = true;
    setSalvando(true);

    // Para cada produto, busca custo do BOM
    const falhasBom: string[] = [];
    const itensComCusto = await Promise.all(selecionados.map(async ({ produto, qt }) => {
      const { data: bom, error: erroBom } = await supabase
        .from('cadastro_produtos_itens')
        .select('quantidade, cadastro_itens(custo_unit, ipi_pct, st_pct)')
        .eq('produto_id', produto.id);
      // 7.60: a leitura que falhava virava custo ZERO — a cotação saía com preço de venda zero, sem aviso
      if (erroBom) falhasBom.push(produto.nome + ' (' + erroBom.message + ')');
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

    if (falhasBom.length) {
      setSalvando(false); emAcao.current = false;
      alert('Não foi possível ler a composição de: ' + falhasBom.join('; ') + '.\n\nA cotação NÃO foi criada, para não sair com custo zero. Tente de novo.');
      return;
    }

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
      // Quem tem setor (Comercial/Licitações) já cria pro seu setor; Admin/
      // Gerente sem setor cria "reservada" até liberar pra alguém.
      setor:              setorDoUsuario(currentUser?.perfil) || RESERVADO,
    }]);

    setSalvando(false);
    emAcao.current = false;
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSalvo();
    onClose();
  };

  const prms = { ptax_dolar: 5.85, ptax_euro: 6.40 };

  return (
    <div className="modal-overlay acn-cot-overlay acn-cot-ov-nova" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cot-jan acn-cot-larga" role="dialog" aria-label="Nova Cotação — Catálogo de Produtos">

        <div className="acn-modal-cab">
          <div>
            <span className="modal-title"><Icone path={mdiFormatListBulleted} size={18} />Nova Cotação — Catálogo de Produtos</span>
            <div className="acn-ajuda">Selecione produtos do catálogo configurado</div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>

        <div className="acn-modal-corpo acn-form-cheio">
          {/* Dados da cotação */}
          <div className="acn-cot-grade2">
            <div>
              <label className="acn-label">CLIENTE / ÓRGÃO *</label>
              <input className="acn-input" value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)}
                placeholder="Nome do cliente..." />
            </div>
            <div>
              <label className="acn-label">OP/OS (opcional)</label>
              <input className="acn-input" value={opNumero} onChange={e=>setOpNumero(e.target.value)}
                placeholder="Ex: 1212.2608" />
            </div>
          </div>

          {/* Busca de produtos */}
          <div className="acn-cot-busca-op">
            <label className="acn-label"><Icone path={mdiMagnify} size={13} /> BUSCAR PRODUTO DO CATÁLOGO</label>
            <input className="acn-input" value={busca} onChange={e=>setBusca(e.target.value)}
              placeholder="Digite o nome do produto..." />
            {erroBusca && (
              <div className="acn-cot-faixa-busca">
                <Faixa tom="erro">Não foi possível buscar no catálogo ({erroBusca}). Isso não quer dizer que o produto não exista.</Faixa>
              </div>
            )}
            {resultados.length > 0 && (
              <div className="acn-cot-sug acn-cot-sug-prod">
                {resultados.map(p => (
                  <div key={p.id} className="acn-cot-sug-item" onClick={() => addProduto(p)}>
                    <div>
                      <div className="acn-cot-nome-t">{p.nome}</div>
                      <div className="acn-ajuda">
                        {p.codigo ? `${p.codigo} · ` : ''}{p.unidade} · Garantia: {p.garantia_meses}m
                      </div>
                    </div>
                    <div className="acn-cot-sug-preco">
                      {p.preco_venda ? `R$ ${Number(p.preco_venda).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Produtos selecionados */}
          {selecionados.length > 0 && (
            <div className="acn-cot-selec">
              <div className="acn-cot-selec-tit">
                <Icone path={mdiPackageVariantClosed} size={14} /> PRODUTOS SELECIONADOS ({selecionados.length})
              </div>
              {selecionados.map(({ produto, qt }) => (
                <div key={produto.id} className="acn-cot-selec-linha">
                  <div className="acn-cot-selec-txt">
                    <div className="acn-cot-nome-t">{produto.nome}</div>
                    <div className="acn-ajuda">
                      {produto.unidade} · markup {produto.markup_pct}% · garantia {produto.garantia_meses}m
                      {Array.isArray(produto.fotos) && produto.fotos.length > 0 && ` · ${produto.fotos.length} foto(s)`}
                      {produto.catalogo_url && ' · catálogo'}
                    </div>
                  </div>
                  <div className="acn-cot-selec-qtd">
                    <label className="acn-ajuda">Qtd:</label>
                    <input type="number" min={1} value={qt} onChange={e=>setQt(produto.id, e.target.value)}
                      className="acn-input acn-cot-qtd" />
                  </div>
                  <div className="acn-cot-selec-total">
                    {produto.preco_venda
                      ? `R$ ${(Number(produto.preco_venda)*qt).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
                      : '—'}
                  </div>
                  <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover produto" aria-label="Remover produto" onClick={() => removeItem(produto.id)} />
                </div>
              ))}
              <div className="acn-cot-selec-rodape">
                Total estimado: R$ {selecionados.reduce((acc, {produto, qt}) => acc + (Number(produto.preco_venda)||0)*qt, 0)
                  .toLocaleString('pt-BR',{minimumFractionDigits:2})}
              </div>
            </div>
          )}

          {selecionados.length === 0 && (
            <div className="acn-cot-vazio tracejado">
              Nenhum produto selecionado. Busque acima para adicionar.
            </div>
          )}
        </div>

        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={salvar}
            disabled={salvando || !nomeCliente.trim() || selecionados.length === 0}>
            {salvando ? 'Criando...' : 'Criar Cotação'}
          </Botao>
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
  const [erroLista, setErroLista] = useState('');   // 7.60: leitura que falha não pode parecer "nenhuma cotação"
  const [erroPendentes, setErroPendentes] = useState('');
  const [erroConfig, setErroConfig] = useState('');

  // Visibilidade controlada pelo admin
  const [cfg, setCfg] = useState({
    verCustos:  false,
    verFornec:  false,
    verMarkup:  false,
  });

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(perfilComPoderes(currentUser));
  const isVendedor = !isAdmin;
  const podeAprovar = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);
  const { naoLidoSet: cotacoesNaoLidas, marcarLidoLocal: marcarCotacaoLidaLocal } = useUnreadMap('cotacoes_precos', cotacoes.map(c => c.id), currentUser);
  const marcarCotacaoLida = useMarkAsRead('cotacoes_precos', modalDetalhe?.id, currentUser);

  // Carregar configurações de visibilidade
  const carregarConfig = useCallback(async () => {
    const { data, error } = await supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['cotacoes_ver_custos_margens','cotacoes_ver_fornecedores','cotacoes_ver_markup']);
    setErroConfig(error ? error.message : '');   // 7.60: sem ler a configuração os campos sensíveis ficam ocultos (o lado seguro) — agora a tela diz por quê
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
      // Visibilidade por setor (pedido do usuário em 24/09/2026): cada um só
      // vê a cotação do seu setor + as sem setor definido (cotação antiga, de
      // antes dessa regra — continua visível pra não sumir do dia pra noite).
      // "Reservada" (setor === RESERVADO) só Admin/Gerente veem.
      const meuSetor = setorDoUsuario(currentUser?.perfil);
      q = meuSetor ? q.or(`setor.is.null,setor.eq.${meuSetor}`) : q.is('setor', null);
    }
    const { data, error } = await q;
    if (error) { setErroLista(error.message); setCarregando(false); return; }   // mantém a lista que já estava na tela
    setErroLista('');
    setCotacoes(data || []);
    setCarregando(false);
  }, [isVendedor, currentUser?.perfil]);

  // Admin/Gerente decide quem vê a cotação: um setor, "reservada" (só
  // Admin/Gerente) ou "legado" (sem setor — vale pra todo mundo, como sempre
  // foi). Pedido do usuário em 24/09/2026.
  const liberarSetor = async (cotacao, novoSetor) => {
    const { error } = await supabase.from('cotacoes_precos').update({ setor: novoSetor }).eq('id', cotacao.id);
    if (error) { alert('Não foi possível alterar o setor: ' + error.message); return; }
    logChange({ module: 'cotacoes', entityType: 'cotacoes_precos', entityId: cotacao.id, changeType: 'UPDATE',
      oldRow: { setor: cotacao.setor }, newRow: { setor: novoSetor }, user: currentUser });
    setCotacoes(prev => prev.map(c => c.id === cotacao.id ? { ...c, setor: novoSetor } : c));
  };

  const carregarPendentes = useCallback(async () => {
    if (!podeAprovar) return;
    const { count, error } = await supabase.from('cotacoes_aprovacoes')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    if (error) { setErroPendentes(error.message); return; }   // 7.60: contava 0 e o aviso de aprovação esperando sumia para o gerente
    setErroPendentes('');
    setPendCount(count || 0);
  }, [podeAprovar]);

  useEffect(() => {
    carregarConfig();
    carregarCotacoes();
    carregarPendentes();
  }, [carregarConfig, carregarCotacoes, carregarPendentes]);

  const cotacoesFiltradas = cotacoes.filter(c => {
    const ok_busca = combinaBusca([c.nome, c.numero_cotacao, c.opl_numero, c.criado_por], busca);
    const ok_status = !filtroStatus || c.status === filtroStatus;
    const ok_aba    = abaLista === 'todas' || !c.crm_oportunidade_id;
    return ok_busca && ok_status && ok_aba;
  });

  const qtdAvulsas = cotacoes.filter(c => !c.crm_oportunidade_id).length;

  const statusOpcoes = [...new Set(cotacoes.map(c => c.status).filter(Boolean))];

  return (
    <div className="acn-cot">
      <CabecalhoTela
        titulo="Cotações"
        subtitulo={<>{cotacoesFiltradas.length} cotação(ões) · {cotacoes.filter(c=>c.status==='ativa').length} ativas</>}
        acoes={<>
          {podeAprovar && pendCount > 0 && (
            <Botao variante="perigo" icone={mdiTimerSand} onClick={() => setModalAprovs(true)}>
              Aprovações Pendentes
              <span className="acn-cot-pend">{pendCount}</span>
            </Botao>
          )}
          {selecionadas.length >= 2 && (
            <Botao icone={mdiLinkVariant} onClick={() => setModalCombinar(true)}>
              Combinar em Proposta ({selecionadas.length})
            </Botao>
          )}
          <Botao icone={simplificada ? mdiFormatListBulleted : mdiChartBar} onClick={() => setSimplificada(v => !v)}>
            {simplificada ? 'Completo' : 'Simplificado'}
          </Botao>
          <Botao variante="primario" icone={mdiPlus} onClick={() => setModalNovaCotacao(true)}>
            Nova Cotação
          </Botao>
          <Botao icone={mdiRefresh} onClick={() => { carregarCotacoes(); carregarPendentes(); }}>
            Atualizar
          </Botao>
        </>}
        abas={
          <Abas ativa={abaLista} onChange={setAbaLista} itens={[
            { id:'todas',   rotulo:'Todas',   icone: mdiFormatListBulleted, contagem: cotacoes.length },
            { id:'avulsas', rotulo:'Avulsas', icone: mdiFolderOutline, contagem: qtdAvulsas,
              titulo:'Cotações sem vínculo com oportunidade CRM' },
          ]} />
        }
      />

      {/* Filtros */}
      <div className="acn-cot-filtros">
        <input className="acn-input acn-cot-busca" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, número, OP..." />
        <select className="acn-input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CORES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {erroLista && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarCotacoes()}>Tentar de novo</Botao>}>Não foi possível ler as cotações ({erroLista}). Isso não quer dizer que não haja cotação{cotacoes.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.</Faixa>
      )}
      {erroPendentes && (
        <Faixa tom="atencao">Não foi possível ler as aprovações pendentes ({erroPendentes}). O número de aprovações esperando pode estar desatualizado.</Faixa>
      )}
      {erroConfig && (
        <Faixa tom="atencao">Não foi possível ler a configuração de visibilidade ({erroConfig}). Custos, fornecedores e markup ficam ocultos até a leitura dar certo.</Faixa>
      )}

      {/* Aviso de campos ocultos */}
      {isVendedor && (!cfg.verCustos || !cfg.verFornec || !cfg.verMarkup) && (
        <Faixa tom="info">
          Alguns campos desta cotação estão ocultos por configuração do administrador.
        </Faixa>
      )}

      {/* Tabela */}
      {carregando ? (
        <div className="acn-cot-vazio">Carregando...</div>
      ) : cotacoesFiltradas.length === 0 ? (
        erroLista ? null : <div className="acn-cot-vazio">
          Nenhuma cotação encontrada.
        </div>
      ) : (
        <div className="acn-cot-tabela">
          <table className="acn-tabela acn-densa">
            <thead>
              <tr>
                <th className="acn-cot-col-sel">
                  <input type="checkbox"
                    checked={selecionadas.length === cotacoesFiltradas.length && cotacoesFiltradas.length > 0}
                    onChange={e => setSelecionadas(e.target.checked ? cotacoesFiltradas.map(c=>c.id) : [])} />
                </th>
                <th className="esq">Número</th>
                <th className="esq">Nome</th>
                <th className="esq">Status</th>
                {isAdmin && <th className="esq">Setor</th>}
                {!simplificada && <th className="esq">Tipo</th>}
                {!simplificada && <th className="esq">Empresa</th>}
                {!simplificada && <th className="esq">OP</th>}
                <th className="dir">Valor Total</th>
                <th className="dir">% Impostos</th>
                {!simplificada && <th className="esq">Criado em</th>}
                <th className="centro">Ação</th>
              </tr>
            </thead>
            <tbody>
              {cotacoesFiltradas.map((c, i) => {
                const itens   = c.itens || [];
                const prms    = c.parametros_globais || {};
                const { totVendas, totImposto } = estruturaFormacao(itens, prms, calcItem).geral;
                const impostoPct = totVendas > 0 ? (totImposto / totVendas * 100) : (prms.imposto_pct || 0);
                const sel = selecionadas.includes(c.id);
                const naoLida = cotacoesNaoLidas.has(String(c.id));

                return (
                  <tr key={c.id} className={'acn-cot-linha' + (naoLida ? ' nao-lida' : sel ? ' sel' : '')}>
                    <td className="centro">
                      <input type="checkbox" checked={sel}
                        onChange={e => setSelecionadas(p => e.target.checked ? [...p, c.id] : p.filter(x=>x!==c.id))} />
                    </td>
                    <td className="acn-cot-num">
                      {c.crm_oportunidade_id && onAbrirCrmCard ? (
                        <Botao variante="discreto" pequeno className="acn-cot-link" onClick={() => onAbrirCrmCard(c.crm_oportunidade_id)}>
                          {c.numero_cotacao || '—'}
                        </Botao>
                      ) : (
                        <span>{c.numero_cotacao || '—'}</span>
                      )}
                    </td>
                    <td className="acn-cot-nome">
                      <div className="acn-cot-nome-t">{c.nome}</div>
                      {!simplificada && c.criado_por && <div className="acn-ajuda">{c.criado_por}</div>}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    {isAdmin && (
                      <td onClick={e => e.stopPropagation()}>
                        <select value={c.setor || ''} onChange={e => liberarSetor(c, e.target.value || null)}
                          title="Quem vê esta cotação"
                          className={'acn-input acn-cot-setor' + (c.setor === RESERVADO ? ' reservado' : '')}>
                          <option value="">— sem setor (legado, todo mundo vê) —</option>
                          <option value={RESERVADO}>🔒 Reservada (só Admin/Gerente)</option>
                          {SETORES_COTACAO.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    )}
                    {!simplificada && <td className="acn-fraco">{c.tipo || '—'}</td>}
                    {!simplificada && <td className="acn-fraco">{c.empresa || '—'}</td>}
                    {!simplificada && <td>
                      {c.opl_numero
                        ? <span className="acn-cot-opl"><Icone path={mdiLinkVariant} size={13} /> {c.opl_numero}</span>
                        : <span className="acn-fraco">—</span>}
                    </td>}
                    <td className="dir acn-forte acn-txt-ok">
                      {totVendas > 0 ? fmtR(totVendas) : '—'}
                    </td>
                    <td className="dir acn-txt-erro">
                      {impostoPct > 0 ? `${impostoPct.toFixed(1)}%` : '—'}
                    </td>
                    {!simplificada && <td className="acn-fraco">
                      {c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '—'}
                    </td>}
                    <td className="centro">
                      <Botao variante="primario" pequeno onClick={() => setModalDetalhe(c)}>Ver</Botao>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          onClose={() => { marcarCotacaoLida(); if (modalDetalhe?.id) marcarCotacaoLidaLocal(modalDetalhe.id); setModalDetalhe(null); }}
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
  const [erroLeitura, setErroLeitura] = useState('');   // 7.60: leitura que falha não pode parecer "nenhuma cotação vinculada"

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(perfilComPoderes(currentUser));

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cotacoes_precos').select('*')
      .eq('crm_oportunidade_id', oportunidadeId)
      .order('criado_em', { ascending: false });
    if (error) { setErroLeitura(error.message); setLoading(false); return; }
    setErroLeitura('');
    setCotacoes(data || []);
    setLoading(false);
  }, [oportunidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="acn-ajuda acn-cot-carregando">Carregando cotações...</div>;

  if (cotacoes.length === 0) return (
    erroLeitura
      ? <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as cotações deste card ({erroLeitura}). Isso não quer dizer que não haja cotação vinculada.</Faixa>
      : <div className="acn-cot-vazio">
      Nenhuma cotação vinculada a este card.
    </div>
  );

  return (
    <div>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível reler as cotações deste card ({erroLeitura}); a lista abaixo é a da última leitura que deu certo.</Faixa>
      )}
      {cotacoes.map(c => {
        const itens = c.itens || [];
        const prms  = c.parametros_globais || {};
        const results = itens.map(it => calcItem(it, prms));
        // 7.60: somava o valor de cada produto sem as quantidades do item e do subgrupo — o total do card saía diferente do da Formação de Preços e da lista de Cotações
        const geralCot = estruturaFormacao(itens, prms, calcItem).geral;
        const totVendas = geralCot.totVendas;
        const totCusto  = geralCot.totCustos;
        return (
          <div key={c.id} className="acn-cot-cartao">
            <div className="acn-cot-cartao-cab">
              <div>
                <span className="acn-cot-cartao-num">
                  {c.numero_cotacao || '—'}
                </span>
                <StatusBadge status={c.status} />
                <div className="acn-cot-cartao-nome">{c.nome}</div>
                <div className="acn-ajuda">
                  {c.tipo} · {c.empresa}
                  {c.opl_numero ? ` · OP: ${c.opl_numero}` : ''}
                  {` · Criado: ${c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—'}`}
                </div>
              </div>
              <div className="acn-cot-cartao-val">
                <div className="acn-cot-cartao-total">{fmtR(totVendas)}</div>
                {verCustos && <div className="acn-ajuda">Custo: {fmtR(totCusto)}</div>}
              </div>
            </div>

            {/* Itens resumidos */}
            {itens.length > 0 && (
              <div className="acn-cot-mini-wrap">
                <table className="acn-cot-mini">
                  <thead>
                    <tr>
                      <th className="esq">Item</th>
                      <th className="centro">Qt</th>
                      {verFornec && <th className="esq">Fornecedor</th>}
                      {verMarkup && <th className="dir">Markup</th>}
                      {verCustos && <th className="dir">Custo</th>}
                      <th className="dir">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.slice(0, 5).map((it, i) => {
                      const r = results[i] || {};
                      return (
                        <tr key={i}>
                          <td>{it.produto || '—'}</td>
                          <td className="centro">{it.qt || 1}</td>
                          {verFornec && <td className="acn-fraco">{it.fornecedor||'—'}</td>}
                          {verMarkup && <td className="dir">{fmtPct(it.markup_pct)}</td>}
                          {verCustos && <td className="dir acn-txt-atencao">{fmtR(r.custoTotal)}</td>}
                          <td className="dir acn-forte">{fmtR(r.valorTotal)}</td>
                        </tr>
                      );
                    })}
                    {itens.length > 5 && (
                      <tr><td colSpan={5} className="acn-fraco acn-cot-mais">
                        + {itens.length - 5} itens adicionais...
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <Botao variante="primario" pequeno icone={mdiCashMultiple} onClick={() => setModalDesc(c)}>
              Gerar Proposta
            </Botao>
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
