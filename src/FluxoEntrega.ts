// ─────────────────────────────────────────────────────────────────────────────
// FLUXO DE ENTREGA — como a venda é entregue (rota), não o que é o produto.
//
// Existe porque a Produção/Adaptação recebia TUDO: ela monta a fila só por
// `status_geral`, sem olhar tipo nenhum, então item que era só separar, embalar
// e enviar entupia a fila de adaptação veicular. `tipo_projeto` não servia pra
// isso porque mistura os dois eixos (tem "Transformacao Veicular" junto com
// "Envio de Produto Vendido") — e uma transformação veicular pode ser na
// matriz, externa ou em terceiro.
//
// Regra de ouro: fluxo VAZIO = OP anterior a esta regra. Tem que continuar se
// comportando como antes (aparecer na Adaptação), senão as 293 OPs que já
// estavam em andamento somem da tela de quem está trabalhando nelas.
// ─────────────────────────────────────────────────────────────────────────────

export type FluxoEntrega =
  | 'adaptacao_matriz'
  | 'adaptacao_externa'
  | 'fabricacao_serralheria_envio'
  | 'envio_adaptacao_terceiro'
  | 'envio_material';

/** Onde a OP aparece depois de liberada: fila da Adaptação, de Fabricação, ou
 *  nenhuma das duas (vai direto pro Almoxarifado separar/embalar/enviar). */
export type DestinoFila = 'adaptacao' | 'fabricacao' | 'envio';

export const FLUXOS: { valor: FluxoEntrega; label: string; fila: DestinoFila; ajuda: string }[] = [
  { valor:'adaptacao_matriz',             label:'Adaptação na matriz',                  fila:'adaptacao',
    ajuda:'Veículo vem para a matriz e é adaptado aqui.' },
  { valor:'adaptacao_externa',            label:'Adaptação externa',                    fila:'adaptacao',
    ajuda:'Nossa equipe se desloca até o local e adapta lá.' },
  { valor:'fabricacao_serralheria_envio', label:'Fabricação serralheria com envio',     fila:'fabricacao',
    ajuda:'Serralheria fabrica (ex: carretinhas), depois passa pela adaptação e pelo CQ e segue para envio.' },
  { valor:'envio_adaptacao_terceiro',     label:'Envio para adaptação de terceiro',     fila:'envio',
    ajuda:'Segue para um parceiro fora da empresa, que faz a adaptação.' },
  { valor:'envio_material',               label:'Envio de material',                    fila:'envio',
    ajuda:'Só separar, embalar e enviar. Não passa por produção.' },
];

// APOSENTADO: 'fabricacao_interna_envio' saiu da lista a pedido do usuário --
// hoje a serralheria é a única fabricação que termina em envio; o resto já é
// item pronto, que cai em 'envio_material'. Nenhum registro usava o valor
// (0 em oples, licitações e CRM), mas a opção esteve no ar desde a Fase 1,
// então o valor continua sendo RECONHECIDO aqui: se alguém tiver escolhido
// nesse meio-tempo, a OP vai para a fila certa em vez de cair calada na
// adaptação. Só não aparece mais para escolher.
const APOSENTADOS: Record<string, DestinoFila> = {
  fabricacao_interna_envio: 'fabricacao',
};

const PORVALOR: Record<string, typeof FLUXOS[number]> =
  Object.fromEntries(FLUXOS.map(f => [f.valor, f]));

export function fluxoLabel(v: string | null | undefined): string {
  if (!v) return 'Não classificado';
  if (v === 'fabricacao_interna_envio') return 'Fabricação interna para envio (aposentado)';
  return PORVALOR[v]?.label || v;
}

/** Fila em que a OP deve aparecer. Vazio devolve 'adaptacao' de propósito:
 *  é o comportamento antigo, que as OPs em andamento dependem. */
export function filaDe(v: string | null | undefined): DestinoFila {
  if (!v) return 'adaptacao';
  return PORVALOR[v]?.fila || APOSENTADOS[v] || 'adaptacao';
}

export const vaiParaAdaptacao  = (v: any) => filaDe(v) === 'adaptacao';
export const vaiParaFabricacao = (v: any) => filaDe(v) === 'fabricacao';
/** Não passa por produção: do Almoxarifado direto pra embalagem e frete. */
export const soEnvio            = (v: any) => filaDe(v) === 'envio';

