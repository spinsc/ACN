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

/** O que a OP vira quando sai a ÚLTIMA remessa: espera o frete se a empresa paga (CIF) ou se ainda há frete de remessa anterior que não saiu (cotação ou aprovação);
 *  só quando é FOB e nenhum frete está esperando para sair vai direto para a liberação comercial (o que a embalagem de uma OP sem remessa sempre fez).
 *  `fretesAbertos` = fretes que ainda não saíram (`contarFretesQueNaoSairam`); frete em trânsito não segura mais a OP (29/10/2026). */
export function statusDepoisDaUltimaRemessa({ freteComCliente, fretesAbertos, statusLiberacao }: { freteComCliente: boolean; fretesAbertos: number; statusLiberacao: string }): string {
  return (!freteComCliente || fretesAbertos > 0) ? STATUS_COTACAO_FRETE : statusLiberacao;
}

/** Quando o frete de uma remessa sai, a OP só segue (para a liberação comercial) se NENHUM outro frete dela estiver sem sair. OP sem remessa: segue como sempre (o primeiro que sai basta). */
export function oFreteLiberaAOp({ temRemessas, outrosFretesAbertos }: { temRemessas: boolean; outrosFretesAbertos: number }): boolean {
  return !temRemessas || outrosFretesAbertos === 0;
}

export const descricaoDaRemessa = (opl: any, numero: number, unidades: number): string =>
  `remessa ${numero} (${unidades} de ${unidadesDaOp(opl)} un.)`;

// ── Envio parcial com kit incompleto (E1, pedido do usuário em 29/10/2026, OP A1562.2610) ─────────────────────────────────────────────────────────────────────
// A remessa guarda o dia REAL do envio (pode ser passado, para registrar o que já saiu antes; futuro não), o rastreio e os itens que ficaram faltando em CADA kit
// (decidido com o usuário: a falta é dita POR KIT; o total da remessa é "por kit" × "kits da remessa"). A lista de onde escolher vem da BOM liberada pelo PCP.

/** Uma linha de "item faltando" da remessa. `por_kit` = quanto falta em cada kit; `unidades` = por_kit × kits da remessa. */
export type ItemFaltando = { item_id: string | null; nome: string; codigo: string | null; por_kit: number; unidades: number };

/** O que a pessoa pode escolher como "faltando": os itens da BOM da OP (um por nome; a BOM guarda a quantidade da OP inteira, aqui só importa o nome e o código). */
export function itensEscolhiveisDaBom(opl: any): { chave: string; item_id: string | null; nome: string; codigo: string | null }[] {
  const vistos = new Set<string>(); const lista: any[] = [];
  for (const b of Array.isArray(opl?.bom_itens) ? opl.bom_itens : []) {
    const nome = String(b?.nome || '').trim(); if (!nome) continue;
    const chave = String(b?.item_id || '') || nome.toLowerCase();
    if (vistos.has(chave)) continue; vistos.add(chave);
    lista.push({ chave, item_id: b?.item_id ? String(b.item_id) : null, nome, codigo: b?.codigo ? String(b.codigo) : null });
  }
  return lista;
}

