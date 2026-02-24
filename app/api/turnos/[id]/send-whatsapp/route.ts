import { resolveAppUrl } from "@/lib/url"
import { sanitizePhoneNumber } from "@/lib/whatsapp"
import { createClient } from "@/lib/localdb/server"
import { buildConfirmationTokenInsertPayload, isConfirmationTokenExpired } from "@/lib/confirmacion"
import {
  isTwilioConfigured,
  sendWhatsAppMessage,
  buildConfirmationMessage,
  type TurnoWhatsAppData,
} from "@/lib/twilio"
import { type NextRequest, NextResponse } from "next/server"
import { formatDate } from "@/lib/date-format"

type SendWhatsAppRouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: SendWhatsAppRouteContext) {
  try {
    const url = new URL(req.url)
    const resolvedParams = await params
    const segments = url.pathname.split("/").filter(Boolean)
    const idx = segments.indexOf("turnos")
    const idFromPath = idx >= 0 ? segments[idx + 1] : undefined
    const turnoId = resolvedParams?.id || idFromPath

    if (!turnoId) {
      return NextResponse.json({ error: "Falta id de turno" }, { status: 400 })
    }

    const db = await createClient()

    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    // Obtener turno con datos del cliente, servicio y empleada
    const { data: turno, error: turnoError } = await db
      .from("turnos")
      .select(`
        id,
        usuario_id,
        fecha_inicio,
        duracion_minutos,
        estado,
        confirmacion_estado,
        cliente_id,
        servicio_id,
        empleada_final_id,
        clientes (nombre, apellido, telefono),
        servicios:servicio_id (nombre),
        empleadas:empleada_final_id (nombre, apellido)
      `)
      .eq("id", turnoId)
      .eq("usuario_id", user.id)
      .single()

    if (turnoError || !turno) {
      return NextResponse.json({ error: turnoError?.message || "Turno no encontrado" }, { status: 404 })
    }

    if (turno.confirmacion_estado === "confirmado" || turno.confirmacion_estado === "cancelado") {
      return NextResponse.json(
        { error: "El turno ya fue respondido", estado: turno.confirmacion_estado },
        { status: 409 },
      )
    }

    const { data: existingToken } = await db
      .from("confirmation_tokens")
      .select("token, estado, expires_at")
      .eq("turno_id", turno.id)
      .eq("estado", "pendiente")
      .order("creado_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const canReuseExistingToken =
      Boolean(existingToken?.token) && !isConfirmationTokenExpired(existingToken?.expires_at || null)

    let token = canReuseExistingToken ? existingToken?.token : null
    if (!token) {
      const { data: tokenRow, error: tokenError } = await db
        .from("confirmation_tokens")
        .insert(buildConfirmationTokenInsertPayload({ turnoId: turno.id, usuarioId: user.id }))
        .select("token, expires_at")
        .maybeSingle()
      if (tokenError || !tokenRow?.token) {
        console.error("[send-whatsapp] No se pudo guardar token", tokenError)
        return NextResponse.json({ error: "No se pudo generar el token de confirmación" }, { status: 500 })
      }
      token = tokenRow.token
    }

    // Construir mensaje con variables
    const fecha = new Date(turno.fecha_inicio)
    const fechaFormato = formatDate(fecha)
    const horaFormato = fecha.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const confirmarUrl = `${resolveAppUrl({ headers: req.headers, fallbackOrigin: req.nextUrl.origin })}/confirmar/${token}`
    const clienteNombreCorto = (turno.clientes as any)?.nombre || ""
    const clienteApellido = (turno.clientes as any)?.apellido || ""
    const clienteNombre = `${clienteNombreCorto} ${clienteApellido}`.trim()
    const empleadaNombre = [
      (turno.empleadas as any)?.nombre,
      (turno.empleadas as any)?.apellido,
    ]
      .filter(Boolean)
      .join(" ")
    const clienteTelefonoRaw = String((turno.clientes as any)?.telefono || "").trim()
    const clienteTelefono = sanitizePhoneNumber(clienteTelefonoRaw)
    if (!clienteTelefono || clienteTelefono.length < 8) {
      return NextResponse.json({ error: "No se puede enviar: el cliente no tiene un telefono valido" }, { status: 400 })
    }

    // Actualizar estado del turno
    const nextConfirmState =
      turno.confirmacion_estado === "confirmado" || turno.confirmacion_estado === "cancelado"
        ? turno.confirmacion_estado
        : "enviada"

    await db
      .from("turnos")
      .update({
        confirmacion_estado: nextConfirmState,
        confirmacion_enviada_at: new Date().toISOString(),
      })
      .eq("id", turnoId)

    // Si Twilio está configurado, enviar por API directamente
    const turnoData: TurnoWhatsAppData = {
      clienteNombre,
      clienteNombreCorto,
      clienteApellido,
      clienteTelefono: clienteTelefonoRaw,
      fecha: fechaFormato,
      hora: horaFormato,
      servicio: turno.servicios?.nombre || "",
      empleada: empleadaNombre,
      linkConfirmacion: confirmarUrl,
      duracion: turno.duracion_minutos ? String(turno.duracion_minutos) : "",
    }
    const mensaje = buildConfirmationMessage(turnoData)

    if (isTwilioConfigured()) {
      const twilioResult = await sendWhatsAppMessage({
        to: clienteTelefonoRaw,
        body: mensaje,
      })

      if (twilioResult.success) {
        return NextResponse.json({
          success: true,
          method: "twilio",
          messageId: twilioResult.messageId,
          message: "Mensaje enviado por WhatsApp",
        })
      }
      // Si Twilio falla, continuar con fallback wa.me
      console.error("[send-whatsapp] Twilio error, usando fallback:", twilioResult.error)
    }

    // Fallback: generar URL de wa.me para envío manual
    const whatsappUrl = `https://wa.me/${clienteTelefono}?text=${encodeURIComponent(mensaje)}`

    return NextResponse.json({
      success: true,
      method: "manual",
      whatsappUrl,
      message: "Mensaje preparado para enviar",
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 })
  }
}

