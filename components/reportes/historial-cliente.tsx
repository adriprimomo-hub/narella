"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/date-format"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

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

export function HistorialCliente({ clienteId }: HistorialClienteProps) {
  const { data: reporte } = useSWR<ClienteReporte>(`/api/reportes/clientes/${clienteId}`, fetcher)

  if (!reporte) return <div className="text-center py-8">Cargando...</div>

  const cliente = reporte.cliente
  const stats = reporte.estadisticas
  const productosVendidos = Array.isArray(reporte.productos) ? reporte.productos : []

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
    </div>
  )
}
