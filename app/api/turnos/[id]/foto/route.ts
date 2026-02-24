import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getEmpleadaIdForUser, getUserRole } from "@/lib/permissions"
import { isStaffRole } from "@/lib/roles"
import { downloadStorageObject, parseDataUrl } from "@/lib/supabase/storage"

const toBinaryBody = (buffer: Buffer) => new Uint8Array(buffer)

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: turno, error: turnoError } = await db
    .from("turnos")
    .select(
      "id, empleada_id, empleada_final_id, foto_trabajo_base64, foto_trabajo_storage_bucket, foto_trabajo_storage_path, foto_trabajo_mime_type",
    )
    .eq("id", id)
    .eq("usuario_id", user.id)
    .single()

  if (turnoError || !turno) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 })
  }

  const role = await getUserRole(db, user.id)
  if (isStaffRole(role)) {
    const empleadaIdStaff = await getEmpleadaIdForUser(db, user.id)
    const isAssigned = turno.empleada_id === empleadaIdStaff || turno.empleada_final_id === empleadaIdStaff
    if (!isAssigned) {
      return NextResponse.json({ error: "No tienes acceso a este turno" }, { status: 403 })
    }
  }

  const headers = {
    "Cache-Control": "private, no-store",
  }

  if (turno.foto_trabajo_storage_path) {
    const downloaded = await downloadStorageObject({
      bucket: turno.foto_trabajo_storage_bucket,
      path: turno.foto_trabajo_storage_path,
    })
    if (downloaded.buffer) {
      return new NextResponse(toBinaryBody(downloaded.buffer), {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": turno.foto_trabajo_mime_type || "image/jpeg",
        },
      })
    }
  }

  const raw = typeof turno.foto_trabajo_base64 === "string" ? turno.foto_trabajo_base64.trim() : ""
  if (!raw) {
    return NextResponse.json({ error: "No hay foto disponible" }, { status: 404 })
  }

  const parsed = parseDataUrl(raw)
  const mimeType = parsed?.mimeType || turno.foto_trabajo_mime_type || "image/jpeg"
  try {
    const buffer = Buffer.from(parsed?.base64 || raw, "base64")
    if (!buffer.length) {
      return NextResponse.json({ error: "No hay foto disponible" }, { status: 404 })
    }
    return new NextResponse(toBinaryBody(buffer), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": mimeType,
      },
    })
  } catch {
    return NextResponse.json({ error: "No se pudo leer la foto del turno" }, { status: 500 })
  }
}
