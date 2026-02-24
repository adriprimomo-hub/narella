import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

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

  // Obtener info cliente
  const { data: cliente } = await db.from("clientes").select("*").eq("id", id).eq("usuario_id", user.id).single()

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
    .eq("usuario_id", user.id)
    .order("fecha_inicio", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Obtener pagos
  const { data: pagos } = await db
    .from("pagos")
    .select("id, turno_id, monto, metodo_pago, fecha_pago, sena_aplicada_id, monto_sena_aplicada")
    .in("turno_id", turnos?.map((t: any) => t.id) || [])
    .eq("usuario_id", user.id)

  // Pagos grupales (detalle por turno)
  const { data: pagosGrupoItems } = await db
    .from("pago_grupo_items")
    .select("id, turno_id, monto, pago_grupo_id")
    .in("turno_id", turnos?.map((t: any) => t.id) || [])
    .eq("usuario_id", user.id)

  const pagosGrupoIds = (pagosGrupoItems || []).map((p: any) => p.pago_grupo_id).filter(Boolean)
  const { data: pagosGrupos } = pagosGrupoIds.length
    ? await db
        .from("pagos_grupos")
        .select("id, metodo_pago, fecha_pago")
        .in("id", pagosGrupoIds)
        .eq("usuario_id", user.id)
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
  const historialEnriquecido =
    turnos?.map((t: any) => ({
      ...stripTurnoPhoto(t),
      pago: pagosPorTurno.get(t.id) || null,
    })) || []

  // Obtener productos vendidos a la clienta
  const { data: ventasMov, error: ventasMovError } = await db
    .from("producto_movimientos")
    .select("id, producto_id, cantidad, precio_unitario, metodo_pago, nota, created_at, empleada_id, productos:producto_id(nombre)")
    .eq("usuario_id", user.id)
    .eq("cliente_id", id)
    .eq("tipo", "venta")
    .order("created_at", { ascending: false })

  if (ventasMovError) return NextResponse.json({ error: ventasMovError.message }, { status: 500 })
  const ventasProductosList = ventasMov ?? []

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
  })
}
