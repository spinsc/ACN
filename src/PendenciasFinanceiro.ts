// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO — a fila de pendências (pedido do usuário em 04/11/2026)
//
// Uma lista só do que está esperando o Financeiro, com o prazo, para a pessoa não depender do aviso da caixa de Menções (que chega uma vez e some). A fila SÓ LISTA: cada item
// abre a janela que já existe e o trabalho continua sendo feito lá (nada é preenchido em dois lugares). Decidido com o usuário: começa só pelas Viagens; outras filas (compras,
// fretes) entram uma de cada vez, se o Financeiro de fato depender delas; hoje a aprovação do pedido de compra e a do frete moram no Compras e na Logística e NÃO foram trazidas.
//   • VERBA A LIBERAR: viagem em Provisionamento sem a verba liberada (sem verba, verba lançada e não liberada, ou verba mudada depois de liberar). Vermelho quando a saída é em
//     até 2 dias, já passou da data (a mesma regra do selo "Falta para sair") — a equipe não sai sem isso.
//   • CUSTO REAL A LANÇAR: viagem finalizada sem nenhum item do custo real. Vermelho a partir de 7 dias finalizada (prazo meu, a confirmar com o usuário: é o mesmo prazo das
//     outras filas paradas do sistema).
//   • COMPROVANTES A ANEXAR: viagem finalizada com custo lançado e algum item com valor sem nenhum comprovante. Âmbar: é lembrete, não trava nada.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { diasParaSair, diasNaColuna, statusDaViagem, DIAS_DO_ALERTA_DE_SAIDA } from './ViagemFluxo';
import { situacaoDaVerba, textoDaVerba } from './ViagemVerba';
import { itensSemComprovante } from './ViagemComprovantes';
import { dataComDiaDaSemana, fmtReais } from './ViagemCalculo';
import { nomeCurto } from './ViagemRota';

export const PRAZO_CUSTO_REAL_DIAS = 7;
export type TipoDePendencia = 'verba' | 'custo_real' | 'comprovante';
export type Pendencia = { chave: string; tipo: TipoDePendencia; viagem: any; o_que: string; prazo: string; urgente: boolean; ordem: number };

export const ROTULO_DO_TIPO: Record<TipoDePendencia, string> = { verba: 'Verba a liberar', custo_real: 'Custo real a lançar', comprovante: 'Comprovantes a anexar' };
const NOME_DO_ITEM: Record<string, string> = { combustivel: 'Combustível', pedagios: 'Pedágios', hospedagem: 'Hospedagem', alimentacao: 'Alimentação', outros: 'Outros custos' };
const lancou = (c: any) => !!c && Object.keys(NOME_DO_ITEM).some(k => c[k] !== null && c[k] !== undefined && c[k] !== '');

function prazoDaSaida(dias: number | null): string {
  if (dias === null) return 'Sem data de saída';
  if (dias < 0) return `Saída atrasada há ${-dias} dia(s)`;
  if (dias === 0) return 'Sai hoje';
  if (dias === 1) return 'Sai amanhã';
  return `Sai em ${dias} dias`;
}

/** As pendências do Financeiro nas viagens que recebem: as urgentes primeiro, depois verba, custo real e comprovantes, cada grupo pelo que aperta mais. */
export function pendenciasDasViagens(viagens: any[], hoje: string, agora = new Date()): Pendencia[] {
  const l: Pendencia[] = [];
  for (const v of viagens || []) {
    const st = statusDaViagem(v);
    if (st === 'provisionamento') {
      if (situacaoDaVerba(v) === 'liberada') continue;
      const d = diasParaSair(v, hoje);
      l.push({ chave: 'verba:' + v.id, tipo: 'verba', viagem: v, o_que: textoDaVerba(v), prazo: prazoDaSaida(d), urgente: d !== null && d <= DIAS_DO_ALERTA_DE_SAIDA, ordem: d === null ? 9999 : d });
    } else if (st === 'finalizada') {
      const parada = diasNaColuna(v, agora);
      const desde = `Finalizada há ${parada} dia(s)`;
      if (!lancou(v.custo_real)) {
        l.push({ chave: 'custo:' + v.id, tipo: 'custo_real', viagem: v, o_que: 'Lançar o custo real da viagem', prazo: desde, urgente: parada >= PRAZO_CUSTO_REAL_DIAS, ordem: -parada });
      } else {
        const faltam = itensSemComprovante(v);
        if (faltam.length) l.push({ chave: 'comp:' + v.id, tipo: 'comprovante', viagem: v, o_que: 'Anexar o comprovante de: ' + faltam.map(k => NOME_DO_ITEM[k] || k).join(', '), prazo: desde, urgente: false, ordem: -parada });
      }
    }
  }
  const peso: Record<TipoDePendencia, number> = { verba: 0, custo_real: 1, comprovante: 2 };
  return l.sort((a, b) => Number(b.urgente) - Number(a.urgente) || peso[a.tipo] - peso[b.tipo] || a.ordem - b.ordem);
}

