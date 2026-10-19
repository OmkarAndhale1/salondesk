'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ContactRow { created_at: string }
interface ConversationRow { id: string; created_at: string; messages: Array<{ sender: string }> }
interface BookingRow { created_at: string; starts_at: string; status: string; service: { price: number } | null; review_requested: boolean }

function monthStart(value: string) { return new Date(`${value}-01T00:00:00.000Z`) }
function csvEscape(value: string | number) { return `"${String(value).replaceAll('"', '""')}"` }

export default function Reports() {
  const supabase = createClient()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (active) setError('Your session expired. Sign in again.'); return }
      const { data: profile } = await supabase.from('users').select('salon_id,role').eq('id', user.id).single()
      if (profile?.role !== 'owner' || !profile.salon_id) { if (active) setError('Owner access is required.'); return }
      const start = monthStart(month)
      const end = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 1)
      const [contactResult, conversationResult, bookingResult] = await Promise.all([
        supabase.from('contacts').select('created_at').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('conversations').select('id,created_at,messages(sender)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('bookings').select('created_at,starts_at,status,review_requested,service:services(price)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
      ])
      if (!active) return
      if (contactResult.error || conversationResult.error || bookingResult.error) setError('Could not load report data.')
      else {
        setContacts(contactResult.data ?? [])
        setConversations((conversationResult.data ?? []) as unknown as ConversationRow[])
        setBookings((bookingResult.data ?? []) as unknown as BookingRow[])
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [month, supabase])

  const metrics = useMemo(() => {
    const counts = { confirmed: 0, done: 0, no_show: 0, cancelled: 0 }
    let revenue = 0
    let reviews = 0
    const hourCounts = Array.from({ length: 24 }, () => 0)
    for (const booking of bookings) {
      if (booking.status in counts) counts[booking.status as keyof typeof counts] += 1
      if (booking.status === 'done') revenue += Number(booking.service?.price ?? 0)
      if (booking.review_requested) reviews += 1
      hourCounts[new Date(booking.starts_at).getHours()] += 1
    }
    const botHandled = conversations.filter((conversation) => conversation.messages.some((message) => message.sender === 'bot')).length
    const humanHandled = conversations.filter((conversation) => conversation.messages.some((message) => message.sender === 'staff')).length
    const totalNonCancelled = counts.confirmed + counts.done + counts.no_show
    return {
      leads: contacts.length,
      conversations: conversations.length,
      botHandled,
      humanHandled,
      bookingsCreated: bookings.length,
      ...counts,
      noShowRate: totalNonCancelled ? Math.round((counts.no_show / totalNonCancelled) * 100) : 0,
      reviews,
      revenue,
      busiestHour: hourCounts.indexOf(Math.max(0, ...hourCounts)),
      hourCounts,
    }
  }, [bookings, contacts, conversations])

  const summary = `${month} SalonDesk summary: ${metrics.leads} new leads, ${metrics.conversations} conversations, ${metrics.bookingsCreated} bookings (${metrics.done} completed, ${metrics.no_show} no-shows, ${metrics.cancelled} cancelled), ${metrics.reviews} review requests, estimated revenue ₹${metrics.revenue.toLocaleString('en-IN')}.`

  function exportCsv() {
    const rows = [
      ['Metric', 'Value'],
      ['Month', month], ['New leads', metrics.leads], ['Conversations', metrics.conversations],
      ['Bot-handled conversations', metrics.botHandled], ['Human-handled conversations', metrics.humanHandled],
      ['Bookings created', metrics.bookingsCreated], ['Completed', metrics.done], ['No-shows', metrics.no_show],
      ['Cancellations', metrics.cancelled], ['No-show rate (%)', metrics.noShowRate], ['Review requests', metrics.reviews], ['Estimated revenue (INR)', metrics.revenue],
    ]
    const blob = new Blob([rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `salondesk-report-${month}.csv`; anchor.click(); URL.revokeObjectURL(url)
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary)
    setNotice('Monthly summary copied.')
  }

  const cards = [
    ['New leads', metrics.leads], ['Conversations', metrics.conversations], ['Bot handled', metrics.botHandled], ['Human handled', metrics.humanHandled],
    ['Bookings', metrics.bookingsCreated], ['Completed', metrics.done], ['No-shows', metrics.no_show], ['Cancelled', metrics.cancelled],
    ['No-show rate', `${metrics.noShowRate}%`], ['Reviews requested', metrics.reviews], ['Est. revenue', `₹${metrics.revenue.toLocaleString('en-IN')}`],
  ] as const

  return <main className="mx-auto max-w-6xl px-5 py-7 md:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-5"><div><p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Performance</p><h1 className="mt-2 text-2xl font-semibold">Reports</h1></div><div className="flex gap-2"><label className="sr-only" htmlFor="report-month">Report month</label><input id="report-month" type="month" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value) }} className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" /><button onClick={exportCsv} className="border border-zinc-700 px-3 py-2 text-sm hover:border-emerald-500">Export CSV</button></div></header>
    {error && <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    {loading ? <p className="py-10 text-sm text-zinc-500">Loading report…</p> : <>
      <section className="grid grid-cols-2 gap-x-5 sm:grid-cols-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="border-b border-zinc-800 py-5"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>)}</section>
      <section className="mt-9"><div className="flex items-end justify-between"><div><h2 className="text-sm font-semibold">Bookings by hour</h2><p className="mt-1 text-xs text-zinc-500">Busiest hour: {String(metrics.busiestHour).padStart(2, '0')}:00</p></div></div><div className="mt-5 flex h-40 items-end gap-1 border-b border-zinc-800" aria-label="Booking count by hour">{metrics.hourCounts.map((count, hour) => <div key={hour} className="group flex h-full flex-1 flex-col justify-end"><div title={`${hour}:00 · ${count}`} className="min-h-px bg-emerald-500/80" style={{ height: `${Math.max(count ? 6 : 1, count / Math.max(1, ...metrics.hourCounts) * 100)}%` }} /><span className="mt-2 hidden text-center text-[9px] text-zinc-600 xl:block">{hour}</span></div>)}</div></section>
      <section className="mt-8 border-t border-zinc-800 pt-6"><h2 className="text-sm font-semibold">Conversation handling</h2><p className="mt-1 text-xs text-zinc-500">Conversations with at least one reply from each side</p><div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">{[['Bot', metrics.botHandled, 'bg-emerald-400'], ['Staff', metrics.humanHandled, 'bg-sky-400']].map(([label, value, color]) => <div key={String(label)}><div className="flex justify-between text-xs"><span className="text-zinc-400">{label}</span><span className="tabular-nums text-zinc-300">{value}</span></div><div className="mt-2 h-2 bg-zinc-800"><div className={`h-full ${color}`} style={{ width: `${Math.min(100, Number(value) / Math.max(1, metrics.conversations) * 100)}%` }} /></div></div>)}</div></section>
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-5"><p className="max-w-3xl text-sm text-zinc-400">{summary}</p><button onClick={() => void copySummary()} className="border border-zinc-700 px-3 py-2 text-sm hover:border-emerald-500">Copy monthly summary</button></section>
    </>}
  </main>
}