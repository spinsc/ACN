// Serviços de terceiros: a ORDEM DE SERVIÇO EM LOTE da pintura eletrostática (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): as regras, a leitura e a gravação.
// Decidido com o usuário em 23/11/2026:
//  • o lote segue a ORDEM: o prestador e o dia da ordem valem para todos os serviços, que andam juntos para "Agendado"; só se tira um serviço antes de a ordem ser enviada;
//  • a ordem só vira "Enviada" com a CÓPIA ASSINADA anexada (sem ela fica "Aguardando assinatura");
//  • no retorno a ordem fecha todos os serviços de uma vez, cada um com o seu valor final e quem conferiu;
//  • Admin, gerentes e Adaptação montam, enviam e fecham; quem só pediu o serviço vê a ordem e o selo, mas não mexe.
// O que não se quebra aqui (o mesmo de TerceirosServicos.ts):
//  • a ordem NÃO tem política de gravação: tudo passa pelas funções `terceiros_ordem_*` (tudo ou nada, conferem a situação de antes e quem pode, deixam o histórico na ordem e em cada serviço);
//  • leitura recusada devolve o erro, nunca "sem ordens": a tela mantém a lista de antes e avisa em vermelho;
//  • toda gravação confere a resposta: a ordem e todos os serviços que o banco devia devolver; se faltar um, a tela diz que não foi confirmado.
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { logChange } from './AuditSystem';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerValorDigitado } from './LerValor';
import { chamar, falhou, deu, DIAS_DA_JANELA_DE_LEITURA } from './TerceirosServicos';
import type { RespostaDoBanco } from './TerceirosServicos';
import { somarDiasISO, estaEmOrdemAtiva, motivoValido } from './TerceirosFluxo';
import type { ServicoDeTerceiro, AnexoDoServico, EventoDoServico, SituacaoDaOrdem, FamiliaDoSelo } from './TerceirosFluxo';
import type { TipoDeServico } from './TerceirosModelo';
import { podeMontarOrdemDeTerceiros } from './utils/permissoes';

export type OrdemDeServico = {
  id: string; numero: string; prestador_id: string; status: SituacaoDaOrdem; status_desde: string;
  data_envio_prevista: string; previsao_retorno: string; data_envio_real: string | null; data_retorno_real: string | null;
  copias: AnexoDoServico[]; observacao: string | null;
  cancelado_motivo: string | null; cancelado_em: string | null; cancelado_por: string | null;
  enviada_em: string | null; enviada_por: string | null; fechada_em: string | null; fechada_por: string | null;
  criado_em: string; criado_por: string | null; atualizado_em: string; atualizado_por: string | null;
};

/** O histórico da ordem é a coluna mais pesada: a janela da ordem o lê à parte. */
export const COLUNAS_DA_ORDEM =
  'id,numero,prestador_id,status,status_desde,data_envio_prevista,previsao_retorno,data_envio_real,data_retorno_real,copias,observacao,cancelado_motivo,cancelado_em,cancelado_por,'
  + 'enviada_em,enviada_por,fechada_em,fechada_por,criado_em,criado_por,atualizado_em,atualizado_por';

export const SITUACOES_DA_ORDEM: { id: SituacaoDaOrdem; rotulo: string; familia: FamiliaDoSelo; ajuda: string }[] = [
  { id: 'montada', rotulo: 'Aguardando assinatura', familia: 'atencao', ajuda: 'A ordem foi montada; falta o prestador assinar e a cópia assinada ser anexada para as peças saírem.' },
  { id: 'enviada', rotulo: 'Peças no prestador', familia: 'info', ajuda: 'A cópia assinada foi anexada e as peças foram enviadas; falta o retorno.' },
  { id: 'fechada', rotulo: 'Fechada', familia: 'ok', ajuda: 'As peças voltaram e todos os serviços foram dados como realizados.' },
  { id: 'cancelada', rotulo: 'Cancelada', familia: 'neutro', ajuda: 'A ordem foi cancelada antes do envio; os serviços voltaram para "A definir".' },
];
const POR_SITUACAO = Object.fromEntries(SITUACOES_DA_ORDEM.map(x => [x.id, x]));
export const rotuloDaOrdem = (s: string): string => POR_SITUACAO[s]?.rotulo || String(s);
export const familiaDaOrdem = (s: string): FamiliaDoSelo => POR_SITUACAO[s]?.familia || 'neutro';

/** A ordem ainda anda (montada ou enviada)? É o que segura os serviços dela. */
export const ordemEstaAtiva = (o: Pick<OrdemDeServico, 'status'>): boolean => o.status === 'montada' || o.status === 'enviada';

