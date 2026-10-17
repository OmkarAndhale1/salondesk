import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MockChannel } from '@/lib/channels/mock'

const schema = z.object({
  salon_id:        z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender:          z.enum(['staff', 'bot']),
  text:            z.string().min(1).max(4096),
})

// Singleton — one channel instance per serverless invocation is fine
const channel = new MockChannel()

export async function POST(request: NextRequest) {
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

  const { salon_id, conversation_id, sender, text } = parsed.data
  const supabase = createClient()

  // Verify conversation exists and belongs to the given salon_id.
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('id', conversation_id)
    .eq('salon_id', salon_id)
    .single()

  if (convError ?? !conv) {
    return Response.json(
      { error: 'Conversation not found for this salon' },
      { status: 404 }
    )
  }

  // Load contact to get wa_id for MockChannel.
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('wa_id')
    .eq('id', (conv as { contact_id: string }).contact_id)
    .single()

  if (contactError ?? !contact) {
    return Response.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Send via the channel adapter (MockChannel logs to console).
  const result = await channel.sendMessage(salon_id, {
    to: (contact as { wa_id: string }).wa_id,
    type: 'text',
    body: text,
  })

  // Persist outbound message.
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      salon_id,
      conversation_id,
      direction: 'out',
      sender,
      type: 'text',
      body: text,
      wa_message_id: result.waMessageId,
      status: 'sent',
    })
    .select()
    .single()

  if (msgError ?? !message) {
    return Response.json(
      { error: 'Failed to save outbound message', detail: msgError?.message },
      { status: 500 }
    )
  }

  return Response.json(message, { status: 201 })
}
