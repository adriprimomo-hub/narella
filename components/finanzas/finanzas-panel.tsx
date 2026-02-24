"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CalendarIcon, ExternalLinkIcon, PlusIcon, PrinterIcon, SearchIcon, Share2Icon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createShareLink } from "@/lib/share-links-client"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { FacturandoDialog } from "@/components/facturacion/facturando-dialog"
import { UserBadge } from "../ui/user-badge"
import { Cliente } from "../clientes/clientes-list"
import { Empleada } from "../empleadas/types"
import type { Servicio } from "../servicios/servicios-list"
import { formatDate, formatDateRange } from "@/lib/date-format"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const SEARCH_LIMIT = 50
const DEFAULT_LIST_LIMIT = 5
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

type Sena = {
  id: string
  cliente_id: string
  servicio_id: string
  monto: number
  metodo_pago: string
  estado: string
  nota?: string | null
  fecha_pago: string
  creado_por?: string | null
  creado_por_username?: string | null
  clientes?: { nombre: string; apellido: string }
  servicios?: { id: string; nombre: string } | null
}

type Adelanto = {
  id: string
  empleada_id: string
  monto: number
  motivo?: string | null
  fecha_entrega: string
  creado_por?: string | null
  creado_por_username?: string | null
  empleadas?: { nombre: string; apellido?: string | null }
}

type LiquidacionItem = {
  id: string
  tipo: "servicio" | "producto" | "adelanto"
  fecha?: string | null
  servicio?: string | null
  producto?: string | null
  comision?: number | null
  adelanto?: number | null
}

type LiquidacionDetalle = {
  desde: string
  hasta: string
  empleada: { id: string; nombre: string; apellido?: string | null }
  items: LiquidacionItem[]
  totales: { comision: number; adelantos: number; neto: number }
}

type Config = { metodos_pago_config?: { nombre: string }[]; rol?: string }

