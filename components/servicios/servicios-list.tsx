"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ServicioForm } from "./servicio-form"
import { PencilIcon, Trash2Icon, SearchIcon, PlusIcon } from "lucide-react"
import { showSystemConfirm } from "@/lib/system-dialogs"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const SERVICIOS_PAGE_SIZE = 60

export type Categoria = {
  id: string
  nombre: string
}

export type Recurso = {
  id: string
  nombre: string
  cantidad_disponible: number
}

export type Servicio = {
  id: string
  nombre: string
  precio_lista: number
  precio?: number | null
  precio_descuento?: number | null
  duracion_minutos: number
  activo: boolean
  categoria_id?: string | null
  recurso_id?: string | null
  empleadas_habilitadas?: string[]
  empleadas_comision?: { empleada_id: string; comision_pct: number | null; comision_monto_fijo: number | null }[]
  comision_pct?: number | null
  comision_monto_fijo?: number | null
  declaracion_jurada_plantilla_id?: string | null
}

type DeclaracionPlantilla = { id: string; nombre: string; activa?: boolean | null }

type ServiciosPageResponse = {
  items: Servicio[]
  pagination?: {
    page: number
    page_size: number
    has_prev: boolean
    has_next: boolean
  }
}

export function ServiciosList() {
  const [page, setPage] = useState(1)
  const { data: serviciosResponse, mutate } = useSWR<ServiciosPageResponse>(
    `/api/servicios?include_inactive=true&page=${page}&page_size=${SERVICIOS_PAGE_SIZE}`,
    fetcher,
  )
  const { data: categorias } = useSWR<Categoria[]>("/api/categorias", fetcher)
  const { data: recursos } = useSWR<Recurso[]>("/api/recursos", fetcher)
  const { data: declaracionesPlantillas = [] } = useSWR<DeclaracionPlantilla[]>(
    "/api/declaraciones-juradas/plantillas",
    fetcher,
  )
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const [selected, setSelected] = useState<Servicio | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loadingSelected, setLoadingSelected] = useState(false)
  const [selectedError, setSelectedError] = useState<string | null>(null)
  const editRequestRef = useRef(0)
  const [search, setSearch] = useState("")
  const servicios = Array.isArray(serviciosResponse?.items) ? serviciosResponse.items : []
  const pagination = serviciosResponse?.pagination || {
    page,
    page_size: SERVICIOS_PAGE_SIZE,
    has_prev: page > 1,
    has_next: false,
  }

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return "-"
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return "-"
    return `$${numeric.toFixed(2)}`
  }

  const getCategoriaNombre = (categoriaId?: string | null) => {
    if (!categoriaId || !categorias) return "-"
    const categoria = categorias.find((c) => c.id === categoriaId)
    return categoria?.nombre || "-"
  }

  const getRecursoNombre = (recursoId?: string | null) => {
    if (!recursoId || !recursos) return "-"
    const recurso = recursos.find((r) => r.id === recursoId)
    if (!recurso) return "-"
    const cantidad = Number(recurso.cantidad_disponible)
    return `${recurso.nombre}${Number.isFinite(cantidad) ? ` (${cantidad})` : ""}`
  }

  const getDeclaracionNombre = (plantillaId?: string | null) => {
    if (!plantillaId) return "Sin DJ"
    const found = declaracionesPlantillas.find((item) => item.id === plantillaId)
    return found?.nombre || "DJ no disponible"
  }

  const handleDelete = async (id: string) => {
    if (!(await showSystemConfirm("Eliminar servicio?"))) return
    await fetch(`/api/servicios/${id}`, { method: "DELETE" })
    mutate()
  }

  const cloneServicio = (servicio: Partial<Servicio>): Servicio => ({
    id: String(servicio.id || ""),
    nombre: String(servicio.nombre || ""),
    precio_lista: Number((servicio as any).precio_lista ?? (servicio as any).precio ?? 0),
    precio_descuento:
      servicio.precio_descuento === null || servicio.precio_descuento === undefined
        ? null
        : Number(servicio.precio_descuento),
    duracion_minutos: Number(servicio.duracion_minutos || 0),
    activo: servicio.activo !== false,
    categoria_id: servicio.categoria_id || null,
    recurso_id: servicio.recurso_id || null,
    declaracion_jurada_plantilla_id: servicio.declaracion_jurada_plantilla_id || null,
    comision_pct: servicio.comision_pct ?? null,
    comision_monto_fijo: servicio.comision_monto_fijo ?? null,
    empleadas_habilitadas: Array.isArray(servicio.empleadas_habilitadas) ? [...servicio.empleadas_habilitadas] : [],
    empleadas_comision: Array.isArray(servicio.empleadas_comision)
      ? servicio.empleadas_comision.map((c) => ({ ...c }))
      : [],
  })

  const selectedForForm = editingId ? selected : null

  const openEditModal = async (servicio: Servicio) => {
    const requestId = editRequestRef.current + 1
    editRequestRef.current = requestId
    setEditingId(servicio.id)
    setSelected(cloneServicio(servicio))
    setSelectedError(null)
    setLoadingSelected(true)
    setShowForm(true)
    try {
      const res = await fetch(`/api/servicios/${servicio.id}`)
      if (!res.ok) {
        throw new Error("No se pudo cargar el servicio.")
      }
      const payload = await res.json()
      if (!payload || typeof payload !== "object" || !payload.id || !payload.nombre) {
        throw new Error("Respuesta inválida al cargar servicio")
      }
      if (editRequestRef.current !== requestId) return
      setSelected(cloneServicio(payload))
    } catch {
      if (editRequestRef.current !== requestId) return
      setSelected(cloneServicio(servicio))
      setSelectedError("No se pudo cargar el servicio completo. Se muestran los datos disponibles.")
    } finally {
      if (editRequestRef.current === requestId) {
        setLoadingSelected(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-between items-center">
          <Button
            onClick={() => {
              setEditingId(null)
              setSelected(null)
              setLoadingSelected(false)
              setSelectedError(null)
              setShowForm(true)
            }}
            className="gap-2"
            variant="primary"
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo servicio
          </Button>
        </div>
      )}

      <div className="relative w-full sm:w-80">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar servicio..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0 pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead>DJ</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead className="text-right">Precio lista</TableHead>
                  <TableHead className="text-right">Precio desc.</TableHead>
                  {isAdmin && <TableHead className="text-right">Comision</TableHead>}
                  {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicios
                  .filter((s) => s.nombre.toLowerCase().includes(search.toLowerCase()))
                  .map((servicio) => (
                    <TableRow key={servicio.id}>
                      <TableCell className="font-semibold">
                        <div className="flex items-center gap-2">
                          <span className={servicio.activo ? "" : "text-muted-foreground line-through"}>
                            {servicio.nombre}
                          </span>
                          {!servicio.activo && <Badge variant="neutral">Inactivo</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{getCategoriaNombre(servicio.categoria_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{getRecursoNombre(servicio.recurso_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{getDeclaracionNombre(servicio.declaracion_jurada_plantilla_id)}</TableCell>
                      <TableCell className="text-right">{servicio.duracion_minutos} min</TableCell>
                      <TableCell className="text-right">{formatCurrency(servicio.precio_lista)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(servicio.precio_descuento)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {servicio.comision_pct !== null && servicio.comision_pct !== undefined
                            ? `${Number(servicio.comision_pct).toFixed(2)}%`
                            : servicio.comision_monto_fijo !== null && servicio.comision_monto_fijo !== undefined
                              ? `$${Number(servicio.comision_monto_fijo).toFixed(2)}`
                              : "-"}
                        </TableCell>
                      )}
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void openEditModal(servicio)}
                              className="gap-1.5"
                            >
                              <PencilIcon className="h-4 w-4" />
                              Editar
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => handleDelete(servicio.id)} className="gap-1.5">
                              <Trash2Icon className="h-4 w-4" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                {servicios.filter((s) => s.nombre.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 7} className="text-sm text-muted-foreground">
                      Sin servicios para esta página.
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
            editRequestRef.current += 1
            setShowForm(false)
            setEditingId(null)
            setSelected(null)
            setLoadingSelected(false)
            setSelectedError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {editingId ? "editar" : "crear"} un servicio.
            </DialogDescription>
          </DialogHeader>
          {selectedError ? <p className="text-sm text-amber-600">{selectedError}</p> : null}
          {editingId && !selectedForForm ? (
            <p className="text-sm text-muted-foreground">Cargando datos del servicio...</p>
          ) : (
            <>
              {editingId && loadingSelected ? (
                <p className="text-xs text-muted-foreground">Actualizando datos del servicio...</p>
              ) : null}
              <ServicioForm
                key={editingId || "new"}
                servicio={selectedForForm}
                onSuccess={() => {
                  mutate()
                  setEditingId(null)
                  setSelected(null)
                  setPage(1)
                  setShowForm(false)
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

