import Afip from "@afipsdk/afip.js"
import fs from "fs"
import path from "path"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

export type FacturaItem = {
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  tipo: "servicio" | "producto" | "penalidad" | "ajuste"
}

export type FacturaCliente = {
  nombre: string
  apellido?: string | null
}

export type FacturaEmisor = {
  nombre?: string | null
  domicilio?: string | null
  telefono?: string | null
  email?: string | null
  cuit?: string | null
}

export type FacturaResultado = {
  numero: number
  punto_venta: number
  cbte_tipo: number
  cae: string
  cae_vto: string
  fecha: string
  total: number
  metodo_pago: string
  cliente: FacturaCliente
  items: FacturaItem[]
  descuento_sena?: number
  leyenda?: string | null
  leyenda_footer?: string | null
  emisor: FacturaEmisor
}

export type FacturaAjuste = {
  descripcion: string
  monto: number
}

export type FacturaResponse = {
  factura: FacturaResultado
  pdf_base64: string | null
  pdf_filename: string | null
}

export type FacturacionConfig = {
  facturacion_activa?: boolean | null
  afip_cuit?: string | null
  afip_punto_venta?: number | null
  afip_cbte_tipo?: number | null
  afip_produccion?: boolean | null
  afip_cert?: string | null
  afip_key?: string | null
  afip_access_token?: string | null
  afip_iva_id?: number | null
  afip_iva_porcentaje?: number | null
  factura_logo_url?: string | null
  factura_leyenda?: string | null
  factura_leyenda_footer?: string | null
  factura_emisor_nombre?: string | null
  factura_emisor_domicilio?: string | null
  factura_emisor_telefono?: string | null
  factura_emisor_email?: string | null
}

type EmitirFacturaArgs = {
  cliente: FacturaCliente
  items: FacturaItem[]
  total: number
  metodo_pago: string
  descuento_sena?: number
  ajustes?: FacturaAjuste[]
  fecha?: Date
  numero_sugerido?: number
}

const round2 = (value: number) => Math.round(value * 100) / 100
const RECEPTOR_DOC_TIPO_OTRO = 99
const RECEPTOR_DOC_NRO_SIN_IDENTIFICAR = 0
const RECEPTOR_CONDICION_IVA_CONSUMIDOR_FINAL = 5
const IVA_ALICUOTA_21_ID = 5
const IVA_PORCENTAJE_FIJO = 21
const AR_TZ = "America/Argentina/Buenos_Aires"
const WSFE_SERVICE = "wsfe"
const WSFE_WSDL_PROD = "wsfe-production.wsdl"
const WSFE_WSDL_HOMO = "wsfe.wsdl"
const WSFE_URL_PROD = "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
const WSFE_URL_HOMO = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"

const normalizeEnvString = (value: string | undefined | null) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unwrapped = trimmed.slice(1, -1).trim()
    return unwrapped || null
  }
  return trimmed
}

const readEnvFirst = (...keys: string[]) => {
  for (const key of keys) {
    const value = normalizeEnvString(process.env[key])
    if (value) return value
  }
  return null
}

const normalizePem = (value: string | null) => {
  if (!value) return null
  return value.replace(/\\n/g, "\n")
}

const decodeBase64Pem = (value: string | null) => {
  if (!value) return null
  try {
    return Buffer.from(value, "base64").toString("utf8")
  } catch {
    return null
  }
}

const pushUnique = (target: string[], value: unknown) => {
  const text = String(value || "").trim()
  if (!text || target.includes(text)) return
  target.push(text)
}

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value
  return value == null ? [] : [value]
}

const formatWsfeCodeMessage = (entry: any) => {
  if (!entry || typeof entry !== "object") return ""
  const code = String(entry?.Code ?? "").trim()
  const msg = String(entry?.Msg ?? "").trim()
  if (code && msg) return `${code}: ${msg}`
  return code || msg || ""
}

const collectWsfeMessages = (source: any) => {
  const details: string[] = []
  if (!source || typeof source !== "object") return details

  if (typeof source?.message === "string") {
    pushUnique(details, source.message)
  }

  if (source?.data_errors && typeof source.data_errors === "object") {
    for (const [field, value] of Object.entries(source.data_errors as Record<string, unknown>)) {
      const msg = String(value || "").trim()
      if (msg) {
        pushUnique(details, `${field}: ${msg}`)
      }
    }
  }

  for (const entry of asArray(source?.Errors?.Err)) {
    pushUnique(details, formatWsfeCodeMessage(entry))
  }

  for (const entry of asArray(source?.Observaciones?.Obs)) {
    pushUnique(details, formatWsfeCodeMessage(entry))
  }

  const detailNodes = asArray(source?.FeDetResp?.FECAEDetResponse)
  for (const node of detailNodes) {
    for (const entry of asArray((node as any)?.Observaciones?.Obs)) {
      pushUnique(details, formatWsfeCodeMessage(entry))
    }
    for (const entry of asArray((node as any)?.Errors?.Err)) {
      pushUnique(details, formatWsfeCodeMessage(entry))
    }
  }

  if (typeof source?.Resultado === "string") {
    const result = source.Resultado.toUpperCase()
    if (result === "R") pushUnique(details, "Resultado rechazado por ARCA")
    if (result === "O") pushUnique(details, "Comprobante observado por ARCA")
  }

  for (const [key, value] of Object.entries(source)) {
    if (!key.endsWith("Result")) continue
    for (const message of collectWsfeMessages(value)) {
      pushUnique(details, message)
    }
  }

  return details
}

const collectWsfeErrorsOnly = (source: any) => {
  const details: string[] = []
  if (!source || typeof source !== "object") return details

  for (const entry of asArray(source?.Errors?.Err)) {
    pushUnique(details, formatWsfeCodeMessage(entry))
  }

  const detailNodes = asArray(source?.FeDetResp?.FECAEDetResponse)
  for (const node of detailNodes) {
    for (const entry of asArray((node as any)?.Errors?.Err)) {
      pushUnique(details, formatWsfeCodeMessage(entry))
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (!key.endsWith("Result")) continue
    for (const message of collectWsfeErrorsOnly(value)) {
      pushUnique(details, message)
    }
  }

  return details
}

const isAfipSdkMissingCertKeyError = (error: any) => {
  const certErr = String(error?.data?.data_errors?.cert || "").toLowerCase()
  const keyErr = String(error?.data?.data_errors?.key || "").toLowerCase()
  const combined = `${certErr} ${keyErr}`
  if (!combined) return false
  return combined.includes("obligatorio") || combined.includes("required")
}

const missingCertKeyMessage =
  "AFIP SDK requiere certificado y clave para operar WSFE. Configura AFIP_CERT y AFIP_KEY (o ARCA_CERT/ARCA_KEY), o AFIP_CERT_PATH/AFIP_KEY_PATH apuntando a archivos incluidos en el deploy de Vercel."

const formatAfipError = (context: string, error: any) => {
  const status = typeof error?.status === "number" ? error.status : null
  const statusText = typeof error?.statusText === "string" ? error.statusText : ""
  const details = collectWsfeMessages(error?.data)
  if (typeof error?.message === "string") {
    pushUnique(details, error.message)
  }

  if (isAfipSdkMissingCertKeyError(error)) {
    pushUnique(details, missingCertKeyMessage)
  }

  console.error("[facturacion] Error ARCA/AFIP", {
    context,
    status,
    statusText,
    data: error?.data ?? null,
  })

  if (status === 401) {
    return `${context}: ARCA devolvio 401 Unauthorized. Verifica AFIP_ACCESS_TOKEN (o ARCA_ACCESS_TOKEN) vigente y asignado al entorno de Vercel. ${details.join(" | ") || ""}`.trim()
  }

  const statusPart = status ? `${status}${statusText ? ` ${statusText}` : ""}` : ""
  return [context, statusPart, details.join(" | ")].filter(Boolean).join(" - ")
}

const hasArcaErrorCode = (error: any, code: string) => {
  const pattern = new RegExp(`\\b${code}\\b`)
  const parts = [
    typeof error?.message === "string" ? error.message : "",
    typeof error?.statusText === "string" ? error.statusText : "",
    typeof error?.data?.message === "string" ? error.data.message : "",
  ]
  if (parts.some((part) => pattern.test(part))) return true
  try {
    return pattern.test(JSON.stringify(error?.data ?? ""))
  } catch {
    return false
  }
}

const formatAfipDate = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: AR_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const y = parts.find((p) => p.type === "year")?.value
    const m = parts.find((p) => p.type === "month")?.value
    const d = parts.find((p) => p.type === "day")?.value
    if (y && m && d) return Number(`${y}${m}${d}`)
  } catch {
    // fallback below
  }
  const y = date.getFullYear().toString()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return Number(`${y}${m}${d}`)
}

