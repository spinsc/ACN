// @ts-nocheck
// Data da nota ao faturar (pedido do usuário em 26/10/2026): o Fiscal passou a lançar também notas de meses passados, e até aqui a data da nota era sempre o
// instante do clique ("data_emissao_nf = agora"). Regra decidida: o campo vem com HOJE; deixar como está (ou em branco) registra agora, exatamente como antes;
// escolher um dia anterior lança a nota com aquele dia. Data futura é recusada. Esta data é a que o relatório de faturamento do mês, a comissão por faturamento e
// a Conciliação Bancária leem — por isso a confirmação diz em que mês a nota vai entrar (e se o mês já tem comissão aprovada).
// Módulo sem tela (e sem importar a Interface): é a regra pura, para testar sem navegador.

export const ANO_MINIMO = 2020;

const dois = (n: number) => String(n).padStart(2, '0');
/** O dia de uma data pelo relógio de quem está na tela (AAAA-MM-DD). Nunca `toISOString`, que devolve o dia de Londres. */
export const diaLocal = (d: Date): string => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** AAAA-MM-DD → dd/mm/aaaa, lido direto do texto (sem passar por Date, que erra o dia). */
export const dataBR = (dia: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** AAAA-MM-DD → "setembro de 2026". */
export const mesPorExtenso = (dia: string): string => { const m = /^(\d{4})-(\d{2})/.exec(dia || ''); return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : '—'; };

export type DataDaNota = { erro?: string; iso?: string; dia?: string; retroativa: boolean };

/**
 * Resolve o que o Fiscal digitou no campo "Data da nota".
 *  • vazio ou igual a hoje → o instante de agora (comportamento de sempre; nada muda para quem não mexe no campo);
 *  • dia anterior → meio-dia (horário de quem está na tela) daquele dia: o meio-dia fica longe das viradas de dia usadas pelos relatórios (meia-noite de Brasília) e
 *    a nota nunca "escorrega" para o dia vizinho;
 *  • data futura, inexistente (31/02) ou de antes de 2020 → erro em português.
 */
export function resolverDataDaNota(entrada: any, agora: Date = new Date()): DataDaNota {
  const dia = String(entrada ?? '').trim();
  const hoje = diaLocal(agora);
  if (!dia || dia === hoje) return { iso: agora.toISOString(), dia: hoje, retroativa: false };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return { erro: 'A data da nota está inválida. Escolha o dia no campo, ou deixe em hoje para registrar agora.', retroativa: false };
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const meio = new Date(a, me - 1, d, 12, 0, 0);
  if (meio.getFullYear() !== a || meio.getMonth() !== me - 1 || meio.getDate() !== d) return { erro: `A data da nota (${dia}) não existe. Confira o dia e o mês.`, retroativa: false };
  if (a < ANO_MINIMO) return { erro: `A data da nota (${dataBR(dia)}) é antiga demais. Confira o ano.`, retroativa: false };
  if (dia > hoje) return { erro: `A data da nota não pode ser depois de hoje (${dataBR(hoje)}). Escolha hoje ou um dia anterior.`, retroativa: false };
  return { iso: meio.toISOString(), dia, retroativa: true };
}

/** O instante que vai para `data_emissao_nf`: o de AGORA (na hora de gravar, não na de digitar) quando a data é hoje; o meio-dia do dia escolhido quando é retroativa. */
export const instanteDaNota = (r: DataDaNota, agora: string): string => (r?.retroativa && r.iso ? r.iso : agora);

/** Quantos técnicos já têm a comissão APROVADA no mês da data (`rh_comissoes_fechamento`). `erro` = não deu para conferir: nunca vale como "nenhum". */
export async function lerFechamentosAprovadosDoMes(supabase: any, dia: string): Promise<{ qtd: number; erro?: string }> {
  const m = /^(\d{4})-(\d{2})/.exec(dia || '');
  if (!m) return { qtd: 0 };
  const { count, error } = await supabase.from('rh_comissoes_fechamento').select('id', { count: 'exact', head: true })
    .eq('ano', Number(m[1])).eq('mes', Number(m[2])).eq('status', 'aprovado');
  if (error) return { qtd: 0, erro: error.message };
  return { qtd: count || 0 };
}

/**
 * O que a pergunta de confirmação acrescenta quando a data é retroativa ('' quando é hoje).
 * `tipo`: 'op' (a data da nota é a do relatório do mês, da comissão e da conciliação) ou 'os' (na OS do SAC o dia da nota é a "Data de faturamento" da OS,
 * a que a comissão da OS lê; desde 27/10/2026 o SAC não a digita).
 */
export function avisoDaDataRetroativa(r: DataDaNota, opts: { tipo?: 'op' | 'os'; agora?: Date; fechamentos?: { qtd: number; erro?: string } | null } = {}): string {
  if (!r.retroativa || !r.dia) return '';
  const { tipo = 'op', agora = new Date(), fechamentos = null } = opts;
  const mesmoMes = r.dia.slice(0, 7) === diaLocal(agora).slice(0, 7);
  const linhas = [`\nData da nota: ${dataBR(r.dia)} (retroativa).`];
  if (tipo === 'op') {
    linhas.push(mesmoMes
      ? 'É deste mês, então segue no relatório e na comissão do mês atual.'
      : `Ela entra em ${mesPorExtenso(r.dia)} no relatório de faturamento, na comissão e na conciliação bancária — e não no mês atual.`);
  } else {
    // decidido com o usuário em 27/10/2026 (S2 do SAC): o dia da nota virou a data de faturamento da OS, que é a que a comissão da OS lê; o SAC não a digita mais
    linhas.push(mesmoMes
      ? 'É deste mês, então a data de faturamento da OS e a comissão da OS ficam no mês atual.'
      : `A data da nota passa a ser a data de faturamento da OS: ela entra em ${mesPorExtenso(r.dia)} na comissão da OS — e não no mês atual.`);
  }
  if (fechamentos?.erro) linhas.push(`Não consegui conferir se ${mesPorExtenso(r.dia)} já tem comissão aprovada (${fechamentos.erro}).`);
  else if (fechamentos && fechamentos.qtd > 0) linhas.push(`ATENÇÃO: ${mesPorExtenso(r.dia)} já tem comissão aprovada para ${fechamentos.qtd} técnico${fechamentos.qtd > 1 ? 's' : ''}; esta nota não entra no valor já aprovado.`);
  return linhas.join('\n');
}

/** Frase para o histórico da OP quando a data é retroativa ('' quando é hoje): diz o dia da nota e o dia em que foi lançada. */
export function textoDaDataNoHistorico(r: DataDaNota, agora: Date = new Date()): string {
  if (!r.retroativa || !r.dia) return '';
  return ` Nota emitida em ${dataBR(r.dia)} (lançamento retroativo feito em ${dataBR(diaLocal(agora))}).`;
}
