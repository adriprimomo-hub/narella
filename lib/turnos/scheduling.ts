export const MAX_TURNO_PAST_SCHEDULE_HOURS = 24
const HOUR_MS = 60 * 60 * 1000
export const MAX_TURNO_PAST_SCHEDULE_MS = MAX_TURNO_PAST_SCHEDULE_HOURS * HOUR_MS
export const MAX_CLOSED_TURNO_EDIT_HOURS = 24
export const MAX_CLOSED_TURNO_EDIT_MS = MAX_CLOSED_TURNO_EDIT_HOURS * HOUR_MS

const toValidDate = (value: Date | string | null | undefined) => {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export const isWithinPastSchedulingWindow = (startAt: Date, now: Date = new Date()) => {
  return startAt.getTime() >= now.getTime() - MAX_TURNO_PAST_SCHEDULE_MS
}

export const isWithinClosedTurnoEditWindow = (
  closedAt?: Date | string | null,
  fallbackAt?: Date | string | null,
  now: Date = new Date(),
) => {
  const reference = toValidDate(closedAt) ?? toValidDate(fallbackAt)
  if (!reference || !Number.isFinite(now.getTime())) return false
  return reference.getTime() >= now.getTime() - MAX_CLOSED_TURNO_EDIT_MS
}
