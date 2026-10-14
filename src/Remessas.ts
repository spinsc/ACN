// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// REMESSAS — envio parcial de uma OP de "Venda para Envio" (fatia 5 do PLANO_RH_DEPARTAMENTOS_ENVIOS.md, 14/10/2026)
//
// Pedido do usuário: "poder fazer envios parciais — enviar 2 de cada hoje, 1 amanhã…". Decisões de 14/10/2026: as remessas ficam DENTRO da mesma OP (não viram OPs-filha),
// quem registra é o Almoxarifado ao embalar, e a nota fiscal por remessa ou compartilhada vem numa segunda entrega (a comissão e o "faturado" seguem contando só com a OP inteira faturada).
//
// Unidade = a "quantidade" da OP (a mesma que a embalagem de sempre já exigia: ao menos um serial por unidade). Uma remessa leva N unidades; o saldo é
// quantidade − soma das remessas NÃO canceladas. Cancelar uma remessa não apaga nada: marca, e as unidades voltam ao saldo.
// Quem envia tudo de uma vez não gera remessa nenhuma: o caminho é o de antes.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { STATUS_COTACAO_FRETE } from './FluxoEntrega';

/** Quantas unidades a OP vendeu (a "quantidade"; no mínimo 1). */
export const unidadesDaOp = (opl: any): number => Math.max(1, Math.floor(Number(opl?.quantidade) || 1));

/** Unidades que já saíram em remessas (as canceladas não contam). */
export const unidadesEnviadas = (remessas: any[]): number =>
  (remessas || []).filter(r => !r.cancelada).reduce((s, r) => s + (Number(r.unidades) || 0), 0);

/** Quantas unidades ainda faltam sair. */
export const saldoDeUnidades = (opl: any, remessas: any[]): number => Math.max(0, unidadesDaOp(opl) - unidadesEnviadas(remessas));

/** O número da próxima remessa: o maior número já usado (inclusive de remessa cancelada) + 1 — um número nunca é reaproveitado. */
export const proximoNumeroDeRemessa = (remessas: any[]): number => (remessas || []).reduce((m, r) => Math.max(m, Number(r.numero) || 0), 0) + 1;

/** "Enviadas 2 de 5 unidades (1 remessa) — faltam 3". Vazio quando a OP não teve nenhuma remessa. */
export function resumoDeRemessas(opl: any, remessas: any[]): string {
  const ativas = (remessas || []).filter(r => !r.cancelada);
  if (!ativas.length) return '';
  const total = unidadesDaOp(opl), env = unidadesEnviadas(ativas), falta = Math.max(0, total - env);
  return `Enviadas ${env} de ${total} unidade${total === 1 ? '' : 's'} (${ativas.length} remessa${ativas.length === 1 ? '' : 's'})` + (falta > 0 ? ` — faltam ${falta}` : '');
}

/** Junta os seriais já gravados na OP com os de uma remessa SEM repetir serial: gravar de novo a mesma remessa (janela que ficou aberta, tentativa repetida) não duplica linha. */
export function mesclarSeriais(atuais: any[], novos: any[]): { produto: string; serial: string }[] {
  const lista = (atuais || []).map(x => ({ produto: String(x?.produto || ''), serial: String(x?.serial || '') }));
  const tem = new Set(lista.map(x => x.serial.trim().toLowerCase()).filter(Boolean));
  for (const n of novos || []) {
    const serial = String(n?.serial || '').trim(); if (!serial) continue;
    if (tem.has(serial.toLowerCase())) continue;
    tem.add(serial.toLowerCase()); lista.push({ produto: String(n?.produto || '').trim(), serial });
  }
  return lista;
}

