interface Counter {
  count: number
  expiresAt: number
}

const counters = new Map<string, Counter>()

export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (redisUrl && redisToken) {
    try {
      const redisKey = `salondesk:rate:${key}`
      const response = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', redisKey], ['EXPIRE', redisKey, windowSeconds, 'NX']]),
        signal: AbortSignal.timeout(2500),
      })
      if (response.ok) {
        const result: unknown = await response.json()
        if (Array.isArray(result) && typeof result[0] === 'object' && result[0] !== null && 'result' in result[0]) {
          const count = Number((result[0] as { result: unknown }).result)
          if (Number.isFinite(count)) return count <= limit
        }
      }
    } catch {
      // Redis is optional; continue with the process-local fallback.
    }
  }

  const now = Date.now()
  const current = counters.get(key)
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + windowSeconds * 1000 }
    : { count: current.count + 1, expiresAt: current.expiresAt }
  counters.set(key, next)
  if (counters.size > 10_000) {
    for (const [entryKey, entry] of counters) if (entry.expiresAt <= now) counters.delete(entryKey)
  }
  return next.count <= limit
}

export function rateLimitIdentity(request: Request, userId?: string) {
  if (userId) return `user:${userId}`
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return `ip:${forwarded || request.headers.get('x-real-ip') || 'unknown'}`
}