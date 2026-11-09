// @ts-nocheck
// Previsão do tempo da tela Início (09/11/2026): Open-Meteo, gratuito e sem cadastro, para Palhoça/SC (cidade escolhida pelo usuário). As contas estão em InicioModelo.ts.
// A resposta fica guardada por 30 minutos no navegador (quem troca de tela e volta não gasta outra consulta). Se o serviço cair, vale a última resposta guardada, avisando que é antiga;
// sem nada guardado a tela diz "indisponível" — nunca inventa número. Todo acesso ao armazenamento do navegador está em try/catch (janela privada ou dados bloqueados).
import { urlDoClima, montarClima, CIDADE_DO_CLIMA } from './InicioModelo';

const CHAVE = 'acn_inicio_clima_v1';
const VALIDADE_MS = 30 * 60 * 1000;
const ESPERA_MAXIMA_MS = 8000;

const lerGuardado = () => { try { const t = localStorage.getItem(CHAVE); return t ? JSON.parse(t) : null; } catch { return null; } };
const guardar = (dados: any) => { try { localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), cidade: CIDADE_DO_CLIMA.nome, dados })); } catch { /* sem armazenamento: segue sem guardar */ } };

/** `{ clima, antigo }` quando deu certo (antigo = é a resposta guardada, o serviço não respondeu agora) ou `{ erro }` quando não há nada para mostrar. */
export async function lerClima({ forcar = false } = {}): Promise<{ clima?: any; antigo?: boolean; erro?: string }> {
  const g = lerGuardado();
  const guardadoServe = g && g.cidade === CIDADE_DO_CLIMA.nome && g.dados;
  if (!forcar && guardadoServe && Date.now() - g.em < VALIDADE_MS) {
    const c = montarClima(g.dados);
    if (c) return { clima: c };
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ESPERA_MAXIMA_MS);
    const r = await fetch(urlDoClima(), { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('o serviço respondeu ' + r.status);
    const json = await r.json();
    const c = montarClima(json);
    if (!c) throw new Error('a resposta veio incompleta');
    guardar(json);
    return { clima: c };
  } catch (e: any) {
    if (guardadoServe) {
      const c = montarClima(g.dados);
      if (c) return { clima: c, antigo: true };
    }
    return { erro: String(e?.name === 'AbortError' ? 'o serviço demorou demais' : (e?.message || e)) };
  }
}
