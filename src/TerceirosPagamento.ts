// Serviços de terceiros, fatia T5 (23/11/2026): pedir o pagamento do serviço ao Financeiro (PLANO_SERVICOS_TERCEIROS.md).
// Decidido com o usuário em 23/11/2026: UM pedido de pagamento por visita ou ordem. O botão fica no serviço realizado, no grupo de carros e na ordem; o pedido soma o valor final dos serviços marcados,
// abre UMA demanda no setor Financeiro já preenchida (favorecido = o prestador, o CNPJ/CPF dele, o valor e a ligação com a OP ou a OS) e quem pede completa o vencimento e os dados para pagar.
// O serviço passa a mostrar "Pagamento pedido" e, quando o Financeiro conclui a demanda, "Pago"; o contador "A pagar" (só para quem vê valores) é o realizado com valor final ainda sem pedido.
// O que não se quebra aqui:
//  • quem soma o valor e abre a demanda é o BANCO (`terceiros_pagamento_pedir`, tudo ou nada): a tela nunca manda o valor, só o favorecido, o vencimento, a forma e os dados para pagar;
//  • a situação do pagamento NÃO é guardada no serviço: ela é lida da demanda (concluída = pago, cancelada = pode pedir de novo). Leitura da demanda recusada vira 'desconhecido' e a tela
//    não afirma nada em cima do que não conseguiu ler (nem "a pagar", nem "pago"), como nas leituras das ordens e dos prestadores;
//  • o valor só aparece para quem vê valores, mas qualquer pessoa que mexe no serviço pode pedir o pagamento (o banco soma sozinho).
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { chamar, deu, falhou } from './TerceirosServicos';
import type { RespostaDoBanco } from './TerceirosServicos';
import { podeMexerNoServico, situacaoDoPagamento, reaisDoServico } from './TerceirosFluxo';
import type { ServicoDeTerceiro, SituacaoDoPagamento } from './TerceirosFluxo';
import { podeMexerNaOrdem } from './TerceirosOrdens';
import type { PrestadorDeTerceiros } from './TerceirosModelo';

/** Os tipos de custo e as formas de pagamento são os da demanda do Financeiro (PagamentoDeTerceiro.tsx) e os do banco; repetidos aqui só como ids, para a tela de pedido não importar a tela da demanda. */
export const TIPOS_DE_CUSTO_DO_PEDIDO = ['servico', 'material', 'frete', 'diaria', 'outro'];
export const FORMAS_DO_PEDIDO = ['pix', 'boleto', 'transferencia', 'outro'];

const MAXIMO_POR_PEDIDO = 100;   // o limite da função do banco

const soDigitos = (t: unknown): string => String(t ?? '').replace(/\D/g, '');
const semAcento = (t: unknown): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** AAAA-MM-DD que existe de verdade (31/02 não vale); datas como texto, nunca `new Date(texto)`. */
const dataValida = (iso: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2020;
};

// ═══ A SITUAÇÃO DO PAGAMENTO (lida da demanda do Financeiro) ═══════════════════════════════════════════════════════════════════════════════════════
/** O que o status da demanda do Financeiro diz do pagamento: concluída = paga; cancelada = o pedido morreu (pode pedir de novo); qualquer outra = ainda está com o Financeiro. */
export function situacaoDaDemanda(status: unknown): 'pago' | 'cancelado' | 'pedido' {
  const t = semAcento(status);
  if (t.startsWith('conclu')) return 'pago';
  if (t.startsWith('cancel')) return 'cancelado';
  return 'pedido';
}
/** A demanda já chegou a um fim (paga ou cancelada): não muda mais, então a atualização de minuto em minuto não precisa lê-la de novo. */
export const demandaEstaEncerrada = (status: unknown): boolean => situacaoDaDemanda(status) !== 'pedido';

export type LeituraDeDemandas = { mapa: Map<string, string>; erro: string | null };

/** Lê o status das demandas de pagamento (só id e status). Leitura recusada devolve o erro: quem chama mantém o que já sabia e a tela diz que não conseguiu ler. */
export async function lerDemandasDePagamento(ids: string[]): Promise<LeituraDeDemandas> {
  const mapa = new Map<string, string>();
  const lista = [...new Set(ids.filter(Boolean))];
  try {
    for (let i = 0; i < lista.length; i += 60) {
      const { data, error } = await supabase.from('demandas_avulsas').select('id,status').in('id', lista.slice(i, i + 60));
      if (error) return { mapa: new Map(), erro: explicarErroDoBanco(error) };
      for (const d of data || []) mapa.set(d.id, String(d.status ?? ''));
    }
    return { mapa, erro: null };
  } catch (e: any) {
    return { mapa: new Map(), erro: explicarErroDoBanco(e) };
  }
}

