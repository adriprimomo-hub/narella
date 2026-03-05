import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeRole } from "@/lib/roles"
import { db } from "@/lib/localdb/store"
import { LOCALDB_SESSION_COOKIE, sessionCookieOptions } from "@/lib/localdb/session"
import { createSessionToken } from "@/lib/localdb/session-token"
import { validateBody } from "@/lib/api/validation"
import { clearRateLimit, getClientId, rateLimit } from "@/lib/rate-limit"
import { hashPassword, isPasswordHashed, verifyPassword } from "@/lib/auth/password"
import { persistLocalDb } from "@/lib/localdb/persist"
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase/server"

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const ALLOW_LOCALDB_IN_PRODUCTION = process.env.ALLOW_LOCALDB_IN_PRODUCTION === "true"

export async function POST(request: Request) {
  const { data, response: errorResponse } = await validateBody(request, loginSchema)
  if (errorResponse) return errorResponse

  if (!isSupabaseConfigured() && process.env.NODE_ENV === "production" && !ALLOW_LOCALDB_IN_PRODUCTION) {
    return NextResponse.json(
      { error: "Backend no configurado. Definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    )
  }

  const username = data.username.toLowerCase()
  const password = data.password

  const clientId = getClientId(request)
  const limitKey = `login:${clientId}:${username}`
  const limit = rateLimit({ key: limitKey, max: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_WINDOW_MS })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta nuevamente mas tarde." },
      {
        status: 429,
        headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined,
      },
    )
  }

  let candidates: any[] = []

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient()
    const { data: rows, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("username", username)

    if (error) {
      return NextResponse.json({ error: "Error al validar credenciales" }, { status: 500 })
    }

    candidates = Array.isArray(rows) ? rows : []
  } else {
    candidates = db.usuarios.filter((candidate: any) => candidate.username?.toLowerCase() === username)
  }

  const matches: Array<{ user: any; storedPassword: string }> = []
  for (const candidate of candidates) {
    const storedPassword = candidate?.password_hash || candidate?.password
    if (!storedPassword) continue
    const isValidCandidate = await verifyPassword(password, storedPassword)
    if (isValidCandidate) {
      matches.push({ user: candidate, storedPassword })
    }
  }

  if (matches.length === 0) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 })
  }

  if (matches.length > 1) {
    return NextResponse.json({ error: "Hay mas de un usuario con esas credenciales. Cambia username o contraseña." }, { status: 409 })
  }

  const { user, storedPassword } = matches[0]

  if (!isPasswordHashed(storedPassword)) {
    const nextHash = await hashPassword(password)
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseAdminClient()
      await supabase.from("usuarios").update({ password_hash: nextHash }).eq("id", user.id)
    } else {
      user.password = nextHash
      ;(user as any).password_hash = nextHash
      persistLocalDb(db as any)
    }
  }

  clearRateLimit(limitKey)

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      rol: normalizeRole(user.rol),
    },
  })

  response.cookies.set(LOCALDB_SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions)

  return response
}
