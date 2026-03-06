import "server-only"

import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase/server"

type RateLimitOptions = {
  key: string
  max: number
  windowMs: number
}

type RateLimitState = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

type DbRateLimitRow = {
  allowed?: boolean | null
  remaining?: number | string | null
  reset_at?: number | string | null
  retry_after?: number | string | null
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

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const memoryRateLimit = ({ key, max, windowMs }: RateLimitOptions): RateLimitResult => {
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

const normalizeDbRateLimit = (row: DbRateLimitRow | null | undefined): RateLimitResult | null => {
  if (!row || typeof row !== "object") return null
  if (typeof row.allowed !== "boolean") return null

  const remaining = toNumber(row.remaining)
  const resetAt = toNumber(row.reset_at)
  if (remaining === null || resetAt === null) return null

  const retryAfterRaw = toNumber(row.retry_after)
  return {
    allowed: row.allowed,
    remaining: Math.max(0, Math.floor(remaining)),
    resetAt: Math.floor(resetAt),
    retryAfter: retryAfterRaw === null ? undefined : Math.max(1, Math.ceil(retryAfterRaw)),
  }
}

const consumeDbRateLimit = async ({ key, max, windowMs }: RateLimitOptions): Promise<RateLimitResult | null> => {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc("consume_api_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_ms: windowMs,
    })
    if (error) return null
    const row = Array.isArray(data) ? (data[0] as DbRateLimitRow | undefined) : (data as DbRateLimitRow)
    return normalizeDbRateLimit(row)
  } catch {
    return null
  }
}

export const rateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const dbResult = await consumeDbRateLimit(options)
  if (dbResult) return dbResult
  return memoryRateLimit(options)
}

export const clearRateLimit = async (key: string) => {
  store.delete(key)
  if (!isSupabaseConfigured()) return
  try {
    const supabase = createSupabaseAdminClient()
    await supabase.from("api_rate_limits").delete().eq("key", key)
  } catch {
    // No-op: in-memory limiter already cleared.
  }
}

export const getClientId = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const client = forwarded.split(",")[0]?.trim()
  return client || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown"
}
