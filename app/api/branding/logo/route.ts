import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"

const resolveLogoDataUrl = () => {
  const inline = process.env.FACTURA_LOGO_DATA
  if (inline && inline.startsWith("data:image/")) return inline

  const logoPath = process.env.FACTURA_LOGO_PATH
  if (logoPath) {
    const filePath = path.isAbsolute(logoPath) ? logoPath : path.join(process.cwd(), logoPath)
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase()
      const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
      const buffer = fs.readFileSync(filePath)
      return `data:${contentType};base64,${buffer.toString("base64")}`
    }
  }

  return null
}

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (user) {
      const tenantId = getTenantId(user) || user.id
      const { data: tenantUser } = await db
        .from("usuarios")
        .select("factura_logo_url")
        .eq("id", tenantId)
        .maybeSingle()
      const tenantLogo = String(tenantUser?.factura_logo_url || "").trim()
      if (tenantLogo) {
        return NextResponse.json({ data_url: tenantLogo }, { headers: { "Cache-Control": "no-store" } })
      }
    }
  } catch (error) {
    console.warn("[branding] No se pudo cargar logo por tenant", error)
  }

  const dataUrl = resolveLogoDataUrl()
  return NextResponse.json({ data_url: dataUrl || null }, { headers: { "Cache-Control": "no-store" } })
}
