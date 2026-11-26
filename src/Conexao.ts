// ─────────────────────────────────────────────────────────────────────────────
// FAIXAS DE CONEXÃO — plano de migração para o servidor interno, item B4 (26/11/2026)
//
// Por quê: quando a internet do aparelho cai ou o servidor não responde, cada tela mostrava o seu erro (ou nada) e a pessoa não sabia
// se o que salvou foi gravado. Com a mudança de casa do sistema isso fica mais provável nos primeiros dias, então a avaliação de
// experiência de uso pediu um padrão só: uma faixa vermelha no topo da área da tela, com o que está acontecendo.
//
// Como: todo pedido ao banco passa pelo `fetch` do supabaseClient.ts, que avisa este módulo de cada resposta e de cada falha de rede;
// nenhuma das telas precisou mudar. Uma falha sozinha NÃO acende a faixa: ela dispara uma "sonda" (um pedido pequeno ao banco) e só
// a sonda falhando duas vezes seguidas (3 s de intervalo) acende "O sistema não está respondendo". Com a faixa acesa, a sonda se
// repete a cada 20 s (só com a aba à vista, `intervaloVisivel`) e qualquer resposta do servidor apaga a faixa.
// Fora do ar o que mais aparece é erro 502/503/504 do portão (o banco por trás não respondeu) ou a falha de rede pura; um erro 500
// com resposta do banco (ex.: uma consulta pesada que passou do tempo) também chama a sonda, que só acende a faixa se o banco não
// responder nem a ela.
//
// Interruptor: FAIXAS_DE_CONEXAO_LIGADAS = false devolve o comportamento de antes (nenhuma faixa e nenhuma sonda).
// ─────────────────────────────────────────────────────────────────────────────
import { intervaloVisivel } from './IntervaloVisivel';

export const FAIXAS_DE_CONEXAO_LIGADAS = true;

export type EstadoDaConexao = 'ok' | 'sem_internet' | 'sem_resposta' | 'voltou';

const SONDA_A_CADA_MS = 20000;     // texto da avaliação de UX: "nova tentativa a cada 20 s"
const SONDA_LIMITE_MS = 8000;      // a sonda que não responde em 8 s conta como falha
const SEGUNDA_SONDA_MS = 3000;     // a 1ª falha pode ser um soluço da rede: confere de novo antes de acender a faixa
const PEDIDO_PARADO_MS = 15000;    // pedido sem resposta há 15 s: confere se o servidor está de pé (a faixa sai em até ~25 s)
const VOLTOU_FICA_MS = 10000;      // o aviso verde de "a conexão voltou" some sozinho

let estado: EstadoDaConexao = 'ok';
const ouvintes = new Set<(e: EstadoDaConexao) => void>();
let sonda: { url: string } | null = null;
let relogioDaSonda: number | null = null;
let relogioDoVoltou: number | null = null;
let conferindo: Promise<boolean> | null = null;
let iniciado = false;

const emFalha = () => estado === 'sem_internet' || estado === 'sem_resposta';
const semInternetNoAparelho = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function mudar(novo: EstadoDaConexao) {
  if (novo === estado) return;
  estado = novo;
  if (relogioDoVoltou) { window.clearTimeout(relogioDoVoltou); relogioDoVoltou = null; }
  if (emFalha()) {
    if (!relogioDaSonda) relogioDaSonda = intervaloVisivel(() => { conferirServidor(); }, SONDA_A_CADA_MS);
  } else if (relogioDaSonda) { window.clearInterval(relogioDaSonda); relogioDaSonda = null; }
  if (novo === 'voltou') relogioDoVoltou = window.setTimeout(() => { relogioDoVoltou = null; if (estado === 'voltou') mudar('ok'); }, VOLTOU_FICA_MS);
  ouvintes.forEach(f => { try { f(novo); } catch { /* uma faixa com defeito não pode derrubar as outras */ } });
}

