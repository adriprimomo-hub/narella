import { calcularLiquidacionDetalle, type LiquidacionDetalle } from "@/lib/liquidaciones/calculate"

type DbClient = {
  from: (table: string) => any
}

type LiquidacionRange = {
  start: Date
  endExclusive: Date
  desdeIso: string
  hastaIso: string
}

type TurnoHistoryLike = {
  id?: string | null
  empleada_id?: string | null
  empleada_final_id?: string | null
}

type HistorialRow = {
  id: string
  desde: string
  hasta: string
  empleada_id: string
}

export class LiquidacionServiceError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "LiquidacionServiceError"
    this.status = status
  }
}

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

const parseDate = (value: string | null) => {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match) {
    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)
    const localDate = new Date(year, month - 1, day, 0, 0, 0, 0)
    return Number.isNaN(localDate.getTime()) ? null : localDate
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const startOfWeek = (date: Date) => {
  const copy = new Date(date)
  const diff = (copy.getDay() + 6) % 7
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - diff)
  return copy
}

const addDays = (date: Date, days: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const normalizeDayStart = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const toHistoryDayEndExclusive = (value: string) => {
  const parsed = parseDate(value)
  if (!parsed) return null
  return addDays(normalizeDayStart(parsed), 1)
}

const getPrimaryStaffId = (turno?: TurnoHistoryLike | null) =>
  String(turno?.empleada_final_id || turno?.empleada_id || "").trim() || null

const getTurnoPaymentDates = async (db: DbClient, tenantId: string, turnoId: string) => {
  const fechas = new Set<string>()

  const { data: pagos, error: pagosError } = await db
    .from("pagos")
    .select("fecha_pago")
    .eq("usuario_id", tenantId)
    .eq("turno_id", turnoId)

  if (pagosError) {
    if (!isMissingTableError(pagosError)) {
      throw new LiquidacionServiceError(pagosError.message || "No se pudieron obtener los pagos.", 500)
    }
  } else {
    ;(Array.isArray(pagos) ? pagos : []).forEach((row: any) => {
      const fecha = typeof row?.fecha_pago === "string" ? row.fecha_pago : ""
      if (fecha) fechas.add(fecha)
    })
  }

  const { data: pagoGrupoItems, error: pagoGrupoItemsError } = await db
    .from("pago_grupo_items")
    .select("pago_grupo_id")
    .eq("usuario_id", tenantId)
    .eq("turno_id", turnoId)

  if (pagoGrupoItemsError) {
    if (!isMissingTableError(pagoGrupoItemsError)) {
      throw new LiquidacionServiceError(
        pagoGrupoItemsError.message || "No se pudieron obtener los pagos grupales del turno.",
        500,
      )
    }
  } else {
    const pagoGrupoIds = (Array.isArray(pagoGrupoItems) ? pagoGrupoItems : [])
      .map((row: any) => String(row?.pago_grupo_id || "").trim())
      .filter(Boolean)

    if (pagoGrupoIds.length > 0) {
      const { data: pagosGrupo, error: pagosGrupoError } = await db
        .from("pagos_grupos")
        .select("fecha_pago")
        .eq("usuario_id", tenantId)
        .in("id", pagoGrupoIds)

      if (pagosGrupoError) {
        if (!isMissingTableError(pagosGrupoError)) {
          throw new LiquidacionServiceError(
            pagosGrupoError.message || "No se pudieron obtener los pagos grupales.",
            500,
          )
        }
      } else {
        ;(Array.isArray(pagosGrupo) ? pagosGrupo : []).forEach((row: any) => {
          const fecha = typeof row?.fecha_pago === "string" ? row.fecha_pago : ""
          if (fecha) fechas.add(fecha)
        })
      }
    }
  }

  return Array.from(fechas)
}

const paymentDateMatchesHistorialRow = (historial: HistorialRow, fechaPago: string) => {
  const fechaPagoDate = new Date(fechaPago)
  const desdeDate = parseDate(historial.desde)
  const hastaExclusive = toHistoryDayEndExclusive(historial.hasta)
  if (!Number.isFinite(fechaPagoDate.getTime()) || !desdeDate || !hastaExclusive) {
    return false
  }
  const paymentMs = fechaPagoDate.getTime()
  return paymentMs >= desdeDate.getTime() && paymentMs < hastaExclusive.getTime()
}

export const resolveLiquidacionRange = (args: {
  desdeParam?: string | null
  hastaParam?: string | null
  now?: Date
}): LiquidacionRange => {
  const baseNow = args.now instanceof Date && Number.isFinite(args.now.getTime()) ? args.now : new Date()
  const defaultStart = startOfWeek(baseNow)
  const start = normalizeDayStart(parseDate(args.desdeParam || null) || defaultStart)
  const requestedEnd = parseDate(args.hastaParam || null) || addDays(start, 6)
  const endExclusive = normalizeDayStart(addDays(requestedEnd, 1))

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
    throw new LiquidacionServiceError("Rango de fechas inválido", 400)
  }

  return {
    start,
    endExclusive,
    desdeIso: start.toISOString(),
    hastaIso: addDays(endExclusive, -1).toISOString(),
  }
}

