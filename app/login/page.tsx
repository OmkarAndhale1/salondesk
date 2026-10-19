import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Sign in | SalonDesk',
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  )
}