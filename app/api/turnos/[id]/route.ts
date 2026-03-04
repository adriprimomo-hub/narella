import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole, getEmpleadaIdForUser } from "@/lib/permissions"
import { isAdminRole, isStaffRole } from "@/lib/roles"
import { Intervalo, isValidInterval, maxSimultaneous, overlaps } from "@/lib/turnos/overlap"
import {
  deleteStorageObject,
  isSupabaseStorageConfigured,
  parseDataUrl,
  uploadTurnoWorkPhotoToStorage,
} from "@/lib/supabase/storage"
import { isWithinPastSchedulingWindow, MAX_TURNO_PAST_SCHEDULE_HOURS } from "@/lib/turnos/scheduling"
import { resolveAppUrl } from "@/lib/url"
import { sanitizePhoneNumber } from "@/lib/whatsapp"
import { renderMessageTemplate, resolveTenantMensajeriaTemplates } from "@/lib/tenant-config"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

type Horario = { dia: number; desde: string; hasta: string }
type RecursoConflicto = {
  recurso_id: string
  recurso_nombre: string
  cantidad_disponible: number
  max_simultaneos: number
}

type TurnoFotoUpdateResult = {
  payload: Record<string, unknown>
  error: string | null
  status: number
}

const MAX_TURNO_WORK_PHOTO_BYTES = 5 * 1024 * 1024
const DEFAULT_DECLARACION_LINK_TTL_HOURS = 72

const normalizeFotoTrabajoInput = (value: unknown) => {
  if (value === undefined) {
    return { value: undefined as string | null | undefined, error: null as string | null }
  }
  if (value === null) {
    return { value: null, error: null as string | null }
  }
  if (typeof value !== "string") {
    return { value: undefined as string | null | undefined, error: "La foto del trabajo debe ser una imagen válida" }
  }
  const trimmed = value.trim()
  return { value: trimmed.length > 0 ? trimmed : null, error: null as string | null }
}

const validateFotoTrabajoData = (imageData: string) => {
  const parsed = parseDataUrl(imageData)
  if (!parsed) {
    return { error: "Formato de imagen inválido. Usa una foto JPG, PNG o WEBP.", status: 400 }
  }
  const mimeType = String(parsed.mimeType || "").toLowerCase()
  if (!mimeType.startsWith("image/")) {
    return { error: "El archivo seleccionado no es una imagen válida.", status: 400 }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(parsed.base64, "base64")
  } catch {
    return { error: "No se pudo procesar la imagen seleccionada.", status: 400 }
  }
  if (!buffer.length) {
    return { error: "La imagen seleccionada está vacía.", status: 400 }
  }
  if (buffer.length > MAX_TURNO_WORK_PHOTO_BYTES) {
    return { error: "La foto supera el tamaño máximo permitido (5 MB).", status: 400 }
  }
  return { error: null as string | null, status: 200 }
}

const isMissingTableError = (error: any, table: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(`public.${table}`.toLowerCase()) && message.includes("schema cache")
}

const isMissingColumnError = (error: any, column = "") => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const normalizedColumn = String(column || "").toLowerCase()
  if (code === "42703" || code === "PGRST204") {
    if (!normalizedColumn) return true
    return message.includes(normalizedColumn)
  }
  if (!normalizedColumn) {
    return message.includes("column") && message.includes("does not exist")
  }
  return message.includes("column") && message.includes(normalizedColumn)
}

const isLinkExpired = (value?: string | null) => {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  return date.getTime() <= Date.now()
}

const formatFechaHoraDeclaracion = (fechaIso?: string | null) => {
  const date = new Date(String(fechaIso || ""))
  if (!Number.isFinite(date.getTime())) {
    return { fecha: "", hora: "" }
  }
  return {
    fecha: date.toLocaleDateString("es-AR"),
    hora: date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
  }
}

