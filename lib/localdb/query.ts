// @ts-nocheck
import { db, generateId, findUserById, getLocalUser, getTable, type TableName } from "./store"
import { persistLocalDb } from "./persist"

type OrderBy = { column: string; ascending: boolean }
type FilterOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "is"
type Filter = { column: string; op: FilterOp; value: any }
type LocalClientContext = { userId: string | null; tenantId: string | null }

const compareValues = (left: any, right: any, op: FilterOp) => {
  if (op === "eq") return left === right
  if (op === "neq") return left !== right
  if (op === "is") return left === right // Para comparar con null
  if (op === "in") {
    if (!Array.isArray(right)) return false
    return right.includes(left)
  }

  if (left === null || left === undefined) return false
  if (right === null || right === undefined) return false

  const leftValue = typeof left === "string" && typeof right === "string" ? left : Number(left)
  const rightValue = typeof left === "string" && typeof right === "string" ? right : Number(right)

  if (op === "lt") return leftValue < rightValue
  if (op === "lte") return leftValue <= rightValue
  if (op === "gt") return leftValue > rightValue
  if (op === "gte") return leftValue >= rightValue

  return false
}

const applyFilters = (rows: any[], filters: Filter[]) => {
  if (!filters.length) return rows
  return rows.filter((row) => filters.every((filter) => compareValues((row as any)[filter.column], filter.value, filter.op)))
}

const applyOrder = (rows: any[], orderBy: OrderBy | null) => {
  if (!orderBy) return rows
  const { column, ascending } = orderBy
  const sorted = [...rows].sort((a, b) => {
    const left = (a as any)[column]
    const right = (b as any)[column]
    if (left === right) return 0
    if (left === undefined || left === null) return 1
    if (right === undefined || right === null) return -1
    return left > right ? 1 : -1
  })
  return ascending ? sorted : sorted.reverse()
}

const attachTurnoRelations = (turno: any) => {
  const cliente = db.clientes.find((c) => c.id === turno.cliente_id) || null
  const servicio = db.servicios.find((s) => s.id === turno.servicio_id) || null
  const servicioFinal =
    db.servicios.find((s) => s.id === (turno.servicio_final_id || turno.servicio_id)) || servicio
  const empleada = db.empleadas.find((e) => e.id === turno.empleada_id) || null
  const empleadaFinal =
    db.empleadas.find((e) => e.id === (turno.empleada_final_id || turno.empleada_id)) || empleada

  return {
    ...turno,
    clientes: cliente,
    servicios: servicio,
    servicio_final: servicioFinal,
    empleadas: empleada,
    empleada_final: empleadaFinal,
  }
}

const attachRelations = (table: TableName, rows: any[]) => {
  if (!rows.length) return rows

  switch (table) {
    case "turnos":
      return rows.map((row) => attachTurnoRelations({ ...row }))
    case "pagos":
      return rows.map((row) => {
        const turno = db.turnos.find((t) => t.id === row.turno_id) || null
        return {
          ...row,
          turnos: turno ? attachTurnoRelations({ ...turno }) : null,
        }
      })
    case "pagos_grupos":
      return rows.map((row) => {
        const grupo = db.turno_grupos.find((g) => g.id === row.turno_grupo_id) || null
        const cliente = db.clientes.find((c) => c.id === row.cliente_id) || null
        return {
          ...row,
          turno_grupos: grupo,
          clientes: cliente,
        }
      })
    case "pago_grupo_items":
      return rows.map((row) => {
        const turno = db.turnos.find((t) => t.id === row.turno_id) || null
        return {
          ...row,
          turnos: turno ? attachTurnoRelations({ ...turno }) : null,
        }
      })
    case "turno_grupos":
      return rows.map((row) => ({
        ...row,
        clientes: db.clientes.find((c) => c.id === row.cliente_id) || null,
      }))
    case "senas":
      return rows.map((row) => ({
        ...row,
        clientes: db.clientes.find((c) => c.id === row.cliente_id) || null,
        servicios: db.servicios.find((s) => s.id === row.servicio_id) || null,
      }))
    case "giftcards":
      return rows.map((row) => {
        const servicioIds = Array.isArray(row.servicio_ids) ? row.servicio_ids : []
        const servicios = servicioIds
          .map((id: string) => db.servicios.find((s) => s.id === id))
          .filter(Boolean)
        return {
          ...row,
          clientes: db.clientes.find((c) => c.id === row.cliente_id) || null,
          servicios,
        }
      })
    case "adelantos":
      return rows.map((row) => ({
        ...row,
        empleadas: db.empleadas.find((e) => e.id === row.empleada_id) || null,
      }))
    case "insumo_movimientos":
      return rows.map((row) => ({
        ...row,
        insumos: db.insumos.find((i) => i.id === row.insumo_id) || null,
        empleadas: db.empleadas.find((e) => e.id === row.empleado_id) || null,
      }))
    case "producto_movimientos":
      return rows.map((row) => ({
        ...row,
        productos: db.productos.find((p) => p.id === row.producto_id) || null,
        clientes: db.clientes.find((c) => c.id === row.cliente_id) || null,
        empleadas: db.empleadas.find((e) => e.id === row.empleada_id) || null,
      }))
    case "producto_compras":
      return rows.map((row) => ({
        ...row,
        productos: db.productos.find((p) => p.id === row.producto_id) || null,
      }))
    case "confirmation_tokens":
      return rows.map((row) => {
        const turno = db.turnos.find((t) => t.id === row.turno_id) || null
        return {
          ...row,
          turnos: turno ? attachTurnoRelations({ ...turno }) : null,
        }
      })
    default:
      return rows
  }
}

