import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole, isStaffRole } from "@/lib/roles"
import { getEmpleadaIdForUser } from "@/lib/permissions"
import { isWithinPastSchedulingWindow, MAX_TURNO_PAST_SCHEDULE_HOURS } from "@/lib/turnos/scheduling"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

type Horario = { dia: number; desde: string; hasta: string }

const createTurnoSchema = z.object({
  cliente_id: z.string().min(1),
  servicio_id: z.string().min(1),
  empleada_id: z.string().min(1),
  fecha_inicio: z.string().min(1),
  duracion_minutos: z.coerce.number().int().positive(),
  observaciones: z.string().optional().nullable(),
})

const estaDentroDeHorario = (horarios: Horario[] | null, inicio: Date, duracionMinutos: number) => {
  if (!Array.isArray(horarios) || horarios.length === 0) return true
  const dia = inicio.getDay()
  const slot = horarios.find((h) => h.dia === dia)
  if (!slot || !slot.desde || !slot.hasta) return false
  const [desdeH, desdeM] = slot.desde.split(":").map((v) => Number.parseInt(v, 10))
  const [hastaH, hastaM] = slot.hasta.split(":").map((v) => Number.parseInt(v, 10))
  const inicioMin = inicio.getHours() * 60 + inicio.getMinutes()
  const finTurno = inicioMin + duracionMinutos
  const inicioPermitido = desdeH * 60 + (desdeM || 0)
  const finPermitido = hastaH * 60 + (hastaM || 0)
  return inicioMin >= inicioPermitido && finTurno <= finPermitido
}

