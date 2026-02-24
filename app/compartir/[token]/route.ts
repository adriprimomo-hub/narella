import { NextResponse } from "next/server"
import { localAdmin } from "@/lib/localdb/admin"
import {
  STORAGE_BUCKET_FACTURAS,
  STORAGE_BUCKET_GIFTCARDS,
  STORAGE_BUCKET_SHARE_FILES,
  downloadStorageObject,
} from "@/lib/supabase/storage"

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

const sanitizeFilename = (value: string) =>
  value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim()

const buildHeaders = (mime: string, filename: string) => {
  const headers = new Headers()
  headers.set("Content-Type", mime)
  headers.set("Content-Disposition", `inline; filename=\"${sanitizeFilename(filename)}\"`)
  headers.set("Cache-Control", "private, no-store, max-age=0")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("X-Robots-Tag", "noindex, nofollow")
  return headers
}

type ShareRouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: ShareRouteContext) {
  const resolvedParams = await params
  const token = resolvedParams?.token
  if (!token) {
    return new NextResponse("Not found", { status: 404 })
  }

  const { data: link, error } = await localAdmin.from("share_links").select("*").eq("token", token).maybeSingle()

  if (error || !link) {
    return new NextResponse("Not found", { status: 404 })
  }

  if (link.expires_at) {
    const exp = new Date(link.expires_at)
    if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
      return new NextResponse("Not found", { status: 404 })
    }
  }

  let base64: string | null = null
  let buffer: Buffer | null = null
  let mime = link.mime_type || "application/octet-stream"
  let filename = link.filename || "archivo"

  if (link.tipo === "liquidacion") {
    if (link.data_storage_path) {
      const downloaded = await downloadStorageObject({
        bucket: link.data_storage_bucket || STORAGE_BUCKET_SHARE_FILES,
        path: link.data_storage_path,
      })
      buffer = downloaded.buffer
    }
    if (!buffer) {
      base64 = link.data_base64 || null
    }
    mime = link.mime_type || "application/pdf"
    filename = link.filename || "liquidacion.pdf"
  }

  if (link.tipo === "factura") {
    if (!link.resource_id) return new NextResponse("Not found", { status: 404 })
    const loadFactura = async (withStorageColumns: boolean) => {
      const select = withStorageColumns
        ? "pdf_base64, pdf_storage_bucket, pdf_storage_path, pdf_filename, punto_venta, numero"
        : "pdf_base64, pdf_filename, punto_venta, numero"
      return localAdmin
        .from("facturas")
        .select(select)
        .eq("id", link.resource_id)
        .eq("usuario_id", link.usuario_id)
        .maybeSingle()
    }

    let { data: factura, error: facturaError } = await loadFactura(true)
    if (facturaError && isMissingColumnError(facturaError, "pdf_storage_path")) {
      ;({ data: factura, error: facturaError } = await loadFactura(false))
    }
    if (!factura?.pdf_base64 && !factura?.pdf_storage_path) {
      return new NextResponse("Not found", { status: 404 })
    }
    if (factura?.pdf_storage_path) {
      const downloaded = await downloadStorageObject({
        bucket: factura.pdf_storage_bucket || STORAGE_BUCKET_FACTURAS,
        path: factura.pdf_storage_path,
      })
      buffer = downloaded.buffer
    }
    if (!buffer) {
      base64 = factura.pdf_base64
    }
    mime = "application/pdf"
    filename = factura.pdf_filename || `Factura-${factura.punto_venta ?? 0}-${factura.numero ?? 0}.pdf`
  }

  if (link.tipo === "giftcard") {
    if (!link.resource_id) return new NextResponse("Not found", { status: 404 })
    const loadGiftcard = async (withStorageColumns: boolean) => {
      const select = withStorageColumns
        ? "imagen_base64, imagen_storage_bucket, imagen_storage_path, numero"
        : "imagen_base64, numero"
      return localAdmin
        .from("giftcards")
        .select(select)
        .eq("id", link.resource_id)
        .eq("usuario_id", link.usuario_id)
        .maybeSingle()
    }

    let { data: giftcard, error: giftcardError } = await loadGiftcard(true)
    if (giftcardError && isMissingColumnError(giftcardError, "imagen_storage_path")) {
      ;({ data: giftcard, error: giftcardError } = await loadGiftcard(false))
    }
    if (!giftcard?.imagen_base64 && !giftcard?.imagen_storage_path) {
      return new NextResponse("Not found", { status: 404 })
    }
    if (giftcard?.imagen_storage_path) {
      const downloaded = await downloadStorageObject({
        bucket: giftcard.imagen_storage_bucket || STORAGE_BUCKET_GIFTCARDS,
        path: giftcard.imagen_storage_path,
      })
      buffer = downloaded.buffer
    }
    if (!buffer && giftcard?.imagen_base64) {
      const parsed = parseDataUrl(giftcard.imagen_base64)
      base64 = parsed?.base64 || giftcard.imagen_base64
      mime = parsed?.mime || "image/jpeg"
    } else if (buffer) {
      mime = link.mime_type || "image/jpeg"
    }
    filename = giftcard.numero ? `giftcard-${giftcard.numero}.jpg` : "giftcard.jpg"
  }

  if (!buffer && !base64) {
    return new NextResponse("Not found", { status: 404 })
  }

  if (!buffer && base64) {
    buffer = Buffer.from(base64, "base64")
  }
  if (!buffer) {
    return new NextResponse("Not found", { status: 404 })
  }

  return new NextResponse(new Uint8Array(buffer), { headers: buildHeaders(mime, filename) })
}
