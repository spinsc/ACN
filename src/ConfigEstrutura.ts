// ─────────────────────────────────────────────────────────────────────────────
// ESTRUTURA DE INSTALAÇÃO — pergunta no item, material no veículo
//
// Reescrito em 28/09/2026 depois do alinhamento com o usuário. A primeira
// versão amarrava a pergunta ao par (veículo × item), e estava errado:
//
//   "tem hack de teto?" é pergunta DA BARRA SINALIZADORA e vale em qualquer
//   carro. O que muda de carro para carro é o MATERIAL que cada resposta
//   consome.
//
// Com o modelo antigo a mesma pergunta teria de ser redigitada em cada carro
// onde a barra fosse vendida — e o histórico já tem 91 modelos distintos.
//
// O INTERRUPTOR
//
// Nada disto roda se o Conjunto Elétrico não estiver na venda. Ele é um item
// vendido à parte (aparece na nota e no PV porque licitação exige tudo
// especificado) e representa o material de instalação: suportes, chicotes,
// parafusos, porcas, arruelas, EVAs, colas. O vendedor só o seleciona quando
// vai precisar — cliente que traz suporte e chicote de terceiros não leva
// conjunto, e aí a estrutura não é aplicada.
//
// Só regra e leitura; as telas moram em ConfigEstruturaTela.tsx e
// AplicarEstrutura.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { lerPaginado } from './LerPaginado';
import { normalizarBusca } from './SearchUtils';

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// ── Perguntas (no item) ──────────────────────────────────────────────────────

/** Perguntas de um item, com as respostas possíveis dentro. */
export async function perguntasDoItem(itemId: string) {
  const { data: perguntas } = await supabase.from('item_perguntas')
    .select('*').eq('item_id', itemId).order('ordem');
  if (!perguntas?.length) return [];
  const { data: opcoes } = await supabase.from('item_pergunta_opcoes')
    .select('*').in('pergunta_id', perguntas.map(p => p.id)).order('ordem');
  const porPergunta = new Map<string, any[]>();
  (opcoes || []).forEach((o: any) => {
    if (!porPergunta.has(o.pergunta_id)) porPergunta.set(o.pergunta_id, []);
    porPergunta.get(o.pergunta_id)!.push(o);
  });
  return perguntas.map((p: any) => ({ ...p, opcoes: porPergunta.get(p.id) || [] }));
}

