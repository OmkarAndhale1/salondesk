'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  direction: 'in' | 'out'
  sender: 'customer' | 'bot' | 'staff'
  body: string | null
  created_at: string
}

interface Conversation {
  id: string
  status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DEMO_SALON_ID = process.env.NEXT_PUBLIC_DEMO_SALON_ID ?? ''

// ── Component ─────────────────────────────────────────────────────────────────

export default function MockChatClient() {
  const [salonId, setSalonId]         = useState(DEMO_SALON_ID)
  const [waId, setWaId]               = useState('')
  const [customerName, setCustomerName] = useState('')
  const [started, setStarted]         = useState(false)
  const [messages, setMessages]       = useState<Message[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [text, setText]               = useState('')
  const [replyText, setReplyText]     = useState('')
  const [sending, setSending]         = useState(false)
  const [replying, setReplying]       = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Polling ─────────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!salonId || !waId) return
    try {
      const res = await fetch(
        `/api/mock-chat/messages?salon_id=${encodeURIComponent(salonId)}&wa_id=${encodeURIComponent(waId)}`
      )
      if (!res.ok) return
      const data = (await res.json()) as { messages: Message[]; conversation: Conversation | null }
      setMessages(data.messages)
      setConversation(data.conversation)
    } catch {
      // network glitch — silently retry on next tick
    }
  }, [salonId, waId])

  useEffect(() => {
    if (!started) return
    void fetchMessages()
    const timer = setInterval(() => void fetchMessages(), 2000)
    return () => clearInterval(timer)
  }, [started, fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function handleStart(e: React.FormEvent) {
    e.preventDefault()
    if (!salonId.trim() || !waId.trim()) return
    setError(null)
    setStarted(true)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/webhook/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salon_id: salonId,
          wa_id: waId,
          name: customerName || undefined,
          text: text.trim(),
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error: unknown }
        setError(String(d.error))
      } else {
        setText('')
        await fetchMessages()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !conversation || replying) return
    setReplying(true)
    setError(null)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salon_id: salonId,
          conversation_id: conversation.id,
          sender: 'staff',
          text: replyText.trim(),
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error: unknown }
        setError(String(d.error))
      } else {
        setReplyText('')
        await fetchMessages()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setReplying(false)
    }
  }

  // ── Setup screen ──────────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Salon<span className="text-emerald-400">Desk</span>
            </h1>
            <p className="text-zinc-400 mt-2 text-sm">WhatsApp mock chat for local testing</p>
          </div>

          {/* Form */}
          <form onSubmit={handleStart} className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 space-y-4 shadow-2xl">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Salon ID
              </label>
              <input
                id="salon-id-input"
                type="text"
                value={salonId}
                onChange={e => setSalonId(e.target.value)}
                placeholder="Paste NEXT_PUBLIC_DEMO_SALON_ID here"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Customer Phone (wa_id)
              </label>
              <input
                id="wa-id-input"
                type="text"
                value={waId}
                onChange={e => setWaId(e.target.value)}
                placeholder="e.g. 919876543210"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Customer Name <span className="text-zinc-600 normal-case font-normal">(optional)</span>
              </label>
              <input
                id="customer-name-input"
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              id="start-chat-btn"
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 rounded-xl transition-colors duration-150 text-sm mt-2"
            >
              Open Chat
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Chat screen ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 flex items-start justify-center gap-6 p-6 pt-10">

      {/* ── Left panel: config + staff reply ─────────────────────────── */}
      <div className="w-72 flex-shrink-0 space-y-4">
        {/* Session info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Session</p>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-zinc-500">Salon ID</span>
              <p className="text-white font-mono text-xs truncate mt-0.5">{salonId}</p>
            </div>
            <div>
              <span className="text-zinc-500">Customer</span>
              <p className="text-white mt-0.5">{customerName || '—'}</p>
            </div>
            <div>
              <span className="text-zinc-500">Phone (wa_id)</span>
              <p className="text-emerald-400 font-mono mt-0.5">{waId}</p>
            </div>
            {conversation && (
              <div>
                <span className="text-zinc-500">Status</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {conversation.status}
                </span>
              </div>
            )}
          </div>
          <button
            id="reset-btn"
            onClick={() => { setStarted(false); setMessages([]); setConversation(null) }}
            className="mt-4 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Change session
          </button>
        </div>

        {/* Staff reply */}
        {conversation && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Reply as Staff
            </p>
            <form onSubmit={e => void handleReply(e)} className="space-y-2">
              <textarea
                id="staff-reply-input"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type a staff reply…"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
              <button
                id="staff-reply-btn"
                type="submit"
                disabled={replying || !replyText.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl transition-colors text-sm"
              >
                {replying ? 'Sending…' : 'Send as Staff'}
              </button>
            </form>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* ── Phone frame ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 w-96">
        <div
          className="rounded-[2.5rem] overflow-hidden shadow-2xl border-[6px] border-zinc-700 flex flex-col"
          style={{ height: '780px', background: '#e5ddd5' }}
        >
          {/* WhatsApp header */}
          <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-emerald-300 flex items-center justify-center text-emerald-900 font-bold text-sm flex-shrink-0">
              GS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Glow Salon</p>
              <p className="text-emerald-200 text-xs">
                {messages.length > 0 ? `${messages.length} messages` : 'online'}
              </p>
            </div>
            <div className="flex gap-3 text-white opacity-60">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </div>
          </div>

          {/* Messages area */}
          <div
            className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23b8a99e' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-zinc-500 text-sm text-center bg-white/60 backdrop-blur-sm rounded-xl px-4 py-3">
                  No messages yet.<br />Send the first one below ↓
                </p>
              </div>
            ) : (
              messages.map(msg => {
                const isCustomer = msg.direction === 'in'
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm relative ${
                        isCustomer
                          ? 'bg-[#DCF8C6] rounded-br-sm'
                          : 'bg-white rounded-bl-sm'
                      }`}
                    >
                      {!isCustomer && (
                        <p className="text-xs font-semibold text-blue-600 mb-0.5">
                          {msg.sender === 'bot' ? '🤖 Bot' : '👤 Staff'}
                        </p>
                      )}
                      <p className="text-zinc-800 text-sm leading-snug break-words">
                        {msg.body ?? ''}
                      </p>
                      <p className="text-zinc-400 text-[10px] text-right mt-1 leading-none">
                        {formatTime(msg.created_at)}
                        {isCustomer && (
                          <span className="ml-1 text-blue-500">✓✓</span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <form
            onSubmit={e => void handleSend(e)}
            className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 flex-shrink-0"
          >
            <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center">
              <input
                id="customer-message-input"
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Message"
                className="flex-1 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none bg-transparent"
              />
            </div>
            <button
              id="send-message-btn"
              type="submit"
              disabled={sending || !text.trim()}
              className="w-10 h-10 rounded-full bg-[#075E54] hover:bg-[#128C7E] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              {sending ? (
                <svg className="w-4 h-4 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </form>
        </div>

        {/* Polling indicator */}
        <p className="text-center text-zinc-600 text-xs mt-3">
          ↻ polling every 2s
        </p>
      </div>
    </div>
  )
}
