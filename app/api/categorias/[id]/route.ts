import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const categoriaUpdateSchema = z.object({
  nombre: z.string().trim().min(1),
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

  const { data: payload, response: validationResponse } = await validateBody(request, categoriaUpdateSchema)
  if (validationResponse) return validationResponse
  const { nombre } = payload

  const { data, error } = await db
    .from("categorias")
    .update({
      nombre: nombre.trim(),
      updated_at: new Date(),
    })
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

  // Verificar si hay servicios usando esta categoría
  const { data: serviciosUsando } = await db
    .from("servicios")
    .select("id")
    .eq("categoria_id", id)
    .eq("usuario_id", user.id)
    .limit(1)

  if (serviciosUsando && serviciosUsando.length > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar la categoría porque hay servicios que la usan" },
      { status: 400 }
    )
  }

  const { error } = await db.from("categorias").delete().eq("id", id).eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
