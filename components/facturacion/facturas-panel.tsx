"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/date-format"
import { FileMinusIcon, FileTextIcon, RefreshCwIcon, SearchIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const SEARCH_LIMIT = 50
const DEFAULT_LIST_LIMIT = 8
const PAGE_LIMIT = 20
const PAGE_QUERY_LIMIT = PAGE_LIMIT

const useDebouncedValue = <T,>(value: T, delay = 250) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

type FacturaRow = {
  id: string
  tipo?: "factura" | "nota_credito"
  estado?: string
  numero?: number | null
  punto_venta?: number | null
  cbte_tipo?: number | null
  cae?: string | null
  cae_vto?: string | null
  fecha?: string | null
  total?: number | null
  metodo_pago?: string | null
  cliente_id?: string | null
  cliente_nombre?: string | null
  cliente_apellido?: string | null
  has_pdf?: boolean
  pdf_filename?: string | null
  factura_relacionada_id?: string | null
  nota_credito_id?: string | null
  created_at?: string | null
}

type Config = { rol?: string }

type NotaCreditoForm = {
  monto: number | ""
  motivo: string
}

const formatCliente = (row: FacturaRow) => {
  const nombre = `${row.cliente_nombre || ""} ${row.cliente_apellido || ""}`.trim()
  return nombre || "Consumidor final"
}

const formatComprobante = (row: FacturaRow) => {
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

const formatTipo = (tipo?: string | null) => {
  if (tipo === "nota_credito") return "Nota de crédito"
  return "Factura"
}

const getEstadoVariant = (estado?: string | null) => {
  if (estado === "anulada") return "destructive"
  if (estado === "pendiente") return "warning"
  if (estado === "con_nota_credito") return "warning"
  return "success"
}

const getTipoVariant = (tipo?: string | null) => {
  if (tipo === "nota_credito") return "info"
  return "secondary"
}

const formatMonto = (row: FacturaRow) => {
  const total = Number(row.total || 0)
  const isNota = row.tipo === "nota_credito"
  const sign = isNota ? "-" : ""
  return `${sign}$${Math.abs(total).toFixed(2)}`
}

export function FacturasPanel() {
  const { data: config } = useSWR<Config>("/api/config", fetcher)
  const role = config?.rol
  const isAdmin = role === "admin"
  const canViewFacturas = isAdmin || role === "recepcion"

  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  const [tipoFiltro, setTipoFiltro] = useState("all")
  const [estadoFiltro, setEstadoFiltro] = useState("all")
  const [rango, setRango] = useState({ desde: "", hasta: "" })

  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const searchRaw = search.trim()
  const canSearch = searchRaw.length >= 2
  const searchTerm = debouncedSearch.trim()
  const isSearchMode = canSearch

  const resetPage = () => setPage((prev) => (prev === 1 ? prev : 1))
  const handleSearchChange = (value: string) => {
    setSearch(value)
    resetPage()
  }
  const handleTipoFiltroChange = (value: string) => {
    setTipoFiltro(value)
    resetPage()
  }
  const handleEstadoFiltroChange = (value: string) => {
    setEstadoFiltro(value)
    resetPage()
  }
  const handleDesdeChange = (value: string) => {
    setRango((prev) => ({ ...prev, desde: value }))
    resetPage()
  }
  const handleHastaChange = (value: string) => {
    setRango((prev) => ({ ...prev, hasta: value }))
    resetPage()
  }

  const buildKey = () => {
    if (!canViewFacturas) return null
    const params = new URLSearchParams()
    if (tipoFiltro !== "all") params.set("tipo", tipoFiltro)
    if (estadoFiltro !== "all") params.set("estado", estadoFiltro)
    if (rango.desde) params.set("desde", rango.desde)
    if (rango.hasta) params.set("hasta", rango.hasta)

    if (isSearchMode && searchTerm.length >= 2) {
      params.set("q", searchTerm)
      params.set("limit", String(SEARCH_LIMIT))
    } else if (showAll) {
      params.set("limit", String(PAGE_QUERY_LIMIT))
      params.set("page", String(page))
    } else {
      params.set("limit", String(DEFAULT_LIST_LIMIT))
    }

    const qs = params.toString()
    return qs ? `/api/facturas?${qs}` : "/api/facturas"
  }

  const facturasKey = buildKey()
  const { data: facturas, mutate } = useSWR<FacturaRow[]>(facturasKey, fetcher, {
    refreshInterval: 30_000,
  })

  const facturasList = Array.isArray(facturas) ? facturas : []
  const esperandoFacturas = canSearch && searchTerm !== searchRaw
  const isLoading = Boolean(facturasKey) && !facturas
  const isPaginated = showAll && !isSearchMode
  const facturasHasMore = isPaginated && facturasList.length === PAGE_LIMIT
  const facturasFiltradas = isPaginated ? facturasList.slice(0, PAGE_LIMIT) : facturasList

  const resumen = useMemo(() => {
    let totalFacturas = 0
    let totalNotas = 0
    let countFacturas = 0
    let countNotas = 0
    facturasFiltradas.forEach((row) => {
      const total = Number(row.total || 0)
      if (row.tipo === "nota_credito") {
        totalNotas += total
        countNotas += 1
      } else {
        totalFacturas += total
        countFacturas += 1
      }
    })
    const neto = totalFacturas - totalNotas
    return { totalFacturas, totalNotas, countFacturas, countNotas, neto }
  }, [facturasFiltradas])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogFactura, setDialogFactura] = useState<FacturaInfo | null>(null)
  const [dialogFacturaId, setDialogFacturaId] = useState<string | null>(null)
  const [retryingFacturaId, setRetryingFacturaId] = useState<string | null>(null)

  const handleOpenLink = (row: FacturaRow) => {
    if (!row?.id) return
    setDialogFactura({
      numero: row.numero ?? undefined,
      punto_venta: row.punto_venta ?? undefined,
      cbte_tipo: row.cbte_tipo ?? undefined,
      cae: row.cae ?? undefined,
      cae_vto: row.cae_vto ?? undefined,
      total: row.total ?? undefined,
    })
    setDialogFacturaId(row.id)
    setDialogOpen(true)
  }

  const [notaOpen, setNotaOpen] = useState(false)
  const [notaFactura, setNotaFactura] = useState<FacturaRow | null>(null)
  const [notaForm, setNotaForm] = useState<NotaCreditoForm>({ monto: "", motivo: "" })
  const [notaError, setNotaError] = useState("")
  const [notaSaving, setNotaSaving] = useState(false)

  const openNotaCredito = (row: FacturaRow) => {
    const monto = Number(row.total || 0)
    setNotaFactura(row)
    setNotaForm({ monto: monto > 0 ? monto : "", motivo: "" })
    setNotaError("")
    setNotaOpen(true)
  }

  const handleCrearNota = async () => {
    if (!notaFactura) return
    const monto = Number(notaForm.monto || 0)
    if (!Number.isFinite(monto) || monto <= 0) {
      setNotaError("Ingresa un monto válido.")
      return
    }
    setNotaSaving(true)
    setNotaError("")
    try {
      const res = await fetch(`/api/facturas/${notaFactura.id}/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto, motivo: notaForm.motivo }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setNotaError(payload?.error || "No se pudo generar la nota de crédito.")
        return
      }
      setNotaOpen(false)
      mutate()
    } finally {
      setNotaSaving(false)
    }
  }

  const handleRetryFacturaPendiente = async (row: FacturaRow) => {
    if (!row?.id || row.estado !== "pendiente") return
    setRetryingFacturaId(row.id)
    try {
      const res = await fetch(`/api/facturas/reintentos?factura_id=${encodeURIComponent(row.id)}`, { method: "POST" })
      const payload = await res.json().catch(() => null)

      if (!res.ok) {
        alert(payload?.error || "No se pudo reintentar la facturación.")
        return
      }

      if (Number(payload?.emitidas || 0) > 0) {
        alert("Comprobante emitido correctamente.")
      } else if (Number(payload?.fallidas || 0) > 0 || Number(payload?.invalidas || 0) > 0) {
        const detalle = payload?.ultimo_error || payload?.errores?.[0]?.error
        alert(
          detalle
            ? `El comprobante sigue pendiente.\nDetalle: ${detalle}`
            : "El comprobante sigue pendiente. Revisá la configuración de ARCA y reintentá.",
        )
      } else {
        alert("No había comprobantes pendientes para procesar.")
      }

      mutate()
    } catch {
      alert("No se pudo reintentar la facturación.")
    } finally {
      setRetryingFacturaId(null)
    }
  }

  if (config && !canViewFacturas) {
    return <div className="text-sm text-muted-foreground">Sin acceso.</div>
  }

  const emptyMessage = isPaginated && page > 1 ? "No hay más resultados." : canSearch ? "No hay coincidencias." : "No hay facturas registradas."

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Facturas</h2>
          <p className="text-sm text-muted-foreground">Historial de comprobantes y notas de crédito.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowAll((prev) => !prev)
            setPage(1)
            if (search) setSearch("")
          }}
        >
          {showAll ? "Ver últimos" : "Ver todo"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Facturas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{resumen.countFacturas}</p>
            <p className="text-sm text-muted-foreground">${resumen.totalFacturas.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Notas de crédito</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{resumen.countNotas}</p>
            <p className="text-sm text-muted-foreground">${resumen.totalNotas.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Neto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">${resumen.neto.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Resumen de la vista actual</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {rango.desde || rango.hasta || tipoFiltro !== "all" || estadoFiltro !== "all" ? "Activos" : "Sin filtros"}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente, CAE o número..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={tipoFiltro} onValueChange={handleTipoFiltroChange}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="factura">Facturas</SelectItem>
            <SelectItem value="nota_credito">Notas de crédito</SelectItem>
          </SelectContent>
        </Select>
        <Select value={estadoFiltro} onValueChange={handleEstadoFiltroChange}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="emitida">Emitidas</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="con_nota_credito">Con nota crédito</SelectItem>
            <SelectItem value="anulada">Anuladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-sm font-medium">Desde</p>
          <Input type="date" value={rango.desde} onChange={(e) => handleDesdeChange(e.target.value)} />
        </div>
        <div>
          <p className="text-sm font-medium">Hasta</p>
          <Input type="date" value={rango.hasta} onChange={(e) => handleHastaChange(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setRango({ desde: "", hasta: "" })
              setTipoFiltro("all")
              setEstadoFiltro("all")
              setSearch("")
              setPage(1)
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CAE</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(esperandoFacturas && canSearch) || isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      {canSearch ? "Buscando facturas..." : "Cargando facturas..."}
                    </TableCell>
                  </TableRow>
                ) : facturasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  facturasFiltradas.map((row) => {
                    const isNota = row.tipo === "nota_credito"
                    const canNotaCredito = isAdmin && row.tipo === "factura" && row.estado === "emitida"
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs">{formatDate(row.fecha || row.created_at || "")}</TableCell>
                        <TableCell className="font-medium">{formatCliente(row)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatComprobante(row)}</TableCell>
                        <TableCell>
                          <Badge variant={getTipoVariant(row.tipo)}>{formatTipo(row.tipo)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>{row.cae || "-"}</div>
                          {row.cae_vto && <div className="text-[11px]">Vto: {row.cae_vto}</div>}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{row.metodo_pago || "-"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            isNota ? "text-destructive" : "text-primary",
                          )}
                        >
                          {formatMonto(row)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getEstadoVariant(row.estado)}>{formatEstado(row.estado)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenLink(row)}
                              disabled={!row.has_pdf}
                              className="gap-1"
                            >
                              <FileTextIcon className="h-4 w-4" />
                              Ver
                            </Button>
                            {isAdmin && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openNotaCredito(row)}
                                disabled={!canNotaCredito}
                                className="gap-1"
                              >
                                <FileMinusIcon className="h-4 w-4" />
                                Nota crédito
                              </Button>
                            )}
                            {row.estado === "pendiente" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetryFacturaPendiente(row)}
                                disabled={retryingFacturaId === row.id}
                                className="gap-1"
                              >
                                <RefreshCwIcon
                                  className={cn("h-4 w-4", retryingFacturaId === row.id && "animate-spin")}
                                />
                                Reintentar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showAll && !isSearchMode && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <span>Página {page}</span>
          <Button variant="secondary" size="sm" disabled={!facturasHasMore} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <FacturaDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setDialogFacturaId(null)
        }}
        facturaId={dialogFacturaId}
        factura={dialogFactura}
      />

      {isAdmin && (
        <Dialog
        open={notaOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNotaOpen(false)
            setNotaFactura(null)
            setNotaError("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir nota de crédito</DialogTitle>
            <DialogDescription>Genera una nota de crédito asociada a la factura seleccionada.</DialogDescription>
          </DialogHeader>

          {notaFactura && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Comprobante</span>
                <span className="font-medium">{formatComprobante(notaFactura)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{formatCliente(notaFactura)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total factura</span>
                <span className="font-medium">${Number(notaFactura.total || 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Monto a acreditar</p>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={notaForm.monto}
                onChange={(e) => setNotaForm((p) => ({ ...p, monto: e.target.value === "" ? "" : Number(e.target.value) }))}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Motivo (opcional)</p>
              <Textarea
                value={notaForm.motivo}
                onChange={(e) => setNotaForm((p) => ({ ...p, motivo: e.target.value }))}
                placeholder="Detalle de la nota de crédito"
              />
            </div>
            {notaError && <p className="text-xs text-destructive">{notaError}</p>}
            <Button variant="primary" onClick={handleCrearNota} disabled={notaSaving}>
              Emitir nota de crédito
            </Button>
          </div>
        </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
