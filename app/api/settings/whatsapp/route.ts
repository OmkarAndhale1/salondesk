import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSessionClient } from '@/lib/supabase/session'
import { encryptSecret } from '@/lib/channels/credentials'
import { checkRateLimit, rateLimitIdentity } from '@/lib/rate-limit'

const saveSchema = z.object({
  phone_number_id: z.string().trim().min(1).max(100),
  waba_id: z.string().trim().max(100).nullable(),
  access_token: z.string().min(20).max(4096),
})

async function ownerContext(request: Request) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { response: Response.json({ error: 'Authentication required' }, { status: 401 }) }
  if (!await checkRateLimit(`whatsapp-settings:${rateLimitIdentity(request, user.id)}`, 10, 60)) return { response: Response.json({ error: 'Too many requests.' }, { status: 429 }) }
  const { data: profile } = await session.from('users').select('salon_id,role').eq('id', user.id).single()
  if (profile?.role !== 'owner' || !profile.salon_id) return { response: Response.json({ error: 'Owner access required' }, { status: 403 }) }
  return { salonId: profile.salon_id }
}

export async function GET(request: Request) {
  const context = await ownerContext(request)
  if ('response' in context) return context.response
  const admin = createClient()
  const [{ data: salon }, { data: secret }] = await Promise.all([
    admin.from('salons').select('phone_number_id,waba_id').eq('id', context.salonId).single(),
    admin.from('salon_secrets').select('access_token_encrypted').eq('salon_id', context.salonId).maybeSingle(),
  ])
  return Response.json({
    phone_number_id: salon?.phone_number_id ?? null,
    waba_id: salon?.waba_id ?? null,
    connected: Boolean(salon?.phone_number_id && secret?.access_token_encrypted),
    provider: process.env.WHATSAPP_PROVIDER ?? 'mock',
  })
}

export async function PUT(request: Request) {
  const context = await ownerContext(request)
  if ('response' in context) return context.response
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const admin = createClient()
  const { error: salonError } = await admin.from('salons').update({ phone_number_id: parsed.data.phone_number_id, waba_id: parsed.data.waba_id }).eq('id', context.salonId)
  if (salonError) return Response.json({ error: 'Could not save WhatsApp settings.' }, { status: 500 })
  const { error: secretError } = await admin.from('salon_secrets').upsert({ salon_id: context.salonId, access_token_encrypted: encryptSecret(parsed.data.access_token) }, { onConflict: 'salon_id' })
  if (secretError) return Response.json({ error: 'Could not save WhatsApp credentials.' }, { status: 500 })
  return Response.json({ saved: true, connected: true })
}

export async function DELETE(request: Request) {
  const context = await ownerContext(request)
  if ('response' in context) return context.response
  const admin = createClient()
  const { error: secretError } = await admin.from('salon_secrets').delete().eq('salon_id', context.salonId)
  const { error: salonError } = await admin.from('salons').update({ phone_number_id: null, waba_id: null }).eq('id', context.salonId)
  if (secretError || salonError) return Response.json({ error: 'Could not disconnect WhatsApp.' }, { status: 500 })
  return Response.json({ disconnected: true })
}