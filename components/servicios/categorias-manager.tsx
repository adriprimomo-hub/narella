"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PencilIcon, PlusIcon, Trash2Icon, XIcon, CheckIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export type Categoria = {
  id: string
  nombre: string
  created_at?: string
  updated_at?: string
}

interface CategoriasManagerProps {
  onClose?: () => void
}

export function CategoriasManager({ onClose }: CategoriasManagerProps) {
  const { data: categorias, mutate } = useSWR<Categoria[]>("/api/categorias", fetcher)
  const [newNombre, setNewNombre] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNombre, setEditingNombre] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ newNombre?: string; editNombre?: Record<string, string> }>({})

  const handleCreate = async () => {
    if (!newNombre.trim()) {
      setFieldErrors({ newNombre: "Ingresa un nombre para la categoría." })
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newNombre.trim() }),
      })

      if (res.ok) {
        setNewNombre("")
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al crear categoría")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editingNombre.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        editNombre: { ...(prev.editNombre || {}), [id]: "Ingresa un nombre para la categoría." },
      }))
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors((prev) => ({ ...prev, editNombre: { ...(prev.editNombre || {}), [id]: "" } }))

    try {
      const res = await fetch(`/api/categorias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editingNombre.trim() }),
      })

      if (res.ok) {
        setEditingId(null)
        setEditingNombre("")
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al actualizar categoría")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar categoría?")) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/categorias/${id}`, { method: "DELETE" })

      if (res.ok) {
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || "Error al eliminar categoría")
      }
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (categoria: Categoria) => {
    setEditingId(categoria.id)
    setEditingNombre(categoria.nombre)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingNombre("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Categorías de servicios</h3>
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

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Nueva categoría"
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
        <Button onClick={handleCreate} disabled={loading} className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      <div className="space-y-2">
        {(categorias || []).map((categoria) => (
          <div
            key={categoria.id}
            className="flex items-center justify-between gap-2 rounded-lg border p-3"
          >
            {editingId === categoria.id ? (
              <>
                <div className="flex-1">
                  <Input
                    value={editingNombre}
                    onChange={(e) => {
                      setEditingNombre(e.target.value)
                      if (fieldErrors.editNombre?.[categoria.id]) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          editNombre: { ...(prev.editNombre || {}), [categoria.id]: "" },
                        }))
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(categoria.id)
                      if (e.key === "Escape") cancelEdit()
                    }}
                    disabled={loading}
                  />
                  {fieldErrors.editNombre?.[categoria.id] && (
                    <p className="text-xs text-destructive mt-1">{fieldErrors.editNombre?.[categoria.id]}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdate(categoria.id)}
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
                <span className="font-medium">{categoria.nombre}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(categoria)}
                    disabled={loading}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(categoria.id)}
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
        {(!categorias || categorias.length === 0) && (
          <p className="text-sm text-muted-foreground">No hay categorías creadas.</p>
        )}
      </div>
    </div>
  )
}
