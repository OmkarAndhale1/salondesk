import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import MockChatClient from './mock-chat-client'

export const metadata: Metadata = {
  title: 'Mock Chat | SalonDesk',
  description: 'Simulate WhatsApp messages for local testing',
}

export default function MockChatPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <MockChatClient />
}
