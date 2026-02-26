import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const insumoSchema = z.object({
  nombre: z.string().trim().min(1),
  stock_actual: z.coerce.number().int().nonnegative().optional(),
  stock_minimo: z.coerce.number().int().nonnegative().optional(),
  activo: z.boolean().optional(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(request.url)
  const includeInactive = url.searchParams.get("include_inactive") === "true"
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createQuery = () => {
    let query = db.from("insumos").select("*").eq("usuario_id", user.id)
    if (!includeInactive) {
      query = query.eq("activo", true)
    }
    return query.order("nombre", { ascending: true })
  }

  if (pagination.enabled) {
    const { data, error } = await createQuery().range(pagination.from, pagination.to + 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    const hasNext = rows.length > pagination.pageSize
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows
    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await createQuery()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const { data: payload, response: validationResponse } = await validateBody(request, insumoSchema)
  if (validationResponse) return validationResponse

  const { data, error } = await db
    .from("insumos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        nombre: payload.nombre,
        stock_actual: payload.stock_actual ?? 0,
        stock_minimo: payload.stock_minimo ?? 0,
        activo: payload.activo ?? true,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
