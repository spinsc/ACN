// ─────────────────────────────────────────────────────────────────────────────
// ORDEM IMPRESSA PARA QUEM SOLICITOU (pedido do usuário em 29/10/2026)
//
// Mesmo com o pedido no sistema, quem solicitou quer poder entregar o papel ao setor. O botão "Imprimir ordem" fica na janela "Ver"
// de Minhas Solicitações e imprime, conforme o destino: Serralheria e Chicotes = "Ordem de Fabricação"; Compras = "Ordem de Compra"
// (a oficial, com o número OC, quando a compra já foi feita) ou "Solicitação de Compra" (antes disso); os demais setores = "Ordem de Serviço".
// O papel não leva valores nem histórico: é o que o setor precisa para executar. A OC oficial com fornecedor e valor continua sendo a do Compras.
// ─────────────────────────────────────────────────────────────────────────────

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const dataHora = (v: any) => v ? new Date(v).toLocaleString('pt-BR') : '—';
const dia = (v: any) => v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const SETORES_DE_FABRICACAO = ['serralheria', 'chicotes'];
const semAcento = (t: any) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O nome do papel, pelo destino da solicitação. */
export function tituloDaOrdem(item: any): string {
  if (item?.tipo === 'compra') return item?.bruto?.numero_oc ? 'Ordem de Compra' : 'Solicitação de Compra';
  const setor = semAcento(item?.para);
  if (SETORES_DE_FABRICACAO.some(s => setor.startsWith(s))) return 'Ordem de Fabricação';
  if (setor.startsWith('compras')) return 'Solicitação de Compra';
  return 'Ordem de Serviço';
}

/** Só pedido de compra e demanda para setor têm papel; a análise de Licitações/CRM não. */
export const temOrdemParaImprimir = (item: any) => item?.tipo === 'compra' || item?.tipo === 'demanda';

/** O HTML do papel (separado da janela para poder ser conferido sem abrir nada). */
export function htmlDaOrdem(item: any, solicitante = '', agora: Date = new Date()): string {
  const b = item?.bruto || {};
  const titulo = tituloDaOrdem(item);
  const itens = (Array.isArray(b.itens) ? b.itens : []).filter((x: any) => String(x?.nome || '').trim());
  const descricao = String(item?.tipo === 'compra' ? b.descricao_material : b.descricao || '').replace(/^\[AJUSTE\]\s*/, '').trim();
  const op = b.numero_opl || b.opl || '';
  const campos: Array<[string, any]> = item?.tipo === 'compra' ? [
    ['Nº do pedido', b.numero_pedido], ...(b.numero_oc ? [['Nº da OC', b.numero_oc] as [string, any]] : []),
    ['OP / vínculo', b.vinculo_descricao || op], ['Centro de custo', b.centro_custo],
    ['Prazo pedido', b.prazo_entrega ? dia(b.prazo_entrega) : ''], ['Solicitado em', dataHora(item.criadoEm)],
  ] : [
    ['Nº da demanda', item.numero], ['Para o setor', item.para], ['Prioridade', b.prioridade],
    ['OP', op], ['Vinculada a', b.vinculo_descricao],
    ['Prazo', b.prazo ? dataHora(b.prazo) : ''], ['Solicitado em', dataHora(item.criadoEm)],
  ];
  const linhasCampos = campos.filter(([, v]) => String(v ?? '').trim() && v !== '—')
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const linhasItens = itens.map((x: any, i: number) => `
        <tr><td class="c">${i + 1}</td><td>${esc(x.nome)}${x.descricao ? `<div class="desc">${esc(x.descricao)}</div>` : ''}</td><td class="q">${esc(x.quantidade || 1)}</td></tr>`).join('');
  return `<html><head><meta charset="utf-8"><title>${esc(titulo)} — ${esc(item?.numero || item?.titulo)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 28px; color: #000; }
      h2 { color: #1a3a52; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      table.info th { background: #1a3a52; color: #fff; padding: 6px 10px; text-align: left; font-size: 11px; width: 28%; }
      table.info td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      table.itens th { background: #1a3a52; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
      table.itens td { padding: 7px 8px; border-bottom: 1px solid #cbd5e1; vertical-align: top; }
      .c { width: 34px; text-align: center; } .q { width: 70px; text-align: right; font-weight: bold; }
      .desc { color: #475569; font-size: 10px; margin-top: 2px; }
      h3 { font-size: 12px; color: #475569; margin: 14px 0 4px; }
      .texto { white-space: pre-wrap; border: 1px solid #e2e8f0; padding: 8px 10px; min-height: 40px; }
      .assin { display: flex; gap: 40px; margin-top: 48px; }
      .assin div { flex: 1; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; text-align: center; }
      .rodape { margin-top: 20px; font-size: 10px; color: #6b7280; }
      tr { page-break-inside: avoid; }
    </style></head>
    <body>
      <h2>${esc(titulo)}</h2>
      <table class="info">${linhasCampos}</table>
      <h3>${item?.tipo === 'compra' ? 'O que foi pedido' : 'Descrição'}</h3>
      <div class="texto">${esc(descricao || item?.titulo || '—')}</div>
      ${itens.length ? `<h3>Itens</h3>
      <table class="itens"><thead><tr><th class="c">#</th><th>Item</th><th class="q">Qtd</th></tr></thead><tbody>${linhasItens}</tbody></table>` : ''}
      <div class="assin"><div>Solicitante${solicitante ? ': ' + esc(solicitante) : ''}</div><div>Recebido pelo setor (nome e data)</div></div>
      <div class="rodape">Impresso em ${agora.toLocaleString('pt-BR')} · Sistema ACN</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
}

/** Abre a janela de impressão. Devolve false quando o navegador bloqueou a janela (o chamador avisa). */
export function imprimirOrdemDoSolicitante(item: any, solicitante = ''): boolean {
  const w = window.open('', '_blank', 'width=820,height=700');
  if (!w) return false;
  w.document.write(htmlDaOrdem(item, solicitante));
  w.document.close();
  return true;
}
