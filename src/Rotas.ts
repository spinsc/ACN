// Endereços do sistema (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 1, decidido com o usuário em 25/11/2026).
//
// Só regras puras: ler o endereço da barra do navegador e montar o endereço de uma tela. Nada aqui mexe no navegador nem numa tela
// (isso é do `EnderecoDoNavegador.ts` e do `useNavegacao.ts`), para as regras poderem ser provadas sem abrir o sistema.
//
// Forma do endereço (decidido: com `#`, porque o GitHub Pages não tem página de reserva e um caminho direto daria "página não
// encontrada" no F5): `#/<tela>[/<o que vier depois>]`. Na Fase 1 só a TELA vale; o que vem depois dela (aba interna, registro)
// é guardado em `resto` e ainda não é interpretado (Fases 3 e 4).
//
// Fase 2 (25/11/2026): a OP ganha endereço próprio, SEM tela dona: `#/op/<número da OP>`. Ela aparece em quase todos os setores e já abria
// numa janela por cima de qualquer tela, então o endereço dela abre essa janela por cima da tela em que a pessoa estiver (no F5 e no link
// colado, por cima do Início). É o primeiro "registro"; licitação, card do CRM, compra e OS entram na Fase 3 pelo mesmo caminho.
//
// Fase 3 (26/11/2026): licitação, card do CRM, compra (o pedido) e OS são registros COM tela dona, e o endereço diz qual é:
// `#/licitacoes/licitacao/<código>`, `#/crm/card/<código>`, `#/compras/pedido/<código>` e `#/sac/os/<código>`. Ao contrário da OP, a permissão da TELA vale (sem a aba, "sem acesso")
// e a janela do registro abre DENTRO da tela. O <código> é o código interno (uuid) do registro: nenhum dos quatro tem um número que a equipe use e que não se repita
// (títulos de card e números de licitação se repetem). Cada tela só conhece os tipos dela (`REGISTROS_DAS_TELAS`).
//
// Fase 4 (26/11/2026): as abas de dentro de cada tela ganham endereço (`#/compras/fornecedores`, `#/rh/ponto/mes`): o F5 volta à mesma aba, o Voltar e o Avançar andam entre as abas e o link de uma aba
// abre a aba. O endereço SEM aba (`#/compras`) é a aba padrão da tela, então o link curto de sempre continua abrindo o que abria. O quadro de abas de cada tela está em `ABAS_DAS_TELAS` e a ligação
// com o estado da tela, em `AbaNoEndereco.ts`. O endereço de um registro (`#/crm/card/<código>`) e o da OP não dizem aba: a janela abre por cima da aba que estiver aberta, como sempre abriu.

/**
 * Primeiras palavras que NÃO são tela: ficam reservadas para endereços de registro sem tela dona (a OP, na Fase 2; a viagem, depois).
 * Nenhuma tela pode usar um destes nomes (`conferirQuadroDeNomes` confere).
 */
export const PALAVRAS_RESERVADAS: readonly string[] = ['op', 'viagem', 'demanda'];

/**
 * QUADRO DE NOMES (decidido em 25/11/2026): o nome da tela no endereço é um assunto separado do id interno dela. O id interno é o que as
 * permissões de cada pessoa guardam (`auth_usuarios.abas_permitidas`) e o que o menu usa; o nome do menu pode mudar e o link já publicado
 * tem de continuar abrindo. Por isso:
 *  - o nome no endereço é, por padrão, o id com "-" no lugar de "_" (`painel_tv` → `painel-tv`), então uma tela nova já funciona sozinha;
 *  - `NOMES_ESPECIAIS` troca esse padrão para uma tela que precise de outro nome;
 *  - `APELIDOS` guarda os nomes ANTIGOS ou alternativos (nome publicado antes da troca → id interno): nome novo só acrescenta, nunca remove.
 */
const NOMES_ESPECIAIS: Record<string, string> = {};
const APELIDOS: Record<string, string> = {};

/** O nome que uma tela usa no endereço. */
export function nomeNoEndereco(id: string): string {
  return NOMES_ESPECIAIS[id] ?? id.replace(/_/g, '-');
}

/** O id interno da tela que o nome do endereço designa, ou `null` (nome desconhecido). Não diferencia maiúscula de minúscula. */
export function idDaTela(nome: string, ids: readonly string[]): string | null {
  const n = String(nome || '').trim().toLowerCase();
  if (!n) return null;
  const apelido = APELIDOS[n];
  if (apelido && ids.includes(apelido)) return apelido;
  return ids.find(id => nomeNoEndereco(id) === n) ?? null;
}

/** Os registros que têm endereço próprio, sem tela dona: a OP (Fase 2), a viagem (Fase 5, 26/11/2026: abre por cima de qualquer tela, como a OP, porque quem recebe o aviso de uma viagem pode nem ter a aba Viagens) e a demanda geral (Fase 5, 26/11/2026, decidido com o usuário: o painel da demanda mora em seis telas e abas, então a janela dela também abre por cima de qualquer tela). */
export type TipoDeRegistro = 'op' | 'viagem' | 'demanda';

/** A palavra de cada registro no endereço (`#/op/…`). Todas precisam estar em `PALAVRAS_RESERVADAS`. */
const PALAVRA_DO_REGISTRO: Record<TipoDeRegistro, string> = { op: 'op', viagem: 'viagem', demanda: 'demanda' };

