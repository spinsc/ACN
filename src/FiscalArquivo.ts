// As regras PURAS do arquivo de notas emitidas (preparação do módulo fiscal, 26/11/2026): o que sai de uma nota lida para o banco, a situação de cada nota (emitida ou cancelada),
// a vigia da numeração (buraco, repetida, inutilizada) e a ligação da nota com a OP que o Fiscal digitou. Sem importar nada do projeto (roda direto no Node nos testes).
// As tabelas e a função de gravação estão em supabase/sql/fiscal_arquivo_de_notas.sql; a leitura e a gravação, em FiscalDados.ts.

export const soDigitos = (s: any): string => String(s ?? '').replace(/\D/g, '');

/** O dia como a nota o escreve ("2026-11-20T10:00:00-03:00" → "2026-11-20"): nunca passa por `new Date`, que devolveria o dia de Londres. */
export const emissaoDia = (s: any): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };

/** "000123" → 123; vazio ou com letra → null. */
export const numeroInteiro = (s: any): number | null => { const d = String(s ?? '').trim(); return /^\d{1,15}$/.test(d) ? Number(d) : null; };

/** Tira o acento, a caixa e as pontas ("Detech " → "DETECH"). */
export const normalizar = (s: any): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

// ── O que vai ao banco ──
type NotaLida = {
  chave: string; numero: string; serie: string; modelo: string; emitCnpj: string; emitNome: string; destDoc: string; destNome: string; destUf: string;
  natOp: string; finNFe: string; emissao: string; valorNF: number | null; autorizada: boolean | null; cStat: string; itens: any[]; arquivo: string; xml?: string;
};
type Achado = { regra: string; nivel: 'bloqueia' | 'alerta' };

/** A linha de `fiscal_guardar` para uma nota. `null` quando a nota não pode ser guardada (sem chave de 44 dígitos ou sem número): quem chama conta e avisa. */
export function registroDaNota(n: NotaLida, achados: Achado[], xml: string) {
  const chave = soDigitos(n.chave);
  const numero = numeroInteiro(n.numero);
  if (chave.length !== 44 || numero == null || !soDigitos(n.emitCnpj)) return null;
  return {
    chave, emitente_cnpj: soDigitos(n.emitCnpj), emitente_nome: n.emitNome || null, modelo: n.modelo || null, serie: numeroInteiro(n.serie), numero,
    emissao_dia: emissaoDia(n.emissao) || null, destinatario_doc: soDigitos(n.destDoc) || null, destinatario_nome: n.destNome || null, destinatario_uf: n.destUf || null,
    natureza: n.natOp || null, fin_nfe: n.finNFe || null, autorizada: n.autorizada, cstat: n.cStat || null, qtd_itens: (n.itens || []).length,
    bloqueios: achados.filter(a => a.nivel === 'bloqueia').length, alertas: achados.filter(a => a.nivel === 'alerta').length,
    regras: [...new Set(achados.map(a => a.regra))], arquivo: n.arquivo || null, valor_nf: n.valorNF == null ? null : n.valorNF, xml,
  };
}

export function registroDoEvento(e: { chave: string; tpEvento: string; sequencia: string; texto: string; data: string; cStat: string; arquivo: string }, xml: string) {
  const chave = soDigitos(e.chave);
  if (chave.length !== 44 || !e.tpEvento) return null;
  return { chave, tp_evento: e.tpEvento, sequencia: numeroInteiro(e.sequencia) ?? 1, data_dia: emissaoDia(e.data) || null, texto: e.texto || null, cstat: e.cStat || null, arquivo: e.arquivo || null, xml };
}

export function registroDaInutilizacao(i: { cnpj: string; serie: string; modelo: string; de: number; ate: number; ano: string; cStat: string; arquivo: string }, xml: string) {
  const serie = numeroInteiro(i.serie);
  if (!soDigitos(i.cnpj) || serie == null || !(i.de > 0) || !(i.ate >= i.de)) return null;
  return { cnpj: soDigitos(i.cnpj), serie, modelo: i.modelo || '55', de: i.de, ate: i.ate, ano: i.ano || null, cstat: i.cStat || null, arquivo: i.arquivo || null, xml };
}

