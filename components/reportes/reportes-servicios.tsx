"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Reporte {
  periodo: string
  desde?: string
  hasta?: string
  servicios: Array<{
    servicio_id: string
    nombre: string
    cantidad: number
    precio: number
    ingresos: number
  }>
  servicios_realizados?: Array<{
    turno_id: string
    fecha_inicio: string
    cliente: string
    servicio: string
    precio: number
    foto_trabajo_disponible?: boolean
  }>
  ventas: { total: number; detalle: { producto: string; cantidad: number; precio_unitario: number; metodo_pago: string }[] }
  resumen: {
    ingresos_servicios: number
    ingresos_productos: number
    senas_registradas: number
    adelantos: number
    total_general: number
  }
}

export function ReportesServicios() {
  const toLocalDateKey = (value: Date) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const todayKey = toLocalDateKey(new Date())
  const [rango, setRango] = useState({ desde: todayKey, hasta: todayKey })
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const reportesKey =
    isAdmin && rango.desde && rango.hasta
      ? `/api/reportes/servicios?desde=${rango.desde}&hasta=${rango.hasta}`
      : null
  const { data: reporte } = useSWR<Reporte>(reportesKey, fetcher)
  const servicios = Array.isArray(reporte?.servicios) ? reporte.servicios : []
  const serviciosRealizados = Array.isArray(reporte?.servicios_realizados) ? reporte.servicios_realizados : []
  const ventasDetalle = Array.isArray(reporte?.ventas?.detalle) ? reporte.ventas.detalle : []
  const formatDateLabel = (value: string) => {
    const [year, month, day] = value.split("-")
    if (!year || !month || !day) return value
    return `${day}/${month}/${year}`
  }
  const rangoLabel =
    rango.desde && rango.hasta ? `Desde ${formatDateLabel(rango.desde)} hasta ${formatDateLabel(rango.hasta)}` : ""

  if (config && !isAdmin) {
    return <div className="text-sm text-muted-foreground">Sin acceso.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold">Reportes de servicios</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Desde</span>
          <Input
            type="date"
            value={rango.desde}
            onChange={(e) => setRango((prev) => ({ ...prev, desde: e.target.value }))}
            className="w-40"
          />
          <span className="text-muted-foreground">Hasta</span>
          <Input
            type="date"
            value={rango.hasta}
            onChange={(e) => setRango((prev) => ({ ...prev, hasta: e.target.value }))}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total de Servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{servicios.reduce((acc, s) => acc + s.cantidad, 0)}</p>
            <p className="text-sm text-muted-foreground">{rangoLabel || reporte?.periodo}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${(reporte?.resumen?.total_general || 0).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">{rangoLabel || reporte?.periodo}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Servicios realizados</CardTitle>
        </CardHeader>
        <CardContent>
          {serviciosRealizados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin servicios realizados en el rango.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Clienta</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviciosRealizados.map((item) => (
                  <TableRow key={item.turno_id}>
                    <TableCell className="text-xs">
                      {new Date(item.fecha_inicio).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </TableCell>
                    <TableCell>{item.cliente}</TableCell>
                    <TableCell>{item.servicio}</TableCell>
                    <TableCell className="text-right">${Number(item.precio || 0).toFixed(2)}</TableCell>
                    <TableCell>{item.foto_trabajo_disponible ? <VerTurnoFotoButton turnoId={item.turno_id} /> : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle por servicio</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio Unit.</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicios.map((servicio) => (
                <TableRow key={servicio.servicio_id || servicio.nombre}>
                  <TableCell className="font-medium">{servicio.nombre}</TableCell>
                  <TableCell className="text-right">{servicio.cantidad}</TableCell>
                  <TableCell className="text-right">${servicio.precio.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-semibold">${servicio.ingresos.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ventas de productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-lg font-semibold">Total: ${(reporte?.ventas?.total || 0).toFixed(2)}</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio Unit.</TableHead>
                  <TableHead>Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasDetalle.map((v) => (
                  <TableRow key={`${v.producto}-${v.metodo_pago}-${v.precio_unitario}-${v.cantidad}`}>
                    <TableCell>{v.producto}</TableCell>
                    <TableCell className="text-right">{v.cantidad}</TableCell>
                    <TableCell className="text-right">${Number(v.precio_unitario || 0).toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{v.metodo_pago || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumen general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span>Ingresos por servicios</span>
            <strong>${(reporte?.resumen?.ingresos_servicios || 0).toFixed(2)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Ingresos por productos</span>
            <strong>${(reporte?.resumen?.ingresos_productos || 0).toFixed(2)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Señas registradas</span>
            <strong>${(reporte?.resumen?.senas_registradas || 0).toFixed(2)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Adelantos</span>
            <strong className="text-destructive">-${(reporte?.resumen?.adelantos || 0).toFixed(2)}</strong>
          </div>
          <div className="flex justify-between text-base">
            <span>Total general</span>
            <strong>${(reporte?.resumen?.total_general || 0).toFixed(2)}</strong>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
