// "Crachá" do banco (Etapa 17a, 12/10/2026): a sessão do Supabase que a função de servidor `entrar` devolve no login.
// Ela diz ao banco QUEM está chamando (funções usuario_atual_id(), perfil_atual() e eh_admin()), para a Etapa 17b poder fechar as tabelas por perfil.
// Na 17a nada exige o crachá: sem ele, ou com ele vencido e sem conseguir renovar, a tela segue com a chave pública, como sempre foi.
//
// Por que não o login pronto do cliente (supabase.auth): o sistema desliga de propósito o GoTrue do cliente (sem sessão guardada, sem renovação sozinha),
// porque ele travava em navegadores antigos (iOS 10 / Safari 10). Aqui é só guardar três campos e renovar com uma chamada simples.
const CHAVE_ARMAZENAMENTO = 'acn_sessao_banco';
const URL_BASE = 'https://qgemelnuqdilnggxmrdw.supabase.co';
// Etapa 17b (12/10/2026): interruptor da trava "sem crachá, sem entrar". DESLIGADO enquanto as tabelas ainda aceitam a chave pública; vira `true` na MESMA publicação
// da primeira tabela fechada (todo mundo precisa ter entrado de novo antes, e quem estiver com o usuário guardado e sem crachá vê a tela de entrada).
export const EXIGIR_CRACHA = false;

const MARGEM_SEGUNDOS = 60;   // renova um minuto antes de vencer

type Sessao = { access_token: string; refresh_token: string; expires_at: number };

let aoMudar: ((token: string | null) => void) | null = null;
/** O cliente do banco registra aqui o que fazer quando o crachá muda (avisar o canal de tempo real). */
export function aoMudarCracha(fn: (token: string | null) => void) { aoMudar = fn; }

function ler(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (!bruto) return null;
    const s = JSON.parse(bruto);
    return s && s.access_token && s.refresh_token && s.expires_at ? s : null;
  } catch { return null; }
}

/** Há um crachá guardado (mesmo vencido: a renovação o recupera)? */
export function temSessao(): boolean { return !!ler(); }

export function guardarSessao(s: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number }) {
  const expires_at = s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600));
  try { localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at })); } catch { /* sem armazenamento: segue sem crachá */ }
  esperarAte = 0;
  if (aoMudar) aoMudar(s.access_token);
}

export function limparSessao() {
  try { localStorage.removeItem(CHAVE_ARMAZENAMENTO); } catch { /* nada */ }
  if (aoMudar) aoMudar(null);
}

let renovando: Promise<string | null> | null = null;
let esperarAte = 0;   // depois de uma renovação que falhou por rede/servidor, não insiste por 30 segundos (cada chamada ao banco tentaria de novo)

/** O crachá válido agora, ou null (e aí a chamada vai com a chave pública). Renova sozinho perto de vencer; um crachá vencido nunca é enviado (o banco o recusaria). */
export function tokenAtual(chavePublica: string): Promise<string | null> {
  const s = ler();
  if (!s) return Promise.resolve(null);
  const agora = Math.floor(Date.now() / 1000);
  if (s.expires_at - agora > MARGEM_SEGUNDOS) return Promise.resolve(s.access_token);
  const semRenovar = s.expires_at > agora ? s.access_token : null;
  if (!renovando && Date.now() < esperarAte) return Promise.resolve(semRenovar);
  if (!renovando) {
    renovando = (async () => {
      try {
        const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { apikey: chavePublica, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (!r.ok) {
          // renovação recusada de vez (crachá revogado ou renovação já usada): descarta; falha passageira (rede, servidor): espera 30 segundos para tentar de novo
          if (r.status === 400 || r.status === 401 || r.status === 403) limparSessao();
          esperarAte = Date.now() + 30000;
          return semRenovar;
        }
        const t = await r.json();
        guardarSessao({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, expires_in: t.expires_in });
        return t.access_token as string;
      } catch {
        esperarAte = Date.now() + 30000;
        return semRenovar;
      } finally {
        renovando = null;
      }
    })();
  }
  return renovando;
}
