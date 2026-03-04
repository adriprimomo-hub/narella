import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/localdb/server"
import { normalizeDeclaracionCampos, validateDeclaracionRespuestas } from "@/lib/declaraciones-juradas"
import { validateBody } from "@/lib/api/validation"

const submitSchema = z.object({
  respuestas: z.record(z.unknown()).optional(),
  firma_data_url: z.string().optional().nullable(),
})

const extractIpAddress = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const [first] = forwardedFor.split(",")
    if (first && first.trim()) return first.trim()
  }
  return request.headers.get("x-real-ip") || null
}

const isExpired = (value?: string | null) => {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  return date.getTime() < Date.now()
}

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const db = await createClient()
  const { token } = await params
  const tokenValue = String(token || "").trim()
  if (!tokenValue) return NextResponse.json({ error: "Token inválido" }, { status: 400 })

  const { data: respuesta, error } = await db
    .from("declaraciones_juradas_respuestas")
    .select("*")
    .eq("token", tokenValue)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!respuesta) return NextResponse.json({ error: "Declaración no encontrada" }, { status: 404 })

  if (respuesta.estado === "pendiente" && isExpired(respuesta.link_expires_at)) {
    await db
      .from("declaraciones_juradas_respuestas")
      .update({ estado: "expirada", updated_at: new Date().toISOString() })
      .eq("id", respuesta.id)
      .eq("estado", "pendiente")
    return NextResponse.json({ error: "El link de la declaración expiró.", estado: "expirada" }, { status: 410 })
  }

  const { data: plantilla, error: plantillaError } = await db
    .from("declaraciones_juradas_plantillas")
    .select("id, nombre, descripcion, texto_intro, campos, requiere_firma, activa")
    .eq("id", respuesta.plantilla_id)
    .maybeSingle()

  if (plantillaError) return NextResponse.json({ error: plantillaError.message }, { status: 500 })
  if (!plantilla) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 })

  const { data: turno } = await db
    .from("turnos")
    .select("id, fecha_inicio, clientes:cliente_id(nombre, apellido), servicios:servicio_id(nombre)")
    .eq("id", respuesta.turno_id)
    .maybeSingle()

  const campos = normalizeDeclaracionCampos(plantilla.campos)

  return NextResponse.json({
    id: respuesta.id,
    token: tokenValue,
    estado: respuesta.estado,
    turno: turno
      ? {
          id: turno.id,
          fecha_inicio: turno.fecha_inicio,
          cliente: `${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim(),
          servicio: turno.servicios?.nombre || "",
        }
      : null,
    plantilla: {
      id: plantilla.id,
      nombre: plantilla.nombre,
      descripcion: plantilla.descripcion,
      texto_intro: plantilla.texto_intro,
      campos,
      requiere_firma: Boolean(plantilla.requiere_firma),
    },
    respuestas: respuesta.respuestas || {},
    firma_data_url: respuesta.firma_data_url || null,
    submitted_at: respuesta.submitted_at || null,
  })
}

export async function POST(request: Request, { params }: RouteContext) {
  const db = await createClient()
  const { token } = await params
  const tokenValue = String(token || "").trim()
  if (!tokenValue) return NextResponse.json({ error: "Token inválido" }, { status: 400 })

  const { data: body, response: validationResponse } = await validateBody(request, submitSchema)
  if (validationResponse) return validationResponse

  const { data: respuesta, error } = await db
    .from("declaraciones_juradas_respuestas")
    .select("*")
    .eq("token", tokenValue)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!respuesta) return NextResponse.json({ error: "Declaración no encontrada" }, { status: 404 })

  if (respuesta.estado !== "pendiente") {
    return NextResponse.json({ error: "Esta declaración ya fue respondida.", estado: respuesta.estado }, { status: 409 })
  }

  if (isExpired(respuesta.link_expires_at)) {
    await db
      .from("declaraciones_juradas_respuestas")
      .update({ estado: "expirada", updated_at: new Date().toISOString() })
      .eq("id", respuesta.id)
      .eq("estado", "pendiente")
    return NextResponse.json({ error: "El link de la declaración expiró.", estado: "expirada" }, { status: 410 })
  }

  const { data: plantilla, error: plantillaError } = await db
    .from("declaraciones_juradas_plantillas")
    .select("id, campos, requiere_firma")
    .eq("id", respuesta.plantilla_id)
    .maybeSingle()

  if (plantillaError) return NextResponse.json({ error: plantillaError.message }, { status: 500 })
  if (!plantilla) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 })

  const campos = normalizeDeclaracionCampos(plantilla.campos)
  if (campos.length === 0) {
    return NextResponse.json({ error: "La plantilla no tiene campos válidos." }, { status: 409 })
  }

  const validation = validateDeclaracionRespuestas(campos, body.respuestas)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors[0] || "Respuestas inválidas." }, { status: 400 })
  }

  const firmaDataUrl = body.firma_data_url ? String(body.firma_data_url).trim() : ""
  if (plantilla.requiere_firma && !firmaDataUrl) {
    return NextResponse.json({ error: "La firma es obligatoria para enviar la declaración." }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const updatePayload = {
    estado: "completada",
    respuestas: validation.respuestas,
    firma_data_url: firmaDataUrl || null,
    submitted_at: nowIso,
    ip_address: extractIpAddress(request),
    user_agent: request.headers.get("user-agent") || null,
    updated_at: nowIso,
  }

  const { error: updateError } = await db
    .from("declaraciones_juradas_respuestas")
    .update(updatePayload)
    .eq("id", respuesta.id)
    .eq("estado", "pendiente")

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await db
    .from("turnos")
    .update({ declaracion_jurada_respuesta_id: respuesta.id, updated_at: nowIso })
    .eq("id", respuesta.turno_id)
    .eq("usuario_id", respuesta.usuario_id)

  return NextResponse.json({ success: true, estado: "completada" })
}
