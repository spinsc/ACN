// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Regras do campo de dinheiro (CampoMoeda.tsx). Pedido do usuário em 24/11/2026: "todo campo que espera valor monetário deve ser um input com
// tratamento de valor monetário" — até então eram caixas de texto livre (a pessoa podia escrever "abc" ou "R$ 45000") ou de número puro do navegador
// (que aceita "1e3" e não mostra o milhar).
//
// DECISÃO (minha, a confirmar): a pessoa digita em REAIS, com a vírgula só para os centavos ("45000" vira "45.000"; "1500,5" vira "1.500,5"), e não
// em centavos como a máscara que as Licitações já usavam ("45000" virando "450,00"): uma máscara de centavos erra cem vezes para menos quem está
// acostumado a digitar o valor inteiro, e erro de dinheiro não pode ser silencioso. As Licitações seguem com a máscara delas (não foram mexidas).
//
// O VALOR que o campo entrega a quem o usa é sempre o texto "canônico", com ponto decimal e sem milhar ("45000.5", "0.5", ""): é o mesmo que um
// campo de número do navegador entregaria, e `lerValorDigitado` (LerValor.ts) também o lê certo — então as telas que já liam o valor continuam
// lendo, e quem guarda número em estado continua com Number(valor).
// ─────────────────────────────────────────────────────────────────────────────
import { lerValorDigitado } from './LerValor';

/** Valor qualquer (texto digitado, número, texto do banco) → texto canônico com ponto decimal ("45000.5") ou '' se vazio/inválido. */
export function valorCanonico(v: any, casas = 2): string {
  const f = 10 ** casas;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? String(Math.round(v * f) / f) : '';
  // `lerValorDigitado` só aceita 1 ou 2 casas depois do ponto ("1500.5"); o canônico de 3 casas ("5.899", preço por litro) é lido aqui
  if (casas > 2 && /^\d+\.\d{3,}$/.test(String(v).trim())) return String(Math.round(Number(v) * f) / f);
  const r = lerValorDigitado(v);
  if (r.vazio || r.invalido || r.valor === undefined) return '';
  return String(Math.round(r.valor * f) / f);
}

/** Texto canônico ("45000.5") → o que se mostra quando o campo não está sendo digitado: "45.000,50". */
export function moedaParaExibir(v: any, casas = 2): string {
  const c = valorCanonico(v, casas);
  if (!c) return '';
  return Number(c).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, casas) });
}

/**
 * O que o campo mostra ENQUANTO a pessoa digita: só dígitos e uma vírgula, milhar com ponto, no máximo 2 casas depois da vírgula.
 * `colado`: o texto veio de "colar" — nesse caso "1500.50" é 1.500,50 (ponto com 1 ou 2 dígitos depois é decimal, a mesma regra do lerValorDigitado);
 * digitando, o ponto é só separador de milhar e é ignorado.
 */
export function mascararMoeda(digitado: any, colado = false, casas = 2): string {
  let s = String(digitado ?? '').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (colado && !s.includes(',') && new RegExp('^\\d+\\.\\d{1,' + casas + '}$').test(s)) s = s.replace('.', ',');
  s = s.replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  let inteiro = i < 0 ? s : s.slice(0, i);
  const decimais = i < 0 ? null : s.slice(i + 1).replace(/,/g, '').slice(0, casas);
  inteiro = inteiro.replace(/^0+(?=\d)/, '').slice(0, 13);
  if (i >= 0 && inteiro === '') inteiro = '0';
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimais === null ? inteiro : inteiro + ',' + decimais;
}

/** Posição do cursor depois de remascarar: mantém o cursor depois do mesmo número de dígitos/vírgula que ficavam antes dele. */
export function posicaoDoCursor(mascarado: string, qtdAntes: number): number {
  if (qtdAntes <= 0) return 0;
  let n = 0;
  for (let k = 0; k < mascarado.length; k++) {
    if (/[\d,]/.test(mascarado[k])) n++;
    if (n === qtdAntes) return k + 1;
  }
  return mascarado.length;
}
