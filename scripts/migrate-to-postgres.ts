#!/usr/bin/env tsx
/**
 * Script de Migración: JSON Local → PostgreSQL
 *
 * Este script migra todos los datos del sistema actual (.localdb.json)
 * a PostgreSQL manteniendo la integridad referencial.
 *
 * Uso:
 *   export DATABASE_URL="postgresql://user:pass@host:5432/db"
 *   npx tsx scripts/migrate-to-postgres.ts
 *
 * Flags opcionales:
 *   --dry-run    Solo muestra qué se migrará sin ejecutar
 *   --skip-hash  No hashea passwords (útil para dev)
 */

import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

// Configuración
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_HASH = process.argv.includes('--skip-hash')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Tipos
interface MigrationResult {
  tabla: string
  migratedCount: number
  skippedCount: number
  errors: string[]
}

const results: MigrationResult[] = []

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

type UsernameContext = {
  usernameById: Map<string, string>
  resolveUserUsername: (user: any) => string
  resolveCreadoPorUsername: (value: any, fallbackUserId?: string | null) => string
  defaultUsername: string
}

const normalizeUsernameValue = (value: any) => {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (text.includes('@')) return text.split('@')[0] || text
  return text
}

const buildUsernameContext = (users: any[] = []): UsernameContext => {
  const used = new Set<string>()
  const usernameById = new Map<string, string>()

  const registerUnique = (candidate: string) => {
    const base = candidate.trim() || 'user'
    let next = base
    let counter = 1
    while (used.has(next.toLowerCase())) {
      next = `${base}-${counter}`
      counter += 1
    }
    used.add(next.toLowerCase())
    return next
  }

  const resolveUserUsername = (user: any) => {
    if (user?.id) {
      const existing = usernameById.get(String(user.id))
      if (existing) return existing
    }
    const base = normalizeUsernameValue(user?.username ?? user?.email)
    const fallback = user?.id ? `user_${String(user.id).slice(0, 8)}` : 'user'
    const username = registerUnique(base || fallback)
    if (user?.id) usernameById.set(String(user.id), username)
    return username
  }

  users.forEach((user) => resolveUserUsername(user))

  const defaultUsername =
    (users[0] && usernameById.get(String(users[0].id))) || usernameById.get('local-user') || 'admin'

  const resolveCreadoPorUsername = (value: any, fallbackUserId?: string | null) => {
    const explicit = normalizeUsernameValue(value)
    if (explicit) return explicit
    if (fallbackUserId) {
      const mapped = usernameById.get(String(fallbackUserId))
      if (mapped) return mapped
    }
    return defaultUsername
  }

  return { usernameById, resolveUserUsername, resolveCreadoPorUsername, defaultUsername }
}

