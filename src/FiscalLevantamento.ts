// Levantamento do histórico das notas emitidas (módulo fiscal, 27/11/2026). PURO: recebe as notas já lidas dos XMLs (FiscalXml.ts) e diz que operações existem DE FATO, quanto pesa cada uma
// e onde o MESMO caso saiu de jeitos diferentes. Serve para dar à contabilidade uma lista concreta para confirmar e, se a pessoa quiser, para abrir um rascunho de regras "a confirmar".
// Os XMLs ficam só no navegador de quem os soltou (nada é gravado aqui). O que sai deste arquivo é proposta: o histórico mostra o que foi feito, não o que está certo (as notas antigas
// podem ter erro; foi o que o próprio Conferidor achou). Nada vale como regra até a contabilidade confirmar e a versão ser aprovada (FiscalMotor.ts, supabase/sql/fiscal_regras.sql).
import { soDigitos } from './FiscalRegras.ts';
import { ORIGENS_DE_NOTA } from './FiscalTiposDeNota.ts';
import { FORM_DA_REGRA_VAZIO, chaveDasCondicoes, erroDaRegra, type FormDaRegra } from './FiscalMotor.ts';

export type Tratamento = { cfop: string; cst: string; pICMS: number | null; cBenef: string };
export type GrupoDoLevantamento = {
  chave: string;                 // situação + tratamento
  situacao: string;              // empresa | destino | IE | natureza | finalidade (o "mesmo caso")
  emitente: string;              // código da empresa cadastrada (ACN, DETECH) ou o CNPJ quando não está cadastrada
  emitenteCadastrado: boolean;
  destino: '' | 'dentro_uf' | 'fora_uf' | 'exterior';
  indicador_ie: '' | 'contribuinte' | 'isento' | 'nao_contribuinte';
  naturezaChave: string;
  natureza: string;              // a grafia mais usada
  finNFe: string;
  tratamento: Tratamento;
  itens: number;
  notas: number;
  exemplos: string[];            // números de até 3 notas
  ncms: { ncm: string; itens: number }[];   // os 3 NCM mais comuns
  variacao: boolean;             // o mesmo caso saiu com mais de um tratamento
};
export type NaturezaDoLevantamento = { chave: string; nome: string; grafias: string[]; notas: number; itens: number; acumulado: number };
export type Variacao = { situacao: string; emitente: string; destino: string; indicador_ie: string; natureza: string; tratamentos: (Tratamento & { itens: number; notas: number })[] };
export type Levantamento = {
  notasLidas: number; consideradas: number; canceladas: number; naoAutorizadas: number; semEmitenteCadastrado: number; itens: number;
  grupos: GrupoDoLevantamento[]; naturezas: NaturezaDoLevantamento[]; variacoes: Variacao[];
};

/** A natureza da operação sem acento, maiúscula e sem pontuação: as várias grafias da mesma coisa caem na mesma chave. */
export const chaveDaNatureza = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const DESTINOS: Record<string, GrupoDoLevantamento['destino']> = { '1': 'dentro_uf', '2': 'fora_uf', '3': 'exterior' };
const INDICADOR_DE_IE: Record<string, GrupoDoLevantamento['indicador_ie']> = { '1': 'contribuinte', '2': 'isento', '9': 'nao_contribuinte' };
export const ROTULO_DO_DESTINO: Record<string, string> = { dentro_uf: 'Dentro do estado', fora_uf: 'Outro estado', exterior: 'Exterior', '': 'Destino não informado' };
export const ROTULO_DA_IE: Record<string, string> = { contribuinte: 'Contribuinte', isento: 'Isento', nao_contribuinte: 'Não contribuinte', '': 'IE não informada' };

const chaveDoTratamento = (t: Tratamento) => [t.cfop, t.cst, t.pICMS ?? '', t.cBenef].join('|');
const mais = (m: Map<string, number>): string => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';

/**
 * Levanta as operações das notas. Só entram as notas que valeram: as canceladas (eventos de cancelamento lidos junto) e as que a SEFAZ não autorizou ficam de fora e são contadas.
 * `emitentes` = as empresas cadastradas ({ cnpj, codigo }); nota de empresa que não está no cadastro entra no levantamento mas não vira proposta de regra.
 */
