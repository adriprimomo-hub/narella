"use client"

import { useEffect, useId, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Empleada, HorarioLaboral } from "./types"
import { CalendarIcon, CalendarOffIcon, CheckIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon, SearchIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate } from "@/lib/date-format"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const EMPLEADAS_PAGE_SIZE = 60

const diasSemana: { value: number; label: string }[] = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
]

type FormState = {
  nombre: string
  apellido: string
  telefono: string
  horarios: (HorarioLaboral & { activo: boolean })[]
  activo: boolean
}

type Ausencia = {
  id: string
  empleada_id: string
  fecha_desde: string
  fecha_hasta: string
  hora_desde?: string | null
  hora_hasta?: string | null
  motivo: "vacaciones" | "licencia" | "enfermedad" | "otro"
  descripcion?: string | null
}

const motivosAusencia = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "licencia", label: "Licencia" },
  { value: "enfermedad", label: "Enfermedad" },
  { value: "otro", label: "Otro" },
]

const defaultHorarios: (HorarioLaboral & { activo: boolean })[] = diasSemana.map((d) => ({
  dia: d.value,
  desde: "09:00",
  hasta: "18:00",
  activo: [1, 2, 3, 4, 5].includes(d.value),
}))

function buildInitialState(empleada?: Empleada | null): FormState {
  return {
    nombre: empleada?.nombre || "",
    apellido: empleada?.apellido || "",
    telefono: empleada?.telefono || "",
    horarios: defaultHorarios.map((h) => {
      const existing = (empleada?.horarios || []).find((eh) => eh.dia === h.dia)
      return existing
        ? { ...existing, activo: true }
        : { ...h }
    }),
    activo: empleada?.activo ?? true,
  }
}

interface EmpleadaFormProps {
  empleada?: Empleada | null
  onSuccess: () => void
}

