'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Email or password is incorrect.')
      setSubmitting(false)
      return
    }

    const requestedPath = searchParams.get('next')
    const nextPath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/dashboard'
    router.replace(nextPath)
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
      <section className="w-full max-w-sm border border-zinc-800 bg-zinc-900/80 p-7 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">SalonDesk</p>
        <h1 className="mt-6 text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-zinc-400">Sign in to manage your salon inbox.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-zinc-300">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm text-zinc-300">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}