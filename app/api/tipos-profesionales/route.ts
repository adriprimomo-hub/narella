import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const tipoProfesionalSchema = z.object({
  nombre: z.string().trim().min(1),
})

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

export async function GET() {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("tipos_profesionales")
    .select("*")
    .eq("usuario_id", user.id)
    .order("nombre", { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(Array.isArray(data) ? data : [])
}

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, tipoProfesionalSchema)
  if (validationResponse) return validationResponse

  const { data, error } = await db
    .from("tipos_profesionales")
    .insert([
      {
        usuario_id: user.id,
        nombre: payload.nombre.trim(),
      },
    ])
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
