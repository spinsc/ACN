// Serviços de terceiros, fatia T6 (23/11/2026): o RELATÓRIO DO MÊS POR PRESTADOR (PLANO_SERVICOS_TERCEIROS.md): quantos serviços cada prestador fez, quanto estava combinado, quanto cobrou
// e o que ainda falta pedir ao Financeiro. Só regras e leitura, sem tela (a tela é TerceirosRelatorioTela.tsx, a folha impressa é TerceirosRelatorioImpressao.ts).
// Decidido com o usuário em 23/11/2026:
//  • um serviço conta no mês pelo DIA EM QUE FOI REALIZADO (`data_realizada`): é o que diz o que foi feito e cobrado no mês; ao lado vem "ainda a fazer" (o que está agendado para o mês e não teve baixa);
//  • a tela, a planilha do Excel e a folha para imprimir; a coluna "pago × a pedir ao Financeiro".
// O que não se quebra aqui:
//  • valor (combinado, cobrado, diferença, pago, a pedir) só para quem já vê valores no sistema: quem monta a planilha e a folha recebe `verValor` e deixa as colunas de dinheiro de fora;
//    a contagem de "a pedir" também some para quem não vê valores (dizer que há serviço a pagar é dizer que há valor, a mesma regra do contador "A pagar" do Quadro);
//  • "a pedir" é a MESMA conta do contador "A pagar" do Quadro (`estaAPagar`: realizado, valor final maior que zero, sem pedido de pagamento vivo), para os dois números nunca discordarem;
//  • leitura recusada devolve o erro, nunca "nenhum serviço"; se só a leitura das demandas do Financeiro falhar, os serviços com pedido ficam "não conferidos" e não entram nem em "pedido" nem em "a pedir";
//  • datas são texto AAAA-MM-DD (nunca `new Date(texto)` para o dia); o mês é o texto AAAA-MM.
// A leitura é por demanda da pessoa (abrir a aba, trocar de mês, "Atualizar"): não há consulta de minuto em minuto. Lê só as colunas que o relatório usa, só os realizados do mês e os agendados até o fim dele
// (a tabela tem algumas centenas de linhas por ano: uma leitura de varredura é barata, e ninguém abre este relatório a cada tela).
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerDemandasDePagamento, anexarPagamentos } from './TerceirosPagamento';
import { estaAPagar, situacaoDoPagamento, rotuloDaLigacao, reaisDoServico } from './TerceirosFluxo';
import type { ServicoDeTerceiro } from './TerceirosFluxo';

