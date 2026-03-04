import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { validateBody } from "@/lib/api/validation"
import { declaracionPlantillaSchema, normalizeDeclaracionCampos } from "@/lib/declaraciones-juradas"

const isMissingTableError = (error: any, table: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(`public.${table}`.toLowerCase()) && message.includes("schema cache")
}

const sanitizePlantilla = (row: any) => ({
  ...row,
  campos: normalizeDeclaracionCampos(row?.campos),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = getTenantId(user) || user.id
  const url = new URL(request.url)
  const onlyActive = url.searchParams.get("active") === "1"

  const { data, error } = await db
    .from("declaraciones_juradas_plantillas")
    .select("*")
    .eq("usuario_id", tenantId)
    .order("created_at", { ascending: false })

  if (error) {
    if (isMissingTableError(error, "declaraciones_juradas_plantillas")) {
      return NextResponse.json({ error: "Falta crear la tabla de declaraciones juradas." }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = Array.isArray(data) ? data : []
  const filtered = onlyActive ? rows.filter((item: any) => item?.activa !== false) : rows
  return NextResponse.json(filtered.map(sanitizePlantilla))
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, declaracionPlantillaSchema)
  if (validationResponse) return validationResponse

  const campos = normalizeDeclaracionCampos(payload.campos)
  if (campos.length === 0) {
    return NextResponse.json({ error: "Debes definir al menos un campo válido." }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const tenantId = getTenantId(user) || user.id
  const { data, error } = await db
    .from("declaraciones_juradas_plantillas")
    .insert([
      {
        usuario_id: tenantId,
        nombre: payload.nombre.trim(),
        descripcion: payload.descripcion?.trim() || null,
        texto_intro: payload.texto_intro.trim(),
        campos,
        requiere_firma: payload.requiere_firma ?? true,
        activa: payload.activa ?? true,
        created_by: user.id,
        updated_by: user.id,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ])
    .select("*")
    .single()

  if (error) {
    if (isMissingTableError(error, "declaraciones_juradas_plantillas")) {
      return NextResponse.json({ error: "Falta crear la tabla de declaraciones juradas." }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(sanitizePlantilla(data))
}
