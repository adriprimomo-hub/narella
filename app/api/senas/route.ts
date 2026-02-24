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

const senaSchema = z.object({
  cliente_id: z.string().min(1),
  servicio_id: z.string().min(1),
  monto: z.coerce.number().positive(),
  metodo_pago: z.string().optional(),
  estado: z.string().optional(),
  nota: z.string().optional().nullable(),
  fecha_pago: z.string().optional().nullable(),
  turno_id: z.string().optional().nullable(),
  facturar: z.boolean().optional(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const url = new URL(request.url)
  const clienteId = url.searchParams.get("cliente_id")
  const estado = url.searchParams.get("estado")
  const queryText = url.searchParams.get("q")?.trim() || ""
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
  const pageParam = Number.parseInt(url.searchParams.get("page") || "", 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null

  let query = db
    .from("senas")
    .select(
      `
      *,
      clientes:cliente_id (id, nombre, apellido),
      servicios:servicio_id (id, nombre)
    `,
    )
    .eq("usuario_id", user.id)

  if (clienteId) query = query.eq("cliente_id", clienteId)
  if (estado) query = query.eq("estado", estado)
  if (!queryText && limit && !page) query = query.limit(limit)

  const { data, error } = await query.order("fecha_pago", { ascending: false })

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  let results = Array.isArray(data) ? data : []
  if (queryText) {
    const term = queryText.toLowerCase()
    results = results.filter((s) => {
      const cliente = `${s.clientes?.nombre || ""} ${s.clientes?.apellido || ""}`.toLowerCase()
      const servicio = `${s.servicios?.nombre || ""}`.toLowerCase()
      const metodo = `${s.metodo_pago || ""}`.toLowerCase()
      const nota = `${s.nota || ""}`.toLowerCase()
      return cliente.includes(term) || servicio.includes(term) || metodo.includes(term) || nota.includes(term)
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
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const { data: payload, response: validationResponse } = await validateBody(request, senaSchema)
  if (validationResponse) return validationResponse
  const clienteId = payload.cliente_id
  const servicioId = payload.servicio_id
  const monto = Number.parseFloat(String(payload.monto))
  const metodoPago = payload.metodo_pago || "efectivo"
  const estado = payload.estado || "pendiente"
  const facturar = Boolean(payload.facturar)
  if (Number.isNaN(monto) || monto <= 0) {
    return NextResponse.json({ error: "Datos de seña incompletos (cliente, servicio y monto son requeridos)" }, { status: 400 })
  }

  const { data, error } = await db
    .from("senas")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        cliente_id: clienteId,
        servicio_id: servicioId,
        monto,
        metodo_pago: metodoPago,
        estado,
        nota: payload.nota || null,
        fecha_pago: payload.fecha_pago || new Date().toISOString(),
        turno_id: payload.turno_id || null,
      },
    ])
    .select(
      `
      *,
      clientes:cliente_id (id, nombre, apellido),
      servicios:servicio_id (id, nombre)
    `,
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from("caja_movimientos").insert([
    {
      usuario_id: user.id,
      creado_por_username: username,
      medio_pago: metodoPago,
      tipo: "ingreso",
      monto,
      motivo: "Registro de seña",
      source_tipo: "sena_registro",
      source_id: data.id,
      creado_por: user.id,
    },
  ])

  let facturaResponse = null
  let facturaError: string | null = null
  let facturaId: string | null = null
  let facturaEstado: "emitida" | "pendiente" | null = null
  let facturaRetryPayload: FacturaRetryPayload | null = null
  if (facturar) {
    try {
      const { data: clienteData } = await db
        .from("clientes")
        .select("nombre, apellido")
        .eq("id", clienteId)
        .eq("usuario_id", user.id)
        .single()
      const { data: servicioData } = await db
        .from("servicios")
        .select("nombre")
        .eq("id", servicioId)
        .eq("usuario_id", user.id)
        .single()
      const facturaItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: `Seña servicio: ${servicioData?.nombre || "Servicio"}`,
          cantidad: 1,
          precio_unitario: monto,
          subtotal: monto,
        },
      ]
      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: clienteFactura,
        items: facturaItems,
        total: monto,
        metodo_pago: metodoPago,
      })
      facturaResponse = await emitirFactura({
        cliente: clienteFactura,
        items: facturaItems,
        total: monto,
        metodo_pago: metodoPago,
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
      origenTipo: "sena_registro",
      origenId: data.id,
      clienteId: clienteId || null,
      facturaResponse,
    })
    if (saved.error) {
      facturaError = facturaError || saved.error
    } else if (saved.facturaId) {
      facturaId = saved.facturaId
      facturaEstado = "emitida"
    }
  } else if (facturar && facturaError) {
    if (!facturaRetryPayload) {
      const fallbackItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: "Seña servicio",
          cantidad: 1,
          precio_unitario: monto,
          subtotal: monto,
        },
      ]
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: { nombre: "Consumidor", apellido: "Final" },
        items: fallbackItems,
        total: monto,
        metodo_pago: metodoPago,
      })
    }
    if (facturaRetryPayload) {
      const pending = await guardarFacturaPendiente({
        db,
        userId: user.id,
        username,
        origenTipo: "sena_registro",
        origenId: data.id,
        clienteId: clienteId || null,
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
    ...data,
    factura: facturaResponse?.factura || null,
    factura_id: facturaId,
    factura_estado: facturaEstado,
    factura_pendiente: facturaEstado === "pendiente",
    factura_error: facturaError,
  })
}
