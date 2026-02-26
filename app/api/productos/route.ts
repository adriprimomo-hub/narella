import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const productoSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().optional().nullable(),
  precio_lista: z.coerce.number().nonnegative(),
  precio_descuento: z.coerce.number().nonnegative().optional().nullable(),
  stock_actual: z.coerce.number().int().nonnegative().optional(),
  stock_minimo: z.coerce.number().int().nonnegative().optional(),
  activo: z.boolean().optional(),
  comision_pct: z.coerce.number().nonnegative().optional().nullable(),
  comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
  empleadas_comision: z
    .array(
      z.object({
        empleada_id: z.string().min(1),
        comision_pct: z.coerce.number().nonnegative().optional().nullable(),
        comision_monto_fijo: z.coerce.number().nonnegative().optional().nullable(),
      }),
    )
    .optional(),
})

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

  const createQuery = () => {
    let query = db.from("productos").select("*").eq("usuario_id", user.id)
    if (!includeInactive) {
      query = query.eq("activo", true)
    }
    return query.order("nombre", { ascending: true })
  }

  let productos: any[] = []
  let hasNext = false

  if (pagination.enabled) {
    const { data, error } = await createQuery().range(pagination.from, pagination.to + 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = Array.isArray(data) ? data : []
    hasNext = rows.length > pagination.pageSize
    productos = hasNext ? rows.slice(0, pagination.pageSize) : rows
  } else {
    const { data, error } = await createQuery()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    productos = Array.isArray(data) ? data : []
  }

  // Si no es admin, ocultar comisiones
  if (!isAdmin) {
    const productosSinComision = productos.map((p: any) => ({
      ...p,
      comision_pct: null,
      comision_monto_fijo: null,
    }))

    if (pagination.enabled) {
      return NextResponse.json({
        items: productosSinComision,
        pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
      })
    }

    return NextResponse.json(productosSinComision)
  }

  // Si es admin, incluir comisiones por empleada
  const { data: comisiones } = await db
    .from("producto_empleada_comisiones")
    .select("*")
    .eq("usuario_id", user.id)

  const productosConComision = productos.map((p: any) => ({
    ...p,
    empleadas_comision: (comisiones || []).filter((c: any) => c.producto_id === p.id),
  }))

  if (pagination.enabled) {
    return NextResponse.json({
      items: productosConComision,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  return NextResponse.json(productosConComision)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, productoSchema)
  if (validationResponse) return validationResponse
  const {
    nombre,
    descripcion,
    precio_lista,
    precio_descuento,
    stock_actual,
    stock_minimo,
    activo,
    comision_pct,
    comision_monto_fijo,
    empleadas_comision,
  } = payload

  const precioListaFinal = Number(precio_lista)
  if (!Number.isFinite(precioListaFinal) || precioListaFinal < 0) {
    return NextResponse.json({ error: "Precio de lista inválido" }, { status: 400 })
  }

  const { data, error } = await db
    .from("productos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        nombre,
        descripcion,
        precio_lista: precioListaFinal,
        precio_descuento: precio_descuento ?? null,
        stock_actual: stock_actual || 0,
        stock_minimo: stock_minimo || 0,
        activo: activo ?? true,
        comision_pct: comision_pct ?? null,
        comision_monto_fijo: comision_monto_fijo ?? null,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Guardar comisiones por empleada
  const productoId = data?.id
  if (productoId && Array.isArray(empleadas_comision) && empleadas_comision.length) {
    const payload = empleadas_comision
      .filter((e: any) => e.empleada_id)
      .map((e: any) => ({
        usuario_id: user.id,
        producto_id: productoId,
        empleada_id: e.empleada_id,
        comision_pct: e.comision_pct ?? null,
        comision_monto_fijo: e.comision_monto_fijo ?? null,
      }))
    if (payload.length) {
      await db.from("producto_empleada_comisiones").upsert(payload, { onConflict: "producto_id,empleada_id" })
    }
  }

  return NextResponse.json(data)
}
