// ─────────────────────────────────────────────────────────────────────────────
// COBERTURA DAS REGRAS DE UM VEÍCULO E USO DAS RESPOSTAS (16/10/2026, redesenho da tela "Estrutura de instalação", pedido do usuário)
//
// Duas perguntas que a tela não respondia e que o cadastrador faz o tempo todo:
//   1. "Alguma combinação de respostas ficou sem chicote/suporte neste carro?" — hoje só se descobre quando a OP mostra "chicote/suporte a definir".
//   2. "Esta resposta é usada em quê?" — apagar uma resposta apaga junto o material por resposta e as respostas já dadas nas OPs (o banco encadeia), e recusa
//      se uma regra a usa; quem apaga precisa saber isso ANTES.
//
// A cobertura não inventa uma conta nova: usa o mesmo `avaliarRegras` que a OP usa, combinação por combinação. Assim "a definir" aqui é exatamente "a definir" lá.
// Só leitura: nada daqui grava.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { avaliarRegras, ehQuantidade, ehPerguntaDaOp } from './ConfigEstrutura';

/** Mais combinações que isto a tabela não mostra (4 perguntas de 4 respostas já são 256): a pessoa usa o simulador. */
export const LIMITE_DE_COMBINACOES = 64;

const ehPorOpcoes = (p: any) => !ehQuantidade(p);

/** Mapa opcao_id → pergunta (para saber a que pergunta pertence cada resposta usada numa condição). */
function perguntaDaOpcao(perguntas: any[]) {
  const mapa = new Map<string, any>();
  (perguntas || []).forEach(p => (p.opcoes || []).forEach((o: any) => mapa.set(String(o.id), p)));
  return mapa;
}

/** A regra depende de item vendido junto ou de quantidade? Essas não entram na conta de cobertura: quem decide é a venda, não as respostas. */
export const regraCondicional = (r: any) => (r.condicoes || []).some((c: any) => c.tipo === 'item' || c.tipo === 'quantidade');

/** Ids das perguntas que ao menos uma regra usa numa condição "a resposta foi…" (ou de quantidade). */
export function perguntasUsadasPelasRegras(regras: any[], perguntas: any[]): Set<string> {
  const dona = perguntaDaOpcao(perguntas);
  const usadas = new Set<string>();
  (regras || []).forEach(r => (r.condicoes || []).forEach((c: any) => {
    if (c.tipo === 'resposta' && dona.has(String(c.opcao_id))) usadas.add(String(dona.get(String(c.opcao_id)).id));
    if (c.tipo === 'quantidade' && c.pergunta_id) usadas.add(String(c.pergunta_id));
  }));
  return usadas;
}

/**
 * Perguntas da OP (e de quantidade) que NENHUMA regra do veículo usa: qualquer que seja a resposta, a OP mostra "chicote/suporte a definir" para elas
 * (é a mesma regra do `semRegra` de `avaliarRegras`). Pergunta de item por opções não entra: essa segue pelo material do item no veículo.
 */
export function perguntasSemRegra(regras: any[], perguntas: any[], perguntasDoMaterial: Set<string> = new Set()) {
  // pergunta de quantidade que o material de um item do veículo usa para multiplicar (Slimled: "Quantos na frente?", 22/10/2026) também tem o que fazer
  const usadas = new Set([...perguntasUsadasPelasRegras(regras, perguntas), ...perguntasDoMaterial]);
  return (perguntas || []).filter(p => (ehPerguntaDaOp(p) || ehQuantidade(p)) && !usadas.has(String(p.id)));
}

export type LinhaDeCobertura = {
  respostas: Record<string, string>;       // pergunta_id → opcao_id
  aplicadas: any[];                         // regras que valem nesta combinação
  faltam: any[];                            // perguntas usadas por alguma regra e que nenhuma regra aplicada cobre aqui → "a definir"
  estado: 'ok' | 'definir';
};

