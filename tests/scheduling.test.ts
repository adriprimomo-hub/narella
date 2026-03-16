import { describe, expect, it } from "vitest"
import {
  MAX_CLOSED_TURNO_EDIT_HOURS,
  isWithinClosedTurnoEditWindow,
  isWithinPastSchedulingWindow,
} from "@/lib/turnos/scheduling"

describe("turnos scheduling windows", () => {
  it("allows scheduling inside the past scheduling window", () => {
    const now = new Date("2026-03-16T20:00:00.000Z")
    const startAt = new Date("2026-03-15T21:00:00.000Z")
    expect(isWithinPastSchedulingWindow(startAt, now)).toBe(true)
  })

  it("blocks editing closed turnos after the configured window", () => {
    const now = new Date("2026-03-16T20:00:00.000Z")
    const justInsideWindow = new Date(now.getTime() - (MAX_CLOSED_TURNO_EDIT_HOURS - 1) * 60 * 60 * 1000)
    const justOutsideWindow = new Date(now.getTime() - (MAX_CLOSED_TURNO_EDIT_HOURS + 1) * 60 * 60 * 1000)

    expect(isWithinClosedTurnoEditWindow(justInsideWindow, null, now)).toBe(true)
    expect(isWithinClosedTurnoEditWindow(justOutsideWindow, null, now)).toBe(false)
  })

  it("falls back to fecha_fin when finalizado_en is missing", () => {
    const now = new Date("2026-03-16T20:00:00.000Z")
    expect(isWithinClosedTurnoEditWindow(null, "2026-03-16T10:00:00.000Z", now)).toBe(true)
  })
})
