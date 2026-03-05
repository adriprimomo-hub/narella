#!/usr/bin/env node

/**
 * Tenant recovery utility.
 *
 * Commands:
 * - verify
 * - repair [--apply]
 * - move-data --from-tenant <id> --to-tenant <id> [--apply]
 *
 * Examples:
 * - node scripts/tenant-recovery.js verify
 * - node scripts/tenant-recovery.js repair
 * - node scripts/tenant-recovery.js repair --apply
 * - node scripts/tenant-recovery.js repair --apply --broken-tenant <uuid> --owner <uuid> --move-data
 */

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const TENANT_TABLES = [
  "turnos",
  "clientes",
  "servicios",
  "pagos",
  "pagos_grupos",
  "pago_grupo_items",
  "senas",
  "adelantos",
  "facturas",
  "giftcards",
  "productos",
  "producto_ventas",
  "producto_movimientos",
  "producto_compras",
  "insumos",
  "insumo_movimientos",
  "configuracion",
  "empleadas",
  "empleada_ausencias",
  "recursos",
  "categorias",
  "caja_movimientos",
  "turno_grupos",
  "turno_servicios",
  "recordatorios",
  "confirmation_tokens",
  "share_links",
  "liquidaciones_historial",
  "servicio_vencido_recordatorios",
  "servicio_empleada_comisiones",
  "producto_empleada_comisiones",
  "declaraciones_juradas_plantillas",
  "declaraciones_juradas_respuestas",
]

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"])
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"])

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
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
    env[key] = value
  }
  return env
}

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

function errorCode(error) {
  return String(error?.code || "")
}

function formatError(error) {
  const message = String(error?.message || "").trim()
  if (message) return message
  const details = String(error?.details || "").trim()
  if (details) return details
  const hint = String(error?.hint || "").trim()
  if (hint) return hint
  const code = errorCode(error)
  if (code) return `Error code ${code}`
  return JSON.stringify(error || null)
}

function isMissingTableError(error) {
  const code = errorCode(error)
  if (MISSING_TABLE_CODES.has(code)) return true
  const message = String(error?.message || "").toLowerCase()
  return message.includes("does not exist") && message.includes("relation")
}

function isMissingColumnError(error) {
  const code = errorCode(error)
  if (MISSING_COLUMN_CODES.has(code)) return true
  const message = String(error?.message || "").toLowerCase()
  return message.includes("column") && message.includes("does not exist")
}

function parseCommand() {
  const cmd = process.argv[2]
  if (!cmd || !["verify", "repair", "move-data"].includes(cmd)) {
    return null
  }
  return cmd
}

function pickOwner(members, preferredOwnerId, allowNonAdminOwner) {
  if (!Array.isArray(members) || members.length === 0) return null

  if (preferredOwnerId) {
    const explicit = members.find((member) => member.id === preferredOwnerId)
    if (explicit) return explicit
  }

  const admins = members
    .filter((member) => member.rol === "admin")
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
  if (admins.length > 0) return admins[0]

  if (!allowNonAdminOwner) return null

  const ordered = [...members].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")),
  )
  return ordered[0]
}

function printUsage() {
  console.log("Uso:")
  console.log("  node scripts/tenant-recovery.js verify")
  console.log("  node scripts/tenant-recovery.js repair")
  console.log("  node scripts/tenant-recovery.js repair --apply")
  console.log("  node scripts/tenant-recovery.js repair --apply --broken-tenant <tenant_id>")
  console.log("  node scripts/tenant-recovery.js repair --apply --broken-tenant <tenant_id> --owner <user_id> --move-data")
  console.log("  node scripts/tenant-recovery.js move-data --from-tenant <old_id> --to-tenant <new_id>")
  console.log("  node scripts/tenant-recovery.js move-data --from-tenant <old_id> --to-tenant <new_id> --apply")
  console.log("Flags:")
  console.log("  --apply                 Ejecuta cambios (sin esta flag solo muestra plan)")
  console.log("  --broken-tenant <id>    Limita a un tenant_id roto puntual")
  console.log("  --owner <id>            Fuerza owner destino para el tenant roto indicado")
  console.log("  --allow-non-admin-owner Permite elegir owner no admin si no hay admin")
  console.log("  --move-data             Reasigna usuario_id en tablas de negocio")
}

async function createSupabaseFromEnv() {
  const env = {
    ...loadEnvFile(path.join(process.cwd(), ".env")),
    ...process.env,
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan variables SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function fetchUsers(supabase) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, username, rol, tenant_id, created_at")
    .order("created_at", { ascending: true })

  if (error) throw new Error(`No se pudo leer public.usuarios: ${error.message}`)
  return data || []
}

function buildUserMaps(users) {
  const byId = new Map()
  const byTenant = new Map()
  for (const user of users) {
    const id = String(user.id || "")
    const tenantId = String(user.tenant_id || "")
    if (!id) continue
    byId.set(id, user)
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, [])
    byTenant.get(tenantId).push(user)
  }
  return { byId, byTenant }
}

