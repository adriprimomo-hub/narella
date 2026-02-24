import { NextResponse, type NextRequest } from "next/server"
import { localAdmin } from "@/lib/localdb/admin"
import { resolveFacturaPdfPersistence } from "@/lib/facturas-registro"
import {
  deleteStorageObject,
  isSupabaseStorageConfigured,
  uploadGiftcardImageToStorage,
  uploadShareBinaryToStorage,
} from "@/lib/supabase/storage"

const DEFAULT_MIGRATION_BATCH = 80
const DEFAULT_CLEANUP_BATCH = 150
const MAX_BATCH = 500

const parsePositiveInt = (value: string | null | undefined, fallback: number, max = MAX_BATCH) => {
  const num = Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.min(num, max)
}

const parseRetentionDays = (value: string | null | undefined) => {
  const num = Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.min(num, 3650)
}

const parseDateMs = (value?: string | null) => {
  if (!value) return 0
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 0
  return date.getTime()
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

const migrateFacturasBatch = async (limit: number) => {
  const stats = { candidates: 0, migrated: 0, errors: 0 }
  const { data, error } = await localAdmin
    .from("facturas")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit * 5)

  if (error) {
    return { ...stats, errors: 1, error: error.message }
  }

  const rows = (Array.isArray(data) ? data : [])
    .filter((row: any) => !row?.pdf_storage_path && row?.pdf_base64)
    .slice(0, limit)
  stats.candidates = rows.length

  for (const row of rows) {
    const persisted = await resolveFacturaPdfPersistence({
      userId: String(row.usuario_id || ""),
      pdfBase64: String(row.pdf_base64 || ""),
      pdfFilename: typeof row.pdf_filename === "string" ? row.pdf_filename : null,
    })

    if (!persisted.pdf_storage_path || !persisted.pdf_storage_bucket) {
      if (persisted.storage_error) stats.errors += 1
      continue
    }

    const { error: updateError } = await localAdmin
      .from("facturas")
      .update({
        pdf_base64: null,
        pdf_storage_bucket: persisted.pdf_storage_bucket,
        pdf_storage_path: persisted.pdf_storage_path,
        pdf_filename: persisted.pdf_filename,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("usuario_id", row.usuario_id)

    if (updateError) {
      stats.errors += 1
      continue
    }
    stats.migrated += 1
  }

  return { ...stats, error: null as string | null }
}

const migrateGiftcardsBatch = async (limit: number) => {
  const stats = { candidates: 0, migrated: 0, errors: 0 }
  const { data, error } = await localAdmin
    .from("giftcards")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit * 5)

  if (error) {
    return { ...stats, errors: 1, error: error.message }
  }

  const rows = (Array.isArray(data) ? data : [])
    .filter((row: any) => !row?.imagen_storage_path && row?.imagen_base64)
    .slice(0, limit)
  stats.candidates = rows.length

  for (const row of rows) {
    try {
      const uploaded = await uploadGiftcardImageToStorage({
        usuarioId: String(row.usuario_id || ""),
        giftcardId: String(row.id || ""),
        imageData: String(row.imagen_base64 || ""),
      })

      const { error: updateError } = await localAdmin
        .from("giftcards")
        .update({
          imagen_base64: null,
          imagen_storage_bucket: uploaded.bucket,
          imagen_storage_path: uploaded.path,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("usuario_id", row.usuario_id)

      if (updateError) {
        stats.errors += 1
        continue
      }
      stats.migrated += 1
    } catch {
      stats.errors += 1
    }
  }

  return { ...stats, error: null as string | null }
}

const migrateShareLinksBatch = async (limit: number) => {
  const stats = { candidates: 0, migrated: 0, errors: 0 }
  const { data, error } = await localAdmin
    .from("share_links")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit * 5)

  if (error) {
    return { ...stats, errors: 1, error: error.message }
  }

  const rows = (Array.isArray(data) ? data : [])
    .filter((row: any) => row?.tipo === "liquidacion" && !row?.data_storage_path && row?.data_base64)
    .slice(0, limit)
  stats.candidates = rows.length

  for (const row of rows) {
    try {
      const rawBase64 = String(row.data_base64 || "").trim()
      if (!rawBase64) {
        stats.errors += 1
        continue
      }
      const buffer = Buffer.from(rawBase64, "base64")
      if (!buffer.length) {
        stats.errors += 1
        continue
      }
      const uploaded = await uploadShareBinaryToStorage({
        usuarioId: String(row.usuario_id || ""),
        token: String(row.token || row.id || ""),
        filename: String(row.filename || `liquidacion-${row.id || "archivo"}.pdf`),
        mimeType: String(row.mime_type || "application/pdf"),
        buffer,
      })

      const { error: updateError } = await localAdmin
        .from("share_links")
        .update({
          data_base64: null,
          data_storage_bucket: uploaded.bucket,
          data_storage_path: uploaded.path,
        })
        .eq("id", row.id)
        .eq("usuario_id", row.usuario_id)

      if (updateError) {
        stats.errors += 1
        continue
      }
      stats.migrated += 1
    } catch {
      stats.errors += 1
    }
  }

  return { ...stats, error: null as string | null }
}

const cleanupExpiredShareLinks = async (limit: number) => {
  const stats = { candidates: 0, removedRows: 0, removedFiles: 0, errors: 0 }
  const nowMs = Date.now()
  const { data, error } = await localAdmin
    .from("share_links")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit * 5)

  if (error) {
    return { ...stats, errors: 1, error: error.message }
  }

  const rows = (Array.isArray(data) ? data : [])
    .filter((row: any) => {
      const exp = parseDateMs(row?.expires_at)
      return exp > 0 && exp < nowMs
    })
    .slice(0, limit)

  stats.candidates = rows.length

  for (const row of rows) {
    if (row?.data_storage_bucket && row?.data_storage_path) {
      const deleted = await deleteStorageObject({
        bucket: row.data_storage_bucket,
        path: row.data_storage_path,
      })
      if (deleted.deleted) stats.removedFiles += 1
      if (deleted.error) stats.errors += 1
    }

    const { error: deleteError } = await localAdmin
      .from("share_links")
      .delete()
      .eq("id", row.id)
      .eq("usuario_id", row.usuario_id)

    if (deleteError) {
      stats.errors += 1
      continue
    }
    stats.removedRows += 1
  }

  return { ...stats, error: null as string | null }
}

const cleanupStorageByRetention = async (args: { limit: number; facturasDays: number; giftcardsDays: number }) => {
  const now = Date.now()
  const result = {
    facturas: { candidates: 0, cleaned: 0, errors: 0 },
    giftcards: { candidates: 0, cleaned: 0, errors: 0 },
  }

  if (args.facturasDays > 0) {
    const cutoffMs = now - args.facturasDays * 24 * 60 * 60 * 1000
    const { data } = await localAdmin
      .from("facturas")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(args.limit * 5)
    const rows = (Array.isArray(data) ? data : [])
      .filter((row: any) => row?.pdf_storage_path && parseDateMs(row?.created_at) > 0 && parseDateMs(row?.created_at) < cutoffMs)
      .slice(0, args.limit)

    result.facturas.candidates = rows.length
    for (const row of rows) {
      const deleted = await deleteStorageObject({
        bucket: row.pdf_storage_bucket,
        path: row.pdf_storage_path,
      })
      if (deleted.error) {
        result.facturas.errors += 1
        continue
      }

      const { error: updateError } = await localAdmin
        .from("facturas")
        .update({
          pdf_base64: null,
          pdf_storage_bucket: null,
          pdf_storage_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("usuario_id", row.usuario_id)

      if (updateError) {
        result.facturas.errors += 1
        continue
      }
      result.facturas.cleaned += 1
    }
  }

  if (args.giftcardsDays > 0) {
    const cutoffMs = now - args.giftcardsDays * 24 * 60 * 60 * 1000
    const { data } = await localAdmin
      .from("giftcards")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(args.limit * 5)
    const rows = (Array.isArray(data) ? data : [])
      .filter(
        (row: any) =>
          row?.imagen_storage_path && parseDateMs(row?.created_at) > 0 && parseDateMs(row?.created_at) < cutoffMs,
      )
      .slice(0, args.limit)

    result.giftcards.candidates = rows.length
    for (const row of rows) {
      const deleted = await deleteStorageObject({
        bucket: row.imagen_storage_bucket,
        path: row.imagen_storage_path,
      })
      if (deleted.error) {
        result.giftcards.errors += 1
        continue
      }

      const { error: updateError } = await localAdmin
        .from("giftcards")
        .update({
          imagen_base64: null,
          imagen_storage_bucket: null,
          imagen_storage_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("usuario_id", row.usuario_id)

      if (updateError) {
        result.giftcards.errors += 1
        continue
      }
      result.giftcards.cleaned += 1
    }
  }

  return result
}

const runMaintenance = async (request: NextRequest) => {
  const authError = validateCron(request)
  if (authError) return authError

  const migrationBatch = parsePositiveInt(
    request.nextUrl.searchParams.get("migrate_limit"),
    parsePositiveInt(process.env.STORAGE_MIGRATION_BATCH_SIZE, DEFAULT_MIGRATION_BATCH),
  )
  const cleanupBatch = parsePositiveInt(
    request.nextUrl.searchParams.get("cleanup_limit"),
    parsePositiveInt(process.env.STORAGE_CLEANUP_BATCH_SIZE, DEFAULT_CLEANUP_BATCH),
  )

  const facturasRetentionDays = parseRetentionDays(process.env.FACTURAS_STORAGE_RETENTION_DAYS)
  const giftcardsRetentionDays = parseRetentionDays(process.env.GIFTCARDS_STORAGE_RETENTION_DAYS)
  const storageConfigured = isSupabaseStorageConfigured()

  const migration = {
    facturas: { candidates: 0, migrated: 0, errors: 0, error: null as string | null },
    giftcards: { candidates: 0, migrated: 0, errors: 0, error: null as string | null },
    share_links: { candidates: 0, migrated: 0, errors: 0, error: null as string | null },
  }

  if (storageConfigured) {
    migration.facturas = await migrateFacturasBatch(migrationBatch)
    migration.giftcards = await migrateGiftcardsBatch(migrationBatch)
    migration.share_links = await migrateShareLinksBatch(migrationBatch)
  }

  const expiredLinks = await cleanupExpiredShareLinks(cleanupBatch)
  const retention = storageConfigured
    ? await cleanupStorageByRetention({
        limit: cleanupBatch,
        facturasDays: facturasRetentionDays,
        giftcardsDays: giftcardsRetentionDays,
      })
    : {
        facturas: { candidates: 0, cleaned: 0, errors: 0 },
        giftcards: { candidates: 0, cleaned: 0, errors: 0 },
      }

  return NextResponse.json({
    success: true,
    storage_configured: storageConfigured,
    batches: {
      migration: migrationBatch,
      cleanup: cleanupBatch,
    },
    migration,
    cleanup: {
      expired_share_links: expiredLinks,
      retention_days: {
        facturas: facturasRetentionDays,
        giftcards: giftcardsRetentionDays,
      },
      retention,
    },
  })
}

export async function POST(request: NextRequest) {
  return runMaintenance(request)
}

export async function GET(request: NextRequest) {
  return runMaintenance(request)
}
