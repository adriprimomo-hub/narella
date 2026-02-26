"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { TurnoForm } from "./turno-form"
import { TurnoCard } from "./turno-card"
import type { Cliente } from "../clientes/clientes-list"
import type { Servicio } from "../servicios/servicios-list"
import type { Empleada, HorarioLaboral } from "../empleadas/types"
import { formatDate, formatDateRange, formatDateTime } from "@/lib/date-format"

const fetcher = async <T,>(url: string): Promise<T[]> => {
  const res = await fetch(url)
  const data = await res.json()

  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data

  console.warn("Respuesta inesperada del endpoint", url, data)
  return []
}

const fetcherObject = <T,>(url: string): Promise<T> => fetch(url).then((res) => res.json())

const confirmacionBadge: Record<string, string> = {
  no_enviada: "bg-muted text-muted-foreground",
  enviada: "bg-secondary text-foreground",
  confirmado: "bg-primary/10 text-primary",
  cancelado: "bg-destructive/10 text-destructive",
}

const confirmacionLabel: Record<string, string> = {
  no_enviada: "Sin confirmar",
  enviada: "Confirmación enviada",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
}

const confirmacionCompactLabel: Record<string, string> = {
  no_enviada: "Sin conf.",
  enviada: "Enviada",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
}

const formatLabel = (value: string) =>
  value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")

const padDatePart = (value: number) => value.toString().padStart(2, "0")
const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
const SLOT_MINUTES = 30
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 20
const SLOT_HEIGHT = 52
const formatForInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const getWeekStart = (date: Date) => {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = (day + 6) % 7
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - diff)
  return copy
}

