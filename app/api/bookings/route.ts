import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase/session'
import { MockChannel } from '@/lib/channels/mock'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const createSchema = z.object({
  action: z.literal('create'),
  contact_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime(),
})

const updateSchema = z.object({
  action: z.literal('update'),
  booking_id: z.string().uuid(),
  status: z.enum(['confirmed', 'cancelled', 'done', 'no_show']),
})

const schema = z.discriminatedUnion('action', [createSchema, updateSchema])
const channel = new MockChannel()

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`bookings:${rateLimitIdentity(request, user.id)}`, 20, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const { data: profile } = await supabase.from('users').select('salon_id,role').eq('id', user.id).single()
  if (!profile?.salon_id || !['owner', 'staff'].includes(profile.role)) {
    return Response.json({ error: 'Salon access required' }, { status: 403 })
  }
  const salonId = profile.salon_id

  if (parsed.data.action === 'create') {
    const { contact_id, service_id, starts_at } = parsed.data
    const [{ data: contact }, { data: service }] = await Promise.all([
      supabase.from('contacts').select('id,wa_id,opted_out').eq('id', contact_id).eq('salon_id', salonId).single(),
      supabase.from('services').select('id,name,duration_min,price').eq('id', service_id).eq('salon_id', salonId).eq('active', true).single(),
    ])
    if (!contact || !service) return Response.json({ error: 'Contact or service not found.' }, { status: 404 })

    const start = new Date(starts_at)
    if (start <= new Date()) return Response.json({ error: 'Booking time must be in the future.' }, { status: 400 })
    const end = new Date(start.getTime() + service.duration_min * 60_000)
    const { data: overlaps, error: overlapError } = await supabase
      .from('bookings')
      .select('id')
      .eq('salon_id', salonId)
      .eq('status', 'confirmed')
      .lt('starts_at', end.toISOString())
      .gt('ends_at', start.toISOString())
      .limit(1)
    if (overlapError) return Response.json({ error: 'Could not verify slot availability.' }, { status: 500 })
    if (overlaps?.length) return Response.json({ error: 'That time was just booked. Choose another slot.' }, { status: 409 })

    const { data: booking, error: insertError } = await supabase.from('bookings').insert({
      salon_id: salonId,
      contact_id,
      service_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'confirmed',
    }).select('id,starts_at,ends_at,status').single()
    if (insertError || !booking) return Response.json({ error: 'Could not create booking.' }, { status: 409 })

    await notifyCustomer(supabase, salonId, contact.id, contact.wa_id, contact.opted_out, `Your ${service.name} appointment is confirmed for ${start.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`)
    return Response.json({ ...booking, service_name: service.name }, { status: 201 })
  }

  const { booking_id, status } = parsed.data
  const { data: booking } = await supabase
    .from('bookings')
    .select('id,contact_id,service_id,starts_at,service:services(name),contact:contacts(wa_id,opted_out)')
    .eq('id', booking_id)
    .eq('salon_id', salonId)
    .single()
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 })
  const { error: updateError } = await supabase.from('bookings').update({
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }).eq('id', booking_id).eq('salon_id', salonId)
  if (updateError) return Response.json({ error: 'Could not update booking.' }, { status: 500 })

  const contact = booking.contact as unknown as { wa_id: string; opted_out: boolean }
  const service = booking.service as unknown as { name: string }
  const notice = status === 'cancelled'
    ? `Your ${service.name} appointment has been cancelled.`
    : `Your ${service.name} appointment status has been updated to ${status.replace('_', ' ')}.`
  await notifyCustomer(supabase, salonId, booking.contact_id, contact.wa_id, contact.opted_out, notice)
  return Response.json({ id: booking.id, status })
}

async function notifyCustomer(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  salonId: string,
  contactId: string,
  waId: string,
  optedOut: boolean,
  text: string
) {
  if (optedOut) return
  const { data: conversation } = await supabase.from('conversations')
    .select('id').eq('salon_id', salonId).eq('contact_id', contactId).neq('status', 'closed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!conversation) return
  const result = await channel.sendMessage(salonId, { to: waId, type: 'text', body: text })
  await supabase.from('messages').insert({
    salon_id: salonId,
    conversation_id: conversation.id,
    direction: 'out',
    sender: 'staff',
    type: 'text',
    body: text,
    wa_message_id: result.waMessageId,
    status: 'sent',
  })
}