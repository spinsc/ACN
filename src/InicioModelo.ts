// @ts-nocheck
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TELA INÍCIO (09/11/2026, pedido do RH: um lugar para postar a imagem dos aniversariantes do mês). As regras da tela, sem tela nem banco, para ficarem testáveis.
// Datas são sempre texto AAAA-MM-DD, nunca `new Date("AAAA-MM-DD")` (que é a meia-noite de Londres e mostra o dia anterior): a conta de dias é feita em UTC.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { nomeSeguroDeArquivo } from './FormatosArquivo';

export const TAMANHO_MAXIMO_DA_IMAGEM = 5 * 1024 * 1024;        // o mesmo limite do bucket acn-inicio
export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];
export const SEGUNDOS_POR_SLIDE = 7;
export const MEDIDA_IDEAL_DA_IMAGEM = '1600 × 600 px';          // proporção 8:3, a do carrossel (a imagem é cortada ao centro se for diferente)

const dois = (n: number) => String(n).padStart(2, '0');
const dataUtc = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const isoDeUtc = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`; };

/** Soma (ou tira) dias de uma data AAAA-MM-DD. */
export function somarDias(iso: string, n: number): string {
  const ms = dataUtc(iso);
  return Number.isNaN(ms) ? '' : isoDeUtc(ms + n * 86400000);
}
/** Dias entre duas datas (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((dataUtc(b) - dataUtc(a)) / 86400000);
}
export const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export const diaDaSemana = (iso: string): number => new Date(dataUtc(iso)).getUTCDay();
export const diaCurto = (iso: string): string => DIAS_CURTOS[diaDaSemana(iso)] || '';
export const mesCurto = (iso: string): string => MESES_CURTOS[+String(iso).slice(5, 7) - 1] || '';
export const diaDoMes = (iso: string): number => +String(iso).slice(8, 10);
const ddmm = (iso: string) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

/** "segunda-feira, 9 de novembro de 2026" */
export function dataPorExtenso(iso: string): string {
  if (Number.isNaN(dataUtc(iso))) return '';
  return `${DIAS_DA_SEMANA[diaDaSemana(iso)]}, ${+iso.slice(8, 10)} de ${MESES[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;
}
/** Semana do ano pela regra ISO (a semana começa na segunda e a 1ª tem a primeira quinta-feira do ano). */
export function semanaIso(iso: string): number {
  const ms = dataUtc(iso);
  if (Number.isNaN(ms)) return 0;
  const d = new Date(ms);
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);                       // a quinta-feira da semana
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inicio) / 86400000 + 1) / 7);
}

