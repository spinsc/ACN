// ─────────────────────────────────────────────────────────────────────────────
// VOLUMES DA EMBALAGEM (pedido do usuário em 03/11/2026)
//
// Antes, a janela de embalagem do Almoxarifado/Telecom tinha UM peso total, um número de volumes e UMA medida: com mais de uma caixa, a pessoa
// digitava a soma do peso e a medida de uma caixa só (ou escrevia as outras nas observações). Agora cada volume tem a sua linha (peso, altura,
// largura, comprimento). O que a Logística e o resto do sistema já liam continua igual e é calculado daqui: peso total = soma, volumes = quantas
// linhas, e as três medidas = as do MAIOR volume (a mesma escolha da venda composta, de 22/10/2026). Cada caixa vai descrita nas observações do
// pedido de frete, para a transportadora cotar com as medidas reais.
// ─────────────────────────────────────────────────────────────────────────────

export type Caixa = { peso: string; altura: string; largura: string; comprimento: string };

export const caixaVazia = (): Caixa => ({ peso: '', altura: '', largura: '', comprimento: '' });

const numero = (v: any): number => Number(String(v ?? '').replace(',', '.'));
const positivo = (v: any): boolean => numero(v) > 0;
const fmt = (v: any) => numero(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Só as linhas que a pessoa começou a preencher valem como volume; sempre sobra pelo menos uma (a janela nunca fica sem volume). */
export const caixasDoForm = (f: any): Caixa[] => (Array.isArray(f?.caixas) && f.caixas.length ? f.caixas : [caixaVazia()]);

/** Soma o peso, conta os volumes e escolhe as medidas do maior volume (pelo volume em cm³). Devolve texto, como os campos antigos esperam. */
export function totaisDasCaixas(caixas: Caixa[]): { peso_total: string; volumes: string; altura: string; largura: string; comprimento: string } {
  const lista = caixas || [];
  const peso = lista.reduce((t, c) => t + (numero(c.peso) || 0), 0);
  const cm3 = (c: Caixa) => (numero(c.altura) || 0) * (numero(c.largura) || 0) * (numero(c.comprimento) || 0);
  const maior = [...lista].sort((a, b) => cm3(b) - cm3(a))[0] || caixaVazia();
  return {
    peso_total: lista.some(c => positivo(c.peso)) ? String(Math.round(peso * 1000) / 1000) : '',
    volumes: String(lista.length || 1),
    altura: String(maior.altura ?? ''), largura: String(maior.largura ?? ''), comprimento: String(maior.comprimento ?? ''),
  };
}

/** O formulário com os campos de total e de medida já preenchidos a partir das caixas — é o que o resto da gravação lê. */
export const formComTotais = (f: any) => ({ ...f, ...totaisDasCaixas(caixasDoForm(f)) });

/** Mensagem do que falta (vazia se está tudo certo). Cada volume pede o peso e as três medidas: é com elas que a Logística cota o frete. */
export function validarCaixas(caixas: Caixa[]): string {
  const lista = caixas || [];
  if (!lista.length) return 'Informe pelo menos um volume.';
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    const rotulo = lista.length > 1 ? `Volume ${i + 1}` : 'A embalagem';
    if (!positivo(c.peso)) return `${rotulo}: informe o peso (kg).`;
    if (!(positivo(c.altura) && positivo(c.largura) && positivo(c.comprimento))) {
      return `${rotulo}: informe as três medidas (altura, largura e comprimento, em cm): é com elas que a Logística cota o frete.`;
    }
  }
  return '';
}

/** "Volume 1: 40 × 30 × 20 cm, 5 kg · Volume 2: …" — vazio quando há um volume só (as colunas do frete já dizem tudo). */
export function descricaoDasCaixas(caixas: Caixa[]): string {
  const lista = caixas || [];
  if (lista.length < 2) return '';
  return lista.map((c, i) => `Volume ${i + 1}: ${fmt(c.altura)} × ${fmt(c.largura)} × ${fmt(c.comprimento)} cm, ${fmt(c.peso)} kg`).join(' · ');
}