// ═══ LEITURA ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type LeituraDeOrdens = { lista: OrdemDeServico[]; erro: string | null };

/**
 * Lê as ordens: SEMPRE as que andam (montada e enviada) e, das que já acabaram, só as dos últimos 120 dias (a mesma janela dos serviços). Mais as que os serviços lidos apontam e que ficaram fora da janela
 * (o serviço reaberto de uma ordem antiga continua apontando para ela: sem ler essa ordem a tela o trataria como preso numa ordem ativa).
 * `idsDosServicos` = os `ordem_id` dos serviços já lidos. Leitura que falha devolve o erro e a lista vazia: quem chama mantém a de antes.
 */
export async function lerOrdens(hoje: string, todos: boolean, idsDosServicos: string[] = []): Promise<LeituraDeOrdens> {
  const desde = todos ? null : somarDiasISO(hoje, -DIAS_DA_JANELA_DE_LEITURA);
  try {
    const linhas = (await lerPaginado(() => {
      const q = supabase.from('terceiros_ordens').select(COLUNAS_DA_ORDEM).order('id');
      return desde ? q.or(`status.in.(montada,enviada),atualizado_em.gte.${desde}`) : q;
    })) as unknown as OrdemDeServico[];
    const jaTem = new Set(linhas.map(o => o.id));
    const faltam = [...new Set(idsDosServicos.filter(Boolean))].filter(id => !jaTem.has(id));
    for (let i = 0; i < faltam.length; i += 60) {
      const { data, error } = await supabase.from('terceiros_ordens').select(COLUNAS_DA_ORDEM).in('id', faltam.slice(i, i + 60));
      if (error) return { lista: [], erro: explicarErroDoBanco(error) };
      linhas.push(...((data || []) as unknown as OrdemDeServico[]));
    }
    return { lista: linhas, erro: null };
  } catch (e: any) {
    return { lista: [], erro: explicarErroDoBanco(e) };
  }
}

/** O histórico de UMA ordem (a janela lê quando abre e de novo depois de cada gravação). */
export async function lerHistoricoDaOrdem(id: string): Promise<{ historico: EventoDoServico[]; erro: string | null }> {
  try {
    const { data, error } = await supabase.from('terceiros_ordens').select('historico').eq('id', id).maybeSingle();
    if (error) return { historico: [], erro: explicarErroDoBanco(error) };
    if (!data) return { historico: [], erro: 'A ordem não foi encontrada.' };
    return { historico: Array.isArray(data.historico) ? data.historico : [], erro: null };
  } catch (e: any) {
    return { historico: [], erro: explicarErroDoBanco(e) };
  }
}

/**
 * Põe em cada serviço o número, a situação e a previsão da ordem em que ele está (campos derivados, que não vêm do banco). Serviço sem ordem sai igual (o mesmo objeto).
 * Ordem que não está na lista: um serviço ainda "Agendado" pode estar preso nela (vale como `desconhecida` = ativa, por segurança); um que já saiu de "Agendado" não pode estar numa
 * ordem montada ou enviada (o banco só deixa a ordem andar com todos agendados), então a ordem dele já acabou.
 */
export function anexarOrdens(servicos: ServicoDeTerceiro[], ordens: OrdemDeServico[]): ServicoDeTerceiro[] {
  if (!servicos.some(s => s.ordem_id)) return servicos;
  const porId = new Map(ordens.map(o => [o.id, o]));
  return servicos.map(s => {
    if (!s.ordem_id) return s;
    const o = porId.get(s.ordem_id);
    if (o) return { ...s, ordem_numero: o.numero, ordem_status: o.status, ordem_previsao_retorno: o.previsao_retorno };
    return { ...s, ordem_numero: null, ordem_status: s.status === 'agendado' ? ('desconhecida' as const) : ('fechada' as const), ordem_previsao_retorno: null };
  });
}

// ═══ QUEM PODE E O QUE ENTRA ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const podeMexerNaOrdem = (u: any): boolean => podeMontarOrdemDeTerceiros(u);

