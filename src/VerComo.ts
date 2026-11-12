// "Ver como" no banco (pedido do usuário em 12/11/2026). O "Ver como" do Admin sempre trocou o usuário guardado no navegador, mas o crachá do banco
// continuava o do Admin: o banco aplicava as regras (abas, perfil, nome, Calendário, RH, Início...) à pessoa errada, e as telas mostravam mais do que a
// pessoa vista veria. Agora o banco guarda, por sessão, quem o Admin está vendo (funções `ver_como_iniciar` / `ver_como_encerrar`, `supabase/sql/ver_como_no_banco.sql`)
// e todas as regras passam a valer pela pessoa vista. Só um Admin de verdade consegue ligar; o registro vence em 12 horas e é renovado a cada abertura do sistema.
import { supabase } from './supabaseClient';

const CHAVE_ORIGINAL = 'admin_sessao_original';   // a mesma chave que o AdminTab e o DashboardTab já usam

/** O sistema está aberto no "Ver como" (há a sessão real do Admin guardada para voltar)? */
export function estaVendoComo(): boolean {
  try { return !!localStorage.getItem(CHAVE_ORIGINAL); } catch { return false; }
}

/** Liga o "Ver como" no banco para a pessoa de e-mail `email`. `ok: false` traz o motivo em português; nesse caso NÃO se deve trocar a sessão da tela. */
export async function iniciarVerComo(email: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { error } = await supabase.rpc('ver_como_iniciar', { p_email: email });
    if (error) return { ok: false, erro: error.message || 'O banco não aceitou o "Ver como".' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'Sem conexão com o banco.' };
  }
}

/** Desliga o "Ver como" no banco (não falha para quem chama: se não der, o registro vence sozinho em 12 horas). Devolve se conseguiu. */
export async function encerrarVerComo(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('ver_como_encerrar');
    return !error;
  } catch { return false; }
}