/** Os registros que moram DENTRO de uma tela (Fase 3): a palavra de cada um no endereço, depois do nome da tela. */
export type TipoDeRegistroDaTela = 'licitacao' | 'card' | 'pedido' | 'os' | 'servico' | 'ficha' | 'tarefa' | 'ofi' | 'vistoria' | 'projeto';   // `projeto` = a demanda do Desenvolvimento da Engenharia, numa janela própria (Fase 6, 26/11/2026); `vistoria` = a ficha (janela VER) da vistoria de pátio (Fase 6, 26/11/2026); `ofi` = a ordem de fabricação interna (Fase 6, 26/11/2026; mora nas filas de Serralheria, Chicotes e Laboratório); `tarefa` = a tarefa do Financeiro (Fase 6, 26/11/2026); `servico` = o serviço de terceiro (Fase 5, 26/11/2026); `ficha` = a ficha de atendimento em garantia (Fase 6, 26/11/2026)

/** Quais registros cada tela conhece (id interno da tela → as palavras que valem depois do nome dela). Tela que não está aqui não tem endereço de registro. */
export const REGISTROS_DAS_TELAS: Readonly<Record<string, readonly TipoDeRegistroDaTela[]>> = {
  licitacoes: ['licitacao'],
  crm: ['card'],
  compras: ['pedido'],
  sac: ['os', 'ficha'],   // a ficha da Garantia mora na aba Garantia do SAC (a palavra não pode ser `garantia`: é o nome da aba)
  terceiros: ['servico'],
  engenharia: ['projeto', 'tarefa'],   // `projeto` = a demanda do Desenvolvimento (aba Desenvolvimento; a palavra não é `desenvolvimento` porque esse é o nome da aba); `tarefa` = a tarefa da Engenharia (aba Horas/Tarefas, janela de leitura; a aba filha é `tarefas`, no plural)
  vistorias: ['vistoria'],   // a ficha da vistoria de pátio (janela VER); o retorno e o formulário de saída seguem pelo recado (decidido com o usuário em 26/11/2026)
  serralheria: ['ofi'],   // a OFI (ordem de fabricação interna) mora na fila de cada setor que fabrica: o endereço é o do setor DESTINO dela, e a palavra não colide com as abas (demandas, relatorios)
  chicotes: ['ofi'],
  laboratorio: ['ofi'],
  financeiro: ['tarefa'],   // a tarefa mora na aba Tarefas (`kanban`) do Financeiro; a palavra não colide com nenhuma aba da tela
};

/**
 * Um registro que mora numa tela: a tela dona, o tipo e o código dele. `dica` só vem de um recado interno (Menção, chat, vínculo) e diz em que janela do registro cair: a OS do SAC aberta
 * por uma Menção abre o Acompanhamento (onde a Menção foi escrita), como sempre abriu; o link e a busca geral abrem o resumo.
 */
export type RegistroDaTela = { tela: string; tipo: TipoDeRegistroDaTela; chave: string; dica?: string };

export type Rota =
  | { tipo: 'vazio' }                                         // sem endereço: vale a tela inicial
  | { tipo: 'tela'; tela: string; resto: string[]; registro?: { tipo: TipoDeRegistroDaTela; chave: string } }   // uma tela do menu (e o registro dela, quando o endereço pede um; as abas, no `resto`, quem lê é `abaNoEndereco`)
  | { tipo: 'registro'; registro: TipoDeRegistro; chave: string }   // a janela de um registro (a OP) por cima da tela em que a pessoa está
  | { tipo: 'desconhecido'; texto: string };                  // o sistema não conhece este endereço

function decodificar(parte: string): string {
  try { return decodeURIComponent(parte); } catch { return parte; }   // `%` solto no meio do endereço não pode derrubar a tela
}

/** Os pedaços do endereço, já decodificados: `#/compras/A1562.2610%2F01` → `['compras', 'A1562.2610/01']`. Ignora o que vier depois de um `?`. */
function partesDoEndereco(hash: string): string[] {
  let texto = String(hash || '').trim();
  if (texto.startsWith('#')) texto = texto.slice(1);
  const caminho = texto.split('?')[0].replace(/^\/+/, '');
  return caminho.split('/').filter(p => p !== '').map(decodificar);
}

/**
 * Se os pedaços do endereço são os de um registro (`op/<número>`), qual registro e qual chave. O número da OP pode ter barra (as unidades de um
 * lote são `A1562.2610/01`: 355 das 571 OPs de 25/11/2026) e ESPAÇO (`A 1435.2607`, número antigo): o link correto codifica ambos, mas quem digita
 * a barra sem codificar também é entendido (tudo o que vier depois da palavra é o número). Sem número (`#/op`, `#/op/`) não é registro.
 */
function registroDosPedacos(partes: string[]): { registro: TipoDeRegistro; chave: string } | null {
  const palavra = String(partes[0] || '').toLowerCase();
  const registro = (Object.keys(PALAVRA_DO_REGISTRO) as TipoDeRegistro[]).find(r => PALAVRA_DO_REGISTRO[r] === palavra);
  if (!registro) return null;
  const chave = partes.slice(1).join('/').trim();
  return chave ? { registro, chave } : null;
}

/**
 * Lê o que está depois do `#` na barra do navegador. Aceita `#/compras`, `#compras`, `#/compras/` e maiúsculas; ignora o que vier depois de um `?`
 * (filtros no endereço são da Fase 5).
 */
