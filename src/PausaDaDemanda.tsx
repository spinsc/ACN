// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Faixa } from './Interface';
import { confirmar } from './Feedback';
import {
  dentroDoExpediente, podeAbrirTrechoAgora, situacaoDoRelogio, proximaPausaAutomatica, limiteDoTrecho, trechosDe,
  avisoForaDoExpediente, horaDe, fmtTempo, tempoDoItem, somarTempo, type ItemComRelogio,
} from './HorarioDemanda';

// Pausa e horas úteis da demanda avulsa (pedido do usuário em 16/10/2026). As contas estão em HorarioDemanda.ts; aqui ficam o relógio da tela, a pergunta de quem vai
// trabalhar fora do expediente e a faixa que diz em que pé a tarefa está. Peça nova, já no padrão do guia (Faixa, classes acn-dav-*), sem estilo solto.

/** Instante de agora, atualizado a cada meio minuto: a pausa das 17:48 aparece na tela sem ninguém recarregar. */
export function useAgora(intervaloMs = 30000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), intervaloMs);
    return () => window.clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

/**
 * Pergunta antes de iniciar ou retomar. Dentro do expediente é só a pergunta de sempre; fora dele a frase explica a hora extra. Depois das 22:00 não se começa
 * (regra do usuário: a hora extra para às 22:00): o aviso diz "não foi possível" para ficar na tela até ser fechado.
 */
export async function confirmarAbertura(pergunta: string, oQue: string, agora = new Date()): Promise<boolean> {
  if (!podeAbrirTrechoAgora(agora)) {
    alert(`Não foi possível ${oQue} agora (${horaDe(agora)}): depois das 22:00 o tempo não conta. Volte no próximo dia útil, a partir das 8:00.`);
    return false;
  }
  return confirmar(dentroDoExpediente(agora) ? pergunta : `${pergunta}\n\n${avisoForaDoExpediente(agora)}`);
}

/** Entrada do histórico da demanda para uma pausa ou retomada (aparece na lista "Histórico" como as outras). */
export function entradaDoRelogio(tipo: 'pausa' | 'retomada' | 'inicio', usuario: string, agora: Date, rotulo?: string) {
  const foraDoExpediente = tipo !== 'pausa' && !dentroDoExpediente(agora);
  const base = tipo === 'pausa' ? '⏸ Pausou' : tipo === 'retomada' ? '▶ Retomou' : '▶ Iniciou';
  return { tipo, usuario, data: agora.toISOString(), texto: `${base}${rotulo ? ' ' + rotulo : ' a execução'}${foraDoExpediente ? ' — hora extra' : ''}` };
}

/** Estado do relógio em palavras, para a faixa e para as etapas. */
export function descricaoDoRelogio(item: ItemComRelogio, agora: Date) {
  const sit = situacaoDoRelogio(item, agora);
  const ult = trechosDe(item).slice(-1)[0];
  if (sit === 'rodando') {
    const extra = ult && !ult.continuo && !dentroDoExpediente(new Date(ult.de)) && !dentroDoExpediente(agora);
    const fim = proximaPausaAutomatica(item, agora);
    return { sit, extra, fim, texto: extra ? `Em hora extra. Para sozinha às ${fim ? horaDe(fim) : '22:00'}.` : `Em execução. Pausa sozinha às ${fim ? horaDe(fim) : '17:48'}.` };
  }
  if (sit === 'pausada-auto') {
    const lim = ult && !ult.continuo ? limiteDoTrecho(new Date(ult.de)) : null;
    return { sit, extra: false, fim: lim, texto: `Pausada sozinha${lim ? ' às ' + horaDe(lim) : ' ao fim do expediente'}. O tempo não está contando: retome para continuar.` };
  }
  if (sit === 'pausada') return { sit, extra: false, fim: null, texto: 'Pausada. O tempo não está contando.' };
  return { sit, extra: false, fim: null, texto: '' };
}

/** Faixa no alto do detalhe da demanda simples: em execução, em hora extra ou pausada. Não aparece enquanto a tarefa não começou nem depois de concluída. */
export function FaixaDoRelogio({ item, agora }: { item: ItemComRelogio; agora: Date }) {
  const r = descricaoDoRelogio(item, agora);
  if (r.sit === 'parada') return null;
  const tom = r.sit === 'rodando' ? (r.extra ? 'marca' : 'info') : 'atencao';
  return <Faixa tom={tom}><span className="acn-dav-relogio">{r.sit === 'rodando' ? '▶' : '⏸'} {r.texto}</span></Faixa>;
}

/** Tempo trabalhado de uma demanda simples ou etapa (hora útil + hora extra), pronto para os blocos de informação. */
export function tempoEmTexto(item: ItemComRelogio, agora: Date) {
  const t = tempoDoItem(item, agora);
  return { uteis: fmtTempo(t.uteisMs), extras: t.extrasMs > 0 ? fmtTempo(t.extrasMs) : null, totalMs: t.uteisMs + t.extrasMs, extrasMs: t.extrasMs };
}

/** Tempo da demanda composta: a soma do tempo de todas as etapas. */
export function tempoDasEtapas(etapas: ItemComRelogio[], agora: Date) {
  const t = somarTempo((etapas || []).flatMap(e => trechosDe(e)), agora);
  return { uteis: fmtTempo(t.uteisMs), extras: t.extrasMs > 0 ? fmtTempo(t.extrasMs) : null, totalMs: t.uteisMs + t.extrasMs, extrasMs: t.extrasMs };
}
