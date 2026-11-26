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

export type Rota =
  | { tipo: 'vazio' }                                         // sem endereço: vale a tela inicial
  | { tipo: 'tela'; tela: string; resto: string[] }           // uma tela do menu (e o que vier depois dela, ainda sem uso)
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
  return { tipo: 'tela', tela, resto: partes.slice(1) };
}

/** O registro que o endereço pede (a OP e o número dela), ou `null` se o endereço é de tela, vazio ou desconhecido. Não precisa da lista de telas. */
export function registroDoEndereco(hash: string): { registro: TipoDeRegistro; chave: string } | null {
  return registroDosPedacos(partesDoEndereco(hash));
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
  return problemas;
}
