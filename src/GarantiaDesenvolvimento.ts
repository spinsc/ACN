// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LIGAÇÃO ENTRE A GARANTIA E O DESENVOLVIMENTO DE PRODUTO — as regras (pedido do usuário em 22/10/2026)
//
// Só regra, sem tela e sem banco. Três coisas, todas pelo VEÍCULO: o projeto do Desenvolvimento diz, no entregável "Item no catálogo e estrutura de instalação", em quais veículos o item
// se aplica; a ficha de garantia diz o veículo do catálogo do cliente. Quando os dois batem:
//   1. a ficha mostra o PROJETO DE ORIGEM (o que a Engenharia deixou "Para a Garantia", a revisão do desenho vigente e as lições de "o que faria diferente");
//   2. o projeto mostra os ATENDIMENTOS DE GARANTIA daquele veículo — só os que a pessoa que olha pode ver (a regra de visibilidade da Garantia continua valendo);
//   3. o atendimento pode PEDIR UMA MUDANÇA NO PROJETO (o pedido de mudança que já existe depois da liberação), ligada ao número da garantia.
// Suposições (a confirmar com o usuário): o casamento é por veículo, não por peça (a peça da garantia é texto livre); quem pede a mudança é quem conduz o atendimento (o responsável e a
// gerência, a mesma regra de quem registra a avaliação); projeto cancelado não entra.
// ─────────────────────────────────────────────────────────────────────────────
import { modeloGuiado, liberada, dadosDoEntregavel, revisaoVigente, rotuloDoTipoDev } from './DesenvolvimentoModelo';
import { podeVerGarantia, podeConduzirGarantia, evento } from './GarantiaModelo';

const t = (v: any, max = 2000) => String(v ?? '').trim().slice(0, max);
const copiar = (x: any) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** Os ids dos veículos do projeto: o veículo para o qual o desenvolvimento foi pedido (`veiculo_id` da demanda) e os de aplicação do item (entregável "Item no catálogo e estrutura de instalação"). */
export function veiculosDoProjeto(d: any): string[] {
  const vs = dadosDoEntregavel(d, 'item_catalogo')?.veiculos;
  const ids = [d?.veiculo_id, ...(Array.isArray(vs) ? vs : []).map((v: any) => v?.id)].map((x: any) => String(x || '')).filter(Boolean);
  return [...new Set(ids)];
}

/** O projeto vale para a Garantia: tem o modelo guiado, não foi cancelado e o veículo está entre os de aplicação. */
export const projetoServeAoVeiculo = (d: any, veiculoId: any) => !!veiculoId && modeloGuiado(d) && d?.situacao !== 'cancelada' && veiculosDoProjeto(d).includes(String(veiculoId));

