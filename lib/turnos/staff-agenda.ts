const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires"

type DateParts = { year: number; month: number; day: number }
type TimeParts = DateParts & { hour: number; minute: number; second: number }

export type StaffHorario = {
  dia: number
  desde?: string | null
  hasta?: string | null
  activo?: boolean | null
}

export type StaffAgendaTurnoBase = {
  id: string
  fecha_inicio: string
  fecha_fin?: string | null
  duracion_minutos?: number | null
  estado?: string | null
  confirmacion_estado?: string | null
}

export type StaffTurnoOfrecido = {
  id: string
  tipo: "ofrecido"
  estado: "ofrecido"
  fecha_inicio: string
  fecha_fin: string
  etiqueta: string
}

type WorkingWindow = { startMinutes: number; endMinutes: number }
type OfferedCandidate = {
  start: Date
  end: Date
  startMinutes: number
  durationMinutes: number
  weight: number
}

const OFFERED_SLOT_STEP_MINUTES = 30
const OFFERED_SLOT_DURATIONS = [60, 90, 120]
const OFFERED_SLOT_GAP_MINUTES = 30

const pad2 = (value: number) => String(value).padStart(2, "0")

const buildDateKey = (parts: DateParts) => `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`

export const getDatePartsInTimeZone = (date: Date, timeZone = DEFAULT_TIMEZONE): DateParts => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value
  })
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

const addDays = (parts: DateParts, days: number): DateParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

const getTimePartsInTimeZone = (date: Date, timeZone = DEFAULT_TIMEZONE): TimeParts => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value
  })
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

const getTimeZoneOffsetMs = (date: Date, timeZone = DEFAULT_TIMEZONE) => {
  const parts = getTimePartsInTimeZone(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

export const zonedTimeToUtc = (
  timeZone = DEFAULT_TIMEZONE,
  parts: DateParts,
  hour = 0,
  minute = 0,
  second = 0,
) => {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second))
  const offset = getTimeZoneOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - offset)
}

export const getTodayRangeInTimeZone = (args?: { now?: Date; timeZone?: string }) => {
  const timeZone = args?.timeZone || DEFAULT_TIMEZONE
  const now = args?.now || new Date()
  const today = getDatePartsInTimeZone(now, timeZone)
  const tomorrow = addDays(today, 1)
  const start = zonedTimeToUtc(timeZone, today, 0, 0, 0)
  const end = zonedTimeToUtc(timeZone, tomorrow, 0, 0, 0)
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
  return {
    start,
    end,
    day,
    dateKey: buildDateKey(today),
    parts: today,
    timeZone,
  }
}

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null
  const [hoursRaw, minutesRaw = "0"] = String(value).split(":")
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const resolveSlotForDay = (horarios: StaffHorario[] | null | undefined, day: number) => {
  if (!Array.isArray(horarios) || horarios.length === 0) return null
  return (
    horarios.find((slot) => {
      if (Number(slot?.dia) !== day) return false
      if (slot?.activo === false) return false
      return Boolean(slot?.desde && slot?.hasta)
    }) || null
  )
}

const resolveWorkingWindow = (args: {
  day: number
  staffHorarios?: StaffHorario[] | null
  localHorarios?: StaffHorario[] | null
}): WorkingWindow | null => {
  const staffSlot = resolveSlotForDay(args.staffHorarios, args.day)
  if (!staffSlot) return null

  const staffStart = parseTimeToMinutes(staffSlot.desde)
  const staffEnd = parseTimeToMinutes(staffSlot.hasta)
  if (staffStart == null || staffEnd == null || staffEnd <= staffStart) return null

  const localHasRules = Array.isArray(args.localHorarios) && args.localHorarios.length > 0
  if (!localHasRules) {
    return {
      startMinutes: staffStart,
      endMinutes: staffEnd,
    }
  }

  const localSlot = resolveSlotForDay(args.localHorarios, args.day)
  if (!localSlot) return null

  const localStart = parseTimeToMinutes(localSlot.desde)
  const localEnd = parseTimeToMinutes(localSlot.hasta)
  if (localStart == null || localEnd == null || localEnd <= localStart) return null

  const startMinutes = Math.max(staffStart, localStart)
  const endMinutes = Math.min(staffEnd, localEnd)
  if (endMinutes <= startMinutes) return null

  return { startMinutes, endMinutes }
}

export const getApproxDailyCapacity = (window: WorkingWindow | null) => {
  if (!window) return 0
  return Math.max(0, Math.floor((window.endMinutes - window.startMinutes) / 60))
}

const isVisibleRealTurno = (turno: StaffAgendaTurnoBase) =>
  turno.estado !== "cancelado" && turno.confirmacion_estado !== "cancelado"

