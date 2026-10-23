// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o roteiro dia a dia (pedido do usuário em 23/10/2026: "o sistema cria o roteiro de viagem")
//
// Só regra, sem tela nem internet: recebe a viagem COMO ESTÁ (rota já calculada em "rota.pernas", paradas, horário de saída e horas de direção por dia em "custos") e devolve a
// sequência de dias com o que acontece em cada um: saída, chegadas, pernoites e dias de trabalho nas paradas.
//
// Regras (a confirmar com o usuário):
//   • Anda-se até o limite de horas de direção por dia; ao completar o limite o dia acaba, no meio do trecho ou na própria parada, e o dia seguinte recomeça no horário de saída.
//   • "Dias lá" de uma parada são dias INTEIROS de trabalho, a partir do dia seguinte ao da chegada; no fim do último, dorme-se lá e a saída é na manhã seguinte.
//   • O tempo é só o de direção que a rota informa: sem almoço, abastecimento nem descanso. Os dias de calendário são corridos (sábado e domingo contam).
//   • A quantidade de dias daqui é a que o orçamento usa (ViagemCalculo.ts): noites = dias − 1. Antes (22/10/2026) o orçamento somava "dias de estrada" e "dias lá" separados e
//     contava um dia a menos quando a viagem de ida e a de volta cabiam em meio dia cada (3 h + 1 dia lá + 3 h dava 2 dias; agora dá 3, como realmente é).
// ─────────────────────────────────────────────────────────────────────────────

import { nomeCurto } from './ViagemRota';

export type EventoDoRoteiro = { tipo: 'saida' | 'chegada' | 'trabalho' | 'pernoite' | 'retomada' | 'fim'; hora: string | null; texto: string };
export type DiaDoRoteiro = { n: number; data: string | null; eventos: EventoDoRoteiro[]; km: number; minutosDirecao: number };
export type Roteiro = {
  dias: DiaDoRoteiro[]; totalDias: number; noites: number;
  completo: boolean;   // falso quando a rota guardada não tem o desenho do roteiro da tela (paradas trocadas depois do cálculo): os dias de trabalho entram no fim, sem ordem
};

const LIMITE_DE_DIAS = 366;   // trava contra horas por dia absurdas (0,01 h = 366 dias de uma viagem comum)

const num = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const arred1 = (x: number) => Math.round(x * 10) / 10;

/** 485 → "08:05" (passando da meia-noite volta ao começo do dia). */
export function horaDoDia(minutos: number) {
  const m = ((Math.round(minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "08:30" → 510; texto que não é hora cai no padrão (8:00). */
export function minutosDaHora(t: any, padrao = 8 * 60) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return padrao;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : padrao;
}

/** "2026-10-23" + 2 → "2026-10-25" (sem passar por toISOString, que devolve o dia de Londres). */
function somarDias(data: string, n: number) {
  const d = new Date(data + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function montarRoteiro(v: any): Roteiro | null {
  const pernas: any[] = v?.rota?.pernas;
  if (!Array.isArray(pernas) || !pernas.length) return null;
  const c = v?.custos || {};
  const limite = Math.max(1, Math.round((num(c.horas_por_dia) > 0 ? num(c.horas_por_dia) : 8) * 60));
  const saida = minutosDaHora(c.hora_saida);
  const paradas: any[] = v?.paradas || [];
  const idaEVolta = !!v?.ida_e_volta;
  const casa = pernas.length === paradas.length + (idaEVolta ? 1 : 0);

  // o nome que aparece no roteiro é o curto ("Campinas, São Paulo"), não o endereço completo que o serviço de mapas devolve
  const de = (p: any) => nomeCurto(p.de), para = (p: any) => nomeCurto(p.para);

  const dias: DiaDoRoteiro[] = [];
  let truncado = false;
  const novoDia = () => { const d: DiaDoRoteiro = { n: dias.length + 1, data: v?.data_saida ? somarDias(String(v.data_saida), dias.length) : null, eventos: [], km: 0, minutosDirecao: 0 }; dias.push(d); return d; };
  let atual = novoDia();
  let usado = 0;   // minutos de direção já feitos hoje

  const virarODia = (pernoite: string, e1: EventoDoRoteiro | null) => {
    atual.eventos.push({ tipo: 'pernoite', hora: null, texto: pernoite });
    if (dias.length >= LIMITE_DE_DIAS) { truncado = true; return false; }
    atual = novoDia(); usado = 0;
    if (e1) atual.eventos.push(e1);
    return true;
  };

  atual.eventos.push({ tipo: 'saida', hora: horaDoDia(saida), texto: `Saída de ${de(pernas[0])}` });

  for (let i = 0; i < pernas.length && !truncado; i++) {
    const p = pernas[i];
    const total = Math.max(0, Math.round(num(p.horas) * 60));
    const km = Math.max(0, num(p.km));
    let falta = total, feito = 0;
    while (falta > 0 && !truncado) {
      if (usado >= limite) {
        const kmFeito = arred1(km * feito / total);
        const ok = virarODia(`Pernoite no trecho ${de(p)} → ${para(p)}, a ${kmFeito.toLocaleString('pt-BR')} km de ${de(p)}`,
          { tipo: 'retomada', hora: horaDoDia(saida), texto: `Retoma o trecho ${de(p)} → ${para(p)} (faltam ${arred1(km - kmFeito).toLocaleString('pt-BR')} km)` });
        if (!ok) break;
      }
      const t = Math.min(falta, limite - usado);
      usado += t; falta -= t; feito += t;
      atual.minutosDirecao += t; atual.km += km * t / total;
    }
    if (truncado) break;
    if (total === 0) atual.km += km;

    const ultima = i === pernas.length - 1;
    if (ultima) {
      atual.eventos.push({ tipo: 'fim', hora: horaDoDia(saida + usado), texto: idaEVolta ? `Chegada de volta em ${para(p)} — fim da viagem` : `Chegada em ${para(p)} — fim da viagem` });
      break;
    }
    atual.eventos.push({ tipo: 'chegada', hora: horaDoDia(saida + usado), texto: `Chegada em ${para(p)}` });

    const diasLa = casa ? Math.max(0, Math.floor(num(paradas[i]?.dias))) : 0;
    const saidaDali = { tipo: 'saida' as const, hora: horaDoDia(saida), texto: `Saída de ${para(p)}` };
    if (diasLa > 0) {
      for (let k = 1; k <= diasLa && !truncado; k++) {
        const trabalho: EventoDoRoteiro = { tipo: 'trabalho', hora: null, texto: `Dia inteiro de trabalho em ${para(p)}${diasLa > 1 ? ` (${k} de ${diasLa})` : ''}` };
        virarODia(`Pernoite em ${para(p)}`, trabalho);
      }
      if (!truncado) virarODia(`Pernoite em ${para(p)}`, saidaDali);
    } else if (usado >= limite) {
      virarODia(`Pernoite em ${para(p)}`, saidaDali);
    }
  }

  if (!casa) {
    // a rota guardada não bate com as paradas da tela: os dias de trabalho entram no fim, só para o orçamento não ficar sem eles
    const sobra = paradas.reduce((s, x) => s + Math.max(0, Math.floor(num(x?.dias))), 0);
    for (let k = 0; k < sobra && dias.length < LIMITE_DE_DIAS; k++) { atual = novoDia(); atual.eventos.push({ tipo: 'trabalho', hora: null, texto: 'Dia de trabalho nos destinos (recalcule a rota para ver em qual parada)' }); }
  }

  return { dias, totalDias: dias.length, noites: Math.max(0, dias.length - 1), completo: casa && !truncado };
}
