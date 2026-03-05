"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2Icon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { showSystemConfirm } from "@/lib/system-dialogs"

type DeclaracionCampoTipo = "text" | "textarea" | "number" | "date" | "yes_no" | "select"

type DeclaracionCampoDraft = {
  uid: string
  id: string
  label: string
  tipo: DeclaracionCampoTipo
  requerido: boolean
  placeholder?: string
  ayuda?: string
  opciones?: string
}

type DeclaracionPlantilla = {
  id: string
  nombre: string
  descripcion?: string | null
  texto_intro: string
  requiere_firma?: boolean
  activa?: boolean
  campos: Array<{
    id: string
    label: string
    tipo: DeclaracionCampoTipo
    requerido?: boolean
    placeholder?: string | null
    ayuda?: string | null
    opciones?: string[]
  }>
}

type PlantillaFormState = {
  id?: string
  nombre: string
  descripcion: string
  texto_intro: string
  requiere_firma: boolean
  activa: boolean
  campos: DeclaracionCampoDraft[]
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const createFieldUid = () => `campo-${Math.random().toString(36).slice(2, 10)}`

const createEmptyField = (): DeclaracionCampoDraft => ({
  uid: createFieldUid(),
  id: "",
  label: "",
  tipo: "text",
  requerido: false,
  placeholder: "",
  ayuda: "",
  opciones: "",
})

const createEmptyForm = (): PlantillaFormState => ({
  nombre: "",
  descripcion: "",
  texto_intro: "",
  requiere_firma: true,
  activa: true,
  campos: [createEmptyField()],
})

const mapPlantillaToForm = (plantilla: DeclaracionPlantilla): PlantillaFormState => ({
  id: plantilla.id,
  nombre: plantilla.nombre || "",
  descripcion: plantilla.descripcion || "",
  texto_intro: plantilla.texto_intro || "",
  requiere_firma: Boolean(plantilla.requiere_firma ?? true),
  activa: Boolean(plantilla.activa ?? true),
  campos:
    Array.isArray(plantilla.campos) && plantilla.campos.length
      ? plantilla.campos.map((campo) => ({
          uid: createFieldUid(),
          id: campo.id || "",
          label: campo.label || "",
          tipo: campo.tipo || "text",
          requerido: Boolean(campo.requerido),
          placeholder: campo.placeholder || "",
          ayuda: campo.ayuda || "",
          opciones: Array.isArray(campo.opciones) ? campo.opciones.join(", ") : "",
        }))
      : [createEmptyField()],
})

export function DeclaracionesJuradasManager() {
  const { data: plantillas = [], mutate } = useSWR<DeclaracionPlantilla[]>("/api/declaraciones-juradas/plantillas", fetcher)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<PlantillaFormState>(createEmptyForm())

  const plantillasList = Array.isArray(plantillas) ? plantillas : []
  const totalActivas = useMemo(
    () => plantillasList.filter((item) => item.activa !== false).length,
    [plantillasList],
  )

  const openCreate = () => {
    setForm(createEmptyForm())
    setError(null)
    setOpen(true)
  }

  const openEdit = (plantilla: DeclaracionPlantilla) => {
    setForm(mapPlantillaToForm(plantilla))
    setError(null)
    setOpen(true)
  }

  const handleDelete = async (plantilla: DeclaracionPlantilla) => {
    if (!(await showSystemConfirm(`¿Eliminar declaración jurada "${plantilla.nombre}"?`))) return
    const res = await fetch(`/api/declaraciones-juradas/plantillas/${plantilla.id}`, { method: "DELETE" })
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      alert(payload?.error || "No se pudo eliminar la declaración jurada.")
      return
    }
    mutate()
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      setError("Ingresa un nombre para la declaración jurada.")
      return
    }
    if (!form.texto_intro.trim()) {
      setError("Ingresa el texto principal de la declaración jurada.")
      return
    }
    const normalizedFields = form.campos
      .map((field) => ({
        id: field.id.trim() || field.label.trim(),
        label: field.label.trim(),
        tipo: field.tipo,
        requerido: Boolean(field.requerido),
        placeholder: field.placeholder?.trim() || null,
        ayuda: field.ayuda?.trim() || null,
        opciones:
          field.tipo === "select"
            ? field.opciones
                ?.split(",")
                .map((option) => option.trim())
                .filter(Boolean)
            : undefined,
      }))
      .filter((field) => field.label.length > 0)

    if (normalizedFields.length === 0) {
      setError("Debes agregar al menos un campo.")
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      texto_intro: form.texto_intro.trim(),
      requiere_firma: form.requiere_firma,
      activa: form.activa,
      campos: normalizedFields,
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        form.id ? `/api/declaraciones-juradas/plantillas/${form.id}` : "/api/declaraciones-juradas/plantillas",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const responsePayload = await res.json().catch(() => null)
      if (!res.ok) {
        setError(responsePayload?.error || "No se pudo guardar la declaración jurada.")
        return
      }
      await mutate()
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Declaraciones juradas</h3>
          <p className="text-xs text-muted-foreground">
            {totalActivas} activas de {plantillasList.length} configuradas
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" className="gap-2" onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          Nueva declaración
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {plantillasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay declaraciones configuradas.</p>
          ) : (
            plantillasList.map((plantilla) => (
              <div key={plantilla.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{plantilla.nombre}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={plantilla.activa === false ? "neutral" : "success"}>
                      {plantilla.activa === false ? "Inactiva" : "Activa"}
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(plantilla)}>
                      <PencilIcon className="h-4 w-4 mr-1.5" />
                      Editar
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(plantilla)}>
                      <Trash2Icon className="h-4 w-4 mr-1.5" />
                      Eliminar
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {Array.isArray(plantilla.campos) ? plantilla.campos.length : 0} campos · Firma{" "}
                  {plantilla.requiere_firma === false ? "opcional" : "obligatoria"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar declaración jurada" : "Nueva declaración jurada"}</DialogTitle>
            <DialogDescription>
              Define el texto, campos personalizados y firma para enviar a la clienta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="declaracion-plantilla-nombre" className="text-sm font-medium">
                  Nombre
                </label>
                <Input
                  id="declaracion-plantilla-nombre"
                  value={form.nombre}
                  onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                  placeholder="Ej: Consentimiento depilación láser"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="declaracion-plantilla-descripcion" className="text-sm font-medium">
                  Descripción
                </label>
                <Input
                  id="declaracion-plantilla-descripcion"
                  value={form.descripcion}
                  onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="declaracion-plantilla-intro" className="text-sm font-medium">
                Texto de introducción
              </label>
              <Textarea
                id="declaracion-plantilla-intro"
                value={form.texto_intro}
                onChange={(event) => setForm((prev) => ({ ...prev, texto_intro: event.target.value }))}
                placeholder="Texto legal o informativo para la clienta"
                rows={5}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.requiere_firma}
                  onChange={(event) => setForm((prev) => ({ ...prev, requiere_firma: event.target.checked }))}
                />
                Firma obligatoria
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(event) => setForm((prev) => ({ ...prev, activa: event.target.checked }))}
                />
                Plantilla activa
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Campos</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setForm((prev) => ({ ...prev, campos: [...prev.campos, createEmptyField()] }))}
                >
                  <PlusIcon className="h-4 w-4 mr-1.5" />
                  Agregar campo
                </Button>
              </div>
              <div className="space-y-2">
                {form.campos.map((campo, index) => (
                  <div key={campo.uid} className="rounded-md border p-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        value={campo.label}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.map((item, idx) =>
                              idx === index ? { ...item, label: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="Etiqueta del campo"
                      />
                      <Input
                        value={campo.id}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.map((item, idx) =>
                              idx === index ? { ...item, id: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="ID interno (opcional)"
                      />
                      <Select
                        value={campo.tipo}
                        onValueChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.map((item, idx) =>
                              idx === index ? { ...item, tipo: value as DeclaracionCampoTipo } : item,
                            ),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto corto</SelectItem>
                          <SelectItem value="textarea">Texto largo</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                          <SelectItem value="date">Fecha</SelectItem>
                          <SelectItem value="yes_no">Sí / No</SelectItem>
                          <SelectItem value="select">Lista desplegable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={campo.placeholder || ""}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.map((item, idx) =>
                              idx === index ? { ...item, placeholder: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="Placeholder (opcional)"
                      />
                      <Input
                        value={campo.ayuda || ""}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.map((item, idx) =>
                              idx === index ? { ...item, ayuda: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="Texto de ayuda (opcional)"
                      />
                    </div>
                    {campo.tipo === "select" && (
                      <div className="space-y-1">
                        <Input
                          value={campo.opciones || ""}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              campos: prev.campos.map((item, idx) =>
                                idx === index ? { ...item, opciones: event.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Opciones separadas por coma"
                        />
                        <p className="text-xs text-muted-foreground">
                          Lista desplegable para que la clienta elija una única opción.
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={campo.requerido}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              campos: prev.campos.map((item, idx) =>
                                idx === index ? { ...item, requerido: event.target.checked } : item,
                              ),
                            }))
                          }
                        />
                        Campo obligatorio
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            campos: prev.campos.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={form.campos.length <= 1}
                      >
                        <Trash2Icon className="h-4 w-4 mr-1.5" />
                        Quitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleSave} disabled={loading} className="gap-2">
              {loading ? (
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
