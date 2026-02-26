export const MAX_TURNO_PAST_SCHEDULE_HOURS = 24
const HOUR_MS = 60 * 60 * 1000
export const MAX_TURNO_PAST_SCHEDULE_MS = MAX_TURNO_PAST_SCHEDULE_HOURS * HOUR_MS

export const isWithinPastSchedulingWindow = (startAt: Date, now: Date = new Date()) => {
  return startAt.getTime() >= now.getTime() - MAX_TURNO_PAST_SCHEDULE_MS
}
