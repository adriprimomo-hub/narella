"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ClockIcon, ImagePlusIcon, Loader2Icon, SaveIcon, SearchIcon, Trash2Icon } from "lucide-react"
import type { Turno as BaseTurno } from "@/components/turnos/turnos-grid"
import type { Servicio } from "@/components/servicios/servicios-list"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"
import { showSystemConfirm } from "@/lib/system-dialogs"

type Producto = {
  id: string
  nombre: string
  precio_lista: number
  precio_descuento?: number | null
  stock_actual: number
}

type StaffTurno = Omit<BaseTurno, "clientes" | "empleadas" | "empleada_final"> & {
  clientes?: BaseTurno["clientes"]
  empleadas?: BaseTurno["empleadas"]
  empleada_final?: BaseTurno["empleada_final"]
}

type StaffAgendaOffer = {
  id: string
  fecha_inicio: string
  fecha_fin: string
  etiqueta: string
}

type StaffAgendaResponse = {
  turnos: StaffTurno[]
  sugerencias: StaffAgendaOffer[]
}

type ServicioAgregado = { uid: string; servicio_id: string; cantidad: number | ""; precio_unitario: number }
type ProductoAgregado = {
  uid: string
  producto_id: string
  cantidad: number | ""
  precio_unitario: number
  origen_staff?: boolean
  agregado_por_empleada_id?: string | null
  agregado_por_user_id?: string | null
  turno_id_origen?: string | null
}

type AgendaItem =
  | { tipo: "turno"; id: string; orden: number; turno: StaffTurno }
  | { tipo: "ofrecido"; id: string; orden: number; sugerencia: StaffAgendaOffer }

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" })
  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(payload?.error || "No se pudo cargar la agenda de staff.")
  }

  return payload as T
}

const createLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const MAX_TURNO_FOTO_BYTES = 5 * 1024 * 1024

