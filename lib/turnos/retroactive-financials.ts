import {
  buildFacturaRetryPayload,
  parseFacturaRetryPayload,
} from "@/lib/facturas-registro"
import { reconciliarLiquidacionesHistorialPorTurno } from "@/lib/liquidaciones/server"
import {
  relabelServiceSnapshotItems,
  type FacturaItemSnapshot,
} from "@/lib/turnos/retroactive-financials-shared"

type DbClient = {
  from: (table: string) => any
}

type ServicioAgregado = {
  servicio_id?: string
}

type TurnoRetroactivo = {
  id: string
  grupo_id?: string | null
  fecha_inicio?: string | null
  cliente_id?: string | null
  empleada_id?: string | null
  empleada_final_id?: string | null
  servicio_id?: string | null
  servicio_final_id?: string | null
  servicios_agregados?: ServicioAgregado[] | null
}

const normalizeFacturaItems = (items: unknown): FacturaItemSnapshot[] =>
  (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      tipo: String(item?.tipo || "").trim(),
      descripcion: String(item?.descripcion || "").trim(),
      cantidad: Number(item?.cantidad || 1),
      precio_unitario: Number(item?.precio_unitario || 0),
      subtotal: Number(item?.subtotal || 0),
    }))
    .filter((item) => item.tipo && item.descripcion)

const buildMainServiceDescription = (name: string | null) => `Servicio: ${name || "Servicio"}`
const buildExtraServiceDescription = (name: string | null) => `Servicio extra: ${name || "Servicio extra"}`

const getTurnoServiceIds = (turno: TurnoRetroactivo) => {
  const ids = new Set<string>()
  const principalId = String(turno.servicio_final_id || turno.servicio_id || "").trim()
  if (principalId) ids.add(principalId)
  const agregados = Array.isArray(turno.servicios_agregados) ? turno.servicios_agregados : []
  agregados.forEach((item) => {
    const servicioId = String(item?.servicio_id || "").trim()
    if (servicioId) ids.add(servicioId)
  })
  return Array.from(ids)
}

const getGroupServiceIds = (turnos: TurnoRetroactivo[]) => {
  const ids = new Set<string>()
  turnos.forEach((turno) => {
    getTurnoServiceIds(turno).forEach((id) => ids.add(id))
  })
  return Array.from(ids)
}

const buildTurnoServiceDescriptions = (
  turno: TurnoRetroactivo,
  servicesMap: Map<string, { nombre?: string | null }>,
) => {
  const descriptions: string[] = []
  const principalId = String(turno.servicio_final_id || turno.servicio_id || "").trim()
  if (principalId) {
    descriptions.push(buildMainServiceDescription(servicesMap.get(principalId)?.nombre || null))
  }

  const agregados = Array.isArray(turno.servicios_agregados) ? turno.servicios_agregados : []
  agregados.forEach((item) => {
    const servicioId = String(item?.servicio_id || "").trim()
    if (!servicioId) return
    descriptions.push(buildExtraServiceDescription(servicesMap.get(servicioId)?.nombre || null))
  })

  return descriptions
}

const buildGroupServiceDescriptions = (
  turnos: TurnoRetroactivo[],
  servicesMap: Map<string, { nombre?: string | null }>,
) =>
  [...turnos]
    .sort((a, b) => {
      const aTime = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : 0
      const bTime = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : 0
      if (aTime !== bTime) return aTime - bTime
      return String(a.id || "").localeCompare(String(b.id || ""))
    })
    .map((turno) => {
      const principalId = String(turno.servicio_final_id || turno.servicio_id || "").trim()
      return buildMainServiceDescription(servicesMap.get(principalId)?.nombre || null)
    })

const loadServicesMap = async (db: DbClient, tenantId: string, servicioIds: string[]) => {
  if (servicioIds.length === 0) return new Map<string, { nombre?: string | null }>()
  const { data: servicios, error } = await db
    .from("servicios")
    .select("id, nombre")
    .eq("usuario_id", tenantId)
    .in("id", servicioIds)

  if (error) {
    throw new Error(error.message || "No se pudieron obtener los servicios para la reconciliación retroactiva.")
  }

  return new Map<string, { nombre?: string | null }>(
    (Array.isArray(servicios) ? servicios : []).map((servicio: any) => [String(servicio.id), servicio]),
  )
}

const actualizarFacturaPendiente = async (args: {
  db: DbClient
  factura: any
  descriptions: string[]
}) => {
  const itemsActuales = normalizeFacturaItems(args.factura?.items)
  const itemsActualizados = relabelServiceSnapshotItems(itemsActuales, args.descriptions)
  const retryPayload = parseFacturaRetryPayload(args.factura?.retry_payload)
  const retryPayloadActualizado = retryPayload
    ? buildFacturaRetryPayload({
        cliente: retryPayload.cliente,
        items: relabelServiceSnapshotItems(
          normalizeFacturaItems(retryPayload.items).map((item) => ({
            ...item,
            tipo: item.tipo,
          })),
          args.descriptions,
        ).map((item) => ({
          tipo: item.tipo as "servicio" | "producto" | "penalidad" | "ajuste",
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
        })),
        total: retryPayload.total,
        metodo_pago: retryPayload.metodo_pago,
        descuento_sena: retryPayload.descuento_sena,
        ajustes: retryPayload.ajustes,
        fecha: retryPayload.fecha,
      })
    : null

  const { error } = await args.db
    .from("facturas")
    .update({
      items: itemsActualizados,
      retry_payload: retryPayloadActualizado,
      retry_proximo_intento: new Date().toISOString(),
    })
    .eq("id", args.factura.id)

  if (error) {
    throw new Error(error.message || "No se pudo actualizar una factura pendiente retroactiva.")
  }
}