// ─────────────────────────────────────────────────────────────────────────────
// SAÍDA PARA O FRETE
// Fluxo que termina em envio precisa de uma parada extra DEPOIS da produção:
// alguém pesa e mede a caixa, e é isso que abre a cotação de frete. Sem essa
// parada a OP ia de produção direto pro CQ/faturamento e o pedido de frete
// nunca nascia.
//
// Por que um status próprio e não reaproveitar "Aguardando Almox": a OP passa
// pelo Almoxarifado DUAS vezes — antes da produção (kiting) e depois dela
// (embalagem). Com um status só, o Almoxarifado não teria como saber qual das
// duas coisas está sendo pedida, e mostraria "EMBALAR E ENVIAR" numa OP que
// ainda nem foi produzida.
// ─────────────────────────────────────────────────────────────────────────────

/** OP parada no Almoxarifado esperando ser pesada/medida e embalada. */
export const STATUS_EMBALAGEM = 'Aguardando Embalagem';
/** Embalagem feita, pedido de frete aberto, Logística cotando. */
export const STATUS_COTACAO_FRETE = 'Aguardando Cotacao Frete';

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA "AGUARDANDO LIBERAÇÃO COMERCIAL" — UM NOME SÓ
//
// Glossário decidido com o usuário em 29/09/2026 (Etapa 5.1 do
// PLANO_UX_FLUXO_TRABALHO.md). A mesma etapa — a OP pronta, esperando o
// Comercial liberá-la para o Fiscal — tinha DOIS nomes:
//   • 'Aprovado CQ - Aguardando Liberacao Comercial': escrito ao aprovar no CQ;
//   • 'Aguardando Liberacao Comercial': escrito nos caminhos de envio (embalagem
//     FOB e frete entregue), que NÃO passam por CQ — para eles "Aprovado CQ"
//     seria falso.
// O nome oficial é o curto. O fato de a OP ter passado pelo CQ continua
// registrado em `resultado_cq = 'Aprovado'`, que é onde deve ficar.
//
// Por que isto importa: cinco pontos do sistema reconheciam os dois nomes, mas
// os Relatórios e o Marketing só o longo — OP com o nome curto sumia de
// "Finalizadas". Por isso ninguém compara com o texto solto: use
// aguardaLiberacaoComercial() ou STATUS_AGUARDANDO_LIBERACAO_COMERCIAL.
//
// Etapa 5.1c, 05/10/2026: o código foi APERTADO. Os dois nomes só eram aceitos
// porque uma aba antiga ainda aberta no navegador podia gravar o nome longo
// depois da publicação. Medido no banco em 05/10/2026, seis dias depois: 15
// aprovações no CQ desde o deploy (de duas pessoas, em dois dias), TODAS com o
// nome oficial, nenhuma gravação do nome antigo e nenhuma OP com ele. Por isso,
// para o STATUS DE UMA OP existe um nome só (`aguardaLiberacaoComercial`).
// O nome antigo continua conhecido APENAS para ler HISTÓRICO
// (logs_movimentacao_opl, audit_log): ali ele foi escrito como era na época e não
// se reescreve história (`eraLiberacaoComercial`, usada por `mesmaEtapa`).
export const STATUS_AGUARDANDO_LIBERACAO_COMERCIAL = 'Aguardando Liberacao Comercial';
export const STATUS_AGUARDANDO_LIBERACAO_COMERCIAL_ANTIGO = 'Aprovado CQ - Aguardando Liberacao Comercial';
export const aguardaLiberacaoComercial = (s: any): boolean => s === STATUS_AGUARDANDO_LIBERACAO_COMERCIAL;
/** Só para ler HISTÓRICO: o registro pode trazer o nome oficial ou o antigo. */
export const eraLiberacaoComercial = (s: any): boolean =>
  s === STATUS_AGUARDANDO_LIBERACAO_COMERCIAL || s === STATUS_AGUARDANDO_LIBERACAO_COMERCIAL_ANTIGO;

/** Termina com a mercadoria saindo daqui — ou seja, em algum momento precisa
 *  de embalagem e frete. Só as duas adaptações ficam de fora. */
export function terminaEmEnvio(v: string | null | undefined): boolean {
  if (!v) return false;                       // OP antiga: comportamento antigo
  return filaDe(v) !== 'adaptacao';
}

/** "Fabricação serralheria com envio" (carretinha, por exemplo). Rota
 *  definida pelo usuário em 13/09/2026: SERRALHERIA → ADAPTAÇÃO → CQ →
 *  EMBALAGEM → frete. (Antes, em 10/09, a serralheria concluída ia direto
 *  para a embalagem.) Quando a serralheria é só uma etapa dentro de uma
 *  adaptação, nada disso muda: a OP continua na adaptação até acabar. */
