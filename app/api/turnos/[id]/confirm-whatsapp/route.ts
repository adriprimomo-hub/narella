import { resolveAppUrl } from "@/lib/url"
import { createClient } from "@/lib/localdb/server"
import { buildConfirmationTokenInsertPayload, isConfirmationTokenExpired } from "@/lib/confirmacion"
import { sanitizePhoneNumber } from "@/lib/whatsapp"
import { buildConfirmationMessage, type TurnoWhatsAppData } from "@/lib/twilio"
import { formatDate } from "@/lib/date-format"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const confirmWhatsAppSchema = z.object({
  turnoId: z.string().min(1).optional(),
})

type ConfirmWhatsAppRouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: ConfirmWhatsAppRouteContext) {
  try {
    const db = await createClient()
    const resolvedParams = await params

    const { data: payload, response: validationResponse } = await validateBody(request, confirmWhatsAppSchema, {
      allowEmpty: true,
    })
    if (validationResponse) return validationResponse
    const { turnoId } = payload
    const user = (await db.auth.getUser()).data.user

    if (!user) {
      return Response.json({ error: "No autorizado" }, { status: 401 })
    }
    // Obtener turno con cliente/servicio
    const { data: turno, error: turnoError } = await db
      .from("turnos")
      .select(
        "*, clientes:cliente_id(nombre, apellido, telefono), servicios:servicio_id(nombre, duracion_minutos, precio)",
      )
      .eq("id", turnoId || resolvedParams.id)
      .eq("usuario_id", user.id)
      .single()

    if (turnoError || !turno) {
      return Response.json({ error: "Turno no encontrado" }, { status: 404 })
    }

    if (turno.confirmacion_estado === "confirmado" || turno.confirmacion_estado === "cancelado") {
      return Response.json(
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
      const { data: createdToken, error: tokenError } = await db
        .from("confirmation_tokens")
        .insert(buildConfirmationTokenInsertPayload({ turnoId: turno.id, usuarioId: user.id }))
        .select("token, expires_at")
        .maybeSingle()
      if (tokenError || !createdToken?.token) {
        console.error("[confirm-whatsapp] No se pudo guardar token", tokenError)
        return Response.json({ error: "No se pudo generar el token de confirmación" }, { status: 500 })
      }
      token = createdToken.token
    }

    const fecha = new Date(turno.fecha_inicio)
    const fechaStr = formatDate(fecha)
    const horaStr = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })

    const confirmLink = `${resolveAppUrl({
      headers: request.headers,
      fallbackOrigin: new URL(request.url).origin,
    })}/confirmar/${token}`
    const clienteNombreCorto = turno.clientes?.nombre || ""
    const clienteApellido = turno.clientes?.apellido || ""
    const clienteNombre = `${clienteNombreCorto} ${clienteApellido}`.trim()
    const turnoData: TurnoWhatsAppData = {
      clienteNombre,
      clienteNombreCorto,
      clienteApellido,
      clienteTelefono: String(turno.clientes?.telefono || "").trim(),
      fecha: fechaStr,
      hora: horaStr,
      servicio: turno.servicios?.nombre || "",
      empleada: "",
      linkConfirmacion: confirmLink,
      duracion: String(turno.duracion_minutos || ""),
    }
    const mensaje = buildConfirmationMessage(turnoData)

    const clienteTelefono = sanitizePhoneNumber(turno.clientes?.telefono || "")
    if (!clienteTelefono || clienteTelefono.length < 8) {
      return Response.json({ error: "No se puede enviar: el cliente no tiene un telefono valido" }, { status: 400 })
    }

    // URL encode y crear link WhatsApp
    const textEncoded = encodeURIComponent(mensaje)
    const whatsappLink = `https://wa.me/${clienteTelefono}?text=${textEncoded}`

    // Actualizar estado de turno
    await db
      .from("turnos")
      .update({
        confirmacion_estado: "enviada",
        confirmacion_enviada_at: new Date().toISOString(),
      })
      .eq("id", turno.id)

    return Response.json({
      whatsappLink,
      mensaje,
    })
  } catch (error) {
    console.error("[v0] Error en confirm-whatsapp:", error)
    return Response.json({ error: "Error interno" }, { status: 500 })
  }
}

