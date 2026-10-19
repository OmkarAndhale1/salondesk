'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface BookingRow {
  id: string
  starts_at: string
  ends_at: string
  status: 'confirmed' | 'cancelled' | 'done' | 'no_show'
  contact: { id: string; name: string | null; wa_id: string } | null
  service: { id: string; name: string; price: number; duration_min: number } | null
}

interface Choice {
  id: string
  name: string
  wa_id?: string
  price?: number
  duration_min?: number
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function Bookings() {
  const supabase = createClient()
  const [day, setDay] = useState(localDate(new Date()))
  const [rows, setRows] = useState<BookingRow[]>([])
  const [contacts, setContacts] = useState<Choice[]>([])
  const [services, setServices] = useState<Choice[]>([])
  const [contactId, setContactId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const [bookingsResult, contactsResult, servicesResult] = await Promise.all([
        supabase.from('bookings').select('id,starts_at,ends_at,status,contact:contacts(id,name,wa_id),service:services(id,name,price,duration_min)').gte('starts_at', new Date(`${day}T00:00:00`).toISOString()).lt('starts_at', new Date(`${day}T23:59:59.999`).toISOString()).order('starts_at'),
        supabase.from('contacts').select('id,name,wa_id').order('name'),
        supabase.from('services').select('id,name,price,duration_min').eq('active', true).order('name'),
      ])
      if (!active) return
      if (bookingsResult.error || contactsResult.error || servicesResult.error) {
        setError('Could not load bookings. Refresh and try again.')
      } else {
        setRows((bookingsResult.data ?? []) as unknown as BookingRow[])
        setContacts((contactsResult.data ?? []) as Choice[])
        setServices((servicesResult.data ?? []) as Choice[])
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [day, supabase])

  async function reload() {
    const { data, error: queryError } = await supabase.from('bookings')
      .select('id,starts_at,ends_at,status,contact:contacts(id,name,wa_id),service:services(id,name,price,duration_min)')
      .gte('starts_at', new Date(`${day}T00:00:00`).toISOString())
      .lt('starts_at', new Date(`${day}T23:59:59.999`).toISOString())
      .order('starts_at')
    if (queryError) setError('Could not refresh bookings.')
    else setRows((data ?? []) as unknown as BookingRow[])
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const response = await fetch('/api/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', contact_id: contactId, service_id: serviceId, starts_at: new Date(startsAt).toISOString() }),
    })
    const result = await response.json() as { error?: string }
    if (!response.ok) setError(result.error ?? 'Booking could not be created.')
    else {
      setNotice('Booking created and customer notified.')
      setContactId('')
      setServiceId('')
      setStartsAt('')
      await reload()
    }
    setSaving(false)
  }

  async function updateStatus(bookingId: string, status: BookingRow['status']) {
    setError(null)
    setNotice(null)
    const response = await fetch('/api/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', booking_id: bookingId, status }),
    })
    if (!response.ok) {
      const result = await response.json() as { error?: string }
      setError(result.error ?? 'Booking update failed.')
    } else {
      setNotice('Booking updated and customer notified.')
      await reload()
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-7 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-5">
        <div><p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Schedule</p><h1 className="mt-2 text-2xl font-semibold">Bookings</h1><p className="mt-1 text-sm text-zinc-500">Appointments for the selected day</p></div>
        <label className="text-sm text-zinc-400">Day <input type="date" value={day} onChange={(event) => { setLoading(true); setDay(event.target.value) }} className="ml-2 border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
      </header>
      {error && <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
      <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Day view</h2><span className="text-xs text-zinc-500">{rows.length} appointments</span></div>
          {loading ? <p className="py-10 text-sm text-zinc-500">Loading bookings…</p> : rows.length === 0 ? <p className="py-10 text-sm text-zinc-500">No appointments on this day.</p> : (
            <ol className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800">
              {rows.map((booking) => (
                <li key={booking.id} className="grid gap-4 py-4 sm:grid-cols-[84px_minmax(0,1fr)_auto] sm:items-center">
                  <time className="text-sm tabular-nums text-emerald-300">{formatTime(booking.starts_at)}</time>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{booking.contact?.name || booking.contact?.wa_id || 'Customer'} <span className="font-normal text-zinc-500">· {booking.service?.name || 'Service'}</span></p>
                    <p className="mt-1 text-xs capitalize text-zinc-500">{booking.status.replace('_', ' ')} · {formatTime(booking.starts_at)}–{formatTime(booking.ends_at)}</p>
                  </div>
                  {booking.status === 'confirmed' && <div className="flex gap-2">
                    <button onClick={() => void updateStatus(booking.id, 'done')} className="border border-emerald-500/40 px-2 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10">Done</button>
                    <button onClick={() => void updateStatus(booking.id, 'no_show')} className="border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">No-show</button>
                    <button onClick={() => void updateStatus(booking.id, 'cancelled')} className="border border-rose-500/30 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10">Cancel</button>
                  </div>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="border-t border-zinc-800 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <h2 className="text-sm font-semibold">Add walk-in</h2>
          <form onSubmit={(event) => void createBooking(event)} className="mt-4 space-y-4">
            <label className="block text-sm text-zinc-400">Customer
              <select required value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white">
                <option value="">Select contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name || contact.wa_id}</option>)}
              </select>
            </label>
            <label className="block text-sm text-zinc-400">Service
              <select required value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white">
                <option value="">Select service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · ₹{service.price}</option>)}
              </select>
            </label>
            <label className="block text-sm text-zinc-400">Start time
              <input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
            </label>
            <button type="submit" disabled={saving || !contacts.length || !services.length} className="w-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">{saving ? 'Saving…' : 'Create booking'}</button>
          </form>
        </section>
      </div>
    </main>
  )
}