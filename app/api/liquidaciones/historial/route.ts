import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

export async function GET(request: Request) {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const url = new URL(request.url)
    const empleadaId = url.searchParams.get("empleada_id")?.trim() || ""
    const limitRaw = Number.parseInt(url.searchParams.get("limit") || "", 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 80

    let query: any = db
      .from("liquidaciones_historial")
      .select(
        "id, created_at, desde, hasta, empleada_id, empleada_nombre, empleada_apellido, items, total_comision, total_adelantos, total_neto",
      )
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (empleadaId) {
      query = query.eq("empleada_id", empleadaId)
    }

    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json([])
      }
      return NextResponse.json({ error: error.message || "No se pudo obtener el historial." }, { status: 500 })
    }

    const rows = (Array.isArray(data) ? data : []).map((row: any) => ({
      id: row.id,
      created_at: row.created_at,
      desde: row.desde,
      hasta: row.hasta,
      empleada_id: row.empleada_id,
      empleada_nombre: row.empleada_nombre,
      empleada_apellido: row.empleada_apellido,
      items: Array.isArray(row.items) ? row.items : [],
      total_comision: Number(row.total_comision || 0),
      total_adelantos: Number(row.total_adelantos || 0),
      total_neto: Number(row.total_neto || 0),
    }))

    return NextResponse.json(rows)
  } catch (error) {
    console.error("[liquidaciones-historial] unexpected error", error)
    return NextResponse.json({ error: "No se pudo obtener el historial de liquidaciones." }, { status: 500 })
  }
}

