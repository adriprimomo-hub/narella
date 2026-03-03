import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const DEFAULT_GIFTCARD_TEMPLATE_PATH = "certs/giftcards/giftcard-template.pdf"

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
  const dataUrl = readTemplateDataUrl()
  return NextResponse.json({ data_url: dataUrl || null }, { headers: { "Cache-Control": "no-store" } })
}
