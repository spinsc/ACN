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
import { TIPO_RADIO } from './SeparacaoEnvio';
import { diaISO } from './Interface';

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

/** O que o operador pode fazer com um card, pela etapa dele. Pedido fechado (Fatia 2, 03/11/2026): o operador fecha e lança a OP; o faturamento segue no CRM e no Fiscal. */
export type Movimento = 'cotar' | 'enviar_proposta' | 'pedido_fechado' | 'lancar_op' | 'perda' | 'desistencia' | 'reativar';
export function movimentosDoTipo(tipo: any): Movimento[] {
  const t = String(tipo || '');
  if (t === 'estimativa' || t === 'lead') return ['cotar', 'enviar_proposta', 'perda', 'desistencia'];
  if (t === 'enviado' || t === 'aguardando_empenho') return ['cotar', 'pedido_fechado', 'perda', 'desistencia'];
  if (t === 'ganho') return ['cotar', 'lancar_op'];
  if (t === 'desistencia') return ['reativar'];
  return [];
}

export const TEMPERATURAS = [
  { id: 'frio', rotulo: 'Frio' },
  { id: 'morno', rotulo: 'Morno' },
  { id: 'quente', rotulo: 'Quente' },
];

// 04/11/2026 (pedido do usuário): "O que o cliente precisa" deixou de ser uma caixa de texto e virou uma lista de itens (quantidade + descrição). A coluna do card
// continua sendo o mesmo texto (`objeto_principal`, um item por linha, "10x rádio portátil"): a busca, o CRM e o que já foi gravado seguem lendo igual,
// e o texto antigo, escrito à mão, abre na lista com uma linha por item.
export type ItemDoCliente = { qtd: string; descricao: string };

/** Do texto gravado para a lista: uma linha vira um item; "10x rádio" separa a quantidade (a linha sem quantidade fica só com a descrição). */
export function itensDoTexto(texto: any): ItemDoCliente[] {
  return String(texto ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d+)\s*[xX×]\s*(.+)$/);
    return m ? { qtd: m[1], descricao: m[2].trim() } : { qtd: '', descricao: l };
  });
}

/** Da lista para o texto do card: linha sem descrição some; a quantidade só entra se for um número inteiro maior que zero. */
export function textoDosItens(itens: ItemDoCliente[]): string {
  return (itens || []).map(i => {
    const d = String(i?.descricao ?? '').replace(/\s+/g, ' ').trim();
    if (!d) return '';
    const q = parseInt(String(i?.qtd ?? '').replace(/\D/g, ''), 10);
    return q > 0 ? `${q}x ${d}` : d;
  }).filter(Boolean).join('\n');
}

export const FORM_VAZIO = { orgao: '', titulo: '', objeto_principal: '', nome_contato: '', contato: '', contato_email: '', valor: '', temperatura: '', prox_contato: '', hora_prox_contato: '' };

