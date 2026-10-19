import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSessionClient } from '@/lib/supabase/session'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  owner_email: z.string().email(),
  services: z.array(z.object({ name: z.string().trim().min(1).max(100), price: z.number().nonnegative(), duration_min: z.number().int().positive() })).min(1).max(30),
  working_hours: z.record(z.string(), z.object({ open: z.string(), close: z.string() }).nullable()),
  google_review_link: z.string().url().nullable(),
})

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`admin:${rateLimitIdentity(request, user.id)}`, 10, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const { data: profile } = await session.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return Response.json({ error: 'Super admin access required' }, { status: 403 })

  const admin = createClient()
  const { data: salon, error: salonError } = await admin.from('salons').insert({
    name: parsed.data.name,
    timezone: 'Asia/Kolkata',
    working_hours: parsed.data.working_hours,
    google_review_link: parsed.data.google_review_link,
  }).select('id').single()
  if (salonError || !salon) return Response.json({ error: 'Could not create salon.' }, { status: 500 })

  const serviceRows = parsed.data.services.map((service) => ({ ...service, salon_id: salon.id, active: true }))
  const { error: serviceError } = await admin.from('services').insert(serviceRows)
  if (serviceError) {
    await admin.from('salons').delete().eq('id', salon.id)
    return Response.json({ error: 'Could not add salon services.' }, { status: 500 })
  }

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.owner_email)
  if (inviteError || !invitation.user) {
    await admin.from('salons').delete().eq('id', salon.id)
    return Response.json({ error: 'Could not invite the salon owner.' }, { status: 400 })
  }
  const { error: userError } = await admin.from('users').insert({
    id: invitation.user.id,
    salon_id: salon.id,
    role: 'owner',
    name: parsed.data.owner_email.split('@')[0],
  })
  if (userError) {
    await admin.auth.admin.deleteUser(invitation.user.id)
    await admin.from('salons').delete().eq('id', salon.id)
    return Response.json({ error: 'Could not create owner profile.' }, { status: 500 })
  }
  return Response.json({ salon_id: salon.id }, { status: 201 })
}