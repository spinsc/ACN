// ─────────────────────────────────────────────────────────────────────────────
// CÁLCULO DO MATERIAL DE INSTALAÇÃO E RECÁLCULO DA BOM QUANDO UMA RESPOSTA MUDA
//
// Etapa 4 das perguntas da OP (15/10/2026, pedido do usuário): "se a resposta mudar depois da OP criada e a BOM já existir, o sistema recalcula e mostra a
// diferença — 'sai este chicote, entra aquele' — e só aplica quando alguém confirmar. Bloqueia se o material já estiver separado ou reservado no Almoxarifado."
//
// O recálculo NUNCA refaz a BOM do zero: a Engenharia e o PCP ajustam a lista à mão, e refazer apagaria esse trabalho. Em vez disso calcula o material com as
// respostas de antes e com as de depois, e aplica na BOM só a DIFERENÇA — tira o que saiu (até o que a BOM tem) e põe o que entrou.
//
// O cálculo em si (perguntas, material por item, regras do veículo) é o mesmo que o painel de conferência (AplicarEstrutura.tsx) sempre fez; foi trazido para
// cá para o painel, a tela de respostas e a OP aberta calcularem igual.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import {
  perguntasDaVenda, respostasAutomaticas, materiaisDoVeiculo, montarMaterial, itensSemEstrutura,
  itensConjunto, vendaTemConjunto, podarRespostas, regrasDoVeiculo, avaliarRegras, valorSalvo,
} from './ConfigEstrutura';

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const chaveLinha = (l: any) => l?.item_id || `txt:${l?.nome}`;

/**
 * Lê o que o cálculo da estrutura precisa para uma OP: perguntas, material por item, regras do veículo. Lança erro se uma leitura falhar — o chamador mostra a
 * falha, porque cálculo com leitura faltando daria um material incompleto que parece certo.
 * Devolve `aplicavel: false` quando a estrutura não se aplica (sem veículo do catálogo, ou venda sem Conjunto Elétrico).
 */
export async function lerBaseDaEstrutura(opl: any) {
  const vendidos = opl?.itens_vendidos || [];
  const idsVendidos = vendidos.map((v: any) => v.item_id).filter(Boolean);
  const conj = await itensConjunto();
  const temConjunto = vendaTemConjunto(vendidos, conj.map((c: any) => c.id));
  if (!opl?.veiculo_id || !temConjunto) return { aplicavel: false, temConjunto, semVeiculo: !opl?.veiculo_id, conj };

  // o próprio conjunto não tem estrutura: ele é o recipiente. Serviço e item genérico (categoria GENERICO: película, instalação do kit, garantia estendida,
  // plotagem…) também nunca consomem material de instalação: sem esta exceção eles apareceriam para sempre como "nunca adaptados neste carro"
  // (visto nas OPs do lote 1673.2609, 29/09/2026)
  const { data: cats, error: erroCats } = idsVendidos.length
    ? await supabase.from('cadastro_itens').select('id,categoria').in('id', idsVendidos)
    : { data: [], error: null };
  if (erroCats) throw new Error(erroCats.message);
  const genericos = new Set((cats || []).filter((c: any) => String(c.categoria || '').trim().toUpperCase() === 'GENERICO').map((c: any) => String(c.id)));
  const idsParaEstrutura = idsVendidos.filter((id: string) => !conj.some((c: any) => c.id === id) && !genericos.has(String(id)));
  const [perguntas, materiais, semEstrutura, regras] = await Promise.all([
    perguntasDaVenda(idsParaEstrutura, idsVendidos),   // inclui as da OP; a condição "itens vendidos juntos" já filtra
    materiaisDoVeiculo(opl.veiculo_id, idsParaEstrutura),
    itensSemEstrutura(opl.veiculo_id, idsParaEstrutura),
    regrasDoVeiculo(opl.veiculo_id),
  ]);
  const qtdPorItem: Record<string, number> = {};
  vendidos.forEach((v: any) => { if (v.item_id) qtdPorItem[v.item_id] = num(v.quantidade) || 1; });
  return { aplicavel: true, temConjunto: true, conj, vendidos, idsVendidos, perguntas, materiais, semEstrutura, regras, qtdPorItem };
}