const addDays = (date: Date, amount: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

const formatDay = (date: Date) => formatDate(date)

const getTurnoDuration = (turno: Turno) =>
  turno.duracion_minutos || turno.servicio_final?.duracion_minutos || turno.servicios?.duracion_minutos || 30

type EmpleadaAusencia = {
  id: string
  empleada_id: string
  fecha_desde: string
  fecha_hasta: string
  hora_desde?: string | null
  hora_hasta?: string | null
  motivo: string
  descripcion?: string | null
}

const esAusenciaDiaCompleto = (ausencia: EmpleadaAusencia) => {
  return !ausencia.hora_desde || !ausencia.hora_hasta
}

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null
  const [hoursRaw, minutesRaw = "0"] = value.split(":")
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const buildAusenciaDetalle = (ausencia: EmpleadaAusencia) => {
  const motivo = ausencia.motivo ? formatLabel(ausencia.motivo) : "Ausencia"
  const fechas = formatDateRange(ausencia.fecha_desde, ausencia.fecha_hasta)
  const horario =
    ausencia.hora_desde && ausencia.hora_hasta ? `${ausencia.hora_desde} - ${ausencia.hora_hasta}` : "Día completo"
  const descripcion = ausencia.descripcion?.trim()

  return [
    `Ausencia registrada: ${motivo}`,
    fechas ? `Fechas: ${fechas}` : null,
    `Horario: ${horario}`,
    descripcion ? `Detalle: ${descripcion}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export interface Turno {
  id: string
  cliente_id: string
  grupo_id?: string | null
  servicio_id: string
  empleada_id?: string | null
  servicio_final_id?: string | null
  empleada_final_id?: string | null
  fecha_inicio: string
  fecha_fin: string
  iniciado_en?: string | null
  finalizado_en?: string | null
  duracion_minutos: number
  estado: string
  asistio: boolean | null
  observaciones: string | null
  confirmacion_estado?: string | null
  confirmacion_enviada_at?: string | null
  clientes: { nombre: string; apellido: string; telefono: string }
  servicios: {
    id: string
    nombre: string
    precio: number
    duracion_minutos: number
    tipo?: string
  }
  servicio_final?: {
    id: string
    nombre: string
    precio: number
    duracion_minutos: number
    tipo?: string
  }
  empleadas?: { id: string; nombre: string; apellido?: string | null }
  empleada_final?: { id: string; nombre: string; apellido?: string | null }
  minutos_tarde?: number | null
  penalidad_monto?: number | null
  penalidad_motivo?: string | null
  creado_por?: string | null
  creado_por_username?: string | null
  servicios_agregados?: {
    servicio_id: string
    cantidad: number
    precio_unitario: number
    origen_staff?: boolean
    agregado_por_empleada_id?: string | null
    agregado_por_user_id?: string | null
  }[]
  productos_agregados?: {
    producto_id: string
    cantidad: number
    precio_unitario: number
    origen_staff?: boolean
    agregado_por_empleada_id?: string | null
    agregado_por_user_id?: string | null
    turno_id_origen?: string | null
  }[]
  foto_trabajo_disponible?: boolean
}

type Columna = { id: string; nombre: string; activa: boolean; horario?: HorarioLaboral | null; ausenciasParciales?: EmpleadaAusencia[] }

export function TurnosGrid() {
  const { data: turnos = [], mutate } = useSWR<Turno[]>("/api/turnos", fetcher)
  const { data: clientes = [] } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const { data: servicios = [] } = useSWR<Servicio[]>("/api/servicios", fetcher)
  const { data: empleadas = [] } = useSWR<Empleada[]>("/api/empleadas", fetcher)
  const { data: ausencias = [] } = useSWR<EmpleadaAusencia[]>("/api/empleadas/ausencias", fetcher)
  const { data: config } = useSWR<{ horario_local?: (HorarioLaboral & { activo?: boolean })[]; rol?: string }>(
    "/api/config",
    fetcherObject,
  )
  const isAdmin = config?.rol === "admin"

  const [nowTick, setNowTick] = useState(() => Date.now())
  const [showForm, setShowForm] = useState(false)
  const [createData, setCreateData] = useState<{ fecha: string; empleada_id: string | null }>({ fecha: "", empleada_id: null })
  const [createPreview, setCreatePreview] = useState<{ fecha: string; empleada_id: string | null }>({ fecha: "", empleada_id: null })
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [filterCliente, setFilterCliente] = useState("all")
  const [selectedTurnoId, setSelectedTurnoId] = useState<string | null>(null)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [selectedSlot, setSelectedSlot] = useState<{ columnaId: string; top: number } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [iniciandoId, setIniciandoId] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)), [currentWeekStart])
  const selectedKey = toDateKey(selectedDate)
  const turnosTotalesPorDia = useMemo(() => {
    const map: Record<string, number> = {}
    turnos.forEach((turno) => {
      const fecha = new Date(turno.fecha_inicio)
      if (!Number.isFinite(fecha.getTime())) return
      const key = toDateKey(fecha)
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [turnos])
  const turnosDelDia = useMemo(() => {
    const start = new Date(selectedDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    return turnos.filter((turno) => {
      const inicio = new Date(turno.fecha_inicio)
      return Number.isFinite(inicio.getTime()) && inicio >= start && inicio < end
    })
  }, [turnos, selectedDate])
  const turnosDelDiaPorColumna = useMemo(() => {
    const map: Record<string, number> = {}
    turnosDelDia.forEach((turno) => {
      const key = turno.empleada_id || "sin_asignar"
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [turnosDelDia])
  const selectedTurno = useMemo(
    () => (selectedTurnoId ? turnos.find((t) => t.id === selectedTurnoId) || null : null),
    [selectedTurnoId, turnos],
  )
  const selectedGrupoTurnos = useMemo(() => {
    if (!selectedTurno) return []
    if (!selectedTurno.grupo_id) return [selectedTurno]
    return turnos.filter((t) => t.grupo_id === selectedTurno.grupo_id)
  }, [selectedTurno, turnos])

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const turnosEnCurso = useMemo(() => turnos.filter((t) => t.estado === "en_curso"), [turnos])
  const proximos = useMemo(() => {
    const ahora = new Date(nowTick)
    const ventanaFin = new Date(ahora.getTime() + 60 * 60 * 1000)
    const ventanaInicio = new Date(ahora.getTime() - 60 * 60 * 1000)
    return turnos
      .filter((t) => {
        const inicio = new Date(t.fecha_inicio)
        if (!Number.isFinite(inicio.getTime())) return false
        if (t.estado === "cancelado" || t.confirmacion_estado === "cancelado") return false
        return t.estado === "pendiente" && !t.iniciado_en && inicio >= ventanaInicio && inicio <= ventanaFin
      })
      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
  }, [turnos, nowTick])

  const horarioLocalDia = useMemo(() => {
    const dia = selectedDate.getDay()
    const slot = (config?.horario_local || []).find((h) => h.dia === dia && (h.activo ?? true))
    if (!slot || !slot.desde || !slot.hasta) return null
    return { dia: slot.dia, desde: slot.desde, hasta: slot.hasta }
  }, [config?.horario_local, selectedDate])

  const filtrosTurnos = useMemo(() => {
    const start = new Date(selectedDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    return turnos
      .filter((t) => {
        const inicio = new Date(t.fecha_inicio)
        if (!(inicio >= start && inicio < end)) return false
        const term = search.toLowerCase()
        const clienteLabel = `${t.clientes?.nombre || ""} ${t.clientes?.apellido || ""}`.trim()
        const servicioLabel = t.servicio_final?.nombre || t.servicios?.nombre || ""
        const staffLabel = `${t.empleadas?.nombre || ""} ${t.empleadas?.apellido || ""}`.trim()
        const matchSearch =
          clienteLabel.toLowerCase().includes(term) ||
          servicioLabel.toLowerCase().includes(term) ||
          staffLabel.toLowerCase().includes(term)
        const matchEstado = filterEstado === "all" || t.estado === filterEstado
        const matchCliente = filterCliente === "all" || t.cliente_id === filterCliente
        return matchSearch && matchEstado && matchCliente
      })
      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
  }, [turnos, search, filterEstado, filterCliente, selectedDate])

  const horariosPorDia = useMemo(() => {
    const map: Record<string, HorarioLaboral | null> = {}
    const day = selectedDate.getDay()
    empleadas?.forEach((e) => {
      const horario = (e.horarios || []).find((h) => h.dia === day) || null
      map[e.id] = horario
    })
    return map
  }, [empleadas, selectedDate])

  const calendarRange = useMemo(() => {
    const horarios = Object.values(horariosPorDia).filter(Boolean) as HorarioLaboral[]
    if (horarioLocalDia) {
      horarios.push(horarioLocalDia)
    }
    let minMinutes = horarios.length ? Math.min(...horarios.map((h) => parseInt(h.desde.split(":")[0]) * 60 + parseInt(h.desde.split(":")[1] || "0"))) : Infinity
    let maxMinutes = horarios.length ? Math.max(...horarios.map((h) => parseInt(h.hasta.split(":")[0]) * 60 + parseInt(h.hasta.split(":")[1] || "0"))) : -Infinity

    filtrosTurnos.forEach((turno) => {
      const fecha = new Date(turno.fecha_inicio)
      const startMinutes = fecha.getHours() * 60 + fecha.getMinutes()
      const duration = getTurnoDuration(turno)
      minMinutes = Math.min(minMinutes, startMinutes)
      maxMinutes = Math.max(maxMinutes, startMinutes + duration)
    })

    if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes)) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR }
    }

    const startHour = Math.min(DEFAULT_START_HOUR, Math.floor(minMinutes / 60))
    const endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(maxMinutes / 60))

    return {
      startHour,
      endHour: endHour <= startHour ? startHour + 2 : endHour,
    }
  }, [filtrosTurnos, horariosPorDia, horarioLocalDia])

const slots = useMemo(() => {
  const totalMinutes = (calendarRange.endHour - calendarRange.startHour) * 60
  const slotCount = Math.max(1, Math.ceil(totalMinutes / SLOT_MINUTES))

  return Array.from({ length: slotCount }, (_, index) => {
    const minutes = calendarRange.startHour * 60 + index * SLOT_MINUTES
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return {
      label: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
      showLabel: true,
    }
  })
}, [calendarRange])

  const columnas: Columna[] = useMemo(() => {
    const fechaKey = toDateKey(selectedDate)

    // Función para obtener ausencias parciales de una empleada en la fecha
    const getAusenciasParciales = (empleadaId: string) => {
      return ausencias.filter(
        (a) => a.empleada_id === empleadaId &&
               fechaKey >= a.fecha_desde &&
               fechaKey <= a.fecha_hasta &&
               !esAusenciaDiaCompleto(a)
      )
    }

    const activas =
      empleadas
        ?.filter((e) => e.activo)
        ?.filter((e) => {
          const horario = horariosPorDia[e.id]
          if (!horario?.desde || !horario?.hasta) return false
          // Solo filtrar si tiene ausencia de DÍA COMPLETO
          const tieneAusenciaDiaCompleto = ausencias.some(
            (a) => a.empleada_id === e.id &&
                   fechaKey >= a.fecha_desde &&
                   fechaKey <= a.fecha_hasta &&
                   esAusenciaDiaCompleto(a)
          )
          return !tieneAusenciaDiaCompleto
        })
        .map((e) => ({
          id: e.id,
          nombre: [e.nombre, e.apellido].filter(Boolean).join(" "),
          activa: e.activo,
          horario: horariosPorDia[e.id],
          ausenciasParciales: getAusenciasParciales(e.id),
        })) || []

    const haySinAsignar = filtrosTurnos.some((t) => !t.empleada_id)
    return haySinAsignar
      ? [...activas, { id: "sin_asignar", nombre: "Sin asignar", activa: true, horario: null, ausenciasParciales: [] }]
      : activas
  }, [empleadas, filtrosTurnos, horariosPorDia, ausencias, selectedDate])

  const calendarHeight = slots.length * SLOT_HEIGHT
  const calendarColumnCount = Math.max(columnas.length, 1)
  const calendarMinWidth = 90 + calendarColumnCount * 220
  const calendarGridTemplate = `90px repeat(${calendarColumnCount}, minmax(220px, 1fr))`

  const handleShiftWeek = (offset: number) => {
    setCurrentWeekStart((prev) => getWeekStart(addDays(prev, offset * 7)))
    setSelectedDate((prev) => addDays(prev, offset * 7))
  }

  const estaDentroHorarioLocal = (date: Date) => {
    if (!horarioLocalDia) return true
    const [desdeH, desdeM = 0] = horarioLocalDia.desde.split(":").map((v) => Number.parseInt(v, 10) || 0)
    const [hastaH, hastaM = 0] = horarioLocalDia.hasta.split(":").map((v) => Number.parseInt(v, 10) || 0)
    const minutos = date.getHours() * 60 + date.getMinutes()
    const inicio = desdeH * 60 + desdeM
    const fin = hastaH * 60 + hastaM
    return minutos >= inicio && minutos <= fin
  }

  const handlePreviewUpdate = (meta: { fecha_inicio?: string; empleada_id?: string | null }) => {
    setCreatePreview((prev) => {
      const next = {
        fecha: meta.fecha_inicio ?? prev.fecha,
        empleada_id: meta.empleada_id ?? prev.empleada_id,
      }
      return next.fecha === prev.fecha && next.empleada_id === prev.empleada_id ? prev : next
    })
  }

  const handleCreateFromCancel = (turno: Turno) => {
    const fecha = new Date(turno.fecha_inicio)
    if (!Number.isFinite(fecha.getTime())) return
    const empleadaId = turno.empleada_id || turno.empleada_final_id || null
    const fechaForm = formatForInput(fecha)
    setCreateData({ fecha: fechaForm, empleada_id: empleadaId })
    setCreatePreview({ fecha: fechaForm, empleada_id: empleadaId })
    setCreateOpen(true)
  }

  const handleGoToday = () => {
    const today = new Date()
    setSelectedDate(today)
    setCurrentWeekStart(getWeekStart(today))
  }

  const calcularAtraso = (turno: Turno, referencia: Date) => {
    const inicio = new Date(turno.fecha_inicio)
    if (!Number.isFinite(inicio.getTime())) return 0

    let referenciaReal = referencia
    if (turno.iniciado_en) {
      const iniciado = new Date(turno.iniciado_en)
      if (Number.isFinite(iniciado.getTime()) && iniciado.getTime() >= inicio.getTime()) {
        referenciaReal = iniciado
      }
    }

    if (referenciaReal <= inicio) return 0
    const diff = Math.floor((referenciaReal.getTime() - inicio.getTime()) / 60000)
    return Number.isFinite(diff) ? Math.max(0, diff) : 0
  }

  const handleIniciarTurno = async (id: string) => {
    setIniciandoId(id)
    try {
      const res = await fetch(`/api/turnos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "en_curso" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || "No se pudo iniciar el turno")
        return
      }
      mutate()
    } finally {
      setIniciandoId((current) => (current === id ? null : current))
    }
  }

  const handleDelete = async (id: string) => {
    if (!isAdmin) return
    if (!confirm("Cancelar turno?")) return
    await fetch(`/api/turnos/${id}`, { method: "DELETE" })
    mutate()
    if (selectedTurnoId === id) {
      setSelectedTurnoId(null)
    }
  }

  const dayLabel = formatDay(selectedDate)
  const weekLabel = `${formatDate(weekDays[0])} - ${formatDate(weekDays[6])}`
  const totalTurnosDiaSeleccionado = turnosTotalesPorDia[selectedKey] || 0
  const previewFecha = createPreview.fecha || createData.fecha
  const previewEmpleadaId = createPreview.empleada_id ?? createData.empleada_id

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Próximos turnos</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{proximos.length} en ventana</span>
        </CardHeader>
        <CardContent>
          {proximos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin turnos proximos.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clienta</TableHead>
                    <TableHead>Empleada</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead className="text-right">Minutos atraso</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximos.map((turno) => {
                    const ahora = new Date(nowTick)
                    const atraso = calcularAtraso(turno, ahora)
                    const servicio = turno.servicio_final || turno.servicios
                    const staff = turno.empleada_final || turno.empleadas
                    const staffLabel = staff ? [staff.nombre, staff.apellido].filter(Boolean).join(" ") : ""
                    const timeUntilStartMs = new Date(turno.fecha_inicio).getTime() - ahora.getTime()
                    const startTooEarly = timeUntilStartMs > 60 * 60 * 1000
                    return (
                      <TableRow key={`proximo-${turno.id}`}>
                        <TableCell className="font-medium">{`${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim() || "Cliente"}</TableCell>
                        <TableCell>{staffLabel || "Sin asignar"}</TableCell>
                        <TableCell>{servicio?.nombre || "-"}</TableCell>
                        <TableCell className={cn("text-right", atraso > 0 ? "text-[color:var(--status-warning-fg)] font-semibold" : "text-muted-foreground")}>
                          {atraso > 0 ? `${atraso} min` : "0 min"}
                        </TableCell>
                        <TableCell className="text-right">
                          {turno.grupo_id && <span className="mr-2 text-[11px] text-muted-foreground">Simultáneo</span>}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleIniciarTurno(turno.id)}
                            disabled={startTooEarly || iniciandoId === turno.id}
                          >
                            {iniciandoId === turno.id ? "Iniciando..." : "Iniciar turno"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="rounded-[var(--radius-xl)] border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Día</p>
            <p className="text-lg font-semibold capitalize">
              {dayLabel} <span className="text-sm font-medium text-muted-foreground">{totalTurnosDiaSeleccionado} turnos</span>
            </p>
            <p className="text-xs text-muted-foreground">Semana {weekLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => handleShiftWeek(-1)} aria-label="Semana anterior">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <div className="flex gap-1 rounded-full border bg-muted/40 px-1 overflow-x-auto max-w-full md:max-w-none whitespace-nowrap">
              {weekDays.map((day) => {
                const key = toDateKey(day)
                const isSelected = key === selectedKey
                const totalTurnosDia = turnosTotalesPorDia[key] || 0
                return (
                  <Button
                    key={key}
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedDate(day)}
                    className="rounded-full px-3"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                      <span>
                        {day
                          .toLocaleDateString("es-AR", { weekday: "short" })
                          .replace(".", "")}{" "}
                        {day.getDate()}
                      </span>
                      <span className="text-[10px] normal-case text-muted-foreground">
                        {totalTurnosDia} turnos
                      </span>
                    </div>
                  </Button>
                )
              })}
            </div>
            <Button variant="outline" size="icon" onClick={() => handleShiftWeek(1)} aria-label="Semana siguiente">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={handleGoToday} className="gap-2">
              <CalendarDaysIcon className="h-4 w-4" />
              Hoy
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto border-t">
          <div className="w-max" style={{ minWidth: `${calendarMinWidth}px` }}>
            <div
              className="grid border-b bg-muted/30 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: calendarGridTemplate }}
            >
              <div className="px-3 py-4 text-left text-foreground">Horas</div>
              {columnas.map((col) => {
                const totalTurnosColumna = turnosDelDiaPorColumna[col.id] || 0
                return (
                  <div key={col.id} className="border-l-2 border-l-border px-3 py-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold text-foreground">
                          {col.nombre} <span className="font-medium text-muted-foreground">{totalTurnosColumna} turnos</span>
                        </p>
                      </div>
                    </div>
                    {col.horario && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {col.horario.desde} - {col.horario.hasta}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="relative grid" style={{ gridTemplateColumns: calendarGridTemplate }}>
              <div className="bg-muted/20">
                {slots.map((slot, index) => (
                  <div
                    key={`time-${slot.label}`}
                    className={cn(
                      "flex items-center justify-end pr-3 text-[11px] text-muted-foreground border-b border-border",
                      index === 0 && "border-t border-border",
                      index % 2 === 1 && "border-b-2",
                    )}
                    style={{ height: `${SLOT_HEIGHT}px` }}
                  >
                    {slot.showLabel ? <span className="font-semibold">{slot.label}</span> : <span className="opacity-0">.</span>}
                  </div>
                ))}
              </div>

              {columnas.map((col) => {
                const colTurnos = filtrosTurnos.filter((t) => (col.id === "sin_asignar" ? !t.empleada_id : t.empleada_id === col.id))
                const horario = col.horario

                return (
                  <div
                    key={`col-${col.id}`}
                    className="relative border-l-2 border-l-border"
                    style={{ height: `${calendarHeight}px` }}
                  >
                    <div className="absolute inset-0">
                      {/* Fondo verde del horario laboral - se renderiza primero */}
                      {horario && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 bg-[color:var(--status-success-bg)] ring-2 ring-[color:var(--status-success-border)] border-x-2 border-[color:var(--status-success-border)]"
                          style={{
                            top:
                              ((parseInt(horario.desde.split(":")[0]) * 60 + parseInt(horario.desde.split(":")[1] || "0") - calendarRange.startHour * 60) /
                                SLOT_MINUTES) *
                                SLOT_HEIGHT || 0,
                            height:
                              ((parseInt(horario.hasta.split(":")[0]) * 60 + parseInt(horario.hasta.split(":")[1] || "0") -
                                (parseInt(horario.desde.split(":")[0]) * 60 + parseInt(horario.desde.split(":")[1] || "0"))) /
                                SLOT_MINUTES) *
                                SLOT_HEIGHT || 0,
                          }}
                        />
                      )}
                      {/* Franjas blancas para ausencias parciales */}
                      {(col.ausenciasParciales || []).map((ausencia) => {
                        const [desdeH, desdeM] = (ausencia.hora_desde || "00:00").split(":").map(Number)
                        const [hastaH, hastaM] = (ausencia.hora_hasta || "00:00").split(":").map(Number)
                        const topMinutes = desdeH * 60 + desdeM - calendarRange.startHour * 60
                        const heightMinutes = (hastaH * 60 + hastaM) - (desdeH * 60 + desdeM)
                        return (
                          <div
                            key={`ausencia-${ausencia.id}`}
                            className="pointer-events-none absolute left-0 right-0 bg-background/90 border-y-2 border-dashed border-muted-foreground/30"
                            style={{
                              top: (topMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
                              height: (heightMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
                              zIndex: 5,
                            }}
                            title={buildAusenciaDetalle(ausencia)}
                          />
                        )
                      })}
                      {/* Grilla de slots - se renderiza encima para que las líneas sean visibles */}
                      {slots.map((_, idx) => {
                        const slotMinutes = calendarRange.startHour * 60 + idx * SLOT_MINUTES
                        const baseDate = new Date(selectedDate)
                        baseDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0)
                        return (
                          <button
                            key={`grid-${col.id}-${slotMinutes}`}
                            type="button"
                            className="relative w-full text-left transition hover:bg-accent/50"
                            style={{
                              height: `${SLOT_HEIGHT}px`,
                              boxShadow: idx % 2 === 1
                                ? "inset 0 -2px 0 0 rgba(0,0,0,0.15)"
                                : "inset 0 -1px 0 0 rgba(0,0,0,0.08)",
                            }}
                            onClick={() => {
                              if (col.id === "sin_asignar") return
                              const minutes = baseDate.getHours() * 60 + baseDate.getMinutes()
                              const ausenciaEnSlot = (col.ausenciasParciales || []).find((ausencia) => {
                                const desde = parseTimeToMinutes(ausencia.hora_desde)
                                const hasta = parseTimeToMinutes(ausencia.hora_hasta)
                                if (desde == null || hasta == null) return false
                                return minutes >= desde && minutes < hasta
                              })
                              if (ausenciaEnSlot) {
                                alert(buildAusenciaDetalle(ausenciaEnSlot))
                                return
                              }
                              if (!estaDentroHorarioLocal(baseDate)) {
                                alert("Fuera del horario del local para este dia")
                                return
                              }
                              setSelectedSlot({ columnaId: col.id, top: idx * SLOT_HEIGHT })
                              const fechaSeleccionada = formatForInput(baseDate)
                              setCreateData({
                                fecha: fechaSeleccionada,
                                empleada_id: col.id,
                              })
                              setCreatePreview({
                                fecha: fechaSeleccionada,
                                empleada_id: col.id,
                              })
                              setCreateOpen(true)
                            }}
                            title={`${col.nombre} - ${baseDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
                          />
                        )
                      })}
                      {selectedSlot?.columnaId === col.id && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 rounded-md bg-accent/60 ring-1 ring-primary/20"
                          style={{ top: selectedSlot.top, height: SLOT_HEIGHT }}
                        />
                      )}
                    </div>
                    <div className="relative h-full pointer-events-none">
                      {colTurnos.map((turno) => {
                        const servicioUsado = turno.servicio_final || turno.servicios
                        const fecha = new Date(turno.fecha_inicio)
                        const fechaFinTurno = new Date(turno.fecha_fin)
                        const durationByFechaFin = Number.isFinite(fechaFinTurno.getTime())
                          ? Math.round((fechaFinTurno.getTime() - fecha.getTime()) / 60000)
                          : null
                        const duration = Math.max(
                          1,
                          durationByFechaFin && durationByFechaFin > 0 ? durationByFechaFin : getTurnoDuration(turno),
                        )
                        const startMinutes = fecha.getHours() * 60 + fecha.getMinutes()
                        const rangeStartMinutes = calendarRange.startHour * 60
                        const rangeEndMinutes = calendarRange.endHour * 60
                        const totalRangeMinutes = Math.max(1, rangeEndMinutes - rangeStartMinutes)
                        const turnoStartOffset = startMinutes - rangeStartMinutes
                        const turnoEndOffset = turnoStartOffset + duration
                        const visibleStartMinutes = Math.max(0, turnoStartOffset)
                        const visibleEndMinutes = Math.min(totalRangeMinutes, turnoEndOffset)
                        const visibleDurationMinutes = visibleEndMinutes - visibleStartMinutes

                        if (visibleDurationMinutes <= 0) return null

                        const top = (visibleStartMinutes / SLOT_MINUTES) * SLOT_HEIGHT
                        const height = (visibleDurationMinutes / SLOT_MINUTES) * SLOT_HEIGHT
                        const horaInicio = fecha.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                        const horaFinDate =
                          Number.isFinite(fechaFinTurno.getTime()) && fechaFinTurno.getTime() > fecha.getTime()
                            ? fechaFinTurno
                            : new Date(fecha.getTime() + duration * 60000)
                        const horaFin = horaFinDate.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                        const confirmStateRaw = turno.confirmacion_estado || "no_enviada"
                        const isCanceled = turno.estado === "cancelado" || confirmStateRaw === "cancelado"
                        const confirmState = isCanceled ? "cancelado" : confirmStateRaw
                        const confirmLabel = confirmacionCompactLabel[confirmState] ?? formatLabel(confirmState)
                        const staffData = turno.empleada_final || turno.empleadas
                        const staffLabel = staffData ? [staffData.nombre, staffData.apellido].filter(Boolean).join(" ") : "Sin asignar"
                        const clienteLabel = `${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim() || "Cliente"
                        const servicioLabel = servicioUsado?.nombre || turno.servicios?.nombre || "Servicio"
                        const resumen = `${clienteLabel} · ${servicioLabel} · ${staffLabel}${turno.grupo_id ? " · Simultáneo" : ""}`
                        const title = [
                          `${horaInicio} - ${horaFin}`,
                          `Cliente: ${clienteLabel}`,
                          `Servicio: ${servicioLabel}`,
                          `Staff: ${staffLabel}`,
                          `Estado: ${confirmacionLabel[confirmState] ?? formatLabel(confirmState)}`,
                          turno.observaciones ? `Obs: ${turno.observaciones}` : null,
                        ]
                          .filter(Boolean)
                          .join("\n")

                        return (
                          <button
                            key={turno.id}
                            type="button"
                            onClick={() => setSelectedTurnoId(turno.id)}
                            title={title}
                            className={cn(
                              "absolute left-1 right-1 overflow-hidden rounded-[var(--radius-md)] border bg-card/95 px-1.5 py-[3px] text-left shadow-[var(--shadow-xs)] transition hover:border-primary/30 hover:bg-accent/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/30 pointer-events-auto",
                              isCanceled && "border-destructive/40 bg-destructive/5",
                            )}
                            style={{ top: `${top}px`, height: `${height}px` }}
                          >
                            <div
                              className={cn(
                                "flex items-center justify-between gap-1 text-[10px] font-semibold leading-[1.15]",
                                isCanceled ? "text-destructive" : "text-primary",
                              )}
                            >
                              <span className="min-w-0 truncate whitespace-nowrap">
                                {horaInicio} - {horaFin}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0 text-[9px] font-semibold leading-4 capitalize whitespace-nowrap",
                                  confirmacionBadge[confirmState] ?? "bg-secondary text-secondary-foreground",
                                )}
                              >
                                {confirmLabel}
                              </span>
                            </div>
                            <p className={cn("mt-0.5 truncate text-[10.5px] leading-[1.2] text-foreground/95", isCanceled && "line-through text-muted-foreground")}>
                              {resumen}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {filtrosTurnos.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-2">
                  <p className="rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                    Sin turnos
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Sheet open={!!selectedTurnoId} onOpenChange={(open) => !open && setSelectedTurnoId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {selectedTurno && (
            <div className="flex h-full flex-col gap-4 overflow-y-auto pb-6">
              <SheetHeader>
                <SheetTitle>Detalle del turno</SheetTitle>
              </SheetHeader>
              <div className="px-4">
                <TurnoCard
                  turno={selectedTurno}
                  turnosGrupo={selectedGrupoTurnos}
                  onDelete={handleDelete}
                  onRefresh={mutate}
                  onCreateFromCancel={handleCreateFromCancel}
                  clientes={clientes || []}
                  servicios={servicios || []}
                  empleadas={empleadas || []}
                  canDelete={isAdmin}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={createOpen && Boolean(createData.fecha)}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreateData({ fecha: "", empleada_id: null })
            setCreatePreview({ fecha: "", empleada_id: null })
            setSelectedSlot(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo turno</DialogTitle>
            <DialogDescription className="sr-only">Completa los datos para crear un nuevo turno.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {previewFecha ? formatDateTime(previewFecha) : ""}
              {previewEmpleadaId
                ? ` - ${(() => {
                    const staff = empleadas.find((e) => e.id === previewEmpleadaId)
                    return staff ? [staff.nombre, staff.apellido].filter(Boolean).join(" ") : "Staff"
                  })()}`
                : ""}
            </div>
            <TurnoForm
              clientes={clientes || []}
              servicios={servicios || []}
              empleadas={empleadas || []}
              initialFecha={createData.fecha}
              initialEmpleadaId={createData.empleada_id}
              onMetaChange={handlePreviewUpdate}
              onSuccess={() => {
                mutate()
                setCreateData({ fecha: "", empleada_id: null })
                setCreatePreview({ fecha: "", empleada_id: null })
                setSelectedSlot(null)
                setCreateOpen(false)
              }}
              onCancel={() => {
                setCreateOpen(false)
                setCreateData({ fecha: "", empleada_id: null })
                setCreatePreview({ fecha: "", empleada_id: null })
                setSelectedSlot(null)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
