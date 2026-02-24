import { localAdmin } from "@/lib/localdb/admin"
import { buildConfirmationTokenInsertPayload, isConfirmationTokenExpired } from "@/lib/confirmacion"
import { resolveAppUrl } from "@/lib/url"
import { sanitizePhoneNumber } from "@/lib/whatsapp"
import {
  isTwilioConfigured,
  sendTurnoReminder,
  type TurnoWhatsAppData,
} from "@/lib/twilio"
import { NextResponse, type NextRequest } from "next/server"
import { formatDate } from "@/lib/date-format"

/**
 * Endpoint para enviar recordatorios automáticos 24hs antes
 *
 * Este endpoint debe ser llamado por un cron job externo (Vercel Cron, AWS Lambda, etc.)
 * Se recomienda ejecutarlo cada hora para capturar turnos en la ventana de 24hs
 *
 * Ejemplo cron: 0 * * * * (cada hora)
 *
 * El endpoint:
 * 1. Busca turnos para las próximas 24-25 horas
 * 2. Filtra los que NO tienen recordatorio_enviado_at (solo envía una vez)
 * 3. Envía el recordatorio por Twilio WhatsApp
 * 4. Marca el turno como recordatorio_enviado_at
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar API key para cron jobs (opcional pero recomendado)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET no configurado" },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    if (!isTwilioConfigured()) {
      return NextResponse.json(
        { error: "Twilio no está configurado", configured: false },
        { status: 503 }
      )
    }

    // Calcular ventana de tiempo: turnos entre 23 y 25 horas desde ahora
    const ahora = new Date()
    const desde = new Date(ahora.getTime() + 23 * 60 * 60 * 1000) // 23 horas
    const hasta = new Date(ahora.getTime() + 25 * 60 * 60 * 1000) // 25 horas

    // Buscar turnos pendientes en la ventana, sin recordatorio enviado
    const { data: turnos, error } = await localAdmin
      .from("turnos")
      .select(`
        id,
        usuario_id,
        fecha_inicio,
        duracion_minutos,
        confirmacion_estado,
        recordatorio_enviado_at,
        clientes:cliente_id (nombre, apellido, telefono),
        servicios:servicio_id (nombre),
        empleadas:empleada_final_id (nombre, apellido)
      `)
      .eq("estado", "pendiente")
      .neq("confirmacion_estado", "cancelado")
      .is("recordatorio_enviado_at", null)
      .gte("fecha_inicio", desde.toISOString())
      .lte("fecha_inicio", hasta.toISOString())

    if (error) {
      console.error("[recordatorios] Error buscando turnos:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!turnos || turnos.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay turnos para recordar en este momento",
        enviados: 0,
      })
    }

    const resultados: Array<{
      turnoId: string
      success: boolean
      error?: string
    }> = []

    for (const turno of turnos) {
      const cliente = turno.clientes as any
      const servicio = turno.servicios as any
      const empleada = turno.empleadas as any

      const clienteTelefonoRaw = String(cliente?.telefono || "").trim()
      const clienteTelefono = sanitizePhoneNumber(clienteTelefonoRaw)

      if (!clienteTelefono || clienteTelefono.length < 8) {
        resultados.push({
          turnoId: turno.id,
          success: false,
          error: "Teléfono inválido",
        })
        continue
      }

      // Generar o reutilizar token de confirmación
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
        })
        continue
      }

      const fecha = new Date(turno.fecha_inicio)
      const fechaFormato = formatDate(fecha)
      const horaFormato = fecha.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })

      // Construir URL de confirmación
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || resolveAppUrl({
        headers: request.headers,
        fallbackOrigin: request.nextUrl.origin,
      })
      const linkConfirmacion = `${baseUrl}/confirmar/${token}`

      const turnoData: TurnoWhatsAppData = {
        clienteNombre: `${cliente?.nombre || ""} ${cliente?.apellido || ""}`.trim(),
        clienteNombreCorto: cliente?.nombre || "",
        clienteApellido: cliente?.apellido || "",
        clienteTelefono: clienteTelefonoRaw,
        fecha: fechaFormato,
        hora: horaFormato,
        servicio: servicio?.nombre || "",
        empleada: [empleada?.nombre, empleada?.apellido].filter(Boolean).join(" "),
        linkConfirmacion,
        duracion: turno.duracion_minutos ? String(turno.duracion_minutos) : "",
      }

      const result = await sendTurnoReminder(turnoData)

      if (result.success) {
        // Marcar como recordatorio enviado
        const { error: updateError } = await localAdmin
          .from("turnos")
          .update({
            recordatorio_enviado_at: new Date().toISOString(),
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

        resultados.push({ turnoId: turno.id, success: true })
      } else {
        resultados.push({
          turnoId: turno.id,
          success: false,
          error: result.error,
        })
      }
    }

    const enviados = resultados.filter((r) => r.success).length
    const fallidos = resultados.filter((r) => !r.success).length

    return NextResponse.json({
      success: true,
      message: `Recordatorios enviados: ${enviados}, fallidos: ${fallidos}`,
      enviados,
      fallidos,
      detalles: resultados,
    })
  } catch (error) {
    console.error("[recordatorios] Error:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// GET para verificar estado del servicio
export async function GET() {
  return NextResponse.json({
    service: "recordatorios",
    twilioConfigured: isTwilioConfigured(),
    description: "Envía recordatorios automáticos 24hs antes del turno via Twilio WhatsApp",
    usage: "POST /api/recordatorios/enviar (llamar desde cron job)",
  })
}