/** Respostas já gravadas na OP, no formato do mapa (pergunta_id → valor; "q:4" nas perguntas de quantidade). Lança erro se a leitura falhar. */
export async function respostasSalvasDaOp(oplId: string) {
  const { data, error } = await supabase.from('op_configuracao_respostas')
    .select('pergunta_id,opcao_id,valor_numerico,automatica').eq('opl_id', oplId);
  if (error) throw new Error(error.message);
  const mapa: Record<string, string> = {};
  (data || []).forEach((r: any) => { mapa[r.pergunta_id] = valorSalvo(r); });
  return mapa;
}

/** O cálculo puro: com a base lida e um conjunto de respostas, devolve as respostas que valem, as regras aplicadas e o material. */
export function calcularDaEstrutura(base: any, salvas: Record<string, string>) {
  const auto = respostasAutomaticas(base.perguntas, base.idsVendidos);
  const respostas: Record<string, string> = { ...auto, ...(salvas || {}) };
  // podadas: resposta a pergunta "filha" cuja resposta-pai foi trocada não vale, senão o material dela entraria
  const validas = podarRespostas(base.perguntas, respostas);
  Object.keys(respostas).forEach(k => { if (!validas[k]) delete respostas[k]; });
  const doRegras = avaliarRegras(base.regras, { respostas, vendidosIds: base.idsVendidos, perguntas: base.perguntas, materiais: base.materiais });
  const linhas = montarMaterial([...base.materiais, ...doRegras.linhas], respostas, base.qtdPorItem);
  return { respostas, doRegras, linhas };
}

// ── Diferença entre dois cálculos ────────────────────────────────────────────

export type DiferencaDeMaterial = { item_id: string | null; nome: string; codigo: string; unidade: string; antes: number; depois: number; delta: number };

/** O que mudou entre o material calculado antes e depois: só os itens cuja quantidade é diferente. */
export function diferencaDeMaterial(antes: any[], depois: any[]): DiferencaDeMaterial[] {
  const mapa = new Map<string, any>();
  const somar = (lista: any[], campo: 'antes' | 'depois') => (lista || []).forEach(l => {
    const k = chaveLinha(l);
    const x = mapa.get(k) || { item_id: l.item_id || null, nome: l.nome, codigo: l.codigo || '', unidade: l.unidade || 'UN', antes: 0, depois: 0 };
    x[campo] += num(l.quantidade);
    mapa.set(k, x);
  });
  somar(antes, 'antes'); somar(depois, 'depois');
  return [...mapa.values()]
    .map(x => ({ ...x, delta: Math.round((x.depois - x.antes) * 10000) / 10000 }))
    .filter(x => Math.abs(x.delta) > 0.0001);
}

const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');

/** "sai 1 UN CHICOTE A; entra 1 UN CHICOTE B" — o texto que a tela e o histórico mostram. */
export function textoDaDiferenca(dif: DiferencaDeMaterial[]) {
  const sai = dif.filter(d => d.delta < 0).map(d => `${fmt(-d.delta)} ${d.unidade} ${d.nome}`);
  const entra = dif.filter(d => d.delta > 0).map(d => `${fmt(d.delta)} ${d.unidade} ${d.nome}`);
  return [sai.length ? `sai ${sai.join(', ')}` : '', entra.length ? `entra ${entra.join(', ')}` : ''].filter(Boolean).join('; ');
}

/**
 * Aplica a diferença numa BOM. Tira só até o que a BOM tem (se a Engenharia já tirou a linha à mão, não inventa saldo negativo) e devolve em `naoAchou` o que
 * não foi encontrado para tirar — quem chama avisa, porque a BOM fugiu do que o cálculo esperava.
 */
