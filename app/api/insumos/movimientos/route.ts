import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const movimientoSchema = z.object({
  insumo_id: z.string().min(1),
  tipo: z.enum(["compra", "ajuste_positivo", "ajuste_negativo", "entrega"]),
  cantidad: z.coerce.number().positive(),
  empleado_id: z.string().optional().nullable(),
  nota: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(request.url)
  const insumoId = url.searchParams.get("insumo_id")
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createQuery = () => {
    let query = db
      .from("insumo_movimientos")
      .select("*, insumos:insumo_id(nombre), empleadas:empleado_id(nombre, apellido)")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })

    if (insumoId) query = query.eq("insumo_id", insumoId)
    return query
  }

  if (pagination.enabled) {
    const { data, error } = await createQuery().range(pagination.from, pagination.to + 1)

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({
          items: [],
          pagination: buildPaginationMeta(pagination.page, pagination.pageSize, false),
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const hasNext = rows.length > pagination.pageSize
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows

    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await createQuery()

  if (error) {
    // Si la tabla aun no existe en el proyecto nuevo, devolver vacio para que la UI no falle.
    if (error.code === "42P01") {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  try {
    const { data: payload, response: validationResponse } = await validateBody(request, movimientoSchema)
    if (validationResponse) return validationResponse
    const { insumo_id, tipo, cantidad, empleado_id, nota } = payload

    const cantidadNumber = Number(cantidad)
    if (tipo === "entrega" && !empleado_id) {
      return NextResponse.json({ error: "Selecciona quien recibe el insumo" }, { status: 400 })
    }

    const signo =
      tipo === "compra" || tipo === "ajuste_positivo"
        ? 1
        : tipo === "ajuste_negativo" || tipo === "entrega"
          ? -1
          : 0

    let nuevoStock: number | null = null
    if (signo !== 0) {
      const { data: current, error: stockError } = await db
        .from("insumos")
        .select("stock_actual")
        .eq("id", insumo_id)
        .eq("usuario_id", user.id)
        .single()

      if (stockError) {
        const message = stockError.message || "Insumo no encontrado"
        const status = message.toLowerCase().includes("no rows") ? 404 : 500
        return NextResponse.json({ error: message }, { status })
      }

      nuevoStock = Number(current?.stock_actual || 0) + signo * cantidadNumber
      if (nuevoStock < 0) {
        return NextResponse.json({ error: "Stock insuficiente para registrar este movimiento" }, { status: 400 })
      }
    }

    const { data: mov, error } = await db
      .from("insumo_movimientos")
      .insert([
        {
          usuario_id: user.id,
          creado_por_username: username,
          insumo_id,
          tipo,
          cantidad: cantidadNumber,
          empleado_id: empleado_id || null,
          nota,
          creado_por: user.id,
        },
      ])
      .select()
      .single()

    if (error) {
      const message = error.message || "Error al registrar el movimiento"
      const status = message.toLowerCase().includes("row-level security") ? 403 : 500
      return NextResponse.json({ error: message }, { status })
    }

    if (signo !== 0 && nuevoStock !== null) {
      const { error: updateError } = await db
        .from("insumos")
        .update({ stock_actual: nuevoStock })
        .eq("id", insumo_id)
        .eq("usuario_id", user.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(mov)
  } catch (error) {
    console.error("Error registrando movimiento de insumo:", error)
    return NextResponse.json({ error: "Error interno al registrar el movimiento" }, { status: 500 })
  }
}

