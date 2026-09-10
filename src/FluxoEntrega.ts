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
  | 'fabricacao_interna_envio'
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
  { valor:'fabricacao_interna_envio',     label:'Fabricação interna para envio',        fila:'fabricacao',
    ajuda:'Fabricado aqui e depois embalado e enviado ao cliente.' },
  { valor:'fabricacao_serralheria_envio', label:'Fabricação serralheria com envio',     fila:'fabricacao',
    ajuda:'Serralheria fabrica (ex: carretinhas) e depois segue para envio.' },
  { valor:'envio_adaptacao_terceiro',     label:'Envio para adaptação de terceiro',     fila:'envio',
    ajuda:'Segue para um parceiro fora da empresa, que faz a adaptação.' },
  { valor:'envio_material',               label:'Envio de material',                    fila:'envio',
    ajuda:'Só separar, embalar e enviar. Não passa por produção.' },
];

const PORVALOR: Record<string, typeof FLUXOS[number]> =
  Object.fromEntries(FLUXOS.map(f => [f.valor, f]));

export function fluxoLabel(v: string | null | undefined): string {
  if (!v) return 'Não classificado';
  return PORVALOR[v]?.label || v;
}

/** Fila em que a OP deve aparecer. Vazio devolve 'adaptacao' de propósito:
 *  é o comportamento antigo, que as OPs em andamento dependem. */
export function filaDe(v: string | null | undefined): DestinoFila {
  if (!v) return 'adaptacao';
  return PORVALOR[v]?.fila || 'adaptacao';
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

/** Termina com a mercadoria saindo daqui — ou seja, em algum momento precisa
 *  de embalagem e frete. Só as duas adaptações ficam de fora. */
export function terminaEmEnvio(v: string | null | undefined): boolean {
  if (!v) return false;                       // OP antiga: comportamento antigo
  return filaDe(v) !== 'adaptacao';
}

/** A serralheria, quando fabrica o item INTEIRO para envio (carretinha, por
 *  exemplo), encerra a produção: terminou lá, vai direto para a embalagem e o
 *  frete. Quando ela é só uma etapa dentro de uma adaptação, não — a OP
 *  continua na adaptação até a adaptação acabar. */
export function serralheriaEncerraProducao(o: any): boolean {
  return o?.fluxo_entrega === 'fabricacao_serralheria_envio';
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

export const SERRALHERIA_STATUS = ['Pendente', 'Em Execucao', 'Concluido'] as const;

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
