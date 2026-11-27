// Mapa de tipos de nota por origem (preparação do módulo fiscal, 27/11/2026): de onde nasce cada nota no nosso fluxo e o que a OP "pede" (NF-e de material, NFS-e de serviço ou as duas).
// Puro: não lê nada do banco e não grava nada (a leitura é `lerOpsComNota` / `lerCatalogoCitado`, em FiscalDados.ts). NADA aqui emite nota nem trava o Fiscal: só diz o que o sistema entende
// e compara com o que o Fiscal informou. O que a contabilidade ainda não confirmou fica marcado "a confirmar" (`base: 'a_confirmar'`); o sistema não decide regra fiscal sozinho.
//
// Medido em 27/11/2026 (588 OPs, 330 com alguma nota informada): a OP NÃO diz o tipo de nota; quem diz é o CONTEÚDO vendido. Das OPs com itens lançados, as que vendem só linha de serviço
// (categoria GENERICO: instalação, plotagem, película...) saíram em NFS-e em 30 de 33; as que vendem produto e serviço, nas duas notas em 15 de 19; as só de produto, em NF-e em 29 de 34
// (9 com as duas). Já 203 OPs com nota nunca tiveram itens lançados (OPs antigas): para elas o sistema NÃO sabe, e diz isso em vez de chutar.
import { linhasVendidas, acharItem, ehGenerico, chaveDoNome } from './FiscalProntidao.ts';

export type BaseDaRegra = 'historico' | 'a_confirmar';
export type OrigemDeNota = {
  id: string;
  origem: string;          // de onde a nota nasce no nosso fluxo
  nota: string;            // o tipo de nota que ela gera
  base: BaseDaRegra;       // 'historico' = o que o Fiscal já emitiu confirma; 'a_confirmar' = vale só como proposta, até a contabilidade responder
  quemDiz: string;         // o que, no sistema, diz que a origem é esta
  sistemaSabe: 'sim' | 'em_parte' | 'nao';   // o sistema já tem o dado para reconhecer esta origem sozinho?
  obs?: string;
};

/** O mapa. Só descreve; o tratamento fiscal de cada linha (CFOP, CST, alíquotas) é a fase das regras e depende da contabilidade. */
export const ORIGENS_DE_NOTA: OrigemDeNota[] = [
  { id: 'venda_material', origem: 'OP com mercadoria vendida (adaptação, envio de material, rádio)', nota: 'NF-e de venda', base: 'historico', quemDiz: 'Linhas vendidas de produto na OP (itens que não são serviço)', sistemaSabe: 'sim', obs: 'O Fiscal hoje digita o número e o dia; o sistema ainda não emite.' },
  { id: 'servico_na_op', origem: 'Serviço vendido na OP (instalação, plotagem, película, garantia estendida...)', nota: 'NFS-e', base: 'historico', quemDiz: 'Linhas vendidas de item da categoria GENERICO', sistemaSabe: 'sim', obs: 'Frete, locação e licença também são GENERICO: onde cada um vai é pergunta para a contabilidade.' },
  { id: 'so_terceiro', origem: 'OP "Somente serviço de terceiro" (nada a fabricar)', nota: 'NFS-e', base: 'historico', quemDiz: 'Fluxo de entrega da OP', sistemaSabe: 'sim' },
  { id: 'antecipado', origem: 'Faturamento antecipado (antes de a produção terminar)', nota: 'Mesma nota da venda, emitida antes', base: 'historico', quemDiz: 'A marca de faturamento antecipado da OP', sistemaSabe: 'sim' },
  { id: 'remessa', origem: 'Envio parcial por remessa (e o complemento do que faltou)', nota: 'Uma nota por remessa; o complemento a confirmar', base: 'a_confirmar', quemDiz: 'Remessas e complementos da OP', sistemaSabe: 'em_parte' },
  { id: 'os_cobrada', origem: 'OS do SAC cobrada', nota: 'NFS-e (e NF-e se vender peça: a confirmar)', base: 'a_confirmar', quemDiz: 'A OS cobrada que chega ao Fiscal', sistemaSabe: 'sim' },
  { id: 'industrializacao', origem: 'Serviço de terceiro com ida e volta (pintura eletrostática)', nota: 'Nota de remessa e nota de retorno', base: 'a_confirmar', quemDiz: 'Ordem de serviço de terceiro (saída e retorno)', sistemaSabe: 'em_parte' },
  { id: 'conserto', origem: 'Garantia, conserto e troca', nota: 'Nota de conserto ou de troca', base: 'a_confirmar', quemDiz: 'Ficha de garantia', sistemaSabe: 'em_parte' },
  { id: 'demonstracao', origem: 'Demonstração e comodato', nota: 'Nota de remessa', base: 'a_confirmar', quemDiz: 'Ainda não existe no sistema', sistemaSabe: 'nao' },
  { id: 'devolucao', origem: 'Devolução ao cliente ou ao fornecedor', nota: 'Nota de devolução, com a nota de origem', base: 'a_confirmar', quemDiz: 'Ainda não existe no sistema ("Devolvida" na OP é devolução entre setores, não nota)', sistemaSabe: 'nao' },
  { id: 'orgao_publico', origem: 'Venda a órgão público', nota: 'Tratamento próprio por tipo de órgão', base: 'a_confirmar', quemDiz: 'Tipo de órgão do cadastro fiscal do cliente', sistemaSabe: 'em_parte' },
];