const safeIsoDate = (value: any, fallback = new Date().toISOString()) => {
  if (!value) return fallback
  const parsed = new Date(String(value))
  if (!Number.isFinite(parsed.getTime())) return fallback
  return parsed.toISOString()
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Leer datos del JSON actual
function loadLocalData(): any {
  const dbFilePath = process.env.LOCALDB_FILE || path.join(process.cwd(), '.localdb.json')

  if (!fs.existsSync(dbFilePath)) {
    log(`✗ Archivo no encontrado: ${dbFilePath}`, 'red')
    log('  Creá el archivo o especificá LOCALDB_FILE en las variables de entorno', 'yellow')
    process.exit(1)
  }

  try {
    const raw = fs.readFileSync(dbFilePath, 'utf8')
    if (!raw.trim()) {
      log('✗ El archivo está vacío', 'red')
      process.exit(1)
    }

    const data = JSON.parse(raw)
    log(`✓ Datos cargados desde ${dbFilePath}`, 'green')
    return data
  } catch (error) {
    log(`✗ Error al leer el archivo JSON: ${error}`, 'red')
    process.exit(1)
  }
}

// Hashear password (placeholder - requiere bcrypt)
async function hashPassword(password: string): Promise<string> {
  if (SKIP_HASH) {
    return password
  }

  try {
    const bcrypt = await import('bcrypt')
    return bcrypt.hashSync(password, 10)
  } catch {
    log('⚠ bcrypt no instalado, usando passwords sin hashear', 'yellow')
    log('  Instala bcrypt: npm install bcrypt', 'yellow')
    return password
  }
}

// Ejecutar query con manejo de errores
async function safeQuery(sql: string, params: any[], errorContext: string) {
  if (DRY_RUN) {
    log(`  [DRY-RUN] ${errorContext}`, 'cyan')
    return { success: true, error: null }
  }

  try {
    await pool.query(sql, params)
    return { success: true, error: null }
  } catch (error: any) {
    // Ignorar duplicados (ON CONFLICT)
    if (error.code === '23505') {
      return { success: false, error: 'duplicate' }
    }
    return { success: false, error: error.message }
  }
}

// Migraciones por tabla
async function migrateUsuarios(data: any, usernameContext: UsernameContext): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'usuarios', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Usuarios ===', 'blue')

  for (const user of data.usuarios || []) {
    const passwordHash = user.password ? await hashPassword(user.password) : null
    const username = usernameContext.resolveUserUsername(user)

    const { success, error } = await safeQuery(
      `INSERT INTO usuarios (
        id, username, password_hash, rol, tenant_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [
        user.id,
        username,
        passwordHash,
        user.rol,
        user.tenant_id,
        user.created_at || new Date().toISOString(),
        user.updated_at || new Date().toISOString(),
      ],
      `Usuario: ${username}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${username}: ${error}`)
  }

  log(`✓ ${result.migratedCount} usuarios migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) {
    log(`✗ ${result.errors.length} errores`, 'red')
  }

  return result
}

async function migrateConfiguracion(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'configuracion', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Configuración ===', 'blue')

  const sourceConfigs = Array.isArray(data.configuracion) && data.configuracion.length > 0
    ? data.configuracion
    : (data.usuarios || []).map((user: any) => ({
        usuario_id: user.tenant_id || user.id,
        horario_local: Array.isArray(user.horario_local) ? user.horario_local : [],
        nombre_local: user.nombre_local || null,
        direccion: user.direccion || null,
        telefono: user.telefono || null,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: user.updated_at || new Date().toISOString(),
      }))

  const seenTenantIds = new Set<string>()
  for (const config of sourceConfigs) {
    const usuarioId = String(config?.usuario_id || '').trim()
    if (!usuarioId) {
      result.skippedCount++
      continue
    }
    if (seenTenantIds.has(usuarioId)) {
      result.skippedCount++
      continue
    }
    seenTenantIds.add(usuarioId)

    const { success, error } = await safeQuery(
      `INSERT INTO configuracion (
        id, usuario_id, horario_local, nombre_local, direccion, telefono, created_at, updated_at
      )
      VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2, $3::jsonb, $4, $5, $6, $7, $8)
      ON CONFLICT (usuario_id) DO UPDATE SET
        horario_local = EXCLUDED.horario_local,
        nombre_local = COALESCE(EXCLUDED.nombre_local, configuracion.nombre_local),
        direccion = COALESCE(EXCLUDED.direccion, configuracion.direccion),
        telefono = COALESCE(EXCLUDED.telefono, configuracion.telefono),
        updated_at = EXCLUDED.updated_at`,
      [
        config.id || null,
        usuarioId,
        JSON.stringify(config.horario_local || []),
        config.nombre_local || null,
        config.direccion || null,
        config.telefono || null,
        config.created_at || new Date().toISOString(),
        config.updated_at || new Date().toISOString(),
      ],
      `Configuración tenant: ${usuarioId}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${usuarioId}: ${error}`)
  }

  log(`✓ ${result.migratedCount} configuraciones migradas, ${result.skippedCount} omitidas`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateClientes(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'clientes', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Clientes ===', 'blue')

  for (const cliente of data.clientes || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO clientes (
        id, usuario_id, nombre, apellido, telefono, observaciones,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        cliente.id,
        cliente.usuario_id,
        cliente.nombre,
        cliente.apellido,
        cliente.telefono,
        cliente.observaciones,
        cliente.created_at || new Date().toISOString(),
        cliente.updated_at || new Date().toISOString(),
      ],
      `Cliente: ${cliente.nombre} ${cliente.apellido}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${cliente.nombre}: ${error}`)
  }

  log(`✓ ${result.migratedCount} clientes migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateEmpleadas(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'empleadas', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Empleadas ===', 'blue')

  for (const empleada of data.empleadas || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO empleadas (
        id, usuario_id, nombre, apellido, telefono, activo,
        horarios, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        empleada.id,
        empleada.usuario_id,
        empleada.nombre,
        empleada.apellido,
        empleada.telefono,
        empleada.activo ?? true,
        JSON.stringify(empleada.horarios || []),
        empleada.created_at || new Date().toISOString(),
        empleada.updated_at || new Date().toISOString(),
      ],
      `Empleada: ${empleada.nombre}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${empleada.nombre}: ${error}`)
  }

  log(`✓ ${result.migratedCount} empleadas migradas, ${result.skippedCount} duplicadas`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateCategorias(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'categorias', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Categorías ===', 'blue')

  for (const categoria of data.categorias || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO categorias (
        id, usuario_id, nombre, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING`,
      [
        categoria.id,
        categoria.usuario_id,
        categoria.nombre,
        categoria.created_at || new Date().toISOString(),
        categoria.updated_at || new Date().toISOString(),
      ],
      `Categoría: ${categoria.nombre}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${categoria.nombre}: ${error}`)
  }

  log(`✓ ${result.migratedCount} categorías migradas, ${result.skippedCount} duplicadas`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateRecursos(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'recursos', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Recursos ===', 'blue')

  for (const recurso of data.recursos || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO recursos (
        id, usuario_id, nombre, cantidad_disponible, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING`,
      [
        recurso.id,
        recurso.usuario_id,
        recurso.nombre,
        recurso.cantidad_disponible || 1,
        recurso.created_at || new Date().toISOString(),
        recurso.updated_at || new Date().toISOString(),
      ],
      `Recurso: ${recurso.nombre}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${recurso.nombre}: ${error}`)
  }

  log(`✓ ${result.migratedCount} recursos migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateTurnoGrupos(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'turno_grupos', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Grupos de Turnos ===', 'blue')

  for (const grupo of data.turno_grupos || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO turno_grupos (
        id, usuario_id, cliente_id, fecha_inicio, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING`,
      [
        grupo.id,
        grupo.usuario_id,
        grupo.cliente_id,
        grupo.fecha_inicio,
        grupo.created_at || new Date().toISOString(),
        grupo.updated_at || new Date().toISOString(),
      ],
      `Grupo: ${grupo.id?.substring?.(0, 8) || grupo.id}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${grupo.id}: ${error}`)
  }

  log(`✓ ${result.migratedCount} grupos migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateServicios(data: any): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'servicios', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Servicios ===', 'blue')

  for (const servicio of data.servicios || []) {
    const { success, error } = await safeQuery(
      `INSERT INTO servicios (
        id, usuario_id, nombre, precio, precio_lista, precio_descuento, duracion_minutos, activo, categoria,
        categoria_id, recurso_id, comision_pct, comision_monto_fijo, empleadas_habilitadas, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO NOTHING`,
      [
        servicio.id,
        servicio.usuario_id,
        servicio.nombre,
        servicio.precio_lista ?? servicio.precio ?? 0,
        servicio.precio_lista ?? servicio.precio ?? 0,
        servicio.precio_descuento ?? null,
        servicio.duracion_minutos,
        servicio.activo ?? true,
        servicio.categoria || servicio.tipo || 'principal',
        servicio.categoria_id || null,
        servicio.recurso_id || null,
        servicio.comision_pct,
        servicio.comision_monto_fijo,
        JSON.stringify(servicio.empleadas_habilitadas || []),
        servicio.created_at || new Date().toISOString(),
        servicio.updated_at || new Date().toISOString(),
      ],
      `Servicio: ${servicio.nombre}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`${servicio.nombre}: ${error}`)
  }

  log(`✓ ${result.migratedCount} servicios migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateTurnos(data: any, usernameContext: UsernameContext): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'turnos', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Turnos ===', 'blue')

  for (const turno of data.turnos || []) {
    const creadoPorId = turno.creado_por || turno.usuario_id
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      turno.creado_por_username ?? turno.creado_por_email,
      creadoPorId,
    )

    const { success, error } = await safeQuery(
      `INSERT INTO turnos (
        id, usuario_id, cliente_id,
        servicio_id, servicio_final_id,
        empleada_id, empleada_final_id,
        empleada_final_nombre, empleada_final_apellido,
        fecha_inicio, fecha_fin, duracion_minutos,
        estado, asistio, observaciones,
        confirmacion_estado, token_confirmacion, confirmado_en,
        iniciado_en, iniciado_por, finalizado_en, cerrado_por,
        minutos_tarde, penalidad_monto, penalidad_motivo,
        creado_por, creado_por_username, actualizado_por,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29, $30
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        turno.id,
        turno.usuario_id,
        turno.cliente_id,
        turno.servicio_id,
        turno.servicio_final_id,
        turno.empleada_id,
        turno.empleada_final_id,
        turno.empleada_final_nombre,
        turno.empleada_final_apellido,
        turno.fecha_inicio,
        turno.fecha_fin,
        turno.duracion_minutos,
        turno.estado,
        turno.asistio,
        turno.observaciones,
        turno.confirmacion_estado || 'no_enviada',
        turno.token_confirmacion,
        turno.confirmado_en,
        turno.iniciado_en,
        turno.iniciado_por,
        turno.finalizado_en,
        turno.cerrado_por,
        turno.minutos_tarde,
        turno.penalidad_monto,
        turno.penalidad_motivo,
        creadoPorId,
        creadoPorUsername,
        turno.actualizado_por,
        turno.created_at || new Date().toISOString(),
        turno.updated_at || new Date().toISOString(),
      ],
      `Turno: ${turno.id.substring(0, 8)}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`Turno ${turno.id}: ${error}`)
  }

  log(`✓ ${result.migratedCount} turnos migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateSenas(data: any, usernameContext: UsernameContext): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'senas', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Señas ===', 'blue')

  for (const sena of data.senas || []) {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      sena.creado_por_username ?? sena.creado_por_email,
      sena.usuario_id,
    )
    const { success, error } = await safeQuery(
      `INSERT INTO senas (
        id, usuario_id, cliente_id, turno_id, monto, metodo_pago,
        estado, nota, fecha_pago, aplicada_en, aplicada_por,
        creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING`,
      [
        sena.id,
        sena.usuario_id,
        sena.cliente_id,
        sena.turno_id,
        sena.monto,
        sena.metodo_pago,
        sena.estado || 'pendiente',
        sena.nota,
        sena.fecha_pago,
        sena.aplicada_en,
        sena.aplicada_por,
        creadoPorUsername,
        sena.created_at || new Date().toISOString(),
        sena.updated_at || new Date().toISOString(),
      ],
      `Seña: ${sena.id.substring(0, 8)}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`Seña ${sena.id}: ${error}`)
  }

  log(`✓ ${result.migratedCount} señas migradas, ${result.skippedCount} duplicadas`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migratePagos(data: any, usernameContext: UsernameContext): Promise<MigrationResult> {
  const result: MigrationResult = { tabla: 'pagos', migratedCount: 0, skippedCount: 0, errors: [] }

  log('\n=== Migrando Pagos ===', 'blue')

  for (const pago of data.pagos || []) {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      pago.creado_por_username ?? pago.creado_por_email,
      pago.usuario_id,
    )
    const { success, error } = await safeQuery(
      `INSERT INTO pagos (
        id, usuario_id, turno_id, monto, metodo_pago, estado,
        fecha_pago, sena_aplicada_id, monto_sena_aplicada,
        creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        pago.id,
        pago.usuario_id,
        pago.turno_id,
        pago.monto,
        pago.metodo_pago,
        pago.estado || 'completado',
        pago.fecha_pago,
        pago.sena_aplicada_id,
        pago.monto_sena_aplicada || 0,
        creadoPorUsername,
        pago.created_at || new Date().toISOString(),
      ],
      `Pago: ${pago.id.substring(0, 8)}`
    )

    if (success) result.migratedCount++
    else if (error === 'duplicate') result.skippedCount++
    else result.errors.push(`Pago ${pago.id}: ${error}`)
  }

  log(`✓ ${result.migratedCount} pagos migrados, ${result.skippedCount} duplicados`, 'green')
  if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')

  return result
}

async function migrateOtrasTablas(data: any, usernameContext: UsernameContext): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []
  const migrateTableRows = async (
    tabla: string,
    rows: any[],
    buildInsert: (row: any) => { sql: string; params: any[]; label: string },
  ) => {
    const result: MigrationResult = { tabla, migratedCount: 0, skippedCount: 0, errors: [] }
    log(`\n=== Migrando ${tabla} ===`, 'blue')

    for (const row of rows || []) {
      const { sql, params, label } = buildInsert(row)
      const { success, error } = await safeQuery(sql, params, label)
      if (success) result.migratedCount++
      else if (error === 'duplicate') result.skippedCount++
      else result.errors.push(`${label}: ${error}`)
    }

    log(`✓ ${result.migratedCount} ${tabla} migrados, ${result.skippedCount} duplicados`, 'green')
    if (result.errors.length > 0) log(`✗ ${result.errors.length} errores`, 'red')
    results.push(result)
  }

  await migrateTableRows('adelantos', data.adelantos || [], (adelanto: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      adelanto.creado_por_username ?? adelanto.creado_por_email,
      adelanto.usuario_id,
    )
    return {
      sql: `INSERT INTO adelantos (
        id, usuario_id, empleada_id, monto, motivo, fecha_entrega, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        adelanto.id,
        adelanto.usuario_id,
        adelanto.empleada_id,
        adelanto.monto,
        adelanto.motivo,
        adelanto.fecha_entrega,
        creadoPorUsername,
        adelanto.created_at || new Date().toISOString(),
      ],
      label: `Adelanto ${adelanto.id?.substring?.(0, 8) || adelanto.id}`,
    }
  })

  await migrateTableRows('pagos_grupos', data.pagos_grupos || [], (pagoGrupo: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      pagoGrupo.creado_por_username ?? pagoGrupo.creado_por_email,
      pagoGrupo.usuario_id,
    )
    return {
      sql: `INSERT INTO pagos_grupos (
        id, usuario_id, turno_grupo_id, cliente_id, monto, metodo_pago, estado, fecha_pago,
        sena_aplicada_id, monto_sena_aplicada, giftcard_aplicada_id, monto_giftcard_aplicado,
        penalidad_monto, observaciones, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        pagoGrupo.id,
        pagoGrupo.usuario_id,
        pagoGrupo.turno_grupo_id,
        pagoGrupo.cliente_id,
        pagoGrupo.monto,
        pagoGrupo.metodo_pago,
        pagoGrupo.estado || 'completado',
        pagoGrupo.fecha_pago,
        pagoGrupo.sena_aplicada_id || null,
        pagoGrupo.monto_sena_aplicada || 0,
        pagoGrupo.giftcard_aplicada_id || null,
        pagoGrupo.monto_giftcard_aplicado || 0,
        pagoGrupo.penalidad_monto || null,
        pagoGrupo.observaciones || null,
        creadoPorUsername,
        pagoGrupo.created_at || new Date().toISOString(),
      ],
      label: `Pago grupo ${pagoGrupo.id?.substring?.(0, 8) || pagoGrupo.id}`,
    }
  })

  await migrateTableRows('pago_grupo_items', data.pago_grupo_items || [], (item: any) => ({
    sql: `INSERT INTO pago_grupo_items (
      id, pago_grupo_id, turno_id, monto_asignado
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING`,
    params: [item.id, item.pago_grupo_id, item.turno_id, item.monto_asignado],
    label: `Pago grupo item ${item.id?.substring?.(0, 8) || item.id}`,
  }))

  await migrateTableRows('giftcards', data.giftcards || [], (giftcard: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      giftcard.creado_por_username ?? giftcard.creado_por_email,
      giftcard.usuario_id,
    )
    return {
      sql: `INSERT INTO giftcards (
        id, usuario_id, numero, cliente_id, servicio_ids, valido_por_dias, valido_hasta, de_parte_de,
        monto_total, metodo_pago, facturado, estado, usada_en, usada_en_turno_id, imagen_base64,
        imagen_storage_bucket, imagen_storage_path, creado_por, creado_por_username, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (id) DO NOTHING`,
      params: [
        giftcard.id,
        giftcard.usuario_id,
        giftcard.numero,
        giftcard.cliente_id,
        JSON.stringify(giftcard.servicio_ids || []),
        giftcard.valido_por_dias,
        giftcard.valido_hasta || null,
        giftcard.de_parte_de || null,
        giftcard.monto_total,
        giftcard.metodo_pago,
        giftcard.facturado ?? false,
        giftcard.estado || 'vigente',
        giftcard.usada_en || null,
        giftcard.usada_en_turno_id || null,
        giftcard.imagen_base64 || null,
        giftcard.imagen_storage_bucket || null,
        giftcard.imagen_storage_path || null,
        giftcard.creado_por || null,
        creadoPorUsername,
        giftcard.created_at || new Date().toISOString(),
        giftcard.updated_at || new Date().toISOString(),
      ],
      label: `Giftcard ${giftcard.id?.substring?.(0, 8) || giftcard.id}`,
    }
  })

  await migrateTableRows('caja_movimientos', data.caja_movimientos || [], (movimiento: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      movimiento.creado_por_username ?? movimiento.creado_por_email,
      movimiento.usuario_id,
    )
    return {
      sql: `INSERT INTO caja_movimientos (
        id, usuario_id, medio_pago, tipo, monto, motivo, source_tipo, source_id,
        creado_por, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        movimiento.id,
        movimiento.usuario_id,
        movimiento.medio_pago,
        movimiento.tipo,
        movimiento.monto,
        movimiento.motivo,
        movimiento.source_tipo || null,
        movimiento.source_id || null,
        movimiento.creado_por || movimiento.usuario_id,
        creadoPorUsername,
        movimiento.created_at || new Date().toISOString(),
      ],
      label: `Caja mov ${movimiento.id?.substring?.(0, 8) || movimiento.id}`,
    }
  })

  await migrateTableRows('insumos', data.insumos || [], (insumo: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      insumo.creado_por_username ?? insumo.creado_por_email,
      insumo.usuario_id,
    )
    return {
      sql: `INSERT INTO insumos (
        id, usuario_id, nombre, stock_actual, stock_minimo, activo, creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        insumo.id,
        insumo.usuario_id,
        insumo.nombre,
        insumo.stock_actual ?? 0,
        insumo.stock_minimo ?? 0,
        insumo.activo ?? true,
        creadoPorUsername,
        insumo.created_at || new Date().toISOString(),
        insumo.updated_at || new Date().toISOString(),
      ],
      label: `Insumo ${insumo.id?.substring?.(0, 8) || insumo.id}`,
    }
  })

  await migrateTableRows('insumo_movimientos', data.insumo_movimientos || [], (movimiento: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      movimiento.creado_por_username ?? movimiento.creado_por_email,
      movimiento.usuario_id,
    )
    return {
      sql: `INSERT INTO insumo_movimientos (
        id, usuario_id, insumo_id, empleado_id, tipo, cantidad, nota, creado_por, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        movimiento.id,
        movimiento.usuario_id,
        movimiento.insumo_id,
        movimiento.empleado_id || null,
        movimiento.tipo,
        movimiento.cantidad,
        movimiento.nota || null,
        movimiento.creado_por || movimiento.usuario_id,
        creadoPorUsername,
        movimiento.created_at || new Date().toISOString(),
      ],
      label: `Insumo mov ${movimiento.id?.substring?.(0, 8) || movimiento.id}`,
    }
  })

  await migrateTableRows('productos', data.productos || [], (producto: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      producto.creado_por_username ?? producto.creado_por_email,
      producto.usuario_id,
    )
    return {
      sql: `INSERT INTO productos (
        id, usuario_id, nombre, descripcion, stock_actual, stock_minimo, precio_lista, precio_descuento,
        activo, comision_pct, comision_monto_fijo, creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        producto.id,
        producto.usuario_id,
        producto.nombre,
        producto.descripcion || null,
        producto.stock_actual ?? 0,
        producto.stock_minimo ?? 0,
        producto.precio_lista ?? producto.precio_venta ?? 0,
        producto.precio_descuento ?? null,
        producto.activo ?? true,
        producto.comision_pct ?? null,
        producto.comision_monto_fijo ?? null,
        creadoPorUsername,
        producto.created_at || new Date().toISOString(),
        producto.updated_at || new Date().toISOString(),
      ],
      label: `Producto ${producto.id?.substring?.(0, 8) || producto.id}`,
    }
  })

  await migrateTableRows('producto_movimientos', data.producto_movimientos || [], (movimiento: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      movimiento.creado_por_username ?? movimiento.creado_por_email,
      movimiento.usuario_id,
    )
    return {
      sql: `INSERT INTO producto_movimientos (
        id, usuario_id, producto_id, cliente_id, empleada_id, tipo, cantidad, costo_unitario, precio_unitario,
        metodo_pago, nota, creado_por, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        movimiento.id,
        movimiento.usuario_id,
        movimiento.producto_id,
        movimiento.cliente_id || null,
        movimiento.empleada_id || null,
        movimiento.tipo,
        movimiento.cantidad,
        movimiento.costo_unitario ?? null,
        movimiento.precio_unitario ?? null,
        movimiento.metodo_pago || null,
        movimiento.nota || null,
        movimiento.creado_por || movimiento.usuario_id,
        creadoPorUsername,
        movimiento.created_at || new Date().toISOString(),
      ],
      label: `Producto mov ${movimiento.id?.substring?.(0, 8) || movimiento.id}`,
    }
  })

  await migrateTableRows('producto_compras', data.producto_compras || [], (compra: any) => {
    const creadoPorUsername = usernameContext.resolveCreadoPorUsername(
      compra.creado_por_username ?? compra.creado_por_email,
      compra.usuario_id,
    )
    return {
      sql: `INSERT INTO producto_compras (
        id, usuario_id, producto_id, cantidad, costo_unitario, nota, creado_por, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        compra.id,
        compra.usuario_id,
        compra.producto_id,
        compra.cantidad,
        compra.costo_unitario,
        compra.nota || null,
        compra.creado_por || compra.usuario_id,
        creadoPorUsername,
        compra.created_at || new Date().toISOString(),
      ],
      label: `Producto compra ${compra.id?.substring?.(0, 8) || compra.id}`,
    }
  })

  await migrateTableRows('facturas', data.facturas || [], (factura: any) => {
    const createdAt = factura.created_at || new Date().toISOString()
    return {
      sql: `INSERT INTO facturas (
        id, usuario_id, tipo, estado, factura_relacionada_id, nota_credito_id, origen_tipo, origen_id, cliente_id,
        cliente_nombre, cliente_apellido, metodo_pago, total, fecha, punto_venta, numero, cbte_tipo, cae, cae_vto,
        items, descuento_sena, pdf_base64, pdf_storage_bucket, pdf_storage_path, pdf_filename, nota, retry_payload,
        retry_intentos, retry_ultimo_error, retry_ultimo_intento, retry_proximo_intento, creado_por,
        creado_por_username, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb,
        $21, $22, $23, $24, $25, $26, $27::jsonb, $28, $29, $30, $31, $32, $33, $34, $35
      )
      ON CONFLICT (id) DO NOTHING`,
      params: [
        factura.id,
        factura.usuario_id,
        factura.tipo || 'factura',
        factura.estado || 'emitida',
        factura.factura_relacionada_id || null,
        factura.nota_credito_id || null,
        factura.origen_tipo || null,
        factura.origen_id || null,
        factura.cliente_id || null,
        factura.cliente_nombre || null,
        factura.cliente_apellido || null,
        factura.metodo_pago || null,
        factura.total ?? 0,
        factura.fecha || null,
        factura.punto_venta ?? null,
        factura.numero ?? null,
        factura.cbte_tipo ?? null,
        factura.cae || null,
        factura.cae_vto || null,
        JSON.stringify(factura.items || []),
        factura.descuento_sena ?? null,
        factura.pdf_base64 || null,
        factura.pdf_storage_bucket || null,
        factura.pdf_storage_path || null,
        factura.pdf_filename || null,
        factura.nota || null,
        JSON.stringify(factura.retry_payload || null),
        factura.retry_intentos ?? 0,
        factura.retry_ultimo_error || null,
        factura.retry_ultimo_intento || null,
        factura.retry_proximo_intento || null,
        factura.creado_por || null,
        usernameContext.resolveCreadoPorUsername(
          factura.creado_por_username ?? factura.creado_por_email,
          factura.usuario_id,
        ),
        createdAt,
        factura.updated_at || createdAt,
      ],
      label: `Factura ${factura.id?.substring?.(0, 8) || factura.id}`,
    }
  })

  await migrateTableRows('servicio_empleada_comisiones', data.servicio_empleada_comisiones || [], (item: any) => ({
    sql: `INSERT INTO servicio_empleada_comisiones (
      usuario_id, servicio_id, empleada_id, comision_pct, comision_monto_fijo
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (servicio_id, empleada_id) DO NOTHING`,
    params: [item.usuario_id, item.servicio_id, item.empleada_id, item.comision_pct ?? null, item.comision_monto_fijo ?? null],
    label: `Servicio comision ${item.servicio_id}/${item.empleada_id}`,
  }))

  await migrateTableRows('producto_empleada_comisiones', data.producto_empleada_comisiones || [], (item: any) => ({
    sql: `INSERT INTO producto_empleada_comisiones (
      usuario_id, producto_id, empleada_id, comision_pct, comision_monto_fijo
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (producto_id, empleada_id) DO NOTHING`,
    params: [item.usuario_id, item.producto_id, item.empleada_id, item.comision_pct ?? null, item.comision_monto_fijo ?? null],
    label: `Producto comision ${item.producto_id}/${item.empleada_id}`,
  }))

  await migrateTableRows('recordatorios', data.recordatorios || [], (recordatorio: any) => ({
    sql: `INSERT INTO recordatorios (
      id, usuario_id, turno_id, cliente_telefono, estado, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING`,
    params: [
      recordatorio.id,
      recordatorio.usuario_id,
      recordatorio.turno_id,
      recordatorio.cliente_telefono,
      recordatorio.estado || 'pendiente',
      recordatorio.created_at || new Date().toISOString(),
    ],
    label: `Recordatorio ${recordatorio.id?.substring?.(0, 8) || recordatorio.id}`,
  }))

  await migrateTableRows('confirmation_tokens', data.confirmation_tokens || [], (token: any) => {
    const createdAt = safeIsoDate(token.created_at || token.creado_at)
    const expiresAt = safeIsoDate(
      token.expires_at,
      new Date(new Date(createdAt).getTime() + 48 * 60 * 60 * 1000).toISOString(),
    )
    const confirmedAt = token.confirmado_at || token.confirmed_at || null
    return {
      sql: `INSERT INTO confirmation_tokens (
        id, usuario_id, turno_id, token, estado, expires_at, confirmado_at, confirmed_at, creado_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      params: [
        token.id,
        token.usuario_id,
        token.turno_id,
        token.token,
        token.estado || 'pendiente',
        expiresAt,
        confirmedAt,
        token.confirmed_at || confirmedAt,
        safeIsoDate(token.creado_at, createdAt),
        createdAt,
      ],
      label: `Confirmation token ${token.id?.substring?.(0, 8) || token.id}`,
    }
  })

  await migrateTableRows('share_links', data.share_links || [], (shareLink: any) => ({
    sql: `INSERT INTO share_links (
      id, usuario_id, token, tipo, resource_id, filename, mime_type, data_base64,
      data_storage_bucket, data_storage_path, created_at, expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO NOTHING`,
    params: [
      shareLink.id,
      shareLink.usuario_id,
      shareLink.token,
      shareLink.tipo,
      shareLink.resource_id || null,
      shareLink.filename || null,
      shareLink.mime_type || null,
      shareLink.data_base64 || null,
      shareLink.data_storage_bucket || null,
      shareLink.data_storage_path || null,
      shareLink.created_at || new Date().toISOString(),
      shareLink.expires_at || null,
    ],
    label: `Share link ${shareLink.id?.substring?.(0, 8) || shareLink.id}`,
  }))

  await migrateTableRows('empleada_ausencias', data.empleada_ausencias || [], (ausencia: any) => ({
    sql: `INSERT INTO empleada_ausencias (
      id, usuario_id, empleada_id, fecha_desde, fecha_hasta, hora_desde, hora_hasta,
      motivo, descripcion, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO NOTHING`,
    params: [
      ausencia.id,
      ausencia.usuario_id,
      ausencia.empleada_id,
      ausencia.fecha_desde,
      ausencia.fecha_hasta,
      ausencia.hora_desde || null,
      ausencia.hora_hasta || null,
      ausencia.motivo || 'otro',
      ausencia.descripcion || null,
      ausencia.created_at || new Date().toISOString(),
      ausencia.updated_at || new Date().toISOString(),
    ],
    label: `Ausencia ${ausencia.id?.substring?.(0, 8) || ausencia.id}`,
  }))

  await migrateTableRows('metodos_pago_config', data.metodos_pago_config || [], (metodo: any) => ({
    sql: `INSERT INTO metodos_pago_config (nombre, activo, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (nombre) DO UPDATE SET activo = EXCLUDED.activo`,
    params: [metodo.nombre, metodo.activo ?? true, metodo.created_at || new Date().toISOString()],
    label: `Metodo ${metodo.nombre}`,
  }))

  return results
}

// Función principal
async function main() {
  log('==========================================', 'cyan')
  log('   MIGRACIÓN: JSON → PostgreSQL', 'cyan')
  log('==========================================', 'cyan')

  if (DRY_RUN) {
    log('\n⚠ MODO DRY-RUN: No se realizarán cambios', 'yellow')
  }

  // Verificar conexión
  try {
    await pool.query('SELECT 1')
    log('✓ Conexión a PostgreSQL exitosa', 'green')
  } catch (error) {
    log(`✗ Error conectando a PostgreSQL: ${error}`, 'red')
    log('  Verifica DATABASE_URL en las variables de entorno', 'yellow')
    process.exit(1)
  }

  // Cargar datos
  const localData = loadLocalData()
  const usernameContext = buildUsernameContext(localData.usuarios || [])

  // Mostrar resumen
  log('\nDatos a migrar:', 'cyan')
  Object.keys(localData).forEach((key) => {
    const count = Array.isArray(localData[key]) ? localData[key].length : 'N/A'
    log(`  ${key}: ${count}`)
  })

  if (DRY_RUN) {
    log('\n✓ Dry-run completado. Ejecuta sin --dry-run para migrar.', 'green')
    process.exit(0)
  }

  // Ejecutar migraciones (orden importante por FK)
  try {
    results.push(await migrateUsuarios(localData, usernameContext))
    results.push(await migrateConfiguracion(localData))
    results.push(await migrateClientes(localData))
    results.push(await migrateEmpleadas(localData))
    results.push(await migrateCategorias(localData))
    results.push(await migrateRecursos(localData))
    results.push(await migrateServicios(localData))
    results.push(await migrateTurnoGrupos(localData))
    results.push(await migrateTurnos(localData, usernameContext))
    results.push(await migrateSenas(localData, usernameContext))
    results.push(await migratePagos(localData, usernameContext))
    results.push(...(await migrateOtrasTablas(localData, usernameContext)))

    // Resumen final
    log('\n==========================================', 'cyan')
    log('✓ MIGRACIÓN COMPLETADA', 'green')
    log('==========================================', 'cyan')

    log('\nResumen:', 'cyan')
    results.forEach((r) => {
      log(`  ${r.tabla}: ${r.migratedCount} migrados, ${r.skippedCount} duplicados, ${r.errors.length} errores`)
      if (r.errors.length > 0) {
        r.errors.forEach((err) => log(`    - ${err}`, 'red'))
      }
    })

    // Verificar en la base
    const verification = await pool.query(`
      SELECT 'usuarios' as tabla, COUNT(*) as cantidad FROM usuarios
      UNION ALL SELECT 'configuracion', COUNT(*) FROM configuracion
      UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
      UNION ALL SELECT 'empleadas', COUNT(*) FROM empleadas
      UNION ALL SELECT 'categorias', COUNT(*) FROM categorias
      UNION ALL SELECT 'recursos', COUNT(*) FROM recursos
      UNION ALL SELECT 'servicios', COUNT(*) FROM servicios
      UNION ALL SELECT 'turno_grupos', COUNT(*) FROM turno_grupos
      UNION ALL SELECT 'turnos', COUNT(*) FROM turnos
      UNION ALL SELECT 'senas', COUNT(*) FROM senas
      UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
      UNION ALL SELECT 'pagos_grupos', COUNT(*) FROM pagos_grupos
      UNION ALL SELECT 'productos', COUNT(*) FROM productos
      UNION ALL SELECT 'producto_compras', COUNT(*) FROM producto_compras
      UNION ALL SELECT 'facturas', COUNT(*) FROM facturas
    `)

    log('\nDatos en PostgreSQL:', 'cyan')
    verification.rows.forEach((row) => {
      log(`  ${row.tabla}: ${row.cantidad}`)
    })
  } catch (error) {
    log(`\n✗ ERROR: ${error}`, 'red')
    throw error
  } finally {
    await pool.end()
  }
}

// Ejecutar
if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
