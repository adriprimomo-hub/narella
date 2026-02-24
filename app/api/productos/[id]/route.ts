import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const productoUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    descripcion: z.string().optional().nullable(),
    precio_lista: z.coerce.number().nonnegative().optional(),
    precio_descuento: z.coerce.number().nonnegative().optional().nullable(),
    stock_actual: z.coerce.number().int().nonnegative().optional(),
    stock_minimo: z.coerce.number().int().nonnegative().optional(),
    activo: z.boolean().optional(),
    comision_pct: z.coerce.number().nonnegative().optional().nullable(),
    comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
    empleadas_comision: z
      .array(
        z.object({
          empleada_id: z.string().min(1),
          comision_pct: z.coerce.number().nonnegative().optional().nullable(),
          comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
        }),
      )
      .optional(),
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

  const { data: payload, response: validationResponse } = await validateBody(request, productoUpdateSchema)
  if (validationResponse) return validationResponse
  const {
    nombre,
    descripcion,
    precio_lista,
    precio_descuento,
    stock_actual,
    stock_minimo,
    activo,
    comision_pct,
    comision_monto_fijo,
    empleadas_comision,
  } = payload
  const updatePayload: Record<string, unknown> = { updated_at: new Date() }
  if (nombre !== undefined) updatePayload.nombre = nombre
  if (descripcion !== undefined) updatePayload.descripcion = descripcion
  if (precio_lista !== undefined) updatePayload.precio_lista = precio_lista
  if (precio_descuento !== undefined) updatePayload.precio_descuento = precio_descuento ?? null
  if (stock_actual !== undefined) updatePayload.stock_actual = stock_actual
  if (stock_minimo !== undefined) updatePayload.stock_minimo = stock_minimo
  if (activo !== undefined) updatePayload.activo = activo
  if (comision_pct !== undefined) updatePayload.comision_pct = comision_pct ?? null
  if (comision_monto_fijo !== undefined) updatePayload.comision_monto_fijo = comision_monto_fijo ?? null

  const { data, error } = await db
    .from("productos")
    .update(updatePayload)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actualizar comisiones por empleada
  if (Array.isArray(empleadas_comision)) {
    // Eliminar existentes
    await db
      .from("producto_empleada_comisiones")
      .delete()
      .eq("producto_id", id)
      .eq("usuario_id", user.id)

    // Insertar nuevas
    if (empleadas_comision.length) {
      const payload = empleadas_comision
        .filter((e: any) => e.empleada_id)
        .map((e: any) => ({
          usuario_id: user.id,
          producto_id: id,
          empleada_id: e.empleada_id,
          comision_pct: e.comision_pct ?? null,
          comision_monto_fijo: e.comision_monto_fijo ?? null,
        }))
      if (payload.length) {
        await db.from("producto_empleada_comisiones").insert(payload)
      }
    }
  }

  return NextResponse.json(data)
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
    .from("productos")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
