// Supabase Edge Function — viagem-rota
// (23/10/2026) Rota com km, tempo e PEDÁGIO para o módulo Viagens, pelo HERE Routing v8. A chave do provedor fica aqui, como segredo (HERE_API_KEY), e nunca vai ao navegador.
//
// Por que existe: a chave do provedor é cobrada por uso; se estivesse na página (que é pública), qualquer pessoa gastaria a cota. Por isso a função só atende quem ENTROU no sistema:
// ela repete, com o crachá de quem chamou, a pergunta `public.esta_logado()` ao banco (a chave pública do navegador recebe "não" ou erro). O gate "verify_jwt" sozinho não basta:
// ele também aceita a chave pública (achado da Etapa 17).
//
// Sem a chave cadastrada, a função responde { configurado: false } e a tela segue só com o mapa gratuito e o pedágio lançado à mão. Para ligar: no painel do Supabase,
// Edge Functions → Secrets → HERE_API_KEY.
//
// Corpo: { pontos: [{ lat, lng }, ...] }  (saída, paradas na ordem e, na ida e volta, a saída de novo no fim)
// Resposta: { configurado: true, provedor: "HERE", km, horas, trechos: [{ km, horas, pedagio }], pedagio: { total, moeda, informado }, avisos }  |  { configurado: false }  |  { erro }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { urlDaRotaHere, pontosValidos, converterRespostaHere } from "./here.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_HERE = Deno.env.get("HERE_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function quemEntrou(autorizacao: string | null): Promise<boolean> {
  if (!autorizacao) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/esta_logado`, {
      method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao, "Content-Type": "application/json" }, body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (!(await quemEntrou(req.headers.get("Authorization")))) return json({ erro: "só quem entrou no sistema pode calcular a rota" }, 401);

    let corpo: any;
    try { corpo = await req.json(); } catch { return json({ erro: "o pedido veio sem corpo válido" }, 400); }
    let pontos;
    try { pontos = pontosValidos(corpo); } catch (e) { return json({ erro: String((e as Error).message) }, 400); }

    if (!CHAVE_HERE) return json({ configurado: false });

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    let r: Response;
    try { r = await fetch(urlDaRotaHere(pontos, CHAVE_HERE), { signal: ctl.signal }); }
    catch (e) { return json({ configurado: true, erro: (e as Error).name === "AbortError" ? "o HERE demorou demais para responder" : "não consegui falar com o HERE" }, 502); }
    finally { clearTimeout(t); }

    // a chave nunca aparece em mensagem: só o motivo em português
    if (r.status === 401 || r.status === 403) return json({ configurado: true, erro: "o HERE recusou a chave cadastrada (confira o segredo HERE_API_KEY)" }, 502);
    if (r.status === 429) return json({ configurado: true, erro: "o limite de uso gratuito do HERE foi atingido" }, 502);
    if (!r.ok) return json({ configurado: true, erro: `o HERE respondeu com erro ${r.status}` }, 502);

    const resposta = converterRespostaHere(await r.json(), pontos.length);
    return json({ configurado: true, provedor: "HERE", ...resposta });
  } catch (e) {
    return json({ configurado: true, erro: String((e as Error)?.message || e) }, 500);
  }
});
