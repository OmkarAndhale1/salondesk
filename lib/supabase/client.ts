import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser (anon-key) Supabase client.
 * Use this in Client Components. RLS enforces salon-scoped access.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
