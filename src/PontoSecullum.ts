// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PONTO SECULLUM — as regras da tela Ponto (PLANO_PONTO_SECULLUM.md, 19/11/2026) e a leitura da cópia que a função de servidor mantém.
//
// O ponto dos CLT da Detech vem da Secullum (só leitura) e é guardado no nosso banco: `ponto_dias` (um registro por pessoa e dia, com as colunas do cálculo da
// Secullum PELO NOME — elas variam por pessoa), `ponto_totais` (os totais do mês) e `ponto_rodadas` (cada atualização). Quem vê o quê é o banco que decide:
// RH, Admin e gerentes veem todos; cada pessoa vê só o próprio ponto. Aqui ficam as contas (horas, pares de batida, situação do dia, extras) e as leituras.
// Datas sempre como texto AAAA-MM-DD (nunca `new Date(texto)`, que muda o dia pelo fuso).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerPaginado } from './LerPaginado';

// ── Horas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** "08:48", "-02:51" ou "181:38" (a Secullum passa de 100 horas nos totais). Qualquer outra coisa (FOLGA, vazio) não é hora. */
export const ehHora = (s: any): boolean => /^-?\d{1,4}:\d{2}$/.test(String(s ?? '').trim());

/** Minutos de um texto de hora; texto que não é hora vale 0 (a coluna vazia da Secullum é "00:00" ou ausente). */
export function paraMinutos(s: any): number {
  const t = String(s ?? '').trim();
  if (!ehHora(t)) return 0;
  const negativo = t.startsWith('-');
  const [h, m] = t.replace('-', '').split(':').map(Number);
  const total = h * 60 + m;
  return negativo ? -total : total;
}

/** Minutos de volta para "HH:MM" (com o sinal quando negativo, e "+" se `comMais`). */
export function paraTexto(min: number, comMais = false): string {
  const m = Math.round(min || 0);
  const abs = Math.abs(m);
  const t = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return m < 0 ? `-${t}` : (comMais && m > 0 ? `+${t}` : t);
}

