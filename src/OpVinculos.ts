// ─────────────────────────────────────────────────────────────────────────────
// VÍNCULO ÚNICO DA OP — um lugar só que responde "o que está ligado a esta OP"
//
// Antes desta função, cada tela procurava do seu jeito: uma pelo id da OP,
// outra pelo número em texto, outra não procurava nada. O resultado é que a
// pergunta mais básica do chão de fábrica — "o que essa OP tem em aberto?" —
// não tinha resposta confiável. Aqui a busca é feita UMA vez, com as duas
// chaves (id e número), e cada achado diz por qual delas veio: o que foi
// encontrado só pelo texto entra marcado como `porTexto`, para ninguém tomar
// decisão achando que é vínculo de verdade.
//
// Levantamento de 21/09/2026 que motivou isto:
//   • 122 demandas setoriais, 0 com o id da OP (a coluna era bigint e o id da
//     OP é uuid — ver migração demandas_setoriais_vinculo_op_uuid);
//   • 16 pedidos de compra, 3 com o número da OP em texto livre;
//   • 314 OPs, 0 ligadas ao empenho da licitação que as originou.
//
// Usado pelo Dossiê da OP (OpDossie.tsx). A intenção é que as travas de
// liberação também passem a consultar daqui — "tem demanda de fabricação em
// aberto?" é a mesma pergunta que esta função já responde.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

export type GrupoVinculo =
  | 'origem' | 'demanda' | 'compra' | 'frete' | 'engenharia'
  | 'qualidade' | 'ajuste' | 'anexo' | 'agendamento';

export type ItemVinculo = {
  grupo: GrupoVinculo;
  tipo: string;              // tabela/natureza, para a tela saber o que abrir
  id: string;
  numero?: string | null;
  titulo: string;
  descricao?: string | null;
  status?: string | null;
  setor?: string | null;
  responsavel?: string | null;
  data?: string | null;
  valor?: number | null;
  /** true = achado só pelo número em texto, sem vínculo real gravado */
  porTexto?: boolean;
  /** true = ainda não terminou (pendente/em andamento) */
  aberto?: boolean;
};

const txt = (v: any) => (v == null ? '' : String(v).trim());
const igual = (a: any, b: any) => txt(a).toUpperCase() === txt(b).toUpperCase();
/** status que significam "ainda não acabou" nas várias tabelas do sistema */
const ABERTOS = ['pendente', 'em andamento', 'em execucao', 'em execução', 'aberta', 'aberto',
  'cotacao', 'cotação', 'aguardando', 'em aberto', 'iniciada', 'pausada', 'em cotacao', 'em cotação'];
const estaAberto = (s: any) => {
  const v = txt(s).toLowerCase();
  if (!v) return true;                                   // sem status: trata como aberto
  if (/conclu|finaliz|entregue|cancelad|descartad|aprovad|reprovad|faturad/.test(v)) return false;
  return ABERTOS.some(a => v.includes(a));
};

/** Elemento de uma consulta supabase: extrai a linha tanto de quem devolve lista
 *  (`select` normal, `data: Row[]`) quanto de quem devolve um objeto só
 *  (`.maybeSingle()`, `data: Row`) — sem isso o TS inferia T como "a lista
 *  inteira" nas consultas em lista, e `tentar` devolvia lista de listas em vez
 *  de lista de linhas (pendência de 22/09/2026, só não estourava build porque
 *  quase todo uso é com `(d: any) =>`). */
type LinhaDe<D> = D extends (infer L)[] ? L : D;

/** Roda as consultas em paralelo e nunca deixa uma falha derrubar o dossiê. */
async function tentar<D>(p: PromiseLike<{ data: D | null; error: any }>): Promise<LinhaDe<D>[]> {
  try {
    const { data } = await p;
    return (Array.isArray(data) ? data : data ? [data] : []) as LinhaDe<D>[];
  } catch {
    return [];
  }
}