/** Perguntas de vários itens de uma vez, para a tela da OPL. */
export async function perguntasDeVariosItens(itemIds: string[]) {
  const ids = [...new Set((itemIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const { data: perguntas } = await supabase.from('item_perguntas')
    .select('*, cadastro_itens(id,nome,codigo)').in('item_id', ids).order('ordem');
  if (!perguntas?.length) return [];
  const { data: opcoes } = await supabase.from('item_pergunta_opcoes')
    .select('*').in('pergunta_id', perguntas.map((p: any) => p.id)).order('ordem');
  const porPergunta = new Map<string, any[]>();
  (opcoes || []).forEach((o: any) => {
    if (!porPergunta.has(o.pergunta_id)) porPergunta.set(o.pergunta_id, []);
    porPergunta.get(o.pergunta_id)!.push(o);
  });
  return perguntas.map((p: any) => ({ ...p, opcoes: porPergunta.get(p.id) || [] }));
}

/**
 * PERGUNTAS DA OP (15/10/2026, pedido do usuário): "Caracterizada ou Descaracterizada?" e "Bateria frontal ou traseira?" não são de nenhum item
 * — mudam o chicote e o suporte independente do que foi vendido. São as mesmas perguntas do banco, só que SEM item (`item_id` nulo): assim a resposta,
 * a pergunta-filha e a tela de resposta em lote seguem iguais. Só valem, como as demais, quando a venda leva o Conjunto Elétrico.
 */
export const ehPerguntaDaOp = (p: any) => !p?.item_id;

/** Rótulo curto de quem é dona da pergunta, para as telas. */
export const donaDaPergunta = (p: any) => (ehPerguntaDaOp(p) ? 'da OP' : (p?.cadastro_itens?.nome || ''));

/** As perguntas da OP, com as respostas possíveis dentro. Lança erro se a leitura falhar: lista vazia por falha esconderia a pergunta do vendedor. */
export async function perguntasDaOp() {
  const { data: perguntas, error } = await supabase.from('item_perguntas')
    .select('*').is('item_id', null).order('ordem').order('id');
  if (error) throw new Error(error.message);
  if (!perguntas?.length) return [];
  const { data: opcoes, error: eo } = await supabase.from('item_pergunta_opcoes')
    .select('*').in('pergunta_id', perguntas.map((p: any) => p.id)).order('ordem').order('id');
  if (eo) throw new Error(eo.message);
  const porPergunta = new Map<string, any[]>();
  (opcoes || []).forEach((o: any) => {
    if (!porPergunta.has(o.pergunta_id)) porPergunta.set(o.pergunta_id, []);
    porPergunta.get(o.pergunta_id)!.push(o);
  });
  return perguntas.map((p: any) => ({ ...p, opcoes: porPergunta.get(p.id) || [] }));
}

/**
 * Tudo o que a venda pode perguntar: as da OP primeiro, depois as dos itens vendidos.
 *
 * `vendidosIds` (todos os itens da venda): quando informado, tira as perguntas cuja condição "só quando estes itens forem vendidos juntos"
 * (`quando_itens`) não se cumpre. Sem ele nada é filtrado — é o caso da tela em lote, que junta várias OPs e filtra OP por OP.
 */
export async function perguntasDaVenda(itemIds: string[], vendidosIds: string[] | null = null) {
  const [daOp, dosItens] = await Promise.all([perguntasDaOp(), perguntasDeVariosItens(itemIds)]);
  const todas = [...daOp, ...dosItens];
  if (!vendidosIds) return todas;
  const vendidos = new Set(vendidosIds.filter(Boolean).map(String));
  return todas.filter(p => perguntaCabeNaVenda(p, vendidos));
}

// ── Pergunta de quantidade e condição de itens (etapa 2, 15/10/2026) ─────────

/**
 * A pergunta só vale quando TODOS os itens de `quando_itens` estão na venda (vazio = sempre) e, se houver `quando_algum_item`, quando PELO MENOS UM deles está.
 * `quando_tambem_algum_item` é um SEGUNDO "algum de", que também precisa ser cumprido (27/10/2026): o parachoque de impulsão não é um item só (o item-base 171 e um por carro, como o 4439 da Ranger),
 * então "parachoque de impulsão vendido junto com slimled" = algum parachoque (esta lista) E algum slimled (`quando_algum_item`).
 * Decidido com o usuário em 22/10/2026: "Slimled será fixado no PCI ou na GRADE?" só aparece com parachoque de impulsão vendido junto com slimled — e slimled
 * tem vários modelos e cores, por isso o "algum de".
 */
export function perguntaCabeNaVenda(p: any, vendidos: Set<string>) {
  const cond = (p?.quando_itens || []).map(String).filter(Boolean);
  const algum = (p?.quando_algum_item || []).map(String).filter(Boolean);
  const tambem = (p?.quando_tambem_algum_item || []).map(String).filter(Boolean);
  return cond.every((id: string) => vendidos.has(id))
    && (!algum.length || algum.some((id: string) => vendidos.has(id)))
    && (!tambem.length || tambem.some((id: string) => vendidos.has(id)));
}

/**
 * Pergunta de QUANTIDADE ("quantos slimled na frente?"): quem responde digita um número. Para caber nos mesmos mapas das respostas por opção
 * (pergunta_id → texto), a resposta numérica viaja como "q:4". No banco vai para `valor_numerico`, com `opcao_id` nulo.
 */
export const ehQuantidade = (p: any) => p?.tipo === 'quantidade';
export const respostaDeQuantidade = (n: number) => `q:${n}`;
export const valorDeQuantidade = (v: any): number | null =>
  (typeof v === 'string' && v.startsWith('q:') && v.length > 2 && Number.isFinite(Number(v.slice(2)))) ? Number(v.slice(2)) : null;

/** Do mapa de respostas para as colunas do banco. */
export const camposDaResposta = (v: string) => {
  const n = valorDeQuantidade(v);
  return n === null ? { opcao_id: v, valor_numerico: null } : { opcao_id: null, valor_numerico: n };
};
/** Da linha do banco para o valor do mapa de respostas. */
export const valorSalvo = (r: any): string =>
  r?.opcao_id || (r?.valor_numerico !== null && r?.valor_numerico !== undefined ? respostaDeQuantidade(Number(r.valor_numerico)) : '');

/**
 * Quais perguntas cabe fazer agora.
 *
 * Só entra a pergunta cujo "pai" já foi respondido com a resposta que leva a
 * ela — é o que faz "hack alto ou baixo?" só aparecer depois de alguém dizer
 * que o carro tem hack.
 */
export function perguntasPendentes(perguntas: any[], respostas: Record<string, string>) {
  const escolhidas = new Set(Object.values(respostas || {}));
  return (perguntas || []).filter(p => {
    if (respostas?.[p.id]) return false;
    if (!p.opcao_pai_id) return true;
    return escolhidas.has(p.opcao_pai_id);
  });
}

/**
 * O que a venda já responde sozinha.
 *
 * Caso real do usuário: vendeu parachoque de impulsão e slimled juntos? Os
 * slimled prendem direto no parachoque, então o suporte deles sai — e ninguém
 * precisa ser perguntado.
 */
export function respostasAutomaticas(perguntas: any[], itensVendidosIds: string[]) {
  const vendidos = new Set((itensVendidosIds || []).filter(Boolean).map(String));
  const auto: Record<string, string> = {};
  for (const p of perguntas || []) {
    for (const o of p.opcoes || []) {
      const combo = (o.auto_quando_itens || []).map(String).filter(Boolean);
      if (!combo.length) continue;
      if (combo.every(id => vendidos.has(id))) { auto[p.id] = o.id; break; }
    }
  }
  return auto;
}

// ── Material (no veículo) ────────────────────────────────────────────────────

/** Material que os itens vendidos consomem naquele veículo. */
export async function materiaisDoVeiculo(veiculoId: string, itemIds: string[]) {
  const ids = [...new Set((itemIds || []).filter(Boolean).map(String))];
  if (!veiculoId || !ids.length) return [];
  const { data } = await supabase.from('veiculo_item_materiais')
    .select('*, material:cadastro_itens!material_item_id(id,codigo,nome,unidade,controla_estoque)')
    .eq('veiculo_id', veiculoId).in('item_id', ids).order('ordem');
  return data || [];
}

/** Quais destes itens ainda NÃO foram adaptados neste carro. */
export async function itensSemEstrutura(veiculoId: string, itemIds: string[]) {
  const ids = [...new Set((itemIds || []).filter(Boolean).map(String))];
  if (!veiculoId || !ids.length) return ids;
  const { data } = await supabase.from('veiculo_item_materiais')
    .select('item_id').eq('veiculo_id', veiculoId).in('item_id', ids);
  const comEstrutura = new Set((data || []).map((d: any) => String(d.item_id)));
  return ids.filter(id => !comEstrutura.has(id));
}

/** Perguntas de quantidade que algum material deste veículo usa para multiplicar. Lança erro se a leitura falhar (a tela diria "sem regra" para pergunta que tem uso). */
export async function perguntasQueMultiplicamNoVeiculo(veiculoId: string) {
  if (!veiculoId) return new Set<string>();
  const linhas = await lerPaginado(() => supabase.from('veiculo_item_materiais').select('multiplicar_pergunta_id')
    .eq('veiculo_id', veiculoId).not('multiplicar_pergunta_id', 'is', null).order('id'));
  return new Set<string>(linhas.map((l: any) => String(l.multiplicar_pergunta_id)));
}

/**
 * Resumo do material POR ITEM de um veículo: para cada item, quantas linhas valem sempre e quantas dependem de uma resposta. Só para a tela da Estrutura mostrar,
 * ao lado das regras, tudo o que decide material naquele carro (Fase 3, 16/10/2026). Lança erro se a leitura falhar: lista vazia por falha pareceria "nenhum item tem material".
 * Paginada: o banco corta em 1.000 linhas por consulta.
 */
export async function resumoDoMaterialPorItem(veiculoId: string) {
  if (!veiculoId) return [];
  const linhas = await lerPaginado(() => supabase.from('veiculo_item_materiais').select('item_id,opcao_id').eq('veiculo_id', veiculoId).order('id'));
  const porItem = new Map<string, { item_id: string; fixas: number; porResposta: number }>();
  for (const l of linhas) {
    const atual = porItem.get(String(l.item_id)) || { item_id: String(l.item_id), fixas: 0, porResposta: 0 };
    if (l.opcao_id) atual.porResposta++; else atual.fixas++;
    porItem.set(String(l.item_id), atual);
  }
  return [...porItem.values()];
}

/**
 * Monta a lista de material a partir das respostas.
 *
 * Ordem importa: ADICIONA tudo antes de REMOVER qualquer coisa. Se as remoções
 * rodassem na ordem de cadastro, um "tira o suporte" declarado antes do "usa o
 * suporte" não teria efeito, e a regra do parachoque falharia em silêncio — o
 * pior tipo de falha para quem separa material.
 */
export function montarMaterial(materiais: any[], respostas: Record<string, string>, qtdPorItem: Record<string, number> = {}) {
  const escolhidas = new Set(Object.values(respostas || {}).filter(Boolean));
  const vale = (m: any) => !m.opcao_id || escolhidas.has(m.opcao_id);
  const linhas = (materiais || []).filter(vale);
  // 22/10/2026 (pedido do usuário, Slimled): a linha pode multiplicar pela RESPOSTA de uma pergunta de quantidade do item ("Quantos na frente?") em vez da
  // quantidade vendida — só a dianteira leva suporte e parafuso, e a venda sempre diz quantos vão na frente e quantos atrás. Sem resposta vale 0: o material
  // não entra até alguém responder (a pergunta aparece pendente na OP), em vez de entrar na quantidade errada.
  const mult = (m: any) => m.multiplicar_pergunta_id
    ? (valorDeQuantidade(respostas?.[m.multiplicar_pergunta_id]) ?? 0)
    : (num(qtdPorItem?.[m.item_id]) || 1);

  const soma = new Map<string, any>();
  for (const m of linhas.filter(x => x.acao !== 'remover')) {
    const it = m.material || {};
    const q = num(m.quantidade) * mult(m);
    if (q <= 0) continue;
    const atual = soma.get(m.material_item_id);
    if (atual) atual.quantidade += q;
    else soma.set(m.material_item_id, {
      item_id: m.material_item_id, nome: it.nome || '(item)', codigo: it.codigo || '',
      unidade: it.unidade || 'UN', quantidade: q, nao_cadastrado: false,
    });
  }
  for (const m of linhas.filter(x => x.acao === 'remover')) {
    const atual = soma.get(m.material_item_id);
    if (!atual) continue;
    const q = num(m.quantidade) * mult(m);
    if (!num(m.quantidade) || atual.quantidade <= q) soma.delete(m.material_item_id);
    else atual.quantidade -= q;
  }
  return [...soma.values()];
}

// ── Regras "se… então…" por veículo (etapa 3, 15/10/2026) ───────────────────
//
// Pedido do usuário: o chicote principal (e o suporte) depende de respostas da OP (caracterizada, bateria), de itens vendidos juntos (sirene S100W, arrow8…)
// e de quantidades (slimled: 2 na frente → chicote de 2 luzes), e isso muda de carro para carro — por isso a regra é SEMPRE de um veículo.
// Uma regra vale quando TODAS as condições se cumprem; várias regras podem valer ao mesmo tempo e o material delas soma. Quantidade é POR OP (por carro),
// diferente do material por item, que multiplica pela quantidade vendida: o chicote Der. Fr. p/ 2 luzes é um por carro, não um por slimled.

/** Regras de um veículo, com condições e materiais dentro. Lança erro se a leitura falhar: lista vazia por falha deixaria a OP sem chicote em silêncio. */
export async function regrasDoVeiculo(veiculoId: string) {
  if (!veiculoId) return [];
  const { data: regras, error } = await supabase.from('veiculo_regras')
    .select('*').eq('veiculo_id', veiculoId).order('ordem').order('criado_em').order('id');
  if (error) throw new Error(error.message);
  if (!regras?.length) return [];
  const ids = regras.map((r: any) => r.id);
  const [rc, rm] = await Promise.all([
    supabase.from('veiculo_regra_condicoes').select('*').in('regra_id', ids),
    supabase.from('veiculo_regra_materiais')
      .select('*, material:cadastro_itens!material_item_id(id,codigo,nome,unidade,controla_estoque)').in('regra_id', ids).order('ordem'),
  ]);
  if (rc.error) throw new Error(rc.error.message);
  if (rm.error) throw new Error(rm.error.message);
  return regras.map((r: any) => ({
    ...r,
    condicoes: (rc.data || []).filter((c: any) => c.regra_id === r.id),
    materiais: (rm.data || []).filter((m: any) => m.regra_id === r.id),
  }));
}

/**
 * Quais regras valem para esta OP, o material que elas dão e o que ficou sem regra.
 *
 * `perguntas`: as que a venda comporta (já filtradas pela condição de itens juntos); `respostas`: pergunta_id → valor (as já podadas).
 *
 * `semRegra` é o "chicote a definir": pergunta da OP ou de quantidade que foi respondida e que NENHUMA regra aplicada deste veículo usa. Quantidade 0
 * não entra ("0 na frente" não pede chicote). Resposta de pergunta de item por opção não entra: essas seguem pelo material do item no veículo.
 */
export function avaliarRegras(regras: any[], { respostas, vendidosIds, perguntas, materiais }: { respostas: Record<string, string>; vendidosIds: string[]; perguntas: any[]; materiais?: any[] }) {
  const escolhidas = new Set(Object.values(respostas || {}).filter(Boolean));
  const vendidos = new Set((vendidosIds || []).filter(Boolean).map(String));
  const vale = (c: any) => c.tipo === 'resposta' ? escolhidas.has(c.opcao_id)
    : c.tipo === 'item' ? vendidos.has(String(c.item_id))
    : valorDeQuantidade(respostas?.[c.pergunta_id]) === Number(c.valor_numerico);
  // regra sem condição nenhuma não vale (valeria para toda OP): não deveria existir, e a tela não deixa criar
  const aplicadas = (regras || []).filter(r => (r.condicoes || []).length > 0 && r.condicoes.every(vale));

  const linhas = aplicadas.flatMap(r => (r.materiais || []).map((m: any) => ({ ...m, regra_id: r.id, opcao_id: null, item_id: null })));
  const itensCobertos = new Set<string>();
  const perguntasCobertas = new Set<string>();
  // pergunta de quantidade que o material do item usa para multiplicar (Slimled: "Quantos na frente?") já tem o que fazer: não é "chicote a definir"
  (materiais || []).forEach((m: any) => { if (m.multiplicar_pergunta_id) perguntasCobertas.add(String(m.multiplicar_pergunta_id)); });
  const perguntaDaOpcao = new Map<string, string>();
  (perguntas || []).forEach(p => (p.opcoes || []).forEach((o: any) => perguntaDaOpcao.set(o.id, p.id)));
  aplicadas.forEach(r => r.condicoes.forEach((c: any) => {
    if (c.tipo === 'item') itensCobertos.add(String(c.item_id));
    if (c.tipo === 'quantidade') perguntasCobertas.add(c.pergunta_id);
    if (c.tipo === 'resposta' && perguntaDaOpcao.has(c.opcao_id)) perguntasCobertas.add(perguntaDaOpcao.get(c.opcao_id)!);
  }));

  const semRegra: { pergunta_id: string; texto: string; resposta: string }[] = [];
  for (const p of perguntas || []) {
    const v = respostas?.[p.id];
    if (!v || !(ehPerguntaDaOp(p) || ehQuantidade(p)) || perguntasCobertas.has(p.id)) continue;
    const n = valorDeQuantidade(v);
    if (n === 0) continue;
    const resposta = n !== null ? String(n) : ((p.opcoes || []).find((o: any) => o.id === v)?.rotulo || '—');
    semRegra.push({ pergunta_id: p.id, texto: p.texto, resposta });
  }
  return { aplicadas, linhas, itensCobertos, semRegra };
}

/** Todas as perguntas (da OP e de itens), com as respostas dentro — para montar as condições das regras. */
export async function todasAsPerguntas() {
  const { data: perguntas, error } = await supabase.from('item_perguntas')
    .select('*, cadastro_itens(id,nome,codigo)').order('ordem').order('id');
  if (error) throw new Error(error.message);
  if (!perguntas?.length) return [];
  const { data: opcoes, error: eo } = await supabase.from('item_pergunta_opcoes')
    .select('*').in('pergunta_id', perguntas.map((p: any) => p.id)).order('ordem').order('id');
  if (eo) throw new Error(eo.message);
  return perguntas.map((p: any) => ({ ...p, opcoes: (opcoes || []).filter((o: any) => o.pergunta_id === p.id) }));
}

/**
 * Copia as regras de um veículo para outro (o histórico tem 91 modelos: recomeçar do zero em cada um não é viável). Soma às que o destino já tem; quem
 * chama avisa. Desde 16/10/2026 (Fase 2 da Estrutura) é UMA chamada à função `estrutura_copiar_regras` do banco: tudo ou nada. Antes eram 3 gravações por regra
 * feitas pelo navegador, com desfazer manual, e uma queda no meio deixava o destino com parte das regras ("Foram copiadas 3 de 7").
 */
export async function copiarRegras(origemId: string, destinoId: string, currentUser: any) {
  if (!origemId || !destinoId || origemId === destinoId) return { copiadas: 0, erro: 'Escolha dois veículos diferentes.' };
  const { data, error } = await supabase.rpc('estrutura_copiar_regras', {
    p_origem: origemId, p_destino: destinoId, p_criado_por_nome: currentUser?.nome || '—',
  });
  if (error) return { copiadas: 0, erro: error.message };
  return { copiadas: Number(data) || 0, erro: null };
}

// ── Copiar estrutura e perguntas de um item para outro (15/10/2026) ──────────
//
// Pedido do usuário: o catálogo tem 17 variantes de slimled (cor, lente, G2…) e as perguntas e o material de uma servem para as outras; recadastrar tudo
// em cada uma não é viável. A cópia leva, à escolha: as PERGUNTAS (com respostas, perguntas-filhas, condição de itens e resposta automática), o MATERIAL POR
// VEÍCULO do item e as REGRAS de chicote/suporte dos veículos que usam essas perguntas ou o item. Sempre SOMA ao que o destino já tem — nunca apaga nem
// substitui. Desde 16/10/2026 (Fase 2) é UMA chamada à função `estrutura_copiar_item` do banco, tudo ou nada: se algo falhar no meio, nada fica copiado (antes o
// navegador criava pergunta por pergunta e tentava desfazer sozinho, e uma queda de internet podia deixar a cópia pela metade).
//
// As regras copiadas precisam apontar para as perguntas e respostas NOVAS do destino: uma regra "quantos na frente = 4" aponta para a pergunta do slimled
// de origem, e sem esse ajuste a regra não valeria para o destino ("chicote a definir").

export type OpcoesDaCopia = { perguntas: boolean; materiais: boolean; regras: boolean; veiculoId: string | null };   // veiculoId nulo = todos os veículos

async function lerOrigemDaCopia(origemId: string, veiculoId: string | null) {
  const ler = (r: any) => { if (r.error) throw new Error(r.error.message); return r.data || []; };
  const perguntas = ler(await supabase.from('item_perguntas').select('*').eq('item_id', origemId).order('ordem').order('id'));
  const perguntaIds = perguntas.map((p: any) => p.id);
  const opcoes = perguntaIds.length
    ? ler(await supabase.from('item_pergunta_opcoes').select('*').in('pergunta_id', perguntaIds).order('ordem').order('id')) : [];
  let qm = supabase.from('veiculo_item_materiais').select('*').eq('item_id', origemId).order('ordem').order('id');
  if (veiculoId) qm = qm.eq('veiculo_id', veiculoId);
  const materiais = ler(await qm);

  // regras que citam as perguntas, as respostas ou o próprio item de origem
  const regraIds = new Set<string>();
  const achar = async (coluna: string, valores: string[]) => {
    for (let i = 0; i < valores.length; i += 100) {
      ler(await supabase.from('veiculo_regra_condicoes').select('regra_id').in(coluna, valores.slice(i, i + 100))).forEach((c: any) => regraIds.add(c.regra_id));
    }
  };
  await achar('pergunta_id', perguntaIds);
  await achar('opcao_id', opcoes.map((o: any) => o.id));
  await achar('item_id', [origemId]);
  let regras: any[] = [];
  if (regraIds.size) {
    let qr = supabase.from('veiculo_regras').select('*').in('id', [...regraIds]).order('ordem').order('id');
    if (veiculoId) qr = qr.eq('veiculo_id', veiculoId);
    regras = ler(await qr);
    if (regras.length) {
      const ids = regras.map((r: any) => r.id);
      const conds = ler(await supabase.from('veiculo_regra_condicoes').select('*').in('regra_id', ids));
      const mats = ler(await supabase.from('veiculo_regra_materiais').select('*').in('regra_id', ids).order('ordem'));
      regras = regras.map((r: any) => ({ ...r, condicoes: conds.filter((c: any) => c.regra_id === r.id), materiais: mats.filter((m: any) => m.regra_id === r.id) }));
    }
  }
  return { perguntas, opcoes, materiais, regras };
}

/** Quanto há para copiar de um item (para a tela mostrar antes de o usuário confirmar). Lança erro se a leitura falhar. */
export async function resumoDaCopia(origemId: string, veiculoId: string | null) {
  const o = await lerOrigemDaCopia(origemId, veiculoId);
  return { perguntas: o.perguntas.length, respostas: o.opcoes.length, materiais: o.materiais.length, regras: o.regras.length };
}

export async function copiarEstruturaDeItem({ origemId, destinoId, opcoes, currentUser }: { origemId: string; destinoId: string; opcoes: OpcoesDaCopia; currentUser: any }) {
  if (!origemId || !destinoId || origemId === destinoId) return { erro: 'Escolha um item de origem diferente deste.' };
  const { data, error } = await supabase.rpc('estrutura_copiar_item', {
    p_origem: origemId, p_destino: destinoId,
    p_perguntas: !!opcoes.perguntas, p_materiais: !!opcoes.materiais, p_regras: !!opcoes.regras,
    p_veiculo: opcoes.veiculoId || null, p_criado_por_nome: currentUser?.nome || '—',
  });
  if (error || !data) return { erro: error?.message || 'sem resposta do banco', desfeito: true };
  return {
    perguntas: Number(data.perguntas) || 0, respostas: Number(data.respostas) || 0, materiais: Number(data.materiais) || 0, regras: Number(data.regras) || 0,
    materiaisSemResposta: Number(data.materiais_sem_resposta) || 0, regrasPuladas: Number(data.regras_puladas) || 0, erro: null,
  };
}

// ── Histórico da estrutura (16/10/2026, Fase 2) ──────────────────────────────
//
// Antes, ninguém sabia quem mudou uma regra, uma pergunta ou o material de um carro — e uma OP que saiu com o chicote errado não tinha de onde tirar o motivo.
// Cada mudança da tela grava uma linha em `audit_log` (módulo "estrutura"), como o resto do projeto faz com `logChange`; a frase vai em `metadata.descricao`.
// O histórico NUNCA atrapalha a ação: a gravação do banco já foi feita, e falha ao registrar é ignorada (só aparece no console).
export async function registrarNaEstrutura(currentUser: any, { entidade, id, acao, descricao, antes, depois, formatadores, detalhes }: {
  entidade: string; id: string; acao: 'CREATE' | 'UPDATE' | 'DELETE'; descricao: string; antes?: any; depois?: any; formatadores?: any; detalhes?: any;
}) {
  try {
    await logChange({
      module: 'estrutura', entityType: entidade, entityId: id, changeType: acao, oldRow: antes, newRow: depois,
      user: currentUser, formatters: formatadores, metadata: { descricao, ...(detalhes || {}) },
    });
  } catch (e: any) { console.error('Histórico da estrutura: não foi possível registrar —', e?.message || e); }
}

/** Onde um item é usado na estrutura (perguntas, listas de "aparece só com…" e "automática se…", regras, material por carro, chicote). Só leitura; lança erro se falhar. */
export async function ondeOItemEUsado(itemId: string) {
  // GET: a função só lê (STABLE) — assim ela passa como leitura mesmo onde as gravações estão bloqueadas
  const { data, error } = await supabase.rpc('estrutura_onde_item_e_usado', { p_item_id: itemId }, { get: true });
  if (error) throw new Error(error.message);
  const n = (k: string) => Number(data?.[k]) || 0;
  return {
    perguntasDoItem: n('perguntas_do_item'), apareceSoCom: n('aparece_so_com'), respostasAutomaticas: n('respostas_automaticas'),
    regrasQueExigem: n('regras_que_exigem_o_item'), regrasComoMaterial: n('regras_que_usam_como_material'),
    materialPorCarroDoItem: n('material_por_carro_do_item'), materialPorCarroComoMaterial: n('material_por_carro_como_material'), chicote: n('chicote_materiais'),
  };
}

/** Frase curta do que a lista de "onde é usado" mostra ("2 regras, 1 pergunta…"); vazio se o item não aparece na estrutura. */
export function fraseDeOndeOItemEUsado(u: any) {
  if (!u) return '';
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return [
    u.perguntasDoItem ? plural(u.perguntasDoItem, 'pergunta cadastrada nele', 'perguntas cadastradas nele') : '',
    u.apareceSoCom ? plural(u.apareceSoCom, 'pergunta que só aparece com ele', 'perguntas que só aparecem com ele') : '',
    u.respostasAutomaticas ? plural(u.respostasAutomaticas, 'resposta automática', 'respostas automáticas') : '',
    u.regrasQueExigem ? plural(u.regrasQueExigem, 'regra que exige a venda dele', 'regras que exigem a venda dele') : '',
    u.regrasComoMaterial ? plural(u.regrasComoMaterial, 'regra que o usa como material', 'regras que o usam como material') : '',
    u.materialPorCarroDoItem ? plural(u.materialPorCarroDoItem, 'linha de material por carro dele', 'linhas de material por carro dele') : '',
    u.materialPorCarroComoMaterial ? plural(u.materialPorCarroComoMaterial, 'linha de material por carro que o usa', 'linhas de material por carro que o usam') : '',
    u.chicote ? plural(u.chicote, 'ligação de chicote', 'ligações de chicote') : '',
  ].filter(Boolean).join(', ');
}

// ── Catálogo inteiro para os seletores ───────────────────────────────────────

/**
 * Todos os itens ATIVOS do catálogo, em ordem de nome, para alimentar seletor.
 *
 * O servidor devolve no máximo 1.000 linhas por consulta e ignora `.limit(5000)`
 * (medido em 29/09/2026: pedir 5.000 devolve 1.000). Os dois seletores que
 * liam assim — Admin > Estruturas e a estrutura do chicote — só enxergavam os
 * 1.000 primeiros de 4.429 itens: nenhum "CONJUNTO ELETRICO" (que começa depois
 * do milésimo) podia ser escolhido. Aqui se pagina com `.range` até esgotar,
 * como já faz o Cadastro de Itens (achado A8 do PLANO_UX_FLUXO_TRABALHO.md).
 *
 * O desempate por `id` é obrigatório: há nomes repetidos no catálogo ("CONJUNTO
 * ELÉTRICO" três vezes) e, sem ordem total, o banco pode embaralhar os empatados
 * entre uma página e a seguinte — item que aparece duas vezes ou que some.
 *
 * `colunas` é a lista do `select` (ex.: 'id,codigo,nome'). Só leitura.
 */
export async function itensAtivosDoCatalogo(colunas: string): Promise<any[]> {
  const PAGINA_SUPABASE = 1000;
  let lista: any[] = [];
  for (let de = 0; ; de += PAGINA_SUPABASE) {
    const { data, error } = await supabase.from('cadastro_itens').select(colunas)
      .eq('ativo', true).order('nome').order('id')
      .range(de, de + PAGINA_SUPABASE - 1);
    // falha no meio não pode passar por lista completa em silêncio — foi
    // exatamente esse silêncio que escondeu o corte de 1.000 por tanto tempo
    if (error) { console.error('Catálogo de itens: falha ao ler a página a partir de', de, error.message); break; }
    const pagina = (data || []) as any[];
    lista = lista.concat(pagina);
    if (pagina.length < PAGINA_SUPABASE) break;
  }
  return lista;
}

// ── O interruptor ────────────────────────────────────────────────────────────

/** Itens marcados como "Conjunto Elétrico" no cadastro.
 *  Nome oficial decidido com o usuário em 29/09/2026 (Etapa 5.3 do
 *  PLANO_UX_FLUXO_TRABALHO.md): é o que o catálogo e as notas já chamam — são
 *  centenas de itens "CONJUNTO ELETRICO PV …". A coluna do banco continua
 *  `eh_conjunto_instalacao`: é o mesmo conceito, e renomear coluna não vale o
 *  risco para um nome que ninguém vê. */
export async function itensConjunto() {
  const { data } = await supabase.from('cadastro_itens')
    .select('id,codigo,nome').eq('eh_conjunto_instalacao', true).eq('ativo', true);
  return data || [];
}

/**
 * A venda leva Conjunto Elétrico?
 *
 * Só se levar é que a estrutura do veículo entra. Sem conjunto, o cliente está
 * usando suporte e chicote de terceiros — e o sistema não tem o que montar.
 */
export function vendaTemConjunto(vendidos: any[], idsConjunto: string[]) {
  const conj = new Set((idsConjunto || []).map(String));
  return (vendidos || []).some(v => v?.item_id && conj.has(String(v.item_id)));
}

/**
 * ITEM QUE VEM INCLUSO (regra do usuário em 28/10/2026): "barra sinalizadora G2 sempre leva o amplificador incluso". O item vendido pode trazer outro item junto (`cadastro_itens.inclui_item_id`; hoje o amplificador
 * S100W nas barras G2), que NÃO está na venda mas entra na lista de material e conta como vendido no cálculo da estrutura (o material de instalação dele, as perguntas e as regras valem). Se a venda já traz o
 * item incluso, ele não é somado de novo. A quantidade é a do item que o inclui. Devolve linhas prontas para a BOM (`incluso: true`); lança erro se a leitura falhar.
 */
export async function itensInclusos(vendidos: any[]): Promise<any[]> {
  const lista = (Array.isArray(vendidos) ? vendidos : []).filter(v => v?.item_id);
  const ids = [...new Set(lista.map((v: any) => String(v.item_id)))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('cadastro_itens').select('id,codigo,inclui_item_id').in('id', ids).not('inclui_item_id', 'is', null);
  if (error) throw new Error('não foi possível conferir os itens que vêm incluídos (' + error.message + ')');
  const quem = new Map<string, { qtd: number; de: string[] }>();
  for (const d of (data || [])) {
    const qtd = lista.filter((v: any) => String(v.item_id) === String(d.id)).reduce((s: number, v: any) => s + (num(v.quantidade) || 1), 0);
    const alvo = String(d.inclui_item_id);
    const x = quem.get(alvo) || { qtd: 0, de: [] };
    x.qtd += qtd; x.de.push(d.codigo || ''); quem.set(alvo, x);
  }
  const faltam = [...quem.keys()].filter(id => !ids.includes(id));   // já vendido junto: não soma de novo
  if (!faltam.length) return [];
  const { data: itens, error: e2 } = await supabase.from('cadastro_itens').select('id,codigo,nome,unidade').in('id', faltam).neq('ativo', false);
  if (e2) throw new Error('não foi possível ler os itens que vêm incluídos (' + e2.message + ')');
  return (itens || []).map((i: any) => ({
    item_id: i.id, codigo: i.codigo || '', nome: i.nome, unidade: i.unidade || 'UN', quantidade: quem.get(String(i.id))!.qtd,
    descricao: `incluso com o item ${quem.get(String(i.id))!.de.filter(Boolean).join(', ')}`, nao_cadastrado: false, incluso: true,
  }));
}

/**
 * Linha vendida SEM o vínculo com o cadastro (digitada à mão, ou vinda da formação de preços sem o item_id) ganha o item_id quando o NOME dela acha exatamente UM item ativo do
 * cadastro (dois com o mesmo nome é ambíguo e não se chuta; a mesma regra da BOM sugerida). Sem isso a venda de uma OP com todas as linhas sem vínculo — caso da OP A1741.2610,
 * 27/10/2026 — tinha o 'CONJUNTO ELETRICO' escrito e o sistema dizia que a venda não leva Conjunto Elétrico, porque o interruptor só reconhece o item pelo vínculo.
 * Não grava nada: devolve cópias das linhas. A leitura que falha lança o erro (nunca vale como 'não achou').
 */
export async function completarItensPeloNome(vendidos: any[]): Promise<any[]> {
  const lista = Array.isArray(vendidos) ? vendidos : [];
  const faltam = lista.filter(v => v && !v.item_id && !v.produto_id && String(v.nome || '').trim());
  if (!faltam.length) return lista;
  const chaves = [...new Set(faltam.map(v => normalizarBusca(String(v.nome)).trim()).filter(Boolean))];
  const { data, error } = await supabase.from('cadastro_itens').select('id,nome_norm').in('nome_norm', chaves).neq('ativo', false);
  if (error) throw new Error('não foi possível procurar os itens vendidos no cadastro pelo nome (' + error.message + ')');
  const porNome = new Map<string, string[]>();
  for (const c of (data || [])) porNome.set(c.nome_norm, [...(porNome.get(c.nome_norm) || []), c.id]);
  return lista.map(v => {
    if (!v || v.item_id || v.produto_id || !String(v.nome || '').trim()) return v;
    const achados = porNome.get(normalizarBusca(String(v.nome)).trim()) || [];
    return achados.length === 1 ? { ...v, item_id: achados[0] } : v;
  });
}

// ── Respostas das OPs ────────────────────────────────────────────────────────

/**
 * Tira as respostas que perderam o sentido: a resposta a uma pergunta "filha" só vale
 * se a resposta-pai que leva a ela está escolhida. Sem isso, trocar "Tem hack" por
 * "Não tem" deixaria a resposta de "hack alto ou baixo?" ligada, e o material dela
 * continuaria entrando na BOM (`montarMaterial` conta toda opção escolhida).
 */
export function podarRespostas(perguntas: any[], respostas: Record<string, string>) {
  const r: Record<string, string> = { ...(respostas || {}) };
  for (let volta = 0; volta < 10; volta++) {
    const escolhidas = new Set(Object.values(r).filter(Boolean));
    let mudou = false;
    for (const p of perguntas || []) {
      if (r[p.id] && p.opcao_pai_id && !escolhidas.has(p.opcao_pai_id)) { delete r[p.id]; mudou = true; }
    }
    if (!mudou) break;
  }
  return r;
}

/** Respostas já gravadas de várias OPs: mapa opl_id → { pergunta_id → { opcao_id, automatica } }. */
export async function respostasDasOps(oplIds: string[]) {
  const ids = [...new Set((oplIds || []).filter(Boolean).map(String))];
  const mapa: Record<string, Record<string, { opcao_id: string; automatica: boolean }>> = {};
  ids.forEach(id => { mapa[id] = {}; });
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('op_configuracao_respostas')
      .select('opl_id,pergunta_id,opcao_id,valor_numerico,automatica').in('opl_id', ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    // `opcao_id` devolve o valor já unificado ("q:4" nas perguntas de quantidade): quem lê trata como texto opaco
    (data || []).forEach((r: any) => { (mapa[r.opl_id] ||= {})[r.pergunta_id] = { opcao_id: valorSalvo(r), automatica: !!r.automatica }; });
  }
  return mapa;
}

/** Como a OPL quer o veículo naquele tipo de venda. */
export async function modoDoVeiculo(fluxo: string) {
  return (await modoDoVeiculoOuErro(fluxo)).modo;
}

/** Como modoDoVeiculo, mas diz quando a leitura falhou (14/10/2026, 7.x do NovaOpOsModal): sem isso a regra "veículo obrigatório" voltava "opcional" em silêncio. */
export async function modoDoVeiculoOuErro(fluxo: string): Promise<{ modo: string; erro: string | null }> {
  if (!fluxo) return { modo: 'opcional', erro: null };
  const { data, error } = await supabase.from('fluxo_config')
    .select('veiculo_modo').eq('fluxo', fluxo).maybeSingle();
  return { modo: data?.veiculo_modo || 'opcional', erro: error ? error.message : null };
}
