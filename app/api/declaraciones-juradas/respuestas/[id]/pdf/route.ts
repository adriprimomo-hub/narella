import { NextResponse } from "next/server"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { getUserRole } from "@/lib/permissions"
import { isStaffRole } from "@/lib/roles"

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
  const { data, error } = await db
    .from("declaraciones_juradas_respuestas")
    .select("pdf_base64, pdf_filename")
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.pdf_base64) {
    return NextResponse.json({ error: "No hay PDF generado para esta declaración." }, { status: 404 })
  }

  let pdfBytes: Uint8Array
  try {
    pdfBytes = Uint8Array.from(Buffer.from(String(data.pdf_base64), "base64"))
  } catch {
    return NextResponse.json({ error: "No se pudo procesar el PDF guardado." }, { status: 500 })
  }

  const filename = String(data.pdf_filename || "declaracion-jurada.pdf")
  const pdfArrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer
  return new NextResponse(pdfArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