/** Tira da lista da OP os seriais de uma remessa cancelada (as unidades voltam ao saldo e podem ser digitadas de novo na próxima). */
export function tirarSeriais(atuais: any[], retirar: any[]): { produto: string; serial: string }[] {
  const sai = new Set((retirar || []).map(x => String(x?.serial || '').trim().toLowerCase()).filter(Boolean));
  return (atuais || []).filter(x => !sai.has(String(x?.serial || '').trim().toLowerCase())).map(x => ({ produto: String(x?.produto || ''), serial: String(x?.serial || '') }));
}

/** O que a OP vira quando sai a ÚLTIMA remessa: espera a cotação de frete se a empresa paga (CIF) ou se ainda há frete de remessa anterior sem entregar;
 *  só quando é FOB e não há frete aberto vai direto para a liberação comercial (o que a embalagem de uma OP sem remessa sempre fez). */
export function statusDepoisDaUltimaRemessa({ freteComCliente, fretesAbertos, statusLiberacao }: { freteComCliente: boolean; fretesAbertos: number; statusLiberacao: string }): string {
  return (!freteComCliente || fretesAbertos > 0) ? STATUS_COTACAO_FRETE : statusLiberacao;
}

/** Quando o frete de uma remessa é entregue, a OP só segue (para a liberação comercial) se NENHUM outro frete dela estiver aberto. OP sem remessa: segue como sempre (o primeiro entregue basta). */
export function oFreteLiberaAOp({ temRemessas, outrosFretesAbertos }: { temRemessas: boolean; outrosFretesAbertos: number }): boolean {
  return !temRemessas || outrosFretesAbertos === 0;
}

export const descricaoDaRemessa = (opl: any, numero: number, unidades: number): string =>
  `remessa ${numero} (${unidades} de ${unidadesDaOp(opl)} un.)`;

/** Lê as remessas da OP (todas, inclusive canceladas — o número da próxima depende delas). Se a leitura falhar, devolve o motivo: quem chama não pode fingir que "não há remessa". */
export async function lerRemessas(oplId: string): Promise<{ remessas: any[]; erro: string | null }> {
  const { data, error } = await supabase.from('op_remessas').select('*').eq('opl_id', oplId).order('numero');
  return { remessas: data || [], erro: error ? error.message : (data ? null : 'sem resposta') };
}

/** Remessas ativas de várias OPs de uma vez (a fila do Almoxarifado mostra "enviadas 2 de 5" em cada linha). */
export async function lerRemessasAtivasDe(oplIds: string[]): Promise<{ porOp: Map<string, any[]>; erro: string | null }> {
  const porOp = new Map<string, any[]>();
  if (!oplIds.length) return { porOp, erro: null };
  const { data, error } = await supabase.from('op_remessas').select('*').in('opl_id', oplIds).eq('cancelada', false).order('numero');
  if (error || !data) return { porOp, erro: error ? error.message : 'sem resposta' };
  for (const r of data) porOp.set(String(r.opl_id), [...(porOp.get(String(r.opl_id)) || []), r]);
  return { porOp, erro: null };
}

/** Quantos fretes da OP ainda não foram entregues nem cancelados (o frete que acabou de ser entregue pode ser ignorado). */
export async function contarFretesAbertosDaOp(oplId: string, ignorarFreteId?: string | null): Promise<{ abertos: number; erro: string | null }> {
  const { data, error } = await supabase.from('pcp_fretes').select('id,status').eq('vinculo_id', oplId).in('vinculo_tipo', ['op_os', 'opl']);
  if (error || !data) return { abertos: 0, erro: error ? error.message : 'sem resposta' };
  return { abertos: data.filter((f: any) => f.id !== ignorarFreteId && f.status !== 'Entregue' && f.status !== 'Cancelado').length, erro: null };
}

/** A OP tem alguma remessa ativa? (a Logística só muda o jeito de liberar a OP quando tem). */
export async function opTemRemessas(oplId: string): Promise<boolean> {
  const { count } = await supabase.from('op_remessas').select('id', { count: 'exact', head: true }).eq('opl_id', oplId).eq('cancelada', false);
  return (count || 0) > 0;
}
