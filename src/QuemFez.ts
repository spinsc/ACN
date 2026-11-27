// Plano "toda pessoa por ID" (PLANO_USUARIOS_POR_ID.md), etapa U4 — 24/11/2026.
// O ID do usuário (`auth_usuarios.id`) é a identidade; o nome é só texto para mostrar. No banco, toda coluna de pessoa (`responsavel_nome`, `criado_por_nome`…)
// tem o ID ao lado (`<coluna>_pessoa_id`), mantido por gatilho; renomear um usuário leva o nome novo a todas elas. Estas funções são o jeito de a tela
// perguntar "é a mesma pessoa?" e "quem está gravando?" sem montar isso à mão e sem depender de o nome ter ficado igual.
import { normalizarBusca } from './SearchUtils';

/** Quem está gravando: o ID para identificar e o nome (atual) para mostrar. Em "Ver como", é a pessoa vista (a mesma regra do banco, `uid_efetivo`). */
export function quemFez(currentUser: any): { id: string | null; nome: string } {
  return { id: currentUser?.id || null, nome: String(currentUser?.nome || '') };
}

const mesmoTexto = (a: any, b: any) => !!normalizarBusca(a) && normalizarBusca(a) === normalizarBusca(b);

/**
 * A linha é da pessoa `currentUser`? O ID manda: se a linha traz `<colunaNome>_pessoa_id`, vale ele (renomear a pessoa não muda a resposta);
 * linha sem o ID (a consulta não pediu a coluna, ou a pessoa não tem usuário) cai para o nome, sem acento e sem diferenciar maiúscula.
 * Ex.: `ehEu(currentUser, card, 'responsavel_nome')`.
 */
export function ehEu(currentUser: any, linha: any, colunaNome: string): boolean {
  if (!currentUser || !linha) return false;
  const idDaLinha = linha[colunaNome + '_pessoa_id'];
  if (idDaLinha && currentUser.id) return idDaLinha === currentUser.id;
  return mesmoTexto(linha[colunaNome], currentUser.nome);
}

/** A mesma pergunta quando só se tem o nome (e talvez o ID) de outra pessoa, sem a linha inteira. */
export function mesmaPessoa(currentUser: any, nome: any, idPessoa?: any): boolean {
  if (!currentUser) return false;
  if (idPessoa && currentUser.id) return idPessoa === currentUser.id;
  return mesmoTexto(nome, currentUser.nome);
}
