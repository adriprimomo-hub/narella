import { describe, expect, it } from "vitest"
import { relabelServiceSnapshotItems } from "@/lib/turnos/retroactive-financials-shared"

describe("relabelServiceSnapshotItems", () => {
  it("solo relabela items de servicio y preserva los importes", () => {
    const items = [
      {
        tipo: "servicio",
        descripcion: "Servicio: Corte",
        cantidad: 1,
        precio_unitario: 100,
        subtotal: 100,
      },
      {
        tipo: "penalidad",
        descripcion: "Penalidad por retraso",
        cantidad: 1,
        precio_unitario: 20,
        subtotal: 20,
      },
      {
        tipo: "servicio",
        descripcion: "Servicio extra: Lavado",
        cantidad: 1,
        precio_unitario: 30,
        subtotal: 30,
      },
    ]

    const actualizados = relabelServiceSnapshotItems(items, [
      "Servicio: Color",
      "Servicio extra: Nutricion",
    ])

    expect(actualizados).toEqual([
      {
        tipo: "servicio",
        descripcion: "Servicio: Color",
        cantidad: 1,
        precio_unitario: 100,
        subtotal: 100,
      },
      {
        tipo: "penalidad",
        descripcion: "Penalidad por retraso",
        cantidad: 1,
        precio_unitario: 20,
        subtotal: 20,
      },
      {
        tipo: "servicio",
        descripcion: "Servicio extra: Nutricion",
        cantidad: 1,
        precio_unitario: 30,
        subtotal: 30,
      },
    ])
  })
})
