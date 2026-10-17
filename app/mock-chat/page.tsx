import type { Metadata } from 'next'
import MockChatClient from './mock-chat-client'

export const metadata: Metadata = {
  title: 'Mock Chat | SalonDesk',
  description: 'Simulate WhatsApp messages for local testing',
}

export default function MockChatPage() {
  return <MockChatClient />
}
