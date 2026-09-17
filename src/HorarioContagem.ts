// ─────────────────────────────────────────────────────────────────────────────
// HorarioContagem — quando o tempo das tarefas conta
//
// Horário normal: segunda a sexta, fora dos feriados, das 6:00 às 19:45 (até 2h
// antes e 2h depois do expediente de 8:00–17:45). Fora dele o tempo só conta
// dentro de uma hora extra aprovada. A tarefa que está rodando quando o horário
// permitido acaba é pausada sozinha; um trecho que começa fora do horário não
// conta. Só cálculo, sem tela e sem banco — as telas passam feriados e horas
// extras já carregados.
// ─────────────────────────────────────────────────────────────────────────────

export const INICIO_CONTAGEM = { h: 6, m: 0 };
export const FIM_CONTAGEM = { h: 19, m: 45 };
export const HORARIO_CONTAGEM_TEXTO = 'segunda a sexta, das 6:00 às 19:45, fora dos feriados';
export const MOTIVO_PAUSA_AUTOMATICA = 'Pausa automática: fim do horário de contagem';

/** [início, fim) em milissegundos */
export type Intervalo = [number, number];
const DIA_MS = 86400000;

export const diaChave = (d: Date | number | string) => new Date(d).toLocaleDateString('sv-SE');

