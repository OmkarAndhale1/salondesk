import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { createChannel } from '@/lib/channels/factory'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const schema = z.object({
  salon_id:        z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  sender:          z.literal('staff').optional(),
  text:            z.string().min(1).max(4096),
})

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

  const { conversation_id, text } = parsed.data
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`send:${rateLimitIdentity(request, user.id)}`, 30, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('salon_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.salon_id || !['owner', 'staff'].includes(profile.role)) {
    return Response.json({ error: 'Salon access required' }, { status: 403 })
  }
  const salonId = profile.salon_id

  // Verify conversation exists and belongs to the given salon_id.
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('id', conversation_id)
    .eq('salon_id', salonId)
    .single()

  if (convError ?? !conv) {
    return Response.json(
      { error: 'Conversation not found for this salon' },
      { status: 404 }
    )
  }

  // Load contact from the authenticated salon scope.
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('wa_id,opted_out,last_inbound_at')
    .eq('id', (conv as { contact_id: string }).contact_id)
    .single()

  if (contactError ?? !contact) {
    return Response.json({ error: 'Contact not found' }, { status: 404 })
  }
  if ((contact as { opted_out: boolean }).opted_out) {
    return Response.json({ error: 'This contact has opted out of messages.' }, { status: 409 })
  }

  const channel = createChannel(createClient())
  const result = await channel.sendMessage(salonId, {
    to: (contact as { wa_id: string }).wa_id,
    type: 'text',
    body: text,
    lastInboundAt: (contact as { last_inbound_at: string | null }).last_inbound_at,
  })

  // Persist outbound message.
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      salon_id: salonId,
      conversation_id,
      direction: 'out',
      sender: 'staff',
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

  await supabase
    .from('conversations')
    .update({ status: 'human' })
    .eq('id', conversation_id)
    .eq('salon_id', salonId)

  return Response.json(message, { status: 201 })
}
