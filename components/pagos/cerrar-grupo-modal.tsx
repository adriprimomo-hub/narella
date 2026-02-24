"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR, { mutate } from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Turno } from "../turnos/turnos-grid"
import type { Servicio } from "../servicios/servicios-list"
import type { Empleada } from "../empleadas/types"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2Icon, SearchIcon, Trash2Icon, WalletIcon } from "lucide-react"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { FacturandoDialog } from "@/components/facturacion/facturando-dialog"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

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
  empleada_id?: string | null
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
  turno_id_origen?: string | null
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

interface CerrarGrupoModalProps {
  turnos: Turno[]
  onSuccess: () => void
  servicios: Servicio[]
  empleadas: Empleada[]
}

export function CerrarGrupoModal({ turnos, onSuccess, servicios, empleadas }: CerrarGrupoModalProps) {
  const grupoId = turnos?.[0]?.grupo_id || null
  const clienteId = turnos?.[0]?.cliente_id
  const { data: senas } = useSWR<Sena[]>(clienteId ? `/api/senas?cliente_id=${clienteId}&estado=pendiente` : null, fetcher)
  const { data: giftcards = [] } = useSWR<Giftcard[]>(
    clienteId ? `/api/giftcards?cliente_id=${clienteId}&estado=vigente` : null,
    fetcher,
  )
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: config } = useSWR<Config>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"

  const [metodoPago, setMetodoPago] = useState("efectivo")
  const [tipoPrecio, setTipoPrecio] = useState<"lista" | "descuento">("lista")
  const [aplicarSenaId, setAplicarSenaId] = useState<string>("ninguna")
  const [aplicarGiftcardId, setAplicarGiftcardId] = useState<string>("ninguna")
  const [observaciones, setObservaciones] = useState("")
  const [precios, setPrecios] = useState<Record<string, number | "">>({})
  const [productosVendidos, setProductosVendidos] = useState<ProductoVenta[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [searchProducto, setSearchProducto] = useState("")
  const [facturar, setFacturar] = useState(false)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [pendingRefreshAfterFactura, setPendingRefreshAfterFactura] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const metodosPago = useMemo(() => {
    if (config?.metodos_pago_config?.length) return config.metodos_pago_config.map((m) => m.nombre).filter(Boolean)
    return ["efectivo", "tarjeta", "transferencia"]
  }, [config])

  useEffect(() => {
    if (!metodosPago.length) return
    if (!metodosPago.includes(metodoPago)) {
      setMetodoPago(metodosPago[0])
    }
  }, [metodosPago, metodoPago])

  const serviciosMap = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios])
  const empleadasMap = useMemo(() => new Map(empleadas.map((e) => [e.id, e])), [empleadas])
  const grupoStaffIds = useMemo(
    () => Array.from(new Set(turnos.map((t) => t.empleada_final_id || t.empleada_id).filter(Boolean) as string[])),
    [turnos],
  )
  const productosPreCargados = useMemo(() => {
    const items: ProductoVenta[] = []
    turnos.forEach((turno) => {
      const empleadaTurno = turno.empleada_final_id || turno.empleada_id || null
      const productosTurno = Array.isArray(turno.productos_agregados) ? turno.productos_agregados : []
      productosTurno.forEach((p) => {
        if (!p?.producto_id) return
        const empleadaStaffOrigen = p.agregado_por_empleada_id ?? null
        items.push({
          uid: createLocalId(),
          producto_id: p.producto_id,
          cantidad: p.cantidad ?? "",
          precio_unitario: p.precio_unitario ?? "",
          empleada_id: empleadaStaffOrigen ?? empleadaTurno,
          origen_staff: Boolean(p.origen_staff === true && empleadaStaffOrigen),
          agregado_por_empleada_id: empleadaStaffOrigen,
          agregado_por_user_id: p.agregado_por_user_id ?? null,
          turno_id_origen: p.turno_id_origen ?? turno.id,
        })
      })
    })
    return items
  }, [turnos])

  const calcularPrecioServicio = (servicio: Servicio | undefined, tipo: "lista" | "descuento") => {
    const precioLista = Number(servicio?.precio_lista ?? (servicio as any)?.precio ?? 0)
    const precioDescuento = servicio?.precio_descuento
    const base = tipo === "descuento" && precioDescuento != null ? precioDescuento : precioLista
    return base
  }

  useEffect(() => {
    if (!open) return
    const next: Record<string, number> = {}
    turnos.forEach((t) => {
      const servicioId = t.servicio_final_id || t.servicio_id
      const servicio = serviciosMap.get(servicioId)
      next[t.id] = calcularPrecioServicio(servicio, tipoPrecio)
    })
    setPrecios(next)
    setObservaciones(turnos[0]?.observaciones || "")
    setProductosVendidos(productosPreCargados)
    setAplicarGiftcardId("ninguna")
    setSubmitAttempted(false)
  }, [open, tipoPrecio, turnos, serviciosMap, productosPreCargados])

  const productosFiltrados = useMemo(() => {
    const term = searchProducto.toLowerCase()
    return productos.filter((p) => p.nombre.toLowerCase().includes(term) && p.stock_actual > 0)
  }, [productos, searchProducto])

  const agregarProducto = (producto_id: string) => {
    const prod = productos.find((p) => p.id === producto_id)
    if (!prod) return
    const defaultEmpleada = grupoStaffIds[0] || null
    const precioBase = Number(prod.precio_descuento ?? prod.precio_lista ?? 0)
    setProductosVendidos((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        producto_id,
        cantidad: "",
        precio_unitario: precioBase,
        empleada_id: defaultEmpleada,
        origen_staff: false,
        agregado_por_empleada_id: null,
        agregado_por_user_id: null,
        turno_id_origen: null,
      },
    ])
  }

  const totalServicios = turnos.reduce((acc, t) => acc + Number(precios[t.id] || 0), 0)
  const totalProductos = productosVendidos.reduce((acc, p) => {
    const cantidad = Number(p.cantidad || 0)
    const precio = Number(p.precio_unitario || 0)
    return acc + precio * cantidad
  }, 0)
  const totalSinDescuentos = totalServicios + totalProductos
  const senaSeleccionada = useMemo(() => senas?.find((s) => s.id === aplicarSenaId), [senas, aplicarSenaId])
  const giftcardSeleccionada = useMemo(
    () => giftcards?.find((g) => g.id === aplicarGiftcardId),
    [giftcards, aplicarGiftcardId],
  )
  const giftcardMontoAplicado = useMemo(() => {
    if (!giftcardSeleccionada) return 0
    const ids = Array.isArray(giftcardSeleccionada.servicio_ids) ? giftcardSeleccionada.servicio_ids : []
    if (!ids.length) return 0
    const remaining = new Map<string, number>()
    ids.forEach((id) => {
      remaining.set(id, (remaining.get(id) || 0) + 1)
    })
    let monto = 0
    turnos.forEach((t) => {
      const servicioId = t.servicio_final_id || t.servicio_id
      if (!servicioId) return
      const count = remaining.get(servicioId) || 0
      if (count <= 0) return
      remaining.set(servicioId, count - 1)
      monto += Number(precios[t.id] || 0)
    })
    return Math.max(0, Math.min(monto, totalSinDescuentos))
  }, [giftcardSeleccionada, turnos, precios, totalSinDescuentos])
  const totalMenosGiftcard = totalSinDescuentos - giftcardMontoAplicado
  const montoSenaAplicada =
    aplicarGiftcardId !== "ninguna" ? 0 : aplicarSenaId !== "ninguna" ? senaSeleccionada?.monto || 0 : 0
  const totalMenosSena = totalMenosGiftcard - montoSenaAplicada
  const totalCobrar = Math.max(totalMenosSena, 0)
  const puedeFacturar = totalCobrar > 0
  const preciosInvalidos = turnos.some((t) => precios[t.id] === "" || precios[t.id] == null)
  const productosInvalidos = productosVendidos.some(
    (p) => p.cantidad === "" || Number(p.cantidad) <= 0 || p.precio_unitario === "",
  )

  useEffect(() => {
    if (aplicarGiftcardId !== "ninguna" && aplicarSenaId !== "ninguna") {
      setAplicarSenaId("ninguna")
    }
  }, [aplicarGiftcardId, aplicarSenaId])

  useEffect(() => {
    if (!puedeFacturar && facturar) {
      setFacturar(false)
    }
  }, [puedeFacturar, facturar])

  const handleSubmit = async () => {
    if (!grupoId) return
    setSubmitAttempted(true)
    if (preciosInvalidos || productosInvalidos) return
    setLoading(true)
    setPendingRefreshAfterFactura(false)
    const shouldShowFacturando = facturar && totalCobrar > 0
    if (shouldShowFacturando) setFacturando(true)
    try {
      const productosPayload = productosVendidos.map(({ uid, ...p }) => ({
        ...p,
        cantidad: Number(p.cantidad || 0),
        precio_unitario: Number(p.precio_unitario || 0),
        origen_staff: Boolean(p.origen_staff),
        agregado_por_empleada_id: p.agregado_por_empleada_id || null,
        agregado_por_user_id: p.agregado_por_user_id || null,
        turno_id_origen: p.turno_id_origen || null,
      }))
      const res = await fetch("/api/pagos/grupo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grupo_id: grupoId,
          metodo_pago: metodoPago,
          facturar: facturar && totalCobrar > 0,
          items: turnos.map((t) => ({ turno_id: t.id, monto: Number(precios[t.id] || 0) })),
          aplicar_giftcard: aplicarGiftcardId !== "ninguna",
          giftcard_id: aplicarGiftcardId !== "ninguna" ? aplicarGiftcardId : null,
          aplicar_sena: aplicarSenaId !== "ninguna",
          sena_id: aplicarSenaId !== "ninguna" ? aplicarSenaId : null,
          productos: productosPayload,
          observaciones: observaciones.trim(),
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "No se pudo registrar el pago grupal")
        return
      }

      const shouldOpenFacturaPreview = Boolean(data?.factura_id && !data?.factura_pendiente)

      mutate("/api/caja/movimientos")
      if (clienteId) mutate(`/api/reportes/clientes/${clienteId}`)
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
      alert("No se pudo registrar el pago grupal")
    } finally {
      setFacturando(false)
      setLoading(false)
    }
  }

  if (!grupoId || turnos.length < 2) return null

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <WalletIcon className="h-3.5 w-3.5" />
          Cerrar grupo y cobrar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar servicios simultáneos</DialogTitle>
          <DialogDescription>
            {turnos[0]?.clientes?.nombre} {turnos[0]?.clientes?.apellido} · {turnos.length} servicios
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`grid gap-3 ${giftcards.length ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            <div>
              <p className="text-sm font-medium mb-2">Método de pago</p>
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
            <div>
              <p className="text-sm font-medium mb-2">Tipo de precio</p>
              <Select value={tipoPrecio} onValueChange={(v) => setTipoPrecio(v as "lista" | "descuento")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">Precio lista</SelectItem>
                  <SelectItem value="descuento">Precio descuento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {giftcards.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Giftcard</p>
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
                                .map((id) => serviciosMap.get(id)?.nombre)
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
                {giftcardSeleccionada?.valido_hasta && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Vence: {new Date(giftcardSeleccionada.valido_hasta).toLocaleDateString("es-AR")}
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-2">Seña</p>
              <Select value={aplicarSenaId} onValueChange={setAplicarSenaId} disabled={aplicarGiftcardId !== "ninguna"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">No aplicar seña</SelectItem>
                  {(senas || []).map((s) => {
                    const servicioLabel =
                      s.servicios?.nombre || (s.servicio_id ? serviciosMap.get(s.servicio_id)?.nombre : undefined) || "Servicio"
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        ${Number(s.monto || 0).toFixed(2)} · {servicioLabel}
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

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Servicios del grupo</p>
              <Badge variant="neutral">{turnos.length} servicios</Badge>
            </div>
            <div className="space-y-2">
              {turnos.map((t) => {
                const servicio = serviciosMap.get(t.servicio_final_id || t.servicio_id)
                const staff = empleadasMap.get(t.empleada_final_id || t.empleada_id || "")
                return (
                  <div key={`grupo-servicio-${t.id}`} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/40 p-2 md:grid-cols-[1.2fr_1fr_140px]">
                    <div>
                      <p className="text-sm font-medium">{servicio?.nombre || "Servicio"}</p>
                      <p className="text-xs text-muted-foreground">
                        Staff: {staff?.nombre || "Sin asignar"}
                        {staff?.apellido ? ` ${staff.apellido}` : ""}
                      </p>
                      {t.foto_trabajo_disponible && (
                        <div className="mt-2">
                          <VerTurnoFotoButton turnoId={t.id} />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center">
                      Duración: {t.duracion_minutos} min
                    </div>
                    <div className="flex flex-col">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={precios[t.id] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value === "" ? "" : Number.parseFloat(e.target.value)
                          setPrecios((prev) => ({ ...prev, [t.id]: value }))
                        }}
                        disabled={!isAdmin}
                        aria-label={`Precio para ${servicio?.nombre || "servicio"}`}
                      />
                      {submitAttempted && (precios[t.id] === "" || precios[t.id] == null) && (
                        <p className="text-[11px] text-destructive">Precio requerido</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">Productos</p>
              <div className="relative flex-1 sm:max-w-xs">
                <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Select
                  value=""
                  onValueChange={(value) => {
                    agregarProducto(value)
                    setSearchProducto("")
                  }}
                >
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
                        {p.nombre} - ${Number(p.precio_descuento ?? p.precio_lista ?? 0).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {productosVendidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay productos agregados.</p>
            ) : (
              <div className="space-y-2">
                {productosVendidos.map((p) => {
                  const producto = productos.find((prod) => prod.id === p.producto_id)
                  return (
                    <div key={p.uid} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/40 p-2 sm:grid-cols-[1.2fr_90px_120px_120px_auto]">
                      <div>
                        <p className="text-sm font-medium">{producto?.nombre || "Producto"}</p>
                        <p className="text-xs text-muted-foreground">
                          ${Number(p.precio_unitario || 0).toFixed(2)} c/u
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          min={1}
                          value={p.cantidad}
                          onChange={(e) => {
                            const value = e.target.value === "" ? "" : Number.parseInt(e.target.value)
                            setProductosVendidos((prev) =>
                              prev.map((item) => (item.uid === p.uid ? { ...item, cantidad: value } : item)),
                            )
                          }}
                        />
                        {submitAttempted && (p.cantidad === "" || Number(p.cantidad) <= 0) && (
                          <p className="text-[11px] text-destructive">Cantidad requerida</p>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={p.precio_unitario}
                          onChange={(e) => {
                            const value = e.target.value === "" ? "" : Number.parseFloat(e.target.value)
                            setProductosVendidos((prev) =>
                              prev.map((item) => (item.uid === p.uid ? { ...item, precio_unitario: value } : item)),
                            )
                          }}
                          disabled={!isAdmin}
                        />
                        {submitAttempted && p.precio_unitario === "" && (
                          <p className="text-[11px] text-destructive">Precio requerido</p>
                        )}
                      </div>
                      {grupoStaffIds.length > 1 && (
                        <Select
                          value={p.empleada_id || ""}
                          onValueChange={(value) =>
                            setProductosVendidos((prev) =>
                              prev.map((item) => (item.uid === p.uid ? { ...item, empleada_id: value } : item)),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Staff" />
                          </SelectTrigger>
                          <SelectContent>
                            {grupoStaffIds.map((id) => {
                              const staff = empleadasMap.get(id)
                              return (
                                <SelectItem key={id} value={id}>
                                  {staff?.nombre || "Staff"}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setProductosVendidos((prev) => prev.filter((item) => item.uid !== p.uid))}
                      >
                        <Trash2Icon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Observaciones</p>
            <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span>Servicios</span>
              <strong>${totalServicios.toFixed(2)}</strong>
            </div>
            {totalProductos > 0 && (
              <div className="flex justify-between">
                <span>Productos</span>
                <strong>${totalProductos.toFixed(2)}</strong>
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Registrar pago"
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
