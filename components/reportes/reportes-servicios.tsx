"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const REPORT_PAGE_SIZE = 60

type PaginationMeta = {
  page: number
  page_size: number
  total: number
  total_pages: number
  has_prev: boolean
  has_next: boolean
}

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
  pagination?: {
    servicios_realizados?: PaginationMeta
    detalle_servicios?: PaginationMeta
    ventas_productos?: PaginationMeta
  }
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
    cantidad_servicios?: number
    ingresos_servicios: number
    ingresos_productos: number
    senas_registradas: number
    adelantos: number
    total_general: number
  }
}

interface ServiciosVencidosResponse {
  umbral_dias: number
  total: number
  resumen?: {
    total: number
    pendiente: number
    enviado: number
  }
  filtro?: {
    estado: "all" | "pendiente" | "enviado"
    page: number
    page_size: number
  }
  pagination?: {
    page: number
    page_size: number
    total: number
    total_pages: number
    has_prev: boolean
    has_next: boolean
  }
  items: Array<{
    cliente_id: string
    clienta: string
    telefono: string
    servicio_id: string
    servicio: string
    ultima_fecha: string
    dias_desde_ultimo_servicio: number
    estado_recordatorio: "pendiente" | "enviado"
    recordatorio_enviado_at: string | null
    mensaje_recordatorio: string
    whatsapp_url: string | null
  }>
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
  const [paginaServiciosRealizados, setPaginaServiciosRealizados] = useState(1)
  const [paginaDetalleServicios, setPaginaDetalleServicios] = useState(1)
  const [paginaVentasProductos, setPaginaVentasProductos] = useState(1)
  const [filtroRecordatorio, setFiltroRecordatorio] = useState<"all" | "pendiente" | "enviado">("pendiente")
  const [paginaRecordatorio, setPaginaRecordatorio] = useState(1)
  const [enviandoRecordatorioKey, setEnviandoRecordatorioKey] = useState<string | null>(null)
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const reportesKey =
    isAdmin && rango.desde && rango.hasta
      ? `/api/reportes/servicios?desde=${rango.desde}&hasta=${rango.hasta}&sr_page=${paginaServiciosRealizados}&sr_page_size=${REPORT_PAGE_SIZE}&ds_page=${paginaDetalleServicios}&ds_page_size=${REPORT_PAGE_SIZE}&vp_page=${paginaVentasProductos}&vp_page_size=${REPORT_PAGE_SIZE}`
      : null
  const { data: reporte } = useSWR<Reporte>(reportesKey, fetcher)
  const reportesVencidosKey = isAdmin
    ? `/api/reportes/servicios-vencidos?estado=${filtroRecordatorio}&page=${paginaRecordatorio}&page_size=20`
    : null
  const { data: serviciosVencidosData, mutate: mutateServiciosVencidos } = useSWR<ServiciosVencidosResponse>(
    reportesVencidosKey,
    fetcher,
  )
  const servicios = Array.isArray(reporte?.servicios) ? reporte.servicios : []
  const serviciosRealizados = Array.isArray(reporte?.servicios_realizados) ? reporte.servicios_realizados : []
  const serviciosVencidos = Array.isArray(serviciosVencidosData?.items) ? serviciosVencidosData.items : []
  const umbralServiciosVencidos =
    Number.isFinite(serviciosVencidosData?.umbral_dias) && Number(serviciosVencidosData?.umbral_dias) > 0
      ? Number(serviciosVencidosData?.umbral_dias)
      : 35
  const resumenRecordatorios = serviciosVencidosData?.resumen || { total: 0, pendiente: 0, enviado: 0 }
  const paginacionRecordatorios = serviciosVencidosData?.pagination || {
    page: 1,
    page_size: 20,
    total: serviciosVencidos.length,
    total_pages: 1,
    has_prev: false,
    has_next: false,
  }
  const ventasDetalle = Array.isArray(reporte?.ventas?.detalle) ? reporte.ventas.detalle : []
  const paginacionServiciosRealizados = reporte?.pagination?.servicios_realizados || {
    page: paginaServiciosRealizados,
    page_size: REPORT_PAGE_SIZE,
    total: serviciosRealizados.length,
    total_pages: 1,
    has_prev: paginaServiciosRealizados > 1,
    has_next: false,
  }
  const paginacionDetalleServicios = reporte?.pagination?.detalle_servicios || {
    page: paginaDetalleServicios,
    page_size: REPORT_PAGE_SIZE,
    total: servicios.length,
    total_pages: 1,
    has_prev: paginaDetalleServicios > 1,
    has_next: false,
  }
  const paginacionVentasProductos = reporte?.pagination?.ventas_productos || {
    page: paginaVentasProductos,
    page_size: REPORT_PAGE_SIZE,
    total: ventasDetalle.length,
    total_pages: 1,
    has_prev: paginaVentasProductos > 1,
    has_next: false,
  }

