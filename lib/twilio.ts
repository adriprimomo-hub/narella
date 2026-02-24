import twilio from "twilio"

/**
 * Servicio de integración con Twilio para envío de WhatsApp
 *
 * Variables de entorno requeridas:
 * - TWILIO_ACCOUNT_SID: Account SID de Twilio
 * - TWILIO_AUTH_TOKEN: Auth Token de Twilio
 * - TWILIO_WHATSAPP_FROM: Número de WhatsApp de Twilio (formato: whatsapp:+1234567890)
 *
 * Variables de entorno opcionales:
 * - TWILIO_WHATSAPP_DEFAULT_COUNTRY_CODE: Prefijo de país para números sin + (default: 54)
 * - TWILIO_WHATSAPP_TEMPLATE_CONFIRMATION: Plantilla para confirmaciones
 * - TWILIO_WHATSAPP_TEMPLATE_REMINDER: Plantilla para recordatorios
 *
 * Placeholders disponibles en plantillas:
 * {cliente} {cliente_nombre} {cliente_apellido} {fecha} {hora} {servicio} {empleada} {duracion} {link}
 *
 * Para obtener estas credenciales:
 * 1. Crear cuenta en https://www.twilio.com
 * 2. Ir a Console > Account > API keys & tokens
 * 3. Para WhatsApp: Console > Messaging > Try it out > Send a WhatsApp message
 */

export interface TwilioConfig {
  accountSid: string
  authToken: string
  whatsappFrom: string
}

export interface WhatsAppMessage {
  to: string // Número del destinatario (con código de país, ej: +5491155551234)
  body: string // Contenido del mensaje
}

export interface TurnoWhatsAppData {
  clienteNombre: string
  clienteNombreCorto?: string
  clienteApellido?: string
  clienteTelefono: string
  fecha: string // Formato: "Lunes 15 de enero de 2024"
  hora: string // Formato: "14:30"
  servicio: string
  empleada: string
  linkConfirmacion: string // URL completa con token
  duracion?: string
}

export interface TwilioResponse {
  success: boolean
  messageId?: string
  error?: string
}

const DEFAULT_CONFIRMATION_TEMPLATE = `Hola {cliente}!

Te recordamos tu turno:

📅 Fecha: {fecha}
🕐 Hora: {hora}
💇 Servicio: {servicio}
👩 Atendida por: {empleada}

Por favor, confirmá tu asistencia en el siguiente enlace:
{link}

¡Te esperamos!`

const DEFAULT_REMINDER_TEMPLATE = `Hola {cliente}!

Te recordamos que mañana tenés turno:

📅 Fecha: {fecha}
🕐 Hora: {hora}
💇 Servicio: {servicio}
👩 Atendida por: {empleada}

Si necesitás cancelar o reprogramar, hacelo desde acá:
{link}

¡Te esperamos!`

const normalizeTemplate = (raw: string | undefined, fallback: string) => {
  if (!raw || raw.trim().length === 0) return fallback
  return raw.replace(/\\n/g, "\n")
}

const getTemplate = (type: "confirmation" | "reminder") => {
  const envKey =
    type === "confirmation"
      ? "TWILIO_WHATSAPP_TEMPLATE_CONFIRMATION"
      : "TWILIO_WHATSAPP_TEMPLATE_REMINDER"
  const fallback = type === "confirmation" ? DEFAULT_CONFIRMATION_TEMPLATE : DEFAULT_REMINDER_TEMPLATE
  return normalizeTemplate(process.env[envKey], fallback)
}

const buildTemplateVars = (data: TurnoWhatsAppData) => {
  const cliente = (data.clienteNombre || "").trim()
  const clienteNombre = (data.clienteNombreCorto || "").trim() || cliente
  const clienteApellido = (data.clienteApellido || "").trim()

  return {
    cliente,
    cliente_nombre: clienteNombre,
    cliente_apellido: clienteApellido,
    fecha: data.fecha || "",
    hora: data.hora || "",
    servicio: data.servicio || "",
    empleada: data.empleada || "",
    duracion: data.duracion || "",
    link: data.linkConfirmacion || "",
  }
}

