import "server-only"

import { randomUUID } from "crypto"
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase/server"

const FALLBACK_BUCKET_FACTURAS = "facturas"
const FALLBACK_BUCKET_GIFTCARDS = "giftcards"
const FALLBACK_BUCKET_SHARE = "compartidos"
const FALLBACK_BUCKET_TURNOS_FOTOS = "turnos-fotos"

export const STORAGE_BUCKET_FACTURAS = process.env.SUPABASE_STORAGE_BUCKET_FACTURAS || FALLBACK_BUCKET_FACTURAS
export const STORAGE_BUCKET_GIFTCARDS = process.env.SUPABASE_STORAGE_BUCKET_GIFTCARDS || FALLBACK_BUCKET_GIFTCARDS
export const STORAGE_BUCKET_SHARE_FILES = process.env.SUPABASE_STORAGE_BUCKET_SHARE_FILES || FALLBACK_BUCKET_SHARE
export const STORAGE_BUCKET_TURNOS_FOTOS =
  process.env.SUPABASE_STORAGE_BUCKET_TURNOS_FOTOS || FALLBACK_BUCKET_TURNOS_FOTOS

const ensuredBuckets = new Set<string>()

type DataUrl = {
  mimeType: string
  base64: string
}

const sanitizePathSegment = (value: string) => {
  const cleaned = String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || randomUUID()
}

const normalizeObjectPath = (value: string) => String(value || "").replace(/\\/g, "/").replace(/^\/+/, "")

const toYearMonth = (date = new Date()) => ({
  year: String(date.getUTCFullYear()),
  month: String(date.getUTCMonth() + 1).padStart(2, "0"),
})

const sanitizeFilename = (value: string, fallbackName: string) => {
  const base = String(value || "").trim() || fallbackName
  return (
    base
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || fallbackName
  )
}

const extensionFromMime = (mimeType: string) => {
  const normalized = String(mimeType || "").toLowerCase()
  if (normalized.includes("png")) return "png"
  if (normalized.includes("webp")) return "webp"
  if (normalized.includes("gif")) return "gif"
  if (normalized.includes("svg")) return "svg"
  if (normalized.includes("pdf")) return "pdf"
  return "jpg"
}

const ensureFilenameExtension = (filename: string, extension: string) => {
  if (!filename) return `archivo.${extension}`
  if (filename.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return filename
  return `${filename}.${extension}`
}

export const isSupabaseStorageConfigured = () => isSupabaseConfigured()

export const parseDataUrl = (value: string): DataUrl | null => {
  const match = String(value || "").match(/^data:(.+?);base64,(.+)$/)
  if (!match) return null
  const mimeType = String(match[1] || "").trim()
  const base64 = String(match[2] || "").trim()
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

const decodeBase64ToBuffer = (value: string) => {
  const raw = String(value || "").trim()
  if (!raw) throw new Error("Base64 vacío")
  return Buffer.from(raw, "base64")
}

const ensureBucketExists = async (bucket: string) => {
  if (ensuredBuckets.has(bucket)) return
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.listBuckets()
  if (error) {
    throw new Error(`No se pudo listar buckets: ${error.message}`)
  }
  const exists = (data || []).some((item: any) => item?.name === bucket)
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(bucket, { public: false })
    if (createError && !String(createError.message || "").toLowerCase().includes("already")) {
      throw new Error(`No se pudo crear bucket ${bucket}: ${createError.message}`)
    }
  }
  ensuredBuckets.add(bucket)
}

export const uploadBinaryToStorage = async (args: {
  bucket: string
  objectPath: string
  buffer: Buffer
  contentType: string
  upsert?: boolean
}) => {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage no configurado")
  }

  const bucket = String(args.bucket || "").trim()
  const objectPath = normalizeObjectPath(args.objectPath)
  if (!bucket) throw new Error("Bucket inválido")
  if (!objectPath) throw new Error("Path inválido")

  await ensureBucketExists(bucket)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(bucket).upload(objectPath, args.buffer, {
    contentType: args.contentType,
    upsert: Boolean(args.upsert),
  })
  if (error) {
    throw new Error(error.message)
  }

  return {
    bucket,
    path: objectPath,
    contentType: args.contentType,
    sizeBytes: args.buffer.length,
  }
}

