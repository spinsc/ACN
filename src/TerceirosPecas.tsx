// Serviços de terceiros: as peças pequenas que o Quadro, a Lista e as janelas repartem (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026): data por extenso, selos e o texto do dia de cada situação.
// Datas só de DIA (AAAA-MM-DD) saem de texto, nunca de `new Date(texto)` (a meia-noite de Londres é o dia anterior no Brasil); instantes (criado_em, historico[].em) usam o relógio da pessoa.
import React from 'react';
import { Selo } from './Interface';
import { rotuloDoPeriodo } from './TerceirosFluxo';

const PARTES_DA_DATA = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-11-25" → "25/11" ("—" se não for data). */
export const diaCurto = (iso: any): string => { const m = PARTES_DA_DATA.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}` : '—'; };
/** "2026-11-25" → "25/11/2026". */
export const diaCompleto = (iso: any): string => { const m = PARTES_DA_DATA.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
/** Um INSTANTE (timestamptz do banco) no relógio de quem olha: "22/11/2026 14:05". */
export const momentoBR = (iso: any): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/** O DIA (no relógio de quem olha) de um instante: "22/11". */
export const diaDoInstante = (iso: any): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/** O dia que importa em cada situação, em palavras: o pedido quer, está marcado, foi feito, foi cancelado. */
export function textoDoDia(s: any): string {
  if (s.status === 'agendado') return s.data_agendada ? `${diaCurto(s.data_agendada)} · ${rotuloDoPeriodo(s.periodo).toLowerCase()}` : 'Sem data';
  if (s.status === 'realizado') return s.data_realizada ? `Feito em ${diaCurto(s.data_realizada)}` : 'Realizado';
  if (s.status === 'cancelado') return s.cancelado_em ? `Cancelado em ${diaDoInstante(s.cancelado_em)}` : 'Cancelado';
  return s.data_desejada ? `Desejado para ${diaCurto(s.data_desejada)}` : 'Sem data desejada';
}

/** Os selos calculados do serviço (a cor é a família do design system: erro = vermelho, atenção = âmbar). */
export function SelosDoServico({ selos }: { selos: { id: string; rotulo: string; familia: any; title?: string }[] }) {
  if (!selos?.length) return null;
  return <>{selos.map(s => <Selo key={s.id} familia={s.familia} title={s.title}>{s.rotulo}</Selo>)}</>;
}

/** Junta os selos de vários serviços (o cartão de grupo): o mesmo selo uma vez só, com a contagem quando não é de todos. */
export function juntarSelos(listas: { id: string; rotulo: string; familia: any; title?: string }[][]): { id: string; rotulo: string; familia: any; title?: string }[] {
  const por = new Map<string, any>();
  for (const l of listas) {
    for (const s of l) {
      const g = por.get(s.id);
      if (g) g.n++; else por.set(s.id, { ...s, n: 1 });
    }
  }
  const total = listas.length;
  return [...por.values()].map(s => (total > 1 && s.n < total ? { ...s, rotulo: `${s.rotulo} (${s.n} de ${total})` } : s));
}
