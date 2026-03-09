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
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows
    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await createQuery()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
  let tipoProfesionalId = payload.tipo_profesional_id?.trim() || null
  if (tipoProfesionalId) {
    const { data: tipoProfesional, error: tipoError } = await db
      .from("tipos_profesionales")
      .select("id")
      .eq("id", tipoProfesionalId)
      .eq("usuario_id", user.id)
      .maybeSingle()
    if (tipoError && !isMissingTableError(tipoError)) {
      return NextResponse.json({ error: tipoError.message }, { status: 500 })
    }
    if (!tipoError && !tipoProfesional) {
      return NextResponse.json({ error: "El tipo profesional seleccionado no existe." }, { status: 404 })
    }
    if (tipoError && isMissingTableError(tipoError)) {
      tipoProfesionalId = null
    }
  }
  const insertPayload = {
    usuario_id: user.id,
    nombre: payload.nombre,
    apellido: payload.apellido ?? "",
    telefono,
    alias_transferencia: aliasTransferencia,
    tipo_profesional_id: tipoProfesionalId,
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
  return NextResponse.json(data)
}
