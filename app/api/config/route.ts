import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole, isStaffRole, normalizeRole } from "@/lib/roles"
import { isSupabaseConfigured } from "@/lib/supabase/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

export const dynamic = "force-dynamic"

const configSchema = z
  .object({
    metodos_pago_config: z
      .array(
        z.object({
          nombre: z.string().min(1),
          activo: z.boolean().optional(),
        }),
      )
      .optional(),
    metodos_pago: z.array(z.string()).optional(),
    horario_local: z
      .array(
        z.object({
          dia: z.coerce.number().int().min(0).max(6),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          activo: z.boolean().optional(),
        }),
      )
      .optional(),
    factura_logo_url: z.string().optional().nullable(),
    factura_leyenda: z.string().optional().nullable(),
    factura_leyenda_footer: z.string().optional().nullable(),
    factura_emisor_nombre: z.string().optional().nullable(),
    factura_emisor_domicilio: z.string().optional().nullable(),
    factura_emisor_telefono: z.string().optional().nullable(),
    factura_emisor_email: z.string().optional().nullable(),
    wa_template_confirmaciones: z.string().optional().nullable(),
    wa_template_facturas_giftcards: z.string().optional().nullable(),
    wa_template_liquidaciones: z.string().optional().nullable(),
    wa_template_servicios_vencidos: z.string().optional().nullable(),
    wa_template_declaraciones_juradas: z.string().optional().nullable(),
    giftcard_template_data_url: z.string().optional().nullable(),
  })
  .passthrough()

type MetodoPagoRow = { nombre?: string | null }
type HorarioLocal = { dia: number; desde: string; hasta: string; activo: boolean }

const USER_CONFIG_SELECT_FULL = [
  "id",
  "username",
  "rol",
  "tenant_id",
  "empleada_id",
  "facturacion_activa",
  "afip_cuit",
  "afip_punto_venta",
  "afip_cbte_tipo",
  "afip_produccion",
  "afip_iva_id",
  "afip_iva_porcentaje",
  "factura_logo_url",
  "factura_leyenda",
  "factura_leyenda_footer",
  "factura_emisor_nombre",
  "factura_emisor_domicilio",
  "factura_emisor_telefono",
  "factura_emisor_email",
  "created_at",
  "updated_at",
].join(", ")

const USER_CONFIG_SELECT_FALLBACK = [
  "id",
  "username",
  "rol",
  "tenant_id",
  "empleada_id",
  "created_at",
  "updated_at",
].join(", ")

const CONFIG_SELECT_FULL = [
  "id",
  "usuario_id",
  "horario_local",
  "wa_template_confirmaciones",
  "wa_template_facturas_giftcards",
  "wa_template_liquidaciones",
  "wa_template_servicios_vencidos",
  "wa_template_declaraciones_juradas",
  "giftcard_template_data_url",
  "created_at",
  "updated_at",
].join(", ")

const CONFIG_SELECT_FALLBACK = ["id", "usuario_id", "horario_local", "created_at", "updated_at"].join(", ")

const CONFIG_EXTENDED_COLUMNS = [
  "wa_template_confirmaciones",
  "wa_template_facturas_giftcards",
  "wa_template_liquidaciones",
  "wa_template_servicios_vencidos",
  "wa_template_declaraciones_juradas",
  "giftcard_template_data_url",
]

const sanitizeUsuario = (value: any) => {
  if (!value) return value
  const {
    password,
    password_hash,
    afip_access_token,
    arca_access_token,
    afip_key,
    afip_cert,
    ...rest
  } = value
  void password
  void password_hash
  void afip_access_token
  void arca_access_token
  void afip_key
  void afip_cert
  return rest
}

const mapMetodosPago = (metodos: MetodoPagoRow[] | null | undefined) =>
  Array.isArray(metodos) ? metodos.map((m: MetodoPagoRow) => m.nombre).filter(Boolean) : []

const isMissingTableError = (error: any, table: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  const tableRef = `public.${table}`.toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(tableRef) && message.includes("schema cache")
}

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42703" || code === "PGRST204") return true
  return message.includes("column") && (message.includes("does not exist") || message.includes("schema cache"))
}

const normalizeNullableText = (value: unknown) => {
  if (value === undefined) return undefined
  if (value === null) return null
  const cleaned = String(value).trim()
  return cleaned.length > 0 ? cleaned : null
}