// ── Situação ──
const CANCELAMENTO = '110111';
const SITUACAO_OK_DO_EVENTO = ['135', '136', '155'];   // o evento aceito pela SEFAZ (sem situação = o arquivo não a traz: vale)

/** As chaves das notas com cancelamento aceito. */
export const canceladas = (eventos: { chave: string; tp_evento: string; cstat?: string | null }[]): Set<string> =>
  new Set((eventos || []).filter(e => e.tp_evento === CANCELAMENTO && (!e.cstat || SITUACAO_OK_DO_EVENTO.includes(e.cstat))).map(e => e.chave));

export type Situacao = 'emitida' | 'cancelada' | 'sem_protocolo' | 'rejeitada';
export const ROTULO_DA_SITUACAO: Record<Situacao, string> = { emitida: 'Emitida', cancelada: 'Cancelada', sem_protocolo: 'Sem protocolo', rejeitada: 'Não autorizada' };

/** Cancelada vale mais que o protocolo (a nota foi autorizada e depois cancelada); sem protocolo = o XML guardado não trouxe a resposta da SEFAZ. */
export function situacaoDaNota(n: { chave: string; autorizada: boolean | null }, canceladasSet: Set<string>): Situacao {
  if (canceladasSet.has(n.chave)) return 'cancelada';
  if (n.autorizada === false) return 'rejeitada';
  if (n.autorizada == null) return 'sem_protocolo';
  return 'emitida';
}

// ── Numeração ──
export type Faixa = { de: number; ate: number };

/** Números soltos → faixas seguidas ([5,6,7,10] → 5–7 e 10). */
export function faixas(numeros: number[]): Faixa[] {
  const o = [...new Set(numeros)].sort((a, b) => a - b);
  const r: Faixa[] = [];
  for (const x of o) { const u = r[r.length - 1]; if (u && x === u.ate + 1) u.ate = x; else r.push({ de: x, ate: x }); }
  return r;
}
export const textoDaFaixa = (f: Faixa): string => (f.de === f.ate ? String(f.de) : `${f.de}–${f.ate}`);

export type GrupoDaNumeracao = {
  cnpj: string; serie: number; modelo: string; primeiro: number; ultimo: number; guardadas: number;
  faltam: number[]; faixasQueFaltam: Faixa[]; inutilizadas: number; repetidas: { numero: number; chaves: string[] }[];
};

/**
 * Para cada empresa + série + modelo: o que falta entre o MENOR e o MAIOR número guardado, descontando o que foi inutilizado e o que tem nota (cancelada também tem XML).
 * O arquivo só enxerga o que está dentro dele: se faltam XMLs antes do primeiro ou depois do último, a conta não os conhece (a tela diz isso).
 */
export function lacunasDaNumeracao(
  notas: { chave: string; emitente_cnpj: string; serie: number | null; modelo?: string | null; numero: number | string }[],
  inutilizacoes: { cnpj: string; serie: number; modelo?: string | null; de: number | string; ate: number | string }[],
): GrupoDaNumeracao[] {
  const grupos = new Map<string, { cnpj: string; serie: number; modelo: string; porNumero: Map<number, string[]> }>();
  for (const n of notas || []) {
    const num = Number(n.numero);
    if (!num || !n.emitente_cnpj || n.serie == null) continue;
    const modelo = n.modelo || '55';
    const k = `${soDigitos(n.emitente_cnpj)}|${n.serie}|${modelo}`;
    const g = grupos.get(k) || { cnpj: soDigitos(n.emitente_cnpj), serie: Number(n.serie), modelo, porNumero: new Map<number, string[]>() };
    g.porNumero.set(num, [...(g.porNumero.get(num) || []), n.chave]);
    grupos.set(k, g);
  }
  const saida: GrupoDaNumeracao[] = [];
  for (const g of grupos.values()) {
    const numeros = [...g.porNumero.keys()].sort((a, b) => a - b);
    const primeiro = numeros[0], ultimo = numeros[numeros.length - 1];
    const inut = (inutilizacoes || []).filter(i => soDigitos(i.cnpj) === g.cnpj && Number(i.serie) === g.serie && (i.modelo || '55') === g.modelo).map(i => ({ de: Number(i.de), ate: Number(i.ate) }));
    const faltam: number[] = [];
    let inutilizadas = 0;
    for (let x = primeiro; x <= ultimo; x++) {
      if (g.porNumero.has(x)) continue;
      if (inut.some(i => x >= i.de && x <= i.ate)) { inutilizadas++; continue; }
      faltam.push(x);
    }
    saida.push({
      cnpj: g.cnpj, serie: g.serie, modelo: g.modelo, primeiro, ultimo, guardadas: numeros.length, faltam, faixasQueFaltam: faixas(faltam), inutilizadas,
      repetidas: [...g.porNumero].filter(([, c]) => c.length > 1).map(([numero, chaves]) => ({ numero, chaves })),
    });
  }
  return saida.sort((a, b) => a.cnpj.localeCompare(b.cnpj) || a.serie - b.serie);
}

