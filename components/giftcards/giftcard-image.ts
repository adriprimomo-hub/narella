import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

export type GiftcardImageInput = {
  numero: string
  cliente: string
  servicios: string[]
  validoHasta?: string | null
  deParteDe?: string | null
  logoDataUrl?: string | null
  templateDataUrl?: string | null
  montoTotal?: number | null
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) => {
  const words = text.split(" ")
  let line = ""
  const lines: string[] = []
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = testLine
    }
  })
  if (line) lines.push(line)
  lines.forEach((l, idx) => {
    ctx.fillText(l, x, y + idx * lineHeight)
  })
  return lines.length
}

const ensureFonts = async () => {
  if (typeof document === "undefined" || !document.fonts) return
  try {
    await document.fonts.load("700 58px Poppins")
    await document.fonts.load("500 24px Poppins")
    await document.fonts.load("400 18px Poppins")
    await document.fonts.ready
  } catch {
    // ignore
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Formato de archivo no soportado"))
    }
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
    reader.readAsDataURL(blob)
  })

const parseDataUrl = (value: string) => {
  const match = String(value || "").match(/^data:(.*?);base64,(.+)$/)
  if (!match) return null
  return { mime: String(match[1] || ""), base64: String(match[2] || "") }
}

const base64ToBytes = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const formatDateEsAr = (value: string | null | undefined) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("es-AR")
}

const fitText = (font: PDFFont, text: string, maxWidth: number, baseSize: number, minSize = 8) => {
  let size = baseSize
  const raw = String(text || "").trim()
  let value = raw || "-"

  while (size > minSize && font.widthOfTextAtSize(value, size) > maxWidth) {
    size -= 0.5
  }
  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return { text: value, size }
  }

  value = raw || "-"
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1)
  }
  return { text: `${value}...`, size }
}

const drawFittedText = (args: {
  page: PDFPage
  font: PDFFont
  text: string
  x: number
  y: number
  maxWidth: number
  baseSize: number
  color: ReturnType<typeof rgb>
}) => {
  const fitted = fitText(args.font, args.text, args.maxWidth, args.baseSize)
  args.page.drawText(fitted.text, {
    x: args.x,
    y: args.y,
    size: fitted.size,
    font: args.font,
    color: args.color,
  })
}

