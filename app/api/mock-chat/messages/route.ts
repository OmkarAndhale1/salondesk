import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const querySchema = z.object({
  salon_id: z.string().uuid(),
  wa_id:    z.string().min(1),
})

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (!await checkRateLimit(`mock-chat:${rateLimitIdentity(request)}`, 60, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { salon_id, wa_id } = parsed.data
  const supabase = createClient()

  // Find contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('salon_id', salon_id)
    .eq('wa_id', wa_id)
    .maybeSingle()

  if (!contact) {
    return Response.json({ messages: [], conversation: null })
  }

  // Find latest non-closed conversation
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('salon_id', salon_id)
    .eq('contact_id', (contact as { id: string }).id)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) {
    return Response.json({ messages: [], conversation: null })
  }

  // Return all messages in this conversation, oldest first
  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, sender, body, wa_message_id, status, created_at')
    .eq('conversation_id', (conv as { id: string }).id)
    .order('created_at', { ascending: true })

  return Response.json({ messages: messages ?? [], conversation: conv })
}