export function aplicarDiferencaNaBom(bom: any[], dif: DiferencaDeMaterial[], nomeConjunto = 'CONJUNTO ELÉTRICO') {
  const linhas = (bom || []).map(l => ({ ...l }));
  const naoAchou: DiferencaDeMaterial[] = [];
  for (const d of dif) {
    const k = d.item_id || `txt:${d.nome}`;
    const idx = linhas.findIndex(l => chaveLinha(l) === k);
    if (d.delta > 0) {
      if (idx >= 0) linhas[idx].quantidade = num(linhas[idx].quantidade) + d.delta;
      else linhas.push({ item_id: d.item_id, nome: d.nome, codigo: d.codigo, unidade: d.unidade || 'UN', quantidade: d.delta, nao_cadastrado: false, descricao: `do ${nomeConjunto}` });
    } else {
      const tira = -d.delta;
      if (idx < 0) { naoAchou.push(d); continue; }
      const resta = num(linhas[idx].quantidade) - tira;
      if (resta > 0.0001) linhas[idx].quantidade = resta;
      else { if (resta < -0.0001) naoAchou.push({ ...d, delta: -(tira + resta) }); linhas.splice(idx, 1); }
    }
  }
  return { bom: linhas, naoAchou };
}

/** O aviso para quando a BOM não tinha o que o recálculo mandou tirar (a lista foi mexida à mão e fugiu do esperado). Vazio se nada ficou de fora. */
export function avisoDoQueNaoFoiTirado(naoAchou: DiferencaDeMaterial[]) {
  if (!naoAchou.length) return '';
  return 'A BOM não tinha tudo o que devia sair (provavelmente foi ajustada à mão): ' + naoAchou.map(d => `${fmt(-d.delta)} ${d.unidade} ${d.nome}`).join(', ')
    + '. Confira a lista.';
}

// ── Quando ainda dá para trocar a resposta ───────────────────────────────────

/**
 * Status em que a OP ainda não saiu do PCP para o Almoxarifado. Depois disso o material já foi reservado e o kit separado, e trocar a resposta mudaria o que o
 * Almoxarifado está fazendo: o caminho é devolver a OP ao PCP ("PCP — rever a BOM", DevolverOp.tsx), que volta sem BOM e solta a reserva.
 * Não dá para usar `data_liberacao_pcp`: continua preenchida depois da devolução.
 */
export const STATUS_ANTES_DO_ALMOX = ['Em Espera Engenharia', 'Devolvida para Engenharia', 'Em Analise Engenharia', 'Em Espera PCP', 'Devolvida Comercial'];

/** Para cada OP: `pode` trocar a resposta agora, e `motivo` quando não. Lança erro se a leitura das reservas falhar (não presume "sem reserva"). */
export async function situacaoParaTrocarResposta(ops: any[]) {
  const ids = [...new Set((ops || []).map(o => o?.id).filter(Boolean).map(String))];
  const comReserva = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('estoque_reservas')
      .select('opl_id').in('opl_id', ids.slice(i, i + 100)).in('situacao', ['reservada', 'consumida']);
    if (error) throw new Error(error.message);
    (data || []).forEach((r: any) => comReserva.add(String(r.opl_id)));
  }
  const mapa = new Map<string, { pode: boolean; motivo: string }>();
  for (const o of ops || []) {
    if (comReserva.has(String(o.id))) mapa.set(String(o.id), { pode: false, motivo: 'tem material reservado no Almoxarifado' });
    else if (o.status_geral && !STATUS_ANTES_DO_ALMOX.includes(o.status_geral)) mapa.set(String(o.id), { pode: false, motivo: `já saiu do PCP (${o.status_geral})` });
    else mapa.set(String(o.id), { pode: true, motivo: '' });
  }
  return mapa;
}
