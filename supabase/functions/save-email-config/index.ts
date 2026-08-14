// Supabase Edge Function — save-email-config
// Grava/atualiza a configuração SMTP (tabela configuracoes_email_smtp).
//
// A tabela tem RLS sem policy de SELECT para anon/authenticated (propositalmente,
// para nunca expor as credenciais de volta ao bundle público). Isso impede UPDATE
// e DELETE diretos do cliente: no Postgres, UPDATE/DELETE sob RLS exigem que a
// linha alvo também seja visível via alguma policy de SELECT, mesmo que a policy
// de UPDATE/DELETE tenha USING(true). Só o INSERT funciona direto do cliente.
// Por isso toda gravação (inclusive updates) passa por esta função, que usa a
// SERVICE_ROLE_KEY (sempre ignora RLS).
//
// Body esperado (todos os campos opcionais, exceto atualizado_por):
//   { smtp_host, smtp_porta, smtp_usuario, smtp_senha, smtp_from_nome, smtp_from_email,
//     email_fiscal_destino, atualizado_por }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAVES_SMTP = ["smtp_host", "smtp_porta", "smtp_usuario", "smtp_senha", "smtp_from_nome", "smtp_from_email"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();
    const atualizadoPor = body.atualizado_por || null;
    const agora = new Date().toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const registros = CHAVES_SMTP
      .filter((chave) => String(body[chave] ?? "").trim())
      .map((chave) => ({ chave, valor: String(body[chave]).trim(), atualizado_em: agora, atualizado_por: atualizadoPor }));

    if (registros.length > 0) {
      const { error } = await supabase.from("configuracoes_email_smtp").upsert(registros, { onConflict: "chave" });
      if (error) throw error;
    }

    if (body.email_fiscal_destino) {
      const { error } = await supabase.from("configuracoes_sistema").upsert([
        { chave: "email_fiscal_destino", valor: String(body.email_fiscal_destino).trim(), descricao: "Destinatário do email automático ao liberar OP/OS para o Fiscal", atualizado_em: agora },
        { chave: "smtp_configurado", valor: "true", atualizado_em: agora },
      ], { onConflict: "chave" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
