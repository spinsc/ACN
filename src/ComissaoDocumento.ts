// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTO DETALHADO DE COMISSÕES (pedido do usuário em 05/10/2026)
//
// Dois documentos em PDF, com o mesmo desenho (cabeçalho, critério, resumo, detalhe por pessoa, atenções e totais):
//  • Comissão dos VENDEDORES (Relatórios › Comissões): por OP com NF emitida no mês;
//  • Comissão dos TÉCNICOS — Produção, Serralheria e Adaptação (RH › Comissões de Técnicos): por OP/OS do período calculado na tela.
// Cada linha leva as DATAS que o fechamento precisa conferir (conclusão da produção, emissão da NF, entrega) e o número da NF.
//
// Duas decisões do usuário (05/10/2026, ao testar a comissão de outubro):
//  • o documento mostra também o que NÃO gerou comissão e por quê (OP de vendedor sem comissão cadastrada, vendedor sem percentual,
//    OP/OS sem técnico apontado) — antes essas notas simplesmente não apareciam e parecia que a tela "não trazia" a nota;
//  • quem cadastra o percentual e o "recebe comissão" continua sendo o RH (Funcionários): o documento só aponta a falta, não decide.
//
// Separado em duas camadas para poder ser conferido: montarModelo*() devolve o conteúdo (linhas, subtotais, totais) e
// emitirDocumento() só o desenha com jsPDF. O que a tela soma e o que o PDF soma sai da mesma conta (as funções recebem os
// valores já calculados pela tela, não refazem a conta).
// ─────────────────────────────────────────────────────────────────────────────

export const reais = (v: any) => (v == null || v === '' || Number.isNaN(Number(v))) ? '—'
  : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Dia em dd/mm/aaaa. Coluna só de data (AAAA-MM-DD) sai do texto; data com hora vai pelo fuso de quem usa (nunca new Date em coluna date). */