// ── O dia ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "2026-11-09" → "09/11 · seg" (o dia da semana sai dos números, sem passar por fuso). */
export function rotuloDoDia(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '');
  if (!m) return dia || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[3]}/${m[2]} · ${SEMANA[d.getDay()]}`;
}
export const ehFimDeSemana = (dia: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '');
  if (!m) return false;
  const w = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  return w === 0 || w === 6;
};

export const COLUNAS_DE_BATIDA = [1, 2, 3, 4, 5];

/** Texto que a Secullum põe no lugar das batidas quando o dia é marcado ("FOLGA", "FERIADO"…): o primeiro que não for hora. */
export function marcadorDoDia(valores: any): string | null {
  for (const n of COLUNAS_DE_BATIDA) {
    for (const c of [`Entrada ${n}`, `Saída ${n}`]) {
      const v = valores?.[c];
      if (v && !ehHora(v)) return String(v);
    }
  }
  return null;
}

/** Os pares entrada/saída do dia, só com horas de verdade. Uma entrada sem saída fica com `saida: null` (a pessoa ainda está lá, ou esqueceu de bater). */
export function paresDoDia(valores: any): { entrada: string | null; saida: string | null }[] {
  const pares = [];
  for (const n of COLUNAS_DE_BATIDA) {
    const e = valores?.[`Entrada ${n}`], s = valores?.[`Saída ${n}`];
    const entrada = ehHora(e) ? String(e) : null, saida = ehHora(s) ? String(s) : null;
    if (entrada || saida) pares.push({ entrada, saida });
  }
  return pares;
}

export type SituacaoDoDia = { id: 'trabalhando' | 'saiu' | 'completo' | 'incompleto' | 'falta' | 'sem_batida' | 'ainda_nao_bateu' | 'justificado' | 'marcado' | 'sem_jornada'; rotulo: string; familia: 'ok' | 'atencao' | 'erro' | 'info' | 'neutro'; dica?: string };

/**
 * Em que pé está o dia da pessoa. Regras (todas lidas só das colunas que a Secullum devolve):
 *  - o dia tem uma marca (FOLGA, FERIADO…) no lugar das batidas → a marca;
 *  - tem entrada sem saída: hoje = "Trabalhando"; dia que já passou = "Batida incompleta" (vermelho: alguém esqueceu de bater);
 *  - tem as batidas todas → completo (hoje: "Já saiu");
 *  - sem batida: Faltas preenchida = falta; abono ou justificativa = justificado; dia com jornada prevista (Carga) = "Ainda não bateu" hoje e
 *    "Sem batida" nos dias que passaram (vermelho); sem jornada prevista = "Sem jornada" (fim de semana, folga).
 */
export function situacaoDoDia(valores: any, dia: string, hoje: string): SituacaoDoDia {
  const v = valores || {};
  const marca = marcadorDoDia(v);
  // Achado de 25/11/2026: nos dias de falta a Secullum escreve a marca FALTA no lugar das batidas (e preenche "Faltas"). Antes ela caía no aviso neutro
  // "Falta" e nunca chegava ao "A tratar". Só vale de dia que já passou (o de hoje a Secullum conta como falta antes de acabar) e com horas de falta;
  // a mesma conta está em SQL: `ponto_ocorrencia_do_dia` (supabase/sql/ponto_p3.sql).
  if (marca && marca.trim().toUpperCase() === 'FALTA' && dia < hoje && paraMinutos(v['Faltas']) > 0) return { id: 'falta', rotulo: 'Falta', familia: 'erro' };
  if (marca) return { id: 'marcado', rotulo: marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase(), familia: 'neutro' };
  const pares = paresDoDia(v);
  const entradas = pares.filter(p => p.entrada).length, saidas = pares.filter(p => p.saida).length;
  if (pares.length) {
    if (entradas > saidas || pares.some(p => p.entrada && !p.saida)) {
      return dia === hoje ? { id: 'trabalhando', rotulo: 'Trabalhando', familia: 'info' }
        : { id: 'incompleto', rotulo: 'Batida incompleta', familia: 'erro', dica: 'Tem entrada sem saída (ou saída sem entrada) neste dia: alguém esqueceu de bater.' };
    }
    return dia === hoje ? { id: 'saiu', rotulo: 'Já saiu', familia: 'neutro' } : { id: 'completo', rotulo: 'Completo', familia: 'ok' };
  }
  // O dia de hoje ainda não acabou: a Secullum o conta como falta enquanto a pessoa não bate (19/11/2026), e isso nunca é falta de verdade antes de o dia passar.
  if (dia !== hoje && paraMinutos(v['Faltas']) > 0) return { id: 'falta', rotulo: 'Falta', familia: 'erro' };
  if (['Abono2', 'Abono3', 'Abono4', 'JustPa.', 'Ajuste'].some(c => v[c] && String(v[c]) !== '00:00')) return { id: 'justificado', rotulo: 'Abonado', familia: 'neutro', dica: 'O dia tem abono, justificativa ou ajuste lançado na Secullum.' };
  if (paraMinutos(v['Carga']) > 0) {
    return dia === hoje ? { id: 'ainda_nao_bateu', rotulo: 'Ainda não bateu', familia: 'atencao' }
      : dia < hoje ? { id: 'sem_batida', rotulo: 'Sem batida', familia: 'erro', dica: 'Havia jornada prevista e nenhuma batida.' } : { id: 'sem_jornada', rotulo: '—', familia: 'neutro' };
  }
  return { id: 'sem_jornada', rotulo: 'Sem jornada', familia: 'neutro' };
}

// ── O mês ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * As colunas de hora extra que a Secullum pode devolver (cada empresa tem as suas, conforme o horário: "Extras" sozinha, ou separadas em 50% e 100%, noturnas e de
 * intervalo). O total é a SOMA das que vierem preenchidas. Em 19/11/2026 nenhum dos CLT amostrados tinha extra no mês, então não se viu nenhum caso real:
 * conferir a soma com a Secullum na primeira vez que alguém fizer hora extra.
 */
export const COLUNAS_DE_EXTRA = ['Extras', 'Ex50%', 'Ex100%', 'EN50%', 'EN100%', 'EI50%', 'EI100%', 'ExNot', 'ExInt'];
export const ROTULO_DA_EXTRA: Record<string, string> = {
  'Extras': 'Extras', 'Ex50%': 'Extras 50%', 'Ex100%': 'Extras 100%', 'EN50%': 'Extras noturnas 50%', 'EN100%': 'Extras noturnas 100%',
  'EI50%': 'Extras de intervalo 50%', 'EI100%': 'Extras de intervalo 100%', 'ExNot': 'Extras noturnas', 'ExInt': 'Extras de intervalo',
};

export function extrasDoMes(totais: any): { total: number; partes: { coluna: string; rotulo: string; min: number }[] } {
  const partes = COLUNAS_DE_EXTRA.map(c => ({ coluna: c, rotulo: ROTULO_DA_EXTRA[c] || c, min: paraMinutos(totais?.[c]) })).filter(p => p.min !== 0);
  return { total: partes.reduce((s, p) => s + p.min, 0), partes };
}

export type ResumoDoMes = { normais: number; faltas: number; atrasos: number; extras: number; bancoSaldo: number; bancoCredito: number; bancoDebito: number; noturno: number };
export function resumoDoMes(totais: any): ResumoDoMes {
  const t = totais || {};
  return {
    normais: paraMinutos(t['Normais']), faltas: paraMinutos(t['Faltas']), atrasos: paraMinutos(t['Atras.']), extras: extrasDoMes(t).total,
    bancoSaldo: paraMinutos(t['BSaldo']), bancoCredito: paraMinutos(t['BCred.']), bancoDebito: paraMinutos(t['BDeb.']), noturno: paraMinutos(t['Not.Tot.']),
  };
}

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2026-11-01" → "novembro de 2026". */
export function rotuloDoMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes || '');
  return m ? `${NOMES_MES[Number(m[2]) - 1]} de ${m[1]}` : (mes || '');
}
export const primeiroDiaDoMes = (dia: string): string => String(dia).slice(0, 8) + '01';
export function ultimoDiaDoMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes || ''); if (!m) return mes;
  const ult = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${m[1]}-${m[2]}-${String(ult).padStart(2, '0')}`;
}

