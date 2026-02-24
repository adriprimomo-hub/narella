import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const empleadaId = url.searchParams.get("empleada_id")
  const fecha = url.searchParams.get("fecha")

  let query = db
    .from("empleada_ausencias")
    .select("*, empleadas:empleada_id(nombre)")
    .eq("usuario_id", user.id)

  if (empleadaId) {
    query = query.eq("empleada_id", empleadaId)
  }

  if (fecha) {
    query = query.lte("fecha_desde", fecha).gte("fecha_hasta", fecha)
  }

  const { data, error } = await query.order("fecha_desde", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
