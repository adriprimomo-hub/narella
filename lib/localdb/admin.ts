// @ts-nocheck
import { createLocalClient } from "./query"
import { db, generateId } from "./store"
import { persistLocalDb } from "./persist"
import { maybeHashPassword } from "@/lib/auth/password"
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase/server"

const ALLOW_LOCALDB_IN_PRODUCTION = process.env.ALLOW_LOCALDB_IN_PRODUCTION === "true"
const isLocalFallbackAllowed = process.env.NODE_ENV !== "production" || ALLOW_LOCALDB_IN_PRODUCTION
const LOCALDB_DISABLED_ERROR = "Supabase no configurado en producción. Definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."

const findUserByUsername = (username: string) =>
  db.usuarios.find((user) => user.username?.toLowerCase() === username.toLowerCase()) || null

const createUserRecord = async (
  username: string,
  rol: "admin" | "recepcion" | "staff" | "caja" | "solo_turnos" = "recepcion",
  password?: string,
) => {
  const now = new Date().toISOString()
  const hashedPassword = password ? await maybeHashPassword(password) : undefined
  const user = {
    id: generateId(),
    username,
    rol,
    ...(hashedPassword ? { password: hashedPassword, password_hash: hashedPassword } : {}),
    created_at: now,
    updated_at: now,
  }
  db.usuarios.push(user)
  persistLocalDb(db as any)
  return user
}

const createSupabaseAdmin = () => {
  const supabase = createSupabaseAdminClient()

  const normalizeUsername = (value: string) => value.trim().toLowerCase()

  const admin = {
    inviteUserByUsername: async (username: string) => {
      if (!username) return { data: { user: null }, error: { message: "Usuario requerido" } }
      const normalized = normalizeUsername(username)

      const { data: existing, error: existingError } = await supabase
        .from("usuarios")
        .select("*")
        .eq("username", normalized)
        .maybeSingle()

      if (existingError) return { data: { user: null }, error: existingError }
      if (existing) return { data: { user: existing }, error: null }

      const { data, error } = await supabase
        .from("usuarios")
        .insert({ username: normalized, rol: "recepcion" })
        .select("*")
        .maybeSingle()

      return { data: { user: data ?? null }, error }
    },
    createUser: async ({ username, password }: { username: string; password?: string; email_confirm?: boolean }) => {
      if (!username) return { data: { user: null }, error: { message: "Usuario requerido" } }
      const normalized = normalizeUsername(username)

      const { data: existing, error: existingError } = await supabase
        .from("usuarios")
        .select("*")
        .eq("username", normalized)
        .maybeSingle()

      if (existingError) return { data: { user: null }, error: existingError }
      if (existing) return { data: { user: existing }, error: null }

      const passwordHash = password ? await maybeHashPassword(password) : null
      const payload: Record<string, unknown> = {
        username: normalized,
        rol: "recepcion",
      }
      if (passwordHash) payload.password_hash = passwordHash

      const { data, error } = await supabase.from("usuarios").insert(payload).select("*").maybeSingle()
      return { data: { user: data ?? null }, error }
    },
    updateUserById: async (id: string, payload: { username?: string; password?: string; email_confirm?: boolean }) => {
      if (!id) return { data: { user: null }, error: { message: "Usuario requerido" } }

      const updates: Record<string, unknown> = {}
      if (payload.username) updates.username = normalizeUsername(payload.username)
      if (payload.password) updates.password_hash = await maybeHashPassword(payload.password)
      if (Object.keys(updates).length === 0) {
        const { data, error } = await supabase.from("usuarios").select("*").eq("id", id).maybeSingle()
        return { data: { user: data ?? null }, error }
      }

      const { data, error } = await supabase.from("usuarios").update(updates).eq("id", id).select("*").maybeSingle()
      return { data: { user: data ?? null }, error }
    },
    deleteUser: async (id: string) => {
      if (!id) return { data: { user: null }, error: { message: "Usuario requerido" } }
      const { data, error } = await supabase.from("usuarios").delete().eq("id", id).select("*").maybeSingle()
      return { data: { user: data ?? null }, error }
    },
    listUsers: async (params?: { page?: number; perPage?: number }) => {
      const page = params?.page && params.page > 0 ? params.page : 1
      const perPage = params?.perPage && params.perPage > 0 ? params.perPage : 200
      const from = (page - 1) * perPage
      const to = from + perPage - 1

      const { data, error, count } = await supabase
        .from("usuarios")
        .select("id, username, rol, created_at, updated_at", { count: "exact" })
        .order("username", { ascending: true })
        .range(from, to)

      const total = Number.isFinite(count as number) ? (count as number) : data?.length || 0
      const lastPage = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1
      const nextPage = page < lastPage ? page + 1 : null

      return {
        data: {
          users: data || [],
          nextPage,
          lastPage,
          total,
        },
        error,
      }
    },
  }

  return {
    from: supabase.from.bind(supabase),
    auth: {
      admin,
    },
  }
}

