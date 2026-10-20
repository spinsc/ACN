// Horas da demanda avulsa — pausa e hora útil (regra definida com o usuário em 16/10/2026).
//
// Expediente da demanda: segunda a sexta, das 08:00 às 17:48. (O resto do sistema, utils/horasUteis.ts, termina às 17:45; o usuário confirmou "17:48 mesmo" para a demanda,
// então esta tela tem janela própria e a diferença de 3 minutos é proposital.) Feriado não entra, como em horasUteis.
//
// O tempo de uma demanda (ou de cada etapa) é a soma de "trechos": cada início ou retomada abre um trecho; pausar ou concluir fecha. Nada é gravado às 17:48 — o fim do trecho é
// DERIVADO: um trecho aberto dentro do expediente para sozinho às 17:48 do mesmo dia (quem for trabalhar depois retoma à mão); um trecho aberto fora do expediente (noite, fim de
// semana) corre até as 22:00 do dia em que começou e conta como HORA EXTRA — só marcação do tempo, sem pedido ao gestor e fora do relatório de horas extras (decisão do usuário).
// Teto das 22:00 definido com o usuário em 16/10/2026 (ele recusou 23:59 e "sem teto": tarefa esquecida não soma madrugada). Depois das 22:00 não se inicia nem se retoma.
// Trecho aberto antes das 08:00 conta como extra até as 08:00 e como hora útil dali até as 17:48 (suposição a confirmar).
//
// Demanda ou etapa iniciada antes desta regra não tem trechos: conta como hora útil corrida (sem parada às 17:48) da data de início até a conclusão ou até agora — é o mais próximo
// do que ela mostrava; a primeira pausa grava os trechos a partir dali.

export const INICIO_EXPEDIENTE_MIN = 8 * 60;        // 08:00
export const FIM_EXPEDIENTE_MIN = 17 * 60 + 48;     // 17:48
export const FIM_EXTRA_MIN = 22 * 60;               // 22:00

export type Trecho = {
  de: string;                    // ISO: quando começou (início ou retomada)
  ate: string | null;            // ISO: quando parou (pausa ou conclusão); null = aberto
  por?: string;                  // quem iniciou ou retomou
  continuo?: boolean;            // trecho "de legado": hora útil corrida, sem a parada das 17:48
};

export type Tempo = { uteisMs: number; extrasMs: number };
export type ItemComRelogio = { trechos?: Trecho[] | null; data_inicio?: string | null; data_fim?: string | null };
export type Situacao = 'parada' | 'rodando' | 'pausada' | 'pausada-auto';

const diaUtil = (d: Date) => { const w = d.getDay(); return w >= 1 && w <= 5; };
const aMeiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const proximoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
const hhmm = (d: Date, min: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60, 0, 0);

/** Verdadeiro se o instante está dentro do expediente (segunda a sexta, 08:00 até antes das 17:48). */
export function dentroDoExpediente(d: Date): boolean {
  if (!diaUtil(d)) return false;
  return d >= hhmm(d, INICIO_EXPEDIENTE_MIN) && d < hhmm(d, FIM_EXPEDIENTE_MIN);
}

/** Depois das 22:00 não se inicia nem se retoma (a hora extra para às 22:00). */
export function podeAbrirTrechoAgora(d: Date): boolean { return d < hhmm(d, FIM_EXTRA_MIN); }

/** Até quando um trecho aberto em `de` corre sem ninguém mexer: 17:48 do mesmo dia (se começou antes disso num dia útil) ou 22:00 (hora extra). Aberto depois das 22:00 não corre. */
export function limiteDoTrecho(de: Date): Date {
  if (diaUtil(de) && de < hhmm(de, FIM_EXPEDIENTE_MIN)) return hhmm(de, FIM_EXPEDIENTE_MIN);
  const vinteEDuas = hhmm(de, FIM_EXTRA_MIN);
  return de < vinteEDuas ? vinteEDuas : de;
}

/** Separa [de, ate) em tempo de expediente e tempo fora dele. Passa dia a dia (o país não usa horário de verão). */
export function fatiar(de: Date, ate: Date): Tempo {
  let uteis = 0, extras = 0;
  if (ate <= de) return { uteisMs: 0, extrasMs: 0 };
  for (let dia = aMeiaNoite(de); dia < ate; dia = proximoDia(dia)) {
    const ini = de > dia ? de : dia;
    const fimDia = proximoDia(dia);
    const fim = ate < fimDia ? ate : fimDia;
    if (fim <= ini) continue;
    const total = fim.getTime() - ini.getTime();
    if (!diaUtil(dia)) { extras += total; continue; }
    const a = hhmm(dia, INICIO_EXPEDIENTE_MIN), b = hhmm(dia, FIM_EXPEDIENTE_MIN);
    const ui = ini > a ? ini : a, uf = fim < b ? fim : b;
    const u = uf > ui ? uf.getTime() - ui.getTime() : 0;
    uteis += u; extras += total - u;
  }
  return { uteisMs: uteis, extrasMs: extras };
}

