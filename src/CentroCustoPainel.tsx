// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO CENTRO DE CUSTO (Etapa 15b do ux-fluxo, 05/10/2026)
//
// Pedido do usuário em 05/10/2026 ("centro de custos está muito raso"). O painel mostra, para um centro, ORÇADO ×
// REALIZADO × COMPROMETIDO × SALDO do mês e do ano, a barra de consumo com as faixas de 80% e 100%, o mês a mês, os
// filhos (consolidado), o gasto por fornecedor e os últimos lançamentos.
//
// DEFINIÇÕES (respostas do usuário às 6 perguntas, quadro da Etapa 15 do PLANO_UX_FLUXO_TRABALHO.md):
//  • COMPROMETIDO = compra APROVADA, COMPRADA ou RECEBIDA que ainda não foi paga (o que falta pagar), mais o que falta
//    de um contrato parcelado de despesa;
//  • REALIZADO = o que foi PAGO (pcp_pedidos_faturamento.data_pagamento) + as despesas avulsas + as medições pagas;
//  • SALDO = orçado − (realizado + comprometido);
//  • estouro só AVISA (80% amarelo, 100% vermelho), nunca bloqueia; menção ao responsável (se houver), uma vez por faixa e mês.
// Descartada não conta. Compra ainda não aprovada (Pendente, Em Andamento, Aguardando Aprovação) com valor vira PREVISTO:
// aparece à parte e não entra no saldo.
//
// MÊS DA COMPRA (competência) = o mês em que ela foi CRIADA no sistema — o mesmo critério da tela do Financeiro de hoje, para
// o total bater com o "Total gasto" dela. Medido em 05/10/2026: com a aprovação como critério, 12 das 40 compras com valor
// mudariam de mês; se o usuário preferir, o critério é trocado só em `competenciaDaCompra`.
// A conciliação bancária (hoje vazia) NÃO entra: quando houver dado, só vale o que não estiver ligado a compra ou despesa.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Icone from './Icone';
import { Botao, Selo, Faixa, diaBR, diaISO } from './Interface';
import { idsComDescendentes, orcamentoDoCentro, foraDaVigencia, ordenarArvore } from './CentroCustoShared';
import { abrirVinculo } from './VinculoPicker';
import { baixarPlanilha } from './ExportarPlanilha';
import { lerFechamentos, fechamentoVigente } from './CentroCustoFechamento';
import { mdiOpenInNew, mdiArrowLeft, mdiSubdirectoryArrowRight, mdiFileExcelOutline, mdiArrowTopRight, mdiArrowBottomRight, mdiMinus } from '@mdi/js';

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STATUS_QUE_COMPROMETE = ['Aprovado', 'Comprado', 'Recebido'];
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
export const reais = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const primeiraLinha = (t: any) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';

// ─── LEITURA ──────────────────────────────────────────────────────────────────
// O servidor devolve no máximo 1000 linhas por consulta: lê em páginas para a conta não ficar pela metade sem avisar.
export async function lerPaginado(montar: () => any) {
  const saida: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    saida.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return saida;
}

/** Compras, pagamentos e despesas — o que alimenta a conta. Lança erro se alguma leitura falhar (quem chama avisa). */
export async function carregarMovimentosCentros() {
  const [compras, faturamentos, despesas] = await Promise.all([
    // vinculo_*: a OP a que a compra está ligada (Etapa 15e, custo por OP)
    lerPaginado(() => supabase.from('pcp_pedidos_compra').select('id,numero_pedido,descricao_material,fornecedor,status_compra,valor_compra,centro_custo_id,data_criacao,vinculo_tipo,vinculo_id,vinculo_descricao').order('id')),
    lerPaginado(() => supabase.from('pcp_pedidos_faturamento').select('id,pedido_id,valor,data_pagamento').order('id')),
    lerPaginado(() => supabase.from('centro_custo_despesas').select('id,centro_custo_id,valor,descricao,data,parcelado,valor_total_negociado,despesa_pai_id,num_parcelas,categoria_id,competencia,fornecedor,numero_nf').order('id')),
  ]);
  return { compras, faturamentos, despesas };
}

/** As linhas de orçamento de um ano (todos os centros). */
export async function carregarOrcamentoDoAno(ano: number) {
  return lerPaginado(() => supabase.from('centros_custo_orcamento').select('centro_id,ano,mes,valor').eq('ano', ano).order('id'));
}

// ─── CONTA ────────────────────────────────────────────────────────────────────
/** O dia (AAAA-MM-DD, no fuso de quem usa) a que a compra pertence. Troque aqui se o critério mudar. */
export const competenciaDaCompra = (p: any): string => (p?.data_criacao ? diaISO(new Date(p.data_criacao)) : '');

/** Quanto já foi PAGO de cada pedido (só conta pagamento com data). */
function pagoDosPedidos(faturamentos: any[]): Record<string, number> {
  const pago: Record<string, number> = {};
  for (const f of faturamentos || []) {
    if (f.data_pagamento) pago[f.pedido_id] = (pago[f.pedido_id] || 0) + (Number(f.valor) || 0);
  }
  return pago;
}

// Etapa 15e (05/10/2026): compra LIGADA a uma OP = o vínculo escolhido no pedido (tipo op/opl/op_os + o id da OP). O texto digitado no
// campo `opl` NÃO conta: medido no banco real, as 3 compras com esse texto têm "GARANTIA MAÇANETA" e "OPL A1590 e A1588", não uma ligação.
export const TIPOS_VINCULO_DE_OP = ['op', 'opl', 'op_os'];
export const ehCompraDeOp = (p: any): boolean => TIPOS_VINCULO_DE_OP.includes(p?.vinculo_tipo) && !!p?.vinculo_id;