/** Em poucas linhas, o que o Financeiro precisa ver da viagem sem abri-la (pedido do usuário em 05/11/2026): quando sai, para onde, quem vai, em que carro, quanto foi orçado e quanto de verba,
 *  e a que OP, OS ou PV a viagem está ligada. Pura: só lê a viagem. Linha sem informação não aparece. */
export function resumoDaViagem(v: any): { rotulo: string; texto: string }[] {
  const linhas: { rotulo: string; texto: string }[] = [];
  if (v?.data_saida) linhas.push({ rotulo: 'Saída', texto: dataComDiaDaSemana(v.data_saida) + (v?.custos?.hora_saida ? ` às ${v.custos.hora_saida}` : '') });
  const destinos = (Array.isArray(v?.paradas) ? v.paradas : []).map((p: any) => nomeCurto(p?.texto || '')).filter(Boolean);
  if (destinos.length) linhas.push({ rotulo: 'Destino', texto: destinos.join(' → ') });
  else if (v?.sugestao_destino) linhas.push({ rotulo: 'Destino indicado', texto: String(v.sugestao_destino) });
  const equipe = (Array.isArray(v?.equipe) ? v.equipe : []).map((m: any) => m?.nome).filter(Boolean);
  linhas.push({ rotulo: 'Equipe', texto: equipe.length ? equipe.join(', ') : 'ainda não definida' });
  if (v?.veiculo_nome) linhas.push({ rotulo: 'Veículo', texto: v.veiculo_nome + (v.veiculo_placa ? ' · ' + v.veiculo_placa : '') });
  const orc = Number(v?.total_orcamento) || 0, verba = Number(v?.verba_total);
  const dinheiro = [orc > 0 ? `orçado ${fmtReais(orc)}` : '', Number.isFinite(verba) && v?.verba_total != null && v.verba_total !== '' ? `verba ${fmtReais(verba)}` : 'verba ainda não definida'].filter(Boolean).join(' · ');
  linhas.push({ rotulo: 'Valores', texto: dinheiro });
  const ligacoes = (Array.isArray(v?.vinculos) ? v.vinculos : []).map((x: any) => String(x?.descricao || '').split(' — ')[0].trim()).filter(Boolean).join(', ') || String(v?.vinculo || '');
  if (ligacoes) linhas.push({ rotulo: 'Ligada a', texto: ligacoes });
  return linhas;
}

/** Lê as viagens que podem ter pendência do Financeiro. Leitura recusada devolve o erro (nunca "fila vazia" calada). */
export async function lerPendenciasDoFinanceiro(hoje: string): Promise<{ lista: Pendencia[]; erro: string }> {
  const { data, error } = await supabase.from('viagens').select('*').in('status', ['provisionamento', 'aprovada', 'finalizada']);
  if (error) return { lista: [], erro: error.message };
  return { lista: pendenciasDasViagens(data || [], hoje), erro: '' };
}

/** Aviso entre a fila e o selo de contagem da aba do Financeiro: depois de ler a fila, a tela manda a contagem para quem a mostra no alto. */
export const EVENTO_PENDENCIAS = 'acn:pendencias-financeiro';
export const avisarContagem = (lista: Pendencia[]) => window.dispatchEvent(new CustomEvent(EVENTO_PENDENCIAS, { detail: { total: lista.length, urgentes: lista.filter(p => p.urgente).length } }));
