type PagoRow = {
  fecha_pago: string
  turno_id: string | null
}

type OverrideRow = { servicio_id: string; empleada_id: string; comision_pct: number | null; comision_monto_fijo: number | null }
type OverrideProductoRow = { producto_id: string; empleada_id: string; comision_pct: number | null; comision_monto_fijo: number | null }
type PagoGrupoRow = { id: string; fecha_pago?: string | null; metodo_pago?: string | null }
type PagoGrupoItemRow = { turno_id: string; pago_grupo_id: string }

type TurnoRow = {
  id: string
  empleada_id: string | null
  empleada_final_id: string | null
  servicio_id: string | null
  servicio_final_id: string | null
  servicios_agregados?: Array<{
    servicio_id?: string
    cantidad?: number
    precio_unitario?: number
    origen_staff?: boolean
    agregado_por_empleada_id?: string | null
    agregado_por_user_id?: string | null
  }> | null
}

type ServicioRow = {
  id: string
  nombre: string
  precio: number | null
  precio_lista: number | null
  precio_descuento: number | null
  comision_pct: number | null
  comision_monto_fijo: number | null
}

type ProductoVentaMovimientoRow = {
  id: string
  cantidad: number | null
  precio_unitario: number | null
  empleada_id: string | null
  producto_id: string | null
  created_at: string | null
  nota: string | null
  productos?: {
    id: string
    nombre: string
    precio_lista: number | null
    precio_descuento: number | null
    comision_pct: number | null
    comision_monto_fijo: number | null
  } | null
}

export type LiquidacionItem = {
  id: string
  tipo: "servicio" | "producto" | "adelanto"
  fecha?: string | null
  servicio?: string | null
  producto?: string | null
  comision?: number | null
  adelanto?: number | null
}

export type LiquidacionDetalle = {
  desde: string
  hasta: string
  empleada: { id: string; nombre: string; apellido?: string | null; alias_transferencia?: string | null }
  items: LiquidacionItem[]
  totales: { comision: number; adelantos: number; neto: number }
}

type LiquidacionInput = {
  desde: string
  hasta: string
  empleada: { id: string; nombre: string; apellido?: string | null; alias_transferencia?: string | null }
  pagos: PagoRow[]
  pagosGrupos: PagoGrupoRow[]
  pagoGrupoItems: PagoGrupoItemRow[]
  turnos: TurnoRow[]
  servicios: ServicioRow[]
  overrides: OverrideRow[]
  overridesProductos: OverrideProductoRow[]
  adelantos: Array<{ id?: string; monto?: number | null; empleada_id?: string | null; fecha_entrega?: string | null }>
  ventasProductos: ProductoVentaMovimientoRow[]
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toPositiveQuantity = (value: unknown, fallback = 1) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

const getServicioPrecioComision = (
  servicio: Pick<ServicioRow, "precio_descuento" | "precio_lista" | "precio"> | null | undefined,
) => {
  if (!servicio) return 0
  const precioDescuento = Number(servicio.precio_descuento)
  if (Number.isFinite(precioDescuento) && precioDescuento >= 0) return precioDescuento
  const precioLista = Number(servicio.precio_lista ?? servicio.precio ?? 0)
  return Number.isFinite(precioLista) && precioLista >= 0 ? precioLista : 0
}

const getProductoPrecioComision = (
  producto:
    | Pick<
        NonNullable<ProductoVentaMovimientoRow["productos"]>,
        "precio_descuento" | "precio_lista"
      >
    | null
    | undefined,
) => {
  if (!producto) return null
  const precioDescuento = Number(producto.precio_descuento)
  if (Number.isFinite(precioDescuento) && precioDescuento >= 0) return precioDescuento
  const precioLista = Number(producto.precio_lista ?? 0)
  return Number.isFinite(precioLista) && precioLista >= 0 ? precioLista : null
}

const hasComisionMarker = (nota: string | null | undefined) => {
  if (!nota) return false
  const marker = nota.match(/(?:^|\|)\s*comision_staff\s*=\s*([01])(?:\s*\||\s*$)/i)
  return marker?.[1] === "1"
}

const normalizeStaffOrigenId = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase()
  if (normalized === "sin_asignar" || normalized === "ninguna") return null
  return trimmed
}

