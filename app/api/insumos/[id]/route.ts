import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const insumoUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    stock_actual: z.coerce.number().int().nonnegative().optional(),
    stock_minimo: z.coerce.number().int().nonnegative().optional(),
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

  const { data: payload, response: validationResponse } = await validateBody(request, insumoUpdateSchema)
  if (validationResponse) return validationResponse
  const updatePayload: Record<string, unknown> = { updated_at: new Date() }
  if (payload.nombre !== undefined) updatePayload.nombre = payload.nombre
  if (payload.stock_actual !== undefined) updatePayload.stock_actual = payload.stock_actual
  if (payload.stock_minimo !== undefined) updatePayload.stock_minimo = payload.stock_minimo
  if (payload.activo !== undefined) updatePayload.activo = payload.activo

  const { data, error } = await db
    .from("insumos")
    .update(updatePayload)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()
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

  const { error } = await db
    .from("insumos")
    .update({ activo: false })
    .eq("id", id)
    .eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
