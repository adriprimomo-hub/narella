import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { formatDateRange } from "@/lib/date-format"
import { MEDIUM_LARGE_PAGE_SIZE } from "@/lib/api/pagination"

const parseDate = (value: string | null) => {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map((v) => Number.parseInt(v, 10))
    if (!year || !month || !day) return null
    const local = new Date(year, month - 1, day)
    return Number.isNaN(local.getTime()) ? null : local
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeDayStart = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const addDays = (date: Date, days: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const resolvePositiveInt = (rawValue: string | null, fallback: number, max = 200) => {
  const parsed = Number.parseInt(String(rawValue || fallback), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

const paginateArray = <T,>(items: T[], page: number, pageSize: number) => {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pagedItems = items.slice(startIndex, endIndex)

  return {
    items: pagedItems,
    pagination: {
      page: currentPage,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_prev: currentPage > 1,
      has_next: currentPage < totalPages,
    },
  }
}

export async function GET(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(request.url)
  const desdeParam = url.searchParams.get("desde")
  const hastaParam = url.searchParams.get("hasta")
  const serviciosRealizadosPage = resolvePositiveInt(url.searchParams.get("sr_page"), 1)
  const serviciosRealizadosPageSize = resolvePositiveInt(
    url.searchParams.get("sr_page_size"),
    MEDIUM_LARGE_PAGE_SIZE,
    150,
  )
  const detalleServiciosPage = resolvePositiveInt(url.searchParams.get("ds_page"), 1)
  const detalleServiciosPageSize = resolvePositiveInt(
    url.searchParams.get("ds_page_size"),
    MEDIUM_LARGE_PAGE_SIZE,
    150,
  )
  const ventasProductosPage = resolvePositiveInt(url.searchParams.get("vp_page"), 1)
  const ventasProductosPageSize = resolvePositiveInt(
    url.searchParams.get("vp_page_size"),
    MEDIUM_LARGE_PAGE_SIZE,
    150,
  )
  const today = new Date()
  const start = normalizeDayStart(parseDate(desdeParam) || today)
  const endDate = normalizeDayStart(parseDate(hastaParam) || today)
  const endExclusive = addDays(endDate, 1)

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 })
  }

  // Servicios completados
  const { data: turnosData, error: turnosError } = await db
    .from("turnos")
    .select(
      `
      id,
      cliente_id,
      servicio_id,
      servicio_final_id,
      fecha_inicio,
      foto_trabajo_base64,
      foto_trabajo_storage_path,
      clientes:cliente_id(nombre, apellido),
      servicios:servicio_id(id, nombre, precio, precio_lista),
      servicio_final:servicio_final_id(id, nombre, precio, precio_lista)
    `,
    )
    .eq("usuario_id", user.id)
    .eq("estado", "completado")
    .gte("fecha_inicio", start.toISOString())
    .lt("fecha_inicio", endExclusive.toISOString())
  if (turnosError) return NextResponse.json({ error: turnosError.message }, { status: 500 })

  // Ventas de productos
  const { data: ventasData, error: ventasError } = await db
    .from("producto_movimientos")
    .select("*, productos:producto_id(nombre, precio_lista, precio_descuento)")
    .eq("usuario_id", user.id)
    .eq("tipo", "venta")
    .gte("created_at", start.toISOString())
    .lt("created_at", endExclusive.toISOString())
  if (ventasError) return NextResponse.json({ error: ventasError.message }, { status: 500 })

  // Señ as
  const { data: senasData } = await db
    .from("senas")
    .select("monto, estado")
    .eq("usuario_id", user.id)
    .gte("fecha_pago", start.toISOString())
    .lt("fecha_pago", endExclusive.toISOString())

  // Adelantos
  const { data: adelantosData } = await db
    .from("adelantos")
    .select("monto")
    .eq("usuario_id", user.id)
    .gte("fecha_entrega", start.toISOString())
    .lt("fecha_entrega", endExclusive.toISOString())

  const reporteServicios = new Map<string, any>()
  const serviciosRealizados: any[] = []
  turnosData?.forEach((t: any) => {
    const servicioUsado = t.servicio_final || t.servicios
    const key = servicioUsado?.id || t.servicio_final_id || t.servicio_id
    if (!key || !servicioUsado) return
    const precioServicio = Number(servicioUsado.precio ?? servicioUsado.precio_lista ?? 0)
    if (!reporteServicios.has(key)) {
      reporteServicios.set(key, {
        servicio_id: key,
        nombre: servicioUsado.nombre,
        precio: precioServicio,
        cantidad: 0,
        ingresos: 0,
      })
    }
    const item = reporteServicios.get(key)
    item.cantidad += 1
    item.ingresos += precioServicio

    const clienteNombre = [t.clientes?.nombre, t.clientes?.apellido].filter(Boolean).join(" ").trim()
    serviciosRealizados.push({
      turno_id: t.id,
      fecha_inicio: t.fecha_inicio,
      cliente: clienteNombre || "Clienta",
      servicio: servicioUsado.nombre || "Servicio",
      precio: precioServicio,
      foto_trabajo_disponible: Boolean(t.foto_trabajo_storage_path || t.foto_trabajo_base64),
    })
  })

  const reporteVentas = ventasData?.reduce(
    (acc: any, v: any) => {
      const ingreso = Number(v.precio_unitario || 0) * Number(v.cantidad || 1)
      acc.total += ingreso
      acc.detalle.push({
        producto: v.productos?.nombre || "",
        cantidad: v.cantidad,
        precio_unitario: v.precio_unitario,
        metodo_pago: v.metodo_pago,
      })
      return acc
    },
    { total: 0, detalle: [] as any[] },
  ) || { total: 0, detalle: [] }

  const ingresosServicios = Array.from(reporteServicios.values()).reduce((sum: number, s: any) => sum + s.ingresos, 0)
  const totalSenas = (senasData || []).reduce((sum: number, s: any) => sum + Number(s.monto || 0), 0)
  const totalAdelantos = (adelantosData || []).reduce((sum: number, a: any) => sum + Number(a.monto || 0), 0)
  const serviciosOrdenados = Array.from(reporteServicios.values()).sort((a, b) => b.cantidad - a.cantidad)
  const serviciosRealizadosOrdenados = serviciosRealizados.sort(
    (a, b) => new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime(),
  )
  const ventasDetalleOrdenado = Array.isArray(reporteVentas.detalle) ? reporteVentas.detalle : []

  const serviciosPaginados = paginateArray(serviciosOrdenados, detalleServiciosPage, detalleServiciosPageSize)
  const serviciosRealizadosPaginados = paginateArray(
    serviciosRealizadosOrdenados,
    serviciosRealizadosPage,
    serviciosRealizadosPageSize,
  )
  const ventasProductosPaginados = paginateArray(ventasDetalleOrdenado, ventasProductosPage, ventasProductosPageSize)

  return NextResponse.json({
    desde: start.toISOString(),
    hasta: endDate.toISOString(),
    periodo: formatDateRange(start, endDate),
    servicios: serviciosPaginados.items,
    servicios_realizados: serviciosRealizadosPaginados.items,
    ventas: {
      total: reporteVentas.total,
      detalle: ventasProductosPaginados.items,
    },
    pagination: {
      servicios_realizados: serviciosRealizadosPaginados.pagination,
      detalle_servicios: serviciosPaginados.pagination,
      ventas_productos: ventasProductosPaginados.pagination,
    },
    resumen: {
      cantidad_servicios: serviciosRealizadosOrdenados.length,
      ingresos_servicios: ingresosServicios,
      ingresos_productos: reporteVentas.total,
      senas_registradas: totalSenas,
      adelantos: totalAdelantos,
      total_general: ingresosServicios + reporteVentas.total,
    },
  })
}
