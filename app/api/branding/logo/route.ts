import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

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
  const dataUrl = resolveLogoDataUrl()
  return NextResponse.json({ data_url: dataUrl || null }, { headers: { "Cache-Control": "no-store" } })
}
