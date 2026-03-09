import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const horarioSchema = z.object({
  dia: z.coerce.number().int().min(0).max(6),
  desde: z.string().min(1),
  hasta: z.string().min(1),
})

const empleadaSchema = z.object({
  nombre: z.string().trim().min(1),
  apellido: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  alias_transferencia: z.string().trim().optional(),
  tipo_profesional_id: z.string().trim().optional().nullable(),
  tipo_profesional_ids: z.array(z.string().trim().min(1)).optional(),
  horarios: z.array(horarioSchema).optional(),
  activo: z.boolean().optional(),
})

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

const uniqueTrimmed = (values: Array<string | null | undefined>) => {
  const unique = new Set<string>()
  values.forEach((value) => {
    const trimmed = String(value || "").trim()
    if (trimmed) unique.add(trimmed)
  })
  return Array.from(unique)
}

const resolveTipoIdsFromPayload = (payload: z.infer<typeof empleadaSchema>) => {
  if (Array.isArray(payload.tipo_profesional_ids)) return uniqueTrimmed(payload.tipo_profesional_ids)
  if (payload.tipo_profesional_id !== undefined) return uniqueTrimmed([payload.tipo_profesional_id])
  return []
}

const validateTipoIds = async (
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipoIds: string[],
) => {
  if (tipoIds.length === 0) return { ids: [] as string[] }

  const { data: tipos, error } = await db
    .from("tipos_profesionales")
    .select("id")
    .eq("usuario_id", userId)
    .in("id", tipoIds)

  if (error) {
    if (isMissingTableError(error)) return { ids: [] as string[] }
    return { ids: [] as string[], error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }

  const foundIds = new Set((tipos || []).map((tipo: any) => String(tipo.id)))
  const missing = tipoIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    return {
      ids: [] as string[],
      error: NextResponse.json({ error: "Uno o más tipos profesionales no existen." }, { status: 404 }),
    }
  }

  return { ids: tipoIds }
}

const syncEmpleadaTipos = async (
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  empleadaId: string,
  tipoIds: string[],
) => {
  const { error: deleteError } = await db
    .from("empleada_tipos_profesionales")
    .delete()
    .eq("usuario_id", userId)
    .eq("empleada_id", empleadaId)

  if (deleteError && !isMissingTableError(deleteError)) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }
  if (deleteError && isMissingTableError(deleteError)) {
    return null
  }
  if (tipoIds.length === 0) return null

  const rows = tipoIds.map((tipoId) => ({
    usuario_id: userId,
    empleada_id: empleadaId,
    tipo_profesional_id: tipoId,
  }))

  const { error: insertError } = await db.from("empleada_tipos_profesionales").insert(rows)
  if (insertError && !isMissingTableError(insertError)) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }
  return null
}

const attachTipoIdsToEmpleadas = async (
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rows: any[],
) => {
  if (!Array.isArray(rows) || rows.length === 0) return { items: [] as any[] }
  const empleadaIds = rows.map((row) => String(row?.id || "")).filter(Boolean)
  if (empleadaIds.length === 0) {
    return {
      items: rows.map((row) => ({ ...row, tipo_profesional_ids: [] })),
    }
  }

  const { data: links, error } = await db
    .from("empleada_tipos_profesionales")
    .select("empleada_id, tipo_profesional_id")
    .eq("usuario_id", userId)
    .in("empleada_id", empleadaIds)

  if (error && !isMissingTableError(error)) {
    return { items: [] as any[], error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }

  const map = new Map<string, string[]>()
  if (!error) {
    ;(links || []).forEach((row: any) => {
      const empleadaId = String(row?.empleada_id || "")
      const tipoId = String(row?.tipo_profesional_id || "")
      if (!empleadaId || !tipoId) return
      const current = map.get(empleadaId) || []
      if (!current.includes(tipoId)) current.push(tipoId)
      map.set(empleadaId, current)
    })
  }

  const items = rows.map((row) => {
    const mapped = map.get(String(row.id)) || []
    const legacy = row?.tipo_profesional_id ? [String(row.tipo_profesional_id)] : []
    const tipo_profesional_ids = mapped.length > 0 ? mapped : legacy
    return {
      ...row,
      tipo_profesional_ids,
    }
  })

  return { items }
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get("include_inactive") === "true"
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createQuery = () => {
    let query = db.from("empleadas").select("*").eq("usuario_id", user.id)
    if (!includeInactive) {
      query = query.eq("activo", true)
    }
    return query.order("created_at", { ascending: true })
  }

  if (pagination.enabled) {
    const { data, error } = await createQuery().range(pagination.from, pagination.to + 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    const hasNext = rows.length > pagination.pageSize
    const pagedItems = hasNext ? rows.slice(0, pagination.pageSize) : rows
    const enriched = await attachTipoIdsToEmpleadas(db, user.id, pagedItems)
    if (enriched.error) return enriched.error
    return NextResponse.json({
      items: enriched.items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await createQuery()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const enriched = await attachTipoIdsToEmpleadas(db, user.id, Array.isArray(data) ? data : [])
  if (enriched.error) return enriched.error
  return NextResponse.json(enriched.items)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, empleadaSchema)
  if (validationResponse) return validationResponse
  const horarios = Array.isArray(payload.horarios) ? payload.horarios : []

  const telefono = payload.telefono?.trim() || null
  const aliasTransferencia = payload.alias_transferencia?.trim() || null
  const requestedTipoIds = resolveTipoIdsFromPayload(payload)
  const validated = await validateTipoIds(db, user.id, requestedTipoIds)
  if (validated.error) return validated.error
  const tipoIds = validated.ids

  const insertPayload = {
    usuario_id: user.id,
    nombre: payload.nombre,
    apellido: payload.apellido ?? "",
    telefono,
    alias_transferencia: aliasTransferencia,
    tipo_profesional_id: tipoIds[0] || null,
    horarios,
    activo: payload.activo ?? true,
  }

  let { data, error } = await db.from("empleadas").insert([insertPayload]).select("*").single()
  if (
    error &&
    (isMissingColumnError(error, "alias_transferencia") || isMissingColumnError(error, "tipo_profesional_id"))
  ) {
    const legacyPayload: any = { ...insertPayload }
    if (isMissingColumnError(error, "alias_transferencia")) {
      delete legacyPayload.alias_transferencia
    }
    if (isMissingColumnError(error, "tipo_profesional_id")) {
      delete legacyPayload.tipo_profesional_id
    }
    ;({ data, error } = await db.from("empleadas").insert([legacyPayload]).select("*").single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.id) {
    const syncError = await syncEmpleadaTipos(db, user.id, data.id, tipoIds)
    if (syncError) return syncError
  }

  return NextResponse.json({
    ...data,
    tipo_profesional_ids: tipoIds,
  })
}
