import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { generarFacturaPdf, resolveFacturacionConfig, type FacturaResultado } from "@/lib/facturacion"
import { resolveFacturaPdfPersistence } from "@/lib/facturas-registro"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

const notaCreditoSchema = z.object({
  monto: z.coerce.number().positive().optional(),
  motivo: z.string().optional().nullable(),
})

const mapCbteTipoToNotaCredito = (cbteTipo?: number | null) => {
  const tipo = Number(cbteTipo || 0)
  if (tipo === 11) return 13
  if (tipo === 6) return 8
  if (tipo === 1) return 3
  return 13
}

const formatComprobante = (puntoVenta?: number | null, numero?: number | null) => {
  if (puntoVenta == null || numero == null) return null
  return `${String(Number(puntoVenta) || 0).padStart(5, "0")}-${String(Number(numero) || 0).padStart(8, "0")}`
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  const col = String(column || "").toLowerCase()
  if (!col) return false
  if (code === "42703" || code === "PGRST204") return message.includes(col)
  return message.includes("column") && message.includes(col)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { id } = await params

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = user.username || (user.user_metadata as any)?.username || user.id
  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: payload, response: validationResponse } = await validateBody(request, notaCreditoSchema)
  if (validationResponse) return validationResponse

  const { data: factura, error } = await db
    .from("facturas")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .single()

  if (error || !factura) {
    return NextResponse.json({ error: error?.message || "Factura no encontrada" }, { status: 404 })
  }

  if (factura.tipo !== "factura") {
    return NextResponse.json({ error: "Solo se puede emitir nota de crédito sobre facturas" }, { status: 409 })
  }

  if (factura.estado === "con_nota_credito") {
    return NextResponse.json({ error: "La factura ya tiene una nota de crédito asociada" }, { status: 409 })
  }

  if (factura.estado !== "emitida") {
    return NextResponse.json({ error: "Solo se puede emitir nota de crédito sobre facturas emitidas" }, { status: 409 })
  }

  const totalFactura = Number(factura.total || 0)
  const montoSolicitado = Number(payload?.monto || 0)
  const monto = Number.isFinite(montoSolicitado) && montoSolicitado > 0 ? Math.min(montoSolicitado, totalFactura) : totalFactura
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  }

  const motivo = typeof payload?.motivo === "string" ? payload.motivo.trim() : ""

  const config = await resolveFacturacionConfig()
  const puntoVenta = Number(factura.punto_venta || config?.afip_punto_venta || 1)
  const cbteTipo = mapCbteTipoToNotaCredito(factura.cbte_tipo)

  const { data: existentes } = await db
    .from("facturas")
    .select("numero, cbte_tipo, punto_venta, tipo")
    .eq("usuario_id", user.id)

  const maxNumero = (existentes || [])
    .filter((row: any) => row.tipo === "nota_credito" && Number(row.cbte_tipo) === cbteTipo && Number(row.punto_venta) === puntoVenta)
    .reduce((acc: number, row: any) => Math.max(acc, Number(row.numero || 0)), 0)

  const siguienteNumero = maxNumero + 1

  const clienteNombre = factura.cliente_nombre || "Consumidor"
  const clienteApellido = factura.cliente_apellido || "Final"
  const referenciaFormateada = formatComprobante(factura.punto_venta, factura.numero)
  const referencia = referenciaFormateada ? `Factura ${referenciaFormateada}` : "Factura"
  const descripcion = motivo ? `Nota de crédito (${motivo}) sobre ${referencia}` : `Nota de crédito sobre ${referencia}`

  const facturaNota: FacturaResultado = {
    numero: siguienteNumero,
    punto_venta: puntoVenta,
    cbte_tipo: cbteTipo,
    cae: "",
    cae_vto: "",
    fecha: new Date().toISOString(),
    total: monto,
    metodo_pago: factura.metodo_pago || "credito",
    cliente: { nombre: clienteNombre, apellido: clienteApellido },
    items: [
      {
        tipo: "ajuste",
        descripcion,
        cantidad: 1,
        precio_unitario: monto,
        subtotal: monto,
      },
    ],
    leyenda: config?.factura_leyenda || null,
    leyenda_footer: config?.factura_leyenda_footer || null,
    emisor: {
      nombre: config?.factura_emisor_nombre || null,
      domicilio: config?.factura_emisor_domicilio || null,
      cuit: config?.afip_cuit || null,
    },
  }

  const filename = `Nota-credito-${puntoVenta}-${siguienteNumero}.pdf`
  let pdfBase64: string | null = null
  let pdf_filename: string | null = filename

  try {
    const pdfResult = await generarFacturaPdf(facturaNota, { filename, config })
    pdfBase64 = pdfResult.pdf_base64
    pdf_filename = pdfResult.pdf_filename
  } catch (pdfError) {
    pdfBase64 = null
  }

  const pdfStorage = await resolveFacturaPdfPersistence({
    userId: user.id,
    pdfBase64,
    pdfFilename: pdf_filename,
  })
  if (pdfStorage.storage_error) {
    console.warn("[facturas] Nota de crédito guardada con base64 por error en Storage", {
      userId: user.id,
      facturaId: factura.id,
      error: pdfStorage.storage_error,
    })
  }

  const insertRow: Record<string, unknown> = {
    usuario_id: user.id,
    tipo: "nota_credito",
    estado: "emitida",
    factura_relacionada_id: factura.id,
    numero: siguienteNumero,
    punto_venta: puntoVenta,
    cbte_tipo: cbteTipo,
    cae: facturaNota.cae,
    cae_vto: facturaNota.cae_vto,
    fecha: facturaNota.fecha,
    total: facturaNota.total,
    metodo_pago: facturaNota.metodo_pago,
    cliente_id: factura.cliente_id || null,
    cliente_nombre: clienteNombre,
    cliente_apellido: clienteApellido,
    items: facturaNota.items,
    nota: motivo || null,
    pdf_base64: pdfStorage.pdf_base64,
    pdf_storage_bucket: pdfStorage.pdf_storage_bucket,
    pdf_storage_path: pdfStorage.pdf_storage_path,
    pdf_filename: pdfStorage.pdf_filename,
    creado_por: user.id,
    creado_por_username: username,
  }

  let { data: notaCredito, error: notaError } = await db.from("facturas").insert([insertRow]).select().single()

  if (
    notaError &&
    (isMissingColumnError(notaError, "pdf_storage_bucket") || isMissingColumnError(notaError, "pdf_storage_path"))
  ) {
    const legacyRow = {
      ...insertRow,
      pdf_base64: pdfBase64,
    } as Record<string, unknown>
    delete legacyRow.pdf_storage_bucket
    delete legacyRow.pdf_storage_path
    ;({ data: notaCredito, error: notaError } = await db.from("facturas").insert([legacyRow]).select().single())
  }

  if (notaError || !notaCredito) {
    return NextResponse.json({ error: notaError?.message || "No se pudo crear la nota de crédito" }, { status: 500 })
  }

  await db
    .from("facturas")
    .update({ estado: "con_nota_credito", nota_credito_id: notaCredito.id, updated_at: new Date().toISOString() })
    .eq("id", factura.id)
    .eq("usuario_id", user.id)

  const { pdf_base64: _pdf, ...rest } = notaCredito || {}
  return NextResponse.json({ nota_credito: { ...rest, has_pdf: Boolean(notaCredito?.pdf_base64 || notaCredito?.pdf_storage_path) } })
}