/** Os projetos do Desenvolvimento ligados ao veículo da ficha, já resumidos para a tela. Os liberados vêm primeiro. */
export function projetosDoVeiculo(demandas: any[], veiculoId: any) {
  return (demandas || []).filter(d => projetoServeAoVeiculo(d, veiculoId)).map(resumoDoProjeto)
    .sort((a, b) => Number(b.liberada) - Number(a.liberada) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
}

export function resumoDoProjeto(d: any) {
  const item = dadosDoEntregavel(d, 'item_catalogo') || {};
  const licoes = dadosDoEntregavel(d, 'licoes') || {};
  return {
    id: d.id, titulo: t(d.titulo, 300), tipo: rotuloDoTipoDev(d.tipo_desenvolvimento), situacao: d.situacao || 'ativa',
    item: item.item_nome ? `${item.item_nome}${item.item_codigo ? ` (${item.item_codigo})` : ''}` : '',
    rev: revisaoVigente(d)?.rev || null, liberada: liberada(d),
    paraGarantia: t(dadosDoEntregavel(d, 'pacote_tecnico')?.garantia),
    faria_diferente: (Array.isArray(licoes.diferente) ? licoes.diferente : []).map((i: any) => t(i?.texto)).filter(Boolean),
    mudancaEmAndamento: (d.mudancas || []).some((m: any) => m.status === 'pedida' || m.status === 'aprovada'),
  };
}

/** Os atendimentos de garantia do veículo do projeto que `u` pode ver (aberto ou encerrado; o cancelado não conta). Os abertos vêm primeiro, os mais recentes antes. */
export function atendimentosDoProjeto(fichas: any[], d: any, u: any) {
  const vs = new Set(veiculosDoProjeto(d));
  if (!modeloGuiado(d) || !vs.size) return [];
  return (fichas || []).filter(g => g.situacao !== 'cancelado' && vs.has(String(g.veiculo_id || '')) && podeVerGarantia(g, u))
    .sort((a, b) => Number(b.situacao === 'aberto') - Number(a.situacao === 'aberto') || String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
}

/** Pode pedir mudança no projeto a partir deste atendimento? Devolve { ok, motivo } — o motivo é a frase da tela quando não pode. */
export function podePedirMudancaDoProjeto(g: any, d: any, u: any) {
  if (g?.situacao !== 'aberto') return { ok: false, motivo: 'Só o atendimento aberto pode pedir mudança no projeto.' };
  if (!podeConduzirGarantia(g, u)) return { ok: false, motivo: 'Só o responsável pelo atendimento ou a gerência pede a mudança.' };
  if (!projetoServeAoVeiculo(d, g.veiculo_id)) return { ok: false, motivo: 'Este projeto não está ligado ao veículo do atendimento.' };
  if (d.situacao === 'pausada') return { ok: false, motivo: 'O projeto está pausado. Peça a um gerente da Engenharia para retomar.' };
  if (!liberada(d)) return { ok: false, motivo: 'O projeto ainda não foi liberado para a Produção; antes disso a mudança é feita voltando a etapa, pela Engenharia.' };
  if ((d.mudancas || []).some((m: any) => m.status === 'pedida' || m.status === 'aprovada')) return { ok: false, motivo: 'Já há uma mudança em andamento neste projeto. Ela precisa ser concluída ou cancelada antes de pedir outra.' };
  return { ok: true, motivo: '' };
}

/** O texto que já vem escrito no "motivo" do pedido: o atendimento de origem e a falha. A pessoa pode editar. */
export function motivoInicialDoPedido(g: any) {
  const quem = [t(g?.cliente_nome, 120), t(g?.veiculo_nome, 120), g?.placa ? `placa ${t(g.placa, 20)}` : ''].filter(Boolean).join(', ');
  return `Atendimento em garantia ${t(g?.numero, 30)}${quem ? ` (${quem})` : ''}. Falha relatada: ${t(g?.descricao_falha, 600)}`;
}

/** A ficha guarda no histórico que pediu a mudança (o número M1, M2… vem do projeto). A ligação em si fica no próprio pedido, no campo `garantia` do pedido de mudança: a ficha lê de lá, sem coluna nova nem dado repetido. */
export function registrarPedidoDeMudancaNaFicha(g: any, u: any, { projeto_titulo, numero }: any, agora: string) {
  if (g?.situacao !== 'aberto') return { erro: 'Só o atendimento aberto recebe registros.' };
  if (!podeConduzirGarantia(g, u)) return { erro: 'Só o responsável pelo atendimento ou a gerência faz este registro.' };
  if (!numero) return { erro: 'Faltou o número do pedido de mudança.' };
  const historico = copiar(g.historico) || [];
  historico.push(evento('mudanca_projeto', u, `${numero} no projeto "${t(projeto_titulo, 120)}"`, agora));
  return { patch: { historico } };
}

/** Os pedidos de mudança de todos os projetos que nasceram deste atendimento (para a ficha listar). */
export function mudancasDaFicha(demandas: any[], g: any) {
  const saida: any[] = [];
  for (const d of demandas || []) for (const m of d.mudancas || []) if (m?.garantia?.id && String(m.garantia.id) === String(g?.id)) saida.push({ projeto_id: d.id, projeto_titulo: t(d.titulo, 300), numero: m.numero, status: m.status, rev_gerada: m.rev_gerada || null });
  return saida;
}