export const formDoCard = (c: any) => ({
  orgao: c?.orgao || '', titulo: c?.titulo || '', objeto_principal: c?.objeto_principal || '',
  nome_contato: c?.nome_contato || '', contato: c?.contato || '', contato_email: c?.contato_email || '',
  valor: c?.valor_registrado != null ? String(c.valor_registrado).replace('.', ',') : '', temperatura: c?.temperatura || '',
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

// 03/11/2026: o valor estimado vai em `valor_registrado` (a coluna que o CRM mostra, soma no funil e leva para a OP); `valor_acn` é só a parte da ACN em venda com parceiro ou Detech. A primeira versão da aba gravava em `valor_acn` (corrigido antes de existir qualquer card).
/** As colunas do card que a tela edita (a etapa e a marca ficam de fora: mudam só pelas ações próprias). */
export function camposDoCard(f: any) {
  const v = lerValorDigitado(f?.valor);
  return {
    orgao: limpo(f.orgao), titulo: limpo(f.titulo), objeto_principal: limpo(f.objeto_principal),
    nome_contato: limpo(f.nome_contato), contato: limpo(f.contato), contato_email: limpo(f.contato_email),
    valor_registrado: v.valor != null ? v.valor : null, temperatura: limpo(f.temperatura),
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

/** O que a OP do Telecom já vem com: rádio em envio de material, que é o que o Telecom separa, serializa e embala (SeparacaoEnvio.ts). Decidido com o usuário em 03/11/2026. */
export const PADROES_DA_OP_TELECOM = { tipo: 'OP', tipo_projeto: TIPO_RADIO, fluxo_entrega: 'envio_material' };

export const EMPRESAS_DA_VENDA = [{ id: 'ACN', rotulo: 'ACN' }, { id: 'DETECH', rotulo: 'Detech' }];

/** Fechar o pedido exige o PV (a OP é numerada por ele) e a empresa que fatura; devolve o que falta, em português ("" = pode fechar). */
export function erroDoPedidoFechado({ numero_pv, empresa }: any): string {
  if (!/^[0-9]{4}$/.test(String(numero_pv || '').trim())) return 'Este contato ainda não tem o PV. Envie a proposta primeiro: é nela que o PV é atribuído.';
  if (!EMPRESAS_DA_VENDA.some(e => e.id === empresa)) return 'Escolha a empresa que vai faturar: ACN ou Detech.';
  return '';
}

// ── Acompanhamento do operador (Fatia 3, 04/11/2026) ──
// O CRM não tem um prazo de "lead esquecido"; o de 7 dias é o mesmo que o sistema já usa para a OS parada do SAC. Confirmado pelo usuário em 04/11/2026.
export const PRAZO_CARD_PARADO_DIAS = 7;
const TIPOS_EM_ABERTO = ['estimativa', 'lead', 'enviado', 'aguardando_empenho'];
export const estaEmAberto = (tipo: any) => TIPOS_EM_ABERTO.includes(String(tipo || ''));

const emDias = (dia: string) => { const [a, m, d] = dia.split('-').map(Number); return Math.round(Date.UTC(a, m - 1, d) / 86400000); };
const diaDaData = (v: any): string => { const d = new Date(v); return isNaN(d.getTime()) ? '' : diaISO(d); };

/** Há quantos dias o card não é mexido (última gravação do card; a anotação do andamento também a renova). null = sem data para contar. */
export function diasSemMovimento(card: any, hoje: string): number | null {
  const dia = diaDaData(card?.atualizado_em || card?.criado_em); if (!dia) return null;
  return Math.max(0, emDias(hoje) - emDias(dia));
}

/** Card parado: em aberto, sem movimento há 7 dias ou mais e SEM retorno combinado daqui para a frente (quem marcou o próximo contato não esqueceu o cliente). */
export function cardParado(card: any, hoje: string, tipo: any): boolean {
  if (!estaEmAberto(tipo)) return false;
  const d = String(card?.prox_contato || '').slice(0, 10);
  if (d && d >= hoje) return false;
  const dias = diasSemMovimento(card, hoje);
  return dias != null && dias >= PRAZO_CARD_PARADO_DIAS;
}

/** Retorno de hoje: card em aberto com o próximo contato marcado para o dia de hoje. */
export const retornoDeHoje = (card: any, hoje: string, tipo: any) => estaEmAberto(tipo) && String(card?.prox_contato || '').slice(0, 10) === hoje;

export const FOCOS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'hoje', rotulo: 'Retornos de hoje' },
  { id: 'atrasados', rotulo: 'Contato atrasado' },
  { id: 'parados', rotulo: `Parados há ${PRAZO_CARD_PARADO_DIAS}+ dias` },
];

export function passaNoFoco(foco: string, card: any, hoje: string, tipo: any): boolean {
  if (foco === 'hoje') return retornoDeHoje(card, hoje, tipo);
  if (foco === 'atrasados') return contatoAtrasado(card, hoje, tipo);
  if (foco === 'parados') return cardParado(card, hoje, tipo);
  return true;
}

/** O motivo que o operador escreveu ao perder ou ao o cliente desistir (o card guarda em colunas diferentes). */
export const motivoDoEncerramento = (card: any, tipo: any) => String((String(tipo) === 'desistencia' ? card?.motivo_desistencia : card?.motivo_perda) ?? '').trim();

/** Relatório de perdas: as linhas do período (pelo dia em que o card foi encerrado), o valor que se deixou de vender e o total por motivo (mesmo texto, sem diferença de caixa). `dias` 0 = sem limite. */
export function resumoDasPerdas(cards: any[], tipoDe: (c: any) => any, hoje: string, dias: number) {
  const corte = dias > 0 ? emDias(hoje) - dias : null;
  const linhas = cards.filter(c => ehEncerrado(tipoDe(c))).filter(c => {
    if (corte == null) return true;
    const d = diaDaData(c.atualizado_em || c.criado_em); return !!d && emDias(d) >= corte;
  }).map(c => ({ card: c, tipo: tipoDe(c), motivo: motivoDoEncerramento(c, tipoDe(c)) || 'Sem motivo informado', quando: diaDaData(c.atualizado_em || c.criado_em), valor: Number(c.valor_registrado) || 0 }))
    .sort((a, b) => b.quando.localeCompare(a.quando));
  const grupos = new Map<string, { motivo: string; qtd: number; valor: number }>();
  linhas.forEach(l => { const k = l.motivo.toLowerCase(); const g = grupos.get(k) || { motivo: l.motivo, qtd: 0, valor: 0 }; g.qtd++; g.valor += l.valor; grupos.set(k, g); });
  return { linhas, total: linhas.length, valor: linhas.reduce((s, l) => s + l.valor, 0), porMotivo: [...grupos.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor) };
}
