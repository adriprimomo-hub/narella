import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { getUserRole } from "@/lib/permissions"
import { isStaffRole } from "@/lib/roles"
import { normalizeDeclaracionCampos } from "@/lib/declaraciones-juradas"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (isStaffRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const tenantId = getTenantId(user)

  const { data: respuesta, error } = await db
    .from("declaraciones_juradas_respuestas")
    .select(
      "*, plantilla:plantilla_id(id, nombre, texto_intro, campos, requiere_firma), turnos:turno_id(id, fecha_inicio), clientes:cliente_id(id, nombre, apellido, telefono)",
    )
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!respuesta) return NextResponse.json({ error: "Declaración no encontrada" }, { status: 404 })

  return NextResponse.json({
    ...respuesta,
    pdf_disponible: Boolean(respuesta.pdf_base64),
    plantilla: respuesta.plantilla
      ? {
          ...respuesta.plantilla,
          campos: normalizeDeclaracionCampos(respuesta.plantilla.campos),
        }
      : null,
  })
}