  const handleEnviarRecordatorio = async (item: ServiciosVencidosResponse["items"][number]) => {
    if (!item.whatsapp_url) return
    const key = `${item.cliente_id}-${item.servicio_id}`
    const popup = window.open(item.whatsapp_url, "_blank", "noopener,noreferrer")
    setEnviandoRecordatorioKey(key)
    try {
      const res = await fetch("/api/reportes/servicios-vencidos/recordatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: item.cliente_id,
          servicio_id: item.servicio_id,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        alert(payload?.error || "No se pudo marcar el recordatorio como enviado.")
      }
      await mutateServiciosVencidos()
    } finally {
      setEnviandoRecordatorioKey(null)
      if (!popup) {
        window.location.assign(item.whatsapp_url)
      }
    }
  }
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
            onChange={(e) => {
              setRango((prev) => ({ ...prev, desde: e.target.value }))
              setPaginaServiciosRealizados(1)
              setPaginaDetalleServicios(1)
              setPaginaVentasProductos(1)
            }}
            className="w-40"
          />
          <span className="text-muted-foreground">Hasta</span>
          <Input
            type="date"
            value={rango.hasta}
            onChange={(e) => {
              setRango((prev) => ({ ...prev, hasta: e.target.value }))
              setPaginaServiciosRealizados(1)
              setPaginaDetalleServicios(1)
              setPaginaVentasProductos(1)
            }}
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
            <p className="text-3xl font-bold">{Number(reporte?.resumen?.cantidad_servicios || 0)}</p>
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
            <>
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
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Página {paginacionServiciosRealizados.page} de {paginacionServiciosRealizados.total_pages} · {paginacionServiciosRealizados.total} resultados
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!paginacionServiciosRealizados.has_prev}
                    onClick={() => setPaginaServiciosRealizados((prev) => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!paginacionServiciosRealizados.has_next}
                    onClick={() =>
                      setPaginaServiciosRealizados((prev) =>
                        Math.min(paginacionServiciosRealizados.total_pages || prev, prev + 1),
                      )
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Servicios vencidos (+{umbralServiciosVencidos} días)</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Recordatorio</span>
              <Select
                value={filtroRecordatorio}
                onValueChange={(value) => {
                  setFiltroRecordatorio(value as "all" | "pendiente" | "enviado")
                  setPaginaRecordatorio(1)
                }}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos ({resumenRecordatorios.total})</SelectItem>
                  <SelectItem value="pendiente">Pendiente ({resumenRecordatorios.pendiente})</SelectItem>
                  <SelectItem value="enviado">Enviado ({resumenRecordatorios.enviado})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {serviciosVencidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin clientas con servicios vencidos para el criterio actual.</p>
          ) : (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clienta</TableHead>
                    <TableHead>Servicio vencido</TableHead>
                    <TableHead>Última vez</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviciosVencidos.map((item) => {
                    const itemKey = `${item.cliente_id}-${item.servicio_id}`
                    const enviando = enviandoRecordatorioKey === itemKey
                    return (
                      <TableRow key={itemKey}>
                        <TableCell>{item.clienta}</TableCell>
                        <TableCell>{item.servicio}</TableCell>
                        <TableCell>
                          {new Date(item.ultima_fecha).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.estado_recordatorio === "enviado" ? (
                            <span className="text-[color:var(--status-success-fg)]">Enviado</span>
                          ) : (
                            <span className="text-[color:var(--status-warning-fg)]">Pendiente</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{item.dias_desde_ultimo_servicio}</TableCell>
                        <TableCell className="text-right">
                          {item.whatsapp_url ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleEnviarRecordatorio(item)}
                              disabled={enviando}
                            >
                              {enviando ? "Enviando..." : "Enviar recordatorio"}
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              Sin WhatsApp
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Página {paginacionRecordatorios.page} de {paginacionRecordatorios.total_pages} · {paginacionRecordatorios.total} resultados
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!paginacionRecordatorios.has_prev}
                    onClick={() => setPaginaRecordatorio((prev) => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!paginacionRecordatorios.has_next}
                    onClick={() =>
                      setPaginaRecordatorio((prev) => Math.min(paginacionRecordatorios.total_pages || prev, prev + 1))
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
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
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Página {paginacionDetalleServicios.page} de {paginacionDetalleServicios.total_pages} · {paginacionDetalleServicios.total} resultados
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!paginacionDetalleServicios.has_prev}
                onClick={() => setPaginaDetalleServicios((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!paginacionDetalleServicios.has_next}
                onClick={() =>
                  setPaginaDetalleServicios((prev) =>
                    Math.min(paginacionDetalleServicios.total_pages || prev, prev + 1),
                  )
                }
              >
                Siguiente
              </Button>
            </div>
          </div>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Página {paginacionVentasProductos.page} de {paginacionVentasProductos.total_pages} · {paginacionVentasProductos.total} resultados
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!paginacionVentasProductos.has_prev}
                onClick={() => setPaginaVentasProductos((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!paginacionVentasProductos.has_next}
                onClick={() =>
                  setPaginaVentasProductos((prev) =>
                    Math.min(paginacionVentasProductos.total_pages || prev, prev + 1),
                  )
                }
              >
                Siguiente
              </Button>
            </div>
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