/** "ANA PAULA DA SILVA" → "Ana Paula da Silva" (o cadastro guarda o nome em maiúsculas; "da", "de", "do", "e"… ficam em minúscula). */
export function nomeProprio(nome: any): string {
  const pequenas = ['da', 'de', 'do', 'das', 'dos', 'e'];
  return String(nome || '').trim().split(/\s+/).filter(Boolean)
    .map((p, i) => { const b = p.toLowerCase(); return i > 0 && pequenas.includes(b) ? b : b.charAt(0).toUpperCase() + b.slice(1); }).join(' ');
}
export const saudacao = (hora: number): string => (hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite');
/** "MATHEUS SPINELLI" → "Matheus" (o cadastro guarda o nome em maiúsculas). */
export function primeiroNome(nome: any): string {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

// ── Slides do carrossel ──────────────────────────────────────────────────────────────────────────────────

export type SituacaoDoSlide = 'rascunho' | 'agendado' | 'no_ar' | 'encerrado';
export const ROTULO_DA_SITUACAO: Record<SituacaoDoSlide, string> = { rascunho: 'Rascunho', agendado: 'Agendado', no_ar: 'No ar', encerrado: 'Encerrado' };

/** Rascunho nunca aparece; antes da data inicial está agendado; depois da data final está encerrado (sai do ar sozinho, mas a imagem fica guardada). */
export function situacaoDoSlide(slide: any, hoje: string): SituacaoDoSlide {
  if (slide?.rascunho) return 'rascunho';
  const de = String(slide?.exibir_de || '').slice(0, 10);
  const ate = String(slide?.exibir_ate || '').slice(0, 10);
  if (de && hoje < de) return 'agendado';
  if (ate && hoje > ate) return 'encerrado';
  return 'no_ar';
}
export function ordenarSlides(slides: any[]): any[] {
  return [...(slides || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
}
/**
 * O que o carrossel mostra hoje, na ordem escolhida. É igual para TODO usuário do sistema: regra do usuário em 09/11/2026 ("ver o carrossel: todos os usuários do sistema devem poder ver").
 * A primeira versão deixava quem posta limitar um slide a alguns perfis ("Quem vê"); isso saiu. A coluna `inicio_slides.perfis_alvo` ficou no banco, sem uso, e é ignorada aqui.
 */
export function slidesDoCarrossel(slides: any[], hoje: string): any[] {
  return ordenarSlides(slides).filter(s => situacaoDoSlide(s, hoje) === 'no_ar');
}
/** "03/11 a 30/11", "a partir de 01/12", "até 30/11" ou "sem data final". */
export function textoDoPeriodo(slide: any): string {
  const de = String(slide?.exibir_de || '').slice(0, 10);
  const ate = String(slide?.exibir_ate || '').slice(0, 10);
  if (de && ate) return `${ddmm(de)} a ${ddmm(ate)}`;
  if (de) return `a partir de ${ddmm(de)}`;
  if (ate) return `até ${ddmm(ate)}`;
  return 'sem data final';
}
/** A próxima posição livre na ordem. */
export const proximaOrdem = (slides: any[]): number => (slides || []).reduce((m, s) => Math.max(m, (s.ordem ?? 0) + 1), 0);
/**
 * Sobe (delta -1) ou desce (+1) um slide na ordem e devolve SÓ as linhas cuja posição mudou, já com a numeração 0, 1, 2… refeita (a ordem antiga podia ter números repetidos).
 * Já no topo (subindo) ou no fim (descendo) não muda nada.
 */
export function reordenar(slides: any[], id: string, delta: number): { id: string; ordem: number }[] {
  const lista = ordenarSlides(slides);
  const i = lista.findIndex(s => String(s.id) === String(id));
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova.map((s, k) => ({ id: s.id, ordem: k, antes: s.ordem })).filter(x => x.antes !== x.ordem).map(({ id, ordem }) => ({ id, ordem }));
}

/** O que a janela de postar confere antes de gravar (a primeira frase que falhar; vazio = pode gravar). */
export function erroDoSlide(f: any, { temImagem }: { temImagem: boolean }): string {
  if (!String(f?.titulo || '').trim()) return 'Dê um título ao slide (ele só aparece na lista de quem posta, não na imagem).';
  if (String(f?.titulo || '').trim().length > 120) return 'O título passou de 120 letras. Encurte.';
  if (!temImagem) return 'Escolha a imagem do slide.';
  const de = String(f?.exibir_de || ''), ate = String(f?.exibir_ate || '');
  if (de && Number.isNaN(dataUtc(de))) return 'A data inicial não é válida.';
  if (ate && Number.isNaN(dataUtc(ate))) return 'A data final não é válida.';
  if (de && ate && ate < de) return 'A data final não pode ser antes da data inicial.';
  if (f?.link_tipo === 'aba' && !String(f?.link_destino || '').trim()) return 'Escolha a tela do sistema que o slide abre, ou mude para "Não abre nada".';
  if (f?.link_tipo === 'url' && !endereco(f?.link_destino)) return 'O endereço da internet não é válido. Use um endereço completo, como https://www.exemplo.com.br.';
  return '';
}
/** Só endereço http ou https vale (nunca "javascript:"). Sem o começo, completa com https://. Devolve '' se não for um endereço. */
export function endereco(texto: any): string {
  const t = String(texto || '').trim();
  if (!t || /\s/.test(t)) return '';
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t;
  try {
    const u = new URL(comProtocolo);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return '';
    return u.toString();
  } catch { return ''; }
}
/** A imagem escolhida serve? Frase pronta (vermelha, "não foi possível") ou vazio. */
export function erroDaImagem(arquivo: { type?: string; size?: number; name?: string } | null | undefined): string {
  if (!arquivo) return '';
  if (!TIPOS_DE_IMAGEM.includes(String(arquivo.type || '').toLowerCase())) return 'Não foi possível usar este arquivo: a imagem precisa ser JPG, PNG ou WEBP.';
  if ((arquivo.size || 0) > TAMANHO_MAXIMO_DA_IMAGEM) return `Não foi possível usar esta imagem: ela tem ${((arquivo.size || 0) / 1048576).toFixed(1).replace('.', ',')} MB e o máximo é 5 MB. Reduza o tamanho e escolha de novo.`;
  if (!(arquivo.size || 0)) return 'Não foi possível usar este arquivo: ele está vazio.';
  return '';
}
/** Caminho da imagem no bucket: uma pasta por slide e o nome já seguro (o armazenamento recusa acento e símbolo). */
export const caminhoDaImagem = (idDoSlide: string, nomeOriginal: string, agora = Date.now()): string => `slides/${idDoSlide}/${agora}-${nomeSeguroDeArquivo(nomeOriginal)}`;

// ── Datas da empresa e feriados ──────────────────────────────────────────────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como AAAA-MM-DD. */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}
export type DataDoCalendario = { data: string; titulo: string; detalhe: string; tipo: 'feriado' | 'facultativo' | 'empresa'; hora?: string | null };
/** Feriados nacionais do ano e os pontos facultativos de costume (Carnaval e Corpus Christi). Não inclui feriado de estado nem de município. */
export function feriadosDoAno(ano: number): DataDoCalendario[] {
  const p = pascoa(ano);
  const fixos: [string, string][] = [
    ['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal'],
  ];
  const lista: DataDoCalendario[] = fixos.map(([md, titulo]) => ({ data: `${ano}-${md}`, titulo, detalhe: 'feriado nacional', tipo: 'feriado' as const }));
  lista.push({ data: somarDias(p, -2), titulo: 'Sexta-feira Santa', detalhe: 'feriado nacional', tipo: 'feriado' });
  lista.push({ data: somarDias(p, -48), titulo: 'Carnaval (segunda)', detalhe: 'ponto facultativo', tipo: 'facultativo' });
  lista.push({ data: somarDias(p, -47), titulo: 'Carnaval (terça)', detalhe: 'ponto facultativo', tipo: 'facultativo' });
  lista.push({ data: somarDias(p, 60), titulo: 'Corpus Christi', detalhe: 'ponto facultativo', tipo: 'facultativo' });
  return lista.sort((x, y) => x.data.localeCompare(y.data));
}
/** "15h" ou "15h30" a partir de "15:00" / "15:30". */
export function horaCurta(hora: any): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return '';
  return m[2] === '00' ? `${+m[1]}h` : `${+m[1]}h${m[2]}`;
}
/**
 * "Próximos dias": os feriados e as datas da empresa de hoje em diante, em ordem, até `limite` itens dentro de `dias` dias.
 * Cada item diz o dia da semana ("sexta-feira · feriado nacional" ou "15h · sala de treinamento").
 */
export function proximasDatas(hoje: string, datasDaEmpresa: any[], { limite = 5, dias = 60 } = {}): DataDoCalendario[] {
  const ano = +hoje.slice(0, 4);
  const ate = somarDias(hoje, dias);
  const feriados = [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)].map(f => ({ ...f, detalhe: `${DIAS_DA_SEMANA[diaDaSemana(f.data)]} · ${f.detalhe}` }));
  const empresa: DataDoCalendario[] = (datasDaEmpresa || []).map((d: any) => ({
    data: String(d.data).slice(0, 10), titulo: d.titulo, hora: d.hora || null, tipo: 'empresa' as const,
    detalhe: [horaCurta(d.hora), d.local].filter(Boolean).join(' · ') || DIAS_DA_SEMANA[diaDaSemana(String(d.data).slice(0, 10))],
  }));
  return [...feriados, ...empresa]
    .filter(x => x.data >= hoje && x.data <= ate)
    .sort((x, y) => x.data.localeCompare(y.data) || String(x.hora || '').localeCompare(String(y.hora || '')))
    .slice(0, limite);
}

/** "hoje", "amanhã" ou "qui, 12/11" para o aniversário daqui a `emDias` dias. */
export function rotuloDoAniversario(emDias: number, hoje: string): string {
  if (emDias === 0) return 'hoje';
  if (emDias === 1) return 'amanhã';
  const dia = somarDias(hoje, emDias);
  return `${diaCurto(dia)}, ${ddmm(dia)}`;
}
export function iniciais(nome: any): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// ── Previsão do tempo (Open-Meteo: gratuito, sem cadastro; o código de tempo é o padrão da OMM) ─────────────────

export const CIDADE_DO_CLIMA = { nome: 'Palhoça/SC', latitude: -27.6446, longitude: -48.6678 };   // decidido com o usuário em 09/11/2026
export type IconeDoClima = 'sol' | 'sol_nuvem' | 'nuvem' | 'chuva' | 'tempestade' | 'neblina' | 'neve';
export function climaDoCodigo(codigo: number): { texto: string; icone: IconeDoClima } {
  const c = Number(codigo);
  if (c === 0) return { texto: 'Céu limpo', icone: 'sol' };
  if (c === 1) return { texto: 'Predominantemente limpo', icone: 'sol' };
  if (c === 2) return { texto: 'Parcialmente nublado', icone: 'sol_nuvem' };
  if (c === 3) return { texto: 'Nublado', icone: 'nuvem' };
  if (c === 45 || c === 48) return { texto: 'Neblina', icone: 'neblina' };
  if (c >= 51 && c <= 57) return { texto: 'Garoa', icone: 'chuva' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { texto: c >= 80 ? 'Pancadas de chuva' : 'Chuva', icone: 'chuva' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { texto: 'Neve', icone: 'neve' };
  if (c >= 95 && c <= 99) return { texto: 'Tempestade', icone: 'tempestade' };
  return { texto: 'Tempo indefinido', icone: 'nuvem' };
}
export function urlDoClima(cidade = CIDADE_DO_CLIMA): string {
  const q = new URLSearchParams({
    latitude: String(cidade.latitude), longitude: String(cidade.longitude), timezone: 'America/Sao_Paulo', forecast_days: '6', wind_speed_unit: 'kmh',
    current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}
export type ClimaMontado = {
  agora: { temp: number; texto: string; icone: IconeDoClima; vento: number; umidade: number; max: number; min: number; chuva: number | null };
  dias: { data: string; rotulo: string; max: number; min: number; chuva: number | null; texto: string; icone: IconeDoClima }[];
};
/** A resposta do serviço vira o que a tela mostra; resposta incompleta devolve null (a tela diz "indisponível", nunca inventa número). */
export function montarClima(json: any): ClimaMontado | null {
  const c = json?.current, d = json?.daily;
  if (!c || !d || !Array.isArray(d.time) || !d.time.length) return null;
  const n = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (n(c.temperature_2m) == null || n(c.weather_code) == null) return null;
  const dias = d.time.map((data: string, i: number) => {
    const t = climaDoCodigo(d.weather_code?.[i]);
    return { data, rotulo: DIAS_CURTOS[diaDaSemana(data)], max: Math.round(n(d.temperature_2m_max?.[i]) ?? NaN), min: Math.round(n(d.temperature_2m_min?.[i]) ?? NaN), chuva: n(d.precipitation_probability_max?.[i]), texto: t.texto, icone: t.icone };
  }).filter((x: any) => Number.isFinite(x.max) && Number.isFinite(x.min));
  if (!dias.length) return null;
  const hoje = dias[0];
  const t = climaDoCodigo(c.weather_code);
  return { agora: { temp: Math.round(c.temperature_2m), texto: t.texto, icone: t.icone, vento: Math.round(n(c.wind_speed_10m) ?? 0), umidade: Math.round(n(c.relative_humidity_2m) ?? 0), max: hoje.max, min: hoje.min, chuva: hoje.chuva }, dias: dias.slice(1, 6) };
}
