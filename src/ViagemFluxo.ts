// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o quadro (Kanban) e o caminho da viagem (pedido do usuário em 04/11/2026)
//
// Só regra, sem tela nem banco: diz em que coluna a viagem está, para onde ela pode ir, quem pode levá-la e o que falta para ir. A tela é ViagensTab.tsx.
//
// As colunas (decididas com o usuário em 04/11/2026): ABERTA → EM APROVAÇÃO → PROVISIONAMENTO → ANDAMENTO → FINALIZADA, e NÃO APROVADA (a saída de quem a direção recusou).
// A coluna "Aprovada" que eu tinha proposto SAIU no mesmo dia ("a coluna aprovada não precisa"): aprovar leva direto a Provisionamento. A viagem que a OP de Adaptação
// externa gera (fatia seguinte) nasce já em EM APROVAÇÃO, antes de o cartão chegar na Adaptação. Os papéis abaixo foram PROPOSTOS por mim e o usuário ajusta ("eu proponho e você ajusta", 04/11/2026):
//   • ABERTA: quem tem a aba monta o roteiro e o orçamento e manda para aprovação (com a rota calculada).
//   • EM APROVAÇÃO: só a direção (Admin, gerentes e a equipe de Comercial/CRM e Licitações, que valem como o gerente do setor) aprova ou recusa; recusar pede motivo.
//   • PROVISIONAMENTO: quem leva a viagem para lá é quem aprova. É AQUI que o cartão chega na Adaptação e cada setor "nutre" a viagem (decidido com o usuário em 04/11/2026; é a
//     fatia 2, ainda não feita): a Adaptação define a equipe, o veículo da frota, o km do carro e a placa; o Comercial põe a descrição do serviço e o contrato com o cliente;
//     o Financeiro põe a verba total, diz se o pedágio é reembolso ou convênio e dá os dados do hotel.
//   • ANDAMENTO: a equipe saiu. FINALIZADA: a equipe voltou (o fechamento do custo real vem numa fatia seguinte).
//   • Voltar uma etapa pede motivo; só a direção volta uma viagem que já foi aprovada. NÃO APROVADA só reabre (para ABERTA), com motivo.
// ─────────────────────────────────────────────────────────────────────────────

import { temPoderDeGerente } from './utils/permissoes';
import { assinaturaDoRoteiro } from './ViagemRota';
import { faltaDaVerba } from './ViagemVerba';

export type StatusViagem = 'aberta' | 'em_aprovacao' | 'provisionamento' | 'andamento' | 'finalizada' | 'nao_aprovada';
export type FamiliaSelo = 'ok' | 'atencao' | 'erro' | 'info' | 'neutro' | 'marca';

export const COLUNAS_VIAGEM: { id: StatusViagem; rotulo: string; ajuda: string; familia: FamiliaSelo }[] = [
  { id: 'aberta',          rotulo: 'Aberta',          familia: 'neutro',  ajuda: 'Roteiro e orçamento em montagem.' },
  { id: 'em_aprovacao',    rotulo: 'Em aprovação',    familia: 'atencao', ajuda: 'Esperando a direção aprovar ou recusar.' },
  { id: 'provisionamento', rotulo: 'Provisionamento', familia: 'info',    ajuda: 'Aprovada: o Financeiro separa o dinheiro da viagem.' },
  { id: 'andamento',       rotulo: 'Andamento',       familia: 'marca',   ajuda: 'A equipe saiu e está em viagem.' },
  { id: 'finalizada',      rotulo: 'Finalizada',      familia: 'ok',      ajuda: 'A equipe voltou e a viagem foi encerrada.' },
  { id: 'nao_aprovada',    rotulo: 'Não aprovada',    familia: 'erro',    ajuda: 'A direção recusou a viagem.' },
];

const POR_ID: Record<string, typeof COLUNAS_VIAGEM[number]> = Object.fromEntries(COLUNAS_VIAGEM.map(c => [c.id, c]));

/** Os cinco valores de antes do quadro (22/10/2026) continuam entendidos, caso algum registro antigo apareça. */
/** "aprovada" (a coluna que saiu em 04/11/2026) vale como Provisionamento: a viagem que já estava aprovada não foi regravada, só aparece na coluna certa. */
const ANTIGOS: Record<string, StatusViagem> = { rascunho: 'aberta', orcada: 'em_aprovacao', aprovada: 'provisionamento', realizada: 'finalizada', cancelada: 'nao_aprovada' };

