// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ETAPAS DA OP — em que etapa está, com qual setor, e desde quando.
//
// Etapa 6 do PLANO_UX_FLUXO_TRABALHO.md ("onde está isso agora"), decidida com o
// usuário em 29/09/2026. Estes nomes viviam num vetor privado do AcnTabShared, só
// para a barra de progresso; agora são a fonte única para a barra, para a faixa
// "Onde está agora" (detalhe da OP e Dossiê), para a coluna da lista de OPs e para
// o selo do card do CRM.
//
// `label` e `pct` são exatamente os da barra de progresso de antes — nada mudou nela.
// `setor` e `estado` são novos e valem só para a faixa: `setor` é quem tem a OP na
// mão agora; `estado` diz o que ela está esperando, sem repetir o setor.
// ─────────────────────────────────────────────────────────────────────────────
import { STATUS_LIBERACAO_COMERCIAL_TODOS, aguardaLiberacaoComercial } from './FluxoEntrega';
import { marcosDaOp } from './OpVinculos';
import { diaISO, hojeISO } from './Interface';
import { supabase } from './supabaseClient';

export type EtapaOp = {
  match: string[];
  pct: number;
  label: string;
  setor: string | null;
  estado: string;
  retrabalho?: boolean;
  concluida?: boolean;
};

export const ETAPAS_OP: EtapaOp[] = [
  { match: ['Em Espera Engenharia'], pct: 10, label: 'Aguardando Engenharia', setor: 'Engenharia', estado: 'na fila, aguardando iniciar a análise' },
  { match: ['Devolvida Comercial', 'Rejeitada - Análise Requerida'], pct: 10, label: 'Devolvida ao Comercial', setor: 'Comercial', estado: 'devolvida, aguardando correção', retrabalho: true },
  { match: ['Em Analise Engenharia'], pct: 20, label: 'Em Análise — Engenharia', setor: 'Engenharia', estado: 'em análise' },
  { match: ['Devolvida para Engenharia'], pct: 20, label: 'Devolvida à Engenharia', setor: 'Engenharia', estado: 'devolvida, aguardando nova análise', retrabalho: true },
  { match: ['Em Espera PCP'], pct: 35, label: 'Aguardando PCP', setor: 'PCP', estado: 'na fila, aguardando triagem' },
  { match: ['Devolvida PCP'], pct: 35, label: 'Devolvida ao PCP', setor: 'PCP', estado: 'devolvida, aguardando correção', retrabalho: true },
  { match: ['Aguardando Almox'], pct: 45, label: 'Almoxarifado', setor: 'Almoxarifado', estado: 'aguardando conferir o kit' },
  { match: ['Kit OK - Aguardando PCP'], pct: 45, label: 'Almoxarifado', setor: 'PCP', estado: 'kit pronto, aguardando liberar a produção' },
  { match: ['Aguardando Inicio Producao'], pct: 55, label: 'Aguardando Produção', setor: 'Produção', estado: 'aguardando iniciar' },
  { match: ['Aguardando Agendamento Manutenção'], pct: 55, label: 'Aguardando Produção', setor: 'Produção', estado: 'aguardando agendar a manutenção' },
  { match: ['Manutenção Agendada'], pct: 55, label: 'Aguardando Produção', setor: 'Produção', estado: 'manutenção agendada' },
  { match: ['Em Producao'], pct: 70, label: 'Em Produção', setor: 'Produção', estado: 'em produção' },
  { match: ['Em Retrabalho', 'Retrabalho'], pct: 70, label: 'Em Retrabalho', setor: 'Produção', estado: 'em retrabalho', retrabalho: true },
  { match: ['Aguardando CQ'], pct: 80, label: 'Controle de Qualidade', setor: 'Qualidade', estado: 'aguardando auditoria' },
  // Fluxos que terminam em envio: produzido -> embalar -> frete.
  { match: ['Aguardando Embalagem'], pct: 80, label: 'Embalagem — Almoxarifado', setor: 'Almoxarifado', estado: 'aguardando embalar' },
  { match: ['Aguardando Cotacao Frete'], pct: 85, label: 'Cotação de Frete — Logística', setor: 'Logística', estado: 'cotando o frete' },
  { match: STATUS_LIBERACAO_COMERCIAL_TODOS, pct: 90, label: 'Aguardando Liberação Comercial', setor: 'Comercial', estado: 'pronta, aguardando liberar para o Fiscal' },
  { match: ['Aguarda Emissao NF'], pct: 95, label: 'Fiscal — Emissão de NF', setor: 'Fiscal', estado: 'aguardando emitir a NF' },
  { match: ['Faturado e Disponivel para Entrega'], pct: 100, label: 'Faturado', setor: 'Comercial', estado: 'faturada, aguardando confirmar a entrega' },
  { match: ['Faturado'], pct: 100, label: 'Faturado', setor: null, estado: 'entregue, ciclo fechado', concluida: true },
];

