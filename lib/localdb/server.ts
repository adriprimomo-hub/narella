import "server-only"

import { cookies } from "next/headers"
import { createLocalClient } from "./query"
import { LOCALDB_SESSION_COOKIE } from "./session"
import { parseSessionToken } from "./session-token"
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase/server"

type TenantContext = {
  tenantId: string | null
  tenantUserIds: string[] | null
}

const ALLOW_LOCALDB_IN_PRODUCTION = process.env.ALLOW_LOCALDB_IN_PRODUCTION === "true"

const applyTenantId = (payload: any, tenantId: string | null) => {
  if (!tenantId) return payload
  if (!payload || typeof payload !== "object") return payload

  const applyRow = (row: any) => {
    if (!row || typeof row !== "object") return row
    if (!("usuario_id" in row)) return row
    return { ...row, usuario_id: tenantId }
  }

  if (Array.isArray(payload)) return payload.map(applyRow)
  return applyRow(payload)
}

class TenantQuery {
  private query: any
  private context: TenantContext

  constructor(query: any, context: TenantContext) {
    this.query = query
    this.context = context
  }

  select(columns?: string, options?: any) {
    this.query = this.query.select(columns as any, options)
    return this
  }

  insert(payload: any, options?: any) {
    this.query = this.query.insert(applyTenantId(payload, this.context.tenantId), options)
    return this
  }

  update(payload: any) {
    this.query = this.query.update(applyTenantId(payload, this.context.tenantId))
    return this
  }

  upsert(payload: any, options?: any) {
    this.query = this.query.upsert(applyTenantId(payload, this.context.tenantId), options)
    return this
  }

  delete() {
    this.query = this.query.delete()
    return this
  }

  eq(column: string, value: any) {
    if (column === "usuario_id" && this.context.tenantUserIds?.length) {
      this.query = this.query.in("usuario_id", this.context.tenantUserIds)
      return this
    }
    this.query = this.query.eq(column, value)
    return this
  }

  neq(column: string, value: any) {
    this.query = this.query.neq(column, value)
    return this
  }

  lt(column: string, value: any) {
    this.query = this.query.lt(column, value)
    return this
  }

  lte(column: string, value: any) {
    this.query = this.query.lte(column, value)
    return this
  }

  gt(column: string, value: any) {
    this.query = this.query.gt(column, value)
    return this
  }

  gte(column: string, value: any) {
    this.query = this.query.gte(column, value)
    return this
  }

  in(column: string, value: any[]) {
    if (column === "usuario_id" && this.context.tenantUserIds?.length) {
      this.query = this.query.in("usuario_id", this.context.tenantUserIds)
      return this
    }
    this.query = this.query.in(column, value)
    return this
  }

  is(column: string, value: any) {
    this.query = this.query.is(column, value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.query = this.query.order(column, options)
    return this
  }

  limit(count: number) {
    this.query = this.query.limit(count)
    return this
  }

  single() {
    this.query = this.query.single()
    return this
  }

  maybeSingle() {
    this.query = this.query.maybeSingle()
    return this
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ) {
    return this.query.then(onfulfilled, onrejected)
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  const rawSession = cookieStore.get(LOCALDB_SESSION_COOKIE)?.value ?? null
  const sessionId = parseSessionToken(rawSession)

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production" && !ALLOW_LOCALDB_IN_PRODUCTION) {
      throw new Error("Supabase no configurado. Definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.")
    }
    return createLocalClient(sessionId)
  }

  const supabase = createSupabaseAdminClient()
  let user: any = null
  let tenantContext: TenantContext = { tenantId: null, tenantUserIds: null }

  if (sessionId) {
    const { data, error } = await supabase.from("usuarios").select("*").eq("id", sessionId).maybeSingle()
    if (!error && data) {
      user = data
      const tenantId = user.tenant_id || user.id || null
      if (tenantId) {
        const { data: tenantUsers, error: tenantError } = await supabase
          .from("usuarios")
          .select("id")
          .or(`id.eq.${tenantId},tenant_id.eq.${tenantId}`)

        if (!tenantError && Array.isArray(tenantUsers)) {
          const ids = new Set<string>([tenantId, ...tenantUsers.map((row: any) => row.id).filter(Boolean)])
          tenantContext = { tenantId, tenantUserIds: Array.from(ids) }
        } else {
          tenantContext = { tenantId, tenantUserIds: [tenantId] }
        }
      }
    }
  }

  const authUser = user
    ? {
        ...(() => {
          const { password, password_hash, ...safe } = user
          return safe
        })(),
        user_metadata: { username: user.username },
      }
    : null

  return {
    from: (table: string) => new TenantQuery(supabase.from(table), tenantContext),
    auth: {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    },
  }
}
