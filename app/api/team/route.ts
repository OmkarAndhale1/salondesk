import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSessionClient } from '@/lib/supabase/session'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), email: z.string().email(), name: z.string().trim().min(1).max(100), role: z.enum(['owner', 'staff']) }),
  z.object({ action: z.literal('remove'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('role'), user_id: z.string().uuid(), role: z.enum(['owner', 'staff']) }),
])

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`team:${rateLimitIdentity(request, user.id)}`, 10, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const { data: profile } = await session.from('users').select('salon_id,role').eq('id', user.id).single()
  if (profile?.role !== 'owner' || !profile.salon_id) return Response.json({ error: 'Owner access required' }, { status: 403 })

  const admin = createClient()
  const action = parsed.data
  if (action.action === 'invite') {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(action.email, { data: { name: action.name } })
    if (error || !data.user) return Response.json({ error: 'Could not send the team invitation.' }, { status: 400 })
    const { error: profileError } = await admin.from('users').insert({ id: data.user.id, salon_id: profile.salon_id, role: action.role, name: action.name })
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id)
      return Response.json({ error: 'Could not create the team profile.' }, { status: 500 })
    }
    return Response.json({ invited: true }, { status: 201 })
  }

  const { data: target } = await admin.from('users').select('id,role,salon_id').eq('id', action.user_id).eq('salon_id', profile.salon_id).single()
  if (!target || target.role === 'super_admin' || target.id === user.id) {
    return Response.json({ error: 'Team member not found or not manageable.' }, { status: 404 })
  }
  if (action.action === 'role') {
    const { error } = await admin.from('users').update({ role: action.role }).eq('id', target.id).eq('salon_id', profile.salon_id)
    if (error) return Response.json({ error: 'Could not update team role.' }, { status: 500 })
    return Response.json({ updated: true })
  }
  if (target.role !== 'staff') return Response.json({ error: 'Only staff accounts can be removed here.' }, { status: 403 })
  const { error } = await admin.auth.admin.deleteUser(target.id)
  if (error) return Response.json({ error: 'Could not remove team member.' }, { status: 500 })
  return Response.json({ removed: true })
}