// ── ORIGEM DA VENDA ──────────────────────────────────────────────────────────
// De onde a OP veio: card do CRM, empenho de licitação, ou nenhum dos dois
// (OP digitada à mão). Junto vem a formação de preços do processo, que é onde
// o preço foi realmente fechado.
export async function origemDaOp(op: any) {
  const [crm, pedidos] = await Promise.all([
    op?.crm_oportunidade_id
      ? tentar(supabase.from('crm_oportunidades')
          .select('id,titulo,numero_pv,responsavel_nome,orgao,valor_registrado,estagio_id,licitacao_processo_id')
          .eq('id', op.crm_oportunidade_id).maybeSingle())
      : Promise.resolve([]),
    tentar(supabase.from('licitacao_pedidos')
      .select('id,licitacao_id,item_id,quantidade,data_pedido,prazo_entrega,documento,opl,opl_id')
      .or(`opl_id.eq.${op.id},opl.eq.${txt(op.opl)}`)),
  ]);
  const oportunidade = crm[0] || null;
  const pedido = pedidos[0] || null;
  const licitacaoId = pedido?.licitacao_id || oportunidade?.licitacao_processo_id || null;

  const [licitacoes, vinculosFormacao] = await Promise.all([
    licitacaoId
      ? tentar(supabase.from('licitacoes').select('id,numero_processo,orgao,objeto,status,operador,analista_nome')
          .eq('id', licitacaoId).maybeSingle())
      : Promise.resolve([]),
    // a formação de preços se liga ao PROCESSO (card do CRM ou licitação), não à OP
    (oportunidade?.id || licitacaoId)
      ? tentar(supabase.from('cotacoes_precos_vinculos').select('cotacao_id,tipo,processo_id')
          .in('processo_id', [oportunidade?.id, licitacaoId].filter(Boolean)))
      : Promise.resolve([]),
  ]);

  const idsFormacao = vinculosFormacao.map((v: any) => v.cotacao_id).filter(Boolean);
  const formacoes = idsFormacao.length
    ? await tentar(supabase.from('cotacoes_precos')
        .select('id,nome,versao,status,vencedora,criado_em,criado_por_nome').in('id', idsFormacao))
    : [];

  return {
    oportunidade,
    pedido,
    licitacao: licitacoes[0] || null,
    // a oficial primeiro; é a que valeu na proposta
    formacoes: [...formacoes].sort((a: any, b: any) =>
      Number(!!b.vencedora) - Number(!!a.vencedora) || (b.versao || 1) - (a.versao || 1)),
  };
}