const loadEmpleadaSnapshot = async (db: DbClient, tenantId: string, empleadaId: string) => {
  if (empleadaId === "sin_asignar") {
    return {
      id: empleadaId,
      nombre: "Sin asignar",
      apellido: null,
      alias_transferencia: null,
    }
  }

  const loadEmpleada = async (withAlias: boolean) =>
    db
      .from("empleadas")
      .select(withAlias ? "id, nombre, apellido, alias_transferencia" : "id, nombre, apellido")
      .eq("id", empleadaId)
      .eq("usuario_id", tenantId)
      .single()

  let { data: empleada, error } = await loadEmpleada(true)
  if (error && isMissingColumnError(error, "alias_transferencia")) {
    ;({ data: empleada, error } = await loadEmpleada(false))
  }

  if (error || !empleada) {
    throw new LiquidacionServiceError("Empleada no encontrada", 404)
  }

  return {
    id: empleadaId,
    nombre: empleada?.nombre || "Sin asignar",
    apellido: empleada?.apellido ?? null,
    alias_transferencia: empleada?.alias_transferencia ?? null,
  }
}

export const cargarLiquidacionDetalle = async (args: {
  db: DbClient
  tenantId: string
  empleadaId: string
  desde?: string | null
  hasta?: string | null
  now?: Date
}): Promise<LiquidacionDetalle> => {
  const empleadaId = String(args.empleadaId || "").trim()
  if (!empleadaId) {
    throw new LiquidacionServiceError("Selecciona una empleada", 400)
  }

  const range = resolveLiquidacionRange({
    desdeParam: args.desde,
    hastaParam: args.hasta,
    now: args.now,
  })
  const empleada = await loadEmpleadaSnapshot(args.db, args.tenantId, empleadaId)

  const { data: pagos, error: pagosError } = await args.db
    .from("pagos")
    .select("fecha_pago, turno_id")
    .eq("usuario_id", args.tenantId)
    .gte("fecha_pago", range.start.toISOString())
    .lt("fecha_pago", range.endExclusive.toISOString())

  let pagosList = Array.isArray(pagos) ? pagos : []
  if (pagosError) {
    if (isMissingTableError(pagosError)) {
      pagosList = []
    } else {
      throw new LiquidacionServiceError(pagosError.message || "No se pudieron obtener los pagos.", 500)
    }
  }

  const { data: overrides, error: overridesError } = await args.db
    .from("servicio_empleada_comisiones")
    .select("servicio_id, empleada_id, comision_pct, comision_monto_fijo")
    .eq("usuario_id", args.tenantId)

  let overridesList = Array.isArray(overrides) ? overrides : []
  if (overridesError) {
    if (isMissingTableError(overridesError)) {
      overridesList = []
    } else {
      throw new LiquidacionServiceError(
        overridesError.message || "No se pudieron obtener los overrides de comisiones.",
        500,
      )
    }
  }

  const { data: adelantos, error: adelantosError } = await args.db
    .from("adelantos")
    .select("id, monto, empleada_id, fecha_entrega")
    .eq("usuario_id", args.tenantId)
    .gte("fecha_entrega", range.start.toISOString())
    .lt("fecha_entrega", range.endExclusive.toISOString())

  let adelantosList = Array.isArray(adelantos) ? adelantos : []
  if (adelantosError) {
    if (isMissingTableError(adelantosError)) {
      adelantosList = []
    } else {
      throw new LiquidacionServiceError(adelantosError.message || "No se pudieron obtener los adelantos.", 500)
    }
  }

  const { data: pagosGrupos, error: pagosGruposError } = await args.db
    .from("pagos_grupos")
    .select("id, fecha_pago, metodo_pago")
    .eq("usuario_id", args.tenantId)
    .gte("fecha_pago", range.start.toISOString())
    .lt("fecha_pago", range.endExclusive.toISOString())

  let pagosGruposList = Array.isArray(pagosGrupos) ? pagosGrupos : []
  if (pagosGruposError) {
    if (isMissingTableError(pagosGruposError)) {
      pagosGruposList = []
    } else {
      throw new LiquidacionServiceError(
        pagosGruposError.message || "No se pudieron obtener los pagos grupales.",
        500,
      )
    }
  }

  let pagoGrupoItemsList: Array<{ turno_id: string; pago_grupo_id: string }> = []
  if (pagosGruposList.length > 0) {
    const { data: itemsGrupo, error: itemsGrupoError } = await args.db
      .from("pago_grupo_items")
      .select("turno_id, pago_grupo_id")
      .eq("usuario_id", args.tenantId)
      .in(
        "pago_grupo_id",
        pagosGruposList.map((row: any) => row.id),
      )

    if (itemsGrupoError) {
      if (isMissingTableError(itemsGrupoError)) {
        pagoGrupoItemsList = []
      } else {
        throw new LiquidacionServiceError(
          itemsGrupoError.message || "No se pudieron obtener los items de pagos grupales.",
          500,
        )
      }
    } else {
      pagoGrupoItemsList = Array.isArray(itemsGrupo) ? itemsGrupo : []
    }
  }

  const fechaPagoPorTurno = new Map<string, string>()
  pagosList.forEach((pago: any) => {
    const turnoId = typeof pago?.turno_id === "string" ? pago.turno_id : ""
    const fechaPago = typeof pago?.fecha_pago === "string" ? pago.fecha_pago : ""
    if (!turnoId || !fechaPago) return
    const prev = fechaPagoPorTurno.get(turnoId)
    if (!prev || new Date(fechaPago).getTime() > new Date(prev).getTime()) {
      fechaPagoPorTurno.set(turnoId, fechaPago)
    }
  })

  if (pagosGruposList.length > 0) {
    const pagosGrupoMap = new Map<string, any>(pagosGruposList.map((row: any) => [row.id, row]))
    pagoGrupoItemsList.forEach((row) => {
      if (!row.turno_id) return
      const pagoGrupo = pagosGrupoMap.get(row.pago_grupo_id)
      const fechaPago = typeof pagoGrupo?.fecha_pago === "string" ? pagoGrupo.fecha_pago : ""
      if (!fechaPago) return
      const prev = fechaPagoPorTurno.get(row.turno_id)
      if (!prev || new Date(fechaPago).getTime() > new Date(prev).getTime()) {
        fechaPagoPorTurno.set(row.turno_id, fechaPago)
      }
    })
  }

  const turnosIds = Array.from(fechaPagoPorTurno.keys())
  let turnosList: any[] = []
  if (turnosIds.length > 0) {
    const { data: turnosData, error: turnosError } = await args.db
      .from("turnos")
      .select("id, empleada_id, empleada_final_id, servicio_id, servicio_final_id, servicios_agregados")
      .eq("usuario_id", args.tenantId)
      .in("id", turnosIds)

    if (turnosError) {
      throw new LiquidacionServiceError(turnosError.message || "No se pudieron obtener los turnos.", 500)
    }
    turnosList = Array.isArray(turnosData) ? turnosData : []
  }

  const servicioIds = new Set<string>()
  turnosList.forEach((turno: any) => {
    const servicioPrincipalId = turno?.servicio_final_id || turno?.servicio_id
    if (servicioPrincipalId) servicioIds.add(String(servicioPrincipalId))
    const agregados = Array.isArray(turno?.servicios_agregados) ? turno.servicios_agregados : []
    agregados.forEach((item: any) => {
      const servicioId = String(item?.servicio_id || "").trim()
      if (servicioId) servicioIds.add(servicioId)
    })
  })

  let serviciosList: any[] = []
  if (servicioIds.size > 0) {
    const { data: servicios, error: serviciosError } = await args.db
      .from("servicios")
      .select("id, nombre, precio, precio_lista, precio_descuento, comision_pct, comision_monto_fijo")
      .eq("usuario_id", args.tenantId)
      .in("id", Array.from(servicioIds))

    if (serviciosError) {
      throw new LiquidacionServiceError(serviciosError.message || "No se pudieron obtener los servicios.", 500)
    }
    serviciosList = Array.isArray(servicios) ? servicios : []
  }

  const { data: overridesProductos, error: overridesProductosError } = await args.db
    .from("producto_empleada_comisiones")
    .select("producto_id, empleada_id, comision_pct, comision_monto_fijo")
    .eq("usuario_id", args.tenantId)

  if (overridesProductosError && !isMissingTableError(overridesProductosError)) {
    throw new LiquidacionServiceError(
      overridesProductosError.message || "No se pudieron obtener los overrides de productos.",
      500,
    )
  }
  const overridesProductosList = Array.isArray(overridesProductos) ? overridesProductos : []

  const { data: ventasProductos, error: ventasProductosError } = await args.db
    .from("producto_movimientos")
    .select(
      `
        id,
        cantidad,
        precio_unitario,
        empleada_id,
        producto_id,
        created_at,
        nota,
        productos:producto_id (id, nombre, precio_lista, precio_descuento, comision_pct, comision_monto_fijo)
      `,
    )
    .eq("usuario_id", args.tenantId)
    .eq("tipo", "venta")
    .gte("created_at", range.start.toISOString())
    .lt("created_at", range.endExclusive.toISOString())

  if (ventasProductosError && !isMissingTableError(ventasProductosError)) {
    throw new LiquidacionServiceError(
      ventasProductosError.message || "No se pudieron obtener las ventas de productos.",
      500,
    )
  }
  const ventasProductosList = Array.isArray(ventasProductos) ? ventasProductos : []

  return calcularLiquidacionDetalle({
    desde: range.desdeIso,
    hasta: range.hastaIso,
    empleada,
    pagos: pagosList,
    pagosGrupos: pagosGruposList,
    pagoGrupoItems: pagoGrupoItemsList,
    turnos: turnosList,
    servicios: serviciosList,
    overrides: overridesList,
    overridesProductos: overridesProductosList,
    adelantos: adelantosList,
    ventasProductos: ventasProductosList,
  })
}

