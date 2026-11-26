// @ts-nocheck
// O dinheiro do frete e do pedido de faturamento mora em tabelas à parte desde a onda V4 do "ver valores no banco"
// (decidido com o usuário em 25/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 11): `pcp_fretes_valores` (valor do frete e valor da nota),
// `pcp_cotacoes_fretes_valores` (valor de cada cotação de transportadora), `pcp_aprovacoes_fretes_valores` (valor no momento da aprovação)
// e `pcp_pedidos_faturamento_valores` (valor a pagar). O banco só as entrega a quem tem a caixa "Ver valores" e ao Admin.
// Tela que mostra ou calcula com esses valores lê a linha de sempre e chama o `anexar…` da sua tabela, que devolve a linha com o(s) campo(s) de volta:
// linha sem registro na tabela nova (valor nunca informado, ou pessoa sem direito) volta com o campo em NULO, nunca em zero.
// Só mexe no campo que a linha TEM na leitura (consulta que não pediu `valor`, nada acrescenta).
// Leitura recusada devolve `erro` (nunca "sem valores"): quem soma ou mostra dinheiro avisa em vez de contar com zero.
//
// V4b (26/11/2026): só as telas que LEEM passaram por aqui. As colunas antigas ainda guardam o dinheiro até a V4d; enquanto isso, quem grava
// a partir de uma leitura (escolher a cotação vencedora, por exemplo) confere se o valor veio, para nunca gravar nulo por cima do valor de verdade (`valorDaCotacaoOuNulo`).
import { supabase } from './supabaseClient';

/** Frase para quem tentou gravar a partir de um valor que a sua conta não vê (ou cuja leitura falhou). */
export const AVISO_SEM_VALOR_DO_FRETE = 'Esta ação usa o valor da cotação, e a sua conta não o vê (ou a leitura falhou). Peça a quem tem a permissão "Ver valores".';

type Tabela = { tabela: string; chave: string; campos: string[] };
const FRETE: Tabela = { tabela: 'pcp_fretes_valores', chave: 'frete_id', campos: ['valor_frete', 'valor_nota'] };
const COTACAO: Tabela = { tabela: 'pcp_cotacoes_fretes_valores', chave: 'cotacao_id', campos: ['valor'] };
const APROVACAO: Tabela = { tabela: 'pcp_aprovacoes_fretes_valores', chave: 'aprovacao_id', campos: ['valor_no_momento'] };
const FATURAMENTO: Tabela = { tabela: 'pcp_pedidos_faturamento_valores', chave: 'faturamento_id', campos: ['valor'] };

/** Lê as linhas de valor de uma lista de registros (por id), em blocos. `todos` lê a tabela inteira de uma vez (listas completas). */
async function lerLinhas(t: Tabela, ids: string[], todos = false) {
  const mapa = new Map<string, any>();
  const colunas = [t.chave, ...t.campos].join(',');
  if (todos) {
    const { data, error } = await supabase.from(t.tabela).select(colunas).limit(10000);
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l[t.chave]), l);
    return { mapa, erro: '' };
  }
  const unicos = [...new Set((ids || []).filter(Boolean).map(String))];
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from(t.tabela).select(colunas).in(t.chave, unicos.slice(i, i + 150));
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l[t.chave]), l);
  }
  return { mapa, erro: '' };
}

/** Recoloca os campos de dinheiro numa linha, a partir da linha da tabela nova (indefinida = pessoa sem direito ou valor nunca informado → nulo). */
function comValores(t: Tabela, linha: any, guardada: any) {
  if (!linha) return linha;
  const novo = { ...linha };
  for (const c of t.campos) if (c in linha) novo[c] = guardada?.[c] ?? null;
  return novo;
}

async function anexar(t: Tabela, lista: any[], todos = false) {
  const linhas = lista || [];
  const temCampo = linhas.some(l => l && t.campos.some(c => c in l));
  if (!linhas.length || !temCampo) return { linhas, erro: '' };
  const { mapa, erro } = await lerLinhas(t, linhas.map(l => l?.id), todos);
  if (erro) return { linhas, erro };
  return { linhas: linhas.map(l => (l?.id ? comValores(t, l, mapa.get(String(l.id))) : l)), erro: '' };
}

/** Fretes (`pcp_fretes`): `valor_frete` e `valor_nota`. */
export async function anexarValoresDosFretes(fretes: any[]) {
  const r = await anexar(FRETE, fretes);
  return { fretes: r.linhas, erro: r.erro };
}

/** Um frete (ou nenhum). */
export async function anexarValoresDoFrete(frete: any) {
  if (!frete) return { frete, erro: '' };
  const r = await anexarValoresDosFretes([frete]);
  return { frete: r.fretes[0], erro: r.erro };
}

/** Cotações de transportadora (`pcp_cotacoes_fretes`): `valor`. */
export async function anexarValoresDasCotacoesDeFrete(cotacoes: any[]) {
  const r = await anexar(COTACAO, cotacoes);
  return { cotacoes: r.linhas, erro: r.erro };
}

/** Aprovações de frete (`pcp_aprovacoes_fretes`): `valor_no_momento`. */
export async function anexarValoresDasAprovacoesDeFrete(aprovacoes: any[]) {
  const r = await anexar(APROVACAO, aprovacoes);
  return { aprovacoes: r.linhas, erro: r.erro };
}

/** Pedidos de faturamento (`pcp_pedidos_faturamento`): `valor`. `todos` lê a tabela de valores inteira (uma consulta, para listas completas). */
export async function anexarValoresDoFaturamento(linhas: any[], todos = false) {
  const r = await anexar(FATURAMENTO, linhas, todos);
  return { faturamentos: r.linhas, erro: r.erro };
}

/** O valor de uma cotação de frete para quem vai GRAVAR a partir dele; `null` se a conta não o vê (quem chama para e mostra `AVISO_SEM_VALOR_DO_FRETE`). */
export function valorDaCotacaoOuNulo(cotacao: any): number | null {
  const v = cotacao?.valor;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
