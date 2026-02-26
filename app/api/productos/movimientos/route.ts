import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { emitirFactura, type FacturaItem } from "@/lib/facturacion"
import {
  buildFacturaRetryPayload,
  guardarFacturaEmitida,
  guardarFacturaPendiente,
  sugerirNumeroFacturaLocal,
  type FacturaRetryPayload,
} from "@/lib/facturas-registro"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { buildPaginationMeta, MEDIUM_LARGE_PAGE_SIZE, readPaginationParams } from "@/lib/api/pagination"

const productoMovimientoSchema = z.object({
  producto_id: z.string().min(1),
  tipo: z.string().min(1),
  cantidad: z.coerce.number().int().positive(),
  costo_unitario: z.coerce.number().nonnegative().optional().nullable(),
  precio_unitario: z.coerce.number().nonnegative().optional().nullable(),
  cliente_id: z.string().optional().nullable(),
  empleada_id: z.string().optional().nullable(),
  metodo_pago: z.string().optional().nullable(),
  nota: z.string().optional().nullable(),
  facturar: z.boolean().optional(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const pagination = readPaginationParams(url.searchParams, { defaultPageSize: MEDIUM_LARGE_PAGE_SIZE })

  const createQuery = () =>
    db
      .from("producto_movimientos")
      .select("*, productos:producto_id(nombre), clientes:cliente_id(nombre, apellido), empleadas:empleada_id(nombre, apellido)")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })

  if (pagination.enabled) {
    const { data, error } = await createQuery().range(pagination.from, pagination.to + 1)

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({
          items: [],
          pagination: buildPaginationMeta(pagination.page, pagination.pageSize, false),
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const hasNext = rows.length > pagination.pageSize
    const items = hasNext ? rows.slice(0, pagination.pageSize) : rows

    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(pagination.page, pagination.pageSize, hasNext),
    })
  }

  const { data, error } = await createQuery()

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  const isAdmin = isAdminRole(role)

  const { data: payload, response: validationResponse } = await validateBody(request, productoMovimientoSchema)
  if (validationResponse) return validationResponse
  const {
    producto_id,
    tipo,
    cantidad,
    costo_unitario,
    precio_unitario,
    cliente_id,
    empleada_id,
    metodo_pago,
    nota,
    facturar,
  } = payload
  if (!producto_id || !tipo || !cantidad) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })

  if (!isAdmin && tipo === "compra") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let safeCosto = costo_unitario || null
  let safePrecio = precio_unitario || null
  let productoNombre = ""
  if (!isAdmin) {
    if (tipo === "venta") {
      const { data: producto } = await db
        .from("productos")
        .select("precio_lista, precio_descuento, nombre")
        .eq("id", producto_id)
        .eq("usuario_id", user.id)
        .single()
      safePrecio = Number(producto?.precio_descuento ?? producto?.precio_lista ?? 0)
      productoNombre = producto?.nombre || ""
      safeCosto = null
    } else {
      safePrecio = null
      safeCosto = null
    }
  } else {
    const { data: producto } = await db
      .from("productos")
      .select("nombre")
      .eq("id", producto_id)
      .eq("usuario_id", user.id)
      .single()
    productoNombre = producto?.nombre || ""
  }

  const { data: mov, error } = await db
    .from("producto_movimientos")
    .insert([
      {
        usuario_id: user.id,
        creado_por_username: username,
        producto_id,
        tipo,
        cantidad,
        costo_unitario: safeCosto,
        precio_unitario: safePrecio,
        cliente_id: cliente_id || null,
        empleada_id: tipo === "venta" ? (empleada_id || null) : null,
        metodo_pago: metodo_pago || null,
        nota,
        creado_por: user.id,
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const signo = tipo === "compra" || tipo === "ajuste_positivo" ? 1 : tipo === "venta" || tipo === "ajuste_negativo" ? -1 : 0

  if (signo !== 0) {
    const { data: current } = await db
      .from("productos")
      .select("stock_actual")
      .eq("id", producto_id)
      .eq("usuario_id", user.id)
      .single()
    const nuevoStock = Number(current?.stock_actual || 0) + signo * Number(cantidad)
    await db.from("productos").update({ stock_actual: nuevoStock }).eq("id", producto_id).eq("usuario_id", user.id)
  }

  let facturaResponse = null
  let facturaError: string | null = null
  let facturaId: string | null = null
  let facturaEstado: "emitida" | "pendiente" | null = null
  let facturaRetryPayload: FacturaRetryPayload | null = null
  if (facturar && tipo === "venta") {
    try {
      const { data: clienteData } = cliente_id
        ? await db.from("clientes").select("nombre, apellido").eq("id", cliente_id).eq("usuario_id", user.id).single()
        : { data: null }
      const total = Number(safePrecio || 0) * Number(cantidad || 0)
      const facturaItems: FacturaItem[] = [
        {
          tipo: "producto",
          descripcion: `Producto: ${productoNombre || "Producto"}`,
          cantidad: Number(cantidad || 1),
          precio_unitario: Number(safePrecio || 0),
          subtotal: total,
        },
      ]
      const clienteFactura = {
        nombre: clienteData?.nombre || "Consumidor",
        apellido: clienteData?.apellido || "Final",
      }
      facturaRetryPayload = buildFacturaRetryPayload({
        cliente: clienteFactura,
        items: facturaItems,
        total,
        metodo_pago: metodo_pago || "efectivo",
      })
      facturaResponse = await emitirFactura({
        cliente: clienteFactura,
        items: facturaItems,
        total,
        metodo_pago: metodo_pago || "efectivo",
        numero_sugerido: (await sugerirNumeroFacturaLocal({ db, userId: user.id })) || undefined,
      })
    } catch (error: any) {
      facturaError = error?.message || "No se pudo emitir la factura"
    }
  }

  if (facturaResponse?.factura) {
    const saved = await guardarFacturaEmitida({
      db,
      userId: user.id,
      username,
      origenTipo: "producto_venta",
      origenId: mov.id,
      clienteId: cliente_id || null,
      facturaResponse,
    })
    if (saved.error) {
      facturaError = facturaError || saved.error
    } else if (saved.facturaId) {
      facturaId = saved.facturaId
      facturaEstado = "emitida"
    }
  } else if (facturar && tipo === "venta" && facturaError) {
    if (!facturaRetryPayload) {
      const totalFallback = Number(safePrecio || 0) * Number(cantidad || 0)
      if (totalFallback > 0) {
        const fallbackItems: FacturaItem[] = [
          {
            tipo: "producto",
            descripcion: `Producto: ${productoNombre || "Producto"}`,
            cantidad: Number(cantidad || 1),
            precio_unitario: Number(safePrecio || 0),
            subtotal: totalFallback,
          },
        ]
        facturaRetryPayload = buildFacturaRetryPayload({
          cliente: { nombre: "Consumidor", apellido: "Final" },
          items: fallbackItems,
          total: totalFallback,
          metodo_pago: metodo_pago || "efectivo",
        })
      }
    }
    if (facturaRetryPayload) {
      const pending = await guardarFacturaPendiente({
        db,
        userId: user.id,
        username,
        origenTipo: "producto_venta",
        origenId: mov.id,
        clienteId: cliente_id || null,
        retryPayload: facturaRetryPayload,
        errorMessage: facturaError,
      })
      if (pending.error) {
        facturaError = pending.error
      } else if (pending.facturaId) {
        facturaId = pending.facturaId
        facturaEstado = "pendiente"
      }
    }
  }

  return NextResponse.json({
    movimiento: mov,
    factura: facturaResponse?.factura || null,
    factura_id: facturaId,
    factura_estado: facturaEstado,
    factura_pendiente: facturaEstado === "pendiente",
    factura_error: facturaError,
  })
}
