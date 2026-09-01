// ============================================
// ARQUIVO: src/utils/horasUteis.ts
// Cálculo de tempo decorrido em HORÁRIO COMERCIAL
// ============================================
//
// Horário comercial: Segunda a Sexta, 08:00–17:45 (9h45min/dia). Sábado,
// domingo e qualquer hora fora dessa faixa NÃO contam — a contagem "pausa"
// automaticamente fora do expediente, sem precisar de nenhum job/cron.
//
// Usado por qualquer KPI de "tempo decorrido"/"lead time" do sistema (OPs,
// OSs, demandas setoriais) para não inflar os números com noites/fins de
// semana em que a OP simplesmente ficou parada esperando o próximo turno.
//
// Não considera feriados (só dia da semana + horário).

const INICIO_HORA = 8;
const INICIO_MIN  = 0;
const FIM_HORA    = 17;
const FIM_MIN     = 45;

/**
 * Horas úteis decorridas entre `inicio` e `fim` (default: agora).
 * Retorna 0 se algum dos dois for nulo/inválido, ou se fim <= inicio.
 */
export function horasUteis(
  inicio: Date | string | null | undefined,
  fim: Date | string | null | undefined = new Date(),
): number {
  if (!inicio || !fim) return 0;
  const start = new Date(inicio);
  const end   = new Date(fim);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;

  let total = 0;
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  while (d < end) {
    const dow = d.getDay(); // 0=Dom, 6=Sáb
    if (dow !== 0 && dow !== 6) {
      const dI = new Date(d); dI.setHours(INICIO_HORA, INICIO_MIN, 0, 0);
      const dF = new Date(d); dF.setHours(FIM_HORA, FIM_MIN, 0, 0);
      const eI = new Date(Math.max(start.getTime(), dI.getTime()));
      const eF = new Date(Math.min(end.getTime(),   dF.getTime()));
      if (eF > eI) total += (eF.getTime() - eI.getTime()) / 3600000;
    }
    d.setDate(d.getDate() + 1);
  }
  return total;
}

/** Igual a horasUteis, mas em segundos (para contadores tipo cronômetro). */
export function segundosUteis(
  inicio: Date | string | null | undefined,
  fim: Date | string | null | undefined = new Date(),
): number {
  return Math.floor(horasUteis(inicio, fim) * 3600);
}

/** true se o instante `quando` (default: agora) cai dentro do expediente. */
export function dentroDoExpediente(quando: Date = new Date()): boolean {
  const dow = quando.getDay();
  if (dow === 0 || dow === 6) return false;
  const mins = quando.getHours() * 60 + quando.getMinutes();
  return mins >= INICIO_HORA * 60 + INICIO_MIN && mins < FIM_HORA * 60 + FIM_MIN;
}
