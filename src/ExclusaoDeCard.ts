// @ts-nocheck
// Excluir um card do Comercial (CRM) ou uma Licitação — quem pode e o que impede.
// Pedido do usuário em 07/10/2026: só Admin e gerente; o gerente só do próprio setor (Gerente Comercial no Comercial, Gerente de Licitações nas Licitações).
// Confere o perfil REAL do cadastro — não o "perfil com poderes" (utils/permissoes.ts perfilComPoderes), que dá a toda a equipe do setor os poderes do gerente.
// Decidido com o usuário: com OP lançada ou formação de preços vinculada o card NÃO é excluído (bloqueia e diz o que está ligado). Acrescentei dois bloqueios pelo mesmo motivo
// (apagar levaria junto dado de faturamento/execução): OS lançada a partir do card e vendas/adesões registradas nele.
import { supabase } from './supabaseClient';

export function podeExcluirCardComercial(usuario: any): boolean {
  const p = String(usuario?.perfil || '');
  return p === 'Admin' || p === 'Gerente Comercial';
}
export function podeExcluirLicitacao(usuario: any): boolean {
  const p = String(usuario?.perfil || '');
  return p === 'Admin' || p === 'Gerente de Licitações';
}

/** O que está ligado ao card e impede a exclusão. `erro` preenchido = não foi possível conferir (nesse caso NÃO se exclui). */
export async function bloqueiosDeExclusao(tipo: 'crm' | 'licitacao', id: string): Promise<{ erro?: string; motivos: string[] }> {
  const motivos: string[] = [];
  const falhas: string[] = [];
  const ler = async (q: any, aoLer: (linhas: any[]) => void) => {
    const { data, error } = await q;
    if (error) { falhas.push(error.message); return; }
    aoLer(data || []);
  };
  const lista = (xs: string[]) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? ` e mais ${xs.length - 5}` : '');
  const consultas: Promise<void>[] = [];
  if (tipo === 'crm') {
    consultas.push(ler(supabase.from('oples').select('opl').eq('crm_oportunidade_id', id), l => { if (l.length) motivos.push(`OP lançada a partir do card: ${lista(l.map(x => x.opl || 'sem número'))}`); }));
    consultas.push(ler(supabase.from('sac_ordens_servico').select('numero_os').eq('crm_oportunidade_id', id), l => { if (l.length) motivos.push(`OS lançada a partir do card: ${lista(l.map(x => x.numero_os || 'sem número'))}`); }));
    consultas.push(ler(supabase.from('crm_vendas').select('id').eq('oportunidade_id', id), l => { if (l.length) motivos.push(`${l.length} venda(s)/adesão(ões) registrada(s) no card`); }));
  } else {
    consultas.push(ler(supabase.from('licitacao_pedidos').select('opl').eq('licitacao_id', id).not('opl', 'is', null), l => { if (l.length) motivos.push(`OP lançada a partir dos pedidos: ${lista([...new Set(l.map(x => x.opl))])}`); }));
  }
  // formação de preços ligada (pela tabela de vínculos e pela coluna direta, que as formações antigas usam)
  const nVinc = { n: 0 };
  consultas.push(ler(supabase.from('cotacoes_precos_vinculos').select('cotacao_id').eq('tipo', tipo).eq('processo_id', id), l => { nVinc.n += l.length; }));
  consultas.push(ler(supabase.from('cotacoes_precos').select('id').eq(tipo === 'crm' ? 'crm_oportunidade_id' : 'licitacao_id', id), l => { nVinc.n = Math.max(nVinc.n, l.length); }));
  await Promise.all(consultas);
  if (nVinc.n > 0) motivos.push(`${nVinc.n} formação(ões) de preços vinculada(s)`);
  if (falhas.length) return { erro: falhas[0], motivos };
  return { motivos };
}
