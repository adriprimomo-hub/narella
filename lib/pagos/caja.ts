type ProductoCajaItem<T = string> = {
  item: T
  monto_bruto: number
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const splitCobroServicioProductos = (args: { montoCobrado: number; totalProductos: number }) => {
  const montoCobrado = roundMoney(Math.max(0, Number(args.montoCobrado) || 0))
  const totalProductos = roundMoney(Math.max(0, Number(args.totalProductos) || 0))

  const montoProductosCobrado = roundMoney(Math.min(totalProductos, montoCobrado))
  const montoServiciosCobrado = roundMoney(Math.max(0, montoCobrado - montoProductosCobrado))

  return {
    montoServiciosCobrado,
    montoProductosCobrado,
  }
}

export const distribuirCobroProductos = <T>(args: { montoProductosCobrado: number; items: Array<ProductoCajaItem<T>> }) => {
  const montoProductosCobrado = roundMoney(Math.max(0, Number(args.montoProductosCobrado) || 0))
  const normalizedItems = (args.items || [])
    .map((entry) => ({
      item: entry.item,
      monto_bruto: roundMoney(Math.max(0, Number(entry.monto_bruto) || 0)),
    }))
    .filter((entry) => entry.monto_bruto > 0)

  if (normalizedItems.length === 0 || montoProductosCobrado <= 0) return [] as Array<{ item: T; monto_cobrado: number }>

  const totalBruto = roundMoney(normalizedItems.reduce((acc, entry) => acc + entry.monto_bruto, 0))
  if (totalBruto <= 0) return [] as Array<{ item: T; monto_cobrado: number }>

  let acumulado = 0
  return normalizedItems.map((entry, index) => {
    const isLast = index === normalizedItems.length - 1
    const monto = isLast
      ? roundMoney(Math.max(0, montoProductosCobrado - acumulado))
      : roundMoney((entry.monto_bruto / totalBruto) * montoProductosCobrado)
    acumulado = roundMoney(acumulado + monto)
    return {
      item: entry.item,
      monto_cobrado: monto,
    }
  })
}
