// Motor das regras fiscais versionadas (módulo fiscal, Etapa 3, 27/11/2026). PURO: não lê nem grava nada (a leitura e a gravação são de FiscalRegrasDados.ts; as tabelas, em supabase/sql/fiscal_regras.sql).
// NADA aqui emite nota: dado um contexto (empresa, tipo de operação, destino, órgão, IE, NCM...), diz QUAL regra vale e o que ela manda (CFOP, CST, alíquota, benefício).
// Princípio decidido com o usuário em 27/11/2026: o motor nunca chuta. "Sem regra", "regra contraditória" e "faltam dados" são RESPOSTAS, nunca um valor inventado; e a regra que a contabilidade
// ainda não confirmou vem marcada, porque não vale para emitir. A conta de conflito é a MESMA da função do banco `fiscal_regras_conflitos` (o banco não confia na tela).
import { soDigitos } from './FiscalRegras.ts';

export type CampoDaCondicao = 'emitente' | 'tipo_operacao' | 'destino' | 'tipo_orgao' | 'indicador_ie' | 'ncm_prefixo' | 'origem_fiscal' | 'monofasico';

/** As condições de uma regra, na ordem da tela. Vazio = "qualquer". */
export const CAMPOS_DA_CONDICAO: { campo: CampoDaCondicao; rotulo: string }[] = [
  { campo: 'emitente', rotulo: 'Empresa que emite' },
  { campo: 'tipo_operacao', rotulo: 'Tipo de operação' },
  { campo: 'destino', rotulo: 'Destino' },
  { campo: 'tipo_orgao', rotulo: 'Tipo de órgão' },
  { campo: 'indicador_ie', rotulo: 'Inscrição estadual do cliente' },
  { campo: 'ncm_prefixo', rotulo: 'NCM começa com' },
  { campo: 'origem_fiscal', rotulo: 'Origem do item' },
  { campo: 'monofasico', rotulo: 'PIS/COFINS monofásico' },
];
const CAMPOS = CAMPOS_DA_CONDICAO.map(c => c.campo);
export const ROTULO_DO_CAMPO: Record<CampoDaCondicao, string> = Object.fromEntries(CAMPOS_DA_CONDICAO.map(c => [c.campo, c.rotulo])) as any;

export const OPCOES_DESTINO = [
  { valor: 'dentro_uf', rotulo: 'Dentro do estado da empresa (operação interna)' },
  { valor: 'fora_uf', rotulo: 'Outro estado (operação interestadual)' },
  { valor: 'exterior', rotulo: 'Exterior' },
] as const;
const ROTULO_DO_DESTINO: Record<string, string> = Object.fromEntries(OPCOES_DESTINO.map(o => [o.valor, o.rotulo]));
const ROTULO_DO_ORGAO: Record<string, string> = { nenhum: 'Não é órgão público', estadual_sc: 'Órgão estadual de SC', estadual_outro: 'Órgão estadual de outro estado', municipal: 'Órgão municipal', federal: 'Órgão federal' };
const ROTULO_DA_IE: Record<string, string> = { contribuinte: 'Contribuinte do ICMS', isento: 'Contribuinte isento', nao_contribuinte: 'Não contribuinte' };

const vazio = (v: any) => v === null || v === undefined || v === '';
/** O valor da condição, ou null quando a regra diz "qualquer". */
export const condicao = (r: any, c: CampoDaCondicao): string | null => (vazio(r?.[c]) ? null : String(r[c]));
const mesmo = (a: string, b: string) => a === b;

/** As duas regras podem valer ao mesmo tempo? (em cada condição, uma é "qualquer" ou as duas dizem o mesmo; no NCM, um prefixo contém o outro) */
export function compativeis(a: any, b: any): boolean {
  for (const c of CAMPOS) {
    const va = condicao(a, c), vb = condicao(b, c);
    if (va === null || vb === null) continue;
    if (c === 'ncm_prefixo' ? !(va.startsWith(vb) || vb.startsWith(va)) : !mesmo(va, vb)) return false;
  }
  return true;
}

