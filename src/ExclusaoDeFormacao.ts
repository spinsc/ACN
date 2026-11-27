// Excluir uma formação de preços — quem pode, o que impede, o que sai junto e a gravação (pedido do usuário em 17/11/2026).
// Decidido com o usuário: a formação NÃO é apagada (fica guardada, marcada como excluída com quem, quando e o motivo, e some de todas as telas); a pessoa escolhe
// na hora se exclui SÓ A VERSÃO aberta ou a FORMAÇÃO INTEIRA; pode excluir quem criou, Admin e gerentes; só barra o que já virou compromisso (OP ligada, aprovada
// na aprovação de cotações ou ligada a uma ordem de compra do Compras). Card do CRM/licitação e proposta salva não barram: a janela avisa o que sai junto.
// As regras de verdade moram no banco (supabase/sql/formacao_excluir.sql: formacao_excluir_conferir, formacao_excluir, formacoes_excluidas), que não confia na tela:
// a conferência do perfil, do autor e dos bloqueios precisa valer mesmo para uma janela antiga. Aqui só se pergunta, se mostra e se grava.
import { supabase } from './supabaseClient';
import { ehAdminOuGerente } from './utils/permissoes';
import { explicarErroDoBanco } from './ErroDoBanco';
import { raizDaCotacao } from './FormacaoFamilia';

export type Escopo = 'versao' | 'formacao';
export type Conferencia = { erro?: string; id?: string; nome?: string; versao?: number; n_versoes?: number; escopo?: Escopo; versoes?: string; raiz_id?: string; criado_por?: string; bloqueios: string[]; desligados: string[]; avisos: string[] };

/** O motivo vale com 5 letras ou mais (o banco confere do mesmo jeito). */
export function motivoValido(motivo: any): boolean {
  return String(motivo ?? '').trim().length >= 5;
}

/** Quem criou: o nome ou o e-mail do usuário igual ao `criado_por` da formação (sem diferenciar maiúscula). */
export function ehAutorDa(usuario: any, criadoPor: any): boolean {
  const autor = String(criadoPor ?? '').trim().toLowerCase();
  if (!autor) return false;
  const nome = String(usuario?.nome ?? '').trim().toLowerCase();
  const email = String(usuario?.email ?? '').trim().toLowerCase();
  return autor === nome || autor === email;
}

/**
 * O que a pessoa pode excluir, dado as versões da formação (cada linha com `id`, `versao_raiz_id` e `criado_por`).
 * Admin e gerentes: tudo. Quem criou: a versão que criou; a formação inteira só se criou a v1 (a raiz), porque excluir tudo leva as versões dos outros.
 * Formação de uma versão só: a versão É a formação, então vale o autor dela. O banco confere de novo.
 */
export function escoposPermitidos(usuario: any, familia: any[], id: string): { versao: boolean; formacao: boolean } {
  const eu = (familia || []).find((l: any) => String(l.id) === String(id));
  if (!eu) return { versao: false, formacao: false };
  // 24/11/2026: a caixa "Excluir qualquer formação" vale como a direção (formacao_excluir confere a mesma marca no banco)
  if (ehAdminOuGerente(usuario) || usuario?.pode_excluir_formacao === true) return { versao: true, formacao: true };
  const raiz = familia.find((l: any) => String(l.id) === String(raizDaCotacao(eu))) || eu;
  const formacao = ehAutorDa(usuario, raiz.criado_por);
  if (familia.length <= 1) return { versao: formacao, formacao };
  return { versao: ehAutorDa(usuario, eu.criado_por), formacao };
}

/** Aparece o botão "Excluir"? (qualquer um dos dois escopos já basta; a janela mostra o que vale para cada um.) */
export function podeExcluirFormacao(usuario: any, familia: any[], id: string): boolean {
  const e = escoposPermitidos(usuario, familia, id);
  return e.versao || e.formacao;
}

/** As versões vivas da família da formação (a leitura já esconde as excluídas). Leitura recusada devolve `erro`, nunca lista vazia. */
export async function lerFamiliaDaFormacao(id: string, raizId?: string | null): Promise<{ lista: any[]; erro?: string }> {
  let raiz = raizId;
  if (!raiz) {
    const { data: eu, error } = await supabase.from('cotacoes_precos').select('id,versao_raiz_id').eq('id', id).maybeSingle();
    if (error) return { lista: [], erro: error.message };
    if (!eu) return { lista: [], erro: 'formação não encontrada (pode já ter sido excluída)' };
    raiz = raizDaCotacao(eu);
  }
  const { data, error } = await supabase.from('cotacoes_precos')
    .select('id,nome,versao,versao_raiz_id,criado_por,criado_em,atualizado_em,numero_cotacao,vencedora,status')
    .or(`id.eq.${raiz},versao_raiz_id.eq.${raiz}`).order('versao', { ascending: true });
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [] };
}

/** O que impede, o que sai junto e o que fica como está. Leitura recusada devolve `erro` (nunca "nada impede"). */
export async function conferirExclusaoDeFormacao(id: string, escopo: Escopo): Promise<Conferencia> {
  const { data, error } = await supabase.rpc('formacao_excluir_conferir', { p_id: id, p_escopo: escopo });
  if (error) return { erro: explicarErroDoBanco(error), bloqueios: [], desligados: [], avisos: [] };
  if (data?.erro) return { erro: data.erro, bloqueios: [], desligados: [], avisos: [] };
  return { ...data, bloqueios: data.bloqueios || [], desligados: data.desligados || [], avisos: data.avisos || [] };
}

/** Grava a exclusão. Só vale se a formação ainda é a que a janela viu (`atualizadoEm`); tudo ou nada. */
export async function excluirFormacao(p: { id: string; escopo: Escopo; motivo: string; atualizadoEm?: string | null }): Promise<{ erro?: string; resultado?: any }> {
  const { data, error } = await supabase.rpc('formacao_excluir', {
    p_id: p.id, p_escopo: p.escopo, p_motivo: String(p.motivo).trim(), p_atualizado_em: p.atualizadoEm || null,
  });
  if (error) return { erro: explicarErroDoBanco(error) };
  return { resultado: data };
}

/** As formações excluídas, só para Admin e gerentes (o banco confere). Leitura recusada devolve `erro`. */
export async function lerFormacoesExcluidas(): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.rpc('formacoes_excluidas');
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  return { lista: data || [] };
}

/** "v2" ou "v1, v2 e v3" — para as frases da janela. */
export function frasePorExtenso(escopo: Escopo, versao: number, versoes: string): string {
  if (escopo === 'versao') return `só a v${versao || 1}`;
  return versoes && versoes.includes(',') ? `a formação inteira (${versoes})` : 'a formação';
}