/** A etapa de um status; status desconhecido volta como está, sem setor. */
export function etapaDaOp(status: string): EtapaOp {
  const achou = ETAPAS_OP.find(e => e.match.includes(status));
  return achou || { match: [], pct: 5, label: status || 'Iniciado', setor: null, estado: status || 'sem status', retrabalho: false };
}

/** Dois nomes de status são a mesma etapa? O histórico (logs, auditoria) guarda o nome
 *  antigo da liberação comercial — "Aprovado CQ - …" — e não se reescreve história;
 *  por isso quem lê histórico compara por aqui e nunca com `===` (Etapa 5.1). */
export const mesmaEtapa = (a: any, b: any) =>
  a === b || (aguardaLiberacaoComercial(a) && aguardaLiberacaoComercial(b));

// ── Desde quando ─────────────────────────────────────────────────────────────

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Dia (AAAA-MM-DD) no fuso de Brasília, para data pura ou carimbo com hora. */
const diaDe = (v: any): string | null => {
  if (!v) return null;
  const s = String(v);
  if (DIA.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : diaISO(d);
};

/** Quantos dias inteiros passaram desde a data (0 = hoje). Conta pelo dia de Brasília. */
export function diasDesde(data: any): number | null {
  const dia = diaDe(data);
  if (!dia) return null;
  const n = Math.round((new Date(hojeISO() + 'T12:00:00').getTime() - new Date(dia + 'T12:00:00').getTime()) / 86400000);
  return Math.max(0, n);
}

/**
 * Desde quando a OP está na etapa de hoje.
 *  1. Exato: o último evento do histórico que levou a OP a este status.
 *  2. Aproximado: a data do último marco registrado na própria OP (CQ, liberação…).
 *     Poucas OPs em aberto ficam sem o evento (medido em 29/09/2026 com a comparação
 *     por `mesmaEtapa`: 4 de 329 — a primeira medida, com `===`, dava 190 de 329 porque
 *     o histórico guarda o nome antigo da liberação comercial), e o marco é o que
 *     sobra — por isso a origem vai junto, para a tela dizer que é aproximado.
 *  3. Nada: devolve null e a tela escreve "sem registro".
 * `logs` é a linha do tempo em ordem crescente (OpVinculos.linhaDoTempo).
 */
export function desdeQuandoNaEtapa(op: any, logs: any[] = []): { data: string; fonte: 'evento' | 'marco'; marco?: string } | null {
  const status = op?.status_geral;
  for (let i = (logs || []).length - 1; i >= 0; i--) {
    const l = logs[i];
    // só transição PARA este status (anotação com status igual antes e depois não conta)
    if (mesmaEtapa(l.status_novo, status) && !mesmaEtapa(l.status_anterior, l.status_novo) && l.data_hora) {
      return { data: l.data_hora, fonte: 'evento' };
    }
  }
  const marcos = marcosDaOp(op || {});
  let ultimo = null;
  for (const m of marcos) {
    const t = new Date(m.data).getTime();
    if (!isNaN(t) && (!ultimo || t > ultimo.t)) ultimo = { t, m };
  }
  return ultimo ? { data: ultimo.m.data, fonte: 'marco', marco: ultimo.m.etapa } : null;
}

// ── Desde quando, para uma LISTA de OPs (Etapa 6.2, 29/09/2026) ──────────────

/** Colunas da OP que `marcosDaOp` lê. Quem lista OPs e quer a coluna "Onde está" precisa
 *  trazê-las no select, senão o "desde quando" aproximado não tem de onde sair. */
export const COLUNAS_MARCOS_OP = 'data_criacao,ts_entrada,data_entrada,data_inicio_engenharia,data_liberacao_bom,data_liberacao_pcp,data_kiting,data_inicio_producao,ts_inicio_prod,data_conclusao_producao,ts_fim_prod,data_cq,data_liberacao_comercial,data_emissao_nf,ts_nf,data_entrega';

/**
 * Para cada OP da lista, a data do último evento do histórico que a levou ao status de hoje
 * (id da OP -> data). Vem de uma função do banco (`desde_quando_na_etapa`) porque o
 * histórico tem milhares de linhas e o servidor devolve no máximo 1.000 por leitura: ler
 * daqui cortaria em silêncio (achado A8/A9). A regra é a mesma de `desdeQuandoNaEtapa`,
 * inclusive os dois nomes da liberação comercial contarem como a mesma etapa.
 * OP sem evento simplesmente não aparece no mapa — quem usa cai no marco (ver
 * `desdeQuandoDaLista`). Se a função falhar, devolve mapa vazio e a lista mostra só as
 * datas aproximadas, em vez de quebrar.
 */
export async function desdeQuandoEmLote(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = Array.from(new Set((ids || []).filter(Boolean).map(String)));
  const LOTE = 400;
  const partes: string[][] = [];
  for (let i = 0; i < unicos.length; i += LOTE) partes.push(unicos.slice(i, i + LOTE));
  const respostas = await Promise.all(partes.map(p => supabase.rpc('desde_quando_na_etapa', { p_ids: p })));
  for (const r of respostas) {
    if (r.error) { console.error('"Desde quando" da lista: a função do banco falhou, usando só as datas aproximadas:', r.error); continue; }
    (r.data || []).forEach((x: any) => { if (x?.opl_id && x?.desde) mapa.set(String(x.opl_id), x.desde); });
  }
  return mapa;
}

/** "Desde quando" de uma OP da lista: a data do evento (se a função do banco achou uma),
 *  senão o último marco registrado na própria OP, marcado como aproximado. */
export function desdeQuandoDaLista(op: any, dataDoEvento?: string | null) {
  if (dataDoEvento) return { data: dataDoEvento, fonte: 'evento' as const };
  return desdeQuandoNaEtapa(op, []);
}

/**
 * O resumo de "onde está" para o selo do card do CRM (Etapa 6.3, 29/09/2026). Um card pode
 * ter mais de uma OP (lote, venda desmembrada: no máximo 4 hoje); o selo mostra UMA frase:
 * o setor (ou "N setores", se as unidades estão em lugares diferentes) e os dias da unidade
 * que está há MAIS tempo na etapa, porque é essa a que pede atenção. O detalhe de cada
 * unidade vai na dica. Sem cor de alerta por tempo (decisão do usuário na 6.1); só âmbar
 * quando alguma unidade está em retrabalho/devolvida.
 * `ops` traz, por OP, o número, o status e o "desde quando" (desdeQuandoDaLista).
 */
export function resumoDasOps(ops: Array<{ opl: string; status_geral: string; desde: any }>) {
  if (!ops || !ops.length) return null;
  const encerrada = (o: any) => o.status_geral === 'Cancelado' || !!etapaDaOp(o.status_geral).concluida;
  const abertas = ops.filter(o => !encerrada(o));
  const linha = (o: any) => {
    const e = etapaDaOp(o.status_geral);
    const onde = o.status_geral === 'Cancelado' ? 'cancelada' : e.concluida ? 'concluída' : `${e.setor || e.label} — ${e.estado}`;
    const quando = !encerrada(o) && o.desde
      ? ` · desde ${o.desde.fonte === 'marco' ? '≈ ' : ''}${textoData(o.desde.data)} (${textoDias(diasDesde(o.desde.data))})` : '';
    return `${String(o.opl || '').trim()}: ${onde}${quando}`;
  };
  const dica = ops.map(linha).join('\n');

  if (!abertas.length) {
    const canceladas = ops.every(o => o.status_geral === 'Cancelado');
    return { texto: canceladas ? 'Cancelada' : 'Concluída', familia: (canceladas ? 'neutro' : 'ok') as 'neutro' | 'ok', titulo: dica };
  }
  const setores = Array.from(new Set(abertas.map(o => { const e = etapaDaOp(o.status_geral); return e.setor || e.label; })));
  const setor = setores.length === 1 ? setores[0] : `${setores.length} setores`;
  const maisParada = abertas.filter(o => o.desde)
    .sort((a, b) => new Date(a.desde.data).getTime() - new Date(b.desde.data).getTime())[0];
  const dias = maisParada ? diasDesde(maisParada.desde.data) : null;
  const texto = dias == null ? setor : `${setor} · ${maisParada.desde.fonte === 'marco' ? '≈ ' : ''}${textoDias(dias)}`;
  const familia = (abertas.some(o => etapaDaOp(o.status_geral).retrabalho) ? 'atencao' : 'info') as 'atencao' | 'info';
  const rodape = ops.length > 1 ? '\n(o número do selo é o da unidade há mais tempo na etapa)' : '';
  return { texto, familia, titulo: `${dica}${rodape}\nClique para abrir ${ops.length > 1 ? 'a primeira unidade' : 'a OP'}.` };
}

/** "há 12 dias", "há 1 dia", "hoje". */
export function textoDias(n: number | null): string {
  if (n == null) return '';
  return n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;
}

/** "17/09" (com o ano quando não é o corrente). */
export function textoData(data: any): string {
  const dia = diaDe(data);
  if (!dia) return '';
  const [a, m, d] = dia.split('-');
  return a === hojeISO().slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}
