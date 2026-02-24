import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const recursoUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    cantidad_disponible: z.coerce.number().int().positive().optional(),
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

  const { data: payload, response: validationResponse } = await validateBody(request, recursoUpdateSchema)
  if (validationResponse) return validationResponse
  const { nombre, cantidad_disponible } = payload
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (nombre !== undefined) {
    updates.nombre = nombre.trim()
  }
  if (cantidad_disponible !== undefined) {
    const cantidad = Number.parseInt(String(cantidad_disponible), 10)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 })
    }
    updates.cantidad_disponible = cantidad
  }

  const { data, error } = await db
    .from("recursos")
    .update(updates)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  const { data: serviciosUsando } = await db
    .from("servicios")
    .select("id")
    .eq("recurso_id", id)
    .eq("usuario_id", user.id)
    .limit(1)

  if (serviciosUsando && serviciosUsando.length > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar el recurso porque hay servicios que lo usan" },
      { status: 400 },
    )
  }

  const { error } = await db.from("recursos").delete().eq("id", id).eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
