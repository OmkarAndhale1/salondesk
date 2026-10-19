import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const salonId = process.env.NEXT_PUBLIC_DEMO_SALON_ID
  const cronSecret = process.env.CRON_SECRET
  const appUrl = process.env.LOCAL_APP_URL ?? 'http://localhost:3000'
  if (!url || !serviceKey || !salonId || !cronSecret) {
    throw new Error('Set the Supabase URL, service-role key, demo salon ID, and CRON_SECRET in the process environment.')
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const suffix = randomUUID()
  let contactId: string | undefined
  const bookingIds: string[] = []
  try {
    const { data: service, error: serviceError } = await admin.from('services').select('id,duration_min').eq('salon_id', salonId).eq('active', true).limit(1).single()
    if (serviceError || !service) throw new Error('No active demo service is available.')
    const { data: contact, error: contactError } = await admin.from('contacts').insert({ salon_id: salonId, wa_id: `reminder-test-${suffix}`, name: 'Reminder test', opted_out: false }).select('id').single()
    if (contactError || !contact) throw new Error('Could not create the reminder test contact.')
    contactId = contact.id

    for (const hoursAhead of [2, 24]) {
      const startsAt = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
      const { data: booking, error } = await admin.from('bookings').insert({
        salon_id: salonId,
        contact_id: contact.id,
        service_id: service.id,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + service.duration_min * 60_000).toISOString(),
        status: 'confirmed',
      }).select('id').single()
      if (error || !booking) throw new Error(`Could not create the ${hoursAhead}-hour test booking.`)
      bookingIds.push(booking.id)
    }

    for (let run = 0; run < 2; run += 1) {
      const response = await fetch(`${appUrl}/api/cron/reminders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': cronSecret },
        body: '{}',
      })
      if (!response.ok) throw new Error(`Reminder run ${run + 1} failed with status ${response.status}.`)
    }

    const { data: notifications, error: queryError } = await admin.from('notification_outbox').select('booking_id,kind,status').in('booking_id', bookingIds)
    if (queryError) throw new Error('Could not verify reminder outbox rows.')
    for (const bookingId of bookingIds) {
      const bookingNotifications = (notifications ?? []).filter((item) => item.booking_id === bookingId && item.kind.startsWith('reminder_'))
      if (bookingNotifications.length !== 1 || bookingNotifications[0].status !== 'sent') {
        throw new Error('A reminder was missing, duplicated, or not marked sent after two runs.')
      }
    }
    console.log('Reminder repeat-run test passed: each test booking has one sent reminder outbox item.')
  } finally {
    for (const bookingId of bookingIds) await admin.from('bookings').delete().eq('id', bookingId)
    if (contactId) await admin.from('contacts').delete().eq('id', contactId)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Reminder test failed.')
  process.exitCode = 1
})