import { NextResponse, type NextRequest } from "next/server"
import { localAdmin } from "@/lib/localdb/admin"
import { createClient } from "@/lib/localdb/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { emitirFactura, resolveFacturacionConfig, type FacturaItem } from "@/lib/facturacion"
import {
  FACTURA_REINTENTO_MINUTOS,
  buildFacturaRetryPayload,
  buildRetryNextAt,
  type FacturaRetryPayload,
  parseFacturaRetryPayload,
  resolveFacturaPdfPersistence,
} from "@/lib/facturas-registro"

const DEFAULT_BATCH_SIZE = 30
const MAX_BATCH_SIZE = 100

type FacturaPendienteRow = {
  id: string
  usuario_id: string
  origen_tipo?: string | null
  origen_id?: string | null
  cliente_nombre?: string | null
  cliente_apellido?: string | null
  metodo_pago?: string | null
  total?: number | null
  items?: unknown
  retry_payload?: unknown
  retry_intentos?: number | null
  retry_proximo_intento?: string | null
}

type RetryScope = {
  userId?: string | null
  facturaId?: string | null
}

const parseDateSafe = (value?: string | null) => {
  if (!value) return 0
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 0
  return date.getTime()
}

const formatError = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Error desconocido")
  }
  return "Error desconocido"
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

const validateCron = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  return null
}

const hasCronAuth = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
}

const resolveManualActor = async () => {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && role !== "recepcion") {
    return { userId: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { userId: user.id, error: null as NextResponse | null }
}

const normalizePayloadItemsFromRow = (raw: unknown): FacturaItem[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const value = item as Record<string, unknown>
      const subtotal = Number(value?.subtotal || 0)
      const cantidadRaw = Number(value?.cantidad || 1)
      const precioUnitarioRaw = Number(value?.precio_unitario || 0)
      if (!Number.isFinite(subtotal) || subtotal <= 0) return null
      const tipoRaw = String(value?.tipo || "").toLowerCase()
      const tipo: FacturaItem["tipo"] =
        tipoRaw === "producto" || tipoRaw === "penalidad" || tipoRaw === "ajuste" ? (tipoRaw as FacturaItem["tipo"]) : "servicio"
      const cantidad = Number.isFinite(cantidadRaw) && cantidadRaw > 0 ? cantidadRaw : 1
      const precioUnitario =
        Number.isFinite(precioUnitarioRaw) && precioUnitarioRaw > 0 ? precioUnitarioRaw : subtotal / cantidad
      return {
        tipo,
        descripcion: String(value?.descripcion || "Servicio"),
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
      } satisfies FacturaItem
    })
    .filter(Boolean) as FacturaItem[]
}

const rebuildRetryPayloadFromRow = (row: FacturaPendienteRow): FacturaRetryPayload | null => {
  const total = Number(row.total || 0)
  if (!Number.isFinite(total) || total <= 0) return null
  const items = normalizePayloadItemsFromRow(row.items)
  const safeItems =
    items.length > 0
      ? items
      : [
          {
            tipo: "servicio",
            descripcion: "Servicio",
            cantidad: 1,
            precio_unitario: total,
            subtotal: total,
          } satisfies FacturaItem,
        ]
  return buildFacturaRetryPayload({
    cliente: {
      nombre: String(row.cliente_nombre || "").trim() || "Consumidor",
      apellido: String(row.cliente_apellido || "").trim() || "Final",
    },
    items: safeItems,
    total,
    metodo_pago: String(row.metodo_pago || "").trim() || "efectivo",
  })
}

const fetchPendientes = async (scope?: RetryScope) => {
  let query = localAdmin
    .from("facturas")
    .select(
      "id, usuario_id, origen_tipo, origen_id, cliente_nombre, cliente_apellido, metodo_pago, total, items, retry_payload, retry_intentos, retry_proximo_intento",
    )
    .eq("tipo", "factura")
    .eq("estado", "pendiente")

  if (scope?.userId) {
    query = query.eq("usuario_id", scope.userId)
  }
  if (scope?.facturaId) {
    query = query.eq("id", scope.facturaId)
  }
  query = query.order("created_at", { ascending: true })

  const { data, error } = await query

  if (error) {
    return { rows: [] as FacturaPendienteRow[], error: error.message }
  }
  return { rows: (Array.isArray(data) ? data : []) as FacturaPendienteRow[], error: null }
}

const summarize = (rows: FacturaPendienteRow[]) => {
  const nowMs = Date.now()
  const due = rows.filter((row) => parseDateSafe(row.retry_proximo_intento) <= nowMs || !row.retry_proximo_intento).length
  return { pendientes: rows.length, vencidas: due }
}

