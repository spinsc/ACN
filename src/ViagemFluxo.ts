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

/** O que falta para a viagem poder seguir. Vazio = pode. Para ir à aprovação a viagem precisa estar completa, com a rota calculada e atualizada. */
export function faltaParaMover(v: any, para: StatusViagem): string[] {
  const falta: string[] = [];
  if (para === 'em_aprovacao') {
    if (!String(v?.titulo || '').trim()) falta.push('o título');
    if (!v?.data_saida) falta.push('a data de saída');
    if (!v?.origem) falta.push('o ponto de saída');
    if (!(v?.paradas || []).length) falta.push('ao menos uma parada');
    if ((v?.origem && (v?.paradas || []).length) && !v?.rota) falta.push('calcular a rota');
    else if (v?.rota && v.rota.assinatura !== assinaturaDoRoteiro(v.origem, v.paradas, v.ida_e_volta, v.otimizar_ordem)) falta.push('recalcular a rota (o roteiro mudou depois do último cálculo)');
  }
  return falta;
}

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
