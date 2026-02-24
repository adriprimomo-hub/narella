import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const servicioUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    duracion_minutos: z.coerce.number().int().positive().optional(),
    precio_lista: z.coerce.number().nonnegative().optional(),
    precio_descuento: z.coerce.number().nonnegative().optional().nullable(),
    activo: z.boolean().optional(),
    empleadas_habilitadas: z.array(z.string().min(1)).optional(),
    empleadas_comision: z
      .array(
        z.object({
          empleada_id: z.string().min(1),
          comision_pct: z.coerce.number().nonnegative().optional().nullable(),
          comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
        }),
      )
      .optional(),
    comision_pct: z.coerce.number().nonnegative().optional().nullable(),
    comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
    categoria_id: z.string().optional().nullable(),
    recurso_id: z.string().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo",
  })

const resolveCategoriaValue = async (
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoriaId: string | null | undefined,
) => {
  if (!categoriaId) return "principal"
  const { data, error } = await db
    .from("categorias")
    .select("nombre")
    .eq("id", categoriaId)
    .eq("usuario_id", userId)
    .maybeSingle()
  if (error) return "principal"
  const nombre = String(data?.nombre || "").trim()
  return nombre || "principal"
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

  const { data: payload, response: validationResponse } = await validateBody(request, servicioUpdateSchema)
  if (validationResponse) return validationResponse
  const {
    nombre,
    duracion_minutos,
    precio_lista,
    precio_descuento,
    activo,
    empleadas_habilitadas,
    empleadas_comision,
    comision_pct,
    comision_monto_fijo,
    categoria_id,
    recurso_id,
  } = payload
  const updatePayload: Record<string, unknown> = { updated_at: new Date() }
  if (nombre !== undefined) updatePayload.nombre = nombre
  if (duracion_minutos !== undefined) updatePayload.duracion_minutos = duracion_minutos
  if (precio_lista !== undefined) {
    updatePayload.precio_lista = precio_lista
    updatePayload.precio = precio_lista
  }
  if (precio_descuento !== undefined) updatePayload.precio_descuento = precio_descuento ?? null
  if (activo !== undefined) updatePayload.activo = activo
  if (empleadas_habilitadas !== undefined) {
    updatePayload.empleadas_habilitadas = Array.isArray(empleadas_habilitadas) ? empleadas_habilitadas : []
  }
  if (comision_pct !== undefined) updatePayload.comision_pct = comision_pct ?? null
  if (comision_monto_fijo !== undefined) updatePayload.comision_monto_fijo = comision_monto_fijo ?? null
  if (categoria_id !== undefined) {
    updatePayload.categoria_id = categoria_id || null
    updatePayload.categoria = await resolveCategoriaValue(db, user.id, categoria_id)
  }
  if (recurso_id !== undefined) updatePayload.recurso_id = recurso_id || null

  const { data, error } = await db
    .from("servicios")
    .update(updatePayload)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(empleadas_comision)) {
    await db.from("servicio_empleada_comisiones").delete().eq("servicio_id", id).eq("usuario_id", user.id)
    const payload = empleadas_comision
      .filter((e: any) => e.empleada_id)
      .map((e: any) => ({
        usuario_id: user.id,
        servicio_id: id,
        empleada_id: e.empleada_id,
        comision_pct: e.comision_pct ?? null,
        comision_monto_fijo: e.comision_monto_fijo ?? null,
      }))
    if (payload.length) {
      await db.from("servicio_empleada_comisiones").insert(payload)
    }
  }

  return NextResponse.json(data[0])
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await db
    .from("servicios")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