/**
 * Põe em cada serviço que tem pedido de pagamento a situação dele (campo derivado). `demandas` = o que a tela sabe das demandas (null = nunca leu nada).
 * Demanda que a leitura devolveu sem a linha (apagada) vale como "nenhum": o banco também deixa pedir de novo. Sem leitura nenhuma e com erro, vale 'desconhecido'.
 * Serviço sem pedido sai igual (o mesmo objeto), e a lista inteira sai igual quando nenhum serviço tem pedido.
 */
export function anexarPagamentos(servicos: ServicoDeTerceiro[], demandas: { mapa: Map<string, string>; erro: string | null } | null): ServicoDeTerceiro[] {
  if (!servicos.some(s => s.pagamento_demanda_id)) return servicos;
  return servicos.map(s => {
    if (!s.pagamento_demanda_id) return s;
    const status = demandas?.mapa.get(s.pagamento_demanda_id);
    let situacao: SituacaoDoPagamento;
    if (status !== undefined) { const t = situacaoDaDemanda(status); situacao = t === 'cancelado' ? 'nenhum' : t; }
    else situacao = demandas && !demandas.erro ? 'nenhum' : 'desconhecido';
    return s.pagamento_situacao === situacao ? s : { ...s, pagamento_situacao: situacao };
  });
}

// ═══ QUEM PODE PEDIR, E O PORQUÊ QUANDO NÃO PODE ═══════════════════════════════════════════════════════════════════════════════════════════════════
/** Tudo o que impede o pedido, em palavras (null = pode pedir). A mesma conta de `terceiros_pagamento_pedir`; o banco confere de novo. */
export function motivoQueNaoPedePagamento(servicos: ServicoDeTerceiro[], u: any, tipoDe: (s: ServicoDeTerceiro) => any): string | null {
  if (!servicos.length) return 'Escolha os serviços.';
  if (servicos.length > MAXIMO_POR_PEDIDO) return `Peça o pagamento de no máximo ${MAXIMO_POR_PEDIDO} serviços de uma vez.`;
  const nao = servicos.find(s => s.status !== 'realizado');
  if (nao) return servicos.length === 1 ? 'Só se pede o pagamento do que já foi dado como realizado.' : `O serviço ${nao.numero} ainda não foi dado como realizado: só se pede o pagamento do que foi feito.`;
  const semValor = servicos.find(s => !(Number(s.valor_final) > 0));
  if (semValor) return servicos.length === 1 ? 'Este serviço não tem valor final maior que zero: não há o que pagar.' : `O serviço ${semValor.numero} não tem valor final maior que zero: não há o que pagar.`;
  if (servicos.some(s => !s.prestador_id)) return 'Há serviço sem prestador: o pagamento é do prestador que fez o serviço.';
  if (new Set(servicos.map(s => s.prestador_id)).size > 1) return 'Um pedido de pagamento é de um prestador só: marque só os serviços do mesmo prestador.';
  const pedido = servicos.find(s => situacaoDoPagamento(s) === 'pedido');
  if (pedido) return `O pagamento do serviço ${pedido.numero} já foi pedido ao Financeiro (a demanda ainda está aberta).`;
  const pago = servicos.find(s => situacaoDoPagamento(s) === 'pago');
  if (pago) return `O pagamento do serviço ${pago.numero} já foi feito (o Financeiro concluiu a demanda).`;
  if (servicos.some(s => situacaoDoPagamento(s) === 'desconhecido')) return 'Não foi possível conferir se o pagamento já foi pedido (a leitura das demandas do Financeiro falhou). Atualize a tela antes de pedir.';
  const semPermissao = servicos.find(s => !(podeMexerNoServico(u, s, tipoDe(s)) || (s.ordem_id && podeMexerNaOrdem(u))));
  if (semPermissao) return 'Só quem pediu o serviço, a Adaptação (nos tipos dela), os gerentes e o Admin pedem o pagamento.';
  return null;
}

/** Os serviços entre os dados que podem pedir pagamento agora (para o botão de uma janela que mostra vários). */
export const servicosQuePedemPagamento = (servicos: ServicoDeTerceiro[], u: any, tipoDe: (s: ServicoDeTerceiro) => any): ServicoDeTerceiro[] =>
  servicos.filter(s => motivoQueNaoPedePagamento([s], u, tipoDe) === null);

/** Soma dos valores finais (para a janela mostrar, a quem vê valores, o que o banco vai somar). */
export const somaDosValoresFinais = (servicos: ServicoDeTerceiro[]): number => Math.round(servicos.reduce((t, s) => t + Number(s.valor_final || 0), 0) * 100) / 100;

