import { describe, expect, it } from "vitest"
import {
  buildStaffTurnosOfrecidos,
  getApproxDailyCapacity,
  getTodayRangeInTimeZone,
} from "@/lib/turnos/staff-agenda"

const AR_TIMEZONE = "America/Argentina/Buenos_Aires"

describe("staff agenda helpers", () => {
  it("builds the current day range using Buenos Aires local time", () => {
    const now = new Date("2026-03-18T02:30:00.000Z")
    const range = getTodayRangeInTimeZone({ now, timeZone: AR_TIMEZONE })

    expect(range.dateKey).toBe("2026-03-17")
    expect(range.start.toISOString()).toBe("2026-03-17T03:00:00.000Z")
    expect(range.end.toISOString()).toBe("2026-03-18T03:00:00.000Z")
  })

  it("calculates approximate capacity with one service per hour", () => {
    expect(
      getApproxDailyCapacity({
        startMinutes: 9 * 60,
        endMinutes: 17 * 60 + 30,
      }),
    ).toBe(8)
  })

  it("does not offer extra slots when the day already reached half of its capacity", () => {
    const now = new Date("2026-03-18T11:00:00.000Z")
    const range = getTodayRangeInTimeZone({ now, timeZone: AR_TIMEZONE })

    const offered = buildStaffTurnosOfrecidos({
      turnos: [
        {
          id: "turno-1",
          fecha_inicio: "2026-03-18T12:00:00.000Z",
          fecha_fin: "2026-03-18T13:00:00.000Z",
          estado: "pendiente",
        },
        {
          id: "turno-2",
          fecha_inicio: "2026-03-18T13:00:00.000Z",
          fecha_fin: "2026-03-18T14:00:00.000Z",
          estado: "pendiente",
        },
        {
          id: "turno-3",
          fecha_inicio: "2026-03-18T14:00:00.000Z",
          fecha_fin: "2026-03-18T15:00:00.000Z",
          estado: "pendiente",
        },
        {
          id: "turno-4",
          fecha_inicio: "2026-03-18T15:00:00.000Z",
          fecha_fin: "2026-03-18T16:00:00.000Z",
          estado: "pendiente",
        },
      ],
      staffHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00" }],
      localHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00", activo: true }],
      staffId: "staff-1",
      now,
      timeZone: AR_TIMEZONE,
    })

    expect(offered).toEqual([])
  })

  it("builds up to two free slots inside the current day without overlapping existing turnos", () => {
    const now = new Date("2026-03-18T15:15:00.000Z")
    const range = getTodayRangeInTimeZone({ now, timeZone: AR_TIMEZONE })

    const offered = buildStaffTurnosOfrecidos({
      turnos: [
        {
          id: "turno-1",
          fecha_inicio: "2026-03-18T13:00:00.000Z",
          fecha_fin: "2026-03-18T14:00:00.000Z",
          estado: "pendiente",
        },
        {
          id: "turno-2",
          fecha_inicio: "2026-03-18T17:00:00.000Z",
          fecha_fin: "2026-03-18T18:30:00.000Z",
          estado: "pendiente",
        },
      ],
      staffHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00" }],
      localHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00", activo: true }],
      staffId: "staff-1",
      now,
      timeZone: AR_TIMEZONE,
    })

    expect(offered).toHaveLength(2)
    expect(offered.map((slot) => slot.fecha_inicio)).toEqual(
      [...offered.map((slot) => slot.fecha_inicio)].sort((left, right) => left.localeCompare(right)),
    )
    expect(
      offered.every((slot) => {
        const start = new Date(slot.fecha_inicio)
        const end = new Date(slot.fecha_fin)
        return start >= range.start && start < range.end && end > start
      }),
    ).toBe(true)
    expect(offered.every((slot) => !["2026-03-18T13:00:00.000Z", "2026-03-18T17:00:00.000Z"].includes(slot.fecha_inicio))).toBe(
      true,
    )
  })

  it("still offers two daily slots even when there are no future hours left", () => {
    const now = new Date("2026-03-18T22:15:00.000Z")
    const range = getTodayRangeInTimeZone({ now, timeZone: AR_TIMEZONE })

    const offered = buildStaffTurnosOfrecidos({
      turnos: [],
      staffHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00" }],
      localHorarios: [{ dia: range.day, desde: "09:00", hasta: "17:00", activo: true }],
      staffId: "staff-1",
      now,
      timeZone: AR_TIMEZONE,
    })

    expect(offered).toHaveLength(2)
    expect(
      offered.every((slot) => {
        const start = new Date(slot.fecha_inicio)
        return start >= range.start && start < range.end
      }),
    ).toBe(true)
  })
})
