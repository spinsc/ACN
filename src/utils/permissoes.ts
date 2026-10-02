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
 * Alterar o número de uma OPL ou de um PV JÁ PREENCHIDO: só Admin e gerentes
 * (qualquer perfil "Gerente ...": Comercial, Administrativo, Produção...).
 * A 1ª atribuição continua livre: o vendedor informa o PV ao enviar a
 * proposta e a OP nasce com o número na abertura.
 * A troca do número da OP é conferida de novo no banco (renomear_opl).
 */
export function podeAlterarNumeroOplPv(usuarioAtual: any): boolean {
  return temPoderDeGerente(usuarioAtual);
}

// ── Comercial/CRM e Licitações: a equipe tem os poderes do gerente do setor ──
// Decisão de 17/09/2026: limitar funções estava atrapalhando o processo. Quem é
// do setor pode fazer tudo que o seu gerente faz (sem virar Admin):
//   Comercial e CRM → Gerente Comercial · Licitações → Gerente de Licitações.
// As travas voltam aos poucos: basta tirar o perfil daqui (e de renomear_opl no banco).
// Continuam só com gerentes de verdade (conferem o perfil real, não este mapa):
// relatórios e relatório de vendedores, contatos de todos e filtro por operador,
// agenda da equipe e calendário de todos, aprovar cotação e cancelar análise de outra pessoa.
const GERENTE_DO_SETOR: Record<string, string> = {
  comercial: 'Gerente Comercial',
  crm: 'Gerente Comercial',
  licitacoes: 'Gerente de Licitações',
};
const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Perfil usado nas conferências de permissão: a equipe de Comercial/CRM e Licitações vale como o gerente do setor. */
export function perfilComPoderes(usuarioAtual: any): string {
  const perfil = String(usuarioAtual?.perfil || '').trim();
  return GERENTE_DO_SETOR[semAcento(perfil)] || perfil;
}

/** Admin, gerente, ou equipe com os poderes do gerente (Comercial/CRM e Licitações). */
export function temPoderDeGerente(usuarioAtual: any): boolean {
  return ehAdminOuGerente({ perfil: perfilComPoderes(usuarioAtual) });
}

/** Admin ou qualquer perfil "Gerente ..." (Comercial, Administrativo, Produção...). */
export function ehAdminOuGerente(usuarioAtual: any): boolean {
  const perfil = String(usuarioAtual?.perfil || '').trim();
  return perfil === 'Admin' || /^gerente/i.test(perfil);
}

/**
 * Quem corrige a equipe de uma OP (quem trabalhou na adaptação e na serralheria) — decidido com o
 * usuário em 30/09/2026: Admin, qualquer "Gerente ..." (o Gerente de Produção, que faz o apontamento,
 * e o Gerente administrativo, que fatura) e quem já tem a aba "Adaptação" — a mesma gente que já
 * mexia na Equipe dentro da Produção. A trava de "até o Fiscal faturar" está em EquipeDaOp.tsx.
 */
export function podeEditarEquipeDaOp(usuarioAtual: any): boolean {
  if (ehAdminOuGerente(usuarioAtual)) return true;
  const abas = usuarioAtual?.abas_permitidas;
  return Array.isArray(abas) && abas.includes('producao');
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
// ─────────────────────────────────────────────────────────────────────────────
// QUEM ENXERGA QUAIS DEMANDAS (28/09/2026)
//
// Regra combinada com o usuário:
//   colaborador → só as demandas que ele mesmo abriu;
//   gerente     → as dele e as dos colaboradores do seu setor;
//   Admin       → todas.
//
// `auth_usuarios` não tem coluna de setor: o que existe é o PERFIL. Por isso o
// setor do gerente é este mapa, e não uma consulta. Está aqui à vista de
// propósito — quando a fábrica mudar de organograma, corrige-se esta lista e
// nada mais.
// ─────────────────────────────────────────────────────────────────────────────
const EQUIPE_DO_GERENTE: Record<string, string[]> = {
  'gerente comercial':      ['Gerente Comercial', 'Comercial', 'CRM'],
  'gerente de licitacoes':  ['Gerente de Licitações', 'Licitações'],
  'gerente producao':       ['Gerente Produção', 'Producao', 'Produção', 'PCP', 'Almoxarifado',
                             'Serralheria', 'Chicote', 'Chicotes', 'Laboratório', 'Laboratorio',
                             'Engenharia', 'Qualidade'],
  'gerente administrativo': ['Gerente administrativo', 'RH', 'Compras', 'Financeiro', 'Fiscal',
                             'Logistica', 'Logística', 'Marketing'],
};

/**
 * Até onde a vista deste usuário alcança nas demandas.
 *   { modo: 'todas' }                    → Admin
 *   { modo: 'setor', perfis: [...] }     → gerente: o setor dele
 *   { modo: 'proprias' }                 → todo o resto
 */
export function escopoDeDemandas(usuarioAtual: any): { modo: 'todas' | 'setor' | 'proprias'; perfis?: string[] } {
  const perfil = String(usuarioAtual?.perfil || '').trim();
  if (perfil === 'Admin') return { modo: 'todas' };
  const equipe = EQUIPE_DO_GERENTE[semAcento(perfil)];
  if (equipe) return { modo: 'setor', perfis: equipe };
  // gerente de um setor que ainda não está no mapa continua vendo o próprio
  // trabalho — melhor faltar gente na lista do que abrir demais sem querer
  return { modo: 'proprias' };
}

// ── Avisos do sistema (02/10/2026, pedido do usuário) ───────────────────────────────────────────────────────────────────
// Só Admin publica. Editar, pausar e excluir uma nota: só o AUTOR dela ou quem tem a marca DEV (auth_usuarios.eh_dev: Matheus e Luciano Spinelli, que são Admin e
// DEV). A marca é do cadastro e não um nome escrito aqui: assim a regra aparece no banco e muda por lá. Como o resto do sistema, é regra de tela (a tabela não tem
// como saber quem está logado: o login é próprio, não o do Supabase).
export function podePublicarAviso(usuarioAtual: any): boolean {
  return usuarioAtual?.perfil === 'Admin';
}
export function ehDev(usuarioAtual: any): boolean {
  return usuarioAtual?.eh_dev === true;
}
export function ehAutorDoAviso(usuarioAtual: any, aviso: any): boolean {
  const eu = String(usuarioAtual?.email || '').trim().toLowerCase();
  const autor = String(aviso?.criado_por || '').trim().toLowerCase();
  return !!eu && !!autor && eu === autor;
}
export function podeMexerNoAviso(usuarioAtual: any, aviso: any): boolean {
  return podePublicarAviso(usuarioAtual) && (ehDev(usuarioAtual) || ehAutorDoAviso(usuarioAtual, aviso));
}