export function lerEndereco(hash: string, ids: readonly string[]): Rota {
  const partes = partesDoEndereco(hash);
  if (partes.length === 0) return { tipo: 'vazio' };
  const registro = registroDosPedacos(partes);
  if (registro) return { tipo: 'registro', ...registro };
  const tela = idDaTela(partes[0], ids);
  if (!tela) return { tipo: 'desconhecido', texto: partes.join('/') };
  const resto = partes.slice(1);
  const registroDaTela = registroDoResto(tela, resto);
  return registroDaTela ? { tipo: 'tela', tela, resto, registro: registroDaTela } : { tipo: 'tela', tela, resto };
}

/**
 * Se o que vem DEPOIS do nome da tela é um registro dela (`card/<código>`): o tipo e o código. Só vale a palavra que a tela conhece (`REGISTROS_DAS_TELAS`) e só no primeiro pedaço
 * depois da tela. Decidido na Fase 4 (26/11/2026): o endereço de um registro NÃO leva a aba de baixo (`#/crm/card/<código>`, nunca `#/crm/funil/card/<código>`): o link já publicado continua valendo e a janela
 * abre por cima da aba que a pessoa tiver (a aba é o estado da própria tela, que o gancho `useAbaNoEndereco` não mexe enquanto o endereço é de um registro). Sem código (`#/crm/card`) não é registro.
 * O código pode ter barra (quem digita a barra sem codificar também é entendido): tudo o que vier depois da palavra é o código.
 */
function registroDoResto(tela: string, resto: string[]): { tipo: TipoDeRegistroDaTela; chave: string } | null {
  const tipos = REGISTROS_DAS_TELAS[tela];
  if (!tipos) return null;
  const palavra = String(resto[0] || '').toLowerCase();
  const tipo = tipos.find(t => t === palavra);
  if (!tipo) return null;
  const chave = resto.slice(1).join('/').trim();
  return chave ? { tipo, chave } : null;
}

/** O registro que o endereço pede (a OP e o número dela), ou `null` se o endereço é de tela, vazio ou desconhecido. Não precisa da lista de telas. */
export function registroDoEndereco(hash: string): { registro: TipoDeRegistro; chave: string } | null {
  return registroDosPedacos(partesDoEndereco(hash));
}

/**
 * O registro que o endereço pede DENTRO desta tela (`#/crm/card/<código>`), ou `null` se o endereço é de outra tela, não pede registro ou é de OP. Não precisa da lista de telas:
 * quem pergunta é a própria tela, que diz quem ela é.
 */
export function registroDaTelaNoEndereco(hash: string, tela: string): RegistroDaTela | null {
  const partes = partesDoEndereco(hash);
  if (partes.length < 2 || idDaTela(partes[0], [tela]) !== tela) return null;
  const registro = registroDoResto(tela, partes.slice(1));
  return registro ? { tela, ...registro } : null;
}

/** O endereço de um registro que mora numa tela: `#/crm/card/<código>`. O código é codificado (nunca tem barra no uuid, mas o endereço não depende disso). */
export function montarEnderecoDoRegistroDaTela(tela: string, tipo: TipoDeRegistroDaTela, chave: string): string {
  return montarEndereco(tela, [tipo, String(chave ?? '').trim()]);
}

/** O endereço de uma tela (e, depois dela, o que vier: cada pedaço é codificado, porque número de OP leva barra, como `A1562.2610/01`). */
export function montarEndereco(tela: string, resto: readonly string[] = []): string {
  return '#/' + [nomeNoEndereco(tela), ...resto.map(p => encodeURIComponent(p))].join('/');
}

/** O endereço de um registro sem tela dona: `#/op/A1562.2610%2F01`. A chave é codificada inteira (a barra do número vira `%2F`). */
export function montarEnderecoDeRegistro(registro: TipoDeRegistro, chave: string): string {
  return '#/' + PALAVRA_DO_REGISTRO[registro] + '/' + encodeURIComponent(String(chave ?? '').trim());
}

/** O endereço da janela de uma viagem, pelo código interno dela (Fase 5): `#/viagem/<código>`. */
export function montarEnderecoDaViagem(id: string): string {
  return montarEnderecoDeRegistro('viagem', id);
}

/** O endereço da janela de uma demanda geral, pelo código interno dela (Fase 5): `#/demanda/<código>`. */
export function montarEnderecoDaDemanda(id: string): string {
  return montarEnderecoDeRegistro('demanda', id);
}

/** O endereço da janela de uma OP, pelo número dela. */
export function montarEnderecoDaOp(numero: string): string {
  return montarEnderecoDeRegistro('op', numero);
}

// ── Fase 4: as abas de dentro de cada tela ──

/** As abas de um nível de uma tela: `padrao` é a que o endereço sem aba mostra; `abas` são todas as que existem (os ids que a tela já usa no estado dela). */
export type AbasDeUmNivel = { padrao: string; abas: readonly string[] };

/**
 * As abas de uma tela, em até DOIS níveis (a aba da tela e, dentro de uma aba, as dela: `#/rh/ponto/mes`). `filhas` diz de qual aba de fora cada grupo de dentro é.
 * Tela que não está aqui não tem aba no endereço (o estado dela segue só dentro dela). **Tela nova com abas: uma entrada aqui, o gancho `useAbaNoEndereco` na tela e o cenário no teste.**
 */