/** Os serviços que podem entrar numa ordem agora: tipo com ordem em lote, "A definir" ou "Agendado" e fora de qualquer ordem ativa (mesma conta de `terceiros_validar_para_ordem`). */
export function candidatosParaOrdem(servicos: ServicoDeTerceiro[], tipos: Map<string, TipoDeServico>): ServicoDeTerceiro[] {
  return servicos
    .filter(s => (s.status === 'solicitado' || s.status === 'agendado') && !estaEmOrdemAtiva(s) && !!tipos.get(s.tipo_id)?.usa_ordem_em_lote)
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

/** Os serviços de uma ordem (os que apontam para ela), em ordem de número. */
export const servicosDaOrdem = (servicos: ServicoDeTerceiro[], ordemId: string): ServicoDeTerceiro[] =>
  servicos.filter(s => s.ordem_id === ordemId).sort((a, b) => a.numero.localeCompare(b.numero));

// ═══ O QUE FALTA / O QUE ESTÁ ERRADO (a janela confere antes de chamar o banco; o banco confere de novo) ═════════════════════════════════════════════
const ehDataValida = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function erroDaOrdemNova(d: { prestadorId: string; dataEnvio: string; previsao: string; quantos: number; prestadorFazTodos: boolean }, hoje: string): string | null {
  if (d.quantos < 1) return 'Marque pelo menos um serviço para a ordem.';
  if (d.quantos > 100) return 'Uma ordem leva no máximo 100 serviços.';
  if (!d.prestadorId) return 'Escolha o prestador da ordem.';
  if (!d.prestadorFazTodos) return 'O prestador escolhido não faz todos os tipos de serviço marcados.';
  if (!ehDataValida(d.dataEnvio)) return 'Informe o dia em que as peças vão ao prestador.';
  if (d.dataEnvio < hoje) return 'O dia do envio não pode ser anterior a hoje.';
  if (!ehDataValida(d.previsao)) return 'Informe a previsão de retorno das peças.';
  if (d.previsao < d.dataEnvio) return 'A previsão de retorno não pode ser anterior ao dia do envio.';
  return null;
}

export function erroDoEnvio(d: { arquivos: number; dataReal: string; previsao: string }, hoje: string): string | null {
  if (d.arquivos < 1) return 'Anexe a cópia assinada pelo prestador: sem ela a ordem não é enviada.';
  if (!ehDataValida(d.dataReal)) return 'Informe o dia em que as peças foram enviadas.';
  if (d.dataReal > hoje) return 'O dia do envio não pode ser no futuro.';
  if (d.dataReal < somarDiasISO(hoje, -60)) return 'O dia do envio está a mais de 60 dias: confira a data.';
  if (!ehDataValida(d.previsao)) return 'Informe a previsão de retorno das peças.';
  if (d.previsao < d.dataReal) return 'A previsão de retorno não pode ser anterior ao dia do envio.';
  return null;
}

const pareceNegativo = (texto: unknown): boolean => /^\s*(R\$\s*)?-/i.test(String(texto ?? ''));

/** `valores`: id do serviço → texto digitado do valor final ("0" vale; vazio não). */
export function erroDoRetorno(d: { dataRetorno: string; valores: Record<string, string>; ids: string[] }, ordem: Pick<OrdemDeServico, 'data_envio_real'>, hoje: string): string | null {
  if (!ehDataValida(d.dataRetorno)) return 'Informe o dia em que as peças voltaram.';
  if (d.dataRetorno > hoje) return 'O dia do retorno não pode ser no futuro.';
  if (ordem.data_envio_real && d.dataRetorno < ordem.data_envio_real) return `O dia do retorno não pode ser anterior ao do envio (${ordem.data_envio_real.split('-').reverse().join('/')}).`;
  for (const id of d.ids) {
    const t = d.valores[id] ?? '';
    if (pareceNegativo(t)) return 'O valor final não pode ser negativo.';
    const v = lerValorDigitado(t);
    if (v.vazio) return 'Informe o valor final de cada serviço (pode ser zero).';
    if (v.invalido) return `O valor final "${t}" não parece um número (exemplo: 1.250,00).`;
  }
  return null;
}

/** O valor digitado como número de duas casas (a função do banco só aceita dígitos e ponto); chamar depois de `erroDoRetorno`. */
export const valorFinalParaGravar = (texto: string): number => Math.round(Number(lerValorDigitado(texto).valor ?? 0) * 100) / 100;

// ═══ GRAVAÇÃO ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type RespostaDaOrdem = { ordem: OrdemDeServico; servicos: ServicoDeTerceiro[] };
const NAO_CONFIRMOU = 'O banco não confirmou a gravação da ordem. Atualize a tela para ver como ficou antes de tentar de novo.';
const NAO_CONFIRMOU_SERVICOS = 'O banco não confirmou a gravação de todos os serviços da ordem. Atualize a tela para ver como ficou antes de tentar de novo.';

/**
 * Confere a resposta: a linha da ordem (e a situação que ela devia ter ficado) e, se `ids` foi dado, uma linha para cada serviço pedido.
 * `idDaOrdem` vazio = a ordem é nova (montar): qualquer id serve.
 */
function conferirOrdem(dados: any, idDaOrdem: string, situacao: SituacaoDaOrdem | null, ids: string[]): RespostaDoBanco<RespostaDaOrdem> {
  const o = dados?.ordem;
  if (!o || !o.id || (idDaOrdem && o.id !== idDaOrdem) || (situacao && o.status !== situacao)) return falhou<RespostaDaOrdem>(NAO_CONFIRMOU);
  const servicos: ServicoDeTerceiro[] = Array.isArray(dados?.servicos) ? dados.servicos : [];
  const achados = new Set(servicos.map(s => s?.id));
  if (ids.length && !ids.every(id => achados.has(id))) return falhou<RespostaDaOrdem>(NAO_CONFIRMOU_SERVICOS);
  return deu({ ordem: o as OrdemDeServico, servicos });
}

export async function montarOrdem(ids: string[], prestadorId: string, dataEnvio: string, previsao: string, observacao: string | null): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_montar', { p_servicos: ids, p_prestador_id: prestadorId, p_data_envio: dataEnvio, p_previsao_retorno: previsao, p_observacao: observacao?.trim() || null });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, '', 'montada', ids);
}

