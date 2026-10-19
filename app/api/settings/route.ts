import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase/session'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const hoursSchema = z.record(z.string(), z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) }).nullable())
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  google_review_link: z.string().url().nullable(),
  timezone: z.string().min(1).max(64),
  working_hours: hoursSchema,
  faq_text: z.string().max(10_000).nullable(),
  bot_enabled: z.boolean(),
})

export async function PATCH(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!await checkRateLimit(`settings:${rateLimitIdentity(request, user.id)}`, 20, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 })
  const { data: profile } = await supabase.from('users').select('salon_id,role').eq('id', user.id).single()
  if (profile?.role !== 'owner' || !profile.salon_id) return Response.json({ error: 'Owner access required' }, { status: 403 })
  const { error } = await supabase.from('salons').update(parsed.data).eq('id', profile.salon_id)
  return error ? Response.json({ error: 'Could not save salon settings.' }, { status: 500 }) : Response.json({ saved: true })
}