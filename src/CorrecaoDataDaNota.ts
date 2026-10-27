// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CORRIGIR A DATA DE UMA NOTA JÁ EMITIDA (pedido do usuário em 27/10/2026, no Fiscal)
//
// Em 26/10/2026 o Fiscal ganhou a "Data da nota" na hora de faturar (DataDaNota.ts). Faltava o caminho de volta: a nota já foi emitida com a data errada (ou "hoje" por esquecimento) e a OP já
// pode até estar entregue. A data da nota (`oples.data_emissao_nf`) é a que o relatório de faturamento do mês, a comissão por faturamento e a Conciliação Bancária leem — por isso corrigi-la
// não é "editar um campo": a nota muda de mês, e a janela diz isso e avisa quando o mês já tem comissão aprovada.
// Decisões do usuário em 27/10/2026: (1) acha-se QUALQUER nota emitida, por busca (OP, número da nota ou cliente), inclusive as já entregues; (2) uma NF-e que cobre várias OPs (nota de lote) é
// corrigida de uma vez em todas as OPs dela, com a possibilidade de desmarcar; (3) quem tem a aba Fiscal corrige, com motivo obrigatório, histórico da OP e auditoria com a data de antes.
// Sem tela: é a regra e a gravação, para testar sem navegador. A janela está em CorrigirDataDaNotaModal.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { resolverDataDaNota, diaLocal, dataBR, mesPorExtenso } from './DataDaNota';

const limpo = (v: any) => String(v ?? '').trim();

/** O dia da nota (AAAA-MM-DD) pelo relógio de quem está na tela. Data pura (sem hora) é lida do texto, nunca por `new Date`, que a deslocaria um dia. */
export function diaDaNota(v: any): string {
  const t = limpo(v);
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : diaLocal(d);
}

/** O que identifica a nota da OP: o número da NF-e; sem NF-e, o da NFS-e. Vazio = a OP não guarda número (a nota é só dela). */
export function chaveDaNota(o: any): string {
  if (limpo(o?.numero_nf)) return 'nfe:' + limpo(o.numero_nf);
  if (limpo(o?.numero_nf_servico)) return 'nfs:' + limpo(o.numero_nf_servico);
  return '';
}

/** "A1801.2610/02" vem depois de "A1801.2610/01", e "/10" depois de "/9" (comparação numérica do texto). */
const porNumero = (a: any, b: any) => String(a.opl || '').localeCompare(String(b.opl || ''), 'pt-BR', { numeric: true });

/**
 * As OPs que a MESMA nota cobre: o mesmo número, a mesma empresa que faturou (ACN e Detech têm séries de numeração separadas: o "1234" de uma não é o "1234" da outra) e o mesmo dia.
 * A OP escolhida sempre entra. Sem número guardado, a nota é só a dela.
 */
export function dasMesmaNota(op: any, candidatas: any[]): any[] {
  const chave = chaveDaNota(op);
  if (!chave) return [op];
  const empresa = limpo(op.faturamento_empresa);
  const dia = diaDaNota(op.data_emissao_nf);
  const grupo = (candidatas || []).filter(o => o && o.id !== op.id && o.data_emissao_nf && chaveDaNota(o) === chave && limpo(o.faturamento_empresa) === empresa && diaDaNota(o.data_emissao_nf) === dia);
  return [op, ...grupo].sort(porNumero);
}

/** Texto das notas da OP: "NF-e 1234 · NFS-e 55". */
export const descricaoDasNotas = (o: any): string => [limpo(o?.numero_nf) && `NF-e ${limpo(o.numero_nf)}`, limpo(o?.numero_nf_servico) && `NFS-e ${limpo(o.numero_nf_servico)}`].filter(Boolean).join(' · ') || 'sem número de nota';

export type PlanoDaCorrecao = {
  erro?: string;
  nova?: any;                    // a data resolvida (DataDaNota.ts)
  instante?: string;             // o que vai para `data_emissao_nf`
  aplicar: any[];                // as OPs que mudam
  iguais: any[];                 // as que já estão nesse dia (nada a fazer)
  mesesDe: string[];             // os meses (AAAA-MM) de onde as notas saem
  mesPara: string;               // o mês (AAAA-MM) para onde vão
};

/**
 * Confere a data nova e separa as OPs marcadas em "mudam" e "já estão nesse dia". NÃO grava.
 *  • a data é obrigatória (aqui "vazio" não vale como "hoje": corrigir exige escolher o dia);
 *  • a mesma regra do lançamento: nada de data futura, inexistente ou de antes de 2020; "hoje" vale e grava o instante de agora;
 *  • dia retroativo grava o meio-dia daquele dia (longe das viradas de dia dos relatórios), como no lançamento.
 */
