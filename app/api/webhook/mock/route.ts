import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { respondToInbound } from '@/lib/bot/runtime'
import { MockChannel } from '@/lib/channels/mock'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const schema = z.object({
  salon_id:   z.string().uuid(),
  wa_id:      z.string().min(1).max(20),
  name:       z.string().max(100).optional(),
  text:       z.string().min(1).max(4096),
  message_id: z.string().max(128).optional(),
})
const channel = new MockChannel()

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (!await checkRateLimit(`mock-webhook:${rateLimitIdentity(request)}`, 30, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { salon_id, wa_id, name, text, message_id } = parsed.data
  const supabase = createClient()

  // 1. Find or create contact; always refresh last_inbound_at.
  //    Omitting `name` from upsert payload when not provided preserves
  //    any existing name (Supabase only updates specified columns on conflict).
  const contactPayload: Record<string, unknown> = {
    salon_id,
    wa_id,
    last_inbound_at: new Date().toISOString(),
  }
  if (name) contactPayload.name = name

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .upsert(contactPayload, { onConflict: 'salon_id,wa_id' })
    .select()
    .single()

  if (contactError ?? !contact) {
    return Response.json(
      { error: 'Failed to upsert contact', detail: contactError?.message },
      { status: 500 }
    )
  }

  const contactId = (contact as { id: string }).id

  // 2. Find an open conversation (status != closed) or create one.
  const { data: openConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('salon_id', salon_id)
    .eq('contact_id', contactId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId: string

  if (openConv) {
    conversationId = (openConv as { id: string }).id
  } else {
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({ salon_id, contact_id: contactId, status: 'bot' })
      .select('id')
      .single()

    if (convError ?? !newConv) {
      return Response.json(
        { error: 'Failed to create conversation', detail: convError?.message },
        { status: 500 }
      )
    }
    conversationId = (newConv as { id: string }).id
  }

  // 3. Dedup: if message_id provided, return existing row without re-inserting.
  if (message_id) {
    const { data: dup } = await supabase
      .from('messages')
      .select()
      .eq('salon_id', salon_id)
      .eq('wa_message_id', message_id)
      .maybeSingle()

    if (dup) return Response.json(dup)
  }

  // 4. Insert inbound message.
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      salon_id,
      conversation_id: conversationId,
      direction: 'in',
      sender: 'customer',
      type: 'text',
      body: text,
      wa_message_id: message_id ?? null,
      status: 'received',
    })
    .select()
    .single()

  if (msgError ?? !message) {
    return Response.json(
      { error: 'Failed to insert message', detail: msgError?.message },
      { status: 500 }
    )
  }

  if (text.trim().toUpperCase() === 'STOP') {
    if (!(contact as { opted_out?: boolean }).opted_out) {
      await supabase.from('contacts').update({ opted_out: true }).eq('id', contactId).eq('salon_id', salon_id)
      const confirmation = 'You are opted out and will not receive further messages.'
      const result = await channel.sendMessage(salon_id, { to: wa_id, type: 'text', body: confirmation })
      await supabase.from('messages').insert({
        salon_id,
        conversation_id: conversationId,
        direction: 'out',
        sender: 'bot',
        type: 'text',
        body: confirmation,
        wa_message_id: result.waMessageId,
        status: 'sent',
      })
    }
    return Response.json(message, { status: 201 })
  }

  await respondToInbound(supabase, {
    salonId: salon_id,
    contactId,
    conversationId,
    text,
    messageId: (message as { id: string }).id,
  })

  return Response.json(message, { status: 201 })
}
