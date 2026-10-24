import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InboundMessage } from './types'

export interface WhatsAppInboundEvent {
  phoneNumberId: string
  profileName?: string
  message: InboundMessage
}

export interface WhatsAppStatusEvent {
  phoneNumberId: string
  messageId: string
  status: string
  timestamp: Date
  error?: string
}

export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith('sha256=') || !appSecret) return false
  const provided = header.slice('sha256='.length)
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parseMessage(value: unknown): InboundMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as Record<string, unknown>
  if (typeof message.id !== 'string' || typeof message.from !== 'string' || typeof message.timestamp !== 'string') return null
  const type = message.type
  if (type !== 'text' && type !== 'image' && type !== 'audio' && type !== 'document' && type !== 'template') return null
  const content = message[type]
  const body = type === 'text' && typeof content === 'object' && content !== null && 'body' in content && typeof content.body === 'string'
    ? content.body
    : undefined
  const timestampSeconds = Number(message.timestamp)
  if (!Number.isFinite(timestampSeconds)) return null
  return {
    waMessageId: message.id,
    from: message.from,
    type,
    body,
    timestamp: new Date(timestampSeconds * 1000),
  }
}

export function parseWhatsAppWebhook(payload: unknown) {
  const messages: WhatsAppInboundEvent[] = []
  const statuses: WhatsAppStatusEvent[] = []
  if (typeof payload !== 'object' || payload === null) return { messages, statuses }
  const entries = (payload as Record<string, unknown>).entry
  if (!Array.isArray(entries)) return { messages, statuses }
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    const changes = (entry as Record<string, unknown>).changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      if (typeof change !== 'object' || change === null) continue
      const value = (change as Record<string, unknown>).value
      if (typeof value !== 'object' || value === null) continue
      const valueRecord = value as Record<string, unknown>
      const metadata = valueRecord.metadata
      const phoneNumberId = typeof metadata === 'object' && metadata !== null && 'phone_number_id' in metadata && typeof metadata.phone_number_id === 'string'
        ? metadata.phone_number_id
        : null
      if (!phoneNumberId) continue
      const contacts = Array.isArray(valueRecord.contacts) ? valueRecord.contacts : []
      const profileName = contacts[0] && typeof contacts[0] === 'object' && contacts[0] !== null
        ? (() => {
            const profile = (contacts[0] as Record<string, unknown>).profile
            return profile && typeof profile === 'object' && profile !== null && 'name' in profile && typeof profile.name === 'string' ? profile.name : undefined
          })()
        : undefined
      const incoming = Array.isArray(valueRecord.messages) ? valueRecord.messages : []
      for (const rawMessage of incoming) {
        const message = parseMessage(rawMessage)
        if (message) messages.push({ phoneNumberId, profileName, message })
      }
      const incomingStatuses = Array.isArray(valueRecord.statuses) ? valueRecord.statuses : []
      for (const rawStatus of incomingStatuses) {
        if (typeof rawStatus !== 'object' || rawStatus === null) continue
        const status = rawStatus as Record<string, unknown>
        if (typeof status.id !== 'string' || typeof status.status !== 'string' || typeof status.timestamp !== 'string') continue
        const timestamp = Number(status.timestamp)
        if (!Number.isFinite(timestamp)) continue
        const errors = Array.isArray(status.errors) ? status.errors[0] : null
        const error = errors && typeof errors === 'object' && errors !== null && 'title' in errors && typeof errors.title === 'string' ? errors.title : undefined
        statuses.push({ phoneNumberId, messageId: status.id, status: status.status, timestamp: new Date(timestamp * 1000), error })
      }
    }
  }
  return { messages, statuses }
}

export function uniqueInboundEvents(events: WhatsAppInboundEvent[]) {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.phoneNumberId}:${event.message.waMessageId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
