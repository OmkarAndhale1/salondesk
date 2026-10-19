import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const argsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  role: z.enum(['owner', 'staff', 'super_admin']),
  salonId: z.union([z.string().uuid(), z.literal('-')]),
  name: z.string().trim().min(1).max(100).default('Salon user'),
}).superRefine((args, context) => {
  if (args.role !== 'super_admin' && args.salonId === '-') {
    context.addIssue({ code: 'custom', path: ['salonId'], message: 'A salon ID is required for owners and staff.' })
  }
  if (args.role === 'super_admin' && args.salonId !== '-') {
    context.addIssue({ code: 'custom', path: ['salonId'], message: 'Use - for a super_admin without a salon.' })
  }
})

async function main() {
  const parsed = argsSchema.safeParse({
    email: process.argv[2],
    password: process.argv[3],
    role: process.argv[4],
    salonId: process.argv[5],
    name: process.argv[6] ?? 'Salon user',
  })
  if (!parsed.success) {
    console.error('Usage: npx tsx scripts/create-user.ts <email> <password> <owner|staff|super_admin> <salon-uuid|-> [name]')
    process.exitCode = 1
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.')
    process.exitCode = 1
    return
  }

  const { email, password, role, salonId, name } = parsed.data
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (salonId !== '-') {
    const { data: salon, error } = await supabase.from('salons').select('id').eq('id', salonId).maybeSingle()
    if (error || !salon) {
      console.error('The requested salon was not found.')
      process.exitCode = 1
      return
    }
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    console.error('Could not create the authentication user.')
    process.exitCode = 1
    return
  }

  const { error: profileError } = await supabase.from('users').insert({
    id: created.user.id,
    salon_id: salonId === '-' ? null : salonId,
    role,
    name,
  })
  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id)
    console.error('Could not create the SalonDesk user profile; the auth user was removed.')
    process.exitCode = 1
    return
  }

  console.log(`Created ${role} user ${email}. The password was not displayed.`)
}

main().catch(() => {
  console.error('User creation failed.')
  process.exitCode = 1
})