export type QuadroDeAbas = AbasDeUmNivel & { filhas?: Readonly<Record<string, AbasDeUmNivel>> };

export const ABAS_DAS_TELAS: Readonly<Record<string, QuadroDeAbas>> = {
  // Fase 5, parte 2 (26/11/2026): as visões que eram fichas de chips ou botões. Viagens, Relatórios, Ponto e Cotações são visões da PRÓPRIA tela (nível 0); as de dentro de uma aba (o Relógio Ponto do RH, a forma de ver as Vendas do Telecom, Tarefas e Horas extras da Engenharia) são o segundo nível.
  viagens: { padrao: 'quadro', abas: ['quadro', 'lista', 'agenda', 'custos'] },
  // `hoje` (a equipe hoje) é a padrão e `meu` é explícito (#/ponto/meu): o endereço do gestor que está no próprio ponto precisa dizer isso, senão o F5 o levava à equipe (achado do teste C67, 26/11/2026).
  // Quem só vê o próprio ponto só tem uma parte: a tela mostra `meu` e a barra volta a #/ponto sem passo novo.
  ponto: { padrao: 'hoje', abas: ['hoje', 'mes', 'extras', 'meu'] },
  relatorios: { padrao: 'opls', abas: ['servico', 'opls', 'finalizadas', 'porsetor', 'atrasadas', 'paradas', 'recebenv', 'avulsas', 'area', 'producao', 'centrocusto', 'comissoes', 'markup', 'dossie', 'custohora'] },
  cotacoes: { padrao: 'todas', abas: ['todas', 'avulsas'] },
  admin: { padrao: 'usuarios', abas: ['usuarios', 'perfis', 'plataformas', 'centros_custo', 'alcadas_aprovacao', 'alcadas_aprovacao_fretes', 'departamentos_compras', 'contratos_padrao', 'email_cfg', 'cotacoes_cfg', 'markup_cfg', 'nfc_cfg', 'notificacoes', 'feriados', 'veiculos', 'estruturas', 'fluxo_cfg', 'checklist', 'kpis', 'avisos', 'logs', 'dados', 'lixeira'] },
  formacao_precos: { padrao: 'formacao', abas: ['formacao', 'precos_formados'] },
  crm: { padrao: 'kanban', abas: ['kanban', 'agenda', 'recentes', 'relatorio', 'opls', 'faturamentos', 'demandas', 'contatos'] },
  producao: { padrao: 'producao', abas: ['producao', 'veicular', 'agenda', 'voucher', 'equipes'] },
  rh: { padrao: 'geral', abas: ['geral', 'colaboradores', 'ponto', 'comissoes', 'relatorios', 'autorizacoes'], filhas: { ponto: { padrao: 'hoje', abas: ['hoje', 'tratar', 'mes', 'extras', 'horas', 'vinculos'] } } },
  serralheria: { padrao: 'demandas', abas: ['demandas', 'relatorios'] },
  chicotes: { padrao: 'demandas', abas: ['demandas', 'relatorios'] },
  laboratorio: { padrao: 'demandas', abas: ['demandas', 'relatorios'] },
  engenharia: { padrao: 'desenvolvimento', abas: ['analise', 'desenvolvimento', 'estruturas', 'horas'], filhas: { horas: { padrao: 'tarefas', abas: ['tarefas', 'relatorio', 'extras', 'gerencial'] } } },
  financeiro: { padrao: 'centros', abas: ['pendencias', 'centros', 'conciliacao', 'kanban', 'custoop', 'demandas'] },
  marketing: { padrao: 'opls', abas: ['opls', 'pedidos'] },
  telecom: { padrao: 'demandas', abas: ['vendas', 'separacao', 'demandas'], filhas: { vendas: { padrao: 'quadro', abas: ['quadro', 'lista', 'perdas'] } } },
  sac: { padrao: 'os', abas: ['os', 'chamados_nfc', 'garantia', 'cadastros'] },
  compras: { padrao: 'pedidos', abas: ['pedidos', 'fornecedores'] },
  // Logística (26/11/2026, depois da V4d): a aba de sempre é o Histórico / Novo Registro (`#/logistica`); as outras três ganham endereço.
  logistica: { padrao: 'historico', abas: ['recebimento', 'historico', 'relatorio', 'fretes'] },
  // Fiscal (26/11/2026, preparação do módulo fiscal): antes era uma página só; agora tem o Faturamento de sempre (`#/fiscal`), os Cadastros fiscais (com quatro visões de dentro) e o Conferidor de XML.
  fiscal: { padrao: 'faturamento', abas: ['faturamento', 'arquivo', 'cadastros', 'conferidor'], filhas: { arquivo: { padrao: 'notas', abas: ['notas', 'numeracao', 'sem_xml'] }, cadastros: { padrao: 'empresas', abas: ['empresas', 'transportadoras', 'clientes', 'itens'] } } },
  terceiros: { padrao: 'quadro', abas: ['quadro', 'agenda', 'lista', 'relatorio', 'ordens', 'prestadores', 'tipos', 'modelo'] },
};

/**
 * O nome de uma aba no endereço: o id interno dela em minúscula, sem acento e com hífen no lugar de tudo o que não é letra ou número (`horas_extras` → `horas-extras`). Assim o rótulo da aba
 * pode mudar sem quebrar o link, e uma aba cujo id tenha maiúscula ou acento também vira um nome seguro.
 */