export function unirIntervalos(intervalos: number[][]): Intervalo[] {
  const ordenados = intervalos.filter(([a, b]) => b > a).map(([a, b]) => [a, b] as Intervalo).sort((x, y) => x[0] - y[0]);
  const res: Intervalo[] = [];
  for (const [a, b] of ordenados) {
    const ultimo = res[res.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else res.push([a, b]);
  }
  return res;
}

export function intersecao(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const res: Intervalo[] = [];
  for (const [x1, y1] of a) for (const [x2, y2] of b) {
    const x = Math.max(x1, x2), y = Math.min(y1, y2);
    if (y > x) res.push([x, y]);
  }
  return unirIntervalos(res);
}

/** Partes de `a` que não estão em `b` */
export function subtrair(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const cortes = unirIntervalos(b);
  const res: Intervalo[] = [];
  for (const [x, y] of unirIntervalos(a)) {
    let cursor = x;
    for (const [c1, c2] of cortes) {
      if (c2 <= cursor || c1 >= y) continue;
      if (c1 > cursor) res.push([cursor, c1]);
      cursor = Math.max(cursor, c2);
    }
    if (y > cursor) res.push([cursor, y]);
  }
  return res;
}

export const somaMs = (intervalos: Intervalo[]) => intervalos.reduce((s, [a, b]) => s + (b - a), 0);

export function ehDiaNormal(dia: Date, feriados: Set<string>) {
  const semana = dia.getDay();
  return semana !== 0 && semana !== 6 && !feriados.has(diaChave(dia));
}

/** Janelas do horário normal que tocam [de, ate) */
export function janelasNormais(de: number, ate: number, feriados: Set<string>): Intervalo[] {
  const res: Intervalo[] = [];
  const dia = new Date(de); dia.setHours(0, 0, 0, 0);
  while (dia.getTime() < ate) {
    if (ehDiaNormal(dia, feriados)) {
      const a = new Date(dia); a.setHours(INICIO_CONTAGEM.h, INICIO_CONTAGEM.m, 0, 0);
      const b = new Date(dia); b.setHours(FIM_CONTAGEM.h, FIM_CONTAGEM.m, 0, 0);
      if (b.getTime() > de && a.getTime() < ate) res.push([a.getTime(), b.getTime()]);
    }
    dia.setDate(dia.getDate() + 1);
  }
  return res;
}

/** Horário em que o tempo pode contar: normal + horas extras aprovadas da pessoa */
export function janelasPermitidas(de: number, ate: number, feriados: Set<string>, extras: Intervalo[]): Intervalo[] {
  return unirIntervalos([...janelasNormais(de, ate, feriados), ...extras.filter(([a, b]) => b > de && a < ate)]);
}

/** Janela permitida que contém o instante (ou null se está fora do horário) */
export function janelaNoInstante(instante: number, feriados: Set<string>, extras: Intervalo[]): Intervalo | null {
  return janelasPermitidas(instante - DIA_MS, instante + DIA_MS, feriados, extras)
    .find(([a, b]) => a <= instante && instante < b) || null;
}

function fimDaTarefa(t: any, agora: number) {
  const ini = new Date(t.data_inicio).getTime();
  return t.status !== 'concluida' ? agora
    : t.data_conclusao ? new Date(t.data_conclusao).getTime()
    : ini + (Number(t.tempo_total_segundos) || 0) * 1000;
}

/** Trechos em que a tarefa ficou rodando e em que ficou pausada, pelo que foi registrado */
export function trechosDaTarefa(t: any, agora: number) {
  const vazio = { rodando: [] as Intervalo[], pausada: [] as Intervalo[] };
  if (!t?.data_inicio) return vazio;
  const ini = new Date(t.data_inicio).getTime();
  const fim = fimDaTarefa(t, agora);
  if (!(fim > ini)) return vazio;
  const pausada = unirIntervalos((t.pausas || []).filter((p: any) => p.pausado_em).map((p: any) => [
    Math.max(ini, new Date(p.pausado_em).getTime()),
    Math.min(fim, p.retomado_em ? new Date(p.retomado_em).getTime() : fim),
  ]));
  const rodando: Intervalo[] = [];
  let cursor = ini;
  for (const [a, b] of pausada) { if (a > cursor) rodando.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (fim > cursor) rodando.push([cursor, fim]);
  return { rodando, pausada };
}

/**
 * Aplica o horário: cada trecho só conta dentro da janela permitida em que começou e
 * para no fim dela (pausa automática). `cortes` é o tempo que ficou fora por isso.
 */
export function aplicarHorario(trechos: Intervalo[], feriados: Set<string>, extras: Intervalo[]) {
  const contados: Intervalo[] = [];
  const cortes: Intervalo[] = [];
  for (const [a, b] of trechos) {
    const janela = janelasPermitidas(a - DIA_MS, b + DIA_MS, feriados, extras).find(([s, e]) => s <= a && a < e);
    const fimContado = janela ? Math.min(b, janela[1]) : a;
    if (fimContado > a) contados.push([a, fimContado]);
    if (b > fimContado) cortes.push([fimContado, b]);
  }
  return { contados, cortes };
}

/** Separa o tempo contado em horário normal e hora extra */
export function separarNormalExtra(contados: Intervalo[], feriados: Set<string>) {
  if (!contados.length) return { normal: [] as Intervalo[], extra: [] as Intervalo[] };
  const de = Math.min(...contados.map(c => c[0]));
  const ate = Math.max(...contados.map(c => c[1]));
  const normal = intersecao(contados, janelasNormais(de, ate, feriados));
  return { normal, extra: subtrair(contados, normal) };
}

/** Segundos por dia (AAAA-MM-DD) de intervalos que não se sobrepõem */
export function segundosPorDia(intervalos: Intervalo[]) {
  const res: Record<string, number> = {};
  for (const [x, y] of intervalos) {
    const dia = new Date(x); dia.setHours(0, 0, 0, 0);
    while (dia.getTime() < y) {
      const proximo = new Date(dia); proximo.setDate(proximo.getDate() + 1);
      const s = Math.round((Math.min(y, proximo.getTime()) - Math.max(x, dia.getTime())) / 1000);
      if (s > 0) { const k = diaChave(dia); res[k] = (res[k] || 0) + s; }
      dia.setTime(proximo.getTime());
    }
  }
  return res;
}

/** Segundos contados de uma tarefa (cronômetro da lista e total gravado na conclusão) */
export function segundosContados(t: any, agora: number, feriados: Set<string>, extras: Intervalo[]) {
  const { contados } = aplicarHorario(trechosDaTarefa(t, agora).rodando, feriados, extras);
  return Math.round(somaMs(contados) / 1000);
}

/**
 * Tarefa em andamento cujo trecho atual já passou do horário permitido: devolve o
 * instante em que a pausa automática deve ficar registrada (ou null).
 */
export function pausaAutomaticaPendente(t: any, agora: number, feriados: Set<string>, extras: Intervalo[]): number | null {
  if (t?.status !== 'em_andamento' || !t.data_inicio) return null;
  const pausas = t.pausas || [];
  const ultima = pausas[pausas.length - 1];
  if (ultima && !ultima.retomado_em) return null; // registro inconsistente: não mexe
  const inicioTrecho = new Date(ultima?.retomado_em || t.data_inicio).getTime();
  if (!(agora > inicioTrecho)) return null;
  const { cortes } = aplicarHorario([[inicioTrecho, agora]], feriados, extras);
  return cortes.length ? cortes[0][0] : null;
}
