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

export async function PUT(request: Request, { params }: { params: Promise<{ ausenciaId: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { ausenciaId } = await params

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

  const { data, error } = await db
    .from("empleada_ausencias")
    .update({
      fecha_desde,
      fecha_hasta,
      hora_desde: hora_desde || null,
      hora_hasta: hora_hasta || null,
      motivo,
      descripcion: descripcion || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ausenciaId)
    .eq("usuario_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ ausenciaId: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { ausenciaId } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await db
    .from("empleada_ausencias")
    .delete()
    .eq("id", ausenciaId)
    .eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
