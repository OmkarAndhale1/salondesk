import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import Reports from './reports'

export default async function ReportsPage() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') redirect('/dashboard/inbox')
  return <Reports />
}