'use client'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100"><section className="max-w-md border border-zinc-800 bg-zinc-900 p-7"><p className="text-xs uppercase tracking-[0.18em] text-rose-300">Something went wrong</p><h1 className="mt-3 text-xl font-semibold">This page could not load.</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Try again. Your salon data has not been changed by this error.</p><button onClick={reset} className="mt-6 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950">Try again</button></section></main>
}