// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// O QUE A OP PRECISA TER PARA SEGUIR AO PCP (R1, decisão do usuário de 01/10/2026; o destino é o PCP desde a Etapa 18, de 12/10/2026)
//
// A OP criada sozinha quando o card vira Vencido nasce com o que o card sabe e quase nunca com o resto (de 199 OPs automáticas, 167 sem fluxo de entrega e 179 sem
// itens vendidos — medido na Etapa 4). Resposta do usuário: "libera para criar OP, porém só segue ... depois de preencher os campos obrigatórios". Esta é a MESMA lista
// que a Nova OP/OS já exige na abertura manual; ficar num lugar só evita que a OP automática, o reenvio e o formulário digam coisas diferentes.
//
// As perguntas sobre o carro (R8) NÃO entram aqui: quem as responde é quem abre a OP, na Nova OP/OS (onde o formulário as mostra); na OP criada sozinha o veículo nem
// existe ainda, e o PCP completa o que faltar ao configurar a OP ("Responder agora" na conferência da estrutura). Suposição a confirmar com o usuário.
// ─────────────────────────────────────────────────────────────────────────────
import { fluxoEfetivo, terminaEmEnvio, TIPO_VENDA_ENVIO } from './FluxoEntrega';
import { modoDoVeiculo } from './ConfigEstrutura';
import { itensPreenchidos } from './DemandaItens';
import { exigeEnderecoCompleto, enderecoQueFalta } from './EnderecoEntrega';

/**
 * O que falta na OP para ela poder seguir ao PCP, nas palavras de quem preenche. Lista vazia = completa.
 * `o` é a OP (linha de `oples`) ou o molde dela antes de gravar: precisa de fluxo_entrega, tipo_projeto, origem_venda, itens_vendidos, frete_responsavel e veiculo_id.
 */
export async function camposQueFaltam(o: any): Promise<string[]> {
  const faltam: string[] = [];
  const fluxo = fluxoEfetivo(o?.tipo_projeto, o?.fluxo_entrega);
  // sem fluxo a OP não tem rota: cairia na Adaptação por omissão, que é justamente o problema que o campo resolve
  if (!fluxo) faltam.push('fluxo de entrega');
  if (!o?.origem_venda) faltam.push('origem da venda (Licitação ou Venda direta)');
  if (itensPreenchidos(Array.isArray(o?.itens_vendidos) ? o.itens_vendidos : []).length === 0) faltam.push('itens vendidos (pelo menos 1)');
  // o veículo é obrigatório por tipo de venda, configurado na Administração; venda para envio não tem veículo
  if (fluxo && o?.tipo_projeto !== TIPO_VENDA_ENVIO && !o?.veiculo_id && (await modoDoVeiculo(fluxo)) === 'obrigatorio') {
    faltam.push('veículo (este tipo de venda exige)');
  }
  // quem paga o frete importa em toda OP que sai daqui embalada
  if (fluxo && terminaEmEnvio(fluxo) && !o?.frete_responsavel) faltam.push('quem paga o frete (CIF ou FOB)');
  // Pedido do usuário em 15/10/2026: Venda para Envio com frete por conta da empresa — o endereço completo é do vendedor (EnderecoEntrega.ts).
  // A OP criada sozinha nunca o traz do card, então volta ao Comercial para completar, como com os outros campos.
  if (exigeEnderecoCompleto(o?.tipo_projeto, o?.fluxo_entrega, o?.frete_responsavel) && enderecoQueFalta(o).length) {
    faltam.push('endereço de entrega completo (rua, número, bairro, complemento, quem recebe e telefone, além de CEP, cidade e UF)');
  }
  return faltam;
}

/**
 * R8 (13/10/2026): a Nova OP/OS deve recusar o salvamento enquanto houver pergunta do carro sem resposta? Devolve a frase da recusa, ou null se pode salvar.
 * Só vale quando o bloco "Sobre o carro" aparece (OP, fora do lote misto) e há veículo escolhido — sem veículo as respostas nem são gravadas.
 */
export function recusaPorPerguntasDoCarro({ tipo, loteMisto, temVeiculo, pendentes }: { tipo: string; loteMisto: boolean; temVeiculo: boolean; pendentes: number }): string | null {
  if (tipo !== 'OP' || loteMisto || !temVeiculo || !(pendentes > 0)) return null;
  return `Responda ${pendentes === 1 ? 'a pergunta' : `as ${pendentes} perguntas`} do bloco "Sobre o carro": elas montam o material da instalação e o PCP recebe a OP já respondida.`;
}

/** "fluxo de entrega, itens vendidos e veículo" — para frases. */
export function listaEmTexto(itens: string[]): string {
  const l = (itens || []).filter(Boolean);
  if (l.length <= 1) return l.join('');
  return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
}
