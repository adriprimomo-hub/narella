import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const horarioSchema = z.object({
  dia: z.coerce.number().int().min(0).max(6),
  desde: z.string().min(1),
  hasta: z.string().min(1),
})

const empleadaSchema = z.object({
  nombre: z.string().trim().min(1),
  apellido: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  horarios: z.array(horarioSchema).optional(),
  activo: z.boolean().optional(),
})

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "true"
  let query = db.from("empleadas").select("*").eq("usuario_id", user.id)
  if (!includeInactive) {
    query = query.eq("activo", true)
  }
  const { data, error } = await query.order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, empleadaSchema)
  if (validationResponse) return validationResponse
  const horarios = Array.isArray(payload.horarios) ? payload.horarios : []

  const telefono = payload.telefono?.trim() || null
  const { data, error } = await db
    .from("empleadas")
    .insert([
      {
        usuario_id: user.id,
        nombre: payload.nombre,
        apellido: payload.apellido ?? "",
        telefono,
        horarios,
        activo: payload.activo ?? true,
      },
    ])
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
