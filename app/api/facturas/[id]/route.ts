import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

const normalizeActor = (row: any) => {
  const userId = typeof row?.creado_por === "string" && row.creado_por.trim() ? row.creado_por.trim() : null
  const username =
    typeof row?.creado_por_username === "string" && row.creado_por_username.trim()
      ? row.creado_por_username.trim()
      : null
  return {
    creado_por: userId,
    creado_por_username: username,
    por: {
      user_id: userId,
      username,
    },
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role) && role !== "recepcion") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const tenantId = getTenantId(user)

  const { data, error } = await db
    .from("facturas")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", tenantId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Factura no encontrada" }, { status: 404 })
  }

  const { pdf_base64: _pdf, ...rest } = data || {}
  return NextResponse.json({
    ...rest,
    ...normalizeActor(data),
    has_pdf: Boolean(data?.pdf_base64 || data?.pdf_storage_path),
  })
}

