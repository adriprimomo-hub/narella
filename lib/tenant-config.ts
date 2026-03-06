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

const USER_FACTURACION_SELECT_FULL = [
  "facturacion_activa",
  "afip_cuit",
  "afip_punto_venta",
  "afip_cbte_tipo",
  "afip_produccion",
  "afip_iva_id",
  "afip_iva_porcentaje",
  "afip_access_token",
  "afip_cert",
  "afip_key",
  "factura_logo_url",
  "factura_leyenda",
  "factura_leyenda_footer",
  "factura_emisor_nombre",
  "factura_emisor_domicilio",
  "factura_emisor_telefono",
  "factura_emisor_email",
].join(", ")

const USER_FACTURACION_SELECT_FALLBACK = [
  "afip_cuit",
  "afip_punto_venta",
  "afip_cbte_tipo",
  "afip_produccion",
  "afip_iva_id",
  "afip_iva_porcentaje",
  "factura_logo_url",
  "factura_leyenda",
  "factura_leyenda_footer",
  "factura_emisor_nombre",
  "factura_emisor_domicilio",
  "factura_emisor_telefono",
  "factura_emisor_email",
].join(", ")

const CONFIG_MENSAJERIA_SELECT = [
  "wa_template_confirmaciones",
  "wa_template_facturas_giftcards",
  "wa_template_liquidaciones",
  "wa_template_servicios_vencidos",
  "wa_template_declaraciones_juradas",
  "giftcard_template_data_url",
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

const getTenantFacturacionScopedRow = async (db: any, tenantId: string, selectExpr: string) => {
  const byId = await db.from("usuarios").select(selectExpr).eq("id", tenantId).maybeSingle()
  if (!byId.error && byId.data) return byId
  if (byId.error && !isMissingColumnError(byId.error)) return byId

  const byTenant = await db.from("usuarios").select(selectExpr).eq("tenant_id", tenantId).limit(1).maybeSingle()
  if (!byTenant.error) return byTenant
  if (!isMissingColumnError(byTenant.error)) return byTenant

  return byId.error ? byId : byTenant
}

const getTenantFacturacionRow = async (db: any, tenantId: string) => {
  const full = await getTenantFacturacionScopedRow(db, tenantId, USER_FACTURACION_SELECT_FULL)
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full

  const fallback = await getTenantFacturacionScopedRow(db, tenantId, USER_FACTURACION_SELECT_FALLBACK)
  if (!fallback.error) return fallback
  if (!isMissingColumnError(fallback.error)) return fallback

  // Esquemas legacy: pedir todas las columnas evita romper por columnas nuevas faltantes.
  return getTenantFacturacionScopedRow(db, tenantId, "*")
}

const getTenantConfigRow = async (db: any, tenantId: string) => {
  const full = await selectTenantConfiguracionRow(db, tenantId, CONFIG_MENSAJERIA_SELECT)
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full

  const fallback = await selectTenantConfiguracionRow(db, tenantId, "giftcard_template_data_url")
  if (!fallback.error) return fallback
  if (!isMissingColumnError(fallback.error)) return fallback

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

export const resolveTenantGiftcardTemplate = async (db: any, tenantId: string): Promise<string | null> => {
  const { data, error } = await getTenantConfigRow(db, tenantId)
  if (error && !isMissingTableError(error, "configuracion")) {
    throw new Error(error.message || "No se pudo leer la plantilla de giftcard")
  }
  const value = String(data?.giftcard_template_data_url || "").trim()
  return value || null
}

const mergeFacturacionConfig = (
  base: FacturacionConfig | null,
  overrides: Partial<FacturacionConfig> | null | undefined,
): FacturacionConfig | null => {
  if (!base && !overrides) return null
  return {
    ...(base || {}),
    ...(overrides || {}),
  }
}

export const resolveTenantFacturacionConfig = async (
  db: any,
  tenantId: string,
): Promise<FacturacionConfig | null> => {
  const base = await resolveFacturacionConfig()
  const { data, error } = await getTenantFacturacionRow(db, tenantId)
  if (error && !isMissingTableError(error, "usuarios")) {
    throw new Error(error.message || "No se pudo leer la configuracion de facturacion")
  }
  if (!data) return base

  const overrides: Partial<FacturacionConfig> = {
    facturacion_activa: data.facturacion_activa ?? base?.facturacion_activa ?? false,
    afip_cuit: data.afip_cuit ?? base?.afip_cuit ?? null,
    afip_punto_venta: data.afip_punto_venta ?? base?.afip_punto_venta ?? null,
    afip_cbte_tipo: data.afip_cbte_tipo ?? base?.afip_cbte_tipo ?? null,
    afip_produccion: data.afip_produccion ?? base?.afip_produccion ?? false,
    afip_iva_id: data.afip_iva_id ?? base?.afip_iva_id ?? null,
    afip_iva_porcentaje: data.afip_iva_porcentaje ?? base?.afip_iva_porcentaje ?? null,
    afip_access_token: data.afip_access_token ?? base?.afip_access_token ?? null,
    afip_cert: data.afip_cert ?? base?.afip_cert ?? null,
    afip_key: data.afip_key ?? base?.afip_key ?? null,
    factura_logo_url: data.factura_logo_url ?? base?.factura_logo_url ?? null,
    factura_leyenda: data.factura_leyenda ?? base?.factura_leyenda ?? null,
    factura_leyenda_footer: data.factura_leyenda_footer ?? base?.factura_leyenda_footer ?? null,
    factura_emisor_nombre: data.factura_emisor_nombre ?? base?.factura_emisor_nombre ?? null,
    factura_emisor_domicilio: data.factura_emisor_domicilio ?? base?.factura_emisor_domicilio ?? null,
    factura_emisor_telefono: data.factura_emisor_telefono ?? base?.factura_emisor_telefono ?? null,
    factura_emisor_email: data.factura_emisor_email ?? base?.factura_emisor_email ?? null,
  }

  return mergeFacturacionConfig(base, overrides)
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
