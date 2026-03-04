import { z } from "zod"

export const DECLARACION_CAMPO_TIPOS = ["text", "textarea", "number", "date", "yes_no", "select"] as const
export type DeclaracionCampoTipo = (typeof DECLARACION_CAMPO_TIPOS)[number]

export type DeclaracionCampo = {
  id: string
  label: string
  tipo: DeclaracionCampoTipo
  requerido: boolean
  placeholder?: string | null
  ayuda?: string | null
  opciones?: string[]
}

const sanitizeFieldId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")

const declaracionCampoSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  tipo: z.enum(DECLARACION_CAMPO_TIPOS),
  requerido: z.boolean().optional(),
  placeholder: z.string().optional().nullable(),
  ayuda: z.string().optional().nullable(),
  opciones: z.array(z.string()).optional(),
})

export const declaracionPlantillaSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional().nullable(),
  texto_intro: z.string().min(1),
  requiere_firma: z.boolean().optional(),
  activa: z.boolean().optional(),
  campos: z.array(declaracionCampoSchema).min(1),
})

export const normalizeDeclaracionCampos = (camposRaw: unknown): DeclaracionCampo[] => {
  const parsed = z.array(declaracionCampoSchema).safeParse(camposRaw)
  if (!parsed.success) return []
  const seenIds = new Set<string>()
  const sanitized = parsed.data
    .map((field) => {
      const id = sanitizeFieldId(field.id || field.label || "")
      if (!id) return null
      if (seenIds.has(id)) return null
      seenIds.add(id)

      const opciones =
        field.tipo === "select"
          ? (Array.isArray(field.opciones) ? field.opciones : [])
              .map((option) => String(option || "").trim())
              .filter(Boolean)
          : undefined

      if (field.tipo === "select" && (!opciones || opciones.length < 2)) return null

      return {
        id,
        label: String(field.label || "").trim(),
        tipo: field.tipo,
        requerido: Boolean(field.requerido),
        placeholder: field.placeholder ? String(field.placeholder).trim() : null,
        ayuda: field.ayuda ? String(field.ayuda).trim() : null,
        opciones,
      } satisfies DeclaracionCampo
    })
    .filter(Boolean) as DeclaracionCampo[]

  return sanitized
}

export const validateDeclaracionRespuestas = (
  campos: DeclaracionCampo[],
  respuestasRaw: Record<string, unknown> | null | undefined,
) => {
  const respuestas = respuestasRaw && typeof respuestasRaw === "object" ? respuestasRaw : {}
  const normalized: Record<string, string> = {}
  const errors: string[] = []

  campos.forEach((campo) => {
    const rawValue = respuestas[campo.id]
    const value = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim()
    const hasValue = value.length > 0

    if (campo.requerido && !hasValue) {
      errors.push(`El campo "${campo.label}" es obligatorio.`)
      return
    }
    if (!hasValue) {
      normalized[campo.id] = ""
      return
    }

    if (campo.tipo === "number") {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        errors.push(`El campo "${campo.label}" debe ser numérico.`)
        return
      }
      normalized[campo.id] = String(parsed)
      return
    }

    if (campo.tipo === "date") {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) {
        errors.push(`El campo "${campo.label}" tiene una fecha inválida.`)
        return
      }
      normalized[campo.id] = value
      return
    }

    if (campo.tipo === "yes_no") {
      const lowered = value.toLowerCase()
      if (!["si", "no", "yes", "true", "false", "0", "1"].includes(lowered)) {
        errors.push(`El campo "${campo.label}" debe ser SI o NO.`)
        return
      }
      normalized[campo.id] =
        lowered === "si" || lowered === "yes" || lowered === "true" || lowered === "1" ? "si" : "no"
      return
    }

    if (campo.tipo === "select") {
      const opciones = Array.isArray(campo.opciones) ? campo.opciones : []
      if (opciones.length > 0 && !opciones.includes(value)) {
        errors.push(`El campo "${campo.label}" tiene una opción inválida.`)
        return
      }
    }

    normalized[campo.id] = value
  })

  return {
    valid: errors.length === 0,
    errors,
    respuestas: normalized,
  }
}