export function serralheriaSegueParaAdaptacao(o: any): boolean {
  return o?.fluxo_entrega === 'fabricacao_serralheria_envio';
}

/** Fila da OP considerando a etapa: a de serralheria com envio começa na
 *  Fabricação e, com a serralheria concluída, passa para a Adaptação. */
export function filaDaOp(o: any): DestinoFila {
  if (serralheriaSegueParaAdaptacao(o) && o?.serralheria_status === 'Concluido') return 'adaptacao';
  return filaDe(o?.fluxo_entrega);
}

/** Depois do CQ aprovado: fluxo que termina em envio vai para a embalagem
 *  (que abre a cotação de frete) em vez de esperar liberação comercial. */
export function statusAposCqAprovado(o: any): string {
  return serralheriaSegueParaAdaptacao(o) ? STATUS_EMBALAGEM : STATUS_AGUARDANDO_LIBERACAO_COMERCIAL;
}

/** Tipo de Projeto que JÁ define a rota: kit vendido para envio. Com ele o
 *  Fluxo de Entrega é sempre 'envio_material', e perguntar seria redundante. */
export const TIPO_VENDA_ENVIO = 'Venda para Envio';

/** Fluxo que vale de fato para a OP, considerando o tipo de projeto. */
export function fluxoEfetivo(tipoProjeto: string | null | undefined, fluxo: string | null | undefined): string {
  return tipoProjeto === TIPO_VENDA_ENVIO ? 'envio_material' : (fluxo || '');
}

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];


// ─────────────────────────────────────────────────────────────────────────────
// SERRALHERIA
// Nas palavras do usuário: "faz parte da adaptação, mas não sendo exatamente
// adaptação". Os dados confirmam duas realidades diferentes:
//  1) etapa DENTRO de uma OP de adaptação — 25 OPs de Transformação Veicular,
//     Instalação e Manutenção têm mão de obra de serralheria lançada;
//  2) fabricação do item INTEIRO — as 27 carretinhas (tipo "Reboque"), que
//     hoje têm ZERO registro de trabalho de serralheria, apesar de serem
//     fabricadas por ela. É esse fluxo físico que estava invisível.
// Por isso a fila não olha só o fluxo_entrega: uma OP entra na fila da
// serralheria por qualquer um dos três sinais abaixo.
// ─────────────────────────────────────────────────────────────────────────────

// A coluna oples.serralheria_status serve a DUAS trilhas — vale saber qual é qual
// (levantado na Etapa 5.2 do PLANO_UX_FLUXO_TRABALHO.md, 29/09/2026):
//   • Produção ("fabricação serralheria com envio"):
//       Pendente → Em Execucao → Concluido        (os três abaixo; ProducaoTab.setSerralheria)
//   • Liberação parcial de BOM (Engenharia → Serralheria → PCP):
//       Pendente (Engenharia libera) → Concluido (a Serralheria conclui a demanda,
//       SetorDemandaTab) → SANADO (o PCP confere e dá por resolvido, PCPTab).
export const SERRALHERIA_STATUS = ['Pendente', 'Em Execucao', 'Concluido'] as const;
/** 4º valor da coluna, e não um nome alternativo: é o passo final da liberação
 *  parcial. NÃO entra em SERRALHERIA_STATUS de propósito — aquela lista alimenta o
 *  menu da Produção, e a Produção não sana pendência: quem sana é o PCP. Uma OP
 *  'Sanado' sai da lista do PCP, que só mostra Pendente e Concluido. */
export const SERRALHERIA_SANADO = 'Sanado';

export function temSerralheria(o: any): boolean {
  if (!o) return false;
  return o.fluxo_entrega === 'fabricacao_serralheria_envio'
      || Number(o.valor_mao_de_obra_serralheria) > 0
      || (o.tipo_projeto || '') === 'Reboque';
}

/** Motivo pelo qual a OP está na fila — ajuda quem trabalha a entender se é
 *  o item inteiro ou só uma etapa dentro de outra coisa. */
export function motivoSerralheria(o: any): string {
  if (o?.fluxo_entrega === 'fabricacao_serralheria_envio') return 'Fabricação da serralheria (item inteiro)';
  if ((o?.tipo_projeto || '') === 'Reboque')               return 'Reboque / carretinha';
  if (Number(o?.valor_mao_de_obra_serralheria) > 0)        return 'Etapa dentro da adaptação';
  return 'Serralheria';
}
