// Supabase Edge Function — transcrever-audio
// Recebe uma URL de áudio do Supabase Storage, envia para OpenAI Whisper e retorna a transcrição.
//
// Secrets necessários (Supabase > Settings > Edge Functions > Secrets):
//   OPENAI_API_KEY = sk-...
//
// Body esperado:
//   { audio_url: "https://..." }
//
// Resposta:
//   { transcricao: "texto transcrito..." }
//   { error: "mensagem de erro" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

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
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurado nos secrets da Edge Function." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    if ((await perguntarAoBanco(req.headers.get("Authorization"), "esta_logado")) !== true) {
      return new Response(
        JSON.stringify({ error: "Só quem entrou no sistema pode transcrever áudio." }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { audio_url } = await req.json();
    if (!audio_url) {
      return new Response(
        JSON.stringify({ error: "Campo 'audio_url' é obrigatório." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    // 26/11/2026 (pacote de segurança S3): só áudio guardado no próprio sistema (antes baixava qualquer endereço da internet).
    if (!String(audio_url).startsWith(`${SUPABASE_URL}/storage/v1/object/`)) {
      return new Response(
        JSON.stringify({ error: "Só dá para transcrever áudio guardado no próprio sistema." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Baixa o áudio da URL (Supabase Storage)
    const audioRes = await fetch(audio_url);
    if (!audioRes.ok) {
      return new Response(
        JSON.stringify({ error: `Não foi possível baixar o áudio: ${audioRes.statusText}` }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const audioBlob = await audioRes.blob();

    // Detecta extensão pela URL para naming correto
    const ext = audio_url.split("?")[0].split(".").pop()?.toLowerCase() || "webm";
    const fileName = `audio.${ext}`;

    // Monta o FormData para o Whisper
    const form = new FormData();
    form.append("file", audioBlob, fileName);
    form.append("model", "whisper-1");
    form.append("language", "pt"); // português — remove esta linha para detecção automática

    // Chama a API OpenAI Whisper
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return new Response(
        JSON.stringify({ error: `Erro OpenAI Whisper: ${err}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const whisperData = await whisperRes.json();
    const transcricao = whisperData?.text?.trim() || "";

    return new Response(
      JSON.stringify({ transcricao }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || "Erro interno inesperado." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
