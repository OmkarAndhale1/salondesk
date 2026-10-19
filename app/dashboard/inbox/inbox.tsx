'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MessageRow {
  id: string
  body: string | null
  sender: 'customer' | 'bot' | 'staff'
  direction: 'in' | 'out'
  created_at: string
}

interface ContactRow {
  id: string
  name: string | null
  wa_id: string
}

interface ConversationRow {
  id: string
  status: 'bot' | 'human' | 'closed'
  created_at: string
  contact: ContactRow | null
  messages: MessageRow[]
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function Inbox() {
  const supabase = createClient()
  const [salonId, setSalonId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | undefined

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setError('Your session has expired. Sign in again.')
        return
      }
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('salon_id')
        .eq('id', user.id)
        .single()
      if (profileError || !profile?.salon_id) {
        if (active) setError('This account is not assigned to a salon.')
        return
      }
      const tenantId = profile.salon_id
      if (active) setSalonId(tenantId)

      async function refreshList() {
        const { data, error: queryError } = await supabase
          .from('conversations')
          .select('id,status,created_at,contact:contacts(id,name,wa_id),messages(id,body,sender,direction,created_at)')
          .neq('status', 'closed')
          .order('created_at', { ascending: false })
        if (!active) return
        if (queryError) {
          setError('Could not load conversations. Refresh and try again.')
          setLoading(false)
          return
        }
        const ordered = ((data ?? []) as unknown as ConversationRow[]).map((conversation) => ({
          ...conversation,
          messages: [...(conversation.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        }))
        setConversations(ordered)
        setLoading(false)
      }

      await refreshList()
      channel = supabase
        .channel(`inbox-${tenantId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `salon_id=eq.${tenantId}` }, () => void refreshList())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `salon_id=eq.${tenantId}` }, () => void refreshList())
        .subscribe()
    }

    void load()
    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    async function loadMessages() {
      if (!selectedId) {
        setMessages([])
        return
      }
      const { data, error: queryError } = await supabase
        .from('messages')
        .select('id,body,sender,direction,created_at')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true })
      if (!active) return
      if (queryError) {
        setError('Could not load this conversation.')
        return
      }
      setMessages((data ?? []) as MessageRow[])
    }
    void loadMessages()
    return () => { active = false }
  }, [selectedId, supabase, conversations])

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || !reply.trim() || sending) return
    setSending(true)
    setError(null)
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salon_id: salonId, conversation_id: selectedId, sender: 'staff', text: reply.trim() }),
    })
    if (!response.ok) {
      setError(response.status === 401 ? 'Your session has expired. Sign in again.' : 'Message could not be sent.')
    } else {
      setReply('')
      const { data } = await supabase.from('messages').select('id,body,sender,direction,created_at').eq('conversation_id', selectedId).order('created_at', { ascending: true })
      setMessages((data ?? []) as MessageRow[])
    }
    setSending(false)
  }

  async function toggleMode(conversation: ConversationRow) {
    const nextStatus = conversation.status === 'human' ? 'bot' : 'human'
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ status: nextStatus })
      .eq('id', conversation.id)
    if (updateError) setError('Could not update conversation mode.')
  }

  const visibleConversations = conversations.filter((conversation) => {
    const query = search.trim().toLocaleLowerCase()
    const contact = conversation.contact
    return !query || `${contact?.name ?? ''} ${contact?.wa_id ?? ''}`.toLocaleLowerCase().includes(query)
  })
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null

  return (
    <main className="h-[calc(100dvh-64px)] min-h-[560px] md:h-screen">
      <div className="grid h-full md:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-zinc-800`}>
          <header className="border-b border-zinc-800 px-5 py-5">
            <h1 className="text-xl font-semibold">Inbox</h1>
            <p className="mt-1 text-sm text-zinc-500">{conversations.length} open conversations</p>
            <label className="mt-4 block">
              <span className="sr-only">Search conversations</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
            </label>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && <p className="p-5 text-sm text-zinc-500">Loading conversations…</p>}
            {!loading && visibleConversations.length === 0 && <p className="p-5 text-sm text-zinc-500">No conversations found.</p>}
            {visibleConversations.map((conversation) => {
              const latest = conversation.messages.at(-1)
              const unread = latest?.sender === 'customer'
              return (
                <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-zinc-800/80 px-5 py-4 text-left hover:bg-zinc-900 ${selectedId === conversation.id ? 'bg-zinc-900' : ''}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{conversation.contact?.name || conversation.contact?.wa_id || 'Unknown customer'}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">{latest?.body || 'No messages yet'}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-[11px] text-zinc-500">{latest ? shortTime(latest.created_at) : ''}</span>
                      <span className={`h-2 w-2 rounded-full ${unread ? 'bg-emerald-400' : 'bg-zinc-700'}`} aria-label={unread ? 'Latest message from customer' : 'No unread message'} />
                    </span>
                  </span>
                  <span className={`mt-3 inline-block border px-2 py-0.5 text-[10px] uppercase tracking-wider ${conversation.status === 'human' ? 'border-sky-500/30 text-sky-300' : 'border-emerald-500/30 text-emerald-300'}`}>
                    {conversation.status === 'human' ? 'Human' : 'Bot'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 flex-col`}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Select a conversation</div>
          ) : (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-4 md:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <button onClick={() => setSelectedId(null)} className="text-sm text-zinc-400 md:hidden" aria-label="Back to conversations">←</button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selected.contact?.name || 'Customer'}</h2>
                    <p className="truncate text-xs text-zinc-500">{selected.contact?.wa_id}</p>
                  </div>
                </div>
                <button onClick={() => void toggleMode(selected)} className="shrink-0 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-500">
                  {selected.status === 'human' ? 'Hand back to bot' : 'Take over'}
                </button>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 md:px-8">
                {messages.map((message) => {
                  const customer = message.sender === 'customer'
                  return (
                    <div key={message.id} className={`flex ${customer ? 'justify-start' : 'justify-end'}`}>
                      <article className={`max-w-[82%] border px-4 py-3 ${customer ? 'border-zinc-700 bg-zinc-900' : message.sender === 'bot' ? 'border-emerald-500/20 bg-emerald-950/40' : 'border-sky-500/20 bg-sky-950/40'}`}>
                        {!customer && <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">{message.sender}</p>}
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{message.body ?? ''}</p>
                        <time className="mt-2 block text-right text-[10px] text-zinc-500">{shortTime(message.created_at)}</time>
                      </article>
                    </div>
                  )
                })}
                {messages.length === 0 && <p className="text-center text-sm text-zinc-500">No messages in this conversation yet.</p>}
              </div>
              <form onSubmit={(event) => void submitReply(event)} className="border-t border-zinc-800 p-4 md:px-6">
                {error && <p role="alert" className="mb-3 text-sm text-rose-400">{error}</p>}
                <div className="flex items-end gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Reply to customer</span>
                    <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={2} maxLength={4096} placeholder="Write a reply…" className="w-full resize-none border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                  </label>
                  <button type="submit" disabled={sending || !reply.trim()} className="bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}