/** Uma compra já com os três valores separados (realizado, comprometido, previsto) — a mesma conta para o painel e para o custo por OP. */
function itemDaCompra(p: any, pagoPorPedido: Record<string, number>) {
  const valor = Number(p.valor_compra) || 0;
  const data = competenciaDaCompra(p);
  let realizado = 0, comprometido = 0, previsto = 0;
  if (STATUS_QUE_COMPROMETE.includes(p.status_compra)) {
    const pago = pagoPorPedido[p.id] || 0;
    realizado = pago; comprometido = Math.max(0, valor - pago);
  } else previsto = valor;
  return {
    chave: 'c' + p.id, tipo: 'compra', centroId: p.centro_custo_id || null, data, ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)),
    numero: p.numero_pedido || '', descricao: primeiraLinha(p.descricao_material), fornecedor: String(p.fornecedor || '').trim(), categoriaId: null,
    status: p.status_compra, valor, realizado: r2(realizado), comprometido: r2(comprometido), previsto: r2(previsto),
    opId: ehCompraDeOp(p) ? String(p.vinculo_id) : null, opRotulo: ehCompraDeOp(p) ? String(p.vinculo_descricao || '').trim() : '',
  };
}

/** As compras ligadas a uma OP, COM OU SEM centro (o custo da OP é de todas as compras dela). Descartada não conta. */
export function normalizarComprasDeOp({ compras, faturamentos }: any) {
  const pago = pagoDosPedidos(faturamentos);
  return (compras || []).filter((p: any) => ehCompraDeOp(p) && p.status_compra !== 'Descartada').map((p: any) => itemDaCompra(p, pago)).filter((i: any) => i.ano && i.mes);
}

/**
 * Transforma compras, pagamentos e despesas em lançamentos com os três valores já separados
 * (realizado, comprometido, previsto). Compra sem centro_custo_id fica de fora (é o assunto da tela "Compras sem centro", 15c).
 */
export function normalizarMovimentos({ compras, faturamentos, despesas }: any) {
  const pagoPorPedido = pagoDosPedidos(faturamentos);
  const itens: any[] = [];
  for (const p of compras || []) {
    if (!p.centro_custo_id || p.status_compra === 'Descartada') continue;
    itens.push(itemDaCompra(p, pagoPorPedido));
  }
  const medido: Record<string, number> = {};
  for (const d of despesas || []) if (d.despesa_pai_id) medido[d.despesa_pai_id] = (medido[d.despesa_pai_id] || 0) + (Number(d.valor) || 0);
  for (const d of despesas || []) {
    if (!d.centro_custo_id) continue;
    const data = String(d.data || '').slice(0, 10); // coluna *date*: lida do texto
    // Etapa 15d (05/10/2026): a despesa conta no mês da COMPETÊNCIA; sem competência (as de antes), no mês da data
    const mesRef = d.competencia ? String(d.competencia).slice(0, 10) : data;
    const base = { centroId: d.centro_custo_id, data, ano: Number(mesRef.slice(0, 4)), mes: Number(mesRef.slice(5, 7)), numero: d.numero_nf ? `NF ${d.numero_nf}` : '', descricao: d.descricao || '', fornecedor: String(d.fornecedor || '').trim(), categoriaId: d.categoria_id || null, previsto: 0 };
    if (d.parcelado) {
      // contrato parcelado: o que já foi medido é realizado (as medições são linhas próprias); o que falta do combinado é comprometido
      const falta = Math.max(0, (Number(d.valor_total_negociado) || 0) - (medido[d.id] || 0));
      itens.push({ ...base, chave: 'd' + d.id, tipo: 'contrato', status: 'Contrato parcelado', valor: Number(d.valor_total_negociado) || 0, realizado: 0, comprometido: r2(falta) });
    } else {
      const v = Number(d.valor) || 0;
      itens.push({ ...base, chave: 'd' + d.id, tipo: d.despesa_pai_id ? 'medicao' : 'despesa', status: d.despesa_pai_id ? 'Medição paga' : 'Despesa', valor: v, realizado: r2(v), comprometido: 0 });
    }
  }
  return itens.filter(i => i.ano && i.mes);
}

/** O centro (com a subárvore inteira, como a tela do Financeiro já faz) mês a mês num ano. */
export function calcularCentro({ centro, centros, itens, orcLinhas, ano }: any) {
  const ids = new Set(idsComDescendentes(centro.id, centros));
  const orc = orcamentoDoCentro(centro, centros, orcLinhas || []);
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, orcado: orc[i], realizado: 0, comprometido: 0, previsto: 0 }));
  const doCentro = (itens || []).filter((it: any) => ids.has(it.centroId) && it.ano === ano);
  for (const it of doCentro) {
    const m = meses[it.mes - 1];
    m.realizado += it.realizado; m.comprometido += it.comprometido; m.previsto += it.previsto;
  }
  meses.forEach(m => { m.realizado = r2(m.realizado); m.comprometido = r2(m.comprometido); m.previsto = r2(m.previsto); });
  return { meses, itens: doCentro, temOrcamento: orc.some(v => v > 0) };
}

/** Soma de um mês (1 a 12) ou do ano todo (0). `pct` é null quando não há orçamento no período — sem orçamento, sem alerta. */
export function somarPeriodo(meses: any[], mes: number) {
  const lista = mes ? meses.filter(m => m.mes === mes) : meses;
  const s = { orcado: 0, realizado: 0, comprometido: 0, previsto: 0 };
  lista.forEach(m => { s.orcado += m.orcado; s.realizado += m.realizado; s.comprometido += m.comprometido; s.previsto += m.previsto; });
  const orcado = r2(s.orcado), realizado = r2(s.realizado), comprometido = r2(s.comprometido), previsto = r2(s.previsto);
  const usado = r2(realizado + comprometido);
  // o percentual mostrado SEMPRE arredonda para baixo: 79,99% não pode aparecer como "80%" (verde) quando a faixa de 80% ainda não chegou
  return { orcado, realizado, comprometido, previsto, usado, saldo: r2(orcado - usado), pct: orcado > 0 ? Math.floor(usado / orcado * 1000 + 1e-9) / 10 : null };
}

/** 'sem' (sem orçamento) · 'ok' · 'atencao' (a partir de 80%) · 'estouro' (a partir de 100%). Compara em centavos inteiros (sem erro de ponto flutuante). */
export function faixaDoConsumo(usado: number, orcado: number): 'sem' | 'ok' | 'atencao' | 'estouro' {
  const u = Math.round((Number(usado) || 0) * 100), o = Math.round((Number(orcado) || 0) * 100);
  if (o <= 0) return 'sem';
  if (u * 100 >= o * 100) return 'estouro';
  if (u * 100 >= o * 80) return 'atencao';
  return 'ok';
}
const FAMILIA_FAIXA: Record<string, string> = { sem: 'neutro', ok: 'ok', atencao: 'atencao', estouro: 'erro' };

