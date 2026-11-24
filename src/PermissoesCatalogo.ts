// Catálogo das permissões do cadastro de usuários (Admin → Usuários), na ordem e com os nomes do MENU do sistema.
// 24/11/2026 (pedido do usuário: "revisão geral de permissões"): antes as 33 abas apareciam numa lista corrida com a numeração antiga ("2b. Demandas Avulsas",
// "8. Producao") e as permissões extras na ordem em que foram criadas. Aqui tudo fica agrupado como o menu lateral e com o mesmo nome que a pessoa vê nele.
// Só ORGANIZA: os ids são os de sempre (auth_usuarios.abas_permitidas e as colunas das permissões extras); nada do que já está gravado muda.

export type AbaDoCatalogo = { id: string; rotulo: string; ajuda?: string };
export type GrupoDeAbas = { titulo: string; abas: AbaDoCatalogo[] };

export const GRUPOS_DE_ABAS: GrupoDeAbas[] = [
  { titulo: 'Início e rotina', abas: [
    { id: 'dashboard', rotulo: 'Dashboard', ajuda: 'Sempre liberado para todos.' },
    { id: 'ajustes', rotulo: 'Demandas gerais' },
  ] },
  { titulo: 'Comercial', abas: [
    { id: 'comercial', rotulo: 'Comercial (propostas e OPs)' },
    { id: 'crm', rotulo: 'Comercial / CRM' },
    { id: 'licitacoes', rotulo: 'Licitações' },
    { id: 'cotacoes', rotulo: 'Cotações' },
    { id: 'clientes', rotulo: 'Clientes' },
    { id: 'marketing', rotulo: 'Marketing' },
    { id: 'viagens', rotulo: 'Viagens' },
  ] },
  { titulo: 'Preços e cadastros', abas: [
    { id: 'formacao_precos', rotulo: 'Formação de preços' },
    { id: 'cadastro_itens', rotulo: 'Cadastro de itens' },
    { id: 'cadastro_produtos', rotulo: 'Produtos e mercadorias' },
  ] },
  { titulo: 'Controle de produção', abas: [
    { id: 'engenharia', rotulo: 'Engenharia' },
    { id: 'pcp', rotulo: 'PCP' },
    { id: 'almoxarifado', rotulo: 'Almoxarifado' },
    { id: 'compras', rotulo: 'Compras' },
  ] },
  { titulo: 'Produção', abas: [
    { id: 'producao', rotulo: 'Adaptação' },
    { id: 'serralheria', rotulo: 'Serralheria' },
    { id: 'chicotes', rotulo: 'Chicotes' },
    { id: 'laboratorio', rotulo: 'Laboratório' },
    { id: 'qualidade', rotulo: 'Controle de qualidade' },
    { id: 'telecom', rotulo: 'Telecom' },
  ] },
  { titulo: 'Logística', abas: [
    { id: 'logistica', rotulo: 'Logística In/Out' },
    { id: 'vistorias', rotulo: 'Vistorias de pátio' },
  ] },
  { titulo: 'Administrativo', abas: [
    { id: 'financeiro', rotulo: 'Financeiro' },
    { id: 'fiscal', rotulo: 'Fiscal' },
    { id: 'rh', rotulo: 'RH' },
    { id: 'relatorios', rotulo: 'Relatórios' },
  ] },
  { titulo: 'SAC', abas: [
    { id: 'sac', rotulo: 'SAC' },
    { id: 'nfc', rotulo: 'Dossiê NFC' },
  ] },
  { titulo: 'Sistema', abas: [
    { id: 'admin', rotulo: 'Admin', ajuda: 'A tela de administração do sistema (usuários, perfis, configurações).' },
  ] },
];

/** Telas que TODOS veem, sem depender de marcar nada (a regra está em DashboardTab.isVisible). */
export const TELAS_PARA_TODOS = 'Início, Calendário, Ponto, Minhas solicitações, Manuais, Painel TV e Serviços de terceiros';

export const IDS_DAS_ABAS: string[] = GRUPOS_DE_ABAS.flatMap(g => g.abas.map(a => a.id));

// ── Permissões extras: cada uma é uma coluna do usuário (campo) ou um item de uma lista (campo + valor) ──────────────────────────────────────
export type Extra = {
  /** Chave única da caixa. */
  chave: string;
  rotulo: string;
  ajuda?: string;
  /** Coluna booleana de auth_usuarios. */
  campo?: string;
  /** Lista (coluna array de texto) e o valor que esta caixa liga nela. */
  lista?: 'permissoes_crm' | 'permissoes_rh';
  valor?: string;
  /** Quando a coluna é vazia = ligado (padrão "vê valores"). */
  ligadaPorPadrao?: boolean;
};
export type GrupoDeExtras = { titulo: string; extras: Extra[] };

