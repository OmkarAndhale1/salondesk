import Link from 'next/link'
import { createSessionClient } from '@/lib/supabase/session'

export default async function AdminPage() {
  const supabase = await createSessionClient()
  const { data: salons } = await supabase.from('salons').select('id,name,created_at,bot_enabled').order('created_at', { ascending: false })
  const ids = (salons ?? []).map((salon) => salon.id)
  const [{ data: contacts }, { data: bookings }] = ids.length ? await Promise.all([
    supabase.from('contacts').select('salon_id').in('salon_id', ids),
    supabase.from('bookings').select('salon_id').in('salon_id', ids),
  ]) : [{ data: [] }, { data: [] }]

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-5"><div><p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Platform</p><h1 className="mt-2 text-2xl font-semibold">Salon administration</h1></div><Link href="/admin/new" className="bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950">New salon</Link></header>
      <div className="mt-6 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-700 text-xs uppercase text-zinc-500"><th className="py-3 pr-4">Salon</th><th className="py-3 pr-4">Contacts</th><th className="py-3 pr-4">Bookings</th><th className="py-3 pr-4">Bot</th><th className="py-3">Support</th></tr></thead><tbody>
        {(salons ?? []).map((salon) => <tr key={salon.id} className="border-b border-zinc-800"><td className="py-4 pr-4 font-medium">{salon.name}</td><td className="py-4 pr-4">{(contacts ?? []).filter((row) => row.salon_id === salon.id).length}</td><td className="py-4 pr-4">{(bookings ?? []).filter((row) => row.salon_id === salon.id).length}</td><td className="py-4 pr-4">{salon.bot_enabled ? 'Enabled' : 'Paused'}</td><td className="py-4"><Link href={`/admin/salons/${salon.id}`} className="text-emerald-300 hover:text-emerald-200">Read-only view</Link></td></tr>)}
        {!salons?.length && <tr><td colSpan={5} className="py-10 text-center text-zinc-500">No salons onboarded yet.</td></tr>}
      </tbody></table></div>
    </main>
  )
}