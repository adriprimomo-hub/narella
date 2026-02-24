import { describe, expect, it } from "vitest"
import { DEFAULT_USER_ROLE, normalizeRole, roleLabel } from "@/lib/roles"

describe("roles", () => {
  it("normalizes known roles", () => {
    expect(normalizeRole("admin")).toBe("admin")
    expect(normalizeRole("staff")).toBe("staff")
    expect(normalizeRole("caja")).toBe("caja")
    expect(normalizeRole("solo_turnos")).toBe("solo_turnos")
    expect(normalizeRole("recepcion")).toBe("recepcion")
  })

  it("falls back to default for unknown roles", () => {
    expect(normalizeRole("unknown")).toBe(DEFAULT_USER_ROLE)
    expect(normalizeRole(null)).toBe(DEFAULT_USER_ROLE)
  })

  it("labels roles correctly", () => {
    expect(roleLabel("admin")).toBe("Administrador")
    expect(roleLabel("staff")).toBe("Staff")
    expect(roleLabel("caja")).toBe("Caja")
    expect(roleLabel("solo_turnos")).toBe("Solo turnos")
    expect(roleLabel("recepcion")).toBe("Recepcion")
  })
})