/**
 * Todas as combinações de respostas das perguntas que as regras usam, e o que cada uma recebe.
 * Eixos = perguntas por opções que alguma regra usa. Pergunta-filha só entra na combinação em que a resposta-pai (se também for eixo) foi escolhida.
 * Regra que depende de item ou de quantidade fica de fora (`condicionais`): a conta é "só pelas respostas".
 */
export function coberturaDoVeiculo(regras: any[], perguntas: any[], limite = LIMITE_DE_COMBINACOES) {
  const usadas = perguntasUsadasPelasRegras(regras, perguntas);
  // pergunta usada por uma condição "a resposta foi…" tem, por definição, ao menos essa resposta: não precisa de guarda para "sem respostas"
  const eixos = (perguntas || []).filter(p => ehPorOpcoes(p) && usadas.has(String(p.id)));
  const condicionais = (regras || []).filter(regraCondicional);
  const base = (regras || []).filter(r => !regraCondicional(r));
  if (!eixos.length) return { eixos, linhas: [] as LinhaDeCobertura[], total: 0, truncado: false, condicionais };

  // quantidade de combinações sem as filhas (um teto): evita montar milhares de linhas antes de saber que passou do limite
  const teto = eixos.reduce((n, p) => n * (p.opcoes || []).length, 1);
  if (teto > limite * 8) return { eixos, linhas: [] as LinhaDeCobertura[], total: teto, truncado: true, condicionais };

  const idsDosEixos = new Set(eixos.map(p => String(p.id)));
  const donaDaOpcao = perguntaDaOpcao(eixos);
  const combinacoes: Record<string, string>[] = [];
  const rec = (i: number, atual: Record<string, string>) => {
    if (i === eixos.length) { combinacoes.push({ ...atual }); return; }
    const p = eixos[i];
    // filha cuja resposta-pai também é eixo: só vale se o pai foi respondido com a resposta que leva a ela
    if (p.opcao_pai_id) {
      const pai = donaDaOpcao.get(String(p.opcao_pai_id));
      if (pai && idsDosEixos.has(String(pai.id)) && atual[pai.id] !== p.opcao_pai_id) { rec(i + 1, atual); return; }
    }
    for (const o of p.opcoes || []) { atual[p.id] = o.id; rec(i + 1, atual); }
    delete atual[p.id];
  };
  rec(0, {});

  const total = combinacoes.length;
  if (total > limite) return { eixos, linhas: [] as LinhaDeCobertura[], total, truncado: true, condicionais };

  const linhas: LinhaDeCobertura[] = combinacoes.map(respostas => {
    const av = avaliarRegras(base, { respostas, vendidosIds: [], perguntas: eixos });
    const cobertas = perguntasUsadasPelasRegras(av.aplicadas, eixos);
    const faltam = eixos.filter(p => respostas[p.id] && !cobertas.has(String(p.id)));
    return { respostas, aplicadas: av.aplicadas, faltam, estado: faltam.length ? 'definir' : 'ok' };
  });
  return { eixos, linhas, total, truncado: false, condicionais };
}

/** Texto curto da combinação: "Caracterizado · Bateria frontal". */
export function textoDaCombinacao(linha: LinhaDeCobertura, eixos: any[]) {
  return eixos.filter(p => linha.respostas[p.id]).map(p => (p.opcoes || []).find((o: any) => o.id === linha.respostas[p.id])?.rotulo || '—').join(' · ');
}

// ── Uso das respostas ────────────────────────────────────────────────────────

export type UsoDasRespostas = {
  regras: Map<string, number>;       // opcao_id → quantas regras (de qualquer veículo) a usam numa condição
  materiais: Map<string, number>;    // opcao_id → quantas linhas de "material por resposta" dependem dela
  regrasPorPergunta: Map<string, number>;   // pergunta_id → quantas regras a usam (pergunta de quantidade)
};

const somar = (mapa: Map<string, number>, chave: any) => { if (chave) mapa.set(String(chave), (mapa.get(String(chave)) || 0) + 1); };

