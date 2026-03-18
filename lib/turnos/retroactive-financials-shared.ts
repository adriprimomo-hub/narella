export type FacturaItemSnapshot = {
  tipo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export const relabelServiceSnapshotItems = (items: FacturaItemSnapshot[], descriptions: string[]) => {
  let descriptionIndex = 0
  return items.map((item) => {
    if (item.tipo !== "servicio") return item
    const nextDescription = descriptions[descriptionIndex]
    descriptionIndex += 1
    if (!nextDescription) return item
    return {
      ...item,
      descripcion: nextDescription,
    }
  })
}
