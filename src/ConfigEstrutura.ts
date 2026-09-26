// ─────────────────────────────────────────────────────────────────────────────
// ESTRUTURA DE CONFIGURAÇÃO — veículo × item vendido
//
// Responde à pergunta: "o que a fábrica precisa separar para instalar ESTE item
// NESTE carro?". A resposta nem sempre é uma lista fixa — depende de variações
// do carro, e é por isso que existem perguntas.
//
// A árvore, nas palavras do usuário (26/09/2026):
//   "uma Nivus pode ter hack de teto ou não; se tiver, pode ser alto ou baixo"
// Ou seja: responder uma pergunta pode levar a OUTRA pergunta. Lista plana não
// daria conta — daí `opcao_pai_id` ligando pergunta a uma resposta anterior.
//
// E há o que NÃO se pergunta: "se tem parachoque de impulsão frontal e traseiro,
// não precisa de suporte". O sistema já sabe pelos itens vendidos. Isso é a
// opção com `auto_quando_itens`, combinada com material de ação 'remover'.
//
// Só cálculo e leitura; a tela mora em ConfigEstruturaTela.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export type Arvore = {
  estrutura: any;
  perguntas: any[];      // com .opcoes dentro
  materiais: any[];
};

/** Carrega a árvore inteira de um par veículo × item. Null se não existir. */
export async function carregarArvore(veiculoId: string, itemId: string): Promise<Arvore | null> {
  const { data: estrutura } = await supabase.from('config_estruturas')
    .select('*').eq('veiculo_id', veiculoId).eq('item_id', itemId).eq('ativo', true).maybeSingle();
  if (!estrutura) return null;
  return await carregarArvorePorId(estrutura.id, estrutura);
}

export async function carregarArvorePorId(estruturaId: string, estrutura?: any): Promise<Arvore> {
  const [{ data: est }, { data: perguntas }, { data: materiais }] = await Promise.all([
    estrutura ? Promise.resolve({ data: estrutura })
              : supabase.from('config_estruturas').select('*').eq('id', estruturaId).maybeSingle(),
    supabase.from('config_perguntas').select('*').eq('estrutura_id', estruturaId).order('ordem'),
    supabase.from('config_materiais')
      .select('*, cadastro_itens(id,codigo,nome,unidade,controla_estoque)')
      .eq('estrutura_id', estruturaId).order('ordem'),
  ]);
  const ids = (perguntas || []).map((p: any) => p.id);
  const { data: opcoes } = ids.length
    ? await supabase.from('config_opcoes').select('*').in('pergunta_id', ids).order('ordem')
    : { data: [] as any[] };
  const porPergunta = new Map<string, any[]>();
  (opcoes || []).forEach((o: any) => {
    if (!porPergunta.has(o.pergunta_id)) porPergunta.set(o.pergunta_id, []);
    porPergunta.get(o.pergunta_id)!.push(o);
  });
  return {
    estrutura: est,
    perguntas: (perguntas || []).map((p: any) => ({ ...p, opcoes: porPergunta.get(p.id) || [] })),
    materiais: materiais || [],
  };
}

/** Todas as estruturas já configuradas de um veículo, para a tela listar. */
export async function estruturasDoVeiculo(veiculoId: string) {
  const { data } = await supabase.from('config_estruturas')
    .select('*, cadastro_itens(id,codigo,nome)')
    .eq('veiculo_id', veiculoId).eq('ativo', true);
  return data || [];
}

/**
 * Quais perguntas precisam ser feitas, dado o que já foi respondido.
 *
 * Só entra na lista a pergunta cujo "pai" já foi respondido com a opção que
 * leva a ela — é isso que faz "qual altura do hack?" só aparecer depois de
 * alguém dizer que tem hack.
 */
export function perguntasPendentes(arvore: Arvore, respostas: Record<string, string>) {
  const escolhidas = new Set(Object.values(respostas || {}));
  return (arvore.perguntas || []).filter(p => {
    if (respostas?.[p.id]) return false;                       // já respondida
    if (!p.opcao_pai_id) return true;                          // primeiro nível
    return escolhidas.has(p.opcao_pai_id);                     // o pai abriu esta
  });
}

/**
 * Responde sozinho o que der, olhando os itens vendidos.
 *
 * "Se tem parachoque de impulsão frontal e traseiro, não precisa de suporte" —
 * o usuário não quer que isso seja perguntado, porque a venda já diz.
 * A opção vale quando TODOS os itens da combinação estão na venda.
 */
export function respostasAutomaticas(arvore: Arvore, itensVendidosIds: string[]) {
  const vendidos = new Set((itensVendidosIds || []).filter(Boolean).map(String));
  const auto: Record<string, string> = {};
  for (const p of arvore.perguntas || []) {
    for (const o of p.opcoes || []) {
      const combo = (o.auto_quando_itens || []).map(String).filter(Boolean);
      if (!combo.length) continue;
      if (combo.every(id => vendidos.has(id))) { auto[p.id] = o.id; break; }
    }
  }
  return auto;
}

/**
 * Monta a lista de material a partir das respostas.
 *
 * Ordem importa: primeiro tudo que ADICIONA, depois o que REMOVE. Senão um
 * "remover suporte" declarado antes do "adicionar suporte" não teria efeito —
 * e a regra do parachoque, que é justamente uma remoção, falharia em silêncio.
 */
export function materialDaConfiguracao(arvore: Arvore, respostas: Record<string, string>, multiplicador = 1) {
  const escolhidas = new Set(Object.values(respostas || {}).filter(Boolean));
  const vale = (m: any) => !m.opcao_id || escolhidas.has(m.opcao_id);
  const linhas = (arvore.materiais || []).filter(vale);

  const soma = new Map<string, any>();
  for (const m of linhas.filter(x => x.acao !== 'remover')) {
    const it = m.cadastro_itens || {};
    const atual = soma.get(m.item_id);
    const qtd = num(m.quantidade) * (multiplicador || 1);
    if (atual) atual.quantidade += qtd;
    else soma.set(m.item_id, {
      item_id: m.item_id, nome: it.nome || '(item)', codigo: it.codigo || '',
      unidade: it.unidade || 'UN', quantidade: qtd, nao_cadastrado: false,
    });
  }
  for (const m of linhas.filter(x => x.acao === 'remover')) {
    const atual = soma.get(m.item_id);
    if (!atual) continue;
    const qtd = num(m.quantidade) * (multiplicador || 1);
    // quantidade 0 no cadastro = "tira tudo"; com número, tira só aquilo
    if (!num(m.quantidade) || atual.quantidade <= qtd) soma.delete(m.item_id);
    else atual.quantidade -= qtd;
  }
  return [...soma.values()];
}

/** Junta o material de várias estruturas (vários itens vendidos) numa lista só. */
export function juntarMateriais(listas: any[][]) {
  const soma = new Map<string, any>();
  for (const lista of listas || []) {
    for (const l of lista || []) {
      const atual = soma.get(l.item_id);
      if (atual) atual.quantidade += num(l.quantidade);
      else soma.set(l.item_id, { ...l, quantidade: num(l.quantidade) });
    }
  }
  return [...soma.values()];
}

/** Texto curto do que a configuração produziu, para o aviso na tela. */
export function textoDoMaterial(linhas: any[]) {
  if (!linhas?.length) return 'Nenhum material — a configuração não gerou linhas.';
  return linhas.map(l => `• ${l.codigo ? l.codigo + ' — ' : ''}${l.nome}: ${l.quantidade} ${l.unidade || 'UN'}`).join('\n');
}
