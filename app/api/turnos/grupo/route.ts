import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

type Horario = { dia: number; desde: string; hasta: string }

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

type GrupoItem = {
  servicio_id: string
  empleada_id: string
  duracion_minutos: number
  observaciones?: string | null
}

const grupoSchema = z.object({
  cliente_id: z.string().min(1),
  fecha_inicio: z.string().min(1),
  turnos: z
    .array(
      z.object({
        servicio_id: z.string().min(1),
        empleada_id: z.string().min(1),
        duracion_minutos: z.coerce.number().int().positive(),
        observaciones: z.string().optional().nullable(),
      }),
    )
    .min(2),
})

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = user.username || (user.user_metadata as any)?.username || user.id
  const tenantId = getTenantId(user) || user.id
  const { data: payload, response: validationResponse } = await validateBody(request, grupoSchema)
  if (validationResponse) return validationResponse
  const cliente_id: string = payload.cliente_id
  const fecha_inicio: string = payload.fecha_inicio
  const items: GrupoItem[] = payload.turnos

  const fechaInicioDate = new Date(fecha_inicio)
  if (Number.isNaN(fechaInicioDate.getTime())) {
    return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 })
  }
  if (items.length < 2) {
    return NextResponse.json({ error: "Se requieren al menos 2 servicios simultáneos" }, { status: 400 })
  }

  const empleadosSet = new Set<string>()
  for (const item of items) {
    if (!item?.servicio_id || !item?.empleada_id) {
      return NextResponse.json({ error: "Faltan datos de servicio o empleada en el grupo" }, { status: 400 })
    }
    if (empleadosSet.has(item.empleada_id)) {
      return NextResponse.json({ error: "Una empleada no puede estar asignada dos veces en el mismo grupo" }, { status: 409 })
    }
    empleadosSet.add(item.empleada_id)
    const duracion = Number.parseInt(String(item.duracion_minutos))
    if (!Number.isFinite(duracion) || duracion <= 0) {
      return NextResponse.json({ error: "Duración inválida en uno de los servicios" }, { status: 400 })
    }
  }

  const servicioIds = Array.from(new Set(items.map((item) => item.servicio_id).filter(Boolean)))
  const { data: servicios, error: serviciosError } = await db
    .from("servicios")
    .select("id, nombre, empleadas_habilitadas")
    .eq("usuario_id", user.id)
    .in("id", servicioIds)

  if (serviciosError) {
    return NextResponse.json({ error: serviciosError.message }, { status: 500 })
  }

  const serviciosMap = new Map<string, any>((servicios || []).map((srv: any) => [srv.id, srv]))

  const { data: configLocal } = await db.from("configuracion").select("horario_local").eq("usuario_id", tenantId).maybeSingle()

  for (const item of items) {
    const servicio = serviciosMap.get(item.servicio_id)
    if (!servicio) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }
    if (!isEmpleadaHabilitada(servicio, item.empleada_id)) {
      return NextResponse.json(
        { error: `La trabajadora no está habilitada para el servicio ${servicio.nombre}.` },
        { status: 409 },
      )
    }

    const duracion = Number.parseInt(String(item.duracion_minutos))
    const fecha_fin = new Date(fechaInicioDate.getTime() + duracion * 60000).toISOString()

    const { data: staff, error: staffError } = await db
      .from("empleadas")
      .select("id, horarios, activo")
      .eq("id", item.empleada_id)
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

    if (!estaDentroDeHorario((configLocal as any)?.horario_local || [], fechaInicioDate, duracion)) {
      return NextResponse.json({ error: "El turno esta fuera del horario del local" }, { status: 409 })
    }

    const { data: overlapping, error: overlapError } = await db
      .from("turnos")
      .select("id, fecha_inicio, fecha_fin, estado, confirmacion_estado")
      .eq("usuario_id", user.id)
      .eq("empleada_id", item.empleada_id)
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
  }

  const { data: grupo, error: grupoError } = await db
    .from("turno_grupos")
    .insert([
      {
        usuario_id: user.id,
        cliente_id,
        fecha_inicio,
      },
    ])
    .select()
    .single()

  if (grupoError || !grupo) {
    return NextResponse.json({ error: grupoError?.message || "No se pudo crear el grupo" }, { status: 500 })
  }

  const insertRows = items.map((item) => {
    const duracion = Number.parseInt(String(item.duracion_minutos))
    const fecha_fin = new Date(fechaInicioDate.getTime() + duracion * 60000).toISOString()
    return {
      usuario_id: user.id,
      creado_por_username: username,
      cliente_id,
      grupo_id: grupo.id,
      servicio_id: item.servicio_id,
      servicio_final_id: item.servicio_id,
      empleada_id: item.empleada_id,
      empleada_final_id: item.empleada_id,
      fecha_inicio,
      fecha_fin,
      duracion_minutos: duracion,
      estado: "pendiente",
      observaciones: item.observaciones ?? null,
      creado_por: user.id,
    }
  })

  const { data, error } = await db.from("turnos").insert(insertRows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grupo_id: grupo.id, turnos: data })
}
