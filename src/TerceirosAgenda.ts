// Serviços de terceiros: as contas da AGENDA (fatia T3 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): semana e mês, por prestador ou por tipo, com o choque de data em vermelho.
// Tudo aqui é conta pura, sem tela e sem banco. A Agenda mostra VISITAS, e não carros: o serviço de cada carro continua sendo um registro, mas a mesma venda, tipo, situação, prestador e dia
// (e período, no agendado) é uma visita só, a mesma regra do cartão de grupo do Quadro e a do Calendário integrado no banco (`calendario_eventos_terceiros`), para a tela e o aviso não discordarem.
// Datas só de DIA (AAAA-MM-DD) saem de texto, nunca de `new Date(texto)` (a meia-noite de Londres é o dia anterior no Brasil).
import { cartoesDaColuna, dataDeReferencia, somarDiasISO, rotuloDoPeriodo } from './TerceirosFluxo';
import type { ServicoDeTerceiro } from './TerceirosFluxo';

export type PeriodoDaAgenda = 'semana' | 'mes';
export type AgrupamentoDaAgenda = 'prestador' | 'tipo';
export type SituacaoNaAgenda = 'agendado' | 'realizado' | 'solicitado';

export const DIAS_DA_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dois = (n: number) => String(n).padStart(2, '0');

