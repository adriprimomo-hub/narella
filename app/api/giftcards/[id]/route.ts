import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import {
  deleteStorageObject,
  isSupabaseStorageConfigured,
  uploadGiftcardImageToStorage,
} from "@/lib/supabase/storage"

const giftcardUpdateSchema = z
  .object({
    cliente_id: z.string().min(1).optional(),
    servicio_ids: z.array(z.string().min(1)).min(1).optional(),
    valido_por_dias: z.coerce.number().int().positive().optional(),
    de_parte_de: z.string().optional().nullable(),
    monto_total: z.coerce.number().positive().optional(),
    metodo_pago: z.string().optional(),
    imagen_base64: z.string().optional().nullable(),
    estado: z.enum(["vigente", "anulada"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Debe enviar al menos un campo" })

const computeMontoServicios = (servicios: any[], ids: string[]) => {
  const map = new Map(servicios.map((s) => [s.id, s]))
  return ids.reduce((acc, id) => {
    const srv = map.get(id)
    const precio = Number(srv?.precio_lista ?? srv?.precio ?? 0)
    return acc + (Number.isFinite(precio) ? precio : 0)
  }, 0)
}

const isUsada = (row: any) => {
  const estado = row?.estado
  return estado === "usada" || Boolean(row?.usada_en) || Boolean(row?.usada_en_turno_id)
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

const sanitizeGiftcardRow = (row: any) => {
  const { imagen_base64: _img, ...rest } = row || {}
  return rest
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, giftcardUpdateSchema)
  if (validationResponse) return validationResponse

  const { data: current, error: currentError } = await db
    .from("giftcards")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .single()

  if (currentError || !current) {
    return NextResponse.json({ error: "Giftcard no encontrada" }, { status: 404 })
  }

  if (isUsada(current)) {
    return NextResponse.json({ error: "No se puede modificar una giftcard usada" }, { status: 400 })
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  let legacyImageBase64: string | null = null

  if (payload.cliente_id !== undefined) updateData.cliente_id = payload.cliente_id
  if (payload.servicio_ids !== undefined) updateData.servicio_ids = payload.servicio_ids
  if (payload.valido_por_dias !== undefined) {
    const validoPorDias = Number(payload.valido_por_dias)
    const validoHasta = new Date()
    validoHasta.setDate(validoHasta.getDate() + validoPorDias)
    validoHasta.setHours(23, 59, 59, 999)
    updateData.valido_por_dias = validoPorDias
    updateData.valido_hasta = validoHasta.toISOString()
  }
  if (payload.de_parte_de !== undefined) updateData.de_parte_de = payload.de_parte_de || null
  if (payload.monto_total !== undefined) updateData.monto_total = Number(payload.monto_total)
  if (payload.metodo_pago !== undefined) updateData.metodo_pago = payload.metodo_pago
  if (payload.estado !== undefined) updateData.estado = payload.estado

  if (payload.imagen_base64 !== undefined) {
    const rawImage = typeof payload.imagen_base64 === "string" ? payload.imagen_base64.trim() : payload.imagen_base64
    legacyImageBase64 = typeof rawImage === "string" && rawImage ? rawImage : null

    if (!rawImage) {
      updateData.imagen_base64 = null
      updateData.imagen_storage_bucket = null
      updateData.imagen_storage_path = null
      if (current?.imagen_storage_bucket && current?.imagen_storage_path) {
        await deleteStorageObject({
          bucket: current.imagen_storage_bucket,
          path: current.imagen_storage_path,
        })
      }
    } else if (isSupabaseStorageConfigured()) {
      try {
        const uploaded = await uploadGiftcardImageToStorage({
          usuarioId: user.id,
          giftcardId: id,
          imageData: rawImage,
        })
        updateData.imagen_base64 = null
        updateData.imagen_storage_bucket = uploaded.bucket
        updateData.imagen_storage_path = uploaded.path

        const currentBucket = String(current?.imagen_storage_bucket || "")
        const currentPath = String(current?.imagen_storage_path || "")
        if (
          currentBucket &&
          currentPath &&
          (currentBucket !== uploaded.bucket || currentPath !== uploaded.path)
        ) {
          await deleteStorageObject({ bucket: currentBucket, path: currentPath })
        }
      } catch (error: any) {
        console.warn("[giftcards] No se pudo subir imagen a Storage, se mantiene base64", {
          giftcardId: id,
          userId: user.id,
          error: error?.message || "Error desconocido",
        })
        updateData.imagen_base64 = rawImage
        updateData.imagen_storage_bucket = null
        updateData.imagen_storage_path = null
      }
    } else {
      updateData.imagen_base64 = rawImage
      updateData.imagen_storage_bucket = null
      updateData.imagen_storage_path = null
    }
  }

  if (payload.servicio_ids && payload.monto_total === undefined) {
    const { data: servicios } = await db
      .from("servicios")
      .select("id, precio, precio_lista")
      .in("id", payload.servicio_ids)
      .eq("usuario_id", user.id)
    const montoServicios = computeMontoServicios(servicios || [], payload.servicio_ids)
    if (Number.isFinite(montoServicios) && montoServicios > 0) {
      updateData.monto_total = montoServicios
    }
  }

  let { data, error } = await db
    .from("giftcards")
    .update(updateData)
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select(
      `
      *,
      clientes:cliente_id (id, nombre, apellido)
    `,
    )
    .single()

  if (
    error &&
    (isMissingColumnError(error, "imagen_storage_bucket") || isMissingColumnError(error, "imagen_storage_path"))
  ) {
    const legacyUpdate = { ...updateData } as Record<string, any>
    delete legacyUpdate.imagen_storage_bucket
    delete legacyUpdate.imagen_storage_path
    if (payload.imagen_base64 !== undefined) {
      legacyUpdate.imagen_base64 = legacyImageBase64
    }

    ;({ data, error } = await db
      .from("giftcards")
      .update(legacyUpdate)
      .eq("id", id)
      .eq("usuario_id", user.id)
      .select(
        `
      *,
      clientes:cliente_id (id, nombre, apellido)
    `,
      )
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(sanitizeGiftcardRow(data))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: current } = await db
    .from("giftcards")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .maybeSingle()

  if (current && isUsada(current)) {
    return NextResponse.json({ error: "No se puede eliminar una giftcard usada" }, { status: 400 })
  }

  if (current?.imagen_storage_bucket && current?.imagen_storage_path) {
    await deleteStorageObject({
      bucket: current.imagen_storage_bucket,
      path: current.imagen_storage_path,
    })
  }

  const { error } = await db.from("giftcards").delete().eq("id", id).eq("usuario_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
