// Serviços de terceiros, fatia T5 (23/11/2026): a ligação do serviço com a saída da Vistoria de pátio (PLANO_SERVICOS_TERCEIROS.md).
// Decidido com o usuário em 23/11/2026: da janela do serviço dá para "Registrar a saída" (abre a Vistoria de pátio já preenchida com o prestador como destino, o documento e a previsão de retorno;
// ao salvar, a saída fica ligada ao serviço) e também "Ligar a uma saída que já existe". Com a saída ligada o serviço mostra "No prestador desde 23/11" e, quando a Vistoria registra o retorno, "Voltou em 28/11".
// O que não se quebra aqui:
//  • quem liga e desliga é o BANCO (`terceiros_vistoria_ligar` e `_desligar`, tudo ou nada, com o histórico do serviço); a tela só deixa de oferecer o que ele recusaria;
//  • o serviço guarda só o id da saída: o estado dela (saiu ou voltou, o destino e a previsão) é lido da própria vistoria, então o retorno registrado lá aparece aqui sem ninguém repetir nada;
//  • leitura recusada devolve o erro, nunca "a saída não existe": o serviço mostra "Saída ligada" sem afirmar se já voltou.
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { diaISO } from './Interface';
import { chamar, deu, falhou, descreverNumeros } from './TerceirosServicos';
import type { RespostaDoBanco } from './TerceirosServicos';
import { podeMexerNoServico } from './TerceirosFluxo';
import type { ServicoDeTerceiro } from './TerceirosFluxo';
import { podeMexerNaOrdem } from './TerceirosOrdens';
import { temAbaDe } from './ViagemFluxo';
import type { PrestadorDeTerceiros } from './TerceirosModelo';

/** Só o que a tela precisa da saída (nada de fotos nem assinaturas, que pesam). */
export const COLUNAS_DA_SAIDA = 'id,status,data_saida,data_retorno,previsao_retorno,destino,tipo_servico,veiculo_placa,tipo_documento,numero_documento';

export type SaidaDaVistoria = {
  id: string; status: string | null; data_saida: string | null; data_retorno: string | null; previsao_retorno: string | null; destino: string | null;
  tipo_servico: string | null; veiculo_placa: string | null; tipo_documento: string | null; numero_documento: string | null;
};
export type LeituraDeSaidas = { mapa: Map<string, SaidaDaVistoria>; erro: string | null };

const MAXIMO_POR_LIGACAO = 100;   // o limite das funções do banco

/** A saída já voltou? É a mesma conta da Vistoria (`pendentes = status !== 'Retornou'`). */
export const saidaJaVoltou = (v: Pick<SaidaDaVistoria, 'status'> | null | undefined): boolean => v?.status === 'Retornou';
/** A saída chegou ao fim (voltou): não muda mais, então a atualização de minuto em minuto não precisa lê-la de novo. */
export const saidaEstaEncerrada = saidaJaVoltou;

/** O dia (no relógio de quem olha) de um instante do banco; "" se não for um instante. */
const diaDoInstante = (instante: unknown): string | null => {
  if (!instante) return null;
  const d = new Date(String(instante));
  return Number.isNaN(d.getTime()) ? null : diaISO(d);
};

/** Lê as saídas pelos ids (as que os serviços apontam). Leitura recusada devolve o erro: quem chama mantém o que já sabia. */
export async function lerSaidasPorId(ids: string[]): Promise<LeituraDeSaidas> {
  const mapa = new Map<string, SaidaDaVistoria>();
  const lista = [...new Set(ids.filter(Boolean))];
  try {
    for (let i = 0; i < lista.length; i += 60) {
      const { data, error } = await supabase.from('vistorias_patio').select(COLUNAS_DA_SAIDA).in('id', lista.slice(i, i + 60));
      if (error) return { mapa: new Map(), erro: explicarErroDoBanco(error) };
      for (const v of (data || []) as SaidaDaVistoria[]) mapa.set(v.id, v);
    }
    return { mapa, erro: null };
  } catch (e: any) {
    return { mapa: new Map(), erro: explicarErroDoBanco(e) };
  }
}

