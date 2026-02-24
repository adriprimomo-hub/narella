"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Turno } from "./turnos-grid"
import type { Cliente } from "../clientes/clientes-list"
import type { Servicio } from "../servicios/servicios-list"
import type { Empleada } from "../empleadas/types"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CerrarTurnoModal } from "../pagos/cerrar-turno-modal"
import { CerrarGrupoModal } from "../pagos/cerrar-grupo-modal"
import { TurnoForm } from "./turno-form"
import { UserBadge } from "../ui/user-badge"
import { useState } from "react"
import { BanIcon, Loader2Icon, MessageCircleIcon, PencilIcon, PlayIcon, PlusIcon } from "lucide-react"
import { formatDate } from "@/lib/date-format"

interface TurnoCardProps {
  turno: Turno
  turnosGrupo?: Turno[]
  onDelete: (id: string) => void
  onRefresh: () => void
  onCreateFromCancel?: (turno: Turno) => void
  clientes: Cliente[]
  servicios: Servicio[]
  empleadas: Empleada[]
  canDelete?: boolean
}

export function TurnoCard({
  turno,
  turnosGrupo,
  onDelete,
  onRefresh,
  onCreateFromCancel,
  clientes,
  servicios,
  empleadas,
  canDelete = true,
}: TurnoCardProps) {
  const [loading, setLoading] = useState(false)
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const fecha = new Date(turno.fecha_inicio)
  const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
  const fecha_str = formatDate(fecha)
  const isFutureTurno = fecha.getTime() > Date.now()
  const timeUntilStartMs = fecha.getTime() - Date.now()
  const isCanceledByClient = turno.confirmacion_estado === "cancelado"
  const isCanceled = turno.estado === "cancelado" || isCanceledByClient
  const isClosed = turno.estado === "completado" || Boolean(turno.finalizado_en)
  const confirmState = isCanceled ? "cancelado" : turno.confirmacion_estado || "no_enviada"
  const startTooEarly = turno.estado === "pendiente" && !isCanceled && timeUntilStartMs > 60 * 60 * 1000
  const confirmWasSent =
    confirmState === "enviada" ||
    confirmState === "confirmado" ||
    confirmState === "cancelado" ||
    !!turno.confirmacion_enviada_at
  const canManageConfirmation =
    turno.estado === "pendiente" && isFutureTurno && confirmState !== "confirmado" && !isCanceled
  const editDisabledReason = isClosed ? "Turno cerrado" : isCanceled ? "Turno cancelado" : undefined
  const canEdit = !editDisabledReason

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true)
    try {
      await fetch(`/api/turnos/${turno.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: newStatus }),
      })
      onRefresh()
    } finally {
      setLoading(false)
    }
  }

  const handleEnviarWhatsapp = async () => {
    const pendingWindow = typeof window !== "undefined" ? window.open("", "_blank") : null
    setEnviandoWhatsapp(true)
    try {
      const res = await fetch(`/api/turnos/${turno.id}/send-whatsapp`, {
        method: "POST",
      })
      const data = await res.json()

      if (data?.success && data?.method === "twilio") {
        pendingWindow?.close()
        alert(data.message || "Mensaje enviado por WhatsApp")
        setTimeout(() => {
          onRefresh()
        }, 1000)
        return
      }

      const whatsappLink = data.whatsappUrl || data.whatsappLink
      if (whatsappLink) {
        if (pendingWindow) {
          pendingWindow.location.href = whatsappLink
        } else {
          window.location.href = whatsappLink
        }
        setTimeout(() => {
          onRefresh()
        }, 1000)
      } else {
        pendingWindow?.close()
        alert(`Error: ${data.error || "No se pudo generar el link de WhatsApp"}`)
      }
    } catch (error) {
      pendingWindow?.close()
      console.error("[v0] Error al enviar WhatsApp:", error)
      alert("Error al enviar confirmación")
    } finally {
      setEnviandoWhatsapp(false)
    }
  }

  const confirmacionBadge: Record<string, "neutral" | "info" | "success" | "danger"> = {
    no_enviada: "neutral",
    enviada: "info",
    confirmado: "success",
    cancelado: "danger",
  }

  const grupoTurnos = (turnosGrupo || []).filter((t) => t.grupo_id && t.grupo_id === turno.grupo_id)
  const esGrupo = Boolean(turno.grupo_id) && grupoTurnos.length > 1
  const grupoOrdenado = esGrupo
    ? [...grupoTurnos].sort((a, b) => {
        const nombreA = (a.servicio_final || a.servicios)?.nombre || ""
        const nombreB = (b.servicio_final || b.servicios)?.nombre || ""
        return nombreA.localeCompare(nombreB)
      })
    : []
  const getStaffLabel = (staff?: { nombre?: string | null; apellido?: string | null } | null) =>
    staff ? [staff.nombre, staff.apellido].filter(Boolean).join(" ") : ""
  const formatCurrency = (value?: number | null) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return "N/D"
    return `$${numeric.toFixed(2)}`
  }
  const getTurnoPrecio = (current: Turno) => {
    const servicioFinal = current.servicio_final as any
    const servicio = current.servicios as any
    return (
      servicioFinal?.precio ??
      servicioFinal?.precio_lista ??
      servicio?.precio ??
      servicio?.precio_lista ??
      null
    )
  }

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:items-center">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg truncate">
              {`${turno.clientes?.nombre || ""} ${turno.clientes?.apellido || ""}`.trim() || "Cliente"}
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {(turno.servicio_final || turno.servicios)?.nombre || "Servicio"}
            </p>
          </div>
        <div className="flex gap-1 flex-wrap">
            <Badge variant={confirmacionBadge[confirmState]}>
              {confirmState === "no_enviada" && "Sin enviar"}
              {confirmState === "enviada" && "Enviada"}
              {confirmState === "confirmado" && "Confirmado"}
              {confirmState === "cancelado" && "Cancelado"}
            </Badge>
            <UserBadge username={turno.creado_por_username} userId={turno.creado_por} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <p className="font-medium">{hora}</p>
          <p className="text-muted-foreground text-xs sm:text-sm">{fecha_str}</p>
        </div>
        {(turno.empleadas || turno.empleada_final) && (
          <div className="text-xs sm:text-sm text-muted-foreground">
            Staff: {getStaffLabel(turno.empleada_final || turno.empleadas)}
          </div>
        )}
        {esGrupo && (
          <div className="rounded-[var(--radius-md)] border bg-muted/40 p-2 text-xs">
            <p className="font-medium text-muted-foreground">Servicios simultáneos</p>
            <div className="mt-1 space-y-1">
              {grupoOrdenado.map((g) => {
                const servicio = g.servicio_final || g.servicios
                const staff = g.empleada_final || g.empleadas
                return (
                  <div key={`grupo-${g.id}`} className="flex items-center justify-between gap-2">
                    <span className={g.id === turno.id ? "font-semibold text-foreground" : "text-muted-foreground"}>
                      {servicio?.nombre || "Servicio"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {getStaffLabel(staff) || "Sin asignar"} · {g.estado}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div className="text-sm">
          <p className="text-muted-foreground text-xs sm:text-sm">Duración: {turno.duracion_minutos} min</p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Precio: {formatCurrency(getTurnoPrecio(turno))}
          </p>
        </div>
        {turno.penalidad_monto ? (
          <div className="text-xs text-[color:var(--status-warning-fg)]">
            Penalidad: ${turno.penalidad_monto?.toFixed(2)} {turno.penalidad_motivo ? `(${turno.penalidad_motivo})` : ""}
            {turno.minutos_tarde ? ` · ${turno.minutos_tarde} min tarde` : ""}
          </div>
        ) : null}
        {turno.observaciones && (
          <div className="text-sm bg-muted p-2 rounded-[var(--radius-md)]">
            <p className="text-muted-foreground text-xs sm:text-sm">{turno.observaciones}</p>
          </div>
        )}
        {isCanceled && (
          <div className="rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
            {isCanceledByClient
              ? "Turno cancelado por la clienta desde el link de confirmación. Podés crear uno nuevo."
              : "Turno cancelado. Podés crear uno nuevo."}
          </div>
        )}
        <div className="flex gap-2 flex-wrap text-xs sm:text-sm">
          {isCanceled && onCreateFromCancel && (
            <Button
              size="sm"
              onClick={() => onCreateFromCancel(turno)}
              className="text-xs gap-1.5"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Nuevo turno
            </Button>
          )}
          {canManageConfirmation && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnviarWhatsapp}
              disabled={enviandoWhatsapp}
              className="text-xs bg-transparent gap-2"
            >
              {enviandoWhatsapp ? (
                <>
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  {confirmWasSent ? "Reenviando..." : "Enviando..."}
                </>
              ) : (
                <>
                  <MessageCircleIcon className="h-3.5 w-3.5" />
                  {confirmWasSent ? "Reenviar confirmación" : "Enviar confirmación"}
                </>
              )}
            </Button>
          )}
          {turno.estado === "pendiente" && !isCanceled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange("en_curso")}
              disabled={loading || startTooEarly}
              title={startTooEarly ? "Disponible 1 hora antes del horario pactado" : undefined}
              className="text-xs gap-1.5"
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Iniciar
            </Button>
          )}
          {turno.estado === "en_curso" && (
            esGrupo ? (
              <CerrarGrupoModal turnos={grupoTurnos} onSuccess={onRefresh} servicios={servicios} empleadas={empleadas} />
            ) : (
              <CerrarTurnoModal turno={turno} onSuccess={onRefresh} servicios={servicios} empleadas={empleadas} />
            )
          )}
          {canDelete && turno.estado !== "completado" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(turno.id)}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <BanIcon className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
            disabled={!canEdit}
            title={editDisabledReason}
            className="text-xs gap-1.5"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      </CardContent>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="max-w-2xl sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Editar turno <span className="text-sm font-normal text-muted-foreground">({hora} - {fecha_str})</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Formulario para modificar el turno seleccionado.</DialogDescription>
          </DialogHeader>
          <TurnoForm
            turno={turno}
            clientes={clientes}
            servicios={servicios}
            empleadas={empleadas}
            onCancel={() => setEditOpen(false)}
            onSuccess={() => {
              setEditOpen(false)
              onRefresh()
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
