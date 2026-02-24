import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const compraSchema = z.object({
  producto_id: z.string().min(1),
  cantidad: z.coerce.number().int().positive(),
  costo_unitario: z.coerce.number().nonnegative(),
  nota: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, compraSchema)
  if (validationResponse) return validationResponse
  const { producto_id, cantidad, costo_unitario, nota } = payload

  const { data, error } = await db
    .from("producto_compras")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        producto_id,
        cantidad,
        costo_unitario,
        nota,
        creado_por: user.id,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ajustar stock del producto
  const { data: current } = await db
    .from("productos")
    .select("stock_actual")
    .eq("id", producto_id)
    .eq("usuario_id", user.id)
    .single()
  const nuevoStock = Number(current?.stock_actual || 0) + Number(cantidad)
  await db.from("productos").update({ stock_actual: nuevoStock }).eq("id", producto_id).eq("usuario_id", user.id)
  return NextResponse.json(data)
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const productoId = url.searchParams.get("producto_id")

  let query = db
    .from("producto_compras")
    .select("*, productos:producto_id(nombre)")
    .eq("usuario_id", user.id)
    .order("created_at", { ascending: false })
  if (productoId) query = query.eq("producto_id", productoId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

