import { describe, expect, it } from "vitest"
import { maxSimultaneous, overlaps } from "@/lib/turnos/overlap"

describe("turnos overlap", () => {
  it("detects overlaps and max simultaneous", () => {
    const a = { startMs: 0, endMs: 60 }
    const b = { startMs: 30, endMs: 90 }
    const c = { startMs: 100, endMs: 120 }
    expect(overlaps(a, b)).toBe(true)
    expect(overlaps(a, c)).toBe(false)
    expect(maxSimultaneous([a, b, c])).toBe(2)
  })
})
