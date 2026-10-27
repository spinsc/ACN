// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE SEPARAÇÃO — o papel que o Almoxarifado leva para a prateleira (pedido do usuário em 27/10/2026)
//
// Na hora de separar, o botão "Imprimir lista" do checklist da OP imprime o que é para separar: item, código e quantidade (a da BOM), com um quadradinho para marcar à mão
// o que já foi pego. Imprime o que está planejado, não o que já foi marcado na tela: o papel é o mesmo em qualquer momento da separação.
// ─────────────────────────────────────────────────────────────────────────────

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fmtQtd = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : esc(v); };

/** O HTML da lista (separado da janela para poder ser conferido sem abrir nada). */
export function htmlDaListaDeSeparacao(opl: any, linhas: any[], setor = 'Almoxarifado', agora: Date = new Date()): string {
  const itens = (linhas || []).filter(l => String(l?.nome || '').trim());
  const veiculo = [opl?.modelo, opl?.placa].filter(Boolean).join(' · ');
  const linhasHtml = itens.map((l, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td class="cod">${esc(l.codigo) || '—'}</td>
          <td>${esc(l.nome)}${l.descricao ? `<div class="desc">${esc(l.descricao)}</div>` : ''}</td>
          <td class="q">${fmtQtd(l.planejado ?? l.quantidade)}${l.unidade ? ' ' + esc(l.unidade) : ''}</td>
          <td class="c"><span class="caixa"></span></td>
        </tr>`).join('');
  return `<html><head><meta charset="utf-8"><title>Lista de separação — OP ${esc(opl?.opl)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #000; }
      h2 { color: #1a3a52; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; margin: 0 0 10px; }
      .cab { margin-bottom: 12px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1a3a52; color: #fff; padding: 7px 8px; text-align: left; font-size: 11px; }
      td { padding: 8px; border-bottom: 1px solid #cbd5e1; font-size: 12px; vertical-align: top; }
      .c { text-align: center; width: 40px; } .cod { width: 90px; font-family: monospace; } .q { width: 110px; text-align: right; font-weight: bold; white-space: nowrap; }
      .desc { color: #475569; font-size: 10px; margin-top: 2px; }
      .caixa { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #000; }
      .rodape { margin-top: 24px; font-size: 10px; color: #6b7280; }
      tr { page-break-inside: avoid; }
    </style></head>
    <body>
      <h2>Lista de separação — OP ${esc(opl?.opl)}</h2>
      <div class="cab">
        <div><b>Cliente:</b> ${esc(opl?.cliente_nome) || '—'}</div>
        ${veiculo ? `<div><b>Veículo:</b> ${esc(veiculo)}</div>` : ''}
        <div><b>Setor:</b> ${esc(setor)} · <b>Itens a separar:</b> ${itens.length}</div>
      </div>
      <table>
        <thead><tr><th class="c">#</th><th>Código</th><th>Item</th><th class="q">Quantidade</th><th class="c">Separado</th></tr></thead>
        <tbody>${linhasHtml || '<tr><td colspan="5">Esta OP não tem itens na lista de material (BOM).</td></tr>'}</tbody>
      </table>
      <div class="rodape">Emitido em ${agora.toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
}

/** Abre a janela de impressão. Devolve false quando o navegador bloqueou a janela (o chamador avisa). */
export function imprimirListaDeSeparacao(opl: any, linhas: any[], setor = 'Almoxarifado'): boolean {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.write(htmlDaListaDeSeparacao(opl, linhas, setor));
  w.document.close();
  return true;
}
