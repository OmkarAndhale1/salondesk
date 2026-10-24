export interface InboundMessage {
  waMessageId: string
  /** WhatsApp sender ID (phone number string) */
  from: string
  type: 'text' | 'image' | 'audio' | 'document' | 'template'
  body?: string
  timestamp: Date
}

export interface OutboundMessage {
  /** WhatsApp recipient ID (phone number string) */
  to: string
  type: 'text' | 'template'
  body?: string
  templateName?: string
  templateLanguage?: string
  templateComponents?: unknown[]
  /** Required for free-form text so Cloud API sending enforces the 24-hour window. */
  lastInboundAt?: string | null
}

export interface SendResult {
  waMessageId: string
}

/**
 * Adapter interface every channel must implement.
 * WhatsApp Cloud API will implement this behind the same interface.
 */
export interface ChannelAdapter {
  sendMessage(salonId: string, message: OutboundMessage): Promise<SendResult>
  parseInbound(payload: unknown): InboundMessage | null
}