// ── TUDO QUE ESTÁ PENDURADO NA OP ────────────────────────────────────────────
export async function vinculosDaOp(op: any): Promise<ItemVinculo[]> {
  const id = op?.id;
  const num = txt(op?.opl);
  if (!id) return [];

  const [
    setoriais, setoriaisTexto, avulsasDiretas, avulsasLista,
    compras, comprasTexto, fretes, cqs, devs, tarefas, ajustes, anexos, agendas,
  ] = await Promise.all([
    tentar(supabase.from('demandas_setoriais').select('*').eq('opl_id', id)),
    num ? tentar(supabase.from('demandas_setoriais').select('*').is('opl_id', null).eq('numero_opl', num)) : Promise.resolve([]),
    tentar(supabase.from('demandas_avulsas').select('*').eq('vinculo_id', id)),
    // jsonb "contém": .contains() com array de objetos vira literal de array do
    // PostgREST e o banco recusa (22P02) — o texto JSON é o que ele entende.
    tentar(supabase.from('demandas_avulsas').select('*')
      .filter('vinculos', 'cs', JSON.stringify([{ id: String(id) }]))),
    tentar(supabase.from('pcp_pedidos_compra').select('*').eq('vinculo_id', id)),
    num ? tentar(supabase.from('pcp_pedidos_compra').select('*').is('vinculo_id', null).eq('opl', num)) : Promise.resolve([]),
    tentar(supabase.from('pcp_fretes').select('*').eq('vinculo_id', id)),
    tentar(supabase.from('cq_auditorias').select('*').eq('opl_id', id)),
    tentar(supabase.from('engenharia_desenvolvimento').select('*').eq('opl_id', id)),
    tentar(supabase.from('engenharia_horas_tarefas').select('*').eq('opl_id', id)),
    num ? tentar(supabase.from('ajustes_trabalhos').select('*').eq('opl', num)) : Promise.resolve([]),
    tentar(supabase.from('opl_anexos').select('*').eq('opl_id', id)),
    tentar(supabase.from('agendamentos_manutencao').select('*').eq('opl_id', id)),
  ]);

  // tarefas de horas da Engenharia não têm campo de OP preenchido na prática —
  // o número costuma estar no título. Entra como achado por texto, nunca
  // misturado com o que tem vínculo de verdade.
  const tarefasPorMencao = num
    ? await tentar(supabase.from('engenharia_horas_tarefas').select('*').is('opl_id', null).ilike('titulo', `%${num}%`))
    : [];

  const out: ItemVinculo[] = [];
  const jaTem = new Set<string>();
  const push = (v: ItemVinculo) => {
    const chave = `${v.tipo}:${v.id}`;
    if (jaTem.has(chave)) return;
    jaTem.add(chave);
    out.push(v);
  };

  const demandaSetorial = (d: any, porTexto = false) => push({
    grupo: 'demanda', tipo: 'demandas_setoriais', id: d.id, numero: d.numero_demanda,
    titulo: txt(d.descricao) || `Demanda ${d.setor_destino || ''}`.trim(),
    status: d.status, setor: d.setor_destino, responsavel: d.responsavel_nome,
    data: d.data_abertura, valor: d.valor_compra ?? null,
    porTexto, aberto: estaAberto(d.status),
  });
  setoriais.forEach((d: any) => demandaSetorial(d));
  setoriaisTexto.forEach((d: any) => demandaSetorial(d, true));

  [...avulsasDiretas, ...avulsasLista].forEach((d: any) => push({
    grupo: 'demanda', tipo: 'demandas_avulsas', id: d.id, numero: null,
    titulo: txt(d.titulo) || `Demanda ${d.setor || ''}`.trim(), descricao: d.descricao,
    status: d.status, setor: d.setor, responsavel: d.responsavel_nome || d.designado_nome,
    data: d.criado_em, aberto: estaAberto(d.status),
  }));

  const compra = (c: any, porTexto = false) => push({
    grupo: 'compra', tipo: 'pcp_pedidos_compra', id: c.id,
    numero: c.numero_oc || c.numero_pedido,
    titulo: txt(c.descricao_material) || c.numero_pedido || 'Pedido de compra',
    status: c.status_compra, setor: 'Compras', responsavel: c.fornecedor,
    data: c.data_criacao, valor: c.valor_compra ?? null,
    porTexto, aberto: estaAberto(c.status_compra),
  });
  compras.forEach((c: any) => compra(c));
  comprasTexto.forEach((c: any) => compra(c, true));

  fretes.forEach((f: any) => push({
    grupo: 'frete', tipo: 'pcp_fretes', id: f.id, numero: f.numero_cte,
    titulo: txt(f.descricao) || `Frete para ${f.destino || '—'}`,
    status: f.status, setor: 'Logística', responsavel: f.transportadora,
    data: f.criado_em, valor: f.valor_frete ?? null, aberto: estaAberto(f.status),
  }));

  cqs.forEach((a: any) => push({
    grupo: 'qualidade', tipo: 'cq_auditorias', id: a.id, numero: a.numero_opl,
    titulo: `Auditoria CQ — ${a.resultado || '—'}`, descricao: a.observacoes,
    status: a.resultado, setor: 'CQ', responsavel: a.auditor_nome,
    data: a.data_auditoria, aberto: false,
  }));

  devs.forEach((d: any) => push({
    grupo: 'engenharia', tipo: 'engenharia_desenvolvimento', id: d.id, numero: d.numero_opl,
    titulo: txt(d.titulo) || 'Desenvolvimento', descricao: d.descricao,
    status: d.concluida ? 'Concluído' : 'Em desenvolvimento', setor: 'Engenharia',
    responsavel: d.criado_por_nome, data: d.criado_em, aberto: !d.concluida,
  }));

  const tarefa = (t: any, porTexto = false) => push({
    grupo: 'engenharia', tipo: 'engenharia_horas_tarefas', id: t.id, numero: null,
    titulo: txt(t.titulo) || 'Tarefa de engenharia',
    status: t.status, setor: 'Engenharia', responsavel: t.responsavel_nome,
    data: t.criado_em, porTexto, aberto: estaAberto(t.status),
  });
  tarefas.forEach((t: any) => tarefa(t));
  tarefasPorMencao.forEach((t: any) => tarefa(t, true));

  ajustes.forEach((a: any) => push({
    grupo: 'ajuste', tipo: 'ajustes_trabalhos', id: a.id, numero: a.numero_ajuste,
    titulo: txt(a.descricao_defeito) || txt(a.descricao) || 'Ajuste',
    status: a.status_ajuste || a.status, setor: a.setor_origem || a.setor,
    responsavel: a.responsavel_ajuste || a.responsavel, data: a.data_abertura,
    porTexto: true, aberto: estaAberto(a.status_ajuste || a.status),
  }));

  anexos.forEach((a: any) => push({
    grupo: 'anexo', tipo: 'opl_anexos', id: a.id, numero: null,
    titulo: txt(a.nome) || 'Anexo', descricao: a.url,
    setor: a.setor, responsavel: a.criado_por, data: a.criado_em, aberto: false,
  }));

  agendas.forEach((a: any) => push({
    grupo: 'agendamento', tipo: 'agendamentos_manutencao', id: a.id, numero: a.numero_opl,
    titulo: `Manutenção agendada${a.periodo ? ` (${a.periodo})` : ''}`, descricao: a.observacoes,
    setor: 'Produção', responsavel: a.agendado_por, data: a.data_agendamento,
    aberto: !!a.data_agendamento && new Date(a.data_agendamento) >= new Date(),
  }));

  return out;
}

