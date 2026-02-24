type RateLimitOptions = {
  key: string
  max: number
  windowMs: number
}

type RateLimitState = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitState>()

const prune = (now: number) => {
  if (store.size < 1000) return
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key)
    }
  }
}

export const rateLimit = ({ key, max, windowMs }: RateLimitOptions) => {
  const now = Date.now()
  prune(now)
  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + windowMs }
    store.set(key, state)
    return { allowed: true, remaining: max - 1, resetAt: state.resetAt }
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    }
  }

  existing.count += 1
  store.set(key, existing)
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt }
}

export const clearRateLimit = (key: string) => {
  store.delete(key)
}

export const getClientId = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const client = forwarded.split(",")[0]?.trim()
  return (
    client ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  )
}
