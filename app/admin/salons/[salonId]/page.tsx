import { notFound } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'

export default async function SalonSupportPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const supabase = await createSessionClient()
  const [{ data: salon }, { data: contacts }, { data: bookings }] = await Promise.all([
    supabase.from('salons').select('name,working_hours,timezone,bot_enabled').eq('id', salonId).single(),
    supabase.from('contacts').select('name,wa_id,created_at').eq('salon_id', salonId).order('created_at', { ascending: false }).limit(20),
    supabase.from('bookings').select('id,starts_at,status,service:services(name),contact:contacts(name)').eq('salon_id', salonId).order('starts_at', { ascending: false }).limit(20),
  ])
  if (!salon) notFound()

  return <main className="mx-auto max-w-5xl px-5 py-8"><p className="text-xs uppercase tracking-wider text-emerald-400">Read-only support</p><h1 className="mt-2 text-2xl font-semibold">{salon.name}</h1><p className="mt-2 text-sm text-zinc-500">{salon.timezone} · Bot {salon.bot_enabled ? 'enabled' : 'paused'}</p><h2 className="mt-8 border-b border-zinc-800 pb-3 text-sm font-semibold">Recent contacts</h2><ul className="divide-y divide-zinc-800">{(contacts ?? []).map((contact, index) => <li key={`${contact.wa_id}-${index}`} className="py-3 text-sm">{contact.name || 'Customer'} <span className="text-zinc-500">{contact.wa_id.slice(-4).padStart(contact.wa_id.length, '•')}</span></li>)}</ul><h2 className="mt-8 border-b border-zinc-800 pb-3 text-sm font-semibold">Recent bookings</h2><ul className="divide-y divide-zinc-800">{(bookings ?? []).map((booking) => <li key={booking.id} className="py-3 text-sm">{String((booking.contact as unknown as { name: string } | null)?.name ?? 'Customer')} · {String((booking.service as unknown as { name: string } | null)?.name ?? 'Service')} · {new Date(booking.starts_at).toLocaleString()} · {booking.status}</li>)}</ul></main>
}