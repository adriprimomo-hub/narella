import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { emitirFactura, type FacturaItem } from "@/lib/facturacion"
import {
  buildFacturaRetryPayload,
  guardarFacturaEmitida,
  guardarFacturaPendiente,
  sugerirNumeroFacturaLocal,
  type FacturaRetryPayload,
} from "@/lib/facturas-registro"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const giftcardSchema = z.object({
  cliente_id: z.string().min(1),
  servicio_ids: z.array(z.string().min(1)).min(1),
  valido_por_dias: z.coerce.number().int().positive(),
  de_parte_de: z.string().optional().nullable(),
  monto_total: z.coerce.number().positive().optional(),
  metodo_pago: z.string().min(1),
  facturar: z.boolean().optional(),
  nota: z.string().optional().nullable(),
})

const buildNumero = (existing: string[], date = new Date()) => {
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  const prefix = `${mm}${yy}`
  const seq = existing
    .filter((n) => n.startsWith(`${prefix}-`))
    .map((n) => Number.parseInt(n.split("-")[1] || "0", 10))
    .filter((n) => Number.isFinite(n))
  const next = (seq.length ? Math.max(...seq) : 0) + 1
  return `${prefix}-${String(next).padStart(3, "0")}`
}

const computeMontoServicios = (servicios: any[], ids: string[]) => {
  const map = new Map(servicios.map((s) => [s.id, s]))
  return ids.reduce((acc, id) => {
    const srv = map.get(id)
    const precio = Number(srv?.precio_lista ?? srv?.precio ?? 0)
    return acc + (Number.isFinite(precio) ? precio : 0)
  }, 0)
}

const isVigente = (row: any, now: Date) => {
  const estado = row?.estado
  if (estado === "usada" || estado === "anulada") return false
  if (row?.usada_en || row?.usada_en_turno_id) return false
  if (row?.valido_hasta) {
    const vence = new Date(row.valido_hasta)
    if (Number.isFinite(vence.getTime()) && vence.getTime() < now.getTime()) return false
  }
  return true
}

