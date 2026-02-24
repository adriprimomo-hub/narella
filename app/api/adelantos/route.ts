import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const adelantoSchema = z.object({
  empleada_id: z.string().min(1),
  monto: z.coerce.number().positive(),
  motivo: z.string().optional().nullable(),
  fecha_entrega: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && role !== "recepcion") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const url = new URL(request.url)
  const empleadaId = url.searchParams.get("empleada_id")
  const queryText = url.searchParams.get("q")?.trim() || ""
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
  const pageParam = Number.parseInt(url.searchParams.get("page") || "", 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null

  let query = db
    .from("adelantos")
    .select(
      `
      *,
      empleadas:empleada_id (id, nombre, apellido)
    `,
    )
    .eq("usuario_id", user.id)

  if (empleadaId) query = query.eq("empleada_id", empleadaId)
  if (!queryText && limit && !page) query = query.limit(limit)

  const { data, error } = await query.order("fecha_entrega", { ascending: false })

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  let results = Array.isArray(data) ? data : []
  if (queryText) {
    const term = queryText.toLowerCase()
    results = results.filter((a) => {
      const empleada = `${a.empleadas?.nombre || ""} ${a.empleadas?.apellido || ""}`.toLowerCase()
      const motivo = `${a.motivo || ""}`.toLowerCase()
      return empleada.includes(term) || motivo.includes(term)
    })
  }
  if (limit) {
    if (page) {
      const offset = (page - 1) * limit
      results = results.slice(offset, offset + limit)
    } else {
      results = results.slice(0, limit)
    }
  }
  return NextResponse.json(results)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && role !== "recepcion") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const { data: payload, response: validationResponse } = await validateBody(request, adelantoSchema)
  if (validationResponse) return validationResponse

  const { data, error } = await db
    .from("adelantos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        empleada_id: payload.empleada_id,
        monto: payload.monto,
        motivo: payload.motivo,
        fecha_entrega: payload.fecha_entrega || new Date().toISOString(),
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
