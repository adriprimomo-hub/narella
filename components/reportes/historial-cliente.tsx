"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/date-format"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface ClienteReporte {
  cliente: any
  estadisticas: {
    total_turnos: number
    visitas_completadas: number
    asistencia_porcentaje: number
    total_gastado: number
  }
  historial: any[]
  productos?: ProductoVenta[]
  facturas?: FacturaCliente[]
}

interface HistorialClienteProps {
  clienteId: string
}

type ProductoVenta = {
  id: string
  cantidad?: number
  precio_unitario?: number
  metodo_pago?: string | null
  nota?: string | null
  created_at?: string
  productos?: { nombre: string } | null
}

type FacturaCliente = {
  id: string
  tipo?: "factura" | "nota_credito"
  estado?: string | null
  numero?: number | null
  punto_venta?: number | null
  cae?: string | null
  cae_vto?: string | null
  fecha?: string | null
  created_at?: string | null
  total?: number | null
}

const formatComprobante = (row: FacturaCliente) => {
  if (row.punto_venta != null && row.numero != null) {
    const pv = String(Number(row.punto_venta) || 0).padStart(5, "0")
    const nro = String(Number(row.numero) || 0).padStart(8, "0")
    return `${pv}-${nro}`
  }
  if (row.estado === "pendiente") return "(pendiente)"
  return "-"
}

const formatEstado = (estado?: string | null) => {
  if (!estado) return "Emitida"
  if (estado === "emitida") return "Emitida"
  if (estado === "pendiente") return "Pendiente"
  if (estado === "con_nota_credito") return "Con nota crédito"
  if (estado === "anulada") return "Anulada"
  return estado
}

