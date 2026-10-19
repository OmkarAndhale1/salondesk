import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import LogoutButton from './logout-button'

export const instant = false

const navigation = [
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/bookings', label: 'Bookings' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, salon_id')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const { data: salon } = profile.salon_id
    ? await supabase.from('salons').select('name').eq('id', profile.salon_id).single()
    : { data: null }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-zinc-800 bg-zinc-900/70 p-5 md:min-h-screen md:border-b-0 md:border-r">
        <Link href="/dashboard" className="text-lg font-semibold">Salon<span className="text-emerald-400">Desk</span></Link>
        <div className="mt-8 border-b border-zinc-800 pb-5">
          <p className="truncate text-sm font-medium">{salon?.name ?? 'SalonDesk'}</p>
          <p className="mt-1 text-xs capitalize text-zinc-500">{profile.role} · {profile.name}</p>
        </div>
        <nav aria-label="Dashboard" className="mt-5 flex gap-2 overflow-x-auto md:flex-col">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden pt-6 md:block"><LogoutButton /></div>
      </aside>
      <div className="min-w-0">
        <header className="flex justify-end border-b border-zinc-800 px-5 py-3 md:hidden"><LogoutButton /></header>
        {children}
      </div>
    </div>
  )
}