export const calcularLiquidacionDetalle = (input: LiquidacionInput): LiquidacionDetalle => {
  const pagosList = Array.isArray(input.pagos) ? input.pagos : []
  const pagosGruposList = Array.isArray(input.pagosGrupos) ? input.pagosGrupos : []
  const pagoGrupoItemsList = Array.isArray(input.pagoGrupoItems) ? input.pagoGrupoItems : []
  const turnosList = Array.isArray(input.turnos) ? input.turnos : []
  const serviciosList = Array.isArray(input.servicios) ? input.servicios : []
  const overridesList = Array.isArray(input.overrides) ? input.overrides : []
  const overridesProductosList = Array.isArray(input.overridesProductos) ? input.overridesProductos : []
  const adelantosList = Array.isArray(input.adelantos) ? input.adelantos : []
  const ventasProductosList = Array.isArray(input.ventasProductos) ? input.ventasProductos : []

  const fechaPagoPorTurno = new Map<string, string>()
  pagosList.forEach((pago) => {
    if (!pago.turno_id || !pago.fecha_pago) return
    const prev = fechaPagoPorTurno.get(pago.turno_id)
    if (!prev || new Date(pago.fecha_pago).getTime() > new Date(prev).getTime()) {
      fechaPagoPorTurno.set(pago.turno_id, pago.fecha_pago)
    }
  })

  if (pagosGruposList.length > 0) {
    const pagosGrupoMap = new Map<string, PagoGrupoRow>(pagosGruposList.map((p) => [p.id, p]))
    pagoGrupoItemsList.forEach((item) => {
      if (!item.turno_id) return
      const pago = pagosGrupoMap.get(item.pago_grupo_id)
      if (!pago?.fecha_pago) return
      const prev = fechaPagoPorTurno.get(item.turno_id)
      if (!prev || new Date(pago.fecha_pago).getTime() > new Date(prev).getTime()) {
        fechaPagoPorTurno.set(item.turno_id, pago.fecha_pago)
      }
    })
  }

  const servicioMap = new Map<string, ServicioRow>(serviciosList.map((servicio) => [servicio.id, servicio]))
  const overridesMap = new Map<string, OverrideRow>()
  overridesList.forEach((o) => {
    overridesMap.set(`${o.servicio_id}:${o.empleada_id}`, o)
  })

  const findOverride = (servicioId?: string | null, staffId?: string | null) => {
    if (!servicioId || !staffId) return null
    return overridesMap.get(`${servicioId}:${staffId}`) || null
  }

  const calcularComisionServicio = (servicioId: string, staffId: string, cantidad: number) => {
    const servicio = servicioMap.get(servicioId)
    const override = findOverride(servicioId, staffId)
    const overrideTieneValor =
      !!override &&
      ((override.comision_pct !== null && override.comision_pct !== undefined) ||
        (override.comision_monto_fijo !== null && override.comision_monto_fijo !== undefined))
    const comisionPct = overrideTieneValor
      ? (override!.comision_pct !== null && override!.comision_pct !== undefined
          ? Number(override!.comision_pct)
          : Number(servicio?.comision_pct || 0))
      : Number(servicio?.comision_pct || 0)
    const comisionMontoFijo = overrideTieneValor
      ? (override!.comision_monto_fijo !== null && override!.comision_monto_fijo !== undefined
          ? Number(override!.comision_monto_fijo)
          : Number(servicio?.comision_monto_fijo || 0))
      : Number(servicio?.comision_monto_fijo || 0)

    const cantidadValida = toPositiveQuantity(cantidad)
    const montoBase = getServicioPrecioComision(servicio) * cantidadValida
    const comision = montoBase * (comisionPct / 100) + comisionMontoFijo * cantidadValida
    return { comision, nombre: servicio?.nombre || "Servicio", cantidad: cantidadValida }
  }

  const items: LiquidacionItem[] = []
  let totalComision = 0
  let totalAdelantos = 0

  turnosList.forEach((turno, index) => {
    const staffIdTurno = turno.empleada_final_id || turno.empleada_id || "sin_asignar"
    const fechaPago = fechaPagoPorTurno.get(turno.id) || null

    if (staffIdTurno === input.empleada.id) {
      const servicioPrincipalId = turno.servicio_final_id || turno.servicio_id
      if (servicioPrincipalId) {
        const resultado = calcularComisionServicio(servicioPrincipalId, staffIdTurno, 1)
        totalComision += resultado.comision
        items.push({
          id: `servicio-principal-${turno.id}-${index}`,
          tipo: "servicio",
          fecha: fechaPago,
          servicio: resultado.nombre,
          comision: resultado.comision,
        })
      }
    }

    const serviciosAgregadosTurno = Array.isArray(turno.servicios_agregados) ? turno.servicios_agregados : []
    serviciosAgregadosTurno.forEach((extra, extraIndex) => {
      if (!extra?.servicio_id || !servicioMap.has(extra.servicio_id)) return
      const staffOrigenId =
        extra.origen_staff === true ? normalizeStaffOrigenId(extra.agregado_por_empleada_id) : null
      if (!staffOrigenId || staffOrigenId !== input.empleada.id) return

      const resultado = calcularComisionServicio(extra.servicio_id, staffOrigenId, toPositiveQuantity(extra.cantidad, 1))
      totalComision += resultado.comision
      const label = resultado.cantidad > 1 ? `${resultado.nombre} x${resultado.cantidad}` : resultado.nombre
      items.push({
        id: `servicio-extra-turno-${turno.id}-${extraIndex}`,
        tipo: "servicio",
        fecha: fechaPago,
        servicio: label,
        comision: resultado.comision,
      })
    })
  })

  const overridesProductosMap = new Map<string, OverrideProductoRow>()
  overridesProductosList.forEach((o) => {
    overridesProductosMap.set(`${o.producto_id}:${o.empleada_id}`, o)
  })

  ventasProductosList.forEach((venta, index) => {
    const staffId = venta.empleada_id || "sin_asignar"
    if (staffId !== input.empleada.id) return
    if (!hasComisionMarker(venta.nota)) return

    const producto = venta.productos
    const override =
      staffId !== "sin_asignar" ? overridesProductosMap.get(`${producto?.id}:${staffId}`) : null

    const comisionPct = override?.comision_pct ?? producto?.comision_pct ?? 0
    const comisionFijo = override?.comision_monto_fijo ?? producto?.comision_monto_fijo ?? 0

    const cantidad = toPositiveQuantity(venta.cantidad, 0)
    if (cantidad <= 0) return
    const precioBaseProducto = getProductoPrecioComision(producto)
    const precioMovimiento = Number(venta.precio_unitario ?? 0)
    const precioUnitarioComision =
      precioBaseProducto !== null
        ? precioBaseProducto
        : Number.isFinite(precioMovimiento) && precioMovimiento >= 0
          ? precioMovimiento
          : 0
    const montoVenta = cantidad * precioUnitarioComision
    const comisionCalculada = montoVenta * (Number(comisionPct) / 100) + Number(comisionFijo) * cantidad
    totalComision += comisionCalculada

    const nombreProducto = producto?.nombre || "Producto"
    const productoLabel = cantidad > 1 ? `${nombreProducto} x${cantidad}` : nombreProducto

    items.push({
      id: `producto-${venta.id || index}`,
      tipo: "producto",
      fecha: venta.created_at,
      producto: productoLabel,
      comision: comisionCalculada,
    })
  })

  adelantosList.forEach((adelanto: any, index: number) => {
    if (adelanto.empleada_id !== input.empleada.id) return
    const monto = Number(adelanto.monto || 0)
    totalAdelantos += monto
    items.push({
      id: `adelanto-${adelanto.id || index}`,
      tipo: "adelanto",
      fecha: adelanto.fecha_entrega,
      adelanto: -monto,
    })
  })

  const sortedItems = items.sort((a, b) => {
    const aTime = a.fecha ? new Date(a.fecha).getTime() : 0
    const bTime = b.fecha ? new Date(b.fecha).getTime() : 0
    return bTime - aTime
  })

  return {
    desde: input.desde,
    hasta: input.hasta,
    empleada: input.empleada,
    items: sortedItems,
    totales: {
      comision: roundMoney(totalComision),
      adelantos: roundMoney(totalAdelantos),
      neto: roundMoney(totalComision - totalAdelantos),
    },
  }
}
