export type GiftcardImageInput = {
  numero: string
  cliente: string
  servicios: string[]
  validoHasta?: string | null
  deParteDe?: string | null
  logoDataUrl?: string | null
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

export const generarGiftcardImagen = async (data: GiftcardImageInput) => {
  if (typeof document === "undefined") {
    throw new Error("Solo disponible en el navegador")
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
