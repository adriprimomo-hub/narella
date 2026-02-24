import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDate, formatDateRange } from "./date-format"

type LiquidacionPDF = {
  desde: string
  hasta: string
  empleada: { nombre: string; apellido?: string | null }
  items: Array<{
    tipo: "servicio" | "producto" | "adelanto"
    fecha?: string | null
    servicio?: string | null
    producto?: string | null
    comision?: number | null
    adelanto?: number | null
  }>
  totales: { comision: number; adelantos: number; neto: number }
}

export function buildLiquidacionPDF(resumen: LiquidacionPDF) {
  const doc = new jsPDF()
  const empleadaLabel = `${resumen.empleada.nombre} ${resumen.empleada.apellido || ""}`.trim()
  doc.text(`Liquidacion - ${empleadaLabel}`, 14, 18)
  doc.text(formatDateRange(resumen.desde, resumen.hasta), 14, 26)

  const rowTypes: Array<"servicio" | "producto" | "adelanto" | "total"> = []
  const rows = resumen.items.map((item) => {
    const fecha = formatDate(item.fecha) || "-"
    const servicioCell = item.tipo === "servicio" ? `${item.servicio || "-"}` : "-"
    const productoCell = item.tipo === "producto" ? `${item.producto || "-"}` : "-"
    const comisionCell =
      item.tipo !== "adelanto" && Number.isFinite(Number(item.comision))
        ? `$${Number(item.comision || 0).toFixed(2)}`
        : "-"
    const adelantoCell =
      item.tipo === "adelanto" ? `-$${Math.abs(Number(item.adelanto || 0)).toFixed(2)}` : "-"
    rowTypes.push(item.tipo)
    return [fecha, servicioCell, productoCell, comisionCell, adelantoCell, "-"]
  })

  rows.push([
    "-",
    "Totales",
    "-",
    `$${Number(resumen.totales.comision || 0).toFixed(2)}`,
    Number(resumen.totales.adelantos || 0) > 0 ? `-$${Number(resumen.totales.adelantos || 0).toFixed(2)}` : "-",
    `$${Number(resumen.totales.neto || 0).toFixed(2)}`,
  ])
  rowTypes.push("total")

  autoTable(doc, {
    head: [["Fecha", "Servicios", "Productos", "Comision", "Adelantos", "Neto a cobrar"]],
    body: rows,
    startY: 32,
    didParseCell: (data) => {
      if (data.section !== "body") return
      const rowType = rowTypes[data.row.index]
      if (rowType === "adelanto" && data.column.index === 4) {
        data.cell.styles.textColor = [220, 38, 38]
      }
      if (rowType === "total") {
        data.cell.styles.fontStyle = "bold"
        if (data.column.index === 4) {
          data.cell.styles.textColor = [220, 38, 38]
        }
      }
    },
  })

  return doc
}