/** 0 = segunda … 6 = domingo (a semana da fábrica começa na segunda). */
export function diaDaSemana(iso: string): number {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`).getDay();   // 0 = domingo
  return (d + 6) % 7;
}
export const segundaDaSemana = (iso: string): string => somarDiasISO(iso, -diaDaSemana(iso));
export const primeiroDiaDoMes = (iso: string): string => `${String(iso).slice(0, 8)}01`;
function mesSeguinte(iso: string): string {
  let a = Number(iso.slice(0, 4)); let m = Number(iso.slice(5, 7)) + 1;
  if (m > 12) { m = 1; a++; }
  return `${a}-${dois(m)}-01`;
}
export const ultimoDiaDoMes = (iso: string): string => somarDiasISO(mesSeguinte(primeiroDiaDoMes(iso)), -1);
const mesAnterior = (iso: string): string => primeiroDiaDoMes(somarDiasISO(primeiroDiaDoMes(iso), -1));

export type JanelaDaAgenda = { inicio: string; fim: string; dias: string[]; mes: string };

/** Os dias que a tela desenha: a semana (segunda a domingo) ou o mês inteiro, completado até a segunda de antes e o domingo de depois (a grade é sempre de semanas inteiras). */
export function janelaDaAgenda(ancora: string, periodo: PeriodoDaAgenda): JanelaDaAgenda {
  const primeiro = periodo === 'semana' ? segundaDaSemana(ancora) : segundaDaSemana(primeiroDiaDoMes(ancora));
  const ultimo = periodo === 'semana' ? somarDiasISO(primeiro, 6) : somarDiasISO(segundaDaSemana(ultimoDiaDoMes(ancora)), 6);
  const dias: string[] = [];
  for (let d = primeiro; d <= ultimo; d = somarDiasISO(d, 1)) dias.push(d);
  return { inicio: primeiro, fim: ultimo, dias, mes: String(ancora).slice(0, 7) };
}

/** Anterior (-1) ou próximo (+1): a semana anda 7 dias, o mês anda um mês (e a âncora vai para o dia 1 dele). */
export function andarNaAgenda(ancora: string, periodo: PeriodoDaAgenda, sentido: -1 | 1): string {
  if (periodo === 'semana') return somarDiasISO(ancora, 7 * sentido);
  return sentido < 0 ? mesAnterior(ancora) : mesSeguinte(ancora);
}

const dia_mes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export function rotuloDaJanela(ancora: string, periodo: PeriodoDaAgenda): string {
  const j = janelaDaAgenda(ancora, periodo);
  if (periodo === 'mes') return `${MESES[Number(j.mes.slice(5, 7)) - 1]} de ${j.mes.slice(0, 4)}`;
  const mesmoAno = j.inicio.slice(0, 4) === j.fim.slice(0, 4);
  return `${dia_mes(j.inicio)}${mesmoAno ? '' : '/' + j.inicio.slice(0, 4)} a ${dia_mes(j.fim)}/${j.fim.slice(0, 4)}`;
}
export const diaDeOutroMes = (dia: string, mes: string): boolean => dia.slice(0, 7) !== mes;

// ═══ AS VISITAS ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type VisitaDaAgenda = {
  chave: string; situacao: SituacaoNaAgenda; dia: string; periodo: string | null;
  servicos: ServicoDeTerceiro[]; base: ServicoDeTerceiro; tipoId: string; prestadorId: string | null;
  carros: number; choque: boolean; atrasada: boolean; ehHoje: boolean;
};

const ORDEM_DA_SITUACAO: Record<string, number> = { agendado: 0, solicitado: 1, realizado: 2 };
const ORDEM_DO_PERIODO: Record<string, number> = { manha: 0, dia_todo: 1, tarde: 2 };

/**
 * Uma visita por (venda, tipo, situação, prestador, dia [e período]); serviço sem venda é uma visita por serviço. Entram o AGENDADO (no dia marcado), o REALIZADO (no dia em que foi feito, esmaecido)
 * e o pedido que ainda está em "A definir" mas disse a data desejada (tracejado: ainda não é compromisso). Pedido sem nenhuma data só aparece no Quadro e na Lista; cancelado nunca entra.
 */
export function visitasDaAgenda(servicos: ServicoDeTerceiro[], hoje: string, choques?: Map<string, string[]>): VisitaDaAgenda[] {
  const saida: VisitaDaAgenda[] = [];
  for (const situacao of ['agendado', 'realizado', 'solicitado'] as SituacaoNaAgenda[]) {
    for (const c of cartoesDaColuna(servicos, situacao)) {
      const lista = c.tipo === 'grupo' ? c.servicos : [c.servico];
      const base = c.tipo === 'grupo' ? c.base : c.servico;
      const dia = dataDeReferencia(base);
      if (!dia) continue;
      saida.push({
        chave: `${situacao}§${c.chave}`, situacao, dia, periodo: situacao === 'agendado' ? base.periodo : null,
        servicos: lista, base, tipoId: base.tipo_id, prestadorId: base.prestador_id, carros: lista.length,
        choque: situacao === 'agendado' && lista.some(s => !!choques?.get(s.id)?.length),
        atrasada: situacao === 'agendado' && dia < hoje,
        ehHoje: situacao === 'agendado' && dia === hoje,
      });
    }
  }
  return saida;
}

export const visitasDaJanela = (visitas: VisitaDaAgenda[], j: JanelaDaAgenda): VisitaDaAgenda[] => visitas.filter(v => v.dia >= j.inicio && v.dia <= j.fim);

type Mapas = { tipos: Map<string, any>; prestadores: Map<string, any> };
export const nomeDoTipoDaVisita = (v: VisitaDaAgenda, m: Mapas): string => m.tipos.get(v.tipoId)?.nome || 'Tipo removido';
export const nomeDoPrestadorDaVisita = (v: VisitaDaAgenda, m: Mapas): string => (v.prestadorId ? (m.prestadores.get(v.prestadorId)?.nome || 'Prestador removido') : 'Sem prestador');

/** O que vem depois do período, em texto curto: "Manhã", "Dia todo", "Feito" ou "Desejado". */
export const textoDoPeriodoDaVisita = (v: VisitaDaAgenda): string => (v.situacao === 'agendado' ? rotuloDoPeriodo(v.periodo) : v.situacao === 'realizado' ? 'Feito' : 'Desejado');

/** A segunda linha do chip: o número e a OP de um carro só, ou quantos carros e a venda. */
export function detalheDaVisita(v: VisitaDaAgenda): string {
  if (v.carros > 1) return `${v.carros} carros${v.base.venda_base ? ` · venda ${v.base.venda_base}` : ''}`;
  return `${v.base.numero}${v.base.ligacao_rotulo ? ` · ${v.base.ligacao_rotulo}` : ''}`;
}

/** A ordem dentro do dia: o que é compromisso antes do que é só desejo ou já foi feito; dentro disso manhã, dia todo, tarde; por fim pelo nome, para a tela não pular de lugar. */
export function ordenarVisitas(lista: VisitaDaAgenda[], m: Mapas, agrupar: AgrupamentoDaAgenda): VisitaDaAgenda[] {
  const chave = (v: VisitaDaAgenda) => (agrupar === 'prestador' ? nomeDoPrestadorDaVisita(v, m) : nomeDoTipoDaVisita(v, m));
  return [...lista].sort((a, b) =>
    (ORDEM_DA_SITUACAO[a.situacao] - ORDEM_DA_SITUACAO[b.situacao])
    || ((ORDEM_DO_PERIODO[a.periodo || ''] ?? 9) - (ORDEM_DO_PERIODO[b.periodo || ''] ?? 9))
    || chave(a).localeCompare(chave(b), 'pt-BR')
    || a.base.numero.localeCompare(b.base.numero));
}

// ═══ AS LINHAS DA SEMANA (uma por prestador ou por tipo) ═══════════════════════════════════════════════════════════════════════════════════════════
export type LinhaDaAgenda = { chave: string; rotulo: string; sub: string; visitasPorDia: Map<string, VisitaDaAgenda[]>; total: number; carros: number; choque: boolean; semPrestador: boolean };

/** Só aparece a linha que tem visita no período (a tela não lista prestador parado). "Sem prestador" fica por último: são os pedidos que só têm data desejada. */
export function linhasDaAgenda(visitas: VisitaDaAgenda[], agrupar: AgrupamentoDaAgenda, m: Mapas): LinhaDaAgenda[] {
  const por = new Map<string, LinhaDaAgenda>();
  for (const v of visitas) {
    const chave = agrupar === 'prestador' ? (v.prestadorId || '__sem_prestador__') : v.tipoId;
    let l = por.get(chave);
    if (!l) {
      l = { chave, rotulo: agrupar === 'prestador' ? nomeDoPrestadorDaVisita(v, m) : nomeDoTipoDaVisita(v, m), sub: '', visitasPorDia: new Map(), total: 0, carros: 0, choque: false, semPrestador: agrupar === 'prestador' && !v.prestadorId };
      por.set(chave, l);
    }
    const doDia = l.visitasPorDia.get(v.dia);
    if (doDia) doDia.push(v); else l.visitasPorDia.set(v.dia, [v]);
    l.total++; l.carros += v.carros; if (v.choque) l.choque = true;
  }
  const linhas = [...por.values()];
  for (const l of linhas) {
    l.sub = `${l.total} ${l.total === 1 ? 'visita' : 'visitas'}${l.carros !== l.total ? ` · ${l.carros} carros` : ''}`;
    for (const [dia, lista] of l.visitasPorDia) l.visitasPorDia.set(dia, ordenarVisitas(lista, m, agrupar === 'prestador' ? 'tipo' : 'prestador'));
  }
  return linhas.sort((a, b) => (Number(a.semPrestador) - Number(b.semPrestador)) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** As visitas de cada dia (o mês): ordenadas pelo que a pessoa escolheu agrupar. */
export function visitasPorDia(visitas: VisitaDaAgenda[], agrupar: AgrupamentoDaAgenda, m: Mapas): Map<string, VisitaDaAgenda[]> {
  const por = new Map<string, VisitaDaAgenda[]>();
  for (const v of visitas) { const l = por.get(v.dia); if (l) l.push(v); else por.set(v.dia, [v]); }
  for (const [dia, lista] of por) por.set(dia, ordenarVisitas(lista, m, agrupar));
  return por;
}

// ═══ O RESUMO E O AVISO DE CHOQUE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type ResumoDaAgenda = { visitas: number; carros: number; agendadas: number; realizadas: number; desejadas: number; atrasadas: number; choques: number };
export function resumoDaAgenda(visitas: VisitaDaAgenda[]): ResumoDaAgenda {
  const r = { visitas: visitas.length, carros: 0, agendadas: 0, realizadas: 0, desejadas: 0, atrasadas: 0, choques: 0 };
  for (const v of visitas) {
    r.carros += v.carros;
    if (v.situacao === 'agendado') r.agendadas++; else if (v.situacao === 'realizado') r.realizadas++; else r.desejadas++;
    if (v.atrasada) r.atrasadas++;
    if (v.choque) r.choques++;
  }
  return r;
}

/** "Prestador · dd/mm" de cada dia em que o mesmo prestador tem visitas que batem (uma vez só por prestador e dia), para a faixa vermelha do alto. */
export function choquesDaJanela(visitas: VisitaDaAgenda[], m: Mapas): { chave: string; texto: string }[] {
  const vistos = new Map<string, { chave: string; texto: string; nome: string; dia: string }>();
  for (const v of visitas) {
    if (!v.choque) continue;
    const chave = `${v.prestadorId}|${v.dia}`;
    if (!vistos.has(chave)) { const nome = nomeDoPrestadorDaVisita(v, m); vistos.set(chave, { chave, texto: `${nome} · ${dia_mes(v.dia)}`, nome, dia: v.dia }); }
  }
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.dia.localeCompare(b.dia)).map(({ chave, texto }) => ({ chave, texto }));
}