const fillGiftcardTemplatePdf = async (templatePdfDataUrl: string, data: GiftcardImageInput) => {
  const parsed = parseDataUrl(templatePdfDataUrl)
  if (!parsed || !parsed.mime.toLowerCase().includes("pdf")) return templatePdfDataUrl

  const templateDoc = await PDFDocument.load(base64ToBytes(parsed.base64))
  const templatePages = templateDoc.getPages()
  if (!templatePages.length) return templatePdfDataUrl

  const templatePage = templatePages[0]
  const { width, height } = templatePage.getSize()

  const pdfDoc = await PDFDocument.create()
  const embeddedTemplate = await pdfDoc.embedPage(templatePage)
  const page = pdfDoc.addPage([width, height])
  page.drawPage(embeddedTemplate, { x: 0, y: 0, width, height })

  const textColor = rgb(0.17, 0.14, 0.13)
  const darkGold = rgb(0.55, 0.4, 0.27)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const yFromTop = (top: number) => height - top

  const deParteDe = String(data.deParteDe || "").trim() || "Narella"
  const para = String(data.cliente || "").trim() || "Cliente"
  const monto = Number(data.montoTotal || 0)
  const servicios = Array.isArray(data.servicios) ? data.servicios.filter(Boolean) : []
  const valePor =
    monto > 0
      ? `ARS $${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : servicios.length
        ? servicios.join(", ")
        : "Servicio"
  const validoHasta = formatDateEsAr(data.validoHasta)

  // Coordenadas calibradas para certs/giftcards/giftcard-template.pdf (419.25 x 297.75 pt)
  drawFittedText({
    page,
    font: fontBold,
    text: deParteDe,
    x: 133,
    y: yFromTop(143),
    maxWidth: 178,
    baseSize: 12.5,
    color: textColor,
  })
  drawFittedText({
    page,
    font: fontBold,
    text: para,
    x: 133,
    y: yFromTop(172),
    maxWidth: 178,
    baseSize: 12.5,
    color: textColor,
  })
  drawFittedText({
    page,
    font: fontBold,
    text: valePor,
    x: 182,
    y: yFromTop(201),
    maxWidth: 130,
    baseSize: 12.5,
    color: textColor,
  })
  drawFittedText({
    page,
    font: fontRegular,
    text: validoHasta,
    x: 281,
    y: yFromTop(273),
    maxWidth: 70,
    baseSize: 10,
    color: textColor,
  })

  if (data.numero) {
    drawFittedText({
      page,
      font: fontRegular,
      text: `Nro ${data.numero}`,
      x: 312,
      y: yFromTop(33),
      maxWidth: 95,
      baseSize: 9,
      color: darkGold,
    })
  }

  const bytes = await pdfDoc.save()
  const normalizedBytes = Uint8Array.from(bytes)
  return blobToDataUrl(new Blob([normalizedBytes], { type: "application/pdf" }))
}

const resolveTemplatePdfDataUrl = async (source: string | null | undefined) => {
  const value = String(source || "").trim()
  if (!value) return null
  const lower = value.toLowerCase()

  if (lower.startsWith("data:application/pdf;")) return value
  if (lower.startsWith("data:")) return null

  try {
    const res = await fetch(value, { cache: "no-store" })
    if (!res.ok) return null
    const contentType = String(res.headers.get("content-type") || "").toLowerCase()
    const isPdf = contentType.includes("application/pdf") || lower.includes(".pdf")
    if (!isPdf) return null
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

export const generarGiftcardImagen = async (data: GiftcardImageInput) => {
  if (typeof document === "undefined") {
    throw new Error("Solo disponible en el navegador")
  }

  const templatePdfDataUrl = await resolveTemplatePdfDataUrl(data.templateDataUrl)
  if (templatePdfDataUrl) {
    try {
      return await fillGiftcardTemplatePdf(templatePdfDataUrl, data)
    } catch {
      return templatePdfDataUrl
    }
  }

  await ensureFonts()

  const canvas = document.createElement("canvas")
  canvas.width = 1200
  canvas.height = 750
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No se pudo crear el canvas")

  const w = canvas.width
  const h = canvas.height

  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, "#fdf2f8")
  gradient.addColorStop(0.5, "#fef6fb")
  gradient.addColorStop(1, "#f8f0ff")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)"
  ctx.beginPath()
  ctx.ellipse(w * 0.75, h * 0.2, 200, 140, Math.PI / 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "rgba(255, 214, 230, 0.45)"
  ctx.beginPath()
  ctx.ellipse(w * 0.2, h * 0.85, 240, 160, -Math.PI / 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = "rgba(231, 184, 206, 0.8)"
  ctx.lineWidth = 6
  ctx.strokeRect(24, 24, w - 48, h - 48)

  ctx.fillStyle = "#2b1f2a"
  ctx.font = "700 58px Poppins, sans-serif"
  ctx.fillText("GIFT CARD", 70, 130)

  const infoBoxWidth = 360
  const infoBoxHeight = 120
  const infoBoxX = w - infoBoxWidth - 70
  const infoBoxY = 60
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
  ctx.strokeStyle = "rgba(224, 150, 186, 0.7)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(infoBoxX, infoBoxY, infoBoxWidth, infoBoxHeight, 18)
  ctx.fill()
  ctx.stroke()

  ctx.textAlign = "left"
  ctx.fillStyle = "#7a2f56"
  ctx.font = "600 22px Poppins, sans-serif"
  ctx.fillText(`Nro ${data.numero}`, infoBoxX + 18, infoBoxY + 36)

  ctx.fillStyle = "#2b1f2a"
  ctx.font = "500 18px Poppins, sans-serif"
  ctx.fillText("Validez", infoBoxX + 18, infoBoxY + 66)
  const validoHasta = data.validoHasta ? new Date(data.validoHasta).toLocaleDateString("es-AR") : "-"
  ctx.font = "500 20px Poppins, sans-serif"
  ctx.fillText(`Hasta: ${validoHasta}`, infoBoxX + 18, infoBoxY + 92)

  if (data.logoDataUrl) {
    try {
      const logo = await loadImage(data.logoDataUrl)
      const targetSize = 72
      const ratio = logo.width / logo.height || 1
      const drawW = ratio >= 1 ? targetSize : targetSize * ratio
      const drawH = ratio >= 1 ? targetSize / ratio : targetSize
      const logoX = infoBoxX + infoBoxWidth - drawW - 16
      const logoY = infoBoxY + (infoBoxHeight - drawH) / 2
      ctx.drawImage(logo, logoX, logoY, drawW, drawH)
    } catch {
      // ignore logo errors
    }
  }

  ctx.fillStyle = "#43263b"
  ctx.font = "600 28px Poppins, sans-serif"
  ctx.fillText("Para", 70, 230)

  ctx.font = "600 36px Poppins, sans-serif"
  ctx.fillStyle = "#7a2f56"
  wrapText(ctx, data.cliente || "Cliente", 70, 280, 520, 44)

  ctx.fillStyle = "#43263b"
  ctx.font = "600 22px Poppins, sans-serif"
  ctx.fillText("Servicios", 70, 380)

  ctx.font = "400 20px Poppins, sans-serif"
  ctx.fillStyle = "#2b1f2a"
  const serviciosList = data.servicios?.length ? data.servicios : ["Servicio"]
  let servicesY = 420
  serviciosList.slice(0, 6).forEach((srv) => {
    ctx.fillText(`- ${srv}`, 70, servicesY)
    servicesY += 30
  })

  ctx.fillStyle = "#2b1f2a"
  ctx.font = "500 20px Poppins, sans-serif"
  ctx.fillText("De parte de", 70, 610)
  ctx.font = "400 22px Poppins, sans-serif"
  ctx.fillStyle = "#7a2f56"
  wrapText(ctx, data.deParteDe || "-", 70, 645, 520, 30)

  ctx.fillStyle = "rgba(47, 23, 40, 0.8)"
  ctx.font = "400 16px Poppins, sans-serif"
  ctx.fillText("Presentar esta giftcard al momento del servicio.", 70, h - 70)

  return canvas.toDataURL("image/jpeg", 0.92)
}
