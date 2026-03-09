"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { showSystemConfirm } from "@/lib/system-dialogs"
import { PencilIcon, PlusIcon, Trash2Icon, XIcon, CheckIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export type TipoProfesional = {
  id: string
  nombre: string
  created_at?: string
  updated_at?: string
}

interface TiposProfesionalesManagerProps {
  onClose?: () => void
}

export function TiposProfesionalesManager({ onClose }: TiposProfesionalesManagerProps) {
  const { data: tipos, mutate } = useSWR<TipoProfesional[]>("/api/tipos-profesionales", fetcher)
  const [newNombre, setNewNombre] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNombre, setEditingNombre] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ newNombre?: string; editNombre?: Record<string, string> }>({})

  const handleCreate = async () => {
    if (!newNombre.trim()) {
      setFieldErrors({ newNombre: "Ingresa un nombre para el tipo profesional." })
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors({})
    try {
      const res = await fetch("/api/tipos-profesionales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newNombre.trim() }),
      })
      if (res.ok) {
        setNewNombre("")
        mutate()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || "Error al crear tipo profesional")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editingNombre.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        editNombre: { ...(prev.editNombre || {}), [id]: "Ingresa un nombre para el tipo profesional." },
      }))
      return
    }
    setLoading(true)
    setError(null)
    setFieldErrors((prev) => ({ ...prev, editNombre: { ...(prev.editNombre || {}), [id]: "" } }))
    try {
      const res = await fetch(`/api/tipos-profesionales/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editingNombre.trim() }),
      })
      if (res.ok) {
        setEditingId(null)
        setEditingNombre("")
        mutate()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || "Error al actualizar tipo profesional")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await showSystemConfirm("Eliminar tipo profesional?"))) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tipos-profesionales/${id}`, { method: "DELETE" })
      if (res.ok) {
        mutate()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || "Error al eliminar tipo profesional")
      }
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (tipo: TipoProfesional) => {
    setEditingId(tipo.id)
    setEditingNombre(tipo.nombre)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingNombre("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tipos profesionales</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Nuevo tipo profesional"
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
        {(tipos || []).map((tipo) => (
          <div key={tipo.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            {editingId === tipo.id ? (
              <>
                <div className="flex-1">
                  <Input
                    value={editingNombre}
                    onChange={(e) => {
                      setEditingNombre(e.target.value)
                      if (fieldErrors.editNombre?.[tipo.id]) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          editNombre: { ...(prev.editNombre || {}), [tipo.id]: "" },
                        }))
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(tipo.id)
                      if (e.key === "Escape") cancelEdit()
                    }}
                    disabled={loading}
                  />
                  {fieldErrors.editNombre?.[tipo.id] && <p className="text-xs text-destructive mt-1">{fieldErrors.editNombre?.[tipo.id]}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleUpdate(tipo.id)} disabled={loading}>
                    <CheckIcon className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={loading}>
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="font-medium">{tipo.nombre}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(tipo)} disabled={loading}>
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(tipo.id)}
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
        {(!tipos || tipos.length === 0) && <p className="text-sm text-muted-foreground">No hay tipos profesionales creados.</p>}
      </div>
    </div>
  )
}
