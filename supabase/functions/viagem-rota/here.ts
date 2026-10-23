// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — rota e pedágio pelo HERE Routing v8 (pedido do usuário em 23/10/2026: "API que calcule distância, tempo e pedágio")
//
// Só a montagem do pedido e a conversão da resposta: sem rede e sem Deno, para poder ser testada à parte (o servidor está em index.ts).
//
// O que se sabe e o que NÃO se sabe (escrito pela documentação do HERE, sem teste com chave real — conferir na primeira rota brasileira):
//   • Os pontos do meio entram como "via" e o HERE quebra a rota em um trecho (section) para cada via: dá o km, o tempo e o pedágio de cada trecho da viagem.
//   • "return=summary,tolls" + "tolls[summaries]=total" põe o total do pedágio de cada trecho em sections[].summary.tolls.total { currency, value }.
//   • NÃO está confirmado na documentação que o HERE cobre as praças de pedágio do Brasil. Se não cobrir, a resposta vem sem total: o servidor devolve "pedágio não informado"
//     (e nunca R$ 0,00 como se fosse cálculo) e a tela pede para lançar à mão.
//   • O carro de passeio é o único veículo previsto aqui (caminhão paga por eixo e os parâmetros não foram confirmados).
// ─────────────────────────────────────────────────────────────────────────────

export type PontoLatLng = { lat: number; lng: number };
export type TrechoHere = { km: number; horas: number; pedagio: number | null };
export type RespostaHere = {
  km: number; horas: number; trechos: TrechoHere[];
  pedagio: { total: number | null; moeda: string; informado: boolean };
  avisos: string[];
};

export const MAXIMO_DE_PONTOS = 52;   // origem + paradas + volta; o HERE aceita até 50 pontos "via"

const num = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : NaN; };
const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const coord = (p: PontoLatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** O endereço do pedido: do primeiro ao último ponto, com os do meio como "via". A chave vai só aqui (nunca em log nem em resposta). */
export function urlDaRotaHere(pontos: PontoLatLng[], chave: string): string {
  if (!Array.isArray(pontos) || pontos.length < 2) throw new Error('são precisos ao menos dois pontos');
  const q = new URLSearchParams();
  q.set('transportMode', 'car');
  q.set('origin', coord(pontos[0]));
  q.set('destination', coord(pontos[pontos.length - 1]));
  pontos.slice(1, -1).forEach(p => q.append('via', coord(p)));
  q.set('return', 'summary,tolls');
  q.set('tolls[summaries]', 'total');
  q.set('currency', 'BRL');
  q.set('lang', 'pt-BR');
  q.set('apiKey', chave);
  return `https://router.hereapi.com/v8/routes?${q.toString()}`;
}

/** Confere o corpo recebido do navegador: lista de pontos com latitude e longitude de verdade. */
export function pontosValidos(corpo: any): PontoLatLng[] {
  const lista = corpo?.pontos;
  if (!Array.isArray(lista) || lista.length < 2) throw new Error('mande ao menos dois pontos (saída e uma parada)');
  if (lista.length > MAXIMO_DE_PONTOS) throw new Error(`pontos demais (${lista.length}); o máximo é ${MAXIMO_DE_PONTOS}`);
  return lista.map((p: any, i: number) => {
    const lat = num(p?.lat), lng = num(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`o ponto ${i + 1} não tem latitude e longitude válidas`);
    return { lat, lng };
  });
}

/** Converte a resposta do HERE: um trecho para cada par de pontos seguidos. Qualquer coisa fora do esperado vira erro com texto em português (nunca um número inventado). */
export function converterRespostaHere(json: any, quantidadeDePontos: number): RespostaHere {
  const rota = json?.routes?.[0];
  if (!rota) throw new Error('o HERE não achou uma rota entre estes pontos');
  const secoes: any[] = rota.sections;
  if (!Array.isArray(secoes) || secoes.length !== quantidadeDePontos - 1) {
    throw new Error(`o HERE devolveu ${Array.isArray(secoes) ? secoes.length : 0} trecho(s) e eram esperados ${quantidadeDePontos - 1}`);
  }
  const avisos: string[] = [];
  let moeda = '';
  const trechos: TrechoHere[] = secoes.map((s, i) => {
    const res = s?.summary ?? s?.travelSummary;
    const metros = num(res?.length), segundos = num(res?.duration);
    if (!Number.isFinite(metros) || !Number.isFinite(segundos)) throw new Error(`o trecho ${i + 1} veio sem distância ou tempo`);
    const total = res?.tolls?.total;
    let pedagio: number | null = null;
    if (total && total.value !== undefined && total.value !== null) {
      const v = num(total.value);
      if (!Number.isFinite(v) || v < 0) throw new Error(`o pedágio do trecho ${i + 1} veio com valor inválido`);
      pedagio = cent(v);
      if (!moeda) moeda = String(total.currency || '');
      else if (total.currency && String(total.currency) !== moeda) throw new Error('o pedágio veio em mais de uma moeda');
    }
    (s?.notices || []).forEach((n: any) => { const t = String(n?.title || n?.code || '').trim(); if (t && !avisos.includes(t)) avisos.push(t); });
    return { km: Math.round(metros / 100) / 10, horas: Math.round((segundos / 3600) * 100) / 100, pedagio };
  });
  const informado = trechos.some(t => t.pedagio !== null);
  const total = informado ? cent(trechos.reduce((s, t) => s + (t.pedagio || 0), 0)) : null;
  return {
    km: Math.round(trechos.reduce((s, t) => s + t.km, 0) * 10) / 10,
    horas: Math.round(trechos.reduce((s, t) => s + t.horas, 0) * 100) / 100,
    trechos, pedagio: { total, moeda: moeda || 'BRL', informado }, avisos,
  };
}
