"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ServicioForm } from "./servicio-form"
import { PencilIcon, Trash2Icon, SearchIcon, PlusIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
}

export function ServiciosList() {
  const { data: servicios, mutate } = useSWR<Servicio[]>("/api/servicios?include_inactive=true", fetcher)
  const { data: categorias } = useSWR<Categoria[]>("/api/categorias", fetcher)
  const { data: recursos } = useSWR<Recurso[]>("/api/recursos", fetcher)
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const [selected, setSelected] = useState<Servicio | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")

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

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar servicio?")) return
    await fetch(`/api/servicios/${id}`, { method: "DELETE" })
    mutate()
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
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
            Nuevo servicio
          </Button>
        </div>
      )}

      <div className="relative w-full sm:w-80">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar servicio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead className="text-right">Precio lista</TableHead>
                  <TableHead className="text-right">Precio desc.</TableHead>
                  {isAdmin && <TableHead className="text-right">Comision</TableHead>}
                  {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(servicios || [])
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
                              onClick={() => {
                                setSelected(servicio)
                                setShowForm(true)
                              }}
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showForm && isAdmin}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false)
            setSelected(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {selected ? "editar" : "crear"} un servicio.
            </DialogDescription>
          </DialogHeader>
          <ServicioForm
            servicio={selected}
            onSuccess={() => {
              mutate()
              setSelected(null)
              setShowForm(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

