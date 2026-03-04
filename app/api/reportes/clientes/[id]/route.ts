import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { normalizeDeclaracionCampos } from "@/lib/declaraciones-juradas"

const isFacturasTableMissingError = (error: any) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes("public.facturas") && message.includes("schema cache")
}

const isMissingTableError = (error: any, table: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(`public.${table}`.toLowerCase()) && message.includes("schema cache")
}

const isMissingColumnError = (error: any, column: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") {
    return message.includes(col)
  }
  return message.includes("schema cache") && message.includes(col)
}

const stripTurnoPhoto = (turno: any) => {
  const fotoTrabajoDisponible = Boolean(turno?.foto_trabajo_storage_path || turno?.foto_trabajo_base64)
  const {
    foto_trabajo_base64: _fotoBase64,
    foto_trabajo_storage_bucket: _fotoBucket,
    foto_trabajo_storage_path: _fotoPath,
    foto_trabajo_mime_type: _fotoMime,
    ...rest
  } = turno || {}

  return {
    ...rest,
    foto_trabajo_disponible: fotoTrabajoDisponible,
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const tenantId = getTenantId(user) || user.id

  // Obtener info cliente
  const { data: cliente } = await db.from("clientes").select("*").eq("id", id).eq("usuario_id", tenantId).single()

  // Obtener historial de turnos
  const { data: turnos, error } = await db
    .from("turnos")
    .select(
      `
      *,
      servicios:servicio_id(nombre, precio, duracion_minutos),
      servicio_final:servicio_final_id(nombre, precio, duracion_minutos),
      empleadas:empleada_id(nombre, apellido),
      empleada_final:empleada_final_id(nombre, apellido)
    `,
    )
    .eq("cliente_id", id)
    .eq("usuario_id", tenantId)
    .order("fecha_inicio", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Obtener pagos
  const { data: pagos } = await db
    .from("pagos")
    .select("id, turno_id, monto, metodo_pago, fecha_pago, sena_aplicada_id, monto_sena_aplicada")
    .in("turno_id", turnos?.map((t: any) => t.id) || [])
    .eq("usuario_id", tenantId)

  // Pagos grupales (detalle por turno)
  const { data: pagosGrupoItems } = await db
    .from("pago_grupo_items")
    .select("id, turno_id, monto, pago_grupo_id")
    .in("turno_id", turnos?.map((t: any) => t.id) || [])
    .eq("usuario_id", tenantId)

  const pagosGrupoIds = (pagosGrupoItems || []).map((p: any) => p.pago_grupo_id).filter(Boolean)
  const { data: pagosGrupos } = pagosGrupoIds.length
    ? await db
        .from("pagos_grupos")
        .select("id, metodo_pago, fecha_pago")
        .in("id", pagosGrupoIds)
        .eq("usuario_id", tenantId)
    : { data: [] }

  const pagosGrupoMap = new Map<string, any>((pagosGrupos || []).map((p: any) => [p.id, p]))

  const pagosPorTurno = new Map<string, any>()
  ;(pagos || []).forEach((p: any) => pagosPorTurno.set(p.turno_id, { ...p, es_grupal: false }))
  ;(pagosGrupoItems || []).forEach((item: any) => {
    const grupo = pagosGrupoMap.get(item.pago_grupo_id) as any
    pagosPorTurno.set(item.turno_id, {
      id: item.id,
      turno_id: item.turno_id,
      monto: item.monto,
      metodo_pago: grupo?.metodo_pago,
      fecha_pago: grupo?.fecha_pago,
      es_grupal: true,
    })
  })
  const turnoIds = turnos?.map((t: any) => t.id) || []
  let declaracionesData: any[] = []
  if (turnoIds.length) {
    const { data, error: declaracionesError } = await db
      .from("declaraciones_juradas_respuestas")
      .select(
        "id, turno_id, estado, submitted_at, firma_data_url, respuestas, pdf_filename, created_at, plantilla:plantilla_id(id, nombre, campos)",
      )
      .in("turno_id", turnoIds)
      .eq("usuario_id", tenantId)
      .order("created_at", { ascending: false })

    if (declaracionesError && !isMissingTableError(declaracionesError, "declaraciones_juradas_respuestas")) {
      return NextResponse.json({ error: declaracionesError.message }, { status: 500 })
    }
    declaracionesData = Array.isArray(data) ? data : []
  }

  const declaracionPorTurno = new Map<string, any>()
  declaracionesData.forEach((item: any) => {
    const key = String(item?.turno_id || "")
    if (!key || declaracionPorTurno.has(key)) return
    declaracionPorTurno.set(key, {
      id: item.id,
      estado: item.estado || "pendiente",
      submitted_at: item.submitted_at || null,
      firma_data_url: item.firma_data_url || null,
      respuestas: item.respuestas || {},
      pdf_disponible: Boolean(item.pdf_filename),
      pdf_filename: item.pdf_filename || null,
      plantilla: item.plantilla
        ? {
            id: item.plantilla.id,
            nombre: item.plantilla.nombre,
            campos: normalizeDeclaracionCampos(item.plantilla.campos),
          }
        : null,
    })
  })

  const historialEnriquecido =
    turnos?.map((t: any) => ({
      ...stripTurnoPhoto(t),
      pago: pagosPorTurno.get(t.id) || null,
      declaracion_jurada: declaracionPorTurno.get(t.id) || null,
    })) || []

  // Obtener productos vendidos a la clienta
  const { data: ventasMov, error: ventasMovError } = await db
    .from("producto_movimientos")
    .select("id, producto_id, cantidad, precio_unitario, metodo_pago, nota, created_at, empleada_id, productos:producto_id(nombre)")
    .eq("usuario_id", tenantId)
    .eq("cliente_id", id)
    .eq("tipo", "venta")
    .order("created_at", { ascending: false })

  if (ventasMovError) return NextResponse.json({ error: ventasMovError.message }, { status: 500 })
  const ventasProductosList = ventasMov ?? []

  const buildFacturasQuery = () =>
    db
      .from("facturas")
      .select("id, tipo, estado, numero, punto_venta, cae, cae_vto, fecha, total, created_at, cliente_id")
      .eq("usuario_id", tenantId)
      .eq("cliente_id", id)

  let { data: facturas, error: facturasError } = await buildFacturasQuery().order("fecha", { ascending: false })
  if (facturasError && isMissingColumnError(facturasError, "fecha")) {
    ;({ data: facturas, error: facturasError } = await buildFacturasQuery().order("created_at", { ascending: false }))
  }
  if (facturasError && isMissingColumnError(facturasError, "created_at")) {
    ;({ data: facturas, error: facturasError } = await buildFacturasQuery())
  }
  if (facturasError && !isFacturasTableMissingError(facturasError)) {
    return NextResponse.json({ error: facturasError.message }, { status: 500 })
  }

  const facturasEmitidas = (Array.isArray(facturas) ? facturas : []).filter((row: any) => row?.tipo !== "nota_credito")

  const totalPagos = pagos?.reduce((sum: number, p: any) => sum + Number(p.monto || 0), 0) || 0
  const totalPagosGrupo = pagosGrupoItems?.reduce((sum: number, p: any) => sum + Number(p.monto || 0), 0) || 0
  const totalProductos = ventasProductosList.reduce(
    (sum: number, v: any) => sum + Number(v.cantidad || 0) * Number(v.precio_unitario || 0),
    0,
  )
  const totalGastado = totalPagos + totalPagosGrupo + totalProductos
  const visitasCompletadas = turnos?.filter((t: any) => t.estado === "completado").length || 0
  const asistencia =
    visitasCompletadas > 0
      ? (((turnos?.filter((t: any) => t.estado === "completado" && t.asistio).length || 0) / visitasCompletadas) * 100).toFixed(2)
      : "0"

  return NextResponse.json({
    cliente,
    estadisticas: {
      total_turnos: turnos?.length || 0,
      visitas_completadas: visitasCompletadas,
      asistencia_porcentaje: Number.parseFloat(asistencia as string),
      total_gastado: totalGastado,
    },
    historial: historialEnriquecido,
    productos: ventasProductosList,
    facturas: facturasEmitidas,
  })
}