export function dataBR(d: any): string {
  if (!d) return '—';
  const t = String(d).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(t);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
}
/** Dia e hora (dd/mm/aaaa hh:mm) de um carimbo; coluna só de data sai sem hora. */
export function dataHoraBR(d: any): string {
  if (!d) return '—';
  const t = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return dataBR(t);
  const dt = new Date(t);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export const pct = (v: any) => `${String(Number(v) || 0).replace('.', ',')}%`;
const semPercentual = (v: any) => !(Number(v) > 0);

// ─── MODELO: VENDEDORES ───────────────────────────────────────────────────────
/**
 * `comissoes`: um item por vendedor com comissão cadastrada ({ id, nome, cargo, percentual_comissao, incide_em, opsVendedor, baseTotal, comissao }),
 * como a tela monta. `ops`: todas as OPs com NF emitida no mês. `valorDe(op)`: a base de uma OP (já com a divisão do lote).
 * `divisorDe(op)`: quantos veículos tem o lote (1 = OP comum).
 */
export function montarModeloVendedores({ mesLabel, comissoes, ops, valorDe, divisorDe, emitidoPor, agora = new Date() }: any) {
  const nomeNorm = (s: any) => String(s || '').toLowerCase().trim();
  const comCadastro = new Set(comissoes.map((c: any) => nomeNorm(c.nome)));
  const linhaOp = (o: any, c: any) => {
    const base = Number(valorDe(o)) || 0;
    const p = Number(c.percentual_comissao) || 0;
    return {
      op: o.opl || '—', lote: divisorDe(o) > 1 ? ` (lote/${divisorDe(o)})` : '',
      linha: [
        `${o.opl || '—'}${divisorDe(o) > 1 ? ` (lote/${divisorDe(o)})` : ''}`, o.cliente_nome || '—',
        [o.numero_nf || o.nfe, o.numero_nf_servico ? `NFS-e ${o.numero_nf_servico}` : ''].filter(Boolean).join(' · ') || '—',
        dataBR(o.data_conclusao_producao), dataHoraBR(o.data_emissao_nf), dataBR(o.data_entrega),
        reais(base), pct(p), reais(r2(base * p / 100)),
      ],
    };
  };
  const HEAD_OP = ['OP', 'Cliente', 'NF', 'Produção concluída', 'NF emitida em', 'Entregue em', 'Base (valor)', '%', 'Comissão'];

  const vendedores = comissoes.map((c: any) => {
    const linhas = c.opsVendedor.map((o: any) => linhaOp(o, c).linha);
    return {
      nome: c.nome, cargo: c.cargo || '', regra: `${pct(c.percentual_comissao)} sobre ${c.incide_em || 'Faturamento'}`,
      semPercentual: semPercentual(c.percentual_comissao),
      qtd: c.opsVendedor.length, base: r2(c.baseTotal), comissao: r2(c.comissao),
      head: HEAD_OP, body: linhas,
      subtotal: ['', '', '', '', '', `Subtotal (${c.opsVendedor.length} OP)`, reais(c.baseTotal), '', reais(c.comissao)],
    };
  });

  // OPs que não entraram em nenhum vendedor com comissão cadastrada (nem na tela, antes): sem cadastro no RH ou sem vendedor na OP
  const atencaoLinhas = ops.filter((o: any) => !comCadastro.has(nomeNorm(o.responsavel_comercial))).map((o: any) => {
    const vendedor = String(o.responsavel_comercial || '').trim();
    return [
      `${o.opl || '—'}${divisorDe(o) > 1 ? ` (lote/${divisorDe(o)})` : ''}`, o.cliente_nome || '—', vendedor || '—',
      vendedor ? 'Vendedor sem comissão cadastrada no RH (Funcionários › Recebe comissão)' : 'OP sem vendedor (responsável comercial vazio)',
      [o.numero_nf || o.nfe, o.numero_nf_servico ? `NFS-e ${o.numero_nf_servico}` : ''].filter(Boolean).join(' · ') || '—',
      dataHoraBR(o.data_emissao_nf), reais(Number(valorDe(o)) || 0),
    ];
  });
  const semPct = vendedores.filter((v: any) => v.semPercentual && v.qtd > 0);

  const totalBase = r2(vendedores.reduce((s: number, v: any) => s + v.base, 0));
  const totalComissao = r2(vendedores.reduce((s: number, v: any) => s + v.comissao, 0));
  return {
    tipo: 'vendedores',
    titulo: 'RELATÓRIO DETALHADO DE COMISSÕES — VENDEDORES',
    periodo: mesLabel,
    emitido: `Emitido em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${emitidoPor ? ` por ${emitidoPor}` : ''}`,
    criterio: [
      `Período: ${mesLabel} — OPs com nota fiscal emitida no mês (data de emissão da NF), em qualquer situação da OP.`,
      'Base da comissão: valor total da OP; em OP de lote (vários veículos) conta o valor de UM veículo (valor do lote ÷ veículos).',
      `${ops.length} OP(s) com NF emitida no mês · ${vendedores.filter((v: any) => v.qtd > 0).length} vendedor(es) com comissão calculada.`,
    ],
    resumo: {
      head: ['Vendedor', 'Cargo', 'Regra', 'OPs', 'Base (valor)', 'Comissão'],
      // só quem teve OP com NF no mês (o cadastro "Recebe comissão" inclui técnicos e outros, que ficariam como linhas zeradas)
      body: vendedores.filter((v: any) => v.qtd > 0).map((v: any) => [v.nome, v.cargo || '—', v.semPercentual ? `${v.regra} — SEM PERCENTUAL CADASTRADO` : v.regra, String(v.qtd), reais(v.base), reais(v.comissao)]),
      rodape: ['TOTAL', '', '', String(vendedores.reduce((s: number, v: any) => s + v.qtd, 0)), reais(totalBase), reais(totalComissao)],
    },
    secoes: vendedores.filter((v: any) => v.qtd > 0).map((v: any) => ({
      titulo: `${v.nome}${v.cargo ? ` — ${v.cargo}` : ''}`, info: v.regra + (v.semPercentual ? ' — ATENÇÃO: sem percentual cadastrado, a comissão sai R$ 0,00' : ''),
      head: v.head, body: v.body, subtotal: v.subtotal,
    })),
    atencao: atencaoLinhas.length ? {
      titulo: `ATENÇÃO — ${atencaoLinhas.length} OP(s) com NF emitida em ${mesLabel} que NÃO geraram comissão`,
      info: 'Essas OPs não entram em nenhum vendedor acima. O cadastro (percentual e "Recebe comissão") é do RH › Funcionários.',
      head: ['OP', 'Cliente', 'Vendedor na OP', 'Motivo', 'NF', 'NF emitida em', 'Valor (base)'], body: atencaoLinhas,
    } : null,
    avisos: semPct.length ? [`Vendedor(es) com OPs mas sem percentual de comissão cadastrado: ${semPct.map((v: any) => v.nome).join(', ')}.`] : [],
    totais: { base: totalBase, comissao: totalComissao, ops: ops.length, semComissao: atencaoLinhas.length },
    arquivo: `Comissoes_Vendedores_${String(mesLabel).replace(/[^\w]+/g, '_')}.pdf`,
  };
}

// ─── MODELO: TÉCNICOS (Produção, Serralheria e Adaptação) ─────────────────────
const PAPEL: Record<string, string> = { responsavel: 'Responsável', apoio: 'Apoio', serralheria: 'Serralheria' };
const ORDEM_DEPTO = ['PRODUÇÃO', 'SERRALHERIA'];

/**
 * `tecnicos`: o que a tela calculou ({ tecnicoNome, func, incideEm, percentual, ops, oss, totalBase, totalComissao }; cada item com base e papel).
 * `grupos`: o quadro de OP/OS por técnico, dupla e equipe. `semTecnico`: OP/OS do período que nenhum técnico foi apontado.
 * `aprovados`: os fechamentos já aprovados do mês (tecnico_id → { aprovado_por, aprovado_em }).
 */
export function montarModeloTecnicos({ periodo, situacao, origem, tecnicos, grupos = [], semTecnico = [], aprovados = {}, emitidoPor, agora = new Date() }: any) {
  const comissaoDoItem = (i: any, t: any) => (i.papel === 'apoio' ? i.base * 0.001 : i.base * (Number(t.percentual) || 0) / 100);
  const depto = (t: any) => String(t.func?.departamento || '').trim().toUpperCase() || 'SEM DEPARTAMENTO';
  const HEAD = ['Tipo', 'Função', 'Nº', 'Cliente', 'NF', 'Produção concluída', 'NF emitida em', 'Entregue em', 'Valor total', 'Mão de obra', 'Base', 'Comissão'];

  const linhaDe = (i: any, t: any) => {
    const mdo = i.papel === 'serralheria' ? i.valor_mao_de_obra_serralheria : i.valor_mao_de_obra;
    return [
      i.tipo, PAPEL[i.papel] || 'Responsável', `${i.numero || '—'}${i.qtdVeiculosLote > 1 ? ` (lote/${i.qtdVeiculosLote})` : ''}`, i.cliente || '—',
      [i.nf, i.nf_servico ? `NFS-e ${i.nf_servico}` : ''].filter(Boolean).join(' · ') || '—',
      dataBR(i.data_conclusao), dataHoraBR(i.data_faturamento), dataBR(i.data_entrega),
      reais(i.valor_total), reais(mdo), reais(i.base), reais(r2(comissaoDoItem(i, t))),
    ];
  };

  const lista = tecnicos.map((t: any) => {
    const itens = [...t.ops, ...t.oss];
    const apr = aprovados[t.tecnicoId];
    return {
      id: t.tecnicoId, nome: t.tecnicoNome, cargo: t.func?.cargo || '', depto: depto(t),
      regra: `${pct(t.percentual)} sobre ${t.incideEm}`, semPercentual: semPercentual(t.percentual),
      qtdOp: t.ops.length, qtdOs: t.oss.length, base: r2(t.totalBase), comissao: r2(t.totalComissao),
      situacao: apr ? `Aprovado por ${apr.aprovado_por}${apr.aprovado_em ? ` em ${dataBR(apr.aprovado_em)}` : ''}` : (semPercentual(t.percentual) && !itens.some((i: any) => i.papel === 'apoio') ? 'Sem percentual cadastrado' : 'Em cálculo'),
      head: HEAD, body: itens.map((i: any) => linhaDe(i, t)),
      subtotal: ['', '', '', '', '', '', '', `Subtotal (${itens.length})`, '', '', reais(t.totalBase), reais(t.totalComissao)],
    };
  });

  const deptos = [...new Set(lista.map((l: any) => l.depto))].sort((a: any, b: any) => {
    const ia = ORDEM_DEPTO.indexOf(a), ib = ORDEM_DEPTO.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b), 'pt-BR');
  });
  const grupoDepto = deptos.map((d: any) => {
    const doDepto = lista.filter((l: any) => l.depto === d);
    return { depto: d, tecnicos: doDepto, base: r2(doDepto.reduce((s: number, l: any) => s + l.base, 0)), comissao: r2(doDepto.reduce((s: number, l: any) => s + l.comissao, 0)) };
  });
  const totalBase = r2(lista.reduce((s: number, l: any) => s + l.base, 0));
  const totalComissao = r2(lista.reduce((s: number, l: any) => s + l.comissao, 0));
  const semPct = lista.filter((l: any) => l.semPercentual && (l.qtdOp + l.qtdOs) > 0);

  return {
    tipo: 'tecnicos',
    titulo: 'RELATÓRIO DETALHADO DE COMISSÕES — PRODUÇÃO, SERRALHERIA E ADAPTAÇÃO',
    periodo,
    emitido: `Emitido em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${emitidoPor ? ` por ${emitidoPor}` : ''}`,
    criterio: [
      `Período: ${periodo} — ${situacao}.`,
      `Origem: ${origem}.`,
      'Responsável: percentual do cadastro sobre a base do "incide em"; Apoio: 0,1% da mão de obra; Serralheria: percentual do técnico sobre a mão de obra de serralheria. OP de lote conta o valor de UM veículo.',
    ],
    resumo: {
      head: ['Técnico', 'Departamento', 'Regra', 'OP', 'OS', 'Base', 'Comissão', 'Situação'],
      body: grupoDepto.flatMap((g: any) => g.tecnicos.map((l: any) => [l.nome, l.depto, l.regra, String(l.qtdOp), String(l.qtdOs), reais(l.base), reais(l.comissao), l.situacao])),
      porDepto: grupoDepto.map((g: any) => [g.depto, `${g.tecnicos.length} técnico(s)`, '', '', '', reais(g.base), reais(g.comissao), '']),
      rodape: ['TOTAL', '', '', String(lista.reduce((s: number, l: any) => s + l.qtdOp, 0)), String(lista.reduce((s: number, l: any) => s + l.qtdOs, 0)), reais(totalBase), reais(totalComissao), ''],
    },
    grupos: grupos.length ? {
      titulo: 'OP/OS por técnico, dupla e equipe',
      head: ['Tipo', 'Nome', 'OP/OS', 'Com apoio', 'Sem apoio', 'Comissão do grupo'],
      body: grupos.map((g: any) => [g.tipo === 'equipe' ? 'Equipe' : g.tipo === 'dupla' ? 'Dupla' : 'Individual', g.label, String(g.qtdTotal), String(g.qtdComApoio || 0), String(g.qtdSemApoio || 0), reais(g.totalComissao)]),
    } : null,
    secoesPorDepto: grupoDepto.map((g: any) => ({
      depto: g.depto, base: g.base, comissao: g.comissao,
      tecnicos: g.tecnicos.filter((l: any) => l.body.length).map((l: any) => ({
        titulo: `${l.nome}${l.cargo ? ` — ${l.cargo}` : ''}`,
        info: `${l.regra} · ${l.qtdOp} OP${l.qtdOs ? ` · ${l.qtdOs} OS` : ''} · ${l.situacao}`,
        head: l.head, body: l.body, subtotal: l.subtotal,
      })),
    })),
    atencao: semTecnico.length ? {
      titulo: `ATENÇÃO — ${semTecnico.length} OP/OS com faturamento no período SEM técnico apontado (não geram comissão de produção)`,
      info: 'Aponte quem trabalhou em "👥 Equipe" da OP/OS (Produção) e calcule de novo.',
      head: ['Tipo', 'Nº', 'Cliente', 'NF', 'Produção concluída', 'NF emitida em', 'Valor total'],
      body: semTecnico.map((i: any) => [i.tipo, i.numero || '—', i.cliente || '—', [i.nf, i.nf_servico ? `NFS-e ${i.nf_servico}` : ''].filter(Boolean).join(' · ') || '—', dataBR(i.data_conclusao), dataHoraBR(i.data_faturamento), reais(i.valor_total)]),
    } : null,
    avisos: semPct.length ? [`Técnico(s) com OP/OS mas sem percentual de comissão cadastrado (comissão R$ 0,00 como responsável): ${semPct.map((l: any) => l.nome).join(', ')}.`] : [],
    totais: { base: totalBase, comissao: totalComissao, tecnicos: lista.length, semTecnico: semTecnico.length },
    arquivo: `Comissoes_Producao_${String(periodo).replace(/[^\w]+/g, '_')}.pdf`,
  };
}