export function levantar(notas: any[], opcoes: { emitentes?: { cnpj: string; codigo?: string }[]; canceladas?: Set<string> } = {}): Levantamento {
  const codigoDoCnpj = new Map((opcoes.emitentes || []).filter(e => e.cnpj && e.codigo).map(e => [soDigitos(e.cnpj), e.codigo as string]));
  const canceladas = opcoes.canceladas || new Set<string>();
  const lev: Levantamento = { notasLidas: notas.length, consideradas: 0, canceladas: 0, naoAutorizadas: 0, semEmitenteCadastrado: 0, itens: 0, grupos: [], naturezas: [], variacoes: [] };

  type Acum = { g: GrupoDoLevantamento; naturezas: Map<string, number>; notas: Set<string>; ncm: Map<string, number> };
  const acum = new Map<string, Acum>();
  const porNatureza = new Map<string, { grafias: Map<string, number>; notas: Set<string>; itens: number }>();

  notas.forEach((n, ordem) => {
    if (n.chave && canceladas.has(n.chave)) { lev.canceladas++; return; }
    if (n.autorizada === false) { lev.naoAutorizadas++; return; }
    lev.consideradas++;
    const cnpj = soDigitos(n.emitCnpj);
    const codigo = codigoDoCnpj.get(cnpj);
    if (!codigo) lev.semEmitenteCadastrado++;
    const destino = DESTINOS[String(n.idDest)] || '';
    const ie = INDICADOR_DE_IE[String(n.indIEDest)] || '';
    const nat = chaveDaNatureza(n.natOp);
    const idNota = n.chave || `${n.arquivo || ''}#${ordem}`;

    const pn = porNatureza.get(nat) || { grafias: new Map(), notas: new Set(), itens: 0 };
    pn.grafias.set(String(n.natOp || '').trim(), (pn.grafias.get(String(n.natOp || '').trim()) || 0) + 1); pn.notas.add(idNota); porNatureza.set(nat, pn);

    for (const i of n.itens || []) {
      lev.itens++; pn.itens++;
      const tratamento: Tratamento = { cfop: String(i.cfop || ''), cst: String(i.csosn || i.cst || ''), pICMS: i.pICMS ?? null, cBenef: String(i.cBenef || '') };
      const situacao = [codigo || cnpj, destino, ie, nat, n.finNFe || ''].join(' | ');
      const chave = situacao + ' || ' + chaveDoTratamento(tratamento);
      let a = acum.get(chave);
      if (!a) {
        a = { g: { chave, situacao, emitente: codigo || cnpj, emitenteCadastrado: !!codigo, destino, indicador_ie: ie, naturezaChave: nat, natureza: '', finNFe: String(n.finNFe || ''), tratamento, itens: 0, notas: 0, exemplos: [], ncms: [], variacao: false }, naturezas: new Map(), notas: new Set(), ncm: new Map() };
        acum.set(chave, a);
      }
      a.g.itens++;
      a.naturezas.set(String(n.natOp || '').trim(), (a.naturezas.get(String(n.natOp || '').trim()) || 0) + 1);
      if (!a.notas.has(idNota)) { a.notas.add(idNota); if (a.g.exemplos.length < 3 && n.numero) a.g.exemplos.push(String(n.numero)); }
      if (i.ncm) a.ncm.set(String(i.ncm), (a.ncm.get(String(i.ncm)) || 0) + 1);
    }
  });

  // naturezas, com o acumulado
  let soma = 0;
  lev.naturezas = [...porNatureza.entries()].map(([chave, v]) => ({ chave, nome: mais(v.grafias), grafias: [...v.grafias.keys()].filter(Boolean), notas: v.notas.size, itens: v.itens, acumulado: 0 }))
    .sort((a, b) => b.itens - a.itens || a.nome.localeCompare(b.nome));
  for (const n of lev.naturezas) { soma += n.itens; n.acumulado = lev.itens ? soma / lev.itens : 0; }

  // grupos e variações (o mesmo caso com mais de um tratamento)
  const tratamentosPorSituacao = new Map<string, Acum[]>();
  for (const a of acum.values()) { a.g.notas = a.notas.size; a.g.natureza = mais(a.naturezas); a.g.ncms = [...a.ncm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([ncm, itens]) => ({ ncm, itens })); tratamentosPorSituacao.set(a.g.situacao, [...(tratamentosPorSituacao.get(a.g.situacao) || []), a]); }
  for (const lista of tratamentosPorSituacao.values()) {
    if (lista.length < 2) continue;
    for (const a of lista) a.g.variacao = true;
    const g0 = lista[0].g;
    lev.variacoes.push({ situacao: g0.situacao, emitente: g0.emitente, destino: g0.destino, indicador_ie: g0.indicador_ie, natureza: g0.natureza,
      tratamentos: lista.map(a => ({ ...a.g.tratamento, itens: a.g.itens, notas: a.g.notas })).sort((x, y) => y.itens - x.itens) });
  }
  lev.variacoes.sort((a, b) => b.tratamentos.reduce((s, t) => s + t.itens, 0) - a.tratamentos.reduce((s, t) => s + t.itens, 0));
  lev.grupos = [...acum.values()].map(a => a.g).sort((a, b) => b.itens - a.itens || a.chave.localeCompare(b.chave));
  return lev;
}

/** Quanto das notas as N maiores situações cobrem (o "7 operações são 94%"): devolve a fração de itens. */
export function coberturaDosMaiores(lev: Levantamento, n: number): number {
  if (!lev.itens) return 0;
  return lev.grupos.slice(0, n).reduce((s, g) => s + g.itens, 0) / lev.itens;
}

