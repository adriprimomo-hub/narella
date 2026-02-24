import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { emitirFactura, type FacturaAjuste, type FacturaItem } from "@/lib/facturacion"
import {
  buildFacturaRetryPayload,
  guardarFacturaEmitida,
  guardarFacturaPendiente,
  sugerirNumeroFacturaLocal,
  type FacturaRetryPayload,
} from "@/lib/facturas-registro"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

type ProductoPayload = {
  producto_id: string
  cantidad: number
  precio_unitario: number
  empleada_id?: string | null
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
  turno_id_origen?: string | null
}
type ItemPayload = { turno_id: string; monto: number }

const buildProductoNota = (base: string, comisionStaff: boolean, staffEmpleadaId: string | null) => {
  const marker = comisionStaff ? "1" : "0"
  const suffix = staffEmpleadaId ? `|staff_empleada_id=${staffEmpleadaId}` : ""
  return `${base} |comision_staff=${marker}${suffix}`
}

const formatDayMonth = (value: string | null | undefined) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
}

const pagoGrupoSchema = z
  .object({
    grupo_id: z.string().min(1),
    metodo_pago: z.string().min(1),
    facturar: z.boolean().optional(),
    aplicar_giftcard: z.boolean().optional(),
    giftcard_id: z.string().optional().nullable(),
    aplicar_sena: z.boolean().optional(),
    sena_id: z.string().optional().nullable(),
    productos: z
      .array(
        z.object({
          producto_id: z.string().min(1),
          cantidad: z.coerce.number().int().positive(),
          precio_unitario: z.coerce.number().nonnegative(),
          empleada_id: z.string().optional().nullable(),
          origen_staff: z.boolean().optional(),
          agregado_por_empleada_id: z.string().optional().nullable(),
          agregado_por_user_id: z.string().optional().nullable(),
          turno_id_origen: z.string().optional().nullable(),
        }),
      )
      .optional(),
    items: z
      .array(
        z.object({
          turno_id: z.string().min(1),
          monto: z.coerce.number().nonnegative(),
        }),
      )
      .min(1),
    observaciones: z.string().optional().nullable(),
    penalidad_monto: z.coerce.number().nonnegative().optional(),
  })
  .passthrough()

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const { data: payload, response: validationResponse } = await validateBody(request, pagoGrupoSchema)
  if (validationResponse) return validationResponse
  const grupoId: string = payload.grupo_id
  const metodoPago: string = payload.metodo_pago
  const facturar: boolean = Boolean(payload.facturar)
  const aplicarGiftcard: boolean = Boolean(payload.aplicar_giftcard)
  const giftcardId: string | null = payload.giftcard_id || null
  const aplicarSena: boolean = Boolean(payload.aplicar_sena)
  const senaId: string | null = payload.sena_id || null
  const productos: ProductoPayload[] = Array.isArray(payload.productos) ? payload.productos : []
  const items: ItemPayload[] = Array.isArray(payload.items) ? payload.items : []
  const observaciones: string | null = typeof payload.observaciones === "string" ? payload.observaciones.trim() : null
  const penalidadMontoRaw = Number.parseFloat(String(payload.penalidad_monto ?? 0)) || 0
  const penalidadMonto = isAdmin ? Math.max(0, penalidadMontoRaw) : 0

  if (!grupoId || !metodoPago || items.length === 0) {
    return NextResponse.json({ error: "Datos de pago incompletos" }, { status: 400 })
  }

  const { data: grupo, error: grupoError } = await db
    .from("turno_grupos")
    .select("id, cliente_id")
    .eq("usuario_id", user.id)
    .eq("id", grupoId)
    .single()

  if (grupoError || !grupo) {
    return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 })
  }

  const { data: turnosGrupo, error: turnosError } = await db
    .from("turnos")
    .select("id, cliente_id, servicio_id, servicio_final_id, empleada_id, empleada_final_id, finalizado_en, iniciado_en, observaciones, estado")
    .eq("usuario_id", user.id)
    .eq("grupo_id", grupoId)

  if (turnosError || !turnosGrupo || turnosGrupo.length === 0) {
    return NextResponse.json({ error: "No se encontraron turnos del grupo" }, { status: 404 })
  }

  const turnosMap = new Map<string, any>((turnosGrupo || []).map((t: any) => [t.id, t]))
  const invalidItem = items.find((item) => !turnosMap.has(item.turno_id))
  if (invalidItem) {
    return NextResponse.json({ error: "Uno de los turnos no pertenece al grupo" }, { status: 400 })
  }
  const uniqueItems = new Set(items.map((i) => i.turno_id))
  if (uniqueItems.size !== items.length || uniqueItems.size !== turnosGrupo.length) {
    return NextResponse.json({ error: "Debe cerrar todos los turnos del grupo en un mismo cobro" }, { status: 409 })
  }
  if (turnosGrupo.some((t: any) => t.estado === "completado")) {
    return NextResponse.json({ error: "El grupo ya fue cerrado anteriormente" }, { status: 409 })
  }

  const montosBrutos: { turno_id: string; monto: number; servicio_id?: string | null }[] = []
  for (const item of items) {
    const turno = turnosMap.get(item.turno_id) as any
    if (!turno) continue
    const servicioId = turno.servicio_final_id || turno.servicio_id
    if (!isAdmin) {
      const { data: servicio } = await db
        .from("servicios")
        .select("precio, precio_lista")
        .eq("id", servicioId)
        .eq("usuario_id", user.id)
        .single()
      const precioBase = Number(servicio?.precio_lista ?? servicio?.precio ?? 0)
      montosBrutos.push({ turno_id: item.turno_id, monto: Math.max(0, precioBase), servicio_id: servicioId })
    } else {
      const monto = Number.parseFloat(String(item.monto)) || 0
      montosBrutos.push({ turno_id: item.turno_id, monto: Math.max(0, monto), servicio_id: servicioId })
    }
  }

  let totalProductos = 0
  const productosDetalles: Array<{
    producto: any
    cantidad: number
    precioUnitario: number
    subtotal: number
    empleada_id: string | null
    nota: string
  }> = []

  for (const prod of productos) {
    if (!prod.producto_id || !prod.cantidad || prod.cantidad <= 0) continue

    const { data: producto, error: productoError } = await db
      .from("productos")
      .select("id, nombre, precio_lista, precio_descuento, stock_actual")
      .eq("id", prod.producto_id)
      .eq("usuario_id", user.id)
      .single()

    if (productoError) {
      return NextResponse.json({ error: productoError.message }, { status: 500 })
    }
    if (!producto) continue

    const precioUnitario = isAdmin
      ? Number(prod.precio_unitario) || 0
      : Number(producto.precio_descuento ?? producto.precio_lista ?? 0)
    const cantidad = Number(prod.cantidad)
    const subtotal = precioUnitario * cantidad
    const staffOrigenId =
      typeof prod.agregado_por_empleada_id === "string" && prod.agregado_por_empleada_id.trim().length > 0
        ? prod.agregado_por_empleada_id
        : null
    const comisionStaff = Boolean(prod.origen_staff === true && staffOrigenId)
    const staffComisionId = comisionStaff ? staffOrigenId : null
    const nota = buildProductoNota(`Venta en grupo ${grupoId}`, comisionStaff, staffComisionId)

    totalProductos += subtotal
    productosDetalles.push({
      producto,
      cantidad,
      precioUnitario,
      subtotal,
      empleada_id: staffComisionId,
      nota,
    })
  }

  const totalServicios = montosBrutos.reduce((acc, item) => acc + item.monto, 0)
  const totalBruto = Math.max(0, totalServicios + penalidadMonto + totalProductos)

  if (totalBruto <= 0) {
    return NextResponse.json({ error: "Datos de pago incompletos" }, { status: 400 })
  }

  let giftcardMontoAplicado = 0
  let giftcardAplicadaId: string | null = null
  let giftcardNumero: string | null = null
  let senaFechaPago: string | null = null
  let senaServicioId: string | null = null

  if (aplicarGiftcard && giftcardId) {
    const { data: giftcard } = await db
      .from("giftcards")
      .select("*")
      .eq("id", giftcardId)
      .eq("usuario_id", user.id)
      .single()

    if (!giftcard) {
      return NextResponse.json({ error: "Giftcard no encontrada" }, { status: 404 })
    }

    if (giftcard.cliente_id !== grupo.cliente_id) {
      return NextResponse.json({ error: "La giftcard no corresponde a la clienta" }, { status: 400 })
    }

    const now = new Date()
    if (giftcard.estado === "usada" || giftcard.estado === "anulada" || giftcard.usada_en || giftcard.usada_en_turno_id) {
      return NextResponse.json({ error: "La giftcard ya fue utilizada" }, { status: 400 })
    }
    if (giftcard.valido_hasta) {
      const vence = new Date(giftcard.valido_hasta)
      if (Number.isFinite(vence.getTime()) && vence.getTime() < now.getTime()) {
        return NextResponse.json({ error: "La giftcard está vencida" }, { status: 400 })
      }
    }

    const { data: existingGiftcardPago } = await db
      .from("pagos")
      .select("id")
      .eq("giftcard_aplicada_id", giftcardId)
      .single()
    const { data: existingGiftcardPagoGrupo } = await db
      .from("pagos_grupos")
      .select("id")
      .eq("giftcard_aplicada_id", giftcardId)
      .single()

    if (existingGiftcardPago || existingGiftcardPagoGrupo) {
      return NextResponse.json({ error: "Esta giftcard ya fue aplicada a otro turno" }, { status: 400 })
    }

    giftcardAplicadaId = giftcardId
    giftcardNumero = giftcard.numero ? String(giftcard.numero) : null
    const giftcardServicioIds = Array.isArray(giftcard.servicio_ids) ? giftcard.servicio_ids : []
    const remaining = new Map<string, number>()
    giftcardServicioIds.forEach((id: string) => {
      remaining.set(id, (remaining.get(id) || 0) + 1)
    })

    montosBrutos.forEach((item) => {
      const servicioId = item.servicio_id
      if (!servicioId) return
      const count = remaining.get(servicioId) || 0
      if (count <= 0) return
      remaining.set(servicioId, count - 1)
      giftcardMontoAplicado += Number(item.monto || 0)
    })

    giftcardMontoAplicado = Math.max(0, Math.min(giftcardMontoAplicado, totalServicios))
    if (giftcardMontoAplicado <= 0) {
      return NextResponse.json({ error: "La giftcard no aplica a los servicios de este grupo" }, { status: 400 })
    }
  }

  let senaAplicadaMonto = 0
  if (!giftcardAplicadaId && aplicarSena && senaId) {
    const { data: sena } = await db
      .from("senas")
      .select("id, monto, estado, fecha_pago, servicio_id")
      .eq("usuario_id", user.id)
      .eq("id", senaId)
      .single()

    if (sena && sena.estado === "pendiente") {
      const { data: existingPago } = await db
        .from("pagos")
        .select("id")
        .eq("sena_aplicada_id", senaId)
        .single()
      const { data: existingPagoGrupo } = await db
        .from("pagos_grupos")
        .select("id")
        .eq("sena_aplicada_id", senaId)
        .single()

      if (existingPago || existingPagoGrupo) {
        return NextResponse.json({ error: "Esta seña ya fue aplicada a otro turno" }, { status: 400 })
      }

      senaAplicadaMonto = Number(sena.monto) || 0
      senaFechaPago = sena.fecha_pago || null
      senaServicioId = sena.servicio_id || null
      const { error: senaUpdateError } = await db
        .from("senas")
        .update({ estado: "aplicada", aplicada_en: new Date().toISOString(), aplicada_por: user.id })
        .eq("id", senaId)
        .eq("usuario_id", user.id)
      if (senaUpdateError) {
        return NextResponse.json({ error: senaUpdateError.message }, { status: 500 })
      }
    }
  }

  let senaServicioNombre: string | null = null
  if (senaServicioId) {
    const { data: senaServicio } = await db
      .from("servicios")
      .select("nombre")
      .eq("id", senaServicioId)
      .eq("usuario_id", user.id)
      .single()
    senaServicioNombre = senaServicio?.nombre || null
  }

  const montoCobrado = Math.max(0, totalBruto - senaAplicadaMonto - giftcardMontoAplicado)
  if (montoCobrado <= 0 && giftcardMontoAplicado <= 0) {
    return NextResponse.json({ error: "El monto a cobrar debe ser mayor a cero" }, { status: 400 })
  }
  const montoParaPagoGrupo = giftcardMontoAplicado > 0 ? totalBruto : montoCobrado

  // Distribuir penalidad y seña proporcionalmente
  const detalleNetos: { turno_id: string; monto: number }[] = []
  if (montosBrutos.length) {
    const baseTotal = Math.max(totalServicios, 1)
    const baseWithPenalTotal = Math.max(totalBruto, 1)

    montosBrutos.forEach((item) => {
      const ratioServicios = item.monto / baseTotal
      const penalShare = penalidadMonto * ratioServicios
      const productoShare = totalProductos * ratioServicios
      const baseConPenal = item.monto + penalShare + productoShare
      const senaShare = senaAplicadaMonto > 0 ? (baseConPenal / baseWithPenalTotal) * senaAplicadaMonto : 0
      detalleNetos.push({
        turno_id: item.turno_id,
        monto: Math.max(0, baseConPenal - senaShare),
      })
    })

    const diff = montoParaPagoGrupo - detalleNetos.reduce((acc, item) => acc + item.monto, 0)
    if (Math.abs(diff) > 0.01) {
      const last = detalleNetos[detalleNetos.length - 1]
      last.monto = Math.max(0, last.monto + diff)
    }
  }

  const { data: pagoGrupo, error: pagoGrupoError } = await db
    .from("pagos_grupos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        turno_grupo_id: grupoId,
        cliente_id: grupo.cliente_id,
        monto: montoParaPagoGrupo,
        metodo_pago: metodoPago,
        estado: "completado",
        fecha_pago: new Date().toISOString(),
        sena_aplicada_id: senaAplicadaMonto > 0 ? senaId : null,
        monto_sena_aplicada: senaAplicadaMonto,
        giftcard_aplicada_id: giftcardMontoAplicado > 0 ? giftcardAplicadaId : null,
        monto_giftcard_aplicado: giftcardMontoAplicado,
        penalidad_monto: penalidadMonto || null,
        observaciones: observaciones || null,
      },
    ])
    .select()
    .single()

  if (pagoGrupoError || !pagoGrupo) {
    return NextResponse.json({ error: pagoGrupoError?.message || "No se pudo registrar el pago grupal" }, { status: 500 })
  }

  if (giftcardMontoAplicado > 0 && giftcardAplicadaId) {
    const { error: giftcardUpdateError } = await db
      .from("giftcards")
      .update({
        estado: "usada",
        usada_en: new Date().toISOString(),
        usada_en_turno_id: turnosGrupo?.[0]?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", giftcardAplicadaId)
      .eq("usuario_id", user.id)
    if (giftcardUpdateError) {
      return NextResponse.json({ error: giftcardUpdateError.message }, { status: 500 })
    }
  }

  if (detalleNetos.length) {
    const itemsRows = detalleNetos.map((item) => ({
      usuario_id: user.id,
      pago_grupo_id: pagoGrupo.id,
      turno_id: item.turno_id,
      monto: item.monto,
    }))
    const { error: itemsRowsError } = await db.from("pago_grupo_items").insert(itemsRows)
    if (itemsRowsError) {
      return NextResponse.json({ error: itemsRowsError.message }, { status: 500 })
    }
  }

  // Actualizar turnos del grupo
  for (const turno of turnosGrupo) {
    const { error: turnoUpdateError } = await db
      .from("turnos")
      .update({
        estado: "completado",
        finalizado_en: new Date().toISOString(),
        iniciado_en: turno.iniciado_en || new Date().toISOString(),
        cerrado_por: user.id,
        observaciones: observaciones ?? turno.observaciones,
        updated_at: new Date(),
      })
      .eq("usuario_id", user.id)
      .eq("id", turno.id)
    if (turnoUpdateError) {
      return NextResponse.json({ error: turnoUpdateError.message }, { status: 500 })
    }
  }

  // Registrar movimiento de caja por el cobro grupal
  if (montoCobrado > 0) {
    const { error: cajaGrupoError } = await db.from("caja_movimientos").insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        medio_pago: metodoPago,
        tipo: "ingreso",
        monto: montoCobrado,
        motivo: "Cobro servicios simultaneos",
        source_tipo: "turno_grupo_pago",
        source_id: pagoGrupo.id,
        creado_por: user.id,
      },
    ])
    if (cajaGrupoError) {
      return NextResponse.json({ error: cajaGrupoError.message }, { status: 500 })
    }
  }

  // Procesar productos vendidos (a nivel grupo)
  for (const detalle of productosDetalles) {
    const { producto, cantidad, precioUnitario, subtotal, empleada_id, nota } = detalle

    const { error: productoMovimientoError } = await db.from("producto_movimientos").insert([
      {
        usuario_id: user.id,
        producto_id: producto.id,
        tipo: "venta",
        cantidad,
        precio_unitario: precioUnitario,
        cliente_id: grupo.cliente_id,
        empleada_id: empleada_id,
        metodo_pago: metodoPago,
        nota,
        creado_por: user.id,
        creado_por_username: username,
      },
    ])
    if (productoMovimientoError) {
      return NextResponse.json({ error: productoMovimientoError.message }, { status: 500 })
    }

    const nuevoStock = Math.max(0, Number(producto.stock_actual || 0) - cantidad)
    const { error: stockUpdateError } = await db
      .from("productos")
      .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
      .eq("id", producto.id)
      .eq("usuario_id", user.id)
    if (stockUpdateError) {
      return NextResponse.json({ error: stockUpdateError.message }, { status: 500 })
    }

    const { error: cajaProductoError } = await db.from("caja_movimientos").insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        medio_pago: metodoPago,
        tipo: "ingreso",
        monto: subtotal,
        motivo: `Venta producto: ${producto.nombre}`,
        source_tipo: "producto_venta",
        source_id: producto.id,
        creado_por: user.id,
      },
    ])
    if (cajaProductoError) {
      return NextResponse.json({ error: cajaProductoError.message }, { status: 500 })
    }
  }

  let facturaResponse = null
  let facturaError: string | null = null
  let facturaId: string | null = null
  let facturaEstado: "emitida" | "pendiente" | null = null
  let facturaRetryPayload: FacturaRetryPayload | null = null
  const shouldFacturar = facturar && montoCobrado > 0
  if (shouldFacturar) {
    try {
      const clienteId = grupo.cliente_id
      const { data: clienteData } = clienteId
        ? await db.from("clientes").select("nombre, apellido").eq("id", clienteId).eq("usuario_id", user.id).single()
        : { data: null }

      const servicioIds = new Set<string>()
      turnosGrupo.forEach((t: any) => {
        const servicioId = t.servicio_final_id || t.servicio_id
        if (servicioId) servicioIds.add(servicioId)
      })
      const { data: serviciosFactura } = await db
        .from("servicios")
        .select("id, nombre")
        .in("id", Array.from(servicioIds))
      const serviciosMap = new Map<string, any>((serviciosFactura || []).map((s: any) => [s.id, s]))

      const facturaItems: FacturaItem[] = []
      montosBrutos.forEach((item) => {
        const turno = turnosMap.get(item.turno_id) as any
        const servicioId = turno?.servicio_final_id || turno?.servicio_id
        const nombre = serviciosMap.get(servicioId)?.nombre || "Servicio"
        facturaItems.push({
          tipo: "servicio",
          descripcion: `Servicio: ${nombre}`,
          cantidad: 1,
          precio_unitario: Number(item.monto || 0),
          subtotal: Number(item.monto || 0),
        })
      })

      if (penalidadMonto > 0) {
        facturaItems.push({
          tipo: "penalidad",
          descripcion: "Penalidad por retraso",
          cantidad: 1,
          precio_unitario: penalidadMonto,
          subtotal: penalidadMonto,
        })
      }

      productosDetalles.forEach((detalle) => {
        facturaItems.push({
          tipo: "producto",
          descripcion: `Producto: ${detalle.producto.nombre}`,
          cantidad: detalle.cantidad,
          precio_unitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
        })
      })
      if (facturaItems.length === 0 && totalBruto > 0) {
        facturaItems.push({
          tipo: "servicio",
          descripcion: "Servicio",
          cantidad: 1,
          precio_unitario: totalBruto,
          subtotal: totalBruto,
        })
      }

      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      const primerServicioId = turnosGrupo[0]?.servicio_final_id || turnosGrupo[0]?.servicio_id || null
      const ajustesFactura: FacturaAjuste[] = []
      if (senaAplicadaMonto > 0) {
        const fechaSena = formatDayMonth(senaFechaPago)
        const nombreServicioSena = senaServicioNombre || serviciosMap.get(primerServicioId)?.nombre || "Servicio"
        const etiquetaSena = fechaSena ? `Seña ${fechaSena}` : "Seña"
        ajustesFactura.push({
          descripcion: `${etiquetaSena} - ${nombreServicioSena}`,
          monto: senaAplicadaMonto,
        })
      }
      if (giftcardMontoAplicado > 0) {
        ajustesFactura.push({
          descripcion: `Giftcard ${giftcardNumero || giftcardAplicadaId || "s/n"}`,
          monto: giftcardMontoAplicado,
        })
      }
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: clienteFactura,
        items: facturaItems,
        total: montoCobrado,
        metodo_pago: metodoPago,
        descuento_sena: senaAplicadaMonto,
        ajustes: ajustesFactura,
      })

      facturaResponse = await emitirFactura({
        cliente: clienteFactura,
        items: facturaItems,
        total: montoCobrado,
        metodo_pago: metodoPago,
        descuento_sena: senaAplicadaMonto,
        ajustes: ajustesFactura,
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
      origenTipo: "turno_grupo_pago",
      origenId: pagoGrupo.id,
      clienteId: grupo.cliente_id || null,
      facturaResponse,
    })
    if (saved.error) {
      facturaError = facturaError || saved.error
    } else if (saved.facturaId) {
      facturaId = saved.facturaId
      facturaEstado = "emitida"
    }
  } else if (shouldFacturar && facturaError) {
    if (!facturaRetryPayload) {
      const fallbackItems: FacturaItem[] = [
        {
          tipo: "servicio",
          descripcion: "Servicios del grupo",
          cantidad: 1,
          precio_unitario: montoCobrado,
          subtotal: montoCobrado,
        },
      ]
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: { nombre: "Consumidor", apellido: "Final" },
        items: fallbackItems,
        total: montoCobrado,
        metodo_pago: metodoPago,
        descuento_sena: senaAplicadaMonto,
      })
    }
    if (facturaRetryPayload) {
      const pending = await guardarFacturaPendiente({
        db,
        userId: user.id,
        username,
        origenTipo: "turno_grupo_pago",
        origenId: pagoGrupo.id,
        clienteId: grupo.cliente_id || null,
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
    pago_grupo: pagoGrupo,
    cobrado: montoCobrado,
    sena_aplicada: senaAplicadaMonto,
    giftcard_aplicada: giftcardAplicadaId,
    giftcard_monto_aplicado: giftcardMontoAplicado,
    total_productos: totalProductos,
    factura: facturaResponse?.factura || null,
    factura_id: facturaId,
    factura_estado: facturaEstado,
    factura_pendiente: facturaEstado === "pendiente",
    factura_error: facturaError,
  })
}