const getTurnoInterval = (turno: StaffAgendaTurnoBase) => {
  const start = new Date(turno.fecha_inicio)
  if (!Number.isFinite(start.getTime())) return null

  const endByFecha = turno.fecha_fin ? new Date(turno.fecha_fin) : null
  if (endByFecha && Number.isFinite(endByFecha.getTime()) && endByFecha.getTime() > start.getTime()) {
    return { start, end: endByFecha }
  }

  const duration = Number(turno.duracion_minutos || 60)
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60
  return {
    start,
    end: new Date(start.getTime() + safeDuration * 60_000),
  }
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && aEnd > bStart

const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const hasIntervalConflict = (
  interval: { start: Date; end: Date },
  others: Array<{ start: Date; end: Date }>,
  gapMinutes = 0,
) => {
  const gapMs = Math.max(0, gapMinutes) * 60_000

  return others.some((other) =>
    overlaps(
      new Date(interval.start.getTime() - gapMs),
      new Date(interval.end.getTime() + gapMs),
      other.start,
      other.end,
    ),
  )
}

const pickCandidate = (
  candidates: OfferedCandidate[],
  selected: OfferedCandidate[],
  gapMinutes = 0,
): OfferedCandidate | null => {
  const usedDurations = new Set(selected.map((item) => item.durationMinutes))
  const groups =
    usedDurations.size > 0
      ? [
          candidates.filter((candidate) => !usedDurations.has(candidate.durationMinutes)),
          candidates,
        ]
      : [candidates]

  for (const group of groups) {
    for (const candidate of group) {
      if (hasIntervalConflict(candidate, selected, gapMinutes)) continue
      return candidate
    }
  }

  return null
}

export const buildStaffTurnosOfrecidos = (args: {
  turnos: StaffAgendaTurnoBase[]
  staffHorarios?: StaffHorario[] | null
  localHorarios?: StaffHorario[] | null
  staffId: string
  now?: Date
  timeZone?: string
  limit?: number
}) => {
  const timeZone = args.timeZone || DEFAULT_TIMEZONE
  const now = args.now || new Date()
  const limit = Math.max(0, args.limit ?? 2)
  if (!args.staffId || limit === 0) return [] as StaffTurnoOfrecido[]

  const todayRange = getTodayRangeInTimeZone({ now, timeZone })
  const workingWindow = resolveWorkingWindow({
    day: todayRange.day,
    staffHorarios: args.staffHorarios,
    localHorarios: args.localHorarios,
  })
  const capacity = getApproxDailyCapacity(workingWindow)
  if (!workingWindow || capacity <= 0) return [] as StaffTurnoOfrecido[]

  const turnosVisibles = (args.turnos || []).filter((turno) => {
    if (!isVisibleRealTurno(turno)) return false
    const start = new Date(turno.fecha_inicio)
    return Number.isFinite(start.getTime()) && start >= todayRange.start && start < todayRange.end
  })

  if (turnosVisibles.length >= capacity / 2) {
    return [] as StaffTurnoOfrecido[]
  }

  const occupiedIntervals = turnosVisibles
    .map((turno) => getTurnoInterval(turno))
    .filter(Boolean) as Array<{ start: Date; end: Date }>

  const candidates: OfferedCandidate[] = []
  for (
    let cursor = workingWindow.startMinutes;
    cursor + Math.min(...OFFERED_SLOT_DURATIONS) <= workingWindow.endMinutes;
    cursor += OFFERED_SLOT_STEP_MINUTES
  ) {
    for (const durationMinutes of OFFERED_SLOT_DURATIONS) {
      if (cursor + durationMinutes > workingWindow.endMinutes) continue

      const start = new Date(todayRange.start.getTime() + cursor * 60_000)
      const end = new Date(start.getTime() + durationMinutes * 60_000)
      const hasOverlap = occupiedIntervals.some((interval) => overlaps(start, end, interval.start, interval.end))
      if (hasOverlap) continue

      candidates.push({
        start,
        end,
        startMinutes: cursor,
        durationMinutes,
        weight: hashString(`${todayRange.dateKey}:${args.staffId}:${cursor}:${durationMinutes}`),
      })
    }
  }

  const orderedCandidates = [...candidates].sort((left, right) => {
    if (left.weight !== right.weight) return left.weight - right.weight
    if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes
    return right.durationMinutes - left.durationMinutes
  })

  const selected: OfferedCandidate[] = []
  const totalMinutes = workingWindow.endMinutes - workingWindow.startMinutes
  const segmentCount = Math.max(1, limit)

  for (let segmentIndex = 0; segmentIndex < segmentCount && selected.length < limit; segmentIndex += 1) {
    const segmentStart =
      workingWindow.startMinutes + Math.floor((totalMinutes * segmentIndex) / segmentCount)
    const segmentEnd =
      workingWindow.startMinutes + Math.floor((totalMinutes * (segmentIndex + 1)) / segmentCount)

    const segmentCandidates = orderedCandidates.filter((candidate) => {
      if (candidate.startMinutes < segmentStart) return false
      if (segmentIndex === segmentCount - 1) return candidate.startMinutes <= segmentEnd
      return candidate.startMinutes < segmentEnd
    })

    const picked = pickCandidate(segmentCandidates, selected, OFFERED_SLOT_GAP_MINUTES)
    if (picked) selected.push(picked)
  }

  if (selected.length < limit) {
    for (const gapMinutes of [OFFERED_SLOT_GAP_MINUTES, 0]) {
      while (selected.length < limit) {
        const picked = pickCandidate(orderedCandidates, selected, gapMinutes)
        if (!picked) break
        selected.push(picked)
      }
    }
  }

  return selected
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ start, end, durationMinutes }) => ({
      id: `ofrecido-${args.staffId}-${start.toISOString()}-${durationMinutes}`,
      tipo: "ofrecido" as const,
      estado: "ofrecido" as const,
      fecha_inicio: start.toISOString(),
      fecha_fin: end.toISOString(),
      etiqueta: "Turno ofrecido",
    }))
}