const renderTemplate = (template: string, vars: Record<string, string>) => {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match))
}

const getDefaultCountryCode = () => {
  const raw = process.env.TWILIO_WHATSAPP_DEFAULT_COUNTRY_CODE
  const cleaned = raw ? raw.replace(/[^\d]/g, "") : ""
  return cleaned || "54"
}

/**
 * Obtiene la configuración de Twilio desde variables de entorno
 */
export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM?.trim()

  if (!accountSid || !authToken || !whatsappFrom) {
    return null
  }

  return { accountSid, authToken, whatsappFrom }
}

/**
 * Verifica si Twilio está configurado correctamente
 */
export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null
}

/**
 * Sanitiza un número de teléfono para WhatsApp
 * Elimina caracteres no numéricos y agrega el prefijo whatsapp:
 */
export function formatWhatsAppNumber(phone: string): string {
  // Eliminar todo excepto números y el signo +
  let cleaned = phone.replace(/[^\d+]/g, "")
  const defaultCountryCode = getDefaultCountryCode()
  const isArgentina = defaultCountryCode === "54"

  // Si no empieza con +, asumir Argentina (+54)
  if (!cleaned.startsWith("+")) {
    if (defaultCountryCode && cleaned.startsWith(defaultCountryCode)) {
      cleaned = `+${cleaned}`
    } else {
      // Ajustes locales para Argentina
      if (isArgentina) {
        if (cleaned.startsWith("0")) {
          cleaned = cleaned.substring(1)
        }
        if (cleaned.startsWith("15")) {
          cleaned = "9" + cleaned.substring(2)
        }
      }
      cleaned = `+${defaultCountryCode}${cleaned}`
    }
  }

  return `whatsapp:${cleaned}`
}

/**
 * Construye el mensaje de confirmación de turno
 */
export function buildConfirmationMessage(data: TurnoWhatsAppData): string {
  const template = getTemplate("confirmation")
  return renderTemplate(template, buildTemplateVars(data))
}

/**
 * Construye el mensaje de recordatorio (24hs antes)
 */
export function buildReminderMessage(data: TurnoWhatsAppData): string {
  const template = getTemplate("reminder")
  return renderTemplate(template, buildTemplateVars(data))
}

/**
 * Envía un mensaje de WhatsApp usando la API de Twilio
 *
 * NOTA: Esta función requiere que Twilio esté configurado.
 * Si no hay configuración, retorna un error.
 */
export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<TwilioResponse> {
  const config = getTwilioConfig()

  if (!config) {
    console.warn("[Twilio] No configurado - mensaje no enviado:", message.to)
    return {
      success: false,
      error: "Twilio no está configurado. Configure las variables de entorno TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM",
    }
  }

  try {
    const client = twilio(config.accountSid, config.authToken)
    const data = await client.messages.create({
      from: config.whatsappFrom,
      to: formatWhatsAppNumber(message.to),
      body: message.body,
    })

    return {
      success: true,
      messageId: data.sid,
    }
  } catch (error) {
    console.error("[Twilio] Error enviando mensaje:", error)
    const messageError =
      error && typeof error === "object" && "message" in error ? String((error as any).message) : undefined
    return {
      success: false,
      error: messageError || "Error al enviar mensaje",
    }
  }
}

/**
 * Envía un mensaje de confirmación de turno por WhatsApp
 */
export async function sendTurnoConfirmation(data: TurnoWhatsAppData): Promise<TwilioResponse> {
  const message = buildConfirmationMessage(data)
  return sendWhatsAppMessage({
    to: data.clienteTelefono,
    body: message,
  })
}

/**
 * Envía un recordatorio de turno por WhatsApp (24hs antes)
 */
export async function sendTurnoReminder(data: TurnoWhatsAppData): Promise<TwilioResponse> {
  const message = buildReminderMessage(data)
  return sendWhatsAppMessage({
    to: data.clienteTelefono,
    body: message,
  })
}