export function nomeDaAba(id: string): string {
  return normalizarChave(id).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** As abas do nível pedido de uma tela (nível 0 = a aba da tela; nível 1 = as de dentro da aba `pai`), ou `null` se a tela não tem quadro de abas. */
export function abasDoNivel(tela: string, nivel: 0 | 1 = 0, pai?: string | null): AbasDeUmNivel | null {
  const q = ABAS_DAS_TELAS[tela];
  if (!q) return null;
  if (nivel === 0) return q;
  return pai && q.filhas && q.filhas[pai] ? q.filhas[pai] : null;
}

/** O id interno da aba que o nome do endereço designa neste nível, ou `null` (nome que a tela não conhece). Não diferencia maiúscula, acento nem hífen×sublinhado. */
export function abaDoNome(tela: string, nivel: 0 | 1, pai: string | null | undefined, nome: string): string | null {
  const n = abasDoNivel(tela, nivel, pai);
  const alvo = nomeDaAba(nome);
  if (!n || !alvo) return null;
  return n.abas.find(a => nomeDaAba(a) === alvo) ?? null;
}

/**
 * O que o endereço diz sobre a aba de uma tela neste nível:
 *  - `fora`: o endereço não é desta tela, ou é a janela de uma OP ou de um registro da tela (que abrem POR CIMA da aba): a aba não muda por causa dele;
 *  - `aba`: o endereço é desta tela. `aba` é a aba que ele nomeia neste nível, ou `null` se não nomeia nenhuma (endereço sem aba = a padrão); `invalida` = nomeia uma aba que a tela não tem.
 * No nível 1 o endereço só vale se a aba de fora dele é `pai` (`#/rh/ponto/mes` é do `ponto`; `#/rh/comissoes/mes` não é): senão, `fora`. A aba de fora padrão pode faltar no endereço
 * quando não há aba de dentro (`#/rh`), mas nunca quando há (`#/rh/ponto/mes`): sem ela, `#/rh/mes` seria ambíguo.
 */
export type AbaNoEndereco = { tipo: 'fora' } | { tipo: 'aba'; aba: string | null; invalida: boolean };

export function abaNoEndereco(hash: string, tela: string, nivel: 0 | 1 = 0, pai?: string | null): AbaNoEndereco {
  const q = ABAS_DAS_TELAS[tela];
  const partes = partesDoEndereco(hash);
  if (!q || partes.length === 0 || registroDosPedacos(partes)) return { tipo: 'fora' };
  if (idDaTela(partes[0], [tela]) !== tela) return { tipo: 'fora' };
  const resto = partes.slice(1);
  if (registroDoResto(tela, resto)) return { tipo: 'fora' };           // a janela de um registro desta tela: abre por cima de qualquer aba
  const nomeia = (nivelDoNome: 0 | 1, nome: string | undefined): AbaNoEndereco => {
    if (nome === undefined) return { tipo: 'aba', aba: null, invalida: false };
    const a = abaDoNome(tela, nivelDoNome, pai, nome);
    return a ? { tipo: 'aba', aba: a, invalida: false } : { tipo: 'aba', aba: null, invalida: true };
  };
  if (nivel === 0) return nomeia(0, resto[0]);
  const deFora = resto.length === 0 ? q.padrao : abaDoNome(tela, 0, null, resto[0]);
  if (!pai || deFora !== pai || !abasDoNivel(tela, 1, pai)) return { tipo: 'fora' };   // a aba de fora é outra, ou esta aba não tem abas de dentro
  return nomeia(1, resto[1]);
}

/**
 * O endereço de uma aba: `caminho` = [aba da tela] ou [aba da tela, aba de dentro], com os ids internos. O que é a aba padrão do nível some do endereço (`#/compras` é `pedidos`); a aba de fora
 * só some se não há aba de dentro a dizer. Tela sem quadro: o endereço da tela.
 */
export function montarEnderecoDaAba(tela: string, caminho: readonly string[]): string {
  const q = ABAS_DAS_TELAS[tela];
  if (!q) return montarEndereco(tela);
  const fora = caminho[0] || q.padrao;
  const filhas = q.filhas ? q.filhas[fora] : undefined;
  const dentro = filhas && caminho[1] && caminho[1] !== filhas.padrao ? caminho[1] : undefined;
  if (!dentro && fora === q.padrao) return montarEndereco(tela);
  return montarEndereco(tela, [nomeDaAba(fora), ...(dentro ? [nomeDaAba(dentro)] : [])]);
}

// ── Fase 5, parte 3 (26/11/2026): os filtros no endereço (`#/viagens/lista?saida=semana`) ──
// O filtro mora DEPOIS do `?`: o caminho (tela, aba, registro) continua sendo o de sempre e as regras acima já ignoravam o que vem depois dele. Estas funções são só as regras
// puras de ler e montar essa consulta; quem escreve na barra é o `FiltroNoEndereco.ts`.

/** Separa o caminho da consulta: `#/relatorios/atrasadas?setor=X` → `['#/relatorios/atrasadas', 'setor=X']` (sem consulta, o segundo é texto vazio). */
export function separarConsulta(hash: string): [string, string] {
  const texto = String(hash || '');
  const i = texto.indexOf('?');
  return i < 0 ? [texto, ''] : [texto.slice(0, i), texto.slice(i + 1)];
}

/** Os filtros do endereço, decodificados. Chave repetida vale a PRIMEIRA; chave vazia é ignorada; `%` solto não derruba. */
export function lerFiltros(hash: string): Record<string, string> {
  const [, consulta] = separarConsulta(hash);
  const filtros: Record<string, string> = {};
  for (const par of consulta.split('&')) {
    if (par === '') continue;
    const i = par.indexOf('=');
    const chave = decodificar((i < 0 ? par : par.slice(0, i)).replace(/\+/g, ' ')).trim();
    if (!chave || Object.prototype.hasOwnProperty.call(filtros, chave)) continue;
    filtros[chave] = i < 0 ? '' : decodificar(par.slice(i + 1).replace(/\+/g, ' '));
  }
  return filtros;
}

/** O caminho com os filtros: chaves em ordem alfabética (o mesmo conjunto dá sempre o mesmo endereço) e filtro vazio não aparece. */
export function montarEnderecoComFiltros(caminho: string, filtros: Readonly<Record<string, string>>): string {
  const pares = Object.keys(filtros).filter(k => k && filtros[k] !== '' && filtros[k] != null).sort()
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(filtros[k])));
  const [semConsulta] = separarConsulta(caminho);
  return pares.length ? semConsulta + '?' + pares.join('&') : semConsulta;
}

