import { jsPDF } from "jspdf"

type DeclaracionCampo = {
  id: string
  label: string
  tipo: string
}

type BuildDeclaracionJuradaPdfArgs = {
  plantillaNombre: string
  textoIntro?: string | null
  campos: DeclaracionCampo[]
  respuestas: Record<string, unknown>
  firmaDataUrl?: string | null
  clienteNombre?: string | null
  servicioNombre?: string | null
  fechaTurno?: string | null
  submittedAt?: string | null
}

const sanitizeFilePart = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const normalizeAnswer = (value: unknown) => {
  if (value === null || value === undefined) return "-"
  const raw = String(value).trim()
  if (!raw) return "-"
  if (raw.toLowerCase() === "si") return "Si"
  if (raw.toLowerCase() === "no") return "No"
  return raw
}

const splitText = (doc: jsPDF, text: string, maxWidth: number) => {
  const safe = String(text || "").trim()
  if (!safe) return []
  return doc.splitTextToSize(safe, maxWidth) as string[]
}

export const buildDeclaracionJuradaPdf = (args: BuildDeclaracionJuradaPdfArgs) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 42
  const maxTextWidth = pageWidth - marginX * 2
  let y = 52

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 40) return
    doc.addPage()
    y = 52
  }

  const writeLines = (lines: string[], lineHeight = 14) => {
    lines.forEach((line) => {
      ensureSpace(lineHeight + 2)
      doc.text(line, marginX, y)
      y += lineHeight
    })
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(args.plantillaNombre || "Declaracion jurada", marginX, y)
  y += 24

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const metaLines = [
    args.clienteNombre ? `Clienta: ${args.clienteNombre}` : "",
    args.servicioNombre ? `Servicio: ${args.servicioNombre}` : "",
    args.fechaTurno ? `Turno: ${new Date(args.fechaTurno).toLocaleString("es-AR")}` : "",
    args.submittedAt ? `Respondida: ${new Date(args.submittedAt).toLocaleString("es-AR")}` : "",
  ].filter(Boolean)
  writeLines(metaLines, 13)
  if (metaLines.length > 0) y += 6

  const introLines = splitText(doc, args.textoIntro || "", maxTextWidth)
  if (introLines.length > 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    writeLines(introLines, 15)
    y += 10
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  ensureSpace(24)
  doc.text("Respuestas", marginX, y)
  y += 18

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const camposMap = new Map(args.campos.map((campo) => [campo.id, campo.label || campo.id]))
  const keys = Object.keys(args.respuestas || {})
  keys.forEach((key) => {
    const label = camposMap.get(key) || key
    const value = normalizeAnswer(args.respuestas[key])
    const valueLines = splitText(doc, value, maxTextWidth - 140)
    ensureSpace(Math.max(20, valueLines.length * 13 + 8))
    doc.setFont("helvetica", "bold")
    doc.text(`${label}:`, marginX, y)
    doc.setFont("helvetica", "normal")
    if (valueLines.length === 0) {
      doc.text("-", marginX + 138, y)
      y += 16
      return
    }
    let localY = y
    valueLines.forEach((line) => {
      doc.text(line, marginX + 138, localY)
      localY += 13
    })
    y = localY + 4
  })

  if (args.firmaDataUrl) {
    ensureSpace(190)
    y += 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Firma", marginX, y)
    y += 12

    const match = String(args.firmaDataUrl).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/)
    const mime = String(match?.[1] || "").toLowerCase()
    const format = mime.includes("png") ? "PNG" : mime.includes("jpeg") || mime.includes("jpg") ? "JPEG" : ""
    if (format) {
      const boxW = maxTextWidth
      const boxH = 150
      doc.setDrawColor(203, 213, 225)
      doc.rect(marginX, y, boxW, boxH)
      doc.addImage(args.firmaDataUrl, format, marginX + 6, y + 6, boxW - 12, boxH - 12, undefined, "FAST")
      y += boxH + 8
    }
  }

  const pdfArrayBuffer = doc.output("arraybuffer") as ArrayBuffer
  const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64")
  const datePart = new Date().toISOString().slice(0, 10)
  const nombrePart = sanitizeFilePart(args.plantillaNombre || "declaracion-jurada")
  const filename = `declaracion-jurada-${nombrePart || "plantilla"}-${datePart}.pdf`

  return {
    pdf_base64: pdfBase64,
    pdf_filename: filename,
  }
}
