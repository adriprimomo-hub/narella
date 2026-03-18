import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { getEmpleadaIdForUser, getUserRole } from "@/lib/permissions"
import { isStaffRole } from "@/lib/roles"
import { selectTenantConfiguracionRow } from "@/lib/tenant-configuracion"
import { buildStaffTurnosOfrecidos, getTodayRangeInTimeZone } from "@/lib/turnos/staff-agenda"
import { NextResponse } from "next/server"

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

const stripComision = (servicio: any) => {
  if (!servicio) return servicio
  const { empleadas_comision: _omit, ...rest } = servicio
  return { ...rest, comision_pct: null, comision_monto_fijo: null }
}

const sanitizeStaffTurno = (turno: any) =>
  stripTurnoPhoto({
    ...turno,
    clientes: null,
    empleadas: null,
    empleada_final: null,
    declaracion_jurada_plantilla: null,
    declaracion_jurada_respuesta: null,
    servicios: stripComision(turno.servicios),
    servicio_final: stripComision(turno.servicio_final),
  })

export async function GET() {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isStaffRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tenantId = getTenantId(user)
  const empleadaIdStaff = await getEmpleadaIdForUser(db, user.id)
  if (!empleadaIdStaff) {
    return NextResponse.json({ turnos: [], sugerencias: [] })
  }

  const todayRange = getTodayRangeInTimeZone()

  const { data: turnosData, error: turnosError } = await db
    .from("turnos")
    .select(`
      id,
      servicio_id,
      servicio_final_id,
      empleada_id,
      empleada_final_id,
      fecha_inicio,
      fecha_fin,
      duracion_minutos,
      estado,
      confirmacion_estado,
      servicios_agregados,
      productos_agregados,
      foto_trabajo_base64,
      foto_trabajo_storage_path,
      servicios:servicio_id (*),
      servicio_final:servicio_final_id (*),
    `)
    .eq("usuario_id", tenantId)
    .gte("fecha_inicio", todayRange.start.toISOString())
    .lt("fecha_inicio", todayRange.end.toISOString())
    .order("fecha_inicio", { ascending: true })

  if (turnosError) return NextResponse.json({ error: turnosError.message }, { status: 500 })

  const turnosVisibles = (turnosData || []).filter((turno: any) => {
    const isAssigned = turno.empleada_id === empleadaIdStaff || turno.empleada_final_id === empleadaIdStaff
    const isVisible = turno.estado !== "cancelado" && turno.confirmacion_estado !== "cancelado"
    return isAssigned && isVisible
  })

  const { data: staff } = await db
    .from("empleadas")
    .select("id, horarios, activo")
    .eq("id", empleadaIdStaff)
    .eq("usuario_id", tenantId)
    .maybeSingle()

  const { data: configLocal } = await selectTenantConfiguracionRow(
    db,
    tenantId,
    "id, usuario_id, horario_local, updated_at, created_at",
  )

  const sugerencias =
    staff?.activo === false
      ? []
      : buildStaffTurnosOfrecidos({
          turnos: turnosVisibles.map((turno: any) => ({
            id: turno.id,
            fecha_inicio: turno.fecha_inicio,
            fecha_fin: turno.fecha_fin,
            duracion_minutos: turno.duracion_minutos,
            estado: turno.estado,
            confirmacion_estado: turno.confirmacion_estado,
          })),
          staffHorarios: Array.isArray((staff as any)?.horarios) ? (staff as any).horarios : [],
          localHorarios: Array.isArray((configLocal as any)?.horario_local) ? (configLocal as any).horario_local : [],
          staffId: empleadaIdStaff,
        })

  return NextResponse.json({
    turnos: turnosVisibles.map((turno: any) => sanitizeStaffTurno(turno)),
    sugerencias,
  })
}