/** "dd/mm às hh:mm" de um instante do banco (no fuso de quem usa o sistema). */
export function quandoFoi(iso: any): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Há quantas horas foi, para a faixa de "a atualização automática não rodou". */
export const horasDesde = (iso: any): number => { const t = new Date(iso).getTime(); return isNaN(t) ? Infinity : (Date.now() - t) / 3600e3; };
/** Passada esta idade, na semana, a rotina das 8h30/20h30 não rodou (o intervalo normal entre as duas é 12 h). */
export const HORAS_PARA_AVISAR_QUE_NAO_RODOU = 15;

// ── Leitura da cópia (o banco filtra por pessoa; leitura recusada devolve `erro`, nunca "vazio") ──────────────────────────────────────────
type Lido<T> = { erro: string | null; dados: T };
const falha = (e: any) => explicarErroDoBanco(e) || String(e?.message || e || 'o banco não respondeu');

export async function lerPermissoes(): Promise<{ verTodos: boolean; ehRh: boolean; meuRhId: string | null; erro: string | null }> {
  const [a, b, c] = await Promise.all([supabase.rpc('ponto_pode_ver_todos'), supabase.rpc('pode_ver_rh'), supabase.rpc('ponto_meu_rh_id')]);
  const erro = a.error || b.error || c.error;
  return { verTodos: a.data === true, ehRh: b.data === true, meuRhId: (c.data as string) || null, erro: erro ? falha(erro) : null };
}

/** Os meses que têm dados guardados (do mais novo ao mais antigo). */
export async function lerMesesComDados(): Promise<Lido<string[]>> {
  const { data, error } = await supabase.from('ponto_totais').select('mes').order('mes', { ascending: false }).limit(300);
  if (error) return { erro: falha(error), dados: [] };
  return { erro: null, dados: [...new Set((data || []).map((r: any) => String(r.mes).slice(0, 10)))] };
}

export async function lerTotais(mes: string, rhId?: string): Promise<Lido<any[]>> {
  let q = supabase.from('ponto_totais').select('rh_id, mes, ate_dia, valores, atualizado_em').eq('mes', mes);
  if (rhId) q = q.eq('rh_id', rhId);
  const { data, error } = await q;
  return error ? { erro: falha(error), dados: [] } : { erro: null, dados: data || [] };
}

export async function lerDiasDaPessoa(rhId: string, mes: string): Promise<Lido<any[]>> {
  const { data, error } = await supabase.from('ponto_dias').select('dia, valores, atualizado_em').eq('rh_id', rhId)
    .gte('dia', mes).lte('dia', ultimoDiaDoMes(mes)).order('dia');
  return error ? { erro: falha(error), dados: [] } : { erro: null, dados: data || [] };
}

export async function lerDiaDeTodos(dia: string): Promise<Lido<any[]>> {
  const { data, error } = await supabase.from('ponto_dias').select('rh_id, dia, valores, atualizado_em').eq('dia', dia).limit(1000);
  return error ? { erro: falha(error), dados: [] } : { erro: null, dados: data || [] };
}

