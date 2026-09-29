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
  const mult = (m: any) => num(qtdPorItem?.[m.item_id]) || 1;

  const soma = new Map<string, any>();
  for (const m of linhas.filter(x => x.acao !== 'remover')) {
    const it = m.material || {};
    const q = num(m.quantidade) * mult(m);
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

/** Como a OPL quer o veículo naquele tipo de venda. */
export async function modoDoVeiculo(fluxo: string) {
  if (!fluxo) return 'opcional';
  const { data } = await supabase.from('fluxo_config')
    .select('veiculo_modo').eq('fluxo', fluxo).maybeSingle();
  return data?.veiculo_modo || 'opcional';
}
