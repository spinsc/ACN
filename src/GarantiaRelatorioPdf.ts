// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — o PDF do relatório semanal (G6, 20/10/2026)
// Só desenha o modelo de GarantiaRelatorio.ts (a mesma conta da tela), no desenho do documento de comissões (ComissaoDocumento.ts): A4 paisagem, cabeçalho, critério, resumo e as seções.
// ─────────────────────────────────────────────────────────────────────────────

/** Desenha o modelo em A4 paisagem e (por padrão) baixa o arquivo. Devolve { doc, paginas, arquivo } para conferência. */
export async function emitirRelatorioGarantia(modelo: any, { salvar = true } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const L = 12, LARG = 297 - 2 * L;
  let y = 14;
  const nova = (precisa = 14) => { if (y + precisa > 196) { doc.addPage(); y = 14; } };
  const texto = (t: string, { tam = 8, negrito = false, cor = [0, 0, 0], x = L, largura = LARG } = {} as any) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(cor[0], cor[1], cor[2]);
    const linhas = doc.splitTextToSize(String(t), largura);
    nova(linhas.length * (tam * 0.42) + 2);
    doc.text(linhas, x, y);
    y += linhas.length * (tam * 0.42) + 1.6;
    doc.setTextColor(0, 0, 0);
  };
  const tabela = (head: string[], body: any[][], { rodape, colunasDir = [], atencaoColuna }: any = {}) => {
    autoTable(doc, {
      head: [head], body: rodape ? [...body, rodape] : body, startY: y, theme: 'grid', margin: { left: L, right: L },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, cellPadding: 1.6 },
      bodyStyles: { fontSize: 7, cellPadding: 1.4, textColor: 20 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(head.map((_: any, c: number) => [c, colunasDir.includes(c) ? { halign: 'right' } : {}])),
      didParseCell: (d: any) => {
        if (d.section !== 'body') return;
        if (rodape && d.row.index === body.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 232, 240]; }
        // a coluna de dias entra em destaque quando passa do prazo (a conta é a do modelo: o texto já é o número de dias)
        if (atencaoColuna != null && d.column.index === atencaoColuna && Number(d.cell.raw) >= (modelo.prazoParado || 5)) { d.cell.styles.textColor = [180, 83, 9]; d.cell.styles.fontStyle = 'bold'; }
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  };

  texto('ACN SINAL VERDE', { tam: 9, negrito: true, cor: [15, 118, 110] });
  texto(modelo.titulo, { tam: 14, negrito: true });
  texto(modelo.periodo, { tam: 11, negrito: true, cor: [51, 65, 85] });
  texto(modelo.emitido, { tam: 8, cor: [100, 100, 100] });
  y += 1;
  modelo.criterio.forEach((c: string) => texto(c, { tam: 8, cor: [71, 85, 105] }));
  y += 2;

  texto('RESUMO', { tam: 10, negrito: true, cor: [15, 118, 110] });
  tabela(['Indicador', 'Valor'], modelo.resumo.map((r: any) => [r.rotulo, r.valor]), { colunasDir: [1] });

  modelo.secoes.forEach((s: any) => {
    nova(26);
    texto(s.titulo, { tam: 9.5, negrito: true, cor: [15, 118, 110] });
    if (s.info) texto(s.info, { tam: 7.5, cor: [100, 100, 100] });
    if (!s.body.length) { texto(s.vazio || 'Nada a mostrar.', { tam: 8, cor: [100, 100, 100] }); return; }
    tabela(s.head, s.body, { rodape: s.rodape, colunasDir: s.colunasDir || [], atencaoColuna: s.atencaoColuna });
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(130);
    doc.text(`${modelo.titulo} — ${modelo.periodo}`, L, 205);
    doc.text(`página ${p} de ${paginas}`, 297 - L, 205, { align: 'right' });
  }
  if (salvar) doc.save(modelo.arquivo);
  return { doc, paginas, arquivo: modelo.arquivo };
}
