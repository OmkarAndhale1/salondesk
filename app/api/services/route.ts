import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase/session'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().nonnegative().max(1_000_000),
  duration_min: z.number().int().positive().max(1440),
  active: z.boolean().default(true),
})
const createSchema = z.object({ action: z.literal('create'), service: serviceSchema })
const updateSchema = z.object({ action: z.literal('update'), service_id: z.string().uuid(), service: serviceSchema.partial() })
const deleteSchema = z.object({ action: z.literal('delete'), service_id: z.string().uuid() })
const schema = z.discriminatedUnion('action', [createSchema, updateSchema, deleteSchema])

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`services:${rateLimitIdentity(request, user.id)}`, 30, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const { data: profile } = await supabase.from('users').select('salon_id,role').eq('id', user.id).single()
  if (profile?.role !== 'owner' || !profile.salon_id) return Response.json({ error: 'Owner access required' }, { status: 403 })
  const action = parsed.data
  if (action.action === 'create') {
    const { data, error } = await supabase.from('services').insert({ ...action.service, salon_id: profile.salon_id }).select('id,name,price,duration_min,active').single()
    return error || !data ? Response.json({ error: 'Could not add service.' }, { status: 400 }) : Response.json(data, { status: 201 })
  }
  if (action.action === 'update') {
    if (!Object.keys(action.service).length) return Response.json({ error: 'No changes provided.' }, { status: 400 })
    const { data, error } = await supabase.from('services').update(action.service).eq('id', action.service_id).eq('salon_id', profile.salon_id).select('id,name,price,duration_min,active').single()
    return error || !data ? Response.json({ error: 'Could not update service.' }, { status: 400 }) : Response.json(data)
  }
  const { error } = await supabase.from('services').delete().eq('id', action.service_id).eq('salon_id', profile.salon_id)
  return error ? Response.json({ error: 'Could not remove service.' }, { status: 400 }) : Response.json({ removed: true })
}