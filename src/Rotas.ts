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

/**
 * Primeiras palavras que NÃO são tela: ficam reservadas para endereços de registro sem tela dona (a OP, na Fase 2; a viagem, depois).
 * Nenhuma tela pode usar um destes nomes (`conferirQuadroDeNomes` confere).
 */
export const PALAVRAS_RESERVADAS: readonly string[] = ['op', 'viagem'];

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

/** Os registros que têm endereço próprio, sem tela dona. Hoje só a OP (Fase 2). */
export type TipoDeRegistro = 'op';

/** A palavra de cada registro no endereço (`#/op/…`). Todas precisam estar em `PALAVRAS_RESERVADAS`. */
const PALAVRA_DO_REGISTRO: Record<TipoDeRegistro, string> = { op: 'op' };

/** Os registros que moram DENTRO de uma tela (Fase 3): a palavra de cada um no endereço, depois do nome da tela. */
export type TipoDeRegistroDaTela = 'licitacao' | 'card' | 'pedido' | 'os';

/** Quais registros cada tela conhece (id interno da tela → as palavras que valem depois do nome dela). Tela que não está aqui não tem endereço de registro. */
export const REGISTROS_DAS_TELAS: Readonly<Record<string, readonly TipoDeRegistroDaTela[]>> = {
  licitacoes: ['licitacao'],
  crm: ['card'],
  compras: ['pedido'],
  sac: ['os'],
};

/**
 * Um registro que mora numa tela: a tela dona, o tipo e o código dele. `dica` só vem de um recado interno (Menção, chat, vínculo) e diz em que janela do registro cair: a OS do SAC aberta
 * por uma Menção abre o Acompanhamento (onde a Menção foi escrita), como sempre abriu; o link e a busca geral abrem o resumo.
 */
export type RegistroDaTela = { tela: string; tipo: TipoDeRegistroDaTela; chave: string; dica?: string };

export type Rota =
  | { tipo: 'vazio' }                                         // sem endereço: vale a tela inicial
  | { tipo: 'tela'; tela: string; resto: string[]; registro?: { tipo: TipoDeRegistroDaTela; chave: string } }   // uma tela do menu (e o registro dela, quando o endereço pede um; o resto da Fase 4 ainda não é lido)
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
 * depois da tela (a Fase 4, das abas internas, vai acrescentar o pedaço da aba antes dele, sem mudar o que já foi publicado). Sem código (`#/crm/card`) não é registro.
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

/** O endereço da janela de uma OP, pelo número dela. */
export function montarEnderecoDaOp(numero: string): string {
  return montarEnderecoDeRegistro('op', numero);
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
const REGISTRO_DO_CONTEXTO: Readonly<Record<string, { tela: string; tipo: TipoDeRegistroDaTela; dica?: string }>> = {
  crm: { tela: 'crm', tipo: 'card' },
  licitacao: { tela: 'licitacoes', tipo: 'licitacao' },
  compra: { tela: 'compras', tipo: 'pedido' },
  compra_aprovacao: { tela: 'compras', tipo: 'pedido' },
  // a Menção e o vínculo "OS X" sempre abriram o Acompanhamento da OS (a tela do SAC lê o recado), e continuam abrindo: o recado carrega essa dica
  sac: { tela: 'sac', tipo: 'os', dica: 'acompanhamento' },
  sac_revisao_orcamento: { tela: 'sac', tipo: 'os', dica: 'acompanhamento' },
};

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
  if (alvo.tela !== tela) return null;
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
    if (!REGISTROS_DAS_TELAS[alvo.tela]?.includes(alvo.tipo)) problemas.push(`o recado "${contexto}" aponta para ${alvo.tela}/${alvo.tipo}, que a tela não conhece`);
  }
  return problemas;
}
