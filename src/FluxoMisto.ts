// @ts-nocheck
// FLUXO MISTO — a mesma venda com unidades adaptadas aqui e unidades enviadas (pedido do usuário em 26/10/2026; desenho e decisões em PLANO_FLUXO_MISTO.md).
// Cada grupo do lote customizável escolhe o seu fluxo de entrega; cada unidade vira uma OP /NN com o fluxo do seu grupo. Todas as filas e telas já leem o fluxo da própria OP, então o que muda
// é só como a OP NASCE. "misto" é um valor só da tela: nenhuma OP o grava. Este módulo é a regra pura (sem tela), para testar sem navegador.
import { FLUXOS, soEnvio, terminaEmEnvio, fluxoLabel, fluxoEfetivo } from './FluxoEntrega';
import { exigeEnderecoCompleto, enderecoQueFalta } from './EnderecoEntrega';

/** Valor da opção "Misto" no campo Fluxo de Entrega da Nova OP. Só existe na tela. */
export const FLUXO_MISTO = 'misto';
export const ROTULO_FLUXO_MISTO = 'Misto — cada grupo do lote escolhe o seu fluxo';

/** Os campos de destino que cada grupo de envio guarda (os mesmos da OP) e o frete. */
export const CAMPOS_DESTINO = ['destino_cidade', 'destino_uf', 'destino_cep', 'destino_logradouro', 'destino_numero', 'destino_bairro', 'destino_complemento', 'destino_destinatario', 'destino_telefone'] as const;
export type DestinoDoGrupo = Record<typeof CAMPOS_DESTINO[number], string> & { frete_responsavel: string };
export const destinoVazio = (): DestinoDoGrupo => ({ ...Object.fromEntries(CAMPOS_DESTINO.map(c => [c, ''])), frete_responsavel: '' } as any);

const limpo = (v: any) => String(v ?? '').trim();
const LETRA = (i: number) => String.fromCharCode(65 + (i % 26));

/** Unidade que sai daqui sem passar pela produção (envio de material ou envio para adaptação de terceiro): não tem chassi, placa, M.O. nem serviço de terceiro. */
export const grupoEhDeEnvio = (g: any): boolean => !!g?.fluxo && soEnvio(g.fluxo);
/** O grupo termina com a mercadoria saindo daqui (envio, ou serralheria com envio): precisa de frete. */
export const grupoPrecisaFrete = (g: any): boolean => !!g?.fluxo && terminaEmEnvio(g.fluxo);

/** Tem pelo menos um grupo de envio E um de adaptação/fabricação? (só então o lote é de fato "misto" em fluxo) */
export function temFluxosDiferentes(grupos: any[]): boolean {
  const distintos = new Set((grupos || []).map(g => g?.fluxo || ''));
  return distintos.size > 1;
}

/**
 * Confere os fluxos dos grupos. Devolve a mensagem de erro (em português, com a letra do grupo) ou null.
 *  • a venda mista precisa de 2 ou mais unidades;
 *  • todo grupo escolhe o seu fluxo;
 *  • grupo que termina em envio informa quem paga o frete (CIF ou FOB);
 *  • envio de material com CIF exige o endereço completo (a mesma regra de EnderecoEntrega.ts).
 */
export function validarFluxosDosGrupos(grupos: any[], quantidade: number): string | null {
  if (!(quantidade >= 2)) return 'O fluxo misto precisa de 2 ou mais unidades: com uma só, escolha o fluxo dela direto.';
  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i]; const L = LETRA(i);
    if (!g?.fluxo || !FLUXOS.some(f => f.valor === g.fluxo)) return `Escolha o fluxo de entrega do grupo ${L}.`;
    if (grupoPrecisaFrete(g)) {
      const frete = g.destino?.frete_responsavel;
      if (frete !== 'CIF' && frete !== 'FOB') return `Informe quem paga o frete do grupo ${L}: CIF (empresa) ou FOB (cliente).`;
      if (exigeEnderecoCompleto('', g.fluxo, frete)) {
        const falta = enderecoQueFalta(g.destino || {});
        if (falta.length) return `Grupo ${L} (${fluxoLabel(g.fluxo)}, frete por conta da empresa): informe o endereço de entrega. Falta: ${falta.join(', ')}.`;
      }
    }
  }
  return null;
}

