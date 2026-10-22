// ─────────────────────────────────────────────────────────────────────────────
// QUEM SEPARA E EMBALA UMA OP DE ENVIO — Almoxarifado ou Telecom
//
// Pedido do usuário em 22/10/2026: quando a OP é um projeto de RÁDIO e o fluxo é envio de material (a "venda para envio" do rádio), quem separa, põe o serial,
// embala e passa para a cotação de frete é o setor de TELECOM, não o Almoxarifado. O processo do Telecom é o mesmo do Almoxarifado; a única diferença é que ainda
// não há estoque no Telecom (nada dá baixa, nada é reservado).
//
// Por que derivar e não gravar: o "setor que separa" não é um dado novo da OP — sai do tipo de projeto e do fluxo de entrega, que já existem em todas as OPs. Assim a OP
// que já está esperando no Almoxarifado (A1711.2610, Rádio em envio) aparece sozinha no Telecom, sem migrar nenhuma linha. A venda COMPOSTA (rádio + material de adaptação
// na mesma OP) é a fatia seguinte e vai olhar também as linhas vendidas.
//
// Só as OPs de ENVIO passam por aqui: adaptação, fabricação e o resto seguem no Almoxarifado como sempre.
// ─────────────────────────────────────────────────────────────────────────────
import { fluxoEfetivo } from './FluxoEntrega';

export const SETOR_ALMOXARIFADO = 'Almoxarifado';
export const SETOR_TELECOM = 'Telecom';
/** Tipo de projeto "Radio" (grafado sem acento, como fica gravado em oples.tipo_projeto). */
export const TIPO_RADIO = 'Radio';

/** Rádio vendido para envio: o tipo é Radio e a rota é "envio de material" (a mesma que o tipo "Venda para Envio" já define). Rádio com envio para adaptação de
 *  terceiro, ou com adaptação na matriz, NÃO entra: ali o Almoxarifado segue como sempre. */
export function ehRadioEmEnvio(o: any): boolean {
  return o?.tipo_projeto === TIPO_RADIO && fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega) === 'envio_material';
}

/** O setor que separa, embala e abre o frete desta OP. */
export function setorDaSeparacao(o: any): typeof SETOR_ALMOXARIFADO | typeof SETOR_TELECOM {
  return ehRadioEmEnvio(o) ? SETOR_TELECOM : SETOR_ALMOXARIFADO;
}

export const separaNoTelecom = (o: any): boolean => setorDaSeparacao(o) === SETOR_TELECOM;

/** Status em que a OP está na mão de quem separa/embala (a fila do Almoxarifado e a do Telecom leem os mesmos dois). */
export const STATUS_DE_SEPARACAO = ['Aguardando Almox', 'Aguardando Embalagem'];
