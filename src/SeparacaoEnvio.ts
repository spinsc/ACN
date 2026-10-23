// ─────────────────────────────────────────────────────────────────────────────
// QUEM SEPARA E EMBALA UMA OP DE ENVIO — Almoxarifado ou Telecom
//
// Pedido do usuário em 22/10/2026: quando a OP é um projeto de RÁDIO e o fluxo é envio de material (a "venda para envio" do rádio), quem separa, põe o serial,
// embala e passa para a cotação de frete é o setor de TELECOM, não o Almoxarifado. O processo do Telecom é o mesmo do Almoxarifado; a única diferença é que ainda
// não há estoque no Telecom (nada dá baixa, nada é reservado).
//
// Por que derivar e não gravar: o "setor que separa" não é um dado novo da OP — sai do tipo de projeto, do fluxo de entrega e das linhas vendidas, que já existem
// em todas as OPs. Assim a OP que já está esperando no Almoxarifado (A1711.2610, Rádio em envio) aparece sozinha no Telecom, sem migrar nenhuma linha.
//
// Fatia T2 (22/10/2026): cada LINHA vendida pode dizer quem a separa (`itens_vendidos[].setor`, que vem do Cadastro de itens e o vendedor troca). Sem a marca vale o padrão
// da venda: Telecom numa OP de rádio em envio, Almoxarifado no resto. Uma venda com linhas dos dois setores é a venda COMPOSTA (fatia T3).
//
// Só as OPs de ENVIO passam por aqui: adaptação, fabricação e o resto seguem no Almoxarifado como sempre — a marca da linha só vale quando a rota é "envio de material".
// ─────────────────────────────────────────────────────────────────────────────
import { fluxoEfetivo } from './FluxoEntrega';

export const SETOR_ALMOXARIFADO = 'Almoxarifado';
export const SETOR_TELECOM = 'Telecom';
/** Os setores que separam, na ordem em que aparecem nas telas. */
export const SETORES_DE_SEPARACAO = [SETOR_ALMOXARIFADO, SETOR_TELECOM] as const;
export type SetorDaSeparacao = typeof SETOR_ALMOXARIFADO | typeof SETOR_TELECOM;
/** Tipo de projeto "Radio" (grafado sem acento, como fica gravado em oples.tipo_projeto). */
export const TIPO_RADIO = 'Radio';

/** A rota é "envio de material": só separar, embalar e enviar (o tipo "Venda para Envio" já define esta rota). */
export const ehEnvioDeMaterial = (o: any): boolean => fluxoEfetivo(o?.tipo_projeto, o?.fluxo_entrega) === 'envio_material';

/** Rádio vendido para envio: o tipo é Radio e a rota é "envio de material". Rádio com envio para adaptação de terceiro, ou com adaptação na matriz, NÃO entra:
 *  ali o Almoxarifado segue como sempre. */
export function ehRadioEmEnvio(o: any): boolean {
  return o?.tipo_projeto === TIPO_RADIO && ehEnvioDeMaterial(o);
}

/** O setor de uma linha sem marca: Telecom numa OP de rádio em envio, Almoxarifado em qualquer outra. */
export const setorPadraoDaVenda = (o: any): SetorDaSeparacao => (ehRadioEmEnvio(o) ? SETOR_TELECOM : SETOR_ALMOXARIFADO);

/** Linhas vendidas com nome (a linha em branco do editor não conta). */
export const linhasVendidas = (o: any): any[] => (Array.isArray(o?.itens_vendidos) ? o.itens_vendidos : []).filter((l: any) => String(l?.nome || '').trim());

/** Quem separa esta linha: a marca da própria linha, ou o padrão da venda. */
export function setorDaLinha(linha: any, o: any): SetorDaSeparacao {
  return linha?.setor === SETOR_TELECOM || linha?.setor === SETOR_ALMOXARIFADO ? linha.setor : setorPadraoDaVenda(o);
}

/** As linhas vendidas que um setor separa. */
export const linhasDoSetor = (o: any, setor: string): any[] => linhasVendidas(o).filter(l => setorDaLinha(l, o) === setor);

/** Quais setores separam alguma coisa desta OP, na ordem fixa Almoxarifado → Telecom. Fora do envio de material é sempre só o Almoxarifado; OP de envio sem linhas
 *  vendidas segue o padrão da venda (assim a OP de rádio em envio de antes da T2, sem marca nas linhas, continua no Telecom). */
export function setoresDaSeparacao(o: any): SetorDaSeparacao[] {
  if (!ehEnvioDeMaterial(o)) return [SETOR_ALMOXARIFADO];
  const linhas = linhasVendidas(o);
  if (!linhas.length) return [setorPadraoDaVenda(o)];
  const usados = new Set(linhas.map(l => setorDaLinha(l, o)));
  return SETORES_DE_SEPARACAO.filter(s => usados.has(s));
}

/** Venda composta: linhas dos dois setores na mesma OP (rádio + material de adaptação). */
export const ehVendaComposta = (o: any): boolean => setoresDaSeparacao(o).length > 1;

/** O setor que separa, embala e abre o frete desta OP. Na venda composta (fatia T3) são os dois; enquanto ela não anda, fica com o Almoxarifado. */
export function setorDaSeparacao(o: any): SetorDaSeparacao {
  const setores = setoresDaSeparacao(o);
  return setores.length === 1 ? setores[0] : SETOR_ALMOXARIFADO;
}

export const separaNoTelecom = (o: any): boolean => setorDaSeparacao(o) === SETOR_TELECOM;

/** Status em que a OP está na mão de quem separa/embala (a fila do Almoxarifado e a do Telecom leem os mesmos dois). */
export const STATUS_DE_SEPARACAO = ['Aguardando Almox', 'Aguardando Embalagem'];