/** As saídas que ainda não voltaram, as mais recentes primeiro (para escolher a que se liga ao serviço). */
export async function lerSaidasEmAberto(): Promise<{ lista: SaidaDaVistoria[]; erro: string | null }> {
  try {
    const { data, error } = await supabase.from('vistorias_patio').select(COLUNAS_DA_SAIDA).or('status.is.null,status.neq.Retornou').order('data_saida', { ascending: false }).limit(200);
    if (error) return { lista: [], erro: explicarErroDoBanco(error) };
    return { lista: (data || []) as SaidaDaVistoria[], erro: null };
  } catch (e: any) {
    return { lista: [], erro: explicarErroDoBanco(e) };
  }
}

/**
 * Põe em cada serviço ligado a uma saída a situação dela (campos derivados). Saída que a leitura não trouxe vale 'desconhecida' (o selo diz só "Saída ligada").
 * Serviço sem saída sai igual (o mesmo objeto), e a lista inteira sai igual quando nenhum serviço tem saída.
 */
export function anexarVistorias(servicos: ServicoDeTerceiro[], saidas: LeituraDeSaidas | null): ServicoDeTerceiro[] {
  if (!servicos.some(s => s.vistoria_id)) return servicos;
  return servicos.map(s => {
    if (!s.vistoria_id) return s;
    const v = saidas?.mapa.get(s.vistoria_id);
    if (!v) return s.vistoria_status === 'desconhecida' ? s : { ...s, vistoria_status: 'desconhecida' as const, vistoria_saida: null, vistoria_retorno: null, vistoria_previsao: null, vistoria_destino: null };
    return {
      ...s, vistoria_status: saidaJaVoltou(v) ? ('Retornou' as const) : ('Saiu' as const), vistoria_saida: diaDoInstante(v.data_saida), vistoria_retorno: diaDoInstante(v.data_retorno),
      vistoria_previsao: v.previsao_retorno ? String(v.previsao_retorno).slice(0, 10) : null, vistoria_destino: v.destino || null,
    };
  });
}

// ═══ QUEM PODE LIGAR, E O PORQUÊ QUANDO NÃO PODE ═══════════════════════════════════════════════════════════════════════════════════════════════════
const podeMexerNaSaidaDe = (s: ServicoDeTerceiro, u: any, tipoDe: (s: ServicoDeTerceiro) => any): boolean => podeMexerNoServico(u, s, tipoDe(s)) || !!(s.ordem_id && podeMexerNaOrdem(u));

/** Os serviços que esta pessoa pode ligar a uma saída agora: não cancelados, ainda sem saída ligada e que ela pode mexer (a conta de `terceiros_vistoria_ligar`). */
export const servicosQueLigamSaida = (servicos: ServicoDeTerceiro[], u: any, tipoDe: (s: ServicoDeTerceiro) => any): ServicoDeTerceiro[] =>
  servicos.filter(s => s.status !== 'cancelado' && !s.vistoria_id && podeMexerNaSaidaDe(s, u, tipoDe)).slice(0, MAXIMO_POR_LIGACAO);

/** Os serviços que esta pessoa pode desligar de uma saída (os ligados, que ela pode mexer). */
export const servicosQueDesligamSaida = (servicos: ServicoDeTerceiro[], u: any, tipoDe: (s: ServicoDeTerceiro) => any): ServicoDeTerceiro[] =>
  servicos.filter(s => !!s.vistoria_id && podeMexerNaSaidaDe(s, u, tipoDe)).slice(0, MAXIMO_POR_LIGACAO);

/** Só quem tem a aba da Vistoria de pátio chega até ela (o botão "Registrar a saída" leva para lá). Ligar a uma saída que já existe não precisa da aba. */
export const podeIrParaAVistoria = (u: any): boolean => temAbaDe(u, 'vistorias');

