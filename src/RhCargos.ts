// Cargos do RH (pedido do usuário em 16/11/2026): a mesma ideia dos departamentos (RhDepartamentos.ts) — uma lista cadastrada pelo RH e, na ficha, cada pessoa escolhe um ou mais.
// Antes, "cargo" era um texto livre em rh_funcionarios.cargo (60 de 61 pessoas tinham um, com grafias soltas).
// A coluna de texto continua sendo a que as visões (rh_funcionarios_basico), os relatórios, a comissão e o seletor de responsáveis leem: ela agora guarda os NOMES dos cargos
// escolhidos, juntos por " / ", sempre derivados da lista. Assim nenhuma tela antiga precisou mudar e a lista é a única fonte do que se escreve nela.
import { supabase } from './supabaseClient';
import { chaveDepto } from './RhDepartamentos';

export type CargoRH = { id: string; nome: string; nome_norm: string; ordem: number | null };
export type VinculoCargo = { funcionario_id: string; cargo_id: string };

/** Mesma regra de comparação dos departamentos: sem acento, minúscula, espaços únicos. */
export const chaveCargo = chaveDepto;

/** O texto que vai para rh_funcionarios.cargo: os nomes dos cargos, na ordem da lista, separados por " / ". */
export const textoDosCargos = (nomes: string[]): string => nomes.join(' / ');

/** Lê a lista e os vínculos. Se qualquer leitura falhar, devolve o motivo (a tela mostra o aviso em vez de uma lista vazia). */
export async function lerCargos(): Promise<{ cargos: CargoRH[]; vinculos: VinculoCargo[]; erro: string | null }> {
  const [c, v] = await Promise.all([
    supabase.from('rh_cargos').select('id,nome,nome_norm,ordem').order('ordem', { ascending: true, nullsFirst: false }).order('nome'),
    supabase.from('rh_funcionario_cargos').select('funcionario_id,cargo_id'),
  ]);
  const erro = c.error?.message || v.error?.message || (!c.data || !v.data ? 'sem resposta' : null);
  return { cargos: c.data || [], vinculos: v.data || [], erro };
}

/** Acrescenta a cada pessoa os cargos dela: `cargos` (nomes, na ordem da lista) e `cargo_ids`. */
export function anexarCargos<T extends { id: string }>(funcs: T[], cargos: CargoRH[], vinculos: VinculoCargo[]): (T & { cargos: string[]; cargo_ids: string[] })[] {
  const ordem = new Map(cargos.map((c, i) => [c.id, i]));
  const nomes = new Map(cargos.map(c => [c.id, c.nome]));
  const porPessoa = new Map<string, string[]>();
  for (const v of vinculos) { if (!nomes.has(v.cargo_id)) continue; (porPessoa.get(v.funcionario_id) || porPessoa.set(v.funcionario_id, []).get(v.funcionario_id)!).push(v.cargo_id); }
  return funcs.map(f => {
    const ids = (porPessoa.get(f.id) || []).sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));
    return { ...f, cargo_ids: ids, cargos: ids.map(i => nomes.get(i) as string) };
  });
}

/** Grava os cargos de uma pessoa (tira os que saíram, acrescenta os novos) e o texto derivado em rh_funcionarios.cargo. Devolve o motivo do erro, ou null. */
export async function salvarCargosDaPessoa(funcionarioId: string, cargoIds: string[], cargos: CargoRH[]): Promise<string | null> {
  const { data: atuais, error: erroLer } = await supabase.from('rh_funcionario_cargos').select('cargo_id').eq('funcionario_id', funcionarioId);
  if (erroLer || !atuais) return erroLer?.message || 'sem resposta';
  const tem = new Set(atuais.map((a: any) => a.cargo_id));
  const quer = new Set(cargoIds);
  const sai = [...tem].filter(i => !quer.has(i));
  const entra = [...quer].filter(i => !tem.has(i));
  if (sai.length) {
    const { error } = await supabase.from('rh_funcionario_cargos').delete().eq('funcionario_id', funcionarioId).in('cargo_id', sai);
    if (error) return error.message;
  }
  if (entra.length) {
    const { error } = await supabase.from('rh_funcionario_cargos').insert(entra.map(cargo_id => ({ funcionario_id: funcionarioId, cargo_id })));
    if (error) return error.message;
  }
  const nomes = cargos.filter(c => quer.has(c.id)).map(c => c.nome);
  const { data, error } = await supabase.from('rh_funcionarios').update({ cargo: textoDosCargos(nomes) }).eq('id', funcionarioId).select('id');
  if (error) return error.message;
  if (!data?.length) return 'o cadastro não foi atualizado';   // o banco responde "ok, 0 linhas" a uma gravação negada
  return null;
}

/** Cria um cargo. Nome parecido com um que já existe (acento, maiúscula, espaço) é recusado. */
export async function criarCargo(nomeDigitado: string, existentes: CargoRH[], usuarioNome?: string): Promise<{ erro?: string; cargo?: CargoRH }> {
  const nome = String(nomeDigitado || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  if (!nome) return { erro: 'Escreva o nome do cargo.' };
  const igual = existentes.find(c => c.nome_norm === chaveCargo(nome));
  if (igual) return { erro: `Já existe o cargo "${igual.nome}".` };
  const ordem = existentes.reduce((m, c) => Math.max(m, c.ordem || 0), 0) + 1;
  const { data, error } = await supabase.from('rh_cargos').insert({ nome, nome_norm: chaveCargo(nome), ordem, criado_por: usuarioNome || null }).select('id,nome,nome_norm,ordem').single();
  if (error || !data) return { erro: error?.message || 'sem resposta' };
  return { cargo: data as CargoRH };
}

/**
 * Exclui o cargo: os vínculos saem junto (pelo banco) e o texto de cargo de cada pessoa que o tinha é refeito com o que sobrou.
 * `pessoas` = quem tem o cargo, com os cargos que já tinha (`cargos`, nomes). Devolve o motivo do erro, ou null.
 */
export async function excluirCargo(cargo: CargoRH, pessoas: { id: string; cargos: string[] }[]): Promise<string | null> {
  const { error } = await supabase.from('rh_cargos').delete().eq('id', cargo.id);
  if (error) return error.message;
  const falhas: string[] = [];
  for (const p of pessoas) {
    const resto = (p.cargos || []).filter(n => n !== cargo.nome);
    const { error: e } = await supabase.from('rh_funcionarios').update({ cargo: textoDosCargos(resto) }).eq('id', p.id);
    if (e) falhas.push(e.message);
  }
  return falhas.length ? `o cargo saiu da lista, mas o texto de ${falhas.length} cadastro(s) não foi refeito (${falhas[0]})` : null;
}