// ── Ligação com a OP ──
/** Os números de nota escritos no campo da OP ("11197", "A / B", "1670 e 1671"): cada sequência de dígitos é uma nota. */
export const numerosDaNotaDaOp = (texto: any): number[] => (String(texto ?? '').match(/\d+/g) || []).map(Number).filter(n => n > 0);

type OpComNota = { opl: string; numero_nf: string | null; faturamento_empresa?: string | null };

/**
 * A OP guarda o número da nota e o nome curto da empresa que faturou ("ACN", "Detech"); a nota guardada traz o CNPJ de quem emitiu. `codigoDoCnpj` diz de qual empresa é cada CNPJ
 * (as empresas emitentes cadastradas). Empresa vazia na OP vale para qualquer emitente (o número sozinho, com o risco de coincidir: a tela mostra todas as OPs achadas).
 */
export function opsDaNota(nota: { emitente_cnpj: string; numero: number | string }, ops: OpComNota[], codigoDoCnpj: Map<string, string>): OpComNota[] {
  const codigo = normalizar(codigoDoCnpj.get(soDigitos(nota.emitente_cnpj)) || '');
  return (ops || []).filter(o => {
    if (!numerosDaNotaDaOp(o.numero_nf).includes(Number(nota.numero))) return false;
    const emp = normalizar(o.faturamento_empresa);
    return !emp || !codigo || emp === codigo;
  });
}

/** As OPs que têm número de nota digitado e NENHUMA nota guardada com aquele número e empresa: são os XMLs que ainda faltam no arquivo. Uma linha por OP e número. */
export function opsSemXml(ops: OpComNota[], notas: { emitente_cnpj: string; numero: number | string }[], codigoDoCnpj: Map<string, string>) {
  const guardadas = new Map<string, Set<number>>();   // empresa normalizada ('' = desconhecida) → números
  const todas = new Set<number>();
  for (const n of notas || []) {
    const cod = normalizar(codigoDoCnpj.get(soDigitos(n.emitente_cnpj)) || '');
    const set = guardadas.get(cod) || new Set<number>(); set.add(Number(n.numero)); guardadas.set(cod, set); todas.add(Number(n.numero));
  }
  const linhas: { opl: string; empresa: string; numero: number }[] = [];
  for (const o of ops || []) {
    const emp = normalizar(o.faturamento_empresa);
    for (const numero of new Set(numerosDaNotaDaOp(o.numero_nf))) {
      const tem = emp ? (guardadas.get(emp)?.has(numero) || (guardadas.has('') && guardadas.get('')!.has(numero))) : todas.has(numero);
      if (!tem) linhas.push({ opl: o.opl, empresa: o.faturamento_empresa || '', numero });
    }
  }
  return linhas.sort((a, b) => a.empresa.localeCompare(b.empresa) || a.numero - b.numero || a.opl.localeCompare(b.opl));
}
