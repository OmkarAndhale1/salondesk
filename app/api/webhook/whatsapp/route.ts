import { createClient } from '@/lib/supabase/server'
import { createChannel } from '@/lib/channels/factory'
import { parseWhatsAppWebhook, safeEqual, uniqueInboundEvents, verifyWhatsAppSignature } from '@/lib/channels/whatsapp-webhook'
import { respondToInbound } from '@/lib/bot/runtime'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode !== 'subscribe' || !token || !challenge || !expected || !safeEqual(token, expected)) {
    return Response.json({ error: 'Webhook verification failed.' }, { status: 403 })
  }
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
}

export async function POST(request: Request) {
  if (!await checkRateLimit(`whatsapp-webhook:${rateLimitIdentity(request)}`, 120, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const rawBody = await request.text()
  if (!appSecret || !verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = parseWhatsAppWebhook(payload)
  const supabase = createClient()
  const channel = createChannel(supabase)
  let processed = 0

  for (const event of uniqueInboundEvents(parsed.messages)) {
    const { data: salon } = await supabase.from('salons').select('id').eq('phone_number_id', event.phoneNumberId).maybeSingle()
    if (!salon) continue
    const { data: existing } = await supabase.from('messages').select('id').eq('salon_id', salon.id).eq('wa_message_id', event.message.waMessageId).maybeSingle()
    if (existing) continue

    const contactPayload: { salon_id: string; wa_id: string; last_inbound_at: string; name?: string } = {
      salon_id: salon.id,
      wa_id: event.message.from,
      last_inbound_at: event.message.timestamp.toISOString(),
    }
    if (event.profileName) contactPayload.name = event.profileName
    const { data: contact, error: contactError } = await supabase.from('contacts').upsert(contactPayload, { onConflict: 'salon_id,wa_id' }).select('id,opted_out,last_inbound_at').single()
    if (contactError || !contact) return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })

    const { data: conversation } = await supabase.from('conversations').select('id,status').eq('salon_id', salon.id).eq('contact_id', contact.id).neq('status', 'closed').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const conversationId = conversation?.id ?? (await supabase.from('conversations').insert({ salon_id: salon.id, contact_id: contact.id, status: 'bot' }).select('id').single()).data?.id
    if (!conversationId) return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })

    const { data: message, error: messageError } = await supabase.from('messages').insert({
      salon_id: salon.id,
      conversation_id: conversationId,
      direction: 'in',
      sender: 'customer',
      type: event.message.type,
      body: event.message.body ?? null,
      wa_message_id: event.message.waMessageId,
      status: 'received',
    }).select('id').single()
    if (messageError || !message) {
      const { data: duplicate } = await supabase.from('messages').select('id').eq('salon_id', salon.id).eq('wa_message_id', event.message.waMessageId).maybeSingle()
      if (duplicate) continue
      return Response.json({ error: 'Webhook processing failed.' }, { status: 500 })
    }

    processed += 1
    const text = event.message.body?.trim() ?? ''
    if (/^(stop|unsubscribe|cancel|end)$/i.test(text)) {
      await supabase.from('contacts').update({ opted_out: true }).eq('id', contact.id).eq('salon_id', salon.id)
      if (contact.opted_out !== true) {
        try {
          const result = await channel.sendMessage(salon.id, { to: event.message.from, type: 'text', body: 'You are opted out and will not receive further messages.', lastInboundAt: contact.last_inbound_at })
          await supabase.from('messages').insert({ salon_id: salon.id, conversation_id: conversationId, direction: 'out', sender: 'bot', type: 'text', body: 'You are opted out and will not receive further messages.', wa_message_id: result.waMessageId, status: 'accepted' })
        } catch { /* Opt-out state is authoritative if acknowledgement delivery fails. */ }
      }
    } else if (text && conversation?.status !== 'human') {
      await respondToInbound(supabase, { salonId: salon.id, contactId: contact.id, conversationId, text, messageId: message.id })
    }
  }

  for (const status of parsed.statuses) {
    const { data: salon } = await supabase.from('salons').select('id').eq('phone_number_id', status.phoneNumberId).maybeSingle()
    if (!salon) continue
    await supabase.from('messages').update({ status: status.status, provider_error: status.error ?? null }).eq('salon_id', salon.id).eq('wa_message_id', status.messageId)
  }
  return Response.json({ received: true, processed })
}