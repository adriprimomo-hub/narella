"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchIcon, SettingsIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Servicio } from "./servicios-list"
import { CategoriasManager, type Categoria } from "./categorias-manager"
import { RecursosManager, type Recurso } from "./recursos-manager"

type ComisionTipo = "porcentaje" | "monto"

type EmpleadaComision = {
  empleada_id: string
  comision_tipo: ComisionTipo
  comision_pct: number | ""
  comision_monto_fijo: number | ""
}

const resolveComisionTipo = (pct?: number | null, fijo?: number | null): ComisionTipo => {
  const pctValue = Number(pct ?? 0)
  const fijoValue = Number(fijo ?? 0)
  const pctDefined = pct !== null && pct !== undefined
  const fijoDefined = fijo !== null && fijo !== undefined

  if (fijoDefined && !pctDefined) return "monto"
  if (pctDefined && !fijoDefined) return "porcentaje"
  if (fijoValue > 0 && pctValue <= 0) return "monto"
  if (pctValue > 0 && fijoValue <= 0) return "porcentaje"
  if (fijoValue > 0 && pctValue > 0) return "monto"
  return "porcentaje"
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface ServicioFormProps {
  servicio?: Servicio | null
  onSuccess: () => void
}

export function ServicioForm({ servicio, onSuccess }: ServicioFormProps) {
  const [formData, setFormData] = useState({
    nombre: "",
    duracion_minutos: "" as number | "",
    precio_lista: "" as number | "",
    precio_descuento: null as number | null,
    activo: true,
    categoria_id: "" as string,
    recurso_id: "" as string,
    empleadas_habilitadas: [] as string[],
    comision_pct: "" as number | "",
    comision_monto_fijo: "" as number | "",
  })
  const [loading, setLoading] = useState(false)
  const [showCategoriasManager, setShowCategoriasManager] = useState(false)
  const [showRecursosManager, setShowRecursosManager] = useState(false)
  const [comisionTipoBase, setComisionTipoBase] = useState<ComisionTipo>("porcentaje")
  const [empleadasComision, setEmpleadasComision] = useState<EmpleadaComision[]>([])
  const [searchEmpleada, setSearchEmpleada] = useState("")
  const [errors, setErrors] = useState<{ nombre?: string; precio_lista?: string; duracion_minutos?: string }>({})
  const [formError, setFormError] = useState("")
  const { data: empleadasData } = useSWR<{ id: string; nombre: string }[]>("/api/empleadas", fetcher)
  const { data: categoriasData, mutate: mutateCategorias } = useSWR<Categoria[]>("/api/categorias", fetcher)
  const { data: recursosData, mutate: mutateRecursos } = useSWR<Recurso[]>("/api/recursos", fetcher)

  const empleadas = Array.isArray(empleadasData) ? empleadasData : []
  const categorias = Array.isArray(categoriasData) ? categoriasData : []
  const recursos = Array.isArray(recursosData) ? recursosData : []

  useEffect(() => {
    if (servicio) {
      const basePct = Number((servicio as any).comision_pct || 0)
      const baseFijo = Number((servicio as any).comision_monto_fijo || 0)
      const baseTipo = resolveComisionTipo((servicio as any).comision_pct, (servicio as any).comision_monto_fijo)
      setFormData({
        nombre: servicio.nombre,
        duracion_minutos: servicio.duracion_minutos,
        precio_lista: (servicio as any).precio_lista ?? 0,
        precio_descuento: (servicio as any).precio_descuento ?? null,
        activo: servicio.activo,
        categoria_id: (servicio as any).categoria_id || "",
        recurso_id: (servicio as any).recurso_id || "",
        empleadas_habilitadas: servicio.empleadas_habilitadas || [],
        comision_pct: basePct,
        comision_monto_fijo: baseFijo,
      })
      setComisionTipoBase(baseTipo)
      const comisiones = (servicio as any).empleadas_comision || []
      setEmpleadasComision(
        comisiones.map((c: any) => ({
          empleada_id: c.empleada_id,
          comision_pct: Number(c.comision_pct || 0),
          comision_monto_fijo: Number(c.comision_monto_fijo || 0),
          comision_tipo: resolveComisionTipo(c.comision_pct, c.comision_monto_fijo),
        })),
      )
    } else {
      setFormData({
        nombre: "",
        duracion_minutos: "",
        precio_lista: "",
        precio_descuento: null,
        activo: true,
        categoria_id: "",
        recurso_id: "",
        empleadas_habilitadas: [],
        comision_pct: "",
        comision_monto_fijo: "",
      })
      setComisionTipoBase("porcentaje")
      setEmpleadasComision([])
    }
  }, [servicio])

  const buildComisionEntry = (empleadaId: string): EmpleadaComision => ({
    empleada_id: empleadaId,
    comision_tipo: comisionTipoBase,
    comision_pct: formData.comision_pct,
    comision_monto_fijo: formData.comision_monto_fijo,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    setFormError("")

    try {
      const nextErrors: { nombre?: string; precio_lista?: string; duracion_minutos?: string } = {}
      if (!formData.nombre.trim()) nextErrors.nombre = "Ingresa el nombre del servicio."
      if (formData.precio_lista === "" || Number(formData.precio_lista) <= 0) {
        nextErrors.precio_lista = "Ingresa un precio de lista válido."
      }
      if (formData.duracion_minutos === "" || Number(formData.duracion_minutos) <= 0) {
        nextErrors.duracion_minutos = "Ingresa una duración válida."
      }
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors)
        return
      }
      const url = servicio ? `/api/servicios/${servicio.id}` : "/api/servicios"
      const method = servicio ? "PUT" : "POST"
      const toNumber = (value: number | "" | null) => {
        if (value === "" || value === null) return 0
        return Number(value)
      }
      const comisionBase =
        comisionTipoBase === "porcentaje"
          ? { comision_pct: toNumber(formData.comision_pct), comision_monto_fijo: null }
          : { comision_pct: null, comision_monto_fijo: toNumber(formData.comision_monto_fijo) }
      const comisionesPayload = empleadasComision
        .filter((c) => c.empleada_id)
        .map((c) => ({
          empleada_id: c.empleada_id,
          comision_pct: c.comision_tipo === "porcentaje" ? toNumber(c.comision_pct) : null,
          comision_monto_fijo: c.comision_tipo === "monto" ? toNumber(c.comision_monto_fijo) : null,
        }))
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: formData.nombre,
          duracion_minutos: toNumber(formData.duracion_minutos),
          precio_lista: toNumber(formData.precio_lista),
          precio_descuento: formData.precio_descuento === null ? null : Number(formData.precio_descuento),
          activo: formData.activo,
          categoria_id: formData.categoria_id || null,
          recurso_id: formData.recurso_id || null,
          empleadas_habilitadas: formData.empleadas_habilitadas,
          ...comisionBase,
          empleadas_comision: comisionesPayload,
        }),
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json().catch(() => ({}))
        setFormError(data?.error || "No se pudo guardar el servicio.")
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleEmpleada = (id: string) => {
    const isSelected = formData.empleadas_habilitadas.includes(id)
    setFormData((prev) => ({
      ...prev,
      empleadas_habilitadas: isSelected
        ? prev.empleadas_habilitadas.filter((e) => e !== id)
        : [...prev.empleadas_habilitadas, id],
    }))
    if (isSelected) {
      setEmpleadasComision((prev) => prev.filter((c) => c.empleada_id !== id))
    }
  }

  const updateComisionTipo = (empleada_id: string, tipo: ComisionTipo) => {
    setEmpleadasComision((prev) => {
      const exists = prev.find((c) => c.empleada_id === empleada_id)
      if (exists) return prev.map((c) => (c.empleada_id === empleada_id ? { ...c, comision_tipo: tipo } : c))
      return [...prev, { ...buildComisionEntry(empleada_id), comision_tipo: tipo }]
    })
  }

  const updateComisionValor = (empleada_id: string, value: number | "") => {
    setEmpleadasComision((prev) => {
      const exists = prev.find((c) => c.empleada_id === empleada_id)
      const base = exists || buildComisionEntry(empleada_id)
      const next = {
        ...base,
        comision_pct: base.comision_tipo === "porcentaje" ? value : base.comision_pct,
        comision_monto_fijo: base.comision_tipo === "monto" ? value : base.comision_monto_fijo,
      }
      if (exists) return prev.map((c) => (c.empleada_id === empleada_id ? next : c))
      return [...prev, next]
    })
  }

  const empleadasFiltradas = searchEmpleada
    ? empleadas.filter((e) => e.nombre.toLowerCase().includes(searchEmpleada.toLowerCase()))
    : []
  const empleadasSeleccionadas = empleadas.filter((e) => formData.empleadas_habilitadas.includes(e.id))

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="servicio-nombre" className="mb-1 block text-sm font-medium">
            Nombre del servicio
          </label>
          <Input
            id="servicio-nombre"
            value={formData.nombre}
            onChange={(e) => {
              setFormData({ ...formData, nombre: e.target.value })
              if (errors.nombre) setErrors((prev) => ({ ...prev, nombre: undefined }))
            }}
            required
          />
          {errors.nombre && <p className="text-xs text-destructive mt-1">{errors.nombre}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Categoría</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCategoriasManager(true)}
              className="h-6 px-2 text-xs"
            >
              <SettingsIcon className="mr-1 h-3 w-3" />
              Gestionar
            </Button>
          </div>
          <Select
            value={formData.categoria_id}
            onValueChange={(v) => setFormData({ ...formData, categoria_id: v === "none" ? "" : v })}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Recurso</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowRecursosManager(true)}
              className="h-6 px-2 text-xs"
            >
              <SettingsIcon className="mr-1 h-3 w-3" />
              Gestionar
            </Button>
          </div>
          <Select
            value={formData.recurso_id}
            onValueChange={(v) => setFormData({ ...formData, recurso_id: v === "none" ? "" : v })}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Sin recurso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin recurso</SelectItem>
              {recursos.map((rec) => (
                <SelectItem key={rec.id} value={rec.id}>
                  {rec.nombre} {Number.isFinite(Number(rec.cantidad_disponible)) ? `(${Number(rec.cantidad_disponible)})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="servicio-precio-lista" className="mb-1 block text-sm font-medium">
            Precio de lista
          </label>
          <Input
            id="servicio-precio-lista"
            type="number"
            step="0.01"
            value={formData.precio_lista}
            onChange={(e) => {
              setFormData({
                ...formData,
                precio_lista: e.target.value === "" ? "" : Number.parseFloat(e.target.value),
              })
              if (errors.precio_lista) setErrors((prev) => ({ ...prev, precio_lista: undefined }))
            }}
            required
          />
          {errors.precio_lista && <p className="text-xs text-destructive mt-1">{errors.precio_lista}</p>}
        </div>
        <div>
          <label htmlFor="servicio-precio-descuento" className="mb-1 block text-sm font-medium">
            Precio con descuento
          </label>
          <Input
            id="servicio-precio-descuento"
            type="number"
            step="0.01"
            value={formData.precio_descuento ?? ""}
            onChange={(e) => setFormData({ ...formData, precio_descuento: e.target.value === "" ? null : Number.parseFloat(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="servicio-duracion" className="mb-1 block text-sm font-medium">
            Duración (minutos)
          </label>
          <Input
            id="servicio-duracion"
            type="number"
            min={5}
            step={5}
            value={formData.duracion_minutos}
            onChange={(e) => {
              setFormData({
                ...formData,
                duracion_minutos: e.target.value === "" ? "" : Number.parseInt(e.target.value),
              })
              if (errors.duracion_minutos) setErrors((prev) => ({ ...prev, duracion_minutos: undefined }))
            }}
            required
          />
          {errors.duracion_minutos && <p className="text-xs text-destructive mt-1">{errors.duracion_minutos}</p>}
        </div>
        <div className="md:col-span-2">
          <p className="mb-1 text-sm font-medium">Comisión base</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr]">
            <div>
              <label htmlFor="servicio-comision-tipo-base" className="mb-1 block text-sm font-medium">
                Tipo
              </label>
              <Select value={comisionTipoBase} onValueChange={(v) => setComisionTipoBase(v as ComisionTipo)}>
                <SelectTrigger id="servicio-comision-tipo-base" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje</SelectItem>
                  <SelectItem value="monto">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="servicio-comision-valor-base" className="mb-1 block text-sm font-medium">
                Valor
              </label>
              <Input
                id="servicio-comision-valor-base"
                type="number"
                step="0.01"
                value={comisionTipoBase === "porcentaje" ? formData.comision_pct : formData.comision_monto_fijo}
                onChange={(e) => {
                  const value = e.target.value === "" ? "" : Number.parseFloat(e.target.value)
                  if (comisionTipoBase === "porcentaje") {
                    setFormData({ ...formData, comision_pct: value })
                  } else {
                    setFormData({ ...formData, comision_monto_fijo: value })
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Quien lo puede hacer y comision</p>
          <div className="w-60">
            <label htmlFor="servicio-buscar-empleada" className="mb-1 block text-sm font-medium">
              Buscar empleada
            </label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="servicio-buscar-empleada"
                className="pl-9"
                value={searchEmpleada}
                onChange={(e) => setSearchEmpleada(e.target.value)}
              />
            </div>
          </div>
        </div>

        {searchEmpleada && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2">
            {empleadasFiltradas.length ? (
              empleadasFiltradas.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{e.nombre}</span>
                  <Button
                    type="button"
                    variant={formData.empleadas_habilitadas.includes(e.id) ? "secondary" : "default"}
                    size="sm"
                    onClick={() => toggleEmpleada(e.id)}
                  >
                    {formData.empleadas_habilitadas.includes(e.id) ? "Quitar" : "Agregar"}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Sin resultados.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {empleadasSeleccionadas.map((e) => {
            const commission = empleadasComision.find((c) => c.empleada_id === e.id) || buildComisionEntry(e.id)
            const currentTipo = commission.comision_tipo
            const currentValue = currentTipo === "porcentaje" ? commission.comision_pct : commission.comision_monto_fijo
            return (
              <div key={e.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{e.nombre}</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleEmpleada(e.id)}>
                    Quitar
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-[180px_1fr]">
                  <div>
                    <label htmlFor={`servicio-comision-tipo-${e.id}`} className="mb-1 block text-sm font-medium">
                      Tipo de comisión
                    </label>
                    <Select value={currentTipo} onValueChange={(v) => updateComisionTipo(e.id, v as ComisionTipo)}>
                      <SelectTrigger id={`servicio-comision-tipo-${e.id}`} className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="porcentaje">Porcentaje</SelectItem>
                        <SelectItem value="monto">Monto fijo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor={`servicio-comision-valor-${e.id}`} className="mb-1 block text-sm font-medium">
                      Valor
                    </label>
                    <Input
                      id={`servicio-comision-valor-${e.id}`}
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(ev) =>
                        updateComisionValor(
                          e.id,
                          ev.target.value === "" ? "" : Number.parseFloat(ev.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {commission.comision_tipo === comisionTipoBase &&
                  Number(currentValue) ===
                    Number(comisionTipoBase === "porcentaje" ? formData.comision_pct : formData.comision_monto_fijo)
                    ? "Usando comisión base"
                    : "Comisión personalizada"}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.activo}
          onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
          className="rounded border-border"
        />
        <span className="text-sm font-medium">Activo</span>
      </div>

      <Button type="submit" disabled={loading} className="gap-2">
        {loading ? "Guardando..." : servicio ? "Actualizar" : "Crear"}
      </Button>
      {formError && <p className="text-sm text-destructive">{formError}</p>}

      {showCategoriasManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <CategoriasManager
              onClose={() => {
                setShowCategoriasManager(false)
                mutateCategorias()
              }}
            />
          </div>
        </div>
      )}

      {showRecursosManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <RecursosManager
              onClose={() => {
                setShowRecursosManager(false)
                mutateRecursos()
              }}
            />
          </div>
        </div>
      )}
    </form>
  )
}

