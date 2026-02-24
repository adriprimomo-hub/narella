export type ShareLinkType = "factura" | "giftcard" | "liquidacion"

export type ShareLinkResponse = {
  url: string
  token: string
  expires_at?: string | null
}

export type LiquidacionSharePayload = {
  desde: string
  hasta: string
  empleada: { nombre: string; apellido?: string | null }
  items: Array<{
    id?: string
    tipo: "servicio" | "producto" | "adelanto"
    fecha?: string | null
    servicio?: string | null
    producto?: string | null
    comision?: number | null
    adelanto?: number | null
  }>
  totales: { comision: number; adelantos: number; neto: number }
}

export async function createShareLink(payload: {
  tipo: ShareLinkType
  id?: string
  liquidacion?: LiquidacionSharePayload
}) {
  const res = await fetch("/api/compartir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || "No se pudo generar el link")
  }
  return data as ShareLinkResponse
}
