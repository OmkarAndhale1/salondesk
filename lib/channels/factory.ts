import type { SupabaseClient } from '@supabase/supabase-js'
import { MockChannel } from './mock'
import type { ChannelAdapter } from './types'
import { WhatsAppCloudChannel } from './whatsapp'

export function createChannel(supabase: SupabaseClient): ChannelAdapter {
  const provider = process.env.WHATSAPP_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'cloud' : 'mock')
  return provider === 'cloud' ? new WhatsAppCloudChannel(supabase) : new MockChannel()
}