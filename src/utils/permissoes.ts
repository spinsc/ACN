// ============================================
// ARQUIVO: src/utils/permissoes.ts
// Sistema de Permissões de Edição e Deleção
// ============================================

/**
 * Verifica se o usuário pode editar um registro
 * Regra: Apenas o setor que criou pode editar
 */
export function podeEditarRegistro(registro: any, usuarioAtual: any): boolean {
  if (!usuarioAtual) return false;

  // Admin pode editar tudo
  if (usuarioAtual.perfil === 'Admin') {
    return true;
  }

  // Se não tem informação de quem criou, não pode editar
  if (!registro.criado_por_setor) {
    return false;
  }

  // Apenas o setor que criou pode editar
  return usuarioAtual.setor === registro.criado_por_setor;
}

/**
 * Verifica se o usuário pode deletar um registro
 * Regra: Apenas Admin pode deletar
 */
export function podeDeletarRegistro(usuarioAtual: any): boolean {
  if (!usuarioAtual) return false;

  // Apenas Admin pode deletar
  return usuarioAtual.perfil === 'Admin';
}

/**
 * Retorna mensagem de erro sobre permissão
 */
export function getMensagemPermissao(acao: string, setor: string): string {
  if (acao === 'editar') {
    return `❌ Você não tem permissão para editar.\n\nApenas o setor "${setor}" que criou este registro pode editá-lo.`;
  }

  if (acao === 'deletar') {
    return `❌ Você não tem permissão para deletar.\n\nApenas Administradores podem deletar registros.`;
  }

  return 'Você não tem permissão para esta ação.';
}

/**
 * Adiciona informação de quem criou o registro
 */
export function adicionarCriador(dados: any, usuarioAtual: any): any {
  return {
    ...dados,
    criado_por: usuarioAtual.email,
    criado_por_nome: usuarioAtual.nome,
    criado_por_setor: usuarioAtual.setor, // Ex: 'Comercial', 'Engenharia', etc
    data_criacao: new Date().toISOString(),
  };
}