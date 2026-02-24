import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const ventaSchema = z.object({
  producto_id: z.string().min(1),
  cliente_id: z.string().optional().nullable(),
  cantidad: z.coerce.number().int().positive(),
  precio_unitario: z.coerce.number().nonnegative().optional(),
  metodo_pago: z.string().min(1),
})

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const { data: payload, response: validationResponse } = await validateBody(request, ventaSchema)
  if (validationResponse) return validationResponse
  const { producto_id, cliente_id, cantidad, precio_unitario, metodo_pago } = payload

  let finalPrecioUnitario = Number(precio_unitario)
  if (!isAdmin) {
    const { data: producto } = await db
      .from("productos")
      .select("precio_lista, precio_descuento")
      .eq("id", producto_id)
      .eq("usuario_id", user.id)
      .single()
    finalPrecioUnitario = Number(producto?.precio_descuento ?? producto?.precio_lista ?? 0)
  }

  const ventaPayload = {
    usuario_id: user.id,
    creado_por_username: username,
    producto_id,
    cliente_id: cliente_id || null,
    tipo: "venta",
    cantidad,
    precio_unitario: finalPrecioUnitario,
    metodo_pago,
    creado_por: user.id,
  }

  const { data, error } = await db
    .from("producto_movimientos")
    .insert([ventaPayload])
    .select("id, producto_id, cliente_id, cantidad, precio_unitario, metodo_pago, nota, created_at")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ajustar stock
  const { data: current } = await db
    .from("productos")
    .select("stock_actual")
    .eq("id", producto_id)
    .eq("usuario_id", user.id)
    .single()
  const nuevoStock = Number(current?.stock_actual || 0) - Number(cantidad)
  await db.from("productos").update({ stock_actual: nuevoStock }).eq("id", producto_id).eq("usuario_id", user.id)

  // Registrar en caja
  const monto = Number(cantidad) * Number(finalPrecioUnitario)
  await db.from("caja_movimientos").insert([
    {
      usuario_id: user.id,
      creado_por_username: username,
      medio_pago: metodo_pago,
      tipo: "ingreso",
      monto,
      motivo: "Venta producto",
      source_tipo: "producto_venta",
      source_id: data.id,
      creado_por: user.id,
    },
  ])

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
    .from("producto_movimientos")
    .select(
      "id, usuario_id, producto_id, cliente_id, cantidad, precio_unitario, metodo_pago, nota, created_at, productos:producto_id(nombre), clientes:cliente_id(nombre, apellido)",
    )
    .eq("usuario_id", user.id)
    .eq("tipo", "venta")
    .order("created_at", { ascending: false })
  if (productoId) query = query.eq("producto_id", productoId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