/** Um pedido pequeno ao banco. Qualquer resposta abaixo de 500 (até "sem permissão") prova que o servidor e o banco estão de pé.
 *  Sem cabeçalho próprio de propósito: assim o navegador não manda o pedido de licença antes (OPTIONS) e a sonda é um pedido só. */
async function sondar(): Promise<boolean> {
  if (!sonda) return true;
  try {
    const r: any = await Promise.race([
      fetch(sonda.url, { cache: 'no-store' }),
      new Promise((_, recusar) => window.setTimeout(() => recusar(new Error('a sonda passou do tempo')), SONDA_LIMITE_MS)),
    ]);
    return r.status < 500;
  } catch { return false; }
}

/** Confere se o servidor responde e acende ou apaga a faixa. Pedidos ao mesmo tempo dividem a mesma conferência.
 *  `nova`: o "Tentar agora" da faixa espera a conferência em andamento (que pode ter começado com o servidor ainda fora) e faz outra. */
export function conferirServidor(opcoes?: { nova?: boolean }): Promise<boolean> {
  if (!FAIXAS_DE_CONEXAO_LIGADAS || !sonda) return Promise.resolve(true);
  if (conferindo) return opcoes?.nova ? conferindo.then(() => conferirServidor()) : conferindo;
  conferindo = (async () => {
    try {
      let ok = await sondar();
      if (!ok && !emFalha()) { await new Promise(r => window.setTimeout(r, SEGUNDA_SONDA_MS)); ok = await sondar(); }
      if (ok) { if (emFalha()) mudar('voltou'); }
      else mudar(semInternetNoAparelho() ? 'sem_internet' : 'sem_resposta');
      return ok;
    } finally { conferindo = null; }
  })();
  return conferindo;
}

/** Chamado pelo fetch do supabaseClient a cada resposta. */
export function registrarResposta(status: number) {
  if (!FAIXAS_DE_CONEXAO_LIGADAS) return;
  if (status >= 500) { conferirServidor(); return; }
  if (emFalha()) mudar('voltou');
}

/** Chamado pelo fetch do supabaseClient quando o pedido nem chegou a ter resposta. Pedido cancelado de propósito não conta. */
export function registrarFalhaDeRede(erro: any) {
  if (!FAIXAS_DE_CONEXAO_LIGADAS) return;
  if (erro && erro.name === 'AbortError') return;
  if (semInternetNoAparelho()) { mudar('sem_internet'); return; }
  conferirServidor();
}

/** Liga o vigia de um pedido: se ele passar de 15 s sem resposta, confere o servidor. Devolve a função que desliga o vigia. */
export function vigiarPedido(): () => void {
  if (!FAIXAS_DE_CONEXAO_LIGADAS) return () => {};
  const t = window.setTimeout(() => { conferirServidor(); }, PEDIDO_PARADO_MS);
  return () => window.clearTimeout(t);
}

export function estadoDaConexao(): EstadoDaConexao { return estado; }

/** A faixa se inscreve aqui; devolve a função que cancela a inscrição. */
export function aoMudarConexao(f: (e: EstadoDaConexao) => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** O supabaseClient diz para onde a sonda pergunta (o mesmo banco das telas, com a chave pública no endereço: não mexe na sessão de ninguém). */
export function configurarSonda(url: string) {
  sonda = { url };
  if (iniciado || !FAIXAS_DE_CONEXAO_LIGADAS || typeof window === 'undefined') return;
  iniciado = true;
  window.addEventListener('offline', () => mudar('sem_internet'));
  window.addEventListener('online', () => { conferirServidor(); });
  // voltou à aba com a faixa acesa (o computador dormiu, a pessoa foi a outra aba): confere na hora, sem esperar a próxima batida
  document.addEventListener('visibilitychange', () => { if (!document.hidden && emFalha()) conferirServidor(); });
  if (semInternetNoAparelho()) mudar('sem_internet');
}