function findBrokenTenants(users) {
  const { byId, byTenant } = buildUserMaps(users)
  const broken = []

  for (const [tenantId, members] of byTenant.entries()) {
    if (!tenantId) {
      broken.push({
        tenant_id: tenantId,
        reason: "tenant_id vacio",
        members,
      })
      continue
    }
    if (!byId.has(tenantId)) {
      broken.push({
        tenant_id: tenantId,
        reason: "tenant_id apunta a owner inexistente",
        members,
      })
    }
  }

  return broken
}

async function countRowsForTenant(supabase, table, tenantId) {
  const result = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("usuario_id", tenantId)

  if (result.error) {
    if (isMissingTableError(result.error) || isMissingColumnError(result.error)) {
      return { ok: true, skipped: true, count: 0, reason: formatError(result.error) }
    }
    return { ok: false, skipped: false, count: 0, reason: formatError(result.error) }
  }

  return { ok: true, skipped: false, count: Number(result.count || 0), reason: "" }
}

async function moveDataBetweenTenants({ supabase, fromTenantId, toTenantId, apply }) {
  const byTable = []
  for (const table of TENANT_TABLES) {
    const preCount = await countRowsForTenant(supabase, table, fromTenantId)
    if (!preCount.ok) {
      byTable.push({
        table,
        status: "failed",
        reason: preCount.reason,
      })
      continue
    }
    if (preCount.skipped) {
      byTable.push({
        table,
        status: "skipped",
        reason: preCount.reason,
      })
      continue
    }
    if (preCount.count === 0) {
      byTable.push({
        table,
        status: "skipped",
        reason: "sin filas para mover",
      })
      continue
    }

    if (!apply) {
      byTable.push({
        table,
        status: "planned",
        rows: preCount.count,
      })
      continue
    }

    const updateResult = await supabase
      .from(table)
      .update({ usuario_id: toTenantId })
      .eq("usuario_id", fromTenantId)

    if (updateResult.error) {
      byTable.push({
        table,
        status: "failed",
        reason: formatError(updateResult.error),
      })
      continue
    }

    byTable.push({
      table,
      status: "moved",
      rows: preCount.count,
    })
  }

  return byTable
}

async function verifyCommand(supabase) {
  const users = await fetchUsers(supabase)
  const brokenTenants = findBrokenTenants(users)
  const adminUsers = users.filter((user) => user.rol === "admin")
  const tenantArg = getArg("--tenant")

  const tenantIdsToCheck = tenantArg
    ? [tenantArg]
    : Array.from(new Set(users.map((user) => String(user.tenant_id || "")).filter(Boolean)))

  const tenantSummaries = []
  for (const tenantId of tenantIdsToCheck) {
    const rowsByTable = {}
    let totalRows = 0
    for (const table of TENANT_TABLES) {
      const countResult = await countRowsForTenant(supabase, table, tenantId)
      rowsByTable[table] = countResult
      if (countResult.ok && !countResult.skipped) {
        totalRows += countResult.count
      }
    }
    tenantSummaries.push({
      tenant_id: tenantId,
      total_rows: totalRows,
      tables: rowsByTable,
    })
  }

  const report = {
    generated_at: new Date().toISOString(),
    users_total: users.length,
    admin_users: adminUsers.map((user) => ({
      id: user.id,
      username: user.username,
      tenant_id: user.tenant_id,
    })),
    broken_tenants_count: brokenTenants.length,
    broken_tenants: brokenTenants.map((item) => ({
      tenant_id: item.tenant_id,
      reason: item.reason,
      members: item.members.map((member) => ({
        id: member.id,
        username: member.username,
        rol: member.rol,
      })),
    })),
    tenant_summaries: tenantSummaries,
  }

  console.log(JSON.stringify(report, null, 2))

  if (brokenTenants.length > 0) {
    console.log("")
    console.log("Sugerencia:")
    console.log("  node scripts/tenant-recovery.js repair --apply")
  }
}

async function moveTenantDataIfRequested({
  supabase,
  fromTenantId,
  toTenantId,
  moveData,
}) {
  const moved = []
  const skipped = []
  const failed = []

  if (!moveData) {
    return { moved, skipped: TENANT_TABLES.map((table) => ({ table, reason: "flag --move-data no aplicada" })), failed }
  }

  for (const table of TENANT_TABLES) {
    const preCount = await countRowsForTenant(supabase, table, fromTenantId)
    if (!preCount.ok) {
      failed.push({ table, reason: preCount.reason })
      continue
    }
    if (preCount.skipped) {
      skipped.push({ table, reason: preCount.reason })
      continue
    }
    if (preCount.count === 0) {
      skipped.push({ table, reason: "sin filas para migrar" })
      continue
    }

    const updateResult = await supabase
      .from(table)
      .update({ usuario_id: toTenantId })
      .eq("usuario_id", fromTenantId)

    if (updateResult.error) {
      failed.push({ table, reason: formatError(updateResult.error) })
      continue
    }

    moved.push({ table, rows_updated_estimate: preCount.count })
  }

  return { moved, skipped, failed }
}