export async function incluirNaOrdem(ordemId: string, ids: string[], statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_incluir', { p_id: ordemId, p_servicos: ids, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, 'montada', ids);
}

export async function tirarDaOrdem(ordemId: string, ids: string[], motivo: string, statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_tirar', { p_id: ordemId, p_servicos: ids, p_motivo: motivo, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, 'montada', ids);
}

/** Muda prestador, dia do envio, previsão de retorno, observação ou (na ordem enviada) troca a cópia. Se nada mudou o banco devolve a ordem e nenhum serviço. */
export async function atualizarOrdem(ordemId: string, dados: Record<string, any>, statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_atualizar', { p_id: ordemId, p_dados: dados, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, statusEsperado as SituacaoDaOrdem, []);
}

export async function enviarOrdem(ordemId: string, copias: { caminho: string; nome: string; tamanho?: number | null }[], dataReal: string, previsao: string | null, ids: string[], statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_enviar', { p_id: ordemId, p_copias: copias, p_data_envio_real: dataReal, p_previsao_retorno: previsao || null, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, 'enviada', ids);
}

export async function realizarOrdem(ordemId: string, dataRetorno: string, valores: { servico_id: string; valor_final: number }[], observacao: string | null, statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_realizar', { p_id: ordemId, p_data_retorno: dataRetorno, p_valores: valores, p_observacao: observacao?.trim() || null, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, 'fechada', valores.map(v => v.servico_id));
}

export async function cancelarOrdem(ordemId: string, motivo: string, ids: string[], statusEsperado: string): Promise<RespostaDoBanco<RespostaDaOrdem>> {
  const r = await chamar<any>('terceiros_ordem_cancelar', { p_id: ordemId, p_motivo: motivo, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<RespostaDaOrdem>(r.erro, r.codigo);
  return conferirOrdem(r.dados, ordemId, 'cancelada', ids);
}

export const motivoDaOrdemValido = motivoValido;

// ═══ AUDITORIA (o histórico geral do sistema; o histórico da ordem e o de cada serviço o banco já grava) ═══════════════════════════════════════════════
/** Registra a mudança da ordem no histórico geral, em segundo plano; nunca atrapalha quem trabalha. */
export function auditarOrdem(antes: OrdemDeServico | null, depois: OrdemDeServico, user: any): void {
  const recorte = (o: OrdemDeServico | null) => (o ? { status: o.status, prestador_id: o.prestador_id, data_envio_prevista: o.data_envio_prevista, previsao_retorno: o.previsao_retorno, data_envio_real: o.data_envio_real, data_retorno_real: o.data_retorno_real } : null);
  void (async () => {
    try {
      await logChange({
        module: 'terceiros', entityType: 'terceiros_ordens', entityId: depois.id, changeType: antes ? 'UPDATE' : 'CREATE', oldRow: recorte(antes) || undefined, newRow: recorte(depois), user,
        formatters: { status: (v: any) => (v ? rotuloDaOrdem(String(v)) : '—') }, metadata: { numero: depois.numero },
      });
    } catch { /* o histórico da própria ordem já guarda */ }
  })();
}