const normalizePayload = (payload: any) => {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") return [payload]
  return []
}

type Action = "select" | "insert" | "update" | "delete" | "upsert"

export class LocalQuery {
  private table: TableName
  private action: Action = "select"
  private filters: Filter[] = []
  private orderBy: OrderBy | null = null
  private limitCount: number | null = null
  private rangeStart: number | null = null
  private rangeEnd: number | null = null
  private payload: any = null
  private singleMode: "single" | "maybeSingle" | null = null
  private returning = false
  private onConflict: string | null = null
  private context: LocalClientContext | null

  constructor(table: TableName, context?: LocalClientContext | null) {
    this.table = table
    this.context = context ?? null
  }

  select(_columns?: string) {
    if (this.action === "insert" || this.action === "update" || this.action === "upsert" || this.action === "delete") {
      this.returning = true
      return this
    }
    this.action = "select"
    return this
  }

  insert(payload: any) {
    this.action = "insert"
    this.payload = payload
    return this
  }

  update(payload: any) {
    this.action = "update"
    this.payload = payload
    return this
  }

  delete() {
    this.action = "delete"
    return this
  }

  upsert(payload: any, options?: { onConflict?: string }) {
    this.action = "upsert"
    this.payload = payload
    this.onConflict = options?.onConflict || null
    return this
  }

  private getTenantUserIds() {
    const tenantId = this.context?.tenantId
    if (!tenantId) return null
    const ids =
      db.usuarios
        .filter((user) => (user.tenant_id || user.id) === tenantId)
        .map((user) => user.id) || []
    return ids.length > 0 ? ids : [tenantId]
  }

  private normalizeFilter(filter: Filter): Filter {
    if (filter.column !== "usuario_id") return filter
    const tenantUserIds = this.getTenantUserIds()
    if (!tenantUserIds) return filter
    if (filter.op === "eq" || filter.op === "in") {
      return { column: filter.column, op: "in" as const, value: tenantUserIds }
    }
    return filter
  }

  private applyTenantId(payload: any) {
    if (!payload || typeof payload !== "object") return payload
    if (!this.context?.tenantId) return payload
    if (!("usuario_id" in payload)) return payload
    return { ...payload, usuario_id: this.context.tenantId }
  }

