#!/usr/bin/env node

/**
 * Restore tenant-scoped data to Supabase from a local `.localdb.json` snapshot.
 *
 * Usage:
 *   node scripts/restore-from-localdb.js --file .localdb.json --target-tenant <tenant_uuid>
 *   node scripts/restore-from-localdb.js --file .localdb.json --target-tenant <tenant_uuid> --apply
 *
 * Notes:
 * - Dry-run by default.
 * - Only tenant-scoped tables are restored (rows with `usuario_id`).
 * - `usuarios` is never restored by this script.
 */

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const RESTORE_TABLES_ORDER = [
  "categorias",
  "recursos",
  "configuracion",
  "empleadas",
  "clientes",
  "servicios",
  "turno_grupos",
  "turnos",
  "senas",
  "adelantos",
  "pagos_grupos",
  "pago_grupo_items",
  "pagos",
  "giftcards",
  "caja_movimientos",
  "insumos",
  "insumo_movimientos",
  "productos",
  "producto_movimientos",
  "producto_compras",
  "producto_ventas",
  "facturas",
  "servicio_empleada_comisiones",
  "producto_empleada_comisiones",
  "recordatorios",
  "servicio_vencido_recordatorios",
  "confirmation_tokens",
  "share_links",
  "empleada_ausencias",
  "liquidaciones_historial",
  "declaraciones_juradas_plantillas",
  "declaraciones_juradas_respuestas",
]

const USER_REFERENCE_FIELDS = new Set([
  "created_by",
  "updated_by",
  "enviado_por",
  "agregado_por_user_id",
  "user_id",
])

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"])
const CHUNK_SIZE = 200

function getArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) return null
  return value
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function parseEnv(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const raw = line.trim()
    if (!raw || raw.startsWith("#")) continue
    const eq = raw.indexOf("=")
    if (eq < 0) continue
    const key = raw.slice(0, eq).trim()
    let value = raw.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function formatError(error) {
  if (!error) return "unknown error"
  const message = String(error.message || "").trim()
  if (message) return message
  const details = String(error.details || "").trim()
  if (details) return details
  const hint = String(error.hint || "").trim()
  if (hint) return hint
  const code = String(error.code || "").trim()
  if (code) return `error code ${code}`
  return JSON.stringify(error)
}

function isMissingTableError(error) {
  const code = String(error?.code || "")
  if (MISSING_TABLE_CODES.has(code)) return true
  const message = String(error?.message || "").toLowerCase()
  return message.includes("relation") && message.includes("does not exist")
}

function readSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el snapshot: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw)
  return parsed
}

function inferSourceTenantId(snapshot) {
  const counts = new Map()
  for (const [table, rows] of Object.entries(snapshot || {})) {
    if (!Array.isArray(rows) || table === "usuarios") continue
    for (const row of rows) {
      const tenantId = String(row?.usuario_id || "")
      if (!tenantId) continue
      counts.set(tenantId, (counts.get(tenantId) || 0) + 1)
    }
  }
  let bestTenant = ""
  let bestCount = 0
  for (const [tenantId, count] of counts.entries()) {
    if (count > bestCount) {
      bestTenant = tenantId
      bestCount = count
    }
  }
  return bestTenant || null
}

function normalizeSnapshot(snapshotRaw) {
  // Supports either the plain localdb structure or a wrapped dump shape.
  if (snapshotRaw && typeof snapshotRaw === "object" && snapshotRaw.tables) {
    const flattened = {}
    for (const [table, data] of Object.entries(snapshotRaw.tables)) {
      flattened[table] = Array.isArray(data?.rows) ? data.rows : []
    }
    return flattened
  }
  return snapshotRaw
}

function chunkArray(items, size) {
  const result = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

function transformRow({
  row,
  sourceTenantId,
  targetTenantId,
  sourceToTargetUserId,
}) {
  const next = { ...row }

  if ("usuario_id" in next) {
    const currentTenant = String(next.usuario_id || "")
    if (!currentTenant || currentTenant === sourceTenantId) {
      next.usuario_id = targetTenantId
    }
  }

  if ("tenant_id" in next) {
    next.tenant_id = targetTenantId
  }

  for (const [key, value] of Object.entries(next)) {
    if (value === null || value === undefined) continue
    if (typeof value !== "string") continue
    const isUserRefField = USER_REFERENCE_FIELDS.has(key) || key.endsWith("_user_id")
    if (!isUserRefField) continue
    if (!sourceToTargetUserId.has(value)) {
      next[key] = targetTenantId
      continue
    }
    next[key] = sourceToTargetUserId.get(value)
  }

  return next
}

async function ensureTableExists(supabase, table) {
  const { error } = await supabase.from(table).select("*").limit(1)
  if (!error) return { exists: true, error: null }
  if (isMissingTableError(error)) return { exists: false, error: null }
  return { exists: true, error }
}

async function loadRemoteTenantUsers(supabase, targetTenantId) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, username, rol, tenant_id")
    .or(`id.eq.${targetTenantId},tenant_id.eq.${targetTenantId}`)

  if (error) throw new Error(`No se pudo leer usuarios remotos: ${formatError(error)}`)
  return data || []
}

