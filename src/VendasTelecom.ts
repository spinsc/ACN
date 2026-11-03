// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VENDAS DO TELECOM — as regras da aba "Vendas" (pedido do usuário em 03/11/2026)
//
// Um operador de vendas do Telecom abre vendas para o SETOR PRIVADO (shoppings, condomínios, empresas; cliente final por enquanto), só com itens de telecom.
// Decidido com o usuário: a aba trabalha nos MESMOS cards do CRM (`crm_oportunidades`, funil 'venda_direta'), marcados com `setor_venda = 'telecom'`, e não tem funil nem
// tabela própria — assim o Comercial vê tudo no CRM, a Formação de Preços e a Nova OP continuam ligadas ao card, e cliente e histórico não se duplicam.
// As ETAPAS são as do CRM com nome de venda privada (o funil de hoje tem "Aguardando empenho" e "Empenhado", que são de governo); o banco não muda:
//   Lead (Estimativa, Lead) → Proposta enviada (Enviado, Aguardando empenho) → Pedido fechado (Empenhado) → Faturado; Perdido (Perdido, Desistência).
// Módulo sem tela, para testar a regra sem navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { conferirContatoDoCard } from './ContatoObrigatorio';
import { lerValorDigitado } from './LerValor';

export const SETOR_VENDA_TELECOM = 'telecom';

export type ColunaVendas = { id: string; rotulo: string; tipos: string[]; familia: 'info' | 'atencao' | 'ok' | 'erro' | 'neutro'; ajuda: string };

export const COLUNAS_VENDAS: ColunaVendas[] = [
  { id: 'lead',      rotulo: 'Lead',             tipos: ['estimativa', 'lead'],              familia: 'info',    ajuda: 'Contato aberto, ainda sem proposta enviada' },
  { id: 'proposta',  rotulo: 'Proposta enviada', tipos: ['enviado', 'aguardando_empenho'],   familia: 'atencao', ajuda: 'Proposta com o cliente, esperando resposta ou pedido' },
  { id: 'pedido',    rotulo: 'Pedido fechado',   tipos: ['ganho'],                           familia: 'ok',      ajuda: 'O cliente fechou: a OP é aberta pelo Comercial no CRM' },
  { id: 'faturado',  rotulo: 'Faturado',         tipos: ['faturado'],                        familia: 'ok',      ajuda: 'Venda faturada' },
  { id: 'perdido',   rotulo: 'Perdido',          tipos: ['perdido', 'desistencia'],          familia: 'erro',    ajuda: 'Perdida ou desistida' },
];

/** A coluna da aba que mostra um card, pelo tipo da etapa dele no CRM (`crm_estagios_funil.tipo`). Etapa que a aba não conhece cai em "Lead" para o card nunca sumir da tela. */
export const colunaDoTipo = (tipo: any): ColunaVendas =>
  COLUNAS_VENDAS.find(c => c.tipos.includes(String(tipo || ''))) || COLUNAS_VENDAS[0];

export const ehEncerrado = (tipo: any) => ['perdido', 'desistencia'].includes(String(tipo || ''));

/** O que o operador pode fazer com um card, pela etapa dele. Pedido fechado e faturado são do Comercial (a OP nasce do card no CRM). */
export type Movimento = 'enviar_proposta' | 'perda' | 'desistencia' | 'reativar';
export function movimentosDoTipo(tipo: any): Movimento[] {
  const t = String(tipo || '');
  if (t === 'estimativa' || t === 'lead') return ['enviar_proposta', 'perda', 'desistencia'];
  if (t === 'enviado' || t === 'aguardando_empenho') return ['perda', 'desistencia'];
  if (t === 'desistencia') return ['reativar'];
  return [];
}

export const TEMPERATURAS = [
  { id: 'frio', rotulo: 'Frio' },
  { id: 'morno', rotulo: 'Morno' },
  { id: 'quente', rotulo: 'Quente' },
];

export const FORM_VAZIO = { orgao: '', titulo: '', objeto_principal: '', nome_contato: '', contato: '', contato_email: '', valor: '', temperatura: '', prox_contato: '', hora_prox_contato: '' };

