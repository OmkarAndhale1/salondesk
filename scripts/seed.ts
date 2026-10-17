/**
 * Seed script — run with: npx tsx scripts/seed.ts
 * Safe to run multiple times (no duplicates).
 * Does NOT create auth users.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local (Next.js doesn't auto-load it for plain scripts) ──────────
try {
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) {
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      process.env[m[1]] = val
    }
  }
} catch {
  // .env.local not present — assume vars are already set
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Seed data ─────────────────────────────────────────────────────────────────

const SALON_NAME = 'Glow Salon'

const WORKING_HOURS = {
  mon: { open: '10:00', close: '20:00' },
  tue: { open: '10:00', close: '20:00' },
  wed: { open: '10:00', close: '20:00' },
  thu: { open: '10:00', close: '20:00' },
  fri: { open: '10:00', close: '20:00' },
  sat: { open: '10:00', close: '20:00' },
  sun: null,
}

const SERVICES: Array<{ name: string; price: number; duration_min: number }> = [
  { name: 'Haircut',     price: 300,  duration_min: 30  },
  { name: 'Hair Spa',    price: 800,  duration_min: 60  },
  { name: 'Facial',      price: 1200, duration_min: 90  },
  { name: 'Beard Trim',  price: 150,  duration_min: 20  },
  { name: 'Hair Colour', price: 2500, duration_min: 120 },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find or create salon
  const { data: existing } = await supabase
    .from('salons')
    .select('id')
    .eq('name', SALON_NAME)
    .limit(1)
    .maybeSingle()

  let salonId: string

  if (existing) {
    salonId = existing.id as string
    console.log(`✓ Salon already exists (skipping insert): ${salonId}`)
  } else {
    const { data: created, error } = await supabase
      .from('salons')
      .insert({
        name: SALON_NAME,
        timezone: 'Asia/Kolkata',
        working_hours: WORKING_HOURS,
        bot_enabled: true,
      })
      .select('id')
      .single()

    if (error ?? !created) {
      console.error('❌  Failed to create salon:', error)
      process.exit(1)
    }

    salonId = (created as { id: string }).id
    console.log(`✓ Created salon: ${salonId}`)
  }

  // 2. Find or create each service (no unique constraint on name, so query first)
  for (const svc of SERVICES) {
    const { data: existingSvc } = await supabase
      .from('services')
      .select('id')
      .eq('salon_id', salonId)
      .eq('name', svc.name)
      .maybeSingle()

    if (existingSvc) {
      console.log(`  ↩  Service already exists: ${svc.name}`)
      continue
    }

    const { error } = await supabase.from('services').insert({
      salon_id: salonId,
      name: svc.name,
      price: svc.price,
      duration_min: svc.duration_min,
      active: true,
    })

    if (error) {
      console.error(`  ❌  Failed to create service "${svc.name}":`, error.message)
    } else {
      console.log(`  ✓  Service: ${svc.name}  ₹${svc.price}  ${svc.duration_min}min`)
    }
  }

  console.log(`\n✅  Done. Add this to your .env.local:\n`)
  console.log(`NEXT_PUBLIC_DEMO_SALON_ID=${salonId}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