function buildUserMapping(snapshotUsers, remoteUsers, targetTenantId) {
  const map = new Map()
  const remoteByUsername = new Map()
  for (const user of remoteUsers) {
    const username = String(user?.username || "").toLowerCase()
    if (!username) continue
    if (!remoteByUsername.has(username)) {
      remoteByUsername.set(username, user.id)
    }
  }

  for (const sourceUser of snapshotUsers || []) {
    const sourceId = String(sourceUser?.id || "")
    if (!sourceId) continue
    const sourceUsername = String(sourceUser?.username || "").toLowerCase()
    const mapped = remoteByUsername.get(sourceUsername) || targetTenantId
    map.set(sourceId, mapped)
  }

  return map
}

function parseArgs() {
  const file = getArg("--file") || ".localdb.json"
  const targetTenantId = getArg("--target-tenant")
  const sourceTenantId = getArg("--source-tenant")
  const apply = hasFlag("--apply")
  if (!targetTenantId) {
    throw new Error("Falta --target-tenant <uuid>")
  }
  return { file, targetTenantId, sourceTenantId, apply }
}

async function upsertTableRows(supabase, table, rows) {
  if (rows.length === 0) {
    return { ok: true, inserted: 0, error: null }
  }

  const hasId = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "id"))
  const chunks = chunkArray(rows, CHUNK_SIZE)
  let total = 0

  for (const chunk of chunks) {
    let query = supabase.from(table).upsert(chunk)
    if (hasId) {
      query = supabase.from(table).upsert(chunk, { onConflict: "id" })
    }
    const { error } = await query
    if (error) {
      return { ok: false, inserted: total, error: formatError(error) }
    }
    total += chunk.length
  }

  return { ok: true, inserted: total, error: null }
}

async function main() {
  try {
    const args = parseArgs()
    const env = { ...parseEnv(path.join(process.cwd(), ".env")), ...process.env }
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
    const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) {
      throw new Error("Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const snapshotRaw = readSnapshot(path.resolve(process.cwd(), args.file))
    const snapshot = normalizeSnapshot(snapshotRaw)
    const sourceTenantId = args.sourceTenantId || inferSourceTenantId(snapshot)
    if (!sourceTenantId) {
      throw new Error("No se pudo inferir source tenant. Usa --source-tenant <id>")
    }

    const snapshotUsers = Array.isArray(snapshot?.usuarios) ? snapshot.usuarios : []
    const remoteUsers = await loadRemoteTenantUsers(supabase, args.targetTenantId)
    const sourceToTargetUserId = buildUserMapping(snapshotUsers, remoteUsers, args.targetTenantId)

    const report = {
      generated_at: new Date().toISOString(),
      apply: args.apply,
      file: args.file,
      source_tenant: sourceTenantId,
      target_tenant: args.targetTenantId,
      remote_users: remoteUsers.map((user) => ({
        id: user.id,
        username: user.username,
        rol: user.rol,
        tenant_id: user.tenant_id,
      })),
      tables: [],
    }

    for (const table of RESTORE_TABLES_ORDER) {
      const availableRows = Array.isArray(snapshot?.[table]) ? snapshot[table] : []
      if (availableRows.length === 0) {
        report.tables.push({
          table,
          status: "skipped",
          reason: "sin filas en snapshot",
          rows: 0,
        })
        continue
      }

      const tableCheck = await ensureTableExists(supabase, table)
      if (tableCheck.error) {
        report.tables.push({
          table,
          status: "failed",
          reason: formatError(tableCheck.error),
          rows: 0,
        })
        continue
      }
      if (!tableCheck.exists) {
        report.tables.push({
          table,
          status: "skipped",
          reason: "tabla no existe en remoto",
          rows: 0,
        })
        continue
      }

      const tenantRows = availableRows.filter((row) => String(row?.usuario_id || "") === sourceTenantId)
      if (tenantRows.length === 0) {
        report.tables.push({
          table,
          status: "skipped",
          reason: "sin filas para el tenant origen",
          rows: 0,
        })
        continue
      }

      const transformedRows = tenantRows.map((row) =>
        transformRow({
          row,
          sourceTenantId,
          targetTenantId: args.targetTenantId,
          sourceToTargetUserId,
        }),
      )

      if (!args.apply) {
        report.tables.push({
          table,
          status: "planned",
          reason: "dry-run",
          rows: transformedRows.length,
        })
        continue
      }

      const result = await upsertTableRows(supabase, table, transformedRows)
      if (!result.ok) {
        report.tables.push({
          table,
          status: "failed",
          reason: result.error,
          rows: result.inserted,
        })
        continue
      }

      report.tables.push({
        table,
        status: "restored",
        reason: "ok",
        rows: result.inserted,
      })
    }

    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: String(error?.message || error),
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
  }
}

void main()

