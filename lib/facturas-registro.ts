import type { FacturaAjuste, FacturaCliente, FacturaItem, FacturaResponse } from "@/lib/facturacion"
import { isSupabaseStorageConfigured, uploadFacturaPdfToStorage } from "@/lib/supabase/storage"

type DbClient = {
  from: (table: string) => any
}

type PersistResult = {
  facturaId: string | null
  error: string | null
}

export type FacturaRetryPayload = {
  cliente: FacturaCliente
  items: FacturaItem[]
  total: number
  metodo_pago: string
  descuento_sena?: number
  ajustes?: FacturaAjuste[]
  fecha?: string
}

export const FACTURA_REINTENTO_MINUTOS = 5

const round2 = (value: number) => Math.round(value * 100) / 100

const toIsoOrNow = (value?: string | Date | null) => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString()
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  }
  return new Date().toISOString()
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

export const buildRetryNextAt = (from = new Date(), minutes = FACTURA_REINTENTO_MINUTOS) =>
  new Date(from.getTime() + minutes * 60_000).toISOString()

type FacturaPdfPersistence = {
  pdf_base64: string | null
  pdf_storage_bucket: string | null
  pdf_storage_path: string | null
  pdf_filename: string | null
  storage_error: string | null
}

export const resolveFacturaPdfPersistence = async (args: {
  userId: string
  pdfBase64: string | null
  pdfFilename: string | null
}): Promise<FacturaPdfPersistence> => {
  const pdfFilename = typeof args.pdfFilename === "string" && args.pdfFilename.trim() ? args.pdfFilename.trim() : null
  const pdfBase64 = typeof args.pdfBase64 === "string" && args.pdfBase64.trim() ? args.pdfBase64.trim() : null

  if (!pdfBase64) {
    return {
      pdf_base64: null,
      pdf_storage_bucket: null,
      pdf_storage_path: null,
      pdf_filename: pdfFilename,
      storage_error: null,
    }
  }

  if (!isSupabaseStorageConfigured()) {
    return {
      pdf_base64: pdfBase64,
      pdf_storage_bucket: null,
      pdf_storage_path: null,
      pdf_filename: pdfFilename,
      storage_error: null,
    }
  }

  try {
    const uploaded = await uploadFacturaPdfToStorage({
      usuarioId: args.userId,
      pdfBase64,
      filename: pdfFilename,
    })
    return {
      pdf_base64: null,
      pdf_storage_bucket: uploaded.bucket,
      pdf_storage_path: uploaded.path,
      pdf_filename: uploaded.filename || pdfFilename,
      storage_error: null,
    }
  } catch (error: any) {
    return {
      pdf_base64: pdfBase64,
      pdf_storage_bucket: null,
      pdf_storage_path: null,
      pdf_filename: pdfFilename,
      storage_error: error?.message || "No se pudo subir el PDF a Storage",
    }
  }
}

const normalizeItems = (items: FacturaItem[]) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      tipo: item.tipo,
      descripcion: String(item.descripcion || "").trim() || "Item",
      cantidad: Number(item.cantidad || 1),
      precio_unitario: round2(Number(item.precio_unitario || 0)),
      subtotal: round2(Number(item.subtotal || 0)),
    }))
    .filter((item) => item.cantidad > 0 && item.subtotal > 0)

const normalizeAjustes = (ajustes?: FacturaAjuste[]) =>
  (Array.isArray(ajustes) ? ajustes : [])
    .map((ajuste) => ({
      descripcion: String(ajuste.descripcion || "").trim(),
      monto: round2(Number(ajuste.monto || 0)),
    }))
    .filter((ajuste) => ajuste.descripcion && ajuste.monto > 0)

const buildItemsSnapshot = (payload: FacturaRetryPayload) => {
  const base = normalizeItems(payload.items)
  const ajustes = normalizeAjustes(payload.ajustes).map((ajuste) => ({
    tipo: "ajuste" as const,
    descripcion: ajuste.descripcion,
    cantidad: 1,
    precio_unitario: -round2(ajuste.monto),
    subtotal: -round2(ajuste.monto),
  }))
  return [...base, ...ajustes]
}

