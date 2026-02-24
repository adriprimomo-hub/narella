import { NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import { createClient } from "@/lib/localdb/server"
import { validateBody } from "@/lib/api/validation"
import { resolveAppUrl } from "@/lib/url"
import { buildLiquidacionPDF } from "@/lib/pdf"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { isSupabaseStorageConfigured, uploadShareBinaryToStorage } from "@/lib/supabase/storage"

const liquidacionSchema = z.object({
  desde: z.string().min(1),
  hasta: z.string().min(1),
  empleada: z.object({
    nombre: z.string().min(1),
    apellido: z.string().optional().nullable(),
  }),
  items: z.array(
    z.object({
      id: z.string().optional(),
      tipo: z.enum(["servicio", "producto", "adelanto"]),
      fecha: z.string().optional().nullable(),
      servicio: z.string().optional().nullable(),
      producto: z.string().optional().nullable(),
      comision: z.coerce.number().optional().nullable(),
      adelanto: z.coerce.number().optional().nullable(),
    }),
  ),
  totales: z.object({
    comision: z.coerce.number(),
    adelantos: z.coerce.number(),
    neto: z.coerce.number(),
  }),
})

const shareSchema = z
  .object({
    tipo: z.enum(["factura", "giftcard", "liquidacion"]),
    id: z.string().min(1).optional(),
    liquidacion: liquidacionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tipo !== "liquidacion" && !value.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Falta el id del comprobante" })
    }
    if (value.tipo === "liquidacion" && !value.liquidacion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Faltan los datos de la liquidación" })
    }
  })

const parseShareTtlDays = () => {
  const raw = process.env.SHARE_LINK_TTL_DAYS
  if (!raw) return 30
  const value = Number(raw)
  if (!Number.isFinite(value)) return 30
  if (value <= 0) return null
  return Math.min(Math.floor(value), 365)
}

const buildExpiration = () => {
  const ttlDays = parseShareTtlDays()
  if (!ttlDays) return null
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
}

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(.*?);base64,(.+)$/)
  if (!match) return null
  return { mime: match[1], base64: match[2] }
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, shareSchema)
  if (validationResponse) return validationResponse

  if (payload.tipo === "liquidacion") {
    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const token = randomUUID()
  const createdAt = new Date().toISOString()
  const expiresAt = buildExpiration()
  let filename = ""
  let mimeType = ""
  let dataBase64: string | null = null
  let dataStorageBucket: string | null = null
  let dataStoragePath: string | null = null
  let resourceId: string | null = payload.id || null

  if (payload.tipo === "factura") {
    const loadFactura = async (withStorageColumns: boolean) => {
      const select = withStorageColumns
        ? "id, pdf_base64, pdf_storage_bucket, pdf_storage_path, pdf_filename, punto_venta, numero"
        : "id, pdf_base64, pdf_filename, punto_venta, numero"
      return db
        .from("facturas")
        .select(select)
        .eq("id", payload.id)
        .eq("usuario_id", user.id)
        .single()
    }

    let { data: factura, error } = await loadFactura(true)
    if (error && isMissingColumnError(error, "pdf_storage_path")) {
      ;({ data: factura, error } = await loadFactura(false))
    }

    if (error || !factura) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }
    if (!factura.pdf_base64 && !factura.pdf_storage_path) {
      return NextResponse.json({ error: "No hay PDF disponible" }, { status: 404 })
    }
    filename = factura.pdf_filename || `Factura-${factura.punto_venta ?? 0}-${factura.numero ?? 0}.pdf`
    mimeType = "application/pdf"
  }

  if (payload.tipo === "giftcard") {
    const loadGiftcard = async (withStorageColumns: boolean) => {
      const select = withStorageColumns
        ? "id, numero, imagen_base64, imagen_storage_bucket, imagen_storage_path"
        : "id, numero, imagen_base64"
      return db
        .from("giftcards")
        .select(select)
        .eq("id", payload.id)
        .eq("usuario_id", user.id)
        .single()
    }

    let { data: giftcard, error } = await loadGiftcard(true)
    if (error && isMissingColumnError(error, "imagen_storage_path")) {
      ;({ data: giftcard, error } = await loadGiftcard(false))
    }

    if (error || !giftcard) {
      return NextResponse.json({ error: "Giftcard no encontrada" }, { status: 404 })
    }
    if (!giftcard.imagen_base64 && !giftcard.imagen_storage_path) {
      return NextResponse.json({ error: "No hay imagen disponible" }, { status: 404 })
    }
    const parsed = giftcard.imagen_base64 ? parseDataUrl(giftcard.imagen_base64) : null
    mimeType = parsed?.mime || "image/jpeg"
    filename = giftcard.numero ? `giftcard-${giftcard.numero}.jpg` : "giftcard.jpg"
  }

  if (payload.tipo === "liquidacion" && payload.liquidacion) {
    const doc = buildLiquidacionPDF(payload.liquidacion)
    const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer
    const buffer = Buffer.from(arrayBuffer)
    const empleadaLabel = [payload.liquidacion.empleada.nombre, payload.liquidacion.empleada.apellido]
      .filter(Boolean)
      .join(" ")
      .trim()
    filename = `liquidacion-${empleadaLabel || "empleada"}.pdf`
    mimeType = "application/pdf"
    resourceId = null

    if (isSupabaseStorageConfigured()) {
      try {
        const uploaded = await uploadShareBinaryToStorage({
          usuarioId: user.id,
          token,
          filename,
          mimeType,
          buffer,
        })
        dataStorageBucket = uploaded.bucket
        dataStoragePath = uploaded.path
      } catch (error: any) {
        console.warn("[compartir] No se pudo subir liquidación a Storage, se usa base64", {
          userId: user.id,
          error: error?.message || "Error desconocido",
        })
        dataBase64 = buffer.toString("base64")
      }
    } else {
      dataBase64 = buffer.toString("base64")
    }
  }

  const insertPayload: Record<string, unknown> = {
    usuario_id: user.id,
    token,
    tipo: payload.tipo,
    resource_id: resourceId,
    filename: filename || null,
    mime_type: mimeType || null,
    data_base64: dataBase64,
    data_storage_bucket: dataStorageBucket,
    data_storage_path: dataStoragePath,
    created_at: createdAt,
    expires_at: expiresAt,
  }

  let { error: insertError } = await db.from("share_links").insert([insertPayload])
  if (
    insertError &&
    (isMissingColumnError(insertError, "data_storage_bucket") || isMissingColumnError(insertError, "data_storage_path"))
  ) {
    const { data_storage_bucket: _bucket, data_storage_path: _path, ...legacyPayload } = insertPayload
    ;({ error: insertError } = await db.from("share_links").insert([legacyPayload]))
  }

  if (insertError) {
    return NextResponse.json({ error: "No se pudo generar el link" }, { status: 500 })
  }

  const requestUrl = new URL(request.url)
  const host = requestUrl.hostname.toLowerCase()
  const isLocalHost = host === "localhost" || host === "127.0.0.1"
  const baseUrl = isLocalHost
    ? requestUrl.origin
    : resolveAppUrl({ headers: request.headers, fallbackOrigin: requestUrl.origin })
  const url = `${baseUrl}/compartir/${token}`

  return NextResponse.json({ url, token, expires_at: expiresAt })
}
