// ─────────────────────────────────────────────────────────────────────────────
// Gravação dos avisos do sistema (publicar, editar, desativar/reativar e excluir), a MESMA no painel do Admin e no quadro flutuante 📌 (12e93, 27/11/2026).
// Saiu do AdminPainelAvisos (12e92) para o quadro flutuante não ficar com a cópia antiga, que dava por feita uma gravação que o banco negou. Cada função confere a
// permissão, pergunta o que precisa perguntar, grava pedindo a linha de volta e DIZ o resultado (aviso verde ou vermelho em português); quem chama só decide o que
// fazer com o formulário. Regras e frases: AvisosRegras.ts. Permissão (só Admin publica; editar, desativar e excluir só o autor ou DEV): utils/permissoes.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { confirmar, mostrarAviso } from './Feedback';
import { podeMexerNoAviso, podePublicarAviso } from './utils/permissoes';
import {
  MSG_SEM_PERMISSAO, MSG_VALIDADE_INVALIDA, faltaTextoNoAviso, gravouAlgo, payloadDoAviso, perguntaExcluirAviso, perguntaValidadePassada,
  textoDeFalha, textoSucessoDeAlternar, textoSucessoDeExcluir, textoSucessoDeSalvar, validadeDoAviso,
} from './AvisosRegras';

export const TABELA_AVISOS = 'avisos_sistema';

/** A trava do clique duplo vale desde o PRIMEIRO clique (o estado só chega no desenho seguinte, e dois cliques seguidos publicavam o aviso duas vezes, para a empresa toda).
 *  `aoTerminar` (reler a lista) roda sempre no fim, deu certo ou não. Uma exceção vira aviso vermelho em português. */
export function useGravacaoTravada(aoTerminar: () => Promise<void>) {
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef(aoTerminar); fim.current = aoTerminar;
  const comTrava = async (fn: () => Promise<void>) => {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try { await fn(); }
    catch (e: any) { mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro'); }
    finally { await fim.current(); trava.current = false; setOcupado(false); }
  };
  return { comTrava, ocupado, trava };
}

/** Publica (sem `editId`) ou salva a edição. Devolve `true` só se o banco confirmou a linha; em qualquer outro caso o aviso já foi dado e o formulário deve ficar como está. */
export async function salvarAviso({ form, editId, avisos, usuario }: { form: any; editId: string | null; avisos: any[]; usuario: any }): Promise<boolean> {
  if (faltaTextoNoAviso(form)) return false;
  const alvo = editId ? avisos.find((x: any) => x.id === editId) : null;
  if (editId ? !(alvo && podeMexerNoAviso(usuario, alvo)) : !podePublicarAviso(usuario)) { mostrarAviso(MSG_SEM_PERMISSAO, 'erro'); return false; }
  const v = validadeDoAviso(form);
  if (v.invalida) { mostrarAviso(MSG_VALIDADE_INVALIDA, 'atencao'); return false; }
  // aviso com validade que já passou nasce expirado: ninguém o veria (suposição minha: perguntar, não barrar)
  if (v.passada && !await confirmar(perguntaValidadePassada(v.data as Date))) return false;
  const payload: any = payloadDoAviso(form, v.expira);
  let r: any;
  if (editId) {
    // editar NÃO mexe em "ativo": antes o payload forçava ativo:true e editar um aviso desativado o reativava
    r = await supabase.from(TABELA_AVISOS).update(payload).eq('id', editId).select('id');
  } else {
    payload.ativo = true; payload.criado_por = usuario?.email || ''; payload.criado_por_nome = usuario?.nome || '';
    r = await supabase.from(TABELA_AVISOS).insert([payload]).select('id');
  }
  if (!gravouAlgo(r)) { mostrarAviso(textoDeFalha(editId ? 'salvar o aviso' : 'publicar o aviso', 'salvar', r), 'erro'); return false; }
  mostrarAviso(textoSucessoDeSalvar(!!editId, payload.titulo), 'ok');
  return true;
}

/** Pergunta e exclui. `true` = o banco confirmou a exclusão. */
export async function excluirAviso({ av, usuario }: { av: any; usuario: any }): Promise<boolean> {
  if (!podeMexerNoAviso(usuario, av)) return false;
  if (!await confirmar(perguntaExcluirAviso(av.titulo))) return false;
  const r = await supabase.from(TABELA_AVISOS).delete().eq('id', av.id).select('id');
  if (!gravouAlgo(r)) { mostrarAviso(textoDeFalha(`excluir o aviso "${av.titulo}"`, 'excluir', r), 'erro'); return false; }
  mostrarAviso(textoSucessoDeExcluir(av.titulo), 'ok');
  return true;
}

/** Desativa ou reativa. `true` = o banco confirmou. */
export async function alternarAtivoDoAviso({ av, usuario }: { av: any; usuario: any }): Promise<boolean> {
  if (!podeMexerNoAviso(usuario, av)) return false;
  const r = await supabase.from(TABELA_AVISOS).update({ ativo: !av.ativo }).eq('id', av.id).select('id');
  if (!gravouAlgo(r)) { mostrarAviso(textoDeFalha(`${av.ativo ? 'desativar' : 'reativar'} o aviso "${av.titulo}"`, 'alternar', r), 'erro'); return false; }
  mostrarAviso(textoSucessoDeAlternar(av.titulo, !!av.ativo), 'ok');
  return true;
}