export function planejarCorrecao({ itens, entrada, agora = new Date() }: { itens: any[]; entrada: any; agora?: Date }): PlanoDaCorrecao {
  const vazio = (erro: string): PlanoDaCorrecao => ({ erro, aplicar: [], iguais: [], mesesDe: [], mesPara: '' });
  if (!(itens || []).length) return vazio('Marque pelo menos uma OP para corrigir.');
  if (!limpo(entrada)) return vazio('Escolha a nova data da nota.');
  const nova = resolverDataDaNota(entrada, agora);
  if (nova.erro) return vazio(nova.erro);
  const aplicar: any[] = [], iguais: any[] = [];
  for (const o of itens) (diaDaNota(o.data_emissao_nf) === nova.dia ? iguais : aplicar).push(o);
  if (!aplicar.length) return vazio(itens.length > 1 ? `As notas marcadas já estão em ${dataBR(nova.dia)}. Escolha outro dia.` : `A nota já está em ${dataBR(nova.dia)}. Escolha outro dia.`);
  return {
    nova, instante: nova.retroativa && nova.iso ? nova.iso : agora.toISOString(), aplicar, iguais,
    mesesDe: [...new Set(aplicar.map(o => diaDaNota(o.data_emissao_nf).slice(0, 7)))].sort(), mesPara: nova.dia.slice(0, 7),
  };
}

/** O que a pergunta de confirmação diz: para onde a nota vai e se algum mês envolvido já tem comissão aprovada. `fechamentos`: mês (AAAA-MM) → { qtd, erro } de DataDaNota.lerFechamentosAprovadosDoMes. */
export function avisoDaCorrecao(plano: PlanoDaCorrecao, fechamentos: Record<string, { qtd: number; erro?: string }> = {}): string {
  if (plano.erro || !plano.nova) return '';
  const nome = (mes: string) => mesPorExtenso(mes + '-01');
  const n = plano.aplicar.length;
  const linhas: string[] = [];
  const saem = plano.mesesDe.filter(m => m !== plano.mesPara);
  if (saem.length) linhas.push(`${n === 1 ? 'A nota sai' : `As ${n} notas saem`} de ${saem.map(nome).join(' e de ')} e ${n === 1 ? 'entra' : 'entram'} em ${nome(plano.mesPara)}: no relatório de faturamento, na comissão e na conciliação bancária.`);
  else linhas.push(`${n === 1 ? 'A nota continua' : `As ${n} notas continuam`} em ${nome(plano.mesPara)}; muda só o dia.`);
  for (const m of [...new Set([...plano.mesesDe, plano.mesPara])].sort()) {
    const f = fechamentos[m];
    if (!f) continue;
    if (f.erro) linhas.push(`Não consegui conferir se ${nome(m)} já tem comissão aprovada (${f.erro}).`);
    else if (f.qtd > 0) linhas.push(`ATENÇÃO: ${nome(m)} já tem comissão aprovada para ${f.qtd} técnico${f.qtd > 1 ? 's' : ''}; o que já foi aprovado não é recalculado.`);
  }
  return linhas.join('\n');
}

/** A linha do histórico da OP: a data de antes e de depois, as notas, o motivo e o dia da correção. */
export function textoDaCorrecao(o: any, nova: any, motivo: string, quem: string, agora: Date = new Date()): string {
  return `Data da nota corrigida por ${quem || '—'}: ${dataBR(diaDaNota(o.data_emissao_nf))} → ${dataBR(nova.dia)} (${descricaoDasNotas(o)}). Motivo: ${limpo(motivo)}. Correção feita em ${dataBR(diaLocal(agora))}.`;
}

export type ResultadoCorrecao = {
  corrigidas: string[];                                  // números das OPs corrigidas
  mudaram: string[];                                     // a data da OP mudou por outra pessoa enquanto a janela estava aberta: nada foi gravado nelas
  falhas: string[];                                      // "OP: motivo"
  semHistorico: { opl: string; motivo: string }[];       // corrigidas, mas a linha do histórico não gravou
  erro?: string;
};

/**
 * Grava a correção, uma OP por vez. Cada gravação só pega se a data AINDA for a que a janela mostrou (outra pessoa pode ter corrigido nesse meio-tempo): a linha devolvida confirma.
 * Só a data muda — número da nota, etapa, responsável fiscal e tempo do Fiscal ficam como estão. Cada OP corrigida ganha a auditoria (com a data de antes) e a linha no histórico.
 */
