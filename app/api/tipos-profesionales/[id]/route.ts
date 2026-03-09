import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const tipoProfesionalUpdateSchema = z.object({
  nombre: z.string().trim().min(1),
})

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, tipoProfesionalUpdateSchema)
  if (validationResponse) return validationResponse

  const { data, error } = await db
    .from("tipos_profesionales")
    .update({
      nombre: payload.nombre.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select("*")
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Falta crear la tabla de tipos profesionales." }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: relacionesEnUso, error: relacionesError } = await db
    .from("empleada_tipos_profesionales")
    .select("empleada_id")
    .eq("tipo_profesional_id", id)
    .eq("usuario_id", user.id)
    .limit(1)

  if (relacionesError && !isMissingTableError(relacionesError)) {
    return NextResponse.json({ error: relacionesError.message }, { status: 500 })
  }

  let tipoEnUso = Array.isArray(relacionesEnUso) && relacionesEnUso.length > 0
  if (!tipoEnUso && relacionesError && isMissingTableError(relacionesError)) {
    const { data: empleadasLegacy, error: legacyError } = await db
      .from("empleadas")
      .select("id")
      .eq("tipo_profesional_id", id)
      .eq("usuario_id", user.id)
      .limit(1)
    if (legacyError && !isMissingTableError(legacyError)) {
      return NextResponse.json({ error: legacyError.message }, { status: 500 })
    }
    tipoEnUso = Array.isArray(empleadasLegacy) && empleadasLegacy.length > 0
  }

  if (tipoEnUso) {
    return NextResponse.json(
      { error: "No se puede eliminar el tipo profesional porque hay empleadas que lo usan." },
      { status: 400 },
    )
  }

  const { error } = await db.from("tipos_profesionales").delete().eq("id", id).eq("usuario_id", user.id)

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Falta crear la tabla de tipos profesionales." }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
