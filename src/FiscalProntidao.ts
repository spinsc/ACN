// Prontidão da OP para virar nota (preparação do módulo fiscal, 26/11/2026): a OP tem tudo o que a nota vai exigir? Cliente, itens vendidos e empresa que fatura, cada um com os dados
// fiscais completos. As regras do que falta em CADA cadastro continuam em FiscalRegras.ts (um lugar só); aqui só se liga a OP a esses cadastros e se junta o que falta.
// Puro: não lê nada do banco (a leitura é `lerContextoDaProntidao`, em FiscalDados.ts) e roda direto no Node nos testes.
//
// O que a OP sabe (medido em 26/11/2026, 576 OPs vivas): o CLIENTE é só o nome escrito (`cliente_nome`; só 9 têm o CPF/CNPJ em `cnpj_faturamento`, que é do cliente e não da empresa
// que emite) e a OP não guarda o id do cadastro; os ITENS são `itens_vendidos[]`, com `item_id` em 87% das linhas (as outras se acham pelo nome); a EMPRESA é `faturamento_empresa` ("ACN" ou
// "Detech"). Por isso a ligação com o cadastro é DITA em voz alta: cliente que não se acha (ou se acha em dois) é uma pendência com esse nome, nunca "pronta".
import { faltasDoCliente, faltasDoItem, faltasDoEmitente, documentoValido, CAMPOS_FISCAIS_DO_CLIENTE, CAMPOS_FISCAIS_DO_ITEM, soDigitos } from './FiscalRegras.ts';

/** Tira o acento, a caixa e os espaços repetidos ("  Detech  Ltda" → "DETECH LTDA"). */
export const chaveDoNome = (s: any): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

export type ContextoDaProntidao = {
  clientes: any[];                       // id, nome, documento
  fiscaisDosClientes: Map<string, any>;  // cliente_id → linha de fiscal_clientes
  catalogo: any[];                       // id, codigo, nome, ncm, ipi_pct, ativo, categoria (só os itens que as OPs citam)
  fiscaisDosItens: Map<string, any>;     // item_id → linha de fiscal_itens
  emitentes: any[];                      // fiscal_emitentes
};

export type Pendencia = { grupo: 'empresa' | 'cliente' | 'item'; titulo: string; faltas: string[] };
export type Prontidao = {
  /** pronta = nada falta e há ao menos um produto conferido; faltam = há pendência; */
  situacao: 'pronta' | 'faltam';
  pendencias: Pendencia[];
  totalDeFaltas: number;
  itensConferidos: number;   // linhas de produto conferidas
  itensIgnorados: number;    // linhas de serviço/genérico (não levam NCM, CEST nem origem: vão na NFS-e ou nem são mercadoria)
};

const rotuloDoCliente = Object.fromEntries(CAMPOS_FISCAIS_DO_CLIENTE.map(c => [c.chave, c.rotulo]));
const rotuloDoItem = Object.fromEntries(CAMPOS_FISCAIS_DO_ITEM.map(c => [c.chave, c.rotulo]));

/** As linhas vendidas da OP (a coluna é jsonb: lista; texto de JSON também é aceito). Linha sem nome e sem item é lixo e fica de fora. */
export function linhasVendidas(op: any): any[] {
  let v = op?.itens_vendidos;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return (Array.isArray(v) ? v : []).filter(l => l && (l.item_id || String(l.nome || '').trim()));
}

/** Serviço de instalação, frete e afins têm a categoria "GENERICO" no cadastro: não são mercadoria da NF-e. */
export const ehGenerico = (item: any): boolean => chaveDoNome(item?.categoria) === 'GENERICO';

export type AcheiOCliente = { situacao: 'achado' | 'sem_nome' | 'sem_cadastro' | 'ambiguo'; cliente: any | null; por: 'documento' | 'nome' | '' };