export function FinanzasPanel() {
  const { data: config } = useSWR<Config>("/api/config", fetcher)
  const role = config?.rol
  const isAdmin = role === "admin"
  const canManageFinanzas = isAdmin || role === "recepcion"
  const canViewLiquidaciones = isAdmin
  const { data: clientes } = useSWR<Cliente[]>(canManageFinanzas ? "/api/clientes" : null, fetcher)
  const { data: empleadas } = useSWR<Empleada[]>(canManageFinanzas ? "/api/empleadas" : null, fetcher)
  const { data: servicios } = useSWR<Servicio[]>(canManageFinanzas ? "/api/servicios" : null, fetcher)
  const [adelantoForm, setAdelantoForm] = useState({ empleada_id: "", monto: "" as number | "", motivo: "" })

  const clientesList = Array.isArray(clientes) ? clientes : []
  const empleadasList = Array.isArray(empleadas) ? empleadas : []
  const serviciosList = Array.isArray(servicios) ? servicios : []
  const metodosPagoList = useMemo(() => {
    const normalizados = Array.isArray(config?.metodos_pago_config)
      ? config.metodos_pago_config
          .map((m) => String(m?.nombre || "").trim())
          .filter(Boolean)
      : []
    const unicos = Array.from(new Set(normalizados))
    return unicos.length ? unicos : ["efectivo", "tarjeta", "transferencia"]
  }, [config?.metodos_pago_config])

  const [senaForm, setSenaForm] = useState({
    cliente_id: "",
    servicio_id: "",
    monto: "" as number | "",
    metodo_pago: "efectivo",
    nota: "",
  })
  const [facturarSena, setFacturarSena] = useState(false)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [facturando, setFacturando] = useState(false)
  const [showSenaForm, setShowSenaForm] = useState(false)
  const [showAdelantoForm, setShowAdelantoForm] = useState(false)
  const [searchCliente, setSearchCliente] = useState("")
  const [searchServicio, setSearchServicio] = useState("")
  const [searchEmpleada, setSearchEmpleada] = useState("")
  const [searchSenaList, setSearchSenaList] = useState("")
  const [searchAdelantoList, setSearchAdelantoList] = useState("")
  const [showAllSenas, setShowAllSenas] = useState(false)
  const [showAllAdelantos, setShowAllAdelantos] = useState(false)
  const [senaPage, setSenaPage] = useState(1)
  const [adelantoPage, setAdelantoPage] = useState(1)
  const [senaErrors, setSenaErrors] = useState<{ cliente?: string; servicio?: string; monto?: string }>({})
  const [adelantoErrors, setAdelantoErrors] = useState<{ empleada?: string; monto?: string }>({})
  const debouncedSenaSearch = useDebouncedValue(searchSenaList.trim(), 300)
  const debouncedAdelantoSearch = useDebouncedValue(searchAdelantoList.trim(), 300)
  const senaSearchRaw = searchSenaList.trim()
  const adelantoSearchRaw = searchAdelantoList.trim()
  const canSearchSenas = senaSearchRaw.length >= 2
  const canSearchAdelantos = adelantoSearchRaw.length >= 2
  const senaSearchTerm = debouncedSenaSearch.trim()
  const adelantoSearchTerm = debouncedAdelantoSearch.trim()
  const isSenaSearchMode = canSearchSenas
  const isAdelantoSearchMode = canSearchAdelantos
  const senaBaseKey = canManageFinanzas
    ? showAllSenas
      ? `/api/senas?limit=${PAGE_QUERY_LIMIT}&page=${senaPage}`
      : `/api/senas?limit=${DEFAULT_LIST_LIMIT}`
    : null
  const adelantoBaseKey = canManageFinanzas
    ? showAllAdelantos
      ? `/api/adelantos?limit=${PAGE_QUERY_LIMIT}&page=${adelantoPage}`
      : `/api/adelantos?limit=${DEFAULT_LIST_LIMIT}`
    : null
  const senaSearchKey =
    canManageFinanzas && canSearchSenas && senaSearchTerm.length >= 2
      ? `/api/senas?q=${encodeURIComponent(senaSearchTerm)}&limit=${SEARCH_LIMIT}`
      : null
  const adelantoSearchKey =
    canManageFinanzas && canSearchAdelantos && adelantoSearchTerm.length >= 2
      ? `/api/adelantos?q=${encodeURIComponent(adelantoSearchTerm)}&limit=${SEARCH_LIMIT}`
      : null
  const senasKey = senaSearchKey ?? senaBaseKey
  const adelantosKey = adelantoSearchKey ?? adelantoBaseKey
  const { data: Senas, mutate: mutateSenas } = useSWR<Sena[]>(senasKey, fetcher)
  const { data: adelantos, mutate: mutateAdelantos } = useSWR<Adelanto[]>(adelantosKey, fetcher)
  const senasList = Array.isArray(Senas) ? Senas : []
  const adelantosList = Array.isArray(adelantos) ? adelantos : []
  const esperandoSenas = canSearchSenas && senaSearchTerm !== senaSearchRaw
  const esperandoAdelantos = canSearchAdelantos && adelantoSearchTerm !== adelantoSearchRaw
  const isSenasLoading = Boolean(senasKey) && !Senas
  const isAdelantosLoading = Boolean(adelantosKey) && !adelantos

  useEffect(() => {
    setSenaForm((prev) =>
      metodosPagoList.includes(prev.metodo_pago) ? prev : { ...prev, metodo_pago: metodosPagoList[0] },
    )
  }, [metodosPagoList])

  const today = useMemo(() => new Date(), [])
  const startWeek = useMemo(() => {
    const d = new Date(today)
    const diff = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - diff)
    return d
  }, [today])
  const [periodo, setPeriodo] = useState({
    desde: startWeek.toISOString().slice(0, 10),
    hasta: new Date(startWeek.getFullYear(), startWeek.getMonth(), startWeek.getDate() + 7).toISOString().slice(0, 10),
  })
  const [filtroLiquidacionEmpleada, setFiltroLiquidacionEmpleada] = useState("")

  const liquidacionKey = canViewLiquidaciones
    ? filtroLiquidacionEmpleada
      ? `/api/liquidaciones?desde=${periodo.desde}&hasta=${periodo.hasta}&empleada_id=${filtroLiquidacionEmpleada}`
      : null
    : null
  const { data: liquidacionData } = useSWR<LiquidacionDetalle>(liquidacionKey, fetcher)
  const clientesFiltrados = clientesList.filter((c) =>
    `${c.nombre} ${c.apellido}`.toLowerCase().includes(searchCliente.toLowerCase()),
  )
  const serviciosFiltrados = serviciosList.filter((s) =>
    s.nombre.toLowerCase().includes(searchServicio.toLowerCase()),
  )
  const servicioSeleccionado = senaForm.servicio_id
    ? serviciosList.find((s) => s.id === senaForm.servicio_id) || null
    : null
  const showServiciosResultados =
    Boolean(searchServicio) &&
    (!servicioSeleccionado || searchServicio.toLowerCase() !== servicioSeleccionado.nombre.toLowerCase())
  const empleadasFiltradas = empleadasList.filter((e) => e.nombre.toLowerCase().includes(searchEmpleada.toLowerCase()))

  const liquidacionItems = Array.isArray(liquidacionData?.items) ? liquidacionData.items : []
  const liquidacionDisponible = Boolean(liquidacionData && liquidacionData.empleada)
  const liquidacion = liquidacionDisponible ? liquidacionData : null
  const isSenaPaginated = showAllSenas && !isSenaSearchMode
  const isAdelantoPaginated = showAllAdelantos && !isAdelantoSearchMode
  const senasHasMore = isSenaPaginated && senasList.length === PAGE_LIMIT
  const adelantosHasMore = isAdelantoPaginated && adelantosList.length === PAGE_LIMIT
  const senasFiltradas = isSenaPaginated ? senasList.slice(0, PAGE_LIMIT) : senasList
  const adelantosFiltrados = isAdelantoPaginated ? adelantosList.slice(0, PAGE_LIMIT) : adelantosList
  const senaEmptyMessage =
    isSenaPaginated && senaPage > 1 ? "No hay más resultados." : canSearchSenas ? "No hay coincidencias." : "No hay señas registradas."
  const adelantoEmptyMessage =
    isAdelantoPaginated && adelantoPage > 1
      ? "No hay más resultados."
      : canSearchAdelantos
        ? "No hay coincidencias."
        : "No hay adelantos registrados."

  const [liquidacionShareOpen, setLiquidacionShareOpen] = useState(false)
  const [liquidacionShareUrl, setLiquidacionShareUrl] = useState<string | null>(null)
  const [liquidacionShareLoading, setLiquidacionShareLoading] = useState(false)
  const [liquidacionShareError, setLiquidacionShareError] = useState<string | null>(null)
  const [liquidacionPreviewFailed, setLiquidacionPreviewFailed] = useState(false)
  const [isAppleMobile, setIsAppleMobile] = useState(false)

  useEffect(() => {
    if (typeof navigator === "undefined") return
    const ua = navigator.userAgent || ""
    setIsAppleMobile(/iPhone|iPad|iPod/i.test(ua))
  }, [])

  const openLiquidacionShare = async () => {
    if (!liquidacion) return
    setLiquidacionShareOpen(true)
    setLiquidacionShareLoading(true)
    setLiquidacionShareError(null)
    setLiquidacionShareUrl(null)
    setLiquidacionPreviewFailed(false)
    try {
      const { url } = await createShareLink({ tipo: "liquidacion", liquidacion })
      setLiquidacionShareUrl(url || null)
    } catch {
      setLiquidacionShareError("No se pudo generar el link de la liquidación.")
    } finally {
      setLiquidacionShareLoading(false)
    }
  }

  const handleLiquidacionOpen = () => {
    if (!liquidacionShareUrl) {
      alert(liquidacionShareError || "No se pudo generar el link de la liquidación.")
      return
    }
    const opened = window.open(liquidacionShareUrl, "_blank", "noopener,noreferrer")
    if (!opened) {
      window.location.href = liquidacionShareUrl
    }
  }

  const handleLiquidacionShare = async () => {
    if (!liquidacionShareUrl) {
      alert(liquidacionShareError || "No se pudo generar el link de la liquidación.")
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({
          url: liquidacionShareUrl,
          title: "Liquidación",
          text: liquidacion ? `Liquidación ${liquidacion.empleada.nombre}` : "Liquidación",
        })
        return
      } catch (err: any) {
        if (err?.name === "AbortError") return
      }
    }
    try {
      await navigator.clipboard.writeText(liquidacionShareUrl)
      alert("Link copiado.")
    } catch {
      alert("No se pudo copiar el link.")
    }
  }

  const handleCrearSena = async () => {
    const nextErrors: { cliente?: string; servicio?: string; monto?: string } = {}
    if (!senaForm.cliente_id) nextErrors.cliente = "Selecciona una clienta."
    if (!senaForm.servicio_id) nextErrors.servicio = "Selecciona un servicio."
    if (!senaForm.monto || Number(senaForm.monto) <= 0) nextErrors.monto = "Ingresa un monto válido."
    if (Object.keys(nextErrors).length > 0) {
      setSenaErrors(nextErrors)
      return
    }
    setSenaErrors({})
    const monto = Number(senaForm.monto || 0)
    if (facturarSena) setFacturando(true)
    try {
      const res = await fetch("/api/senas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...senaForm,
          monto,
          fecha_pago: new Date().toISOString(),
          facturar: facturarSena,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        alert(payload?.error || "No se pudo registrar la seña.")
        return
      }
      if (payload?.factura_pendiente) {
        const detalle = payload?.factura_error ? `\nDetalle: ${payload.factura_error}` : ""
        alert(`Seña registrada. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
      } else if (payload?.factura_error) {
        alert(`Seña registrada. No se pudo facturar: ${payload.factura_error}`)
      }
      if (payload?.factura_id && !payload?.factura_pendiente) {
        setFacturaInfo(payload?.factura || null)
        setFacturaId(payload?.factura_id || null)
        setFacturaOpen(true)
      }
      if (senasKey) {
        mutateSenas()
      }
      setSenaForm({ cliente_id: "", servicio_id: "", monto: "", metodo_pago: metodosPagoList[0] || "efectivo", nota: "" })
      setSenaErrors({})
      setFacturarSena(false)
      setSearchCliente("")
      setSearchServicio("")
      setShowSenaForm(false)
    } finally {
      setFacturando(false)
    }
  }

  const handleCrearAdelanto = async () => {
    const nextErrors: { empleada?: string; monto?: string } = {}
    if (!adelantoForm.empleada_id) nextErrors.empleada = "Selecciona una empleada."
    if (!adelantoForm.monto || Number(adelantoForm.monto) <= 0) nextErrors.monto = "Ingresa un monto válido."
    if (Object.keys(nextErrors).length > 0) {
      setAdelantoErrors(nextErrors)
      return
    }
    setAdelantoErrors({})
    const monto = Number(adelantoForm.monto || 0)
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...adelantoForm, monto }),
    })
    if (!res.ok) return
    if (adelantosKey) {
      mutateAdelantos()
    }
    setAdelantoForm({ empleada_id: "", monto: "", motivo: "" })
    setAdelantoErrors({})
    setSearchEmpleada("")
    setShowAdelantoForm(false)
  }

  if (config && !canManageFinanzas) {
    return <div className="text-sm text-muted-foreground">Sin acceso.</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-10">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button variant="primary" className="gap-2" onClick={() => setShowSenaForm(true)}>
              <PlusIcon className="h-4 w-4" />
              Nueva seña
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar seña..."
                value={searchSenaList}
                onChange={(e) => setSearchSenaList(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAllSenas((prev) => !prev)
                setSenaPage(1)
                if (searchSenaList) setSearchSenaList("")
              }}
            >
              {showAllSenas ? "Ver últimos 5" : "Ver todo"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(esperandoSenas && canSearchSenas) || isSenasLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        {canSearchSenas ? "Buscando señas..." : "Cargando señas..."}
                      </TableCell>
                    </TableRow>
                  ) : senasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        {senaEmptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    senasFiltradas.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.clientes ? `${s.clientes.nombre} ${s.clientes.apellido}` : "Cliente"}
                        </TableCell>
                        <TableCell>{s.servicios?.nombre || "-"}</TableCell>
                        <TableCell className="text-right">${s.monto?.toFixed(2)}</TableCell>
                        <TableCell className="capitalize">{s.metodo_pago}</TableCell>
                        <TableCell className="capitalize text-sm">{s.estado}</TableCell>
                        <TableCell>
                          <UserBadge username={s.creado_por_username} userId={s.creado_por} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {showAllSenas && !isSenaSearchMode && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Button variant="secondary" size="sm" disabled={senaPage === 1} onClick={() => setSenaPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <span>Página {senaPage}</span>
              <Button variant="secondary" size="sm" disabled={!senasHasMore} onClick={() => setSenaPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}

          <Dialog
            open={showSenaForm}
            onOpenChange={(open) => {
              if (!open) {
                setShowSenaForm(false)
                setSearchCliente("")
                setSearchServicio("")
                setFacturarSena(false)
              }
            }}
          >
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva seña</DialogTitle>
                <DialogDescription className="sr-only">Registrar una seña para una clienta.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Cliente</p>
                    <div className="relative">
                      <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Buscar cliente..."
                        value={searchCliente}
                        onChange={(e) => setSearchCliente(e.target.value)}
                      />
                    </div>
                    {senaErrors.cliente && <p className="text-xs text-destructive">{senaErrors.cliente}</p>}
                    {senaForm.cliente_id && (
                      <p className="text-xs text-muted-foreground">
                        Seleccionado:{" "}
                        <span className="font-medium text-foreground">
                          {clientesList.find((c) => c.id === senaForm.cliente_id)?.nombre}{" "}
                          {clientesList.find((c) => c.id === senaForm.cliente_id)?.apellido}
                        </span>
                      </p>
                    )}
                    {searchCliente && (
                      <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                        {clientesFiltrados.length ? (
                          clientesFiltrados.map((c) => (
                            <Button
                              key={c.id}
                              type="button"
                              variant={senaForm.cliente_id === c.id ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => {
                                setSenaForm({ ...senaForm, cliente_id: c.id })
                                if (senaErrors.cliente) setSenaErrors((prev) => ({ ...prev, cliente: undefined }))
                              }}
                            >
                              {c.nombre} {c.apellido}
                            </Button>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Servicio</p>
                    <div className="relative">
                      <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Buscar servicio..."
                        value={searchServicio}
                        onChange={(e) => setSearchServicio(e.target.value)}
                      />
                    </div>
                    {senaErrors.servicio && <p className="text-xs text-destructive">{senaErrors.servicio}</p>}
                    {servicioSeleccionado && (
                      <p className="text-xs text-muted-foreground">
                        Seleccionado:{" "}
                        <span className="font-medium text-foreground">
                          {servicioSeleccionado.nombre} - ${Number((servicioSeleccionado as any).precio ?? (servicioSeleccionado as any).precio_lista ?? 0).toFixed(2)}
                        </span>
                      </p>
                    )}
                    {showServiciosResultados && (
                      <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                        {serviciosFiltrados.length ? (
                          serviciosFiltrados.map((s) => (
                            <Button
                              key={s.id}
                              type="button"
                              variant={senaForm.servicio_id === s.id ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => {
                                setSenaForm({ ...senaForm, servicio_id: s.id })
                                setSearchServicio(s.nombre)
                                if (senaErrors.servicio) setSenaErrors((prev) => ({ ...prev, servicio: undefined }))
                              }}
                            >
                              {s.nombre} - ${Number((s as any).precio ?? (s as any).precio_lista ?? 0).toFixed(2)}
                            </Button>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Monto</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={senaForm.monto}
                      onChange={(e) => {
                        setSenaForm({ ...senaForm, monto: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })
                        if (senaErrors.monto) setSenaErrors((prev) => ({ ...prev, monto: undefined }))
                      }}
                    />
                    {senaErrors.monto && <p className="text-xs text-destructive">{senaErrors.monto}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Método</p>
                    <Select value={senaForm.metodo_pago} onValueChange={(v) => setSenaForm((prev) => ({ ...prev, metodo_pago: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar método" />
                      </SelectTrigger>
                      <SelectContent>
                        {metodosPagoList.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Nota</p>
                  <Input value={senaForm.nota} onChange={(e) => setSenaForm({ ...senaForm, nota: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">¿Facturar esta seña?</p>
                  <Switch checked={facturarSena} onCheckedChange={setFacturarSena} />
                </div>
                <Button className="w-full gap-2" variant="primary" onClick={handleCrearSena}>
                  <PlusIcon className="h-4 w-4" />
                  Registrar seña
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button variant="primary" className="gap-2" onClick={() => setShowAdelantoForm(true)}>
              <PlusIcon className="h-4 w-4" />
              Nuevo adelanto
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar adelanto..."
                value={searchAdelantoList}
                onChange={(e) => setSearchAdelantoList(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAllAdelantos((prev) => !prev)
                setAdelantoPage(1)
                if (searchAdelantoList) setSearchAdelantoList("")
              }}
            >
              {showAllAdelantos ? "Ver últimos 5" : "Ver todo"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleada</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(esperandoAdelantos && canSearchAdelantos) || isAdelantosLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        {canSearchAdelantos ? "Buscando adelantos..." : "Cargando adelantos..."}
                      </TableCell>
                    </TableRow>
                  ) : adelantosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        {adelantoEmptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    adelantosFiltrados.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.empleadas
                            ? `${a.empleadas.nombre} ${a.empleadas.apellido || ""}`.trim()
                            : "Empleada"}
                        </TableCell>
                        <TableCell className="text-right">${a.monto?.toFixed(2)}</TableCell>
                        <TableCell>{formatDate(a.fecha_entrega)}</TableCell>
                        <TableCell>
                          <UserBadge username={a.creado_por_username} userId={a.creado_por} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {showAllAdelantos && !isAdelantoSearchMode && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Button variant="secondary" size="sm" disabled={adelantoPage === 1} onClick={() => setAdelantoPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <span>Página {adelantoPage}</span>
              <Button variant="secondary" size="sm" disabled={!adelantosHasMore} onClick={() => setAdelantoPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}

          <Dialog open={showAdelantoForm} onOpenChange={(open) => !open && setShowAdelantoForm(false)}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo adelanto</DialogTitle>
                <DialogDescription className="sr-only">Registrar un adelanto para una empleada.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Empleada</p>
                    <div className="relative">
                      <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Buscar empleada..."
                        value={searchEmpleada}
                        onChange={(e) => setSearchEmpleada(e.target.value)}
                      />
                    </div>
                    {adelantoErrors.empleada && <p className="text-xs text-destructive">{adelantoErrors.empleada}</p>}
                    {adelantoForm.empleada_id && (
                      <p className="text-xs text-muted-foreground">
                        Seleccionada:{" "}
                        <span className="font-medium text-foreground">
                          {empleadasList.find((e) => e.id === adelantoForm.empleada_id)?.nombre}
                          {empleadasList.find((e) => e.id === adelantoForm.empleada_id)?.apellido
                            ? ` ${empleadasList.find((e) => e.id === adelantoForm.empleada_id)?.apellido}`
                            : ""}
                        </span>
                      </p>
                    )}
                    {searchEmpleada && (
                      <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                        {empleadasFiltradas.length ? (
                          empleadasFiltradas.map((e) => (
                            <Button
                              key={e.id}
                              type="button"
                              variant={adelantoForm.empleada_id === e.id ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => {
                                setAdelantoForm((p) => ({ ...p, empleada_id: e.id }))
                                if (adelantoErrors.empleada) {
                                  setAdelantoErrors((prev) => ({ ...prev, empleada: undefined }))
                                }
                              }}
                            >
                              {e.nombre}
                            </Button>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Monto</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={adelantoForm.monto}
                      onChange={(e) => {
                        setAdelantoForm((p) => ({
                          ...p,
                          monto: e.target.value === "" ? "" : Number.parseFloat(e.target.value),
                        }))
                        if (adelantoErrors.monto) {
                          setAdelantoErrors((prev) => ({ ...prev, monto: undefined }))
                        }
                      }}
                    />
                    {adelantoErrors.monto && <p className="text-xs text-destructive">{adelantoErrors.monto}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Motivo</p>
                    <Input
                      placeholder="Caja, adelanto, viaje..."
                      value={adelantoForm.motivo}
                      onChange={(e) => setAdelantoForm((p) => ({ ...p, motivo: e.target.value }))}
                    />
                  </div>
                </div>
                <Button className="w-full gap-2" variant="primary" onClick={handleCrearAdelanto}>
                  <PlusIcon className="h-4 w-4" />
                  Registrar adelanto
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <FacturaDialog
        open={facturaOpen}
        onOpenChange={(open) => {
          setFacturaOpen(open)
          if (!open) setFacturaId(null)
        }}
        facturaId={facturaId}
        factura={facturaInfo}
      />
      <FacturandoDialog open={facturando} />

      <Dialog
        open={liquidacionShareOpen}
        onOpenChange={(open) => {
          setLiquidacionShareOpen(open)
          if (!open) {
            setLiquidacionShareUrl(null)
            setLiquidacionShareError(null)
            setLiquidacionShareLoading(false)
            setLiquidacionPreviewFailed(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Compartir liquidación</DialogTitle>
            <DialogDescription>Vista previa y opciones para compartir la liquidación.</DialogDescription>
          </DialogHeader>

          {liquidacionShareLoading && <p className="text-sm text-muted-foreground">Cargando vista previa...</p>}
          {liquidacionShareError && !liquidacionShareLoading && <p className="text-sm text-destructive">{liquidacionShareError}</p>}

          {!liquidacionShareLoading && !liquidacionShareError && liquidacionShareUrl && !isAppleMobile && !liquidacionPreviewFailed && (
            <div className="rounded-md border overflow-hidden bg-white">
              <iframe
                src={liquidacionShareUrl}
                title="Vista previa de liquidación"
                className="h-[68vh] w-full"
                onError={() => setLiquidacionPreviewFailed(true)}
              />
            </div>
          )}

          {!liquidacionShareLoading && !liquidacionShareError && liquidacionShareUrl && (isAppleMobile || liquidacionPreviewFailed) && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">No se pudo obtener la vista previa.</p>
              <Button type="button" variant="outline" onClick={handleLiquidacionOpen} className="gap-2">
                <ExternalLinkIcon className="h-4 w-4" />
                Abrir en nueva ventana
              </Button>
            </div>
          )}

          {!liquidacionShareLoading && !liquidacionShareError && !liquidacionShareUrl && (
            <p className="text-sm text-muted-foreground">No se pudo cargar la vista previa.</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleLiquidacionOpen}
              disabled={liquidacionShareLoading || !liquidacionShareUrl}
              className="gap-2"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Ver
            </Button>
            <Button
              type="button"
              onClick={handleLiquidacionShare}
              disabled={liquidacionShareLoading || !liquidacionShareUrl}
              className="gap-2"
            >
              <Share2Icon className="h-4 w-4" />
              Compartir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {canViewLiquidaciones && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button variant="secondary" size="sm" className="gap-1" onClick={() => void openLiquidacionShare()} disabled={!liquidacionDisponible}>
              <PrinterIcon className="h-4 w-4" />
              Compartir
            </Button>
          </div>

          <Card>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-sm font-medium">Desde</p>
                  <Input
                    type="date"
                    value={periodo.desde}
                    onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">Hasta</p>
                  <Input
                    type="date"
                    value={periodo.hasta}
                    onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">Empleada</p>
                  <Select value={filtroLiquidacionEmpleada} onValueChange={setFiltroLiquidacionEmpleada}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar empleada" />
                    </SelectTrigger>
                    <SelectContent>
                      {empleadasList.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre}
                          {e.apellido ? ` ${e.apellido}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarIcon className="h-4 w-4" />
                    {formatDateRange(periodo.desde, periodo.hasta)}
                  </div>
                </div>
              </div>

              {filtroLiquidacionEmpleada && !liquidacionData && (
                <p className="text-sm text-muted-foreground">Cargando liquidación...</p>
              )}

              {filtroLiquidacionEmpleada && liquidacionData && !liquidacionDisponible && (
                <p className="text-sm text-destructive">
                  {(liquidacionData as any).error || "No se pudo cargar la liquidación."}
                </p>
              )}

              {filtroLiquidacionEmpleada && liquidacion && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Empleada</span>
                    <span className="font-medium">
                      {liquidacion.empleada.nombre}
                      {liquidacion.empleada.apellido ? ` ${liquidacion.empleada.apellido}` : ""}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Servicios</TableHead>
                          <TableHead>Productos</TableHead>
                          <TableHead className="text-right">Comision</TableHead>
                          <TableHead>Adelantos</TableHead>
                          <TableHead className="text-right">Neto a cobrar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {liquidacionItems.map((item) => {
                          const isAdelanto = item.tipo === "adelanto"
                          const fecha = item.fecha ? formatDate(item.fecha) : "-"
                          const comisionValor =
                            item.tipo !== "adelanto" && Number.isFinite(Number(item.comision))
                              ? `$${Number(item.comision || 0).toFixed(2)}`
                              : "-"
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm">{fecha}</TableCell>
                              <TableCell className="text-sm">
                                {item.tipo === "servicio" ? (
                                  <p className="font-medium">{item.servicio || "-"}</p>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {item.tipo === "producto" ? (
                                  <p className="font-medium">{item.producto || "-"}</p>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-right">{comisionValor}</TableCell>
                              <TableCell className={isAdelanto ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                                {isAdelanto ? `-$${Math.abs(Number(item.adelanto || 0)).toFixed(2)}` : "-"}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                            </TableRow>
                          )
                        })}
                        <TableRow>
                          <TableCell>-</TableCell>
                          <TableCell className="font-semibold">Totales</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${Number(liquidacion.totales.comision || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {Number(liquidacion.totales.adelantos || 0) > 0
                              ? `-$${Number(liquidacion.totales.adelantos || 0).toFixed(2)}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ${Number(liquidacion.totales.neto || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