// ─── DESENHO (jsPDF) ──────────────────────────────────────────────────────────
/** Desenha o modelo em A4 paisagem e (por padrão) baixa o arquivo. Devolve { doc, paginas, arquivo } para conferência. */
const LARG_RESUMO_TEC = [45, 52, 50, 12, 12, 30, 28, 44];
export async function emitirDocumento(modelo: any, { salvar = true } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const L = 12, LARG = 297 - 2 * L;
  let y = 14;
  const nova = (precisa = 14) => { if (y + precisa > 196) { doc.addPage(); y = 14; } };
  const texto = (t: string, { tam = 8, negrito = false, cor = [0, 0, 0], x = L, alinhar = 'left', largura = LARG } = {} as any) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(cor[0], cor[1], cor[2]);
    const linhas = doc.splitTextToSize(String(t), largura);
    nova(linhas.length * (tam * 0.42) + 2);
    doc.text(linhas, alinhar === 'center' ? x + largura / 2 : x, y, { align: alinhar });
    y += linhas.length * (tam * 0.42) + 1.6;
    doc.setTextColor(0, 0, 0);
  };
  // `larguras`: milímetros por coluna (somam no máximo a largura útil da folha, 273 mm). Sem largura fixa o valor em reais quebrava em duas linhas.
  const tabela = (head: string[], body: any[][], { rodape, destaque, colunasDir = [], larguras }: any = {}) => {
    autoTable(doc, {
      head: [head], body: rodape ? [...body, rodape] : body, startY: y, theme: 'grid', margin: { left: L, right: L },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, cellPadding: 1.6 },
      bodyStyles: { fontSize: 7, cellPadding: 1.4, textColor: 20 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(head.map((_: any, c: number) => [c, { ...(colunasDir.includes(c) ? { halign: 'right' } : {}), ...(larguras ? { cellWidth: larguras[c] } : {}) }])),
      didParseCell: (d: any) => {
        if (rodape && d.section === 'body' && d.row.index === body.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 232, 240]; }
        if (destaque && d.section === 'body' && d.row.index === body.length - 1 && destaque === 'subtotal') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [241, 245, 249]; }
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
  (modelo.avisos || []).forEach((a: string) => texto(`⚠ ${a}`, { tam: 8, negrito: true, cor: [180, 83, 9] }));
  y += 2;

  // resumo
  texto('RESUMO', { tam: 10, negrito: true, cor: [15, 118, 110] });
  if (modelo.tipo === 'vendedores') {
    tabela(modelo.resumo.head, modelo.resumo.body, { rodape: modelo.resumo.rodape, colunasDir: [3, 4, 5], larguras: [55, 40, 80, 15, 42, 41] });
  } else {
    tabela(modelo.resumo.head, [...modelo.resumo.body], { rodape: modelo.resumo.rodape, colunasDir: [3, 4, 5, 6], larguras: LARG_RESUMO_TEC });
    if (modelo.resumo.porDepto.length > 1) {
      texto('Total por departamento', { tam: 8, negrito: true, cor: [51, 65, 85] });
      tabela(['Departamento', 'Técnicos', '', '', '', 'Base', 'Comissão', ''], modelo.resumo.porDepto, { colunasDir: [5, 6], larguras: LARG_RESUMO_TEC });
    }
    if (modelo.grupos) {
      texto(modelo.grupos.titulo.toUpperCase(), { tam: 10, negrito: true, cor: [15, 118, 110] });
      tabela(modelo.grupos.head, modelo.grupos.body, { colunasDir: [2, 3, 4, 5], larguras: [25, 95, 22, 28, 28, 45] });
    }
  }

  // detalhe
  const secao = (s: any, colunasDir: number[], larguras: number[]) => {
    nova(24);
    texto(s.titulo, { tam: 9.5, negrito: true });
    if (s.info) texto(s.info, { tam: 7.5, cor: [100, 100, 100] });
    tabela(s.head, [...s.body, s.subtotal], { destaque: 'subtotal', colunasDir, larguras });
  };
  if (modelo.tipo === 'vendedores') {
    if (modelo.secoes.length) texto('DETALHE POR VENDEDOR', { tam: 10, negrito: true, cor: [15, 118, 110] });
    modelo.secoes.forEach((s: any) => secao(s, [6, 7, 8], [34, 70, 32, 26, 30, 26, 24, 10, 21]));
  } else {
    modelo.secoesPorDepto.forEach((g: any) => {
      if (!g.tecnicos.length) return;
      nova(24);
      texto(`DEPARTAMENTO: ${g.depto} — base ${reais(g.base)} · comissão ${reais(g.comissao)}`, { tam: 10, negrito: true, cor: [15, 118, 110] });
      g.tecnicos.forEach((s: any) => secao(s, [8, 9, 10, 11], [9, 18, 22, 44, 26, 20, 24, 18, 22, 20, 20, 22]));
    });
  }

  if (modelo.atencao) {
    nova(28);
    texto(modelo.atencao.titulo, { tam: 9.5, negrito: true, cor: [180, 83, 9] });
    texto(modelo.atencao.info, { tam: 7.5, cor: [100, 100, 100] });
    tabela(modelo.atencao.head, modelo.atencao.body, { colunasDir: [modelo.atencao.head.length - 1], larguras: modelo.tipo === 'vendedores' ? [34, 62, 40, 60, 28, 28, 21] : [12, 32, 90, 38, 28, 30, 43] });
  }

  texto(`TOTAL GERAL — base ${reais(modelo.totais.base)} · comissão ${reais(modelo.totais.comissao)}`, { tam: 11, negrito: true });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(130);
    doc.text(`${modelo.titulo} — ${modelo.periodo}`, L, 205);
    doc.text(`página ${p} de ${paginas}`, 297 - L, 205, { align: 'right' });
  }
  if (salvar) doc.save(modelo.arquivo);
  return { doc, paginas, arquivo: modelo.arquivo };
}
