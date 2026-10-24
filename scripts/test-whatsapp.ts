import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { encryptSecret, decryptSecret } from '../lib/channels/credentials'
import { WhatsAppCloudChannel } from '../lib/channels/whatsapp'
import { parseWhatsAppWebhook, uniqueInboundEvents, verifyWhatsAppSignature } from '../lib/channels/whatsapp-webhook'

async function main() {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.WHATSAPP_GRAPH_API_VERSION = 'v23.0'

const encrypted = encryptSecret('test-access-token')
assert.equal(decryptSecret(encrypted), 'test-access-token')
assert.throws(() => decryptSecret(`${encrypted.slice(0, -1)}x`))

const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`
assert.equal(verifyWhatsAppSignature(raw, signature, 'app-secret'), true)
assert.equal(verifyWhatsAppSignature(raw, `${signature}x`, 'app-secret'), false)
assert.equal(verifyWhatsAppSignature(raw, 'sha256=bad', 'app-secret'), false)

const webhook = parseWhatsAppWebhook({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: 'phone-1' },
    contacts: [{ profile: { name: 'Test Customer' } }],
    messages: [{ id: 'wamid.1', from: '919999999999', timestamp: '1792830000', type: 'text', text: { body: 'Hello' } }],
    statuses: [{ id: 'wamid.out', status: 'delivered', timestamp: '1792830001' }],
  } }] }],
})
assert.equal(webhook.messages[0]?.phoneNumberId, 'phone-1')
assert.equal(webhook.messages[0]?.profileName, 'Test Customer')
assert.equal(webhook.messages[0]?.message.body, 'Hello')
assert.equal(webhook.statuses[0]?.status, 'delivered')
assert.equal(uniqueInboundEvents([...webhook.messages, ...webhook.messages]).length, 1)

const fakeSupabase = {
  from(table: string) {
    const query = {
      select() { return query },
      eq() { return query },
      single: async () => table === 'salons'
        ? { data: { phone_number_id: 'phone-1', waba_id: null }, error: null }
        : { data: { access_token_encrypted: encryptSecret('test-access-token') }, error: null },
    }
    return query
  },
} as never

let requestBody: string | null = null
globalThis.fetch = async (_input, init) => {
  requestBody = String(init?.body)
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.accepted' }] }), { status: 200 })
}
const channel = new WhatsAppCloudChannel(fakeSupabase)
const result = await channel.sendMessage('salon-1', { to: '919999999999', type: 'text', body: 'Hello', lastInboundAt: new Date().toISOString() })
assert.equal(result.waMessageId, 'wamid.accepted')
assert.match(requestBody ?? '', /"messaging_product":"whatsapp"/)
await assert.rejects(() => channel.sendMessage('salon-1', { to: '919999999999', type: 'text', body: 'Too late', lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }))

globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Rejected' } }), { status: 400 })
await assert.rejects(() => channel.sendMessage('salon-1', { to: '919999999999', type: 'template', templateName: 'reminder_24h', templateLanguage: 'en', templateComponents: [] }))
console.log('WhatsApp unit tests passed.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'WhatsApp tests failed.')
  process.exitCode = 1
})
