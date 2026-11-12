// @ts-nocheck
// Excluir uma OP — quem pode, o que impede, o que é desligado e a gravação (pedido do usuário em 11/11/2026).
// Decidido com o usuário: só Admin e gerentes, sempre com motivo; a OP NÃO é apagada: fica marcada como excluída (quem, quando, motivo, etapa em que estava
// e o que foi desligado), some de todas as telas e só aparece, para leitura, na aba "OPs em aberto" do CRM/Comercial. O número da OP excluída fica reservado.
// As regras de verdade moram no banco (supabase/sql/op_excluir.sql: op_excluir_conferir, op_excluir, ops_excluidas_para_o_comercial): a tela só pergunta e mostra,
// porque a conferência do perfil, da etapa e dos bloqueios precisa valer mesmo para uma janela antiga ou para quem chamar o banco por fora.
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { ehAdminOuGerente } from './utils/permissoes';
import { logChange } from './AuditSystem';

/** Admin e qualquer perfil "Gerente ..." — a equipe do Comercial que só vale como gerente do setor NÃO exclui OP (o banco confere o perfil real). */
export function podeExcluirOp(usuario: any): boolean {
  return ehAdminOuGerente(usuario);
}

export type ConferenciaDaExclusao = { erro?: string; opl?: string; status?: string; bloqueios: string[]; desligados: string[]; avisos: string[] };

/** O que impede, o que será desligado e o que fica como está. Leitura recusada devolve `erro` (nunca "nada impede"). */
export async function conferirExclusaoDeOp(opId: string): Promise<ConferenciaDaExclusao> {
  const { data, error } = await supabase.rpc('op_excluir_conferir', { p_id: opId });
  if (error) return { erro: error.message, bloqueios: [], desligados: [], avisos: [] };
  if (data?.erro) return { erro: data.erro, bloqueios: [], desligados: [], avisos: [] };
  return { opl: data.opl, status: data.status, bloqueios: data.bloqueios || [], desligados: data.desligados || [], avisos: data.avisos || [] };
}

/** A pergunta com o que acontece; devolve o motivo ou null (cancelou). Motivo curto demais não vale. */
export function textoDaPergunta(op: any, c: ConferenciaDaExclusao): string {
  const bloco = (titulo: string, xs: string[]) => (xs.length ? `\n${titulo}\n${xs.map(x => '• ' + x).join('\n')}` : '');
  return [
    `Excluir a OP ${op.opl}?`,
    'A OP some de todas as telas e fica guardada, marcada como excluída, na aba "OPs em aberto" do CRM (só para leitura). O número dela não pode ser usado de novo.',
    bloco('Será desligado sozinho:', c.desligados),
    bloco('Fica como está (confira):', c.avisos),
    '\nInforme o motivo da exclusão (obrigatório):',
  ].filter(Boolean).join('\n');
}

/**
 * Fluxo completo da tela: confere, mostra o que acontece, pede o motivo e grava.
 * Devolve true quando a OP foi excluída (a tela fecha a janela e atualiza as listas).
 */
export async function excluirOpComMotivo(op: any, usuario: any): Promise<boolean> {
  if (!podeExcluirOp(usuario)) { mostrarAviso('Só Admin e gerentes podem excluir uma OP.', 'atencao'); return false; }
  const c = await conferirExclusaoDeOp(op.id);
  if (c.erro) { mostrarAviso(`Não foi possível conferir o que está ligado à OP ${op.opl} (${c.erro}). Por segurança, nada foi excluído.`, 'erro'); return false; }
  if (c.bloqueios.length) {
    mostrarAviso(`A OP ${op.opl} não pode ser excluída porque tem:\n${c.bloqueios.map(b => '• ' + b).join('\n')}\nSe ela não vai mais andar, use o status "Cancelado" na edição da OP.`, 'erro');   // recusa que a pessoa precisa ler (alerta em vermelho, regra de 27/10/2026): fica na tela até fechar
    return false;
  }
  const motivo = await pedirTexto(textoDaPergunta(op, c), '');
  if (motivo == null) return false;
  if (String(motivo).trim().length < 5) { mostrarAviso('Nada foi excluído: o motivo é obrigatório (pelo menos 5 letras).', 'atencao'); return false; }
  if (!await confirmar(`Confirma a exclusão da OP ${op.opl}?\nMotivo: ${String(motivo).trim()}`)) return false;
  const { data, error } = await supabase.rpc('op_excluir', { p_id: op.id, p_motivo: String(motivo).trim(), p_status_esperado: op.status_geral });
  if (error) { mostrarAviso(`A OP ${op.opl} NÃO foi excluída\n${error.message}`, 'erro'); return false; }
  try {
    await logChange({ module: 'oples', entityType: 'oples', entityId: op.id, changeType: 'UPDATE', user: usuario,
      oldRow: { status_geral: op.status_geral }, newRow: { status_geral: 'Cancelado', excluida_motivo: String(motivo).trim() } });
  } catch { /* a exclusão já ficou no histórico da OP pelo banco */ }
  const desl = (data?.desligados || []) as string[];
  mostrarAviso(`OP ${op.opl} excluída${desl.length ? '\n' + desl.map(d => '• ' + d).join('\n') : ''}`, 'ok');
  try { window.dispatchEvent(new CustomEvent('acn:op-excluida', { detail: { id: op.id } })); } catch { /* sem janela */ }
  return true;
}

/** As OPs excluídas, só para quem tem a aba CRM ou Comercial (o banco confere). Leitura recusada devolve `erro`. */
export async function lerOpsExcluidas(): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.rpc('ops_excluidas_para_o_comercial');
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [] };
}
