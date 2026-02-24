"use client"

import type React from "react"

import { useState, useId } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Cliente } from "./clientes-list"

interface ClienteFormProps {
  cliente?: Cliente | null
  onSuccess: () => void
}

function buildFormData(cliente?: Cliente | null) {
  return {
    nombre: cliente?.nombre || "",
    apellido: cliente?.apellido || "",
    telefono: cliente?.telefono || "",
    observaciones: cliente?.observaciones || "",
  }
}

export function ClienteForm({ cliente, onSuccess }: ClienteFormProps) {
  const formId = useId()
  const nombreId = `${formId}-nombre`
  const apellidoId = `${formId}-apellido`
  const telefonoId = `${formId}-telefono`
  const observacionesId = `${formId}-observaciones`
  const [formData, setFormData] = useState(() => buildFormData(cliente))
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [errors, setErrors] = useState<{ nombre?: string; apellido?: string; telefono?: string }>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError("")
    setErrors({})

    try {
      const nextErrors: { nombre?: string; apellido?: string; telefono?: string } = {}
      if (!formData.nombre.trim()) nextErrors.nombre = "Ingresa el nombre."
      if (!formData.apellido.trim()) nextErrors.apellido = "Ingresa el apellido."
      if (!formData.telefono.trim()) nextErrors.telefono = "Ingresa el teléfono."
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors)
        return
      }

      const url = cliente ? `/api/clientes/${cliente.id}` : "/api/clientes"
      const method = cliente ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        onSuccess()
        setFormData(buildFormData())
      } else {
        const data = await res.json().catch(() => ({}))
        setFormError(data?.error || "No se pudo guardar la clienta.")
      }
    } catch (error) {
      console.error("Error:", error)
      setFormError("Ocurrió un error al guardar la clienta.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          onChange={(e) => {
            setFormData({ ...formData, telefono: e.target.value })
            if (errors.telefono) setErrors((prev) => ({ ...prev, telefono: undefined }))
          }}
          required
        />
        {errors.telefono && <p className="text-xs text-destructive mt-1">{errors.telefono}</p>}
      </div>
      <div>
        <label htmlFor={observacionesId} className="text-sm font-medium">Observaciones</label>
        <Textarea
          id={observacionesId}
          value={formData.observaciones}
          onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
          rows={3}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Guardando..." : cliente ? "Actualizar" : "Crear cliente"}
      </Button>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
    </form>
  )
}
