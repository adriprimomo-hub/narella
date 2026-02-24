import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { Intervalo, isValidInterval, maxSimultaneous, overlaps } from "@/lib/turnos/overlap"

type DisponibilidadItem = {
  servicio_id: string
  duracion_minutos: number
}

const disponibilidadSchema = z.object({
  fecha_inicio: z.string().min(1),
  turnos: z
    .array(
      z.object({
        servicio_id: z.string().min(1),
        duracion_minutos: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
  excluir_turno_ids: z.array(z.string().min(1)).optional(),
})

export async function POST(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: payload, response: validationResponse } = await validateBody(request, disponibilidadSchema)
  if (validationResponse) return validationResponse
  const fecha_inicio: string = payload.fecha_inicio
  const items: DisponibilidadItem[] = payload.turnos
  const excluirIds: string[] = payload.excluir_turno_ids || []

  const startDate = new Date(fecha_inicio)
  if (!fecha_inicio || Number.isNaN(startDate.getTime()) || items.length === 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const { data: servicios } = await db.from("servicios").select("id, recurso_id").eq("usuario_id", user.id)
  const serviciosMap = new Map<string, { recurso_id?: string | null }>(
    (servicios || []).map((srv: any) => [srv.id, { recurso_id: srv.recurso_id }]),
  )

  const nuevosIntervalosPorRecurso = new Map<string, Intervalo[]>()
  const recursosIds = new Set<string>()

  for (const item of items) {
    const duracion = Number.parseInt(String(item.duracion_minutos))
    if (!item?.servicio_id || !Number.isFinite(duracion) || duracion <= 0) continue
    const recursoId = serviciosMap.get(item.servicio_id)?.recurso_id || null
    if (!recursoId) continue
    const endMs = startDate.getTime() + duracion * 60000
    const intervalo = { startMs: startDate.getTime(), endMs }
    if (!nuevosIntervalosPorRecurso.has(recursoId)) {
      nuevosIntervalosPorRecurso.set(recursoId, [])
    }
    nuevosIntervalosPorRecurso.get(recursoId)?.push(intervalo)
    recursosIds.add(recursoId)
  }

  if (recursosIds.size === 0) {
    return NextResponse.json({ conflictos: [] })
  }

  const intervalosNuevos = Array.from(nuevosIntervalosPorRecurso.values()).flat()
  const minStart = Math.min(...intervalosNuevos.map((i) => i.startMs))
  const maxEnd = Math.max(...intervalosNuevos.map((i) => i.endMs))

  let query = db
    .from("turnos")
    .select("id, servicio_id, servicio_final_id, fecha_inicio, fecha_fin, estado, confirmacion_estado")
    .eq("usuario_id", user.id)
    .lt("fecha_inicio", new Date(maxEnd).toISOString())
    .gt("fecha_fin", new Date(minStart).toISOString())

  const { data: turnos } = await query

  const existentesPorRecurso = new Map<string, Intervalo[]>()

  ;(turnos || [])
    .filter((t: any) => t.estado !== "cancelado" && t.confirmacion_estado !== "cancelado" && !excluirIds.includes(t.id))
    .forEach((turno: any) => {
      const servicioId = turno.servicio_final_id || turno.servicio_id
      const recursoId = serviciosMap.get(servicioId)?.recurso_id || null
      if (!recursoId || !recursosIds.has(recursoId)) return
      const startMs = new Date(turno.fecha_inicio).getTime()
      const endMs = new Date(turno.fecha_fin).getTime()
      const intervalo = { startMs, endMs }
      if (!isValidInterval(intervalo)) return

      const intervalosNuevosRecurso = nuevosIntervalosPorRecurso.get(recursoId) || []
      const overlapsNew = intervalosNuevosRecurso.some((nuevo) => overlaps(intervalo, nuevo))
      if (!overlapsNew) return

      if (!existentesPorRecurso.has(recursoId)) {
        existentesPorRecurso.set(recursoId, [])
      }
      existentesPorRecurso.get(recursoId)?.push(intervalo)
    })

  const { data: recursos } = await db
    .from("recursos")
    .select("id, nombre, cantidad_disponible")
    .eq("usuario_id", user.id)
    .in("id", Array.from(recursosIds))

  const recursosMap = new Map<string, { nombre: string; cantidad_disponible: number }>(
    (recursos || []).map((rec: any) => [rec.id, { nombre: rec.nombre, cantidad_disponible: rec.cantidad_disponible }]),
  )

  const conflictos = Array.from(recursosIds).reduce((acc: any[], recursoId) => {
    const recurso = recursosMap.get(recursoId)
    if (!recurso) return acc
    const intervalos = [
      ...(nuevosIntervalosPorRecurso.get(recursoId) || []),
      ...(existentesPorRecurso.get(recursoId) || []),
    ]
    const maxSimultaneos = maxSimultaneous(intervalos)
    const capacidadRaw = Number(recurso.cantidad_disponible)
    const capacidad = Number.isFinite(capacidadRaw) ? capacidadRaw : 0
    if (maxSimultaneos > capacidad) {
      acc.push({
        recurso_id: recursoId,
        recurso_nombre: recurso.nombre,
        cantidad_disponible: capacidad,
        max_simultaneos: maxSimultaneos,
      })
    }
    return acc
  }, [])

  return NextResponse.json({ conflictos })
}
