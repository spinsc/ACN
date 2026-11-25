// Endereços do sistema (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 1, decidido com o usuário em 25/11/2026).
//
// Só regras puras: ler o endereço da barra do navegador e montar o endereço de uma tela. Nada aqui mexe no navegador nem numa tela
// (isso é do `EnderecoDoNavegador.ts` e do `useNavegacao.ts`), para as regras poderem ser provadas sem abrir o sistema.
//
// Forma do endereço (decidido: com `#`, porque o GitHub Pages não tem página de reserva e um caminho direto daria "página não
// encontrada" no F5): `#/<tela>[/<o que vier depois>]`. Na Fase 1 só a TELA vale; o que vem depois dela (aba interna, registro)
// é guardado em `resto` e ainda não é interpretado (Fases 3 e 4).

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

export type Rota =
  | { tipo: 'vazio' }                                         // sem endereço: vale a tela inicial
  | { tipo: 'tela'; tela: string; resto: string[] }           // uma tela do menu (e o que vier depois dela, ainda sem uso)
  | { tipo: 'desconhecido'; texto: string };                  // o sistema não conhece este endereço

function decodificar(parte: string): string {
  try { return decodeURIComponent(parte); } catch { return parte; }   // `%` solto no meio do endereço não pode derrubar a tela
}

/**
 * Lê o que está depois do `#` na barra do navegador. Aceita `#/compras`, `#compras`, `#/compras/` e maiúsculas; ignora o que vier depois de um `?`
 * (filtros no endereço são da Fase 5).
 */
export function lerEndereco(hash: string, ids: readonly string[]): Rota {
  let texto = String(hash || '').trim();
  if (texto.startsWith('#')) texto = texto.slice(1);
  const caminho = texto.split('?')[0].replace(/^\/+/, '');
  const partes = caminho.split('/').filter(p => p !== '').map(decodificar);
  if (partes.length === 0) return { tipo: 'vazio' };
  const tela = idDaTela(partes[0], ids);
  if (!tela) return { tipo: 'desconhecido', texto: partes.join('/') };
  return { tipo: 'tela', tela, resto: partes.slice(1) };
}

/** O endereço de uma tela (e, depois dela, o que vier: cada pedaço é codificado, porque número de OP leva barra, como `A1562.2610/01`). */
export function montarEndereco(tela: string, resto: readonly string[] = []): string {
  return '#/' + [nomeNoEndereco(tela), ...resto.map(p => encodeURIComponent(p))].join('/');
}

/** O que fazer com o endereço que está na barra. */
export type Decisao =
  | { tipo: 'abrir'; tela: string; corrigirEndereco: boolean }   // abre a tela; `corrigirEndereco` = a barra não mostra a tela (vazia) e deve passar a mostrar
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
 */
export function decidirEndereco(hash: string, ctx: ContextoDoEndereco): Decisao {
  const rota = lerEndereco(hash, ctx.ids);
  if (rota.tipo === 'vazio') return { tipo: 'abrir', tela: ctx.telaInicial(), corrigirEndereco: true };
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
  return problemas;
}
