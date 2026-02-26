import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"

const recordatorioSchema = z.object({
  cliente_id: z.string().min(1),
  servicio_id: z.string().min(1),
})

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, recordatorioSchema)
  if (validationResponse) return validationResponse

  const nowIso = new Date().toISOString()

  const { error } = await db.from("servicio_vencido_recordatorios").upsert(
    {
      usuario_id: user.id,
      cliente_id: payload.cliente_id,
      servicio_id: payload.servicio_id,
      enviado_at: nowIso,
      enviado_por: user.id,
      updated_at: nowIso,
    },
    { onConflict: "usuario_id,cliente_id,servicio_id" },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    enviado_at: nowIso,
  })
}
