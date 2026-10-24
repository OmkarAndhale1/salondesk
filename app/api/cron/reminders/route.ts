import { createClient } from '@/lib/supabase/server'
import { createChannel } from '@/lib/channels/factory'

interface DueBooking {
  id: string
  salon_id: string
  contact_id: string
  starts_at: string
  status: string
  service: { name: string } | null
  contact: { wa_id: string; opted_out: boolean; last_inbound_at: string | null } | null
  salon: { name: string; google_review_link: string | null } | null
}

const runWindowMs = 15 * 60 * 1000

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const now = Date.now()
  const candidates = [
    { kind: 'reminder_24h', target: now + 24 * 60 * 60 * 1000, flag: 'reminder_24h_sent', body: (item: DueBooking) => `Reminder: your ${item.service?.name ?? 'salon'} appointment at ${item.salon?.name ?? 'the salon'} is tomorrow at ${formatIndia(item.starts_at)}.` },
    { kind: 'reminder_2h', target: now + 2 * 60 * 60 * 1000, flag: 'reminder_2h_sent', body: (item: DueBooking) => `Reminder: your ${item.service?.name ?? 'salon'} appointment starts in about 2 hours at ${formatIndia(item.starts_at)}.` },
  ] as const

  let enqueued = 0
  for (const candidate of candidates) {
    const { data: due, error } = await supabase.from('bookings')
      .select('id,salon_id,contact_id,starts_at,status,service:services(name),contact:contacts(wa_id,opted_out),salon:salons(name,google_review_link)')
      .eq('status', 'confirmed')
      .eq(candidate.flag, false)
      .gte('starts_at', new Date(candidate.target - runWindowMs).toISOString())
      .lt('starts_at', new Date(candidate.target + runWindowMs).toISOString())
    if (error) return Response.json({ error: 'Could not find due reminders.' }, { status: 500 })
    for (const row of (due ?? []) as unknown as DueBooking[]) {
      if (row.contact?.opted_out) continue
      const { error: insertError } = await supabase.from('notification_outbox').upsert({
        salon_id: row.salon_id,
        contact_id: row.contact_id,
        booking_id: row.id,
        kind: candidate.kind,
        body: candidate.body(row),
      }, { onConflict: 'booking_id,kind', ignoreDuplicates: true })
      if (insertError) return Response.json({ error: 'Could not queue reminders.' }, { status: 500 })
      enqueued += 1
    }
  }

  const { data: completed, error: completedError } = await supabase.from('bookings')
    .select('id,salon_id,contact_id,starts_at,status,completed_at,service:services(name),contact:contacts(wa_id,opted_out),salon:salons(name,google_review_link)')
    .eq('status', 'done')
    .eq('review_requested', false)
    .lt('completed_at', new Date(now - 2 * 60 * 60 * 1000).toISOString())
    .gte('completed_at', new Date(now - 2 * 60 * 60 * 1000 - runWindowMs).toISOString())
  if (completedError) return Response.json({ error: 'Could not find review requests.' }, { status: 500 })
  for (const row of (completed ?? []) as unknown as DueBooking[]) {
    if (row.contact?.opted_out) continue
    const reviewLink = row.salon?.google_review_link
    if (!reviewLink) continue
    const { error } = await supabase.from('notification_outbox').upsert({
      salon_id: row.salon_id,
      contact_id: row.contact_id,
      booking_id: row.id,
      kind: 'review_request',
      body: `Thank you for visiting ${row.salon?.name ?? 'us'}! We’d appreciate your review: ${reviewLink}`,
    }, { onConflict: 'booking_id,kind', ignoreDuplicates: true })
    if (error) return Response.json({ error: 'Could not queue review requests.' }, { status: 500 })
    enqueued += 1
  }

  const { data: claimed, error: claimError } = await supabase.rpc('claim_notification_outbox', { batch_size: 25 })
  if (claimError) return Response.json({ error: 'Could not claim pending notifications.' }, { status: 500 })
  let sent = 0
  for (const item of claimed ?? []) {
    const { data: contact } = await supabase.from('contacts').select('wa_id,opted_out,last_inbound_at').eq('id', item.contact_id).eq('salon_id', item.salon_id).single()
    if (!contact || contact.opted_out) {
      await supabase.from('notification_outbox').update({ status: 'cancelled', locked_until: null }).eq('id', item.id)
      continue
    }
    try {
      const { data: template } = await supabase.from('templates').select('name,language,components').eq('salon_id', item.salon_id).eq('category', item.kind).eq('status', 'approved').limit(1).maybeSingle()
      const outbound = template
        ? { to: contact.wa_id, type: 'template' as const, templateName: template.name, templateLanguage: template.language, templateComponents: Array.isArray(template.components) ? template.components : [] }
        : { to: contact.wa_id, type: 'text' as const, body: item.body, lastInboundAt: contact.last_inbound_at }
      const result = await createChannel(supabase).sendMessage(item.salon_id, outbound)
      const { data: conversation } = await supabase.from('conversations').select('id').eq('salon_id', item.salon_id).eq('contact_id', item.contact_id).neq('status', 'closed').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (conversation) {
        await supabase.from('messages').insert({ salon_id: item.salon_id, conversation_id: conversation.id, direction: 'out', sender: 'bot', type: 'text', body: item.body, wa_message_id: result.waMessageId, status: 'sent' })
      }
      await supabase.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), locked_until: null }).eq('id', item.id)
      const flag = item.kind === 'review_request' ? { review_requested: true } : item.kind === 'reminder_24h' ? { reminder_24h_sent: true } : { reminder_2h_sent: true }
      await supabase.from('bookings').update(flag).eq('id', item.booking_id).eq('salon_id', item.salon_id)
      sent += 1
    } catch {
      await supabase.from('notification_outbox').update({ status: 'queued', locked_until: null }).eq('id', item.id)
    }
  }
  return Response.json({ enqueued, sent })
}

function formatIndia(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}