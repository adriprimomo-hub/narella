import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole, isStaffRole, normalizeRole } from "@/lib/roles"
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

const getUsuarioConfigRow = async (db: any, userId: string) => {
  const full = await db.from("usuarios").select(USER_CONFIG_SELECT_FULL).eq("id", userId).maybeSingle()
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full
  return db.from("usuarios").select(USER_CONFIG_SELECT_FALLBACK).eq("id", userId).maybeSingle()
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

  const { data: configLocal, error: configLocalError } = await db
    .from("configuracion")
    .select("horario_local")
    .eq("usuario_id", tenantId)
    .maybeSingle()
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

  const { data: metodos, error: metodoError } =
    (await db
      .from("metodos_pago_config")
      .select("*")
      .order("created_at", { ascending: true })) || {}

  if (metodoError && !isMissingTableError(metodoError, "metodos_pago_config")) {
    return NextResponse.json({ error: metodoError.message }, { status: 500 })
  }

  const metodosPago = mapMetodosPago(metodos as MetodoPagoRow[] | null | undefined)
  return NextResponse.json(
    { ...usuarioNormalizado, metodos_pago: metodosPago, metodos_pago_config: metodos || [] },
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
  const { metodos_pago_config: metodosPayload, metodos_pago: _legacyMetodos, horario_local: horarioPayload } = body || {}

  if (Array.isArray(horarioPayload)) {
    const horarioNormalizado = normalizeHorarioLocal(horarioPayload)
    const { data: configLocal, error: readConfigError } = await db
      .from("configuracion")
      .select("id")
      .eq("usuario_id", tenantId)
      .maybeSingle()

    if (readConfigError && !isMissingTableError(readConfigError, "configuracion")) {
      return NextResponse.json({ error: readConfigError.message }, { status: 500 })
    }

    if (configLocal?.id) {
      const { error: updateError } = await db
        .from("configuracion")
        .update({ horario_local: horarioNormalizado, updated_at: new Date() })
        .eq("id", configLocal.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    } else {
      const { error: insertError } = await db.from("configuracion").insert([
        {
          usuario_id: tenantId,
          horario_local: horarioNormalizado,
        },
      ])
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

    const { error: delError } = await db.from("metodos_pago_config").delete().neq("nombre", "__all__")
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    if (metodosNormalizados.length > 0) {
      const { error: insError } = await db.from("metodos_pago_config").insert(metodosNormalizados)
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
    }
  }

  const { data: usuarioRefrescado } = await getUsuarioConfigRow(db, tenantId)
  const { data: metodos } = await db.from("metodos_pago_config").select("*").order("created_at", { ascending: true })
  const { data: configLocalRefrescada } = await db
    .from("configuracion")
    .select("horario_local")
    .eq("usuario_id", tenantId)
    .maybeSingle()

  return NextResponse.json({
    ...sanitizeUsuario(usuarioRefrescado),
    horario_local: normalizeHorarioLocal(configLocalRefrescada?.horario_local),
    metodos_pago: mapMetodosPago(metodos as MetodoPagoRow[] | null | undefined),
    metodos_pago_config: metodos || [],
  })
}