const processRetryRows = async (rows: FacturaPendienteRow[]) => {
  const now = new Date()
  const nowIso = now.toISOString()
  let emitidas = 0
  let fallidas = 0
  let invalidas = 0
  let ultimo_error: string | null = null
  const errores: Array<{ id: string; error: string }> = []
  const localSequenceCache = new Map<string, number>()

  const config = await resolveFacturacionConfig()
  const configCbteTipo = Number(config?.afip_cbte_tipo || 0)
  const configPuntoVenta = Number(config?.afip_punto_venta || 0)
  const canSuggestLocalSequence = Number.isFinite(configCbteTipo) && configCbteTipo > 0 && Number.isFinite(configPuntoVenta) && configPuntoVenta > 0

  const resolveNumeroSugerido = async (userId: string) => {
    if (!canSuggestLocalSequence) return null
    if (localSequenceCache.has(userId)) return localSequenceCache.get(userId) || null
    const { data, error } = await localAdmin
      .from("facturas")
      .select("numero")
      .eq("usuario_id", userId)
      .eq("tipo", "factura")
      .eq("cbte_tipo", configCbteTipo)
      .eq("punto_venta", configPuntoVenta)
      .order("numero", { ascending: false })
      .limit(20)
    if (error) return null
    const maxNumero = (Array.isArray(data) ? data : []).reduce((acc, row: any) => {
      const numero = Number(row?.numero || 0)
      if (Number.isFinite(numero) && numero > acc) return numero
      return acc
    }, 0)
    const next = Number.isFinite(maxNumero) && maxNumero > 0 ? maxNumero + 1 : 1
    localSequenceCache.set(userId, next)
    return next
  }

  for (const row of rows) {
    const nextAttempt = Number(row.retry_intentos || 0) + 1
    let retryPayload = parseFacturaRetryPayload(row.retry_payload)

    if (!retryPayload) {
      retryPayload = rebuildRetryPayloadFromRow(row)
      if (retryPayload) {
        await localAdmin
          .from("facturas")
          .update({
            retry_payload: retryPayload,
            updated_at: nowIso,
          })
          .eq("id", row.id)
      }
    }

    if (!retryPayload) {
      invalidas += 1
      fallidas += 1
      const err = "Payload de reintento invalido y no se pudo reconstruir"
      ultimo_error = err
      errores.push({ id: row.id, error: err })
      await localAdmin
        .from("facturas")
        .update({
          retry_intentos: nextAttempt,
          retry_ultimo_error: err,
          retry_ultimo_intento: nowIso,
          retry_proximo_intento: buildRetryNextAt(now),
          updated_at: nowIso,
        })
        .eq("id", row.id)
      continue
    }

    try {
      const numeroSugerido = await resolveNumeroSugerido(row.usuario_id)
      const facturaResponse = await emitirFactura({
        cliente: retryPayload.cliente,
        items: retryPayload.items,
        total: retryPayload.total,
        metodo_pago: retryPayload.metodo_pago,
        descuento_sena: retryPayload.descuento_sena || 0,
        ajustes: retryPayload.ajustes || [],
        // En reintentos usamos fecha actual para evitar rechazos por fecha fuera de secuencia.
        fecha: new Date(),
        numero_sugerido: numeroSugerido || undefined,
      })

      const facturaData = facturaResponse.factura
      const numeroEmitido = Number(facturaData?.numero || 0)
      if (Number.isFinite(numeroEmitido) && numeroEmitido > 0) {
        localSequenceCache.set(row.usuario_id, numeroEmitido + 1)
      }
      const pdfStorage = await resolveFacturaPdfPersistence({
        userId: row.usuario_id,
        pdfBase64: facturaResponse.pdf_base64,
        pdfFilename: facturaResponse.pdf_filename,
      })
      if (pdfStorage.storage_error) {
        console.warn("[facturas-reintentos] No se pudo subir PDF a Storage, se mantiene base64", {
          facturaId: row.id,
          usuarioId: row.usuario_id,
          error: pdfStorage.storage_error,
        })
      }

      const updatePayload: Record<string, unknown> = {
        estado: "emitida",
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
        retry_ultimo_error: null,
        retry_ultimo_intento: nowIso,
        retry_proximo_intento: null,
        updated_at: nowIso,
      }

      let { error: updateError } = await localAdmin.from("facturas").update(updatePayload).eq("id", row.id)

      if (
        updateError &&
        (isMissingColumnError(updateError, "pdf_storage_bucket") || isMissingColumnError(updateError, "pdf_storage_path"))
      ) {
        const legacyPayload = {
          ...updatePayload,
          pdf_base64: facturaResponse.pdf_base64,
        } as Record<string, unknown>
        delete legacyPayload.pdf_storage_bucket
        delete legacyPayload.pdf_storage_path
        ;({ error: updateError } = await localAdmin.from("facturas").update(legacyPayload).eq("id", row.id))
      }

      if (updateError) {
        throw new Error(`Se emitio en ARCA pero no se pudo actualizar la factura pendiente: ${updateError.message}`)
      }

      if (row.origen_tipo === "giftcard" && row.origen_id) {
        await localAdmin
          .from("giftcards")
          .update({ facturado: true, updated_at: nowIso })
          .eq("id", row.origen_id)
          .eq("usuario_id", row.usuario_id)
      }

      emitidas += 1
    } catch (error) {
      fallidas += 1
      const err = formatError(error)
      ultimo_error = err
      errores.push({ id: row.id, error: err })
      await localAdmin
        .from("facturas")
        .update({
          retry_intentos: nextAttempt,
          retry_ultimo_error: err,
          retry_ultimo_intento: nowIso,
          retry_proximo_intento: buildRetryNextAt(now),
          updated_at: nowIso,
        })
        .eq("id", row.id)
    }
  }

  return { emitidas, fallidas, invalidas, ultimo_error, errores: errores.slice(0, 5) }
}

