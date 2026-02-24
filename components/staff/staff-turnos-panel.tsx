"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ClockIcon, ImagePlusIcon, Loader2Icon, SaveIcon, SearchIcon, Trash2Icon } from "lucide-react"
import type { Turno } from "@/components/turnos/turnos-grid"
import type { Servicio } from "@/components/servicios/servicios-list"
import { VerTurnoFotoButton } from "@/components/turnos/ver-turno-foto-button"

type Producto = {
  id: string
  nombre: string
  precio_lista: number
  precio_descuento?: number | null
  stock_actual: number
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

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const createLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const MAX_TURNO_FOTO_BYTES = 5 * 1024 * 1024

export function StaffTurnosPanel() {
  const { data: turnos = [], mutate } = useSWR<Turno[]>("/api/turnos", fetcher)
  const { data: servicios = [] } = useSWR<Servicio[]>("/api/servicios", fetcher)
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)

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
  const turnosEnCurso = useMemo(() => turnos.filter((t) => t.estado === "en_curso"), [turnos])

  const startEditing = (turno: Turno) => {
    setEditingTurnoId(turno.id)
    setServicioFinalId(turno.servicio_final_id || turno.servicio_id)
    setServiciosAgregados((turno.servicios_agregados || []).map((item) => ({ ...item, uid: createLocalId() })))
    setProductosAgregados(
      (turno.productos_agregados || []).map((p) => ({
        uid: createLocalId(),
        ...p,
        origen_staff: Boolean(p.origen_staff === true && p.agregado_por_empleada_id),
        agregado_por_empleada_id: p.agregado_por_empleada_id ?? null,
        agregado_por_user_id: p.agregado_por_user_id ?? null,
        turno_id_origen: p.turno_id_origen ?? turno.id,
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

  const agregarServicio = (servicio_id: string) => {
    const srv = servicios.find((s) => s.id === servicio_id)
    if (!srv) return
    const precioUnitario = (srv as any).precio_lista ?? (srv as any).precio ?? 0
    setServiciosAgregados((prev) => [
      ...prev,
      { uid: createLocalId(), servicio_id, cantidad: "", precio_unitario: Number(precioUnitario) || 0 },
    ])
    setSearchServicio("")
  }

  const agregarProducto = (producto_id: string) => {
    const prod = productos.find((p) => p.id === producto_id)
    if (!prod) return
    const precioBase = Number(prod.precio_descuento ?? prod.precio_lista ?? 0)
    setProductosAgregados((prev) => [
      ...prev,
      {
        uid: createLocalId(),
        producto_id,
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
    return servicios.filter((s) => s.nombre.toLowerCase().includes(term))
  }, [servicios, searchServicio])

  const productosFiltrados = useMemo(() => {
    const term = searchProducto.toLowerCase()
    return productos.filter((p) => p.nombre.toLowerCase().includes(term) && p.stock_actual > 0)
  }, [productos, searchProducto])

  const cantidadesInvalidas =
    serviciosAgregados.some((s) => s.cantidad === "" || Number(s.cantidad) <= 0) ||
    productosAgregados.some((p) => p.cantidad === "" || Number(p.cantidad) <= 0)

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
      setFotoError("Selecciona una imagen válida (JPG, PNG o WEBP).")
      return
    }
    if (file.size > MAX_TURNO_FOTO_BYTES) {
      setFotoError("La foto supera el tamaño máximo permitido (5 MB).")
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
    if (!confirm("¿Quitar la foto del trabajo cargada?")) return
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
    if (cantidadesInvalidas) {
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/turnos/${editingTurnoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio_final_id: servicioFinalId,
          servicios_agregados: serviciosAgregados.map(({ uid, ...s }) => ({
            ...s,
            cantidad: Number(s.cantidad || 0),
          })),
          productos_agregados: productosAgregados.map(({ uid, ...p }) => ({
            ...p,
            cantidad: Number(p.cantidad || 0),
            origen_staff: Boolean(p.origen_staff && p.agregado_por_empleada_id),
            agregado_por_empleada_id: p.agregado_por_empleada_id ?? null,
            agregado_por_user_id: p.agregado_por_user_id ?? null,
            turno_id_origen: p.turno_id_origen ?? editingTurnoId,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || "No se pudo guardar")
        return
      }
      mutate()
      cancelEditing()
    } finally {
      setSaving(false)
    }
  }

  if (turnosEnCurso.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium">No tienes turnos en curso</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {turnosEnCurso.map((turno) => {
        const isEditing = editingTurnoId === turno.id
        const servicioActual = servicios.find((s) => s.id === (isEditing ? servicioFinalId : turno.servicio_final_id || turno.servicio_id))
        const horaInicio = new Date(turno.fecha_inicio).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })

        return (
          <Card key={turno.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{`${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim() || "Cliente"}</span>
                <Badge variant="secondary">{horaInicio}</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Servicio original: {turno.servicios?.nombre || "Servicio"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditing ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong>Servicio final:</strong> {servicioActual?.nombre || turno.servicios?.nombre || "Servicio"}
                  </p>
                  {(turno.servicios_agregados?.length || 0) > 0 && (
                    <p className="text-sm text-muted-foreground">
                      + {turno.servicios_agregados?.length} servicios agregados
                    </p>
                  )}
                  {(turno.productos_agregados?.length || 0) > 0 && (
                    <p className="text-sm text-muted-foreground">
                      + {turno.productos_agregados?.length} productos agregados
                    </p>
                  )}
                  {turno.foto_trabajo_disponible && (
                    <div className="pt-1">
                      <VerTurnoFotoButton turnoId={turno.id} />
                    </div>
                  )}
                  <Button onClick={() => startEditing(turno)} className="mt-2">
                    Modificar
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Servicio realizado</p>
                    <Select value={servicioFinalId} onValueChange={setServicioFinalId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar servicio" />
                      </SelectTrigger>
                      <SelectContent>
                        {servicios.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nombre} - ${Number(((s as any).precio_lista ?? (s as any).precio ?? 0)).toFixed(2)}
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
                            {serviciosFiltrados.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.nombre} - ${Number(((s as any).precio_lista ?? (s as any).precio ?? 0)).toFixed(2)}
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
                        {serviciosAgregados.map((s) => {
                          const detalle = servicios.find((d) => d.id === s.servicio_id)
                          return (
                            <div key={s.uid} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline">{detalle?.nombre || "Servicio"}</Badge>
                              <div className="flex flex-col">
                                <Input
                                  type="number"
                                  min={1}
                                  value={s.cantidad}
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
                                      )
                                    )
                                  }
                                />
                                {submitAttempted && (s.cantidad === "" || Number(s.cantidad) <= 0) && (
                                  <span className="text-[11px] text-destructive">Cantidad requerida</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ${(s.precio_unitario * Number(s.cantidad || 0)).toFixed(2)}
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
                            {productosFiltrados.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nombre} - ${Number(p.precio_descuento ?? p.precio_lista ?? 0)} (Stock: {p.stock_actual})
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
                        {productosAgregados.map((p) => {
                          const detalle = productos.find((d) => d.id === p.producto_id)
                          return (
                            <div key={p.uid} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline">{detalle?.nombre || "Producto"}</Badge>
                              <div className="flex flex-col">
                                <Input
                                  type="number"
                                  min={1}
                                  max={detalle?.stock_actual || 999}
                                  value={p.cantidad}
                                  className="w-16"
                                  onChange={(e) =>
                                    setProductosAgregados((prev) =>
                                      prev.map((item) =>
                                        item.uid === p.uid
                                          ? {
                                              ...item,
                                              cantidad: e.target.value === "" ? "" : Number.parseInt(e.target.value),
                                            }
                                          : item,
                                      )
                                    )
                                  }
                                />
                                {submitAttempted && (p.cantidad === "" || Number(p.cantidad) <= 0) && (
                                  <span className="text-[11px] text-destructive">Cantidad requerida</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ${(p.precio_unitario * Number(p.cantidad || 0)).toFixed(2)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setProductosAgregados((prev) => prev.filter((item) => item.uid !== p.uid))}
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
                        <p className="text-xs text-muted-foreground">Solo 1 foto. Tamaño máximo: 5 MB.</p>
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
