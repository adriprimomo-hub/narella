"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR, { mutate } from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Turno } from "../turnos/turnos-grid"
import type { Servicio } from "../servicios/servicios-list"
import type { Empleada } from "../empleadas/types"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { CreditCardIcon, Loader2Icon, SearchIcon, Trash2Icon, WalletIcon, XIcon, UserIcon } from "lucide-react"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { FacturandoDialog } from "@/components/facturacion/facturando-dialog"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

interface CerrarTurnoModalProps {
  turno: Turno
  onSuccess: () => void
  servicios: Servicio[]
  empleadas: Empleada[]
}

type Sena = {
  id: string
  monto: number
  estado: string
  nota?: string | null
  servicio_id?: string | null
  servicios?: { id: string; nombre: string } | null
}
type Giftcard = {
  id: string
  numero: string
  servicio_ids: string[]
  servicios?: { id: string; nombre: string }[]
  valido_hasta?: string | null
  de_parte_de?: string | null
  estado?: string | null
}
type Producto = {
  id: string
  nombre: string
  precio_lista: number
  precio_descuento?: number | null
  stock_actual: number
}
type ProductoVenta = {
  uid: string
  producto_id: string
  cantidad: number | ""
  precio_unitario: number | ""
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
  turno_id_origen?: string | null
}
type ServicioAgregado = {
  uid: string
  servicio_id: string
  cantidad: number | ""
  precio_unitario: number | ""
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
}
type StaffOrigen = {
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
}
type Config = {
  metodos_pago_config?: { nombre: string }[]
  rol?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const createLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function CerrarTurnoModal({ turno, onSuccess, servicios, empleadas }: CerrarTurnoModalProps) {
  const { data: senas } = useSWR<Sena[]>(`/api/senas?cliente_id=${turno.cliente_id}&estado=pendiente`, fetcher)
  const { data: giftcards = [] } = useSWR<Giftcard[]>(
    `/api/giftcards?cliente_id=${turno.cliente_id}&estado=vigente`,
    fetcher,
  )
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: config } = useSWR<Config>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"

  const inicialServicio = turno.servicio_final_id || turno.servicio_id
  const inicialEmpleada = turno.empleada_final_id || turno.empleada_id || ""
  const [selectedServicio, setSelectedServicio] = useState(inicialServicio)
  const [selectedEmpleada, setSelectedEmpleada] = useState(inicialEmpleada)
  const [metodoPago, setMetodoPago] = useState("efectivo")
  const [tipoPrecio, setTipoPrecio] = useState<"lista" | "descuento">("lista")
  const [aplicarSenaId, setAplicarSenaId] = useState<string>("ninguna")
  const [aplicarGiftcardId, setAplicarGiftcardId] = useState<string>("ninguna")
  const [penalidadMonto, setPenalidadMonto] = useState<number | "">("")
  const [observaciones, setObservaciones] = useState(turno.observaciones || "")
  const [precioServicio, setPrecioServicio] = useState<number | "">("")
  const [serviciosAgregados, setServiciosAgregados] = useState<ServicioAgregado[]>([])
  const [productosVendidos, setProductosVendidos] = useState<ProductoVenta[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [facturar, setFacturar] = useState(false)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [pendingRefreshAfterFactura, setPendingRefreshAfterFactura] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [minutosTarde, setMinutosTarde] = useState(0)
  const [searchServicio, setSearchServicio] = useState("")
  const [searchProducto, setSearchProducto] = useState("")
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const metodosPago = useMemo(() => {
    if (config?.metodos_pago_config?.length) return config.metodos_pago_config.map((m) => m.nombre).filter(Boolean)
    return ["efectivo", "tarjeta", "transferencia"]
  }, [config])
  const empleadasMap = useMemo(() => new Map(empleadas.map((e) => [e.id, e])), [empleadas])

  const servicioActual = useMemo(
    () => servicios.find((s) => s.id === selectedServicio) || servicios[0],
    [servicios, selectedServicio],
  )

  const calcularPrecioServicio = (tipo: "lista" | "descuento", servicio: Servicio | undefined = servicioActual) => {
    const precioLista = servicio?.precio_lista || 0
    const precioDescuento = servicio?.precio_descuento
    return tipo === "descuento" && precioDescuento != null ? precioDescuento : precioLista
  }

  const handleTipoPrecioChange = (value: "lista" | "descuento") => {
    setTipoPrecio(value)
    setPrecioServicio(calcularPrecioServicio(value))
  }

  useEffect(() => {
    if (!selectedServicio && servicios.length) {
      setSelectedServicio(servicios[0].id)
    }
    if (!selectedEmpleada && empleadas.length) {
      setSelectedEmpleada(empleadas[0].id)
    }
  }, [servicios, selectedServicio, empleadas, selectedEmpleada])

  useEffect(() => {
    if (!metodosPago.length) return
    if (!metodosPago.includes(metodoPago)) {
      setMetodoPago(metodosPago[0])
    }
  }, [metodosPago, metodoPago])

  useEffect(() => {
    if (!open) return
    const inicio = new Date(turno.fecha_inicio)
    const referencia = turno.iniciado_en ? new Date(turno.iniciado_en) : new Date()
    const diff = Math.floor((referencia.getTime() - inicio.getTime()) / 60000)
    const minutos = Number.isFinite(diff) ? Math.max(0, diff) : 0
    setMinutosTarde(minutos)
    if (minutos < 15) {
      setPenalidadMonto("")
    }
    setObservaciones(turno.observaciones || "")
    setServiciosAgregados(
      Array.isArray(turno.servicios_agregados)
        ? turno.servicios_agregados.map((item) => ({
            uid: createLocalId(),
            ...item,
            origen_staff: Boolean(item.origen_staff === true && item.agregado_por_empleada_id),
            agregado_por_empleada_id: item.agregado_por_empleada_id ?? null,
            agregado_por_user_id: item.agregado_por_user_id ?? null,
          }))
        : [],
    )
    setProductosVendidos(
      Array.isArray(turno.productos_agregados)
        ? turno.productos_agregados.map((p) => ({
            uid: createLocalId(),
            ...p,
            origen_staff: Boolean(p.origen_staff === true && p.agregado_por_empleada_id),
            agregado_por_empleada_id: p.agregado_por_empleada_id ?? null,
            agregado_por_user_id: p.agregado_por_user_id ?? null,
            turno_id_origen: p.turno_id_origen ?? turno.id,
          }))
        : [],
    )
    const servicioTurno = servicios.find((s) => s.id === (turno.servicio_final_id || turno.servicio_id)) || servicios[0]
    setTipoPrecio("lista")
    setPrecioServicio(servicioTurno?.precio_lista == null ? "" : Number(servicioTurno.precio_lista))
    setAplicarGiftcardId("ninguna")
    setSubmitAttempted(false)
  }, [
    open,
    servicios,
    turno.id,
    turno.fecha_inicio,
    turno.iniciado_en,
    turno.observaciones,
    turno.servicios_agregados,
    turno.productos_agregados,
    turno.servicio_final_id,
    turno.servicio_id,
  ])

  const senaSeleccionada = useMemo(() => senas?.find((s) => s.id === aplicarSenaId), [senas, aplicarSenaId])
  const giftcardSeleccionada = useMemo(
    () => giftcards?.find((g) => g.id === aplicarGiftcardId),
    [giftcards, aplicarGiftcardId],
  )

  const totalServiciosAgregados = serviciosAgregados.reduce((acc, s) => {
    const cantidad = Number(s.cantidad || 0)
    const precio = Number(s.precio_unitario || 0)
    return acc + precio * cantidad
  }, 0)
  const totalProductos = productosVendidos.reduce((acc, p) => {
    const cantidad = Number(p.cantidad || 0)
    const precio = Number(p.precio_unitario || 0)
    return acc + precio * cantidad
  }, 0)
  const penalidadActiva = minutosTarde >= 15
  const totalServicio = Math.max(0, Number(precioServicio || 0))
  const totalPenalidad = penalidadActiva && penalidadMonto !== "" ? Math.max(0, Number(penalidadMonto)) : 0
  const totalSinDescuentos = totalServicio + totalServiciosAgregados + totalProductos + totalPenalidad

  const giftcardMontoAplicado = useMemo(() => {
    if (!giftcardSeleccionada) return 0
    const ids = Array.isArray(giftcardSeleccionada.servicio_ids) ? giftcardSeleccionada.servicio_ids : []
    let monto = 0
    if (ids.includes(selectedServicio)) {
      monto += totalServicio
    }
    serviciosAgregados.forEach((s) => {
      if (!ids.includes(s.servicio_id)) return
      const cantidad = Number(s.cantidad || 0)
      const precio = Number(s.precio_unitario || 0)
      monto += precio * cantidad
    })
    return Math.max(0, Math.min(monto, totalSinDescuentos))
  }, [giftcardSeleccionada, selectedServicio, serviciosAgregados, totalServicio, totalSinDescuentos])

  const totalMenosGiftcard = totalSinDescuentos - giftcardMontoAplicado
  const montoSenaAplicada =
    aplicarGiftcardId !== "ninguna" ? 0 : aplicarSenaId !== "ninguna" ? senaSeleccionada?.monto || 0 : 0
  const totalMenosSena = totalMenosGiftcard - montoSenaAplicada
  const totalCobrar = Math.max(totalMenosSena, 0)
  const puedeFacturar = totalCobrar > 0
  const serviciosInvalidos = serviciosAgregados.some(
    (s) => s.cantidad === "" || Number(s.cantidad) <= 0 || s.precio_unitario === "",
  )
  const productosInvalidos = productosVendidos.some(
    (p) => p.cantidad === "" || Number(p.cantidad) <= 0 || p.precio_unitario === "",
  )
  const precioServicioInvalido = precioServicio === ""

  useEffect(() => {
    if (!puedeFacturar && facturar) {
      setFacturar(false)
    }
  }, [puedeFacturar, facturar])

  const agregarServicio = (servicio_id: string) => {
    const srv = servicios.find((s) => s.id === servicio_id)
    if (!srv) return
    const precio = tipoPrecio === "descuento" && srv.precio_descuento != null ? srv.precio_descuento : srv.precio_lista
    setServiciosAgregados((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        servicio_id,
        cantidad: "",
        precio_unitario: precio,
        origen_staff: false,
        agregado_por_empleada_id: null,
        agregado_por_user_id: null,
      },
    ])
  }

  const agregarProducto = (producto_id: string) => {
    const prod = productos.find((p) => p.id === producto_id)
    if (!prod) return
    const precioBase = Number(prod.precio_descuento ?? prod.precio_lista ?? 0)
    setProductosVendidos((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        producto_id,
        cantidad: "",
        precio_unitario: precioBase,
        origen_staff: false,
        agregado_por_empleada_id: null,
        agregado_por_user_id: null,
        turno_id_origen: turno.id,
      },
    ])
  }

  const productosFiltrados = useMemo(() => {
    const term = searchProducto.toLowerCase()
    return productos.filter((p) => p.nombre.toLowerCase().includes(term) && p.stock_actual > 0)
  }, [productos, searchProducto])

  useEffect(() => {
    if (aplicarGiftcardId !== "ninguna" && aplicarSenaId !== "ninguna") {
      setAplicarSenaId("ninguna")
    }
  }, [aplicarGiftcardId, aplicarSenaId])

  const serviciosFiltrados = useMemo(() => {
    const term = searchServicio.toLowerCase()
    return servicios.filter((s) => s.nombre.toLowerCase().includes(term))
  }, [servicios, searchServicio])

  const getOrigenStaffLabel = (item: StaffOrigen) => {
    const staffId = item.origen_staff === true ? item.agregado_por_empleada_id || null : null
    if (!staffId) return null
    const staff = empleadasMap.get(staffId)
    if (!staff) return null
    const label = [staff.nombre, staff.apellido].filter(Boolean).join(" ").trim()
    return label || null
  }

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    if (precioServicioInvalido || serviciosInvalidos || productosInvalidos) return
    setLoading(true)
    setPendingRefreshAfterFactura(false)
    const shouldShowFacturando = facturar && totalCobrar > 0
    if (shouldShowFacturando) setFacturando(true)
    try {
      const serviciosPayload = serviciosAgregados.map(({ uid, ...s }) => ({
        ...s,
        cantidad: Number(s.cantidad || 0),
        precio_unitario: Number(s.precio_unitario || 0),
        origen_staff: Boolean(s.origen_staff === true && s.agregado_por_empleada_id),
        agregado_por_empleada_id: s.agregado_por_empleada_id || null,
        agregado_por_user_id: s.agregado_por_user_id || null,
      }))
      const productosPayload = productosVendidos.map(({ uid, ...p }) => ({
        ...p,
        cantidad: Number(p.cantidad || 0),
        precio_unitario: Number(p.precio_unitario || 0),
        origen_staff: Boolean(p.origen_staff),
        agregado_por_empleada_id: p.agregado_por_empleada_id || null,
        agregado_por_user_id: p.agregado_por_user_id || null,
        turno_id_origen: p.turno_id_origen || turno.id,
      }))
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turno_id: turno.id,
          metodo_pago: metodoPago,
          monto_total: totalSinDescuentos,
          facturar: facturar && totalCobrar > 0,
          precio_servicio: totalServicio,
          aplicar_giftcard: aplicarGiftcardId !== "ninguna",
          giftcard_id: aplicarGiftcardId !== "ninguna" ? aplicarGiftcardId : null,
          aplicar_sena: aplicarSenaId !== "ninguna",
          sena_id: aplicarSenaId !== "ninguna" ? aplicarSenaId : null,
          penalidad_monto: totalPenalidad,
          minutos_tarde: minutosTarde,
          nuevo_servicio_id: selectedServicio,
          nueva_empleada_id: selectedEmpleada,
          servicios_agregados: serviciosPayload,
          productos: productosPayload,
          observaciones: observaciones.trim(),
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        alert(data?.error || "No se pudo registrar el pago")
        return
      }

      const shouldOpenFacturaPreview = Boolean(data?.factura_id && !data?.factura_pendiente)

      mutate("/api/caja/movimientos")
      mutate(`/api/reportes/clientes/${turno.cliente_id}`)
      if (data?.factura_pendiente) {
        const detalle = data?.factura_error ? `\nDetalle: ${data.factura_error}` : ""
        alert(`Pago registrado. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
      } else if (data?.factura_error) {
        alert(`Pago registrado. No se pudo facturar: ${data.factura_error}`)
      }
      if (shouldOpenFacturaPreview) {
        setFacturaInfo(data?.factura || null)
        setFacturaId(data?.factura_id || null)
        setFacturaOpen(true)
        setPendingRefreshAfterFactura(true)
      } else {
        onSuccess()
      }
      setOpen(false)
    } catch (error) {
      console.error("Error:", error)
      alert("No se pudo registrar el pago")
    } finally {
      setFacturando(false)
      setLoading(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <WalletIcon className="h-3.5 w-3.5" />
          Cerrar y cobrar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar turno y registrar pago</DialogTitle>
          <DialogDescription>
            {`${turno.clientes.nombre} ${turno.clientes.apellido}`} · {turno.servicios.nombre}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {turno.foto_trabajo_disponible && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Foto del trabajo</p>
              </div>
              <VerTurnoFotoButton turnoId={turno.id} />
            </div>
          )}
            <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium mb-2">Servicio realizado</p>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                {servicioActual?.nombre}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Tipo de precio</p>
              <Select value={tipoPrecio} onValueChange={(v) => handleTipoPrecioChange(v as "lista" | "descuento")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">
                    Precio lista {servicioActual?.precio_lista != null && `($${servicioActual.precio_lista.toFixed(2)})`}
                  </SelectItem>
                  <SelectItem value="descuento" disabled={servicioActual?.precio_descuento == null}>
                    Precio descuento {servicioActual?.precio_descuento != null ? `($${servicioActual.precio_descuento.toFixed(2)})` : "(no disponible)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Precio final</p>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={precioServicio}
                onChange={(e) =>
                  setPrecioServicio(e.target.value === "" ? "" : Number.parseFloat(e.target.value))
                }
                placeholder="Precio"
                aria-label="Precio del servicio"
                disabled={!isAdmin}
              />
              {submitAttempted && precioServicioInvalido && (
                <p className="text-xs text-destructive mt-1">Completa el precio del servicio.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Realizado por</p>
            <div className="rounded-md border bg-muted px-3 py-2 text-sm">
              {empleadas.find((e) => e.id === selectedEmpleada)?.nombre || "Sin asignar"}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">Servicios</p>
              <div className="relative flex-1 sm:max-w-xs">
                <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Select value="" onValueChange={(value) => {
                  agregarServicio(value)
                  setSearchServicio("")
                }}>
                  <SelectTrigger className="h-[var(--control-height-sm)] pl-8">
                    <SelectValue placeholder={searchServicio || "Buscar y agregar servicio"} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5">
                      <Input
                        value={searchServicio}
                        onChange={(e) => setSearchServicio(e.target.value)}
                        placeholder="Buscar..."
                        className="h-8"
                      />
                    </div>
                    {serviciosFiltrados.map((s) => {
                      const basePrecio =
                        tipoPrecio === "descuento" && s.precio_descuento != null ? s.precio_descuento : s.precio_lista
                      const precio = Number(basePrecio ?? (s as any).precio ?? 0)
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre} · ${precio.toFixed(2)}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {serviciosAgregados.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin servicios agregados.</p>
            ) : (
              <div className="space-y-2">
                {serviciosAgregados.map((s) => {
                  const detalle = servicios.find((d) => d.id === s.servicio_id)
                  const origenStaffLabel = getOrigenStaffLabel(s)
                  return (
                    <div key={s.uid} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{detalle?.nombre || "Servicio"}</Badge>
                      {origenStaffLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserIcon className="h-3 w-3" />
                          {origenStaffLabel}
                        </span>
                      )}
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          min={1}
                          value={s.cantidad}
                          placeholder="1"
                          className="w-16"
                          onChange={(e) =>
                            setServiciosAgregados((prev) =>
                              prev.map((item) =>
                                item.uid === s.uid
                                  ? {
                                      ...item,
                                      cantidad: e.target.value === "" ? "" : Number.parseInt(e.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        {submitAttempted && (s.cantidad === "" || Number(s.cantidad) <= 0) && (
                          <span className="text-[11px] text-destructive">Cantidad requerida</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          step="0.01"
                          value={s.precio_unitario}
                          placeholder="0.00"
                          className="w-24"
                          onChange={(e) =>
                            setServiciosAgregados((prev) =>
                              prev.map((item) =>
                                item.uid === s.uid
                                  ? {
                                      ...item,
                                      precio_unitario: e.target.value === "" ? "" : Number.parseFloat(e.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          disabled={!isAdmin}
                        />
                        {submitAttempted && s.precio_unitario === "" && (
                          <span className="text-[11px] text-destructive">Precio requerido</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Total: ${(Number(s.precio_unitario || 0) * Number(s.cantidad || 0)).toFixed(2)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setServiciosAgregados((prev) => prev.filter((item) => item.uid !== s.uid))}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">Productos</p>
              <div className="relative flex-1 sm:max-w-xs">
                <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Select value="" onValueChange={(value) => {
                  agregarProducto(value)
                  setSearchProducto("")
                }}>
                  <SelectTrigger className="h-[var(--control-height-sm)] pl-8">
                    <SelectValue placeholder={searchProducto || "Buscar y agregar producto"} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5">
                      <Input
                        value={searchProducto}
                        onChange={(e) => setSearchProducto(e.target.value)}
                        placeholder="Buscar..."
                        className="h-8"
                      />
                    </div>
                    {productosFiltrados.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} · $
                        {Number(p.precio_descuento ?? p.precio_lista ?? 0).toFixed(2)} (Stock: {p.stock_actual})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {productosVendidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin productos.</p>
            ) : (
              <div className="space-y-2">
                {productosVendidos.map((p) => {
                  const detalle = productos.find((d) => d.id === p.producto_id)
                  const origenStaffLabel = getOrigenStaffLabel(p)
                  return (
                    <div key={p.uid} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{detalle?.nombre || "Producto"}</Badge>
                      {origenStaffLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserIcon className="h-3 w-3" />
                          {origenStaffLabel}
                        </span>
                      )}
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          min={1}
                          max={detalle?.stock_actual || 999}
                          value={p.cantidad}
                          placeholder="1"
                          className="w-16"
                          onChange={(e) =>
                            setProductosVendidos((prev) =>
                              prev.map((item) =>
                                item.uid === p.uid
                                  ? {
                                      ...item,
                                      cantidad: e.target.value === "" ? "" : Number.parseInt(e.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        {submitAttempted && (p.cantidad === "" || Number(p.cantidad) <= 0) && (
                          <span className="text-[11px] text-destructive">Cantidad requerida</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          step="0.01"
                          value={p.precio_unitario}
                          placeholder="0.00"
                          className="w-24"
                          onChange={(e) =>
                            setProductosVendidos((prev) =>
                              prev.map((item) =>
                                item.uid === p.uid
                                  ? {
                                      ...item,
                                      precio_unitario: e.target.value === "" ? "" : Number.parseFloat(e.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          disabled={!isAdmin}
                        />
                        {submitAttempted && p.precio_unitario === "" && (
                          <span className="text-[11px] text-destructive">Precio requerido</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Total: ${(Number(p.precio_unitario || 0) * Number(p.cantidad || 0)).toFixed(2)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setProductosVendidos((prev) => prev.filter((item) => item.uid !== p.uid))}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={`grid gap-3 ${giftcards.length ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div>
              <p className="text-sm font-medium">Método de pago</p>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metodosPago.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {giftcards.length > 0 && (
              <div>
                <p className="text-sm font-medium">Giftcard</p>
                <Select value={aplicarGiftcardId} onValueChange={setAplicarGiftcardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin giftcard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">No aplicar</SelectItem>
                    {giftcards.map((g) => {
                      const serviciosLabel =
                        Array.isArray(g.servicios) && g.servicios.length
                          ? g.servicios.map((s) => s.nombre).join(", ")
                          : Array.isArray(g.servicio_ids)
                            ? g.servicio_ids
                                .map((id) => servicios.find((srv) => srv.id === id)?.nombre)
                                .filter(Boolean)
                                .join(", ")
                            : "Servicios"
                      return (
                        <SelectItem key={g.id} value={g.id}>
                          {g.numero} · {serviciosLabel}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {giftcardSeleccionada && giftcardSeleccionada.valido_hasta && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Vence: {new Date(giftcardSeleccionada.valido_hasta).toLocaleDateString("es-AR")}
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">Seña</p>
              <Select value={aplicarSenaId} onValueChange={setAplicarSenaId} disabled={aplicarGiftcardId !== "ninguna"}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin seña" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">No aplicar (dejar disponible)</SelectItem>
                  {senas?.map((s) => {
                    const servicioLabel =
                      s.servicios?.nombre || servicios.find((srv) => srv.id === s.servicio_id)?.nombre || "Servicio"
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        Aplicar ${Number(s.monto || 0).toFixed(2)} · {servicioLabel}
                        {s.nota ? ` · ${s.nota}` : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {aplicarGiftcardId !== "ninguna" && (
                <p className="mt-1 text-[11px] text-muted-foreground">La seña no se aplica cuando usas giftcard.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Minutos de retraso</p>
              <Input
                type="number"
                min={0}
                value={minutosTarde}
                readOnly
              />
            </div>
            <div>
              <p className="text-sm font-medium">Penalidad</p>
              <Input
                type="number"
                step="0.01"
                value={penalidadMonto}
                onChange={(e) => setPenalidadMonto(e.target.value === "" ? "" : Number.parseFloat(e.target.value))}
                placeholder="0.00"
                disabled={!penalidadActiva || !isAdmin}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Observaciones</p>
            <Textarea
              className="mt-2"
              placeholder="Notas sobre este turno"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span>Servicio</span>
              <strong>${totalServicio.toFixed(2)}</strong>
            </div>
            {totalServiciosAgregados > 0 && (
              <div className="flex justify-between">
                <span>Servicios agregados</span>
                <strong>${totalServiciosAgregados.toFixed(2)}</strong>
              </div>
            )}
            {totalProductos > 0 && (
              <div className="flex justify-between">
                <span>Productos</span>
                <strong>${totalProductos.toFixed(2)}</strong>
              </div>
            )}
            {totalPenalidad > 0 && (
              <div className="flex justify-between">
                <span>Penalidad</span>
                <strong>${totalPenalidad.toFixed(2)}</strong>
              </div>
            )}
            {aplicarGiftcardId !== "ninguna" && giftcardMontoAplicado > 0 && (
              <div className="flex justify-between text-[color:var(--status-warning-fg)]">
                <span>Giftcard aplicada</span>
                <strong>- ${giftcardMontoAplicado.toFixed(2)}</strong>
              </div>
            )}
            {aplicarSenaId !== "ninguna" && montoSenaAplicada > 0 && (
              <div className="flex justify-between text-[color:var(--status-warning-fg)]">
                <span>Seña aplicada</span>
                <strong>- ${Number(montoSenaAplicada).toFixed(2)}</strong>
              </div>
            )}
            <div className="mt-2 flex justify-between text-lg">
              <span>Total a cobrar</span>
              <strong>${totalCobrar.toFixed(2)}</strong>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">¿Desea facturar este cobro?</p>
              {!puedeFacturar && (
                <p className="text-xs text-muted-foreground">No hay saldo a cobrar para facturar.</p>
              )}
            </div>
            <Switch checked={facturar} onCheckedChange={setFacturar} disabled={!puedeFacturar} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading} className="flex-1 gap-2">
              <XIcon className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="flex-1 gap-2" variant="default">
              {loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CreditCardIcon className="h-4 w-4" />
                  Cobrar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <FacturaDialog
      open={facturaOpen}
      onOpenChange={(open) => {
        setFacturaOpen(open)
        if (!open) {
          setFacturaId(null)
          setFacturaInfo(null)
          if (pendingRefreshAfterFactura) {
            setPendingRefreshAfterFactura(false)
            onSuccess()
          }
        }
      }}
      facturaId={facturaId}
      factura={facturaInfo}
    />
    <FacturandoDialog open={facturando} />
    </>
  )
}
