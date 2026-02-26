import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const clienteSchema = z.object({
  nombre: z.string().trim().min(1),
  apellido: z.string().trim().min(1),
  telefono: z.string().trim().min(1),
  observaciones: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  if (pagination.enabled) {
    const { data, error } = await db
      .from("clientes")
      .select("*")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to + 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    const hasNext = rows.length > pagination.pageSize
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows

    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await db.from("clientes").select("*").eq("usuario_id", user.id).order("created_at", {
    ascending: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, clienteSchema)
  if (validationResponse) return validationResponse
  const { nombre, apellido, telefono, observaciones } = payload

  const { data, error } = await db
    .from("clientes")
    .insert([{ usuario_id: user.id, nombre, apellido, telefono, observaciones }])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data[0])
}