/** "Grupo A: Adaptação na matriz (6) · Grupo B: Envio de material (4)", para a confirmação e o aviso final. */
export function resumoDosFluxos(grupos: any[]): string {
  return (grupos || []).map((g, i) => `Grupo ${LETRA(i)}: ${fluxoLabel(g?.fluxo)} (${Number(g?.qtd) || 0})`).join(' · ');
}

/**
 * Ajusta o que UMA OP grava conforme o fluxo do seu grupo. `payload` é o molde da venda (o mesmo de um lote comum); `formatarCep` é o `cepParaGravar` da tela.
 *  • o fluxo da OP é o do grupo;
 *  • grupo que termina em envio: destino e frete são os do grupo (os da venda não valem para ele);
 *  • grupo de envio sem produção: sem chassi, placa, data de chegada, fotos de entrada, M.O. e serviço de terceiro (o modelo do veículo fica: o kit é para aquele carro).
 * Grupo sem fluxo (venda comum) devolve o molde como veio.
 */
export function ajustarOpPeloFluxoDoGrupo(payload: any, grupo: any, formatarCep: (v: any) => any = (v: any) => v || null): any {
  const fluxo = grupo?.fluxo;
  if (!fluxo) return payload;
  const out: any = { ...payload, fluxo_entrega: fluxo };
  if (terminaEmEnvio(fluxo)) {
    const d = grupo?.destino || {};
    for (const c of CAMPOS_DESTINO) out[c] = limpo(d[c]) || null;
    out.destino_cep = formatarCep(d.destino_cep);
    out.frete_responsavel = d.frete_responsavel || null;
  } else {
    out.frete_responsavel = null;
  }
  if (soEnvio(fluxo)) {
    Object.assign(out, {
      chassi: null, placa: null, data_chegada_veiculo: null, fotos_veiculo: [],
      valor_mao_de_obra: null, valor_mao_de_obra_serralheria: null,
      servico_terceiro: false, tipo_servico_terceiro: null, obs_servico_terceiro: null,
    });
    delete out.tipos_servico_terceiro;
  }
  return out;
}

// ─── M2 (27/10/2026): as telas que falam do lote inteiro precisam saber quando o lote tem fluxos diferentes ──────────────────────────────────────────────────────────────────────────────

/** O fluxo que vale de fato para a OP (o tipo "Venda para Envio" já diz que é envio de material). Vazio = OP anterior à regra do fluxo. */
export const fluxoDaOp = (o: any): string => fluxoEfetivo(o?.tipo_projeto, o?.fluxo_entrega) || '';
/** A unidade sai daqui sem passar pela produção (envio de material ou envio para adaptação de terceiro): não tem chassi nem placa. */
export const ehUnidadeDeEnvio = (o: any): boolean => !!fluxoDaOp(o) && soEnvio(fluxoDaOp(o));

/** A unidade tem um fluxo conhecido e passa pela produção (adaptação ou fabricação). Unidade SEM fluxo é de antes da regra e não conta como produção: lote antigo não vira "misto". */
export const ehUnidadeDeProducao = (o: any): boolean => !!fluxoDaOp(o) && !soEnvio(fluxoDaOp(o));

/** O lote tem unidades de envio E unidades que passam pela produção? É o caso em que "o lote inteiro" deixa de ser uma coisa só. */
export function loteTemEnvioEProducao(unidades: any[]): boolean {
  const u = unidades || [];
  return u.some(ehUnidadeDeEnvio) && u.some(ehUnidadeDeProducao);
}

/**
 * Quantas unidades há em cada fluxo (efetivo). `misto` = pelo menos DOIS fluxos conhecidos no lote (unidade sem fluxo, de antes da regra, não conta como um fluxo à parte: o lote
 * antigo 1560.2608, com unidades sem fluxo e outras de envio, não vira "misto"). `texto`: "6 Adaptação na matriz · 4 Envio de material".
 */
