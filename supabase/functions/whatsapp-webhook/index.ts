// supabase/functions/whatsapp-webhook/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Webhook da Evolution API — grava mensagens em crm_whatsapp_msgs
//
// Configuração na Evolution API:
//   Webhook URL:  https://<projeto>.supabase.co/functions/v1/whatsapp-webhook
//   Eventos:      messages.upsert, connection.update
//   Headers:      x-webhook-secret: <mesmo valor em crm_whatsapp_config.webhook_secret>
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-webhook-secret, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ─── helpers ──────────────────────────────────────────────────────────────────

function extrairConteudo(message: any): { conteudo: string | null; tipo_msg: string } {
  if (!message) return { conteudo: null, tipo_msg: 'texto' }

  if (message.conversation)
    return { conteudo: message.conversation, tipo_msg: 'texto' }

  if (message.extendedTextMessage?.text)
    return { conteudo: message.extendedTextMessage.text, tipo_msg: 'texto' }

  if (message.audioMessage || message.pttMessage)
    return { conteudo: null, tipo_msg: 'audio' }

  if (message.imageMessage)
    return { conteudo: message.imageMessage.caption || null, tipo_msg: 'imagem' }

  if (message.videoMessage)
    return { conteudo: message.videoMessage.caption || null, tipo_msg: 'video' }

  if (message.documentMessage)
    return { conteudo: message.documentMessage.fileName || null, tipo_msg: 'documento' }

  if (message.locationMessage)
    return { conteudo: `📍 Localização: ${message.locationMessage.degreesLatitude},${message.locationMessage.degreesLongitude}`, tipo_msg: 'texto' }

  return { conteudo: null, tipo_msg: 'outro' }
}

// ─── handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Validar webhook_secret (opcional — se config não tiver secret, aceita tudo)
    const { data: cfg } = await supabase
      .from('crm_whatsapp_config')
      .select('webhook_secret')
      .limit(1)
      .single()

    if (cfg?.webhook_secret) {
      const secret = req.headers.get('x-webhook-secret')
      if (secret !== cfg.webhook_secret) {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    const body = await req.json()
    const { event, instance, data } = body

    // ── Evento de conexão/desconexão ──────────────────────────────────────────
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data?.state || data?.connection // 'open' | 'close' | 'connecting'
      const numero = data?.phoneNumber || null

      const statusMap: Record<string, string> = {
        open:       'conectado',
        close:      'desconectado',
        connecting: 'aguardando_qr',
      }

      await supabase.from('crm_whatsapp_instancias')
        .update({
          status: statusMap[state] || 'desconectado',
          numero_conectado: state === 'open' ? numero : null,
          atualizado_em: new Date().toISOString(),
        })
        .eq('instance_name', instance)

      return json({ ok: true, event })
    }

    // ── Apenas mensagens ──────────────────────────────────────────────────────
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return json({ ok: true, skipped: event })
    }

    // data pode ser array (v2) ou objeto único (v1)
    const msgs: any[] = Array.isArray(data) ? data : [data]

    // Buscar instância do vendedor uma vez
    const { data: instRows } = await supabase
      .from('crm_whatsapp_instancias')
      .select('vendedor_nome, vendedor_id')
      .eq('instance_name', instance)
      .limit(1)

    const inst = instRows?.[0] || null

    for (const msg of msgs) {
      const { key, message, messageType, messageTimestamp, pushName } = msg || {}
      if (!key?.remoteJid) continue

      // Ignorar mensagens de grupos
      if (key.remoteJid.endsWith('@g.us')) continue

      const phone = key.remoteJid.replace('@s.whatsapp.net', '')
      const fromMe: boolean = key.fromMe === true

      // Buscar contato pelo número
      const { data: contatoRows } = await supabase
        .from('crm_contatos')
        .select('id')
        .eq('whatsapp', phone)
        .limit(1)

      const contato_id = contatoRows?.[0]?.id || null

      const { conteudo, tipo_msg } = extrairConteudo(message)
      const dataMsg = messageTimestamp
        ? new Date(Number(messageTimestamp) * 1000).toISOString()
        : new Date().toISOString()

      // Ignorar duplicatas (msg_id_externo UNIQUE)
      const msgIdExterno = key.id || null

      await supabase.from('crm_whatsapp_msgs').upsert({
        contato_id,
        instance_name:   instance,
        vendedor_nome:   inst?.vendedor_nome || null,
        numero_whatsapp: phone,
        numero_remoto:   phone,
        direcao:         fromMe ? 'saida' : 'entrada',
        tipo_msg,
        conteudo,
        msg_id_externo:  msgIdExterno,
        lida:            fromMe,  // saída = já lida
        data_msg:        dataMsg,
        raw_payload:     msg,
      }, { onConflict: 'msg_id_externo', ignoreDuplicates: true })
    }

    return json({ ok: true, processadas: msgs.length })

  } catch (e: any) {
    console.error('whatsapp-webhook error:', e)
    return json({ error: e.message }, 500)
  }
})