/** O nome da tela no endereço (`#/formacao-precos/formacao?x=1` → `formacao-precos`), em minúscula; texto vazio se o endereço não é de tela. */
export function telaDoEndereco(hash: string): string {
  const p = partesDoEndereco(hash)[0];
  return p ? normalizarChave(p) : '';
}

/**
 * O endereço da aba de FORA (nível 0) que NÃO apaga a aba de dentro quando o endereço de agora já é dessa mesma aba de fora: `#/rh/ponto/mes` continua `#/rh/ponto/mes` quando o gancho da tela
 * reescreve o endereço (decidido na Fase 5, parte 2, 26/11/2026: sem isso o gancho da aba de fora, que roda depois do da aba de dentro, apagava a visão de dentro de todo link colado).
 * Em qualquer outro caso é o `montarEnderecoDaAba(tela, [aba])` de sempre.
 */
export function montarEnderecoDaAbaDeFora(hash: string, tela: string, aba: string): string {
  const q = ABAS_DAS_TELAS[tela];
  if (q && q.filhas && q.filhas[aba]) {
    const fora = abaNoEndereco(hash, tela, 0);
    if (fora.tipo === 'aba' && fora.aba === aba) {
      const dentro = abaNoEndereco(hash, tela, 1, aba);
      if (dentro.tipo === 'aba' && dentro.aba && !dentro.invalida) return montarEnderecoDaAba(tela, [aba, dentro.aba]);
    }
  }
  return montarEnderecoDaAba(tela, [aba]);
}

/** O endereço de agora é desta tela (a tela em si, uma aba dela ou a janela de um registro dela)? A OP e as outras telas, não. Trocar para a tela em que já se está não mexe no endereço. */
export function enderecoEhDaTela(hash: string, tela: string): boolean {
  const partes = partesDoEndereco(hash);
  return partes.length > 0 && !registroDosPedacos(partes) && idDaTela(partes[0], [tela]) === tela;
}

const RE_CODIGO_INTERNO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O texto é o código interno (uuid) de um registro, e não o número que a equipe usa? (Menções antigas e links de dentro do sistema podem trazer o código.) */
export function ehCodigoInterno(chave: unknown): boolean {
  return RE_CODIGO_INTERNO.test(String(chave ?? '').trim());
}

/**
 * O recado interno de "abrir isto" (`window.__acnDeepLink`: contexto + id) que as Menções, o chat, os avisos e os vínculos gravam antes de trocar de tela, traduzido para o
 * registro que ele pede. Só os quatro tipos da Fase 3. O nome do contexto não é o da tela: o card do CRM é `crm`, a compra é `compra`, a OS é `sac`.
 */
const REGISTRO_DO_CONTEXTO: Readonly<Record<string, { tela: string | readonly string[]; tipo: TipoDeRegistroDaTela; dica?: string }>> = {
  crm: { tela: 'crm', tipo: 'card' },
  licitacao: { tela: 'licitacoes', tipo: 'licitacao' },
  compra: { tela: 'compras', tipo: 'pedido' },
  compra_aprovacao: { tela: 'compras', tipo: 'pedido' },
  // a Menção e o vínculo "OS X" sempre abriram o Acompanhamento da OS (a tela do SAC lê o recado), e continuam abrindo: o recado carrega essa dica
  sac: { tela: 'sac', tipo: 'os', dica: 'acompanhamento' },
  sac_revisao_orcamento: { tela: 'sac', tipo: 'os', dica: 'acompanhamento' },
  // Fase 5 (26/11/2026): o aviso do Calendário e o "Abrir" do quadro de serviços ligados à OP e à OS trazem o código do serviço (o do primeiro da visita, quando há vários carros)
  terceiro_servico: { tela: 'terceiros', tipo: 'servico' },
  // Fase 6 (26/11/2026): o aviso de uma ficha de garantia (caixa de Menções, 'Abrir o atendimento' do Desenvolvimento) traz o id da ficha
  garantia: { tela: 'sac', tipo: 'ficha' },
  // Fase 6 (26/11/2026): a Menção e o aviso do Calendário de uma tarefa do Financeiro trazem o id da tarefa
  tarefa_financeiro: { tela: 'financeiro', tipo: 'tarefa' },
  // Fase 6 (26/11/2026): o vínculo "OFI" (de uma demanda, de uma compra…) já troca para a tela do setor destino da OFI; o recado vale para qualquer uma das três telas que fabricam
  ofi: { tela: ['serralheria', 'chicotes', 'laboratorio'], tipo: 'ofi' },
  // Fase 6 (26/11/2026): a Menção da área livre de uma demanda do Desenvolvimento, o "Abrir o projeto" da Garantia e a data de uma etapa (Calendário) trazem o id da demanda
  desenvolvimento: { tela: 'engenharia', tipo: 'projeto' },
  // Fase 6 (26/11/2026): a Menção da tarefa da Engenharia (participante marcado) e a data dela no Calendário trazem o id da tarefa
  tarefa_engenharia: { tela: 'engenharia', tipo: 'tarefa' },
};

