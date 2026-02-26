import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const servicioSchema = z.object({
  nombre: z.string().trim().min(1),
  duracion_minutos: z.coerce.number().int().positive(),
  precio_lista: z.coerce.number().nonnegative(),
  precio_descuento: z.coerce.number().nonnegative().optional().nullable(),
  empleadas_habilitadas: z.array(z.string().min(1)).optional(),
  empleadas_comision: z
    .array(
      z.object({
        empleada_id: z.string().min(1),
        comision_pct: z.coerce.number().nonnegative().optional().nullable(),
        comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
      }),
    )
    .optional(),
  comision_pct: z.coerce.number().nonnegative().optional().nullable(),
  comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
  categoria_id: z.string().optional().nullable(),
  recurso_id: z.string().optional().nullable(),
})

const resolveCategoriaValue = async (
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoriaId: string | null | undefined,
) => {
  if (!categoriaId) return "principal"
  const { data, error } = await db
    .from("categorias")
    .select("nombre")
    .eq("id", categoriaId)
    .eq("usuario_id", userId)
    .maybeSingle()
  if (error) return "principal"
  const nombre = String(data?.nombre || "").trim()
  return nombre || "principal"
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get("include_inactive") === "true"
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createServiciosQuery = () => {
    let query = db.from("servicios").select("*").eq("usuario_id", user.id)
    if (!includeInactive) {
      query = query.eq("activo", true)
    }
    return query.order("created_at", { ascending: false })
  }

  let servicios: any[] = []
  let hasNext = false

  if (pagination.enabled) {
    const { data, error } = await createServiciosQuery().range(pagination.from, pagination.to + 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    hasNext = rows.length > pagination.pageSize
    servicios = hasNext ? rows.slice(0, pagination.pageSize) : rows
  } else {
    const { data, error } = await createServiciosQuery()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    servicios = Array.isArray(data) ? data : []
  }

  if (!isAdmin) {
    const serviciosSinComision = servicios.map((srv: any) => ({
      ...srv,
      comision_pct: null,
      comision_monto_fijo: null,
    }))

    if (pagination.enabled) {
      return NextResponse.json({
        items: serviciosSinComision,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
      })
    }

    return NextResponse.json(serviciosSinComision)
  }

  const { data: comisiones } = await db
    .from("servicio_empleada_comisiones")
    .select("*")
    .eq("usuario_id", user.id)

  const serviciosConComision = servicios.map((srv: any) => ({
    ...srv,
    empleadas_comision: (comisiones || []).filter((c: any) => c.servicio_id === srv.id),
  }))

  if (pagination.enabled) {
    return NextResponse.json({
      items: serviciosConComision,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  return NextResponse.json(serviciosConComision)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, servicioSchema)
  if (validationResponse) return validationResponse

  const {
    nombre,
    duracion_minutos,
    precio_lista,
    precio_descuento,
    empleadas_habilitadas,
    empleadas_comision,
    comision_pct,
    comision_monto_fijo,
    categoria_id,
    recurso_id,
  } = payload

  const categoriaValue = await resolveCategoriaValue(db, user.id, categoria_id)

  const { data, error } = await db
    .from("servicios")
    .insert([
      {
        usuario_id: user.id,
        nombre,
        duracion_minutos,
        precio: precio_lista,
        precio_lista,
        precio_descuento: precio_descuento ?? null,
        activo: true,
        empleadas_habilitadas: Array.isArray(empleadas_habilitadas) ? empleadas_habilitadas : [],
        comision_pct: comision_pct ?? null,
        comision_monto_fijo: comision_monto_fijo ?? null,
        categoria: categoriaValue,
        categoria_id: categoria_id || null,
        recurso_id: recurso_id || null,
      },
    ])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const servicioId = data?.[0]?.id
  if (servicioId && Array.isArray(empleadas_comision) && empleadas_comision.length) {
    const payload = empleadas_comision
      .filter((e: any) => e.empleada_id)
      .map((e: any) => ({
        usuario_id: user.id,
        servicio_id: servicioId,
        empleada_id: e.empleada_id,
        comision_pct: e.comision_pct ?? null,
        comision_monto_fijo: e.comision_monto_fijo ?? null,
      }))
    if (payload.length) {
      await db.from("servicio_empleada_comisiones").upsert(payload, { onConflict: "servicio_id,empleada_id" })
    }
  }

  return NextResponse.json(data[0])
}