const actualizarFacturasPendientesTurnoPago = async (args: {
  db: DbClient
  tenantId: string
  turno: TurnoRetroactivo
}) => {
  const { data: pagos, error: pagosError } = await args.db
    .from("pagos")
    .select("id")
    .eq("usuario_id", args.tenantId)
    .eq("turno_id", args.turno.id)

  if (pagosError) {
    throw new Error(pagosError.message || "No se pudieron obtener los pagos del turno.")
  }

  const pagoIds = (Array.isArray(pagos) ? pagos : []).map((row: any) => String(row?.id || "").trim()).filter(Boolean)
  if (pagoIds.length === 0) return 0

  const servicesMap = await loadServicesMap(args.db, args.tenantId, getTurnoServiceIds(args.turno))
  const descriptions = buildTurnoServiceDescriptions(args.turno, servicesMap)
  if (descriptions.length === 0) return 0

  const { data: facturas, error: facturasError } = await args.db
    .from("facturas")
    .select("id, items, retry_payload, estado")
    .eq("usuario_id", args.tenantId)
    .eq("origen_tipo", "turno_pago")
    .in("origen_id", pagoIds)
    .eq("estado", "pendiente")

  if (facturasError) {
    throw new Error(facturasError.message || "No se pudieron obtener las facturas pendientes del turno.")
  }

  let actualizadas = 0
  for (const factura of Array.isArray(facturas) ? facturas : []) {
    await actualizarFacturaPendiente({
      db: args.db,
      factura,
      descriptions,
    })
    actualizadas += 1
  }

  return actualizadas
}

const actualizarFacturasPendientesTurnoGrupo = async (args: {
  db: DbClient
  tenantId: string
  turno: TurnoRetroactivo
}) => {
  const grupoId = String(args.turno.grupo_id || "").trim()
  if (!grupoId) return 0

  const { data: turnosGrupo, error: turnosGrupoError } = await args.db
    .from("turnos")
    .select("id, grupo_id, fecha_inicio, servicio_id, servicio_final_id")
    .eq("usuario_id", args.tenantId)
    .eq("grupo_id", grupoId)

  if (turnosGrupoError) {
    throw new Error(turnosGrupoError.message || "No se pudieron obtener los turnos del grupo.")
  }

  const turnos = (Array.isArray(turnosGrupo) ? turnosGrupo : []) as TurnoRetroactivo[]
  if (turnos.length === 0) return 0

  const { data: pagoGrupoItems, error: pagoGrupoItemsError } = await args.db
    .from("pago_grupo_items")
    .select("pago_grupo_id")
    .eq("usuario_id", args.tenantId)
    .eq("turno_id", args.turno.id)

  if (pagoGrupoItemsError) {
    throw new Error(pagoGrupoItemsError.message || "No se pudieron obtener los pagos grupales del turno.")
  }

  const pagoGrupoIds = (Array.isArray(pagoGrupoItems) ? pagoGrupoItems : [])
    .map((row: any) => String(row?.pago_grupo_id || "").trim())
    .filter(Boolean)
  if (pagoGrupoIds.length === 0) return 0

  const servicesMap = await loadServicesMap(args.db, args.tenantId, getGroupServiceIds(turnos))
  const descriptions = buildGroupServiceDescriptions(turnos, servicesMap)
  if (descriptions.length === 0) return 0

  const { data: facturas, error: facturasError } = await args.db
    .from("facturas")
    .select("id, items, retry_payload, estado")
    .eq("usuario_id", args.tenantId)
    .eq("origen_tipo", "turno_grupo_pago")
    .in("origen_id", pagoGrupoIds)
    .eq("estado", "pendiente")

  if (facturasError) {
    throw new Error(facturasError.message || "No se pudieron obtener las facturas pendientes del grupo.")
  }

  let actualizadas = 0
  for (const factura of Array.isArray(facturas) ? facturas : []) {
    await actualizarFacturaPendiente({
      db: args.db,
      factura,
      descriptions,
    })
    actualizadas += 1
  }

  return actualizadas
}

export const reconciliarEdicionRetroactivaTurnoCerrado = async (args: {
  db: DbClient
  tenantId: string
  turnoAntes: TurnoRetroactivo
  turnoDespues: TurnoRetroactivo
}) => {
  const liquidaciones = await reconciliarLiquidacionesHistorialPorTurno({
    db: args.db,
    tenantId: args.tenantId,
    turnoAntes: args.turnoAntes,
    turnoDespues: args.turnoDespues,
  })

  const facturasTurno = await actualizarFacturasPendientesTurnoPago({
    db: args.db,
    tenantId: args.tenantId,
    turno: args.turnoDespues,
  })

  const facturasGrupo = await actualizarFacturasPendientesTurnoGrupo({
    db: args.db,
    tenantId: args.tenantId,
    turno: args.turnoDespues,
  })

  return {
    liquidaciones_historial_actualizadas: liquidaciones.actualizadas,
    facturas_pendientes_actualizadas: facturasTurno + facturasGrupo,
  }
}