async function repairCommand(supabase) {
  const apply = hasFlag("--apply")
  const moveData = hasFlag("--move-data")
  const allowNonAdminOwner = hasFlag("--allow-non-admin-owner")
  const brokenTenantFilter = getArg("--broken-tenant")
  const preferredOwnerId = getArg("--owner")

  const users = await fetchUsers(supabase)
  const broken = findBrokenTenants(users).filter((item) =>
    brokenTenantFilter ? item.tenant_id === brokenTenantFilter : true,
  )

  if (broken.length === 0) {
    console.log(JSON.stringify({ ok: true, message: "No hay tenant_id rotos para reparar." }, null, 2))
    return
  }

  const plan = []
  for (const item of broken) {
    const owner = pickOwner(item.members, preferredOwnerId, allowNonAdminOwner)
    plan.push({
      broken_tenant_id: item.tenant_id,
      owner_target_id: owner?.id || null,
      owner_target_username: owner?.username || null,
      owner_target_role: owner?.rol || null,
      members: item.members.map((member) => ({
        id: member.id,
        username: member.username,
        rol: member.rol,
      })),
      can_apply: Boolean(owner),
      reason: owner
        ? "ok"
        : "No se encontro admin en el grupo. Usa --allow-non-admin-owner o define --owner.",
    })
  }

  const summary = {
    generated_at: new Date().toISOString(),
    apply,
    move_data: moveData,
    broken_tenants_found: broken.length,
    plan,
  }

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2))
    console.log("")
    console.log("Dry-run. Para ejecutar cambios:")
    console.log("  node scripts/tenant-recovery.js repair --apply")
    return
  }

  const results = []
  for (const item of plan) {
    if (!item.can_apply || !item.owner_target_id) {
      results.push({
        broken_tenant_id: item.broken_tenant_id,
        applied: false,
        error: item.reason,
      })
      continue
    }

    const updateUsers = await supabase
      .from("usuarios")
      .update({ tenant_id: item.owner_target_id })
      .eq("tenant_id", item.broken_tenant_id)

    if (updateUsers.error) {
      results.push({
        broken_tenant_id: item.broken_tenant_id,
        applied: false,
        error: `No se pudo actualizar tenant_id en usuarios: ${formatError(updateUsers.error)}`,
      })
      continue
    }

    const dataMoveResult = await moveTenantDataIfRequested({
      supabase,
      fromTenantId: item.broken_tenant_id,
      toTenantId: item.owner_target_id,
      moveData,
    })

    results.push({
      broken_tenant_id: item.broken_tenant_id,
      owner_target_id: item.owner_target_id,
      applied: true,
      data_move: dataMoveResult,
    })
  }

  console.log(
    JSON.stringify(
      {
        ...summary,
        results,
      },
      null,
      2,
    ),
  )
}

async function moveDataCommand(supabase) {
  const apply = hasFlag("--apply")
  const fromTenantId = getArg("--from-tenant")
  const toTenantId = getArg("--to-tenant")

  if (!fromTenantId || !toTenantId) {
    throw new Error("Debes indicar --from-tenant y --to-tenant")
  }
  if (fromTenantId === toTenantId) {
    throw new Error("--from-tenant y --to-tenant no pueden ser iguales")
  }

  const byTable = await moveDataBetweenTenants({
    supabase,
    fromTenantId,
    toTenantId,
    apply,
  })

  const response = {
    generated_at: new Date().toISOString(),
    apply,
    from_tenant: fromTenantId,
    to_tenant: toTenantId,
    by_table: byTable,
  }

  console.log(JSON.stringify(response, null, 2))
  if (!apply) {
    console.log("")
    console.log("Dry-run. Para ejecutar cambios:")
    console.log(`  node scripts/tenant-recovery.js move-data --from-tenant ${fromTenantId} --to-tenant ${toTenantId} --apply`)
  }
}

async function main() {
  const command = parseCommand()
  if (!command) {
    printUsage()
    process.exitCode = 1
    return
  }

  try {
    const supabase = await createSupabaseFromEnv()
    if (command === "verify") {
      await verifyCommand(supabase)
      return
    }
    if (command === "repair") {
      await repairCommand(supabase)
      return
    }
    if (command === "move-data") {
      await moveDataCommand(supabase)
      return
    }
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