// ─── COMPARATIVO, CUSTO POR OP E PLANILHA (Etapa 15e, 05/10/2026) ──────────────
/** O gasto (realizado + comprometido) de um mês de um ano, com a subárvore do centro. O previsto fica de fora, como no saldo. */
export function somarMes({ centro, centros, itens, ano, mes }: any) {
  const ids = new Set(idsComDescendentes(centro.id, centros));
  let realizado = 0, comprometido = 0, previsto = 0;
  for (const it of itens || []) {
    if (!ids.has(it.centroId) || it.ano !== ano || it.mes !== mes) continue;
    realizado += it.realizado; comprometido += it.comprometido; previsto += it.previsto;
  }
  realizado = r2(realizado); comprometido = r2(comprometido); previsto = r2(previsto);
  return { realizado, comprometido, previsto, usado: r2(realizado + comprometido) };
}

/** Variação de `atual` em relação a `ref`, em reais e em % (uma casa). Sem base (ref = 0) não há percentual. Em centavos inteiros: sem erro de ponto flutuante. */
export function variacao(atual: number, ref: number) {
  const a = Math.round((Number(atual) || 0) * 100), b = Math.round((Number(ref) || 0) * 100);
  return { delta: (a - b) / 100, pct: b > 0 ? Math.round(((a - b) * 1000) / b) / 10 : null };
}

/** O mês escolhido contra o mês anterior (janeiro olha dezembro do ano anterior) e contra o MESMO mês do ano anterior. */
export function comparativoDoMes({ centro, centros, itens, ano, mes }: any) {
  const atual = somarMes({ centro, centros, itens, ano, mes });
  const ant = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const anterior = { ...ant, ...somarMes({ centro, centros, itens, ...ant }) };
  const mesmo = { ano: ano - 1, mes, ...somarMes({ centro, centros, itens, ano: ano - 1, mes }) };
  return {
    atual: { ano, mes, ...atual },
    anterior: { ...anterior, ...variacao(atual.usado, anterior.usado) },
    anoAnterior: { ...mesmo, ...variacao(atual.usado, mesmo.usado) },
  };
}

/** "A1678.2609 — FOQUEILINHA" → número da OP e o resto (cliente ou modelo). O vínculo guarda os dois no mesmo texto. */
export const numeroDaOp = (rotulo: string) => String(rotulo || '').split(' — ')[0].trim();
export const restoDaOp = (rotulo: string) => String(rotulo || '').split(' — ').slice(1).join(' — ').trim();

/** Agrupa os lançamentos de compra ligados a OP, uma linha por OP, da que mais custou para a que menos custou. */
export function agruparPorOp(itens: any[]) {
  const m = new Map<string, any>();
  for (const it of itens || []) {
    if (!it.opId) continue;
    let g = m.get(it.opId);
    if (!g) { g = { opId: it.opId, rotulo: it.opRotulo, compras: 0, realizado: 0, comprometido: 0, previsto: 0, centroIds: new Set<string>(), itens: [] }; m.set(it.opId, g); }
    if (!g.rotulo && it.opRotulo) g.rotulo = it.opRotulo;
    g.compras++; g.realizado += it.realizado; g.comprometido += it.comprometido; g.previsto += it.previsto;
    g.centroIds.add(it.centroId || '');
    g.itens.push(it);
  }
  return [...m.values()].map(g => ({
    ...g, realizado: r2(g.realizado), comprometido: r2(g.comprometido), previsto: r2(g.previsto), total: r2(g.realizado + g.comprometido),
  })).sort((a, b) => b.total - a.total || b.previsto - a.previsto || String(a.rotulo).localeCompare(String(b.rotulo)));
}

/** Como o lançamento aparece na coluna "Situação" (a tela e a planilha usam a mesma frase). */
export function situacaoDoItem(it: any): { texto: string; familia: string } {
  if (it.previsto > 0) return { texto: `Previsto · ${it.status}`, familia: 'neutro' };
  if (it.comprometido > 0 && it.realizado > 0) return { texto: 'Parte paga', familia: 'info' };
  if (it.comprometido > 0) return { texto: it.tipo === 'contrato' ? 'Falta pagar' : 'Comprometido', familia: 'info' };
  return { texto: it.tipo === 'compra' ? 'Pago' : it.status, familia: 'ok' };
}
export const textoDoLancamento = (it: any) => (it.numero ? it.numero + ' · ' : '') + (it.tipo === 'compra' ? (it.descricao || 'Compra') : it.descricao || it.status);
/** Contrato parcelado: o valor mostrado é o que FALTA pagar (o combinado já medido são as linhas "Medição paga"). */
export const valorDoLancamento = (it: any) => (it.tipo === 'contrato' ? it.comprometido : it.valor);

const dataBR = (d: string) => (d ? diaBR(d) : '');
const fracao = (pct: number | null) => (pct == null ? null : pct / 100);

/**
 * As folhas da planilha do painel. O que a tela mostra inteiro sai igual (resumo, comparativo, mês a mês, filhos); onde a tela só
 * mostra os maiores (8 fornecedores, 10 categorias, 10 OPs, 12 lançamentos) a planilha traz a LISTA COMPLETA do ano, e a soma
 * de cada folha fecha com o total gasto.
 */
