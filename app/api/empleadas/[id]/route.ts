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
    horarios: z.array(horarioSchema).optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo",
  })

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
  if (payload.horarios !== undefined) updatePayload.horarios = horarios
  if (payload.activo !== undefined) updatePayload.activo = payload.activo

  const { data, error } = await db
    .from("empleadas")
    .update(updatePayload)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
      .select(
        "id, empleada_id, empleada_final_id, empleada_final_nombre, empleada_final_apellido",
      )
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
