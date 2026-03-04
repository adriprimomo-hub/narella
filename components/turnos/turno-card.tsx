"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import {
  BanIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MessageCircleIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react"
import { formatDate } from "@/lib/date-format"

interface TurnoCardProps {
  turno: Turno
  turnosGrupo?: Turno[]
  onDelete: (id: string) => void
  onDeleteGroup?: (ids: string[]) => void | Promise<void>
  onRefresh: () => void
  onCreateFromCancel?: (turno: Turno) => void
  clientes: Cliente[]
  servicios: Servicio[]
  empleadas: Empleada[]
  canDelete?: boolean
}

type DeclaracionInicioPayload = {
  loading?: boolean
  error?: string | null
  id?: string
  link?: string
  whatsapp_url?: string | null
  mensaje?: string | null
  plantilla_nombre?: string | null
  cliente_telefono?: string | null
}

const formatForInput = (dateString: string) => {
  const date = new Date(dateString)
  if (!Number.isFinite(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function TurnoCard({
  turno,
  turnosGrupo,
  onDelete,
  onDeleteGroup,
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
  const [declaracionInicio, setDeclaracionInicio] = useState<DeclaracionInicioPayload | null>(null)
  const [moveGroupOpen, setMoveGroupOpen] = useState(false)
  const [movingGroup, setMovingGroup] = useState(false)
  const [moveGroupFecha, setMoveGroupFecha] = useState(formatForInput(turno.fecha_inicio))

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
    const requiresDeclaracion = newStatus === "en_curso" && Boolean(turno.declaracion_jurada_plantilla_id)
    if (requiresDeclaracion) {
      setDeclaracionInicio({
        loading: true,
        error: null,
        plantilla_nombre: turno.declaracion_jurada_plantilla?.nombre || null,
      })
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/turnos/${turno.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: newStatus }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        if (requiresDeclaracion) setDeclaracionInicio(null)
        alert(payload?.error || "No se pudo actualizar el turno")
        return
      }
      onRefresh()
      if (requiresDeclaracion) {
        if (payload?.declaracion_jurada?.link) {
          setDeclaracionInicio({
            ...(payload.declaracion_jurada as DeclaracionInicioPayload),
            loading: false,
            error: null,
          })
        } else {
          setDeclaracionInicio({
            loading: false,
            error: "No se pudo generar el link de la declaración jurada.",
            plantilla_nombre: turno.declaracion_jurada_plantilla?.nombre || null,
          })
        }
      }
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
  const inicioReal = turno.iniciado_en ? new Date(turno.iniciado_en) : null
  const inicioRealValido = Boolean(inicioReal && Number.isFinite(inicioReal.getTime()))
  const horaInicioReal = inicioRealValido
    ? inicioReal!.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null
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

  const handleMoveGroup = async () => {
    if (!esGrupo) return
    const baseStart = new Date(turno.fecha_inicio)
    const nextStart = new Date(moveGroupFecha)
    if (!Number.isFinite(baseStart.getTime()) || !Number.isFinite(nextStart.getTime())) {
      alert("Seleccioná una fecha y hora válidas para mover el grupo.")
      return
    }
    const deltaMs = nextStart.getTime() - baseStart.getTime()
    const turnosMovibles = grupoTurnos.filter(
      (item) => item.estado !== "completado" && item.estado !== "cancelado" && item.confirmacion_estado !== "cancelado",
    )
    if (turnosMovibles.length === 0) {
      alert("No hay turnos del grupo disponibles para mover.")
      return
    }

    setMovingGroup(true)
    try {
      for (const item of turnosMovibles) {
        const itemStart = new Date(item.fecha_inicio)
        if (!Number.isFinite(itemStart.getTime())) continue
        const fecha_inicio = new Date(itemStart.getTime() + deltaMs).toISOString()
        const res = await fetch(`/api/turnos/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha_inicio }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => null)
          alert(payload?.error || "No se pudo mover uno de los turnos del grupo.")
          return
        }
      }
      setMoveGroupOpen(false)
      onRefresh()
    } finally {
      setMovingGroup(false)
    }
  }

  const handleDeleteAction = async () => {
    if (esGrupo && onDeleteGroup) {
      const ids = grupoTurnos
        .filter((item) => item.estado !== "completado" && item.estado !== "cancelado")
        .map((item) => item.id)
      if (ids.length > 0) {
        await onDeleteGroup(ids)
      }
      return
    }
    onDelete(turno.id)
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
            {esGrupo && <Badge variant="info">Simultáneo x{grupoOrdenado.length}</Badge>}
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
          {turno.estado === "en_curso" && horaInicioReal && (
            <p className="text-[color:var(--status-info-fg)] text-xs sm:text-sm">Hora inicio: {horaInicioReal}</p>
          )}
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
          {esGrupo && canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMoveGroupFecha(formatForInput(turno.fecha_inicio))
                setMoveGroupOpen(true)
              }}
              disabled={loading || movingGroup}
              className="text-xs gap-1.5"
            >
              Mover grupo
            </Button>
          )}
          {canDelete && turno.estado !== "completado" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteAction}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <BanIcon className="h-3.5 w-3.5" />
              {esGrupo ? "Cancelar grupo" : "Cancelar"}
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

      <Dialog open={moveGroupOpen} onOpenChange={setMoveGroupOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mover turnos simultáneos</DialogTitle>
            <DialogDescription>
              Se moverán en bloque todos los turnos activos del grupo, manteniendo la misma diferencia horaria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor={`mover-grupo-${turno.id}`}>
              Nueva fecha y hora base
            </label>
            <Input
              id={`mover-grupo-${turno.id}`}
              type="datetime-local"
              value={moveGroupFecha}
              onChange={(event) => setMoveGroupFecha(event.target.value)}
              disabled={movingGroup}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMoveGroupOpen(false)} disabled={movingGroup}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleMoveGroup} disabled={movingGroup}>
                {movingGroup ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-1.5 animate-spin" />
                    Moviendo...
                  </>
                ) : (
                  "Mover grupo"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(declaracionInicio)} onOpenChange={(open) => !open && setDeclaracionInicio(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Este servicio requiere declaración jurada</DialogTitle>
            <DialogDescription>
              {declaracionInicio?.plantilla_nombre
                ? `Plantilla: "${declaracionInicio.plantilla_nombre}".`
                : "Se requiere declaración jurada para este turno."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {declaracionInicio?.loading ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Generando link...
                </span>
              </div>
            ) : declaracionInicio?.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {declaracionInicio.error}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm break-all">{declaracionInicio?.link || "-"}</div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!declaracionInicio?.link) return
                  try {
                    await navigator.clipboard.writeText(declaracionInicio.link)
                    alert("Link copiado.")
                  } catch {
                    alert("No se pudo copiar el link.")
                  }
                }}
                disabled={Boolean(declaracionInicio?.loading) || !declaracionInicio?.link}
              >
                <CopyIcon className="h-4 w-4 mr-1.5" />
                Copiar link
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => declaracionInicio?.link && window.open(declaracionInicio.link, "_blank", "noopener,noreferrer")}
                disabled={Boolean(declaracionInicio?.loading) || !declaracionInicio?.link}
              >
                <ExternalLinkIcon className="h-4 w-4 mr-1.5" />
                Abrir
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!declaracionInicio?.whatsapp_url) {
                    alert("La clienta no tiene teléfono válido para WhatsApp.")
                    return
                  }
                  window.open(declaracionInicio.whatsapp_url, "_blank", "noopener,noreferrer")
                }}
                disabled={Boolean(declaracionInicio?.loading) || !declaracionInicio?.whatsapp_url}
              >
                <MessageCircleIcon className="h-4 w-4 mr-1.5" />
                Enviar por WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
