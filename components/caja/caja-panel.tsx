"use client"

import useSWR from "swr"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusIcon } from "lucide-react"
import { UserBadge } from "../ui/user-badge"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/date-format"

type Movimiento = {
  id: string
  medio_pago?: string | null
  tipo: string
  monto: number
  motivo?: string | null
  created_at: string
  creado_por?: string | null
  creado_por_username?: string | null
  source_tipo?: string | null
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const CASH_MEDIO = "efectivo"
const CAJA_PAGE_SIZE = 80

const toLocalDateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const normalizeTipo = (value?: string | null) => (value === "retiro" ? "egreso" : value || "")
const isEgreso = (value?: string | null) => normalizeTipo(value) === "egreso"
const formatTipo = (value?: string | null, sourceTipo?: string | null, monto?: number) => {
  if ((sourceTipo || "") === "arqueo" && Number(monto || 0) === 0) return "Arqueo"
  return isEgreso(value) ? "Retiro" : "Ingreso"
}
const isArqueoSinDiferencia = (sourceTipo?: string | null, monto?: number) =>
  (sourceTipo || "") === "arqueo" && Number(monto || 0) === 0
const formatOrigen = (value?: string | null) => {
  if (!value) return "manual"
  return value.replace(/_/g, " ")
}
const formatMoney = (value: number) => Number(value || 0).toFixed(2)

type ManualForm = {
  tipo: "ingreso" | "egreso"
  monto: number | ""
  motivo: string
}

type ArqueoForm = {
  contado: number | ""
  observaciones: string
}

export function CajaPanel() {
  const { data: movimientos, mutate } = useSWR<Movimiento[]>("/api/caja/movimientos", fetcher)
  const [mov, setMov] = useState<ManualForm>({ tipo: "ingreso", monto: "", motivo: "" })
  const [arqueo, setArqueo] = useState<ArqueoForm>({ contado: "", observaciones: "" })
  const [fecha, setFecha] = useState(() => toLocalDateKey(new Date()))
  const [movimientosPage, setMovimientosPage] = useState(1)
  const [showMovForm, setShowMovForm] = useState(false)
  const [showArqueoForm, setShowArqueoForm] = useState(false)

  const safeMovs = Array.isArray(movimientos) ? movimientos : []
  const movsEfectivo = useMemo(() => {
    return safeMovs.filter((m) => {
      const medio = typeof m.medio_pago === "string" ? m.medio_pago.toLowerCase() : CASH_MEDIO
      return medio === CASH_MEDIO
    })
  }, [safeMovs])
  const movsDelDia = useMemo(() => {
    return movsEfectivo.filter((m) => toLocalDateKey(m.created_at) === fecha)
  }, [movsEfectivo, fecha])

  const totalesHistoricos = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    movsEfectivo.forEach((m) => {
      const tipo = normalizeTipo(m.tipo)
      const monto = Number(m.monto || 0)
      if (tipo === "egreso") {
        egresos += monto
      } else {
        ingresos += monto
      }
    })

    return {
      ingresos,
      egresos,
      saldo: ingresos - egresos,
      movimientos: movsEfectivo.length,
    }
  }, [movsEfectivo])

  const totalesDelDia = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    movsDelDia.forEach((m) => {
      const tipo = normalizeTipo(m.tipo)
      const monto = Number(m.monto || 0)
      if (tipo === "egreso") {
        egresos += monto
      } else {
        ingresos += monto
      }
    })

    return {
      ingresos,
      egresos,
      saldo: ingresos - egresos,
      movimientos: movsDelDia.length,
    }
  }, [movsDelDia])

  const saldoActual = totalesHistoricos.saldo
  const contadoValue = arqueo.contado === "" ? null : Number(arqueo.contado || 0)
  const diferencia = (contadoValue ?? 0) - saldoActual
  const diferenciaAbs = Math.abs(diferencia)
  const hayDiferencia = contadoValue !== null && diferenciaAbs >= 0.01
  const diferenciaLabel =
    contadoValue === null ? "Completa el contado" : !hayDiferencia ? "Sin diferencias" : diferencia > 0 ? "Sobrante" : "Faltante"
  const diferenciaTexto =
    contadoValue === null
      ? "-"
      : !hayDiferencia
        ? `$${formatMoney(0)}`
        : `${diferencia > 0 ? "+" : "-"}$${formatMoney(diferenciaAbs)}`
  const diferenciaClase = cn(
    "text-lg font-semibold",
    contadoValue === null
      ? "text-muted-foreground"
      : !hayDiferencia
        ? "text-muted-foreground"
        : diferencia > 0
          ? "text-primary"
          : "text-destructive",
  )
  const movError =
    mov.monto === "" ? "Ingresa el monto." : Number(mov.monto || 0) <= 0 ? "El monto debe ser mayor a 0." : ""
  const arqueoError = contadoValue === null ? "Ingresa el efectivo contado." : ""
  const puedeRegistrarManual = !movError
  const puedeRegistrarArqueo = contadoValue !== null

  const registrarMovimiento = async (payload: {
    tipo: "ingreso" | "egreso"
    monto: number
    motivo: string
    source_tipo?: string
  }) => {
    const permiteMontoCeroArqueo = payload.source_tipo === "arqueo" && payload.monto === 0
    if (payload.monto < 0 || (payload.monto === 0 && !permiteMontoCeroArqueo)) return false
    const res = await fetch("/api/caja/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        medio_pago: CASH_MEDIO,
        ...payload,
      }),
    })
    if (!res.ok) return false
    mutate()
    return true
  }

  const registrarManual = async () => {
    const monto = Number(mov.monto || 0)
    if (!monto) return
    const motivoBase = mov.tipo === "egreso" ? "Retiro manual" : "Ingreso manual"
    const motivo = mov.motivo.trim() || motivoBase
    const ok = await registrarMovimiento({ tipo: mov.tipo, monto, motivo, source_tipo: "manual" })
    if (!ok) return
    setMov({ tipo: "ingreso", monto: "", motivo: "" })
    setMovimientosPage(1)
    setShowMovForm(false)
  }

  const registrarArqueo = async () => {
    if (contadoValue === null) return
    const tipo = diferencia < 0 ? "egreso" : "ingreso"
    const motivoBase = !hayDiferencia ? "Sin diferencias" : diferencia > 0 ? "Sobrante" : "Faltante"
    const observaciones = arqueo.observaciones.trim()
    const motivo = observaciones
      ? `Ajuste por arqueo (${motivoBase}): ${observaciones}`
      : `Ajuste por arqueo (${motivoBase})`
    const montoArqueo = hayDiferencia ? diferenciaAbs : 0
    const ok = await registrarMovimiento({ tipo, monto: montoArqueo, motivo, source_tipo: "arqueo" })
    if (!ok) return
    setArqueo({ contado: "", observaciones: "" })
    setMovimientosPage(1)
    setShowArqueoForm(false)
  }

  const movsTabla = useMemo(() => {
    const start = (movimientosPage - 1) * CAJA_PAGE_SIZE
    return movsDelDia.slice(start, start + CAJA_PAGE_SIZE)
  }, [movimientosPage, movsDelDia])
  const movimientosPagination = {
    page: movimientosPage,
    has_prev: movimientosPage > 1,
    has_next: movimientosPage * CAJA_PAGE_SIZE < movsDelDia.length,
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Operaciones de caja</p>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" variant="primary" onClick={() => setShowMovForm(true)}>
            <PlusIcon className="h-4 w-4" />
            Registrar movimiento
          </Button>
          <Button className="gap-2" variant="secondary" onClick={() => setShowArqueoForm(true)}>
            <PlusIcon className="h-4 w-4" />
            Arqueo de caja
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">Resumen diario</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Fecha</span>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value)
                setMovimientosPage(1)
              }}
              className="w-40"
            />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Saldo actual</p>
                <p className="text-lg font-semibold">${formatMoney(saldoActual)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Ingresos</p>
                <p className="text-lg font-semibold text-primary">${formatMoney(totalesDelDia.ingresos)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Retiros</p>
                <p className="text-lg font-semibold text-destructive">-${formatMoney(totalesDelDia.egresos)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Movimientos</p>
                <p className="text-lg font-semibold">{totalesDelDia.movimientos}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Saldo del dia: ${formatMoney(totalesDelDia.saldo)}</p>
            {movsDelDia.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin movimientos en efectivo para la fecha seleccionada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">Movimientos en efectivo</p>
        </div>
        <Card>
          <CardContent className="p-0 pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movsTabla.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        Sin movimientos en efectivo para la fecha seleccionada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movsTabla.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">{formatDateTime(m.created_at)}</TableCell>
                        <TableCell className="capitalize">{formatTipo(m.tipo, m.source_tipo, Number(m.monto || 0))}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            isArqueoSinDiferencia(m.source_tipo, Number(m.monto || 0))
                              ? "text-muted-foreground"
                              : isEgreso(m.tipo)
                                ? "text-destructive"
                                : "text-primary",
                          )}
                        >
                          {isArqueoSinDiferencia(m.source_tipo, Number(m.monto || 0))
                            ? `$${formatMoney(Number(m.monto))}`
                            : `${isEgreso(m.tipo) ? "-" : "+"}$${formatMoney(Number(m.monto))}`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.motivo || "-"}</TableCell>
                        <TableCell className="text-xs capitalize">{formatOrigen(m.source_tipo)}</TableCell>
                        <TableCell>
                          {m.creado_por || m.creado_por_username ? (
                            <UserBadge username={m.creado_por_username} userId={m.creado_por} />
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Sin autor</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Página {movimientosPagination.page}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!movimientosPagination.has_prev}
                  onClick={() => setMovimientosPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!movimientosPagination.has_next}
                  onClick={() => setMovimientosPage((prev) => prev + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showMovForm} onOpenChange={setShowMovForm}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription className="sr-only">Registrar un movimiento manual de caja en efectivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={mov.tipo} onValueChange={(value) => setMov({ ...mov, tipo: value as ManualForm["tipo"] })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo de movimiento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="egreso">Retiro</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Monto"
              value={mov.monto}
              onChange={(e) => setMov({ ...mov, monto: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })}
            />
            {movError && <p className="text-xs text-destructive">{movError}</p>}
            <Input placeholder="Motivo" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
            <Button className="w-full gap-2" variant="primary" onClick={registrarManual} disabled={!puedeRegistrarManual}>
              <PlusIcon className="h-4 w-4" />
              Registrar movimiento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showArqueoForm} onOpenChange={setShowArqueoForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Arqueo de caja</DialogTitle>
            <DialogDescription className="sr-only">Registrar ajuste por diferencia en arqueo de caja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Saldo teorico</p>
                <p className="text-lg font-semibold">${formatMoney(saldoActual)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Efectivo contado</p>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Monto contado"
                  value={arqueo.contado}
                  onChange={(e) =>
                    setArqueo({ ...arqueo, contado: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })
                  }
                />
                {arqueoError && <p className="text-xs text-destructive">{arqueoError}</p>}
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={diferenciaClase}>{diferenciaTexto}</p>
                <p className="text-[11px] text-muted-foreground">{diferenciaLabel}</p>
              </div>
            </div>
            <Input
              placeholder="Observaciones (opcional)"
              value={arqueo.observaciones}
              onChange={(e) => setArqueo({ ...arqueo, observaciones: e.target.value })}
            />
            <Button className="w-full gap-2" variant="primary" onClick={registrarArqueo} disabled={!puedeRegistrarArqueo}>
              <PlusIcon className="h-4 w-4" />
              Registrar ajuste por arqueo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
