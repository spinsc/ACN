// @ts-nocheck
// Contato do cliente obrigatório no CRM e nas Licitações (pedido do usuário em 26/10/2026).
// Regra decidida com ele: o contato vale quando tem NOME e TELEFONE ou E-MAIL. Vale ao criar e ao editar; os registros antigos (88 dos 225 cards do CRM e 152 das 165
// licitações estavam sem nenhum contato) continuam abrindo, e pedem o contato na próxima vez que forem editados ou mudarem de etapa. Perder ou desistir não pede contato:
// ninguém deve ser obrigado a preencher dado de cliente só para encerrar um registro perdido.
// Módulo sem tela, para testar a regra sem navegador.

import { telefoneComFormatoValido } from './Telefone';

/** Telefone de verdade: DDD + número completo (10 ou 11 dígitos, com ou sem +55, pontuação e espaços). Regra de 04/11/2026 (pedido do usuário: todo telefone com formato de telefone);
 *  antes bastavam 8 dígitos, e números sem DDD passavam. Os cards e licitações antigos com telefone incompleto pedem o número completo na próxima edição. */
export const telefoneValido = (v: any): boolean => telefoneComFormatoValido(v);
/** E-mail de verdade: algo@dominio.ext, sem espaços. */
export const emailValido = (v: any): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim());

export type ConferenciaContato = { ok: boolean; falta: string[] };

/** Conferência comum: nome + (algum telefone válido OU e-mail válido). `falta` diz o que falta, em português. */
function conferir(nome: any, telefones: any[], email: any): ConferenciaContato {
  const falta: string[] = [];
  if (!String(nome ?? '').trim()) falta.push('o nome do contato');
  const temTelefone = telefones.some(telefoneValido);
  const temEmail = emailValido(email);
  if (!temTelefone && !temEmail) {
    const algoPreenchido = telefones.some(t => String(t ?? '').trim()) || String(email ?? '').trim();
    falta.push(algoPreenchido ? 'um telefone completo (com DDD, por exemplo (51) 98644-0747) ou um e-mail válido' : 'o telefone ou o e-mail');
  } else if (telefones.some(t => String(t ?? '').trim() && !telefoneValido(t))) {
    // 04/11/2026: com e-mail válido o contato já valia, mas um telefone preenchido pela metade não pode ser gravado assim
    falta.push('o telefone completo, com DDD (ou apague o que está incompleto)');
  }
  return { ok: falta.length === 0, falta };
}

/** Contato do card do CRM (`nome_contato`, `contato` = telefone, `contato_email`). */
export const conferirContatoDoCard = (c: any): ConferenciaContato => conferir(c?.nome_contato, [c?.contato], c?.contato_email);

/** Um contato da licitação (`licitacao_contatos`: `nome`, `email`, `telefones` = lista de { numero, tipo }). */
export const conferirContatoDeLicitacao = (c: any): ConferenciaContato =>
  conferir(c?.nome, (Array.isArray(c?.telefones) ? c.telefones : []).map((t: any) => t?.numero), c?.email);

/** A licitação tem contato quando ao menos UM dos contatos passa na conferência. */
export const licitacaoTemContato = (contatos: any[]): boolean => (contatos || []).some(c => conferirContatoDeLicitacao(c).ok);

export const mensagemContatoDoCard = (r: ConferenciaContato, aoMover = false): string =>
  `${aoMover ? 'Para mudar este card de etapa, preencha' : 'Preencha'} o contato do cliente: falta ${r.falta.join(' e ')}. O contato é obrigatório (nome e telefone ou e-mail).`;

export const mensagemContatoDaLicitacao = (r: ConferenciaContato): string =>
  `Preencha o contato do cliente: falta ${r.falta.join(' e ')}. O contato é obrigatório (nome e telefone ou e-mail).`;

/** Texto quando a licitação ainda não tem nenhum contato que sirva (`acao` = o que a pessoa tentava fazer). */
export const mensagemLicitacaoSemContato = (acao: string): string =>
  `Esta licitação ainda não tem o contato do cliente, e ele é obrigatório (nome e telefone ou e-mail). Cadastre em "Contatos do processo" antes de ${acao}.`;

/** Lê os contatos da licitação. `erro` = não deu para ler: quem chama NÃO deve tratar isso como "sem contato" nem como "tem contato". */
export async function lerContatosDaLicitacao(supabase: any, licitacaoId: string): Promise<{ contatos: any[]; erro?: string }> {
  const { data, error } = await supabase.from('licitacao_contatos').select('id,nome,email,telefones').eq('licitacao_id', licitacaoId);
  if (error) return { contatos: [], erro: error.message || 'erro desconhecido' };
  return { contatos: data || [] };
}

/** Status de licitação que encerram sem negócio: não pedem contato. */
export const STATUS_QUE_NAO_PEDEM_CONTATO = ['Perdida', 'Descartada'];
