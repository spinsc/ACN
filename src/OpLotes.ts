// ─────────────────────────────────────────────────────────────────────────────
// VALOR DE OP DE LOTE — um lugar só que responde "quanto vale UM veículo desta OP"
//
// OP "mãe" com vários veículos (ex.: 1560.2608/01..16, 16 carros): cada veículo
// vira um registro em `oples` (opl = "BASE" ou "BASE/NN"), mas o valor_total e o
// valor_mao_de_obra lançados são os do LOTE inteiro, repetidos iguais em todos os
// registros — não o valor unitário. Quem soma esse valor para pagar comissão tem
// de dividir pelo número de veículos, senão paga o lote inteiro por veículo.
//
// Regra nascida na Comissão de Técnicos do RH (30/09/2026) e levada para o
// relatório de Comissão Comercial na Etapa 7.25 (01/10/2026, pedido do usuário):
// antes cada tela tinha (ou não tinha) a sua conta. Só divide quando TODOS os
// veículos do lote compartilham exatamente o mesmo valor (indício claro de
// lançamento único para o lote inteiro) — se já vierem com valores distintos por
// veículo, respeita como está.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

/** "1560.2608/15" → "1560.2608": a base que une os veículos do mesmo lote. */
export const baseOplDe = (opl: any): string => String(opl || '').replace(/\/\d+$/, '');

/** Por base de OP, em quantos veículos o valor do lote deve ser dividido (só entram os lotes de fato). */
export function divisorPorBaseDeLote(todasOps: any[]): Record<string, number> {
  const gruposBase: Record<string, any[]> = {};
  (todasOps || []).forEach((o: any) => { (gruposBase[baseOplDe(o.opl)] ||= []).push(o); });
  const divisorPorBase: Record<string, number> = {};
  Object.entries(gruposBase).forEach(([base, itens]) => {
    if (itens.length <= 1) return;
    const mdoVals = new Set(itens.map((i: any) => i.valor_mao_de_obra).filter((v: any) => v != null));
    const totVals = new Set(itens.map((i: any) => i.valor_total).filter((v: any) => v != null));
    if (mdoVals.size <= 1 && totVals.size <= 1) divisorPorBase[base] = itens.length;
  });
  return divisorPorBase;
}

/** Lê a tabela inteira de OPs (só id/opl/valores, ~poucas centenas de linhas) e devolve o divisor de cada lote. */
export async function lerDivisorPorBaseDeLote(): Promise<Record<string, number>> {
  const { data } = await supabase.from('oples')
    .select('id,opl,valor_total,valor_mao_de_obra,valor_mao_de_obra_serralheria');
  return divisorPorBaseDeLote(data || []);
}