export const deleteStorageObject = async (args: { bucket?: string | null; path?: string | null }) => {
  const bucket = String(args.bucket || "").trim()
  const objectPath = normalizeObjectPath(String(args.path || ""))
  if (!bucket || !objectPath || !isSupabaseStorageConfigured()) {
    return { deleted: false, error: null as string | null }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(bucket).remove([objectPath])
  if (error) {
    return { deleted: false, error: error.message }
  }
  return { deleted: true, error: null as string | null }
}

export const downloadStorageObject = async (args: { bucket?: string | null; path?: string | null }) => {
  const bucket = String(args.bucket || "").trim()
  const objectPath = normalizeObjectPath(String(args.path || ""))
  if (!bucket || !objectPath || !isSupabaseStorageConfigured()) {
    return { buffer: null as Buffer | null, error: "Storage no configurado o referencia inválida" }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(bucket).download(objectPath)
  if (error || !data) {
    return { buffer: null as Buffer | null, error: error?.message || "Archivo no encontrado" }
  }
  const arrayBuffer = await data.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), error: null as string | null }
}

export const uploadFacturaPdfToStorage = async (args: {
  usuarioId: string
  pdfBase64: string
  filename?: string | null
}) => {
  const parsed = parseDataUrl(args.pdfBase64)
  const base64 = parsed?.base64 || args.pdfBase64
  const buffer = decodeBase64ToBuffer(base64)
  const safeFilename = ensureFilenameExtension(
    sanitizeFilename(args.filename || "comprobante.pdf", `factura-${randomUUID()}.pdf`),
    "pdf",
  )
  const { year, month } = toYearMonth()
  const objectPath = `${sanitizePathSegment(args.usuarioId)}/facturas/${year}/${month}/${randomUUID()}-${safeFilename}`
  const uploaded = await uploadBinaryToStorage({
    bucket: STORAGE_BUCKET_FACTURAS,
    objectPath,
    buffer,
    contentType: "application/pdf",
    upsert: false,
  })

  return {
    ...uploaded,
    filename: safeFilename,
  }
}

export const uploadGiftcardImageToStorage = async (args: {
  usuarioId: string
  giftcardId?: string | null
  imageData: string
}) => {
  const parsed = parseDataUrl(args.imageData)
  const mimeType = parsed?.mimeType || "image/jpeg"
  const base64 = parsed?.base64 || args.imageData
  const buffer = decodeBase64ToBuffer(base64)
  const extension = extensionFromMime(mimeType)
  const fileNameBase = sanitizePathSegment(args.giftcardId || randomUUID())
  const filename = ensureFilenameExtension(fileNameBase, extension)
  const { year, month } = toYearMonth()
  const objectPath = `${sanitizePathSegment(args.usuarioId)}/giftcards/${year}/${month}/${filename}`
  const uploaded = await uploadBinaryToStorage({
    bucket: STORAGE_BUCKET_GIFTCARDS,
    objectPath,
    buffer,
    contentType: mimeType,
    upsert: true,
  })

  return {
    ...uploaded,
    mimeType,
    filename,
  }
}

export const uploadTurnoWorkPhotoToStorage = async (args: {
  usuarioId: string
  turnoId?: string | null
  imageData: string
}) => {
  const parsed = parseDataUrl(args.imageData)
  const mimeType = parsed?.mimeType || "image/jpeg"
  const base64 = parsed?.base64 || args.imageData
  const buffer = decodeBase64ToBuffer(base64)
  const extension = extensionFromMime(mimeType)
  const fileNameBase = sanitizePathSegment(args.turnoId || randomUUID())
  const filename = ensureFilenameExtension(`${fileNameBase}-${randomUUID()}`, extension)
  const { year, month } = toYearMonth()
  const objectPath = `${sanitizePathSegment(args.usuarioId)}/turnos/${year}/${month}/${filename}`
  const uploaded = await uploadBinaryToStorage({
    bucket: STORAGE_BUCKET_TURNOS_FOTOS,
    objectPath,
    buffer,
    contentType: mimeType,
    upsert: false,
  })

  return {
    ...uploaded,
    mimeType,
    filename,
  }
}

export const uploadShareBinaryToStorage = async (args: {
  usuarioId: string
  token: string
  filename: string
  mimeType: string
  buffer: Buffer
}) => {
  const safeName = sanitizeFilename(args.filename, `archivo-${args.token}`)
  const { year, month } = toYearMonth()
  const objectPath = `${sanitizePathSegment(args.usuarioId)}/share/${year}/${month}/${sanitizePathSegment(args.token)}-${safeName}`
  const uploaded = await uploadBinaryToStorage({
    bucket: STORAGE_BUCKET_SHARE_FILES,
    objectPath,
    buffer: args.buffer,
    contentType: args.mimeType || "application/octet-stream",
    upsert: false,
  })

  return {
    ...uploaded,
    filename: safeName,
  }
}
