'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export default function NewSalonForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [reviewLink, setReviewLink] = useState('')
  const [hours, setHours] = useState('10:00-19:00')
  const [serviceName, setServiceName] = useState('Haircut')
  const [price, setPrice] = useState('300')
  const [duration, setDuration] = useState('30')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null)
    const [open, close] = hours.split('-')
    const workingHours: Record<string, { open: string; close: string } | null> = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, { open, close }]))
    workingHours.sun = null
    const response = await fetch('/api/admin/salons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, owner_email: ownerEmail, services: [{ name: serviceName, price: Number(price), duration_min: Number(duration) }], working_hours: workingHours, google_review_link: reviewLink || null }),
    })
    const result = await response.json() as { error?: string }
    if (!response.ok) setError(result.error ?? 'Could not create salon.')
    else setCreated(true)
    setBusy(false)
  }

  if (created) return <main className="mx-auto max-w-2xl px-5 py-10"><h1 className="text-2xl font-semibold">Salon created</h1><p className="mt-2 text-zinc-400">The owner invitation was sent.</p><ol className="mt-7 space-y-3 border-l border-zinc-700 pl-5 text-sm text-zinc-300"><li>□ Connect WhatsApp number</li><li>□ Send test message</li><li>□ Make first booking</li></ol><button onClick={() => router.push('/admin')} className="mt-8 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950">Back to salons</button></main>

  return <main className="mx-auto max-w-2xl px-5 py-8"><button onClick={() => router.back()} className="text-sm text-zinc-500">← Back</button><h1 className="mt-5 text-2xl font-semibold">New salon</h1><form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
    <label className="block text-sm text-zinc-400">Salon name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
    <label className="block text-sm text-zinc-400">Owner email<input required type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
    <label className="block text-sm text-zinc-400">Working hours (open-close)<input required pattern="\d{2}:\d{2}-\d{2}:\d{2}" value={hours} onChange={(event) => setHours(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
    <label className="block text-sm text-zinc-400">Google review link<input type="url" value={reviewLink} onChange={(event) => setReviewLink(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
    <div className="grid gap-3 sm:grid-cols-3"><input required value={serviceName} onChange={(event) => setServiceName(event.target.value)} aria-label="First service" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5" /><input required type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} aria-label="First service price" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5" /><input required type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} aria-label="First service duration" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5" /></div>
    {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}<button disabled={busy} className="bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50">{busy ? 'Creating…' : 'Create salon and invite owner'}</button>
  </form></main>
}