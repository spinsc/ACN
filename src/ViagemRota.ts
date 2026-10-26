// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — endereço e rota (pedido do usuário em 22/10/2026: "usar uma API para cálculo de km ida e volta, tempo de viagem e melhor rota com vários endereços e várias cidades")
//
// FONTES (escolha desta primeira versão, sem chave e sem cartão, a confirmar com o usuário):
//   • ENDEREÇO → coordenada: Nominatim (OpenStreetMap). Uso leve, uma consulta por vez; a política deles pede no máximo 1 por segundo.
//   • ROTA: OSRM (servidor público de demonstração). "route" para a ordem que a pessoa montou; "trip" para achar a melhor ordem das paradas (caixeiro-viajante).
//   Os dois aceitam chamada direto do navegador. Nenhum dos dois entrega PEDÁGIO nem tem garantia de disponibilidade.
//   PEDÁGIO: decidido com o usuário em 23/10/2026 — nenhum serviço que exija cadastro ou chave (HERE, TollGuru, Google, brasileiros pagos) entra no sistema; o pedágio é lançado à mão
//   (ViagemCalculo.ts). Uma tentativa com função de servidor + HERE foi construída e retirada no mesmo dia.
//
// Toda falha (sem internet, serviço fora do ar, endereço sem rota) vira um Error com texto em português: a tela mostra, nunca finge que calculou.
// ─────────────────────────────────────────────────────────────────────────────

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org';
const TEMPO_LIMITE_MS = 20000;

export type Ponto = { id?: string; texto: string; lat: number; lng: number };
export type PernaDaRota = { de: string; para: string; km: number; horas: number };
export type RotaCalculada = {
  km: number; horas: number; pernas: PernaDaRota[]; ordem: string[];   // ordem = ids das paradas, na sequência da rota
  assinatura: string; calculada_em: string; provedor: string; otimizada: boolean;
};

async function buscar(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`o serviço respondeu com erro ${r.status}`);
    return await r.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('o serviço demorou demais para responder');
    throw new Error(e?.message === 'Failed to fetch' ? 'sem conexão com o serviço de mapas' : (e?.message || 'falha na consulta'));
  } finally { clearTimeout(t); }
}