// ═══ O FORMULÁRIO DO PEDIDO ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type FormDoPagamento = { favorecido: string; documento: string; tipo: string; forma: string; vencimento: string; dados_pagamento: string; observacao: string };

/** O pedido já nasce com o que o cadastro do prestador sabe: o favorecido (razão social, se houver) e o CNPJ ou CPF. O resto quem pede completa. */
export function formInicialDoPagamento(prestador: Pick<PrestadorDeTerceiros, 'nome' | 'razao_social' | 'cnpj_cpf'> | null | undefined): FormDoPagamento {
  return {
    favorecido: String(prestador?.razao_social || prestador?.nome || ''), documento: soDigitos(prestador?.cnpj_cpf), tipo: 'servico', forma: 'pix', vencimento: '', dados_pagamento: '', observacao: '',
  };
}

/** O que falta no pedido (null = pode gravar). O vencimento é obrigatório aqui (suposição minha, a confirmar: o banco aceitaria sem, mas o Financeiro precisa dele para programar o pagamento). */
export function erroDoPedidoDePagamento(f: FormDoPagamento): string | null {
  if (!String(f.favorecido || '').trim()) return 'Diga quem vai receber o pagamento (o favorecido).';
  const doc = soDigitos(f.documento);
  if (doc && doc.length !== 11 && doc.length !== 14) return 'O CPF tem 11 números e o CNPJ tem 14. Confira o documento ou deixe em branco.';
  if (!String(f.vencimento || '').trim()) return 'Informe o vencimento: é com ele que o Financeiro programa o pagamento.';
  if (!dataValida(f.vencimento)) return 'O vencimento não é uma data válida.';
  if (!TIPOS_DE_CUSTO_DO_PEDIDO.includes(f.tipo)) return 'Escolha o tipo de custo.';
  if (!FORMAS_DO_PEDIDO.includes(f.forma)) return 'Escolha a forma de pagamento.';
  return null;
}

/** O que vai ao banco: SEM valor (quem soma é o banco, pelos serviços), com o documento só em dígitos e os textos aparados. */
export function pagamentoParaOBanco(f: FormDoPagamento): Record<string, any> {
  return {
    favorecido: String(f.favorecido || '').trim(), documento: soDigitos(f.documento) || null, tipo: f.tipo, forma: f.forma, vencimento: String(f.vencimento || '').trim() || null,
    dados_pagamento: String(f.dados_pagamento || '').trim() || null, observacao: String(f.observacao || '').trim() || null,
  };
}

// ═══ A GRAVAÇÃO ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type PagamentoPedido = { demanda_id: string; total: number; quantidade: number; servicos: ServicoDeTerceiro[] };

/**
 * Pede o pagamento dos serviços: o banco confere tudo (realizado, valor final, um prestador só, quem pode, sem pedido aberto), soma, abre a demanda no Financeiro e liga os serviços a ela.
 * A resposta traz a demanda, o total e as linhas gravadas; se faltar um dos serviços pedidos, a gravação não foi confirmada e a tela diz isso (nunca "deu certo" sem ter dado).
 */
export async function pedirPagamento(ids: string[], f: FormDoPagamento): Promise<RespostaDoBanco<PagamentoPedido>> {
  const r = await chamar<any>('terceiros_pagamento_pedir', { p_ids: ids, p_pagamento: pagamentoParaOBanco(f) });
  if (!r.ok) return falhou<PagamentoPedido>(r.erro, r.codigo);
  const d = r.dados;
  const linhas: any[] = Array.isArray(d?.servicos) ? d.servicos : [];
  const achados = new Set(linhas.map(l => l?.id));
  if (!d?.demanda_id || !ids.length || !ids.every(id => achados.has(id))) {
    return falhou<PagamentoPedido>('O banco não confirmou o pedido de pagamento de todos os serviços. Atualize a tela e confira no Financeiro antes de pedir de novo.');
  }
  return deu({ demanda_id: String(d.demanda_id), total: Number(d.total), quantidade: Number(d.quantidade), servicos: linhas as ServicoDeTerceiro[] });
}

/** A frase de sucesso: quantos serviços, quanto (só para quem vê valores) e para onde foi. */
export function fraseDoPagamentoPedido(p: PagamentoPedido, verValor: boolean): string {
  const quem = p.quantidade === 1 ? 'do serviço' : `dos ${p.quantidade} serviços`;
  return `Pagamento ${quem} pedido ao Financeiro${verValor ? ` (total ${reaisDoServico(p.total)})` : ''}. A demanda está na aba Demandas do Financeiro; aqui o serviço mostra "Pagamento pedido" e, quando o Financeiro concluir, "Pago".`;
}
