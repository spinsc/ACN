// supabase/functions/whatsapp-admin/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proxy browser → Evolution API para ações administrativas:
//   GET  ?action=status&instance=nome        → estado da conexão
//   GET  ?action=qrcode&instance=nome        → QR code base64
//   POST { action:'create', instanceName, vendedorNome, vendedorId? }
//   POST { action:'logout', instanceName }
//   POST { action:'delete', instanceName }
//   GET  ?action=listar                      → todas as instâncias da Evolution API
//
// Chamado pelo painel do Contatos (Admin e equipe do Comercial), com o crachá de quem entrou.
// Nunca expõe api_token para o browser.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, apikey, x-client-info, content-type',   // 26/11/2026: a tela passou a mandar o apikey junto com o crachá
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

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

// Quem pode: a mesma regra da tela (ContactosSection, "isGerente"): Admin, Gerente Comercial e a equipe do Comercial/CRM, que vale como gerente.
const PERFIS_QUE_GERENCIAM = ['admin', 'gerente comercial', 'comercial', 'crm']
const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// ─── helpers Evolution API ────────────────────────────────────────────────────

async function evoGet(url: string, token: string, path: string) {
  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    headers: { apikey: token, 'Content-Type': 'application/json' },
  })
  return res.json()
}

async function evoPost(url: string, token: string, path: string, body?: unknown) {
  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { apikey: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function evoDel(url: string, token: string, path: string) {
  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: 'DELETE',
    headers: { apikey: token, 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ─── handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const perfil = semAcento(String((await perguntarAoBanco(req.headers.get('Authorization'), 'perfil_atual')) || ''))
  if (!PERFIS_QUE_GERENCIAM.includes(perfil)) {
    return json({ error: 'Só o Admin e a equipe do Comercial gerenciam as conexões do WhatsApp. Se você é dessa equipe, entre de novo no sistema.' }, 403)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Ler config da Evolution API
    const { data: cfg, error: cfgErr } = await supabase
      .from('crm_whatsapp_config')
      .select('evolution_url, api_token')
      .limit(1)
      .single()

    if (cfgErr || !cfg) {
      return json({ error: 'Evolution API não configurada. Adicione uma linha em crm_whatsapp_config.' }, 400)
    }

    const { evolution_url: EVO_URL, api_token: EVO_TOKEN } = cfg

    const url = new URL(req.url)
    const actionParam = url.searchParams.get('action')

    // Lê o body UMA vez para POST
    let postBody: any = null
    if (req.method === 'POST') {
      try { postBody = await req.json() } catch { postBody = {} }
    }

    const action = actionParam || (postBody?.action ?? null)

    // ── GET status ────────────────────────────────────────────────────────────
    if (action === 'status') {
      const instance = url.searchParams.get('instance')
      if (!instance) return json({ error: 'instance obrigatório' }, 400)

      const data = await evoGet(EVO_URL, EVO_TOKEN, `/instance/connectionState/${instance}`)
      return json(data)
    }

    // ── GET qrcode ────────────────────────────────────────────────────────────
    if (action === 'qrcode') {
      const instance = url.searchParams.get('instance')
      if (!instance) return json({ error: 'instance obrigatório' }, 400)

      const data = await evoGet(EVO_URL, EVO_TOKEN, `/instance/connect/${instance}`)
      return json(data)
    }

    // ── GET listar (todas as instâncias na Evolution API) ─────────────────────
    if (action === 'listar') {
      const data = await evoGet(EVO_URL, EVO_TOKEN, '/instance/fetchInstances')
      return json(data)
    }

    // ── POST actions ──────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = postBody
      const postAction = body?.action

      // criar instância
      if (postAction === 'create') {
        const { instanceName, vendedorNome, vendedorId } = body
        if (!instanceName || !vendedorNome) return json({ error: 'instanceName e vendedorNome obrigatórios' }, 400)

        const createPayload = {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
            byEvents: true,
            base64: true,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          },
        }

        // Cria na Evolution API
        let evoRes = await evoPost(EVO_URL, EVO_TOKEN, '/instance/create', createPayload)

        // Se a instância já existe no servidor (409 ou "already exist"), deleta e recria
        const alreadyExists =
          evoRes?.status === 409 ||
          [evoRes?.response?.message].flat().some((m: string) =>
            typeof m === 'string' && (m.toLowerCase().includes('already exist') || m.toLowerCase().includes('já existe'))
          )
        if (alreadyExists) {
          await evoDel(EVO_URL, EVO_TOKEN, `/instance/delete/${instanceName}`)
          await new Promise(r => setTimeout(r, 800))
          evoRes = await evoPost(EVO_URL, EVO_TOKEN, '/instance/create', createPayload)
        }

        // Salva no Supabase
        await supabase.from('crm_whatsapp_instancias').upsert({
          instance_name: instanceName,
          vendedor_nome: vendedorNome,
          vendedor_id: vendedorId || null,
          status: 'aguardando_qr',
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'instance_name' })

        return json({ ok: true, evo: evoRes })
      }

      // logout (desconectar número mas manter instância)
      if (postAction === 'logout') {
        const { instanceName } = body
        if (!instanceName) return json({ error: 'instanceName obrigatório' }, 400)

        const evoRes = await evoDel(EVO_URL, EVO_TOKEN, `/instance/logout/${instanceName}`)

        await supabase.from('crm_whatsapp_instancias').update({
          status: 'desconectado',
          numero_conectado: null,
          atualizado_em: new Date().toISOString(),
        }).eq('instance_name', instanceName)

        return json({ ok: true, evo: evoRes })
      }

      // delete (remove instância completamente)
      if (postAction === 'delete') {
        const { instanceName } = body
        if (!instanceName) return json({ error: 'instanceName obrigatório' }, 400)

        await evoDel(EVO_URL, EVO_TOKEN, `/instance/delete/${instanceName}`)
        await supabase.from('crm_whatsapp_instancias').delete().eq('instance_name', instanceName)

        return json({ ok: true })
      }

      return json({ error: 'action inválida' }, 400)
    }

    return json({ error: 'Rota não encontrada' }, 404)

  } catch (e: any) {
    console.error('whatsapp-admin error:', e)
    return json({ error: e.message }, 500)
  }
})
