import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const recursoSchema = z.object({
  nombre: z.string().trim().min(1),
  cantidad_disponible: z.coerce.number().int().positive(),
})

export async function GET() {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: recursos, error } = await db
    .from("recursos")
    .select("*")
    .eq("usuario_id", user.id)
    .order("nombre", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(recursos || [])
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, recursoSchema)
  if (validationResponse) return validationResponse
  const { nombre, cantidad_disponible } = payload
  const cantidad = Number.parseInt(String(cantidad_disponible), 10)

  const { data, error } = await db
    .from("recursos")
    .insert([
      {
        usuario_id: user.id,
        nombre: nombre.trim(),
        cantidad_disponible: cantidad,
      },
    ])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data[0])
}