export type NotasQueAOpPede = {
  produtos: number;      // linhas de mercadoria resolvidas no cadastro
  servicos: number;      // linhas de item GENERICO que não são frete
  fretes: number;        // linhas de frete (em qual nota vai é pergunta para a contabilidade: não conta para nenhum lado)
  naoSei: number;        // linhas sem cadastro, ou com dois cadastros: não dá para dizer o que são
  semItens: boolean;     // a OP não tem nenhuma linha vendida lançada
  pede: 'material' | 'servico' | 'material_e_servico' | 'indefinida';
  /** true = sabemos tudo o que a OP vende; false = há linha que não se acha ou a OP não tem itens: a comparação com o que o Fiscal informou não vale. */
  certa: boolean;
  motivos: string[];
};

const ehFrete = (nome: any) => /\bFRETE\b|TRANSPORTE DE MERCADORIA/.test(chaveDoNome(nome));

/** O que a OP vende e, por isso, que notas ela pede. Usa o mesmo cadastro da prontidão (`catalogo` = itens que as OPs citam). Sem item lançado, `indefinida`: nunca se inventa. */
export function notasQueAOpPede(op: any, catalogo: any[]): NotasQueAOpPede {
  const linhas = linhasVendidas(op);
  let produtos = 0, servicos = 0, fretes = 0, naoSei = 0;
  for (const l of linhas) {
    const a = acharItem(l, catalogo);
    if (a.situacao !== 'achado') { naoSei++; continue; }
    if (!ehGenerico(a.item)) { produtos++; continue; }
    if (ehFrete(a.item.nome)) fretes++; else servicos++;
  }
  const soTerceiro = op?.fluxo_entrega === 'somente_servico_terceiro';
  const material = produtos > 0;
  const servico = servicos > 0 || soTerceiro;
  const pede: NotasQueAOpPede['pede'] = material && servico ? 'material_e_servico' : material ? 'material' : servico ? 'servico' : 'indefinida';
  const motivos: string[] = [];
  if (soTerceiro) motivos.push('OP só de serviço de terceiro: não há mercadoria a fabricar');
  if (produtos) motivos.push(`${produtos} linha(s) de mercadoria`);
  if (servicos) motivos.push(`${servicos} linha(s) de serviço`);
  if (fretes) motivos.push(`${fretes} linha(s) de frete (a contabilidade diz em qual nota vai)`);
  if (naoSei) motivos.push(`${naoSei} linha(s) que não achei no cadastro de itens`);
  if (!linhas.length && !soTerceiro) motivos.push('a OP não tem itens vendidos lançados');
  return { produtos, servicos, fretes, naoSei, semItens: linhas.length === 0, pede, certa: pede !== 'indefinida' && naoSei === 0, motivos };
}

export const ROTULO_DO_PEDIDO: Record<NotasQueAOpPede['pede'], string> = {
  material: 'NF-e de material', servico: 'NFS-e de serviço', material_e_servico: 'NF-e de material + NFS-e de serviço', indefinida: 'Não sei (a OP não diz)',
};

export type ConferenciaDasNotas = {
  situacao: 'sem_nota' | 'sem_base' | 'confere' | 'diverge';
  /** o que diverge, em português (vazio quando confere) */
  divergencias: string[];
  informadas: { material: string; servico: string };
};

/** Compara o que a OP pede com os números que o Fiscal informou (`numero_nf` = NF-e, `numero_nf_servico` = NFS-e). Só informa: o Fiscal pode ter motivo (vendeu só o material, por exemplo). */
export function conferirNotasInformadas(pede: NotasQueAOpPede, op: any): ConferenciaDasNotas {
  const material = String(op?.numero_nf ?? '').trim();
  const servico = String(op?.numero_nf_servico ?? '').trim();
  const informadas = { material, servico };
  if (!material && !servico) return { situacao: 'sem_nota', divergencias: [], informadas };
  if (!pede.certa) return { situacao: 'sem_base', divergencias: [], informadas };
  const d: string[] = [];
  const pedeMaterial = pede.pede === 'material' || pede.pede === 'material_e_servico';
  const pedeServico = pede.pede === 'servico' || pede.pede === 'material_e_servico';
  if (pedeMaterial && !material) d.push('a OP vende mercadoria, mas só a NFS-e foi informada');
  if (pedeServico && !servico) d.push('a OP vende serviço, mas só a NF-e foi informada');
  if (material && !pedeMaterial) d.push('foi informada a NF-e, mas a OP só vende serviço');
  if (servico && !pedeServico) d.push('foi informada a NFS-e, mas a OP só vende mercadoria');
  return { situacao: d.length ? 'diverge' : 'confere', divergencias: d, informadas };
}

/** Resumo da conferência de uma lista de OPs (cada item `{ pede, conferencia }`). */
export function resumoDaConferencia(itens: { conferencia: ConferenciaDasNotas }[]) {
  const r = { total: 0, confere: 0, diverge: 0, semBase: 0 };
  for (const i of itens || []) {
    if (!i?.conferencia || i.conferencia.situacao === 'sem_nota') continue;
    r.total++;
    if (i.conferencia.situacao === 'confere') r.confere++;
    else if (i.conferencia.situacao === 'diverge') r.diverge++;
    else r.semBase++;
  }
  return r;
}
