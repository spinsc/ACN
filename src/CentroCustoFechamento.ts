// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO MÊS DOS CENTROS DE CUSTO — regras (Etapa 15e-2 do ux-fluxo, 05/10/2026)
//
// Decisões do usuário (perguntas clicáveis, 05/10/2026):
//  • depois de fechado, o mês TRAVA as despesas avulsas (criar, editar, excluir, medição, recorrente) e a CORREÇÃO DE COMPRAS (valor, centro e
//    data de uma compra criada naquele mês, na janela do Financeiro e na tela "Compras sem centro"); a tela do Compras segue livre;
//  • Admin e gerentes FECHAM; só o ADMIN reabre, e sempre com MOTIVO (guardado com o nome e a hora);
//  • a trava é de TELA (o sistema inteiro autentica pelo navegador, não há como o banco saber quem é a pessoa), conferida NO BANCO na hora de
//    gravar — não no que a tela guardou de antes —, para valer mesmo que outra pessoa tenha fechado o mês no meio do caminho.
//
// O MÊS de cada coisa é o mesmo que o painel do centro usa: a despesa vale no mês da COMPETÊNCIA (sem ela, no da data); a compra, no mês em que
// foi CRIADA. Pagamento de compra e a tela do Compras não são travados (o total do mês não muda: só a divisão entre pago e a pagar).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { diaISO } from './Interface';
import { ehAdminOuGerente } from './utils/permissoes';

export type MesRef = { ano: number; mes: number };
export type Fechamento = {
  id: string; ano: number; mes: number; fechado_em: string; fechado_por_email: string | null; fechado_por_nome: string | null;
  reaberto_em: string | null; reaberto_por_email: string | null; reaberto_por_nome: string | null; motivo_reabertura: string | null;
};

export const NOMES_DOS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (r: MesRef) => `${NOMES_DOS_MESES[r.mes - 1]} de ${r.ano}`;
const chave = (r: MesRef) => `${r.ano}-${String(r.mes).padStart(2, '0')}`;

/** 'AAAA-MM', 'AAAA-MM-DD' ou data e hora ISO → { ano, mes }; vazio ou inválido → null. */
export function mesDe(texto: any): MesRef | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(texto || ''));
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { ano: Number(m[1]), mes } : null;
}
/** O mês a que uma despesa pertence: a competência; sem ela (as de antes), o mês da data. */
export const mesDoLancamento = (l: any): MesRef | null => mesDe(l?.competencia) || mesDe(l?.data);
/** O mês de uma compra no centro de custo: o mês em que foi criada (dia no fuso de quem usa, como o painel). */
export const mesDaCompra = (p: any): MesRef | null => (p?.data_criacao ? mesDe(diaISO(new Date(p.data_criacao))) : null);

/** Admin e gerentes fecham o mês. */
export const podeFecharMes = (u: any) => ehAdminOuGerente(u);
/** Só o Admin reabre (mesma regra de "deletar registro" do sistema). */
export const podeReabrirMes = (u: any) => String(u?.perfil || '').trim() === 'Admin';

/** Todos os fechamentos (o histórico inteiro; o mais recente primeiro). Lança erro se a leitura falhar. */
export async function lerFechamentos(): Promise<Fechamento[]> {
  const { data, error } = await supabase.from('centro_custo_fechamentos').select('*').order('fechado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}
/** O fechamento em vigor (não reaberto) de um mês, ou undefined. */
export const fechamentoVigente = (lista: Fechamento[], r: MesRef | null) => (r ? (lista || []).find(f => f.ano === r.ano && f.mes === r.mes && !f.reaberto_em) : undefined);

const dataBR = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** "O mês de maio de 2026 está fechado (por Fulano, em 02/06/2026)…" — a frase que as telas mostram quando a trava barra. */
export function mensagemMesFechado(fechados: Array<{ ref: MesRef; f?: any }>) {
  const nomes = fechados.map(x => nomeDoMes(x.ref));
  const quem = fechados[0]?.f?.fechado_por_nome ? ` (fechado por ${fechados[0].f.fechado_por_nome}, em ${dataBR(fechados[0].f.fechado_em)})` : '';
  const frase = fechados.length === 1 ? `O mês de ${nomes[0]} está fechado${quem}.` : `Os meses de ${nomes.join(' e ')} estão fechados.`;
  return `${frase} Nada foi gravado. Para mexer, o Admin precisa reabrir o mês em Financeiro › Fechamento do mês.`;
}

export type ResultadoConferencia = { ok: true } | { ok: false; mensagem: string; falhaLeitura?: boolean; fechados?: MesRef[] };

/**
 * Confere NO BANCO, agora, se algum dos meses está fechado. Chame antes de gravar (e, se um dos lados for nulo — ex.: despesa sem data —,
 * ele é ignorado). Falha na leitura também BARRA: sem poder conferir, a trava não pode ser garantida (a mensagem diz isso).
 */
export async function conferirMesesAbertos(refs: Array<MesRef | null | undefined>): Promise<ResultadoConferencia> {
  const unicos = new Map<string, MesRef>();
  for (const r of refs) if (r) unicos.set(chave(r), r);
  if (!unicos.size) return { ok: true };
  const anos = [...new Set([...unicos.values()].map(r => r.ano))];
  const { data, error } = await supabase.from('centro_custo_fechamentos').select('ano,mes,fechado_em,fechado_por_nome').in('ano', anos).is('reaberto_em', null);
  if (error) return { ok: false, falhaLeitura: true, mensagem: `Não foi possível conferir se o mês está fechado (${error.message}). Nada foi gravado: tente de novo.` };
  const fechados = [...unicos.values()].filter(r => (data || []).some((f: any) => f.ano === r.ano && f.mes === r.mes));
  if (!fechados.length) return { ok: true };
  return { ok: false, fechados, mensagem: mensagemMesFechado(fechados.map(r => ({ ref: r, f: (data || []).find((f: any) => f.ano === r.ano && f.mes === r.mes) }))) };
}
