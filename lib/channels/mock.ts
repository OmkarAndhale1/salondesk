import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from './types'

/**
 * In-memory mock channel for local dev and tests.
 * WhatsApp Cloud API adapter will replace / supplement this later.
 */
export class MockChannel implements ChannelAdapter {
  async sendMessage(
    _salonId: string,
    message: OutboundMessage
  ): Promise<SendResult> {
    const waMessageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`
    console.log('[MockChannel] sendMessage', { type: message.type, waMessageId })
    return { waMessageId }
  }

  parseInbound(payload: unknown): InboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null

    const p = payload as Record<string, unknown>

    if (typeof p.waMessageId !== 'string' || typeof p.from !== 'string') {
      return null
    }

    const validTypes = ['text', 'image', 'audio', 'document', 'template'] as const
    type MsgType = (typeof validTypes)[number]
    const type: MsgType = validTypes.includes(p.type as MsgType)
      ? (p.type as MsgType)
      : 'text'

    return {
      waMessageId: p.waMessageId,
      from: p.from,
      type,
      body: typeof p.body === 'string' ? p.body : undefined,
      timestamp: p.timestamp instanceof Date
        ? p.timestamp
        : typeof p.timestamp === 'string'
        ? new Date(p.timestamp)
        : new Date(),
    }
  }
}
