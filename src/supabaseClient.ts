import { createClient } from '@supabase/supabase-js';
import { tokenAtual, aoMudarCracha } from './SessaoBanco';

const CHAVE_PUBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';

// Instancia unica compartilhada — evita "Multiple GoTrueClient instances"
export const supabase = createClient(
  'https://qgemelnuqdilnggxmrdw.supabase.co',
  CHAVE_PUBLICA,
  {
    // Desativa inicialização automática do GoTrue Auth — o app usa auth_usuarios,
    // não Supabase Auth. Sem isso, o client tenta buscar a sessão no boot
    // e pode travar em navegadores antigos (iOS 10 / Safari 10).
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Etapa 17a (12/10/2026): cada chamada leva o "crachá" do banco (sessão devolvida pela função `entrar`) quando a pessoa tem um válido; sem ele, vai a chave pública, como sempre.
    // Nada exige o crachá ainda (isso é a 17b). Ver SessaoBanco.ts.
    accessToken: () => tokenAtual(CHAVE_PUBLICA),
    // 22/10/2026: se o banco recusar por "JWT expired" (relógio do computador fora de hora, aba parada, crachá vencido no meio de uma chamada), renova o crachá e repete a
    // chamada UMA vez. A recusa acontece antes de qualquer gravação, então repetir é seguro mesmo em escrita.
    global: {
      fetch: async (entrada: any, opcoes?: any) => {
        const r = await fetch(entrada, opcoes);
        if (r.status !== 401) return r;
        let corpo = '';
        try { corpo = await r.clone().text(); } catch { /* sem corpo legível: devolve a resposta como veio */ }
        if (!/JWT expired/i.test(corpo)) return r;
        const novo = await tokenAtual(CHAVE_PUBLICA, true);
        if (!novo) return r;
        const cabecalhos = new Headers(opcoes?.headers || (typeof entrada !== 'string' && entrada?.headers) || undefined);
        cabecalhos.set('Authorization', 'Bearer ' + novo);
        return fetch(entrada, { ...(opcoes || {}), headers: cabecalhos });
      },
    },
    // Realtime: timeout menor e sem retry agressivo — evita travar no iOS 10
    realtime: {
      timeout: 8000,
      params: { heartbeatIntervalMs: 30000 },
    },
  }
);

// o canal de tempo real precisa saber quando o crachá muda (entrar, renovar, sair)
aoMudarCracha((token) => { try { supabase.realtime.setAuth(token); } catch { /* sem tempo real, nada a avisar */ } });
