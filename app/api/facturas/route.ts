import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

const toDateKey = (value?: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const matchesDateRange = (value: string | null | undefined, desde?: string, hasta?: string) => {
  const key = toDateKey(value)
  if (!key) return false
  if (desde && key < desde) return false
  if (hasta && key > hasta) return false
  return true
}

const isFacturasTableMissingError = (error: any) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes("public.facturas") && message.includes("schema cache")
}

const isMissingColumnError = (error: any, column: string) => {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") {
    return message.includes(col)
  }
  return message.includes("schema cache") && message.includes(col)
}

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && role !== "recepcion") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(request.url)
  const queryText = url.searchParams.get("q")?.trim() || ""
  const tipo = url.searchParams.get("tipo") || ""
  const estado = url.searchParams.get("estado") || ""
  const desde = url.searchParams.get("desde") || ""
  const hasta = url.searchParams.get("hasta") || ""
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
  const pageParam = Number.parseInt(url.searchParams.get("page") || "", 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null

  const buildBaseQuery = () => {
    let query = db.from("facturas").select("*").eq("usuario_id", user.id)
    if (!queryText && limit && !page) query = query.limit(limit)
    return query
  }

  let { data, error } = await buildBaseQuery().order("fecha", { ascending: false })

  if (error && isMissingColumnError(error, "fecha")) {
    ;({ data, error } = await buildBaseQuery().order("created_at", { ascending: false }))
  }
  if (error && isMissingColumnError(error, "created_at")) {
    ;({ data, error } = await buildBaseQuery())
  }

  if (error) {
    if (isFacturasTableMissingError(error)) {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let results = Array.isArray(data) ? data : []

  if (tipo) {
    results = results.filter((row: any) => row.tipo === tipo)
  }
  if (estado) {
    results = results.filter((row: any) => row.estado === estado)
  }
  if (desde || hasta) {
    results = results.filter((row: any) => matchesDateRange(row.fecha || row.created_at, desde, hasta))
  }

  if (queryText) {
    const term = queryText.toLowerCase()
    results = results.filter((row: any) => {
      const cliente = `${row.cliente_nombre || ""} ${row.cliente_apellido || ""}`.toLowerCase()
      const numero = `${row.numero ?? ""}`.toLowerCase()
      const puntoVenta = `${row.punto_venta ?? ""}`.toLowerCase()
      const cae = `${row.cae || ""}`.toLowerCase()
      const metodo = `${row.metodo_pago || ""}`.toLowerCase()
      const estadoRow = `${row.estado || ""}`.toLowerCase()
      const tipoRow = `${row.tipo || ""}`.toLowerCase()
      return (
        cliente.includes(term) ||
        numero.includes(term) ||
        puntoVenta.includes(term) ||
        cae.includes(term) ||
        metodo.includes(term) ||
        estadoRow.includes(term) ||
        tipoRow.includes(term)
      )
    })
  }

  if (limit) {
    if (page) {
      const offset = (page - 1) * limit
      results = results.slice(offset, offset + limit)
    } else {
      results = results.slice(0, limit)
    }
  }

  const sanitized = results.map((row: any) => {
    const { pdf_base64: _pdf, ...rest } = row || {}
    return { ...rest, has_pdf: Boolean(row?.pdf_base64 || row?.pdf_storage_path) }
  })

  return NextResponse.json(sanitized)
}