const isEmpleadaHabilitada = (servicio: any, empleadaId: string) => {
  const habilitadas = Array.isArray(servicio?.empleadas_habilitadas) ? servicio.empleadas_habilitadas : []
  if (!habilitadas.length) return true
  return habilitadas.includes(empleadaId)
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

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const url = new URL(request.url)
  const fechaInicio = url.searchParams.get("fecha_inicio")
  const fechaFin = url.searchParams.get("fecha_fin")
  const clienteId = url.searchParams.get("cliente_id")
  const empleadaId = url.searchParams.get("empleada_id")
  const estado = url.searchParams.get("estado")

  let query = db
    .from("turnos")
    .select(`
      *,
      clientes:cliente_id (nombre, apellido, telefono),
      servicios:servicio_id (*),
      servicio_final:servicio_final_id (*),
      empleadas:empleada_id (*),
      empleada_final:empleada_final_id (*)
    `)
    .eq("usuario_id", user.id)

  if (fechaInicio) query = query.gte("fecha_inicio", fechaInicio)
  if (fechaFin) query = query.lte("fecha_inicio", fechaFin)
  if (clienteId) query = query.eq("cliente_id", clienteId)
  if (empleadaId) query = query.eq("empleada_id", empleadaId)
  if (estado) query = query.eq("estado", estado)

  const { data, error } = await query.order("fecha_inicio", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Staff: solo turnos en curso asignados a su empleada
  if (isStaffRole(role)) {
    const empleadaIdStaff = await getEmpleadaIdForUser(db, user.id)
    const filteredData = (data || []).filter(
      (turno: any) =>
        turno.estado === "en_curso" &&
        (turno.empleada_id === empleadaIdStaff || turno.empleada_final_id === empleadaIdStaff),
    )
    const stripComision = (servicio: any) => {
      if (!servicio) return servicio
      const { empleadas_comision: _omit, ...rest } = servicio
      return { ...rest, comision_pct: null, comision_monto_fijo: null }
    }
    return NextResponse.json(
      filteredData.map((turno: any) =>
        stripTurnoPhoto({
          ...turno,
          servicios: stripComision(turno.servicios),
          servicio_final: stripComision(turno.servicio_final),
        }),
      ),
    )
  }

  if (isAdmin) return NextResponse.json((data || []).map((turno: any) => stripTurnoPhoto(turno)))

  const stripComision = (servicio: any) => {
    if (!servicio) return servicio
    const { empleadas_comision: _omit, ...rest } = servicio
    return { ...rest, comision_pct: null, comision_monto_fijo: null }
  }

  const sanitized =
    data?.map((turno: any) => ({
      ...stripTurnoPhoto(turno),
      servicios: stripComision(turno.servicios),
      servicio_final: stripComision(turno.servicio_final),
    })) || []

  return NextResponse.json(sanitized)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  if (isStaffRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tenantId = getTenantId(user) || user.id
  const { data: payload, response: validationResponse } = await validateBody(request, createTurnoSchema)
  if (validationResponse) return validationResponse
  const { cliente_id, servicio_id, empleada_id, fecha_inicio, duracion_minutos, observaciones } = payload

  const fechaInicioDate = new Date(fecha_inicio)
  const duracion = Number.parseInt(String(duracion_minutos), 10)
  if (Number.isNaN(fechaInicioDate.getTime()) || !empleada_id) {
    return NextResponse.json({ error: "Faltan datos del turno o de la trabajadora" }, { status: 400 })
  }
  if (!Number.isFinite(duracion) || duracion <= 0) {
    return NextResponse.json({ error: "Duración inválida" }, { status: 400 })
  }
  if (!isWithinPastSchedulingWindow(fechaInicioDate)) {
    return NextResponse.json(
      { error: `No se pueden agendar turnos con más de ${MAX_TURNO_PAST_SCHEDULE_HOURS} horas en el pasado.` },
      { status: 409 },
    )
  }
  const fecha_fin = new Date(fechaInicioDate.getTime() + duracion * 60000).toISOString()

  const { data: staff, error: staffError } = await db
    .from("empleadas")
    .select("id, nombre, apellido, horarios, activo")
    .eq("id", empleada_id)
    .eq("usuario_id", user.id)
    .single()

  if (staffError || !staff) {
    return NextResponse.json({ error: "Trabajadora no encontrada" }, { status: 404 })
  }

  if (!staff.activo) {
    return NextResponse.json({ error: "La trabajadora está inactiva" }, { status: 409 })
  }

  if (!estaDentroDeHorario((staff as any).horarios || [], fechaInicioDate, duracion)) {
    return NextResponse.json({ error: "El turno esta fuera del horario laboral configurado" }, { status: 409 })
  }

  const { data: configLocal } = await db.from("configuracion").select("horario_local").eq("usuario_id", tenantId).maybeSingle()
  if (!estaDentroDeHorario((configLocal as any)?.horario_local || [], fechaInicioDate, duracion)) {
    return NextResponse.json({ error: "El turno esta fuera del horario del local" }, { status: 409 })
  }

  const { data: servicio, error: servicioError } = await db
    .from("servicios")
    .select("id, nombre, empleadas_habilitadas")
    .eq("id", servicio_id)
    .eq("usuario_id", user.id)
    .maybeSingle()

  if (servicioError || !servicio) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  if (!isEmpleadaHabilitada(servicio, empleada_id)) {
    return NextResponse.json(
      { error: `La trabajadora no está habilitada para el servicio ${servicio.nombre}.` },
      { status: 409 },
    )
  }

  const { data: overlapping, error: overlapError } = await db
    .from("turnos")
    .select("id, fecha_inicio, fecha_fin, estado, confirmacion_estado")
    .eq("usuario_id", user.id)
    .eq("empleada_id", empleada_id)
    .lt("fecha_inicio", fecha_fin)
    .gt("fecha_fin", fechaInicioDate.toISOString())

  if (overlapError) {
    return NextResponse.json({ error: overlapError.message }, { status: 500 })
  }

  const overlappingActivos =
    overlapping?.filter((turno: any) => turno.estado !== "cancelado" && turno.confirmacion_estado !== "cancelado") || []

  if (overlappingActivos.length > 0) {
    return NextResponse.json(
      { error: "Ya existe un turno asignado en ese horario. Ajusta la fecha y hora para evitar superposiciones." },
      { status: 409 },
    )
  }

  const { data, error } = await db
    .from("turnos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        cliente_id,
        servicio_id,
        servicio_final_id: servicio_id,
        empleada_id,
        empleada_final_id: empleada_id,
        empleada_final_nombre: staff.nombre,
        empleada_final_apellido: staff.apellido ?? null,
        fecha_inicio,
        fecha_fin,
        duracion_minutos: duracion,
        estado: "pendiente",
        observaciones,
        creado_por: user.id,
      },
    ])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data[0])
}
