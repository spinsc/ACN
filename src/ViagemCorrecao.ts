// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o Financeiro altera livremente o que é DELE, mas corrigir um campo já preenchido exige o motivo (regra definida com o usuário em 05/11/2026)
//
// Primeira versão (05/11/2026, errada): eu tinha travado o que o Financeiro JÁ preencheu (verba, pedágio, hotel e custo real), com um botão "Editar". O usuário corrigiu no mesmo dia:
// travado fica o que NÃO compete ao setor (a parte da Adaptação, do Comercial e a rota, só para leitura quando a viagem abre pelo Financeiro); o que compete ao Financeiro ele altera
// com liberdade, "desde que informe o motivo". Decidido com ele: os campos ficam sempre liberados, sem botão Editar, e o motivo é pedido AO SALVAR, quando algum campo que já estava
// preenchido mudou. Campo ainda vazio não pede motivo. O histórico da viagem guarda quem, o valor de antes, o de agora e o motivo.
// A regra olha o que está GRAVADO (`salvo`), nunca o que está na tela: digitar o primeiro valor não conta como correção.
// ─────────────────────────────────────────────────────────────────────────────
import { fmtReais } from './ViagemCalculo';

const ITENS_DO_CUSTO = ['combustivel', 'pedagios', 'hospedagem', 'alimentacao', 'outros'];
const NOME_DO_ITEM: Record<string, string> = { combustivel: 'combustível', pedagios: 'pedágios', hospedagem: 'hospedagem', alimentacao: 'alimentação', outros: 'outros' };
const lancado = (x: any) => x !== null && x !== undefined && x !== '';

export type GrupoDoFinanceiro = 'verba' | 'pedagio' | 'hotel' | 'custo_real';
/** Os grupos de campos do Financeiro, com o texto que o pedido de motivo e o histórico usam e as colunas de cada um. */
export const GRUPOS_DO_FINANCEIRO: Record<GrupoDoFinanceiro, { rotulo: string; colunas: string[] }> = {
  verba: { rotulo: 'a verba total', colunas: ['verba_total'] },
  pedagio: { rotulo: 'o pedágio', colunas: ['pedagio_modo'] },
  hotel: { rotulo: 'os dados do hotel', colunas: ['hotel'] },
  custo_real: { rotulo: 'o custo real', colunas: ['custo_real'] },
};

/** O grupo já tem valor GRAVADO? Viagem sem id (ainda não salva) nunca tem. */
export function grupoPreenchido(grupo: GrupoDoFinanceiro, salvo: any): boolean {
  if (!salvo?.id) return false;
  if (grupo === 'verba') return lancado(salvo.verba_total);
  if (grupo === 'pedagio') return !!salvo.pedagio_modo;
  if (grupo === 'hotel') return ['nome', 'endereco', 'telefone', 'observacao'].some(k => String(salvo.hotel?.[k] || '').trim());
  return ITENS_DO_CUSTO.some(k => lancado(salvo.custo_real?.[k])) || !!String(salvo.custo_real?.observacao || '').trim();
}

/** O valor do grupo em uma frase curta, para o histórico ("R$ 1.000,00", "reembolso", "Hotel X"). */
export function textoDoGrupo(grupo: GrupoDoFinanceiro, v: any): string {
  if (grupo === 'verba') return lancado(v?.verba_total) ? fmtReais(Number(v.verba_total)) : 'vazia';
  if (grupo === 'pedagio') return v?.pedagio_modo === 'reembolso' ? 'reembolso' : v?.pedagio_modo === 'convenio' ? 'convênio' : 'não definido';
  if (grupo === 'hotel') {
    const h = v?.hotel || {};
    const p = [h.nome, h.telefone, h.endereco, h.observacao].map(x => String(x || '').trim()).filter(Boolean);
    return p.length ? p.join(' · ') : 'vazio';
  }
  const c = v?.custo_real || {};
  const itens = ITENS_DO_CUSTO.filter(k => lancado(c[k])).map(k => `${NOME_DO_ITEM[k]} ${fmtReais(Number(c[k]) || 0)}`);
  const obs = String(c.observacao || '').trim();
  return [...itens, obs ? `obs.: ${obs}` : ''].filter(Boolean).join(', ') || 'vazio';
}

const aparado = (x: any) => String(x ?? '').trim();
/** O valor numérico de um item do custo real; vazio é `null` (apagar o valor também é mudar). */
const numeroDoItem = (x: any) => (lancado(x) ? Number(x) : null);

/**
 * Houve CORREÇÃO neste grupo? Só conta mexer num valor que JÁ estava gravado (mudar ou apagar). Acrescentar o que ainda estava vazio não é correção:
 * o hotel e o custo real são preenchidos em partes (o telefone do hotel depois do nome, a alimentação depois do combustível), e pedir motivo
 * a cada acréscimo atrapalharia o Financeiro sem proteger nada (ajuste feito no mesmo dia, 05/11/2026, ao testar o custo real).
 */
function houveCorrecao(grupo: GrupoDoFinanceiro, salvo: any, atual: any): boolean {
  if (!grupoPreenchido(grupo, salvo)) return false;
  if (grupo === 'verba' || grupo === 'pedagio') return textoDoGrupo(grupo, salvo) !== textoDoGrupo(grupo, atual);
  if (grupo === 'hotel') return ['nome', 'endereco', 'telefone', 'observacao'].some(k => aparado(salvo.hotel?.[k]) && aparado(salvo.hotel?.[k]) !== aparado(atual?.hotel?.[k]));
  const s = salvo.custo_real || {}, a = atual?.custo_real || {};
  return ITENS_DO_CUSTO.some(k => lancado(s[k]) && numeroDoItem(s[k]) !== numeroDoItem(a[k])) || (!!aparado(s.observacao) && aparado(s.observacao) !== aparado(a.observacao));
}

/** Os grupos que já estavam preenchidos no que está GRAVADO e em que algum valor já gravado mudou ou foi apagado: são as correções que pedem motivo. */
export function gruposAlterados(salvo: any, atual: any): GrupoDoFinanceiro[] {
  return (Object.keys(GRUPOS_DO_FINANCEIRO) as GrupoDoFinanceiro[]).filter(g => houveCorrecao(g, salvo, atual));
}

const juntar = (l: string[]) => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1]);

/** A pergunta da janela do motivo: diz o que está sendo corrigido. */
export const pedidoDeMotivo = (grupos: GrupoDoFinanceiro[]) =>
  `Por que corrigir ${juntar(grupos.map(g => GRUPOS_DO_FINANCEIRO[g].rotulo))}? O motivo é obrigatório e fica no histórico da viagem, junto do valor de antes.`;

/** Uma nota no histórico por grupo corrigido: quem, o quê, de quanto para quanto e por quê. */
export function notasDasCorrecoes(grupos: GrupoDoFinanceiro[], motivo: string, salvo: any, atual: any, por: string): string[] {
  return grupos.map(g => `${por || 'Alguém'} corrigiu ${GRUPOS_DO_FINANCEIRO[g].rotulo} (já estava preenchido). Antes: ${textoDoGrupo(g, salvo)}. Agora: ${textoDoGrupo(g, atual)}. Motivo: ${motivo || 'não informado'}.`);
}

/** As colunas dos grupos corrigidos: a nota genérica "Financeiro atualizou…" não repete o que já tem nota própria. */
export const colunasDosGrupos = (grupos: GrupoDoFinanceiro[]) => grupos.flatMap(g => GRUPOS_DO_FINANCEIRO[g].colunas);
