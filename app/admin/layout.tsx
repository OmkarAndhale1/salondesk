import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSessionClient } from '@/lib/supabase/session'

export const instant = false

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') redirect('/dashboard/inbox')
  return <div className="min-h-screen bg-zinc-950 text-zinc-100">{children}</div>
}