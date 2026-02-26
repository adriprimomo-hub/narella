"use client"

import useSWR from "swr"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { UserBadge } from "../ui/user-badge"
import type { Cliente } from "../clientes/clientes-list"
import { formatDateTime } from "@/lib/date-format"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { FacturandoDialog } from "@/components/facturacion/facturando-dialog"

type ComisionTipo = "porcentaje" | "monto"

type EmpleadaComision = {
  empleada_id: string
  comision_tipo: ComisionTipo
  comision_pct: number | ""
  comision_monto_fijo: number | ""
}

type Empleada = {
  id: string
  nombre: string
}

type Producto = {
  id: string
  nombre: string
  precio_lista: number
  precio_descuento?: number | null
  stock_actual?: number
  stock_minimo?: number
  comision_pct?: number | null
  comision_monto_fijo?: number | null
  empleadas_comision?: Array<{
    empleada_id: string
    comision_pct?: number | null
    comision_monto_fijo?: number | null
  }>
}

const resolveComisionTipo = (pct?: number | null, fijo?: number | null): ComisionTipo => {
  const pctValue = Number(pct ?? 0)
  const fijoValue = Number(fijo ?? 0)
  if (fijoValue > 0 && pctValue <= 0) return "monto"
  return "porcentaje"
}

