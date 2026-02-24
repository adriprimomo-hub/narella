"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PencilIcon, PlusIcon, Trash2Icon, XIcon, CheckIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export type Recurso = {
  id: string
  nombre: string
  cantidad_disponible: number
  created_at?: string
  updated_at?: string
}

interface RecursosManagerProps {
  onClose?: () => void
}

export function RecursosManager({ onClose }: RecursosManagerProps) {
  const { data: recursos, mutate } = useSWR<Recurso[]>("/api/recursos", fetcher)
  const [newNombre, setNewNombre] = useState("")
  const [newCantidad, setNewCantidad] = useState<number | "">("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNombre, setEditingNombre] = useState("")
  const [editingCantidad, setEditingCantidad] = useState<number | "">("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    newNombre?: string
    newCantidad?: string
    editNombre?: Record<string, string>
    editCantidad?: Record<string, string>
  }>({})

  const normalizeCantidad = (value: number | "") => {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value
    return Number.isFinite(parsed) ? parsed : 0
  }

  const handleCreate = async () => {
    const cantidadValue = normalizeCantidad(newCantidad)
    const nextErrors: typeof fieldErrors = {}
    if (!newNombre.trim()) nextErrors.newNombre = "Ingresa el nombre del recurso."
    if (!cantidadValue || cantidadValue <= 0) nextErrors.newCantidad = "Ingresa una cantidad válida."
    if (nextErrors.newNombre || nextErrors.newCantidad) {
      setFieldErrors(nextErrors)
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      const res = await fetch("/api/recursos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newNombre.trim(), cantidad_disponible: cantidadValue }),
      })

      if (res.ok) {
        setNewNombre("")
        setNewCantidad("")
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al crear recurso")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (id: string) => {
    const cantidadValue = normalizeCantidad(editingCantidad)
    const nextErrors: typeof fieldErrors = {}
    if (!editingNombre.trim()) {
      nextErrors.editNombre = { [id]: "Ingresa el nombre del recurso." }
    }
    if (!cantidadValue || cantidadValue <= 0) {
      nextErrors.editCantidad = { [id]: "Ingresa una cantidad válida." }
    }
    if (nextErrors.editNombre || nextErrors.editCantidad) {
      setFieldErrors((prev) => ({
        ...prev,
        editNombre: { ...(prev.editNombre || {}), ...(nextErrors.editNombre || {}) },
        editCantidad: { ...(prev.editCantidad || {}), ...(nextErrors.editCantidad || {}) },
      }))
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors((prev) => ({
      ...prev,
      editNombre: { ...(prev.editNombre || {}), [id]: "" },
      editCantidad: { ...(prev.editCantidad || {}), [id]: "" },
    }))

    try {
      const res = await fetch(`/api/recursos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editingNombre.trim(), cantidad_disponible: cantidadValue }),
      })

      if (res.ok) {
        setEditingId(null)
        setEditingNombre("")
        setEditingCantidad("")
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al actualizar recurso")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar recurso?")) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/recursos/${id}`, { method: "DELETE" })

      if (res.ok) {
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al eliminar recurso")
      }
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (recurso: Recurso) => {
    setEditingId(recurso.id)
    setEditingNombre(recurso.nombre)
    setEditingCantidad(recurso.cantidad_disponible)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingNombre("")
    setEditingCantidad("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recursos de servicios</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
        <div>
          <Input
            placeholder="Nuevo recurso"
            value={newNombre}
            onChange={(e) => {
              setNewNombre(e.target.value)
              if (fieldErrors.newNombre) setFieldErrors((prev) => ({ ...prev, newNombre: undefined }))
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            disabled={loading}
          />
          {fieldErrors.newNombre && <p className="text-xs text-destructive mt-1">{fieldErrors.newNombre}</p>}
        </div>
        <div>
          <Input
            type="number"
            min={1}
            step={1}
            placeholder="Cantidad"
            value={newCantidad}
            onChange={(e) => {
              setNewCantidad(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))
              if (fieldErrors.newCantidad) setFieldErrors((prev) => ({ ...prev, newCantidad: undefined }))
            }}
            disabled={loading}
          />
          {fieldErrors.newCantidad && <p className="text-xs text-destructive mt-1">{fieldErrors.newCantidad}</p>}
        </div>
        <Button onClick={handleCreate} disabled={loading} className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      <div className="space-y-2">
        {(recursos || []).map((recurso) => (
          <div key={recurso.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            {editingId === recurso.id ? (
              <>
                <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_140px]">
                  <div>
                    <Input
                      value={editingNombre}
                      onChange={(e) => {
                        setEditingNombre(e.target.value)
                        if (fieldErrors.editNombre?.[recurso.id]) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            editNombre: { ...(prev.editNombre || {}), [recurso.id]: "" },
                          }))
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate(recurso.id)
                        if (e.key === "Escape") cancelEdit()
                      }}
                      disabled={loading}
                    />
                    {fieldErrors.editNombre?.[recurso.id] && (
                      <p className="text-xs text-destructive mt-1">{fieldErrors.editNombre?.[recurso.id]}</p>
                    )}
                  </div>
                  <div>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={editingCantidad}
                      onChange={(e) => {
                        setEditingCantidad(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))
                        if (fieldErrors.editCantidad?.[recurso.id]) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            editCantidad: { ...(prev.editCantidad || {}), [recurso.id]: "" },
                          }))
                        }
                      }}
                      disabled={loading}
                    />
                    {fieldErrors.editCantidad?.[recurso.id] && (
                      <p className="text-xs text-destructive mt-1">{fieldErrors.editCantidad?.[recurso.id]}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdate(recurso.id)}
                    disabled={loading}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={loading}>
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="font-medium">{recurso.nombre}</span>
                  <p className="text-xs text-muted-foreground">Cantidad: {recurso.cantidad_disponible}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(recurso)} disabled={loading}>
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(recurso.id)}
                    disabled={loading}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {(!recursos || recursos.length === 0) && (
          <p className="text-sm text-muted-foreground">No hay recursos creados.</p>
        )}
      </div>
    </div>
  )
}