// ── Propostas de regra ──
export type PropostaDeRegra = { chave: string; condicoes: { emitente: string; tipo_operacao: string; destino: string; indicador_ie: string }; resultado: Tratamento; itens: number; notas: number; naturezas: string[]; form: FormDaRegra };
export type PropostasDoLevantamento = { propostas: PropostaDeRegra[]; ambiguas: { condicoes: string; tratamentos: number; itens: number }[]; ignoradas: { motivo: string; itens: number }[] };

const rotuloDaOperacao = (id: string) => ORIGENS_DE_NOTA.find(o => o.id === id)?.origem || id;

/**
 * Propostas de regra a partir do histórico. A pessoa diz, para cada natureza de operação, QUAL operação do sistema ela é (`tipoPorNatureza`: natureza → id do mapa de origens).
 * Só vira proposta a situação (empresa, destino, IE do cliente, operação) em que TODAS as notas tiveram o MESMO tratamento; se saiu de jeitos diferentes, é "ambígua": falta uma condição
 * que a contabilidade conhece (NCM, tipo de órgão…) e o histórico não vira regra por escolha do sistema. Natureza sem operação escolhida, empresa fora do cadastro e destino não informado ficam de fora.
 */
export function propostasDoHistorico(lev: Levantamento, tipoPorNatureza: Record<string, string>): PropostasDoLevantamento {
  const ignoradas = new Map<string, number>();
  const ignora = (motivo: string, itens: number) => ignoradas.set(motivo, (ignoradas.get(motivo) || 0) + itens);
  const porCondicao = new Map<string, GrupoDoLevantamento[]>();
  for (const g of lev.grupos) {
    const tipo = tipoPorNatureza[g.naturezaChave] || '';
    if (!tipo) { ignora('natureza sem operação escolhida', g.itens); continue; }
    if (!g.emitenteCadastrado) { ignora('empresa que não está no cadastro de emitentes', g.itens); continue; }
    if (!g.destino) { ignora('nota sem destino informado', g.itens); continue; }
    const k = [g.emitente, tipo, g.destino, g.indicador_ie].join('|');
    porCondicao.set(k, [...(porCondicao.get(k) || []), g]);
  }
  const propostas: PropostaDeRegra[] = [];
  const ambiguas: PropostasDoLevantamento['ambiguas'] = [];
  for (const [k, lista] of porCondicao) {
    const [emitente, tipo, destino, ie] = k.split('|');
    const tratamentos = new Set(lista.map(g => chaveDoTratamento(g.tratamento)));
    const itens = lista.reduce((s, g) => s + g.itens, 0), notas = lista.reduce((s, g) => s + g.notas, 0);
    if (tratamentos.size > 1) { ambiguas.push({ condicoes: `${emitente} · ${rotuloDaOperacao(tipo)} · ${ROTULO_DO_DESTINO[destino]} · ${ROTULO_DA_IE[ie]}`, tratamentos: tratamentos.size, itens }); continue; }
    const t = lista[0].tratamento;
    const form: FormDaRegra = {
      ...FORM_DA_REGRA_VAZIO, rotulo: `Histórico: ${rotuloDaOperacao(tipo)} · ${emitente} · ${ROTULO_DO_DESTINO[destino]}${ie ? ' · ' + ROTULO_DA_IE[ie] : ''}`.slice(0, 160),
      emitente, tipo_operacao: tipo, destino, indicador_ie: ie, cfop: t.cfop, cst_csosn: t.cst, aliquota_icms_pct: t.pICMS === null ? '' : String(t.pICMS).replace('.', ','), cbenef: t.cBenef,
      observacao: `Proposta a partir de ${itens} item(ns) em ${notas} nota(s) já emitidas. É o que FOI feito, não necessariamente o certo: confirmar com a contabilidade.`,
    };
    // o que a regra não aceitaria gravar (CFOP ou CST ausente, cBenef fora do formato) não vira proposta: é nota com dado incompleto, não regra
    if (erroDaRegra(form)) { ignora('nota com tratamento incompleto (CFOP, CST ou benefício fora do formato)', itens); continue; }
    propostas.push({ chave: chaveDasCondicoes({ emitente, tipo_operacao: tipo, destino, indicador_ie: ie }), condicoes: { emitente, tipo_operacao: tipo, destino, indicador_ie: ie }, resultado: t, itens, notas, naturezas: [...new Set(lista.map(g => g.natureza))], form });
  }
  propostas.sort((a, b) => b.itens - a.itens);
  ambiguas.sort((a, b) => b.itens - a.itens);
  return { propostas, ambiguas, ignoradas: [...ignoradas.entries()].map(([motivo, itens]) => ({ motivo, itens })) };
}
