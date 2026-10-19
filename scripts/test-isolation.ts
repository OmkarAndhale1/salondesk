import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Set the Supabase URL, anon key, and service role key in the process environment.')
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const tenantA = randomUUID()
  const tenantB = randomUUID()
  const password = `${randomUUID()}Aa9!`
  const suffix = randomUUID()
  const userAEmail = `isolation-a-${suffix}@example.invalid`
  const userBEmail = `isolation-b-${suffix}@example.invalid`
  const createdSalonIds: string[] = []
  const createdUserIds: string[] = []

  try {
    const { data: salonA, error: salonAError } = await admin.from('salons').insert({ name: `Isolation A ${tenantA}` }).select('id').single()
    if (salonAError || !salonA) throw new Error('Could not create test salon A.')
    createdSalonIds.push(salonA.id)

    const { data: salonB, error: salonBError } = await admin.from('salons').insert({ name: `Isolation B ${tenantB}` }).select('id').single()
    if (salonBError || !salonB) throw new Error('Could not create test salon B.')
    createdSalonIds.push(salonB.id)

    const authA = await admin.auth.admin.createUser({ email: userAEmail, password, email_confirm: true })
    if (authA.error || !authA.data.user) throw new Error('Could not create test user A.')
    createdUserIds.push(authA.data.user.id)
    const authB = await admin.auth.admin.createUser({ email: userBEmail, password, email_confirm: true })
    if (authB.error || !authB.data.user) throw new Error('Could not create test user B.')
    createdUserIds.push(authB.data.user.id)

    const { error: profilesError } = await admin.from('users').insert([
      { id: authA.data.user.id, salon_id: salonA.id, role: 'staff', name: 'Isolation A' },
      { id: authB.data.user.id, salon_id: salonB.id, role: 'staff', name: 'Isolation B' },
    ])
    if (profilesError) throw new Error('Could not create test user profiles.')

    const { data: contact, error: contactError } = await admin.from('contacts').insert({
      salon_id: salonB.id,
      wa_id: `isolation-${suffix}`,
      name: 'Isolation fixture',
    }).select('id').single()
    if (contactError || !contact) throw new Error('Could not create a test contact.')

    const { data: conversation, error: conversationError } = await admin.from('conversations').insert({
      salon_id: salonB.id,
      contact_id: contact.id,
      status: 'bot',
    }).select('id').single()
    if (conversationError || !conversation) throw new Error('Could not create a test conversation.')

    const { error: messageError } = await admin.from('messages').insert({
      salon_id: salonB.id,
      conversation_id: conversation.id,
      direction: 'in',
      sender: 'customer',
      type: 'text',
      body: 'Isolation fixture',
      status: 'received',
    })
    if (messageError) throw new Error('Could not create a test message.')

    const clientA = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const signInA = await clientA.auth.signInWithPassword({ email: userAEmail, password })
    if (signInA.error) throw new Error('Could not authenticate test user A.')

    const contactRows = await clientA.from('contacts').select('id').eq('salon_id', salonB.id)
    const conversationRows = await clientA.from('conversations').select('id').eq('salon_id', salonB.id)
    const messageRows = await clientA.from('messages').select('id').eq('salon_id', salonB.id)
    if (contactRows.error || conversationRows.error || messageRows.error) throw new Error('RLS query returned an unexpected error.')
    if (contactRows.data.length || conversationRows.data.length || messageRows.data.length) {
      throw new Error('Cross-salon data was visible to salon A.')
    }

    const roleChange = await clientA.from('users').update({ role: 'owner' }).eq('id', authA.data.user.id).select('id')
    if (roleChange.error || roleChange.data.length) throw new Error('A staff user could change their own role.')

    console.log('RLS isolation passed: salon A cannot read salon B data or promote its staff account.')
  } finally {
    for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId)
    for (const salonId of createdSalonIds) await admin.from('salons').delete().eq('id', salonId)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Isolation test failed.')
  process.exitCode = 1
})