function EmpleadaForm({ empleada, onSuccess }: EmpleadaFormProps) {
  const formId = useId()
  const nombreId = `${formId}-nombre`
  const apellidoId = `${formId}-apellido`
  const telefonoId = `${formId}-telefono`
  const [formData, setFormData] = useState<FormState>(() => buildInitialState(empleada))
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [errors, setErrors] = useState<{ nombre?: string; apellido?: string }>({})
  const [horarioErrors, setHorarioErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    setFormData(buildInitialState(empleada))
  }, [empleada])

  const handleHorarioChange = (dia: number, key: "desde" | "hasta" | "activo", value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      horarios: prev.horarios.map((h) => (h.dia === dia ? { ...h, [key]: value } : h)),
    }))
    setHorarioErrors((prev) => {
      if (!prev[dia]) return prev
      const next = { ...prev }
      delete next[dia]
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError("")
    setErrors({})
    setHorarioErrors({})

    const payload = {
      ...formData,
      horarios: formData.horarios.filter((h) => h.activo).map(({ activo, ...rest }) => rest),
    }

    try {
      const nextErrors: { nombre?: string; apellido?: string } = {}
      const nextHorarioErrors: Record<number, string> = {}

      if (!formData.nombre.trim()) nextErrors.nombre = "Ingresa el nombre."
      if (!formData.apellido.trim()) nextErrors.apellido = "Ingresa el apellido."

      formData.horarios.forEach((h) => {
        if (!h.activo) return
        if (!h.desde || !h.hasta) {
          nextHorarioErrors[h.dia] = "Completa desde y hasta."
          return
        }
        if (h.hasta <= h.desde) {
          nextHorarioErrors[h.dia] = "La hora hasta debe ser mayor a la hora desde."
        }
      })

      if (Object.keys(nextErrors).length > 0 || Object.keys(nextHorarioErrors).length > 0) {
        setErrors(nextErrors)
        setHorarioErrors(nextHorarioErrors)
        return
      }

      const url = empleada ? `/api/empleadas/${empleada.id}` : "/api/empleadas"
      const method = empleada ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSuccess()
        setFormData(buildInitialState(null))
      } else {
        const data = await res.json().catch(() => ({}))
        setFormError(data?.error || "No se pudo guardar la empleada.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor={nombreId} className="text-sm font-medium">Nombre</label>
          <Input
            id={nombreId}
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
          <label htmlFor={apellidoId} className="text-sm font-medium">Apellido</label>
          <Input
            id={apellidoId}
            value={formData.apellido}
            onChange={(e) => {
              setFormData({ ...formData, apellido: e.target.value })
              if (errors.apellido) setErrors((prev) => ({ ...prev, apellido: undefined }))
            }}
            required
          />
          {errors.apellido && <p className="text-xs text-destructive mt-1">{errors.apellido}</p>}
        </div>
        <div>
          <label htmlFor={telefonoId} className="text-sm font-medium">Teléfono</label>
          <Input
            id={telefonoId}
            value={formData.telefono}
            onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
            placeholder="11 5555 5555"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" />

      <Card className="bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4" />
            Horarios
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {formData.horarios.map((h) => {
            const label = diasSemana.find((d) => d.value === h.dia)?.label || `Dia ${h.dia}`
            return (
              <div key={h.dia} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={h.activo}
                      onChange={(e) => handleHorarioChange(h.dia, "activo", e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <Badge variant={h.activo ? "default" : "outline"}>{h.activo ? "Activo" : "Libre"}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Desde</p>
                    <Input
                      type="time"
                      value={h.desde}
                      onChange={(e) => handleHorarioChange(h.dia, "desde", e.target.value)}
                      disabled={!h.activo}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hasta</p>
                    <Input
                      type="time"
                      value={h.hasta}
                      onChange={(e) => handleHorarioChange(h.dia, "hasta", e.target.value)}
                      disabled={!h.activo}
                    />
                  </div>
                </div>
                {horarioErrors[h.dia] && (
                  <p className="text-xs text-destructive mt-2">{horarioErrors[h.dia]}</p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="empleada-activa"
          checked={formData.activo}
          onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
          className="rounded border-border"
        />
        <label htmlFor="empleada-activa" className="text-sm font-medium cursor-pointer">
          Activa para agenda
        </label>
      </div>

      <Button type="submit" className="w-full gap-2" disabled={loading}>
        {loading ? "Guardando..." : empleada ? "Actualizar" : "Crear empleada"}
      </Button>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
    </form>
  )
}

type EmpleadasPageResponse = {
  items: Empleada[]
  pagination?: {
    page: number
    page_size: number
    has_prev: boolean
    has_next: boolean
  }
}

export function EmpleadasPanel() {
  const [page, setPage] = useState(1)
  const { data: empleadasResponse, mutate } = useSWR<EmpleadasPageResponse>(
    `/api/empleadas?include_inactive=true&page=${page}&page_size=${EMPLEADAS_PAGE_SIZE}`,
    fetcher,
  )
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Empleada | null>(null)
  const [search, setSearch] = useState("")
  const [showAusenciasDialog, setShowAusenciasDialog] = useState(false)
  const [selectedEmpleadaAusencias, setSelectedEmpleadaAusencias] = useState<Empleada | null>(null)
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [loadingAusencias, setLoadingAusencias] = useState(false)
  const [ausenciaForm, setAusenciaForm] = useState({ fecha_desde: "", fecha_hasta: "", hora_desde: "", hora_hasta: "", motivo: "vacaciones" as const, descripcion: "" })
  const [guardandoAusencia, setGuardandoAusencia] = useState(false)
  const [ausenciaError, setAusenciaError] = useState<string | null>(null)
  const [ausenciaErrors, setAusenciaErrors] = useState<{
    fecha_desde?: string
    fecha_hasta?: string
    hora_desde?: string
    hora_hasta?: string
  }>({})
  const empleadas = Array.isArray(empleadasResponse?.items) ? empleadasResponse.items : []
  const pagination = empleadasResponse?.pagination || {
    page,
    page_size: EMPLEADAS_PAGE_SIZE,
    has_prev: page > 1,
    has_next: false,
  }

  const fetchAusencias = async (empleadaId: string) => {
    setLoadingAusencias(true)
    try {
      const res = await fetch(`/api/empleadas/${empleadaId}/ausencias`)
      const data = await res.json()
      setAusencias(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Error fetching ausencias:", error)
      setAusencias([])
    } finally {
      setLoadingAusencias(false)
    }
  }

  const handleOpenAusencias = (empleada: Empleada) => {
    setSelectedEmpleadaAusencias(empleada)
    setShowAusenciasDialog(true)
    setAusenciaForm({ fecha_desde: "", fecha_hasta: "", hora_desde: "", hora_hasta: "", motivo: "vacaciones", descripcion: "" })
    setAusenciaError(null)
    setAusenciaErrors({})
    fetchAusencias(empleada.id)
  }

  const handleCrearAusencia = async () => {
    if (!selectedEmpleadaAusencias) return
    const nextErrors: typeof ausenciaErrors = {}

    if (!ausenciaForm.fecha_desde) nextErrors.fecha_desde = "Selecciona fecha desde."
    if (!ausenciaForm.fecha_hasta) nextErrors.fecha_hasta = "Selecciona fecha hasta."
    if (ausenciaForm.fecha_desde && ausenciaForm.fecha_hasta && ausenciaForm.fecha_hasta < ausenciaForm.fecha_desde) {
      nextErrors.fecha_hasta = "La fecha hasta debe ser mayor o igual a fecha desde."
    }
    if (ausenciaForm.hora_desde && !ausenciaForm.hora_hasta) {
      nextErrors.hora_hasta = "Completa la hora hasta."
    }
    if (!ausenciaForm.hora_desde && ausenciaForm.hora_hasta) {
      nextErrors.hora_desde = "Completa la hora desde."
    }
    if (ausenciaForm.hora_desde && ausenciaForm.hora_hasta && ausenciaForm.hora_hasta <= ausenciaForm.hora_desde) {
      nextErrors.hora_hasta = "La hora hasta debe ser mayor a la hora desde."
    }
    if (Object.keys(nextErrors).length > 0) {
      setAusenciaErrors(nextErrors)
      return
    }

    setGuardandoAusencia(true)
    setAusenciaError(null)
    setAusenciaErrors({})

    try {
      const payload = {
        ...ausenciaForm,
        hora_desde: ausenciaForm.hora_desde || null,
        hora_hasta: ausenciaForm.hora_hasta || null,
      }
      const res = await fetch(`/api/empleadas/${selectedEmpleadaAusencias.id}/ausencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        setAusenciaError(error?.error || "No se pudo crear la ausencia")
        return
      }

      setAusenciaForm({ fecha_desde: "", fecha_hasta: "", hora_desde: "", hora_hasta: "", motivo: "vacaciones", descripcion: "" })
      setAusenciaErrors({})
      fetchAusencias(selectedEmpleadaAusencias.id)
    } catch (error) {
      console.error("Error:", error)
      setAusenciaError("Ocurrio un error al crear la ausencia")
    } finally {
      setGuardandoAusencia(false)
    }
  }

  const handleEliminarAusencia = async (ausenciaId: string) => {
    if (!confirm("Eliminar esta ausencia?")) return

    try {
      await fetch(`/api/empleadas/ausencias/${ausenciaId}`, { method: "DELETE" })
      if (selectedEmpleadaAusencias) {
        fetchAusencias(selectedEmpleadaAusencias.id)
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const horariosResumidos = useMemo(() => {
    const map: Record<string, string> = {}
    empleadas.forEach((e) => {
      const activos = (e.horarios || [])
        .map((h) => diasSemana.find((d) => d.value === h.dia)?.label?.slice(0, 3))
        .filter(Boolean)
      map[e.id] = activos.join(", ")
    })
    return map
  }, [empleadas])

  const handleDelete = async (id: string) => {
    if (!isAdmin) return
    if (!confirm("Eliminar empleada?")) return
    await fetch(`/api/empleadas/${id}`, { method: "DELETE" })
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button
          onClick={() => {
            setSelected(null)
            setShowForm(true)
          }}
          className="gap-2"
          variant="primary"
        >
          <PlusIcon className="h-4 w-4" />
          Nueva empleada
        </Button>
      </div>

      <div className="relative w-full sm:w-80">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar empleada..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
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
                  <TableHead>Horario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empleadas
                  .filter(
                    (e) =>
                      `${e.nombre} ${e.apellido}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-semibold">
                      <span className="flex items-center gap-2">
                        {e.nombre} {e.apellido}
                      </span>
                      <p className="text-xs text-muted-foreground">{e.telefono}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{horariosResumidos[e.id] || "Sin horario"}</TableCell>
                    <TableCell>
                      <Badge variant={e.activo ? "success" : "neutral"} className="gap-1.5">
                        <CheckIcon className="h-3 w-3" />
                        {e.activo ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenAusencias(e)}
                          className="gap-1.5"
                        >
                          <CalendarOffIcon className="h-3.5 w-3.5" />
                          Ausencias
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelected(e)
                            setShowForm(true)
                          }}
                          className="gap-1.5"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="danger" onClick={() => handleDelete(e.id)} className="gap-1.5">
                            <Trash2Icon className="h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {empleadas.filter((e) => `${e.nombre} ${e.apellido}`.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      Sin empleadas para esta página.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Página {pagination.page}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.has_prev}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.has_next}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false)
            setSelected(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? "Editar empleada" : "Nueva empleada"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {selected ? "editar" : "crear"} una empleada.
            </DialogDescription>
          </DialogHeader>
          <EmpleadaForm
            empleada={selected}
            onSuccess={() => {
              mutate()
              setPage(1)
              setSelected(null)
              setShowForm(false)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showAusenciasDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAusenciasDialog(false)
          setSelectedEmpleadaAusencias(null)
          setAusencias([])
          setAusenciaError(null)
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ausencias de {selectedEmpleadaAusencias ? `${selectedEmpleadaAusencias.nombre} ${selectedEmpleadaAusencias.apellido}` : ""}</DialogTitle>
            <DialogDescription>Gestiona las ausencias por vacaciones, licencias, etc.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Nueva ausencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fecha desde</p>
                    <Input
                      type="date"
                      value={ausenciaForm.fecha_desde}
                      onChange={(e) => {
                        setAusenciaForm((prev) => ({ ...prev, fecha_desde: e.target.value }))
                        if (ausenciaErrors.fecha_desde) {
                          setAusenciaErrors((prev) => ({ ...prev, fecha_desde: undefined }))
                        }
                      }}
                    />
                    {ausenciaErrors.fecha_desde && (
                      <p className="text-xs text-destructive mt-1">{ausenciaErrors.fecha_desde}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fecha hasta</p>
                    <Input
                      type="date"
                      value={ausenciaForm.fecha_hasta}
                      onChange={(e) => {
                        setAusenciaForm((prev) => ({ ...prev, fecha_hasta: e.target.value }))
                        if (ausenciaErrors.fecha_hasta) {
                          setAusenciaErrors((prev) => ({ ...prev, fecha_hasta: undefined }))
                        }
                      }}
                    />
                    {ausenciaErrors.fecha_hasta && (
                      <p className="text-xs text-destructive mt-1">{ausenciaErrors.fecha_hasta}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hora desde (opcional)</p>
                    <Input
                      type="time"
                      value={ausenciaForm.hora_desde}
                      onChange={(e) => {
                        setAusenciaForm((prev) => ({ ...prev, hora_desde: e.target.value }))
                        if (ausenciaErrors.hora_desde) {
                          setAusenciaErrors((prev) => ({ ...prev, hora_desde: undefined }))
                        }
                      }}
                      placeholder="Dejar vacio para dia completo"
                    />
                    {ausenciaErrors.hora_desde && (
                      <p className="text-xs text-destructive mt-1">{ausenciaErrors.hora_desde}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hora hasta (opcional)</p>
                    <Input
                      type="time"
                      value={ausenciaForm.hora_hasta}
                      onChange={(e) => {
                        setAusenciaForm((prev) => ({ ...prev, hora_hasta: e.target.value }))
                        if (ausenciaErrors.hora_hasta) {
                          setAusenciaErrors((prev) => ({ ...prev, hora_hasta: undefined }))
                        }
                      }}
                    />
                    {ausenciaErrors.hora_hasta && (
                      <p className="text-xs text-destructive mt-1">{ausenciaErrors.hora_hasta}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Motivo</p>
                    <Select
                      value={ausenciaForm.motivo}
                      onValueChange={(v) => setAusenciaForm((prev) => ({ ...prev, motivo: v as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {motivosAusencia.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Descripcion (opcional)</p>
                    <Input
                      placeholder="Detalles..."
                      value={ausenciaForm.descripcion}
                      onChange={(e) => setAusenciaForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                    />
                  </div>
                </div>
                {ausenciaError && <p className="text-sm text-destructive">{ausenciaError}</p>}
                <Button
                  size="sm"
                  onClick={handleCrearAusencia}
                  disabled={guardandoAusencia}
                  className="gap-1.5"
                >
                  {guardandoAusencia ? (
                    <>
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-3.5 w-3.5" />
                      Agregar ausencia
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div>
              <p className="text-sm font-medium mb-2">Ausencias registradas</p>
              {loadingAusencias ? (
                <p className="text-sm text-muted-foreground">Cargando...</p>
              ) : ausencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ausencias registradas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Desde</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead>Horario</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ausencias.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{formatDate(a.fecha_desde)}</TableCell>
                        <TableCell>{formatDate(a.fecha_hasta)}</TableCell>
                        <TableCell>
                          {a.hora_desde && a.hora_hasta ? (
                            <span className="text-sm">{a.hora_desde} - {a.hora_hasta}</span>
                          ) : (
                            <Badge variant="secondary">Dia completo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {motivosAusencia.find((m) => m.value === a.motivo)?.label || a.motivo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.descripcion || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleEliminarAusencia(a.id)}
                            className="gap-1.5"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