export const formDoCard = (c: any) => ({
  orgao: c?.orgao || '', titulo: c?.titulo || '', objeto_principal: c?.objeto_principal || '',
  nome_contato: c?.nome_contato || '', contato: c?.contato || '', contato_email: c?.contato_email || '',
  valor: c?.valor_acn != null ? String(c.valor_acn).replace('.', ',') : '', temperatura: c?.temperatura || '',
  prox_contato: c?.prox_contato || '', hora_prox_contato: c?.hora_prox_contato ? String(c.hora_prox_contato).slice(0, 5) : '',
});

/** O que falta para gravar o card, em português ("" = pode gravar). O contato (nome e telefone ou e-mail) é a mesma regra do CRM; card perdido ou desistido não pede. */
export function erroDoCard(f: any, { encerrado = false } = {}): string {
  const falta: string[] = [];
  if (!String(f?.orgao ?? '').trim()) falta.push('o cliente (shopping, condomínio, empresa…)');
  if (!String(f?.titulo ?? '').trim()) falta.push('o assunto');
  if (!encerrado) {
    const c = conferirContatoDoCard({ nome_contato: f?.nome_contato, contato: f?.contato, contato_email: f?.contato_email });
    if (!c.ok) falta.push(...c.falta);
  }
  const v = lerValorDigitado(f?.valor);
  if (v.invalido) return 'O valor estimado não é um número válido. Use, por exemplo, 12.500,00.';
  if (String(f?.prox_contato || '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.prox_contato))) return 'O dia do próximo contato não é válido.';
  return falta.length ? `Preencha ${falta.length > 1 ? falta.slice(0, -1).join(', ') + ' e ' + falta[falta.length - 1] : falta[0]}.` : '';
}

const limpo = (v: any) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

/** As colunas do card que a tela edita (a etapa e a marca ficam de fora: mudam só pelas ações próprias). */
export function camposDoCard(f: any) {
  const v = lerValorDigitado(f?.valor);
  return {
    orgao: limpo(f.orgao), titulo: limpo(f.titulo), objeto_principal: limpo(f.objeto_principal),
    nome_contato: limpo(f.nome_contato), contato: limpo(f.contato), contato_email: limpo(f.contato_email),
    valor_acn: v.valor != null ? v.valor : null, temperatura: limpo(f.temperatura),
    prox_contato: limpo(f.prox_contato), hora_prox_contato: limpo(f.hora_prox_contato),
  };
}

/** O card novo: nasce em Lead, no funil de venda direta, marcado do Telecom, com a mesma base que o CRM grava (tipo de licitação e situação padrão, faturamento ACN). */
export function payloadDoCardNovo(f: any, estagioLeadId: string, usuario: any) {
  return {
    ...camposDoCard(f), funil: 'venda_direta', setor_venda: SETOR_VENDA_TELECOM, estagio_id: estagioLeadId,
    tipo_licitacao: 'ordinaria', sub_status: 'andamento', faturamento_empresa: 'ACN', tipo_negocio: 'Venda',
    responsavel_nome: usuario?.nome || null, participantes: [],
  };
}

/** PV de 4 dígitos (o mesmo número que o CRM pede ao enviar a proposta). */
export const pvDe = (texto: any) => String(texto ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);

export function erroDoEnvioDaProposta({ pv, temperatura, data }: any): string {
  if (!/^\d{4}$/.test(pvDe(pv)) || !String(pv ?? '').replace(/\D/g, '')) return 'Informe o número do PV, com 4 dígitos.';
  if (!temperatura) return 'Classifique a temperatura do lead (frio, morno ou quente).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return 'Informe o dia do próximo contato.';
  return '';
}

/** Contato combinado que já passou (o dia do próximo contato é anterior a hoje): alerta vermelho no card. Card encerrado não alerta. */
export function contatoAtrasado(card: any, hoje: string, tipo: any): boolean {
  if (ehEncerrado(tipo) || ['ganho', 'faturado'].includes(String(tipo || ''))) return false;
  const d = String(card?.prox_contato || '').slice(0, 10);
  return !!d && d < hoje;
}

/** A linha de uma entrada do histórico do card: o texto da anotação, ou o que mudou de etapa. */
export function textoDoHistorico(h: any): string {
  const texto = String(h?.texto || h?.conteudo || '').trim();
  if (h?.tipo === 'status_change') return `Etapa: ${h?.estagio_novo || '—'}${texto ? ' — ' + texto : ''}`;
  return texto || '—';
}