function telasDoAlvo(tela: string | readonly string[]): readonly string[] { return typeof tela === 'string' ? [tela] : tela; }

/**
 * O registro que o recado pede, SE ele é de `tela` (a tela para onde a pessoa está indo) e traz um código interno de verdade; senão `null` (o recado fica como está, para quem o lê).
 * Serve para a troca de tela escrever `#/compras/pedido/<código>` num passo só, em vez de `#/compras` e depois outro passo para o registro.
 */
export function registroDoRecado(recado: unknown, tela: string): RegistroDaTela | null {
  if (!recado || typeof recado !== 'object') return null;
  const { contexto, contextoId } = recado as { contexto?: unknown; contextoId?: unknown };
  const nome = String(contexto ?? '');
  if (!Object.prototype.hasOwnProperty.call(REGISTRO_DO_CONTEXTO, nome)) return null;
  const alvo = REGISTRO_DO_CONTEXTO[nome];
  if (!telasDoAlvo(alvo.tela).includes(tela)) return null;
  const chave = String(contextoId ?? '').trim();
  return ehCodigoInterno(chave) ? { tela, tipo: alvo.tipo, chave, ...(alvo.dica ? { dica: alvo.dica } : {}) } : null;
}

/**
 * A chave sem diferença de maiúscula, de acento nem de espaço nas pontas: "a1750.2611" e "A1750.2611 " são a mesma OP, e "a 1396.2606 - cbv itaiopolis" é a "A 1396.2606 - CBV ITAIÓPOLIS".
 * É a mesma conta da coluna `opl_norm` do banco (o número sem maiúscula nem acento), e o banco confirma que ela não junta duas OPs: em 25/11/2026 nenhuma das 571 OPs se repete assim.
 * Sem o acento, a janela aberta por um link digitado sem acento não se reconhecia no endereço e, ao fechar, o Voltar reabria a mesma OP (achado do cenário C31). O espaço DENTRO do número fica (`A 1435.2607`).
 */
