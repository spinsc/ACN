// @ts-nocheck
// FLUXO MISTO — a mesma venda com unidades adaptadas aqui e unidades enviadas (pedido do usuário em 26/10/2026; desenho e decisões em PLANO_FLUXO_MISTO.md).
// Cada grupo do lote customizável escolhe o seu fluxo de entrega; cada unidade vira uma OP /NN com o fluxo do seu grupo. Todas as filas e telas já leem o fluxo da própria OP, então o que muda
// é só como a OP NASCE. "misto" é um valor só da tela: nenhuma OP o grava. Este módulo é a regra pura (sem tela), para testar sem navegador.
import { FLUXOS, soEnvio, terminaEmEnvio, fluxoLabel } from './FluxoEntrega';
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
