import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function encryptionKey() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY
  if (!encoded) throw new Error('TOKEN_ENCRYPTION_KEY is not configured.')
  const key = /^[0-9a-f]{64}$/i.test(encoded)
    ? Buffer.from(encoded, 'hex')
    : Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must encode 32 bytes.')
  return key
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':')
}

export function decryptSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(':')
  if (version !== VERSION || !ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted secret format.')
  const iv = Buffer.from(ivText, 'base64url')
  const tag = Buffer.from(tagText, 'base64url')
  const ciphertext = Buffer.from(ciphertextText, 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) throw new Error('Invalid encrypted secret.')
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export interface WhatsAppCredentials {
  phoneNumberId: string
  accessToken: string
  wabaId: string | null
}

export async function loadWhatsAppCredentials(supabase: SupabaseClient, salonId: string): Promise<WhatsAppCredentials> {
  const [{ data: salon, error: salonError }, { data: secret, error: secretError }] = await Promise.all([
    supabase.from('salons').select('phone_number_id,waba_id').eq('id', salonId).single(),
    supabase.from('salon_secrets').select('access_token_encrypted').eq('salon_id', salonId).single(),
  ])
  if (salonError || secretError || !salon?.phone_number_id || !secret?.access_token_encrypted) {
    throw new Error('WhatsApp is not configured for this salon.')
  }
  return {
    phoneNumberId: salon.phone_number_id,
    wabaId: salon.waba_id,
    accessToken: decryptSecret(secret.access_token_encrypted),
  }
}
