import { localAdmin } from "@/lib/localdb/admin"
import { buildConfirmationTokenInsertPayload, isConfirmationTokenExpired } from "@/lib/confirmacion"
import { resolveAppUrl } from "@/lib/url"
import { sanitizePhoneNumber } from "@/lib/whatsapp"
import {
  buildConfirmationMessage,
  isTwilioConfigured,
  sendTurnoConfirmation,
  sendWhatsAppMessage,
  type TurnoWhatsAppData,
} from "@/lib/twilio"
import { NextResponse, type NextRequest } from "next/server"

const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires"

type DateParts = { year: number; month: number; day: number }

const getDatePartsInTimeZone = (date: Date, timeZone: string): DateParts => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

const addDays = (parts: DateParts, days: number): DateParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

type TimeParts = DateParts & { hour: number; minute: number; second: number }

const getTimePartsInTimeZone = (date: Date, timeZone: string): TimeParts => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = getTimePartsInTimeZone(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

const zonedTimeToUtc = (timeZone: string, parts: DateParts, hour = 0, minute = 0, second = 0) => {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second))
  const offset = getTimeZoneOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - offset)
}

const getTomorrowRange = (timeZone: string) => {
  const now = new Date()
  const today = getDatePartsInTimeZone(now, timeZone)
  const tomorrow = addDays(today, 1)
  const dayAfter = addDays(today, 2)
  const start = zonedTimeToUtc(timeZone, tomorrow, 0, 0, 0)
  const end = zonedTimeToUtc(timeZone, dayAfter, 0, 0, 0)
  return { start, end }
}

const formatDateInTimeZone = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)

const formatTimeInTimeZone = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)

const formatDateTimeInTimeZone = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)

type FailedSummary = {
  cliente?: string
  telefono?: string
  fecha?: string
  hora?: string
  servicio?: string
}

const sendCronNotification = async (params: {
  enviados?: number
  fallidos?: number
  total?: number
  error?: string
  targetDate?: Date
  failedDetails?: FailedSummary[]
}) => {
  const notifyTo = process.env.TWILIO_NOTIFY_TO?.trim()
  if (!notifyTo) return

  if (!isTwilioConfigured()) return

  const enviados = params.enviados ?? 0
  const fallidos = params.fallidos ?? 0
  const hasError = Boolean(params.error)
  const shouldNotify = hasError || enviados > 0 || fallidos > 0

  if (!shouldNotify) return

  const total = typeof params.total === "number" ? params.total : enviados + fallidos
  const lines: string[] = []

  if (hasError || (fallidos > 0 && enviados === 0)) {
    lines.push("Fallaron los envios de confirmaciones, debes hacerlo manualmente.")
  } else if (fallidos > 0) {
    lines.push("Algunos envios de confirmaciones fallaron:")
  } else {
    lines.push("Se enviaron exitosamente las confirmaciones.")
  }

  if (fallidos > 0) {
    const failed = Array.isArray(params.failedDetails) ? params.failedDetails.filter(Boolean) : []
    if (failed.length > 0) {
      lines.push("Detalle:")
      const maxItems = 5
      failed.slice(0, maxItems).forEach((item) => {
        const parts = [
          item.fecha && item.hora ? `${item.fecha} ${item.hora}` : null,
          item.cliente || null,
          item.servicio ? `(${item.servicio})` : null,
          item.telefono ? `Tel: ${item.telefono}` : null,
        ].filter(Boolean)
        if (parts.length > 0) {
          lines.push(`- ${parts.join(" - ")}`)
        }
      })
      if (failed.length > maxItems) {
        lines.push(`- y ${failed.length - maxItems} más.`)
      }
    }
  }

  lines.push(`Mañana hay ${total} turnos registrados.`)

  const message = lines.join("\n")
  const result = await sendWhatsAppMessage({ to: notifyTo, body: message })
  if (!result.success) {
    console.error("[confirmaciones-diarias] Error enviando notificación:", result.error)
  }
}

/**
 * Envía confirmaciones de turnos del día siguiente (una vez al día).
 * Usar con un cron job a las 19:00 hora local del negocio.
 */
