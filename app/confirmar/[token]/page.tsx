"use client"

import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CalendarDaysIcon, Clock3Icon, SparklesIcon, UserIcon } from "lucide-react"
import { formatDate } from "@/lib/date-format"

interface TurnoInfo {
  id: string
  cliente: string
  servicio: string
  empleada: string
  fecha: string
  duracion: number
  token: string
  estado: string
}

type ConfirmacionResponse = {
  turno?: TurnoInfo | null
  estado?: string
  error?: string
}

const fetchConfirmacion = async (url: string): Promise<ConfirmacionResponse> => {
  try {
    const res = await fetch(url)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        turno: null,
        estado: data?.estado,
        error: data?.error || "No se pudo cargar la confirmación",
      }
    }
    return (data as ConfirmacionResponse) || { turno: null }
  } catch (error) {
    console.error("[confirmacion] Error fetching turno:", error)
    return { turno: null, error: "No se pudo cargar la confirmación" }
  }
}

export default function ConfirmacionPage() {
  const params = useParams()
  const tokenParam = params.token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam
  const [enviando, setEnviando] = useState(false)
  const [confirmadoOverride, setConfirmadoOverride] = useState<boolean | null | undefined>(undefined)
  const { data, isLoading, mutate } = useSWR<ConfirmacionResponse>(
    token ? `/api/confirmacion/${token}` : null,
    fetchConfirmacion,
  )

  const turno = data?.turno ?? null
  const confirmadoInicial = useMemo(() => {
    const estado = turno?.estado || "pendiente"
    if (estado === "confirmado") return true
    if (estado === "cancelado") return false
    return null
  }, [turno?.estado])
  const confirmado = confirmadoOverride ?? confirmadoInicial

  const handleConfirmar = async (confirm: boolean) => {
    if (!token) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/confirmacion/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmado: confirm }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.estado) {
          setConfirmadoOverride(data.estado === "confirmado")
        }
        alert(data?.error || "No se pudo confirmar el turno")
        return
      }
      if (data.success) {
        setConfirmadoOverride(confirm)
        mutate(
          (current) => {
            if (!current?.turno) return current
            return {
              ...current,
              turno: {
                ...current.turno,
                estado: confirm ? "confirmado" : "cancelado",
              },
            }
          },
          false,
        )
      }
    } catch (error) {
      console.error("[v0] Error handleConfirmar:", error)
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-[var(--page-padding)] py-[var(--page-padding-lg)]">
        <Card className="w-full max-w-xl">
          <CardContent className="py-[var(--card-padding)] text-center">
            <p className="text-sm font-medium text-primary">Cargando tu turno...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!turno) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-[var(--page-padding)] py-[var(--page-padding-lg)]">
        <Card className="w-full max-w-xl">
          <CardContent className="py-[var(--card-padding)] text-center">
            <p className="text-base font-medium text-foreground">Turno no encontrado</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const fecha = new Date(turno.fecha)
  const fechaStr = formatDate(fecha)
  const horaStr = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })

  const estadoBadge: Record<string, "warning" | "success" | "danger"> = {
    pendiente: "warning",
    confirmado: "success",
    cancelado: "danger",
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-[var(--page-padding)] py-[var(--page-padding-lg)]">
      <Card className="w-full max-w-2xl overflow-hidden">
        <CardHeader className="border-b bg-muted/40">
          <div className="flex items-center justify-center gap-2 px-2 text-primary">
            <SparklesIcon className="h-5 w-5" />
            <CardTitle className="text-center">Confirmación de turno</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 sm:space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servicio</p>
              <p className="text-base font-semibold text-foreground">{turno.servicio}</p>
            </div>
            {turno.empleada && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Te atiende</p>
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-primary" />
                  <p className="text-base font-semibold text-foreground">{turno.empleada}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha y hora</p>
              <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
                  <CalendarDaysIcon className="h-4 w-4 text-primary" />
                  <span className="capitalize">{fechaStr}</span>
                </div>
                <div className="flex items-center gap-2 text-base font-semibold text-primary sm:text-lg">
                  <Clock3Icon className="h-4 w-4 text-primary" />
                  <span>{horaStr}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Duración</p>
              <p className="text-base font-semibold text-foreground">{turno.duracion} minutos</p>
            </div>
            {confirmado !== null && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</p>
                <Badge variant={estadoBadge[confirmado ? "confirmado" : "cancelado"]} className="px-3 py-1 rounded-full">
                  {confirmado ? "Confirmado" : "Cancelado"}
                </Badge>
              </div>
            )}
          </div>

          {confirmado === null && (
            <div className="flex gap-3 pt-2 sm:pt-4 flex-col sm:flex-row">
              <Button
                className="flex-1"
                onClick={() => handleConfirmar(true)}
                disabled={enviando}
              >
                {enviando ? "Confirmando..." : "Confirmar asistencia"}
              </Button>
              <Button
                className="flex-1"
                variant="destructive"
                onClick={() => handleConfirmar(false)}
                disabled={enviando}
              >
                {enviando ? "Cancelando..." : "No puedo asistir"}
              </Button>
            </div>
          )}

          {confirmado !== null && (
            <div className="text-center text-sm sm:text-base text-primary pt-1 sm:pt-2 font-medium">
              {confirmado ? "¡Gracias por confirmar tu turno!" : "Tu turno ha sido cancelado."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