/** Quantas regras e linhas de material usam cada resposta. Lança erro se uma leitura falhar: contador zerado por falha diria "sem uso" de algo que é usado. */
export async function lerUsoDasRespostas(): Promise<UsoDasRespostas> {
  const [cond, mats] = await Promise.all([
    lerPaginado(() => supabase.from('veiculo_regra_condicoes').select('opcao_id,pergunta_id,tipo').order('id')),
    lerPaginado(() => supabase.from('veiculo_item_materiais').select('opcao_id').not('opcao_id', 'is', null).order('id')),
  ]);
  const uso: UsoDasRespostas = { regras: new Map(), materiais: new Map(), regrasPorPergunta: new Map() };
  cond.forEach((c: any) => { if (c.tipo === 'resposta') somar(uso.regras, c.opcao_id); if (c.tipo === 'quantidade') somar(uso.regrasPorPergunta, c.pergunta_id); });
  mats.forEach((m: any) => somar(uso.materiais, m.opcao_id));
  return uso;
}

/** Total de usos de uma resposta (regras + material por resposta). */
export const usosDaResposta = (uso: UsoDasRespostas | null, opcaoId: string) =>
  uso ? (uso.regras.get(String(opcaoId)) || 0) + (uso.materiais.get(String(opcaoId)) || 0) : 0;

/**
 * O que apagar uma resposta leva junto, para a confirmação dizer ANTES: o material por resposta (o banco apaga), as respostas já dadas nas OPs (o banco
 * apaga) e, se uma regra a usa, o banco recusa. Lança erro se a leitura falhar.
 */
export async function oQueApagarRespostaLeva(opcaoId: string) {
  const [regras, materiais, ops] = await Promise.all([
    supabase.from('veiculo_regra_condicoes').select('id', { count: 'exact', head: true }).eq('opcao_id', opcaoId),
    supabase.from('veiculo_item_materiais').select('id', { count: 'exact', head: true }).eq('opcao_id', opcaoId),
    supabase.from('op_configuracao_respostas').select('opl_id', { count: 'exact', head: true }).eq('opcao_id', opcaoId),
  ]);
  const erro = regras.error || materiais.error || ops.error;
  if (erro) throw new Error(erro.message);
  return { regras: regras.count || 0, materiais: materiais.count || 0, ops: ops.count || 0 };
}

/** Idem para apagar uma pergunta inteira (todas as respostas dela). */
export async function oQueApagarPerguntaLeva(pergunta: any) {
  const ids = (pergunta?.opcoes || []).map((o: any) => o.id);
  const somarTudo = async (tabela: string, coluna: string, extra?: (q: any) => any) => {
    if (!ids.length) return 0;
    let q = supabase.from(tabela).select('id', { count: 'exact', head: true }).in(coluna, ids);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count || 0;
  };
  const [regras, materiais, ops, regrasQtd] = await Promise.all([
    somarTudo('veiculo_regra_condicoes', 'opcao_id'),
    somarTudo('veiculo_item_materiais', 'opcao_id'),
    (async () => {
      const { count, error } = await supabase.from('op_configuracao_respostas').select('opl_id', { count: 'exact', head: true }).eq('pergunta_id', pergunta.id);
      if (error) throw new Error(error.message);
      return count || 0;
    })(),
    (async () => {
      const { count, error } = await supabase.from('veiculo_regra_condicoes').select('id', { count: 'exact', head: true }).eq('pergunta_id', pergunta.id);
      if (error) throw new Error(error.message);
      return count || 0;
    })(),
  ]);
  return { regras: regras + regrasQtd, materiais, ops };
}

/** A frase do que apagar leva junto ("2 regras, 3 linhas de material e 5 OPs que já responderam"); vazio quando não leva nada. */
export function fraseDoQueLeva(l: { regras: number; materiais: number; ops: number }) {
  const partes = [
    l.regras ? `${l.regras} condição(ões) de regra de veículo` : '',
    l.materiais ? `${l.materiais} linha(s) de material por resposta` : '',
    l.ops ? `a resposta já dada em ${l.ops} OP(s)` : '',
  ].filter(Boolean);
  return partes.join(', ');
}
