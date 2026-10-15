// ─────────────────────────────────────────────────────────────────────────────
// ENDEREÇO DE ENTREGA DA OP — regra única (pedido do usuário em 15/10/2026)
//
// Venda para Envio com frete por conta da empresa (CIF): quem gera a OP — o vendedor — é o responsável por informar o endereço completo de entrega
// certo, e é ele que a Logística vê na tela de cotação de frete. Antes a OP só guardava CEP, cidade e UF, e a embalagem do Almoxarifado era quem
// tentava completar. Com FOB (o cliente paga e busca/contrata o frete) não há cotação, então nada disto é exigido.
//
// Fica num arquivo só para a criação da OP, a edição, a OP criada sozinha (OpObrigatorios), a embalagem e a cotação não dizerem coisas diferentes.
// ─────────────────────────────────────────────────────────────────────────────
import { fluxoEfetivo } from './FluxoEntrega';

/** Os campos do endereço além de CEP, cidade e UF, na ordem em que aparecem nas telas. */
export const CAMPOS_ENDERECO: { campo: string; rotulo: string }[] = [
  { campo: 'destino_logradouro',   rotulo: 'rua' },
  { campo: 'destino_numero',       rotulo: 'número' },
  { campo: 'destino_bairro',       rotulo: 'bairro' },
  { campo: 'destino_complemento',  rotulo: 'complemento (se não houver, escreva "sem complemento")' },
  { campo: 'destino_destinatario', rotulo: 'quem recebe (nome)' },
  { campo: 'destino_telefone',     rotulo: 'telefone de quem recebe' },
];

const limpo = (v: any) => String(v ?? '').trim();
const digitos = (v: any) => String(v ?? '').replace(/\D/g, '');

/** O endereço completo é obrigatório? Só em Venda para Envio (fluxo "envio de material") com frete CIF, a empresa pagando. */
export function exigeEnderecoCompleto(tipoProjeto: any, fluxo: any, freteResponsavel: any): boolean {
  return fluxoEfetivo(tipoProjeto, fluxo) === 'envio_material' && freteResponsavel === 'CIF';
}

/** O que falta no endereço, nas palavras de quem preenche. `o` é a OP (ou o molde dela). Lista vazia = completo. */
export function enderecoQueFalta(o: any): string[] {
  const faltam: string[] = [];
  if (digitos(o?.destino_cep).length !== 8) faltam.push('CEP de entrega');
  if (!limpo(o?.destino_cidade)) faltam.push('cidade de entrega');
  if (!limpo(o?.destino_uf)) faltam.push('UF de entrega');
  for (const c of CAMPOS_ENDERECO) {
    if (!limpo(o?.[c.campo])) faltam.push(c.rotulo);
  }
  // telefone com pelo menos DDD + número; texto solto como "depois passo" não serve para a transportadora ligar
  if (limpo(o?.destino_telefone) && digitos(o?.destino_telefone).length < 8) faltam.push('telefone de quem recebe (com DDD)');
  return [...new Set(faltam)];
}

/** "Rua X, 123 — Bairro — Complemento", só com o que existe. Vazio se não houver nada. */
export function enderecoEmLinha(o: any): string {
  const ruaNumero = [limpo(o?.destino_logradouro), limpo(o?.destino_numero)].filter(Boolean).join(', ');
  return [ruaNumero, limpo(o?.destino_bairro), limpo(o?.destino_complemento)].filter(Boolean).join(' — ');
}
