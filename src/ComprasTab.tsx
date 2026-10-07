// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import MencaoTextarea, { salvarMencoes, resolverMencoesRespondidas, resolverMencoesDeTodos } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';
import Linkify from './Linkify';
import { centrosParaApontar, motivoBloqueio, labelHierarquico } from './CentroCustoShared';
import { CentrosCustoManager } from './CentroCustoFicha';
import { logChange, useUnreadMap } from './AuditSystem';
import { abrirVinculo, VinculoPicker, TIPO_LABEL } from './VinculoPicker';
import KanbanColuna from './KanbanColuna';
import { combinaBusca } from './SearchUtils';
import { useCelular, SeletorEtapas, etapaInicial } from './Celular';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { Botao, MenuAcoes, Selo, Faixa, Chips } from './Interface';
import Icone from './Icone';
import { mdiPencilOutline, mdiUndoVariant, mdiCloseCircleOutline, mdiRestore, mdiArrowRight, mdiCartOutline, mdiTableLarge, mdiViewColumnOutline,
  mdiCogOutline, mdiFactory, mdiAccountOutline, mdiClipboardTextOutline, mdiMagnify, mdiLinkVariant, mdiForumOutline, mdiCommentTextOutline,
  mdiPrinterOutline, mdiPlay, mdiTagOutline, mdiLockOutline, mdiCartCheck, mdiPackageVariantClosed, mdiEarth, mdiAlertOutline, mdiCheck,
  mdiChevronUp, mdiChevronDown, mdiPlus, mdiContentSaveOutline, mdiOfficeBuildingOutline, mdiCalendarOutline, mdiBullseyeArrow,
  mdiTrashCanOutline, mdiPaperclip, mdiTrophyOutline, mdiClockOutline, mdiCheckCircleOutline, mdiCameraOutline } from '@mdi/js';
