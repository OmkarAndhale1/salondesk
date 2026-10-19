'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ServiceRow { id: string; name: string; price: number; duration_min: number; active: boolean }
interface TeamRow { id: string; name: string; role: string }
interface Hours { [day: string]: { open: string; close: string } | null }

const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const

export default function Settings() {
  const supabase = createClient()
  const [salonId, setSalonId] = useState('')
  const [name, setName] = useState('')
  const [reviewLink, setReviewLink] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [hours, setHours] = useState<Hours>({})
  const [faq, setFaq] = useState('')
  const [botEnabled, setBotEnabled] = useState(true)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [serviceName, setServiceName] = useState('')
  const [servicePrice, setServicePrice] = useState('')
  const [serviceDuration, setServiceDuration] = useState('30')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [testReply, setTestReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('salon_id,role').eq('id', user.id).single()
      if (!profile?.salon_id || profile.role !== 'owner') return
      const [salonResult, servicesResult, teamResult] = await Promise.all([
        supabase.from('salons').select('name,google_review_link,timezone,working_hours,faq_text,bot_enabled').eq('id', profile.salon_id).single(),
        supabase.from('services').select('id,name,price,duration_min,active').eq('salon_id', profile.salon_id).order('name'),
        supabase.from('users').select('id,name,role').eq('salon_id', profile.salon_id).order('name'),
      ])
      if (!active) return
      if (salonResult.error || servicesResult.error || teamResult.error || !salonResult.data) {
        setError('Could not load salon settings.')
      } else {
        setSalonId(profile.salon_id)
        setName(salonResult.data.name)
        setReviewLink(salonResult.data.google_review_link ?? '')
        setTimezone(salonResult.data.timezone)
        setHours((salonResult.data.working_hours ?? {}) as Hours)
        setFaq(salonResult.data.faq_text ?? '')
        setBotEnabled(salonResult.data.bot_enabled)
        setServices(servicesResult.data ?? [])
        setTeam((teamResult.data ?? []) as TeamRow[])
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [supabase])

  async function saveSalon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, google_review_link: reviewLink || null, timezone, working_hours: hours, faq_text: faq || null, bot_enabled: botEnabled }) })
    const result = await response.json() as { error?: string }
    setError(response.ok ? null : result.error ?? 'Could not save salon settings.')
    setNotice(response.ok ? 'Salon settings saved.' : null)
    setBusy(false)
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null)
    const price = Number(servicePrice); const duration = Number(serviceDuration)
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 1) { setError('Enter a valid price and duration.'); return }
    const response = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', service: { name: serviceName.trim(), price, duration_min: duration, active: true } }) })
    const result = await response.json() as ServiceRow & { error?: string }
    if (!response.ok) setError(result.error ?? 'Could not add this service.')
    else { setServices((current) => [...current, result].sort((a, b) => a.name.localeCompare(b.name))); setServiceName(''); setServicePrice(''); setNotice('Service added.') }
  }

  async function updateService(service: ServiceRow, changes: Partial<ServiceRow>) {
    const updated = { ...service, ...changes }
    delete (updated as Partial<ServiceRow>).id
    const response = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', service_id: service.id, service: updated }) })
    const result = await response.json() as ServiceRow & { error?: string }
    if (!response.ok) setError(result.error ?? 'Could not update service.')
    else setServices((current) => current.map((item) => item.id === service.id ? result : item))
  }

  async function removeService(serviceId: string) {
    const response = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', service_id: serviceId }) })
    const result = await response.json() as { error?: string }
    if (!response.ok) setError(result.error ?? 'Could not remove service.')
    else setServices((current) => current.filter((item) => item.id !== serviceId))
  }

  async function teamAction(payload: Record<string, string>) {
    const response = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json() as { error?: string }
    if (!response.ok) setError(result.error ?? 'Team update failed.')
    else { setNotice('Team updated.'); await refreshTeam() }
  }

  async function refreshTeam() {
    const { data } = await supabase.from('users').select('id,name,role').eq('salon_id', salonId).order('name')
    setTeam((data ?? []) as TeamRow[])
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null)
    await teamAction({ action: 'invite', email: inviteEmail, name: inviteName, role: 'staff' })
    setInviteEmail(''); setInviteName('')
  }

  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setTestReply('')
    const response = await fetch('/api/bot/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: testMessage }) })
    const result = await response.json() as { text?: string; error?: string }
    if (!response.ok) setError(result.error ?? 'Bot test failed.')
    else setTestReply(result.text ?? '')
    setBusy(false)
  }

  if (loading) return <main className="mx-auto max-w-5xl px-5 py-8 text-sm text-zinc-500">Loading settings…</main>

  return (
    <main className="mx-auto max-w-5xl px-5 py-7 md:px-8">
      <header className="border-b border-zinc-800 pb-5"><p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Workspace</p><h1 className="mt-2 text-2xl font-semibold">Settings</h1></header>
      {error && <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
      <form onSubmit={(event) => void saveSalon(event)} className="space-y-7 border-b border-zinc-800 py-7">
        <section className="grid gap-5 md:grid-cols-2">
          <label className="text-sm text-zinc-400">Salon name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
          <label className="text-sm text-zinc-400">Google review link<input type="url" value={reviewLink} onChange={(event) => setReviewLink(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
          <label className="text-sm text-zinc-400">Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
          <label className="flex items-center gap-3 self-end pb-2 text-sm text-zinc-300"><input type="checkbox" checked={botEnabled} onChange={(event) => setBotEnabled(event.target.checked)} className="accent-emerald-500" />Bot enabled</label>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Working hours</h2>
          <div className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800">
            {days.map(([key, label]) => {
              const value = hours[key] ?? null
              return <div key={key} className="grid grid-cols-[90px_1fr] items-center gap-3 py-3 sm:grid-cols-[110px_1fr_auto]">
                <span className="text-sm text-zinc-300">{label}</span>
                {value ? <><div className="flex flex-wrap items-center gap-2"><input aria-label={`${label} opening time`} type="time" value={value.open} onChange={(event) => setHours((current) => ({ ...current, [key]: { ...value, open: event.target.value } }))} className="border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" /><span className="text-zinc-600">to</span><input aria-label={`${label} closing time`} type="time" value={value.close} onChange={(event) => setHours((current) => ({ ...current, [key]: { ...value, close: event.target.value } }))} className="border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" /></div><button type="button" onClick={() => setHours((current) => ({ ...current, [key]: null }))} className="text-left text-xs text-zinc-500 hover:text-white">Closed</button></> : <><span className="text-sm text-zinc-500">Closed</span><button type="button" onClick={() => setHours((current) => ({ ...current, [key]: { open: '10:00', close: '19:00' } }))} className="text-left text-xs text-emerald-300">Set hours</button></>}
              </div>
            })}
          </div>
        </section>
        <label className="block text-sm text-zinc-400">FAQ and policies<textarea rows={5} value={faq} onChange={(event) => setFaq(event.target.value)} className="mt-2 w-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" /></label>
        <button disabled={busy} className="bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">{busy ? 'Saving…' : 'Save salon settings'}</button>
      </form>

      <section className="border-b border-zinc-800 py-7">
        <h2 className="text-lg font-semibold">Services</h2>
        <div className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800">
          {services.map((service) => <div key={service.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_100px_100px_auto_auto] sm:items-center">
            <input aria-label="Service name" value={service.name} onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} onBlur={(event) => void updateService(service, { name: event.target.value })} className="border border-zinc-800 bg-transparent px-2 py-2 text-sm" />
            <input aria-label="Service price in rupees" type="number" min="0" step="0.01" value={service.price} onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, price: Number(event.target.value) } : item))} onBlur={(event) => void updateService(service, { price: Number(event.target.value) })} className="border border-zinc-800 bg-transparent px-2 py-2 text-sm" />
            <input aria-label="Duration in minutes" type="number" min="1" value={service.duration_min} onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, duration_min: Number(event.target.value) } : item))} onBlur={(event) => void updateService(service, { duration_min: Number(event.target.value) })} className="border border-zinc-800 bg-transparent px-2 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={service.active} onChange={(event) => void updateService(service, { active: event.target.checked })} className="accent-emerald-500" />Active</label>
            <button onClick={() => void removeService(service.id)} className="text-left text-xs text-rose-300">Remove</button>
          </div>)}
          {services.length === 0 && <p className="py-4 text-sm text-zinc-500">No services yet.</p>}
        </div>
        <form onSubmit={(event) => void addService(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
          <input required value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Service name" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" />
          <input required type="number" min="0" step="0.01" value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} placeholder="Price ₹" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" />
          <input required type="number" min="1" value={serviceDuration} onChange={(event) => setServiceDuration(event.target.value)} placeholder="Minutes" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" />
          <button className="border border-zinc-600 px-4 py-2.5 text-sm hover:border-emerald-500">Add service</button>
        </form>
      </section>

      <section className="border-b border-zinc-800 py-7">
        <h2 className="text-lg font-semibold">Team</h2>
        <ul className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800">
          {team.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="text-sm">{member.name} <span className="ml-2 text-xs capitalize text-zinc-500">{member.role}</span></span>{member.role === 'staff' && <div className="flex gap-3"><select aria-label={`Role for ${member.name}`} defaultValue="staff" onChange={(event) => void teamAction({ action: 'role', user_id: member.id, role: event.target.value })} className="border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"><option value="staff">Staff</option><option value="owner">Owner</option></select><button onClick={() => void teamAction({ action: 'remove', user_id: member.id })} className="text-xs text-rose-300">Remove</button></div>}</li>)}
        </ul>
        <form onSubmit={(event) => void invite(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input required type="text" value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Name" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" />
          <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Email address" className="border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" />
          <button className="border border-zinc-600 px-4 py-2.5 text-sm hover:border-emerald-500">Invite staff</button>
        </form>
      </section>

      <section className="py-7">
        <h2 className="text-lg font-semibold">Test the bot</h2>
        <form onSubmit={(event) => void runTest(event)} className="mt-4 flex flex-col gap-3 sm:flex-row"><input required value={testMessage} onChange={(event) => setTestMessage(event.target.value)} placeholder="Ask a question about the salon" className="min-w-0 flex-1 border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm" /><button disabled={busy} className="bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50">Test</button></form>
        {testReply && <p className="mt-4 border-l-2 border-emerald-500 pl-4 text-sm leading-6 text-zinc-300">{testReply}</p>}
      </section>
    </main>
  )
}