/** `a` contém todas as condições de `b` (a é pelo menos tão específica quanto b). */
export function refina(a: any, b: any): boolean {
  for (const c of CAMPOS) {
    const vb = condicao(b, c);
    if (vb === null) continue;
    const va = condicao(a, c);
    if (va === null) return false;
    if (c === 'ncm_prefixo' ? !va.startsWith(vb) : !mesmo(va, vb)) return false;
  }
  return true;
}
/** `a` é MAIS específica que `b`: contém as condições de b e mais alguma. */
export const maisEspecifica = (a: any, b: any): boolean => refina(a, b) && !refina(b, a);

export const especificidade = (r: any): number => CAMPOS.filter(c => condicao(r, c) !== null).length;

const textoOuVazio = (v: any) => String(v ?? '').trim();
const numeroOuNulo = (v: any) => (vazio(v) ? null : Number(v));
/** O que a regra manda é igual? (resultado igual em regras que se sobrepõem não faz mal) */
export function mesmoResultado(a: any, b: any): boolean {
  return a.cfop === b.cfop && a.cst_csosn === b.cst_csosn && numeroOuNulo(a.aliquota_icms_pct) === numeroOuNulo(b.aliquota_icms_pct)
    && textoOuVazio(a.cbenef) === textoOuVazio(b.cbenef) && textoOuVazio(a.informacao_complementar) === textoOuVazio(b.informacao_complementar)
    && !!a.exige_nota_referenciada === !!b.exige_nota_referenciada;
}

/** A chave das condições (duas regras com a mesma chave são a mesma situação escrita duas vezes). */
export const chaveDasCondicoes = (r: any): string => CAMPOS.map(c => condicao(r, c) ?? '').join('|');

/** Pares de regras que valem juntas, nenhuma é mais específica que a outra e mandam coisas diferentes. */
export function conflitosDaVersao(regras: any[]): { a: any; b: any }[] {
  const pares: { a: any; b: any }[] = [];
  for (let i = 0; i < regras.length; i++) for (let j = i + 1; j < regras.length; j++) {
    const a = regras[i], b = regras[j];
    if (compativeis(a, b) && !refina(a, b) && !refina(b, a) && !mesmoResultado(a, b)) pares.push({ a, b });
  }
  return pares;
}

/** O que falta resolver para a versão poder ser aprovada (a mesma exigência do banco; vazio = pode). */
export function problemasParaAprovar(regras: any[]): string[] {
  const p: string[] = [];
  if (!regras.length) { p.push('A versão não tem nenhuma regra.'); return p; }
  const naoConfirmadas = regras.filter(r => !r.confirmada);
  if (naoConfirmadas.length) p.push(`${naoConfirmadas.length} regra(s) ainda a confirmar com a contabilidade: ${naoConfirmadas.slice(0, 4).map(r => r.rotulo).join(', ')}${naoConfirmadas.length > 4 ? '…' : ''}.`);
  const semFonte = regras.filter(r => r.confirmada && textoOuVazio(r.fonte).length < 3);
  if (semFonte.length) p.push(`${semFonte.length} regra(s) confirmada(s) sem dizer a fonte (onde está escrito): ${semFonte.slice(0, 4).map(r => r.rotulo).join(', ')}.`);
  const vistas = new Map<string, any>();
  for (const r of regras) { const k = chaveDasCondicoes(r); if (vistas.has(k)) p.push(`As regras "${vistas.get(k).rotulo}" e "${r.rotulo}" têm as mesmas condições.`); else vistas.set(k, r); }
  for (const { a, b } of conflitosDaVersao(regras)) p.push(`"${a.rotulo}" e "${b.rotulo}" valem ao mesmo tempo, mandam coisas diferentes e nenhuma é mais específica que a outra.`);
  return p;
}

