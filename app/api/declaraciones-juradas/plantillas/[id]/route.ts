import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import { validateBody } from "@/lib/api/validation"
import { DECLARACION_CAMPO_TIPOS, normalizeDeclaracionCampos } from "@/lib/declaraciones-juradas"

const updatePlantillaSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    descripcion: z.string().optional().nullable(),
    texto_intro: z.string().min(1).optional(),
    requiere_firma: z.boolean().optional(),
    activa: z.boolean().optional(),
    campos: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          tipo: z.enum(DECLARACION_CAMPO_TIPOS),
          requerido: z.boolean().optional(),
          placeholder: z.string().optional().nullable(),
          ayuda: z.string().optional().nullable(),
          opciones: z.array(z.string()).optional(),
        }),
      )
      .min(1)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Debes enviar al menos un campo" })

const sanitizePlantilla = (row: any) => ({
  ...row,
  campos: normalizeDeclaracionCampos(row?.campos),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data: payload, response: validationResponse } = await validateBody(request, updatePlantillaSchema)
  if (validationResponse) return validationResponse

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }
  if (payload.nombre !== undefined) updates.nombre = payload.nombre.trim()
  if (payload.descripcion !== undefined) updates.descripcion = payload.descripcion?.trim() || null
  if (payload.texto_intro !== undefined) updates.texto_intro = payload.texto_intro.trim()
  if (payload.requiere_firma !== undefined) updates.requiere_firma = payload.requiere_firma
  if (payload.activa !== undefined) updates.activa = payload.activa
  if (payload.campos !== undefined) {
    const campos = normalizeDeclaracionCampos(payload.campos)
    if (campos.length === 0) {
      return NextResponse.json({ error: "Debes definir al menos un campo válido." }, { status: 400 })
    }
    updates.campos = campos
  }

  const tenantId = getTenantId(user)
  const { data, error } = await db
    .from("declaraciones_juradas_plantillas")
    .update(updates)
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message || "No se pudo actualizar la plantilla" }, { status: 500 })
  return NextResponse.json(sanitizePlantilla(data))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const tenantId = getTenantId(user)
  const { error } = await db
    .from("declaraciones_juradas_plantillas")
    .delete()
    .eq("id", id)
    .eq("usuario_id", tenantId)

  if (error) return NextResponse.json({ error: error.message || "No se pudo eliminar la plantilla" }, { status: 500 })
  return NextResponse.json({ success: true })
}