const parseDeclaracionLinkTtlHours = () => {
  const raw = Number.parseInt(process.env.DECLARACION_JURADA_LINK_TTL_HOURS || "", 10)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DECLARACION_LINK_TTL_HOURS
  return Math.min(raw, 24 * 30)
}

const buildDeclaracionExpiry = () =>
  new Date(Date.now() + parseDeclaracionLinkTtlHours() * 60 * 60 * 1000).toISOString()

const ensureDeclaracionTurnoPayload = async (args: {
  db: any
  turno: any
  tenantId: string
  request: Request
}): Promise<Record<string, unknown> | null> => {
  const { db, turno, tenantId, request } = args
  const plantillaId = String(turno?.declaracion_jurada_plantilla_id || "").trim()
  if (!plantillaId) return null

  const { data: plantilla, error: plantillaError } = await db
    .from("declaraciones_juradas_plantillas")
    .select("id, nombre, activa")
    .eq("id", plantillaId)
    .eq("usuario_id", tenantId)
    .maybeSingle()
  if (plantillaError) {
    if (isMissingTableError(plantillaError, "declaraciones_juradas_plantillas")) return null
    throw new Error(plantillaError.message || "No se pudo validar la plantilla de declaración jurada")
  }
  if (!plantilla || plantilla.activa === false) return null

  const { data: existingRows, error: existingError } = await db
    .from("declaraciones_juradas_respuestas")
    .select("id, token, estado, link_expires_at")
    .eq("usuario_id", tenantId)
    .eq("turno_id", turno.id)
    .eq("plantilla_id", plantilla.id)
    .order("created_at", { ascending: false })
    .limit(1)
  if (existingError) {
    if (isMissingTableError(existingError, "declaraciones_juradas_respuestas")) return null
    throw new Error(existingError.message || "No se pudo buscar declaraciones juradas existentes")
  }

  const current = Array.isArray(existingRows) ? existingRows[0] : null
  let respuesta = current
  if (current?.estado === "pendiente" && isLinkExpired(current?.link_expires_at)) {
    await db
      .from("declaraciones_juradas_respuestas")
      .update({ estado: "expirada", updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .eq("estado", "pendiente")
    respuesta = null
  }

  if (!respuesta || respuesta.estado === "expirada" || respuesta.estado === "cancelada") {
    const nowIso = new Date().toISOString()
    const { data: created, error: createError } = await db
      .from("declaraciones_juradas_respuestas")
      .insert([
        {
          usuario_id: tenantId,
          plantilla_id: plantilla.id,
          turno_id: turno.id,
          cliente_id: turno.cliente_id || null,
          estado: "pendiente",
          link_expires_at: buildDeclaracionExpiry(),
          created_by: turno.actualizado_por || turno.creado_por || null,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ])
      .select("id, token, estado, link_expires_at")
      .single()

    if (createError) throw new Error(createError.message || "No se pudo crear la declaración jurada para el turno")
    respuesta = created
  }

  if (!respuesta) return null

  const { error: attachError } = await db
    .from("turnos")
    .update({
      declaracion_jurada_respuesta_id: respuesta.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", turno.id)
    .eq("usuario_id", tenantId)
  if (attachError && !isMissingColumnError(attachError)) {
    throw new Error(attachError.message || "No se pudo asociar la declaración jurada al turno")
  }

  const { data: cliente } = await db
    .from("clientes")
    .select("nombre, apellido, telefono")
    .eq("id", turno.cliente_id)
    .eq("usuario_id", tenantId)
    .maybeSingle()
  const { data: servicio } = await db
    .from("servicios")
    .select("nombre")
    .eq("id", turno.servicio_final_id || turno.servicio_id)
    .eq("usuario_id", tenantId)
    .maybeSingle()

  const requestUrl = new URL(request.url)
  const baseUrl = resolveAppUrl({ headers: request.headers, fallbackOrigin: requestUrl.origin })
  const link = `${baseUrl}/declaracion/${respuesta.token}`

  const clienteNombre = `${cliente?.nombre || ""} ${cliente?.apellido || ""}`.trim() || "Clienta"
  const servicioNombre = servicio?.nombre || "servicio"
  const telefonoRaw = String(cliente?.telefono || "").trim()
  const telefonoSanitizado = sanitizePhoneNumber(telefonoRaw)
  const { fecha, hora } = formatFechaHoraDeclaracion(turno.fecha_inicio)
  const templates = await resolveTenantMensajeriaTemplates(db, tenantId)
  const mensaje = renderMessageTemplate(templates.declaraciones_juradas, {
    clienta: clienteNombre,
    cliente: clienteNombre,
    cliente_nombre: cliente?.nombre || clienteNombre,
    servicio: servicioNombre,
    fecha,
    hora,
    link,
  })

  return {
    id: respuesta.id,
    estado: respuesta.estado,
    token: respuesta.token,
    link,
    plantilla_id: plantilla.id,
    plantilla_nombre: plantilla.nombre,
    cliente_telefono: telefonoRaw || null,
    whatsapp_url:
      telefonoSanitizado && telefonoSanitizado.length >= 8
        ? `https://wa.me/${telefonoSanitizado}?text=${encodeURIComponent(mensaje)}`
        : null,
    mensaje,
  }
}

const buildTurnoFotoUpdatePayload = async ({
  rawImage,
  currentTurno,
  userId,
  turnoId,
}: {
  rawImage: string | null | undefined
  currentTurno: any
  userId: string
  turnoId: string
}): Promise<TurnoFotoUpdateResult> => {
  if (rawImage === undefined) {
    return { payload: {}, error: null, status: 200 }
  }

  const clearPayload = {
    foto_trabajo_base64: null,
    foto_trabajo_storage_bucket: null,
    foto_trabajo_storage_path: null,
    foto_trabajo_mime_type: null,
  }

  if (rawImage === null) {
    if (currentTurno?.foto_trabajo_storage_bucket && currentTurno?.foto_trabajo_storage_path) {
      await deleteStorageObject({
        bucket: currentTurno.foto_trabajo_storage_bucket,
        path: currentTurno.foto_trabajo_storage_path,
      })
    }
    return { payload: clearPayload, error: null, status: 200 }
  }

  const validation = validateFotoTrabajoData(rawImage)
  if (validation.error) {
    return { payload: {}, error: validation.error, status: validation.status }
  }

  const parsed = parseDataUrl(rawImage)
  const mimeType = parsed?.mimeType || "image/jpeg"
  const fallbackPayload = {
    foto_trabajo_base64: rawImage,
    foto_trabajo_storage_bucket: null,
    foto_trabajo_storage_path: null,
    foto_trabajo_mime_type: mimeType,
  }

  if (!isSupabaseStorageConfigured()) {
    return { payload: fallbackPayload, error: null, status: 200 }
  }

  try {
    const uploaded = await uploadTurnoWorkPhotoToStorage({
      usuarioId: userId,
      turnoId,
      imageData: rawImage,
    })
    const currentBucket = String(currentTurno?.foto_trabajo_storage_bucket || "")
    const currentPath = String(currentTurno?.foto_trabajo_storage_path || "")
    if (currentBucket && currentPath && (currentBucket !== uploaded.bucket || currentPath !== uploaded.path)) {
      await deleteStorageObject({ bucket: currentBucket, path: currentPath })
    }
    return {
      payload: {
        foto_trabajo_base64: null,
        foto_trabajo_storage_bucket: uploaded.bucket,
        foto_trabajo_storage_path: uploaded.path,
        foto_trabajo_mime_type: uploaded.mimeType || mimeType,
      },
      error: null,
      status: 200,
    }
  } catch (error) {
    console.warn("[turnos] No se pudo subir foto del trabajo a Storage, se guarda base64", {
      turnoId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { payload: fallbackPayload, error: null, status: 200 }
  }
}

const turnoUpdateSchema = z
  .object({
    fecha_inicio: z.string().min(1).optional(),
    duracion_minutos: z.coerce.number().int().positive().optional(),
    empleada_id: z.string().min(1).optional(),
    empleada_final_id: z.string().min(1).optional(),
    servicio_id: z.string().min(1).optional(),
    servicio_final_id: z.string().min(1).optional(),
    declaracion_jurada_plantilla_id: z.string().optional().nullable(),
    estado: z.string().min(1).optional(),
    servicios_agregados: z.array(z.any()).optional(),
    productos_agregados: z.array(z.any()).optional(),
    skip_recursos_check: z.boolean().optional(),
  })
  .passthrough()

const calcularConflictosRecursos = async (
  db: any,
  userId: string,
  servicioId: string,
  intervaloNuevo: Intervalo,
  excluirIds: string[],
): Promise<RecursoConflicto[]> => {
  const { data: servicios } = await db.from("servicios").select("id, recurso_id").eq("usuario_id", userId)
  const serviciosMap = new Map<string, { recurso_id?: string | null }>(
    (servicios || []).map((srv: any) => [srv.id, { recurso_id: srv.recurso_id }]),
  )
  const recursoId = serviciosMap.get(servicioId)?.recurso_id || null
  if (!recursoId) return []

  const { data: recurso } = await db
    .from("recursos")
    .select("id, nombre, cantidad_disponible")
    .eq("id", recursoId)
    .eq("usuario_id", userId)
    .maybeSingle()

  if (!recurso) return []

  const { data: turnos } = await db
    .from("turnos")
    .select("id, servicio_id, servicio_final_id, fecha_inicio, fecha_fin, estado, confirmacion_estado")
    .eq("usuario_id", userId)
    .lt("fecha_inicio", new Date(intervaloNuevo.endMs).toISOString())
    .gt("fecha_fin", new Date(intervaloNuevo.startMs).toISOString())

  const intervalos = [intervaloNuevo]

  ;(turnos || [])
    .filter((t: any) => t.estado !== "cancelado" && t.confirmacion_estado !== "cancelado" && !excluirIds.includes(t.id))
    .forEach((turno: any) => {
      const srvId = turno.servicio_final_id || turno.servicio_id
      const recursoTurno = serviciosMap.get(srvId)?.recurso_id || null
      if (recursoTurno !== recursoId) return
      const startMs = new Date(turno.fecha_inicio).getTime()
      const endMs = new Date(turno.fecha_fin).getTime()
      const intervalo = { startMs, endMs }
      if (!isValidInterval(intervalo)) return
      if (!overlaps(intervalo, intervaloNuevo)) return
      intervalos.push(intervalo)
    })

  const maxSimultaneos = maxSimultaneous(intervalos)
  const capacidadRaw = Number(recurso.cantidad_disponible)
  const capacidad = Number.isFinite(capacidadRaw) ? capacidadRaw : 0

  if (maxSimultaneos > capacidad) {
    return [
      {
        recurso_id: recursoId,
        recurso_nombre: recurso.nombre,
        cantidad_disponible: capacidad,
        max_simultaneos: maxSimultaneos,
      },
    ]
  }

  return []
}

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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = getTenantId(user) || user.id
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && !isStaffRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: updates, response: validationResponse } = await validateBody(request, turnoUpdateSchema)
  if (validationResponse) return validationResponse
  const { data: currentTurno, error: currentError } = await db
    .from("turnos")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .single()

  if (currentError || !currentTurno) {
    return NextResponse.json({ error: currentError?.message || "Turno no encontrado" }, { status: 404 })
  }

  if (currentTurno.estado === "completado") {
    return NextResponse.json({ error: "No puedes modificar turnos cerrados" }, { status: 403 })
  }

  // Staff: restricted update path
  if (isStaffRole(role)) {
    const empleadaIdStaff = await getEmpleadaIdForUser(db, user.id)
    if (!empleadaIdStaff) return NextResponse.json({ error: "Staff sin empleada asignada" }, { status: 403 })

    if (currentTurno.estado !== "en_curso") {
      return NextResponse.json({ error: "Solo puedes modificar turnos en curso" }, { status: 403 })
    }

    const isAssigned = currentTurno.empleada_id === empleadaIdStaff || currentTurno.empleada_final_id === empleadaIdStaff
    if (!isAssigned) {
      return NextResponse.json({ error: "No tienes acceso a este turno" }, { status: 403 })
    }

    if (updates.servicio_final_id) {
      const { data: servicio, error: servicioError } = await db
        .from("servicios")
        .select("id, nombre, empleadas_habilitadas")
        .eq("id", updates.servicio_final_id)
        .eq("usuario_id", tenantId)
        .maybeSingle()

      if (servicioError || !servicio) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
      }

      if (!isEmpleadaHabilitada(servicio, empleadaIdStaff)) {
        return NextResponse.json(
          { error: `No estás habilitada para el servicio ${servicio.nombre}.` },
          { status: 409 },
        )
      }
    }

    const serviciosAgregadosNormalizados = Array.isArray(updates.servicios_agregados)
      ? updates.servicios_agregados
          .map((item: any) => {
            const servicioId = typeof item?.servicio_id === "string" ? item.servicio_id : ""
            if (!servicioId) return null
            const cantidadRaw = Number(item?.cantidad)
            const precioRaw = Number(item?.precio_unitario)
            return {
              servicio_id: servicioId,
              cantidad: Number.isFinite(cantidadRaw) && cantidadRaw > 0 ? cantidadRaw : 1,
              precio_unitario: Number.isFinite(precioRaw) && precioRaw >= 0 ? precioRaw : 0,
              origen_staff: true,
              agregado_por_user_id: user.id,
              agregado_por_empleada_id: empleadaIdStaff,
            }
          })
          .filter(Boolean)
      : []

    const productosAgregadosNormalizados = Array.isArray(updates.productos_agregados)
      ? updates.productos_agregados
          .map((item: any) => {
            const productoId = typeof item?.producto_id === "string" ? item.producto_id : ""
            if (!productoId) return null
            const cantidadRaw = Number(item?.cantidad)
            const precioRaw = Number(item?.precio_unitario)
            return {
              producto_id: productoId,
              cantidad: Number.isFinite(cantidadRaw) && cantidadRaw > 0 ? cantidadRaw : 1,
              precio_unitario: Number.isFinite(precioRaw) && precioRaw >= 0 ? precioRaw : 0,
              origen_staff: true,
              agregado_por_user_id: user.id,
              agregado_por_empleada_id: empleadaIdStaff,
            }
          })
          .filter(Boolean)
      : []

    const { value: fotoTrabajoInput, error: fotoTrabajoInputError } = normalizeFotoTrabajoInput(
      (updates as any).foto_trabajo_base64,
    )
    if (fotoTrabajoInputError) {
      return NextResponse.json({ error: fotoTrabajoInputError }, { status: 400 })
    }

    const fotoTrabajoUpdate = await buildTurnoFotoUpdatePayload({
      rawImage: fotoTrabajoInput,
      currentTurno,
      userId: user.id,
      turnoId: id,
    })
    if (fotoTrabajoUpdate.error) {
      return NextResponse.json({ error: fotoTrabajoUpdate.error }, { status: fotoTrabajoUpdate.status })
    }

    const staffPayload: Record<string, unknown> = {}
    if (updates.servicio_final_id !== undefined) staffPayload.servicio_final_id = updates.servicio_final_id
    if (updates.servicios_agregados !== undefined) staffPayload.servicios_agregados = serviciosAgregadosNormalizados
    if (updates.productos_agregados !== undefined) staffPayload.productos_agregados = productosAgregadosNormalizados
    Object.assign(staffPayload, fotoTrabajoUpdate.payload)
    if (updates.estado === "en_curso") {
      if (currentTurno.estado !== "pendiente") {
        return NextResponse.json({ error: "Solo puedes iniciar turnos pendientes" }, { status: 400 })
      }
      staffPayload.estado = "en_curso"
      if (!currentTurno.iniciado_en) {
        staffPayload.iniciado_en = new Date().toISOString()
        staffPayload.iniciado_por = user.id
      }
    }
    staffPayload.actualizado_por = user.id

    const allowedColumns = new Set(Object.keys(currentTurno || {}))
    allowedColumns.add("servicios_agregados")
    allowedColumns.add("productos_agregados")
    if (allowedColumns.has("updated_at")) staffPayload.updated_at = new Date()

    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(staffPayload)) {
      if (allowedColumns.has(key)) filtered[key] = value
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: "No hay cambios válidos" }, { status: 400 })
    }

    const { data, error } = await db
      .from("turnos")
      .update(filtered)
      .eq("id", id)
      .eq("usuario_id", tenantId)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const updatedTurno = data?.[0]
    let declaracionPayload: Record<string, unknown> | null = null
    const inicioTurno = updates.estado === "en_curso" && currentTurno.estado === "pendiente"
    if (inicioTurno && updatedTurno) {
      declaracionPayload = await ensureDeclaracionTurnoPayload({
        db,
        turno: updatedTurno,
        tenantId,
        request,
      })
    }
    return NextResponse.json({
      ...updatedTurno,
      declaracion_jurada: declaracionPayload,
    })
  }

  // Admin: full update path
  const updatedFechaInicio = updates.fecha_inicio || currentTurno.fecha_inicio
  const updatedDuracion = Number.parseInt(String(updates.duracion_minutos ?? currentTurno.duracion_minutos)) || currentTurno.duracion_minutos
  const updatedEmpleada = updates.empleada_id || currentTurno.empleada_id
  const updatedServicio = updates.servicio_id || currentTurno.servicio_id
  const skipRecursosCheck = updates.skip_recursos_check === true
  const fechaInicioDate = new Date(updatedFechaInicio)
  if (Number.isNaN(fechaInicioDate.getTime())) {
    return NextResponse.json({ error: "Fecha inicio inválida" }, { status: 400 })
  }
  const currentFechaInicioMs = new Date(currentTurno.fecha_inicio).getTime()
  const isReschedule =
    updates.fecha_inicio !== undefined &&
    (Number.isNaN(currentFechaInicioMs) || Math.abs(fechaInicioDate.getTime() - currentFechaInicioMs) > 60000)
  if (isReschedule && !isWithinPastSchedulingWindow(fechaInicioDate)) {
    return NextResponse.json(
      { error: `No se pueden agendar turnos con más de ${MAX_TURNO_PAST_SCHEDULE_HOURS} horas en el pasado.` },
      { status: 409 },
    )
  }
  if (!Number.isFinite(updatedDuracion) || updatedDuracion <= 0) {
    return NextResponse.json({ error: "Duración inválida" }, { status: 400 })
  }
  const fecha_fin = new Date(fechaInicioDate.getTime() + updatedDuracion * 60000).toISOString()

  const { data: staff, error: staffError } = await db
    .from("empleadas")
    .select("id, nombre, apellido, horarios, activo")
    .eq("id", updatedEmpleada)
    .eq("usuario_id", tenantId)
    .single()

  if (staffError || !staff) {
    return NextResponse.json({ error: "Trabajadora no encontrada" }, { status: 404 })
  }

  if (!staff.activo) {
    return NextResponse.json({ error: "La trabajadora está inactiva" }, { status: 409 })
  }

  if (!estaDentroDeHorario((staff as any).horarios || [], fechaInicioDate, updatedDuracion)) {
    return NextResponse.json({ error: "El turno esta fuera del horario laboral configurado" }, { status: 409 })
  }

  const { data: configLocal } = await db.from("configuracion").select("horario_local").eq("usuario_id", tenantId).maybeSingle()
  if (!estaDentroDeHorario((configLocal as any)?.horario_local || [], fechaInicioDate, updatedDuracion)) {
    return NextResponse.json({ error: "El turno esta fuera del horario del local" }, { status: 409 })
  }

  const { data: servicio, error: servicioError } = await db
    .from("servicios")
    .select("id, nombre, empleadas_habilitadas")
    .eq("id", updatedServicio)
    .eq("usuario_id", tenantId)
    .maybeSingle()

  if (servicioError || !servicio) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  if (!isEmpleadaHabilitada(servicio, updatedEmpleada)) {
    return NextResponse.json(
      { error: `La trabajadora no está habilitada para el servicio ${servicio.nombre}.` },
      { status: 409 },
    )
  }

  const { data: overlapping, error: overlapError } = await db
    .from("turnos")
    .select("id, estado, confirmacion_estado")
    .eq("usuario_id", tenantId)
    .eq("empleada_id", updatedEmpleada)
    .neq("id", id)
    .lt("fecha_inicio", fecha_fin)
    .gt("fecha_fin", fechaInicioDate.toISOString())

  if (overlapError) {
    return NextResponse.json({ error: overlapError.message }, { status: 500 })
  }

  const overlappingActivos =
    overlapping?.filter((turno: any) => turno.estado !== "cancelado" && turno.confirmacion_estado !== "cancelado") || []

  if (overlappingActivos.length > 0) {
    return NextResponse.json(
      { error: "Este turno se superpone con otro existente. Ajusta la fecha y hora antes de guardar." },
      { status: 409 },
    )
  }

  const declaracionPayload = (updates as any).declaracion_jurada_plantilla_id
  let declaracionPlantillaId = currentTurno.declaracion_jurada_plantilla_id || null
  if (declaracionPayload !== undefined) {
    const nextDeclaracionId = String(declaracionPayload || "").trim()
    if (!nextDeclaracionId) {
      declaracionPlantillaId = null
    } else {
      const { data: plantilla, error: plantillaError } = await db
        .from("declaraciones_juradas_plantillas")
        .select("id, activa")
        .eq("id", nextDeclaracionId)
        .eq("usuario_id", tenantId)
        .maybeSingle()

      if (plantillaError) {
        if (isMissingTableError(plantillaError, "declaraciones_juradas_plantillas")) {
          return NextResponse.json({ error: "Falta crear la tabla de declaraciones juradas." }, { status: 500 })
        }
        return NextResponse.json({ error: plantillaError.message }, { status: 500 })
      }
      if (!plantilla) {
        return NextResponse.json({ error: "La declaración jurada seleccionada no existe." }, { status: 404 })
      }
      if (plantilla.activa === false) {
        return NextResponse.json({ error: "La declaración jurada seleccionada está inactiva." }, { status: 409 })
      }
      declaracionPlantillaId = plantilla.id
    }

    const plantillaChanged = declaracionPlantillaId !== (currentTurno.declaracion_jurada_plantilla_id || null)
    updates.declaracion_jurada_plantilla_id = declaracionPlantillaId
    if (plantillaChanged) {
      updates.declaracion_jurada_respuesta_id = null
    }
  }

  if (!skipRecursosCheck) {
    const intervaloNuevo = { startMs: fechaInicioDate.getTime(), endMs: new Date(fecha_fin).getTime() }
    const conflictos = await calcularConflictosRecursos(db, tenantId, updatedServicio, intervaloNuevo, [id])
    if (conflictos.length > 0) {
      return NextResponse.json({ error: "Recursos insuficientes", conflictos }, { status: 409 })
    }
  }

  const currentFinalId = currentTurno.empleada_final_id || currentTurno.empleada_id
  const updatedFinalId = updates.empleada_final_id || currentTurno.empleada_final_id || updatedEmpleada
  const finalSnapshotMissing =
    currentTurno.empleada_final_nombre === undefined || currentTurno.empleada_final_apellido === undefined
  const finalSnapshotChanged = updatedFinalId !== currentFinalId

  if (updatedFinalId && (finalSnapshotMissing || finalSnapshotChanged)) {
    let finalStaff = staff
    if (updatedFinalId !== updatedEmpleada) {
      const { data: finalStaffData } = await db
        .from("empleadas")
        .select("id, nombre, apellido")
        .eq("id", updatedFinalId)
        .eq("usuario_id", tenantId)
        .single()
      if (finalStaffData) {
        finalStaff = finalStaffData
      }
    }

    if (finalStaff) {
      updates.empleada_final_nombre = finalStaff.nombre
      updates.empleada_final_apellido = finalStaff.apellido ?? null
    }
  }

  const { value: fotoTrabajoInputAdmin, error: fotoTrabajoInputErrorAdmin } = normalizeFotoTrabajoInput(
    (updates as any).foto_trabajo_base64,
  )
  if (fotoTrabajoInputErrorAdmin) {
    return NextResponse.json({ error: fotoTrabajoInputErrorAdmin }, { status: 400 })
  }
  if ((updates as any).foto_trabajo_base64 !== undefined) {
    const fotoTrabajoUpdate = await buildTurnoFotoUpdatePayload({
      rawImage: fotoTrabajoInputAdmin,
      currentTurno,
      userId: user.id,
      turnoId: id,
    })
    if (fotoTrabajoUpdate.error) {
      return NextResponse.json({ error: fotoTrabajoUpdate.error }, { status: fotoTrabajoUpdate.status })
    }
    Object.assign(updates, fotoTrabajoUpdate.payload)
  }

  updates.fecha_inicio = fechaInicioDate.toISOString()
  updates.duracion_minutos = updatedDuracion
  const estadoNuevo = updates.estado || currentTurno.estado
  if (estadoNuevo === "en_curso" && !currentTurno.iniciado_en) {
    updates.iniciado_en = new Date().toISOString()
    updates.iniciado_por = user.id
  }
  if (estadoNuevo === "completado" && !currentTurno.finalizado_en) {
    updates.finalizado_en = new Date().toISOString()
    updates.cerrado_por = user.id
  }

  updates.empleada_id = updatedEmpleada
  updates.servicio_id = updatedServicio
  if (updates.servicio_final_id === undefined && updatedServicio) {
    updates.servicio_final_id = updatedServicio
  }
  updates.fecha_fin = fecha_fin
  updates.actualizado_por = user.id

  // Avoid updates to columns that might not exist in the local schema.
  const allowedColumns = new Set(Object.keys(currentTurno || {}))
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && allowedColumns.has(key)) {
      payload[key] = value
    }
  }
  if (allowedColumns.has("updated_at")) {
    payload.updated_at = new Date()
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No hay cambios válidos" }, { status: 400 })
  }

  const { data, error } = await db
    .from("turnos")
    .update(payload)
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const updatedTurno = data?.[0]
  let declaracionPayloadResponse: Record<string, unknown> | null = null
  const estadoPrevio = String(currentTurno.estado || "")
  const estadoActual = String((updates as any).estado || currentTurno.estado || "")
  const inicioTurno = estadoPrevio !== "en_curso" && estadoActual === "en_curso"
  if (inicioTurno && updatedTurno) {
    declaracionPayloadResponse = await ensureDeclaracionTurnoPayload({
      db,
      turno: updatedTurno,
      tenantId,
      request,
    })
  }
  return NextResponse.json({
    ...updatedTurno,
    declaracion_jurada: declaracionPayloadResponse,
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (isStaffRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tenantId = getTenantId(user) || user.id
  const { error } = await db.from("turnos").delete().eq("id", id).eq("usuario_id", tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