/** Demandas de fabricação/compra ainda em aberto — a pergunta que as travas de
 *  liberação vão precisar fazer ("pode liberar a produção?"). */
export function pendenciasEmAberto(vinculos: ItemVinculo[]): ItemVinculo[] {
  return vinculos.filter(v => v.aberto && ['demanda', 'compra', 'ajuste'].includes(v.grupo));
}

// ── LINHA DO TEMPO E TEMPOS POR SETOR ────────────────────────────────────────
export async function linhaDoTempo(op: any) {
  return tentar(supabase.from('logs_movimentacao_opl').select('*')
    .eq('opl_id', op.id).order('data_hora', { ascending: true }));
}

export async function acompanhamentos(op: any) {
  return tentar(supabase.from('op_acompanhamentos').select('*')
    .eq('referencia_id', op.id).order('criado_em', { ascending: true }));
}

/** Horas por setor já medidas pelo próprio sistema (colunas tempo_*_horas). */
export const TEMPOS_SETOR: { campo: string; setor: string }[] = [
  { campo: 'tempo_engenharia_horas',   setor: 'Engenharia' },
  { campo: 'tempo_pcp_horas',          setor: 'PCP' },
  { campo: 'tempo_almoxarifado_horas', setor: 'Almoxarifado' },
  { campo: 'tempo_almox_horas',        setor: 'Almoxarifado (kiting)' },
  { campo: 'tempo_chicotes_horas',     setor: 'Chicotes' },
  { campo: 'tempo_serralheria_horas',  setor: 'Serralheria' },
  { campo: 'tempo_compras_horas',      setor: 'Compras' },
  { campo: 'tempo_laboratorio_horas',  setor: 'Laboratório' },
  { campo: 'tempo_producao_horas',     setor: 'Produção' },
  { campo: 'tempo_retrabalho_horas',   setor: 'Retrabalho' },
  { campo: 'tempo_qualidade_horas',    setor: 'CQ' },
  { campo: 'tempo_fiscal_horas',       setor: 'Fiscal' },
  { campo: 'tempo_logistica_horas',    setor: 'Logística' },
];

