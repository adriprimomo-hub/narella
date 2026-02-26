import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { sanitizePhoneNumber } from "@/lib/whatsapp"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_THRESHOLD_DAYS = 35
const DEFAULT_TEMPLATE =
  "Hola {clienta}! Queriamos recordarte que hace {cantidad_dias} no te haces {servicio_vencido}. Estas interesada en volver a hacertelo?"

const normalizeTemplate = (value?: string | null) => {
  if (!value) return DEFAULT_TEMPLATE
  const cleaned = value.trim()
  if (!cleaned) return DEFAULT_TEMPLATE
  return cleaned.replace(/\\n/g, "\n")
}

const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

const normalizePairKey = (clienteId: string, servicioId: string) => `${clienteId}::${servicioId}`

const resolveThresholdDays = (rawValue: string | null) => {
  const raw = rawValue || process.env.REPORTES_SERVICIO_VENCIDO_DIAS || String(DEFAULT_THRESHOLD_DAYS)
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_THRESHOLD_DAYS
  return parsed
}

const resolveStatusFilter = (rawValue: string | null) => {
  const normalized = String(rawValue || "all")
    .trim()
    .toLowerCase()
  return normalized === "pendiente" || normalized === "enviado" ? normalized : "all"
}

const resolvePage = (rawValue: string | null) => {
  const parsed = Number.parseInt(String(rawValue || "1"), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return parsed
}

const resolvePageSize = (rawValue: string | null) => {
  const parsed = Number.parseInt(String(rawValue || "20"), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.min(Math.max(parsed, 1), 100)
}

const buildReminderMessage = (params: { clienta: string; cantidadDias: number; servicioVencido: string }) => {
  const template = normalizeTemplate(process.env.WA_ME_SERVICIO_VENCIDO_TEMPLATE)
  const values: Record<string, string> = {
    clienta: params.clienta,
    cliente: params.clienta,
    cliente_nombre: params.clienta,
    cantidad_dias: String(params.cantidadDias),
    dias: String(params.cantidadDias),
    servicio_vencido: params.servicioVencido,
    servicio: params.servicioVencido,
  }

  const aliases: Record<string, string> = {
    cantidad_de_dias: "cantidad_dias",
    dias_desde_ultimo_servicio: "cantidad_dias",
    servicio_vencido_exacto: "servicio_vencido",
    servicio_vencido: "servicio_vencido",
  }

  return template.replace(/\{([^}]+)\}/g, (match, rawKey) => {
    const key = normalizeKey(String(rawKey))
    const resolved = aliases[key] || key
    return resolved in values ? values[resolved] : match
  })
}

type TurnoReporteRow = {
  id: string
  cliente_id: string
  servicio_id: string | null
  servicio_final_id: string | null
  fecha_inicio: string
  clientes?: { id?: string; nombre?: string; apellido?: string; telefono?: string } | null
  servicios?: { id?: string; nombre?: string } | null
  servicio_final?: { id?: string; nombre?: string } | null
}

type UltimoServicioPorCliente = {
  clienteId: string
  clienta: string
  telefono: string
  servicioId: string
  servicio: string
  fechaUltimoServicio: string
  fechaUltimoServicioMs: number
}

type RecordatorioRow = {
  cliente_id: string
  servicio_id: string
  enviado_at: string
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(request.url)
  const thresholdDays = resolveThresholdDays(url.searchParams.get("dias"))
  const statusFilter = resolveStatusFilter(url.searchParams.get("estado"))
  const page = resolvePage(url.searchParams.get("page"))
  const pageSize = resolvePageSize(url.searchParams.get("page_size"))

  const { data: turnosData, error: turnosError } = await db
    .from("turnos")
    .select(
      `
      id,
      cliente_id,
      servicio_id,
      servicio_final_id,
      fecha_inicio,
      clientes:cliente_id(id, nombre, apellido, telefono),
      servicios:servicio_id(id, nombre),
      servicio_final:servicio_final_id(id, nombre)
    `,
    )
    .eq("usuario_id", user.id)
    .eq("estado", "completado")
    .order("fecha_inicio", { ascending: false })

  if (turnosError) return NextResponse.json({ error: turnosError.message }, { status: 500 })

  const { data: recordatoriosData, error: recordatoriosError } = await db
    .from("servicio_vencido_recordatorios")
    .select("cliente_id, servicio_id, enviado_at")
    .eq("usuario_id", user.id)

  if (recordatoriosError) return NextResponse.json({ error: recordatoriosError.message }, { status: 500 })

  const reminderMap = new Map<string, string>()
  ;((recordatoriosData || []) as RecordatorioRow[]).forEach((row) => {
    const clienteId = String(row?.cliente_id || "").trim()
    const servicioId = String(row?.servicio_id || "").trim()
    const sentAt = String(row?.enviado_at || "").trim()
    if (!clienteId || !servicioId || !sentAt) return
    const current = reminderMap.get(normalizePairKey(clienteId, servicioId))
    if (!current || new Date(sentAt).getTime() > new Date(current).getTime()) {
      reminderMap.set(normalizePairKey(clienteId, servicioId), sentAt)
    }
  })

  const latestByClientService = new Map<string, UltimoServicioPorCliente>()

  ;((turnosData || []) as TurnoReporteRow[]).forEach((turno) => {
    const fechaTurno = new Date(turno.fecha_inicio)
    if (!Number.isFinite(fechaTurno.getTime())) return

    const clienteId = String(turno.cliente_id || turno.clientes?.id || "").trim()
    if (!clienteId) return

    const servicioUsado = turno.servicio_final || turno.servicios
    const servicioId = String(servicioUsado?.id || turno.servicio_final_id || turno.servicio_id || "").trim()
    if (!servicioId) return

    const key = normalizePairKey(clienteId, servicioId)
    const existing = latestByClientService.get(key)
    const currentMs = fechaTurno.getTime()
    if (existing && existing.fechaUltimoServicioMs >= currentMs) return

    const clienta = [turno.clientes?.nombre, turno.clientes?.apellido].filter(Boolean).join(" ").trim() || "Clienta"
    const servicio = servicioUsado?.nombre?.trim() || "Servicio"
    latestByClientService.set(key, {
      clienteId,
      clienta,
      telefono: String(turno.clientes?.telefono || "").trim(),
      servicioId,
      servicio,
      fechaUltimoServicio: turno.fecha_inicio,
      fechaUltimoServicioMs: currentMs,
    })
  })

  const now = new Date()
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const allItems = Array.from(latestByClientService.values())
    .map((item) => {
      const lastDate = new Date(item.fechaUltimoServicioMs)
      const lastDateStartMs = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime()
      const diasDesdeUltimoServicio = Math.floor((todayStartMs - lastDateStartMs) / DAY_MS)
      if (!Number.isFinite(diasDesdeUltimoServicio) || diasDesdeUltimoServicio <= thresholdDays) return null

      const reminderSentAt = reminderMap.get(normalizePairKey(item.clienteId, item.servicioId)) || null
      const reminderSentAtMs = reminderSentAt ? new Date(reminderSentAt).getTime() : Number.NaN
      const estadoRecordatorio =
        Number.isFinite(reminderSentAtMs) && reminderSentAtMs >= item.fechaUltimoServicioMs ? "enviado" : "pendiente"

      const mensaje = buildReminderMessage({
        clienta: item.clienta,
        cantidadDias: diasDesdeUltimoServicio,
        servicioVencido: item.servicio,
      })
      const telefonoSanitizado = sanitizePhoneNumber(item.telefono || "")
      const telefonoValido = telefonoSanitizado.length >= 8 ? telefonoSanitizado : null
      const whatsappUrl = telefonoValido
        ? `https://wa.me/${telefonoValido}?text=${encodeURIComponent(mensaje)}`
        : null

      return {
        cliente_id: item.clienteId,
        clienta: item.clienta,
        telefono: item.telefono || "",
        servicio_id: item.servicioId,
        servicio: item.servicio,
        ultima_fecha: item.fechaUltimoServicio,
        dias_desde_ultimo_servicio: diasDesdeUltimoServicio,
        estado_recordatorio: estadoRecordatorio,
        recordatorio_enviado_at:
          Number.isFinite(reminderSentAtMs) && reminderSentAtMs >= item.fechaUltimoServicioMs ? reminderSentAt : null,
        mensaje_recordatorio: mensaje,
        whatsapp_url: whatsappUrl,
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const byDays = b.dias_desde_ultimo_servicio - a.dias_desde_ultimo_servicio
      if (byDays !== 0) return byDays
      return String(a.clienta || "").localeCompare(String(b.clienta || ""), "es")
    })

  const resumen = {
    total: allItems.length,
    pendiente: allItems.filter((item: any) => item.estado_recordatorio === "pendiente").length,
    enviado: allItems.filter((item: any) => item.estado_recordatorio === "enviado").length,
  }

  const filteredItems =
    statusFilter === "all"
      ? allItems
      : allItems.filter((item: any) => item.estado_recordatorio === statusFilter)

  const totalFiltered = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pageItems = filteredItems.slice(startIndex, endIndex)

  return NextResponse.json({
    umbral_dias: thresholdDays,
    total: totalFiltered,
    resumen,
    filtro: {
      estado: statusFilter,
      page: currentPage,
      page_size: pageSize,
    },
    pagination: {
      page: currentPage,
      page_size: pageSize,
      total: totalFiltered,
      total_pages: totalPages,
      has_prev: currentPage > 1,
      has_next: currentPage < totalPages,
    },
    items: pageItems,
  })
}
