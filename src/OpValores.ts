// @ts-nocheck
// Valor total e mão de obra da OP moram numa tabela à parte (`oples_valores`) desde a onda V2 do "ver valores no banco"
// (decidido com o usuário em 24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 9). O banco só a entrega a quem tem a caixa "Ver valores" e ao Admin.
// Tela que mostra ou calcula com esses valores lê a OP e chama `anexarValoresDasOps`, que devolve a OP com os três campos de volta:
// OP sem linha na tabela (valor nunca informado, ou pessoa sem direito) volta com os três em NULO, nunca em zero.
// Leitura recusada devolve `erro` (nunca "sem valores"): quem calcula comissão ou relatório avisa em vez de contar com zero.
// A mão de obra também decide ROTA (fila da Serralheria, "falta apontar equipe"): para isso as telas usam as marcas
// `tem_mo_adaptacao` e `tem_mo_serralheria` da própria OP (não são valores, todos leem), nunca o valor.
import { supabase } from './supabaseClient';

export const CAMPOS_DE_VALOR_DA_OP = ['valor_total', 'valor_mao_de_obra', 'valor_mao_de_obra_serralheria'];

/** Lê os valores de uma lista de OPs (por id). Devolve `{ mapa, erro }`. */
export async function lerValoresDasOps(ids: string[]) {
  const unicos = [...new Set((ids || []).filter(Boolean).map(String))];
  const mapa = new Map<string, any>();
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('oples_valores')
      .select('op_id,' + CAMPOS_DE_VALOR_DA_OP.join(',')).in('op_id', unicos.slice(i, i + 150));
    if (error) return { mapa, erro: error.message || 'sem resposta' };
    for (const l of data || []) mapa.set(String(l.op_id), l);
  }
  return { mapa, erro: '' };
}

/** Devolve as OPs com os três valores preenchidos pela tabela nova (nulos se não houver linha). `erro` diz se a leitura foi recusada; nesse caso as OPs voltam como vieram. */
export async function anexarValoresDasOps(ops: any[]) {
  const lista = ops || [];
  const { mapa, erro } = await lerValoresDasOps(lista.map(o => o?.id));
  if (erro) return { ops: lista, erro };
  return { ops: lista.map(o => {
    if (!o?.id) return o;
    const v = mapa.get(String(o.id));
    return { ...o, valor_total: v?.valor_total ?? null, valor_mao_de_obra: v?.valor_mao_de_obra ?? null, valor_mao_de_obra_serralheria: v?.valor_mao_de_obra_serralheria ?? null };
  }), erro: '' };
}

/** O mesmo para UMA OP (ou nenhuma). */
export async function anexarValoresDaOp(op: any) {
  if (!op) return { op, erro: '' };
  const r = await anexarValoresDasOps([op]);
  return { op: r.ops[0], erro: r.erro };
}
