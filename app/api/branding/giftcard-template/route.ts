import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { resolveTenantGiftcardTemplate } from "@/lib/tenant-config"

const DEFAULT_GIFTCARD_TEMPLATE_PATH = "certs/giftcards/giftcard-template.pdf"
const DEFAULT_GIFTCARD_TEMPLATE_PUBLIC_URL = "/templates/giftcard-template.pdf"

const mimeFromExtension = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".pdf") return "application/pdf"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  return "image/png"
}

const readTemplateDataUrl = () => {
  const inline = process.env.GIFTCARD_TEMPLATE_DATA
  if (inline && inline.startsWith("data:")) return inline

  const configuredPath = process.env.GIFTCARD_TEMPLATE_PATH || DEFAULT_GIFTCARD_TEMPLATE_PATH
  const filePath = path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath)
  if (!fs.existsSync(filePath)) return null

  const mime = mimeFromExtension(filePath)
  const buffer = fs.readFileSync(filePath)
  return `data:${mime};base64,${buffer.toString("base64")}`
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
      const tenantTemplate = await resolveTenantGiftcardTemplate(db, tenantId)
      if (tenantTemplate) {
        return NextResponse.json(
          { data_url: tenantTemplate, public_url: DEFAULT_GIFTCARD_TEMPLATE_PUBLIC_URL },
          { headers: { "Cache-Control": "no-store" } },
        )
      }
    }
  } catch (error) {
    console.warn("[branding] No se pudo cargar plantilla de giftcard por tenant", error)
  }

  const dataUrl = readTemplateDataUrl()
  return NextResponse.json(
    { data_url: dataUrl || null, public_url: DEFAULT_GIFTCARD_TEMPLATE_PUBLIC_URL },
    { headers: { "Cache-Control": "no-store" } },
  )
}