export function statusDaViagem(v: any): StatusViagem {
  const s = String(v?.status || '');
  if (POR_ID[s]) return s as StatusViagem;
  return ANTIGOS[s] || 'aberta';
}
export const colunaDaViagem = (v: any) => POR_ID[statusDaViagem(v)];
export const rotuloDoStatus = (s: string) => POR_ID[s]?.rotulo || ANTIGOS[s] && POR_ID[ANTIGOS[s]].rotulo || s;

export type Movimento = {
  para: StatusViagem;
  rotulo: string;            // o texto do botão ou do item de menu
  sentido: 'avanca' | 'volta' | 'recusa' | 'reabre';
  pedeMotivo: boolean;       // voltar, recusar e reabrir pedem motivo
  perigo?: boolean;
};

/** Quem manda a viagem para a frente a partir de cada coluna (voltar e recusar têm a conta própria, abaixo). */
function podeAvancar(de: StatusViagem, usuario: any): boolean {
  if (de === 'em_aprovacao') return temPoderDeGerente(usuario);
  return true;   // aberta, provisionamento e andamento: quem tem a aba de Viagens
}

/** Os passos que ESTA pessoa pode dar a partir da coluna em que a viagem está. */
export function movimentosDaViagem(v: any, usuario: any): Movimento[] {
  const de = statusDaViagem(v);
  const direcao = temPoderDeGerente(usuario);
  const l: Movimento[] = [];
  if (de === 'aberta' && podeAvancar(de, usuario)) l.push({ para: 'em_aprovacao', rotulo: 'Enviar para aprovação', sentido: 'avanca', pedeMotivo: false });
  if (de === 'em_aprovacao') {
    if (podeAvancar(de, usuario)) l.push({ para: 'provisionamento', rotulo: 'Aprovar (vai para Provisionamento)', sentido: 'avanca', pedeMotivo: false });
    if (direcao) l.push({ para: 'nao_aprovada', rotulo: 'Não aprovar', sentido: 'recusa', pedeMotivo: true, perigo: true });
    l.push({ para: 'aberta', rotulo: 'Devolver para Aberta', sentido: 'volta', pedeMotivo: true });
  }
  if (de === 'provisionamento') {
    l.push({ para: 'andamento', rotulo: 'A equipe saiu (iniciar a viagem)', sentido: 'avanca', pedeMotivo: false });
    if (direcao) l.push({ para: 'em_aprovacao', rotulo: 'Voltar para Em aprovação', sentido: 'volta', pedeMotivo: true });
  }
  if (de === 'andamento') {
    l.push({ para: 'finalizada', rotulo: 'A equipe voltou (finalizar)', sentido: 'avanca', pedeMotivo: false });
    if (direcao) l.push({ para: 'provisionamento', rotulo: 'Voltar para Provisionamento', sentido: 'volta', pedeMotivo: true });
  }
  if (de === 'finalizada' && direcao) l.push({ para: 'andamento', rotulo: 'Reabrir a viagem (volta para Andamento)', sentido: 'volta', pedeMotivo: true });
  if (de === 'nao_aprovada') l.push({ para: 'aberta', rotulo: 'Reabrir (volta para Aberta)', sentido: 'reabre', pedeMotivo: true });
  return l;
}

/** Soltar o cartão numa coluna (arrastar): o passo que leva até ela, ou o porquê de não poder. */
export function movimentoParaAColuna(v: any, destino: string, usuario: any): { movimento?: Movimento; porque?: string } {
  const de = statusDaViagem(v);
  if (de === destino) return {};
  const m = movimentosDaViagem(v, usuario).find(x => x.para === destino);
  if (m) return { movimento: m };
  const nome = POR_ID[destino]?.rotulo || destino;
  const aqui = POR_ID[de]?.rotulo || de;
  const todos = movimentosDaViagem(v, usuario);
  if (!todos.length) return { porque: `Você não pode mexer numa viagem em "${aqui}".` };
  return { porque: `Daqui ("${aqui}") a viagem não vai direto para "${nome}". Use: ${todos.map(x => x.rotulo).join('; ')}.` };
}

/** O roteiro completo e calculado: o que a viagem precisa para ir à aprovação e para ser aprovada (a viagem que a OP gera nasce sem rota, e quem aprova precisa ver o orçamento). */
function faltaDoRoteiro(v: any): string[] {
  const falta: string[] = [];
  if (!String(v?.titulo || '').trim()) falta.push('o título');
  if (!v?.data_saida) falta.push('a data de saída');
  if (!v?.origem) falta.push('o ponto de saída');
  if (!(v?.paradas || []).length) falta.push('ao menos uma parada');
  if ((v?.origem && (v?.paradas || []).length) && !v?.rota) falta.push('calcular a rota');
  else if (v?.rota && v.rota.assinatura !== assinaturaDoRoteiro(v.origem, v.paradas, v.ida_e_volta, v.otimizar_ordem)) falta.push('recalcular a rota (o roteiro mudou depois do último cálculo)');
  return falta;
}