export function folhasDoPainel(d: any) {
  const { centro, ano, mes, sMes, sAno, comp, calc, filhos, doFilho, fornecedores, categorias, ops, lancamentos, codigoDe } = d;
  const COL = {
    periodo: { rotulo: 'Período', largura: 24 }, orcado: { rotulo: 'Orçado', formato: 'moeda' }, realizado: { rotulo: 'Realizado', formato: 'moeda' },
    comprometido: { rotulo: 'Comprometido', formato: 'moeda' }, saldo: { rotulo: 'Saldo', formato: 'moeda' }, uso: { rotulo: 'Uso', formato: 'percentual' },
  };
  const linhaPeriodo = (rotulo: string, s: any) => [rotulo, s.orcado || null, s.realizado, s.comprometido, s.orcado ? s.saldo : null, fracao(s.pct)];
  const folhas: any[] = [];
  folhas.push({
    nome: 'Resumo',
    colunas: [COL.periodo, COL.orcado, COL.realizado, COL.comprometido, COL.saldo, COL.uso, { rotulo: 'Previsto (sem aprovação)', formato: 'moeda', largura: 24 }],
    linhas: [[...linhaPeriodo(`${MESES[mes - 1]} de ${ano}`, sMes), sMes.previsto], [...linhaPeriodo(`Ano de ${ano}`, sAno), sAno.previsto]],
  });
  if (comp) {
    const lin = (rotulo: string, p: any, base: boolean) => [rotulo, p.realizado, p.comprometido, p.usado, base ? null : p.delta, base ? null : fracao(p.pct)];
    folhas.push({
      nome: 'Comparativo',
      colunas: [COL.periodo, COL.realizado, COL.comprometido, { rotulo: 'Total gasto', formato: 'moeda' }, { rotulo: 'Variação (R$)', formato: 'moeda' }, { rotulo: 'Variação (%)', formato: 'percentual' }],
      linhas: [
        lin(`${MESES[comp.atual.mes - 1]} de ${comp.atual.ano}`, comp.atual, true),
        lin(`${MESES[comp.anterior.mes - 1]} de ${comp.anterior.ano}`, comp.anterior, false),
        lin(`${MESES[comp.anoAnterior.mes - 1]} de ${comp.anoAnterior.ano}`, comp.anoAnterior, false),
      ],
    });
  }
  folhas.push({
    nome: 'Mês a mês',
    colunas: [{ rotulo: 'Mês', largura: 10 }, COL.orcado, COL.realizado, COL.comprometido, COL.saldo, COL.uso],
    linhas: [
      ...calc.meses.map((m: any) => { const s = somarPeriodo([m], 0); return [MESES_CURTOS[m.mes - 1], m.orcado || null, m.realizado, m.comprometido, m.orcado ? s.saldo : null, fracao(s.pct)]; }),
      ['Ano', sAno.orcado || null, sAno.realizado, sAno.comprometido, sAno.orcado ? sAno.saldo : null, fracao(sAno.pct)],
    ],
  });
  if (filhos.length) {
    folhas.push({
      nome: 'Filhos',
      colunas: [{ rotulo: 'Centro', largura: 40 }, COL.orcado, COL.realizado, COL.comprometido, COL.saldo, COL.uso],
      linhas: filhos.map((f: any) => { const s = doFilho(f); return [`${f.codigo} ${f.nome}`, s.orcado || null, s.realizado, s.comprometido, s.orcado ? s.saldo : null, fracao(s.pct)]; }),
    });
  }
  folhas.push({
    nome: 'Por fornecedor',
    colunas: [{ rotulo: 'Fornecedor', largura: 40 }, { rotulo: 'Lançamentos', formato: 'inteiro' }, { rotulo: 'Total gasto', formato: 'moeda' }],
    linhas: fornecedores.map((f: any) => [f.nome, f.n, f.total]),
  });
  folhas.push({
    nome: 'Por categoria',
    colunas: [{ rotulo: 'Categoria', largura: 32 }, { rotulo: 'Total gasto', formato: 'moeda' }],
    linhas: categorias.map((c: any) => [c.nome, c.total]),
  });
  folhas.push({
    nome: 'Custo por OP',
    colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Cliente / modelo', largura: 32 }, { rotulo: 'Compras', formato: 'inteiro' }, COL.realizado, COL.comprometido, { rotulo: 'Total gasto', formato: 'moeda' }, { rotulo: 'Previsto (sem aprovação)', formato: 'moeda', largura: 24 }],
    linhas: ops.map((o: any) => [numeroDaOp(o.rotulo) || '(sem número)', restoDaOp(o.rotulo), o.compras, o.realizado, o.comprometido, o.total, o.previsto]),
  });
  const temFilhos = filhos.length > 0;
  folhas.push({
    nome: 'Lançamentos',
    colunas: [{ rotulo: 'Data', largura: 12 }, ...(temFilhos ? [{ rotulo: 'Centro', largura: 14 }] : []), { rotulo: 'Lançamento', largura: 46 }, { rotulo: 'Situação', largura: 22 }, { rotulo: 'Valor', formato: 'moeda' },
      { rotulo: 'Fornecedor', largura: 28 }, COL.realizado, COL.comprometido],
    linhas: lancamentos.map((it: any) => [dataBR(it.data), ...(temFilhos ? [codigoDe(it.centroId)] : []), textoDoLancamento(it), situacaoDoItem(it).texto, valorDoLancamento(it), it.fornecedor || '', it.realizado, it.comprometido]),
  });
  return folhas;
}

// ─── AVISO DE CONSUMO (menção ao responsável) ─────────────────────────────────
// Uma menção por faixa e por mês: o registro em centros_custo_alertas (único por centro/ano/mês/faixa) decide, no banco,
// mesmo que duas pessoas abram a tela ao mesmo tempo. Só avisa — nunca bloqueia. Só centro com RESPONSÁVEL cadastrado
// e com orçamento no mês. Roda quando alguém abre o Financeiro (o sistema autentica no navegador e não tem rotina de
// fundo; é o mesmo caminho do aviso de entrega atrasada do Compras).
export async function avaliarAlertasDeConsumo({ centros, itens, orcLinhas, ano, mes }: any) {
  const enviados: any[] = [];
  for (const c of centros || []) {
    if (!c.ativo || !c.responsavel_email) continue;
    const { meses } = calcularCentro({ centro: c, centros, itens, orcLinhas, ano });
    const s = somarPeriodo(meses, mes);
    const faixa = faixaDoConsumo(s.usado, s.orcado);
    if (faixa !== 'atencao' && faixa !== 'estouro') continue;
    const faixas = faixa === 'estouro' ? [80, 100] : [80];
    const { data: novas, error } = await supabase.from('centros_custo_alertas')
      .upsert(faixas.map(f => ({ centro_id: c.id, ano, mes, faixa: f, percentual: s.pct })), { onConflict: 'centro_id,ano,mes,faixa', ignoreDuplicates: true }).select('faixa');
    if (error || !novas?.length) continue; // falhou, ou já tinha avisado nesta faixa neste mês
    const mais = Math.max(...novas.map((x: any) => x.faixa));
    const { data: dest } = await supabase.from('auth_usuarios').select('id,nome').eq('email', c.responsavel_email).maybeSingle();
    if (!dest) continue;
    const texto = mais >= 100
      ? `O orçamento de ${MESES[mes - 1].toLowerCase()}/${ano} do centro ${c.codigo} — ${c.nome} foi ultrapassado: ${reais(s.usado)} de ${reais(s.orcado)} (${s.pct}%).`
      : `O orçamento de ${MESES[mes - 1].toLowerCase()}/${ano} do centro ${c.codigo} — ${c.nome} chegou a ${s.pct}%: ${reais(s.usado)} de ${reais(s.orcado)}.`;
    const { error: errMencao } = await supabase.from('mencoes').insert({
      mencionado_id: String(dest.id), mencionado_nome: dest.nome, mencionante_id: '', mencionante_nome: 'Sistema',
      contexto: 'centro_custo', contexto_id: String(c.id), contexto_descricao: `Centro ${c.codigo} — ${c.nome}`,
      campo: mais >= 100 ? 'orcamento_estourado' : 'orcamento_80', texto_trecho: texto, aba_destino: 'financeiro', lida: false, criado_em: new Date().toISOString(),
    });
    if (!errMencao) enviados.push({ centroId: c.id, codigo: c.codigo, faixa: mais, pct: s.pct });
  }
  return enviados;
}

