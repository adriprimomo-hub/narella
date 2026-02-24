import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { emitirFactura, type FacturaItem } from "@/lib/facturacion"
import {
  buildFacturaRetryPayload,
  guardarFacturaEmitida,
  guardarFacturaPendiente,
  sugerirNumeroFacturaLocal,
  type FacturaRetryPayload,
} from "@/lib/facturas-registro"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const senaUpdateSchema = z
  .object({
    cliente_id: z.string().min(1).optional(),
    servicio_id: z.string().min(1).optional(),
    turno_id: z.string().optional().nullable(),
    monto: z.coerce.number().positive().optional(),
    metodo_pago: z.string().optional(),
    nota: z.string().optional().nullable(),
    estado: z.string().optional(),
    fecha_pago: z.string().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo",
  })

const senaIncrementoSchema = z.object({
  incremento: z.coerce.number().positive(),
  metodo_pago: z.string().optional(),
  facturar: z.boolean().optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, senaUpdateSchema)
  if (validationResponse) return validationResponse

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (payload.cliente_id !== undefined) updateData.cliente_id = payload.cliente_id
  if (payload.turno_id !== undefined) updateData.turno_id = payload.turno_id || null
  if (payload.monto !== undefined) updateData.monto = payload.monto
  if (payload.metodo_pago !== undefined) updateData.metodo_pago = payload.metodo_pago
  if (payload.nota !== undefined) updateData.nota = payload.nota
  if (payload.estado !== undefined) updateData.estado = payload.estado
  if (payload.fecha_pago !== undefined) updateData.fecha_pago = payload.fecha_pago
  if (payload.servicio_id !== undefined) updateData.servicio_id = payload.servicio_id

  const { data, error } = await db
    .from("senas")
    .update(updateData)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await db.from("senas").delete().eq("id", id).eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const { data: payload, response: validationResponse } = await validateBody(request, senaIncrementoSchema)
  if (validationResponse) return validationResponse
  const incremento = Number.parseFloat(String(payload.incremento))
  const metodoPago = payload.metodo_pago || "efectivo"
  const facturar = Boolean(payload.facturar)

  const { data: sena, error: senaError } = await db
    .from("senas")
    .select("id, monto, estado, cliente_id, servicio_id")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .single()

  if (senaError || !sena) {
    return NextResponse.json({ error: "Seña no encontrada" }, { status: 404 })
  }

  if (sena.estado !== "pendiente") {
    return NextResponse.json({ error: "Solo se pueden incrementar señas pendientes" }, { status: 400 })
  }

  const nuevoMonto = Number(sena.monto) + incremento

  const { data, error } = await db
    .from("senas")
    .update({
      monto: nuevoMonto,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from("caja_movimientos").insert([
    {
      usuario_id: user.id,
      creado_por_username: username,
      medio_pago: metodoPago,
      tipo: "ingreso",
      monto: incremento,
      motivo: "Incremento de seña",
      source_tipo: "sena_incremento",
      source_id: id,
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
        .eq("id", sena.cliente_id)
        .eq("usuario_id", user.id)
        .single()
      const { data: servicioData } = await db
        .from("servicios")
        .select("nombre")
        .eq("id", sena.servicio_id)
        .eq("usuario_id", user.id)
        .single()
      const facturaItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: `Incremento de seña: ${servicioData?.nombre || "Servicio"}`,
          cantidad: 1,
          precio_unitario: incremento,
          subtotal: incremento,
        },
      ]
      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: clienteFactura,
        items: facturaItems,
        total: incremento,
        metodo_pago: metodoPago,
      })
      facturaResponse = await emitirFactura({
        cliente: clienteFactura,
        items: facturaItems,
        total: incremento,
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
      origenTipo: "sena_incremento",
      origenId: id,
      clienteId: sena.cliente_id || null,
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
          descripcion: "Incremento de seña",
          cantidad: 1,
          precio_unitario: incremento,
          subtotal: incremento,
        },
      ]
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: { nombre: "Consumidor", apellido: "Final" },
        items: fallbackItems,
        total: incremento,
        metodo_pago: metodoPago,
      })
    }
    if (facturaRetryPayload) {
      const pending = await guardarFacturaPendiente({
        db,
        userId: user.id,
        username,
        origenTipo: "sena_incremento",
        origenId: id,
        clienteId: sena.cliente_id || null,
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
    sena: data,
    incremento,
    nuevo_monto: nuevoMonto,
    factura: facturaResponse?.factura || null,
    factura_id: facturaId,
    factura_estado: facturaEstado,
    factura_pendiente: facturaEstado === "pendiente",
    factura_error: facturaError,
  })
}