/** Quantidade "por kit" digitada: inteiro maior que zero. Vazio ou zero = não falta; texto ou fração = inválido (devolve NaN para a tela recusar). */
export function porKitDigitado(v: any): number {
  const t = String(v ?? '').trim().replace(',', '.'); if (t === '') return 0;
  const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** Transforma as linhas da janela em itens faltando da remessa (só as com quantidade maior que zero). `kits` = unidades da remessa. */
export function montarFaltando(linhas: any[], kits: number): ItemFaltando[] {
  return (linhas || []).map(l => ({ l, por: porKitDigitado(l?.por_kit) })).filter(x => x.por > 0).map(({ l, por }) => ({
    item_id: l.item_id ? String(l.item_id) : null, nome: String(l.nome || '').trim(), codigo: l.codigo ? String(l.codigo) : null, por_kit: por, unidades: por * Math.max(0, Math.floor(Number(kits) || 0)),
  }));
}

/** O que a janela precisa recusar nas linhas de "faltando": item sem nome, quantidade inválida, o mesmo item duas vezes. Vazio = pode gravar. */
export function erroDoFaltando(linhas: any[]): string {
  const nomes = new Set<string>();
  for (const l of linhas || []) {
    const nome = String(l?.nome || '').trim();
    if (!nome) return 'Escreva o nome do item que está faltando.';
    const por = porKitDigitado(l?.por_kit);
    if (Number.isNaN(por)) return `Quantidade que falta em cada kit de "${nome}": informe um número inteiro (0 = não falta).`;
    const chave = String(l?.item_id || '') || nome.toLowerCase();
    if (nomes.has(chave)) return `"${nome}" aparece duas vezes na lista de itens faltando.`;
    nomes.add(chave);
  }
  return '';
}

/** Os itens faltando de uma remessa, sempre como lista (a coluna é jsonb; remessa antiga não tem). */
export const faltandoDaRemessa = (r: any): ItemFaltando[] => (Array.isArray(r?.faltando) ? r.faltando : []);

/** "2 × Cabo USB (1 por kit), 1 × Manual" — o texto de "faltam: …". Vazio quando nada falta. */
export function textoDoQueFalta(itens: ItemFaltando[]): string {
  return (itens || []).map(i => `${i.unidades} × ${i.nome}${i.por_kit && i.unidades !== i.por_kit ? ` (${i.por_kit} por kit)` : ''}`).join(', ');
}

/** Data de envio digitada: vazia = hoje; futura, inexistente ou antes de 2020 = erro (devolve o motivo). `hoje` é o dia de Brasília (hojeISO). */
export function erroDaDataDeEnvio(iso: string, hoje: string): string {
  const v = String(iso || '').trim(); if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Data de envio inválida.';
  const d = new Date(v + 'T12:00:00'); if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'Essa data não existe no calendário.';
  if (v < '2020-01-01') return 'Data de envio muito antiga: confira o ano.';
  if (v > hoje) return 'A data de envio não pode ser futura: use o dia em que a remessa saiu de fato.';
  return '';
}

/** O dia da remessa: o informado ao embalar; remessa anterior à coluna usa o dia em que foi criada. */
export const dataDaRemessa = (r: any): string => String(r?.data_envio || r?.criado_em || '').slice(0, 10);

// ── Complemento (E2) e OP que só sai da fila com tudo completo (E3) — envio parcial com kit incompleto, 03/11/2026 ──────────────────────────────────────────────
// O pendente de uma remessa = o que ficou faltando nela (`faltando`) menos o que os complementos NÃO cancelados já levaram. Nada é apagado: complemento errado é cancelado e o pendente volta.

export type PendenteDaRemessa = ItemFaltando & { remessa_id: string; remessa_numero: number };

/** A chave que identifica um item entre a remessa e o complemento: o código do cadastro, ou o nome sem caixa quando o item foi digitado à mão. */
export const chaveDoItemFaltando = (i: any): string => (i?.item_id ? String(i.item_id) : String(i?.nome || '').trim().toLowerCase());

/** O que ainda falta enviar de UMA remessa (só os itens com saldo maior que zero). */
export function pendenteDaRemessa(remessa: any, complementos: any[]): PendenteDaRemessa[] {
  if (!remessa || remessa.cancelada) return [];
  const enviado = new Map<string, number>();
  for (const c of complementos || []) {
    if (c.cancelado || String(c.remessa_id) !== String(remessa.id)) continue;
    for (const i of Array.isArray(c.itens) ? c.itens : []) enviado.set(chaveDoItemFaltando(i), (enviado.get(chaveDoItemFaltando(i)) || 0) + (Number(i.unidades) || 0));
  }
  return faltandoDaRemessa(remessa)
    .map(i => ({ ...i, unidades: Math.max(0, (Number(i.unidades) || 0) - (enviado.get(chaveDoItemFaltando(i)) || 0)), remessa_id: String(remessa.id), remessa_numero: Number(remessa.numero) || 0 }))
    .filter(i => i.unidades > 0);
}

/** O que ainda falta enviar da OP inteira (todas as remessas ativas). Vazio = a OP está completa. */
export const pendenteDaOp = (remessas: any[], complementos: any[]): PendenteDaRemessa[] =>
  (remessas || []).filter(r => !r.cancelada).flatMap(r => pendenteDaRemessa(r, complementos));

/** "Remessa 1: 25 × Cabo USB; Remessa 2: 23 × Manual" — para o selo "Falta enviar: …" e para os recados. */
export function textoDoPendente(pend: PendenteDaRemessa[]): string {
  const porRemessa = new Map<number, PendenteDaRemessa[]>();
  for (const p of pend || []) porRemessa.set(p.remessa_numero, [...(porRemessa.get(p.remessa_numero) || []), p]);
  return [...porRemessa.entries()].map(([n, itens]) => `remessa ${n}: ${itens.map(i => `${i.unidades} × ${i.nome}`).join(', ')}`).join('; ');
}

/** Há quantos dias o pendente existe: do dia da remessa mais antiga que ainda tem item por enviar até hoje (`hoje` = hojeISO()). */
export function diasComPendencia(remessas: any[], pend: PendenteDaRemessa[], hoje: string): number {
  const nums = new Set((pend || []).map(p => p.remessa_id));
  const dias = (remessas || []).filter(r => nums.has(String(r.id))).map(r => dataDaRemessa(r)).filter(Boolean).sort();
  if (!dias.length) return 0;
  const a = new Date(dias[0] + 'T12:00:00').getTime(), b = new Date(hoje + 'T12:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Prazo em dias a partir do qual o pendente vira alerta vermelho na fila (decisão do plano: "passar de N dias"; N = 7, confirmado pelo usuário em 03/11/2026). */
export const PRAZO_PENDENCIA_ENVIO_DIAS = 7;

/** O que a janela de complemento precisa recusar: nada marcado, quantidade inválida ou acima do pendente. `linhas` = [{ chave, nome, enviar }]; `pendentes` = o pendente da remessa escolhida. Vazio = pode gravar. */
export function erroDoComplemento(linhas: any[], pendentes: PendenteDaRemessa[]): string {
  const falta = new Map((pendentes || []).map(p => [chaveDoItemFaltando(p), p.unidades]));
  let algum = false;
  for (const l of linhas || []) {
    const t = String(l?.enviar ?? '').trim().replace(',', '.'); if (t === '') continue;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) return `Quantidade de "${l.nome}": informe um número inteiro (0 = não vai neste complemento).`;
    if (n > (falta.get(chaveDoItemFaltando(l)) || 0)) return `"${l.nome}": faltam só ${falta.get(chaveDoItemFaltando(l)) || 0} unidade(s) nesta remessa; você informou ${n}.`;
    if (n > 0) algum = true;
  }
  return algum ? '' : 'Informe a quantidade de pelo menos um item que está saindo neste complemento.';
}

/** Os itens que saem num complemento, no formato gravado. */
export const itensDoComplemento = (linhas: any[]): { item_id: string | null; nome: string; codigo: string | null; unidades: number }[] =>
  (linhas || []).map(l => ({ l, n: Number(String(l?.enviar ?? '').trim().replace(',', '.')) })).filter(x => Number.isInteger(x.n) && x.n > 0)
    .map(({ l, n }) => ({ item_id: l.item_id ? String(l.item_id) : null, nome: String(l.nome || ''), codigo: l.codigo ? String(l.codigo) : null, unidades: n }));

/** Lê os complementos NÃO cancelados de uma OP. Leitura recusada devolve o motivo: ninguém pode tratar "não li" como "não há complemento". */
export async function lerComplementos(oplId: string): Promise<{ complementos: any[]; erro: string | null }> {
  const { data, error } = await supabase.from('op_remessa_complementos').select('*').eq('opl_id', oplId).order('criado_em');
  return { complementos: data || [], erro: error ? error.message : (data ? null : 'sem resposta') };
}

/** Complementos ativos de várias OPs de uma vez (a fila mostra "Falta enviar: …"). */
export async function lerComplementosAtivosDe(oplIds: string[]): Promise<{ porOp: Map<string, any[]>; erro: string | null }> {
  const porOp = new Map<string, any[]>();
  if (!oplIds.length) return { porOp, erro: null };
  const { data, error } = await supabase.from('op_remessa_complementos').select('*').in('opl_id', oplIds).eq('cancelado', false).order('criado_em');
  if (error || !data) return { porOp, erro: error ? error.message : 'sem resposta' };
  for (const c of data) porOp.set(String(c.opl_id), [...(porOp.get(String(c.opl_id)) || []), c]);
  return { porOp, erro: null };
}

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

/** Frete que ainda não saiu: está sendo cotado ou espera a aprovação da alçada. Depois disso ("Em Trânsito", "Entregue") a OP não espera mais por ele. */
export const FRETE_AINDA_NAO_SAIU = ['Cotação', 'Aguardando Aprovação'];

/** Quantos fretes da OP ainda não SAÍRAM (cotação ou aprovação; cancelado não conta). Antes de 29/10/2026 a conta era "ainda não entregues": a OP esperava o canhoto de todos. Agora o que segura a OP é o frete
 *  que ainda nem saiu (ver FreteDaOp.ts). O frete que acabou de sair (`ignorarFreteId`) pode ser ignorado. */
export async function contarFretesQueNaoSairam(oplId: string, ignorarFreteId?: string | null): Promise<{ abertos: number; erro: string | null }> {
  const { data, error } = await supabase.from('pcp_fretes').select('id,status').eq('vinculo_id', oplId).in('vinculo_tipo', ['op_os', 'opl']);
  if (error || !data) return { abertos: 0, erro: error ? error.message : 'sem resposta' };
  return { abertos: data.filter((f: any) => f.id !== ignorarFreteId && FRETE_AINDA_NAO_SAIU.includes(f.status)).length, erro: null };
}

/** A OP tem alguma remessa ativa? (a Logística só muda o jeito de liberar a OP quando tem). */
export async function opTemRemessas(oplId: string): Promise<boolean> {
  const { count } = await supabase.from('op_remessas').select('id', { count: 'exact', head: true }).eq('opl_id', oplId).eq('cancelada', false);
  return (count || 0) > 0;
}
