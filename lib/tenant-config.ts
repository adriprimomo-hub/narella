import { resolveFacturacionConfig, type FacturacionConfig } from "@/lib/facturacion"
import { selectTenantConfiguracionRow } from "@/lib/tenant-configuracion"

export type TenantMensajeriaTemplates = {
  confirmaciones: string
  facturas_giftcards: string
  liquidaciones: string
  servicios_vencidos: string
  declaraciones_juradas: string
}

const DEFAULT_CONFIRMACIONES_TEMPLATE = `Hola {cliente}!

Te recordamos tu turno:

Fecha: {fecha}
Hora: {hora}
Servicio: {servicio}
Staff: {empleada}

Confirma desde este enlace:
{link}`

const DEFAULT_FACTURAS_GIFTCARDS_TEMPLATE = "Hola {cliente}! Te compartimos tu comprobante: {link}"
const DEFAULT_LIQUIDACIONES_TEMPLATE = "Hola {empleada}! Te compartimos tu liquidacion: {link}"
const DEFAULT_SERVICIOS_VENCIDOS_TEMPLATE =
  "Hola {clienta}! Queriamos recordarte que hace {cantidad_dias} no te haces {servicio_vencido}. Estas interesada en volver a hacertelo?"
const DEFAULT_DECLARACIONES_JURADAS_TEMPLATE =
  "Hola {clienta}! Antes de tu turno necesitamos que completes la declaracion jurada: {link}"

const CONFIG_MENSAJERIA_SELECT = [
  "wa_template_confirmaciones",
  "wa_template_facturas_giftcards",
  "wa_template_liquidaciones",
  "wa_template_servicios_vencidos",
  "wa_template_declaraciones_juradas",
].join(", ")

const normalizeTemplate = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback
  const cleaned = value.trim()
  if (!cleaned) return fallback
  return cleaned.replace(/\\n/g, "\n")
}

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42703" || code === "PGRST204") return true
  return message.includes("column") && (message.includes("does not exist") || message.includes("schema cache"))
}

const isMissingTableError = (error: any, table: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(`public.${table}`.toLowerCase()) && message.includes("schema cache")
}

const getTenantConfigRow = async (db: any, tenantId: string) => {
  const full = await selectTenantConfiguracionRow(db, tenantId, CONFIG_MENSAJERIA_SELECT)
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full

  // Fallback universal para instalaciones antiguas con columnas personalizadas parciales.
  return selectTenantConfiguracionRow(db, tenantId, "*")
}

export const resolveTenantMensajeriaTemplates = async (
  db: any,
  tenantId: string,
): Promise<TenantMensajeriaTemplates> => {
  const { data, error } = await getTenantConfigRow(db, tenantId)
  if (error && !isMissingTableError(error, "configuracion")) {
    throw new Error(error.message || "No se pudo leer la configuracion de mensajeria")
  }

  return {
    confirmaciones: normalizeTemplate(
      data?.wa_template_confirmaciones,
      DEFAULT_CONFIRMACIONES_TEMPLATE,
    ),
    facturas_giftcards: normalizeTemplate(
      data?.wa_template_facturas_giftcards,
      DEFAULT_FACTURAS_GIFTCARDS_TEMPLATE,
    ),
    liquidaciones: normalizeTemplate(data?.wa_template_liquidaciones, DEFAULT_LIQUIDACIONES_TEMPLATE),
    servicios_vencidos: normalizeTemplate(
      data?.wa_template_servicios_vencidos,
      DEFAULT_SERVICIOS_VENCIDOS_TEMPLATE,
    ),
    declaraciones_juradas: normalizeTemplate(
      data?.wa_template_declaraciones_juradas,
      DEFAULT_DECLARACIONES_JURADAS_TEMPLATE,
    ),
  }
}

export const resolveTenantFacturacionConfig = async (
  _db: any,
  _tenantId: string,
): Promise<FacturacionConfig | null> => {
  return resolveFacturacionConfig()
}

type MessageVars = Record<string, string | number | null | undefined>

export const renderMessageTemplate = (template: string, vars: MessageVars) =>
  template.replace(/\{([^}]+)\}/g, (match, rawKey) => {
    const key = String(rawKey || "").trim()
    if (!key) return match
    if (!(key in vars)) return match
    const value = vars[key]
    if (value === null || value === undefined) return ""
    return String(value)
  })