const formatHour = (value?: string | null) => {
  const date = new Date(String(value || ""))
  if (!Number.isFinite(date.getTime())) return "--:--"
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

const formatHourRange = (start?: string | null, end?: string | null) => {
  const startLabel = formatHour(start)
  const endLabel = formatHour(end)
  if (startLabel === "--:--") return endLabel
  if (endLabel === "--:--") return startLabel
  return `${startLabel} - ${endLabel}`
}

const getEstadoMeta = (estado?: string | null) => {
  switch (estado) {
    case "en_curso":
      return {
        label: "En curso",
        variant: "info" as const,
        description: "Lo tenes en marcha ahora.",
      }
    case "completado":
      return {
        label: "Listo",
        variant: "success" as const,
        description: "Ya quedo cerrado.",
      }
    case "pendiente":
      return {
        label: "Pendiente",
        variant: "neutral" as const,
        description: "Lo tenes agendado para hoy.",
      }
    default:
      return {
        label: "Hoy",
        variant: "outline" as const,
        description: "Forma parte de tu dia de hoy.",
      }
  }
}

export function StaffTurnosPanel() {
  const {
    data: agenda,
    error: agendaError,
    isLoading: agendaLoading,
    mutate,
  } = useSWR<StaffAgendaResponse>("/api/staff/agenda", fetcher)
  const { data: servicios = [] } = useSWR<Servicio[]>("/api/servicios", fetcher)
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)

  const turnos = agenda?.turnos || []
  const sugerencias = agenda?.sugerencias || []

  const [editingTurnoId, setEditingTurnoId] = useState<string | null>(null)
  const [servicioFinalId, setServicioFinalId] = useState<string>("")
  const [serviciosAgregados, setServiciosAgregados] = useState<ServicioAgregado[]>([])
  const [productosAgregados, setProductosAgregados] = useState<ProductoAgregado[]>([])
  const [searchServicio, setSearchServicio] = useState("")
  const [searchProducto, setSearchProducto] = useState("")
  const [saving, setSaving] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [uploadingFotoTurnoId, setUploadingFotoTurnoId] = useState<string | null>(null)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const fotoInputRef = useRef<HTMLInputElement | null>(null)

  const agendaItems = useMemo<AgendaItem[]>(() => {
    const turnoItems = turnos.map((turno) => ({
      tipo: "turno" as const,
      id: turno.id,
      orden: new Date(turno.fecha_inicio).getTime(),
      turno,
    }))
    const sugerenciaItems = sugerencias.map((sugerencia) => ({
      tipo: "ofrecido" as const,
      id: sugerencia.id,
      orden: new Date(sugerencia.fecha_inicio).getTime(),
      sugerencia,
    }))

    return [...turnoItems, ...sugerenciaItems].sort((left, right) => {
      const first = Number.isFinite(left.orden) ? left.orden : Number.MAX_SAFE_INTEGER
      const second = Number.isFinite(right.orden) ? right.orden : Number.MAX_SAFE_INTEGER
      return first - second
    })
  }, [sugerencias, turnos])

  const startEditing = (turno: StaffTurno) => {
    setEditingTurnoId(turno.id)
    setServicioFinalId(turno.servicio_final_id || turno.servicio_id)
    setServiciosAgregados((turno.servicios_agregados || []).map((item) => ({ ...item, uid: createLocalId() })))
    setProductosAgregados(
      (turno.productos_agregados || []).map((producto) => ({
        uid: createLocalId(),
        ...producto,
        origen_staff: Boolean(producto.origen_staff === true && producto.agregado_por_empleada_id),
        agregado_por_empleada_id: producto.agregado_por_empleada_id ?? null,
        agregado_por_user_id: producto.agregado_por_user_id ?? null,
        turno_id_origen: producto.turno_id_origen ?? turno.id,
      })),
    )
    setSubmitAttempted(false)
    setFotoError(null)
  }

  const cancelEditing = () => {
    setEditingTurnoId(null)
    setServicioFinalId("")
    setServiciosAgregados([])
    setProductosAgregados([])
    setSearchServicio("")
    setSearchProducto("")
    setSubmitAttempted(false)
    setFotoError(null)
  }

  const agregarServicio = (servicioId: string) => {
    const servicio = servicios.find((item) => item.id === servicioId)
    if (!servicio) return
    const precioUnitario = (servicio as any).precio_lista ?? (servicio as any).precio ?? 0

    setServiciosAgregados((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        servicio_id: servicioId,
        cantidad: "",
        precio_unitario: Number(precioUnitario) || 0,
      },
    ])
    setSearchServicio("")
  }

  const agregarProducto = (productoId: string) => {
    const producto = productos.find((item) => item.id === productoId)
    if (!producto) return
    const precioBase = Number(producto.precio_descuento ?? producto.precio_lista ?? 0)

    setProductosAgregados((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        producto_id: productoId,
        cantidad: "",
        precio_unitario: precioBase,
        origen_staff: true,
        turno_id_origen: editingTurnoId || null,
      },
    ])
    setSearchProducto("")
  }

  const serviciosFiltrados = useMemo(() => {
    const term = searchServicio.toLowerCase()
    return servicios.filter((servicio) => servicio.nombre.toLowerCase().includes(term))
  }, [searchServicio, servicios])

  const productosFiltrados = useMemo(() => {
    const term = searchProducto.toLowerCase()
    return productos.filter((producto) => producto.nombre.toLowerCase().includes(term) && producto.stock_actual > 0)
  }, [productos, searchProducto])

  const cantidadesInvalidas =
    serviciosAgregados.some((item) => item.cantidad === "" || Number(item.cantidad) <= 0) ||
    productosAgregados.some((item) => item.cantidad === "" || Number(item.cantidad) <= 0)

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"))
      reader.readAsDataURL(file)
    })

  const handleUploadFoto = async (turnoId: string, file: File | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setFotoError("Selecciona una imagen valida (JPG, PNG o WEBP).")
      return
    }
    if (file.size > MAX_TURNO_FOTO_BYTES) {
      setFotoError("La foto supera el tamano maximo permitido (5 MB).")
      return
    }

    setFotoError(null)
    setUploadingFotoTurnoId(turnoId)

    try {
      const imageDataUrl = await fileToDataUrl(file)
      const res = await fetch(`/api/turnos/${turnoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_trabajo_base64: imageDataUrl }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFotoError(data?.error || "No se pudo subir la foto del trabajo.")
        return
      }
      await mutate()
    } catch {
      setFotoError("No se pudo procesar la imagen seleccionada.")
    } finally {
      setUploadingFotoTurnoId((current) => (current === turnoId ? null : current))
    }
  }

  const handleRemoveFoto = async (turnoId: string) => {
    if (!(await showSystemConfirm("Quitar la foto del trabajo cargada?"))) return
    setFotoError(null)
    setUploadingFotoTurnoId(turnoId)

    try {
      const res = await fetch(`/api/turnos/${turnoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_trabajo_base64: null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFotoError(data?.error || "No se pudo quitar la foto del trabajo.")
        return
      }
      await mutate()
    } catch {
      setFotoError("No se pudo quitar la foto del trabajo.")
    } finally {
      setUploadingFotoTurnoId((current) => (current === turnoId ? null : current))
    }
  }

  const handleSave = async () => {
    if (!editingTurnoId) return
    setSubmitAttempted(true)
    if (cantidadesInvalidas) return

    setSaving(true)

    try {
      const res = await fetch(`/api/turnos/${editingTurnoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio_final_id: servicioFinalId,
          servicios_agregados: serviciosAgregados.map(({ uid, ...servicio }) => ({
            ...servicio,
            cantidad: Number(servicio.cantidad || 0),
          })),
          productos_agregados: productosAgregados.map(({ uid, ...producto }) => ({
            ...producto,
            cantidad: Number(producto.cantidad || 0),
            origen_staff: Boolean(producto.origen_staff && producto.agregado_por_empleada_id),
            agregado_por_empleada_id: producto.agregado_por_empleada_id ?? null,
            agregado_por_user_id: producto.agregado_por_user_id ?? null,
            turno_id_origen: producto.turno_id_origen ?? editingTurnoId,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || "No se pudo guardar")
        return
      }

      await mutate()
      cancelEditing()
    } finally {
      setSaving(false)
    }
  }

  if (agendaLoading && !agenda) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium">Cargando tu dia...</p>
        </CardContent>
      </Card>
    )
  }

  if (agendaError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium">No pudimos cargar lo de hoy</p>
          <p className="mt-2 text-sm text-muted-foreground">Prueba de nuevo en un momento.</p>
        </CardContent>
      </Card>
    )
  }

  if (agendaItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium">Hoy no tenes nada cargado</p>
          <p className="mt-2 text-sm text-muted-foreground">Si entra algo para hoy, lo vas a ver aca.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Tu dia de hoy</p>
        <p className="text-sm text-muted-foreground">
          Solo ves lo de hoy. Si queda aire en tu horario, te marcamos un par para ofrecer.
        </p>
      </div>

      {agendaItems.map((item) => {
        if (item.tipo === "ofrecido") {
          return (
            <Card key={item.id} className="border-dashed">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{item.sugerencia.etiqueta}</CardTitle>
                    <CardDescription>Te queda libre dentro de tu horario de hoy.</CardDescription>
                  </div>
                  <Badge variant="outline">{formatHourRange(item.sugerencia.fecha_inicio, item.sugerencia.fecha_fin)}</Badge>
                </div>
              </CardHeader>
            </Card>
          )
        }

        const turno = item.turno
        const isEditing = editingTurnoId === turno.id
        const estadoMeta = getEstadoMeta(turno.estado)
        const servicioVisible = servicios.find(
          (servicio) => servicio.id === (isEditing ? servicioFinalId : turno.servicio_final_id || turno.servicio_id),
        )
        const servicioNombre =
          servicioVisible?.nombre || turno.servicio_final?.nombre || turno.servicios?.nombre || "Servicio"

        return (
          <Card key={turno.id}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>{servicioNombre}</CardTitle>
                  <CardDescription>{estadoMeta.description}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{formatHourRange(turno.fecha_inicio, turno.fecha_fin)}</Badge>
                  <Badge variant={estadoMeta.variant}>{estadoMeta.label}</Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {!isEditing ? (
                <div className="space-y-2">
                  {turno.estado === "en_curso" ? (
                    <>
                      <p className="text-sm text-muted-foreground">Abre el turno si necesitas cargar cambios.</p>
                      <Button onClick={() => startEditing(turno)} className="mt-2">
                        Abrir turno
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {turno.estado === "completado"
                        ? "Ya quedo cerrado y se mantiene solo por hoy."
                        : "Lo veras aqui hasta que cambie el estado o termine el dia."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Servicio realizado</p>
                    <Select value={servicioFinalId} onValueChange={setServicioFinalId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar servicio" />
                      </SelectTrigger>
                      <SelectContent>
                        {servicios.map((servicio) => (
                          <SelectItem key={servicio.id} value={servicio.id}>
                            {servicio.nombre} - ${Number(((servicio as any).precio_lista ?? (servicio as any).precio ?? 0)).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium">Servicios agregados</p>
                      <div className="relative flex-1 sm:max-w-xs">
                        <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Select value="" onValueChange={agregarServicio}>
                          <SelectTrigger className="pl-8">
                            <SelectValue placeholder="Agregar servicio" />
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
                            {serviciosFiltrados.map((servicio) => (
                              <SelectItem key={servicio.id} value={servicio.id}>
                                {servicio.nombre} - ${Number(((servicio as any).precio_lista ?? (servicio as any).precio ?? 0)).toFixed(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {serviciosAgregados.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin servicios agregados.</p>
                    ) : (
                      <div className="space-y-2">
                        {serviciosAgregados.map((servicio) => {
                          const detalle = servicios.find((item) => item.id === servicio.servicio_id)
                          return (
                            <div key={servicio.uid} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline">{detalle?.nombre || "Servicio"}</Badge>
                              <div className="flex flex-col">
                                <Input
                                  type="number"
                                  min={1}
                                  value={servicio.cantidad}
                                  className="w-16"
                                  onChange={(e) =>
                                    setServiciosAgregados((prev) =>
                                      prev.map((item) =>
                                        item.uid === servicio.uid
                                          ? {
                                              ...item,
                                              cantidad: e.target.value === "" ? "" : Number.parseInt(e.target.value, 10),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                {submitAttempted && (servicio.cantidad === "" || Number(servicio.cantidad) <= 0) && (
                                  <span className="text-[11px] text-destructive">Cantidad requerida</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ${(servicio.precio_unitario * Number(servicio.cantidad || 0)).toFixed(2)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  setServiciosAgregados((prev) => prev.filter((item) => item.uid !== servicio.uid))
                                }
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
                      <p className="text-sm font-medium">Productos vendidos</p>
                      <div className="relative flex-1 sm:max-w-xs">
                        <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Select value="" onValueChange={agregarProducto}>
                          <SelectTrigger className="pl-8">
                            <SelectValue placeholder="Agregar producto" />
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
                            {productosFiltrados.map((producto) => (
                              <SelectItem key={producto.id} value={producto.id}>
                                {producto.nombre} - ${Number(producto.precio_descuento ?? producto.precio_lista ?? 0)} (Stock: {producto.stock_actual})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {productosAgregados.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin productos.</p>
                    ) : (
                      <div className="space-y-2">
                        {productosAgregados.map((producto) => {
                          const detalle = productos.find((item) => item.id === producto.producto_id)
                          return (
                            <div key={producto.uid} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline">{detalle?.nombre || "Producto"}</Badge>
                              <div className="flex flex-col">
                                <Input
                                  type="number"
                                  min={1}
                                  max={detalle?.stock_actual || 999}
                                  value={producto.cantidad}
                                  className="w-16"
                                  onChange={(e) =>
                                    setProductosAgregados((prev) =>
                                      prev.map((item) =>
                                        item.uid === producto.uid
                                          ? {
                                              ...item,
                                              cantidad: e.target.value === "" ? "" : Number.parseInt(e.target.value, 10),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                {submitAttempted && (producto.cantidad === "" || Number(producto.cantidad) <= 0) && (
                                  <span className="text-[11px] text-destructive">Cantidad requerida</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ${(producto.precio_unitario * Number(producto.cantidad || 0)).toFixed(2)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  setProductosAgregados((prev) => prev.filter((item) => item.uid !== producto.uid))
                                }
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
                      <div>
                        <p className="text-sm font-medium">Foto del trabajo</p>
                        <p className="text-xs text-muted-foreground">Solo 1 foto. Tamano maximo: 5 MB.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={fotoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null
                            void handleUploadFoto(turno.id, file)
                            e.currentTarget.value = ""
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2"
                          onClick={() => fotoInputRef.current?.click()}
                          disabled={uploadingFotoTurnoId === turno.id || saving}
                        >
                          {uploadingFotoTurnoId === turno.id ? (
                            <>
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                              Subiendo...
                            </>
                          ) : (
                            <>
                              <ImagePlusIcon className="h-4 w-4" />
                              Subir foto del trabajo
                            </>
                          )}
                        </Button>
                        {turno.foto_trabajo_disponible && (
                          <>
                            <VerTurnoFotoButton turnoId={turno.id} />
                            <Button
                              type="button"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleRemoveFoto(turno.id)}
                              disabled={uploadingFotoTurnoId === turno.id || saving}
                            >
                              <Trash2Icon className="h-4 w-4" />
                              Quitar foto
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {fotoError && <p className="text-xs text-destructive">{fotoError}</p>}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEditing} disabled={saving} className="flex-1">
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                      {saving ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <SaveIcon className="h-4 w-4" />
                          Guardar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
