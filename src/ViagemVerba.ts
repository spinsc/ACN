// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o Financeiro libera a verba (pedido do usuário em 04/11/2026)
//
// Antes, "verba total preenchida" já valia como liberada e ninguém ficava registrado. Agora o Financeiro CLICA em "Liberar verba": o sistema guarda quem, quando e quanto
// (`verba_liberada_em`, `verba_liberada_por`, `verba_liberada_valor`), e a equipe só sai com a verba liberada. A liberação vale enquanto a verba total for igual ao valor
// liberado: se o Financeiro muda o valor depois, ela deixa de valer sozinha e é preciso liberar de novo (sem coluna de "invalidada" e sem gatilho).
// Viagem já em Andamento ou Finalizada com verba lançada antes desta regra vale como liberada: nenhuma viagem existente foi regravada. Este arquivo não importa o ViagemFluxo (é o ViagemFluxo que importa este)
// para não haver volta de importação: aqui se trabalha com o texto do status gravado, sem `statusDaViagem`.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';

export type SituacaoDaVerba = 'sem_verba' | 'a_liberar' | 'mudou' | 'liberada';

const centavos = (n: any) => Math.round((Number(n) || 0) * 100);
const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function situacaoDaVerba(v: any): SituacaoDaVerba {
  if (!(Number(v?.verba_total) > 0)) return 'sem_verba';
  if (v?.verba_liberada_em) return centavos(v.verba_liberada_valor) === centavos(v.verba_total) ? 'liberada' : 'mudou';
  if (['andamento', 'finalizada'].includes(String(v?.status))) return 'liberada';   // lançada antes de a liberação existir
  return 'a_liberar';
}

/** O que a trava de saída diz que falta da parte do Financeiro; vazio = a verba está liberada. */
export function faltaDaVerba(v: any): string {
  const s = situacaoDaVerba(v);
  if (s === 'sem_verba') return 'a verba total (Financeiro)';
  if (s === 'a_liberar') return 'a liberação da verba (Financeiro)';
  if (s === 'mudou') return 'liberar a verba de novo, porque o valor mudou (Financeiro)';
  return '';
}

/** A frase de cada situação, para a janela da viagem e para a fila do Financeiro. */
export function textoDaVerba(v: any): string {
  const s = situacaoDaVerba(v);
  if (s === 'sem_verba') return 'Informar a verba total e liberar';
  if (s === 'a_liberar') return `Liberar a verba de ${fmt(v.verba_total)}`;
  if (s === 'mudou') return `A verba mudou (liberada: ${fmt(v.verba_liberada_valor)}, agora: ${fmt(v.verba_total)}): liberar de novo`;
  return v?.verba_liberada_em ? `Verba liberada por ${v.verba_liberada_por || '—'}` : 'Verba lançada antes de existir a liberação';
}

/**
 * Libera a verba da viagem GRAVADA no banco (`v` é a linha como ela está lá, não o formulário): só vale se a viagem ainda está na mesma coluna e com a mesma verba total (duas pessoas
 * não liberam duas vezes, e o valor liberado é o que o Financeiro viu). Deixa a linha no histórico da viagem e na auditoria.
 */
export async function liberarVerba(v: any, usuario: any): Promise<{ erro: string }> {
  const s = situacaoDaVerba(v);
  if (!['provisionamento', 'aprovada'].includes(String(v?.status))) return { erro: 'Não foi possível liberar a verba: só se libera a verba de uma viagem em Provisionamento.' };
  if (s === 'sem_verba') return { erro: 'Não foi possível liberar a verba: informe a verba total e salve a viagem antes.' };
  if (s === 'liberada') return { erro: 'Esta verba já está liberada.' };
  const agora = new Date().toISOString();
  const por = usuario?.nome || usuario?.email || null;
  const st = String(v.status) === 'aprovada' ? 'provisionamento' : String(v.status);
  const historico = [...(Array.isArray(v.historico) ? v.historico : []), { em: agora, por, de: st, para: st, nota: `Financeiro liberou a verba de ${fmt(v.verba_total)}.` }];
  const linha = { verba_liberada_em: agora, verba_liberada_por: por, verba_liberada_valor: Number(v.verba_total), historico, atualizado_em: agora, atualizado_por_nome: por };
  const { data, error } = await supabase.from('viagens').update(linha).eq('id', v.id).eq('status', v.status).eq('verba_total', v.verba_total).select('id').maybeSingle();
  if (error || !data) return { erro: 'Não foi possível liberar a verba: ' + (error?.message || 'a viagem mudou de coluna ou a verba mudou enquanto você olhava; feche e abra de novo.') };
  logChange({ module: 'viagens', entityType: 'viagens', entityId: v.id, changeType: 'UPDATE', field: 'verba_liberada', oldRow: { verba_liberada_em: v.verba_liberada_em || null }, newRow: { verba_liberada_em: agora, verba_liberada_valor: Number(v.verba_total) }, user: usuario });
  return { erro: '' };
}
