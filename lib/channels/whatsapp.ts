import type { SupabaseClient } from '@supabase/supabase-js'
import { loadWhatsAppCredentials } from './credentials'
import type { ChannelAdapter, InboundMessage, OutboundMessage, SendResult } from './types'

interface WhatsAppApiResponse {
  messages?: Array<{ id?: string }>
  error?: { message?: string; code?: number; error_data?: { details?: string } }
}

export class WhatsAppCloudChannel implements ChannelAdapter {
  private readonly graphVersion: string

  constructor(private readonly supabase: SupabaseClient) {
    this.graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v23.0'
  }

  async sendMessage(salonId: string, message: OutboundMessage): Promise<SendResult> {
    if (message.type === 'text' && (!message.lastInboundAt || Date.now() - new Date(message.lastInboundAt).getTime() > 24 * 60 * 60 * 1000)) {
      throw new Error('Free-form WhatsApp messages require an active 24-hour customer-service window.')
    }
    const credentials = await loadWhatsAppCredentials(this.supabase, salonId)
    const payload = message.type === 'template'
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.to,
          type: 'template',
          template: {
            name: message.templateName,
            language: { code: message.templateLanguage ?? 'en' },
            components: message.templateComponents ?? [],
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.to,
          type: 'text',
          text: { preview_url: false, body: message.body },
        }
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion}/${credentials.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
    const result = await response.json() as WhatsAppApiResponse
    if (!response.ok || !result.messages?.[0]?.id) throw new Error('WhatsApp Cloud API rejected the message.')
    return { waMessageId: result.messages[0].id }
  }

  parseInbound(payload: unknown): InboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null
    const message = payload as Record<string, unknown>
    if (typeof message.id !== 'string' || typeof message.from !== 'string' || typeof message.timestamp !== 'string') return null
    const type = message.type
    if (type !== 'text' && type !== 'image' && type !== 'audio' && type !== 'document' && type !== 'template') return null
    const text = message.text
    return {
      waMessageId: message.id,
      from: message.from,
      type,
      body: typeof text === 'object' && text !== null && 'body' in text && typeof text.body === 'string' ? text.body : undefined,
      timestamp: new Date(Number(message.timestamp) * 1000),
    }
  }
}
