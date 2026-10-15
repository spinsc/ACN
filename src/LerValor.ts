// @ts-nocheck
// Leitura do número que a pessoa digita num campo (valor em reais, quantidade). Saiu do NovaOpOsModal em 15/10/2026 para a tela de demandas
// (AcnTabShared) usar a mesma regra sem criar um ciclo de imports; o NovaOpOsModal continua exportando a função, então quem importava dele não muda.

// 7.x (14/10/2026): o valor digitado era lido tirando TODOS os pontos e trocando a vírgula por ponto — "1500.50" virava 150.050 (cem vezes mais) e texto ("abc", "R$ 45000", "12x") virava vazio, sem avisar.
// Agora: com vírgula, o ponto é separador de milhar ("45.000,50"); sem vírgula, ponto seguido de 3 dígitos é milhar ("45.000") e ponto seguido de 1 ou 2 dígitos é decimal ("1500.50"); "R$" é ignorado;
// o que não for número (ou for negativo) é recusado com a mensagem. Retorna { vazio } quando o campo está em branco.
export function lerValorDigitado(texto: any): { vazio?: true; valor?: number; invalido?: true } {
  const t = String(texto ?? '').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!t) return { vazio: true };
  let n: string;
  if (t.includes(',')) { if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(t)) return { invalido: true }; n = t.replace(/\./g, '').replace(',', '.'); }
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '');
  else if (/^\d+(\.\d{1,2})?$/.test(t)) n = t;
  else return { invalido: true };
  const v = parseFloat(n);
  return Number.isFinite(v) ? { valor: v } : { invalido: true };
}
