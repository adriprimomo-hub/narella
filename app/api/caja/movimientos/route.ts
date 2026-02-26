import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const cajaSchema = z.object({
  medio_pago: z.string().min(1).optional(),
  tipo: z.enum(["ingreso", "egreso", "retiro"]),
  monto: z.coerce.number().min(0),
  motivo: z.string().optional().nullable(),
  source_tipo: z.string().optional().nullable(),
  source_id: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const medio = url.searchParams.get("medio_pago")
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createQuery = () => {
    let query = db
      .from("caja_movimientos")
      .select("*, creado_por, creado_por_username")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })

    if (medio) query = query.eq("medio_pago", medio)
    return query
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

  const { data: payload, response: validationResponse } = await validateBody(request, cajaSchema)
  if (validationResponse) return validationResponse
  const { medio_pago, tipo, monto, motivo, source_tipo, source_id } = payload
  const normalizedTipo = tipo === "retiro" ? "egreso" : tipo
  const medioPago = (medio_pago || "efectivo").toString().trim().toLowerCase()
  const sourceTipoFinal = source_tipo?.trim() || "manual"
  const permiteMontoCero = sourceTipoFinal === "arqueo"
  if (monto < 0 || (monto === 0 && !permiteMontoCero)) {
    return NextResponse.json({ error: "El monto debe ser mayor a 0, excepto en arqueos sin diferencia." }, { status: 400 })
  }
  const defaultMotivo =
    sourceTipoFinal === "apertura"
      ? "Apertura de caja"
      : sourceTipoFinal === "arqueo"
        ? "Ajuste por arqueo"
        : normalizedTipo === "egreso"
          ? "Retiro de caja"
          : "Ingreso de caja"
  const motivoFinal = (motivo ?? "").trim() || defaultMotivo

  const { data, error } = await db
    .from("caja_movimientos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        medio_pago: medioPago,
        tipo: normalizedTipo,
        monto,
        motivo: motivoFinal,
        source_tipo: sourceTipoFinal,
        source_id: source_id || null,
        creado_por: user.id,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