const createLocalAdmin = () => ({
  ...createLocalClient(),
  auth: {
    admin: {
      inviteUserByUsername: async (username: string) => {
        if (!username) return { data: { user: null }, error: { message: "Usuario requerido" } }
        const existing = findUserByUsername(username)
        const user = existing || (await createUserRecord(username))
        return { data: { user }, error: null }
      },
      createUser: async ({ username, password }: { username: string; password?: string; email_confirm?: boolean }) => {
        if (!username) return { data: { user: null }, error: { message: "Usuario requerido" } }
        const existing = findUserByUsername(username)
        const user = existing || (await createUserRecord(username, "recepcion", password))
        return { data: { user }, error: null }
      },
      updateUserById: async (id: string, payload: { username?: string; password?: string; email_confirm?: boolean }) => {
        const user = db.usuarios.find((u) => u.id === id)
        if (!user) return { data: { user: null }, error: { message: "Usuario no encontrado" } }
        if (payload.username) user.username = payload.username
        if (payload.password) {
          const hashed = await maybeHashPassword(payload.password)
          ;(user as any).password = hashed
          ;(user as any).password_hash = hashed
        }
        user.updated_at = new Date().toISOString()
        persistLocalDb(db as any)
        return { data: { user }, error: null }
      },
      deleteUser: async (id: string) => {
        const index = db.usuarios.findIndex((u) => u.id === id)
        if (index < 0) return { data: { user: null }, error: { message: "Usuario no encontrado" } }
        const [user] = db.usuarios.splice(index, 1)
        persistLocalDb(db as any)
        return { data: { user }, error: null }
      },
      listUsers: async (_params?: { page?: number; perPage?: number }) => ({
        data: {
          users: db.usuarios,
          nextPage: null,
          lastPage: 1,
          total: db.usuarios.length,
        },
        error: null,
      }),
    },
  },
})

const createBlockedAdmin = () => ({
  from: (_table: string) => {
    throw new Error(LOCALDB_DISABLED_ERROR)
  },
  auth: {
    admin: {
      inviteUserByUsername: async (_username: string) => ({ data: { user: null }, error: { message: LOCALDB_DISABLED_ERROR } }),
      createUser: async (_payload: { username: string; password?: string; email_confirm?: boolean }) => ({
        data: { user: null },
        error: { message: LOCALDB_DISABLED_ERROR },
      }),
      updateUserById: async (_id: string, _payload: { username?: string; password?: string; email_confirm?: boolean }) => ({
        data: { user: null },
        error: { message: LOCALDB_DISABLED_ERROR },
      }),
      deleteUser: async (_id: string) => ({ data: { user: null }, error: { message: LOCALDB_DISABLED_ERROR } }),
      listUsers: async (_params?: { page?: number; perPage?: number }) => ({
        data: {
          users: [],
          nextPage: null,
          lastPage: 1,
          total: 0,
        },
        error: { message: LOCALDB_DISABLED_ERROR },
      }),
    },
  },
})

export const localAdmin = isSupabaseConfigured()
  ? createSupabaseAdmin()
  : isLocalFallbackAllowed
    ? createLocalAdmin()
    : createBlockedAdmin()