const sanitizeGiftcardRow = (row: any) => {
  const { imagen_base64: _img, ...rest } = row || {}
  return rest
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const clienteId = url.searchParams.get("cliente_id")
  const estado = url.searchParams.get("estado")
  const queryText = url.searchParams.get("q")?.trim() || ""
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
  const pageParam = Number.parseInt(url.searchParams.get("page") || "", 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })
  const paginationEnabled = url.searchParams.has("page_size")

  let query = db
    .from("giftcards")
    .select(
      `
      *,
      clientes:cliente_id (id, nombre, apellido)
    `,
    )
    .eq("usuario_id", user.id)

  if (clienteId) query = query.eq("cliente_id", clienteId)
  if (!queryText && limit && !page) query = query.limit(limit)

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let results = Array.isArray(data) ? data : []
  const now = new Date()

  if (estado) {
    if (estado === "vigente") {
      results = results.filter((row) => isVigente(row, now))
    } else {
      results = results.filter((row) => row.estado === estado)
    }
  }

  if (queryText) {
    const term = queryText.toLowerCase()
    results = results.filter((row: any) => {
      const cliente = `${row.clientes?.nombre || ""} ${row.clientes?.apellido || ""}`.toLowerCase()
      const numero = `${row.numero || ""}`.toLowerCase()
      const deParte = `${row.de_parte_de || ""}`.toLowerCase()
      const servicios = Array.isArray(row.servicios)
        ? row.servicios.map((s: any) => s?.nombre || "").join(" ").toLowerCase()
        : ""
      return cliente.includes(term) || numero.includes(term) || deParte.includes(term) || servicios.includes(term)
    })
  }

  if (paginationEnabled) {
    const total = results.length
    const start = (pagination.page - 1) * pagination.pageSize
    const rows = results.slice(start, start + pagination.pageSize + 1)
    const hasNext = rows.length > pagination.pageSize
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows
    const enriched = items.map((row: any) => ({
      ...sanitizeGiftcardRow(row),
      vigente: isVigente(row, now),
    }))
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

    return NextResponse.json({
      items: enriched,
      pagination: {
        ...buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
        total,
        total_pages: totalPages,
      },
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

  const enriched = results.map((row: any) => ({
    ...sanitizeGiftcardRow(row),
    vigente: isVigente(row, now),
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const { data: payload, response: validationResponse } = await validateBody(request, giftcardSchema)
  if (validationResponse) return validationResponse

  const servicioIds = payload.servicio_ids
  const validoPorDias = Number(payload.valido_por_dias)
  if (!Number.isFinite(validoPorDias) || validoPorDias <= 0) {
    return NextResponse.json({ error: "Ingresá una validez en días" }, { status: 400 })
  }

  const { data: servicios } = await db
    .from("servicios")
    .select("id, nombre, precio, precio_lista")
    .in("id", servicioIds)
    .eq("usuario_id", user.id)

  const montoServicios = computeMontoServicios(servicios || [], servicioIds)
  const montoTotal = Number.isFinite(Number(payload.monto_total)) ? Number(payload.monto_total) : montoServicios
  if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
    return NextResponse.json({ error: "No se pudo calcular el total de la giftcard" }, { status: 400 })
  }

  const { data: existentes } = await db
    .from("giftcards")
    .select("numero")
    .eq("usuario_id", user.id)

  const numero = buildNumero((existentes || []).map((g: any) => String(g.numero || "")))
  const ahora = new Date()
  const validoHasta = new Date(ahora)
  validoHasta.setDate(validoHasta.getDate() + validoPorDias)
  validoHasta.setHours(23, 59, 59, 999)

  const { data: giftcard, error } = await db
    .from("giftcards")
    .insert([
      {
        usuario_id: user.id,
        numero,
        cliente_id: payload.cliente_id,
        servicio_ids: servicioIds,
        valido_por_dias: validoPorDias,
        valido_hasta: validoHasta.toISOString(),
        de_parte_de: payload.de_parte_de || null,
        monto_total: montoTotal,
        metodo_pago: payload.metodo_pago,
        facturado: false,
        estado: "vigente",
        creado_por: user.id,
        creado_por_username: username,
        created_at: ahora.toISOString(),
        updated_at: ahora.toISOString(),
      },
    ])
    .select(
      `
      *,
      clientes:cliente_id (id, nombre, apellido)
    `,
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from("caja_movimientos").insert([
    {
      usuario_id: user.id,
      creado_por_username: username,
      medio_pago: payload.metodo_pago,
      tipo: "ingreso",
      monto: montoTotal,
      motivo: `Venta giftcard ${numero}`,
      source_tipo: "giftcard_venta",
      source_id: giftcard.id,
      creado_por: user.id,
    },
  ])

  let facturaResponse = null
  let facturaError: string | null = null
  let facturaId: string | null = null
  let facturaEstado: "emitida" | "pendiente" | null = null
  let facturaRetryPayload: FacturaRetryPayload | null = null
  if (payload.facturar) {
    try {
      const { data: clienteData } = await db
        .from("clientes")
        .select("nombre, apellido")
        .eq("id", payload.cliente_id)
        .eq("usuario_id", user.id)
        .single()

      const facturaItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: `Giftcard ${numero}`,
          cantidad: 1,
          precio_unitario: montoTotal,
          subtotal: montoTotal,
        },
      ]

      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: clienteFactura,
        items: facturaItems,
        total: montoTotal,
        metodo_pago: payload.metodo_pago,
      })

      facturaResponse = await emitirFactura({
        cliente: clienteFactura,
        items: facturaItems,
        total: montoTotal,
        metodo_pago: payload.metodo_pago,
        numero_sugerido: (await sugerirNumeroFacturaLocal({ db, userId: user.id })) || undefined,
      })
    } catch (error: any) {
      facturaError = error?.message || "No se pudo emitir la factura"
    }
  }

  if (facturaResponse?.factura) {
    const saved = await guardarFacturaEmitida({
      db,
      userId: user.id,
      username,
      origenTipo: "giftcard",
      origenId: giftcard.id,
      clienteId: payload.cliente_id,
      facturaResponse,
    })
    if (saved.error) {
      facturaError = facturaError || saved.error
    } else if (saved.facturaId) {
      facturaId = saved.facturaId
      facturaEstado = "emitida"
    }

    await db
      .from("giftcards")
      .update({ facturado: true, updated_at: new Date().toISOString() })
      .eq("id", giftcard.id)
      .eq("usuario_id", user.id)
  } else if (payload.facturar && facturaError) {
    if (!facturaRetryPayload) {
      const fallbackItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: `Giftcard ${numero}`,
          cantidad: 1,
          precio_unitario: montoTotal,
          subtotal: montoTotal,
        },
      ]
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: { nombre: "Consumidor", apellido: "Final" },
        items: fallbackItems,
        total: montoTotal,
        metodo_pago: payload.metodo_pago,
      })
    }
    if (facturaRetryPayload) {
      const pending = await guardarFacturaPendiente({
        db,
        userId: user.id,
        username,
        origenTipo: "giftcard",
        origenId: giftcard.id,
        clienteId: payload.cliente_id,
        retryPayload: facturaRetryPayload,
        errorMessage: facturaError,
      })
      if (pending.error) {
        facturaError = pending.error
      } else if (pending.facturaId) {
        facturaId = pending.facturaId
        facturaEstado = "pendiente"
      }
    }
  }

  return NextResponse.json({
    giftcard: sanitizeGiftcardRow(giftcard),
    factura: facturaResponse?.factura || null,
    factura_id: facturaId,
    factura_estado: facturaEstado,
    factura_pendiente: facturaEstado === "pendiente",
    factura_error: facturaError,
  })
}