/** Liga a OP a UM cliente do cadastro: pelo CPF/CNPJ da OP, quando tem e acha um só; senão pelo nome idêntico (sem acento nem caixa). Dois iguais não se chuta. */
export function acharCliente(op: any, clientes: any[]): AcheiOCliente {
  const doc = soDigitos(op?.cnpj_faturamento);
  if (doc.length === 11 || doc.length === 14) {
    const porDoc = (clientes || []).filter(c => soDigitos(c.documento) === doc);
    if (porDoc.length === 1) return { situacao: 'achado', cliente: porDoc[0], por: 'documento' };
    if (porDoc.length > 1) return { situacao: 'ambiguo', cliente: null, por: 'documento' };
  }
  const nome = chaveDoNome(op?.cliente_nome);
  if (!nome) return { situacao: 'sem_nome', cliente: null, por: '' };
  const porNome = (clientes || []).filter(c => chaveDoNome(c.nome) === nome);
  if (porNome.length === 1) return { situacao: 'achado', cliente: porNome[0], por: 'nome' };
  return { situacao: porNome.length > 1 ? 'ambiguo' : 'sem_cadastro', cliente: null, por: 'nome' };
}

export type AcheiOItem = { situacao: 'achado' | 'sem_cadastro' | 'ambiguo'; item: any | null };

/** Liga a linha vendida a UM item do cadastro: pelo `item_id`; sem ele, pelo nome idêntico entre os itens ATIVOS (a mesma regra da BOM sugerida: dois iguais não se chuta). */
export function acharItem(linha: any, catalogo: any[]): AcheiOItem {
  if (linha?.item_id) {
    const it = (catalogo || []).find(c => String(c.id) === String(linha.item_id));
    return it ? { situacao: 'achado', item: it } : { situacao: 'sem_cadastro', item: null };
  }
  const nome = chaveDoNome(linha?.nome);
  if (!nome) return { situacao: 'sem_cadastro', item: null };
  const iguais = (catalogo || []).filter(c => c.ativo !== false && chaveDoNome(c.nome) === nome);
  if (iguais.length === 1) return { situacao: 'achado', item: iguais[0] };
  return { situacao: iguais.length > 1 ? 'ambiguo' : 'sem_cadastro', item: null };
}

export type AcheiAEmpresa = { situacao: 'achada' | 'sem_empresa' | 'desconhecida'; emitente: any | null };

/** A empresa que fatura: o `faturamento_empresa` da OP é o `codigo` do emitente ("ACN", "DETECH"), sem acento nem caixa. */
export function acharEmitente(op: any, emitentes: any[]): AcheiAEmpresa {
  const cod = chaveDoNome(op?.faturamento_empresa);
  if (!cod) return { situacao: 'sem_empresa', emitente: null };
  const e = (emitentes || []).find(x => chaveDoNome(x.codigo) === cod);
  return e ? { situacao: 'achada', emitente: e } : { situacao: 'desconhecida', emitente: null };
}

const textoDeFalta = (chave: string, rotulos: Record<string, string>) => rotulos[chave] || chave;