export function normalizarChave(chave: unknown): string {
  return String(chave ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** As duas chaves apontam para o mesmo registro? Chave vazia nunca é igual a nada. */
export function mesmaChave(a: unknown, b: unknown): boolean {
  const x = normalizarChave(a);
  return x !== '' && x === normalizarChave(b);
}

/** O que fazer com o endereço que está na barra. */
export type Decisao =
  | { tipo: 'abrir'; tela: string; corrigirEndereco: boolean }   // abre a tela; `corrigirEndereco` = a barra não mostra a tela (vazia) e deve passar a mostrar
  | { tipo: 'registro'; registro: TipoDeRegistro; chave: string } // o endereço é de um registro (a OP): a janela dele abre por cima da tela que já está (ou, na abertura, da tela inicial)
  | { tipo: 'conferindo'; tela: string }                         // pediu uma tela que as permissões guardadas no navegador não liberam e a releitura do banco ainda não terminou
  | { tipo: 'semAcesso'; tela: string }                          // a pessoa não tem esta tela
  | { tipo: 'desconhecido'; texto: string };                     // endereço que o sistema não conhece: vale a tela inicial, com um aviso

export type ContextoDoEndereco = {
  ids: readonly string[];                 // as telas que existem no menu
  podeVer: (id: string) => boolean;       // a mesma regra do menu (`isVisible` do DashboardTab)
  telaInicial: () => string;              // a tela de abertura da pessoa
  acessoConferido: boolean;               // as permissões já foram relidas do banco?
};

/**
 * Decide o que o endereço da barra pede (regra 4 do plano). Ponto delicado: as permissões que o navegador guarda podem estar velhas (o sistema as
 * relê do banco logo depois de abrir), então o link de uma tela que elas NÃO liberam só vira "sem acesso" depois dessa releitura; antes, é
 * "conferindo". Assim quem acabou de receber uma aba não leva uma recusa falsa. Se as permissões guardadas já liberam, abre na hora.
 *
 * O endereço de um registro (a OP) NÃO passa pela permissão de tela: ele não tem tela dona. Quem decide se a pessoa pode ver aquela OP é o banco
 * (a OP excluída ou que a pessoa não lê volta como "não encontrei, ou você não tem acesso"), exatamente como já era ao clicar no número de uma OP.
 */
export function decidirEndereco(hash: string, ctx: ContextoDoEndereco): Decisao {
  const rota = lerEndereco(hash, ctx.ids);
  if (rota.tipo === 'vazio') return { tipo: 'abrir', tela: ctx.telaInicial(), corrigirEndereco: true };
  if (rota.tipo === 'registro') return { tipo: 'registro', registro: rota.registro, chave: rota.chave };
  if (rota.tipo === 'desconhecido') return { tipo: 'desconhecido', texto: rota.texto };
  if (ctx.podeVer(rota.tela)) return { tipo: 'abrir', tela: rota.tela, corrigirEndereco: false };
  return ctx.acessoConferido ? { tipo: 'semAcesso', tela: rota.tela } : { tipo: 'conferindo', tela: rota.tela };
}

/** Confere o quadro de nomes (usado pelo teste, não pela tela): nomes repetidos, nome reservado e apelido que aponta para tela que não existe. */
export function conferirQuadroDeNomes(ids: readonly string[]): string[] {
  const problemas: string[] = [];
  const vistos = new Map<string, string>();
  for (const id of ids) {
    const nome = nomeNoEndereco(id);
    if (PALAVRAS_RESERVADAS.includes(nome)) problemas.push(`a tela "${id}" usa o nome reservado "${nome}"`);
    const dono = vistos.get(nome);
    if (dono) problemas.push(`as telas "${dono}" e "${id}" usam o mesmo nome "${nome}"`);
    else vistos.set(nome, id);
    if (nome !== nome.toLowerCase() || /[\s/?#]/.test(nome)) problemas.push(`o nome "${nome}" da tela "${id}" tem maiúscula, espaço ou símbolo de endereço`);
  }
  for (const [apelido, id] of Object.entries(APELIDOS)) {
    if (!ids.includes(id)) problemas.push(`o apelido "${apelido}" aponta para "${id}", que não é uma tela`);
    if (PALAVRAS_RESERVADAS.includes(apelido)) problemas.push(`o apelido "${apelido}" é um nome reservado`);
  }
  for (const [registro, palavra] of Object.entries(PALAVRA_DO_REGISTRO)) {
    if (!PALAVRAS_RESERVADAS.includes(palavra)) problemas.push(`o registro "${registro}" usa a palavra "${palavra}", que não está entre as reservadas`);
  }
  // Fase 3: os registros que moram numa tela
  for (const [tela, tipos] of Object.entries(REGISTROS_DAS_TELAS)) {
    if (!ids.includes(tela)) problemas.push(`a tela "${tela}" tem registros no endereço, mas não é uma tela do menu`);
    for (const t of tipos) if (PALAVRAS_RESERVADAS.includes(t)) problemas.push(`o registro "${t}" da tela "${tela}" usa uma palavra reservada`);
  }
  for (const [contexto, alvo] of Object.entries(REGISTRO_DO_CONTEXTO)) {
    for (const t of telasDoAlvo(alvo.tela)) if (!REGISTROS_DAS_TELAS[t]?.includes(alvo.tipo)) problemas.push(`o recado "${contexto}" aponta para ${t}/${alvo.tipo}, que a tela não conhece`);
  }
  problemas.push(...conferirQuadroDeAbas(ids));
  return problemas;
}

/**
 * Confere o quadro de abas (Fase 4; usado pelo teste, não pela tela): tela que não existe, aba padrão que não está na lista, nome de aba repetido ou vazio depois de normalizado, aba de dentro de uma aba que
 * não existe e, o caso mais fácil de errar, aba com o nome de um registro da própria tela E abas de dentro: `#/sac/os/<x>` seria lido como a OS `<x>`, e não como a aba de dentro.
 * O quadro e os registros podem ser passados para o teste provar que cada erro é pego.
 */
export function conferirQuadroDeAbas(
  ids: readonly string[],
  quadro: Readonly<Record<string, QuadroDeAbas>> = ABAS_DAS_TELAS,
  registros: Readonly<Record<string, readonly string[]>> = REGISTROS_DAS_TELAS,
): string[] {
  const problemas: string[] = [];
  const conferirNivel = (onde: string, n: AbasDeUmNivel) => {
    if (!n.abas || n.abas.length === 0) { problemas.push(`${onde} não tem nenhuma aba`); return; }
    if (!n.abas.includes(n.padrao)) problemas.push(`${onde}: a aba padrão "${n.padrao}" não está na lista de abas`);
    const vistos = new Map<string, string>();
    for (const a of n.abas) {
      const nome = nomeDaAba(a);
      if (!nome) { problemas.push(`${onde}: a aba "${a}" fica sem nome no endereço`); continue; }
      const dono = vistos.get(nome);
      if (dono) problemas.push(`${onde}: as abas "${dono}" e "${a}" usam o mesmo nome "${nome}" no endereço`);
      else vistos.set(nome, a);
    }
  };
  for (const [tela, q] of Object.entries(quadro)) {
    if (!ids.includes(tela)) { problemas.push(`a tela "${tela}" tem abas no endereço, mas não é uma tela do menu`); continue; }
    conferirNivel(`as abas de "${tela}"`, q);
    const palavras = registros[tela] || [];
    for (const [pai, filhas] of Object.entries(q.filhas || {})) {
      if (!q.abas.includes(pai)) problemas.push(`a tela "${tela}" tem abas de dentro de "${pai}", que não é uma aba dela`);
      conferirNivel(`as abas de dentro de "${pai}" em "${tela}"`, filhas);
      if (palavras.includes(nomeDaAba(pai))) problemas.push(`a aba "${pai}" de "${tela}" tem o nome de um registro da tela e abas de dentro: o endereço ficaria ambíguo`);
    }
  }
  return problemas;
}