const hasAnyConfigExtendedColumn = (row: any) => {
  if (!row || typeof row !== "object") return false
  return CONFIG_EXTENDED_COLUMNS.some((column) => Object.prototype.hasOwnProperty.call(row, column))
}

const getUsuarioConfigRow = async (db: any, userId: string) => {
  const full = await db.from("usuarios").select(USER_CONFIG_SELECT_FULL).eq("id", userId).maybeSingle()
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full

  const wildcard = await db.from("usuarios").select("*").eq("id", userId).maybeSingle()
  if (!wildcard.error) return wildcard
  if (!isMissingColumnError(wildcard.error)) return wildcard

  return db.from("usuarios").select(USER_CONFIG_SELECT_FALLBACK).eq("id", userId).maybeSingle()
}

const getConfiguracionRow = async (db: any, tenantId: string) => {
  const full = await db.from("configuracion").select(CONFIG_SELECT_FULL).eq("usuario_id", tenantId).maybeSingle()
  if (!full.error) {
    return { data: full.data, error: full.error, supportsExtendedColumns: true }
  }
  if (!isMissingColumnError(full.error)) {
    return { data: full.data, error: full.error, supportsExtendedColumns: true }
  }

  const wildcard = await db.from("configuracion").select("*").eq("usuario_id", tenantId).maybeSingle()
  if (!wildcard.error) {
    return {
      data: wildcard.data,
      error: wildcard.error,
      supportsExtendedColumns: !wildcard.data || hasAnyConfigExtendedColumn(wildcard.data),
    }
  }
  if (!isMissingColumnError(wildcard.error)) {
    return {
      data: wildcard.data,
      error: wildcard.error,
      supportsExtendedColumns: false,
    }
  }

  const fallback = await db.from("configuracion").select(CONFIG_SELECT_FALLBACK).eq("usuario_id", tenantId).maybeSingle()
  return {
    data: fallback.data,
    error: fallback.error,
    supportsExtendedColumns: false,
  }
}

const getMetodosPagoRows = async (db: any, tenantId: string) => {
  if (isSupabaseConfigured()) {
    const scoped = await db
      .from("metodos_pago_config")
      .select("*")
      .eq("usuario_id", tenantId)
      .order("created_at", { ascending: true })

    if (!scoped.error) {
      return { data: scoped.data || [], error: null }
    }
    if (!isMissingColumnError(scoped.error)) {
      return { data: null, error: scoped.error }
    }
  }

  const legacy = await db.from("metodos_pago_config").select("*").order("created_at", { ascending: true })
  if (legacy.error) {
    return { data: null, error: legacy.error }
  }
  return { data: legacy.data || [], error: null }
}

const replaceMetodosPagoRows = async (
  db: any,
  tenantId: string,
  metodosNormalizados: Array<{ nombre: string; activo: boolean }>,
) => {
  if (isSupabaseConfigured()) {
    const scopedDelete = await db
      .from("metodos_pago_config")
      .delete()
      .eq("usuario_id", tenantId)
      .neq("nombre", "__all__")

    if (!scopedDelete.error) {
      if (metodosNormalizados.length === 0) return { error: null }

      const scopedInsert = await db
        .from("metodos_pago_config")
        .insert(metodosNormalizados.map((item) => ({ ...item, usuario_id: tenantId })))

      if (!scopedInsert.error) return { error: null }
      if (!isMissingColumnError(scopedInsert.error)) return { error: scopedInsert.error }
    } else if (!isMissingColumnError(scopedDelete.error)) {
      return { error: scopedDelete.error }
    }
  }

  const legacyDelete = await db.from("metodos_pago_config").delete().neq("nombre", "__all__")
  if (legacyDelete.error) return { error: legacyDelete.error }

  if (metodosNormalizados.length > 0) {
    const legacyInsert = await db.from("metodos_pago_config").insert(metodosNormalizados)
    if (legacyInsert.error) return { error: legacyInsert.error }
  }

  return { error: null }
}

const normalizeHorarioLocal = (items: any): HorarioLocal[] => {
  if (!Array.isArray(items)) return []
  return items
    .filter((h) => Number.isInteger(Number(h?.dia)))
    .map((h) => ({
      dia: Number(h.dia),
      desde: String(h?.desde || ""),
      hasta: String(h?.hasta || ""),
      activo: Boolean((h?.activo ?? true) && h?.desde && h?.hasta),
    }))
}