// ─── PEÇAS ────────────────────────────────────────────────────────────────────
function Barra({ s, rotulo }: any) {
  const faixa = faixaDoConsumo(s.usado, s.orcado);
  const pct = s.pct == null ? 0 : s.pct;
  return (
    <div className="acn-cc-consumo-bloco">
      <div className="acn-cc-consumo" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(pct))}
        aria-valuetext={s.pct == null ? 'sem orçamento' : `${s.pct}% do orçamento`}>
        <div className={'acn-cc-consumo-preenchido faixa-' + faixa} style={{ width: Math.min(100, pct) + '%' }} />
        <span className="acn-cc-consumo-marca" style={{ left: '80%' }} aria-hidden="true" />
      </div>
      <div className="acn-cc-consumo-legenda">
        {s.pct == null ? <span className="acn-fraco">Sem orçamento neste período — sem alerta.</span>
          : <Selo familia={FAMILIA_FAIXA[faixa]}>{s.pct.toLocaleString('pt-BR')}% do orçamento usado</Selo>}
      </div>
    </div>
  );
}

function Quatro({ titulo, s }: any) {
  return (
    <div className="acn-quadro acn-cc-periodo">
      <div className="acn-quadro-titulo">{titulo}</div>
      <div className="acn-cc-kpis">
        <div className="acn-cc-kpi"><span>Orçado</span><strong>{s.orcado ? reais(s.orcado) : '—'}</strong></div>
        <div className="acn-cc-kpi"><span>Realizado</span><strong>{reais(s.realizado)}</strong><em>pago</em></div>
        <div className="acn-cc-kpi"><span>Comprometido</span><strong>{reais(s.comprometido)}</strong><em>aprovado, ainda não pago</em></div>
        <div className={'acn-cc-kpi' + (s.orcado && s.saldo < 0 ? ' negativo' : '')}><span>Saldo</span><strong>{s.orcado ? reais(s.saldo) : '—'}</strong></div>
      </div>
      <Barra s={s} rotulo={titulo} />
      {s.previsto > 0 && <div className="acn-ajuda">Pedidos ainda sem aprovação: <strong>{reais(s.previsto)}</strong> (previsto — não entra no saldo).</div>}
    </div>
  );
}

// ─── O PAINEL ─────────────────────────────────────────────────────────────────
/**
 * `centros`: todos os centros (com os campos da ficha). `onVerLancamentos(centro)` é opcional: quando vem, aparece o
 * botão que abre a janela de compras e despesas que a tela do Financeiro já tem.
 */