const normalizeAfipDateNumber = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length !== 8) return null
  const num = Number(digits)
  return Number.isFinite(num) ? num : null
}

const afipDateToIso = (afipDate: number) => {
  const digits = String(afipDate || "").padStart(8, "0")
  if (!/^\d{8}$/.test(digits)) return new Date().toISOString()
  const y = Number(digits.slice(0, 4))
  const m = Number(digits.slice(4, 6))
  const d = Number(digits.slice(6, 8))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date().toISOString()
  return new Date(Date.UTC(y, Math.max(0, m - 1), d, 12, 0, 0)).toISOString()
}

const normalizeCaeDate = (value: unknown) => {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 8) return raw
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

type WsfeClient = {
  getLastVoucher: (salesPoint: number, cbteTipo: number) => Promise<number>
  createVoucher: (data: Record<string, any>) => Promise<any>
  getVoucherInfo: (number: number, salesPoint: number, cbteTipo: number) => Promise<any>
}

const unwrapWsfeMethodResult = (method: string, payload: any) => {
  if (!payload || typeof payload !== "object") return payload
  const key = `${method}Result`
  if (payload[key] !== undefined) return payload[key]
  return payload
}

const buildWsfeRequestMeta = (config: FacturacionConfig) => {
  const production = Boolean(config.afip_produccion)
  return {
    environment: production ? "prod" : "dev",
    wsid: WSFE_SERVICE,
    url: production ? WSFE_URL_PROD : WSFE_URL_HOMO,
    wsdl: production ? WSFE_WSDL_PROD : WSFE_WSDL_HOMO,
    soap_v_1_2: true,
  }
}

const executeWsfeWithExplicitAuth = async (args: {
  afip: any
  config: FacturacionConfig
  method: string
  params: Record<string, any>
}) => {
  const cuit = Number(args.config.afip_cuit || 0)
  if (!Number.isFinite(cuit) || cuit <= 0) {
    throw new Error("CUIT invalido para autenticar WSFE")
  }
  if (!args.config.afip_cert || !args.config.afip_key) {
    throw new Error(missingCertKeyMessage)
  }

  const ta = await args.afip.GetServiceTA(WSFE_SERVICE, false)
  const token = String(ta?.token || "").trim()
  const sign = String(ta?.sign || "").trim()
  if (!token || !sign) {
    throw new Error("No se pudo obtener Token/Sign para WSFE")
  }

  const requestPayload = {
    method: args.method,
    params: {
      Auth: {
        Token: token,
        Sign: sign,
        Cuit: cuit,
      },
      ...args.params,
    },
    ...buildWsfeRequestMeta(args.config),
  }
  const response = await args.afip.AdminClient.post("v1/afip/requests", requestPayload)
  return unwrapWsfeMethodResult(args.method, response?.data)
}

const toWsfeCreateVoucherParams = (data: Record<string, any>) => {
  const det = { ...data }
  const req: Record<string, any> = {
    FeCAEReq: {
      FeCabReq: {
        CantReg: det.CbteHasta - det.CbteDesde + 1,
        PtoVta: det.PtoVta,
        CbteTipo: det.CbteTipo,
      },
      FeDetReq: {
        FECAEDetRequest: det,
      },
    },
  }

  delete det.CantReg
  delete det.PtoVta
  delete det.CbteTipo

  if (det.Tributos) det.Tributos = { Tributo: det.Tributos }
  if (det.Iva) det.Iva = { AlicIva: det.Iva }
  if (det.CbtesAsoc) det.CbtesAsoc = { CbteAsoc: det.CbtesAsoc }
  if (det.Compradores) det.Compradores = { Comprador: det.Compradores }
  if (det.Opcionales) det.Opcionales = { Opcional: det.Opcionales }

  return req
}

const toWsfeCreateVoucherResponse = (payload: any) => {
  const feDetResp = payload?.FeDetResp
  let detail = feDetResp?.FECAEDetResponse
  if (Array.isArray(detail)) detail = detail[0]
  return {
    CAE: detail?.CAE,
    CAEFchVto: detail?.CAEFchVto,
    raw: payload,
  }
}

const createWsfeClient = (afip: any, config: FacturacionConfig): WsfeClient => {
  const ensureExplicitAuthFallback = async <T>(error: any, method: string, params: Record<string, any>, parse: (value: any) => T) => {
    if (!isAfipSdkMissingCertKeyError(error)) throw error
    if (!config.afip_cert || !config.afip_key) {
      throw new Error(missingCertKeyMessage)
    }
    const payload = await executeWsfeWithExplicitAuth({
      afip,
      config,
      method,
      params,
    })
    return parse(payload)
  }

  return {
    async getLastVoucher(salesPoint: number, cbteTipo: number) {
      try {
        return await afip.ElectronicBilling.getLastVoucher(salesPoint, cbteTipo)
      } catch (error: any) {
        return ensureExplicitAuthFallback(error, "FECompUltimoAutorizado", { PtoVta: salesPoint, CbteTipo: cbteTipo }, (payload) => {
          const wsErrors = collectWsfeErrorsOnly(payload)
          if (wsErrors.length > 0) {
            throw new Error(wsErrors.join(" | "))
          }
          return Number(payload?.CbteNro || 0)
        })
      }
    },
    async createVoucher(data: Record<string, any>) {
      try {
        return await afip.ElectronicBilling.createVoucher(data)
      } catch (error: any) {
        return ensureExplicitAuthFallback(error, "FECAESolicitar", toWsfeCreateVoucherParams(data), (payload) => {
          const parsed = toWsfeCreateVoucherResponse(payload)
          return {
            CAE: parsed.CAE,
            CAEFchVto: parsed.CAEFchVto,
            __raw: parsed.raw,
          }
        })
      }
    },
    async getVoucherInfo(number: number, salesPoint: number, cbteTipo: number) {
      try {
        return await afip.ElectronicBilling.getVoucherInfo(number, salesPoint, cbteTipo)
      } catch (error: any) {
        return ensureExplicitAuthFallback(error, "FECompConsultar", {
          FeCompConsReq: {
            CbteNro: number,
            PtoVta: salesPoint,
            CbteTipo: cbteTipo,
          },
        }, (payload) => {
          const wsErrors = collectWsfeErrorsOnly(payload)
          if (wsErrors.length > 0 && !wsErrors.some((msg) => /\b602\b/.test(msg))) {
            throw new Error(wsErrors.join(" | "))
          }
          return payload?.ResultGet ?? null
        })
      }
    },
  }
}

