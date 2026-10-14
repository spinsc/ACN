// Departamentos fixos do RH (pedido do usuário em 14/10/2026 — PLANO_RH_DEPARTAMENTOS_ENVIOS.md, fatias 1 e 2).
// Antes, "departamento" era um texto livre em rh_funcionarios (PRODUCAO, PRODUÇÃO, até nome de empresa de prestador). Agora há uma lista (rh_departamentos)
// e cada pessoa pode estar em mais de um (rh_funcionario_departamentos). A coluna de texto antiga continua no banco, como histórico, e não é mais gravada.
// A lista "Departamentos (Compras)" do Admin é OUTRA coisa (aprovação de pedido de compra) e não tem relação com esta.
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';

export type DepartamentoRH = { id: string; nome: string; nome_norm: string; ordem: number | null };
export type VinculoDepartamento = { funcionario_id: string; departamento_id: string };

/** Chave de comparação: sem acento, minúscula, espaços únicos — PRODUCAO, PRODUÇÃO e " producao " são o mesmo departamento. */
export const chaveDepto = (nome: string | null | undefined): string => normalizarBusca(nome || '').replace(/\s+/g, ' ').trim();

/** Lê a lista e os vínculos. Se qualquer leitura falhar, devolve o motivo (a tela mostra o aviso em vez de uma lista vazia). */
export async function lerDepartamentos(): Promise<{ departamentos: DepartamentoRH[]; vinculos: VinculoDepartamento[]; erro: string | null }> {
  const [d, v] = await Promise.all([
    supabase.from('rh_departamentos').select('id,nome,nome_norm,ordem').order('ordem', { ascending: true, nullsFirst: false }).order('nome'),
    supabase.from('rh_funcionario_departamentos').select('funcionario_id,departamento_id'),
  ]);
  const erro = d.error?.message || v.error?.message || (!d.data || !v.data ? 'sem resposta' : null);
  return { departamentos: d.data || [], vinculos: v.data || [], erro };
}

/** Acrescenta a cada pessoa os departamentos dela: `departamentos` (nomes, na ordem da lista) e `departamento_ids`. */
export function anexarDepartamentos<T extends { id: string }>(funcs: T[], departamentos: DepartamentoRH[], vinculos: VinculoDepartamento[]): (T & { departamentos: string[]; departamento_ids: string[] })[] {
  const ordem = new Map(departamentos.map((d, i) => [d.id, i]));
  const nomes = new Map(departamentos.map(d => [d.id, d.nome]));
  const porPessoa = new Map<string, string[]>();
  for (const v of vinculos) { if (!nomes.has(v.departamento_id)) continue; (porPessoa.get(v.funcionario_id) || porPessoa.set(v.funcionario_id, []).get(v.funcionario_id)!).push(v.departamento_id); }
  return funcs.map(f => {
    const ids = (porPessoa.get(f.id) || []).sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));
    return { ...f, departamento_ids: ids, departamentos: ids.map(i => nomes.get(i) as string) };
  });
}

/** O que mostrar onde antes aparecia o campo de texto: os departamentos, e — só enquanto a pessoa não tem nenhum — o texto antigo. */
export const departamentosTexto = (f: any, separador = ' · '): string =>
  (Array.isArray(f?.departamentos) && f.departamentos.length ? f.departamentos.join(separador) : (f?.departamento || '')) as string;

/** Grava os departamentos de uma pessoa: tira os que saíram e acrescenta os novos (sem apagar tudo e refazer). Devolve o motivo do erro, ou null. */
export async function salvarVinculosDaPessoa(funcionarioId: string, departamentoIds: string[]): Promise<string | null> {
  const { data: atuais, error: erroLer } = await supabase.from('rh_funcionario_departamentos').select('departamento_id').eq('funcionario_id', funcionarioId);
  if (erroLer || !atuais) return erroLer?.message || 'sem resposta';
  const tem = new Set(atuais.map((a: any) => a.departamento_id));
  const quer = new Set(departamentoIds);
  const sai = [...tem].filter(i => !quer.has(i));
  const entra = [...quer].filter(i => !tem.has(i));
  if (sai.length) {
    const { error } = await supabase.from('rh_funcionario_departamentos').delete().eq('funcionario_id', funcionarioId).in('departamento_id', sai);
    if (error) return error.message;
  }
  if (entra.length) {
    const { error } = await supabase.from('rh_funcionario_departamentos').insert(entra.map(departamento_id => ({ funcionario_id: funcionarioId, departamento_id })));
    if (error) return error.message;
  }
  return null;
}

/** Cria um departamento. Nome parecido com um que já existe (acento, maiúscula, espaço) é recusado, para não nascer PRODUCAO ao lado de PRODUÇÃO. */
export async function criarDepartamento(nomeDigitado: string, existentes: DepartamentoRH[], usuarioNome?: string): Promise<{ erro?: string; departamento?: DepartamentoRH }> {
  const nome = String(nomeDigitado || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  if (!nome) return { erro: 'Escreva o nome do departamento.' };
  const igual = existentes.find(d => d.nome_norm === chaveDepto(nome));
  if (igual) return { erro: `Já existe o departamento "${igual.nome}".` };
  const ordem = existentes.reduce((m, d) => Math.max(m, d.ordem || 0), 0) + 1;
  const { data, error } = await supabase.from('rh_departamentos').insert({ nome, nome_norm: chaveDepto(nome), ordem, criado_por: usuarioNome || null }).select('id,nome,nome_norm,ordem').single();
  if (error || !data) return { erro: error?.message || 'sem resposta' };
  return { departamento: data as DepartamentoRH };
}

/** Exclui o departamento (os vínculos das pessoas saem junto, pelo banco). Devolve o motivo do erro, ou null. */
export async function excluirDepartamento(id: string): Promise<string | null> {
  const { error } = await supabase.from('rh_departamentos').delete().eq('id', id);
  return error ? error.message : null;
}

// ── Responsáveis por setor (fatia 2, 14/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Nos campos de responsável de cada tela, o ColaboradorSelect mostra só as pessoas dos departamentos da tela (+ Admin e gerentes + o valor já gravado).
// A tabela "tela → departamento" foi confirmada pelo usuário em 14/10/2026; SAC, Horas Extras e os campos configuráveis do cadastro de OP ficam sem filtro.
export const DEPTOS = {
  engenharia: ['ENGENHARIA'],
  producao: ['PRODUÇÃO'],
  serralheria: ['SERRALHERIA'],
  chicotes: ['CHICOTES'],
  compras: ['COMPRAS'],
  financeiro: ['FINANCEIRO/RH', 'ADMINISTRATIVO'],
  comercial: ['COMERCIAL', 'LICITAÇÕES'],   // o CRM, os contatos e a Nova OP atendem vendas diretas e licitações
};

/** Departamentos de um setor de demanda (Engenharia, Serralheria, Telecom…). Telecom e Laboratório não têm departamento próprio: usam RÁDIO. Setor desconhecido = sem filtro. */
export function departamentosDoSetor(setor: string | null | undefined): string[] | undefined {
  const k = chaveDepto(setor);
  if (!k) return undefined;
  if (k === 'telecom' || k === 'laboratorio') return ['RÁDIO'];
  if (k === 'chicote') return DEPTOS.chicotes;
  if (k === 'licitacao' || k === 'licitacoes') return ['LICITAÇÕES'];
  return [String(setor).trim().toLocaleUpperCase('pt-BR')];   // mesmo nome do departamento (ENGENHARIA, COMPRAS, ALMOXARIFADO, PCP…); se não existir, o seletor não filtra
}
