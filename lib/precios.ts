const DESCUENTO_DIVISOR = 0.85
const REDONDEO_CENTENAR = 100

export const calcularPrecioListaDesdeDescuento = (precioDescuento: number | null | undefined) => {
  if (precioDescuento === null || precioDescuento === undefined) return null

  const descuento = Number(precioDescuento)
  if (!Number.isFinite(descuento) || descuento < 0) return null

  const precioLista = descuento / DESCUENTO_DIVISOR
  return Math.round(precioLista / REDONDEO_CENTENAR) * REDONDEO_CENTENAR
}
