import { describe, expect, it } from "vitest"
import { calcularPrecioListaDesdeDescuento } from "@/lib/precios"

describe("calculateListPrice", () => {
  it("calcula el precio de lista desde el descuento y redondea al centenar mas cercano", () => {
    expect(calcularPrecioListaDesdeDescuento(39000)).toBe(45900)
  })

  it("mantiene el redondeo a centenas y no deja terminaciones en 50", () => {
    expect(calcularPrecioListaDesdeDescuento(1000)).toBe(1200)
    expect(calcularPrecioListaDesdeDescuento(12500)).toBe(14700)
  })

  it("maneja decimales sin perder el redondeo esperado", () => {
    expect(calcularPrecioListaDesdeDescuento(45882.35)).toBe(54000)
    expect(calcularPrecioListaDesdeDescuento(1234.56)).toBe(1500)
  })

  it("devuelve null para valores ausentes o invalidos y conserva el cero", () => {
    expect(calcularPrecioListaDesdeDescuento(null)).toBeNull()
    expect(calcularPrecioListaDesdeDescuento(undefined)).toBeNull()
    expect(calcularPrecioListaDesdeDescuento(0)).toBe(0)
    expect(calcularPrecioListaDesdeDescuento(-10)).toBeNull()
    expect(calcularPrecioListaDesdeDescuento(Number.NaN)).toBeNull()
  })
})