/** Nome e departamento de quem tem ponto (a visão básica do RH: sem CPF nem salário). */
export async function lerPessoas(ids: string[]): Promise<Lido<Map<string, any>>> {
  const mapa = new Map<string, any>();
  if (!ids.length) return { erro: null, dados: mapa };
  const { data, error } = await supabase.from('rh_funcionarios_basico').select('id, nome, departamento, cargo').in('id', ids);
  if (error) return { erro: falha(error), dados: mapa };
  (data || []).forEach((p: any) => mapa.set(p.id, p));
  return { erro: null, dados: mapa };
}

export async function lerUltimasRodadas(limite = 5): Promise<Lido<any[]>> {
  const { data, error } = await supabase.from('ponto_rodadas').select('id, iniciada_em, terminada_em, origem, por, ok, pessoas, consultas_calculo, restante_na_hora, erro, detalhes').order('iniciada_em', { ascending: false }).limit(limite);
  return error ? { erro: falha(error), dados: [] } : { erro: null, dados: data || [] };
}

/** Quem tem ponto mas o sistema não achou o usuário da ficha (RH): a pessoa não consegue abrir o próprio ponto até o nome ou o e-mail baterem. */
export async function lerPessoasSemUsuario(): Promise<Lido<string[]>> {
  const { data, error } = await supabase.rpc('ponto_ligacoes');
  if (error) return { erro: falha(error), dados: [] };
  return { erro: null, dados: (data || []).filter((l: any) => !l.usuario_id).map((l: any) => String(l.rh_id)) };
}

/** O botão "Atualizar ponto agora": chama a função de servidor, que lê a Secullum e grava a cópia. Devolve a frase para a pessoa. */
export async function atualizarPontoAgora(): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.functions.invoke('ponto-secullum', { body: { acao: 'sincronizar', origem: 'botao' } });
  if (error) {
    let motivo = '';
    try { const corpo = await (error as any).context?.json?.(); motivo = String(corpo?.erro || ''); } catch { /* sem corpo legível */ }
    return { ok: false, mensagem: `Falha ao atualizar o ponto: ${motivo || (error as any).message || 'a função não respondeu'}` };
  }
  if (data?.erro) return { ok: false, mensagem: `Falha ao atualizar o ponto: ${data.erro}` };
  const sem = Number(data?.erros || 0);
  return {
    ok: true,
    mensagem: `Ponto atualizado: ${data?.pessoas ?? 0} pessoa(s) lida(s) na Secullum${sem ? `; ${sem} deram erro e ficam como estavam` : ''}.`,
  };
}

// ── Para a aba RH › Relógio Ponto (20/11/2026) ───────────────────────────────────────────────────────────────────────────────────────────
/** Os dias do mês de TODOS (em blocos de 1.000, porque 20 pessoas × 31 dias já se aproxima do corte do banco). */
export async function lerDiasDoMesDeTodos(mes: string): Promise<Lido<any[]>> {
  try {
    const dados = await lerPaginado(() => supabase.from('ponto_dias').select('rh_id, dia, valores, atualizado_em').gte('dia', mes).lte('dia', ultimoDiaDoMes(mes)).order('rh_id').order('dia'));
    return { erro: null, dados };
  } catch (e) { return { erro: falha(e), dados: [] }; }
}

/** Os usuários ativos do sistema (id, nome e e-mail), para o RH escolher com quem ligar a ficha. */
export async function lerUsuariosAtivos(): Promise<Lido<any[]>> {
  const { data, error } = await supabase.from('auth_usuarios').select('id, nome, email').eq('ativo', true).order('nome');
  return error ? { erro: falha(error), dados: [] } : { erro: null, dados: data || [] };
}

/** Liga (ou desliga, com `null`) a ficha do RH a um usuário do sistema: é a marca `rh_funcionarios.usuario_id`, a primeira coisa que o banco olha para abrir o "Meu ponto". Confere a linha devolvida. */
export async function ligarUsuarioAFicha(rhId: string, usuarioId: string | null): Promise<{ ok: boolean; erro: string }> {
  const { data, error } = await supabase.from('rh_funcionarios').update({ usuario_id: usuarioId }).eq('id', rhId).select('id');
  if (error) return { ok: false, erro: falha(error) };
  if (!data?.length) return { ok: false, erro: 'o banco não gravou a ligação (sem permissão ou a ficha não existe mais)' };
  return { ok: true, erro: '' };
}