export async function GET() {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  const tenantId = getTenantId(user) || user.id

  const { data: usuario, error: userError } = await getUsuarioConfigRow(db, tenantId)
  if (userError && !isMissingTableError(userError, "usuarios")) {
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  const { data: configLocal, error: configLocalError } = await getConfiguracionRow(db, tenantId)
  if (configLocalError && !isMissingTableError(configLocalError, "configuracion")) {
    return NextResponse.json({ error: configLocalError.message }, { status: 500 })
  }
  const horarioLocal = normalizeHorarioLocal(configLocal?.horario_local)

  const usuarioBase = sanitizeUsuario(usuario) || {
    id: tenantId,
    username: user.username,
    rol: role,
  }
  const rolNormalizado = normalizeRole(role)

  let empleadaId: string | null = null
  if (isStaffRole(rolNormalizado)) {
    const { data: ownUser } = await db.from("usuarios").select("empleada_id").eq("id", user.id).maybeSingle()
    empleadaId = ownUser?.empleada_id || null
  }

  const usuarioNormalizado = {
    ...usuarioBase,
    rol: rolNormalizado,
    id: user.id,
    username: user.username || usuarioBase.username,
    empleada_id: empleadaId,
    horario_local: horarioLocal,
  }

  const { data: metodos, error: metodoError } = await getMetodosPagoRows(db, tenantId)

  if (metodoError && !isMissingTableError(metodoError, "metodos_pago_config")) {
    return NextResponse.json({ error: metodoError.message }, { status: 500 })
  }

  const metodosPago = mapMetodosPago(metodos as MetodoPagoRow[] | null | undefined)
  return NextResponse.json(
    {
      ...usuarioNormalizado,
      metodos_pago: metodosPago,
      metodos_pago_config: metodos || [],
      wa_template_confirmaciones: configLocal?.wa_template_confirmaciones || null,
      wa_template_facturas_giftcards: configLocal?.wa_template_facturas_giftcards || null,
      wa_template_liquidaciones: configLocal?.wa_template_liquidaciones || null,
      wa_template_servicios_vencidos: configLocal?.wa_template_servicios_vencidos || null,
      wa_template_declaraciones_juradas: configLocal?.wa_template_declaraciones_juradas || null,
      giftcard_template_data_url: configLocal?.giftcard_template_data_url || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tenantId = getTenantId(user) || user.id
  const { data: body, response: validationResponse } = await validateBody(request, configSchema)
  if (validationResponse) return validationResponse
  const {
    metodos_pago_config: metodosPayload,
    metodos_pago: _legacyMetodos,
    horario_local: horarioPayload,
    factura_logo_url,
    factura_leyenda,
    factura_leyenda_footer,
    factura_emisor_nombre,
    factura_emisor_domicilio,
    factura_emisor_telefono,
    factura_emisor_email,
    wa_template_confirmaciones,
    wa_template_facturas_giftcards,
    wa_template_liquidaciones,
    wa_template_servicios_vencidos,
    wa_template_declaraciones_juradas,
    giftcard_template_data_url,
  } = body || {}

  const { data: usuarioActual } = await getUsuarioConfigRow(db, tenantId)
  const allowedUsuarioColumns = new Set(Object.keys(usuarioActual || {}))
  const userUpdatesRaw: Record<string, unknown> = {
    factura_logo_url: normalizeNullableText(factura_logo_url),
    factura_leyenda: normalizeNullableText(factura_leyenda),
    factura_leyenda_footer: normalizeNullableText(factura_leyenda_footer),
    factura_emisor_nombre: normalizeNullableText(factura_emisor_nombre),
    factura_emisor_domicilio: normalizeNullableText(factura_emisor_domicilio),
    factura_emisor_telefono: normalizeNullableText(factura_emisor_telefono),
    factura_emisor_email: normalizeNullableText(factura_emisor_email),
  }

  const userUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(userUpdatesRaw)) {
    if (value !== undefined && allowedUsuarioColumns.has(key)) {
      userUpdates[key] = value
    }
  }
  if (Object.keys(userUpdates).length > 0) {
    if (allowedUsuarioColumns.has("updated_at")) {
      userUpdates.updated_at = new Date()
    }
    const { error: updateUserError } = await db.from("usuarios").update(userUpdates).eq("id", tenantId)
    if (updateUserError) return NextResponse.json({ error: updateUserError.message }, { status: 500 })
  }

  const { data: configLocalActual, error: readConfigError, supportsExtendedColumns } = await getConfiguracionRow(db, tenantId)
  if (readConfigError && !isMissingTableError(readConfigError, "configuracion")) {
    return NextResponse.json({ error: readConfigError.message }, { status: 500 })
  }

  const configPayloadRaw: Record<string, unknown> = {}
  if (Array.isArray(horarioPayload)) {
    configPayloadRaw.horario_local = normalizeHorarioLocal(horarioPayload)
  }
  if (supportsExtendedColumns) {
    configPayloadRaw.wa_template_confirmaciones = normalizeNullableText(wa_template_confirmaciones)
    configPayloadRaw.wa_template_facturas_giftcards = normalizeNullableText(wa_template_facturas_giftcards)
    configPayloadRaw.wa_template_liquidaciones = normalizeNullableText(wa_template_liquidaciones)
    configPayloadRaw.wa_template_servicios_vencidos = normalizeNullableText(wa_template_servicios_vencidos)
    configPayloadRaw.wa_template_declaraciones_juradas = normalizeNullableText(wa_template_declaraciones_juradas)
    configPayloadRaw.giftcard_template_data_url = normalizeNullableText(giftcard_template_data_url)
  }

  const configPayload: Record<string, unknown> = {}
  const allowedConfigColumns = new Set(Object.keys(configLocalActual || {}))
  Object.entries(configPayloadRaw).forEach(([key, value]) => {
    if (value === undefined) return
    const isExtendedColumn = CONFIG_EXTENDED_COLUMNS.includes(key)
    if (
      !configLocalActual ||
      allowedConfigColumns.size === 0 ||
      allowedConfigColumns.has(key) ||
      (supportsExtendedColumns && isExtendedColumn)
    ) {
      configPayload[key] = value
    }
  })

  if (Object.keys(configPayload).length > 0 || !configLocalActual?.id) {
    if (configLocalActual?.id) {
      const updatePayload = { ...configPayload } as Record<string, unknown>
      if (allowedConfigColumns.has("updated_at")) updatePayload.updated_at = new Date()
      const { error: updateError } = await db.from("configuracion").update(updatePayload).eq("id", configLocalActual.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    } else {
      const insertPayload = {
        usuario_id: tenantId,
        ...configPayload,
      } as Record<string, unknown>
      const { error: insertError } = await db.from("configuracion").insert([insertPayload])
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  if (Array.isArray(metodosPayload)) {
    const metodosNormalizados =
      metodosPayload
        .filter((m: any) => (m?.nombre || "").toString().trim().length > 0)
        .map((m: any) => ({
          nombre: m.nombre.toString().trim(),
          activo: m.activo ?? true,
        })) || []

    const hasEfectivo = metodosNormalizados.some((m: any) => m.nombre.toLowerCase() === "efectivo")
    if (!hasEfectivo) {
      metodosNormalizados.unshift({
        nombre: "efectivo",
        activo: true,
      })
    }

    const { error: replaceError } = await replaceMetodosPagoRows(db, tenantId, metodosNormalizados)
    if (replaceError) return NextResponse.json({ error: replaceError.message }, { status: 500 })
  }

  const { data: usuarioRefrescado } = await getUsuarioConfigRow(db, tenantId)
  const { data: metodos } = await getMetodosPagoRows(db, tenantId)
  const { data: configLocalRefrescada } = await getConfiguracionRow(db, tenantId)

  return NextResponse.json({
    ...sanitizeUsuario(usuarioRefrescado),
    horario_local: normalizeHorarioLocal(configLocalRefrescada?.horario_local),
    metodos_pago: mapMetodosPago(metodos as MetodoPagoRow[] | null | undefined),
    metodos_pago_config: metodos || [],
    wa_template_confirmaciones: configLocalRefrescada?.wa_template_confirmaciones || null,
    wa_template_facturas_giftcards: configLocalRefrescada?.wa_template_facturas_giftcards || null,
    wa_template_liquidaciones: configLocalRefrescada?.wa_template_liquidaciones || null,
    wa_template_servicios_vencidos: configLocalRefrescada?.wa_template_servicios_vencidos || null,
    wa_template_declaraciones_juradas: configLocalRefrescada?.wa_template_declaraciones_juradas || null,
    giftcard_template_data_url: configLocalRefrescada?.giftcard_template_data_url || null,
  })
}