const resolveVoucherDateFromLast = async (
  wsfe: WsfeClient,
  puntoVenta: number,
  cbteTipo: number,
  lastNumber: number,
  desiredAfipDate: number,
) => {
  let resolvedDate = desiredAfipDate
  if (!Number.isFinite(lastNumber) || lastNumber <= 0) return resolvedDate
  try {
    const info = await wsfe.getVoucherInfo(lastNumber, puntoVenta, cbteTipo)
    const lastAfipDate = normalizeAfipDateNumber(info?.CbteFch)
    if (lastAfipDate && lastAfipDate > resolvedDate) {
      resolvedDate = lastAfipDate
    }
  } catch {
    // Si no se puede consultar el comprobante anterior, seguimos con la fecha deseada.
  }
  return resolvedDate
}

const inferConcepto = (items: FacturaItem[]) => {
  const tieneProductos = items.some((i) => i.tipo === "producto")
  const tieneServicios = items.some((i) => i.tipo === "servicio" || i.tipo === "penalidad")
  if (tieneProductos && tieneServicios) return 3
  if (tieneServicios) return 2
  return 1
}

const normalizeItems = (items: FacturaItem[]) =>
  items
    .map((i) => ({
      ...i,
      cantidad: Number(i.cantidad) || 1,
      precio_unitario: round2(Number(i.precio_unitario) || 0),
      subtotal: round2(Number(i.subtotal) || 0),
    }))
    .filter((i) => i.subtotal > 0)

const cbteLabel = (cbteTipo: number) => {
  if (cbteTipo === 11 || cbteTipo === 6 || cbteTipo === 1) return "Factura"
  if (cbteTipo === 13 || cbteTipo === 8 || cbteTipo === 3) return "Nota de crédito"
  return `Comprobante ${cbteTipo}`
}

const cbteCode = (cbteTipo: number) => {
  const map: Record<number, string> = {
    1: "001",
    3: "003",
    6: "006",
    8: "008",
    11: "011",
    13: "013",
  }
  return map[cbteTipo] || String(cbteTipo || 0).padStart(3, "0")
}

const cbteLetter = (cbteTipo: number) => {
  if (cbteTipo === 1 || cbteTipo === 3) return "A"
  if (cbteTipo === 6 || cbteTipo === 8) return "B"
  if (cbteTipo === 11 || cbteTipo === 13) return "C"
  return ""
}

const formatCbteNumber = (puntoVenta: number, numero: number) =>
  `${String(Number(puntoVenta) || 0).padStart(5, "0")}-${String(Number(numero) || 0).padStart(8, "0")}`

const buildLogoDataUrl = async (logoUrl: string) => {
  if (!logoUrl) return null
  if (logoUrl.startsWith("data:image/")) return logoUrl
  const isHttp = logoUrl.startsWith("http://") || logoUrl.startsWith("https://")
  if (!isHttp) {
    const filePath = path.isAbsolute(logoUrl) ? logoUrl : path.join(process.cwd(), logoUrl)
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase()
      const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
      const buffer = fs.readFileSync(filePath)
      return `data:${contentType};base64,${buffer.toString("base64")}`
    }
  }
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") || "image/png"
    const buffer = Buffer.from(await res.arrayBuffer())
    const base64 = buffer.toString("base64")
    return `data:${contentType};base64,${base64}`
  } catch (error) {
    console.warn("[facturacion] No se pudo cargar logo", error)
    return null
  }
}

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const formatMoney = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDateEsAr = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-AR")
}

const ARCA_LOGO_URL = "https://www.afip.gob.ar/frameworkAFIP/img/logo_arca_azul.svg"
const AFIP_QR_BASE_URL = "https://www.arca.gob.ar/fe/qr/"
const QR_IMAGE_PROVIDERS = [
  "https://quickchart.io/qr?size=180&text=",
  "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=",
]

const formatIsoDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  const y = date.getFullYear().toString()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const buildFiscalQrUrl = (factura: FacturaResultado, config: FacturacionConfig) => {
  const cuit = Number(config.afip_cuit || 0)
  const codAut = Number(String(factura.cae || "").replace(/\D/g, ""))
  if (!cuit || !codAut) return null
  const payload = {
    ver: 1,
    fecha: formatIsoDate(factura.fecha),
    cuit,
    ptoVta: Number(factura.punto_venta || 0),
    tipoCmp: Number(factura.cbte_tipo || 0),
    nroCmp: Number(factura.numero || 0),
    importe: round2(Number(factura.total || 0)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: RECEPTOR_DOC_TIPO_OTRO,
    nroDocRec: RECEPTOR_DOC_NRO_SIN_IDENTIFICAR,
    tipoCodAut: "E",
    codAut,
  }
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
  return `${AFIP_QR_BASE_URL}?p=${encodeURIComponent(payloadBase64)}`
}

const buildQrDataUrl = async (qrText: string | null) => {
  if (!qrText) return null
  for (const provider of QR_IMAGE_PROVIDERS) {
    try {
      const res = await fetch(`${provider}${encodeURIComponent(qrText)}`)
      if (!res.ok) continue
      const contentType = res.headers.get("content-type") || "image/png"
      const buffer = Buffer.from(await res.arrayBuffer())
      return `data:${contentType};base64,${buffer.toString("base64")}`
    } catch {
      // try next provider
    }
  }
  return null
}

const buildFacturaHtml = (
  factura: FacturaResultado,
  config: FacturacionConfig,
  assets: { logoDataUrl: string | null; arcaLogoDataUrl: string | null; qrDataUrl: string | null },
) => {
  const clienteNombre = `${factura.cliente.nombre} ${factura.cliente.apellido || ""}`.trim() || "Consumidor final"
  const emisorNombre = factura.emisor.nombre || config.factura_emisor_nombre || ""
  const emisorDomicilio = factura.emisor.domicilio || config.factura_emisor_domicilio || ""
  const emisorCuit = factura.emisor.cuit || config.afip_cuit || ""
  const comprobante = cbteLabel(factura.cbte_tipo).toUpperCase()
  const comprobanteCode = cbteCode(factura.cbte_tipo)
  const comprobanteLetter = cbteLetter(factura.cbte_tipo)
  const comprobanteNumero = formatCbteNumber(factura.punto_venta, factura.numero)
  const ivaPct = IVA_PORCENTAJE_FIJO
  const ivaContenido = ivaPct > 0 ? round2(factura.total - factura.total / (1 + ivaPct / 100)) : 0
  const otrosImpNacionales = 0
  const subtotalBruto = round2(
    factura.items.reduce((sum, item) => {
      const value = Number(item.subtotal || 0)
      if (value > 0) return sum + value
      return sum
    }, 0),
  )
  const totalDescuentos = round2(
    factura.items.reduce((sum, item) => {
      const value = Number(item.subtotal || 0)
      if (value < 0) return sum + Math.abs(value)
      return sum
    }, 0),
  )
  const rows = factura.items
    .map(
      (item) => `
        <tr class="${Number(item.subtotal || 0) < 0 ? "row-discount" : ""}">
          <td>${escapeHtml(item.descripcion)}</td>
          <td class="num">${escapeHtml(item.cantidad)}</td>
          <td class="num">${escapeHtml(formatMoney(item.precio_unitario))}</td>
          <td class="num">${escapeHtml(formatMoney(item.subtotal))}</td>
        </tr>
      `,
    )
    .join("")
  const leyendaHtml = factura.leyenda ? `<p>${escapeHtml(factura.leyenda)}</p>` : ""
  const leyendaFooterHtml = factura.leyenda_footer ? `<p>${escapeHtml(factura.leyenda_footer)}</p>` : ""
  const logoHtml = assets.logoDataUrl
    ? `<img src="${assets.logoDataUrl}" alt="Logo emisor" style="max-width: 100%; max-height: 130px; object-fit: contain;" />`
    : `<div class="logo-placeholder">LOGO</div>`
  const arcaLogoHtml = assets.arcaLogoDataUrl
    ? `<img src="${assets.arcaLogoDataUrl}" alt="ARCA" style="max-width: 140px; max-height: 40px; object-fit: contain;" />`
    : `<span class="arca-fallback">ARCA</span>`
  const qrHtml = assets.qrDataUrl
    ? `<img src="${assets.qrDataUrl}" alt="QR AFIP/ARCA" style="width: 140px; height: 140px; object-fit: contain;" />`
    : ""

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 22px; font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; }
      .top-line { height: 6px; background: #e5568a; border-radius: 4px; margin-bottom: 12px; }
      .head-grid { display: grid; grid-template-columns: 1.25fr 0.9fr; gap: 12px; }
      .logo-card { min-height: 144px; border: 1px solid #f3bfd3; border-radius: 12px; background: #fff6fb; display: flex; align-items: center; justify-content: center; padding: 10px; }
      .logo-placeholder { color: #d9457c; font-weight: 700; letter-spacing: 0.12em; }
      .doc-card { border: 1px solid #f3bfd3; border-radius: 12px; background: #fff6fb; padding: 10px; text-align: center; }
      .doc-copy { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
      .doc-letter { font-size: 34px; line-height: 1; color: #d9457c; font-weight: 700; margin: 2px 0; }
      .doc-code { font-size: 11px; color: #6b7280; }
      .doc-title { font-size: 17px; font-weight: 700; margin-top: 2px; color: #111827; }
      .doc-number { margin-top: 4px; font-size: 16px; font-weight: 700; letter-spacing: 0.06em; color: #d9457c; }
      .doc-date { margin-top: 4px; font-size: 11px; color: #374151; }
      .issuer { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
      .issuer h1 { margin: 0 0 6px 0; font-size: 18px; color: #111827; }
      .issuer p { margin: 2px 0; }
      .muted { color: #6b7280; }
      .client-box { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; background: #f9fafb; }
      .client-box p { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #e5e7eb; padding: 7px 8px; vertical-align: top; }
      th { background: #e5568a; color: white; text-align: left; }
      .num { text-align: right; white-space: nowrap; }
      .row-discount td { color: #b91c1c; }
      .totals { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; background: #fff; }
      .totals p { margin: 2px 0; }
      .totals p:last-child { font-size: 15px; font-weight: 700; color: #d9457c; margin-top: 4px; }
      .fiscal-box { margin-top: 10px; border: 1px solid #f3bfd3; border-radius: 12px; background: #fff6fb; padding: 10px; display: grid; grid-template-columns: 1fr 160px; gap: 10px; align-items: start; }
      .fiscal-box p { margin: 2px 0; }
      .fiscal-title { font-weight: 700; color: #111827; }
      .fiscal-values { font-weight: 700; color: #d9457c; }
      .fiscal-right { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .arca-badge { width: 100%; min-height: 48px; border-radius: 10px; border: 1px solid #0d3b66; background: #ffffff; display: flex; align-items: center; justify-content: center; padding: 6px; }
      .arca-fallback { color: #0d3b66; font-weight: 700; letter-spacing: 0.08em; }
      .arca-caption { font-size: 10px; color: #0d3b66; font-weight: 700; text-transform: uppercase; text-align: center; }
      .qr-box { width: 150px; height: 150px; border: 1px solid #f3bfd3; border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 10px; text-align: center; padding: 6px; }
      .footer-note { margin-top: 8px; color: #6b7280; line-height: 1.4; }
      .cae-footer { margin-top: 8px; border-top: 1px dashed #d1d5db; padding-top: 6px; color: #374151; font-size: 11px; display: flex; gap: 18px; flex-wrap: wrap; }
      p { margin: 4px 0; }
    </style>
  </head>
  <body>
    <div class="top-line"></div>
    <section class="head-grid">
      <div class="logo-card">
        ${logoHtml}
      </div>
      <div class="doc-card">
        <div class="doc-copy">ORIGINAL</div>
        <div class="doc-letter">${escapeHtml(comprobanteLetter)}</div>
        <div class="doc-code">Cod. ${escapeHtml(comprobanteCode)}</div>
        <div class="doc-title">${escapeHtml(comprobante)}</div>
        <div class="doc-number">${escapeHtml(comprobanteNumero)}</div>
        <div class="doc-date">Fecha de emision: ${escapeHtml(formatDateEsAr(factura.fecha))}</div>
      </div>
    </section>

    <section class="issuer">
      <h1>${escapeHtml(emisorNombre)}</h1>
      ${emisorDomicilio ? `<p><strong>Domicilio comercial:</strong> ${escapeHtml(emisorDomicilio)}</p>` : ""}
      ${emisorCuit ? `<p><strong>CUIT:</strong> ${escapeHtml(emisorCuit)}</p>` : ""}
      <p><strong>Condicion frente al IVA:</strong> Monotributista</p>
    </section>

    <section class="client-box">
      <p><strong>Cliente:</strong> ${escapeHtml(clienteNombre)}</p>
      <p><strong>Condicion frente al IVA:</strong> Consumidor Final</p>
      <p><strong>Documento:</strong> ${escapeHtml(RECEPTOR_DOC_TIPO_OTRO)} - ${escapeHtml(RECEPTOR_DOC_NRO_SIN_IDENTIFICAR)}</p>
      <p><strong>Metodo de pago:</strong> ${escapeHtml(factura.metodo_pago || "-")}</p>
    </section>

    <table>
      <thead>
        <tr>
          <th>Detalle</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4" class="muted">Sin items</td></tr>'}
      </tbody>
    </table>

    <section class="totals">
      <p>Subtotal: ARS ${escapeHtml(formatMoney(subtotalBruto))}</p>
      <p>Descuentos (seña/giftcard): -ARS ${escapeHtml(formatMoney(totalDescuentos))}</p>
      <p>Importe otros tributos: ARS ${escapeHtml(formatMoney(otrosImpNacionales))}</p>
      <p>Importe total: ARS ${escapeHtml(formatMoney(factura.total))}</p>
    </section>

    <section class="fiscal-box">
      <div>
        <p class="fiscal-title">Regimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p>
        <p class="fiscal-values">
          IVA contenido: $ ${escapeHtml(formatMoney(ivaContenido))}
          &nbsp;|&nbsp;
          Otros impuestos nacionales indirectos: $ ${escapeHtml(formatMoney(otrosImpNacionales))}
        </p>
      </div>
      <div class="fiscal-right">
        <div class="arca-badge">${arcaLogoHtml}</div>
        <div class="arca-caption">Comprobante autorizado</div>
        <div class="qr-box">${qrHtml || "QR no disponible"}</div>
      </div>
    </section>

    <section class="cae-footer">
      ${factura.cae ? `<div><strong>CAE:</strong> ${escapeHtml(factura.cae)}</div>` : ""}
      ${factura.cae_vto ? `<div><strong>Fecha Vto. CAE:</strong> ${escapeHtml(factura.cae_vto)}</div>` : ""}
    </section>

    <footer class="footer-note">
      ${leyendaHtml}
      ${leyendaFooterHtml}
    </footer>
  </body>
</html>`
}

const buildAfipClient = (config: FacturacionConfig) =>
  new (Afip as any)({
    CUIT: Number(config.afip_cuit),
    production: Boolean(config.afip_produccion),
    access_token: config.afip_access_token || undefined,
    cert: config.afip_cert || undefined,
    key: config.afip_key || undefined,
  })

const normalizePdfFileName = (value: string) => {
  const clean = String(value || "").trim()
  if (!clean) return "comprobante.pdf"
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`
}

const resolveDataUrlImageFormat = (dataUrl: string | null): "PNG" | "JPEG" | null => {
  if (!dataUrl) return null
  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(dataUrl)
  if (!match) return null
  const subtype = String(match[1] || "").toLowerCase()
  if (subtype === "png") return "PNG"
  if (subtype === "jpg" || subtype === "jpeg") return "JPEG"
  return null
}

const drawContainedImage = (
  doc: jsPDF,
  dataUrl: string | null,
  box: { x: number; y: number; w: number; h: number },
) => {
  const format = resolveDataUrlImageFormat(dataUrl)
  if (!format || !dataUrl) return false
  try {
    const props = doc.getImageProperties(dataUrl)
    const imageW = Number(props?.width || 0)
    const imageH = Number(props?.height || 0)
    if (!imageW || !imageH) return false
    const scale = Math.min(box.w / imageW, box.h / imageH)
    const drawW = imageW * scale
    const drawH = imageH * scale
    const drawX = box.x + (box.w - drawW) / 2
    const drawY = box.y + (box.h - drawH) / 2
    doc.addImage(dataUrl, format, drawX, drawY, drawW, drawH)
    return true
  } catch {
    return false
  }
}

const buildFacturaPDF = async (
  factura: FacturaResultado,
  config: FacturacionConfig,
  _afipClient?: any,
  filename?: string | null,
) => {
  const logoUrl = config.factura_logo_url || ""
  const logoDataUrl = logoUrl ? await buildLogoDataUrl(logoUrl) : null
  const qrUrl = buildFiscalQrUrl(factura, config)
  const qrDataUrl = await buildQrDataUrl(qrUrl)
  const requestedName = normalizePdfFileName(filename || `Factura-${factura.punto_venta}-${factura.numero}`)

  const clienteNombre = `${factura.cliente.nombre} ${factura.cliente.apellido || ""}`.trim() || "Consumidor final"
  const emisorNombre = factura.emisor.nombre || config.factura_emisor_nombre || ""
  const emisorDomicilio = factura.emisor.domicilio || config.factura_emisor_domicilio || ""
  const emisorCuit = factura.emisor.cuit || config.afip_cuit || ""
  const comprobante = cbteLabel(factura.cbte_tipo).toUpperCase()
  const comprobanteCode = cbteCode(factura.cbte_tipo)
  const comprobanteLetter = cbteLetter(factura.cbte_tipo)
  const comprobanteNumero = formatCbteNumber(factura.punto_venta, factura.numero)
  const ivaPct = IVA_PORCENTAJE_FIJO
  const ivaContenido = ivaPct > 0 ? round2(factura.total - factura.total / (1 + ivaPct / 100)) : 0
  const otrosImpNacionales = 0
  const subtotalBruto = round2(
    factura.items.reduce((sum, item) => {
      const value = Number(item.subtotal || 0)
      if (value > 0) return sum + value
      return sum
    }, 0),
  )
  const totalDescuentos = round2(
    factura.items.reduce((sum, item) => {
      const value = Number(item.subtotal || 0)
      if (value < 0) return sum + Math.abs(value)
      return sum
    }, 0),
  )

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 24
  const contentWidth = pageWidth - margin * 2
  const pink: [number, number, number] = [229, 86, 138]
  const pinkSoftFill: [number, number, number] = [255, 246, 251]
  const pinkSoftBorder: [number, number, number] = [243, 191, 211]
  const grayBorder: [number, number, number] = [229, 231, 235]
  const textMain: [number, number, number] = [17, 24, 39]
  const textMuted: [number, number, number] = [107, 114, 128]
  const textAlert: [number, number, number] = [185, 28, 28]

  let y = margin

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  doc.setFillColor(...pink)
  doc.roundedRect(margin, y, contentWidth, 6, 3, 3, "F")
  y += 14

  ensureSpace(130)
  const headerGap = 12
  const leftHeaderW = Math.min(332, contentWidth * 0.62)
  const rightHeaderW = contentWidth - leftHeaderW - headerGap
  const headerH = 120
  const leftX = margin
  const rightX = leftX + leftHeaderW + headerGap

  doc.setFillColor(...pinkSoftFill)
  doc.setDrawColor(...pinkSoftBorder)
  doc.roundedRect(leftX, y, leftHeaderW, headerH, 10, 10, "FD")
  const logoPadding = 12
  const logoDrawn = drawContainedImage(doc, logoDataUrl, {
    x: leftX + logoPadding,
    y: y + logoPadding,
    w: leftHeaderW - logoPadding * 2,
    h: headerH - logoPadding * 2,
  })
  if (!logoDrawn) {
    doc.setTextColor(...pink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.text("LOGO", leftX + leftHeaderW / 2, y + headerH / 2 + 5, { align: "center" })
  }

  doc.setFillColor(...pinkSoftFill)
  doc.setDrawColor(...pinkSoftBorder)
  doc.roundedRect(rightX, y, rightHeaderW, headerH, 10, 10, "FD")
  const centerX = rightX + rightHeaderW / 2
  doc.setTextColor(...textMuted)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("ORIGINAL", centerX, y + 16, { align: "center" })
  doc.setTextColor(...pink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(34)
  doc.text(comprobanteLetter || "-", centerX, y + 50, { align: "center" })
  doc.setTextColor(...textMuted)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`Cod. ${comprobanteCode}`, centerX, y + 65, { align: "center" })
  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(comprobante, centerX, y + 84, { align: "center" })
  doc.setTextColor(...pink)
  doc.setFontSize(12)
  doc.text(comprobanteNumero, centerX, y + 100, { align: "center" })
  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Fecha de emision: ${formatDateEsAr(factura.fecha)}`, centerX, y + 114, { align: "center" })

  y += headerH + 10

  ensureSpace(92)
  doc.setDrawColor(...grayBorder)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(margin, y, contentWidth, 86, 8, 8, "FD")
  let textY = y + 18
  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  const emisorTitle = doc.splitTextToSize(emisorNombre || "Emisor", contentWidth - 24)
  doc.text(emisorTitle, margin + 12, textY)
  textY += emisorTitle.length * 14 + 4
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  if (emisorDomicilio) {
    doc.text(`Domicilio comercial: ${emisorDomicilio}`, margin + 12, textY)
    textY += 13
  }
  if (emisorCuit) {
    doc.text(`CUIT: ${emisorCuit}`, margin + 12, textY)
    textY += 13
  }
  doc.text("Condicion frente al IVA: Monotributista", margin + 12, textY)
  y += 96

  ensureSpace(78)
  doc.setDrawColor(...grayBorder)
  doc.setFillColor(249, 250, 251)
  doc.roundedRect(margin, y, contentWidth, 72, 8, 8, "FD")
  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  let clientY = y + 18
  doc.text(`Cliente: ${clienteNombre}`, margin + 12, clientY)
  clientY += 13
  doc.text("Condicion frente al IVA: Consumidor Final", margin + 12, clientY)
  clientY += 13
  doc.text(`Documento: ${RECEPTOR_DOC_TIPO_OTRO} - ${RECEPTOR_DOC_NRO_SIN_IDENTIFICAR}`, margin + 12, clientY)
  clientY += 13
  doc.text(`Metodo de pago: ${factura.metodo_pago || "-"}`, margin + 12, clientY)
  y += 84

  ensureSpace(120)
  const bodyRows = factura.items.length
    ? factura.items.map((item) => [
        String(item.descripcion || "Item"),
        String(item.cantidad || 0),
        formatMoney(item.precio_unitario),
        formatMoney(item.subtotal),
      ])
    : [["Sin items", "-", "-", "-"]]

  autoTable(doc, {
    startY: y,
    head: [["Detalle", "Cant.", "Precio", "Subtotal"]],
    body: bodyRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      lineColor: grayBorder,
      lineWidth: 0.5,
      textColor: textMain,
    },
    headStyles: {
      fillColor: pink,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 210 },
      1: { cellWidth: 55, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 75, halign: "right" },
    },
    didParseCell: (hook) => {
      if (hook.section !== "body") return
      const item = factura.items[hook.row.index]
      if (item && Number(item.subtotal || 0) < 0) {
        hook.cell.styles.textColor = textAlert
      }
    },
  })
  y = ((doc as any).lastAutoTable?.finalY || y) + 10

  ensureSpace(82)
  doc.setDrawColor(...grayBorder)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(margin, y, contentWidth, 76, 8, 8, "FD")
  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  let totalY = y + 18
  doc.text(`Subtotal: ARS ${formatMoney(subtotalBruto)}`, margin + 12, totalY)
  totalY += 13
  doc.text(`Descuentos (sena/giftcard): -ARS ${formatMoney(totalDescuentos)}`, margin + 12, totalY)
  totalY += 13
  doc.text(`Importe otros tributos: ARS ${formatMoney(otrosImpNacionales)}`, margin + 12, totalY)
  totalY += 16
  doc.setTextColor(...pink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(`Importe total: ARS ${formatMoney(factura.total)}`, margin + 12, totalY)
  y += 88

  ensureSpace(164)
  const fiscalH = 158
  doc.setDrawColor(...pinkSoftBorder)
  doc.setFillColor(...pinkSoftFill)
  doc.roundedRect(margin, y, contentWidth, fiscalH, 10, 10, "FD")

  const rightColW = 160
  const leftColW = contentWidth - rightColW - 22
  const fiscalLeftX = margin + 12
  const fiscalRightX = margin + contentWidth - rightColW - 10

  doc.setTextColor(...textMain)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  const fiscalTitleLines = doc.splitTextToSize(
    "Regimen de Transparencia Fiscal al Consumidor (Ley 27.743)",
    leftColW,
  )
  doc.text(fiscalTitleLines, fiscalLeftX, y + 18)

  doc.setTextColor(...pink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  const fiscalValueLines = doc.splitTextToSize(
    `IVA contenido: $ ${formatMoney(ivaContenido)} | Otros impuestos nacionales indirectos: $ ${formatMoney(otrosImpNacionales)}`,
    leftColW,
  )
  doc.text(fiscalValueLines, fiscalLeftX, y + 18 + fiscalTitleLines.length * 12 + 8)

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(13, 59, 102)
  doc.roundedRect(fiscalRightX, y + 10, rightColW, 34, 8, 8, "FD")
  doc.setTextColor(13, 59, 102)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("ARCA", fiscalRightX + rightColW / 2, y + 31, { align: "center" })
  doc.setFontSize(8)
  doc.text("Comprobante autorizado", fiscalRightX + rightColW / 2, y + 54, { align: "center" })

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...pinkSoftBorder)
  doc.roundedRect(fiscalRightX + 5, y + 62, rightColW - 10, 90, 8, 8, "FD")
  const qrDrawn = drawContainedImage(doc, qrDataUrl, {
    x: fiscalRightX + 10,
    y: y + 67,
    w: rightColW - 20,
    h: 80,
  })
  if (!qrDrawn) {
    doc.setTextColor(...textMuted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("QR no disponible", fiscalRightX + rightColW / 2, y + 110, { align: "center" })
  }
  y += fiscalH + 8

  ensureSpace(44)
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.8)
  doc.line(margin, y, margin + contentWidth, y)
  y += 12
  doc.setTextColor(55, 65, 81)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  if (factura.cae) {
    doc.text(`CAE: ${factura.cae}`, margin, y)
  }
  if (factura.cae_vto) {
    doc.text(`Fecha Vto. CAE: ${factura.cae_vto}`, margin + 180, y)
  }
  y += 12

  const footerNotes = [factura.leyenda, factura.leyenda_footer].filter(Boolean).map((note) => String(note))
  if (footerNotes.length > 0) {
    ensureSpace(34)
    doc.setTextColor(...textMuted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    const wrapped = doc.splitTextToSize(footerNotes.join(" "), contentWidth)
    doc.text(wrapped, margin, y)
  }

  const pdfArrayBuffer = doc.output("arraybuffer") as ArrayBuffer
  const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64")
  return { pdf_base64: pdfBase64, pdf_filename: requestedName }
}

export const resolveFacturacionConfig = async (): Promise<FacturacionConfig | null> => {
  const parseBool = (value: string | undefined) => {
    if (!value) return false
    return ["1", "true", "yes", "on"].includes(value.toLowerCase())
  }
  const parseNumber = (value: string | undefined, fallback?: number) => {
    if (!value) return fallback ?? null
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback ?? null
  }
  const resolvePath = (value: string | null) => {
    if (!value) return null
    return path.isAbsolute(value) ? value : path.join(process.cwd(), value)
  }
  const readFileIfExists = (filePath: string | null) => {
    if (!filePath) return null
    try {
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, "utf8")
    } catch {
      return null
    }
  }

  const certPath = resolvePath(readEnvFirst("AFIP_CERT_PATH", "ARCA_CERT_PATH"))
  const keyPath = resolvePath(readEnvFirst("AFIP_KEY_PATH", "ARCA_KEY_PATH"))
  const logoPath = resolvePath(readEnvFirst("FACTURA_LOGO_PATH"))
  const facturacionActivaRaw = readEnvFirst("AFIP_FACTURACION_ACTIVA", "ARCA_FACTURACION_ACTIVA")
  const afipProduccionRaw = readEnvFirst("AFIP_PRODUCCION", "ARCA_PRODUCCION")
  const afipCuitRaw = readEnvFirst("AFIP_CUIT", "ARCA_CUIT")
  const afipPuntoVentaRaw = readEnvFirst("AFIP_PUNTO_VENTA", "ARCA_PUNTO_VENTA")
  const afipCbteTipoRaw = readEnvFirst("AFIP_CBTE_TIPO", "ARCA_CBTE_TIPO")
  const afipAccessTokenRaw = readEnvFirst("AFIP_ACCESS_TOKEN", "ARCA_ACCESS_TOKEN", "AFIPSDK_ACCESS_TOKEN")
  const afipCertRaw = normalizePem(readEnvFirst("AFIP_CERT"))
  const afipKeyRaw = normalizePem(readEnvFirst("AFIP_KEY"))
  const afipCertBase64Raw = readEnvFirst("AFIP_CERT_BASE64", "AFIP_CERT_B64", "ARCA_CERT_BASE64", "ARCA_CERT_B64")
  const afipKeyBase64Raw = readEnvFirst("AFIP_KEY_BASE64", "AFIP_KEY_B64", "ARCA_KEY_BASE64", "ARCA_KEY_B64")
  const afipCertFromBase64 = normalizePem(decodeBase64Pem(afipCertBase64Raw))
  const afipKeyFromBase64 = normalizePem(decodeBase64Pem(afipKeyBase64Raw))
  const afipIvaIdRaw = readEnvFirst("AFIP_IVA_ID")
  const afipIvaPorcentajeRaw = readEnvFirst("AFIP_IVA_PORCENTAJE")
  const facturaLogoDataRaw = readEnvFirst("FACTURA_LOGO_DATA")
  const facturaLeyendaRaw = readEnvFirst("FACTURA_LEYENDA")
  const facturaLeyendaFooterRaw = readEnvFirst("FACTURA_LEYENDA_FOOTER")
  const facturaEmisorNombreRaw = readEnvFirst("FACTURA_EMISOR_NOMBRE")
  const facturaEmisorDomicilioRaw = readEnvFirst("FACTURA_EMISOR_DOMICILIO")
  const facturaEmisorTelefonoRaw = readEnvFirst("FACTURA_EMISOR_TELEFONO")
  const facturaEmisorEmailRaw = readEnvFirst("FACTURA_EMISOR_EMAIL")

  return {
    facturacion_activa: parseBool(facturacionActivaRaw ?? "true"),
    afip_cuit: afipCuitRaw || null,
    afip_punto_venta: parseNumber(afipPuntoVentaRaw ?? undefined, 1),
    afip_cbte_tipo: parseNumber(afipCbteTipoRaw ?? undefined, 11),
    afip_produccion: parseBool(afipProduccionRaw ?? undefined),
    afip_cert: afipCertRaw || afipCertFromBase64 || normalizePem(readFileIfExists(certPath)),
    afip_key: afipKeyRaw || afipKeyFromBase64 || normalizePem(readFileIfExists(keyPath)),
    afip_access_token: afipAccessTokenRaw || null,
    afip_iva_id: parseNumber(afipIvaIdRaw ?? undefined, IVA_ALICUOTA_21_ID),
    afip_iva_porcentaje: parseNumber(afipIvaPorcentajeRaw ?? undefined, IVA_PORCENTAJE_FIJO),
    factura_logo_url: facturaLogoDataRaw || logoPath || null,
    factura_leyenda: facturaLeyendaRaw || null,
    factura_leyenda_footer: facturaLeyendaFooterRaw || null,
    factura_emisor_nombre: facturaEmisorNombreRaw || null,
    factura_emisor_domicilio: facturaEmisorDomicilioRaw || null,
    factura_emisor_telefono: facturaEmisorTelefonoRaw || null,
    factura_emisor_email: facturaEmisorEmailRaw || null,
  }
}

export async function generarFacturaPdf(
  factura: FacturaResultado,
  options?: { filename?: string; config?: FacturacionConfig | null },
) {
  const config = options?.config ?? (await resolveFacturacionConfig())
  if (!config) {
    throw new Error("No se pudo cargar la configuración de facturación")
  }
  const pdfResult = await buildFacturaPDF(factura, config, undefined, options?.filename || undefined)
  const requestedFilename = options?.filename?.trim()
  return {
    pdf_base64: pdfResult.pdf_base64,
    pdf_filename: requestedFilename ? normalizePdfFileName(requestedFilename) : pdfResult.pdf_filename,
  }
}

export async function emitirFactura({
  cliente,
  items,
  total,
  metodo_pago,
  descuento_sena = 0,
  ajustes = [],
  fecha = new Date(),
  numero_sugerido,
}: EmitirFacturaArgs): Promise<FacturaResponse> {
  const config = await resolveFacturacionConfig()
  if (!config?.facturacion_activa) {
    throw new Error("La facturacion esta desactivada en el entorno")
  }
  if (!config?.afip_cuit) {
    throw new Error("Falta AFIP_CUIT en el entorno")
  }
  if (!config?.afip_punto_venta) {
    throw new Error("Falta AFIP_PUNTO_VENTA en el entorno")
  }
  if (!config?.afip_cbte_tipo) {
    throw new Error("Falta AFIP_CBTE_TIPO en el entorno")
  }
  const hasAccessToken = Boolean(config?.afip_access_token)
  const hasCertPair = Boolean(config?.afip_cert && config?.afip_key)
  if (!hasAccessToken && !hasCertPair) {
    throw new Error("Falta credencial ARCA: configurá AFIP_ACCESS_TOKEN o el par AFIP_CERT/AFIP_KEY.")
  }

  const normalizedItems = normalizeItems(items)
  const totalFactura = round2(Number(total) || 0)
  const normalizedAjustes = (Array.isArray(ajustes) ? ajustes : [])
    .map((ajuste) => ({
      descripcion: String(ajuste?.descripcion || "").trim(),
      monto: round2(Number(ajuste?.monto || 0)),
    }))
    .filter((ajuste) => ajuste.descripcion && ajuste.monto > 0)

  const concepto = inferConcepto(normalizedItems)
  const cbteTipo = Number(config.afip_cbte_tipo)
  const puntoVenta = Number(config.afip_punto_venta)

  const afip = buildAfipClient(config)
  const wsfe = createWsfeClient(afip, config)

  const numeroSugerido = Number(numero_sugerido || 0)
  let ultimo: number | null = null
  try {
    const ultimoRemoto = await wsfe.getLastVoucher(puntoVenta, cbteTipo)
    ultimo = Number(ultimoRemoto || 0)
  } catch (error: any) {
    if (Number.isFinite(numeroSugerido) && numeroSugerido > 0) {
      ultimo = numeroSugerido - 1
      console.warn("[facturacion] Fallback de numeracion local por error en getLastVoucher", {
        puntoVenta,
        cbteTipo,
        numeroSugerido,
        error: error?.message || String(error),
      })
    } else {
      throw new Error(formatAfipError("No se pudo consultar el ultimo comprobante", error))
    }
  }
  const ivaId = Number(config.afip_iva_id || IVA_ALICUOTA_21_ID)
  const ivaPct = Number(config.afip_iva_porcentaje || IVA_PORCENTAJE_FIJO)
  const buildVoucherData = (numeroComprobante: number, fechaComprobanteAfip: number) => {
    const data: Record<string, any> = {
      CantReg: 1,
      PtoVta: puntoVenta,
      CbteTipo: cbteTipo,
      Concepto: concepto,
      DocTipo: RECEPTOR_DOC_TIPO_OTRO,
      DocNro: RECEPTOR_DOC_NRO_SIN_IDENTIFICAR,
      CondicionIVAReceptorId: RECEPTOR_CONDICION_IVA_CONSUMIDOR_FINAL,
      CbteDesde: numeroComprobante,
      CbteHasta: numeroComprobante,
      CbteFch: fechaComprobanteAfip,
      ImpTotal: round2(totalFactura),
      ImpTotConc: 0,
      ImpNeto: round2(totalFactura),
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
    }

    if (concepto !== 1) {
      const fch = fechaComprobanteAfip
      data.FchServDesde = fch
      data.FchServHasta = fch
      data.FchVtoPago = fch
    }

    if (cbteTipo !== 11 && ivaId > 0 && ivaPct > 0) {
      const neto = round2(totalFactura / (1 + ivaPct / 100))
      const iva = round2(totalFactura - neto)
      data.ImpNeto = neto
      data.ImpIVA = iva
      data.Iva = [{ Id: ivaId, BaseImp: neto, Importe: iva }]
    }

    return data
  }

  const ultimoBase = Number.isFinite(Number(ultimo || 0)) ? Number(ultimo || 0) : 0
  let numeroComprobante = Math.max(1, ultimoBase + 1, Number.isFinite(numeroSugerido) && numeroSugerido > 0 ? numeroSugerido : 1)
  let fechaComprobanteAfip = await resolveVoucherDateFromLast(
    wsfe,
    puntoVenta,
    cbteTipo,
    Math.max(0, numeroComprobante - 1),
    formatAfipDate(fecha),
  )
  let respuesta: any
  try {
    respuesta = await wsfe.createVoucher(buildVoucherData(numeroComprobante, fechaComprobanteAfip))
  } catch (error: any) {
    const shouldProbeBySuggestion =
      Number.isFinite(numeroSugerido) &&
      numeroSugerido > 0 &&
      Number(error?.status || 0) === 400 &&
      !isAfipSdkMissingCertKeyError(error)
    if (!hasArcaErrorCode(error, "10016") && !shouldProbeBySuggestion) {
      throw new Error(formatAfipError("No se pudo emitir el comprobante en ARCA", error))
    }

    // Si ARCA informa desincronización de numeración/fecha, reconsulta y reintenta una vez.
    try {
      const ultimoSincronizado = await wsfe.getLastVoucher(puntoVenta, cbteTipo)
      numeroComprobante = Number(ultimoSincronizado || 0) + 1
      fechaComprobanteAfip = await resolveVoucherDateFromLast(
        wsfe,
        puntoVenta,
        cbteTipo,
        Number(ultimoSincronizado || 0),
        formatAfipDate(new Date()),
      )
      respuesta = await wsfe.createVoucher(buildVoucherData(numeroComprobante, fechaComprobanteAfip))
    } catch (retryError: any) {
      if (Number.isFinite(numeroSugerido) && numeroSugerido > 0) {
        let probeNumero = Math.max(numeroComprobante + 1, numeroSugerido)
        let lastProbeError: any = retryError
        fechaComprobanteAfip = formatAfipDate(new Date())
        for (let attempt = 0; attempt < 20; attempt += 1) {
          try {
            const probeResponse = await wsfe.createVoucher(buildVoucherData(probeNumero, fechaComprobanteAfip))
            numeroComprobante = probeNumero
            respuesta = probeResponse
            lastProbeError = null
            break
          } catch (probeError: any) {
            lastProbeError = probeError
            if (hasArcaErrorCode(probeError, "10016") || Number(probeError?.status || 0) === 400) {
              probeNumero += 1
              continue
            }
            throw new Error(formatAfipError("No se pudo emitir el comprobante en ARCA", probeError))
          }
        }

        if (lastProbeError) {
          throw new Error(formatAfipError("No se pudo emitir el comprobante en ARCA", lastProbeError))
        }
      } else {
        throw new Error(formatAfipError("No se pudo emitir el comprobante en ARCA", retryError))
      }
    }
  }
  const respuestaRaw = respuesta?.__raw || respuesta
  const cae = String(respuesta?.CAE || respuesta?.cae || "")
  const caeVto = normalizeCaeDate(respuesta?.CAEFchVto || respuesta?.cae_vto || "")

  if (!cae) {
    const wsErrors = collectWsfeMessages(respuestaRaw)
    const wsErrorDetail = wsErrors.length > 0 ? `: ${wsErrors.join(" | ")}` : ""
    throw new Error(`No se pudo obtener CAE de AFIP${wsErrorDetail}`)
  }

  const ajusteItems: FacturaItem[] = normalizedAjustes.map((ajuste) => ({
    tipo: "ajuste",
    descripcion: ajuste.descripcion,
    cantidad: 1,
    precio_unitario: -round2(ajuste.monto),
    subtotal: -round2(ajuste.monto),
  }))

  const factura: FacturaResultado = {
    numero: numeroComprobante,
    punto_venta: puntoVenta,
    cbte_tipo: cbteTipo,
    cae,
    cae_vto: caeVto,
    fecha: afipDateToIso(fechaComprobanteAfip),
    total: totalFactura,
    metodo_pago,
    cliente,
    items: [...normalizedItems, ...ajusteItems],
    descuento_sena: descuento_sena > 0 ? round2(descuento_sena) : undefined,
    leyenda: config.factura_leyenda || null,
    leyenda_footer: config.factura_leyenda_footer || null,
    emisor: {
      nombre: config.factura_emisor_nombre || null,
      domicilio: config.factura_emisor_domicilio || null,
      telefono: config.factura_emisor_telefono || null,
      email: config.factura_emisor_email || null,
      cuit: config.afip_cuit || null,
    },
  }

  const pdfResult = await buildFacturaPDF(factura, config, afip, `Factura-${puntoVenta}-${numeroComprobante}.pdf`)
  return { factura, pdf_base64: pdfResult.pdf_base64, pdf_filename: pdfResult.pdf_filename }
}