type Movimiento = {
  id: string
  producto_id: string
  tipo: "compra" | "venta" | "ajuste_positivo" | "ajuste_negativo"
  cantidad: number
  precio_unitario?: number
  costo_unitario?: number
  metodo_pago?: string
  cliente_id?: string | null
  empleada_id?: string | null
  nota?: string | null
  created_at: string
  creado_por?: string | null
  creado_por_username?: string | null
  productos?: { nombre: string }
  clientes?: { nombre: string; apellido: string }
  empleadas?: { nombre: string; apellido?: string | null }
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const PRODUCTOS_PAGE_SIZE = 60
const MOVIMIENTOS_PAGE_SIZE = 80

type PageResponse<T> = {
  items: T[]
  pagination?: {
    page: number
    page_size: number
    has_prev: boolean
    has_next: boolean
  }
}

const parseNumberInput = (value: string) => {
  if (value === "") return ""
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? "" : parsed
}

const toNumber = (value: number | "") => (value === "" ? 0 : value)

export function ProductosPanel() {
  const [productosPage, setProductosPage] = useState(1)
  const [movimientosPage, setMovimientosPage] = useState(1)
  const { data: productosPaginados, mutate: mutateProductosPaginados } = useSWR<PageResponse<Producto>>(
    `/api/productos?page=${productosPage}&page_size=${PRODUCTOS_PAGE_SIZE}`,
    fetcher,
  )
  const { data: movimientosPaginados, mutate: mutateMovimientosPaginados } = useSWR<PageResponse<Movimiento>>(
    `/api/productos/movimientos?page=${movimientosPage}&page_size=${MOVIMIENTOS_PAGE_SIZE}`,
    fetcher,
  )
  const { data: productos, mutate: mutateProductos } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: clientes } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const { data: empleadas } = useSWR<Empleada[]>("/api/empleadas", fetcher)
  const { data: config } = useSWR<{ rol?: string; metodos_pago_config?: { nombre: string }[] }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const metodosPagoList = useMemo(() => {
    if (Array.isArray(config?.metodos_pago_config) && config.metodos_pago_config.length > 0) {
      return config.metodos_pago_config.map((m) => m.nombre).filter(Boolean)
    }
    return ["efectivo", "tarjeta", "transferencia"]
  }, [config])

  const [prod, setProd] = useState({
    nombre: "",
    precio_lista: "" as number | "",
    precio_descuento: "" as number | "",
    stock_actual: "" as number | "",
    stock_minimo: "" as number | "",
    comision_pct: "" as number | "",
    comision_monto_fijo: "" as number | "",
  })
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [comisionTipoBase, setComisionTipoBase] = useState<ComisionTipo>("porcentaje")
  const [empleadasComision, setEmpleadasComision] = useState<EmpleadaComision[]>([])
  const [searchEmpleadaComision, setSearchEmpleadaComision] = useState("")
  const [empleadasHabilitadas, setEmpleadasHabilitadas] = useState<string[]>([])
  const [mov, setMov] = useState({
    producto_id: "",
    tipo: "compra" as Movimiento["tipo"],
    cantidad: "" as number | "",
    precio_unitario: "" as number | "",
    costo_unitario: "" as number | "",
    metodo_pago: "efectivo",
    cliente_id: "",
    empleada_id: "",
    nota: "",
  })
  const [searchProd, setSearchProd] = useState("")
  const [searchMovProd, setSearchMovProd] = useState("")
  const [searchMovList, setSearchMovList] = useState("")
  const [searchCliente, setSearchCliente] = useState("")
  const [searchEmpleadaVenta, setSearchEmpleadaVenta] = useState("")
  const [showNuevo, setShowNuevo] = useState(false)
  const [showMov, setShowMov] = useState(false)
  const [facturar, setFacturar] = useState(false)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [facturando, setFacturando] = useState(false)
  const productosList = Array.isArray(productos) ? productos : []
  const productosTablaList = Array.isArray(productosPaginados?.items) ? productosPaginados.items : []
  const productosPagination = productosPaginados?.pagination || {
    page: productosPage,
    page_size: PRODUCTOS_PAGE_SIZE,
    has_prev: productosPage > 1,
    has_next: false,
  }
  const movimientosList = Array.isArray(movimientosPaginados?.items) ? movimientosPaginados.items : []
  const movimientosPagination = movimientosPaginados?.pagination || {
    page: movimientosPage,
    page_size: MOVIMIENTOS_PAGE_SIZE,
    has_prev: movimientosPage > 1,
    has_next: false,
  }
  const [prodErrors, setProdErrors] = useState<{ nombre?: string; precio_lista?: string; precio_descuento?: string }>({})
  const [movErrors, setMovErrors] = useState<{ producto?: string; cantidad?: string; costo?: string; precio?: string }>({})

  const handleDeleteProducto = async (id: string) => {
    if (!isAdmin) return
    if (!confirm("Eliminar producto?")) return
    const res = await fetch(`/api/productos/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || "No se pudo eliminar el producto.")
      return
    }
    mutateProductosPaginados()
    mutateProductos()
  }

  const resetProductoForm = () => {
    setProd({
      nombre: "",
      precio_lista: "",
      precio_descuento: "",
      stock_actual: "",
      stock_minimo: "",
      comision_pct: "",
      comision_monto_fijo: "",
    })
    setComisionTipoBase("porcentaje")
    setEmpleadasComision([])
    setEmpleadasHabilitadas([])
    setSearchEmpleadaComision("")
    setProdErrors({})
  }

  useEffect(() => {
    if (!selectedProducto) return
    setProd({
      nombre: selectedProducto.nombre || "",
      precio_lista: selectedProducto.precio_lista ?? "",
      precio_descuento: selectedProducto.precio_descuento ?? "",
      stock_actual: selectedProducto.stock_actual ?? "",
      stock_minimo: selectedProducto.stock_minimo ?? "",
      comision_pct: selectedProducto.comision_pct ?? "",
      comision_monto_fijo: selectedProducto.comision_monto_fijo ?? "",
    })
    const baseTipo = resolveComisionTipo(selectedProducto.comision_pct, selectedProducto.comision_monto_fijo)
    setComisionTipoBase(baseTipo)
    const comisiones = Array.isArray(selectedProducto.empleadas_comision) ? selectedProducto.empleadas_comision : []
    setEmpleadasComision(
      comisiones.map((c) => ({
        empleada_id: c.empleada_id,
        comision_tipo: resolveComisionTipo(c.comision_pct ?? null, c.comision_monto_fijo ?? null),
        comision_pct: c.comision_pct ?? "",
        comision_monto_fijo: c.comision_monto_fijo ?? "",
      })),
    )
    setEmpleadasHabilitadas(comisiones.map((c) => c.empleada_id))
    setSearchEmpleadaComision("")
    setProdErrors({})
  }, [selectedProducto])

  useEffect(() => {
    if (!isAdmin && mov.tipo !== "venta") {
      setMov((prev) => ({ ...prev, tipo: "venta" }))
    }
  }, [isAdmin, mov.tipo])

  useEffect(() => {
    if (mov.tipo !== "venta") {
      setFacturar(false)
    }
  }, [mov.tipo])

  useEffect(() => {
    if (!metodosPagoList.length) return
    if (!metodosPagoList.includes(mov.metodo_pago)) {
      setMov((prev) => ({ ...prev, metodo_pago: metodosPagoList[0] }))
    }
  }, [metodosPagoList, mov.metodo_pago])

  const productosFiltrados = useMemo(
    () => productosTablaList.filter((p) => p.nombre.toLowerCase().includes(searchProd.toLowerCase())),
    [productosTablaList, searchProd],
  )

  const movimientosFiltrados = useMemo(
    () =>
      movimientosList.filter((m) =>
        `${m.productos?.nombre || ""} ${m.clientes?.nombre || ""} ${m.clientes?.apellido || ""}`
          .toLowerCase()
          .includes(searchMovList.toLowerCase()),
      ),
    [movimientosList, searchMovList],
  )

  const productosParaMovimiento = useMemo(
    () =>
      searchMovProd
        ? productosList.filter((p) => p.nombre.toLowerCase().includes(searchMovProd.toLowerCase()))
        : [],
    [productosList, searchMovProd],
  )

  const productoSeleccionado = mov.producto_id ? productosList.find((p) => p.id === mov.producto_id) : null
  const clienteSeleccionado = mov.cliente_id ? clientes?.find((c) => c.id === mov.cliente_id) : null

  const sugerirPrecioVenta = (productoId: string) => {
    const producto = productosList.find((p) => p.id === productoId)
    const precio = Number(producto?.precio_descuento ?? producto?.precio_lista ?? 0)
    return Number.isFinite(precio) ? precio : 0
  }

  const buildComisionEntry = (empleadaId: string): EmpleadaComision => ({
    empleada_id: empleadaId,
    comision_tipo: comisionTipoBase,
    comision_pct: prod.comision_pct,
    comision_monto_fijo: prod.comision_monto_fijo,
  })

  const toggleEmpleadaComision = (id: string) => {
    const isSelected = empleadasHabilitadas.includes(id)
    setEmpleadasHabilitadas((prev) => (isSelected ? prev.filter((e) => e !== id) : [...prev, id]))
    if (isSelected) {
      setEmpleadasComision((prev) => prev.filter((c) => c.empleada_id !== id))
    }
  }

  const updateComisionTipo = (empleadaId: string, tipo: ComisionTipo) => {
    setEmpleadasComision((prev) => {
      const exists = prev.find((c) => c.empleada_id === empleadaId)
      if (exists) return prev.map((c) => (c.empleada_id === empleadaId ? { ...c, comision_tipo: tipo } : c))
      return [...prev, { ...buildComisionEntry(empleadaId), comision_tipo: tipo }]
    })
  }

  const updateComisionValor = (empleadaId: string, value: number | "") => {
    setEmpleadasComision((prev) => {
      const exists = prev.find((c) => c.empleada_id === empleadaId)
      const base = exists || buildComisionEntry(empleadaId)
      const next = {
        ...base,
        comision_pct: base.comision_tipo === "porcentaje" ? value : base.comision_pct,
        comision_monto_fijo: base.comision_tipo === "monto" ? value : base.comision_monto_fijo,
      }
      if (exists) return prev.map((c) => (c.empleada_id === empleadaId ? next : c))
      return [...prev, next]
    })
  }

  const empleadasFiltradasComision = searchEmpleadaComision
    ? (empleadas || []).filter((e) => e.nombre.toLowerCase().includes(searchEmpleadaComision.toLowerCase()))
    : []
  const empleadasSeleccionadas = (empleadas || []).filter((e) => empleadasHabilitadas.includes(e.id))

  const guardarProducto = async () => {
    const nextErrors: { nombre?: string; precio_lista?: string; precio_descuento?: string } = {}
    if (!prod.nombre.trim()) nextErrors.nombre = "Ingresa el nombre del producto."
    if (prod.precio_lista === "" || Number(prod.precio_lista) <= 0) {
      nextErrors.precio_lista = "Ingresa un precio de lista válido."
    }
    if (prod.precio_descuento !== "" && Number(prod.precio_descuento) < 0) {
      nextErrors.precio_descuento = "Ingresa un precio descuento válido."
    }
    if (Object.keys(nextErrors).length > 0) {
      setProdErrors(nextErrors)
      return
    }
    setProdErrors({})
    const comisionBase =
      comisionTipoBase === "porcentaje"
        ? { comision_pct: toNumber(prod.comision_pct), comision_monto_fijo: null }
        : { comision_pct: null, comision_monto_fijo: toNumber(prod.comision_monto_fijo) }
    const comisionesPayload = empleadasComision
      .filter((c) => c.empleada_id)
      .map((c) => ({
        empleada_id: c.empleada_id,
        comision_pct: c.comision_tipo === "porcentaje" ? toNumber(c.comision_pct) : null,
        comision_monto_fijo: c.comision_tipo === "monto" ? toNumber(c.comision_monto_fijo) : null,
      }))
    const isEditing = Boolean(selectedProducto)
    const res = await fetch(isEditing ? `/api/productos/${selectedProducto?.id}` : "/api/productos", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: prod.nombre,
        precio_lista: toNumber(prod.precio_lista),
        precio_descuento: prod.precio_descuento === "" ? null : toNumber(prod.precio_descuento),
        stock_actual: toNumber(prod.stock_actual),
        stock_minimo: toNumber(prod.stock_minimo),
        ...comisionBase,
        empleadas_comision: comisionesPayload,
      }),
    })
    if (!res.ok) return
    resetProductoForm()
    setSelectedProducto(null)
    setShowNuevo(false)
    setProductosPage(1)
    mutateProductosPaginados()
    mutateProductos()
  }

  const registrarMovimiento = async () => {
    const nextErrors: { producto?: string; cantidad?: string; costo?: string; precio?: string } = {}
    if (!mov.producto_id) nextErrors.producto = "Selecciona un producto."
    if (!mov.cantidad || Number(mov.cantidad) <= 0) nextErrors.cantidad = "Ingresa una cantidad válida."
    if (mov.tipo === "compra" && (mov.costo_unitario === "" || Number(mov.costo_unitario) <= 0)) {
      nextErrors.costo = "Ingresa el costo unitario."
    }
    if (mov.tipo === "venta" && (mov.precio_unitario === "" || Number(mov.precio_unitario) <= 0)) {
      nextErrors.precio = "Ingresa el precio unitario."
    }
    if (Object.keys(nextErrors).length > 0) {
      setMovErrors(nextErrors)
      return
    }
    setMovErrors({})
    const shouldShowFacturando = mov.tipo === "venta" && facturar
    if (shouldShowFacturando) setFacturando(true)
    try {
      const res = await fetch("/api/productos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mov,
          cantidad: toNumber(mov.cantidad),
          precio_unitario: toNumber(mov.precio_unitario),
          costo_unitario: toNumber(mov.costo_unitario),
          facturar,
        }),
      })
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (data?.factura_pendiente) {
        const detalle = data?.factura_error ? `\nDetalle: ${data.factura_error}` : ""
        alert(`Movimiento registrado. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
      } else if (data?.factura_error) {
        alert(`Movimiento registrado. No se pudo facturar: ${data.factura_error}`)
      }
      if (data?.factura_id && !data?.factura_pendiente) {
        setFacturaInfo(data?.factura || null)
        setFacturaId(data?.factura_id || null)
        setFacturaOpen(true)
      }
      setMov({
        producto_id: "",
        tipo: "compra",
        cantidad: "",
        precio_unitario: "",
        costo_unitario: "",
        metodo_pago: metodosPagoList[0] || "efectivo",
        cliente_id: "",
        empleada_id: "",
        nota: "",
      })
      setSearchMovProd("")
      setSearchCliente("")
      setSearchEmpleadaVenta("")
      setFacturar(false)
      setShowMov(false)
      setMovimientosPage(1)
      mutateMovimientosPaginados()
      mutateProductosPaginados()
      mutateProductos()
    } finally {
      setFacturando(false)
    }
  }

  const seleccionarProducto = (productoId: string) => {
    setMov((prev) => ({
      ...prev,
      producto_id: productoId,
      precio_unitario: prev.tipo === "venta" ? sugerirPrecioVenta(productoId) : prev.precio_unitario,
    }))
    if (movErrors.producto) {
      setMovErrors((prev) => ({ ...prev, producto: undefined }))
    }
  }

  const handleTipoChange = (nuevoTipo: Movimiento["tipo"]) => {
    if (!isAdmin) return
    setMov((prev) => ({
      ...prev,
      tipo: nuevoTipo,
      precio_unitario:
        nuevoTipo === "venta" && prev.producto_id && prev.precio_unitario === ""
          ? sugerirPrecioVenta(prev.producto_id)
          : prev.precio_unitario,
    }))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {isAdmin && (
          <div className="flex justify-between items-center">
            <Button
              className="gap-2"
              variant="primary"
              onClick={() => {
                setSelectedProducto(null)
                resetProductoForm()
                setShowNuevo(true)
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Nuevo producto
            </Button>
          </div>
        )}

        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar producto..."
            value={searchProd}
            onChange={(e) => {
              setSearchProd(e.target.value)
              setProductosPage(1)
            }}
          />
        </div>

        <Card>
          <CardContent className="p-0 pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Precio lista</TableHead>
                    <TableHead className="text-right">Precio descuento</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Minimo</TableHead>
                    {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 6 : 5} className="text-sm text-muted-foreground">
                        Sin productos para esta página.
                      </TableCell>
                    </TableRow>
                  ) : (
                    productosFiltrados.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell className="text-right">${Number(p.precio_lista || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {p.precio_descuento == null ? "-" : `$${Number(p.precio_descuento).toFixed(2)}`}
                        </TableCell>
                        <TableCell className="text-right">{p.stock_actual ?? 0}</TableCell>
                        <TableCell className="text-right">{p.stock_minimo ?? 0}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedProducto(p)
                                  setShowNuevo(true)
                                }}
                                className="gap-1.5"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteProducto(p.id)}
                                className="gap-1.5"
                              >
                                <Trash2Icon className="h-3.5 w-3.5" />
                                Eliminar
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Página {productosPagination.page}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!productosPagination.has_prev}
                  onClick={() => setProductosPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!productosPagination.has_next}
                  onClick={() => setProductosPage((prev) => prev + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showNuevo && isAdmin}
        onOpenChange={(open) => {
          if (!open) {
            setShowNuevo(false)
            setSelectedProducto(null)
            resetProductoForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProducto ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {selectedProducto ? "editar" : "crear"} un producto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Nombre del producto</p>
              <Input
                value={prod.nombre}
                onChange={(e) => {
                  setProd({ ...prod, nombre: e.target.value })
                  if (prodErrors.nombre) setProdErrors((prev) => ({ ...prev, nombre: undefined }))
                }}
              />
              {prodErrors.nombre && <p className="text-xs text-destructive">{prodErrors.nombre}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Precio de lista</p>
                <Input
                  type="number"
                  value={prod.precio_lista}
                  onChange={(e) => {
                    setProd({ ...prod, precio_lista: parseNumberInput(e.target.value) })
                    if (prodErrors.precio_lista) setProdErrors((prev) => ({ ...prev, precio_lista: undefined }))
                  }}
                />
                {prodErrors.precio_lista && <p className="text-xs text-destructive">{prodErrors.precio_lista}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Precio descuento (opcional)</p>
                <Input
                  type="number"
                  value={prod.precio_descuento}
                  onChange={(e) => {
                    setProd({ ...prod, precio_descuento: parseNumberInput(e.target.value) })
                    if (prodErrors.precio_descuento) {
                      setProdErrors((prev) => ({ ...prev, precio_descuento: undefined }))
                    }
                  }}
                />
                {prodErrors.precio_descuento && (
                  <p className="text-xs text-destructive">{prodErrors.precio_descuento}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Stock inicial</p>
                <Input
                  type="number"
                  value={prod.stock_actual}
                  onChange={(e) => setProd({ ...prod, stock_actual: parseNumberInput(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Stock minimo</p>
                <Input
                  type="number"
                  value={prod.stock_minimo}
                  onChange={(e) => setProd({ ...prod, stock_minimo: parseNumberInput(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Comisión base</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr]">
                <Select value={comisionTipoBase} onValueChange={(v) => setComisionTipoBase(v as ComisionTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">Porcentaje</SelectItem>
                    <SelectItem value="monto">Monto fijo</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  value={comisionTipoBase === "porcentaje" ? prod.comision_pct : prod.comision_monto_fijo}
                  onChange={(e) => {
                    const value = parseNumberInput(e.target.value)
                    if (comisionTipoBase === "porcentaje") {
                      setProd({ ...prod, comision_pct: value })
                    } else {
                      setProd({ ...prod, comision_monto_fijo: value })
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Comisiones por empleada (opcional)</p>
                  <div className="relative w-48">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar empleada..."
                      value={searchEmpleadaComision}
                      onChange={(e) => setSearchEmpleadaComision(e.target.value)}
                    />
                  </div>
                </div>

                {searchEmpleadaComision && (
                  <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                    {empleadasFiltradasComision.length ? (
                      empleadasFiltradasComision.map((e) => (
                        <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                          <span>{e.nombre}</span>
                          <Button
                            type="button"
                            variant={empleadasHabilitadas.includes(e.id) ? "secondary" : "default"}
                            size="sm"
                            onClick={() => toggleEmpleadaComision(e.id)}
                          >
                            {empleadasHabilitadas.includes(e.id) ? "Quitar" : "Agregar"}
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin resultados.</p>
                    )}
                  </div>
                )}

                {empleadasSeleccionadas.length > 0 && (
                  <div className="space-y-2">
                    {empleadasSeleccionadas.map((e) => {
                      const commission = empleadasComision.find((c) => c.empleada_id === e.id) || buildComisionEntry(e.id)
                      const currentTipo = commission.comision_tipo
                      const currentValue = currentTipo === "porcentaje" ? commission.comision_pct : commission.comision_monto_fijo
                      return (
                        <div key={e.id} className="rounded-lg border p-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{e.nombre}</p>
                            <Button type="button" variant="ghost" size="sm" onClick={() => toggleEmpleadaComision(e.id)}>
                              Quitar
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-[140px_1fr]">
                            <Select value={currentTipo} onValueChange={(v) => updateComisionTipo(e.id, v as ComisionTipo)}>
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="porcentaje">Porcentaje</SelectItem>
                                <SelectItem value="monto">Monto fijo</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8"
                              value={currentValue}
                              onChange={(ev) => updateComisionValor(e.id, parseNumberInput(ev.target.value))}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <Button className="w-full gap-2" variant="primary" onClick={guardarProducto}>
              <PlusIcon className="h-4 w-4" />
              {selectedProducto ? "Actualizar producto" : "Crear producto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Button className="gap-2" variant="primary" onClick={() => setShowMov(true)}>
            <PlusIcon className="h-4 w-4" />
            Nuevo movimiento
          </Button>
        </div>

        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar movimiento..."
            value={searchMovList}
            onChange={(e) => {
              setSearchMovList(e.target.value)
              setMovimientosPage(1)
            }}
          />
        </div>

        <Card>
          <CardContent className="p-0 pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead className="text-right">Precio/Costo</TableHead>
                    <TableHead>Vendido por</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        Sin movimientos para esta página.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimientosFiltrados.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">
                          {formatDateTime(m.created_at)}
                        </TableCell>
                        <TableCell>{m.productos?.nombre || "-"}</TableCell>
                        <TableCell className="capitalize text-xs">{m.tipo.replace("_", " ")}</TableCell>
                        <TableCell className="text-right">{m.cantidad}</TableCell>
                        <TableCell>{m.clientes ? `${m.clientes.nombre} ${m.clientes.apellido}` : "-"}</TableCell>
                        <TableCell className="capitalize">{m.metodo_pago || "-"}</TableCell>
                        <TableCell className="text-right">
                          {m.tipo === "compra"
                            ? `$${(m.costo_unitario || 0).toFixed(2)}`
                            : `$${(m.precio_unitario || 0).toFixed(2)}`}
                        </TableCell>
                        <TableCell>
                          {m.tipo === "venta" ? (
                            m.empleadas ? (
                              `${m.empleadas.nombre} ${m.empleadas.apellido || ""}`.trim()
                            ) : (
                              <UserBadge username={m.creado_por_username} userId={m.creado_por} />
                            )
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <UserBadge username={m.creado_por_username} userId={m.creado_por} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Página {movimientosPagination.page}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!movimientosPagination.has_prev}
                  onClick={() => setMovimientosPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!movimientosPagination.has_next}
                  onClick={() => setMovimientosPage((prev) => prev + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showMov} onOpenChange={(open) => !open && setShowMov(false)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
            <DialogDescription className="sr-only">Registrar un movimiento de producto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Producto</p>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar producto y seleccionar..."
                  value={searchMovProd}
                  onChange={(e) => setSearchMovProd(e.target.value)}
                />
              </div>
              {movErrors.producto && <p className="text-xs text-destructive">{movErrors.producto}</p>}
              {productoSeleccionado && (
                <p className="text-xs text-muted-foreground">
                  Seleccionado: <span className="font-medium text-foreground">{productoSeleccionado.nombre}</span>
                </p>
              )}
              {searchMovProd && (
                <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                  {productosParaMovimiento.length ? (
                    productosParaMovimiento.map((p) => (
                      <Button
                        key={p.id}
                        type="button"
                        variant={mov.producto_id === p.id ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => seleccionarProducto(p.id)}
                      >
                        {p.nombre}
                      </Button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Tipo de movimiento</p>
              <Select
                value={mov.tipo}
                onValueChange={(value) => handleTipoChange(value as Movimiento["tipo"])}
                disabled={!isAdmin}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="compra">Compra</SelectItem>}
                  <SelectItem value="venta">Venta</SelectItem>
                  {isAdmin && <SelectItem value="ajuste_positivo">Ajuste positivo</SelectItem>}
                  {isAdmin && <SelectItem value="ajuste_negativo">Ajuste negativo</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Cantidad</p>
                <Input
                  type="number"
                  placeholder="Unidades"
                  value={mov.cantidad}
                  onChange={(e) => {
                    setMov({ ...mov, cantidad: parseNumberInput(e.target.value) })
                    if (movErrors.cantidad) setMovErrors((prev) => ({ ...prev, cantidad: undefined }))
                  }}
                />
                {movErrors.cantidad && <p className="text-xs text-destructive">{movErrors.cantidad}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{mov.tipo === "compra" ? "Costo unitario" : "Precio unitario"}</p>
                <Input
                  type="number"
                  placeholder={mov.tipo === "compra" ? "Costo por unidad" : "Precio cobrado"}
                  value={mov.tipo === "compra" ? mov.costo_unitario : mov.precio_unitario}
                  onChange={(e) => {
                    if (mov.tipo === "compra") {
                      setMov({ ...mov, costo_unitario: parseNumberInput(e.target.value) })
                      if (movErrors.costo) setMovErrors((prev) => ({ ...prev, costo: undefined }))
                    } else {
                      setMov({ ...mov, precio_unitario: parseNumberInput(e.target.value) })
                      if (movErrors.precio) setMovErrors((prev) => ({ ...prev, precio: undefined }))
                    }
                  }}
                  disabled={!isAdmin}
                />
                {mov.tipo === "compra" && movErrors.costo && (
                  <p className="text-xs text-destructive">{movErrors.costo}</p>
                )}
                {mov.tipo === "venta" && movErrors.precio && (
                  <p className="text-xs text-destructive">{movErrors.precio}</p>
                )}
              </div>
            </div>

            {mov.tipo === "venta" && (
              <div className="space-y-3 rounded-md border bg-card p-3 shadow-sm">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Cliente (opcional)</p>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar cliente..."
                      value={searchCliente}
                      onChange={(e) => setSearchCliente(e.target.value)}
                    />
                  </div>
                  {clienteSeleccionado && (
                    <p className="text-xs text-muted-foreground">
                      Seleccionado: {clienteSeleccionado.nombre} {clienteSeleccionado.apellido}
                    </p>
                  )}
                  {searchCliente && (
                    <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                      {(clientes || [])
                        .filter((c) => `${c.nombre} ${c.apellido}`.toLowerCase().includes(searchCliente.toLowerCase()))
                        .map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            variant={mov.cliente_id === c.id ? "secondary" : "ghost"}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => setMov((p) => ({ ...p, cliente_id: c.id }))}
                          >
                            {c.nombre} {c.apellido}
                          </Button>
                        ))}
                      {(clientes || []).filter((c) =>
                        `${c.nombre} ${c.apellido}`.toLowerCase().includes(searchCliente.toLowerCase()),
                      ).length === 0 && (
                        <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Método de pago</p>
                  <Select value={mov.metodo_pago} onValueChange={(value) => setMov({ ...mov, metodo_pago: value })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona medio de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {metodosPagoList.map((metodo) => (
                        <SelectItem key={metodo} value={metodo}>
                          {metodo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Vendido por (para comisión)</p>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar empleada..."
                      value={searchEmpleadaVenta}
                      onChange={(e) => setSearchEmpleadaVenta(e.target.value)}
                    />
                  </div>
                  {mov.empleada_id && (
                    <p className="text-xs text-muted-foreground">
                      Seleccionada: <span className="font-medium text-foreground">{(empleadas || []).find((e) => e.id === mov.empleada_id)?.nombre}</span>
                    </p>
                  )}
                  {searchEmpleadaVenta && (
                    <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                      {(empleadas || [])
                        .filter((e) => e.nombre.toLowerCase().includes(searchEmpleadaVenta.toLowerCase()))
                        .map((e) => (
                          <Button
                            key={e.id}
                            type="button"
                            variant={mov.empleada_id === e.id ? "secondary" : "ghost"}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => setMov((p) => ({ ...p, empleada_id: e.id }))}
                          >
                            {e.nombre}
                          </Button>
                        ))}
                      {(empleadas || []).filter((e) => e.nombre.toLowerCase().includes(searchEmpleadaVenta.toLowerCase())).length === 0 && (
                        <p className="text-xs text-muted-foreground">Sin coincidencias</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">¿Facturar esta venta?</p>
                  </div>
                  <Switch checked={facturar} onCheckedChange={setFacturar} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">Nota (opcional)</p>
              <Input
                placeholder="Detalle del movimiento"
                value={mov.nota}
                onChange={(e) => setMov({ ...mov, nota: e.target.value })}
              />
            </div>

            <Button className="w-full gap-2" variant="primary" onClick={registrarMovimiento}>
              <PlusIcon className="h-4 w-4" />
              Registrar movimiento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}

