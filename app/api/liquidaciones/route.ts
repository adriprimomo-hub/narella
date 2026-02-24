import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

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

type LiquidacionItem = {
  id: string
  tipo: "servicio" | "producto" | "adelanto"
  fecha?: string | null
  servicio?: string | null
  producto?: string | null
  comision?: number | null
  adelanto?: number | null
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

export async function GET(request: Request) {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const url = new URL(request.url)
    const empleadaId = url.searchParams.get("empleada_id")
    const desdeParam = url.searchParams.get("desde")
    const hastaParam = url.searchParams.get("hasta")

    const defaultStart = startOfWeek(new Date())
    const start = normalizeDayStart(parseDate(desdeParam) || defaultStart)
    const requestedEnd = parseDate(hastaParam) || addDays(start, 6)
    const endExclusive = normalizeDayStart(addDays(requestedEnd, 1))

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 })
    }

    if (!empleadaId) {
      return NextResponse.json({ error: "Selecciona una empleada" }, { status: 400 })
    }

    let empleadaNombre = "Sin asignar"
    let empleadaApellido: string | null = null
    if (empleadaId !== "sin_asignar") {
      const { data: empleada, error: empleadaError } = await db
        .from("empleadas")
        .select("id, nombre, apellido")
        .eq("id", empleadaId)
        .eq("usuario_id", user.id)
        .single()
      if (empleadaError) {
        return NextResponse.json({ error: "Empleada no encontrada" }, { status: 404 })
      }
      empleadaNombre = empleada?.nombre || empleadaNombre
      empleadaApellido = empleada?.apellido ?? null
    }

    const { data: pagos, error: pagosError } = await db
      .from("pagos")
      .select("fecha_pago, turno_id")
      .eq("usuario_id", user.id)
      .gte("fecha_pago", start.toISOString())
      .lt("fecha_pago", endExclusive.toISOString())

    let pagosList = (pagos ?? []) as PagoRow[]
    if (pagosError) {
      if (pagosError.code === "42P01") {
        pagosList = []
      } else {
        return NextResponse.json({ error: pagosError.message }, { status: 500 })
      }
    }

    const { data: overrides, error: overridesError } = await db
      .from("servicio_empleada_comisiones")
      .select("servicio_id, empleada_id, comision_pct, comision_monto_fijo")
      .eq("usuario_id", user.id)

    let overridesList = (overrides ?? []) as OverrideRow[]
    if (overridesError) {
      if (overridesError.code === "42P01") {
        overridesList = []
      } else {
        return NextResponse.json({ error: overridesError.message }, { status: 500 })
      }
    }

    const { data: adelantos, error: adelantosError } = await db
      .from("adelantos")
      .select("monto, empleada_id, fecha_entrega")
      .eq("usuario_id", user.id)
      .gte("fecha_entrega", start.toISOString())
      .lt("fecha_entrega", endExclusive.toISOString())

    let adelantosList = adelantos ?? []
    if (adelantosError) {
      if (adelantosError.code === "42P01") {
        adelantosList = []
      } else {
        return NextResponse.json({ error: adelantosError.message }, { status: 500 })
      }
    }

    // Agregar pagos de grupos (detalles por turno)
    const { data: pagosGrupos, error: pagosGruposError } = await db
      .from("pagos_grupos")
      .select("id, fecha_pago, metodo_pago")
      .eq("usuario_id", user.id)
      .gte("fecha_pago", start.toISOString())
      .lt("fecha_pago", endExclusive.toISOString())

    let pagosGruposList = (pagosGrupos ?? []) as PagoGrupoRow[]
    if (pagosGruposError) {
      if (pagosGruposError.code === "42P01") {
        pagosGruposList = []
      } else {
        return NextResponse.json({ error: pagosGruposError.message }, { status: 500 })
      }
    }
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
      const { data: itemsGrupo, error: itemsGrupoError } = await db
        .from("pago_grupo_items")
        .select("turno_id, pago_grupo_id")
        .eq("usuario_id", user.id)
        .in("pago_grupo_id", pagosGruposList.map((p: any) => p.id))

      let itemsGrupoList = (itemsGrupo ?? []) as PagoGrupoItemRow[]
      if (itemsGrupoError) {
        if (itemsGrupoError.code === "42P01") {
          itemsGrupoList = []
        } else {
          return NextResponse.json({ error: itemsGrupoError.message }, { status: 500 })
        }
      }
      itemsGrupoList.forEach((item) => {
        if (!item.turno_id) return
        const pago = pagosGrupoMap.get(item.pago_grupo_id)
        if (!pago?.fecha_pago) return
        const prev = fechaPagoPorTurno.get(item.turno_id)
        if (!prev || new Date(pago.fecha_pago).getTime() > new Date(prev).getTime()) {
          fechaPagoPorTurno.set(item.turno_id, pago.fecha_pago)
        }
      })
    }

    const turnosIds = Array.from(fechaPagoPorTurno.keys())
    let turnosList: TurnoRow[] = []
    if (turnosIds.length > 0) {
      const { data: turnosData, error: turnosError } = await db
        .from("turnos")
        .select("id, empleada_id, empleada_final_id, servicio_id, servicio_final_id, servicios_agregados")
        .eq("usuario_id", user.id)
        .in("id", turnosIds)

      if (turnosError) {
        return NextResponse.json({ error: turnosError.message }, { status: 500 })
      }
      turnosList = (turnosData ?? []) as TurnoRow[]
    }

    const servicioIds = new Set<string>()
    turnosList.forEach((turno) => {
      const servicioPrincipalId = turno.servicio_final_id || turno.servicio_id
      if (servicioPrincipalId) servicioIds.add(servicioPrincipalId)

      const agregados = Array.isArray(turno.servicios_agregados) ? turno.servicios_agregados : []
      agregados.forEach((item) => {
        if (item?.servicio_id) servicioIds.add(item.servicio_id)
      })
    })

    let serviciosMap = new Map<string, ServicioRow>()
    if (servicioIds.size > 0) {
      const { data: serviciosData, error: serviciosError } = await db
        .from("servicios")
        .select("id, nombre, precio, precio_lista, precio_descuento, comision_pct, comision_monto_fijo")
        .eq("usuario_id", user.id)
        .in("id", Array.from(servicioIds))

      if (serviciosError) {
        return NextResponse.json({ error: serviciosError.message }, { status: 500 })
      }

      serviciosMap = new Map<string, ServicioRow>(
        ((serviciosData ?? []) as ServicioRow[]).map((servicio) => [servicio.id, servicio]),
      )
    }

    // Obtener overrides de comisiones de productos
    const { data: overridesProductos, error: overridesProductosError } = await db
      .from("producto_empleada_comisiones")
      .select("producto_id, empleada_id, comision_pct, comision_monto_fijo")
      .eq("usuario_id", user.id)

    if (overridesProductosError && overridesProductosError.code !== "42P01") {
      return NextResponse.json({ error: overridesProductosError.message }, { status: 500 })
    }
    const overridesProductosList = (overridesProductos ?? []) as OverrideProductoRow[]

    const { data: ventasProductos, error: ventasProductosError } = await db
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
      .eq("usuario_id", user.id)
      .eq("tipo", "venta")
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())

    if (ventasProductosError) {
      if (ventasProductosError.code !== "42P01") {
        return NextResponse.json({ error: ventasProductosError.message }, { status: 500 })
      }
    }
    const ventasProductosList = (ventasProductos ?? []) as ProductoVentaMovimientoRow[]

    // Optimización: convertir array a Map para O(1) lookup
    const overridesMap = new Map<string, OverrideRow>()
    overridesList.forEach((o: OverrideRow) => {
      overridesMap.set(`${o.servicio_id}:${o.empleada_id}`, o)
    })

    const findOverride = (servicioId?: string | null, staffId?: string | null) => {
      if (!servicioId || !staffId) return null
      return overridesMap.get(`${servicioId}:${staffId}`) || null
    }

    const items: LiquidacionItem[] = []
    let totalComision = 0
    let totalAdelantos = 0

    const calcularComisionServicio = (servicioId: string, staffId: string, cantidad: number) => {
      const servicio = serviciosMap.get(servicioId)
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

    turnosList.forEach((turno, index) => {
      const staffIdTurno = turno.empleada_final_id || turno.empleada_id || "sin_asignar"
      const fechaPago = fechaPagoPorTurno.get(turno.id) || null

      if (staffIdTurno === empleadaId) {
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
        if (!extra?.servicio_id || !serviciosMap.has(extra.servicio_id)) return
        const staffOrigenId =
          extra.origen_staff === true &&
          typeof extra.agregado_por_empleada_id === "string" &&
          extra.agregado_por_empleada_id.trim().length > 0
            ? extra.agregado_por_empleada_id
            : null
        if (!staffOrigenId || staffOrigenId !== empleadaId) return

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

    // Procesar ventas de productos
    const overridesProductosMap = new Map<string, OverrideProductoRow>()
    overridesProductosList.forEach((o: OverrideProductoRow) => {
      overridesProductosMap.set(`${o.producto_id}:${o.empleada_id}`, o)
    })

    ventasProductosList.forEach((venta, index) => {
      const staffId = venta.empleada_id || "sin_asignar"
      if (staffId !== empleadaId) return
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
      if (adelanto.empleada_id !== empleadaId) return
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

    return NextResponse.json({
      desde: start.toISOString(),
      hasta: addDays(endExclusive, -1).toISOString(),
      empleada: {
        id: empleadaId,
        nombre: empleadaNombre,
        apellido: empleadaApellido,
      },
      items: sortedItems,
      totales: {
        comision: totalComision,
        adelantos: totalAdelantos,
        neto: totalComision - totalAdelantos,
      },
    })
  } catch (error) {
    console.error("[liquidaciones] unexpected error", error)
    return NextResponse.json({ error: "No se pudo calcular la liquidacion" }, { status: 500 })
  }
}