/** Junta o que falta para a OP virar nota. Não grava nem lê nada. */
export function prontidaoDaOp(op: any, ctx: ContextoDaProntidao): Prontidao {
  const pendencias: Pendencia[] = [];

  // ── empresa que fatura ──
  const emp = acharEmitente(op, ctx.emitentes);
  if (emp.situacao === 'sem_empresa') pendencias.push({ grupo: 'empresa', titulo: 'Empresa que fatura', faltas: ['a OP não diz qual empresa fatura (ACN ou DETECH)'] });
  else if (emp.situacao === 'desconhecida') pendencias.push({ grupo: 'empresa', titulo: `Empresa "${op?.faturamento_empresa}"`, faltas: ['não existe em Cadastros fiscais › Empresas'] });
  else {
    const f = faltasDoEmitente(emp.emitente);
    if (f.length) pendencias.push({ grupo: 'empresa', titulo: `Empresa ${emp.emitente.codigo}`, faltas: f });
  }

  // ── cliente ──
  const cli = acharCliente(op, ctx.clientes);
  if (cli.situacao === 'sem_nome') pendencias.push({ grupo: 'cliente', titulo: 'Cliente', faltas: ['a OP não tem o nome do cliente'] });
  else if (cli.situacao === 'sem_cadastro') pendencias.push({ grupo: 'cliente', titulo: `Cliente "${String(op?.cliente_nome || '').trim()}"`, faltas: ['não achei no cadastro de clientes com este nome (o nome da OP tem de ser o do cadastro)'] });
  else if (cli.situacao === 'ambiguo') pendencias.push({ grupo: 'cliente', titulo: `Cliente "${String(op?.cliente_nome || '').trim()}"`, faltas: [cli.por === 'documento' ? 'há mais de um cadastro com este CPF/CNPJ' : 'há mais de um cadastro com este nome: não sei qual é'] });
  else {
    const f: string[] = faltasDoCliente(ctx.fiscaisDosClientes.get(cli.cliente.id)).map(c => textoDeFalta(c, rotuloDoCliente));
    if (!documentoValido(cli.cliente.documento)) f.unshift('CPF/CNPJ do cadastro');
    if (f.length) pendencias.push({ grupo: 'cliente', titulo: `Cliente ${cli.cliente.nome}`, faltas: f });
  }

  // ── itens vendidos ──
  let conferidos = 0, ignorados = 0;
  const vistos = new Set<string>();   // o mesmo item em duas linhas conta uma vez só
  const linhas = linhasVendidas(op);
  for (const l of linhas) {
    const ach = acharItem(l, ctx.catalogo);
    const nome = String(l.nome || l.produto_codigo || 'item sem nome').trim();
    if (ach.situacao === 'sem_cadastro') { pendencias.push({ grupo: 'item', titulo: nome, faltas: ['não achei este item no cadastro de itens'] }); conferidos++; continue; }
    if (ach.situacao === 'ambiguo') { pendencias.push({ grupo: 'item', titulo: nome, faltas: ['há mais de um item com este nome no cadastro: ligue a linha ao item certo'] }); conferidos++; continue; }
    if (ehGenerico(ach.item)) { ignorados++; continue; }
    if (vistos.has(String(ach.item.id))) continue;
    vistos.add(String(ach.item.id));
    conferidos++;
    const f = faltasDoItem(ach.item, ctx.fiscaisDosItens.get(ach.item.id)).map(c => textoDeFalta(c, rotuloDoItem));
    if (f.length) pendencias.push({ grupo: 'item', titulo: `${ach.item.codigo ? ach.item.codigo + ' · ' : ''}${ach.item.nome}`, faltas: f });
  }
  // Sem nenhuma linha de produto não há como provar que a OP está pronta: "ninguém respondeu" nunca vale como "pronta".
  if (conferidos === 0) {
    pendencias.push({ grupo: 'item', titulo: 'Itens vendidos', faltas: [linhas.length ? 'a venda só tem serviço ou item genérico: confirme se a nota é de serviço' : 'a OP não tem itens vendidos lançados'] });
  }

  const totalDeFaltas = pendencias.reduce((s, p) => s + p.faltas.length, 0);
  return { situacao: pendencias.length ? 'faltam' : 'pronta', pendencias, totalDeFaltas, itensConferidos: conferidos, itensIgnorados: ignorados };
}

/** Os ids de cliente e de item que a leitura precisa buscar para conferir estas OPs: o que cada OP cita, e os nomes das linhas sem vínculo. */
export function oQueAsOpsCitam(ops: any[]) {
  const itemIds = new Set<string>(); const nomes = new Set<string>();
  for (const o of ops || []) for (const l of linhasVendidas(o)) {
    if (l.item_id) itemIds.add(String(l.item_id)); else { const n = chaveDoNome(l.nome); if (n) nomes.add(n); }
  }
  return { itemIds: [...itemIds], nomes: [...nomes] };
}

/** Quantas OPs estão prontas e quantas faltam (o cartão do alto do Faturamento). */
export function resumoDasProntidoes(prontidoes: (Prontidao | undefined | null)[]) {
  let prontas = 0, faltam = 0;
  for (const p of prontidoes || []) { if (!p) continue; if (p.situacao === 'pronta') prontas++; else faltam++; }
  return { prontas, faltam, total: prontas + faltam };
}
