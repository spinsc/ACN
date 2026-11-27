// ─────────────────────────────────────────────────────────────────────────────
// PONTO NA TELA DE HORAS EXTRAS (P3, 25/11/2026; PLANO_PONTO_SECULLUM.md): quem aprova uma hora extra das tarefas vê, ao lado do pedido, o que o ponto da Secullum registrou
// no dia dela (as batidas, as extras do dia e a jornada). É SÓ INFORMAÇÃO: o sistema nunca aprova, recusa nem ajusta a hora extra por causa do ponto.
//
// Regras puras (sem tela e sem banco), por isso se testam em Node:
//  1. a ficha do RH do pedido — pela ligação com o usuário (`usuario_id`) e, na falta dela, pelo nome inteiro, só se achar UMA;
//  2. o resumo do dia (batidas, extras, normais, jornada) a partir da linha de `ponto_dias`;
//  3. a comparação com o pedido, em frase e em tom — um aviso âmbar só quando o ponto do dia contradiz o pedido (sem batida, ou sem hora extra no dia que já passou).
// Dia futuro não tem ponto; o dia de hoje só tem o que já foi batido (a Secullum o conta como falta antes de acabar).
// ─────────────────────────────────────────────────────────────────────────────
import { paresDoDia, extrasDoMes, paraMinutos, paraTexto, situacaoDoDia } from './PontoSecullum';

const semAcento = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A ficha do RH da pessoa do pedido: a ligada ao mesmo usuário e, se não houver, a de nome igual (sem acento), desde que seja uma só. `fichas` = `rh_funcionarios_basico`. */
export function fichaDoPedido(pedido: any, fichas: any[]): any | null {
  const lista = (fichas || []).filter(f => f && f.ativo !== false);
  if (pedido?.usuario_id) {
    const c = lista.filter(f => f.usuario_id && String(f.usuario_id) === String(pedido.usuario_id));
    if (c.length === 1) return c[0];
  }
  const nome = semAcento(pedido?.pessoa_nome);
  if (!nome) return null;
  const c = lista.filter(f => semAcento(f.nome) === nome);
  return c.length === 1 ? c[0] : null;
}

/** O dia do pedido (AAAA-MM-DD, no relógio de quem usa) a partir do início dele. */
export const diaDoPedido = (inicio: any): string => new Date(inicio).toLocaleDateString('sv-SE');

export type ResumoDoPontoDoDia = { batidas: string; extras: number; normais: number; jornada: number; rotuloDoDia: string };
/** O que o ponto diz do dia: as batidas como "07:58 – 12:01 · 13:00 – …", as extras, as horas normais e a jornada prevista. */
export function resumoDoPontoDoDia(valores: any, dia: string, hoje: string): ResumoDoPontoDoDia {
  const v = valores || {};
  const batidas = paresDoDia(v).map(p => `${p.entrada || '—'} – ${p.saida || '…'}`).join(' · ');
  return { batidas, extras: extrasDoMes(v).total, normais: paraMinutos(v['Normais']), jornada: paraMinutos(v['Carga']), rotuloDoDia: situacaoDoDia(v, dia, hoje).rotulo };
}

export type ComparacaoComOPedido = { tom: 'neutro' | 'atencao'; frase: string };
/**
 * Compara o ponto do dia com o pedido de hora extra. `valores` = a linha de `ponto_dias` do dia (ou null se não há leitura); `minutosDoPedido` = a duração pedida.
 *  - dia futuro: ainda não há ponto;
 *  - sem leitura do ponto do dia: diz isso, sem afirmar que a pessoa faltou;
 *  - hoje: só as batidas até agora (o dia não acabou);
 *  - dia que passou: se não houve nenhuma batida, ou se a Secullum não calculou hora extra, o tom é âmbar ("confira"); se calculou, vai em tom neutro com o valor.
 */
export function compararComOPedido(valores: any, dia: string, hoje: string, minutosDoPedido: number): ComparacaoComOPedido {
  if (dia > hoje) return { tom: 'neutro', frase: 'Dia que ainda não chegou: o ponto só existe depois.' };
  if (!valores) return { tom: 'neutro', frase: 'O ponto deste dia ainda não foi lido da Secullum.' };
  const r = resumoDoPontoDoDia(valores, dia, hoje);
  if (dia === hoje) return { tom: 'neutro', frase: r.batidas ? `Hoje, até agora: ${r.batidas}. O dia ainda não acabou.` : 'Hoje ainda não há batida lida.' };
  if (!r.batidas) return { tom: 'atencao', frase: `Sem nenhuma batida neste dia (${r.rotuloDoDia.toLowerCase()}). Confira antes de aprovar.` };
  if (r.extras <= 0) return { tom: 'atencao', frase: `Batidas ${r.batidas}, mas a Secullum não calculou hora extra neste dia. Confira antes de aprovar.` };
  const pedido = Math.max(0, Math.round(minutosDoPedido || 0));
  const diferenca = pedido ? ` O pedido é de ${paraTexto(pedido)}.` : '';
  return { tom: 'neutro', frase: `Batidas ${r.batidas}. A Secullum calculou ${paraTexto(r.extras)} de hora extra neste dia.${diferenca}` };
}
