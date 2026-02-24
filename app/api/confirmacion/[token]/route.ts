import { z } from "zod"
import { localAdmin } from "@/lib/localdb/admin"
import { extractConfirmationToken, isConfirmationTokenExpired } from "@/lib/confirmacion"
import { validateBody } from "@/lib/api/validation"
import { isTwilioConfigured, sendWhatsAppMessage } from "@/lib/twilio"

const confirmSchema = z.object({
  confirmado: z.boolean(),
})

const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires"
type ConfirmRouteContext = { params: Promise<{ token: string }> }

const formatDateTimeInTimeZone = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: DEFAULT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export async function GET(request: Request, { params }: ConfirmRouteContext) {
  try {
    const url = new URL(request.url)
    const resolvedParams = await params
    const { token, raw } = extractConfirmationToken(resolvedParams?.token, url)

    if (!token) {
      console.error("[confirmacion] Token faltante en GET", {
        pathname: url.pathname,
        search: url.search,
        rawToken: raw,
      })
      return Response.json({ error: "Token requerido" }, { status: 400 })
    }

    // Obtener token y turno con datos de cliente, servicio y empleada
    const { data: confirmation, error } = await localAdmin
      .from("confirmation_tokens")
      .select(
        "*, turnos:turno_id(*, clientes:cliente_id(nombre, apellido), servicios:servicio_id(nombre, duracion_minutos), empleadas:empleada_final_id(nombre, apellido))",
      )
      .eq("token", token)
      .maybeSingle()

    if (error) {
      console.error("[confirmacion] Error obteniendo token:", error)
      return Response.json({ error: "No se pudo validar el token" }, { status: 500 })
    }

    if (!confirmation) {
      console.error("[confirmacion] Token no encontrado", {
        tokenRaw: raw,
        tokenNormalized: token,
      })
      return Response.json({ error: "Token inválido o expirado" }, { status: 404 })
    }

    if (isConfirmationTokenExpired(confirmation.expires_at || null)) {
      return Response.json({ error: "Token expirado", estado: "expirado" }, { status: 410 })
    }

    const turno = confirmation.turnos
    const estado = confirmation.estado || "pendiente"
    return Response.json({
      turno: {
        id: turno.id,
        cliente: turno.clientes.nombre + " " + turno.clientes.apellido,
        servicio: turno.servicios.nombre,
        empleada: [turno.empleadas?.nombre, turno.empleadas?.apellido].filter(Boolean).join(" "),
        fecha: turno.fecha_inicio,
        duracion: turno.servicios.duracion_minutos,
        token,
        estado,
      },
    })
  } catch (error) {
    console.error("[v0] Error en GET confirmacion:", error)
    return Response.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: ConfirmRouteContext) {
  try {
    const url = new URL(request.url)
    const resolvedParams = await params
    const { token, raw } = extractConfirmationToken(resolvedParams?.token, url)

    if (!token) {
      console.error("[confirmacion] Token faltante en POST", {
        pathname: url.pathname,
        search: url.search,
        rawToken: raw,
      })
      return Response.json({ error: "Token requerido" }, { status: 400 })
    }

    const { data: payload, response: validationResponse } = await validateBody(request, confirmSchema)
    if (validationResponse) return validationResponse
    const { confirmado } = payload
    // Obtener confirmacion
    const { data: confirmation, error } = await localAdmin
      .from("confirmation_tokens")
      .select(
        "*, turnos:turno_id(id, fecha_inicio, estado, clientes:cliente_id(nombre, apellido), servicios:servicio_id(nombre), empleadas:empleada_final_id(nombre, apellido))",
      )
      .eq("token", token)
      .maybeSingle()

    if (error) {
      console.error("[confirmacion] Error leyendo token:", error)
      return Response.json({ error: "No se pudo validar el token" }, { status: 500 })
    }

    if (!confirmation) {
      console.error("[confirmacion] Token no encontrado en POST", {
        tokenRaw: raw,
        tokenNormalized: token,
      })
      return Response.json({ error: "Token inválido o expirado" }, { status: 404 })
    }

    if (isConfirmationTokenExpired(confirmation.expires_at || null)) {
      await localAdmin
        .from("confirmation_tokens")
        .update({
          estado: "expirado",
        })
        .eq("token", token)
        .eq("estado", "pendiente")

      return Response.json({ error: "Token expirado", estado: "expirado" }, { status: 410 })
    }

    const estadoActual = confirmation.estado || "pendiente"
    if (estadoActual !== "pendiente") {
      return Response.json(
        { error: "Este turno ya fue respondido", estado: estadoActual },
        { status: 409 },
      )
    }

    // Actualizar estado
    const nuevoEstado = confirmado ? "confirmado" : "cancelado"
    await localAdmin
      .from("confirmation_tokens")
      .update({
        estado: nuevoEstado,
        confirmado_at: new Date().toISOString(),
      })
      .eq("token", token)

    // Marcar cualquier otro token pendiente del mismo turno como resuelto
    await localAdmin
      .from("confirmation_tokens")
      .update({
        estado: nuevoEstado,
        confirmado_at: new Date().toISOString(),
      })
      .eq("turno_id", confirmation.turno_id)
      .eq("estado", "pendiente")

    const turno = (confirmation as any)?.turnos
    const turnoUpdates: Record<string, unknown> = {
      confirmacion_estado: nuevoEstado,
      confirmacion_confirmada_at: new Date().toISOString(),
    }
    if (!confirmado && (!turno?.estado || turno.estado === "pendiente")) {
      turnoUpdates.estado = "cancelado"
    }

    await localAdmin
      .from("turnos")
      .update(turnoUpdates)
      .eq("id", confirmation.turno_id)

    if (!confirmado) {
      const notifyTo = process.env.TWILIO_NOTIFY_TO?.trim()
      if (notifyTo && turno && isTwilioConfigured()) {
        const clienteNombre = `${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim()
        const servicioNombre = turno.servicios?.nombre || "servicio"
        const empleadaNombre = [turno.empleadas?.nombre, turno.empleadas?.apellido].filter(Boolean).join(" ") || "empleada"
        const fechaTurno = formatDateTimeInTimeZone(turno.fecha_inicio)
        const mensaje = `Atencion! ${clienteNombre} cancelo su turno del ${fechaTurno} para ${servicioNombre} con ${empleadaNombre}.`
        const result = await sendWhatsAppMessage({ to: notifyTo, body: mensaje })
        if (!result.success) {
          console.error("[confirmacion] Error enviando aviso de cancelacion:", result.error)
        }
      }
    }

    return Response.json({ success: true, estado: nuevoEstado })
  } catch (error) {
    console.error("[v0] Error en POST confirmacion:", error)
    return Response.json({ error: "Error interno" }, { status: 500 })
  }
}