export const buildFacturaRetryPayload = (payload: {
  cliente: FacturaCliente
  items: FacturaItem[]
  total: number
  metodo_pago: string
  descuento_sena?: number
  ajustes?: FacturaAjuste[]
  fecha?: string | Date
}): FacturaRetryPayload => {
  const nombre = String(payload.cliente?.nombre || "").trim() || "Consumidor"
  const apellidoRaw = payload.cliente?.apellido
  const apellido = typeof apellidoRaw === "string" ? apellidoRaw.trim() : ""
  const total = round2(Math.max(0, Number(payload.total || 0)))
  const descuentoSena = round2(Number(payload.descuento_sena || 0))

  const result: FacturaRetryPayload = {
    cliente: { nombre, apellido: apellido || "Final" },
    items: normalizeItems(payload.items),
    total,
    metodo_pago: String(payload.metodo_pago || "").trim() || "efectivo",
    fecha: toIsoOrNow(payload.fecha),
  }

  if (descuentoSena > 0) {
    result.descuento_sena = descuentoSena
  }
  const ajustes = normalizeAjustes(payload.ajustes)
  if (ajustes.length > 0) {
    result.ajustes = ajustes
  }

  return result
}

export const parseFacturaRetryPayload = (raw: unknown): FacturaRetryPayload | null => {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const cliente = value.cliente
  if (!cliente || typeof cliente !== "object") return null
  const clienteValue = cliente as Record<string, unknown>
  const nombre = String(clienteValue.nombre || "").trim()
  if (!nombre) return null

  const itemsRaw = Array.isArray(value.items) ? (value.items as FacturaItem[]) : []
  const total = Number(value.total || 0)
  if (!Number.isFinite(total) || total <= 0) return null

  const payload = buildFacturaRetryPayload({
    cliente: { nombre, apellido: typeof clienteValue.apellido === "string" ? clienteValue.apellido : null },
    items: itemsRaw,
    total,
    metodo_pago: String(value.metodo_pago || "").trim() || "efectivo",
    descuento_sena: Number(value.descuento_sena || 0) || 0,
    ajustes: Array.isArray(value.ajustes) ? (value.ajustes as FacturaAjuste[]) : [],
    fecha: typeof value.fecha === "string" ? value.fecha : undefined,
  })

  if (payload.items.length === 0) return null
  return payload
}

export async function sugerirNumeroFacturaLocal(args: { db: DbClient; userId: string }): Promise<number | null> {
  const userId = String(args.userId || "").trim()
  if (!userId) return null
  const { data, error } = await args.db
    .from("facturas")
    .select("numero")
    .eq("usuario_id", userId)
    .eq("tipo", "factura")
    .order("numero", { ascending: false })
    .limit(30)
  if (error) return null
  const maxNumero = (Array.isArray(data) ? data : []).reduce((acc: number, row: any) => {
    const numero = Number(row?.numero || 0)
    if (Number.isFinite(numero) && numero > acc) return numero
    return acc
  }, 0)
  return maxNumero > 0 ? maxNumero + 1 : 1
}

