// Supabase Edge Function — send-email
// Envia email via SMTP configurado pelo Admin (tabela configuracoes_email_smtp).
// Genérica: qualquer aba pode chamar (Fiscal, contratos de terceiros, etc).
//
// A tabela configuracoes_email_smtp tem RLS habilitado sem policy de SELECT
// para anon/authenticated — só esta função (via SERVICE_ROLE_KEY, que sempre
// ignora RLS) consegue ler as credenciais SMTP. O Admin só consegue escrever.
//
// Body esperado:
//   { to: "fiscal@acn.com.br", subject: "Assunto", html: "<p>...</p>" }
//   to pode ser string ou array de strings.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 26/11/2026 (pacote de segurança da migração, S3): o porteiro do Supabase ("verify_jwt") aceita também a chave pública, que está no
// site. Por isso a função pergunta ao banco, com o crachá de quem chamou, quem é (como já fazem o ponto-secullum e o viagem-rota).
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
async function perguntarAoBanco(autorizacao: string | null, funcao: string): Promise<unknown> {
  if (!autorizacao) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
      method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao, "Content-Type": "application/json" }, body: "{}",
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if ((await perguntarAoBanco(req.headers.get("Authorization"), "esta_logado")) !== true) {
    return new Response(JSON.stringify({ error: "Só quem entrou no sistema pode enviar e-mail. Entre de novo e tente outra vez." }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "to, subject e html são obrigatórios" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: rows, error: cfgError } = await supabase
      .from("configuracoes_email_smtp")
      .select("chave, valor");
    if (cfgError) throw cfgError;

    const cfg = Object.fromEntries((rows || []).map((r: any) => [r.chave, r.valor]));
    const host = cfg.smtp_host;
    const porta = Number(cfg.smtp_porta) || 587;
    const usuario = cfg.smtp_usuario;
    const senha = cfg.smtp_senha;
    const fromEmail = cfg.smtp_from_email || usuario;
    const fromNome = cfg.smtp_from_nome || "ACN Sinal Verde";

    if (!host || !usuario || !senha) {
      return new Response(JSON.stringify({ error: "SMTP não configurado. Configure em Admin > Config. Email." }), {
        status: 412, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: porta,
        tls: porta === 465,
        auth: { username: usuario, password: senha },
      },
    });

    const destinatarios = Array.isArray(to) ? to : [to];

    await client.send({
      from: `${fromNome} <${fromEmail}>`,
      to: destinatarios,
      subject,
      html,
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