/** Hora útil corrida (trecho de legado): só o que cai no expediente, sem contar como extra o que sobra. */
export function fatiarCorrido(de: Date, ate: Date): Tempo {
  return { uteisMs: fatiar(de, ate).uteisMs, extrasMs: 0 };
}

/** Fim efetivo de um trecho: o que a pessoa gravou (ou agora, se aberto), nunca depois do limite automático — salvo trecho de legado, que corre sem parada. */
export function fimEfetivo(t: Trecho, agora: Date): Date {
  const fim = t.ate ? new Date(t.ate) : agora;
  if (t.continuo) return fim;
  const lim = limiteDoTrecho(new Date(t.de));
  return fim < lim ? fim : lim;
}

export function tempoDoTrecho(t: Trecho, agora: Date): Tempo {
  const de = new Date(t.de); const fim = fimEfetivo(t, agora);
  return t.continuo ? fatiarCorrido(de, fim) : fatiar(de, fim);
}

export function somarTempo(trechos: Trecho[], agora: Date): Tempo {
  let uteisMs = 0, extrasMs = 0;
  for (const t of trechos) { const x = tempoDoTrecho(t, agora); uteisMs += x.uteisMs; extrasMs += x.extrasMs; }
  return { uteisMs, extrasMs };
}

/** Os trechos de uma demanda ou etapa; sem lista gravada (iniciada antes da regra) vira um trecho corrido da data de início até a conclusão. */
export function trechosDe(item: ItemComRelogio): Trecho[] {
  if (Array.isArray(item.trechos)) return item.trechos;
  if (!item.data_inicio) return [];
  return [{ de: item.data_inicio, ate: item.data_fim || null, continuo: true }];
}

export function tempoDoItem(item: ItemComRelogio, agora: Date): Tempo { return somarTempo(trechosDe(item), agora); }

/** Em que pé está o relógio: 'rodando' (trecho aberto dentro do prazo), 'pausada' (a pessoa pausou), 'pausada-auto' (passou das 17:48 ou das 22:00 sem ninguém mexer), 'parada' (não iniciou ou já concluiu). */
export function situacaoDoRelogio(item: ItemComRelogio, agora: Date): Situacao {
  if (!item.data_inicio || item.data_fim) return 'parada';
  const ts = trechosDe(item); const ult = ts[ts.length - 1];
  if (!ult) return 'pausada';
  if (ult.ate) return 'pausada';   // fechado (pausa, conclusão ou reabertura de demanda antiga): parado, mesmo sendo trecho corrido
  if (ult.continuo) return dentroDoExpediente(agora) ? 'rodando' : 'pausada-auto';
  return agora < limiteDoTrecho(new Date(ult.de)) ? 'rodando' : 'pausada-auto';
}

/** O instante em que a pausa automática vai acontecer (para mostrar "pausa às 17:48"), ou null se o relógio não está rodando. */
export function proximaPausaAutomatica(item: ItemComRelogio, agora: Date): Date | null {
  if (situacaoDoRelogio(item, agora) !== 'rodando') return null;
  const ult = trechosDe(item).slice(-1)[0];
  return ult.continuo ? hhmm(agora, FIM_EXPEDIENTE_MIN) : limiteDoTrecho(new Date(ult.de));
}

// ── Gravar: cada mudança de estado devolve a NOVA lista de trechos (quem chama grava) ──────────────────────────────────────────────────────

/** Começar ou retomar: fecha o que estiver aberto (no limite automático) e abre um trecho em `agora`. */
export function abrirTrecho(item: ItemComRelogio, agora: Date, por?: string): Trecho[] {
  const lista = trechosDe(item).map(t => ({ ...t }));
  const ult = lista[lista.length - 1];
  if (ult && !ult.ate) ult.ate = (ult.continuo ? agora : fimEfetivo(ult, agora)).toISOString();
  lista.push({ de: agora.toISOString(), ate: null, ...(por ? { por } : {}) });
  return lista;
}

/** Pausar ou concluir (ou fechar na data da conclusão, ao reabrir): fecha o trecho aberto em `instante`, nunca depois do limite automático. */
export function fecharTrecho(item: ItemComRelogio, instante: Date): Trecho[] {
  const lista = trechosDe(item).map(t => ({ ...t }));
  const ult = lista[lista.length - 1];
  if (ult && !ult.ate) ult.ate = (ult.continuo ? instante : fimEfetivo(ult, instante)).toISOString();
  return lista;
}

// ── Mostrar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const dois = (n: number) => String(n).padStart(2, '0');
export const horaDe = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;

/** "7h 48min", "35min", "0min" — tempo trabalhado, em horas úteis. */
export function fmtTempo(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${dois(m)}min` : `${h}h`;
}

/** Frase para a pessoa quando ela vai iniciar ou retomar fora do expediente. */
export function avisoForaDoExpediente(agora: Date): string {
  return `Agora são ${horaDe(agora)}, fora do expediente (segunda a sexta, 8:00 às 17:48). Se você trabalhar agora, o tempo conta como hora extra e fica marcado na demanda. A tarefa para sozinha às 22:00 e, depois disso, é preciso retomar de novo.`;
}