export function HistorialCliente({ clienteId }: HistorialClienteProps) {
  const { data: reporte } = useSWR<ClienteReporte>(`/api/reportes/clientes/${clienteId}`, fetcher)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [declaracionOpen, setDeclaracionOpen] = useState(false)
  const [declaracionSeleccionada, setDeclaracionSeleccionada] = useState<any | null>(null)

  if (!reporte) return <div className="text-center py-8">Cargando...</div>

  const cliente = reporte.cliente
  const stats = reporte.estadisticas
  const productosVendidos = Array.isArray(reporte.productos) ? reporte.productos : []
  const facturasEmitidas = Array.isArray(reporte.facturas) ? reporte.facturas : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{`${cliente.nombre} ${cliente.apellido}`}</h2>
        <p className="text-muted-foreground">{cliente.telefono}</p>
        {cliente.observaciones && (
          <p className="mt-2 rounded-[var(--radius-md)] bg-muted p-2 text-sm">{cliente.observaciones}</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Turnos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_turnos}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.visitas_completadas}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Asistencia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.asistencia_porcentaje.toFixed(0)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Gastado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${stats.total_gastado.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Turnos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Empleada</TableHead>
                <TableHead>Inicio real</TableHead>
                <TableHead>Fin real</TableHead>
                <TableHead>Penalidad</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Foto</TableHead>
                <TableHead>DJ</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reporte.historial.map((turno) => {
                const nombreEmpleada = (() => {
                  if (turno.empleada_final_nombre) {
                    return `${turno.empleada_final_nombre} ${turno.empleada_final_apellido || ""}`.trim()
                  }
                  if (turno.empleada_final) {
                    return `${turno.empleada_final.nombre} ${turno.empleada_final.apellido || ""}`.trim()
                  }
                  if (turno.empleadas) {
                    return `${turno.empleadas.nombre} ${turno.empleadas.apellido || ""}`.trim()
                  }
                  return "Sin asignar"
                })()

                return (
                  <TableRow key={turno.id}>
                  <TableCell>
                    {formatDateTime(turno.fecha_inicio)}
                  </TableCell>
                  <TableCell>{(turno.servicio_final || turno.servicios)?.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {nombreEmpleada}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.iniciado_en
                      ? new Date(turno.iniciado_en).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.finalizado_en
                      ? new Date(turno.finalizado_en).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.penalidad_monto
                      ? `$${turno.penalidad_monto.toFixed(2)} ${turno.penalidad_motivo ? `- ${turno.penalidad_motivo}` : ""}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {turno.observaciones ? turno.observaciones : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.pago ? `${turno.pago.metodo_pago} - $${Number(turno.pago.monto || 0).toFixed(2)}` : "Sin registro"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.foto_trabajo_disponible ? <VerTurnoFotoButton turnoId={turno.id} /> : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {turno.declaracion_jurada ? (
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={
                            turno.declaracion_jurada.estado === "completada"
                              ? "success"
                              : turno.declaracion_jurada.estado === "pendiente"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {turno.declaracion_jurada.estado || "pendiente"}
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeclaracionSeleccionada(turno.declaracion_jurada)
                            setDeclaracionOpen(true)
                          }}
                        >
                          Ver
                        </Button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={turno.estado === "completado" ? "success" : "neutral"}>
                      {turno.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturas emitidas</CardTitle>
        </CardHeader>
        <CardContent>
          {facturasEmitidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin facturas emitidas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>CAE</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturasEmitidas.map((factura) => (
                  <TableRow key={factura.id}>
                    <TableCell className="text-xs">
                      {factura.fecha || factura.created_at ? formatDateTime(factura.fecha || factura.created_at || "") : "-"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{formatComprobante(factura)}</TableCell>
                    <TableCell className="text-xs">{factura.cae || "-"}</TableCell>
                    <TableCell className="text-right">${Number(factura.total || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{formatEstado(factura.estado)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFacturaInfo({
                            numero: factura.numero ?? undefined,
                            punto_venta: factura.punto_venta ?? undefined,
                            cae: factura.cae ?? undefined,
                            cae_vto: factura.cae_vto ?? undefined,
                            total: factura.total ?? undefined,
                          })
                          setFacturaId(factura.id)
                          setFacturaOpen(true)
                        }}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos vendidos</CardTitle>
        </CardHeader>
        <CardContent>
          {productosVendidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin productos vendidos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosVendidos.map((venta) => {
                  const cantidad = Number(venta.cantidad || 0)
                  const precio = Number(venta.precio_unitario || 0)
                  const total = cantidad * precio
                  return (
                    <TableRow key={venta.id}>
                      <TableCell className="text-xs">
                        {venta.created_at ? formatDateTime(venta.created_at) : "-"}
                      </TableCell>
                      <TableCell>{venta.productos?.nombre || "-"}</TableCell>
                      <TableCell className="text-right">{cantidad || "-"}</TableCell>
                      <TableCell className="text-right">${precio.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${total.toFixed(2)}</TableCell>
                      <TableCell className="capitalize text-xs">{venta.metodo_pago || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{venta.nota || "-"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FacturaDialog
        open={facturaOpen}
        onOpenChange={(open) => {
          setFacturaOpen(open)
          if (!open) setFacturaId(null)
        }}
        facturaId={facturaId}
        factura={facturaInfo}
      />

      <Dialog
        open={declaracionOpen}
        onOpenChange={(open) => {
          setDeclaracionOpen(open)
          if (!open) setDeclaracionSeleccionada(null)
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Declaración jurada
              {declaracionSeleccionada?.plantilla?.nombre ? ` · ${declaracionSeleccionada.plantilla.nombre}` : ""}
            </DialogTitle>
          </DialogHeader>
          {declaracionSeleccionada ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    declaracionSeleccionada.estado === "completada"
                      ? "success"
                      : declaracionSeleccionada.estado === "pendiente"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {declaracionSeleccionada.estado || "pendiente"}
                </Badge>
                {declaracionSeleccionada.submitted_at && (
                  <span className="text-muted-foreground">
                    Respondida: {formatDateTime(declaracionSeleccionada.submitted_at)}
                  </span>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                {Object.keys(declaracionSeleccionada.respuestas || {}).length === 0 ? (
                  <p className="text-muted-foreground">Sin respuestas registradas.</p>
                ) : (
                  Object.entries(declaracionSeleccionada.respuestas || {}).map(([key, value]) => {
                    const campo = Array.isArray(declaracionSeleccionada.plantilla?.campos)
                      ? declaracionSeleccionada.plantilla.campos.find((item: any) => item.id === key)
                      : null
                    return (
                      <div key={key} className="grid grid-cols-1 gap-1 sm:grid-cols-[220px_1fr]">
                        <span className="font-medium">{campo?.label || key}</span>
                        <span className="text-muted-foreground whitespace-pre-wrap">{String(value || "-")}</span>
                      </div>
                    )
                  })
                )}
              </div>

              {declaracionSeleccionada.firma_data_url && (
                <div className="space-y-1">
                  <p className="font-medium">Firma</p>
                  <Image
                    src={declaracionSeleccionada.firma_data_url}
                    alt="Firma de la declaración jurada"
                    width={640}
                    height={220}
                    unoptimized
                    className="max-h-44 w-auto rounded-md border bg-white"
                  />
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