import { ModalReceberPedido } from './LogisticaTab';
import { ETAPAS_COMPRA, DESCARTADA, COR_ETAPA_COMPRA, ETAPA_ANTERIOR, PROXIMA_ETAPA, podeGerirCompras, ehSolicitante,
  podeEditarSolicitacao, registrarHistorico, mencionarSolicitante, ModalVoltarEtapa, ModalDescartar, ModalReativar,
  ModalIniciarCotacao, ModalConfirmarCompra, ModalEditarSolicitacao, AnexosCompra, HistoricoCompra, origemDaRequisicao,
  podeAprovarCompra, carregarAprovadoresCompra, lerAprovadoresCompra } from './ComprasFluxo';

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
    <div className="acn-cmp-comp">
      <div className="acn-cmp-comp-g3">
        <div>
          <label className="acn-label">Fornecedor *</label>
          <input className="acn-input" value={form.fornecedor_nome} onChange={e=>set('fornecedor_nome', e.target.value)} />
        </div>
        <div>
          <label className="acn-label">Valor unitário (R$) *</label>
          <input className="acn-input" value={form.valor_unitario} placeholder="Ex: 15,00" inputMode="decimal"
            onChange={e=>set('valor_unitario', e.target.value)} />
        </div>
        <div>
          <label className="acn-label">Quantidade *</label>
          <input className="acn-input" value={form.quantidade} inputMode="decimal"
            onChange={e=>set('quantidade', e.target.value)} />
        </div>
      </div>
      <div className="acn-cmp-comp-g2">
        <div>
          <label className="acn-label">Frete</label>
          <div className="acn-cmp-comp-frete">
            <Chips rotulo="Frete" ativo={form.frete_tipo === 'pago' ? 'pago' : 'gratis'} onChange={(v) => set('frete_tipo', v)}
              itens={[{ id: 'gratis', rotulo: 'Grátis' }, { id: 'pago', rotulo: 'Pago' }]} />
            {form.frete_tipo === 'pago' && (
              <input className="acn-input acn-cmp-comp-fretevalor" value={form.frete_valor} placeholder="Valor do frete" inputMode="decimal"
                onChange={e=>set('frete_valor', e.target.value)} aria-label="Valor do frete" />
            )}
          </div>
        </div>
        <div className="acn-cmp-comp-g2">
          <div>
            <label className="acn-label">Outras taxas (R$)</label>
            <input className="acn-input" value={form.outras_taxas} inputMode="decimal" onChange={e=>set('outras_taxas', e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Desconto (R$)</label>
            <input className="acn-input" value={form.desconto_valor} inputMode="decimal" onChange={e=>set('desconto_valor', e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <label className="acn-label">Serviços adicionais</label>
        {servicos.map((s: any, i: number) => (
          <div key={i} className="acn-cmp-comp-servico">
            <input className="acn-input acn-cmp-comp-sdesc" value={s.descricao} placeholder="Ex.: instalação, montagem, garantia estendida"
              onChange={e=>set('servicos', servicos.map((x: any, j: number) => j === i ? { ...x, descricao: e.target.value } : x))} aria-label="Descrição do serviço" />
            <input className="acn-input acn-cmp-comp-sval" value={s.valor} placeholder="Valor" inputMode="decimal"
              onChange={e=>set('servicos', servicos.map((x: any, j: number) => j === i ? { ...x, valor: e.target.value } : x))} aria-label="Valor do serviço" />
            <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Remover serviço"
              onClick={()=>set('servicos', servicos.filter((_: any, j: number) => j !== i))} />
          </div>
        ))}
        <Botao pequeno icone={mdiPlus} onClick={()=>set('servicos', [...servicos, { descricao:'', valor:'' }])}>Serviço</Botao>
      </div>
      <div>
        <div className="acn-cmp-comp-g2">
          <div>
            <label className="acn-label">Condição de pagamento</label>
            <input className="acn-input" value={form.condicao_pagamento} placeholder="Ex: 30/60 dias" onChange={e=>set('condicao_pagamento', e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Prazo de entrega</label>
            <input className="acn-input" value={form.prazo_entrega} placeholder="Ex: 10 dias úteis" onChange={e=>set('prazo_entrega', e.target.value)} />
          </div>
        </div>
      </div>
      <div className="acn-cmp-comp-resumo">
        <div className="acn-cmp-comp-linha"><span>Itens ({form.quantidade || 0} × {moedaBr(parseValorBr(form.valor_unitario))})</span><span className="acn-num">{moedaBr(t.itens)}</span></div>
        <div className="acn-cmp-comp-linha acn-fraco"><span>Frete {form.frete_tipo === 'pago' ? '' : '(grátis)'}</span><span className="acn-num">{moedaBr(t.frete)}</span></div>
        {t.servicos > 0 && <div className="acn-cmp-comp-linha acn-fraco"><span>Serviços adicionais</span><span className="acn-num">{moedaBr(t.servicos)}</span></div>}
        {t.taxas > 0 && <div className="acn-cmp-comp-linha acn-fraco"><span>Outras taxas</span><span className="acn-num">{moedaBr(t.taxas)}</span></div>}
        {t.desconto > 0 && <div className="acn-cmp-comp-linha acn-txt-ok"><span>Desconto</span><span className="acn-num">− {moedaBr(t.desconto)}</span></div>}
        <div className="acn-cmp-comp-linha acn-cmp-comp-total">
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

// ── Itens na impressão ───────────────────────────────────────────────────────
// Pedido do usuário em 24/09/2026: a lista de itens precisa sair como LISTA,
// para o papel poder ir ao fornecedor. Antes tudo caía num campo "Descrição"
// só — título, descrição e as linhas de item coladas por quebra de linha — e a
// "Quantidade" era a soma de tudo (7 numa compra de 7 itens diferentes), que
// não quer dizer nada para quem vai cotar.

/** Escapa o que vai para o HTML da impressão: nome de item tem aspas, < e &
 *  (ex.: 'Cabo 3/8" <verde>') e sem isto a página sai quebrada. */
const esc = (v: any) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const itensDoPedido = (p: any) =>
  Array.isArray(p?.itens) ? p.itens.filter((i: any) => String(i?.nome || '').trim()) : [];

/** A descrição sem as linhas "N× item", que a tabela de itens já mostra —
 *  senão o mesmo conteúdo aparece duas vezes na mesma folha. */
function descricaoSemItens(p: any) {
  const bruta = String(p?.descricao_material || '');
  if (!itensDoPedido(p).length) return bruta;
  return bruta.split('\n').filter(l => !/^\s*\d+(?:[.,]\d+)?\s*[×x]\s+/.test(l)).join('\n').trim();
}

/** Tabela de itens para a impressão. Devolve '' quando o pedido é antigo e não
 *  tem a lista estruturada — aí a descrição em texto continua sendo tudo que há. */
function blocoItensImpressao(p: any, moeda: (v: any) => string) {
  const itens = itensDoPedido(p);
  if (!itens.length) return '';
  const temValor = itens.some((i: any) => Number(i?.valor_unitario) > 0);
  // o total acompanha a quantidade que vale (a comprada, quando existe),
  // senão a soma não fecharia com as linhas logo acima dela
  const totalGeral = itens.reduce((s: number, i: any) =>
    s + (Number(i?.valor_unitario) || 0) * (Number(i?.quantidade_comprada ?? i?.quantidade) || 0), 0);
  // Quando o Compras fechou quantidade diferente da pedida (caixa fechada,
  // lote mínimo), quem vale para o fornecedor é a comprada — a pedida fica ao
  // lado, em cinza, para a conferência não estranhar a diferença (25/09/2026).
  const temComprada = itens.some((i: any) =>
    i?.quantidade_comprada != null && Number(i.quantidade_comprada) !== Number(i.quantidade));
  const qtdVale = (i: any) => Number(i?.quantidade_comprada ?? i?.quantidade) || 0;
  const linhas = itens.map((i: any, n: number) => {
    const qtd = qtdVale(i);
    const pedida = Number(i?.quantidade) || 0;
    const vu = Number(i?.valor_unitario) || 0;
    return `<tr>
      <td style="text-align:center;width:28px">${n + 1}</td>
      <td><b>${esc(i.nome)}</b>${i.descricao ? `<div style="color:#475569;font-size:10px">${esc(i.descricao)}</div>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${qtd || '—'}${
        temComprada && pedida && pedida !== qtd ? `<div style="color:#94a3b8;font-size:9px">pedido ${pedida}</div>` : ''}</td>
      ${temValor ? `<td style="text-align:right;white-space:nowrap">${vu ? moeda(vu) : '—'}</td>
      <td style="text-align:right;white-space:nowrap">${vu ? moeda(vu * qtd) : '—'}</td>` : ''}
    </tr>`;
  }).join('');
  return `
    <h3 style="margin:22px 0 0;font-size:13px;color:#1a3a52">Itens solicitados (${itens.length})</h3>
    <table class="itens">
      <tr>
        <th style="width:28px">#</th><th>Item</th><th style="text-align:right">Qtd</th>
        ${temValor ? '<th style="text-align:right">Valor unit.</th><th style="text-align:right">Total</th>' : ''}
      </tr>
      ${linhas}
      ${temValor ? `<tr><td colspan="4" style="text-align:right"><b>Total</b></td>
        <td style="text-align:right"><b>${moeda(totalGeral)}</b></td></tr>` : ''}
    </table>`;
}

/** Estilo da tabela de itens, junto do resto do CSS de impressão. */
const CSS_ITENS = `
  table.itens { width:100%; border-collapse:collapse; margin-top:8px; }
  table.itens th { background:#1a3a52; color:#fff; padding:6px 8px; text-align:left; font-size:10px; }
  table.itens td { padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:11px; vertical-align:top; }
  table.itens tr:nth-child(even) td { background:#f8fafc; }`;

function imprimirSolicitacao(p: any) {
  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  // data_prevista_recebimento é timestamptz: colar 'T00:00:00' num valor que já
  // vem com hora dava "Invalid Date" no papel que vai ao fornecedor (24/09/2026)
  const fmtDt = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
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
      ${CSS_ITENS}
    </style></head>
    <body>
      <h2>Solicitação de Compra</h2>
      <table>
        <tr><th>Campo</th><th>Informação</th></tr>
        <tr><td><b>Nº Pedido</b></td><td>${esc(p.numero_pedido) || '—'}</td></tr>
        <tr><td><b>OP Referência</b></td><td>${esc(p.opl) || '—'}</td></tr>
        <tr><td><b>Descrição</b></td><td style="white-space:pre-wrap">${esc(descricaoSemItens(p)) || '—'}</td></tr>
        ${itensDoPedido(p).length ? '' : `<tr><td><b>Quantidade</b></td><td>${esc(p.quantidade_comprada ?? p.quantidade) || '—'}${p.quantidade_comprada != null && Number(p.quantidade_comprada) !== Number(p.quantidade) ? ` <span style="color:#94a3b8">(pedido ${esc(p.quantidade)})</span>` : ''}</td></tr>`}
        <tr><td><b>Fornecedor</b></td><td>${esc(p.fornecedor) || '—'}</td></tr>
        <tr><td><b>Valor Total da Compra</b></td><td>${fmt(p.valor_compra)}</td></tr>
        <tr><td><b>Previsão de Recebimento</b></td><td>${fmtDt(p.data_prevista_recebimento)}</td></tr>
        <tr><td><b>Status</b></td><td><span class="badge">${esc(p.status_compra) || '—'}</span></td></tr>
        <tr><td><b>Data da Solicitação</b></td><td>${p.data_criacao ? new Date(p.data_criacao).toLocaleDateString('pt-BR') : '—'}</td></tr>
        ${p.observacoes_compra ? `<tr><td><b>Observações</b></td><td style="white-space:pre-wrap">${esc(p.observacoes_compra)}</td></tr>` : ''}
      </table>
      ${blocoItensImpressao(p, fmt)}
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
  // data_prevista_recebimento é timestamptz: colar 'T00:00:00' num valor que já
  // vem com hora dava "Invalid Date" no papel que vai ao fornecedor (24/09/2026)
  const fmtDt = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
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
      ${CSS_ITENS}
    </style></head>
    <body>
      <h2>Ordem de Compra — <span class="badge">${esc(p.numero_oc)}</span></h2>
      <table>
        <tr><th>Campo</th><th>Informação</th></tr>
        <tr><td><b>Nº Pedido</b></td><td>${esc(p.numero_pedido) || '—'}</td></tr>
        <tr><td><b>OP Referência</b></td><td>${esc(p.opl) || '—'}</td></tr>
        <tr><td><b>Descrição</b></td><td style="white-space:pre-wrap">${esc(descricaoSemItens(p)) || '—'}</td></tr>
        ${itensDoPedido(p).length ? '' : `<tr><td><b>Quantidade</b></td><td>${esc(p.quantidade_comprada ?? p.quantidade) || '—'}${p.quantidade_comprada != null && Number(p.quantidade_comprada) !== Number(p.quantidade) ? ` <span style="color:#94a3b8">(pedido ${esc(p.quantidade)})</span>` : ''}</td></tr>`}
        <tr><td><b>Fornecedor</b></td><td>${esc(p.fornecedor) || '—'}</td></tr>
        <tr><td><b>Valor Total da Compra</b></td><td>${fmt(p.valor_compra)}</td></tr>
        <tr><td><b>Centro de Custo</b></td><td>${esc(p.centro_custo) || '—'}</td></tr>
        <tr><td><b>Previsão de Recebimento</b></td><td>${fmtDt(p.data_prevista_recebimento)}</td></tr>
        <tr><td><b>Justificativa da Vencedora</b></td><td>${esc(p.justificativa_vencedora) || '—'}</td></tr>
      </table>
      ${blocoItensImpressao(p, fmt)}
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
  const [erroSalvar, setErroSalvar] = useState('');

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
      setErroSalvar('');
      setTimeout(() => setSalvo(false), 2000);
    } else setErroSalvar(error.message);   // 7.57: o autosave que falhava ficava calado e a nota se perdia ao fechar
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
    <div className="acn-cmp-area">
      <div className="acn-cmp-area-barra">
        <span className="acn-cmp-area-tit acn-prod-ic"><Icone path={mdiPencilOutline} size={12} /> Área Livre</span>
        {(['bold','italic'] as const).map(cmd => (
          <Botao key={cmd} pequeno variante="discreto" className={cmd === 'bold' ? 'acn-cmp-area-b' : 'acn-cmp-area-i'}
            onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); }}
            title={cmd === 'bold' ? 'Negrito' : 'Itálico'}>
            {cmd === 'bold' ? 'B' : 'I'}
          </Botao>
        ))}
        <Botao pequeno variante="discreto" icone={mdiLinkVariant} aria-label="Inserir link" title="Inserir link"
          onMouseDown={async e => {
            e.preventDefault();
            const url = await pedirTexto('URL do link:');
            if (url) document.execCommand('createLink', false, url);
          }} />
        <Botao pequeno variante="discreto" icone={mdiCameraOutline} aria-label="Inserir imagem" title="Inserir imagem"
          onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click(); }} />
        <input ref={imgInputRef} type="file" accept="image/*" className="acn-cmp-oculto"
          onChange={e => { const f = e.target.files?.[0]; if (f) inserirImagem(f); e.target.value = ''; }} />
        <div className="acn-cmp-cresce" />
        {salvando && <span className="acn-txt-atencao acn-cmp-area-estado">Salvando...</span>}
        {salvo && !salvando && <span className="acn-txt-ok acn-cmp-area-estado">✓ Salvo</span>}
        {erroSalvar && !salvando && <span className="acn-txt-erro acn-cmp-area-estado" title={erroSalvar}>NÃO salvou: {erroSalvar}</span>}
        <Botao pequeno variante="primario" icone={mdiContentSaveOutline} onClick={salvarAgora} disabled={salvando} title="Salvar agora">
          Salvar
        </Botao>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="cotacao-area-livre acn-cmp-editor"
        onInput={autosave}
        onPaste={handlePaste}
        data-placeholder="Notas sobre esta cotação, cole tabelas, imagens, links..."
      />
    </div>
  );
}

// ─── STATUS (colunas do Kanban e ordem do fluxo) ───────────────────────────────
const STATUS_COMPRAS = [...ETAPAS_COMPRA, DESCARTADA];
// Última etapa do fluxo — o quadro trata ela diferente das demais (ver kanban)
const RECEBIDO = ETAPAS_COMPRA[ETAPAS_COMPRA.length - 1];
/** Cards por coluna antes de a coluna começar a rolar */
const CARDS_POR_COLUNA = 5;
/** Quantos recebidos ficam à vista no quadro; o resto sai no "ver todos" */
const RECEBIDOS_NO_QUADRO = 10;
const COR_STATUS_COMPRA: Record<string,string> = COR_ETAPA_COMPRA;
// Etapa 12e19 (06/10/2026): a cor de cada etapa na tela (selo, bolinha do total e borda do cartão) segue a família do sistema.
// Suposição minha: a cor viva do quadro (KanbanColuna, compartilhado) segue por hexadecimal até ele ser migrado.
const FAMILIA_COMPRA: Record<string,string> = {
  'Pendente': 'neutro', 'Em Andamento': 'info', 'Aguardando Aprovação': 'atencao', 'Aprovado': 'ok',
  'Comprado': 'marca', 'Recebido': 'neutro', 'Descartada': 'erro',
};

// ─── DESCRIÇÃO COMPACTA ───────────────────────────────────────────────────────
// A descrição da compra ocupava a linha inteira (e o card do kanban) quando o
// pedido vinha com especificação longa. Mostra 2 linhas e "ver mais"; o texto
// completo também está no Resumo.
function DescricaoCompacta({ texto, linhas = 2 }: { texto: string; linhas?: number }) {
  const [aberta, setAberta] = useState(false);
  const t = String(texto || '').trim();
  if (!t) return <span className="acn-fraco">—</span>;
  const longa = t.length > 70 || t.includes('\n');
  return (
    <span className="acn-cmp-desc-compacta" title={longa && !aberta ? t : undefined}>
      <span className={aberta || !longa ? 'acn-cmp-desc-aberta' : 'acn-cmp-desc-cortada'} style={aberta || !longa ? undefined : { WebkitLineClamp: linhas }}>
        {t}
      </span>
      {longa && (
        <Botao pequeno variante="discreto" className="acn-cmp-vermais" onClick={e => { e.stopPropagation(); setAberta(a => !a); }}>
          {aberta ? 'ver menos' : 'ver mais'}
        </Botao>
      )}
    </span>
  );
}

// ─── ORIGEM: demanda de OP ou demanda geral ───────────────────────────────────
// Com a unificação (21/09/2026) o quadro recebe TODA demanda de compra. O que
// diferencia uma da outra é só isto — e é o que o comprador precisa ver de
// relance no card e no detalhe.
function SeloOrigemCompra({ p, grande = false }: { p: any; grande?: boolean }) {
  const o = origemDaRequisicao(p);
  return (
    <span className={'acn-cmp-origem' + (grande ? ' grande' : '')} data-acn-familia={o.tipo === 'estoque' ? 'ok' : o.tipo === 'op' ? 'marca' : 'neutro'}
      title={o.detalhe ? `${o.label}: ${o.detalhe}` : o.label}>
      <Icone path={o.tipo === 'op' ? mdiLinkVariant : o.tipo === 'estoque' ? mdiPackageVariantClosed : mdiClipboardTextOutline} size={12} /> {o.label}{o.detalhe && grande ? ` · ${o.detalhe}` : ''}
    </span>
  );
}

// ─── VÍNCULO / LINK na requisição ──────────────────────────────────────────────
function VinculoLinkCompra({ p, compacto = false }: { p: any; compacto?: boolean }) {
  if (!p?.vinculo_tipo && !p?.link_url) return null;
  return (
    <div className={'acn-cmp-vinculo' + (compacto ? ' compacto' : '')}>
      {p.vinculo_tipo && (
        <Botao pequeno variante="discreto" className="acn-cmp-link" icone={mdiLinkVariant}
          onClick={e => { e.stopPropagation(); abrirVinculo({ tipo: p.vinculo_tipo, id: p.vinculo_id, descricao: p.vinculo_descricao }); }}
          title="Abrir registro vinculado">
          {TIPO_LABEL[p.vinculo_tipo] || p.vinculo_tipo}: {p.vinculo_descricao}
        </Botao>
      )}
      {p.link_url && (
        <a href={p.link_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="acn-cmp-link-web acn-prod-ic">
          <Icone path={mdiEarth} size={12} /> link
        </a>
      )}
    </div>
  );
}

function ModalVinculoCompra({ pedido, onClose, onSalvo }) {
  const [vinculo, setVinculo] = useState(pedido.vinculo_tipo ? { tipo: pedido.vinculo_tipo, id: pedido.vinculo_id, descricao: pedido.vinculo_descricao } : null);
  const [link, setLink] = useState(pedido.link_url || '');
  const [salvando, setSalvando] = useState(false);
  const emAcao = useRef(false);   // 7.58: clique duplo gravava duas vezes
  const salvar = async () => {
    if (emAcao.current) return;
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) { alert('O link precisa começar com http:// ou https://'); return; }
    if (vinculo?.tipo === 'compra' && String(vinculo.id) === String(pedido.id)) { alert('Não dá para vincular a requisição a ela mesma.'); return; }
    emAcao.current = true;
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      vinculo_tipo: vinculo?.tipo || null, vinculo_id: vinculo?.id || null, vinculo_descricao: vinculo?.descricao || null, link_url: l || null,
    }).eq('id', pedido.id);
    emAcao.current = false;
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSalvo();
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cmp-j480" role="dialog" aria-label="Vínculo e link">
        <div className="acn-modal-cab">
          <span className="modal-title acn-prod-ic"><Icone path={mdiLinkVariant} size={16} /> Vínculo e link — {pedido.numero_pedido}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda"><DescricaoCompacta texto={pedido.descricao_material} /></div>
          <div className="form-group">
            <label className="acn-label">Vincular a um PV, OP, OS, outra compra ou OFI</label>
            <VinculoPicker value={vinculo} onSelect={setVinculo} onClear={() => setVinculo(null)} />
          </div>
          <div className="form-group">
            <label className="acn-label">Link (opcional)</label>
            <input className="acn-input" placeholder="https://..."
              value={link} onChange={e => setLink(e.target.value)} />
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</Botao>
          <Botao onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── RESUMO DA SOLICITAÇÃO ─────────────────────────────────────────────────────
// ─── TODOS OS RECEBIDOS ───────────────────────────────────────────────────────
// A coluna do quadro mostra só os 10 mais recentes; o histórico inteiro fica
// aqui, em lista, com busca — é consulta, não fila de trabalho.
function ModalRecebidos({ lista, canVerValor, onAbrir, onClose }) {
  const [busca, setBusca] = useState('');
  const moedaBr = (v:any) => v ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const dataBr  = (d:any) => d ? new Date(String(d).slice(0,10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const filtrados = busca.trim()
    ? lista.filter((p:any) => combinaBusca([p.numero_pedido, p.numero_oc, p.descricao_material, p.fornecedor, p.opl], busca))
    : lista;
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cmp-recebidos" role="dialog" aria-label="Recebidos">
        <div className="acn-modal-cab acn-cmp-recebidos-cab">
          <span className="modal-title acn-prod-ic"><Icone path={mdiClipboardTextOutline} size={16} /> Recebidos ({lista.length})</span>
          <input className="acn-input acn-cmp-recebidos-busca" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar nos recebidos"
            placeholder="Buscar por número, OC, descrição, fornecedor ou OP" />
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-rolagem acn-cmp-recebidos-lista">
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Pedido</th><th>Descrição</th><th>Fornecedor</th>
                <th>Recebido em</th>{canVerValor && <th className="acn-dir">Valor</th>}
              </tr></thead>
              <tbody>
                {filtrados.map((p:any) => (
                  <tr key={p.id} onClick={() => onAbrir(p)} className="acn-cmp-clicavel"
                    title="Abrir o resumo da requisição">
                    <td>
                      <strong>{p.numero_pedido}</strong>
                      {p.numero_oc && <div className="acn-cmp-oc acn-prod-ic"><Icone path={mdiClipboardTextOutline} size={11} /> {p.numero_oc}</div>}
                      <SeloOrigemCompra p={p} />
                    </td>
                    <td className="acn-cmp-desc"><DescricaoCompacta texto={p.descricao_material} linhas={1} /></td>
                    <td>{p.fornecedor || '—'}</td>
                    <td className="acn-num">{dataBr(p.data_conclusao)}</td>
                    {canVerValor && <td className="acn-dir acn-num acn-txt-ok">{moedaBr(p.valor_compra)}</td>}
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr><td colSpan={canVerValor ? 5 : 4} className="acn-centro acn-fraco">Nada encontrado para "{busca}".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumoCompraModal({ pedido: p, canVerValor, departamentos, onClose, currentUser }) {
  const [cotacoes, setCotacoes] = useState<any[] | null>(null);
  const [aprovacoes, setAprovacoes] = useState<any[]>([]);
  const [acomp, setAcomp] = useState<any[]>([]);
  // Etapa 7.58 (06/10/2026): leitura que falha não pode parecer "Nenhuma cotação lançada" nem sumir com as aprovações e o acompanhamento.
  const [errosLeitura, setErrosLeitura] = useState<string[]>([]);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    setErrosLeitura([]);
    const falhou = (o: string, e: any) => setErrosLeitura(prev => [...prev, `${o} (${e.message})`]);
    supabase.from('pcp_cotacoes_fornecedores').select('*').eq('pedido_id', p.id).order('criado_em', { ascending: true })
      .then(({ data, error }) => { if (error) { falhou('as cotações', error); setCotacoes(prev => prev ?? []); } else setCotacoes(data || []); });
    supabase.from('pcp_aprovacoes').select('*').eq('pedido_id', p.id).order('nivel', { ascending: true })
      .then(({ data, error }) => { if (error) falhou('as aprovações', error); else setAprovacoes(data || []); });
    supabase.from('op_acompanhamentos').select('*').eq('referencia_id', String(p.id)).order('criado_em', { ascending: false }).limit(20)
      .then(({ data, error }) => { if (error) falhou('o acompanhamento', error); else setAcomp(data || []); });
  }, [p.id, tentativa]);
  const moeda = (v: any) => v != null && v !== '' ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(v)) : '—';
  const data = (d: any) => d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR') : '—';
  const dep = (departamentos || []).find((d: any) => d.id === p.departamento_id);
  const Linha = ({ k, v }) => (v === null || v === undefined || v === '' ? null : (
    <div className="acn-ficha-linha acn-cmp-ficha">
      <span>{k}</span><span>{v}</span>
    </div>
  ));
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cmp-j680" role="dialog" aria-label="Resumo da solicitação">
        <div className="acn-modal-cab acn-cmp-resumo-cab">
          <div className="acn-cmp-resumo-tit">
            <span className="modal-title acn-prod-ic"><Icone path={mdiMagnify} size={16} /> Resumo — {p.numero_pedido}</span>
            <div className="acn-cmp-resumo-selos">
              <Selo familia={FAMILIA_COMPRA[p.status_compra] || 'neutro'}>{p.status_compra || '—'}</Selo>
              {p.numero_oc && <span className="acn-cmp-oc acn-prod-ic"><Icone path={mdiClipboardTextOutline} size={11} /> {p.numero_oc}</span>}
              <SeloOrigemCompra p={p} grande />
            </div>
          </div>
          <Botao icone={mdiPrinterOutline} onClick={() => imprimirSolicitacao(p)}>Imprimir</Botao>
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-quadro-titulo">Solicitação</div>
          <div className="acn-quadro acn-prod-texto">
            {p.descricao_material || '—'}
          </div>
          <div>
            <Linha k="Tipo" v={origemDaRequisicao(p).label} />
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
          </div>
          {p.observacoes_compra && (
            <>
              <div className="acn-quadro-titulo">Observações</div>
              <div className="acn-prod-texto"><Linkify text={p.observacoes_compra} /></div>
            </>
          )}
          {errosLeitura.length > 0 && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={() => setTentativa(n => n + 1)}>Tentar de novo</Botao>}>
              Não foi possível ler {errosLeitura.join('; ')}. Isso não quer dizer que não haja.
            </Faixa>
          )}
          <div className="acn-quadro-titulo">Cotações de fornecedores</div>
          {cotacoes === null ? <div className="acn-fraco">Carregando...</div> : cotacoes.length === 0 ? (
            <div className="acn-fraco">Nenhuma cotação lançada.</div>
          ) : cotacoes.map((c: any) => (
            <div key={c.id} className={'acn-cmp-res-cot' + (c.id === p.vencedora_id ? ' venc' : '')}>
              <span className={'acn-cmp-cresce' + (c.id === p.vencedora_id ? ' acn-forte' : '')}>{c.id === p.vencedora_id ? <Icone path={mdiTrophyOutline} size={13} /> : null}{c.id === p.vencedora_id ? ' ' : ''}{c.fornecedor_nome}</span>
              {canVerValor && <span className="acn-ajuda">{textoComposicao(c)}</span>}
              {canVerValor && <span>{moeda(c.valor)}</span>}
              {c.prazo_entrega && <span className="acn-ajuda">prazo {c.prazo_entrega}</span>}
              {c.arquivo_url && <a href={c.arquivo_url} target="_blank" rel="noreferrer" aria-label="Anexo da cotação"><Icone path={mdiPaperclip} size={13} /></a>}
            </div>
          ))}
          {aprovacoes.length > 0 && (
            <>
              <div className="acn-quadro-titulo">Aprovações</div>
              {aprovacoes.map((a: any) => (
                <div key={a.id} className="acn-cmp-res-apr">
                  <span className={'acn-prod-ic ' + (a.status === 'aprovado' ? 'acn-txt-ok' : a.status === 'reprovado' ? 'acn-txt-erro' : 'acn-txt-atencao')}>
                    <Icone path={a.status === 'aprovado' ? mdiCheckCircleOutline : a.status === 'reprovado' ? mdiCloseCircleOutline : mdiClockOutline} size={13} />
                  </span>{' '}{a.nivel_nome || `Nível ${a.nivel}`}
                  <span className="acn-ajuda"> · {a.status}{a.respondido_por_nome ? ` por ${a.respondido_por_nome}` : ''}</span>
                </div>
              ))}
            </>
          )}
          <div className="acn-quadro-titulo">Anexos</div>
          <AnexosCompra pedido={p} currentUser={currentUser} podeEditar={podeEditarSolicitacao(p, currentUser)} />
          <div className="acn-quadro-titulo">Histórico da requisição</div>
          <HistoricoCompra pedidoId={p.id} />
          {acomp.length > 0 && (
            <>
              <div className="acn-quadro-titulo">Acompanhamento (últimos)</div>
              {acomp.map((a: any) => (
                <div key={a.id} className="acn-cmp-res-ac">
                  <span className="acn-ajuda">{a.criado_em ? new Date(a.criado_em).toLocaleString('pt-BR') : ''} · {a.usuario_nome}</span>
                  <div className="acn-prod-texto"><Linkify text={a.texto} /></div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ESPERANDO A SUA APROVAÇÃO (Etapa 8 do plano de UX, 30/09/2026) ──────────
// Quem aprova compra (as pessoas marcadas no Admin) só ficava sabendo por menção e e-mail: para saber o
// que esperava por ele, tinha de abrir a lista, filtrar por "Aguardando Aprovação" e conferir um a um.
// Este painel fica no topo e só aparece para quem tem a permissão de aprovar — a mesma regra do botão de
// aprovar (`podeAprovarCompra`). O pedido fica na caixa de TODOS os aprovadores e qualquer um resolve
// (regra de 24/09/2026), por isso a lista é a mesma para os quatro. Não depende do filtro de status da tela.
const esperaTexto = (iso: any) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '—';
  const h = (Date.now() - t) / 3600000;
  if (h < 1) return 'há menos de 1 h';
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
};

function PainelEsperandoMinhaAprovacao({ lista, outros, canVerValor, fmt, onAbrir }: any) {
  if (!lista.length) {
    return <div className="acn-ajuda acn-prod-ic acn-cmp-vazio-aprov"><Icone path={mdiCheck} size={13} /> Nenhuma compra esperando a sua aprovação.</div>;
  }
  return (
    <div className="acn-quadro tom-atencao acn-cmp-aprov">
      <div className="acn-quadro-titulo">Esperando a sua aprovação ({lista.length})</div>
      <div className="acn-ajuda">
        Qualquer aprovador pode decidir{outros.length ? `; também recebem: ${outros.join(', ')}` : ''}. Mais antigas primeiro.
      </div>
      {lista.map((p: any) => (
        <div key={p.id} className="acn-cmp-aprov-item">
          <div className="acn-cmp-aprov-ped">
            <strong>{p.numero_pedido}</strong>
            <div className="acn-ajuda">aguardando {esperaTexto(p._desde)}</div>
          </div>
          <div className="acn-cmp-aprov-desc">
            <DescricaoCompacta texto={p.descricao_material} />
            <div className="acn-ajuda">
              Pedido por {p.criado_por_nome || '—'}{p.opl ? ` · OP ${p.opl}` : ''}
            </div>
          </div>
          <div className="acn-cmp-aprov-cot">
            <div>{p._cotacoes ? `${p._cotacoes} ${p._cotacoes === 1 ? 'cotação' : 'cotações'}` : <span className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> sem cotação</span>}</div>
            <div className="acn-ajuda">
              {p.vencedora_id
                ? `Vencedora: ${p.fornecedor || '—'}${canVerValor && p.valor_compra ? ` — ${fmt(p.valor_compra)}` : ''}`
                : 'Vencedora ainda não escolhida'}
            </div>
          </div>
          <Botao variante="primario" pequeno onClick={() => onAbrir(p)}>Abrir e decidir</Botao>
        </div>
      ))}
    </div>
  );
}

export default function ComprasTab({ currentUser }) {
  const [pedidos, setPedidos]   = useState([]);
  // Etapa 7.57: um clique duplo em salvar/aprovar/rejeitar/excluir gravava duas vezes (duas linhas de aprovação, duas cotações
  // iguais, dois avisos aos aprovadores) — uma ação por tipo (e por registro).
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  // Compras que esperam aprovação (só para quem aprova): null = ainda não carregou ou não é aprovador
  const [esperando, setEsperando] = useState<any[] | null>(null);
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
  // Quem aprova compra (pessoas marcadas no Admin). Serve para avisar todos
  // quando um pedido vai para aprovação e para dizer na tela quem está sendo
  // esperado — antes a tela mostrava o nome do PERFIL, que não ajuda ninguém.
  const [aprovadoresCompra, setAprovadoresCompra] = useState<any[]>([]);
  const nomesAprovadores = () => aprovadoresCompra.map((a: any) => a.nome).join(', ') || '—';
  const [respondendoAprovacao, setRespondendoAprovacao] = useState(false);

  // Prazo Prometido de Entrega (Fase 1)
  const [modalPrazoProm, setModalPrazoProm]     = useState<any>(null);
  // Comprador ajusta o prazo de entrega (prev. recebimento) depois da compra
  const [modalPrazoEntrega, setModalPrazoEntrega] = useState<any>(null);   // { p, data, motivo }
  const salvarPrazoEntrega = umaVez('prazo-entrega', async () => {
    const { p, data, motivo } = modalPrazoEntrega;
    if (!data) { alert('Informe a nova data de entrega.'); return; }
    const antes = p.data_prevista_recebimento ? String(p.data_prevista_recebimento).slice(0, 10) : null;
    const { error } = await supabase.from('pcp_pedidos_compra').update({ data_prevista_recebimento: data }).eq('id', p.id);
    if (error) { alert('Não foi possível salvar o prazo: ' + error.message); return; }
    logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: p.id, changeType: 'UPDATE',
      oldRow: { data_prevista_recebimento: antes }, newRow: { data_prevista_recebimento: data }, user: currentUser });
    const br = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    await registrarHistorico(p.id, { tipo: 'edicao', motivo: motivo?.trim() || null,
      dados: { campos: [{ campo: 'Prazo de entrega', de: br(antes), para: br(data) }] } }, currentUser);
    setModalPrazoEntrega(null);
    load();
  });
  const [prazoPromData, setPrazoPromData]       = useState('');
  const [prazoPromDestino, setPrazoPromDestino] = useState<'producao'|'cliente'>('producao');
  const [salvandoPrazoProm, setSalvandoPrazoProm] = useState(false);

  // Acompanhamento (timeline) — reaproveita OplAcompModal
  const [modalAcomp, setModalAcomp]             = useState<any>(null);
  // Resumo da solicitação e vínculo/link
  const [modalResumo, setModalResumo]           = useState<any>(null);
  const [modalVinculo, setModalVinculo]         = useState<any>(null);
  const [modalRecebidos, setModalRecebidos]     = useState<any[]|null>(null);
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
    if (!d) return <span className="acn-fraco">—</span>;
    // data_prevista_recebimento é timestamptz no banco — supabase-js retorna ISO completo
    // (ex: "2026-08-30T00:00:00+00:00"), não só "YYYY-MM-DD". Pega só a data antes de remontar.
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime()-hoje.getTime())/86400000);
    const str = dt.toLocaleDateString('pt-BR');
    if (diff < 0)   return <span className="acn-txt-erro acn-prod-ic">{str} <Icone path={mdiAlertOutline} size={12} /></span>;
    if (diff === 0) return <span className="acn-txt-atencao">Hoje!</span>;
    if (diff <= 3)  return <span className="acn-txt-atencao">{str}</span>;
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
    // `podeAprovarCompra` na lista (30/09/2026): o painel "Esperando a sua aprovação" só carrega para quem
    // aprova, e a marca chega DEPOIS da tela abrir (a sessão é atualizada do banco). Sem isto, o intervalo de
    // 30 s ficava preso ao usuário de antes, sem a marca, e o painel nunca aparecia.
  }, [filtro, podeAprovarCompra(currentUser)]);

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

  // Mesa de Cotações: se a leitura das cotações ou das aprovações falhar, a mesa não pode agir como se não houvesse cotação
  // nem aprovação pendente (a ausência de aprovação pendente liberava o botão "Aprovar").
  const [erroMesa, setErroMesa] = useState('');

  // Etapa 7.57 (06/10/2026): leitura da configuração que falha não pode parecer "não há centro de custo / alçada /
  // departamento / aprovador" (alçada vazia significava "não precisa de aprovação"). A lista que já estava fica e a tela avisa.
  const [erroConfig, setErroConfig] = useState<string[]>([]);
  const marcarErroConfig = (nome: string, msg: string | null) =>
    setErroConfig(prev => { const sem = prev.filter(x => !x.startsWith(nome + ':')); return msg ? [...sem, `${nome}: ${msg}`] : sem; });

  const loadCentros = async () => {
    const { data, error } = await supabase.from('centros_custo').select('*').eq('ativo', true).order('codigo');
    marcarErroConfig('centros de custo', error ? error.message : null);
    if (!error) setCentrosCusto(data || []);
  };

  const loadAlcadas = async () => {
    const { data, error } = await supabase.from('compras_alcadas_aprovacao').select('*').order('nivel');
    marcarErroConfig('alçadas de aprovação', error ? error.message : null);
    if (!error) setAlcadasConfig(data || []);
    const ap = await lerAprovadoresCompra();
    marcarErroConfig('quem aprova', ap.error);
    if (!ap.error) setAprovadoresCompra(ap.data);
  };

  const loadDepartamentos = async () => {
    const { data, error } = await supabase.from('compras_departamentos').select('*').eq('ativo', true).order('nome');
    marcarErroConfig('departamentos', error ? error.message : null);
    if (!error) setDepartamentosConfig(data || []);
  };
  const recarregarConfig = () => { loadCentros(); loadAlcadas(); loadDepartamentos(); };

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

  const salvarCentro = umaVez('centro', async () => {
    if (!modalCentro) return;
    setSalvandoCentro(true);
    if (centroTipo === 'custom') {
      if (!centroCustom) { alert('Selecione um centro de custo.'); setSalvandoCentro(false); return; }
      // Grava a FK real (centro_custo_id) e também o texto (fallback para
      // telas que ainda leem só centro_custo — ex: agrupamento no Financeiro).
      const centro = centrosCusto.find((c:any) => c.id === centroCustom);
      const label = centro ? labelHierarquico(centro, centrosCusto) + ' — ' + centro.nome : '';
      const { error: erroCentro } = await supabase.from('pcp_pedidos_compra').update({ centro_custo_id: centroCustom, centro_custo: label }).eq('id', modalCentro.id);
      setSalvandoCentro(false);
      if (erroCentro) { alert('Não foi possível salvar o centro de custo: ' + erroCentro.message); return; }   // 7.57: fechava a janela e o pedido seguia sem centro
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
    const { error: erroCentroTxt } = await supabase.from('pcp_pedidos_compra').update({ centro_custo: valor, centro_custo_id: null }).eq('id', modalCentro.id);
    setSalvandoCentro(false);
    if (erroCentroTxt) { alert('Não foi possível salvar o centro de custo: ' + erroCentroTxt.message); return; }   // 7.57
    setModalCentro(null);
    load();
  });

  const abrirModalDepartamento = (p: any) => {
    setModalDepartamento(p);
    setDepartamentoSelecionado(p.departamento_id || '');
  };

  const salvarDepartamento = umaVez('departamento', async () => {
    if (!modalDepartamento) return;
    if (!departamentoSelecionado) { alert('Selecione um departamento.'); return; }
    setSalvandoDepartamento(true);
    const { error: erroDep } = await supabase.from('pcp_pedidos_compra')
      .update({ departamento_id: departamentoSelecionado }).eq('id', modalDepartamento.id);
    setSalvandoDepartamento(false);
    if (erroDep) { alert('Não foi possível salvar o departamento: ' + erroDep.message); return; }   // 7.57: sem departamento a aprovação do gestor nem nasce
    setModalDepartamento(null);
    load();
  });

  const [queryError, setQueryError] = useState<string|null>(null);

  // Lista própria, à parte do filtro de status da tela: o painel "Esperando a sua aprovação" tem de mostrar
  // tudo o que espera, qualquer que seja o filtro escolhido. Três leituras pequenas, e só para quem aprova.
  const carregarEsperando = async () => {
    if (!podeAprovarCompra(currentUser)) { setEsperando(null); return; }
    const { data: peds, error } = await supabase.from('pcp_pedidos_compra').select('*')
      .eq('status_compra', 'Aguardando Aprovação').order('data_criacao', { ascending: true });
    if (error) { console.warn('Compras esperando aprovação: falha ao ler —', error.message); return; }
    const ids = (peds || []).map((p: any) => p.id);
    const desde: Record<string, string> = {}, nCot: Record<string, number> = {};
    if (ids.length) {
      const [{ data: hist }, { data: cots }] = await Promise.all([
        supabase.from('pcp_pedidos_compra_historico').select('pedido_id,criado_em').in('pedido_id', ids).eq('status_para', 'Aguardando Aprovação'),
        supabase.from('pcp_cotacoes_fornecedores').select('pedido_id').in('pedido_id', ids),
      ]);
      // "aguardando há": a ÚLTIMA vez que entrou na etapa (um pedido devolvido e reenviado conta de novo)
      (hist || []).forEach((h: any) => { if (!desde[h.pedido_id] || h.criado_em > desde[h.pedido_id]) desde[h.pedido_id] = h.criado_em; });
      (cots || []).forEach((c: any) => { nCot[c.pedido_id] = (nCot[c.pedido_id] || 0) + 1; });
    }
    setEsperando((peds || [])
      .map((p: any) => ({ ...p, _desde: desde[p.id] || p.ultima_movimentacao_em || p.data_criacao, _cotacoes: nCot[p.id] || 0 }))
      .sort((a: any, b: any) => String(a._desde).localeCompare(String(b._desde))));
  };

  const load = async (silent=false) => {
    carregarEsperando();
    if (!silent) setLoading(true);
    setQueryError(null);
    let q = supabase.from('pcp_pedidos_compra').select('*').order('data_criacao', {ascending:false});
    if (filtro) q = q.eq('status_compra', filtro);
    const { data, error } = await q;
    // 7.57: a releitura de 30 s que falhava esvaziava a lista (parecia "nenhuma requisição"); agora a lista fica. Numa leitura
    // pedida (troca de filtro, recarregar) segue vazia, porque a lista antiga seria de outro filtro.
    if (error) { setQueryError(error.message); if (!silent) { setLoading(false); setPedidos([]); } return; }
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
      if (atual === 'Recebido') { alert('Uma compra já recebida não pode ser descartada.'); return; }
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
    // Escolher a cotação vencedora é o TRABALHO da etapa "Aguardando Aprovação",
    // não um pré-requisito para chegar nela (ajuste de 22/09/2026). Então sair de
    // "Em Andamento" só exige ter cotação lançada — há o que comparar e aprovar.
    if (atual === 'Em Andamento' && destino === 'Aguardando Aprovação') {
      if (!gestor) { alert('Só Compras, gerentes ou administradores enviam para aprovação.'); return; }
      enviarParaAprovacao(p); return;
    }
    // Ir direto para "Aprovado" (pulando a aprovação) continua exigindo a
    // vencedora — é ela que define o valor e dispara a alçada.
    if ((atual === 'Em Andamento' && destino === 'Aprovado') || (atual === 'Aguardando Aprovação' && destino === 'Aprovado')) {
      abrirModalCotacoes(p);
      mostrarDica('Escolha a cotação vencedora e clique em "Aprovar" nela — é o que fecha esta etapa.');
      return;
    }
    if (atual === 'Aprovado' && destino === 'Comprado') {
      if (!gestor) { alert('Só Compras, gerentes ou administradores confirmam a compra.'); return; }
      abrirFluxo('confirmar', p); return;
    }
    if (atual === 'Comprado' && destino === 'Recebido') {
      // negação de permissão: tom explícito, porque o texto diz "registrado" e o palpite saía verde (29/09/2026)
      if (!gestor && currentUser?.perfil !== 'Almoxarifado') { mostrarAviso('O recebimento é registrado por Compras, Almoxarifado, gerentes ou administradores.', 'erro'); return; }
      abrirFluxo('receber', p); return;
    }
    alert(`Avance uma etapa por vez: depois de "${atual}" vem "${PROXIMA_ETAPA[atual] || '—'}".`);
  };
  const mostrarDica = (t: string) => alert(t);

  // "Em Andamento" → "Aguardando Aprovação": sem vencedora, só com cotação.
  // Quem escolhe e aprova a vencedora é a própria etapa de aprovação.
  const enviarParaAprovacao = (p: any) => umaVez('enviar-aprov-' + p.id, async () => {
    const { count, error: erroCont } = await supabase.from('pcp_cotacoes_fornecedores')
      .select('id', { count: 'exact', head: true }).eq('pedido_id', p.id);
    if (erroCont) { alert('Não foi possível conferir as cotações do pedido: ' + erroCont.message); return; }   // 7.57: lia como "sem cotação"
    if (!count) {
      alert('Lance pelo menos uma cotação antes de enviar para aprovação — sem cotação não há o que aprovar.');
      abrirModalCotacoes(p);
      return;
    }
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ status_compra: 'Aguardando Aprovação' }).eq('id', p.id);
    if (error) { alert('Não foi possível enviar para aprovação: ' + error.message); return; }
    await registrarHistorico(p.id, { tipo: 'avanco', de: 'Em Andamento', para: 'Aguardando Aprovação',
      motivo: `${count} cotação(ões) lançada(s) — aguardando escolha e aprovação da vencedora` }, currentUser);
    await mencionarSolicitante(p,
      `Sua requisição ${p.numero_pedido} está aguardando a escolha e aprovação da cotação vencedora.`,
      currentUser, 'aguardando_aprovacao');
    load(true);
  })();

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
    setErroMesa('');
    setCotacoes([]); setAprovacoesPedido([]);   // 7.57: não mostrar as cotações/aprovações do pedido anterior se a leitura deste falhar
    const { data, error } = await supabase.from('pcp_cotacoes_fornecedores')
      .select('*').eq('pedido_id', p.id).order('criado_em', { ascending: true });
    if (error) setErroMesa('as cotações (' + error.message + ')');
    else setCotacoes(data || []);
    setLoadingCotacoes(false);
    carregarAprovacoes(p.id);
  };

  // Devolve as aprovações do pedido, ou null se a leitura falhou (aí a mesa fica travada para aprovar até recarregar)
  const carregarAprovacoes = async (pedidoId: string) => {
    const { data, error } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedidoId).order('nivel', { ascending: true });
    if (error) { setErroMesa(prev => (prev ? prev + ' e ' : '') + 'as aprovações (' + error.message + ')'); return null; }
    setAprovacoesPedido(data || []);
    return data || [];
  };

  const adicionarCotacao = umaVez('cotacao', async () => {
    if (!modalCotacoes) return;
    if (erroMesa) { alert('A mesa não conseguiu ler ' + erroMesa + '. Feche e abra a mesa de novo antes de lançar cotação.'); return; }   // 7.57: a contagem de cotações decide a aprovação do departamento
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
      const resDep = await dispararAprovacaoDepartamento(modalCotacoes);
      if (resDep.erro) alert('A cotação foi salva, mas a aprovação do departamento NÃO foi criada: ' + resDep.erro + '\n\nAvise quem aprova ou peça para refazer a cotação.');
      else if (resDep.avisoFalhou) alert('A cotação foi salva e a aprovação do departamento foi criada, mas o aviso aos aprovadores não saiu. Avise-os diretamente.');
    }
    setNovaCotacao({ ...VAZIO_COTACAO, quantidade: String(modalCotacoes.quantidade || 1) });
    setNovoAnexoCotacao(null);
    abrirModalCotacoes(modalCotacoes);
  });

  // ── Aprovação por Departamento ────────────────────────────────────────────
  // Devolve { erro } se a aprovação não nasceu e { avisoFalhou } se nasceu mas o aviso aos aprovadores não saiu (7.57).
  // Lê o departamento do pedido no banco na hora (não da lista da tela): lista vazia por falha de leitura pulava a aprovação.
  const dispararAprovacaoDepartamento = async (pedido: any): Promise<{ erro?: string; avisoFalhou?: boolean }> => {
    const { data: departamento, error: erroDepLer } = await supabase.from('compras_departamentos')
      .select('*').eq('id', pedido.departamento_id).eq('ativo', true).maybeSingle();
    if (erroDepLer) return { erro: 'não foi possível ler o departamento (' + erroDepLer.message + ')' };
    if (!departamento) return {};
    const { error: erroApr } = await supabase.from('pcp_aprovacoes').insert([{
      pedido_id: pedido.id, tipo: 'departamento', nivel: 0, nivel_nome: departamento.nome,
      aprovador_id: departamento.gestor_id, aprovador_nome: departamento.gestor_nome,
      valor_no_momento: null, status: 'pendente',
      solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
    }]);
    if (erroApr) return { erro: erroApr.message };
    const avisou = await notificarGestorDepartamento(pedido, departamento);
    return avisou ? {} : { avisoFalhou: true };
  };

  // Vai para TODOS que aprovam compra, não só para o gestor do departamento:
  // desde 24/09/2026 quem aprova são as quatro pessoas marcadas no Admin, em
  // qualquer caminho. O nome do departamento continua no texto, porque ajuda
  // a entender de onde veio o pedido.
  // Devolve true se TODOS os avisos saíram (7.57: a falha era engolida e quem aprova nunca ficava sabendo).
  const notificarGestorDepartamento = async (pedido: any, departamento: any): Promise<boolean> => {
    try {
      const { data: aprovadores, error: erroAp } = await lerAprovadoresCompra();
      if (erroAp) { console.warn('Falha ao ler quem aprova:', erroAp); return false; }
      if (!aprovadores.length) return false;
      let todos = true;
      const texto = `Nova cotação lançada — pedido ${pedido.numero_pedido} (${departamento.nome}): ${pedido.descricao_material}`;
      for (const ap of aprovadores) {
        const { error: erroMen } = await supabase.from('mencoes').insert({
          mencionado_id: String(ap.id), mencionado_nome: ap.nome,
          mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
          contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
          contexto_descricao: `Pedido ${pedido.numero_pedido}`,
          campo: 'aprovacao_departamento', texto_trecho: texto,
          aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
        });
        if (erroMen) { todos = false; console.warn('Falha ao avisar ' + ap.nome + ':', erroMen.message); }
      }
      const emails = aprovadores.map((a: any) => a.email).filter(Boolean);
      if (emails.length) {
        const html = `<h3>Nova cotação para avaliar</h3>
          <p><strong>Departamento: ${departamento.nome}</strong></p>
          <p>Pedido: ${pedido.numero_pedido}<br>Descrição: ${pedido.descricao_material}</p>
          <p>Acesse o sistema (aba Compras) para acompanhar, aprovar ou rejeitar.</p>`;
        await supabase.functions.invoke('send-email', {
          body: { to: emails, subject: `Nova cotação — Pedido ${pedido.numero_pedido}`, html },
        });
      }
      return todos;
    } catch (e) { console.warn('Falha ao notificar aprovadores:', e); return false; }
  };

  const excluirCotacao = (id: string) => umaVez('excluir-cotacao-' + id, async () => {
    // A vencedora, uma vez que a compra já foi Aprovada/Comprada, não pode
    // simplesmente sumir — se o valor dela estava errado, o caminho é
    // corrigir (✏️ Editar), não excluir (perderia o registro/rastreio).
    if (id === vencedoraId && ['Aprovado','Comprado'].includes(modalCotacoes?.status_compra)) {
      // o texto diz "aprovada/comprada" e o palpite saía verde, mas é uma recusa (29/09/2026)
      mostrarAviso('Esta é a cotação vencedora de uma compra já aprovada/comprada — use "Editar" para corrigir o valor em vez de excluir.', 'atencao');
      return;
    }
    if (!await confirmar('Remover esta cotação?')) return;
    const { error: erroExc } = await supabase.from('pcp_cotacoes_fornecedores').delete().eq('id', id);
    if (erroExc) { alert('Não foi possível remover a cotação: ' + erroExc.message); return; }   // 7.57: seguia como se tivesse removido
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalCotacoes(modalCotacoes);
  })();

  const iniciarEdicaoCotacao = (c: any) => {
    setEditandoCotacaoId(c.id);
    setEditCotacaoForm(formDaCotacao(c, modalCotacoes?.quantidade));
  };

  // Corrige uma cotação já lançada (Admin). Se for a vencedora do pedido,
  // propaga o novo total pra pcp_pedidos_compra.valor_compra — é esse o
  // campo que Centro de Custo/Financeiro de fato leem, então é aqui que o
  // erro "entrou errado no centro de custo" se corrige de verdade.
  const salvarEdicaoCotacao = (c: any) => umaVez('editar-cotacao-' + c.id, async () => {
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
      const { error: erroValor } = await supabase.from('pcp_pedidos_compra').update({ valor_compra: novoValorTotal }).eq('id', modalCotacoes.id);
      // 7.57: a cotação era corrigida e o valor do pedido (o que o Financeiro e o centro de custo leem) seguia o antigo, sem aviso
      if (erroValor) alert('A cotação foi corrigida, mas o VALOR DO PEDIDO (que o Financeiro lê) não foi atualizado: ' + erroValor.message + '\n\nCorrija de novo para tentar outra vez.');
      else logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: modalCotacoes.id, changeType: 'UPDATE',
        oldRow: { valor_compra: c.valor }, newRow: { valor_compra: novoValorTotal }, user: currentUser });
    }
    setSalvandoEdicaoCotacao(false);
    setEditandoCotacaoId(null);
    await abrirModalCotacoes(modalCotacoes);
    setFiltro(''); load();
  })();

  // ── Alçadas de Aprovação (Fase 2) ─────────────────────────────────────────
  // Devolve true se TODOS os avisos saíram (7.57).
  const notificarAprovadoresNivel = async (pedido: any, nivelRow: any): Promise<boolean> => {
    try {
      // Avisa TODOS que podem aprovar, não os que têm certo perfil: o pedido
      // fica na caixa dos quatro e qualquer um resolve (regra de 24/09/2026).
      const { data: aprovadores, error: erroAp } = await lerAprovadoresCompra();
      if (erroAp) { console.warn('Falha ao ler quem aprova:', erroAp); return false; }
      if (!aprovadores.length) return false;
      let todos = true;
      const valorFmt = fmt(pedido.valor_compra);
      const texto = `Aprovação necessária (Nível ${nivelRow.nivel} — ${nivelRow.nome}): pedido ${pedido.numero_pedido} — ${pedido.descricao_material} — ${valorFmt}`;
      for (const ap of aprovadores) {
        const { error: erroMen } = await supabase.from('mencoes').insert({
          mencionado_id: String(ap.id), mencionado_nome: ap.nome,
          mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
          contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
          contexto_descricao: `Pedido ${pedido.numero_pedido}`,
          campo: 'aprovacao_nivel', texto_trecho: texto,
          aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
        });
        if (erroMen) { todos = false; console.warn('Falha ao avisar ' + ap.nome + ':', erroMen.message); }
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
      return todos;
    } catch (e) { console.warn('Falha ao notificar aprovadores:', e); return false; }
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
  // Devolve null se a demanda nasceu e a mensagem do problema se não nasceu (7.57: a falha era engolida).
  const criarDemandaComprasFinalizada = async (pedidoId: string): Promise<string | null> => {
    try {
      const { data: pedido, error: erroPed } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', pedidoId).maybeSingle();
      if (erroPed) return erroPed.message;
      if (!pedido) return 'pedido não encontrado';
      const { error: erroDem } = await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Compras',
        descricao: `[COMPRA RECEBIDA] Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''} — ${pedido.descricao_material || ''} — Fornecedor: ${pedido.fornecedor || '—'} — ${fmt(pedido.valor_compra)}`,
        numero_opl: pedido.opl || null,
        status: 'Pendente',
        tipo_solicitacao: 'compra',
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
        data_abertura: new Date().toISOString(),
        logs_demanda: [{ texto: `Compra confirmada${pedido.numero_oc ? ` — OC ${pedido.numero_oc}` : ''}.`, usuario: currentUser?.nome, hora: new Date().toISOString() }],
      }]);
      return erroDem ? erroDem.message : null;
    } catch (e) { console.warn('Falha ao criar demanda de compra concluída:', e); return String((e as any)?.message || e); }
  };

  // Ponto único que decide, ao confirmar uma compra, se ela precisa de aprovação
  // (alçada disparada pelo valor) ou se pode ir direto pra 'Aprovado' (aguardando
  // a confirmação real da compra, ver confirmarCompra) como antes.
  const dispararOuConfirmar = async (pedidoId: string, extraUpdates: any): Promise<{ error: any; aguardandoAprovacao?: boolean; avisoFalhou?: boolean }> => {
    const valorCompra = extraUpdates.valor_compra;
    // 7.57: as alçadas vêm do banco na hora da decisão. Se a leitura da tela tivesse falhado, a lista vazia dizia "nenhuma
    // alçada dispara" e a compra ia direto para "Aprovado" sem a aprovação por valor.
    const { data: alcadasAtuais, error: erroAlc } = await supabase.from('compras_alcadas_aprovacao').select('*').order('nivel');
    if (erroAlc) return { error: { message: 'não foi possível ler as alçadas de aprovação (' + erroAlc.message + ') — nada foi alterado' } };
    const niveis = (alcadasAtuais || [])
      .filter(a => a.ativo && Number(a.valor_minimo) <= Number(valorCompra || 0))
      .sort((a,b) => a.nivel - b.nivel);
    // Pode já existir uma linha de aprovação por departamento pendente, criada na
    // 1ª cotação (ver dispararAprovacaoDepartamento) — nesse caso a compra também
    // precisa aguardar, mesmo que nenhuma alçada por valor tenha disparado agora.
    const { data: pendentesExistentes, error: erroPend } = await supabase.from('pcp_aprovacoes')
      .select('id').eq('pedido_id', pedidoId).eq('status', 'pendente').limit(1);
    if (erroPend) return { error: { message: 'não foi possível conferir as aprovações pendentes (' + erroPend.message + ') — nada foi alterado' } };   // 7.57: lia como "sem pendência" e pulava a aprovação do departamento
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
      const { error: erroNiveis } = await supabase.from('pcp_aprovacoes').insert(niveis.map(n => ({
        pedido_id: pedidoId, nivel: n.nivel, nivel_nome: n.nome, valor_no_momento: valorCompra,
        status: 'pendente', solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
      })));
      // 7.57: sem as linhas de aprovação o pedido ficava "Aguardando Aprovação" e ninguém conseguia aprovar. Quem tenta de novo
      // pela mesma cotação passa por aqui outra vez (o pedido já está no estado certo e as linhas nascem agora).
      if (erroNiveis) return { error: { message: 'o pedido foi para "Aguardando Aprovação", mas as linhas de aprovação NÃO foram criadas (' + erroNiveis.message + '). Clique em "Aprovar" na cotação de novo para tentar outra vez' } };
    }
    // Notifica o nível pendente de menor número — pode ser a linha de departamento
    // (nivel 0, já notificada quando criada) ou o 1º nível de alçada recém-criado.
    let avisoFalhou = false;
    const { data: pendentesOrdenados, error: erroOrd } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedidoId).eq('status', 'pendente').order('nivel', { ascending: true });
    if (erroOrd) avisoFalhou = true;
    const proximaPendencia = pendentesOrdenados?.[0];
    if (proximaPendencia && proximaPendencia.tipo !== 'departamento') {
      const nivelConfig = (alcadasAtuais || []).find(a => a.nivel === proximaPendencia.nivel);
      if (nivelConfig && !(await notificarAprovadoresNivel({ ...pedidoAtual, ...extraUpdates, id: pedidoId }, nivelConfig))) avisoFalhou = true;
    }
    return { error: null, aguardandoAprovacao: true, avisoFalhou };
  };

  // Marca a pendência de menor nível (de `lista`) como aprovada e resolve em
  // cascata — notifica o próximo nível se sobrar alçada, ou fecha pra
  // "Comprado" se não sobrar nada e já existir vencedora. Recebe `lista`/`pedido`
  // como parâmetro (em vez de ler do state) pra poder ser chamada logo após um
  // fetch fresco, sem depender do próximo render pra enxergar dados recém-criados.
  // Devolve { erro } se alguma gravação falhou (7.57) e { avisoFalhou } se o aviso ao próximo nível não saiu.
  const resolverPendenciaComoAprovada = async (lista: any[], pedido: any): Promise<{ erro?: string; avisoFalhou?: boolean }> => {
    const nivelAtivo = lista.find(a => a.status === 'pendente');
    if (!nivelAtivo) return {};
    let avisoFalhou = false;
    const { error: erroAprov } = await supabase.from('pcp_aprovacoes').update({
      status: 'aprovado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(),
    }).eq('id', nivelAtivo.id);
    if (erroAprov) return { erro: 'não foi possível registrar a aprovação (' + erroAprov.message + ')' };   // 7.57: seguia como se tivesse aprovado
    // Aprovou: acabou para TODO MUNDO. O pedido cai na caixa das quatro
    // pessoas que aprovam, e quando uma resolve não faz sentido as outras três
    // continuarem com o aviso pendurado (regra do usuário em 24/09/2026).
    // Diferente de alguém marcar a menção como resolvida sem aprovar, que só
    // limpa a caixa de quem marcou — dizer "resolvido" não aprova nada.
    await resolverMencoesDeTodos({ contexto: 'compra_aprovacao', contextoId: pedido.id,
      porNome: currentUser?.nome, motivo: 'aprovado' });
    const { data: restantes, error: erroRest } = await supabase.from('pcp_aprovacoes')
      .select('*').eq('pedido_id', pedido.id).eq('status', 'pendente').order('nivel', { ascending: true });
    if (erroRest) return { erro: 'a aprovação foi registrada, mas não foi possível conferir se faltam outros níveis (' + erroRest.message + ')' };
    if (restantes && restantes.length > 0) {
      if (restantes[0].tipo !== 'departamento') {
        const { data: alcadasAtuais, error: erroAlc } = await supabase.from('compras_alcadas_aprovacao').select('*').order('nivel');
        const proximaAlcada = (alcadasAtuais || alcadasConfig).find(a => a.nivel === restantes[0].nivel);
        if (erroAlc || !proximaAlcada || !(await notificarAprovadoresNivel(pedido, proximaAlcada))) avisoFalhou = true;
      }
      // linha de departamento: já foi notificada quando criada, nada a fazer aqui.
    } else {
      // Só marca como Aprovado se já existe cotação vencedora escolhida — aprovar
      // cedo a linha de departamento (antes do comprador confirmar a compra) não
      // deve sozinho fechar o pedido. A compra em si só fecha em confirmarCompra,
      // numa ação separada e explícita.
      const { data: pedidoAtual, error: erroVenc } = await supabase.from('pcp_pedidos_compra')
        .select('vencedora_id').eq('id', pedido.id).maybeSingle();
      if (erroVenc) return { erro: 'a aprovação foi registrada, mas não foi possível ler a cotação vencedora do pedido (' + erroVenc.message + ')' };
      if (pedidoAtual?.vencedora_id) {
        const { error: erroStatus } = await supabase.from('pcp_pedidos_compra').update({ status_compra: 'Aprovado' }).eq('id', pedido.id);
        // 7.57: a linha de aprovação ficava "aprovado" e o pedido seguia "Aguardando Aprovação", sem aviso
        if (erroStatus) return { erro: 'a aprovação foi registrada, mas o pedido NÃO passou para "Aprovado" (' + erroStatus.message + ')' };
        await registrarHistorico(pedido.id, { tipo: 'avanco', de: 'Aguardando Aprovação', para: 'Aprovado', motivo: 'Aprovações concluídas.' }, currentUser);
        await notificarCriadorPedido(pedido, `Compra aprovada — aguardando confirmação de compra — pedido ${pedido.numero_pedido}.`);
      }
    }
    return { avisoFalhou };
  };

  // Ação explícita e separada da aprovação: só aqui a compra de fato "fecha"
  // (status_compra='Comprado'), gera número de OC (trigger) e cria a demanda de
  // acompanhamento — antes disso, o pedido fica em 'Aprovado' esperando essa
  // confirmação, mesmo que quem aprovou também tenha alçada pra isso.
  const confirmarCompra = async (pedido: any, prazo?: string, qtdComprada?: number, itensComprados?: any[] | null) => {
    const upd: any = { status_compra: 'Comprado' };
    if (prazo) upd.data_prevista_recebimento = prazo;
    // Quanto foi de fato comprado. `quantidade` fica intacta com o que foi
    // PEDIDO: são fatos diferentes e o "pediu 9" é a régua para conferir
    // depois se o mínimo do estoque está bem calibrado (25/09/2026).
    if (qtdComprada != null && qtdComprada > 0) upd.quantidade_comprada = qtdComprada;
    if (itensComprados) upd.itens = itensComprados;
    const { error } = await supabase.from('pcp_pedidos_compra').update(upd).eq('id', pedido.id);
    if (error) { alert('Erro ao confirmar compra: ' + error.message); return false; }
    logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: pedido.id, changeType: 'UPDATE',
      oldRow: { status_compra: 'Aprovado', quantidade_comprada: pedido.quantidade_comprada }, newRow: upd, user: currentUser });
    const difQtd = qtdComprada != null && Number(pedido.quantidade) !== qtdComprada
      ? `Pedido de ${pedido.quantidade}, comprado ${qtdComprada}.` : '';
    await registrarHistorico(pedido.id, { tipo: 'avanco', de: 'Aprovado', para: 'Comprado',
      motivo: [difQtd, prazo ? `Prazo de entrega: ${new Date(prazo + 'T12:00:00').toLocaleDateString('pt-BR')}` : '']
        .filter(Boolean).join(' ') || null }, currentUser);
    const erroDemanda = await criarDemandaComprasFinalizada(pedido.id);
    if (erroDemanda) alert('A compra foi confirmada, mas a demanda de acompanhamento em "Compras — Demandas" NÃO foi criada: ' + erroDemanda + '\n\nAvise o Compras para abrir à mão.');   // 7.57
    await notificarCriadorPedido(pedido, `Compra confirmada — pedido ${pedido.numero_pedido}.`);
    setFiltro('');
    load();
    return true;
  };

  // Checa se o usuário logado pode aprovar a pendência atual — mesma regra pra
  // departamento (aprovador_id específico) e alçada (perfil dentro de
  // perfis_aprovadores). Sem pendência nenhuma, não há autorização especial a checar.
  // Aprovar é das pessoas marcadas no Admin, e de mais ninguém — vale para os
  // dois caminhos, alçada por valor e departamento (decidido em 24/09/2026).
  // Antes valia o perfil, o que liberava Admin que não deve aprovar e barrava
  // quem aprova mas tem outro cargo; e o gestor aprovava o próprio setor.
  const souAprovadorPara = (pendencia: any) => {
    if (!pendencia) return true;
    return podeAprovarCompra(currentUser);
  };

  const aprovarNivelAtivo = umaVez('aprovar-nivel', async () => {
    if (!modalCotacoes) return;
    if (erroMesa) { alert('A mesa não conseguiu ler ' + erroMesa + '. Feche e abra a mesa de novo antes de aprovar.'); return; }   // 7.57
    setRespondendoAprovacao(true);
    const res = await resolverPendenciaComoAprovada(aprovacoesPedido, modalCotacoes);
    setRespondendoAprovacao(false);
    if (res.erro) { alert('Aprovação NÃO concluída: ' + res.erro); setFiltro(''); load(); return; }   // 7.57: a janela fechava como se tivesse aprovado
    if (res.avisoFalhou) alert('Aprovado, mas o aviso ao próximo nível de aprovação não saiu. Avise quem aprova diretamente.');
    setModalCotacoes(null);
    setFiltro('');
    load();
  });

  const rejeitarNivelAtivo = umaVez('rejeitar-nivel', async () => {
    if (erroMesa) { alert('A mesa não conseguiu ler ' + erroMesa + '. Feche e abra a mesa de novo antes de devolver.'); return; }   // 7.57
    const nivelAtivo = aprovacoesPedido.find(a => a.status === 'pendente');
    if (!nivelAtivo || !modalCotacoes) return;
    // Mesma checagem de autorização que "Aprovar" já faz — rejeitar não pode
    // ser mais permissivo que aprovar.
    if (!souAprovadorPara(nivelAtivo)) {
      const quem = nomesAprovadores();
      alert('Você não tem autorização para rejeitar este pedido. Aguardando: ' + (quem || '—'));
      return;
    }
    const motivo = await pedirTexto('Não aprovar e devolver para refazer a cotação.\nMotivo:');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Informe o motivo.'); return; }
    setRespondendoAprovacao(true);
    // 7.57: cada gravação é conferida; se o pedido não voltar para "Em Andamento", as linhas de aprovação voltam a "pendente"
    // (antes a rejeição ficava gravada e o pedido seguia "Aguardando Aprovação" sem linha pendente — ninguém mais conseguia aprovar).
    const idsPendentes = aprovacoesPedido.filter(a => a.status === 'pendente').map(a => a.id);
    const restaurarPendentes = async () => {
      const { error: erroRest } = await supabase.from('pcp_aprovacoes')
        .update({ status: 'pendente', respondido_por: null, respondido_por_nome: null, respondido_em: null, resposta: null }).in('id', idsPendentes);
      return !erroRest;
    };
    const { error: erroRej } = await supabase.from('pcp_aprovacoes').update({
      status: 'rejeitado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(), resposta: motivo.trim(),
    }).eq('id', nivelAtivo.id);
    if (erroRej) { setRespondendoAprovacao(false); alert('Não foi possível registrar a rejeição: ' + erroRej.message); return; }
    // Não aprovar também encerra para todos: o pedido volta para "Em Andamento"
    // e sai da fila de aprovação, então ninguém mais tem o que decidir nele.
    await resolverMencoesDeTodos({ contexto: 'compra_aprovacao', contextoId: modalCotacoes.id,
      porNome: currentUser?.nome, motivo: 'devolvido para refazer' });
    const { error: erroCanc } = await supabase.from('pcp_aprovacoes').update({ status: 'cancelado' })
      .eq('pedido_id', modalCotacoes.id).eq('status', 'pendente');
    if (erroCanc) {
      const voltou = await restaurarPendentes();
      setRespondendoAprovacao(false);
      alert('Não foi possível devolver o pedido: ' + erroCanc.message + (voltou ? '\n\nA aprovação voltou a ficar pendente.' : '\n\nATENÇÃO: a rejeição ficou gravada e não foi possível desfazer. Confira a mesa.'));
      load();
      return;
    }
    const { error: erroVoltar } = await supabase.from('pcp_pedidos_compra').update({
      status_compra: 'Em Andamento', vencedora_id: null, justificativa_vencedora: null,
      reprocessos: (Number(modalCotacoes.reprocessos) || 0) + 1,
    }).eq('id', modalCotacoes.id);
    if (erroVoltar) {
      const voltou = await restaurarPendentes();
      setRespondendoAprovacao(false);
      alert('Não foi possível devolver o pedido para "Em Andamento": ' + erroVoltar.message + (voltou ? '\n\nA aprovação voltou a ficar pendente.' : '\n\nATENÇÃO: a rejeição ficou gravada e não foi possível desfazer. Confira a mesa.'));
      load();
      return;
    }
    await registrarHistorico(modalCotacoes.id, { tipo: 'retorno', de: 'Aguardando Aprovação', para: 'Em Andamento', motivo: `Não aprovado — ${motivo.trim()}`,
      dados: { refazer: 'Rever as cotações e reenviar para aprovação', nivel: nivelAtivo.nivel_nome, reprocesso: (Number(modalCotacoes.reprocessos) || 0) + 1 } }, currentUser);
    await notificarCriadorPedido(modalCotacoes, `Compra rejeitada (Nível ${nivelAtivo.nivel} — ${nivelAtivo.nivel_nome}). Motivo: ${motivo.trim()}`);
    setRespondendoAprovacao(false);
    setVencedoraId(null);
    setModalCotacoes(null);
    setFiltro('');
    load();
  });

  // Clique em "✅ Aprovar" numa cotação específica: valida as regras de sempre
  // (prazo definido) e, se houver uma pendência de aprovação em aberto,
  // confirma que ESTE usuário tem autorização pra resolvê-la antes de
  // sequer abrir o prompt de senha. 3 cotações é o recomendado, não mais
  // obrigatório — nem sempre dá pra conseguir 3 fornecedores pro mesmo item.
  const aprovarCotacaoComoVencedora = (cotacao: any) => {
    if (!modalCotacoes) return;
    if (erroMesa) { alert('A mesa não conseguiu ler ' + erroMesa + '. Feche e abra a mesa de novo antes de aprovar.'); return; }   // 7.57: sem a leitura não dá para saber se há aprovação pendente
    // A previsão de recebimento saiu daqui em 24/09/2026: quem aprova decide a
    // cotação e se libera, só isso. O prazo é combinado com o fornecedor e quem
    // informa é o Compras ao efetivar a compra (ModalConfirmarCompra), onde ele
    // já era obrigatório. Pedir aqui obrigava o aprovador a adivinhar uma data.
    const pendencia = aprovacoesPedido.find(a => a.status === 'pendente');
    if (pendencia && !souAprovadorPara(pendencia)) {
      alert('Você não tem autorização para aprovar compra.\n\nQuem aprova: ' + nomesAprovadores());
      return;
    }
    setModalConfirmarSenha(cotacao);
    setSenhaConfirmacao('');
    setErroSenha('');
  };

  // Confirma a senha de quem está aprovando e, se bater, seleciona a cotação
  // como vencedora e resolve a aprovação pendente (se houver e for desta pessoa).
  const confirmarAprovacaoComSenha = umaVez('aprovar-senha', async () => {
    const cotacao = modalConfirmarSenha;
    if (!cotacao || !modalCotacoes) return;
    if (!senhaConfirmacao) { setErroSenha('Digite sua senha.'); return; }
    setVerificandoSenha(true);
    const { data: usuarioAtual, error: erroUsu } = await supabase.from('auth_usuarios')
      .select('senha').eq('id', currentUser?.id).maybeSingle();
    if (erroUsu) { setVerificandoSenha(false); setErroSenha('Não foi possível conferir a senha: ' + erroUsu.message); return; }   // 7.57: dizia "Senha incorreta."
    if (!usuarioAtual || usuarioAtual.senha !== senhaConfirmacao) {
      setVerificandoSenha(false);
      setErroSenha('Senha incorreta.');
      return;
    }
    const textoJustificativa = (cotacao.area_livre || '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      || `Cotação vencedora: ${cotacao.fornecedor_nome}`;
    // Se a alçada JÁ está pendente para esta mesma vencedora, só falta aprovar: disparar de novo criaria
    // outra linha de aprovação pendente para o mesmo nível (30/09/2026). Confere no banco, não no estado da tela.
    const { data: jaPendentes, error: erroJa } = await supabase.from('pcp_aprovacoes').select('id,tipo')
      .eq('pedido_id', modalCotacoes.id).eq('status', 'pendente');
    const { data: pedidoVenc, error: erroVenc } = await supabase.from('pcp_pedidos_compra')
      .select('vencedora_id').eq('id', modalCotacoes.id).maybeSingle();
    // 7.57: falha de leitura aqui criava uma segunda linha de aprovação pendente para o mesmo nível
    if (erroJa || erroVenc) { setVerificandoSenha(false); setErroSenha('Não foi possível conferir as aprovações do pedido: ' + (erroJa || erroVenc).message); return; }
    const alcadaJaPendente = (jaPendentes || []).some((a: any) => a.tipo !== 'departamento');
    const mesmaVencedora = pedidoVenc?.vencedora_id === cotacao.id;
    const resDisparo: any = alcadaJaPendente && mesmaVencedora
      ? { error: null }
      : await dispararOuConfirmar(modalCotacoes.id, {
          vencedora_id: cotacao.id,
          justificativa_vencedora: textoJustificativa,
          fornecedor: cotacao.fornecedor_nome,
          valor_compra: cotacao.valor,
          // sem data_prevista_recebimento: ela é do Compras, na efetivação
        });
    const error = resDisparo.error;
    if (error) {
      setVerificandoSenha(false);
      setErroSenha('Erro: ' + error.message);
      return;
    }
    // Pode ter nascido uma alçada nova (ou já existir uma pendência de
    // departamento) — busca fresco e resolve na hora se for algo que ESTE
    // usuário pode aprovar; senão fica "Aguardando Aprovação" normalmente.
    const listaFresca = await carregarAprovacoes(modalCotacoes.id);
    if (listaFresca === null) {
      setVerificandoSenha(false);
      setErroSenha('A cotação foi enviada, mas não foi possível ler as aprovações para concluir. Feche a janela e confira a mesa.');
      load();
      return;
    }
    const pendenciaFresca = listaFresca.find((a:any) => a.status === 'pendente');
    let avisoFalhou = !!(resDisparo as any)?.avisoFalhou;
    if (pendenciaFresca && souAprovadorPara(pendenciaFresca)) {
      const res = await resolverPendenciaComoAprovada(listaFresca, modalCotacoes);
      if (res.erro) { setVerificandoSenha(false); setErroSenha('Aprovação NÃO concluída: ' + res.erro); load(); return; }   // 7.57
      if (res.avisoFalhou) avisoFalhou = true;
    }
    setVerificandoSenha(false);
    setModalConfirmarSenha(null);
    setModalCotacoes(null);
    setFiltro('');
    load();
    if (avisoFalhou) alert('Aprovado/enviado para aprovação, mas o aviso aos aprovadores não saiu. Avise quem aprova diretamente.');
  });

  // ── Prazo Prometido de Entrega ────────────────────────────────────────────
  const abrirModalPrazoProm = (p: any) => {
    setModalPrazoProm(p);
    setPrazoPromData(p.prazo_prometido_entrega || '');
    setPrazoPromDestino(p.prazo_prometido_destino || 'producao');
  };

  const salvarPrazoProm = umaVez('prazo-prometido', async () => {
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
  });

  const salvarObs = umaVez('obs', async () => {
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
  });

  const itensMenuFluxo = (p: any) => {
    const gestor = podeGerirCompras(currentUser);
    const st = p.status_compra;
    return [
      { rotulo: 'Editar solicitação', icone: mdiPencilOutline, onClick: () => abrirFluxo('editar', p), oculto: !podeEditarSolicitacao(p, currentUser) },
      { rotulo: `Avançar para ${PROXIMA_ETAPA[st] || ''}`, icone: mdiArrowRight,
        onClick: () => moverPara(p, PROXIMA_ETAPA[st]), oculto: !PROXIMA_ETAPA[st] || !(gestor || (st === 'Comprado' && currentUser?.perfil === 'Almoxarifado')) },
      { rotulo: `Voltar para ${ETAPA_ANTERIOR[st] || ''} (reprocesso)`, icone: mdiUndoVariant, onClick: () => moverPara(p, ETAPA_ANTERIOR[st]), oculto: !ETAPA_ANTERIOR[st] || !gestor },
      { rotulo: 'Reativar', icone: mdiRestore, onClick: () => moverPara(p, 'Pendente'), oculto: st !== DESCARTADA || !gestor },
      { rotulo: 'Descartar', icone: mdiCloseCircleOutline, onClick: () => moverPara(p, DESCARTADA), perigo: true,
        oculto: st === DESCARTADA || st === 'Recebido' || !(gestor || ehSolicitante(p, currentUser)) },
    ];
  };

  const total = pedidos.length;
  const kpis = [...ETAPAS_COMPRA, DESCARTADA].map(s => ({
    label: s, n: pedidos.filter(p=>p.status_compra===s).length, cor: COR[s],
  }));

  // Recebidos ficam agrupados/colapsados no fim da lista, pendentes e em
  // andamento sempre no topo — só quando a visão é "Todos os status"; um
  // filtro de status específico (ex: só "Recebido") continua mostrando
  // exatamente o que foi filtrado, sem o agrupamento.
  const agruparPorStatus  = filtro === '';
  const pedidosAtivos     = agruparPorStatus ? pedidos.filter((p:any) => !['Recebido', DESCARTADA].includes(p.status_compra)) : pedidos;
  const pedidosConcluidos = agruparPorStatus ? pedidos.filter((p:any) => ['Recebido', DESCARTADA].includes(p.status_compra)) : [];

  const renderPedidoRow = (p: any) => {
    const row   = inline[p.id] || {valor:'',prazo:'',salvando:false};
    const isEM  = p.status_compra === 'Em Andamento';
    const isAguardandoAprovacao = p.status_compra === 'Aguardando Aprovação';
    const isAprovado = p.status_compra === 'Aprovado';
    const naoLido = pedidosNaoLidos.has(String(p.id));
    return (
      <tr key={p.id} className={naoLido ? 'acn-linha-nova' : (isEM || isAguardandoAprovacao || isAprovado) ? 'acn-cmp-linha' : undefined}
        data-acn-familia={naoLido ? undefined : isEM ? 'ok' : isAguardandoAprovacao ? 'atencao' : isAprovado ? 'info' : undefined}>
        <td>
          <strong>{p.numero_pedido}</strong>
          <div><SeloOrigemCompra p={p} /></div>
        </td>
        <td>
          {p.opl ? (
            <Botao pequeno variante="discreto" className="acn-cmp-link" onClick={async () => {
              const { data, error: erroOp } = await supabase.from('oples').select('id').eq('opl', p.opl).maybeSingle();
              if (erroOp) { alert(`Não foi possível procurar a OP ${p.opl}: ${erroOp.message}`); return; }   // 7.57: dizia "não encontrada"
              if (!data) { alert(`OP ${p.opl} não encontrada no cadastro.`); return; }
              abrirVinculo({ tipo:'op', id: data.id, descricao: p.opl });
            }}>
              {p.opl}
            </Botao>
          ) : '—'}
          {p.oportunidade_id && (
            <div>
              <Botao pequeno variante="discreto" className="acn-cmp-link" icone={mdiLinkVariant}
                onClick={()=>abrirVinculo({ tipo:'pv', id:p.oportunidade_id, descricao:p.numero_pedido })}>
                Proposta
              </Botao>
            </div>
          )}
          <VinculoLinkCompra p={p} />
        </td>
        <td className="acn-cmp-desc">
          <DescricaoCompacta texto={p.descricao_material} />
        </td>
        <td>{p.quantidade}</td>
        <td>{p.fornecedor||'—'}</td>

        {/* VALOR — somente leitura; só é definido ao escolher a cotação vencedora na Mesa de Cotações */}
        {canVerValor && (
          <td className="acn-num">
            {p.valor_compra
              ? <strong className="acn-txt-ok">{fmt(p.valor_compra)}</strong>
              : <span className="acn-fraco">—</span>}
          </td>
        )}

        {/* CENTRO DE CUSTO */}
        <td className="acn-cmp-chipcel">
          {p.centro_custo ? (
            <div className="acn-cmp-chiplinha">
              <span className="acn-cmp-chip" data-acn-familia="info" title={p.centro_custo}>
                {p.centro_custo}
              </span>
              <Botao pequeno variante="discreto" icone={mdiPencilOutline} onClick={()=>abrirModalCentro(p)} title="Alterar centro de custo" aria-label="Alterar centro de custo" />
            </div>
          ) : (
            <Botao pequeno variante="discreto" icone={mdiPlus} onClick={()=>abrirModalCentro(p)}>Definir</Botao>
          )}
        </td>

        {/* DEPARTAMENTO */}
        <td className="acn-cmp-chipcel">
          {(() => {
            const dep = departamentosConfig.find((d:any) => d.id === p.departamento_id);
            return dep ? (
              <div className="acn-cmp-chiplinha">
                <span className="acn-cmp-chip" data-acn-familia="ok" title={dep.nome}>
                  {dep.nome}
                </span>
                <Botao pequeno variante="discreto" icone={mdiPencilOutline} onClick={()=>abrirModalDepartamento(p)} title="Alterar departamento" aria-label="Alterar departamento" />
              </div>
            ) : (
              <Botao pequeno variante="discreto" icone={mdiPlus} onClick={()=>abrirModalDepartamento(p)}>Definir</Botao>
            );
          })()}
        </td>

        {/* PRAZO — editável direto para itens Em Andamento */}
        <td className="acn-num">
          {isEM ? (
            <input type="date" className="acn-input acn-cmp-prazo"
              value={row.prazo}
              onChange={e => setInlineField(p.id,'prazo',e.target.value)}
            />
          ) : (
            <div className="acn-cmp-chiplinha">
              {fmtData(p.data_prevista_recebimento)}
              {podeGerirCompras(currentUser) && !['Pendente', DESCARTADA].includes(p.status_compra) && (
                <Botao pequeno variante="discreto" icone={mdiPencilOutline}
                  onClick={()=>setModalPrazoEntrega({ p, data: p.data_prevista_recebimento ? String(p.data_prevista_recebimento).slice(0,10) : '', motivo: '' })}
                  title="Alterar o prazo de entrega" aria-label="Alterar o prazo de entrega" />
              )}
            </div>
          )}
        </td>

        {/* PRAZO PROMETIDO — compromisso com Produção ou Cliente, independente do prazo do fornecedor */}
        <td className="acn-cmp-chipcel acn-num">
          {p.prazo_prometido_entrega ? (
            <div className="acn-cmp-chiplinha">
              <span title={p.prazo_prometido_destino==='cliente'?'Prometido ao cliente':'Prometido à Produção'}>
                <Icone path={p.prazo_prometido_destino==='cliente' ? mdiAccountOutline : mdiFactory} size={14} />
              </span>
              {fmtData(p.prazo_prometido_entrega)}
              <Botao pequeno variante="discreto" icone={mdiPencilOutline} onClick={()=>abrirModalPrazoProm(p)} title="Alterar prazo prometido" aria-label="Alterar prazo prometido" />
            </div>
          ) : (
            <Botao pequeno variante="discreto" icone={mdiPlus} onClick={()=>abrirModalPrazoProm(p)}>Definir</Botao>
          )}
        </td>

        <td>
          <Selo familia={FAMILIA_COMPRA[p.status_compra] || 'neutro'}>{p.status_compra||'—'}</Selo>
          {p.reprocessos > 0 && <div className="acn-cmp-sub"><Selo familia="atencao" ponto={false} title="Voltou de etapa — veja o motivo no Resumo">Reprocesso nº {p.reprocessos}</Selo></div>}
          {p.status_compra === DESCARTADA && p.motivo_descarte && <div className="acn-ajuda acn-cmp-motivo" title={p.motivo_descarte}>{String(p.motivo_descarte).slice(0,60)}</div>}
          {p.numero_oc && (
            <div className="acn-cmp-sub">
              <span className="acn-mono acn-cmp-oc acn-prod-ic" title="Ordem de Compra">
                <Icone path={mdiClipboardTextOutline} size={11} /> {p.numero_oc}
              </span>
            </div>
          )}
        </td>

        <td className="acn-cmp-acoes">
          <div className="acn-acoes-linha quebra">
          {/* Pendente → Em Andamento */}
          {p.status_compra==='Pendente' && (
            <Botao pequeno variante="primario" icone={mdiPlay} onClick={()=>avancarStatus(p)}>Iniciar</Botao>
          )}

          {/* Mesa de Cotações — fluxo recomendado para Em Andamento → Comprado */}
          {isEM && (
            <Botao pequeno variante="primario" icone={mdiTagOutline} onClick={()=>abrirModalCotacoes(p)}>
              Cotações{p.vencedora_id ? ' ✓' : ''}
            </Botao>
          )}

          {/* Aguardando Aprovação — abre a mesma mesa de cotações, agora mostrando a seção de aprovação */}
          {isAguardandoAprovacao && (
            <Botao pequeno variante="primario" icone={mdiLockOutline} onClick={()=>abrirModalCotacoes(p)}>
              Ver Aprovação
            </Botao>
          )}

          {/* Aprovado → Comprado — ação explícita e separada da aprovação */}
          {isAprovado && (
            <Botao pequeno variante="primario" icone={mdiCartCheck} onClick={()=>abrirFluxo('confirmar', p)}>
              Confirmar Compra
            </Botao>
          )}

          {/* Ver/Corrigir Cotações — depois de Aprovado/Comprado, o botão normal de
              Cotações some (é pra quando ainda se está decidindo); esse reabre a mesma
              Mesa de Cotações em modo consulta/correção (edição só Admin, ver excluirCotacao). */}
          {['Aprovado','Comprado'].includes(p.status_compra) && (
            <Botao pequeno icone={mdiMagnify} onClick={()=>abrirModalCotacoes(p)} title="Ver cotações e corrigir valores se necessário">
              Ver/Corrigir Cotações
            </Botao>
          )}

          {/* Comprado → Recebido — só via conferência técnica na Logística (Fase 3) */}
          {p.status_compra==='Comprado' && (
            <span className="acn-ajuda acn-cmp-aguarda acn-prod-ic" title="Registre o recebimento (seriais/volume/NF conferida) na aba Logística pra fechar">
              <Icone path={mdiPackageVariantClosed} size={12} /> Aguarda recebimento na Logística
            </span>
          )}

          {/* Resumo da solicitação */}
          <Botao pequeno icone={mdiMagnify} onClick={()=>setModalResumo(p)} title="Resumo da solicitação">
            Resumo
          </Botao>

          {/* Vínculo (PV/OP/OS/compra/OFI) e link */}
          <Botao pequeno variante={(p.vinculo_tipo || p.link_url) ? 'secundario' : 'discreto'} icone={mdiLinkVariant} aria-label="Vínculo e link"
            onClick={()=>setModalVinculo(p)} title={p.vinculo_tipo || p.link_url ? 'Editar vínculo/link' : 'Vincular a PV, OP, OS, outra compra ou OFI / adicionar link'} />

          {/* Acompanhamento — timeline/chat do pedido */}
          <Botao pequeno variante="discreto" icone={mdiForumOutline} aria-label="Acompanhamento" title="Acompanhamento" onClick={()=>setModalAcomp(p)} />

          {/* Observações (registro curto, aparece na impressão) */}
          <Botao pequeno variante={p.observacoes_compra ? 'secundario' : 'discreto'} icone={mdiCommentTextOutline} aria-label="Observações" title="Observações"
            onClick={()=>{setModalObs(p);setObsTexto('');}} />

          {/* Imprimir */}
          <Botao pequeno variante="discreto" icone={mdiPrinterOutline} aria-label="Imprimir" title="Imprimir a solicitação" onClick={()=>imprimirSolicitacao(p)} />
          <MenuAcoes itens={itensMenuFluxo(p)} rotulo="Etapa, edição e descarte" />

          {/* Imprimir Ordem de Compra — só existe depois de Comprado */}
          {p.numero_oc && (
            <Botao pequeno icone={mdiClipboardTextOutline} onClick={()=>imprimirOrdemCompra(p)} title={`Imprimir ${p.numero_oc}`}>OC</Botao>
          )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="acn-cmp">

      {/* CABEÇALHO */}
      <div className="acn-cmp-cab">
        <div className="acn-cmp-cab-esq">
          <h2 className="acn-cmp-titulo"><Icone path={mdiCartOutline} size={18} /> Requisições de Compra</h2>
          <Botao pequeno icone={mdiCogOutline} onClick={()=>setModalGerCentros(true)}>Centros de Custo</Botao>
        </div>
        <div className="acn-cmp-filtros">
          <Chips rotulo="Visão" ativo={visao} onChange={(v) => setVisao(v as any)}
            itens={[{ id:'tabela', rotulo:'Tabela', icone: mdiTableLarge }, { id:'kanban', rotulo:'Kanban', icone: mdiViewColumnOutline }]} />
          <select className="acn-input acn-cmp-filtro-status" value={filtro} onChange={e=>setFiltro(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            {[...ETAPAS_COMPRA, DESCARTADA].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Só para quem aprova (a permissão marcada no Admin): o que está esperando por essa pessoa, logo de cara */}
      {esperando !== null && podeAprovarCompra(currentUser) && (
        <PainelEsperandoMinhaAprovacao lista={esperando} canVerValor={canVerValor} fmt={fmt}
          outros={aprovadoresCompra.filter((a: any) => String(a.id) !== String(currentUser?.id)).map((a: any) => a.nome)}
          onAbrir={abrirModalCotacoes} />
      )}

      {/* KPIs — resumo no topo, antes da lista */}
      <div className="acn-kpis acn-cmp-kpis">
        <div className="acn-kpi">
          <span className="val acn-num">{total}</span>
          <span className="rot"><i data-acn-familia="neutro" />Total</span>
        </div>
        {kpis.map(k=>(
          <div key={k.label} className="acn-kpi">
            <span className="val acn-num">{k.n}</span>
            <span className="rot"><i data-acn-familia={FAMILIA_COMPRA[k.label] || 'neutro'} />{k.label}</span>
          </div>
        ))}
      </div>

      {erroConfig.length > 0 && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={recarregarConfig}>Tentar de novo</Botao>}>
          Não foi possível ler: {erroConfig.join('; ')}. Isso não quer dizer que não haja — e <strong>sem as alçadas e os aprovadores lidos, a aprovação de compras fica travada</strong>.
        </Faixa>
      )}
      {queryError && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>
          Erro ao carregar dados: <strong>{queryError}</strong>. Isso não quer dizer que não haja requisição{pedidos.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}

      {!loading && pedidos.length > 0 && visao === 'kanban' && (() => {
        const colunas = STATUS_COMPRAS.filter(st => !filtro || st === filtro);
        const etapas = colunas.map(st => ({ id: st, titulo: st, cor: COR_STATUS_COMPRA[st], total: pedidos.filter((p:any) => p.status_compra === st).length }));
        const ativa = etapas.find(e => e.id === etapaCel) ? etapaCel : etapaInicial(etapas);
        // Recebido é histórico e só cresce: a coluna mostra os 10 mais recentes
        // e o resto fica no botão "ver todos" — senão ela vira um arquivo morto
        // de centenas de cards ao lado das etapas que exigem ação.
        const recebidosOrdenados = pedidos
          .filter((p:any) => p.status_compra === RECEBIDO)
          .sort((a:any, b:any) => String(b.data_conclusao || b.ultima_movimentacao_em || b.data_criacao || '')
            .localeCompare(String(a.data_conclusao || a.ultima_movimentacao_em || a.data_criacao || '')));
        const itensDaColuna = (st:string) => st === RECEBIDO
          ? recebidosOrdenados.slice(0, RECEBIDOS_NO_QUADRO)
          : pedidos.filter((p:any) => p.status_compra === st);
        return (<>
        {celular && <SeletorEtapas etapas={etapas} ativa={ativa} onChange={setEtapaCel} />}
        <div className="acn-cmp-quadro">
          {colunas.filter(st => !celular || st === ativa).map(st => (
            <div key={st} className={'acn-cmp-coluna' + (celular ? ' celular' : '') + (colunaAlvo === st && arrastando ? ' alvo' : '')}
              onDragOver={e => { if (!arrastando) return; e.preventDefault(); if (colunaAlvo !== st) setColunaAlvo(st); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setColunaAlvo(c => c === st ? null : c); }}
              onDrop={e => { e.preventDefault(); const p = pedidos.find((x:any) => x.id === arrastando); setArrastando(null); setColunaAlvo(null); if (p) moverPara(p, st); }}>
            <div className="acn-cmp-coluna-int">
            <KanbanColuna titulo={st} cor={COR_STATUS_COMPRA[st]} fundo="#f8fafc" larguraMin={0}
              {...(celular ? { visiveis: 100000 } : { visiveis: CARDS_POR_COLUNA })}
              itens={itensDaColuna(st)} vazio="Nenhuma requisição"
              renderCard={(p:any) => {
                const naoLido = pedidosNaoLidos.has(String(p.id));
                return (
                  <div key={p.id} draggable={!celular}
                    onDragStart={e => { setArrastando(p.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch {} }}
                    onDragEnd={() => { setArrastando(null); setColunaAlvo(null); }}
                    title={celular ? undefined : 'Arraste para outra etapa'}
                    className={'acn-cmp-card' + (naoLido ? ' nova' : '') + (celular ? '' : ' arrastavel') + (arrastando === p.id ? ' arrastando' : '')}
                    data-acn-familia={FAMILIA_COMPRA[st] || 'neutro'}>
                    <div className="acn-cmp-card-topo">
                      <strong>{p.numero_pedido}</strong>
                      {p.numero_oc && <span className="acn-cmp-oc acn-prod-ic"><Icone path={mdiClipboardTextOutline} size={11} /> {p.numero_oc}</span>}
                    </div>
                    <div className="acn-cmp-card-desc"><DescricaoCompacta texto={p.descricao_material} /></div>
                    <div className="acn-ajuda">
                      Qtd {p.quantidade || 1}{p.fornecedor ? ` · ${p.fornecedor}` : ''}{p.opl ? ` · OP ${p.opl}` : ''}
                    </div>
                    <SeloOrigemCompra p={p} />
                    <VinculoLinkCompra p={p} compacto />
                    {(p.reprocessos > 0 || p.status_compra === DESCARTADA) && (
                      <div className="acn-cmp-card-selos">
                        {p.reprocessos > 0 && <Selo familia="atencao" ponto={false}>Reprocesso nº {p.reprocessos}</Selo>}
                        {p.status_compra === DESCARTADA && p.motivo_descarte && <span className="acn-ajuda" title={p.motivo_descarte}>{String(p.motivo_descarte).slice(0,70)}</span>}
                      </div>
                    )}
                    {celular && (
                      <select className="acn-input acn-cmp-mover" value="" aria-label="Mover para outra etapa"
                        onChange={e => { const d = e.target.value; if (d) moverPara(p, d); }}>
                        <option value="">Mover para…</option>
                        {STATUS_COMPRAS.filter(x => x !== p.status_compra).map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    )}
                    <div className="acn-cmp-card-rodape">
                      <span className="acn-ajuda">
                        {canVerValor && p.valor_compra ? <strong className="acn-txt-ok acn-cmp-card-valor">{fmt(p.valor_compra)}</strong> : null}
                        {p.data_prevista_recebimento ? fmtData(p.data_prevista_recebimento) : null}
                      </span>
                      <div className="acn-acoes-linha quebra">
                        {p.status_compra==='Pendente' && <Botao pequeno variante="primario" icone={mdiPlay} onClick={()=>avancarStatus(p)}>Iniciar</Botao>}
                        {p.status_compra==='Em Andamento' && <Botao pequeno variante="primario" icone={mdiTagOutline} onClick={()=>abrirModalCotacoes(p)}>Cotações{p.vencedora_id ? ' ✓' : ''}</Botao>}
                        {p.status_compra==='Aguardando Aprovação' && <Botao pequeno variante="primario" icone={mdiLockOutline} onClick={()=>abrirModalCotacoes(p)}>Aprovação</Botao>}
                        {p.status_compra==='Aprovado' && <Botao pequeno variante="primario" icone={mdiCartCheck} onClick={()=>abrirFluxo('confirmar', p)}>Confirmar</Botao>}
                        <Botao pequeno icone={mdiMagnify} onClick={()=>setModalResumo(p)} title="Resumo" aria-label="Abrir resumo" />
                        <Botao pequeno variante={(p.vinculo_tipo||p.link_url) ? 'secundario' : 'discreto'} icone={mdiLinkVariant} onClick={()=>setModalVinculo(p)} title="Vínculo e link" aria-label="Vínculo e link" />
                        <Botao pequeno variante="discreto" icone={mdiForumOutline} onClick={()=>setModalAcomp(p)} title="Acompanhamento" aria-label="Acompanhamento" />
                        <MenuAcoes itens={itensMenuFluxo(p)} rotulo="Etapa, edição e descarte" />
                      </div>
                    </div>
                  </div>
                );
              }} />
            {st === RECEBIDO && recebidosOrdenados.length > 0 && (
              <Botao pequeno icone={mdiClipboardTextOutline} className="acn-cmp-recebidos-btn" onClick={() => setModalRecebidos(recebidosOrdenados)}>
                Ver todos os recebidos ({recebidosOrdenados.length})
              </Botao>
            )}
            </div>
            </div>
          ))}
        </div>
        </>);
      })()}

      {loading ? <div className="acn-empty">Carregando...</div>
        : pedidos.length===0 ? <div className="acn-empty">Nenhuma requisição encontrada. {queryError ? '' : '(tabela vazia ou sem permissão)'}</div>
        : visao === 'kanban' ? null : (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-densa">
            <thead>
              <tr>
                <th>Nº Pedido</th>
                <th>OP</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Fornecedor</th>
                {canVerValor && <th>Valor da Compra</th>}
                <th>Centro de Custo</th>
                <th>Departamento</th>
                <th>Prev. Recebimento</th>
                <th>Prazo Prometido</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidosAtivos.map(renderPedidoRow)}
              {agruparPorStatus && pedidosConcluidos.length > 0 && (
                <tr>
                  <td colSpan={canVerValor ? 12 : 11} className="acn-cmp-toggle-cel">
                    <Botao variante="discreto" className="acn-cmp-toggle" icone={mostrarConcluidos ? mdiChevronUp : mdiChevronDown} onClick={()=>setMostrarConcluidos(v=>!v)}>
                      {mostrarConcluidos ? 'Ocultar' : 'Mostrar'} Recebidos e descartados ({pedidosConcluidos.length})
                    </Botao>
                  </td>
                </tr>
              )}
              {agruparPorStatus && mostrarConcluidos && pedidosConcluidos.map(renderPedidoRow)}
            </tbody>
          </table>
        </div>
      )}

      {/* As demandas avulsas de Compras aparecem uma vez só, no painel do setor
          (SetorDemandaTab) que o DashboardTab desenha acima desta tela. */}

      {/* MODAL CENTRO DE CUSTO */}
      {modalCentro && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalCentro(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j460" role="dialog" aria-label="Centro de custo">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiTagOutline} size={16} /> Centro de Custo — {modalCentro.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">{modalCentro.descricao_material}</div>

              {/* Seletor de tipo */}
              <Chips rotulo="Tipo de centro de custo" ativo={centroTipo} onChange={(t) => setCentroTipo(t as any)}
                itens={[{ id:'op', rotulo:'OP/OS', icone: mdiClipboardTextOutline }, { id:'custom', rotulo:'Centro', icone: mdiTagOutline }, { id:'livre', rotulo:'Livre', icone: mdiPencilOutline }]} />

              {/* OP/OS */}
              {centroTipo==='op' && (
                <>
                  <div className="form-group">
                    <label className="acn-label">Número da OP</label>
                    <input className="acn-input"
                      value={opBusca} placeholder="Digite o número da OP para buscar..."
                      onChange={e=>{ setOpBusca(e.target.value); buscarOps(e.target.value); }} />
                  </div>
                  {opResultados.length>0 && (
                    <div className="acn-cmp-opres">
                      {opResultados.map((o:any)=>(
                        <div key={o.id} onClick={()=>{setOpSelecionada(`OP ${o.opl}`);setOpBusca(o.opl);setOpResultados([]);}}
                          className={'acn-cmp-opres-item' + (opSelecionada===`OP ${o.opl}` ? ' sel' : '')}>
                          <strong>{o.opl}</strong>
                          <span className="acn-fraco">{o.cliente_nome||''} {o.tipo_projeto?`— ${o.tipo_projeto}`:''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {opSelecionada && <div className="acn-txt-info acn-prod-ic"><Icone path={mdiCheck} size={13} /> Selecionado: <strong>{opSelecionada}</strong></div>}
                </>
              )}

              {/* Centro personalizado */}
              {centroTipo==='custom' && (
                <div className="form-group">
                  <label className="acn-label">Centro de Custo</label>
                  {centrosCusto.length===0 ? (
                    <div className="acn-txt-erro">
                      Nenhum centro cadastrado. Use ⚙️ Centros de Custo para criar.
                    </div>
                  ) : (
                    <div className="acn-cmp-centros">
                      {/* Etapa 15a (05/10/2026): centro que só agrupa ou está fora da vigência aparece apagado e não se escolhe */}
                      {centrosParaApontar(centrosCusto, centroCustom).map((c:any)=>(
                        <div key={c.id} onClick={()=>{ if(!c.bloqueado) setCentroCustom(c.id); }} title={c.bloqueado?`Não recebe lançamento (${motivoBloqueio(c)})`:undefined}
                          className={'acn-cmp-centro' + (centroCustom===c.id ? ' sel' : '') + (c.bloqueado ? ' bloq' : '')} style={{ marginLeft: c.nivel*16 }}>
                          {c.nivel>0 && <span className="acn-fraco">└</span>}
                          <strong className="acn-cmp-centro-cod">{c.codigo}</strong>
                          <span>{c.nome}</span>
                          {c.descricao && <span className="acn-fraco">{c.descricao}</span>}
                          {c.bloqueado && <span className="acn-fraco">({motivoBloqueio(c)})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Texto livre */}
              {centroTipo==='livre' && (
                <div className="form-group">
                  <label className="acn-label">Descrição do Centro de Custo</label>
                  <input className="acn-input"
                    value={centroLivre} onChange={e=>setCentroLivre(e.target.value)}
                    placeholder="Ex: Evento, Marketing, Infraestrutura..." />
                </div>
              )}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarCentro} disabled={salvandoCentro}>
                {salvandoCentro?'Salvando...':'Salvar Centro de Custo'}
              </Botao>
              <Botao onClick={()=>setModalCentro(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEPARTAMENTO */}
      {modalDepartamento && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalDepartamento(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j420" role="dialog" aria-label="Departamento">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiOfficeBuildingOutline} size={16} /> Departamento — {modalDepartamento.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalDepartamento.descricao_material} · o gestor deste departamento será mencionado
                assim que a 1ª cotação for lançada.
              </div>

              <div className="form-group">
                <label className="acn-label">Departamento *</label>
                <select className="acn-input"
                  value={departamentoSelecionado} onChange={e=>setDepartamentoSelecionado(e.target.value)}>
                  <option value="">Selecione...</option>
                  {departamentosConfig.map((d:any) => (
                    <option key={d.id} value={d.id}>{d.nome} — {d.gestor_nome}</option>
                  ))}
                </select>
              </div>
              {departamentosConfig.length === 0 && (
                <div className="acn-txt-erro">
                  Nenhum departamento cadastrado ainda. Cadastre em Admin → 🏢 Departamentos (Compras).
                </div>
              )}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarDepartamento} disabled={salvandoDepartamento}>
                {salvandoDepartamento?'Salvando...':'Salvar Departamento'}
              </Botao>
              <Botao onClick={()=>setModalDepartamento(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR CENTROS DE CUSTO */}
      {modalGerCentros && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalGerCentros(false);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j560" role="dialog" aria-label="Centros de custo">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiCogOutline} size={16} /> Centros de Custo</span>
            </div>
            <div className="acn-modal-corpo">
              <CentrosCustoManager embutido currentUser={currentUser} />
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>{setModalGerCentros(false);loadCentros();}}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBSERVAÇÕES */}
      {modalObs && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModalObs(null);setObsTexto('');}}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j500" role="dialog" aria-label="Observações">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiCommentTextOutline} size={16} /> Observações — {modalObs.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">{modalObs.descricao_material}</div>
              {modalObs.observacoes_compra ? (
                <div className="acn-quadro acn-prod-texto acn-cmp-obs-hist">
                  <Linkify text={modalObs.observacoes_compra} />
                </div>
              ) : (
                <div className="acn-fraco">Sem observações anteriores.</div>
              )}
              <div className="form-group">
                <label className="acn-label">Nova observação</label>
                <MencaoTextarea value={obsTexto} rows={4} onChange={v=>setObsTexto(v)}
                  placeholder="Ex: Fornecedor adiou entrega. Aguardando nova data... @Nome para mencionar" />
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>{setModalObs(null);setObsTexto('');}}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarObs} disabled={salvandoObs}>
                {salvandoObs?'...':'Salvar'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRAZO PROMETIDO DE ENTREGA */}
      {modalPrazoEntrega && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalPrazoEntrega(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j420" role="dialog" aria-label="Prazo de entrega">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiCalendarOutline} size={16} /> Prazo de entrega — {modalPrazoEntrega.p.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">{modalPrazoEntrega.p.descricao_material}</div>
              <div className="form-group">
                <label className="acn-label">Nova data de entrega *</label>
                <input type="date" className="acn-input" aria-label="Nova data de entrega"
                  value={modalPrazoEntrega.data} onChange={e=>setModalPrazoEntrega((m:any)=>({...m,data:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="acn-label">Motivo (opcional)</label>
                <input className="acn-input" placeholder="Ex.: fornecedor adiou o envio"
                  value={modalPrazoEntrega.motivo} onChange={e=>setModalPrazoEntrega((m:any)=>({...m,motivo:e.target.value}))} />
              </div>
              <div className="acn-ajuda">A alteração fica no histórico do pedido, com a data anterior.</div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheck} onClick={salvarPrazoEntrega}>Salvar prazo</Botao>
              <Botao onClick={()=>setModalPrazoEntrega(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {modalPrazoProm && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalPrazoProm(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j420" role="dialog" aria-label="Prazo prometido de entrega">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiBullseyeArrow} size={16} /> Prazo Prometido de Entrega — {modalPrazoProm.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">{modalPrazoProm.descricao_material}</div>
              <div className="form-group">
                <label className="acn-label">Data prometida *</label>
                <input type="date" className="acn-input"
                  value={prazoPromData} onChange={e=>setPrazoPromData(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="acn-label">Prometido para</label>
                <Chips rotulo="Prometido para" ativo={prazoPromDestino} onChange={(t) => setPrazoPromDestino(t as any)}
                  itens={[{ id:'producao', rotulo:'Produção Interna', icone: mdiFactory }, { id:'cliente', rotulo:'Cliente Direto', icone: mdiAccountOutline }]} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarPrazoProm} disabled={salvandoPrazoProm}>
                {salvandoPrazoProm?'Salvando...':'Salvar'}
              </Botao>
              <Botao onClick={()=>setModalPrazoProm(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MESA DE COTAÇÕES */}
      {modalCotacoes && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalCotacoes(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j640" role="dialog" aria-label="Mesa de cotações">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiTagOutline} size={16} /> Mesa de Cotações — {modalCotacoes.numero_pedido}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalCotacoes.descricao_material} · recomendado 3 cotações, mas pode aprovar com menos quando não houver 3 fornecedores disponíveis.
              </div>

              {erroMesa && (
                <Faixa tom="erro" acao={<Botao pequeno onClick={() => abrirModalCotacoes(modalCotacoes)}>Tentar de novo</Botao>}>
                  Não foi possível ler {erroMesa}. Isso não quer dizer que não haja cotação nem aprovação pendente — a mesa fica travada para lançar cotação e aprovar até a leitura dar certo.
                </Faixa>
              )}
              <div className="form-group">
                <label className="acn-label">Previsão de Recebimento *</label>
                <input type="date" className="acn-input"
                  value={inline[modalCotacoes.id]?.prazo || ''}
                  onChange={e=>setInlineField(modalCotacoes.id,'prazo',e.target.value)} />
              </div>

              {aprovacoesPedido.length > 0 && (() => {
                const nivelAtivo = aprovacoesPedido.find(a => a.status === 'pendente');
                const isDepartamento = nivelAtivo?.tipo === 'departamento';
                const alcadaAtiva = (nivelAtivo && !isDepartamento) ? alcadasConfig.find(a => a.nivel === nivelAtivo.nivel) : null;
                // quem aprova é a pessoa marcada no Admin, nos dois caminhos
                const souAprovador = podeAprovarCompra(currentUser);
                const historico = aprovacoesPedido.filter(a => a.status !== 'pendente');
                const todosAprovados = historico.length > 0 && historico.every(a => a.status === 'aprovado');
                return (
                  <div className="acn-quadro tom-atencao">
                    <div className="acn-quadro-titulo acn-prod-ic">
                      <Icone path={mdiLockOutline} size={13} /> Aprovação {nivelAtivo ? (isDepartamento ? `— Departamento: ${nivelAtivo.nivel_nome}` : `— Nível ${nivelAtivo.nivel}: ${nivelAtivo.nivel_nome}`) : todosAprovados ? 'concluída' : 'anterior (histórico)'}
                    </div>
                    {nivelAtivo ? (
                      souAprovador ? (
                        <div className="acn-cmp-mesa-linha">
                          <div className="acn-ajuda acn-cmp-mesa-dica">
                            Aprove clicando em "✅ Aprovar" na cotação vencedora, abaixo.
                          </div>
                          <Botao variante="perigo" icone={mdiUndoVariant} onClick={rejeitarNivelAtivo} disabled={respondendoAprovacao}>
                            Não aprovar (devolver para refazer)
                          </Botao>
                        </div>
                      ) : (
                        <div className="acn-ajuda">
                          Aguardando aprovação de: {nomesAprovadores()}
                        </div>
                      )
                    ) : todosAprovados ? (
                      <div className="acn-txt-ok">Todos os níveis aprovados.</div>
                    ) : (
                      <div className="acn-fraco">Nenhuma aprovação pendente no momento.</div>
                    )}
                    {nivelAtivo && (ehSolicitante(modalCotacoes, currentUser) || podeGerirCompras(currentUser)) && (
                      <div className="acn-cmp-mesa-descartar">
                        <span className="acn-ajuda acn-cmp-mesa-dica">A compra não é mais necessária? Quem solicitou pode descartar em vez de aguardar a aprovação.</span>
                        <Botao pequeno variante="perigo-sec" icone={mdiCloseCircleOutline} onClick={()=>{ const p = modalCotacoes; setModalCotacoes(null); abrirFluxo('descartar', p); }}>Descartar solicitação</Botao>
                      </div>
                    )}
                    {historico.length > 0 && (
                      <div className="acn-cmp-mesa-hist">
                        {historico.map(a => (
                          <div key={a.id} className="acn-ajuda">
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
                <div className="acn-empty">Carregando...</div>
              ) : (
                <div className="acn-cmp-mesa-lista">
                  {cotacoes.length===0 && !erroMesa && (
                    <div className="acn-fraco acn-centro acn-cmp-mesa-vazia">Nenhuma cotação registrada ainda.</div>
                  )}
                  {cotacoes.map((c:any) => {
                    const compraDecidida = ['Aprovado','Comprado'].includes(modalCotacoes?.status_compra);
                    const emEdicao = editandoCotacaoId === c.id;
                    return (
                    <div key={c.id} className={'acn-cmp-cot' + (vencedoraId===c.id ? ' venc' : '')}>
                      {emEdicao ? (
                        <div className="acn-cmp-cot-edicao">
                          <ComposicaoCotacao form={editCotacaoForm} setForm={setEditCotacaoForm} />
                          <div className="acn-cmp-cot-acoes">
                            <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvandoEdicaoCotacao}
                              onClick={()=>salvarEdicaoCotacao(c)}>
                              {salvandoEdicaoCotacao ? 'Salvando...' : 'Salvar Correção'}
                            </Botao>
                            <Botao onClick={()=>setEditandoCotacaoId(null)}>Cancelar</Botao>
                          </div>
                        </div>
                      ) : (<>
                      <div className="acn-cmp-cot-topo">
                        <div className="acn-cmp-cot-info">
                          <div className="acn-forte">
                            {c.fornecedor_nome}
                            {vencedoraId===c.id && <span className="acn-txt-ok acn-cmp-venc">✓ VENCEDORA</span>}
                          </div>
                          <div className="acn-ajuda">
                            {textoComposicao(c) ? `${textoComposicao(c)} · ` : ''}
                            <strong className="acn-forte">{c.valor ? fmt(c.valor) : '—'}</strong>
                            {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                            {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                          </div>
                          {c.anexo_url && (
                            <a href={c.anexo_url} target="_blank" rel="noreferrer" className="acn-cmp-link-web acn-prod-ic"><Icone path={mdiPaperclip} size={12} /> {c.anexo_nome}</a>
                          )}
                        </div>
                        {podeGerirCompras(currentUser) && (
                          <Botao pequeno icone={mdiPencilOutline} onClick={()=>iniciarEdicaoCotacao(c)} title="Corrigir valores desta cotação" aria-label="Corrigir valores desta cotação" />
                        )}
                        <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} onClick={()=>excluirCotacao(c.id)} title="Remover" aria-label="Remover" />
                      </div>
                      <CotacaoAreaLivre cotacao={c}
                        onSaved={(html:string)=>setCotacoes(prev=>prev.map(x=>x.id===c.id?{...x,area_livre:html}:x))} />
                      {!compraDecidida && !aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento') && (
                        <Botao variante="primario" icone={mdiCheck} className="acn-cmp-largo"
                          onClick={()=>aprovarCotacaoComoVencedora(c)}>
                          Aprovar esta cotação como vencedora
                        </Botao>
                      )}
                      {/* Aprovação de alçada JÁ pendente (30/09/2026): o painel de cima manda "aprovar clicando em
                          ✅ Aprovar na cotação vencedora", mas o botão acima some quando há pendência — e não havia
                          outro. A compra ficava parada sem ninguém conseguir aprovar. Agora quem aprova vê o botão
                          na cotação que já é a vencedora (só nela: a escolha da vencedora já foi feita). */}
                      {!compraDecidida && vencedoraId === c.id && podeAprovarCompra(currentUser)
                        && aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento') && (
                        <Botao variante="primario" icone={mdiCheck} className="acn-cmp-largo"
                          onClick={()=>aprovarCotacaoComoVencedora(c)}>
                          Aprovar
                        </Botao>
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
                !aprovacoesPedido.some(a => a.status === 'pendente' && a.tipo !== 'departamento')) && (<>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo acn-prod-ic"><Icone path={mdiPlus} size={13} /> Nova Cotação de Fornecedor</div>
                {modalCotacoes?.quantidade > 1 && (
                  <div className="acn-ajuda">Quantidade do pedido: {modalCotacoes.quantidade}</div>
                )}
                <ComposicaoCotacao form={novaCotacao} setForm={setNovaCotacao} />
                <div className="form-group">
                  <label className="acn-label">Anexo (PDF, imagem, planilha…)</label>
                  <input type="file" className="acn-cmp-arquivo"
                    onChange={e=>setNovoAnexoCotacao(e.target.files?.[0]||null)} />
                </div>
                <Botao variante="primario" icone={mdiPlus} className="acn-cmp-largo" onClick={adicionarCotacao} disabled={enviandoCotacao}>
                  {enviandoCotacao?'Enviando...':'Adicionar Cotação'}
                </Botao>
              </div>

              {cotacoes.length >= 1 && (
                <div className="acn-ajuda">
                  Escreva na área livre de cada cotação e clique em "✅ Aprovar" na vencedora, acima.
                </div>
              )}
              </>)}
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalCotacoes(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR SENHA — reconfirma identidade antes de aprovar uma cotação */}
      {modalConfirmarSenha && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalConfirmarSenha(null);}}>
          <div className="modal-box acn-modal-cadastro acn-cmp-j380" role="dialog" aria-label="Confirmar aprovação">
            <div className="acn-modal-cab">
              <span className="modal-title acn-prod-ic"><Icone path={mdiLockOutline} size={16} /> Confirmar Aprovação</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Confirme sua senha para aprovar <strong>{modalConfirmarSenha.fornecedor_nome}</strong> como
                cotação vencedora ({fmt(modalConfirmarSenha.valor)}).
              </div>
              <div className="form-group">
                <label className="acn-label">Sua senha</label>
                <input type="password" className="acn-input"
                  value={senhaConfirmacao} onChange={e=>{setSenhaConfirmacao(e.target.value);setErroSenha('');}}
                  onKeyDown={e=>e.key==='Enter'&&confirmarAprovacaoComSenha()}
                  autoFocus placeholder="Mesma senha do login" />
              </div>
              {erroSenha && <div className="acn-txt-erro">{erroSenha}</div>}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheck} onClick={confirmarAprovacaoComSenha} disabled={verificandoSenha}>
                {verificandoSenha?'Verificando...':'Confirmar'}
              </Botao>
              <Botao onClick={()=>setModalConfirmarSenha(null)}>Cancelar</Botao>
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
              ? { tipo: 'avanco', de: 'Comprado', para: 'Recebido', motivo: 'Recebimento registrado e conferido.' }
              : { tipo: 'posicao_entrega', de: 'Comprado', para: 'Comprado', motivo: 'Recebimento com divergência — a compra continua em Comprado até resolver.' }, currentUser);
            setModalFluxo(null); load();
          }} />
      )}
      {modalRecebidos && (
        <ModalRecebidos lista={modalRecebidos} canVerValor={canVerValor}
          onAbrir={(p:any)=>{ setModalRecebidos(null); setModalResumo(p); }}
          onClose={()=>setModalRecebidos(null)} />
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
