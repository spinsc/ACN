// Supabase Edge Function — send-whatsapp
// Envia mensagem via Evolution API para um número específico ou para todos de um setor.
//
// Secrets necessários (configure em Supabase > Settings > Edge Functions > Secrets):
//   EVOLUTION_URL      = https://sua-instancia.evolution.com (sem barra final)
//   EVOLUTION_INSTANCE = nome-da-instancia
//   EVOLUTION_API_KEY  = sua-api-key
//   SUPABASE_URL       = (automático)
//   SUPABASE_SERVICE_ROLE_KEY = (automático)
//
// Body esperado:
//   { numero: "5511999999999", mensagem: "Texto" }           → envia para número específico
//   { setor: "Engenharia", mensagem: "Texto" }               → envia para todos do setor
//   { perfis: ["PCP","Engenharia"], mensagem: "Texto" }      → envia para múltiplos perfis
//   { grupo: "120363000000000@g.us", mensagem: "Texto" }     → envia para grupo WhatsApp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function enviarMensagem(numero: string, mensagem: string) {
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number: numero, text: mensagem }),
  });
  return { numero, ok: res.ok, status: res.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json();
    const { numero, setor, perfis, grupo, mensagem } = body;

    if (!mensagem) {
      return new Response(JSON.stringify({ error: "mensagem é obrigatória" }), { status: 400 });
    }

    let numeros: string[] = [];

    // Número direto ou grupo
    if (numero || grupo) {
      numeros = [numero || grupo];
    }

    // Por setor (perfil único)
    if (setor) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data } = await supabase
        .from("auth_usuarios")
        .select("whatsapp")
        .eq("perfil", setor)
        .eq("ativo", true)
        .not("whatsapp", "is", null);
      numeros = [...numeros, ...(data || []).map((u: any) => u.whatsapp).filter(Boolean)];
    }

    // Por múltiplos perfis
    if (perfis && Array.isArray(perfis)) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data } = await supabase
        .from("auth_usuarios")
        .select("whatsapp")
        .in("perfil", perfis)
        .eq("ativo", true)
        .not("whatsapp", "is", null);
      numeros = [...numeros, ...(data || []).map((u: any) => u.whatsapp).filter(Boolean)];
    }

    // Remove duplicatas
    numeros = [...new Set(numeros)];

    if (numeros.length === 0) {
      return new Response(JSON.stringify({ enviados: 0, aviso: "Nenhum número encontrado" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const resultados = await Promise.allSettled(numeros.map(n => enviarMensagem(n, mensagem)));

    return new Response(
      JSON.stringify({ enviados: numeros.length, resultados }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
