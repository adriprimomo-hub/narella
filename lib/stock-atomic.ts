type StockEntity = "producto" | "insumo"

type AtomicStockArgs = {
  db: any
  tenantId: string
  itemId: string
  delta: number
  entity: StockEntity
}

type AtomicStockResult =
  | { ok: true; stock: number }
  | { ok: false; status: number; error: string }

const MAX_RETRIES = 5

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

const getTableName = (entity: StockEntity) => (entity === "producto" ? "productos" : "insumos")
const getEntityLabel = (entity: StockEntity) => (entity === "producto" ? "producto" : "insumo")

const buildConflictMessage = (entity: StockEntity) =>
  `Conflicto de concurrencia al actualizar stock de ${getEntityLabel(entity)}. Reintenta.`

const applyAtomicStockDelta = async (args: AtomicStockArgs): Promise<AtomicStockResult> => {
  const tableName = getTableName(args.entity)
  const entityLabel = getEntityLabel(args.entity)
  const nowIso = () => new Date().toISOString()

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const { data: current, error: currentError } = await args.db
      .from(tableName)
      .select("id, stock_actual")
      .eq("id", args.itemId)
      .eq("usuario_id", args.tenantId)
      .maybeSingle()

    if (currentError) {
      return { ok: false, status: 500, error: currentError.message || `No se pudo leer stock de ${entityLabel}` }
    }

    if (!current) {
      return { ok: false, status: 404, error: `${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} no encontrado` }
    }

    const currentRaw = current.stock_actual
    const currentStock = toNumber(currentRaw)
    const nextStock = currentStock + args.delta

    if (nextStock < 0) {
      return { ok: false, status: 409, error: `Stock insuficiente para ${entityLabel}` }
    }

    let updateQuery = args.db
      .from(tableName)
      .update({ stock_actual: nextStock, updated_at: nowIso() })
      .eq("id", args.itemId)
      .eq("usuario_id", args.tenantId)

    if (currentRaw === null || currentRaw === undefined) {
      updateQuery = updateQuery.is("stock_actual", null)
    } else {
      updateQuery = updateQuery.eq("stock_actual", currentRaw)
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select("id, stock_actual")

    if (updateError) {
      return { ok: false, status: 500, error: updateError.message || `No se pudo actualizar stock de ${entityLabel}` }
    }

    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      return { ok: true, stock: toNumber(updatedRows[0]?.stock_actual) }
    }
  }

  return { ok: false, status: 409, error: buildConflictMessage(args.entity) }
}

export const decrementProductoStock = async (args: { db: any; tenantId: string; productoId: string; cantidad: number }) =>
  applyAtomicStockDelta({
    db: args.db,
    tenantId: args.tenantId,
    itemId: args.productoId,
    delta: -Math.abs(toNumber(args.cantidad)),
    entity: "producto",
  })

export const incrementProductoStock = async (args: { db: any; tenantId: string; productoId: string; cantidad: number }) =>
  applyAtomicStockDelta({
    db: args.db,
    tenantId: args.tenantId,
    itemId: args.productoId,
    delta: Math.abs(toNumber(args.cantidad)),
    entity: "producto",
  })

export const applyInsumoStockDelta = async (args: { db: any; tenantId: string; insumoId: string; delta: number }) =>
  applyAtomicStockDelta({
    db: args.db,
    tenantId: args.tenantId,
    itemId: args.insumoId,
    delta: toNumber(args.delta),
    entity: "insumo",
  })
