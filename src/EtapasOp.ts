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
 *     Mais da metade das OPs em aberto não tem o evento (medido em 29/09/2026: 190
 *     de 329), e o marco é o que sobra — por isso a origem vai junto, para a tela
 *     dizer que é aproximado.
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