  eq(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "eq", value }))
    return this
  }

  neq(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "neq", value }))
    return this
  }

  lt(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "lt", value }))
    return this
  }

  lte(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "lte", value }))
    return this
  }

  gt(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "gt", value }))
    return this
  }

  gte(column: string, value: any) {
    this.filters.push(this.normalizeFilter({ column, op: "gte", value }))
    return this
  }

  in(column: string, value: any[]) {
    this.filters.push(this.normalizeFilter({ column, op: "in", value }))
    return this
  }

  is(column: string, value: null) {
    this.filters.push({ column, op: "is", value })
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false }
    return this
  }

  limit(count: number) {
    if (Number.isFinite(count) && count > 0) {
      this.limitCount = count
    }
    return this
  }

  range(from: number, to: number) {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return this
    const start = Math.max(0, Math.floor(from))
    const end = Math.max(start, Math.floor(to))
    this.rangeStart = start
    this.rangeEnd = end
    return this
  }

  single() {
    this.singleMode = "single"
    return this
  }

  maybeSingle() {
    this.singleMode = "maybeSingle"
    return this
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private buildReturning(rows: any[]) {
    const withRelations = attachRelations(this.table, rows)
    if (!this.singleMode) {
      return { data: withRelations, error: null }
    }

    if (withRelations.length === 0) {
      if (this.singleMode === "maybeSingle") {
        return { data: null, error: null }
      }
      return { data: null, error: { message: "No rows found" } }
    }

    if (withRelations.length > 1) {
      return { data: null, error: { message: "Multiple rows found" } }
    }

    return { data: withRelations[0], error: null }
  }

  private executeSelect(rows: any[]) {
    const filtered = applyFilters(rows, this.filters)
    const ordered = applyOrder(filtered, this.orderBy)
    let selected = ordered
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      selected = ordered.slice(this.rangeStart, this.rangeEnd + 1)
    } else if (this.limitCount) {
      selected = ordered.slice(0, this.limitCount)
    }
    return this.buildReturning(selected)
  }

  private executeInsert(rows: any[]) {
    const now = new Date().toISOString()
    const payloadRows = normalizePayload(this.payload)
    const inserted = payloadRows.map((row) => {
      const next = this.applyTenantId({ ...row })
      if (!next.id) next.id = generateId()
      if (!next.created_at) next.created_at = now
      if (!next.creado_at) next.creado_at = now
      if (!next.updated_at) next.updated_at = now
      rows.push(next)
      return next
    })
    persistLocalDb(db as any)
    return this.returning ? this.buildReturning(inserted) : { data: null, error: null }
  }

  private executeUpdate(rows: any[]) {
    const payload = this.applyTenantId(this.payload || {})
    const filtered = applyFilters(rows, this.filters)
    const updated = filtered.map((row) => {
      const next = { ...row, ...payload }
      const idx = rows.indexOf(row)
      if (idx >= 0) rows[idx] = next
      return next
    })
    persistLocalDb(db as any)
    return this.returning ? this.buildReturning(updated) : { data: null, error: null }
  }

  private executeUpsert(rows: any[]) {
    const payloadRows = normalizePayload(this.payload).map((row) => this.applyTenantId({ ...row }))
    const conflictKeys = (this.onConflict || "id")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)

    const now = new Date().toISOString()
    const results: any[] = []

    payloadRows.forEach((row) => {
      const match = rows.find((existing) =>
        conflictKeys.every((key) => (existing as any)[key] === (row as any)[key]),
      )
      if (match) {
        const next = { ...match, ...row, updated_at: now }
        const idx = rows.indexOf(match)
        if (idx >= 0) rows[idx] = next
        results.push(next)
      } else {
        const next = { ...row }
        if (!next.id) next.id = generateId()
        if (!next.created_at) next.created_at = now
        if (!next.updated_at) next.updated_at = now
        rows.push(next)
        results.push(next)
      }
    })

    persistLocalDb(db as any)
    return this.returning ? this.buildReturning(results) : { data: null, error: null }
  }

  private executeDelete(rows: any[]) {
    const filtered = applyFilters(rows, this.filters)
    const remaining = rows.filter((row) => !filtered.includes(row))
    rows.length = 0
    rows.push(...remaining)
    persistLocalDb(db as any)
    return this.returning ? this.buildReturning(filtered) : { data: null, error: null }
  }

  async execute() {
    const rows = getTable(this.table) as any[]
    if (!rows) return { data: null, error: { message: "Table not found" } }

    switch (this.action) {
      case "select":
        return this.executeSelect(rows)
      case "insert":
        return this.executeInsert(rows)
      case "update":
        return this.executeUpdate(rows)
      case "upsert":
        return this.executeUpsert(rows)
      case "delete":
        return this.executeDelete(rows)
      default:
        return { data: null, error: { message: "Unsupported action" } }
    }
  }
}

export const createLocalClient = (userId?: string | null) => {
  const baseUser = userId === undefined ? getLocalUser() : findUserById(userId)
  const user = baseUser
    ? {
        ...baseUser,
        user_metadata: { username: baseUser.username },
      }
    : null
  const context: LocalClientContext = {
    userId: baseUser?.id || null,
    tenantId: baseUser?.tenant_id || baseUser?.id || null,
  }
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: TableName) => new LocalQuery(table, context),
  }
}