/**
 * O que falta para a viagem poder seguir. Vazio = pode.
 *  • Em aprovação e Provisionamento: roteiro completo com a rota calculada e atualizada (quem aprova precisa ver o orçamento).
 *  • Andamento ("a equipe saiu"): a Adaptação definiu a equipe, o veículo da frota e o km de saída, e o Financeiro lançou E LIBEROU a verba total (decidido com o usuário em 04/11/2026; a liberação em si, também de 04/11, está em ViagemVerba.ts;
 *    hotel, pedágio, descrição do serviço e contrato NÃO travam a saída).
 */
// `travasExtras` (04/11/2026): o que mais impede a saída e que a regra pura não enxerga sozinha, hoje a reserva do veículo para uso interno (travaPorReserva, ViagemReservas.ts, que NÃO é importada aqui para não haver volta de importação).
export function faltaParaMover(v: any, para: StatusViagem, travasExtras: string[] = []): string[] {
  if (para === 'em_aprovacao' || para === 'provisionamento') return faltaDoRoteiro(v);
  if (para === 'andamento') {
    const falta: string[] = [];
    if (!(Array.isArray(v?.equipe) && v.equipe.length)) falta.push('a equipe (Adaptação)');
    if (!v?.frota_id) falta.push('o veículo da frota (Adaptação)');
    if (v?.km_saida === null || v?.km_saida === undefined || v?.km_saida === '' || !(Number(v.km_saida) >= 0)) falta.push('o km de saída (Adaptação)');
    const faltaVerba = faltaDaVerba(v);   // 04/11/2026: a verba precisa estar LIBERADA pelo Financeiro (ViagemVerba.ts), não só preenchida
    if (faltaVerba) falta.push(faltaVerba);
    falta.push(...travasExtras);
    return falta;
  }
  // a volta (04/11/2026, fatia 3): a Adaptação informa o km de volta, que é o que atualiza o km do veículo da frota; o custo real (Financeiro) NÃO trava, porque a prestação de contas costuma chegar depois
  if (para === 'finalizada') {
    const falta: string[] = [];
    const volta = v?.km_volta, saida = v?.km_saida;
    if (volta === null || volta === undefined || volta === '' || !(Number(volta) >= 0)) falta.push('o km de volta (Adaptação)');
    else if (saida !== null && saida !== undefined && saida !== '' && Number(volta) < Number(saida)) falta.push('um km de volta maior que o de saída (' + Number(saida).toLocaleString('pt-BR') + ' km)');
    return falta;
  }
  return [];
}

// ── quem preenche o quê (decidido com o usuário em 04/11/2026: cada setor "nutre" a sua parte em Provisionamento) ──
export type PermissoesDaViagem = { base: boolean; adaptacao: boolean; comercial: boolean; financeiro: boolean };

/** Admin ou lista de abas vazia = todas as abas (a mesma regra do menu). */
export function temAbaDe(usuario: any, ...ids: string[]): boolean {
  if (usuario?.perfil === 'Admin') return true;
  const abas = usuario?.abas_permitidas;
  if (!Array.isArray(abas) || abas.length === 0) return true;
  return ids.some(i => abas.includes(i));
}

/**
 * base = roteiro, custos e dados da viagem (a aba Viagens); adaptacao = equipe, veículo e km (a aba Adaptação); comercial = serviço e contrato (CRM, Licitações ou Comercial);
 * financeiro = verba, pedágio e hotel (a aba Financeiro). A direção (Admin, gerentes e a equipe do Comercial/CRM e Licitações como gerente do setor) preenche tudo.
 */
export function permissoesDaViagem(usuario: any): PermissoesDaViagem {
  const direcao = temPoderDeGerente(usuario);
  return {
    base: direcao || temAbaDe(usuario, 'viagens'),
    adaptacao: direcao || temAbaDe(usuario, 'producao'),
    comercial: direcao || temAbaDe(usuario, 'crm', 'licitacoes', 'comercial'),
    financeiro: direcao || temAbaDe(usuario, 'financeiro'),
  };
}