// ═══ O MÊS (texto AAAA-MM) ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const NOMES_DOS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const ehMesValido = (m: unknown): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || '')) && Number(String(m).slice(0, 4)) >= 2020;
/** O mês de uma data AAAA-MM-DD ("2026-11-23" → "2026-11"). */
export const mesDaData = (iso: string): string => String(iso || '').slice(0, 7);
/** "2026-11" → "novembro de 2026" ("" se não for um mês). */
export const rotuloDoMes = (m: string): string => (ehMesValido(m) ? `${NOMES_DOS_MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}` : '');
/** O primeiro e o último dia do mês, como texto (a conta é em UTC e só com números: não há fuso que mude o dia). */
export function limitesDoMes(m: string): { de: string; ate: string } {
  const ano = Number(m.slice(0, 4)); const mes = Number(m.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${m}-01`, ate: `${m}-${String(ultimo).padStart(2, '0')}` };
}
/** Anda `n` meses ("2026-01", -1 → "2025-12"). */
export function somarMeses(m: string, n: number): string {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// ═══ A LEITURA ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** As colunas que o relatório usa (nada de histórico, anexos nem peças). */
export const COLUNAS_DO_RELATORIO =
  'id,numero,tipo_id,descricao,status,ligacao_tipo,ligacao_rotulo,venda_base,ordem_id,prestador_id,valor_combinado,valor_final,data_agendada,periodo,data_realizada,pagamento_demanda_id,solicitante_nome';

export type LeituraDoRelatorio = { lista: ServicoDeTerceiro[]; erro: string | null; erroDosPagamentos: string | null };

/**
 * Lê o que o relatório do mês precisa: os serviços realizados naquele mês e os agendados com dia até o fim dele (os do mês são "ainda a fazer"; os de antes, "sem baixa de meses anteriores").
 * Depois lê, uma vez, a situação das demandas de pagamento dos realizados (só os que têm pedido); essa leitura pode falhar sozinha, e então os serviços com pedido ficam "não conferidos".
 */
export async function lerServicosDoMes(mes: string): Promise<LeituraDoRelatorio> {
  if (!ehMesValido(mes)) return { lista: [], erro: 'Escolha um mês válido.', erroDosPagamentos: null };
  const { de, ate } = limitesDoMes(mes);
  let linhas: ServicoDeTerceiro[];
  try {
    linhas = await lerPaginado(() => supabase.from('terceiros_servicos').select(COLUNAS_DO_RELATORIO)
      .or(`and(status.eq.realizado,data_realizada.gte.${de},data_realizada.lte.${ate}),and(status.eq.agendado,data_agendada.lte.${ate})`).order('id'));
  } catch (e: any) {
    return { lista: [], erro: explicarErroDoBanco(e), erroDosPagamentos: null };
  }
  const ids = linhas.filter(s => s.status === 'realizado' && s.pagamento_demanda_id).map(s => s.pagamento_demanda_id as string);
  if (!ids.length) return { lista: linhas, erro: null, erroDosPagamentos: null };
  const demandas = await lerDemandasDePagamento(ids);
  return { lista: anexarPagamentos(linhas, demandas), erro: null, erroDosPagamentos: demandas.erro };
}

// ═══ AS CONTAS ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const arred = (n: number): number => Math.round(n * 100) / 100;
const temValor = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

export type LinhaDoRelatorio = {
  chave: string; nome: string;
  realizados: number;
  combinado: number; semCombinado: number;          // soma dos valores combinados dos realizados que têm um, e quantos realizados não têm
  cobrado: number; semFinal: number;                // idem, do valor final
  diferenca: number;                                // final − combinado, só dos realizados que têm os dois
  pedidos: number; valorPedido: number;             // pagamento pedido e ainda aberto no Financeiro
  pagos: number; valorPago: number;                 // pagamento que o Financeiro concluiu
  aPedir: number; valorAPedir: number;              // a mesma conta do contador "A pagar" do Quadro
  naoConferidos: number;                            // com pedido de pagamento cuja situação não foi lida
  aFazer: number; aFazerCombinado: number;          // agendados para o mês e ainda sem baixa
  anteriores: number;                               // agendados em meses anteriores, ainda sem baixa
};

const linhaVazia = (chave: string, nome: string): LinhaDoRelatorio => ({
  chave, nome, realizados: 0, combinado: 0, semCombinado: 0, cobrado: 0, semFinal: 0, diferenca: 0, pedidos: 0, valorPedido: 0, pagos: 0, valorPago: 0, aPedir: 0, valorAPedir: 0, naoConferidos: 0,
  aFazer: 0, aFazerCombinado: 0, anteriores: 0,
});

/** Põe um serviço na linha. `noMes` diz de que lado ele conta: realizado no mês, agendado para o mês ou agendado antes dele. */
function somar(l: LinhaDoRelatorio, s: ServicoDeTerceiro, quando: 'realizado' | 'a_fazer' | 'anterior'): void {
  if (quando === 'a_fazer') { l.aFazer += 1; if (temValor(s.valor_combinado)) l.aFazerCombinado += Number(s.valor_combinado); return; }
  if (quando === 'anterior') { l.anteriores += 1; return; }
  l.realizados += 1;
  const temComb = temValor(s.valor_combinado); const temFinal = temValor(s.valor_final);
  if (temComb) l.combinado += Number(s.valor_combinado); else l.semCombinado += 1;
  if (temFinal) l.cobrado += Number(s.valor_final); else l.semFinal += 1;
  if (temComb && temFinal) l.diferenca += Number(s.valor_final) - Number(s.valor_combinado);
  const valor = temFinal ? Number(s.valor_final) : 0;
  const pag = situacaoDoPagamento(s);
  if (pag === 'pedido') { l.pedidos += 1; l.valorPedido += valor; }
  else if (pag === 'pago') { l.pagos += 1; l.valorPago += valor; }
  else if (pag === 'desconhecido') l.naoConferidos += 1;
  if (estaAPagar(s)) { l.aPedir += 1; l.valorAPedir += valor; }
}

const fechar = (l: LinhaDoRelatorio): LinhaDoRelatorio => ({
  ...l, combinado: arred(l.combinado), cobrado: arred(l.cobrado), diferenca: arred(l.diferenca), valorPedido: arred(l.valorPedido), valorPago: arred(l.valorPago), valorAPedir: arred(l.valorAPedir),
  aFazerCombinado: arred(l.aFazerCombinado),
});

export type ServicosDeUmaLinha = { realizados: ServicoDeTerceiro[]; aFazer: ServicoDeTerceiro[]; anteriores: ServicoDeTerceiro[] };
export type ResumoDoMes = {
  mes: string;
  porPrestador: LinhaDoRelatorio[]; porTipo: LinhaDoRelatorio[]; total: LinhaDoRelatorio;
  /** os serviços de cada prestador (a chave é a da linha), para a tela abrir a lista dele e a planilha e a folha trazerem um a um */
  servicosDoPrestador: Map<string, ServicosDeUmaLinha>;
  /** quantos serviços o mês não conseguiu colocar na conta e por quê (serviço de outro mês que a leitura trouxe, por exemplo); só diagnóstico */
  fora: number;
};

export const SEM_PRESTADOR = '__sem_prestador__';
const quandoConta = (s: ServicoDeTerceiro, de: string, ate: string): 'realizado' | 'a_fazer' | 'anterior' | null => {
  if (s.status === 'realizado') return s.data_realizada && s.data_realizada >= de && s.data_realizada <= ate ? 'realizado' : null;
  if (s.status === 'agendado' && s.data_agendada) return s.data_agendada >= de && s.data_agendada <= ate ? 'a_fazer' : s.data_agendada < de ? 'anterior' : null;
  return null;   // solicitado e cancelado nunca contam
};

const porValorOuQuantidade = (verValor: boolean) => (a: LinhaDoRelatorio, b: LinhaDoRelatorio): number =>
  Number(b.realizados > 0) - Number(a.realizados > 0)
  || (verValor ? b.cobrado - a.cobrado : 0)
  || b.realizados - a.realizados
  || b.aFazer - a.aFazer
  || a.nome.localeCompare(b.nome, 'pt-BR');

/**
 * O resumo do mês. `nomeDoPrestador` e `nomeDoTipo` devolvem o nome pelo id (ou undefined, quando o cadastro não o tem). A ordem das linhas é a de quem fez mais (e, para quem vê valores, cobrou mais);
 * o prestador que só tem serviço "ainda a fazer" vem depois.
 */
export function resumoDoMes(lista: ServicoDeTerceiro[], mes: string, nomeDoPrestador: (id: string) => string | undefined, nomeDoTipo: (id: string) => string | undefined, verValor: boolean): ResumoDoMes {
  const { de, ate } = limitesDoMes(mes);
  const prest = new Map<string, LinhaDoRelatorio>(); const tipos = new Map<string, LinhaDoRelatorio>();
  const total = linhaVazia('total', 'Total');
  const servicos = new Map<string, ServicosDeUmaLinha>();
  let fora = 0;
  for (const s of lista) {
    const quando = quandoConta(s, de, ate);
    if (!quando) { fora++; continue; }
    const chaveP = s.prestador_id || SEM_PRESTADOR;
    const nomeP = s.prestador_id ? (nomeDoPrestador(s.prestador_id) || 'Prestador não encontrado') : 'Sem prestador';
    const chaveT = s.tipo_id || '';
    const nomeT = (s.tipo_id && nomeDoTipo(s.tipo_id)) || 'Tipo não encontrado';
    const lp = prest.get(chaveP) || linhaVazia(chaveP, nomeP); prest.set(chaveP, lp);
    const lt = tipos.get(chaveT) || linhaVazia(chaveT, nomeT); tipos.set(chaveT, lt);
    somar(lp, s, quando); somar(lt, s, quando); somar(total, s, quando);
    const dele = servicos.get(chaveP) || { realizados: [], aFazer: [], anteriores: [] }; servicos.set(chaveP, dele);
    (quando === 'realizado' ? dele.realizados : quando === 'a_fazer' ? dele.aFazer : dele.anteriores).push(s);
  }
  const doDia = (a: ServicoDeTerceiro, b: ServicoDeTerceiro) => String(a.data_realizada || a.data_agendada || '').localeCompare(String(b.data_realizada || b.data_agendada || '')) || String(a.numero).localeCompare(String(b.numero));
  for (const v of servicos.values()) { v.realizados.sort(doDia); v.aFazer.sort(doDia); v.anteriores.sort(doDia); }
  const ordem = porValorOuQuantidade(verValor);
  return {
    mes,
    porPrestador: [...prest.values()].map(fechar).sort(ordem),
    porTipo: [...tipos.values()].map(fechar).sort(ordem),
    total: fechar(total), servicosDoPrestador: servicos, fora,
  };
}

// ═══ O QUE CADA SERVIÇO MOSTRA ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** A situação do pagamento do serviço realizado, em palavras (para a tela, a planilha e a folha). Só quem vê valores a recebe: dizer "a pedir" é dizer que há valor. */
export function rotuloDoPagamentoNoRelatorio(s: ServicoDeTerceiro): string {
  if (s.status !== 'realizado') return '—';
  const p = situacaoDoPagamento(s);
  if (p === 'pago') return 'Pago';
  if (p === 'pedido') return 'Pedido ao Financeiro';
  if (p === 'desconhecido') return 'Não conferido';
  return Number(s.valor_final) > 0 ? 'A pedir' : 'Sem valor a pagar';
}
export const diferencaDoServico = (s: Pick<ServicoDeTerceiro, 'valor_combinado' | 'valor_final'>): number | null =>
  temValor(s.valor_combinado) && temValor(s.valor_final) ? arred(Number(s.valor_final) - Number(s.valor_combinado)) : null;
export const reais = reaisDoServico;
export const ligacaoDoServico = (s: ServicoDeTerceiro): string => rotuloDaLigacao(s);

// ═══ A PLANILHA (a mesma tabela da tela; o dinheiro vai como NÚMERO, para somar no Excel) ═════════════════════════════════════════════════════════════
export type ColunaDaPlanilha = { rotulo: string; formato?: 'texto' | 'moeda' | 'inteiro' | 'percentual'; largura?: number };
export type FolhaDaPlanilha = { nome: string; colunas: ColunaDaPlanilha[]; linhas: any[][] };

const diaBR = (iso: unknown): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

function folhaDeLinhas(nome: string, rotuloDaChave: string, linhas: LinhaDoRelatorio[], total: LinhaDoRelatorio, verValor: boolean): FolhaDaPlanilha {
  const colunas: ColunaDaPlanilha[] = [{ rotulo: rotuloDaChave, largura: 32 }, { rotulo: 'Serviços realizados', formato: 'inteiro', largura: 20 }];
  if (verValor) colunas.push({ rotulo: 'Combinado', formato: 'moeda' }, { rotulo: 'Cobrado', formato: 'moeda' }, { rotulo: 'Diferença', formato: 'moeda' },
    { rotulo: 'Pagamento pedido (aberto)', formato: 'moeda', largura: 24 }, { rotulo: 'Pago', formato: 'moeda' }, { rotulo: 'A pedir ao Financeiro', formato: 'moeda', largura: 22 });
  colunas.push({ rotulo: 'Ainda a fazer (agendados no mês)', formato: 'inteiro', largura: 30 });
  const linha = (l: LinhaDoRelatorio, rotulo: string): any[] => [rotulo, l.realizados, ...(verValor ? [l.combinado, l.cobrado, l.diferenca, l.valorPedido, l.valorPago, l.valorAPedir] : []), l.aFazer];
  return { nome, colunas, linhas: [...linhas.map(l => linha(l, l.nome)), linha(total, 'TOTAL')] };
}

/** As três folhas da planilha: por prestador, por tipo e os serviços um a um (a conferência do Financeiro). */
export function folhasDaPlanilha(r: ResumoDoMes, verValor: boolean): FolhaDaPlanilha[] {
  const nomes = new Map(r.porPrestador.map(l => [l.chave, l.nome]));
  const colunasServico: ColunaDaPlanilha[] = [{ rotulo: 'Prestador', largura: 30 }, { rotulo: 'Nº', largura: 12 }, { rotulo: 'Tipo', largura: 22 }, { rotulo: 'Descrição', largura: 46 }, { rotulo: 'Ligação', largura: 26 },
    { rotulo: 'Venda', largura: 14 }, { rotulo: 'Realizado em', largura: 14 }];
  if (verValor) colunasServico.push({ rotulo: 'Combinado', formato: 'moeda' }, { rotulo: 'Cobrado', formato: 'moeda' }, { rotulo: 'Diferença', formato: 'moeda' }, { rotulo: 'Pagamento', largura: 22 });
  const tipoDe = new Map<string, string>();
  for (const l of r.porTipo) tipoDe.set(l.chave, l.nome);
  const linhasServico: any[][] = [];
  for (const p of r.porPrestador) {
    for (const s of r.servicosDoPrestador.get(p.chave)?.realizados || []) {
      linhasServico.push([nomes.get(p.chave) || '', s.numero, tipoDe.get(s.tipo_id) || '', s.descricao || '', ligacaoDoServico(s), s.venda_base || '', diaBR(s.data_realizada),
        ...(verValor ? [temValor(s.valor_combinado) ? Number(s.valor_combinado) : '', temValor(s.valor_final) ? Number(s.valor_final) : '', diferencaDoServico(s) ?? '', rotuloDoPagamentoNoRelatorio(s)] : [])]);
    }
  }
  return [folhaDeLinhas('Por prestador', 'Prestador', r.porPrestador, r.total, verValor), folhaDeLinhas('Por tipo', 'Tipo de serviço', r.porTipo, r.total, verValor), { nome: 'Serviços', colunas: colunasServico, linhas: linhasServico }];
}

/** O nome do arquivo da planilha. */
export const nomeDaPlanilha = (mes: string): string => `Servicos_de_terceiros_${mes}`;
