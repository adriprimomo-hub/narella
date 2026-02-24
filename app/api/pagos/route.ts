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
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
}
type ServicioAgregadoPayload = {
  servicio_id: string
  cantidad: number
  precio_unitario: number
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
}

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

const pagoSchema = z
  .object({
    turno_id: z.string().min(1),
    metodo_pago: z.string().min(1),
    monto_total: z.coerce.number().optional(),
    facturar: z.boolean().optional(),
    aplicar_giftcard: z.boolean().optional(),
    giftcard_id: z.string().optional().nullable(),
    aplicar_sena: z.boolean().optional(),
    sena_id: z.string().optional().nullable(),
    precio_servicio: z.coerce.number().optional(),
    productos: z
      .array(
        z.object({
          producto_id: z.string().min(1),
          cantidad: z.coerce.number().int().positive(),
          precio_unitario: z.coerce.number().nonnegative(),
          origen_staff: z.boolean().optional(),
          agregado_por_empleada_id: z.string().optional().nullable(),
          agregado_por_user_id: z.string().optional().nullable(),
        }),
      )
      .optional(),
    servicios_agregados: z
      .array(
        z.object({
          servicio_id: z.string().min(1),
          cantidad: z.coerce.number().int().positive(),
          precio_unitario: z.coerce.number().nonnegative(),
          origen_staff: z.boolean().optional(),
          agregado_por_empleada_id: z.string().optional().nullable(),
          agregado_por_user_id: z.string().optional().nullable(),
        }),
      )
      .optional(),
    minutos_tarde: z.coerce.number().int().nonnegative().optional(),
    penalidad_monto: z.coerce.number().nonnegative().optional(),
    penalidad_motivo: z.string().optional().nullable(),
    nuevo_servicio_id: z.string().optional().nullable(),
    nueva_empleada_id: z.string().optional().nullable(),
    observaciones: z.string().optional().nullable(),
    finalizado_en: z.string().optional().nullable(),
    iniciado_en: z.string().optional().nullable(),
  })
  .passthrough()

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const turnoId = url.searchParams.get("turno_id")

  let query = db
    .from("pagos")
    .select(
      `
      *,
      turnos (cliente_id, estado, servicios:servicio_id(nombre, precio), servicio_final_id, servicio_final:servicio_final_id(nombre))
    `,
    )
    .eq("usuario_id", user.id)

  if (turnoId) query = query.eq("turno_id", turnoId)

  const { data, error } = await query.order("fecha_pago", { ascending: false })

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
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const { data: payload, response: validationResponse } = await validateBody(request, pagoSchema)
  if (validationResponse) return validationResponse
  const turnoId: string = payload.turno_id
  const metodoPago: string = payload.metodo_pago
  let montoTotal: number = Number.parseFloat(String(payload.monto_total ?? 0)) || 0
  const facturar: boolean = Boolean(payload.facturar)
  const aplicarGiftcard: boolean = Boolean(payload.aplicar_giftcard)
  const giftcardId: string | null = payload.giftcard_id || null
  const aplicarSena: boolean = Boolean(payload.aplicar_sena)
  const senaId: string | null = payload.sena_id || null
  const precioServicioPayload: number = Number.parseFloat(String(payload.precio_servicio || "")) || 0
  const productosProvided = Array.isArray(payload.productos)
  const productos: ProductoPayload[] = productosProvided ? (payload.productos as ProductoPayload[]) : []
  const serviciosAgregadosProvided = Array.isArray(payload.servicios_agregados)
  const serviciosAgregados: ServicioAgregadoPayload[] = serviciosAgregadosProvided
    ? (payload.servicios_agregados as ServicioAgregadoPayload[])
    : []
  const minutosTarde: number = Number.parseInt(String(payload.minutos_tarde ?? 0)) || 0
  let penalidadMonto: number = Number.parseFloat(String(payload.penalidad_monto ?? 0)) || 0
  let penalidadMotivo: string | null = payload.penalidad_motivo || null
  const nuevoServicioId: string | null = payload.nuevo_servicio_id || null
  const nuevaEmpleadaId: string | null = payload.nueva_empleada_id || null
  const observaciones: string | null =
    typeof payload.observaciones === "string" ? payload.observaciones.trim() : null

  if (!turnoId || !metodoPago) {
    return NextResponse.json({ error: "Datos de pago incompletos" }, { status: 400 })
  }

  const { data: turno, error: turnoError } = await db
    .from("turnos")
    .select("id, cliente_id, servicio_id, empleada_id, empleada_final_id, duracion_minutos, finalizado_en, iniciado_en, observaciones, grupo_id")
    .eq("usuario_id", user.id)
    .eq("id", turnoId)
    .single()

  if (turnoError || !turno) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 })
  }

  if (turno.grupo_id) {
    const { data: turnosGrupo } = await db
      .from("turnos")
      .select("id")
      .eq("usuario_id", user.id)
      .eq("grupo_id", turno.grupo_id)

    if ((turnosGrupo || []).length > 1) {
      return NextResponse.json({ error: "Este turno pertenece a un grupo. Cerrá el grupo en conjunto." }, { status: 409 })
    }
  }

  const empleadaSnapshotId = nuevaEmpleadaId || turno.empleada_id
  let empleadaSnapshot: { nombre: string; apellido?: string | null } | null = null
  if (empleadaSnapshotId) {
    const { data: empleadaData } = await db
      .from("empleadas")
      .select("nombre, apellido")
      .eq("id", empleadaSnapshotId)
      .eq("usuario_id", user.id)
      .single()
    empleadaSnapshot = empleadaData || null
  }

  const resolveProductoPrecio = async (productoId: string) => {
    const { data: producto } = await db
      .from("productos")
      .select("precio_lista, precio_descuento")
      .eq("id", productoId)
      .eq("usuario_id", user.id)
      .single()
    const precioDescuento = Number(producto?.precio_descuento ?? 0)
    if (Number.isFinite(precioDescuento) && precioDescuento >= 0) return precioDescuento
    return Number(producto?.precio_lista || 0)
  }

  let precioServicioBase = precioServicioPayload
  let totalServiciosAgregadosRecalculado = 0
  let totalProductosRecalculado = 0

  if (!isAdmin) {
    const servicioId = nuevoServicioId || turno.servicio_id
    const { data: servicio } = await db
      .from("servicios")
      .select("precio_lista, precio")
      .eq("id", servicioId)
      .eq("usuario_id", user.id)
      .single()
    const precioServicio = Number(servicio?.precio_lista ?? servicio?.precio ?? 0)
    for (const servicioAgregado of serviciosAgregados) {
      if (!servicioAgregado?.servicio_id) continue
      const { data: servicioExtra } = await db
        .from("servicios")
        .select("precio_lista, precio")
        .eq("id", servicioAgregado.servicio_id)
        .eq("usuario_id", user.id)
        .single()
      const cantidad = Number(servicioAgregado.cantidad || 1)
      const precio = Number(servicioExtra?.precio_lista ?? servicioExtra?.precio ?? 0)
      totalServiciosAgregadosRecalculado += precio * (Number.isFinite(cantidad) ? cantidad : 1)
    }
    for (const producto of productos) {
      if (!producto?.producto_id) continue
      const cantidad = Number(producto.cantidad || 0)
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue
      const precio = await resolveProductoPrecio(producto.producto_id)
      totalProductosRecalculado += precio * cantidad
    }
    penalidadMonto = 0
    penalidadMotivo = null
    precioServicioBase = precioServicio
    montoTotal = Math.max(
      0,
      precioServicioBase + totalServiciosAgregadosRecalculado + totalProductosRecalculado,
    )
  }

  if (montoTotal <= 0) {
    return NextResponse.json({ error: "Datos de pago incompletos" }, { status: 400 })
  }

  // Procesar servicios agregados (extra services from staff/modal)
  const serviciosAgregadosRows = serviciosAgregados
    .filter((s) => s.servicio_id)
    .map((s) => {
      const staffOrigenId =
        typeof s.agregado_por_empleada_id === "string" && s.agregado_por_empleada_id.trim().length > 0
          ? s.agregado_por_empleada_id
          : null
      const origenStaffValido = Boolean(s.origen_staff === true && staffOrigenId)
      return {
        servicio_id: s.servicio_id,
        cantidad: s.cantidad || 1,
        precio_unitario: s.precio_unitario || 0,
        origen_staff: origenStaffValido,
        agregado_por_empleada_id: origenStaffValido ? staffOrigenId : null,
        agregado_por_user_id: origenStaffValido ? s.agregado_por_user_id || null : null,
      }
    })

  if (serviciosAgregadosRows.length) {
    if (!isAdmin) {
      for (const row of serviciosAgregadosRows) {
        const { data: servicio } = await db
          .from("servicios")
          .select("precio_lista, precio")
          .eq("id", row.servicio_id)
          .eq("usuario_id", user.id)
          .single()
        row.precio_unitario = Number(servicio?.precio_lista ?? servicio?.precio ?? 0)
      }
    }
  }

  const serviciosAgregadosSnapshot = serviciosAgregadosRows.map((row) => ({
    servicio_id: row.servicio_id,
    cantidad: Number(row.cantidad || 1),
    precio_unitario: Number(row.precio_unitario || 0),
    origen_staff: Boolean(row.origen_staff === true && row.agregado_por_empleada_id),
    agregado_por_empleada_id: row.agregado_por_empleada_id || null,
    agregado_por_user_id: row.agregado_por_user_id || null,
  }))

  const productosAgregadosSnapshot = productos
    .filter((p) => Boolean(p.producto_id) && Number(p.cantidad || 0) > 0)
    .map((p) => {
      const staffOrigenId =
        typeof p.agregado_por_empleada_id === "string" && p.agregado_por_empleada_id.trim().length > 0
          ? p.agregado_por_empleada_id
          : null
      const origenStaffValido = Boolean(p.origen_staff === true && staffOrigenId)
      return {
        producto_id: p.producto_id,
        cantidad: Number(p.cantidad || 0),
        precio_unitario: Number(p.precio_unitario || 0),
        origen_staff: origenStaffValido,
        agregado_por_empleada_id: origenStaffValido ? staffOrigenId : null,
        agregado_por_user_id: origenStaffValido ? p.agregado_por_user_id || null : null,
        turno_id_origen: turnoId,
      }
    })

  const servicioFinalId = nuevoServicioId || turno.servicio_id
  let giftcardMontoAplicado = 0
  let giftcardAplicadaId: string | null = null
  let giftcardNumero: string | null = null
  let giftcardServicioIds: string[] = []
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

    if (giftcard.cliente_id !== turno.cliente_id) {
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

    if (existingGiftcardPago) {
      return NextResponse.json({ error: "Esta giftcard ya fue aplicada a otro turno" }, { status: 400 })
    }

    giftcardAplicadaId = giftcardId
    giftcardNumero = giftcard.numero ? String(giftcard.numero) : null
    giftcardServicioIds = Array.isArray(giftcard.servicio_ids) ? giftcard.servicio_ids : []

    if ((!precioServicioBase || precioServicioBase <= 0) && servicioFinalId) {
      const { data: servicioBase } = await db
        .from("servicios")
        .select("precio_lista, precio")
        .eq("id", servicioFinalId)
        .eq("usuario_id", user.id)
        .single()
      const fallback = Number(servicioBase?.precio_lista ?? servicioBase?.precio ?? 0)
      if (Number.isFinite(fallback)) {
        precioServicioBase = fallback
      }
    }

    if (servicioFinalId && giftcardServicioIds.includes(servicioFinalId)) {
      giftcardMontoAplicado += Number(precioServicioBase || 0)
    }
    serviciosAgregadosRows.forEach((row) => {
      if (!row.servicio_id) return
      if (giftcardServicioIds.includes(row.servicio_id)) {
        const cantidad = Number(row.cantidad || 1)
        giftcardMontoAplicado += Number(row.precio_unitario || 0) * (Number.isFinite(cantidad) ? cantidad : 1)
      }
    })
    giftcardMontoAplicado = Math.min(giftcardMontoAplicado, montoTotal)
    if (giftcardMontoAplicado <= 0) {
      return NextResponse.json({ error: "La giftcard no aplica a los servicios de este turno" }, { status: 400 })
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

      if (existingPago) {
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

  const montoCobrado = Math.max(0, montoTotal - senaAplicadaMonto - giftcardMontoAplicado)
  const montoParaPago = giftcardMontoAplicado > 0 ? montoTotal : montoCobrado

  // Actualizar turno (estado, tiempos reales, penalidad, cambios)
  const { error: turnoUpdateError } = await db
    .from("turnos")
    .update({
      estado: "completado",
      finalizado_en: payload.finalizado_en || turno.finalizado_en || new Date().toISOString(),
      iniciado_en: payload.iniciado_en || turno.iniciado_en || new Date().toISOString(),
      cerrado_por: user.id,
      minutos_tarde: minutosTarde,
      penalidad_monto: penalidadMonto,
      penalidad_motivo: penalidadMotivo,
      observaciones: observaciones ?? turno.observaciones,
      servicio_id: nuevoServicioId || turno.servicio_id,
      servicio_final_id: nuevoServicioId || turno.servicio_id,
      empleada_id: nuevaEmpleadaId || turno.empleada_id,
      empleada_final_id: nuevaEmpleadaId || turno.empleada_id,
      ...(serviciosAgregadosProvided ? { servicios_agregados: serviciosAgregadosSnapshot } : {}),
      ...(productosProvided ? { productos_agregados: productosAgregadosSnapshot } : {}),
      ...(empleadaSnapshot
        ? {
            empleada_final_nombre: empleadaSnapshot.nombre,
            empleada_final_apellido: empleadaSnapshot.apellido ?? null,
          }
        : {}),
      updated_at: new Date(),
    })
    .eq("usuario_id", user.id)
    .eq("id", turnoId)
  if (turnoUpdateError) {
    return NextResponse.json({ error: turnoUpdateError.message }, { status: 500 })
  }

  const { data, error } = await db
    .from("pagos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        turno_id: turnoId,
        monto: montoParaPago,
        metodo_pago: metodoPago,
        estado: "completado",
        fecha_pago: new Date().toISOString(),
        sena_aplicada_id: senaAplicadaMonto > 0 ? senaId : null,
        monto_sena_aplicada: senaAplicadaMonto,
        giftcard_aplicada_id: giftcardMontoAplicado > 0 ? giftcardAplicadaId : null,
        monto_giftcard_aplicado: giftcardMontoAplicado,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (giftcardMontoAplicado > 0 && giftcardAplicadaId) {
    const { error: giftcardUpdateError } = await db
      .from("giftcards")
      .update({
        estado: "usada",
        usada_en: new Date().toISOString(),
        usada_en_turno_id: turnoId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", giftcardAplicadaId)
      .eq("usuario_id", user.id)
    if (giftcardUpdateError) {
      return NextResponse.json({ error: giftcardUpdateError.message }, { status: 500 })
    }
  }

  // Registrar movimiento de caja por el servicio
  if (montoCobrado > 0) {
    const { error: cajaServicioError } = await db.from("caja_movimientos").insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        medio_pago: metodoPago,
        tipo: "ingreso",
        monto: montoCobrado,
        motivo: "Cobro servicio",
        source_tipo: "turno_pago",
        source_id: data.id,
        creado_por: user.id,
      },
    ])
    if (cajaServicioError) {
      return NextResponse.json({ error: cajaServicioError.message }, { status: 500 })
    }
  }

  // Procesar productos vendidos
  let totalProductos = 0
  const productosFactura: FacturaItem[] = []
  for (const prod of productos) {
    if (!prod.producto_id || !prod.cantidad || prod.cantidad <= 0) continue

    const { data: producto, error: productoError } = await db
      .from("productos")
      .select("id, nombre, precio_lista, precio_descuento, stock_actual")
      .eq("id", prod.producto_id)
      .eq("usuario_id", user.id)
      .single()

    if (productoError) return NextResponse.json({ error: productoError.message }, { status: 500 })
    if (!producto) continue

    const precioUnitario = isAdmin
      ? prod.precio_unitario
      : Number(producto.precio_descuento ?? producto.precio_lista ?? 0)
    const cantidad = Number(prod.cantidad)
    const subtotal = precioUnitario * cantidad
    totalProductos += subtotal
    productosFactura.push({
      tipo: "producto",
      descripcion: `Producto: ${producto.nombre}`,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal,
    })

    // Registrar venta de producto
    const staffOrigenId =
      typeof prod.agregado_por_empleada_id === "string" && prod.agregado_por_empleada_id.trim().length > 0
        ? prod.agregado_por_empleada_id
        : null
    const productoComisionaStaff = Boolean(prod.origen_staff === true && staffOrigenId)
    const empleadaComisionStaff = productoComisionaStaff ? staffOrigenId : null
    const notaProducto = buildProductoNota(`Venta en turno ${turnoId}`, productoComisionaStaff, empleadaComisionStaff)

    // Registrar movimiento de stock
    const { error: movimientoProductoError } = await db.from("producto_movimientos").insert([
      {
        usuario_id: user.id,
        producto_id: prod.producto_id,
        tipo: "venta",
        cantidad,
        precio_unitario: precioUnitario,
        cliente_id: turno.cliente_id,
        empleada_id: empleadaComisionStaff,
        metodo_pago: metodoPago,
        nota: notaProducto,
        creado_por: user.id,
        creado_por_username: username,
      },
    ])
    if (movimientoProductoError) {
      return NextResponse.json({ error: movimientoProductoError.message }, { status: 500 })
    }

    // Actualizar stock
    const nuevoStock = Math.max(0, Number(producto.stock_actual || 0) - cantidad)
    const { error: stockUpdateError } = await db
      .from("productos")
      .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
      .eq("id", prod.producto_id)
      .eq("usuario_id", user.id)
    if (stockUpdateError) {
      return NextResponse.json({ error: stockUpdateError.message }, { status: 500 })
    }

    // Registrar ingreso en caja por producto
    const { error: cajaProductoError } = await db.from("caja_movimientos").insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        medio_pago: metodoPago,
        tipo: "ingreso",
        monto: subtotal,
        motivo: `Venta producto: ${producto.nombre}`,
        source_tipo: "producto_venta",
        source_id: prod.producto_id,
        creado_por: user.id,
      },
    ])
    if (cajaProductoError) {
      return NextResponse.json({ error: cajaProductoError.message }, { status: 500 })
    }
  }

  const shouldFacturar = facturar && montoCobrado > 0
  let facturaResponse = null
  let facturaError: string | null = null
  let facturaId: string | null = null
  let facturaEstado: "emitida" | "pendiente" | null = null
  let facturaRetryPayload: FacturaRetryPayload | null = null
  if (shouldFacturar) {
    try {
      const { data: clienteData } = await db
        .from("clientes")
        .select("nombre, apellido")
        .eq("id", turno.cliente_id)
        .eq("usuario_id", user.id)
        .single()

      const servicioIds = new Set<string>()
      if (servicioFinalId) servicioIds.add(servicioFinalId)
      serviciosAgregadosRows.forEach((s) => {
        if (s.servicio_id) servicioIds.add(s.servicio_id)
      })
      const { data: serviciosFactura } = await db
        .from("servicios")
        .select("id, nombre")
        .in("id", Array.from(servicioIds))
      const serviciosMap = new Map<string, any>((serviciosFactura || []).map((s: any) => [s.id, s]))

      const totalServiciosAgregados = serviciosAgregadosRows.reduce(
        (acc, s) => acc + Number(s.precio_unitario || 0) * Number(s.cantidad || 1),
        0,
      )
      const baseServicioMonto = Math.max(0, montoTotal - totalServiciosAgregados - totalProductos - penalidadMonto)
      const facturaItems: FacturaItem[] = []
      if (baseServicioMonto > 0) {
        const nombreServicio = serviciosMap.get(servicioFinalId)?.nombre || "Servicio"
        facturaItems.push({
          tipo: "servicio",
          descripcion: `Servicio: ${nombreServicio}`,
          cantidad: 1,
          precio_unitario: baseServicioMonto,
          subtotal: baseServicioMonto,
        })
      }
      serviciosAgregadosRows.forEach((s) => {
        const nombre = serviciosMap.get(s.servicio_id)?.nombre || "Servicio extra"
        const subtotal = Number(s.precio_unitario || 0) * Number(s.cantidad || 1)
        if (subtotal <= 0) return
        facturaItems.push({
          tipo: "servicio",
          descripcion: `Servicio extra: ${nombre}`,
          cantidad: Number(s.cantidad || 1),
          precio_unitario: Number(s.precio_unitario || 0),
          subtotal,
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
      facturaItems.push(...productosFactura)
      if (facturaItems.length === 0 && montoCobrado > 0) {
        facturaItems.push({
          tipo: "servicio",
          descripcion: "Servicio",
          cantidad: 1,
          precio_unitario: montoCobrado,
          subtotal: montoCobrado,
        })
      }

      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      const ajustesFactura: FacturaAjuste[] = []
      if (senaAplicadaMonto > 0) {
        const fechaSena = formatDayMonth(senaFechaPago)
        const nombreServicioSena = senaServicioNombre || serviciosMap.get(servicioFinalId)?.nombre || "Servicio"
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
      origenTipo: "turno_pago",
      origenId: data.id,
      clienteId: turno.cliente_id || null,
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
          descripcion: "Servicio",
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
        origenTipo: "turno_pago",
        origenId: data.id,
        clienteId: turno.cliente_id || null,
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
    pago: data,
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