export function temposDaOp(op: any) {
  return TEMPOS_SETOR
    .map(t => ({ setor: t.setor, horas: Number(op?.[t.campo]) || 0 }))
    // abaixo de 3 minutos não é tempo de setor, é o clique de quem passou a OP adiante
    .filter(t => t.horas >= 0.05);
}

/** Marcos do trilho, na ordem, com a data em que cada um aconteceu. */
export function marcosDaOp(op: any) {
  const m = [
    { etapa: 'OP criada',                  data: op?.data_criacao || op?.ts_entrada || op?.data_entrada },
    { etapa: 'Engenharia iniciou',         data: op?.data_inicio_engenharia },
    { etapa: 'BOM liberada',               data: op?.data_liberacao_bom },
    { etapa: 'PCP liberou',                data: op?.data_liberacao_pcp },
    { etapa: 'Kit conferido (Almox)',      data: op?.data_kiting },
    { etapa: 'Produção iniciada',          data: op?.data_inicio_producao || op?.ts_inicio_prod },
    { etapa: 'Produção concluída',         data: op?.data_conclusao_producao || op?.ts_fim_prod },
    { etapa: 'CQ',                         data: op?.data_cq },
    { etapa: 'Liberação comercial',        data: op?.data_liberacao_comercial },
    { etapa: 'NF-e emitida',               data: op?.data_emissao_nf || op?.ts_nf },
    { etapa: 'Entregue ao cliente',        data: op?.data_entrega },
  ];
  return m.filter(x => !!x.data);
}

// ── CARREGADOR COMPLETO ──────────────────────────────────────────────────────
export type Dossie = Awaited<ReturnType<typeof carregarDossie>>;

/** Acha a OP pelo número (exato) ou pelo PV, e devolve as candidatas. */
export async function buscarOps(termo: string) {
  const t = txt(termo);
  if (!t) return [];
  const porNumero = await tentar(supabase.from('oples')
    .select('id,opl,cliente_nome,modelo,status_geral,data_entrada')
    .ilike('opl', `%${t}%`).order('opl').limit(30));
  if (porNumero.length) return porNumero;
  // não achou por número: tenta como Pedido de Venda (card do CRM)
  const cards = await tentar(supabase.from('crm_oportunidades').select('id').eq('numero_pv', t.replace(/\D/g, '')));
  if (!cards.length) return [];
  return tentar(supabase.from('oples')
    .select('id,opl,cliente_nome,modelo,status_geral,data_entrada')
    .in('crm_oportunidade_id', cards.map((c: any) => c.id)).order('opl'));
}

export async function carregarDossie(opOuId: any) {
  const op = typeof opOuId === 'string'
    ? (await tentar(supabase.from('oples').select('*').eq('id', opOuId).maybeSingle()))[0]
    : opOuId;
  if (!op) return null;

  const [origem, vinculos, logs, acomps, irmas] = await Promise.all([
    origemDaOp(op),
    vinculosDaOp(op),
    linhaDoTempo(op),
    acompanhamentos(op),
    // demais unidades do mesmo lote (A1530.2608/01, /02, ...)
    tentar(supabase.from('oples').select('id,opl,status_geral,cliente_nome')
      .ilike('opl', `${txt(op.opl).replace(/\/\d+$/, '')}/%`).order('opl')),
  ]);

  return {
    op, origem, vinculos, logs, acompanhamentos: acomps,
    irmas: irmas.filter((x: any) => !igual(x.opl, op.opl)),
    pendencias: pendenciasEmAberto(vinculos),
    tempos: temposDaOp(op),
    marcos: marcosDaOp(op),
  };
}
