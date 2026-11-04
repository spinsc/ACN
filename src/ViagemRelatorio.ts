// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — relatório de custo real × orçado (pedido do usuário em 04/11/2026, melhorias depois da fatia 3)
//
// Só conta, sem tela nem banco. Junta o que o Financeiro lançou como custo real em cada viagem e compara com o orçado (a mesma comparação da janela da viagem:
// combustível, pedágios, hospedagem, alimentação e outros; o desgaste do veículo é custo calculado e fica de fora). Agrupa por mês de saída e por veículo, e separa
// as viagens que passaram do orçado. As viagens finalizadas SEM custo lançado aparecem à parte: é prestação de contas que falta.
// O período filtra pela data de saída (viagem sem data usa o dia em que entrou na etapa atual).
// ─────────────────────────────────────────────────────────────────────────────
import { calcularViagem } from './ViagemCalculo';
import { compararComOOrcado } from './ViagemFechamento';
import { statusDaViagem } from './ViagemFluxo';

export type PeriodoDoRelatorio = 'ano' | '90' | 'tudo';

export type LinhaDoRelatorio = { id: string; titulo: string; dia: string; mes: string; veiculo: string; orcado: number; real: number; diferenca: number; pct: number | null; kmRodado: number | null };
export type GrupoDoRelatorio = { chave: string; viagens: number; orcado: number; real: number; kmRodado: number };

const diaDaViagem = (v: any) => String(v?.data_saida || v?.status_desde || v?.criado_em || '').slice(0, 10);
const soma = (l: number[]) => l.reduce((s, x) => s + x, 0);
const arred = (n: number) => Math.round(n * 100) / 100;

/** A viagem entra no período? Nulo/inválido entra só em "tudo". */
export function entraNoPeriodo(v: any, periodo: PeriodoDoRelatorio, hoje: string): boolean {
  if (periodo === 'tudo') return true;
  const d = diaDaViagem(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (periodo === 'ano') return d.slice(0, 4) === hoje.slice(0, 4);
  const limite = new Date(hoje + 'T12:00:00'); limite.setDate(limite.getDate() - 90);
  const iso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
  return d >= iso;
}

const lancou = (c: any) => !!c && ['combustivel', 'pedagios', 'hospedagem', 'alimentacao', 'outros'].some(k => c[k] !== null && c[k] !== undefined && c[k] !== '');

function agrupar(linhas: LinhaDoRelatorio[], chaveDe: (l: LinhaDoRelatorio) => string): GrupoDoRelatorio[] {
  const m = new Map<string, GrupoDoRelatorio>();
  for (const l of linhas) {
    const k = chaveDe(l);
    const g = m.get(k) || { chave: k, viagens: 0, orcado: 0, real: 0, kmRodado: 0 };
    g.viagens += 1; g.orcado += l.orcado; g.real += l.real; g.kmRodado += l.kmRodado || 0;
    m.set(k, g);
  }
  return [...m.values()].map(g => ({ ...g, orcado: arred(g.orcado), real: arred(g.real) }));
}

export function resumoDosCustos(viagens: any[], periodo: PeriodoDoRelatorio, hoje: string) {
  const doPeriodo = (viagens || []).filter(v => entraNoPeriodo(v, periodo, hoje));
  const linhas: LinhaDoRelatorio[] = [];
  const semCusto: any[] = [];
  for (const v of doPeriodo) {
    if (lancou(v.custo_real)) {
      const c = compararComOOrcado(v, calcularViagem(v));
      const d = diaDaViagem(v);
      linhas.push({
        id: v.id, titulo: v.titulo || 'sem título', dia: d, mes: /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : 'sem data', veiculo: v.veiculo_nome || 'sem veículo',
        orcado: arred(c.totalOrcado), real: arred(c.totalReal), diferenca: arred(c.totalReal - c.totalOrcado), pct: c.totalOrcado > 0 ? (c.totalReal - c.totalOrcado) / c.totalOrcado : null, kmRodado: c.kmRodado,
      });
    } else if (statusDaViagem(v) === 'finalizada') semCusto.push(v);
  }
  const porMes = agrupar(linhas, l => l.mes).sort((a, b) => a.chave.localeCompare(b.chave));
  const porVeiculo = agrupar(linhas, l => l.veiculo).sort((a, b) => b.real - a.real);
  const estouraram = linhas.filter(l => l.diferenca > 0.004).sort((a, b) => b.diferenca - a.diferenca);
  const orcado = arred(soma(linhas.map(l => l.orcado)));
  const real = arred(soma(linhas.map(l => l.real)));
  return { linhas, porMes, porVeiculo, estouraram, semCusto, totais: { viagens: linhas.length, orcado, real, diferenca: arred(real - orcado), kmRodado: soma(linhas.map(l => l.kmRodado || 0)) } };
}

/** "2026-11" → "nov/2026" */
export function rotuloDoMes(chave: string): string {
  if (!/^\d{4}-\d{2}$/.test(chave)) return chave;
  const d = new Date(chave + '-01T12:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('. de ', '/').replace(' de ', '/').replace('.', '');
}