// ── Formulário da regra ──
export type FormDaRegra = {
  rotulo: string; emitente: string; tipo_operacao: string; destino: string; tipo_orgao: string; indicador_ie: string; ncm_prefixo: string; origem_fiscal: string; monofasico: string;
  cfop: string; cst_csosn: string; aliquota_icms_pct: string; cbenef: string; informacao_complementar: string; exige_nota_referenciada: boolean; confirmada: boolean; fonte: string; observacao: string;
};
export const FORM_DA_REGRA_VAZIO: FormDaRegra = {
  rotulo: '', emitente: '', tipo_operacao: '', destino: '', tipo_orgao: '', indicador_ie: '', ncm_prefixo: '', origem_fiscal: '', monofasico: '',
  cfop: '', cst_csosn: '', aliquota_icms_pct: '', cbenef: '', informacao_complementar: '', exige_nota_referenciada: false, confirmada: false, fonte: '', observacao: '',
};
export function formDaRegra(l: any): FormDaRegra {
  if (!l) return { ...FORM_DA_REGRA_VAZIO };
  return {
    rotulo: l.rotulo ?? '', emitente: l.emitente ?? '', tipo_operacao: l.tipo_operacao ?? '', destino: l.destino ?? '', tipo_orgao: l.tipo_orgao ?? '', indicador_ie: l.indicador_ie ?? '',
    ncm_prefixo: l.ncm_prefixo ?? '', origem_fiscal: l.origem_fiscal === null || l.origem_fiscal === undefined ? '' : String(l.origem_fiscal),
    monofasico: l.monofasico === true ? 'sim' : l.monofasico === false ? 'nao' : '', cfop: l.cfop ?? '', cst_csosn: l.cst_csosn ?? '',
    aliquota_icms_pct: l.aliquota_icms_pct === null || l.aliquota_icms_pct === undefined ? '' : String(l.aliquota_icms_pct).replace('.', ','),
    cbenef: l.cbenef ?? '', informacao_complementar: l.informacao_complementar ?? '', exige_nota_referenciada: !!l.exige_nota_referenciada, confirmada: !!l.confirmada, fonte: l.fonte ?? '', observacao: l.observacao ?? '',
  };
}
const aliquotaLida = (v: string): number | null | 'ruim' => {
  const t = String(v ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : 'ruim';
};
export function erroDaRegra(f: FormDaRegra): string | null {
  if (textoOuVazio(f.rotulo).length < 3) return 'Dê um nome à regra (3 letras ou mais), para a equipe saber a que situação ela se refere.';
  if (f.ncm_prefixo && !/^[0-9]{2,8}$/.test(soDigitos(f.ncm_prefixo)) ) return 'O NCM da condição tem de ter de 2 a 8 números.';
  if (!/^[0-9]{4}$/.test(soDigitos(f.cfop))) return 'O CFOP tem 4 números (ex.: 5102).';
  if (!/^[0-9]{2,3}$/.test(soDigitos(f.cst_csosn))) return 'O CST (2 números) ou CSOSN (3 números) é obrigatório.';
  if (aliquotaLida(f.aliquota_icms_pct) === 'ruim') return 'A alíquota de ICMS tem de ser um número de 0 a 100.';
  if (f.cbenef && !/^[A-Za-z0-9]{8,10}$/.test(f.cbenef.trim())) return 'O código de benefício fiscal (cBenef) tem de 8 a 10 letras e números.';
  if (f.confirmada && textoOuVazio(f.fonte).length < 3) return 'Regra confirmada precisa dizer a fonte: quem da contabilidade confirmou e onde está escrito.';
  return null;
}
export function regraParaGravar(f: FormDaRegra, versaoId: string) {
  const ali = aliquotaLida(f.aliquota_icms_pct);
  return {
    versao_id: versaoId, rotulo: f.rotulo.trim(), emitente: f.emitente || null, tipo_operacao: f.tipo_operacao || null, destino: f.destino || null, tipo_orgao: f.tipo_orgao || null,
    indicador_ie: f.indicador_ie || null, ncm_prefixo: f.ncm_prefixo ? soDigitos(f.ncm_prefixo) : null, origem_fiscal: f.origem_fiscal === '' ? null : Number(f.origem_fiscal),
    monofasico: f.monofasico === 'sim' ? true : f.monofasico === 'nao' ? false : null, cfop: soDigitos(f.cfop), cst_csosn: soDigitos(f.cst_csosn),
    aliquota_icms_pct: ali === 'ruim' ? null : ali, cbenef: f.cbenef.trim() ? f.cbenef.trim().toUpperCase() : null, informacao_complementar: f.informacao_complementar.trim() || null,
    exige_nota_referenciada: !!f.exige_nota_referenciada, confirmada: !!f.confirmada, fonte: f.fonte.trim() || null, observacao: f.observacao.trim() || null,
  };
}

/** "Dentro do estado · venda de mercadoria · NCM 8512…" — as condições da regra em frase, para a lista. */
export function resumoDasCondicoes(r: any, nomeDaOperacao?: (id: string) => string): string[] {
  const partes: string[] = [];
  const e = condicao(r, 'emitente'); if (e) partes.push(`Empresa ${e}`);
  const o = condicao(r, 'tipo_operacao'); if (o) partes.push(nomeDaOperacao ? nomeDaOperacao(o) : o);
  const d = condicao(r, 'destino'); if (d) partes.push(ROTULO_DO_DESTINO[d] || d);
  const g = condicao(r, 'tipo_orgao'); if (g) partes.push(ROTULO_DO_ORGAO[g] || g);
  const i = condicao(r, 'indicador_ie'); if (i) partes.push(ROTULO_DA_IE[i] || i);
  const n = condicao(r, 'ncm_prefixo'); if (n) partes.push(`NCM ${n}…`);
  const og = condicao(r, 'origem_fiscal'); if (og) partes.push(`Origem ${og}`);
  const m = condicao(r, 'monofasico'); if (m) partes.push(m === 'true' ? 'Monofásico' : 'Não monofásico');
  return partes;
}

// ── Escolher a regra ──
export type ContextoDaRegra = {
  emitente?: string | null; tipo_operacao?: string | null; destino?: string | null; tipo_orgao?: string | null; indicador_ie?: string | null;
  ncm?: string | null; origem_fiscal?: number | string | null; monofasico?: boolean | string | null;
};
export type EscolhaDaRegra = {
  situacao: 'achou' | 'sem_regra' | 'conflito' | 'faltam_dados';
  regra: any | null;
  candidatas: any[];                 // as regras que valem para o contexto (mais de uma só no conflito)
  faltam: CampoDaCondicao[];         // o que o contexto não diz e poderia mudar a resposta
  confirmada: boolean;               // a regra escolhida está confirmada pela contabilidade (se não, não vale para emitir)
  porque: string;
};

/** Como o contexto diz o valor da condição: texto, ou null quando não se sabe. */
function valorDoContexto(ctx: ContextoDaRegra, c: CampoDaCondicao): string | null {
  const bruto = c === 'ncm_prefixo' ? ctx.ncm : (ctx as any)[c];
  if (vazio(bruto)) return null;
  if (c === 'ncm_prefixo') { const d = soDigitos(bruto); return d || null; }
  if (c === 'monofasico') return bruto === true || bruto === 'true' || bruto === 'sim' ? 'true' : bruto === false || bruto === 'false' || bruto === 'nao' ? 'false' : null;
  return String(bruto);
}

/**
 * Qual regra vale para o contexto. Nunca chuta:
 *  - `achou`: uma regra (a mais específica entre as que valem) e nenhuma regra mais específica depende de um dado que o contexto não tem;
 *  - `faltam_dados`: uma regra poderia valer, ou poderia ser trocada por outra mais específica, se o contexto dissesse mais (diz o quê);
 *  - `conflito`: duas regras valem, nenhuma é mais específica e mandam coisas diferentes;
 *  - `sem_regra`: nenhuma regra serve (a contabilidade ainda não disse o que fazer nesta situação).
 */
export function escolherRegra(ctx: ContextoDaRegra, regras: any[]): EscolhaDaRegra {
  const casam: any[] = [];
  const possiveis: { r: any; faltam: CampoDaCondicao[] }[] = [];
  for (const r of regras) {
    let nao = false; const faltam: CampoDaCondicao[] = [];
    for (const c of CAMPOS) {
      const rv = condicao(r, c);
      if (rv === null) continue;
      const cv = valorDoContexto(ctx, c);
      if (cv === null) { faltam.push(c); continue; }
      if (c === 'ncm_prefixo') {
        if (cv.startsWith(rv)) continue;
        if (rv.startsWith(cv)) { faltam.push(c); continue; }   // NCM informado curto demais para decidir
        nao = true; break;
      }
      if (!mesmo(cv, rv)) { nao = true; break; }
    }
    if (nao) continue;
    if (faltam.length) possiveis.push({ r, faltam }); else casam.push(r);
  }
  const melhores = casam.filter(c => !casam.some(o => o !== c && maisEspecifica(o, c)));
  const nenhuma = (porque: string, faltam: CampoDaCondicao[] = []): EscolhaDaRegra => ({ situacao: faltam.length ? 'faltam_dados' : 'sem_regra', regra: null, candidatas: [], faltam, confirmada: false, porque });
  const unicos = (l: CampoDaCondicao[]) => [...new Set(l)];

  if (!melhores.length) {
    if (possiveis.length) {
      const faltam = unicos(possiveis.flatMap(p => p.faltam));
      return nenhuma(`Nenhuma regra serve com o que se sabe, mas ${possiveis.length} poderia(m) valer se o contexto dissesse: ${faltam.map(f => ROTULO_DO_CAMPO[f].toLowerCase()).join(', ')}.`, faltam);
    }
    return nenhuma(regras.length ? 'Nenhuma regra desta versão serve para esta situação: a contabilidade ainda não disse o que fazer aqui.' : 'Esta versão não tem regra nenhuma.');
  }
  if (melhores.length > 1 && !melhores.every(m => mesmoResultado(m, melhores[0]))) {
    return { situacao: 'conflito', regra: null, candidatas: melhores, faltam: [], confirmada: false, porque: `${melhores.length} regras valem ao mesmo tempo e mandam coisas diferentes: ${melhores.map(m => `"${m.rotulo}"`).join(', ')}. Resolva antes de aprovar a versão.` };
  }
  const regra = melhores[0];
  const maisFinas = possiveis.filter(p => maisEspecifica(p.r, regra));
  if (maisFinas.length) {
    const faltam = unicos(maisFinas.flatMap(p => p.faltam));
    return { situacao: 'faltam_dados', regra, candidatas: melhores, faltam, confirmada: !!regra.confirmada, porque: `A regra "${regra.rotulo}" serve, mas outra mais específica poderia valer se o contexto dissesse: ${faltam.map(f => ROTULO_DO_CAMPO[f].toLowerCase()).join(', ')}.` };
  }
  return { situacao: 'achou', regra, candidatas: melhores, faltam: [], confirmada: !!regra.confirmada, porque: regra.confirmada ? `Vale a regra "${regra.rotulo}" (confirmada: ${regra.fonte}).` : `Vale a regra "${regra.rotulo}", mas a contabilidade ainda não a confirmou: ela NÃO vale para emitir.` };
}

// ── O que mudou entre duas versões ──
export type MudancaDeRegra = { tipo: 'nova' | 'tirada' | 'mudou'; regra: any; antes?: any; campos?: string[] };
const CAMPOS_DO_RESULTADO: [string, string][] = [['rotulo', 'nome'], ['cfop', 'CFOP'], ['cst_csosn', 'CST/CSOSN'], ['aliquota_icms_pct', 'alíquota'], ['cbenef', 'cBenef'], ['informacao_complementar', 'informação complementar'], ['exige_nota_referenciada', 'exige nota referenciada'], ['confirmada', 'confirmação'], ['fonte', 'fonte']];
const igualCampo = (k: string, a: any, b: any) => (k === 'aliquota_icms_pct' ? numeroOuNulo(a) === numeroOuNulo(b) : k === 'exige_nota_referenciada' || k === 'confirmada' ? !!a === !!b : textoOuVazio(a) === textoOuVazio(b));
/** As regras de `novas` comparadas com as de `antigas`, casando pela chave das condições. */
export function compararVersoes(antigas: any[], novas: any[]): MudancaDeRegra[] {
  const antes = new Map(antigas.map(r => [chaveDasCondicoes(r), r]));
  const agora = new Map(novas.map(r => [chaveDasCondicoes(r), r]));
  const lista: MudancaDeRegra[] = [];
  for (const [k, r] of agora) {
    const a = antes.get(k);
    if (!a) { lista.push({ tipo: 'nova', regra: r }); continue; }
    const campos = CAMPOS_DO_RESULTADO.filter(([c]) => !igualCampo(c, a[c], r[c])).map(([, rot]) => rot);
    if (campos.length) lista.push({ tipo: 'mudou', regra: r, antes: a, campos });
  }
  for (const [k, a] of antes) if (!agora.has(k)) lista.push({ tipo: 'tirada', regra: a });
  return lista;
}