/** A parte "Provisionamento" da viagem (equipe, veículo, serviço, contrato, verba, pedágio e hotel) aparece quando a viagem já foi aprovada. */
export const temProvisionamento = (v: any) => ['provisionamento', 'andamento', 'finalizada'].includes(statusDaViagem(v));

/** A viagem que a OP gerou ainda não foi aprovada: a OP não aparece na fila da Adaptação até a viagem chegar a Provisionamento. */
export const viagemSeguraAOp = (v: any) => ['aberta', 'em_aprovacao', 'nao_aprovada'].includes(statusDaViagem(v));


export type EntradaDoHistorico = { em: string; por: string | null; de: string; para: string; motivo?: string | null; nota?: string | null };

/** A linha que fica no histórico da viagem a cada passagem de coluna. */
export function entradaDoMovimento(de: string, para: string, por: string | null, motivo?: string | null, agora = new Date().toISOString()): EntradaDoHistorico {
  return { em: agora, por, de, para, motivo: String(motivo || '').trim() || null };
}

/** O que muda na linha da viagem ao passar de coluna: a coluna, o instante e o histórico acrescido. Nada além disso. */
export function patchDoMovimento(v: any, m: Movimento, por: string | null, motivo?: string | null, agora = new Date().toISOString()) {
  const de = statusDaViagem(v);
  const historico = [...(Array.isArray(v?.historico) ? v.historico : []), entradaDoMovimento(de, m.para, por, motivo, agora)];
  return { status: m.para, status_desde: agora, historico };
}

/** Acrescenta no histórico que o roteiro ou o orçamento foram alterados DEPOIS de a viagem sair de Aberta (o valor aprovado não muda sem deixar rastro). */
export function entradaDeAlteracao(v: any, orcamentoAntes: number | null, orcamentoDepois: number | null, por: string | null, agora = new Date().toISOString()): EntradaDoHistorico {
  const st = statusDaViagem(v);
  const mudouValor = Math.round(Number(orcamentoAntes || 0) * 100) !== Math.round(Number(orcamentoDepois || 0) * 100);
  const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return { em: agora, por, de: st, para: st, nota: `Viagem alterada em "${rotuloDoStatus(st)}"${mudouValor ? `: orçamento de ${fmt(orcamentoAntes)} para ${fmt(orcamentoDepois)}` : ''}.` };
}

/** Dias que a viagem está na coluna atual (o dia de hoje não conta como parado). */
export function diasNaColuna(v: any, agora = new Date()): number {
  const t = new Date(v?.status_desde || v?.atualizado_em || v?.criado_em || '').getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86400000));
}

/** Dias até a saída: negativo = a data já passou. Nulo = sem data. */
export function diasParaSair(v: any, hoje: string): number | null {
  if (!v?.data_saida) return null;
  const a = new Date(String(v.data_saida) + 'T12:00:00').getTime();
  const b = new Date(hoje + 'T12:00:00').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** A viagem que ainda não saiu (até Provisionamento) e já passou da data de saída: alerta vermelho. */
export function saidaAtrasada(v: any, hoje: string): boolean {
  const st = statusDaViagem(v);
  if (!['aberta', 'em_aprovacao', 'provisionamento'].includes(st)) return false;
  const d = diasParaSair(v, hoje);
  return d !== null && d < 0;
}

/** O que a busca enxerga numa viagem: título, vínculo, quem criou e todas as cidades do roteiro. */
export function textoParaBusca(v: any): string {
  return [v?.titulo, v?.vinculo, v?.criado_por_nome, v?.origem?.texto, ...(v?.paradas || []).map((p: any) => p?.texto)].filter(Boolean).join(' ');
}

/**
 * A viagem em Provisionamento que sai em até 2 dias (ou que já passou da data) e ainda não tem tudo para a equipe sair (04/11/2026, pedido do usuário). O cartão mostra o selo
 * vermelho e o banco avisa, de segunda a sexta às 8h, o setor que falta (Adaptação e Financeiro). Devolve nulo quando não há o que alertar.
 */
export const DIAS_DO_ALERTA_DE_SAIDA = 2;
export function saidaPertoComFalta(v: any, hoje: string, travasExtras: string[] = []): { dias: number; falta: string[] } | null {
  if (statusDaViagem(v) !== 'provisionamento') return null;
  const dias = diasParaSair(v, hoje);
  if (dias === null || dias > DIAS_DO_ALERTA_DE_SAIDA) return null;
  const falta = faltaParaMover(v, 'andamento', travasExtras);
  return falta.length ? { dias, falta } : null;
}