export function resumoDosFluxosDoLote(unidades: any[]): { misto: boolean; partes: { fluxo: string; rotulo: string; n: number }[]; texto: string } {
  const contagem = new Map<string, number>();
  (unidades || []).forEach(o => { const f = fluxoDaOp(o); contagem.set(f, (contagem.get(f) || 0) + 1); });
  const partes = [...contagem.entries()].map(([fluxo, n]) => ({ fluxo, rotulo: fluxo ? fluxoLabel(fluxo) : 'Não classificado', n })).sort((a, b) => b.n - a.n);
  return { misto: partes.filter(p => p.fluxo).length > 1, partes, texto: partes.map(p => `${p.n} ${p.rotulo}`).join(' · ') };
}

/**
 * O lote nasceu do fluxo misto? (a assinatura que a criação deixa: há unidades de envio E de produção, e TODA unidade de envio tem a mão de obra vazia).
 * Nesse lote cada unidade já guarda o SEU valor (a venda foi dividida na criação), então a conta de comissão não pode dividir de novo "o valor do lote repetido"
 * (OpLotes.ts). Um lote antigo com unidades de envio e outras (como o 1560.2608, com M.O. 0 em todas) NÃO bate nessa assinatura e continua como estava.
 */
export function loteNasceuDoFluxoMisto(unidades: any[]): boolean {
  const u = unidades || [];
  if (!loteTemEnvioEProducao(u)) return false;
  return u.filter(ehUnidadeDeEnvio).every(o => o.valor_mao_de_obra == null);
}

/** Campos que dependem de COMO a unidade é entregue: num lote com fluxos diferentes, "o lote inteiro" não pode levá-los a todas as unidades. */
export const CAMPOS_QUE_DEPENDEM_DO_FLUXO = new Set([
  'fluxo_entrega', 'frete_responsavel',
  'destino_cep', 'destino_cidade', 'destino_uf', 'destino_logradouro', 'destino_numero', 'destino_bairro', 'destino_complemento', 'destino_destinatario', 'destino_telefone',
  'valor_mao_de_obra', 'valor_mao_de_obra_serralheria',
  'servico_terceiro', 'tipos_servico_terceiro', 'tipo_servico_terceiro', 'obs_servico_terceiro', 'fotos_veiculo',
]);

/**
 * Numa edição "no lote inteiro", dá a cada unidade o que ela recebe quando o lote tem fluxos diferentes:
 *  • os campos comuns (prazo, responsável, descrição…) vão para todas;
 *  • os que dependem do fluxo (frete, destino, M.O., fluxo…) vão SÓ para as unidades do mesmo fluxo de `fluxoAlvo`;
 *  • sem `fluxoAlvo` (a tela do lote não sabe de quem se trata) eles NÃO vão para ninguém e a tela diz como escolher.
 * Lote de um fluxo só: devolve os campos como vieram, para todas (comportamento de sempre).
 */
export function camposQueChegamNaUnidade(campos: string[], unidade: any, todas: any[], fluxoAlvo: string | null | undefined): { aplicar: string[]; deixou: string[] } {
  if (!resumoDosFluxosDoLote(todas).misto) return { aplicar: campos, deixou: [] };
  const aplicar: string[] = [], deixou: string[] = [];
  for (const k of campos) {
    if (!CAMPOS_QUE_DEPENDEM_DO_FLUXO.has(k)) { aplicar.push(k); continue; }
    if (fluxoAlvo != null && fluxoDaOp(unidade) === fluxoAlvo) aplicar.push(k); else deixou.push(k);
  }
  return { aplicar, deixou };
}

/**
 * Divide um total entre as unidades que ele vale (a M.O. só vale para quem passa pela produção). `ehElegivel[i]` diz se a unidade i entra; a divisão é a de `dividir`
 * (a mesma da venda comum: o resto do arredondamento vai para a última). Devolve uma entrada por unidade, `null` para as que não entram.
 */
export function dividirSoEntreElegiveis(total: number | null, ehElegivel: boolean[], dividir: (v: number | null, n: number) => (number | null)[]): (number | null)[] {
  const n = ehElegivel.filter(Boolean).length;
  const partes = n > 0 ? dividir(total, n) : [];
  let k = 0;
  return ehElegivel.map(e => (e ? (partes[k++] ?? null) : null));
}
