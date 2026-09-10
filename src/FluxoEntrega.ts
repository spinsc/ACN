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

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