export function PainelCentroCusto({ centroId, centros, onClose, onVerLancamentos, anoInicial }: any) {
  const agora = new Date();
  const [atualId, setAtualId] = useState(centroId);
  const [ano, setAno] = useState(anoInicial || agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [mov, setMov] = useState<any>(null);
  const [orc, setOrc] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [categorias, setCategorias] = useState<any[]>([]);
  useEffect(() => { supabase.from('centro_custo_categorias').select('id,nome').then(({ data }) => setCategorias(data || [])); }, []);
  // Etapa 15e-2: o selo "Mês fechado" (se a leitura falhar, só não aparece o selo)
  const [fechamentos, setFechamentos] = useState<any[]>([]);
  useEffect(() => { lerFechamentos().then(setFechamentos).catch(() => setFechamentos([])); }, [tentativa]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro('');
    Promise.all([carregarMovimentosCentros(), carregarOrcamentoDoAno(ano)])
      .then(([m, o]) => { if (vivo) { setMov(m); setOrc(o); } })
      .catch(e => { if (vivo) setErro(e?.message || String(e)); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [ano, tentativa]);

  const centro = centros.find((c: any) => c.id === atualId);
  const itens = useMemo(() => (mov ? normalizarMovimentos(mov) : []), [mov]);
  const calc = useMemo(() => (centro && mov ? calcularCentro({ centro, centros, itens, orcLinhas: orc, ano }) : null), [centro, centros, itens, orc, ano, mov]);
  const filhos = useMemo(() => ordenarArvore(centros.filter((c: any) => c.parent_id === atualId)), [centros, atualId]);
  const doFilho = (f: any) => somarPeriodo(calcularCentro({ centro: f, centros, itens, orcLinhas: orc, ano }).meses, 0);

  const sMes = calc ? somarPeriodo(calc.meses, mes) : null;
  const sAno = calc ? somarPeriodo(calc.meses, 0) : null;
  const pai = centro?.parent_id ? centros.find((c: any) => c.id === centro.parent_id) : null;
  const faixaMes = sMes ? faixaDoConsumo(sMes.usado, sMes.orcado) : 'sem';
  const faixaAno = sAno ? faixaDoConsumo(sAno.usado, sAno.orcado) : 'sem';

  // quem forneceu: as compras do período (despesa avulsa ainda não guarda fornecedor — chega com a 15d)
  // Etapa 15e: a lista COMPLETA (a planilha leva tudo) e, na tela, só os maiores — `.slice` logo abaixo
  const fornecedoresTodos = useMemo(() => {
    if (!calc) return [];
    const m: Record<string, { nome: string; total: number; n: number }> = {};
    for (const it of calc.itens) {
      const gasto = it.realizado + it.comprometido;
      if (!gasto) continue;
      const nome = it.fornecedor || (it.tipo === 'compra' ? '(sem fornecedor)' : 'Despesas avulsas (sem fornecedor)');
      (m[nome] ||= { nome, total: 0, n: 0 }).total += gasto; m[nome].n++;
    }
    return Object.values(m).map(x => ({ ...x, total: r2(x.total) })).sort((a, b) => b.total - a.total);
  }, [calc]);
  const porFornecedor = useMemo(() => fornecedoresTodos.slice(0, 8), [fornecedoresTodos]);
  // por categoria (15d): a despesa tem a sua; compra não tem categoria e entra junta como "Compras (pedidos)"
  const categoriasTodas = useMemo(() => {
    if (!calc) return [];
    const m: Record<string, { nome: string; total: number }> = {};
    for (const it of calc.itens) {
      const gasto = it.realizado + it.comprometido;
      if (!gasto) continue;
      const nome = it.tipo === 'compra' ? 'Compras (pedidos)' : (categorias.find((c: any) => c.id === it.categoriaId)?.nome || 'Despesas sem categoria');
      (m[nome] ||= { nome, total: 0 }).total += gasto;
    }
    return Object.values(m).map(x => ({ ...x, total: r2(x.total) })).sort((a, b) => b.total - a.total);
  }, [calc, categorias]);
  const porCategoria = useMemo(() => categoriasTodas.slice(0, 10), [categoriasTodas]);
  const lancamentosTodos = useMemo(() => (calc ? [...calc.itens].sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.chave).localeCompare(String(a.chave))) : []), [calc]);
  const ultimos = useMemo(() => lancamentosTodos.slice(0, 12), [lancamentosTodos]);
  // Etapa 15e: comparativo do mês escolhido e custo por OP (as compras do centro ligadas a uma OP, no ano)
  const comp = useMemo(() => (centro && mov ? comparativoDoMes({ centro, centros, itens, ano, mes }) : null), [centro, centros, itens, ano, mes, mov]);
  const opsTodas = useMemo(() => (calc ? agruparPorOp(calc.itens) : []), [calc]);
  const porOp = useMemo(() => opsTodas.slice(0, 10), [opsTodas]);
  const nenhumPagamento = !!calc && calc.itens.some(i => i.tipo === 'compra' && i.comprometido > 0) && !calc.itens.some(i => i.tipo === 'compra' && i.realizado > 0);
  const anos = Array.from(new Set([agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1, ano])).sort();
  const codigoDe = (id: string) => centros.find((c: any) => c.id === id)?.codigo || '';
  const maxFornecedor = Math.max(1, ...porFornecedor.map(f => f.total));
  const maxCategoria = Math.max(1, ...porCategoria.map(f => f.total));

  // Etapa 15e: baixa a planilha do que o painel mostra (ver `folhasDoPainel`: onde a tela só mostra os maiores, a planilha traz a lista toda)
  const exportar = () => {
    if (!calc || !sMes || !sAno) return;
    try {
      baixarPlanilha(`Centro_${centro.codigo}_${ano}-${String(mes).padStart(2, '0')}`,
        folhasDoPainel({ centro, ano, mes, sMes, sAno, comp, calc, filhos, doFilho, fornecedores: fornecedoresTodos, categorias: categoriasTodas, ops: opsTodas, lancamentos: lancamentosTodos, codigoDe }));
    } catch (e: any) { alert('Não foi possível gerar a planilha: ' + (e?.message || e)); }
  };

  if (!centro) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cc-painel" role="dialog" aria-label={`Painel do centro ${centro.codigo}`}>
        <div className="acn-modal-cab">
          <span className="modal-title">{centro.codigo} — {centro.nome}</span>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-cc-painel-topo">
            <div className="acn-cc-painel-selos">
              {centro.responsavel_nome && <span className="acn-fraco">Responsável: <strong className="acn-forte">{centro.responsavel_nome}</strong></span>}
              {centro.empresa && <Selo familia="neutro" ponto={false}>{centro.empresa}</Selo>}
              {centro.recebe_lancamento === false && <Selo familia="neutro" ponto={false}>Só agrupa</Selo>}
              {foraDaVigencia(centro) && <Selo familia="atencao" ponto={false}>Fora da vigência</Selo>}
              {!centro.ativo && <Selo familia="neutro" ponto={false}>Inativo</Selo>}
              {centro.orcamento_modo === 'soma_filhos' && <Selo familia="info" ponto={false}>Orçamento = soma dos filhos</Selo>}
            </div>
            <div className="acn-cab-filtros">
              {pai && <Botao pequeno icone={mdiArrowLeft} onClick={() => setAtualId(pai.id)}>Voltar para {pai.codigo}</Botao>}
              <select className="acn-input acn-cc-filtro" value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano do painel">
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="acn-input acn-cc-filtro" value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mês do painel">
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              {fechamentoVigente(fechamentos, { ano, mes }) && <Selo familia="info" ponto={false} title="Este mês está fechado: despesas e a correção de compras dele estão travadas">Mês fechado</Selo>}
            </div>
          </div>

          {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={() => setTentativa(t => t + 1)}>Tentar de novo</Botao>}>Não foi possível ler os lançamentos: {erro}.</Faixa>}
          {carregando && !calc && <div className="acn-empty">Carregando…</div>}

          {calc && sMes && sAno && (<>
            {faixaMes === 'estouro' && <Faixa tom="erro">O consumo de {MESES[mes - 1].toLowerCase()} passou do orçamento: {reais(sMes.usado)} de {reais(sMes.orcado)} ({sMes.pct}%). O sistema só avisa — nada é bloqueado.</Faixa>}
            {faixaMes === 'atencao' && <Faixa tom="atencao">O consumo de {MESES[mes - 1].toLowerCase()} chegou a {sMes.pct}% do orçamento: {reais(sMes.usado)} de {reais(sMes.orcado)}.</Faixa>}
            {faixaAno === 'estouro' && <Faixa tom="erro">O consumo do ano passou do orçamento: {reais(sAno.usado)} de {reais(sAno.orcado)} ({sAno.pct}%).</Faixa>}
            {faixaAno === 'atencao' && <Faixa tom="atencao">O consumo do ano chegou a {sAno.pct}% do orçamento.</Faixa>}
            {nenhumPagamento && <Faixa tom="info">Ainda não há pagamento de compra registrado neste centro em {ano}. Por isso as compras aprovadas aparecem como <strong>comprometido</strong>; elas passam a <strong>realizado</strong> quando o financeiro registrar a data de pagamento.</Faixa>}
            {!calc.temOrcamento && <Faixa tom="info">Este centro não tem orçamento em {ano}: os valores abaixo são só o que foi gasto, sem saldo nem alerta. O orçamento se define na ficha do centro (Admin › Centros de Custo).</Faixa>}

            <div className="acn-cc-periodos">
              <Quatro titulo={`${MESES[mes - 1]} de ${ano}`} s={sMes} />
              <Quatro titulo={`Ano de ${ano}`} s={sAno} />
            </div>

            {comp && (
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Comparativo — {MESES[mes - 1]} de {ano}</div>
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-compacta">
                    <thead><tr><th>Período</th><th>Realizado</th><th>Comprometido</th><th>Total gasto</th><th>Variação</th></tr></thead>
                    <tbody>
                      <tr className="acn-cc-mes-atual">
                        <td>{MESES[comp.atual.mes - 1]} de {comp.atual.ano}</td>
                        <td className="acn-nowrap">{reais(comp.atual.realizado)}</td><td className="acn-nowrap">{reais(comp.atual.comprometido)}</td>
                        <td className="acn-nowrap"><strong className="acn-forte">{reais(comp.atual.usado)}</strong></td>
                        <td><span className="acn-fraco">este mês</span></td>
                      </tr>
                      {[comp.anterior, comp.anoAnterior].map((p: any, i: number) => (
                        <tr key={i}>
                          <td>{MESES[p.mes - 1]} de {p.ano} <span className="acn-fraco">{i === 0 ? '(mês anterior)' : '(mesmo mês, ano anterior)'}</span></td>
                          <td className="acn-nowrap">{reais(p.realizado)}</td><td className="acn-nowrap">{reais(p.comprometido)}</td>
                          <td className="acn-nowrap">{reais(p.usado)}</td>
                          <td className="acn-nowrap acn-cc-var">
                            {p.delta === 0 && p.usado === 0 ? <span className="acn-fraco">sem gasto nos dois</span> : (<>
                              <Icone path={p.delta > 0 ? mdiArrowTopRight : p.delta < 0 ? mdiArrowBottomRight : mdiMinus} size={14} />
                              <span>{p.delta > 0 ? '+' : p.delta < 0 ? '−' : ''}{reais(Math.abs(p.delta))}</span>
                              {p.pct == null ? <span className="acn-fraco">(sem base para comparar)</span> : <span className="acn-fraco">({p.pct > 0 ? '+' : p.pct < 0 ? '−' : ''}{Math.abs(p.pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)</span>}
                            </>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="acn-ajuda">Gasto = realizado + comprometido (o previsto fica de fora). Variação = o mês escolhido em relação ao período da linha. Se o mês escolhido ainda está em andamento, ele pode receber mais lançamentos.</div>
              </div>
            )}

            <div className="acn-quadro">
              <div className="acn-quadro-titulo">Mês a mês — {ano}</div>
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr><th>Mês</th><th>Orçado</th><th>Realizado</th><th>Comprometido</th><th>Saldo</th><th>Uso</th></tr></thead>
                  <tbody>
                    {calc.meses.map(m => {
                      const s = somarPeriodo([m], 0);
                      const f = faixaDoConsumo(s.usado, s.orcado);
                      return (
                        <tr key={m.mes} className={m.mes === mes ? 'acn-cc-mes-atual' : ''}>
                          <td>{MESES_CURTOS[m.mes - 1]}</td>
                          <td className="acn-nowrap">{m.orcado ? reais(m.orcado) : <span className="acn-fraco">—</span>}</td>
                          <td className="acn-nowrap">{m.realizado ? reais(m.realizado) : <span className="acn-fraco">—</span>}</td>
                          <td className="acn-nowrap">{m.comprometido ? reais(m.comprometido) : <span className="acn-fraco">—</span>}</td>
                          <td className="acn-nowrap">{m.orcado ? <span className={s.saldo < 0 ? 'acn-txt-erro' : ''}>{reais(s.saldo)}</span> : <span className="acn-fraco">—</span>}</td>
                          <td>{s.pct == null ? <span className="acn-fraco">{s.usado ? 'sem orçamento' : '—'}</span> : <Selo familia={FAMILIA_FAIXA[f]} ponto={false}>{s.pct.toLocaleString('pt-BR')}%</Selo>}</td>
                        </tr>
                      );
                    })}
                    <tr className="acn-linha-total">
                      <td>Ano</td><td className="acn-nowrap">{sAno.orcado ? reais(sAno.orcado) : '—'}</td><td className="acn-nowrap">{reais(sAno.realizado)}</td>
                      <td className="acn-nowrap">{reais(sAno.comprometido)}</td><td className="acn-nowrap">{sAno.orcado ? reais(sAno.saldo) : '—'}</td>
                      <td>{sAno.pct == null ? '—' : sAno.pct.toLocaleString('pt-BR') + '%'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {filhos.length > 0 && (
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Filhos deste centro — {ano} (cada um com a sua subárvore)</div>
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-compacta">
                    <thead><tr><th>Centro</th><th>Orçado</th><th>Realizado</th><th>Comprometido</th><th>Saldo</th><th>Uso</th><th /></tr></thead>
                    <tbody>
                      {filhos.map(f => {
                        const s = doFilho(f); const fx = faixaDoConsumo(s.usado, s.orcado);
                        return (
                          <tr key={f.id} className={f.ativo ? '' : 'acn-linha-inativa'}>
                            <td className="acn-texto-longo"><strong className="acn-cc-codigo">{f.codigo}</strong> <span className="acn-fraco">{f.nome}</span></td>
                            <td className="acn-nowrap">{s.orcado ? reais(s.orcado) : <span className="acn-fraco">—</span>}</td>
                            <td className="acn-nowrap">{reais(s.realizado)}</td>
                            <td className="acn-nowrap">{reais(s.comprometido)}</td>
                            <td className="acn-nowrap">{s.orcado ? <span className={s.saldo < 0 ? 'acn-txt-erro' : ''}>{reais(s.saldo)}</span> : <span className="acn-fraco">—</span>}</td>
                            <td>{s.pct == null ? <span className="acn-fraco">—</span> : <Selo familia={FAMILIA_FAIXA[fx]} ponto={false}>{s.pct.toLocaleString('pt-BR')}%</Selo>}</td>
                            <td><div className="acn-acoes-linha"><Botao pequeno icone={mdiSubdirectoryArrowRight} onClick={() => setAtualId(f.id)} aria-label={`Abrir o painel de ${f.codigo}`} title="Abrir o painel deste filho" /></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="acn-cc-duas">
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Por fornecedor — {ano}</div>
                {porFornecedor.length === 0 ? <div className="acn-ajuda">Nenhuma compra com valor neste centro em {ano}.</div> : (
                  <div className="acn-cc-forn">
                    {porFornecedor.map(f => (
                      <div key={f.nome} className="acn-cc-forn-linha">
                        <span className="acn-cc-forn-nome" title={f.nome}>{f.nome}</span>
                        <span className="acn-cc-forn-barra"><span style={{ width: (f.total / maxFornecedor * 100) + '%' }} /></span>
                        <strong className="acn-nowrap">{reais(f.total)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Por categoria — {ano}</div>
                {porCategoria.length === 0 ? <div className="acn-ajuda">Nenhum gasto neste centro em {ano}.</div> : (
                  <div className="acn-cc-forn">
                    {porCategoria.map(f => (
                      <div key={f.nome} className="acn-cc-forn-linha">
                        <span className="acn-cc-forn-nome" title={f.nome}>{f.nome}</span>
                        <span className="acn-cc-forn-barra"><span style={{ width: (f.total / maxCategoria * 100) + '%' }} /></span>
                        <strong className="acn-nowrap">{reais(f.total)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Custo por OP — {ano}</div>
                {porOp.length === 0 ? <div className="acn-ajuda">Nenhuma compra deste centro ligada a uma OP em {ano}. A ligação é feita no pedido de compra (campo "vínculo").</div> : (
                  <div className="acn-rolagem">
                    <table className="acn-tabela acn-compacta">
                      <thead><tr><th>OP</th><th>Compras</th><th>Realizado</th><th>Comprometido</th><th>Total gasto</th><th /></tr></thead>
                      <tbody>
                        {porOp.map((o: any) => (
                          <tr key={o.opId}>
                            <td className="acn-texto-longo"><strong className="acn-forte">{numeroDaOp(o.rotulo) || '(sem número)'}</strong>{restoDaOp(o.rotulo) && <div className="acn-fraco">{restoDaOp(o.rotulo)}</div>}</td>
                            <td className="acn-nowrap">{o.compras}</td>
                            <td className="acn-nowrap">{reais(o.realizado)}</td>
                            <td className="acn-nowrap">{reais(o.comprometido)}</td>
                            <td className="acn-nowrap"><strong className="acn-forte">{reais(o.total)}</strong>{o.previsto > 0 && <div className="acn-fraco">+ {reais(o.previsto)} previsto</div>}</td>
                            <td><div className="acn-acoes-linha"><Botao pequeno icone={mdiOpenInNew} onClick={() => abrirVinculo({ tipo: 'op', id: o.opId, descricao: o.rotulo })} aria-label={`Abrir a OP ${numeroDaOp(o.rotulo)}`} title="Abrir a OP" /></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {opsTodas.length > porOp.length && <div className="acn-ajuda">Mostrando as {porOp.length} OPs que mais custaram, de {opsTodas.length}. A planilha traz todas.</div>}
              </div>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Últimos lançamentos — {ano}</div>
                {ultimos.length === 0 ? <div className="acn-ajuda">Nenhum lançamento neste centro em {ano}.</div> : (
                  <div className="acn-rolagem">
                    <table className="acn-tabela acn-compacta">
                      <thead><tr><th>Data</th>{filhos.length > 0 && <th>Centro</th>}<th>Lançamento</th><th>Situação</th><th>Valor</th></tr></thead>
                      <tbody>
                        {ultimos.map(it => (
                          <tr key={it.chave}>
                            <td className="acn-nowrap">{diaBR(it.data)}</td>
                            {filhos.length > 0 && <td className="acn-nowrap">{codigoDe(it.centroId)}</td>}
                            <td className="acn-texto-longo"><strong className="acn-forte">{textoDoLancamento(it)}</strong>
                              {it.fornecedor && <div className="acn-fraco">{it.fornecedor}</div>}</td>
                            <td><Selo familia={situacaoDoItem(it).familia} ponto={false}>{situacaoDoItem(it).texto}</Selo></td>
                            {/* contrato parcelado: o valor mostrado é o que FALTA pagar (o combinado já medido são as linhas "Medição paga") */}
                            <td className="acn-nowrap">{reais(valorDoLancamento(it))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="acn-ajuda">
              A compra entra no mês em que foi criada. Realizado = pago + despesas avulsas e medições; comprometido = aprovado, comprado ou recebido e ainda não pago.
              Compras descartadas não contam. O pai soma a subárvore inteira. Compras sem centro vinculado ficam de fora daqui.
            </div>
          </>)}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          {/* o rodapé corre da direita para a esquerda: "Fechar" (o principal) fica na ponta, como nas outras janelas */}
          <Botao variante="primario" onClick={onClose}>Fechar</Botao>
          {onVerLancamentos && <Botao icone={mdiOpenInNew} onClick={() => onVerLancamentos(centro)}>Ver compras e despesas</Botao>}
          {calc && <Botao icone={mdiFileExcelOutline} onClick={exportar} title="Baixa uma planilha com o que o painel mostra (a lista toda onde a tela só mostra os maiores)">Exportar para Excel</Botao>}
        </div>
      </div>
    </div>
  );
}
