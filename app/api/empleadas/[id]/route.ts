import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const horarioSchema = z.object({
  dia: z.coerce.number().int().min(0).max(6),
  desde: z.string().min(1),
  hasta: z.string().min(1),
})

const empleadaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    apellido: z.string().trim().optional(),
    telefono: z.string().trim().optional(),
    alias_transferencia: z.string().trim().optional(),
    tipo_profesional_id: z.string().trim().optional().nullable(),
    tipo_profesional_ids: z.array(z.string().trim().min(1)).optional(),
    horarios: z.array(horarioSchema).optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo",
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

const resolveTipoIdsForUpdate = (payload: z.infer<typeof empleadaUpdateSchema>) => {
  if (Array.isArray(payload.tipo_profesional_ids)) return uniqueTrimmed(payload.tipo_profesional_ids)
  if (payload.tipo_profesional_id !== undefined) return uniqueTrimmed([payload.tipo_profesional_id])
  return null
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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, empleadaUpdateSchema)
  if (validationResponse) return validationResponse
  const horarios = Array.isArray(payload.horarios) ? payload.horarios : []
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (payload.nombre !== undefined) updatePayload.nombre = payload.nombre
  if (payload.apellido !== undefined) updatePayload.apellido = payload.apellido
  if (payload.telefono !== undefined) updatePayload.telefono = payload.telefono?.trim() || null
  if (payload.alias_transferencia !== undefined) {
    updatePayload.alias_transferencia = payload.alias_transferencia?.trim() || null
  }

  const tipoIdsToUpdate = resolveTipoIdsForUpdate(payload)
  let validatedTipoIds: string[] | null = null
  if (tipoIdsToUpdate !== null) {
    const validated = await validateTipoIds(db, user.id, tipoIdsToUpdate)
    if (validated.error) return validated.error
    validatedTipoIds = validated.ids
    updatePayload.tipo_profesional_id = validatedTipoIds[0] || null
  }

  if (payload.horarios !== undefined) updatePayload.horarios = horarios
  if (payload.activo !== undefined) updatePayload.activo = payload.activo

  let { data, error } = await db
    .from("empleadas")
    .update(updatePayload)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select("*")
    .single()

  if (
    error &&
    (isMissingColumnError(error, "alias_transferencia") || isMissingColumnError(error, "tipo_profesional_id"))
  ) {
    const legacyPayload: any = { ...updatePayload }
    if (isMissingColumnError(error, "alias_transferencia")) {
      delete legacyPayload.alias_transferencia
    }
    if (isMissingColumnError(error, "tipo_profesional_id")) {
      delete legacyPayload.tipo_profesional_id
    }
    ;({ data, error } = await db
      .from("empleadas")
      .update(legacyPayload)
      .eq("id", id)
      .eq("usuario_id", user.id)
      .select("*")
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (validatedTipoIds !== null) {
    const syncError = await syncEmpleadaTipos(db, user.id, id, validatedTipoIds)
    if (syncError) return syncError
  }

  return NextResponse.json({
    ...data,
    tipo_profesional_ids:
      validatedTipoIds !== null
        ? validatedTipoIds
        : data?.tipo_profesional_id
          ? [String(data.tipo_profesional_id)]
          : [],
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: staff } = await db
    .from("empleadas")
    .select("id, nombre, apellido")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .single()

  if (staff) {
    const { data: turnos } = await db
      .from("turnos")
      .select("id, empleada_id, empleada_final_id, empleada_final_nombre, empleada_final_apellido")
      .eq("usuario_id", user.id)

    if (Array.isArray(turnos) && turnos.length > 0) {
      for (const turno of turnos) {
        const patch: Record<string, unknown> = {}
        const finalMatches = turno.empleada_final_id === id || (!turno.empleada_final_id && turno.empleada_id === id)
        if (finalMatches) {
          if (turno.empleada_final_nombre == null) patch.empleada_final_nombre = staff.nombre
          if (turno.empleada_final_apellido == null) patch.empleada_final_apellido = staff.apellido ?? null
        }

        if (Object.keys(patch).length > 0) {
          await db.from("turnos").update(patch).eq("id", turno.id).eq("usuario_id", user.id)
        }
      }
    }
  }

  const { error } = await db
    .from("empleadas")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