const runRetryLoopCron = async (request: NextRequest) => {
  const authError = validateCron(request)
  if (authError) return authError

  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE

  const pendingQuery = await fetchPendientes()
  if (pendingQuery.error) {
    return NextResponse.json({ error: pendingQuery.error }, { status: 500 })
  }

  const nowMs = Date.now()
  const dueRows = pendingQuery.rows
    .filter((row) => !row.retry_proximo_intento || parseDateSafe(row.retry_proximo_intento) <= nowMs)
    .slice(0, limit)

  const result = await processRetryRows(dueRows)
  const statusQuery = await fetchPendientes()
  const status = summarize(statusQuery.rows)

  return NextResponse.json({
    success: true,
    mode: "cron",
    procesadas: dueRows.length,
    emitidas: result.emitidas,
    fallidas: result.fallidas,
    invalidas: result.invalidas,
    ultimo_error: result.ultimo_error,
    pendientes: status.pendientes,
    pendientes_vencidas: status.vencidas,
    reintento_cada_minutos: FACTURA_REINTENTO_MINUTOS,
  })
}

const runRetryLoopManual = async (request: NextRequest) => {
  const actor = await resolveManualActor()
  if (actor.error) return actor.error
  if (!actor.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE
  const facturaId = request.nextUrl.searchParams.get("factura_id")?.trim() || null
  const force = request.nextUrl.searchParams.get("force") === "1"

  const pendingQuery = await fetchPendientes({ userId: actor.userId, facturaId })
  if (pendingQuery.error) {
    return NextResponse.json({ error: pendingQuery.error }, { status: 500 })
  }
  if (facturaId && pendingQuery.rows.length === 0) {
    return NextResponse.json({ error: "Comprobante pendiente no encontrado" }, { status: 404 })
  }

  const nowMs = Date.now()
  let rows = pendingQuery.rows
  if (!facturaId && !force) {
    rows = rows.filter((row) => !row.retry_proximo_intento || parseDateSafe(row.retry_proximo_intento) <= nowMs)
  }
  rows = rows.slice(0, limit)

  const result = await processRetryRows(rows)

  const statusQuery = await fetchPendientes({ userId: actor.userId })
  if (statusQuery.error) {
    return NextResponse.json({ error: statusQuery.error }, { status: 500 })
  }
  const status = summarize(statusQuery.rows)

  return NextResponse.json({
    success: true,
    mode: "manual",
    procesadas: rows.length,
    emitidas: result.emitidas,
    fallidas: result.fallidas,
    invalidas: result.invalidas,
    ultimo_error: result.ultimo_error,
    errores: result.errores,
    pendientes: status.pendientes,
    pendientes_vencidas: status.vencidas,
    reintento_cada_minutos: FACTURA_REINTENTO_MINUTOS,
  })
}

export async function POST(request: NextRequest) {
  if (hasCronAuth(request)) {
    return runRetryLoopCron(request)
  }
  return runRetryLoopManual(request)
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("status") === "1") {
    if (hasCronAuth(request)) {
      const authError = validateCron(request)
      if (authError) return authError
      const pendingQuery = await fetchPendientes()
      if (pendingQuery.error) {
        return NextResponse.json({ error: pendingQuery.error }, { status: 500 })
      }
      const status = summarize(pendingQuery.rows)
      return NextResponse.json({
        service: "facturas-reintentos",
        mode: "cron",
        pendientes: status.pendientes,
        pendientes_vencidas: status.vencidas,
        reintento_cada_minutos: FACTURA_REINTENTO_MINUTOS,
        usage: "GET/POST /api/facturas/reintentos (cron/manual) | GET /api/facturas/reintentos?status=1 (estado)",
      })
    }

    const actor = await resolveManualActor()
    if (actor.error) return actor.error
    if (!actor.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const pendingQuery = await fetchPendientes({ userId: actor.userId })
    if (pendingQuery.error) {
      return NextResponse.json({ error: pendingQuery.error }, { status: 500 })
    }
    const status = summarize(pendingQuery.rows)
    return NextResponse.json({
      service: "facturas-reintentos",
      mode: "manual",
      pendientes: status.pendientes,
      pendientes_vencidas: status.vencidas,
      reintento_cada_minutos: FACTURA_REINTENTO_MINUTOS,
      usage: "POST /api/facturas/reintentos?factura_id=<id> | POST /api/facturas/reintentos?force=1",
    })
  }

  if (hasCronAuth(request)) {
    return runRetryLoopCron(request)
  }
  return runRetryLoopManual(request)
}
