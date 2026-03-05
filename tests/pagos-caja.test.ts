import { describe, expect, it } from "vitest"
import { distribuirCobroProductos, splitCobroServicioProductos } from "@/lib/pagos/caja"

describe("pagos caja breakdown", () => {
  it("separa cobro sin productos", () => {
    const result = splitCobroServicioProductos({ montoCobrado: 3200, totalProductos: 0 })
    expect(result).toEqual({
      montoServiciosCobrado: 3200,
      montoProductosCobrado: 0,
    })
  })

  it("separa cobro con productos sin duplicar", () => {
    const result = splitCobroServicioProductos({ montoCobrado: 4600, totalProductos: 1400 })
    expect(result).toEqual({
      montoServiciosCobrado: 3200,
      montoProductosCobrado: 1400,
    })
  })

  it("limita productos cuando descuentos cubren parte del total", () => {
    const result = splitCobroServicioProductos({ montoCobrado: 300, totalProductos: 500 })
    expect(result).toEqual({
      montoServiciosCobrado: 0,
      montoProductosCobrado: 300,
    })
  })

  it("distribuye proporcionalmente y conserva el total cobrado", () => {
    const distribuidos = distribuirCobroProductos({
      montoProductosCobrado: 300,
      items: [
        { item: "a", monto_bruto: 200 },
        { item: "b", monto_bruto: 300 },
      ],
    })

    expect(distribuidos).toEqual([
      { item: "a", monto_cobrado: 120 },
      { item: "b", monto_cobrado: 180 },
    ])
    const total = distribuidos.reduce((acc, item) => acc + item.monto_cobrado, 0)
    expect(total).toBe(300)
  })
})