export async function corrigirDataDaNota({ plano, motivo, usuario, agora = new Date() }: { plano: PlanoDaCorrecao; motivo: string; usuario: any; agora?: Date }): Promise<ResultadoCorrecao> {
  const r: ResultadoCorrecao = { corrigidas: [], mudaram: [], falhas: [], semHistorico: [] };
  if (plano.erro || !plano.nova || !plano.instante) { r.erro = plano.erro || 'Plano de correção inválido.'; return r; }
  if (limpo(motivo).length < 3) { r.erro = 'Escreva o motivo da correção: ele vai no histórico de cada OP.'; return r; }
  const agoraISO = agora.toISOString();
  for (const o of plano.aplicar) {
    const { data, error } = await supabase.from('oples').update({ data_emissao_nf: plano.instante, data_atualizacao: agoraISO })
      .eq('id', o.id).eq('data_emissao_nf', o.data_emissao_nf).select('id');
    if (error) { r.falhas.push(`${o.opl}: ${error.message}`); continue; }
    if (!data || data.length !== 1) { r.mudaram.push(o.opl); continue; }
    logChange({ module: 'fiscal', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
      oldRow: { data_emissao_nf: o.data_emissao_nf }, newRow: { data_emissao_nf: plano.instante }, user: usuario });
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: o.id, numero_opl: o.opl, setor: 'Fiscal', evento: textoDaCorrecao(o, plano.nova, motivo, usuario?.nome, agora),
      status_anterior: o.status_geral, status_novo: o.status_geral, usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: agoraISO,
    }]);
    if (erroLog) r.semHistorico.push({ opl: o.opl, motivo: erroLog.message });
    r.corrigidas.push(o.opl);
  }
  return r;
}

/** Frase para a pessoa: o que aconteceu em cada OP. */
export function textoDoResultadoCorrecao(r: ResultadoCorrecao, nova: any): string {
  if (r.erro) return r.erro;
  const partes = [r.corrigidas.length ? `${r.corrigidas.length === 1 ? `Data da nota da OP ${r.corrigidas[0]}` : `Data da nota de ${r.corrigidas.length} OPs (${r.corrigidas.join(', ')})`} corrigida para ${dataBR(nova?.dia)}` : 'Nenhuma data foi corrigida'];
  if (r.mudaram.length) partes.push(`${r.mudaram.join(', ')} ${r.mudaram.length === 1 ? 'teve' : 'tiveram'} a data mudada por outra pessoa enquanto a janela estava aberta e não ${r.mudaram.length === 1 ? 'foi' : 'foram'} alterada${r.mudaram.length === 1 ? '' : 's'}`);
  if (r.falhas.length) partes.push(`houve falha em ${r.falhas.length}: ${r.falhas.slice(0, 3).join(' | ')}`);
  if (r.semHistorico.length) partes.push(`${r.semHistorico.map(x => x.opl).join(', ')} corrigida${r.semHistorico.length > 1 ? 's' : ''} mas sem registro no histórico (${[...new Set(r.semHistorico.map(x => x.motivo))].slice(0, 2).join(' | ')})`);
  return partes.join(' · ') + '.';
}

/** A correção pede atenção: alguma OP falhou, mudou no meio-tempo ou ficou sem histórico (a frase fica vermelha e parada na tela). */
export const correcaoComProblema = (r: ResultadoCorrecao) => !!r.erro || r.falhas.length > 0 || r.mudaram.length > 0 || r.semHistorico.length > 0;

const COLUNAS = 'id,opl,cliente_nome,numero_nf,numero_nf_servico,data_emissao_nf,status_geral,faturamento_empresa,quantidade';

/** Tira do texto digitado o que tem sentido de comando no filtro do banco (vírgula, parênteses, aspas, curinga). */
export const textoDeBuscaSeguro = (t: any): string => String(t ?? '').replace(/[,()"'*%\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** Procura notas já emitidas por OP, número da nota (NF-e ou NFS-e) ou cliente. Só OPs com data de emissão; as mais recentes primeiro. Leitura que falha devolve o erro, nunca "nada achado". */
export async function buscarNotasEmitidas(termo: any, limite = 30): Promise<{ lista: any[]; erro: string }> {
  const t = textoDeBuscaSeguro(termo);
  if (t.length < 2) return { lista: [], erro: '' };
  const { data, error } = await supabase.from('oples').select(COLUNAS).not('data_emissao_nf', 'is', null)
    .or(`opl.ilike.%${t}%,numero_nf.ilike.%${t}%,numero_nf_servico.ilike.%${t}%,cliente_nome.ilike.%${t}%`)
    .order('data_emissao_nf', { ascending: false }).limit(limite);
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}

/** As OPs que têm o mesmo número de nota da OP escolhida (a conferência de empresa e dia é de `dasMesmaNota`). Leitura que falha devolve o erro. */
export async function lerOPsDoMesmoNumero(op: any): Promise<{ lista: any[]; erro: string }> {
  const chave = chaveDaNota(op);
  if (!chave) return { lista: [], erro: '' };
  const coluna = chave.startsWith('nfe:') ? 'numero_nf' : 'numero_nf_servico';
  const { data, error } = await supabase.from('oples').select(COLUNAS).eq(coluna, chave.slice(4)).not('data_emissao_nf', 'is', null).order('opl');
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}
