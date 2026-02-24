import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const ausenciaSchema = z.object({
  fecha_desde: z.string().min(1),
  fecha_hasta: z.string().min(1),
  hora_desde: z.string().optional().nullable(),
  hora_hasta: z.string().optional().nullable(),
  motivo: z.enum(["vacaciones", "licencia", "enfermedad", "otro"]),
  descripcion: z.string().optional().nullable(),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id: empleadaId } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("empleada_ausencias")
    .select("*")
    .eq("usuario_id", user.id)
    .eq("empleada_id", empleadaId)
    .order("fecha_desde", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id: empleadaId } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, ausenciaSchema)
  if (validationResponse) return validationResponse
  const { fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, descripcion } = payload

  if (fecha_hasta < fecha_desde) {
    return NextResponse.json({ error: "La fecha hasta debe ser mayor o igual a fecha desde" }, { status: 400 })
  }

  // Validación de horarios parciales
  if ((hora_desde && !hora_hasta) || (!hora_desde && hora_hasta)) {
    return NextResponse.json({ error: "Si especifica horario, debe incluir hora desde y hasta" }, { status: 400 })
  }

  if (hora_desde && hora_hasta && hora_hasta <= hora_desde) {
    return NextResponse.json({ error: "La hora hasta debe ser mayor a hora desde" }, { status: 400 })
  }

  const { data: empleada } = await db
    .from("empleadas")
    .select("id")
    .eq("id", empleadaId)
    .eq("usuario_id", user.id)
    .single()

  if (!empleada) {
    return NextResponse.json({ error: "Empleada no encontrada" }, { status: 404 })
  }

  const { data, error } = await db
    .from("empleada_ausencias")
    .insert([
      {
        usuario_id: user.id,
        empleada_id: empleadaId,
        fecha_desde,
        fecha_hasta,
        hora_desde: hora_desde || null,
        hora_hasta: hora_hasta || null,
        motivo,
        descripcion: descripcion || null,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