const runDailyConfirmations = async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    if (!isTwilioConfigured()) {
      return NextResponse.json({ error: "Twilio no está configurado", configured: false }, { status: 503 })
    }

    const { start, end } = getTomorrowRange(DEFAULT_TIMEZONE)

    const { data: turnos, error } = await localAdmin
      .from("turnos")
      .select(
        `
        id,
        usuario_id,
        fecha_inicio,
        duracion_minutos,
        estado,
        confirmacion_estado,
        clientes:cliente_id (nombre, apellido, telefono),
        servicios:servicio_id (nombre),
        empleadas:empleada_final_id (nombre, apellido)
      `,
      )
      .eq("estado", "pendiente")
      .in("confirmacion_estado", ["no_enviada"])
      .gte("fecha_inicio", start.toISOString())
      .lt("fecha_inicio", end.toISOString())

    if (error) {
      console.error("[confirmaciones-diarias] Error buscando turnos:", error)
      await sendCronNotification({ error: error.message, targetDate: start })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!turnos || turnos.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay turnos para confirmar mañana",
        enviados: 0,
      })
    }

    const resultados: Array<{
      turnoId: string
      success: boolean
      error?: string
      cliente?: string
      telefono?: string
      fecha?: string
      hora?: string
      servicio?: string
      empleada?: string
      linkConfirmacion?: string
      whatsappUrl?: string
    }> = []

    for (const turno of turnos) {
      const cliente = turno.clientes as any
      const servicio = turno.servicios as any
      const empleada = turno.empleadas as any

      const clienteTelefonoRaw = String(cliente?.telefono || "").trim()
      const clienteTelefono = sanitizePhoneNumber(clienteTelefonoRaw)

      const clienteNombre = `${cliente?.nombre || ""} ${cliente?.apellido || ""}`.trim()
      const empleadaNombre = [empleada?.nombre, empleada?.apellido].filter(Boolean).join(" ")

      if (!clienteTelefono || clienteTelefono.length < 8) {
        resultados.push({
          turnoId: turno.id,
          success: false,
          error: "Teléfono inválido",
          cliente: clienteNombre,
          telefono: clienteTelefonoRaw,
        })
        continue
      }

      const { data: existingToken } = await localAdmin
        .from("confirmation_tokens")
        .select("token, expires_at")
        .eq("turno_id", turno.id)
        .eq("estado", "pendiente")
        .order("creado_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let token =
        existingToken?.token && !isConfirmationTokenExpired(existingToken?.expires_at || null)
          ? existingToken.token
          : null
      if (!token) {
        const { error: tokenError } = await localAdmin.from("confirmation_tokens").insert({
          ...buildConfirmationTokenInsertPayload({ turnoId: turno.id, usuarioId: turno.usuario_id }),
        })
        if (tokenError) {
          resultados.push({
            turnoId: turno.id,
            success: false,
            error: tokenError.message || "No se pudo generar token",
            cliente: clienteNombre,
            telefono: clienteTelefonoRaw,
          })
          continue
        }
        const { data: createdToken } = await localAdmin
          .from("confirmation_tokens")
          .select("token")
          .eq("turno_id", turno.id)
          .eq("estado", "pendiente")
          .order("creado_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        token = createdToken?.token || null
      }

      if (!token) {
        resultados.push({
          turnoId: turno.id,
          success: false,
          error: "No se pudo recuperar token de confirmación",
          cliente: clienteNombre,
          telefono: clienteTelefonoRaw,
        })
        continue
      }

      const fecha = new Date(turno.fecha_inicio)
      const fechaFormato = formatDateInTimeZone(fecha, DEFAULT_TIMEZONE)
      const horaFormato = formatTimeInTimeZone(fecha, DEFAULT_TIMEZONE)

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        resolveAppUrl({ headers: request.headers, fallbackOrigin: request.nextUrl.origin })
      const linkConfirmacion = `${baseUrl}/confirmar/${token}`

      const turnoData: TurnoWhatsAppData = {
        clienteNombre,
        clienteNombreCorto: cliente?.nombre || "",
        clienteApellido: cliente?.apellido || "",
        clienteTelefono: clienteTelefonoRaw,
        fecha: fechaFormato,
        hora: horaFormato,
        servicio: servicio?.nombre || "",
        empleada: empleadaNombre,
        linkConfirmacion,
        duracion: turno.duracion_minutos ? String(turno.duracion_minutos) : "",
      }

      const result = await sendTurnoConfirmation(turnoData)

      if (result.success) {
        const { error: updateError } = await localAdmin
          .from("turnos")
          .update({
            confirmacion_estado: "enviada",
            confirmacion_enviada_at: new Date().toISOString(),
          })
          .eq("id", turno.id)
        if (updateError) {
          resultados.push({
            turnoId: turno.id,
            success: false,
            error: updateError.message || "No se pudo actualizar el turno",
          })
          continue
        }

        resultados.push({
          turnoId: turno.id,
          success: true,
          cliente: clienteNombre,
          telefono: clienteTelefonoRaw,
          fecha: fechaFormato,
          hora: horaFormato,
          servicio: servicio?.nombre || "",
          empleada: empleadaNombre,
          linkConfirmacion,
        })
      } else {
        const mensaje = buildConfirmationMessage(turnoData)
        const whatsappUrl = `https://wa.me/${clienteTelefono}?text=${encodeURIComponent(mensaje)}`
        resultados.push({
          turnoId: turno.id,
          success: false,
          error: result.error,
          cliente: clienteNombre,
          telefono: clienteTelefonoRaw,
          fecha: fechaFormato,
          hora: horaFormato,
          servicio: servicio?.nombre || "",
          empleada: empleadaNombre,
          linkConfirmacion,
          whatsappUrl,
        })
      }
    }

    const enviados = resultados.filter((r) => r.success).length
    const fallidos = resultados.filter((r) => !r.success).length

    const failedDetails = resultados
      .filter((r) => !r.success)
      .map((r) => ({
        cliente: r.cliente,
        telefono: r.telefono,
        fecha: r.fecha,
        hora: r.hora,
        servicio: r.servicio,
      }))
    await sendCronNotification({
      enviados,
      fallidos,
      total: resultados.length,
      targetDate: start,
      failedDetails,
    })

    return NextResponse.json({
      success: true,
      message: `Confirmaciones enviadas: ${enviados}, fallidas: ${fallidos}`,
      enviados,
      fallidos,
      detalles: resultados,
    })
  } catch (error) {
    console.error("[confirmaciones-diarias] Error:", error)
    const message = error && typeof error === "object" && "message" in error ? String((error as any).message) : null
    if (message) {
      await sendCronNotification({ error: message })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return runDailyConfirmations(request)
}

// `GET /api/confirmaciones/diarias` se usa por Vercel Cron.
// `GET /api/confirmaciones/diarias?status=1` devuelve estado.
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("status") !== "1") {
    return runDailyConfirmations(request)
  }

  return NextResponse.json({
    service: "confirmaciones-diarias",
    timeZone: DEFAULT_TIMEZONE,
    description: "Envía confirmaciones de turnos del día siguiente via Twilio WhatsApp",
    usage: "GET/POST /api/confirmaciones/diarias (cron) | GET /api/confirmaciones/diarias?status=1 (estado)",
  })
}