export async function guardarFacturaEmitida(args: {
  db: DbClient
  userId: string
  username: string
  origenTipo: string
  origenId: string
  clienteId?: string | null
  facturaResponse: FacturaResponse
}): Promise<PersistResult> {
  const facturaData = args.facturaResponse.factura
  const pdfStorage = await resolveFacturaPdfPersistence({
    userId: args.userId,
    pdfBase64: args.facturaResponse.pdf_base64,
    pdfFilename: args.facturaResponse.pdf_filename,
  })
  if (pdfStorage.storage_error) {
    console.warn("[facturas] No se pudo migrar PDF a Storage, se mantiene base64", {
      userId: args.userId,
      error: pdfStorage.storage_error,
    })
  }

  const insertRow: Record<string, unknown> = {
    usuario_id: args.userId,
    tipo: "factura",
    estado: "emitida",
    origen_tipo: args.origenTipo,
    origen_id: args.origenId,
    cliente_id: args.clienteId || null,
    cliente_nombre: facturaData.cliente?.nombre || null,
    cliente_apellido: facturaData.cliente?.apellido || null,
    metodo_pago: facturaData.metodo_pago || null,
    total: facturaData.total,
    fecha: facturaData.fecha,
    punto_venta: facturaData.punto_venta,
    numero: facturaData.numero,
    cbte_tipo: facturaData.cbte_tipo,
    cae: facturaData.cae,
    cae_vto: facturaData.cae_vto,
    items: facturaData.items || [],
    descuento_sena: facturaData.descuento_sena ?? null,
    pdf_base64: pdfStorage.pdf_base64,
    pdf_storage_bucket: pdfStorage.pdf_storage_bucket,
    pdf_storage_path: pdfStorage.pdf_storage_path,
    pdf_filename: pdfStorage.pdf_filename,
    retry_payload: null,
    retry_intentos: 0,
    retry_ultimo_error: null,
    retry_ultimo_intento: null,
    retry_proximo_intento: null,
    creado_por: args.userId,
    creado_por_username: args.username,
  }

  let { data: facturaRow, error: facturaInsertError } = await args.db
    .from("facturas")
    .insert([insertRow])
    .select("id")
    .single()

  if (
    facturaInsertError &&
    (isMissingColumnError(facturaInsertError, "pdf_storage_bucket") ||
      isMissingColumnError(facturaInsertError, "pdf_storage_path"))
  ) {
    const legacyRow = {
      ...insertRow,
      pdf_base64: args.facturaResponse.pdf_base64,
    } as Record<string, unknown>
    delete legacyRow.pdf_storage_bucket
    delete legacyRow.pdf_storage_path

    ;({ data: facturaRow, error: facturaInsertError } = await args.db
      .from("facturas")
      .insert([legacyRow])
      .select("id")
      .single())
  }

  if (facturaInsertError) {
    return {
      facturaId: null,
      error: `La factura se emitio pero no se pudo guardar en historial: ${facturaInsertError.message}`,
    }
  }
  return { facturaId: facturaRow?.id || null, error: null }
}

export async function guardarFacturaPendiente(args: {
  db: DbClient
  userId: string
  username: string
  origenTipo: string
  origenId: string
  clienteId?: string | null
  retryPayload: FacturaRetryPayload
  errorMessage: string
}): Promise<PersistResult> {
  const nowIso = new Date().toISOString()
  const nextRetryAt = buildRetryNextAt(new Date())
  const safePayload = buildFacturaRetryPayload(args.retryPayload)
  const { data: facturaRow, error: insertError } = await args.db
    .from("facturas")
    .insert([
      {
        usuario_id: args.userId,
        tipo: "factura",
        estado: "pendiente",
        origen_tipo: args.origenTipo,
        origen_id: args.origenId,
        cliente_id: args.clienteId || null,
        cliente_nombre: safePayload.cliente.nombre || null,
        cliente_apellido: safePayload.cliente.apellido || null,
        metodo_pago: safePayload.metodo_pago || null,
        total: safePayload.total,
        fecha: safePayload.fecha || nowIso,
        items: buildItemsSnapshot(safePayload),
        descuento_sena: safePayload.descuento_sena ?? null,
        retry_payload: safePayload,
        retry_intentos: 0,
        retry_ultimo_error: String(args.errorMessage || "No se pudo emitir en ARCA"),
        retry_ultimo_intento: nowIso,
        retry_proximo_intento: nextRetryAt,
        creado_por: args.userId,
        creado_por_username: args.username,
      },
    ])
    .select("id")
    .single()

  if (insertError) {
    return {
      facturaId: null,
      error: `No se pudo guardar la factura pendiente para reintento automático: ${insertError.message}`,
    }
  }
  return { facturaId: facturaRow?.id || null, error: null }
}