/** Procura um endereço ou cidade (Brasil) e devolve até 5 candidatos para a pessoa escolher. */
export async function buscarEndereco(texto: string): Promise<Ponto[]> {
  const q = String(texto || '').trim();
  if (q.length < 3) throw new Error('escreva ao menos 3 letras do endereço ou da cidade');
  const dados = await buscar(`${NOMINATIM}?format=jsonv2&limit=5&countrycodes=br&addressdetails=0&q=${encodeURIComponent(q)}`);
  return (Array.isArray(dados) ? dados : [])
    .map((d: any) => ({ texto: String(d.display_name || q), lat: Number(d.lat), lng: Number(d.lon) }))
    .filter((p: Ponto) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export type ResultadoDaBusca = { linha: string; candidatos: Ponto[]; erro: string };
const MAXIMO_DE_ENDERECOS_COLADOS = 25;

/** Separa o que foi colado: um endereço por linha (ou separados por ponto e vírgula), sem numeração nem marcadores no começo, sem linhas vazias nem repetidas. */
export function linhasDeEnderecos(texto: string): string[] {
  const vistos = new Set<string>();
  return String(texto || '').split(/[\r\n;]+/)
    .map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim())
    .filter(l => { if (!l) return false; const k = l.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, MAXIMO_DE_ENDERECOS_COLADOS);
}

/**
 * Procura vários endereços (pedido do usuário em 23/10/2026: "aceite diversos endereços"). A política do Nominatim pede no máximo 1 consulta por segundo, então as consultas saem em fila,
 * com `intervaloMs` entre elas. Cada linha tem o seu resultado: o que falhou não derruba o resto. `cancelado` interrompe a fila (devolve o que já foi feito).
 */
export async function buscarVariosEnderecos(linhas: string[], { aoAndar, cancelado, intervaloMs = 1100 }: { aoAndar?: (feitos: number, total: number) => void; cancelado?: () => boolean; intervaloMs?: number } = {}): Promise<ResultadoDaBusca[]> {
  const saida: ResultadoDaBusca[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (cancelado?.()) break;
    if (i > 0 && intervaloMs > 0) await new Promise(r => setTimeout(r, intervaloMs));
    if (cancelado?.()) break;
    try {
      const candidatos = await buscarEndereco(linhas[i]);
      saida.push({ linha: linhas[i], candidatos, erro: candidatos.length ? '' : 'nada encontrado' });
    } catch (e: any) {
      saida.push({ linha: linhas[i], candidatos: [], erro: e?.message || 'falha na consulta' });
    }
    aoAndar?.(i + 1, linhas.length);
  }
  return saida;
}

/** Um nome curto para mostrar na tela: o primeiro trecho (com o número, se for rua) e o estado. O texto completo continua na dica (title) e é o que fica gravado. */
export function nomeCurto(texto: string) {
  const p = String(texto || '').split(',').map(s => s.trim()).filter(Boolean);
  if (/^brasil$/i.test(p[p.length - 1] || '')) p.pop();
  if (/^\d{5}-?\d{3}$/.test(p[p.length - 1] || '')) p.pop();
  if (!p.length) return String(texto || '');
  const cabeca = /^\d+$/.test(p[0]) && p[1] ? `${p[1]} ${p[0]}` : p[0];
  const estado = p.length > 1 ? p[p.length - 1] : '';
  return [cabeca, estado !== cabeca ? estado : ''].filter(Boolean).join(', ');
}

/** Identifica o roteiro (pontos, ordem e opções): se mudar depois do cálculo, a rota guardada está velha. */
export function assinaturaDoRoteiro(origem: Ponto | null, paradas: Ponto[], idaEVolta: boolean, otimizar: boolean) {
  const p = (x: any) => `${Number(x?.lat).toFixed(5)},${Number(x?.lng).toFixed(5)}`;
  const lista = (paradas || []).map(p);
  if (otimizar) lista.sort();   // com a melhor ordem pedida, a ordem em que as paradas estão na tela não muda o resultado
  return [origem ? p(origem) : '-', ...lista, idaEVolta ? 'iv' : 'so-ida', otimizar ? 'ot' : 'fixa'].join('|');
}

/**
 * Calcula a rota: origem → paradas (→ origem, se ida e volta). Com `otimizar`, o servidor escolhe a melhor ordem das paradas e a função devolve essa ordem em `ordem`.
 */
export async function calcularRota({ origem, paradas, idaEVolta, otimizar }: { origem: Ponto; paradas: Ponto[]; idaEVolta: boolean; otimizar: boolean }): Promise<RotaCalculada> {
  if (!origem) throw new Error('escolha o ponto de saída');
  if (!paradas?.length) throw new Error('acrescente ao menos uma parada');
  const coord = (p: Ponto) => `${p.lng},${p.lat}`;
  const assinatura = assinaturaDoRoteiro(origem, paradas, idaEVolta, otimizar);
  const pontos = [origem, ...paradas];

  if (otimizar && paradas.length > 1) {
    const url = `${OSRM}/trip/v1/driving/${pontos.map(coord).join(';')}?roundtrip=${idaEVolta ? 'true' : 'false'}&source=first${idaEVolta ? '' : '&destination=any'}&overview=false&steps=false`;
    const d = await buscar(url);
    if (d.code !== 'Ok' || !d.trips?.[0]) throw new Error(d.message || 'o serviço não achou uma rota entre estes pontos');
    // waypoints[i] corresponde ao ponto i que enviamos; waypoint_index é a posição dele na rota
    const naRota = pontos.map((p, i) => ({ p, pos: d.waypoints?.[i]?.waypoint_index ?? i })).sort((a, b) => a.pos - b.pos).map(x => x.p);
    const ordenados = idaEVolta ? [...naRota, naRota[0]] : naRota;
    return montar(d.trips[0].legs, ordenados, assinatura, true, naRota.slice(1).map(p => String(p.id || '')));
  }

  const sequencia = idaEVolta ? [...pontos, origem] : pontos;
  const d = await buscar(`${OSRM}/route/v1/driving/${sequencia.map(coord).join(';')}?overview=false&steps=false`);
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error(d.message || 'o serviço não achou uma rota entre estes pontos');
  return montar(d.routes[0].legs, sequencia, assinatura, false, paradas.map(p => String(p.id || '')));
}

function montar(legs: any[], seq: Ponto[], assinatura: string, otimizada: boolean, ordem: string[]): RotaCalculada {
  if (!Array.isArray(legs) || legs.length !== seq.length - 1) throw new Error('a resposta do serviço de rotas veio incompleta');
  const pernas: PernaDaRota[] = legs.map((l: any, i: number) => ({
    de: seq[i].texto, para: seq[i + 1].texto, km: Math.round(Number(l.distance) / 100) / 10, horas: Math.round((Number(l.duration) / 3600) * 100) / 100,
  }));
  return {
    km: Math.round(pernas.reduce((s, p) => s + p.km, 0) * 10) / 10,
    horas: Math.round(pernas.reduce((s, p) => s + p.horas, 0) * 100) / 100,
    pernas, ordem, assinatura, calculada_em: new Date().toISOString(), provedor: 'OSRM', otimizada,
  };
}
