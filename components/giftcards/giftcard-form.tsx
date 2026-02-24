"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { SearchIcon, Trash2Icon, Loader2Icon } from "lucide-react"
import type { Cliente } from "@/components/clientes/clientes-list"
import type { Servicio } from "@/components/servicios/servicios-list"
import { generarGiftcardImagen } from "./giftcard-image"

export type GiftcardData = {
  id: string
  numero: string
  cliente_id: string
  servicio_ids: string[]
  valido_por_dias: number
  valido_hasta?: string | null
  de_parte_de?: string | null
  monto_total: number
  metodo_pago: string
  facturado?: boolean | null
  estado?: string | null
  imagen_base64?: string | null
}

type GiftcardFormProps = {
  giftcard?: GiftcardData | null
  clientes: Cliente[]
  servicios: Servicio[]
  metodosPago: string[]
  logoDataUrl?: string | null
  onSuccess: (result: {
    giftcard: GiftcardData
    imagen_base64?: string | null
    factura?: any | null
    factura_id?: string | null
    factura_pendiente?: boolean
    factura_error?: string | null
  }) => void
}

export function GiftcardForm({ giftcard, clientes, servicios, metodosPago, logoDataUrl, onSuccess }: GiftcardFormProps) {
  const [clienteQuery, setClienteQuery] = useState("")
  const [servicioQuery, setServicioQuery] = useState("")
  const [selectedClienteId, setSelectedClienteId] = useState(giftcard?.cliente_id || "")
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>(giftcard?.servicio_ids || [])
  const [validoPorDias, setValidoPorDias] = useState<number | "">(giftcard?.valido_por_dias || 30)
  const [deParteDe, setDeParteDe] = useState(giftcard?.de_parte_de || "")
  const [metodoPago, setMetodoPago] = useState(giftcard?.metodo_pago || (metodosPago[0] || "efectivo"))
  const [facturar, setFacturar] = useState(false)
  const [montoTotal, setMontoTotal] = useState<number | "">(giftcard?.monto_total || "")
  const [montoManual, setMontoManual] = useState(Boolean(giftcard?.monto_total))
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ cliente?: string; servicios?: string; valido?: string; monto?: string }>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const clienteSeleccionado = clientes.find((c) => c.id === selectedClienteId) || null

  useEffect(() => {
    if (clienteSeleccionado) {
      setClienteQuery(`${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido}`.trim())
    }
  }, [clienteSeleccionado])

  useEffect(() => {
    if (!metodosPago.length) return
    if (!metodosPago.includes(metodoPago)) {
      setMetodoPago(metodosPago[0])
    }
  }, [metodosPago, metodoPago])

  const serviciosMap = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios])
  const serviciosSeleccionadosDetalle = serviciosSeleccionados
    .map((id) => serviciosMap.get(id))
    .filter(Boolean) as Servicio[]

  const montoServiciosCalculado = serviciosSeleccionadosDetalle.reduce((acc, srv) => {
    const precio = Number((srv as any).precio_lista ?? (srv as any).precio ?? 0)
    return acc + (Number.isFinite(precio) ? precio : 0)
  }, 0)

  useEffect(() => {
    if (!montoManual) {
      setMontoTotal(montoServiciosCalculado || "")
    }
  }, [montoServiciosCalculado, montoManual])

  const clientesFiltrados = clientes.filter((c) =>
    `${c.nombre} ${c.apellido} ${c.telefono || ""}`.toLowerCase().includes(clienteQuery.toLowerCase()),
  )

  const serviciosFiltrados = servicios.filter((s) => s.nombre.toLowerCase().includes(servicioQuery.toLowerCase()))

  const agregarServicio = (id: string) => {
    if (!id || serviciosSeleccionados.includes(id)) return
    setServiciosSeleccionados((prev) => [...prev, id])
    setServicioQuery("")
    if (errors.servicios) setErrors((prev) => ({ ...prev, servicios: undefined }))
  }

  const removerServicio = (id: string) => {
    setServiciosSeleccionados((prev) => prev.filter((srv) => srv !== id))
  }

  const handleSubmit = async () => {
    const nextErrors: { cliente?: string; servicios?: string; valido?: string; monto?: string } = {}
    if (!selectedClienteId) nextErrors.cliente = "Selecciona una clienta."
    if (!serviciosSeleccionados.length) nextErrors.servicios = "Agrega al menos un servicio."
    if (!validoPorDias || Number(validoPorDias) <= 0) nextErrors.valido = "Ingresa una validez en días."
    if (!montoTotal || Number(montoTotal) <= 0) nextErrors.monto = "Ingresa un total válido."
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setLoading(true)
    setErrorMessage(null)
    setErrors({})

    try {
      const payload = {
        cliente_id: selectedClienteId,
        servicio_ids: serviciosSeleccionados,
        valido_por_dias: Number(validoPorDias),
        de_parte_de: deParteDe.trim() || null,
        monto_total: Number(montoTotal),
        metodo_pago: metodoPago,
        facturar,
      }

      const res = await fetch(giftcard ? `/api/giftcards/${giftcard.id}` : "/api/giftcards", {
        method: giftcard ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMessage(data?.error || "No se pudo guardar la giftcard")
        return
      }

      const giftcardData: GiftcardData = data?.giftcard || data

      let imagenBase64 = giftcardData.imagen_base64 || null
      try {
        imagenBase64 = await generarGiftcardImagen({
          numero: giftcardData.numero,
          cliente: clienteSeleccionado ? `${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido}`.trim() : "",
          servicios: serviciosSeleccionadosDetalle.map((s) => s.nombre),
          validoHasta: giftcardData.valido_hasta || null,
          deParteDe: deParteDe.trim() || null,
          logoDataUrl: logoDataUrl || null,
        })
        if (imagenBase64) {
          await fetch(`/api/giftcards/${giftcardData.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imagen_base64: imagenBase64 }),
          })
          giftcardData.imagen_base64 = imagenBase64
        }
      } catch {
        // ignore image generation errors
      }

      onSuccess({
        giftcard: giftcardData,
        imagen_base64: imagenBase64,
        factura: data?.factura || null,
        factura_id: data?.factura_id || null,
        factura_pendiente: Boolean(data?.factura_pendiente),
        factura_error: data?.factura_error || null,
      })
    } catch (error) {
      setErrorMessage("No se pudo guardar la giftcard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium">Clienta</p>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar clienta..."
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
            />
          </div>
          {errors.cliente && <p className="text-xs text-destructive mt-1">{errors.cliente}</p>}
          {clienteQuery && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-44 overflow-y-auto mt-2">
              {clientesFiltrados.length ? (
                clientesFiltrados.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant={selectedClienteId === c.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setSelectedClienteId(c.id)
                      setClienteQuery(`${c.nombre} ${c.apellido}`.trim())
                      if (errors.cliente) setErrors((prev) => ({ ...prev, cliente: undefined }))
                    }}
                  >
                    {c.nombre} {c.apellido}
                  </Button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
              )}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium">Validez (días)</p>
          <Input
            type="number"
            min={1}
            value={validoPorDias}
            onChange={(e) => setValidoPorDias(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))}
          />
          {errors.valido && <p className="text-xs text-destructive mt-1">{errors.valido}</p>}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Servicios</p>
        <div className="relative mt-2">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Select value="" onValueChange={agregarServicio}>
            <SelectTrigger className="pl-9">
              <SelectValue placeholder={servicioQuery || "Buscar y agregar servicio"} />
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1.5">
                <Input
                  value={servicioQuery}
                  onChange={(e) => setServicioQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="h-8"
                />
              </div>
              {serviciosFiltrados.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre} - ${Number((s as any).precio ?? (s as any).precio_lista ?? 0).toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {errors.servicios && <p className="text-xs text-destructive mt-1">{errors.servicios}</p>}
        {serviciosSeleccionadosDetalle.length > 0 ? (
          <div className="mt-2 space-y-2">
            {serviciosSeleccionadosDetalle.map((srv) => (
              <div key={srv.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{srv.nombre}</Badge>
                <span className="text-xs text-muted-foreground">
                  ${Number((srv as any).precio ?? (srv as any).precio_lista ?? 0).toFixed(2)}
                </span>
                <Button size="icon" variant="ghost" onClick={() => removerServicio(srv.id)}>
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">Sin servicios seleccionados.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium">De parte de</p>
          <Input value={deParteDe} onChange={(e) => setDeParteDe(e.target.value)} placeholder="Nombre de quien regala" />
        </div>
        <div>
          <p className="text-sm font-medium">Total</p>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={montoTotal}
            onChange={(e) => {
              setMontoTotal(e.target.value === "" ? "" : Number.parseFloat(e.target.value))
              setMontoManual(true)
              if (errors.monto) setErrors((prev) => ({ ...prev, monto: undefined }))
            }}
          />
          {errors.monto && <p className="text-xs text-destructive mt-1">{errors.monto}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium">Método de pago</p>
          <Select value={metodoPago} onValueChange={setMetodoPago}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metodosPago.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">¿Facturar giftcard?</p>
          </div>
          <Switch checked={facturar} onCheckedChange={setFacturar} />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <Button type="button" onClick={handleSubmit} disabled={loading} className="w-full gap-2">
        {loading ? (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          "Guardar giftcard"
        )}
      </Button>
    </div>
  )
}