export const reconciliarLiquidacionesHistorialPorTurno = async (args: {
  db: DbClient
  tenantId: string
  turnoAntes: TurnoHistoryLike
  turnoDespues: TurnoHistoryLike
}) => {
  const turnoId = String(args.turnoDespues?.id || args.turnoAntes?.id || "").trim()
  if (!turnoId) {
    return { actualizadas: 0 }
  }

  const fechasPago = await getTurnoPaymentDates(args.db, args.tenantId, turnoId)
  if (fechasPago.length === 0) {
    return { actualizadas: 0 }
  }

  const staffIds = Array.from(
    new Set([getPrimaryStaffId(args.turnoAntes), getPrimaryStaffId(args.turnoDespues)].filter(Boolean) as string[]),
  )
  if (staffIds.length === 0) {
    return { actualizadas: 0 }
  }

  let historialQuery = args.db
    .from("liquidaciones_historial")
    .select("id, desde, hasta, empleada_id")
    .eq("usuario_id", args.tenantId)

  if (staffIds.length === 1) {
    historialQuery = historialQuery.eq("empleada_id", staffIds[0])
  } else {
    historialQuery = historialQuery.in("empleada_id", staffIds)
  }

  const { data: historial, error: historialError } = await historialQuery
  if (historialError) {
    if (isMissingTableError(historialError)) {
      return { actualizadas: 0 }
    }
    throw new LiquidacionServiceError(
      historialError.message || "No se pudo obtener el historial de liquidaciones.",
      500,
    )
  }

  const historialFiltrado = (Array.isArray(historial) ? historial : []).filter((row: any) =>
    fechasPago.some((fechaPago) => paymentDateMatchesHistorialRow(row as HistorialRow, fechaPago)),
  )

  let actualizadas = 0
  for (const row of historialFiltrado) {
    const liquidacion = await cargarLiquidacionDetalle({
      db: args.db,
      tenantId: args.tenantId,
      empleadaId: row.empleada_id,
      desde: row.desde,
      hasta: row.hasta,
    })

    const { error: updateError } = await args.db
      .from("liquidaciones_historial")
      .update({
        empleada_nombre: liquidacion.empleada.nombre || "Sin asignar",
        empleada_apellido: liquidacion.empleada.apellido ?? null,
        items: Array.isArray(liquidacion.items) ? liquidacion.items : [],
        total_comision: Number(liquidacion.totales?.comision || 0),
        total_adelantos: Number(liquidacion.totales?.adelantos || 0),
        total_neto: Number(liquidacion.totales?.neto || 0),
      })
      .eq("id", row.id)
      .eq("usuario_id", args.tenantId)

    if (updateError) {
      throw new LiquidacionServiceError(
        updateError.message || "No se pudo actualizar el historial de liquidaciones.",
        500,
      )
    }

    actualizadas += 1
  }

  return { actualizadas }
}