export const GRUPOS_DE_EXTRAS: GrupoDeExtras[] = [
  { titulo: 'Comercial', extras: [
    { chave: 'crm_vendedores', lista: 'permissoes_crm', valor: 'relatorio_vendedores', rotulo: 'Relatório por vendedor (CRM)' },
    { chave: 'crm_totais', lista: 'permissoes_crm', valor: 'totais_vendas', rotulo: 'Totais de vendas (CRM)' },
    { chave: 'crm_faturamentos', lista: 'permissoes_crm', valor: 'painel_faturamentos', rotulo: 'Painel de faturamentos (CRM)' },
    { chave: 'anexos_licit', campo: 'pode_deletar_anexos', rotulo: 'Excluir anexos em Licitações' },
    { chave: 'alerta_analise', campo: 'recebe_alerta_analise', rotulo: 'Receber alertas de Análise Orçamentária' },
  ] },
  { titulo: 'Compras e Financeiro', extras: [
    { chave: 'aprova_compra', campo: 'pode_aprovar_compra', rotulo: 'Aprovar compra', ajuda: 'Vale para os dois caminhos: alçada por valor e aprovação do departamento.' },
    { chave: 'tarefas_fin', campo: 've_todas_tarefas_financeiro', rotulo: 'Ver todas as tarefas do Financeiro', ajuda: 'Desmarcado, a pessoa vê só as tarefas de que é responsável.' },
    { chave: 'ver_valores', campo: 'ver_valores', ligadaPorPadrao: true, rotulo: 'Ver valores financeiros (valor total, mão de obra etc.)', ajuda: 'Desmarcado, a pessoa não vê valores em reais nas telas.' },
  ] },
  { titulo: 'RH', extras: [
    { chave: 'autorizar_rh', campo: 'pode_autorizar_rh', rotulo: 'Emitir autorizações (RH)' },
    { chave: 'rh_comissoes', lista: 'permissoes_rh', valor: 'comissoes_tecnicos', rotulo: 'Ver só as Comissões de técnicos', ajuda: 'Só vale se a aba RH acima NÃO estiver marcada: com a aba RH a pessoa já vê as comissões dentro dela.' },
  ] },
  { titulo: 'Telas com edição restrita', extras: [
    { chave: 'postar_inicio', campo: 'pode_postar_inicio', rotulo: 'Postar na tela Início (slides do carrossel e datas da empresa)', ajuda: 'Todo mundo vê a tela Início; só o Admin e quem tem esta caixa edita.' },
    { chave: 'gerir_terceiros', campo: 'pode_gerir_terceiros', rotulo: 'Gerir serviços de terceiros (cadastrar prestadores e tipos de serviço, montar a ordem em lote)', ajuda: 'Prestadores e a ordem em lote: Admin, gerentes e quem tem a aba Adaptação já podem. Os tipos de serviço só o Admin e quem tem esta caixa. O modelo do contrato continua só do Admin.' },
  ] },
];

export const TODOS_OS_EXTRAS: Extra[] = GRUPOS_DE_EXTRAS.flatMap(g => g.extras);

/** A caixa está marcada para esta pessoa (`u` = o formulário ou a linha de auth_usuarios)? */
export function extraLigada(u: any, e: Extra): boolean {
  if (e.lista) return Array.isArray(u?.[e.lista]) && u[e.lista].includes(e.valor);
  const v = u?.[e.campo as string];
  return e.ligadaPorPadrao ? v !== false : v === true;
}

/** Os campos a gravar quando a caixa muda. */
export function mudarExtra(u: any, e: Extra, ligar: boolean): Record<string, any> {
  if (e.lista) {
    const atual: string[] = Array.isArray(u?.[e.lista]) ? u[e.lista] : [];
    return { [e.lista]: ligar ? Array.from(new Set([...atual, e.valor as string])) : atual.filter(x => x !== e.valor) };
  }
  return { [e.campo as string]: ligar };
}

/** Os nomes curtos do que a pessoa tem além das abas, para a lista de usuários. */
export function resumoDosExtras(u: any): string[] {
  return TODOS_OS_EXTRAS.filter(e => e.ligadaPorPadrao ? !extraLigada(u, e) : extraLigada(u, e)).map(e => e.ligadaPorPadrao ? 'Sem ver valores' : e.rotulo.replace(/ \(.*$/, ''));
}