// ═══ A SAÍDA NOVA: o que a Vistoria recebe já preenchido ═══════════════════════════════════════════════════════════════════════════════════════════
/** O tipo de serviço da Vistoria que mais se parece com o tipo do serviço de terceiros (a lista da Vistoria é fixa; o que não casa vai como "Servico Externo (Terceiro)"). */
export function tipoDeSaidaDoServico(nomeDoTipo: unknown): string {
  const t = String(nomeDoTipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (t.includes('pintura eletrostatica')) return 'Pecas para Pintura';
  if (t.includes('lavagem')) return 'Lavagem';
  if (t.includes('plotagem')) return 'Plotagem';
  if (t.includes('funilaria') || t.includes('pintura')) return 'Funilaria/Pintura';
  if (t.includes('mecanica')) return 'Mecanica';
  return 'Servico Externo (Terceiro)';
}

export type SaidaPreenchida = {
  tipo_servico: string; destino: string; tipo_documento: string; numero_documento: string; veiculo_modelo: string; solicitante: string; previsao_retorno: string; observacoes: string;
  /** os serviços a que a saída será ligada ao ser registrada (a Vistoria chama `ligarSaida` depois de gravar) */
  terceiros_ids: string[]; terceiros_numeros: string;
};

/** O que a Vistoria recebe já preenchido: quem pede só confere e completa (placa, responsável, fotos e assinaturas são da Vistoria). */
export function saidaPreenchida(servicos: ServicoDeTerceiro[], prestador: Pick<PrestadorDeTerceiros, 'nome'> | null | undefined, tipoDe: (s: ServicoDeTerceiro) => any, u: any): SaidaPreenchida {
  const base = servicos[0];
  const tipo = tipoDe(base);
  const daOp = servicos.find(s => s.ligacao_tipo === 'op' && s.ligacao_rotulo);
  const previsao = servicos.map(s => s.ordem_previsao_retorno).find(Boolean) || '';
  const numeros = descreverNumeros(servicos);
  const ligacoes = [...new Set(servicos.map(s => s.ligacao_rotulo).filter(Boolean))];
  return {
    tipo_servico: tipoDeSaidaDoServico(tipo?.nome), destino: prestador?.nome || '',
    tipo_documento: daOp ? (/^d/i.test(String(daOp.ligacao_rotulo)) ? 'OPD' : 'OPL') : 'Sem Documento', numero_documento: daOp ? String(daOp.ligacao_rotulo).toUpperCase() : '',
    veiculo_modelo: servicos.length === 1 ? String(base.descricao || '').slice(0, 120) : `${tipo?.nome || 'Serviço de terceiro'} — ${servicos.length} serviços`,
    solicitante: String(u?.nome || ''), previsao_retorno: String(previsao), observacoes: `Serviço de terceiros ${numeros}${tipo?.nome ? ` (${tipo.nome})` : ''}${ligacoes.length ? ` — ${ligacoes.slice(0, 3).join(', ')}${ligacoes.length > 3 ? ' e outros' : ''}` : ''}.`,
    terceiros_ids: servicos.map(s => s.id), terceiros_numeros: numeros,
  };
}

/** Leva à Vistoria de pátio com a saída já preenchida (o recado fica em `window.__acnDeepLink`, que a Vistoria lê ao abrir; o Dashboard só troca de aba se a pessoa a tem). */
export function irParaRegistrarSaida(saida: SaidaPreenchida): void {
  (window as any).__acnDeepLink = { vistoriaNova: saida };
  window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'vistorias' } }));
}

// ═══ A GRAVAÇÃO ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const NAO_CONFIRMOU = 'O banco não confirmou a gravação de todos os serviços. Atualize a tela para ver como ficou antes de tentar de novo.';

function conferirLinhas(dados: any, ids: string[]): RespostaDoBanco<ServicoDeTerceiro[]> {
  const linhas: any[] = Array.isArray(dados) ? dados : [];
  const achados = new Set(linhas.map(l => l?.id));
  if (!ids.length || !ids.every(id => achados.has(id))) return falhou<ServicoDeTerceiro[]>(NAO_CONFIRMOU);
  return deu(linhas as ServicoDeTerceiro[]);
}

/** Liga os serviços a UMA saída da vistoria (ligar de novo à mesma não dá erro; a outra saída o banco recusa e manda desligar antes). */
export async function ligarSaida(ids: string[], vistoriaId: string): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_vistoria_ligar', { p_ids: ids, p_vistoria_id: vistoriaId });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

/** Desliga os serviços da saída (o motivo, de 5 letras ou mais, fica no histórico do serviço). */
export async function desligarSaida(ids: string[], motivo: string): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_vistoria_desligar', { p_ids: ids, p_motivo: motivo });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}
